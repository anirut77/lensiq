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

// ---- pinned routes (deploy B6: the consent screen names the real processor BEFORE the call) -------------------------
// Applied only when the Worker var AI_ROUTE_PIN = "required" (adapters/index.js providerConfig -> ctx.config.pinRoutes;
// the test deployment sets it). Then, for a model listed here, the request carries provider.only = [slug] and
// allow_fallbacks = false (set last, with zdr / data_collection), so the router may use that serving provider only, and
// an answer that names another serving provider (or none) is rejected (routeMismatch; the gateway alerts the owner).
// Source of the pins (read 2026-11-10): https://openrouter.ai/api/v1/endpoints/zdr lists, for the Claude models, ZDR
// endpoints google-vertex/global|us|europe (and amazon-bedrock, without structured outputs: P8-RESULTS section 2) and,
// for the GPT models, azure, azure/us, azure/eu only. A base slug matches every region variant of that provider
// (https://openrouter.ai/docs/features/provider-routing), so the country is NOT fixed: the texts say so.
// UNVERIFIED wording: the exact region list can change at the router. Served names accepted: exactly what the P8 runs
// recorded in real answers, "Google Vertex" and "Azure". The endpoints API labels the Vertex endpoints "Google", a name
// Google's other API could also carry, so plain "Google" is NOT accepted: if real answers say "Google", the first call
// fails closed with a route_mismatch alert (the chain moves on) and the pin is corrected deliberately.
// With pinning on, a model that has NO pin is refused (usable() below): nothing is sent to a serving provider the
// consent screen could not name.
const VERTEX = Object.freeze({
  slug: "google-vertex", served: /^google\s+vertex(\s+ai)?$/i,
  name: { th: "Google Cloud Vertex AI (ผู้ให้บริการที่รันโมเดล)", en: "Google Cloud Vertex AI (serves the model)", zh: "Google Cloud Vertex AI（实际运行模型）" },
  region: {
    th: "ศูนย์ข้อมูลของ Google Cloud นอกประเทศไทย (ทั่วโลก สหรัฐฯ หรือยุโรป ไม่กำหนดประเทศ)",
    en: "Google Cloud data centres outside Thailand (global, US or Europe; country not fixed)",
    zh: "泰国境外的 Google Cloud 数据中心（全球、美国或欧洲，国家不固定）"
  }
});
const AZURE = Object.freeze({
  slug: "azure", served: /^(microsoft\s+)?azure(\s+openai)?$/i,
  name: { th: "Microsoft Azure (ผู้ให้บริการที่รันโมเดล)", en: "Microsoft Azure (serves the model)", zh: "Microsoft Azure（实际运行模型）" },
  region: {
    th: "ศูนย์ข้อมูลของ Microsoft Azure นอกประเทศไทย (ทั่วโลก สหรัฐฯ หรือยุโรป ไม่กำหนดประเทศ)",
    en: "Microsoft Azure data centres outside Thailand (global, US or Europe; country not fixed)",
    zh: "泰国境外的 Microsoft Azure 数据中心（全球、美国或欧洲，国家不固定）"
  }
});
/** model -> pinned serving provider. Models not listed stay unpinned ("routed provider varies", as before). */
export const ROUTES = Object.freeze({
  "anthropic/claude-haiku-5.5": VERTEX, "anthropic/claude-sonnet-5.5": VERTEX,
  "openai/gpt-6-luna": AZURE, "openai/gpt-6.1-terra": AZURE
});
/** @param {any} config ctx.config / providerConfig(env, "openrouter") */
const pinOn = config => !!(config && config.pinRoutes === true);
/** The pin of a model while pinning is on, else null. @param {string} model @param {any} config */
const pinOf = (model, config) => (pinOn(config) && Object.hasOwn(ROUTES, model) ? /** @type {Record<string, any>} */ (ROUTES)[model] : null);

const base = makeAdapter({
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
    const pin = pinOf(entry.model, ctx && ctx.config);
    if (pin) { body.provider.only = [pin.slug]; body.provider.allow_fallbacks = false; }
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

export const adapter = {
  ...base,
  /** Public view of the pinned serving provider (consent screen), or null. @param {string} model @param {any} [config] */
  route: (model, config) => { const p = pinOf(model, config); return p ? { slug: p.slug, name: p.name, region: p.region } : null; },
  /** May this model be used at all? With pinning on, only models that have a pin. @param {string} model @param {any} [config] */
  usable: (model, config) => !pinOn(config) || Object.hasOwn(ROUTES, model),
  /** The models usable in this deployment while pinning is on (admin page), else null. @param {any} [config] */
  pinnedModels: config => (pinOn(config) ? Object.keys(ROUTES) : null),
  /** @param {any} req @param {{model: string, effort?: string|null}} entry @param {any} ctx */
  async call(req, entry, ctx) {
    if (pinOn(ctx && ctx.config) && !Object.hasOwn(ROUTES, entry.model)) return { ok: false, kind: "unsupported" }; // no pin: never sent
    const r = await base.call(req, entry, ctx);
    const pin = pinOf(entry.model, ctx && ctx.config);
    if (pin && r && r.ok && !(typeof r.routedProvider === "string" && pin.served.test(r.routedProvider))) {
      // served by a provider the user was not shown: the answer is not used ("refusal": billed, next chain entry)
      return { ok: false, kind: "refusal", routeMismatch: true, usage: r.usage, model: r.model, providerRequestId: r.providerRequestId, routedProvider: r.routedProvider };
    }
    return r;
  }
};
