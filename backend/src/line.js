// @ts-check
// backend/src/line.js — LINE Login (OpenID Connect) primitives, no LINE SDK (owner decision 2026-11-13: sign-in Google +
// LINE). Scope "openid profile" only: the e-mail permission is not requested. Works only when the owner has set
// LINE_LOGIN_CHANNEL_ID and LINE_LOGIN_CHANNEL_SECRET (`wrangler secret put`) and LINE_LOGIN_REDIRECT_URI (a page of the
// public site, https, on an ALLOWED_ORIGINS origin, registered as the channel's callback URL); otherwise lineConfig()
// is null and every LINE route answers 503 line_not_configured.
//
//   lineConfig(env)                                -> {channelId, secret, redirectUri} | null
//   authorizeUrl(cfg, {state, nonce, challenge, maxAge?})
//   pkceChallenge(verifier)                        -> base64url(SHA-256(verifier))  (S256)
//   exchangeCode(cfg, code, verifier, fetchImpl)   -> id_token   (the access / refresh tokens are discarded, never stored)
//   verifyLineIdToken(idToken, {channelId, secret, nonce, fetchImpl, now, skew}) -> claims   (throws LineTokenError)
//     * alg HS256 (signed with the channel secret: LINE's web login) or ES256 (key from LINE's JWKS by kid); "none" and
//       anything else refused
//     * iss = https://access.line.me, aud = channel id, exp > now - skew, iat <= now + skew, nonce = the one we issued,
//       sub = a LINE user id (U + 32 hex)
// Never logs a token, a code or a claim.
import { fromB64, toB64url } from "./crypto.js";
import { parseOrigins } from "./util.js";

export const LINE_AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
export const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
export const LINE_JWKS_URL = "https://api.line.me/oauth2/v2.1/certs";
export const LINE_ISSUER = "https://access.line.me";
export const LINE_SCOPE = "openid profile";
export const DEFAULT_SKEW = 60;
const MIN_REFETCH = 30;
const MAX_TOKEN = 8192;
const SUB_RE = /^U[0-9a-f]{32}$/;

export class LineTokenError extends Error {
  /** @param {string} code token | code | unavailable */
  constructor(code) { super("LINE sign-in failed: " + code); this.code = code; }
}

/** @param {Env} env */
export function lineConfig(env) {
  const channelId = String(env.LINE_LOGIN_CHANNEL_ID || "").trim();
  const secret = String(env.LINE_LOGIN_CHANNEL_SECRET || "").trim();
  const redirect = String(env.LINE_LOGIN_REDIRECT_URI || "").trim();
  if (!/^\d{6,20}$/.test(channelId) || !/^[A-Za-z0-9_-]{16,128}$/.test(secret) || !redirect) return null;
  let u;
  try { u = new URL(redirect); } catch { return null; }
  if (u.protocol !== "https:" || u.hash || u.username || u.password) return null;
  if (!parseOrigins(env.ALLOWED_ORIGINS).includes(u.origin)) return null;
  return { channelId, secret, redirectUri: u.href };
}

/** @param {{channelId: string, redirectUri: string}} cfg @param {{state: string, nonce: string, challenge: string, maxAge?: number}} o */
export function authorizeUrl(cfg, o) {
  const q = new URLSearchParams({
    response_type: "code", client_id: cfg.channelId, redirect_uri: cfg.redirectUri, state: o.state, scope: LINE_SCOPE,
    nonce: o.nonce, code_challenge: o.challenge, code_challenge_method: "S256"
  });
  if (o.maxAge != null) q.set("max_age", String(o.maxAge));
  else q.set("bot_prompt", "normal"); // sign-in / link: offer to add the linked official account as a friend (option "Normal")
  return LINE_AUTHORIZE_URL + "?" + q.toString();
}

/** @param {string} verifier */
export async function pkceChallenge(verifier) {
  return toB64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** Exchanges the authorisation code (back channel, with the channel secret and the PKCE verifier). Returns the ID token
 *  only. @param {{channelId: string, secret: string, redirectUri: string}} cfg @param {string} code @param {string} verifier
 *  @param {typeof fetch} [fetchImpl] */
export async function exchangeCode(cfg, code, verifier, fetchImpl) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, client_id: cfg.channelId, client_secret: cfg.secret, code_verifier: verifier });
  let r;
  try {
    r = await (fetchImpl || fetch)(LINE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: body.toString() });
  } catch { throw new LineTokenError("unavailable"); }
  if (!r || r.status >= 500) throw new LineTokenError("unavailable");
  if (!r.ok) throw new LineTokenError("code");
  let j;
  try { j = await r.json(); } catch { throw new LineTokenError("code"); }
  if (!j || typeof j.id_token !== "string") throw new LineTokenError("code");
  return j.id_token; // access_token / refresh_token are dropped here on purpose
}

const dec = new TextDecoder();
const b64urlBytes = s => {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s)) throw new LineTokenError("token");
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  try { return fromB64(p + "=".repeat((4 - (p.length % 4)) % 4)); } catch { throw new LineTokenError("token"); }
};
const b64urlJson = s => { try { return JSON.parse(dec.decode(b64urlBytes(s))); } catch { throw new LineTokenError("token"); } };

let cache = { keys: new Map(), expires: 0, fetchedAt: 0 };
export function resetLineJwksCache() { cache = { keys: new Map(), expires: 0, fetchedAt: 0 }; }

async function fetchJwks(fetchImpl, t) {
  let r;
  try { r = await (fetchImpl || fetch)(LINE_JWKS_URL, { headers: { Accept: "application/json" } }); } catch { throw new LineTokenError("unavailable"); }
  if (!r || !r.ok) throw new LineTokenError("unavailable");
  let j;
  try { j = await r.json(); } catch { throw new LineTokenError("unavailable"); }
  const keys = new Map();
  for (const k of (j && Array.isArray(j.keys) ? j.keys : [])) {
    if (!k || k.kty !== "EC" || k.crv !== "P-256" || typeof k.kid !== "string" || typeof k.x !== "string" || typeof k.y !== "string") continue;
    try {
      keys.set(k.kid, await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: k.x, y: k.y, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]));
    } catch { /* malformed key: skip */ }
  }
  cache = { keys, expires: t + 3600, fetchedAt: t };
}

async function esKey(kid, fetchImpl, t) {
  if (cache.expires <= t) await fetchJwks(fetchImpl, t);
  let key = cache.keys.get(kid);
  if (!key && t - cache.fetchedAt >= MIN_REFETCH) { await fetchJwks(fetchImpl, t); key = cache.keys.get(kid); }
  if (!key) throw new LineTokenError("token");
  return key;
}

/**
 * @param {string} idToken
 * @param {{channelId: string, secret: string, nonce: string, fetchImpl?: typeof fetch, now?: number, skew?: number}} o
 */
export async function verifyLineIdToken(idToken, o) {
  const t = o.now ?? Math.floor(Date.now() / 1000);
  const skew = o.skew ?? DEFAULT_SKEW;
  if (typeof idToken !== "string" || idToken.length > MAX_TOKEN) throw new LineTokenError("token");
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[2]) throw new LineTokenError("token");
  const header = b64urlJson(parts[0]);
  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const sig = b64urlBytes(parts[2]);
  let ok = false;
  if (header && header.alg === "HS256") {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(o.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify("HMAC", key, sig, signed);
  } else if (header && header.alg === "ES256" && typeof header.kid === "string" && header.kid && header.kid.length <= 128) {
    const key = await esKey(header.kid, o.fetchImpl, t);
    ok = sig.length === 64 && (await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, signed));
  } else throw new LineTokenError("token");
  if (!ok) throw new LineTokenError("token");
  const c = b64urlJson(parts[1]);
  if (!c || typeof c !== "object") throw new LineTokenError("token");
  if (c.iss !== LINE_ISSUER) throw new LineTokenError("token");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(o.channelId)) throw new LineTokenError("token");
  if (typeof c.exp !== "number" || c.exp <= t - skew) throw new LineTokenError("token");
  if (typeof c.iat !== "number" || c.iat > t + skew) throw new LineTokenError("token");
  if (!o.nonce || typeof c.nonce !== "string" || c.nonce !== o.nonce) throw new LineTokenError("token");
  if (typeof c.sub !== "string" || !SUB_RE.test(c.sub)) throw new LineTokenError("token");
  return c;
}
