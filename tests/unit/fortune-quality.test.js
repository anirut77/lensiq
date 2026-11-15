"use strict";
// tests/unit/fortune-quality.test.js — FIXED TEST SET, fortune reading quality (owner order 2026-11-16: "an independent reviewer reads
// the rewritten Thai readings on all 18 pages for natural language, clear main point and grouping; fix weak pages; check English and
// Chinese match"). Findings: ~/LENSIQ-field/review/fortune-quality-2026-11-16/REPORT.md. Written and locked (evals-locks/
// fortune-quality.sha256, ~/LENSIQ-field/evals/fortune-quality/) BEFORE any product change on branch fortune-quality.
// Metrics and inputs: tools/fortune-quality-metrics.mjs (the reviewer's 75 inputs + 150 fresh synthetic inputs, TH / EN / ZH,
// gentle and straight). Table: node tools/fortune-quality-measure.mjs. Accuracy source: synthetic (engine-built facts).
//   R1  the overview's visible start names a finding and carries the stated main point
//   R2  no visible group start is only a stock lead-in
//   R3  TH cuts never after ๆ / number|unit / inside a list / after a lead + noun; EN / ZH visible parts end at a sentence end
//   R4  no frame over the wrong meaning type (the reviewer's examples + a generic check of every filled frame)
//   R5  no sleep / screen / study / "what is this teaching me" remedy under love or personality
//   P   the same groups in the same order in TH / EN / ZH, and the same main finding in the overview
//   H   hard limits hold on every output (gentle and straight), W1 no investment line, W2 no promised result
//   L   the reviewer's weak lines (composer, report page, hub, planner, lucky colour)
//   K   paid content stays compatible: section ids, layout headings and the group markup keys are unchanged
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const metrics = () => import(path.join(ROOT, "tools", "fortune-quality-metrics.mjs"));
let RUN = null;
async function run() {
  if (RUN) return RUN;
  const M = await metrics();
  const C = await M.corpus();
  RUN = { M, C, R: await M.measure(C) };
  return RUN;
}
const table = (R, k) => Object.entries(R.per).filter(([, p]) => p[k]).map(([d, p]) => `${d} ${p[k]}`).join(", ");
const ex = (R, k) => (R.examples[k] || []).slice(0, 12).join("\n");
const zero = (k, what) => test(`${k}: ${what} (target 0)`, async () => {
  const { R } = await run();
  assert.equal(R.totals[k] || 0, 0, `${k} ${R.totals[k]} — ${table(R, k)}\n${ex(R, k)}`);
});

test("the fixed set: 225 inputs (75 reviewer + 150 fresh), 15 domains, every gentle output carries the frame trace", async () => {
  const { C } = await run();
  assert.equal(C.length, 225);
  assert.equal(C.filter(r => r.set === "reviewer").length, 75);
  assert.equal(new Set(C.map(r => r.d)).size, 15);
  for (const r of C) for (const L of ["th", "en", "zh"]) {
    assert.equal(r.g[L].mode, "gentle", `${r.d}#${r.i} ${L}: gentle by default`);
    assert.ok(Array.isArray(r.g[L]._frames), `${r.set}:${r.d}#${r.i} ${L}: compose(..., { trace: true })._frames (filled frames) missing`);
  }
});
zero("R1", "the overview's visible start names a finding and holds the stated main point");
zero("R2", "no visible group start is only a stock lead-in");
zero("R3th", "Thai visible parts never end at a bad cut");
zero("R3en", "English visible parts end at a sentence end");
zero("R3zh", "Chinese visible parts end at a sentence end");
zero("R4", "no frame over the wrong meaning type (the reviewer's examples)");
zero("R4gen", "no frame expecting an action wraps a noun / adjective / trait; no ว่า-frame wraps a bare request");
zero("R5", "no sleep / screen / study / reflection remedy under love or personality");
zero("parity", "the same groups in the same order in TH, EN and ZH");
zero("main", "the overview names the same main finding in TH, EN and ZH");
zero("H", "hard limits, the safety filter of the mode, W1 and W2 on every output");
zero("L", "the reviewer's weak lines in composed readings");

test("L: the reviewer's weak lines on the hub, planner and lucky colour pages", async () => {
  const { M } = await run();
  assert.deepEqual(M.staticIssues(), []);
});
test("L: the report page (TH / EN / ZH): no remedy twice, nothing 'you asked', a gloss for ภูมิกาลกิณี, the same section count", async () => {
  const { M } = await run();
  const rp = M.reportIssues();
  assert.deepEqual(rp.issues, [], rp.issues.slice(0, 20).join("\n"));
});
test("K: paid content stays compatible (section ids, layout headings, group markup)", () => {
  const FA = require(path.join(ROOT, "fortune-ai.js")), RD = require(path.join(ROOT, "fortune-read.js"));
  assert.deepEqual(FA.SECTION_IDS, ["overview", "personality", "work", "money", "love", "social", "timing", "advice"]);
  for (const L of ["th", "en", "zh"]) assert.deepEqual(Object.keys(RD.HEADINGS[L]),
    ["overview", "personality", "work", "money", "love", "social", "timing", "health", "advice", "brief"], L);
  const src = require("node:fs").readFileSync(path.join(ROOT, "fortune-ai.js"), "utf8");
  assert.match(src, /fa-section/); assert.match(src, /data-section/);
});
