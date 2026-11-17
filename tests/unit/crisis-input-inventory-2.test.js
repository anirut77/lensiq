// tests/unit/crisis-input-inventory-2.test.js — FIXED TEST SET "crisis-net-hotfix" ROUND 2 (locked 2026-11-17 before the round-2 fix).
// Owner order 2026-11-16 (c): every free-text input on a fortune page is covered. The round-1 test
// (crisis-input-inventory.test.js) scans each page's HTML and the scripts the page loads with a <script> tag; it does not see
// scripts that nav.js injects (lensiq-report.js: the "Report a problem with this reading" dialog has a free-text note and an
// editable preview; review of 5061f53). This test scans every script nav.js injects on fortune pages and fails when one of
// them creates a free-text field (textarea, or input with no type / text / search / tel / email / url) without a phrase row
// in tests/e2e/crisis-net-hotfix-inventory.json naming that script in "dynamic" and a covering test in "covered_by", or when
// that row is missing from docs/CRISIS-INPUT-INVENTORY.md.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const INV = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/e2e/crisis-net-hotfix-inventory.json"), "utf8"));
const DOC = fs.readFileSync(path.join(ROOT, "docs/CRISIS-INPUT-INVENTORY.md"), "utf8");
const FREE = /^(?:text|search|tel|email|url|textarea)$/;

/** script files nav.js injects (every "<name>.js?v=" string literal in nav.js) */
function injected() {
  const nav = fs.readFileSync(path.join(ROOT, "nav.js"), "utf8");
  return [...new Set([...nav.matchAll(/["']([\w-]+\.js)\?v=\d+["']/g)].map(m => m[1]))].filter(f => fs.existsSync(path.join(ROOT, f)));
}
/** free-text fields a script creates: createElement("textarea"), or createElement("input") whose type (set anywhere in the
 *  statement chain on the same variable) is free-text or never set */
function created(src) {
  const out = [];
  for (const m of src.matchAll(/(?:var|let|const)?\s*([\w$]+)\s*=\s*[\w$.]*createElement\(\s*["'](input|textarea)["']\s*\)/g)) {
    const v = m[1];
    if (m[2] === "textarea") { out.push({ v, type: "textarea" }); continue; }
    const rest = src.slice(m.index, m.index + 400);
    const t = (rest.match(new RegExp("\\b" + v.replace(/\$/g, "\\$") + "\\.type\\s*=\\s*[\"'](\\w+)[\"']")) || [])[1] || "text";
    if (FREE.test(t)) out.push({ v, type: t });
  }
  return out;
}

test("nav.js injects lensiq-report.js on fortune pages (the scan below sees it)", () => {
  assert.ok(injected().includes("lensiq-report.js"), injected().join(", "));
});

test("every free-text field created by a script nav.js injects has a covered phrase row (dynamic names the script)", () => {
  const miss = [];
  for (const f of injected()) {
    const fields = created(fs.readFileSync(path.join(ROOT, f), "utf8"));
    if (!fields.length) continue;
    const rows = INV.inputs.filter(r => r.phrase && r.dynamic && r.dynamic.includes(f));
    if (!rows.length) miss.push(f + ": " + fields.map(x => x.type + " " + x.v).join(", ") + " (no phrase row)");
    for (const r of rows) {
      if (!r.covered_by) miss.push(f + " " + r.sel + ": no covered_by");
      if (!DOC.includes("`" + r.sel + "`")) miss.push(f + " " + r.sel + ": not in docs/CRISIS-INPUT-INVENTORY.md");
    }
  }
  assert.deepEqual(miss, []);
});

test("the report dialog's note and preview are listed (lensiq-report.js creates 2 textareas)", () => {
  const src = fs.readFileSync(path.join(ROOT, "lensiq-report.js"), "utf8");
  assert.equal(created(src).filter(x => x.type === "textarea").length, 2);
  const row = INV.inputs.find(r => r.phrase && r.dynamic && r.dynamic.includes("lensiq-report.js"));
  assert.ok(row && /crisis-net-hotfix-e\.e2e\.mjs/.test(row.covered_by || ""), "row covered by the locked e2e E4");
});
