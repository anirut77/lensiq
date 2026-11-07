// backend/src/retention.js — daily maintenance (cron "17 3 * * *"): aggregate first, then purge.
//
//   raw analytics events        RAW_EVENT_DAYS (90)   — only days already aggregated are deleted
//   daily_agg (aggregates)      kept
//   daily salts                 deleted from the next day on (visitor hashes become unlinkable)
//   rate-limit windows          1 day
//   admin sessions              at expiry; trusted admin devices 90 days
//   usage counters              35 days
//   webhook raw payloads        WEBHOOK_PAYLOAD_DAYS (90); the event row (id, status) is kept with the payment
//   audit log                   AUDIT_DAYS (400)
//   payments / receipts         kept (Thai Revenue Code: accounting & tax documents >= 5 years) — never purged here
import { aggregatePending } from "./analytics.js";
import { audit } from "./store.js";
import { addDays, dayOf, intVar, now } from "./util.js";

export function retentionConfig(env) {
  return {
    rawEventDays: intVar(env.RAW_EVENT_DAYS, 90, 1, 3650),
    auditDays: intVar(env.AUDIT_DAYS, 400, 30, 3650),
    webhookPayloadDays: intVar(env.WEBHOOK_PAYLOAD_DAYS, 90, 1, 3650),
    usageDays: 35
  };
}

export async function purge(env, t = now()) {
  const c = retentionConfig(env);
  const today = dayOf(t);
  const db = env.DB;
  const cutoff = addDays(today, -c.rawEventDays);
  const run = async (sql, ...args) => { const r = await db.prepare(sql).bind(...args).run(); return (r.meta && r.meta.changes) || 0; };
  const out = {
    events: await run("DELETE FROM events WHERE day < ?1 AND day IN (SELECT day FROM daily_agg WHERE metric = 'events')", cutoff),
    salts: await run("DELETE FROM daily_salts WHERE day < ?1", today),
    rate_limits: await run("DELETE FROM rate_limits WHERE window_start < ?1", t - 86400),
    sessions: await run("DELETE FROM admin_sessions WHERE expires_at < ?1", t),
    devices: await run("DELETE FROM admin_devices WHERE created_at < ?1", t - 90 * 86400),
    usage: await run("DELETE FROM usage_counters WHERE day < ?1", addDays(today, -c.usageDays)),
    webhook_payloads: await run("UPDATE webhooks SET payload = NULL WHERE payload IS NOT NULL AND received_at < ?1", t - c.webhookPayloadDays * 86400),
    audit: await run("DELETE FROM audit_log WHERE ts < ?1", t - c.auditDays * 86400)
  };
  return out;
}

export async function runMaintenance(env, t = now()) {
  const aggregated = await aggregatePending(env.DB, t);
  const purged = await purge(env, t);
  await audit(env, "system", "retention.run", { aggregated, ...purged });
  return { aggregated, purged };
}
