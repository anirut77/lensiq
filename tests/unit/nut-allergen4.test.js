"use strict";
// tests/unit/nut-allergen4.test.js — Nutrition label mode, allergen-statement keyword misreads (coordinator 2026-11-13, I3
// option 1; branch only). FIXED TEST, written and locked (~/LENSIQ-field/evals/nutrition/v4/locked.sha256) BEFORE the fix.
// The misreads are the ones the on-device OCR produced on the v3 set; the statement must still be found and shown verbatim
// (as read), and ordinary lines must not become a statement.
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../../lensiq-nut.js");

test("Thai statement keyword misreads are still found and kept verbatim", () => {
  for (const line of ["ข้อมูลสำหรับผู้พ้อาหาร:มี ถัวลิสง", "ข้อมูลสำหรับผู้แพอาหาร: มี นม", "ข้อมูลสําหรับผู้แพ้อาหาร: มี ไข่", "ข้อมูลสำหรับผูแพ้อาหาร: มี กุ้ง"]) {
    const a = N.parseLabel(["ข้อมูลโภชนาการ", "โซเดียม 25 มก.", line]).allergen;
    assert.ok(a, "found: " + line);
    assert.equal(a.text, line, "verbatim");
  }
});

test("Japanese 'アレルギー物質' with a misread long-vowel mark is still found", () => {
  for (const line of ["アレルギ一物質：落花生(ー部に乳成分・小麦を含む)", "アレルギ-物質：卵・大豆", "アレルギ―物質：乳成分"]) {
    const a = N.parseLabel(["栄養成分表示 1袋（50g）当たり", "エネルギー 260kcal", line]).allergen;
    assert.ok(a && a.text === line, "found verbatim: " + line);
  }
});

test("no false statements from ordinary lines", () => {
  for (const lines of [["ข้อมูลโภชนาการ", "หนึ่งหน่วยบริโภค : 1 ซอง (30 กรัม)", "โซเดียม 25 มก."], ["栄養成分表示", "エネルギー 260kcal", "炭水化物 30.1g"],
    ["คุณค่าทางโภชนาการต่อ 1 ซอง", "พลังงาน 250 กิโลแคลอรี"]]) assert.equal(N.parseLabel(lines).allergen, null, lines.join(" / "));
});
