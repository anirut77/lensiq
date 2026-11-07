// backend/src/settings.js — AI writing-assistant settings + API key storage.
//
// API key, in order of preference:
//   1. Worker secret ANTHROPIC_API_KEY  (`wrangler secret put ANTHROPIC_API_KEY`) — recommended
//   2. set from the admin UI: AES-GCM encrypted at rest with the KEK Worker secret SECRETS_KEK (AAD = slot name)
// The key is never returned to the browser, never logged and never written to the audit log.
import { FORTUNE_DOMAINS } from "./constants.js";
import { decryptString, encryptString, importKek } from "./crypto.js";
import { getSetting, putSetting } from "./store.js";
import { HttpError, now } from "./util.js";

export const PROVIDERS = ["anthropic"];
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
export const DEFAULT_AI = Object.freeze({
  provider: "anthropic",
  model: "claude-opus-5-5",
  effort: "medium",
  max_tokens: 16000,
  // Stored for reference only — NOT sent: Claude Opus 5.5 (and every model from API version 2026-10-21) rejects
  // temperature/top_p/top_k with a 400. Use `effort` to trade depth for cost.
  temperature: null,
  enabled: true,
  domains: Object.fromEntries(FORTUNE_DOMAINS.map(d => [d, true])),
  rpm: 10,
  daily_max: 500
});

export async function getAiSettings(db) {
  const s = await getSetting(db, "ai", {});
  return { ...DEFAULT_AI, ...s, domains: { ...DEFAULT_AI.domains, ...(s.domains || {}) } };
}

const intIn = (v, min, max, field) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new HttpError(400, `${field} must be an integer ${min}–${max}`);
  return v;
};

/** Validates a partial update; unknown keys are refused. */
export function validateAi(input, current = DEFAULT_AI) {
  if (!input || typeof input !== "object") throw new HttpError(400, "settings must be an object");
  const out = { ...current, domains: { ...current.domains } };
  for (const [k, v] of Object.entries(input)) {
    switch (k) {
      case "provider": if (!PROVIDERS.includes(v)) throw new HttpError(400, "unsupported provider"); out.provider = v; break;
      case "model": if (typeof v !== "string" || !/^claude-[a-z0-9-]{2,60}$/.test(v)) throw new HttpError(400, "model must be a Claude model id (claude-…)"); out.model = v; break;
      case "effort": if (!EFFORTS.includes(v)) throw new HttpError(400, "effort must be one of " + EFFORTS.join(", ")); out.effort = v; break;
      case "max_tokens": out.max_tokens = intIn(v, 1024, 64000, "max_tokens"); break;
      case "temperature": if (v !== null && !(typeof v === "number" && v >= 0 && v <= 1)) throw new HttpError(400, "temperature must be null or 0–1"); out.temperature = v; break;
      case "enabled": if (typeof v !== "boolean") throw new HttpError(400, "enabled must be boolean"); out.enabled = v; break;
      case "rpm": out.rpm = intIn(v, 1, 120, "rpm"); break;
      case "daily_max": out.daily_max = intIn(v, 1, 100000, "daily_max"); break;
      case "domains":
        if (!v || typeof v !== "object") throw new HttpError(400, "domains must be an object");
        for (const [d, on] of Object.entries(v)) {
          if (!FORTUNE_DOMAINS.includes(d)) throw new HttpError(400, `unknown domain ${String(d).slice(0, 20)}`);
          if (typeof on !== "boolean") throw new HttpError(400, "domain flags must be boolean");
          out.domains[d] = on;
        }
        break;
      default: throw new HttpError(400, `unknown setting ${String(k).slice(0, 32)}`);
    }
  }
  return out;
}

export async function putAiSettings(db, input) {
  const next = validateAi(input, await getAiSettings(db));
  await putSetting(db, "ai", next);
  return next;
}

const KEY_SLOT = "anthropic_api_key";
const KEY_RE = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

export async function getApiKey(env) {
  if (env.ANTHROPIC_API_KEY) return env.ANTHROPIC_API_KEY;
  const row = await env.DB.prepare("SELECT iv, ciphertext, kek_id FROM secrets WHERE name = ?1").bind(KEY_SLOT).first();
  if (!row) return null;
  let kek;
  try { kek = await importKek(env.SECRETS_KEK); } catch { return null; }
  if (!kek || kek.id !== row.kek_id) return null;
  try { return await decryptString(kek, { iv: row.iv, ct: row.ciphertext }, KEY_SLOT); } catch { return null; }
}

/** What the admin UI may know about the key: where it comes from — never the key, nor any part of it. */
export async function apiKeyStatus(env) {
  const row = await env.DB.prepare("SELECT kek_id, updated_at FROM secrets WHERE name = ?1").bind(KEY_SLOT).first();
  let kek = null, kekError = null;
  try { kek = await importKek(env.SECRETS_KEK); } catch (e) { kekError = e.message; }
  return {
    source: env.ANTHROPIC_API_KEY ? "worker_secret" : row ? "admin_encrypted" : "none",
    worker_secret: !!env.ANTHROPIC_API_KEY,
    stored_encrypted: !!row,
    stored_updated_at: row ? row.updated_at : null,
    stored_readable: !!(row && kek && kek.id === row.kek_id),
    kek_configured: !!kek,
    kek_error: kekError
  };
}

export async function setApiKey(env, key) {
  if (typeof key !== "string" || !KEY_RE.test(key.trim())) throw new HttpError(400, "not an Anthropic API key (sk-ant-…)");
  let kek;
  try { kek = await importKek(env.SECRETS_KEK); } catch (e) { throw new HttpError(503, e.message); }
  if (!kek) throw new HttpError(503, "SECRETS_KEK is not set — prefer `wrangler secret put ANTHROPIC_API_KEY`");
  const e = await encryptString(kek, key.trim(), KEY_SLOT);
  await env.DB.prepare("INSERT INTO secrets (name, iv, ciphertext, kek_id, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) " +
    "ON CONFLICT (name) DO UPDATE SET iv = excluded.iv, ciphertext = excluded.ciphertext, kek_id = excluded.kek_id, updated_at = excluded.updated_at")
    .bind(KEY_SLOT, e.iv, e.ct, e.kek_id, now()).run();
}

export async function deleteApiKey(env) {
  await env.DB.prepare("DELETE FROM secrets WHERE name = ?1").bind(KEY_SLOT).run();
}

export const DEFAULT_BILLING_SETTINGS = Object.freeze({ pricing_page_enabled: false });
export async function getBillingSettings(db) { return { ...DEFAULT_BILLING_SETTINGS, ...(await getSetting(db, "billing", {})) }; }
export async function putBillingSettings(db, input) {
  const cur = await getBillingSettings(db);
  for (const [k, v] of Object.entries(input || {})) {
    if (k !== "pricing_page_enabled" || typeof v !== "boolean") throw new HttpError(400, `invalid billing setting ${String(k).slice(0, 32)}`);
    cur[k] = v;
  }
  await putSetting(db, "billing", cur);
  return cur;
}
