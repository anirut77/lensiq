#!/usr/bin/env node
// tools/accuracy-sync.mjs — docs/accuracy-figures.json is the single source of truth for every measured accuracy figure.
// Owner decision 223 (2026-11-21): customer pages and dictionaries no longer carry these figures. The `texts` of the JSON
// are kept as records of what the pages used to say and are rendered (placeholders filled from `figures`) into the
// technical sheets docs/tech-sheets/<product>-TH.md / -EN.md and the back-office data admin-measurements.js
// (tools/tech-sheets.mjs; admin.html tab "ผลการวัด"). The page check is now the inverse: no customer page or dictionary
// may carry a rendered figure text again.
//
//   node tools/accuracy-sync.mjs           regenerate the technical sheets and admin-measurements.js (idempotent)
//   node tools/accuracy-sync.mjs --check   exit 1 and list every problem (CI: tests/unit/accuracy-figures.test.js)
//
// Checked: every {placeholder} names a figure, every figure's `md` evidence still occurs in ACCURACY.md (whitespace
// collapsed), `value` equals `raw` rounded to the decimals of `value`, no `banned` phrase is in its files (entries with
// "visible": true look at visible text only: no HTML comments, scripts or styles, no JS comments), no customer page or
// dictionary carries a rendered figure text (texts marked "label": true are licence labels, not figures, decision 223-5),
// and every rendered figure text is in its technical sheets and in admin-measurements.js, which are current.
// --check also applies docs/claim-rules.json (checkClaims): classes of wording that claim more than was measured, and the
// status words that every page, card and one-pager must use for hall mode and Crowd (Sellable pack, 2026-11-11).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stale as sheetsStale, write as sheetsWrite, model as sheetsModel, DIR as SHEETS, ADMIN_DATA } from "./tech-sheets.mjs";

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LANGS = ["th", "en", "zh"];

const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const squash = s => String(s).replace(/\s+/g, " ").trim();

export function loadFigures(root = repo) { return JSON.parse(read(root, "docs/accuracy-figures.json")); }

/** "{name}" -> figures[name].value ; throws on an unknown name */
export function render(tpl, figures) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => {
    if (!figures[k]) throw new Error(`unknown figure {${k}}`);
    return String(figures[k].value);
  });
}

/** entries -> [{key, page, th, en, zh}] (an entry may list several keys that share one text) */
export function expand(doc) {
  const out = [];
  for (const t of doc.texts) for (const key of t.keys || [t.key]) {
    const page = t.page || key.split(".")[0], dict = t.dict || page; // page / dict: override when the key prefix is not the file name (md.* -> medicine.html, i18n/*-med.js)
    out.push({ key, page, dict, th: render(t.th, doc.figures), en: render(t.en, doc.figures), zh: render(t.zh, doc.figures) });
  }
  return out;
}

const elRe = key => new RegExp(`(<([a-z0-9]+)\\b[^>]*\\bdata-i18n="${reEsc(key)}"[^>]*>)([^<]*)(</\\2>)`, "g");
const dictRe = key => new RegExp(`("${reEsc(key)}"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*")`);

/** current Thai text of the element(s) with data-i18n=key in html -> string[] */
export function htmlTexts(html, key) { return [...html.matchAll(elRe(key))].map(m => unesc(m[3])); }
export function setHtml(html, key, text) { return html.replace(elRe(key), (m, open, tag, _old, close) => open + esc(text) + close); }
export function dictValue(js, key) { const m = js.match(dictRe(key)); return m ? JSON.parse(m[2]) : undefined; }
export function setDict(js, key, text, lang) {
  if (dictValue(js, key) !== undefined) return js.replace(dictRe(key), (m, head) => head + JSON.stringify(text));
  const open = new RegExp(`(\\{\\s*${lang}\\s*:\\s*\\{\\s*\\n)`);
  if (!open.test(js)) throw new Error(`no "{ ${lang}: {" block to insert ${key} into`);
  return js.replace(open, (m) => m + `  ${JSON.stringify(key)}: ${JSON.stringify(text)},\n`);
}

/** every problem as a string (empty = in sync) */
export function check(root = repo, doc = loadFigures(root)) {
  const errs = [];
  const md = squash(read(root, doc.source || "ACCURACY.md"));
  for (const [name, f] of Object.entries(doc.figures)) {
    if (!f.md || !md.includes(squash(f.md))) errs.push(`figure ${name}: evidence not found in ${doc.source}: ${f.md}`);
    if (typeof f.raw === "number") {
      const v = String(f.value).replace(/−/g, "-").replace(/^\+/, "");
      const dec = (v.split(".")[1] || "").length, want = Number(v);
      if (!Number.isFinite(want) || Math.abs(Number(f.raw.toFixed(dec)) - want) > 1e-9) errs.push(`figure ${name}: value ${f.value} is not raw ${f.raw} rounded to ${dec} decimals`);
    }
  }
  let rows;
  try { rows = expand(doc); } catch (e) { return errs.concat(String(e.message)); }
  const cache = new Map(), get = rel => { if (!cache.has(rel)) { try { cache.set(rel, read(root, rel)); } catch { cache.set(rel, null); } } return cache.get(rel); };
  const labels = new Set(doc.texts.filter(t => t.label).flatMap(t => t.keys || [t.key]));
  const figRows = rows.filter(r => !labels.has(r.key));
  // 223-5: the research-licence labels STAY on their pages, exactly as recorded (the full base guard, kept): every label
  // key is on its page with the recorded Thai, and the EN / ZH dictionaries carry the recorded values
  for (const r of rows.filter(r => labels.has(r.key))) {
    const html = get(`${r.page}.html`);
    const got = html == null ? [] : htmlTexts(html, r.key);
    if (!got.length) errs.push(`${r.page}.html: no element with data-i18n="${r.key}" (licence label, decision 223-5)`);
    got.forEach(g => { if (squash(g) !== squash(r.th)) errs.push(`${r.page}.html [${r.key}] licence label differs from docs/accuracy-figures.json`); });
    for (const lang of ["en", "zh"]) {
      const rel = `i18n/${lang}-${r.dict}.js`, js = get(rel), v = js == null ? undefined : dictValue(js, r.key);
      if (v === undefined) errs.push(`${rel}: missing "${r.key}" (licence label)`);
      else if (squash(v) !== squash(r[lang])) errs.push(`${rel} [${r.key}] licence label differs from docs/accuracy-figures.json`);
    }
  }
  // inverse (decision 223): no customer page or dictionary carries a rendered figure text
  const files = customerFiles(root);
  for (const rel of files) {
    const s = get(rel);
    if (s == null) continue;
    const hay = squash(rel.endsWith(".html") ? unesc(visible(s, rel).replace(/<[^>]+>/g, " ")) : visible(s, rel));
    for (const r of figRows) for (const lang of LANGS) {
      const t = squash(r[lang]), js = squash(JSON.stringify(r[lang]).slice(1, -1));
      if (t && (hay.includes(t) || hay.includes(js))) errs.push(`${rel}: carries the figure text of ${r.key} (${lang}); the figures live in ${SHEETS}/ and the admin tab only (decision 223)`);
    }
  }
  for (const b of doc.banned || []) for (const rel of b.files) {
    const s = get(rel);
    if (s != null && (b.visible ? visible(s, rel) : s).includes(b.text)) errs.push(`${rel}: stale text "${b.text}" (${b.why})`);
  }
  // the rendered texts are in the technical sheets (TH: th; EN: en + zh) and in the admin data
  let m;
  try { m = sheetsModel(root); } catch (e) { return errs.concat(`technical sheets: ${e.message}`); }
  const admin = get(ADMIN_DATA);
  for (const t of m.texts) {
    if (labels.has(t.key)) continue;
    const sheet = l => squash(get(`${SHEETS}/${t.product === "_platform" ? "README" : t.product + "-" + l}.md`) || "");
    if (!sheet("TH").includes(squash(t.th))) errs.push(`${SHEETS}: the TH sheet of ${t.product} misses ${t.key}`);
    for (const lang of ["en", "zh"]) if (!sheet("EN").includes(squash(t[lang]))) errs.push(`${SHEETS}: the EN sheet of ${t.product} misses ${t.key} (${lang})`);
    for (const lang of LANGS) if (!admin || !admin.includes(JSON.stringify(t[lang]))) errs.push(`${ADMIN_DATA}: misses ${t.key} (${lang})`);
  }
  for (const k of Object.keys(doc.figures)) if (!m.products.some(p => p.figures.includes(k)) && !m.orphanFigures.includes(k)) errs.push(`figure ${k}: in no technical sheet`);
  return errs.concat(sheetsStale(root).map(e => `${e} (run: node tools/accuracy-sync.mjs)`));
}

/** customer-facing files (as tests/unit/accuracy-removal-223.lib.js): root *.html / *.js except admin* and sw.js, and
 *  every i18n dictionary except i18n/*-admin.js */
export function customerFiles(root = repo) {
  const top = readdirSync(root).filter(f => /\.(html|js)$/.test(f) && !/^admin/.test(f) && f !== "sw.js").sort();
  const dict = readdirSync(join(root, "i18n")).filter(f => /\.js$/.test(f) && !/-admin\.js$/.test(f)).sort().map(f => "i18n/" + f);
  return top.concat(dict);
}
/** what a visitor can read: HTML without comments, scripts and styles; JS without comments (strings kept) */
export function visible(src, rel) {
  if (rel.endsWith(".html")) return src.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

export const RULES = "docs/claim-rules.json";
/** files matching a glob with "*" only in the base name ("i18n/en-*.js") */
function glob(root, pat) {
  const i = pat.lastIndexOf("/"), dir = i < 0 ? "" : pat.slice(0, i), base = pat.slice(i + 1);
  const re = new RegExp("^" + base.split("*").map(reEsc).join(".*") + "$");
  let names = [];
  try { names = readdirSync(join(root, dir || ".")); } catch { return []; }
  return names.filter(n => re.test(n)).sort().map(n => (dir ? dir + "/" + n : n));
}
/** every problem with docs/claim-rules.json as a string (empty = fine); the rules file is optional here, required by --check */
export function checkClaims(root = repo, rules = existsSync(join(root, RULES)) ? JSON.parse(read(root, RULES)) : null) {
  if (!rules) return [];
  const errs = [], cache = new Map();
  const get = rel => { if (!cache.has(rel)) { try { cache.set(rel, read(root, rel)); } catch { cache.set(rel, null); } } return cache.get(rel); };
  const skip = rules.exclude ? new RegExp(rules.exclude) : null;
  const scan = [...new Set((rules.scan || []).flatMap(g => glob(root, g)))].filter(f => !(skip && skip.test(f)));
  for (const o of rules.overclaims || []) {
    const re = new RegExp(o.re, "g" + (o.flags || "").replace(/g/g, ""));
    for (const rel of scan) {
      const s = get(rel) || "";
      for (const m of s.matchAll(re)) {
        const line = s.slice(0, m.index).split("\n").length;
        errs.push(`${rel}:${line}: overclaim [${o.id}] "${m[0]}" (${o.why})`);
      }
    }
  }
  for (const r of rules.mustSay || []) {
    for (const page of r.html || []) {
      const html = get(page), got = html == null ? [] : htmlTexts(html, r.key);
      if (!got.length) { errs.push(`${page}: no element with data-i18n="${r.key}" (rule ${r.id})`); continue; }
      for (const t of got) for (const w of r.th || []) if (!squash(t).includes(w)) errs.push(`${page} [${r.key}]: must say "${w}" (rule ${r.id})`);
    }
    for (const lang of ["en", "zh"]) {
      const rel = `i18n/${lang}-${r.dict}.js`, js = get(rel), v = js == null ? undefined : dictValue(js, r.key);
      if (v === undefined) { errs.push(`${rel}: missing "${r.key}" (rule ${r.id})`); continue; }
      for (const w of r[lang] || []) if (!v.includes(w)) errs.push(`${rel} [${r.key}]: must say "${w}" (rule ${r.id})`);
    }
  }
  for (const f of rules.files || []) {
    const s = get(f.file);
    if (s == null) { errs.push(`${f.file}: missing (rule ${f.id})`); continue; }
    const hit = new RegExp(f.re).test(s);
    if (f.not ? hit : !hit) errs.push(`${f.file}: rule ${f.id} ${f.not ? "must not match" : "must match"} /${f.re}/${f.why ? " (" + f.why + ")" : ""}`);
  }
  return errs;
}

/** decision 223: render the figures into the technical sheets and admin-measurements.js -> list of files changed.
 *  Pages and dictionaries are never written any more (their figure texts were removed). */
export function sync(root = repo) { return sheetsWrite(root); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const errs = check().concat(existsSync(join(repo, RULES)) ? checkClaims() : [`${RULES} is missing`]);
    if (errs.length) { console.error(errs.map(e => "  ✗ " + e).join("\n")); console.error(`${errs.length} accuracy-text problem(s) — run node tools/accuracy-sync.mjs`); process.exit(1); }
    console.log("figures: evidence and rounding OK, on no customer page, in the technical sheets and the admin data; claim rules (docs/claim-rules.json) pass");
  } else {
    const ch = sync();
    console.log(ch.length ? "updated:\n  " + ch.join("\n  ") : "technical sheets and admin data already current");
    const errs = check();
    if (errs.length) { console.error(errs.map(e => "  ✗ " + e).join("\n")); process.exit(1); }
  }
}
