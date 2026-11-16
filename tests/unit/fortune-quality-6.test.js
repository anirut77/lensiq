"use strict";
// tests/unit/fortune-quality-6.test.js — FIXED TEST SET, round 6 of the fortune reading quality work. Appended to the locked set of
// phase fortune-quality BEFORE the round-6 fixes (after the independent re-check returned NOT OK on 38eb985:
// ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK-5.md, items D1-D5 and the carried-over R1).
// Detectors: tools/fortune-quality-metrics-6.mjs (written by the builder; the reviewer's scripts were not read). Inputs: 120 NEW
// synthetic inputs (fresh6) in TH / EN / ZH, gentle and straight, plus 12 targeted Thai readings for W5.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
let RUN = null;
async function run() {
  if (RUN) return RUN;
  const M = await import(path.join(ROOT, "tools", "fortune-quality-metrics-6.mjs"));
  const C = await M.corpus();
  RUN = { M, C, R: await M.measure(C), T: await M.targeted() };
  return RUN;
}
const table = (R, k) => Object.entries(R.per).filter(([, p]) => p[k]).map(([d, p]) => `${d} ${p[k]}`).join(", ");
const ex = (R, k) => (R.examples[k] || []).join("\n");
const zero = (k, what) => test(`${k}: ${what} (target 0)`, async () => {
  const { R } = await run();
  assert.equal(R.totals[k] || 0, 0, `${k} ${R.totals[k]} — ${table(R, k)}\n${ex(R, k)}`);
});

test("the fixed set: 120 fresh6 inputs, gentle and straight; 12 targeted W5 readings", async () => {
  const { C, T } = await run();
  assert.equal(C.length, 240);
  assert.equal(C.filter(x => x.straight).length, 120);
  assert.equal(T.length, 12);
});
zero("W1th", "Thai: no bracket citation credits a line to the wrong finding (D1)");
zero("W1en", "EN: no bracket citation credits a line to the wrong finding (D1)");
zero("W1zh", "ZH: no bracket citation credits a line to the wrong finding (D1)");
zero("W2", "EN / ZH: no \"It …\" / \"它…\" without its antecedent (D2)");
zero("W3", "EN / ZH: no \"also\" or glossary line without a finding named before it; numbered sources stay named (D3)");
zero("W4", "no content-free bracket citation (\"(ปีนี้)\", \"(this element's energy)\", \"（今年）\", topic words) (D4)");
zero("W5", "Thai advice is never turned into a statement (\"คุณมีเงินสำรองไว้…\") (D5)");
test("W5 targeted: the Tower reversed money advice stays advice (D5)", async () => {
  const { M, T } = await run();
  assert.deepEqual(M.w5Of(T), []);
});
zero("W6", "Thai group starts have their subject (general test, not a word list) (R1)");
