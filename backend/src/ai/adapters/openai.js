// @ts-check
// backend/src/ai/adapters/openai.js — OpenAI (round 17 P6), plain fetch, no SDK.
//   POST https://api.openai.com/v1/chat/completions   Authorization: Bearer <OPENAI_API_KEY>
//   Structured output: response_format {type: "json_schema", json_schema: {name, strict: true, schema}}; store: false;
//   max_completion_tokens; reasoning_effort from the chain entry's effort (low / medium / high).
//   Docs read 2026-11-10: https://developers.openai.com/api/docs/guides/structured-outputs ,
//   https://developers.openai.com/api/docs/guides/your-data (API data not used for training; abuse-monitoring logs up
//   to 30 days; default project = no regional processing; residency endpoints cost +10 % and are not used).
//   Errors: 429 insufficient_quota (no credit) -> auth (owner must act); 400 content_policy_violation ->
//   content_policy_input; the rest by status (common.js).
import { effort3 } from "./common.js";
import { makeAdapter } from "./oaicompat.js";

export const ENDPOINT = "https://api.openai.com/v1/chat/completions";
/** Models confirmed with image input on the provider's pages (design §11). */
export const VISION = ["gpt-6-luna", "gpt-6.1-terra", "gpt-6.1-sol", "gpt-6-sol", "gpt-6-astra"];

export const adapter = makeAdapter({
  id: "openai",
  region: "us",
  endpoint: () => ENDPOINT,
  jsonMode: () => "json_schema",
  tokenParam: "max_completion_tokens",
  vision: model => VISION.includes(model),
  extra: (body, req, entry) => {
    body.store = false;
    const e = effort3(entry.effort);
    if (e) body.reasoning_effort = e;
  },
  errorKind: (status, data) => {
    const err = (data && data.error) || {};
    const code = String(err.code || err.type || "");
    if (code === "insufficient_quota") return "auth";
    if (status === 400 && /content_policy|content_filter/.test(code)) return "content_policy_input";
    return null;
  }
});
