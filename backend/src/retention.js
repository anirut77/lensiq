// @ts-check
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
//   member sessions             at expiry (30 days absolute / 14 days idle); sign-in nonces after 10 min
//   member ledger (usage rows)  MEMBER_LEDGER_DAYS (400); payment + refund rows kept with the payment; accounts until deletion
//   B2B demo requests (leads)   LEADS_DAYS (180) after they were received (round 11)
//   quota tombstones            the Bangkok day they were written for (usage_counters subject 'x:…', round 11)
//   e-mail delivery log         AUDIT_DAYS (400) (round 12; no addresses / bodies stored, member id cleared on erasure)
//   CSP report counters         CSP_REPORT_DAYS (90) (round 12; aggregated counters only)
//   merit interest requests     MERIT_INTEREST_DAYS (90) after they were received (Merit MVP 2026-11-12; form off by default)
//   payments / receipts         kept (Thai Revenue Code: accounting & tax documents >= 5 years) — never purged here
import { aggregatePending } from "./analytics.js";
import { mailRenewalReminders } from "./mail.js";
import { interestDays } from "./merit.js";
import { audit } from "./store.js";
import { addDays, bkkDay, dayOf, intVar, now } from "./util.js";

export function retentionConfig(env) {
  return {
    rawEventDays: intVar(env.RAW_EVENT_DAYS, 90, 1, 3650),
    auditDays: intVar(env.AUDIT_DAYS, 400, 30, 3650),
    webhookPayloadDays: intVar(env.WEBHOOK_PAYLOAD_DAYS, 90, 1, 3650),
    usageDays: 35,
    memberLedgerDays: intVar(env.MEMBER_LEDGER_DAYS, 400, 30, 3650),
    leadsDays: intVar(env.LEADS_DAYS, 180, 7, 3650),
    cspReportDays: intVar(env.CSP_REPORT_DAYS, 90, 1, 3650),
    meritInterestDays: interestDays(env)
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
    audit: await run("DELETE FROM audit_log WHERE ts < ?1", t - c.auditDays * 86400),
    member_sessions: await run("DELETE FROM member_sessions WHERE expires_at < ?1 OR last_seen < ?2", t, t - 14 * 86400),
    auth_nonces: await run("DELETE FROM auth_nonces WHERE expires_at < ?1", t),
    member_ledger: await run("DELETE FROM member_ledger WHERE kind NOT IN ('payment', 'refund') AND ts < ?1", t - c.memberLedgerDays * 86400),
    leads: await run("DELETE FROM leads WHERE created_at < ?1", t - c.leadsDays * 86400),
    // tombstones (members.js deleteAccount) live only for the Bangkok day they were written for
    quota_tombstones: await run("DELETE FROM usage_counters WHERE subject LIKE 'x:%' AND day < ?1", bkkDay(t)),
    // round 12: e-mail delivery log with the audit log; CSP report counters after CSP_REPORT_DAYS
    mail_log: await run("DELETE FROM mail_log WHERE ts < ?1", t - c.auditDays * 86400),
    csp_reports: await run("DELETE FROM csp_reports WHERE day < ?1", addDays(today, -c.cspReportDays)),
    // Merit MVP: "request interest" rows (name, contact, item, date window) after MERIT_INTEREST_DAYS
    merit_interest: await run("DELETE FROM merit_interest WHERE created_at < ?1", t - c.meritInterestDays * 86400)
  };
  return out;
}

/** @param {Env} env @param {number} [t] @param {typeof fetch} [fetchImpl] (tests: the mail provider fake) */
export async function runMaintenance(env, t = now(), fetchImpl) {
  const aggregated = await aggregatePending(env.DB, t);
  const purged = await purge(env, t);
  let reminders = { candidates: 0, sent: 0 };
  try { reminders = await mailRenewalReminders(env, t, fetchImpl); } catch { /* best effort: never fails maintenance */ }
  await audit(env, "system", "retention.run", { aggregated, ...purged, reminders_sent: reminders.sent });
  return { aggregated, purged, reminders };
}
