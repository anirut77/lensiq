// @ts-check
// backend/src/ai/adapters/kimi.js — Moonshot Kimi (round 17 P6), plain fetch, no SDK.
//   POST https://api.moonshot.ai/v1/chat/completions   Authorization: Bearer <KIMI_API_KEY>
//   Structured output: response_format json_schema with strict: true (Kimi K3 quickstart). Images: base64 data URLs in
//   a content ARRAY (public image URLs are not accepted).
//   Docs read 2026-11-10: https://platform.kimi.ai/docs/guide/kimi-k3-quickstart ; privacy policy (updated 2025-04-30)
//   https://platform.kimi.ai/docs/agreement/userprivacy : servers in Singapore; user content may be used to optimise
//   models (API use not excluded); kept while the account is active (legal item L7).
//   The provider's own price table did not render: the price row is unverified (prices.js -> conservative ceiling).
import { makeAdapter } from "./oaicompat.js";

export const ENDPOINT = "https://api.moonshot.ai/v1/chat/completions";
export const VISION = ["kimi-k3", "kimi-k3.1-pro"];

export const adapter = makeAdapter({
  id: "kimi",
  region: "sg",
  endpoint: () => ENDPOINT,
  jsonMode: () => "json_schema",
  tokenParam: "max_tokens",
  vision: model => VISION.includes(model)
});
