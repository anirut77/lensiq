"use strict";
// tests/unit/tryon-reauth.test.js — re-review of tryon-fit @ 95d8e55, should-fix S1 (coordinator 2026-11-14).
// FIXED TEST: written and hash-locked (evals-locks/tryon-mvp.sha256, append-only) BEFORE the fix.
//
//   S1a inline re-auth of a try-on admin (item delete) refuses a LOCKED account with the answer sign-in gives
//       (429 too_many), even with the right password + code; nothing is deleted
//   S1b like the owner's re-auth, 10 wrong inline re-auths in one session revoke the session (401 reauth_revoked);
//       the session can no longer be used
//   S1c the right password + code on an unlocked account still deletes (200)
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "r".repeat(40);
const OWNER_PW = "correct horse battery staple reauth";
const ACC_PW = "a long try-on admin passphrase 2026";
const nowS = () => Math.floor(Date.now() / 1000);
const PNG = (() => { const b = Buffer.alloc(8 + 25 + 64); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b, 0); b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1"); b.writeUInt32BE(40, 16); b.writeUInt32BE(50, 20); return b; })();

async function setup() {
  const { handle } = await import(B + "index.js");
  const crypto = await import(B + "crypto.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 17).toString("base64") });
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers, ip: o.ip }), env, {});
    let j = null; try { j = await r.clone().json(); } catch { /* not JSON */ }
    return { status: r.status, j };
  };
  const totp = (s, d = 0) => crypto.totpAt(crypto.base32Decode(s), Math.floor(nowS() / 30) + d);
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: OWNER_PW } });
  const owner = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: OWNER_PW, mode: "bearer" } })).j.token;
  const O = (p, o = {}) => call("/admin/api" + p, { ...o, token: owner });
  const os = (await O("/totp/setup", { method: "POST", body: { password: OWNER_PW } })).j.secret;
  await O("/totp/enable", { method: "POST", body: { code: await totp(os, -1) } });
  await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
  await O("/reauth", { method: "POST", body: { password: OWNER_PW, totp: await totp(os) } });
  const c = await O("/reviewers", { method: "POST", body: { username: "shopadmin", role: "tryon_admin" } });
  const s1 = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: c.j.setup_code, password: ACC_PW } });
  await call("/admin/api/reviewer-setup/confirm", { method: "POST", body: { code: c.j.setup_code, totp: await totp(s1.j.secret, -1) } });
  const l = await call("/admin/api/login", { method: "POST", body: { username: "shopadmin", password: ACC_PW, totp: await totp(s1.j.secret), mode: "bearer" } });
  assert.equal(l.status, 200, JSON.stringify(l.j));
  const acc = { id: c.j.reviewer.id, token: l.j.token, secret: s1.j.secret };
  const A = (p, o = {}) => call("/admin/api" + p, { ...o, token: acc.token });
  const item = async () => {
    const it = (await O("/tryon/items", { method: "POST", body: { category: "glasses", name_th: "แว่น" } })).j.item;
    assert.equal((await O(`/tryon/items/${it.id}/asset`, { method: "PUT", body: { mime: "image/png", data: PNG.toString("base64"), w: 40, h: 50,
      face_check: { ran: true, faces: 0, confirmed: true } } })).status, 200);
    return it.id;
  };
  const good = async () => { await env.DB.prepare("UPDATE admin_reviewers SET totp_last_step = 0").run(); return { password: ACC_PW, totp: await totp(acc.secret) }; };
  const exists = async id => !!(await env.DB.prepare("SELECT id FROM tryon_items WHERE id = ?1").bind(id).first());
  return { env, A, acc, item, good, exists };
}

test("S1a: a locked try-on admin cannot re-authenticate inline (429 too_many), even with the right password + code", async () => {
  const { env, A, acc, item, good, exists } = await setup();
  const id = await item();
  await env.DB.prepare("UPDATE admin_reviewers SET locked_until = ?1, last_failed_at = ?2 WHERE id = ?3").bind(nowS() + 3600, nowS(), acc.id).run();
  const r = await A(`/tryon/items/${id}`, { method: "DELETE", body: await good() });
  assert.equal(r.status, 429, JSON.stringify(r.j)); assert.equal(r.j.code, "too_many");
  assert.ok(await exists(id), "nothing deleted");
});

test("S1b: 10 wrong inline re-auths in one session revoke the session (401 reauth_revoked)", async () => {
  const { env, A, acc, item, exists } = await setup();
  const id = await item();
  // nine earlier wrong answers in this session (spread over earlier windows, so the per-window limit is not what stops it)
  await env.DB.prepare("UPDATE admin_sessions SET reauth_fails = 9 WHERE reviewer_id = ?1").bind(acc.id).run();
  const r = await A(`/tryon/items/${id}`, { method: "DELETE", body: { password: "wrong passphrase 999", totp: "000000" } });
  assert.equal(r.status, 401, JSON.stringify(r.j)); assert.equal(r.j.code, "reauth_revoked");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_sessions WHERE reviewer_id = ?1").bind(acc.id).first()).n, 0, "session removed");
  assert.equal((await A("/me")).status, 401, "the token no longer works");
  assert.ok(await exists(id));
});

test("S1c: the right password + code on an unlocked account still deletes", async () => {
  const { A, item, good, exists } = await setup();
  const id = await item();
  const r = await A(`/tryon/items/${id}`, { method: "DELETE", body: await good() });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.ok(!(await exists(id)));
});
