"use strict";
// tests/unit/backend-ai-adapters.test.js — round 17 P6 "provider adapters" FIXED TEST SET (docs/AI-GATEWAY.md §10 rows
// 25–35, written before the adapter code). Every adapter gets an injected fetchImpl; the global fetch is replaced by one
// that fails the test if it is ever called. No real keys, no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const A = B + "ai/adapters/";
const KEY = "test-key-" + "z".repeat(32);
const WS = "ws-test-123";

const realFetch = globalThis.fetch;
test.before(() => { globalThis.fetch = async () => { throw new Error("NETWORK USED IN A TEST"); }; });
test.after(() => { globalThis.fetch = realFetch; });

const SCHEMA = { type: "object", properties: { answer: { type: "string", maxLength: 40 }, n: { type: ["integer", "null"] } }, required: ["answer", "n"], additionalProperties: false };
const REQ = { system: "SYSTEM-RULES", text: "USER-TEXT", output: { name: "pc_test", schema: SCHEMA }, maxOutputTokens: 700 };
const IMG = { mime: "image/png", base64: "iVBORw0KGgo=", width: 10, height: 10 };
const REQ_IMG = { ...REQ, images: [IMG] };
const GOOD = { answer: "ok", n: 1 };

/** Recording mock fetch; `reply(n, url, init)` returns a Response or throws. */
function mockFetch(reply) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url: String(url), init, body: init && init.body ? JSON.parse(init.body) : null }); return reply(calls.length, String(url), init); };
  f.calls = calls;
  return f;
}
const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...headers } });

/** OpenAI-compatible success body. */
const oaiOk = (content, extra = {}) => ({
  id: "req-abc", model: extra.model || "served-model", choices: [{ index: 0, finish_reason: extra.finish || "stop", message: { role: "assistant", content, ...(extra.message || {}) } }],
  usage: { prompt_tokens: 120, completion_tokens: 80, completion_tokens_details: { reasoning_tokens: 30 }, prompt_tokens_details: { cached_tokens: 20 }, ...(extra.usage || {}) },
  ...(extra.top || {})
});
const gemOk = (text, extra = {}) => ({
  responseId: "gem-1", modelVersion: "gemini-3.5-flash-lite",
  candidates: [{ finishReason: extra.finish || "STOP", content: { parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 50, thoughtsTokenCount: 30, cachedContentTokenCount: 20 },
  ...(extra.top || {})
});

const MODELS = { gemini: "gemini-3.5-flash-lite", openai: "gpt-6-luna", dashscope: "qwen3-vl-plus", deepseek: "deepseek-flash", zai: "glm-4.6v", kimi: "kimi-k3", openrouter: "openai/gpt-6-luna" };
const IDS = Object.keys(MODELS);
const OAI = IDS.filter(i => i !== "gemini");
const ctxOf = (fetchImpl, extra = {}) => ({ key: KEY, timeoutMs: 5000, fetchImpl, signal: new AbortController().signal, config: { workspaceId: WS }, ...extra });
async function adapterOf(id) { return (await import(A + "index.js")).ADAPTERS[id]; }
const okBody = id => (id === "gemini" ? gemOk(JSON.stringify(GOOD)) : oaiOk(JSON.stringify(GOOD)));

// ---- 25: request shape ------------------------------------------------------------------------------------------

const ENDPOINTS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
  openai: "https://api.openai.com/v1/chat/completions",
  dashscope: `https://${WS}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions`,
  deepseek: "https://api.deepseek.com/chat/completions",
  zai: "https://api.z.ai/api/paas/v4/chat/completions",
  kimi: "https://api.moonshot.ai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions"
};

test("25 request shape: documented endpoint, POST, key only in the auth header, JSON mode, token limit, abort signal", async () => {
  for (const id of IDS) {
    const a = await adapterOf(id);
    assert.ok(a, id + " adapter registered");
    const f = mockFetch(() => json(okBody(id)));
    const ctx = ctxOf(f);
    const r = await a.call(REQ, { provider: id, model: MODELS[id] }, ctx);
    assert.equal(r.ok, true, id + " " + JSON.stringify(r));
    assert.equal(f.calls.length, 1, id);
    const c = f.calls[0];
    assert.equal(c.url, ENDPOINTS[id], id + " endpoint");
    assert.equal(c.init.method, "POST");
    assert.equal(c.init.signal, ctx.signal, id + " AbortSignal passed to fetch");
    assert.ok(!c.url.includes(KEY) && !c.init.body.includes(KEY), id + " key outside header");
    const h = c.init.headers;
    if (id === "gemini") assert.equal(h["x-goog-api-key"], KEY); else assert.equal(h.Authorization, "Bearer " + KEY);
    assert.equal(h["Content-Type"], "application/json");
    const b = c.body;
    if (id === "gemini") {
      assert.equal(b.generationConfig.responseMimeType, "application/json");
      assert.deepEqual(b.generationConfig.responseJsonSchema.required, ["answer", "n"]);
      assert.equal(b.generationConfig.maxOutputTokens, 700);
      assert.equal(b.systemInstruction.parts[0].text.startsWith("SYSTEM-RULES"), true);
      assert.ok(b.contents[0].parts.some(p => p.text === "USER-TEXT"));
      continue;
    }
    assert.equal(b.model, MODELS[id]);
    assert.equal(b.stream, undefined, "no streaming");
    assert.ok(b.messages[0].role === "system" && b.messages[0].content.startsWith("SYSTEM-RULES"));
    const limit = b.max_completion_tokens ?? b.max_tokens;
    assert.equal(limit, 700, id + " token limit");
    const rf = b.response_format;
    if (["openai", "kimi", "openrouter"].includes(id)) {
      assert.equal(rf.type, "json_schema", id);
      assert.equal(rf.json_schema.strict, true);
      assert.match(rf.json_schema.name, /^[A-Za-z0-9_-]{1,64}$/);
      assert.deepEqual(rf.json_schema.schema.required, ["answer", "n"]);
    } else if (id === "zai" || id === "deepseek" || id === "dashscope") {
      assert.deepEqual(rf, { type: "json_object" }, id);
      assert.match(b.messages[0].content, /JSON/, id + " prompt names JSON and carries the schema");
      assert.match(b.messages[0].content, /"answer"/);
    }
    if (id === "openai") assert.equal(b.store, false, "OpenAI: completion not stored");
    if (id === "dashscope") assert.equal(b.enable_thinking, false, "Qwen structured output: non-thinking mode");
  }
});

test("25 image parts in each provider's format; an image for a text-only model is refused before any request", async () => {
  for (const id of IDS) {
    const a = await adapterOf(id);
    assert.equal(a.capabilities(MODELS[id]).vision, true, id + " default model reads images");
    const f = mockFetch(() => json(okBody(id)));
    const r = await a.call(REQ_IMG, { provider: id, model: MODELS[id] }, ctxOf(f));
    assert.equal(r.ok, true, id);
    const b = f.calls[0].body;
    if (id === "gemini") {
      assert.deepEqual(b.contents[0].parts[0], { inlineData: { mimeType: "image/png", data: IMG.base64 } });
    } else {
      const parts = b.messages[1].content;
      assert.ok(Array.isArray(parts), id + " content array");
      assert.deepEqual(parts[0], { type: "image_url", image_url: { url: "data:image/png;base64," + IMG.base64 } });
      assert.deepEqual(parts[parts.length - 1], { type: "text", text: "USER-TEXT" });
    }
    if (id === "zai") assert.equal(b.response_format, undefined, "z.ai vision requests take no response_format (prompt + gateway validation)");
  }
  const ds = await adapterOf("deepseek");
  const f = mockFetch(() => json(oaiOk("{}")));
  const r = await ds.call(REQ_IMG, { provider: "deepseek", model: "deepseek-v4-pro" }, ctxOf(f));
  assert.deepEqual([r.ok, r.kind, f.calls.length], [false, "unsupported", 0], "deepseek-v4-pro has no vision");
});

// ---- 26: success parse ------------------------------------------------------------------------------------------

test("26 success parse: JSON, served model, request id, usage (reasoning counted once)", async () => {
  for (const id of OAI) {
    const a = await adapterOf(id);
    const fenced = "```json\n" + JSON.stringify(GOOD) + "\n```";
    const f = mockFetch(() => json(oaiOk(id === "deepseek" || id === "zai" || id === "dashscope" ? fenced : JSON.stringify(GOOD), { model: "served-" + id })));
    const r = await a.call(REQ, { provider: id, model: MODELS[id] }, ctxOf(f));
    assert.equal(r.ok, true, id);
    assert.deepEqual(r.json, GOOD);
    assert.equal(r.model, "served-" + id);
    assert.equal(r.providerRequestId, "req-abc");
    assert.equal(r.usage.inputTokens, 120);
    assert.equal(r.usage.cachedInputTokens, 20, "cached tokens reported (priced at the full input price unless the row says otherwise)");
    assert.equal(r.usage.reasoningTokens, 30);
    assert.equal(r.usage.outputTokens + r.usage.reasoningTokens, 80, id + ": completion tokens already include reasoning");
  }
  const g = await adapterOf("gemini");
  const r = await g.call(REQ, { provider: "gemini", model: MODELS.gemini }, ctxOf(mockFetch(() => json(gemOk(JSON.stringify(GOOD))))));
  assert.deepEqual([r.ok, r.model, r.providerRequestId], [true, "gemini-3.5-flash-lite", "gem-1"]);
  assert.deepEqual([r.usage.inputTokens, r.usage.outputTokens, r.usage.reasoningTokens], [120, 50, 30], "Gemini thoughts = reasoning tokens");
  // DeepSeek reports cache hits in its own field
  const d = await adapterOf("deepseek");
  const dsUsage = { prompt_tokens: 50, completion_tokens: 10, prompt_cache_hit_tokens: 40, completion_tokens_details: undefined, prompt_tokens_details: undefined };
  const rd = await d.call(REQ, { provider: "deepseek", model: MODELS.deepseek }, ctxOf(mockFetch(() => json(oaiOk(JSON.stringify(GOOD), { usage: dsUsage })))));
  assert.deepEqual([rd.usage.inputTokens, rd.usage.outputTokens, rd.usage.reasoningTokens, rd.usage.cachedInputTokens], [50, 10, 0, 40]);
});

// ---- 27: error kinds --------------------------------------------------------------------------------------------

const errBody = (id, status, extra = {}) => {
  if (id === "gemini") return { error: { code: status, message: "x", status: extra.gstatus || "X", details: extra.details || [] } };
  if (id === "zai") return { error: { code: String(extra.code || 1200), message: "x" } };
  if (id === "dashscope") return { error: { code: extra.code || "x", message: "x" }, request_id: "ds-req" };
  return { error: { code: extra.code || null, type: extra.type || null, message: "x" } };
};

test("27 error kinds: status codes, retry-after, network, abort — same taxonomy for every adapter", async () => {
  for (const id of IDS) {
    const a = await adapterOf(id);
    const entry = { provider: id, model: MODELS[id] };
    const run = async (reply, ctx) => a.call(REQ, entry, ctx || ctxOf(mockFetch(reply)));
    const cases = [
      [429, "rate_limited"], [500, "server_error"], [502, "server_error"], [503, "overloaded"], [401, "auth"], [403, id === "openrouter" ? "content_policy_input" : "auth"],
      [400, "bad_request"], [404, "bad_request"], [422, "bad_request"]
    ];
    for (const [status, kind] of cases) {
      if (id === "openrouter" && status === 403) continue; // OpenRouter 403 = moderation (own test below)
      const r = await run(() => json(errBody(id, status), status, status === 429 ? { "retry-after": "2" } : {}));
      assert.equal(r.ok, false);
      assert.equal(r.kind, kind, `${id} ${status} -> ${kind} (got ${r.kind})`);
      assert.equal(r.httpStatus, status);
      if (status === 429) assert.equal(r.retryAfterMs, 2000, id + " retry-after");
    }
    const conn = await run(() => { throw new TypeError("fetch failed"); });
    assert.equal(conn.kind, "connection", id);
    const ac = new AbortController(); ac.abort();
    const abort = () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; };
    const ab = await run(abort, ctxOf(mockFetch(abort), { signal: ac.signal }));
    assert.equal(ab.kind, "timeout", id);
    const notJson = await run(() => new Response("<html>bad gateway</html>", { status: 200 }));
    assert.equal(notJson.kind, "invalid_json", id + " non-JSON body");
    for (const bad of ["", "not json {"]) {
      const r = await run(() => json(id === "gemini" ? gemOk(bad) : oaiOk(bad)));
      assert.equal(r.kind, "invalid_json", `${id} content ${JSON.stringify(bad)}`);
      assert.equal(r.usage.inputTokens, 120, id + " usage kept for a billed failure");
    }
    const trunc = await run(() => json(id === "gemini" ? gemOk('{"a', { finish: "MAX_TOKENS" }) : oaiOk('{"a', { finish: "length" })));
    assert.equal(trunc.kind, "truncated", id);
  }
});

test("27 provider-specific kinds: billing -> auth, content filters, refusals", async () => {
  const call = async (id, reply, model) => (await adapterOf(id)).call(REQ, { provider: id, model: model || MODELS[id] }, ctxOf(mockFetch(reply)));
  // billing / balance problems are configuration errors (alert the admin), never "retry later"
  assert.equal((await call("openai", () => json(errBody("openai", 429, { code: "insufficient_quota", type: "insufficient_quota" }), 429))).kind, "auth");
  assert.equal((await call("deepseek", () => json(errBody("deepseek", 402), 402))).kind, "auth");
  assert.equal((await call("openrouter", () => json(errBody("openrouter", 402), 402))).kind, "auth");
  assert.equal((await call("zai", () => json(errBody("zai", 429, { code: 1113 }), 429))).kind, "auth", "z.ai 1113 insufficient balance");
  assert.equal((await call("zai", () => json(errBody("zai", 429, { code: 1302 }), 429))).kind, "rate_limited");
  assert.equal((await call("dashscope", () => json(errBody("dashscope", 403, { code: "Arrearage" }), 403))).kind, "auth");
  // input content filters: the same input is never shopped around
  assert.equal((await call("zai", () => json(errBody("zai", 400, { code: 1301 }), 400))).kind, "content_policy_input");
  assert.equal((await call("dashscope", () => json(errBody("dashscope", 400, { code: "data_inspection_failed" }), 400))).kind, "content_policy_input");
  assert.equal((await call("openai", () => json(errBody("openai", 400, { code: "content_policy_violation" }), 400))).kind, "content_policy_input");
  assert.equal((await call("openrouter", () => json({ error: { code: 403, message: "flagged", metadata: { reasons: ["x"], provider_name: "X" } } }, 403))).kind, "content_policy_input");
  // output refusals / output filters (billed, next provider)
  assert.equal((await call("openai", () => json(oaiOk(null, { message: { refusal: "I can't help" } })))).kind, "refusal");
  assert.equal((await call("zai", () => json(oaiOk("", { finish: "sensitive" })))).kind, "refusal");
  assert.equal((await call("kimi", () => json(oaiOk("", { finish: "content_filter" })))).kind, "refusal");
  // OpenRouter returns some generation errors with HTTP 200 and an error object
  assert.equal((await call("openrouter", () => json({ error: { code: 502, message: "upstream down" } }, 200))).kind, "server_error");
});

// ---- 28: Gemini -------------------------------------------------------------------------------------------------

test("28 Gemini: paid tier only (free-tier quota -> auth), prompt block -> content_policy_input, RetryInfo honoured, admin note", async () => {
  const g = await adapterOf("gemini");
  const entry = { provider: "gemini", model: MODELS.gemini };
  const quota = { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] };
  const free = errBody("gemini", 429, { gstatus: "RESOURCE_EXHAUSTED", details: [quota] });
  const rf = await g.call(REQ, entry, ctxOf(mockFetch(() => json(free, 429))));
  assert.deepEqual([rf.kind, rf.freeTier], ["auth", true], "free-tier key refused as a configuration error");
  const paid = errBody("gemini", 429, { gstatus: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "3s" }] });
  const rp = await g.call(REQ, entry, ctxOf(mockFetch(() => json(paid, 429))));
  assert.deepEqual([rp.kind, rp.retryAfterMs], ["rate_limited", 3000]);
  const blocked = { promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: 10 } };
  assert.equal((await g.call(REQ, entry, ctxOf(mockFetch(() => json(blocked))))).kind, "content_policy_input");
  assert.equal((await g.call(REQ, entry, ctxOf(mockFetch(() => json(gemOk("", { finish: "SAFETY" })))))).kind, "refusal");
  assert.equal((await g.call(REQ, entry, ctxOf(mockFetch(() => json(errBody("gemini", 504, { gstatus: "DEADLINE_EXCEEDED" }), 504))))).kind, "timeout");
  const { PROVIDERS } = await import(A + "index.js");
  for (const l of ["th", "en", "zh"]) assert.ok(PROVIDERS.gemini.note && PROVIDERS.gemini.note[l].length > 5, "admin note " + l);
  assert.match(PROVIDERS.gemini.note.en, /paid tier/i);
  assert.match(readFileSync(join(ROOT, "admin.js"), "utf8"), /p\.note/, "admin shows the provider note");
});

// ---- 29: OpenRouter ---------------------------------------------------------------------------------------------

test("29 OpenRouter: zero retention + no data collection forced, served model and routed provider read, second processor named", async () => {
  const o = await adapterOf("openrouter");
  const f = mockFetch(() => json(oaiOk(JSON.stringify(GOOD), { model: "openai/gpt-6-luna", top: { provider: "OpenAI" }, usage: { cost: 0.00012 } })));
  const sneaky = { ...REQ, provider: { data_collection: "allow", zdr: false } };
  const r = await o.call(sneaky, { provider: "openrouter", model: "openai/gpt-6-luna" }, ctxOf(f));
  const p = f.calls[0].body.provider;
  assert.equal(p.data_collection, "deny");
  assert.equal(p.zdr, true);
  assert.equal(p.require_parameters, true);
  assert.ok(p.max_price && p.max_price.prompt > 0 && p.max_price.completion > 0, "price ceiling sent");
  assert.deepEqual([r.ok, r.model, r.routedProvider], [true, "openai/gpt-6-luna", "OpenAI"]);
  assert.equal(r.usage.reportedCostMicros, 120, "the provider-reported cost (USD) is passed on");
  const odd = await o.call(REQ, { provider: "openrouter", model: "x/y" }, ctxOf(mockFetch(() => json(oaiOk(JSON.stringify(GOOD), { top: { provider: "<script>Evil‮" } })))));
  assert.match(odd.routedProvider, /^[A-Za-z0-9 ._()-]{0,40}$/, "routed provider name sanitised");
  const { PROVIDERS } = await import(A + "index.js");
  const or = PROVIDERS.openrouter;
  assert.match(or.name.en + or.region.en, /second processor/i);
  assert.match(or.name.th + or.region.th, /ผู้ประมวลผล/);
  assert.match(or.name.zh + or.region.zh, /处理方/);
  // the consent screen (public provider view) carries the same text
  const { publicProvider } = await import(A + "index.js");
  assert.match(publicProvider("openrouter").name.en + publicProvider("openrouter").region.en, /second processor/i);
  // the result card names the routed provider too (browser helper, TH/EN/ZH)
  const AI = require("../../lensiq-ai.js");
  const res = { providerName: or.name, regionText: or.region, routedVia: "OpenAI" };
  for (const l of ["th", "en", "zh"]) {
    const t = AI.checkedBy(res, l);
    assert.ok(t.includes(or.name[l]) && t.includes("OpenAI"), l + ": " + t);
  }
  assert.ok(!AI.checkedBy({ providerName: or.name, regionText: or.region }, "en").includes("routed to"), "no routed text without a routed provider");
});

test("29 OpenRouter through the gateway: a dearer served model never pushes the budget past the cap; alert raised; result names the routed provider", async () => {
  const env = createEnv({ OPENROUTER_API_KEY: KEY });
  const F = { t_or: { id: "t_or", status: "live", label: { th: "t", en: "t", zh: "t" }, build: () => REQ } };
  const { putGateway } = await import(B + "ai/settings.js");
  const orChain = [{ provider: "openrouter", model: "openai/gpt-6-luna" }];
  await putGateway(env.DB, { enabled: true, features: { t_or: { enabled: true, chain: orChain, monthlyBudgetUsd: 0.04, maxOutputTokens: 500 } } }, { features: F });
  // the router serves a much dearer model and reports its real cost (0.05 USD)
  const f = mockFetch(() => json(oaiOk(JSON.stringify(GOOD), { model: "openai/gpt-6-astra", top: { provider: "OpenAI" }, usage: { prompt_tokens: 1000, completion_tokens: 500, cost: 0.05 } })));
  const { runFeature } = await import(B + "ai/gateway.js");
  const r = await runFeature(env, "t_or", REQ, { deps: { aiFeatures: F, aiFetch: f } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.routedProvider, "OpenAI");
  assert.ok(r.costMicros >= 50000, "real (reported) cost kept in the aggregates");
  const { budgetUsed } = await import(B + "ai/db.js");
  assert.ok(await budgetUsed(env.DB, r.month, "t_or") <= 40000, "budget counter <= cap");
  const al = await env.DB.prepare("SELECT kind, detail FROM alerts").all();
  assert.ok(al.results.some(a => a.kind === "ai_config_error" && /cost_over_reservation/.test(a.detail)), "overshoot alerted");
});

// ---- 30: DeepSeek consent text ----------------------------------------------------------------------------------

test("30 DeepSeek consent text: stored in the PRC and may be used for training (TH/EN/ZH)", async () => {
  const { PROVIDERS } = await import(A + "index.js");
  const d = PROVIDERS.deepseek;
  assert.match(d.region.en + d.retention.en, /People's Republic of China/);
  assert.match(d.retention.en, /may be used for training/i);
  assert.match(d.retention.th, /จีน/); assert.match(d.retention.th, /ฝึก/);
  assert.match(d.retention.zh, /中国/); assert.match(d.retention.zh, /训练/);
});

// ---- 31: prices -------------------------------------------------------------------------------------------------

test("31 prices: as-of date + official source per row, or unverified; unverified rows use the conservative ceiling", async () => {
  const P = await import(A + "prices.js");
  for (const row of P.PRICES) {
    if (row.unverified) continue;
    assert.match(row.asOf || "", /^\d{4}-\d{2}-\d{2}$/, row.provider + " " + row.model + " asOf");
    assert.match(row.source || "", /^https:\/\//, row.provider + " " + row.model + " source");
  }
  for (const id of ["anthropic", ...IDS]) assert.ok(P.PRICES.some(p => p.provider === id), id + " has a price row");
  const kimi = P.PRICES.find(p => p.provider === "kimi" && p.model === "kimi-k3");
  assert.equal(kimi.unverified, true, "Kimi price not confirmed on the provider's own page");
  const eff = P.priceAt("kimi", "kimi-k3", "2026-11-10");
  assert.ok(eff.inPerM >= P.CONSERVATIVE.inPerM && eff.outPerM >= P.CONSERVATIVE.outPerM, "kimi reserves at the ceiling");
  const any = P.priceAt("openrouter", "some/new-model", "2026-11-10");
  assert.ok(any && any.unverified && any.outPerM >= P.CONSERVATIVE.outPerM, "OpenRouter: an unlisted model is priced at the ceiling");
  assert.equal(P.priceAt("openai", "no-such-model", "2026-11-10"), null, "other providers: no row = no price (skipped when a budget is set)");
  // verified rows are returned as listed
  assert.deepEqual([P.priceAt("deepseek", "deepseek-flash", "2026-11-10").inPerM, P.priceAt("deepseek", "deepseek-flash", "2026-11-10").outPerM], [0.30, 1.20]);
  // a model with an unverified price runs under a budget, reserved conservatively (gateway estimate)
  const { estimateMicros } = await import(B + "ai/gateway.js");
  assert.ok(estimateMicros(eff, REQ) >= 700 * P.CONSERVATIVE.outPerM);
});

// ---- 32: key check ----------------------------------------------------------------------------------------------

test("32 key check: documented endpoints; DashScope needs its workspace id; z.ai tokenizer generates nothing", async () => {
  const { KEYCHECK, checkKeys } = await import(A + "keycheck.js");
  for (const id of Object.keys(KEYCHECK)) assert.equal(KEYCHECK[id].verified, true, id + " endpoint verified from the docs");
  const vars = { DASHSCOPE_API_KEY: KEY, DASHSCOPE_WORKSPACE_ID: WS, ZAI_API_KEY: KEY };
  const f = mockFetch(() => json({ ok: true }));
  const rows = await checkKeys(vars, f);
  const ds = f.calls.find(c => c.url.includes("maas.aliyuncs.com"));
  assert.equal(ds.url, `https://${WS}.ap-southeast-1.maas.aliyuncs.com/api/v1/models?page_size=1`);
  assert.equal(ds.init.method, "GET");
  const z = f.calls.find(c => c.url.includes("z.ai"));
  assert.equal(z.url, "https://api.z.ai/api/paas/v4/tokenizer");
  assert.equal(z.init.method, "POST");
  for (const c of f.calls) { assert.ok(!c.url.includes(KEY)); assert.ok(!(c.init.body || "").includes(KEY)); }
  assert.deepEqual(rows.filter(r => r.status !== "SKIP").map(r => [r.provider, r.status]), [["dashscope", "OK"], ["zai", "OK"]]);
  const f2 = mockFetch(() => json({}));
  const rows2 = await checkKeys({ DASHSCOPE_API_KEY: KEY }, f2);
  const d2 = rows2.find(r => r.provider === "dashscope");
  assert.deepEqual([d2.status, d2.http, f2.calls.length], ["FAIL", null, 0], "no workspace id -> FAIL, no request");
  assert.match(d2.note || "", /DASHSCOPE_WORKSPACE_ID/);
  const { formatLine, parseVars } = await import(join(ROOT, "tools", "ai-key-check.mjs"));
  assert.match(formatLine(d2), /DASHSCOPE_WORKSPACE_ID/);
  assert.deepEqual(parseVars("DASHSCOPE_WORKSPACE_ID=abc\n"), { DASHSCOPE_WORKSPACE_ID: "abc" });
});

test("32 DashScope without a workspace id is never offered on the consent screen", async () => {
  const env = createEnv({ DASHSCOPE_API_KEY: KEY });
  const { putGateway } = await import(B + "ai/settings.js");
  await putGateway(env.DB, { enabled: true, features: { pc_claims: { enabled: true, chain: [{ provider: "dashscope", model: "qwen3.7-plus" }], monthlyBudgetUsd: 1 } } });
  const { providersInfo } = await import(B + "ai/gateway.js");
  assert.deepEqual((await providersInfo(env, "pc_claims")).chain, []);
  const env2 = createEnv({ DASHSCOPE_API_KEY: KEY, DASHSCOPE_WORKSPACE_ID: WS });
  await putGateway(env2.DB, { enabled: true, features: { pc_claims: { enabled: true, chain: [{ provider: "dashscope", model: "qwen3.7-plus" }], monthlyBudgetUsd: 1 } } });
  assert.deepEqual((await providersInfo(env2, "pc_claims")).chain.map(c => c.provider), ["dashscope"]);
});

// ---- 33: default chains -----------------------------------------------------------------------------------------

test("33 default chains: verified prices, no training on API data, vision for pc_fields; still off with budget 0", async () => {
  const { DEFAULT_GATEWAY } = await import(B + "ai/settings.js");
  const { DEFAULT_CHAINS, ADAPTERS, NO_TRAINING } = await import(A + "index.js");
  const { priceAt } = await import(A + "prices.js");
  for (const f of ["pc_fields", "pc_claims", "pc_translate"]) {
    const fs = DEFAULT_GATEWAY.features[f];
    assert.deepEqual(fs.chain, DEFAULT_CHAINS[f], f);
    assert.ok(fs.chain.length >= 2, f + " has a fallback");
    assert.equal(fs.enabled, false); assert.equal(fs.monthlyBudgetUsd, 0);
    for (const e of fs.chain) {
      const p = priceAt(e.provider, e.model, "2026-11-10");
      assert.ok(p && !p.unverified, `${f}: ${e.provider}/${e.model} verified price`);
      assert.ok(NO_TRAINING.includes(e.provider), `${f}: ${e.provider} does not train on API data`);
      if (f === "pc_fields") assert.equal(ADAPTERS[e.provider].capabilities(e.model).vision, true, e.model + " vision");
    }
  }
  assert.ok(!("fortune_reword" in DEFAULT_CHAINS));
});

// ---- 34: registry -----------------------------------------------------------------------------------------------

test("34 registry: every allowlisted provider has an adapter, region, retention and secret; consent shows them all", async () => {
  const { PROVIDERS, PROVIDER_IDS, ADAPTERS } = await import(A + "index.js");
  for (const id of PROVIDER_IDS) {
    assert.ok(ADAPTERS[id] && typeof ADAPTERS[id].call === "function", id + " adapter");
    assert.equal(ADAPTERS[id].id, id);
    assert.equal(typeof ADAPTERS[id].region(), "string");
    for (const f of ["name", "region", "retention"]) for (const l of ["th", "en", "zh"]) assert.ok(PROVIDERS[id][f][l].length > 1, `${id}.${f}.${l}`);
  }
  const env = createEnv(Object.fromEntries(PROVIDER_IDS.map(id => [PROVIDERS[id].secret, KEY]).concat([["DASHSCOPE_WORKSPACE_ID", WS]])));
  const { putGateway } = await import(B + "ai/settings.js");
  const chain = [["gemini", "gemini-3.5-flash-lite"], ["openai", "gpt-6-luna"], ["dashscope", "qwen3-vl-plus"], ["deepseek", "deepseek-flash"], ["zai", "glm-4.6v"], ["kimi", "kimi-k3"]]
    .map(([provider, model]) => ({ provider, model }));
  await putGateway(env.DB, { enabled: true, features: { pc_fields: { enabled: true, chain, monthlyBudgetUsd: 1 } } });
  const { providersInfo } = await import(B + "ai/gateway.js");
  const info = await providersInfo(env, "pc_fields");
  assert.deepEqual(info.chain.map(c => c.provider), chain.map(c => c.provider));
  for (const s of [KEY, WS]) assert.ok(!JSON.stringify(info).includes(s), "no secret / config value on the consent screen");
});

// ---- 35: no SDK, lint guard -------------------------------------------------------------------------------------

test("35 no provider SDK dependency; adapters use plain fetch; lint guard clean", async () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "backend", "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), ["@anthropic-ai/sdk"], "only the existing Anthropic SDK");
  const dir = join(ROOT, "backend", "src", "ai", "adapters");
  for (const f of readdirSync(dir).filter(n => n.endsWith(".js") && n !== "anthropic.js")) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.ok(!/from\s+["'](?:openai|@google\/genai|@google\/generative-ai|groq-sdk)["']/.test(src), f + " imports no SDK");
  }
  const { scan } = await import(join(ROOT, "tools", "check-ai-providers.mjs"));
  assert.deepEqual(scan(ROOT), []);
});

// ---- 36–43: independent-review fixes (2026-11-10) ---------------------------------------------------------------

/** Captures util.log lines (console.log) while `fn` runs. */
async function captureLogs(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => { lines.push(a.map(String).join(" ")); };
  try { return { out: await fn(), lines }; } finally { console.log = orig; }
}
const feature = id => ({ [id]: { id, status: "live", label: { th: "t", en: "t", zh: "t" }, build: () => REQ } });

test("36 a key echoed in x-request-id, body id or served model never reaches the result or the log", async () => {
  const echo = { "x-request-id": KEY };
  for (const id of IDS) {
    const a = await adapterOf(id);
    const body = id === "gemini" ? gemOk(JSON.stringify(GOOD), { top: { responseId: KEY, modelVersion: KEY } })
      : oaiOk(JSON.stringify(GOOD), { model: KEY, top: { id: KEY, request_id: KEY, provider: KEY } });
    const r = await a.call(REQ, { provider: id, model: MODELS[id] }, ctxOf(mockFetch(() => json(body, 200, echo))));
    assert.equal(r.ok, true, id);
    assert.ok(!JSON.stringify(r).includes(KEY) && !JSON.stringify(r).includes(KEY.slice(0, 12)), id + " key in result");
    assert.equal(r.model, MODELS[id], id + ": an unsafe served model falls back to the requested model");
    assert.equal(r.providerRequestId, undefined, id);
  }
  // key-shaped values are refused even when they are not this key; over-long values too
  const o = await adapterOf("openai");
  for (const bad of ["sk-proj-abcdef123456", "AIzaSyABCDEF0123456789", "x".repeat(65)]) {
    const reply = () => json(oaiOk(JSON.stringify(GOOD), { model: bad, top: { id: bad } }));
    const r = await o.call(REQ, { provider: "openai", model: "gpt-6-luna" }, ctxOf(mockFetch(reply)));
    assert.deepEqual([r.model, r.providerRequestId], ["gpt-6-luna", undefined], bad.slice(0, 12));
  }
  const fineReply = () => json(oaiOk(JSON.stringify(GOOD), { model: "gpt-6-luna-2026-10-01" }));
  const fine = await o.call(REQ, { provider: "openai", model: "gpt-6-luna" }, ctxOf(mockFetch(fineReply)));
  assert.deepEqual([fine.model, fine.providerRequestId], ["gpt-6-luna-2026-10-01", "req-abc"], "normal values kept");
  // through the gateway: the log line carries neither
  const env = createEnv({ OPENAI_API_KEY: KEY });
  const F = feature("t_k");
  const { putGateway } = await import(B + "ai/settings.js");
  await putGateway(env.DB, { enabled: true, features: { t_k: { enabled: true, chain: [{ provider: "openai", model: "gpt-6-luna" }], monthlyBudgetUsd: 1 } } }, { features: F });
  const { runFeature } = await import(B + "ai/gateway.js");
  const f = mockFetch(() => json(oaiOk(JSON.stringify(GOOD), { model: KEY, top: { id: KEY } }), 200, echo));
  const { out, lines } = await captureLogs(() => runFeature(env, "t_k", REQ, { deps: { aiFeatures: F, aiFetch: f } }));
  assert.equal(out.ok, true);
  assert.ok(lines.some(l => l.includes("ai.attempt")), "attempt logged");
  for (const l of lines) assert.ok(!l.includes(KEY) && !l.includes(KEY.slice(0, 12)), "key in log line");
  assert.ok(!JSON.stringify(out).includes(KEY));
});

test("37 DashScope: a malformed workspace id is not ready (never offered) and the admin says invalid", async () => {
  const { providerReady, configState } = await import(A + "index.js");
  for (const bad of ["bad id", "a.b", "x/y", "-".repeat(65), "ws_1"]) {
    const env = createEnv({ DASHSCOPE_API_KEY: KEY, DASHSCOPE_WORKSPACE_ID: bad });
    assert.equal(providerReady(env, "dashscope"), false, bad);
    assert.equal(configState(env, "dashscope").DASHSCOPE_WORKSPACE_ID, "invalid", bad);
  }
  assert.equal(configState(createEnv({}), "dashscope").DASHSCOPE_WORKSPACE_ID, "missing");
  assert.equal(configState(createEnv({ DASHSCOPE_WORKSPACE_ID: WS }), "dashscope").DASHSCOPE_WORKSPACE_ID, "set");
  const env = createEnv({ DASHSCOPE_API_KEY: KEY, DASHSCOPE_WORKSPACE_ID: "bad id" });
  const { putGateway } = await import(B + "ai/settings.js");
  await putGateway(env.DB, { enabled: true, features: { pc_claims: { enabled: true, chain: [{ provider: "dashscope", model: "qwen3.7-plus" }], monthlyBudgetUsd: 1 } } });
  const { providersInfo, adminGateway } = await import(B + "ai/gateway.js");
  assert.deepEqual((await providersInfo(env, "pc_claims")).chain, []);
  const adm = (await adminGateway(env)).providers.find(p => p.id === "dashscope");
  assert.deepEqual([adm.config_set, adm.config_state.DASHSCOPE_WORKSPACE_ID], [false, "invalid"]);
  assert.ok(!JSON.stringify(adm).includes("bad id"), "the value itself is not shown");
  assert.match(readFileSync(join(ROOT, "admin.js"), "utf8"), /adg\.cfg\.invalid/);
  for (const f of ["i18n/en-admin.js", "i18n/zh-admin.js"]) assert.match(readFileSync(join(ROOT, f), "utf8"), /"adg\.cfg\.invalid"/);
  // the key check uses the same rule
  const { checkKeys } = await import(A + "keycheck.js");
  const f2 = mockFetch(() => json({}));
  const rows = await checkKeys({ DASHSCOPE_API_KEY: KEY, DASHSCOPE_WORKSPACE_ID: "bad id" }, f2);
  assert.deepEqual([rows.find(r => r.provider === "dashscope").status, f2.calls.length], ["FAIL", 0]);
});

test("38 lint guard knows the Alibaba hosts (aliyuncs, maas.)", async () => {
  const { PATTERNS } = await import(join(ROOT, "tools", "check-ai-providers.mjs"));
  const re = Object.fromEntries(PATTERNS);
  assert.ok(re.aliyuncs && re["maas."], "patterns present");
  assert.ok(re.aliyuncs.test("x.ap-southeast-1.maas.aliyuncs.com") && re["maas."].test("ws.ap-southeast-1.maas.aliyuncs.com"));
  assert.ok(!re["maas."].test("christmaas.x"), "only a host label");
});

test("39 z.ai consent text: training on API content not stated by the provider (TH/EN/ZH)", async () => {
  const { PROVIDERS } = await import(A + "index.js");
  const r = PROVIDERS.zai.retention;
  assert.match(r.en, /training on API content not stated by the provider/i);
  assert.match(r.th, /ไม่ได้ระบุ/); assert.match(r.th, /ฝึก/);
  assert.match(r.zh, /未说明/); assert.match(r.zh, /训练/);
});

test("40 OpenRouter max_price caps per request and per image; the price day is the gateway's", async () => {
  const o = await adapterOf("openrouter");
  const { ROUTER_CAPS } = await import(A + "prices.js");
  const f = mockFetch(() => json(oaiOk(JSON.stringify(GOOD))));
  await o.call(REQ_IMG, { provider: "openrouter", model: "x/y" }, ctxOf(f, { day: "2026-11-10" }));
  const mp = f.calls[0].body.provider.max_price;
  assert.deepEqual([mp.request, mp.image], [ROUTER_CAPS.requestUsd, ROUTER_CAPS.imageUsd]);
  assert.equal(mp.request, 0, "no per-request fee accepted");
  assert.ok(mp.image > 0 && mp.image <= 0.016);
  // the gateway passes its own price day to the adapter
  const env = createEnv({ OPENROUTER_API_KEY: KEY });
  const F = feature("t_d");
  const { putGateway } = await import(B + "ai/settings.js");
  await putGateway(env.DB, { enabled: true, features: { t_d: { enabled: true, chain: [{ provider: "openrouter", model: "x/y" }], monthlyBudgetUsd: 1 } } }, { features: F });
  let seenDay = null;
  const spy = { ...o, call: (r, e, ctx) => { seenDay = ctx.day; return o.call(r, e, ctx); } };
  const { runFeature } = await import(B + "ai/gateway.js");
  const t = Date.UTC(2026, 11, 15, 12) / 1000; // unix seconds (util.now)
  await runFeature(env, "t_d", REQ, { deps: { aiFeatures: F, aiAdapters: { openrouter: spy }, aiFetch: mockFetch(() => json(oaiOk(JSON.stringify(GOOD)))) }, t });
  assert.equal(seenDay, "2026-12-15");
});

test("41 reported cost: only a finite number from 0 to 100x the table cost is used; otherwise table cost + alert", async () => {
  const { runFeature } = await import(B + "ai/gateway.js");
  const F = feature("t_c");
  const { putGateway } = await import(B + "ai/settings.js");
  // table cost: openai gpt-6-luna, 1000 in x 0.10 + 500 out x 0.50 = 350 micro-USD
  const usage = { inputTokens: 1000, outputTokens: 500 };
  const cases = [[undefined, 350, false], [800, 800, false], [35000, 35000, false], [35001, 350, true], ["9000", 350, true], [NaN, 350, true], [-5, 350, true], [Infinity, 350, true]];
  for (const [rep, want, alert] of cases) {
    const env = createEnv({ OPENAI_API_KEY: KEY });
    await putGateway(env.DB, { enabled: true, features: { t_c: { enabled: true, chain: [{ provider: "openai", model: "gpt-6-luna" }], monthlyBudgetUsd: 1 } } }, { features: F });
    const ad = { id: "openai", capabilities: () => ({}), region: () => "us", call: async () => ({ ok: true, json: GOOD, model: "gpt-6-luna", usage: { ...usage, reportedCostMicros: rep } }) };
    const r = await runFeature(env, "t_c", REQ, { deps: { aiFeatures: F, aiAdapters: { openai: ad } } });
    assert.equal(r.costMicros, want, String(rep));
    const al = await env.DB.prepare("SELECT detail FROM alerts").all();
    assert.equal(al.results.some(a => /reported_cost_out_of_range/.test(a.detail)), alert, "alert for " + String(rep));
  }
});

test("42 budget estimate: JSON-object providers add the instruction + schema; Qwen-VL reserves more per image", async () => {
  const { estimateMicros, IMAGE_TOKENS } = await import(B + "ai/gateway.js");
  const P = await import(A + "prices.js");
  const { jsonInstruction } = await import(A + "common.js");
  const price = P.priceAt("deepseek", "deepseek-flash", "2026-11-10");
  const ds = await adapterOf("deepseek"), oa = await adapterOf("openai"), qw = await adapterOf("dashscope");
  const hDs = ds.estimateHints(REQ, { model: "deepseek-flash" });
  assert.equal(hDs.extraSystem, jsonInstruction("", SCHEMA));
  assert.equal(oa.estimateHints(REQ, { model: "gpt-6-luna" }).extraSystem, "", "json_schema providers add nothing");
  const extraTok = Math.ceil((Buffer.byteLength(REQ.system) + Buffer.byteLength(hDs.extraSystem)) / 2) - Math.ceil(Buffer.byteLength(REQ.system) / 2);
  assert.ok(extraTok > 50);
  assert.ok(estimateMicros(price, REQ, hDs) - estimateMicros(price, REQ) >= Math.floor(extraTok * price.inPerM));
  const hQw = qw.estimateHints(REQ_IMG, { model: "qwen3-vl-plus" });
  assert.ok(hQw.imageTokens > IMAGE_TOKENS, "Qwen-VL per-image tokens above the default");
  const qp = P.priceAt("dashscope", "qwen3-vl-plus", "2026-11-10");
  const base = estimateMicros(qp, REQ_IMG, { extraSystem: hQw.extraSystem });
  assert.ok(estimateMicros(qp, REQ_IMG, hQw) - base >= Math.floor((hQw.imageTokens - IMAGE_TOKENS) * qp.inPerM));
  assert.equal(estimateMicros(qp, REQ_IMG, { imageTokens: 10 }), estimateMicros(qp, REQ_IMG), "never below the default");
  // the gateway uses the hints: a cap that fits only the hint-free estimate is not enough for DeepSeek
  const env = createEnv({ DEEPSEEK_API_KEY: KEY });
  const F = feature("t_e");
  const { putGateway } = await import(B + "ai/settings.js");
  const cap = (estimateMicros(price, REQ) + 1) / 1e6;
  await putGateway(env.DB, { enabled: true, features: { t_e: { enabled: true, chain: [{ provider: "deepseek", model: "deepseek-flash" }], monthlyBudgetUsd: cap } } }, { features: F });
  const { runFeature } = await import(B + "ai/gateway.js");
  const f = mockFetch(() => json(oaiOk(JSON.stringify(GOOD))));
  const r = await runFeature(env, "t_e", REQ, { deps: { aiFeatures: F, aiFetch: f } });
  assert.deepEqual([r.ok, r.reason, f.calls.length], [false, "budget", 0], "the larger, honest estimate does not fit");
});

test("43 Gemini held out of every Product Check default chain (pc_fields / pc_claims / pc_translate) until the 18+ question is decided; still allowed", async () => {
  const { DEFAULT_CHAINS, GEMINI_HELD } = await import(A + "index.js");
  assert.deepEqual([...GEMINI_HELD].sort(), ["pc_claims", "pc_fields", "pc_translate"]);
  for (const f of GEMINI_HELD) assert.ok(!DEFAULT_CHAINS[f].some(e => e.provider === "gemini"), f);
  const { DEFAULT_GATEWAY, putGateway } = await import(B + "ai/settings.js");
  assert.equal(DEFAULT_GATEWAY.providers.gemini, true, "allowlist unchanged (PC-D2)");
  const env = createEnv({});
  const g = await putGateway(env.DB, { features: { pc_fields: { chain: [{ provider: "gemini", model: "gemini-3.5-flash-lite" }] } } });
  assert.equal(g.features.pc_fields.chain[0].provider, "gemini", "admin can still add it");
  assert.match(readFileSync(join(ROOT, "docs", "AI-GATEWAY.md"), "utf8"), /Gemini[^\n]*18\+[^\n]*default/i);
});
