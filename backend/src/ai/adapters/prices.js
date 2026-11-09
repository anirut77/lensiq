// @ts-check
// backend/src/ai/adapters/prices.js — versioned list-price table (USD per 1M tokens) with effective dates.
//
// Source: the provider's official price page per row (`source`, read on `asOf`; P6 re-read every page on 2026-11-10;
// design docs/PRODUCT-CHECK-DESIGN.md §11 read them 2026-11-09). A price change is a NEW row with a later `from` date
// (never an edit of an old row), so the cost of a past call can always be recomputed. priceAt() picks the row with the
// latest `from` <= the call's UTC day. USD per 1M tokens == micro-USD per token, so
// cost (micro-USD) = input tokens x inPerM + (output + reasoning tokens) x outPerM, rounded up.
// Reasoning tokens are billed as output by every listed provider. No caching / batch discount is applied (conservative).
// A model missing here has no known price: with a monthly budget set, the gateway cannot reserve for it and skips it
// (OpenRouter excepted: any OpenRouter model falls back to its "*" row at the conservative ceiling).

/** cacheWrite / cacheRead: multipliers of the input price for prompt-cache writes and reads (default 1 = no discount,
 *  conservative). Anthropic: writes 1.25x (5-minute cache), reads 0.1x (Opus / Sonnet 5.5 are 0.05x today; 0.1x is
 *  kept, conservative). asOf + source: the official page the price was read from. unverified: the price could not be
 *  confirmed on the provider's own page; priceAt() then returns at least the conservative CEILING for reservation AND
 *  settlement, so an unverified price can only over-count.
 *  @typedef {{provider: string, model: string, from: string, inPerM: number, outPerM: number, cacheWrite?: number, cacheRead?: number,
 *    note?: string, asOf?: string, source?: string, unverified?: boolean, listedInPerM?: number, listedOutPerM?: number}} PriceRow */

/** Conservative ceiling for unverified prices (USD per 1M tokens): OpenAI gpt-6-astra, the dearest general-purpose
 *  model on an official price page read 2026-11-10 (Anthropic Opus 5.5 is 4 / 20; Gemini 4 Argon 4 / 20 from Dec 1). */
export const CONSERVATIVE = Object.freeze({ inPerM: 10, outPerM: 50, source: "https://developers.openai.com/api/docs/pricing", asOf: "2026-11-10" });

/** Router caps beside the token ceiling (review fix P6-5; OpenRouter provider.max_price `request` and `image`, USD per
 *  request / per image): no per-request fee is accepted (0), and a per-image fee is capped at what the gateway reserves
 *  for one image (1,600 tokens x the 10 USD per 1M input ceiling = 0.016 USD). */
export const ROUTER_CAPS = Object.freeze({ requestUsd: 0, imageUsd: 0.016 });

const SRC = {
  anthropic: "https://platform.claude.com/docs/en/about-claude/pricing",
  gemini: "https://aistudio.google.com/docs/pricing",
  openai: "https://developers.openai.com/api/docs/pricing",
  dashscope: "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
  deepseek: "https://api-docs.deepseek.com/quick_start/pricing",
  zai: "https://docs.z.ai/guides/overview/pricing",
  kimi: "https://platform.kimi.ai/docs/pricing/chat"
};
const D = "2026-11-10";

/** @type {ReadonlyArray<PriceRow>} */
export const PRICES = Object.freeze([
  // Anthropic (global routing; US-only inference is x1.1 and not used). Haiku 5.5: prompts up to 100,000 tokens.
  { provider: "anthropic", model: "claude-haiku-5-5", from: "2026-01-01", inPerM: 0.10, outPerM: 0.50, cacheWrite: 1.25, cacheRead: 0.1, asOf: D, source: SRC.anthropic },
  { provider: "anthropic", model: "claude-sonnet-5-5", from: "2026-01-01", inPerM: 2, outPerM: 10, cacheWrite: 1.25, cacheRead: 0.1, asOf: D, source: SRC.anthropic },
  { provider: "anthropic", model: "claude-opus-5-5", from: "2026-01-01", inPerM: 4, outPerM: 20, cacheWrite: 1.25, cacheRead: 0.1, asOf: D, source: SRC.anthropic },
  // Google Gemini API (paid tier, Standard). Introductory prices end on the dated rows.
  { provider: "gemini", model: "gemini-3.5-flash-lite", from: "2026-01-01", inPerM: 0.30, outPerM: 2.50, asOf: D, source: SRC.gemini },
  { provider: "gemini", model: "gemini-3.8-flash", from: "2026-01-01", inPerM: 0.75, outPerM: 3.75, asOf: D, source: SRC.gemini },
  { provider: "gemini", model: "gemini-3.8-flash", from: "2027-01-01", inPerM: 1.50, outPerM: 7.50, note: "dated price change", asOf: D, source: SRC.gemini },
  { provider: "gemini", model: "gemini-4-argon", from: "2026-01-01", inPerM: 2, outPerM: 10, asOf: D, source: SRC.gemini },
  { provider: "gemini", model: "gemini-4-argon", from: "2026-12-01", inPerM: 4, outPerM: 20, note: "dated price change", asOf: D, source: SRC.gemini },
  // OpenAI (standard tier, short context <= 272K; processing residency +10 % not used)
  { provider: "openai", model: "gpt-6-luna", from: "2026-01-01", inPerM: 0.10, outPerM: 0.50, asOf: D, source: SRC.openai },
  { provider: "openai", model: "gpt-6.1-terra", from: "2026-01-01", inPerM: 1, outPerM: 5, asOf: D, source: SRC.openai },
  { provider: "openai", model: "gpt-6.1-sol", from: "2026-01-01", inPerM: 2, outPerM: 10, asOf: D, source: SRC.openai },
  // Alibaba Cloud Model Studio (Singapore / international; page updated 2026-11-07). Prices are tiered by input length:
  // the first tier is listed (LENSIQ requests are far below 32K tokens). qwen3.7-plus is on a "limited-time 20 % off"
  // (0.40 / 1.60, the P5 row) with no end date, so from 2026-11-10 the full price 0.50 / 2.00 is used (conservative).
  { provider: "dashscope", model: "qwen3-vl-plus", from: "2026-01-01", inPerM: 0.20, outPerM: 1.60, asOf: D, source: SRC.dashscope, note: "tier 0-32K input tokens" },
  { provider: "dashscope", model: "qwen3.7-plus", from: "2026-01-01", inPerM: 0.40, outPerM: 1.60, asOf: D, source: SRC.dashscope, note: "limited-time 20 % discount price" },
  { provider: "dashscope", model: "qwen3.7-plus", from: D, inPerM: 0.50, outPerM: 2.00, asOf: D, source: SRC.dashscope, note: "full price used while the discount has no end date (conservative)" },
  // DeepSeek: peak price, cache miss (the off-peak 50 % discount is not assumed)
  { provider: "deepseek", model: "deepseek-flash", from: "2026-01-01", inPerM: 0.30, outPerM: 1.20, asOf: D, source: SRC.deepseek, note: "peak, cache miss" },
  // Zhipu z.ai (page undated; image token count not documented)
  { provider: "zai", model: "glm-4.6v", from: "2026-01-01", inPerM: 0.30, outPerM: 0.90, asOf: D, source: SRC.zai },
  // Moonshot Kimi: the provider's own price table did not render (Alibaba's resale and third parties list 3 / 15)
  { provider: "kimi", model: "kimi-k3", from: "2026-01-01", inPerM: 3, outPerM: 15, note: "unverified", unverified: true, source: SRC.kimi },
  // OpenRouter: pass-through price of the routed model (+ 5.5 % fee when buying credits). Per-model prices could not be
  // read from an official page: every OpenRouter model, listed or not, is priced at the conservative ceiling, and the
  // same ceiling is sent as provider.max_price, so routing can never pick a provider dearer than what was reserved.
  { provider: "openrouter", model: "*", from: "2026-01-01", inPerM: CONSERVATIVE.inPerM, outPerM: CONSERVATIVE.outPerM, note: "unverified; ceiling = max_price",
    unverified: true, source: "https://openrouter.ai/docs/features/provider-routing" }
]);

/** Providers whose unlisted models fall back to their "*" row (only OpenRouter: it serves any model). */
const WILDCARD = new Set(["openrouter"]);

/** Effective price of a row: an unverified row never counts less than the conservative ceiling. @param {PriceRow} row @returns {PriceRow} */
export function effective(row) {
  if (!row.unverified) return row;
  return { ...row, inPerM: Math.max(row.inPerM, CONSERVATIVE.inPerM), outPerM: Math.max(row.outPerM, CONSERVATIVE.outPerM), listedInPerM: row.inPerM, listedOutPerM: row.outPerM };
}

/** @param {string} provider @param {string} model @param {string} day UTC 'YYYY-MM-DD' @returns {PriceRow|null} */
export function priceAt(provider, model, day) {
  /** @param {string} m @returns {PriceRow|null} */
  const pick = m => {
    let best = null;
    for (const p of PRICES) {
      if (p.provider !== provider || p.model !== m || p.from > day) continue;
      if (!best || p.from > best.from) best = p;
    }
    return best;
  };
  const row = pick(model) || (WILDCARD.has(provider) ? pick("*") : null);
  return row ? effective(row) : null;
}

/**
 * @param {PriceRow|null} price
 * @param {{inputTokens?: number, outputTokens?: number, reasoningTokens?: number, cacheWriteTokens?: number, cachedInputTokens?: number}} usage
 *   inputTokens = ALL input tokens (including cache writes and reads, which are priced with the row's multipliers)
 * @returns {number} micro-USD (integer, rounded up); 0 when the price is unknown
 */
export function costMicros(price, usage) {
  if (!price || !usage) return 0;
  const n = v => (Number.isFinite(v) && v > 0 ? v : 0);
  const write = n(usage.cacheWriteTokens), read = n(usage.cachedInputTokens);
  const plain = Math.max(0, n(usage.inputTokens) - write - read);
  const raw = (plain + write * (price.cacheWrite ?? 1) + read * (price.cacheRead ?? 1)) * price.inPerM
    + (n(usage.outputTokens) + n(usage.reasoningTokens)) * price.outPerM;
  return Math.ceil(Math.round(raw * 1e6) / 1e6); // float noise (0.3 x 3 = 0.8999…) never rounds a cost up by one
}

/** Models with a price row for a provider (admin chain editor suggestions; OpenRouter's "*" row is not a model). @param {string} provider */
export const modelsOf = provider => [...new Set(PRICES.filter(p => p.provider === provider && p.model !== "*").map(p => p.model))];
