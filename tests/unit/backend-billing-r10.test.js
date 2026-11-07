"use strict";
// tests/unit/backend-billing-r10.test.js — round 10 backend fixes: paid checkout really raises the member's quota,
// guest-purchase claim, final 'mismatch' state, receipts / tax invoices, admin money ops (re-auth), quota refunds and
// Bangkok days, paid buckets, sign-in DoS, one-time credits, perk registry, idempotent checkout, devices, erasure audit.
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
  const st = { charges: new Map(), n: 0, opnCalls: 0, jwksDown: false };
  st.fetch = async (url, init = {}) => {
    url = String(url);
    if (url === "https://www.googleapis.com/oauth2/v3/certs") {
      if (st.jwksDown) throw new TypeError("fetch failed: getaddrinfo ENOTFOUND");
      return new Response(JSON.stringify({ keys: [JWK] }), { headers: { "Cache-Control": "max-age=3600" } });
    }
    if (/turnstile\/v0\/siteverify$/.test(url)) {
      const p = new URLSearchParams(String(init.body));
      const [tok, action] = String(p.get("response")).split(":");
      return new Response(JSON.stringify({ success: tok === "good", action: action || "signin", hostname: "site.example" }));
    }
    const u = new URL(url);
    if (u.hostname === "api.omise.co" && u.pathname === "/charges" && init.method === "POST") {
      st.opnCalls++;
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

function fakeSdk({ fail = false } = {}) {
  class APIError extends Error {}
  const RateLimitError = class extends APIError {}, APIConnectionError = class extends APIError {};
  class Anthropic {
    constructor() {
      this.beta = { messages: { create: async () => {
        if (fail) throw new APIConnectionError("down");
        return { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ sections: [{ id: "overview", title: "ภาพรวม", paragraphs: ["จากเส้นหัวใจยาว คุณมีความรักที่มั่นคงและจริงใจต่อคนรัก"] }] }) }] };
      } } };
    }
  }
  Anthropic.APIError = APIError; Anthropic.RateLimitError = RateLimitError; Anthropic.APIConnectionError = APIConnectionError;
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
  let subN = 2000;
  const signIn = async (o = {}) => {
    const n = await call("/api/auth/nonce", { method: "POST", body: {}, ip: o.ip });
    const r = await call("/api/auth/google", { method: "POST", ip: o.ip, headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: jwt(claims({ nonce: n.j.nonce, sub: o.sub || String(++subN), email: o.email || `m${subN}@example.test` })), nonce: n.j.nonce, accept_terms: true, consent_version: "m1" } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    return r.j;
  };
  let adminTok = null;
  const A = async (path, o = {}) => {
    if (!adminTok) {
      await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
      adminTok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
    }
    return call("/admin/api" + path, { ...o, headers: { Authorization: "Bearer " + adminTok, ...(o.headers || {}) } });
  };
  const ai = (o = {}) => call("/api/fortune", { method: "POST", headers: { "X-Turnstile-Token": "good:fortune" }, body: { facts: FACTS, consent: true }, deps: { loadSdk: fakeSdk(o.sdk) }, ...o });
  const co = (body, { headers, ...o } = {}) => call("/v1/billing/checkout", { ...o, method: "POST", headers: { "X-Turnstile-Token": "good:checkout", ...(headers || {}) }, body: { period: "month", accept_terms: true, ...body } });
  const webhook = async (chargeId, id) => {
    const body = JSON.stringify({ object: "event", id, key: "charge.complete", data: { object: "charge", id: chargeId } });
    const ts = String(nowS());
    const sig = createHmac("sha256", Buffer.from(WH_SECRET, "base64")).update(`${ts}.${body}`).digest("hex");
    return call("/v1/billing/webhook/opn", { method: "POST", body, origin: null, headers: { "Omise-Signature-Timestamp": ts, "Omise-Signature": sig } });
  };
  /** Pays a pending payment at the fake provider and delivers the webhook. */
  let ev = 0;
  const pay = async paymentId => {
    const p = await env.DB.prepare("SELECT provider_charge_id FROM payments WHERE id = ?1").bind(paymentId).first();
    net.charges.get(p.provider_charge_id).status = "successful";
    return webhook(p.provider_charge_id, "evnt_test_pay" + String(++ev).padStart(6, "0"));
  };
  return { env, net, call, signIn, A, ai, co, webhook, pay };
}

// ------------------------------------------------------------------------------------------------ P0 1

test("P0-1: with billing on, checkout needs a member; a paid checkout REALLY raises the member's AI quota", async () => {
  const { co, ai, signIn, pay, call } = await setup(BILLING);
  const guest = await co({ plan_id: "plus" });
  assert.equal(guest.status, 401);
  assert.equal(guest.j.code, "member_required");
  const s = await signIn();
  for (let i = 0; i < 3; i++) assert.equal((await ai({ token: s.token })).status, 200, "member tier use " + (i + 1));
  const over = await ai({ token: s.token });
  assert.equal(over.status, 429, "member tier (3/day) is enforced when FREE_MODE=false even with membership off");
  assert.equal(over.j.code, "quota");
  const c = await co({ plan_id: "plus" }, { token: s.token });
  assert.equal(c.status, 201, JSON.stringify(c.j));
  assert.equal(c.j.amount_satang, 14900);
  assert.equal(c.j.linked_to_account, true);
  assert.equal((await pay(c.j.payment_id)).j.result, "successful");
  const me = await call("/api/me", { token: s.token });
  assert.equal(me.j.tier, "plus");
  assert.equal(me.j.paying, true);
  assert.deepEqual([me.j.quotas.ai.quota, me.j.quotas.ai.period], [30, "month"]);
  for (let i = 0; i < 5; i++) assert.equal((await ai({ token: s.token })).status, 200, "paid use " + (i + 1));
  assert.equal((await call("/api/me", { token: s.token })).j.quotas.ai.used, 5);
});

test("P0-1: legacy guest purchase (opt-in) is linked with POST /v1/billing/claim (constant-time token check)", async () => {
  const { co, signIn, pay, call, env } = await setup({ ...BILLING, ALLOW_GUEST_CHECKOUT: "true" });
  const g = await co({ plan_id: "plus" });
  assert.equal(g.status, 201);
  assert.ok(g.j.order_token && g.j.customer_id);
  await pay(g.j.payment_id);
  const s = await signIn();
  assert.equal((await call("/api/me", { token: s.token })).j.tier, "member", "not linked yet");
  assert.equal((await call("/v1/billing/claim", { method: "POST", body: { customer_id: g.j.customer_id, order_token: g.j.order_token } })).status, 401, "sign-in required");
  const bad = await call("/v1/billing/claim", { method: "POST", token: s.token, body: { customer_id: g.j.customer_id, order_token: g.j.order_token.slice(0, -2) + "xx" } });
  assert.equal(bad.status, 403); assert.equal(bad.j.code, "claim_invalid");
  assert.equal((await call("/v1/billing/claim", { method: "POST", token: s.token, body: { customer_id: "zz", order_token: "x" } })).status, 400);
  const ok = await call("/v1/billing/claim", { method: "POST", token: s.token, body: { customer_id: g.j.customer_id, order_token: g.j.order_token } });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  assert.deepEqual(ok.j.linked, { subscriptions: 1, payments: 1, credits: 0 });
  assert.equal(ok.j.plan.id, "plus");
  const me = await call("/api/me", { token: s.token });
  assert.equal(me.j.tier, "plus");
  assert.equal(me.j.quotas.ai.quota, 30);
  const h = await call("/api/me/history", { token: s.token });
  assert.ok(h.j.ledger.some(x => x.kind === "claim"), "claim row in the member history");
  assert.equal(h.j.payments.length, 1);
  assert.equal((await call("/v1/billing/claim", { method: "POST", token: s.token, body: { customer_id: g.j.customer_id, order_token: g.j.order_token } })).status, 200, "idempotent for the same member");
  const other = await signIn();
  const taken = await call("/v1/billing/claim", { method: "POST", token: other.token, body: { customer_id: g.j.customer_id, order_token: g.j.order_token } });
  assert.equal(taken.status, 409); assert.equal(taken.j.code, "claim_taken");
  // the entitlement check reads the member's plan
  const { checkEntitlement } = await import(B + "billing.js");
  assert.equal((await checkEntitlement(env, "anon", "ai_reading", { userId: s.user.id, consume: false })).plan, "plus");
  assert.equal((await checkEntitlement(env, "anon", "ai_reading", { userId: other.user.id, consume: false })).plan, "free");
  const acts = (await env.DB.prepare("SELECT action FROM audit_log").all()).results.map(r => r.action);
  assert.ok(acts.includes("billing.claim") && acts.includes("billing.claim.denied"));
});

// ------------------------------------------------------------------------------------------------ P0 2

test("P0-2: amount/currency mismatch is FINAL: status 'mismatch', webhook processed (200), audit + alert, reconcile skips", async () => {
  const { co, signIn, webhook, env, net, A } = await setup(BILLING);
  const s = await signIn();
  const c = await co({ plan_id: "plus" }, { token: s.token });
  const p = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(c.j.payment_id).first();
  const ch = net.charges.get(p.provider_charge_id);
  ch.status = "successful"; ch.amount = 100; // provider says another amount
  const w = await webhook(p.provider_charge_id, "evnt_test_mismatch1");
  assert.equal(w.status, 200, "no endless 503 retry");
  assert.equal(w.j.result, "mismatch");
  const row = await env.DB.prepare("SELECT status, failure_code, mismatch_detail, receipt_no FROM payments WHERE id = ?1").bind(p.id).first();
  assert.equal(row.status, "mismatch"); assert.equal(row.failure_code, "amount_mismatch"); assert.equal(row.receipt_no, null);
  assert.deepEqual(JSON.parse(row.mismatch_detail), { expected: 14900, amount: 100, currency: "thb", provider_status: "successful" });
  assert.ok((await env.DB.prepare("SELECT processed_at FROM webhooks WHERE event_id = 'evnt_test_mismatch1'").first()).processed_at);
  assert.equal((await webhook(p.provider_charge_id, "evnt_test_mismatch1")).j.duplicate, true);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions").first()).n, 0, "nothing activated");
  const { reconcilePending } = await import(B + "billing.js");
  assert.equal((await reconcilePending(env, { fetchImpl: net.fetch })).checked, 0, "reconcile skips mismatch");
  const al = await A("/alerts");
  assert.equal(al.j.open, 1);
  assert.equal(al.j.alerts[0].kind, "payment_mismatch");
  assert.equal(al.j.alerts[0].ref, p.id);
  assert.equal((await A("/billing")).j.open_alerts, 1);
  assert.equal((await A(`/alerts/${al.j.alerts[0].id}/ack`, { method: "POST", body: {} })).status, 200);
  assert.equal((await A("/alerts")).j.open, 0);
  assert.equal((await A("/billing/payments?status=mismatch")).j.payments.length, 1);
  assert.ok((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'payment.mismatch'").first()).n === 1);
});

// ------------------------------------------------------------------------------------------------ P1 3

test("P1-3: receipt / tax invoice HTML (TH + EN/ZH labels), VAT lines only when VAT-registered, draft until seller set", async () => {
  const seller = { VAT_REGISTERED: "true", SELLER_NAME: "บริษัท เลนส์ไอคิว จำกัด", SELLER_TAX_ID: "0105500000000", SELLER_ADDRESS: "กรุงเทพฯ 10110" };
  const { co, signIn, pay, call, A } = await setup({ ...BILLING, ...seller });
  const s = await signIn();
  const c = await co({ plan_id: "plus", buyer: { name: "<script>alert(1)</script>ร้าน", tax_id: "1234567890123", address: "เชียงใหม่" } }, { token: s.token });
  assert.equal((await call(`/api/me/payments/${c.j.payment_id}/receipt`, { token: s.token })).status, 404, "no receipt while pending");
  await pay(c.j.payment_id);
  const r = await call(`/api/me/payments/${c.j.payment_id}/receipt`, { token: s.token });
  assert.equal(r.status, 200);
  assert.match(r.r.headers.get("Content-Type"), /^text\/html/);
  assert.match(r.r.headers.get("Content-Security-Policy"), /default-src 'none'/);
  const html = await r.r.text();
  assert.match(html, /ใบเสร็จรับเงิน \/ ใบกำกับภาษี/);
  assert.match(html, /Receipt \/ Tax Invoice/); assert.match(html, /税务发票/);
  assert.match(html, /ภาษีมูลค่าเพิ่ม 7%/);
  assert.match(html, /139\.25/, "value before VAT: 149.00 - 9.75");
  assert.match(html, /9\.75/);
  assert.match(html, /149\.00/);
  assert.match(html, /0105500000000/); assert.match(html, /1234567890123/);
  assert.match(html, /LQ-\d{6}-000001/);
  assert.doesNotMatch(html, /ฉบับร่าง/);
  assert.doesNotMatch(html, /<script>/, "buyer fields are escaped");
  assert.doesNotMatch(html, /<script/i);
  const j = await call(`/api/me/payments/${c.j.payment_id}/receipt?format=json`, { token: s.token });
  assert.equal(j.j.doc_type, "tax_invoice_receipt"); assert.equal(j.j.draft, false); assert.equal(j.j.vat.vat_satang, 975);
  const h = await call("/api/me/history", { token: s.token });
  assert.equal(h.j.payments[0].receipt_path, `/api/me/payments/${c.j.payment_id}/receipt`);
  const other = await signIn();
  assert.equal((await call(`/api/me/payments/${c.j.payment_id}/receipt`, { token: other.token })).status, 404, "only the payer");
  const adm = await A(`/billing/payments/${c.j.payment_id}/receipt`);
  assert.equal(adm.status, 200);
  assert.match(await adm.r.text(), /ใบกำกับภาษี/);

  // not VAT-registered and seller not filled in: receipt only, no VAT line, marked draft
  const b = await setup(BILLING);
  const s2 = await b.signIn();
  const c2 = await b.co({ plan_id: "report_basic" }, { token: s2.token });
  await b.pay(c2.j.payment_id);
  const html2 = await (await b.call(`/api/me/payments/${c2.j.payment_id}/receipt`, { token: s2.token })).r.text();
  assert.match(html2, /ใบเสร็จรับเงิน/);
  assert.doesNotMatch(html2, /ใบกำกับภาษี</);
  assert.doesNotMatch(html2, /ภาษีมูลค่าเพิ่ม 7%/);
  assert.match(html2, /ฉบับร่าง/);
  assert.match(html2, /49\.00/);
  assert.match(html2, /ซื้อครั้งเดียว/);
});

// ------------------------------------------------------------------------------------------------ P1 4

test("P1-4: admin money ops need re-auth and are audited; refund ledger row shows in member history", async () => {
  const { co, signIn, pay, call, A, env } = await setup(BILLING);
  const s = await signIn();
  const c = await co({ plan_id: "plus", period: "year" }, { token: s.token });
  assert.equal(c.j.amount_satang, 99000);
  await pay(c.j.payment_id);
  assert.equal((await call("/api/me", { token: s.token })).j.tier, "plus");
  const no = await A(`/billing/payments/${c.j.payment_id}/refund`, { method: "POST", body: { reference: "KBANK-123456" } });
  assert.equal(no.status, 403, "re-auth required");
  assert.equal((await A(`/billing/payments/${c.j.payment_id}/refund`, { method: "POST", body: { password: ADMIN_PW } })).status, 400, "reference required");
  const ok = await A(`/billing/payments/${c.j.payment_id}/refund`, { method: "POST", body: { password: ADMIN_PW, reference: "KBANK-123456", note: "customer request" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  assert.equal(ok.j.refund_satang, 99000); assert.equal(ok.j.subscription_cancelled, true);
  assert.equal((await A(`/billing/payments/${c.j.payment_id}/refund`, { method: "POST", body: { password: ADMIN_PW, reference: "again" } })).status, 409, "only once");
  assert.equal((await call("/api/me", { token: s.token })).j.tier, "member", "refund cancelled the plan");
  const h = await call("/api/me/history", { token: s.token });
  const refund = h.j.ledger.find(x => x.kind === "refund");
  assert.ok(refund, "refund ledger row"); assert.equal(refund.amount_satang, 99000);
  assert.equal(h.j.payments[0].status, "refunded");
  assert.match(await (await call(`/api/me/payments/${c.j.payment_id}/receipt`, { token: s.token })).r.text(), /คืนเงินแล้ว/);

  // complimentary plan, extend, cancel
  assert.equal((await A(`/members/${s.user.id}/grant`, { method: "POST", body: { plan_id: "pro", days: 30 } })).status, 403);
  const g = await A(`/members/${s.user.id}/grant`, { method: "POST", body: { password: ADMIN_PW, plan_id: "pro", days: 30, reason: "partner" } });
  assert.equal(g.status, 201, JSON.stringify(g.j));
  assert.equal(g.j.subscription.source, "comp");
  const me = await call("/api/me", { token: s.token });
  assert.equal(me.j.tier, "pro"); assert.equal(me.j.plan.source, "comp");
  const subId = g.j.subscription.id;
  const end0 = g.j.subscription.current_period_end;
  const ex = await A(`/billing/subscriptions/${subId}/extend`, { method: "POST", body: { password: ADMIN_PW, days: 10 } });
  assert.equal(ex.status, 200); assert.equal(ex.j.subscription.current_period_end, end0 + 10 * 86400);
  assert.equal((await A(`/billing/subscriptions/${subId}/extend`, { method: "POST", body: { password: ADMIN_PW, days: 0 } })).status, 400);
  assert.equal((await A(`/billing/subscriptions/${subId}/cancel`, { method: "POST", body: {} })).status, 403);
  assert.equal((await A(`/billing/subscriptions/${subId}/cancel`, { method: "POST", body: { password: ADMIN_PW } })).j.subscription.status, "cancelled");
  assert.equal((await call("/api/me", { token: s.token })).j.tier, "member");
  const cr = await A(`/members/${s.user.id}/grant`, { method: "POST", body: { password: ADMIN_PW, feature: "report_annual", credits: 2 } });
  assert.equal(cr.status, 201);
  assert.equal((await call("/api/me", { token: s.token })).j.credits.report_annual, 2);
  const det = await A(`/members/${s.user.id}`);
  assert.equal(det.j.subscriptions.length, 2); assert.equal(det.j.credits.length, 1);
  assert.equal((await A(`/billing/subscriptions?user_id=${s.user.id}`)).j.subscriptions.length, 2);
  const acts = (await env.DB.prepare("SELECT action FROM audit_log").all()).results.map(r => r.action);
  for (const a of ["billing.refund", "billing.grant", "billing.subscription.extend", "billing.subscription.cancel", "reauth.failed"]) assert.ok(acts.includes(a), a);
});

// ------------------------------------------------------------------------------------------------ P1 5

test("P1-5: provider failure gives the AI use back; denied calls are not counted; quota days are Bangkok days", async () => {
  const { ai, signIn, call, env } = await setup({ FREE_MODE: "false" });
  const s = await signIn();
  const down = await ai({ token: s.token, sdk: { fail: true } });
  assert.equal(down.status, 504); assert.equal(down.j.fallback, true);
  assert.equal((await call("/api/me", { token: s.token })).j.quotas.ai.used, 0, "failed provider call refunded");
  for (let i = 0; i < 3; i++) assert.equal((await ai({ token: s.token })).status, 200);
  for (let i = 0; i < 3; i++) assert.equal((await ai({ token: s.token })).status, 429);
  assert.equal((await call("/api/me", { token: s.token })).j.quotas.ai.used, 3, "refused calls are not counted");
  // guest path (checkEntitlement): refunded too
  const g = await ai({ ip: "198.51.100.9", sdk: { fail: true } });
  assert.equal(g.status, 504);
  const row = await env.DB.prepare("SELECT SUM(n) AS n FROM usage_counters WHERE subject NOT LIKE 'u:%'").first();
  assert.equal(row.n || 0, 0);
  // daily buckets given back as well: only the 3 successful calls are left in the per-caller / global daily buckets
  const d = await env.DB.prepare("SELECT SUM(count) AS n FROM rate_limits WHERE key LIKE 'fortune:d:%'").first();
  assert.equal(d.n, 3);
  assert.equal((await env.DB.prepare("SELECT count FROM rate_limits WHERE key = 'fortune:daily'").first()).count, 3);
  // Bangkok day / month keys
  const { periodKey } = await import(B + "quota.js");
  const t = Date.parse("2026-11-30T18:30:00Z") / 1000; // 01:30 on 1 Dec in Bangkok
  assert.equal(periodKey("day", t), "2026-12-01");
  assert.equal(periodKey("month", t), "2026-12-01");
  assert.equal(periodKey("day", Date.parse("2026-11-30T16:59:00Z") / 1000), "2026-11-30");
  const { windowStart } = await import(B + "store.js");
  assert.equal(windowStart(t, 86400, 7 * 3600), Date.parse("2026-11-30T17:00:00Z") / 1000, "daily rate-limit window starts 00:00 Bangkok");
  const { bkkDayStart } = await import(B + "util.js");
  assert.equal(bkkDayStart(t), Date.parse("2026-11-30T17:00:00Z") / 1000, "readings_today counts from 00:00 Bangkok");
});

// ------------------------------------------------------------------------------------------------ P1 6

test("P1-6: paying members use separate buckets — free traffic cannot use up the caps they need", async () => {
  const { ai, signIn, co, pay, env } = await setup(BILLING);
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ai', ?1, 0)").bind(JSON.stringify({ daily_max: 2, per_caller_daily: 50 })).run();
  const s = await signIn();
  const c = await co({ plan_id: "plus" }, { token: s.token });
  await pay(c.j.payment_id);
  assert.equal((await ai({ ip: "198.51.100.1" })).status, 200);
  assert.equal((await ai({ ip: "198.51.100.2" })).status, 200);
  assert.equal((await ai({ ip: "198.51.100.3" })).status, 429, "shared guest cap used up");
  const free = await signIn();
  assert.equal((await ai({ token: free.token, ip: "198.51.100.4" })).status, 429, "free members share the guest cap");
  for (let i = 0; i < 3; i++) assert.equal((await ai({ token: s.token, ip: "198.51.100.1" })).status, 200, "paying member still served " + (i + 1));
  assert.equal((await env.DB.prepare("SELECT count FROM rate_limits WHERE key = 'fortune:daily:paid'").first()).count, 3);
  // admin can tune the paid caps
  const { validateAi } = await import(B + "settings.js");
  assert.equal(validateAi({ paid_daily_max: 10, paid_per_user_daily: 5 }).paid_daily_max, 10);
  assert.throws(() => validateAi({ paid_daily_max: 0 }));
});

// ------------------------------------------------------------------------------------------------ P1 7

test("P1-7: junk sign-ins (no valid Turnstile) cannot exhaust signin:global; JWKS network error -> 503 jwks_unavailable", async () => {
  const { call, signIn, net, env } = await setup({ SIGNIN_GLOBAL_15MIN: "3" });
  for (let i = 0; i < 20; i++) {
    const r = await call("/api/auth/google", { method: "POST", ip: `10.9.${i}.1`, headers: { "X-Turnstile-Token": "bad" }, body: { credential: "x.y.z", nonce: "n".repeat(32) } });
    assert.equal(r.status, 403);
  }
  assert.equal(await (await import(B + "store.js")).peek(env.DB, "signin:global", 900), 0, "junk never counted");
  await signIn({ ip: "10.8.0.1" });
  await signIn({ ip: "10.8.0.2" });
  await signIn({ ip: "10.8.0.3" });
  const n = await call("/api/auth/nonce", { method: "POST", body: {}, ip: "10.8.0.4" });
  const busy = await call("/api/auth/google", { method: "POST", ip: "10.8.0.4", headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: jwt(claims({ nonce: n.j.nonce })), nonce: n.j.nonce, accept_terms: true, consent_version: "m1" } });
  assert.equal(busy.status, 429, "the cap still applies to verified attempts");

  const b = await setup();
  b.net.jwksDown = true;
  const n2 = await b.call("/api/auth/nonce", { method: "POST", body: {} });
  const r = await b.call("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: jwt(claims({ nonce: n2.j.nonce })), nonce: n2.j.nonce, accept_terms: true, consent_version: "m1" } });
  assert.equal(r.status, 503); assert.equal(r.j.code, "jwks_unavailable");
  const { verifyGoogleIdToken, resetJwksCache, GoogleTokenError } = await import(B + "google.js");
  resetJwksCache();
  await assert.rejects(verifyGoogleIdToken(jwt(claims()), { clientId: CLIENT_ID, nonce: "n", fetchImpl: async () => { throw new TypeError("network"); } }), e => e instanceof GoogleTokenError && e.code === "jwks_unavailable");
  void net;
});

// ------------------------------------------------------------------------------------------------ P1 8

test("P1-8: consumer pricing seeded; one-time reports grant credits; draft plans cannot be bought; prices editable", async () => {
  const { co, signIn, pay, call, A, ai, env } = await setup(BILLING);
  const plans = Object.fromEntries((await env.DB.prepare("SELECT * FROM plans").all()).results.map(p => [p.id, p]));
  assert.deepEqual([plans.plus.price_month_satang, plans.plus.price_year_satang, plans.plus.kind, plans.plus.audience], [14900, 99000, "subscription", "consumer"]);
  assert.deepEqual([plans.report_annual.price_once_satang, plans.report_compat.price_once_satang, plans.report_basic.price_once_satang], [19900, 9900, 4900]);
  assert.equal(plans.report_annual.kind, "one_time");
  assert.deepEqual([plans.pro.price_month_satang, plans.business.price_month_satang, plans.pro.audience], [99000, 390000, "business"], "pro / business kept");
  const s = await signIn();
  const draft = await co({ plan_id: "pro" }, { token: s.token });
  assert.equal(draft.status, 400); assert.equal(draft.j.code, "plan_unavailable");
  const c = await co({ plan_id: "report_annual", period: "year" }, { token: s.token });
  assert.equal(c.status, 201, JSON.stringify(c.j));
  assert.equal(c.j.amount_satang, 19900); assert.equal(c.j.period, "once");
  await pay(c.j.payment_id);
  const me = await call("/api/me", { token: s.token });
  assert.deepEqual(me.j.credits, { ai_reading: 3, report_annual: 1 });
  assert.equal(me.j.tier, "member"); assert.equal(me.j.paying, true);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions").first()).n, 0, "one-time purchase = credits, no subscription");
  // report credit used once through the server check
  const u1 = await call("/api/me/entitlements/use", { method: "POST", token: s.token, body: { feature: "report_annual" } });
  assert.deepEqual([u1.j.allowed, u1.j.via, u1.j.credits], [true, "credit", 0]);
  const u2 = await call("/api/me/entitlements/use", { method: "POST", token: s.token, body: { feature: "report_annual" } });
  assert.equal(u2.j.allowed, false);
  assert.ok((await call("/api/me/history", { token: s.token })).j.ledger.some(x => x.kind === "credit"));
  // AI credits are used after the member's daily quota (3/day)
  for (let i = 0; i < 6; i++) assert.equal((await ai({ token: s.token })).status, 200, "use " + (i + 1));
  assert.equal((await ai({ token: s.token })).status, 429);
  assert.equal((await call("/api/me", { token: s.token })).j.credits.ai_reading, undefined, "all 3 AI credits used");
  // prices editable via the admin API; checkout uses the new price; draft blocks buying
  const put = await A("/billing/plans/report_basic", { method: "PUT", body: { price_once_satang: 5900, name_zh: "基础报告" } });
  assert.equal(put.status, 200, JSON.stringify(put.j));
  assert.equal(put.j.prices.from.once, 4900); assert.equal(put.j.prices.to.once, 5900);
  assert.equal((await co({ plan_id: "report_basic" }, { token: s.token })).j.amount_satang, 5900);
  assert.equal((await A("/billing/plans/report_basic", { method: "PUT", body: { price_once_satang: 100 } })).status, 400, "below Opn minimum");
  assert.equal((await A("/billing/plans/report_basic", { method: "PUT", body: { entitlements: { ai_reading: { quota: 2, period: "month" } } } })).status, 400, "one-time = 'once' credits");
  assert.equal((await A("/billing/plans/plus", { method: "PUT", body: { entitlements: { bogus: { quota: 1 } } } })).status, 400);
  assert.equal((await A("/billing/plans/plus", { method: "PUT", body: { status: "draft", entitlements: { ai_reading: { quota: 40, period: "month" } } } })).status, 200);
  assert.equal((await co({ plan_id: "plus" }, { token: s.token })).status, 400, "draft plan refused");
  assert.equal((await A("/billing/plans/free", { method: "PUT", body: { price_month_satang: 9900 } })).status, 400);
  const nw = await A("/billing/plans", { method: "POST", body: { id: "report_love", name_th: "รายงานความรัก", name_en: "Love report", kind: "one_time", price_once_satang: 7900, status: "active", entitlements: { ai_reading: { quota: 1 } } } });
  assert.equal(nw.status, 201, JSON.stringify(nw.j));
  assert.equal(nw.j.plan.entitlements.ai_reading.period, "once");
  const acts = (await env.DB.prepare("SELECT action, detail FROM audit_log WHERE action LIKE 'billing.plan.%'").all()).results;
  assert.ok(acts.length >= 3);
  assert.match(acts[0].detail, /"once":5900/);
});

// ------------------------------------------------------------------------------------------------ P1 9

test("P1-9: perk registry served with the plans (active | coming_soon); csv_export server check", async () => {
  const { call, signIn, env, A } = await setup(BILLING);
  await (await import(B + "settings.js")).putBillingSettings(env.DB, { pricing_page_enabled: true });
  const pl = await call("/v1/billing/plans");
  assert.equal(pl.j.perks.csv_export.status, "active");
  assert.equal(pl.j.perks.analytics_days.status, "coming_soon");
  assert.equal(pl.j.perks.hub_nodes.status, "coming_soon");
  assert.equal(pl.j.member_required_for_checkout, true);
  const pro = pl.j.plans.find(p => p.id === "pro");
  assert.equal(pro.entitlements.hub_nodes.status, "coming_soon");
  assert.equal(pro.entitlements.ai_reading.status, "active");
  assert.equal(pl.j.plans.find(p => p.id === "report_annual").purchasable, true);
  assert.equal(pro.purchasable, false);
  const s = await signIn();
  const ck = await call("/api/me/entitlements/use", { method: "POST", token: s.token, body: { feature: "csv_export" } });
  assert.equal(ck.j.allowed, false, "free tier: not included");
  assert.equal((await call("/api/me/entitlements/use", { method: "POST", token: s.token, body: { feature: "hub_nodes" } })).status, 400, "coming-soon perks are not checkable");
  assert.equal((await call("/api/me/entitlements/use", { method: "POST", body: { feature: "csv_export" } })).status, 401);
  await A(`/members/${s.user.id}/grant`, { method: "POST", body: { password: ADMIN_PW, plan_id: "pro", days: 30 } });
  assert.equal((await call("/api/me/entitlements/use", { method: "POST", token: s.token, body: { feature: "csv_export" } })).j.allowed, true, "pro includes csv export");
  const all = await call("/api/me/entitlements", { token: s.token });
  assert.equal(all.j.plan, "pro"); assert.equal(all.j.perks.csv_export.quota, null); assert.equal(all.j.perks.analytics_days.status, "coming_soon");
  // FREE_MODE: everything unlocked
  const f = await setup();
  const fs = await f.signIn();
  assert.equal((await f.call("/api/me/entitlements/use", { method: "POST", token: fs.token, body: { feature: "csv_export" } })).j.allowed, true);
});

// ------------------------------------------------------------------------------------------------ P2 10

test("P2-10: idempotent checkout — a retry with the same key returns the same payment, one provider charge", async () => {
  const { co, signIn, net } = await setup(BILLING);
  const s = await signIn();
  const h = { "Idempotency-Key": "order-abc-12345" };
  const a = await co({ plan_id: "plus" }, { token: s.token, headers: h });
  assert.equal(a.status, 201);
  const b = await co({ plan_id: "plus" }, { token: s.token, headers: { ...h, "X-Turnstile-Token": "spent" } });
  assert.equal(b.status, 200, "replay needs no fresh Turnstile token");
  assert.equal(b.j.payment_id, a.j.payment_id); assert.equal(b.j.idempotent_replay, true);
  assert.equal(net.opnCalls, 1);
  assert.equal((await co({ plan_id: "report_basic" }, { token: s.token, headers: h })).status, 422, "same key, other purchase");
  assert.equal((await co({ plan_id: "plus" }, { token: s.token, headers: { "Idempotency-Key": "bad key!" } })).status, 400);
  const other = await signIn();
  const c = await co({ plan_id: "plus" }, { token: other.token, headers: h });
  assert.equal(c.status, 201, "keys are scoped per member");
  assert.notEqual(c.j.payment_id, a.j.payment_id);
});

test("P2-10: TOTP disable revokes other sessions + devices; devices list/revoke; retention/run needs re-auth", async () => {
  const { call, env } = await setup();
  const { base32Decode, totpAt } = await import(B + "crypto.js");
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
  const login = async (o = {}) => (await call("/admin/api/login", { method: "POST", ip: o.ip, body: { username: "owner", password: ADMIN_PW, mode: "bearer", totp: o.totp } })).j;
  const L1 = await login({ ip: "10.0.0.1" }), L2 = await login({ ip: "10.0.0.2" });
  const as = (tok, extra = {}) => ({ Authorization: "Bearer " + tok, ...extra });
  const devs = await call("/admin/api/devices", { headers: as(L1.token, { "X-LQ-Device": L1.device }) });
  assert.equal(devs.j.devices.length, 2);
  assert.equal(devs.j.devices.filter(d => d.current).length, 1);
  assert.match(devs.j.devices[0].id, /^[a-f0-9]{16}$/);
  const victim = devs.j.devices.find(d => !d.current).id;
  assert.equal((await call(`/admin/api/devices/${victim}`, { method: "DELETE", headers: as(L1.token) })).status, 200);
  assert.equal((await call("/admin/api/devices", { headers: as(L1.token) })).j.devices.length, 1);
  assert.equal((await call("/admin/api/devices/0000000000000000", { method: "DELETE", headers: as(L1.token) })).status, 404);
  // retention/run needs re-auth
  assert.equal((await call("/admin/api/retention/run", { method: "POST", headers: as(L1.token), body: {} })).status, 403);
  assert.equal((await call("/admin/api/retention/run", { method: "POST", headers: as(L1.token), body: { password: ADMIN_PW } })).status, 200);
  // enable TOTP, then disable it: every other session is signed out, trusted devices forgotten
  const setupT = await call("/admin/api/totp/setup", { method: "POST", headers: as(L1.token), body: { password: ADMIN_PW } });
  const secret = base32Decode(setupT.j.secret);
  const step = Math.floor(nowS() / 30);
  assert.equal((await call("/admin/api/totp/enable", { method: "POST", headers: as(L1.token), body: { code: await totpAt(secret, step - 1) } })).status, 200);
  assert.equal((await call("/admin/api/totp/disable", { method: "POST", headers: as(L1.token), body: { password: ADMIN_PW, code: await totpAt(secret, step) } })).status, 200);
  assert.equal((await call("/admin/api/me", { headers: as(L2.token) })).status, 401, "other session revoked");
  assert.equal((await call("/admin/api/me", { headers: as(L1.token) })).status, 200, "current session kept");
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_devices").first()).n, 0);
  const a = (await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'totp.disabled'").first()).detail;
  assert.match(a, /"sessions_revoked":1/);
});

test("P2-10: after erasure the audit log keeps no raw member id (one-way pseudonym)", async () => {
  const { signIn, call, env } = await setup();
  const s = await signIn();
  await call("/api/me/preferences", { method: "POST", token: s.token, body: { marketing_opt_in: true } });
  assert.ok((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE detail LIKE ?1").bind("%" + s.user.id + "%").first()).n >= 2);
  assert.equal((await call("/api/me", { method: "DELETE", token: s.token, body: { confirm: "DELETE" } })).status, 200);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE detail LIKE ?1").bind("%" + s.user.id + "%").first()).n, 0);
  const del = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'member.deleted'").first();
  assert.match(del.detail, /"user_hash":"erased:[a-f0-9]{16}"/);
});

// ------------------------------------------------------------------------------------------------ member sessions

test("member sessions: list (opaque id, coarse label, current flag), revoke one, sign out everywhere", async () => {
  const { call, env, net } = await setup();
  const { handle } = await import(B + "index.js");
  const { uaLabel } = await import(B + "members.js");
  assert.equal(uaLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "Safari · iOS");
  assert.equal(uaLabel("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36"), "Chrome · Android");
  assert.equal(uaLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0"), "Edge · Windows");
  assert.equal(uaLabel(""), "Browser · other");
  // three sign-ins of the same Google account from different devices
  const UAS = ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1", "Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile Safari/537.36", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Firefox/140.0"];
  const toks = [];
  for (const ua of UAS) {
    const n = await call("/api/auth/nonce", { method: "POST", body: {} });
    const r = await handle(req("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "good:signin", "User-Agent": ua }, body: { credential: jwt(claims({ nonce: n.j.nonce, sub: "7777" })), nonce: n.j.nonce, accept_terms: true, consent_version: "m1" } }), env, { fetch: net.fetch });
    toks.push((await r.json()).token);
  }
  const raw = (await env.DB.prepare("SELECT ua_label FROM member_sessions").all()).results.map(r => r.ua_label);
  assert.ok(raw.every(l => /^[A-Za-z ]+ · [A-Za-z]+$/.test(l)), "only the coarse label is stored: " + raw.join(", "));
  const list = await call("/api/me/sessions", { token: toks[0] });
  assert.equal(list.status, 200);
  assert.equal(list.j.sessions.length, 3);
  const cur = list.j.sessions.filter(x => x.current);
  assert.equal(cur.length, 1); assert.equal(cur[0].label, "Safari · iOS");
  for (const x of list.j.sessions) {
    assert.match(x.id, /^[a-f0-9]{16}$/);
    assert.ok(!toks.some(t => t.includes(x.id)), "id is not part of the token");
    assert.ok(x.created_at && x.last_seen_at);
  }
  assert.deepEqual(list.j.sessions.map(x => x.label).sort(), ["Chrome · Android", "Firefox · macOS", "Safari · iOS"]);
  assert.equal((await call("/api/me/sessions")).status, 401);
  // revoke one (the Android one)
  const android = list.j.sessions.find(x => x.label === "Chrome · Android");
  const r1 = await call("/api/me/sessions/revoke", { method: "POST", token: toks[0], body: { id: android.id } });
  assert.equal(r1.status, 200); assert.deepEqual([r1.j.revoked, r1.j.current_revoked], [1, false]);
  assert.equal((await call("/api/me", { token: toks[1] })).status, 401, "that device is signed out");
  assert.equal((await call("/api/me/sessions/revoke", { method: "POST", token: toks[0], body: { id: android.id } })).status, 404);
  assert.equal((await call("/api/me/sessions/revoke", { method: "POST", token: toks[0], body: { id: "nothex" } })).status, 400);
  // another member cannot revoke this member's session
  const o = await call("/api/auth/nonce", { method: "POST", body: {} });
  const os = (await call("/api/auth/google", { method: "POST", headers: { "X-Turnstile-Token": "good:signin" }, body: { credential: jwt(claims({ nonce: o.j.nonce, sub: "8888" })), nonce: o.j.nonce, accept_terms: true, consent_version: "m1" } })).j.token;
  const ff = list.j.sessions.find(x => x.label === "Firefox · macOS");
  assert.equal((await call("/api/me/sessions/revoke", { method: "POST", token: os, body: { id: ff.id } })).status, 404, "scoped to the caller");
  // sign out everywhere, keep this one
  const all = await call("/api/me/sessions/revoke", { method: "POST", token: toks[0], body: { all: true, keep_current: true } });
  assert.deepEqual([all.j.revoked, all.j.current_revoked], [1, false]);
  assert.equal((await call("/api/me", { token: toks[2] })).status, 401);
  assert.equal((await call("/api/me", { token: toks[0] })).status, 200, "current kept");
  assert.equal((await call("/api/me", { token: os })).status, 200, "other members untouched");
  const all2 = await call("/api/me/sessions/revoke", { method: "POST", token: toks[0], body: { all: true, keep_current: false } });
  assert.deepEqual([all2.j.revoked, all2.j.current_revoked], [1, true]);
  assert.equal((await call("/api/me", { token: toks[0] })).status, 401);
  assert.ok((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'member.sessions.revoked'").first()).n === 3);
});
