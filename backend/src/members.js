// backend/src/members.js — member accounts: "Sign in with Google" (ID token verified in google.js), member bearer
// sessions, tiers + quotas, usage / transaction ledger, saved readings, PDPA rights (access/export, erasure), and the
// admin "Members" back office.
//
// Tiers: guest (no sign-in) -> member (free, Google sign-in) -> paid plans (pro / business, backend/migrations/0003).
// Gating is ON only when the owner turns on `membership_required` (admin -> Members) AND GOOGLE_CLIENT_ID is set;
// otherwise everything behaves exactly as before (guests get full readings and the AI rules of fortune.js).
//
//   POST   /api/auth/nonce        -> {nonce, expires_in}                  one-time nonce for the Google ID token
//   POST   /api/auth/google       {credential, nonce, accept_terms, consent_version, marketing_opt_in}
//                                 -> {token, expires_at, user}           Turnstile (action "signin", fail closed)
//   POST   /api/auth/logout       revoke this session
//   GET    /api/me                profile, tier, plan, quotas
//   POST   /api/me/preferences    {marketing_opt_in}
//   POST   /api/me/usage          {kind:"reading", domain}                ledger row (no content)
//   GET    /api/me/history        ledger + saved readings (titles) + own payments
//   POST   /api/me/saved          {domain, title, data}                   save a derived reading (opt-in, <= 16 KB)
//   GET    /api/me/saved/:id      DELETE /api/me/saved/:id
//   GET    /api/me/export         data portability JSON (PDPA s.31)
//   DELETE /api/me                {confirm:"DELETE"} erasure (PDPA s.33); payments kept unlinked for tax retention
// Sessions: 256-bit random token returned once, only SHA-256 stored; 30 days absolute, 14 days idle; the site is on
// another origin than the API, so the token travels as `Authorization: Bearer` (no third-party cookies).
import { FORTUNE_DOMAINS } from "./constants.js";
import { randomId, randomToken, sha256Hex } from "./crypto.js";
import { GoogleTokenError, verifyGoogleIdToken } from "./google.js";
import { audit, callerHash, getSetting, hit, putSetting } from "./store.js";
import { verifyTurnstile } from "./turnstile.js";
import { HttpError, dayOf, intVar, log, now } from "./util.js";

export const MEMBER_CONSENT_VERSION = "m1";
/** Versions of the member terms + privacy notice (lensiq-member.js CONSENT_VERSION). Bump both when the text changes. */
export const MEMBER_CONSENT_VERSIONS = ["m1"];
export const SESSION_TTL = 30 * 86400;
export const SESSION_IDLE = 14 * 86400;
export const NONCE_TTL = 600;
export const SAVED_MAX_BYTES = 16 * 1024;
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;
const ID_RE = /^[a-f0-9]{32}$/;

/** Owner-editable limits (admin -> Members). Stored in D1 settings key "membership". */
export const DEFAULT_MEMBERSHIP = Object.freeze({
  membership_required: false,  // OFF by default: no gating anywhere until the owner switches it on
  guest_daily_readings: 3,     // soft, per device (client-side counter): light readings per day for guests
  guest_light_sections: 2,     // sections of a reading a guest sees (summary + reminder + gentle cautions always shown)
  member_ai_daily: 3,          // AI writing assistant uses per member per day (server-enforced)
  member_saved_max: 50         // saved readings per member
});
const LIMITS = { guest_daily_readings: [0, 100], guest_light_sections: [1, 8], member_ai_daily: [0, 100], member_saved_max: [0, 500] };

export async function getMembershipSettings(db) {
  return { ...DEFAULT_MEMBERSHIP, ...(await getSetting(db, "membership", {})) };
}

export function validateMembership(input, cur = DEFAULT_MEMBERSHIP) {
  if (!input || typeof input !== "object") throw new HttpError(400, "settings must be an object");
  const out = { ...cur };
  for (const [k, v] of Object.entries(input)) {
    if (k === "membership_required") { if (typeof v !== "boolean") throw new HttpError(400, "membership_required must be boolean"); out[k] = v; continue; }
    const lim = LIMITS[k];
    if (!lim) throw new HttpError(400, `unknown setting ${String(k).slice(0, 32)}`);
    if (!Number.isInteger(v) || v < lim[0] || v > lim[1]) throw new HttpError(400, `${k} must be an integer ${lim[0]}–${lim[1]}`);
    out[k] = v;
  }
  return out;
}

export const googleClientId = env => String(env.GOOGLE_CLIENT_ID || "").trim();

/** Settings + whether gating is effectively on (switch on AND a Google client id to sign in with). */
export async function membership(env) {
  const s = await getMembershipSettings(env.DB);
  return { ...s, required: !!s.membership_required && !!googleClientId(env) };
}

/** What the public site may know (GET /v1/config). */
export async function publicMembership(env) {
  const m = await membership(env);
  return {
    required: m.required, google_client_id: googleClientId(env) || null, consent_version: MEMBER_CONSENT_VERSION,
    guest_daily_readings: m.guest_daily_readings, guest_light_sections: m.guest_light_sections, member_ai_daily: m.member_ai_daily
  };
}

// ---- sign-in ---------------------------------------------------------------------------------------------------------

export async function issueNonce(env, request) {
  const who = await callerHash(env, request, "signin");
  const rl = await hit(env.DB, `nonce:${who}`, 30, 900);
  if (!rl.ok) throw new HttpError(429, "too many sign-in attempts — try again later", { retryAfter: rl.retryAfter });
  if (!googleClientId(env)) throw new HttpError(503, "Google sign-in is not configured (google_not_configured)", { code: "google_not_configured" });
  const nonce = randomToken(24), t = now();
  await env.DB.prepare("INSERT INTO auth_nonces (hash, created_at, expires_at) VALUES (?1, ?2, ?3)").bind(await sha256Hex(nonce), t, t + NONCE_TTL).run();
  return { nonce, expires_in: NONCE_TTL };
}

/** Atomically consumes a nonce we issued (single use, unexpired). */
async function claimNonce(db, nonce, t) {
  if (typeof nonce !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(nonce)) return false;
  const r = await db.prepare("DELETE FROM auth_nonces WHERE hash = ?1 AND expires_at > ?2 RETURNING hash").bind(await sha256Hex(nonce), t).first();
  return !!r;
}

const publicUser = u => ({
  id: u.id, email: u.email, display_name: u.display_name || null, created_at: u.created_at, last_login_at: u.last_login_at,
  marketing_opt_in: !!u.marketing_opt_in, consent_version: u.consent_version, consent_at: u.consent_at, status: u.status
});

async function newSession(db, userId, t) {
  const token = randomToken(32);
  await db.prepare("INSERT INTO member_sessions (id_hash, user_id, created_at, last_seen, expires_at) VALUES (?1, ?2, ?3, ?3, ?4)")
    .bind(await sha256Hex(token), userId, t, t + SESSION_TTL).run();
  return { token, expires_at: t + SESSION_TTL };
}

export async function signInGoogle(env, request, body, deps = {}) {
  const t = deps.nowSec ?? now();
  const clientId = googleClientId(env);
  if (!clientId) throw new HttpError(503, "Google sign-in is not configured (google_not_configured)", { code: "google_not_configured" });
  const who = await callerHash(env, request, "signin");
  const rl = await hit(env.DB, `signin:${who}`, 10, 900, t);
  if (!rl.ok) throw new HttpError(429, "too many sign-in attempts — try again later", { retryAfter: rl.retryAfter });
  const g = await hit(env.DB, "signin:global", intVar(env.SIGNIN_GLOBAL_15MIN, 300, 1, 100000), 900, t);
  if (!g.ok) throw new HttpError(429, "sign-in temporarily busy", { retryAfter: g.retryAfter });
  const ts = await verifyTurnstile(env, request, "signin", deps.fetch);
  if (!ts.ok) throw ts.code === "turnstile_not_configured"
    ? new HttpError(503, "sign-in unavailable: Turnstile is not configured on the server (turnstile_not_configured)", { code: "turnstile_not_configured" })
    : new HttpError(403, "bot check failed (turnstile_failed)", { code: "turnstile_failed" });
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid request");
  if (!(await claimNonce(env.DB, body.nonce, t))) throw new HttpError(401, "sign-in expired — please try again (nonce)", { code: "nonce" });
  let c;
  try {
    c = await verifyGoogleIdToken(String(body.credential || ""), { clientId, nonce: body.nonce, fetchImpl: deps.fetch, now: t });
  } catch (e) {
    if (e instanceof GoogleTokenError) {
      log("member.signin.rejected", { reason: e.code });
      throw new HttpError(e.code === "jwks_unavailable" ? 503 : 401, e.code === "email_unverified" ? "this Google account has no verified e-mail" : "Google sign-in could not be verified", { code: e.code });
    }
    throw e;
  }
  const accept = body.accept_terms === true && MEMBER_CONSENT_VERSIONS.includes(body.consent_version);
  const name = typeof c.given_name === "string" ? c.given_name.replace(/[\u0000-\u001f<>`]/g, "").trim().slice(0, 40) || null : null;
  const email = String(c.email).toLowerCase().slice(0, 254);
  let u = await env.DB.prepare("SELECT * FROM users WHERE google_sub = ?1").bind(c.sub).first();
  let created = false;
  if (u) {
    if (u.status !== "active") throw new HttpError(403, "this account is disabled — contact support", { code: "account_disabled" });
    const needsConsent = u.consent_version !== MEMBER_CONSENT_VERSION;
    if (needsConsent && !accept) throw new HttpError(400, "please accept the updated terms and privacy notice (consent_required)", { code: "consent_required" });
    await env.DB.prepare("UPDATE users SET email = ?1, email_verified = 1, display_name = COALESCE(?2, display_name), last_login_at = ?3, " +
      "consent_version = CASE WHEN ?4 THEN ?5 ELSE consent_version END, consent_at = CASE WHEN ?4 THEN ?3 ELSE consent_at END, " +
      "marketing_opt_in = CASE WHEN ?6 THEN 1 ELSE marketing_opt_in END, marketing_opt_in_at = CASE WHEN ?6 AND marketing_opt_in = 0 THEN ?3 ELSE marketing_opt_in_at END WHERE id = ?7")
      .bind(email, name, t, needsConsent ? 1 : 0, MEMBER_CONSENT_VERSION, body.marketing_opt_in === true ? 1 : 0, u.id).run();
  } else {
    if (!accept) throw new HttpError(400, "please accept the terms and privacy notice (consent_required)", { code: "consent_required" });
    const id = randomId(16);
    const mk = body.marketing_opt_in === true ? 1 : 0;
    const r = await env.DB.prepare("INSERT OR IGNORE INTO users (id, google_sub, email, email_verified, display_name, status, consent_version, consent_at, marketing_opt_in, marketing_opt_in_at, created_at, last_login_at) " +
      "VALUES (?1, ?2, ?3, 1, ?4, 'active', ?5, ?6, ?7, ?8, ?6, ?6)").bind(id, c.sub, email, name, MEMBER_CONSENT_VERSION, t, mk, mk ? t : null).run();
    created = !!(r.meta && r.meta.changes);
    if (created) await ledger(env, id, "signup", {}, t);
  }
  u = await env.DB.prepare("SELECT * FROM users WHERE google_sub = ?1").bind(c.sub).first();
  const s = await newSession(env.DB, u.id, t);
  await audit(env, "member", created ? "member.signup" : "member.login", { user: u.id }, who);
  return { token: s.token, expires_at: s.expires_at, created, user: publicUser(u) };
}

// ---- sessions --------------------------------------------------------------------------------------------------------

function bearerOf(request) {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(request.headers.get("Authorization") || "");
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}

/** The signed-in member or null (no / invalid / expired token, disabled account). Never throws for the caller. */
export async function optionalMember(env, request, t = now()) {
  const token = bearerOf(request);
  if (!token) return null;
  const idHash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT s.id_hash, s.last_seen, s.expires_at, u.* FROM member_sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?1").bind(idHash).first();
  if (!row) return null;
  if (row.expires_at <= t || t - row.last_seen > SESSION_IDLE || row.status !== "active") {
    await env.DB.prepare("DELETE FROM member_sessions WHERE id_hash = ?1").bind(idHash).run();
    return null;
  }
  if (t - row.last_seen > 300) await env.DB.prepare("UPDATE member_sessions SET last_seen = ?1 WHERE id_hash = ?2").bind(t, idHash).run();
  const { id_hash: _h, last_seen: _l, expires_at: _e, ...user } = row;
  return { user, idHash };
}

export async function requireMember(env, request) {
  const m = await optionalMember(env, request);
  if (!m) throw new HttpError(401, "please sign in (member_required)", { code: "member_required" });
  return m;
}

export async function logout(env, m) {
  await env.DB.prepare("DELETE FROM member_sessions WHERE id_hash = ?1").bind(m.idHash).run();
  return { ok: true };
}

// ---- tiers, quotas, ledger -------------------------------------------------------------------------------------------

/** Active paid subscription of the user, or null. */
export async function activeSubscription(db, userId, t = now()) {
  return db.prepare("SELECT s.plan_id, s.period, s.current_period_end, p.name_th, p.name_en FROM subscriptions s JOIN plans p ON p.id = s.plan_id " +
    "WHERE s.user_id = ?1 AND s.status = 'active' AND s.current_period_end > ?2 ORDER BY s.current_period_end DESC LIMIT 1").bind(userId, t).first();
}

export const userSubject = id => "u:" + id;
const periodKey = (period, t) => (period === "month" ? dayOf(t).slice(0, 7) + "-01" : dayOf(t));

/** AI quota of a member: member tier = member_ai_daily per day (enforced while membership is required);
 *  paid tier = the plan's `ai_reading` entitlement (enforced only when FREE_MODE=false, as before). */
export async function aiQuota(env, user, { consume = false, t = now(), ms = null, freeMode = true } = {}) {
  const m = ms || (await membership(env));
  const sub = await activeSubscription(env.DB, user.id, t);
  let tier = "member", quota = m.member_ai_daily, period = "day", enforce = m.required;
  if (sub) {
    tier = sub.plan_id;
    const ent = await env.DB.prepare("SELECT quota, period FROM entitlements WHERE plan_id = ?1 AND feature = 'ai_reading'").bind(sub.plan_id).first();
    quota = ent ? ent.quota : 0; period = ent ? ent.period : "month"; enforce = !freeMode;
  }
  const day = periodKey(period, t), subj = userSubject(user.id);
  let used;
  if (consume) {
    const r = await env.DB.prepare("INSERT INTO usage_counters (day, subject, feature, n) VALUES (?1, ?2, 'ai_reading', 1) " +
      "ON CONFLICT (day, subject, feature) DO UPDATE SET n = n + 1 RETURNING n").bind(day, subj).first();
    used = r ? Number(r.n) : 1;
  } else {
    const r = await env.DB.prepare("SELECT n FROM usage_counters WHERE day = ?1 AND subject = ?2 AND feature = 'ai_reading'").bind(day, subj).first();
    used = r ? Number(r.n) : 0;
  }
  const within = quota == null || used <= quota;
  const remaining = quota == null ? null : Math.max(0, quota - used);
  return { tier, quota, used, period, remaining, enforced: enforce, allowed: !enforce || within };
}

export const LEDGER_KINDS = ["signup", "reading", "ai", "payment"];
export async function ledger(env, userId, kind, { domain = null, ref = null, amount = null } = {}, t = now()) {
  if (!LEDGER_KINDS.includes(kind)) throw new Error("unknown ledger kind");
  await env.DB.prepare("INSERT INTO member_ledger (user_id, ts, kind, domain, ref, amount_satang) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(userId, t, kind, domain && FORTUNE_DOMAINS.includes(domain) ? domain : null, ref, amount).run();
}

/** POST /api/me/usage — a member's on-device reading (domain only, no content). */
export async function recordUsage(env, m, body) {
  if (!body || body.kind !== "reading") throw new HttpError(400, "kind must be 'reading'");
  if (!FORTUNE_DOMAINS.includes(body.domain)) throw new HttpError(400, "unknown domain");
  const rl = await hit(env.DB, `usage:${m.user.id}`, 200, 86400);
  if (!rl.ok) return { ok: true, recorded: false };
  await ledger(env, m.user.id, "reading", { domain: body.domain });
  return { ok: true, recorded: true };
}

export async function me(env, m) {
  const ms = await membership(env);
  const sub = await activeSubscription(env.DB, m.user.id);
  const ai = await aiQuota(env, m.user, { ms, freeMode: String(env.FREE_MODE ?? "true").toLowerCase() !== "false" });
  const saved = await env.DB.prepare("SELECT COUNT(*) AS n FROM saved_readings WHERE user_id = ?1").bind(m.user.id).first();
  const readsToday = await env.DB.prepare("SELECT COUNT(*) AS n FROM member_ledger WHERE user_id = ?1 AND kind = 'reading' AND ts >= ?2")
    .bind(m.user.id, Math.floor(Date.parse(dayOf() + "T00:00:00Z") / 1000)).first();
  return {
    user: publicUser(m.user), tier: ai.tier,
    plan: sub ? { id: sub.plan_id, name_th: sub.name_th, name_en: sub.name_en, period: sub.period, current_period_end: sub.current_period_end } : null,
    quotas: { ai: { used: ai.used, quota: ai.quota, remaining: ai.remaining, period: ai.period, enforced: ai.enforced }, saved: { used: saved.n, max: ms.member_saved_max }, readings_today: readsToday.n },
    membership: { required: ms.required, consent_version: MEMBER_CONSENT_VERSION }
  };
}

export async function setPreferences(env, m, body) {
  if (!body || typeof body.marketing_opt_in !== "boolean") throw new HttpError(400, "marketing_opt_in must be boolean");
  const v = body.marketing_opt_in ? 1 : 0;
  await env.DB.prepare("UPDATE users SET marketing_opt_in = ?1, marketing_opt_in_at = ?2 WHERE id = ?3").bind(v, now(), m.user.id).run();
  await audit(env, "member", "member.marketing", { user: m.user.id, opt_in: !!v });
  return { ok: true, marketing_opt_in: !!v };
}

const paymentsOf = (db, userId) => db.prepare("SELECT id, kind, plan_id, period, status, amount_satang, vat_satang, receipt_no, doc_type, created_at, paid_at FROM payments WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 200").bind(userId).all();

export async function history(env, m, q = {}) {
  const limit = intVar(q.limit, 50, 1, 200);
  const before = intVar(q.before, 0, 0, Number.MAX_SAFE_INTEGER);
  const rows = (await env.DB.prepare("SELECT id, ts, kind, domain, ref, amount_satang FROM member_ledger WHERE user_id = ?1 AND (?2 = 0 OR id < ?2) ORDER BY id DESC LIMIT ?3")
    .bind(m.user.id, before, limit).all()).results || [];
  const saved = (await env.DB.prepare("SELECT id, created_at, domain, title FROM saved_readings WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 500").bind(m.user.id).all()).results || [];
  const payments = (await paymentsOf(env.DB, m.user.id)).results || [];
  return { ledger: rows, saved, payments, next_before: rows.length === limit ? rows[rows.length - 1].id : null };
}

// ---- saved readings (opt-in, derived result only) --------------------------------------------------------------------

const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").slice(0, n);
/** Keeps only the derived, displayable result: summary lines, plan items, section titles + paragraphs, reminder. */
export function cleanSaved(data) {
  if (!data || typeof data !== "object") throw new HttpError(400, "data must be an object");
  const out = { lang: ["th", "en", "zh"].includes(data.lang) ? data.lang : "th", sections: [] };
  if (data.summary && Array.isArray(data.summary.lines)) out.summary = { title: clip(data.summary.title, 80), lines: data.summary.lines.slice(0, 6).map(l => ({ k: clip(l && l.k, 40), t: clip(l && l.t, 400) })) };
  if (data.plan && Array.isArray(data.plan.items)) out.plan = { title: clip(data.plan.title, 80), items: data.plan.items.slice(0, 5).map(x => ({ for: clip(x && x.for, 60), t: clip(x && x.t, 400) })) };
  for (const s of (Array.isArray(data.sections) ? data.sections : []).slice(0, 12)) {
    if (!s || typeof s !== "object") continue;
    out.sections.push({ id: clip(s.id, 24), title: clip(s.title, 80), paragraphs: (Array.isArray(s.paragraphs) ? s.paragraphs : []).slice(0, 12).map(p => clip(p, 2000)) });
  }
  if (data.reminder) out.reminder = clip(data.reminder, 600);
  const json = JSON.stringify(out);
  if (new TextEncoder().encode(json).length > SAVED_MAX_BYTES) throw new HttpError(413, "reading too large to save");
  return json;
}

export async function saveReading(env, m, body) {
  if (!body || !FORTUNE_DOMAINS.includes(body.domain)) throw new HttpError(400, "unknown domain");
  const ms = await membership(env);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM saved_readings WHERE user_id = ?1").bind(m.user.id).first();
  if (n.n >= ms.member_saved_max) throw new HttpError(409, "saved readings limit reached — delete some first", { code: "saved_full" });
  const rl = await hit(env.DB, `save:${m.user.id}`, 60, 86400);
  if (!rl.ok) throw new HttpError(429, "too many saves today", { retryAfter: rl.retryAfter });
  const id = randomId(16);
  await env.DB.prepare("INSERT INTO saved_readings (id, user_id, created_at, domain, title, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(id, m.user.id, now(), body.domain, clip(body.title, 120) || null, cleanSaved(body.data)).run();
  return { ok: true, id };
}

export async function getSaved(env, m, id) {
  if (!ID_RE.test(id)) throw new HttpError(404, "not found");
  const r = await env.DB.prepare("SELECT id, created_at, domain, title, data FROM saved_readings WHERE id = ?1 AND user_id = ?2").bind(id, m.user.id).first();
  if (!r) throw new HttpError(404, "not found");
  return { ...r, data: JSON.parse(r.data) };
}

export async function deleteSaved(env, m, id) {
  if (!ID_RE.test(id)) throw new HttpError(404, "not found");
  const r = await env.DB.prepare("DELETE FROM saved_readings WHERE id = ?1 AND user_id = ?2").bind(id, m.user.id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "not found");
  return { ok: true };
}

// ---- PDPA: export (portability) and erasure --------------------------------------------------------------------------

export async function exportData(env, m) {
  const db = env.DB, id = m.user.id;
  const u = await db.prepare("SELECT id, email, email_verified, display_name, status, consent_version, consent_at, marketing_opt_in, marketing_opt_in_at, created_at, last_login_at FROM users WHERE id = ?1").bind(id).first();
  const all = async sql => (await db.prepare(sql).bind(id).all()).results || [];
  const saved = (await all("SELECT id, created_at, domain, title, data FROM saved_readings WHERE user_id = ?1 ORDER BY created_at")).map(r => ({ ...r, data: JSON.parse(r.data) }));
  return {
    format: "lensiq-member-export", version: 1, exported_at: now(),
    note: "Google account id (sub) is kept only to recognise your sign-in and is not included; no photo, password or reading content is stored unless you saved it.",
    profile: u,
    sessions: await all("SELECT created_at, last_seen, expires_at FROM member_sessions WHERE user_id = ?1"),
    ledger: await all("SELECT ts, kind, domain, ref, amount_satang FROM member_ledger WHERE user_id = ?1 ORDER BY id"),
    saved_readings: saved,
    payments: await all("SELECT id, kind, plan_id, period, status, amount_satang, vat_satang, receipt_no, doc_type, buyer_name, buyer_tax_id, buyer_address, buyer_branch, buyer_email, created_at, paid_at FROM payments WHERE user_id = ?1 ORDER BY created_at"),
    subscriptions: await all("SELECT plan_id, status, period, current_period_start, current_period_end FROM subscriptions WHERE user_id = ?1")
  };
}

/** Right to erasure. Payments / receipts are accounting records (Revenue Code, >= 5 years): they are kept but
 *  UNLINKED from the person (user_id cleared, e-mail removed); tax-invoice buyer fields stay as the law requires. */
export async function deleteAccount(env, m, body) {
  if (!body || body.confirm !== "DELETE") throw new HttpError(400, "confirm must be \"DELETE\"");
  const db = env.DB, id = m.user.id;
  await db.batch([
    db.prepare("DELETE FROM member_sessions WHERE user_id = ?1").bind(id),
    db.prepare("DELETE FROM saved_readings WHERE user_id = ?1").bind(id),
    db.prepare("DELETE FROM member_ledger WHERE user_id = ?1").bind(id),
    db.prepare("DELETE FROM usage_counters WHERE subject = ?1").bind(userSubject(id)),
    db.prepare("UPDATE payments SET user_id = NULL, buyer_email = NULL WHERE user_id = ?1").bind(id),
    db.prepare("UPDATE subscriptions SET user_id = NULL, status = CASE WHEN status = 'active' THEN 'cancelled' ELSE status END, updated_at = ?2 WHERE user_id = ?1").bind(id, now()),
    db.prepare("UPDATE customers SET user_id = NULL, email = NULL WHERE user_id = ?1").bind(id),
    db.prepare("DELETE FROM users WHERE id = ?1").bind(id)
  ]);
  await audit(env, "member", "member.deleted", { user: id });
  return { ok: true, deleted: true };
}

// ---- admin -----------------------------------------------------------------------------------------------------------

export async function adminMembers(env, q = {}) {
  const db = env.DB;
  const limit = intVar(q.limit, 50, 1, 200), offset = intVar(q.offset, 0, 0, 1e6);
  const t = now();
  const tot = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(status = 'active'), 0) AS active, COALESCE(SUM(status = 'disabled'), 0) AS disabled, COALESCE(SUM(marketing_opt_in), 0) AS marketing FROM users").first();
  const since = t - 30 * 86400;
  const days = (await db.prepare("SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS n FROM users WHERE created_at >= ?1 GROUP BY day ORDER BY day").bind(since).all()).results || [];
  const paid = (await db.prepare("SELECT s.plan_id AS tier, COUNT(DISTINCT s.user_id) AS n FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.status = 'active' AND s.current_period_end > ?1 GROUP BY s.plan_id").bind(t).all()).results || [];
  const paidN = paid.reduce((a, r) => a + Number(r.n), 0);
  const tiers = { member: Math.max(0, Number(tot.n) - paidN) };
  for (const r of paid) tiers[r.tier] = Number(r.n);
  const s = String(q.q || "").trim().toLowerCase();
  let users;
  const cols = "id, email, display_name, status, created_at, last_login_at, marketing_opt_in, (SELECT plan_id FROM subscriptions WHERE user_id = users.id AND status = 'active' AND current_period_end > ?4 LIMIT 1) AS plan";
  if (s) {
    if (s.length < 3 || s.length > 254) throw new HttpError(400, "search needs 3–254 characters");
    const like = s.replace(/[\\%_]/g, c => "\\" + c) + "%";
    users = (await db.prepare(`SELECT ${cols} FROM users WHERE email LIKE ?1 ESCAPE '\\' OR id = ?2 ORDER BY created_at DESC LIMIT ?3`).bind(like, s, limit, t).all()).results || [];
  } else {
    users = (await db.prepare(`SELECT ${cols} FROM users ORDER BY created_at DESC LIMIT ?1 OFFSET ?2`).bind(limit, offset, null, t).all()).results || [];
  }
  return { count: Number(tot.n), active: Number(tot.active), disabled: Number(tot.disabled), marketing_opt_in: Number(tot.marketing), signups: days, tiers, users };
}

export async function adminSetStatus(env, id, body) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "member not found");
  const st = body && body.status;
  if (st !== "active" && st !== "disabled") throw new HttpError(400, "status must be active or disabled");
  const r = await env.DB.prepare("UPDATE users SET status = ?1 WHERE id = ?2").bind(st, id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "member not found");
  if (st === "disabled") await env.DB.prepare("DELETE FROM member_sessions WHERE user_id = ?1").bind(id).run();
  return { ok: true, status: st };
}

export const PAID_PLANS = ["pro", "business", "enterprise"];
export async function adminMembershipInfo(env) {
  const plans = (await env.DB.prepare("SELECT plan_id, quota, period FROM entitlements WHERE feature = 'ai_reading' ORDER BY plan_id").all()).results || [];
  return { settings: await getMembershipSettings(env.DB), effective_required: (await membership(env)).required, google_client_id_set: !!googleClientId(env), plan_ai_quotas: plans, limits: LIMITS };
}

/** PUT /admin/api/membership {settings?, plan_ai_quotas?: {pro: 100, business: 600, enterprise: null}} */
export async function adminPutMembership(env, body) {
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid body");
  for (const k of Object.keys(body)) if (k !== "settings" && k !== "plan_ai_quotas") throw new HttpError(400, `unknown field ${String(k).slice(0, 32)}`);
  if (body.settings) await putSetting(env.DB, "membership", validateMembership(body.settings, await getMembershipSettings(env.DB)));
  if (body.plan_ai_quotas) {
    if (typeof body.plan_ai_quotas !== "object") throw new HttpError(400, "plan_ai_quotas must be an object");
    for (const [plan, quota] of Object.entries(body.plan_ai_quotas)) {
      if (!PAID_PLANS.includes(plan)) throw new HttpError(400, `unknown plan ${String(plan).slice(0, 20)}`);
      if (quota !== null && !(Number.isInteger(quota) && quota >= 0 && quota <= 1000000)) throw new HttpError(400, "quota must be null (unlimited) or an integer 0–1000000");
      await env.DB.prepare("UPDATE entitlements SET quota = ?1 WHERE plan_id = ?2 AND feature = 'ai_reading'").bind(quota, plan).run();
    }
  }
  return adminMembershipInfo(env);
}
