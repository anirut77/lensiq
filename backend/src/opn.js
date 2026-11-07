// @ts-check
// backend/src/opn.js — Opn Payments (Omise) client: PromptPay charge, charge retrieval, webhook signature check.
//
// Docs followed (docs.omise.co): PromptPay = POST /charges with amount (satang), currency=thb, source[type]=promptpay
// (server-side, secret key, HTTP Basic). QR = charge.source.scannable_code.image.download_uri. Status after the
// `charge.complete` webhook must be confirmed by retrieving the charge. Webhook signature: header Omise-Signature
// (hex HMAC-SHA256, comma-separated during secret rotation) over "<Omise-Signature-Timestamp>.<raw body>", key =
// base64-decoded webhook secret, constant-time compare. Minimum THB 20, maximum THB 150,000 per PromptPay charge.
// PromptPay charges cannot be voided or refunded through Opn (refunds are manual bank transfers — docs/BILLING-PLAN.md).
import { fromB64, hmacHex, timingSafeEqual } from "./crypto.js";
import { HttpError, flag } from "./util.js";

export const OPN_API = "https://api.omise.co";
export const OPN_VERSION = "2019-05-29";
export const PROMPTPAY_MIN = 2000;
export const PROMPTPAY_MAX = 15000000;
const CHARGE_ID_RE = /^chrg_(test_)?[0-9a-z]{10,40}$/;

/** Refuses missing keys, and live keys unless OPN_ALLOW_LIVE=true. */
export function opnKey(env) {
  const k = String(env.OPN_SECRET_KEY || "");
  if (!/^skey_(test_)?[0-9a-z]{10,60}$/.test(k)) throw new HttpError(503, "OPN_SECRET_KEY is not set");
  const live = !k.startsWith("skey_test_");
  if (live && !flag(env.OPN_ALLOW_LIVE)) throw new HttpError(503, "live Opn key refused (OPN_ALLOW_LIVE is not true)");
  return { key: k, live };
}

const form = obj => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v != null) p.append(k, String(v));
  return p.toString();
};

async function call(env, method, path, body, fetchImpl) {
  const { key } = opnKey(env);
  const res = await (fetchImpl || fetch)(OPN_API + path, {
    method,
    headers: { Authorization: "Basic " + btoa(key + ":"), "Omise-Version": OPN_VERSION, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? form(body) : undefined
  });
  let j = null;
  try { j = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !j || j.object === "error") throw new HttpError(502, "payment provider error", { provider_code: j && j.code ? String(j.code).slice(0, 40) : String(res.status) });
  return j;
}

export async function createPromptPayCharge(env, { amount, description, paymentId, expiresAt }, fetchImpl) {
  if (!Number.isInteger(amount) || amount < PROMPTPAY_MIN || amount > PROMPTPAY_MAX) throw new HttpError(400, "PromptPay amount must be 20–150,000 THB");
  return call(env, "POST", "/charges", {
    amount, currency: "thb", "source[type]": "promptpay",
    description: String(description || "LENSIQ").slice(0, 255),
    "metadata[payment_id]": paymentId,
    expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : undefined
  }, fetchImpl);
}

export async function retrieveCharge(env, chargeId, fetchImpl) {
  if (!CHARGE_ID_RE.test(String(chargeId || ""))) throw new HttpError(400, "invalid charge id");
  return call(env, "GET", "/charges/" + chargeId, null, fetchImpl);
}

/** Fetches the QR image (SVG) — only from an *.omise.co https URL. */
export async function fetchQr(env, uri, fetchImpl) {
  let u;
  try { u = new URL(uri); } catch { throw new HttpError(404, "no QR"); }
  if (u.protocol !== "https:" || !/(^|\.)omise\.co$/.test(u.hostname)) throw new HttpError(502, "unexpected QR host");
  const { key } = opnKey(env);
  const res = await (fetchImpl || fetch)(u.toString(), { headers: { Authorization: "Basic " + btoa(key + ":") } });
  if (!res.ok) throw new HttpError(502, "QR download failed");
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 512 * 1024) throw new HttpError(502, "QR too large");
  return buf;
}

export function qrUriOf(charge) {
  const s = charge && charge.source;
  return (s && s.scannable_code && s.scannable_code.image && s.scannable_code.image.download_uri) || null;
}

/**
 * Verifies an Opn webhook. secretB64 = webhook secret from the Opn dashboard (base64). Returns {ok, reason}.
 * toleranceSec: optional replay window on the signed timestamp (Opn: timestamp check is optional; we use 5 min).
 */
export async function verifyWebhookSignature(secretB64, timestamp, signatureHeader, rawBody, { nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300 } = {}) {
  if (!secretB64) return { ok: false, reason: "no secret configured" };
  if (!timestamp || !/^\d{9,11}$/.test(String(timestamp))) return { ok: false, reason: "missing/invalid timestamp" };
  if (!signatureHeader) return { ok: false, reason: "missing signature" };
  if (toleranceSec && Math.abs(nowSec - Number(timestamp)) > toleranceSec) return { ok: false, reason: "timestamp outside tolerance" };
  let key;
  try { key = fromB64(secretB64); } catch { return { ok: false, reason: "secret is not base64" }; }
  const expected = await hmacHex(key, `${timestamp}.${rawBody}`);
  const sigs = String(signatureHeader).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  let ok = false;
  for (const s of sigs) if (timingSafeEqual(s, expected)) ok = true; // check all — no early exit
  return ok ? { ok: true } : { ok: false, reason: "signature mismatch" };
}
