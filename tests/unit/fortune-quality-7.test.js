"use strict";
// tests/unit/fortune-quality-7.test.js — FIXED TEST SET, round 7 of the fortune reading quality work. Appended to the locked set of
// phase fortune-quality BEFORE the round-7 fixes (after the independent re-check returned NOT OK on 1168a59:
// ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK-6.md, items N1-N5).
// Detectors: tools/fortune-quality-metrics-7.mjs (written by the builder; the reviewer's scripts were not read). Inputs: 240 NEW
// synthetic inputs (fresh7) in TH / EN / ZH, gentle and straight, 8 reports per language and 48 targeted readings.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
let RUN = null;
async function run() {
  if (RUN) return RUN;
  const M = await import(path.join(ROOT, "tools", "fortune-quality-metrics-7.mjs"));
  const C = await M.corpus(), T = await M.targeted();
  RUN = { M, C, R: await M.measure(C), RP: await M.reportIssues7(), T, TI: await M.targetedIssues(T) };
  return RUN;
}
const table = (R, k) => Object.entries(R.per).filter(([, p]) => p[k]).map(([d, p]) => `${d} ${p[k]}`).join(", ");
const ex = (R, k) => (R.examples[k] || []).join("\n");
const zero = (k, what) => test(`${k}: ${what} (target 0)`, async () => {
  const { R } = await run();
  assert.equal(R.totals[k] || 0, 0, `${k} ${R.totals[k]} — ${table(R, k)}\n${ex(R, k)}`);
});

test("the fixed set: 240 fresh7 inputs, gentle and straight; 48 targeted readings", async () => {
  const { C, T } = await run();
  assert.equal(C.length, 480);
  assert.equal(C.filter(x => x.straight).length, 240);
  assert.equal(T.length, 48);
});
zero("X1", "Thai: no \"คุณ\" before a noun subject, a label or an advice frame (N1)");
zero("X2", "EN: \"It\" is replaced by a finding's name only when it meant the finding (N2)");
zero("X3", "EN: \"By tradition,\" keeps the case of the next word, once per paragraph, never twice in a sentence, never on a calculation (N3)");
zero("X4th", "TH: no lead stacked on a glossary line, no stacked labels (N4)");
zero("X4en", "EN: no lead stacked on a glossary line, no stacked labels (N4)");
zero("X4zh", "ZH: no lead stacked on a glossary line, no stacked labels (N4)");
zero("X5th", "TH: no doubled bracket, no Chinese punctuation in a Thai bracket (N5)");
zero("X5en", "EN: no doubled bracket (N5)");
zero("X5zh", "ZH: no doubled bracket (N5)");
test("report: X1 / X4 / X5 (target 0)", async () => {
  const { RP } = await run();
  assert.deepEqual([].concat(RP.X1, RP.X4, RP.X5), []);
});
test("targeted: pair 20 (N2) and hexagram 37 (N5) (target 0)", async () => {
  const { TI } = await run();
  assert.deepEqual(TI, []);
});
