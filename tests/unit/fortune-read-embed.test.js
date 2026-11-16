"use strict";
// tests/unit/fortune-read-embed.test.js — delivery guard for the reading layout's single-source parts (2026-11-15).
// fortune-notice.js (notice part) and fortune-restrain.js (restrain tags, tests/unit/fortune-layout-caution.test.js re-lock 3)
// are the single sources. The 15 reading pages get both inside fortune-read.js, because each separate script costs one request
// and the speed budget (tests/e2e/speed-budget.e2e.mjs) has none left on horoscope.html, numbers.html and report.html once
// every page loads lensiq-busy.js. tools/fortune-read-embed.mjs copies the files between markers; this test fails when a copy
// drifts, when a reading page loads a part a second time, or when the browser copy does not define the same API.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const PARTS = ["fortune-notice.js", "fortune-restrain.js", "fortune-brief.js"];
const begin = f => `/* BEGIN ${f} (copied by tools/fortune-read-embed.mjs; edit ${f}, then run it) */\n`;
const end = f => `/* END ${f} */\n`;

test("fortune-read.js carries fortune-notice.js (first) and fortune-restrain.js byte-for-byte between markers", () => {
  const rd = read("fortune-read.js");
  for (const f of PARTS) {
    const i = rd.indexOf(begin(f)), j = rd.indexOf(end(f));
    assert.ok(i >= 0 && j > i, f + ": markers present");
    assert.equal(rd.slice(i + begin(f).length, j), read(f), f + ": copy equals source");
    assert.equal(rd.indexOf(begin(f), i + 1), -1, f + ": one copy only");
  }
  assert.equal(rd.indexOf(begin("fortune-notice.js")), 0, "the notice part comes first (the layout uses it while loading)");
});

test("in a page, fortune-read.js alone defines the notice, the layout and the tags; in Node it still exports the layout", () => {
  const win = /** @type {any} */ ({});
  win.window = win;
  vm.runInNewContext(read("fortune-read.js"), win);
  assert.ok(win.LQNotice && typeof win.LQNotice.noticeify === "function", "notice API");
  assert.ok(win.LQRead && typeof win.LQRead.planSection === "function", "layout API");
  const RS = require(path.join(ROOT, "fortune-restrain.js"));
  assert.ok(win.LQFortuneRestrain, "LQFortuneRestrain defined");
  for (const d of Object.keys(RS.TAGS)) assert.equal(win.LQFortuneRestrain.count(d), RS.count(d), d);
  assert.equal(typeof win.LQFortuneBrief, "function", "LQFortuneBrief defined (fortune-brief.js copy)");
  const RD = require(path.join(ROOT, "fortune-read.js"));
  assert.equal(typeof RD.planSection, "function", "Node exports stay the layout's");
  assert.equal(RD.count, undefined, "the restrain copy does not replace fortune-read.js exports");
});

test("reading pages load neither part separately; every page with fortune-ai.js loads fortune-read.js before it", () => {
  for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith(".html"))) {
    const h = read(f);
    assert.ok(!/src="fortune-restrain\.js/.test(h), f + ": separate fortune-restrain.js");
    assert.ok(!/src="fortune-brief\.js/.test(h), f + ": separate fortune-brief.js");
    if (/src="fortune-read\.js/.test(h)) assert.ok(!/src="fortune-notice\.js/.test(h), f + ": fortune-notice.js loaded twice");
    const ai = h.indexOf('src="fortune-ai.js'), rd = h.indexOf('src="fortune-read.js');
    if (ai >= 0) assert.ok(rd >= 0 && rd < ai, f + ": fortune-read.js before fortune-ai.js");
  }
});
