"use strict";
// tests/unit/style-s4-flag.test.js — Style S4 page (style.html: daily outfit + hair colour match) stays OFF and UNLINKED.
// FIXED TEST: hash-locked in evals-locks/style-s4.sha256 BEFORE style.html / style.js / lensiq-outfit.js and the
// LENSIQ_STYLE line in lensiq-config.js were written (owner order 2026-11-18 night: behind LENSIQ_STYLE = false, unlinked,
// not in the menu). The parked Personal Colour part (undertone / season) must not be on this page.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const PAGE_FILES = ["style.html", "style.js", "lensiq-outfit.js", "i18n/en-style.js", "i18n/zh-style.js"];

test("lensiq-config.js: LENSIQ_STYLE is false unless set to exactly true before the file", () => {
  const src = read("lensiq-config.js");
  assert.match(src, /window\.LENSIQ_STYLE = window\.LENSIQ_STYLE === true;/);
  for (const [pre, exp] of [[undefined, false], [true, true], ["true", false], [1, false], [false, false], [{}, false]]) {
    const win = { location: { search: "?style=1&LENSIQ_STYLE=true", hash: "" }, localStorage: { getItem: () => "true", setItem() {} } };
    if (pre !== undefined) win.LENSIQ_STYLE = pre;
    const ctx = { window: win, document: { documentElement: { dataset: {} } }, localStorage: win.localStorage, location: win.location };
    try { vm.runInNewContext(src, ctx); } catch (e) { /* other config lines may need a browser; the STYLE line runs first or not at all */ }
    assert.equal(win.LENSIQ_STYLE, exp, "pre " + JSON.stringify(pre));
  }
});

test("style.js stops at its first statement while the switch is off (no DOM, camera, file or network access)", () => {
  const src = read("style.js");
  const trap = new Proxy({}, { get(_, k) { throw new Error("touched " + String(k)); } });
  for (const v of [undefined, false, "true", 1]) {
    const win = { LENSIQ_STYLE: v };
    assert.doesNotThrow(() => vm.runInNewContext(src, { window: win, document: trap, navigator: trap, fetch: trap, localStorage: trap, location: trap }), "flag " + v);
  }
  assert.doesNotMatch(src, /location\.search[^;\n]*LENSIQ_STYLE|LENSIQ_STYLE\s*=(?!=)/, "the page never sets the switch itself");
});

test("style.html: noindex, off notice in TH / EN / ZH, app hidden by default, no face or Personal Colour models", () => {
  const html = read("style.html");
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.match(html, /id="styOff"/);
  assert.match(html, /หน้านี้ยังไม่เปิดให้ใช้งาน/); assert.match(html, /This page is not available yet\./); assert.match(html, /此页面尚未开放。/);
  assert.match(html, /<div id="styApp" hidden>/);
  assert.doesNotMatch(html, /lensiq-style\.js|mediapipe|face_landmarker|multiclass|face-api|lensiq-camera\.js|photobooth-hq\.js/i);
  assert.doesNotMatch(html, /<video/i, "no camera stage: photos are picked by the user");
});

test("unlinked: no other page, menu, category, catalogue, sitemap or analytics list points to style.html", () => {
  const skip = new Set(["style.html", "style.js"]);
  const files = fs.readdirSync(ROOT).filter(f => /\.(html|js|cjs|mjs|json|xml|txt)$/.test(f) && !skip.has(f));
  for (const d of ["i18n", "tools", "backend/src"]) if (fs.existsSync(path.join(ROOT, d))) {
    for (const f of fs.readdirSync(path.join(ROOT, d))) if (/\.(js|cjs|mjs|json)$/.test(f) && !/-style\.js$/.test(f)) files.push(path.join(d, f));
  }
  const hits = files.filter(f => /(href\s*=\s*["']\/?style\.html|["'`]\/?style\.html["'`#?]|\/style\.html)/.test(read(f)));
  assert.deepEqual(hits, [], "files linking style.html");
  const cat = require(path.join(ROOT, "tools", "cat-data.cjs"));
  assert.ok(!cat.PAGES.style, "not in the category pages");
  assert.ok(!cat.CATEGORIES.some(c => JSON.stringify(c).includes('"style"')), "not in any category");
  assert.doesNotMatch(read("nav.js"), /style\.html|["']style["']\s*:/);
});

test("page files: no camera, upload, storage or tracking; no Personal Colour wording", () => {
  for (const f of ["style.js", "lensiq-outfit.js"]) {
    const src = read(f);
    assert.doesNotMatch(src, /getUserMedia|localStorage\.setItem|sessionStorage\.setItem|indexedDB|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|FormData/, f);
    assert.doesNotMatch(src, /LQAnalytics|lensiq-analytics/, f + " no analytics events");
  }
  for (const f of PAGE_FILES) {
    const src = read(f);
    assert.doesNotMatch(src, /undertone|\bseasons?\b|ซีซัน|อันเดอร์โทน|โทนผิว|สีผิว|季型|肤色|冷暖调/i, f + " (Personal Colour is parked)");
  }
});
