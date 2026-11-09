// @ts-check
// backend/src/ai/adapters/oaicompat.js — one adapter shape for the providers that speak the OpenAI "chat completions"
// REST format (round 17 P6): OpenAI, Alibaba Model Studio (Qwen), DeepSeek, z.ai, Moonshot Kimi, OpenRouter.
// Each provider file gives its endpoint, JSON mode, token-limit field, vision models, error refinements and extras;
// this file builds the body, sends it with plain fetch (common.js postJson) and maps the answer to the gateway taxonomy:
//   HTTP error -> provider refinement (billing -> auth, input content filter -> content_policy_input, ...) or the common
//   status table (common.js kindOfStatus); a 200 body with an `error` object (OpenRouter) is handled the same way;
//   message.refusal or finish_reason "content_filter" / "sensitive" -> refusal; "length" -> truncated;
//   no text / not JSON -> invalid_json (usage kept: the call was billed).
// Usage: completion_tokens already INCLUDE reasoning tokens, so outputTokens = completion - reasoning (never counted twice).
import { jsonInstruction, kindOfStatus, num, parseJsonText, postJson, requestId, retryAfterMs, schemaName, servedModel, strictSchema } from "./common.js";

/**
 * @typedef {{
 *   id: string,
 *   region: string,
 *   endpoint: (ctx: any) => string|null,
 *   jsonMode: (req: any, entry: any) => "json_schema"|"json_object"|"prompt",
 *   tokenParam?: "max_tokens"|"max_completion_tokens",
 *   vision: (model: string) => boolean,
 *   extra?: (body: Record<string, any>, req: any, entry: any, ctx: any) => void,
 *   errorKind?: (status: number, data: any) => string|null,
 *   readExtra?: (data: any, usage: any, key?: string) => Record<string, any>,
 *   refusalFinish?: string[],
 *   imageTokens?: (model: string) => number
 * }} OaiConfig
 */

/** Chat message content: images first (data URLs), then the text. @param {any} req */
function userContent(req) {
  if (!req.images || !req.images.length) return req.text;
  return [...req.images.map(i => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.base64}` } })), { type: "text", text: req.text }];
}

/** @param {OaiConfig} cfg @param {any} req @param {any} entry @param {any} ctx */
export function buildBody(cfg, req, entry, ctx = {}) {
  const mode = cfg.jsonMode(req, entry);
  const schema = req.output && req.output.schema;
  const system = mode === "json_schema" ? req.system : jsonInstruction(req.system, schema);
  /** @type {Record<string, any>} */
  const body = {
    model: entry.model,
    messages: [{ role: "system", content: system }, { role: "user", content: userContent(req) }],
    [cfg.tokenParam || "max_tokens"]: req.maxOutputTokens
  };
  if (mode === "json_schema") body.response_format = { type: "json_schema", json_schema: { name: schemaName(req.output.name), strict: true, schema: strictSchema(schema) } };
  else if (mode === "json_object") body.response_format = { type: "json_object" };
  if (cfg.extra) cfg.extra(body, req, entry, ctx);
  return body;
}

/** @param {any} u */
function usageOf(u) {
  u = u || {};
  const completion = num(u.completion_tokens);
  const reasoning = Math.min(completion, num(u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens));
  return {
    inputTokens: num(u.prompt_tokens),
    outputTokens: completion - reasoning,
    reasoningTokens: reasoning,
    cachedInputTokens: num(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || num(u.prompt_cache_hit_tokens)
  };
}

/** Text of the first choice (string, or an array of text parts). @param {any} msg */
function textOf(msg) {
  if (!msg) return "";
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) return msg.content.map(p => (p && typeof p.text === "string" ? p.text : "")).join("");
  return "";
}

/** Provider response -> gateway result. The key is only used to make sure no id or model name echoes it.
 * @param {OaiConfig} cfg @param {{status: number, data: any, headers: any}} r @param {string} model @param {string} [key] */
export function parseResponse(cfg, r, model, key) {
  const data = r.data;
  const rid = requestId(key, data && data.id, data && data.request_id, r.headers && typeof r.headers.get === "function" ? r.headers.get("x-request-id") : null);
  const errorOut = (status, httpStatus) => {
    const kind = (cfg.errorKind && cfg.errorKind(status, data)) || kindOfStatus(status);
    const out = { ok: false, kind, httpStatus, providerRequestId: rid };
    if (kind === "rate_limited" || kind === "overloaded") { const ra = retryAfterMs(r.headers); if (ra != null) out.retryAfterMs = ra; }
    return out;
  };
  if (r.status < 200 || r.status >= 300) return errorOut(r.status, r.status);
  if (!data || typeof data !== "object") return { ok: false, kind: "invalid_json", httpStatus: r.status, providerRequestId: rid };
  if (data.error && !data.choices) return errorOut(Number(data.error.code) || 500, r.status);
  const usage = usageOf(data.usage);
  const extra = cfg.readExtra ? cfg.readExtra(data, usage, key) : {};
  const fail = kind => ({ ok: false, kind, usage, providerRequestId: rid, ...extra });
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  if (!choice) return fail("invalid_json");
  const finish = String(choice.finish_reason || "");
  if (choice.message && choice.message.refusal) return fail("refusal");
  if ((cfg.refusalFinish || ["content_filter", "sensitive"]).includes(finish)) return fail("refusal");
  if (finish === "length") return fail("truncated");
  const p = parseJsonText(textOf(choice.message));
  if (!p.ok) return fail("invalid_json");
  return { ok: true, json: p.json, model: servedModel(data.model, model, key), usage, providerRequestId: rid, ...extra };
}

/** @param {OaiConfig} cfg */
export function makeAdapter(cfg) {
  return {
    id: cfg.id,
    /** @param {string} model */
    capabilities: model => ({ vision: cfg.vision(model), jsonSchema: cfg.jsonMode({}, { model }) === "json_schema" ? "native" : "json_mode" }),
    region: () => cfg.region,
    /** @param {any} req @param {any} entry @param {any} [ctx] */
    buildBody: (req, entry, ctx) => buildBody(cfg, req, entry, ctx),
    /** What the gateway's budget estimate must add for this provider (review fix P6-7): the JSON instruction + schema
     *  text appended to the system prompt in json_object / prompt mode, and a provider-specific per-image token count.
     *  @param {any} req @param {{model: string}} entry @returns {{extraSystem: string, imageTokens?: number}} */
    estimateHints: (req, entry) => {
      const mode = cfg.jsonMode(req || {}, entry);
      const extraSystem = mode === "json_schema" ? "" : jsonInstruction("", req && req.output ? req.output.schema : {});
      const imageTokens = cfg.imageTokens ? cfg.imageTokens(entry.model) : undefined;
      return imageTokens ? { extraSystem, imageTokens } : { extraSystem };
    },
    /**
     * @param {any} req provider-neutral request
     * @param {{model: string, effort?: string|null}} entry
     * @param {{key: string, timeoutMs: number, fetchImpl?: typeof fetch, signal?: AbortSignal, config?: any, pin?: boolean}} ctx
     */
    async call(req, entry, ctx) {
      if (req.images && req.images.length && !cfg.vision(entry.model)) return { ok: false, kind: "unsupported" };
      const url = cfg.endpoint(ctx);
      if (!url) return { ok: false, kind: "unsupported" }; // missing provider config (e.g. DashScope workspace id)
      const r = await postJson(ctx.fetchImpl, url, { Authorization: "Bearer " + ctx.key }, buildBody(cfg, req, entry, ctx), ctx.signal);
      if ("failure" in r) return r.failure;
      try { return parseResponse(cfg, r, entry.model, ctx.key); } catch { return { ok: false, kind: "server_error", unexpected: true }; }
    }
  };
}
