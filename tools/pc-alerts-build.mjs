#!/usr/bin/env node
// tools/pc-alerts-build.mjs — Product Check P4 (design 6.2, legal L18): the curated Thai warning list.
//
//   node tools/pc-alerts-build.mjs              validate tools/pc-alerts-th.src.json -> vendor/pc-alerts/th.json
//   node tools/pc-alerts-build.mjs --verify     also re-read every source page (live) and confirm the registration number
//                                               and a name token are on it and the printed date matches; result stored
//                                               per entry as verified {on, ok}. Entries that fail are NOT written.
//   node tools/pc-alerts-build.mjs --check      compare a fresh build (no network) with the committed file
//
// FACTS ONLY: names and numbers as printed, issue codes, substance names, the source URL and its date. No sentence or
// image from a press release is stored. Wording shown to users is generated from the issue codes (TH / EN / ZH) in
// lensiq-pc-lookup.js and always reads "found in <source> on <date>", never a verdict.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO, "tools", "pc-alerts-th.src.json");
const OUT = join(REPO, "vendor", "pc-alerts", "th.json");
export const SCHEMA = "lensiq-pc-alerts/1";
export const CATEGORIES = ["drug", "supplement", "food", "cosmetic", "herbal", "device"];
export const ISSUES = ["contains", "exceeds-limit", "unregistered", "no-number", "number-of-other-product", "no-dates", "recall", "fake-number"];
const ALLOWED_HOSTS = /(^|\.)fda\.moph\.go\.th$|(^|\.)oryor\.com$|\.go\.th$/;
const ID = /^TH-\d{4}-\d{4}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Registration number -> lookup key: letters + digits only, upper case (the same fold as LQPCLookup.regKey). */
export const regKey = s => String(s || "").normalize("NFKC").toUpperCase().replace(/[^0-9A-Zก-ฮ]/g, "");

/** @param {any} src @returns {{errors: string[], entries: any[]}} */
export function validate(src) {
  const errors = [], ids = new Set(), out = [];
  for (const e of (src && src.entries) || []) {
    const where = e && e.id ? e.id : "(no id)";
    const bad = m => errors.push(`${where}: ${m}`);
    if (!ID.test(e.id || "")) bad("id must look like TH-YYYY-NNNN");
    if (ids.has(e.id)) bad("duplicate id"); ids.add(e.id);
    if (!CATEGORIES.includes(e.category)) bad("category must be one of " + CATEGORIES.join(", "));
    if (!e.name_th && !e.name_en) bad("a product name (as printed) is required");
    if (!Array.isArray(e.issues) || !e.issues.length || e.issues.some(i => !ISSUES.includes(i))) bad("issues must be codes from " + ISSUES.join(", "));
    if (e.issues && e.issues.includes("contains") && !(Array.isArray(e.substances) && e.substances.length)) bad("'contains' needs substances");
    if (!DATE.test(e.source_date || "") || Number.isNaN(Date.parse(e.source_date))) bad("source_date must be YYYY-MM-DD");
    let u = null; try { u = new URL(e.source_url); } catch { /* checked below */ }
    if (!u || u.protocol !== "https:" || !ALLOWED_HOSTS.test(u.hostname)) bad("source_url must be an https Thai government page (fda.moph.go.th, oryor.com, *.go.th)");
    for (const [k, v] of Object.entries(e)) if (typeof v === "string" && v.length > 160) bad(`${k} is longer than 160 characters (facts only, no copied text)`);
    if (e.reg && regKey(e.reg).length < 6) bad("reg too short");
    out.push({ id: e.id, category: e.category, name_th: e.name_th || "", name_en: e.name_en || "", reg: e.reg || "", reg_key: regKey(e.reg), lot: e.lot || "",
      reg_note: e.reg_note || "", issues: e.issues, substances: e.substances || [], source_url: u ? u.href : "", source_date: e.source_date,
      reviewed: e.reviewed === true, verified: e.verified || null });
  }
  out.sort((a, b) => (a.source_date < b.source_date ? 1 : a.source_date > b.source_date ? -1 : a.id < b.id ? -1 : 1));
  return { errors, entries: out };
}

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TH_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** Does the page text carry the facts of the entry? Pure (page text in, verdict out); unit-tested. */
export function pageHasFacts(entry, pageText) {
  const t = String(pageText).normalize("NFC").replace(/[๐-๙]/g, d => String(d.charCodeAt(0) - 0x0e50));
  const digits = t.replace(/[^0-9]/g, "");
  const flat = t.replace(/\s+/g, " ");
  const regOk = !entry.reg || digits.includes(entry.reg.replace(/[^0-9]/g, ""));
  const tokens = [entry.name_en, entry.name_th].filter(Boolean).flatMap(n => n.split(/[\s()]+/)).filter(w => w.length >= 4 && !/^(ผลิตภัณฑ์เสริมอาหาร|ชนิดแคปซูล)$/.test(w));
  const nameOk = tokens.some(w => flat.toLowerCase().includes(w.toLowerCase()));
  const [y, m, d] = entry.source_date.split("-").map(Number), be = y + 543;
  const dateOk = [TH_MONTHS[m - 1], TH_ABBR[m - 1]].some(mn => new RegExp(`(^|\\D)0?${d}\\s*${mn.replace(/\./g, "\\.")}\\s*(${be}|${String(be).slice(2)})`).test(flat)) ||
    flat.includes(entry.source_date) || new RegExp(`(^|\\D)0?${d}/0?${m}/(${be}|${y})`).test(flat);
  return { regOk, nameOk, dateOk, ok: regOk && nameOk && dateOk };
}

async function main() {
  const a = process.argv.slice(2);
  const src = JSON.parse(readFileSync(SRC, "utf8"));
  const { errors, entries } = validate(src);
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const prevV = new Map(((prev && prev.entries) || []).map(e => [e.id, e.verified]));
  let keep = entries.map(e => ({ ...e, verified: e.verified || prevV.get(e.id) || null }));
  if (a.includes("--verify")) {
    const today = new Date().toISOString().slice(0, 10);
    const res = [];
    for (const e of keep) {
      let r = { ok: false, status: 0 };
      try {
        const resp = await fetch(e.source_url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "LENSIQ-alerts-verify/1 (facts check)" } });
        const html = await resp.text(); // Thai FDA sometimes answers 500 with the full article; the facts decide
        const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
        r = { ...pageHasFacts(e, text), status: resp.status };
      } catch (err) { r = { ok: false, status: 0, error: String(err && err.name) }; }
      console.log(`${r.ok ? "OK  " : "FAIL"} ${e.id} http ${r.status} reg ${r.regOk} name ${r.nameOk} date ${r.dateOk} ${e.source_url}`);
      res.push({ ...e, verified: r.ok ? { on: today, ok: true } : e.verified });
      if (!r.ok) console.error(`  ${e.id} not confirmed on its page: it is left out of the list`);
    }
    keep = res.filter(e => e.verified && e.verified.ok);
  } else keep = keep.filter(e => e.verified && e.verified.ok);
  const out = {
    schema: SCHEMA,
    updated: keep.reduce((m, e) => (e.source_date > m ? e.source_date : m), ""),
    built_from: "tools/pc-alerts-th.src.json (facts typed by hand from Thai FDA press releases; no text or images copied)",
    notice: { en: "Facts from Thai FDA (อย.) announcements, with the source page and date of each. Not a complete list.",
      th: "ข้อเท็จจริงจากประกาศของ อย. พร้อมหน้าที่มาและวันที่ ไม่ใช่รายการครบถ้วน", zh: "事实摘自泰国 FDA (อย.) 公告，附来源页面和日期。并非完整清单。" },
    issue_codes: ISSUES, categories: CATEGORIES,
    entries: keep
  };
  const text = JSON.stringify(out, null, 1) + "\n";
  if (a.includes("--check")) {
    if (!prev || JSON.stringify(prev, null, 1) + "\n" !== text) { console.error("DIFFERENT: vendor/pc-alerts/th.json does not match a fresh build"); process.exit(1); }
    console.log(`OK: vendor/pc-alerts/th.json matches (${keep.length} entries)`);
    return;
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`wrote vendor/pc-alerts/th.json: ${keep.length} of ${entries.length} entries (only entries confirmed on their page are written)`);
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main().catch(e => { console.error(String(e.message || e)); process.exit(1); });
