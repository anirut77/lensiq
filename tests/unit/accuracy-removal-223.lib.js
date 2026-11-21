"use strict";
// tests/unit/accuracy-removal-223.lib.js — helpers for the owner decision 223 test set (accuracy-removal-223, locked in
// ~/LENSIQ-field/evals/accuracy-removal-223/ and evals-locks/accuracy-removal-223.sha256 BEFORE any product change).
// What is "customer-facing": every root *.html page except admin.html, every root *.js file except admin*.js and sw.js,
// and every i18n/*.js dictionary except i18n/*-admin.js. Text = what a visitor can read: HTML text nodes and the
// title / aria-label / placeholder / alt / content attributes (scripts, styles and comments removed), and every string
// or template literal of a script (espree tokens, so code comments never count).
const { readFileSync, readdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");
const espree = require(join(ROOT, "node_modules", "espree"));

const squash = s => String(s).replace(/\s+/g, " ").trim();
const unesc = s => String(s).replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const read = (f, root = ROOT) => readFileSync(join(root, f), "utf8");

/** customer-facing source files (repo-relative) */
function customerFiles(root = ROOT) {
  const top = readdirSync(root).filter(f => /\.(html|js)$/.test(f) && !/^admin/.test(f) && f !== "sw.js").sort();
  const dict = readdirSync(join(root, "i18n")).filter(f => /\.js$/.test(f) && !/-admin\.js$/.test(f)).sort().map(f => "i18n/" + f);
  return top.concat(dict);
}

/** HTML without scripts, styles and comments */
const htmlBody = src => src.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");

/** visible text runs of an HTML page (text between tags, plus readable attributes) */
function htmlTexts(src) {
  const s = htmlBody(src), out = [];
  for (const m of s.matchAll(/\s(?:title|aria-label|placeholder|alt|content)="([^"]*)"/g)) if (m[1].trim()) out.push(unesc(m[1]));
  for (const t of s.replace(/<[^>]+>/g, "\n").split(/\n+/)) { const v = squash(unesc(t)); if (v) out.push(v); }
  return out;
}

/** whole visible text of an HTML page as one string (tags become spaces) */
const htmlFlat = src => squash(unesc(htmlBody(src).replace(/<[^>]+>/g, " ")));

/** a JS string literal token -> its value (JSON rules; a single-quoted literal is re-quoted first) */
function decodeStr(v) {
  const body = v.slice(1, -1);
  const dq = v[0] === "'" ? body.replace(/\\'/g, "'").replace(/"/g, "\\\"") : body;
  try { return JSON.parse('"' + dq.replace(/\\x([0-9a-f]{2})/gi, "\\u00$1").replace(/\n/g, "\\n") + '"'); } catch { return body; }
}

/** every string / template literal of a script (decoded where possible) */
function jsStrings(src) {
  let toks;
  try { toks = espree.tokenize(src, { ecmaVersion: "latest", sourceType: "script" }); }
  catch { toks = espree.tokenize(src, { ecmaVersion: "latest", sourceType: "module" }); }
  const out = [];
  for (const t of toks) {
    if (t.type === "String") out.push(decodeStr(t.value));
    else if (t.type === "Template") out.push(t.value.replace(/^[`}]|(\$\{|`)$/g, ""));
  }
  return out;
}

/** text runs of any customer file */
const CACHE = new Map();
function textsOf(file, root = ROOT) {
  const src = read(file, root), id = root + "\u0000" + file;
  const hit = CACHE.get(id);
  if (hit && hit.src === src) return hit.texts;
  const texts = file.endsWith(".html") ? htmlTexts(src) : jsStrings(src);
  CACHE.set(id, { src, texts });
  return texts;
}

/** element texts: [{key, text}] for every element carrying data-i18n="key" (inner markup stripped) */
function elementTexts(html) {
  const s = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script\b[\s\S]*?<\/script>/gi, m => " ".repeat(m.length));
  const out = [];
  const re = /<([a-z][a-z0-9]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(s))) {
    const tag = m[1].toLowerCase(), start = m.index + m[0].length;
    if (/^(input|img|br|meta|link|hr)$/.test(tag) || m[0].endsWith("/>")) continue;
    const tre = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    tre.lastIndex = start;
    let depth = 1, t, end = s.length;
    while ((t = tre.exec(s))) { depth += t[1] ? -1 : 1; if (depth === 0) { end = t.index; break; } }
    out.push({ key: m[2], text: squash(unesc(s.slice(start, end).replace(/<[^>]+>/g, " "))) });
  }
  return out;
}

/** data-i18n keys used in an HTML page */
const keysOf = html => [...new Set([...html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map(m => m[1])
  .concat([...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap(m => m[1].split(/[;,]\s*/).map(x => x.split(":")[1]).filter(Boolean))))];

/** every page dictionary (window.LQI18N_Q pushes) merged: { en: {key: value}, zh: {key: value} } */
function dicts(root = ROOT) {
  const out = { en: {}, zh: {} };
  for (const f of readdirSync(join(root, "i18n")).filter(f => /^(en|zh)-.*\.js$/.test(f))) {
    const win = { LQI18N_Q: [], LQI18N_RT: [] };
    try { vm.runInNewContext(read("i18n/" + f, root), { window: win, document: undefined, console }); } catch { continue; }
    for (const p of win.LQI18N_Q) for (const l of ["en", "zh"]) if (p && p[l]) for (const [k, v] of Object.entries(p[l])) {
      (out[l][k] = out[l][k] || []).push({ file: "i18n/" + f, v: String(v) });
    }
  }
  return out;
}

/** first value of a key in a language (or undefined) */
const dval = (D, lang, key) => (D[lang][key] || [])[0] && D[lang][key][0].v;

/** scan: [{file, id, text}] of every banned pattern in customer text; allow = [{file, id, contains}] */
function scan(spec, root = ROOT, files = customerFiles(root)) {
  const pats = spec.banned.map(b => ({ id: b.id, re: new RegExp(b.re, b.flags || "") }));
  const skip = new Set(spec.excludeFiles.map(x => x.file));
  const hits = [];
  for (const f of files) {
    if (skip.has(f) || !existsSync(join(root, f))) continue;
    const ex = spec.excludeIds.filter(x => x.files.includes(f)).map(x => x.id);
    // 223-4: in a page, interval wording is allowed only inside a <details> whose <summary> is the plain fold line
    const folded = f.endsWith(".html") && spec.fold ? htmlTexts(foldOut(read(f, root), spec.fold.th)) : null;
    const all = textsOf(f, root);
    for (const p of pats) for (const t of (p.id === "ci" && folded ? folded : all)) {
      if (ex.includes(p.id) || !p.re.test(t)) continue;
      if (spec.allow.some(a => a.file === f && a.id === p.id && t.includes(a.contains))) continue;
      hits.push({ file: f, id: p.id, text: squash(t).slice(0, 200) });
    }
  }
  return hits;
}

/** the page with every <details> block whose <summary> holds the fold text cut out */
function foldOut(src, summary) {
  let out = src;
  const open = /<details\b[^>]*>\s*<summary\b[^>]*>/g;
  let m;
  const cuts = [];
  while ((m = open.exec(src))) {
    const sEnd = src.indexOf("</summary>", m.index);
    if (sEnd < 0 || !squash(unesc(src.slice(m.index, sEnd).replace(/<[^>]+>/g, " "))).includes(summary)) continue;
    let depth = 0, re = /<(\/?)details\b[^>]*>/g; re.lastIndex = m.index;
    let t, end = src.length;
    while ((t = re.exec(src))) { depth += t[1] ? -1 : 1; if (depth === 0) { end = t.index + t[0].length; break; } }
    cuts.push([m.index, end]);
  }
  for (const [a, b] of cuts.reverse()) out = out.slice(0, a) + out.slice(b);
  return out;
}

/** links to the removed accuracy sections: [{file, href}] */
function accuracyLinks(root = ROOT, files = customerFiles(root)) {
  const out = [];
  for (const f of files) {
    const src = read(f, root);
    for (const m of src.matchAll(/["'(]([a-z0-9-]*\.html)?#(accuracy|claims|crAcc|crClaims)\b["')]/g)) out.push({ file: f, href: m[0] });
  }
  return out;
}

/** sales / print documents handed to buyers */
function salesDocs(root = ROOT) {
  const docs = readdirSync(join(root, "docs")).filter(f => /^ONE-PAGER-.*\.md$/.test(f)).map(f => "docs/" + f);
  const s = readdirSync(join(root, "docs", "sales")).filter(f => /^(DECK|DEMO-SCRIPT|ONBOARDING)-.*\.md$/.test(f)).map(f => "docs/sales/" + f);
  const c = existsSync(join(root, "docs", "sales", "customer"))
    ? readdirSync(join(root, "docs", "sales", "customer")).filter(f => /\.md$/.test(f)).map(f => "docs/sales/customer/" + f) : [];
  return docs.concat(s, c).sort();
}

module.exports = { foldOut, ROOT, squash, unesc, read, customerFiles, htmlTexts, htmlFlat, jsStrings, textsOf, elementTexts, keysOf, dicts, dval, scan, accuracyLinks, salesDocs };
