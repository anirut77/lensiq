// @ts-check
// backend/src/ai/fallback.js — the fallback policy of docs/PRODUCT-CHECK-DESIGN.md §10.3, as data (exactly that table):
//
// | kind                               | retry same                  | next provider                 | billed               |
// |------------------------------------|-----------------------------|-------------------------------|----------------------|
// | timeout, connection                | no                          | yes                           | assume yes (budget)  |
// | rate_limited, overloaded           | once if retryAfterMs fits   | yes                           | no                   |
// | server_error                       | once                        | yes                           | no                   |
// | refusal                            | no                          | yes                           | yes                  |
// | truncated                          | no                          | yes                           | yes                  |
// | invalid_json, schema_mismatch      | once                        | yes                           | yes                  |
// | bad_request, auth, unsupported     | no                          | yes + alert the admin         | no                   |
// | content_policy_input               | no                          | NO (never shopped around)     | no                   |
//
// "fits": retryAfterMs is known and <= min(MAX_RETRY_WAIT_MS, time left in the attempt budget). truncated: the design's
// optional "one retry with more tokens" is not used (the next provider is tried instead). Unknown kinds are treated as
// server_error by the gateway.

export const MAX_RETRY_WAIT_MS = 5000;

/** @typedef {{retry: "no"|"once"|"once_if_fits", next: boolean, billed: boolean, alert?: boolean}} Rule */
/** @type {Readonly<Record<string, Rule>>} */
export const POLICY = Object.freeze({
  timeout: { retry: "no", next: true, billed: true },
  connection: { retry: "no", next: true, billed: true },
  rate_limited: { retry: "once_if_fits", next: true, billed: false },
  overloaded: { retry: "once_if_fits", next: true, billed: false },
  server_error: { retry: "once", next: true, billed: false },
  refusal: { retry: "no", next: true, billed: true },
  truncated: { retry: "no", next: true, billed: true },
  invalid_json: { retry: "once", next: true, billed: true },
  schema_mismatch: { retry: "once", next: true, billed: true },
  bad_request: { retry: "no", next: true, billed: false, alert: true },
  auth: { retry: "no", next: true, billed: false, alert: true },
  unsupported: { retry: "no", next: true, billed: false, alert: true },
  content_policy_input: { retry: "no", next: false, billed: false }
});
export const KINDS = Object.freeze(Object.keys(POLICY));

/**
 * @param {string} kind
 * @param {{sameAttempts?: number, retryAfterMs?: number, timeLeftMs?: number}} [s] sameAttempts = attempts already made
 *   on this provider/model (1 after the first call)
 * @returns {{retry: boolean, next: boolean, billed: boolean, alert: boolean, waitMs: number}}
 */
export function decide(kind, s = {}) {
  const rule = POLICY[kind] || POLICY.server_error;
  const first = (s.sameAttempts || 1) < 2;
  let retry = false, waitMs = 0;
  if (first && rule.retry === "once") retry = true;
  if (first && rule.retry === "once_if_fits") {
    const ra = s.retryAfterMs;
    const left = s.timeLeftMs == null ? MAX_RETRY_WAIT_MS : s.timeLeftMs;
    if (Number.isFinite(ra) && ra >= 0 && ra <= Math.min(MAX_RETRY_WAIT_MS, left)) { retry = true; waitMs = ra; }
  }
  return { retry, next: rule.next, billed: rule.billed, alert: !!rule.alert, waitMs };
}
