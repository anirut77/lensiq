// @ts-check
// backend/src/ai/adapters/index.js — the ONLY place (with its sibling files) that names AI providers: the provider table
// for the consent screen and the admin allowlist, the Worker-secret name of each key, and the adapter registry.
// tools/check-ai-providers.mjs (npm run lint) fails when a provider host / name / SDK appears elsewhere in backend/src.
//
// Keys exist only as Worker secrets (`wrangler secret put <NAME>`); the admin page sees "set / not set" only.
// The legacy AES-GCM key stored in D1 from the admin page (settings.js setApiKey, Anthropic only) is still readable, but
// only when the gateway setting legacyKeyStore is true (owner decision PC-D4: off by default; the Worker secret wins).
// Region / retention texts: docs/PRODUCT-CHECK-DESIGN.md §11 (provider pages read 2026-11-09). They are shown to the
// user BEFORE anything is sent, so they must stay short, plain and in TH / EN / ZH.
import { getApiKey } from "../../settings.js";
import { adapter as anthropic } from "./anthropic.js";

/** @typedef {{th: string, en: string, zh: string}} L3 */
/** @typedef {{id: string, secret: string, name: L3, region: L3, retention: L3, note?: L3}} ProviderInfo */

/** @type {Readonly<Record<string, ProviderInfo>>} */
export const PROVIDERS = Object.freeze({
  anthropic: {
    id: "anthropic", secret: "ANTHROPIC_API_KEY",
    name: { th: "Anthropic (Claude)", en: "Anthropic (Claude)", zh: "Anthropic（Claude）" },
    region: { th: "สหรัฐอเมริกา / ประมวลผลผ่านเครือข่ายทั่วโลกของ Anthropic", en: "USA / Anthropic's global routing", zh: "美国 / Anthropic 全球路由" },
    retention: { th: "ผู้ให้บริการลบข้อมูลภายใน 30 วัน และไม่นำไปฝึกโมเดล", en: "The provider deletes data within 30 days and does not train on it", zh: "服务商在 30 天内删除数据，不用于训练模型" }
  },
  gemini: {
    id: "gemini", secret: "GEMINI_API_KEY",
    name: { th: "Google Gemini", en: "Google Gemini", zh: "Google Gemini" },
    region: { th: "ประเทศใดก็ได้ที่ Google ให้บริการ (ไม่มีการกำหนดประเทศ)", en: "Any country where Google operates (no data residency)", zh: "Google 运营的任意国家（无数据驻留）" },
    retention: { th: "แบบเสียเงิน: ไม่นำไปฝึกโมเดล เก็บบันทึกไว้ช่วงสั้น ๆ", en: "Paid tier: not used for training; logged for a limited period", zh: "付费版：不用于训练，日志保留有限时间" }
  },
  openai: {
    id: "openai", secret: "OPENAI_API_KEY",
    name: { th: "OpenAI", en: "OpenAI", zh: "OpenAI" },
    region: { th: "สหรัฐอเมริกา (ประมวลผล)", en: "USA (processing)", zh: "美国（处理）" },
    retention: { th: "เก็บบันทึกตรวจการใช้งานผิดวัตถุประสงค์ไม่เกิน 30 วัน ไม่นำไปฝึกโมเดล", en: "Abuse-monitoring logs up to 30 days; not used for training", zh: "滥用监测日志最多保留 30 天，不用于训练" }
  },
  dashscope: {
    id: "dashscope", secret: "DASHSCOPE_API_KEY",
    name: { th: "Alibaba Cloud (Qwen)", en: "Alibaba Cloud (Qwen)", zh: "阿里云（通义千问）" },
    region: { th: "สิงคโปร์", en: "Singapore", zh: "新加坡" },
    retention: { th: "ไม่นำไปฝึกโมเดล ยังไม่ระบุระยะเวลาเก็บข้อมูล", en: "Not used for training; retention period not stated", zh: "不用于训练，未说明保留期限" }
  },
  deepseek: {
    id: "deepseek", secret: "DEEPSEEK_API_KEY",
    name: { th: "DeepSeek", en: "DeepSeek", zh: "DeepSeek（深度求索）" },
    region: { th: "สาธารณรัฐประชาชนจีน", en: "People's Republic of China", zh: "中华人民共和国" },
    retention: { th: "เก็บในจีน และอาจนำไปฝึกโมเดล", en: "Stored in China and may be used for training", zh: "存储于中国，可能用于训练" }
  },
  zai: {
    id: "zai", secret: "ZAI_API_KEY",
    name: { th: "Zhipu (GLM)", en: "Zhipu (GLM)", zh: "智谱（GLM）" },
    region: { th: "สิงคโปร์", en: "Singapore", zh: "新加坡" },
    retention: { th: "ตามสัญญาประมวลผลข้อมูล: ไม่เก็บเนื้อหา", en: "Under its data processing agreement: content is not stored", zh: "依数据处理协议：不存储内容" }
  },
  kimi: {
    id: "kimi", secret: "KIMI_API_KEY",
    name: { th: "Moonshot (Kimi)", en: "Moonshot (Kimi)", zh: "月之暗面（Kimi）" },
    region: { th: "ยังไม่ได้ยืนยันสถานที่ประมวลผล", en: "Processing location not verified", zh: "处理地点未核实" },
    retention: { th: "ยังไม่ได้ยืนยันระยะเวลาเก็บข้อมูล", en: "Retention not verified", zh: "保留期限未核实" }
  },
  openrouter: {
    id: "openrouter", secret: "OPENROUTER_API_KEY",
    name: { th: "OpenRouter (ตัวกลาง)", en: "OpenRouter (router)", zh: "OpenRouter（路由）" },
    region: { th: "ขึ้นกับผู้ให้บริการปลายทาง (มีผู้ประมวลผลเพิ่มอีกราย)", en: "Depends on the routed provider (an extra processor)", zh: "取决于转接的服务商（多一个处理方）" },
    retention: { th: "บังคับโหมดไม่เก็บข้อมูลและไม่ให้เก็บข้อมูลทุกครั้ง", en: "Zero retention and no data collection forced on every call", zh: "每次调用强制零保留、不收集数据" }
  }
});
export const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));

/** Adapters implemented so far (P5: Anthropic; P6 adds the others). A provider without an adapter is never used and
 *  never shown on the consent screen. Tests inject mocked adapters through deps.aiAdapters. */
export const ADAPTERS = Object.freeze({ anthropic });

/** The provider request body an adapter would send (review / tests; fortune.js buildRequest). */
export function providerRequestPreview(id, req, entry) {
  const a = /** @type {any} */ (ADAPTERS)[id];
  return a && typeof a.buildBody === "function" ? a.buildBody(req, entry) : null;
}

/** @param {Record<string, any>} [injected] */
export const adaptersWith = injected => ({ ...ADAPTERS, ...(injected || {}) });

/**
 * The key of a provider: the Worker secret first; for Anthropic, the legacy D1-encrypted key only when the gateway
 * setting legacyKeyStore is on. Never logged, never returned to a browser.
 * @param {Env} env @param {string} id @param {{legacyKeyStore?: boolean}} [gw]
 * @returns {Promise<string|null>}
 */
export async function keyFor(env, id, gw = {}) {
  const p = PROVIDERS[id];
  if (!p) return null;
  const v = env[p.secret];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (id === "anthropic" && gw.legacyKeyStore) return getApiKey(env);
  return null;
}

/** "set / not set" per provider for the admin page (never the value). @param {Env} env */
export function keyPresence(env) {
  return Object.fromEntries(PROVIDER_IDS.map(id => [id, !!(typeof env[PROVIDERS[id].secret] === "string" && env[PROVIDERS[id].secret].trim())]));
}

/** Public, secret-free view of a provider for the consent screen. @param {string} id */
export function publicProvider(id) {
  const p = PROVIDERS[id];
  return p ? { name: p.name, region: p.region, retention: p.retention } : null;
}

/** Secret name per provider (admin "how to set": `wrangler secret put <NAME>`). */
export const SECRET_NAMES = Object.freeze(Object.fromEntries(PROVIDER_IDS.map(id => [id, PROVIDERS[id].secret])));
