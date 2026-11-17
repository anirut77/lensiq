"use strict";
// tests/unit/fortune-gate.test.js — FIXED TEST of the per-page gate (owner decision 86 ค, 2026-11-17: ship the fortune-quality
// changes only on the pages whose readings are better than live; every other page stays byte-identical to live main).
// Locked BEFORE the gate was built, with tests/unit/fortune-gate-live.json (the live reference) and tools/fortune-gate-compose.mjs.
//   ON pages (new path): astro, dream, fengshui, lek7, tarot (with Siam Si), zodiac.
//   Every other reading-engine page: its HTML is live main's, byte for byte, except that each script this branch changed is loaded from
//   live/<same path> — a byte-identical copy of the live file; the composed output of the OFF engines, run with those copies,
//   equals live main's output for a fixed input set.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");
const LIVE = require("./fortune-gate-live.json");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const read = f => fs.readFileSync(path.join(ROOT, f));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "fortune-gate.json"), "utf8"));
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));
const srcs = html => [...String(html).matchAll(/<script[^>]*\ssrc="([^"?]+)(\?[^"]*)?"/g)].map(m => m[1]);
const isOn = p => LIVE.on.includes(p.replace(/\.html$/, ""));
// RE-LOCK 1 (append-only, 2026-11-17): the gate covers the reading-engine pages (the owner's decision is about engines: "every other
// engine must produce byte-identical output to live main"). The first lock also forced pages without a reading (hub, planner, lucky
// colour, admin, index, hr, retail, creative-suite) to live; that contradicted two existing locked tests (fortune-calm-pages: the
// planner / lucky colour page script loads from its own path; backend-admin-setup-ui: the Worker serves admin's scripts) and the
// round-2 lock Q11 (the lucky colour wording fix). Those pages keep this branch's wording fixes. Every engine page and the ON list
// are checked exactly as before.
// RE-LOCK 2 (append-only, 2026-11-17): teamface.html is an HR team page (element roles, no fortune reading) and the locked teamface
// test requires it to load faceread-kb.js / faceread.js from their own paths; it leaves the gate like the other no-reading pages.
// RE-LOCK 3 (append-only, 2026-11-17): main moved to 94115ae5 (compat go-live, face-capture); the live reference is rebuilt from it and
// compat.html, now a fortune page on main, joins the engine pages (OFF: byte-identical to live).
const ENGINE_PAGES = ["astro", "bazi", "compat", "dream", "faceread", "fengshui", "horoscope", "iching", "lek7", "lifegraph", "numbers", "palm", "report", "taksa", "tarot", "zodiac"].map(p => p + ".html");

test("the gate config lists exactly the ON pages of the owner's decision", () => {
  assert.deepEqual([...CONFIG.on].sort(), [...LIVE.on].sort());
  assert.deepEqual([...CONFIG.engines].map(p => p + ".html").sort(), [...ENGINE_PAGES].sort());
  assert.equal(CONFIG.live, LIVE.live);
});

test("every live/ copy is byte-identical to the live file (or, for an unchanged English sibling, to the repo's own file)", () => {
  for (const p of pages) for (const s of srcs(read(p))) {
    if (!s.startsWith("live/")) continue;
    const rel = s.slice(5);
    assert.ok(fs.existsSync(path.join(ROOT, s)), `${p}: ${s} exists`);
    if (LIVE.files[rel]) assert.equal(sha(read(s)), LIVE.files[rel], `${s} = live ${rel}`);
    else assert.equal(sha(read(s)), sha(read(rel)), `${s} = ${rel} (unchanged on this branch)`);
    // the English dictionary is loaded next to its zh tag: the live/ sibling must be there too
    const m = /^live\/i18n\/zh-(.+\.js)$/.exec(s);
    if (m && fs.existsSync(path.join(ROOT, "i18n", "en-" + m[1]))) {
      const en = "live/i18n/en-" + m[1];
      assert.ok(fs.existsSync(path.join(ROOT, en)), `${p}: ${en} exists`);
      assert.equal(sha(read(en)), LIVE.files["i18n/en-" + m[1]] || sha(read("i18n/en-" + m[1])), `${en} is the live English sibling`);
    }
  }
});

test("OFF pages: the HTML is live main's byte for byte (apart from the live/ prefix) and every changed script comes from live/", () => {
  const changed = new Set(Object.keys(LIVE.files));
  for (const p of pages) {
    if (isOn(p) || !ENGINE_PAGES.includes(p)) continue;
    const html = String(read(p));
    assert.ok(LIVE.pages[p], `${p} exists on live`);
    assert.equal(sha(html.replace(/(<script[^>]*\ssrc=")live\//g, "$1")), LIVE.pages[p], `${p} equals live`);
    for (const s of srcs(html)) assert.ok(!changed.has(s), `${p}: ${s} is a changed script and must be loaded from live/`);
  }
});

test("ON pages load the new scripts (no live/ copy)", () => {
  for (const p of pages.filter(isOn)) for (const s of srcs(read(p))) assert.ok(!s.startsWith("live/"), `${p}: ${s}`);
});

test("byte-identical readings: OFF engines composed with the live/ copies equal live main; ON engines take the new path", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lq-gate-"));
  try {
    for (const f of fs.readdirSync(ROOT)) if (/\.js$/.test(f)) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
    fs.mkdirSync(path.join(tmp, "i18n")); fs.mkdirSync(path.join(tmp, "tools"));
    for (const f of fs.readdirSync(path.join(ROOT, "i18n"))) fs.copyFileSync(path.join(ROOT, "i18n", f), path.join(tmp, "i18n", f));
    for (const f of ["fortune-review-export.mjs", "fortune-gate-compose.mjs"]) fs.copyFileSync(path.join(ROOT, "tools", f), path.join(tmp, "tools", f));
    // the OFF pages' script set: every live/ copy over the repo's file of the same path
    const walk = d => fs.readdirSync(path.join(ROOT, d)).flatMap(f => (fs.statSync(path.join(ROOT, d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
    for (const f of walk("live")) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f.slice(5)));
    const off = JSON.parse(execFileSync(process.execPath, [path.join(tmp, "tools", "fortune-gate-compose.mjs"), tmp], { encoding: "utf8", maxBuffer: 1 << 26 }));
    const on = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "tools", "fortune-gate-compose.mjs"), ROOT], { encoding: "utf8", maxBuffer: 1 << 26 }));
    for (const e of LIVE.offEngines) for (const L of ["th", "en", "zh"]) assert.equal(off[e + "|" + L], LIVE.compose[e + "|" + L], `OFF ${e} ${L}: byte-identical to live`);
    for (const e of LIVE.onEngines) for (const L of ["th", "en", "zh"]) assert.notEqual(on[e + "|" + L], LIVE.compose[e + "|" + L], `ON ${e} ${L}: the new path`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
