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

// ---- first-run setup + recovery codes (2026-11-11) ---------------------------------------------------------------------
/** Owner with 2-step on. Returns the bearer header, the TOTP secret bytes and the ten recovery codes. */
async function withTotp(vars = {}) {
  const { crypto } = await mods();
  const { call, env } = await setup(vars);
  await boot(call);
  const { j } = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const Authorization = "Bearer " + j.token;
  const s = await call("/totp/setup", { method: "POST", body: { password: PW }, headers: { Authorization } });
  const secret = crypto.base32Decode(s.j.secret);
  const codeNow = async () => { await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run(); return crypto.totpAt(secret, Math.floor(Date.now() / 1000 / 30)); };
  const e = await call("/totp/enable", { method: "POST", body: { code: await codeNow() }, headers: { Authorization } });
  return { call, env, Authorization, codeNow, enable: e };
}

test("first run: every refusal carries a stable code; a wrong token is neither consumed nor locks setup for the owner", async () => {
  const { call, env } = await setup();
  const post = (body, headers = {}) => call("/bootstrap", { method: "POST", body, headers });
  assert.deepEqual((await call("/state")).j, { bootstrapped: false });
  const bad = await post({ token: "x".repeat(40), username: "owner", password: PW });
  assert.equal(bad.r.status, 403); assert.equal(bad.j.code, "invalid_token");
  assert.equal((await post({ token: TOKEN, username: "a", password: PW })).j.code, "invalid_username");
  assert.equal((await post({ token: TOKEN, username: "owner", password: "short" })).j.code, "weak_password");
  // 3 refused attempts so far from this address; the correct one still works: wrong attempts did not use the token up
  const ok = await post({ token: TOKEN, username: "owner", password: PW });
  assert.equal(ok.r.status, 201);
  assert.deepEqual((await call("/state")).j, { bootstrapped: true });
  const again = await post({ token: TOKEN, username: "owner2", password: PW });
  assert.equal(again.r.status, 409); assert.equal(again.j.code, "already_setup", "5th attempt: the token cannot create a second account");
  assert.equal((await post({ token: TOKEN, username: "owner2", password: PW })).j.code, "too_many", "6th attempt of the hour from one address");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_users").first()).n, 1);
  // another address: the token no longer creates anything once an owner exists
  const other = await post({ token: TOKEN, username: "owner2", password: PW }, { "CF-Connecting-IP": "203.0.113.9" });
  assert.equal(other.r.status, 409); assert.equal(other.j.code, "already_setup");
  assert.equal((await env.DB.prepare("SELECT username FROM admin_users").first()).username, "owner");
});

test("first run: five wrong tokens stop that address for an hour, another address can still finish setup", async () => {
  const { call } = await setup();
  const post = (token, ip) => call("/bootstrap", { method: "POST", body: { token, username: "owner", password: PW }, headers: { "CF-Connecting-IP": ip } });
  for (let i = 0; i < 5; i++) assert.equal((await post("y".repeat(40), "198.51.100.7")).j.code, "invalid_token");
  const sixth = await post(TOKEN, "198.51.100.7");
  assert.equal(sixth.r.status, 429); assert.equal(sixth.j.code, "too_many");
  assert.ok(Number(sixth.r.headers.get("Retry-After")) > 0);
  assert.equal((await post(TOKEN, "198.51.100.8")).r.status, 201, "the token itself is not locked");
});

test("first run: closed (503 setup_closed) when the token secret is missing or shorter than 32 characters", async () => {
  for (const t of ["", "short-token"]) {
    const { call } = await setup({ ADMIN_BOOTSTRAP_TOKEN: t });
    const r = await call("/bootstrap", { method: "POST", body: { token: t, username: "owner", password: PW } });
    assert.equal(r.r.status, 503); assert.equal(r.j.code, "setup_closed");
  }
});

test("recovery codes: ten are returned once when 2-step is turned on; only hashes are stored", async () => {
  const { env, enable, call, Authorization } = await withTotp();
  assert.equal(enable.r.status, 200);
  const codes = enable.j.recovery_codes;
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  const rows = (await env.DB.prepare("SELECT * FROM admin_recovery_codes").all()).results;
  assert.equal(rows.length, 10);
  const dump = JSON.stringify(rows) + JSON.stringify((await env.DB.prepare("SELECT * FROM audit_log").all()).results);
  for (const c of codes) { assert.ok(!dump.includes(c)); assert.ok(!dump.includes(c.replace("-", ""))); }
  for (const r of rows) assert.match(r.hash, /^[a-f0-9]{64}$/);
  const me = await call("/me", { headers: { Authorization } });
  assert.equal(me.j.recovery_left, 10);
  assert.equal(JSON.stringify(me.j).includes(codes[0]), false, "never shown again");
  const twice = await call("/totp/enable", { method: "POST", body: { code: "123456" }, headers: { Authorization } });
  assert.equal(twice.r.status, 409); assert.equal(twice.j.code, "totp_already_on");
});

test("recovery codes: one code signs in exactly once (any spelling), a wrong one fails like a wrong 6-digit code", async () => {
  const { env, enable, call } = await withTotp();
  const [c1, c2] = enable.j.recovery_codes;
  const login = body => call("/login", { method: "POST", body: { username: "owner", password: PW, ...body } });
  const none = await login({});
  assert.equal(none.r.status, 401); assert.equal(none.j.code, "invalid_totp");
  const wrong = await login({ recovery: "AAAAA-AAAAA" });
  assert.equal(wrong.r.status, 401); assert.equal(wrong.j.code, "invalid_recovery");
  assert.equal((await login({ recovery: "not a code" })).j.code, "invalid_recovery");
  assert.equal((await env.DB.prepare("SELECT failed_count FROM admin_users").first()).failed_count, 3, "counted as failed sign-ins");
  // a recovery code never works without the password
  const noPw = await call("/login", { method: "POST", body: { username: "owner", password: "wrong password 123", recovery: c1 } });
  assert.equal(noPw.r.status, 401); assert.equal(noPw.j.code, "invalid_credentials");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE used_at IS NULL").first()).n, 10, "not burnt by a wrong password");
  await env.DB.prepare("DELETE FROM rate_limits").run().catch(() => {});
  await env.DB.prepare("UPDATE admin_users SET failed_count = 0, locked_until = 0").run();
  const ok = await login({ recovery: " " + c1.toLowerCase().replace("-", " ") + " " });
  assert.equal(ok.r.status, 200);
  assert.equal(ok.j.recovery_left, 9);
  const reuse = await login({ recovery: c1 });
  assert.equal(reuse.r.status, 401); assert.equal(reuse.j.code, "invalid_recovery");
  const acts = (await env.DB.prepare("SELECT action, detail FROM audit_log").all()).results;
  assert.ok(acts.some(a => a.action === "recovery.used" && /"left":9/.test(a.detail)));
  // parallel use of one code: at most one sign-in
  await env.DB.prepare("DELETE FROM rate_limits").run().catch(() => {});
  await env.DB.prepare("UPDATE admin_users SET failed_count = 0, locked_until = 0").run();
  const both = await Promise.all([login({ recovery: c2 }), login({ recovery: c2 })]);
  assert.equal(both.filter(x => x.r.status === 200).length, 1);
});

test("recovery codes: over the sign-in write ceiling (buffered database) an unknown code is still refused", async () => {
  const { resetAdminState } = await import(B + "tester.js");
  resetAdminState();
  const { enable, call, env } = await withTotp({ ADMIN_UNAUTH_WRITES_HOUR: "1" });
  const login = (body, ip) => call("/login", { method: "POST", body: { username: "owner", password: PW, ...body }, headers: { "CF-Connecting-IP": ip } });
  // the ceiling (1 write) is long passed by bootstrap + the first sign-in: these run on the buffering view
  const wrong = await login({ recovery: "BBBBB-BBBBB" }, "198.51.100.20");
  assert.equal(wrong.r.status, 401); assert.equal(wrong.j.code, "invalid_recovery");
  const ok = await login({ recovery: enable.j.recovery_codes[3] }, "198.51.100.21");
  assert.equal(ok.r.status, 200);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE used_at IS NOT NULL").first()).n, 1, "the claim was written");
  assert.equal((await login({ recovery: enable.j.recovery_codes[3] }, "198.51.100.22")).r.status, 401, "and cannot be used again");
  resetAdminState();
});

test("recovery codes: turning 2-step off with one (lost phone) needs the password too and removes every code", async () => {
  const { env, enable, call, Authorization } = await withTotp();
  const off = body => call("/totp/disable", { method: "POST", body, headers: { Authorization } });
  assert.equal((await off({ password: PW, recovery: "AAAAA-AAAAA" })).r.status, 403);
  assert.equal((await off({ password: "wrong password 123", recovery: enable.j.recovery_codes[0] })).r.status, 403);
  assert.equal((await env.DB.prepare("SELECT totp_enabled FROM admin_users").first()).totp_enabled, 1);
  assert.equal((await off({ password: PW, recovery: enable.j.recovery_codes[0] })).r.status, 200);
  assert.equal((await env.DB.prepare("SELECT totp_enabled FROM admin_users").first()).totp_enabled, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_recovery_codes").first()).n, 0);
  assert.equal((await call("/login", { method: "POST", body: { username: "owner", password: PW } })).r.status, 200, "password alone again");
});

test("recovery codes: a new set needs password + 6-digit code and voids the old set", async () => {
  const { enable, call, Authorization, codeNow } = await withTotp();
  const regen = body => call("/totp/recovery", { method: "POST", body, headers: { Authorization } });
  assert.equal((await regen({ password: PW })).r.status, 403, "6-digit code required");
  assert.equal((await regen({ password: PW, totp: "000000" })).r.status, 403);
  const r = await regen({ password: PW, totp: await codeNow() });
  assert.equal(r.r.status, 200);
  assert.equal(r.j.recovery_codes.length, 10);
  assert.ok(!r.j.recovery_codes.includes(enable.j.recovery_codes[0]));
  const old = await call("/login", { method: "POST", body: { username: "owner", password: PW, recovery: enable.j.recovery_codes[0] } });
  assert.equal(old.r.status, 401);
  const fresh = await call("/login", { method: "POST", body: { username: "owner", password: PW, recovery: r.j.recovery_codes[0] } });
  assert.equal(fresh.r.status, 200);
  // without 2-step there is nothing to issue
  const plain = await setup(); await boot(plain.call);
  const l = await plain.call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const no = await plain.call("/totp/recovery", { method: "POST", body: { password: PW }, headers: { Authorization: "Bearer " + l.j.token } });
  assert.equal(no.r.status, 409); assert.equal(no.j.code, "totp_off");
});

// ---- independent review 2026-11-11 ------------------------------------------------------------------------------------
test("review: over the write ceiling one recovery code (and one 6-digit code) still signs in once under parallel requests", async () => {
  const { resetAdminState } = await import(B + "tester.js");
  resetAdminState();
  const { enable, call, env, codeNow } = await withTotp({ ADMIN_UNAUTH_WRITES_HOUR: "1" });
  const login = (body, i) => call("/login", { method: "POST", body: { username: "owner", password: PW, ...body }, headers: { "CF-Connecting-IP": "198.51.100." + (40 + i) } });
  const rec = await Promise.all([0, 1, 2].map(i => login({ recovery: enable.j.recovery_codes[5] }, i)));
  assert.deepEqual(rec.map(x => x.r.status).sort(), [200, 401, 401]);
  assert.equal(rec.find(x => x.r.status === 200).j.recovery_left, 9);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_sessions").first()).n, 2, "the set-up session + exactly one new one");
  const used = (await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'recovery.used'").all()).results;
  assert.deepEqual(used.map(u => u.detail), ['{"left":9}']);
  const code = await codeNow();
  const totp = await Promise.all([3, 4, 5].map(i => login({ totp: code }, i)));
  assert.deepEqual(totp.map(x => x.r.status).sort(), [200, 401, 401]);
  resetAdminState();
});

test("review: without the recovery-code table 2-step verification is not left on, and /health/deep reports the missing migration", async () => {
  const { crypto } = await mods();
  const { call, env } = await setup();
  await boot(call);
  const { j } = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const Authorization = "Bearer " + j.token;
  const s = await call("/totp/setup", { method: "POST", body: { password: PW }, headers: { Authorization } });
  await env.DB.prepare("DROP TABLE admin_recovery_codes").run();
  const orig = console.log; console.log = () => {};
  let e;
  try { e = await call("/totp/enable", { method: "POST", body: { code: await crypto.totpAt(crypto.base32Decode(s.j.secret), Math.floor(Date.now() / 1000 / 30)) }, headers: { Authorization } }); }
  finally { console.log = orig; }
  assert.equal(e.r.status, 500);
  assert.equal((await env.DB.prepare("SELECT totp_enabled FROM admin_users").first()).totp_enabled, 0, "not left on without codes");
  assert.equal((await call("/me", { headers: { Authorization } })).r.status, 200, "the back office still opens");
  const { deepHealth } = await import(B + "health.js");
  const h = await deepHealth(env);
  assert.equal(h.ok, false);
  // the dropped table also lacks the columns of 0013 (slow recovery hash, 2026-11-11): both are named, exactly
  assert.deepEqual(h.migrations.missing, ["0011_admin_recovery.sql", "0013_recovery_slow_hash.sql"]);
});

test("review: a body that is not a JSON object is refused with 400 on the admin routes", async () => {
  const { call } = await setup();
  for (const body of ["null", "[]", "\"x\"", "7"]) {
    for (const path of ["/bootstrap", "/login"]) {
      const r = await call(path, { method: "POST", body });
      assert.equal(r.r.status, 400, path + " " + body);
    }
  }
});
