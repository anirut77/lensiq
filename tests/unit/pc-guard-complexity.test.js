"use strict";
// tests/unit/pc-guard-complexity.test.js — the Product Check guard runs on the device and in the Worker on text up to 8,000
// characters (MAX_TEXT). Independent review 2026-11-13 (stream F): a line of phone numbers or a long digit run made it
// quadratic or worse (8,000 characters: 88 s on main). This test is RELATIVE, not absolute, so a slow or busy CI machine
// does not fail it: for each adversarial shape, 8x more text must cost at most 24x more time (linear = 8x, quadratic = 64x),
// and the 8,000-character adversarial text must cost at most 25x an ordinary label text of the same length. Medians of 5.
// Locked in evals-locks/pc-f.sha256 (stream F2).
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../lensiq-pc-guard.js");

const rep = (u, n) => u.repeat(Math.ceil(n / u.length)).slice(0, n);
const SHAPES = {
  "phones on one line": n => rep("010-1234-5678 ", n),
  "phones on many lines": n => rep(rep("0812345678 0898765432 02-123-4567 ", 196) + "\n", n),
  "digit run after a Japanese address": n => "東京都千代田区" + rep("1234567890", n - 7),
  "digits and 年": n => rep("1111年", n),
  "digits and dashes": n => rep("12-34-56 ", n),
  "e-mail-like characters": n => rep("ab.cd_12", n),
  "Thai without spaces": n => rep("ส่วนประกอบพาราเซตามอลผลิตโดยบริษัททดสอบจำกัด", n),
  "Latin capitalised words": n => rep("Sample Name Text ", n),
  "kana and さん": n => rep("たなかさん", n),
  "Hangul and 님": n => rep("김민수님 ", n),
  "address parts": n => rep("12/3 ซอย 5 ถนน 7 Road 9 Moo ", n)
};
const LABEL = n => rep("ส่วนประกอบ: พาราเซตามอล 500 มก.\nเลขทะเบียน 1A 15/50\nผลิตโดย บริษัท ทดสอบ จำกัด โทร 02-123-4567\nEXP 01/2028 LOT 2611A\n", n);
const run = s => { G.scan(s); G.aiGate(s); G.imageCheck(s); G.possibleNames(s); G.autoBlock(s); };
// one untimed warm-up run of the same text, then the median of 5 (re-lock 2026-11-13: a single GC pause on a busy machine
// made one of 3 runs count; the bounds are unchanged)
const time = s => {
  run(s);
  const xs = [];
  for (let i = 0; i < 5; i++) { const a = process.hrtime.bigint(); run(s); xs.push(Number(process.hrtime.bigint() - a) / 1e6); }
  return xs.sort((a, b) => a - b)[2];
};
const FLOOR = 30; // ms: below this, timer noise dominates and nothing is compared

test("guard time grows about linearly with the text on adversarial shapes (8x text -> at most 24x time)", () => {
  run(LABEL(1000)); // warm up the regex compiler
  for (const [name, f] of Object.entries(SHAPES)) {
    const t1 = time(f(1000)), t8 = time(f(8000));
    if (t8 < FLOOR) continue;
    assert.ok(t8 <= 24 * Math.max(t1, FLOOR / 24), `${name}: 1,000 chars ${t1.toFixed(1)} ms, 8,000 chars ${t8.toFixed(1)} ms`);
  }
});

test("an 8,000-character adversarial text costs at most 25x an ordinary label text of the same length", () => {
  const base = Math.max(time(LABEL(8000)), FLOOR / 25);
  for (const [name, f] of Object.entries(SHAPES)) {
    const t = time(f(8000));
    if (t < FLOOR) continue;
    assert.ok(t <= 25 * base, `${name}: ${t.toFixed(1)} ms vs ordinary label ${base.toFixed(1)} ms`);
  }
});
