"use strict";
// tests/unit/petread-90.test.js — FIXED TEST for the pet reading push to 90 (owner inbox entries 17-18, 2026-11-23), against
// the locked acceptance sheet docs/acceptance/petread.md (lock evals-locks/acceptance.sha256, 2026-11-18). Written and locked
// (evals-locks/petread-90.sha256, field copy ~/LENSIQ-field/evals/petread-90/) BEFORE any measurement or product change.
//   H  (gate: hard limits) "0 breaches on the locked probes, run on petread": the 60 locked hard-limit probes of
//      tests/unit/fortune-honest.test.js (HARD, copied byte for byte, 10 categories x TH / EN / ZH) are put into the pet
//      composer's own templates one at a time (every section the composer writes from a template: overview, personality,
//      likes, bond, lucky); the probe must never reach the reading. And every real pet reading over the full synthetic grid
//      x TH / EN / ZH (sections, notes, reminder, card text) has 0 hits on the shared hard-limit check
//      (LQFortuneStraight.hardLimit) and the shared gentle check (FortuneAI.safety.isSafe).
//   C  (consistency) "the same photo or card and the same traits give an identical reading, 100 %": the whole result and the
//      card model are identical for a deep copy of the same input, over the full grid x 3 languages, and for the same
//      detections after pickDetections (the photo path; the pixel step coatGuess is checked in tests/e2e/petread-90.e2e.mjs).
//   Q2 (no cut text) 30 profiles x 3 languages, the locked fortune-90 rules (tools/fortune-cut-check.mjs) as they apply to a
//      page with no summary bullets: S3 no reading paragraph or card line ends on an ellipsis or with an open bracket / quote;
//      S1 the card's sentences are whole reading paragraphs and its headline is its whole source line (never shortened). The
//      drawn card (canvas) is checked in tests/e2e/pet-card-headline.e2e.mjs.
// Synthetic inputs only (no photo is read). Measures; changes no product file.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const ST = require("../../fortune-straight.js");
const P = require("../../lensiq-pet.js");
const LANGS = ["th", "en", "zh"];

/* ---- the 60 locked probes: tests/unit/fortune-honest.test.js HARD, unchanged ---- */
const HARD = {
  "1-death": [
    "ปีหน้าคุณจะเสียชีวิต", "ดวงบอกว่าคุณจะตายก่อนอายุหกสิบ", "you will die next year", "your chart shows an early death", "你明年会去世", "命盘显示你寿命不长",
  ],
  "1-terminal": [
    "มีเกณฑ์ป่วยเป็นมะเร็งระยะสุดท้าย", "คุณจะป่วยหนักด้วยโรคร้ายที่รักษาไม่หาย", "you may develop a terminal illness", "you will get cancer this year", "你可能患上绝症", "你今年会得癌症",
  ],
  "1-accident-certain-or-dated": [
    "วันที่ 15 เดือนหน้าคุณจะประสบอุบัติเหตุรถชน", "สัปดาห์นี้คุณจะเกิดอุบัติเหตุแน่นอน", "On 3 March you will have a car accident", "you will certainly have an accident this week",
    "下个月15日你一定会出车祸", "这周你肯定会出意外",
  ],
  "2-stop-medication": [
    "หยุดกินยาที่หมอสั่งได้เลย", "ดวงดีขึ้นแล้ว ไม่ต้องรักษาต่อ", "stop taking your medication", "you can skip your treatment now", "可以停药了", "运势好转了，不必继续治疗",
  ],
  "2-specific-investment": [
    "ควรนำเงินเก็บไปลงทุนซื้อหุ้นตัวนี้", "เดือนนี้ควรซื้อทองคำและบิตคอยน์", "you should invest in gold now", "buy shares in this company this month", "你应该买入这只股票", "这个月应该投资比特币",
  ],
  "2-end-relationship": [
    "ควรเลิกกับแฟนคนนี้", "คุณควรหย่ากับคู่ครอง", "you should break up with your partner", "end your relationship this year", "你应该和他分手", "你最好离婚",
  ],
  "4-fear-selling": [
    "ถ้าไม่ทำบุญแก้ชง เรื่องร้ายจะเกิดกับคุณ", "ต้องจ่ายค่าทำพิธีสะเดาะเคราะห์ ไม่งั้นดวงจะตกต่อ", "unless you make an offering, this loss will happen",
    "pay for a ritual or your luck will stay bad", "如果不化解，这次破财一定会发生", "不做法事的话，运势会继续低迷",
  ],
  "keep-lottery": ["เลขเด็ดงวดนี้ 25", "ลองซื้อลอตเตอรี่เลขท้าย 47", "your lucky lottery numbers are 12 and 34", "buy a lottery ticket ending in 7", "这期彩票号码是 25", "幸运号码 8 拿去试试手气"],
  "keep-medical-cosmetic": ["ไม่ต้องไปหาหมอ", "ควรเสริมจมูกเพื่อเสริมดวง", "no need to see a doctor", "get a nose job to improve your luck", "不用看医生", "去隆鼻可以改运"],
  "keep-emotion-deception": [
    "แฟนของคุณกำลังโกหกคุณ", "จากสีหน้าของคุณ คุณกำลังเศร้าและเครียด", "your partner is lying to you", "your face shows that you are sad and stressed",
    "你的伴侣在骗你", "从你的表情看出你很伤心",
  ],
};
const langOf = t => (/[฀-๿]/.test(t) ? "th" : /[一-鿿]/.test(t) ? "zh" : "en");

/* ---- synthetic inputs: the generator of tests/unit/fortune-pet.test.js (same seed), full grid ---- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pickOne = (r, a) => a[Math.floor(r() * a.length)];
const NAMES = ["", "Mochi", "ส้มจี๊ด", "ข้าวตู", "Lucky", "小白", "Biscuit", "นิล", "Tofu", "เจ้าดำ"];
function inputs(seed) {
  const T = P.TRAITS, out = [], r = rng(seed);
  for (const species of T.species) for (const coat of T.coat) for (const eyes of T.eyes) {
    for (let k = 0; k < 3; k++) {
      const marks = T.marks.filter(() => r() < 0.3);
      const day = new Date(Date.UTC(2010 + Math.floor(r() * 16), Math.floor(r() * 12), 1 + Math.floor(r() * 28)));
      const owner = r() < 0.6 ? { birth: new Date(Date.UTC(1960 + Math.floor(r() * 45), Math.floor(r() * 12), 1 + Math.floor(r() * 28))).toISOString().slice(0, 10) } : null;
      out.push({ species, name: pickOne(r, NAMES), traits: { coat, marks, eyes, ears: pickOne(r, T.ears), face: pickOne(r, T.face), size: pickOne(r, T.size), energy: pickOne(r, T.energy) },
        birth: r() < 0.8 ? day.toISOString().slice(0, 10) : null, owner, humanSeen: r() < 0.2 });
    }
  }
  return out;
}
const GRID = inputs(20261116);
const clone = o => JSON.parse(JSON.stringify(o));
function shown(r) {
  const out = [];
  for (const s of r.sections || []) { out.push(s.title || ""); for (const p of s.paragraphs || []) out.push(p); }
  for (const v of Object.values(r.notes || {})) out.push(String(v));
  if (r.lucky) { if (r.lucky.colour) out.push(r.lucky.colour.name || ""); if (r.lucky.day) out.push(r.lucky.day.name || ""); }
  if (r.reminder) out.push(r.reminder);
  return out.filter(Boolean);
}

/* ---------------------------------------------------------------- H -------------------------------------------------- */
test("H1 the 60 locked hard-limit probes, put into each pet template in turn, never reach the reading (TH / EN / ZH)", () => {
  const KB = P.KB, base = GRID.find(i => i.birth && i.owner) || GRID[0];
  // each slot: where the composer takes a template from, for the probe's language
  const slots = {
    overview: lang => [KB.overview, lang],
    personality: (lang, x) => [KB.coat[x.traits.coat].p, lang, true],
    likes: (lang, x) => [KB.coat[x.traits.coat].l, lang],
    bond: (lang, x) => [KB.coat[x.traits.coat].b, lang],
    lucky: (lang, x) => [x.birth ? KB.lucky.born : KB.lucky.coat, lang],
  };
  let n = 0;
  const leaks = [];
  for (const [cat, list] of Object.entries(HARD)) for (const probe of list) {
    const lang = langOf(probe);
    for (const [slot, where] of Object.entries(slots)) {
      const [obj, key, isList] = where(lang, base);
      const old = obj[key];
      obj[key] = isList ? old.map(() => probe) : probe;
      try {
        const r = P.compose(clone(base), { lang });
        const text = shown(r).join("\n");
        if (text.includes(probe)) leaks.push(`[${cat}] ${slot} ${lang}: ${probe}`);
      } finally { obj[key] = old; }
      n++;
    }
  }
  assert.equal(n, 60 * 5);
  assert.deepEqual(leaks, [], `${leaks.length} probe(s) reached a pet reading`);
});

test("H2 every pet reading (full grid x TH / EN / ZH, sections, notes, reminder, card text): 0 shared hard-limit or gentle-check hits", () => {
  const hits = [];
  let n = 0;
  for (const lang of LANGS) for (const inp of GRID) {
    const r = P.compose(clone(inp), { lang });
    const lines = shown(r).concat(P.cardText(P.cardModel(r, {})));
    for (const t of lines) {
      n++;
      const h = ST.hardLimit(t);
      if (h) hits.push(`${lang} hardLimit ${h}: ${t}`);
      else if (!FA.safety.isSafe(t)) hits.push(`${lang} gentle: ${t}`);
    }
  }
  assert.ok(n > 3000, `only ${n} lines checked`);
  assert.deepEqual(hits.slice(0, 20), [], `${hits.length} hit(s) of ${n} lines`);
});

/* ---------------------------------------------------------------- C -------------------------------------------------- */
test("C1 same input -> identical result and card, full grid x TH / EN / ZH (100 %)", () => {
  let n = 0, same = 0;
  for (const lang of LANGS) for (const inp of GRID) {
    const a = P.compose(clone(inp), { lang }), b = P.compose(clone(inp), { lang });
    const ca = P.cardModel(a, {}), cb = P.cardModel(b, {});
    n++;
    try { assert.deepEqual(a, b); assert.deepEqual(ca, cb); same++; } catch (e) { /* counted */ }
  }
  assert.equal(same, n, `${same} / ${n} identical`);
});

test("C2 photo path: the same detections give the same pick, and the same pick + traits give the same reading (TH / EN / ZH)", () => {
  const C = P.CLASSES;
  const sets = [
    [{ cls: C.cat, score: 0.82, x: 0.2, y: 0.2, w: 0.5, h: 0.5 }],
    [{ cls: C.dog, score: 0.66, x: 0.1, y: 0.3, w: 0.6, h: 0.6 }, { cls: C.person, score: 0.9, x: 0.6, y: 0.1, w: 0.3, h: 0.8 }],
    [{ cls: C.cat, score: 0.4, x: 0.3, y: 0.3, w: 0.2, h: 0.2 }, { cls: C.dog, score: 0.45, x: 0.5, y: 0.5, w: 0.3, h: 0.3 }, { cls: C.person, score: 0.2, x: 0, y: 0, w: 0.2, h: 0.5 }],
    [],
  ];
  for (const ds of sets) {
    const a = P.pickDetections(clone(ds)), b = P.pickDetections(clone(ds));
    assert.deepEqual(a, b);
    for (const lang of LANGS) {
      const sp = a && a.pet ? (a.pet.cls === C.dog ? "dog" : "cat") : "cat";
      const inp = Object.assign(clone(GRID[5]), { species: sp, humanSeen: !!(a && a.persons && a.persons.length) });
      assert.deepEqual(P.compose(clone(inp), { lang }), P.compose(clone(inp), { lang }));
    }
  }
});

/* ---------------------------------------------------------------- Q2 ------------------------------------------------- */
test("Q2 no cut text: 30 profiles x TH / EN / ZH, reading paragraphs and card lines are whole (0 cut)", async () => {
  const CC = await import("../../tools/fortune-cut-check.mjs");
  const profiles = inputs(20261124).filter((_, i) => i % 7 === 0).slice(0, 30);
  assert.equal(profiles.length, 30);
  const cut = [];
  let n = 0;
  const ellipsis = /(?:…|\.\.\.)\s*$/;
  const check = (lang, s, extra) => {
    n++;
    const why = [];
    if (ellipsis.test(s)) why.push("ellipsis (S3)");
    if (!CC.balanced(s)) why.push("open bracket / quote (S3)");
    if (extra) why.push(extra);
    if (why.length) cut.push(`${lang} ${why.join("+")}: ${s}`);
  };
  for (const lang of LANGS) for (const inp of profiles) {
    const r = P.compose(clone(inp), { lang });
    const card = P.cardModel(r, {});
    const paras = [];
    for (const s of r.sections) for (const p of s.paragraphs) { paras.push(p); check(lang, String(p).trim()); }
    // the card's sentences are whole reading paragraphs (S1: never a shortened copy) and its headline is the whole KB line
    for (const t of card.lines || []) check(lang, String(t).trim(), paras.includes(t) ? "" : "card line is not a whole reading paragraph (S1)");
    if (card.headline) {
      const hl = P.KB.headline && P.KB.headline[r.coat] ? P.KB.headline[r.coat][lang] : null;
      check(lang, String(card.headline).trim(), hl == null || card.headline === hl ? "" : "headline differs from its source line (S1)");
    }
    if (card.lucky) check(lang, String(card.lucky).trim());
  }
  assert.ok(n >= 30 * 3 * 8, `only ${n} lines`);
  assert.deepEqual(cut.slice(0, 20), [], `${cut.length} cut of ${n}`);
});
