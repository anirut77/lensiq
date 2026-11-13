"use strict";
// tests/unit/nut-fix3.test.js — Nutrition label mode, the four small fixes (coordinator 2026-11-13, option 1; branch only).
// FIXED TEST, written and locked (~/LENSIQ-field/evals/nutrition/v3/locked.sha256) BEFORE the fixes were coded. The cases
// are the failure shapes seen on the v2 set (OCR misreads), written by hand:
//   1. common OCR misreads of "อิ่มตัว" still read as saturated fat;
//   2. "ไขมัน" followed by other Thai letters is never total fat;
//   3. two values for one field are flagged "please check" even when they are equal;
//   4. "per pack" is taken only with a pack word; a misread "ต่อหนึ่งหน่วยบริโภค" header is not "per pack".
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../../lensiq-nut.js");

const panel = rows => ["ข้อมูลโภชนาการ", "หนึ่งหน่วยบริโภค : 1 ถ้วย (20 กรัม)", "จำนวนหน่วยบริโภคต่อถ้วย : 1", "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค", ...rows];

test("OCR misreads of 'อิ่มตัว' are saturated fat, never a second total fat", () => {
  for (const sat of ["ไขมันอื่มตัว", "ไขมันอ่มตัว", "ไขมันอิมตัว", "ไขมันอิ่มตัว"]) {
    const p = N.parseLabel(panel(["ไขมันทั้งหมด 3 ก. 5%", `${sat} 1 ก. 5%`]));
    assert.equal(p.items.filter(i => i.field === "fat").length, 1, sat + ": one total fat");
    const s = p.items.find(i => i.field === "satfat");
    assert.ok(s && s.value_text === "1", sat + ": sat fat read " + JSON.stringify(p.items));
  }
});

test("'ไขมัน' + other Thai letters (an unknown kind of fat) is never total fat", () => {
  const p = N.parseLabel(panel(["ไขมันทั้งหมด 4 ก.", "ไขมันไม่อิ่มตัวเชิงเดี่ยว 2 ก.", "ไขมันผสม 1 ก."]));
  const fat = p.items.filter(i => i.field === "fat");
  assert.equal(fat.length, 1); assert.equal(fat[0].value_text, "4");
  assert.ok(!p.items.some(i => i.field === "satfat"), "not saturated fat either");
  // the plain Thai GDA word "ไขมัน" on its own is still total fat
  assert.equal(N.parseLabel(["คุณค่าทางโภชนาการต่อ 1 ซอง", "ไขมัน 14 กรัม"]).items[0].field, "fat");
});

test("two values for one field are 'please check' even when they are equal", () => {
  const p = N.parseLabel(panel(["ไขมันทั้งหมด 0 ก. 0%", "ไขมันทั้งหมด 0 ก. 0%", "โซเดียม 25 มก."]));
  const fat = p.items.filter(i => i.field === "fat");
  assert.equal(fat.length, 2);
  assert.ok(fat.every(i => i.status === "check" && i.why.includes("duplicate")), JSON.stringify(fat));
  assert.equal(p.items.find(i => i.field === "sodium").status, "read");
});

test("'per pack' only with a pack word; a misread serving header stays per serving", () => {
  const mis = N.parseLabel(["ข้อมูลโภชนาการ", "หนึ่งหน่วยบริโภค : 1 ถ้วย (20 กรัม)", "จำนวนหน่วยบริโภคต่อถ้วย : 1", "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภกค",
    "พลังงานทั้งหมด 40 กิโลแคลอรี", "โซเดียม 25 มก."]);
  assert.notEqual(mis.format, "th-gda");
  assert.ok(mis.items.every(i => i.basis === "serving"), JSON.stringify(mis.items.map(i => i.basis)));
  for (const w of ["ซอง", "ถุง", "ห่อ", "กล่อง", "ขวด", "ถ้วย"]) {
    const g = N.parseLabel([`คุณค่าทางโภชนาการต่อ 1 ${w}`, "พลังงาน 250 กิโลแคลอรี", "โซเดียม 380 มิลลิกรัม"]);
    assert.ok(g.items.length === 2 && g.items.every(i => i.basis === "pack"), w + " " + JSON.stringify(g.items.map(i => i.basis)));
  }
  const unknown = N.parseLabel(["คุณค่าทางโภชนาการต่อหนึ่งสิ่ง", "พลังงาน 250 กิโลแคลอรี"]);
  assert.ok(unknown.items.every(i => i.basis !== "pack"), "no pack word -> not per pack");
});
