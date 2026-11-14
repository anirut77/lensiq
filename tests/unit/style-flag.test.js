"use strict";
// tests/unit/style-flag.test.js — the Style MVP off switch (owner order 2026-11-14 F: nothing visible to users until the
// owner approves). FIXED TEST: hash-locked in evals-locks/style-mvp.sha256 BEFORE the flag and the page were written.
//   1. lensiq-config.js: window.LENSIQ_STYLE defaults to false; only a real `true` set before the file turns it on
//   2. style.html is linked from NO page, menu, category page, catalogue or dictionary; it is in cat-data UNLINKED
//   3. with the flag off the static page shows a short "not available yet" notice in TH / EN / ZH, keeps the app hidden,
//      and loads nothing heavy (no model, runtime, content file or camera script in the static markup)
//   4. style.js checks the flag before it loads anything
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

function config(pre) {
  const w = Object.assign({}, pre); w.window = w;
  vm.runInNewContext(read("lensiq-config.js"), w, { filename: "lensiq-config.js" });
  return w;
}

test("LENSIQ_STYLE defaults to false; strings, numbers and 'on' do not turn it on; only true does", () => {
  assert.equal(config({}).LENSIQ_STYLE, false);
  for (const v of ["true", 1, "on", "1", {}, []]) assert.equal(config({ LENSIQ_STYLE: v }).LENSIQ_STYLE, false, JSON.stringify(v));
  assert.equal(config({ LENSIQ_STYLE: true }).LENSIQ_STYLE, true);
  assert.match(read("lensiq-config.js"), /window\.LENSIQ_STYLE\s*=\s*window\.LENSIQ_STYLE\s*===\s*true\s*;/);
  // the demo / research profile does not switch it on either
  assert.equal(config({ LENSIQ_PROFILE: "demo" }).LENSIQ_STYLE, false);
});

const LINK = /(^|[^a-z0-9_-])style\.html/i;
test("style.html is not linked from any page, the menu, category pages, the catalogue or any dictionary", () => {
  const bad = [];
  for (const f of fs.readdirSync(ROOT)) {
    if (f === "style.html" || f === "style.js") continue;
    if (/\.(html|js|cjs|mjs|json)$/.test(f) && LINK.test(read(f))) bad.push(f);
  }
  for (const f of fs.readdirSync(path.join(ROOT, "i18n"))) if (LINK.test(read("i18n/" + f))) bad.push("i18n/" + f);
  assert.deepEqual(bad, [], "files that mention style.html");
  for (const f of ["nav.js", "index.html", "solutions.html"]) assert.ok(!/["'/]style\.html/.test(read(f)), f);
  const D = require("../../tools/cat-data.cjs");
  assert.ok(D.UNLINKED.style, "style is a deliberate exception in tools/cat-data.cjs UNLINKED");
  for (const c of D.CATEGORIES) assert.ok(!JSON.stringify(c).includes('"style"'), "not in category " + c.slug);
  assert.ok(!D.PLATFORM.includes("style"), "not a platform page");
});

test("static style.html: noindex, neutral title, notice in TH / EN / ZH shown, app hidden, nothing heavy referenced", () => {
  const html = read("style.html");
  assert.match(html, /<meta name="robots" content="noindex/);
  const title = (/<title[^>]*>([^<]*)<\/title>/.exec(html) || [])[1] || "";
  assert.ok(!/สี|สไตล์|colou?r|style|色|风格/i.test(title), "static title does not announce the feature: " + title);
  const desc = /<meta name="description"/.test(html);
  assert.ok(!desc, "no meta description while off");
  const off = /<section[^>]*id="styOff"[^>]*>([\s\S]*?)<\/section>/.exec(html);
  assert.ok(off, "#styOff notice");
  assert.ok(!/id="styOff"[^>]*\bhidden\b/.test(html), "notice is visible without JavaScript");
  assert.match(off[1], /lang="th"[^>]*>[^<]*ยังไม่เปิดให้ใช้งาน/, "TH notice");
  assert.match(off[1], /lang="en"[^>]*>[^<]*not available yet/i, "EN notice");
  assert.match(off[1], /lang="zh-Hans"[^>]*>[^<]*尚未开放/, "ZH notice");
  assert.match(html, /id="styApp"[^>]*\bhidden\b/, "app is hidden in the static markup");
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1].replace(/\?.*$/, ""));
  for (const s of scripts) assert.ok(["nav.js", "i18n/zh-style.js", "lensiq-config.js", "style.js"].includes(s), "static script " + s);
  assert.ok(!/vendor\/|\.onnx|\.task|\.tflite|\.wasm|content\.json|rel="preload"|rel="modulepreload"/.test(html), "no heavy asset in the static markup");
  assert.ok(!/<video|<canvas/i.test(html.replace(/<template[\s\S]*?<\/template>/g, "")) || /id="styApp"[^>]*\bhidden\b/.test(html), "camera elements only inside the hidden app");
});

test("style.js checks the flag before loading any script, model, content or camera", () => {
  const js = read("style.js");
  const gate = js.search(/LENSIQ_STYLE\s*!==\s*true/);
  assert.ok(gate > 0, "flag check present");
  for (const re of [/loadScript\(/, /import\(/, /fetch\(/, /getUserMedia|LQCam\.create/]) {
    const i = js.search(re);
    assert.ok(i === -1 || i > gate, `${re} only after the flag check`);
  }
  assert.ok(!/[?&]style=1|location\.search[^;]*LENSIQ_STYLE|localStorage[^;]*LENSIQ_STYLE/.test(js), "no URL or storage switch turns the page on");
});
