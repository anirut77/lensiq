"use strict";
// tests/unit/backend-ai-review.test.js — round 17 P5 independent-review fixes (one test per finding). Mocked providers only.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const KEY = "sk-ant-test-" + "k".repeat(40);
const KEK = Buffer.alloc(32, 3).toString("base64");
const SCHEMA = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false };
const build = () => ({ system: "s", text: "t", output: { name: "t", schema: SCHEMA } });
const feat = (extra = {}) => ({ t_rev: { id: "t_rev", status: "live", label: { th: "t", en: "t", zh: "t" }, build, ...extra } });
const envOf = (vars = {}) => createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ANTHROPIC_API_KEY: KEY, OPENAI_API_KEY: "o-test", ...vars });
const NREQ = { system: "s", text: "t", output: { name: "t", schema: SCHEMA } };

async function configure(env, features, f) {
  const { putGateway } = await import(B + "ai/settings.js");
  await putGateway(env.DB, { enabled: true, features: { t_rev: { enabled: true, monthlyBudgetUsd: 5, maxOutputTokens: 500, timeoutMs: 2000, ...f } } }, { features });
}
const adapter = (call) => ({ id: "x", capabilities: () => ({}), region: () => "r", call });

/** Fake SDK counting create() calls; behaviour(n) returns a response or throws. */
function fakeSdk(behaviour) {
  class APIError extends Error { constructor(status) { super("x"); this.status = status; } }
  class RateLimitError extends APIError { constructor() { super(429); this.headers = { "retry-after": "0" }; } }
  class APIConnectionError extends APIError { constructor() { super(undefined); } }
  const seen = { ctor: [], create: [] };
  class Anthropic {
    constructor(o) {
      seen.ctor.push(o);
      this.beta = { messages: { create: async (body, opts) => { seen.create.push({ body, opts }); return behaviour(seen.create.length, { APIError, RateLimitError }); } } };
    }
  }
  Anthropic.APIError = APIError; Anthropic.RateLimitError = RateLimitError; Anthropic.APIConnectionError = APIConnectionError;
  return { loadSdk: async () => Anthropic, seen };
}

test("review 1: served model dearer than the reserved one — the budget counter never passes the cap; overshoot alerted", async () => {
  const env = envOf();
  const F = feat();
  await configure(env, F, { chain: [{ provider: "openai", model: "gpt-6-luna" }], monthlyBudgetUsd: 0.001 }); // cap 1000 micro-USD
  const served = adapter(async () => ({ ok: true, json: { answer: "a" }, model: "gpt-6.1-sol", usage: { inputTokens: 1000, outputTokens: 500 } }));
  const { runFeature } = await import(B + "ai/gateway.js");
  const r = await runFeature(env, "t_rev", NREQ, { deps: { aiAdapters: { openai: served }, aiFeatures: F } });
  assert.equal(r.ok, true);
  assert.equal(r.costMicros, 1000 * 2 + 500 * 10, "the real cost (gpt-6.1-sol, 2 / 10 USD per 1M) is still reported");
  const { budgetUsed } = await import(B + "ai/db.js");
  assert.ok(await budgetUsed(env.DB, r.month, "t_rev") <= 1000, "budget counter <= cap");
  const al = await env.DB.prepare("SELECT kind, detail FROM alerts").all();
  assert.ok(al.results.some(a => a.kind === "ai_config_error" && /cost_over_reservation/.test(a.detail)), "overshoot alerted");
});

test("review 1: with a cap the Anthropic call is pinned (no server-side fallback); fortune (no cap) keeps it; cache writes 1.25x", async () => {
  const env = envOf();
  const F = feat();
  await configure(env, F, { chain: [{ provider: "anthropic", model: "claude-haiku-5-5", effort: "low" }] });
  const sdk = fakeSdk(() => ({ model: "claude-haiku-5-5", stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: "text", text: '{"answer":"a"}' }] }));
  const { runFeature } = await import(B + "ai/gateway.js");
  const r = await runFeature(env, "t_rev", NREQ, { deps: { aiFeatures: F, loadSdk: sdk.loadSdk } });
  assert.equal(r.ok, true);
  assert.ok(!("fallbacks" in sdk.seen.create[0].body) && !("betas" in sdk.seen.create[0].body), "pinned");
  const { buildRequest, cleanFacts } = await import(B + "fortune.js");
  const { DEFAULT_AI } = await import(B + "settings.js");
  const fr = buildRequest(cleanFacts({ domain: "palm", items: [{ label: "x", meanings: { love: ["y"] } }] }), "warm", DEFAULT_AI);
  assert.equal(fr.fallbacks, "default");
  const { priceAt, costMicros } = await import(B + "ai/adapters/prices.js");
  const opus = priceAt("anthropic", "claude-opus-5-5", "2026-11-30");
  assert.equal(costMicros(opus, { inputTokens: 1000, cacheWriteTokens: 1000 }), 5000, "1,000 cache-write tokens x 4 x 1.25");
  assert.equal(costMicros(opus, { inputTokens: 1000, cachedInputTokens: 1000 }), 400, "cache reads 0.1x");
  assert.equal(costMicros(opus, { inputTokens: 3000, cacheWriteTokens: 1000, cachedInputTokens: 1000, outputTokens: 10 }), 4000 + 5000 + 400 + 200);
  const { parse } = await import(B + "ai/adapters/anthropic.js");
  const usage = { input_tokens: 5, cache_creation_input_tokens: 7, cache_read_input_tokens: 9, output_tokens: 1 };
  const u = parse({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "{}" }] }, "m").usage;
  assert.deepEqual([u.inputTokens, u.cacheWriteTokens, u.cachedInputTokens], [21, 7, 9]);
});

test("review 2: fortune makes the same number of provider calls as before for 5xx, bad JSON and rate limits (SDK retries 1, no gateway retry)", async () => {
  const FACTS = { domain: "palm", topic: "love", items: [{ id: "heart", label: "เส้นหัวใจยาว", strength: 0.9, tags: ["love"], meanings: { love: ["มีความรักที่มั่นคงและจริงใจต่อคนรัก"] } }] };
  const { handle } = await import(B + "index.js");
  const verify = async () => new Response(JSON.stringify({ success: true, action: "fortune", hostname: "site.example" }));
  const cases = [
    [(n, E) => { throw new E.APIError(500); }, 502],
    [() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] }), 502],
    [(n, E) => { throw new E.RateLimitError(); }, 429]
  ];
  for (const [beh, status] of cases) {
    const env = envOf();
    const sdk = fakeSdk(beh);
    const rq = req("/api/fortune", { method: "POST", body: { facts: FACTS, consent: true }, headers: { "X-Turnstile-Token": "good" } });
    const r = await handle(rq, env, { fetch: verify, loadSdk: sdk.loadSdk });
    assert.equal(r.status, status);
    assert.equal(sdk.seen.create.length, 1, "one SDK call, as before the gateway");
    assert.equal(sdk.seen.ctor[0].maxRetries, 1, "fortune keeps the SDK's single retry");
    assert.ok(sdk.seen.ctor[0].timeout <= 85000, "inside the 90 s client abort");
  }
  const { FEATURES } = await import(B + "ai/features.js");
  assert.ok(FEATURES.fortune_reword.overallMs < 90000);
});

test("review 2: other features — SDK retries 0, the gateway owns the retry; real time left decides a retry-after wait", async () => {
  const env = envOf();
  const F = feat();
  await configure(env, F, { chain: [{ provider: "anthropic", model: "claude-haiku-5-5" }] });
  const sdk = fakeSdk((n, E) => { throw new E.APIError(500); });
  const { runFeature } = await import(B + "ai/gateway.js");
  await runFeature(env, "t_rev", NREQ, { deps: { aiFeatures: F, loadSdk: sdk.loadSdk } });
  assert.equal(sdk.seen.ctor[0].maxRetries, 0);
  assert.equal(sdk.seen.create.length, 2, "server_error: retried once by the gateway");
  assert.ok(sdk.seen.create[0].opts && sdk.seen.create[0].opts.signal, "abort signal passed to the SDK");
  // overall deadline 100 ms; the first call takes ~60 ms and asks to retry after 80 ms: no longer fits -> no retry
  const slow = { n: 0 };
  const rl = adapter(async () => { slow.n++; await new Promise(r => setTimeout(r, 60)); return { ok: false, kind: "rate_limited", retryAfterMs: 80 }; });
  await configure(env, F, { chain: [{ provider: "openai", model: "gpt-6-luna" }], timeoutMs: 1000 });
  await runFeature(env, "t_rev", NREQ, { deps: { aiAdapters: { openai: rl }, aiFeatures: F, sleep: async () => {} }, overallMs: 100 });
  assert.equal(slow.n, 1, "retry-after does not fit the time actually left");
});

test("review 7: the attempt is aborted at its deadline (AbortSignal reaches the adapter)", async () => {
  const env = envOf();
  const F = feat();
  await configure(env, F, { chain: [{ provider: "openai", model: "gpt-6-luna" }] });
  let signal = null;
  const hang = adapter((r, e, ctx) => { signal = ctx.signal; return new Promise(() => {}); });
  const { runFeature } = await import(B + "ai/gateway.js");
  const r = await runFeature(env, "t_rev", NREQ, { deps: { aiAdapters: { openai: hang }, aiFeatures: F }, timeoutOverrideMs: 20 });
  assert.equal(r.attempts[0].kind, "timeout");
  assert.equal(signal.aborted, true);
});

test("review 6: unknown / prototype kinds (toString, __proto__, constructor) are handled as server_error", async () => {
  const env = envOf();
  const F = feat();
  await configure(env, F, { chain: [{ provider: "openai", model: "gpt-6-luna" }] });
  const { runFeature } = await import(B + "ai/gateway.js");
  for (const kind of ["toString", "__proto__", "constructor", "nonsense"]) {
    const r = await runFeature(env, "t_rev", NREQ, { deps: { aiAdapters: { openai: adapter(async () => ({ ok: false, kind })) }, aiFeatures: F, sleep: async () => {} } });
    assert.deepEqual(r.attempts.map(a => a.kind), ["server_error", "server_error"], kind);
  }
  assert.match(readFileSync(join(ROOT, "backend", "src", "ai", "gateway.js"), "utf8"), /Object\.hasOwn\(POLICY/);
});

test("review 8: budget settle uses portable CASE WHEN (no scalar MAX) and never goes below 0", async () => {
  const src = readFileSync(join(ROOT, "backend", "src", "ai", "db.js"), "utf8");
  assert.ok(!/MAX\(/.test(src.replace(/MAX_SAFE_INTEGER/g, "")));
  assert.match(src, /CASE WHEN n \+ \?4 < 0 THEN 0 ELSE n \+ \?4 END/);
  const env = envOf();
  const { reserveBudget, adjustBudget, budgetUsed } = await import(B + "ai/db.js");
  await reserveBudget(env.DB, "2026-11-01", "f", 100, 1000);
  await adjustBudget(env.DB, "2026-11-01", "f", -500);
  assert.equal(await budgetUsed(env.DB, "2026-11-01", "f"), 0);
  await adjustBudget(env.DB, "2026-11-01", "f", 30);
  assert.equal(await budgetUsed(env.DB, "2026-11-01", "f"), 30);
});

test("review 9: an unsupported schema fails closed and gives every rate-limit bucket back", async () => {
  const env = envOf();
  const F = feat({ build: () => ({ system: "s", text: "t", output: { name: "t", schema: { type: "string", pattern: "^a" } } }) });
  await configure(env, F, { chain: [{ provider: "openai", model: "gpt-6-luna" }] });
  const { handle } = await import(B + "index.js");
  const called = { n: 0 };
  const rq = req("/v1/ai/t_rev", { method: "POST", body: { consent: true, providers: ["openai"], mode: "text", input: { text: "x" } }, headers: { "X-Turnstile-Token": "good" } });
  const verify = async () => new Response(JSON.stringify({ success: true, action: "ai", hostname: "site.example" }));
  const r = await handle(rq, env, { fetch: verify, aiFeatures: F, aiAdapters: { openai: adapter(async () => { called.n++; return { ok: true, json: "a" }; }) } });
  const j = await r.json();
  assert.equal(r.status, 503); assert.deepEqual([j.fallback, j.reason], [true, "not_configured"]);
  assert.equal(called.n, 0);
  const n = (await env.DB.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM rate_limits WHERE key LIKE 'ai:t_rev:%'").first()).n;
  assert.equal(n, 0, "limits given back");
});

test("review 3: a stored key the gateway does not read is explained (admin AI tab + fortune status, TH/EN/ZH)", async () => {
  const s = await import(B + "settings.js");
  const env = createEnv({ SECRETS_KEK: KEK, TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ADMIN_BOOTSTRAP_TOKEN: "t".repeat(40) });
  await s.setApiKey(env, KEY);
  const { handle } = await import(B + "index.js");
  const st = await (await handle(req("/api/fortune/status"), env)).json();
  assert.deepEqual([st.enabled, st.reason], [false, "key_stored_not_used"]);
  for (const l of ["th", "en", "zh"]) assert.match(st.message[l], /legacyKeyStore/);
  assert.ok(!JSON.stringify(st).includes(KEY.slice(-8)));
  const call = async (p, o = {}) => handle(req(p, { method: o.method || "GET", body: o.body, headers: o.headers || {} }), env);
  await call("/admin/api/bootstrap", { method: "POST", body: { token: "t".repeat(40), username: "owner", password: "correct horse battery staple" } });
  const tok = (await (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: "correct horse battery staple", mode: "bearer" } })).json()).token;
  const ai = await (await call("/admin/api/ai", { headers: { Authorization: "Bearer " + tok } })).json();
  assert.equal(ai.legacy_key_store, false);
  assert.match(ai.legacy_key_unused.en, /stored but not used/);
  const { putGateway } = await import(B + "ai/settings.js");
  await putGateway(env.DB, { legacyKeyStore: true });
  const st2 = await (await handle(req("/api/fortune/status"), env)).json();
  assert.equal(st2.enabled, true, "legacy store on -> the stored key is used");
  assert.equal((await (await call("/admin/api/ai", { headers: { Authorization: "Bearer " + tok } })).json()).legacy_key_unused, null);
  const en = readFileSync(join(ROOT, "i18n", "en-admin.js"), "utf8"), zh = readFileSync(join(ROOT, "i18n", "zh-admin.js"), "utf8");
  assert.match(en, /"adg\.legacyUnused"/); assert.match(zh, /"adg\.legacyUnused"/);
  assert.match(readFileSync(join(ROOT, "admin.html"), "utf8"), /id="adKeyLegacy"/);
});

test("review 4: consent shows the retention / training note of EVERY provider and how to withdraw (TH/EN/ZH)", () => {
  const AI = require("../../lensiq-ai.js");
  const L3 = (th, en, zh) => ({ th, en, zh });
  const info = { feature: "pc_fields", imageModeAllowed: false, chain: [
    { provider: "anthropic", model: "m1", name: L3("A", "A", "A"), region: L3("สหรัฐฯ", "USA", "美国"), retention: L3("ลบ 30 วัน", "Deleted in 30 days", "30 天删除") },
    { provider: "deepseek", model: "m2", name: L3("D", "D", "D"), region: L3("จีน", "China", "中国"), retention: L3("เก็บในจีน อาจนำไปฝึก", "Stored in China; may train", "存于中国，可能训练") }
  ] };
  for (const l of ["th", "en", "zh"]) {
    const v = AI.consentView(info, l, "text");
    assert.deepEqual(v.retentions, info.chain.map(c => c.name[l] + ": " + c.retention[l]));
    assert.equal(v.withdrawHow, AI.STR[l].withdrawHow);
    assert.ok(AI.STR[l].withdrawHow.length > 10 && AI.STR[l].retentionAll.length > 3);
  }
  assert.match(readFileSync(join(ROOT, "lensiq-ai.js"), "utf8"), /v\.withdrawHow/);
  assert.match(readFileSync(join(ROOT, "docs", "PDPA-NOTES-FOR-COUNSEL.md"), "utf8"), /retention \/ training note of every provider/);
});

test("review 5: lint guard blocks provider SDK package imports outside ai/adapters (bare words stay allowed)", async () => {
  const { scan } = await import(join(ROOT, "tools", "check-ai-providers.mjs"));
  const tmp = mkdtempSync(join(tmpdir(), "lq-guard2-"));
  try {
    mkdirSync(join(tmp, "backend", "src", "ai", "adapters"), { recursive: true });
    const planted = ['import OpenAI from "openai";', 'import { GoogleGenAI } from "@google/genai";', "const g = require('@google/generative-ai');",
      'const m = await import("@anthropic-ai/bedrock-sdk");', 'import Groq from "groq-sdk";', 'import { Mistral } from "@mistralai/mistralai";', 'import "openai";'];
    planted.forEach((s, i) => writeFileSync(join(tmp, "backend", "src", `imp${i}.js`), s + "\n"));
    writeFileSync(join(tmp, "backend", "src", "ai", "adapters", "ok.js"), planted.join("\n") + "\n");
    writeFileSync(join(tmp, "backend", "src", "words.js"), 'export const label = "openai gemini"; // provider names as words are fine\n');
    const files = [...new Set(scan(tmp).map(h => h.file))].sort();
    assert.deepEqual(files, planted.map((_, i) => `backend/src/imp${i}.js`).sort());
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
