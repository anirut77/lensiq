// backend/src/turnstile.js — Cloudflare Turnstile, FAIL CLOSED.
//
// Required for /api/fortune (when the AI writing assistant is on) and /v1/billing/checkout (when billing is on):
//   TURNSTILE_SECRET     Worker secret (`wrangler secret put TURNSTILE_SECRET`)
//   TURNSTILE_HOSTNAMES  var: comma-separated hostnames the token must have been issued on (siteverify `hostname`)
// Missing either -> the protected endpoint refuses (503, "turnstile_not_configured"); the admin UI shows a notice.
// Local development escape: TURNSTILE_DISABLED_FOR_LOCAL_DEV=true skips verification ONLY for requests whose Origin
// is http(s)://localhost / 127.0.0.1 / [::1] — any other origin is still refused.
import { clientIp } from "./util.js";

export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export const turnstileHostnames = env => String(env.TURNSTILE_HOSTNAMES || "").split(",").map(h => h.trim().toLowerCase()).filter(Boolean);

/** Configuration state for the admin UI and status endpoints (never the secret). */
export function turnstileStatus(env) {
  const hosts = turnstileHostnames(env);
  return {
    configured: !!env.TURNSTILE_SECRET && hosts.length > 0,
    secret_set: !!env.TURNSTILE_SECRET,
    hostnames: hosts,
    local_dev_bypass: String(env.TURNSTILE_DISABLED_FOR_LOCAL_DEV || "") === "true"
  };
}

export const isLocalOrigin = request => LOCAL_ORIGIN.test(String(request.headers.get("Origin") || ""));

/** Whether a protected call from this request could pass at all (used to report `enabled` to the page). */
export function turnstileReady(env, request) {
  const st = turnstileStatus(env);
  return st.configured || (st.local_dev_bypass && isLocalOrigin(request));
}

/**
 * Verifies the `X-Turnstile-Token` header for `action`. Returns {ok, reason, code}. Fails closed when not configured.
 */
export async function verifyTurnstile(env, request, action, fetchImpl) {
  const st = turnstileStatus(env);
  if (!st.configured) {
    if (st.local_dev_bypass && isLocalOrigin(request)) return { ok: true, skipped: true };
    return { ok: false, code: "turnstile_not_configured", reason: st.local_dev_bypass ? "local-dev bypass refused for a non-localhost origin" : "TURNSTILE_SECRET / TURNSTILE_HOSTNAMES not set" };
  }
  const token = request.headers.get("X-Turnstile-Token") || "";
  if (!token || token.length > 2048) return { ok: false, code: "turnstile_failed", reason: "missing token" };
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: clientIp(request) });
  let j = null;
  try {
    const r = await (fetchImpl || fetch)(SITEVERIFY, { method: "POST", body: form });
    j = await r.json();
  } catch { return { ok: false, code: "turnstile_failed", reason: "verify unavailable" }; }
  if (!j || j.success !== true) return { ok: false, code: "turnstile_failed", reason: "rejected" };
  if (j.action !== action) return { ok: false, code: "turnstile_failed", reason: "wrong action" };
  if (!st.hostnames.includes(String(j.hostname || "").toLowerCase())) return { ok: false, code: "turnstile_failed", reason: "wrong hostname" };
  return { ok: true };
}
