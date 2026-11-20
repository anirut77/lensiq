"use strict";
// tests/unit/palm-v3-switch.test.js — FIXED TEST SET "palm-v3-lines" relock5 (owner decision 185 ข, condition 2, 2026-11-20). relock5: the
// relock4 C5 tool rule ("a tool that names lensiq-config.js and writes files") flagged four existing build tools that never touch
// the v3 flags; it is replaced by a stricter check of the real customer bundle (tools/build-site.mjs --customer). Nothing loosened.
// The v3 line finder stays OFF in every customer / commercial build until it is measured on real pilot hands, on the locked split,
// with at most 5 % false lines per line (D-P8), and no synthetic result can switch it on.
// C1  shipped default: LENSIQ_PALM_V3_LINES is false.
// C2  a customer / commercial build (no profile set = commercial; LENSIQ_PROFILE "commercial"; LENSIQ_RESEARCH_DEMO false): the switch
//     stays false even when an installer sets LENSIQ_PALM_V3_LINES = true.
// C3  only the demo / development profile honours LENSIQ_PALM_V3_LINES = true.
// C4  the field gate LENSIQ_PALM_V3_FIELD_OK is false in the repo and cannot be pre-set from outside (lensiq-config.js always
//     writes false): flipping it needs a source change, i.e. a new owner decision after the D-P8 field measurement.
// C5  no other file writes LENSIQ_PALM_V3_LINES or LENSIQ_PALM_V3_FIELD_OK (no test, tool or finder result can turn v3 on), and the
//     customer bundle that tools/build-site.mjs --customer writes keeps v3 off even when the page pre-sets v3 and the demo profile.
// C6  the withdrawn shadow-band retake message (owner decision 185 item 4) is shipped nowhere (TH / EN / ZH drafts).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "lensiq-config.js"), "utf8");

function run(pre) {
  const w = Object.assign({}, pre || {});
  w.window = w;
  vm.runInNewContext(SRC, { window: w, document: undefined, location: { pathname: "/palm.html", search: "" }, navigator: { userAgent: "node" } });
  return w;
}

test("C1-C3 v3 switch: off by default and in every customer / commercial build; only the demo profile honours it", () => {
  assert.equal(run().LENSIQ_PALM_V3_LINES, false, "shipped default");
  assert.equal(run({ LENSIQ_PALM_V3_LINES: true }).LENSIQ_PALM_V3_LINES, false, "no profile set = commercial");
  assert.equal(run({ LENSIQ_PALM_V3_LINES: true, LENSIQ_PROFILE: "commercial" }).LENSIQ_PALM_V3_LINES, false, "commercial profile");
  assert.equal(run({ LENSIQ_PALM_V3_LINES: true, LENSIQ_PROFILE: "demo", LENSIQ_RESEARCH_DEMO: false }).LENSIQ_PALM_V3_LINES, false, "operator lock");
  assert.equal(run({ LENSIQ_PALM_V3_LINES: "true", LENSIQ_PROFILE: "demo" }).LENSIQ_PALM_V3_LINES, false, "only exactly true");
  assert.equal(run({ LENSIQ_PALM_V3_LINES: true, LENSIQ_PROFILE: "demo" }).LENSIQ_PALM_V3_LINES, true, "demo profile, switch on");
});

test("C4 the field gate is false in the repo and cannot be pre-set from outside", () => {
  for (const pre of [{}, { LENSIQ_PALM_V3_FIELD_OK: true }, { LENSIQ_PALM_V3_FIELD_OK: true, LENSIQ_PALM_V3_LINES: true }]) {
    const w = run(pre);
    assert.equal(w.LENSIQ_PALM_V3_FIELD_OK, false, "field gate " + JSON.stringify(pre));
    assert.equal(w.LENSIQ_PALM_V3_LINES, false, "v3 in a commercial build with a pre-set field gate " + JSON.stringify(pre));
  }
});

/** every shipped / tool source file (not tests, vendor, node_modules, backend) */
function sources() {
  const out = [], skip = new Set(["node_modules", "vendor", "tests", ".git", "backend", "deploy", "share", "art", "types"]);
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name) || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs|html)$/.test(e.name)) out.push(p);
    }
  })(ROOT);
  return out;
}

test("C5 nothing but lensiq-config.js writes the v3 switch or the field gate; the customer bundle keeps v3 off", async () => {
  const bad = [];
  for (const f of sources()) {
    const rel = path.relative(ROOT, f), t = fs.readFileSync(f, "utf8");
    if (rel === "lensiq-config.js") continue;
    if (/LENSIQ_PALM_V3_(LINES|FIELD_OK)\s*=(?!=)/.test(t)) bad.push(`${rel} assigns the v3 switch / field gate`);
    if (/LENSIQ_PALM_V3_FIELD_OK/.test(t)) bad.push(`${rel} reads the field gate`);
  }
  assert.deepEqual(bad, []);
  const B = await import(require("node:url").pathToFileURL(path.join(ROOT, "tools", "build-site.mjs")).href);
  const bundle = B.lockCustomerConfig(SRC);
  for (const pre of [{}, { LENSIQ_PALM_V3_LINES: true }, { LENSIQ_PALM_V3_LINES: true, LENSIQ_PROFILE: "demo" }, { LENSIQ_PALM_V3_LINES: true, LENSIQ_PALM_V3_FIELD_OK: true }]) {
    const w = Object.assign({}, pre); w.window = w;
    vm.runInNewContext(bundle, { window: w, document: undefined, location: { pathname: "/palm.html", search: "" }, navigator: { userAgent: "node" } });
    assert.equal(w.LENSIQ_PALM_V3_LINES, false, "customer bundle " + JSON.stringify(pre));
  }
});

test("C6 the withdrawn shadow-band retake message is shipped nowhere", () => {
  const texts = ["มีเงาพาดฝ่ามือ", "A shadow falls across your palm", "手掌上有一道阴影"], bad = [];
  for (const f of sources()) { const t = fs.readFileSync(f, "utf8"); for (const s of texts) if (t.includes(s)) bad.push(`${path.relative(ROOT, f)}: "${s}"`); }
  assert.deepEqual(bad, []);
});
