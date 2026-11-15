"use strict";
// tests/unit/fortune-quality-3.test.js — FIXED TEST SET, round 3 of the fortune reading quality work. Appended to the locked set of
// phase fortune-quality BEFORE the round-3 fixes (after the independent re-check returned NOT OK on d07ecbe:
// ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK-2.md). Detectors: tools/fortune-quality-metrics-3.mjs (written by the
// builder; the reviewer's scripts were not used). Inputs: the round-2 corpus plus 120 new synthetic inputs (fresh3) and the pinned
// phone number of fortune-safety-lint. Base characters (S8): tests/unit/fortune-quality-base-chars.json, the base composer
// (fortune-live before this branch) on the fresh3 facts.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
let RUN = null;
async function run() {
  if (RUN) return RUN;
  const M = await import(path.join(ROOT, "tools", "fortune-quality-metrics-3.mjs"));
  const C = await M.corpus();
  RUN = { M, C, R: await M.measure(C) };
  return RUN;
}
const table = (R, k) => Object.entries(R.per).filter(([, p]) => p[k]).map(([d, p]) => `${d} ${p[k]}`).join(", ");
const ex = (R, k) => (R.examples[k] || []).join("\n");
const zero = (k, what) => test(`${k}: ${what} (target 0)`, async () => {
  const { R } = await run();
  assert.equal(R.totals[k] || 0, 0, `${k} ${R.totals[k]} — ${table(R, k)}\n${ex(R, k)}`);
});

test("the fixed set: 465 inputs (345 of round 2 + 120 fresh3)", async () => {
  const { C } = await run();
  assert.equal(C.length, 465);
  assert.equal(C.filter(r => r.set === "fresh3").length, 120);
});
zero("S1", "an overview holds no topic block and nothing after its read-on line");
test("S1 pinned: the money overview of 0812345678 (seeds 1..60, TH / EN / ZH) has no love block and no love-only meaning", async () => {
  const { M } = await run();
  assert.deepEqual(M.pinnedIssues(), []);
});
test("S2: no 'finding + means-that verb' formula (TH <= 15 % of group starts, never 3 groups on one finding; EN 'In your reading' <= 5 %)", async () => {
  const { R } = await run();
  assert.ok(R.shares.S2th <= 0.15, `TH ${(100 * R.shares.S2th).toFixed(1)} %`);
  assert.ok(R.shares.S2en <= 0.05, `EN ${(100 * R.shares.S2en).toFixed(1)} %`);
  assert.equal(R.totals.S2same || 0, 0, ex(R, "S2same"));
});
zero("S3", "a means-that verb never wraps an instruction, simile, evidence or bare noun; no invitation to invest");
zero("S4", "no Thai cut before ๆ, no name split from its value, no dangling tag, no label-only group start");
test("S5: report: one tip at most once per report, compared on its core text", async () => {
  const { M } = await run();
  assert.deepEqual(M.reportIssues3(), []);
});
zero("S6", "the first named finding matches in TH / EN / ZH; lifegraph keeps the age band");
zero("S7a", "at most 2 stock caution leads per Thai reading");
zero("S7b", "no topic caution lead inside another topic's group");
zero("S7c", "the 'pick one' closer only after 2 or more tips");
zero("S7d", "lek7 and siam si: an advice line in every language when any language has one");
test("S8: content kept (characters, fresh3): each domain / language >= 75 % (lifegraph >= 80 %), each language >= 85 %", async () => {
  const { M } = await run();
  const FA = require(path.join(ROOT, "fortune-ai.js"));
  assert.deepEqual(M.charsIssues(await M.charsOf(FA, await M.fresh3Facts()), M.BASE_CHARS()), []);
});
zero("S9", "small Thai grammar (CJK glued to Thai, double ซึ่ง, content-free lead, raw % in a group, taksa tautology)");
test("S10: hub wording ('ดูได้', 'ลองเอง')", async () => {
  const { M } = await run();
  assert.deepEqual(M.staticIssues3(), []);
});
