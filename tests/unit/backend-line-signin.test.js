"use strict";
// tests/unit/backend-line-signin.test.js — stream G (accounts groundwork, owner decision 2026-11-13: sign-in Google + LINE).
// LINE Login (OpenID Connect, scope "openid profile" only, no e-mail permission) next to the existing Google sign-in:
// Worker routes, state + nonce + PKCE (S256), the browser binding that stops login CSRF, account-linking rules, LINE
// re-authentication for erasure / export, and the "not configured" refusal while the owner has not set
// LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET. Locked BEFORE backend/src/line.js and migration 0017 were written.
// Local only: in-memory D1 (backend-d1-shim.js), a fake LINE (token endpoint + JWKS) and a fake Google JWKS — nothing
// leaves the machine. Every id, secret and e-mail below is a placeholder.
//
//   L1  config: line_enabled only with channel id + secret + an https redirect page on an allowed origin
//   L2  start (sign-in): Origin, Turnstile, authorize URL (openid profile, S256, bot_prompt=normal), only hashes stored
//   L3  first LINE sign-in creates an account without e-mail; no picture / access token stored; /api/me works
//   L4  consent: a new account needs the terms accepted at start; a returning account does not
//   L5  state is single-use, expires, and is bound to the browser that started it (login CSRF)
//   L6  ID token checks (aud, iss, exp, nonce, signature HS256 / ES256, alg none, sub); token endpoint errors
//   L7  PKCE: the verifier sent to LINE matches the challenge; the channel secret only goes to the token endpoint
//   L8  linking LINE to a signed-in Google account; never merges two accounts
//   L9  linking Google to a LINE-only account
//   L10 unlinking needs a fresh confirmation and never removes the last sign-in method
//   L11 LINE re-authentication opens the 5-minute window for export / erasure
//   L12 erasure of a LINE-only account removes the LINE link
//   L13 export lists the sign-in methods, never the provider account ids
//   L14 go-live gate also covers new LINE sign-ins
//   L15 retention purges expired LINE sign-in flows
//   L16 migration 0017 listed and probed
//   L17 a disabled account cannot sign in with LINE
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

/* ---------------- L1 config ---------------- */
test("L1: line_enabled only when channel id + secret + an https redirect page on an allowed origin are set; start refuses otherwise", async () => {
  const off = await setup({ LINE_LOGIN_CHANNEL_ID: "", LINE_LOGIN_CHANNEL_SECRET: "", LINE_LOGIN_REDIRECT_URI: "" });
  const c0 = await off.call("/v1/config");
  assert.equal(c0.status, 200);
  assert.equal(c0.j.membership.line_enabled, false);
  const s0 = await off.start();
  assert.equal(s0.status, 503); assert.equal(s0.j.code, "line_not_configured");
  for (const v of [{ LINE_LOGIN_CHANNEL_SECRET: "" }, { LINE_LOGIN_CHANNEL_ID: "" }, { LINE_LOGIN_REDIRECT_URI: "http://site.example/account.html" },
    { LINE_LOGIN_REDIRECT_URI: "https://evil.example/account.html" }, { LINE_LOGIN_CHANNEL_ID: "not-a-number" }]) {
    const t = await setup(v);
    assert.equal((await t.call("/v1/config")).j.membership.line_enabled, false, JSON.stringify(v));
    const s = await t.start();
    assert.equal(s.status, 503, JSON.stringify(v)); assert.equal(s.j.code, "line_not_configured");
  }
  const on = await setup();
  const c1 = await on.call("/v1/config");
  assert.equal(c1.j.membership.line_enabled, true);
  assert.ok(!JSON.stringify(c1.j).includes(CHANNEL_SECRET), "the channel secret is never served");
});

/* ---------------- L2 start ---------------- */
test("L2: start needs an allowed Origin and Turnstile; authorize URL asks openid profile only with S256 PKCE; only hashes are stored", async () => {
  const t = await setup();
  const noOrigin = await t.call("/api/auth/line/start", { method: "POST", origin: null, headers: t.TS, body: { mode: "signin" } });
  assert.equal(noOrigin.status, 403);
  const noBot = await t.call("/api/auth/line/start", { method: "POST", headers: { "X-Turnstile-Token": "bad:signin" }, body: { mode: "signin" } });
  assert.equal(noBot.status, 403); assert.equal(noBot.j.code, "turnstile_failed");
  const badMode = await t.start({ mode: "merge" });
  assert.equal(badMode.status, 400);
  const s = await t.start();
  assert.equal(s.status, 201, JSON.stringify(s.j));
  assert.equal(s.j.expires_in, 600);
  assert.match(s.j.binding, /^[A-Za-z0-9_-]{43}$/);
  const u = new URL(s.j.authorize_url);
  assert.equal(u.origin + u.pathname, "https://access.line.me/oauth2/v2.1/authorize");
  const q = Object.fromEntries(u.searchParams);
  assert.equal(q.response_type, "code");
  assert.equal(q.client_id, CHANNEL_ID);
  assert.equal(q.redirect_uri, REDIRECT);
  assert.equal(q.scope, "openid profile", "no email permission");
  assert.equal(q.code_challenge_method, "S256");
  assert.match(q.code_challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.match(q.state, /^[A-Za-z0-9_-]{32,}$/);
  assert.match(q.nonce, /^[A-Za-z0-9_-]{20,}$/);
  assert.equal(q.bot_prompt, "normal", "add-friend option (Normal) for the linked official account");
  assert.ok(!s.j.authorize_url.includes(CHANNEL_SECRET), "no secret in the URL");
  const d = await t.dump();
  assert.ok(!d.includes(q.state), "the state value itself is not stored (hash only)");
  assert.ok(!d.includes(s.j.binding), "the browser binding is not stored (hash only)");
  const row = await t.env.DB.prepare("SELECT * FROM line_auth_flows").first();
  assert.ok(row && row.expires_at - row.created_at === 600);
  assert.equal(row.mode, "signin");
});

/* ---------------- L3 first sign-in ---------------- */
test("L3: first LINE sign-in creates an account without e-mail; no picture, access or refresh token stored; /api/me works", async () => {
  const t = await setup();
  const r = await t.lineSignIn();
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.match(r.j.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(r.j.created, true);
  assert.equal(r.j.provider, "line");
  assert.equal(r.j.user.display_name, "Malee");
  assert.equal(r.j.user.email, null, "LINE gives no e-mail (no email permission)");
  const d = await t.dump();
  assert.ok(!d.includes("AT-" + "x".repeat(40)), "LINE access token never stored");
  assert.ok(!d.includes("RT-" + "y".repeat(40)), "LINE refresh token never stored");
  assert.ok(!d.includes("profile.line-scdn.net"), "no profile picture stored");
  const id = await t.env.DB.prepare("SELECT * FROM user_identities").first();
  assert.equal(id.provider, "line"); assert.equal(id.sub, LINE_SUB);
  const u = await t.env.DB.prepare("SELECT * FROM users").first();
  assert.equal(u.id, id.user_id);
  assert.ok(!/^\d+$/.test(u.google_sub) && u.google_sub.startsWith("nogoogle:"), "placeholder that can never match a Google sub");
  assert.equal(u.email, "");
  const me = await t.call("/api/me", { token: r.j.token });
  assert.equal(me.status, 200);
  assert.deepEqual(me.j.sign_in_methods, ["line"]);
  // a second LINE sign-in finds the same account
  const again = await t.lineSignIn();
  assert.equal(again.status, 200);
  assert.equal(again.j.created, false);
  assert.equal(again.j.user.id, r.j.user.id);
  assert.equal((await t.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n, 1);
  assert.equal((await t.env.DB.prepare("SELECT COUNT(*) AS n FROM line_auth_flows").first()).n, 0, "used flows are deleted");
});

/* ---------------- L4 consent ---------------- */
test("L4: a new LINE account needs the terms accepted at start; a returning account does not", async () => {
  const t = await setup();
  const r = await t.lineSignIn({ body: { accept_terms: false } });
  assert.equal(r.status, 400); assert.equal(r.j.code, "consent_required");
  assert.equal((await t.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n, 0);
  const ok = await t.lineSignIn();
  assert.equal(ok.status, 200);
  const back = await t.lineSignIn({ body: { accept_terms: false, consent_version: undefined } });
  assert.equal(back.status, 200, JSON.stringify(back.j));
  const mk = await t.env.DB.prepare("SELECT marketing_opt_in FROM users").first();
  assert.equal(mk.marketing_opt_in, 0, "marketing defaults to no");
});

/* ---------------- L5 state ---------------- */
test("L5: state is single-use, expires after 10 minutes and is bound to the browser that started it", async () => {
  const t = await setup();
  const s = await t.start();
  const { code, state } = t.net.authorize(s.j.authorize_url);
  const csrf = await t.call("/api/auth/line/finish", { method: "POST", body: { code, state, binding: "z".repeat(43) } });
  assert.equal(csrf.status, 401); assert.equal(csrf.j.code, "line_state", "a link planted by someone else does not sign the victim in");
  // the flow is gone after a failed binding too (no second try with the same state)
  const retry = await t.call("/api/auth/line/finish", { method: "POST", body: { code, state, binding: s.j.binding } });
  assert.equal(retry.status, 401); assert.equal(retry.j.code, "line_state");
  const unknown = await t.call("/api/auth/line/finish", { method: "POST", body: { code: "codeX", state: "s".repeat(43), binding: s.j.binding } });
  assert.equal(unknown.status, 401); assert.equal(unknown.j.code, "line_state");
  const malformed = await t.call("/api/auth/line/finish", { method: "POST", body: { code: "a b", state: "<x>", binding: 1 } });
  assert.equal(malformed.status, 400);
  // replay
  const s2 = await t.start();
  const a2 = t.net.authorize(s2.j.authorize_url);
  const ok = await t.call("/api/auth/line/finish", { method: "POST", body: { ...a2, binding: s2.j.binding } });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  const replay = await t.call("/api/auth/line/finish", { method: "POST", body: { ...a2, binding: s2.j.binding } });
  assert.equal(replay.status, 401); assert.equal(replay.j.code, "line_state");
  // expiry
  const s3 = await t.start();
  const a3 = t.net.authorize(s3.j.authorize_url);
  await t.env.DB.prepare("UPDATE line_auth_flows SET expires_at = ?1").bind(nowS() - 1).run();
  const late = await t.call("/api/auth/line/finish", { method: "POST", body: { ...a3, binding: s3.j.binding } });
  assert.equal(late.status, 401); assert.equal(late.j.code, "line_state");
});

/* ---------------- L6 ID token ---------------- */
test("L6: ID token checks: aud, iss, exp, nonce, HS256 / ES256 signature, alg none, sub format; token endpoint failures", async () => {
  const t = await setup();
  const code = async o => { const r = await t.lineSignIn(o); return [r.status, r.j && r.j.code]; };
  assert.deepEqual(await code({ claims: { aud: "999" } }), [401, "line_token"]);
  assert.deepEqual(await code({ claims: { iss: "https://evil.example" } }), [401, "line_token"]);
  assert.deepEqual(await code({ claims: { exp: nowS() - 120 } }), [401, "line_token"]);
  assert.deepEqual(await code({ claims: { iat: nowS() + 3600 } }), [401, "line_token"]);
  assert.deepEqual(await code({ claims: { nonce: "other-nonce-value-000000" } }), [401, "line_token"]);
  assert.deepEqual(await code({ jwt: { secret: "w".repeat(32) } }), [401, "line_token"], "HS256 signed with another secret");
  assert.deepEqual(await code({ jwt: { alg: "none" } }), [401, "line_token"]);
  assert.deepEqual(await code({ sub: "not-a-line-user-id" }), [401, "line_token"]);
  assert.deepEqual(await code({ raw: "garbage" }), [401, "line_token"]);
  assert.equal((await t.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n, 0, "nothing created by a bad token");
  const es = await t.lineSignIn({ jwt: { alg: "ES256" } });
  assert.equal(es.status, 200, "ES256 ID token verified against LINE's JWKS: " + JSON.stringify(es.j));
  assert.ok(t.net.certFetches >= 1);
  const evil = (() => { const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" }); return { kid: EK.kid, privateKey, jwk: publicKey.export({ format: "jwk" }) }; })();
  assert.deepEqual(await code({ jwt: { alg: "ES256", key: evil } }), [401, "line_token"], "same kid, other key");
  t.net.tokenError = true;
  assert.deepEqual(await code({}), [401, "line_code"]);
  t.net.tokenError = false; t.net.tokenDown = true;
  assert.deepEqual(await code({}), [503, "line_unavailable"]);
});

/* ---------------- L7 PKCE + secret ---------------- */
test("L7: PKCE verifier matches the challenge; the channel secret goes only to LINE's token endpoint", async () => {
  const t = await setup();
  const s = await t.start();
  const a = t.net.authorize(s.j.authorize_url);
  const r = await t.call("/api/auth/line/finish", { method: "POST", body: { ...a, binding: s.j.binding } });
  assert.equal(r.status, 200);
  const tc = t.net.tokenCalls[0];
  assert.equal(tc.redirect_uri, REDIRECT);
  assert.equal(tc.client_secret, CHANNEL_SECRET);
  assert.ok(!JSON.stringify(s.j).includes(CHANNEL_SECRET) && !JSON.stringify(r.j).includes(CHANNEL_SECRET), "never in a response");
  assert.ok(!(await t.dump()).includes(tc.code_verifier), "the PKCE verifier is deleted with the flow");
});

/* ---------------- L8 link LINE to a Google account ---------------- */
test("L8: a signed-in Google member links LINE; LINE then signs into the same account; no merging of two accounts", async () => {
  const t = await setup();
  const g = await t.googleSignIn();
  assert.equal(g.status, 200, JSON.stringify(g.j));
  const noBearer = await t.call("/api/auth/line/start", { method: "POST", body: { mode: "link" } });
  assert.equal(noBearer.status, 401); assert.equal(noBearer.j.code, "member_required");
  const l = await t.lineSignIn({ token: g.j.token, body: { mode: "link" } });
  assert.equal(l.status, 200, JSON.stringify(l.j));
  assert.deepEqual(l.j, { ok: true, linked: "line" });
  const me = await t.call("/api/me", { token: g.j.token });
  assert.deepEqual(me.j.sign_in_methods, ["google", "line"]);
  const viaLine = await t.lineSignIn();
  assert.equal(viaLine.j.user.id, g.j.user.id, "LINE sign-in reaches the linked account");
  // finishing a link flow needs the same member's bearer
  const other = await t.googleSignIn({ sub: "222", email: "other@example.test" });
  const wrong = await t.lineSignIn({ token: g.j.token, finishToken: other.j.token, body: { mode: "link" }, sub: LINE_SUB2 });
  assert.equal(wrong.status, 403); assert.equal(wrong.j.code, "line_wrong_session");
  const none = await t.lineSignIn({ token: g.j.token, finishToken: null, body: { mode: "link" }, sub: LINE_SUB2 });
  assert.equal(none.status, 403); assert.equal(none.j.code, "line_wrong_session");
  // the LINE account is already linked to the first member: the second member cannot take it (no merge)
  const taken = await t.lineSignIn({ token: other.j.token, body: { mode: "link" } });
  assert.equal(taken.status, 409); assert.equal(taken.j.code, "line_already_linked");
  assert.equal((await t.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n, 2, "both accounts kept, nothing merged");
  assert.equal((await t.env.DB.prepare("SELECT user_id FROM user_identities WHERE sub = ?1").bind(LINE_SUB).first()).user_id, g.j.user.id);
  const audit = (await t.env.DB.prepare("SELECT action, detail FROM audit_log").all()).results;
  assert.ok(audit.some(a => a.action === "member.identity.linked"));
  assert.ok(!JSON.stringify(audit).includes(LINE_SUB), "the LINE user id is not written to the audit log");
});

/* ---------------- L9 link Google to a LINE-only account ---------------- */
test("L9: a LINE-only member links Google (fresh ID token + nonce); a Google account already in use is refused", async () => {
  const t = await setup();
  const l = await t.lineSignIn();
  const link = async (token, over = {}) => {
    const n = await t.call("/api/auth/nonce", { method: "POST", body: {} });
    return t.call("/api/auth/link/google", { method: "POST", token, body: { credential: googleJwt(googleClaims({ nonce: n.j.nonce, ...over })), nonce: n.j.nonce } });
  };
  assert.equal((await t.call("/api/auth/link/google", { method: "POST", body: {} })).status, 401);
  const ok = await link(l.j.token);
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  const me = await t.call("/api/me", { token: l.j.token });
  assert.deepEqual(me.j.sign_in_methods, ["google", "line"]);
  assert.equal(me.j.user.email, "member@example.test");
  const g = await t.googleSignIn();
  assert.equal(g.j.user.id, l.j.user.id, "Google now reaches the same account");
  const l2 = await t.lineSignIn({ sub: LINE_SUB2 });
  const taken = await link(l2.j.token);
  assert.equal(taken.status, 409); assert.equal(taken.j.code, "google_already_linked");
  const already = await link(l.j.token, { sub: "999" });
  assert.equal(already.status, 409); assert.equal(already.j.code, "google_already_linked", "an account keeps one Google account");
});

/* ---------------- L10 unlink ---------------- */
test("L10: unlink needs a fresh confirmation and never removes the last sign-in method", async () => {
  const t = await setup();
  const g = await t.googleSignIn();
  const ids = await t.call("/api/me/identities", { token: g.j.token });
  assert.equal(ids.status, 200);
  assert.deepEqual(ids.j.methods.map(m => [m.provider, m.linked]), [["google", true], ["line", false]]);
  const noFresh = await t.call("/api/me/identities/unlink", { method: "POST", token: g.j.token, body: { provider: "google" } });
  assert.equal(noFresh.status, 401); assert.equal(noFresh.j.code, "reauth_required");
  assert.equal((await t.freshGoogle(g.j.token)).status, 200);
  const last = await t.call("/api/me/identities/unlink", { method: "POST", token: g.j.token, body: { provider: "google" } });
  assert.equal(last.status, 409); assert.equal(last.j.code, "last_sign_in_method");
  await t.lineSignIn({ token: g.j.token, body: { mode: "link" } });
  const bad = await t.call("/api/me/identities/unlink", { method: "POST", token: g.j.token, body: { provider: "facebook" } });
  assert.equal(bad.status, 400);
  const un = await t.call("/api/me/identities/unlink", { method: "POST", token: g.j.token, body: { provider: "line" } });
  assert.equal(un.status, 200, JSON.stringify(un.j));
  assert.equal((await t.env.DB.prepare("SELECT COUNT(*) AS n FROM user_identities").first()).n, 0);
  const viaLine = await t.lineSignIn();
  assert.notEqual(viaLine.j.user.id, g.j.user.id, "after unlinking, LINE makes a separate new account");
});

/* ---------------- L11 LINE re-authentication ---------------- */
test("L11: LINE re-authentication (max_age) opens the 5-minute window; stale or other LINE account refused", async () => {
  const t = await setup();
  const l = await t.lineSignIn();
  const exp0 = await t.call("/api/me/export", { token: l.j.token });
  assert.equal(exp0.status, 401); assert.equal(exp0.j.code, "reauth_required");
  const s = await t.start({ mode: "reauth" }, { token: l.j.token });
  assert.equal(s.status, 201);
  assert.ok(Number(new URL(s.j.authorize_url).searchParams.get("max_age")) <= 300, "LINE is asked to re-authenticate recently");
  const stale = await t.lineSignIn({ token: l.j.token, body: { mode: "reauth" }, claims: { auth_time: nowS() - 3600 } });
  assert.equal(stale.status, 401); assert.equal(stale.j.code, "reauth_stale");
  const other = await t.lineSignIn({ token: l.j.token, body: { mode: "reauth" }, sub: LINE_SUB2, claims: { auth_time: nowS() - 5 } });
  assert.equal(other.status, 403); assert.equal(other.j.code, "reauth_wrong_account");
  const ok = await t.lineSignIn({ token: l.j.token, body: { mode: "reauth" }, claims: { auth_time: nowS() - 5 } });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  assert.equal(ok.j.ok, true); assert.ok(ok.j.valid_until > nowS());
  const exp = await t.call("/api/me/export", { token: l.j.token });
  assert.equal(exp.status, 200, JSON.stringify(exp.j));
});

/* ---------------- L12 erasure ---------------- */
test("L12: erasure of a LINE-only account removes the LINE link, sessions and the account", async () => {
  const t = await setup();
  const l = await t.lineSignIn();
  await t.lineSignIn({ token: l.j.token, body: { mode: "reauth" }, claims: { auth_time: nowS() - 5 } });
  const del = await t.call("/api/me", { method: "DELETE", token: l.j.token, body: { confirm: "DELETE" } });
  assert.equal(del.status, 200, JSON.stringify(del.j));
  for (const tb of ["users", "user_identities", "member_sessions"]) assert.equal((await t.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tb}`).first()).n, 0, tb);
  assert.ok(!(await t.dump()).includes(LINE_SUB), "the LINE user id is gone");
  const back = await t.lineSignIn();
  assert.equal(back.j.created, true, "signing in again creates a fresh account");
});

/* ---------------- L13 export ---------------- */
test("L13: export lists sign-in methods with dates, never the Google or LINE account id", async () => {
  const t = await setup();
  const g = await t.googleSignIn();
  await t.lineSignIn({ token: g.j.token, body: { mode: "link" } });
  await t.freshGoogle(g.j.token);
  const e = await t.call("/api/me/export", { token: g.j.token });
  assert.equal(e.status, 200);
  assert.deepEqual(e.j.sign_in_methods.map(m => m.provider).sort(), ["google", "line"]);
  const s = JSON.stringify(e.j);
  assert.ok(!s.includes(LINE_SUB) && !s.includes("1234567890"), "provider account ids are not exported");
});

/* ---------------- L14 go-live gate ---------------- */
test("L14: GO_LIVE_GATE=enforce blocks new LINE sign-ins while the business side is not ready", async () => {
  const t = await setup({ GO_LIVE_GATE: "enforce" });
  const s = await t.start();
  assert.equal(s.status, 503); assert.equal(s.j.code, "go_live_blocked");
  const ready = await setup({ GO_LIVE_GATE: "enforce", SELLER_NAME: "x", SELLER_TAX_ID: "0000000000000", SELLER_ADDRESS: "x", LEGAL_TERMS_READY: "true", LEGAL_PRIVACY_READY: "true" });
  assert.equal((await ready.start()).status, 201);
  const { goLiveStatus } = await import(B + "golive.js");
  const st = await goLiveStatus(t.env);
  assert.equal(st.switches.line_signin, true);
  assert.equal(st.blocks.line_signin, true);
});

/* ---------------- L15 retention ---------------- */
test("L15: the daily purge deletes expired LINE sign-in flows", async () => {
  const t = await setup();
  await t.start(); await t.start();
  await t.env.DB.prepare("UPDATE line_auth_flows SET expires_at = ?1 WHERE rowid = (SELECT MIN(rowid) FROM line_auth_flows)").bind(nowS() - 5).run();
  const { purge } = await import(B + "retention.js");
  const out = await purge(t.env);
  assert.equal(out.line_auth_flows, 1);
  assert.equal((await t.env.DB.prepare("SELECT COUNT(*) AS n FROM line_auth_flows").first()).n, 1);
});

/* ---------------- L16 migration ---------------- */
test("L16: migration 0017_accounts.sql is listed in health.js and probed (user_identities, line_auth_flows)", async () => {
  assert.ok(existsSync(join(ROOT, "backend", "migrations", "0017_accounts.sql")));
  const { MIGRATIONS, deepHealth } = await import(B + "health.js");
  assert.ok(MIGRATIONS.includes("0017_accounts.sql"));
  const src = readFileSync(join(ROOT, "backend", "src", "health.js"), "utf8");
  assert.match(src, /\["0017_accounts\.sql", "SELECT [^"]*FROM user_identities/);
  assert.match(src, /\["0017_accounts\.sql", "SELECT [^"]*FROM line_auth_flows/);
  const env = createEnv();
  assert.equal((await deepHealth(env)).ok, true);
  await env.DB.exec("DROP TABLE line_auth_flows");
  assert.ok((await deepHealth(env)).migrations.missing.includes("0017_accounts.sql"));
});

/* ---------------- L17 disabled ---------------- */
test("L17: a disabled account cannot sign in with LINE", async () => {
  const t = await setup();
  const l = await t.lineSignIn();
  await t.env.DB.prepare("UPDATE users SET status = 'disabled' WHERE id = ?1").bind(l.j.user.id).run();
  const r = await t.lineSignIn();
  assert.equal(r.status, 403); assert.equal(r.j.code, "account_disabled");
});
