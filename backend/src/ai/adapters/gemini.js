// @ts-check
// backend/src/ai/adapters/gemini.js — Google Gemini API (round 17 P6), plain fetch, no SDK.
//   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent   x-goog-api-key: <GEMINI_API_KEY>
//   Body: systemInstruction, contents [{role: "user", parts: [inlineData images..., text]}],
//   generationConfig {responseMimeType: "application/json", responseJsonSchema, maxOutputTokens, thinkingConfig?}.
//   Usage: promptTokenCount (incl. cached), candidatesTokenCount (output), thoughtsTokenCount (thinking, billed as
//   output -> reasoningTokens), cachedContentTokenCount. responseId / modelVersion -> request id / served model.
//   promptFeedback.blockReason -> content_policy_input (the same input is not shopped around); finishReason SAFETY /
//   PROHIBITED_CONTENT / BLOCKLIST / SPII / RECITATION -> refusal; MAX_TOKENS -> truncated.
//   PAID TIER ONLY (legal item L2; owner decision PC-D2 note): the Unpaid tier may use prompts to improve Google's
//   products and allows human review. There is no API to ask a key's tier, so the adapter refuses what it can see: a
//   quota error naming a FreeTier quota -> kind "auth" + freeTier:true (admin alert "ai_config_error"); the admin page
//   shows the "paid tier only" note. Terms (effective 2026-03-23): https://aistudio.google.com/docs/terms — paid: not
//   used to improve products, logged for a limited period, may be processed in any country; users 18+.
//   Docs read 2026-11-10: https://aistudio.google.com/docs/api-reference/generate-content ,
//   https://aistudio.google.com/docs/structured-output , https://aistudio.google.com/docs/pricing
import { effort3, kindOfStatus, num, parseJsonText, postJson, requestId, retryAfterMs, servedModel } from "./common.js";

export const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODEL_RE = /^[A-Za-z0-9._-]{1,80}$/;
/** Image-capable models (design §11, provider pages). */
export const VISION = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-4-argon", "gemini-3.1-flash-lite", "gemini-3-flash-preview"];
const REFUSAL = ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"];

/** @param {any} req @param {{model: string, effort?: string|null}} entry */
export function buildBody(req, entry) {
  const parts = [...(req.images || []).map(i => ({ inlineData: { mimeType: i.mime, data: i.base64 } })), { text: req.text }];
  /** @type {Record<string, any>} */
  const generationConfig = { responseMimeType: "application/json", responseJsonSchema: req.output.schema, maxOutputTokens: req.maxOutputTokens };
  const e = effort3(entry.effort);
  if (e) generationConfig.thinkingConfig = { thinkingLevel: e === "low" ? "low" : "high" };
  return { systemInstruction: { parts: [{ text: req.system }] }, contents: [{ role: "user", parts }], generationConfig };
}

/** "13s" / "1.5s" -> ms. @param {any} d */
const durMs = d => { const m = /^(\d+(?:\.\d+)?)s$/.exec(String(d || "")); return m ? Math.round(Number(m[1]) * 1000) : undefined; };

/** @param {number} status @param {any} data @param {any} headers */
function errorResult(status, data, headers) {
  const err = (data && data.error) || {};
  const details = Array.isArray(err.details) ? err.details : [];
  const gstatus = String(err.status || "");
  /** @type {Record<string, any>} */
  const out = { ok: false, kind: kindOfStatus(status), httpStatus: status };
  if (status === 429 || gstatus === "RESOURCE_EXHAUSTED") {
    const free = details.some(d => Array.isArray(d && d.violations) && d.violations.some(v => /free.?tier/i.test(String(v && v.quotaId))));
    if (free) return { ...out, kind: "auth", freeTier: true };
    out.kind = "rate_limited";
    const ri = details.find(d => d && /RetryInfo/.test(String(d["@type"])));
    const ra = (ri && durMs(ri.retryDelay)) ?? retryAfterMs(headers);
    if (ra != null) out.retryAfterMs = ra;
  } else if (gstatus === "FAILED_PRECONDITION" || gstatus === "PERMISSION_DENIED" || gstatus === "UNAUTHENTICATED") {
    out.kind = "auth"; // e.g. billing not enabled / free tier not available in the region
  } else if (gstatus === "DEADLINE_EXCEEDED") {
    out.kind = "timeout";
  } else if (gstatus === "UNAVAILABLE") {
    out.kind = "overloaded";
    const ra = retryAfterMs(headers);
    if (ra != null) out.retryAfterMs = ra;
  }
  return out;
}

/** @param {{status: number, data: any, headers: any}} r @param {string} model @param {string} [key] (never echoed) */
export function parse(r, model, key) {
  if (r.status < 200 || r.status >= 300) return errorResult(r.status, r.data, r.headers);
  const data = r.data;
  if (!data || typeof data !== "object") return { ok: false, kind: "invalid_json", httpStatus: r.status };
  const providerRequestId = requestId(key, data.responseId);
  const u = data.usageMetadata || {};
  const usage = { inputTokens: num(u.promptTokenCount), outputTokens: num(u.candidatesTokenCount), reasoningTokens: num(u.thoughtsTokenCount), cachedInputTokens: num(u.cachedContentTokenCount) };
  const fail = kind => ({ ok: false, kind, usage, providerRequestId });
  if (data.promptFeedback && data.promptFeedback.blockReason) return { ok: false, kind: "content_policy_input", usage, providerRequestId };
  const cand = Array.isArray(data.candidates) ? data.candidates[0] : null;
  if (!cand) return fail("invalid_json");
  const finish = String(cand.finishReason || "");
  if (REFUSAL.includes(finish)) return fail("refusal");
  if (finish === "MAX_TOKENS") return fail("truncated");
  const text = ((cand.content && cand.content.parts) || []).filter(p => p && typeof p.text === "string" && !p.thought).map(p => p.text).join("");
  const p = parseJsonText(text);
  if (!p.ok) return fail("invalid_json");
  return { ok: true, json: p.json, model: servedModel(data.modelVersion, model, key), usage, providerRequestId };
}

export const adapter = {
  id: "gemini",
  /** @param {string} model */
  capabilities: model => ({ vision: VISION.includes(model), jsonSchema: "native" }),
  region: () => "any",
  buildBody,
  /**
   * @param {any} req @param {{model: string, effort?: string|null}} entry
   * @param {{key: string, timeoutMs: number, fetchImpl?: typeof fetch, signal?: AbortSignal}} ctx
   */
  async call(req, entry, ctx) {
    if (!MODEL_RE.test(String(entry.model))) return { ok: false, kind: "bad_request" };
    if (req.images && req.images.length && !VISION.includes(entry.model)) return { ok: false, kind: "unsupported" };
    const r = await postJson(ctx.fetchImpl, BASE + encodeURIComponent(entry.model) + ":generateContent", { "x-goog-api-key": ctx.key }, buildBody(req, entry), ctx.signal);
    if ("failure" in r) return r.failure;
    try { return parse(r, entry.model, ctx.key); } catch { return { ok: false, kind: "server_error", unexpected: true }; }
  }
};
