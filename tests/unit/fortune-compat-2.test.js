"use strict";
// tests/unit/fortune-compat-2.test.js — FIXED TEST SET, Compatibility review round 1 (independent review of 5ba333b: NOT OK).
// Written and locked (~/LENSIQ-field/evals/fortune-compat/, evals-locks/fortune-compat.sha256) BEFORE the fixes.
// Browser half of D2: tests/e2e/fortune-compat-crisis.e2e.mjs.
//   RE-LOCK 2026-11-16 (4), owner decision 72: every cell needs two independent sources (a published text or established
//       reference plus one more), disagreements recorded and resolved in the open. Yoni: same animal 4 and the 7 sworn-enemy
//       pairs 0 are backed twice (B.V. Raman, Muhurtha or Electional Astrology, pp. 82-84, with onlinejyotish.com / aaps.space);
//       the friendly list has one source only and Monkey-Cat is disputed (Raman: hostile, aaps.space: friendly), so every other
//       pair is 2. Gana is removed (its mixed cells have no two agreeing sources); Ashtakoota is out of 30 and the page says
//       why in TH / EN / ZH. The saravali (CC BY-SA) table is gone.
//   D1  licence: the Yoni table is derived from the classical rule in non-AGPL sources, not copied from PyJHora (AGPL):
//       same animal 4; the 7 sworn-enemy pairs 0 (onlinejyotish.com yoni-kootam); the friendly pairs 3 (aaps.space
//       yoni-matching, Sheep = Goat); every other pair 2 (neutral: no hostile list in those sources); symmetric. The old
//       PyJHora rows are gone from compat.js. COMPAT-SOURCES.md cites both pages, documents the derivation, credits saravali
//       (CC BY-SA 4.0) for the Gana matrix and flags CC BY-SA data for an owner / legal check.
//   D2  static half: the nickname field accepts at least 60 characters, the year field is numeric (inputmode) with no
//       maxlength under 60, the crisis check runs on input events and on every field, nicknames have stable ids.
//   D3  no line repeats word for word in two sections of the same report (pair and group, free and full, TH / EN / ZH):
//       each signal is said once, in its own category.
//   D4  pair mode with business partners carries the work-use line (TH / EN / ZH); a couple does not.
//   D5  the missing-birth-time note says the Moon may be off by about ±7° (not ±6°).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const LANGS = ["th", "en", "zh"];
const load = () => require(path.join(ROOT, "compat.js"));
let AE = null;
function astronomy() {
  if (AE) return AE;
  const ctx = {}; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read("vendor/astronomy-engine/astronomy.browser.min.js"), ctx);
  return (AE = ctx.Astronomy);
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function birth(r, withTime) {
  const y = 1950 + Math.floor(r() * 58), m = 1 + Math.floor(r() * 12), d = 1 + Math.floor(r() * 28);
  return { y, m, d, time: withTime ? { h: Math.floor(r() * 24), mi: Math.floor(r() * 60) } : null, tz: 7 };
}

/* ---------------- D1 ---------------- */
// animals: 0 Horse 1 Elephant 2 Sheep/Goat 3 Serpent 4 Dog 5 Cat 6 Rat/Mouse 7 Cow 8 Buffalo 9 Tiger 10 Deer 11 Monkey 12 Mongoose 13 Lion
const SWORN = [[0, 8], [1, 13], [2, 11], [3, 12], [4, 10], [5, 6], [7, 9]];
const FRIENDLY = [[0, 3], [0, 10], [0, 11], [1, 2], [1, 3], [1, 8], [1, 11], [2, 7], [2, 8], [2, 12], [5, 10], [5, 11], [7, 8], [7, 10], [11, 12]];
test("D1 Yoni: every one of the 196 cells follows the documented rule; no PyJHora rows in compat.js", () => {
  const V = load().vedic;
  const has = (L, a, b) => L.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
  for (let a = 0; a < 14; a++) for (let b = 0; b < 14; b++) {
    const want = a === b ? 4 : has(SWORN, a, b) ? 0 : 2; // re-lock (4): the friendly list has one source only
    assert.equal(V.yoniScore(a, b), want, `yoni ${a}-${b}`);
  }
  assert.deepEqual(V.YONI_OF, [0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1], "animal per nakshatra (onlinejyotish.com)");
  const src = read("compat.js");
  for (const row of ["4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 1, 3, 2, 1", "2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0", "1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4"]) {
    assert.ok(!src.replace(/\s+/g, " ").includes(row), "old PyJHora row still in compat.js: " + row);
  }
  const doc = read("docs/COMPAT-SOURCES.md");
  assert.match(doc, /onlinejyotish\.com\/articles\/marriage-matching\/english\/yoni-kootam\.php/);
  assert.match(doc, /aaps\.space\/blog\/yoni-matching-and-sexual-compatibility/);
  assert.match(doc, /Raman/); assert.match(doc, /Muhurtha or Electional Astrology/); assert.match(doc, /pp?\. ?8[2-4]/);
  assert.match(doc, /Gana[^\n]*(?:not included|removed)/i, "the doc says Gana is not included and why");
  assert.ok(!/D: \{ D: 6/.test(src) && !/GANA = /.test(src), "no Gana table in compat.js");
  assert.ok(!Object.prototype.hasOwnProperty.call(V.MAX, "gana") && Object.values(V.MAX).reduce((a, b) => a + b, 0) === 30, "Ashtakoota out of 30");
  const T = load().KB.T, NOTE = { th: /คณะ/, en: /Gana/, zh: /Gana/ };
  for (const l of ["th", "en", "zh"]) assert.match(T[l].vedNoGana || "", NOTE[l], "page note: Gana not included (" + l + ")");
  assert.match(doc, /PyJHora/);
});

/* ---------------- D2 static ---------------- */
test("D2 fields: nickname >= 60 characters, numeric year without a short maxlength, stable nickname ids, crisis check on input", () => {
  const ui = read("compat-ui.js");
  const nick = /name="nick"[^>]*/.exec(ui);
  assert.ok(nick, "nickname input");
  const ml = /maxlength="(\d+)"/.exec(nick[0]);
  assert.ok(!ml || +ml[1] >= 60, "nickname maxlength >= 60: " + nick[0]);
  assert.match(nick[0], /id="cpNick/, "stable nickname id");
  const year = /name="y"[^>]*/.exec(ui);
  assert.ok(year && /inputmode="numeric"/.test(year[0]), "numeric year");
  const yl = /maxlength="(\d+)"/.exec(year[0]);
  assert.ok(!yl || +yl[1] >= 60, "no short maxlength on the year (a typed phrase must reach the crisis check): " + year[0]);
  assert.match(ui, /addEventListener\("input"/, "crisis check on input events");
});

/* ---------------- D3 ---------------- */
const NAMES = ["Ann", "Ben", "Chai", "Dao", "Ek"];
test("D3 no line repeats in two sections of the same report (pair and group, free and full, TH / EN / ZH)", () => {
  const C = load(), A = astronomy(), r = rng(4242);
  const check = (rep, what) => {
    const where = new Map();
    for (const s of rep.sections) for (const line of [...s.fit, ...s.care, ...s.adjust]) {
      const prev = where.get(line);
      assert.ok(prev === undefined || prev === s.id, `${what}: repeated in ${prev} and ${s.id}: ${line}`);
      where.set(line, s.id);
    }
  };
  for (let i = 0; i < 120; i++) {
    const res = C.pair(C.person(birth(r, i % 2 === 0), { astronomy: A }), C.person(birth(r, i % 3 === 0), { astronomy: A }), { rel: "couple" });
    for (const lang of LANGS) for (const tier of ["free", "full"]) check(C.report(res, { lang, tier, names: NAMES.slice(0, 2) }), `pair ${i} ${lang} ${tier}`);
  }
  for (let i = 0; i < 10; i++) {
    const n = 3 + (i % 3), ps = Array.from({ length: n }, () => C.person(birth(r, false), { astronomy: A }));
    const g = C.group(ps, { rel: "team" });
    for (const lang of LANGS) check(C.report(g, { lang, tier: "full", names: NAMES.slice(0, n) }), `group ${i} ${lang}`);
  }
});

/* ---------------- D4 ---------------- */
const WORK = { th: /ไม่ใช้.*(?:จ้าง).*(?:เลื่อนตำแหน่ง).*(?:ค่าตอบแทน|เงินเดือน).*(?:เลิกจ้าง)/, en: /not .*hiring.*promotion.*pay.*dismissal/i, zh: /不.*招聘.*晋升.*薪酬.*解雇/ };
test("D4 business partners (pair mode) carry the work-use line; a couple does not", () => {
  const C = load(), a = C.person({ y: 1988, m: 2, d: 14 }), b = C.person({ y: 1992, m: 9, d: 3 });
  for (const lang of LANGS) {
    assert.match(C.report(C.pair(a, b, { rel: "business" }), { lang, names: ["A", "B"] }).workUse || "", WORK[lang], lang);
    assert.ok(!C.report(C.pair(a, b, { rel: "couple" }), { lang, names: ["A", "B"] }).workUse, "couple: no work-use line");
  }
  const ui = read("compat-ui.js");
  assert.match(ui, /business/, "the page shows the line for business partners");
});

/* ---------------- D5 ---------------- */
test("D5 missing birth time: the Moon may be off by about ±7°", () => {
  const T = load().KB.T;
  for (const lang of LANGS) {
    assert.match(T[lang].westNoTime, /±7°/, lang);
    assert.ok(!/±6°/.test(T[lang].westNoTime), lang);
  }
});
