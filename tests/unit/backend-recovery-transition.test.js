"use strict";
// tests/unit/backend-recovery-transition.test.js — what happens to the owner's EXISTING recovery codes when migration 0013
// (slow, salted hash) is deployed (owner question 2026-11-11). Old-format rows (plain SHA-256, written by the code before
// 0013) survive the migration with salt NULL: each old code keeps working ONCE, is not upgraded on use (it is used up),
// and the whole old set stops working the moment the owner issues a new set. Also: the new Worker on a database where
// 0013 is not applied yet (deploy order mistake) still serves /me and old codes.
const test = require("node:test");
// test-bug re-lock 2026-11-14: one frozen clock for the code generator and the Worker (tests/unit/totp-clock.js; CI run 43464554484)
require("./totp-clock.js").freeze();
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const TOKEN = "bootstrap-" + "t".repeat(40);
const PW = "correct horse battery staple";
const KEK = Buffer.alloc(32, 7).toString("base64");
/** exactly what the code before 0013 stored for a code "ABCDE-FGHIJ" */
const oldRow = code => createHash("sha256").update("recovery:" + code.replace("-", "")).digest("hex");
const OLD = ["QWERT-YUIOP", "ASDFG-HJKLZ", "ZXCVB-NM234", "234567ABCD".replace(/^(.{5})/, "$1-")];

async function owner() {
  const index = await import(B + "index.js"), crypto = await import(B + "crypto.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: TOKEN, SECRETS_KEK: KEK });
  const call = async (p, o = {}) => { const r = await index.handle(req("/admin/api" + p, o), env); let j = null; try { j = await r.clone().json(); } catch { /* */ } return { r, j }; };
  await call("/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW } });
  const { j } = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const Authorization = "Bearer " + j.token;
  const s = await call("/totp/setup", { method: "POST", body: { password: PW }, headers: { Authorization } });
  const secret = crypto.base32Decode(s.j.secret);
  const codeNow = async () => { await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run(); return crypto.totpAt(secret, Math.floor(Date.now() / 1000 / 30)); };
  await call("/totp/enable", { method: "POST", body: { code: await codeNow() }, headers: { Authorization } });
  // the live database today: the owner's set issued by the old code (10 rows in production; 4 here)
  await env.DB.prepare("DELETE FROM admin_recovery_codes").run();
  for (const c of OLD) await env.DB.prepare("INSERT INTO admin_recovery_codes (hash, created_at) VALUES (?1, 1)").bind(oldRow(c)).run();
  let ip = 10;
  const login = recovery => call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer", recovery }, headers: { "CF-Connecting-IP": "198.51.100." + ip++ } });
  return { env, call, Authorization, codeNow, login };
}

test("existing codes after the migration: each works once, is used up (not upgraded), and the set dies with a new set", async () => {
  const { env, call, Authorization, codeNow, login } = await owner();
  let me = await call("/me", { headers: { Authorization } });
  assert.equal(me.j.recovery_left, 4); assert.equal(me.j.recovery_legacy, 4, "the security tab asks for a new set");
  const ok = await login(OLD[0]);
  assert.equal(ok.r.status, 200); assert.equal(ok.j.recovery_left, 3);
  const used = await env.DB.prepare("SELECT salt, slow_hash, used_at FROM admin_recovery_codes WHERE hash = ?1").bind(oldRow(OLD[0])).first();
  assert.ok(used.used_at, "used up"); assert.equal(used.salt, null, "not upgraded: a used code is never stored again");
  assert.equal((await login(OLD[0])).j.code, "invalid_recovery", "an old code works once only");
  // the owner issues a new set: every old code stops working at once
  const regen = await call("/totp/recovery", { method: "POST", body: { password: PW, totp: await codeNow() }, headers: { Authorization } });
  assert.equal(regen.r.status, 200); assert.equal(regen.j.recovery_codes.length, 10);
  for (const c of OLD.slice(1)) assert.equal((await login(c)).j.code, "invalid_recovery", c + " invalid after the new set");
  me = await call("/me", { headers: { Authorization } });
  assert.equal(me.j.recovery_left, 10); assert.equal(me.j.recovery_legacy, 0);
  assert.equal((await login(regen.j.recovery_codes[0])).r.status, 200, "the new set works");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE salt IS NULL").first()).n, 0);
});

test("deploy-order mistake: the new Worker on a database without 0013 still opens /me and accepts old codes once", async () => {
  const { env, call, Authorization, login } = await owner();
  for (const c of ["salt", "slow_hash", "iterations"]) await env.DB.prepare("ALTER TABLE admin_recovery_codes DROP COLUMN " + c).run();
  const me = await call("/me", { headers: { Authorization } });
  assert.equal(me.r.status, 200); assert.equal(me.j.recovery_legacy, 4);
  assert.equal((await login(OLD[1])).r.status, 200);
  assert.equal((await login(OLD[1])).r.status, 401);
});
