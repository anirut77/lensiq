"use strict";
// tests/unit/fortune-calm-pages.test.js — FIXED TEST SET, crisis fix 4b (coordinator order 2026-11-13), locked BEFORE the change.
// The fortune hub, the planner and the lucky-colour mirror read the tab's calm flag: they load fortune-crisis.js (the reader of
// sessionStorage "lq-fortune-calm") before their own page scripts, at the same ?v= as the other fortune pages. Their lucky,
// remedy and paid blocks are marked so the calm styles can hide them: luckycolor's goal picker, recommendation, result and week
// table; the planner's lucky-colour chip; the hub's marketing / promotion block.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const ver = (html, f) => { const m = new RegExp('src="' + f.replace(/\./g, "\\.") + '\\?v=(\\d+)"').exec(html); return m ? m[1] : null; };

test("hub, planner and luckycolor load fortune-crisis.js before their page scripts, same version as tarot", () => {
  const want = ver(read("tarot.html"), "fortune-crisis.js");
  assert.ok(want, "tarot loads fortune-crisis.js");
  const first = { fortune: "lensiq-config.js", planner: "planner.js", luckycolor: "luckycolor.js" };
  for (const p of ["fortune", "planner", "luckycolor"]) {
    const html = read(p + ".html");
    assert.equal(ver(html, "fortune-crisis.js"), want, p + ": fortune-crisis.js?v=" + want);
    if (p !== "fortune") assert.ok(html.indexOf("fortune-crisis.js") < html.indexOf('src="' + first[p]), p + ": the reader loads before " + first[p]);
  }
});

/** the opening tag of the element with this id, or of the first element with this class */
const openTag = (html, sel) => { const m = sel[0] === "#" ? new RegExp("<\\w+[^>]*\\bid=\"" + sel.slice(1) + "\"[^>]*>").exec(html)
  : new RegExp("<\\w+[^>]*\\bclass=\"[^\"]*\\b" + sel.slice(1) + "\\b[^\"]*\"[^>]*>").exec(html); return m ? m[0] : ""; };

test("lucky, remedy and paid blocks are marked for the calm styles", () => {
  const lc = read("luckycolor.html");
  for (const sel of [".lc-opts", ".lc-grid", "#week"]) {
    const t = openTag(lc, sel);
    assert.ok(t, "luckycolor " + sel + " exists");
    assert.match(t, /data-lq-remedy/, "luckycolor " + sel + " marked: " + t);
  }
  assert.match(openTag(read("fortune.html"), ".ft-use"), /data-lq-(?:remedy|upsell)/, "hub promotion block marked");
  assert.match(read("planner.js"), /pl-chip[^"']*["'][^>]*data-lq-remedy[\s\S]{0,200}pl\.luckyColour/, "planner lucky-colour chip marked");
});
