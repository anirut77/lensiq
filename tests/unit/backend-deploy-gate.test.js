"use strict";
// tests/unit/backend-deploy-gate.test.js — closed-test controls of the test deployment (deploy plan B3, B4, B6, B8 and
// the shared-account request cap): backend/src/tester.js + the router, pc.js, med.js, the router adapter's pinned routes.
// Mocked providers and upstreams only: no key, no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const CODE = "Mango-CANARY-7731-zebra-code";
const WRONG = "wrong-code-CANARY-0042-quokka";
const ROUTER_KEY = "sk-or-test-" + "k".repeat(40);
const ORIGIN = "https://site.example";

const siteverify = async () => new Response(JSON.stringify({ success: true, action: "ai", hostname: "site.example" }));
const OUT_SCHEMA = { type: "object", properties: { answer: { type: "string", maxLength: 40 } }, required: ["answer"], additionalProperties: false };
const LABEL_TEXT = "LABEL-TEXT-CANARY paracetamol 500 mg นายสมชาย ใจดี 081-234-5678";
const IMAGE_B64 = "SU1BR0VDQU5BUllCWVRFUw==".repeat(8);
const FEATURE = {
  t_gate: { id: "t_gate", status: "live", imageCapable: true, label: { th: "ทดสอบ", en: "Test", zh: "测试" },
    build: (input, { mode }) => ({ system: "SYSTEM-PROMPT-CANARY", text: String((input && input.text) || ""), images: mode === "image" ? input.images : undefined,
      output: { name: "t_gate", schema: OUT_SCHEMA } }) }
};
function fakeAdapter() {
  const calls = [];
  return { calls, adapter: { id: "gemini", capabilities: () => ({ vision: true, jsonSchema: "native" }), region: () => "test-region",
    async call(r, entry) { calls.push({ r, entry }); return { ok: true, json: { answer: "ok" }, model: "served-x", usage: { inputTokens: 10, outputTokens: 5 }, providerRequestId: "p1" }; } } };
}
const envOf = (vars = {}) => createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", GEMINI_API_KEY: "g-test", TESTER_GATE: "required", TESTER_ACCESS_CODE: CODE, ...vars });
async function configure(env) {
  const { putGateway } = await import(B + "ai/settings.js");
  await putGateway(env.DB, { enabled: true, features: { t_gate: { enabled: true, chain: [{ provider: "gemini", model: "gemini-3.5-flash-lite" }], monthlyBudgetUsd: 5,
    perUserDaily: 100, perUserPerMinute: 100, globalPerMinute: 1000, imageModeAllowed: true } } }, { features: FEATURE });
}
/** One request through the real router, console output captured. */
async function call(env, path, o = {}) {
  const { handle } = await import(B + "index.js");
  const headers = { ...(o.code ? { "X-Tester-Code": o.code } : {}), ...(o.headers || {}) };
  const r = req(path, { method: o.method || "GET", body: o.body, headers, origin: o.origin === undefined ? ORIGIN : o.origin, ip: o.ip });
  const logs = [], orig = console.log;
  console.log = s => logs.push(String(s));
  let resp;
  try { resp = await handle(r, env, { aiFeatures: FEATURE, aiAdapters: o.adapters, fetch: o.fetch || siteverify, cache: o.cache }); } finally { console.log = orig; }
  let j = null;
  try { j = await resp.json(); } catch { /* 204 */ }
  return { status: resp.status, j, logs, headers: resp.headers };
}
const AI_BODY = { consent: true, providers: ["gemini"], mode: "text", input: { text: LABEL_TEXT } };
const aiPost = (env, o = {}) => call(env, "/v1/ai/t_gate", { method: "POST", body: o.body || AI_BODY, headers: { "X-Turnstile-Token": "tok" }, ...o });

// ---- B3: tester gate ---------------------------------------------------------------------------------------------

test("B3 gate: no code, a wrong code and the right code on every gated AI route", async () => {
  const env = envOf();
  await configure(env);
  const a = fakeAdapter();
  const ad = { gemini: a.adapter };
  // no code
  let r = await call(env, "/v1/ai/providers?feature=t_gate", { adapters: ad });
  assert.deepEqual([r.status, r.j.enabled, r.j.tester, r.j.chain], [200, false, true, []], "providers: nothing about the chain without a code");
  r = await aiPost(env, { adapters: ad });
  assert.deepEqual([r.status, r.j.fallback, r.j.reason], [403, true, "tester_required"]);
  r = await call(env, "/api/fortune/status");
  assert.deepEqual([r.j.enabled, r.j.tester], [false, true]);
  r = await call(env, "/api/fortune", { method: "POST", body: { consent: true, facts: {} } });
  assert.deepEqual([r.status, r.j.reason], [403, "tester_required"]);
  r = await call(env, "/v1/tester/check", { method: "POST", body: {} });
  assert.equal(r.status, 403);
  // wrong code
  r = await aiPost(env, { adapters: ad, code: WRONG });
  assert.deepEqual([r.status, r.j.reason], [403, "tester_required"]);
  assert.equal(a.calls.length, 0, "the provider was never called");
  // right code
  r = await call(env, "/v1/tester/check", { method: "POST", body: {}, code: CODE });
  assert.deepEqual([r.status, r.j.ok, r.j.required], [200, true, true]);
  r = await call(env, "/v1/ai/providers?feature=t_gate", { adapters: ad, code: CODE });
  assert.deepEqual([r.j.enabled, r.j.chain.length, r.j.tester], [true, 1, undefined]);
  r = await aiPost(env, { adapters: ad, code: CODE });
  assert.deepEqual([r.status, r.j.ok], [200, true], JSON.stringify(r.j));
  assert.equal(a.calls.length, 1);
  // the preflight allows the header
  r = await call(env, "/v1/ai/t_gate", { method: "OPTIONS" });
  assert.match(r.headers.get("Access-Control-Allow-Headers") || "", /X-Tester-Code/);
});

test("B3 gate: 'required' without a usable secret refuses everyone (fail closed); gate off behaves as before", async () => {
  // missing, short, or easy to guess (the same rules the owner's tool applies): nobody passes, even with that very value
  for (const secret of [undefined, "", "short-code", "aaaaaaaaaaaaaaaaaaaa", "1234567890123456", "abcdefghijklmnop", "lensiq-tester-2026-11", "MyPassword-2026-xx!", "xy12xy12xy12xy12xy12"]) {
    const env = envOf({ TESTER_ACCESS_CODE: secret });
    await configure(env);
    const r = await aiPost(env, { adapters: { gemini: fakeAdapter().adapter }, code: secret || CODE });
    assert.deepEqual([r.status, r.j.reason], [403, "tester_required"], "secret " + JSON.stringify(secret));
  }
  // a weak configured code raises one owner alert (not for a missing one), without the value
  (await import(B + "tester.js")).resetTesterState();
  const weak = envOf({ TESTER_ACCESS_CODE: "1234567890123456" });
  await configure(weak);
  for (let i = 0; i < 3; i++) await aiPost(weak, { adapters: { gemini: fakeAdapter().adapter }, code: "1234567890123456" });
  const al = (await weak.DB.prepare("SELECT kind, detail FROM alerts").all()).results;
  assert.deepEqual(al.map(a => a.kind), ["tester_code_weak"], "one alert per hour");
  assert.ok(!JSON.stringify(al).includes("1234567890123456"));
  const none = envOf({ TESTER_ACCESS_CODE: undefined });
  await aiPost(none, { adapters: { gemini: fakeAdapter().adapter } });
  assert.equal((await none.DB.prepare("SELECT kind FROM alerts").all()).results.length, 0);
  const T = await import(B + "tester.js");
  assert.equal(T.weakCode(CODE), "");
  assert.notEqual(T.weakCode("short-code"), "");
  const open = envOf({ TESTER_GATE: "", TESTER_ACCESS_CODE: undefined });
  await configure(open);
  const a = fakeAdapter();
  let r = await aiPost(open, { adapters: { gemini: a.adapter } });
  assert.deepEqual([r.status, r.j.ok], [200, true], "no gate: exactly the behaviour before this change");
  r = await call(open, "/v1/tester/check", { method: "POST", body: {} });
  assert.deepEqual([r.j.ok, r.j.required], [true, false]);
});

test("B3 gate: rotation and revocation take effect at once (the secret is read on every request)", async () => {
  const env = envOf();
  await configure(env);
  const ad = { gemini: fakeAdapter().adapter };
  assert.equal((await aiPost(env, { adapters: ad, code: CODE })).status, 200);
  env.TESTER_ACCESS_CODE = "a-brand-new-code-2026-11"; // wrangler secret put = a new Worker version with the new value
  let r = await aiPost(env, { adapters: ad, code: CODE, ip: "203.0.113.50" });
  assert.deepEqual([r.status, r.j.reason], [403, "tester_required"], "the old code is refused");
  assert.equal((await aiPost(env, { adapters: ad, code: "a-brand-new-code-2026-11", ip: "203.0.113.51" })).status, 200);
  delete env.TESTER_ACCESS_CODE; // wrangler secret delete = revoked, nothing replaces it
  r = await aiPost(env, { adapters: ad, code: "a-brand-new-code-2026-11", ip: "203.0.113.52" });
  assert.deepEqual([r.status, r.j.reason], [403, "tester_required"]);
});

test("B3 gate: wrong codes are throttled per caller and capped in total WITHOUT ever blocking the right code; a wrong attempt costs at most 1 read + 1 write", async () => {
  const T = await import(B + "tester.js");
  T.resetTesterState(); T.resetCapState();
  const env = envOf();
  await configure(env);
  const m = T.meterDb(env.DB);
  env.DB = m.db;
  const ad = { gemini: fakeAdapter().adapter };
  const check = (code, ip) => call(env, "/v1/tester/check", { method: "POST", body: {}, code, ip });
  // per caller: FAIL_CALLER wrong codes, then 429 that touches nothing
  for (let i = 0; i < T.FAIL_CALLER; i++) {
    const r0 = m.reads, w0 = m.writes;
    assert.equal((await check(WRONG + i, "198.51.100.9")).status, 403, "wrong #" + (i + 1));
    // the first one of the day also creates the day salt (1 read + 1 write more, once a day for all callers)
    assert.ok(m.reads - r0 <= (i ? 1 : 3) && m.writes - w0 <= (i ? 1 : 2), `wrong attempt #${i + 1} costs ${m.reads - r0} read(s), ${m.writes - w0} write(s)`);
  }
  const before = [m.reads, m.writes];
  for (let i = 0; i < 30; i++) {
    const r = await check(WRONG + "x" + i, "198.51.100.9");
    assert.deepEqual([r.status, r.j.reason], [429, "tester_locked"]);
    assert.ok(Number(r.headers.get("Retry-After")) > 0);
  }
  assert.deepEqual([m.reads, m.writes], before, "a throttled caller's further wrong codes touch D1 not at all (no unbounded write source)");
  // the right code ALWAYS passes: from the throttled caller too, and with no database access
  assert.equal((await check(CODE, "198.51.100.9")).status, 200, "a correct code is never blocked");
  assert.equal((await aiPost(env, { adapters: ad, code: CODE, ip: "198.51.100.9" })).status, 200);
  assert.equal((await check(CODE, "198.51.100.10")).status, 200);
  // a request without any code is not an attempt
  for (let i = 0; i < 12; i++) await aiPost(env, { adapters: ad, ip: "198.51.100.20" });
  assert.equal((await aiPost(env, { adapters: ad, code: CODE, ip: "198.51.100.20" })).status, 200);
  // in total: FAIL_GLOBAL wrong codes per hour from many callers; then every further wrong code is refused for free …
  T.resetTesterState();
  const env2 = envOf();
  await configure(env2);
  const m2 = T.meterDb(env2.DB);
  env2.DB = m2.db;
  for (let i = 0; i < T.FAIL_GLOBAL; i++) assert.equal((await call(env2, "/v1/tester/check", { method: "POST", body: {}, code: WRONG, ip: "10.1." + (i >> 8) + "." + (i & 255) })).status, 403);
  assert.ok(m2.writes <= T.FAIL_GLOBAL + 2, "at most one write per wrong attempt: " + m2.writes);
  const b2 = [m2.reads, m2.writes];
  for (let i = 0; i < 50; i++) assert.equal((await call(env2, "/v1/tester/check", { method: "POST", body: {}, code: WRONG, ip: "10.2.0." + i })).status, 429);
  assert.deepEqual([m2.reads, m2.writes], b2, "over the hourly total, wrong codes cost nothing");
  // … and the testers are NOT locked out: the right code still passes from any address (the old global lock refused it)
  for (const ip of ["10.2.0.1", "203.0.113.5", "198.51.100.9"]) assert.equal((await call(env2, "/v1/tester/check", { method: "POST", body: {}, code: CODE, ip })).status, 200, ip);
  assert.equal((await call(env2, "/v1/ai/providers?feature=t_gate", { adapters: ad, code: CODE, ip: "10.2.0.3" })).j.enabled, true);
  // without a database the in-memory limiter still throttles (fail-safe), and the right code still passes
  T.resetTesterState();
  const bare = { TESTER_GATE: "required", TESTER_ACCESS_CODE: CODE };
  const rq = (code, ip) => req("/v1/tester/check", { method: "POST", headers: { "X-Tester-Code": code }, ip });
  const orig = console.log; console.log = () => {};
  try {
    for (let i = 0; i < T.FAIL_CALLER; i++) assert.equal((await T.testerState(bare, rq(WRONG, "192.0.2.1"))).reason, "tester_required");
    assert.equal((await T.testerState(bare, rq(WRONG, "192.0.2.1"))).reason, "tester_locked");
    assert.equal((await T.testerState(bare, rq(CODE, "192.0.2.1"))).ok, true);
  } finally { console.log = orig; }
  // the comparison is constant-time over digests and comes before any limiter or database call
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "backend", "src", "tester.js"), "utf8");
  assert.match(src, /timingSafeEqual\(await sha256Hex\(/);
  assert.ok(src.indexOf("timingSafeEqual(await sha256Hex(") < src.indexOf("WRONG.callers.get(key)"), "correctness is decided first");
  T.resetTesterState();
});

test("B3 gate: the code never appears in a log line, an audit row, a rate-limit key or a response", async () => {
  const env = envOf();
  await configure(env);
  const ad = { gemini: fakeAdapter().adapter };
  const seen = [];
  for (const o of [{ code: CODE }, { code: WRONG }, { code: WRONG }, {}]) {
    for (const r of [await aiPost(env, { adapters: ad, ...o }), await call(env, "/v1/ai/providers?feature=t_gate", { adapters: ad, ...o }),
      await call(env, "/v1/tester/check", { method: "POST", body: {}, ...o })]) seen.push(JSON.stringify(r.j), ...r.logs, JSON.stringify([...r.headers]));
  }
  for (const t of ["audit_log", "rate_limits", "alerts", "settings"]) seen.push(JSON.stringify((await env.DB.prepare("SELECT * FROM " + t).all()).results));
  const all = seen.join("\n");
  for (const canary of [CODE, WRONG, "CANARY-7731", "CANARY-0042"]) assert.ok(!all.includes(canary), "leaked " + canary);
  assert.match(all, /tester\.refused/, "a refusal is logged as an event only");
});

// ---- B4: kill switch ---------------------------------------------------------------------------------------------

test("B4 kill switch: SERVICE_OFF refuses every public route with a clear answer; /health and the admin stay up", async () => {
  const up = fetchSpy();
  for (const v of ["1", "true", "on"]) {
    const env = envOf({ SERVICE_OFF: v });
    await configure(env);
    const a = fakeAdapter();
    for (const [path, o] of [["/v1/ai/t_gate", { method: "POST", body: AI_BODY, code: CODE }], ["/v1/ai/providers?feature=t_gate", { code: CODE }],
      ["/api/pc/status", {}], ["/api/pc/batch", { method: "POST", body: { lookups: [{ source: "openfda", q: "aspirin" }] } }], ["/api/med/openfda?q=aspirin", {}],
      ["/api/med/thfda?q=1A 12/34", { code: CODE }], ["/api/fortune/status", { code: CODE }], ["/api/fortune", { method: "POST", body: {}, code: CODE }],
      ["/v1/config", {}], ["/v1/events", { method: "POST", body: {} }], ["/v1/leads", { method: "POST", body: {} }], ["/v1/billing/plans", {}],
      ["/v1/tester/check", { method: "POST", body: {}, code: CODE }], ["/api/auth/nonce", { method: "POST", body: {} }]]) {
      const r = await call(env, path, { ...o, adapters: { gemini: a.adapter }, fetch: up.fetch });
      assert.deepEqual([r.status, r.j.off, r.j.fallback, r.j.reason], [503, true, true, "service_off"], v + " " + path);
      assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN, "the page can read the answer");
    }
    assert.equal(a.calls.length, 0);
    assert.equal(up.calls.length, 0, "no upstream source was called");
    const h = await call(env, "/health");
    assert.deepEqual([h.status, h.j], [200, { ok: true, off: true }]);
    assert.equal((await call(env, "/v1/ai/t_gate", { method: "OPTIONS" })).status, 204, "preflight still answers");
    const st = await call(env, "/admin/api/state", { origin: "https://api.example" });
    assert.deepEqual([st.status, st.j.bootstrapped], [200, false], "admin stays reachable");
  }
  for (const v of [undefined, "", "0", "false", "off"]) {
    const env = envOf({ SERVICE_OFF: v });
    assert.deepEqual((await call(env, "/health")).j, { ok: true }, "on: " + JSON.stringify(v));
    assert.equal((await call(env, "/api/pc/status")).status, 200);
  }
});

function fetchSpy() {
  const calls = [];
  return { calls, fetch: async (url, init = {}) => { calls.push(String(url)); if (String(url).includes("siteverify")) return siteverify(); return new Response("{}", { status: 599, ...init &&
    {} }); } };
}

// ---- shared account: daily request cap -----------------------------------------------------------------------------

test("request cap: over DAILY_REQUEST_CAP every public route answers 429 'try again tomorrow' (fail closed); /health, admin and no-cap installs unaffected", async () => {
  const T = await import(B + "tester.js");
  T.resetCapState();
  const env = envOf({ DAILY_REQUEST_CAP: "25", TESTER_GATE: "" });
  let okN = 0, refused = null;
  for (let i = 0; i < 40; i++) {
    const r = await call(env, "/api/pc/status");
    if (r.status === 200) okN++; else if (!refused) refused = r;
  }
  assert.ok(okN >= 25 - T.CAP_BATCH && okN <= 25, "about the cap is served, never more: " + okN);
  assert.deepEqual([refused.status, refused.j.code, refused.j.fallback], [429, "daily_cap", true]);
  assert.match(refused.j.error, /tomorrow/);
  const ra = Number(refused.headers.get("Retry-After"));
  assert.ok(ra > 0 && ra <= 86400);
  assert.equal((await call(env, "/health")).status, 200, "/health is not counted");
  assert.equal((await call(env, "/admin/api/state", { origin: "https://api.example" })).status, 200, "admin is not capped");
  const both = await env.DB.prepare("SELECT count FROM rate_limits WHERE key = 'cap:day'").first();
  const row = { count: both.count % T.W_UNIT }; // one row holds both day counters: requests + write statements x W_UNIT
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM rate_limits WHERE key LIKE 'cap:%'").first()).n, 1, "one counter row");
  const told = (await env.DB.prepare("SELECT kind, ref FROM alerts").all()).results;
  assert.deepEqual(told.map(a => [a.kind, a.ref]), [["daily_limit_reached", "daily_cap"]], "the owner is alerted once when the day's cap is reached");
  assert.ok(row.count >= 25 && row.count <= 26 + T.CAP_BATCH, "the counter stops moving once the cap is known: " + row.count);
  // a new isolate (state forgotten) learns the count on its first request and refuses at once
  T.resetCapState();
  assert.equal((await call(env, "/api/pc/status")).status, 429);
  // counter not usable -> refuse (fail closed)
  T.resetCapState();
  const broken = { ...envOf({ DAILY_REQUEST_CAP: "25", TESTER_GATE: "" }), DB: undefined };
  assert.equal((await call(broken, "/v1/billing/webhook/opn", { method: "POST", body: {} })).status, 429);
  // no cap configured (default, on-premise): nothing is counted
  T.resetCapState();
  const free = envOf({ TESTER_GATE: "" });
  for (let i = 0; i < 30; i++) assert.equal((await call(free, "/api/pc/status")).status, 200);
  assert.equal(await free.DB.prepare("SELECT count FROM rate_limits WHERE key = 'cap:day'").first(), null);
  T.resetCapState();
});

// ---- B8 / D2: testing-only lookup sources ---------------------------------------------------------------------------

const TESTING_HOSTS = /porta\.fda\.moph\.go\.th|ec\.europa\.eu\/safety-gate|webgate\.ec\.europa\.eu\/rasff/;
function lookupWorld() {
  const calls = [];
  return { calls, fetch: async url => { calls.push(String(url)); return new Response("<html>not the documented shape</html>", { status: 200 }); } };
}
const LOOKUPS = [{ source: "thfda", op: "drug", q: "1A 12/34" }, { source: "safetygate", q: "toy car" }, { source: "rasff", q: "peanut" }, { source: "openfda", q: "aspirin" }];

test("B8 lookups: a visitor without the code never triggers a Thai FDA web service, Safety Gate or RASFF call; a tester does", async () => {
  const env = envOf();
  // visitor: batch, single GETs and the medicine checker's Thai FDA lookup
  const w = lookupWorld();
  let r = await call(env, "/api/pc/batch", { method: "POST", body: { lookups: LOOKUPS }, fetch: w.fetch });
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.results.slice(0, 3).map(x => [x.status, x.could_not_check, x.reason]), [[503, true, "tester_required"], [503, true, "tester_required"], [503, true, "tester_required"]]);
  assert.notEqual(r.j.results[3].reason, "tester_required", "an open-licence source still answers a visitor");
  for (const p of ["/api/pc/thfda?op=drug&q=1A%2012/34", "/api/pc/safetygate?q=toy%20car", "/api/pc/rasff?q=peanut"]) {
    r = await call(env, p, { fetch: w.fetch });
    assert.deepEqual([r.status, r.j.reason], [503, "tester_required"], p);
  }
  r = await call(env, "/api/med/thfda?q=1A%2012/34", { fetch: w.fetch });
  assert.deepEqual([r.status, r.j.reason], [503, "tester_required"]);
  r = await call(env, "/api/pc/batch", { method: "POST", body: { lookups: LOOKUPS }, fetch: w.fetch, code: WRONG });
  assert.equal(r.j.results[0].reason, "tester_required", "a wrong code is a visitor");
  assert.ok(w.calls.length > 0, "the open source was asked");
  assert.deepEqual(w.calls.filter(u => TESTING_HOSTS.test(u)), [], "no testing-only source was contacted for a visitor");
  r = await call(env, "/api/pc/status");
  assert.deepEqual(["thfda", "safetygate", "rasff"].map(k => [r.j.sources[k].on, r.j.sources[k].off_reason]), Array(3).fill([false, "tester_required"]));
  assert.equal(r.j.sources.openfda.on, true);
  // tester
  const t = lookupWorld();
  r = await call(env, "/api/pc/batch", { method: "POST", body: { lookups: LOOKUPS }, fetch: t.fetch, code: CODE, ip: "203.0.113.90" });
  assert.equal(t.calls.filter(u => TESTING_HOSTS.test(u)).length, 3, "all three testing-only sources were asked for a tester");
  assert.ok(r.j.results.every(x => x.reason !== "tester_required"));
  r = await call(env, "/api/pc/status", { code: CODE, ip: "203.0.113.90" });
  assert.equal(r.j.sources.thfda.on, true);
  await call(env, "/api/med/thfda?q=1A%2012/34", { fetch: t.fetch, code: CODE, ip: "203.0.113.90" });
  assert.equal(t.calls.filter(u => /porta\.fda/.test(u)).length, 2);
  // gate off (demo / on-premise default): unchanged behaviour, everyone reaches the sources
  const open = envOf({ TESTER_GATE: "" });
  const o = lookupWorld();
  await call(open, "/api/pc/batch", { method: "POST", body: { lookups: LOOKUPS }, fetch: o.fetch });
  assert.equal(o.calls.filter(u => TESTING_HOSTS.test(u)).length, 3);
});

// ---- logs: no image bytes, no label text, no personal data ----------------------------------------------------------

test("logs: AI and lookup log lines carry no image bytes, no label text, no personal data, no query text and no caller address", async () => {
  const env = envOf();
  await configure(env);
  const a = fakeAdapter();
  const ip = "192.0.2.77";
  const lines = [];
  const body = { consent: true, providers: ["gemini"], mode: "image", input: { text: LABEL_TEXT, images: [{ mime: "image/jpeg", base64: IMAGE_B64, width: 640, height: 480 }] } };
  let r = await aiPost(env, { adapters: { gemini: a.adapter }, code: CODE, body, ip });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(a.calls[0].r.images.length, 1, "the image did reach the (mock) provider, so the log check is meaningful");
  lines.push(...r.logs);
  const w = lookupWorld();
  r = await call(env, "/api/pc/batch", { method: "POST", code: CODE, ip, fetch: w.fetch,
    body: { lookups: [{ source: "thfda", op: "drug", q: "QUERYCANARY 1A 12/34" }, { source: "openfda", q: "QUERYCANARY aspirin" }, { source: "rasff", q: "QUERYCANARY peanut" }] } });
  lines.push(...r.logs);
  r = await call(env, "/api/med/thfda?q=QUERYCANARY%201A%2012/34", { code: CODE, ip, fetch: w.fetch });
  lines.push(...r.logs);
  assert.ok(lines.some(l => /"event":"ai\.attempt"/.test(l)) && lines.some(l => /"event":"pc\.lookup"/.test(l)), "the AI and lookup log lines were produced");
  const all = lines.join("\n");
  for (const bad of [IMAGE_B64, IMAGE_B64.slice(0, 24), "LABEL-TEXT-CANARY", "paracetamol", "สมชาย", "081-234-5678", "SYSTEM-PROMPT-CANARY", "QUERYCANARY", "12/34", ip, CODE, "g-test"]) {
    assert.ok(!all.includes(bad), "log leaked: " + bad);
  }
  for (const l of lines) {
    const j = JSON.parse(l);
    for (const [k, v] of Object.entries(j)) assert.ok(typeof v !== "string" || v.length <= 80, `log field ${k} is a short scalar`);
    for (const k of Object.keys(j)) assert.doesNotMatch(k, /text|image|base64|prompt|input|query|^q$|name|phone|address|ip|email/i, "log field name " + k);
  }
  // nothing of it is stored either
  const stored = JSON.stringify(await Promise.all(["rate_limits", "audit_log", "alerts", "ai_usage", "ai_budget"].map(async t => {
    try { return (await env.DB.prepare("SELECT * FROM " + t).all()).results; } catch { return []; }
  })));
  for (const bad of [IMAGE_B64.slice(0, 24), "LABEL-TEXT-CANARY", "สมชาย", "QUERYCANARY", ip]) assert.ok(!stored.includes(bad), "stored: " + bad);
});

// ---- B6: pinned serving provider -----------------------------------------------------------------------------------

const oaiOk = (provider, model) => new Response(JSON.stringify({ id: "gen-1", model, ...(provider ? { provider } : {}),
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ answer: "ok" }) } }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 } }),
    { headers: { "Content-Type": "application/json" } });
async function routerSetup(pin) {
  const env = envOf({ OPENROUTER_API_KEY: ROUTER_KEY, AI_ROUTE_PIN: pin ? "required" : "", TESTER_GATE: "" });
  const { putGateway } = await import(B + "ai/settings.js");
  await putGateway(env.DB, { enabled: true, features: { t_gate: { enabled: true, monthlyBudgetUsd: 5, perUserDaily: 100, perUserPerMinute: 100, globalPerMinute: 1000,
    chain: [{ provider: "openrouter", model: "anthropic/claude-haiku-5.5", effort: "low" }, { provider: "openrouter", model: "openai/gpt-6-luna" }, { provider: "openrouter",
      model: "z-ai/glm-5.3-flash" }] } } },
  { features: FEATURE });
  return env;
}
async function routerRun(env, answer) {
  const { runFeature } = await import(B + "ai/gateway.js");
  const bodies = [];
  const aiFetch = async (url, init) => { const b = JSON.parse(init.body); bodies.push(b); return answer(b); };
  const logs = [], orig = console.log;
  console.log = s => logs.push(String(s));
  let r;
  try { r = await runFeature(env, "t_gate", FEATURE.t_gate.build({ text: "hello" }, { mode: "text" }), { deps: { aiFeatures: FEATURE, aiFetch, sleep: async () => {} } }); }
  finally { console.log = orig; }
  return { r, bodies, logs };
}

test("B6 pin: with AI_ROUTE_PIN the request carries provider.only + allow_fallbacks:false next to zdr / data_collection deny, and nothing in the request can override it", async () => {
  const env = await routerSetup(true);
  const { r, bodies } = await routerRun(env, b => oaiOk("Google Vertex", b.model));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([bodies[0].provider.only, bodies[0].provider.allow_fallbacks, bodies[0].provider.zdr, bodies[0].provider.data_collection, bodies[0].provider.require_parameters],
    [["google-vertex"], false, true, "deny", true]);
  assert.equal(r.routedProvider, "Google Vertex");
  const O = await import(B + "ai/adapters/openrouter.js");
  const sneaky = { system: "s", text: "t", maxOutputTokens: 100, output: { name: "x", schema: OUT_SCHEMA }, provider: { only: ["evil"], allow_fallbacks: true, zdr: false } };
  const b = O.adapter.buildBody(sneaky, { model: "openai/gpt-6-luna" }, { config: { pinRoutes: true } });
  assert.deepEqual([b.provider.only, b.provider.allow_fallbacks, b.provider.zdr], [["azure"], false, true]);
  // an unpinned model keeps today's body (no `only`)
  assert.equal(O.adapter.buildBody(sneaky, { model: "z-ai/glm-5.3-flash" }, { config: { pinRoutes: true } }).provider.only, undefined);
  // pin off (repo default): body unchanged from before this change
  const off = await routerSetup(false);
  const x = await routerRun(off, bd => oaiOk("OpenAI", bd.model));
  assert.equal(x.r.ok, true);
  assert.deepEqual([x.bodies[0].provider.only, x.bodies[0].provider.allow_fallbacks], [undefined, undefined]);
});

test("B6 pin: an answer served by another provider than the pinned one is rejected and the owner is alerted; a model WITHOUT a pin is never offered or called", async () => {
  const env = await routerSetup(true);
  // 1st entry answers from an unnamed provider, 2nd from its pinned one
  const { r, bodies, logs } = await routerRun(env, b => (b.model.startsWith("anthropic/") ? oaiOk("SomeOtherCloud", b.model) : oaiOk("Azure", b.model)));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.model, r.routedProvider], ["openai/gpt-6-luna", "Azure"]);
  assert.deepEqual(r.attempts.map(a => [a.model, a.kind, a.billed]), [["anthropic/claude-haiku-5.5", "refusal", true], ["openai/gpt-6-luna", "ok", true]]);
  assert.deepEqual(bodies.map(b => b.provider.only), [["google-vertex"], ["azure"]]);
  let al = (await env.DB.prepare("SELECT kind, detail FROM alerts").all()).results;
  assert.ok(al.some(a => a.kind === "ai_config_error" && /route_mismatch/.test(a.detail)), JSON.stringify(al));
  assert.ok(al.some(a => /route_not_pinned/.test(a.detail)), "the unpinned chain entry is reported to the owner");
  assert.ok(logs.some(l => /"route_mismatch":true/.test(l)));
  // only the exact names seen in real answers are accepted: plain "Google" (the name Google's other API could carry) is not
  const envG = await routerSetup(true);
  const g = await routerRun(envG, b => (b.model.startsWith("anthropic/") ? oaiOk("Google", b.model) : oaiOk("Azure", b.model)));
  assert.deepEqual(g.r.attempts.map(a => a.kind), ["refusal", "ok"]);
  const O = await import(B + "ai/adapters/openrouter.js");
  for (const [name, ok] of [["Google Vertex", true], ["Google Vertex AI", true], ["Google", false], ["Google AI Studio", false], ["Amazon Bedrock", false], ["Anthropic", false]]) {
    assert.equal(O.ROUTES["anthropic/claude-haiku-5.5"].served.test(name), ok, name);
  }
  for (const [name, ok] of [["Azure", true], ["Microsoft Azure", true], ["OpenAI", false]]) assert.equal(O.ROUTES["openai/gpt-6-luna"].served.test(name), ok, name);
  // no provider name at all is a mismatch; and the third chain entry (no pin) is NEVER called while pinning is required
  const env2 = await routerSetup(true);
  const y = await routerRun(env2, b => oaiOk(b.model === "z-ai/glm-5.3-flash" ? "Whoever" : "", b.model));
  assert.equal(y.r.ok, false);
  assert.deepEqual(y.r.attempts.map(a => a.model), ["anthropic/claude-haiku-5.5", "openai/gpt-6-luna"], "the unpinned model was never tried");
  assert.ok(y.bodies.every(b => b.model !== "z-ai/glm-5.3-flash"), "nothing was sent for a model whose serving provider cannot be named");
  // a chain of unpinned models only: nothing runs at all
  const { putGateway } = await import(B + "ai/settings.js");
  await putGateway(env2.DB, { features: { t_gate: { chain: [{ provider: "openrouter", model: "z-ai/glm-5.3-flash" }, { provider: "openrouter", model: "qwen/qwen3.8-27b" }] } } },
    { features: FEATURE });
  const z = await routerRun(env2, b => oaiOk("Whoever", b.model));
  assert.deepEqual([z.r.ok, z.r.reason, z.bodies.length], [false, "not_configured", 0]);
  assert.deepEqual(await O.adapter.call({ system: "s", text: "t", maxOutputTokens: 50, output: { name: "x", schema: OUT_SCHEMA } }, { model: "z-ai/glm-5.3-flash" },
    { key: "k", timeoutMs: 1000, config: { pinRoutes: true }, fetchImpl: async () => { throw new Error("must not be called"); } }), { ok: false, kind: "unsupported" });
  // pin off (repo default): any model is usable, as before
  const off = await routerSetup(false);
  await putGateway(off.DB, { features: { t_gate: { chain: [{ provider: "openrouter", model: "z-ai/glm-5.3-flash" }] } } }, { features: FEATURE });
  assert.equal((await routerRun(off, b => oaiOk("Whoever", b.model))).r.ok, true);
});

test("B6 consent data: /v1/ai/providers names the pinned serving provider and place in TH / EN / ZH and lists pinned models only; admin shows the usable models", async () => {
  const env = await routerSetup(true);
  const r = await call(env, "/v1/ai/providers?feature=t_gate");
  assert.deepEqual(r.j.chain.map(c => c.model), ["anthropic/claude-haiku-5.5", "openai/gpt-6-luna"], "the unpinned third entry is not offered for consent");
  const [haiku, luna] = r.j.chain;
  assert.deepEqual([haiku.routed.slug, luna.routed.slug], ["google-vertex", "azure"]);
  for (const l of ["th", "en", "zh"]) {
    assert.match(haiku.routed.name[l], /Google Cloud Vertex AI/);
    assert.match(luna.routed.name[l], /Microsoft Azure/);
    assert.ok(haiku.routed.region[l].length > 10 && luna.routed.region[l].length > 10);
    assert.match(haiku.name[l], /OpenRouter/);
  }
  assert.match(haiku.routed.region.en, /outside Thailand/);
  assert.match(haiku.routed.region.en, /country not fixed/, "no country is promised while the region is not fixed");
  const { adminGateway } = await import(B + "ai/gateway.js");
  const ad = (await adminGateway(env)).providers;
  assert.deepEqual(ad.find(p => p.id === "openrouter").usable_models, ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5", "openai/gpt-6-luna", "openai/gpt-6.1-terra"]);
  assert.equal(ad.find(p => p.id === "anthropic").usable_models, null);
  const off = await routerSetup(false);
  const r2 = await call(off, "/v1/ai/providers?feature=t_gate");
  assert.deepEqual([r2.j.chain.length, r2.j.chain.every(c => c.routed === undefined)], [3, true], "no pin configured: the consent data is exactly as before");
  assert.equal((await adminGateway(off)).providers.find(p => p.id === "openrouter").usable_models, null);
  const fs = require("node:fs"), path = require("node:path"), root = path.join(__dirname, "..", "..");
  assert.match(fs.readFileSync(path.join(root, "admin.js"), "utf8"), /usable_models[\s\S]*adg\.pin\.only/);
  for (const f of ["en-admin.js", "zh-admin.js"]) assert.ok(fs.readFileSync(path.join(root, "i18n", f), "utf8").includes('"adg.pin.only"'), f);
});

// ---- the deployment's public route allow-list, D1 write budget, strict limits, Referer, admin ceiling ------------------

// 2026-11-12, explicit owner decision: the quote form is ON (/v1/leads) and the owner's LINE test route is open
const TEST_ROUTES = "/health,/health/deep,/health/notify-test,/v1/config,/v1/tester/check,/v1/leads,/v1/ai/*,/api/pc/*,/api/med/*";
/** env.DB replaced by a statement counter (the Worker's own meter): {reads, writes} of everything that runs on it. */
async function counted(env) {
  const T = await import(B + "tester.js");
  const m = T.meterDb(env.DB);
  env.DB = m.db;
  return m;
}
async function resetAll() { const T = await import(B + "tester.js"); T.resetCapState(); T.resetTesterState(); T.resetAdminState(); return T; }

test("route allow-list: every public route that is not in PUBLIC_ROUTES is refused with ZERO D1 statements, also for a forged Origin with a full analytics batch", async () => {
  await resetAll();
  const env = envOf({ PUBLIC_ROUTES: TEST_ROUTES });
  await configure(env);
  const m = await counted(env);
  const events = { events: Array.from({ length: 50 }, (_, i) => ({ t: "page_view", feature: "medicine", n: i })) };
  const OFF = [["/v1/events", { method: "POST", body: events }], ["/v1/events", { method: "POST", body: JSON.stringify(events), headers: { "Content-Type": "text/plain" } }],
    ["/v1/csp-report", { method: "POST", body: {} }],
    ["/v1/billing/plans", {}], ["/v1/billing/checkout", { method: "POST", body: {} }], ["/v1/billing/claim", { method: "POST", body: {} }],
    ["/v1/billing/payments/" + "a".repeat(32), {}], ["/v1/billing/webhook/opn", { method: "POST", body: {} }], ["/api/auth/nonce", { method: "POST", body: {} }],
    ["/api/auth/google", { method: "POST", body: {} }], ["/api/me", {}], ["/api/me/export", {}], ["/api/fortune/status", { code: CODE }],
    ["/api/fortune", { method: "POST", body: { consent: true, facts: {} }, code: CODE }], ["/v1/unknown", {}]];
  for (const [path, o] of OFF) {
    for (const origin of [ORIGIN, "https://forged.example", null]) {
      const r = await call(env, path, { ...o, origin });
      assert.deepEqual([r.status, r.j.code, r.j.fallback], [404, "route_off", true], `${path} from ${origin}`);
    }
  }
  assert.deepEqual([m.reads, m.writes], [0, 0], "no disabled route touched D1");
  for (const t of ["events", "leads", "csp_reports", "rate_limits", "daily_salts"]) {
    let n = 0;
    try { n = (await env.DB._raw.prepare("SELECT count(*) AS n FROM " + t).get()).n; } catch { /* table name differs: nothing was written anyway */ }
    assert.equal(n, 0, t + " is empty");
  }
  // /v1/config says what is off, without D1
  const c = await call(env, "/v1/config");
  assert.deepEqual([c.status, c.j.analytics, c.j.free_mode, c.j.pricing_enabled, c.j.billing_enabled, c.j.membership], [200, false, true, false, false, { required: false,
    google_client_id: null }]);
  assert.deepEqual([m.reads, m.writes], [0, 0]);
  // what the medicine page uses still works
  assert.equal((await call(env, "/health")).status, 200);
  assert.equal((await call(env, "/api/pc/status")).status, 200);
  assert.equal((await call(env, "/api/med/status")).status, 200);
  assert.equal((await call(env, "/v1/tester/check", { method: "POST", body: {}, code: CODE })).status, 200);
  assert.equal((await aiPost(env, { adapters: { gemini: fakeAdapter().adapter }, code: CODE })).status, 200);
  assert.equal((await call(env, "/v1/events", { method: "OPTIONS" })).status, 204, "a preflight is answered (the page can then read the 404)");
  // the default configuration (no allow-list) is unchanged: analytics reported on, routes reachable
  const def = envOf({ TESTER_GATE: "" });
  const d = await call(def, "/v1/config");
  assert.deepEqual([d.j.analytics, "consent_version" in d.j.membership], [true, true]);
  assert.notEqual((await call(def, "/v1/billing/plans")).status, 404);
  const T = await import(B + "tester.js");
  assert.deepEqual([T.routeEnabled({ PUBLIC_ROUTES: "/a,/b/*" }, "/a"), T.routeEnabled({ PUBLIC_ROUTES: "/a,/b/*" }, "/a/x"), T.routeEnabled({ PUBLIC_ROUTES: "/a,/b/*" }, "/b/x/y"),
    T.routeEnabled({ PUBLIC_ROUTES: "/a,/b/*" }, "/bb"), T.routeEnabled({ PUBLIC_ROUTES: "/a" }, "/health"), T.routeEnabled({}, "/anything")], [true, false, true, false, true, true]);
  // the test environment's own list
  const toml = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "backend", "wrangler.toml"), "utf8");
  assert.ok(toml.includes(`PUBLIC_ROUTES = "${TEST_ROUTES}"`), "wrangler.toml [env.test] carries exactly this list");
  assert.match(toml, /D1_WRITE_BUDGET = "5000"[\s\S]*ADMIN_UNAUTH_WRITES_HOUR = "120"/);
  assert.doesNotMatch(toml, /REFERER/);
});

test("D1 cost: statements per request are measured and bounded; the daily write budget fails closed for every counted public route", async () => {
  const T = await resetAll();
  const base = { PUBLIC_ROUTES: TEST_ROUTES, DAILY_REQUEST_CAP: "20000", D1_WRITE_BUDGET: "5000" };
  const env = envOf(base);
  await configure(env);
  const m = await counted(env);
  const raw = async fn => { const r0 = m.reads, w0 = m.writes; const r = await fn(); return { reads: m.reads - r0, writes: m.writes - w0, status: r.status }; };
  // the request / write counters are flushed on an isolate's first request and then every CAP_BATCH requests (2 upserts);
  // each route is measured right after such a flush, so the figures are the route's own statements
  const cost = async fn => { T.resetCapState(); await call(env, "/v1/config"); return raw(fn); };
  const w = lookupWorld(), ad = { gemini: fakeAdapter().adapter };
  const table = {};
  table["first request of an isolate (counter flush)"] = await raw(() => call(env, "/v1/config"));
  table["GET /api/pc/status"] = await cost(() => call(env, "/api/pc/status"));
  table["GET /v1/config"] = await cost(() => call(env, "/v1/config"));
  table["POST /api/pc/batch (4 lookups, visitor)"] = await cost(() => call(env, "/api/pc/batch", { method: "POST", body: { lookups: LOOKUPS }, fetch: w.fetch }));
  table["POST /api/pc/batch (again)"] = await cost(() => call(env, "/api/pc/batch", { method: "POST", body: { lookups: LOOKUPS }, fetch: w.fetch }));
  table["GET /api/med/openfda"] = await cost(() => call(env, "/api/med/openfda?q=aspirin", { fetch: w.fetch }));
  table["POST /v1/tester/check, right code"] = await cost(() => call(env, "/v1/tester/check", { method: "POST", body: {}, code: CODE }));
  table["POST /v1/tester/check, wrong code"] = await cost(() => call(env, "/v1/tester/check", { method: "POST", body: {}, code: WRONG, ip: "198.51.100.77" }));
  table["GET /v1/ai/providers, right code"] = await cost(() => call(env, "/v1/ai/providers?feature=t_gate", { adapters: ad, code: CODE }));
  table["POST /v1/ai/:feature, success"] = await cost(() => aiPost(env, { adapters: ad, code: CODE }));
  table["POST /v1/ai/:feature, no code"] = await cost(() => aiPost(env, { adapters: ad }));
  table["a route that is off"] = await cost(() => call(env, "/v1/events", { method: "POST", body: {} }));
  if (process.env.LQ_PRINT_D1_COST) console.log(JSON.stringify(table, null, 1));
  // measured 2026-11-11 (statements; one row each): the bounds below are the measured values, +1 where a provider retry can add one
  const lim = { "GET /api/pc/status": [1, 0], "GET /v1/config": [0, 0], "POST /api/pc/batch (4 lookups, visitor)": [3, 2], "POST /api/pc/batch (again)": [2, 1],
    "GET /api/med/openfda": [1, 1], "POST /v1/tester/check, right code": [0, 0], "POST /v1/tester/check, wrong code": [1, 1], "GET /v1/ai/providers, right code": [2, 0],
    "POST /v1/ai/:feature, success": [5, 15], "POST /v1/ai/:feature, no code": [0, 0], "a route that is off": [0, 0] };
  for (const [k, [r, wmax]] of Object.entries(lim)) assert.ok(table[k].reads <= r && table[k].writes <= wmax, `${k}: ${JSON.stringify(table[k])} within ${r} reads / ${wmax} writes`);
  assert.deepEqual([table["first request of an isolate (counter flush)"].reads, table["first request of an isolate (counter flush)"].writes], [0, 1],
    "the counter flush: ONE upsert per 10 requests (0.1 write statements per request)");
  assert.deepEqual([table["POST /v1/tester/check, right code"].status, table["POST /v1/ai/:feature, success"].status], [200, 200]);

  // the budget: a small one is reached by AI calls; then every counted route refuses, and D1 is no longer written
  T.resetCapState();
  const env2 = envOf({ ...base, D1_WRITE_BUDGET: "60" });
  await configure(env2);
  const m2 = await counted(env2);
  let served = 0, refused = null;
  for (let i = 0; i < 40 && !refused; i++) { const r = await aiPost(env2, { adapters: ad, code: CODE, ip: "203.0.113." + (i + 1) }); if (r.status === 200) served++; else refused = r; }
  assert.ok(refused && served >= 2 && served <= 20, `the budget stops AI calls after ${served}`);
  assert.deepEqual([refused.status, refused.j.code, refused.j.fallback], [429, "d1_budget", true]);
  assert.match(refused.j.error, /tomorrow/);
  assert.ok(Number(refused.headers.get("Retry-After")) > 0);
  const total = m2.writes;
  assert.ok(total <= 60 + CAP_OVERSHOOT, `writes stop near the budget: ${total}`);
  for (const [path, o] of [["/api/pc/status", {}], ["/api/pc/batch", { method: "POST", body: { lookups: LOOKUPS }, fetch: w.fetch }], ["/v1/tester/check", { method: "POST", body: {},
    code: WRONG }],
    ["/v1/ai/providers?feature=t_gate", { code: CODE }], ["/api/med/openfda?q=aspirin", {}], ["/v1/config", {}]]) {
    const r = await call(env2, path, { ...o, adapters: ad });
    assert.deepEqual([r.status, r.j.code], [429, "d1_budget"], path);
  }
  assert.equal(m2.writes, total, "after the budget is reached, refused requests write nothing");
  const al2 = (await env2.DB._raw.prepare("SELECT kind, ref FROM alerts WHERE kind = 'daily_limit_reached'").all());
  assert.deepEqual(al2.map(a => a.ref), ["d1_budget"], "the owner is alerted once (admin -> Alerts, and the webhook when set)");
  assert.equal((await call(env2, "/health")).status, 200);
  assert.equal((await call(env2, "/admin/api/state", { origin: "https://api.example" })).status, 200, "the admin is not blocked by the budget");
  // a new isolate learns the state with one flush and refuses at once
  T.resetCapState();
  assert.equal((await call(env2, "/api/pc/status")).status, 429);
  T.resetCapState();
});
const CAP_OVERSHOOT = 10 * 16 + 4 + 1; // + the alert row // at most CAP_BATCH requests' writes are pending in an isolate when the budget is crossed

test("limits are parsed strictly: an invalid DAILY_REQUEST_CAP / D1_WRITE_BUDGET refuses (never 'no limit'), with a config alert and no D1", async () => {
  const T = await resetAll();
  assert.deepEqual(["", undefined, null, "  "].map(v => T.strictLimit(v).set), [false, false, false, false]);
  for (const bad of ["abc", "-5", "0", "200000", "50001", "20,000", "2e4", "1.5", "0x10", " 12 34 ", "١٢٣"]) assert.equal(T.strictLimit(bad).invalid, true, JSON.stringify(bad));
  assert.deepEqual([T.strictLimit("20000").n, T.strictLimit(" 5000 ").n, T.strictLimit("50000").n, T.strictLimit(1).n], [20000, 5000, 50000, 1]);
  for (const vars of [{ DAILY_REQUEST_CAP: "20,000" }, { DAILY_REQUEST_CAP: "abc" }, { DAILY_REQUEST_CAP: "-5" }, { DAILY_REQUEST_CAP: "200000" }, { DAILY_REQUEST_CAP: "20000",
    D1_WRITE_BUDGET: "lots" }]) {
    T.resetCapState();
    const env = envOf({ TESTER_GATE: "", ...vars });
    const m = await counted(env);
    const r = await call(env, "/api/pc/status");
    assert.deepEqual([r.status, r.j.code], [503, "config_invalid"], JSON.stringify(vars));
    assert.ok(r.logs.some(l => /"event":"alert\.config_invalid"/.test(l)), "the owner is told once");
    assert.equal((await call(env, "/api/pc/status")).logs.length, 0, "…once per isolate");
    assert.deepEqual([m.reads, m.writes], [0, 0]);
    assert.equal((await call(env, "/health")).status, 200);
  }
  T.resetCapState();
});

test("the Referer is NOT used: the right code passes with no Referer, an origin-only Referer and a Referer of another path (Safari / iOS, Firefox strict, Brave send no path)", async () => {
  await resetAll();
  // the deployed vars, exactly as wrangler.toml [env.test] has them
  const toml = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "backend", "wrangler.toml"), "utf8");
  const vars = Object.fromEntries([...toml.slice(toml.indexOf("[env.test.vars]"), toml.indexOf("[[env.test.d1_databases]]")).matchAll(/^([A-Z0-9_]+) = "(.*)"$/gm)].map(m => [m[1], m[2]]));
  assert.ok(!("SITE_REFERER_PREFIX" in vars), "no Referer setting exists");
  const env = envOf({ ...vars, ALLOWED_ORIGINS: ORIGIN, TURNSTILE_HOSTNAMES: "site.example" });
  await configure(env);
  const ad = { gemini: fakeAdapter().adapter };
  for (const ref of [undefined, "https://site.example/", "https://site.example", "https://site.example/some-other-project/page.html", "https://site.example/lensiq/medicine.html?tester=1",
    "https://elsewhere.example/x"]) {
    const headers = { "X-Turnstile-Token": "tok", ...(ref ? { Referer: ref } : {}) };
    let r = await call(env, "/v1/tester/check", { method: "POST", body: {}, code: CODE, headers });
    assert.deepEqual([r.status, r.j.ok], [200, true], "tester check, Referer " + ref);
    r = await call(env, "/v1/ai/t_gate", { method: "POST", body: AI_BODY, code: CODE, adapters: ad, headers });
    assert.equal(r.status, 200, "AI call, Referer " + ref + ": " + JSON.stringify(r.j));
    assert.equal((await call(env, "/api/pc/status", { headers, code: CODE })).j.sources.thfda.on, true, "lookups, Referer " + ref);
    assert.equal((await call(env, "/api/pc/status", { headers })).status, 200);
  }
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "backend", "src", "index.js"), "utf8") +
    require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "backend", "src", "tester.js"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /headers\.get\("Referer"\)|site_path/i, "no decision reads the Referer");
  const root = require("node:path").join(__dirname, "..", "..");
  for (const p of ["lensiq-tester.js", "lensiq-ai.js", "lensiq-pc-lookup.js", "medicine.js"]) {
    assert.doesNotMatch(require("node:fs").readFileSync(require("node:path").join(root, p), "utf8"), /no-referrer-when-downgrade|unsafe-url/, p + " does not widen the referrer");
  }
});

const ADMIN_TOKEN = "gate-admin-bootstrap-token-0123456789abcdef";
const ADMIN_PW = "the owner's long password 42";
test("admin: a stranger cannot lock the owner out and cannot make failed sign-ins write without bound; attempts per caller are capped before any hashing", async () => {
  const T = await resetAll();
  const CEIL = 40;
  const env = envOf({ ADMIN_UNAUTH_WRITES_HOUR: String(CEIL), ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 7).toString("base64") });
  const admin = (path, o = {}) => call(env, "/admin/api" + path, { origin: "https://api.example", ...o });
  // the owner account (first run of the back office)
  let r = await admin("/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW }, ip: "203.0.113.1" });
  assert.equal(r.status, 201, JSON.stringify(r.j));
  T.resetAdminState();
  const m = await counted(env);
  // 200 hostile unauthenticated requests from 200 addresses: wrong passwords, the right user name, TOTP-shaped bodies, bootstraps, state
  let refusedBusy = 0;
  for (let i = 0; i < 200; i++) {
    const ip = "10.9." + (i >> 8) + "." + (i & 255);
    const kind = i % 5;
    if (kind === 4) r = await admin("/bootstrap", { method: "POST", body: { token: "x".repeat(40), username: "evil", password: "p".repeat(16) }, ip });
    else if (kind === 3) r = await admin("/state", { ip });
    else r = await admin("/login", { method: "POST", ip, body: { username: kind === 0 ? "owner" : "admin" + i, password: "wrong password " + i, ...(kind === 2 ? { totp: "123456" } : {}) } });
    if (r.j && r.j.code === "admin_busy") refusedBusy++;
    assert.ok(kind === 3 ? r.status === 200 : r.status >= 400, "hostile #" + i + " got " + r.status);
  }
  assert.equal(refusedBusy, 0, "no hourly ceiling refuses anybody (each address is under its own attempt limit)");
  const hostileWrites = m.writes;
  assert.ok(hostileWrites <= CEIL + 8, `failed sign-ins stop writing once the hour's ceiling is reached: ${hostileWrites} writes for 200 requests (ceiling ${CEIL})`);
  // the owner, from an address never seen, without a device cookie: the correct password signs in
  r = await admin("/login", { method: "POST", ip: "198.51.100.200", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } });
  assert.deepEqual([r.status, r.j.ok, typeof r.j.token], [200, true, "string"], "the owner is not locked out: " + JSON.stringify(r.j));
  // and the session it got is real (its rows were written although failures no longer are)
  const me = await admin("/me", { headers: { Authorization: "Bearer " + r.j.token } });
  assert.deepEqual([me.status, me.j.username], [200, "owner"]);
  assert.ok(m.writes - hostileWrites >= 2 && m.writes - hostileWrites <= 8, "the successful sign-in wrote its session rows: " + (m.writes - hostileWrites));
  // a wrong password after that still fails and still writes nothing
  const w0 = m.writes;
  assert.equal((await admin("/login", { method: "POST", ip: "198.51.100.201", body: { username: "owner", password: "not the password" } })).status, 401);
  assert.equal(m.writes, w0);
  // /state is answered from memory while over the ceiling
  const r0 = m.reads;
  assert.deepEqual((await admin("/state", { ip: "198.51.100.202" })).j, { bootstrapped: true });
  assert.equal(m.reads, r0);
  // CPU guard: one address gets ADMIN_CALLER_MAX attempts per 15 minutes; the rest are refused before hashing or D1
  const before = [m.reads, m.writes];
  let busyN = 0;
  const t0 = Date.now();
  for (let i = 0; i < T.ADMIN_CALLER_MAX + 40; i++) {
    const x = await admin("/login", { method: "POST", ip: "192.0.2.66", body: { username: "owner", password: "guess " + i } });
    if (x.j.code === "admin_busy") { busyN++; assert.ok(Number(x.headers.get("Retry-After")) > 0); }
  }
  assert.equal(busyN, 40, "attempts beyond the per-caller limit are refused");
  assert.equal(m.writes, before[1], "and they write nothing");
  assert.ok(Date.now() - t0 < 4000, "40 refused attempts cost no password hashing");
  // the owner's own address is not affected by another address being over its limit
  assert.equal((await admin("/login", { method: "POST", ip: "198.51.100.203", body: { username: "owner", password: ADMIN_PW } })).status, 200);
  // not configured (default): the action simply runs, as before
  T.resetAdminState();
  const def = envOf();
  assert.equal((await call(def, "/admin/api/state", { origin: "https://api.example" })).j.bootstrapped, false);
  assert.equal((await call(def, "/admin/api/login", { method: "POST", origin: "https://api.example", body: { username: "a", password: "b" } })).status, 401);
  T.resetAdminState();
});

test("image mode: a real router call with a product photo leaves no image bytes in any log line or D1 row", async () => {
  await resetAll();
  const env = envOf({ OPENROUTER_API_KEY: ROUTER_KEY, AI_ROUTE_PIN: "required", PUBLIC_ROUTES: TEST_ROUTES, D1_WRITE_BUDGET: "5000", DAILY_REQUEST_CAP: "20000" });
  const { putGateway } = await import(B + "ai/settings.js");
  await putGateway(env.DB, { enabled: true, features: { t_gate: { enabled: true, monthlyBudgetUsd: 5, perUserDaily: 100, perUserPerMinute: 100, globalPerMinute: 1000, imageModeAllowed: true,
    chain: [{ provider: "openrouter", model: "anthropic/claude-haiku-5.5", effort: "low" }] } } }, { features: FEATURE });
  const sent = [];
  const aiFetch = async (url, init) => { sent.push(String(init.body)); return oaiOk("Google Vertex", "anthropic/claude-haiku-5.5"); };
  const { handle } = await import(B + "index.js");
  const body = { consent: true, providers: ["openrouter"], mode: "image", input: { text: LABEL_TEXT, images: [{ mime: "image/jpeg", base64: IMAGE_B64, width: 640, height: 480 },
    { mime: "image/png", base64: IMAGE_B64.split("").reverse().join("").replace(/^=+/, "") + "==", width: 100, height: 100 }] } };
  const logs = [], orig = console.log;
  console.log = s => logs.push(String(s));
  let resp;
  try { resp = await handle(req("/v1/ai/t_gate", { method: "POST", body, headers: { "X-Tester-Code": CODE, "X-Turnstile-Token": "tok" }, ip: "192.0.2.50" }), env, { aiFeatures: FEATURE,
    aiFetch, fetch: siteverify }); }
  finally { console.log = orig; }
  const j = await resp.json();
  assert.deepEqual([resp.status, j.ok, j.routedVia], [200, true, "Google Vertex"], JSON.stringify(j));
  assert.ok(sent.length === 1 && sent[0].includes("data:image/jpeg;base64," + IMAGE_B64), "the photo really went to the (mock) provider, so the probe is meaningful");
  assert.ok(logs.some(l => /"event":"ai\.attempt"/.test(l)));
  const probes = [IMAGE_B64, IMAGE_B64.slice(0, 20), IMAGE_B64.slice(-20), "data:image", "base64,", "LABEL-TEXT-CANARY", "สมชาย", "081-234-5678", "192.0.2.50", CODE, ROUTER_KEY];
  for (const p of probes) assert.ok(!logs.join("\n").includes(p), "log line holds: " + p.slice(0, 16));
  assert.ok(logs.every(l => l.length < 600), "log lines stay small");
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(r => r.name);
  assert.ok(tables.length > 10);
  for (const t of tables) {
    const dump = JSON.stringify((await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results);
    for (const p of probes) assert.ok(!dump.includes(p), `table ${t} holds: ${p.slice(0, 16)}`);
  }
  assert.ok(!JSON.stringify(j).includes(IMAGE_B64.slice(0, 20)), "the answer does not echo the image either");
});
