// tests/unit/e2e-shard-budget.test.js — the CI e2e shard split must fail FAST and PLAINLY when it can no longer be trusted,
// instead of a Linux shard silently running into the 75-min job limit (2026-11-23: shard 1/4 was cancelled at 75 min on
// main runs 45185541444 and 45226675553 while every test passed; 87 e2e files had no measured weight, so the split put too
// much on shard 1). tools/e2e-shards.mjs budgetProblems() / --budget report: (a) any Linux e2e file with no measured weight
// in tests/e2e/shard-weights.json, (b) any Linux shard whose planned seconds (its fixed CI steps + its files) exceed the
// limit. WebKit files (macOS shard, --mac-last) are not balanced and are not reported for (a).
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const load = () => import("../../tools/e2e-shards.mjs");
const TOOL = join(__dirname, "..", "..", "tools", "e2e-shards.mjs");

test("budgetProblems: no problem when every Linux file is weighted and every shard is within the limit", async () => {
  const m = await load();
  const files = ["a.e2e.mjs", "b.e2e.mjs", "c.e2e.mjs", "d.e2e.mjs", "x-webkit.e2e.mjs"];
  const sec = { "a.e2e.mjs": 100, "b.e2e.mjs": 100, "c.e2e.mjs": 100, "d.e2e.mjs": 100, "x-webkit.e2e.mjs": 50 };
  assert.deepEqual(m.budgetProblems(files, sec, 3, { macLast: true, base: [0, 0], maxSec: 200 }), []);
});

test("budgetProblems: a Linux file with no measured weight is reported by name with the refresh command; WebKit files are not", async () => {
  const m = await load();
  const files = ["a.e2e.mjs", "b.e2e.mjs", "new-one.e2e.mjs", "y-webkit.e2e.mjs"];
  const sec = { "a.e2e.mjs": 100, "b.e2e.mjs": 100 };
  const p = m.budgetProblems(files, sec, 3, { macLast: true, maxSec: 10000 });
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.match(p[0], /new-one\.e2e\.mjs/);
  assert.doesNotMatch(p[0], /y-webkit/);
  assert.match(p[0], /no measured weight/);
  assert.match(p[0], /--weights-from/);
  // zero or negative is not a measurement either
  const z = m.budgetProblems(["a.e2e.mjs", "b.e2e.mjs"], { "a.e2e.mjs": 0, "b.e2e.mjs": 5 }, 2, { maxSec: 10000 });
  assert.equal(z.length, 1);
  assert.match(z[0], /a\.e2e\.mjs/);
});

test("budgetProblems: a shard planned over the limit is reported with its number and minutes; exactly at the limit passes", async () => {
  const m = await load();
  const files = ["a.e2e.mjs", "b.e2e.mjs"];
  const sec = { "a.e2e.mjs": 3900, "b.e2e.mjs": 600 };
  assert.deepEqual(m.budgetProblems(files, sec, 2, { maxSec: 3900 }), []);
  const p = m.budgetProblems(files, sec, 2, { maxSec: 3899 });
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.match(p[0], /shard 1\/2/);
  assert.match(p[0], /65 min/);
  assert.match(p[0], /3900 s/);
  assert.match(p[0], /limit/);
});

test("budgetProblems: the fixed CI steps (base) count toward a shard's plan", async () => {
  const m = await load();
  const files = ["a.e2e.mjs", "b.e2e.mjs", "z-webkit.e2e.mjs"];
  const sec = { "a.e2e.mjs": 3000, "b.e2e.mjs": 3000, "z-webkit.e2e.mjs": 9999 };
  assert.deepEqual(m.budgetProblems(files, sec, 3, { macLast: true, base: [0, 0], maxSec: 3000 }), []);
  const p = m.budgetProblems(files, sec, 3, { macLast: true, base: [601, 0], maxSec: 3000 });
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.match(p[0], /shard 1\/3/);
  // the macOS shard is not held to the Linux limit
  assert.ok(!p.some(x => /shard 3\/3/.test(x)));
});

test("repo: every Linux e2e file has a measured weight in tests/e2e/shard-weights.json", async () => {
  const m = await load();
  const p = m.budgetProblems(m.allFiles(), m.weights(), 5, { macLast: true, base: m.baseFor(5, true), maxSec: Infinity });
  assert.deepEqual(p, []);
});

test("CLI --budget: exits 1 with a plain message over the limit, 0 within it", () => {
  let out = "", code = 0;
  try { execFileSync(process.execPath, [TOOL, "--budget", "5", "--mac-last", "--max-min=1"], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { code = e.status; out = String(e.stdout) + String(e.stderr); }
  assert.equal(code, 1);
  assert.match(out, /shard 1\/5 is planned at \d+ min/);
  assert.match(out, /FAILED/);
  const ok = execFileSync(process.execPath, [TOOL, "--budget", "5", "--mac-last", "--max-min=100000"], { encoding: "utf8" });
  assert.match(ok, /OK/);
});
