"use strict";
// tests/unit/backend-hardening.test.js — backend hardening (added in round 12): duplicate-subscription race (fulfilment), pending-payment
// expiry sweep (late success, stuck-charge alert), admin test-charge re-auth + cap, inline money re-auth mode, IPv6 /64
// caller keys, short-lived member sessions + token refresh, transactional e-mail (opt-outs, delivery log, idempotent),
// CSP report counters, migration 0009 in /health/deep. Local only: in-memory D1, mocked Google / Turnstile / Opn / mail.
// Everything is local: in-memory D1, locally generated RSA keys, mocked Google / Turnstile / Opn / Anthropic.
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, createSign, createHmac } = require("node:crypto");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const CLIENT_ID = "test-client.apps.example";
const TEST_KEY = "skey_test_5xyzabcdefghijklmnop";
const WH_SECRET = Buffer.from("webhook-secret-for-tests-0123456789").toString("base64");
const KEK = Buffer.alloc(32, 7).toString("base64");
const ADMIN_TOKEN = "bootstrap-" + "t".repeat(40);
const ADMIN_PW = "correct horse battery staple";
const nowS = () => Math.floor(Date.now() / 1000);

const b64u = b => Buffer.from(b).toString("base64url");
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: "jwk" }), kid: "kid-1", alg: "RS256", use: "sig" };
function jwt(claims) {
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "kid-1" }));
  const p = b64u(JSON.stringify(claims));
  return h + "." + p + "." + b64u(createSign("RSA-SHA256").update(h + "." + p).sign(privateKey));
}
const claims = (o = {}) => ({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "1001", email: "a@example.test", email_verified: true, given_name: "A", iat: nowS() - 5, exp: nowS() + 3600, nonce: "n", ...o });

function fakeNet() {
  const st = { charges: new Map(), n: 0, pushes: [] };
  st.fetch = async (url, init = {}) => {
    url = String(url);
    if (url === "https://www.googleapis.com/oauth2/v3/certs") return new Response(JSON.stringify({ keys: [JWK] }), { headers: { "Cache-Control": "max-age=3600" } });
    if (/turnstile\/v0\/siteverify$/.test(url)) {
      const p = new URLSearchParams(String(init.body));
      const [tok, action] = String(p.get("response")).split(":");
      return new Response(JSON.stringify({ success: tok === "good", action: action || "signin", hostname: "site.example" }));
    }
    if (url.startsWith("https://hooks.example/")) { st.pushes.push(JSON.parse(String(init.body))); return new Response("ok"); }
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

function fakeSdk() {
  class APIError extends Error {}
  class Anthropic {
    constructor() {
      this.beta = { messages: { create: async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ sections: [{ id: "overview", title: "ภาพรวม", paragraphs: ["จากเส้นหัวใจยาว คุณมีความรักที่มั่นคงและจริงใจต่อคนรัก"] }] }) }] }) } };
    }
  }
  Anthropic.APIError = APIError; Anthropic.RateLimitError = class extends APIError {}; Anthropic.APIConnectionError = class extends APIError {};
  return async () => Anthropic;
}
const FACTS = { domain: "palm", topic: "love", items: [{ id: "heart", label: "เส้นหัวใจยาว", strength: 0.9, tags: ["love"], meanings: { love: ["มีความรักที่มั่นคงและจริงใจต่อคนรัก"] } }] };
const BILLING = { FREE_MODE: "false", BILLING_ENABLED: "true", OPN_SECRET_KEY: TEST_KEY, OPN_WEBHOOK_SECRET: WH_SECRET };

async function setup(vars = {}) {
  const { handle } = await import(B + "index.js");
  (await import(B + "google.js")).resetJwksCache();
  const net = fakeNet();
  const env = createEnv({ GOOGLE_CLIENT_ID: CLIENT_ID, TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: KEK, ANTHROPIC_API_KEY: "sk-ant-test-placeholder-not-a-key", ...vars });
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers, ip: o.ip, origin: o.origin }), env, { fetch: net.fetch, ...(o.deps || {}) });
    let j = null; try { j = await r.clone().json(); } catch { /* not JSON */ }
    return { status: r.status, j, r };
  };
  let subN = 5000;
  const signIn = async (o = {}) => {
    const n = await call("/api/auth/nonce", { method: "POST", body: {} });
    const sub = o.sub || String(++subN);
    const r = await call("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: jwt(claims({ nonce: n.j.nonce, sub, email: `m${sub}@example.test` })), nonce: n.j.nonce, accept_terms: true, consent_version: "m1" } });
    return { ...r.j, sub, status: r.status, code: r.j && r.j.code };
  };
  const fresh = async s => {
    const n = await call("/api/auth/nonce", { method: "POST", body: { purpose: "reauth" } }); // amendment A-G5 (security review 2026-11-14): a fresh confirmation uses a re-auth nonce
    return { credential: jwt(claims({ nonce: n.j.nonce, sub: s.sub })), nonce: n.j.nonce };
  };
  let adminTok = null;
  const login = async () => {
    await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
    return (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
  };
  const A = async (path, o = {}) => {
    if (!adminTok) adminTok = await login();
    return call("/admin/api" + path, { ...o, headers: { Authorization: "Bearer " + (o.as || adminTok), ...(o.headers || {}) } });
  };
  /** owner TOTP on + an open 5-min sudo window */
  const sudo = async () => {
    const { base32Decode, totpAt } = await import(B + "crypto.js");
    const st = await A("/totp/setup", { method: "POST", body: { password: ADMIN_PW } });
    const secret = base32Decode(st.j.secret);
    const step = Math.floor(nowS() / 30);
    assert.equal((await A("/totp/enable", { method: "POST", body: { code: await totpAt(secret, step - 1) } })).status, 200);
    assert.equal((await A("/reauth", { method: "POST", body: { password: ADMIN_PW, totp: await totpAt(secret, step) } })).status, 200);
  };
  const ai = (o = {}) => call("/api/fortune", { method: "POST", headers: { "X-Turnstile-Token": "good:fortune" }, body: { facts: FACTS, consent: true }, deps: { loadSdk: fakeSdk() }, ...o });
  const co = (body, { headers, ...o } = {}) => call("/v1/billing/checkout", { ...o, method: "POST", headers: { "X-Turnstile-Token": "good:checkout", ...(headers || {}) }, body: { period: "month", accept_terms: true, age_confirm: true, ...body } });
  let ev = 0;
  const webhook = async (chargeId, id) => {
    const body = JSON.stringify({ object: "event", id, key: "charge.complete", data: { object: "charge", id: chargeId } });
    const ts = String(nowS());
    const sig = createHmac("sha256", Buffer.from(WH_SECRET, "base64")).update(`${ts}.${body}`).digest("hex");
    return call("/v1/billing/webhook/opn", { method: "POST", body, origin: null, headers: { "Omise-Signature-Timestamp": ts, "Omise-Signature": sig } });
  };
  const pay = async (paymentId, evId) => {
    const p = await env.DB.prepare("SELECT provider_charge_id FROM payments WHERE id = ?1").bind(paymentId).first();
    net.charges.get(p.provider_charge_id).status = "successful";
    return webhook(p.provider_charge_id, evId || "evnt_test_r11p" + String(++ev).padStart(6, "0"));
  };
  return { env, net, call, signIn, fresh, A, login, sudo, ai, co, webhook, pay };
}

const memberId = async (env, s) => (await env.DB.prepare("SELECT user_id FROM member_sessions WHERE user_id IS NOT NULL ORDER BY created_at DESC LIMIT 1").first()).user_id || s;

// ---- duplicate-subscription race -----------------------------------------------------------------------------------

test("R12 race: two first purchases of the same plan fulfilled 'at once' give ONE subscription with both periods", async () => {
  const { env, signIn, co } = await setup(BILLING);
  const { fulfilStatements } = await import(B + "billing.js");
  const m = await signIn();
  const a = await co({ plan_id: "plus" }, { token: m.token, headers: { "Idempotency-Key": "race-key-000001" } });
  const b = await co({ plan_id: "plus" }, { token: m.token, headers: { "Idempotency-Key": "race-key-000002" } });
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  const db = env.DB, t = nowS();
  const rows = [];
  for (const id of [a.j.payment_id, b.j.payment_id]) rows.push(await db.prepare("SELECT * FROM payments WHERE id = ?1").bind(id).first());
  // both statement lists are built BEFORE either transaction runs: each saw "no active subscription" (the old race)
  const built = [];
  for (const [i, p] of rows.entries()) built.push({ p, tok: "tok" + i + "x".repeat(20), f: await fulfilStatements(env, p, t, "tok" + i + "x".repeat(20)) });
  for (const { p, tok, f } of built) {
    await db.batch([db.prepare("UPDATE payments SET status = 'successful', paid_at = ?1, fulfil_token = ?2 WHERE id = ?3").bind(t, tok, p.id), ...f.stmts]);
  }
  const subs = (await db.prepare("SELECT * FROM subscriptions WHERE plan_id = 'plus'").all()).results;
  assert.equal(subs.length, 1, "no duplicate subscription row");
  assert.equal(subs[0].current_period_end, t + 2 * 30 * 86400, "the second payment extended the first one's subscription");
  for (const { p } of built) {
    const r = await db.prepare("SELECT subscription_id, fulfilled_at, ext_seconds FROM payments WHERE id = ?1").bind(p.id).first();
    assert.equal(r.subscription_id, subs[0].id); assert.ok(r.fulfilled_at); assert.equal(r.ext_seconds, 30 * 86400);
  }
});

test("R12 race: concurrent webhooks for two payments of the same member and plan never lose a period", async () => {
  const { env, signIn, co, pay, call } = await setup(BILLING);
  const m = await signIn();
  const a = await co({ plan_id: "plus" }, { token: m.token, headers: { "Idempotency-Key": "race-key-000011" } });
  const b = await co({ plan_id: "plus" }, { token: m.token, headers: { "Idempotency-Key": "race-key-000012" } });
  const rs = await Promise.all([pay(a.j.payment_id, "evnt_test_racea00001"), pay(b.j.payment_id, "evnt_test_raceb00001")]);
  assert.ok(rs.every(r => r.status === 200));
  const subs = (await env.DB.prepare("SELECT * FROM subscriptions WHERE status = 'active'").all()).results;
  assert.equal(subs.length, 1);
  assert.ok(subs[0].current_period_end - nowS() > 59 * 86400, "both 30-day periods are on the one subscription");
  assert.equal((await call("/api/me", { token: m.token })).j.plan.subscription_id, subs[0].id);
});

// ---- expiry sweep ----------------------------------------------------------------------------------------------------

test("R12 expiry sweep: expired QR closed locally after the grace hour; a late success still fulfils (+ alert)", async () => {
  const { env, net, signIn, co, webhook, call } = await setup(BILLING);
  const { reconcilePending, EXPIRY_GRACE } = await import(B + "billing.js");
  const m = await signIn();
  const c = await co({ plan_id: "plus" }, { token: m.token });
  const t = nowS();
  // still inside the grace hour: nothing is closed
  await env.DB.prepare("UPDATE payments SET expires_at = ?1 WHERE id = ?2").bind(t - EXPIRY_GRACE + 120, c.j.payment_id).run();
  assert.equal((await reconcilePending(env, { fetchImpl: net.fetch })).expired_local, 0);
  // created 5 days ago (outside the old 3-day re-check window) and the QR expired long ago
  await env.DB.prepare("UPDATE payments SET expires_at = ?1, created_at = ?2 WHERE id = ?3").bind(t - 2 * 3600, t - 5 * 86400, c.j.payment_id).run();
  const r = await reconcilePending(env, { fetchImpl: net.fetch });
  assert.equal(r.checked, 0, "outside the 3-day window"); assert.equal(r.expired_local, 1);
  let p = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(c.j.payment_id).first();
  assert.equal(p.status, "expired"); assert.equal(p.failure_code, "expired_local");
  assert.equal((await call(`/v1/billing/payments/${c.j.payment_id}`)).j.status, "expired");
  // the buyer paid after all: the webhook fulfils the locally closed payment
  net.charges.get(p.provider_charge_id).status = "successful";
  assert.equal((await webhook(p.provider_charge_id, "evnt_test_late000001")).status, 200);
  p = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(c.j.payment_id).first();
  assert.equal(p.status, "successful"); assert.ok(p.fulfilled_at); assert.match(p.receipt_no, /^LQ-/); assert.equal(p.failure_code, null);
  assert.equal((await call("/api/me", { token: m.token })).j.tier, "plus");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM alerts WHERE kind = 'late_payment_fulfilled'").first()).n, 1);
});

test("R12 expiry sweep: Opn 'failed' applied as final; a failing Opn call closes nothing; stuck charge alerts once after 24 h", async () => {
  const { env, net, signIn, co } = await setup(BILLING);
  const { reconcilePending } = await import(B + "billing.js");
  const m = await signIn();
  const t = nowS();
  const f = await co({ plan_id: "plus" }, { token: m.token, headers: { "Idempotency-Key": "sweep-key-00001" } });
  const s = await co({ plan_id: "plus" }, { token: m.token, headers: { "Idempotency-Key": "sweep-key-00002" } });
  const ids = [f.j.payment_id, s.j.payment_id];
  for (const id of ids) await env.DB.prepare("UPDATE payments SET expires_at = ?1, created_at = ?2 WHERE id = ?3").bind(t - 2 * 3600, t - 4 * 86400, id).run();
  const pf = await env.DB.prepare("SELECT provider_charge_id FROM payments WHERE id = ?1").bind(ids[0]).first();
  net.charges.get(pf.provider_charge_id).status = "failed";
  // Opn down: nothing is closed
  const down = async () => new Response("unavailable", { status: 503 });
  const r0 = await reconcilePending(env, { fetchImpl: down });
  assert.equal(r0.expired_local, 0); assert.equal(r0.sweep_errors, 2);
  const r1 = await reconcilePending(env, { fetchImpl: net.fetch });
  assert.equal(r1.expired_local, 1);
  assert.equal((await env.DB.prepare("SELECT status FROM payments WHERE id = ?1").bind(ids[0]).first()).status, "failed");
  // the other one is still 'pending' at Opn 4 days later: one stuck alert, not repeated
  await reconcilePending(env, { fetchImpl: net.fetch });
  const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM alerts WHERE kind = 'charge_stuck_pending' AND ref = ?1").bind(ids[1]).first()).n;
  assert.equal(n, 1, "alert raised once");
  await reconcilePending(env, { fetchImpl: net.fetch });
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM alerts WHERE kind = 'charge_stuck_pending'").first()).n, 1);
});

// ---- admin: test charge + inline money re-auth ------------------------------------------------------------------------

test("R12 admin test-charge: re-auth required, capped per hour, every attempt audited", async () => {
  const { env, A } = await setup({ OPN_SECRET_KEY: TEST_KEY, TEST_CHARGE_HOUR: "3" });
  const no = await A("/billing/test-charge", { method: "POST", body: { amount_satang: 2000 } });
  assert.equal(no.status, 403); assert.equal(no.j.code, "reauth_required");
  for (let i = 0; i < 3; i++) assert.equal((await A("/billing/test-charge", { method: "POST", body: { amount_satang: 2000, password: ADMIN_PW } })).status, 201);
  const cap = await A("/billing/test-charge", { method: "POST", body: { amount_satang: 2000, password: ADMIN_PW } });
  assert.equal(cap.status, 429); assert.equal(cap.j.code, "test_charge_cap");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM payments WHERE kind = 'admin_test'").first()).n, 3);
  const acts = (await env.DB.prepare("SELECT action FROM audit_log WHERE action LIKE 'billing.test_charge%'").all()).results.map(r => r.action);
  assert.deepEqual(acts.sort(), ["billing.test_charge", "billing.test_charge", "billing.test_charge", "billing.test_charge.refused"]);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM alerts WHERE kind = 'test_charge_cap'").first()).n, 1);
  // the sudo window is enough in test mode (default MONEY_REAUTH=window)
  assert.equal((await A("/reauth", { method: "POST", body: { password: ADMIN_PW } })).status, 200);
});

test("R12 money re-auth: MONEY_REAUTH=inline (and live keys by default) refuse the sudo window; body password works", async () => {
  const { moneyReauthMode } = await import(B + "auth.js");
  assert.equal(moneyReauthMode({}), "window");
  assert.equal(moneyReauthMode({ OPN_ALLOW_LIVE: "true" }), "inline");
  assert.equal(moneyReauthMode({ OPN_ALLOW_LIVE: "true", MONEY_REAUTH: "window" }), "window");
  assert.equal(moneyReauthMode({ MONEY_REAUTH: "inline" }), "inline");
  const { A, signIn, env } = await setup({ MONEY_REAUTH: "inline" });
  const m = await signIn();
  const uid = await memberId(env, m.user && m.user.id);
  assert.equal((await A("/reauth", { method: "POST", body: { password: ADMIN_PW } })).status, 200);
  const w = await A(`/members/${uid}/grant`, { method: "POST", body: { plan_id: "plus", days: 7 } });
  assert.equal(w.status, 403); assert.equal(w.j.code, "reauth_inline_required");
  assert.equal((await A(`/members/${uid}/grant`, { method: "POST", body: { plan_id: "plus", days: 7, password: "wrong password here" } })).j.code, "reauth_failed");
  assert.equal((await A(`/members/${uid}/grant`, { method: "POST", body: { plan_id: "plus", days: 7, password: ADMIN_PW } })).status, 201);
  // non-money edits still accept the sudo window
  assert.equal((await A("/billing/settings", { method: "PUT", body: { pricing_page_enabled: true } })).status, 200);
  assert.ok((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'reauth.failed' AND detail LIKE '%inline%'").first()).n >= 1);
});

// ---- IPv6 /64 ----------------------------------------------------------------------------------------------------------

test("R12 caller keys: IPv6 callers are keyed on their /64 (rotating the interface id buys no new bucket)", async () => {
  const { ipv6Prefix64 } = await import(B + "util.js");
  assert.equal(ipv6Prefix64("203.0.113.7"), "203.0.113.7");
  assert.equal(ipv6Prefix64("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assert.equal(ipv6Prefix64("2001:DB8:0001:0002::1"), "2001:db8:1:2::/64");
  assert.equal(ipv6Prefix64("::ffff:198.51.100.9"), "198.51.100.9");
  assert.equal(ipv6Prefix64("2001:db8::"), "2001:db8:0:0::/64");
  assert.equal(ipv6Prefix64("64:ff9b::192.0.2.1"), "64:ff9b:0:0::/64");
  assert.equal(ipv6Prefix64("not-an-ip"), "not-an-ip");
  const { call, env } = await setup({ BILLING_ENABLED: "false" });
  const { callerHash } = await import(B + "store.js");
  const h = ip => callerHash(env, req("/x", { ip }), "t");
  assert.equal(await h("2001:db8:1:2::1"), await h("2001:db8:1:2:ffff::9"));
  assert.notEqual(await h("2001:db8:1:2::1"), await h("2001:db8:1:3::1"));
  // sign-in limit (10 per caller per 15 min) holds across rotating addresses of one /64
  let last;
  for (let i = 1; i <= 11; i++) last = await call("/api/auth/google", { method: "POST", ip: `2001:db8:77:1::${i.toString(16)}`, headers: { "X-Turnstile-Token": "good:signin" }, body: {} });
  assert.equal(last.status, 429);
  assert.notEqual((await call("/api/auth/google", { method: "POST", ip: "2001:db8:77:2::1", headers: { "X-Turnstile-Token": "good:signin" }, body: {} })).status, 429, "another /64 is another caller");
});

// ---- short sessions + refresh ---------------------------------------------------------------------------------------------

test("R12 member sessions: optional short token (12 h / 1 h idle) rotated by /api/auth/refresh; long stays the default", async () => {
  const { env, call, signIn } = await setup();
  const { SHORT_SESSION_TTL, SHORT_SESSION_IDLE, SHORT_SESSION_CHAIN } = await import(B + "members.js");
  const long = await signIn();
  assert.equal(long.session, "long"); assert.ok(long.expires_at - nowS() > 29 * 86400);
  const n = await call("/api/auth/nonce", { method: "POST", body: {} });
  const s = (await call("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: jwt(claims({ nonce: n.j.nonce, sub: "7777", email: "s@example.test" })), nonce: n.j.nonce, accept_terms: true, consent_version: "m1", session: "short" } })).j;
  assert.equal(s.session, "short"); assert.equal(s.idle_timeout, SHORT_SESSION_IDLE); assert.ok(s.expires_at - nowS() <= SHORT_SESSION_TTL);
  assert.equal((await call("/api/me", { token: s.token })).status, 200);
  // refresh: new token works, the old one is dead at once
  const r = await call("/api/auth/refresh", { method: "POST", token: s.token, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.j)); assert.notEqual(r.j.token, s.token);
  assert.equal((await call("/api/me", { token: s.token })).status, 401);
  assert.equal((await call("/api/me", { token: r.j.token })).status, 200);
  const list = (await call("/api/me/sessions", { token: r.j.token })).j.sessions;
  assert.equal(list.find(x => x.current).kind, "short");
  // idle for more than an hour: signed out
  await env.DB.prepare("UPDATE member_sessions SET last_seen = last_seen - ?1 WHERE kind = 'short'").bind(SHORT_SESSION_IDLE + 10).run();
  assert.equal((await call("/api/me", { token: r.j.token })).status, 401);
  // a long session refreshes too (keeps its expiry); a short chain ends SHORT_SESSION_CHAIN after sign-in
  const lr = await call("/api/auth/refresh", { method: "POST", token: long.token, body: {} });
  assert.equal(lr.status, 200); assert.equal(lr.j.expires_at, long.expires_at);
  const n2 = await call("/api/auth/nonce", { method: "POST", body: {} });
  const s2 = (await call("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: jwt(claims({ nonce: n2.j.nonce, sub: "7778", email: "s2@example.test" })), nonce: n2.j.nonce, accept_terms: true, consent_version: "m1", session: "short" } })).j;
  await env.DB.prepare("UPDATE member_sessions SET signed_in_at = ?1 WHERE kind = 'short'").bind(nowS() - SHORT_SESSION_CHAIN + 30).run();
  const end = await call("/api/auth/refresh", { method: "POST", token: s2.token, body: {} });
  assert.equal(end.status, 401); assert.equal(end.j.code, "session_chain_ended");
});

// ---- transactional e-mail ------------------------------------------------------------------------------------------------

function withMail(net) {
  const sent = [];
  const orig = net.fetch;
  net.fetch = async (url, init = {}) => {
    if (String(url) === "https://api.resend.com/emails") { sent.push({ auth: init.headers.Authorization, ...JSON.parse(String(init.body)) }); return new Response(JSON.stringify({ id: "re_" + sent.length })); }
    return orig(url, init);
  };
  return sent;
}
const MAIL = { MAIL_PROVIDER: "resend", MAIL_FROM: "LENSIQ <billing@example.test>", MAIL_API_KEY: "re_test_placeholder", SITE_URL: "https://site.example" };

test("R12 mail: receipt notice once per payment (webhook retries do not resend), opt-out respected, nothing stored but the outcome", async () => {
  const { env, net, signIn, co, pay, call, A } = await setup({ ...BILLING, ...MAIL });
  const sent = withMail(net);
  const m = await signIn();
  const c = await co({ plan_id: "plus" }, { token: m.token, headers: { "Idempotency-Key": "mail-key-000001" } });
  await pay(c.j.payment_id, "evnt_test_mail000001");
  await pay(c.j.payment_id, "evnt_test_mail000002");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0], m.user.email); assert.match(sent[0].subject, /LQ-\d{6}-\d{6}/); assert.match(sent[0].text, /ใบเสร็จ/); assert.match(sent[0].text, /Receipt|receipt/); assert.match(sent[0].text, /收据/);
  assert.match(sent[0].text, /https:\/\/site\.example\/account\.html/); assert.doesNotMatch(sent[0].text, /token|password/i);
  const log = await env.DB.prepare("SELECT * FROM mail_log WHERE kind = 'receipt'").first();
  assert.equal(log.status, "sent"); assert.equal(log.provider_id, "re_1"); assert.equal(log.ref, c.j.payment_id);
  assert.ok(!Object.values(log).some(v => String(v).includes("@")), "no address in the log");
  // opt out of receipt e-mails: the next payment is logged as skipped, the receipt is still in the account
  const pr = await call("/api/me/preferences", { method: "POST", token: m.token, body: { email_receipts: false } });
  assert.equal(pr.status, 200); assert.equal(pr.j.email_receipts, false); assert.equal(pr.j.email_reminders, true);
  assert.equal((await call("/api/me/preferences", { method: "POST", token: m.token, body: { email_receipts: "no" } })).status, 400);
  assert.equal((await call("/api/me/preferences", { method: "POST", token: m.token, body: { marketing_opt_in: true } })).j.marketing_opt_in, true, "old contract unchanged");
  const c2 = await co({ plan_id: "plus" }, { token: m.token, headers: { "Idempotency-Key": "mail-key-000002" } });
  await pay(c2.j.payment_id, "evnt_test_mail000003");
  assert.equal(sent.length, 1);
  assert.equal((await env.DB.prepare("SELECT status FROM mail_log WHERE ref = ?1").bind(c2.j.payment_id).first()).status, "skipped_opt_out");
  assert.equal((await call(`/api/me/payments/${c2.j.payment_id}/receipt?format=json`, { token: m.token })).status, 200);
  const adm = await A("/mail");
  assert.equal(adm.j.status.configured, true); assert.equal(adm.j.status.key_set, true); assert.ok(!JSON.stringify(adm.j).includes("re_test_placeholder"));
  assert.equal(adm.j.mail.length, 2);
});

test("R12 mail: not configured = logged as skipped; renewal reminder once per period; erasure unlinks the log", async () => {
  const off = await setup(BILLING);
  const m0 = await off.signIn();
  const c0 = await off.co({ plan_id: "plus" }, { token: m0.token });
  await off.pay(c0.j.payment_id);
  assert.equal((await off.env.DB.prepare("SELECT status FROM mail_log").first()).status, "skipped_not_configured");

  const { env, net, signIn, call, A, fresh } = await setup({ ...MAIL });
  const sent = withMail(net);
  const m = await signIn();
  const uid = await memberId(env);
  assert.equal((await A(`/members/${uid}/grant`, { method: "POST", body: { plan_id: "plus", days: 2, password: ADMIN_PW } })).status, 201);
  const { runMaintenance } = await import(B + "retention.js");
  const r1 = await runMaintenance(env, undefined, net.fetch);
  assert.equal(r1.reminders.sent, 1);
  await runMaintenance(env, undefined, net.fetch);
  assert.equal(sent.length, 1, "one reminder per subscription period");
  assert.match(sent[0].text, /ไม่ต่ออายุอัตโนมัติ/); assert.match(sent[0].text, /do not renew automatically/); assert.match(sent[0].text, /不会自动续订/);
  const ex = await call("/api/me/export", { method: "POST", token: m.token, body: await fresh(m) });
  assert.equal(ex.j.email_notices.length, 1); assert.deepEqual(ex.j.email_preferences, { receipts: true, reminders: true });
  const del = await call("/api/me", { method: "DELETE", token: m.token, body: { confirm: "DELETE", ...(await fresh(m)) } });
  assert.equal(del.status, 200, JSON.stringify(del.j));
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM mail_log WHERE user_id IS NOT NULL").first()).n, 0);
});

// ---- CSP reports ---------------------------------------------------------------------------------------------------------

test("R12 CSP reports: both formats stored as day counters (origin + path only), capped, shown to the admin", async () => {
  const { env, call, A } = await setup();
  const legacy = JSON.stringify({ "csp-report": { "document-uri": "https://site.example/account.html?token=SECRET#x", "violated-directive": "script-src-elem", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?q=1", "script-sample": "alert(document.cookie)" } });
  const r = await call("/v1/csp-report", { method: "POST", origin: null, body: legacy, headers: { "Content-Type": "application/csp-report" } });
  assert.equal(r.status, 204);
  const modern = JSON.stringify([{ type: "csp-violation", body: { documentURL: "https://site.example/account.html", effectiveDirective: "script-src-elem", blockedURL: "https://evil.example/y.js" } }, { type: "deprecation", body: {} },
    { type: "csp-violation", body: { documentURL: "https://other.example/p", effectiveDirective: "img-src", blockedURL: "inline" } }]);
  assert.equal((await call("/v1/csp-report", { method: "POST", origin: null, body: modern, headers: { "Content-Type": "application/reports+json" } })).status, 204);
  const rows = (await env.DB.prepare("SELECT * FROM csp_reports ORDER BY n DESC").all()).results;
  assert.deepEqual(rows.map(x => [x.directive, x.blocked, x.page, x.n]), [["script-src-elem", "https://evil.example", "/account.html", 2], ["img-src", "inline", "other-origin", 1]]);
  assert.ok(!JSON.stringify(rows).includes("SECRET") && !JSON.stringify(rows).includes("cookie"), "no query, no sample");
  assert.equal((await call("/v1/csp-report", { method: "POST", origin: null, body: "x", headers: { "Content-Type": "text/plain" } })).status, 204, "wrong type ignored");
  for (let i = 0; i < 62; i++) await call("/v1/csp-report", { method: "POST", origin: null, ip: "198.51.100.44", body: legacy, headers: { "Content-Type": "application/csp-report" } });
  assert.equal((await env.DB.prepare("SELECT n FROM csp_reports WHERE page = '/account.html'").first()).n, 2 + 60, "per-caller cap (60 / h)");
  const adm = await A("/csp-reports?days=1");
  assert.equal(adm.status, 200); assert.equal(adm.j.reports[0].blocked, "https://evil.example");
  const { ADMIN_PAGE_HEADERS } = await import(B + "index.js");
  assert.match(ADMIN_PAGE_HEADERS["Content-Security-Policy"], /report-uri \/v1\/csp-report/);
});

test("R12 migration 0009 is applied and listed for /health/deep", async () => {
  const { MIGRATIONS, deepHealth } = await import(B + "health.js");
  assert.ok(MIGRATIONS.includes("0009_round12_backend.sql"));
  const h = await deepHealth(createEnv());
  assert.equal(h.ok, true); assert.deepEqual(h.migrations.missing, []);
});
