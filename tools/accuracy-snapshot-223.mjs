#!/usr/bin/env node
// tools/accuracy-snapshot-223.mjs — owner decision 223 (2026-11-21): records, BEFORE any page changes, every accuracy
// figure, source tag, status legend, status reason and internal readiness sentence that the customer-facing pages and
// dictionaries show, so that nothing is lost when they move to the technical sheets (docs/tech-sheets/) and the admin
// "ผลการวัด" tab. Run once on the base commit; the output is locked with the accuracy-removal-223 test set.
//   node tools/accuracy-snapshot-223.mjs            write docs/tech-sheets/ORIGINAL-FIGURES-223.json
//   node tools/accuracy-snapshot-223.mjs --stdout   print it instead
// The JSON is the source the tech sheets and the admin data are generated from (tools/tech-sheets.mjs); entries are never
// edited by hand. tests/unit/accuracy-removal-223.test.js checks that every entry is in both places, verbatim.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const L = require(join(repo, "tests", "unit", "accuracy-removal-223.lib.js"));
const spec = JSON.parse(readFileSync(join(repo, "tests", "unit", "accuracy-removal-223.spec.json"), "utf8"));
const D = require(join(repo, "tools", "cat-data.cjs"));
const FIG = JSON.parse(readFileSync(join(repo, "docs", "accuracy-figures.json"), "utf8"));

// figure-ish text: every banned pattern except the plain "Beta" badge word, plus a percentage that is not a price term
const PATS = spec.banned.filter(b => b.id !== "beta").map(b => new RegExp(b.re, b.flags || ""));
const PCT = /\d\s?%/, PRICE = /VAT|บาท|฿|คืน|ส่วนลด 15|ส่วนลด|refund|discount|退款|折扣|增值税/i;
const fortune = new Set(D.CATEGORIES.find(c => c.slug === "fortune").pages.map(p => p + ".html"));
const allowed = (file, t) => spec.allow.some(a => a.file === file && t.includes(a.contains)) ||
  spec.excludeFiles.some(x => x.file === file);
const isFig = (file, t) => !allowed(file, t) && (PATS.some(re => re.test(t)) || (PCT.test(t) && !PRICE.test(t) && !fortune.has(file) && !/fortune|kb-|insights/.test(file)));

/** product sheet of a page / key */
export function productOf(page, key = "", text = "") {
  const p = String(page || "").replace(/\.html$/, ""), k = String(key || "");
  const claimPage = id => Object.keys(D.PAGES).find(x => (D.PAGES[x].claims || []).includes(id));
  const reasonPage = id => Object.keys(D.PAGES).find(x => D.PAGES[x].why === id);
  if (k.startsWith("cat.c.")) return productOf(claimPage(k.slice(6)) || "", "", text);
  if (k.startsWith("cat.r.")) return productOf(reasonPage(k.slice(6)) || "", "", text);
  if (k === "pd.h.cl3") return "attendance";
  if (k.startsWith("cr.s.") || /^creative/.test(p)) return "creative";
  const byPage = {
    crowd: "crowd", gate: "gate", parking: "gate", village: "gate", "gate-kit": "gate", exam: "exam", "exam-lab": "exam", "exam-hall": "exam",
    "exam-dashboard": "exam", "lensiq-exam": "exam", attendance: "attendance", medicine: "product-check", "lensiq-pc-advert": "product-check",
    "lensiq-pc-travel": "product-check", nutrition: "nutrition", studio: "studio", photobooth: "studio", converter: "studio", omr: "omr",
    tryon: "tryon", store: "store", retail: "store", booth: "booth", queue: "zones", tables: "zones", bays: "zones", afterhours: "zones",
    "lensiq-zonecam": "zones", checkout: "checkout", driver: "driver", qc: "qc", hr: "hr", interview: "hr", "case-review": "hr",
    signage: "research-models", neuro: "research-models", teamface: "research-models", customers: "research-models", insights: "store"
  };
  if (byPage[p]) return byPage[p];
  const byKey = [[/^cr\./, "crowd"], [/^(gate|gk|pk|vg)\./, "gate"], [/^exam\./, "exam"], [/^attendance\./, "attendance"], [/^md\./, "product-check"],
    [/^nut\./, "nutrition"], [/^(studio|photobooth|converter)\./, "studio"], [/^omr\./, "omr"], [/^to\./, "tryon"], [/^(store|pd\.r)\./, "store"],
    [/^booth\./, "booth"], [/^(zc|zq|zt|za)\./, "zones"], [/^checkout\./, "checkout"], [/^driver\./, "driver"], [/^qc\./, "qc"],
    [/^(pd\.h|iv|hr)\./, "hr"], [/^(signage|neuro|customers|teamface)\./, "research-models"], [/^iq\./, "store"]];
  for (const [re, prod] of byKey) if (re.test(k)) return prod;
  // the cameras.html directory and table: by what the line is about
  const byText = [[/MOT17|PETS|ร้าน|store|门店|进店|ประตู/i, "store"], [/LFW|CASIA|เช็คชื่อ|ลงเวลา|attendance|考勤|签到/i, "attendance"],
    [/UTKFace|HaGRID|FER-2013|อายุ|age|年龄|สีหน้า|expression|表情|มือ|hand/i, "research-models"], [/CEW|คนขับ|driver|驾驶/i, "driver"],
    [/ขวด|bottle|瓶/i, "qc"], [/บาร์โค้ด|barcode|条码/i, "checkout"], [/ป้ายทะเบียน|plate|车牌/i, "gate"], [/สอบ|exam|考/i, "exam"],
    [/นับคน|crowd|人群|ฝูงชน/i, "crowd"]];
  for (const [re, prod] of byText) if (re.test(text)) return prod;
  return "_platform";
}

export function snapshot() {
  const dict = L.dicts();
  const entries = [], seen = new Set();
  const add = e => { const id = [e.file, e.key || "", e.th || "", e.en || "", e.zh || "", e.text || ""].join("\u0001"); if (seen.has(id)) return; seen.add(id); entries.push(e); };
  const files = L.customerFiles();
  const htmlKeys = new Set();
  // 1. HTML pages: per data-i18n element (Thai markup) with its EN / ZH dictionary values; then loose text runs
  for (const f of files.filter(f => f.endsWith(".html"))) {
    const src = L.read(f);
    const inEl = [];
    for (const { key, text } of L.elementTexts(src)) {
      const en = L.dval(dict, "en", key), zh = L.dval(dict, "zh", key);
      if (!(isFig(f, text) || (en && isFig(f, en)) || (zh && isFig(f, zh)))) continue;
      htmlKeys.add(key); inEl.push(text);
      add({ file: f, key, product: productOf(f, key, text + " " + (en || "")), th: text, en: en || "", zh: zh || "" });
    }
    for (const t of L.htmlTexts(src)) if (isFig(f, t) && !inEl.some(x => x.includes(t))) add({ file: f, key: "", product: productOf(f, "", t), th: t, en: "", zh: "" });
  }
  // 2. dictionary values not shown through a page element (run-time keys), and run-time (rt) dictionaries
  for (const lang of ["en", "zh"]) for (const [key, vals] of Object.entries(dict[lang])) {
    if (htmlKeys.has(key) || key.startsWith("cat.") || key.startsWith("adm")) continue;
    for (const { file, v } of vals) if (isFig(file, v)) {
      const other = lang === "en" ? "zh" : "en";
      add({ file, key, product: productOf("", key, v), th: "", [lang]: v, [other]: L.dval(dict, other, key) || "" });
    }
  }
  // 3. scripts (Thai text the code writes, run-time dictionaries): every figure string literal
  for (const f of files.filter(f => f.endsWith(".js") && !/^i18n\/(en|zh)-(?!rt-)/.test(f))) {
    const page = f.replace(/^i18n\/(en|zh)-rt-/, "").replace(/\.js$/, "");
    for (const t of L.jsStrings(L.read(f))) if (t.length > 3 && isFig(f, t) && !/^[\s{}()<>/="'`a-z0-9._:-]*$/i.test(t)) add({ file: f, key: "", product: productOf(page, "", t), text: t });
  }
  // 4. tools/cat-data.cjs: every category-card accuracy line, status reason, status and source label and their definitions
  const cat = [];
  for (const [id, c] of Object.entries(D.CLAIMS)) cat.push({ key: "cat.c." + id, src: c.src, ref: c.ref, th: c.th, en: c.en, zh: c.zh });
  for (const [id, c] of Object.entries(D.REASONS)) cat.push({ key: "cat.r." + id, th: c.th, en: c.en, zh: c.zh });
  for (const [id, c] of Object.entries(D.STATUS)) cat.push({ key: "cat.st." + id, th: c.th, en: c.en, zh: c.zh });
  for (const [id, c] of Object.entries(D.STATUS_DEF)) cat.push({ key: "cat.std." + id, th: c.th, en: c.en, zh: c.zh });
  for (const [slug, defs] of Object.entries(D.STATUS_DEF_CAT || {})) for (const [id, c] of Object.entries(defs)) cat.push({ key: `cat.std.${id}.${slug}`, th: c.th, en: c.en, zh: c.zh });
  for (const [id, c] of Object.entries(D.SOURCE)) cat.push({ key: "cat.src." + id, th: c.th, en: c.en, zh: c.zh });
  for (const k of ["cat.legend.h", "cat.src.h", "cat.src.d", "cat.acc.h", "cat.why", "cat.method"]) {
    const en = L.dval(dict, "en", k), zh = L.dval(dict, "zh", k), th = (L.elementTexts(L.read("cat-security.html")).find(e => e.key === k) || {}).text;
    cat.push({ key: k, th: th || "", en: en || "", zh: zh || "" });
  }
  // 5. sales and print documents handed to buyers (one-pagers, decks, demo scripts, onboarding): every figure line
  const docProd = f => { const m = f.match(/(ATTENDANCE|CROWD|EVENTS|EXAM|FORTUNE|GATE|HR|RETAIL)/); return m ? ({ ATTENDANCE: "attendance", CROWD: "crowd",
    EVENTS: "booth", EXAM: "exam", FORTUNE: "_platform", GATE: "gate", HR: "hr", RETAIL: "store" })[m[1]] : "_platform"; };
  for (const f of L.salesDocs()) for (const line of L.read(f).split("\n")) {
    const t = line.trim();
    if (t && isFig(f, t)) add({ file: f, key: "", product: docProd(f), text: t });
  }
  for (const e of cat) e.product = e.key.startsWith("cat.c.") || e.key.startsWith("cat.r.") ? productOf("", e.key, e.en) : "_platform";
  const pages = Object.fromEntries(Object.entries(D.PAGES).map(([p, v]) => [p, { st: v.st, why: v.why, claims: v.claims }]));
  return {
    $comment: "Owner decision 223: every accuracy figure, source tag, status legend, status reason and internal readiness sentence shown to customers at base " +
      "(origin/main before the change), recorded by tools/accuracy-snapshot-223.mjs. Never edited by hand. Source of docs/tech-sheets/*.md and admin-measurements.js.",
    entries, catData: cat, pageStatus: pages, accuracyFigures: FIG.figures
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = JSON.stringify(snapshot(), null, 1) + "\n";
  if (process.argv.includes("--stdout")) process.stdout.write(out);
  else {
    mkdirSync(join(repo, "docs", "tech-sheets"), { recursive: true });
    writeFileSync(join(repo, "docs", "tech-sheets", "ORIGINAL-FIGURES-223.json"), out);
    const s = JSON.parse(out);
    console.log(`snapshot: ${s.entries.length} page / dictionary / script entries, ${s.catData.length} category-data entries, ${Object.keys(s.accuracyFigures).length} figures`);
  }
}
