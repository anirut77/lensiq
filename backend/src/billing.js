// backend/src/billing.js — plans, entitlements/quotas (enforced server-side; everything unlocked while FREE_MODE),
// PromptPay checkout via Opn, payment polling, Opn webhook, receipt / tax-invoice fields (Thai VAT 7 %).
import { createPromptPayCharge, fetchQr, opnKey, qrUriOf, retrieveCharge, verifyWebhookSignature } from "./opn.js";
import { getBillingSettings } from "./settings.js";
import { audit, hit } from "./store.js";
import { HttpError, dayOf, flag, intVar, log, now } from "./util.js";
import { randomId } from "./crypto.js";

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
async function nextReceiptNo(db, t) {
  const ym = dayOf(t).slice(0, 7).replace("-", "");
  const r = await db.prepare("INSERT INTO counters (name, value) VALUES (?1, 1) ON CONFLICT (name) DO UPDATE SET value = value + 1 RETURNING value")
    .bind("receipt:" + ym).first();
  return `LQ-${ym}-${String(r.value).padStart(6, "0")}`;
}

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

async function createPayment(env, { kind, planId = null, period = null, amount, buyer = {}, customerId = null }, deps) {
  const { live } = opnKey(env);
  const t = now(), id = randomId(16);
  const v = splitVat(amount, flag(env.VAT_REGISTERED));
  const s = sellerOf(env);
  const expires = t + 30 * 60; // QR valid 30 min (Opn allows up to 24 h)
  await env.DB.prepare(
    "INSERT INTO payments (id, customer_id, plan_id, period, kind, livemode, amount_satang, subtotal_satang, vat_satang, vat_rate_bp, status, expires_at, " +
    "buyer_name, buyer_tax_id, buyer_address, buyer_branch, buyer_email, seller_name, seller_tax_id, seller_address, seller_branch, created_at, updated_at) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pending', ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21)"
  ).bind(id, customerId, planId, period, kind, live ? 1 : 0, v.total, v.subtotal, v.vat, v.rate_bp, expires,
    buyer.name || null, buyer.tax_id || null, buyer.address || null, buyer.branch || null, buyer.email || null,
    s.seller_name, s.seller_tax_id, s.seller_address, s.seller_branch, t).run();
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
export async function checkout(env, body, deps = {}) {
  if (!billingEnabled(env)) throw new HttpError(409, freeMode(env) ? "LENSIQ is free right now — no payment needed" : "billing is not enabled");
  const plan = await env.DB.prepare("SELECT * FROM plans WHERE id = ?1 AND status = 'active'").bind(String(body.plan_id || "")).first();
  if (!plan || plan.id === "free") throw new HttpError(400, "unknown or unavailable plan");
  const period = body.period === "year" ? "year" : "month";
  const amount = period === "year" ? plan.price_year_satang : plan.price_month_satang;
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, "this plan is sold by quotation");
  const buyer = cleanBuyer(body.buyer || {});
  if (body.accept_terms !== true) throw new HttpError(400, "terms must be accepted");
  const customerId = randomId(12);
  await env.DB.prepare("INSERT INTO customers (id, email, name, tax_id, address, branch, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(customerId, buyer.email, buyer.name, buyer.tax_id, buyer.address, buyer.branch, now()).run();
  return createPayment(env, { kind: "checkout", planId: plan.id, period, amount, buyer, customerId }, deps);
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
    await env.DB.prepare("UPDATE subscriptions SET current_period_end = ?1, updated_at = ?2 WHERE id = ?3").bind(end, t, cur.id).run();
    return cur.id;
  }
  const id = randomId(12);
  await env.DB.prepare("INSERT INTO subscriptions (id, customer_id, plan_id, status, period, current_period_start, current_period_end, created_at, updated_at) VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?5, ?5)")
    .bind(id, p.customer_id, p.plan_id, p.period, t, t + len).run();
  return id;
}

/** Applies the provider's charge state to our payment (idempotent; only pending -> final transitions). */
export async function applyCharge(env, p, charge) {
  const t = now();
  const st = String(charge.status || "");
  if (p.status !== "pending" || !["successful", "failed", "expired"].includes(st)) return p.status;
  if (Number(charge.amount) !== p.amount_satang || String(charge.currency || "").toLowerCase() !== "thb") {
    await audit(env, "system", "payment.mismatch", { payment: p.id });
    throw new HttpError(409, "charge does not match the payment");
  }
  if (st === "successful") {
    const receipt = await nextReceiptNo(env.DB, t);
    const docType = p.vat_rate_bp > 0 && p.seller_tax_id ? "tax_invoice_receipt" : "receipt";
    const r = await env.DB.prepare("UPDATE payments SET status = 'successful', paid_at = ?1, receipt_no = ?2, doc_type = ?3, updated_at = ?1 WHERE id = ?4 AND status = 'pending'")
      .bind(t, receipt, docType, p.id).run();
    if (r.meta && r.meta.changes) {
      const sub = await activate(env, p, t);
      if (sub) await env.DB.prepare("UPDATE payments SET subscription_id = ?1 WHERE id = ?2").bind(sub, p.id).run();
      await audit(env, "system", "payment.successful", { payment: p.id, receipt, amount: p.amount_satang });
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
 * POST /v1/billing/webhook/opn. Signature verified over the RAW body; events deduplicated; the charge is then
 * re-fetched from the Opn API — the webhook payload itself is never trusted for the payment state.
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
  const ins = await env.DB.prepare("INSERT OR IGNORE INTO webhooks (provider, event_id, event_key, charge_id, signature_ok, payload, received_at) VALUES ('opn', ?1, ?2, ?3, 1, ?4, ?5)")
    .bind(eventId, key, chargeId, rawBody.slice(0, 16000), now()).run();
  if (!ins.meta || !ins.meta.changes) return { ok: true, duplicate: true };
  let result = "ignored";
  if (chargeId && /^charge\./.test(key)) {
    const p = await env.DB.prepare("SELECT * FROM payments WHERE provider_charge_id = ?1").bind(chargeId).first();
    if (p) {
      const charge = await retrieveCharge(env, chargeId, deps.fetch); // confirm with the API
      result = await applyCharge(env, p, charge);
    } else result = "unknown_charge";
  }
  await env.DB.prepare("UPDATE webhooks SET result = ?1, processed_at = ?2 WHERE provider = 'opn' AND event_id = ?3").bind(result, now(), eventId).run();
  return { ok: true, result };
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
