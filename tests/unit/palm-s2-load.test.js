"use strict";
// tests/unit/palm-s2-load.test.js — palm reading, acceptance criterion S2 (docs/acceptance/fortune-pages.md row S; README S2:
// first usable control <= 8 s on the docs/SPEED.md profile, camera ready <= 15 s), load order of palm.html. Owner inbox entry 18
// (palm to 90), branch palm-90. LOCKED (evals-locks/palm-90.sha256, field copy ~/LENSIQ-field/evals/palm-90/) BEFORE any
// product change.
// Cause measured on main 5dcda908 (tools/fortune-s2.mjs profile, synthetic, exploratory probe before the lock): the CSP <meta>
// turns off Chrome's preload scanner, so the page scripts were fetched one by one as the parser reached them (about 0.6 s of
// round trip each on Fast 3G), and the parser also waited for vendor/face-api.js (1.3 MB, used only by the hand model),
// fortune-ai.js (0.58 MB, used only to compose a reading) and palm-kb.js (0.39 MB, the reading tables) before the camera
// button worked: first usable control 30.7 s.
// Guards (structure only; the timing itself is measured by the locked harness tools/fortune-s2.mjs):
//   1. every parser-run script of the <body> (except nav.js itself) and the two files nav.js adds (lensiq-i18n.js and
//      i18n/zh-common.js with nav.js's ?v=) is listed once as <link rel="preload" as="script" href="SAME URL"> in the <body>,
//      after the nav.js tag and before <main (so the first paint is not delayed); no preload names a model, face-api.js,
//      fortune-ai.js or palm-kb.js; no preload without its script;
//   2. vendor/face-api.js, fortune-ai.js and palm-kb.js stay named in palm.html, but only as <script type="text/lq-lazy"> tags
//      (the browser neither fetches nor runs them; the same convention as branch fortune-90b), after palm-switch-loader.js;
//      every other script tag is a plain parser-run tag (no async, defer or type);
//   3. the crisis and reading scripts keep their order from main: fortune-straight.js < fortune-read.js < lensiq-helpline.js <
//      fortune-crisis.js < palm.js, all parser-run (the crisis net is up before the page code, as before);
//   4. palm.js loads them itself from those tags: palm-kb.js and fortune-ai.js right after DOMContentLoaded (deps()), and
//      vendor/face-api.js only inside loadModels(), before LQDetect.tfBackend(); processImage() and the "read" button wait for
//      deps() before they use the reading tables; window.__palm exposes deps for the tests;
//   5. a file that fails to load gives a plain message in the page language (key palm.eng.loadErr in TH / EN / ZH, the same
//      wording as fortune-90b's load error), never a file name; the message key exists in the EN and ZH dictionaries.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const MODEL_RE = /(\.(onnx|ort|tflite|task|wasm|pb|traineddata)(\?|#|$))|(weights_manifest\.json)|(vendor\/models\/)|(-shard\d+)|(model\.json)|(vendor\/tfjs\/)|(face-api)/i;
const LAZY = ["vendor/face-api.js", "fortune-ai.js", "palm-kb.js"];
const base = s => s.split("?")[0];
const code = src => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const html = read("palm.html");
const bodyAt = html.indexOf("<body");
const tags = [...html.matchAll(/<script\b([^>]*)><\/script>/g)].map(m => {
  const attrs = m[1], src = (/\ssrc="([^"]+)"/.exec(attrs) || [])[1] || null;
  return { at: m.index, attrs, src, type: (/\stype="([^"]+)"/.exec(attrs) || [])[1] || null };
}).filter(t => t.src);

test("palm.html: 1. every parser-run body script and nav.js's two files are preloaded once, in <body> after nav.js and before <main", () => {
  const nav = tags.find(t => base(t.src) === "nav.js");
  assert.ok(nav && nav.at > bodyAt, "nav.js tag in <body>");
  const q = nav.src.slice(nav.src.indexOf("?"));
  const injected = ["lensiq-i18n.js" + q, "i18n/zh-common.js" + q];
  const run = tags.filter(t => t.at > bodyAt && !t.type && base(t.src) !== "nav.js").map(t => t.src);
  assert.ok(run.length >= 12, "body scripts found: " + run.length);
  const pre = [...html.matchAll(/<link rel="preload" as="script" href="([^"]+)">/g)].map(m => ({ href: m[1], at: m.index }));
  const hrefs = pre.map(p => p.href);
  for (const s of run) assert.ok(hrefs.includes(s), "script not preloaded: " + s);
  for (const s of injected) assert.ok(hrefs.includes(s), "nav.js file not preloaded: " + s);
  for (const p of pre) {
    assert.ok(run.includes(p.href) || injected.includes(p.href), "preload without a matching script: " + p.href);
    assert.ok(p.at > nav.at, "preload before the nav.js tag: " + p.href);
    assert.ok(p.at < html.indexOf("<main"), "preload after <main: " + p.href);
    assert.ok(!MODEL_RE.test(p.href) && !LAZY.includes(base(p.href)), "lazy file, model or face-api preloaded: " + p.href);
  }
  assert.equal(new Set(hrefs).size, hrefs.length, "duplicate preload");
});

test("palm.html: 2. face-api.js, fortune-ai.js and palm-kb.js only as text/lq-lazy tags after palm-switch-loader.js; every other tag parser-run", () => {
  const loader = tags.find(t => base(t.src) === "palm-switch-loader.js");
  assert.ok(loader, "palm-switch-loader.js tag");
  for (const f of LAZY) {
    const t = tags.filter(x => base(x.src) === f);
    assert.equal(t.length, 1, f + " named exactly once");
    assert.equal(t[0].type, "text/lq-lazy", f + " is a text/lq-lazy tag");
    assert.ok(t[0].at > loader.at, f + " after palm-switch-loader.js");
  }
  for (const t of tags.filter(x => !LAZY.includes(base(x.src)))) {
    assert.ok(!t.type && !/\s(async|defer)\b/.test(t.attrs), "parser-run tag expected: " + t.src);
  }
});

test("palm.html: 3. crisis and reading scripts keep their order from main, all before palm.js and parser-run", () => {
  const order = ["fortune-straight.js", "fortune-read.js", "lensiq-helpline.js", "fortune-crisis.js", "palm.js"];
  const at = order.map(f => { const t = tags.find(x => base(x.src) === f); assert.ok(t && !t.type, f + " parser-run tag"); return t.at; });
  for (let i = 1; i < at.length; i++) assert.ok(at[i] > at[i - 1], order[i - 1] + " before " + order[i]);
});

test("palm.js: 4. loads the lazy tags itself: deps() after DOMContentLoaded, face-api.js inside loadModels() before tfBackend()", () => {
  const c = code(read("palm.js"));
  assert.match(c, /text\/lq-lazy/, "palm.js reads the text/lq-lazy tags");
  assert.match(c, /function deps\(/, "deps()");
  const lm = c.slice(c.indexOf("function loadModels"));
  const fa = lm.search(/face-api/), tb = lm.indexOf("LQDetect.tfBackend()");
  assert.ok(fa >= 0 && tb > fa, "loadModels() loads face-api.js before LQDetect.tfBackend()");
  const pi = c.slice(c.indexOf("async function processImage"));
  assert.ok(/await deps\(\)/.test(pi.slice(0, pi.indexOf("detectHands("))), "processImage() waits for deps() before it reads the photo");
  const rd = c.slice(c.indexOf('$("#plRead").addEventListener'));
  assert.ok(/deps\(\)/.test(rd.slice(0, 1500)), "the read button waits for deps()");
  assert.match(c, /DOMContentLoaded/, "deps() starts after DOMContentLoaded");
  assert.match(c, /window\.__palm = \{[\s\S]*?\bdeps\b[\s\S]*?\};/, "window.__palm.deps");
});

test("palm: 5. a file that fails to load gives a plain message in TH / EN / ZH, never a file name", () => {
  const c = read("palm.js");
  const m = /T\("palm\.eng\.loadErr",\s*"([^"]+)"/.exec(c);
  assert.ok(m, "palm.eng.loadErr used with a Thai default");
  assert.equal(m[1], "โหลดข้อมูลคำอ่านไม่สำเร็จ กรุณาตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง");
  const en = read("i18n/en-fortune-palm.js"), zh = read("i18n/zh-fortune-palm.js");
  assert.match(en, /"palm\.eng\.loadErr":\s*"The reading data did not load\. Please check your internet connection and try again\."/);
  assert.match(zh, /"palm\.eng\.loadErr":\s*"解读资料未能加载。请检查网络连接后再试一次。"/);
  for (const s of [m[1], en, zh]) assert.ok(!/palm\.eng\.loadErr"\s*:\s*"[^"]*\.js/.test(s), "no file name in the message");
});
