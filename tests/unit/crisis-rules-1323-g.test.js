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

// RE-LOCK 2026-11-17 (owner decision 2026-11-17 crisis v3): the card and its fallback button are gone. The closing line's button works without the shared component (its markup is
// built by fortune-crisis.js) and is at least 44 x 44 px through styles.css (.lq-call-mini > a.lq-call-btn: min-height / min-width 44 px).
test("G3: the closing line's call button needs no shared component and is at least 44 x 44 px", () => {
  const win = { console };
  win.window = win;
  vm.runInContext(readFileSync(join(ROOT, "fortune-crisis.js"), "utf8"), vm.createContext(win), { filename: "fortune-crisis.js" });
  for (const lang of ["th", "en", "zh"]) {
    const h = win.LQFortuneCrisis.helpHTML(lang, "lq-helpline-result");
    assert.match(h, /<span class="lq-call-mini"[^>]*><a class="lq-call-btn[^"]*" href="tel:1323"/, lang + ": the button without the component");
  }
  const css = readFileSync(join(ROOT, "styles.css"), "utf8");
  const rule = /\.lq-call-mini>a\.lq-call-btn\[href\]\{[^}]*\}/.exec(css);
  assert.ok(rule && /min-height:44px/.test(rule[0]) && /min-width:44px/.test(rule[0]), "44 x 44 px in styles.css");
});

// RE-LOCK 2026-11-17 (append-only; coordinator, after CI run 43936566370: fortune-crisis-session (b) allows ONE sessionStorage
// boolean): the count of crisis cards is not kept at all (nothing reads it; the most private choice).
test("G1b: no count of crisis cards anywhere: not in localStorage, not in sessionStorage, not in the source", () => {
  const ls = mk(), ss = mk();
  const win = { localStorage: ls, sessionStorage: ss, console };
  win.window = win; win.globalThis = win;
  vm.runInContext(readFileSync(join(ROOT, "fortune-ai.js"), "utf8"), vm.createContext(win), { filename: "fortune-ai.js" });
  for (const lang of ["th", "en", "zh"]) win.FortuneAI.crisis.result({ lang });
  assert.deepEqual([...ls.m.keys()], [], "localStorage");
  assert.deepEqual([...ss.m.keys()], [], "sessionStorage");
  assert.doesNotMatch(readFileSync(join(ROOT, "fortune-ai.js"), "utf8"), /lq-support-n/, "fortune-ai.js keeps no crisis-card counter");
});

// RE-LOCK 2026-11-17 (append-only; coordinator after the re-review of 1d5164c): visitors from before the change still hold the old
// "lq-support-n" key; every fortune page (fortune-crisis.js, loaded on all 18 fortune pages) removes it once on load.
test("G1c: a stale lq-support-n key in localStorage is removed when a fortune page loads (fortune-crisis.js)", () => {
  const ls = mk(), ss = mk();
  ls.setItem("lq-support-n", "3"); ls.setItem("lq-lang", "th");
  const win = { localStorage: ls, sessionStorage: ss, console };
  win.window = win; win.globalThis = win;
  vm.runInContext(readFileSync(join(ROOT, "fortune-crisis.js"), "utf8"), vm.createContext(win), { filename: "fortune-crisis.js" });
  assert.equal(ls.getItem("lq-support-n"), null, "stale counter removed");
  assert.equal(ls.getItem("lq-lang"), "th", "other keys untouched");
  const blocked = { console, get localStorage() { throw new Error("blocked"); } };
  blocked.window = blocked;
  assert.doesNotThrow(() => vm.runInContext(readFileSync(join(ROOT, "fortune-crisis.js"), "utf8"), vm.createContext(blocked)), "blocked storage: no error");
  for (const p of ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac", "astro",
    "lifegraph", "planner", "luckycolor", "report"]) assert.match(readFileSync(join(ROOT, p + ".html"), "utf8"), /<script src="fortune-crisis\.js\?v=\d+"><\/script>/, p + " loads fortune-crisis.js");
});
