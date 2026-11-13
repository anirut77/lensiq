"use strict";
// tests/unit/backend-recovery-slow.test.js — FIXED SET written before the change (launch item L51, owner 2026-11-11:
// "store recovery codes with a slow, salted hash"). Checksum in ~/LENSIQ-field/evals/recovery/locked.sha256.
// R1 storage: per-code random salt + PBKDF2 (RECOVERY_ITERATIONS) + a lookup keyed with SECRETS_KEK; never the plain
//    SHA-256 of the code. R2 a code signs in once. R3 the slow hash is really checked. R4 codes issued before the change
//    (plain SHA-256 rows) keep working until a new set is issued, and /me says how many such codes are left.
//    R5 without SECRETS_KEK a new code is refused cleanly (no 500). R6 turning 2-step off removes every code.
//    R7 migration 0013 is probed by /health/deep. R8 the security tab tells the owner to issue a new set (TH/EN/ZH).
const test = require("node:test");
// test-bug re-lock 2026-11-14: one frozen clock for the code generator and the Worker (tests/unit/totp-clock.js; CI run 43464554484)
require("./totp-clock.js").freeze();
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const TOKEN = "bootstrap-" + "t".repeat(40);
const PW = "correct horse battery staple";
const KEK = Buffer.alloc(32, 7).toString("base64");
const ROOT = join(__dirname, "..", "..");

async function mods() { return { index: await import(B + "index.js"), crypto: await import(B + "crypto.js"), auth: await import(B + "auth.js") }; }
async function withTotp(vars = {}) {
  const { index, crypto } = await mods();
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: TOKEN, SECRETS_KEK: KEK, ...vars });
  const call = async (path, opts = {}) => { const r = await index.handle(req("/admin/api" + path, opts), env); let j = null; try { j = await r.clone().json(); } catch { /* */ } return { r, j }; };
  await call("/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW } });
  const { j } = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const Authorization = "Bearer " + j.token;
  const s = await call("/totp/setup", { method: "POST", body: { password: PW }, headers: { Authorization } });
  const secret = crypto.base32Decode(s.j.secret);
  const codeNow = async () => { await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run(); return crypto.totpAt(secret, Math.floor(Date.now() / 1000 / 30)); };
  const enable = await call("/totp/enable", { method: "POST", body: { code: await codeNow() }, headers: { Authorization } });
  const login = (extra, ip = "198.51.100.40") => call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer", ...extra }, headers: { "CF-Connecting-IP": ip } });
  return { env, call, Authorization, codeNow, enable, login };
}
const sha256 = s => require("node:crypto").createHash("sha256").update(s).digest("hex");

test("R1 storage: salted slow hash per code, keyed lookup, no plain SHA-256", async () => {
  const { auth } = await mods();
  assert.ok(Number.isInteger(auth.RECOVERY_ITERATIONS) && auth.RECOVERY_ITERATIONS >= 1000, "iterations exported, >= 1000");
  const { env, enable } = await withTotp();
  assert.equal(enable.r.status, 200);
  const codes = enable.j.recovery_codes;
  const rows = (await env.DB.prepare("SELECT * FROM admin_recovery_codes").all()).results;
  assert.equal(rows.length, 10);
  const salts = new Set(rows.map(r => r.salt));
  assert.equal(salts.size, 10, "a different random salt per code");
  for (const r of rows) {
    assert.match(String(r.salt), /^[A-Za-z0-9+/=]{20,}$/, "salt stored (base64, >= 16 bytes)");
    assert.match(String(r.slow_hash), /^[A-Za-z0-9+/=]{40,}$/, "slow hash stored");
    assert.equal(r.iterations, auth.RECOVERY_ITERATIONS);
    assert.match(r.hash, /^[a-f0-9]{64}$/);
  }
  const plain = new Set(codes.map(c => sha256("recovery:" + c.replace("-", ""))));
  assert.ok(rows.every(r => !plain.has(r.hash)), "the lookup is not the unkeyed SHA-256 of the code");
  // keyed: the same code under another KEK gives another lookup value
  const other = await withTotp({ SECRETS_KEK: Buffer.alloc(32, 9).toString("base64") });
  const o = (await other.env.DB.prepare("SELECT hash FROM admin_recovery_codes").all()).results.map(r => r.hash);
  assert.ok(o.every(h => !rows.some(r => r.hash === h)));
});

test("R2 a new code signs in exactly once, any spelling; a wrong one is refused", async () => {
  const { enable, login } = await withTotp();
  const [c1] = enable.j.recovery_codes;
  assert.equal((await login({ recovery: "AAAAA-AAAAA" })).j.code, "invalid_recovery");
  const ok = await login({ recovery: " " + c1.toLowerCase().replace("-", " ") + " " });
  assert.equal(ok.r.status, 200); assert.equal(ok.j.recovery_left, 9);
  assert.equal((await login({ recovery: c1 })).j.code, "invalid_recovery", "used once only");
});

test("R3 the slow hash is checked: a row whose slow hash does not match refuses its code", async () => {
  const { env, enable, login } = await withTotp();
  const c = enable.j.recovery_codes[2];
  await env.DB.prepare("UPDATE admin_recovery_codes SET slow_hash = ?1 WHERE salt IS NOT NULL").bind(Buffer.alloc(32, 1).toString("base64")).run();
  const r = await login({ recovery: c });
  assert.equal(r.r.status, 401); assert.equal(r.j.code, "invalid_recovery");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE used_at IS NOT NULL").first()).n, 0, "nothing claimed");
});

test("R4 codes issued before the change keep working until a new set; /me counts them; a new set removes them", async () => {
  const { env, call, Authorization, codeNow, login } = await withTotp();
  // a set issued by the old code: plain SHA-256 rows, no salt
  const legacy = ["ABCDE-FGHIJ", "KLMNO-PQRST"];
  await env.DB.prepare("DELETE FROM admin_recovery_codes").run();
  for (const c of legacy) await env.DB.prepare("INSERT INTO admin_recovery_codes (hash, created_at) VALUES (?1, 1)").bind(sha256("recovery:" + c.replace("-", ""))).run();
  let me = await call("/me", { headers: { Authorization } });
  assert.equal(me.j.recovery_left, 2); assert.equal(me.j.recovery_legacy, 2);
  const ok = await login({ recovery: legacy[0] });
  assert.equal(ok.r.status, 200);
  assert.equal((await login({ recovery: legacy[0] })).j.code, "invalid_recovery", "legacy code used once only");
  const regen = await call("/totp/recovery", { method: "POST", body: { password: PW, totp: await codeNow() }, headers: { Authorization } });
  assert.equal(regen.r.status, 200); assert.equal(regen.j.recovery_codes.length, 10);
  me = await call("/me", { headers: { Authorization } });
  assert.equal(me.j.recovery_left, 10); assert.equal(me.j.recovery_legacy, 0);
  assert.equal((await login({ recovery: legacy[1] })).j.code, "invalid_recovery", "old set stops working");
  const rows = (await env.DB.prepare("SELECT * FROM admin_recovery_codes").all()).results;
  assert.ok(rows.every(r => r.salt && r.slow_hash), "only salted rows remain");
});

test("R5 without SECRETS_KEK a new code is refused cleanly (no server error)", async () => {
  const { env, enable } = await withTotp();
  const { index } = await mods();
  const env2 = { ...env, SECRETS_KEK: "" };
  const r = await index.handle(req("/admin/api/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer", recovery: enable.j.recovery_codes[0] },
    headers: { "CF-Connecting-IP": "198.51.100.41" } }), env2);
  assert.ok(r.status === 401 || r.status === 503, "refused, status " + r.status);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE used_at IS NOT NULL").first()).n, 0);
});

test("R6 turning 2-step off removes every code, new and old", async () => {
  const { env, call, Authorization, codeNow } = await withTotp();
  await env.DB.prepare("INSERT INTO admin_recovery_codes (hash, created_at) VALUES (?1, 1)").bind(sha256("recovery:ZZZZZZZZZZ")).run();
  const off = await call("/totp/disable", { method: "POST", body: { password: PW, code: await codeNow() }, headers: { Authorization } });
  assert.equal(off.r.status, 200);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_recovery_codes").first()).n, 0);
});

test("R7 migration 0013 exists, is listed and probed by the health check", () => {
  const sql = readFileSync(join(ROOT, "backend", "migrations", "0013_recovery_slow_hash.sql"), "utf8");
  assert.match(sql, /ALTER TABLE admin_recovery_codes ADD COLUMN salt/);
  const health = readFileSync(join(ROOT, "backend", "src", "health.js"), "utf8");
  assert.match(health, /"0013_recovery_slow_hash\.sql"/);
  assert.match(health, /\["0013_recovery_slow_hash\.sql", "SELECT [^"]*salt[^"]*FROM admin_recovery_codes/);
});

test("R8 the security tab asks for a new set while old-format codes remain (TH / EN / ZH)", () => {
  const html = readFileSync(join(ROOT, "admin.html"), "utf8"), js = readFileSync(join(ROOT, "admin.js"), "utf8");
  assert.match(html, /id="adRecLegacy"[^>]*hidden/);
  assert.match(js, /recovery_legacy/);
  for (const f of ["en-admin.js", "zh-admin.js"]) assert.match(readFileSync(join(ROOT, "i18n", f), "utf8"), /"adm\.sec\.legacy":/);
});
