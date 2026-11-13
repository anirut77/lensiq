"use strict";
// tests/unit/backend-ai-keys-review.test.js — behaviour checks added after the independent review of admin key management
// (2026-11-11): parallel and replayed codes, missing migration, no-op removal audited, other providers' key prefixes.
const test = require("node:test");
// test-bug re-lock 2026-11-14: one frozen clock for the code generator and the Worker (tests/unit/totp-clock.js; CI run 43464554484)
require("./totp-clock.js").freeze();
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const TOKEN = "bootstrap-" + "t".repeat(40), PW = "correct horse battery staple", KEK = Buffer.alloc(32, 7).toString("base64");
const OR_KEY = "sk-or-v1-" + "a1b2c3d4".repeat(8), SERVER_KEY = "sk-or-v1-" + "5e5e5e5e".repeat(8);

async function owner(vars = {}) {
  const index = await import(B + "index.js"), crypto = await import(B + "crypto.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: TOKEN, SECRETS_KEK: KEK, ...vars });
  const raw = async (path, o = {}) => { const r = await index.handle(req("/admin/api" + path, o), env); let j = null; try { j = await r.clone().json(); } catch { /* none */ } return { r, j }; };
  await raw("/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW } });
  let tok = (await raw("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } })).j.token;
  const call = (path, o = {}) => raw(path, { ...o, headers: { Authorization: "Bearer " + tok, ...(o.headers || {}) } });
  const s = await call("/totp/setup", { method: "POST", body: { password: PW } });
  const code = () => crypto.totpAt(crypto.base32Decode(s.j.secret), Math.floor(Date.now() / 1000 / 30));
  const fresh = async () => { await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run(); return code(); };
  await call("/totp/enable", { method: "POST", body: { code: await fresh() } });
  const newSession = async () => { tok = (await raw("/login", { method: "POST", body: { username: "owner", password: PW, totp: await fresh(), mode: "bearer" } })).j.token; };
  return { env, call, raw, fresh, code, newSession };
}

test("review: one 6-digit code in parallel requests stores at most one key; a replayed code is refused", async () => {
  const o = await owner();
  const c = await o.fresh();
  const rs = await Promise.all([0, 1, 2].map(() => o.call("/ai/keys/openrouter", { method: "PUT", body: { key: OR_KEY, password: PW, totp: c } })));
  assert.deepEqual(rs.map(x => x.r.status).sort(), [200, 403, 403]);
  const again = await o.call("/ai/keys/openrouter", { method: "DELETE", body: { password: PW, totp: c } });
  assert.equal(again.r.status, 403, "the same code cannot be used again");
  assert.equal((await o.env.DB.prepare("SELECT COUNT(*) AS n FROM ai_provider_keys").first()).n, 1);
});

test("review: migration 0012 missing -> 503 keys_unavailable before the code is used; the gateway keeps the Worker secret", async () => {
  const o = await owner({ OPENROUTER_API_KEY: SERVER_KEY });
  await o.env.DB.prepare("DROP TABLE ai_provider_keys").run();
  const c = await o.fresh();
  const r = await o.call("/ai/keys/openrouter", { method: "PUT", body: { key: OR_KEY, password: PW, totp: c } });
  assert.equal(r.r.status, 503); assert.equal(r.j.code, "keys_unavailable");
  assert.equal((await o.env.DB.prepare("SELECT totp_last_step FROM admin_users").first()).totp_last_step, 0, "the code was not used up");
  assert.equal((await o.call("/ai/keys")).r.status, 200);
  const { resolveKeys } = await import(B + "ai/keystore.js");
  assert.equal((await resolveKeys(o.env)).openrouter, SERVER_KEY);
});

test("review: removing a key that was not set is audited too", async () => {
  const o = await owner();
  const r = await o.call("/ai/keys/gemini", { method: "DELETE", body: { password: PW, totp: await o.fresh() } });
  assert.equal(r.r.status, 200);
  const a = (await o.env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'ai.provider_key.removed'").all()).results;
  assert.deepEqual(a.map(x => JSON.parse(x.detail)), [{ provider: "gemini", last4: null }]);
});

test("review: an Anthropic or OpenRouter key is refused in the rows of providers with generic sk- keys", async () => {
  const o = await owner();
  for (const prov of ["openai", "deepseek", "kimi", "dashscope"]) {
    for (const k of ["sk-ant-api03-" + "x".repeat(40), OR_KEY]) {
      const r = await o.call("/ai/keys/" + prov, { method: "PUT", body: { key: k, password: PW, totp: await o.fresh() } });
      assert.equal(r.j && r.j.code, "invalid_key_format", prov + " " + k.slice(0, 8));
    }
  }
  const ok = await o.call("/ai/keys/openai", { method: "PUT", body: { key: "sk-proj-" + "Ab1_".repeat(10), password: PW, totp: await o.fresh() } });
  assert.equal(ok.r.status, 200);
});
