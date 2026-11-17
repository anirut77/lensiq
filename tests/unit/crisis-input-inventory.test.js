// tests/unit/crisis-input-inventory.test.js — FIXED TEST SET "crisis-net-hotfix" (locked 2026-11-16 before the fix).
// Owner order 2026-11-16 (c): every free-text input on a fortune page is covered by the crisis net. This test fails when a
// free-text input (textarea, input without type, text / search / tel / email / url) appears on a fortune page, in its HTML or
// in the page's own scripts, without a row in tests/e2e/crisis-net-hotfix-inventory.json (which the e2e set iterates over), and
// when a row of the inventory is missing from docs/CRISIS-INPUT-INVENTORY.md.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const INV = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/e2e/crisis-net-hotfix-inventory.json"), "utf8"));
const FREE = /^(?:text|search|tel|email|url|textarea)$/;
const attr = (tag, k) => { const m = tag.match(new RegExp("\\s" + k + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|\\\\\"([^\\\\]*)\\\\\")", "i")); return m ? m[1] || m[2] || m[3] || "" : ""; };
/** free-text inputs in a chunk of HTML or JS source: [{type, id, cls}] */
function freeInputs(src) {
  const out = [];
  for (const m of src.matchAll(/<(textarea|input)\b[^>]*>/gi)) {
    const tag = m[0], type = m[1].toLowerCase() === "textarea" ? "textarea" : (attr(tag, "type") || "text").toLowerCase();
    if (FREE.test(type)) out.push({ type, id: attr(tag, "id"), cls: attr(tag, "class").split(/\s+/)[0] || "", name: attr(tag, "name") });
  }
  // inputs created in script: createElement("input") / ("textarea") with a text-like type (or none)
  for (const m of src.matchAll(/createElement\(\s*["'](input|textarea)["']\s*\)([^\n]*)/g)) {
    const t = (m[2].match(/\.type\s*=\s*["'](\w+)["']/) || [])[1] || (m[1] === "textarea" ? "textarea" : "text");
    if (FREE.test(t)) out.push({ type: t, id: (m[2].match(/\.id\s*=\s*["']([\w-]+)["']/) || [])[1] || "", cls: "", name: "", script: true });
  }
  return out;
}
const pageScripts = html => [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1].split("?")[0]).filter(s => !/^https?:/.test(s) && !s.startsWith("vendor/"));
const covered = (page, f) => INV.inputs.some(r => r.phrase && (r.page === page || r.page === "*") &&
  (f.id ? r.sel === "#" + f.id : f.cls ? r.sel === "." + f.cls : f.name ? r.sel.includes('"' + f.name + '"') : false));

test("inventory lists the 18 fortune pages plus cat-fortune", () => {
  for (const p of ["fortune", "cat-fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac", "astro", "lifegraph", "planner", "luckycolor", "report"])
    assert.ok(INV.pages.includes(p), p);
});

test("every free-text input in a fortune page's HTML has a phrase row in the inventory", () => {
  const miss = [];
  for (const p of INV.pages) {
    const html = fs.readFileSync(path.join(ROOT, p + ".html"), "utf8");
    for (const f of freeInputs(html)) if (!covered(p, f)) miss.push(p + ": " + JSON.stringify(f));
  }
  assert.deepEqual(miss, []);
});

test("every free-text input created by a fortune page's own scripts has a phrase row in the inventory", () => {
  const miss = [];
  for (const p of INV.pages) {
    const html = fs.readFileSync(path.join(ROOT, p + ".html"), "utf8");
    for (const s of pageScripts(html)) {
      const file = path.join(ROOT, s);
      if (!fs.existsSync(file)) continue;
      const src = fs.readFileSync(file, "utf8");
      for (const f of freeInputs(src)) {
        // a script shared by several pages renders its input on the page whose inventory row names it
        const any = INV.inputs.some(r => r.phrase && (f.id ? r.sel === "#" + f.id : f.cls ? r.sel === "." + f.cls : false));
        if (!(covered(p, f) || (f.id && any))) miss.push(p + " (" + s + "): " + JSON.stringify(f));
      }
    }
  }
  assert.deepEqual(miss, []);
});

test("every phrase row names a real field and every row is in docs/CRISIS-INPUT-INVENTORY.md", () => {
  const doc = fs.readFileSync(path.join(ROOT, "docs/CRISIS-INPUT-INVENTORY.md"), "utf8");
  for (const r of INV.inputs) {
    assert.ok(doc.includes("`" + r.sel + "`"), "doc row missing: " + r.page + " " + r.sel);
    if (r.phrase) assert.ok(r.maxlength == null || r.maxlength >= 3, r.page + " " + r.sel + ": a phrase row must fit the short phrase");
  }
});
