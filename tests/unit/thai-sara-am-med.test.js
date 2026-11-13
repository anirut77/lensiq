"use strict";
// tests/unit/thai-sara-am-med.test.js — FIXED TEST SET (thai-sara-am, locked 2026-11-14 BEFORE the fix; sha256 in
// evals-locks/thai-sara-am.sha256 and ~/LENSIQ-field/evals/thai-sara-am/locked.sha256).
// Independent review 2026-11-14: lensiq-med.js emergency() (SELF on the raw text, composed ำ only) returned self:false for
// "อยากทำร้ายตัวเอง" from the live scan (NFKC: ำ decomposed), and also for the spaced "อยาก ทำร้าย ตัวเอง" and the tone-mark
// typo "อยากทำร้่ายตัวเอง". Every shape must show the self-harm emergency card (self: true, poison: true); benign label
// wording with ำ must not.
const test = require("node:test");
const assert = require("node:assert/strict");
const { forms } = require("../fixtures/thai-sara-am-forms.js");
const M = require("../../lensiq-med.js");

const SELF = [
  ["อยากทำร้ายตัวเอง", ["อยาก", "ทำร้าย", "ตัวเอง"]],
  ["ฉันทำร้ายตัวเองเมื่อคืน", ["ฉัน", "ทำร้าย", "ตัวเอง", "เมื่อคืน"]],
  ["คิดจะทำร้ายตัวเองด้วยยา", ["คิดจะ", "ทำร้าย", "ตัวเอง", "ด้วยยา"]],
];
const BENIGN = ["ลดน้ำหนัก", "คำเตือน อาจทำให้ง่วงซึม", "ทำความสะอาดแผลก่อนทายา", "ดื่มน้ำตามมาก ๆ", "รับประทานครั้งละ 1 เม็ด หลังอาหาร ห้ามรับประทานซ้ำ", "เก็บในที่ร่ม"];

test("emergency(): self-harm wording in every shape is a self-harm emergency", () => {
  const miss = [];
  for (const [t, words] of SELF) for (const [label, x] of forms(t, { words })) {
    const e = M.emergency(x);
    if (!e.self || !e.poison) miss.push(`${t} / ${label}: ${JSON.stringify(e)}`);
  }
  assert.deepEqual(miss, []);
});

test("emergency(): the reviewer's tone-mark typo 'อยากทำร้่ายตัวเอง' and spaced decomposed wording", () => {
  for (const x of ["อยากทำร้่ายตัวเอง", "อยากทำร่้ายตัวเอง", "อยาก ทําร้าย ตัวเอง", "อยาก​ทำร้าย​ตัวเอง"]) {
    assert.equal(M.emergency(x).self, true, JSON.stringify(x));
  }
});

test("emergency(): benign label wording with ำ stays calm in every shape", () => {
  for (const t of BENIGN) for (const [label, x] of forms(t)) assert.deepEqual(M.emergency(x), { poison: false, self: false }, `${t} / ${label}`);
});
