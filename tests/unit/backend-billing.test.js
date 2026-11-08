"use strict";
// tests/unit/backend-billing.test.js — backend/src/billing.js + opn.js: entitlements/FREE_MODE, VAT split, receipts,
// PromptPay checkout (mocked Opn API), polling, webhook signature verification and idempotency, live-key guard.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const WH_SECRET = Buffer.from("webhook-secret-for-tests-0123456789").toString("base64");
const TEST_KEY = "skey_test_5xyzabcdefghijklmnop";
// Turnstile is fail-closed on checkout: configured in these envs, siteverify answered by fakeOpn().
// Round 10: checkout needs a signed-in member by default; these legacy-flow tests opt into guest checkout
// (ALLOW_GUEST_CHECKOUT=true). The member-required default is tested in backend-billing-receipts.test.js.
const TSV = { TURNSTILE_SECRET: "ts-secret", TURNSTILE_HOSTNAMES: "site.example", ALLOW_GUEST_CHECKOUT: "true" };
const TS = { "X-Turnstile-Token": "good" };

const sign = (secretB64, ts, body) => createHmac("sha256", Buffer.from(secretB64, "base64")).update(`${ts}.${body}`).digest("hex");

test("VAT 7 % (inclusive) split; no VAT when not VAT-registered", async () => {
  const { splitVat } = await import(B + "billing.js");
  assert.deepEqual(splitVat(10700, true), { total: 10700, subtotal: 10000, vat: 700, rate_bp: 700 });
  const v = splitVat(29000, true);
  assert.equal(v.subtotal + v.vat, 29000);
  assert.equal(v.vat, 1897); // 29000 * 7 / 107 = 1897.2
  assert.deepEqual(splitVat(29000, false), { total: 29000, subtotal: 29000, vat: 0, rate_bp: 0 });
  assert.throws(() => splitVat(1.5, true));
});

test("entitlements: FREE_MODE unlocks everything but still counts; FREE_MODE=false enforces plan quotas", async () => {
  const { checkEntitlement, freeMode } = await import(B + "billing.js");
  assert.equal(freeMode({}), true, "missing variable = free");
  assert.equal(freeMode({ FREE_MODE: "garbage" }), true);
  assert.equal(freeMode({ FREE_MODE: "false" }), false);
  const free = createEnv({ FREE_MODE: "true" });
  for (let i = 0; i < 5; i++) assert.equal((await checkEntitlement(free, "anon1", "ai_reading")).allowed, true);
  const last = await checkEntitlement(free, "anon1", "ai_reading");
  assert.equal(last.used, 6);
  assert.equal(last.would_block, true, "would be blocked on the Free plan (quota 3)");
  assert.equal((await checkEntitlement(free, "anon1", "csv_export")).allowed, true, "quota 0 still unlocked in free mode");

  const paid = createEnv({ FREE_MODE: "false" });
  for (let i = 0; i < 3; i++) assert.equal((await checkEntitlement(paid, "anon2", "ai_reading")).allowed, true);
  assert.equal((await checkEntitlement(paid, "anon2", "ai_reading")).allowed, false, "4th reading over the Free quota");
  assert.equal((await checkEntitlement(paid, "anon2", "csv_export")).allowed, false, "not included in Free");
  assert.equal((await checkEntitlement(paid, "anon2", "unknown_feature")).allowed, false, "unknown feature = not included");
  // an active Pro subscription lifts the quota
  const t = Math.floor(Date.now() / 1000);
  await paid.DB.prepare("INSERT INTO customers (id, created_at) VALUES ('cust1', ?1)").bind(t).run();
  await paid.DB.prepare("INSERT INTO subscriptions (id, customer_id, plan_id, status, period, current_period_start, current_period_end, created_at, updated_at) VALUES ('s1', 'cust1', 'pro', 'active', 'month', ?1, ?2, ?1, ?1)").bind(t, t + 86400).run();
  const pro = await checkEntitlement(paid, "anon2", "csv_export", { customerId: "cust1" });
  assert.equal(pro.plan, "pro");
  assert.equal(pro.allowed, true);
});

test("webhook signature: hex HMAC-SHA256 over '<ts>.<body>' with the base64-decoded secret; rotation; tolerance", async () => {
  const { verifyWebhookSignature } = await import(B + "opn.js");
  const ts = 1767000000, body = '{"object":"event","id":"evnt_test_abc123"}';
  const good = sign(WH_SECRET, ts, body);
  assert.deepEqual(await verifyWebhookSignature(WH_SECRET, String(ts), good, body, { nowSec: ts + 10 }), { ok: true });
  assert.equal((await verifyWebhookSignature(WH_SECRET, String(ts), "deadbeef," + good, body, { nowSec: ts })).ok, true, "two signatures during rotation");
  assert.equal((await verifyWebhookSignature(WH_SECRET, String(ts), good, body + " ", { nowSec: ts })).ok, false, "body tampered");
  assert.equal((await verifyWebhookSignature(WH_SECRET, String(ts + 1), good, body, { nowSec: ts })).ok, false, "timestamp tampered");
  const other = Buffer.from("other-secret-xxxxxxxxxxxxxxxxxxxx").toString("base64");
  assert.equal((await verifyWebhookSignature(other, String(ts), good, body, { nowSec: ts })).ok, false, "wrong secret");
  assert.equal((await verifyWebhookSignature(WH_SECRET, String(ts), good, body, { nowSec: ts + 3600 })).reason, "timestamp outside tolerance");
  assert.equal((await verifyWebhookSignature(WH_SECRET, String(ts), "", body, { nowSec: ts })).ok, false);
  assert.equal((await verifyWebhookSignature("", String(ts), good, body, { nowSec: ts })).ok, false);
  // signing with the raw (non-decoded) secret string must NOT verify — the secret is base64-decoded first
  const wrongEncoding = createHmac("sha256", WH_SECRET).update(`${ts}.${body}`).digest("hex");
  assert.equal((await verifyWebhookSignature(WH_SECRET, String(ts), wrongEncoding, body, { nowSec: ts })).ok, false);
});

test("Opn key guard: missing key refused; live key refused unless OPN_ALLOW_LIVE", async () => {
  const { opnKey } = await import(B + "opn.js");
  assert.throws(() => opnKey({}), /not set/);
  assert.throws(() => opnKey({ OPN_SECRET_KEY: "skey_5abcdefghijklmnopq" }), /live Opn key refused/);
  assert.equal(opnKey({ OPN_SECRET_KEY: "skey_5abcdefghijklmnopq", OPN_ALLOW_LIVE: "true" }).live, true);
  assert.equal(opnKey({ OPN_SECRET_KEY: TEST_KEY }).live, false);
});

/** Fake Opn API: records calls; charge state is mutable. */
function fakeOpn() {
  const charges = new Map();
  const calls = [];
  let n = 0;
  const fetch = async (url, init = {}) => {
    if (/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify$/.test(url)) {
      const p = new URLSearchParams(String(init.body));
      return new Response(JSON.stringify({ success: p.get("response") === "good", action: "checkout", hostname: "site.example" }));
    }
    calls.push({ url, method: init.method || "GET", headers: init.headers, body: init.body });
    assert.match(init.headers.Authorization, /^Basic /);
    assert.equal(Buffer.from(init.headers.Authorization.slice(6), "base64").toString(), TEST_KEY + ":");
    const u = new URL(url);
    if (u.pathname === "/charges" && init.method === "POST") {
      const p = new URLSearchParams(init.body);
      assert.equal(p.get("source[type]"), "promptpay");
      assert.equal(p.get("currency"), "thb");
      const id = "chrg_test_" + String(++n).padStart(12, "0");
      const c = { object: "charge", id, amount: Number(p.get("amount")), currency: "thb", status: "pending", metadata: { payment_id: p.get("metadata[payment_id]") },
        source: { type: "promptpay", scannable_code: { image: { download_uri: `https://api.omise.co/charges/${id}/documents/docu_test_1/downloads/QR` } } } };
      charges.set(id, c);
      return new Response(JSON.stringify(c), { status: 200 });
    }
    const m = /^\/charges\/(chrg_test_\d+)$/.exec(u.pathname);
    if (m) return new Response(JSON.stringify(charges.get(m[1])), { status: 200 });
    if (/\/downloads\/QR$/.test(u.pathname)) return new Response("<svg xmlns='http://www.w3.org/2000/svg'/>", { status: 200 });
    return new Response(JSON.stringify({ object: "error", code: "not_found" }), { status: 404 });
  };
  return { fetch, charges, calls };
}

test("checkout refused in FREE_MODE / when billing disabled", async () => {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ FREE_MODE: "true", BILLING_ENABLED: "true", ...TSV, OPN_SECRET_KEY: TEST_KEY });
  const r = await handle(req("/v1/billing/checkout", { headers: TS, method: "POST", body: { plan_id: "pro" } }), env, { fetch: fakeOpn().fetch });
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /free/i);
});

test("PromptPay checkout -> QR -> webhook (verified, re-fetched, idempotent) -> receipt + subscription", async () => {
  const { handle } = await import(B + "index.js");
  const opn = fakeOpn();
  const env = createEnv({ FREE_MODE: "false", BILLING_ENABLED: "true", ...TSV, OPN_SECRET_KEY: TEST_KEY, OPN_WEBHOOK_SECRET: WH_SECRET, VAT_REGISTERED: "true", SELLER_NAME: "LENSIQ Co., Ltd.", SELLER_TAX_ID: "0105500000000" });
  await env.DB.prepare("UPDATE plans SET status = 'active' WHERE id = 'pro'").run();
  const deps = { fetch: opn.fetch };
  const c = await handle(req("/v1/billing/checkout", { headers: TS, method: "POST", body: { plan_id: "pro", period: "month", accept_terms: true, age_confirm: "adult", buyer: { name: "ร้านตัวอย่าง", email: "shop@example.com", tax_id: "1234567890123" } } }), env, deps);
  assert.equal(c.status, 201);
  const co = await c.json();
  assert.equal(co.amount_satang, 99000);
  assert.equal(co.vat_satang, 6477); // 99000 * 7 / 107 = 6476.6
  assert.equal(co.test_mode, true);
  assert.match(co.payment_id, /^[a-f0-9]{32}$/);
  assert.match(co.customer_id, /^[a-f0-9]{24}$/, "M2: buyer gets the customer id");
  assert.match(co.order_token, /^[A-Za-z0-9_-]{32}$/, "M2: and a secret order token to link the plan");
  const cust = await env.DB.prepare("SELECT order_token_hash FROM customers WHERE id = ?1").bind(co.customer_id).first();
  assert.ok(cust.order_token_hash && cust.order_token_hash !== co.order_token, "only the hash is stored");

  const qr = await handle(req(co.qr_path), env, deps);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get("Content-Type"), "image/svg+xml");

  const st = await (await handle(req(co.status_path), env, deps)).json();
  assert.equal(st.status, "pending");

  const pay = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(co.payment_id).first();
  // a forged webhook claiming success is rejected
  const forgedBody = JSON.stringify({ object: "event", id: "evnt_test_forged1", key: "charge.complete", data: { object: "charge", id: pay.provider_charge_id, status: "successful" } });
  const ts = String(Math.floor(Date.now() / 1000));
  const forged = await handle(req("/v1/billing/webhook/opn", { method: "POST", body: forgedBody, origin: null, headers: { "Omise-Signature-Timestamp": ts, "Omise-Signature": "00".repeat(32) } }), env, deps);
  assert.equal(forged.status, 401);
  // a correctly signed webhook whose payload LIES (says successful) does not mark it paid: the API is the source of truth
  const sigLie = sign(WH_SECRET, ts, forgedBody);
  const lie = await handle(req("/v1/billing/webhook/opn", { method: "POST", body: forgedBody, origin: null, headers: { "Omise-Signature-Timestamp": ts, "Omise-Signature": sigLie } }), env, deps);
  assert.equal(lie.status, 200);
  assert.equal((await env.DB.prepare("SELECT status FROM payments WHERE id = ?1").bind(co.payment_id).first()).status, "pending");

  // customer pays: provider state changes, real webhook arrives
  opn.charges.get(pay.provider_charge_id).status = "successful";
  const body = JSON.stringify({ object: "event", id: "evnt_test_real001", key: "charge.complete", data: { object: "charge", id: pay.provider_charge_id } });
  const h = { "Omise-Signature-Timestamp": ts, "Omise-Signature": sign(WH_SECRET, ts, body) };
  const w1 = await handle(req("/v1/billing/webhook/opn", { method: "POST", body, origin: null, headers: h }), env, deps);
  assert.equal(w1.status, 200);
  assert.equal((await w1.json()).result, "successful");
  const w2 = await handle(req("/v1/billing/webhook/opn", { method: "POST", body, origin: null, headers: h }), env, deps);
  assert.equal((await w2.json()).duplicate, true, "replayed event ignored");

  const paid = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(co.payment_id).first();
  assert.equal(paid.status, "successful");
  assert.match(paid.receipt_no, /^LQ-\d{6}-000001$/);
  assert.equal(paid.doc_type, "tax_invoice_receipt");
  assert.equal(paid.seller_tax_id, "0105500000000");
  assert.equal(paid.buyer_tax_id, "1234567890123");
  assert.equal(paid.subtotal_satang + paid.vat_satang, paid.amount_satang);
  const subs = (await env.DB.prepare("SELECT * FROM subscriptions").all()).results;
  assert.equal(subs.length, 1);
  assert.equal(subs[0].plan_id, "pro");
  assert.equal(paid.subscription_id, subs[0].id);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM webhooks").first()).n, 2, "forged one never stored; lie + real stored once each");
});

test("webhook without configured secret -> 503; invalid buyer tax id -> 400", async () => {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ FREE_MODE: "false", BILLING_ENABLED: "true", ...TSV, OPN_SECRET_KEY: TEST_KEY });
  const r = await handle(req("/v1/billing/webhook/opn", { method: "POST", body: "{}", origin: null }), env);
  assert.equal(r.status, 503);
  await env.DB.prepare("UPDATE plans SET status = 'active' WHERE id = 'pro'").run();
  const c = await handle(req("/v1/billing/checkout", { headers: TS, method: "POST", body: { plan_id: "pro", accept_terms: true, age_confirm: "adult", buyer: { tax_id: "123" } } }), env, { fetch: fakeOpn().fetch });
  assert.equal(c.status, 400);
});

test("pricing info hidden until the admin enables the pricing page", async () => {
  const { publicBillingInfo } = await import(B + "billing.js");
  const { putBillingSettings } = await import(B + "settings.js");
  const env = createEnv();
  const a = await publicBillingInfo(env);
  assert.equal(a.pricing_enabled, false);
  assert.equal(a.plans, undefined);
  await putBillingSettings(env.DB, { pricing_page_enabled: true });
  const b = await publicBillingInfo(env);
  assert.deepEqual(b.plans.map(p => p.id), ["free", "plus", "report_basic", "report_compat", "report_annual", "pro", "business", "enterprise"]);
  assert.equal(b.plans.find(p => p.id === "pro").status, "draft");
  assert.equal(b.plans.find(p => p.id === "pro").purchasable, false, "draft plans are not purchasable");
});

test("M2 probe: public checkout is rate limited per caller and globally", async () => {
  const { handle } = await import(B + "index.js");
  const opn = fakeOpn();
  const env = createEnv({ FREE_MODE: "false", BILLING_ENABLED: "true", ...TSV, OPN_SECRET_KEY: TEST_KEY });
  await env.DB.prepare("UPDATE plans SET status = 'active' WHERE id != 'free'").run();
  const co = ip => handle(req("/v1/billing/checkout", { headers: TS, method: "POST", ip, body: { plan_id: "pro", period: "month", accept_terms: true, age_confirm: "adult", buyer: { name: "x" } } }), env, { fetch: opn.fetch });
  const st = [];
  for (let i = 0; i < 8; i++) st.push((await co("203.0.113.5")).status);
  assert.deepEqual(st, [201, 201, 201, 201, 201, 429, 429, 429]);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM customers").first()).n, 5);
  assert.equal((await co("203.0.113.6")).status, 201, "other callers still served");
});

test("H3 probe: webhook during an Opn 503 is NOT marked seen — Opn's retry is processed", async () => {
  const { handle } = await import(B + "index.js");
  const { hmacHex, fromB64 } = await import(B + "crypto.js");
  const SEC = Buffer.alloc(32, 3).toString("base64");
  const env = createEnv({ OPN_WEBHOOK_SECRET: SEC, OPN_SECRET_KEY: "skey_test_abcdefghijkl" });
  await env.DB.prepare("INSERT INTO payments (id, kind, livemode, amount_satang, subtotal_satang, vat_satang, vat_rate_bp, status, expires_at, provider_charge_id, created_at, updated_at) VALUES ('p1','checkout',0,2000,2000,0,0,'pending',0,'chrg_test_abcdefghij',0,0)").run();
  const body = JSON.stringify({ id: "evnt_test_abcdef1", key: "charge.complete", data: { object: "charge", id: "chrg_test_abcdefghij" } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await hmacHex(fromB64(SEC), ts + "." + body);
  const wh = f => handle(new Request("https://api.example/v1/billing/webhook/opn", { method: "POST", headers: { "Omise-Signature": sig, "Omise-Signature-Timestamp": ts }, body }), env, { fetch: f });
  const a = await wh(async () => new Response("oops", { status: 503 }));
  assert.equal(a.status, 503, "tell Opn to retry");
  const b = await wh(async () => new Response(JSON.stringify({ object: "charge", id: "chrg_test_abcdefghij", status: "successful", amount: 2000, currency: "thb" })));
  assert.equal(b.status, 200);
  assert.equal((await b.json()).result, "successful");
  assert.equal((await env.DB.prepare("SELECT status FROM payments WHERE id = 'p1'").first()).status, "successful");
  const c = await wh(async () => { throw new Error("must not be called"); });
  assert.equal((await c.json()).duplicate, true, "duplicate only after it was processed");
});

test("H3: reconcile cron settles pending payments from Opn (lost webhooks)", async () => {
  const { reconcilePending } = await import(B + "billing.js");
  const opn = fakeOpn();
  const { handle } = await import(B + "index.js");
  const env = createEnv({ FREE_MODE: "false", BILLING_ENABLED: "true", ...TSV, OPN_SECRET_KEY: TEST_KEY });
  await env.DB.prepare("UPDATE plans SET status = 'active' WHERE id = 'pro'").run();
  const co = await (await handle(req("/v1/billing/checkout", { headers: TS, method: "POST", body: { plan_id: "pro", accept_terms: true, age_confirm: "adult" } }), env, { fetch: opn.fetch })).json();
  const pay = await env.DB.prepare("SELECT provider_charge_id FROM payments WHERE id = ?1").bind(co.payment_id).first();
  assert.deepEqual(await reconcilePending(env, { fetchImpl: opn.fetch }), { checked: 1, changed: 0, errors: 0, repaired: 0, repair_errors: 0, expired_local: 0, late_success: 0, stuck_alerts: 0, sweep_errors: 0 });
  opn.charges.get(pay.provider_charge_id).status = "successful";
  assert.deepEqual(await reconcilePending(env, { fetchImpl: opn.fetch }), { checked: 1, changed: 1, errors: 0, repaired: 0, repair_errors: 0, expired_local: 0, late_success: 0, stuck_alerts: 0, sweep_errors: 0 });
  assert.equal((await env.DB.prepare("SELECT status FROM payments WHERE id = ?1").bind(co.payment_id).first()).status, "successful");
  const worker = (await import(B + "index.js")).default;
  const waits = [];
  await worker.scheduled({ cron: "*/15 * * * *" }, createEnv(), { waitUntil: p => waits.push(p) });
  await Promise.all(waits);
});

test("receipts are gap-free and assigned once when webhook, poll and cron race", async () => {
  const { applyCharge } = await import(B + "billing.js");
  const env = createEnv();
  const t = Math.floor(Date.now() / 1000);
  for (const id of ["a", "b", "c"]) {
    await env.DB.prepare("INSERT INTO payments (id, kind, livemode, amount_satang, subtotal_satang, vat_satang, vat_rate_bp, status, provider_charge_id, created_at, updated_at) VALUES (?1,'admin_test',0,2000,2000,0,0,'pending',?2,?3,?3)")
      .bind(id.repeat(32), "chrg_test_" + id.repeat(12), t).run();
  }
  const rows = (await env.DB.prepare("SELECT * FROM payments").all()).results;
  const charge = p => ({ status: "successful", amount: p.amount_satang, currency: "thb" });
  await Promise.all(rows.flatMap(p => [applyCharge(env, p, charge(p)), applyCharge(env, p, charge(p)), applyCharge(env, p, charge(p))]));
  const nums = (await env.DB.prepare("SELECT receipt_no FROM payments ORDER BY receipt_no").all()).results.map(r => r.receipt_no.slice(-6));
  assert.deepEqual(nums, ["000001", "000002", "000003"]);
  const ym = new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 7).replace("-", ""); // Bangkok month
  assert.equal((await env.DB.prepare("SELECT value FROM counters WHERE name = ?1").bind("receipt:" + ym).first()).value, 3, "counter not advanced by the losers");
});

test("eval8 probe2: checkout from 200 different IPs is capped globally per hour", async () => {
  const { handle } = await import(B + "index.js");
  const { CHECKOUT_GLOBAL_HOUR } = await import(B + "billing.js");
  const opn = fakeOpn();
  const env = createEnv({ FREE_MODE: "false", BILLING_ENABLED: "true", ...TSV, OPN_SECRET_KEY: TEST_KEY });
  await env.DB.prepare("UPDATE plans SET status = 'active' WHERE id != 'free'").run();
  let n = 0;
  for (let i = 0; i < 200; i++) {
    const x = await handle(req("/v1/billing/checkout", { headers: TS, method: "POST", ip: "10.1." + i + ".1", body: { plan_id: "pro", period: "month", accept_terms: true, age_confirm: "adult", buyer: { name: "x" } } }), env, { fetch: opn.fetch });
    if (x.status === 201) n++; else assert.equal(x.status, 429);
  }
  assert.equal(n, CHECKOUT_GLOBAL_HOUR);
  const env2 = createEnv({ FREE_MODE: "false", BILLING_ENABLED: "true", ...TSV, OPN_SECRET_KEY: TEST_KEY, CHECKOUT_GLOBAL_HOUR: "3" });
  await env2.DB.prepare("UPDATE plans SET status = 'active' WHERE id != 'free'").run();
  const s2 = [];
  for (let i = 0; i < 5; i++) s2.push((await handle(req("/v1/billing/checkout", { headers: TS, method: "POST", ip: "10.2." + i + ".1", body: { plan_id: "pro", accept_terms: true, age_confirm: "adult" } }), env2, { fetch: opn.fetch })).status);
  assert.deepEqual(s2, [201, 201, 201, 429, 429], "CHECKOUT_GLOBAL_HOUR var overrides the cap");
});

test("Turnstile fails CLOSED on checkout: not configured -> 503; bad token -> 403; nothing created", async () => {
  const { handle } = await import(B + "index.js");
  const opn = fakeOpn();
  for (const vars of [{}, { TURNSTILE_SECRET: "ts-secret" }]) {
    const env = createEnv({ FREE_MODE: "false", BILLING_ENABLED: "true", OPN_SECRET_KEY: TEST_KEY, ALLOW_GUEST_CHECKOUT: "true", ...vars });
    await env.DB.prepare("UPDATE plans SET status = 'active' WHERE id = 'pro'").run();
    const r = await handle(req("/v1/billing/checkout", { headers: TS, method: "POST", body: { plan_id: "pro", accept_terms: true, age_confirm: "adult" } }), env, { fetch: opn.fetch });
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /turnstile_not_configured/);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM customers").first()).n, 0);
  }
  const env = createEnv({ FREE_MODE: "false", BILLING_ENABLED: "true", ...TSV, OPN_SECRET_KEY: TEST_KEY });
  await env.DB.prepare("UPDATE plans SET status = 'active' WHERE id = 'pro'").run();
  const bad = await handle(req("/v1/billing/checkout", { headers: { "X-Turnstile-Token": "bad" }, method: "POST", body: { plan_id: "pro", accept_terms: true, age_confirm: "adult" } }), env, { fetch: opn.fetch });
  assert.equal(bad.status, 403);
  assert.equal(opn.calls.length, 0, "Opn never called");
});
