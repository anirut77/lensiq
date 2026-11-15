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

// RE-LOCK 2026-11-16 (crisis-v2-live; the locked speed budget failed on hub / luckycolor / planner with the larger crisis net): the
// reader of the tab's calm flag on these pages is nav.js (loaded right after the header, before every page script), which sets
// <html data-lq-calm> at once and fetches the crisis net (fortune-crisis.js, same version as tarot) on demand; styles.css hides the
// marked blocks from the first paint. Same intent (the flag is read before the page scripts), checked on the new reader.
test("hub, planner and luckycolor: nav.js reads the calm flag before their page scripts and fetches fortune-crisis.js (same version as tarot)", () => {
  const want = ver(read("tarot.html"), "fortune-crisis.js");
  assert.ok(want, "tarot loads fortune-crisis.js");
  const nav = read("nav.js");
  assert.match(nav, /sessionStorage\.getItem\("lq-fortune-calm"\) === "1"[\s\S]{0,120}setAttribute\("data-lq-calm", "1"\)/, "nav.js sets <html data-lq-calm> from the tab flag");
  assert.ok(nav.includes('"fortune-crisis.js?v=' + want + '"'), "nav.js fetches fortune-crisis.js?v=" + want);
  assert.match(read("styles.css"), /html\[data-lq-calm\] \[data-lq-remedy\],html\[data-lq-calm\] \[data-lq-upsell\]/, "styles.css hides the marked blocks in a calm tab");
  const first = { fortune: "lensiq-config.js", planner: "planner.js", luckycolor: "luckycolor.js" };
  for (const p of ["fortune", "planner", "luckycolor"]) {
    const html = read(p + ".html");
    assert.ok(html.indexOf('src="nav.js') >= 0 && html.indexOf('src="nav.js') < html.indexOf('src="' + first[p]), p + ": nav.js loads before " + first[p]);
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
