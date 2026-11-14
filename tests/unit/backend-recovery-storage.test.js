"use strict";
// tests/unit/backend-recovery-storage.test.js — L51 audit 2026-11-14 (stale-docs): beyond the locked set
// backend-recovery-slow.test.js, check that no recovery code is kept in readable form ANYWHERE in the database
// (every table, every column: recovery rows, audit log, sessions …) after enable, a sign-in with a code, a new set and
// turning 2-step off, and that the PBKDF2 input is the keyed form of the code, never the code itself.
const test = require("node:test");
require("./totp-clock.js").freeze();
const assert = require("node:assert/strict");
const { createHash, pbkdf2Sync } = require("node:crypto");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const TOKEN = "bootstrap-" + "s".repeat(40);
const PW = "correct horse battery staple";
const KEK = Buffer.alloc(32, 5).toString("base64");
const sha256 = s => createHash("sha256").update(s).digest("hex");

async function setup() {
  const index = await import(B + "index.js"), crypto = await import(B + "crypto.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: TOKEN, SECRETS_KEK: KEK });
  const call = async (path, opts = {}) => { const r = await index.handle(req("/admin/api" + path, opts), env); let j = null; try { j = await r.clone().json(); } catch { /* */ } return { r, j }; };
  await call("/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW } });
  const { j } = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer" } });
  const Authorization = "Bearer " + j.token;
  const s = await call("/totp/setup", { method: "POST", body: { password: PW }, headers: { Authorization } });
  const secret = crypto.base32Decode(s.j.secret);
  const codeNow = async () => { await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run(); return crypto.totpAt(secret, Math.floor(Date.now() / 1000 / 30)); };
  const enable = await call("/totp/enable", { method: "POST", body: { code: await codeNow() }, headers: { Authorization } });
  return { env, call, Authorization, codeNow, codes: enable.j.recovery_codes };
}

/** Every value of every row of every table, as text. */
async function dump(db) {
  const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()).results.map(r => r.name);
  const out = [];
  for (const t of tables) for (const row of (await db.prepare(`SELECT * FROM "${t}"`).all()).results || []) for (const v of Object.values(row)) if (v != null) out.push(String(v));
  return out.join("\n");
}
const forms = c => { const n = c.replace("-", ""); return [c, n, n.toLowerCase(), sha256("recovery:" + n), sha256(n), Buffer.from(n).toString("base64")]; };

test("no recovery code in readable or unkeyed-hash form anywhere in the database", async () => {
  const { env, call, Authorization, codeNow, codes } = await setup();
  assert.equal(codes.length, 10);
  const used = await call("/login", { method: "POST", body: { username: "owner", password: PW, mode: "bearer", recovery: codes[0] }, headers: { "CF-Connecting-IP": "198.51.100.60" } });
  assert.equal(used.r.status, 200);
  let all = await dump(env.DB);
  assert.ok(all.includes("totp.enabled") && all.includes("recovery.used"), "control: the dump covers the audit log");
  for (const c of codes) for (const f of forms(c)) assert.ok(!all.includes(f), "first set leaks a form of a code");
  const regen = await call("/totp/recovery", { method: "POST", body: { password: PW, totp: await codeNow() }, headers: { Authorization } });
  assert.equal(regen.r.status, 200);
  all = await dump(env.DB);
  for (const c of [...codes, ...regen.j.recovery_codes]) for (const f of forms(c)) assert.ok(!all.includes(f), "after a new set a form of a code is stored");
  const rows = (await env.DB.prepare("SELECT * FROM admin_recovery_codes").all()).results;
  assert.equal(rows.length, 10);
  assert.ok(rows.every(r => r.salt && r.slow_hash && r.iterations >= 1000), "every row salted + slow");
  // the slow hash is NOT PBKDF2 of the bare code (the code is keyed with a SECRETS_KEK-derived HMAC first)
  for (const r of rows) for (const c of regen.j.recovery_codes) {
    const bare = pbkdf2Sync(c.replace("-", ""), Buffer.from(r.salt, "base64"), r.iterations, 32, "sha256").toString("base64");
    assert.notEqual(bare, r.slow_hash);
  }
  const off = await call("/totp/disable", { method: "POST", body: { password: PW, code: await codeNow() }, headers: { Authorization } });
  assert.equal(off.r.status, 200);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_recovery_codes").first()).n, 0, "2-step off: no rows left");
});
