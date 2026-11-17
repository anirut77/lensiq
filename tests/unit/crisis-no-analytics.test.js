"use strict";
// tests/unit/crisis-no-analytics.test.js — FIXED TEST SET "crisis-rules-1323" part D (owner decision 77 ก, 2026-11-16):
// "Do not count visits to the 'ช่องทางให้คำปรึกษา' page or any crisis-state view, for anyone." Reason: no record of who opens
// crisis help. Locked BEFORE the fix (evals-locks/crisis-rules-1323.sha256, ~/LENSIQ-field/evals/crisis-rules-1323/).
//   D1 counselling.html with analytics consent: nothing is sent (no page view, no feature, no session end), not even as "other".
//   D2 a page that loads in the crisis state (html[data-lq-crisis]) or in the tab's calm state after a card ("lq-fortune-calm"):
//      nothing is sent.
//   D3 a normal page where the crisis card appears later (the attribute is set, or a .fa-support card is in the page): nothing
//      is sent from then on, including events queued before the card and events fired after it (feature, domain, error,
//      session end on pagehide / hidden).
//   D4 control: an ordinary fortune page with consent still sends its page view (the check bites).
//   D5 the Worker rejects page "counselling" and neither allowlist (backend/src/constants.js, lensiq-analytics.js) carries it.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");

/** lensiq-api.js + lensiq-analytics.js in a fake window with consent "yes" */
function browser({ path = "/lensiq/palm.html", crisis = false, calm = false, card = false } = {}) {
  const store = new Map([["lq-analytics", JSON.stringify({ v: 1, cv: "a1", choice: "yes", at: "2026-11-16" })]]), sess = new Map();
  if (calm) sess.set("lq-fortune-calm", "1");
  const mkStorage = m => ({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) });
  const beacons = [], fetches = [], listeners = {};
  const attrs = {};
  if (crisis) attrs["data-lq-crisis"] = "1";
  const html = { lang: "th", hasAttribute: k => k in attrs, getAttribute: k => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); } };
  const state = { card };
  const body = { children: [], appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, removeChild(c) { this.children = this.children.filter(x => x !== c); } };
  const el = () => ({ style: {}, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; }, addEventListener() {} });
  const document = { readyState: "complete", documentElement: html, body, createElement: el, visibilityState: "visible",
    querySelector: sel => (state.card && /\.fa-support\b/.test(sel) ? { className: "fa-support" } : null),
    addEventListener: (t, f) => ((listeners["doc:" + t] ||= []).push(f)) };
  const win = {
    LENSIQ_API_BASE: "https://api.x.dev", document, innerWidth: 400, location: { pathname: path, search: "" },
    navigator: { doNotTrack: null, sendBeacon: (url, blob) => { beacons.push({ url, blob }); return true; } },
    localStorage: mkStorage(store), sessionStorage: mkStorage(sess),
    crypto: { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = i * 17 & 255; return a; } },
    addEventListener: (t, f) => ((listeners[t] ||= []).push(f)),
    setTimeout: () => 0, clearTimeout: () => {}, Blob: class { constructor(parts, o) { this.text = parts.join(""); this.type = o.type; } },
    fetch: (url, init) => { fetches.push({ url, init }); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ["lensiq-api.js", "lensiq-analytics.js"]) vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  const fire = t => (listeners[t] || []).forEach(f => f({}));
  const sent = () => beacons.map(b => b.blob.text).concat(fetches.filter(f => /\/v1\/events/.test(f.url)).map(f => String(f.init && f.init.body)));
  return { win, attrs, state, fire, sent };
}
/** every kind of event a fortune page fires, then the page is left */
function everything(b) {
  b.win.LQAnalytics.feature("fortune.reading", "start");
  b.win.LQAnalytics.domain("palm");
  b.win.LQAnalytics.error(new TypeError("x"));
  b.fire("pagehide");
}

test("D4 control: an ordinary fortune page with consent sends its page view (the check bites)", () => {
  const b = browser();
  everything(b);
  assert.ok(b.sent().length >= 1 && /"page_view"/.test(b.sent().join("")), "control sends");
});

test("D1: counselling.html sends nothing, not even as 'other' (decision 77 ก: no record of who opens crisis help)", () => {
  for (const path of ["/lensiq/counselling.html", "/counselling.html", "/lensiq/counselling"]) {
    const b = browser({ path });
    everything(b);
    assert.deepEqual(b.sent(), [], path + ": nothing sent");
  }
});

test("D2: a page that loads in the crisis state or the tab's calm state after a card sends nothing", () => {
  for (const o of [{ crisis: true }, { calm: true }, { card: true }]) {
    const b = browser(o);
    everything(b);
    assert.deepEqual(b.sent(), [], JSON.stringify(o) + ": nothing sent");
  }
});

test("D3: the card appears on a normal page: nothing is sent from then on, queued events included", () => {
  for (const how of ["attr", "card"]) {
    const b = browser();
    b.win.LQAnalytics.feature("fortune.reading", "start"); // queued before the card
    if (how === "attr") b.win.document.documentElement.setAttribute("data-lq-crisis", "1"); else b.state.card = true;
    b.win.LQAnalytics.feature("fortune.reading", "complete");
    b.win.LQAnalytics.domain("tarot");
    b.win.document.visibilityState = "hidden";
    b.fire("doc:visibilitychange");
    b.fire("pagehide");
    assert.deepEqual(b.sent(), [], how + ": nothing sent after the crisis card");
  }
});

test("D5: the Worker rejects page 'counselling'; neither allowlist carries it", async () => {
  const B = "file://" + join(ROOT, "backend", "src") + "/";
  const { validateBatch } = await import(B + "analytics.js");
  const { ANALYTICS_PAGES } = await import(B + "constants.js");
  assert.ok(!ANALYTICS_PAGES.includes("counselling"), "constants.js ANALYTICS_PAGES has no counselling");
  const client = readFileSync(join(ROOT, "lensiq-analytics.js"), "utf8");
  assert.ok(!/"counselling"/.test(client), "lensiq-analytics.js allowlist has no counselling");
  const ev = { n: "page_view", sid: "0123456789abcdef0123456789abcdef", page: "counselling", lang: "th", device: "mobile" };
  assert.throws(() => validateBatch({ v: 1, consent: true, cv: "a1", events: [ev] }), /allowlist|invalid|reject/i, "page counselling rejected");
});
