"use strict";
// tests/unit/backend-ai-keys.test.js — FIXED TEST SET (written before the build, 2026-11-11) for managing AI provider keys
// from the admin panel (owner spec 2026-11-11):
//   K1 write-only: no response ever carries a key or more than its last 4 characters;
//   K2 envelope encryption under SECRETS_KEK: a random data key per stored key, wrapped by the KEK; ciphertext bound to
//      its provider (moving a row to another provider makes it unreadable); a changed KEK makes it unreadable, never wrong;
//   K3 every change (set, replace, remove) needs the password AND a fresh 6-digit code in that very request; the 5-minute
//      "sudo" window is not enough; 2-step verification must be on; a recovery code is not accepted;
//   K4 audit: every set / replace / remove / test is in the audit log with provider and last 4 only;
//   K5 test-key: sends one billing-free request to the provider with the stored key (header only) and returns only
//      OK / FAIL; rate limited; a provider whose check might bill is not tested;
//   K6 priority: a key set in the panel is used instead of the Worker secret; removing it falls back to the secret;
//   K7 format: per-provider shape, length and character checks; nothing echoed back on refusal;
//   K8 spend per provider in the monthly usage;
//   K9 no KEK -> 503 with a plain code; unreadable rows are reported, never used.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const TOKEN = "bootstrap-" + "t".repeat(40);
const PW = "correct horse battery staple";
const KEK = Buffer.alloc(32, 7).toString("base64");
const OR_KEY = "sk-or-v1-" + "a1b2c3d4".repeat(8);          // synthetic, shaped like an OpenRouter key
const OR_KEY2 = "sk-or-v1-" + "9f8e7d6c".repeat(8);
const ANT_KEY = "sk-ant-api03-" + "Zx9_".repeat(20) + "AbCd";
const SERVER_KEY = "sk-or-v1-" + "5e5e5e5e".repeat(8);       // the "Worker secret" in tests

async function mods() {
  return { index: await import(B + "index.js"), crypto: await import(B + "crypto.js"), gateway: await import(B + "ai/gateway.js") };
}
/** Signed-in owner with 2-step on. Returns call(path, opts) with the bearer token, and fresh() = a valid 6-digit code. */
async function owner(vars = {}, { totp = true } = {}) {
  const { index, crypto } = await mods();
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: TOKEN, SECRETS_KEK: KEK, ...vars });
  const raw = async (path, o = {}) => { const r = await index.handle(req("/admin/api" + path, o), env); let j = null; try { j = await r.clone().json(); } catch { /* none */ } return { r, j }; };
  await raw("/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW } });
  const l = await raw("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const Authorization = "Bearer " + l.j.token;
  const call = (path, o = {}) => raw(path, { ...o, headers: { Authorization, ...(o.headers || {}) } });
  let secret = null;
  const fresh = async () => {
    await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
    return crypto.totpAt(crypto.base32Decode(secret), Math.floor(Date.now() / 1000 / 30));
  };
  let codes = [];
  if (totp) {
    const s = await call("/totp/setup", { method: "POST", body: { password: PW } });
    secret = s.j.secret;
    codes = (await call("/totp/enable", { method: "POST", body: { code: await fresh() } })).j.recovery_codes;
  }
  return { env, call, raw, fresh, codes };
}
const allText = async env => JSON.stringify((await env.DB.prepare("SELECT * FROM audit_log").all()).results) +
  JSON.stringify((await env.DB.prepare("SELECT * FROM settings").all()).results);

test("K1/K2: a key set in the panel is stored encrypted (data key wrapped by the KEK) and never returned; only the last 4 show", async () => {
  const o = await owner();
  const put = await o.call("/ai/keys/openrouter", { method: "PUT", body: { key: OR_KEY, password: PW, totp: await o.fresh() } });
  assert.equal(put.r.status, 200, JSON.stringify(put.j));
  const row = await o.env.DB.prepare("SELECT * FROM ai_provider_keys WHERE provider = 'openrouter'").first();
  assert.ok(row, "stored");
  const dump = JSON.stringify(row);
  assert.ok(!dump.includes(OR_KEY) && !dump.includes(OR_KEY.slice(9, 40)), "no plaintext at rest");
  const enc = JSON.parse(row.key_enc);
  assert.equal(enc.v, 1);
  assert.ok(enc.dek && enc.dek.iv && enc.dek.ct && enc.iv && enc.ct, "envelope: wrapped data key + ciphertext");
  assert.equal(row.last4, OR_KEY.slice(-4));
  // every admin answer: no key, no more than the last 4
  for (const path of ["/ai/keys", "/ai/gateway", "/ai/usage", "/audit"]) {
    const g = await o.call(path);
    assert.equal(g.r.status, 200, path);
    const s = JSON.stringify(g.j);
    assert.ok(!s.includes(OR_KEY.slice(0, 20)) && !s.includes(OR_KEY.slice(-12)), path + " leaks the key");
  }
  const g = await o.call("/ai/keys");
  const p = g.j.keys.find(k => k.provider === "openrouter");
  assert.deepEqual([p.source, p.last4, p.panel_set, typeof p.set_at], ["panel", OR_KEY.slice(-4), true, "number"]);
  assert.ok(!("key" in p) && !("key_enc" in p));
  assert.ok(!(await allText(o.env)).includes(OR_KEY.slice(0, 20)), "audit / settings carry no key");
});

test("K2: ciphertext is bound to its provider and to the KEK: moved or with another KEK it is unreadable and not used", async () => {
  const o = await owner();
  await o.call("/ai/keys/openrouter", { method: "PUT", body: { key: OR_KEY, password: PW, totp: await o.fresh() } });
  const { readPanelKeys } = await import(B + "ai/keystore.js");
  assert.equal((await readPanelKeys(o.env)).openrouter, OR_KEY, "the gateway can read it");
  // move the row to another provider: not readable there
  const row = await o.env.DB.prepare("SELECT * FROM ai_provider_keys WHERE provider = 'openrouter'").first();
  await o.env.DB.prepare("INSERT INTO ai_provider_keys (provider, key_enc, last4, set_at) VALUES ('anthropic', ?1, ?2, ?3)").bind(row.key_enc, row.last4, row.set_at).run();
  const k = await readPanelKeys(o.env);
  assert.equal(k.anthropic, undefined, "a moved ciphertext is not accepted");
  // another KEK: unreadable, reported, not used
  const env2 = { ...o.env, SECRETS_KEK: Buffer.alloc(32, 9).toString("base64") };
  assert.deepEqual(await readPanelKeys(env2), {});
  const { listKeys } = await import(B + "ai/keystore.js");
  const l = await listKeys(env2);
  assert.equal(l.find(x => x.provider === "openrouter").unreadable, true);
});

test("K3: set / replace / remove need password + a fresh 6-digit code in the request; sudo window, recovery codes and 2-step off are refused", async () => {
  const o = await owner();
  const put = body => o.call("/ai/keys/openrouter", { method: "PUT", body });
  let r = await put({ key: OR_KEY });
  assert.equal(r.r.status, 403); assert.equal(r.j.code, "reauth_inline_required");
  r = await put({ key: OR_KEY, password: PW });
  assert.equal(r.r.status, 403, "no 6-digit code"); assert.equal(r.j.code, "reauth_failed");
  r = await put({ key: OR_KEY, password: PW, totp: "000000" });
  assert.equal(r.r.status, 403);
  r = await put({ key: OR_KEY, password: "wrong password 1234", totp: await o.fresh() });
  assert.equal(r.r.status, 403);
  r = await put({ key: OR_KEY, password: PW, recovery: o.codes[0] });
  assert.equal(r.r.status, 403, "a recovery code is not a fresh 6-digit code");
  // an open sudo window is not enough
  assert.equal((await o.call("/reauth", { method: "POST", body: { password: PW, totp: await o.fresh() } })).r.status, 200);
  r = await put({ key: OR_KEY });
  assert.equal(r.r.status, 403); assert.equal(r.j.code, "reauth_inline_required");
  assert.equal(await o.env.DB.prepare("SELECT COUNT(*) AS n FROM ai_provider_keys").first().then(x => x.n), 0, "nothing stored by refused requests");
  r = await put({ key: OR_KEY, password: PW, totp: await o.fresh() });
  assert.equal(r.r.status, 200);
  // remove: same rule. A NEW session: the 4 wrong confirmations above count towards the existing limit of 5 wrong
  // re-authentications per session and 15 minutes (auth.js REAUTH_FAILURES), which is not what this part tests.
  // (Amendment to the locked set, 2026-11-11: the first version assumed no such limit; every assertion is unchanged.)
  const tok2 = (await o.raw("/login", { method: "POST", body: { username: "owner", password: PW, totp: await o.fresh(), mode: "bearer" } })).j.token;
  const del = body => o.raw("/ai/keys/openrouter", { method: "DELETE", body, headers: { Authorization: "Bearer " + tok2 } });
  assert.equal((await del({})).r.status, 403);
  assert.equal((await del({ password: PW })).r.status, 403);
  assert.equal((await del({ password: PW, totp: await o.fresh() })).r.status, 200);
  assert.equal(await o.env.DB.prepare("SELECT COUNT(*) AS n FROM ai_provider_keys").first().then(x => x.n), 0);
  // 2-step verification off: refused with a plain code, whatever the body
  const p = await owner({}, { totp: false });
  r = await p.call("/ai/keys/openrouter", { method: "PUT", body: { key: OR_KEY, password: PW } });
  assert.equal(r.r.status, 403); assert.equal(r.j.code, "owner_totp_required");
  // unauthenticated / unknown provider
  assert.equal((await o.raw("/ai/keys")).r.status, 401);
  r = await o.call("/ai/keys/nope", { method: "PUT", body: { key: OR_KEY, password: PW, totp: await o.fresh() } });
  assert.equal(r.r.status, 404);
});

test("K4: set, replace, remove and test are audited with provider and last 4 only", async () => {
  const o = await owner({}, {});
  const fetchCalls = [];
  const { index } = await mods();
  await o.call("/ai/keys/openrouter", { method: "PUT", body: { key: OR_KEY, password: PW, totp: await o.fresh() } });
  await o.call("/ai/keys/openrouter", { method: "PUT", body: { key: OR_KEY2, password: PW, totp: await o.fresh() } });
  await o.call("/ai/keys/openrouter", { method: "DELETE", body: { password: PW, totp: await o.fresh() } });
  const rows = (await o.env.DB.prepare("SELECT action, detail FROM audit_log WHERE action LIKE 'ai.provider_key.%' ORDER BY id").all()).results;
  assert.deepEqual(rows.map(r => r.action), ["ai.provider_key.set", "ai.provider_key.replaced", "ai.provider_key.removed"]);
  assert.deepEqual(JSON.parse(rows[0].detail), { provider: "openrouter", last4: OR_KEY.slice(-4) });
  assert.deepEqual(JSON.parse(rows[1].detail), { provider: "openrouter", last4: OR_KEY2.slice(-4), previous_last4: OR_KEY.slice(-4) });
  assert.deepEqual(JSON.parse(rows[2].detail), { provider: "openrouter", last4: OR_KEY2.slice(-4) });
  void fetchCalls; void index;
});

test("K5: test-key sends one request with the key in a header only, returns OK / FAIL only, is audited and rate limited", async () => {
  const { index } = await mods();
  const o = await owner();
  await o.call("/ai/keys/openrouter", { method: "PUT", body: { key: OR_KEY, password: PW, totp: await o.fresh() } });
  const sent = [];
  let status = 200;
  const deps = { fetch: async (url, init) => { sent.push({ url: String(url), init }); return new Response(JSON.stringify({ data: { label: "secret info", limit: 20 } }), { status }); } };
  const auth = (await o.call("/me")).r; void auth;
  const tok = (await o.raw("/login", { method: "POST", body: { username: "owner", password: PW, totp: await o.fresh(), mode: "bearer" } })).j.token;
  const t = async () => {
    const r = await index.handle(req("/admin/api/ai/keys/openrouter/test", { method: "POST", body: {}, headers: { Authorization: "Bearer " + tok } }), o.env, deps);
    return { r, j: await r.json() };
  };
  let r = await t();
  assert.equal(r.r.status, 200, JSON.stringify(r.j));
  assert.deepEqual(Object.keys(r.j).sort(), ["checked_at", "provider", "status"], "OK / FAIL only (amended after review: the provider's HTTP status is no longer returned)");
  assert.equal(r.j.status, "OK");
  assert.equal(sent.length, 1);
  assert.ok(!sent[0].url.includes(OR_KEY) && !String(sent[0].init.body || "").includes(OR_KEY), "key only in a header");
  assert.equal(sent[0].init.headers.Authorization, "Bearer " + OR_KEY, "the PANEL key is the one tested");
  assert.ok(!JSON.stringify(r.j).includes("secret info"), "no provider response body is returned");
  status = 401;
  r = await t();
  assert.equal(r.j.status, "FAIL");
  const g = await o.call("/ai/keys");
  const p = g.j.keys.find(k => k.provider === "openrouter");
  assert.equal(p.check_ok, false); assert.equal(typeof p.checked_at, "number");
  const audits = (await o.env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'ai.provider_key.tested'").all()).results.map(x => JSON.parse(x.detail));
  assert.deepEqual(audits, [{ provider: "openrouter", last4: OR_KEY.slice(-4), status: "OK" }, { provider: "openrouter", last4: OR_KEY.slice(-4), status: "FAIL" }]);
  // rate limit: 10 tests per hour for the whole admin
  let limited = 0;
  for (let i = 0; i < 12; i++) if ((await t()).r.status === 429) limited++;
  assert.ok(limited >= 2, "rate limited: " + limited);
  // no key at all: nothing is sent
  const before = sent.length;
  const none = await index.handle(req("/admin/api/ai/keys/anthropic/test", { method: "POST", body: {}, headers: { Authorization: "Bearer " + tok, "CF-Connecting-IP": "203.0.113.99" } }), o.env, deps);
  assert.equal(none.status, 200); assert.equal((await none.json()).status, "SKIP");
  // z.ai: its check endpoint does not state billing -> not tested from the panel (nothing sent)
  const z = await index.handle(req("/admin/api/ai/keys/zai/test", { method: "POST", body: {}, headers: { Authorization: "Bearer " + tok } }),
    { ...o.env, ZAI_API_KEY: "abc123def456ghi789jkl012.mnopqrstuvwx" }, deps);
  assert.equal((await z.json()).status, "NOT_TESTED");
  assert.equal(sent.length, before, "nothing sent for SKIP / NOT_TESTED");
});

test("K6: the panel key is used instead of the Worker secret; removing it falls back to the secret", async () => {
  const { index } = await mods();
  const o = await owner({ OPENROUTER_API_KEY: SERVER_KEY });
  const { readPanelKeys, resolveKeys } = await import(B + "ai/keystore.js");
  let used = await resolveKeys(o.env);
  assert.equal(used.openrouter, SERVER_KEY);
  await o.call("/ai/keys/openrouter", { method: "PUT", body: { key: OR_KEY, password: PW, totp: await o.fresh() } });
  used = await resolveKeys(o.env);
  assert.equal(used.openrouter, OR_KEY, "panel key first");
  const g = await o.call("/ai/keys");
  const p = g.j.keys.find(k => k.provider === "openrouter");
  assert.deepEqual([p.source, p.server_set, p.panel_set], ["panel", true, true]);
  await o.call("/ai/keys/openrouter", { method: "DELETE", body: { password: PW, totp: await o.fresh() } });
  used = await resolveKeys(o.env);
  assert.equal(used.openrouter, SERVER_KEY);
  assert.deepEqual(await readPanelKeys(o.env), {});
  void index;
});

test("K6: a real gateway call sends the panel key to the provider adapter; the consent screen lists the same chain", async () => {
  // amended after the independent review (2026-11-11): the first version called a helper that only re-ran the key
  // resolution; this one runs the real path (runFeature -> usableChain -> keyFor) with a spy adapter
  const { gateway } = await mods();
  const st = await import(B + "ai/settings.js");
  const o = await owner({ OPENROUTER_API_KEY: SERVER_KEY });
  await o.call("/ai/keys/openrouter", { method: "PUT", body: { key: OR_KEY, password: PW, totp: await o.fresh() } });
  const model = (await import(B + "ai/adapters/prices.js")).modelsOf("openrouter")[0];
  const FEATURE = { t_echo: { id: "t_echo", status: "live", label: { th: "x", en: "x", zh: "x" },
    build: () => ({ system: "s", text: "t", output: { name: "t_echo", schema: { type: "object", properties: { a: { type: "string" } }, required: ["a"], additionalProperties: false } } }) } };
  await st.putGateway(o.env.DB, { enabled: true, features: { t_echo: { enabled: true, chain: [{ provider: "openrouter", model }], monthlyBudgetUsd: 5, timeoutMs: 2000,
    maxOutputTokens: 100, perUserDaily: 100, perUserPerMinute: 100, globalPerMinute: 1000 } } }, { features: FEATURE });
  const seen = [];
  const ad = { openrouter: { id: "openrouter", capabilities: () => ({ jsonSchema: "native" }), region: () => "r",
    async call(r, e, ctx) { seen.push(ctx.key); return { ok: true, json: { a: "x" }, model, usage: { inputTokens: 1, outputTokens: 1 } }; } } };
  const deps = { aiAdapters: ad, aiFeatures: FEATURE, sleep: async () => {} };
  const run = env => gateway.runFeature(env, "t_echo", FEATURE.t_echo.build(), { deps });
  let rr = await run(o.env);
  assert.equal(rr.ok, true, JSON.stringify(rr).slice(0, 200));
  assert.equal(seen.at(-1), OR_KEY, "the panel key reached the adapter");
  const pi = await gateway.providersInfo(o.env, "t_echo", deps);
  assert.deepEqual(pi.chain.map(c => c.provider), ["openrouter"], "consent lists the provider that is called");
  // KEK changed: the panel key cannot be read and the Worker secret is used (never a wrongly decrypted value)
  rr = await run({ ...o.env, SECRETS_KEK: Buffer.alloc(32, 9).toString("base64") });
  assert.equal(seen.at(-1), SERVER_KEY);
  // removed: the Worker secret
  await o.call("/ai/keys/openrouter", { method: "DELETE", body: { password: PW, totp: await o.fresh() } });
  rr = await run(o.env);
  assert.equal(seen.at(-1), SERVER_KEY);
  assert.equal(typeof gateway.chainKeysForTest, "undefined", "no export returns plaintext keys");
});

test("K7: key format checks per provider; a refused value is never echoed back or stored", async () => {
  const o = await owner();
  const put = async (prov, key) => o.call("/ai/keys/" + prov, { method: "PUT", body: { key, password: PW, totp: await o.fresh() } });
  for (const [prov, bad] of [["openrouter", "sk-ant-api03-" + "x".repeat(40)], ["openrouter", "short"], ["openrouter", OR_KEY + " "], ["openrouter", OR_KEY + "\n"],
    ["openrouter", "sk-or-v1-" + "a".repeat(400)], ["anthropic", OR_KEY], ["anthropic", "sk-ant-<script>" + "x".repeat(30)], ["gemini", "notakey-" + "x".repeat(30)],
    ["openrouter", ""], ["openrouter", 12345]]) {
    const r = await put(prov, bad);
    assert.equal(r.r.status, 400, prov + " " + String(bad).slice(0, 20));
    assert.equal(r.j.code, "invalid_key_format");
    if (typeof bad === "string" && bad.length > 6) assert.ok(!JSON.stringify(r.j).includes(bad.slice(0, 12)), "not echoed");
  }
  assert.equal(await o.env.DB.prepare("SELECT COUNT(*) AS n FROM ai_provider_keys").first().then(x => x.n), 0);
  assert.equal((await put("anthropic", ANT_KEY)).r.status, 200);
  assert.equal((await put("openrouter", OR_KEY)).r.status, 200);
});

test("K8: monthly usage shows spend per provider", async () => {
  const { gateway } = await mods();
  const o = await owner();
  const { addAggregates } = await import(B + "ai/db.js");
  const month = new Date().toISOString().slice(0, 7);
  await addAggregates(o.env.DB, month, "pc_fields", { calls: 2, cost: 3000, "prov:openrouter": 2, "pcost:openrouter": 3000 });
  await addAggregates(o.env.DB, month, "pc_translate", { calls: 1, cost: 1500, "prov:openrouter": 1, "pcost:openrouter": 1500 });
  const u = await gateway.adminUsage(o.env, { month });
  assert.deepEqual(u.providers_cost_usd, { openrouter: 0.0045 });
  // the gateway records it on every attempt
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "backend", "src", "ai", "gateway.js"), "utf8");
  assert.match(src, /\["pcost:" \+ entry\.provider\]: cost/);
});

test("K9: no KEK -> 503 with a plain code; nothing stored", async () => {
  const o = await owner();
  const env2 = { ...o.env, SECRETS_KEK: "" };
  const { index } = await mods();
  const tok = (await o.raw("/login", { method: "POST", body: { username: "owner", password: PW, totp: await o.fresh(), mode: "bearer" } })).j.token;
  const r = await index.handle(req("/admin/api/ai/keys/openrouter", { method: "PUT", body: { key: OR_KEY, password: PW, totp: await o.fresh() }, headers: { Authorization: "Bearer " + tok } }), env2);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, "kek_missing");
  assert.equal(await o.env.DB.prepare("SELECT COUNT(*) AS n FROM ai_provider_keys").first().then(x => x.n), 0);
});

test("K10: /health/deep probes the key table; the legacy Anthropic key store is untouched", async () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "backend", "src", "health.js"), "utf8");
  assert.match(src, /0012_ai_keys\.sql/);
  assert.match(src, /FROM ai_provider_keys LIMIT 0/);
  const settings = await import(B + "settings.js");
  assert.equal(typeof settings.setApiKey, "function");
  assert.equal(typeof settings.getApiKey, "function");
});
