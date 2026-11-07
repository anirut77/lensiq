// backend/src/billing.js — plans, entitlements/quotas (enforced server-side; everything unlocked while FREE_MODE),
// PromptPay checkout via Opn, payment polling, Opn webhook, receipt / tax-invoice fields (Thai VAT 7 %).
import { createPromptPayCharge, fetchQr, opnKey, qrUriOf, retrieveCharge, verifyWebhookSignature } from "./opn.js";
import { getBillingSettings } from "./settings.js";
import { audit, callerHash, hit } from "./store.js";
import { verifyTurnstile } from "./turnstile.js";
import { HttpError, dayOf, flag, intVar, log, now } from "./util.js";
import { randomId, randomToken, sha256Hex } from "./crypto.js";
import { ledger, membership, optionalMember } from "./members.js";

/** FREE_MODE defaults to true: a missing/garbled variable never starts charging or limiting anybody. */
export const freeMode = env => String(env.FREE_MODE ?? "true").toLowerCase() !== "false";
export const billingEnabled = env => flag(env.BILLING_ENABLED) && !freeMode(env);

export const VAT_RATE_BP = 700; // 7.00 %
/** VAT-inclusive split (Thai B2C prices are quoted VAT-inclusive). Not VAT-registered -> no VAT, receipt only. */
export function splitVat(totalSatang, vatRegistered) {
  if (!Number.isInteger(totalSatang) || totalSatang < 0) throw new Error("amount must be a non-negative integer (satang)");
  if (!vatRegistered) return { total: totalSatang, subtotal: totalSatang, vat: 0, rate_bp: 0 };
  const vat = Math.round(totalSatang * VAT_RATE_BP / (10000 + VAT_RATE_BP));
  return { total: totalSatang, subtotal: totalSatang - vat, vat, rate_bp: VAT_RATE_BP };
}

export async function listPlans(db, { includeDraft = true } = {}) {
  const plans = (await db.prepare("SELECT * FROM plans ORDER BY sort").all()).results || [];
  const ents = (await db.prepare("SELECT * FROM entitlements").all()).results || [];
  return plans.filter(p => includeDraft || p.status === "active").map(p => ({
    ...p, entitlements: Object.fromEntries(ents.filter(e => e.plan_id === p.id).map(e => [e.feature, { quota: e.quota, period: e.period }]))
  }));
}

/** Plan of a subject: an active subscription of a customer id, else 'free'. */
export async function planOf(db, customerId, t = now()) {
  if (!customerId) return "free";
  const s = await db.prepare("SELECT plan_id FROM subscriptions WHERE customer_id = ?1 AND status = 'active' AND current_period_end > ?2 ORDER BY current_period_end DESC LIMIT 1")
    .bind(customerId, t).first();
  return s ? s.plan_id : "free";
}

/**
 * Server-side entitlement check. Counts usage always; enforces only when FREE_MODE is false.
 * subject = customer id, or a day-salted caller hash for anonymous use. Returns {allowed, plan, quota, used, free_mode}.
 */
export async function checkEntitlement(env, subject, feature, { customerId = null, consume = true, t = now() } = {}) {
  const plan = await planOf(env.DB, customerId, t);
  const ent = await env.DB.prepare("SELECT quota, period FROM entitlements WHERE plan_id = ?1 AND feature = ?2").bind(plan, feature).first();
  const period = ent ? ent.period : "day";
  const day = period === "month" ? dayOf(t).slice(0, 7) + "-01" : dayOf(t);
  const subj = customerId || subject;
  let used = 0;
  if (consume) {
    const r = await env.DB.prepare("INSERT INTO usage_counters (day, subject, feature, n) VALUES (?1, ?2, ?3, 1) " +
      "ON CONFLICT (day, subject, feature) DO UPDATE SET n = n + 1 RETURNING n").bind(day, subj, feature).first();
    used = r ? Number(r.n) : 1;
  } else {
    const r = await env.DB.prepare("SELECT n FROM usage_counters WHERE day = ?1 AND subject = ?2 AND feature = ?3").bind(day, subj, feature).first();
    used = r ? Number(r.n) : 0;
  }
  const quota = ent ? ent.quota : 0; // unknown feature on this plan = not included
  const fm = freeMode(env);
  const within = quota == null || used <= quota;
  return { allowed: fm || within, plan, quota, used, period, free_mode: fm, would_block: !within };
}

// ---- receipts ------------------------------------------------------------------------------------------------------

const sellerOf = env => ({ seller_name: env.SELLER_NAME || null, seller_tax_id: env.SELLER_TAX_ID || null, seller_address: env.SELLER_ADDRESS || null, seller_branch: env.SELLER_BRANCH || null });

const BUYER_LIMITS = { name: 200, email: 254, tax_id: 13, address: 500, branch: 60 };
export function cleanBuyer(b) {
  const out = {};
  for (const [k, max] of Object.entries(BUYER_LIMITS)) {
    const v = b && b[k] != null ? String(b[k]).trim() : "";
    if (v.length > max) throw new HttpError(400, `buyer.${k} too long`);
    out[k] = v || null;
  }
  if (out.tax_id && !/^\d{13}$/.test(out.tax_id)) throw new HttpError(400, "buyer.tax_id must be 13 digits");
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new HttpError(400, "invalid buyer.email");
  return out;
}

async function createPayment(env, { kind, planId = null, period = null, amount, buyer = {}, customerId = null, userId = null }, deps) {
  const { live } = opnKey(env);
  const t = now(), id = randomId(16);
  const v = splitVat(amount, flag(env.VAT_REGISTERED));
  const s = sellerOf(env);
  const expires = t + 30 * 60; // QR valid 30 min (Opn allows up to 24 h)
  await env.DB.prepare(
    "INSERT INTO payments (id, customer_id, plan_id, period, kind, livemode, amount_satang, subtotal_satang, vat_satang, vat_rate_bp, status, expires_at, " +
    "buyer_name, buyer_tax_id, buyer_address, buyer_branch, buyer_email, seller_name, seller_tax_id, seller_address, seller_branch, created_at, updated_at, user_id) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pending', ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21, ?22)"
  ).bind(id, customerId, planId, period, kind, live ? 1 : 0, v.total, v.subtotal, v.vat, v.rate_bp, expires,
    buyer.name || null, buyer.tax_id || null, buyer.address || null, buyer.branch || null, buyer.email || null,
    s.seller_name, s.seller_tax_id, s.seller_address, s.seller_branch, t, userId).run();
  let charge;
  try {
    charge = await createPromptPayCharge(env, { amount, description: kind === "admin_test" ? "LENSIQ test charge" : `LENSIQ ${planId} (${period})`, paymentId: id, expiresAt: expires }, deps.fetch);
  } catch (e) {
    await env.DB.prepare("UPDATE payments SET status = 'failed', failure_code = 'create_failed', updated_at = ?1 WHERE id = ?2").bind(now(), id).run();
    throw e;
  }
  await env.DB.prepare("UPDATE payments SET provider_charge_id = ?1, qr_download_uri = ?2, updated_at = ?3 WHERE id = ?4")
    .bind(charge.id, qrUriOf(charge), now(), id).run();
  return { payment_id: id, amount_satang: v.total, vat_satang: v.vat, expires_at: expires, qr_path: `/v1/billing/payments/${id}/qr`, status_path: `/v1/billing/payments/${id}`, test_mode: !live };
}

/** Public checkout (only when BILLING_ENABLED=true and FREE_MODE=false). */
export const CHECKOUT_PER_CALLER_HOUR = 5;
/** Global hourly cap on checkouts (all callers). Override with the CHECKOUT_GLOBAL_HOUR var. */
export const CHECKOUT_GLOBAL_HOUR = 30;

/** Public checkout (only when BILLING_ENABLED=true and FREE_MODE=false). Turnstile (fail closed, action "checkout"),
 *  then rate limited per caller and globally per hour.
 *  Membership (members.js): when the owner requires sign-in, checkout needs a signed-in member (401 member_required)
 *  and the payment, customer and subscription are linked to that user_id. A signed-in member is linked even when it is
 *  not required. Without a member (legacy): returns customer_id + order_token ONCE — the buyer keeps them to link the
 *  paid plan to themselves (only the token's hash is stored). */
export async function checkout(env, request, body, deps = {}) {
  if (!billingEnabled(env)) throw new HttpError(409, freeMode(env) ? "LENSIQ is free right now — no payment needed" : "billing is not enabled");
  const member = await optionalMember(env, request);
  if (!member && (await membership(env)).required) throw new HttpError(401, "please sign in before buying a plan (member_required)", { code: "member_required" });
  const ts = await verifyTurnstile(env, request, "checkout", deps.fetch);
  if (!ts.ok) throw ts.code === "turnstile_not_configured"
    ? new HttpError(503, "checkout unavailable: Turnstile is not configured on the server (turnstile_not_configured)")
    : new HttpError(403, "bot check failed (turnstile_failed)");
  const who = await callerHash(env, request, "checkout");
  const a = await hit(env.DB, `co:${who}`, CHECKOUT_PER_CALLER_HOUR, 3600);
  if (!a.ok) throw new HttpError(429, "too many checkouts — try again later", { retryAfter: a.retryAfter });
  const g = await hit(env.DB, "co:global", intVar(env.CHECKOUT_GLOBAL_HOUR, CHECKOUT_GLOBAL_HOUR, 1, 100000), 3600);
  if (!g.ok) throw new HttpError(429, "checkout temporarily busy", { retryAfter: g.retryAfter });
  const plan = await env.DB.prepare("SELECT * FROM plans WHERE id = ?1 AND status = 'active'").bind(String(body.plan_id || "")).first();
  if (!plan || plan.id === "free") throw new HttpError(400, "unknown or unavailable plan");
  const period = body.period === "year" ? "year" : "month";
  const amount = period === "year" ? plan.price_year_satang : plan.price_month_satang;
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, "this plan is sold by quotation");
  const buyer = cleanBuyer(body.buyer || {});
  if (body.accept_terms !== true) throw new HttpError(400, "terms must be accepted");
  if (member) {
    const userId = member.user.id;
    if (!buyer.email) buyer.email = member.user.email; // receipt e-mail defaults to the signed-in account
    const cur = await env.DB.prepare("SELECT id FROM customers WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(userId).first();
    const customerId = cur ? cur.id : randomId(12);
    if (cur) await env.DB.prepare("UPDATE customers SET email = ?1, name = ?2, tax_id = ?3, address = ?4, branch = ?5 WHERE id = ?6").bind(buyer.email, buyer.name, buyer.tax_id, buyer.address, buyer.branch, customerId).run();
    else await env.DB.prepare("INSERT INTO customers (id, email, name, tax_id, address, branch, created_at, user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
      .bind(customerId, buyer.email, buyer.name, buyer.tax_id, buyer.address, buyer.branch, now(), userId).run();
    const r = await createPayment(env, { kind: "checkout", planId: plan.id, period, amount, buyer, customerId, userId }, deps);
    return { ...r, customer_id: customerId, linked_to_account: true };
  }
  const customerId = randomId(12);
  const orderToken = randomToken(24);
  await env.DB.prepare("INSERT INTO customers (id, email, name, tax_id, address, branch, created_at, order_token_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
    .bind(customerId, buyer.email, buyer.name, buyer.tax_id, buyer.address, buyer.branch, now(), await sha256Hex(orderToken)).run();
  const r = await createPayment(env, { kind: "checkout", planId: plan.id, period, amount, buyer, customerId }, deps);
  return { ...r, customer_id: customerId, order_token: orderToken };
}

/** Admin-only test charge — refuses live keys unless OPN_ALLOW_LIVE (opnKey). */
export async function adminTestCharge(env, body, deps = {}) {
  const amount = Number.isInteger(body.amount_satang) ? body.amount_satang : 2000;
  return createPayment(env, { kind: "admin_test", amount }, deps);
}

async function activate(env, p, t) {
  if (!p.customer_id || !p.plan_id || p.kind !== "checkout") return null;
  const len = p.period === "year" ? 365 * 86400 : 30 * 86400;
  const cur = await env.DB.prepare("SELECT * FROM subscriptions WHERE customer_id = ?1 AND plan_id = ?2 AND status = 'active' ORDER BY current_period_end DESC LIMIT 1")
    .bind(p.customer_id, p.plan_id).first();
  if (cur) {
    const end = Math.max(cur.current_period_end, t) + len;
    await env.DB.prepare("UPDATE subscriptions SET current_period_end = ?1, updated_at = ?2, user_id = COALESCE(user_id, ?4) WHERE id = ?3").bind(end, t, cur.id, p.user_id || null).run();
    return cur.id;
  }
  const id = randomId(12);
  await env.DB.prepare("INSERT INTO subscriptions (id, customer_id, plan_id, status, period, current_period_start, current_period_end, created_at, updated_at, user_id) VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?5, ?5, ?7)")
    .bind(id, p.customer_id, p.plan_id, p.period, t, t + len, p.user_id || null).run();
  return id;
}

/**
 * Applies the provider's charge state to our payment (idempotent; only pending -> final transitions).
 * Success is claimed and numbered in ONE transaction (db.batch): the conditional UPDATE … WHERE status='pending'
 * lets exactly one of several racing callers (webhook, poll, reconcile cron) win; the receipt counter is incremented
 * only when that UPDATE changed a row (changes() = 1), and the number is written in the same transaction — so receipt
 * numbers are gap-free and never assigned twice.
 */
export async function applyCharge(env, p, charge) {
  const t = now();
  const st = String(charge.status || "");
  if (p.status !== "pending" || !["successful", "failed", "expired"].includes(st)) return p.status;
  if (Number(charge.amount) !== p.amount_satang || String(charge.currency || "").toLowerCase() !== "thb") {
    await audit(env, "system", "payment.mismatch", { payment: p.id });
    throw new HttpError(409, "charge does not match the payment");
  }
  if (st === "successful") {
    const ym = dayOf(t).slice(0, 7).replace("-", "");
    const name = "receipt:" + ym;
    const docType = p.vat_rate_bp > 0 && p.seller_tax_id ? "tax_invoice_receipt" : "receipt";
    const db = env.DB;
    const res = await db.batch([
      db.prepare("UPDATE payments SET status = 'successful', paid_at = ?1, doc_type = ?2, updated_at = ?1 WHERE id = ?3 AND status = 'pending'").bind(t, docType, p.id),
      db.prepare("INSERT INTO counters (name, value) SELECT ?1, 1 WHERE changes() = 1 ON CONFLICT (name) DO UPDATE SET value = value + 1").bind(name),
      db.prepare("UPDATE payments SET receipt_no = 'LQ-' || ?1 || '-' || printf('%06d', (SELECT value FROM counters WHERE name = ?2)) " +
        "WHERE id = ?3 AND status = 'successful' AND receipt_no IS NULL AND paid_at = ?4").bind(ym, name, p.id, t)
    ]);
    if (res[0].meta && res[0].meta.changes) {
      const sub = await activate(env, p, t);
      if (sub) await db.prepare("UPDATE payments SET subscription_id = ?1 WHERE id = ?2").bind(sub, p.id).run();
      const row = await db.prepare("SELECT receipt_no FROM payments WHERE id = ?1").bind(p.id).first();
      await audit(env, "system", "payment.successful", { payment: p.id, receipt: row && row.receipt_no, amount: p.amount_satang });
      if (p.user_id) await ledger(env, p.user_id, "payment", { ref: p.id, amount: p.amount_satang }, t);
    }
  } else {
    await env.DB.prepare("UPDATE payments SET status = ?1, failure_code = ?2, updated_at = ?3 WHERE id = ?4 AND status = 'pending'")
      .bind(st, charge.failure_code ? String(charge.failure_code).slice(0, 40) : null, t, p.id).run();
  }
  return st;
}

const PAY_ID_RE = /^[a-f0-9]{32}$/;
async function paymentById(db, id) {
  if (!PAY_ID_RE.test(String(id || ""))) throw new HttpError(404, "payment not found");
  const p = await db.prepare("SELECT * FROM payments WHERE id = ?1").bind(id).first();
  if (!p) throw new HttpError(404, "payment not found");
  return p;
}

/** Polling endpoint: refreshes a pending payment from Opn (rate limited per payment) and returns public fields. */
export async function paymentStatus(env, id, deps = {}) {
  let p = await paymentById(env.DB, id);
  if (p.status === "pending" && p.provider_charge_id) {
    const rl = await hit(env.DB, `poll:${p.id}`, 20, 60);
    if (rl.ok) {
      const charge = await retrieveCharge(env, p.provider_charge_id, deps.fetch);
      await applyCharge(env, p, charge);
      p = await paymentById(env.DB, id);
    }
  }
  return { status: p.status, amount_satang: p.amount_satang, vat_satang: p.vat_satang, receipt_no: p.receipt_no, doc_type: p.doc_type, expires_at: p.expires_at, paid_at: p.paid_at };
}

export async function paymentQr(env, id, deps = {}) {
  const p = await paymentById(env.DB, id);
  if (p.status !== "pending" || !p.qr_download_uri) throw new HttpError(404, "no QR for this payment");
  return fetchQr(env, p.qr_download_uri, deps.fetch);
}

/**
 * POST /v1/billing/webhook/opn. Signature verified over the RAW body; the charge is then re-fetched from the Opn API —
 * the webhook payload itself is never trusted for the payment state. An event counts as a duplicate only once it was
 * PROCESSED (processed_at set): if processing fails (e.g. Opn API 503) the row stays unprocessed, we answer 5xx and
 * Opn's retry is processed normally. The reconcile cron (reconcilePending) catches anything that is still pending.
 */
export async function handleWebhook(env, request, rawBody, deps = {}) {
  if (!env.OPN_WEBHOOK_SECRET) throw new HttpError(503, "webhook secret not configured");
  const v = await verifyWebhookSignature(env.OPN_WEBHOOK_SECRET, request.headers.get("Omise-Signature-Timestamp"), request.headers.get("Omise-Signature"), rawBody, { nowSec: deps.nowSec ?? now() });
  if (!v.ok) {
    log("webhook.rejected", { reason: v.reason });
    throw new HttpError(401, "invalid signature");
  }
  let ev;
  try { ev = JSON.parse(rawBody); } catch { throw new HttpError(400, "invalid JSON"); }
  const eventId = String((ev && ev.id) || "");
  if (!/^evnt_(test_)?[0-9a-z]{6,40}$/.test(eventId)) throw new HttpError(400, "invalid event id");
  const key = String(ev.key || "").slice(0, 60);
  const chargeId = ev.data && ev.data.object === "charge" ? String(ev.data.id || "") : null;
  await env.DB.prepare("INSERT OR IGNORE INTO webhooks (provider, event_id, event_key, charge_id, signature_ok, payload, received_at) VALUES ('opn', ?1, ?2, ?3, 1, ?4, ?5)")
    .bind(eventId, key, chargeId, rawBody.slice(0, 16000), now()).run();
  const row = await env.DB.prepare("SELECT processed_at FROM webhooks WHERE provider = 'opn' AND event_id = ?1").bind(eventId).first();
  if (row && row.processed_at) return { ok: true, duplicate: true };
  let result = "ignored";
  if (chargeId && /^charge\./.test(key)) {
    const p = await env.DB.prepare("SELECT * FROM payments WHERE provider_charge_id = ?1").bind(chargeId).first();
    if (p) {
      try {
        const charge = await retrieveCharge(env, chargeId, deps.fetch); // confirm with the API
        result = await applyCharge(env, p, charge);
      } catch (e) {
        await env.DB.prepare("UPDATE webhooks SET result = ?1 WHERE provider = 'opn' AND event_id = ?2").bind("retry:" + String((e && e.status) || "error"), eventId).run();
        log("webhook.retry", { status: (e && e.status) || 0 });
        throw new HttpError(503, "processing failed — please retry");
      }
    } else result = "unknown_charge";
  }
  await env.DB.prepare("UPDATE webhooks SET result = ?1, processed_at = ?2 WHERE provider = 'opn' AND event_id = ?3").bind(result, now(), eventId).run();
  return { ok: true, result };
}

/** Cron: re-checks recent pending payments with Opn (covers lost/failed webhooks). At most `limit` per run. */
export async function reconcilePending(env, { limit = 25, t = now(), fetchImpl } = {}) {
  if (!env.OPN_SECRET_KEY) return { checked: 0, skipped: "no Opn key" };
  const rows = (await env.DB.prepare("SELECT * FROM payments WHERE status = 'pending' AND provider_charge_id IS NOT NULL AND created_at > ?1 ORDER BY created_at LIMIT ?2")
    .bind(t - 3 * 86400, limit).all()).results || [];
  const out = { checked: 0, changed: 0, errors: 0 };
  for (const p of rows) {
    out.checked++;
    try {
      const charge = await retrieveCharge(env, p.provider_charge_id, fetchImpl);
      const st = await applyCharge(env, p, charge);
      if (st !== "pending") out.changed++;
    } catch { out.errors++; }
  }
  return out;
}

export async function publicBillingInfo(env) {
  const bs = await getBillingSettings(env.DB);
  const info = { free_mode: freeMode(env), billing_enabled: billingEnabled(env), pricing_enabled: !!bs.pricing_page_enabled, vat_registered: flag(env.VAT_REGISTERED) };
  if (info.pricing_enabled) info.plans = (await listPlans(env.DB)).map(p => ({ id: p.id, name_th: p.name_th, name_en: p.name_en, price_month_satang: p.price_month_satang, price_year_satang: p.price_year_satang, status: p.status, entitlements: p.entitlements }));
  return info;
}

export async function adminPayments(db, q = {}) {
  const limit = intVar(q.limit, 50, 1, 200), offset = intVar(q.offset, 0, 0, 1e6);
  const rows = (await db.prepare("SELECT id, kind, plan_id, period, status, livemode, amount_satang, subtotal_satang, vat_satang, vat_rate_bp, receipt_no, doc_type, " +
    "buyer_name, buyer_tax_id, buyer_email, provider_charge_id, failure_code, created_at, paid_at FROM payments ORDER BY created_at DESC LIMIT ?1 OFFSET ?2").bind(limit, offset).all()).results || [];
  const tot = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN status = 'successful' AND livemode = 1 THEN amount_satang END), 0) AS live_revenue FROM payments").first();
  return { payments: rows, total: tot.n, live_revenue_satang: tot.live_revenue };
}

export async function adminWebhooks(db) {
  return { webhooks: (await db.prepare("SELECT id, provider, event_id, event_key, charge_id, signature_ok, result, received_at, processed_at FROM webhooks ORDER BY received_at DESC LIMIT 100").all()).results || [] };
}
