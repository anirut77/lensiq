"use strict";
// tests/unit/backend-fulfilment-refunds.test.js — round 11 backend fixes: atomic + self-healing fulfilment (D1 failure injected),
// admin re-auth rate limit / sudo window / owner TOTP, partial refunds + per-payment revocation + credit notes, quota
// tombstone across erasure, go-live gate, B2B leads inbox, renewal reminder data, age-of-majority at checkout,
// configurable reconcile batch, /health/deep, scheduled() error handling, perk consumers.
// Everything is local: in-memory D1, locally generated RSA keys, mocked Google / Turnstile / Opn / Anthropic.
const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { generateKeyPairSync, createSign, createHmac } = require("node:crypto");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const ROOT = join(__dirname, "..", "..");
const CLIENT_ID = "test-client.apps.example";
const TEST_KEY = "skey_test_5xyzabcdefghijklmnop";
const LIVE_KEY = "skey_5xyzabcdefghijklmnop";
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
const READY = { SELLER_NAME: "บริษัท เลนส์ไอคิว จำกัด", SELLER_TAX_ID: "0105500000000", SELLER_ADDRESS: "กรุงเทพฯ 10110", LEGAL_TERMS_READY: "true", LEGAL_PRIVACY_READY: "true" };

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
    const n = await call("/api/auth/nonce", { method: "POST", body: {} });
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

/** Wraps env.DB so the next `times` statements whose SQL matches `re` throw (like a D1 error inside a batch). */
function injectFailure(env, re, times = 1) {
  const orig = env.DB.prepare;
  let left = times;
  env.DB.prepare = sql => {
    const st = orig(sql);
    if (!re.test(sql)) return st;
    const wrap = s => {
      const b = s.bind.bind(s);
      s.bind = (...a) => wrap(b(...a));
      const run = s._runSync.bind(s);
      s._runSync = () => { if (left > 0) { left--; throw new Error("D1_ERROR: injected failure"); } return run(); };
      return s;
    };
    return wrap(st);
  };
  return () => { env.DB.prepare = orig; };
}

const openAlerts = async env => (await env.DB.prepare("SELECT kind, ref FROM alerts WHERE acknowledged_at IS NULL ORDER BY id").all()).results;

// ------------------------------------------------------------------------------------------------ P0 fulfilment

test("P0 fulfilment: a D1 failure while granting rolls back the whole success — retry webhook grants the plan; alert raised", async () => {
  const { co, signIn, pay, call, env } = await setup(BILLING);
  const s = await signIn();
  const c = await co({ plan_id: "plus" }, { token: s.token });
  assert.equal(c.status, 201, JSON.stringify(c.j));
  const restore = injectFailure(env, /INSERT INTO subscriptions/);
  const first = await pay(c.j.payment_id, "evnt_test_fail000001");
  restore();
  assert.equal(first.status, 503, "first webhook fails (Opn will retry)");
  const p1 = await env.DB.prepare("SELECT status, receipt_no, fulfilled_at FROM payments WHERE id = ?1").bind(c.j.payment_id).first();
  assert.deepEqual([p1.status, p1.receipt_no, p1.fulfilled_at], ["pending", null, null], "rolled back: not 'successful but nothing granted'");
  assert.deepEqual((await openAlerts(env)).map(a => a.kind), ["fulfilment_failed"]);
  const retry = await pay(c.j.payment_id, "evnt_test_fail000001");
  assert.equal(retry.status, 200); assert.equal(retry.j.result, "successful");
  const p2 = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(c.j.payment_id).first();
  assert.equal(p2.status, "successful"); assert.ok(p2.fulfilled_at); assert.match(p2.receipt_no, /^LQ-\d{6}-000001$/);
  assert.equal(p2.ext_seconds, 30 * 86400); assert.ok(p2.subscription_id);
  assert.equal((await call("/api/me", { token: s.token })).j.tier, "plus", "the customer got what they paid for");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions").first()).n, 1);
  // a further duplicate delivery changes nothing
  assert.equal((await pay(c.j.payment_id, "evnt_test_fail000002")).j.result, "successful");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions").first()).n, 1);
});

test("P0 fulfilment: one-time credits fail mid-batch -> nothing half-granted; reconcile cron settles it", async () => {
  const { co, signIn, net, call, env } = await setup(BILLING);
  const s = await signIn();
  const c = await co({ plan_id: "report_annual" }, { token: s.token });
  const p = await env.DB.prepare("SELECT provider_charge_id FROM payments WHERE id = ?1").bind(c.j.payment_id).first();
  net.charges.get(p.provider_charge_id).status = "successful";
  const { reconcilePending } = await import(B + "billing.js");
  const restore = injectFailure(env, /INSERT INTO credits/, 1); // the SECOND credit row (report credit or AI credits) fails
  const r1 = await reconcilePending(env, { fetchImpl: net.fetch });
  restore();
  assert.equal(r1.errors, 1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM credits").first()).n, 0, "no partial grant");
  assert.equal((await env.DB.prepare("SELECT status FROM payments WHERE id = ?1").bind(c.j.payment_id).first()).status, "pending");
  const r2 = await reconcilePending(env, { fetchImpl: net.fetch });
  assert.equal(r2.changed, 1);
  assert.deepEqual((await call("/api/me", { token: s.token })).j.credits, { ai_reading: 3, report_annual: 1 });
});

test("P0 repair: a successful payment without fulfilment (legacy) is repaired by webhook retry, poll and cron — once, with an alert", async () => {
  const { co, signIn, net, call, env, webhook, A } = await setup({ ...BILLING, ALERT_WEBHOOK_URL: "https://hooks.example/lensiq" });
  const s = await signIn();
  const c = await co({ plan_id: "plus" }, { token: s.token });
  const p = await env.DB.prepare("SELECT provider_charge_id FROM payments WHERE id = ?1").bind(c.j.payment_id).first();
  net.charges.get(p.provider_charge_id).status = "successful";
  // simulate the pre-round-11 bug: status flipped, nothing granted
  await env.DB.prepare("UPDATE payments SET status = 'successful', paid_at = ?1, receipt_no = 'LQ-202611-000009' WHERE id = ?2").bind(nowS(), c.j.payment_id).run();
  assert.equal((await call("/api/me", { token: s.token })).j.tier, "member");
  const w = await webhook(p.provider_charge_id, "evnt_test_repair0001");
  assert.equal(w.status, 200); assert.equal(w.j.result, "successful");
  assert.equal((await call("/api/me", { token: s.token })).j.tier, "plus", "repaired on the webhook retry");
  assert.deepEqual((await openAlerts(env)).map(a => a.kind), ["fulfilment_repaired"]);
  assert.equal(net.pushes.length, 1, "pushed to ALERT_WEBHOOK_URL"); assert.match(net.pushes[0].text, /repair/); assert.ok(!JSON.stringify(net.pushes[0]).includes("@"), "no personal data in the push");
  const { reconcilePending } = await import(B + "billing.js");
  assert.equal((await reconcilePending(env, { fetchImpl: net.fetch })).repaired, 0, "already fulfilled: not granted twice");
  const sub = await env.DB.prepare("SELECT current_period_end, current_period_start FROM subscriptions").first();
  assert.equal(sub.current_period_end - sub.current_period_start, 30 * 86400, "one period, not two");
  // cron path: a second broken payment is repaired by the reconcile cron
  const c2 = await co({ plan_id: "report_basic" }, { token: s.token });
  await env.DB.prepare("UPDATE payments SET status = 'successful', paid_at = ?1 WHERE id = ?2").bind(nowS(), c2.j.payment_id).run();
  const r = await reconcilePending(env, { fetchImpl: net.fetch });
  assert.equal(r.repaired, 1);
  assert.equal((await call("/api/me", { token: s.token })).j.credits.report_basic, 1);
  assert.equal((await A("/billing/payments")).j.unfulfilled, 0);
  // poll path
  const c3 = await co({ plan_id: "report_compat" }, { token: s.token });
  await env.DB.prepare("UPDATE payments SET status = 'successful', paid_at = ?1 WHERE id = ?2").bind(nowS(), c3.j.payment_id).run();
  assert.equal((await call(`/v1/billing/payments/${c3.j.payment_id}`)).j.status, "successful");
  assert.equal((await call("/api/me", { token: s.token })).j.credits.report_compat, 1);
});

test("P0 race: webhook, poll and cron applying the same success concurrently grant exactly once", async () => {
  const { co, signIn, net, call, env } = await setup(BILLING);
  const s = await signIn();
  const c = await co({ plan_id: "report_annual" }, { token: s.token });
  const pRow = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(c.j.payment_id).first();
  const { applyCharge } = await import(B + "billing.js");
  const ch = { status: "successful", amount: pRow.amount_satang, currency: "thb" };
  await Promise.all([applyCharge(env, pRow, ch), applyCharge(env, pRow, ch), applyCharge(env, pRow, ch)]);
  assert.deepEqual((await call("/api/me", { token: s.token })).j.credits, { ai_reading: 3, report_annual: 1 });
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM credits").first()).n, 2);
  void net;
});

// ------------------------------------------------------------------------------------------------ P0 re-auth

test("P0 re-auth: 5 wrong passwords per session per 15 min -> 429; 10 in one session -> session revoked; every failure audited", async () => {
  const { A, env } = await setup();
  const tok = (await A("/me")) && null;
  void tok;
  for (let i = 0; i < 5; i++) {
    const r = await A("/retention/run", { method: "POST", body: { password: "wrong password " + i } });
    assert.equal(r.status, 403, "attempt " + (i + 1)); assert.equal(r.j.code, "reauth_failed");
  }
  const limited = await A("/retention/run", { method: "POST", body: { password: ADMIN_PW } });
  assert.equal(limited.status, 429, "even the right password waits once the per-session limit is hit");
  assert.ok(limited.r.headers.get("Retry-After"));
  assert.equal((await A("/password", { method: "POST", body: { current: "x".repeat(12), next: "another long passphrase" } })).status, 429, "password change shares the limit");
  // next window (simulated): the session-wide counter keeps counting and revokes at 10
  await env.DB.prepare("DELETE FROM rate_limits WHERE key LIKE 'reauth:%'").run();
  for (let i = 0; i < 4; i++) assert.equal((await A("/password", { method: "POST", body: { current: "wrong-" + i + "-passphrase", next: "another long passphrase" } })).status, 403);
  const revoked = await A("/members/" + "a".repeat(32) + "/status", { method: "POST", body: { status: "disabled", password: "still wrong pass" } });
  assert.equal(revoked.status, 401); assert.equal(revoked.j.code, "reauth_revoked");
  assert.equal((await A("/me")).status, 401, "session is gone");
  const fails = (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'reauth.failed'").first()).n;
  assert.equal(fails, 10, "every failure audited");
  assert.ok((await env.DB.prepare("SELECT 1 FROM audit_log WHERE action = 'reauth.session_revoked'").first()));
});

test("P0 re-auth: price / plan / settings / membership / AI-key edits need re-auth; sudo window; password + totp stripped", async () => {
  const { A, env } = await setup();
  const edits = [
    ["PUT", "/billing/plans/plus", { price_month_satang: 15900 }],
    ["POST", "/billing/plans", { id: "report_x", name_th: "ก", name_en: "X", kind: "one_time", price_once_satang: 5000 }],
    ["PUT", "/billing/settings", { pricing_page_enabled: true }],
    ["PUT", "/membership", { settings: { member_ai_daily: 4 } }],
    ["PUT", "/ai/key", { key: "sk-ant-" + "a".repeat(40) }],
    ["DELETE", "/ai/key", undefined]
  ];
  for (const [m, path, body] of edits) {
    const r = await A(path, { method: m, body: body === undefined ? {} : body });
    assert.equal(r.status, 403, `${m} ${path} without re-auth`); assert.equal(r.j.code, "reauth_required");
  }
  // inline body re-auth (validators never see the password: no "unknown field")
  const inl = await A("/billing/plans/plus", { method: "PUT", body: { password: ADMIN_PW, price_month_satang: 15900 } });
  assert.equal(inl.status, 200, JSON.stringify(inl.j));
  assert.equal((await A("/billing/plans/plus", { method: "PUT", body: { price_month_satang: 16900 } })).status, 403, "inline re-auth opens no window");
  const w = await A("/reauth", { method: "POST", body: { password: ADMIN_PW } });
  assert.equal(w.status, 200); assert.equal(w.j.valid_for, 300);
  for (const [m, path, body] of edits) {
    const r = await A(path, { method: m, body: body === undefined ? {} : body });
    assert.ok(r.status < 300, `${m} ${path} in the sudo window: ${r.status} ${JSON.stringify(r.j)}`);
  }
  // window expires
  await env.DB.prepare("UPDATE admin_sessions SET reauth_at = reauth_at - 301").run();
  assert.equal((await A("/billing/settings", { method: "PUT", body: { pricing_page_enabled: false } })).status, 403);
  const acts = (await env.DB.prepare("SELECT action FROM audit_log").all()).results.map(r => r.action);
  assert.ok(acts.includes("reauth.ok") && acts.includes("reauth.failed"));
});

test("P0 owner TOTP: money ops refused while billing / live keys are on and TOTP is off (REQUIRE_OWNER_TOTP too)", async () => {
  const { A, signIn } = await setup({ REQUIRE_OWNER_TOTP: "true" });
  const s = await signIn();
  const r = await A(`/members/${s.user.id}/grant`, { method: "POST", body: { password: ADMIN_PW, feature: "report_basic", credits: 1 } });
  assert.equal(r.status, 403); assert.equal(r.j.code, "owner_totp_required");
  const f = await setup(); // billing off, no REQUIRE_OWNER_TOTP: password is enough (unchanged)
  const fs = await f.signIn();
  assert.equal((await f.A(`/members/${fs.user.id}/grant`, { method: "POST", body: { password: ADMIN_PW, feature: "report_basic", credits: 1 } })).status, 201);
});

// ------------------------------------------------------------------------------------------------ P1 refunds

test("P1 refunds: 1 THB of a 199 THB report is partial and revokes nothing; the rest completes it and revokes the credits", async () => {
  const { co, signIn, pay, call, A, sudo } = await setup(BILLING);
  const s = await signIn();
  const c = await co({ plan_id: "report_annual" }, { token: s.token });
  await pay(c.j.payment_id);
  await sudo();
  const r1 = await A(`/billing/payments/${c.j.payment_id}/refund`, { method: "POST", body: { reference: "KBANK-1", amount_satang: 100 } });
  assert.equal(r1.status, 200, JSON.stringify(r1.j));
  assert.deepEqual([r1.j.status, r1.j.credits_revoked, r1.j.remaining_refundable_satang], ["partially_refunded", 0, 19800]);
  assert.deepEqual((await call("/api/me", { token: s.token })).j.credits, { ai_reading: 3, report_annual: 1 }, "access still paid for is kept");
  assert.equal((await A(`/billing/payments/${c.j.payment_id}/refund`, { method: "POST", body: { reference: "KBANK-2", amount_satang: 19801 } })).status, 400, "cannot refund more than is left");
  const half = await A(`/billing/payments/${c.j.payment_id}/refund`, { method: "POST", body: { reference: "KBANK-2", amount_satang: 9900 } });
  assert.deepEqual([half.j.status, half.j.credits_revoked], ["partially_refunded", 1], "half: floor(3 × ½) AI credits back, the report stays");
  const rest = await A(`/billing/payments/${c.j.payment_id}/refund`, { method: "POST", body: { reference: "KBANK-3" } });
  assert.deepEqual([rest.j.status, rest.j.refund_satang, rest.j.refunded_total_satang], ["refunded", 9900, 19900]);
  assert.deepEqual((await call("/api/me", { token: s.token })).j.credits, {}, "fully refunded: this payment's credits are gone");
  const det = await A(`/billing/payments/${c.j.payment_id}`);
  assert.equal(det.j.refunds.length, 3); assert.equal(det.j.payment.fulfil_token, undefined, "claim tokens not exposed");
  assert.equal(det.j.refunds[0].credit_note_no, null, "not VAT registered: no credit note");
  const h = await call("/api/me/history", { token: s.token });
  assert.equal(h.j.ledger.filter(x => x.kind === "refund").length, 3);
  assert.match(await (await call(`/api/me/payments/${c.j.payment_id}/receipt`, { token: s.token })).r.text(), /คืนเงินแล้ว/);
});

test("P1 refunds: refunding a 149 THB renewal keeps the paid 990 THB year (only its own 30 days removed)", async () => {
  const { co, signIn, pay, call, A, sudo, env } = await setup(BILLING);
  const s = await signIn();
  const y = await co({ plan_id: "plus", period: "year" }, { token: s.token });
  await pay(y.j.payment_id);
  const m = await co({ plan_id: "plus", period: "month" }, { token: s.token });
  await pay(m.j.payment_id);
  const before = (await env.DB.prepare("SELECT * FROM subscriptions").first());
  assert.equal(before.current_period_end - before.current_period_start, 395 * 86400);
  await sudo();
  const r = await A(`/billing/payments/${m.j.payment_id}/refund`, { method: "POST", body: { reference: "SCB-77" } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.deepEqual([r.j.status, r.j.subscription_cancelled, r.j.subscription_seconds_removed], ["refunded", false, 30 * 86400]);
  const after = await env.DB.prepare("SELECT * FROM subscriptions").first();
  assert.equal(after.status, "active"); assert.equal(after.current_period_end, before.current_period_end - 30 * 86400);
  assert.equal((await call("/api/me", { token: s.token })).j.tier, "plus", "the paid year is kept");
  // explicit cancel_subscription:true keeps the old "cancel everything" behaviour available
  const all = await A(`/billing/payments/${y.j.payment_id}/refund`, { method: "POST", body: { reference: "SCB-78", amount_satang: 1000, cancel_subscription: true } });
  assert.deepEqual([all.j.status, all.j.subscription_cancelled], ["partially_refunded", true]);
  assert.equal((await call("/api/me", { token: s.token })).j.tier, "member");
});

test("P1 credit notes: refunds of a VAT tax invoice get gap-free CN numbers and a printable ใบลดหนี้ (admin + member)", async () => {
  const { co, signIn, pay, call, A, sudo } = await setup({ ...BILLING, VAT_REGISTERED: "true", ...READY });
  const s = await signIn();
  const c = await co({ plan_id: "plus", period: "year", buyer: { name: "ร้านตัวอย่าง", tax_id: "1234567890123", address: "เชียงใหม่" } }, { token: s.token });
  await pay(c.j.payment_id);
  await sudo();
  const r1 = await A(`/billing/payments/${c.j.payment_id}/refund`, { method: "POST", body: { reference: "KBANK-9", amount_satang: 10700, note: "ลดราคาตามโปรโมชัน" } });
  assert.equal(r1.status, 200, JSON.stringify(r1.j));
  assert.match(r1.j.credit_note_no, /^CN-\d{6}-000001$/);
  const r2 = await A(`/billing/payments/${c.j.payment_id}/refund`, { method: "POST", body: { reference: "KBANK-10", amount_satang: 10700 } });
  assert.match(r2.j.credit_note_no, /^CN-\d{6}-000002$/);
  const j = await A(`/billing/payments/${c.j.payment_id}/refunds/${r1.j.refund_id}/credit-note?format=json`);
  assert.equal(j.status, 200, JSON.stringify(j.j));
  assert.deepEqual([j.j.difference_satang, j.j.vat_on_difference_satang, j.j.difference_ex_vat_satang], [10700, 700, 10000]);
  assert.equal(j.j.original.value_satang, 99000); assert.equal(j.j.correct_value_satang, 88300); assert.equal(j.j.draft, false);
  const j2 = await A(`/billing/payments/${c.j.payment_id}/refunds/${r2.j.refund_id}/credit-note?format=json`);
  assert.equal(j2.j.original.value_satang, 88300, "second note starts from the value after the first");
  const html = await (await call(`/api/me/payments/${c.j.payment_id}/refunds/${r1.j.refund_id}/credit-note`, { token: s.token })).r.text();
  assert.match(html, /ใบลดหนี้/); assert.match(html, /Credit note/); assert.match(html, /贷项通知单/); assert.match(html, /ลดราคาตามโปรโมชัน/);
  assert.doesNotMatch(html, /<script/i);
  const other = await signIn();
  assert.equal((await call(`/api/me/payments/${c.j.payment_id}/refunds/${r1.j.refund_id}/credit-note`, { token: other.token })).status, 404, "only the buyer");
});

// ------------------------------------------------------------------------------------------------ P1 tombstone

test("P1 tombstone: delete + re-join with the same Google account keeps today's used AI quota; another account is unaffected", async () => {
  const { signIn, fresh, call, ai, env } = await setup({ FREE_MODE: "false" });
  const s = await signIn({ sub: "777001" });
  for (let i = 0; i < 3; i++) assert.equal((await ai({ token: s.token })).status, 200);
  assert.equal((await ai({ token: s.token })).status, 429);
  assert.equal((await call("/api/me", { method: "DELETE", token: s.token, body: { confirm: "DELETE", ...(await fresh(s)) } })).status, 200);
  const tomb = await env.DB.prepare("SELECT subject, n FROM usage_counters WHERE subject LIKE 'x:%'").first();
  assert.ok(tomb, "tombstone written"); assert.equal(tomb.n, 3); assert.match(tomb.subject, /^x:[a-f0-9]{32}$/);
  assert.ok(!tomb.subject.includes("777001"), "pseudonym, not the Google sub");
  const again = await signIn({ sub: "777001" });
  assert.equal(again.created, true, "a new account");
  const r = await ai({ token: again.token });
  assert.equal(r.status, 429, "quota not reset by delete-and-re-join"); assert.equal(r.j.code, "quota");
  const other = await signIn({ sub: "777002" });
  assert.equal((await ai({ token: other.token })).status, 200);
  // retention: tombstones live only for their Bangkok day
  const yesterday = new Date((nowS() + 7 * 3600 - 86400) * 1000).toISOString().slice(0, 10);
  await env.DB.prepare("UPDATE usage_counters SET day = ?1 WHERE subject LIKE 'x:%'").bind(yesterday).run();
  const { purge } = await import(B + "retention.js");
  assert.equal((await purge(env)).quota_tombstones, 1);
});

// ------------------------------------------------------------------------------------------------ go-live gate

test("go-live gate: enforce mode blocks checkout + new sign-ins until seller / legal / owner TOTP are ready; live money always", async () => {
  const g = await setup({ ...BILLING, GO_LIVE_GATE: "enforce" });
  const blocked = await g.signIn();
  assert.equal(blocked.status, 503); assert.equal(blocked.code, "go_live_blocked");
  const st = await g.A("/state");
  assert.equal(st.j.go_live.ok, false);
  assert.deepEqual(st.j.go_live.problems.map(p => p.code).sort(), ["legal_not_ready", "owner_totp_off", "seller_missing"]);
  assert.equal((await g.call("/admin/api/state")).j.go_live, undefined, "anonymous /state stays minimal");
  assert.equal((await g.co({ plan_id: "plus" })).j.code, "go_live_blocked");
  // ready: seller + legal + owner TOTP
  const r = await setup({ ...BILLING, GO_LIVE_GATE: "enforce", ...READY });
  await r.sudo();
  const ok = await r.A("/go-live");
  assert.equal(ok.j.ok, true, JSON.stringify(ok.j));
  const s = await r.signIn();
  assert.equal(s.status, 200);
  assert.equal((await r.co({ plan_id: "plus" }, { token: s.token })).status, 201);
  // report mode (default, staging): reported, not enforced — except live money
  const rep = await setup({ ...BILLING });
  assert.equal((await rep.signIn()).status, 200);
  assert.equal((await rep.A("/billing")).j.go_live.mode, "report");
  const live = await setup({ ...BILLING, OPN_SECRET_KEY: LIVE_KEY, OPN_ALLOW_LIVE: "true" });
  const ls = await live.signIn();
  const lc = await live.co({ plan_id: "plus" }, { token: ls.token });
  assert.equal(lc.status, 503); assert.equal(lc.j.code, "go_live_blocked", "a live charge is refused while not ready, whatever GO_LIVE_GATE says");
  // localhost + Turnstile dev bypass is a problem
  const { goLiveStatus } = await import(B + "golive.js");
  const lh = await goLiveStatus({ ...r.env, ALLOWED_ORIGINS: "http://localhost:8787,https://site.example", TURNSTILE_DISABLED_FOR_LOCAL_DEV: "true" });
  assert.ok(lh.problems.some(p => p.code === "localhost_bypass"));
});

test("wrangler.toml ships the gate in enforce mode with legal readiness false", () => {
  const toml = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
  assert.match(toml, /^GO_LIVE_GATE = "enforce"$/m);
  assert.match(toml, /^LEGAL_TERMS_READY = "false"$/m);
  assert.match(toml, /^LEGAL_PRIVACY_READY = "false"$/m);
  assert.match(toml, /^RECONCILE_BATCH = "\d+"$/m);
});

// ------------------------------------------------------------------------------------------------ leads

test("leads: Turnstile fail-closed, validation, stored with retention, admin inbox list / ack / delete, push without PII", async () => {
  const { call, A, env, net } = await setup({ ALERT_WEBHOOK_URL: "https://hooks.example/x" });
  const lead = { name: "สมชาย ใจดี", org: "ร้านตัวอย่าง", email: "Buyer@Shop.example", phone: "081-234-5678", interest: "store",
    message: "ขอเดโมหน้าร้าน", source: "index", lang: "th", consent: true };
  const post = (body, tok = "good:lead", o = {}) => call("/v1/leads", { method: "POST", headers: tok ? { "X-Turnstile-Token": tok } : {}, body, ...o });
  assert.equal((await post(lead, null)).status, 403, "no Turnstile token");
  assert.equal((await post(lead, "good:checkout")).status, 403, "wrong action");
  assert.equal((await post({ ...lead, consent: false })).j.code, "consent_required");
  assert.equal((await post({ ...lead, email: "", phone: "" })).j.code, "lead_invalid");
  assert.equal((await post({ ...lead, bogus: 1 })).status, 400);
  assert.equal((await post(lead, "good:lead", { origin: "https://evil.example" })).status, 403);
  const ok = await post(lead);
  assert.equal(ok.status, 201, JSON.stringify(ok.j));
  const row = await env.DB.prepare("SELECT * FROM leads WHERE id = ?1").bind(ok.j.id).first();
  assert.equal(row.email, "buyer@shop.example"); assert.equal(row.company, "ร้านตัวอย่าง"); assert.equal(row.product, "store"); assert.equal(row.consent_version, "l1");
  assert.ok(!Object.keys(row).some(k => /ip|agent/.test(k)), "no IP / user agent stored");
  assert.equal(net.pushes.length, 1); assert.ok(!JSON.stringify(net.pushes[0]).includes("buyer"), "push carries no personal data");
  for (let i = 0; i < 4; i++) await post(lead);
  assert.equal((await post(lead)).status, 429, "5 per caller per hour");
  const inbox = await A("/leads");
  assert.equal(inbox.j.open, 5); assert.equal(inbox.j.leads[0].name, "สมชาย ใจดี");
  assert.equal((await A(`/leads/${ok.j.id}/ack`, { method: "POST", body: {} })).status, 200);
  assert.equal((await A(`/leads/${ok.j.id}/ack`, { method: "POST", body: {} })).status, 404);
  assert.equal((await A("/leads")).j.open, 4);
  assert.equal((await A("/leads?status=acked")).j.leads.length, 1);
  const noReauth = await A(`/leads/${ok.j.id}`, { method: "DELETE", body: {} });
  assert.equal(noReauth.status, 403, "deleting a request needs re-auth (2026-11-12)"); assert.equal(noReauth.j.code, "reauth_required");
  assert.equal((await A(`/leads/${ok.j.id}`, { method: "DELETE", body: { password: ADMIN_PW } })).status, 200);
  assert.equal((await call("/admin/api/leads")).status, 401, "admin only");
  await env.DB.prepare("UPDATE leads SET created_at = created_at - 181 * 86400").run();
  const { purge } = await import(B + "retention.js");
  assert.equal((await purge(env)).leads, 4, "LEADS_DAYS (180) retention");
  const nots = await setup({ TURNSTILE_SECRET: "" });
  assert.equal((await nots.call("/v1/leads", { method: "POST", headers: { "X-Turnstile-Token": "good:lead" }, body: lead })).j.code, "turnstile_not_configured");
});

// ------------------------------------------------------------------------------------------------ renewal, age, ops

test("renewal reminder data: GET /api/me shows renewal_due within 7 days of the period end", async () => {
  const { co, signIn, pay, call, env } = await setup(BILLING);
  const s = await signIn();
  assert.equal((await call("/api/me", { token: s.token })).j.renewal_due, false);
  const c = await co({ plan_id: "plus" }, { token: s.token });
  await pay(c.j.payment_id);
  assert.equal((await call("/api/me", { token: s.token })).j.renewal_due, false, "30 days left");
  await env.DB.prepare("UPDATE subscriptions SET current_period_end = ?1").bind(nowS() + 3 * 86400 - 60).run();
  const me = await call("/api/me", { token: s.token });
  assert.equal(me.j.renewal_due, true);
  assert.deepEqual([me.j.renewal.days_left, me.j.renewal.plan_id, me.j.renewal.renew_path], [3, "plus", "/pricing.html?plan=plus"]);
});

test("age of majority: checkout needs the 20+ / guardian confirmation; a minor's birth year needs 'guardian'", async () => {
  const { co, signIn, env } = await setup(BILLING);
  const s = await signIn();
  const none = await co({ plan_id: "plus", age_confirm: undefined }, { token: s.token });
  assert.equal(none.status, 400); assert.equal(none.j.code, "age_confirmation_required");
  const y = new Date().getUTCFullYear();
  const minor = await co({ plan_id: "plus", age_confirm: "adult", birth_year: y - 15 }, { token: s.token });
  assert.equal(minor.status, 403); assert.equal(minor.j.code, "guardian_consent_required");
  const g = await co({ plan_id: "plus", age_confirm: "guardian", birth_year: y - 15 }, { token: s.token });
  assert.equal(g.status, 201, JSON.stringify(g.j));
  assert.equal((await env.DB.prepare("SELECT age_confirm FROM payments WHERE id = ?1").bind(g.j.payment_id).first()).age_confirm, "guardian");
  const a = await co({ plan_id: "report_basic", age_confirm: true, birth_year: y - 30 }, { token: s.token });
  assert.equal((await env.DB.prepare("SELECT age_confirm FROM payments WHERE id = ?1").bind(a.j.payment_id).first()).age_confirm, "adult_or_guardian");
  const { ageConfirmOf } = await import(B + "billing.js");
  assert.throws(() => ageConfirmOf({ age_confirm: "adult", birth_year: y - 20 }), /guardian/, "born 20 years ago may still be 19");
  assert.equal(ageConfirmOf({ age_confirm: "adult", birth_year: y - 21 }), "adult");
});

test("reconcile: batch size from RECONCILE_BATCH; least-recently-checked first so a backlog rotates", async () => {
  const { co, signIn, env, net } = await setup({ ...BILLING, RECONCILE_BATCH: "2" });
  const s = await signIn();
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await co({ plan_id: "report_basic" }, { token: s.token })).j.payment_id);
  await env.DB.prepare("UPDATE payments SET updated_at = updated_at - 100").run();
  const { reconcilePending } = await import(B + "billing.js");
  assert.equal((await reconcilePending(env, { fetchImpl: net.fetch })).checked, 2);
  const second = await reconcilePending(env, { fetchImpl: net.fetch });
  assert.equal(second.checked, 2);
  const seen = (await env.DB.prepare("SELECT COUNT(*) AS n FROM payments WHERE updated_at >= ?1").bind(nowS() - 5).first()).n;
  assert.equal(seen, 3, "the third payment was reached on the second run");
});

test("/health/deep: D1 reachable + migrations current; HEALTH_TOKEN protects it; MIGRATIONS matches the directory", async () => {
  const { call, env } = await setup();
  const h = await call("/health/deep");
  assert.equal(h.status, 200, JSON.stringify(h.j));
  assert.deepEqual([h.j.ok, h.j.d1, h.j.migrations.method, h.j.migrations.missing.length], [true, true, "probe", 0]);
  env.DB._raw.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)");
  env.DB._raw.exec("INSERT INTO d1_migrations (name) VALUES ('0001_init.sql')");
  const h2 = await call("/health/deep");
  assert.equal(h2.status, 503); assert.equal(h2.j.migrations.method, "d1_migrations"); assert.ok(h2.j.migrations.missing.includes("0008_round11_backend.sql"));
  const t = await setup({ HEALTH_TOKEN: "h".repeat(32) });
  assert.equal((await t.call("/health/deep")).status, 401);
  assert.equal((await t.call("/health/deep", { headers: { Authorization: "Bearer " + "h".repeat(32) } })).status, 200);
  const { MIGRATIONS } = await import(B + "health.js");
  assert.deepEqual(MIGRATIONS, readdirSync(join(ROOT, "backend", "migrations")).filter(f => f.endsWith(".sql")).sort());
});

test("scheduled(): a failing cron job is caught and logged with the error name only (no unhandled rejection)", async () => {
  const worker = (await import(B + "index.js")).default;
  const env = createEnv({ OPN_SECRET_KEY: TEST_KEY });
  const boom = new Error("SQL: SELECT secret FROM payments WHERE email = 'a@b.c'");
  env.DB = { prepare: () => { throw boom; }, batch: async () => { throw boom; } };
  const lines = [];
  const orig = console.log;
  console.log = l => lines.push(String(l));
  try {
    for (const cron of ["*/15 * * * *", "17 3 * * *"]) {
      const waits = [];
      await worker.scheduled({ cron }, env, { waitUntil: p => waits.push(p) });
      await Promise.all(waits); // would reject without .catch
    }
  } finally { console.log = orig; }
  const failed = lines.filter(l => l.includes("cron.failed"));
  assert.equal(failed.length, 2, lines.join("\n"));
  assert.ok(failed.every(l => !l.includes("secret") && !l.includes("@")), "message is never logged");
});

test("perk consumers: every active perk sold as credits is delivered by a page that calls the server check", () => {
  // eslint-disable-next-line global-require
  const constants = readFileSync(join(ROOT, "backend", "src", "constants.js"), "utf8");
  const perks = {};
  for (const m of constants.matchAll(/^\s+(\w+):\s+\{ status: "(\w+)", enforcement: "(\w+)", consumer: (null|"[^"]+")/gm)) perks[m[1]] = { status: m[2], enforcement: m[3], consumer: m[4] === "null" ? null : m[4].slice(1, -1) };
  assert.ok(Object.keys(perks).length >= 7, "perk registry parsed");
  const member = readFileSync(join(ROOT, "lensiq-member.js"), "utf8");
  assert.match(member, /\/api\/me\/entitlements\/use/, "lensiq-member.js exposes the server check");
  for (const [id, p] of Object.entries(perks)) {
    if (p.consumer) assert.ok(existsSync(join(ROOT, p.consumer)), `${id}: consumer ${p.consumer} exists`);
    if (p.status !== "active" || p.enforcement !== "credit") continue;
    assert.ok(p.consumer, `${id} is sold as a one-time credit but no page delivers it — set it to coming_soon or build the consumer`);
    const src = readFileSync(join(ROOT, p.consumer), "utf8");
    assert.ok(src.includes(`"${id}"`), `${p.consumer} handles ${id}`);
    assert.match(src, /useEntitlement|entitlements\/use/, `${p.consumer} redeems ${id} through POST /api/me/entitlements/use`);
  }
});
