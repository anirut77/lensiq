"use strict";
// tests/unit/pc-session-evidence.test.js — P7 option ข (owner decision 2026-11-10): evidence scanned earlier in the session.
// Rule checks only; the official figures come from the independent run on the locked p7b set (docs/product-check/P7-RESULTS.md).
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../lensiq-pc-guard.js");

const SF = { sessionEvidence: "on", sessionFacts: { gtins: ["8851234567898"] } };
const FRONT = "ตราดาวเหนือ\nพาราเซต";

test("OFF by default (independent run missed the privacy target): session evidence changes nothing on the page or the Worker", async () => {
  assert.equal(G.DEFAULTS.sessionEvidence, "off");
  assert.equal(G.aiGate(FRONT, null, { sessionFacts: { gtins: ["8851234567898"] } }).allow, false);
  const pc = await import("../../backend/src/ai/pc-features.js");
  assert.throws(() => pc.buildFields({ text: FRONT, script: "th", sessionGtins: ["8851234567898"] }), /no-product/);
});

test("a capture without its own evidence is allowed with a valid scanned barcode or registration number, never with an invalid one", () => {
  assert.equal(G.aiGate(FRONT).reason, "no-product");
  const g = G.aiGate(FRONT, null, SF);
  assert.deepEqual([g.allow, g.reason, g.session], [true, "ok", true]);
  assert.equal(G.aiGate(FRONT, null, { sessionEvidence: "on", sessionFacts: { regs: ["1A 844/39"] } }).allow, true);
  for (const sf of [{ gtins: ["8851234567895"] }, { gtins: ["abc"] }, { regs: ["12"] }, {}, null, "x", { gtins: "8851234567898" }]) {
    assert.equal(G.aiGate(FRONT, null, { sessionEvidence: "on", sessionFacts: sf }).allow, false, JSON.stringify(sf));
  }
  // own evidence: not a session decision
  assert.equal(G.aiGate("TESTOL 500 mg\nเลขทะเบียน 1A 844/39", null, SF).session, false);
});

test("session evidence never lets through a capture with ANY personal data the guard can see, a personal-document sign or a dispensing look", () => {
  const personal = [
    "柳沢 大輔 様\nご出産おめでとうございます。\nご連絡は 090-5550-0199 まで。",   // name with honorific + JP phone (not detected as a span)
    "คุณสมศรี ใจดี\nกินยาหลังอาหาร",                                           // form of address
    "อย่าลืมกินยาตอนเช้า\nแม่",                                                 // reminder note
    "Dear John,\nthanks for the gift",
    "081 234 5678",                                                             // bare phone
    "นายสมชาย รักดี\n12/3 ถ.สุขุมวิท",
    "HN 123456\nParacetamol 500 mg 1 tab q6h prn",                              // dispensing
    "ผู้รับ: สมหญิง\nเลขพัสดุ TH123456789"                                        // delivery
  ];
  for (const t of personal) {
    const g = G.aiGate(t, null, SF);
    assert.equal(g.allow, false, t.split("\n")[0]);
    assert.equal(g.session, false);
  }
});

test("the Worker passes sessionGtins / sessionRegs to the same guard rule (switch read from the guard defaults)", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "backend", "src", "ai", "pc-features.js"), "utf8");
  assert.match(src, /const sf = \{ gtins: strList\(input\.sessionGtins\), regs: strList\(input\.sessionRegs\) \};/);
  assert.match(src, /Guard\.aiGate\(t, \{ gtins: strList\(input\.gtins\), regs: strList\(input\.regs\) \}, sf\.gtins\.length \|\| sf\.regs\.length \? \{ sessionFacts: sf \} : undefined\)/);
});

test("the page keeps session codes in memory only, for 15 minutes, and sends them only when the capture has none of its own", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "lensiq-pc-ai.js"), "utf8");
  assert.match(src, /const SESSION_MS = 15 \* 60 \* 1000;/);
  assert.match(src, /const sessionFacts = \(\) => \(sessionOn\(\) && sess\.at/, "off: nothing kept is used or sent");
  assert.match(src, /sf && !own\.gtins\.length && !own\.regs\.length \? \{ \.\.\.own, sessionGtins: sf\.gtins, sessionRegs: sf\.regs \} : own/);
  assert.ok(!/(localStorage|sessionStorage|indexedDB)[^\n]*sess\b/.test(src), "never stored");
  assert.match(src, /id="pcAiPrevSession"/, "the preview says the scanned codes were used");
});
