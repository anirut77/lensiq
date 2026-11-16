"use strict";
// tests/unit/crisis-rules-1323-g.test.js — FIXED TEST SET "crisis-rules-1323" part G (independent review 2026-11-17, minor items),
// locked BEFORE the fix.
//   G1 privacy: showing the crisis card leaves no lasting record on the device: nothing about it is written to localStorage (a
//      count within the tab may stay in sessionStorage).
//   G2 the Merit API's refusal (backend/src/merit.js SUPPORT_LINES) follows the one-number rule: 1323 only, plus the counselling
//      page, in TH / EN / ZH; no 1669 / 191 / 1300 / Samaritans.
//   G3 the fallback call button (shared component missing) is at least 44 x 44 px: toHTML and the DOM card give it an inline
//      min-width and min-height of 44 px.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");
const mk = () => { const m = new Map(); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test("G1: the crisis card writes nothing to localStorage", () => {
  const ls = mk(), ss = mk();
  const win = { localStorage: ls, sessionStorage: ss, console };
  win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  vm.runInContext(readFileSync(join(ROOT, "fortune-ai.js"), "utf8"), ctx, { filename: "fortune-ai.js" });
  for (const lang of ["th", "en", "zh"]) win.FortuneAI.crisis.result({ lang });
  assert.deepEqual([...ls.m.keys()], [], "localStorage keys after three crisis cards");
});

test("G2: the Merit API refusal carries 1323 only, plus the counselling page", async () => {
  const { SUPPORT_LINES } = await import("file://" + join(ROOT, "backend", "src", "merit.js"));
  const txt = JSON.stringify(SUPPORT_LINES);
  assert.doesNotMatch(txt, /(?<!\d)(?:1669|191|1300)(?!\d)|02[\s-]?113[\s-]?6789/, "no other number");
  assert.ok(SUPPORT_LINES.some(l => l.n === "1323" && l.th && l.en && l.zh), "1323 in TH / EN / ZH");
  assert.match(txt, /counselling\.html/, "the counselling page");
});

test("G3: the fallback call button (component missing) is at least 44 x 44 px", () => {
  const win = { console };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(readFileSync(join(ROOT, "fortune-ai.js"), "utf8"), ctx, { filename: "fortune-ai.js" });
  for (const lang of ["th", "en", "zh"]) {
    const html = win.FortuneAI.toHTML(win.FortuneAI.crisis.result({ lang }));
    const a = /<a\b[^>]*href="tel:1323"[^>]*>/.exec(html);
    assert.ok(a, lang + ": fallback tel:1323 link");
    assert.match(a[0], /min-height:\s*44px/, lang + ": min-height 44 px");
    assert.match(a[0], /min-width:\s*44px/, lang + ": min-width 44 px");
  }
  const src = readFileSync(join(ROOT, "fortune-ai.js"), "utf8");
  const dom = /Object\.assign\(el\("a", "lq-call-btn fa-tel"[^\n]*/.exec(src) || /el\("a", "lq-call-btn fa-tel"[^\n]*/.exec(src);
  assert.ok(dom && /min-height:\s*44px/.test(dom[0]) && /min-width:\s*44px/.test(dom[0]), "DOM fallback sets 44 px");
});
