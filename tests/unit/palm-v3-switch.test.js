"use strict";
// tests/unit/palm-v3-switch.test.js — FIXED TEST SET "palm-v3-lines" relock6 (owner decision 185 ข, condition 2, 2026-11-20).
// relock5 replaced the relock4 tool rule (false positive on build-site / cat-pages / csp-meta / promo-meta) by the customer-bundle
// check and so DROPPED the protection "no tool rewrites lensiq-config.js". relock6 restores it in a corrected form: C5(b) below.
// The v3 line finder stays OFF in every customer / commercial build until it is measured on real pilot hands, on the locked split,
// with at most 5 % false lines per line (D-P8), and no synthetic result can switch it on.
// C1  shipped default: LENSIQ_PALM_V3_LINES is false.
// C2  a customer / commercial build (no profile set = commercial; LENSIQ_PROFILE "commercial"; LENSIQ_RESEARCH_DEMO false): the switch
//     stays false even when an installer sets LENSIQ_PALM_V3_LINES = true.
// C3  only the demo / development profile honours LENSIQ_PALM_V3_LINES = true.
// C4  the field gate LENSIQ_PALM_V3_FIELD_OK is false in the repo and cannot be pre-set from outside (lensiq-config.js always
//     writes false): flipping it needs a source change, i.e. a new owner decision after the D-P8 field measurement.
// C5  (a) no other file writes LENSIQ_PALM_V3_LINES or LENSIQ_PALM_V3_FIELD_OK (no test, tool or finder result can turn v3 on);
//     (b) no file under tools/ (or anywhere in the repo except the build output) writes to a path that resolves to the repo's
//     lensiq-config.js (a write call whose target, or the variable it names, joins the repo root / cwd with lensiq-config.js);
//     (c) the customer bundle that tools/build-site.mjs --customer writes keeps v3 off even when the page pre-sets v3 and demo.
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

/** C5(b) detector: write calls whose target resolves to the REPO's lensiq-config.js. The target argument (or, for a plain
    identifier, every `const / let / var id = ...` definition of it in the file) must name lensiq-config.js AND be either a bare
    path (relative to the repo, the working directory of every tool) or joined / resolved onto a repo-root base. A target joined
    onto any other base (an output folder such as build-site's `out`) is the build output and is allowed. */
const WRITE_RE = /\b(writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream|copyFileSync|copyFile|renameSync|rename|cpSync)\s*\(/g;
const REPO_BASE = /^(repo|REPO|ROOT|root|REPO_ROOT|ROOT_DIR|__dirname|here|process\.cwd\(\))$/;
function args(t, i) { // split the call's arguments at depth 0, starting just after "("
  const out = []; let depth = 0, cur = "", q = null;
  for (; i < t.length; i++) { const c = t[i];
    if (q) { cur += c; if (c === q && t[i - 1] !== "\\") q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; cur += c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    if (c === ")" || c === "]" || c === "}") { if (depth === 0) { out.push(cur.trim()); return out; } depth--; }
    if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += c; }
  return out;
}
function hitsRepoConfig(expr) {
  if (!/lensiq-config\.js/.test(expr)) return false;
  if (/^["'`][^"'`]*lensiq-config\.js["'`]$/.test(expr)) return !/^["'`](\.\.|\/)/.test(expr) || /^["'`]\.\/lensiq-config/.test(expr);
  const m = /^(?:path\.)?(?:join|resolve)\s*\(\s*([^,]+?)\s*,/.exec(expr);
  if (m) return REPO_BASE.test(m[1].trim());
  return true; // any other form naming lensiq-config.js is treated as a repo write (conservative)
}
function repoConfigWrites(text) {
  const hits = []; let m; WRITE_RE.lastIndex = 0;
  while ((m = WRITE_RE.exec(text))) {
    const a = args(text, m.index + m[0].length), fn = m[1], target = /^(copyFile|copyFileSync|rename|renameSync|cpSync)$/.test(fn) ? a[1] : a[0];
    if (!target) continue;
    const cands = [target];
    if (/^[A-Za-z_$][\w$]*$/.test(target)) { const d = new RegExp("\\b(?:const|let|var)\\s+" + target + "\\s*=\\s*([^;\\n]+)", "g"); let dm; while ((dm = d.exec(text))) cands.push(dm[1].trim()); }
    if (cands.some(hitsRepoConfig)) hits.push(fn + "(" + target + ")");
  }
  return hits;
}

test("C5 (a) nothing but lensiq-config.js writes the v3 switch / field gate; (b) nothing writes the repo's lensiq-config.js; (c) customer bundle keeps v3 off", async () => {
  const bad = [];
  for (const f of sources()) {
    const rel = path.relative(ROOT, f), t = fs.readFileSync(f, "utf8");
    if (rel === "lensiq-config.js") continue;
    if (/LENSIQ_PALM_V3_(LINES|FIELD_OK)\s*=(?!=)/.test(t)) bad.push(`${rel} assigns the v3 switch / field gate`);
    if (/LENSIQ_PALM_V3_FIELD_OK/.test(t)) bad.push(`${rel} reads the field gate`);
  }
  // (b) over EVERY repo script except the build output (_site, dist), dependencies and this file (it holds detector examples)
  const self = path.resolve(__filename), all = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "_site", "dist"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(js|mjs|cjs|ts)$/.test(e.name) && path.resolve(p) !== self) all.push(p);
    }
  })(ROOT);
  for (const f of all) for (const h of repoConfigWrites(fs.readFileSync(f, "utf8"))) bad.push(`${path.relative(ROOT, f)} writes the repo's lensiq-config.js: ${h}`);
  assert.deepEqual(bad, []);
  // the detector itself: flags writes onto the repo config, allows the build output
  const yes = ['writeFileSync(join(repo, "lensiq-config.js"), s)', 'const f = resolve(ROOT, "lensiq-config.js");\nwriteFileSync(f, s)', 'appendFileSync("lensiq-config.js", s)',
    'copyFileSync(src, path.join(__dirname, "..", "lensiq-config.js"))'];
  const no = ['writeFileSync(join(out, "lensiq-config.js"), s)', 'const file = join(out, "lensiq-config.js");\nwriteFileSync(file, src)', 'writeFileSync(join(repo, p), s)'];
  for (const y of yes) assert.ok(repoConfigWrites(y).length === 1, "detector missed: " + y);
  for (const n of no) assert.deepEqual(repoConfigWrites(n), [], "detector false positive: " + n);
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
