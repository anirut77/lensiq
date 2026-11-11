// @ts-check
// backend/src/ai/keystore.js — AI provider keys set from the admin panel (owner spec 2026-11-11; migration 0012).
//
//   write-only     no function here returns a key to a caller outside the gateway; the admin sees provider, source
//                  ("panel" | "server" | "none"), last 4 characters, when it was set and the last test result
//   envelope       per stored key: a random 256-bit data key encrypts the key (AES-GCM, AAD "aikey:<provider>"), and the
//                  data key is encrypted with SECRETS_KEK (AAD "aikey-dek:<provider>"). A row moved to another provider
//                  or read with another KEK does not decrypt; it is reported "unreadable" and never used
//   priority       a key set in the panel is used before the Worker secret of the same provider (owner decision);
//                  removing it falls back to the Worker secret
//   re-auth/audit  in the router (index.js): password + a fresh 6-digit code in the request itself, 2-step on; every set,
//                  replace, remove and test is audited with provider and last 4 only
//   test key       one request per provider that bills nothing (adapters/keycheck.js); the key travels in a header; only
//                  OK / FAIL is returned. Providers whose check endpoint does not state that it is free are not tested
//                  from the panel (NOT_TESTED)
// Database access only through ./db.js.
import { decryptString, encryptString, importKek, randomBytes } from "../crypto.js";
import { HttpError, now } from "../util.js";
import { PROVIDERS, PROVIDER_IDS } from "./adapters/index.js";
import { KEY_CHARS, KEY_SHAPES, PANEL_TESTABLE, checkKeys, checkVars } from "./adapters/keycheck.js";
import { deleteKeyRow, keyRows, noteKeyCheck, putKeyRow } from "./db.js";

const subtle = () => globalThis.crypto.subtle;
const te = new TextEncoder();
const b64 = (/** @type {Uint8Array} */ u) => btoa(String.fromCharCode(...u));
const unb64 = (/** @type {string} */ s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export { KEY_SHAPES, PANEL_TESTABLE };
export const TEST_PER_HOUR = 10;

/** @param {string} id */
export function assertProvider(id) {
  if (!PROVIDER_IDS.includes(id)) throw new HttpError(404, "unknown provider", { code: "unknown_provider" });
  return id;
}

/** @param {string} id @param {unknown} key */
export function checkShape(id, key) {
  const ok = typeof key === "string" && key.length <= 300 && KEY_CHARS.test(key) && (KEY_SHAPES[id] || /^.{16,300}$/).test(key);
  // the refused value is never echoed back
  if (!ok) throw new HttpError(400, "this does not look like a key of this provider", { code: "invalid_key_format" });
  return /** @type {string} */ (key);
}

export async function kekOrFail(env) {
  let kek = null;
  try { kek = await importKek(env.SECRETS_KEK); } catch { kek = null; }
  if (!kek) throw new HttpError(503, "the server's encryption key is not set", { code: "kek_missing" });
  return kek;
}

/** @param {any} kek @param {string} provider @param {string} key */
async function seal(kek, provider, key) {
  const dekRaw = randomBytes(32);
  const dek = await subtle().importKey("raw", dekRaw, "AES-GCM", false, ["encrypt"]);
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: te.encode("aikey:" + provider) }, dek, te.encode(key)));
  const wrapped = await encryptString(kek, b64(dekRaw), "aikey-dek:" + provider);
  dekRaw.fill(0);
  return JSON.stringify({ v: 1, dek: { iv: wrapped.iv, ct: wrapped.ct }, iv: b64(iv), ct: b64(ct), kek_id: wrapped.kek_id });
}

/** @param {any} kek @param {string} provider @param {string} keyEnc @returns {Promise<string|null>} */
async function open(kek, provider, keyEnc) {
  try {
    const e = JSON.parse(keyEnc);
    if (!e || e.v !== 1) return null;
    const dekRaw = unb64(await decryptString(kek, e.dek, "aikey-dek:" + provider));
    const dek = await subtle().importKey("raw", dekRaw, "AES-GCM", false, ["decrypt"]);
    dekRaw.fill(0);
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: unb64(e.iv), additionalData: te.encode("aikey:" + provider) }, dek, unb64(e.ct));
    const key = new TextDecoder().decode(pt);
    return KEY_CHARS.test(key) ? key : null;
  } catch { return null; }
}

/** Keys set in the panel that decrypt, {provider: key}. Unreadable rows are left out. For the gateway only. */
export async function readPanelKeys(env) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!env.DB) return out;
  let kek = null;
  try { kek = await importKek(env.SECRETS_KEK); } catch { kek = null; }
  if (!kek) return out;
  let rows = [];
  try { rows = await keyRows(env.DB); } catch { return out; } // table missing (migration 0012 not applied): Worker secrets only
  for (const r of rows) {
    if (!PROVIDER_IDS.includes(r.provider)) continue;
    const k = await open(kek, r.provider, r.key_enc);
    if (k) out[r.provider] = k;
  }
  return out;
}

/** The Worker secret of a provider, trimmed, or "". @param {any} env @param {string} id */
export const serverKey = (env, id) => { const v = env[PROVIDERS[id].secret]; return typeof v === "string" ? v.trim() : ""; };

/** Effective key per provider: panel first, then the Worker secret. For the gateway only. */
export async function resolveKeys(env, panel = null) {
  const p = panel || (await readPanelKeys(env));
  /** @type {Record<string, string>} */
  const out = {};
  for (const id of PROVIDER_IDS) { const k = p[id] || serverKey(env, id); if (k) out[id] = k; }
  return out;
}

/** Admin view: never a key. @returns {Promise<any[]>} */
export async function listKeys(env) {
  let rows = [];
  try { rows = await keyRows(env.DB); } catch { rows = []; }
  let kek = null;
  try { kek = await importKek(env.SECRETS_KEK); } catch { kek = null; }
  const by = Object.fromEntries(rows.map(r => [r.provider, r]));
  const out = [];
  for (const id of PROVIDER_IDS) {
    const r = by[id];
    const readable = !!(r && kek && (await open(kek, id, r.key_enc)));
    const server = !!serverKey(env, id);
    out.push({
      provider: id, panel_set: !!r, server_set: server, unreadable: !!r && !readable,
      source: readable ? "panel" : server ? "server" : "none",
      last4: r ? String(r.last4) : null, set_at: r ? Number(r.set_at) : null,
      checked_at: r && r.checked_at != null ? Number(r.checked_at) : null, check_ok: r && r.check_ok != null ? r.check_ok === 1 : null,
      testable: PANEL_TESTABLE.includes(id)
    });
  }
  return out;
}

/** 503 keys_unavailable when the key table is missing (migration 0012 not applied). */
export async function assertTable(env) {
  try { await keyRows(env.DB); } catch { throw new HttpError(503, "keys cannot be stored on this server yet", { code: "keys_unavailable" }); }
}

/** Stores (or replaces) a provider key. Returns {last4, previous_last4}. Re-auth is done by the caller. */
export async function setKey(env, id, key) {
  assertProvider(id);
  const k = checkShape(id, key);
  const kek = await kekOrFail(env);
  const sealed = await seal(kek, id, k);
  if ((await open(kek, id, sealed)) !== k) throw new HttpError(500, "could not store the key", { code: "store_failed" });
  const last4 = k.slice(-4);
  const previous = await putKeyRow(env.DB, id, sealed, last4, now());
  return { last4, previous_last4: previous };
}

/** Removes a provider key set in the panel. Returns its last 4 (null when none was set). */
export async function removeKey(env, id) {
  assertProvider(id);
  return deleteKeyRow(env.DB, id);
}

/**
 * Tests the key the gateway would use (panel first, then the Worker secret) with one billing-free request.
 * @returns {Promise<{provider: string, status: "OK"|"FAIL"|"SKIP"|"NOT_TESTED", checked_at: number}>}
 */
export async function testKey(env, id, fetchImpl, beforeSend = async (/** @type {string} */ _last4) => {}) {
  assertProvider(id);
  const t = now();
  if (!PANEL_TESTABLE.includes(id)) return { provider: id, status: "NOT_TESTED", checked_at: t };
  const keys = await resolveKeys(env);
  if (!keys[id]) return { provider: id, status: "SKIP", checked_at: t };
  await beforeSend(keys[id].slice(-4)); // rate limit (throws 429) — only when a request would really be sent
  const vars = checkVars(env, id, keys[id]);
  const row = (await checkKeys(vars, fetchImpl || fetch)).find(r => r.provider === id);
  const status = row && row.status === "OK" ? "OK" : "FAIL";
  try { await noteKeyCheck(env.DB, id, status === "OK", t); } catch { /* no panel row: Worker secret tested */ }
  return { provider: id, status, checked_at: t };
}
