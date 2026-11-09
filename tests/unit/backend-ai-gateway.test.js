"use strict";
// tests/unit/backend-ai-gateway.test.js — round 17 P5 "AI Gateway core" FIXED TEST SET (written before the code; listed in
// docs/AI-GATEWAY.md "Fixed test set"). Mocked providers only: fake adapters injected through deps.aiAdapters and a fake
// Anthropic SDK through deps.loadSdk. No real keys, no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const KEY = "sk-ant-test-" + "k".repeat(40);
const ADMIN_TOKEN = "t".repeat(40);
const ADMIN_PW = "correct horse battery staple";

const siteverify = async () => new Response(JSON.stringify({ success: true, action: "ai", hostname: "site.example" }));
const envOf = (vars = {}) => createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ANTHROPIC_API_KEY: KEY, GEMINI_API_KEY: "g-test", OPENAI_API_KEY: "o-test", ...vars });

/** Test feature (injected through deps.aiFeatures — production has no route for it). */
const OUT_SCHEMA = { type: "object", properties: { answer: { type: "string", maxLength: 40 }, n: { type: ["integer", "null"] } }, required: ["answer", "n"], additionalProperties: false };
const FEATURE = {
  t_echo: {
    id: "t_echo", status: "live", imageCapable: true, label: { th: "ทดสอบ", en: "Test", zh: "测试" },
    build: (input, { mode }) => ({
      system: "PROMPT-MARKER system rules", text: "INPUT:" + String(input && input.text || ""),
      images: mode === "image" ? input.images : undefined, output: { name: "t_echo", schema: OUT_SCHEMA }
    })
  }
};
const GOOD = { answer: "ok", n: 1 };

/** Fake adapter: `script(callNo, req, entry)` returns a gateway result (success or failure). Records calls. */
function fakeAdapter(id, script) {
  const calls = [];
  return {
    calls,
    adapter: {
      id,
      capabilities: () => ({ vision: true, jsonSchema: "native" }),
      region: () => "test-region",
      async call(r, entry, ctx) {
        calls.push({ r, entry, ctx });
        const out = await script(calls.length, r, entry);
        return out;
      }
    }
  };
}
const ok = (json = GOOD, usage = { inputTokens: 100, outputTokens: 50 }) => ({ ok: true, json, model: "served-x", usage, providerRequestId: "prov-req-1" });
const failK = (kind, extra = {}) => ({ ok: false, kind, ...extra });

async function gw() { return import(B + "ai/gateway.js"); }
async function settingsMod() { return import(B + "ai/settings.js"); }

/** Configure the test feature: on, chain, budget USD 5. */
async function configure(env, feat = {}, global = {}) {
  const { putGateway } = await settingsMod();
  await putGateway(env.DB, {
    enabled: true, ...global,
    features: {
      t_echo: {
        enabled: true, chain: [{ provider: "gemini", model: "gemini-3.5-flash-lite" }, { provider: "openai", model: "gpt-6-luna" }], monthlyBudgetUsd: 5,
        timeoutMs: 2000, maxOutputTokens: 500, perUserDaily: 100, perUserPerMinute: 100, globalPerMinute: 1000, imageModeAllowed: true, ...feat
      }
    }
  }, { features: FEATURE });
}
async function run(env, adapters, opts = {}) {
  const { runFeature } = await gw();
  return runFeature(env, "t_echo", FEATURE.t_echo.build({ text: "hello" }, { mode: "text" }), { deps: { aiAdapters: adapters, aiFeatures: FEATURE, sleep: async () => {} }, ...opts });
}

// ---- fallback matrix (§10.3) -------------------------------------------------------------------------------------

const MATRIX = [
  // kind, extra, expected attempts on the first provider, next provider called?, billed?
  ["timeout", {}, 1, true, true],
  ["connection", {}, 1, true, true],
  ["rate_limited", { retryAfterMs: 100 }, 2, true, false],
  ["rate_limited", { retryAfterMs: 60000 }, 1, true, false],
  ["rate_limited", {}, 1, true, false],
  ["overloaded", { retryAfterMs: 100 }, 2, true, false],
  ["server_error", {}, 2, true, false],
  ["refusal", {}, 1, true, true],
  ["truncated", {}, 1, true, true],
  ["invalid_json", {}, 2, true, true],
  ["schema_mismatch", {}, 2, true, true],
  ["bad_request", {}, 1, true, false],
  ["auth", {}, 1, true, false],
  ["unsupported", {}, 1, true, false],
  ["content_policy_input", {}, 1, false, false]
];

test("fallback policy table: each kind -> retry same / next provider / billed exactly as design §10.3", async () => {
  const { POLICY, decide } = await import(B + "ai/fallback.js");
  assert.deepEqual(Object.keys(POLICY).sort(), ["auth", "bad_request", "connection", "content_policy_input", "invalid_json", "overloaded", "rate_limited",
    "refusal", "schema_mismatch", "server_error", "timeout", "truncated", "unsupported"]);
  for (const [kind, extra, attempts, next, billed] of MATRIX) {
    const d = decide(kind, { sameAttempts: 1, retryAfterMs: extra.retryAfterMs, timeLeftMs: 10000 });
    assert.equal(d.retry, attempts === 2, kind + " retry " + JSON.stringify(extra));
    assert.equal(d.next, next, kind + " next");
    assert.equal(d.billed, billed, kind + " billed");
    assert.equal(decide(kind, { sameAttempts: 2, retryAfterMs: extra.retryAfterMs, timeLeftMs: 10000 }).retry, false, kind + " retries at most once");
  }
  for (const k of ["bad_request", "auth", "unsupported"]) assert.equal(decide(k, { sameAttempts: 1 }).alert, true, k + " alerts the admin");
});

for (const [kind, extra, attempts, next, billed] of MATRIX) {
  test(`fallback walker: ${kind} ${JSON.stringify(extra)} -> ${attempts} attempt(s), next=${next}, billed=${billed}`, async () => {
    const env = envOf();
    await configure(env);
    const a = fakeAdapter("gemini", () => failK(kind, extra));
    const b = fakeAdapter("openai", () => ok());
    const r = await run(env, { gemini: a.adapter, openai: b.adapter });
    assert.equal(a.calls.length, attempts, "attempts on the first provider");
    assert.equal(b.calls.length, next ? 1 : 0, "next provider");
    if (next) { assert.equal(r.ok, true); assert.equal(r.provider, "openai"); assert.deepEqual(r.json, GOOD); }
    else { assert.equal(r.ok, false); assert.equal(r.reason, "content_policy"); }
    const first = r.attempts.filter(x => x.provider === "gemini");
    assert.equal(first.length, attempts);
    for (const x of first) { assert.equal(x.kind, kind); assert.equal(x.billed, billed); assert.equal(x.costMicros > 0, billed, "charged only when billed"); }
    const { budgetUsed } = await import(B + "ai/db.js");
    const used = await budgetUsed(env.DB, r.month, "t_echo");
    assert.equal(used, r.attempts.reduce((s, x) => s + x.costMicros, 0), "budget counter = sum of settled attempt costs");
  });
}

test("fallback walker: per-attempt deadline -> kind timeout (assumed billed), then the next provider", async () => {
  const env = envOf();
  await configure(env, { timeoutMs: 1000 });
  const slow = fakeAdapter("gemini", () => new Promise(() => {})); // never answers
  const b = fakeAdapter("openai", () => ok());
  const { runFeature } = await gw();
  const deps = { aiAdapters: { gemini: slow.adapter, openai: b.adapter }, aiFeatures: FEATURE };
  const r = await runFeature(env, "t_echo", FEATURE.t_echo.build({ text: "x" }, { mode: "text" }), { deps, timeoutOverrideMs: 30 });
  assert.equal(r.ok, true);
  assert.equal(r.attempts[0].kind, "timeout");
  assert.equal(r.attempts[0].billed, true, "timeout: assume billed for the budget");
});

// ---- budget ------------------------------------------------------------------------------------------------------

test("budget: reserve before the call, settle to the real cost after, refund when not billed (micro-USD)", async () => {
  const env = envOf();
  await configure(env, { chain: [{ provider: "openai", model: "gpt-6-luna" }] });
  const b = fakeAdapter("openai", () => ok(GOOD, { inputTokens: 1000, outputTokens: 100 }));
  const r = await run(env, { openai: b.adapter });
  assert.equal(r.ok, true);
  // gpt-6-luna 0.10 / 0.50 USD per 1M tokens = 0.10 / 0.50 micro-USD per token
  assert.equal(r.costMicros, Math.ceil(1000 * 0.10 + 100 * 0.50));
  const { budgetUsed } = await import(B + "ai/db.js");
  assert.equal(await budgetUsed(env.DB, r.month, "t_echo"), r.costMicros, "settled to the real cost (reservation released)");
  const nb = fakeAdapter("openai", () => failK("server_error"));
  const r2 = await run(env, { openai: nb.adapter });
  assert.equal(r2.ok, false);
  assert.equal(await budgetUsed(env.DB, r2.month, "t_echo"), r.costMicros, "not billed -> reservation refunded");
});

test("budget: concurrent calls never overshoot the monthly cap (single-statement reservation)", async () => {
  const env = envOf();
  // cap 0.002 USD = 2000 micro-USD; each call reserves its estimate (max output 500 tokens * 0.5 = 250 + input)
  await configure(env, { chain: [{ provider: "openai", model: "gpt-6-luna" }], monthlyBudgetUsd: 0.002 });
  const b = fakeAdapter("openai", async () => { await new Promise(res => setTimeout(res, 5)); return ok(GOOD, { inputTokens: 40, outputTokens: 500 }); });
  const rs = await Promise.all(Array.from({ length: 40 }, () => run(env, { openai: b.adapter })));
  const okN = rs.filter(r => r.ok).length;
  const { budgetUsed } = await import(B + "ai/db.js");
  const used = await budgetUsed(env.DB, rs[0].month, "t_echo");
  assert.ok(used <= 2000, "used " + used + " <= cap 2000");
  assert.ok(okN >= 1 && okN < 40, "some calls ran, the rest were refused: " + okN);
  assert.ok(rs.filter(r => !r.ok).every(r => r.reason === "budget"), "refused calls say budget");
  assert.equal(b.calls.length, okN, "a refused call never reached the provider");
});

test("budget: cap hit (default 0 = nothing runs) -> {fallback:true, reason:'budget'}; provider never called", async () => {
  const env = envOf();
  await configure(env, { monthlyBudgetUsd: 0 });
  const a = fakeAdapter("gemini", () => ok());
  const b = fakeAdapter("openai", () => ok());
  const r = await run(env, { gemini: a.adapter, openai: b.adapter });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "budget");
  assert.equal(a.calls.length + b.calls.length, 0);
  const { DEFAULT_GATEWAY } = await settingsMod();
  assert.equal(DEFAULT_GATEWAY.enabled, false, "new install: AI globally off");
  for (const f of ["pc_fields", "pc_claims", "pc_translate"]) assert.equal(DEFAULT_GATEWAY.features[f].monthlyBudgetUsd, 0, f + " budget 0 by default");
});

test("price table: versioned with effective dates (2026-11-30 vs 2026-12-01 vs 2027-01-01)", async () => {
  const { priceAt, costMicros } = await import(B + "ai/adapters/prices.js");
  assert.deepEqual([priceAt("gemini", "gemini-4-argon", "2026-11-30").inPerM, priceAt("gemini", "gemini-4-argon", "2026-11-30").outPerM], [2, 10]);
  assert.deepEqual([priceAt("gemini", "gemini-4-argon", "2026-12-01").inPerM, priceAt("gemini", "gemini-4-argon", "2026-12-01").outPerM], [4, 20]);
  assert.deepEqual([priceAt("gemini", "gemini-3.8-flash", "2026-12-01").inPerM, priceAt("gemini", "gemini-3.8-flash", "2026-12-31").outPerM], [0.75, 3.75]);
  assert.deepEqual([priceAt("gemini", "gemini-3.8-flash", "2027-01-01").inPerM, priceAt("gemini", "gemini-3.8-flash", "2027-01-01").outPerM], [1.5, 7.5]);
  assert.equal(priceAt("anthropic", "claude-opus-5-5", "2027-01-01").inPerM, 4);
  assert.equal(priceAt("anthropic", "claude-haiku-5-5", "2026-11-30").outPerM, 0.5);
  assert.equal(priceAt("openai", "no-such-model", "2026-11-30"), null);
  // 1M input + 1M output of gemini-4-argon on 2026-12-01 = 4 + 20 USD
  assert.equal(costMicros(priceAt("gemini", "gemini-4-argon", "2026-12-01"), { inputTokens: 1e6, outputTokens: 1e6 }), 24e6);
  assert.equal(costMicros(priceAt("gemini", "gemini-4-argon", "2026-12-01"), { inputTokens: 1, outputTokens: 0, reasoningTokens: 1 }), 24, "reasoning tokens are output tokens");
});

// ---- provider allowlist ------------------------------------------------------------------------------------------

test("provider allowlist off -> that provider is skipped (never called, not shown on the consent screen)", async () => {
  const env = envOf();
  await configure(env, {}, { providers: { gemini: false } });
  const a = fakeAdapter("gemini", () => ok());
  const b = fakeAdapter("openai", () => ok());
  const r = await run(env, { gemini: a.adapter, openai: b.adapter });
  assert.equal(r.ok, true);
  assert.equal(a.calls.length, 0);
  assert.equal(r.provider, "openai");
  const { providersInfo } = await gw();
  const info = await providersInfo(env, "t_echo", { aiAdapters: { gemini: a.adapter, openai: b.adapter }, aiFeatures: FEATURE });
  assert.deepEqual(info.chain.map(x => x.provider), ["openai"]);
  const { DEFAULT_GATEWAY } = await settingsMod();
  assert.ok(Object.values(DEFAULT_GATEWAY.providers).every(v => v === true), "owner decision PC-D2: every provider on by default");
  assert.deepEqual(Object.keys(DEFAULT_GATEWAY.providers).sort(), ["anthropic", "dashscope", "deepseek", "gemini", "kimi", "openai", "openrouter", "zai"]);
});

test("consent covers the chain shown: a provider the user did not see is never used", async () => {
  const env = envOf();
  await configure(env);
  const a = fakeAdapter("gemini", () => failK("server_error"));
  const b = fakeAdapter("openai", () => ok());
  const r = await run(env, { gemini: a.adapter, openai: b.adapter }, { consentProviders: ["gemini"] });
  assert.equal(r.ok, false);
  assert.equal(b.calls.length, 0);
});

// ---- JSON schema validation --------------------------------------------------------------------------------------

test("schema validator: rejects extra keys, wrong types, enum misses, too-long strings; nullable via type arrays", async () => {
  const { validateJson, assertSupportedSchema } = await import(B + "ai/schema.js");
  const item = { type: "object", properties: { d: { type: "string", maxLength: 3 } }, required: ["d"], additionalProperties: false };
  const S = {
    type: "object",
    properties: { a: { type: "string", enum: ["x", "y"] }, b: { type: ["number", "null"] }, c: { type: "array", items: item }, e: { type: "integer" }, f: { type: "boolean" } },
    required: ["a", "b"], additionalProperties: false
  };
  assert.deepEqual(validateJson(S, { a: "x", b: null, c: [{ d: "abc" }], e: 3, f: true }), []);
  assert.deepEqual(validateJson(S, { a: "x", b: 1.5 }), []);
  const bad = [
    { a: "x", b: 1, extra: 1 },          // extra key
    { a: "z", b: 1 },                    // enum
    { a: "x" },                          // required
    { a: 1, b: 1 },                      // type
    { a: "x", b: "1" },                  // type (no null)
    { a: "x", b: 1, c: [{ d: "abcd" }] }, // maxLength
    { a: "x", b: 1, c: [{ d: "a", z: 1 }] }, // nested extra key
    { a: "x", b: 1, c: {} },             // array expected
    { a: "x", b: 1, e: 1.5 },            // integer
    [], null, "s"
  ];
  for (const v of bad) assert.ok(validateJson(S, v).length > 0, JSON.stringify(v));
  assert.ok(!validateJson(S, { a: "x", b: 1, extra: "SECRET-VALUE" }).join(" ").includes("SECRET-VALUE"), "errors never echo values");
  assert.throws(() => assertSupportedSchema({ type: "string", pattern: "^a" }), /unsupported/);
  assert.doesNotThrow(() => assertSupportedSchema(S));
});

test("gateway validates every result: extra key -> schema_mismatch (retry once, then next provider)", async () => {
  const env = envOf();
  await configure(env);
  const a = fakeAdapter("gemini", () => ok({ answer: "ok", n: 1, extra: "x" }));
  const b = fakeAdapter("openai", () => ok({ answer: 5, n: 1 }));
  const r = await run(env, { gemini: a.adapter, openai: b.adapter });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "invalid_output");
  assert.deepEqual(r.attempts.map(x => [x.provider, x.kind]), [["gemini", "schema_mismatch"], ["gemini", "schema_mismatch"], ["openai", "schema_mismatch"], ["openai", "schema_mismatch"]]);
});

// ---- public route: limits, consent, logs ---------------------------------------------------------------------------

async function post(env, adapters, body, opts = {}) {
  const { handle } = await import(B + "index.js");
  const rq = req("/v1/ai/t_echo", { method: "POST", body, ip: opts.ip, headers: { "X-Turnstile-Token": "good", ...(opts.headers || {}) } });
  const r = await handle(rq, env, { fetch: siteverify, aiAdapters: adapters, aiFeatures: FEATURE, sleep: async () => {} });
  return { status: r.status, j: await r.json() };
}
const BODY = { consent: true, providers: ["gemini", "openai"], mode: "text", input: { text: "hello" } };

test("POST /v1/ai/:feature: per-user per-minute and per-day limits, global per-minute -> reason 'limit'", async () => {
  const env = envOf();
  await configure(env, { perUserPerMinute: 2, perUserDaily: 3, globalPerMinute: 3 });
  const ad = { gemini: fakeAdapter("gemini", () => ok()).adapter };
  assert.equal((await post(env, ad, BODY, { ip: "203.0.113.1" })).status, 200);
  assert.equal((await post(env, ad, BODY, { ip: "203.0.113.1" })).status, 200);
  const third = await post(env, ad, BODY, { ip: "203.0.113.1" });
  assert.equal(third.status, 429); assert.deepEqual([third.j.fallback, third.j.reason], [true, "limit"]);
  assert.equal((await post(env, ad, BODY, { ip: "203.0.113.2" })).status, 200);
  const g = await post(env, ad, BODY, { ip: "203.0.113.3" });
  assert.equal(g.status, 429, "global per minute (3 calls; the refused one was given back)"); assert.equal(g.j.reason, "limit");
  // per day: new minute window simulated by clearing per-minute buckets
  await env.DB.prepare("DELETE FROM rate_limits WHERE key LIKE '%:m:%' OR key LIKE '%:g'").run();
  assert.equal((await post(env, ad, BODY, { ip: "203.0.113.1" })).status, 200, "third call of the day");
  await env.DB.prepare("DELETE FROM rate_limits WHERE key LIKE '%:m:%' OR key LIKE '%:g'").run();
  const day = await post(env, ad, BODY, { ip: "203.0.113.1" });
  assert.equal(day.status, 429); assert.equal(day.j.reason, "limit");
});

test("POST /v1/ai/:feature: global off / feature off / no consent / image mode not allowed / unknown feature", async () => {
  const env = envOf();
  const ad = { gemini: fakeAdapter("gemini", () => ok()).adapter };
  assert.equal((await post(env, ad, BODY)).j.reason, "disabled", "new install: globally off");
  await configure(env, { imageModeAllowed: false });
  assert.equal((await post(env, ad, { ...BODY, consent: false })).j.reason, "consent_required");
  assert.equal((await post(env, ad, { ...BODY, providers: undefined })).j.reason, "consent_required");
  const img = await post(env, ad, { ...BODY, mode: "image", input: { text: "x", images: [{ mime: "image/jpeg", base64: "AAAA", width: 10, height: 10 }] } });
  assert.equal(img.status, 400); assert.equal(img.j.reason, "image_not_allowed");
  await configure(env, { enabled: false });
  assert.equal((await post(env, ad, BODY)).j.reason, "disabled");
  const { handle } = await import(B + "index.js");
  const u = await handle(req("/v1/ai/pc_fields", { method: "POST", body: BODY, headers: { "X-Turnstile-Token": "good" } }), env, { fetch: siteverify });
  assert.equal(u.status, 404); assert.equal((await u.json()).fallback, true, "planned feature has no route yet");
});

test("logs: one line per attempt with allowed fields only — never image, base64, text, prompt, IP, e-mail", async () => {
  const env = envOf();
  await configure(env);
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  try {
    const a = fakeAdapter("gemini", () => failK("server_error", { providerRequestId: "req_gem_1" }));
    const b = fakeAdapter("openai", () => ok());
    const images = [{ mime: "image/jpeg", base64: "QUJDREVGR0hJSktMTU5PUFFSU1RVVldY", width: 10, height: 10 }];
    const body = { ...BODY, mode: "image", email: "person@example.test", input: { text: "SECRET-TEXT-123 person@example.test", images } };
    const r = await post(env, { gemini: a.adapter, openai: b.adapter }, body, { ip: "198.51.100.77" });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    assert.equal(a.calls[0].r.images[0].base64, "QUJDREVGR0hJSktMTU5PUFFSU1RVVldY", "the adapter did get the image");
  } finally { console.log = orig; }
  const all = logs.join("\n");
  for (const s of ["SECRET-TEXT", "QUJDREVG", "PROMPT-MARKER", "198.51.100.77", "person@example.test", "INPUT:", KEY, "g-test", "o-test"]) assert.ok(!all.includes(s), "log leaked " + s);
  const attempts = logs.map(l => JSON.parse(l)).filter(l => l.event === "ai.attempt");
  assert.equal(attempts.length, 3, "one line per attempt (2 x server_error + 1 ok)");
  const ALLOWED = new Set(["event", "feature", "provider", "model", "served_model", "region", "attempt", "kind", "billed", "in_tok", "out_tok",
    "reasoning_tok", "cached_tok", "image_tok", "cost_micros", "latency_ms", "request_id", "provider_request_id"]);
  for (const l of attempts) for (const k of Object.keys(l)) assert.ok(ALLOWED.has(k), "unexpected log field " + k);
  assert.equal(attempts[0].provider_request_id, "req_gem_1");
  assert.equal(attempts[2].kind, "ok");
});

// ---- providers endpoint (consent screen data) --------------------------------------------------------------------

test("GET /v1/ai/providers?feature=…: ordered chain with provider name, model, processing location and retention (TH/EN/ZH), no secrets", async () => {
  const env = envOf();
  const { putGateway } = await settingsMod();
  const chain = [{ provider: "anthropic", model: "claude-haiku-5-5", effort: "low" }, { provider: "gemini", model: "gemini-3.5-flash-lite" }, { provider: "openai", model: "gpt-6-luna" }];
  await putGateway(env.DB, { enabled: true, features: { pc_fields: { enabled: true, chain, monthlyBudgetUsd: 20, imageModeAllowed: true } } });
  const { handle } = await import(B + "index.js");
  const r = await handle(req("/v1/ai/providers?feature=pc_fields"), env, {});
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.feature, "pc_fields");
  assert.equal(j.imageModeAllowed, true);
  assert.equal(j.stores, false, "LENSIQ stores nothing");
  // P5 shipped the Anthropic adapter only (then only Anthropic was shown); since P6 every provider has its adapter, so
  // the whole chain with a key set is shown, in order (docs/AI-GATEWAY.md §10 row 34)
  assert.deepEqual(j.chain.map(x => [x.provider, x.model]), [["anthropic", "claude-haiku-5-5"], ["gemini", "gemini-3.5-flash-lite"], ["openai", "gpt-6-luna"]]);
  for (const x of j.chain) {
    for (const f of ["name", "region", "retention"]) for (const l of ["th", "en", "zh"]) assert.ok(typeof x[f][l] === "string" && x[f][l].length > 1, `${x.provider}.${f}.${l}`);
  }
  const text = JSON.stringify(j);
  for (const s of [KEY, "g-test", "o-test", "API_KEY", "secret"]) assert.ok(!text.includes(s), "leaked " + s);
  const u = await handle(req("/v1/ai/providers?feature=nope"), env, {});
  assert.equal(u.status, 404);
  // with the test adapters injected, the full chain is shown in order
  const r2 = await handle(req("/v1/ai/providers?feature=pc_fields"), env, { aiAdapters: { gemini: fakeAdapter("gemini", ok).adapter, openai: fakeAdapter("openai", ok).adapter } });
  assert.deepEqual((await r2.json()).chain.map(x => x.provider), ["anthropic", "gemini", "openai"]);
});

// ---- settings migration (fortune) ---------------------------------------------------------------------------------

test("settings: the existing fortune 'ai' settings appear as feature fortune_reword without losing values; edits write back", async () => {
  const env = envOf();
  const { putAiSettings, getAiSettings } = await import(B + "settings.js");
  await putAiSettings(env.DB, { model: "claude-sonnet-5-5", effort: "medium", rpm: 7, per_caller_daily: 9, global_rpm: 33, max_tokens: 1500, enabled: false });
  const { getGateway, putGateway } = await settingsMod();
  const g = await getGateway(env.DB);
  const f = g.features.fortune_reword;
  assert.deepEqual(f.chain[0], { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" });
  assert.deepEqual([f.enabled, f.perUserPerMinute, f.perUserDaily, f.globalPerMinute, f.maxOutputTokens, f.monthlyBudgetUsd, f.timeoutMs], [false, 7, 9, 33, 1500, null, 120000]);
  const chain = [{ provider: "anthropic", model: "claude-opus-5-5", effort: "low" }, { provider: "openai", model: "gpt-6-luna" }];
  await putGateway(env.DB, { features: { fortune_reword: { enabled: true, maxOutputTokens: 1024, monthlyBudgetUsd: 3, chain } } });
  const ai = await getAiSettings(env.DB);
  assert.deepEqual([ai.enabled, ai.max_tokens, ai.model, ai.effort, ai.rpm, ai.daily_max], [true, 1024, "claude-opus-5-5", "low", 7, 500], "legacy settings updated in place, others kept");
  const g2 = await getGateway(env.DB);
  assert.equal(g2.features.fortune_reword.monthlyBudgetUsd, 3);
  assert.deepEqual(g2.features.fortune_reword.chain.map(x => x.provider), ["anthropic", "openai"]);
  await assert.rejects(putGateway(env.DB, { features: { fortune_reword: { chain: [{ provider: "openai", model: "gpt-6-luna" }] } } }), /anthropic/);
  await assert.rejects(putGateway(env.DB, { features: { pc_claims: { imageModeAllowed: true } } }), /image/);
  await assert.rejects(putGateway(env.DB, { features: { pc_fields: { chain: [{ provider: "nope", model: "x" }] } } }), /provider/);
  await assert.rejects(putGateway(env.DB, { api_key: "x" }), /unknown/);
});

test("fortune goes through the gateway: one ai.attempt log line, usage aggregated for the admin page", async () => {
  const env = envOf();
  const GROUNDED = "จากเส้นหัวใจยาว คุณมีความรักที่มั่นคงและจริงใจต่อคนรัก";
  class APIError extends Error { constructor(s) { super("x"); this.status = s; } }
  const reply = { sections: [{ id: "overview", title: "ภาพรวม", paragraphs: [GROUNDED] }] };
  const resp = { model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 1200, output_tokens: 300 }, content: [{ type: "text", text: JSON.stringify(reply) }] };
  class Anthropic { constructor() { this.beta = { messages: { create: async () => resp } }; } }
  Anthropic.APIError = APIError; Anthropic.RateLimitError = class extends APIError {}; Anthropic.APIConnectionError = class extends APIError {};
  const FACTS = { domain: "palm", topic: "love", items: [{ id: "heart", label: "เส้นหัวใจยาว", strength: 0.9, tags: ["love"], meanings: { love: ["มีความรักที่มั่นคงและจริงใจต่อคนรัก"] } }] };
  const { handle } = await import(B + "index.js");
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  let r;
  try {
    const verify = async () => new Response(JSON.stringify({ success: true, action: "fortune", hostname: "site.example" }));
    const rq = req("/api/fortune", { method: "POST", body: { facts: FACTS, consent: true }, headers: { "X-Turnstile-Token": "good" } });
    r = await handle(rq, env, { fetch: verify, loadSdk: async () => Anthropic });
  } finally { console.log = orig; }
  assert.equal(r.status, 200);
  const att = logs.map(l => JSON.parse(l)).filter(l => l.event === "ai.attempt");
  assert.equal(att.length, 1);
  assert.deepEqual([att[0].feature, att[0].provider, att[0].kind, att[0].in_tok, att[0].out_tok], ["fortune_reword", "anthropic", "ok", 1200, 300]);
  assert.equal(att[0].cost_micros, 1200 * 4 + 300 * 20);
  const { adminUsage } = await gw();
  const u = await adminUsage(env, {});
  const row = u.features.find(x => x.feature === "fortune_reword");
  assert.deepEqual([row.requests, row.calls, row.ok, row.cost_usd], [1, 1, 1, (1200 * 4 + 300 * 20) / 1e6]);
  assert.ok(row.p50_ms != null && row.p95_ms != null);
});

// ---- admin API ---------------------------------------------------------------------------------------------------

async function adminSetup(vars = {}) {
  const env = envOf({ ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, ...vars });
  const { handle } = await import(B + "index.js");
  const call = async (path, o = {}) => {
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {} }), env, {});
    let j = null; try { j = await r.clone().json(); } catch { /* not JSON */ }
    return { status: r.status, j, text: await r.text() };
  };
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
  const tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
  const A = (path, o = {}) => call("/admin/api" + path, { ...o, headers: { Authorization: "Bearer " + tok, ...(o.headers || {}) } });
  return { env, A };
}

test("admin: GET/PUT /admin/api/ai/gateway needs sign-in; PUT needs re-auth and is audited; key presence only", async () => {
  const { env, A } = await adminSetup();
  const { handle } = await import(B + "index.js");
  assert.equal((await handle(req("/admin/api/ai/gateway"), env, {})).status, 401, "signed out");
  const g = await A("/ai/gateway");
  assert.equal(g.status, 200);
  assert.equal(g.j.settings.enabled, false);
  const keys = Object.fromEntries(g.j.providers.map(p => [p.id, p.key_set]));
  assert.deepEqual([keys.anthropic, keys.gemini, keys.openai, keys.deepseek], [true, true, true, false]);
  for (const s of [KEY, KEY.slice(-6), "g-test", "o-test"]) assert.ok(!g.text.includes(s), "leaked a key value");
  assert.ok(g.j.features.some(f => f.id === "fortune_reword" && f.legacy === true));
  assert.ok("last_eval" in g.j.settings, "last eval date placeholder");
  const no = await A("/ai/gateway", { method: "PUT", body: { enabled: true } });
  assert.equal(no.status, 403); assert.equal(no.j.code, "reauth_required");
  assert.ok(await env.DB.prepare("SELECT 1 FROM audit_log WHERE action = 'reauth.failed'").first(), "missing re-auth audited");
  assert.equal((await A("/reauth", { method: "POST", body: { password: ADMIN_PW } })).status, 200);
  const pc = { enabled: true, monthlyBudgetUsd: 20, chain: [{ provider: "anthropic", model: "claude-haiku-5-5", effort: "low" }] };
  const put = await A("/ai/gateway", { method: "PUT", body: { enabled: true, providers: { deepseek: false }, features: { pc_fields: pc } } });
  assert.equal(put.status, 200, JSON.stringify(put.j));
  assert.equal(put.j.settings.enabled, true);
  assert.equal(put.j.settings.providers.deepseek, false);
  const row = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'ai.gateway.settings' ORDER BY id DESC").first();
  assert.ok(row, "audited");
  assert.match(row.detail, /pc_fields/);
  const bad = await A("/ai/gateway", { method: "PUT", body: { features: { pc_fields: { monthlyBudgetUsd: -1 } } } });
  assert.equal(bad.status, 400);
  const u = await A("/ai/usage");
  assert.equal(u.status, 200);
  assert.ok(Array.isArray(u.j.features) && u.j.features.some(f => f.feature === "pc_fields"));
  assert.match(u.j.month, /^\d{4}-\d{2}$/);
});
