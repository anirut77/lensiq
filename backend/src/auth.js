// @ts-check
// backend/src/auth.js — single owner account for the admin back office.
//
//  bootstrap  POST /admin/api/bootstrap {token, username, password}   only while no owner exists; token = Worker secret
//                                                                     ADMIN_BOOTSTRAP_TOKEN (>= 32 chars), compared in
//                                                                     constant time; delete the secret afterwards
//  login      POST /admin/api/login {username, password, totp?, mode?} -> {csrf[, token], device} + __Host- cookies
//  session    httpOnly Secure SameSite=Strict cookie (admin served from the Worker's own origin) or
//             `Authorization: Bearer` (mode:"bearer", admin page on another origin); only SHA-256 of tokens is stored
//  CSRF       cookie-authenticated unsafe requests need X-CSRF-Token (synchronizer token, hashed in the session row)
//             AND an allowlisted Origin (ADMIN_ORIGINS or the Worker's own origin)
//
//  Brute force / lockout design (review round 8 — H1, H2):
//   * per caller (day-salted IP hash): 10 attempts and 5 failures per 15 min -> 429 for THAT caller only
//   * global: 100 attempts per 15 min from callers without a trusted device token -> 429
//   * account: only failures whose username matched the owner count; the counter is incremented atomically
//     (UPDATE … RETURNING), decays (a failure more than 1 h after the previous one restarts the count) and drives a
//     PROGRESSIVE DELAY (from the 10th failure: 30 s, doubling every 5 failures, max 15 min) — never a hard lock
//   * a trusted device token (issued on successful login, `X-LQ-Device` header or __Host-lq_dev cookie) skips the
//     global limit and the account delay, so an attacker cannot keep the owner out; the password (+ TOTP) is still
//     required on every login
//  TOTP       optional, RFC 6238, secret AES-GCM encrypted with SECRETS_KEK; the used time step is claimed with an atomic
//             conditional UPDATE, so one code cannot be used twice even by parallel requests
//  re-auth    password change needs the current password (+ TOTP when on); TOTP setup needs the password; money ops
//             (refund, cancel / extend subscription, complimentary grant), retention/run and member status changes need
//             {password, totp} in the body (reauthOwner)
//  devices    GET /admin/api/devices lists trusted devices (id = first 16 hex of the stored hash), DELETE revokes;
//             disabling TOTP signs out every other session and forgets every trusted device
import {
  base32Decode, base32Encode, decryptString, encryptString, hashPassword, importKek, passwordProblem, randomBytes,
  randomToken, sha256Hex, timingSafeEqual, totpUri, verifyPassword, verifyTotp
} from "./crypto.js";
import { audit, callerHash, hit, peek } from "./store.js";
import { HttpError, now } from "./util.js";

export const COOKIE = "__Host-lq_admin";
export const DEVICE_COOKIE = "__Host-lq_dev";
export const SESSION_IDLE = 30 * 60;          // 30 min idle
export const SESSION_ABSOLUTE = 12 * 3600;    // 12 h absolute
export const DEVICE_TTL = 90 * 86400;
export const CALLER_ATTEMPTS = 10;            // per caller per 15 min
export const CALLER_FAILURES = 5;             // per caller per 15 min
export const GLOBAL_ATTEMPTS = 100;           // all untrusted callers per 15 min
export const WINDOW = 900;
export const DECAY = 3600;                    // account failure counter restarts after 1 h without failures
export const DELAY_AFTER = 10;
export const DELAY_MAX = 900;
const DUMMY_HASH = "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const USERNAME_RE = /^[A-Za-z0-9._@-]{3,64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

/** Progressive account delay in seconds after `fails` username-matched failures. */
export const accountDelay = fails => (fails < DELAY_AFTER ? 0 : Math.min(30 * 2 ** Math.floor((fails - DELAY_AFTER) / 5), DELAY_MAX));

export async function getOwner(db) {
  return db.prepare("SELECT * FROM admin_users WHERE id = 1").first();
}

const cookie = (name, token, maxAge) => `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
export const clearCookie = () => cookie(COOKIE, "", 0);

function readCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  for (const part of c.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function bootstrap(env, request, body) {
  const ip = await callerHash(env, request, "admin");
  const rl = await hit(env.DB, `boot:${ip}`, 5, 3600);
  if (!rl.ok) throw new HttpError(429, "too many attempts", { retryAfter: rl.retryAfter });
  if (await getOwner(env.DB)) throw new HttpError(409, "already set up");
  const expected = String(env.ADMIN_BOOTSTRAP_TOKEN || "");
  if (expected.length < 32) throw new HttpError(503, "bootstrap is not available");
  if (!timingSafeEqual(String(body.token || ""), expected)) {
    await audit(env, "anonymous", "bootstrap.denied", null, ip);
    throw new HttpError(403, "invalid bootstrap token");
  }
  const username = String(body.username || "owner");
  if (!USERNAME_RE.test(username)) throw new HttpError(400, "invalid username");
  const problem = passwordProblem(body.password);
  if (problem) throw new HttpError(400, problem);
  const t = now();
  const hash = await hashPassword(body.password);
  // INSERT with fixed id = 1 cannot succeed twice (primary key), even under a race
  const r = await env.DB.prepare(
    "INSERT OR IGNORE INTO admin_users (id, username, password_hash, created_at, updated_at, password_changed_at) VALUES (1, ?1, ?2, ?3, ?3, ?3)"
  ).bind(username, hash, t).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(409, "already set up");
  await audit(env, "owner", "bootstrap.ok", { username }, ip);
  return { ok: true };
}

async function newSession(env) {
  const token = randomToken(32), csrf = randomToken(24), t = now();
  await env.DB.prepare("INSERT INTO admin_sessions (id_hash, csrf_hash, created_at, last_seen, expires_at) VALUES (?1, ?2, ?3, ?3, ?4)")
    .bind(await sha256Hex(token), await sha256Hex(csrf), t, t + SESSION_ABSOLUTE).run();
  return { token, csrf };
}

/** True when the request carries a device token issued by a previous successful login. */
async function trustedDevice(env, request, t) {
  const tok = request.headers.get("X-LQ-Device") || readCookie(request, DEVICE_COOKIE);
  if (!tok || !TOKEN_RE.test(tok)) return null;
  const h = await sha256Hex(tok);
  const row = await env.DB.prepare("SELECT hash FROM admin_devices WHERE hash = ?1 AND created_at > ?2").bind(h, t - DEVICE_TTL).first();
  return row ? h : null;
}

/** Claims a TOTP step atomically: only one request can move totp_last_step forward to `step`. */
async function claimTotpStep(db, step) {
  if (step <= 0) return false;
  const r = await db.prepare("UPDATE admin_users SET totp_last_step = ?1 WHERE id = 1 AND totp_last_step < ?1").bind(step).run();
  return !!(r.meta && r.meta.changes);
}

async function recordFailure(env, ip, usernameMatched, t) {
  await hit(env.DB, `lfail:${ip}`, CALLER_FAILURES, WINDOW, t);
  if (!usernameMatched) return null;
  const row = await env.DB.prepare(
    "UPDATE admin_users SET failed_count = CASE WHEN ?1 - last_failed_at > ?2 THEN 1 ELSE failed_count + 1 END, last_failed_at = ?1 WHERE id = 1 RETURNING failed_count"
  ).bind(t, DECAY).first();
  const fails = row ? Number(row.failed_count) : 0;
  const delay = accountDelay(fails);
  if (delay) await env.DB.prepare("UPDATE admin_users SET locked_until = MAX(locked_until, ?1) WHERE id = 1").bind(t + delay).run();
  return fails;
}

export async function login(env, request, body) {
  const t = now();
  const ip = await callerHash(env, request, "admin");
  const device = await trustedDevice(env, request, t);
  const rl = await hit(env.DB, `login:${ip}`, CALLER_ATTEMPTS, WINDOW, t);
  if (!rl.ok) throw new HttpError(429, "too many login attempts", { retryAfter: rl.retryAfter });
  if ((await peek(env.DB, `lfail:${ip}`, WINDOW, t)) >= CALLER_FAILURES) throw new HttpError(429, "too many failed attempts — try again later", { retryAfter: WINDOW - (t % WINDOW) });
  if (!device) {
    const g = await hit(env.DB, "login:global", GLOBAL_ATTEMPTS, WINDOW, t);
    if (!g.ok) throw new HttpError(429, "login temporarily rate limited", { retryAfter: g.retryAfter });
  }
  const owner = await getOwner(env.DB);
  // progressive account delay (decaying) for callers without a trusted device token
  if (owner && !device && owner.locked_until > t && t - owner.last_failed_at <= DECAY) {
    await audit(env, "anonymous", "login.delayed", null, ip);
    throw new HttpError(429, "too many failed attempts — slow down", { retryAfter: owner.locked_until - t });
  }
  // always spend the PBKDF2 time, also for an unknown user
  const pwOk = await verifyPassword(String(body.password || ""), owner ? owner.password_hash : DUMMY_HASH);
  const userOk = !!owner && timingSafeEqual(String(body.username || ""), owner.username);
  let totpOk = true;
  if (owner && owner.totp_enabled && pwOk && userOk) {
    const secret = await totpSecret(env, owner);
    const step = secret ? await verifyTotp(secret, body.totp, t, owner.totp_last_step) : -1;
    totpOk = await claimTotpStep(env.DB, step);
  }
  if (!owner || !pwOk || !userOk || !totpOk) {
    const fails = await recordFailure(env, ip, userOk, t);
    await audit(env, "anonymous", "login.failed", { user: userOk ? "owner" : "other", totp: owner && owner.totp_enabled ? (totpOk ? "ok" : "bad") : "off", fails }, ip);
    throw new HttpError(401, owner && owner.totp_enabled && pwOk && userOk ? "invalid TOTP code" : "invalid credentials");
  }
  await env.DB.prepare("UPDATE admin_users SET failed_count = 0, locked_until = 0 WHERE id = 1").run();
  const s = await newSession(env);
  let deviceToken = null;
  if (device) await env.DB.prepare("UPDATE admin_devices SET last_used = ?1 WHERE hash = ?2").bind(t, device).run();
  else {
    deviceToken = randomToken(32);
    await env.DB.prepare("INSERT INTO admin_devices (hash, created_at, last_used) VALUES (?1, ?2, ?2)").bind(await sha256Hex(deviceToken), t).run();
  }
  await audit(env, "owner", "login.ok", { mode: body.mode === "bearer" ? "bearer" : "cookie", device: device ? "trusted" : "new" }, ip);
  const out = { ok: true, csrf: s.csrf, totp_enabled: !!owner.totp_enabled, expires_in: SESSION_ABSOLUTE };
  if (body.mode === "bearer") out.token = s.token;
  if (deviceToken) out.device = deviceToken;
  const cookies = [cookie(COOKIE, s.token, SESSION_ABSOLUTE)];
  if (deviceToken) cookies.push(cookie(DEVICE_COOKIE, deviceToken, DEVICE_TTL));
  return { body: out, cookies };
}

/** Authenticates an admin request. Unsafe methods with cookie auth need a matching X-CSRF-Token. */
export async function requireAdmin(env, request) {
  const authz = request.headers.get("Authorization") || "";
  const bearer = /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(authz);
  const token = bearer ? bearer[1] : readCookie(request, COOKIE);
  if (!token || !TOKEN_RE.test(token)) throw new HttpError(401, "not signed in");
  const idHash = await sha256Hex(token);
  const s = await env.DB.prepare("SELECT * FROM admin_sessions WHERE id_hash = ?1").bind(idHash).first();
  const t = now();
  if (!s || s.expires_at <= t || t - s.last_seen > SESSION_IDLE) {
    if (s) await env.DB.prepare("DELETE FROM admin_sessions WHERE id_hash = ?1").bind(idHash).run();
    throw new HttpError(401, "session expired");
  }
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (unsafe && !bearer) {
    const csrf = request.headers.get("X-CSRF-Token") || "";
    if (!csrf || !timingSafeEqual(await sha256Hex(csrf), s.csrf_hash)) throw new HttpError(403, "CSRF token missing or invalid");
  }
  await env.DB.prepare("UPDATE admin_sessions SET last_seen = ?1 WHERE id_hash = ?2").bind(t, idHash).run();
  return { idHash, viaCookie: !bearer };
}

/** Fresh CSRF token for the current session (e.g. after a page reload). Readable only by allowlisted origins (CORS). */
export async function rotateCsrf(env, sess) {
  const csrf = randomToken(24);
  await env.DB.prepare("UPDATE admin_sessions SET csrf_hash = ?1 WHERE id_hash = ?2").bind(await sha256Hex(csrf), sess.idHash).run();
  return csrf;
}

export async function logout(env, sess) {
  await env.DB.prepare("DELETE FROM admin_sessions WHERE id_hash = ?1").bind(sess.idHash).run();
  await audit(env, "owner", "logout");
}

/** Re-authentication for sensitive changes: password, plus a fresh TOTP code when TOTP is on. */
async function reauth(env, owner, password, code) {
  if (!(await verifyPassword(String(password || ""), owner.password_hash))) throw new HttpError(403, "password is wrong");
  if (owner.totp_enabled) {
    const secret = await totpSecret(env, owner);
    const step = secret ? await verifyTotp(secret, code, now(), owner.totp_last_step) : -1;
    if (!(await claimTotpStep(env.DB, step))) throw new HttpError(403, "valid TOTP code required");
  }
}

/** Re-authentication gate for sensitive admin actions: body {password, totp}. Throws 403 when wrong. */
export async function reauthOwner(env, body) {
  const owner = await getOwner(env.DB);
  if (!owner) throw new HttpError(401, "not signed in");
  await reauth(env, owner, body && body.password, body && body.totp);
}

export async function changePassword(env, sess, body) {
  const owner = await getOwner(env.DB);
  await reauth(env, owner, body.current, body.totp);
  const problem = passwordProblem(body.next);
  if (problem) throw new HttpError(400, problem);
  const t = now();
  await env.DB.prepare("UPDATE admin_users SET password_hash = ?1, updated_at = ?2, password_changed_at = ?2 WHERE id = 1")
    .bind(await hashPassword(body.next), t).run();
  await env.DB.prepare("DELETE FROM admin_sessions WHERE id_hash != ?1").bind(sess.idHash).run(); // sign out elsewhere
  await env.DB.prepare("DELETE FROM admin_devices").run(); // new password: every device must sign in normally again
  await audit(env, "owner", "password.changed");
  return { ok: true };
}

// ---- TOTP ------------------------------------------------------------------------------------------------------------
async function kekOrFail(env) {
  const kek = await importKek(env.SECRETS_KEK);
  if (!kek) throw new HttpError(503, "SECRETS_KEK secret is not set (needed to store the TOTP secret encrypted)");
  return kek;
}

async function totpSecret(env, owner) {
  if (!owner.totp_secret_enc) return null;
  const kek = await importKek(env.SECRETS_KEK);
  if (!kek) return null;
  try { return base32Decode(await decryptString(kek, JSON.parse(owner.totp_secret_enc), "totp:owner")); } catch { return null; }
}

export async function totpSetup(env, body = {}) {
  const owner = await getOwner(env.DB);
  if (owner.totp_enabled) throw new HttpError(409, "TOTP already enabled — disable it first");
  if (!(await verifyPassword(String(body.password || ""), owner.password_hash))) throw new HttpError(403, "password is wrong");
  const kek = await kekOrFail(env);
  const secret = base32Encode(randomBytes(20));
  const e = await encryptString(kek, secret, "totp:owner");
  await env.DB.prepare("UPDATE admin_users SET totp_secret_enc = ?1, updated_at = ?2 WHERE id = 1")
    .bind(JSON.stringify({ iv: e.iv, ct: e.ct }), now()).run();
  await audit(env, "owner", "totp.setup");
  return { secret, uri: totpUri(secret, owner.username) };
}

export async function totpEnable(env, body) {
  const owner = await getOwner(env.DB);
  const secret = await totpSecret(env, owner);
  if (!secret) throw new HttpError(400, "run TOTP setup first");
  const step = await verifyTotp(secret, body.code, now(), owner.totp_last_step);
  if (!(await claimTotpStep(env.DB, step))) throw new HttpError(400, "invalid TOTP code");
  await env.DB.prepare("UPDATE admin_users SET totp_enabled = 1, updated_at = ?1 WHERE id = 1").bind(now()).run();
  await audit(env, "owner", "totp.enabled");
  return { ok: true };
}

export async function totpDisable(env, body, sess = null) {
  const owner = await getOwner(env.DB);
  await reauth(env, owner, body.password, body.code);
  await env.DB.prepare("UPDATE admin_users SET totp_enabled = 0, totp_secret_enc = NULL, updated_at = ?1 WHERE id = 1").bind(now()).run();
  // weaker login from now on: sign out every other session and forget trusted devices (they must log in again)
  const others = await env.DB.prepare("DELETE FROM admin_sessions WHERE id_hash != ?1").bind(sess ? sess.idHash : "").run();
  const devs = await env.DB.prepare("DELETE FROM admin_devices").run();
  await audit(env, "owner", "totp.disabled", { sessions_revoked: (others.meta && others.meta.changes) || 0, devices_revoked: (devs.meta && devs.meta.changes) || 0 });
  return { ok: true };
}

// ---- trusted devices -------------------------------------------------------------------------------------------------
const DEVICE_ID_RE = /^[a-f0-9]{16}$/;

export async function listDevices(env, request) {
  const t = now();
  const cur = await trustedDevice(env, request, t);
  const rows = (await env.DB.prepare("SELECT hash, created_at, last_used FROM admin_devices ORDER BY last_used DESC LIMIT 100").all()).results || [];
  return { devices: rows.map(r => ({ id: r.hash.slice(0, 16), created_at: r.created_at, last_used: r.last_used, expires_at: r.created_at + DEVICE_TTL, current: r.hash === cur })) };
}

/** id = 16-hex device id from listDevices, or "all". */
export async function revokeDevice(env, id) {
  if (id === "all") {
    const r = await env.DB.prepare("DELETE FROM admin_devices").run();
    return { ok: true, revoked: (r.meta && r.meta.changes) || 0 };
  }
  if (!DEVICE_ID_RE.test(String(id || ""))) throw new HttpError(404, "device not found");
  const r = await env.DB.prepare("DELETE FROM admin_devices WHERE substr(hash, 1, 16) = ?1").bind(id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "device not found");
  return { ok: true, revoked: r.meta.changes };
}
