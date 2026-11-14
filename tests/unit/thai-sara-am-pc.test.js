"use strict";
// tests/unit/thai-sara-am-pc.test.js — FIXED TEST SET (thai-sara-am, locked 2026-11-14 BEFORE the fix; sha256 in
// evals-locks/thai-sara-am.sha256 and ~/LENSIQ-field/evals/thai-sara-am/locked.sha256).
// Independent review 2026-11-14: the live scan (lensiq-pc-live.js normLine) runs NFKC, which DECOMPOSES ำ (nikhahit + sara
// aa), and the result went to the Product Check guard (lensiq-pc-guard.js) unchanged. The guard's patterns are written with
// ำ, so on live text it MISSED a home address (ตำบล / อำเภอ) next to a person (privacy), took the label warning "คำเตือน
// อาจทำให้ง่วงซึม" for a name (over-redaction, photo blocked, AI refused as a dispensing label) and lost the maker cue
// จำหน่ายโดย / นำเข้าโดย (the company phone was removed). Every shape of the text must give the composed text's result in
// redact() / imageCheck() / aiGate(), and the live merger must hand on text the guard reads correctly.
const test = require("node:test");
const assert = require("node:assert/strict");
const { forms } = require("../fixtures/thai-sara-am-forms.js");
const G = require("../../lensiq-pc-guard.js");
const L = require("../../lensiq-pc-live.js");

// [text, expected removed [kind, text] (text as composed), photo blocked, aiGate reason]
const CASES = [
  ["ชื่อ สมหญิง รักดี\nที่อยู่: 45 ตำบลในเมือง อำเภอเมือง", [["name", "สมหญิง รักดี"], ["address", "45 ตำบลในเมือง อำเภอเมือง"]], true, "personal-doc"],
  ["ผู้รับยา: นายสมชาย ใจดี\nตำบลบางรัก อำเภอเมือง", [["name", "นายสมชาย ใจดี"], ["name", "ตำบลบางรัก อำเภอเมือง"]], true, "dispensing"],
  ["ชื่อผู้ป่วย: นายสมชาย ใจดี\nคำเตือน อาจทำให้ง่วงซึม", [["name", "นายสมชาย ใจดี"]], true, "dispensing"],
  ["ชื่อผู้ป่วย: นายสมชาย ใจดี\nรับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร\nคำเตือน อาจทำให้ง่วงซึม", [["name", "นายสมชาย ใจดี"]], true, "dispensing"],
  ["ยาแก้แพ้ คลอร์เฟนิรามีน 4 มก.\nรับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง\nคำเตือน อาจทำให้ง่วงซึม", [], false, "ok"],
  ["จำหน่ายโดย สมใจฟาร์ม โทร 02 123 4567", [], false, "no-product"],
  ["นำเข้าโดย สมใจเทรดดิ้ง โทร 02 123 4567", [], false, "no-product"],
  ["ยาแก้ไอ\nจำหน่ายโดย สมใจฟาร์ม 99 ตำบลบางรัก อำเภอเมือง โทร 02 123 4567", [], false, "no-product"],
];

test("redact / imageCheck / aiGate: every shape of ำ gives the composed text's result", () => {
  const bad = [];
  for (const [t, removed, block, reason] of CASES) for (const [label, x] of forms(t)) {
    const r = G.redact(x), img = G.imageCheck(x), gate = G.aiGate(x);
    const got = JSON.stringify([r.removed.map(z => [z.kind, z.text.normalize("NFC")]), img.block, gate.reason]);
    const want = JSON.stringify([removed, block, reason]);
    if (got !== want) bad.push(`${t.split("\n")[0]} / ${label}: ${got} != ${want}`);
    if (/ํา/.test(r.text)) bad.push(`${t.split("\n")[0]} / ${label}: redacted text still holds a decomposed ำ`);
  }
  assert.deepEqual(bad, []);
});

test("redact(): a home address next to a person is removed whatever the shape of ตำบล / อำเภอ (privacy)", () => {
  for (const [label, x] of forms("ชื่อ สมหญิง รักดี\nที่อยู่: 45 ตำบลในเมือง อำเภอเมือง")) {
    const r = G.redact(x);
    assert.ok(r.removed.some(z => z.kind === "address"), label);
    assert.doesNotMatch(r.text, /ในเมือง/, label);
    assert.equal(G.imageCheck(x).block, true, label);
  }
});

test("live scan: lines merged across frames reach the guard as composed Thai", () => {
  const lines = ["ชื่อ สมหญิง รักดี", "ที่อยู่: 45 ตำบลในเมือง อำเภอเมือง", "คำเตือน อาจทำให้ง่วงซึม"];
  for (const [label, shape] of [["composed", (/** @type {string} */ s) => s], ["decomposed", (/** @type {string} */ s) => s.normalize("NFKC")],
    ["zero-width", (/** @type {string} */ s) => s.replace(/ำ/g, "ำ​")]]) {
    const m = L.makeMerger();
    for (let i = 0; i < 3; i++) m.add(lines.map(shape));
    const text = m.text();
    assert.equal(text, lines.join("\n"), label);
    assert.doesNotMatch(text, /ํ/, label);
    const r = G.redact(text);
    assert.deepEqual(r.removed.map(z => z.kind), ["name", "address"], label);
    // the one-tap text check sees the same thing
    const chk = L.autoTextCheck(G, text, {});
    assert.equal(chk.hits, 2, label);
  }
});

test("live scan: similarity and sameObject treat the shapes of one line as the same line", () => {
  const a = "คำเตือน อาจทำให้ง่วงซึม";
  assert.equal(L.similarity(a, a.normalize("NFKC")), 1);
  assert.equal(L.similarity(a, a.replace(/ำ/g, "ำ​")), 1);
  assert.equal(L.sameObject([a], [a.normalize("NFKC")]), true);
});

test("aiGate on a plain product label with ำ (benign) stays allowed in every shape", () => {
  const label = "ยาแก้ไอน้ำดำ ตราสมใจ\nส่วนประกอบ: กลีเซอรีน\nวิธีใช้ รับประทานครั้งละ 1 ช้อนชา วันละ 3 ครั้ง\nคำเตือน ห้ามใช้ในเด็กอายุต่ำกว่า 2 ปี\nเลขทะเบียนยา 1A 15/50";
  const want = G.aiGate(label).reason;
  assert.equal(want, "ok");
  for (const [k, x] of forms(label)) {
    assert.equal(G.aiGate(x).reason, "ok", k);
    assert.equal(G.redact(x).count, 0, k);
    assert.equal(G.imageCheck(x).block, false, k);
  }
});
