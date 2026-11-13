"use strict";
// tests/unit/pc-guard-complexity.test.js — the Product Check guard runs on the device and in the Worker on text up to 8,000
// characters (MAX_TEXT). Independent review 2026-11-13 (stream F): a line of phone numbers or a long digit run made it
// quadratic or worse (8,000 characters: 88 s on main). This test is RELATIVE, not absolute, so a slow or busy CI machine
// does not fail it: for each adversarial shape, 8x more text must cost at most 24x more time (linear = 8x, quadratic = 64x),
// and the 8,000-character adversarial text must cost at most 25x an ordinary label text of the same length. CPU time, interleaved, fastest of 7 runs.
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
  "address parts": n => rep("12/3 ซอย 5 ถนน 7 Road 9 Moo ", n),
  // added at re-lock 2 (independent review of F2: still quadratic on these before the fix)
  "spaces only": n => " ".repeat(n),
  "spaces and new lines": n => rep(" \n", n),
  "road words without a digit": n => rep("Road ", n),
  "class / family / to lines": n => rep("3年2組 たなか ひなた\n할머니 형숙 퇴원\nひろとへ お薬\n", n),
  "OCR phones and member numbers": n => rep("TEL 09O-3318-2276 会員番号 1 1 1 1 ", n)
};
const LABEL = n => rep("ส่วนประกอบ: พาราเซตามอล 500 มก.\nเลขทะเบียน 1A 15/50\nผลิตโดย บริษัท ทดสอบ จำกัด โทร 02-123-4567\nEXP 01/2028 LOT 2611A\n", n);
const run = s => { G.scan(s); G.aiGate(s); G.imageCheck(s); G.possibleNames(s); G.autoBlock(s); };
// Cost = this process's CPU time (process.cpuUsage: time other processes take from us is not counted), the two texts compared
// timed INTERLEAVED (a, b, a, b, ...) after one untimed warm-up run of each, each keeping its FASTEST of 7 runs (GC only ever
// adds). Re-lock 1: median of 3 -> 5; re-lock 2: this, after a loaded machine (load 10-40) spread wall-clock runs of the same
// text 5-176 ms. The bounds are unchanged; a quadratic shape still fails (main: minutes at 8,000 characters).
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const pair = (a, b) => {
  run(a); run(b);
  let ta = Infinity, tb = Infinity;
  for (let i = 0; i < 7; i++) {
    let s = cpu(); run(a); ta = Math.min(ta, cpu() - s);
    s = cpu(); run(b); tb = Math.min(tb, cpu() - s);
  }
  return [ta, tb];
};
const FLOOR = 30; // ms: below this, timer noise dominates and nothing is compared

test("guard time grows about linearly with the text on adversarial shapes (8x text -> at most 24x time)", () => {
  for (const [name, f] of Object.entries(SHAPES)) {
    const [t1, t8] = pair(f(1000), f(8000));
    if (t8 < FLOOR) continue;
    assert.ok(t8 <= 24 * Math.max(t1, FLOOR / 24), `${name}: 1,000 chars ${t1.toFixed(1)} ms, 8,000 chars ${t8.toFixed(1)} ms`);
  }
});

test("an 8,000-character adversarial text costs at most 25x an ordinary label text of the same length", () => {
  for (const [name, f] of Object.entries(SHAPES)) {
    const [base0, t] = pair(LABEL(8000), f(8000));
    const base = Math.max(base0, FLOOR / 25);
    if (t < FLOOR) continue;
    assert.ok(t <= 25 * base, `${name}: ${t.toFixed(1)} ms vs ordinary label ${base.toFixed(1)} ms`);
  }
});
