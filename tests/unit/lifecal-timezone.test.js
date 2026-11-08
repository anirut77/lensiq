"use strict";
// Life-calendar birth time zones: historical IANA offsets (Intl, with a built-in table for the rules the round-11
// evaluator named: Bangkok mean time before 1920, China DST 1986–1991, Singapore/Malaysia UTC+7:30 before 1982) and
// optional true solar time for the BaZi hour/day pillars, reporting the correction that was used.
const test = require("node:test");
const assert = require("node:assert/strict");
const LC = require("../../lifecal.js");

const CASES = [
  // zone, y, m, d, h, expected offset (hours)
  ["Asia/Bangkok", 1915, 6, 1, 12, 6 + 42 / 60 + 4 / 3600], ["Asia/Bangkok", 1925, 6, 1, 12, 7], ["Asia/Bangkok", 1990, 5, 12, 8, 7],
  ["Asia/Shanghai", 1985, 7, 1, 12, 8], ["Asia/Shanghai", 1986, 5, 4, 1, 8], ["Asia/Shanghai", 1986, 5, 4, 3, 9], ["Asia/Shanghai", 1988, 7, 1, 12, 9],
  ["Asia/Shanghai", 1988, 9, 12, 12, 8], ["Asia/Shanghai", 1991, 4, 14, 12, 9], ["Asia/Shanghai", 1992, 7, 1, 12, 8],
  ["Asia/Singapore", 1975, 1, 1, 12, 7.5], ["Asia/Kuala_Lumpur", 1981, 12, 31, 12, 7.5], ["Asia/Singapore", 1982, 1, 1, 12, 8], ["Asia/Kuala_Lumpur", 1990, 1, 1, 12, 8],
];

test("zoneOffset: historical offsets from Intl and from the fallback table agree for the named rules", () => {
  for (const [z, y, m, d, h, want] of CASES) {
    const a = LC.zoneOffset(z, y, m, d, h, 0), b = LC.zoneOffset(z, y, m, d, h, 0, { noIntl: true });
    assert.ok(Math.abs(a.offset - want) < 1e-3, `${z} ${y}-${m}-${d} ${h}h intl ${a.offset}`);
    assert.equal(b.source, "table");
    assert.ok(Math.abs(b.offset - want) < 1e-3, `${z} ${y}-${m}-${d} ${h}h table ${b.offset}`);
  }
  assert.equal(LC.zoneOffset("Asia/Nowhere", 2000, 1, 1, 12, 0).source, "default");
  assert.equal(LC.fmtOffset(6 + 42 / 60 + 4 / 3600), "UTC+06:42");
  assert.equal(LC.fmtOffset(-3.5), "UTC-03:30");
  assert.ok(LC.ZONES.length >= 12 && LC.ZONES.every(z => z.id && z.key && z.th && isFinite(z.lon)));
});

test("bazi: the historical offset changes the hour pillar near a boundary (Shanghai DST 1988: 13:30 clock = 12:30 standard)", () => {
  const b = { y: 1988, m: 7, d: 1, h: 13, mi: 30, gender: "male" };
  const dst = LC.bazi(Object.assign({ tz: LC.zoneOffset("Asia/Shanghai", 1988, 7, 1, 13, 30).offset }, b));
  const fixed = LC.bazi(Object.assign({ tz: 8 }, b));
  assert.equal(dst.input.tz, 9);
  assert.equal(dst.pillars.hour.zh, fixed.pillars.hour.zh, "same clock hour → same hour branch by clock");
  // with true solar time (Beijing 116.4°E) the DST hour is shifted back by about an hour and a quarter → previous branch
  const sol = LC.bazi(Object.assign({ tz: 9, solarLon: 116.4 }, b));
  assert.ok(sol.solar && sol.solar.offsetMin < -60 && sol.solar.offsetMin > -90, JSON.stringify(sol.solar));
  assert.notEqual(sol.pillars.hour.zh.slice(1), fixed.pillars.hour.zh.slice(1), "solar time moves the hour branch");
  assert.equal(sol.pillars.year.zh, fixed.pillars.year.zh); assert.equal(sol.pillars.month.zh, fixed.pillars.month.zh);
});

test("bazi: true solar time reports lon, equation of time and the offset used; unknown time or no longitude → no solar", () => {
  const s = LC.bazi({ y: 1990, m: 5, d: 16, h: 12, mi: 0, tz: 7, solarLon: 100.5 }).solar;
  assert.deepEqual([s.lon, s.at.h, s.at.mi, s.offsetMin], [100.5, 11, 46, -14]); // −18 min longitude + ~+4 min EoT
  assert.ok(Math.abs(LC.equationOfTime(2024, 11, 3) - 16.4) < 1.2, "EoT early November ≈ +16 min");
  assert.ok(Math.abs(LC.equationOfTime(2024, 2, 11) + 14.2) < 1.2, "EoT mid February ≈ −14 min");
  assert.equal(LC.bazi({ y: 1990, m: 5, d: 16, h: 12, mi: 0, tz: 7, noTime: true, solarLon: 100.5 }).solar, null);
  assert.equal(LC.bazi({ y: 1990, m: 5, d: 16, h: 12, mi: 0, tz: 7 }).solar, null);
  // 23:10 clock in Bangkok is 22:52 solar → not yet the next day (Zi hour starts at 23:00)
  const late = { y: 1990, m: 5, d: 16, h: 23, mi: 10, tz: 7 };
  assert.notEqual(LC.bazi(late).pillars.day.zh, LC.bazi(Object.assign({ solarLon: 100.5 }, late)).pillars.day.zh);
});
