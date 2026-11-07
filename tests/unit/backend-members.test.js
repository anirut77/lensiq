"use strict";
// tests/unit/backend-members.test.js — backend/src/google.js + members.js: Google ID-token verification (locally
// generated RSA keys, mocked JWKS — nothing leaves the machine), member sessions, tier quotas, ledger, saved readings,
// export / erasure, checkout requires a member, admin Members tab, membership switch.
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, createSign } = require("node:crypto");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const CLIENT_ID = "test-client.apps.example"; // placeholder, not a real OAuth client id
const TEST_KEY = "skey_test_5xyzabcdefghijklmnop";
const KEK = Buffer.alloc(32, 7).toString("base64");
const ADMIN_TOKEN = "bootstrap-" + "t".repeat(40);
const ADMIN_PW = "correct horse battery staple";
const EMAIL = "member@example.test"; // reserved test domain; never sent anywhere

const b64u = b => Buffer.from(b).toString("base64url");
function keypair(kid) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" } };
}
const K1 = keypair("kid-1"), K2 = keypair("kid-2"), EVIL = keypair("kid-1");
function jwt(claims, key = K1, header = {}) {
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid: key.kid, ...header }));
  const p = b64u(JSON.stringify(claims));
  const s = createSign("RSA-SHA256").update(h + "." + p).sign(key.privateKey);
  return h + "." + p + "." + b64u(s);
}
const nowS = () => Math.floor(Date.now() / 1000);
const claims = (over = {}) => ({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "1234567890", email: EMAIL, email_verified: true, given_name: "Somchai", picture: "https://example.test/photo.jpg", iat: nowS() - 5, exp: nowS() + 3600, nonce: "n", ...over });

/** Mocked network: Google JWKS (switchable key set, counts fetches), Turnstile siteverify, Opn charges. */
function fakeNet() {
  const st = { keys: [K1.jwk], jwksFetches: 0, charges: new Map(), n: 0 };
  st.fetch = async (url, init = {}) => {
    url = String(url);
    if (url === "https://www.googleapis.com/oauth2/v3/certs") {
      st.jwksFetches++;
      return new Response(JSON.stringify({ keys: st.keys }), { headers: { "Cache-Control": "public, max-age=19800, must-revalidate" } });
    }
    if (/turnstile\/v0\/siteverify$/.test(url)) {
      const p = new URLSearchParams(String(init.body));
      const [tok, action] = String(p.get("response")).split(":");
      return new Response(JSON.stringify({ success: tok === "good", action: action || "signin", hostname: "site.example" }));
    }
    const u = new URL(url);
    if (u.hostname === "api.omise.co" && u.pathname === "/charges" && init.method === "POST") {
      const p = new URLSearchParams(init.body);
      const id = "chrg_test_" + String(++st.n).padStart(12, "0");
      const c = { object: "charge", id, amount: Number(p.get("amount")), currency: "thb", status: "pending", source: { type: "promptpay", scannable_code: { image: { download_uri: `https://api.omise.co/charges/${id}/documents/d/downloads/QR` } } } };
      st.charges.set(id, c);
      return new Response(JSON.stringify(c));
    }
    const m = /^\/charges\/(chrg_test_\d+)$/.exec(u.pathname);
    if (m) return new Response(JSON.stringify(st.charges.get(m[1])));
    throw new Error("unexpected network call in test: " + url);
  };
  return st;
}

async function setup(vars = {}) {
  const { handle } = await import(B + "index.js");
  const g = await import(B + "google.js");
  g.resetJwksCache();
  const net = fakeNet();
  const env = createEnv({ GOOGLE_CLIENT_ID: CLIENT_ID, TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: KEK, ...vars });
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers, ip: o.ip, origin: o.origin }), env, { fetch: net.fetch, ...(o.deps || {}) });
    let j = null; try { j = await r.clone().json(); } catch { /* empty */ }
    return { status: r.status, j, r };
  };
  const signIn = async (over = {}, body = {}) => {
    const n = await call("/api/auth/nonce", { method: "POST", body: {} });
    assert.equal(n.status, 201, JSON.stringify(n.j));
    const cred = jwt(claims({ nonce: n.j.nonce, ...over }), over.__key || K1);
    return call("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: cred, nonce: n.j.nonce, accept_terms: true, consent_version: "m1", ...body } });
  };
  const admin = async () => {
    await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
    const l = await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } });
    return l.j.token;
  };
  const require_ = async on => { await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('membership', ?1, 0) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify({ membership_required: on })).run(); };
  return { env, net, call, signIn, admin, requireMembership: require_, g };
}

// ---------------------------------------------------------------- JWT verification

test("google: valid RS256 ID token verifies; profile photo is never stored", async () => {
  const { signIn, env, net } = await setup();
  const r = await signIn();
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.match(r.j.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(r.j.user.email, EMAIL);
  assert.equal(r.j.user.display_name, "Somchai");
  assert.equal(r.j.created, true);
  assert.equal(net.jwksFetches, 1);
  const row = await env.DB.prepare("SELECT * FROM users").first();
  assert.equal(row.google_sub, "1234567890");
  assert.ok(!JSON.stringify(row).includes("photo.jpg"), "no picture column / value");
  assert.equal(row.marketing_opt_in, 0, "marketing defaults to no");
  const sess = await env.DB.prepare("SELECT id_hash FROM member_sessions").first();
  assert.notEqual(sess.id_hash, r.j.token, "only the hash of the session token is stored");
});

test("google: bad signature, wrong aud, wrong iss, expired, future iat, unverified e-mail, bad nonce, alg none are refused", async () => {
  const { verifyGoogleIdToken, resetJwksCache, GoogleTokenError } = await import(B + "google.js");
  const net = fakeNet();
  const v = (tok, o = {}) => verifyGoogleIdToken(tok, { clientId: CLIENT_ID, nonce: "n", fetchImpl: net.fetch, ...o });
  resetJwksCache();
  assert.equal((await v(jwt(claims()))).sub, "1234567890");
  assert.equal((await v(jwt(claims({ iss: "accounts.google.com" })))).sub, "1234567890", "both issuer spellings");
  const code = async (tok, o) => { try { await v(tok, o); return "ok"; } catch (e) { assert.ok(e instanceof GoogleTokenError, String(e)); return e.code; } };
  assert.equal(await code(jwt(claims(), EVIL)), "signature", "same kid, other key");
  const t = jwt(claims()).split("."); t[1] = b64u(JSON.stringify(claims({ sub: "999" })));
  assert.equal(await code(t.join(".")), "signature", "payload tampered");
  assert.equal(await code(jwt(claims({ aud: "other-client" }))), "aud");
  assert.equal(await code(jwt(claims({ aud: ["other", CLIENT_ID] }))), "azp", "multi-aud without azp");
  assert.equal(await code(jwt(claims({ iss: "https://evil.example" }))), "iss");
  assert.equal(await code(jwt(claims({ exp: nowS() - 120 }))), "expired");
  assert.equal(await code(jwt(claims({ exp: nowS() - 30 }))), "ok", "within 60 s skew");
  assert.equal(await code(jwt(claims({ iat: nowS() + 600 }))), "iat");
  assert.equal(await code(jwt(claims({ email_verified: false }))), "email_unverified");
  assert.equal(await code(jwt(claims({ nonce: "other" }))), "nonce");
  assert.equal(await code(jwt(claims({ nonce: undefined }))), "nonce");
  assert.equal(await code(jwt(claims(), K1, { alg: "none" })), "alg");
  assert.equal(await code(jwt(claims(), K1, { alg: "HS256" })), "alg");
  assert.equal(await code("a.b"), "format");
  assert.equal(await code(jwt(claims()), { clientId: "" }), "not_configured");
});

test("google: JWKS cached per Cache-Control; unknown kid forces one (throttled) refetch — key rotation", async () => {
  const { verifyGoogleIdToken, resetJwksCache, maxAgeOf } = await import(B + "google.js");
  assert.equal(maxAgeOf("public, max-age=19800, must-revalidate"), 19800);
  assert.equal(maxAgeOf("max-age=5"), 60, "clamped");
  assert.equal(maxAgeOf(null), null);
  const net = fakeNet();
  resetJwksCache();
  const t0 = nowS();
  const v = (tok, now) => verifyGoogleIdToken(tok, { clientId: CLIENT_ID, nonce: "n", fetchImpl: net.fetch, now });
  await v(jwt(claims()), t0);
  await v(jwt(claims()), t0 + 10);
  assert.equal(net.jwksFetches, 1, "cached");
  // Google rotates: K2 is published, a token signed with K2 arrives
  net.keys = [K1.jwk, K2.jwk];
  assert.equal((await v(jwt(claims(), K2), t0 + 40)).sub, "1234567890");
  assert.equal(net.jwksFetches, 2, "unknown kid -> refetch");
  // a garbage kid right after: no refetch storm
  await assert.rejects(v(jwt(claims(), keypair("kid-x")), t0 + 45), /unknown_kid/);
  assert.equal(net.jwksFetches, 2, "refetch throttled");
  // the cache expires after max-age
  await v(jwt(claims({ iat: t0 + 19800, exp: t0 + 30000 })), t0 + 19900);
  assert.equal(net.jwksFetches, 3, "expired cache refetched");
});

test("sign-in: nonce is single use; consent required for new accounts; Turnstile fail-closed; disabled accounts refused", async () => {
  const { call, env, net } = await setup();
  const n = await call("/api/auth/nonce", { method: "POST", body: {} });
  const body = { credential: jwt(claims({ nonce: n.j.nonce })), nonce: n.j.nonce, accept_terms: true, consent_version: "m1" };
  const h = { "X-Turnstile-Token": "good:signin" };
  assert.equal((await call("/api/auth/google", { method: "POST", headers: h, body })).status, 200);
  const replay = await call("/api/auth/google", { method: "POST", headers: h, body });
  assert.equal(replay.status, 401);
  assert.equal(replay.j.code, "nonce", "replay of the same nonce refused");
  // nonce we never issued (attacker chooses one) refused even with a valid signature
  assert.equal((await call("/api/auth/google", { method: "POST", headers: h, body: { ...body, credential: jwt(claims({ nonce: "x".repeat(32) })), nonce: "x".repeat(32) } })).j.code, "nonce");
  // new account without consent
  const n2 = await call("/api/auth/nonce", { method: "POST", body: {} });
  const r2 = await call("/api/auth/google", { method: "POST", headers: h, body: { credential: jwt(claims({ sub: "222", nonce: n2.j.nonce })), nonce: n2.j.nonce } });
  assert.equal(r2.status, 400); assert.equal(r2.j.code, "consent_required");
  // Turnstile: bad token / not configured
  const n3 = await call("/api/auth/nonce", { method: "POST", body: {} });
  assert.equal((await call("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "bad" }, body: { ...body, credential: jwt(claims({ nonce: n3.j.nonce })), nonce: n3.j.nonce } })).j.code, "turnstile_failed");
  const { handle } = await import(B + "index.js");
  const env2 = createEnv({ GOOGLE_CLIENT_ID: CLIENT_ID });
  const nn = await (await handle(req("/api/auth/nonce", { method: "POST", body: {} }), env2, { fetch: net.fetch })).json();
  const r = await handle(req("/api/auth/google", { method: "POST", body: { ...body, nonce: nn.nonce } }), env2, { fetch: net.fetch });
  assert.equal(r.status, 503); assert.equal((await r.json()).code, "turnstile_not_configured");
  // Google not configured at all
  const env3 = createEnv({});
  assert.equal((await handle(req("/api/auth/nonce", { method: "POST", body: {} }), env3, {})).status, 503);
  // disabled account
  await env.DB.prepare("UPDATE users SET status = 'disabled'").run();
  const n4 = await call("/api/auth/nonce", { method: "POST", body: {} });
  const r4 = await call("/api/auth/google", { method: "POST", headers: h, body: { ...body, credential: jwt(claims({ nonce: n4.j.nonce })), nonce: n4.j.nonce } });
  assert.equal(r4.status, 403); assert.equal(r4.j.code, "account_disabled");
  // origin allowlist on the member API
  assert.equal((await call("/api/auth/nonce", { method: "POST", body: {}, origin: "https://evil.example" })).status, 403);
});

test("sign-in: per-caller rate limit", async () => {
  const { call } = await setup();
  const st = [];
  for (let i = 0; i < 12; i++) st.push((await call("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: "x.y.z", nonce: "n".repeat(32) } })).status);
  assert.ok(st.slice(0, 10).every(s => s === 401), st.join(","));
  assert.deepEqual(st.slice(10), [429, 429]);
});

// ---------------------------------------------------------------- sessions

test("sessions: bearer token works, logout revokes, expiry and idle timeout enforced, garbage refused", async () => {
  const { signIn, call, env } = await setup();
  const { token } = (await signIn()).j;
  const me = await call("/api/me", { token });
  assert.equal(me.status, 200);
  assert.equal(me.j.tier, "member");
  assert.equal(me.j.user.email, EMAIL);
  assert.equal((await call("/api/me")).status, 401);
  assert.equal((await call("/api/me")).j.code, "member_required");
  assert.equal((await call("/api/me", { token: "A".repeat(43) })).status, 401);
  assert.equal((await call("/api/auth/logout", { method: "POST", token, body: {} })).status, 200);
  assert.equal((await call("/api/me", { token })).status, 401, "revoked");
  const t2 = (await signIn()).j.token;
  await env.DB.prepare("UPDATE member_sessions SET expires_at = ?1").bind(nowS() - 1).run();
  assert.equal((await call("/api/me", { token: t2 })).status, 401, "expired");
  const t3 = (await signIn()).j.token;
  await env.DB.prepare("UPDATE member_sessions SET last_seen = ?1").bind(nowS() - 15 * 86400).run();
  assert.equal((await call("/api/me", { token: t3 })).status, 401, "idle > 14 days");
  // second sign-in of the same Google account = same user, consent kept, marketing stays off unless opted in
  const again = await signIn({}, { marketing_opt_in: true });
  assert.equal(again.j.created, false);
  assert.equal(again.j.user.marketing_opt_in, true);
  const pref = await call("/api/me/preferences", { method: "POST", token: again.j.token, body: { marketing_opt_in: false } });
  assert.equal(pref.j.marketing_opt_in, false);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n, 1);
});

// ---------------------------------------------------------------- tiers / quotas / fortune

function fakeSdk() {
  class APIError extends Error {}
  class Anthropic { constructor() { this.beta = { messages: { create: async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ sections: [{ id: "overview", title: "ภาพรวม", paragraphs: ["จากเส้นหัวใจยาว คุณมีความรักที่มั่นคงและจริงใจต่อคนรัก"] }] }) }] }) } }; } }
  Anthropic.APIError = APIError; Anthropic.RateLimitError = class extends APIError {}; Anthropic.APIConnectionError = class extends APIError {};
  return async () => Anthropic;
}
const FACTS = { domain: "palm", topic: "love", items: [{ id: "heart", label: "เส้นหัวใจยาว", strength: 0.9, tags: ["love"], meanings: { love: ["มีความรักที่มั่นคงและจริงใจต่อคนรัก"] } }] };

test("fortune: membership off = unchanged for guests; on = guests refused (fallback), members get member_ai_daily", async () => {
  const { signIn, call, env, requireMembership } = await setup({ ANTHROPIC_API_KEY: "sk-ant-test-placeholder-not-a-key" });
  const deps = { loadSdk: fakeSdk() };
  const ai = o => call("/api/fortune", { method: "POST", headers: { "X-Turnstile-Token": "good:fortune" }, body: { facts: FACTS, consent: true }, deps, ...o });
  assert.equal((await ai()).status, 200, "membership off: guest AI works as before");
  const st0 = await call("/api/fortune/status");
  assert.equal(st0.j.enabled, true); assert.equal(st0.j.member_required, undefined);
  const cfg0 = await call("/v1/config");
  assert.equal(cfg0.j.membership.required, false);

  await requireMembership(true);
  const cfg = await call("/v1/config");
  assert.equal(cfg.j.membership.required, true);
  assert.equal(cfg.j.membership.google_client_id, CLIENT_ID);
  const guest = await ai();
  assert.equal(guest.status, 401); assert.equal(guest.j.code, "member_required"); assert.equal(guest.j.fallback, true);
  const st = await call("/api/fortune/status");
  assert.equal(st.j.enabled, false); assert.equal(st.j.reason, "member_required");
  const { token } = (await signIn()).j;
  assert.equal((await call("/api/fortune/status", { token })).j.enabled, true);
  for (let i = 0; i < 3; i++) assert.equal((await ai({ token })).status, 200, "use " + (i + 1));
  const over = await ai({ token });
  assert.equal(over.status, 429); assert.equal(over.j.code, "quota"); assert.equal(over.j.fallback, true);
  const me = await call("/api/me", { token });
  assert.deepEqual({ used: me.j.quotas.ai.used, quota: me.j.quotas.ai.quota, remaining: me.j.quotas.ai.remaining }, { used: 3, quota: 3, remaining: 0 }, "round 10: the refused 4th use is not counted");
  const h = await call("/api/me/history", { token });
  assert.equal(h.j.ledger.filter(x => x.kind === "ai").length, 3, "only successful AI uses are ledger rows");
  assert.ok(h.j.ledger.every(x => !("facts" in x)), "no reading content");
  // GOOGLE_CLIENT_ID missing: the switch alone does not gate (nobody could sign in)
  const { membership } = await import(B + "members.js");
  assert.equal((await membership({ ...env, GOOGLE_CLIENT_ID: "" })).required, false);
});

test("tiers: an active paid subscription linked to the user switches the tier and uses the plan quota", async () => {
  const { signIn, call, env, requireMembership } = await setup({ FREE_MODE: "false" });
  await requireMembership(true);
  const s = (await signIn()).j;
  const t = nowS();
  await env.DB.prepare("INSERT INTO customers (id, created_at, user_id) VALUES ('c1', ?1, ?2)").bind(t, s.user.id).run();
  await env.DB.prepare("INSERT INTO subscriptions (id, customer_id, plan_id, status, period, current_period_start, current_period_end, created_at, updated_at, user_id) VALUES ('s1','c1','pro','active','month',?1,?2,?1,?1,?3)").bind(t, t + 86400, s.user.id).run();
  const me = await call("/api/me", { token: s.token });
  assert.equal(me.j.tier, "pro");
  assert.equal(me.j.plan.id, "pro");
  assert.deepEqual([me.j.quotas.ai.quota, me.j.quotas.ai.period], [100, "month"]);
});

// ---------------------------------------------------------------- ledger, saved readings, export, deletion

test("usage ledger + saved readings (opt-in, derived result only, deletable)", async () => {
  const { signIn, call } = await setup();
  const { token } = (await signIn()).j;
  assert.equal((await call("/api/me/usage", { method: "POST", token, body: { kind: "reading", domain: "tarot" } })).j.recorded, true);
  assert.equal((await call("/api/me/usage", { method: "POST", token, body: { kind: "reading", domain: "evil" } })).status, 400);
  const data = { lang: "th", summary: { title: "สรุปสั้น", lines: [{ k: "ภาพรวม", t: "ดี" }] }, sections: [{ id: "overview", title: "ภาพรวม", paragraphs: ["ย่อหน้า"], secret: "x" }], reminder: "ใช้วิจารณญาณ", facts: { image: "data:" } };
  const sv = await call("/api/me/saved", { method: "POST", token, body: { domain: "tarot", title: "ไพ่วันนี้", data } });
  assert.equal(sv.status, 201);
  const got = await call("/api/me/saved/" + sv.j.id, { token });
  assert.equal(got.j.data.sections[0].paragraphs[0], "ย่อหน้า");
  assert.equal(got.j.data.facts, undefined, "only the derived result is kept");
  assert.equal(got.j.data.sections[0].secret, undefined);
  const h = await call("/api/me/history", { token });
  assert.deepEqual(h.j.ledger.map(x => x.kind), ["reading", "signup"]);
  assert.equal(h.j.saved.length, 1);
  assert.equal((await call("/api/me/saved/" + sv.j.id, { method: "DELETE", token })).status, 200);
  assert.equal((await call("/api/me/saved/" + sv.j.id, { token })).status, 404);
  assert.equal((await call("/api/me/saved", { method: "POST", token, body: { domain: "tarot", data: { sections: [{ paragraphs: ["ก".repeat(2000), "ก".repeat(2000), "ก".repeat(2000)] }, { paragraphs: ["ก".repeat(2000), "ก".repeat(2000)] }] } } })).status, 413, "> 16 KB refused");
});

test("export (portability) and deletion (erasure): payments kept but unlinked for tax retention", async () => {
  const { signIn, call, env } = await setup();
  const s = (await signIn()).j;
  const token = s.token;
  await call("/api/me/usage", { method: "POST", token, body: { kind: "reading", domain: "palm" } });
  await call("/api/me/saved", { method: "POST", token, body: { domain: "palm", data: { sections: [] } } });
  const t = nowS();
  await env.DB.prepare("INSERT INTO customers (id, email, created_at, user_id) VALUES ('c1', ?1, ?2, ?3)").bind(EMAIL, t, s.user.id).run();
  await env.DB.prepare("INSERT INTO payments (id, customer_id, kind, livemode, amount_satang, subtotal_satang, vat_satang, vat_rate_bp, status, receipt_no, buyer_name, buyer_email, created_at, updated_at, user_id) VALUES ('p'||hex(randomblob(15)),'c1','checkout',0,99000,99000,0,0,'successful','LQ-202611-000001','ร้าน', ?1, ?2, ?2, ?3)").bind(EMAIL, t, s.user.id).run();
  // round 11: export + erasure need a FRESH Google confirmation of the same account (a bearer token alone is not enough)
  const noFresh = await call("/api/me/export", { token });
  assert.equal(noFresh.status, 401); assert.equal(noFresh.j.code, "reauth_required");
  assert.equal((await call("/api/me", { method: "DELETE", token, body: { confirm: "DELETE" } })).status, 401, "erasure needs a fresh confirmation");
  const cred = async over => {
    const n = await call("/api/auth/nonce", { method: "POST", body: {} });
    return { credential: jwt(claims({ nonce: n.j.nonce, ...over }), K1), nonce: n.j.nonce };
  };
  const wrong = await call("/api/auth/reauth", { method: "POST", token, body: await cred({ sub: "999" }) });
  assert.equal(wrong.status, 403); assert.equal(wrong.j.code, "reauth_wrong_account");
  const stale = await call("/api/auth/reauth", { method: "POST", token, body: await cred({ iat: nowS() - 900, auth_time: nowS() - 900 }) });
  assert.equal(stale.status, 401); assert.equal(stale.j.code, "reauth_stale");
  const reused = await cred({});
  const inline = await call("/api/me/export", { method: "POST", token, body: reused });
  assert.equal(inline.status, 200, "POST export with an inline fresh confirmation");
  assert.equal((await call("/api/me/export", { method: "POST", token, body: reused })).status, 401, "nonce is single use");
  const ok = await call("/api/auth/reauth", { method: "POST", token, body: await cred({}) });
  assert.equal(ok.status, 200, JSON.stringify(ok.j)); assert.equal(ok.j.valid_for, 300);
  const ex = await call("/api/me/export", { token });
  assert.equal(ex.status, 200);
  assert.match(ex.r.headers.get("Content-Disposition"), /attachment/);
  assert.equal(ex.j.profile.email, EMAIL);
  assert.equal(ex.j.ledger.length, 2);
  assert.equal(ex.j.saved_readings.length, 1);
  assert.equal(ex.j.payments[0].receipt_no, "LQ-202611-000001");
  assert.ok(!JSON.stringify(ex.j).includes("1234567890"), "google sub not exported");

  assert.equal((await call("/api/me", { method: "DELETE", token, body: {} })).status, 400, "explicit confirmation");
  assert.equal((await call("/api/me", { method: "DELETE", token, body: { confirm: "DELETE" } })).status, 200);
  assert.equal((await call("/api/me", { token })).status, 401, "sessions gone");
  for (const tbl of ["users", "member_sessions", "member_ledger", "saved_readings"]) assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tbl}`).first()).n, 0, tbl);
  const p = await env.DB.prepare("SELECT * FROM payments").first();
  assert.equal(p.receipt_no, "LQ-202611-000001", "receipt kept (Revenue Code retention)");
  assert.equal(p.user_id, null); assert.equal(p.buyer_email, null);
  assert.equal(p.buyer_name, "ร้าน", "tax-invoice buyer fields stay");
  assert.equal((await env.DB.prepare("SELECT email, user_id FROM customers").first()).email, null);
  // signing in again creates a fresh account
  assert.equal((await signIn()).j.created, true);
});

// ---------------------------------------------------------------- checkout requires a member

test("checkout: membership on -> sign-in required; payment, customer and subscription linked to user_id", async () => {
  const { signIn, call, env, requireMembership } = await setup({ FREE_MODE: "false", BILLING_ENABLED: "true", OPN_SECRET_KEY: TEST_KEY });
  await env.DB.prepare("UPDATE plans SET status = 'active' WHERE id = 'pro'").run();
  const body = { plan_id: "pro", period: "month", accept_terms: true, age_confirm: "adult", buyer: { name: "ร้าน" } };
  const hdr = { "X-Turnstile-Token": "good:checkout" };
  const forced = await call("/v1/billing/checkout", { method: "POST", headers: hdr, body });
  assert.equal(forced.status, 401, "round 10: billing on -> a member is required even with membership off");
  assert.equal(forced.j.code, "member_required");
  env.ALLOW_GUEST_CHECKOUT = "true";
  const legacy = await call("/v1/billing/checkout", { method: "POST", headers: hdr, body });
  assert.equal(legacy.status, 201, "explicit opt-in: legacy order-token checkout unchanged");
  assert.ok(legacy.j.order_token);
  await requireMembership(true);
  const anon = await call("/v1/billing/checkout", { method: "POST", headers: hdr, body });
  assert.equal(anon.status, 401); assert.equal(anon.j.code, "member_required");
  const s = (await signIn()).j;
  const co = await call("/v1/billing/checkout", { method: "POST", headers: hdr, token: s.token, body });
  assert.equal(co.status, 201, JSON.stringify(co.j));
  assert.equal(co.j.linked_to_account, true);
  assert.equal(co.j.order_token, undefined, "no order token needed for members");
  const p = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(co.j.payment_id).first();
  assert.equal(p.user_id, s.user.id);
  assert.equal(p.buyer_email, EMAIL, "receipt e-mail defaults to the account");
  // payment succeeds -> subscription + ledger row linked to the member
  const { applyCharge } = await import(B + "billing.js");
  await applyCharge(env, p, { status: "successful", amount: p.amount_satang, currency: "thb" });
  const me = await call("/api/me", { token: s.token });
  assert.equal(me.j.tier, "pro");
  const h = await call("/api/me/history", { token: s.token });
  assert.equal(h.j.ledger[0].kind, "payment");
  assert.equal(h.j.payments[0].status, "successful");
});

// ---------------------------------------------------------------- admin

test("admin: members list/search, disable revokes sessions, membership settings validated + audited", async () => {
  const { signIn, call, admin } = await setup();
  const s = (await signIn()).j;
  const adm = await admin();
  const A = (path, o = {}) => call("/admin/api" + path, { ...o, headers: { Authorization: "Bearer " + adm, ...(o.headers || {}) } });
  assert.equal((await call("/admin/api/members", { token: s.token })).status, 401, "a member token is not an admin token");
  const list = await A("/members");
  assert.equal(list.j.count, 1);
  assert.equal(list.j.tiers.member, 1);
  assert.equal(list.j.signups.length, 1);
  assert.equal((await A("/members?q=member@")).j.users[0].id, s.user.id);
  assert.equal((await A("/members?q=nobody@")).j.users.length, 0);
  assert.equal((await A("/members?q=%25%25%25")).j.users.length, 0, "LIKE wildcards escaped");
  assert.equal((await A("/members?q=ab")).status, 400);
  assert.equal((await A(`/members/${s.user.id}/status`, { method: "POST", body: { status: "disabled" } })).status, 403, "round 10: re-auth required");
  assert.equal((await A(`/members/${s.user.id}/status`, { method: "POST", body: { status: "disabled", password: "wrong password here" } })).status, 403);
  assert.equal((await A(`/members/${s.user.id}/status`, { method: "POST", body: { status: "disabled", password: ADMIN_PW } })).status, 200);
  assert.equal((await call("/api/me", { token: s.token })).status, 401, "disabled -> sessions revoked");
  const info = await A("/membership");
  assert.equal(info.j.settings.membership_required, false);
  assert.equal(info.j.google_client_id_set, true);
  const na = await A("/membership", { method: "PUT", body: { settings: { member_ai_daily: 5 } } });
  assert.equal(na.status, 403, "round 11: membership edits need re-auth"); assert.equal(na.j.code, "reauth_required");
  assert.equal((await A("/reauth", { method: "POST", body: { password: ADMIN_PW } })).status, 200);
  assert.equal((await A("/membership", { method: "PUT", body: { settings: { member_ai_daily: -1 } } })).status, 400);
  assert.equal((await A("/membership", { method: "PUT", body: { settings: { bogus: 1 } } })).status, 400);
  assert.equal((await A("/membership", { method: "PUT", body: { plan_ai_quotas: { free: 9 } } })).status, 400);
  const put = await A("/membership", { method: "PUT", body: { settings: { membership_required: true, member_ai_daily: 5, guest_light_sections: 3 }, plan_ai_quotas: { pro: 150 } } });
  assert.equal(put.status, 200);
  assert.equal(put.j.effective_required, true);
  assert.equal(put.j.plan_ai_quotas.find(x => x.plan_id === "pro").quota, 150);
  const cfg = await call("/v1/config");
  assert.deepEqual([cfg.j.membership.member_ai_daily, cfg.j.membership.guest_light_sections], [5, 3]);
  const audit = await A("/audit");
  const acts = audit.j.audit.map(a => a.action);
  assert.ok(acts.includes("membership.settings") && acts.includes("member.status") && acts.includes("member.signup"));
  assert.ok(!JSON.stringify(audit.j).includes(EMAIL), "audit log never holds the e-mail");
});

test("retention: expired member sessions and nonces are purged; usage rows after MEMBER_LEDGER_DAYS, payment rows kept", async () => {
  const { signIn, env } = await setup();
  const s = (await signIn()).j;
  const { purge } = await import(B + "retention.js");
  const t = nowS();
  await env.DB.prepare("INSERT INTO auth_nonces (hash, created_at, expires_at) VALUES ('old', 0, 1)").run();
  await env.DB.prepare("INSERT INTO member_ledger (user_id, ts, kind) VALUES (?1, 0, 'reading'), (?1, 0, 'payment')").bind(s.user.id).run();
  await env.DB.prepare("UPDATE member_sessions SET expires_at = 1").run();
  const r = await purge(env, t);
  assert.equal(r.member_sessions, 1); assert.equal(r.auth_nonces, 1); assert.equal(r.member_ledger, 1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM member_ledger WHERE kind = 'payment'").first()).n, 1);
});
