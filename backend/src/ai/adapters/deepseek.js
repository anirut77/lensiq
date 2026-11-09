// @ts-check
// backend/src/ai/adapters/deepseek.js — DeepSeek (round 17 P6), plain fetch, no SDK.
//   POST https://api.deepseek.com/chat/completions   Authorization: Bearer <DEEPSEEK_API_KEY>
//   JSON mode: response_format {type: "json_object"} + the word "json" and the schema in the system prompt (the docs
//   require both); blank content (DeepSeek's documented JSON-mode failure) -> invalid_json (retried once, then next).
//   Image input: deepseek-flash only (deepseek-v4-pro has none). JSON mode with images is not documented, so the
//   gateway's schema check is what guarantees the shape.
//   Docs read 2026-11-10: https://api-docs.deepseek.com/guides/json_mode , https://api-docs.deepseek.com/quick_start/error_codes ,
//   https://api-docs.deepseek.com/quick_start/pricing ; privacy policy (updated 2026-02-10)
//   https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html : data stored in the PRC and may be used for
//   training (legal item L5). Usage reports cache hits in prompt_cache_hit_tokens.
//   Errors: 402 insufficient balance -> auth (common table); 422 invalid parameters -> bad_request; 503 overloaded.
import { makeAdapter } from "./oaicompat.js";

export const ENDPOINT = "https://api.deepseek.com/chat/completions";
export const VISION = ["deepseek-flash"];

export const adapter = makeAdapter({
  id: "deepseek",
  region: "cn",
  endpoint: () => ENDPOINT,
  jsonMode: () => "json_object",
  tokenParam: "max_tokens",
  vision: model => VISION.includes(model)
});
