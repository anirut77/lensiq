"use strict";
// tests/unit/fortune-cut-strict.test.js — FIXED TEST, owner inbox entry 18 (2026-11-23), acceptance Q2 "No cut text"
// (docs/acceptance/fortune-pages.md, faceread.md): 0 % cut summary bullets, 30 profiles × 3 languages. Written and locked
// (evals-locks/fortune-90.sha256, field copy ~/LENSIQ-field/evals/fortune-90/) BEFORE the fix.
// CI has no ~/LENSIQ-field, so this test rebuilds the same set in memory (makeProfiles(20261123), byte-identical to the locked
// q2-profiles.json; the locked harness tools/fortune-cut-check.mjs checks the field copy) and applies the harness's own rules:
// a bullet is cut when it stops before its source sentence ends (S1), ends on a connector while not ending at its source's
// sentence end (S2, v2), or ends on an ellipsis or with an open bracket / quote (S3). RE-LOCK v2 2026-11-23: see the harness.
// RE-LOCK v3 2026-11-23 (after the independent review): S1 exempts a bullet only when every occurrence of its tail ends a
// sentence; "." ends a sentence only before whitespace / the end and not after an abbreviation or a single letter; ";" only
// when nothing follows. Self-test cases for each v3 rule below.
// 16 domains (13 reading pages + Siam Si + face reading + report) × 30 × TH/EN/ZH × gentle/straight.
const test = require("node:test");
const assert = require("node:assert/strict");

test("checker self-test: the rules catch cut bullets and pass whole ones", async () => {
  const C = await import("../../tools/fortune-cut-check.mjs");
  const k = (b, src, l) => C.classify(b, l || "th", [[src], []]);
  assert.equal(k("ช่วงนี้ไปเที่ยวใกล้ ๆ บ้านก็พอ", "ช่วงนี้ไปเที่ยวใกล้ ๆ บ้านก็พอ").cut, false);
  assert.deepEqual(k("ทิศที่เข้ากับคุณตามตำราคือเหนือ ใต้ ตะวันออก", "ทิศที่เข้ากับคุณตามตำราคือเหนือ ใต้ ตะวันออก และตะวันออกเฉียงใต้").rules, ["S1"]);
  assert.deepEqual(k("มีความคิดใหม่เข้ามาในหัวตอนที่ไม่ได้ตั้งใจคิด เช่น", "มีความคิดใหม่เข้ามาในหัวตอนที่ไม่ได้ตั้งใจคิด เช่น ตอนอาบน้ำ").rules.sort(), ["S1", "S2"]);
  assert.equal(k("Rest well tonight.", "Rest well tonight. Then plan your week.", "en").cut, false);
  assert.equal(k("ช่วยให้รู้สึกได้พักผ่อนเต็มที่", "ช่วยให้รู้สึกได้พักผ่อนเต็มที่").cut, false); // v2: the source's own last word
  assert.equal(k("hope to find a partner you can grow with", "hope to find a partner you can grow with", "en").cut, false);
  assert.equal(k("Rest well tonight and", "Rest well tonight and plan your week.", "en").cut, true);
  assert.equal(k("先听清自己内心的声音，再做决定", "先听清自己内心的声音，再做决定", "zh").cut, false);
  assert.equal(k("先听清自己内心的声音，", "先听清自己内心的声音，再做决定", "zh").cut, true);
  assert.deepEqual(k("ควรเลี่ยงทิศ (เทียนอี", "ควรเลี่ยงทิศ (เทียนอี) ในช่วงนี้เพื่อความสบายใจของคุณ").rules.sort(), ["S1", "S3"]);
  assert.equal(k("วางแผนการเงินให้รอบคอบ…", "zzzzzzzzzzzz").cut, true);
});

test("checker self-test v3: abbreviations, a.m., decimals, ';' continuations and every-occurrence matching", async () => {
  const C = await import("../../tools/fortune-cut-check.mjs");
  const k = (b, srcs, l) => C.classify(b, l || "en", [[].concat(srcs), []]);
  // "." after an abbreviation or a single letter is not a sentence end
  assert.ok(k("Try something calm, e.g", "Try something calm, e.g. a short walk after dinner.").rules.includes("S1"));
  assert.ok(k("Try something calm, e.g.", "Try something calm, e.g. a short walk after dinner.").cut);
  assert.ok(k("Plan the talk for 9 a", "Plan the talk for 9 a.m. on Monday.").rules.includes("S1"));
  assert.ok(k("Book an appointment with Dr", "Book an appointment with Dr. Lee this week.").rules.includes("S1"));
  assert.ok(k("Bring snacks, water, etc", "Bring snacks, water, etc. on the trip.").cut);
  // a decimal part is not a sentence end
  assert.ok(k("Your score rose to 3", "Your score rose to 3.5 this month.").rules.includes("S1"));
  // ";" with more text after it continues the sentence; at the very end it closes it
  assert.ok(k("Keep short notes each day", "Keep short notes each day; review them on Sunday.").rules.includes("S1"));
  assert.equal(k("Keep short notes each day", "Keep short notes each day;").cut, false);
  assert.ok(k("每天花一点时间写下简短的记录", "每天花一点时间写下简短的记录；周日再一起回顾。", "zh").rules.includes("S1"));
  // every occurrence of the tail must end a sentence (v2: one was enough)
  assert.ok(k("Take the steady path and", ["Take the steady path and", "Take the steady path and rest well."]).rules.includes("S1"));
  assert.ok(k("Take the steady path and", ["Take the steady path and", "Take the steady path and rest well."]).rules.includes("S2"));
  // whole sentences still pass
  assert.equal(k("Rest well tonight.", "Rest well tonight. Then plan your week.").cut, false);
  assert.equal(k("Meet your friend at 9 a.m.", "Meet your friend at 9 a.m.").cut, false);
  assert.equal(k("The plan has three steps", "The plan has three steps. Start with one.").cut, false);
  assert.equal(k("Plan a quiet day!", ["Plan a quiet day! It helps.", "Plan a quiet day!"]).cut, false);
  assert.equal(k("今天先好好休息一下再出发吧！", ["今天先好好休息一下再出发吧！明天见。"], "zh").cut, false);
});

test("every summary bullet ends where its source sentence ends (16 domains × 30 × TH/EN/ZH × gentle/straight)", { timeout: 900000 }, async () => {
  const C = await import("../../tools/fortune-cut-check.mjs");
  const D = await import("../../tools/fortune-depth-audit.mjs");
  const set = D.makeProfiles(20261123);
  assert.equal(set.profiles.length, 16 * 30);
  const R = C.measure(set);
  assert.ok(R.lines >= R.readings * 1.5, "too few bullets: " + R.lines + " for " + R.readings + " readings");
  assert.ok(R.unmatched <= R.lines * 0.05, "unmatched bullets " + R.unmatched + " of " + R.lines);
  const show = b => b.id + " " + b.lang + "/" + b.mode + " " + b.rules.join(",") + " " + JSON.stringify(b.t);
  assert.equal(R.cut, 0, R.cut + " cut bullets of " + R.lines + ", e.g.\n" + R.bad.slice(0, 12).map(show).join("\n"));
});
