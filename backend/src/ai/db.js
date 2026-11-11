// @ts-check
// backend/src/ai/db.js — ALL database access of the AI gateway, in one module, standard SQL only (SQLite / D1 today; any
// SQL database with INSERT … ON CONFLICT … RETURNING later). Nothing else under backend/src/ai touches the database.
//
// Tables:
//   settings          key 'ai_gateway' (JSON) — gateway settings; key 'ai' (JSON) — the fortune settings, kept as is
//   usage_counters    budget: day = Bangkok month 'YYYY-MM-01', subject 'ai:budget', feature = <feature>,
//                     n = micro-USD reserved + spent. Written ONLY for features with a budget cap (purged after 35 days
//                     by the daily cron, like the monthly plan quotas).
//   ai_usage_monthly  (migration 0010) monthly aggregates: (month 'YYYY-MM', feature, metric, n) — counts and sums only
//   rate_limits       per-user / global limits (store.js hitAll, shared with fortune)
//   ai_provider_keys  (migration 0012) provider keys set from the admin panel, envelope-encrypted (keystore.js)
import { getSetting, putSetting } from "../store.js";

export const BUDGET_SUBJECT = "ai:budget";

export const readSettings = (db, key, def) => getSetting(db, key, def);
export const writeSettings = (db, key, value) => putSetting(db, key, value);

/**
 * Reserves `micros` of the monthly budget of `feature` in ONE statement: the row only moves while the total stays within
 * `capMicros` (concurrent reservations can never overshoot). capMicros null = no cap (always reserved, still counted).
 * @returns {Promise<{ok: boolean, n: number|null}>}
 */
export async function reserveBudget(db, month, feature, micros, capMicros) {
  const amt = Math.max(0, Math.ceil(micros));
  const cap = capMicros == null ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.floor(capMicros));
  const r = await db.prepare(
    "INSERT INTO usage_counters (day, subject, feature, n) SELECT ?1, ?2, ?3, ?4 WHERE ?4 <= ?5 " +
    "ON CONFLICT (day, subject, feature) DO UPDATE SET n = usage_counters.n + excluded.n WHERE usage_counters.n + excluded.n <= ?5 RETURNING n"
  ).bind(month, BUDGET_SUBJECT, feature, amt, cap).first();
  return r ? { ok: true, n: Number(r.n) } : { ok: false, n: null };
}

/** Settles a reservation: adds `delta` micro-USD (negative = refund). Never below 0, never refused (already spent). */
export async function adjustBudget(db, month, feature, delta) {
  const d = Math.trunc(delta);
  if (!d) return;
  await db.prepare("UPDATE usage_counters SET n = CASE WHEN n + ?4 < 0 THEN 0 ELSE n + ?4 END WHERE day = ?1 AND subject = ?2 AND feature = ?3")
    .bind(month, BUDGET_SUBJECT, feature, d).run();
}

/** Micro-USD reserved + spent this month. */
export async function budgetUsed(db, month, feature) {
  const r = await db.prepare("SELECT n FROM usage_counters WHERE day = ?1 AND subject = ?2 AND feature = ?3").bind(month, BUDGET_SUBJECT, feature).first();
  return r ? Number(r.n) : 0;
}

/** Adds aggregate metrics (one transaction). @param {string} month 'YYYY-MM' @param {Record<string, number>} metrics */
export async function addAggregates(db, month, feature, metrics) {
  const stmts = Object.entries(metrics).filter(([, v]) => Number.isFinite(v) && v !== 0).map(([k, v]) =>
    db.prepare("INSERT INTO ai_usage_monthly (month, feature, metric, n) VALUES (?1, ?2, ?3, ?4) " +
      "ON CONFLICT (month, feature, metric) DO UPDATE SET n = ai_usage_monthly.n + excluded.n").bind(month, feature, String(k).slice(0, 60), Math.round(v)));
  if (stmts.length) await db.batch(stmts);
}

/** A month's aggregates {feature: {metric: n}} and budget counters {feature: micro-USD}. @param {string} month 'YYYY-MM' */
export async function readMonth(db, month) {
  const rows = (await db.prepare("SELECT feature, metric, n FROM ai_usage_monthly WHERE month = ?1").bind(month).all()).results || [];
  /** @type {Record<string, Record<string, number>>} */
  const agg = {};
  for (const r of rows) (agg[r.feature] = agg[r.feature] || {})[r.metric] = Number(r.n);
  const b = (await db.prepare("SELECT feature, n FROM usage_counters WHERE day = ?1 AND subject = ?2").bind(month + "-01", BUDGET_SUBJECT).all()).results || [];
  /** @type {Record<string, number>} */
  const budget = Object.fromEntries(b.map(r => [r.feature, Number(r.n)]));
  return { agg, budget };
}

// ---- provider keys set from the admin panel (migration 0012; encryption in keystore.js) ------------------------------
/** Every stored row (encrypted). */
export async function keyRows(db) {
  return (await db.prepare("SELECT provider, key_enc, last4, set_at, checked_at, check_ok FROM ai_provider_keys").all()).results || [];
}
/** Insert or replace one provider's key; returns the previous last 4 (null when there was none). */
export async function putKeyRow(db, provider, keyEnc, last4, t) {
  const prev = await db.prepare("SELECT last4 FROM ai_provider_keys WHERE provider = ?1").bind(provider).first();
  await db.prepare("INSERT INTO ai_provider_keys (provider, key_enc, last4, set_at, checked_at, check_ok) VALUES (?1, ?2, ?3, ?4, NULL, NULL) " +
    "ON CONFLICT (provider) DO UPDATE SET key_enc = excluded.key_enc, last4 = excluded.last4, set_at = excluded.set_at, checked_at = NULL, check_ok = NULL")
    .bind(provider, keyEnc, last4, t).run();
  return prev ? String(prev.last4) : null;
}
/** Removes one provider's key; returns its last 4 (null when there was none). */
export async function deleteKeyRow(db, provider) {
  const r = await db.prepare("DELETE FROM ai_provider_keys WHERE provider = ?1 RETURNING last4").bind(provider).first();
  return r ? String(r.last4) : null;
}
/** Result of the last "test key". */
export async function noteKeyCheck(db, provider, ok, t) {
  await db.prepare("UPDATE ai_provider_keys SET checked_at = ?2, check_ok = ?3 WHERE provider = ?1").bind(provider, t, ok ? 1 : 0).run();
}
