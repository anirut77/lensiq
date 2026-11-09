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
//   Errors (https://openrouter.ai/docs/api-reference/errors): 402 no credit -> auth; 403 guardrail / moderation flag ->
//   content_policy_input; 408 -> timeout; 502 -> server_error; 503 (no provider meets the routing requirements) ->
//   overloaded; errors during generation can come with HTTP 200 and an `error` object (handled the same way).
//   Docs read 2026-11-10: https://openrouter.ai/docs/features/provider-routing , https://openrouter.ai/docs/api-reference/overview ,
//   https://openrouter.ai/docs/guides/privacy/data-collection (OpenRouter stores request metadata, not prompts, by default).
import { effort3, notKey } from "./common.js";
import { makeAdapter } from "./oaicompat.js";
import { ROUTER_CAPS, priceAt } from "./prices.js";

export const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const NAME_RE = /[^A-Za-z0-9 ._()-]/g;

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
  errorKind: status => (status === 403 ? "content_policy_input" : status === 402 ? "auth" : null),
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
