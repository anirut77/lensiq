// tests/unit/e2e-shards-base.test.js — CI e2e shard balance by whole job time (2026-11-18). Kept apart from the locked
// tests/unit/e2e-shards.test.js (evals-locks/phone-quality.sha256), which is unchanged and still passes.
const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../tools/e2e-shards.mjs");

// 2026-11-18: shard 1/3 hit the 75-min job limit (run 44124312036): the split did not count the site check that runs after the
// tests in shard 1 only, and the weights were stale local timings. The split now starts each Linux shard with its fixed CI
// steps (shard-weights.json "base") and the weights come from CI logs. Every file still lands in exactly one shard.
test("assign with base: every file in exactly one shard, balanced by whole job time, base respected", async () => {
  const m = await load();
  const files = m.allFiles(), w = m.weights();
  const base = m.baseFor(4, true);
  assert.ok(Array.isArray(base) && base.length === 3 && base.every(v => v > 0), "CI base for 3 Linux shards: " + JSON.stringify(base));
  assert.equal(m.baseFor(3, false), undefined, "no base for any other split");
  assert.equal(m.baseFor(4, false), undefined, "no base without --mac-last");
  const linux = files.filter(f => !m.isMacFile(f));
  const a = m.assign(files, w, 4, { macLast: true, base });
  const flat = a.flat();
  assert.equal(flat.length, files.length, "no file twice");
  assert.deepEqual([...flat].sort(), files, "no file missing");
  assert.equal(new Set(flat).size, flat.length, "each file in exactly one shard");
  assert.deepEqual(a.slice(0, 3), m.assign(linux, w, 3, { base }), "Linux shards = the plain split with base");
  assert.deepEqual(m.assign(files, w, 4, { macLast: true, base }), a, "same split every time");
  const t = m.load(a.slice(0, 3), w, base), biggest = Math.max(...linux.map(f => w[f] || 0));
  assert.ok(Math.max(...t) - Math.min(...t) <= biggest, "Linux shards within one file of each other, base included: " + t);
  // the largest base gets the least test time
  const tests = m.load(a.slice(0, 3), w);
  assert.ok(tests[base.indexOf(Math.max(...base))] === Math.min(...tests), "the shard with the longest fixed step gets the least test time: " + tests);
  // small cases: duplicates in the input, a file with no weight, a huge base on one shard
  const few = ["a.e2e.mjs", "b.e2e.mjs", "c.e2e.mjs", "d.e2e.mjs", "e.e2e.mjs"];
  const s = m.assign([...few, "a.e2e.mjs"], { "a.e2e.mjs": 5, "b.e2e.mjs": 4, "c.e2e.mjs": 3 }, 3, { base: [1000, 0, 0] });
  assert.deepEqual(s.flat().sort(), few, "duplicate input still lands once; unweighted files land once");
  assert.deepEqual(s[0], [], "a shard already over the others gets no file");
  assert.throws(() => m.assign(few, {}, 3, { base: [1, 2] }), /base must list 3/);
  assert.throws(() => m.assign(few, {}, 3, { base: [1, -2, 3] }), /base must list 3/);
});

test("secondsFromLogs: per-file seconds from GitHub Actions log timestamps (retries add, longest log wins)", async () => {
  const m = await load();
  const L = (t, x) => `End-to-end (headless Chrome) 1/3\tUNKNOWN STEP\t2026-11-17T17:${t}Z ${x}`;
  const one = [L("50:00.0", "LENSIQ e2e — x — 2 file(s)"), L("50:00.0", "# a.e2e.mjs"), L("50:10.0", "  ok   x (1 ms)"),
    L("50:30.0", "# b.e2e.mjs"), L("51:00.0", "# b.e2e.mjs (retry 1/1)"), L("51:30.0", ""), L("51:30.0", "2 passed, 0 failed, 0 skipped — 90.0 s"),
    L("52:00.0", "# not-counted.e2e.mjs")].join("\n");
  const two = [L("00:00.0", "# a.e2e.mjs"), L("00:45.0", "1 passed, 0 failed, 0 skipped — 45.0 s")].join("\n");
  assert.deepEqual(m.secondsFromLogs([one]), { "a.e2e.mjs": 30, "b.e2e.mjs": 60 }, "a file with no end line is not counted");
  assert.deepEqual(m.secondsFromLogs([one, two]), { "a.e2e.mjs": 45, "b.e2e.mjs": 60 });
});
