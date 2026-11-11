// @ts-check
// backend/src/crypto.js — WebCrypto only (works in Workers and Node 22): random tokens, SHA-256/HMAC, constant-time
// compare, PBKDF2 password hashing, TOTP (RFC 6238), AES-GCM envelope encryption with a KEK from a Worker secret.

const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export const toB64 = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
export const fromB64 = s => Uint8Array.from(atob(String(s)), c => c.charCodeAt(0));
export const toB64url = bytes => toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
export const fromHex = s => Uint8Array.from(String(s).match(/../g) || [], h => parseInt(h, 16));

export function randomBytes(n) { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return a; }
export const randomToken = (n = 32) => toB64url(randomBytes(n));
export const randomId = (n = 16) => toHex(randomBytes(n));

export async function sha256Hex(s) {
  return toHex(new Uint8Array(await subtle().digest("SHA-256", typeof s === "string" ? enc.encode(s) : s)));
}

async function hmacKey(keyBytes, hash = "SHA-256") {
  return subtle().importKey("raw", keyBytes, { name: "HMAC", hash }, false, ["sign"]);
}
export async function hmac(keyBytes, msg, hash = "SHA-256") {
  const k = await hmacKey(typeof keyBytes === "string" ? enc.encode(keyBytes) : keyBytes, hash);
  return new Uint8Array(await subtle().sign("HMAC", k, typeof msg === "string" ? enc.encode(msg) : msg));
}
export const hmacHex = async (keyBytes, msg) => toHex(await hmac(keyBytes, msg));

/** Constant-time string comparison (length difference still costs a full loop over the longer string). */
export function timingSafeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// ---- passwords -------------------------------------------------------------------------------------------------
// Cloudflare Workers caps PBKDF2 at 100 000 iterations; SHA-256, 16-byte salt, 32-byte key. Argon2 is not in
// WebCrypto; the cap is compensated by login rate limits + account lockout + optional TOTP.
export const PBKDF2_ITERATIONS = 100000;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;

export function passwordProblem(pw) {
  if (typeof pw !== "string") return "password required";
  if (pw.length < PASSWORD_MIN) return `password must be at least ${PASSWORD_MIN} characters`;
  if (pw.length > PASSWORD_MAX) return "password too long";
  if (new Set(pw).size < 5) return "password too repetitive";
  return null;
}

async function pbkdf2(pw, salt, iterations) {
  const key = await subtle().importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(pw, iterations = PBKDF2_ITERATIONS) {
  const salt = randomBytes(16);
  const h = await pbkdf2(pw, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toB64(salt)}$${toB64(h)}`;
}

export async function verifyPassword(pw, stored) {
  const m = /^pbkdf2-sha256\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(String(stored || ""));
  if (!m || typeof pw !== "string" || pw.length > PASSWORD_MAX) return false;
  const it = Math.min(Number(m[1]), PBKDF2_ITERATIONS);
  const h = await pbkdf2(pw, fromB64(m[2]), it);
  return timingSafeEqual(toB64(h), m[3]);
}

/** PBKDF2-SHA256 of a short secret (recovery codes), base64. @param {string} secret @param {Uint8Array} salt @param {number} iterations */
export async function pbkdf2B64(secret, salt, iterations) {
  return toB64(await pbkdf2(secret, salt, Math.min(iterations, PBKDF2_ITERATIONS)));
}

/** HMAC-SHA256 (hex) of msg under a key derived from SECRETS_KEK with HKDF (info names the purpose, so the KEK itself is
 *  never used as an HMAC key). null when the KEK is missing or invalid. @param {string} kekB64 @param {string} info @param {string} msg */
export async function kekHmacHex(kekB64, info, msg) {
  let raw;
  try { raw = kekB64 ? fromB64(kekB64) : null; } catch { raw = null; }
  if (!raw || raw.length !== 32) return null;
  const base = await subtle().importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  const key = await subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode(info) }, base,
    { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
  const mac = new Uint8Array(await subtle().sign("HMAC", key, enc.encode(msg)));
  return [...mac].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---- TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ------------------------------------------------------------------------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(bytes) {
  let bits = 0, val = 0, out = "";
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s) {
  const clean = String(s).toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0, val = 0;
  const out = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("invalid base32");
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export async function totpAt(secretBytes, step) {
  const msg = new Uint8Array(8);
  let s = step;
  for (let i = 7; i >= 0; i--) { msg[i] = s & 255; s = Math.floor(s / 256); }
  const h = await hmac(secretBytes, msg, "SHA-1");
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1000000).padStart(6, "0");
}

/** Returns the matched time step (> lastStep, within ±1 step) or -1. */
export async function verifyTotp(secretBytes, code, t, lastStep = 0) {
  if (!/^\d{6}$/.test(String(code || ""))) return -1;
  const cur = Math.floor(t / 30);
  let found = -1;
  for (const st of [cur - 1, cur, cur + 1]) {
    if (st <= lastStep) continue;
    if (timingSafeEqual(await totpAt(secretBytes, st), String(code))) found = st;
  }
  return found;
}

export const totpUri = (secretB32, account, issuer = "LENSIQ Admin") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

// ---- AES-GCM envelope (KEK = Worker secret SECRETS_KEK, base64 of 32 bytes) ------------------------------------------
export async function importKek(kekB64) {
  if (!kekB64) return null;
  let raw;
  try { raw = fromB64(kekB64); } catch { throw new Error("SECRETS_KEK is not valid base64"); }
  if (raw.length !== 32) throw new Error("SECRETS_KEK must be 32 bytes (base64)");
  const key = await subtle().importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  return { key, id: (await sha256Hex(raw)).slice(0, 8) };
}

/** aad binds the ciphertext to its purpose (e.g. the secret name), so it cannot be swapped into another slot. */
export async function encryptString(kek, plaintext, aad) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, kek.key, enc.encode(plaintext)));
  return { iv: toB64(iv), ct: toB64(ct), kek_id: kek.id };
}

export async function decryptString(kek, { iv, ct }, aad) {
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(iv), additionalData: enc.encode(aad) }, kek.key, fromB64(ct));
  return new TextDecoder().decode(pt);
}
