// @ts-check
// backend/src/ai/pc-features.js — the three Product Check AI features (round 17 P7; design §5.2, §8.2, §10.4):
//   pc_fields     label fields from the on-device OCR text, or (image mode, after the user's own consent) from the
//                 face-blurred product crop
//   pc_claims     over-claim RISK-SIGNAL classifier over the label text: rule ids of docs/product-check/RULES.md, each
//                 with an evidence span copied verbatim from the text
//   pc_translate  label translation (CJK / Korean / other -> Thai, or the page language)
// Each feature: a strict JSON schema (schema.js subset, additionalProperties false, every key required) and a short
// system prompt. No output field can carry a verdict: there is no "illegal", "fake", "genuine", "safe" or score field.
// verify(json) runs in the gateway AFTER the schema check (runFeature): a pc_claims evidence span that is not a substring
// of the text sent, or a translated line that is not in the text, rejects the whole answer (schema_mismatch: retried once,
// then the next provider) — a hallucinated span never reaches the page. With a product category, a pc_claims signal whose
// rule is outside the category's family (the rules the prompt listed) is dropped, not rejected, and only the COUNT is
// returned (response `meta.off_family_dropped`). pc_fields registration numbers that are not in
// the OCR text are kept but marked source "model" (shown as "read by the AI, not in the text").
// Defence in depth for the patient-name guard (lensiq-pc-guard.js runs on the device first): build() runs the same guard
// and refuses text that still carries a name, HN, phone, ID, e-mail or birth date, and (setting dispensingAI "off", the
// default) any text that looks like a dispensing / prescription label (the page then shows the fallback).
// Product-label evidence (owner decision 2026-11-10, option 1): build() also runs the page's own decision, Guard.aiGate,
// on the text it receives: no product-label evidence, or a personal-document sign (recipient / sender, delivery, order,
// receipt, certificate, appointment, letter), is refused before any provider call. The page may hand in what it read on
// the device as evidence: `gtins` (decoded barcodes: only the check digit can be checked here, the scan itself cannot) and
// `regs` (registration numbers: counted only when they stand in the text). Neither is sent to a provider.
// Local evaluation mode (owner decision 2026-11-10, "eval bypass"): build(input, {evalLocal: true}) skips ONLY the
// product-label part (no evidence / personal-document sign). The flag is computed by the gateway (evalLocalMode:
// AI_EVAL_LOCAL=1 AND a localhost request URL AND a localhost Origin); the name guard and the dispensing refusal always run.
// NOT checkable here (client only): image mode without text (the photo is never read by the Worker), that the text is
// the device's own OCR of the capture (provenance), and that a barcode was really scanned.
// Provider-neutral: no provider name, host or SDK here (tools/check-ai-providers.mjs).

import GuardModule from "../../../lensiq-pc-guard.js";

/** @type {{scan: (t: string) => any[], isDispensingLabel: (t: string) => boolean, DEFAULTS: {dispensingAI: string}, PLACEHOLDER: string,
 *   possibleNames: (t: string) => any[], autoBlock: (t: string) => boolean, aiGate: (t: string, facts?: {gtins?: string[], regs?: string[]}, opts?: any) => {allow: boolean, reason: string}}} */
const Guard = GuardModule;
export const MAX_TEXT = 8000;
const S = (n = 200) => ({ type: ["string", "null"], maxLength: n });
const STR = (n = 200) => ({ type: "string", maxLength: n });

/** Text-detectable rules of docs/product-check/RULES.md (lensiq-claims-rules.js, detect "text"): [id, short English
 *  title]. tests/unit/backend-pc-features.test.js checks this list against LQClaims.RULES. */
export const PC_CLAIM_RULES = Object.freeze([
  ["D01", "Miraculous or complete-cure claim"], ["D02", "False or exaggerated efficacy"], ["D04", "Abortion or strong emmenagogue"],
  ["D05", "Aphrodisiac or contraceptive"], ["D07", "Endorsement by another person"], ["D08", "Claims to treat a disease listed under s.77"],
  ["D10", "Free gift or prize draw in a drug advert"], ["F01", "Miraculous wording"], ["F02", "Superlative or ranking claim"],
  ["F03", "Worry-free or complete-cure wording"], ["F04", "No side effects"], ["F05", "Misuse of the FDA mark or 'safe' guarantee"],
  ["F06", "Fast or instant results"], ["F07", "Lowers a disease marker (cholesterol, blood pressure, blood sugar, blood fat)"],
  ["F08", "Prevents disease or fights infection"], ["F09", "Treats or relieves a disease or symptom"], ["F10", "Changes body structure or organ function"],
  ["F11", "Sexual enhancement"], ["F12", "Skin or beauty benefit from a food"], ["F13", "Weight loss or body shaping"],
  ["F14", "Endorsement by a health professional"], ["F18", "Kratom supplement or cannabis / hemp / CBD food with a drug-like effect claim"],
  ["F19", "Cites research or statistics not evaluated by Thai FDA"], ["F20", "Compares with or disparages other products"],
  ["F21", "Environmental / BCG claim without certification"], ["F22", "Advert for infant formula or infant food"],
  ["H01", "Miraculous, complete-cure or belief-based claim"], ["H02", "False, exaggerated or misleading efficacy"],
  ["H04", "Endorsement by a person, group or institution"], ["H05", "Serious-disease claim for a herbal product"],
  ["C01", "Treats disease or a non-cosmetic purpose"], ["C02", "Aphrodisiac claim"], ["C03", "False or exaggerated claim"],
  ["C04", "Research, statistics or endorsement claim"], ["C07", "Use inside the body, injection or invasive device"],
  ["C08", "Claims a health, body-structure or body-function effect"]
]);
export const RULE_IDS = Object.freeze(PC_CLAIM_RULES.map(r => r[0]));
const CATEGORIES = ["drug", "supplement", "food", "herbal", "cosmetic"];
const FAMILY = { drug: "D", supplement: "F", food: "F", herbal: "H", cosmetic: "C" };
const LANGS = ["th", "en", "zh"];

/* ---------------------------------------- schemas ---------------------------------------- */

export const FIELDS_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["product_type", "brand", "product_name", "active_ingredients", "dosage_form", "registration", "manufacturer", "lot", "expiry",
    "claims_on_pack", "languages_on_pack", "unreadable"],
  properties: {
    product_type: { type: "string", enum: ["drug", "supplement", "cosmetic", "food", "device", "other", "unknown"] },
    brand: S(), product_name: S(),
    active_ingredients: { type: "array", items: { type: "object", additionalProperties: false, required: ["name_on_pack", "inn", "strength", "unit"],
      properties: { name_on_pack: STR(160), inn: S(120), strength: S(40), unit: S(20) } } },
    dosage_form: S(80),
    registration: { type: "array", items: { type: "object", additionalProperties: false, required: ["number", "country", "kind"],
      properties: { number: STR(60), country: S(40), kind: S(60) } } },
    manufacturer: S(), lot: S(60), expiry: S(40),
    claims_on_pack: { type: "array", items: STR(300) },
    languages_on_pack: { type: "array", items: STR(40) },
    unreadable: { type: "array", items: STR(60) }
  }
};
/** What the page receives (verify adds the source of each registration number). */
export const FIELDS_OUT_LIMITS = { active_ingredients: 12, registration: 8, claims_on_pack: 12, languages_on_pack: 8, unreadable: 16 };

export const CLAIMS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["signals"],
  properties: {
    signals: { type: "array", items: { type: "object", additionalProperties: false, required: ["rule_id", "evidence"],
      properties: { rule_id: { type: "string", enum: [...RULE_IDS] }, evidence: STR(300) } } }
  }
};
export const MAX_SIGNALS = 20;

export const TRANSLATE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["source_language", "lines"],
  properties: {
    source_language: STR(40),
    lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["source", "translation"],
      properties: { source: STR(400), translation: STR(800) } } }
  }
};
export const MAX_LINES = 40;

/* ---------------------------------------- prompts ---------------------------------------- */

const COMMON = "You read text from a product label (medicine, supplement, cosmetic or food) for a consumer information tool. " +
  "Rules: never judge whether the product is legal, registered, genuine, fake, safe or effective; never give dosing, medical or cosmetic advice; " +
  "never invent text that is not on the label; the text may contain the token [removed] where personal data was deleted on the device: never guess it. " +
  "Answer only with JSON that matches the schema.";

export const PROMPTS = Object.freeze({
  pc_fields: COMMON + " Task: copy the label fields as printed. Use null when a field is not on the label; list such fields in unreadable. " +
    "registration: every registration / notification / approval number exactly as printed. inn: the international non-proprietary name only when you are sure, " +
    "else null. claims_on_pack: claims printed on the pack, copied verbatim. product_type unknown when unclear.",
  pc_claims: COMMON + " Task: find wording that is a RISK SIGNAL under the Thai advertising rules listed below. For each finding return the rule id and " +
    "evidence = the shortest exact substring of the input text (copy it character for character, same spacing) that shows the wording. " +
    "Return an empty list when nothing matches. Official warning lines and 'not for diagnosis, treatment or prevention of disease' disclaimers are not claims.\nRules:\n",
  pc_translate: COMMON + " Task: translate the label text line by line into the target language. source = the original line copied exactly from the input; " +
    "translation = a faithful translation that keeps every number, unit and name as printed and adds nothing. Skip lines that are only numbers or codes."
});

const LANG_NAME = { th: "Thai", en: "English", zh: "Simplified Chinese" };

/* ---------------------------------------- input checks ---------------------------------------- */

/** Personal data the device guard should already have removed: the SAME module the page runs (lensiq-pc-guard.js,
 *  imported as-is like fortune.js imports fortune-ai.js — no copy, no drift). Text the page redacted scans clean. */
/** @param {string} t */
export const piiLeft = t => Guard.scan(t).length > 0;

/** Up to 8 short strings (barcode digits, registration numbers). @param {any} v @returns {string[]} */
const strList = v => (Array.isArray(v) ? v.filter(x => typeof x === "string" && x.length <= 40).slice(0, 8) : []);

/**
 * Documented refusal codes (docs/AI-GATEWAY.md §4 "Refusal codes"): the gateway still answers reason "bad_input" (HTTP 400,
 * no provider call; the page and tools/pc-ai-eval.mjs key on it) and adds `code` = one of these, so a refusal of THIS
 * text can be told apart from a malformed request. Any other build error has no code.
 *   ai_off_personal_data  a name, HN, phone, ID, e-mail, birth date or address is still in the text (device guard missed or skipped)
 *   ai_off_dispensing     the text looks like a dispensing / prescription label (setting dispensingAI "off", the default)
 *   ai_off_personal_doc   a personal-document sign (recipient / sender, delivery, order, receipt, certificate, appointment, letter)
 *   ai_off_no_product     no product-label evidence (registration-number shape, valid barcode, or two label cue types)
 */
export const INPUT_REFUSAL_CODES = Object.freeze(["ai_off_personal_data", "ai_off_dispensing", "ai_off_personal_doc", "ai_off_no_product"]);
/**
 * Tester-only one-tap send of the live scan (owner order 2026-11-12; autoCheck(input) below, called by the gateway only for a
 * valid tester with the gate on): after every check above, an auto request is also refused when
 *   ai_off_auto_filter    the text holds the placeholder (the device removed something: one-tap send needs a capture where the
 *                         guard found nothing), a POSSIBLE name (LQPCGuard.possibleNames, underlined in the manual
 *                         preview), session evidence (option ข), no text at all, or a photo (one-tap send is text only:
 *                         a photo needs the user's own preview and confirmation)
 */
export const AUTO_REFUSAL_CODES = Object.freeze(["ai_off_auto_filter"]);
const GATE_CODE = /** @type {Record<string, string>} */ ({ dispensing: "ai_off_dispensing", "personal-doc": "ai_off_personal_doc", "no-product": "ai_off_no_product" });
/** @param {string} code one of INPUT_REFUSAL_CODES @param {string} message */
function refusal(code, message) { return Object.assign(new Error(message), { code }); }
/** The documented refusal code of a build error, or null (any other error). @param {any} e @returns {string|null} */
export const refusalCode = e => (e && typeof e.code === "string" && (INPUT_REFUSAL_CODES.includes(e.code) || AUTO_REFUSAL_CODES.includes(e.code)) ? e.code : null);

/** @param {any} input @param {{images?: boolean, evalLocal?: boolean}} [o] */
function cleanText(input, o = {}) {
  const t = typeof input.text === "string" ? input.text.normalize("NFC").replace(/\r\n?/g, "\n").trim() : "";
  if (t.length > MAX_TEXT) throw new Error("text too long");
  if (!t && !o.images) throw new Error("no text");
  if (t && piiLeft(t)) throw refusal("ai_off_personal_data", "personal data left in the text");
  // ONE decision, the same function the page runs first: not a dispensing / prescription label (owner's setting "off",
  // the default), no personal-document sign, product-label evidence in the text or in the facts handed in
  if (t) {
    // option ข: evidence scanned earlier in the session (sessionGtins / sessionRegs), checked by the same guard rule
    const sf = { gtins: strList(input.sessionGtins), regs: strList(input.sessionRegs) };
    const g = Guard.aiGate(t, { gtins: strList(input.gtins), regs: strList(input.regs) }, sf.gtins.length || sf.regs.length ? { sessionFacts: sf } : undefined);
    // Local evaluation mode only (o.evalLocal comes from the gateway: AI_EVAL_LOCAL=1, local wrangler dev AND a localhost Origin, never from
    // the request body): the PRODUCT-LABEL part of the decision (no evidence / personal-document sign) is skipped so the
    // advert snippets of the P3 claim set can be scored. A dispensing label is still refused, and so is personal data
    // (piiLeft above).
    const skip = o.evalLocal === true && (g.reason === "no-product" || g.reason === "personal-doc");
    if (!g.allow && !skip) throw refusal(GATE_CODE[g.reason] || "ai_off_no_product", "AI off for this text: " + g.reason);
  }
  return t;
}

/**
 * The stricter filter of a tester one-tap send (no per-capture preview on the page). The gateway calls it AFTER the feature's
 * build() accepted the input (so every check above runs first and keeps its own code), only for a request marked auto by a
 * valid tester with the gate on. Refuses (ai_off_auto_filter) a capture without text, a text holding the placeholder (the
 * device removed something), a POSSIBLE name, session evidence (option ข), or a photo. @param {any} input
 */
export function autoCheck(input) {
  const t = typeof input.text === "string" ? input.text.normalize("NFC").replace(/\r\n?/g, "\n").trim() : "";
  const session = strList(input.sessionGtins).length > 0 || strList(input.sessionRegs).length > 0;
  const photo = Array.isArray(input.images) && input.images.length > 0;
  if (!t || photo || t.includes(Guard.PLACEHOLDER) || Guard.possibleNames(t).length > 0 || Guard.autoBlock(t) || session) {
    throw refusal("ai_off_auto_filter", "one-tap send filter");
  }
}

/* ---------------------------------------- verify ---------------------------------------- */

/** Registration-number comparison key: letters and digits only, upper case (spaces, dashes, dots and slashes vary). */
const regKey = s => String(s || "").normalize("NFKC").toUpperCase().replace(/[^0-9A-Zก-๙一-鿿]/g, "");
const isDate = s => /^(\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-/.]\d{4})$/.test(String(s).trim());

/** @param {string} text */
export function verifyFields(text) {
  const key = regKey(text);
  return (/** @type {any} */ json) => {
    const out = { ...json };
    for (const [k, n] of Object.entries(FIELDS_OUT_LIMITS)) out[k] = (json[k] || []).slice(0, n);
    // a number the model read that is not in the OCR text is kept, marked "model" (design §10.4)
    out.registration = out.registration.map((/** @type {any} */ r) => ({ ...r, source: key && regKey(r.number) && key.includes(regKey(r.number)) ? "ocr" : "model" }));
    if (out.expiry != null && !isDate(out.expiry)) { out.unreadable = [...out.unreadable, "expiry"].slice(0, FIELDS_OUT_LIMITS.unreadable); out.expiry = null; }
    return { errors: [], json: out };
  };
}

/** The rules the model is asked about for a product category (null = every rule): the category's family letter, and F22
 *  (infant formula / infant food) only for food. @param {string|null} cat */
export const claimRulesFor = cat => (cat ? PC_CLAIM_RULES.filter(r => r[0][0] === FAMILY[cat] && !(r[0] === "F22" && cat !== "food")) : PC_CLAIM_RULES);

/**
 * Every evidence span must be a substring of the text that was sent (and long enough to mean something).
 * With a category (the same family filter as the prompt, claimRulesFor): a signal whose rule is outside the family is
 * DROPPED before any other check (it never reaches the page and does not reject the answer), and the answer's metadata
 * carries how many were dropped (`meta.off_family_dropped`: a count only, no rule id or text). Without a category every
 * rule id of the schema is kept (the prompt listed them all) and there is no metadata.
 * @param {string} text @param {string|null} [cat]
 */
export function verifyClaims(text, cat = null) {
  const allowed = cat ? new Set(claimRulesFor(cat).map(r => r[0])) : null;
  return (/** @type {any} */ json) => {
    /** @type {string[]} */ const errors = [];
    const seen = new Set();
    const signals = [];
    let dropped = 0;
    for (const [i, s] of (json.signals || []).entries()) {
      if (allowed && !allowed.has(s.rule_id)) { dropped++; continue; }
      if (typeof s.evidence !== "string" || [...s.evidence.trim()].length < 2) { errors.push(`$.signals[${i}].evidence: empty`); continue; }
      if (!text.includes(s.evidence)) { errors.push(`$.signals[${i}].evidence: not a substring of the input`); continue; }
      const k = s.rule_id + "\u0000" + s.evidence;
      if (seen.has(k)) continue;
      seen.add(k);
      signals.push({ rule_id: s.rule_id, evidence: s.evidence, start: text.indexOf(s.evidence) });
    }
    if (signals.length > MAX_SIGNALS) errors.push("$.signals: too many");
    return allowed ? { errors, json: { signals }, meta: { off_family_dropped: dropped } } : { errors, json: { signals } };
  };
}

/** Each translated line must come from the text (no invented source lines). @param {string} text */
export function verifyTranslate(text) {
  const norm = s => String(s).replace(/\s+/g, " ").trim();
  const t = norm(text);
  return (/** @type {any} */ json) => {
    /** @type {string[]} */ const errors = [];
    const lines = (json.lines || []).slice(0, MAX_LINES);
    lines.forEach((/** @type {any} */ l, /** @type {number} */ i) => { if (!norm(l.source) || !t.includes(norm(l.source))) errors.push(`$.lines[${i}].source: not in the input`); });
    return { errors, json: { source_language: json.source_language, lines: lines.map((/** @type {any} */ l) => ({ source: l.source, translation: l.translation })) } };
  };
}

/* ---------------------------------------- builders ---------------------------------------- */

/** @param {any} input @param {{mode: string, evalLocal?: boolean}} o */
export function buildFields(input, o) {
  const image = o && o.mode === "image";
  const text = cleanText(input, { images: image, evalLocal: !!o && o.evalLocal === true });
  const script = ["th", "cjk", "ko", "latin"].includes(input.script) ? input.script : "unknown";
  return {
    system: PROMPTS.pc_fields,
    text: `Label script chosen by the user: ${script}.\n` + (text ? `On-device OCR text (may contain reading errors):\n<<<\n${text}\n>>>` :
      "No OCR text: read the fields from the product image."),
    images: image ? input.images : undefined,
    output: { name: "pc_fields", schema: FIELDS_SCHEMA, verify: verifyFields(text) }
  };
}

/** @param {any} input @param {{mode?: string, evalLocal?: boolean}} [o] */
export function buildClaims(input, o) {
  const text = cleanText(input, { evalLocal: !!o && o.evalLocal === true });
  const cat = CATEGORIES.includes(input.category) ? input.category : null;
  const rules = claimRulesFor(cat);
  return {
    system: PROMPTS.pc_claims + rules.map(r => `${r[0]}: ${r[1]}`).join("\n"),
    text: `Product category: ${cat || "unknown (consider every rule)"}.\nLabel text:\n<<<\n${text}\n>>>`,
    // the schema stays the full rule list (one schema for every category); verify drops off-family rules (claimRulesFor)
    output: { name: "pc_claims", schema: CLAIMS_SCHEMA, verify: verifyClaims(text, cat) }
  };
}

/** @param {any} input @param {{mode?: string, evalLocal?: boolean}} [o] */
export function buildTranslate(input, o) {
  const text = cleanText(input, { evalLocal: !!o && o.evalLocal === true });
  const target = LANGS.includes(input.target) ? input.target : "th";
  return {
    system: PROMPTS.pc_translate,
    text: `Target language: ${LANG_NAME[target]}.\nLabel text:\n<<<\n${text}\n>>>`,
    output: { name: "pc_translate", schema: TRANSLATE_SCHEMA, verify: verifyTranslate(text) }
  };
}
