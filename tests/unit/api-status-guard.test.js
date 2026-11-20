"use strict";
// tests/unit/api-status-guard.test.js — FIXED TEST SET "api-status-guard" (owner decision 190, 2026-11-20), locked BEFORE the
// fix on branch api-status-guard (base origin/main 299370b8). Copies + sha256: ~/LENSIQ-field/evals/api-status-guard/,
// evals-locks/api-status-guard.sha256.
// Owner's rule: fortune-ai.js asks "/api/fortune/status" ONLY when window.LENSIQ_API_BASE is set. It never guesses from the host
// name. With no API base it behaves exactly as on *.github.io today: {enabled:false}, no request.
//   G1  no LENSIQ_API_BASE on localhost / 127.0.0.1 / [::1] / an own domain / a sub-domain: zero requests to /api/fortune/status,
//       status() says enabled:false, and a reading asked with useAI:true makes no network request at all (AI stays off)
//   G2  LENSIQ_API_BASE set: exactly ONE request, to <base>/api/fortune/status (trailing slashes trimmed), however many times
//       status() is asked; the server's answer is used
//   G3  *.github.io unchanged: no base -> no request, enabled:false; with a base -> one request to that base
//   G4  the fetch failing / a non-OK answer still gives enabled:false (unchanged)
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const FA_SRC = readFileSync(join(__dirname, "..", "..", "fortune-ai.js"), "utf8");

/** Loads fortune-ai.js in a fresh context on `hostname`; every fetch is recorded. @param {string} hostname @param {any} [base] @param {(u:string)=>any} [answer] */
function load(hostname, base, answer) {
  const calls = [];
  const win = {
    setTimeout, clearTimeout, console,
    location: { hostname, protocol: "https:", href: `https://${hostname}/tarot.html`, pathname: "/tarot.html", search: "" },
    localStorage: { getItem: (k) => (k === "fa-consent" ? "1" : null), setItem() {}, removeItem() {} },
    fetch: async (u, init) => {
      calls.push(String(u));
      if (answer) return answer(String(u), init);
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };
  if (base !== undefined) win.LENSIQ_API_BASE = base;
  win.window = win;
  vm.runInContext(FA_SRC, vm.createContext(win));
  return { win, calls, statusCalls: () => calls.filter(u => /\/api\/fortune\/status$/.test(u)) };
}
const FACTS = { domain: "numbers", lang: "th", subject: {}, facts: [] };
const NO_BASE_HOSTS = ["localhost", "127.0.0.1", "[::1]", "lensiq.co.th", "www.lensiq.co.th", "app.lensiq-demo.com", "github.io.example.com"];

for (const host of NO_BASE_HOSTS) {
  for (const base of [undefined, "", "  "]) {
    test(`G1 ${host}, LENSIQ_API_BASE ${JSON.stringify(base)}: no request to /api/fortune/status, AI stays disabled`, async () => {
      const t = load(host, base);
      const st = await t.win.FortuneAI.status();
      assert.equal(st.enabled, false, "status().enabled");
      await t.win.FortuneAI.status();
      await t.win.FortuneAI.interpret(FACTS, { useAI: true }).catch(() => null);
      assert.deepEqual(t.statusCalls(), [], "requests to /api/fortune/status");
      assert.deepEqual(t.calls, [], "no network request at all with no API base");
    });
  }
}

for (const host of ["localhost", "127.0.0.1", "lensiq.co.th", "anirut77.github.io"]) {
  for (const [base, want] of [["https://api.lensiq.example", "https://api.lensiq.example/api/fortune/status"],
    ["https://api.lensiq.example///", "https://api.lensiq.example/api/fortune/status"],
    ["http://127.0.0.1:8787", "http://127.0.0.1:8787/api/fortune/status"]]) {
    test(`G2/G3 ${host}, LENSIQ_API_BASE ${JSON.stringify(base)}: exactly one request, to that base`, async () => {
      const t = load(host, base, (u) => (u.endsWith("/api/fortune/status") ? { ok: true, json: async () => ({ enabled: true, model: "m" }) } : { ok: false, status: 503, json: async () => ({}) }));
      const a = await t.win.FortuneAI.status();
      const b = await t.win.FortuneAI.status();
      assert.equal(a.enabled, true, "the server's answer is used");
      assert.equal(b.enabled, true);
      assert.deepEqual(t.statusCalls(), [want]);
    });
  }
}

test("G3 *.github.io with no API base: no request, enabled:false (unchanged)", async () => {
  for (const host of ["anirut77.github.io", "ANIRUT77.GITHUB.IO"]) {
    const t = load(host, undefined);
    assert.equal((await t.win.FortuneAI.status()).enabled, false);
    await t.win.FortuneAI.interpret(FACTS, { useAI: true }).catch(() => null);
    assert.deepEqual(t.calls, [], host);
  }
});

test("G4 with a base: a failing or non-OK status answer gives enabled:false (one request)", async () => {
  const bad = load("lensiq.co.th", "https://api.lensiq.example", () => { throw new Error("offline"); });
  assert.equal((await bad.win.FortuneAI.status()).enabled, false);
  assert.equal(bad.statusCalls().length, 1);
  const nok = load("localhost", "https://api.lensiq.example", () => ({ ok: false, status: 404, json: async () => ({ enabled: true }) }));
  assert.equal((await nok.win.FortuneAI.status()).enabled, false);
  assert.equal(nok.statusCalls().length, 1);
});

test("G2 the base is read at call time: set after load -> one request to it; cleared again -> no further request", async () => {
  const t = load("localhost", undefined, () => ({ ok: true, json: async () => ({ enabled: true }) }));
  assert.equal((await t.win.FortuneAI.status()).enabled, false);
  assert.equal(t.calls.length, 0);
  t.win.LENSIQ_API_BASE = "https://api.lensiq.example";
  assert.equal((await t.win.FortuneAI.status()).enabled, true);
  assert.deepEqual(t.statusCalls(), ["https://api.lensiq.example/api/fortune/status"]);
  t.win.LENSIQ_API_BASE = "";
  assert.equal((await t.win.FortuneAI.status()).enabled, false);
  assert.equal(t.statusCalls().length, 1);
});
