// @ts-check
// backend/src/store.js — small D1 helpers: daily salts + day-salted hashes, fixed-window rate limits, audit log,
// JSON settings.
import { hmacHex, randomToken } from "./crypto.js";
import { callerIp, dayOf, now } from "./util.js";

/** Random salt for `day`, created on first use. Deleted by the daily cron the next day (see retention.js). */
export async function dailySalt(db, day = dayOf()) {
  const row = await db.prepare("SELECT salt FROM daily_salts WHERE day = ?1").bind(day).first();
  if (row) return row.salt;
  await db.prepare("INSERT OR IGNORE INTO daily_salts (day, salt) VALUES (?1, ?2)").bind(day, randomToken(32)).run();
  return (await db.prepare("SELECT salt FROM daily_salts WHERE day = ?1").bind(day).first()).salt;
}

/** Day-salted, purpose-bound pseudonym of the caller (IP [+ extra]). The IP itself is never stored. Round 12: an IPv6
 *  caller is keyed on its /64 prefix (util.js callerIp), so per-caller limits cannot be dodged by rotating addresses. */
export async function callerHash(env, request, purpose, extra = "") {
  const salt = await dailySalt(env.DB);
  return (await hmacHex(salt, `${purpose}|${callerIp(request)}|${extra}`)).slice(0, 24);
}

/** Start of the fixed window containing t. `offset` shifts the window boundary (BKK_OFFSET: daily windows start at
 *  00:00 Asia/Bangkok instead of 00:00 UTC). */
export const windowStart = (t, windowSec, offset = 0) => t - ((t + offset) % windowSec);

/** Fixed-window counter. Returns {ok, count, retryAfter}. */
export async function hit(db, key, limit, windowSec, t = now(), offset = 0) {
  const ws = windowStart(t, windowSec, offset);
  const row = await db.prepare(
    "INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1) " +
    "ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING count"
  ).bind(key, ws).first();
  const count = row ? Number(row.count) : 1;
  return { ok: count <= limit, count, retryAfter: ws + windowSec - t };
}

/** Gives one use back (a call that was denied later or failed upstream). Never below 0. */
export async function unhit(db, key, windowSec, t = now(), offset = 0) {
  await db.prepare("UPDATE rate_limits SET count = count - 1 WHERE key = ?1 AND window_start = ?2 AND count > 0").bind(key, windowStart(t, windowSec, offset)).run();
}

/**
 * Several limits for ONE call. specs: [{key, limit, win, offset?, msg?}]. All are counted; when one is over its limit the
 * call is denied and every bucket counted for it (including the one that denied) is given back — a denied call costs
 * nothing. Returns {ok, denied?: spec, retryAfter?, release(filter?)} — release() gives back the buckets of an allowed
 * call that later did not happen (e.g. quota denied, provider failed).
 */
export async function hitAll(db, specs, t = now()) {
  const done = [];
  const release = async (filter = () => true) => { for (const s of done.filter(filter)) await unhit(db, s.key, s.win, t, s.offset || 0); };
  for (const s of specs) {
    const r = await hit(db, s.key, s.limit, s.win, t, s.offset || 0);
    done.push(s);
    if (!r.ok) { await release(); return { ok: false, denied: s, retryAfter: r.retryAfter, release: async () => {} }; }
  }
  return { ok: true, release };
}

/** Current count of a fixed window without incrementing it. */
export async function peek(db, key, windowSec, t = now()) {
  const row = await db.prepare("SELECT count FROM rate_limits WHERE key = ?1 AND window_start = ?2").bind(key, t - (t % windowSec)).first();
  return row ? Number(row.count) : 0;
}

const SECRETISH = /pass|secret|token|key|totp|code|csrf|cookie|authorization/i;
function scrub(v, depth = 0) {
  if (depth > 3) return "…";
  if (Array.isArray(v)) return v.slice(0, 20).map(x => scrub(x, depth + 1));
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = SECRETISH.test(k) ? "[redacted]" : scrub(x, depth + 1);
    return o;
  }
  return typeof v === "string" ? v.slice(0, 200) : v;
}

export async function audit(env, actor, action, detail = null, ipHash = null) {
  const d = detail == null ? null : JSON.stringify(scrub(detail)).slice(0, 1000);
  await env.DB.prepare("INSERT INTO audit_log (ts, actor, action, detail, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(now(), actor, action, d, ipHash).run();
}

export async function getSetting(db, key, def) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first();
  if (!row) return def;
  try { return JSON.parse(row.value); } catch { return def; }
}

export async function putSetting(db, key, value) {
  await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) " +
    "ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, JSON.stringify(value), now()).run();
}
