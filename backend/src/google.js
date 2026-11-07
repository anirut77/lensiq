// backend/src/google.js — verifies a "Sign in with Google" ID token ourselves (no client secret, no Google SDK):
// WebCrypto RS256 against Google's JWKS.
//
//   verifyGoogleIdToken(idToken, {clientId, nonce, fetchImpl, now, skew}) -> claims  (throws GoogleTokenError)
//
//   * header: alg must be RS256, kid required; the key is looked up in the JWKS cache, an unknown kid forces ONE
//     refetch (key rotation) — refetches are throttled (MIN_REFETCH) so garbage kids cannot hammer Google
//   * JWKS cache respects Cache-Control max-age (clamped 60 s … 24 h; default 1 h without the header)
//   * claims: iss ∈ {accounts.google.com, https://accounts.google.com}; aud == clientId (string or array, and azp ==
//     clientId when present with a multi-audience aud); exp > now − skew; iat ≤ now + skew; email_verified === true;
//     nonce === the nonce we issued; sub is a non-empty string ≤ 255 chars
// Never logs the token or any claim.
import { fromB64 } from "./crypto.js";

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
export const DEFAULT_SKEW = 60;          // seconds of clock skew tolerated on exp / iat
export const MIN_REFETCH = 30;           // at most one forced JWKS refetch per 30 s (unknown kid)
const MAX_TOKEN = 4096;

export class GoogleTokenError extends Error {
  /** @param {string} code */
  constructor(code) { super("invalid Google ID token: " + code); this.code = code; }
}

const dec = new TextDecoder();
const b64urlBytes = s => {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s)) throw new GoogleTokenError("encoding");
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  return fromB64(p + "=".repeat((4 - (p.length % 4)) % 4));
};
const b64urlJson = s => { try { return JSON.parse(dec.decode(b64urlBytes(s))); } catch (e) { if (e instanceof GoogleTokenError) throw e; throw new GoogleTokenError("json"); } };

/** Module-level cache (one per Worker isolate). Tests reset it with resetJwksCache(). */
let cache = { keys: new Map(), expires: 0, fetchedAt: 0 };
export function resetJwksCache() { cache = { keys: new Map(), expires: 0, fetchedAt: 0 }; }

/** max-age from a Cache-Control header, clamped; null when absent. */
export function maxAgeOf(cc) {
  const m = /(?:^|,)\s*max-age\s*=\s*(\d+)/i.exec(String(cc || ""));
  if (!m) return null;
  return Math.max(60, Math.min(86400, Number(m[1])));
}

async function fetchJwks(fetchImpl, t) {
  const r = await (fetchImpl || fetch)(GOOGLE_JWKS_URL, { headers: { Accept: "application/json" } });
  if (!r || !r.ok) throw new GoogleTokenError("jwks_unavailable");
  let j;
  try { j = await r.json(); } catch { throw new GoogleTokenError("jwks_unavailable"); }
  const keys = new Map();
  for (const k of (j && Array.isArray(j.keys) ? j.keys : [])) {
    if (!k || k.kty !== "RSA" || typeof k.kid !== "string" || typeof k.n !== "string" || typeof k.e !== "string") continue;
    if (k.use && k.use !== "sig") continue;
    if (k.alg && k.alg !== "RS256") continue;
    try {
      const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: k.n, e: k.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      keys.set(k.kid, key);
    } catch { /* malformed key: skip */ }
  }
  if (!keys.size) throw new GoogleTokenError("jwks_empty");
  const age = maxAgeOf(r.headers && r.headers.get ? r.headers.get("Cache-Control") : null) ?? 3600;
  cache = { keys, expires: t + age, fetchedAt: t };
}

/** Public key for `kid`: cache first (while fresh), else refetch; an unknown kid triggers one throttled refetch. */
export async function keyFor(kid, { fetchImpl, now: t }) {
  if (cache.expires <= t) await fetchJwks(fetchImpl, t);
  let key = cache.keys.get(kid);
  if (!key && t - cache.fetchedAt >= MIN_REFETCH) { await fetchJwks(fetchImpl, t); key = cache.keys.get(kid); }
  if (!key) throw new GoogleTokenError("unknown_kid");
  return key;
}

/**
 * @param {string} idToken
 * @param {{clientId: string, nonce: string, fetchImpl?: typeof fetch, now?: number, skew?: number}} o
 */
export async function verifyGoogleIdToken(idToken, o) {
  const t = o.now ?? Math.floor(Date.now() / 1000);
  const skew = o.skew ?? DEFAULT_SKEW;
  if (!o.clientId) throw new GoogleTokenError("not_configured");
  if (typeof idToken !== "string" || idToken.length > MAX_TOKEN) throw new GoogleTokenError("format");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleTokenError("format");
  const header = b64urlJson(parts[0]);
  if (!header || header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.kid.length > 128) throw new GoogleTokenError("alg");
  const sig = b64urlBytes(parts[2]);
  const key = await keyFor(header.kid, { fetchImpl: o.fetchImpl, now: t });
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) throw new GoogleTokenError("signature");
  const c = b64urlJson(parts[1]);
  if (!c || typeof c !== "object") throw new GoogleTokenError("claims");
  if (!GOOGLE_ISSUERS.includes(c.iss)) throw new GoogleTokenError("iss");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(o.clientId)) throw new GoogleTokenError("aud");
  if (aud.length > 1 && c.azp !== o.clientId) throw new GoogleTokenError("azp");
  if (typeof c.exp !== "number" || c.exp <= t - skew) throw new GoogleTokenError("expired");
  if (typeof c.iat !== "number" || c.iat > t + skew) throw new GoogleTokenError("iat");
  if (c.email_verified !== true && c.email_verified !== "true") throw new GoogleTokenError("email_unverified");
  if (typeof c.email !== "string" || !/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(c.email)) throw new GoogleTokenError("email");
  if (!o.nonce || typeof c.nonce !== "string" || c.nonce !== o.nonce) throw new GoogleTokenError("nonce");
  if (typeof c.sub !== "string" || !/^[0-9A-Za-z_-]{1,255}$/.test(c.sub)) throw new GoogleTokenError("sub");
  return c;
}
