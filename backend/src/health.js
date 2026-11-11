// @ts-check
// backend/src/health.js — GET /health/deep (round 11): is D1 reachable and is the schema current?
//
//   200 {ok: true, d1: true, migrations: {expected, applied, missing: [], method}}   503 with ok:false otherwise
//   method "d1_migrations": wrangler's own table of applied migrations (real D1 / `wrangler d1 migrations apply`)
//   method "probe":         no d1_migrations table (tests, hand-applied SQL) — the newest migration's columns are probed
// Protect it with the HEALTH_TOKEN secret (Authorization: Bearer …) if you do not want it public; it never returns data.
// A unit test keeps MIGRATIONS in sync with backend/migrations/.
import { log } from "./util.js";

export const MIGRATIONS = [
  "0001_init.sql", "0002_billing.sql", "0003_seed_plans.sql", "0004_hardening.sql", "0005_members.sql",
  "0006_consumer_pricing.sql", "0007_member_session_labels.sql", "0008_round11_backend.sql",
  "0009_round12_backend.sql", "0010_ai_gateway.sql", "0011_admin_recovery.sql", "0012_ai_keys.sql"
];
/** Columns / tables added by migrations 0008 and later, with the migration that adds each (schema probe): a failing
 *  probe names exactly the migration that is missing. */
const PROBES = [
  ["0008_round11_backend.sql", "SELECT fulfilled_at, fulfil_token, ext_seconds, age_confirm, refund_token FROM payments LIMIT 0"],
  ["0008_round11_backend.sql", "SELECT id, credit_note_no FROM refunds LIMIT 0"],
  ["0008_round11_backend.sql", "SELECT reauth_at, reauth_fails FROM admin_sessions LIMIT 0"],
  ["0009_round12_backend.sql", "SELECT reauth_at, kind, signed_in_at FROM member_sessions LIMIT 0"],
  ["0008_round11_backend.sql", "SELECT id, status FROM leads LIMIT 0"],
  ["0009_round12_backend.sql", "SELECT email_receipts, email_reminders FROM users LIMIT 0"],
  ["0009_round12_backend.sql", "SELECT id, kind, ref, status FROM mail_log LIMIT 0"],
  ["0009_round12_backend.sql", "SELECT day, directive, blocked, page, n FROM csp_reports LIMIT 0"],
  ["0010_ai_gateway.sql", "SELECT month, feature, metric, n FROM ai_usage_monthly LIMIT 0"],
  ["0011_admin_recovery.sql", "SELECT hash, created_at, used_at FROM admin_recovery_codes LIMIT 0"],
  ["0012_ai_keys.sql", "SELECT provider, key_enc, last4, set_at, checked_at, check_ok FROM ai_provider_keys LIMIT 0"]
];

/** @param {Env} env */
export async function deepHealth(env) {
  const out = { ok: false, d1: false, migrations: { expected: MIGRATIONS.length, applied: 0, missing: /** @type {string[]} */ ([]), method: "probe" } };
  try {
    const r = await env.DB.prepare("SELECT 1 AS one").first();
    out.d1 = !!(r && Number(r.one) === 1);
  } catch (e) {
    log("health.d1_failed", { name: String((e && e.name) || "Error") });
    return out;
  }
  let names = null;
  try {
    names = ((await env.DB.prepare("SELECT name FROM d1_migrations ORDER BY id").all()).results || []).map(x => String(x.name));
  } catch { names = null; }
  if (names) {
    out.migrations.method = "d1_migrations";
    out.migrations.applied = names.length;
    out.migrations.missing = MIGRATIONS.filter(n => !names.includes(n));
  } else {
    const missing = new Set();
    for (const [name, sql] of PROBES) { try { await env.DB.prepare(sql).all(); } catch { missing.add(name); } }
    out.migrations.missing = MIGRATIONS.filter(n => missing.has(n));
    out.migrations.applied = MIGRATIONS.length - out.migrations.missing.length;
  }
  out.ok = out.d1 && out.migrations.missing.length === 0;
  return out;
}
