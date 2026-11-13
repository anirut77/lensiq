"use strict";
// tests/unit/backend-orgs.test.js — stream G (owner decision 2026-11-13): organisation account LITE — organisation name,
// billing details, admins and staff, invitations, a per-organisation audit log, back-office licence orders for the four
// business products (bank transfer, no online payment, no price in the database), and NO syncing of the customer's people
// data. Locked BEFORE backend/src/orgs.js, backend/src/freetier.js and migration 0017 were written.
// Local only: in-memory D1 (backend-d1-shim.js), fake Google JWKS + Turnstile. Every name, e-mail and tax id is a placeholder.
//
//   O1  the LENSIQ owner creates an organisation in the back office; an owner invitation link (hash stored only)
//   O2  accepting the owner invitation; invitations are single-use, expire, can be revoked
//   O3  org admin invites staff; staff see the organisation but not billing / members / invitations
//   O4  billing details: admin only, validated, audited by field name only (no values)
//   O5  role change and removal need a fresh confirmation; the organisation owner is protected
//   O6  ownership transfer: owner only, fresh confirmation, to an active admin
//   O7  tenant isolation: an admin of one organisation can neither read nor change another (404)
//   O8  per-organisation audit log is a hash chain; tampering is detected
//   O9  no customer people data: unknown fields refused, no sync tables, e-mail-bound invitations store an HMAC only
//   O10 licence orders (back office, re-auth): plans only for Gate, Attendance, Exam lab and Crowd report, no prices;
//       licence status with the 14-day offline window and the free tiers (not enforced)
//   O11 erasure of an organisation owner: account gone, membership gone, organisation kept and flagged "needs owner"
//   O12 export lists the member's organisations and roles
//   O13 a suspended organisation refuses member-side changes
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, createSign } = require("node:crypto");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const CLIENT_ID = "test-client.apps.example";
const KEK = Buffer.alloc(32, 7).toString("base64");
const ADMIN_TOKEN = "bootstrap-" + "t".repeat(40);
const ADMIN_PW = "correct horse battery staple";
const TAX_ID = "0105555555555"; // placeholder 13 digits

const b64u = b => Buffer.from(b).toString("base64url");
const nowS = () => Math.floor(Date.now() / 1000);
const K = (() => { const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 }); return { kid: "k1", privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" } }; })();
function jwt(claims) {
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid: K.kid })), p = b64u(JSON.stringify(claims));
  return h + "." + p + "." + b64u(createSign("RSA-SHA256").update(h + "." + p).sign(K.privateKey));
}
const claims = (over = {}) => ({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "100", email: "owner@example.test", email_verified: true, given_name: "Anan", iat: nowS() - 5, exp: nowS() + 3600, nonce: "n", ...over });

async function setup(vars = {}) {
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
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers }), env, { fetch: fetchImpl });
    let j = null; try { j = await r.clone().json(); } catch { /* empty */ }
    return { status: r.status, j };
  };
  const signIn = async (sub, email, name) => {
    const n = await call("/api/auth/nonce", { method: "POST", body: {} });
    const r = await call("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: jwt(claims({ sub, email, given_name: name, nonce: n.j.nonce })), nonce: n.j.nonce, accept_terms: true, consent_version: "m1" } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    return { token: r.j.token, id: r.j.user.id, sub };
  };
  const fresh = async m => {
    const n = await call("/api/auth/nonce", { method: "POST", body: {} });
    const r = await call("/api/auth/reauth", { method: "POST", token: m.token, body: { credential: jwt(claims({ sub: m.sub, nonce: n.j.nonce, auth_time: nowS() - 5 })), nonce: n.j.nonce } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
  };
  let adminTok = null;
  const admin = async (path, o = {}) => {
    if (!adminTok) {
      await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
      adminTok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
    }
    return call("/admin/api" + path, { ...o, token: adminTok });
  };
  const inviteToken = link => { const m = /#org_invite=([A-Za-z0-9_-]{43})$/.exec(link); assert.ok(m, "invite link: " + link); return m[1]; };
  /** org + owner (accepted) */
  const orgWithOwner = async (name = "Wat Pho School", sub = "100", email = "owner@example.test") => {
    const c = await admin("/orgs", { method: "POST", body: { name, password: ADMIN_PW } }); // A-G6: owner link needs re-auth (S5)
    assert.equal(c.status, 201, JSON.stringify(c.j));
    const owner = await signIn(sub, email, "Anan");
    const a = await call("/api/org-invites/accept", { method: "POST", token: owner.token, body: { token: inviteToken(c.j.owner_invite.link_path) } });
    assert.equal(a.status, 200, JSON.stringify(a.j));
    return { org: c.j.org, owner };
  };
  const dump = async () => {
    const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(r => r.name);
    let s = "";
    for (const t of tables) s += JSON.stringify((await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results);
    return s;
  };
  return { env, call, signIn, fresh, admin, inviteToken, orgWithOwner, dump };
}

/* ---------------- O1 ---------------- */
test("O1: the LENSIQ owner creates an organisation; the owner invitation link carries a one-time token stored as a hash only", async () => {
  const t = await setup();
  assert.equal((await t.call("/admin/api/orgs", { method: "POST", body: { name: "X" } })).status, 401, "back office needs the admin session");
  const bad = await t.admin("/orgs", { method: "POST", body: { name: "", password: ADMIN_PW } }); // A-G6
  assert.equal(bad.status, 400);
  const c = await t.admin("/orgs", { method: "POST", body: { name: "Wat Pho School", password: ADMIN_PW } }); // A-G6
  assert.equal(c.status, 201, JSON.stringify(c.j));
  assert.match(c.j.org.id, /^[a-f0-9]{32}$/);
  assert.equal(c.j.org.name, "Wat Pho School");
  assert.equal(c.j.org.status, "active");
  assert.match(c.j.owner_invite.link_path, /^account\.html#org_invite=[A-Za-z0-9_-]{43}$/, "token in the fragment: never sent to a server in a URL");
  assert.ok(c.j.owner_invite.expires_at - nowS() <= 72 * 3600 + 5);
  const tok = t.inviteToken(c.j.owner_invite.link_path);
  assert.ok(!(await t.dump()).includes(tok), "only the hash of the invitation token is stored");
  const list = await t.admin("/orgs");
  assert.equal(list.status, 200);
  assert.deepEqual(list.j.orgs.map(o => o.name), ["Wat Pho School"]);
  assert.equal(list.j.orgs[0].members, 0);
  assert.equal(list.j.orgs[0].needs_owner, true);
  const audit = (await t.env.DB.prepare("SELECT action FROM audit_log").all()).results.map(r => r.action);
  assert.ok(audit.includes("org.created"));
  const oa = (await t.env.DB.prepare("SELECT action, actor_kind FROM org_audit").all()).results;
  assert.deepEqual(oa.map(r => [r.action, r.actor_kind]), [["org.created", "lensiq_owner"], ["invite.created", "lensiq_owner"]]);
});

/* ---------------- O2 ---------------- */
test("O2: accepting the owner invitation makes an owner-admin; invitations are single-use, expire and can be revoked", async () => {
  const t = await setup();
  const c = await t.admin("/orgs", { method: "POST", body: { name: "Condo A", password: ADMIN_PW } }); // A-G6
  const tok = t.inviteToken(c.j.owner_invite.link_path);
  assert.equal((await t.call("/api/org-invites/accept", { method: "POST", body: { token: tok } })).status, 401, "sign-in required");
  const owner = await t.signIn("100", "owner@example.test", "Anan");
  const a = await t.call("/api/org-invites/accept", { method: "POST", token: owner.token, body: { token: tok } });
  assert.equal(a.status, 200, JSON.stringify(a.j));
  assert.deepEqual([a.j.org.id, a.j.role, a.j.is_owner], [c.j.org.id, "admin", true]);
  const mine = await t.call("/api/me/orgs", { token: owner.token });
  assert.deepEqual(mine.j.orgs.map(o => [o.name, o.role, o.is_owner]), [["Condo A", "admin", true]]);
  const other = await t.signIn("200", "staff@example.test", "Boon");
  const reuse = await t.call("/api/org-invites/accept", { method: "POST", token: other.token, body: { token: tok } });
  assert.equal(reuse.status, 410); assert.equal(reuse.j.code, "invite_invalid");
  const inv = await t.call(`/api/orgs/${c.j.org.id}/invites`, { method: "POST", token: owner.token, body: { role: "staff" } });
  assert.equal(inv.status, 201, JSON.stringify(inv.j));
  await t.env.DB.prepare("UPDATE org_invites SET expires_at = ?1 WHERE id = ?2").bind(nowS() - 1, inv.j.invite_id).run();
  const late = await t.call("/api/org-invites/accept", { method: "POST", token: other.token, body: { token: t.inviteToken(inv.j.link_path) } });
  assert.equal(late.status, 410); assert.equal(late.j.code, "invite_invalid");
  const inv2 = await t.call(`/api/orgs/${c.j.org.id}/invites`, { method: "POST", token: owner.token, body: { role: "staff" } });
  const rv = await t.call(`/api/orgs/${c.j.org.id}/invites/${inv2.j.invite_id}`, { method: "DELETE", token: owner.token });
  assert.equal(rv.status, 200);
  const revoked = await t.call("/api/org-invites/accept", { method: "POST", token: other.token, body: { token: t.inviteToken(inv2.j.link_path) } });
  assert.equal(revoked.status, 410);
  const junk = await t.call("/api/org-invites/accept", { method: "POST", token: other.token, body: { token: "x" } });
  assert.equal(junk.status, 400);
});

/* ---------------- O3 ---------------- */
test("O3: an org admin invites staff; staff see the organisation and their role only, and cannot manage it", async () => {
  const t = await setup();
  const { org, owner } = await t.orgWithOwner();
  const inv = await t.call(`/api/orgs/${org.id}/invites`, { method: "POST", token: owner.token, body: { role: "staff" } });
  const staff = await t.signIn("200", "staff@example.test", "Boon");
  const acc = await t.call("/api/org-invites/accept", { method: "POST", token: staff.token, body: { token: t.inviteToken(inv.j.link_path) } });
  assert.equal(acc.status, 200);
  assert.deepEqual([acc.j.role, acc.j.is_owner], ["staff", false]);
  const again = await t.call(`/api/orgs/${org.id}/invites`, { method: "POST", token: owner.token, body: { role: "staff" } });
  const dup = await t.call("/api/org-invites/accept", { method: "POST", token: staff.token, body: { token: t.inviteToken(again.j.link_path) } });
  assert.equal(dup.status, 409); assert.equal(dup.j.code, "already_member");
  const sv = await t.call(`/api/orgs/${org.id}`, { token: staff.token });
  assert.equal(sv.status, 200);
  assert.equal(sv.j.role, "staff");
  assert.equal(sv.j.org.name, "Wat Pho School");
  assert.ok(!("billing" in sv.j) && !("members" in sv.j) && !("invites" in sv.j), "staff do not see billing, members or invitations: " + JSON.stringify(sv.j));
  const av = await t.call(`/api/orgs/${org.id}`, { token: owner.token });
  assert.equal(av.j.role, "admin");
  assert.deepEqual(av.j.members.map(m => [m.display_name, m.role, m.is_owner]).sort(), [["Anan", "admin", true], ["Boon", "staff", false]]);
  assert.ok(Array.isArray(av.j.invites));
  for (const [path, method, body] of [[`/api/orgs/${org.id}/invites`, "POST", { role: "staff" }], [`/api/orgs/${org.id}/profile`, "POST", { name: "Hacked" }], [`/api/orgs/${org.id}/audit`, "GET", undefined]]) {
    const r = await t.call(path, { method, token: staff.token, body });
    assert.equal(r.status, 403, path); assert.equal(r.j.code, "org_forbidden");
  }
  const badRole = await t.call(`/api/orgs/${org.id}/invites`, { method: "POST", token: owner.token, body: { role: "owner" } });
  assert.equal(badRole.status, 400);
  // staff may leave on their own
  const leave = await t.call(`/api/orgs/${org.id}/members/${staff.id}`, { method: "DELETE", token: staff.token });
  assert.equal(leave.status, 200, JSON.stringify(leave.j));
  assert.deepEqual((await t.call("/api/me/orgs", { token: staff.token })).j.orgs, []);
});

/* ---------------- O4 ---------------- */
test("O4: billing details are admin-only, validated, and audited by field name only", async () => {
  const t = await setup();
  const { org, owner } = await t.orgWithOwner();
  const billing = { name: "Wat Pho School Foundation", tax_id: TAX_ID, address: "1 Placeholder Road, Bangkok 10200", branch: "สำนักงานใหญ่", email: "billing@example.test" };
  const ok = await t.call(`/api/orgs/${org.id}/profile`, { method: "POST", token: owner.token, body: { billing } });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  const v = await t.call(`/api/orgs/${org.id}`, { token: owner.token });
  assert.deepEqual(v.j.billing, billing);
  for (const b of [{ tax_id: "12345" }, { email: "not-an-email" }, { name: "x".repeat(200) }, { address: "x".repeat(400) }, { colour: "red" }]) {
    const r = await t.call(`/api/orgs/${org.id}/profile`, { method: "POST", token: owner.token, body: { billing: b } });
    assert.equal(r.status, 400, JSON.stringify(b));
  }
  const rename = await t.call(`/api/orgs/${org.id}/profile`, { method: "POST", token: owner.token, body: { name: "Wat Pho School (Primary)" } });
  assert.equal(rename.status, 200);
  const au = (await t.env.DB.prepare("SELECT action, detail FROM org_audit WHERE org_id = ?1").bind(org.id).all()).results;
  const row = au.find(r => r.action === "org.billing.updated");
  assert.ok(row, JSON.stringify(au));
  assert.deepEqual(JSON.parse(row.detail).fields.sort(), ["address", "branch", "email", "name", "tax_id"]);
  const s = JSON.stringify(au);
  assert.ok(!s.includes(TAX_ID) && !s.includes("billing@example.test") && !s.includes("Placeholder Road"), "values never in the audit log");
  const adminView = await t.admin(`/orgs/${org.id}`);
  assert.equal(adminView.status, 200);
  assert.equal(adminView.j.billing.tax_id, TAX_ID, "the LENSIQ owner sees billing details (needed for quotations and receipts)");
});

/* ---------------- O5 ---------------- */
test("O5: role change and removal need a fresh confirmation; the organisation owner cannot be demoted or removed", async () => {
  const t = await setup();
  const { org, owner } = await t.orgWithOwner();
  const inv = await t.call(`/api/orgs/${org.id}/invites`, { method: "POST", token: owner.token, body: { role: "staff" } });
  const staff = await t.signIn("200", "staff@example.test", "Boon");
  await t.call("/api/org-invites/accept", { method: "POST", token: staff.token, body: { token: t.inviteToken(inv.j.link_path) } });
  const noFresh = await t.call(`/api/orgs/${org.id}/members/${staff.id}/role`, { method: "POST", token: owner.token, body: { role: "admin" } });
  assert.equal(noFresh.status, 401); assert.equal(noFresh.j.code, "reauth_required");
  await t.fresh(owner);
  const up = await t.call(`/api/orgs/${org.id}/members/${staff.id}/role`, { method: "POST", token: owner.token, body: { role: "admin" } });
  assert.equal(up.status, 200, JSON.stringify(up.j));
  const prot = await t.call(`/api/orgs/${org.id}/members/${owner.id}/role`, { method: "POST", token: owner.token, body: { role: "staff" } });
  assert.equal(prot.status, 403); assert.equal(prot.j.code, "org_owner_protected");
  await t.fresh(staff);
  const rmOwner = await t.call(`/api/orgs/${org.id}/members/${owner.id}`, { method: "DELETE", token: staff.token });
  assert.equal(rmOwner.status, 403); assert.equal(rmOwner.j.code, "org_owner_protected");
  const ownerLeaves = await t.call(`/api/orgs/${org.id}/members/${owner.id}`, { method: "DELETE", token: owner.token });
  assert.equal(ownerLeaves.status, 403); assert.equal(ownerLeaves.j.code, "org_owner_protected", "transfer ownership first");
  const rm = await t.call(`/api/orgs/${org.id}/members/${staff.id}`, { method: "DELETE", token: owner.token });
  assert.equal(rm.status, 200);
  assert.deepEqual((await t.call("/api/me/orgs", { token: staff.token })).j.orgs, []);
  const actions = (await t.env.DB.prepare("SELECT action FROM org_audit WHERE org_id = ?1").bind(org.id).all()).results.map(r => r.action);
  for (const a of ["invite.created", "member.joined", "member.role_changed", "member.removed"]) assert.ok(actions.includes(a), a);
});

/* ---------------- O6 ---------------- */
test("O6: ownership transfer: owner only, fresh confirmation, to an active admin of the same organisation", async () => {
  const t = await setup();
  const { org, owner } = await t.orgWithOwner();
  const inv = await t.call(`/api/orgs/${org.id}/invites`, { method: "POST", token: owner.token, body: { role: "admin" } });
  const adm = await t.signIn("200", "admin2@example.test", "Boon");
  await t.call("/api/org-invites/accept", { method: "POST", token: adm.token, body: { token: t.inviteToken(inv.j.link_path) } });
  const inv2 = await t.call(`/api/orgs/${org.id}/invites`, { method: "POST", token: owner.token, body: { role: "staff" } });
  const staff = await t.signIn("300", "staff@example.test", "Chai");
  await t.call("/api/org-invites/accept", { method: "POST", token: staff.token, body: { token: t.inviteToken(inv2.j.link_path) } });
  const noFresh = await t.call(`/api/orgs/${org.id}/transfer`, { method: "POST", token: owner.token, body: { user_id: adm.id } });
  assert.equal(noFresh.status, 401);
  await t.fresh(adm);
  const notOwner = await t.call(`/api/orgs/${org.id}/transfer`, { method: "POST", token: adm.token, body: { user_id: adm.id } });
  assert.equal(notOwner.status, 403); assert.equal(notOwner.j.code, "org_forbidden");
  await t.fresh(owner);
  const toStaff = await t.call(`/api/orgs/${org.id}/transfer`, { method: "POST", token: owner.token, body: { user_id: staff.id } });
  assert.equal(toStaff.status, 409); assert.equal(toStaff.j.code, "transfer_target");
  const ok = await t.call(`/api/orgs/${org.id}/transfer`, { method: "POST", token: owner.token, body: { user_id: adm.id } });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  const v = await t.call(`/api/orgs/${org.id}`, { token: owner.token });
  const byName = Object.fromEntries(v.j.members.map(m => [m.display_name, m]));
  assert.equal(byName.Boon.is_owner, true);
  assert.equal(byName.Anan.is_owner, false);
  assert.equal(byName.Anan.role, "admin", "the former owner stays an admin");
});

/* ---------------- O7 ---------------- */
test("O7: tenant isolation: an admin of one organisation can neither read nor change another (404, no existence leak)", async () => {
  const t = await setup();
  const a = await t.orgWithOwner("Org A", "100", "a@example.test");
  const b = await t.orgWithOwner("Org B", "200", "b@example.test");
  for (const [path, method, body] of [[`/api/orgs/${b.org.id}`, "GET"], [`/api/orgs/${b.org.id}/profile`, "POST", { name: "Mine" }], [`/api/orgs/${b.org.id}/invites`, "POST", { role: "staff" }],
    [`/api/orgs/${b.org.id}/audit`, "GET"], [`/api/orgs/${b.org.id}/licences`, "GET"], [`/api/orgs/${"0".repeat(32)}`, "GET"]]) {
    const r = await t.call(path, { method, token: a.owner.token, body });
    assert.equal(r.status, 404, path + " " + JSON.stringify(r.j));
  }
  assert.equal((await t.call(`/api/orgs/${b.org.id}`, { token: b.owner.token })).j.org.name, "Org B");
});

/* ---------------- O8 ---------------- */
test("O8: the per-organisation audit log is a SHA-256 hash chain; editing a row breaks it", async () => {
  const t = await setup();
  const { org, owner } = await t.orgWithOwner();
  await t.call(`/api/orgs/${org.id}/profile`, { method: "POST", token: owner.token, body: { name: "Renamed School" } });
  const au = await t.call(`/api/orgs/${org.id}/audit`, { token: owner.token });
  assert.equal(au.status, 200);
  assert.equal(au.j.chain_ok, true);
  assert.ok(au.j.entries.length >= 4);
  const { verifyOrgAudit } = await import(B + "orgs.js");
  assert.equal((await verifyOrgAudit(t.env.DB, org.id)).ok, true);
  await t.env.DB.prepare("UPDATE org_audit SET action = 'org.renamed.quietly' WHERE id = (SELECT MAX(id) FROM org_audit WHERE org_id = ?1)").bind(org.id).run();
  assert.equal((await verifyOrgAudit(t.env.DB, org.id)).ok, false);
  assert.equal((await t.call(`/api/orgs/${org.id}/audit`, { token: owner.token })).j.chain_ok, false);
});

/* ---------------- O9 ---------------- */
test("O9: no customer people data: unknown fields refused, no sync tables, e-mail-bound invitations keep an HMAC only", async () => {
  const t = await setup();
  const { org, owner } = await t.orgWithOwner();
  for (const body of [{ employees: [{ name: "Somsri", pin: "1234" }] }, { plates: ["1กข 2345"] }, { candidates: ["Seat 1"] }, { name: "x", residents: [] }]) {
    const r = await t.call(`/api/orgs/${org.id}/profile`, { method: "POST", token: owner.token, body });
    assert.equal(r.status, 400, JSON.stringify(body)); assert.equal(r.j.code, "unknown_field");
  }
  const tables = (await t.env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(r => r.name);
  for (const forbidden of ["sync_records", "sync_conflicts", "org_devices", "org_people", "org_employees", "org_plates"]) assert.ok(!tables.includes(forbidden), forbidden);
  const inv = await t.call(`/api/orgs/${org.id}/invites`, { method: "POST", token: owner.token, body: { role: "staff", email: "Bound.Person@Example.test" } });
  assert.equal(inv.status, 201, JSON.stringify(inv.j));
  assert.ok(!(await t.dump()).toLowerCase().includes("bound.person@example.test"), "the invited e-mail is not stored");
  const wrong = await t.signIn("300", "someone.else@example.test", "Dao");
  const r1 = await t.call("/api/org-invites/accept", { method: "POST", token: wrong.token, body: { token: t.inviteToken(inv.j.link_path) } });
  assert.equal(r1.status, 403); assert.equal(r1.j.code, "invite_email_mismatch");
  const right = await t.signIn("400", "bound.person@example.test", "Ek");
  const r2 = await t.call("/api/org-invites/accept", { method: "POST", token: right.token, body: { token: t.inviteToken(inv.j.link_path) } });
  assert.equal(r2.status, 200, JSON.stringify(r2.j));
});

/* ---------------- O10 ---------------- */
test("O10: licence orders: back office with re-auth, plans only for the four products without prices; status with the 14-day offline window; free tiers not enforced", async () => {
  const t = await setup();
  const { org, owner } = await t.orgWithOwner();
  const plans = await t.admin("/licence-plans");
  assert.equal(plans.status, 200);
  const ids = plans.j.plans.map(p => p.id).sort();
  assert.deepEqual(ids, ["attendance_person", "crowd_report", "exam_lab_candidate", "exam_lab_room", "gate_lane", "gate_trial"]);
  assert.deepEqual([...new Set(plans.j.plans.map(p => p.product))].sort(), ["attendance", "crowd", "exam", "gate"]);
  for (const p of plans.j.plans) assert.ok(!Object.keys(p).some(k => /price|satang|amount/.test(k)), "no price in the plan rows: " + JSON.stringify(p));
  const cols = (await t.env.DB.prepare("PRAGMA table_info(licence_plans)").all()).results.map(c => c.name);
  assert.ok(!cols.some(c => /price|satang|amount/.test(c)), "no price column: " + cols.join(","));
  const order = { plan_id: "gate_lane", quantity: 2, starts_on: "2026-12-01", ends_on: "2027-01-01", order_ref: "QT-2026-001 / transfer 2026-11-30", amount_satang: 158000, note: "2 lanes, quotation QT-2026-001" };
  const noReauth = await t.admin(`/orgs/${org.id}/licences`, { method: "POST", body: order });
  assert.equal(noReauth.status, 403); assert.equal(noReauth.j.code, "reauth_required");
  const badPlan = await t.admin(`/orgs/${org.id}/licences`, { method: "POST", body: { ...order, plan_id: "plus", password: ADMIN_PW } });
  assert.equal(badPlan.status, 400);
  const badDates = await t.admin(`/orgs/${org.id}/licences`, { method: "POST", body: { ...order, ends_on: "2026-11-01", password: ADMIN_PW } });
  assert.equal(badDates.status, 400);
  const ok = await t.admin(`/orgs/${org.id}/licences`, { method: "POST", body: { ...order, password: ADMIN_PW } });
  assert.equal(ok.status, 201, JSON.stringify(ok.j));
  const lic = await t.call(`/api/orgs/${org.id}/licences`, { token: owner.token });
  assert.equal(lic.status, 200);
  assert.equal(lic.j.enforced, false, "free-tier limits are counted, not enforced");
  assert.deepEqual(lic.j.free_tiers.gate, { trial_days: 30, lanes: 1, plates_per_day: 100 });
  assert.equal(lic.j.licences.length, 1);
  assert.ok(!("amount_satang" in lic.j.licences[0]) && !("order_ref" in lic.j.licences[0]), "order money details stay in the back office");
  assert.equal(lic.j.products.gate.quantity, 2);
  assert.equal(lic.j.products.attendance.licensed, false);
  const off = lic.j.products.gate.offline_until;
  assert.ok(off <= lic.j.checked_at + 14 * 86400 && off <= lic.j.products.gate.ends_at, "offline at most 14 days and never past the licence end");
  const cancel = await t.admin(`/orgs/${org.id}/licences/${ok.j.licence.id}`, { method: "PUT", body: { status: "cancelled", password: ADMIN_PW } });
  assert.equal(cancel.status, 200);
  assert.equal((await t.call(`/api/orgs/${org.id}/licences`, { token: owner.token })).j.products.gate.licensed, false);
  const oa = (await t.env.DB.prepare("SELECT action, detail FROM org_audit WHERE org_id = ?1").bind(org.id).all()).results;
  assert.ok(oa.some(r => r.action === "licence.added") && oa.some(r => r.action === "licence.cancelled"));
});

/* ---------------- O11 ---------------- */
test("O11: erasure of an organisation owner: account and membership gone, organisation kept and flagged as needing an owner", async () => {
  const t = await setup();
  const { org, owner } = await t.orgWithOwner();
  await t.fresh(owner);
  const del = await t.call("/api/me", { method: "DELETE", token: owner.token, body: { confirm: "DELETE" } });
  assert.equal(del.status, 200, JSON.stringify(del.j));
  assert.equal((await t.env.DB.prepare("SELECT COUNT(*) AS n FROM org_members").first()).n, 0);
  const v = await t.admin(`/orgs/${org.id}`);
  assert.equal(v.status, 200);
  assert.equal(v.j.needs_owner, true);
  assert.ok(!JSON.stringify((await t.env.DB.prepare("SELECT * FROM org_audit").all()).results).includes(owner.id), "the erased member's id is pseudonymised in the org audit");
  const { verifyOrgAudit } = await import(B + "orgs.js");
  assert.equal((await verifyOrgAudit(t.env.DB, org.id)).ok, true, "the chain still verifies after pseudonymisation");
  const re = await t.admin(`/orgs/${org.id}/owner-invite`, { method: "POST", body: { password: ADMIN_PW } });
  assert.equal(re.status, 201, JSON.stringify(re.j));
  assert.match(re.j.link_path, /#org_invite=/);
});

/* ---------------- O12 ---------------- */
test("O12: the member export lists organisations and roles", async () => {
  const t = await setup();
  const { owner } = await t.orgWithOwner();
  await t.fresh(owner);
  const e = await t.call("/api/me/export", { token: owner.token });
  assert.equal(e.status, 200);
  assert.deepEqual(e.j.organisations.map(o => [o.name, o.role, o.is_owner]), [["Wat Pho School", "admin", true]]);
});

/* ---------------- O13 ---------------- */
test("O13: a suspended organisation refuses member-side changes; the back-office status change needs re-auth", async () => {
  const t = await setup();
  const { org, owner } = await t.orgWithOwner();
  const no = await t.admin(`/orgs/${org.id}`, { method: "PUT", body: { status: "suspended" } });
  assert.equal(no.status, 403); assert.equal(no.j.code, "reauth_required");
  const s = await t.admin(`/orgs/${org.id}`, { method: "PUT", body: { status: "suspended", password: ADMIN_PW } });
  assert.equal(s.status, 200, JSON.stringify(s.j));
  const w = await t.call(`/api/orgs/${org.id}/invites`, { method: "POST", token: owner.token, body: { role: "staff" } });
  assert.equal(w.status, 403); assert.equal(w.j.code, "org_suspended");
  assert.equal((await t.call(`/api/orgs/${org.id}`, { token: owner.token })).status, 200, "reading still works (and export is always available)");
  const bad = await t.admin(`/orgs/${org.id}`, { method: "PUT", body: { status: "deleted", password: ADMIN_PW } });
  assert.equal(bad.status, 400);
});
