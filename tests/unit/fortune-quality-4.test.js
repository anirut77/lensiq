"use strict";
// tests/unit/fortune-quality-4.test.js — FIXED TEST SET, round 4 of the fortune reading quality work. Appended to the locked set of
// phase fortune-quality BEFORE the round-4 fixes (after the independent re-check returned NOT OK on 431d2c8:
// ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK-3.md, items N1-N4, padded briefs and the carried-over items).
// Detectors: tools/fortune-quality-metrics-4.mjs (written by the builder; the reviewer's scripts were not read). Inputs: 120 NEW
// synthetic inputs (fresh4) in TH / EN / ZH and 6 new report births.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
let RUN = null;
async function run() {
  if (RUN) return RUN;
  const M = await import(path.join(ROOT, "tools", "fortune-quality-metrics-4.mjs"));
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

test("the fixed set: 120 fresh4 inputs", async () => {
  const { C } = await run();
  assert.equal(C.length, 120);
});
test("U1 (N1): stock openers <= 15 % of group starts in TH, EN and ZH", async () => {
  const { R } = await run();
  for (const L of ["th", "en", "zh"]) assert.ok(R.shares[L] <= 0.15, `${L} ${(100 * R.shares[L]).toFixed(1)} % — ${table(R, "U1" + L)}\n${ex(R, "U1" + L)}`);
});
zero("U2", "no identical source lead twice in one reading");
zero("U3", "no reading where 60 % or more of the groups open with a stock opener");
zero("U4", "no wrong-type frame (verb + instruction, ปีนี้ + verb, no subject, evidence after a lead)");
test("U5 (N2): report: each glossary sentence once; no EN / ZH sentence twice in one report", async () => {
  const { M } = await run();
  const r = await M.reportIssues4();
  assert.deepEqual(r.gloss, []);
  assert.deepEqual(r.en, []);
  assert.deepEqual(r.zh, []);
});
zero("U6", "the closer is the last line of its group (N3)");
zero("U7", "no visible cut inside a list, before a quote, between a label and its number or after a dangling year (N4)");
zero("U8", "no brief padded with a stock tip; no two readings share a brief");
zero("U9", "lifegraph: no raw level in visible text; fengshui: no content-free lead, overview says more than its labels");
zero("U10", "taksa social differs between users");
zero("U11", "lek7, siam si and lifegraph: an advice group in TH, EN and ZH");
test("U12: siam si EN content >= 85 % of base", async () => {
  const { M } = await run();
  const v = await M.siamseeEn();
  assert.ok(v >= 0.85, `siam si EN ${(100 * v).toFixed(1)} %`);
});
