"use strict";
// tests/unit/backend-accounts-security.test.js — stream G, fixes for the independent security review of accounts-g @ c3de620
// (2026-11-14). Locked BEFORE the fixes. Helpers are copied from backend-line-signin.test.js (same fakes, nothing leaves
// the machine; every id, secret and e-mail is a placeholder).
//   S1 H1  linking LINE needs a fresh confirmation at start and at finish
//   S2 H1  linking Google needs a fresh confirmation
//   S3 M1  LINE re-auth needs a numeric auth_time within max_age; Google re-auth without auth_time needs a re-auth nonce
//   S4 L1  unknown fields refused on role / remove / transfer / accept
//   S5 L2  creating an org needs re-auth; accepting an owner invitation revokes the other owner links and is audited
//   S6 L3  link / reauth finish bound to the starting session
//   S7 L4  removing a sign-in method is atomic
//   S8 L6  unlinking Google clears the Google e-mail
//   S9     auth_nonces.purpose is probed
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash, createHmac, generateKeyPairSync, createSign } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const CHANNEL_ID = "1650000000";                 // placeholder, not a real LINE channel
const CHANNEL_SECRET = "c".repeat(32);           // placeholder
const REDIRECT = "https://site.example/account.html";
const GOOGLE_CLIENT = "test-client.apps.example";
const KEK = Buffer.alloc(32, 7).toString("base64");
const ADMIN_TOKEN = "bootstrap-" + "t".repeat(40);
const ADMIN_PW = "correct horse battery staple";
const LINE_SUB = "U" + "a".repeat(32);
const LINE_SUB2 = "U" + "b".repeat(32);
const LINE_VARS = { LINE_LOGIN_CHANNEL_ID: CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET: CHANNEL_SECRET, LINE_LOGIN_REDIRECT_URI: REDIRECT };

const b64u = b => Buffer.from(b).toString("base64url");
const nowS = () => Math.floor(Date.now() / 1000);
const GK = (() => { const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 }); return { kid: "g1", privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid: "g1", alg: "RS256", use: "sig" } }; })();
const EK = (() => { const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" }); return { kid: "line-es-1", privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid: "line-es-1", alg: "ES256", use: "sig" } }; })();
function googleJwt(claims) {
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid: GK.kid })), p = b64u(JSON.stringify(claims));
  return h + "." + p + "." + b64u(createSign("RSA-SHA256").update(h + "." + p).sign(GK.privateKey));
}
const googleClaims = (over = {}) => ({ iss: "https://accounts.google.com", aud: GOOGLE_CLIENT, sub: "1234567890", email: "member@example.test", email_verified: true, given_name: "Somchai", iat: nowS() - 5, exp: nowS() + 3600, nonce: "n", ...over });
/** LINE ID token: HS256 with the channel secret (web login) or ES256 with a JWKS key. */
function lineJwt(claims, { alg = "HS256", secret = CHANNEL_SECRET, key = EK } = {}) {
  if (alg === "none") return b64u(JSON.stringify({ alg: "none", typ: "JWT" })) + "." + b64u(JSON.stringify(claims)) + ".";
  const header = alg === "ES256" ? { alg, typ: "JWT", kid: key.kid } : { alg, typ: "JWT" };
  const h = b64u(JSON.stringify(header)), p = b64u(JSON.stringify(claims));
  const sig = alg === "ES256" ? createSign("SHA256").update(h + "." + p).sign({ key: key.privateKey, dsaEncoding: "ieee-p1363" }) : createHmac("sha256", secret).update(h + "." + p).digest();
  return h + "." + p + "." + b64u(sig);
}

/** Fake network: LINE token endpoint + JWKS, Google JWKS, Turnstile. Codes are issued by `authorize()` (the test plays
 *  the user consenting on access.line.me). */
function fakeNet() {
  const st = { codes: new Map(), tokenCalls: [], certFetches: 0, n: 0, tokenDown: false, tokenError: false };
  st.authorize = (authorizeUrl, o = {}) => {
    const u = new URL(authorizeUrl);
    const code = "code" + String(++st.n).padStart(8, "0");
    st.codes.set(code, { challenge: u.searchParams.get("code_challenge"), nonce: u.searchParams.get("nonce"), redirect: u.searchParams.get("redirect_uri"), o });
    return { code, state: u.searchParams.get("state") };
  };
  st.fetch = async (url, init = {}) => {
    url = String(url);
    if (url === "https://www.googleapis.com/oauth2/v3/certs") return new Response(JSON.stringify({ keys: [GK.jwk] }), { headers: { "Cache-Control": "max-age=3600" } });
    if (/turnstile\/v0\/siteverify$/.test(url)) {
      const p = new URLSearchParams(String(init.body));
      const [tok, action] = String(p.get("response")).split(":");
      return new Response(JSON.stringify({ success: tok === "good", action: action || "signin", hostname: "site.example" }));
    }
    if (url === "https://api.line.me/oauth2/v2.1/certs") { st.certFetches++; return new Response(JSON.stringify({ keys: [EK.jwk] })); }
    if (url === "https://api.line.me/oauth2/v2.1/token") {
      if (st.tokenDown) throw new TypeError("network down");
      const p = new URLSearchParams(String(init.body));
      st.tokenCalls.push(Object.fromEntries(p));
      assert.equal(String(init.method).toUpperCase(), "POST");
      const c = st.codes.get(p.get("code"));
      const bad = msg => new Response(JSON.stringify({ error: "invalid_grant", error_description: msg }), { status: 400 });
      if (st.tokenError || !c) return bad("unknown code");
      st.codes.delete(p.get("code"));
      if (p.get("grant_type") !== "authorization_code" || p.get("client_id") !== CHANNEL_ID || p.get("client_secret") !== CHANNEL_SECRET) return bad("client");
      if (p.get("redirect_uri") !== c.redirect) return bad("redirect_uri");
      const verifier = p.get("code_verifier") || "";
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || b64u(createHash("sha256").update(verifier).digest()) !== c.challenge) return bad("pkce");
      const o = c.o;
      const claims = { iss: "https://access.line.me", sub: o.sub || LINE_SUB, aud: CHANNEL_ID, exp: nowS() + 3600, iat: nowS() - 2, nonce: c.nonce, amr: ["linesso"], name: o.name || "Malee", picture: "https://profile.line-scdn.net/placeholder", ...(o.claims || {}) };
      const idToken = o.raw || lineJwt(claims, o.jwt || {});
      return new Response(JSON.stringify({ access_token: "AT-" + "x".repeat(40), token_type: "Bearer", expires_in: 2592000, refresh_token: "RT-" + "y".repeat(40), scope: "openid profile", id_token: idToken }));
    }
    throw new Error("unexpected network call in test: " + url);
  };
  return st;
}

async function setup(vars = {}) {
  const { handle } = await import(B + "index.js");
  (await import(B + "google.js")).resetJwksCache();
  const line = await import(B + "line.js");
  if (typeof line.resetLineJwksCache === "function") line.resetLineJwksCache();
  const net = fakeNet();
  const env = createEnv({ GOOGLE_CLIENT_ID: GOOGLE_CLIENT, TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: KEK, ...LINE_VARS, ...vars });
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers, ip: o.ip, origin: o.origin === undefined ? "https://site.example" : o.origin }), env, { fetch: net.fetch });
    let j = null; try { j = await r.clone().json(); } catch { /* empty */ }
    return { status: r.status, j };
  };
  const TS = { "X-Turnstile-Token": "good:signin" };
  /** start a LINE flow; returns the start response */
  const start = (body = {}, o = {}) => call("/api/auth/line/start", { method: "POST", headers: o.token ? {} : TS, token: o.token, body: { mode: "signin", accept_terms: true, consent_version: "m1", ...body } });
  /** full LINE round trip: start -> (user consents on LINE) -> finish */
  const lineSignIn = async (o = {}) => {
    const s = await start(o.body || {}, { token: o.token });
    assert.equal(s.status, 201, JSON.stringify(s.j));
    const { code, state } = net.authorize(s.j.authorize_url, o);
    return call("/api/auth/line/finish", { method: "POST", token: o.finishToken === undefined ? o.token : o.finishToken, body: { code, state, binding: o.binding || s.j.binding } });
  };
  const googleSignIn = async (over = {}) => {
    const n = await call("/api/auth/nonce", { method: "POST", body: {} });
    return call("/api/auth/google", { method: "POST", headers: TS, body: { credential: googleJwt(googleClaims({ nonce: n.j.nonce, ...over })), nonce: n.j.nonce, accept_terms: true, consent_version: "m1" } });
  };
  const freshGoogle = async (token, over = {}) => {
    const n = await call("/api/auth/nonce", { method: "POST", body: {} });
    return call("/api/auth/reauth", { method: "POST", token, body: { credential: googleJwt(googleClaims({ nonce: n.j.nonce, auth_time: nowS() - 10, ...over })), nonce: n.j.nonce } });
  };
  const dump = async () => {
    const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(r => r.name);
    let s = "";
    for (const t of tables) s += JSON.stringify((await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results);
    return s;
  };
  return { env, net, call, start, lineSignIn, googleSignIn, freshGoogle, dump, TS };
}

const ADMIN = async t => {
  await t.call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
  const tok = (await t.call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
  return (path, o = {}) => t.call("/admin/api" + path, { ...o, token: tok });
};
/** fresh Google confirmation with a nonce issued for re-authentication (no auth_time, like GIS tokens) */
const reauthGoogle = async (t, token, over = {}) => {
  const n = await t.call("/api/auth/nonce", { method: "POST", body: { purpose: "reauth" } });
  assert.equal(n.status, 201, JSON.stringify(n.j));
  return t.call("/api/auth/reauth", { method: "POST", token, body: { credential: googleJwt(googleClaims({ nonce: n.j.nonce, ...over })), nonce: n.j.nonce } });
};
/** LINE re-authentication round trip for a LINE account */
const reauthLine = async (t, token, claims = { auth_time: nowS() - 5 }) => {
  const s = await t.start({ mode: "reauth" }, { token });
  assert.equal(s.status, 201, JSON.stringify(s.j));
  const a = t.net.authorize(s.j.authorize_url, { claims });
  return t.call("/api/auth/line/finish", { method: "POST", token, body: { ...a, binding: s.j.binding } });
};
const inviteToken = link => /#org_invite=([A-Za-z0-9_-]{43})$/.exec(link)[1];

/* ---------------- S1 (H1) adding LINE needs a fresh confirmation, at start and at finish ---------------- */
test("S1 (H1): linking LINE to a Google account needs a fresh confirmation at start and at finish", async () => {
  const t = await setup();
  const g = await t.googleSignIn();
  const noFresh = await t.start({ mode: "link" }, { token: g.j.token });
  assert.equal(noFresh.status, 401); assert.equal(noFresh.j.code, "reauth_required", "a stolen bearer token alone cannot add a sign-in method");
  assert.equal((await t.freshGoogle(g.j.token)).status, 200);
  const s = await t.start({ mode: "link" }, { token: g.j.token });
  assert.equal(s.status, 201, JSON.stringify(s.j));
  const a = t.net.authorize(s.j.authorize_url, { sub: LINE_SUB2 });
  // the 5-minute window closed while the person was on LINE: the finish is refused too
  await t.env.DB.prepare("UPDATE member_sessions SET reauth_at = ?1").bind(nowS() - 3600).run();
  const late = await t.call("/api/auth/line/finish", { method: "POST", token: g.j.token, body: { ...a, binding: s.j.binding } });
  assert.equal(late.status, 401); assert.equal(late.j.code, "reauth_required");
  assert.equal((await t.env.DB.prepare("SELECT COUNT(*) AS n FROM user_identities").first()).n, 0, "nothing linked");
  assert.equal((await t.freshGoogle(g.j.token)).status, 200);
  const ok = await t.lineSignIn({ token: g.j.token, body: { mode: "link" }, sub: LINE_SUB2 });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
});

/* ---------------- S2 (H1) adding Google needs a fresh confirmation ---------------- */
test("S2 (H1): linking Google to a LINE-only account needs a fresh LINE confirmation first", async () => {
  const t = await setup();
  const l = await t.lineSignIn();
  const link = async () => {
    const n = await t.call("/api/auth/nonce", { method: "POST", body: {} });
    return t.call("/api/auth/link/google", { method: "POST", token: l.j.token, body: { credential: googleJwt(googleClaims({ sub: "777", nonce: n.j.nonce })), nonce: n.j.nonce } });
  };
  const no = await link();
  assert.equal(no.status, 401); assert.equal(no.j.code, "reauth_required", "an attacker's own Google ID token plus the bearer is not enough");
  assert.equal((await t.env.DB.prepare("SELECT google_sub FROM users").first()).google_sub.startsWith("nogoogle:"), true);
  assert.equal((await reauthLine(t, l.j.token)).status, 200);
  const ok = await link();
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
});

/* ---------------- S3 (M1) re-authentication freshness ---------------- */
test("S3 (M1): LINE re-auth needs a numeric auth_time within max_age; Google re-auth without auth_time needs a re-auth nonce", async () => {
  const t = await setup();
  const l = await t.lineSignIn();
  const noAt = await reauthLine(t, l.j.token, {});
  assert.equal(noAt.status, 401); assert.equal(noAt.j.code, "reauth_stale", "an SSO token without auth_time (max_age stripped) is refused");
  const strAt = await reauthLine(t, l.j.token, { auth_time: String(nowS()) });
  assert.equal(strAt.status, 401); assert.equal(strAt.j.code, "reauth_stale");
  assert.equal((await reauthLine(t, l.j.token)).status, 200);
  const g = await t.googleSignIn();
  // a nonce issued for sign-in, token without auth_time: refused
  const n = await t.call("/api/auth/nonce", { method: "POST", body: {} });
  const signInNonce = await t.call("/api/auth/reauth", { method: "POST", token: g.j.token, body: { credential: googleJwt(googleClaims({ nonce: n.j.nonce })), nonce: n.j.nonce } });
  assert.equal(signInNonce.status, 401); assert.equal(signInNonce.j.code, "reauth_stale");
  const ok = await reauthGoogle(t, g.j.token);
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  const stale = await reauthGoogle(t, g.j.token, { auth_time: nowS() - 900 });
  assert.equal(stale.status, 401); assert.equal(stale.j.code, "reauth_stale", "auth_time, when Google sends it, is always enforced");
  // a re-auth nonce cannot be used to sign in
  const rn = await t.call("/api/auth/nonce", { method: "POST", body: { purpose: "reauth" } });
  const si = await t.call("/api/auth/google", { method: "POST", headers: t.TS, body: { credential: googleJwt(googleClaims({ nonce: rn.j.nonce })), nonce: rn.j.nonce, accept_terms: true, consent_version: "m1" } });
  assert.equal(si.status, 401); assert.equal(si.j.code, "nonce");
  const bad = await t.call("/api/auth/nonce", { method: "POST", body: { purpose: "admin" } });
  assert.equal(bad.status, 400);
});

/* ---------------- S4 (L1) unknown fields on organisation member routes ---------------- */
test("S4 (L1): role change, removal, transfer and invitation acceptance refuse unknown fields", async () => {
  const t = await setup();
  const admin = await ADMIN(t);
  const c = await admin("/orgs", { method: "POST", body: { name: "Org S4", password: ADMIN_PW } });
  assert.equal(c.status, 201, JSON.stringify(c.j));
  const g = await t.googleSignIn();
  const acc0 = await t.call("/api/org-invites/accept", { method: "POST", token: g.j.token, body: { token: inviteToken(c.j.owner_invite.link_path), employees: [] } });
  assert.equal(acc0.status, 400); assert.equal(acc0.j.code, "unknown_field");
  assert.equal((await t.call("/api/org-invites/accept", { method: "POST", token: g.j.token, body: { token: inviteToken(c.j.owner_invite.link_path) } })).status, 200);
  const id = c.j.org.id;
  const inv = await t.call(`/api/orgs/${id}/invites`, { method: "POST", token: g.j.token, body: { role: "admin" } });
  const other = await t.googleSignIn({ sub: "555", email: "other@example.test" });
  await t.call("/api/org-invites/accept", { method: "POST", token: other.j.token, body: { token: inviteToken(inv.j.link_path) } });
  assert.equal((await reauthGoogle(t, g.j.token)).status, 200);
  for (const [path, method, body] of [[`/api/orgs/${id}/members/${other.j.user.id}/role`, "POST", { role: "staff", plates: ["1กข 2345"] }],
    [`/api/orgs/${id}/members/${other.j.user.id}`, "DELETE", { employees: [] }], [`/api/orgs/${id}/transfer`, "POST", { user_id: other.j.user.id, residents: [] }]]) {
    const r = await t.call(path, { method, token: g.j.token, body });
    assert.equal(r.status, 400, path); assert.equal(r.j.code, "unknown_field", path);
  }
});

/* ---------------- S5 (L2) owner invitations ---------------- */
test("S5 (L2): creating an org (owner link) needs re-auth; accepting an owner invitation revokes the other open owner links and is audited", async () => {
  const t = await setup();
  const admin = await ADMIN(t);
  const no = await admin("/orgs", { method: "POST", body: { name: "Org S5" } });
  assert.equal(no.status, 403); assert.equal(no.j.code, "reauth_required");
  const c = await admin("/orgs", { method: "POST", body: { name: "Org S5", password: ADMIN_PW } });
  assert.equal(c.status, 201);
  const id = c.j.org.id;
  const second = await admin(`/orgs/${id}/owner-invite`, { method: "POST", body: { password: ADMIN_PW } });
  assert.equal(second.status, 201);
  const a = await t.googleSignIn();
  assert.equal((await t.call("/api/org-invites/accept", { method: "POST", token: a.j.token, body: { token: inviteToken(c.j.owner_invite.link_path) } })).status, 200);
  const b = await t.googleSignIn({ sub: "666", email: "b@example.test" });
  const late = await t.call("/api/org-invites/accept", { method: "POST", token: b.j.token, body: { token: inviteToken(second.j.link_path) } });
  assert.equal(late.status, 410, "the other open owner link was revoked when the first was accepted");
  // an owner handover by the LENSIQ owner: the replaced owner is audited, not silently cleared
  const third = await admin(`/orgs/${id}/owner-invite`, { method: "POST", body: { password: ADMIN_PW } });
  assert.equal((await t.call("/api/org-invites/accept", { method: "POST", token: b.j.token, body: { token: inviteToken(third.j.link_path) } })).status, 200);
  const acts = (await t.env.DB.prepare("SELECT action FROM org_audit WHERE org_id = ?1").bind(id).all()).results.map(r => r.action);
  assert.ok(acts.includes("org.owner_replaced"), acts.join(","));
  assert.ok(acts.includes("invite.revoked"), acts.join(","));
  const owners = await t.env.DB.prepare("SELECT COUNT(*) AS n FROM org_members WHERE org_id = ?1 AND is_owner = 1").bind(id).first();
  assert.equal(owners.n, 1);
});

/* ---------------- S6 (L3) finish bound to the starting session ---------------- */
test("S6 (L3): a link / reauth flow must be finished by the same session that started it", async () => {
  const t = await setup();
  const g = await t.googleSignIn();
  const g2 = await t.googleSignIn(); // second session of the same account
  assert.equal((await t.freshGoogle(g.j.token)).status, 200);
  assert.equal((await t.freshGoogle(g2.j.token)).status, 200);
  const s = await t.start({ mode: "link" }, { token: g.j.token });
  const a = t.net.authorize(s.j.authorize_url, { sub: LINE_SUB2 });
  const r = await t.call("/api/auth/line/finish", { method: "POST", token: g2.j.token, body: { ...a, binding: s.j.binding } });
  assert.equal(r.status, 403); assert.equal(r.j.code, "line_wrong_session");
});

/* ---------------- S7 (L4) removing a sign-in method is atomic ---------------- */
test("S7 (L4): removing a sign-in method is one conditional write; two removals at once leave one method", async () => {
  const t = await setup();
  const g = await t.googleSignIn();
  assert.equal((await t.freshGoogle(g.j.token)).status, 200);
  assert.equal((await t.lineSignIn({ token: g.j.token, body: { mode: "link" } })).status, 200);
  const [x, y] = await Promise.all([
    t.call("/api/me/identities/unlink", { method: "POST", token: g.j.token, body: { provider: "google" } }),
    t.call("/api/me/identities/unlink", { method: "POST", token: g.j.token, body: { provider: "line" } })
  ]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409], JSON.stringify([x.j, y.j]));
  const u = await t.env.DB.prepare("SELECT google_sub FROM users").first();
  const lines = (await t.env.DB.prepare("SELECT COUNT(*) AS n FROM user_identities").first()).n;
  assert.equal((u.google_sub.startsWith("nogoogle:") ? 0 : 1) + lines, 1, "exactly one sign-in method left");
  // the state changed behind the check: the conditional write still refuses
  await t.env.DB.prepare("DELETE FROM user_identities").run();
  await t.env.DB.prepare("UPDATE users SET google_sub = '1234567890'").run();
  const last = await t.call("/api/me/identities/unlink", { method: "POST", token: g.j.token, body: { provider: "google" } });
  assert.equal(last.status, 409); assert.equal(last.j.code, "last_sign_in_method");
});

/* ---------------- S8 (L6) unlinking Google clears the Google e-mail ---------------- */
test("S8 (L6): unlinking Google removes the Google account id and the e-mail that came from it", async () => {
  const t = await setup();
  const g = await t.googleSignIn();
  assert.equal((await t.freshGoogle(g.j.token)).status, 200);
  assert.equal((await t.lineSignIn({ token: g.j.token, body: { mode: "link" } })).status, 200);
  const r = await t.call("/api/me/identities/unlink", { method: "POST", token: g.j.token, body: { provider: "google" } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  const u = await t.env.DB.prepare("SELECT google_sub, email FROM users").first();
  assert.ok(u.google_sub.startsWith("nogoogle:"));
  assert.equal(u.email, "", "the Google e-mail is not kept after unlinking");
});

/* ---------------- S9 migration column ---------------- */
test("S9: auth_nonces carries a purpose column (probed by /health/deep)", async () => {
  const src = readFileSync(join(ROOT, "backend", "src", "health.js"), "utf8");
  assert.match(src, /"SELECT [^"]*purpose[^"]*FROM auth_nonces/);
});
