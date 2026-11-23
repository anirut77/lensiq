"use strict";
// tests/unit/fortune-cut-strict.test.js — FIXED TEST, owner inbox entry 18 (2026-11-23), acceptance Q2 "No cut text"
// (docs/acceptance/fortune-pages.md, faceread.md): 0 % cut summary bullets, 30 profiles × 3 languages. Written and locked
// (evals-locks/fortune-90.sha256, field copy ~/LENSIQ-field/evals/fortune-90/) BEFORE the fix.
// CI has no ~/LENSIQ-field, so this test rebuilds the same set in memory (makeProfiles(20261123), byte-identical to the locked
// q2-profiles.json; the locked harness tools/fortune-cut-check.mjs checks the field copy) and applies the harness's own rules:
// a bullet is cut when it stops before its source sentence ends (S1), ends on a connector while not ending at its source's
// sentence end (S2, v2), or ends on an ellipsis or with an open bracket / quote (S3). RE-LOCK v2 2026-11-23: see the harness.
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
