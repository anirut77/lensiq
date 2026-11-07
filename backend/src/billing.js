// @ts-check
// backend/src/billing.js — plans, entitlements/quotas (enforced server-side; everything unlocked while FREE_MODE),
// one-time purchases (credits), PromptPay checkout via Opn, payment polling, Opn webhook, receipt / tax-invoice fields
// (Thai VAT 7 %), claiming a guest purchase, member entitlement checks, perk registry.
//
// Round 10:
//   * with BILLING_ENABLED, checkout needs a signed-in member (401 member_required) — a purchase is always linked to the
//     account whose quota it raises. Legacy guest checkout (customer_id + order_token returned once) only with the
//     explicit opt-in var ALLOW_GUEST_CHECKOUT=true (and membership not required); such a buyer links the purchase to
//     an account later with POST /v1/billing/claim {customer_id, order_token} (constant-time hash compare)
//   * checkEntitlement() resolves the plan from the MEMBER (subscriptions.user_id) or the customer, then uses one-time
//     credits when the period quota is used up; a refused use is never counted
//   * provider amount / currency mismatch is a FINAL state: payment status 'mismatch', webhook processed (200), audit
//     row + admin alert (alerts table); the reconcile cron skips it (it only looks at 'pending')
//   * Idempotency-Key header (or body.idempotency_key) on checkout: a retry returns the same pending payment (200)
//   * plans with status 'draft' / 'retired' cannot be bought
import { PERKS } from "./constants.js";
import { createPromptPayCharge, fetchQr, opnKey, qrUriOf, retrieveCharge, verifyWebhookSignature } from "./opn.js";
import { activeSub, consumeCredit, consumeUse, creditBalance, grantCredits, periodKey, usedOf } from "./quota.js";
import { getBillingSettings } from "./settings.js";
import { audit, callerHash, hit } from "./store.js";
import { verifyTurnstile } from "./turnstile.js";
import { HttpError, bkkDay, flag, intVar, log, now } from "./util.js";
import { randomId, randomToken, sha256Hex, timingSafeEqual } from "./crypto.js";
import { ledger, membership, optionalMember, requireMember } from "./members.js";

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

/** Perk registry for the pricing page: {feature: {status, enforcement, unit, th, en, zh}} (constants.js PERKS). */
export const perkRegistry = () => PERKS;

export async function listPlans(db, { includeDraft = true } = {}) {
  const plans = (await db.prepare("SELECT * FROM plans ORDER BY sort, id").all()).results || [];
  const ents = (await db.prepare("SELECT * FROM entitlements").all()).results || [];
  return plans.filter(p => includeDraft || p.status === "active").map(p => ({
    ...p, purchasable: purchasable(p),
    entitlements: Object.fromEntries(ents.filter(e => e.plan_id === p.id).map(e => [e.feature, { quota: e.quota, period: e.period, status: PERKS[e.feature] ? PERKS[e.feature].status : "coming_soon" }]))
  }));
}

/** A plan can be bought when it is active, not the free plan, and has a price for its kind. */
export function purchasable(p) {
  if (!p || p.status !== "active" || p.id === "free") return false;
  if (p.kind === "one_time") return Number.isInteger(p.price_once_satang) && p.price_once_satang > 0;
  return (Number.isInteger(p.price_month_satang) && p.price_month_satang > 0) || (Number.isInteger(p.price_year_satang) && p.price_year_satang > 0);
}

/** Plan of a subject: the active subscription of a member ({userId}) or a customer id (string or {customerId}), else 'free'. */
export async function planOf(db, owner, t = now()) {
  const o = typeof owner === "string" || owner == null ? { customerId: owner || null } : owner;
  const s = await activeSub(db, o, t);
  return s ? s.plan_id : "free";
}

/**
 * Server-side entitlement check. Counts usage always; enforces only when FREE_MODE is false.
 * Owner: userId (signed-in member — the plan is read from subscriptions.user_id), else customerId, else the anonymous
 * `subject` (day-salted caller hash). When the period quota is used up, a one-time credit for the feature is used.
 * A refused use is NOT counted. Returns {allowed, plan, quota, used, remaining, credits, period, via, free_mode,
 * would_block, refund} — `refund` gives the use back (quota.js giveBack) when the call then fails upstream.
 */
export async function checkEntitlement(env, subject, feature, { customerId = null, userId = null, consume = true, t = now() } = {}) {
  const db = env.DB;
  const owner = { userId, customerId: userId ? null : customerId };
  const plan = await planOf(db, owner, t);
  const ent = await db.prepare("SELECT quota, period FROM entitlements WHERE plan_id = ?1 AND feature = ?2").bind(plan, feature).first();
  const recurring = ent && ent.period !== "once";
  const period = recurring ? ent.period : "day";
  const quota = recurring ? ent.quota : 0; // unknown feature on this plan = not included (credits may still cover it)
  const subj = userId ? "u:" + userId : customerId || subject;
  const fm = freeMode(env);
  const day = periodKey(period, t);
  let used, ok, via = "quota", creditId = null;
  if (consume) {
    const r = await consumeUse(db, day, subj, feature, quota, !fm);
    used = r.used; ok = r.ok;
    if (!ok && !fm) { creditId = await consumeCredit(db, owner, feature, t); if (creditId) { ok = true; via = "credit"; } }
  } else {
    used = await usedOf(db, day, subj, feature);
    ok = quota == null || used < quota;
  }
  const credits = (await creditBalance(db, owner, t))[feature] || 0;
  if (!consume && !ok && credits > 0) { ok = true; via = "credit"; }
  const remaining = quota == null ? null : Math.max(0, quota - used);
  return {
    allowed: fm || ok, plan, quota, used, remaining, credits, period, via, free_mode: fm, would_block: !ok,
    refund: consume && (fm || ok) ? { day, subject: subj, feature, counted: via === "quota", creditId } : null
  };
}

/** Features a member may check / use through POST /api/me/entitlements/use (ai_reading goes through /api/fortune). */
const CHECKABLE = Object.keys(PERKS).filter(f => PERKS[f].status === "active" && f !== "ai_reading");

/** GET /api/me/entitlements — every perk with the member's plan quota, use this period and credits (nothing consumed). */
export async function meEntitlements(env, m) {
  const t = now();
  const out = {};
  for (const f of Object.keys(PERKS)) {
    const e = await checkEntitlement(env, null, f, { userId: m.user.id, consume: false, t });
    out[f] = { status: PERKS[f].status, enforcement: PERKS[f].enforcement, quota: e.quota, period: e.period, used: e.used, remaining: e.remaining, credits: e.credits, allowed: e.allowed };
  }
  return { plan: await planOf(env.DB, { userId: m.user.id }, t), free_mode: freeMode(env), timezone: "Asia/Bangkok", perks: out };
}

/** POST /api/me/entitlements/use {feature} — server check before the page runs a paid feature (csv_export) or opens a
 *  purchased report (report_*): counts one use / takes one credit. 200 {allowed:false} when not included. */
export async function useEntitlement(env, m, body) {
  const feature = body && body.feature;
  if (!CHECKABLE.includes(feature)) throw new HttpError(400, "unknown or not checkable feature", { code: "unknown_feature" });
  const rl = await hit(env.DB, `ent:${m.user.id}`, 300, 86400);
  if (!rl.ok) throw new HttpError(429, "too many checks today", { retryAfter: rl.retryAfter });
  const e = await checkEntitlement(env, null, feature, { userId: m.user.id, consume: true });
  if (e.allowed && e.via === "credit") await ledger(env, m.user.id, "credit", { ref: feature });
  return { feature, allowed: e.allowed, via: e.allowed ? e.via : null, plan: e.plan, quota: e.quota, used: e.used, remaining: e.remaining, credits: e.credits, period: e.period, free_mode: e.free_mode };
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

class IdempotencyConflict extends Error {}

/** @typedef {{name?: string|null, email?: string|null, tax_id?: string|null, address?: string|null, branch?: string|null}} Buyer */
/**
 * @param {Env} env
 * @param {{kind: string, planId?: string|null, period?: string|null, amount: number, buyer?: Buyer, customerId?: string|null, userId?: string|null, idem?: {scope: string, key: string}|null}} o
 * @param {{fetch?: typeof fetch}} deps
 */

async function createPayment(env, { kind, planId = null, period = null, amount, buyer = {}, customerId = null, userId = null, idem = null }, deps) {
  const { live } = opnKey(env);
  const t = now(), id = randomId(16);
  const v = splitVat(amount, flag(env.VAT_REGISTERED));
  const s = sellerOf(env);
  const expires = t + 30 * 60; // QR valid 30 min (Opn allows up to 24 h)
  try {
    await env.DB.prepare(
      "INSERT INTO payments (id, customer_id, plan_id, period, kind, livemode, amount_satang, subtotal_satang, vat_satang, vat_rate_bp, status, expires_at, " +
      "buyer_name, buyer_tax_id, buyer_address, buyer_branch, buyer_email, seller_name, seller_tax_id, seller_address, seller_branch, created_at, updated_at, user_id, idem_scope, idem_key) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pending', ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21, ?22, ?23, ?24)"
    ).bind(id, customerId, planId, period, kind, live ? 1 : 0, v.total, v.subtotal, v.vat, v.rate_bp, expires,
      buyer.name || null, buyer.tax_id || null, buyer.address || null, buyer.branch || null, buyer.email || null,
      s.seller_name, s.seller_tax_id, s.seller_address, s.seller_branch, t, userId, idem ? idem.scope : null, idem ? idem.key : null).run();
  } catch (e) {
    if (idem && /UNIQUE/i.test(String(e && e.message))) throw new IdempotencyConflict(); // a parallel retry won the race
    throw e;
  }
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

const IDEM_RE = /^[A-Za-z0-9_-]{8,64}$/;
function idempotencyKeyOf(request, body) {
  const k = request.headers.get("Idempotency-Key") ?? (body && body.idempotency_key);
  if (k == null || k === "") return null;
  if (!IDEM_RE.test(String(k))) throw new HttpError(400, "Idempotency-Key must be 8–64 characters [A-Za-z0-9_-]", { code: "bad_idempotency_key" });
  return String(k);
}

/** Response for a checkout retried with the same Idempotency-Key (no new charge, no new QR). */
function replayOf(p, planId, period) {
  if (p.plan_id !== planId || p.period !== period) throw new HttpError(422, "Idempotency-Key was already used for a different purchase", { code: "idempotency_mismatch" });
  return {
    payment_id: p.id, status: p.status, amount_satang: p.amount_satang, vat_satang: p.vat_satang, expires_at: p.expires_at,
    qr_path: `/v1/billing/payments/${p.id}/qr`, status_path: `/v1/billing/payments/${p.id}`, test_mode: !p.livemode,
    plan_id: p.plan_id, period: p.period, customer_id: p.customer_id, linked_to_account: !!p.user_id, idempotent_replay: true
  };
}

/** Guest checkout is a legacy opt-in (ALLOW_GUEST_CHECKOUT=true and membership not required). */
export const guestCheckoutAllowed = async env => flag(env.ALLOW_GUEST_CHECKOUT) && !(await membership(env)).required;

/** Public checkout (only when BILLING_ENABLED=true and FREE_MODE=false). Body {plan_id, period: month|year (ignored for
 *  one-time plans), accept_terms: true, buyer?, idempotency_key?}. A signed-in member is REQUIRED (401
 *  member_required) unless ALLOW_GUEST_CHECKOUT=true; the payment, customer and subscription / credits are linked to
 *  that user_id. Idempotency-Key (checked before Turnstile: a retry carries a new or no token) returns the earlier
 *  payment. Then Turnstile (fail closed, action "checkout"), then rate limited per caller and globally per hour.
 *  Guest (opt-in only): returns customer_id + order_token ONCE — POST /v1/billing/claim links the purchase later. */
export async function checkout(env, request, body, deps = {}) {
  if (!billingEnabled(env)) throw new HttpError(409, freeMode(env) ? "LENSIQ is free right now — no payment needed" : "billing is not enabled");
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid request");
  const member = await optionalMember(env, request);
  if (!member && !(await guestCheckoutAllowed(env))) throw new HttpError(401, "please sign in before buying (member_required)", { code: "member_required" });
  const idemKey = idempotencyKeyOf(request, body);
  const idem = idemKey ? { scope: member ? "u:" + member.user.id : "g:" + (await callerHash(env, request, "checkout")), key: idemKey } : null;
  const reqPlan = String(body.plan_id || "");
  if (idem) {
    const prev = await env.DB.prepare("SELECT * FROM payments WHERE idem_scope = ?1 AND idem_key = ?2").bind(idem.scope, idem.key).first();
    if (prev) return replayOf(prev, reqPlan, prev.period === "once" ? "once" : body.period === "year" ? "year" : "month");
  }
  const ts = await verifyTurnstile(env, request, "checkout", deps.fetch);
  if (!ts.ok) throw ts.code === "turnstile_not_configured"
    ? new HttpError(503, "checkout unavailable: Turnstile is not configured on the server (turnstile_not_configured)")
    : new HttpError(403, "bot check failed (turnstile_failed)");
  const who = await callerHash(env, request, "checkout");
  const a = await hit(env.DB, `co:${who}`, CHECKOUT_PER_CALLER_HOUR, 3600);
  if (!a.ok) throw new HttpError(429, "too many checkouts — try again later", { retryAfter: a.retryAfter });
  const g = await hit(env.DB, "co:global", intVar(env.CHECKOUT_GLOBAL_HOUR, CHECKOUT_GLOBAL_HOUR, 1, 100000), 3600);
  if (!g.ok) throw new HttpError(429, "checkout temporarily busy", { retryAfter: g.retryAfter });
  const plan = await env.DB.prepare("SELECT * FROM plans WHERE id = ?1").bind(reqPlan).first();
  // draft / retired plans (and the free plan) cannot be bought
  if (!plan || plan.id === "free" || plan.status !== "active") throw new HttpError(400, "unknown or unavailable plan", { code: "plan_unavailable" });
  const oneTime = plan.kind === "one_time";
  const period = oneTime ? "once" : body.period === "year" ? "year" : "month";
  const amount = oneTime ? plan.price_once_satang : period === "year" ? plan.price_year_satang : plan.price_month_satang;
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, "this plan is sold by quotation");
  const buyer = cleanBuyer(body.buyer || {});
  if (body.accept_terms !== true) throw new HttpError(400, "terms must be accepted");
  const pay = async args => {
    try { return await createPayment(env, { kind: "checkout", planId: plan.id, period, amount, buyer, idem, ...args }, deps); } catch (e) {
      if (!(e instanceof IdempotencyConflict)) throw e;
      return replayOf(await env.DB.prepare("SELECT * FROM payments WHERE idem_scope = ?1 AND idem_key = ?2").bind(idem.scope, idem.key).first(), plan.id, period);
    }
  };
  if (member) {
    const userId = member.user.id;
    if (!buyer.email) buyer.email = member.user.email; // receipt e-mail defaults to the signed-in account
    const cur = await env.DB.prepare("SELECT id FROM customers WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(userId).first();
    const customerId = cur ? cur.id : randomId(12);
    if (cur) await env.DB.prepare("UPDATE customers SET email = ?1, name = ?2, tax_id = ?3, address = ?4, branch = ?5 WHERE id = ?6").bind(buyer.email, buyer.name, buyer.tax_id, buyer.address, buyer.branch, customerId).run();
    else await env.DB.prepare("INSERT INTO customers (id, email, name, tax_id, address, branch, created_at, user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
      .bind(customerId, buyer.email, buyer.name, buyer.tax_id, buyer.address, buyer.branch, now(), userId).run();
    const r = await pay({ customerId, userId });
    return { plan_id: plan.id, period, ...r, customer_id: customerId, linked_to_account: true };
  }
  const customerId = randomId(12);
  const orderToken = randomToken(24);
  await env.DB.prepare("INSERT INTO customers (id, email, name, tax_id, address, branch, created_at, order_token_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
    .bind(customerId, buyer.email, buyer.name, buyer.tax_id, buyer.address, buyer.branch, now(), await sha256Hex(orderToken)).run();
  const r = await pay({ customerId });
  if (r.idempotent_replay) return r;
  return { plan_id: plan.id, period, ...r, customer_id: customerId, order_token: orderToken, claim_path: "/v1/billing/claim" };
}

/**
 * POST /v1/billing/claim {customer_id, order_token} — a signed-in member links a guest purchase (subscriptions,
 * payments, credits of that customer) to their account. The token is compared as a SHA-256 hash in constant time;
 * a customer already linked to another account is refused (409 claim_taken). Idempotent for the same member.
 */
export async function claimPurchase(env, request, body) {
  const m = await requireMember(env, request);
  const who = await callerHash(env, request, "claim");
  for (const [k, lim] of [[`claim:${who}`, 20], [`claim:u:${m.user.id}`, 10]]) {
    const rl = await hit(env.DB, k, lim, 3600);
    if (!rl.ok) throw new HttpError(429, "too many claim attempts — try again later", { retryAfter: rl.retryAfter });
  }
  const cid = String((body && body.customer_id) || ""), token = String((body && body.order_token) || "");
  if (!/^[a-f0-9]{24}$/.test(cid) || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new HttpError(400, "customer_id and order_token required", { code: "claim_invalid" });
  const c = await env.DB.prepare("SELECT id, user_id, order_token_hash FROM customers WHERE id = ?1").bind(cid).first();
  const got = await sha256Hex(token);
  const ok = timingSafeEqual(got, (c && c.order_token_hash) || "0".repeat(64)) && !!(c && c.order_token_hash);
  if (!ok) {
    await audit(env, "member", "billing.claim.denied", { user: m.user.id }, who);
    throw new HttpError(403, "customer id or order token does not match", { code: "claim_invalid" });
  }
  if (c.user_id && c.user_id !== m.user.id) throw new HttpError(409, "this purchase is already linked to another account", { code: "claim_taken" });
  const db = env.DB, uid = m.user.id;
  const res = await db.batch([
    db.prepare("UPDATE customers SET user_id = ?1 WHERE id = ?2 AND (user_id IS NULL OR user_id = ?1)").bind(uid, cid),
    db.prepare("UPDATE subscriptions SET user_id = ?1, updated_at = ?3 WHERE customer_id = ?2 AND user_id IS NULL").bind(uid, cid, now()),
    db.prepare("UPDATE payments SET user_id = ?1 WHERE customer_id = ?2 AND user_id IS NULL").bind(uid, cid),
    db.prepare("UPDATE credits SET user_id = ?1 WHERE customer_id = ?2 AND user_id IS NULL").bind(uid, cid)
  ]);
  if (!res[0].meta || !res[0].meta.changes) throw new HttpError(409, "this purchase is already linked to another account", { code: "claim_taken" });
  const n = i => (res[i].meta && res[i].meta.changes) || 0;
  if (n(2)) {
    const paid = (await db.prepare("SELECT id, amount_satang FROM payments WHERE customer_id = ?1 AND status = 'successful'").bind(cid).all()).results || [];
    for (const p of paid) await ledger(env, uid, "claim", { ref: p.id, amount: p.amount_satang });
  }
  await audit(env, "member", "billing.claim", { user: uid, customer: cid, subscriptions: n(1), payments: n(2), credits: n(3) }, who);
  const sub = await activeSub(db, { userId: uid });
  return { ok: true, linked: { subscriptions: n(1), payments: n(2), credits: n(3) }, plan: sub ? { id: sub.plan_id, current_period_end: sub.current_period_end } : null, credits: await creditBalance(db, { userId: uid }) };
}

/** Admin-only test charge — refuses live keys unless OPN_ALLOW_LIVE (opnKey). */
export async function adminTestCharge(env, body, deps = {}) {
  const amount = Number.isInteger(body.amount_satang) ? body.amount_satang : 2000;
  return createPayment(env, { kind: "admin_test", amount }, deps);
}

async function activate(env, p, t) {
  if (!p.customer_id || !p.plan_id || p.kind !== "checkout") return null;
  const plan = await env.DB.prepare("SELECT kind FROM plans WHERE id = ?1").bind(p.plan_id).first();
  if (p.period === "once" || (plan && plan.kind === "one_time")) {
    // one-time purchase: the plan's 'once' entitlements become credits of the buyer (member, or customer until claimed)
    const ents = (await env.DB.prepare("SELECT feature, quota FROM entitlements WHERE plan_id = ?1 AND period = 'once'").bind(p.plan_id).all()).results || [];
    for (const e of ents) if (Number.isInteger(e.quota) && e.quota > 0) await grantCredits(env.DB, { userId: p.user_id || null, customerId: p.customer_id, paymentId: p.id, feature: e.feature, n: e.quota, t });
    return null;
  }
  const len = p.period === "year" ? 365 * 86400 : 30 * 86400;
  const cur = await env.DB.prepare("SELECT * FROM subscriptions WHERE (customer_id = ?1 OR (?3 IS NOT NULL AND user_id = ?3)) AND plan_id = ?2 AND status = 'active' ORDER BY current_period_end DESC LIMIT 1")
    .bind(p.customer_id, p.plan_id, p.user_id || null).first();
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
    // FINAL state (round 10): never retried forever, never activates anything; the owner resolves it by hand
    const detail = { expected: p.amount_satang, amount: Number(charge.amount) || 0, currency: String(charge.currency || "").slice(0, 8), provider_status: st };
    const r = await env.DB.prepare("UPDATE payments SET status = 'mismatch', failure_code = 'amount_mismatch', mismatch_detail = ?1, updated_at = ?2 WHERE id = ?3 AND status = 'pending'")
      .bind(JSON.stringify(detail), t, p.id).run();
    if (r.meta && r.meta.changes) {
      await audit(env, "system", "payment.mismatch", { payment: p.id, ...detail });
      await env.DB.prepare("INSERT INTO alerts (ts, kind, ref, detail) VALUES (?1, 'payment_mismatch', ?2, ?3)").bind(t, p.id, JSON.stringify(detail)).run();
      log("payment.mismatch", { expected: detail.expected, amount: detail.amount });
    }
    return "mismatch";
  }
  if (st === "successful") {
    const ym = bkkDay(t).slice(0, 7).replace("-", ""); // document month in Thai time (UTC+7)
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
  return { status: p.status, plan_id: p.plan_id, period: p.period, amount_satang: p.amount_satang, vat_satang: p.vat_satang, receipt_no: p.receipt_no, doc_type: p.doc_type, expires_at: p.expires_at, paid_at: p.paid_at };
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

/** Cron: re-checks recent pending payments with Opn (covers lost/failed webhooks). At most `limit` per run.
 *  Only status 'pending' is looked at — 'mismatch' and every other final state are skipped.
 * @param {Env} env @param {{limit?: number, t?: number, fetchImpl?: typeof fetch}} [o] */
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
  const info = {
    free_mode: freeMode(env), billing_enabled: billingEnabled(env), pricing_enabled: !!bs.pricing_page_enabled, vat_registered: flag(env.VAT_REGISTERED),
    member_required_for_checkout: !(await guestCheckoutAllowed(env)), perks: PERKS
  };
  if (info.pricing_enabled) info.plans = (await listPlans(env.DB)).map(p => ({
    id: p.id, name_th: p.name_th, name_en: p.name_en, name_zh: p.name_zh || null, kind: p.kind || "subscription", audience: p.audience || "business",
    price_month_satang: p.price_month_satang, price_year_satang: p.price_year_satang, price_once_satang: p.price_once_satang ?? null,
    status: p.status, purchasable: p.purchasable, sort: p.sort, entitlements: p.entitlements
  }));
  return info;
}

export async function adminPayments(db, q = {}) {
  const limit = intVar(q.limit, 50, 1, 200), offset = intVar(q.offset, 0, 0, 1e6);
  const st = ["pending", "successful", "failed", "expired", "mismatch", "refunded"].includes(q.status) ? q.status : null;
  const rows = (await db.prepare("SELECT id, kind, plan_id, period, status, livemode, amount_satang, subtotal_satang, vat_satang, vat_rate_bp, receipt_no, doc_type, " +
    "buyer_name, buyer_tax_id, buyer_email, provider_charge_id, failure_code, mismatch_detail, refund_satang, refund_ref, refunded_at, user_id, subscription_id, created_at, paid_at " +
    "FROM payments WHERE (?3 IS NULL OR status = ?3) ORDER BY created_at DESC LIMIT ?1 OFFSET ?2").bind(limit, offset, st).all()).results || [];
  const tot = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN status = 'successful' AND livemode = 1 THEN amount_satang END), 0) AS live_revenue, " +
    "COALESCE(SUM(CASE WHEN status = 'refunded' AND livemode = 1 THEN refund_satang END), 0) AS live_refunds, COALESCE(SUM(status = 'mismatch'), 0) AS mismatches FROM payments").first();
  return { payments: rows, total: tot.n, live_revenue_satang: tot.live_revenue, live_refunds_satang: tot.live_refunds, mismatches: Number(tot.mismatches) };
}

export async function adminWebhooks(db) {
  return { webhooks: (await db.prepare("SELECT id, provider, event_id, event_key, charge_id, signature_ok, result, received_at, processed_at FROM webhooks ORDER BY received_at DESC LIMIT 100").all()).results || [] };
}
