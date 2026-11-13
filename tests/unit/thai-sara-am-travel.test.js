"use strict";
// tests/unit/thai-sara-am-travel.test.js — FIXED TEST SET (thai-sara-am, locked 2026-11-14 BEFORE the fix; sha256 in
// evals-locks/thai-sara-am.sha256 and ~/LENSIQ-field/evals/thai-sara-am/locked.sha256).
// Independent review 2026-11-14: lensiq-pc-travel.js classifyLine runs NFKC (ำ decomposed) and then tests WARN_HEAD, which
// is written with ำ ("คำเตือน"), so "คำเตือน อาจทำให้ง่วง" was classified "other" and the travel card lost a warning line.
const test = require("node:test");
const assert = require("node:assert/strict");
const { forms } = require("../fixtures/thai-sara-am-forms.js");
const T = require("../../lensiq-pc-travel.js");

const WARN = ["คำเตือน อาจทำให้ง่วง", "คำเตือน: อาจทำให้ง่วงซึม ห้ามขับขี่", "【คำเตือน】 ห้ามใช้ในหญิงตั้งครรภ์"];
const OTHER = ["ทำจากสมุนไพรไทย", "น้ำหนักสุทธิ 30 กรัม", "จำหน่ายโดย บริษัท สมใจ จำกัด"];

test("classifyLine: a Thai warning heading with ำ is a warning in every shape", () => {
  const bad = [];
  for (const t of WARN) for (const [label, x] of forms(t)) if (T.classifyLine(x) !== "warning") bad.push(`${t} / ${label}: ${T.classifyLine(x)}`);
  assert.deepEqual(bad, []);
});

test("classifyPair: either side in any shape counts", () => {
  for (const [label, x] of forms("คำเตือน อาจทำให้ง่วง")) assert.equal(T.classifyPair("眠気を催すことがあります", x), "warning", label);
});

test("classifyLine: benign lines with ำ stay 'other' in every shape", () => {
  for (const t of OTHER) for (const [label, x] of forms(t)) assert.equal(T.classifyLine(x), "other", `${t} / ${label}`);
});
