"use strict";
// tests/unit/thai-sara-am-fortune-safe.test.js — FIXED TEST SET (thai-sara-am, locked 2026-11-14 BEFORE the fix; sha256 in
// evals-locks/thai-sara-am.sha256 and ~/LENSIQ-field/evals/thai-sara-am/locked.sha256).
// Independent review 2026-11-14: fortune-ai.js isSafe / isSafeGentle (the output filter of every reading, incl. AI text)
// let banned wording through when ำ was decomposed: "คำสาป" (curse) and "ระวังน้ำท่วม" (a disaster warning). Every shape of
// a sentence the filter refuses must be refused; benign sentences with ำ must pass in every shape.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { forms } = require("../fixtures/thai-sara-am-forms.js");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const S = FA.safety;

const UNSAFE = ["ระวังน้ำท่วมในเดือนนี้", "ปีนี้จะโดนคำสาป", "มีคำสาปติดตัว", "เดือนนี้ระวังน้ำท่วมบ้าน", "ระวังถูกทำร้าย"];
const SAFE = ["ทำบุญตักบาตรตอนเช้าช่วยให้ใจสงบ", "ดื่มน้ำให้พอและพักผ่อนให้เพียงพอ", "ช่วงนี้เหมาะกับการทำงานเป็นทีม", "คำแนะนำคือใช้เวลากับครอบครัวมากขึ้น"];

test("isSafe: refused wording is refused in every shape of ำ", () => {
  const bad = [];
  for (const t of UNSAFE) {
    assert.equal(S.isSafe(t), false, "composed is refused: " + t);
    for (const [label, x] of forms(t)) if (S.isSafe(x)) bad.push(`${t} / ${label}`);
  }
  assert.deepEqual(bad, []);
});

test("filterText drops the refused sentence in every shape", () => {
  for (const t of UNSAFE) for (const [label, x] of forms(t)) {
    const out = S.filterText("ปีนี้การงานมั่นคงดี " + x);
    assert.ok(!out.includes(x), `${t} / ${label}: ${JSON.stringify(out)}`);
  }
});

test("isSafe: benign sentences with ำ pass in every shape", () => {
  for (const t of SAFE) for (const [label, x] of forms(t)) assert.equal(S.isSafe(x), true, `${t} / ${label}`);
});
