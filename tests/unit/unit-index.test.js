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
