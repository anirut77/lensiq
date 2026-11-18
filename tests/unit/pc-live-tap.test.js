"use strict";
// tests/unit/pc-live-tap.test.js — Product Check: owner decision 96 = ก (2026-11-18). The written criterion "one AI call
// per product" becomes "one round per tap, at most three calls, the user taps every time". Locked checks for it (live-scan
// set, evals-locks/live-scan.sha256), written and locked before the first run. Only adds checks.
//   T1  one tap = one round of at most three AI requests, one per Product Check feature (fields, claims, translate):
//       sendAll sends each feature at most once, with no loop, through the page's only AI POST (LQAI.send);
//   T2  nothing is sent without a tap: the live scan (frames, scene changes) has no network path; on medicine.html only
//       lensiq-pc-ai.js calls LQAI.send; sendAll / oneTap run only from ask / acceptOffer, and those (and the preview's
//       "Send this text") only from the click handler; page load, visibility, language, tester, card and live-scan events
//       only repaint or clear;
//   T3  the monthly budget cap: a Product Check feature always has a cap (null refused); a tap over the cap is refused
//       (429 budget) before any provider call, and once refused no later tap reaches the provider.
// The 6 / minute and 150 / day one-tap caps are locked in backend-pc-auto.test.js A6 and pc-live-release.test.js R6.
// Synthetic text only; mocked provider, D1 shim; no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
/** source without comments (block comments and whole-line // comments), so a comment never counts as a call */
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
/** the body of `function name(` up to the next line that starts a sibling function at the same indent */
function body(src, decl) {
  const i = src.indexOf(decl);
  assert.ok(i >= 0, "found: " + decl);
  const indent = src.slice(src.lastIndexOf("\n", i) + 1, i);
  const rest = src.slice(i + decl.length);
  const end = rest.search(new RegExp("\\n" + indent + "(async function |function |const |W\\.|document\\.)"));
  return end < 0 ? rest : rest.slice(0, end);
}
const count = (s, needle) => s.split(needle).length - 1;

test("T1 one tap = one round of at most three AI requests (fields, claims, translate), each feature at most once", () => {
  const AI = require("../../lensiq-pc-ai.js");
  assert.deepEqual([...AI.FEATURES], ["pc_fields", "pc_claims", "pc_translate"], "the Product Check AI features");
  const src = code(read("lensiq-pc-ai.js"));
  const s = body(src, "async function sendAll(");
  assert.equal(count(s, "W.LQAI.send("), 1, "one POST path in sendAll");
  for (const f of AI.FEATURES) assert.equal(count(s, 'go("' + f + '"'), 1, f + " is requested at most once per round");
  assert.equal(count(s, "go("), 3, "three requests, nothing else (the definition is \"go = (\")");
  assert.doesNotMatch(s, /\bfor\s*\(|\bwhile\s*\(|\.forEach\(|\.map\(\s*\(?\s*\w*\s*\)?\s*=>\s*go\(/, "no loop around the requests");
  // the request itself: LQAI.send is one POST, no retry loop on the page
  const ai = code(read("lensiq-ai.js"));
  const send = body(ai, "function send(");
  assert.equal(count(send, 'method: "POST"'), 1, "LQAI.send makes one POST");
  assert.doesNotMatch(send, /\bfor\s*\(|\bwhile\s*\(/, "no retry loop in LQAI.send");
});

test("T2 nothing is sent without a tap: no AI request from the live scan, frame or scene changes, page load or visibility changes", () => {
  // the live scan has no network path at all
  for (const f of ["lensiq-pc-live.js", "lensiq-pc-live-ui.js"]) {
    const s = code(read(f));
    for (const bad of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "LQAI", "__LQ_PCAI", "sendAll", "oneTap", "EventSource"]) {
      assert.ok(!s.includes(bad), f + " must not contain " + bad);
    }
  }
  // on medicine.html, the only caller of the AI POST is lensiq-pc-ai.js
  const html = read("medicine.html");
  const scripts = [...html.matchAll(/<script src="([^"?]+\.js)/g)].map(m => m[1]).filter(f => !f.startsWith("i18n/"));
  assert.ok(scripts.includes("lensiq-pc-ai.js") && scripts.includes("lensiq-pc-live-ui.js"), "scripts found");
  for (const f of scripts) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    const s = code(read(f));
    const n = count(s, "LQAI.send(");
    if (f === "lensiq-pc-ai.js") assert.equal(n, 1, f + ": one call site (sendAll)");
    else assert.equal(n, 0, f + " must not call LQAI.send");
    if (f !== "lensiq-pc-ai.js") assert.ok(!s.includes("__LQ_PCAI.ask") && !s.includes("__LQ_PCAI.auto"), f + " must not trigger the AI step");
    if (f !== "lensiq-ai.js") assert.doesNotMatch(s, /["'`]\/v1\/ai\/["'`]\s*\+|\/v1\/ai\/pc_/, f + " must not POST to the AI route itself");
  }
  const src = code(read("lensiq-pc-ai.js"));
  const fns = { ask: body(src, "async function ask("), acceptOffer: body(src, "async function acceptOffer("), oneTap: body(src, "async function oneTap(") };
  const callers = name => {
    const out = [];
    for (const [k, b] of Object.entries(fns)) if (new RegExp("\\b" + name + "\\(").test(b)) out.push(k);
    return out.sort();
  };
  assert.deepEqual(callers("sendAll"), ["acceptOffer", "ask", "oneTap"], "sendAll runs only from ask, acceptOffer, oneTap");
  assert.deepEqual(callers("oneTap"), ["ask"], "oneTap runs only from ask (a tap on 'ask AI')");
  // every call site of ask / acceptOffer / previewSend / oneTap / sendAll outside those bodies is in the click handler
  const click = body(src, 'document.addEventListener("click", e => {');
  assert.match(click, /#pcAiGo"\)\) ask\(false\)/, "'ask AI' tap");
  assert.match(click, /#pcAiText"\)\) ask\(true\)/, "'text only' tap");
  assert.match(click, /#pcAiOfferGo"\)\) acceptOffer\(\)/);
  assert.match(click, /#pcAiPrevSend"\)\) previewSend\(\)/, "'Send this text' tap");
  let rest = src;
  for (const b of [fns.ask, fns.acceptOffer, fns.oneTap, click]) rest = rest.replace(b, "");
  for (const name of ["ask", "acceptOffer", "previewSend", "oneTap", "sendAll"]) {
    const uses = [...rest.matchAll(new RegExp("\\b" + name + "\\(", "g"))].map(m => rest.slice(Math.max(0, m.index - 40), m.index + name.length + 20));
    const ok = uses.filter(u => !new RegExp("function " + name + "\\(").test(u));
    assert.deepEqual(ok, [], name + " is called only from a tap: " + JSON.stringify(ok));
  }
  // event listeners other than the click handler only repaint or clear
  const listeners = [...src.matchAll(/(?:W|document)\.addEventListener\("([\w-]+)"/g)].map(m => m[1]).filter(e => e !== "click");
  for (const ev of listeners) {
    const i = src.indexOf('addEventListener("' + ev + '"');
    const line = src.slice(i, src.indexOf("\n", i));
    assert.doesNotMatch(line, /\b(ask|acceptOffer|previewSend|oneTap|sendAll|oneTapEnable)\(|LQAI\.send/, ev + " listener never sends: " + line);
  }
  assert.ok(!/visibilitychange/.test(src) || !/visibilitychange[^\n]*\b(ask|sendAll|oneTap)\(/.test(src), "visibility never sends");
});

/* ---------- T3: monthly budget cap through the Worker ---------- */
const { createEnv, req } = require("./backend-d1-shim.js");
const B = "../../backend/src/";
const CODE = "Mango-CANARY-7731-zebra-code";
const LABEL = "ยาแก้ปวด TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nส่วนประกอบ: พาราเซตามอล 500 มก.\nEXP 01/2028";
const FIELDS = { product_type: "drug", brand: "TESTOL", product_name: null, active_ingredients: [], dosage_form: null, registration: [], manufacturer: null, lot: null,
  expiry: null, claims_on_pack: [], languages_on_pack: [], unreadable: [] };

test("T3 monthly budget cap: always set for Product Check; a tap over the cap is refused before any provider call, and stays refused", async () => {
  const { putGateway, getGateway } = await import(B + "ai/settings.js");
  const { handle } = await import(B + "index.js");
  const { BKK_OFFSET } = await import(B + "util.js");
  const mkEnv = () => createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ANTHROPIC_API_KEY: "sk-ant-test-" + "k".repeat(40),
    TESTER_GATE: "required", TESTER_ACCESS_CODE: CODE });
  const feat = budget => ({ enabled: true, chain: [{ provider: "anthropic", model: "claude-haiku-5-5" }], monthlyBudgetUsd: budget, perUserDaily: 1000,
    perUserPerMinute: 600, globalPerMinute: 10000 });
  // a Product Check feature cannot run without a monthly cap
  const e0 = mkEnv();
  await assert.rejects(putGateway(e0.DB, { enabled: true, features: { pc_fields: feat(null) } }), "a null (no) cap is refused for pc_fields");
  for (const id of ["pc_fields", "pc_claims", "pc_translate"]) {
    const g = await getGateway(e0.DB);
    assert.equal(typeof g.features[id].monthlyBudgetUsd, "number", id + ": the stored cap is a number (default 0 = nothing served)");
  }
  let calls = 0;
  const adapters = { anthropic: { id: "anthropic", capabilities: () => ({ vision: true, jsonSchema: "native" }), region: () => "test-region",
    async call(r) { calls++; return { ok: true, json: r.output && r.output.name === "pc_claims" ? { signals: [] } : FIELDS, model: "served",
      usage: { inputTokens: 2000, outputTokens: 1000 } }; } } };
  const siteverify = async () => new Response(JSON.stringify({ success: true, action: "ai", hostname: "site.example" }));
  const realNow = Date.now;
  const t0 = Math.floor(realNow() / 1000), day0 = t0 - ((t0 + BKK_OFFSET) % 86400) + 86400 + 60;
  const tap = async (env, i) => {
    Date.now = () => (day0 + i * 61) * 1000;
    const r = await handle(req("/v1/ai/pc_fields", { method: "POST",
      body: { consent: true, providers: ["anthropic"], mode: "text", input: { text: LABEL }, auto: true },
      headers: { "X-Turnstile-Token": "good", "X-Tester-Code": CODE }, origin: "https://site.example", ip: "198.51.100.41" }), env,
    { fetch: siteverify, aiAdapters: adapters, sleep: async () => {} });
    return { status: r.status, j: await r.json() };
  };
  try {
    // cap 0: refused before any provider call
    const e1 = mkEnv();
    await putGateway(e1.DB, { enabled: true, features: { pc_fields: feat(0) } });
    const r0 = await tap(e1, 0);
    assert.deepEqual([r0.status, r0.j.reason], [429, "budget"], "cap 0: refused as over budget " + JSON.stringify(r0.j));
    assert.equal(calls, 0, "no provider call over the cap");
    // a small cap: served until it is spent, then every later tap is refused with no provider call
    const e2 = mkEnv();
    await putGateway(e2.DB, { enabled: true, features: { pc_fields: feat(0.01) } });
    let refusedAt = -1;
    for (let i = 0; i < 60; i++) {
      const before = calls;
      const r = await tap(e2, i + 1);
      if (r.status === 200) { assert.equal(refusedAt, -1, "never served again after a budget refusal (tap " + (i + 1) + ")"); continue; }
      assert.deepEqual([r.status, r.j.reason], [429, "budget"], "only the budget refuses here " + JSON.stringify(r.j));
      assert.equal(calls, before, "a refused tap never reaches the provider");
      if (refusedAt < 0) refusedAt = i + 1;
    }
    assert.ok(refusedAt > 0, "a 0.01 USD cap is reached within 60 taps of 2,000 + 1,000 tokens (about 700 micro-USD each at the Haiku 5.5 table price)");
  } finally { Date.now = realNow; }
});
