"use strict";
// node --test tests/unit — computational engines behind the fortune pages (not the composer):
// faceread (geometry → measurements → classes/elements → facts), horoscope (calendar/astronomy ground truth),
// tarot (deck, spreads, seeded draws, facts), numbers (digit arithmetic, validation, masking) and
// fengshui (lichun, kua number, Eight Mansions table, flying stars, compass).
// Expected values are computed by hand / from published tables, not copied from engine output.
const test = require("node:test");
const assert = require("node:assert/strict");
global.FR_KB = require("../../faceread-kb.js");
const FR = require("../../faceread.js");
const HS = require("../../horoscope.js");
const TR = require("../../tarot.js");
const TKB = require("../../tarot-kb.js");
const NM = require("../../numbers.js");
const FS = require("../../fengshui.js");

/** shared facts-contract check (see fortune-ai.js) */
function assertFactsShape(f, domain, topic) {
  assert.equal(f.domain, domain);
  if (topic) assert.equal(f.topic, topic);
  assert.equal(typeof f.headline, "string");
  assert.ok(f.headline.length > 0);
  assert.ok(Array.isArray(f.items) && f.items.length > 0, domain + ": no items");
  const ids = new Set();
  for (const it of f.items) {
    assert.equal(typeof it.id, "string", domain + ": item id");
    assert.ok(!ids.has(it.id), domain + ": duplicate item id " + it.id);
    ids.add(it.id);
    assert.ok(typeof it.label === "string" && it.label.length, domain + ": label of " + it.id);
    assert.ok(Array.isArray(it.tags), domain + ": tags of " + it.id);
    assert.ok(it.meanings && typeof it.meanings === "object", domain + ": meanings of " + it.id);
    for (const k of Object.keys(it.meanings)) {
      assert.ok(Array.isArray(it.meanings[k]), `${domain}: ${it.id}.meanings.${k} not array`);
      it.meanings[k].forEach(s => assert.ok(typeof s === "string" && s.length > 0, `${domain}: empty meaning in ${it.id}.${k}`));
    }
    if (it.strength != null) assert.ok(it.strength >= 0 && it.strength <= 1, `${domain}: strength ${it.strength} of ${it.id}`);
  }
  assert.ok(!/NaN|undefined/.test(JSON.stringify(f)), domain + ": NaN/undefined leaked into facts");
}

/* ===================================================================== faceread */
const BOX = { x: 100, y: 100, w: 300, h: 380 };
const BASE = FR.synthFace(BOX);
const move = (pts, map) => pts.map((p, i) => (map[i] ? [p[0] + map[i][0], p[1] + map[i][1]] : p.slice()));

test("faceread: synthFace yields 68 finite points inside the box, analyze gives sane measurements", () => {
  assert.equal(BASE.length, 68);
  for (const [x, y] of BASE) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= BOX.x && x <= BOX.x + BOX.w && y >= BOX.y && y <= BOX.y + BOX.h, `point ${x},${y} outside box`);
  }
  const m = FR.analyze(BASE, null, 34).m;
  for (const k of Object.keys(FR.NORMS)) assert.ok(Number.isFinite(m[k]), k + " not finite");
  // symmetric, upright synthetic face
  assert.equal(m.roll, 0); assert.equal(m.yaw, 0);
  for (const k of ["browAsym", "mouthAsym", "alarAsym", "eyeAsym", "eyeTilt", "mouthTilt"]) assert.ok(Math.abs(m[k]) < 1e-9, k);
  assert.ok(Math.abs(m.cheekL - m.cheekR) < 1e-9);
  assert.equal(m.lipRatio, 1);
  // IPD in px: eye centres at u = 0.32 / 0.68 of a 300 px box
  assert.ok(Math.abs(m.ipdPx - 0.36 * 300) < 1e-9);
  // shares partition the face; no hairline image → upper is estimated
  assert.equal(m.upperEstimated, true);
  assert.ok(Math.abs(m.upperShare + m.middleShare + m.lowerShare - 1) < 1e-9);
  // plausible anatomical ranges (units: IPD or ratios)
  assert.ok(m.lengthRatio > 0.9 && m.lengthRatio < 2, "lengthRatio " + m.lengthRatio);
  assert.ok(m.jawRatio > 0.4 && m.jawRatio < 1.1, "jawRatio " + m.jawRatio);
  assert.ok(m.chinAngle > 60 && m.chinAngle < 180, "chinAngle " + m.chinAngle);
  assert.ok(m.eyeAspect > 1 && m.eyeAspect < 6, "eyeAspect " + m.eyeAspect);
  assert.ok(m.noseLen > 0.4 && m.noseLen < 1.5, "noseLen " + m.noseLen);
  assert.ok(m.mouthW > 0.5 && m.mouthW < 1.6, "mouthW " + m.mouthW);
});

test("faceread: measurements are invariant to translation, scale and in-plane rotation", () => {
  const m0 = FR.analyze(BASE, null, 30).m;
  const th = 0.2, c = Math.cos(th), s = Math.sin(th);
  const variants = {
    scaled: BASE.map(([x, y]) => [x * 2.5 + 40, y * 2.5 - 30]),
    rotated: BASE.map(([x, y]) => [x * c - y * s + 500, x * s + y * c]),
  };
  for (const [name, pts] of Object.entries(variants)) {
    const m = FR.analyze(pts, null, 30).m;
    for (const k of Object.keys(FR.NORMS)) assert.ok(Math.abs(m[k] - m0[k]) < 1e-6, `${name}: ${k} ${m0[k]} → ${m[k]}`);
  }
  const mr = FR.analyze(variants.rotated, null, 30).m;
  assert.ok(Math.abs(mr.roll - th * 180 / Math.PI) < 1e-6, "roll reports the rotation in degrees");
});

test("faceread: perturbing a feature moves the matching measurement in the expected direction", () => {
  const m0 = FR.analyze(BASE, null, 34).m;
  const M = map => FR.analyze(move(BASE, map), null, 34).m;
  // wider jaw (points 4 and 12 outward)
  assert.ok(M({ 4: [-15, 0], 12: [15, 0] }).jawRatio > m0.jawRatio + 0.05);
  // longer nose (nose base 31–35 lower)
  assert.ok(M({ 31: [0, 15], 32: [0, 15], 33: [0, 15], 34: [0, 15], 35: [0, 15] }).noseLen > m0.noseLen + 0.1);
  // taller (rounder) eyes → smaller length/height aspect
  assert.ok(M({ 37: [0, -5], 38: [0, -5], 43: [0, -5], 44: [0, -5], 40: [0, 5], 41: [0, 5], 46: [0, 5], 47: [0, 5] }).eyeAspect < m0.eyeAspect - 0.5);
  // wider mouth
  assert.ok(M({ 48: [-15, 0], 54: [15, 0] }).mouthW > m0.mouthW + 0.2);
  // longer chin → bigger lower zone, sharper chin angle
  const chin = M({ 8: [0, 20] });
  assert.ok(chin.lower > m0.lower + 0.1 && chin.chinAngle < m0.chinAngle - 10);
  // outer eye corners raised → positive eye tilt
  assert.ok(M({ 36: [0, -6], 45: [0, -6] }).eyeTilt > 0.1);
  // mouth corners raised → positive mouth tilt (smile)
  assert.ok(M({ 48: [0, -8], 54: [0, -8] }).mouthTilt > 0.05);
  // one brow raised → asymmetry
  assert.ok(M({ 19: [0, -6], 20: [0, -6] }).browAsym > 0.03);
});

test("faceread: classify / elementScores are deterministic, z-scores clamp, element % normalise", () => {
  const A = FR.analyze(BASE, null, 34), B = FR.analyze(BASE.map(p => p.slice()), null, 34);
  assert.deepEqual(A.cls, B.cls);
  assert.deepEqual(A.el.ranked, B.el.ranked);
  assert.equal(FR.zOf("jawRatio", 1e9), 2.5);
  assert.equal(FR.zOf("jawRatio", -1e9), -2.5);
  assert.equal(FR.zOf("jawRatio", FR.NORMS.jawRatio[0]), 0);
  const r = lcg(11);
  for (let i = 0; i < 300; i++) {
    const m = {};
    for (const k in FR.NORMS) m[k] = FR.NORMS[k][0] + (r() * 2 - 1) * 3 * FR.NORMS[k][1];
    const el = FR.elementScores(m);
    assert.equal(el.ranked.length, 5);
    assert.deepEqual(el.ranked.map(e => e.id).sort(), FR.ELEMENTS.slice().sort());
    const tot = el.ranked.reduce((s, e) => s + e.pct, 0);
    assert.ok(tot >= 97 && tot <= 103, "pct total " + tot);
    for (let j = 1; j < 5; j++) assert.ok(el.ranked[j - 1].score >= el.ranked[j].score, "ranked by score");
    assert.equal(el.top.id, el.ranked[0].id);
  }
  // a face
  // that is much longer than wide must score wood above water (wood +1.3·zL, water −1.1·zL)
  const med = Object.fromEntries(Object.keys(FR.NORMS).map(k => [k, FR.NORMS[k][0]]));
  const longF = FR.elementScores(Object.assign({}, med, { lengthRatio: FR.NORMS.lengthRatio[0] + 2 * FR.NORMS.lengthRatio[1] }));
  assert.ok(longF.raw.wood > longF.raw.water);
  const wideJaw = FR.elementScores(Object.assign({}, med, { jawRatio: FR.NORMS.jawRatio[0] + 2 * FR.NORMS.jawRatio[1] }));
  assert.ok(wideJaw.raw.metal > FR.elementScores(med).raw.metal && wideJaw.raw.earth > FR.elementScores(med).raw.earth);
});

test("faceread: buildFacts honours topic and follows the facts contract", () => {
  const R = FR.analyze(BASE, null, 34);
  for (const topic of FR.TOPIC_IDS) {
    const f = FR.buildFacts(R, { topic, age: 34 });
    assertFactsShape(f, "face", topic);
    assert.ok(f.items.some(i => /^element\./.test(i.id)), "element item");
    assert.ok(f.items.some(i => /^palace\./.test(i.id)), "palace items");
    // one item per palace, except palaces that rest on an estimated hairline (guanlu without a hair image)
    const measured = R.palaces.filter(p => !p.estimated).map(p => "palace." + p.id + "." + p.level).sort();
    assert.ok(R.palaces.find(p => p.id === "guanlu").estimated, "no image → hairline estimated");
    assert.equal(R.palaces.length, FR.PALACES.length);
    assert.deepEqual(f.items.filter(i => /^palace\.[a-z]+\.(high|mid|low)$/.test(i.id)).map(i => i.id).sort(), measured);
  }
  assert.equal(FR.buildFacts(R, { topic: "nonsense" }).topic, "overall");
  assert.equal(FR.buildFacts(R, {}).topic, "overall");
  // topic boost: the top element item is stronger when the topic matches one of its tags
  const ov = FR.buildFacts(R, { topic: "overall" }).items[0], love = FR.buildFacts(R, { topic: "love" }).items[0];
  assert.equal(ov.id, love.id);
  assert.ok(love.strength >= ov.strength);
});

test("faceread: missing or short landmark arrays throw instead of returning a bogus reading", () => {
  for (const bad of [null, undefined, [], BASE.slice(0, 20)]) assert.throws(() => FR.analyze(bad, null, 30));
  assert.equal(FR.quality(null, 640, 480)[0].ok, false);
});

// Degenerate landmark sets (all 68 points identical, e.g. a broken detector frame) are rejected with a clear message
// instead of leaking NaN ratios into the facts ("ธาตุไม้ NaN%").
test("faceread: degenerate landmarks (all points equal / non-finite) are rejected, no NaN reaches facts", () => {
  assert.throws(() => FR.analyze(BASE.map(() => [5, 5]), null, 30), /ไม่ชัด/);
  assert.throws(() => FR.analyze(BASE.map((p, i) => (i === 40 ? [NaN, 1] : p)), null, 30), /ไม่สมบูรณ์/);
  const f = FR.buildFacts(FR.analyze(BASE, null, 30), { topic: "work" });
  assert.ok(!/NaN/.test(JSON.stringify(f)));
});

/* ===================================================================== horoscope */
test("horoscope: weekday of known dates (0 = Sunday)", () => {
  const cases = [[2000, 1, 1, 6], [1900, 1, 1, 1], [1969, 7, 20, 0], [1990, 5, 15, 2], [2001, 9, 11, 2], [2024, 2, 29, 4], [2026, 11, 6, 5], [2100, 12, 31, 5]];
  for (const [y, m, d, w] of cases) {
    assert.equal(HS.weekday(y, m, d), w, `${y}-${m}-${d}`);
    assert.equal(HS.weekday(y, m, d), new Date(Date.UTC(y, m - 1, d)).getUTCDay(), "agrees with JS Date");
  }
  // analyze reports the same weekday when no birth time is given
  assert.equal(HS.analyze({ y: 2000, m: 1, d: 1, time: null }).thaiDay.weekday, 6);
});

test("horoscope: Thai birth-day rules — Wednesday night (Rahu) and day change at sunrise", () => {
  // 1990-05-16 is a Wednesday
  assert.equal(HS.thaiBirthDay(1990, 5, 16, { h: 10, mi: 0 }, true).planet, 3);
  assert.equal(HS.thaiBirthDay(1990, 5, 16, { h: 19, mi: 0 }, true).planet, 7, "Wed after 18:00 → Rahu");
  const thuEarly = HS.thaiBirthDay(1990, 5, 17, { h: 4, mi: 0 }, true);
  assert.equal(thuEarly.weekday, 3); assert.equal(thuEarly.planet, 7); assert.equal(thuEarly.shifted, true);
  // Sunday 05:00 counts as Saturday under the sunrise rule, Sunday under the midnight rule
  assert.equal(HS.thaiBirthDay(2000, 1, 2, { h: 5, mi: 0 }, true).weekday, 6);
  assert.equal(HS.thaiBirthDay(2000, 1, 2, { h: 5, mi: 0 }, false).weekday, 0);
  // unknown time on a Wednesday: flagged as possibly Rahu
  const u = HS.thaiBirthDay(1990, 5, 16, null, true);
  assert.equal(u.unknownTime, true); assert.equal(u.maybeRahu, true); assert.equal(u.planet, 3);
});

test("horoscope: taksa wheel for a Sunday-born (บริวาร อาทิตย์ … กาลกิณี ศุกร์)", () => {
  assert.deepEqual(HS.taksa(0), { boriwan: 0, ayu: 1, dech: 2, sri: 3, mula: 6, utsaha: 4, montri: 7, kalakini: 5 });
  // Monday-born: กาลกิณี = อาทิตย์ (standard Thai table)
  assert.equal(HS.taksa(1).kalakini, 0);
  for (let p = 0; p < 8; p++) assert.equal(new Set(Object.values(HS.taksa(p))).size, 8, "taksa is a permutation");
});

test("horoscope: Chinese New Year dates (incl. the 2033 leap-month case)", () => {
  const CNY = { 1985: [2, 20], 1990: [1, 27], 2000: [2, 5], 2001: [1, 24], 2010: [2, 14], 2017: [1, 28], 2020: [1, 25], 2023: [1, 22], 2024: [2, 10], 2026: [2, 17], 2033: [1, 31], 2034: [2, 19] };
  for (const y in CNY) { const c = HS.chineseNewYear(+y); assert.deepEqual([c.y, c.m, c.d], [+y].concat(CNY[y]), "CNY " + y); }
});

test("horoscope: zodiac year boundaries (Chinese New Year / lichun / Thai month 5)", () => {
  const Z = (y, m, d) => HS.zodiacYears(y, m, d, HS.julianDay(y, m, d, 5), 7);
  // 2000-01-01: still the Rabbit (卯 = 3) year 1999 in every system
  let z = Z(2000, 1, 1);
  assert.equal(z.chinese.year, 1999); assert.equal(z.chinese.animal, 3); assert.equal(z.lichun.animal, 3); assert.equal(z.thai.animal, 3);
  // 2000-03-01: Dragon by CNY (Feb 5) and lichun (Feb 4); Thai year changes at month 5 (≈ Apr 5) → still Rabbit
  z = Z(2000, 3, 1);
  assert.equal(z.chinese.animal, 4); assert.equal(z.lichun.animal, 4); assert.equal(z.thai.animal, 3); assert.equal(z.differ, true);
  assert.equal(Z(2000, 5, 1).thai.animal, 4);
  // 1984-02-03 (after CNY Feb 2, before lichun Feb 4) → CNY rat, lichun pig
  z = Z(1984, 2, 3);
  assert.equal(z.chinese.animal, 0); assert.equal(z.lichun.animal, 11);
  // Thai ขึ้น 1 ค่ำ เดือน 5: 2020-03-24, 2024-04-09, 2026-03-19 (2026 is an อธิกมาส year; มาฆบูชา on เดือน 4 = 3 Mar)
  for (const [y, m, d] of [[2020, 3, 24], [2024, 4, 9], [2026, 3, 19]]) {
    const t = HS.fromJD(HS.thaiMonth5Start(y) + 7 / 24);
    const diff = Math.abs(HS.jdn(t.y, t.m, t.d) - HS.jdn(y, m, d));
    assert.ok(diff <= 1, `month 5 of ${y}: got ${t.y}-${t.m}-${t.d}`);
  }
});

test("horoscope: BaZi pillars against known anchors", () => {
  assert.equal(HS.dayPillarJDN(HS.jdn(2000, 1, 1)).gz, "戊午");
  assert.equal(HS.dayPillarJDN(HS.jdn(1949, 10, 1)).gz, "甲子");
  assert.equal(HS.dayPillarJDN(HS.jdn(2024, 2, 10)).gz, "甲辰");
  // 60-day cycle
  assert.equal(HS.dayPillarJDN(HS.jdn(2000, 1, 1) + 60).gz, "戊午");
  // 2024-03-01 12:00 (Beijing): 甲辰 year, 丙寅 month (五虎遁: 甲 year → 丙寅), 甲子 day (2024-02-10 甲辰 + 20), 庚午 hour (甲 day → 午 = 庚午)
  const b = HS.bazi({ y: 2024, m: 3, d: 1, time: { h: 12, mi: 0 }, tz: 8 });
  assert.deepEqual([b.year.gz, b.month.gz, b.day.gz, b.hour.gz], ["甲辰", "丙寅", "甲子", "庚午"]);
  // 1984-02-05 00:30 (after lichun 1984-02-04 23:19 CST): 甲子 year, 丙寅 month, 子 hour of a 己 day → 甲子 hour
  const c = HS.bazi({ y: 1984, m: 2, d: 5, time: { h: 0, mi: 30 }, tz: 8 });
  assert.equal(c.year.gz, "甲子"); assert.equal(c.month.gz, "丙寅"); assert.equal(c.hour.gz, "甲子");
  // 1984-02-04 12:00 CST is before lichun → still 癸亥 year, 乙丑 month
  const d = HS.bazi({ y: 1984, m: 2, d: 4, time: { h: 12, mi: 0 }, tz: 8 });
  assert.equal(d.year.gz, "癸亥"); assert.equal(d.month.gz, "乙丑");
  // element relations (生/克)
  assert.equal(HS.relation("wood", "fire"), "output");
  assert.equal(HS.relation("wood", "water"), "resource");
  assert.equal(HS.relation("wood", "earth"), "wealth");
  assert.equal(HS.relation("wood", "metal"), "power");
  assert.equal(HS.branchRel(0, 6), "clash"); assert.equal(HS.branchRel(0, 1), "harmony"); assert.equal(HS.branchRel(8, 4), "trine");
});

test("horoscope: sidereal (Thai) sun sign boundaries around Songkran", () => {
  const rasi = (m, d) => HS.sunRasi(HS.julianDay(2000, m, d, 5)).index;
  assert.equal(rasi(4, 10), 11, "10 Apr → มีน");
  assert.equal(rasi(4, 20), 0, "20 Apr → เมษ");
  assert.equal(rasi(5, 10), 0); assert.equal(rasi(5, 20), 1, "20 May → พฤษภ");
  assert.equal(rasi(8, 1), 3, "1 Aug → กรกฎ");
  assert.equal(rasi(1, 1), 8, "1 Jan → ธนู");
});

test("horoscope: lagna depends on birth time, equals the sun's sign at sunrise, null without time", () => {
  const P = t => HS.analyze({ y: 1990, m: 5, d: 15, time: t });
  assert.equal(P(null).lagna, null);
  const seen = new Set();
  for (let h = 0; h < 24; h++) seen.add(P({ h, mi: 0 }).lagna.index);
  assert.ok(seen.size >= 11, "lagna sweeps the zodiac in a day: " + [...seen]);
  const dawn = P({ h: 6, mi: 0 }); // Bangkok sunrise ≈ 05:50 mid-May
  assert.equal(dawn.lagna.index, dawn.sunRasi.index);
  assert.notEqual(P({ h: 12, mi: 0 }).lagna.index, dawn.lagna.index);
});

test("horoscope: life path, date validation and era conversion", () => {
  assert.deepEqual(HS.lifePath(1990, 5, 15), { value: 3, parts: [5, 6, 1], total: 12 }); // 5 + (1+5) + (1+9+9+0→19→1)
  assert.deepEqual(HS.lifePath(2009, 11, 2).parts, [11, 2, 11], "master numbers kept per part");
  assert.equal(HS.lifePath(2009, 11, 2).value, 6);
  assert.equal(HS.reduceNum(29, true), 11); assert.equal(HS.reduceNum(29, false), 2); assert.equal(HS.reduceNum(38, false), 2);
  assert.equal(HS.validateDate(2000, 2, 29), "");
  assert.notEqual(HS.validateDate(2001, 2, 29), "");
  assert.notEqual(HS.validateDate(1900, 2, 29), "", "1900 not a leap year");
  assert.notEqual(HS.validateDate(1899, 12, 31), "");
  assert.notEqual(HS.validateDate(2000, 13, 1), "");
  assert.equal(HS.toCE(2533, "auto"), 1990); assert.equal(HS.toCE(1990, "auto"), 1990); assert.equal(HS.toCE(2533, "be"), 1990);
  assert.ok(Number.isNaN(HS.toCE("abc", "auto")));
});

test("horoscope: buildFacts shape, topic, lagna item only with a birth time, seeded determinism", () => {
  const rng = () => TR.mulberry32(9);
  const withT = HS.analyze({ y: 1990, m: 5, d: 15, time: { h: 8, mi: 30 } }), noT = HS.analyze({ y: 1990, m: 5, d: 15, time: null });
  const f = HS.buildFacts(withT, { topic: "love", rng: rng() });
  assertFactsShape(f, "horoscope", "love");
  assert.ok(f.items.some(i => i.id === "thai.day.2"), "Tuesday item");
  assert.ok(f.items.some(i => /^thai\.lagna\./.test(i.id)));
  assert.ok(f.items.some(i => i.id === "num.lp.3"));
  assert.ok(f.items.some(i => i.id === "num.bday.15"));
  const g = HS.buildFacts(noT, { rng: rng() });
  assert.equal(g.topic, "overall");
  assert.ok(!g.items.some(i => /^thai\.lagna\./.test(i.id)));
  assertFactsShape(g, "horoscope");
  assert.deepEqual(HS.buildFacts(withT, { topic: "work", rng: rng() }), HS.buildFacts(withT, { topic: "work", rng: rng() }));
  // nickname: only short single-word nicknames pass through
  assert.deepEqual(HS.buildFacts(noT, { rng: rng(), nickname: "ต้น" }).subject, { nickname: "ต้น" });
  assert.deepEqual(HS.buildFacts(noT, { rng: rng(), nickname: "สมชาย ใจดี" }).subject, {});
});

/* ===================================================================== tarot */
test("tarot: deck is 78 unique cards — 22 majors 0..21, 4 suits × 14 with the right elements and courts", () => {
  const C = TKB.cards;
  assert.equal(C.length, 78);
  assert.equal(new Set(C.map(c => c.id)).size, 78);
  const maj = C.filter(c => c.arcana === "major");
  assert.deepEqual(maj.map(c => c.n).sort((a, b) => a - b), Array.from({ length: 22 }, (_, i) => i));
  const EL = { wands: "fire", cups: "water", swords: "air", pentacles: "earth" };
  for (const s in EL) {
    const cs = C.filter(c => c.suit === s);
    assert.equal(cs.length, 14, s);
    assert.deepEqual(cs.map(c => c.n).sort((a, b) => a - b), Array.from({ length: 14 }, (_, i) => i + 1), s);
    cs.forEach(c => { assert.equal(c.element, EL[s], c.id); assert.equal(!!c.court, c.n >= 11, c.id + " court"); });
  }
  for (const c of C) {
    assert.equal(TKB.byId[c.id], c);
    for (const o of ["u", "r"]) for (const t of ["general", "love", "work", "money"]) assert.ok(c.phr[o][t].length > 0, `${c.id} ${o}.${t}`);
    assert.ok(c.keywords.length >= 2, c.id);
  }
  // well-known elemental attributions: Fool = air, Death (Scorpio) = water, Sun = fire
  assert.equal(TKB.byId.m00.element, "air"); assert.equal(TKB.byId.m13.element, "water"); assert.equal(TKB.byId.m19.element, "fire");
});

test("tarot: spreads have the documented number of positions with unique keys", () => {
  const N = { one: 1, three: 3, threeAdvice: 3, celtic: 10, love5: 5 };
  assert.deepEqual(TKB.spreadOrder.slice().sort(), Object.keys(N).sort());
  for (const k in N) {
    const P = TKB.spreads[k].positions;
    assert.equal(P.length, N[k], k);
    assert.equal(new Set(P.map(p => p.key)).size, P.length, k + " keys unique");
  }
  assert.deepEqual(TKB.spreads.three.positions.map(p => p.key), ["past", "present", "future"]);
});

test("tarot: seeded shuffle is a deterministic permutation; randInt rejects the biased tail", () => {
  const u32 = seed => { const r = TR.mulberry32(seed); return () => Math.floor(r() * 4294967296); };
  const a = TR.makeDeck(true, u32(7)), b = TR.makeDeck(true, u32(7)), c = TR.makeDeck(true, u32(8));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map(x => x.id), c.map(x => x.id));
  assert.equal(new Set(a.map(x => x.id)).size, 78);
  assert.ok(a.some(x => x.rev) && a.some(x => !x.rev), "reversals present when enabled");
  assert.ok(TR.makeDeck(false, u32(7)).every(x => x.rev === false), "no reversals when disabled");
  // 4294967295 ≥ floor(2^32/5)*5 → rejected; next draw 7 → 7 % 5
  const seq = [4294967295, 7];
  assert.equal(TR.randInt(5, () => seq.shift()), 2);
  // roughly uniform
  const cnt = [0, 0, 0, 0, 0, 0], g = u32(3);
  for (let i = 0; i < 6000; i++) cnt[TR.randInt(6, g)]++;
  cnt.forEach(n => assert.ok(n > 850 && n < 1150, "bucket " + n));
  // daily card: stable within a day
  assert.equal(TR.dailyCard(new Date(2026, 10, 6, 1)).id, TR.dailyCard(new Date(2026, 10, 6, 23)).id);
});

test("tarot: synthesize counts majors / reversals / elements correctly", () => {
  const picks = [{ id: "m00", rev: false }, { id: "cups03", rev: true }, { id: "m13", rev: false }];
  const y = TR.synthesize(picks, "love", "three");
  assert.equal(y.n, 3); assert.equal(y.majors, 2); assert.equal(y.reversed, 1); assert.equal(y.courts, 0); assert.equal(y.aces, 0);
  assert.deepEqual(y.elements, { fire: 0, water: 2, air: 1, earth: 0 });
  assert.equal(y.dominant, "water");
  const z = TR.synthesize([{ id: "wands01", rev: false }, { id: "cups12", rev: false }, { id: "swords13", rev: false }], "work", "threeAdvice");
  assert.equal(z.aces, 1); assert.equal(z.courts, 2); assert.equal(z.majors, 0); assert.equal(z.dominant, null);
  assert.equal(z.adviceCard, "swords13", "advice comes from the advice position");
});

test("tarot: buildFacts gives one item per card with position info and honours reversed", () => {
  const r = TR.mulberry32(1234), C = TKB.cards;
  for (const spread of TKB.spreadOrder) {
    const P = TKB.spreads[spread].positions;
    for (let trial = 0; trial < 6; trial++) {
      const ids = TR.shuffle(C.map(c => c.id), () => Math.floor(r() * 4294967296)).slice(0, P.length);
      const picks = ids.map((id, i) => ({ id, rev: (i + trial) % 2 === 1 }));
      const topic = ["general", "love", "work", "money"][trial % 4];
      const f = TR.buildFacts(picks, topic, spread, { rng: TR.mulberry32(trial) });
      assertFactsShape(f, "tarot", topic === "general" ? "overall" : topic);
      const cards = f.items.filter(i => /^card\./.test(i.id));
      assert.equal(cards.length, P.length, spread);
      cards.forEach((it, i) => {
        assert.equal(it.id, "card." + P[i].key + "." + picks[i].id + (picks[i].rev ? ".r" : ""));
        assert.ok(it.evidence.startsWith("ตำแหน่งที่ " + (i + 1) + " "), it.evidence);
        assert.equal(/กลับหัว/.test(it.label), picks[i].rev, "reversed label " + it.id);
      });
      assert.equal(f.items[0].id, "spread.pattern");
      assert.ok(f.items.filter(i => /^pair\./.test(i.id)).length <= 3);
      // deterministic for the same rng seed
      assert.deepEqual(f, TR.buildFacts(picks, topic, spread, { rng: TR.mulberry32(trial) }));
    }
  }
});

test("tarot: siamsee has 28 numbered sticks and siamseeFacts carries every topic", () => {
  assert.equal(TKB.siamsee.length, 28);
  assert.deepEqual(TKB.siamsee.map(s => s.n), Array.from({ length: 28 }, (_, i) => i + 1));
  for (const s of TKB.siamsee) {
    assert.ok(Array.isArray(s.verse) && s.verse.length >= 2, "verse " + s.n);
    const f = TR.siamseeFacts(s, { topic: "money" });
    assertFactsShape(f, "siamsee", "money");
    assert.equal(f.items.length, 1);
    assert.equal(f.items[0].id, "siamsee." + s.n);
    for (const k of ["overview", "work", "money", "love", "advice", "timing"]) assert.ok(f.items[0].meanings[k].length > 0, `#${s.n} ${k}`);
    assert.ok(f.headline.includes(String(s.n)) && f.headline.includes(s.level));
  }
  assert.equal(TR.siamseeFacts(TKB.siamsee[0]).topic, "overall");
});

/* ===================================================================== numbers */
test("numbers: digit normalisation and Thai mobile validation", () => {
  assert.equal(NM.onlyDigits("๐๘๑-๒๓๔ ๕๖๗๘"), "0812345678");
  assert.equal(NM.onlyDigits(null), "");
  assert.ok(NM.isThaiMobile("0812345678") && NM.isThaiMobile("0612345678") && NM.isThaiMobile("0912345678"));
  for (const bad of ["021234567", "0212345678", "071234567", "08123456789", "8123456789"]) assert.ok(!NM.isThaiMobile(bad), bad);
  for (const bad of ["", "abc", "0212345678", "08123", "081234567890", null]) assert.ok(NM.analyzePhone(bad).error, "phone " + bad);
  assert.deepEqual(NM.analyzePhone("081-234-5678").pairs, NM.analyzePhone("0812345678").pairs);
  assert.deepEqual(NM.analyzePhone("๐๘๑๒๓๔๕๖๗๘").sum, NM.analyzePhone("0812345678").sum);
  assert.ok(NM.analyzeHouse("").error); assert.ok(NM.analyzeHouse("12345678901").error);
  assert.ok(NM.analyzeAccount("123").error); assert.ok(NM.analyzeAccount("12345678").error);
  assert.ok(NM.analyzePlate("2345").error); assert.ok(NM.analyzePlate("กขคง 12").error);
});

test("numbers: phone pairs, positions, weights and digit sum (hand-computed)", () => {
  const r = NM.analyzePhone("0812345678"); // last 7 = 2345678 starting at position 4
  assert.equal(r.segStart, 4);
  assert.deepEqual(r.pairs.map(p => p.pair), ["23", "34", "45", "56", "67", "78"]);
  assert.deepEqual(r.pairs.map(p => p.pos), [[4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]]);
  assert.deepEqual(r.pairs.map(p => p.weight), [1, 1, 1, 1, 1.3, 1.6]);
  assert.equal(r.sum.sum, 44); // 0+8+1+2+3+4+5+6+7+8
  assert.equal(r.sum.root, 8);
  assert.ok(r.patterns.some(p => p.id === "up"), "2345678 ascending");
  assert.ok(r.score >= 0 && r.score <= 100);
  const all = NM.analyzePhone("0812345678", "all");
  assert.equal(all.pairs.length, 9); assert.equal(all.segStart, 1);
  assert.equal(NM.sumDigits("0999999999"), 81); assert.equal(NM.reduceDigit(81), 9); assert.equal(NM.reduceDigit(99), 9); assert.equal(NM.reduceDigit(0), 0);
  assert.equal(NM.pairKey("91"), "19"); assert.equal(NM.pairKey("19"), "19");
  // every one of the 100 ordered pairs and every sum 0..99 resolves in the KB
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) assert.doesNotThrow(() => NM.pairInfo("" + a + b));
  for (let s = 0; s <= 99; s++) { const i = NM.sumInfo(s, "phone"); assert.ok(i.pts > 0 && i.name, "sum " + s); }
  assert.equal(NM.sumInfo(145, "phone").sum, 10, "sums >99 fold to digit sum");
});

test("numbers: pattern detector", () => {
  const ids = s => NM.detectPatterns(s).map(p => p.id);
  assert.ok(ids("5551").includes("run"));
  assert.ok(ids("1234").includes("up")); assert.ok(ids("9876").includes("down"));
  assert.ok(ids("12321").includes("mirror"));
  assert.ok(ids("1212").includes("abab"));
  assert.ok(ids("3311").includes("aabb"));
  assert.ok(ids("1357").includes("nozero")); assert.ok(!ids("1307").includes("nozero"));
  assert.deepEqual(ids("1357").filter(x => x !== "nozero"), []);
  assert.ok(!ids("1111").includes("mirror"), "single-digit runs are not mirrors");
  const p = NM.detectPatterns("2345", 4).find(x => x.id === "up");
  assert.ok(p.evidence.includes("4–7"), "evidence offsets by the segment start: " + p.evidence);
});

test("numbers: plate, house and account arithmetic", () => {
  const p = NM.analyzePlate("1กข 2345");
  assert.equal(p.lead, "1"); assert.equal(p.letters, "กข"); assert.equal(p.num, "2345");
  assert.equal(p.total, 1 + 2 + 3 + 4 + 5 + NM.letterValue("ก") + NM.letterValue("ข"));
  assert.deepEqual(p.pairs.map(x => x.pair), ["23", "34", "45"]);
  assert.deepEqual(p.pairs.map(x => x.pos), [[4, 5], [5, 6], [6, 7]], "positions count the lead digit and letters");
  assert.deepEqual(NM.analyzePlate("กข-1234").pairs.map(x => x.pair), ["12", "23", "34"]);
  const h = NM.analyzeHouse("123/45");
  assert.equal(h.digits, "12345"); assert.equal(h.sum.sum, 15); assert.equal(h.pairs.length, 4);
  const h1 = NM.analyzeHouse("7");
  assert.equal(h1.pairs.length, 0); assert.equal(h1.sum.sum, 7); assert.equal(h1.score, h1.sum.pts);
  const a = NM.analyzeAccount("4589");
  assert.equal(a.sum.sum, 26); assert.deepEqual(a.pairs.map(x => x.pair), ["45", "58", "89"]);
});

test("numbers: masking keeps at most the last few digits; compare ranks valid numbers first", () => {
  assert.equal(NM.maskPhone("0812345678"), "08x-xxx-5678");
  assert.equal(NM.maskAccount("1234567"), "xxx-4567");
  assert.equal(NM.maskHouse("12345"), "เลขที่ xxx45");
  assert.equal(NM.maskPlate("1", "กข", "2345"), "xกข xx45");
  assert.ok(!NM.analyzePhone("0812345678").masked.includes("234"));
  const c = NM.compare(["0812345678", "123", "0998887777"]);
  assert.equal(c.length, 3);
  assert.ok(c[c.length - 1].error, "invalid entry sorted last");
  assert.ok(c[0].score >= c[1].score);
  assert.equal(NM.compare(["", " ", null]).length, 0);
});

/* ===================================================================== fengshui */
/** Kua by the textbook rule: reduce the last two digits of the solar year to one digit;
    before 2000 male = 10 − r, female = 5 + r; from 2000 male = 9 − r, female = 6 + r; reduce again; 5 → 2 (male) / 8 (female). */
function kuaByHand(year, male) {
  const red = n => { while (n > 9) n = String(n).split("").reduce((s, c) => s + +c, 0); return n; };
  const r = red(year % 100);
  let k = year < 2000 ? (male ? 10 - r : 5 + r) : (male ? 9 - r : 6 + r);
  k = red(k);
  if (k === 0) k = 9;
  if (k === 5) k = male ? 2 : 8;
  return k;
}
// Standard Eight Mansions (八宅) table — independent of fengshui-kb.js
const EIGHT = {
  1: ["SE", "E", "S", "N", "W", "NE", "NW", "SW"], 2: ["NE", "W", "NW", "SW", "E", "SE", "S", "N"],
  3: ["S", "N", "SE", "E", "SW", "NW", "NE", "W"], 4: ["N", "S", "E", "SE", "NW", "SW", "W", "NE"],
  6: ["W", "NE", "SW", "NW", "SE", "E", "N", "S"], 7: ["NW", "SW", "NE", "W", "N", "S", "SE", "E"],
  8: ["SW", "NW", "W", "NE", "S", "N", "E", "SE"], 9: ["E", "SE", "N", "S", "NE", "W", "SW", "NW"]
};
const STARS = ["shengqi", "tianyi", "yannian", "fuwei", "huohai", "wugui", "liusha", "jueming"];

test("fengshui: kua number matches the textbook formula for 1900–2099, both genders", () => {
  // spot checks done by hand
  assert.equal(FS.kua(1988, "yang").kua, 3); assert.equal(FS.kua(1988, "yin").kua, 3);
  assert.equal(FS.kua(1977, "yang").kua, 2); assert.equal(FS.kua(1977, "yang").raw, 5); assert.equal(FS.kua(1977, "yin").kua, 1);
  assert.equal(FS.kua(1986, "yin").kua, 1); assert.equal(FS.kua(1990, "yin").kua, 8); assert.equal(FS.kua(1990, "yin").raw, 5);
  assert.equal(FS.kua(2000, "yang").kua, 9); assert.equal(FS.kua(2000, "yin").kua, 6);
  assert.equal(FS.kua(2009, "yang").kua, 9); assert.equal(FS.kua(2014, "yang").kua, 4);
  for (let y = 1900; y <= 2099; y++) {
    assert.equal(FS.kua(y, "yang").kua, kuaByHand(y, true), "male " + y);
    assert.equal(FS.kua(y, "yin").kua, kuaByHand(y, false), "female " + y);
  }
});

test("fengshui: east/west groups and Eight Mansions directions", () => {
  const EAST = ["N", "S", "E", "SE"], WEST = ["NE", "SW", "W", "NW"];
  for (const k of [1, 2, 3, 4, 6, 7, 8, 9]) {
    const grp = FS.kuaGroup(k);
    assert.equal(grp, [1, 3, 4, 9].includes(k) ? "east" : "west", "group " + k);
    const stars = STARS.map(s => FS.starOfDir(k, EIGHT[k][STARS.indexOf(s)]));
    assert.deepEqual(stars, STARS, "kua " + k + " table");
    const good = EIGHT[k].slice(0, 4);
    assert.equal(new Set(good).size, 4);
    assert.deepEqual(good.slice().sort(), (grp === "east" ? EAST : WEST).slice().sort(), "kua " + k + " lucky dirs in own group");
    assert.equal(new Set(EIGHT[k]).size, 8);
  }
  assert.equal(FS.kuaGroup(5), "west");
});

test("fengshui: lichun dates and solar-year boundary", () => {
  const L = { 1985: 4, 1990: 4, 2021: 3, 2024: 4, 2025: 3, 2026: 4 };
  for (const y in L) assert.deepEqual(FS.lichun(+y), { y: +y, m: 2, d: L[y] }, "lichun " + y);
  assert.equal(FS.solarYear(1990, 1, 20).year, 1989);
  assert.equal(FS.solarYear(1990, 2, 3).year, 1989);
  assert.equal(FS.solarYear(1990, 2, 4).year, 1990); assert.equal(FS.solarYear(1990, 2, 4).boundary, "same");
  assert.equal(FS.solarYear(1990, 2, 3).boundary, "near");
  assert.equal(FS.solarYear(1990, 6, 1).year, 1990); assert.equal(FS.solarYear(1990, 6, 1).boundary, null);
  // born 1990-01-20 → kua uses 1989: male 10 − (8+9→17→8) = 2, female 5 + 8 = 13 → 4
  const sy = FS.solarYear(1990, 1, 20).year;
  assert.equal(FS.kua(sy, "yang").kua, 2); assert.equal(FS.kua(sy, "yin").kua, 4);
  assert.equal(FS.toCE(2531, "be"), 1988); assert.equal(FS.toCE(2531, "auto"), 1988); assert.equal(FS.toCE(1988, "auto"), 1988);
  assert.ok(Number.isNaN(FS.toCE("x", "auto")));
  assert.equal(FS.validDate(2000, 2, 29), true); assert.equal(FS.validDate(2001, 2, 29), false); assert.equal(FS.validDate(2001, 4, 31), false);
});

test("fengshui: annual / monthly flying stars and the Lo Shu flight path", () => {
  // annual centre star: 2023 = 4, 2024 = 3, 2025 = 2, 2026 = 1, 2027 = 9
  assert.deepEqual([2023, 2024, 2025, 2026, 2027].map(FS.annualCenter), [4, 3, 2, 1, 9]);
  // 2024: five yellow in W, two black in SE; 2026: five yellow in S
  const c24 = FS.flyChart(3);
  assert.deepEqual(c24, { C: 3, NW: 4, W: 5, NE: 6, S: 7, N: 8, SW: 9, E: 1, SE: 2 });
  assert.equal(Object.keys(FS.flyChart(1)).find(k => FS.flyChart(1)[k] === 5), "S");
  for (let c = 1; c <= 9; c++) assert.deepEqual(Object.values(FS.flyChart(c)).sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // monthly star: 子午卯酉 years start 寅 month at 8 and count down; 2026-11-06 (before 立冬 Nov 7) is 戌 month → 9
  const mi = FS.monthInfo(2026, 11, 6);
  assert.equal(mi.solarYear, 2026); assert.equal(mi.k, 8); assert.equal(mi.center, 9); assert.equal(mi.yearCenter, 1);
  assert.equal(FS.monthInfo(2026, 11, 8).center, 8, "立冬 → 亥 month star 8");
  // 2024 (辰 year) 寅 month = 5; January 2025 still belongs to solar year 2024 (丑 month, k = 11)
  assert.equal(FS.monthInfo(2024, 2, 20).center, 5);
  const jan = FS.monthInfo(2025, 1, 20);
  assert.equal(jan.solarYear, 2024); assert.equal(jan.k, 11); assert.equal(jan.yearCenter, 3);
});

test("fengshui: compass heading to direction and angle helpers", () => {
  const D = [[0, "N"], [22, "N"], [23, "NE"], [45, "NE"], [90, "E"], [135, "SE"], [180, "S"], [225, "SW"], [270, "W"], [315, "NW"], [337, "NW"], [338, "N"], [-45, "NW"], [720, "N"], [359.9, "N"]];
  for (const [h, d] of D) assert.equal(FS.headingToDir(h), d, "heading " + h);
  assert.equal(FS.angDiff(10, 350), 20); assert.equal(FS.angDiff(350, 10), -20); assert.equal(FS.angDiff(180, 0), -180);
  assert.equal(FS.smoothHeading(null, 370), 10);
  assert.ok(Math.abs(FS.smoothHeading(350, 10, 0.5) - 0) < 1e-9 || Math.abs(FS.smoothHeading(350, 10, 0.5) - 360) < 1e-9, "wraps through north");
});

test("fengshui: buildFacts shape — kua items, recorded directions judged against the kua table, topic", () => {
  const K = Object.assign(FS.kua(1988, "yang"), { solarYear: 1988 }); // kua 3: shengqi S, jueming W
  const f = FS.buildFacts({ kua: K, recorded: { door: "S", bed: "W" }, recordedDeg: { door: 181 }, rooms: [], photos: [], topic: "work", now: new Date(2026, 10, 6) });
  assertFactsShape(f, "fengshui", "work");
  const ids = f.items.map(i => i.id);
  for (const id of ["year.center.1", "month.center.9", "kua.3", "dir.shengqi", "dir.tianyi", "dir.yannian", "dir.fuwei", "dir.quiet", "rec.door.S", "rec.bed.W"]) assert.ok(ids.includes(id), id);
  const door = f.items.find(i => i.id === "rec.door.S"), bed = f.items.find(i => i.id === "rec.bed.W");
  assert.ok(door.strength > bed.strength, "door on shengqi beats bed on jueming");
  assert.equal(f.extras.directions.length, 4);
  assert.equal(new Set(f.extras.directions).size, 4);
  // no kua: only the year/month stars, overall topic
  const g = FS.buildFacts({ kua: null, recorded: {}, rooms: [], photos: [], now: new Date(2026, 10, 6) });
  assertFactsShape(g, "fengshui", "overall");
  assert.deepEqual(g.items.map(i => i.id), ["year.center.1", "month.center.9"]);
});

/* ---------- helpers ---------- */
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }; }
