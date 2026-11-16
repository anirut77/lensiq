"use strict";
// tests/unit/fortune-quality-5.test.js — FIXED TEST SET, round 5 of the fortune reading quality work. Appended to the locked set of
// phase fortune-quality BEFORE the round-5 fixes (after the independent re-check returned NOT OK on d0c8b43:
// ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK-4.md, items R1-R3 and the should-fix items).
// Detectors: tools/fortune-quality-metrics-5.mjs (written by the builder; the reviewer's scripts were not read). Inputs: 120 NEW
// synthetic inputs (fresh5) in TH / EN / ZH, gentle and straight, and 5 new report births (8 reports per language).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
let RUN = null;
async function run() {
  if (RUN) return RUN;
  const M = await import(path.join(ROOT, "tools", "fortune-quality-metrics-5.mjs"));
  const C = await M.corpus();
  RUN = { M, C, R: await M.measure(C), RP: await M.reportIssues5() };
  return RUN;
}
const table = (R, k) => Object.entries(R.per).filter(([, p]) => p[k]).map(([d, p]) => `${d} ${p[k]}`).join(", ");
const ex = (R, k) => (R.examples[k] || []).join("\n");
const zero = (k, what) => test(`${k}: ${what} (target 0)`, async () => {
  const { R } = await run();
  assert.equal(R.totals[k] || 0, 0, `${k} ${R.totals[k]} — ${table(R, k)}\n${ex(R, k)}`);
});
const zeroRp = (k, what) => test(`${k} report: ${what} (target 0)`, async () => {
  const { RP } = await run();
  assert.deepEqual(RP[k], [], `${RP[k].length}\n${RP[k].slice(0, 20).join("\n")}`);
});

test("the fixed set: 120 fresh5 inputs, gentle and straight", async () => {
  const { C } = await run();
  assert.equal(C.length, 240);
  assert.equal(C.filter(x => x.straight).length, 120);
});
zero("V1", "no Thai group starts with a predicate that has no subject (R1)");
zeroRp("V1", "no Thai report section starts with a predicate that has no subject");
zero("V2", "no partly stripped hedge (\"ไทย ฝัน…\") and no \"ลงมือ ๆ\" (R1)");
zeroRp("V2", "no partly stripped hedge and no \"ลงมือ ๆ\"");
zero("V3", "no back-reference to a source that is not named earlier in its group (R1)");
zero("V4", "horoscope and bazi: every topic group names a finding (R1)");
zeroRp("V4", "deep-dive: every run of paragraphs names its system or a finding of it");
zeroRp("V5", "the report shows month names, never a bare month number (R2)");
zero("V6", "siam si: no meaning verb over the verse image (R3)");
test("V7: overview first sentence opens with a stock source lead in <= 15 % of EN and ZH readings", async () => {
  const { R } = await run();
  for (const L of ["en", "zh"]) assert.ok(R.shares[L] <= 0.15, `${L} ${(100 * R.shares[L]).toFixed(1)} % — ${table(R, "V7" + L)}\n${ex(R, "V7" + L)}`);
});
zero("V7multi", "no EN / ZH overview has more than one sentence that opens with a stock source lead");
zeroRp("V8", "Thai report: at most one closing line per part, and the same closing line once per report");
