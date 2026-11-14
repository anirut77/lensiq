"use strict";
// tests/unit/walkfix-cp.test.js — walk-fix merged with consistency-pass (coordinator 2026-11-14): shared tab rule, review Low
// items. FIXED TEST: locked (~/LENSIQ-field/evals/walk-fix/, evals-locks/walk-fix.sha256) BEFORE the merge fixes.
//   1. styles.css hides nav.js's <wbr> inside the shared .tab (Chrome breaks at <wbr> even under nowrap); attendance.css no
//      longer carries its own .tab wbr rule.
//   2. insights .btn.ghost.danger:hover text / background contrast is at least 4.5:1 (AA).
//   3. every page that loads the same stylesheet loads it with the same ?v= (no stale cache number on one page), and the
//      stylesheets both branches changed carry new numbers: attendance.css >= 10, exam.css >= 4.
//   4. exam.css has one import-file overflow rule set (no duplicate input[type=file] rules).
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");

test("shared .tab hides <wbr> in styles.css; attendance.css has no own .tab wbr rule", () => {
  assert.match(read("styles.css"), /(^|[},\s])\.tab wbr\s*(,[^{]*)?\{[^}]*display:\s*none/m);
  assert.ok(!/(^|[},\s])\.tab wbr/m.test(read("attendance.css")), "attendance.css .tab wbr");
});

function lum(hex) {
  const h = hex.replace("#", ""), f = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const c = [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("insights .btn.ghost.danger:hover meets AA (>= 4.5:1)", () => {
  const css = read("insights.css");
  const m = css.match(/\.btn\.ghost\.danger:hover\s*\{([^}]*)\}/);
  assert.ok(m, "a hover rule for .btn.ghost.danger");
  const bg = (m[1].match(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})/) || [])[1], fg = (m[1].match(/(?:^|;)\s*color:\s*(#[0-9a-fA-F]{3,6})/) || [])[1];
  assert.ok(bg && fg, "hex background and color: " + m[1]);
  assert.ok(ratio(bg, fg) >= 4.5, `contrast ${ratio(bg, fg).toFixed(2)}`);
});

test("one ?v= per stylesheet across pages; attendance.css >= 10, exam.css >= 4", () => {
  const seen = {};
  for (const f of readdirSync(ROOT).filter(x => x.endsWith(".html"))) {
    for (const m of read(f).matchAll(/href="([a-z0-9-]+\.css)\?v=(\d+)"/g)) (seen[m[1]] = seen[m[1]] || {})[m[2]] = (seen[m[1]][m[2]] || []).concat(f);
  }
  const bad = Object.entries(seen).filter(([, v]) => Object.keys(v).length > 1).map(([k, v]) => k + " " + JSON.stringify(v));
  assert.deepEqual(bad, []);
  assert.ok(Number(Object.keys(seen["attendance.css"])[0]) >= 10, "attendance.css v");
  assert.ok(Number(Object.keys(seen["exam.css"])[0]) >= 4, "exam.css v");
});

test("exam.css: one import-file overflow rule set", () => {
  const n = (read("exam.css").match(/input\[type=["']?file["']?\]/g) || []).length;
  assert.equal(n, 1, "input[type=file] rules in exam.css: " + n);
});
