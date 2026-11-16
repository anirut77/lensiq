"use strict";
// tests/unit/fortune-paid-provenance.test.js — FIXED TEST SET, round-2 review of fortune-paid at ce6dc1c (NOT OK): F1 was fixed
// only for known wordings. This is the gate by PROVENANCE, not by word lists. Locked (evals-locks/fortune-paid.sha256,
// append-only re-lock (3)) BEFORE the fix. The earlier fortune-paid tests stay as extra checks, unchanged.
//   P1  no paid part holds text derived from a guidance field of the facts: every item's advice meaning, every meaning of a
//       feng-shui placement / direction item (Eight Mansions directions dir.*, measured directions rec.*, floor-plan rooms room.*,
//       room photos photo.*, the year / month flying stars year.* / month.*, and the kua number's direction overview), the
//       extras (lucky colours, directions, energy words, tips) and the improvement plan. The field list is written here from the
//       engines' data (fengshui.js item ids), independently of any mark the composer or fortune-paid.js sets.
//   P2  no paid part comes from a caution-marked paragraph (section.caution), and no paid part holds text from an item the data
//       tags as restraining (tag "restrain", added by Team A on fortune-a; an item with tone "caution" / polarity "challenge"
//       counts the same). Where no item carries the tag yet, the caution half still applies.
//   P3  the composer records guidance by provenance: section.guidance marks every paragraph that holds such text (checked with
//       the same ground truth), and with the switch off nothing changes (same object; the layout ignores the mark).
// Corpus: all 15 disciplines × TH / EN / ZH × gentle and straight, 25 readings per cell (2,250), seeds new to this file.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const RD = require("../../fortune-read.js");
const P = require("../../fortune-paid.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");
const LANGS = ["th", "en", "zh"];

const PLACEMENT = /^(?:dir|rec|room|photo|year|month)\./; // feng-shui items that are placement / direction guidance as a whole
const itemOf = (dom, it, l) => { try { return (l === "en" ? FA.en.item(dom, it) : l === "zh" ? FA.zh.item(dom, it) : it) || it; } catch (e) { return it; } };
const list = x => (Array.isArray(x) ? x : x == null ? [] : [x]).flatMap(v => (Array.isArray(v) ? v : [v])).map(String);
function guidanceSources(f, l) {
  const dom = f.domain, out = [];
  for (const it of f.items || []) {
    const ms = (itemOf(dom, it, l) || {}).meanings || {};
    if (dom === "fengshui" && PLACEMENT.test(String(it.id || ""))) { for (const k of Object.keys(ms)) out.push(...list(ms[k])); continue; }
    if (dom === "fengshui" && /^kua\./.test(String(it.id || ""))) out.push(...list(ms.overview));
    out.push(...list(ms.advice));
  }
  const ex = f.extras || {};
  for (const k of ["luckyColors", "directions", "energyWords", "tips"]) out.push(...list(ex[k]));
  return out;
}
const restrainSources = (f, l, straight) => (f.items || []).filter(it => (it.tags || []).includes("restrain") || it.tone === "caution" || it.polarity === "challenge" ||
  (straight && FA.straight.LABEL_NEG.test(String(it.label || "")))).flatMap(it => Object.values((itemOf(f.domain, it, l) || {}).meanings || {}).flatMap(list));
function fragments(m, l) {
  m = String(m || "").trim();
  if (l === "zh") return m.split(/[，。；！？、：:]/).map(x => x.trim()).filter(x => x.length >= 8);
  if (l === "en") return m.split(/[,;:.!?]\s+|\s+(?:and|but|so|or)\s+/).map(x => x.trim().toLowerCase()).filter(x => x.length >= 25);
  return m.split(/\s+/).filter(x => x.length >= 14);
}
const has = (t, q, l) => (l === "en" ? String(t).toLowerCase().includes(q) : String(t).includes(q));

let CORPUS = null;
async function corpus() {
  if (CORPUS) return CORPUS;
  const X = await exportTool();
  const out = [];
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const straight of [false, true]) {
    const r = X.lcg(70707 + X.DOMAINS.indexOf(d) * 41 + (straight ? 13 : 0) + LANGS.indexOf(lang) * 709);
    let got = 0;
    for (let i = 0; i < 300 && got < 25; i++) {
      let f; try { f = X.factsFor(d, i + 5000, r); } catch (e) { continue; }
      const res = FA.compose(f, { seed: 52000 + i * 11, lang, straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      got++;
      const g = [...new Set(guidanceSources(f, lang).concat(((res.plan && res.plan.items) || []).map(x => String(x.t || ""))).flatMap(m => fragments(m, lang)))];
      const c = [...new Set(restrainSources(f, lang, straight).flatMap(m => fragments(m, lang)))];
      out.push({ d, lang, straight, res, g, c, restrainTagged: (f.items || []).some(it => (it.tags || []).includes("restrain")) });
    }
  }
  CORPUS = out;
  return out;
}
const splitOn = x => {
  const o = globalThis.LENSIQ_FORTUNE_PAID; globalThis.LENSIQ_FORTUNE_PAID = true;
  try { return P.split(x.res, { lang: x.lang, straight: x.straight }); } finally { globalThis.LENSIQ_FORTUNE_PAID = o; }
};

test("provenance corpus: >= 2,000 readings, every discipline × TH / EN / ZH × gentle / straight; ground truth not empty; paid depth exists", async () => {
  const C = await corpus();
  assert.ok(C.length >= 2000, "readings " + C.length);
  const X = await exportTool();
  for (const d of X.DOMAINS) for (const l of LANGS) for (const st of [false, true]) {
    assert.ok(C.filter(x => x.d === d && x.lang === l && x.straight === st).length >= 10, `${d} ${l} ${st}`);
  }
  assert.ok(C.filter(x => x.g.length).length >= C.length * 0.9, "guidance sources found in most readings");
  const withPaid = C.filter(x => splitOn(x).groups.some(g => g.paid.length)).length;
  assert.ok(withPaid >= C.length * 0.3, `readings with paid depth ${withPaid}/${C.length} (the gate is not met by selling nothing)`);
  console.log(`# provenance corpus ${C.length}, with paid depth ${withPaid}, restrain-tagged readings ${C.filter(x => x.restrainTagged).length}`);
});

test("P1: 0 paid parts hold text from a guidance field (advice, placement / direction items, extras, plan), every group", async () => {
  const C = await corpus();
  const bad = []; let readings = 0, checked = 0;
  for (const x of C) {
    let any = false;
    for (const g of splitOn(x).groups) for (const t of g.paid) {
      checked++;
      const q = x.g.find(q => has(t, q, x.lang));
      if (q) { any = true; if (bad.length < 30) bad.push(`${x.d} ${x.lang} ${x.straight ? "S" : "G"} ${g.id} […${q.slice(0, 40)}] ${t.slice(0, 100)}`); }
    }
    if (any) readings++;
  }
  assert.ok(checked >= 1000, "paid parts checked " + checked);
  assert.equal(readings, 0, readings + " readings with guidance-field text in paid parts:\n" + bad.join("\n"));
});

test("P2: 0 paid parts from a caution-marked paragraph, 0 paid parts with text of a restraining / caution item", async () => {
  const C = await corpus();
  const bad = []; let readings = 0;
  for (const x of C) {
    const sp = splitOn(x);
    let any = false;
    x.res.sections.forEach((s, k) => {
      const parts = RD.planSection(s, x.lang);
      const note = m => { any = true; if (bad.length < 30) bad.push(`${x.d} ${x.lang} ${s.id}: ${m}`); };
      for (const p of parts) if (s.caution && s.caution[p.para] && sp.groups[k].paid.includes(p.text)) note("caution-marked paragraph paid");
      for (const t of sp.groups[k].paid) { const q = x.c.find(q => has(t, q, x.lang)); if (q) note(`[…${q.slice(0, 40)}] ${t.slice(0, 100)}`); }
    });
    if (any) readings++;
  }
  assert.equal(readings, 0, readings + " readings with caution / restraining text in paid parts:\n" + bad.join("\n"));
});

test("P3: the composer's section.guidance marks every paragraph that holds guidance-field text; off = same object", async () => {
  const C = await corpus();
  const bad = [];
  for (const x of C) for (const s of x.res.sections) {
    assert.ok(Array.isArray(s.guidance) && s.guidance.length === s.paragraphs.length, `${x.d} ${x.lang} ${s.id}: guidance marks`);
    s.paragraphs.forEach((p, i) => {
      const q = x.g.find(q => has(p, q, x.lang));
      if (q && !s.guidance[i] && bad.length < 20) bad.push(`${x.d} ${x.lang} ${s.id}[${i}] not marked: …${q.slice(0, 50)}`);
    });
  }
  assert.equal(bad.length, 0, "paragraphs with guidance-field text not marked:\n" + bad.join("\n"));
  for (const x of C.slice(0, 200)) assert.equal(P.apply(x.res, { lang: x.lang }), x.res, "off: same object");
});
