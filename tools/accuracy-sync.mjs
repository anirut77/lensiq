#!/usr/bin/env node
// tools/accuracy-sync.mjs — render docs/accuracy-figures.json (the single source of truth for customer-facing accuracy
// figures) into the camera pages: the Thai text of every `data-i18n="<key>"` element in <page>.html and the matching
// entries of i18n/en-<page>.js and i18n/zh-<page>.js (the page is the key prefix: "driver.s4" -> driver.html).
//
//   node tools/accuracy-sync.mjs           rewrite the pages and dictionaries (idempotent)
//   node tools/accuracy-sync.mjs --check   exit 1 and list every mismatch (CI: tests/unit/accuracy-figures.test.js)
//
// Also checked: every {placeholder} names a figure, every figure's `md` evidence still occurs in ACCURACY.md (whitespace
// collapsed), `value` equals `raw` rounded to the decimals of `value`, and no `banned` stale phrase is left in its files.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    const page = key.split(".")[0];
    out.push({ key, page, th: render(t.th, doc.figures), en: render(t.en, doc.figures), zh: render(t.zh, doc.figures) });
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
  for (const r of rows) {
    const html = get(`${r.page}.html`);
    const got = html == null ? [] : htmlTexts(html, r.key);
    if (!got.length) errs.push(`${r.page}.html: no element with data-i18n="${r.key}"`);
    got.forEach(g => { if (squash(g) !== squash(r.th)) errs.push(`${r.page}.html [${r.key}] differs from docs/accuracy-figures.json`); });
    for (const lang of ["en", "zh"]) {
      const rel = `i18n/${lang}-${r.page}.js`, js = get(rel), v = js == null ? undefined : dictValue(js, r.key);
      if (v === undefined) errs.push(`${rel}: missing "${r.key}"`);
      else if (squash(v) !== squash(r[lang])) errs.push(`${rel} [${r.key}] differs from docs/accuracy-figures.json`);
    }
  }
  for (const b of doc.banned || []) for (const rel of b.files) {
    const s = get(rel);
    if (s != null && s.includes(b.text)) errs.push(`${rel}: stale text "${b.text}" (${b.why})`);
  }
  return errs;
}

/** rewrite pages + dictionaries -> list of files changed */
export function sync(root = repo, doc = loadFigures(root)) {
  const files = new Map(), get = rel => { if (!files.has(rel)) files.set(rel, { orig: read(root, rel) }); const f = files.get(rel); return f.now ?? f.orig; };
  const put = (rel, s) => { get(rel); files.get(rel).now = s; };
  for (const r of expand(doc)) {
    put(`${r.page}.html`, setHtml(get(`${r.page}.html`), r.key, r.th));
    for (const lang of ["en", "zh"]) put(`i18n/${lang}-${r.page}.js`, setDict(get(`i18n/${lang}-${r.page}.js`), r.key, r[lang], lang));
  }
  const changed = [];
  for (const [rel, f] of files) if (f.now != null && f.now !== f.orig) { writeFileSync(join(root, rel), f.now); changed.push(rel); }
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const errs = check();
    if (errs.length) { console.error(errs.map(e => "  ✗ " + e).join("\n")); console.error(`${errs.length} accuracy-text problem(s) — run node tools/accuracy-sync.mjs`); process.exit(1); }
    console.log("accuracy texts in sync with docs/accuracy-figures.json");
  } else {
    const ch = sync();
    console.log(ch.length ? "updated:\n  " + ch.join("\n  ") : "nothing to update");
    const errs = check();
    if (errs.length) { console.error(errs.map(e => "  ✗ " + e).join("\n")); process.exit(1); }
  }
}
