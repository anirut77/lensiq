// @ts-check
// backend/src/ai/adapters/prices.js — versioned list-price table (USD per 1M tokens) with effective dates.
//
// Source: docs/PRODUCT-CHECK-DESIGN.md §11 (provider pages read 2026-11-09). A price change is a NEW row with a later
// `from` date (never an edit of an old row), so the cost of a past call can always be recomputed. priceAt() picks the
// row with the latest `from` <= the call's UTC day. USD per 1M tokens == micro-USD per token, so
// cost (micro-USD) = input tokens x inPerM + (output + reasoning tokens) x outPerM, rounded up.
// Reasoning tokens are billed as output by every listed provider. No caching / batch discount is applied (conservative).
// A model missing here has no known price: with a monthly budget set, the gateway cannot reserve for it and skips it.

/** cacheWrite / cacheRead: multipliers of the input price for prompt-cache writes and reads (default 1 = no discount,
 *  conservative). Anthropic: writes 1.25x (5-minute cache), reads 0.1x.
 *  @typedef {{provider: string, model: string, from: string, inPerM: number, outPerM: number, cacheWrite?: number, cacheRead?: number, note?: string}} PriceRow */

/** @type {ReadonlyArray<PriceRow>} */
export const PRICES = Object.freeze([
  // Anthropic (global routing; US-only inference is x1.1 and not used)
  { provider: "anthropic", model: "claude-haiku-5-5", from: "2026-01-01", inPerM: 0.10, outPerM: 0.50, cacheWrite: 1.25, cacheRead: 0.1 },
  { provider: "anthropic", model: "claude-sonnet-5-5", from: "2026-01-01", inPerM: 2, outPerM: 10, cacheWrite: 1.25, cacheRead: 0.1 },
  { provider: "anthropic", model: "claude-opus-5-5", from: "2026-01-01", inPerM: 4, outPerM: 20, cacheWrite: 1.25, cacheRead: 0.1 },
  // Google Gemini API (paid tier)
  { provider: "gemini", model: "gemini-3.5-flash-lite", from: "2026-01-01", inPerM: 0.30, outPerM: 2.50 },
  { provider: "gemini", model: "gemini-3.8-flash", from: "2026-01-01", inPerM: 0.75, outPerM: 3.75 },
  { provider: "gemini", model: "gemini-3.8-flash", from: "2027-01-01", inPerM: 1.50, outPerM: 7.50, note: "dated price change" },
  { provider: "gemini", model: "gemini-4-argon", from: "2026-01-01", inPerM: 2, outPerM: 10 },
  { provider: "gemini", model: "gemini-4-argon", from: "2026-12-01", inPerM: 4, outPerM: 20, note: "dated price change" },
  // OpenAI (processing residency +10 % not used)
  { provider: "openai", model: "gpt-6-luna", from: "2026-01-01", inPerM: 0.10, outPerM: 0.50 },
  { provider: "openai", model: "gpt-6.1-terra", from: "2026-01-01", inPerM: 1, outPerM: 5 },
  { provider: "openai", model: "gpt-6.1-sol", from: "2026-01-01", inPerM: 2, outPerM: 10 },
  // Alibaba Cloud Model Studio (Singapore)
  { provider: "dashscope", model: "qwen3-vl-plus", from: "2026-01-01", inPerM: 0.20, outPerM: 1.60 },
  { provider: "dashscope", model: "qwen3.7-plus", from: "2026-01-01", inPerM: 0.40, outPerM: 1.60 },
  // DeepSeek: peak price (the off-peak discount is not assumed)
  { provider: "deepseek", model: "deepseek-flash", from: "2026-01-01", inPerM: 0.30, outPerM: 1.20 },
  // Zhipu z.ai (token count for images unverified)
  { provider: "zai", model: "glm-4.6v", from: "2026-01-01", inPerM: 0.30, outPerM: 0.90 },
  // Moonshot Kimi: price NOT verified from the provider (third-party figure, conservative)
  { provider: "kimi", model: "kimi-k3", from: "2026-01-01", inPerM: 3, outPerM: 15, note: "unverified" }
  // OpenRouter: pass-through price of the routed model + 5.5 % credit fee — no fixed row; add rows per routed model
]);

/** @param {string} provider @param {string} model @param {string} day UTC 'YYYY-MM-DD' @returns {PriceRow|null} */
export function priceAt(provider, model, day) {
  let best = null;
  for (const p of PRICES) {
    if (p.provider !== provider || p.model !== model || p.from > day) continue;
    if (!best || p.from > best.from) best = p;
  }
  return best;
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

/** Models with a price row for a provider (admin chain editor suggestions). @param {string} provider */
export const modelsOf = provider => [...new Set(PRICES.filter(p => p.provider === provider).map(p => p.model))];
