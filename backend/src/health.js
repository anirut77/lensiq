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
  "0009_round12_backend.sql", "0010_ai_gateway.sql", "0011_admin_recovery.sql", "0012_ai_keys.sql", "0013_recovery_slow_hash.sql",
  "0014_leads_viewed.sql",
  "0015_merit.sql", "0016_merit_review.sql", "0017_tryon.sql", "0018_accounts.sql",
  "0019_merit_batches.sql"
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
  ["0012_ai_keys.sql", "SELECT provider, key_enc, last4, set_at, checked_at, check_ok FROM ai_provider_keys LIMIT 0"],
  ["0013_recovery_slow_hash.sql", "SELECT salt, slow_hash, iterations FROM admin_recovery_codes LIMIT 0"],
  ["0014_leads_viewed.sql", "SELECT viewed_at FROM leads LIMIT 0"],
  ["0015_merit.sql", "SELECT id, type, tradition, title, body, place, area, match_keys, sample, status, sort FROM merit_items LIMIT 0"],
  ["0015_merit.sql", "SELECT id, created_at, item_id, name, channel, contact, date_from, date_to, consent_version, status FROM merit_interest LIMIT 0"],
  ["0016_merit_review.sql", "SELECT id, username, password_hash, setup_hash, setup_expires, totp_secret_enc, totp_enabled, status FROM admin_reviewers LIMIT 0"],
  ["0016_merit_review.sql", "SELECT id, item_id, ts, actor, actor_name, action, decision, fields, comment, from_status, to_status FROM merit_revisions LIMIT 0"],
  ["0016_merit_review.sql", "SELECT reviewer_id FROM admin_sessions LIMIT 0"],
  ["0016_merit_review.sql", "SELECT review_comment, reviewed_by, reviewed_at, source, review_meta FROM merit_items LIMIT 0"],
  ["0017_tryon.sql", "SELECT role FROM admin_reviewers LIMIT 0"],
  ["0017_tryon.sql", "SELECT id, shop, category, anchor, name_th, name_en, name_zh, price, sale_price, vat_included, sizes, colours, product_url, notes, status FROM tryon_items LIMIT 0"],
  ["0017_tryon.sql", "SELECT id, item_id, mime, bytes, w, h, sha256, store, data, face_check FROM tryon_assets LIMIT 0"],
  ["0018_accounts.sql", "SELECT provider, sub, user_id, created_at, last_login_at FROM user_identities LIMIT 0"],
  ["0018_accounts.sql", "SELECT hash, purpose FROM auth_nonces LIMIT 0"],
  ["0018_accounts.sql", "SELECT state_hash, binding_hash, nonce, code_verifier, mode, session_kind, expires_at FROM line_auth_flows LIMIT 0"],
  ["0018_accounts.sql", "SELECT id, name, status, billing_tax_id FROM orgs LIMIT 0"],
  ["0018_accounts.sql", "SELECT org_id, user_id, role, is_owner FROM org_members LIMIT 0"],
  ["0018_accounts.sql", "SELECT id, token_hash, email_hmac, owner_invite FROM org_invites LIMIT 0"],
  ["0018_accounts.sql", "SELECT id, org_id, actor_ref, prev_hash, hash FROM org_audit LIMIT 0"],
  ["0018_accounts.sql", "SELECT id, product, unit FROM licence_plans LIMIT 0"],
  ["0018_accounts.sql", "SELECT id, org_id, plan_id, quantity, amount_satang FROM org_licences LIMIT 0"],
  ["0019_merit_batches.sql", "SELECT batch, count, imported_at, actor FROM merit_batches LIMIT 0"]
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
