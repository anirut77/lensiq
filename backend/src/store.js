// backend/src/store.js — small D1 helpers: daily salts + day-salted hashes, fixed-window rate limits, audit log,
// JSON settings.
import { hmacHex, randomToken } from "./crypto.js";
import { clientIp, dayOf, now } from "./util.js";

/** Random salt for `day`, created on first use. Deleted by the daily cron the next day (see retention.js). */
export async function dailySalt(db, day = dayOf()) {
  const row = await db.prepare("SELECT salt FROM daily_salts WHERE day = ?1").bind(day).first();
  if (row) return row.salt;
  await db.prepare("INSERT OR IGNORE INTO daily_salts (day, salt) VALUES (?1, ?2)").bind(day, randomToken(32)).run();
  return (await db.prepare("SELECT salt FROM daily_salts WHERE day = ?1").bind(day).first()).salt;
}

/** Day-salted, purpose-bound pseudonym of the caller (IP [+ extra]). The IP itself is never stored. */
export async function callerHash(env, request, purpose, extra = "") {
  const salt = await dailySalt(env.DB);
  return (await hmacHex(salt, `${purpose}|${clientIp(request)}|${extra}`)).slice(0, 24);
}

/** Fixed-window counter. Returns {ok, count, retryAfter}. */
export async function hit(db, key, limit, windowSec, t = now()) {
  const ws = t - (t % windowSec);
  const row = await db.prepare(
    "INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1) " +
    "ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING count"
  ).bind(key, ws).first();
  const count = row ? Number(row.count) : 1;
  return { ok: count <= limit, count, retryAfter: ws + windowSec - t };
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
