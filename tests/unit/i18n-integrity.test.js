"use strict";
// tests/unit/i18n-integrity.test.js — fast, Chrome-free integrity checks over every i18n/ dictionary (docs/I18N.md).
// The run-time translator (lensiq-i18n-rt.js) is keyed on the Thai text page scripts write, so editing a Thai sentence
// silently drops its English / Chinese translation. These tests make that fail in `npm run test:unit`:
//   1. en-rt-X / zh-rt-X and en-X / zh-X have IDENTICAL key sets (a key added to one language only fails)
//   2. every data-i18n / data-i18n-attr key used in a page has an English and a Chinese entry
//   3. no STALE Thai key: every run-time key's Thai text still occurs in some root *.js / *.html source
//      (camera / page dictionaries: each Thai phrase must occur verbatim; en-rt-fortune.js, whose keys are knowledge-base
//      labels assembled at run time — "สอง" + "ไม้เท้า" — may also be a concatenation of Thai runs found in the sources)
//   4. {placeholder} names of a template key appear in its translations; no Thai left in en / zh values
// The Chrome-based gates (tools/zh-coverage.mjs) still measure what is actually rendered.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const I18N = path.join(ROOT, "i18n");
const THAI = /[฀-๿]/;
const norm = s => String(s).replace(/\s+/g, " ").trim();

// run-time dictionaries that exist in one language only, with the reason (anything else must come in pairs)
const RT_ONE_LANGUAGE = {
  "rt-fortune": "en", // English whole-string KB labels; Chinese fortune text comes from zh-kb-*.js + the native zh composer
};
// en/zh values that deliberately quote Thai: a Thai plate / name / letter the user must type (the ฿ sign is not a letter)
const THAI_LETTER = /[ก-ฺเ-๎]/;
const THAI_VALUE_OK = new Set(["driver.s11", "numbers.ph.plate", "numbers.ph.name", "numbers.kalaNote.mon",
  "รูปแบบทะเบียนเช่น 1กข 2345 หรือ กข 1234 (ตัวอักษร 1–3 ตัว ตามด้วยเลข 1–4 หลัก)"]);

function load(file) {
  const w = {};
  w.window = w;
  vm.runInNewContext(fs.readFileSync(path.join(I18N, file), "utf8"), w, { filename: file });
  return w;
}

const files = fs.readdirSync(I18N).filter(f => /^(en|zh)-.+\.js$/.test(f)).sort();
const dicts = {}; // name -> { en?: {kind, map}, zh?: {kind, map} }
for (const f of files) {
  const [, lang, name] = /^(en|zh)-(.+)\.js$/.exec(f);
  const w = load(f);
  // a file may push both formats (e.g. en-studio.js: id keys + a few run-time phrases) — kept apart as name / "rt+"name
  if (w.LQI18N_Q) { const map = {}; for (const d of w.LQI18N_Q) Object.assign(map, d[lang] || {}); (dicts[name] = dicts[name] || {})[lang] = { kind: "id", map, file: f }; }
  if (w.LQI18N_RT) {
    const map = {}; for (const d of w.LQI18N_RT) for (const k of Object.keys(d)) if (k !== "@lang") map[k] = d[k];
    const key = w.LQI18N_Q ? name + "#rt" : name;
    (dicts[key] = dicts[key] || {})[lang] = { kind: "rt", map, file: f };
  }
  if (!w.LQI18N_Q && !w.LQI18N_RT) (dicts[name] = dicts[name] || {})[lang] = { kind: /^kb-/.test(name) ? "kb" : null, map: {}, file: f };
}

test("i18n/: every dictionary loads and declares a known format", () => {
  assert.ok(files.length >= 100, "found " + files.length);
  for (const [name, by] of Object.entries(dicts)) for (const [lang, d] of Object.entries(by))
    assert.ok(d.kind, `${lang}-${name}.js pushes neither LQI18N_Q nor LQI18N_RT and is not a kb-* file`);
});

test("en / zh dictionaries come in pairs with identical key sets", () => {
  const problems = [];
  for (const [name, by] of Object.entries(dicts)) {
    if (!by.en || !by.zh) {
      const only = by.en ? "en" : "zh";
      if (RT_ONE_LANGUAGE[name] !== only) problems.push(`${only}-${name}.js has no ${only === "en" ? "zh" : "en"} counterpart`);
      continue;
    }
    if (by.en.kind === "kb") continue; // knowledge-base text: structure differs per language (covered by fortune tests)
    const en = new Set(Object.keys(by.en.map)), zh = new Set(Object.keys(by.zh.map));
    const enOnly = [...en].filter(k => !zh.has(k)), zhOnly = [...zh].filter(k => !en.has(k));
    if (enOnly.length) problems.push(`${name}: ${enOnly.length} key(s) only in en, e.g. ${JSON.stringify(enOnly.slice(0, 3))}`);
    if (zhOnly.length) problems.push(`${name}: ${zhOnly.length} key(s) only in zh, e.g. ${JSON.stringify(zhOnly.slice(0, 3))}`);
  }
  assert.deepEqual(problems, []);
});

test("every data-i18n / data-i18n-attr key used by a page has an English and a Chinese entry", () => {
  const have = { en: new Set(), zh: new Set() };
  for (const by of Object.values(dicts)) for (const lang of ["en", "zh"]) if (by[lang] && by[lang].kind === "id") for (const k of Object.keys(by[lang].map)) have[lang].add(k);
  const missing = [];
  for (const h of fs.readdirSync(ROOT).filter(f => f.endsWith(".html"))) {
    const s = fs.readFileSync(path.join(ROOT, h), "utf8");
    const keys = [...s.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
    for (const m of s.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(";")) { const k = (pair.split(":")[1] || "").trim(); if (k) keys.push(k); }
    for (const k of keys) for (const lang of ["en", "zh"]) if (!have[lang].has(k)) missing.push(`${h}: ${lang} ${k}`);
  }
  assert.ok(have.en.size > 5000, "id keys: " + have.en.size);
  assert.deepEqual(missing, []);
});

// ---- stale Thai keys ------------------------------------------------------------------------------------------------
const SOURCES = fs.readdirSync(ROOT).filter(f => /\.(js|html)$/.test(f)).sort();
const srcText = SOURCES.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
// only the lines that contain Thai (whitespace collapsed per line) — same answers, a fraction of the bytes to scan
const thaiLines = srcText.split("\n").filter(l => THAI.test(l)).map(norm).join("\n");
// fast path: every space-joined Thai run of the sources and each contiguous run of its words; slow path: substring scan
const runs = new Set();
for (const r of thaiLines.match(/[฀-๿]+(?: [฀-๿]+)*/g) || []) {
  const w = r.split(" ");
  for (let i = 0; i < w.length; i++) for (let j = i + 1; j <= Math.min(w.length, i + 12); j++) runs.add(w.slice(i, j).join(" "));
}
const seen = new Map();
const corpus = { length: srcText.length, includes: s => { if (runs.has(s)) return true; let r = seen.get(s); if (r === undefined) seen.set(s, r = thaiLines.includes(s)); return r; } };
const RUN = /[฀-๿]+(?: [฀-๿]+)*/g;
const tokens = new Set((thaiLines.match(/[฀-๿]+/g) || []).filter(t => t.length >= 2));
const memo = new Map();
function concat(s) { // s is a concatenation of Thai runs that occur in the sources (each ≥ 2 chars)
  if (!s) return true;
  if (memo.has(s)) return memo.get(s);
  let ok = false;
  for (let i = s.length; i >= 2 && !ok; i--) if (tokens.has(s.slice(0, i)) && concat(s.slice(i))) ok = true;
  memo.set(s, ok);
  return ok;
}
const verbatim = frag => (frag.match(RUN) || []).every(r => corpus.includes(r) || r.split(" ").every(w => corpus.includes(w)));
const composed = frag => verbatim(frag) || (frag.match(/[฀-๿]+/g) || []).every(r => corpus.includes(r) || concat(r));

function staleKeys(name, map) {
  const used = name === "rt-fortune" ? composed : verbatim;
  return Object.keys(map).filter(k => !norm(k).split(/\{\w+\}/).filter(s => THAI.test(s)).every(used));
}

test("run-time dictionaries hold no stale Thai keys (the Thai text still occurs in a page or script)", () => {
  assert.ok(corpus.length > 1e6 && SOURCES.length > 80);
  const stale = [];
  let total = 0;
  for (const [name, by] of Object.entries(dicts)) for (const lang of ["en", "zh"]) {
    const d = by[lang];
    if (!d || d.kind !== "rt") continue;
    total += Object.keys(d.map).length;
    for (const k of staleKeys(name, d.map)) stale.push(`${d.file}: ${k}`);
  }
  assert.ok(total > 5000, "rt keys: " + total);
  assert.deepEqual(stale, [], "the Thai source text of these keys was edited or removed — update or delete the key in BOTH languages");
});

test("stale-key detector: catches an edited Thai phrase, accepts templates and assembled KB labels", () => {
  assert.deepEqual(staleKeys("rt-store", { "ข้อความที่ไม่มีอยู่ในหน้าใดเลยแน่นอน": "x" }).length, 1);
  assert.deepEqual(staleKeys("rt-store", { "ยังไม่มีโซน เลือก \"ลากโซน\" แล้วลากบนภาพ": "x" }), []); // `ยังไม่มีโซน${…} เลือก "ลากโซน"…`
  assert.deepEqual(staleKeys("rt-common", { "หยุด": "x" }), []);
  assert.deepEqual(staleKeys("rt-fortune", { "สองไม้เท้า (กลับหัว)": "x" }), []); // assembled from KB parts
  assert.deepEqual(staleKeys("rt-neuro", { "หยุดวิเคราะห์สด": "x" }).length, 1); // the button now says "หยุด"
});

test("template placeholders survive translation; en / zh values contain no Thai", () => {
  const problems = [];
  for (const by of Object.values(dicts)) for (const lang of ["en", "zh"]) {
    const d = by[lang];
    if (!d || d.kind === "kb") continue;
    for (const [k, v] of Object.entries(d.map)) {
      if (typeof v !== "string") continue;
      if (d.kind === "rt") {
        const need = new Set((k.match(/\{\w+\}/g) || []));
        for (const p of need) if (!v.includes(p)) problems.push(`${d.file}: ${JSON.stringify(k)} -> value lacks ${p}`);
      }
      if (THAI_LETTER.test(v) && !THAI_VALUE_OK.has(k))
        problems.push(`${d.file}: ${JSON.stringify(k).slice(0, 60)} -> Thai in the ${lang} value`);
    }
  }
  assert.deepEqual(problems.slice(0, 40), [], `${problems.length} problem(s)`);
});
