"use strict";
// tests/unit/fortune-quality-2.test.js — FIXED TEST SET, round 2 of the fortune reading quality work. Appended to the locked set of
// phase fortune-quality BEFORE the round-2 fixes (after the independent re-check returned NOT OK on 65fa9e8:
// ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK.md). Detectors: tools/fortune-quality-metrics-2.mjs (written by the
// builder; the reviewer's scripts were not used). Inputs: the round-1 sets plus 120 new synthetic inputs (fresh2). Base content
// numbers (Q12): tests/unit/fortune-quality-base-content.json, computed on fortune-live before this branch with the same inputs.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
let RUN = null;
async function run() {
  if (RUN) return RUN;
  const M = await import(path.join(ROOT, "tools", "fortune-quality-metrics-2.mjs"));
  const C = await M.corpus();
  RUN = { M, C, R: await M.measure(C) };
  return RUN;
}
const table = (R, k) => Object.entries(R.per).filter(([, p]) => p[k]).map(([d, p]) => `${d} ${p[k]}`).join(", ");
const ex = (R, k) => (R.examples[k] || []).join("\n");
const zero = (k, what, exk) => test(`${k}: ${what} (target 0)`, async () => {
  const { R } = await run();
  assert.equal(R.totals[k] || 0, 0, `${k} ${R.totals[k]} — ${table(R, k)}\n${ex(R, exk || k)}`);
});

test("the fixed set: 345 inputs (75 reviewer + 150 fresh + 120 fresh2)", async () => {
  const { C } = await run();
  assert.equal(C.length, 345);
  assert.equal(C.filter(r => r.set === "fresh2").length, 120);
});
zero("Q1", "no visible Thai part ends on a transition word, a lead + noun or inside brackets");
test("Q2: at most 10 % of overviews open with a stock main-point formula (TH / EN / ZH), no ZH duplication", async () => {
  const { R } = await run();
  for (const k of ["Q2th", "Q2en", "Q2zh"]) assert.ok(R.shares[k] <= 0.10, `${k} ${(100 * R.shares[k]).toFixed(1)} %`);
  assert.equal(R.totals.Q2dup || 0, 0, ex(R, "Q2dup"));
});
zero("Q3", "the visible overview says what the finding means (no bare label, raw percentage or pillars)");
zero("Q4", "no filler tips, no 'ชวนให้ให้', no tautology");
test("Q5: group openings vary (TH lead + finding <= 15 %, no contrastive ส่วน; EN template <= 15 %, no label echo)", async () => {
  const { R } = await run();
  assert.ok(R.shares.Q5th <= 0.15, `TH ${(100 * R.shares.Q5th).toFixed(1)} %`);
  assert.ok(R.shares.Q5en <= 0.15, `EN ${(100 * R.shares.Q5en).toFixed(1)} %`);
  assert.equal(R.totals.Q5thSuo || 0, 0, ex(R, "Q5suo"));
  assert.equal(R.totals.Q5echo || 0, 0, ex(R, "Q5echo"));
});
zero("Q6", "no action frame over a trait or fact");
zero("Q7", "a one-finding reading names it once and does not call it the most prominent");
zero("Q8", "the second named finding matches in TH / EN / ZH; tarot leads with a card");
test("Q9: report: one advice unit at most once per report", async () => {
  const { M } = await run();
  assert.deepEqual(M.reportIssues2(), []);
});
test("Q10: taksa love differs between users beyond the planet / day / number slots", async () => {
  const { R } = await run();
  assert.ok(R.q10.distinct * 2 >= R.q10.users, JSON.stringify(R.q10));
});
test("Q11: hub and lucky colour wording", async () => {
  const { M } = await run();
  assert.deepEqual(M.staticIssues2(), []);
});
test("Q12: content kept: per domain and language at least 90 % of the base's distinct meanings shown (fresh2 inputs)", async () => {
  const { M } = await run();
  const FA = require(path.join(ROOT, "fortune-ai.js"));
  const now = await M.contentOf(FA, await M.fresh2Facts()), base = M.BASE_CONTENT(), low = [];
  for (const [k, v] of Object.entries(base)) if ((now[k] || 0) < 0.9 * v) low.push(`${k} ${now[k]}/${v}`);
  assert.deepEqual(low, []);
});
