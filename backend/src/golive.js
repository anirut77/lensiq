// @ts-check
// backend/src/golive.js — go-live configuration gate (round 11). The switches that start taking money or personal data
// (BILLING_ENABLED, live Opn keys / OPN_ALLOW_LIVE, GOOGLE_CLIENT_ID) are refused while the business side is not ready:
//
//   seller_missing        SELLER_NAME / SELLER_TAX_ID / SELLER_ADDRESS empty (receipts would be drafts; PDPA s.23
//                         and the Consumer Protection Act need the seller's identity)
//   legal_not_ready       LEGAL_TERMS_READY / LEGAL_PRIVACY_READY not "true" — set them only after counsel signed off
//                         terms.html / privacy.html (no [placeholders], no "ฉบับร่าง" draft banner; tools/check-site.mjs)
//   localhost_bypass      ALLOWED_ORIGINS contains localhost while TURNSTILE_DISABLED_FOR_LOCAL_DEV=true (the bypass
//                         trusts the Origin header, which non-browser clients can forge)
//   owner_totp_off        billing or live keys on, but the owner has no TOTP (PBKDF2 is capped at 100k on Workers —
//                         the second factor compensates)
//
// Enforcement:
//   * LIVE money (a live Opn key with OPN_ALLOW_LIVE=true) is ALWAYS refused while any problem exists (no override)
//   * GO_LIVE_GATE = "enforce" (backend/wrangler.toml): checkout (BILLING_ENABLED) and new Google / LINE sign-ins
//     (GOOGLE_CLIENT_ID; LINE_LOGIN_CHANNEL_ID + _SECRET, stream G 2026-11-13) are refused too — 503 {code:"go_live_blocked"}. "report" only reports (staging / test-mode
//     runs, `wrangler dev`); a missing var means "report" so unit tests and local dev keep working.
// Reported to the owner in GET /admin/api/state (signed in), GET /admin/api/go-live and GET /admin/api/billing.
import { getOwner } from "./auth.js";
import { turnstileStatus } from "./turnstile.js";
import { lineConfig } from "./line.js";
import { HttpError, flag, publicOrigins } from "./util.js";

const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export const gateMode = env => (String(env.GO_LIVE_GATE || "report").toLowerCase() === "enforce" ? "enforce" : "report");
const secretKey = env => String(env.OPN_SECRET_KEY || "");
/** A live Opn key that the go-live switch would accept. */
export const liveKeys = env => /^skey_[0-9a-z]/.test(secretKey(env)) && !secretKey(env).startsWith("skey_test_") && flag(env.OPN_ALLOW_LIVE);
const billingOn = env => flag(env.BILLING_ENABLED) && String(env.FREE_MODE ?? "true").toLowerCase() === "false";

/**
 * @param {Env} env
 * @returns {Promise<{ok: boolean, mode: string, switches: Record<string, boolean>, problems: {code: string, detail: string}[], blocks: Record<string, boolean>}>}
 */
export async function goLiveStatus(env) {
  const switches = { billing: billingOn(env), live_keys: liveKeys(env), google_signin: !!String(env.GOOGLE_CLIENT_ID || "").trim(), line_signin: !!lineConfig(env) };
  const problems = [];
  const seller = ["SELLER_NAME", "SELLER_TAX_ID", "SELLER_ADDRESS"].filter(k => !String(env[k] || "").trim());
  if (seller.length) problems.push({ code: "seller_missing", detail: seller.join(", ") });
  const legal = ["LEGAL_TERMS_READY", "LEGAL_PRIVACY_READY"].filter(k => !flag(env[k]));
  if (legal.length) problems.push({ code: "legal_not_ready", detail: legal.join(", ") + " not true" });
  if (turnstileStatus(env).local_dev_bypass && publicOrigins(env).some(o => LOCALHOST.test(o))) {
    problems.push({ code: "localhost_bypass", detail: "ALLOWED_ORIGINS contains localhost while TURNSTILE_DISABLED_FOR_LOCAL_DEV=true" });
  }
  if (switches.billing || switches.live_keys) {
    let owner = null;
    try { owner = await getOwner(env.DB); } catch { /* DB unreachable: reported as not ready */ }
    if (!owner || !owner.totp_enabled) problems.push({ code: "owner_totp_off", detail: "turn on owner TOTP (admin → Security) before billing / live keys" });
  }
  const mode = gateMode(env);
  const bad = problems.length > 0;
  return {
    ok: !bad, mode, switches, problems,
    blocks: { live_money: bad && switches.live_keys, checkout: bad && mode === "enforce" && switches.billing, google_signin: bad && mode === "enforce" && switches.google_signin,
      line_signin: bad && mode === "enforce" && switches.line_signin }
  };
}

/** Throws 503 go_live_blocked when `what` (live_money | checkout | google_signin | line_signin) is blocked by the gate. */
export async function assertGoLive(env, what) {
  const s = await goLiveStatus(env);
  if (s.blocks[what]) {
    throw new HttpError(503, `not available yet: the service is not ready to go live (${s.problems.map(p => p.code).join(", ")}) (go_live_blocked)`, { code: "go_live_blocked" });
  }
  return s;
}
