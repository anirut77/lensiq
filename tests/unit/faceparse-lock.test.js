"use strict";
// tests/unit/faceparse-lock.test.js — ?faceparse=1 (BiSeNet, CelebAMask-HQ weights, non-commercial) works only on a
// research-demo device: LENSIQ_PROFILE "demo" and LENSIQ_RESEARCH.on, as lensiq-config.js computes them. A customer
// lock (LENSIQ_RESEARCH_DEMO = false) or the default customer mode refuses it. (stale-docs review finding 7)
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");
const HQ = require("../../photobooth-hq.js");
const CFG = readFileSync(join(ROOT, "lensiq-config.js"), "utf8");

/** window after lensiq-config.js with an operator prefix, a stored toggle and a query string */
function win({ pre = "", store = {}, search = "" } = {}) {
  const window = {};
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem() {} };
  vm.runInNewContext(pre + CFG, { window, localStorage, location: { pathname: "/studio.html", search } }, { timeout: 1000 });
  window.location = { search };
  return window;
}

test("faceparseAllowed: ?faceparse=1 only with the research demo on", () => {
  const q = "?faceparse=1";
  assert.equal(HQ.faceparseAllowed(win({ search: q })), false, "default customer mode");
  assert.equal(HQ.faceparseAllowed(win({ search: q, store: { "lq-research-demo": "on" } })), true, "research demo switched on");
  assert.equal(HQ.faceparseAllowed(win({ search: "", store: { "lq-research-demo": "on" } })), false, "demo but no opt-in");
  assert.equal(HQ.faceparseAllowed(win({ search: q, pre: 'window.LENSIQ_PROFILE = "demo";\n' })), true, "operator demo unit");
  for (const pre of ["window.LENSIQ_RESEARCH_DEMO = false;\n", 'window.LENSIQ_PROFILE = "commercial";\n']) {
    assert.equal(HQ.faceparseAllowed(win({ search: q, pre, store: { "lq-research-demo": "on" } })), false, "customer lock: " + pre);
  }
  // hand-made globals: the query alone is never enough
  assert.equal(HQ.faceparseAllowed({ location: { search: q } }), false);
  assert.equal(HQ.faceparseAllowed({ LENSIQ_PROFILE: "demo", LENSIQ_RESEARCH: { on: false }, location: { search: q } }), false);
  assert.equal(HQ.faceparseAllowed(null), false);
});

test("studio.js and photobooth-hq.js read ?faceparse only through faceparseAllowed", () => {
  for (const f of ["studio.js", "photobooth-hq.js"]) {
    const src = readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    const raw = (src.match(/faceparse=1/g) || []).length;
    assert.equal(raw, f === "photobooth-hq.js" ? 1 : 0, f + ": the query is tested in one place only");
  }
  assert.match(readFileSync(join(ROOT, "studio.js"), "utf8"), /\(self\)\.PBHQ;[^\n]*hq\.faceparseAllowed\(self\)/);
  assert.match(readFileSync(join(ROOT, "photobooth-hq.js"), "utf8"), /if \(!faceparseAllowed\(self\)\) throw new Error\("faceparse disabled"\)/);
});
