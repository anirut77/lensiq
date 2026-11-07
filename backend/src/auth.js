// backend/src/auth.js — single owner account for the admin back office.
//
//  bootstrap  POST /admin/api/bootstrap {token, username, password}   only while no owner exists; token = Worker secret
//                                                                     ADMIN_BOOTSTRAP_TOKEN (>= 32 chars), compared in
//                                                                     constant time; delete the secret afterwards
//  login      POST /admin/api/login {username, password, totp?, mode?} -> {csrf[, token]} + __Host- session cookie
//  session    httpOnly Secure SameSite=Strict cookie (same-site deployments) or `Authorization: Bearer` (mode:"bearer",
//             for an admin page on another site, e.g. *.github.io); only SHA-256 of tokens is stored
//  CSRF       cookie-authenticated unsafe requests need X-CSRF-Token (synchronizer token, hashed in the session row)
//             AND an allowlisted Origin (ADMIN_ORIGINS)
//  limits     login 10 / 15 min per day-salted caller hash; account lockout after 5 failures (15 min, doubling, max 24 h)
//  TOTP       optional, RFC 6238, secret AES-GCM encrypted with SECRETS_KEK, replay-protected
import {
  base32Decode, base32Encode, decryptString, encryptString, hashPassword, importKek, passwordProblem, randomBytes,
  randomToken, sha256Hex, timingSafeEqual, totpUri, verifyPassword, verifyTotp
} from "./crypto.js";
import { audit, callerHash, hit } from "./store.js";
import { HttpError, now } from "./util.js";

export const COOKIE = "__Host-lq_admin";
export const SESSION_IDLE = 30 * 60;          // 30 min idle
export const SESSION_ABSOLUTE = 12 * 3600;    // 12 h absolute
export const LOCK_AFTER = 5;
export const LOCK_BASE = 15 * 60;
const DUMMY_HASH = "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const USERNAME_RE = /^[A-Za-z0-9._@-]{3,64}$/;

export async function getOwner(db) {
  return db.prepare("SELECT * FROM admin_users WHERE id = 1").first();
}

function cookieHeader(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

function readCookie(request) {
  const c = request.headers.get("Cookie") || "";
  for (const part of c.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return null;
}

export async function bootstrap(env, request, body) {
  const ip = await callerHash(env, request, "admin");
  const rl = await hit(env.DB, `boot:${ip}`, 5, 3600);
  if (!rl.ok) throw new HttpError(429, "too many attempts", { retryAfter: rl.retryAfter });
  if (await getOwner(env.DB)) throw new HttpError(409, "owner already exists");
  const expected = String(env.ADMIN_BOOTSTRAP_TOKEN || "");
  if (expected.length < 32) throw new HttpError(503, "ADMIN_BOOTSTRAP_TOKEN secret is not set (>= 32 chars)");
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
  if (!r.meta || !r.meta.changes) throw new HttpError(409, "owner already exists");
  await audit(env, "owner", "bootstrap.ok", { username }, ip);
  return { ok: true };
}

async function newSession(env) {
  const token = randomToken(32), csrf = randomToken(24), t = now();
  await env.DB.prepare("INSERT INTO admin_sessions (id_hash, csrf_hash, created_at, last_seen, expires_at) VALUES (?1, ?2, ?3, ?3, ?4)")
    .bind(await sha256Hex(token), await sha256Hex(csrf), t, t + SESSION_ABSOLUTE).run();
  return { token, csrf };
}

export async function login(env, request, body) {
  const ip = await callerHash(env, request, "admin");
  const rl = await hit(env.DB, `login:${ip}`, 10, 900);
  if (!rl.ok) throw new HttpError(429, "too many login attempts", { retryAfter: rl.retryAfter });
  const owner = await getOwner(env.DB);
  const t = now();
  if (owner && owner.locked_until > t) {
    await audit(env, "anonymous", "login.locked", null, ip);
    throw new HttpError(423, "account temporarily locked", { retryAfter: owner.locked_until - t });
  }
  // always spend the PBKDF2 time, also for an unknown user
  const pwOk = await verifyPassword(String(body.password || ""), owner ? owner.password_hash : DUMMY_HASH);
  const userOk = !!owner && timingSafeEqual(String(body.username || ""), owner.username);
  let totpOk = true, step = -1;
  if (owner && owner.totp_enabled && pwOk && userOk) {
    const secret = await totpSecret(env, owner);
    step = secret ? await verifyTotp(secret, body.totp, t, owner.totp_last_step) : -1;
    totpOk = step > 0;
  }
  if (!owner || !pwOk || !userOk || !totpOk) {
    if (owner) {
      const fails = owner.failed_count + 1;
      const lock = fails % LOCK_AFTER === 0 ? t + Math.min(LOCK_BASE * 2 ** (fails / LOCK_AFTER - 1), 86400) : owner.locked_until;
      await env.DB.prepare("UPDATE admin_users SET failed_count = ?1, locked_until = ?2 WHERE id = 1").bind(fails, lock).run();
    }
    await audit(env, "anonymous", "login.failed", { totp: owner && owner.totp_enabled ? (totpOk ? "ok" : "bad") : "off" }, ip);
    throw new HttpError(401, owner && owner.totp_enabled && pwOk && userOk ? "invalid TOTP code" : "invalid credentials");
  }
  await env.DB.prepare("UPDATE admin_users SET failed_count = 0, locked_until = 0, totp_last_step = MAX(totp_last_step, ?1) WHERE id = 1").bind(step).run();
  const s = await newSession(env);
  await audit(env, "owner", "login.ok", { mode: body.mode === "bearer" ? "bearer" : "cookie" }, ip);
  const out = { ok: true, csrf: s.csrf, totp_enabled: !!owner.totp_enabled, expires_in: SESSION_ABSOLUTE };
  if (body.mode === "bearer") out.token = s.token;
  return { body: out, cookie: cookieHeader(s.token, SESSION_ABSOLUTE) };
}

/** Authenticates an admin request. Unsafe methods with cookie auth need a matching X-CSRF-Token. */
export async function requireAdmin(env, request) {
  const authz = request.headers.get("Authorization") || "";
  const bearer = /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(authz);
  const token = bearer ? bearer[1] : readCookie(request);
  if (!token || !/^[A-Za-z0-9_-]{20,128}$/.test(token)) throw new HttpError(401, "not signed in");
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

export async function changePassword(env, sess, body) {
  const owner = await getOwner(env.DB);
  if (!owner || !(await verifyPassword(String(body.current || ""), owner.password_hash))) throw new HttpError(403, "current password is wrong");
  const problem = passwordProblem(body.next);
  if (problem) throw new HttpError(400, problem);
  const t = now();
  await env.DB.prepare("UPDATE admin_users SET password_hash = ?1, updated_at = ?2, password_changed_at = ?2 WHERE id = 1")
    .bind(await hashPassword(body.next), t).run();
  await env.DB.prepare("DELETE FROM admin_sessions WHERE id_hash != ?1").bind(sess.idHash).run(); // sign out elsewhere
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

export async function totpSetup(env) {
  const owner = await getOwner(env.DB);
  if (owner.totp_enabled) throw new HttpError(409, "TOTP already enabled — disable it first");
  const kek = await kekOrFail(env);
  const secret = base32Encode(randomBytes(20));
  const e = await encryptString(kek, secret, "totp:owner");
  await env.DB.prepare("UPDATE admin_users SET totp_secret_enc = ?1, totp_last_step = 0, updated_at = ?2 WHERE id = 1")
    .bind(JSON.stringify({ iv: e.iv, ct: e.ct }), now()).run();
  await audit(env, "owner", "totp.setup");
  return { secret, uri: totpUri(secret, owner.username) };
}

export async function totpEnable(env, body) {
  const owner = await getOwner(env.DB);
  const secret = await totpSecret(env, owner);
  if (!secret) throw new HttpError(400, "run TOTP setup first");
  const step = await verifyTotp(secret, body.code, now(), owner.totp_last_step);
  if (step < 0) throw new HttpError(400, "invalid TOTP code");
  await env.DB.prepare("UPDATE admin_users SET totp_enabled = 1, totp_last_step = ?1, updated_at = ?2 WHERE id = 1").bind(step, now()).run();
  await audit(env, "owner", "totp.enabled");
  return { ok: true };
}

export async function totpDisable(env, body) {
  const owner = await getOwner(env.DB);
  if (!(await verifyPassword(String(body.password || ""), owner.password_hash))) throw new HttpError(403, "password is wrong");
  const secret = await totpSecret(env, owner);
  if (owner.totp_enabled && (!secret || (await verifyTotp(secret, body.code, now(), owner.totp_last_step)) < 0)) throw new HttpError(400, "invalid TOTP code");
  await env.DB.prepare("UPDATE admin_users SET totp_enabled = 0, totp_secret_enc = NULL, updated_at = ?1 WHERE id = 1").bind(now()).run();
  await audit(env, "owner", "totp.disabled");
  return { ok: true };
}
