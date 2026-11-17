"use strict";
// tests/unit/crisis-v3-r2.test.js — FIXED TEST SET "crisis-v3", review round 2 (protection-only items asked with the review of
// 8cee117). Locked BEFORE the change (evals-locks/crisis-v3.sha256, tag r2-lock).
//   N1 the crisis net catches the phrases the reviewer found missing (TH / EN / ZH), in fortune-crisis.js.
//   N2 the fallback used when fortune-crisis.js fails to load (the stand-in in fortune-read.js, exported as LQRead.standIn) checks
//      with the SAME pattern list: for every locked phrase (MUST60 of fortune-crisis-net-3 plus N1) it answers exactly as
//      fortune-crisis.js check() does, and ordinary text stays clear.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const NEW = {
  th: ["คืนนี้จะจบทุกอย่าง", "จะจบทุกอย่างแล้ว"],
  en: ["gonna end it all tonight", "I'm gonna end it all", "I just want to end it all", "kms", "thinking about how to unalive myself"],
  zh: ["生无可恋", "一了百了算了", "今晚就结束一切"],
};
const ORDINARY = ["ฝันเห็นงูใหญ่ในบ้าน", "งานจะจบคืนนี้", "the movie will end tonight", "let's end the meeting", "明天开会", "今晚吃什么"];
function must60() {
  const src = fs.readFileSync(path.join(ROOT, "tests/unit/fortune-crisis-net-3.test.js"), "utf8");
  const m = /const MUST60 = (\[[\s\S]*?\n\]);/.exec(src);
  assert.ok(m, "MUST60 found");
  return new Function("return " + m[1])().map(x => x[2]);
}

test("N1: the crisis net catches the reviewer's missed phrases (TH / EN / ZH)", () => {
  const CR = require("../../fortune-crisis.js");
  for (const lang of Object.keys(NEW)) for (const t of NEW[lang]) assert.equal(CR.check(t), true, lang + ": " + JSON.stringify(t));
  for (const t of ORDINARY) assert.equal(CR.check(t), false, "ordinary: " + JSON.stringify(t));
});

test("N2: the fallback stand-in checks with the same pattern list as fortune-crisis.js", () => {
  const CR = require("../../fortune-crisis.js");
  const RD = require("../../fortune-read.js");
  assert.equal(typeof RD.standIn, "function", "LQRead.standIn exported");
  const SI = RD.standIn(() => false);
  const all = must60().concat(...Object.values(NEW), ORDINARY);
  for (const t of all) assert.equal(!!SI.check(t), !!CR.check(t), "same answer for " + JSON.stringify(t));
  for (const t of NEW.en.concat(NEW.zh, NEW.th)) assert.equal(!!SI.check(t), true, "stand-in catches " + JSON.stringify(t));
});
