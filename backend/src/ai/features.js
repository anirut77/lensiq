// @ts-check
// backend/src/ai/features.js — feature registry of the AI gateway.
//
//   id             what the admin configures and the URL names (POST /v1/ai/<id>)
//   status         "live" (has a route) | "planned" (settings can be prepared; the route answers 404 + fallback)
//   legacy         true for fortune_reword: its route stays /api/fortune (fortune.js: grounding, quotas, client contract);
//                  its switch, model, effort, max tokens and per-user limits stay in the existing 'ai' settings
//   imageCapable   image mode may be allowed for it (owner decision PC-D9: text only by default; an image only after the
//                  user's own consent, and only where the feature allows it)
//   timeoutMs      default per-attempt timeout (design §10.2: 20 s vision, 30 s text)
//   overallMs      deadline for the WHOLE request (all attempts); default min(120 s, timeoutMs x 2 x chain length)
//   gatewayRetries false = never retry the same model (the §10.3 "once" retries are skipped; next provider still used)
//   sdkRetries     retries inside the provider SDK (default 0: the gateway owns retries)
//   autoCheck      present = accepts the tester-only one-tap send of the Product Check live scan (gateway.js aiRoute: gate on +
//                  valid tester code); autoCheck(input) is the stricter auto filter, run after build(). Absent = an auto
//                  request is refused (403 auto_not_allowed).
//   build(input, {mode}) -> provider-neutral request {system, text, images?, output: {name, schema}} — only for features
//                  with a public route. P7 (2026-11-10): pc_fields, pc_claims, pc_translate are live (ai/pc-features.js:
//                  schemas, prompts, verify); they stay OFF with budget 0 on a new install (settings.js). Tests inject
//                  extra features through deps.aiFeatures.
// Every output schema is checked with schema.js assertSupportedSchema when the request is built.

import { autoCheck, buildClaims, buildFields, buildTranslate } from "./pc-features.js";

/** @typedef {{th: string, en: string, zh: string}} L3 */
/** @typedef {{id: string, status: "live"|"planned", legacy?: boolean, imageCapable?: boolean, timeoutMs?: number, overallMs?: number,
 *    gatewayRetries?: boolean, sdkRetries?: number, autoCheck?: Function, label: L3, build?: Function}} Feature */

/** @type {Readonly<Record<string, Feature>>} */
export const FEATURES = Object.freeze({
  // fortune keeps its behaviour from before the gateway: one SDK call with the SDK's own single retry, no same-model
  // retry by the gateway, and the whole request inside the 90 s abort of the fortune-ai.js client
  fortune_reword: {
    id: "fortune_reword", status: "live", legacy: true, imageCapable: false, timeoutMs: 120000, overallMs: 85000, gatewayRetries: false, sdkRetries: 1,
    label: { th: "ผู้ช่วยเขียนคำทำนาย", en: "Fortune writing assistant", zh: "运势写作助手" }
  },
  pc_fields: { id: "pc_fields", status: "live", imageCapable: true, autoCheck, timeoutMs: 20000, build: buildFields, label: { th: "ตรวจสินค้า: อ่านข้อมูลบนฉลาก", en: "Product Check: label fields",
    zh: "产品核查：标签字段" } },
  pc_claims: { id: "pc_claims", status: "live", imageCapable: false, autoCheck, timeoutMs: 30000, build: buildClaims, label: { th: "ตรวจสินค้า: คำโฆษณาเกินจริง", en: "Product Check: over-claims",
    zh: "产品核查：夸大宣传" } },
  pc_translate: { id: "pc_translate", status: "live", imageCapable: false, autoCheck, timeoutMs: 30000, build: buildTranslate, label: { th: "ตรวจสินค้า: แปลฉลาก",
    en: "Product Check: label translation", zh: "产品核查：标签翻译" } }
});

/** Registry with test features merged in (deps.aiFeatures). @param {Record<string, Feature>} [injected] */
export const featuresWith = injected => ({ ...FEATURES, ...(injected || {}) });
