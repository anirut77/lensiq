// @ts-check
// backend/src/med.js — medicine checker text proxy (medicine.html, docs/MEDICINE.md). NOT deployed by default.
//
//   GET /api/med/status                       {enabled, thfda, openfda, rxnav, openfda_key}
//   GET /api/med/thfda?q=<reg no | name>      Thai FDA registration lookup (SOAP GET_DATA_DRUG, no CORS upstream)
//   GET /api/med/openfda?by=name|ndc|setid&q= openFDA drug/label (fallback when the page CSP has no api.fda.gov)
//   GET /api/med/rxnav?term=<name>            RxNav approximateTerm (fallback when the page CSP has no rxnav)
//
// Privacy: forwards TEXT only (a registration number, NDC, set id or a drug name, max 60 / 80 characters). Never images,
// never cookies, never the caller's address: upstream requests carry no client headers. Nothing is stored except the
// day-salted caller pseudonym of the shared fixed-window rate limit (store.js, deleted by the daily cron) and a 24 h
// edge-cache entry of the upstream answer keyed by a SHA-256 of the normalised query. Logs carry counts and timings only (util.log).
// Switch: MED_ENABLED (default "true" once the Worker is deployed; "false" -> 404 on every /api/med/* route).
// Optional secret OPENFDA_API_KEY raises openFDA's limit from 1,000/day to 120,000/day for the Worker's address.
import { callerHash, hit } from "./store.js";
import { flag, intVar, json, log, originAllowed, publicOrigins } from "./util.js";

export const THFDA_URL = "https://porta.fda.moph.go.th/FDA_SEARCH_ALL/WS_LICENSE_SEARCH.asmx";
export const OPENFDA_URL = "https://api.fda.gov/drug/label.json";
export const RXNAV_URL = "https://rxnav.nlm.nih.gov/REST/approximateTerm.json";
export const CACHE_TTL = 24 * 3600;
/** per caller per minute (all /api/med/* lookups together); MED_RATE_MIN overrides (1–120) */
export const RATE_MIN = 20;
const MAX_ROWS = 50;
const UPSTREAM_MS = 10000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same rule as LQMed.cleanTerm (lensiq-med.js): letters (with combining marks: Thai vowels/tone marks), digits, space and - . , ( ) / + only. */
export function cleanTerm(s, max = 80) {
  return String(s == null ? "" : s).normalize("NFKC").replace(/[^\p{L}\p{M}\p{N}\s\-.,()/+]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
const xmlEsc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlUnesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");

export function soapBody(q) {
  return '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
    `<GET_DATA_DRUG xmlns="http://tempuri.org/"><DATAS>${xmlEsc(q)}</DATAS></GET_DATA_DRUG></soap:Body></soap:Envelope>`;
}

export function thStatus(s) {
  const t = String(s || "").trim();
  if (/^คงอยู่/.test(t)) return "active";
  if (/^ยกเลิก/.test(t)) return "cancelled";
  if (/^หมดอายุ/.test(t)) return "expired";
  if (/^รอ/.test(t)) return "pending";
  return "unknown";
}
const FIELDS = ["lcnno", "productha", "produceng", "thanm", "licen", "cncnm", "typepro", "thaclassnm", "thakindnm", "Newcode", "URLs_NEW"];
/** SOAP response -> {total, rows:[{lcnno, name_th, name_en, licensee, status_text, status, type, use, kind, newcode, url}]}.
 *  Addresses and every other field are dropped. Only pertento.fda.moph.go.th links are kept. */
export function parseThfda(xml) {
  const rows = [];
  const all = String(xml || "").match(/<Table1\b[\s\S]*?<\/Table1>/g) || [];
  for (const block of all.slice(0, MAX_ROWS)) {
    const f = {};
    for (const k of FIELDS) {
      const m = new RegExp(`<${k}>([\\s\\S]*?)</${k}>`).exec(block);
      f[k] = m ? xmlUnesc(m[1]).replace(/\s+/g, " ").trim().slice(0, 300) : "";
    }
    let url = "";
    try { const u = new URL(f.URLs_NEW); if (u.protocol === "https:" && u.hostname === "pertento.fda.moph.go.th") url = u.href; } catch { /* no link */ }
    rows.push({
      lcnno: f.lcnno, name_th: f.productha, name_en: f.produceng, licensee: f.thanm || f.licen, status_text: f.cncnm, status: thStatus(f.cncnm),
      type: f.typepro, use: f.thaclassnm, kind: f.thakindnm, newcode: /^[A-Z0-9ก-๙]{6,40}$/.test(f.Newcode) ? f.Newcode : "", url
    });
  }
  return { total: all.length, rows };
}

/** openFDA label search (same query as LQMed.openfdaSearch). by: name | ndc | setid. "" when q is unusable. */
export function openfdaSearch(by, q) {
  if (by === "setid") return UUID.test(q) ? `set_id:"${q.toLowerCase()}"` : "";
  if (by === "ndc") {
    const list = q.split(/[\s,]+/).filter(n => /^\d{4,5}-\d{3,4}(-\d{1,2})?$/.test(n)).slice(0, 3);
    return list.map(n => (n.split("-").length === 3 ? `openfda.package_ndc:"${n}"` : `openfda.product_ndc:"${n}"`)).join(" ");
  }
  if (by === "name") {
    const t = cleanTerm(q).replace(/["\\]/g, "");
    return t && /[A-Za-z]/.test(t) ? `openfda.generic_name:"${t}" openfda.brand_name:"${t}" openfda.substance_name:"${t}"` : "";
  }
  return "";
}

async function timed(fetchFn, url, init) {
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = ac ? setTimeout(() => ac.abort(), UPSTREAM_MS) : null;
  try { return await fetchFn(url, { ...init, signal: ac ? ac.signal : undefined }); } finally { if (t) clearTimeout(t); }
}

/** Edge cache (Workers caches.default) or deps.cache {match, put}; absent -> no cache. Key = SHA-256 of route + normalised
 * query, so the query text itself is never part of a cache URL. */
function cacheOf(deps) {
  if (deps && deps.cache) return deps.cache;
  const c = /** @type {any} */ (globalThis).caches;
  return c && c.default ? c.default : null;
}
async function cached(deps, key, produce) {
  const cache = cacheOf(deps);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  const req = new Request("https://lensiq-med-cache.invalid/" + Array.from(digest, x => x.toString(16).padStart(2, "0")).join(""));
  if (cache) {
    try { const hitR = await cache.match(req); if (hitR) return { body: await hitR.json(), cached: true }; } catch { /* cache miss */ }
  }
  const body = await produce();
  if (cache && body && !body.error) {
    try { await cache.put(req, new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_TTL}` } })); } catch { /* best effort */ }
  }
  return { body, cached: false };
}

/**
 * Handles /api/med/*. Returns a Response, or null when the path is not a medicine route (the caller continues routing).
 * @param {Request} request @param {any} env @param {URL} url @param {{fetch?: typeof fetch, cache?: any}} [deps]
 * @param {Record<string, string>} [cors]
 */
export async function medRoute(request, env, url, deps = {}, cors = {}) {
  const p = url.pathname;
  if (!p.startsWith("/api/med/")) return null;
  const reply = (body, status = 200) => json(body, status, cors);
  if (!flag(env.MED_ENABLED, true)) return reply({ error: "disabled" }, 404);
  if (request.method !== "GET") return reply({ error: "method not allowed" }, 405);
  if (!originAllowed(request, publicOrigins(env), { required: true })) return reply({ error: "origin not allowed" }, 403);
  if (p === "/api/med/status") return reply({ enabled: true, thfda: true, openfda: true, rxnav: true, openfda_key: !!env.OPENFDA_API_KEY });

  const route = p.slice("/api/med/".length);
  if (!["thfda", "openfda", "rxnav"].includes(route)) return reply({ error: "not found" }, 404);
  const raw = url.searchParams.get(route === "rxnav" ? "term" : "q") || "";
  const q = cleanTerm(raw, route === "thfda" ? 60 : 80);
  if (q.length < 2) return reply({ error: "query too short" }, 400);

  if (env.DB) {
    const who = await callerHash(env, request, "med");
    const rl = await hit(env.DB, "med:" + who, intVar(env.MED_RATE_MIN, RATE_MIN, 1, 120), 60);
    if (!rl.ok) return json({ error: "rate limited", retry_after: rl.retryAfter }, 429, { ...cors, "Retry-After": String(rl.retryAfter) });
  }
  const fetchFn = deps.fetch || fetch;
  const t0 = Date.now();
  try {
    if (route === "thfda") {
      const r = await cached(deps, "thfda/" + encodeURIComponent(q.toUpperCase()), async () => {
        const up = await timed(fetchFn, THFDA_URL, {
          method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://tempuri.org/GET_DATA_DRUG"' }, body: soapBody(q)
        });
        if (!up.ok) return { error: "upstream " + up.status };
        const parsed = parseThfda(await up.text());
        return { source: "Thai FDA (porta.fda.moph.go.th WS_LICENSE_SEARCH)", fetched: new Date().toISOString(), q, ...parsed };
      });
      log("med.thfda", { rows: r.body.rows ? r.body.rows.length : 0, cached: r.cached, ms: Date.now() - t0 });
      return reply(r.body, r.body.error ? 502 : 200);
    }
    if (route === "openfda") {
      const by = url.searchParams.get("by") || "name";
      const s = openfdaSearch(by, q);
      if (!s) return reply({ error: "bad query" }, 400);
      const r = await cached(deps, "openfda/" + by + "/" + encodeURIComponent(q.toLowerCase()), async () => {
        const key = env.OPENFDA_API_KEY ? "&api_key=" + encodeURIComponent(env.OPENFDA_API_KEY) : "";
        const up = await timed(fetchFn, `${OPENFDA_URL}?search=${encodeURIComponent(s)}&limit=3${key}`, { headers: { Accept: "application/json" } });
        if (up.status === 404) return { meta: null, results: [] };
        if (!up.ok) return { error: "upstream " + up.status };
        const j = await up.json();
        return { meta: j && j.meta ? { disclaimer: j.meta.disclaimer, terms: j.meta.terms, license: j.meta.license, last_updated: j.meta.last_updated } : null,
          results: Array.isArray(j && j.results) ? j.results.slice(0, 3) : [] };
      });
      log("med.openfda", { rows: r.body.results ? r.body.results.length : 0, cached: r.cached, ms: Date.now() - t0 });
      return reply(r.body, r.body.error ? 502 : 200);
    }
    const r = await cached(deps, "rxnav/" + encodeURIComponent(q.toLowerCase()), async () => {
      const up = await timed(fetchFn, `${RXNAV_URL}?term=${encodeURIComponent(q)}&maxEntries=6`, { headers: { Accept: "application/json" } });
      if (!up.ok) return { error: "upstream " + up.status };
      const j = await up.json();
      const cand = j && j.approximateGroup && Array.isArray(j.approximateGroup.candidate) ? j.approximateGroup.candidate : [];
      return { approximateGroup: { candidate: cand.slice(0, 12).map(c => ({ rxcui: String(c.rxcui || ""), score: String(c.score || ""), name: String(c.name || "").slice(0, 200), source: String(c.source || "") })) } };
    });
    log("med.rxnav", { rows: r.body.approximateGroup ? r.body.approximateGroup.candidate.length : 0, cached: r.cached, ms: Date.now() - t0 });
    return reply(r.body, r.body.error ? 502 : 200);
  } catch (e) {
    log("med.error", { route, aborted: !!(e && e.name === "AbortError"), ms: Date.now() - t0 });
    return reply({ error: "upstream unavailable" }, 502);
  }
}
