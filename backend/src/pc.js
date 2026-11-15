// @ts-check
// backend/src/pc.js — Product Check official lookups (round 17 P4, docs/PRODUCT-CHECK-DESIGN.md §4, §6). NOT deployed by
// default. Text-only proxy: the browser sends a DERIVED fact (a registration number, a GTIN, a product name already found
// in the TMT table, an ingredient name) after the user taps "check official sources"; nothing else, never an image.
//
//   GET /api/pc/status                                  switches + per-source licence / testing-only flags
//   GET /api/pc/thfda?op=<op>&q=<number|name>           Thai FDA WS_LICENSE_SEARCH (21 SOAP operations, OPS below)
//   GET /api/pc/openfda?by=name|gtin&q=                 openFDA drug + food enforcement (recalls)        cache 1 h
//   GET /api/pc/safetygate?q=<name>                     EU Safety Gate public search (TESTING ONLY, L16)  cache 1 h
//   GET /api/pc/rasff?q=<name>                          RASFF Window public search (TESTING ONLY, L16)    cache 1 h
//   GET /api/pc/healthcanada                            always {could_not_check, reason:"on_device"}: Health Canada runs ON THE
//                                                        DEVICE from static shards (tools/pc-hc-build.mjs, owner decision 2026-11-10)
//   GET /api/pc/hsa?q=<SIN no | name>                   Singapore HSA registered therapeutic products     cache 6 h
//   GET /api/pc/label?by=name|ndc&q=                    openFDA drug/label: derived facts + link only     cache 24 h
//   GET /api/pc/ndc?q=<ndc | name>                      openFDA drug/ndc: derived facts                    cache 24 h
//   GET /api/pc/dailymed?q=<name>                       DailyMed SPL list: set id, title, date, link      cache 24 h
//   GET /api/pc/rxnav?q=<name>                          RxNav: name -> RxCUI -> ingredients (IN). Never RxClass   24 h
//   POST /api/pc/batch {lookups:[{source, op?, by?, q}]}  the card's one call per tap (<= 16 lookups, fanned out here,
//                                                        ONE rate-limit count; review S6)
//
// Answers are accepted only in the shape each source documents (SOAP <OpResponse>/<OpResult>, the expected JSON array):
// an HTML / WAF page, a SOAP Fault or an empty 200 is "could not check", never "not found", and is never cached (review B1).
// Health Canada: no Worker parses its 16 MB file. tools/pc-hc-build.mjs shards it offline into vendor/pc-recalls/hc/ and
// the page searches those static files itself (free plan and *.workers.dev work; nothing is sent).
// Customer builds (PC_BUILD=customer): testing-only sources (Thai FDA, Safety Gate, RASFF) are OFF unless the owner switches
// them on in the admin setting; their answers carry the licence label (review N3).
//
// Every answer: {source, ok, found, items[], fetched, credit, licence, testing_only?} or, when a source cannot answer,
// {source, ok:false, could_not_check:true, reason} with HTTP 502 / 503 — the card shows "could not check", never "no
// signal". Errors are never cached. Label TEXT (indications, warnings, dosage) is never returned (L33).
//
// Personal data (L13, design §4): Thai FDA rows carry licensee names and home addresses of natural persons. Only
// whitelisted product fields are returned; a licensee name is kept only when it is clearly a company / juristic person
// (JURISTIC); addresses, foreign-maker names / addresses and owner fields are always dropped.
//
// Switches: PC_ENABLED (default true; false -> 404 on /api/pc/*). Admin setting "pc_lookup" (D1, set through the admin API
// GET|PUT /admin/api/pc/lookup — API only, no admin.html control yet): thfda "live" | "link" (link = no Thai FDA call, the card links to oryor.com) and
// per-source on/off. Default comes from PC_THFDA_MODE (wrangler var, "live" in this demo build). The Thai FDA web service
// has no stated reuse licence: "live" is for testing; written permission is needed before charging (CTO-BRIEF L13).
import { callerHash, getSetting, hit, putSetting } from "./store.js";
import { HttpError, flag, intVar, json, log, originAllowed, publicOrigins } from "./util.js";
import { cleanTerm } from "./med.js";
import { testerGateRequired, testerState } from "./tester.js";

export const THFDA_URL = "https://porta.fda.moph.go.th/FDA_SEARCH_ALL/WS_LICENSE_SEARCH.asmx";
export const UPSTREAM_MS = 10000;
export const RATE_MIN = 30;
const MAX_ROWS = 20;

/** op -> SOAP operation (every WS_LICENSE_SEARCH operation, all take one string DATAS) */
export const OPS = Object.freeze({
  drug: "GET_DATA_DRUG", food: "GET_DATA_FOOD", food_full: "GET_DATA_FOOD_FULL", cosmetic: "GET_DATA_CMT", herbal: "GET_DATA_HERB",
  device: "GET_DATA_MDC", advert: "GET_DATA_ADVERTISE", narcotic: "GET_DATA_NCT", toxic: "GET_DATA_TXC", all: "GET_DATA_ALL",
  drug_info: "GET_DRUG_INFORMATION", drug_lcn_info: "GET_DRUG_LCN_INFORMATION",
  lcn_all: "GET_DATA_ALL_LCN", lcn_drug: "GET_DATA_LCN_DRUG", lcn_herb: "GET_DATA_LCN_HERB", lcn_food: "GET_DATA_LCN_FOOD", lcn_nct: "GET_DATA_LCN_NCT",
  lcn_nct_status: "GET_DATA_LCN_NCT_STATUS", lcn_txc: "GET_DATA_LCN_TXC", lcn_cmt: "GET_DATA_LCN_CMT", lcn_mdc: "GET_DATA_LCN_MDC"
});

/** The operations the Product Check card uses (review N1). The licensee-name searches (lcn_*, drug_lcn_info) and the
 *  others stay listed in OPS for documentation but are not exposed publicly. */
export const PUBLIC_OPS = Object.freeze(["drug", "food", "cosmetic", "herbal", "device", "advert", "all"]);

/** Source metadata shown on the card and in /api/pc/status. testing_only = licence not confirmed (L16) or no licence (L13). */
export const SOURCES = Object.freeze({
  thfda: { name: "Thai FDA (อย.) WS_LICENSE_SEARCH", country: "TH", licence: "not stated (\"License not specified\"); permission letter drafted (L13)", testing_only: true,
    credit: "Source: Thai Food and Drug Administration (อย.) public licence search. Used for testing; written permission requested before charging." },
  openfda: { name: "openFDA enforcement (US FDA)", country: "US", licence: "CC0 1.0 (open.fda.gov/terms)", testing_only: false,
    credit: "Data from openFDA (U.S. Food and Drug Administration), https://open.fda.gov, CC0 1.0. FDA does not endorse LENSIQ." },
  safetygate: { name: "EU Safety Gate", country: "EU", licence: "website search: European Commission reuse notice (CC BY 4.0 equivalence unconfirmed, L16); weekly XML: CC0",
    testing_only: true, credit: "Source: European Commission, Safety Gate (https://ec.europa.eu/safety-gate-alerts). Testing only until the licence is confirmed (L16)." },
  rasff: { name: "RASFF Window (EU)", country: "EU", licence: "CC BY 4.0 (data.europa.eu dataset restored_rasff); public search endpoint is undocumented (L16)", testing_only: true,
    credit: "Source: European Commission, RASFF Window (https://webgate.ec.europa.eu/rasff-window), CC BY 4.0. Modified: fields selected. Testing only: the search endpoint is undocumented (L16)." },
  healthcanada: { name: "Health Canada Recalls and Safety Alerts", country: "CA", licence: "Open Government Licence – Canada", testing_only: false,
    credit: "Contains information licensed under the Open Government Licence – Canada. Source: Health Canada Recalls and Safety Alerts. Health Canada does not endorse LENSIQ." },
  hsa: { name: "Singapore HSA registered therapeutic products", country: "SG", licence: "Singapore Open Data Licence v1.0", testing_only: false,
    credit: "Contains information from Listing of Registered Therapeutic Products accessed from data.gov.sg, made available under the " +
      "Singapore Open Data Licence version 1.0 (https://data.gov.sg/open-data-licence)." },
  label: { name: "openFDA drug labels", country: "US", licence: "CC0 1.0", testing_only: false,
    credit: "Data from openFDA (U.S. Food and Drug Administration), CC0 1.0. Label wording is the labeller's: facts and a link only." },
  ndc: { name: "openFDA NDC directory", country: "US", licence: "CC0 1.0", testing_only: false,
    credit: "Data from openFDA (U.S. Food and Drug Administration), CC0 1.0. FDA does not endorse LENSIQ." },
  dailymed: { name: "DailyMed (US NLM)", country: "US", licence: "US Government work; label content is the labeller's (L33)", testing_only: false,
    credit: "Source: National Library of Medicine, DailyMed, https://dailymed.nlm.nih.gov. Label content is the responsibility of the labeller. NLM does not endorse LENSIQ." },
  rxnav: { name: "RxNorm / RxNav (US NLM)", country: "US", licence: "no licence needed for RxNav APIs except RxClass (not used, L33)", testing_only: false,
    credit: "This product uses publicly available data from the U.S. National Library of Medicine (NLM), National Institutes of Health, " +
      "Department of Health and Human Services; NLM is not responsible for the product and does not endorse or recommend this or any other product." }
});
const TTL = { thfda: 6 * 3600, openfda: 3600, safetygate: 3600, rasff: 3600, healthcanada: 3600, hsa: 6 * 3600, label: 86400, ndc: 86400, dailymed: 86400, rxnav: 86400 };
export const HSA_RESOURCE = "d_767279312753558cbf19d48344577084";

/* ---------------- settings (admin switch) ---------------- */
export const DEFAULT_PC = Object.freeze({ thfda: "live", sources: Object.freeze(Object.fromEntries(Object.keys(SOURCES).map(k => [k, true]))) });
/** @param {any} env */
export const isCustomerBuild = env => String(env.PC_BUILD || "demo").trim().toLowerCase() === "customer";
/** Settings with the defaults of this build. off_reason says why a source is off by default. @param {any} env */
export async function getPcSettings(env) {
  const mode = String(env.PC_THFDA_MODE || "live") === "link" ? "link" : "live";
  const customer = isCustomerBuild(env);
  /** @type {Record<string, boolean>} */ const sources = {};
  /** @type {Record<string, string>} */ const offReason = {};
  for (const [k, m] of Object.entries(SOURCES)) {
    sources[k] = true;
    if (customer && m.testing_only) { sources[k] = false; offReason[k] = "testing_only_off"; }
    if (k === "healthcanada") { sources[k] = false; offReason[k] = "on_device"; } // searched on the device from static shards
  }
  /** @type {any} */ let s = {};
  if (env.DB) { try { s = (await getSetting(env.DB, "pc_lookup", {})) || {}; } catch { /* no settings table yet: defaults */ } }
  const stored = s.sources && typeof s.sources === "object" ? s.sources : {};
  for (const k of Object.keys(SOURCES)) {
    if (!Object.hasOwn(stored, k) || typeof stored[k] !== "boolean") continue;
    if (k === "healthcanada") continue; // never through the Worker
    sources[k] = stored[k];
    if (stored[k]) delete offReason[k]; else offReason[k] = "switched_off";
  }
  return { thfda: s.thfda === "link" || s.thfda === "live" ? s.thfda : mode, sources, off_reason: offReason, build: customer ? "customer" : "demo" };
}
/** Validate + store (admin PUT, re-auth + audit done by the router). @param {any} env @param {any} input */
export async function putPcSettings(env, input) {
  /** @type {any} */ let stored = {};
  try { stored = (await getSetting(env.DB, "pc_lookup", {})) || {}; } catch { /* first write */ }
  // only explicit owner choices are stored: a PUT without "thfda" must not freeze today's computed mode (the wrangler
  // PC_THFDA_MODE fallback keeps working until the owner sets it)
  /** @type {any} */ const next = { sources: { ...(stored.sources && typeof stored.sources === "object" ? stored.sources : {}) } };
  if (stored.thfda === "live" || stored.thfda === "link") next.thfda = stored.thfda;
  if (!input || typeof input !== "object") throw new HttpError(400, "body must be an object");
  if (Object.hasOwn(input, "thfda")) { if (!["live", "link"].includes(input.thfda)) throw new HttpError(400, "thfda must be \"live\" or \"link\""); next.thfda = input.thfda; }
  if (Object.hasOwn(input, "sources")) {
    if (!input.sources || typeof input.sources !== "object") throw new HttpError(400, "sources must be an object");
    for (const [k, v] of Object.entries(input.sources)) {
      if (!Object.hasOwn(SOURCES, k)) throw new HttpError(400, "unknown source " + k);
      if (typeof v !== "boolean") throw new HttpError(400, `sources.${k} must be true or false`);
      next.sources[k] = v;
    }
  }
  await putSetting(env.DB, "pc_lookup", next); // only explicit owner choices are stored; build defaults stay computed
  return getPcSettings(env);
}
/** Admin view: settings + the licence notes the owner needs before switching anything on for a paid build. @param {any} env */
export async function adminPcLookup(env) {
  return { settings: await getPcSettings(env), sources: SOURCES, public_ops: PUBLIC_OPS, build: isCustomerBuild(env) ? "customer" : "demo",
    note: "Thai FDA: \"live\" uses the FDA web service for testing (owner decision 2026-11-09). Written permission is needed before charging (CTO-BRIEF L13); switch to \"link\" if the FDA says no." };
}

/* ---------------- Thai FDA ---------------- */
const xmlEsc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlUnesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
/** @param {string} op SOAP operation @param {string} q */
export function soapFor(op, q) {
  return '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
    `<${op} xmlns="http://tempuri.org/"><DATAS>${xmlEsc(q)}</DATAS></${op}></soap:Body></soap:Envelope>`;
}
/** Number formats the service expects (live 2026-11-10): drug numbers need the space after the prefix ("1A 844/39"),
 *  herbal numbers must not have it ("G123/45"); food / cosmetic numbers work with or without dashes. @param {string} op @param {string} q */
export function thfdaQuery(op, q) {
  const t = cleanTerm(q, 60).toUpperCase();
  if (op === "drug" || op === "drug_info") { const m = /^(\d?[A-Zก-ฮ]{1,2})\s*(\d{1,6}\s*\/\s*\d{2,4}.*)$/.exec(t); return m ? `${m[1]} ${m[2].replace(/\s+/g, "")}` : t; }
  if (op === "herbal") { const m = /^([A-Zก-ฮ]{1,2})\s+(\d{1,6}\s*\/\s*\d{2,4})$/.exec(t); return m ? m[1] + m[2].replace(/\s+/g, "") : t; }
  return t;
}
/** Person titles (civil, academic, medical, military / police ranks, monastic): a name that starts with one is never shown. */
export const PERSON_TITLE = new RegExp("^(?:ว่าที่\\s*)?(?:" + [
  "นาย", "นางสาว", "นาง", "เด็กชาย", "เด็กหญิง", "คุณ", "หม่อม", "ท่าน", "พระ", "แม่ชี", "สามเณร",
  "ดร\\.", "นพ\\.", "พญ\\.", "ภก\\.", "ภญ\\.", "ทพ\\.", "ทพญ\\.", "ทนพ\\.", "ทนพญ\\.", "สพ\\.", "สพญ\\.", "ผศ\\.", "รศ\\.", "ศ\\.",
  "นายแพทย์", "แพทย์หญิง", "ทันตแพทย์หญิง", "ทันตแพทย์", "เภสัชกรหญิง", "เภสัชกร", "พลทหาร", "นักเรียน",
  "(?:[ก-ฮ]{1,3}\\.){2,4}", // abbreviated ranks and titles: น.ส. ด.ช. พ.ต.ท. ร.ต.อ. พล.ต. จ.ส.อ. ม.ร.ว.
  "พล(?:ตำรวจ|อากาศ|เรือ)?(?:เอก|โท|ตรี)", "พัน(?:ตำรวจ)?(?:เอก|โท|ตรี)", "ร้อย(?:ตำรวจ)?(?:เอก|โท|ตรี)", "จ่า(?:สิบ)?(?:ตำรวจ)?(?:เอก|โท|ตรี)", "สิบ(?:ตำรวจ)?(?:เอก|โท|ตรี)",
  "(?:MR|MRS|MS|MISS|MDM|MADAM|DR|PROF|SIR|DATO|DATUK|TAN SRI)\\b\\.?"
].join("|") + ")", "i");
// start: a registered form (an ordinary partnership is juristic only when registered: "…สามัญนิติบุคคล"); "กรม" not followed by a
// royal rank (กรมพระยา, กรมหลวง, กรมหมื่น, กรมขุน are titles of persons); end: "จำกัด" as its own word ("…ใจจำกัด" is a name)
const JURISTIC_TH_START = /^(บริษัท|บจก\.?|บมจ\.?|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วนสามัญนิติบุคคล|หจก\.?|องค์การ|มูลนิธิ|สหกรณ์|โรงพยาบาล|มหาวิทยาลัย|สถาบัน|สภากาชาด|สำนักงาน)/;
const JURISTIC_TH_DEPT = /^กรม(?!พระ|หลวง|หมื่น|ขุน)/;
const JURISTIC_TH_END = /(?:^|[\s)])จำกัด(\s*\(มหาชน\))?$/;
const JURISTIC_TH = { test: (/** @type {string} */ n) => JURISTIC_TH_START.test(n) || JURISTIC_TH_DEPT.test(n) || JURISTIC_TH_END.test(n) };
const JURISTIC_EN = /\b(CO\.?,?\s*LTD\.?|LIMITED|INC\.?|CORP\.?|CORPORATION|COMPANY|GMBH|PLC\.?|LLC\.?|PTE\.?\s*LTD\.?|SDN\.?\s*BHD\.?|S\.A\.?)$/i;
/** NFKC, zero-width and format characters removed, spaces collapsed: "​นาง…" and "Ｍｒｓ …" are read as "นาง…" / "Mrs …". @param {any} s */
export const nameFold = s => String(s == null ? "" : s).normalize("NFKC")
  .replace(/\u0E4D\u0E32/g, "\u0E33") // NFKC splits sara am (U+0E33): put it back so "จำกัด" still matches
  .replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\u00AD]/g, "").replace(/\s+/g, " ").trim();
/** Juristic person (company, partnership, public body): its name may be shown. Markers are anchored (a company name STARTS with
 *  บริษัท… or ENDS with จำกัด / Co., Ltd. …); a name that starts with a person's title is never shown. @param {string} name */
export const isJuristic = name => { const n = nameFold(name); return !!n && !PERSON_TITLE.test(n) && (JURISTIC_TH.test(n) || JURISTIC_EN.test(n)); };
/** kept for older callers: test() answers isJuristic */
export const JURISTIC = { test: isJuristic };
const tag = (block, k) => { const m = new RegExp(`<${k}>([\\s\\S]*?)</${k}>`).exec(block); return m ? xmlUnesc(m[1]).replace(/\s+/g, " ").trim().slice(0, 200) : ""; };
const LINK_HOSTS = /^(pertento|cosmetica|profile|porta|privus)\.fda\.moph\.go\.th$/;
/** A real WS_LICENSE_SEARCH answer: the operation's Response AND Result elements, no SOAP Fault (review B1). An HTML / WAF
 *  page, a Fault or an empty body is not "no rows". @param {string} xml @param {string} soapOp */
export function isSoapAnswer(xml, soapOp) {
  const t = String(xml || "");
  return new RegExp(`<${soapOp}Response\\b`).test(t) && new RegExp(`<${soapOp}Result\\b|<${soapOp}Result/>`).test(t) && !/<(?:\w+:)?Fault\b/.test(t);
}
/** SOAP DataSet -> whitelisted rows (no addresses, no natural-person names). @param {string} xml */
export function parseThfdaRows(xml) {
  const blocks = String(xml || "").match(/<Table1\b[\s\S]*?<\/Table1>/g) || [];
  let dropped = 0;
  const rows = blocks.slice(0, MAX_ROWS).map(b => {
    // licen / thanm / grannm_lo may each hold the licensee; the first one that is clearly a company is shown
    const names = [tag(b, "licen"), tag(b, "thanm"), tag(b, "grannm_lo")].filter(Boolean);
    const company = names.find(isJuristic) || "";
    const holder = company || names[0] || "";
    const juristic = !!company;
    if (holder && !juristic) dropped++;
    let url = "";
    for (const k of ["URLs_NEW", "URLs"]) { try { const u = new URL(tag(b, k)); if (u.protocol === "https:" && LINK_HOSTS.test(u.hostname)) { url = u.href; break; } } catch { /* none */ } }
    const status_text = tag(b, "cncnm");
    const newcode = tag(b, "Newcode") || tag(b, "NEWCODE");
    return {
      lcnno: tag(b, "lcnno") || tag(b, "lcnno_noo") || tag(b, "lcnno_no"), name_th: tag(b, "productha") || tag(b, "productnm"), name_en: tag(b, "produceng"),
      type: tag(b, "typepro") || tag(b, "lcntpcd"), use: tag(b, "thaclassnm"), kind: tag(b, "thakindnm"), status_text, status: pcStatus(status_text),
      newcode: /^[A-Z0-9ก-๙]{6,40}$/.test(newcode) ? newcode : "", holder: juristic ? holder : "", holder_dropped: !!holder && !juristic, url
    };
  });
  return { total: blocks.length, rows, natural_person_names_dropped: dropped };
}

/** Thai FDA status text -> active | cancelled | expired | pending | unknown. Food rows read "สถานะผลิตภัณฑ์(คงอยู่)\\ สถานะสถานที่
 *  (…)": the PRODUCT status decides. Adverts read "อนุญาต". @param {string} s */
export function pcStatus(s) {
  let t = String(s || "").trim();
  const prod = /สถานะผลิตภัณฑ์\s*\(([^)]*)\)/.exec(t);
  if (prod) t = prod[1].trim();
  if (/^(คงอยู่|ทะเบียนคงอยู่|อนุญาต)/.test(t)) return "active";
  if (/^ยกเลิก|^ถูกยกเลิก|เพิกถอน/.test(t)) return "cancelled";
  if (/^หมดอายุ|^สิ้นอายุ|ไม่ต่ออายุ/.test(t)) return "expired";
  if (/^รอ/.test(t)) return "pending";
  return "unknown";
}

/* ---------------- helpers ---------------- */
/** @param {any} f @param {string} url @param {any} [init] */
async function timed(f, url, init = {}, ms = UPSTREAM_MS) {
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = ac ? setTimeout(() => ac.abort(), ms) : null;
  try { return await f(url, { ...init, signal: ac ? ac.signal : undefined }); } finally { if (t) clearTimeout(t); }
}
/** @param {any} deps */
function cacheOf(deps) {
  if (deps && deps.cache) return deps.cache;
  const c = /** @type {any} */ (globalThis).caches;
  return c && c.default ? c.default : null;
}
/** Cache by SHA-256 of the key (the query text is never part of a cache URL); errors are never cached. */
async function cached(deps, key, ttl, produce) {
  const cache = cacheOf(deps);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pc/" + key)));
  const req = new Request("https://lensiq-pc-cache.invalid/" + Array.from(digest, x => x.toString(16).padStart(2, "0")).join(""));
  if (cache) { try { const h = await cache.match(req); if (h) return { body: await h.json(), cached: true }; } catch { /* miss */ } }
  const body = await produce();
  if (cache && body && body.ok) {
    try { await cache.put(req, new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttl}` } })); } catch { /* best effort */ }
  }
  return { body, cached: false };
}
const short = (s, n = 160) => { const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const isoYmd = s => (/^\d{8}$/.test(String(s)) ? `${String(s).slice(0, 4)}-${String(s).slice(4, 6)}-${String(s).slice(6, 8)}` : "");
export const GTIN = /^\d{8}$|^\d{12,14}$/;
class Down extends Error { constructor(/** @type {string} */ r) { super(r); this.reason = r; } }
/** openFDA answers "no match" as HTTP 404 with {"error":{"code":"NOT_FOUND"}}. Any other 404 (a proxy, a moved path, an HTML
 *  page) is the source being down, never "none" (re-review 4). @param {Response} r */
async function openfdaNone(r) {
  if (r.status !== 404) return false;
  /** @type {any} */ let j = null;
  try { j = JSON.parse(await r.text()); } catch { j = null; }
  if (j && j.error && j.error.code === "NOT_FOUND") return true;
  throw new Down("upstream_404");
}
/** The expected shape or "could not check" (review S1): a 200 with another body is a source problem, not "nothing found". */
const shape = (/** @type {boolean} */ ok) => { if (!ok) throw new Down("bad_response"); };
const isObj = (/** @type {any} */ x) => !!x && typeof x === "object" && !Array.isArray(x);
/** @param {Response} r */
const must = r => { if (!r.ok) throw new Down(r.status === 429 ? "rate_limited" : "upstream_" + r.status); return r; };

/* ---------------- per-source fetchers: (q, by, env, f, deps) -> {items, total?, note?} ---------------- */
/** openFDA enforcement, drug + food. 404 = no match (openFDA answers "No matches found!" that way). */
async function openfdaRecalls(q, by, env, f) {
  const key = env.OPENFDA_API_KEY ? "&api_key=" + encodeURIComponent(env.OPENFDA_API_KEY) : "";
  const t = q.replace(/["\\]/g, "");
  // product_description only: an OR with openfda.brand_name changes openFDA's result set (live 2026-11-10) and that
  // sub-object is empty on most recent recalls; a GTIN sits inside product_description (food) or openfda.upc (drug)
  const one = async kind => {
    const s = kind === "drug" && by === "gtin" ? `product_description:"${t}"+openfda.upc:"${t}"` : `product_description:"${t}"`;
    const r = await timed(f, `https://api.fda.gov/${kind}/enforcement.json?search=${encodeURIComponent(s).replace(/%2B/g, "+")}&sort=report_date:desc&limit=5${key}`,
      { headers: { Accept: "application/json" } });
    if (await openfdaNone(r)) return { results: [], total: 0 };
    const j = await must(r).json();
    shape(isObj(j) && Array.isArray(j.results));
    return { results: j.results, total: (j.meta && j.meta.results && j.meta.results.total) || 0 };
  };
  const [d, fo] = await Promise.all([one("drug"), one("food")]);
  const items = [...d.results.map(x => ({ x, kind: "drug" })), ...fo.results.map(x => ({ x, kind: "food" }))].map(({ x, kind }) => ({
    ref: String(x.recall_number || ""), date: isoYmd(x.report_date), title: short(x.product_description),
    firm: isJuristic(String(x.recalling_firm || "")) ? short(x.recalling_firm, 80) : "", // a sole proprietor is a person: kept only when clearly a company
    reason: short(x.reason_for_recall), class: String(x.classification || ""), status: String(x.status || ""), kind,
    url: "https://www.accessdata.fda.gov/scripts/ires/index.cfm"
  })).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  return { items, total: d.total + fo.total };
}
/** EU Safety Gate public search (undocumented; the body must be complete or the server answers 405). */
export function safetyGateBody(q) {
  return { criteria: {}, fullTextSearch: q, language: "en", isLaunched: true, isLaunchSearch: true, displayDefaultResults: false, searchCriteriaForNotification: false,
    isForMostRecent: false, pagination: { numberElements: 5, page: 0, sortField: "PUBLICATION_DATE", sortOrder: "DESC", totalElements: 0 } };
}
async function safetyGate(q, by, env, f) {
  if (by === "gtin") return { items: [], total: 0, note: "barcode search not supported by this source" };
  const r = await timed(f, "https://ec.europa.eu/safety-gate-alerts/public/api/search", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(safetyGateBody(q)) });
  const j = await must(r).json();
  shape(isObj(j) && Array.isArray(j.content));
  const items = ((j && j.content) || []).slice(0, 5).map(x => ({
    ref: String(x.reference || ""), date: String(x.publicationDate || "").slice(0, 10), title: short((x.product && (x.product.nameSpecific || x.product.name)) || ""),
    brand: short(((x.product && x.product.brands) || []).map(b => b.brand).join(", "), 80),
    reason: ((x.risk && x.risk.riskType) || []).map(t => String(t.name || "").toLowerCase().replace(/_/g, " ")).join(", "),
    url: /^\d+$/.test(String(x.id)) ? `https://ec.europa.eu/safety-gate-alerts/screen/webReport/alertDetail/${x.id}?lang=en` : ""
  }));
  return { items, total: Number(j && j.totalElements) || items.length };
}
async function rasff(q, by, env, f) {
  if (by === "gtin") return { items: [], total: 0, note: "barcode search not supported by this source" };
  const r = await timed(f, "https://webgate.ec.europa.eu/rasff-window/backend/public/notification/search/consolidated/en/", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ parameters: { pageNumber: 1, itemsPerPage: 5 }, subject: q }) });
  const j = await must(r).json();
  shape(isObj(j) && Array.isArray(j.notifications));
  const dmy = s => { const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(String(s || "")); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
  const items = ((j && j.notifications) || []).slice(0, 5).map(x => ({
    ref: String(x.reference || ""), date: dmy(x.ecValidationDate), title: short(x.subject), reason: short((x.riskDecision && x.riskDecision.description) || "", 40),
    country: String((x.notifyingCountry && x.notifyingCountry.isoCode) || ""), origin: ((x.originCountries || []).map(o => o.isoCode)).join(", "),
    url: /^\d+$/.test(String(x.notifId)) ? `https://webgate.ec.europa.eu/rasff-window/screen/notification/${x.notifId}` : ""
  }));
  return { items, total: Number(j && j.totalElements) || items.length };
}
async function hsa(q, by, env, f) {
  const sin = /^SIN\d{5}[A-Z]{1,2}$/i.test(q.replace(/\s+/g, ""));
  const p = sin ? `filters=${encodeURIComponent(JSON.stringify({ LicenceNo: q.replace(/\s+/g, "").toUpperCase() }))}` : `q=${encodeURIComponent(JSON.stringify({ Productname: q }))}`;
  const r = await timed(f, `https://data.gov.sg/api/action/datastore_search?resource_id=${HSA_RESOURCE}&limit=5&${p}`, { headers: { Accept: "application/json" } });
  const j = await must(r).json();
  shape(isObj(j) && j.success !== false && isObj(j.result) && Array.isArray(j.result.records));
  const recs = j.result.records;
  const items = recs.slice(0, 5).map(x => ({
    ref: String(x.LicenceNo || ""), title: short(x.Productname), holder: short(x.Licenseholder, 80), date: (/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(x.Approvaldate || "")) || [])
      .slice(1).reverse().map((v, i) => (i ? v.padStart(2, "0") : v)).join("-"), class: String(x.Forensicclassification || ""),
    ingredients: short(String(x.Activeingredients || "").split("&&").join(" + "), 160), strength: short(String(x.Strength || "").split("&&").join(" + "), 80),
    form: short(x.Dosageform, 60), url: "https://www.hsa.gov.sg/e-services/infosearch"
  }));
  return { items, total: Number(j && j.result && j.result.total) || items.length };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NDC = /^\d{4,5}-\d{3,4}(-\d{1,2})?$/;
async function label(q, by, env, f) {
  const key = env.OPENFDA_API_KEY ? "&api_key=" + encodeURIComponent(env.OPENFDA_API_KEY) : "";
  const t = q.replace(/["\\]/g, "");
  const s = by === "ndc" && NDC.test(t) ? `openfda.product_ndc:"${t}"` : `openfda.brand_name:"${t}"+openfda.generic_name:"${t}"`;
  const r = await timed(f, `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(s).replace(/%2B/g, "+")}&limit=3${key}`, { headers: { Accept: "application/json" } });
  if (await openfdaNone(r)) return { items: [], total: 0 };
  const j = await must(r).json();
  shape(isObj(j) && Array.isArray(j.results));
  const items = j.results.slice(0, 3).map(x => {
    const o = x.openfda || {}, set = String(x.set_id || "");
    return { ref: set, title: short((o.brand_name || [])[0] || ""), generic: short((o.generic_name || [])[0] || "", 120), maker: short((o.manufacturer_name || [])[0] || "", 80),
      route: (o.route || []).slice(0, 3).join(", "), date: isoYmd(x.effective_time), ndc: (o.product_ndc || []).slice(0, 3),
      url: UUID.test(set) ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${set}` : "" }; // label TEXT never returned (L33)
  });
  return { items, total: items.length };
}
async function ndc(q, by, env, f) {
  const key = env.OPENFDA_API_KEY ? "&api_key=" + encodeURIComponent(env.OPENFDA_API_KEY) : "";
  const t = q.replace(/["\\]/g, "");
  const s = NDC.test(t) ? `product_ndc:"${t}"` : `brand_name:"${t}"+generic_name:"${t}"`;
  const r = await timed(f, `https://api.fda.gov/drug/ndc.json?search=${encodeURIComponent(s).replace(/%2B/g, "+")}&limit=3${key}`, { headers: { Accept: "application/json" } });
  if (await openfdaNone(r)) return { items: [], total: 0 };
  const j = await must(r).json();
  shape(isObj(j) && Array.isArray(j.results));
  const items = j.results.slice(0, 3).map(x => ({
    ref: String(x.product_ndc || ""), title: short(x.brand_name), generic: short(x.generic_name, 120), maker: short(x.labeler_name, 80), form: short(x.dosage_form, 60),
    ingredients: (x.active_ingredients || []).slice(0, 6).map(a => `${short(a.name, 60)} ${short(a.strength, 30)}`.trim()), category: short(x.marketing_category, 40),
    url: UUID.test(String(x.spl_id || "")) ? `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(String(x.product_ndc || ""))}` : ""
  }));
  return { items, total: items.length };
}
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** "Oct 26, 2026" -> "2026-10-26" (parsed by hand: Date.parse would apply the server's time zone). @param {any} s */
export const mdy = s => { const m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/.exec(String(s || "").trim()); const n = m && MON[m[1].toLowerCase()];
  return n ? `${m[3]}-${String(n).padStart(2, "0")}-${m[2].padStart(2, "0")}` : ""; };
async function dailymed(q, by, env, f) {
  const r = await timed(f, `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(q)}&pagesize=5`, { headers: { Accept: "application/json" } });
  const j = await must(r).json();
  shape(isObj(j) && Array.isArray(j.data));
  const items = j.data.slice(0, 5).map(x => ({
    ref: String(x.setid || ""), title: short(x.title, 160), date: mdy(x.published_date),
    url: UUID.test(String(x.setid || "")) ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${x.setid}` : ""
  }));
  return { items, total: Number(j && j.metadata && j.metadata.total_elements) || items.length };
}
async function rxnav(q, by, env, f) {
  const r = await timed(f, `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=3`, { headers: { Accept: "application/json" } });
  const j = await must(r).json();
  shape(isObj(j) && isObj(j.approximateGroup));
  const cand = (Array.isArray(j.approximateGroup.candidate) ? j.approximateGroup.candidate : []).filter(c => /^\d+$/.test(String(c.rxcui)));
  if (!cand.length) return { items: [], total: 0 };
  const id = String(cand[0].rxcui);
  const r2 = await timed(f, `https://rxnav.nlm.nih.gov/REST/rxcui/${id}/related.json?tty=IN`, { headers: { Accept: "application/json" } });
  const j2 = await must(r2).json();
  shape(isObj(j2) && isObj(j2.relatedGroup));
  const groups = Array.isArray(j2.relatedGroup.conceptGroup) ? j2.relatedGroup.conceptGroup : [];
  const items = groups.flatMap(g => g.conceptProperties || []).slice(0, 8).map(c => ({ ref: String(c.rxcui || ""), title: short(c.name, 80), kind: "ingredient",
    url: `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${encodeURIComponent(String(c.rxcui || ""))}` }));
  return { items, total: items.length, matched_rxcui: id };
}
const FETCHERS = { openfda: openfdaRecalls, safetygate: safetyGate, rasff, hsa, label, ndc, dailymed, rxnav };

/** In-memory fixed-window limiter, used when there is no D1 (review S6). Keys are SHA-256 of the caller address, kept
 *  only in this isolate's memory. */
const MEM = new Map();
/** @param {Request} request @param {number} max */
async function memHit(request, max) {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "local";
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pc|" + ip)));
  const k = Array.from(d.slice(0, 12), x => x.toString(16).padStart(2, "0")).join("");
  const now = Date.now(), w = MEM.get(k);
  if (MEM.size > 5000) for (const [kk, v] of MEM) if (now - v.t > 60000) MEM.delete(kk);
  if (!w || now - w.t >= 60000) { MEM.set(k, { t: now, n: 1 }); return { ok: true, retryAfter: 0 }; }
  w.n++;
  return w.n <= max ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: Math.max(1, Math.ceil((w.t + 60000 - now) / 1000)) };
}
/** One rate-limit count for this caller (D1 when bound, memory otherwise). @param {Request} request @param {any} env */
async function limited(request, env) {
  const max = intVar(env.PC_RATE_MIN, RATE_MIN, 1, 120);
  if (env.DB) { const who = await callerHash(env, request, "pc"); return hit(env.DB, "pc:" + who, max, 60); }
  return memHit(request, max);
}
export const BATCH_MAX = 16;

/**
 * One lookup -> [body, status]. Validation errors are 400; a source that is off is 503; a source that cannot answer is 502.
 * @param {any} env @param {any} cfg @param {{source: any, op?: any, by?: any, q?: any}} L @param {{fetch?: typeof fetch, cache?: any}} deps
 * @returns {Promise<[any, number]>}
 */
async function lookupOne(env, cfg, L, deps, testerOk = true) {
  const route = String(L.source || "");
  if (!Object.hasOwn(SOURCES, route)) return [{ error: "unknown source" }, 400];
  const meta = SOURCES[route];
  const base = { source: route, name: meta.name, credit: meta.credit, licence: meta.licence, testing_only: meta.testing_only };
  if (cfg.sources[route] === false) return [{ ...base, ok: false, could_not_check: true, reason: cfg.off_reason[route] || "switched_off" }, 503];
  // deploy B8 (owner decision D2): testing-only sources answer tester-code holders only; nobody else triggers an upstream call
  if (meta.testing_only && !testerOk) return [{ ...base, ok: false, could_not_check: true, reason: "tester_required" }, 503];
  const by = ["name", "gtin", "ndc"].includes(String(L.by || "")) ? String(L.by) : "name";
  const q = cleanTerm(L.q || "", 80);
  if (q.length < 2) return [{ error: "query too short" }, 400];
  if (by === "gtin" && !GTIN.test(q)) return [{ error: "bad gtin" }, 400];
  const op = route === "thfda" ? String(L.op || "all") : "";
  if (route === "thfda" && !PUBLIC_OPS.includes(op)) return [{ error: "unknown op" }, 400];
  if (route === "thfda" && cfg.thfda === "link") {
    return [{ ...base, ok: false, could_not_check: true, reason: "link_out", links: ["https://oryor.com/check-product-serial",
      "https://porta.fda.moph.go.th/FDA_SEARCH_ALL/MAIN/SEARCH_CENTER_MAIN.aspx"] }, 503];
  }
  const f = deps.fetch || fetch;
  const t0 = Date.now();
  const r = await cached(deps, `${route}/${op}/${by}/${q.toLowerCase()}`, TTL[route], async () => {
    try {
      if (route === "thfda") {
        const soapOp = OPS[op], qq = thfdaQuery(op, q);
        const up = await timed(f, THFDA_URL, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"http://tempuri.org/${soapOp}"` },
          body: soapFor(soapOp, qq) });
        must(up);
        const xml = await up.text();
        if (!isSoapAnswer(xml, soapOp)) throw new Down("bad_response");
        const parsed = parseThfdaRows(xml);
        return { ...base, ok: true, op, q: qq, fetched: new Date().toISOString(), found: parsed.total, total: parsed.total, items: parsed.rows,
          natural_person_names_dropped: parsed.natural_person_names_dropped };
      }
      const out = await FETCHERS[route](q, by, env, f, deps);
      return { ...base, ok: true, by, q, fetched: new Date().toISOString(), found: out.items.length, ...out };
    } catch (e) {
      const reason = e instanceof Down ? e.reason : e && e.name === "AbortError" ? "timeout" : e instanceof SyntaxError ? "bad_response" : "upstream_unavailable";
      return { ...base, ok: false, could_not_check: true, reason };
    }
  });
  log("pc.lookup", { source: route, ok: !!r.body.ok, found: r.body.found || 0, cached: r.cached, ms: Date.now() - t0 });
  return [r.body, r.body.ok ? 200 : 502];
}

/**
 * Handles /api/pc/*. Returns a Response, or null when the path is not a Product Check route.
 * @param {Request} request @param {any} env @param {URL} url @param {{fetch?: typeof fetch, cache?: any}} [deps] @param {Record<string, string>} [cors]
 */
export async function pcRoute(request, env, url, deps = {}, cors = {}) {
  const p = url.pathname;
  if (!p.startsWith("/api/pc/")) return null;
  const reply = (body, status = 200) => json(body, status, cors);
  if (!flag(env.PC_ENABLED, true)) return reply({ error: "disabled" }, 404);
  const route = p.slice("/api/pc/".length);
  const batch = route === "batch";
  if (request.method !== (batch ? "POST" : "GET")) return reply({ error: "method not allowed" }, 405);
  if (!originAllowed(request, publicOrigins(env), { required: true })) return reply({ error: "origin not allowed" }, 403);
  const cfg = await getPcSettings(env);
  const gated = testerGateRequired(env);
  if (route === "status") {
    const tOk = !gated || (await testerState(env, request)).ok;
    for (const [k, s] of Object.entries(SOURCES)) if (s.testing_only && !tOk && cfg.sources[k] !== false) { cfg.sources[k] = false; cfg.off_reason[k] = "tester_required"; }
    return reply({ enabled: true, build: cfg.build, tester_gate: gated, thfda: { mode: cfg.thfda, permission_before_charging: true },
      sources: Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, { on: cfg.sources[k] !== false, off_reason: cfg.off_reason[k] || "",
        testing_only: s.testing_only, country: s.country, name: s.name, licence: s.licence }])) });
  }
  if (!batch && !Object.hasOwn(SOURCES, route)) return reply({ error: "not found" }, 404);
  /** @type {any[]} */ let list;
  if (batch) {
    const ct = request.headers.get("Content-Type") || "";
    if (!/^application\/json\b/i.test(ct)) return reply({ error: "content type must be application/json" }, 415);
    const text = await request.text();
    if (text.length > 4096) return reply({ error: "body too large" }, 413);
    /** @type {any} */ let body = null;
    try { body = JSON.parse(text); } catch { return reply({ error: "bad json" }, 400); }
    if (!isObj(body) || !Array.isArray(body.lookups) || !body.lookups.length || body.lookups.length > BATCH_MAX || !body.lookups.every(isObj)) {
      return reply({ error: `lookups must be 1-${BATCH_MAX} objects` }, 400);
    }
    list = body.lookups;
  } else list = [{ source: route, op: url.searchParams.get("op"), by: url.searchParams.get("by"), q: url.searchParams.get("q") }];
  // validate everything before counting or calling anything
  for (const L of list) {
    if (!Object.hasOwn(SOURCES, String(L.source || ""))) return reply({ error: "unknown source" }, 400);
    if (String(L.source) === "thfda" && L.op != null && !PUBLIC_OPS.includes(String(L.op))) return reply({ error: "unknown op" }, 400);
    if (cleanTerm(L.q || "", 80).length < 2) return reply({ error: "query too short" }, 400);
    if (String(L.by || "") === "gtin" && !GTIN.test(cleanTerm(L.q || "", 80))) return reply({ error: "bad gtin" }, 400);
  }
  const testerOk = !gated || !list.some(L => SOURCES[String(L.source)].testing_only) || (await testerState(env, request)).ok;
  const rl = await limited(request, env); // ONE count per request: a tap is one batch
  if (!rl.ok) return json({ error: "rate limited", retry_after: rl.retryAfter }, 429, { ...cors, "Retry-After": String(rl.retryAfter) });
  if (!batch) {
    try { const [b, st] = await lookupOne(env, cfg, list[0], deps, testerOk); return reply(b, st); }
    catch { return reply({ source: route, ok: false, could_not_check: true, reason: "upstream_unavailable" }, 502); }
  }
  // de-duplicate (re-review 16): the same lookup twice in one batch is asked once; every position gets its answer
  const keyOf = (/** @type {any} */ L) => JSON.stringify([String(L.source), String(L.source) === "thfda" ? String(L.op || "all") : "", String(L.by || "name"),
    cleanTerm(L.q || "", 80).toLowerCase()]);
  const uniq = new Map();
  for (const L of list) if (!uniq.has(keyOf(L))) uniq.set(keyOf(L), L);
  /** @type {Map<string, any>} */
  const done = new Map(/** @type {Array<[string, any]>} */ (await Promise.all([...uniq].map(async ([k, L]) => {
    try { const [b, st] = await lookupOne(env, cfg, L, deps, testerOk); return [k, { status: st, ...b }]; }
    catch { return [k, { status: 502, source: String(L.source), ok: false, could_not_check: true, reason: "upstream_unavailable" }]; }
  }))));
  return reply({ ok: true, results: list.map(L => done.get(keyOf(L))), unique: uniq.size });
}

