// @ts-check
// backend/src/ai/adapters/zai.js — Zhipu z.ai GLM (round 17 P6), plain fetch, no SDK.
//   POST https://api.z.ai/api/paas/v4/chat/completions   Authorization: Bearer <ZAI_API_KEY>
//   JSON: response_format {type: "json_object"} for text requests (OpenAPI spec: enum text | json_object; no
//   json_schema). The vision request schema has no response_format, so image requests carry the schema in the prompt
//   only; the gateway validates every answer. finish_reason "sensitive" -> refusal.
//   Errors (https://docs.z.ai/api-reference/api-code): 1113 insufficient balance (HTTP 429) and 1308 / 1310 / 1311 plan
//   limits -> auth (owner must act); 1301 unsafe content -> content_policy_input; 1302 -> rate_limited;
//   1305 -> overloaded; 1210–1222 / 1261 -> bad_request.
//   Docs read 2026-11-10: https://docs.z.ai/api-reference/introduction , https://docs.z.ai/openapi.json ;
//   privacy policy + API DPA https://docs.z.ai/legal-agreement/privacy-policy (processed in Singapore; the DPA says
//   API content is not stored; training on API content not stated) (legal item L6).
import { makeAdapter } from "./oaicompat.js";

export const ENDPOINT = "https://api.z.ai/api/paas/v4/chat/completions";
export const VISION = ["glm-4.6v", "glm-4.6v-flashx", "glm-4.5v"];

/** @param {any} data */
const codeOf = data => Number(data && data.error && data.error.code);

export const adapter = makeAdapter({
  id: "zai",
  region: "sg",
  endpoint: () => ENDPOINT,
  jsonMode: req => (req && req.images && req.images.length ? "prompt" : "json_object"),
  tokenParam: "max_tokens",
  vision: model => VISION.includes(String(model).toLowerCase()),
  errorKind: (status, data) => {
    const c = codeOf(data);
    if ([1113, 1308, 1310, 1311].includes(c)) return "auth";
    if (c === 1301) return "content_policy_input";
    if (c === 1302) return "rate_limited";
    if (c === 1305) return "overloaded";
    if (c === 1261 || (c >= 1210 && c <= 1222)) return "bad_request";
    return null;
  }
});
