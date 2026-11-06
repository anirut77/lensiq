"use strict";
// node --test tests/unit — new fortune pages: fortune-kit.js (stats, relabel), iching.js (coin toss, King Wen table,
// changing lines → relating hexagram, Zhu Xi focus rule), zodiac.js (CNY / Lichun boundaries, branch relations,
// ปีชง 2026), astro.js (Sun sign boundaries, Moon vs Meeus 47.a + new moons, Ascendant vs brute force),
// dream.js (symbol detection, dream type), and the safety filter over every KB string + composed readings.
const test = require("node:test");
const assert = require("node:assert/strict");
const FA = require("../../fortune-ai.js");
const FK = require("../../fortune-kit.js");
const IC = require("../../iching.js");
const ICKB = require("../../iching-kb.js");
const ZD = require("../../zodiac.js");
const ZKB = require("../../zodiac-kb.js");
const AS = require("../../astro.js");
const AKB = require("../../astro-kb.js");
const DR = require("../../dream.js");
const DKB = require("../../dream-kb.js");
const HS = require("../../horoscope.js");

const seq = arr => { let i = 0; return () => arr[i++ % arr.length]; };
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/* ---------------- fortune-kit ---------------- */
test("kit: addStat counts dims, keeps other dims, trims to 120 days", () => {
  let s = FK.addStat(null, { hex: [1, 2], topics: "love" }, Date.UTC(2026, 10, 6));
  s = FK.addStat(s, { hex: 1, other: null }, Date.UTC(2026, 10, 6));
  assert.equal(s.total, 2);
  assert.deepEqual(s.hex, { 1: 2, 2: 1 });
  assert.deepEqual(s.topics, { love: 1 });
  assert.equal(Object.values(s.days).reduce((a, b) => a + b, 0), 2);
  let t = null; for (let i = 0; i < 130; i++) t = FK.addStat(t, {}, Date.UTC(2026, 0, 1) + i * 86400000);
  assert.equal(Object.keys(t.days).length, 120);
  assert.equal(t.total, 130);
});
test("kit: factsDomain falls back to supported domain and relabel swaps the domain name", () => {
  assert.equal(FK.factsDomain("iching", FA), "iching"); // fortune-ai.js now supports the real domain
  assert.equal(FK.factsDomain("iching", {}), "siamsee"); // older fortune-ai.js without DOMAIN_NAMES
  assert.equal(FK.factsDomain("astro", { DOMAIN_NAMES: { astro: "x" } }), "astro");
  const r = FK.relabel({ source: "local", sections: [{ id: "overview", title: "t", paragraphs: ["ตามคำเซียมซี คุณ…"] }] }, "iching", "siamsee");
  assert.equal(r.sections[0].paragraphs[0], "ตามคัมภีร์อี้จิง คุณ…");
});

/* ---------------- I Ching ---------------- */
test("iching: King Wen table is a permutation of 1..64 with known anchors", () => {
  const all = ICKB.KING_WEN.flat();
  assert.equal(new Set(all).size, 64);
  assert.deepEqual([...all].sort((a, b) => a - b), Array.from({ length: 64 }, (_, i) => i + 1));
  assert.equal(IC.hexFromBits([1, 1, 1, 1, 1, 1]).n, 1);
  assert.equal(IC.hexFromBits([0, 0, 0, 0, 0, 0]).n, 2);
  assert.equal(IC.hexFromBits([1, 1, 1, 0, 0, 0]).n, 11); // 泰: ดินบน ฟ้าล่าง
  assert.equal(IC.hexFromBits([0, 0, 0, 1, 1, 1]).n, 12); // 否
  assert.equal(IC.hexFromBits([1, 0, 1, 0, 1, 0]).n, 63); // 既濟: น้ำบน ไฟล่าง
  assert.equal(IC.hexFromBits([0, 1, 0, 1, 0, 1]).n, 64);
  for (let n = 1; n <= 64; n++) assert.equal(IC.hexFromBits(IC.bitsOf(n)).n, n);
  for (let n = 1; n <= 64; n++) assert.ok(ICKB.HEX[n] && ICKB.HEX[n].gist && ICKB.HEX[n].kw.length === 3, "hex " + n);
});
test("iching: coin toss values (heads 3, tails 2) and distribution", () => {
  // u32 even → randInt(2) = 0 (tails 2), odd → 1 (heads 3)
  assert.deepEqual(IC.tossLine(seq([1, 1, 1])), { coins: [3, 3, 3], value: 9 });
  assert.deepEqual(IC.tossLine(seq([0, 0, 0])), { coins: [2, 2, 2], value: 6 });
  assert.equal(IC.tossLine(seq([1, 0, 0])).value, 7);
  assert.equal(IC.tossLine(seq([1, 1, 0])).value, 8);
  const c = { 6: 0, 7: 0, 8: 0, 9: 0 };
  for (let i = 0; i < 8000; i++) c[IC.tossLine().value]++;
  assert.ok(Math.abs(c[6] / 8000 - 0.125) < 0.025 && Math.abs(c[9] / 8000 - 0.125) < 0.025, JSON.stringify(c));
  assert.ok(Math.abs(c[7] / 8000 - 0.375) < 0.035 && Math.abs(c[8] / 8000 - 0.375) < 0.035, JSON.stringify(c));
});
test("iching: changing lines → relating hexagram", () => {
  const still = IC.cast([7, 7, 7, 7, 7, 7]);
  assert.equal(still.primary, 1); assert.equal(still.relating, null); assert.deepEqual(still.changing, []);
  const allOld = IC.cast([9, 9, 9, 9, 9, 9]);
  assert.equal(allOld.primary, 1); assert.equal(allOld.relating, 2); assert.equal(allOld.changing.length, 6);
  const c = IC.cast([9, 7, 8, 6, 7, 7]); // bits 1,1,0,0,1,1 → ☱ล่าง ☴บน = 61; เปลี่ยนเส้น 1,4 → 0,1,0,1,1,1 = ☵ล่าง ☰บน = 6
  assert.equal(c.primary, 61); assert.deepEqual(c.changing, [1, 4]); assert.equal(c.relating, 6);
  assert.throws(() => IC.cast([7, 7, 7]));
  assert.throws(() => IC.cast([5, 7, 7, 7, 7, 7]));
});
test("iching: Zhu Xi focus rule by number of changing lines", () => {
  const f = v => IC.focus(IC.cast(v));
  assert.equal(f([7, 8, 7, 8, 7, 8]).hex, "primary");
  assert.deepEqual(f([7, 9, 7, 8, 7, 8]).lines, [2]);
  assert.deepEqual(f([6, 7, 7, 9, 7, 8]).lines, [4, 1]);           // 2 เส้น: เส้นบนก่อน
  assert.equal(f([6, 9, 6, 7, 7, 8]).hex, "both");
  assert.deepEqual(f([6, 9, 6, 9, 7, 8]).lines, [5, 6]);           // 4 เส้น: เส้นนิ่ง เส้นล่างก่อน
  assert.equal(f([6, 9, 6, 9, 7, 8]).hex, "relating");
  assert.deepEqual(f([6, 9, 6, 9, 9, 8]).lines, [6]);
  assert.equal(f([6, 9, 6, 9, 9, 6]).hex, "relating");
});
test("iching: daily hexagram is stable for a date and facts follow the contract", () => {
  const d = new Date(2026, 10, 6);
  assert.deepEqual(IC.dailyCast(d).values, IC.dailyCast(new Date(2026, 10, 6, 23, 59)).values);
  const facts = IC.buildFacts(IC.cast([9, 7, 8, 6, 7, 7]), "work", { rng: () => 0.3 });
  assert.equal(facts.domain, "iching");
  assert.ok(facts.items.length >= 5);
  facts.items.forEach(it => { assert.ok(it.id && it.label && it.tags.length); it.tags.forEach(t => assert.ok(Array.isArray(it.meanings[t]) && it.meanings[t].length, it.id + "." + t)); });
});

/* ---------------- 12 นักษัตร ---------------- */
test("zodiac: year boundary at Chinese New Year (2023-01-22, 2024-02-10, 2026-02-17)", () => {
  assert.equal(ZD.zodiacYearOf(2024, 2, 9, "chinese").animal, 3);   // เถาะ (2023)
  assert.equal(ZD.zodiacYearOf(2024, 2, 10, "chinese").animal, 4);  // มะโรง
  assert.equal(ZD.zodiacYearOf(2023, 1, 21, "chinese").animal, 2);  // ขาล
  assert.equal(ZD.zodiacYearOf(2023, 1, 22, "chinese").animal, 3);
  const a = ZD.zodiacYearOf(2026, 2, 16, "chinese"), b = ZD.zodiacYearOf(2026, 2, 17, "chinese");
  assert.equal(a.year, 2025); assert.equal(a.animal, 5); assert.equal(a.element, "wood");   // 乙巳 งูไม้
  assert.equal(b.year, 2026); assert.equal(b.animal, 6); assert.equal(b.element, "fire");   // 丙午 ม้าไฟ
  assert.equal(ZD.zodiacYearOf(2026, 2, 3, "lichun").animal, 5);    // ก่อนลี่ชุน 4 ก.พ.
  assert.equal(ZD.zodiacYearOf(2026, 2, 5, "lichun").animal, 6);
  assert.equal(ZD.currentYear(new Date(2026, 10, 6)), 2026);
  assert.equal(ZD.currentYear(new Date(2027, 0, 20)), 2026);
});
test("zodiac: branch relations and ปีชง 2569 (ม้า)", () => {
  assert.equal(ZD.relation(0, 6), "clash");
  assert.equal(ZD.relation(6, 6), "same");
  assert.equal(ZD.relation(0, 1), "harmony");
  assert.equal(ZD.relation(2, 11), "harmony"); // หกประสานชนะผั่ว
  assert.equal(ZD.relation(8, 4), "trine");
  assert.equal(ZD.relation(1, 6), "harm");
  assert.equal(ZD.relation(0, 3), "punish");
  assert.equal(ZD.relation(3, 6), "break");
  assert.equal(ZD.relation(0, 2), "neutral");
  for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) assert.equal(ZD.relation(a, b), ZD.relation(b, a), a + "/" + b);
  const chong = ZD.chongTable(2026).filter(t => ZD.isChong(t.rel)).map(t => t.animal).sort((x, y) => x - y);
  assert.deepEqual(chong, [0, 1, 3, 6]); // ชวด (ชงเต็ม), ฉลู (ไห่), เถาะ (ผั่ว), มะเมีย (ปีตัวเอง)
  assert.equal(ZD.chongTable(2026)[0].rel, "clash");
});
test("zodiac: annual scores in range, lucky elements, compat, facts", () => {
  for (let a = 0; a < 12; a++) {
    const R = ZD.annual(a, 2026, 1990 + a);
    Object.values(R.scores).forEach(v => assert.ok(v >= 55 && v <= 96));
    assert.ok(R.lucky.length >= 1 && R.lucky.every(e => ZKB.ELEMENTS[e]));
    assert.ok(R.supports.length === 3, "1 หกประสาน + 2 สามประสาน");
    const f = ZD.buildFacts(R, "money", {});
    f.items.forEach(it => it.tags.forEach(t => assert.ok(it.meanings[t] && it.meanings[t].length)));
  }
  assert.equal(ZD.bridge("water", "fire"), "wood"); // น้ำข่มไฟ → ไม้เชื่อม (น้ำ→ไม้→ไฟ)
  assert.equal(ZD.bridge("fire", "water"), null);
  assert.equal(ZD.bridge("wood", "earth"), "fire");
  assert.equal(ZD.compat(0, 1).score, 94);
  assert.ok(ZD.compat(0, 6).score < ZD.compat(0, 4).score);
});

/* ---------------- ราศีตะวันตก ---------------- */
test("astro: Moon longitude vs Meeus example 47.a and new moons", () => {
  // 1992-04-12 0h TD → λ ปรากฏ 133.167265°
  assert.ok(angDiff(AS.moonLongitude(2448724.5), 133.167265) < 0.02, String(AS.moonLongitude(2448724.5)));
  for (const k of [-100, 0, 150, 320]) {
    const j = HS.newMoonJDE(k);
    assert.ok(angDiff(AS.moonLongitude(j), HS.sunLongitude(j)) < 0.05, "new moon k=" + k);
  }
});
test("astro: Sun sign boundaries (equinox/solstice times, UTC)", () => {
  const at = (y, m, d, h, mi) => AS.chart({ y, m, d, time: { h, mi }, tz: 0 }).sun.sign;
  assert.equal(at(2024, 3, 20, 2, 0), 11);  // วสันตวิษุวัต 2024-03-20 03:06 UTC
  assert.equal(at(2024, 3, 20, 4, 30), 0);
  assert.equal(at(2025, 6, 21, 1, 30), 2);  // ครีษมายัน 2025-06-21 02:42 UTC
  assert.equal(at(2025, 6, 21, 4, 0), 3);
  assert.equal(at(2023, 12, 22, 2, 0), 8);  // เหมายัน 2023-12-22 03:27 UTC
  assert.equal(at(2023, 12, 22, 5, 0), 9);
  assert.equal(AS.sunSignOf(1990, 7, 22), 3); // กรกฎ → สิงห์ 1990-07-23
  assert.equal(AS.sunSignOf(1990, 7, 24), 4);
});
test("astro: Ascendant matches a brute-force horizon search within 0.2°", () => {
  const D = Math.PI / 180;
  function brute(jd, lat, lon) {
    const T = (jd - 2451545) / 36525, eps = (23.4392911 - 0.0130042 * T) * D, lst = (HS.gmst(jd) + lon) * D, phi = lat * D;
    const alt = l => { l *= D; const ra = Math.atan2(Math.sin(l) * Math.cos(eps), Math.cos(l)), de = Math.asin(Math.sin(eps) * Math.sin(l)), H = lst - ra; return { h: Math.sin(phi) * Math.sin(de) + Math.cos(phi) * Math.cos(de) * Math.cos(H), east: Math.sin(H) < 0 }; };
    for (let l = 0; l < 360; l += 0.05) { const a = alt(l), b = alt(l + 0.05); if (a.h < 0 && b.h >= 0 && b.east) return l + 0.025; if (a.h > 0 && b.h <= 0 && a.east) return l + 0.025; }
    return NaN;
  }
  const cases = [[2451545.0, 13.75, 100.5], [2460000.3, 18.79, 98.98], [2455000.8, 6.54, 101.28], [2448724.1, 51.5, -0.1], [2459000.55, -33.9, 151.2]];
  for (const [jd, lat, lon] of cases) {
    const a = HS.ascendant(jd, lat, lon), b = brute(jd, lat, lon);
    assert.ok(angDiff(a, b) < 0.2, `ASC ${a.toFixed(2)} vs brute ${b.toFixed(2)} @${jd}`);
  }
  const C = AS.chart({ y: 1990, m: 5, d: 15, time: { h: 8, mi: 30 }, tz: 7, lat: 13.75, lon: 100.5 });
  assert.equal(C.sun.sign, 1); assert.ok(C.asc); assert.equal(C.asc.sign, 3);
  const N = AS.chart({ y: 1990, m: 5, d: 15, time: null, tz: 7, lat: 13.75, lon: 100.5 });
  assert.equal(N.asc, null);
  assert.equal(AS.daily(0, new Date(Date.UTC(2026, 10, 6))).house >= 0, true);
});
test("astro: moon changing sign during a date without birth time is flagged", () => {
  let flagged = 0;
  for (let d = 1; d <= 28; d++) { const c = AS.chart({ y: 2026, m: 2, d, time: null, tz: 7 }); if (c.moonAlt) { flagged++; assert.equal((c.moonAlt[0] + 1) % 12, c.moonAlt[1]); } }
  assert.ok(flagged >= 9 && flagged <= 14, "Moon changes sign ~every 2.5 days, got " + flagged);
});

/* ---------------- ทำนายฝัน ---------------- */
test("dream: detection prefers longest alias, unique, ordered", () => {
  const d = DR.detect("ฝันว่างูเห่าไล่ตาม แล้วขึ้นเครื่องบินไปทะเล ฟันหลุด งูอีกตัว");
  assert.deepEqual(d.map(x => x.id), ["snake", "chased", "plane", "sea", "teeth"]);
  assert.equal(d[0].alias, "งูเห่า");
  assert.deepEqual(DR.detect("ฝันเห็นพระจันทร์เต็มดวง").map(x => x.id), ["moon"]);
  assert.deepEqual(DR.detect("").length, 0);
  assert.ok(DR.detect("งู ช้าง ปลา แมว หมา ไก่ เสือ ลิง หนู เต่า").length === 8);
  const ids = DKB.SYMBOLS.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  DKB.SYMBOLS.forEach(s => assert.ok(DKB.THEMES[s.theme] && DKB.CATS[s.cat], s.id));
});
test("dream: dream type and facts", () => {
  assert.equal(DR.dreamType(["monk"], "", ""), "thep");
  assert.equal(DR.dreamType(["snake"], "happy", "dawn"), "bupphanimit");
  assert.equal(DR.dreamType(["snake"], "anxious", "dawn"), "jit");
  assert.equal(DR.dreamType(["snake"], "", "early"), "that");
  assert.equal(DR.dominantTheme(["fish", "money"]), "luck");
  const f = DR.buildFacts(["snake", "teeth"], "happy", "dawn", "love", {});
  assert.equal(f.domain, "dream");
  assert.ok(!/\d{2,}/.test(JSON.stringify(f.items.map(i => i.meanings))), "no lucky numbers in dream meanings");
});

/* ---------------- ความปลอดภัย ---------------- */
test("safety: every KB string passes the composer safety filter", () => {
  for (const [name, kb] of [["iching", ICKB], ["zodiac", ZKB], ["astro", AKB], ["dream", DKB]]) {
    const bad = kb.allText().filter(t => !FA.safety.isSafe(t));
    assert.deepEqual(bad, [], name);
    assert.ok(kb.allText().length > 100, name + " has a rich KB");
  }
  const lottery = /หวย|เลขเด็ด|เลขนำโชค|พนัน/;
  assert.ok(!DKB.allText().some(t => lottery.test(t) && !/ไม่มีเลข|ไม่ให้เลข/.test(t)));
});
test("safety: composed readings are safe and varied across seeds", () => {
  const sets = [
    () => IC.buildFacts(IC.cast([9, 7, 8, 6, 7, 7]), "overall", { rng: Math.random }),
    () => ZD.buildFacts(ZD.annual(0, 2026, 1984), "love", {}),
    () => AS.buildFacts(AS.chart({ y: 1990, m: 5, d: 15, time: { h: 8, mi: 30 }, tz: 7, lat: 13.75, lon: 100.5 }), "work"),
    () => DR.buildFacts(["snake", "teeth", "flood"], "anxious", "dawn", "money", {})
  ];
  for (const mk of sets) {
    const texts = new Set();
    for (let seed = 1; seed <= 6; seed++) {
      const f = mk(); f.domain = "horoscope";
      const r = FA.compose(f, { seed });
      const all = r.sections.map(s => s.paragraphs.join(" ")).join(" ");
      assert.ok(FA.safety.isSafe(all));
      assert.ok(r.sections.length >= 3);
      texts.add(all);
    }
    assert.ok(texts.size >= 5, "different wording per seed");
  }
});
