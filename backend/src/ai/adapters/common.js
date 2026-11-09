// @ts-check
// backend/src/ai/adapters/common.js — shared plain-fetch helpers for the P6 REST adapters (round 17 P6).
//
// No provider SDK: every adapter sends one POST with fetch, the key in a header only, and the gateway's AbortSignal.
// Results follow the gateway taxonomy (docs/AI-GATEWAY.md §3, §4): {ok:true, json, model, usage, providerRequestId?}
// or {ok:false, kind, httpStatus?, retryAfterMs?, usage?, providerRequestId?, unexpected?}. Nothing here ever puts a
// key, a prompt or a response text into a result, an error or a log line.

/** @typedef {{inputTokens: number, outputTokens: number, reasoningTokens?: number, cachedInputTokens?: number, reportedCostMicros?: number}} Usage */

/** Retry-After header (seconds or HTTP date) -> ms. @param {any} headers */
export function retryAfterMs(headers) {
  const v = headers && typeof headers.get === "function" ? headers.get("retry-after") : null;
  if (v == null || v === "") return undefined;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return Math.round(n * 1000);
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : undefined;
}

/** HTTP status -> default kind (adapters refine provider-specific bodies first). @param {number} s */
export function kindOfStatus(s) {
  if (s === 429) return "rate_limited";
  if (s === 503 || s === 529) return "overloaded";
  if (s === 408 || s === 504) return "timeout";
  if (s >= 500) return "server_error";
  if (s === 401 || s === 403) return "auth";
  if (s === 402) return "auth"; // out of credit / balance: a configuration problem for the owner, never "retry later"
  if (s === 400 || s === 404 || s === 409 || s === 413 || s === 422) return "bad_request";
  return "server_error";
}

/** A rejected fetch -> timeout (aborted at the gateway deadline) or connection. @param {any} e */
export function fetchFailure(e) {
  const name = e && e.name;
  if (name === "AbortError" || name === "TimeoutError") return { ok: false, kind: "timeout" };
  return { ok: false, kind: "connection" };
}

const RID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,63}$/;
/** Key-shaped values (review fix P6-1): provider key prefixes, never accepted as an id or a model name. */
const KEYISH_RE = /^(?:sk-|sk_|AIza|Bearer\b)/i;

/** True when `v` is a string that is not, does not contain and does not look like a key. @param {any} v @param {any} key */
export function notKey(v, key) {
  if (typeof v !== "string" || !v) return false;
  if (KEYISH_RE.test(v)) return false;
  const k = typeof key === "string" ? key.trim() : "";
  if (k && (v.includes(k) || (k.length >= 8 && v.includes(k.slice(0, 8))))) return false;
  return true;
}

/** Provider request id (for support tickets): only a short id-shaped value that is not, and does not contain, the key.
 *  @param {string|undefined} key @param {...any} vals */
export function requestId(key, ...vals) {
  for (const v of vals) if (v != null && RID_RE.test(String(v)) && notKey(String(v), key)) return String(v);
  return undefined;
}

/** Served model name from a response: strict pattern, <= 64 characters, never key-shaped; else the requested model.
 *  @param {any} served @param {string} requested @param {string|undefined} key */
export function servedModel(served, requested, key) {
  return typeof served === "string" && MODEL_ID_RE.test(served) && notKey(served, key) ? served : requested;
}

/**
 * POST JSON with the gateway's signal. Never throws.
 * @param {typeof fetch} fetchImpl @param {string} url @param {Record<string, string>} headers @param {any} body
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ok: true, status: number, data: any, headers: any} | {ok: false, failure: any}>}
 */
export async function postJson(fetchImpl, url, headers, body, signal) {
  let res;
  try {
    /** @type {RequestInit} */
    const init = { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), redirect: "manual" };
    if (signal) init.signal = signal;
    res = await (fetchImpl || globalThis.fetch)(url, init);
  } catch (e) {
    return { ok: false, failure: fetchFailure(e) };
  }
  let data = null;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  return { ok: true, status: res.status, data, headers: res.headers };
}

/** Model text -> JSON. Tolerates a ```json fence (JSON-object providers sometimes add one). @param {any} text */
export function parseJsonText(text) {
  if (typeof text !== "string") return { ok: false };
  let t = text.trim();
  if (!t) return { ok: false };
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(t);
  if (fence) t = fence[1].trim();
  try { return { ok: true, json: JSON.parse(t) }; } catch { return { ok: false }; }
}

/** JSON Schema keywords kept for providers with a strict structured-output mode; the rest (e.g. maxLength) are dropped
 *  from what is SENT — the gateway still validates the full schema on every answer. */
const STRICT_KEYS = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "const", "description", "anyOf",
  "minimum", "maximum", "minItems", "maxItems", "format", "title"]);
/** @param {any} schema @returns {any} */
export function strictSchema(schema) {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== "object") return schema;
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!STRICT_KEYS.has(k)) continue;
    if (k === "properties") out[k] = Object.fromEntries(Object.entries(v || {}).map(([p, s]) => [p, strictSchema(s)]));
    else if (k === "items" || k === "anyOf") out[k] = strictSchema(v);
    else out[k] = v;
  }
  return out;
}

/** Schema name accepted by every json_schema provider. @param {any} name */
export const schemaName = name => (String(name || "answer").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "answer");

/** System text for JSON-object providers (no schema enforcement): the word JSON + the schema to follow. @param {string} system @param {any} schema */
export const jsonInstruction = (system, schema) =>
  `${system}\n\nAnswer with ONE JSON object only (no prose, no code fence). It must match this JSON Schema exactly:\n${JSON.stringify(schema)}`;

/** Non-negative finite number or 0. @param {any} v */
export const num = v => (Number.isFinite(v) && v > 0 ? v : 0);

/** Effort (settings.js EFFORTS) -> low | medium | high. @param {any} e */
export const effort3 = e => (e === "low" ? "low" : e === "medium" ? "medium" : e ? "high" : null);
