"use strict";
// tests/unit/thai-sara-am-canon.test.js — FIXED TEST SET (thai-sara-am, locked 2026-11-14 BEFORE the fix; sha256 in
// evals-locks/thai-sara-am.sha256 and ~/LENSIQ-field/evals/thai-sara-am/locked.sha256). Independent review 2026-11-14:
// Thai sara am ำ arrives decomposed (nikhahit U+0E4D + sara aa U+0E32: NFKC, PDF copy-paste, some keyboards, OCR), with
// the tone mark typed after ำ, or with zero-width characters inside a word; matchers written with ำ then miss.
// The shared canonicaliser lensiq-thai-canon.js (browser: window.LQThaiCanon, Node: module.exports):
//   canon(s): NFC; zero-width characters removed; nikhahit (+ tone marks in either order) + sara aa -> tone mark + ำ;
//   a tone mark typed after ำ moved before it. Idempotent; ordinary text (composed, no zero-width) is returned unchanged.
// Every page that loads a matcher using it loads lensiq-thai-canon.js too.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { forms } = require("../fixtures/thai-sara-am-forms.js");

const ROOT = path.join(__dirname, "..", "..");
const C = require("../../lensiq-thai-canon.js");

test("canon: every shape of ำ comes back as the composed word (tone mark before ำ)", () => {
  for (const w of ["ทำร้าย", "น้ำ", "ตำบล", "อำเภอ", "คำเตือน", "จำหน่ายโดย", "ห้างหุ้นส่วนจำกัด", "ลดน้ำหนัก", "ซ้ำ", "ค่ำ", "กำลัง", "อยากทำร้ายตัวเอง", "เขาแอบดูหนูอาบน้ำ"]) {
    for (const [label, x] of forms(w)) assert.equal(C.canon(x), w, `${w} / ${label}: ${JSON.stringify(x)}`);
  }
  assert.equal(C.canon("ลดนำ้หนัก"), "ลดน้ำหนัก", "tone mark typed after ำ");
  assert.equal(C.canon("นํ้า"), "น้ำ", "nikhahit + tone + sara aa");
  assert.equal(C.canon("น้ํา"), "น้ำ", "tone + nikhahit + sara aa");
  assert.equal(C.canon("นํา้"), "น้ำ", "nikhahit + sara aa + tone");
  assert.equal(C.canon("ทํ​า"), "ทำ", "zero-width between the halves");
});

test("canon: NFC, zero-width removed, null / numbers safe, ordinary text unchanged", () => {
  assert.equal(C.canon(null), "");
  assert.equal(C.canon(undefined), "");
  assert.equal(C.canon(12), "12");
  assert.equal(C.canon("é"), "é", "NFC");
  assert.equal(C.canon("a​b‌c‍d⁠e﻿f­g"), "abcdefg");
  for (const s of ["สวัสดีครับ", "Hello, world", "你好 世界", "ทำบุญตักบาตร วันละ 3 ครั้ง", "รับประทานครั้งละ 1 เม็ด", "กิน 500 mg", "น้ำท่วม 👨‍👩‍👧"]) {
    const keep = s.replace(/‍/g, ""); // emoji joiners are zero-width too: removed (the canonical copy is for matching)
    assert.equal(C.canon(s), keep, s);
  }
  // a nikhahit that is not followed by sara aa (Pali / Sanskrit spellings) is kept
  assert.equal(C.canon("สํสาร"), "สํสาร");
});

test("canon: idempotent (fixed pseudo-random strings over the characters involved)", () => {
  const alphabet = ["ก", "น", "ท", "ำ", "ํ", "า", "่", "้", "๊", "๋", "​", "‍", " ", "a", "ิ", "ั"];
  let seed = 20261114;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 3000; i++) {
    let s = "";
    const n = 1 + Math.floor(rnd() * 12);
    for (let k = 0; k < n; k++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    const once = C.canon(s);
    assert.equal(C.canon(once), once, JSON.stringify(s));
    assert.ok(!/ํ[่-๋]*า/.test(once), "no nikhahit + sara aa left: " + JSON.stringify(s));
    assert.ok(!/ำ[่-๋]/.test(once), "no tone mark after ำ left: " + JSON.stringify(s));
    assert.ok(!/[​-‍⁠﻿­]/.test(once), "no zero-width left: " + JSON.stringify(s));
  }
});

test("canon: dependency-free UMD file (browser global LQThaiCanon, Node module)", () => {
  const src = fs.readFileSync(path.join(ROOT, "lensiq-thai-canon.js"), "utf8");
  assert.doesNotMatch(src, /\brequire\(/, "no dependencies");
  assert.match(src, /LQThaiCanon/);
  assert.equal(typeof C.canon, "function");
});

test("every page that loads a matcher using the canonicaliser loads lensiq-thai-canon.js first", () => {
  const users = ["fortune-crisis.js", "fortune-ai.js", "lensiq-med.js", "lensiq-pc-guard.js", "lensiq-pc-live.js", "lensiq-pc-travel.js"];
  const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));
  let checked = 0;
  for (const p of pages) {
    const html = fs.readFileSync(path.join(ROOT, p), "utf8");
    const at = users.map(u => html.search(new RegExp(`<script src="${u.replace(/\./g, "\\.")}(?:\\?v=\\d+)?"`))).filter(i => i >= 0);
    if (!at.length) continue;
    checked++;
    const canonAt = html.search(/<script src="lensiq-thai-canon\.js\?v=\d+"><\/script>/);
    assert.ok(canonAt >= 0, `${p} loads lensiq-thai-canon.js`);
    assert.ok(canonAt < Math.min(...at), `${p} loads lensiq-thai-canon.js before the matchers`);
  }
  assert.ok(checked >= 19, "fortune pages and medicine.html found: " + checked);
});
