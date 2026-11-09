"use strict";
// tests/unit/pc-claims-eval.test.js — tools/pc-claims-eval.mjs (Product Check P3 scorer) on SYNTHETIC rows only:
// Wilson intervals, per-rule confusion counts, scope by category, false flags per 100 compliant texts, refusal of any data
// path inside the repo. No real text-set data is read here.
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const TOOL = path.join(ROOT, "tools", "pc-claims-eval.mjs");
const load = () => import(TOOL);

test("wilson: known values and edge cases", async () => {
  const { wilson } = await load();
  const [lo, hi] = wilson(8, 10);
  assert.ok(Math.abs(lo - 0.4902) < 0.001 && Math.abs(hi - 0.9433) < 0.001, `${lo} ${hi}`);
  assert.deepEqual(wilson(0, 0), [0, 1]);
  const z = wilson(0, 73);
  assert.equal(z[0], 0);
  assert.ok(z[1] < 0.05 && z[1] > 0.04);
});

test("score: per-rule TP / FP / FN, out-of-scope ids ignored, compliant false flags per 100", async () => {
  const { score } = await load();
  const s = score([
    { id: "FAKE-1", category: "supplement", expected: ["F13", "F06"], predicted: ["F13", "F02"] },
    { id: "FAKE-2", category: "supplement", expected: [], predicted: ["F10"] },
    { id: "FAKE-3", category: "food", expected: [], predicted: [] },
    { id: "FAKE-4", category: "drug", expected: ["D01"], predicted: ["D01", "C03"] }, // C03 is out of the drug scope
    { id: "FAKE-5", category: "cosmetic", expected: ["C03"], predicted: [] }
  ]);
  assert.deepEqual([s.rules.F13.tp, s.rules.F06.fn, s.rules.F02.fp, s.rules.F10.fp, s.rules.D01.tp, s.rules.C03.fn], [1, 1, 1, 1, 1, 1]);
  assert.equal(s.rules.C03.fp, 0, "out-of-scope prediction not counted");
  assert.deepEqual([s.overall.tp, s.overall.fp, s.overall.fn], [2, 2, 2]);
  assert.equal(s.families.D.precision, 1);
  assert.equal(s.compliant.texts, 2);
  assert.equal(s.compliant.flags, 1);
  assert.equal(s.compliant.per100, 50);
  assert.equal(s.compliant.textsFlagged, 1);
});

test("CLI refuses a data directory inside the repo and needs --split", () => {
  const r = spawnSync(process.execPath, [TOOL, "--split", "dev", "--data", path.join(ROOT, "tests")], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing/);
  const o = spawnSync(process.execPath, [TOOL, "--split", "dev", "--data", "/tmp/x-nonexistent", "--out", path.join(ROOT, "x.csv")], { encoding: "utf8" });
  assert.equal(o.status, 2, "output inside the repo is refused too");
  const u = spawnSync(process.execPath, [TOOL], { encoding: "utf8" });
  assert.equal(u.status, 2);
  assert.match(u.stderr, /usage/);
});

test("source label says public dataset labelled by two AI agents, pending pharmacist adjudication", async () => {
  const { SOURCE_LABEL } = await load();
  assert.equal(SOURCE_LABEL, "public dataset (labelled by two AI agents, pending pharmacist adjudication)");
});
