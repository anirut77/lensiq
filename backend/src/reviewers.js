// @ts-check
// backend/src/reviewers.js — restricted "reviewer" back-office accounts for merit content (owner decision 2026-11-12;
// migration 0015_merit_review.sql). Reuses the owner's building blocks: PBKDF2 password hashing (crypto.js hashPassword /
// verifyPassword / passwordProblem), TOTP (verifyTotp, secret AES-GCM-encrypted with SECRETS_KEK), rate limits (store.js
// hit), sessions (admin_sessions, reviewer_id set) and the audit log. No new crypto.
//
//   owner (re-auth):  POST /admin/api/reviewers {username} -> {reviewer, setup_code (shown ONCE), setup_expires_at}
//                     POST /admin/api/reviewers/:id/disable | enable | reset      DELETE /admin/api/reviewers/:id
//                     GET  /admin/api/reviewers
//   reviewer, no session yet (the one-time setup link admin#rsetup=<code>):
//                     POST /admin/api/reviewer-setup {code, password}        -> {username, secret, uri}
//                     POST /admin/api/reviewer-setup/confirm {code, totp}    -> account active (2-step is required)
//   then the normal POST /admin/api/login {username, password, totp}; auth.js routes it here.
// What a reviewer may do is decided in index.js (REVIEWER_ROUTES; everything else 403 forbidden_role).
import {
  base32Decode, base32Encode, decryptString, encryptString, hashPassword, importKek, passwordProblem, randomBytes, randomId, randomToken, sha256Hex,
  totpUri, verifyTotp
} from "./crypto.js";
import { audit, callerHash, hit } from "./store.js";
import { HttpError, now } from "./util.js";

export const REVIEWER_MAX = 10;
export const SETUP_TTL = 3 * 86400;           // a setup code works for 3 days
const SETUP_ATTEMPTS = 10;                    // per caller per 15 min
const USERNAME_RE = /^[A-Za-z0-9._@-]{3,64}$/;
const CODE_RE = /^[A-Za-z0-9_-]{24,128}$/;
export const REVIEWER_ID_RE = /^[a-f0-9]{12}$/;

const setupHash = (/** @type {string} */ code) => sha256Hex("rsetup:" + code);
const aad = (/** @type {string} */ id) => "totp:reviewer:" + id;
/** @param {any} r */
const pub = r => ({ id: r.id, username: r.username, status: r.status, totp_enabled: !!r.totp_enabled, created_at: r.created_at,
  last_login_at: r.last_login_at || null, setup_pending: !!r.setup_hash, setup_expires_at: r.setup_hash ? r.setup_expires : null });

/** Reviewer row by username (null when none, or before migration 0015). @param {any} db @param {string} username */
export async function reviewerByName(db, username) {
  if (!USERNAME_RE.test(String(username || ""))) return null;
  try { return await db.prepare("SELECT * FROM admin_reviewers WHERE username = ?1").bind(String(username)).first(); } catch { return null; }
}
/** @param {any} db @param {string} id */
export async function reviewerById(db, id) {
  if (!REVIEWER_ID_RE.test(String(id || ""))) return null;
  try { return await db.prepare("SELECT * FROM admin_reviewers WHERE id = ?1").bind(String(id)).first(); } catch { return null; }
}

/** Second step for a reviewer: the 6-digit code, the used time step claimed atomically (no replay).
 *  @param {any} env @param {any} rev @param {any} code @param {number} t */
export async function reviewerTotpOk(env, rev, code, t) {
  if (!rev.totp_secret_enc) return false;
  const kek = await importKek(env.SECRETS_KEK);
  if (!kek) return false;
  let secret;
  try { secret = base32Decode(await decryptString(kek, JSON.parse(rev.totp_secret_enc), aad(rev.id))); } catch { return false; }
  const step = await verifyTotp(secret, code, t, Number(rev.totp_last_step) || 0);
  if (step <= 0) return false;
  const r = await env.DB.prepare("UPDATE admin_reviewers SET totp_last_step = ?1 WHERE id = ?2 AND totp_last_step < ?1").bind(step, rev.id).run();
  return !!(r.meta && r.meta.changes);
}

/** A failed sign-in that named this reviewer: the reviewer's own decaying counter and delay (never the owner's).
 *  @param {any} env @param {any} rev @param {number} t @param {(f: number) => number} delayFor @param {number} decay */
export async function reviewerFailure(env, rev, t, delayFor, decay) {
  const row = await env.DB.prepare("UPDATE admin_reviewers SET failed_count = CASE WHEN ?1 - last_failed_at > ?2 THEN 1 ELSE failed_count + 1 END, " +
    "last_failed_at = ?1 WHERE id = ?3 RETURNING failed_count").bind(t, decay, rev.id).first();
  const fails = row ? Number(row.failed_count) : 0;
  const d = delayFor(fails);
  if (d) await env.DB.prepare("UPDATE admin_reviewers SET locked_until = MAX(locked_until, ?1) WHERE id = ?2").bind(t + d, rev.id).run();
  return fails;
}

/** Sign out a reviewer everywhere (sessions and trusted devices). @param {any} env @param {string} id */
async function signOut(env, id) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_sessions WHERE reviewer_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM admin_devices WHERE reviewer_id = ?1").bind(id)
  ]);
}

/* ---------------- owner ---------------- */
/** @param {any} env */
export async function listReviewers(env) {
  const rows = (await env.DB.prepare("SELECT * FROM admin_reviewers ORDER BY created_at, username").all()).results || [];
  return { reviewers: rows.map(pub), max: REVIEWER_MAX, setup_ttl: SETUP_TTL };
}

/** @param {any} env @returns {Promise<{code: string, hash: string, expires: number}>} */
async function newSetupCode(env) {
  const code = randomToken(24);
  return { code, hash: await setupHash(code), expires: now() + SETUP_TTL };
}

/** @param {any} env @param {any} body @param {any} owner */
export async function createReviewer(env, body, owner) {
  const username = String((body && body.username) || "").trim();
  if (!USERNAME_RE.test(username)) throw new HttpError(400, "invalid username", { code: "invalid_username" });
  if (owner && String(owner.username).toLowerCase() === username.toLowerCase()) throw new HttpError(409, "this name is the owner's", { code: "username_taken" });
  if (await env.DB.prepare("SELECT id FROM admin_reviewers WHERE lower(username) = lower(?1)").bind(username).first()) {
    throw new HttpError(409, "a reviewer with this name exists", { code: "username_taken" });
  }
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_reviewers").first();
  if (Number(n.n) >= REVIEWER_MAX) throw new HttpError(409, `at most ${REVIEWER_MAX} reviewer accounts`, { code: "too_many_reviewers" });
  const id = randomId(6), s = await newSetupCode(env), t = now();
  await env.DB.prepare("INSERT INTO admin_reviewers (id, username, setup_hash, setup_expires, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?5)")
    .bind(id, username, s.hash, s.expires, t).run();
  const row = await reviewerById(env.DB, id);
  return { reviewer: pub(row), setup_code: s.code, setup_expires_at: s.expires };
}

/** New setup code; password and 2-step cleared; signed out everywhere. @param {any} env @param {string} id */
export async function resetReviewer(env, id) {
  const r = await reviewerById(env.DB, id);
  if (!r) throw new HttpError(404, "reviewer not found");
  const s = await newSetupCode(env);
  await env.DB.prepare("UPDATE admin_reviewers SET password_hash = NULL, totp_secret_enc = NULL, totp_enabled = 0, totp_last_step = 0, failed_count = 0, " +
    "locked_until = 0, status = 'pending', setup_hash = ?1, setup_expires = ?2, updated_at = ?3 WHERE id = ?4").bind(s.hash, s.expires, now(), id).run();
  await signOut(env, id);
  return { reviewer: pub(await reviewerById(env.DB, id)), setup_code: s.code, setup_expires_at: s.expires };
}

/** @param {any} env @param {string} id @param {"active"|"disabled"} status */
export async function setReviewerStatus(env, id, status) {
  const r = await reviewerById(env.DB, id);
  if (!r) throw new HttpError(404, "reviewer not found");
  if (status === "active" && !(r.password_hash && r.totp_enabled)) throw new HttpError(409, "the reviewer has not finished the first sign-in", { code: "reviewer_not_ready" });
  await env.DB.prepare("UPDATE admin_reviewers SET status = ?1, updated_at = ?2 WHERE id = ?3").bind(status, now(), id).run();
  if (status === "disabled") await signOut(env, id);
  return { reviewer: pub(await reviewerById(env.DB, id)) };
}

/** @param {any} env @param {string} id */
export async function deleteReviewer(env, id) {
  const r = await reviewerById(env.DB, id);
  if (!r) throw new HttpError(404, "reviewer not found");
  await signOut(env, id);
  await env.DB.prepare("DELETE FROM admin_reviewers WHERE id = ?1").bind(id).run();
  return { ok: true, username: r.username };
}

/* ---------------- first sign-in (no session; the one-time setup code) ---------------- */
/** @param {any} env @param {Request} request @param {any} body */
async function pendingByCode(env, request, body) {
  const ip = await callerHash(env, request, "admin");
  const rl = await hit(env.DB, `rsetup:${ip}`, SETUP_ATTEMPTS, 900);
  if (!rl.ok) throw new HttpError(429, "too many attempts", { retryAfter: rl.retryAfter, code: "too_many" });
  const code = String((body && body.code) || "");
  const row = CODE_RE.test(code) ? await env.DB.prepare("SELECT * FROM admin_reviewers WHERE setup_hash = ?1").bind(await setupHash(code)).first() : null;
  if (!row || row.status !== "pending" || !(Number(row.setup_expires) > now())) {
    await audit(env, "anonymous", "reviewer.setup.denied", null, ip);
    throw new HttpError(403, "this setup link is not valid or has expired (invalid_setup)", { code: "invalid_setup" });
  }
  return { row, ip };
}

/** Step 1: own password; returns a fresh 2-step secret (shown on the reviewer's device only). @param {any} env @param {Request} request @param {any} body */
export async function setupStart(env, request, body) {
  const { row, ip } = await pendingByCode(env, request, body);
  const problem = passwordProblem(body.password);
  if (problem) throw new HttpError(400, problem, { code: "weak_password" });
  const kek = await importKek(env.SECRETS_KEK);
  if (!kek) throw new HttpError(503, "SECRETS_KEK secret is not set", { code: "totp_unavailable" });
  const secret = base32Encode(randomBytes(20));
  const e = await encryptString(kek, secret, aad(row.id));
  await env.DB.prepare("UPDATE admin_reviewers SET password_hash = ?1, totp_secret_enc = ?2, totp_enabled = 0, totp_last_step = 0, updated_at = ?3 WHERE id = ?4")
    .bind(await hashPassword(body.password), JSON.stringify({ iv: e.iv, ct: e.ct }), now(), row.id).run();
  await audit(env, "reviewer:" + row.id, "reviewer.setup.password", null, ip);
  return { username: row.username, secret, uri: totpUri(secret, row.username) };
}

/** Step 2: a code from the authenticator app; the account becomes active and the setup code stops working.
 *  @param {any} env @param {Request} request @param {any} body */
export async function setupConfirm(env, request, body) {
  const { row, ip } = await pendingByCode(env, request, body);
  if (!row.password_hash || !row.totp_secret_enc) throw new HttpError(409, "set the password first", { code: "setup_order" });
  if (!(await reviewerTotpOk(env, row, body.totp, now()))) throw new HttpError(400, "invalid TOTP code", { code: "invalid_totp" });
  const r = await env.DB.prepare("UPDATE admin_reviewers SET totp_enabled = 1, status = 'active', setup_hash = NULL, setup_expires = NULL, updated_at = ?1 " +
    "WHERE id = ?2 AND status = 'pending'").bind(now(), row.id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(403, "this setup link is not valid or has expired (invalid_setup)", { code: "invalid_setup" });
  await audit(env, "reviewer:" + row.id, "reviewer.activated", null, ip);
  return { ok: true, username: row.username };
}
