// tests/unit/gate-det-eval.test.js — tools/plate-det-eval.mjs argument parsing and the summary table (the browser run itself
// is covered by tests/e2e/gate-detect.e2e.mjs).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const P = require("../../lensiq-plate.js");

const load = () => import(path.join(__dirname, "..", "..", "tools", "plate-det-eval.mjs"));

test("plate-det-eval: arguments (defaults = as shipped, auto model), validation", async () => {
  const T = await load();
  assert.deepEqual(T.parseArgs([]), { json: false, model: "auto", baseline: false, ocr: 0, seed: null, perCat: null, images: null, gt: null });
  const a = T.parseArgs(["--seed", "7", "--per-cat", "5", "--ocr", "all", "--model-always", "--json"]);
  assert.equal(a.seed, 7); assert.equal(a.perCat, 5); assert.equal(a.ocr, 1e9); assert.equal(a.model, true); assert.equal(a.json, true);
  assert.equal(T.parseArgs(["--no-model"]).model, false);
  assert.deepEqual([T.parseArgs(["--baseline"]).baseline, T.parseArgs(["--baseline"]).model], [true, false]);
  assert.throws(() => T.parseArgs(["--images", "dir"]), /go together/);
  assert.throws(() => T.parseArgs(["--seed"]), /needs a value/);
  assert.throws(() => T.parseArgs(["--seed", "-1"]), /positive/);
  assert.throws(() => T.parseArgs(["--what"]), /unknown/);
});

test("plate-det-eval: summary table shows per-category detection, CI, reads, false triggers and the 90 % target", async () => {
  const T = await load();
  const t = { x: 0.4, y: 0.5, w: 0.2, h: 0.1 };
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => ({ cat: "green", truth: t, boxes: [{ ...t, score: 0.9 }], key: "กข1", read: i < 15 ? "กข1" : "", ms: 20 })),
    ...Array.from({ length: 20 }, (_, i) => ({ cat: "none", truth: null, boxes: i < 1 ? [{ ...t, score: 0.5 }] : [] }))
  ];
  const out = T.formatSummary(P.detEval(rows));
  assert.match(out, /green\s+20\s+20\/20 100\.0%\s+83\.9–100\.0%/);
  assert.match(out, /15\/20 75\.0%/);
  assert.match(out, /met/);
  assert.match(out, /none\s+20 .*1\/20 \(5\.0%\)/);
});
