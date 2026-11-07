"use strict";
// tests/unit/backend-auth.test.js — backend/src/auth.js + crypto.js: bootstrap, PBKDF2, sessions, CSRF, lockout, TOTP,
// Origin allowlist on the admin API, audit log.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const TOKEN = "bootstrap-" + "t".repeat(40);
const PW = "correct horse battery staple";
const KEK = Buffer.alloc(32, 7).toString("base64");

async function mods() {
  return { index: await import(B + "index.js"), crypto: await import(B + "crypto.js"), auth: await import(B + "auth.js") };
}
async function setup(vars = {}) {
  const { index } = await mods();
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: TOKEN, SECRETS_KEK: KEK, ...vars });
  const call = async (path, opts = {}) => { const r = await index.handle(req("/admin/api" + path, opts), env); let j = null; try { j = await r.clone().json(); } catch { /* csv */ } return { r, j }; };
  return { env, call };
}
async function boot(call) {
  return call("/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW } });
}
const cookieOf = r => /(__Host-lq_admin=[^;]+)/.exec(r.headers.get("Set-Cookie") || "")[1];

test("crypto: PBKDF2 hash verifies, wrong password fails, format is versioned", async () => {
  const { crypto } = await mods();
  const h = await crypto.hashPassword(PW, 1000);
  assert.match(h, /^pbkdf2-sha256\$1000\$/);
  assert.equal(await crypto.verifyPassword(PW, h), true);
  assert.equal(await crypto.verifyPassword(PW + "x", h), false);
  assert.equal(await crypto.verifyPassword(PW, "garbage"), false);
  assert.equal(crypto.PBKDF2_ITERATIONS, 100000, "Workers cap");
  assert.ok(crypto.passwordProblem("short"));
  assert.ok(crypto.passwordProblem("aaaaaaaaaaaaaaa"), "repetitive");
  assert.equal(crypto.passwordProblem(PW), null);
});

test("crypto: TOTP matches RFC 6238 SHA-1 test vectors and rejects replays", async () => {
  const { crypto } = await mods();
  const secret = new TextEncoder().encode("12345678901234567890");
  assert.equal(await crypto.totpAt(secret, Math.floor(59 / 30)), "287082");
  assert.equal(await crypto.totpAt(secret, Math.floor(1111111109 / 30)), "081804");
  assert.equal(await crypto.totpAt(secret, Math.floor(1234567890 / 30)), "005924");
  const t = 1234567890, code = await crypto.totpAt(secret, Math.floor(t / 30));
  const step = await crypto.verifyTotp(secret, code, t, 0);
  assert.equal(step, Math.floor(t / 30));
  assert.equal(await crypto.verifyTotp(secret, code, t, step), -1, "same step cannot be reused");
  assert.equal(await crypto.verifyTotp(secret, "12345", t, 0), -1);
  assert.deepEqual(crypto.base32Decode(crypto.base32Encode(secret)), secret);
});

test("crypto: AES-GCM envelope is bound to its AAD and KEK", async () => {
  const { crypto } = await mods();
  const kek = await crypto.importKek(KEK);
  const e = await crypto.encryptString(kek, "sk-ant-secret", "slot-a");
  assert.equal(await crypto.decryptString(kek, e, "slot-a"), "sk-ant-secret");
  await assert.rejects(crypto.decryptString(kek, e, "slot-b"));
  const other = await crypto.importKek(Buffer.alloc(32, 9).toString("base64"));
  await assert.rejects(crypto.decryptString(other, e, "slot-a"));
  await assert.rejects(crypto.importKek(Buffer.alloc(16).toString("base64")), /32 bytes/);
});

test("bootstrap: needs the secret (>=32 chars), a strong password, works once", async () => {
  const noSecret = await setup({ ADMIN_BOOTSTRAP_TOKEN: "" });
  assert.equal((await boot(noSecret.call)).r.status, 503);
  const { call, env } = await setup();
  assert.equal((await call("/bootstrap", { method: "POST", body: { token: "wrong", username: "owner", password: PW } })).r.status, 403);
  assert.equal((await call("/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: "short" } })).r.status, 400);
  assert.equal((await boot(call)).r.status, 201);
  assert.equal((await boot(call)).r.status, 409, "second bootstrap refused");
  const row = await env.DB.prepare("SELECT password_hash FROM admin_users").first();
  assert.match(row.password_hash, /^pbkdf2-sha256\$100000\$/);
  assert.ok(!row.password_hash.includes(PW));
  const audit = (await env.DB.prepare("SELECT action, detail FROM audit_log").all()).results;
  assert.ok(audit.some(a => a.action === "bootstrap.ok"));
  assert.ok(audit.every(a => !String(a.detail).includes(PW) && !String(a.detail).includes(TOKEN)), "no secret in the audit log");
});

test("login: cookie is __Host-, HttpOnly, Secure, SameSite=Strict; only token hashes are stored", async () => {
  const { call, env } = await setup();
  await boot(call);
  const { r, j } = await call("/login", { method: "POST", body: { username: "owner", password: PW } });
  assert.equal(r.status, 200);
  const sc = r.headers.get("Set-Cookie");
  for (const part of ["__Host-lq_admin=", "HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) assert.ok(sc.includes(part), part);
  assert.ok(j.csrf && !j.token, "cookie mode: no bearer token in the body");
  const token = cookieOf(r).split("=")[1];
  const s = await env.DB.prepare("SELECT * FROM admin_sessions").first();
  assert.notEqual(s.id_hash, token);
  assert.equal(s.id_hash.length, 64);
  assert.equal(r.headers.get("Access-Control-Allow-Credentials"), "true");
});

test("CSRF: cookie-authenticated unsafe requests need the X-CSRF-Token; GET /me rotates it", async () => {
  const { call } = await setup();
  await boot(call);
  const { r, j } = await call("/login", { method: "POST", body: { username: "owner", password: PW } });
  const Cookie = cookieOf(r);
  assert.equal((await call("/ai", { method: "PUT", body: { rpm: 5 }, headers: { Cookie } })).r.status, 403, "no CSRF header");
  assert.equal((await call("/ai", { method: "PUT", body: { rpm: 5 }, headers: { Cookie, "X-CSRF-Token": "nope" } })).r.status, 403);
  assert.equal((await call("/ai", { method: "PUT", body: { rpm: 5 }, headers: { Cookie, "X-CSRF-Token": j.csrf } })).r.status, 200);
  const me = await call("/me", { headers: { Cookie } });
  assert.equal(me.r.status, 200);
  assert.ok(me.j.csrf && me.j.csrf !== j.csrf);
  assert.equal((await call("/ai", { method: "PUT", body: { rpm: 6 }, headers: { Cookie, "X-CSRF-Token": j.csrf } })).r.status, 403, "old token invalid after rotation");
  assert.equal((await call("/ai", { method: "PUT", body: { rpm: 6 }, headers: { Cookie, "X-CSRF-Token": me.j.csrf } })).r.status, 200);
});

test("Origin allowlist: unsafe admin requests from another or no Origin are refused", async () => {
  const { call } = await setup();
  await boot(call);
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW }, origin: "https://evil.example" })).r.status, 403);
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW }, origin: null })).r.status, 403);
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW }, origin: "null" })).r.status, 403);
  const ok = await call("/login", { method: "POST", body: { username: "owner", password: PW } });
  assert.equal(ok.r.status, 200);
});

test("bearer mode: token returned once, works without CSRF, unauthenticated requests get 401", async () => {
  const { call } = await setup();
  await boot(call);
  assert.equal((await call("/ai")).r.status, 401);
  const { j } = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  assert.ok(j.token);
  const Authorization = "Bearer " + j.token;
  assert.equal((await call("/ai", { headers: { Authorization } })).r.status, 200);
  assert.equal((await call("/ai", { method: "PUT", body: { effort: "high" }, headers: { Authorization } })).r.status, 200);
  assert.equal((await call("/logout", { method: "POST", body: {}, headers: { Authorization } })).r.status, 200);
  assert.equal((await call("/ai", { headers: { Authorization } })).r.status, 401, "session gone after logout");
});

test("lockout: 5 wrong passwords lock the account (423) even for the right password; audit records failures", async () => {
  const { call, env } = await setup();
  await boot(call);
  for (let i = 0; i < 5; i++) assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: "wrong password " + i }, ip: "198.51.100." + i })).r.status, 401);
  const locked = await call("/login", { method: "POST", body: { username: "owner", password: PW }, ip: "198.51.100.99" });
  assert.equal(locked.r.status, 423);
  assert.ok(Number(locked.r.headers.get("Retry-After")) > 800);
  await env.DB.prepare("UPDATE admin_users SET locked_until = 0").run();
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW } })).r.status, 200);
  const fails = (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'login.failed'").first()).n;
  assert.equal(fails, 5);
  const ipHashes = (await env.DB.prepare("SELECT ip_hash FROM audit_log").all()).results.map(r => r.ip_hash).filter(Boolean);
  assert.ok(ipHashes.every(h => !/198\.51|203\.0/.test(h)), "IPs are never stored");
});

test("rate limit: more than 10 login attempts per 15 min from one caller -> 429", async () => {
  const { call } = await setup();
  await boot(call);
  let last;
  for (let i = 0; i < 11; i++) last = await call("/login", { method: "POST", body: { username: "nobody", password: "x".repeat(12) } });
  assert.equal(last.r.status, 429);
});

test("TOTP: setup needs SECRETS_KEK, enable needs a valid code, login then needs the code", async () => {
  const { crypto } = await mods();
  const noKek = await setup({ SECRETS_KEK: "" });
  await boot(noKek.call);
  const l0 = await noKek.call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  assert.equal((await noKek.call("/totp/setup", { method: "POST", body: {}, headers: { Authorization: "Bearer " + l0.j.token } })).r.status, 503);

  const { call, env } = await setup();
  await boot(call);
  const { j } = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const Authorization = "Bearer " + j.token;
  const s = await call("/totp/setup", { method: "POST", body: {}, headers: { Authorization } });
  assert.equal(s.r.status, 200);
  assert.match(s.j.uri, /^otpauth:\/\/totp\//);
  const stored = (await env.DB.prepare("SELECT totp_secret_enc FROM admin_users").first()).totp_secret_enc;
  assert.ok(!stored.includes(s.j.secret), "secret encrypted at rest");
  assert.equal((await call("/totp/enable", { method: "POST", body: { code: "000000" }, headers: { Authorization } })).r.status, 400);
  const secret = crypto.base32Decode(s.j.secret);
  const code = await crypto.totpAt(secret, Math.floor(Date.now() / 1000 / 30));
  assert.equal((await call("/totp/enable", { method: "POST", body: { code }, headers: { Authorization } })).r.status, 200);
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW } })).r.status, 401, "TOTP now required");
  await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0, failed_count = 0").run();
  const code2 = await crypto.totpAt(secret, Math.floor(Date.now() / 1000 / 30));
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW, totp: code2 } })).r.status, 200);
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW, totp: code2 } })).r.status, 401, "replayed code refused");
});

test("password change signs out other sessions", async () => {
  const { call } = await setup();
  await boot(call);
  const a = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const b = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const r = await call("/password", { method: "POST", body: { current: PW, next: "another long passphrase 42" }, headers: { Authorization: "Bearer " + a.j.token } });
  assert.equal(r.r.status, 200);
  assert.equal((await call("/ai", { headers: { Authorization: "Bearer " + b.j.token } })).r.status, 401);
  assert.equal((await call("/ai", { headers: { Authorization: "Bearer " + a.j.token } })).r.status, 200);
});
