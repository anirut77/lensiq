// @ts-check
// backend/src/ai/adapters/anthropic.js — Anthropic adapter (moved out of fortune.js in round 17 P5, same behaviour).
//
// The official SDK (@anthropic-ai/sdk, bundled by wrangler from backend/node_modules) exactly as fortune used it:
//   new Anthropic({apiKey, timeout, maxRetries: 1}).beta.messages.create({
//     model, max_tokens, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
//     system: [{type: "text", text, cache_control: {type: "ephemeral"}}],
//     output_config: {effort, format: {type: "json_schema", schema}}, messages: [{role: "user", content}]})
// Sampling parameters (temperature / top_p / top_k / thinking) are never sent: current Claude models reject them; depth
// is controlled with output_config.effort. stop_reason is checked before the content is read:
//   refusal -> kind "refusal"; max_tokens -> "truncated"; no text / not JSON -> "invalid_json".
// SDK errors (typed classes, most specific first) map to the gateway taxonomy (docs/AI-GATEWAY.md):
//   RateLimitError -> rate_limited; APIConnectionTimeoutError -> timeout; APIConnectionError -> connection;
//   APIError by HTTP status (529/503 overloaded, 5xx server_error, 401/403 auth, 400/404/413/422 bad_request);
//   anything else -> server_error with unexpected:true (fortune keeps answering 500 for it, as before).
// The key is passed only to the SDK constructor; it never appears in the request body, a log line or a result.

export const ID = "anthropic";
export const BETAS = ["server-side-fallback-2026-07-01"];

/** Default SDK loader. Tests inject a fake through deps.loadSdk. */
export async function defaultSdk() {
  const mod = await import("@anthropic-ai/sdk");
  return mod.default;
}

/** Provider request body from the provider-neutral gateway request.
 * @param {{system: string, text: string, images?: {mime: string, base64: string}[], output: {schema: object}, maxOutputTokens: number}} req
 * @param {{model: string, effort?: string|null}} entry
 * @param {{pin?: boolean}} [o] pin: no server-side fallback (the served model is the requested model). The gateway pins
 *   whenever a monthly budget cap applies, so the reserved price is the price billed; fortune (no cap) keeps the
 *   server-side fallback exactly as before. */
export function buildBody(req, entry, o = {}) {
  const content = req.images && req.images.length
    ? [...req.images.map(i => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.base64 } })), { type: "text", text: req.text }]
    : req.text;
  const format = { type: "json_schema", schema: req.output.schema };
  /** @type {Record<string, any>} */
  const fallback = o.pin ? {} : { betas: BETAS, fallbacks: "default" };
  return {
    model: entry.model,
    max_tokens: req.maxOutputTokens,
    ...fallback,
    system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
    output_config: entry.effort ? { effort: entry.effort, format } : { format },
    messages: [{ role: "user", content }]
  };
}

const header = (h, name) => {
  if (!h) return null;
  if (typeof h.get === "function") return h.get(name);
  return h[name] ?? h[name.toLowerCase()] ?? null;
};

/** SDK error -> gateway failure. @param {any} err @param {any} Anthropic */
export function classify(err, Anthropic) {
  const rid = (err && (err.requestID || err.request_id)) || undefined;
  const base = { ok: false, providerRequestId: rid ? String(rid).slice(0, 80) : undefined };
  if (Anthropic && Anthropic.RateLimitError && err instanceof Anthropic.RateLimitError) {
    const ra = Number(header(err.headers, "retry-after"));
    return { ...base, kind: "rate_limited", httpStatus: 429, retryAfterMs: Number.isFinite(ra) && ra >= 0 ? ra * 1000 : undefined };
  }
  if (Anthropic && Anthropic.APIConnectionTimeoutError && err instanceof Anthropic.APIConnectionTimeoutError) return { ...base, kind: "timeout" };
  if (Anthropic && Anthropic.APIConnectionError && err instanceof Anthropic.APIConnectionError) return { ...base, kind: "connection" };
  if (Anthropic && Anthropic.APIError && err instanceof Anthropic.APIError) {
    const s = Number(err.status) || 0;
    const kind = s === 529 || s === 503 ? "overloaded" : s === 429 ? "rate_limited" : s >= 500 ? "server_error"
      : s === 401 || s === 403 ? "auth" : s === 400 || s === 404 || s === 413 || s === 422 ? "bad_request" : "server_error";
    return { ...base, kind, httpStatus: s || undefined };
  }
  return { ...base, kind: "server_error", unexpected: true };
}

/** Response -> success / failure. Checks stop_reason before reading content. @param {any} resp @param {string} model */
export function parse(resp, model) {
  const rid = resp && (resp._request_id || resp.id);
  const providerRequestId = rid ? String(rid).slice(0, 80) : undefined;
  const u = (resp && resp.usage) || {};
  const num = v => (Number.isFinite(v) ? v : 0);
  const usage = {
    inputTokens: num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens),
    outputTokens: num(u.output_tokens),
    cacheWriteTokens: num(u.cache_creation_input_tokens),
    cachedInputTokens: num(u.cache_read_input_tokens)
  };
  const fail = kind => ({ ok: false, kind, usage, providerRequestId });
  if (!resp) return fail("invalid_json");
  if (resp.stop_reason === "refusal") return fail("refusal");
  if (resp.stop_reason === "max_tokens") return fail("truncated");
  const block = (resp.content || []).find(b => b && b.type === "text");
  if (!block || !block.text) return fail("invalid_json");
  let json;
  try { json = JSON.parse(block.text); } catch { return fail("invalid_json"); }
  return { ok: true, json, model: String(resp.model || model), usage, providerRequestId };
}

export const adapter = {
  id: ID,
  /** @param {string} _model */
  capabilities: _model => ({ vision: true, jsonSchema: "native" }),
  region: () => "global",
  buildBody,
  /**
   * @param {any} req provider-neutral request (docs/AI-GATEWAY.md)
   * @param {{model: string, effort?: string|null}} entry
   * @param {{key: string, timeoutMs: number, loadSdk?: () => Promise<any>, signal?: AbortSignal, sdkRetries?: number, pin?: boolean}} ctx
   *   sdkRetries: 0 by default (the gateway owns retries); fortune_reword passes 1, its behaviour before the gateway.
   *   signal: aborted by the gateway at the attempt deadline.
   */
  async call(req, entry, ctx) {
    let Anthropic;
    try {
      Anthropic = await (ctx.loadSdk || defaultSdk)();
      const client = new Anthropic({ apiKey: ctx.key, timeout: ctx.timeoutMs, maxRetries: ctx.sdkRetries ?? 0 });
      const resp = await client.beta.messages.create(buildBody(req, entry, { pin: !!ctx.pin }), ctx.signal ? { signal: ctx.signal } : undefined);
      return parse(resp, entry.model);
    } catch (e) {
      return classify(e, Anthropic);
    }
  }
};
