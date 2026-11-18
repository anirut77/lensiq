"use strict";
// tests/unit/line-wrap-crisis-skip.test.js — FIXED TEST (line-wrap, independent review 2026-11-17, required fix): the line-wrap
// wrapper in nav.js (thaiBreaks: glue / rebuild / fix / run) never touches crisis help nodes. Those are the top-bar 1323 link
// (#lqHelpTop), its confirmation dialog (.lq-help-dlg), the reading's help line and closing line (.lq-helpline, built by
// fortune-read.js), every call link (.lq-call-btn, [data-lq-call]), the crisis card slot (.lq-crisis-slot) and the support
// boxes the crisis takeover keeps on screen (.fa-support, .fa-soft). Locked in evals-locks/line-wrap.sha256 (relock-7, new file).
//   S1  nav.js has one crisis selector list (CR) and it names every one of those selectors
//   S2  every selector the crisis takeover keeps on screen (KEEP in lensiq-crisis-takeover.js, minus plain tags) is in CR
//   S3  every class the fortune help line / closing line markup uses (fortune-read.js helpHTML) is covered by CR
//   S4  CR is part of SKIP, and every entry point of the wrapper checks SKIP before it changes anything: the text-node filter,
//       the Thai fix, the glue pass and run(); the glue pass also drops a neighbour element that is or holds a crisis node
//       (so a number / closing-mark join never pulls the 1323 link into a piece and never adds lq-w to it)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const nav = read("nav.js");
const body = (() => { const i = nav.indexOf("function thaiBreaks()"); assert.ok(i > 0, "thaiBreaks() in nav.js"); return nav.slice(i); })();
const CRm = /var CR = "([^"]+)";/.exec(body);
const CR = CRm ? CRm[1].split(",").map(s => s.trim()) : [];

test("S1: nav.js names every crisis help selector in one list (CR)", () => {
  assert.ok(CRm, "var CR = \"...\" in thaiBreaks()");
  for (const s of [".lq-helpline", "[data-lq-call]", "#lqHelpTop", ".lq-help-dlg", ".lq-crisis-slot", ".fa-support", ".fa-soft", ".lq-call-btn"])
    assert.ok(CR.includes(s), "CR includes " + s);
});

test("S2: every selector the crisis takeover keeps on screen is skipped by the wrapper", () => {
  const src = read("lensiq-crisis-takeover.js");
  const m = /const KEEP = "([^"]+)"/.exec(src);
  assert.ok(m, "KEEP in lensiq-crisis-takeover.js");
  const keep = m[1].split(",").map(s => s.trim()).filter(s => /^[.#[]/.test(s));
  assert.ok(keep.length >= 4, "KEEP has its help selectors");
  for (const s of keep) assert.ok(CR.includes(s), "CR includes the takeover's " + s);
});

test("S3: the fortune help line / closing line markup is covered", () => {
  const src = read("fortune-read.js");
  const m = /const helpHTML = [\s\S]*?<\/aside>/.exec(src);
  assert.ok(m, "helpHTML in fortune-read.js");
  assert.match(m[0], /class="lq-helpline/, "the aside carries .lq-helpline");
  assert.ok(CR.includes(".lq-helpline"), "its root is skipped, so everything inside it is skipped too");
  assert.match(m[0], /class="lq-call-btn"/);
  assert.ok(CR.includes(".lq-call-btn"));
});

test("S4: SKIP holds CR and every entry point checks it; neighbours holding a crisis node are dropped", () => {
  assert.match(body, /var SKIP = "[^"]*" \+ CR;/, "SKIP = ... + CR");
  assert.match(body, /!p\.closest\(SKIP\)\) out\.push\(n\)/, "text-node filter checks SKIP");
  assert.match(body, /el\.closest\(SKIP\)\) return;/, "the Thai fix checks SKIP");
  assert.match(body, /p\.closest\(SKIP \+ ",#siteNav,\.lq-crumbs"\)\) return;\s*x = sk\(x\); y = sk\(y\);/, "glue checks SKIP, then drops crisis neighbours");
  assert.match(body, /root\.closest\(SKIP\) \|\| !document\.body\.contains\(root\)\) return;/, "run() checks SKIP");
  assert.match(body, /var sk = function \([^)]*\) \{ return e && e\.nodeType === 1 && \(e\.matches\(CR\) \|\| e\.querySelector\(CR\)\) \? null : e; \};/,
    "sk() drops an element that is or holds a crisis node");
  // every place that creates a piece or adds lq-w sits inside thaiBreaks (no second wrapper elsewhere in nav.js)
  const head = nav.slice(0, nav.indexOf("function thaiBreaks()"));
  assert.doesNotMatch(head, /createElement\("lq-t"\)|classList\.add\("lq-w"\)/, "no wrapper code outside thaiBreaks()");
});
