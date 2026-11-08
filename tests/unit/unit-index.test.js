"use strict";
// node --test tests/unit — tests/unit/index.js (the entry `node --test tests/unit` resolves to) must load EVERY
// *.test.js in this folder. Runs index.js with a recording require, so no test file is executed twice here.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("tests/unit/index.js discovers every *.test.js (none can be forgotten)", () => {
  const src = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const loaded = [];
  const fakeRequire = id => (id === "node:fs" || id === "fs" ? fs : id === "node:path" || id === "path" ? path : (loaded.push(path.basename(id)), {}));
  vm.runInNewContext(src, { require: fakeRequire, __dirname, module: { exports: {} }, exports: {} });
  const expected = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort();
  assert.ok(expected.length >= 50, "found " + expected.length);
  assert.deepEqual(loaded.slice().sort(), expected);
  assert.ok(loaded.includes("unit-index.test.js") && loaded.includes("interview.test.js") && loaded.includes("teamface.test.js"));
  assert.ok(!/require\("\.\/[\w-]+\.test\.js"\)/.test(src), "no hand-maintained list");
});

// Test files are named after the feature they cover, not the agent round that added them (round history lives in
// CHANGELOG.md). Round-named files still waiting to be folded into a feature suite are listed here; the list may only
// shrink — rename a file (keeping every test) and delete its entry.
const ROUND_NAMED_PENDING = new Set([
  // round 12: backend-billing-r10 -> backend-billing-receipts, backend-r11 -> backend-fulfilment-refunds,
  // camera-r11 -> camera-liveness-wipe, stats-r10 -> stats-tails-forecast, stats-r11 -> stats-typeone-sequential,
  // studio-r11 -> studio-suitability-leftovers (every test kept). Still pending: commercial-r11 (edited this round).
  "commercial-r11.test.js"
]);
test("unit test files are feature-named: no new *-rN.test.js / round-N file", () => {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js"));
  const round = files.filter(f => /(?:^|-)r\d+(?:-|\.test\.js$)|round-?\d/i.test(f));
  assert.deepEqual(round.filter(f => !ROUND_NAMED_PENDING.has(f)), [], "name the file after its feature (e.g. fortune-grounding.test.js)");
  assert.ok(ROUND_NAMED_PENDING.size <= 1, "the pending list only shrinks");
  for (const f of ROUND_NAMED_PENDING) if (!files.includes(f)) assert.fail(`${f} was renamed: delete it from ROUND_NAMED_PENDING`);
});
