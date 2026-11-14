"use strict";
// tests/unit/fortune-layout-caution.test.js — FIXED TEST SET, review round 2 of owner order 2026-11-14 Part A (finding F1).
// Locked (evals-locks/fortune-layout__caution.sha256, ~/LENSIQ-field/evals/fortune-layout/caution/) BEFORE the fix.
// F1: a caution / unfavourable sentence must never sit inside a closed "อ่านเพิ่มเติม" fold. The independent review found
// 11 / 2,160 synthetic readings (all Thai) where the composer had trimmed a caution lead's opening words, so the layout's
// whole-lead string match missed it and folded the paragraph.
// The fix is at the source: the composer marks every caution paragraph itself (section.caution[i] === true), and the layout
// (fortune-read.js planSection) never folds a marked paragraph; a section without marks is not folded at all.
// Ground truth here is independent of those marks and of the layout's code:
//   (a) every tail (a suffix after a space / comma, 14+ chars, 6+ for Chinese) of every caution lead the composer can use
//       (straight leads, natal leads, gentle caution leads) — the reviewer's tails.mjs method;
//   (b) fragments of the meanings (all areas except "advice") of every item the discipline marks unfavourable in the facts
//       (tone "caution", polarity "challenge", and in straight mode a label the tradition itself names as bad), in the
//       reading's language (Thai knowledge base, i18n/en-kb-*, i18n/zh-kb-*).
// Corpus: all 15 disciplines × TH / EN / ZH × gentle and straight, only fact sets that contain such an item, >= 2,000 readings.
// The reading wording is not touched (fortune-layout.test.js keeps checking that parts rejoin to the composer's paragraphs).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const RD = require("../../fortune-read.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");
const LANGS = ["th", "en", "zh"];

const flat = x => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === "object" ? Object.values(x).flatMap(flat) : typeof x === "string" ? [x] : []);
const leadsOf = l => [...new Set(flat(FA.straight.LEADS[l]).concat(flat((FA.straight.NATAL_LEADS || {})[l]), flat(FA._internal.cautionLeads(l))))]
  .map(s => s.replace(/[.。]$/, "")).filter(s => s.length >= 6);
function tailsOf(l) {
  const out = new Set(), min = l === "zh" ? 6 : 14, re = l === "zh" ? /[，,]/g : l === "en" ? /, | /g : / /g;
  for (const lead of leadsOf(l)) {
    if (lead.length >= min) out.add(lead);
    let m; re.lastIndex = 0;
    while ((m = re.exec(lead))) { const t = lead.slice(m.index + m[0].length); if (t.length >= min) out.add(t); }
  }
  return [...out];
}
// fragments of one meaning string, in the reading's language
function fragments(m, l) {
  m = String(m || "").trim();
  if (l === "zh") return m.split(/[，。；！？、]/).map(x => x.trim()).filter(x => x.length >= 8);
  if (l === "en") return m.split(/[,;:.!?]\s+|\s+(?:and|but|so)\s+/).map(x => x.trim()).filter(x => x.length >= 25);
  return m.split(/\s+/).filter(x => x.length >= 15);
}
// English matches end on a word boundary ("rather than rush" is not "rather than rushing to expand"); re-lock 2026-11-15 (1)
function has(text, q, l) {
  if (l !== "en") return text.includes(q);
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) if (!/[A-Za-z]/.test(text.charAt(i + q.length))) return true;
  return false;
}
const isCautionItem = (it, straight) => it.tone === "caution" || it.polarity === "challenge" || (straight && FA.straight.LABEL_NEG.test(String(it.label || "")));
function meaningsOf(domain, it, l) {
  const src = l === "en" ? FA.en.item(domain, it) : l === "zh" ? FA.zh.item(domain, it) : it;
  const ms = (src && src.meanings) || {};
  return Object.keys(ms).filter(k => k !== "advice").flatMap(k => [].concat(ms[k] || []));
}

let CORPUS = null;
async function corpus() {
  if (CORPUS) return CORPUS;
  const X = await exportTool();
  const out = [];
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const straight of [false, true]) {
    const r = X.lcg(5151 + X.DOMAINS.indexOf(d) * 11 + (straight ? 3 : 0) + LANGS.indexOf(lang) * 101);
    let got = 0;
    for (let i = 0; i < 400 && got < 24; i++) {
      let f; try { f = X.factsFor(d, i, r); } catch (e) { continue; }
      // engines that never mark a finding unfavourable (face, palm, siam si, feng shui, Western astrology, dream: see
      // docs/FORTUNE-HONEST-READINGS.md) get one real item of the fact set marked as caution, so their caution path is tested too
      if (!(f.items || []).some(it => isCautionItem(it, straight))) {
        const ok = it => it.kind !== "plain" && Object.keys(it.meanings || {}).some(m => m !== "advice");
        let k = (f.items || []).findIndex((it, j) => j > 0 && ok(it)); if (k < 0) k = (f.items || []).findIndex(ok);
        if (k < 0) continue;
        f = Object.assign({}, f, { items: f.items.map((it, j) => (j === k ? Object.assign({}, it, { tone: "caution", polarity: "challenge" }) : it)) });
      }
      const caut = (f.items || []).filter(it => isCautionItem(it, straight));
      if (!caut.length) continue;
      const res = FA.compose(f, { seed: 700 + i, lang, straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      got++;
      out.push({ d, lang, straight, res, frags: [...new Set(caut.flatMap(it => meaningsOf(f.domain || d, it, lang)).flatMap(m => fragments(m, lang)))] });
    }
  }
  CORPUS = out;
  return out;
}

test("F1 corpus: >= 2,000 readings with an unfavourable item, every discipline × TH / EN / ZH × gentle / straight", async () => {
  const C = await corpus();
  assert.ok(C.length >= 2000, "readings " + C.length);
  const X = await exportTool();
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const st of [false, true]) {
    const n = C.filter(x => x.d === d && x.lang === lang && x.straight === st).length;
    assert.ok(n >= 10, `${d} ${lang} ${st ? "straight" : "gentle"}: ${n} readings with a caution item`);
  }
});

test("F1: the composer marks caution paragraphs itself (section.caution, one flag per paragraph), for every composed reading", async () => {
  const C = await corpus();
  let marked = 0;
  for (const { d, lang, straight, res } of C) for (const s of res.sections) {
    assert.ok(Array.isArray(s.caution), `${d} ${lang} ${straight ? "S" : "G"} ${s.id}: no caution marks`);
    assert.equal(s.caution.length, s.paragraphs.length, `${d} ${lang} ${s.id}: one mark per paragraph`);
    marked += s.caution.filter(Boolean).length;
  }
  assert.ok(marked >= 1000, "marked caution paragraphs " + marked);
});

test("F1: no caution sentence inside a closed fold (lead tails and unfavourable-item meanings), 0 readings allowed", async () => {
  const C = await corpus();
  const tails = Object.fromEntries(LANGS.map(l => [l, tailsOf(l)]));
  const bad = [];
  let shownHits = 0, readings = 0;
  for (const { d, lang, straight, res, frags } of C) {
    let hit = false;
    for (const s of res.sections) {
      for (const x of RD.planSection(s, lang)) {
        const t = tails[lang].find(q => has(x.text, q, lang)) || frags.find(q => has(x.text, q, lang));
        if (!t) continue;
        if (x.visible) { shownHits++; continue; }
        hit = true;
        if (bad.length < 25) bad.push(`${d} ${lang} ${straight ? "straight" : "gentle"} ${s.id}: …${t.slice(0, 60)}`);
      }
    }
    if (hit) readings++;
  }
  assert.ok(shownHits >= 2000, "caution sentences found (shown) " + shownHits + " — the ground truth is not empty");
  assert.equal(readings, 0, readings + " readings with caution text folded:\n" + bad.join("\n"));
});

test("F1: a section without composer marks (AI text, an older caller) is never folded; marked paragraphs are never folded", () => {
  const paras = ["ภาพรวมช่วงนี้มั่นคง งานเดินหน้าได้ดี ผู้ใหญ่ให้การสนับสนุน และมีโอกาสได้เรียนรู้สิ่งใหม่จากคนรอบตัวอยู่เสมอ",
    "ช่วงนี้มีเรื่องที่ต้องระวังเรื่องเงิน ".repeat(8).trim(), "ข้อแนะนำทั่วไปคือพักผ่อนให้พอ ".repeat(8).trim()];
  for (const l of LANGS) {
    const none = RD.planSection({ id: "overview", paragraphs: paras }, l);
    assert.ok(none.every(x => x.visible), l + ": unmarked section fully shown");
    const marked = RD.planSection({ id: "overview", paragraphs: paras, caution: [false, true, false] }, l);
    assert.ok(marked.filter(x => x.para === 1).every(x => x.visible && x.caution), l + ": marked paragraph shown in full");
    assert.ok(marked.filter(x => x.para === 1).length === 1, l + ": marked paragraph not cut");
    assert.ok(marked.some(x => !x.visible), l + ": unmarked long text may fold");
    assert.equal(marked.filter(x => x.para === 0).map(x => x.text).join(RD.SEP[l]), paras[0]);
  }
  // marks that do not line up with the paragraphs (length differs) count as no marks: nothing folds
  assert.ok(RD.planSection({ id: "x", paragraphs: paras, caution: [true] }, "th").every(x => x.visible));
});

test("F1: the page layout finds a section's marks by id and paragraph text, and falls back to 'show all' on any mismatch", () => {
  const res = { lang: "th", sections: [{ id: "work", paragraphs: ["ก ข", "ค ง"], caution: [false, true] }, { id: "money", paragraphs: ["จ"], caution: [false] }] };
  assert.deepEqual(RD.sectionFlags(res, "work", ["ก ข", "ค ง"]), [false, true]);
  assert.equal(RD.sectionFlags(res, "work", ["ก ข"]), null, "paragraph count differs");
  assert.equal(RD.sectionFlags(res, "work", ["ก ข", "อื่น"]), null, "paragraph text differs");
  assert.equal(RD.sectionFlags(res, "love", ["x"]), null, "no such section");
  assert.equal(RD.sectionFlags({ sections: [{ id: "work", paragraphs: ["a"] }] }, "work", ["a"]), null, "no marks");
});
