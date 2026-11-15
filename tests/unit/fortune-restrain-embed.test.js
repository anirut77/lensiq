"use strict";
// tests/unit/fortune-restrain-embed.test.js — delivery guard for the restrain tags (2026-11-15).
// fortune-restrain.js is the single source of the data tags (tests/unit/fortune-layout-caution.test.js, re-lock 3). The 15
// reading pages get it inside fortune-read.js, which they already load, because a separate script costs one request and the
// speed budget (tests/e2e/speed-budget.e2e.mjs) has none left on numbers.html and report.html. tools/restrain-embed.mjs copies
// the file between two markers; this test fails when the copy drifts, when a page loads the file a second time, or when the
// browser copy does not define the same tags.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const BEGIN = "/* BEGIN fortune-restrain.js (copied by tools/restrain-embed.mjs; edit fortune-restrain.js, then run it) */\n";
const END = "/* END fortune-restrain.js */\n";

test("fortune-read.js carries fortune-restrain.js byte-for-byte between the markers", () => {
  const rd = read("fortune-read.js"), i = rd.indexOf(BEGIN), j = rd.indexOf(END);
  assert.ok(i >= 0 && j > i, "markers present");
  assert.equal(rd.slice(i + BEGIN.length, j), read("fortune-restrain.js"));
});

test("in a page, fortune-read.js defines the same tags and keeps its own API; in Node it still exports the layout", () => {
  const win = /** @type {any} */ ({});
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(read("fortune-notice.js"), ctx); // pages load the notice code first (fortune-read.js uses it)
  vm.runInContext(read("fortune-read.js"), ctx);
  assert.ok(win.LQRead && typeof win.LQRead.planSection === "function", "layout API");
  const RS = require(path.join(ROOT, "fortune-restrain.js"));
  assert.ok(win.LQFortuneRestrain, "LQFortuneRestrain defined");
  for (const d of Object.keys(RS.TAGS)) assert.equal(win.LQFortuneRestrain.count(d), RS.count(d), d);
  const RD = require(path.join(ROOT, "fortune-read.js"));
  assert.equal(typeof RD.planSection, "function", "Node exports stay the layout's");
  assert.equal(RD.count, undefined, "the copy does not replace fortune-read.js exports");
});

test("no page loads fortune-restrain.js separately (no extra request); every page with fortune-ai.js loads fortune-read.js before it", () => {
  for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith(".html"))) {
    const h = read(f);
    assert.ok(!/src="fortune-restrain\.js/.test(h), f + ": separate fortune-restrain.js");
    const ai = h.indexOf('src="fortune-ai.js'), rd = h.indexOf('src="fortune-read.js');
    if (ai >= 0) assert.ok(rd >= 0 && rd < ai, f + ": fortune-read.js before fortune-ai.js");
  }
});
