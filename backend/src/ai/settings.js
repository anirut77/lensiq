// @ts-check
// backend/src/ai/settings.js — AI gateway settings (D1 settings key 'ai_gateway', read/written through ai/db.js).
//
// Shape (what GET /admin/api/ai/gateway returns as `settings`):
//   enabled          global switch — new install: false (nothing runs until the owner turns it on)
//   legacyKeyStore   read the Anthropic key stored encrypted in D1 from the admin page (PC-D4: false; Worker secret first)
//   providers        allowlist {provider: boolean} — every provider on by default (owner decision PC-D2, 2026-11-09);
//                    the admin can switch any off; an off provider is never called and never shown for consent
//   features         {feature: {enabled, chain: [{provider, model, effort}], timeoutMs, monthlyBudgetUsd, perUserDaily,
//                    perUserPerMinute, globalPerMinute, maxOutputTokens, imageModeAllowed}}
//                    new features: off, empty chain, budget 0 (= nothing runs until the owner sets a budget)
//   last_eval        date of the last evaluation run of the active chains (filled by the eval tool in P8; placeholder)
//
// fortune_reword (the existing fortune writing assistant) is MIGRATED, not copied: its switch, model, effort, max tokens
// and per-user / global per-minute limits stay in the existing 'ai' settings (settings.js; /admin/api/ai keeps working
// unchanged) and are shown here as the feature's values; an edit here writes them back there. Only what fortune never
// had is stored in 'ai_gateway': timeoutMs (default 120 s, as fortune used), monthlyBudgetUsd (default null = no gateway
// budget, exactly the behaviour before the gateway) and extra chain entries after the first (Anthropic) one.
// The global switch does not gate fortune_reword (it keeps its own switch, as before); the allowlist does.
import { EFFORTS, getAiSettings, putAiSettings, validateAi } from "../settings.js";
import { HttpError } from "../util.js";
import { PROVIDER_IDS } from "./adapters/index.js";
import { readSettings, writeSettings } from "./db.js";
import { FEATURES } from "./features.js";

export const SETTINGS_KEY = "ai_gateway";
export const LEGACY_FEATURE = "fortune_reword";
export const LEGACY_PROVIDER = "anthropic";
export const MAX_CHAIN = 6;
/** Shown by the admin "AI settings" tab and fortune's status when a D1-stored key exists but legacyKeyStore is off. */
export const LEGACY_KEY_UNUSED = Object.freeze({
  th: "มีคีย์ Anthropic ที่เก็บแบบเข้ารหัสไว้ แต่ไม่ได้ใช้ (legacyKeyStore ปิดอยู่) ตั้ง Worker secret ANTHROPIC_API_KEY หรือเปิด legacyKeyStore ในแท็บ AI Gateway",
  en: "An encrypted Anthropic key is stored but not used (legacyKeyStore is off). Set the Worker secret ANTHROPIC_API_KEY or turn legacyKeyStore on in the AI Gateway tab",
  zh: "已加密保存 Anthropic 密钥，但未使用（legacyKeyStore 已关闭）。请设置 Worker secret ANTHROPIC_API_KEY，或在 AI 网关标签中开启 legacyKeyStore"
});

/** True when a legacy encrypted key is stored but the gateway will not read it. @param {{legacyKeyStore?: boolean}} gw
 *  @param {{stored_encrypted?: boolean}} keyStatus settings.js apiKeyStatus() */
export const legacyKeyUnused = (gw, keyStatus) => !gw.legacyKeyStore && !!(keyStatus && keyStatus.stored_encrypted);

/** @param {{timeoutMs?: number}} f */
export const defaultFeature = f => ({
  enabled: false, chain: [], timeoutMs: (f && f.timeoutMs) || 30000, monthlyBudgetUsd: 0,
  perUserDaily: 10, perUserPerMinute: 3, globalPerMinute: 60, maxOutputTokens: 1500, imageModeAllowed: false
});

export const DEFAULT_GATEWAY = Object.freeze({
  enabled: false,
  legacyKeyStore: false,
  providers: Object.freeze(Object.fromEntries(PROVIDER_IDS.map(id => [id, true]))),
  features: Object.freeze(Object.fromEntries(Object.values(FEATURES).filter(f => !f.legacy).map(f => [f.id, Object.freeze(defaultFeature(f))]))),
  last_eval: null
});

const isObj = v => v != null && typeof v === "object" && !Array.isArray(v);
const bad = msg => new HttpError(400, msg);
const intIn = (v, min, max, field) => {
  if (!Number.isInteger(v) || v < min || v > max) throw bad(`${field} must be an integer ${min}–${max}`);
  return v;
};
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,80}$/;

/** @param {any} chain */
function validChain(chain, field) {
  if (!Array.isArray(chain) || chain.length > MAX_CHAIN) throw bad(`${field} must be a list of at most ${MAX_CHAIN} entries`);
  const seen = new Set();
  return chain.map((e, i) => {
    if (!isObj(e)) throw bad(`${field}[${i}] must be an object`);
    for (const k of Object.keys(e)) if (!["provider", "model", "effort"].includes(k)) throw bad(`${field}[${i}]: unknown key ${String(k).slice(0, 20)}`);
    if (!PROVIDER_IDS.includes(e.provider)) throw bad(`${field}[${i}]: unknown provider`);
    if (typeof e.model !== "string" || !MODEL_RE.test(e.model)) throw bad(`${field}[${i}]: invalid model id`);
    if (e.effort != null && !EFFORTS.includes(e.effort)) throw bad(`${field}[${i}]: effort must be one of ${EFFORTS.join(", ")}`);
    const id = e.provider + "|" + e.model;
    if (seen.has(id)) throw bad(`${field}[${i}]: duplicate entry`);
    seen.add(id);
    return e.effort ? { provider: e.provider, model: e.model, effort: e.effort } : { provider: e.provider, model: e.model };
  });
}

/** Validates one feature patch onto `cur`. @param {any} patch @param {any} cur @param {any} meta */
function validFeature(id, patch, cur, meta) {
  if (!isObj(patch)) throw bad(`features.${id} must be an object`);
  const out = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    const f = `features.${id}.${k}`;
    switch (k) {
      case "enabled": case "imageModeAllowed":
        if (typeof v !== "boolean") throw bad(`${f} must be boolean`);
        if (k === "imageModeAllowed" && v && !meta.imageCapable) throw bad(`${f}: image mode is not available for this feature`);
        out[k] = v; break;
      case "chain": out.chain = validChain(v, f); break;
      case "timeoutMs": out.timeoutMs = intIn(v, 1000, 120000, f); break;
      case "monthlyBudgetUsd":
        if (v === null && meta.legacy) { out.monthlyBudgetUsd = null; break; }
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100000) throw bad(`${f} must be a number 0–100000 (USD)`);
        out.monthlyBudgetUsd = Math.round(v * 1e6) / 1e6; break;
      case "perUserDaily": out.perUserDaily = intIn(v, 0, 10000, f); break;
      case "perUserPerMinute": out.perUserPerMinute = intIn(v, 0, 600, f); break;
      case "globalPerMinute": out.globalPerMinute = intIn(v, 1, 10000, f); break;
      case "maxOutputTokens": out.maxOutputTokens = intIn(v, 64, 8192, f); break;
      default: throw bad(`unknown setting ${f.slice(0, 60)}`);
    }
  }
  return out;
}

/** fortune_reword as a gateway feature, from the existing 'ai' settings + what the gateway stores for it. */
export function legacyFeature(ai, stored = {}) {
  return {
    enabled: !!ai.enabled,
    chain: [{ provider: LEGACY_PROVIDER, model: ai.model, effort: ai.effort }, ...(Array.isArray(stored.extraChain) ? stored.extraChain : [])],
    timeoutMs: Number.isInteger(stored.timeoutMs) ? stored.timeoutMs : 120000,
    monthlyBudgetUsd: Object.prototype.hasOwnProperty.call(stored, "monthlyBudgetUsd") ? stored.monthlyBudgetUsd : null,
    perUserDaily: ai.per_caller_daily,
    perUserPerMinute: ai.rpm,
    globalPerMinute: ai.global_rpm,
    maxOutputTokens: ai.max_tokens,
    imageModeAllowed: false
  };
}

/** Effective settings (defaults + stored + the migrated fortune feature). @param {D1Database} db
 *  @param {{features?: Record<string, any>}} [o] features = registry (tests inject extra features) */
export async function getGateway(db, o = {}) {
  const reg = o.features ? { ...FEATURES, ...o.features } : FEATURES;
  const s = await readSettings(db, SETTINGS_KEY, {});
  const ai = await getAiSettings(db);
  const sf = isObj(s.features) ? s.features : {};
  /** @type {Record<string, any>} */
  const features = {};
  for (const f of Object.values(reg)) {
    features[f.id] = f.legacy ? legacyFeature(ai, isObj(sf[f.id]) ? sf[f.id] : {}) : { ...defaultFeature(f), ...(isObj(sf[f.id]) ? sf[f.id] : {}) };
  }
  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : DEFAULT_GATEWAY.enabled,
    legacyKeyStore: typeof s.legacyKeyStore === "boolean" ? s.legacyKeyStore : DEFAULT_GATEWAY.legacyKeyStore,
    providers: { ...DEFAULT_GATEWAY.providers, ...(isObj(s.providers) ? s.providers : {}) },
    features,
    last_eval: typeof s.last_eval === "string" ? s.last_eval : null
  };
}

/**
 * Validates a partial update and saves it. Unknown keys are refused. fortune_reword's legacy fields are written back to
 * the 'ai' settings (validated there too: Claude model id, max_tokens 512–2048, limits) BEFORE anything is saved.
 * @param {D1Database} db @param {any} input @param {{features?: Record<string, any>}} [o]
 */
export async function putGateway(db, input, o = {}) {
  if (!isObj(input)) throw bad("settings must be an object");
  const reg = o.features ? { ...FEATURES, ...o.features } : FEATURES;
  const stored = await readSettings(db, SETTINGS_KEY, {});
  const next = { ...stored, features: { ...(isObj(stored.features) ? stored.features : {}) } };
  const cur = await getGateway(db, o);
  let legacyPatch = null;
  for (const [k, v] of Object.entries(input)) {
    switch (k) {
      case "enabled": case "legacyKeyStore":
        if (typeof v !== "boolean") throw bad(`${k} must be boolean`);
        next[k] = v; break;
      case "last_eval":
        if (v !== null && !(typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))) throw bad("last_eval must be null or YYYY-MM-DD");
        next.last_eval = v; break;
      case "providers":
        if (!isObj(v)) throw bad("providers must be an object");
        next.providers = { ...(isObj(stored.providers) ? stored.providers : {}) };
        for (const [p, on] of Object.entries(v)) {
          if (!PROVIDER_IDS.includes(p)) throw bad(`unknown provider ${String(p).slice(0, 20)}`);
          if (typeof on !== "boolean") throw bad("provider flags must be boolean");
          next.providers[p] = on;
        }
        break;
      case "features":
        if (!isObj(v)) throw bad("features must be an object");
        for (const [id, patch] of Object.entries(v)) {
          const meta = reg[id];
          if (!meta) throw bad(`unknown feature ${String(id).slice(0, 30)}`);
          const f = validFeature(id, patch, cur.features[id], meta);
          if (meta.legacy) {
            if (!f.chain.length || f.chain[0].provider !== LEGACY_PROVIDER) throw bad(`features.${id}.chain: the first entry must be anthropic (fortune keeps its Claude settings)`);
            /** @type {Record<string, any>} */
            const lp = {};
            legacyPatch = lp;
            if ("enabled" in patch) lp.enabled = f.enabled;
            if ("chain" in patch) { lp.model = f.chain[0].model; if (f.chain[0].effort) lp.effort = f.chain[0].effort; }
            if ("maxOutputTokens" in patch) lp.max_tokens = f.maxOutputTokens;
            if ("perUserDaily" in patch) lp.per_caller_daily = f.perUserDaily;
            if ("perUserPerMinute" in patch) lp.rpm = f.perUserPerMinute;
            if ("globalPerMinute" in patch) lp.global_rpm = f.globalPerMinute;
            if (f.imageModeAllowed) throw bad(`features.${id}.imageModeAllowed: image mode is not available for this feature`);
            validateAi(lp, await getAiSettings(db)); // throws before anything is written
            next.features[id] = { timeoutMs: f.timeoutMs, monthlyBudgetUsd: f.monthlyBudgetUsd, extraChain: f.chain.slice(1) };
          } else {
            next.features[id] = f;
          }
        }
        break;
      default: throw bad(`unknown setting ${String(k).slice(0, 32)}`);
    }
  }
  if (legacyPatch && Object.keys(legacyPatch).length) await putAiSettings(db, legacyPatch);
  await writeSettings(db, SETTINGS_KEY, next);
  return getGateway(db, o);
}
