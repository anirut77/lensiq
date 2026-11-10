// @ts-check
// backend/src/ai/adapters/openrouter.js — OpenRouter (round 17 P6), plain fetch, no SDK.
//   POST https://openrouter.ai/api/v1/chat/completions   Authorization: Bearer <OPENROUTER_API_KEY>
//   FORCED on every call (legal item L8), set last so nothing in a request can override it:
//     provider: {data_collection: "deny", zdr: true, require_parameters: true, max_price: {prompt, completion}}
//   data_collection "deny" = only providers that do not collect user data; zdr = Zero Data Retention endpoints only;
//   require_parameters = only providers that honour every parameter (the json_schema response format); max_price (USD
//   per 1M tokens) is a hard ceiling: the request does not run when no provider is at or below it, so routing cannot
//   pick a provider dearer than the price the gateway reserved for (prices.js: OpenRouter rows are priced at the
//   conservative ceiling).
//   The response's `model` is the served model and `provider` the routed provider (result card: "OpenRouter, routed to
//   <provider>"); usage.cost (credits = USD) is passed on as reportedCostMicros and the gateway settles with
//   max(price-table cost, reported cost) under the P5 cap + cost_over_reservation alert.
//   Errors (https://openrouter.ai/docs/api-reference/errors): 402 no credit -> auth; 403 moderation flag ->
//   content_policy_input, 403 key / credit limit (or any other 403) -> auth + owner alert (kindOf403 below); 408 -> timeout; 502 -> server_error; 503 (no provider meets the routing requirements) ->
//   overloaded; errors during generation can come with HTTP 200 and an `error` object (handled the same way).
//   Docs read 2026-11-10: https://openrouter.ai/docs/features/provider-routing , https://openrouter.ai/docs/api-reference/overview ,
//   https://openrouter.ai/docs/guides/privacy/data-collection (OpenRouter stores request metadata, not prompts, by default).
import { effort3, notKey } from "./common.js";
import { makeAdapter } from "./oaicompat.js";
import { ROUTER_CAPS, priceAt } from "./prices.js";

export const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const NAME_RE = /[^A-Za-z0-9 ._()-]/g;

// OpenRouter uses HTTP 403 for two different things (P8 finding, 2026-11-10):
//   - a moderation flag: error.metadata.reasons (array) and / or error.metadata.flagged_input -> content_policy_input
//   - a key limit ("Key limit exceeded (total limit) …") or a credit / spending limit -> auth (configuration: the gateway
//     alerts the owner and moves to the next provider; the user is not told the input was refused)
// Only the structure and fixed patterns are tested here. The error body (it includes the key's hash and the key's
// management URL) is never copied into the result, a log line or an alert.
const LIMIT_RE = /\b(key|credit|credits|spend(?:ing)?|usage|budget)\b[^.]{0,40}\b(limit|exceeded|insufficient|exhausted)\b|\b(limit|insufficient)\b[^.]{0,20}\b(key|credit|credits)\b/i;
const MODERATION_RE = /\b(flagged|moderation|moderated)\b/i;
/** @param {any} data parsed error body (never returned) @returns {"auth"|"content_policy_input"} */
export function kindOf403(data) {
  const err = data && typeof data === "object" && data.error && typeof data.error === "object" ? data.error : {};
  const msg = typeof err.message === "string" ? err.message.slice(0, 500) : "";
  const meta = err.metadata && typeof err.metadata === "object" ? err.metadata : {};
  if (LIMIT_RE.test(msg)) return "auth";
  if (Array.isArray(meta.reasons) || meta.flagged_input != null || MODERATION_RE.test(msg)) return "content_policy_input";
  return "auth"; // an unrecognised 403 is a configuration problem (alert), never reported to the user as a content refusal
}

export const adapter = makeAdapter({
  id: "openrouter",
  region: "routed",
  endpoint: () => ENDPOINT,
  jsonMode: () => "json_schema",
  tokenParam: "max_tokens",
  // image support depends on the routed model; require_parameters and the router's own refusal cover a text-only model
  vision: () => true,
  extra: (body, req, entry, ctx) => {
    const e = effort3(entry.effort);
    if (e) body.reasoning = { effort: e };
    body.usage = { include: true };
    // the price row of the gateway's own price day (ctx.day), so max_price is exactly the price that was reserved
    const day = ctx && typeof ctx.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ctx.day) ? ctx.day : new Date().toISOString().slice(0, 10);
    const p = priceAt("openrouter", entry.model, day);
    body.provider = {
      data_collection: "deny", zdr: true, require_parameters: true,
      max_price: { prompt: p ? p.inPerM : 0, completion: p ? p.outPerM : 0, request: ROUTER_CAPS.requestUsd, image: ROUTER_CAPS.imageUsd }
    };
  },
  errorKind: (status, data) => (status === 403 ? kindOf403(data) : status === 402 ? "auth" : null),
  readExtra: (data, usage, key) => {
    /** @type {Record<string, any>} */
    const out = {};
    if (typeof data.provider === "string") {
      const name = data.provider.replace(NAME_RE, "").trim().slice(0, 40);
      if (name && notKey(name, key)) out.routedProvider = name;
    }
    const cost = data.usage && Number(data.usage.cost);
    if (Number.isFinite(cost) && cost >= 0) usage.reportedCostMicros = Math.ceil(Math.round(cost * 1e9) / 1e3);
    return out;
  }
});
