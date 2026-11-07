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

test("H2: failures with a wrong username never touch the owner account (no lockout DoS)", async () => {
  const { call, env } = await setup();
  await boot(call);
  for (let i = 0; i < 40; i++) assert.equal((await call("/login", { method: "POST", body: { username: "x" + i, password: "wrongwrongwrong" }, ip: "198.51.100." + i })).r.status, 401);
  const o = await env.DB.prepare("SELECT failed_count, locked_until FROM admin_users").first();
  assert.equal(o.failed_count, 0);
  assert.equal(o.locked_until, 0);
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW }, ip: "203.0.113.50" })).r.status, 200);
  const fails = (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'login.failed'").first()).n;
  assert.equal(fails, 40);
  const ipHashes = (await env.DB.prepare("SELECT ip_hash FROM audit_log").all()).results.map(r => r.ip_hash).filter(Boolean);
  assert.ok(ipHashes.every(h => !/198\.51|203\.0/.test(h)), "IPs are never stored");
});

test("H1: 30 parallel username-matched guesses are all counted (atomic) and trigger the progressive delay", async () => {
  const { call, env } = await setup();
  await boot(call);
  const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => call("/login", { method: "POST", body: { username: "owner", password: "guess-number-" + i }, ip: "192.0.2." + (i % 6) })));
  assert.ok(rs.every(x => x.r.status === 401 || x.r.status === 429));
  const o = await env.DB.prepare("SELECT failed_count, locked_until FROM admin_users").first();
  assert.equal(o.failed_count, rs.filter(x => x.r.status === 401).length, "every verified failure counted");
  assert.ok(o.failed_count >= 25);
  assert.ok(o.locked_until > Math.floor(Date.now() / 1000), "progressive delay engaged");
  // a new untrusted caller now gets 429 (delay, not a hard lock) — even with the right password
  const d = await call("/login", { method: "POST", body: { username: "owner", password: PW }, ip: "203.0.113.9" });
  assert.equal(d.r.status, 429);
  assert.ok(Number(d.r.headers.get("Retry-After")) <= 900, "delay is bounded (max 15 min)");
});

test("H2: a trusted device token bypasses the account delay and the global limit; the delay decays", async () => {
  const { auth } = await mods();
  const { call, env } = await setup();
  await boot(call);
  const first = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" }, ip: "203.0.113.1" });
  assert.match(first.j.device, /^[A-Za-z0-9_-]{40,}$/, "device token issued on first login");
  assert.ok(first.r.headers.get("Set-Cookie").includes("__Host-lq_dev="));
  for (let i = 0; i < 12; i++) await call("/login", { method: "POST", body: { username: "owner", password: "attacker-guess-" + i }, ip: "198.51.100." + i });
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW }, ip: "203.0.113.2" })).r.status, 429, "untrusted: delayed");
  const ok = await call("/login", { method: "POST", body: { username: "owner", password: PW }, ip: "203.0.113.3", headers: { "X-LQ-Device": first.j.device } });
  assert.equal(ok.r.status, 200, "owner with device token is never kept out");
  assert.equal(ok.j.device, undefined, "no new device token for a trusted device");
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: "wrong-with-device" }, ip: "203.0.113.3", headers: { "X-LQ-Device": first.j.device } })).r.status, 401, "device token never replaces the password");
  // decay: failures older than DECAY no longer delay
  await env.DB.prepare("UPDATE admin_users SET last_failed_at = last_failed_at - ?1").bind(auth.DECAY + 10).run();
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW }, ip: "203.0.113.4" })).r.status, 200);
  assert.equal(auth.accountDelay(9), 0);
  assert.equal(auth.accountDelay(10), 30);
  assert.equal(auth.accountDelay(15), 60);
  assert.equal(auth.accountDelay(100), auth.DELAY_MAX);
});

test("per-caller limits: 5 failures -> 429 for that caller only; global attempt limit for untrusted callers", async () => {
  const { auth } = await mods();
  const { call, env } = await setup();
  await boot(call);
  for (let i = 0; i < 5; i++) await call("/login", { method: "POST", body: { username: "nobody", password: "x".repeat(12) } });
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW } })).r.status, 429);
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW }, ip: "203.0.113.77" })).r.status, 200, "other callers unaffected");
  const t = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES ('login:global', ?1, ?2)").bind(t - (t % auth.WINDOW), auth.GLOBAL_ATTEMPTS).run();
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW }, ip: "203.0.113.78" })).r.status, 429, "global limit");
});

test("rate limit: more than 10 login attempts per 15 min from one caller -> 429", async () => {
  const { call } = await setup();
  await boot(call);
  let last;
  for (let i = 0; i < 11; i++) last = await call("/login", { method: "POST", body: { username: "owner", password: i % 2 ? PW : "wrong-password-" + i } });
  assert.equal(last.r.status, 429);
});

test("TOTP: setup needs SECRETS_KEK, enable needs a valid code, login then needs the code", async () => {
  const { crypto } = await mods();
  const noKek = await setup({ SECRETS_KEK: "" });
  await boot(noKek.call);
  const l0 = await noKek.call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  assert.equal((await noKek.call("/totp/setup", { method: "POST", body: { password: PW }, headers: { Authorization: "Bearer " + l0.j.token } })).r.status, 503);

  const { call, env } = await setup();
  await boot(call);
  const { j } = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const Authorization = "Bearer " + j.token;
  assert.equal((await call("/totp/setup", { method: "POST", body: {}, headers: { Authorization } })).r.status, 403, "re-auth: password required");
  const s = await call("/totp/setup", { method: "POST", body: { password: PW }, headers: { Authorization } });
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

test("TOTP race: one code sent in parallel logs in at most once (atomic step claim); re-auth needs TOTP", async () => {
  const { crypto } = await mods();
  const { call } = await setup();
  await boot(call);
  const { j } = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const Authorization = "Bearer " + j.token;
  const s = await call("/totp/setup", { method: "POST", body: { password: PW }, headers: { Authorization } });
  const secret = crypto.base32Decode(s.j.secret);
  const step = Math.floor(Date.now() / 1000 / 30);
  assert.equal((await call("/totp/enable", { method: "POST", body: { code: await crypto.totpAt(secret, step - 1) }, headers: { Authorization } })).r.status, 200);
  const code = await crypto.totpAt(secret, step);
  const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => call("/login", { method: "POST", body: { username: "owner", password: PW, totp: code, mode: "bearer" }, ip: "192.0.2." + i })));
  const winners = rs.filter(x => x.r.status === 200);
  assert.equal(winners.length, 1, rs.map(x => x.r.status).join(","));
  const A2 = "Bearer " + winners[0].j.token;
  assert.equal((await call("/password", { method: "POST", body: { current: PW, next: "another long passphrase 42" }, headers: { Authorization: A2 } })).r.status, 403, "TOTP required for password change");
  const ok = await call("/password", { method: "POST", body: { current: PW, next: "another long passphrase 42", totp: await crypto.totpAt(secret, step + 1) }, headers: { Authorization: A2 } });
  assert.equal(ok.r.status, 200);
});

test("/state reveals only whether setup is done; ADMIN_ORIGINS does not fall back to ALLOWED_ORIGINS", async () => {
  const { call } = await setup();
  assert.deepEqual((await call("/state")).j, { bootstrapped: false });
  const { index } = await mods();
  const env2 = createEnv({ ADMIN_BOOTSTRAP_TOKEN: TOKEN, ADMIN_ORIGINS: "", ALLOWED_ORIGINS: "https://site.example" });
  const r = await index.handle(req("/admin/api/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW } }), env2);
  assert.equal(r.status, 403, "the public site origin gets no admin access");
  const same = await index.handle(req("/admin/api/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW }, origin: "https://api.example" }), env2);
  assert.equal(same.status, 201, "the Worker's own origin (admin served by the Worker) is allowed");
});

test("M5: admin shell served by the Worker carries frame-ancestors 'none' + X-Frame-Options DENY", async () => {
  const { index } = await mods();
  const env = createEnv({ ASSETS: { fetch: async () => new Response("<!doctype html><title>x</title>", { headers: { "Content-Type": "text/html" } }) } });
  for (const path of ["/admin", "/admin.html", "/admin.js"]) {
    const r = await index.handle(new Request("https://admin.example" + path), env);
    assert.equal(r.status, 200, path);
    assert.equal(r.headers.get("X-Frame-Options"), "DENY");
    assert.match(r.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
    assert.match(r.headers.get("Content-Security-Policy"), /connect-src 'self'/);
  }
  const worker = index.default;
  const r2 = await worker.fetch(new Request("https://admin.example/admin.html"), env, {});
  assert.equal(r2.headers.get("X-Frame-Options"), "DENY");
  assert.equal((await index.handle(new Request("https://admin.example/admin.html"), createEnv())).status, 404, "no ASSETS binding -> not served");
});
