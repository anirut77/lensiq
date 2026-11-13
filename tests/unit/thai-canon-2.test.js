"use strict";
// tests/unit/thai-canon-2.test.js — FIXED TEST SET (thai-canon-2, locked 2026-11-14 BEFORE the fix; sha256 in
// evals-locks/thai-canon-2.sha256 and ~/LENSIQ-field/evals/thai-canon-2/locked.sha256). Should-fix items of the independent
// review of thai-sara-am-safety (2026-11-14):
//   S1 lensiq-pc-guard.js provenance (pnorm): NFKC puts the nikhahit AFTER a tone mark typed before ำ but BEFORE one typed
//      after it, so a short word ("น้ำ", "ซ้ำ", "น้ำแร่") the OCR read with the tone mark after ำ was struck from the preview
//      (not sent). Both sides are compared on the canonical copy.
//   S2 lensiq-pc-live.js autoTextCheck: the possible-name count runs on the canonical copy (a name split by an invisible
//      character still stops a one-tap send). The preview keeps raw offsets (not tested here).
//   S3 lensiq-thai-canon.js: more invisible characters are removed: LRM / RLM (U+200E / U+200F), combining grapheme joiner
//      (U+034F), invisible operators U+2061-U+2064, Mongolian vowel separator (U+180E). They defeated the crisis net, the
//      medicine check and the Product Check guard (same on main before thai-sara-am-safety).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const C = require("../../lensiq-thai-canon.js");
const G = require("../../lensiq-pc-guard.js");
const L = require("../../lensiq-pc-live.js");
const CR = require("../../fortune-crisis.js");
const FA = require("../../fortune-ai.js");
const M = require("../../lensiq-med.js");

const INVISIBLE = ["‎", "‏", "͏", "⁡", "⁢", "⁣", "⁤", "᠎"];
const hex = (/** @type {string} */ c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
const TONE_AFTER = (/** @type {string} */ s) => s.replace(/([่-๋])ำ/g, "ำ$1");
const NIK_FIRST = (/** @type {string} */ s) => s.replace(/([่-๋])ำ/g, "ํ$1า");

/* ---------------- S1 ---------------- */
test("S1 provenance: a word on the label is never struck because the OCR typed the tone mark after ำ (or decomposed it)", () => {
  const preview = ["น้ำ ดื่ม 600 มล.", "ซ้ำ", "น้ำแร่", "น้ำมัน งา", "ห้ามรับประทานซ้ำ", "คำเตือน เก็บให้พ้นมือเด็ก", "ค่ำ"];
  const bad = [];
  for (const t of preview) {
    for (const [label, ocr] of [["tone after ำ", TONE_AFTER(t)], ["nikhahit before the tone", NIK_FIRST(t)], ["NFKC", t.normalize("NFKC")],
      ["zero-width", t.replace(/ำ/g, "ำ​")], ["LRM", t.replace(/ำ/g, "ำ‎")]]) {
      const d = G.provenance(t, ocr).dropped.map(x => x.text);
      if (d.length) bad.push(`${t} / OCR ${label}: dropped ${JSON.stringify(d)}`);
      // the other way round: the preview holds the odd shape, the OCR the composed word
      const d2 = G.provenance(ocr, t).dropped.map(x => x.text);
      if (d2.length) bad.push(`${t} / preview ${label}: dropped ${JSON.stringify(d2)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("S1 provenance still drops what is not on the label (no loosening)", () => {
  const r = G.provenance("น้ำ ดื่ม ติดต่อ สมชาย 081-234-5678", "นำ้ ดื่ม 600 มล.");
  assert.deepEqual(r.dropped.map(x => x.text), ["ติดต่อ", "สมชาย", "081-234-5678"]);
  assert.equal(r.text, "น้ำ ดื่ม");
  assert.deepEqual(G.provenance("น้ำตาล", "นำ้ ดื่ม").dropped.map(x => x.text), ["น้ำตาล"]);
});

/* ---------------- S2 ---------------- */
const LABEL = "ยาแก้ไอน้ำดำ ตราสมใจ\nส่วนประกอบ: กลีเซอรีน\nวิธีใช้ รับประทานครั้งละ 1 ช้อนชา วันละ 3 ครั้ง\nเลขทะเบียนยา 1A 15/50\n";
test("S2 one-tap: a possible name split by an invisible character still counts (autoTextCheck.maybe)", () => {
  const want = L.autoTextCheck(G, LABEL + "สมชาย ใจดี", {}).maybe;
  assert.ok(want >= 1, "composed name counts");
  for (const c of ["​", "‌", "‍", "⁠", "­"].concat(INVISIBLE)) {
    assert.ok(L.autoTextCheck(G, LABEL + "สม" + c + "ชาย ใจดี", {}).maybe >= 1, hex(c));
  }
});

test("S2 one-tap: a decomposed label warning is not counted as a possible name", () => {
  const t = LABEL + "คำเตือน อาจทำให้ง่วงซึม";
  const want = L.autoTextCheck(G, t, {}).maybe;
  assert.equal(L.autoTextCheck(G, t.normalize("NFKC"), {}).maybe, want);
  assert.equal(L.autoTextCheck(G, NIK_FIRST(t).replace(/ำ/g, "ํา"), {}).maybe, want);
});

/* ---------------- S3 ---------------- */
test("S3 canon removes LRM / RLM, CGJ, U+2061-U+2064 and U+180E (idempotent; ordinary text unchanged)", () => {
  for (const c of INVISIBLE) {
    assert.equal(C.canon("ทำ" + c + "ร้าย"), "ทำร้าย", hex(c));
    assert.equal(C.canon("ท" + c + "ํา"), "ทำ", hex(c) + " between consonant and decomposed ำ");
    assert.equal(C.canon("ทํ" + c + "า"), "ทำ", hex(c) + " inside the decomposed ำ");
    assert.equal(C.canon(C.canon("a" + c + "b")), "ab", hex(c));
  }
  for (const s of ["สวัสดีครับ", "Hello", "你好", "ทำบุญ 3 ครั้ง"]) assert.equal(C.canon(s), s);
});

const CRISIS = ["อยากทำร้ายตัวเอง", "อยากฆ่าตัวตาย", "จะโดดน้ำตาย", "พ่อทำร้ายฉันทุกวัน", "เขาแอบดูหนูอาบน้ำ", "I want to kill myself", "我想自杀"];
/** the text with the invisible character after its 2nd character and before its last */
const split = (/** @type {string} */ s, /** @type {string} */ c) => s.slice(0, 2) + c + s.slice(2, -1) + c + s.slice(-1);

test("S3 crisis net and FortuneAI.crisis.check: invisible characters inside the words do not hide a crisis", () => {
  const miss = [];
  for (const t of CRISIS) for (const c of INVISIBLE) {
    const x = split(t, c);
    if (!CR.check(x)) miss.push(`check ${t} ${hex(c)}`);
    if (!FA.crisis.check(x)) miss.push(`FortuneAI ${t} ${hex(c)}`);
  }
  assert.deepEqual(miss, []);
  for (const c of INVISIBLE) assert.equal(CR.soft("แม่" + c + "ทำร้าย"), true, "soft " + hex(c));
});

test("S3 medicine emergency(): invisible characters inside self-harm wording", () => {
  for (const c of INVISIBLE) {
    assert.equal(M.emergency("อยากทำ" + c + "ร้ายตัวเอง").self, true, hex(c));
    assert.equal(M.emergency("อยากตาย" + c).self, true, hex(c));
    assert.equal(M.emergency("ลดน้ำ" + c + "หนัก").self, false, hex(c));
  }
});

test("S3 Product Check guard: invisible characters inside an address, a phone or an ID do not hide it", () => {
  const bad = [];
  for (const c of INVISIBLE) {
    const cases = [
      ["ชื่อ สมหญิง รักดี\nที่อยู่: 45 ตำ" + c + "บลในเมือง อำ" + c + "เภอเมือง", ["name", "address"]],
      ["ชื่อ สมหญิง รักดี\nโทร 08" + c + "1-234-" + c + "5678", ["name", "phone"]],
      ["เลขประจำตัวประชาชน 1" + c + "101700203451", ["id"]],
      ["ชื่อผู้ป่วย: นายสมชาย ใจดี\nคำ" + c + "เตือน อาจทำให้ง่วงซึม", ["name"]],
      ["จำ" + c + "หน่ายโดย สมใจฟาร์ม โทร 02 123 4567", []],
    ];
    for (const [t, kinds] of cases) {
      const got = G.redact(t).removed.map(z => z.kind);
      if (JSON.stringify(got) !== JSON.stringify(kinds)) bad.push(`${hex(c)} ${JSON.stringify(t.split("\n").pop())}: ${JSON.stringify(got)} != ${JSON.stringify(kinds)}`);
    }
  }
  assert.deepEqual(bad, []);
});
