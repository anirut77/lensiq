"use strict";
// tests/unit/backend-org-p1b.test.js — org-p1b: fixes for the independent security review of org-p1 (Low / Info findings),
// coordinator order 2026-11-14. Fixed tests LOCKED (evals-locks/org-p1b.sha256, ~/LENSIQ-field/evals/org-p1b/) BEFORE the fix.
// Harness copied verbatim from tests/unit/backend-org-p1.test.js. Local only; placeholders only.
//   B1 (L1) a closed organisation is listed in GET /api/me/orgs for its active ADMINS only, as export_only: true (status
//      "closed"); staff do not see it; every other route of it stays 404; export works. Live organisations: export_only false
//   B2 (L4) the export cap is per organisation AND per person: one admin at the cap (30 an hour) does not lock out another
//      admin of the same organisation, nor the same person in another organisation
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { generateKeyPairSync, createSign, createHash } = require("node:crypto");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = path.join(__dirname, "..", "..");
const B = "../../backend/src/";
const CLIENT_ID = "test-client.apps.example";
const KEK = Buffer.alloc(32, 7).toString("base64");
const ADMIN_TOKEN = "bootstrap-" + "t".repeat(40);
const ADMIN_PW = "correct horse battery staple";
const TAX_ID = "0105555555555"; // placeholder 13 digits
const ADDR = "99 Placeholder Road";
const BILL_EMAIL = "billing@example.test";
const ID0 = "0".repeat(32);

const b64u = b => Buffer.from(b).toString("base64url");
const nowS = () => Math.floor(Date.now() / 1000);
const sha = s => createHash("sha256").update(s).digest("hex");
const K = (() => { const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 }); return { kid: "k1", privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" } }; })();
function jwt(claims) {
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid: K.kid })), p = b64u(JSON.stringify(claims));
  return h + "." + p + "." + b64u(createSign("RSA-SHA256").update(h + "." + p).sign(K.privateKey));
}
const claims = (over = {}) => ({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "100", email: "owner@example.test", email_verified: true, given_name: "Anan", iat: nowS() - 5, exp: nowS() + 3600, nonce: "n", ...over });

async function setup(vars = { ORG_ACCOUNTS: "on" }) {
  const { handle } = await import(B + "index.js");
  (await import(B + "google.js")).resetJwksCache();
  const fetchImpl = async (url, init = {}) => {
    url = String(url);
    if (url === "https://www.googleapis.com/oauth2/v3/certs") return new Response(JSON.stringify({ keys: [K.jwk] }), { headers: { "Cache-Control": "max-age=3600" } });
    if (/turnstile\/v0\/siteverify$/.test(url)) {
      const p = new URLSearchParams(String(init.body));
      const [tok, action] = String(p.get("response")).split(":");
      return new Response(JSON.stringify({ success: tok === "good", action: action || "signin", hostname: "site.example" }));
    }
    throw new Error("unexpected network call in test: " + url);
  };
  const env = createEnv({ GOOGLE_CLIENT_ID: CLIENT_ID, TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: KEK, ...vars });
  // every SQL statement prepared while `rec.on` is true is recorded (F2 / F3: no organisation table touched when off)
  const rec = { on: false, sql: [] };
  const prep = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => { if (rec.on) rec.sql.push(String(sql)); return prep(sql); };
  const call = async (p, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(p, { method: o.method || "GET", body: o.body, headers }), env, { fetch: fetchImpl });
    let j = null; try { j = await r.clone().json(); } catch { /* empty */ }
    return { status: r.status, j, headers: r.headers };
  };
  const signIn = async (sub, email, name) => {
    const n = await call("/api/auth/nonce", { method: "POST", body: {} });
    const r = await call("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: jwt(claims({ sub, email, given_name: name, nonce: n.j.nonce })), nonce: n.j.nonce, accept_terms: true, consent_version: "m1" } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    return { token: r.j.token, id: r.j.user.id, sub, email };
  };
  const fresh = async m => {
    const n = await call("/api/auth/nonce", { method: "POST", body: { purpose: "reauth" } });
    const r = await call("/api/auth/reauth", { method: "POST", token: m.token, body: { credential: jwt(claims({ sub: m.sub, email: m.email, nonce: n.j.nonce, auth_time: nowS() - 5 })), nonce: n.j.nonce } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
  };
  let adminTok = null;
  const admin = async (p, o = {}) => {
    if (!adminTok) {
      await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
      adminTok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
    }
    return call("/admin/api" + p, { ...o, token: adminTok });
  };
  const inviteToken = link => { const m = /#org_invite=([A-Za-z0-9_-]{43})$/.exec(link); assert.ok(m, "invite link: " + link); return m[1]; };
  const accept = (m, tok) => call("/api/org-invites/accept", { method: "POST", token: m.token, body: { token: tok } });
  /** an organisation with an accepted owner (+ optional admin / staff members) */
  const org = async (name, n, { withAdmin = true, withStaff = true } = {}) => {
    const c = await admin("/orgs", { method: "POST", body: { name, password: ADMIN_PW, billing: { name: name + " Co., Ltd.", tax_id: TAX_ID, address: ADDR, email: BILL_EMAIL } } });
    assert.equal(c.status, 201, JSON.stringify(c.j));
    const owner = await signIn(n + "1", `owner${n}@example.test`, "Owner" + n);
    assert.equal((await accept(owner, inviteToken(c.j.owner_invite.link_path))).status, 200);
    const out = { id: c.j.org.id, owner, admin: null, staff: null };
    for (const [role, on] of [["admin", withAdmin], ["staff", withStaff]]) {
      if (!on) continue;
      const inv = await call(`/api/orgs/${out.id}/invites`, { method: "POST", token: owner.token, body: { role } });
      assert.equal(inv.status, 201, JSON.stringify(inv.j));
      const who = await signIn(n + (role === "admin" ? "2" : "3"), `${role}${n}@example.test`, role + n);
      assert.equal((await accept(who, inviteToken(inv.j.link_path))).status, 200);
      out[role] = who;
    }
    return out;
  };
  const rowsOf = async (table, orgId) => JSON.stringify((await env.DB.prepare(`SELECT * FROM ${table} WHERE ${table === "orgs" ? "id" : "org_id"} = ?1 ORDER BY 1, 2`).bind(orgId).all()).results);
  const snapshot = async orgId => { let s = ""; for (const t of ["orgs", "org_members", "org_invites", "org_audit", "org_licences"]) s += await rowsOf(t, orgId); return s; };
  const dump = async () => {
    const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(r => r.name);
    let s = "";
    for (const t of tables) s += JSON.stringify((await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results);
    return s;
  };
  return { env, rec, call, signIn, fresh, admin, inviteToken, accept, org, snapshot, dump };
}


/* ---------------- B1 ---------------- */
test("B1: a closed organisation stays listed for its admins as export-only; staff do not see it; other routes 404; export works", async () => {
  const t = await setup();
  const o = await t.org("Closed Listing School", "a1");
  const live = await t.call("/api/me/orgs", { token: o.owner.token });
  assert.deepEqual(live.j.orgs.map(x => [x.id, x.status, x.export_only]), [[o.id, "active", false]]);
  assert.equal((await t.admin(`/orgs/${o.id}`, { method: "PUT", body: { status: "closed", password: ADMIN_PW } })).status, 200);
  for (const who of [o.owner, o.admin]) {
    const r = await t.call("/api/me/orgs", { token: who.token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.j.orgs.map(x => [x.id, x.name, x.status, x.role, x.export_only]), [[o.id, "Closed Listing School", "closed", "admin", true]], "admin sees it export-only");
    for (const p of [`/api/orgs/${o.id}`, `/api/orgs/${o.id}/licences`, `/api/orgs/${o.id}/audit`]) assert.equal((await t.call(p, { token: who.token })).status, 404, p + " stays 404");
    await t.fresh(who);
    const ex = await t.call(`/api/orgs/${o.id}/export`, { token: who.token });
    assert.equal(ex.status, 200, JSON.stringify(ex.j));
    assert.equal(ex.j.org.status, "closed");
  }
  assert.deepEqual((await t.call("/api/me/orgs", { token: o.staff.token })).j.orgs, [], "staff of a closed organisation see nothing");
  const sus = await t.org("Suspended Listing Co", "a2", { withAdmin: false, withStaff: false });
  assert.equal((await t.admin(`/orgs/${sus.id}`, { method: "PUT", body: { status: "suspended", password: ADMIN_PW } })).status, 200);
  assert.deepEqual((await t.call("/api/me/orgs", { token: sus.owner.token })).j.orgs.map(x => [x.status, x.export_only]), [["suspended", false]]);
});

/* ---------------- B2 ---------------- */
test("B2: the export cap is per organisation and per person — one admin at the cap does not lock out another admin", async () => {
  const t = await setup();
  const o = await t.org("Cap Check School", "b1", { withStaff: false });
  await t.fresh(o.owner); await t.fresh(o.admin);
  for (let i = 0; i < 30; i++) assert.equal((await t.call(`/api/orgs/${o.id}/export`, { token: o.owner.token })).status, 200, "export " + (i + 1));
  const over = await t.call(`/api/orgs/${o.id}/export`, { token: o.owner.token });
  assert.equal(over.status, 429, "the 31st export of one person in an hour is refused");
  const other = await t.call(`/api/orgs/${o.id}/export`, { token: o.admin.token });
  assert.equal(other.status, 200, "another admin of the same organisation is not locked out: " + JSON.stringify(other.j));
  // the same person in a second organisation has a separate allowance
  const c = await t.admin("/orgs", { method: "POST", body: { name: "Second Cap Org", password: ADMIN_PW } });
  const tokB = t.inviteToken(c.j.owner_invite.link_path);
  const me2 = { ...o.owner };
  assert.equal((await t.accept(me2, tokB)).status, 200);
  assert.equal((await t.call(`/api/orgs/${c.j.org.id}/export`, { token: o.owner.token })).status, 200, "own allowance per organisation");
});
