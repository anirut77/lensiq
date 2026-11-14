"use strict";
// tests/unit/backend-org-p1.test.js — organisation accounts phase 1 (owner approval 2026-11-13 "Org accounts lite";
// order 2026-11-14: P1 behind two off switches, nothing visible until the owner approves). Fixed acceptance tests,
// LOCKED (~/LENSIQ-field/evals/org-p1/, evals-locks/org-p1.sha256) BEFORE the P1 code was written.
// Design: docs/ORG-ACCOUNTS-DESIGN.md (lite note + §3 permission matrix + §7 export); migration 0018_accounts.sql.
// Local only: in-memory D1 (backend-d1-shim.js), fake Google JWKS + Turnstile. Every name, e-mail and tax id is a placeholder.
//
//   F1  both switches ship OFF: wrangler.toml ORG_ACCOUNTS = "off" ([vars] and [env.test.vars]); lensiq-config.js
//       LENSIQ_ORG_ACCOUNTS is false unless set to exactly true
//   F2  Worker switch off (unset, "off", or anything but "on"): every member-side organisation route answers 404
//       org_accounts_off, signed in or not, without one SQL statement on an organisation table
//   F3  Worker switch off: every back-office organisation route answers 404 org_accounts_off, before the admin session
//       is even looked at (no SQL at all)
//   F4  /v1/config reports org_accounts false / true with the switch; switching on needs no other change
//   R1  staff cannot do any admin action (profile, invite, revoke, role, remove someone, transfer, audit, export) and
//       never see billing, members or invitations
//   R2  an admin who is not the organisation owner cannot transfer ownership or change / remove the owner
//   X1  no cross-organisation access: an admin of A gets the same 404 on every route of B as for an unknown id, and B's
//       rows do not change; A's routes cannot reach B's members or invitations
//   I1  invitation tokens are single-use (also under two simultaneous accepts), expire at 72 h (boundary included),
//       revoked links fail, a closed organisation's links fail; the token itself is never stored
//   I2  an e-mail-bound invitation refuses another e-mail and stays usable for the right one
//   E1  export (admin + fresh confirmation): format lensiq-org-export v1, exact allowlisted fields, audit chain
//       re-verifiable offline from the file alone, the export itself is logged
//   E2  export is ALWAYS available (owner decision 2026-11-13 "export always"): suspended, closed, no licence, expired
//       and cancelled licences
//   E3  export refuses staff (403), non-members and other organisations (404), unknown body fields (400)
//   D1  minimal personal data: the organisation tables have exactly the 0018 columns; no table for the customer's people
//       data; the database never holds an invitation token, a bound e-mail address or billing values in the audit log;
//       the export never carries token hashes, e-mail HMACs, provider ids, order amounts or user ids
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

/** every member-side organisation route (P1 adds GET|POST /api/orgs/:id/export) */
const memberRoutes = (id, uid, iid) => [
  ["GET", "/api/me/orgs"], ["GET", `/api/orgs/${id}`], ["POST", `/api/orgs/${id}/profile`, { name: "Renamed Org" }],
  ["POST", `/api/orgs/${id}/invites`, { role: "staff" }], ["DELETE", `/api/orgs/${id}/invites/${iid}`],
  ["POST", `/api/orgs/${id}/members/${uid}/role`, { role: "admin" }], ["DELETE", `/api/orgs/${id}/members/${uid}`],
  ["POST", `/api/orgs/${id}/transfer`, { user_id: uid }], ["GET", `/api/orgs/${id}/audit`], ["GET", `/api/orgs/${id}/licences`],
  ["GET", `/api/orgs/${id}/export`], ["POST", `/api/orgs/${id}/export`, {}], ["POST", "/api/org-invites/accept", { token: "k".repeat(43) }]
];
const adminRoutes = id => [
  ["GET", "/orgs"], ["POST", "/orgs", { name: "Off Org", password: ADMIN_PW }], ["GET", "/licence-plans"], ["GET", `/orgs/${id}`],
  ["PUT", `/orgs/${id}`, { name: "Renamed" }], ["POST", `/orgs/${id}/owner-invite`, { password: ADMIN_PW }], ["GET", `/orgs/${id}/audit`],
  ["POST", `/orgs/${id}/licences`, { plan_id: "gate_lane", quantity: 1, starts_on: "2026-12-01", ends_on: "2027-01-01", password: ADMIN_PW }],
  ["PUT", `/orgs/${id}/licences/${ID0}`, { status: "cancelled", password: ADMIN_PW }]
];
const ORG_SQL = /\b(orgs|org_members|org_invites|org_audit|org_licences|licence_plans)\b/;

/* ---------------- F1 ---------------- */
test("F1: both switches ship off — wrangler.toml ORG_ACCOUNTS = \"off\" in [vars] and [env.test.vars]; LENSIQ_ORG_ACCOUNTS false unless exactly true", () => {
  const toml = fs.readFileSync(path.join(ROOT, "backend", "wrangler.toml"), "utf8");
  const top = toml.slice(toml.indexOf("[vars]"), toml.indexOf("[[d1_databases]]"));
  const tv = toml.slice(toml.indexOf("[env.test.vars]"));
  for (const [where, sec] of [["[vars]", top], ["[env.test.vars]", tv]]) {
    const m = sec.match(/^ORG_ACCOUNTS\s*=\s*"([^"]*)"\s*$/m);
    assert.ok(m, where + " declares ORG_ACCOUNTS");
    assert.equal(m[1], "off", where + " ships the organisation switch off");
  }
  const src = fs.readFileSync(path.join(ROOT, "lensiq-config.js"), "utf8");
  const run = pre => { const w = { window: {} }; if (pre !== undefined) w.window.LENSIQ_ORG_ACCOUNTS = pre; w.window.window = w.window; vm.runInNewContext(src, { ...w, document: undefined, location: { pathname: "/account.html" } }); return w.window.LENSIQ_ORG_ACCOUNTS; };
  assert.equal(run(undefined), false, "default off");
  for (const v of ["true", 1, "on", {}, "yes"]) assert.equal(run(v), false, "only the boolean true switches it on: " + JSON.stringify(v));
  assert.equal(run(true), true);
});

/* ---------------- F2 ---------------- */
for (const flag of [undefined, "off", "true", "1", "yes", "ON-ish"]) {
  test(`F2: Worker switch ${JSON.stringify(flag)}: every member-side organisation route answers 404 org_accounts_off, no organisation SQL`, async () => {
    const t = await setup(flag === undefined ? {} : { ORG_ACCOUNTS: flag });
    const m = await t.signIn("500", "someone@example.test", "Some");
    t.rec.on = true;
    for (const tok of [null, m.token]) {
      for (const [method, p, body] of memberRoutes(ID0, m.id, ID0)) {
        const r = await t.call(p, { method, token: tok, body });
        assert.equal(r.status, 404, `${method} ${p} (${tok ? "signed in" : "signed out"}) -> ${r.status} ${JSON.stringify(r.j)}`);
        assert.equal(r.j && r.j.code, "org_accounts_off", `${method} ${p}: code`);
      }
    }
    t.rec.on = false;
    const touched = t.rec.sql.filter(s => ORG_SQL.test(s));
    assert.deepEqual(touched, [], "no SQL on an organisation table while the switch is off");
    // the rest of the account keeps working
    assert.equal((await t.call("/api/me", { token: m.token })).status, 200);
  });
}

/* ---------------- F3 ---------------- */
test("F3: Worker switch off: every back-office organisation route answers 404 org_accounts_off before the admin session (no SQL)", async () => {
  const t = await setup({});
  await t.admin("/me"); // signs the owner in (bootstrap + login) while recording is off
  for (const asAdmin of [false, true]) {
    for (const [method, p, body] of adminRoutes(ID0)) {
      t.rec.on = true; t.rec.sql.length = 0;
      const r = asAdmin ? await t.admin(p, { method, body }) : await t.call("/admin/api" + p, { method, body });
      t.rec.on = false;
      assert.equal(r.status, 404, `${method} ${p} (${asAdmin ? "owner" : "anonymous"}) -> ${r.status} ${JSON.stringify(r.j)}`);
      assert.equal(r.j && r.j.code, "org_accounts_off");
      assert.deepEqual(t.rec.sql, [], `${method} ${p}: answered without any SQL`);
    }
  }
  assert.equal((await t.admin("/me")).status, 200, "the rest of the back office keeps working");
});

/* ---------------- F4 ---------------- */
test("F4: /v1/config reports org_accounts with the switch; with ORG_ACCOUNTS=on the routes answer at once", async () => {
  const off = await setup({});
  const c0 = await off.call("/v1/config");
  assert.equal(c0.status, 200);
  assert.equal(c0.j.org_accounts, false);
  const on = await setup({ ORG_ACCOUNTS: " On " });
  const c1 = await on.call("/v1/config");
  assert.equal(c1.j.org_accounts, true, "trimmed, case-insensitive 'on'");
  const m = await on.signIn("501", "x@example.test", "X");
  const r = await on.call("/api/me/orgs", { token: m.token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.orgs, []);
  assert.equal((await on.admin("/orgs")).status, 200);
});

/* ---------------- R1 ---------------- */
test("R1: staff cannot do any admin action and never see billing, members or invitations", async () => {
  const t = await setup();
  const o = await t.org("Staff Check School", "61");
  const s = o.staff;
  await t.fresh(s); // even with a fresh confirmation
  const v = await t.call(`/api/orgs/${o.id}`, { token: s.token });
  assert.equal(v.status, 200);
  assert.equal(v.j.role, "staff");
  for (const k of ["billing", "members", "invites"]) assert.ok(!(k in v.j), "staff view has no " + k);
  const inv = await t.call(`/api/orgs/${o.id}/invites`, { method: "POST", token: o.owner.token, body: { role: "staff" } });
  const before = await t.snapshot(o.id);
  const attempts = [
    ["POST", `/api/orgs/${o.id}/profile`, { name: "Staff Rename" }], ["POST", `/api/orgs/${o.id}/profile`, { billing: { tax_id: "0105555555556" } }],
    ["POST", `/api/orgs/${o.id}/invites`, { role: "staff" }], ["POST", `/api/orgs/${o.id}/invites`, { role: "admin" }],
    ["DELETE", `/api/orgs/${o.id}/invites/${inv.j.invite_id}`], ["POST", `/api/orgs/${o.id}/members/${o.admin.id}/role`, { role: "staff" }],
    ["POST", `/api/orgs/${o.id}/members/${s.id}/role`, { role: "admin" }], ["DELETE", `/api/orgs/${o.id}/members/${o.admin.id}`],
    ["POST", `/api/orgs/${o.id}/transfer`, { user_id: s.id }], ["GET", `/api/orgs/${o.id}/audit`],
    ["GET", `/api/orgs/${o.id}/export`], ["POST", `/api/orgs/${o.id}/export`, {}]
  ];
  for (const [method, p, body] of attempts) {
    const r = await t.call(p, { method, token: s.token, body });
    assert.equal(r.status, 403, `staff ${method} ${p} -> ${r.status} ${JSON.stringify(r.j)}`);
    assert.equal(r.j.code, "org_forbidden", `${method} ${p}`);
  }
  assert.equal(await t.snapshot(o.id), before, "nothing changed (no audit line either)");
  // staff may read the licence status and leave on their own
  assert.equal((await t.call(`/api/orgs/${o.id}/licences`, { token: s.token })).status, 200);
  assert.equal((await t.call(`/api/orgs/${o.id}/members/${s.id}`, { method: "DELETE", token: s.token, body: {} })).status, 200);
  assert.equal((await t.call(`/api/orgs/${o.id}`, { token: s.token })).status, 404, "gone after leaving");
});

/* ---------------- R2 ---------------- */
test("R2: an admin who is not the owner cannot transfer ownership or change / remove the owner", async () => {
  const t = await setup();
  const o = await t.org("Owner Guard Condo", "62");
  await t.fresh(o.admin);
  const tr = await t.call(`/api/orgs/${o.id}/transfer`, { method: "POST", token: o.admin.token, body: { user_id: o.admin.id } });
  assert.equal(tr.status, 403); assert.equal(tr.j.code, "org_forbidden");
  const role = await t.call(`/api/orgs/${o.id}/members/${o.owner.id}/role`, { method: "POST", token: o.admin.token, body: { role: "staff" } });
  assert.equal(role.status, 403); assert.equal(role.j.code, "org_owner_protected");
  const rm = await t.call(`/api/orgs/${o.id}/members/${o.owner.id}`, { method: "DELETE", token: o.admin.token, body: {} });
  assert.equal(rm.status, 403); assert.equal(rm.j.code, "org_owner_protected");
  const mine = await t.call("/api/me/orgs", { token: o.owner.token });
  assert.deepEqual(mine.j.orgs.map(x => [x.role, x.is_owner]), [["admin", true]]);
});

/* ---------------- X1 ---------------- */
test("X1: an admin of A gets the same 404 on every route of B as for an unknown id; B's rows never change; A's routes cannot reach B's members or invitations", async () => {
  const t = await setup();
  const a = await t.org("Org Alpha", "71"), b = await t.org("Org Beta", "72");
  const bInv = await t.call(`/api/orgs/${b.id}/invites`, { method: "POST", token: b.owner.token, body: { role: "staff" } });
  assert.equal(bInv.status, 201);
  const before = await t.snapshot(b.id);
  for (const actor of [a.owner, a.admin, a.staff]) {
    await t.fresh(actor);
    for (const [method, p, body] of memberRoutes(b.id, b.staff.id, bInv.j.invite_id)) {
      if (p === "/api/me/orgs" || p === "/api/org-invites/accept") continue;
      const r = await t.call(p, { method, token: actor.token, body });
      const unknown = await t.call(p.replace(b.id, "f".repeat(32)), { method, token: actor.token, body });
      assert.equal(r.status, 404, `${method} ${p} -> ${r.status} ${JSON.stringify(r.j)}`);
      assert.deepEqual(r.j, unknown.j, `${method} ${p}: same answer as an unknown organisation (no existence leak)`);
    }
    // A's own routes, B's ids
    const viaA = [
      ["POST", `/api/orgs/${a.id}/members/${b.staff.id}/role`, { role: "admin" }], ["DELETE", `/api/orgs/${a.id}/members/${b.staff.id}`, {}],
      ["DELETE", `/api/orgs/${a.id}/invites/${bInv.j.invite_id}`], ["POST", `/api/orgs/${a.id}/transfer`, { user_id: b.admin.id }]
    ];
    for (const [method, p, body] of viaA) {
      const r = await t.call(p, { method, token: actor.token, body });
      assert.ok(r.status === 404 || r.status === 403 || r.status === 409, `${method} ${p} -> ${r.status}`);
    }
  }
  assert.equal(await t.snapshot(b.id), before, "organisation B unchanged");
  const listed = await t.call("/api/me/orgs", { token: a.owner.token });
  assert.deepEqual(listed.j.orgs.map(x => x.id), [a.id], "my organisations lists only A");
  // an export of A never contains anything of B
  await t.fresh(a.owner);
  const ex = await t.call(`/api/orgs/${a.id}/export`, { method: "POST", token: a.owner.token, body: {} });
  assert.equal(ex.status, 200, JSON.stringify(ex.j));
  const s = JSON.stringify(ex.j);
  for (const x of [b.id, "Org Beta", b.owner.email, b.admin.email, b.staff.email, bInv.j.invite_id]) assert.ok(!s.includes(x), "A's export leaks " + x);
});

/* ---------------- I1 ---------------- */
test("I1: invitations are single-use (also two at once), expire at 72 h with the boundary included, revoked / closed fail; the token is never stored", async () => {
  const t = await setup();
  const o = await t.org("Invite Rules School", "81", { withAdmin: false, withStaff: false });
  const mk = async () => {
    const r = await t.call(`/api/orgs/${o.id}/invites`, { method: "POST", token: o.owner.token, body: { role: "staff" } });
    assert.equal(r.status, 201, JSON.stringify(r.j));
    assert.ok(r.j.expires_at - nowS() <= 72 * 3600 + 2 && r.j.expires_at - nowS() >= 72 * 3600 - 5, "72 h");
    return r.j;
  };
  const u1 = await t.signIn("8101", "u1@example.test", "U1"), u2 = await t.signIn("8102", "u2@example.test", "U2"), u3 = await t.signIn("8103", "u3@example.test", "U3");
  // single use
  const i1 = await mk(), k1 = t.inviteToken(i1.link_path);
  assert.ok(!(await t.dump()).includes(k1), "only the hash of the token is stored");
  assert.equal((await t.accept(u1, k1)).status, 200);
  const again = await t.accept(u2, k1);
  assert.equal(again.status, 410); assert.equal(again.j.code, "invite_invalid");
  const same = await t.accept(u1, k1);
  assert.equal(same.status, 410, "a used link also fails for the person who used it");
  // two simultaneous accepts: exactly one wins
  const i2 = await mk(), k2 = t.inviteToken(i2.link_path);
  const both = await Promise.all([t.accept(u2, k2), t.accept(u3, k2)]);
  assert.deepEqual(both.map(r => r.status).sort(), [200, 410], "one accept wins: " + JSON.stringify(both.map(r => r.j)));
  const members = (await t.env.DB.prepare("SELECT COUNT(*) AS n FROM org_members WHERE org_id = ?1").bind(o.id).first()).n;
  assert.equal(members, 3, "owner + u1 + one of u2/u3");
  // expiry: past, and exactly now (boundary included)
  const u4 = await t.signIn("8104", "u4@example.test", "U4");
  for (const delta of [-3600, 0]) {
    const i = await mk();
    await t.env.DB.prepare("UPDATE org_invites SET expires_at = ?1 WHERE id = ?2").bind(nowS() + delta, i.invite_id).run();
    const r = await t.accept(u4, t.inviteToken(i.link_path));
    assert.equal(r.status, 410, "expired (delta " + delta + ")"); assert.equal(r.j.code, "invite_invalid");
  }
  // revoked
  const i3 = await mk();
  assert.equal((await t.call(`/api/orgs/${o.id}/invites/${i3.invite_id}`, { method: "DELETE", token: o.owner.token })).status, 200);
  assert.equal((await t.accept(u4, t.inviteToken(i3.link_path))).status, 410);
  // a revoked / used link cannot be revoked again (no double audit)
  assert.equal((await t.call(`/api/orgs/${o.id}/invites/${i3.invite_id}`, { method: "DELETE", token: o.owner.token })).status, 404);
  // malformed token
  assert.equal((await t.call("/api/org-invites/accept", { method: "POST", token: u4.token, body: { token: "short" } })).status, 400);
  // closed organisation
  const i4 = await mk();
  assert.equal((await t.admin(`/orgs/${o.id}`, { method: "PUT", body: { status: "closed", password: ADMIN_PW } })).status, 200);
  assert.equal((await t.accept(u4, t.inviteToken(i4.link_path))).status, 410);
  assert.equal((await t.env.DB.prepare("SELECT COUNT(*) AS n FROM org_members WHERE user_id = ?1").bind(u4.id).first()).n, 0, "u4 never joined");
});

/* ---------------- I2 ---------------- */
test("I2: an e-mail-bound invitation refuses another e-mail and stays usable for the right one; the address is stored as an HMAC only", async () => {
  const t = await setup();
  const o = await t.org("Bound Invite Co", "82", { withAdmin: false, withStaff: false });
  const target = "Invited.Person@Example.test";
  const r = await t.call(`/api/orgs/${o.id}/invites`, { method: "POST", token: o.owner.token, body: { role: "admin", email: target } });
  assert.equal(r.status, 201, JSON.stringify(r.j));
  const db = await t.dump();
  assert.ok(!db.toLowerCase().includes(target.toLowerCase()), "the invited address is not stored");
  const wrong = await t.signIn("8201", "someone.else@example.test", "Else");
  const w = await t.accept(wrong, t.inviteToken(r.j.link_path));
  assert.equal(w.status, 403); assert.equal(w.j.code, "invite_email_mismatch");
  const right = await t.signIn("8202", "invited.person@example.test", "Right");
  const ok = await t.accept(right, t.inviteToken(r.j.link_path));
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  assert.equal(ok.j.role, "admin");
});

/* ---------------- E1 ---------------- */
const EXPORT_KEYS = ["format", "v", "exported_at", "org", "billing", "members", "invites", "licences", "audit", "readme"];
const MEMBER_KEYS = ["display_name", "email", "role", "is_owner", "status", "joined_at"];
const INVITE_KEYS = ["role", "owner_invite", "email_bound", "created_at", "expires_at"];
const LICENCE_KEYS = ["plan_id", "product", "unit", "quantity", "starts_at", "ends_at", "status"];
const AUDIT_KEYS = ["id", "org_id", "ts", "actor_kind", "actor_ref", "action", "ref", "detail", "prev_hash", "hash"];
const material = (prev, r) => prev + "|" + JSON.stringify([r.org_id, r.ts, r.actor_kind, r.actor_ref ?? null, r.action, r.ref ?? null, r.detail ?? null]);

test("E1: export (admin + fresh confirmation): lensiq-org-export v1 with exactly the allowlisted fields; the audit chain verifies offline; the export is logged", async () => {
  const t = await setup();
  const o = await t.org("Export School", "91");
  await t.call(`/api/orgs/${o.id}/invites`, { method: "POST", token: o.owner.token, body: { role: "staff", email: "pending@example.test" } });
  await t.admin(`/orgs/${o.id}/licences`, { method: "POST", body: { plan_id: "exam_lab_room", quantity: 2, starts_on: "2026-11-01", ends_on: "2027-11-01", order_ref: "QT-0001", amount_satang: 1234500, note: "placeholder", password: ADMIN_PW } });
  // no fresh confirmation -> refused
  const no = await t.call(`/api/orgs/${o.id}/export`, { token: o.admin.token });
  assert.equal(no.status, 401); assert.equal(no.j.code, "reauth_required");
  for (const who of [o.owner, o.admin]) {
    await t.fresh(who);
    for (const method of ["GET", "POST"]) {
      const r = await t.call(`/api/orgs/${o.id}/export`, { method, token: who.token, body: method === "POST" ? {} : undefined });
      assert.equal(r.status, 200, JSON.stringify(r.j));
      assert.match(String(r.headers.get("Content-Disposition")), new RegExp(`^attachment; filename="lensiq-org-${o.id}\\.json"$`));
      const x = r.j;
      assert.deepEqual(Object.keys(x).sort(), [...EXPORT_KEYS].sort());
      assert.equal(x.format, "lensiq-org-export"); assert.equal(x.v, 1);
      assert.ok(Math.abs(x.exported_at - nowS()) < 30);
      assert.deepEqual(x.org, { id: o.id, name: "Export School", status: "active" });
      assert.deepEqual(x.billing, { name: "Export School Co., Ltd.", tax_id: TAX_ID, address: ADDR, branch: null, email: BILL_EMAIL });
      assert.equal(x.members.length, 3);
      for (const m of x.members) assert.deepEqual(Object.keys(m).sort(), [...MEMBER_KEYS].sort());
      assert.deepEqual(x.members.map(m => [m.role, m.is_owner]).sort(), [["admin", false], ["admin", true], ["staff", false]].sort());
      assert.equal(x.invites.length, 1);
      assert.deepEqual(Object.keys(x.invites[0]).sort(), [...INVITE_KEYS].sort());
      assert.equal(x.invites[0].email_bound, true);
      assert.equal(x.licences.length, 1);
      assert.deepEqual(Object.keys(x.licences[0]).sort(), [...LICENCE_KEYS].sort());
      assert.equal(x.licences[0].quantity, 2);
      for (const l of ["th", "en", "zh"]) assert.ok(typeof x.readme[l] === "string" && x.readme[l].length > 40, "readme " + l);
      assert.match(x.readme.th, /[ก-๛]/); assert.match(x.readme.zh, /[一-鿿]/);
      // offline chain check from the file alone
      assert.equal(x.audit.chain_ok, true);
      let prev = "0".repeat(64);
      for (const e of x.audit.entries) {
        assert.deepEqual(Object.keys(e).sort(), [...AUDIT_KEYS].sort());
        assert.equal(e.prev_hash, prev, "entry " + e.id + " links to the previous one");
        assert.equal(e.hash, sha(material(prev, e)), "entry " + e.id + " hash recomputes");
        prev = e.hash;
      }
      const all = (await t.env.DB.prepare("SELECT COUNT(*) AS n FROM org_audit WHERE org_id = ?1").bind(o.id).first()).n;
      assert.equal(x.audit.entries.length, all - 1, "every entry up to (not including) this export's own log line");
    }
  }
  const logged = (await t.env.DB.prepare("SELECT action, actor_kind, detail FROM org_audit WHERE org_id = ?1 AND action = 'org.exported'").bind(o.id).all()).results;
  assert.equal(logged.length, 4, "each export is in the organisation's audit log");
  assert.ok(logged.every(r => r.actor_kind === "user"));
  const au = await t.call(`/api/orgs/${o.id}/audit`, { token: o.owner.token });
  assert.equal(au.j.chain_ok, true, "chain still intact after the export lines");
});

/* ---------------- E2 ---------------- */
test("E2: export is always available — suspended, closed, no licence, expired and cancelled licences", async () => {
  const t = await setup();
  const o = await t.org("Always Export Village", "92", { withStaff: false });
  const exp = async who => { await t.fresh(who); return t.call(`/api/orgs/${o.id}/export`, { token: who.token }); };
  assert.equal((await exp(o.owner)).status, 200, "no licence at all");
  const l = await t.admin(`/orgs/${o.id}/licences`, { method: "POST", body: { plan_id: "gate_lane", quantity: 1, starts_on: "2025-01-01", ends_on: "2025-02-01", password: ADMIN_PW } });
  assert.equal(l.status, 201, JSON.stringify(l.j));
  assert.equal((await exp(o.admin)).status, 200, "licence expired");
  const l2 = await t.admin(`/orgs/${o.id}/licences`, { method: "POST", body: { plan_id: "gate_lane", quantity: 1, starts_on: "2026-01-01", ends_on: "2027-12-01", password: ADMIN_PW } });
  assert.equal((await t.admin(`/orgs/${o.id}/licences/${l2.j.licence.id}`, { method: "PUT", body: { status: "cancelled", password: ADMIN_PW } })).status, 200);
  assert.equal((await exp(o.owner)).status, 200, "licence cancelled");
  assert.equal((await t.admin(`/orgs/${o.id}`, { method: "PUT", body: { status: "suspended", password: ADMIN_PW } })).status, 200);
  const s = await exp(o.admin);
  assert.equal(s.status, 200, "suspended: " + JSON.stringify(s.j));
  assert.equal(s.j.org.status, "suspended");
  assert.equal((await t.call(`/api/orgs/${o.id}/profile`, { method: "POST", token: o.admin.token, body: { name: "Changed While Suspended" } })).j.code, "org_suspended", "changes stay refused");
  assert.equal((await t.admin(`/orgs/${o.id}`, { method: "PUT", body: { status: "closed", password: ADMIN_PW } })).status, 200);
  const c = await exp(o.owner);
  assert.equal(c.status, 200, "closed: " + JSON.stringify(c.j));
  assert.equal(c.j.org.status, "closed");
  // a closed organisation is still hidden everywhere else
  assert.equal((await t.call(`/api/orgs/${o.id}`, { token: o.owner.token })).status, 404);
  // amendment A-P1b-1 (review L1, coordinator 2026-11-14): listed for its admins as export-only (was: not listed), so the
  // export of a closed organisation is reachable from the page; see backend-org-p1b.test.js B1
  assert.deepEqual((await t.call("/api/me/orgs", { token: o.owner.token })).j.orgs.map(x => [x.status, x.export_only]), [["closed", true]]);
});

/* ---------------- E3 ---------------- */
test("E3: export refuses staff (403), a removed member and outsiders (404) and unknown body fields (400)", async () => {
  const t = await setup();
  const o = await t.org("Export Guard Ltd", "93");
  const outsider = await t.signIn("9309", "outsider@example.test", "Out");
  await t.fresh(o.staff); await t.fresh(outsider); await t.fresh(o.owner);
  const st = await t.call(`/api/orgs/${o.id}/export`, { token: o.staff.token });
  assert.equal(st.status, 403); assert.equal(st.j.code, "org_forbidden");
  const out = await t.call(`/api/orgs/${o.id}/export`, { token: outsider.token });
  assert.equal(out.status, 404); assert.equal(out.j.code, "org_not_found");
  const bad = await t.call(`/api/orgs/${o.id}/export`, { method: "POST", token: o.owner.token, body: { employees: true } });
  assert.equal(bad.status, 400); assert.equal(bad.j.code, "unknown_field");
  await t.fresh(o.admin);
  assert.equal((await t.call(`/api/orgs/${o.id}/members/${o.admin.id}`, { method: "DELETE", token: o.owner.token, body: {} })).status, 200);
  const gone = await t.call(`/api/orgs/${o.id}/export`, { token: o.admin.token });
  assert.equal(gone.status, 404, "a removed admin cannot export");
});

/* ---------------- D1 ---------------- */
test("D1: minimal personal data — exact 0018 columns, no people-data tables, no tokens / bound e-mails / billing values stored where they should not be, no secrets in the export", async () => {
  const t = await setup();
  const cols = async tb => (await t.env.DB.prepare(`PRAGMA table_info(${tb})`).all()).results.map(r => r.name).sort();
  const expected = {
    orgs: ["id", "name", "status", "billing_name", "billing_tax_id", "billing_address", "billing_branch", "billing_email", "created_at", "updated_at"],
    org_members: ["org_id", "user_id", "role", "is_owner", "status", "created_at"],
    org_invites: ["id", "org_id", "role", "owner_invite", "token_hash", "email_hmac", "created_by_ref", "created_at", "expires_at", "accepted_at", "revoked_at"],
    org_audit: ["id", "org_id", "ts", "actor_kind", "actor_ref", "action", "ref", "detail", "prev_hash", "hash"],
    org_licences: ["id", "org_id", "plan_id", "quantity", "starts_at", "ends_at", "status", "order_ref", "amount_satang", "note", "created_at", "cancelled_at"]
  };
  for (const [tb, c] of Object.entries(expected)) assert.deepEqual(await cols(tb), [...c].sort(), tb + " columns are exactly the design's");
  const tables = (await t.env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(r => r.name);
  for (const tb of tables) assert.doesNotMatch(tb, /employee|plate|resident|candidate|visitor|face|descriptor|punch|sync|org_sites|org_devices/i, "no people-data / sync table: " + tb);
  const o = await t.org("Minimal Data Co", "95");
  const bound = "bound.person@example.test";
  const inv = await t.call(`/api/orgs/${o.id}/invites`, { method: "POST", token: o.owner.token, body: { role: "staff", email: bound } });
  await t.call(`/api/orgs/${o.id}/profile`, { method: "POST", token: o.owner.token, body: { billing: { branch: "Head office", address: "1 Other Placeholder Road" } } });
  await t.admin(`/orgs/${o.id}/licences`, { method: "POST", body: { plan_id: "crowd_report", quantity: 3, starts_on: "2026-11-01", ends_on: "2026-12-01", order_ref: "TR-SECRETREF", amount_satang: 98765432101, note: "NOTE-PLACEHOLDER", password: ADMIN_PW } });
  await t.fresh(o.owner);
  const ex = await t.call(`/api/orgs/${o.id}/export`, { token: o.owner.token });
  assert.equal(ex.status, 200, JSON.stringify(ex.j));
  const db = await t.dump();
  assert.ok(!db.includes(t.inviteToken(inv.j.link_path)), "invitation token never stored");
  assert.ok(!db.includes(bound), "bound e-mail never stored");
  const audit = JSON.stringify((await t.env.DB.prepare("SELECT * FROM org_audit").all()).results);
  for (const v of [TAX_ID, ADDR, "1 Other Placeholder Road", BILL_EMAIL, "Head office", o.owner.email, o.admin.email, o.staff.email, o.owner.id, o.admin.id, o.staff.id, "TR-SECRETREF", "98765432101", "NOTE-PLACEHOLDER"]) {
    assert.ok(!audit.includes(v), "the organisation audit log holds no value / user id: " + v);
  }
  const x = JSON.stringify(ex.j);
  const hashes = (await t.env.DB.prepare("SELECT token_hash, email_hmac FROM org_invites").all()).results;
  for (const h of hashes) for (const v of [h.token_hash, h.email_hmac]) if (v) assert.ok(!x.includes(v), "export carries no token hash / e-mail HMAC");
  for (const u of [o.owner, o.admin, o.staff]) assert.ok(!x.includes(u.id), "export carries no user id");
  for (const v of ["TR-SECRETREF", "98765432101", "NOTE-PLACEHOLDER", "google_sub", "token_hash", "email_hmac", "amount_satang", "order_ref", "\"sub\""]) assert.ok(!x.includes(v), "export carries no " + v);
  for (const s of [o.owner.sub, o.admin.sub, o.staff.sub]) assert.ok(!new RegExp(`"${s}"`).test(x), "no provider account id");
});
