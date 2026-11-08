// @ts-check
// backend/src/alerts.js — push delivery of owner alerts (round 11). Alerts are always stored in D1 (`alerts` table, shown
// in the admin until acknowledged) and logged as `alert.<kind>` (Workers Logs: create a log alert on that event name).
// Optionally they are POSTed to ALERT_WEBHOOK_URL (Worker SECRET — an https URL of a Slack / Discord / Google Chat
// incoming webhook, ntfy topic, or your own endpoint). The payload carries only the kind, a payment / lead reference and
// a fixed sentence — never personal data, amounts per person, keys or the webhook payload.
//   kinds: payment_mismatch | fulfilment_failed | fulfilment_repaired | lead_new | late_payment_fulfilled (round 12) |
//          charge_stuck_pending (round 12) | test_charge_cap (round 12)
const TEXT = {
  payment_mismatch: "LENSIQ: payment amount/currency mismatch — check admin → Alerts",
  fulfilment_failed: "LENSIQ: a paid order could not be fulfilled (will retry) — check admin → Alerts",
  fulfilment_repaired: "LENSIQ: a paid order was fulfilled by the repair pass — check admin → Alerts",
  lead_new: "LENSIQ: new demo request — check admin → Leads",
  late_payment_fulfilled: "LENSIQ: a payment closed as expired was paid late and has now been fulfilled — check admin → Alerts",
  charge_stuck_pending: "LENSIQ: a PromptPay charge is still 'pending' at Opn after 24 h — check it in the Opn dashboard",
  test_charge_cap: "LENSIQ: the admin test-charge cap was reached — check admin → Audit"
};

/** @param {Env} env @param {string} kind @param {string|null} ref @param {unknown} [_detail] @param {typeof fetch} [fetchImpl] */
export async function pushAlert(env, kind, ref, _detail, fetchImpl) {
  const url = String(env.ALERT_WEBHOOK_URL || "");
  if (!/^https:\/\/[^\s]+$/.test(url)) return false;
  const text = (TEXT[kind] || "LENSIQ alert: " + kind) + (ref ? ` (ref ${String(ref).slice(0, 32)})` : "");
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text, kind, ref: ref ? String(ref).slice(0, 32) : null }) };
  try { init.signal = AbortSignal.timeout(3000); } catch { /* older runtime */ }
  const r = await (fetchImpl || fetch)(url, init);
  return !!(r && r.ok);
}
