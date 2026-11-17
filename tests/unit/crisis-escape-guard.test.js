// tests/unit/crisis-escape-guard.test.js — FIXED TEST SET "crisis-escape-guard" (locked 2026-11-17 BEFORE measuring; copies +
// sha256 in ~/LENSIQ-field/evals/crisis-escape-guard/, evals-locks/crisis-escape-guard.sha256). Incident 2026-11-16
// (docs/INCIDENT-2026-11-16-CRISIS-LEAK.md); owner order 2026-11-17: "what now prevents a new input or result element from
// escaping the crisis check (a test that fails when a new one is added)". The static half of the guard; the browser half is
// tests/e2e/crisis-escape-guard-{report,field}.e2e.mjs.
// Pages are FOUND, not listed: every *.html that loads fortune-read.js, fortune-ai.js or fortune-crisis.js. A new fortune page
// is therefore checked the day it is added.
//   1. the takeover's roots are still [data-lq-result], [id$="Result"], [id$="Stats"] (what this test treats as "hidden in the
//      crisis state");
//   2. INPUTS: every free-text field (textarea, input text / search / tel / email / url / no type, contenteditable) on such a
//      page, in its HTML, created by its own scripts, by scripts those load, or by scripts nav.js injects, has a phrase row in
//      tests/e2e/crisis-net-hotfix-inventory.json for that page (or "*") and that row is in docs/CRISIS-INPUT-INVENTORY.md;
//   3. RESULTS: every element (by id, present in the page HTML) that the page's scripts write into or reveal (innerHTML /
//      textContent / append… / hidden = false) lies inside a takeover root and not inside a <form> below that root (the takeover
//      keeps forms), or is listed in tests/unit/crisis-escape-guard-allow.json as NOT reading content, with a reason;
//      allow-list entries that no longer match anything fail too, so the list stays exact;
//   4. every page with a crisis entry point (a free-text field, or FortuneAI readings, which get the report dialog) has a
//      browser flow in tests/e2e/crisis-escape-guard-kit.mjs; a page without one is listed under "noEntry" with a reason
//      that is checked.
// Crisis v3 (reading continues gently instead of a card) changes what "allowed in the crisis state" means, not what a result
// element is: checks 2–4 stay as they are; the browser half has one predicate to re-target (see the kit).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./crisis-escape-guard-lib.cjs");

const ROOT = path.join(__dirname, "..", "..");
const INV = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/e2e/crisis-net-hotfix-inventory.json"), "utf8"));
const DOC = fs.readFileSync(path.join(ROOT, "docs/CRISIS-INPUT-INVENTORY.md"), "utf8");
const ALLOW = JSON.parse(fs.readFileSync(path.join(__dirname, "crisis-escape-guard-allow.json"), "utf8"));
const PAGES = L.readingPages(ROOT);
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

test("reading pages are found by script, not by a list (at least the 18 fortune pages + compat)", () => {
  for (const p of ["faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac", "astro", "lifegraph", "report", "compat"])
    assert.ok(PAGES.includes(p), p + " not found as a reading page");
});

test("1. the takeover's result roots are the ones this guard checks against", () => {
  const src = read("lensiq-crisis-takeover.js");
  const m = src.match(/const ROOTS = '([^']+)'/);
  assert.ok(m, "ROOTS not found in lensiq-crisis-takeover.js");
  assert.equal(m[1], L.ROOTS);
  assert.ok(read("fortune-read.js").includes("const ROOTS = '" + L.ROOTS + "'"), "fortune-read.js does not embed the same takeover");
});

test("2. every free-text field on every reading page has a phrase row in the inventory (and in docs/CRISIS-INPUT-INVENTORY.md)", () => {
  const rows = INV.inputs.filter(r => r.phrase);
  const covers = (page, f) => rows.some(r => (r.page === page || r.page === "*") && (
    f.id ? (r.sel === "#" + f.id || (f.templ && new RegExp("^#" + f.id + "\\d+$").test(r.sel)) || (f.templ && r.sel.startsWith("#" + f.id)))
      : f.script ? !!(r.dynamic && f.file && r.dynamic.includes(f.file))
        : f.cls ? r.sel === "." + f.cls || r.sel.includes("." + f.cls)
          : f.name ? r.sel.includes('"' + f.name + '"') : false));
  const miss = [];
  for (const p of PAGES) {
    const html = read(p + ".html");
    for (const f of L.freeInputs(html)) if (!covers(p, f)) miss.push(p + ".html: " + JSON.stringify(f));
    for (const s of L.pageScriptsAll(ROOT, html)) for (const f of L.freeInputs(read(s))) {
      f.file = s;
      // a field a shared script draws on another page only: covered when ANY page's row names it (as the round-1 test does)
      const anyPage = f.id && rows.some(r => r.sel === "#" + f.id || (f.templ && r.sel.startsWith("#" + f.id)));
      if (!(covers(p, f) || anyPage)) miss.push(p + " (" + s + "): " + JSON.stringify(f));
    }
  }
  for (const r of rows) if (!DOC.includes("`" + r.sel + "`")) miss.push("docs/CRISIS-INPUT-INVENTORY.md has no row for " + r.page + " " + r.sel);
  assert.deepEqual([...new Set(miss)], []);
});

test("3. every element a reading page's scripts write into or reveal is inside a takeover root (not in a form there) or allow-listed as not reading content", () => {
  const bad = [], used = new Set(), entry = PAGES.filter(p => L.entryPoint(ROOT, p) && !(ALLOW.noEntry || {})[p]);
  for (const p of entry) {
    const html = read(p + ".html"), anc = L.ancestry(html);
    for (const s of L.ownScripts(html)) {
      let src;
      try { src = read(s); } catch (e) { continue; }
      for (const id of L.writeTargets(src)) {
        const chain = anc.get(id);
        if (!chain) continue; // created by script: the browser half sees it
        const key = [p + " " + id, "* " + id].find(k => ALLOW.targets[k]);
        if (L.inRoot(chain)) {
          const f = L.formInside(chain);
          if (f && key) used.add(key);
          if (f && !key) bad.push(`${p} #${id} (${s}): inside a result root but also inside <form${f.id ? " id=" + f.id : ""}>, which the takeover keeps visible`);
          continue;
        }
        if (key) { used.add(key); continue; }
        bad.push(`${p} #${id} (${s}): written into or revealed by the page script, outside every result root. Add data-lq-result to it (or a parent), or, if it is not reading content, list "${p} ${id}" in tests/unit/crisis-escape-guard-allow.json with a reason`);
      }
    }
  }
  for (const k of Object.keys(ALLOW.targets)) if (!used.has(k)) bad.push(`allow-list entry "${k}" matches nothing any more: remove it`);
  assert.deepEqual([...new Set(bad)], []);
});

test("4. every reading page with a crisis entry point has a browser flow; pages without one say why, and the reason holds", () => {
  const kit = read("tests/e2e/crisis-escape-guard-kit.mjs");
  const flows = new Set([...kit.matchAll(/^ {2}([a-z0-9]+): \{ url:/gm)].map(m => m[1]));
  const bad = [];
  for (const p of PAGES) {
    const why = L.entryPoint(ROOT, p), no = (ALLOW.noEntry || {})[p];
    if (!why) { if (flows.has(p)) bad.push(p + ": no entry point but a flow (harmless; remove or keep)"); continue; }
    if (flows.has(p)) continue;
    if (no) {
      const anc = L.ancestry(read(p + ".html"));
      for (const id of no.absent || []) if (anc.has(id)) bad.push(`${p}: listed as noEntry because #${id} is absent, but ${p}.html now has #${id}`);
      continue;
    }
    bad.push(`${p}: crisis entry point (${why}) but no flow in tests/e2e/crisis-escape-guard-kit.mjs`);
  }
  for (const p of Object.keys(ALLOW.noEntry || {})) if (!PAGES.includes(p)) bad.push("noEntry " + p + ": not a reading page any more");
  assert.deepEqual(bad.filter(b => !/harmless/.test(b)), []);
});
