"use strict";
// tests/unit/pc-guard-ko-ja.test.js — patient-name guard: Korean fields and an OCR-damaged "Patient:" (2026-11-12, after the
// independent live-scan review found a Korean lab report, a Korean insurance card and a Hong Kong clinic label whose names
// and numbers the guard missed when a product label shared the frame). DEV cases (synthetic, written for these rules;
// not from the locked sets), each with "not weakened / no false redaction" counter-cases.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../lensiq-pc-guard.js");

const kinds = t => G.redact(t).removed.map(r => r.kind + "=" + r.text);

test("Korean name, registration-number and birth-date fields are removed (with or without a colon, OCR-split syllables)", () => {
  assert.deepEqual(kinds("검사결과지\n성명: 김테스트  등록번 호: 12345678\n생년월일: 1970.01.02"),
    ["name=김테스트", "hn=12345678", "dob=1970.01.02"]);
  assert.deepEqual(kinds("건강보험증\n성명 이가상\n주민등록번호 800101-1234567"), ["name=이가상", "id=800101-1234567"]);
  assert.deepEqual(kinds("환자명: 박예시\n차트 번호 A123456"), ["name=박예시", "hn=A123456"]);
  assert.ok(/^name=최샘플/.test(kinds("수진자: 최샘플 (남)").join()), "수진자 field"); // the sex marker may go with it (over-removal is safe)
});

test("an OCR-damaged 'Patient:' still starts a name field", () => {
  assert.deepEqual(kinds("Sample Medical Centre\nPatiet: 陳範例\nChlorphenamine 4mg"), ["name=陳範例"]);
  assert.deepEqual(kinds("Patint: Jane Placeholder"), ["name=Jane Placeholder"]);
});

test("not weakened, no new false redaction on product labels", () => {
  for (const t of ["제품 이름: 비타민C 1000\n성분: 아스코르브산 1000mg\n제조번호 2611A", "상품 이름: 홍삼정\n원재료명: 홍삼농축액", "Patent: pending\nNet wt 50 g",
    "ส่วนประกอบ: พาราเซตามอล 500 มก.\nเลขสารบบอาหาร 10-1-12345-1-0001", "8850006939727", "LOT 2611A EXP 01/2028"]) {
    assert.equal(G.redact(t).count, 0, "kept: " + t);
  }
  // the earlier rules still apply
  assert.deepEqual(kinds("ชื่อผู้ป่วย สมชาย ใจทดลอง\nHN 6512345"), ["name=สมชาย ใจทดลอง", "hn=6512345"]);
  assert.ok(G.redact("患者姓名：王小明").count === 1);
});
