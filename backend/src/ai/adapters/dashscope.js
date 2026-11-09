// @ts-check
// backend/src/ai/adapters/dashscope.js — Alibaba Cloud Model Studio, Qwen (round 17 P6), plain fetch, no SDK.
//   POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions
//   Authorization: Bearer <DASHSCOPE_API_KEY>. The Singapore base URL carries the workspace id (docs updated
//   2026-10-27): it is read from the Worker variable DASHSCOPE_WORKSPACE_ID (an id, not a secret). Without it the
//   provider is not offered (adapters/index.js providerReady) and the adapter refuses with "unsupported".
//   JSON: response_format {type: "json_object"} + "JSON" and the schema in the prompt. json_schema is "not supported
//   yet" for Singapore models and falls back to json_object for images; qwen3-vl-plus gives structured output only in
//   non-thinking mode, so enable_thinking: false is always sent.
//   Errors (https://www.alibabacloud.com/help/en/model-studio/error-code): data_inspection_failed (input or output may
//   contain inappropriate content) -> content_policy_input; Arrearage / FreeTierOnly / OUT_OF_SERVICE -> auth;
//   Throttling.* -> rate_limited (status table); ModelNotFound -> bad_request.
//   Docs read 2026-11-10: https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen ,
//   https://www.alibabacloud.com/help/en/model-studio/json-mode , https://www.alibabacloud.com/help/en/model-studio/privacy-notice
//   ("will never use your data for model training"; retention period not stated) (legal item L4).
import { makeAdapter } from "./oaicompat.js";

/** A well-formed workspace id (one DNS label). The same check decides providerReady (index.js) and the key check. */
export const WS_RE = /^[A-Za-z0-9-]{1,64}$/;
/** @param {any} v */
export const validWorkspaceId = v => typeof v === "string" && WS_RE.test(v.trim());
/** Singapore base URL for a workspace id, or null when it is missing / malformed. @param {any} config */
export const endpointOf = config => {
  const ws = config && typeof config.workspaceId === "string" ? config.workspaceId.trim() : "";
  return WS_RE.test(ws) ? `https://${ws}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions` : null;
};
export const VISION = ["qwen3-vl-plus", "qwen3.7-plus", "qwen3.8-max"];
/** Budget estimate per image (review fix P6-7): Qwen-VL counts one token per 28 x 28 px patch, about 1,340 for a
 *  1024 x 1024 crop; twice that is reserved (conservative; the gateway default is 1,600 per image). */
export const QWEN_IMAGE_TOKENS = 2 * Math.ceil((1024 / 28) * (1024 / 28));

export const adapter = makeAdapter({
  id: "dashscope",
  region: "sg",
  endpoint: ctx => endpointOf(ctx && ctx.config),
  jsonMode: () => "json_object",
  tokenParam: "max_tokens",
  vision: model => VISION.includes(model),
  extra: body => { body.enable_thinking = false; },
  imageTokens: () => QWEN_IMAGE_TOKENS,
  errorKind: (status, data) => {
    const code = String((data && ((data.error && data.error.code) || data.code)) || "");
    if (/data_inspection_failed|DataInspectionFailed/i.test(code)) return "content_policy_input";
    if (/Arrearage|FreeTierOnly|OUT_OF_SERVICE/i.test(code)) return "auth";
    if (/ModelNotFound|model_not_found/i.test(code)) return "bad_request";
    return null;
  }
});
