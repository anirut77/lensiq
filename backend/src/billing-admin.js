// @ts-check
// backend/src/billing-admin.js — owner money operations and plan / price editing (admin API, audited by the router).
// Money ops need re-authentication in the request body ({password, totp}; auth.reauthOwner, checked by the router).
//
//   refundPayment        manual refund (PromptPay cannot be refunded through Opn: bank transfer, reference recorded);
//                        round 11: partial refunds ('partially_refunded'), only what THIS payment bought is revoked
//                        (pro rata credits / subscription days), credit-note numbers for VAT tax invoices,
//                        ledger row kind 'refund' (shown in the member's history)
//   cancelSubscription   status 'cancelled' (quota back to the member tier at once)
//   extendSubscription   + N days (from max(now, current end)), re-activates an expired / cancelled one
//   grantComplimentary   complimentary plan for N days (subscription source 'comp') or credits (source 'comp')
//   upsertPlan           create / edit a plan: names, prices (satang), status, sort, kind, audience, entitlements
import { PERKS } from "./constants.js";
import { randomId } from "./crypto.js";
import { grantCredits } from "./quota.js";
import { ledger } from "./members.js";
import { HttpError, bkkDay, intVar, now } from "./util.js";

const ID_RE = /^[a-f0-9]{32}$/;
const SUB_RE = /^[A-Za-z0-9_-]{1,40}$/;
const PLAN_RE = /^[a-z][a-z0-9_]{1,31}$/;
const text = (v, max, field, required = false) => {
  if (v == null || v === "") { if (required) throw new HttpError(400, `${field} required`); return null; }
  if (typeof v !== "string") throw new HttpError(400, `${field} must be text`);
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
  if (!s && required) throw new HttpError(400, `${field} required`);
  if (s.length > max) throw new HttpError(400, `${field} too long (max ${max})`);
  return s || null;
};

async function paymentRow(db, id) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "payment not found");
  const p = await db.prepare("SELECT * FROM payments WHERE id = ?1").bind(id).first();
  if (!p) throw new HttpError(404, "payment not found");
  return p;
}

export async function adminPayment(env, id) {
  const p = await paymentRow(env.DB, id);
  const credits = (await env.DB.prepare("SELECT id, feature, granted, remaining, expires_at FROM credits WHERE payment_id = ?1").bind(p.id).all()).results || [];
  const sub = p.subscription_id ? await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?1").bind(p.subscription_id).first() : null;
  const { idem_scope: _s, fulfil_token: _f, refund_token: _r, ...rest } = p;
  const refunds = (await refundsOf(env.DB, p.id)).map(r => ({ ...r, credit_note_path: r.credit_note_no ? `/admin/api/billing/payments/${p.id}/refunds/${r.id}/credit-note` : null }));
  return { payment: rest, subscription: sub, credits, refunds, receipt_path: p.receipt_no ? `/admin/api/billing/payments/${p.id}/receipt` : null };
}

const PERIOD_SECONDS = { month: 30 * 86400, year: 365 * 86400 };
export const REFUNDABLE = ["successful", "partially_refunded", "mismatch"];

/**
 * Manual refund (round 11: partial refunds). body {reference (bank-transfer ref, required), amount_satang? (default:
 * everything not refunded yet), note?, cancel_subscription?, revoke_credits? = true}. Refundable: 'successful',
 * 'partially_refunded' and 'mismatch' payments; several partial refunds may follow each other up to the amount paid.
 *
 *   status          'partially_refunded' while the refunded total < amount, 'refunded' once everything was refunded
 *   credits         only the credits THIS payment granted, pro rata: floor(granted × refund / amount) per refund (the
 *                   rest on the refund that completes it) — 1 THB back on a 199 THB report revokes nothing
 *   subscription    only the time THIS payment added (payments.ext_seconds), pro rata — refunding a 149 THB renewal of a
 *                   990 THB yearly plan removes that renewal's 30 days and keeps the paid year. The subscription is
 *                   cancelled only when no paid time is left. cancel_subscription: true = old behaviour (cancel it all),
 *                   false = leave the subscription untouched
 *   credit note     when the payment was a VAT tax invoice (doc_type tax_invoice_receipt, VAT_REGISTERED at checkout) every
 *                   refund gets a gap-free credit-note number CN-YYYYMM-000001 (ใบลดหนี้, Revenue Code s.86/10),
 *                   printable at …/refunds/:n/credit-note
 * Everything (status, refund row, numbering, revocations) commits in ONE transaction, claimed with a random token.
 */
export async function refundPayment(env, id, body) {
  const db = env.DB, t = now();
  const p = await paymentRow(db, id);
  if (!REFUNDABLE.includes(p.status)) throw new HttpError(409, `a ${p.status} payment cannot be refunded`, { code: "not_refundable" });
  const reference = text(body.reference, 80, "reference", true);
  const note = text(body.note, 300, "note");
  const prev = p.refund_satang || 0;
  const left = p.amount_satang - prev;
  if (left <= 0) throw new HttpError(409, "already fully refunded", { code: "not_refundable" });
  const amount = body.amount_satang == null ? left : body.amount_satang;
  if (!Number.isInteger(amount) || amount <= 0 || amount > left) throw new HttpError(400, `amount_satang must be an integer 1–${left}`);
  const total = prev + amount;
  const full = total >= p.amount_satang;
  const status = full ? "refunded" : "partially_refunded";
  const tok = randomId(16);
  const g = "EXISTS (SELECT 1 FROM payments WHERE id = ?9 AND refund_token = ?10)"; // ?9 payment id, ?10 token
  const stmts = [
    db.prepare("UPDATE payments SET status = ?1, refund_ref = ?2, refund_satang = ?3, refund_note = ?4, refunded_at = ?5, updated_at = ?5, refund_token = ?6 " +
      "WHERE id = ?7 AND status = ?8 AND COALESCE(refund_satang, 0) = ?9").bind(status, reference, total, note, t, tok, p.id, p.status, prev)
  ];
  // credit note (ใบลดหนี้) for a VAT tax invoice: counter moves only when the claim above changed the row
  const vatDoc = p.vat_rate_bp > 0 && p.doc_type === "tax_invoice_receipt";
  const ym = bkkDay(t).slice(0, 7).replace("-", "");
  const cnName = "credit_note:" + ym;
  if (vatDoc) stmts.push(db.prepare("INSERT INTO counters (name, value) SELECT ?1, 1 WHERE changes() = 1 ON CONFLICT (name) DO UPDATE SET value = value + 1").bind(cnName));
  // what to take back (computed from the rows now; applied with MAX(0, …) so a credit used meanwhile is never negative)
  let creditsRevoked = 0, secondsRemoved = 0, cancel = false;
  if (body.revoke_credits !== false && p.status !== "mismatch") {
    const rows = (await db.prepare("SELECT id, granted, remaining FROM credits WHERE payment_id = ?1 AND remaining > 0").bind(p.id).all()).results || [];
    for (const c of rows) {
      const n = full ? c.remaining : Math.min(c.remaining, Math.floor(c.granted * amount / p.amount_satang));
      if (n <= 0) continue;
      creditsRevoked += n;
      stmts.push(db.prepare(`UPDATE credits SET remaining = MAX(0, remaining - ?1) WHERE id = ?2 AND ${g.replace("?9", "?3").replace("?10", "?4")}`).bind(n, c.id, p.id, tok));
    }
  }
  const sub = p.subscription_id ? await db.prepare("SELECT * FROM subscriptions WHERE id = ?1").bind(p.subscription_id).first() : null;
  if (sub && body.cancel_subscription !== false && sub.status === "active") {
    if (body.cancel_subscription === true) cancel = true;
    else {
      const paid = Number.isInteger(p.ext_seconds) ? p.ext_seconds : PERIOD_SECONDS[p.period] || 0;
      const done = await db.prepare("SELECT COALESCE(SUM(seconds_removed), 0) AS s FROM refunds WHERE payment_id = ?1").bind(p.id).first();
      secondsRemoved = full ? Math.max(0, paid - Number(done.s)) : Math.min(Math.max(0, paid - Number(done.s)), Math.round(paid * amount / p.amount_satang));
      cancel = sub.current_period_end - secondsRemoved <= t;
    }
    const why = "refund " + p.id.slice(0, 8);
    if (secondsRemoved && !cancel) {
      stmts.push(db.prepare(`UPDATE subscriptions SET current_period_end = current_period_end - ?1, updated_at = ?2, note = ?3 WHERE id = ?4 AND status = 'active' AND ${g.replace("?9", "?5").replace("?10", "?6")}`)
        .bind(secondsRemoved, t, why, sub.id, p.id, tok));
    }
    if (cancel) {
      stmts.push(db.prepare(`UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?1, updated_at = ?1, current_period_end = MAX(current_period_start, current_period_end - ?2), note = ?3 WHERE id = ?4 AND status = 'active' AND ${g.replace("?9", "?5").replace("?10", "?6")}`)
        .bind(t, secondsRemoved, why, sub.id, p.id, tok));
    }
  }
  stmts.push(db.prepare("INSERT INTO refunds (payment_id, ts, amount_satang, reference, note, credit_note_no, seconds_removed, credits_revoked, subscription_cancelled) " +
    `SELECT ?1, ?2, ?3, ?4, ?5, CASE WHEN ?6 = 1 THEN 'CN-' || ?7 || '-' || printf('%06d', (SELECT value FROM counters WHERE name = ?8)) END, ?11, ?12, ?13 WHERE ${g}`)
    .bind(p.id, t, amount, reference, note, vatDoc ? 1 : 0, ym, cnName, p.id, tok, secondsRemoved, creditsRevoked, cancel ? 1 : 0));
  if (full) stmts.push(db.prepare(`UPDATE alerts SET acknowledged_at = ?1 WHERE ref = ?2 AND acknowledged_at IS NULL AND ${g.replace("?9", "?3").replace("?10", "?4")}`).bind(t, p.id, p.id, tok));
  const res = await db.batch(stmts);
  if (!res[0].meta || !res[0].meta.changes) throw new HttpError(409, "payment changed meanwhile — reload", { code: "not_refundable" });
  const row = await db.prepare("SELECT id, credit_note_no FROM refunds WHERE payment_id = ?1 ORDER BY id DESC LIMIT 1").bind(p.id).first();
  if (p.user_id) await ledger(env, p.user_id, "refund", { ref: p.id, amount }, t);
  return {
    ok: true, payment_id: p.id, status, refund_satang: amount, refunded_total_satang: total, remaining_refundable_satang: p.amount_satang - total,
    subscription_cancelled: cancel, subscription_seconds_removed: secondsRemoved, credits_revoked: creditsRevoked,
    receipt_no: p.receipt_no, refund_id: row ? row.id : null, credit_note_no: row ? row.credit_note_no : null,
    credit_note_path: row && row.credit_note_no ? `/admin/api/billing/payments/${p.id}/refunds/${row.id}/credit-note` : null
  };
}

/** Refund rows of a payment (admin detail, member history, credit notes). */
export async function refundsOf(db, paymentId) {
  return (await db.prepare("SELECT id, ts, amount_satang, reference, note, credit_note_no, seconds_removed, credits_revoked, subscription_cancelled FROM refunds WHERE payment_id = ?1 ORDER BY id").bind(paymentId).all()).results || [];
}

async function subRow(db, id) {
  if (!SUB_RE.test(String(id || ""))) throw new HttpError(404, "subscription not found");
  const s = await db.prepare("SELECT * FROM subscriptions WHERE id = ?1").bind(id).first();
  if (!s) throw new HttpError(404, "subscription not found");
  return s;
}

export async function cancelSubscription(env, id, body = {}) {
  const s = await subRow(env.DB, id), t = now();
  if (s.status === "cancelled") return { ok: true, subscription: s, unchanged: true };
  await env.DB.prepare("UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?1, updated_at = ?1, note = ?2 WHERE id = ?3").bind(t, text(body.reason, 200, "reason") || "admin", s.id).run();
  return { ok: true, subscription: await subRow(env.DB, id) };
}

/** body {days: 1–3650, reason?} — also re-activates an expired / cancelled subscription. */
export async function extendSubscription(env, id, body = {}) {
  const s = await subRow(env.DB, id), t = now();
  const days = body.days;
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new HttpError(400, "days must be an integer 1–3650");
  const end = Math.max(s.current_period_end, t) + days * 86400;
  await env.DB.prepare("UPDATE subscriptions SET status = 'active', cancelled_at = NULL, current_period_end = ?1, updated_at = ?2, note = ?3 WHERE id = ?4")
    .bind(end, t, text(body.reason, 200, "reason") || `extended ${days} d`, s.id).run();
  if (s.user_id) await ledger(env, s.user_id, "grant", { ref: s.id }, t);
  return { ok: true, subscription: await subRow(env.DB, id) };
}

/** body {plan_id, days: 1–3650, reason?} (complimentary subscription) or {feature, credits: 1–1000, days?, reason?}. */
export async function grantComplimentary(env, userId, body = {}) {
  const db = env.DB, t = now();
  if (!ID_RE.test(String(userId || ""))) throw new HttpError(404, "member not found");
  const u = await db.prepare("SELECT id, email, status FROM users WHERE id = ?1").bind(userId).first();
  if (!u) throw new HttpError(404, "member not found");
  const reason = text(body.reason, 200, "reason") || "complimentary";
  if (body.feature != null) {
    if (!PERKS[body.feature] || PERKS[body.feature].status !== "active") throw new HttpError(400, "unknown or inactive feature");
    if (!Number.isInteger(body.credits) || body.credits < 1 || body.credits > 1000) throw new HttpError(400, "credits must be an integer 1–1000");
    const days = body.days == null ? 365 : body.days;
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new HttpError(400, "days must be an integer 1–3650");
    const id = await grantCredits(db, { userId, feature: body.feature, n: body.credits, source: "comp", t, days });
    await ledger(env, userId, "grant", { ref: body.feature }, t);
    return { ok: true, credit_id: id, feature: body.feature, credits: body.credits, expires_at: t + days * 86400 };
  }
  const plan = await db.prepare("SELECT * FROM plans WHERE id = ?1").bind(String(body.plan_id || "")).first();
  if (!plan || plan.id === "free" || plan.kind === "one_time") throw new HttpError(400, "plan_id must be a subscription plan (not free / one-time)");
  if (!Number.isInteger(body.days) || body.days < 1 || body.days > 3650) throw new HttpError(400, "days must be an integer 1–3650");
  let cust = await db.prepare("SELECT id FROM customers WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(userId).first();
  if (!cust) {
    cust = { id: randomId(12) };
    await db.prepare("INSERT INTO customers (id, email, created_at, user_id) VALUES (?1, ?2, ?3, ?4)").bind(cust.id, u.email, t, userId).run();
  }
  const id = randomId(12);
  await db.prepare("INSERT INTO subscriptions (id, customer_id, plan_id, status, period, current_period_start, current_period_end, created_at, updated_at, user_id, source, note) " +
    "VALUES (?1, ?2, ?3, 'active', 'comp', ?4, ?5, ?4, ?4, ?6, 'comp', ?7)").bind(id, cust.id, plan.id, t, t + body.days * 86400, userId, reason).run();
  await ledger(env, userId, "grant", { ref: id }, t);
  return { ok: true, subscription: await subRow(db, id) };
}

export async function adminSubscriptions(db, q = {}) {
  const limit = intVar(q.limit, 50, 1, 200), offset = intVar(q.offset, 0, 0, 1e6);
  const user = ID_RE.test(String(q.user_id || "")) ? q.user_id : null;
  const st = ["active", "cancelled", "expired"].includes(q.status) ? q.status : null;
  const rows = (await db.prepare("SELECT s.*, u.email FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id WHERE (?1 IS NULL OR s.user_id = ?1) AND (?2 IS NULL OR s.status = ?2) " +
    "ORDER BY s.updated_at DESC LIMIT ?3 OFFSET ?4").bind(user, st, limit, offset).all()).results || [];
  return { subscriptions: rows };
}

/** Member detail for the admin: profile, subscriptions, payments, credits, last 100 ledger rows. */
export async function adminMemberDetail(env, id) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "member not found");
  const db = env.DB;
  const u = await db.prepare("SELECT id, email, display_name, status, created_at, last_login_at, marketing_opt_in, consent_version FROM users WHERE id = ?1").bind(id).first();
  if (!u) throw new HttpError(404, "member not found");
  const all = async sql => (await db.prepare(sql).bind(id).all()).results || [];
  return {
    user: u,
    subscriptions: await all("SELECT * FROM subscriptions WHERE user_id = ?1 ORDER BY current_period_end DESC"),
    payments: await all("SELECT id, kind, plan_id, period, status, amount_satang, vat_satang, receipt_no, refund_satang, refunded_at, created_at, paid_at FROM payments WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 200"),
    credits: await all("SELECT id, feature, granted, remaining, source, payment_id, created_at, expires_at FROM credits WHERE user_id = ?1 ORDER BY created_at DESC"),
    ledger: await all("SELECT id, ts, kind, domain, ref, amount_satang FROM member_ledger WHERE user_id = ?1 ORDER BY id DESC LIMIT 100")
  };
}

// ---- alerts ----------------------------------------------------------------------------------------------------------

export async function listAlerts(db, q = {}) {
  const all = q.all === "1" || q.all === "true";
  const rows = (await db.prepare("SELECT id, ts, kind, ref, detail, acknowledged_at FROM alerts WHERE (?1 = 1 OR acknowledged_at IS NULL) ORDER BY id DESC LIMIT 200").bind(all ? 1 : 0).all()).results || [];
  const open = await db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE acknowledged_at IS NULL").first();
  return { alerts: rows.map(r => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })), open: Number(open.n) };
}

export async function ackAlert(db, id) {
  const r = await db.prepare("UPDATE alerts SET acknowledged_at = ?1 WHERE id = ?2 AND acknowledged_at IS NULL").bind(now(), Number(id)).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "alert not found or already acknowledged");
  return { ok: true };
}

// ---- plans / prices --------------------------------------------------------------------------------------------------

const PRICE_MAX = 15000000; // Opn PromptPay: at most 150,000 THB per charge
const price = (v, field) => {
  if (v === null) return null;
  if (!Number.isInteger(v) || v < 0 || v > PRICE_MAX || (v > 0 && v < 2000)) throw new HttpError(400, `${field} must be null or an integer in satang: 0 or 2000–${PRICE_MAX} (Opn minimum 20 THB)`);
  return v;
};

/**
 * PUT /admin/api/billing/plans/:id (edit) or POST /admin/api/billing/plans (create, body.id). Fields (all optional on
 * edit): name_th, name_en, name_zh, price_month_satang, price_year_satang, price_once_satang, status
 * (draft|active|retired), sort, notes, kind (subscription|one_time), audience (consumer|business),
 * entitlements {feature: {quota: null|int>=0, period: day|month|once} | null (remove)}. Returns {plan, changed}.
 */
export async function upsertPlan(env, id, body, { create = false } = {}) {
  const db = env.DB;
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid body");
  if (!PLAN_RE.test(String(id || ""))) throw new HttpError(400, "plan id must match [a-z][a-z0-9_]{1,31}");
  const cur = await db.prepare("SELECT * FROM plans WHERE id = ?1").bind(id).first();
  if (create && cur) throw new HttpError(409, "plan already exists");
  if (!create && !cur) throw new HttpError(404, "plan not found");
  const ALLOWED = ["id", "name_th", "name_en", "name_zh", "price_month_satang", "price_year_satang", "price_once_satang", "status", "sort", "notes", "kind", "audience", "entitlements"];
  for (const k of Object.keys(body)) if (!ALLOWED.includes(k)) throw new HttpError(400, `unknown field ${String(k).slice(0, 32)}`);
  const next = { ...(cur || { kind: "subscription", audience: "consumer", status: "draft", sort: 50, price_month_satang: null, price_year_satang: null, price_once_satang: null, notes: null, name_zh: null }) };
  if ("name_th" in body || create) next.name_th = text(body.name_th, 60, "name_th", true);
  if ("name_en" in body || create) next.name_en = text(body.name_en, 60, "name_en", true);
  if ("name_zh" in body) next.name_zh = text(body.name_zh, 60, "name_zh");
  if ("notes" in body) next.notes = text(body.notes, 300, "notes");
  for (const f of ["price_month_satang", "price_year_satang", "price_once_satang"]) if (f in body) next[f] = price(body[f], f);
  if ("status" in body) { if (!["draft", "active", "retired"].includes(body.status)) throw new HttpError(400, "status must be draft, active or retired"); next.status = body.status; }
  if ("sort" in body) { if (!Number.isInteger(body.sort) || body.sort < 0 || body.sort > 1000) throw new HttpError(400, "sort must be an integer 0–1000"); next.sort = body.sort; }
  if ("kind" in body) { if (!["subscription", "one_time"].includes(body.kind)) throw new HttpError(400, "kind must be subscription or one_time"); next.kind = body.kind; }
  if ("audience" in body) { if (!["consumer", "business"].includes(body.audience)) throw new HttpError(400, "audience must be consumer or business"); next.audience = body.audience; }
  if (id === "free") {
    if (next.status !== "active" || next.kind !== "subscription" || (next.price_month_satang || 0) > 0 || (next.price_year_satang || 0) > 0 || next.price_once_satang) throw new HttpError(400, "the free plan stays active, recurring and at 0 THB");
  }
  if (next.status === "active" && id !== "free" && id !== "enterprise") {
    const ok = next.kind === "one_time" ? next.price_once_satang > 0 : (next.price_month_satang > 0 || next.price_year_satang > 0);
    if (!ok) throw new HttpError(400, next.kind === "one_time" ? "an active one-time plan needs price_once_satang" : "an active subscription plan needs a monthly or yearly price");
  }
  const ents = body.entitlements;
  const entOps = [];
  if (ents != null) {
    if (typeof ents !== "object" || Array.isArray(ents)) throw new HttpError(400, "entitlements must be an object");
    for (const [feature, e] of Object.entries(ents)) {
      if (!PERKS[feature]) throw new HttpError(400, `unknown feature ${String(feature).slice(0, 32)} (see perks)`);
      if (e === null) { entOps.push(db.prepare("DELETE FROM entitlements WHERE plan_id = ?1 AND feature = ?2").bind(id, feature)); continue; }
      if (!e || typeof e !== "object") throw new HttpError(400, "entitlement must be {quota, period} or null");
      if (e.quota !== null && !(Number.isInteger(e.quota) && e.quota >= 0 && e.quota <= 1000000)) throw new HttpError(400, "quota must be null (unlimited) or an integer 0–1000000");
      const period = e.period || (next.kind === "one_time" ? "once" : "month");
      if (next.kind === "one_time" ? period !== "once" : !["day", "month"].includes(period)) throw new HttpError(400, next.kind === "one_time" ? "one-time plans grant credits: period must be 'once'" : "period must be day or month");
      entOps.push(db.prepare("INSERT INTO entitlements (plan_id, feature, quota, period) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (plan_id, feature) DO UPDATE SET quota = excluded.quota, period = excluded.period").bind(id, feature, e.quota, period));
    }
  }
  const planStmt = create
    ? db.prepare("INSERT INTO plans (id, name_th, name_en, name_zh, price_month_satang, price_year_satang, price_once_satang, status, sort, notes, kind, audience) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)")
      .bind(id, next.name_th, next.name_en, next.name_zh, next.price_month_satang, next.price_year_satang, next.price_once_satang, next.status, next.sort, next.notes, next.kind, next.audience)
    : db.prepare("UPDATE plans SET name_th = ?2, name_en = ?3, name_zh = ?4, price_month_satang = ?5, price_year_satang = ?6, price_once_satang = ?7, status = ?8, sort = ?9, notes = ?10, kind = ?11, audience = ?12 WHERE id = ?1")
      .bind(id, next.name_th, next.name_en, next.name_zh, next.price_month_satang, next.price_year_satang, next.price_once_satang, next.status, next.sort, next.notes, next.kind, next.audience);
  await db.batch([planStmt, ...entOps]);
  const changed = Object.keys(body).filter(k => k !== "id");
  const plan = await db.prepare("SELECT * FROM plans WHERE id = ?1").bind(id).first();
  const entRows = (await db.prepare("SELECT feature, quota, period FROM entitlements WHERE plan_id = ?1").bind(id).all()).results || [];
  return {
    plan: { ...plan, entitlements: Object.fromEntries(entRows.map(e => [e.feature, { quota: e.quota, period: e.period, status: PERKS[e.feature] ? PERKS[e.feature].status : "coming_soon" }])) },
    changed,
    prices: { from: cur ? { month: cur.price_month_satang, year: cur.price_year_satang, once: cur.price_once_satang ?? null } : null, to: { month: plan.price_month_satang, year: plan.price_year_satang, once: plan.price_once_satang } }
  };
}
