// @ts-check
// backend/src/quota.js — shared counting for plan quotas and one-time credits (used by billing.js, members.js,
// fortune.js). Quota days and months follow Asia/Bangkok (UTC+7).
//
//   * consumeUse() is ATOMIC and never counts a denied use: the counter only moves while it is below the quota
//     (INSERT … ON CONFLICT DO UPDATE … WHERE n < quota RETURNING n) — no "used 4 of 3" after a refusal
//   * refundUse() / refundCredit() give a use back when the call did not happen (provider failure)
//   * credits: one-time purchases (report_* plans) and complimentary grants; consumed oldest-expiring first
import { randomId } from "./crypto.js";
import { bkkDay, now } from "./util.js";

/** Counter key of a period: Bangkok day 'YYYY-MM-DD', or the Bangkok month as 'YYYY-MM-01'. */
export const periodKey = (period, t = now()) => (period === "month" ? bkkDay(t).slice(0, 7) + "-01" : bkkDay(t));

export async function usedOf(db, day, subject, feature) {
  const r = await db.prepare("SELECT n FROM usage_counters WHERE day = ?1 AND subject = ?2 AND feature = ?3").bind(day, subject, feature).first();
  return r ? Number(r.n) : 0;
}

/**
 * Counts one use. quota null = unlimited. enforce=false (FREE_MODE / gating off): always counted, never refused.
 * Returns {ok, used} — `used` after the call; on refusal the counter is unchanged.
 */
export async function consumeUse(db, day, subject, feature, quota, enforce) {
  if (!enforce || quota == null) {
    const r = await db.prepare("INSERT INTO usage_counters (day, subject, feature, n) VALUES (?1, ?2, ?3, 1) " +
      "ON CONFLICT (day, subject, feature) DO UPDATE SET n = n + 1 RETURNING n").bind(day, subject, feature).first();
    const used = r ? Number(r.n) : 1;
    return { ok: quota == null || used <= quota, used };
  }
  if (quota <= 0) return { ok: false, used: await usedOf(db, day, subject, feature) };
  const r = await db.prepare("INSERT INTO usage_counters (day, subject, feature, n) VALUES (?1, ?2, ?3, 1) " +
    "ON CONFLICT (day, subject, feature) DO UPDATE SET n = n + 1 WHERE n < ?4 RETURNING n").bind(day, subject, feature, quota).first();
  if (r) return { ok: true, used: Number(r.n) };
  return { ok: false, used: await usedOf(db, day, subject, feature) };
}

export async function refundUse(db, day, subject, feature) {
  await db.prepare("UPDATE usage_counters SET n = n - 1 WHERE day = ?1 AND subject = ?2 AND feature = ?3 AND n > 0").bind(day, subject, feature).run();
}

/** Gives back a use described by the `refund` handle of aiQuota() / checkEntitlement(). */
export async function giveBack(db, refund) {
  if (!refund) return;
  if (refund.counted) await refundUse(db, refund.day, refund.subject, refund.feature);
  if (refund.creditId) await refundCredit(db, refund.creditId);
}

// ---- credits ---------------------------------------------------------------------------------------------------------

const ownerSql = "(user_id = ?1 OR (?1 IS NULL AND customer_id = ?2))";

/** Remaining credits per feature for a member (or a not-yet-claimed customer). {feature: n} */
export async function creditBalance(db, { userId = null, customerId = null } = {}, t = now()) {
  if (!userId && !customerId) return {};
  const rows = (await db.prepare(`SELECT feature, SUM(remaining) AS n FROM credits WHERE ${ownerSql} AND remaining > 0 AND (expires_at IS NULL OR expires_at > ?3) GROUP BY feature`)
    .bind(userId, customerId, t).all()).results || [];
  return Object.fromEntries(rows.map(r => [r.feature, Number(r.n)]));
}

/** Atomically takes one credit for `feature` (the one that expires first). Returns the credit id or null. */
export async function consumeCredit(db, { userId = null, customerId = null } = {}, feature, t = now()) {
  if (!userId && !customerId) return null;
  const r = await db.prepare(`UPDATE credits SET remaining = remaining - 1 WHERE id = (SELECT id FROM credits WHERE ${ownerSql} AND feature = ?3 AND remaining > 0 ` +
    "AND (expires_at IS NULL OR expires_at > ?4) ORDER BY COALESCE(expires_at, 9e18), created_at LIMIT 1) AND remaining > 0 RETURNING id").bind(userId, customerId, feature, t).first();
  return r ? r.id : null;
}

export async function refundCredit(db, id) {
  if (id) await db.prepare("UPDATE credits SET remaining = MIN(granted, remaining + 1) WHERE id = ?1").bind(id).run();
}

/** Credit validity of one-time purchases (days). */
export const CREDIT_DAYS = 365;

export async function grantCredits(db, { userId = null, customerId = null, paymentId = null, feature, n, source = "purchase", t = now(), days = CREDIT_DAYS }) {
  const id = randomId(12);
  await db.prepare("INSERT INTO credits (id, user_id, customer_id, feature, granted, remaining, payment_id, source, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8, ?9)")
    .bind(id, userId, customerId, feature, n, paymentId, source, t, days ? t + days * 86400 : null).run();
  return id;
}

/** Active subscription of a member (user_id) or of a customer (legacy guest checkout before it was claimed). */
export async function activeSub(db, { userId = null, customerId = null } = {}, t = now()) {
  if (!userId && !customerId) return null;
  return db.prepare("SELECT s.*, p.name_th, p.name_en, p.name_zh FROM subscriptions s JOIN plans p ON p.id = s.plan_id " +
    "WHERE (s.user_id = ?1 OR (?1 IS NULL AND s.customer_id = ?2)) AND s.status = 'active' AND s.current_period_end > ?3 ORDER BY s.current_period_end DESC LIMIT 1")
    .bind(userId, customerId, t).first();
}

/** Paying member = active subscription to a paid plan, or remaining purchased credits. Exempt from the shared guest
 *  AI caps (fortune.js uses separate buckets for them). */
export async function isPaying(db, { userId = null, customerId = null } = {}, t = now()) {
  const s = await activeSub(db, { userId, customerId }, t);
  if (s && s.plan_id !== "free") return true;
  if (!userId && !customerId) return false;
  const c = await db.prepare(`SELECT 1 AS x FROM credits WHERE ${ownerSql} AND remaining > 0 AND source = 'purchase' AND (expires_at IS NULL OR expires_at > ?3) LIMIT 1`)
    .bind(userId, customerId, t).first();
  return !!c;
}
