"use strict";
// node --test tests/unit — round 10: solar-term accuracy (VSOP87 abridged + nutation + aberration, shared by
// horoscope.js and lifecal.js) against published times, and the "no birth time" uncertainty flags/notes used by
// bazi / taksa / lek7 / lifegraph (Lichun / jie day → pillar note, Wednesday → possible Rahu, before 06:00 → previous day).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const HS = require("../../horoscope.js");
const LC = require("../../lifecal.js");
const ROOT = path.join(__dirname, "..", "..");

// Published instants (UTC) from observatory solar-term tables (HKO / PMO / USNO), rounded to the minute.
const PUBLISHED = [
  [1984, 315, "1984-02-04T15:19Z", "立春 1984"], [2000, 315, "2000-02-04T12:40Z", "立春 2000"], [2000, 0, "2000-03-20T07:35Z", "春分 2000"],
  [2023, 315, "2023-02-04T02:42Z", "立春 2023"], [2023, 270, "2023-12-22T03:27Z", "冬至 2023"],
  [2024, 315, "2024-02-04T08:27Z", "立春 2024"], [2024, 345, "2024-03-05T02:23Z", "惊蛰 2024"], [2024, 0, "2024-03-20T03:06Z", "春分 2024"],
  [2024, 15, "2024-04-04T07:02Z", "清明 2024"], [2024, 90, "2024-06-20T20:51Z", "夏至 2024"], [2024, 270, "2024-12-21T09:21Z", "冬至 2024"],
  [2025, 285, "2025-01-05T02:33Z", "小寒 2025"], [2025, 315, "2025-02-03T14:10Z", "立春 2025"], [2025, 0, "2025-03-20T09:01Z", "春分 2025"],
  [2025, 90, "2025-06-21T02:42Z", "夏至 2025"], [2026, 315, "2026-02-03T20:02Z", "立春 2026"],
];
const jdOf = iso => Date.parse(iso) / 86400000 + 2440587.5;

test("solar terms: lifecal.js and horoscope.js within 2 minutes of published times (was up to 11 min early)", () => {
  for (const [y, lon, iso, name] of PUBLISHED) {
    const want = jdOf(iso);
    const a = (LC.solarTermJD(y, lon) - want) * 1440, b = (HS.solarTerm(y, lon) - want) * 1440;
    assert.ok(Math.abs(a) <= 2, `${name} lifecal off by ${a.toFixed(1)} min`);
    assert.ok(Math.abs(b) <= 2, `${name} horoscope off by ${b.toFixed(1)} min`);
  }
  // Lichun 2024 shows as 16:27 Beijing time / 15:27 Thai time
  assert.deepEqual(LC.fromJD(LC.solarTermJD(2024, 315), 8), { y: 2024, m: 2, d: 4, h: 16, mi: 27 });
  assert.deepEqual(LC.fromJD(LC.solarTermJD(2024, 315), 7), { y: 2024, m: 2, d: 4, h: 15, mi: 27 });
});

test("sun longitude: high-precision series stays close to the old low-precision formula (sanity, < 0.02°)", () => {
  for (let j = 2415021; j < 2488070; j += 997.3) {
    const d = Math.abs(((HS.sunLongitude(j) - HS.sunLongitudeLow(j) + 540) % 360) - 180);
    assert.ok(d < 0.02, `JD ${j}: ${d}`);
  }
});

test("bazi: no birth time on a Lichun / jie day → pillar uncertainty flag; ordinary day → none; known time → none", () => {
  const lc = LC.bazi({ y: 2024, m: 2, d: 4, noTime: true, tz: 7 }).unsure;
  assert.equal(lc.year, true); assert.equal(lc.month, true); assert.equal(lc.term, "立春");
  assert.deepEqual([lc.at.h, lc.at.mi], [15, 27]);
  const jz = LC.bazi({ y: 2024, m: 3, d: 5, noTime: true, tz: 7 }).unsure;
  assert.equal(jz.year, false); assert.equal(jz.month, true); assert.equal(jz.term, "惊蛰");
  assert.equal(LC.bazi({ y: 2024, m: 3, d: 10, noTime: true, tz: 7 }).unsure, null);
  assert.equal(LC.bazi({ y: 2024, m: 2, d: 4, h: 10, mi: 0, tz: 7 }).unsure, null);
  // every Lichun day 1950–2050 is flagged as a year boundary when the time is unknown
  for (let y = 1950; y <= 2050; y++) {
    const t = LC.fromJD(LC.solarTermJD(y, 315), 7), u = LC.pillarUnsure(t.y, t.m, t.d, 7);
    assert.ok(u && u.year, "lichun " + y);
  }
});

test("taksa / lek7: no birth time → Wednesday may be Rahu; before 06:00 counts as the previous day", () => {
  const wed = LC.taksa({ y: 2024, m: 11, d: 6, noTime: true }).birth;
  assert.equal(wed.planet, 4); assert.equal(wed.unsure.maybeRahu, true); assert.equal(wed.unsure.preDawnPlanet, 3);
  const thu = LC.taksa({ y: 2024, m: 11, d: 7, noTime: true }).birth;
  assert.equal(thu.unsure.maybeRahu, false); assert.equal(thu.unsure.preDawnPlanet, 8); // Thursday pre-dawn = Wednesday night
  assert.equal(LC.taksa({ y: 2024, m: 11, d: 6, h: 20, mi: 0 }).birth.unsure, null);
  assert.equal(LC.taksa({ y: 2024, m: 11, d: 6, h: 20, mi: 0 }).birth.planet, 8);
  assert.ok(LC.lek7({ y: 2024, m: 11, d: 6, noTime: true }).unsure.maybeRahu);
});

test("uncertainty notes exist in TH (lifecal-ui.js) and EN/ZH dictionaries with the same placeholders", () => {
  const ui = fs.readFileSync(path.join(ROOT, "lifecal-ui.js"), "utf8");
  const en = fs.readFileSync(path.join(ROOT, "i18n", "en-fortune-lifecal.js"), "utf8");
  const zh = fs.readFileSync(path.join(ROOT, "i18n", "zh-fortune-lifecal.js"), "utf8");
  for (const [k, ph] of [["lc.uYear", ["{t}"]], ["lc.uMonth", ["{n}", "{t}"]], ["lc.uRahu", []], ["lc.uDawn", ["{p}"]]]) {
    assert.ok(ui.includes(`T("${k}"`), "ui " + k);
    for (const [name, src] of [["en", en], ["zh", zh]]) {
      const m = src.match(new RegExp(`"${k.replace(/\./g, "\\.")}": "((?:[^"\\\\]|\\\\.)*)"`));
      assert.ok(m, `${name} ${k}`);
      for (const p of ph) assert.ok(m[1].includes(p), `${name} ${k} ${p}`);
    }
  }
  assert.match(en, /"lc\.uRahu": "(?:[^"\\]|\\.)*Rahu/); assert.match(zh, /"lc\.uRahu": "(?:[^"\\]|\\.)*罗睺/);
});
