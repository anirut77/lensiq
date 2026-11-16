"use strict";
// tests/unit/fortune-compat.test.js — FIXED TEST SET, Compatibility (ดวงสมพงษ์), owner order 2026-11-16 part A.
// Written and locked (~/LENSIQ-field/evals/fortune-compat/, sha256 in evals-locks/fortune-compat.sha256) BEFORE any product
// code on branch fortune-compat. The browser half: tests/e2e/fortune-compat.e2e.mjs (Chrome) and
// tests/e2e/fortune-compat-webkit.e2e.mjs (iPhone WebKit, 390 px).
//
// M  Method correctness, golden cases (sources in docs/COMPAT-RESEARCH.md; hand-checked against the cited tables):
//    M1 Ashtakoota (36 points), "common" profile: Varna by element (hindutone.com, astromedha.in); Vashya matrix of
//       Astroyogi / Steve Hora; Tara counted both ways, remainders 3/5/7 unfavourable, 1.5 each (dekhopanchang.com);
//       Yoni 14x14 standard matrix (onlinejyotish.com enemy pairs = 0, same = 4); Graha Maitri Parashara friendships
//       (5/4/3/1/0.5/0); Gana bride-row matrix (saravali); Bhakoot 2/12, 5/9, 6/8 = 0 else 7; Nadi same = 0 else 8.
//       Cases: Rohini (Taurus) + Pushya (Cancer) = 26, per-koota, five of them as published by hindutone.com;
//       Rohini (Taurus) + Swati (Libra) = 13.5 (melooha.com shows the same pair under another variant: 16.5, documented);
//       Ashwini + Bharani (Aries) = 34; Ashwini (Aries) + Jyeshtha (Scorpio) = 11; Ashwini + Shatabhisha Yoni = 4 and
//       Aries + Virgo Bhakoot = 0 (dekhopanchang.com single-koota examples); Bhakoot / Nadi cancellations reported, never
//       silently added to the total; Vashya of Sagittarius / Capricorn split at 15 degrees.
//    M2 Nakshatra from the sidereal Moon (27 x 13°20′, 4 padas); Lahiri ayanamsa within 0.005° of the Indian Astronomical
//       Ephemeris values quoted in the Swiss Ephemeris documentation (2000-01-01: 23°51′25.53″, 2020-01-01: 24°08′11.46″).
//    M3 Moon: the site's own Moon (astro.js, Meeus ch. 47) agrees with astronomy-engine 2.1.19 (MIT, claims ±1′ vs NOVAS /
//       JPL Horizons) within 1 arcminute over 1900–2100; planets: Sun within 0.02° of the site's Sun, Mercury within 28.5° and
//       Venus within 47.5° of the Sun (elongation limits).
//    M4 BaZi: five stem combinations 甲己 土, 乙庚 金, 丙辛 水, 丁壬 木, 戊癸 火; stem clashes 甲庚 乙辛 丙壬 丁癸; generating /
//       controlling cycle; branch six harmonies, three harmonies, directional, six clashes, punishments (incl. self), harms,
//       destructions (zh.wikipedia 地支; masterseanchan.com). Day pillar of 2000-01-01 = 戊午.
//    M5 Thai: planet numbers 1 Sun … 7 Saturday, 8 Rahu (Wednesday night); คู่มิตร 1-5 2-4 3-6 7-8, คู่ศัตรู 1-3 2-5 4-8 6-7,
//       คู่สมพล 1-6 2-8 3-5 4-7, คู่ธาตุ 1-7 2-5 3-8 4-6 (th.wikipedia โหราศาสตร์ไทย; baankhunyai.com, อ.อรุณ ลำเพ็ญ); day
//       elements; year-element pairs of ตำราพรหมชาติ (sanook.com/horoscope/229037).
//    M6 Western synastry aspects: 0 / 60 / 90 / 120 / 180 degrees; orbs 8° with the Sun or Moon, 6° otherwise, sextile 4°
//       (Wikipedia "Astrological aspect"; astrotheme.com; documented choice).
// A  Agreement view: for every category, every method's lean is listed (null only when that method could not be computed),
//    and "agree" is true exactly when at least two computed methods lean the same way and none differs.
// H  Hard limits in TH / EN / ZH over 240 synthetic pairs and 24 groups (3–8 people), every relation type, full tier:
//    no advice to end a relationship, marriage or business, no "do not marry", no "incompatible" verdict, no fear-selling,
//    no death / terminal illness / accident, no medication / investment instruction, no lottery numbers, no emotion or
//    deception inference; EN and ZH carry no Thai; ZH carries Chinese.
// S  Scores: every method score in the overview comes with at least two lines of detail, and each category section has
//    what fits, what needs care (or a stated "nothing to watch") and practical ways to adjust; the overview has text lines.
// F  Free / paid: with LENSIQ_FORTUNE_PAID not exactly true the tier is "free": overview + 2 categories (communication,
//    values), no section marked paid; every caution of every category is still in the free overview with a step to take
//    (rule a). Switch on and not calm = "full" (7 categories); switch on in the crisis or calm state = "free".
// G  Group: 3–8 people: every pair once, one suggested role per person framed as a strength, the work-use line in TH / EN / ZH.
// P  Page and privacy (static): compat.html has the single top help button (1323 once, 1669 not), the final disclaimer line,
//    the consent statement in TH (EN / ZH in the dictionaries) and the work-use line; it is linked from cat-fortune.html,
//    fortune.html and nav.js; the astronomy engine is not loaded at page load (lazy); compat.js / compat-kb.js make no
//    network call and write no storage; the vendored engine matches its published sha256 and carries its MIT licence;
//    credits, sources, legal packet (consent wording, L72) and PDPA note are recorded.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = f => fs.existsSync(path.join(ROOT, f));
const LANGS = ["th", "en", "zh"];
const ENGINE = "vendor/astronomy-engine/astronomy.browser.min.js";
const ENGINE_SHA = "f41139a87941ea017ab902b954c9389fa27ea72083d7fab4971756d7769d14e6"; // npm astronomy-engine@2.1.19, jsdelivr

const load = () => require(path.join(ROOT, "compat.js"));
let AE = null;
function astronomy() {
  if (AE) return AE;
  const ctx = {}; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read(ENGINE), ctx);
  AE = ctx.Astronomy;
  return AE;
}
// seeded RNG so the synthetic set is the same on every run
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function birth(r, withTime) {
  const y = 1950 + Math.floor(r() * 58), m = 1 + Math.floor(r() * 12), d = 1 + Math.floor(r() * 28);
  return { y, m, d, time: withTime ? { h: Math.floor(r() * 24), mi: Math.floor(r() * 60) } : null, tz: 7 };
}

/* ---------------- M1 Ashtakoota ---------------- */
const NAK = { ashwini: 0, bharani: 1, rohini: 3, pushya: 7, swati: 14, jyeshtha: 17, mula: 18, purvaAshadha: 19, shatabhisha: 23 };
const RASHI = { aries: 0, taurus: 1, cancer: 3, virgo: 5, libra: 6, scorpio: 7, sagittarius: 8 };
const K8 = ["varna", "vashya", "tara", "yoni", "maitri", "gana", "bhakoot", "nadi"];
const GOLD = [
  { name: "Rohini (Taurus) + Pushya (Cancer)", a: { nak: NAK.rohini, rashi: RASHI.taurus, deg: 15 }, b: { nak: NAK.pushya, rashi: RASHI.cancer, deg: 10 },
    k: [1, 1, 1.5, 2, 0.5, 5, 7, 8], total: 26 },
  { name: "Rohini (Taurus) + Swati (Libra)", a: { nak: NAK.rohini, rashi: RASHI.taurus, deg: 15 }, b: { nak: NAK.swati, rashi: RASHI.libra, deg: 13 },
    k: [0, 1, 1.5, 1, 5, 5, 0, 0], total: 13.5, bhakootCancel: true },
  { name: "Ashwini + Bharani (Aries)", a: { nak: NAK.ashwini, rashi: RASHI.aries, deg: 5 }, b: { nak: NAK.bharani, rashi: RASHI.aries, deg: 20 },
    k: [1, 2, 3, 2, 5, 6, 7, 8], total: 34 },
  { name: "Ashwini (Aries) + Jyeshtha (Scorpio)", a: { nak: NAK.ashwini, rashi: RASHI.aries, deg: 5 }, b: { nak: NAK.jyeshtha, rashi: RASHI.scorpio, deg: 25 },
    k: [1, 1, 3, 1, 5, 0, 0, 0], total: 11, bhakootCancel: true },
];
test("M1 Ashtakoota golden cases: every koota and the total (common profile)", () => {
  const C = load();
  for (const g of GOLD) {
    const r = C.vedic.ashtakoota(g.a, g.b);
    K8.forEach((k, i) => assert.equal(r.kootas[k], g.k[i], `${g.name}: ${k}`));
    assert.equal(r.total, g.total, `${g.name}: total`);
    assert.equal(r.max, 36);
    if (g.bhakootCancel) {
      assert.equal(r.cancel.bhakoot, true, `${g.name}: Bhakoot cancellation (same lord) is reported`);
      assert.equal(r.total, g.total, `${g.name}: a cancellation is never added to the raw total`);
    }
  }
});
test("M1 Ashtakoota single-koota published examples; Vashya split at 15° for Sagittarius", () => {
  const C = load();
  assert.equal(C.vedic.ashtakoota({ nak: NAK.ashwini, rashi: 0, deg: 5 }, { nak: NAK.shatabhisha, rashi: 10, deg: 12 }).kootas.yoni, 4, "Ashwini + Shatabhisha: both Horse");
  assert.equal(C.vedic.ashtakoota({ nak: NAK.ashwini, rashi: 0, deg: 5 }, { nak: 12, rashi: RASHI.virgo, deg: 15 }).kootas.bhakoot, 0, "Aries + Virgo: 6/8");
  // Sagittarius before 15° = human (Manava), after = quadruped (Chatushpada); Libra = human
  assert.equal(C.vedic.ashtakoota({ nak: NAK.mula, rashi: RASHI.sagittarius, deg: 5 }, { nak: NAK.swati, rashi: RASHI.libra, deg: 13 }).kootas.vashya, 2);
  assert.equal(C.vedic.ashtakoota({ nak: NAK.purvaAshadha, rashi: RASHI.sagittarius, deg: 20 }, { nak: NAK.swati, rashi: RASHI.libra, deg: 13 }).kootas.vashya, 1);
  // Nadi: same nakshatra pair in the same Nadi = 0, reported as such
  const same = C.vedic.ashtakoota({ nak: NAK.ashwini, rashi: 0, deg: 3 }, { nak: NAK.ashwini, rashi: 0, deg: 9 });
  assert.equal(same.kootas.nadi, 0);
  assert.equal(typeof same.cancel.nadi, "boolean");
});

/* ---------------- M2 nakshatra, ayanamsa ---------------- */
test("M2 nakshatra and pada from the sidereal Moon; Lahiri ayanamsa against IAE values", () => {
  const C = load();
  const n = lon => C.vedic.nakshatra(lon);
  assert.deepEqual([n(0).nak, n(0).pada, n(0).rashi], [0, 1, 0]);
  assert.deepEqual([n(13.3).nak, n(13.34).nak], [0, 1], "boundary at 13°20′");
  assert.deepEqual([n(40.01).nak, n(40.01).rashi], [3, 1], "Rohini starts at 40°, in Taurus");
  assert.deepEqual([n(359.9).nak, n(359.9).pada, n(359.9).rashi], [26, 4, 11], "Revati pada 4");
  assert.equal(n(3.4).pada, 2);
  const jd2000 = 2451545.0, jd2020 = 2458850.0;
  assert.ok(Math.abs(C.vedic.ayanamsa(jd2000) - (23 + 51 / 60 + 25.53 / 3600)) < 0.005, "2000-01-01 IAE 23°51′25.53″");
  assert.ok(Math.abs(C.vedic.ayanamsa(jd2020) - (24 + 8 / 60 + 11.46 / 3600)) < 0.005, "2020-01-01 IAE 24°08′11.46″");
});

/* ---------------- M3 Moon / planets ---------------- */
test("M3 the site's Moon agrees with astronomy-engine within 1′ (1900–2100); planets pass the elongation limits", () => {
  const A = astronomy(), AS = require(path.join(ROOT, "astro.js")), C = load();
  let worst = 0;
  for (let i = 0; i < 1500; i++) {
    const jd = 2415020.5 + i * 48.7 + (i % 7) * 0.31;
    const ref = A.EclipticGeoMoon(A.MakeTime(jd - 2451545)).lon;
    const e = Math.abs(((AS.moonAt(jd).lon - ref + 540) % 360) - 180);
    worst = Math.max(worst, e);
  }
  assert.ok(worst * 60 < 1, `Moon difference ${(worst * 60).toFixed(2)}′`);
  const r = rng(11);
  for (let i = 0; i < 60; i++) {
    const jd = 2433282.5 + r() * 21000;
    const p = C.western.planets(jd, A);
    for (const k of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]) assert.ok(p[k] >= 0 && p[k] < 360, k + " in range");
    const sep = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    assert.ok(sep(p.sun, AS.sunAt(jd).lon) < 0.02, "Sun vs the site's Sun");
    assert.ok(sep(p.moon, AS.moonAt(jd).lon) < 1 / 60, "Moon vs the site's Moon");
    assert.ok(sep(p.mercury, p.sun) <= 28.5, "Mercury elongation");
    assert.ok(sep(p.venus, p.sun) <= 47.5, "Venus elongation");
  }
});

/* ---------------- M4 BaZi ---------------- */
test("M4 BaZi stem combinations, clashes, element cycle; branch relations; a known day pillar", () => {
  const C = load(), B = C.bazi;
  assert.deepEqual([B.stemRel(0, 5).combo, B.stemRel(1, 6).combo, B.stemRel(2, 7).combo, B.stemRel(3, 8).combo, B.stemRel(4, 9).combo],
    ["earth", "metal", "water", "wood", "fire"]);
  assert.equal(B.stemRel(5, 0).combo, "earth", "symmetric");
  assert.deepEqual([B.stemRel(0, 6).clash, B.stemRel(1, 7).clash, B.stemRel(2, 8).clash, B.stemRel(3, 9).clash, B.stemRel(0, 2).clash], [true, true, true, true, false]);
  assert.equal(B.stemRel(0, 2).rel, "aGen", "甲 wood feeds 丙 fire");
  assert.equal(B.stemRel(2, 0).rel, "bGen");
  assert.equal(B.stemRel(0, 4).rel, "aCtrl", "wood controls earth");
  assert.equal(B.stemRel(4, 0).rel, "bCtrl");
  assert.equal(B.stemRel(0, 1).rel, "same");
  const has = (a, b, k) => B.branchRels(a, b).includes(k);
  for (const [a, b] of [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]]) assert.ok(has(a, b, "six") && has(b, a, "six"), `six ${a}-${b}`);
  for (const g of [[8, 0, 4], [11, 3, 7], [2, 6, 10], [5, 9, 1]]) assert.ok(has(g[0], g[1], "three") && has(g[1], g[2], "three") && has(g[0], g[2], "three"), "three " + g);
  for (const g of [[11, 0, 1], [2, 3, 4], [5, 6, 7], [8, 9, 10]]) assert.ok(has(g[0], g[1], "dir") && has(g[0], g[2], "dir"), "directional " + g);
  for (let a = 0; a < 12; a++) assert.ok(has(a, (a + 6) % 12, "clash"), "clash " + a);
  for (const [a, b] of [[2, 5], [5, 8], [2, 8], [1, 10], [10, 7], [1, 7], [0, 3]]) assert.ok(has(a, b, "punish"), `punish ${a}-${b}`);
  for (const a of [4, 6, 9, 11]) assert.ok(has(a, a, "punish") && has(a, a, "same"), "self-punishment " + a);
  assert.ok(!has(0, 0, "punish") && has(0, 0, "same"));
  for (const [a, b] of [[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]]) assert.ok(has(a, b, "harm"), `harm ${a}-${b}`);
  for (const [a, b] of [[0, 9], [6, 3], [5, 8], [2, 11], [4, 1], [10, 7]]) assert.ok(has(a, b, "destroy"), `destroy ${a}-${b}`);
  assert.ok(!has(0, 2, "clash") && !has(0, 2, "six"));
  const P = C.person({ y: 2000, m: 1, d: 1, time: { h: 12, mi: 0 }, tz: 7 });
  assert.deepEqual([P.bazi.dayStem, P.bazi.dayBranch], [4, 6], "2000-01-01 = 戊午");
  assert.equal(P.thai.day, 7, "2000-01-01 was a Saturday (Thai planet 7)");
});

/* ---------------- M5 Thai ---------------- */
test("M5 Thai day pairs, day elements, year elements (ตำราพรหมชาติ)", () => {
  const T = load().thai;
  const k = (a, b) => T.dayPair(a, b).kinds;
  for (const [a, b] of [[1, 5], [2, 4], [3, 6], [7, 8]]) assert.ok(k(a, b).includes("mitr") && k(b, a).includes("mitr"), `มิตร ${a}-${b}`);
  for (const [a, b] of [[1, 3], [2, 5], [4, 8], [6, 7]]) assert.ok(k(a, b).includes("satru"), `ศัตรู ${a}-${b}`);
  for (const [a, b] of [[1, 6], [2, 8], [3, 5], [4, 7]]) assert.ok(k(a, b).includes("somphon"), `สมพล ${a}-${b}`);
  for (const [a, b] of [[1, 7], [2, 5], [3, 8], [4, 6]]) assert.ok(k(a, b).includes("thatu"), `ธาตุ ${a}-${b}`);
  assert.ok(k(2, 5).includes("thatu") && k(2, 5).includes("satru"), "Monday–Thursday is both, shown as both");
  assert.equal(T.dayPair(3, 3).same, true);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(T.dayElement), ["fire", "earth", "wind", "water", "earth", "water", "fire", "wind"]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(T.yearElement),
    ["water", "earth", "wood", "wood", "gold", "fire", "fire", "gold", "iron", "iron", "earth", "water"]);
  assert.equal(T.yearElementRel(0, 6), "mixed", "water + fire");
  assert.equal(T.yearElementRel(2, 5), "care", "wood + fire");
  assert.equal(T.yearElementRel(8, 9), "care", "iron + iron");
  assert.equal(T.yearElementRel(0, 2), "good", "water + wood");
  assert.equal(T.yearElementRel(4, 6), "good", "gold with fire");
  assert.equal(T.yearElementRel(4, 7), "unstated", "gold + gold not in the text");
  assert.equal(T.yearElementRel(2, 8), "unstated", "wood + iron not in the text");
});

/* ---------------- M6 synastry ---------------- */
test("M6 synastry aspects and orbs", () => {
  const W = load().western;
  const a = (x, y, p, q) => W.aspect(x, y, p || "venus", q || "mars");
  assert.deepEqual([a(10, 130).type, a(10, 130).orb], ["trine", 0]);
  assert.equal(a(10, 100).type, "square");
  assert.equal(a(359, 3).type, "conj");
  assert.ok(Math.abs(a(359, 3).orb - 4) < 1e-9);
  assert.equal(a(0, 64).type, "sext");
  assert.equal(a(0, 65), null, "sextile orb 4°");
  assert.equal(a(0, 187, "sun", "moon").type, "opp", "8° with the luminaries");
  assert.equal(a(0, 187), null, "6° otherwise");
  assert.equal(a(0, 45), null, "no minor aspects");
});

/* ---------------- helpers for the synthetic set ---------------- */
const RELS2 = ["couple", "family", "friends", "business"], RELSG = ["partners", "team", "household"];
const NAMES = ["Ann", "Ben", "Chai", "Dao", "Ek", "Fon", "Gun", "Hom"];
function synthetic() {
  const C = load(), A = astronomy(), r = rng(20261116), pairs = [], groups = [];
  for (let i = 0; i < 240; i++) {
    const pa = C.person(birth(r, i % 3 !== 0), { astronomy: A }), pb = C.person(birth(r, i % 2 === 0), { astronomy: A });
    pairs.push({ res: C.pair(pa, pb, { rel: RELS2[i % 4] }), rel: RELS2[i % 4] });
  }
  for (let i = 0; i < 24; i++) {
    const n = 3 + (i % 6), ps = [];
    for (let j = 0; j < n; j++) ps.push(C.person(birth(r, j % 2 === 0), { astronomy: A }));
    groups.push({ res: C.group(ps, { rel: RELSG[i % 3] }), rel: RELSG[i % 3], n });
  }
  return { C, pairs, groups };
}
let SYN = null;
const syn = () => SYN || (SYN = synthetic());
/** every string inside a report object (deep), except the work-use line (it names hiring, pay and dismissal on purpose) */
function strings(o, out = []) {
  if (typeof o === "string") out.push(o);
  else if (Array.isArray(o)) o.forEach(x => strings(x, out));
  else if (o && typeof o === "object") for (const k of Object.keys(o)) if (k !== "workUse") strings(o[k], out);
  return out;
}

/* ---------------- A agreement ---------------- */
test("A agreement view: per category, every method listed; agree iff ≥2 computed methods lean the same way and none differs", () => {
  const { C, pairs } = syn();
  assert.deepEqual(C.CATEGORIES, ["communication", "values", "money", "daily", "work", "decisions", "longterm"]);
  assert.deepEqual(C.METHODS, ["thai", "bazi", "vedic", "western"]);
  let agreeN = 0, differN = 0;
  for (const { res } of pairs) {
    for (const cat of C.CATEGORIES) {
      const a = res.agreement[cat];
      assert.ok(a, cat);
      assert.deepEqual(Object.keys(a.leans).sort(), C.METHODS.slice().sort(), "every method listed");
      const vals = Object.values(a.leans).filter(v => v != null);
      for (const v of vals) assert.ok(["fit", "mixed", "care"].includes(v), "lean " + v);
      const want = vals.length >= 2 && vals.every(v => v === vals[0]);
      assert.equal(a.agree, want, cat + " " + JSON.stringify(a.leans));
      if (want) agreeN++; else differN++;
    }
    for (const lang of LANGS) {
      const rep = C.report(res, { lang, mode: "pair", tier: "full", names: ["Ann", "Ben"] });
      assert.equal(rep.agreement.length, 7, "agreement rows");
      for (const row of rep.agreement) {
        assert.ok(C.CATEGORIES.includes(row.cat) && row.title && row.text, "row has a title and a sentence");
        assert.deepEqual(Object.keys(row.leans).sort(), C.METHODS.slice().sort());
      }
    }
  }
  assert.ok(agreeN > 0 && differN > 0, `both agreement and difference occur in the set (${agreeN} / ${differN})`);
});

/* ---------------- H hard limits ---------------- */
const BAN = {
  th: [/เลิก(?:กัน|รา|คบ|ร่วม|หุ้น|ทำ)|หย่า|แยกทาง|ถอนหมั้น|ตัดขาด|ยุติ(?:ความสัมพันธ์|การ|หุ้นส่วน|ธุรกิจ)|ไม่(?:ควร|ต้อง)(?:แต่ง|คบ|อยู่ด้วยกัน|ร่วมงาน|ร่วมหุ้น|ทำธุรกิจ)|(?:ห้าม|อย่า)(?:แต่ง|คบ|ร่วม)/,
    /ไม่เข้ากัน|เข้ากันไม่ได้|ไปด้วยกันไม่ได้|ไม่คู่ควร|ดวงไม่สมพงษ์|คู่กันไม่ได้|ไม่ถูกโฉลก/,
    /ถ้าไม่(?:แก้|ทำพิธี|บูชา|จ่าย|ซื้อ)|มิฉะนั้น|ไม่งั้น|ต้อง(?:แก้กรรม|ทำพิธี|สะเดาะ|ซื้อ|จ่าย)|รีบ(?:แก้|ทำพิธี|ซื้อ)|สะเดาะเคราะห์/,
    /ตาย|เสียชีวิต|อายุสั้น|เป็นม่าย|อุบัติเหตุ|โรคร้าย|ระยะสุดท้าย|หยุดยา|เลิกยา|ลงทุนใน|ซื้อหุ้น|หวย|เลขเด็ด|ลอตเตอรี่|โกหก|จับเท็จ|อารมณ์ของอีกฝ่าย/],
  en: [/\b(?:break(?:ing)? up|breakup|divorc\w*|split(?:ting)? up|separat(?:e|ion) from|end (?:the|your|this|a) (?:relationship|marriage|partnership|business)|call(?:ing)? off|walk away|leave (?:him|her|them|your partner))\b/i,
    /\b(?:should(?:n't| not) marry|do not marry|don't marry|must not marry|not (?:be )?married)\b/i,
    /\b(?:incompatib\w*|not compatible|bad match|poor match|doomed|ill-?fated|cursed)\b/i,
    /\b(?:unless you (?:pay|buy|perform)|or else|pay (?:for|to) (?:fix|remove|cancel)|remedy ritual|buy (?:an?|this) (?:amulet|ritual)|dosha removal)\b/i,
    /\b(?:death|dies?|dying|widow\w*|accident\w*|terminal|fatal|stop (?:taking )?(?:your )?medication|invest in|buy (?:stocks|shares|crypto)|lottery|lucky numbers?|lying|liar|deception)\b/i],
  zh: [/分手|离婚|分开吧|散伙|拆伙|断绝|结束(?:关系|婚姻|合作|生意)|不宜结婚|不要结婚|不能结婚|别结婚|不要在一起/,
    /不相配|合不来|不般配|八字不合|相克到底|注定失败|没有缘分/,
    /否则|除非你|化解费|必须做法事|花钱消灾|买护身符/,
    /死|丧偶|寡|意外事故|绝症|停药|投资于|买股票|彩票|中奖号码|撒谎|测谎|欺骗/],
};
const THAI = /[฀-๿]/, CJK = /[一-鿿]/;
test("H hard limits TH / EN / ZH over 240 pairs and 24 groups (full tier, every relation type)", () => {
  const { C, pairs, groups } = syn();
  let n = 0;
  for (const lang of LANGS) {
    const reps = pairs.map(p => C.report(p.res, { lang, mode: "pair", tier: "full", names: ["Ann", "Ben"], rel: p.rel }))
      .concat(groups.map(g => C.report(g.res, { lang, mode: "group", tier: "full", names: NAMES.slice(0, g.n), rel: g.rel })));
    for (const rep of reps) {
      assert.equal(rep.lang, lang);
      for (const s of strings(rep)) {
        n++;
        for (const re of BAN[lang]) assert.ok(!re.test(s), `[${lang}] banned wording ${re}: ${s}`);
        if (lang !== "th") assert.ok(!THAI.test(s), `[${lang}] Thai text in ${lang}: ${s}`);
      }
      if (lang === "zh") assert.ok(CJK.test(strings(rep).join("")), "ZH report is in Chinese");
    }
  }
  assert.ok(n > 20000, "checked " + n + " strings");
});

/* ---------------- S scores never alone ---------------- */
test("S every score comes with detail; every category has what fits, what needs care and ways to adjust", () => {
  const { C, pairs } = syn();
  for (const { res } of pairs.slice(0, 60)) {
    for (const lang of LANGS) {
      const rep = C.report(res, { lang, mode: "pair", tier: "full", names: ["Ann", "Ben"] });
      assert.ok(rep.overview && rep.overview.lines.length >= 2, "overview has text");
      for (const m of rep.overview.methods) {
        if (m.score == null) { assert.ok(m.detail.length >= 1, "unavailable method says why"); continue; }
        assert.ok(m.detail.length >= 2, `${m.id}: a score with at least two lines of detail`);
        assert.ok(m.name && m.max > 0);
      }
      assert.equal(rep.sections.length, 7);
      for (const s of rep.sections) {
        assert.ok(s.title && s.fit.length >= 1 && s.adjust.length >= 1 && Array.isArray(s.care), s.id + ": fit / care / adjust");
        assert.ok(s.care.length >= 1 || s.careNone, s.id + ": care lines or a stated 'nothing to watch'");
      }
    }
  }
});

/* ---------------- F free / paid ---------------- */
test("F free / paid split behind LENSIQ_FORTUNE_PAID; every caution stays free with its step (rule a)", () => {
  const { C, pairs } = syn();
  assert.deepEqual(C.FREE_CATEGORIES, ["communication", "values"]);
  const calm = { calm: false }, crisisApi = { allow: () => !calm.calm };
  assert.equal(C.tierFor({}, crisisApi), "free", "switch absent");
  assert.equal(C.tierFor({ LENSIQ_FORTUNE_PAID: "true" }, crisisApi), "free", "only exactly true");
  assert.equal(C.tierFor({ LENSIQ_FORTUNE_PAID: true }, crisisApi), "full");
  calm.calm = true;
  assert.equal(C.tierFor({ LENSIQ_FORTUNE_PAID: true }, crisisApi), "free", "crisis / calm: nothing paid");
  assert.equal(C.tierFor({ LENSIQ_FORTUNE_PAID: true }, null), "free", "no crisis API: fail closed");
  assert.match(read("lensiq-config.js") + read("compat.js"), /LENSIQ_FORTUNE_PAID/);
  for (const { res } of pairs.slice(0, 80)) {
    for (const lang of LANGS) {
      const free = C.report(res, { lang, mode: "pair", tier: "free", names: ["Ann", "Ben"] });
      const full = C.report(res, { lang, mode: "pair", tier: "full", names: ["Ann", "Ben"] });
      assert.deepEqual(free.sections.map(s => s.id), ["communication", "values"]);
      assert.ok(free.sections.every(s => !s.paid), "free sections are not marked paid");
      assert.ok(!strings(free).some(s => /฿|บาท|THB|ราคา|\bprice\b|价格|\d\s*元|ซื้อ|\bbuy\b|购买|ปลดล็อก|\bunlock\b|解锁|premium|พรีเมียม/i.test(s)), "no price or offer in free");
      // rule a: every caution of every category is in the free overview with a step
      const cautions = full.sections.flatMap(s => s.care);
      const freeCaut = free.overview.cautions.map(c => c.text);
      for (const c of cautions) assert.ok(freeCaut.some(t => t.includes(c) || c.includes(t)), "caution free: " + c);
      for (const c of free.overview.cautions) assert.ok(c.step && c.step.length > 10, "each free caution has a practical step");
    }
  }
});

/* ---------------- G group ---------------- */
const WORK = { th: /ไม่ใช้.*(?:จ้าง).*(?:เลื่อนตำแหน่ง).*(?:ค่าตอบแทน|เงินเดือน).*(?:เลิกจ้าง)/, en: /not .*hiring.*promotion.*pay.*dismissal/i, zh: /不.*招聘.*晋升.*薪酬.*解雇/ };
test("G group of 3–8: every pair once, a role per person framed as a strength, the work-use line in TH / EN / ZH", () => {
  const { C, groups } = syn();
  for (const g of groups) {
    const n = g.n;
    assert.equal(g.res.pairs.length, n * (n - 1) / 2);
    const seen = new Set(g.res.pairs.map(p => p.i + "-" + p.j));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(seen.has(i + "-" + j), `pair ${i}-${j}`);
    assert.equal(g.res.roles.length, n);
    for (const lang of LANGS) {
      const rep = C.report(g.res, { lang, mode: "group", tier: "free", names: NAMES.slice(0, n), rel: g.rel });
      assert.match(rep.workUse || "", WORK[lang], "work-use line " + lang);
      assert.equal(rep.map.length, n * (n - 1) / 2, "map cells");
      for (const cell of rep.map) assert.ok(["fit", "mixed", "care"].includes(cell.lean) && cell.text, "map cell lean + text");
      assert.equal(rep.roles.length, n);
      for (const r of rep.roles) assert.ok(r.name && r.role && r.strength && r.strength.length > 10, "role framed as a strength");
    }
  }
  assert.throws(() => C.group([C.person({ y: 1990, m: 1, d: 1 }), C.person({ y: 1991, m: 1, d: 1 })]), /3/, "a group needs 3");
  const nine = Array.from({ length: 9 }, (_, i) => C.person({ y: 1980 + i, m: 2, d: 3 }));
  assert.throws(() => C.group(nine), /8/, "at most 8");
});

/* ---------------- P page and privacy (static) ---------------- */
const LINE = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
const CONSENT = { th: [/แจ้ง/, /รับผิดชอบ/], en: [/informed/i, /responsible/i], zh: [/告知/, /负责/] };
test("P page: help button, disclaimer, consent, work-use line, links, lazy engine", () => {
  const html = read("compat.html");
  const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
  assert.equal((body.match(/tel:1323/g) || []).length, 1, "1323 once");
  assert.ok(!/1669/.test(body), "no 1669 in the normal page");
  const top = html.indexOf('id="lqHelpTop"'), main = html.indexOf("<main");
  assert.ok(top > 0 && top < main, "help button before <main>");
  assert.ok(html.includes(LINE.th) && /class="lq-disc-line"/.test(html), "disclaimer line");
  assert.ok(/id="cpConsent"/.test(html) && CONSENT.th.every(re => re.test(html)), "consent statement (TH)");
  assert.ok(/data-compat-workuse/.test(html), "work-use line in the page");
  assert.ok(!html.includes("astronomy-engine"), "the astronomy engine is not loaded at page load");
  const en = read("i18n/en-compat.js"), zh = read("i18n/zh-compat.js");
  assert.ok(en.includes(LINE.en) && zh.includes(LINE.zh), "disclaimer EN / ZH");
  for (const re of CONSENT.en) assert.match(en, re);
  for (const re of CONSENT.zh) assert.match(zh, re);
  assert.match(en, WORK.en); assert.match(zh, WORK.zh); assert.match(html, WORK.th);
  for (const f of ["cat-fortune.html", "fortune.html", "nav.js"]) assert.ok(read(f).includes('href="compat.html') || read(f).includes('"compat.html"'), f + " links compat.html");
});
test("P privacy: no network call, no storage write in the compat code; vendored engine sha256 and licence; records", () => {
  for (const f of ["compat.js", "compat-kb.js"]) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\.setItem\s*\(|indexedDB|document\.cookie/.test(src), f + ": no network, no storage");
  }
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, ENGINE))).digest("hex"), ENGINE_SHA, "engine = astronomy-engine 2.1.19");
  assert.ok(exists("vendor/astronomy-engine/LICENSE") && /MIT License/.test(read("vendor/astronomy-engine/LICENSE")) && /Don Cross/.test(read("vendor/astronomy-engine/LICENSE")));
  assert.match(read("LICENSES/THIRD_PARTY.md"), /astronomy-engine/);
  assert.match(read("LICENSES/THIRD-PARTY-NOTICES.txt"), /astronomy-engine/);
  const src = read("docs/COMPAT-SOURCES.md");
  for (const w of [/aryaminus\/astro/, /astroceleste-engine/, /astronomy-engine/, /Ashtakoota|Ashtakuta/, /BaZi|八字/, /synastry/i, /ดวงสมพงษ์|คู่มิตร/]) assert.match(src, w);
  assert.ok(exists("docs/COMPAT-RESEARCH.md"));
  const lp = read("docs/LEGAL-PACKET.md");
  assert.match(lp, /L72/);
  assert.ok(lp.includes("รับผิดชอบ") && /compat/.test(lp), "consent wording in the legal packet");
  assert.match(read("docs/PDPA-NOTES-FOR-COUNSEL.md"), /compat/i);
});
