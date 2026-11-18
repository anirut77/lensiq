"use strict";
// tests/unit/attendance-csv-lang.test.js — FIXED TEST (Attendance PIN / QR to 90, acceptance sheet docs/acceptance/attendance.md
// L3: "generated output ... CSV headers ... is in the chosen language"), locked in evals-locks/attendance-time.sha256 BEFORE
// the product change. lensiq-timeclock.js payrollCsv / detailCsv / auditCsv take the page language:
//   th (and no language): the headers stay exactly as before (Thai label + English key), so existing payroll templates work;
//   en: the English key only, no Thai; zh: a Chinese label + the English key, no Thai;
//   same number of columns, same order, the same English key at the end of every header, identical data rows;
//   an unknown language falls back to th. Every attendance-hr.js text key used for the badge title and the storage line
//   has an English and a Chinese entry.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../../lensiq-timeclock.js");

const ROOT = path.join(__dirname, "..", "..");
const THAI = /[฀-๿]/, HAN = /[一-鿿]/;
const T = (d, hm) => C.dayStart(d) + C.hm(hm) * 60000;
const EMPS = [{ id: "e1", code: "A01", name: "Test", dept: "Shop", shift: "day" }];
const SH = [{ id: "day", start: "08:00", end: "17:00" }];
const PUNCH = [{ id: "a", emp: "e1", ts: T("2026-10-05", "08:12"), type: "auto", method: "pin", dev: "d1" }, { id: "b", emp: "e1", ts: T("2026-10-05", "18:05"), type: "auto", method: "pin", dev: "d1" }];
const LOG = C.auditEntry([], { by: "Boss", action: "punch_add", emp: "e1", after: { id: "m1", emp: "e1", ts: T("2026-10-06", "17:00"), type: "out" }, reason: "forgot" }, "d1", T("2026-10-07", "09:00"));
const sum = () => C.monthSummary({ emps: EMPS, shifts: SH, punches: PUNCH, audit: [LOG], holidays: [], month: "2026-10", now: Date.UTC(2030, 0, 1) });
const rows = csv => csv.replace(/^﻿/, "").split("\r\n").map(l => l.slice(1, -1).split('","'));
const key = h => h.split(" ").pop();

const outputs = lang => ({ pay: C.payrollCsv(sum(), lang), det: C.detailCsv(sum(), undefined, lang), aud: C.auditCsv([LOG], EMPS, undefined, lang) });

test("th (and no language) keeps the existing bilingual headers byte for byte", () => {
  const legacy = { pay: C.payrollCsv(sum()), det: C.detailCsv(sum()), aud: C.auditCsv([LOG], EMPS) };
  const th = outputs("th");
  for (const k of ["pay", "det", "aud"]) {
    assert.equal(th[k], legacy[k], k);
    const h = rows(th[k])[0];
    assert.ok(h.every(x => THAI.test(x) && /^[a-z_0-9]+$/.test(key(x))), k + " th header: Thai label + English key: " + h.join("|"));
  }
  assert.equal(rows(th.pay)[0][0], "เดือน month");
});

test("en: English keys only (no Thai, no Chinese); zh: Chinese label + English key (no Thai)", () => {
  const th = outputs("th"), en = outputs("en"), zh = outputs("zh");
  for (const k of ["pay", "det", "aud"]) {
    const ht = rows(th[k])[0], he = rows(en[k])[0], hz = rows(zh[k])[0];
    assert.equal(he.length, ht.length, k + " en columns"); assert.equal(hz.length, ht.length, k + " zh columns");
    he.forEach((x, i) => { assert.ok(!THAI.test(x) && !HAN.test(x), `${k} en col ${i}: ${x}`); assert.equal(key(x), key(ht[i]), `${k} en key ${i}`); });
    hz.forEach((x, i) => { assert.ok(HAN.test(x) && !THAI.test(x), `${k} zh col ${i}: ${x}`); assert.equal(key(x), key(ht[i]), `${k} zh key ${i}`); });
    assert.deepEqual(rows(en[k]).slice(1), rows(th[k]).slice(1), k + " en data rows identical");
    assert.deepEqual(rows(zh[k]).slice(1), rows(th[k]).slice(1), k + " zh data rows identical");
  }
  assert.deepEqual([rows(en.pay)[0].length, rows(en.det)[0].length, rows(en.aud)[0].length], [29, 19, 11]);
});

test("an unknown language falls back to th", () => {
  assert.equal(C.payrollCsv(sum(), "fr"), C.payrollCsv(sum(), "th"));
});

test("badge title and storage-near-full texts exist in English and Chinese", () => {
  const src = fs.readFileSync(path.join(ROOT, "attendance-hr.js"), "utf8");
  for (const k of ["badgeTitle", "nearFull"]) {
    assert.match(src, new RegExp(`T\\("${k}"`), "attendance-hr.js uses " + k);
    for (const f of ["i18n/en-attendance.js", "i18n/zh-attendance.js"]) assert.match(fs.readFileSync(path.join(ROOT, f), "utf8"), new RegExp(`"attendance\\.hr\\.${k}":`), f + " has " + k);
  }
});
