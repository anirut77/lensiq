// @ts-check
// backend/src/ai/adapters/index.js — the ONLY place (with its sibling files) that names AI providers: the provider table
// for the consent screen and the admin allowlist, the Worker-secret name of each key, the adapter registry and the
// default chains. tools/check-ai-providers.mjs (npm run lint) fails when a provider host / name / SDK appears elsewhere
// in backend/src.
//
// Keys exist only as Worker secrets (`wrangler secret put <NAME>`); the admin page sees "set / not set" only.
// The legacy AES-GCM key stored in D1 from the admin page (settings.js setApiKey, Anthropic only) is still readable, but
// only when the gateway setting legacyKeyStore is true (owner decision PC-D4: off by default; the Worker secret wins).
// Region / retention texts: provider terms re-read 2026-11-10 (P6; URLs in docs/AI-GATEWAY.md §3b). They are shown to
// the user BEFORE anything is sent, so they must stay short, plain and in TH / EN / ZH.
import { getApiKey } from "../../settings.js";
import { adapter as anthropic } from "./anthropic.js";
import { adapter as dashscope, validWorkspaceId } from "./dashscope.js";
import { adapter as deepseek } from "./deepseek.js";
import { adapter as gemini } from "./gemini.js";
import { adapter as kimi } from "./kimi.js";
import { adapter as openai } from "./openai.js";
import { adapter as openrouter } from "./openrouter.js";
import { adapter as zai } from "./zai.js";

/** @typedef {{th: string, en: string, zh: string}} L3 */
/** @typedef {{id: string, secret: string, name: L3, region: L3, retention: L3, note?: L3, config?: string[]}} ProviderInfo */

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
    retention: { th: "แบบเสียเงิน: ไม่นำไปฝึกโมเดล เก็บบันทึกไว้ช่วงสั้น ๆ", en: "Paid tier: not used for training; logged for a limited period", zh: "付费版：不用于训练，日志保留有限时间" },
    note: {
      th: "ใช้คีย์แบบเสียเงิน (paid tier) เท่านั้น: แบบฟรีอาจนำข้อมูลไปพัฒนาโมเดลและให้คนอ่านได้ ระบบจะปฏิเสธคีย์ที่ติดโควตาแบบฟรี ผู้ใช้ต้องอายุ 18 ปีขึ้นไปตามเงื่อนไขของ Google",
      en: "Paid tier keys only: the free tier may use data to improve Google's products and allows human review. A key that hits a free-tier quota is refused. Google's terms require users aged 18+",
      zh: "仅限付费版密钥：免费版可能将数据用于改进 Google 产品并允许人工审阅。触发免费版配额的密钥会被拒绝。Google 条款要求用户年满 18 岁"
    }
  },
  openai: {
    id: "openai", secret: "OPENAI_API_KEY",
    name: { th: "OpenAI", en: "OpenAI", zh: "OpenAI" },
    region: { th: "สหรัฐอเมริกา (ระบบของ OpenAI ไม่ได้เลือกประมวลผลในภูมิภาค)", en: "USA (OpenAI's infrastructure; no regional processing chosen)", zh: "美国（OpenAI 基础设施，未选择区域处理）" },
    retention: { th: "เก็บบันทึกตรวจการใช้งานผิดวัตถุประสงค์ไม่เกิน 30 วัน ไม่นำไปฝึกโมเดล", en: "Abuse-monitoring logs up to 30 days; not used for training", zh: "滥用监测日志最多保留 30 天，不用于训练" }
  },
  dashscope: {
    id: "dashscope", secret: "DASHSCOPE_API_KEY", config: ["DASHSCOPE_WORKSPACE_ID"],
    name: { th: "Alibaba Cloud (Qwen)", en: "Alibaba Cloud (Qwen)", zh: "阿里云（通义千问）" },
    region: { th: "สิงคโปร์", en: "Singapore", zh: "新加坡" },
    retention: { th: "ไม่นำไปฝึกโมเดล ผู้ให้บริการไม่ได้ระบุระยะเวลาเก็บข้อมูล", en: "Not used for training; the provider does not state the retention period", zh: "不用于训练，服务商未说明保留期限" },
    note: {
      th: "ต้องตั้งค่า DASHSCOPE_WORKSPACE_ID (รหัส workspace สิงคโปร์ ไม่ใช่ความลับ) ด้วย ถ้าไม่ตั้งจะไม่ถูกเรียกใช้",
      en: "Also set DASHSCOPE_WORKSPACE_ID (the Singapore workspace id, not a secret); without it this provider is not used",
      zh: "还需设置 DASHSCOPE_WORKSPACE_ID（新加坡工作空间 ID，非密钥）；未设置时不会使用此服务商"
    }
  },
  deepseek: {
    id: "deepseek", secret: "DEEPSEEK_API_KEY",
    name: { th: "DeepSeek", en: "DeepSeek", zh: "DeepSeek（深度求索）" },
    region: { th: "สาธารณรัฐประชาชนจีน", en: "People's Republic of China", zh: "中华人民共和国" },
    retention: { th: "ข้อมูลเก็บไว้ในจีน และอาจนำไปฝึกโมเดล", en: "Data is stored in the People's Republic of China and may be used for training", zh: "数据存储于中国，可能用于训练模型" },
    note: {
      th: "ความเสี่ยง PDPA สูงสุด: เก็บข้อมูลในจีนและอาจนำไปฝึกโมเดล ต้องให้ทนายตรวจก่อนเริ่มเก็บเงิน (L5)",
      en: "Highest PDPA risk: data stored in the PRC and may be used for training; counsel must review before charging (L5)",
      zh: "PDPA 风险最高：数据存于中国且可能用于训练；开始收费前须经律师审查（L5）"
    }
  },
  zai: {
    id: "zai", secret: "ZAI_API_KEY",
    name: { th: "Zhipu (GLM)", en: "Zhipu (GLM)", zh: "智谱（GLM）" },
    region: { th: "สิงคโปร์", en: "Singapore", zh: "新加坡" },
    retention: {
      th: "ตามสัญญาประมวลผลข้อมูล: ไม่เก็บเนื้อหา ผู้ให้บริการไม่ได้ระบุว่าจะนำเนื้อหาจาก API ไปฝึกโมเดลหรือไม่",
      en: "Under its data processing agreement: content is not stored; training on API content not stated by the provider",
      zh: "依数据处理协议：不存储内容；服务商未说明是否用 API 内容训练模型"
    }
  },
  kimi: {
    id: "kimi", secret: "KIMI_API_KEY",
    name: { th: "Moonshot (Kimi)", en: "Moonshot (Kimi)", zh: "月之暗面（Kimi）" },
    region: { th: "สิงคโปร์ (เซิร์ฟเวอร์ของผู้ให้บริการ)", en: "Singapore (the provider's servers)", zh: "新加坡（服务商服务器）" },
    retention: {
      th: "เก็บไว้ตลอดที่บัญชียังใช้งาน และนโยบายอนุญาตให้นำข้อมูลไปพัฒนาโมเดล",
      en: "Kept while the account is active; its policy allows using inputs to improve models",
      zh: "账户有效期间保留；其政策允许将输入用于改进模型"
    },
    note: {
      th: "ราคายังไม่ได้ยืนยันจากหน้าราคาของผู้ให้บริการ: งบประมาณจองด้วยราคาสูงแบบระมัดระวัง",
      en: "Price not confirmed on the provider's own page: the budget reserves at a conservative high price",
      zh: "价格未在服务商官方页面确认：预算按保守高价预留"
    }
  },
  openrouter: {
    id: "openrouter", secret: "OPENROUTER_API_KEY",
    name: { th: "OpenRouter (ตัวกลาง: ผู้ประมวลผลรายที่สอง)", en: "OpenRouter (router: a second processor)", zh: "OpenRouter（路由：第二个处理方）" },
    region: {
      th: "ผ่าน OpenRouter แล้วไปยังประเทศของผู้ให้บริการปลายทาง (มีผู้ประมวลผลสองราย)",
      en: "Through OpenRouter, then the routed provider's country (two processors)",
      zh: "经 OpenRouter 转至目标服务商所在国家（两个处理方）"
    },
    retention: {
      th: "บังคับโหมดไม่เก็บข้อมูลและไม่ให้เก็บข้อมูลทุกครั้ง OpenRouter เก็บเฉพาะข้อมูลการใช้งาน (ไม่เก็บเนื้อหา)",
      en: "Zero retention and no data collection forced on every call; OpenRouter keeps usage metadata only (no content)",
      zh: "每次调用强制零保留、不收集数据；OpenRouter 仅保留用量元数据（不含内容）"
    },
    note: {
      th: "เพิ่มผู้ประมวลผลรายที่สองระหว่าง LENSIQ กับผู้ให้บริการโมเดล หน้าผลตรวจแสดงผู้ให้บริการปลายทางที่ใช้จริง ราคาจองด้วยเพดานแบบระมัดระวังและส่งเป็นราคาสูงสุดที่ยอมรับ" +
        " โมเดลนอกลำดับเริ่มต้น (ผลทดสอบ P8, 10 พ.ย. 2569): Qwen 3.8 และ DeepSeek v4.1 flash ตอบช้า (ค่ากลาง 7 ถึง 15 วินาที) และคำตอบมักถูกตัดที่เพดาน 1,500 โทเคน" +
        " จึงไม่เหมาะกับการอ่านช่องข้อมูลบนฉลาก ส่วน GLM 5.3 flash เป็นตัวเลือกสำหรับฉลากภาษาจีน (เฉพาะงานแปล)",
      en: "Adds a second processor between LENSIQ and the model provider. The result card names the routed provider. Prices reserve at a conservative ceiling," +
        " also sent as the maximum accepted price." +
        " Models outside the default order (P8 results, 2026-11-10): Qwen 3.8 and DeepSeek v4.1 flash answer slowly (median 7 to 15 s) and their answers are often cut at" +
        " the 1,500-token output cap, so they do not suit label-field reading; GLM 5.3 flash is the option for Chinese labels (translation only)",
      zh: "在 LENSIQ 与模型服务商之间增加第二个处理方。结果卡显示实际转接的服务商。预算按保守上限预留，并作为可接受的最高价格发送。" +
        "默认顺序之外的模型（P8 测试结果，2026-11-10）：Qwen 3.8 与 DeepSeek v4.1 flash 响应较慢（中位数 7 至 15 秒），回答常在 1,500 token 输出上限处被截断，" +
        "不适合读取标签字段；GLM 5.3 flash 是中文标签的可选模型（仅用于翻译）"
    }
  }
});
export const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));

/** Every provider has its adapter (P5: Anthropic; P6: the others). Tests inject mocked adapters through deps.aiAdapters. */
export const ADAPTERS = Object.freeze({ anthropic, gemini, openai, dashscope, deepseek, zai, kimi, openrouter });

/** Providers whose API terms say API data is not used for training (terms re-read 2026-11-10; Gemini: paid tier only).
 *  z.ai (training on API content not stated), Kimi and DeepSeek (policy allows training) and OpenRouter (depends on
 *  the routed provider, although zdr + data_collection deny are forced) are not on this list. */
export const NO_TRAINING = Object.freeze(["anthropic", "gemini", "openai", "dashscope"]);

/**
 * Default chains for new installs (P6; design §10.3 / §10.7). Until the P8 eval measures accuracy, the rule is:
 * provider does not train on API data (NO_TRAINING), price verified on the provider's own page, native JSON-schema
 * output preferred, cheapest first, then a different company as fallback. Admin decides (PC-D2: every provider is
 * allowed; any chain can be edited). New features stay OFF with budget 0, so nothing runs until the owner acts.
 *   pc_fields (label fields; image or text): Claude Haiku 5.5 (0.10 / 0.50) -> GPT-6 Luna (0.10 / 0.50) ->
 *     Qwen3-VL-Plus (0.20 / 1.60, JSON object mode only). All read images.
 *   pc_claims (over-claim classifier, a wrong flag can harm a brand: quality first): Claude Sonnet 5.5 (2 / 10) ->
 *     GPT-6.1 Terra (1 / 5) -> Qwen3.7-Plus (0.50 / 2.00, JSON object mode only).
 *   pc_translate (label translation, CJK / Thai): Claude Haiku 5.5 -> GPT-6 Luna -> Qwen3.7-Plus (0.50 / 2.00).
 * GEMINI_HELD (owner pending, 2026-11-10): Google's terms require users 18+ and forbid apps likely to be used by
 * under-18s; until the owner / counsel decide (L2), Gemini is not in any Product Check default chain (the public
 * medicine page). The admin can still add it to any chain.
 * fortune_reword is not touched (its first entry stays the Anthropic settings of the "AI settings" tab).
 */
export const GEMINI_HELD = Object.freeze(["pc_fields", "pc_claims", "pc_translate"]);
export const DEFAULT_CHAINS = Object.freeze({
  pc_fields: Object.freeze([
    { provider: "anthropic", model: "claude-haiku-5-5", effort: "low" }, { provider: "openai", model: "gpt-6-luna" },
    { provider: "dashscope", model: "qwen3-vl-plus" }
  ]),
  pc_claims: Object.freeze([
    { provider: "anthropic", model: "claude-sonnet-5-5", effort: "low" }, { provider: "openai", model: "gpt-6.1-terra" },
    { provider: "dashscope", model: "qwen3.7-plus" }
  ]),
  pc_translate: Object.freeze([
    { provider: "anthropic", model: "claude-haiku-5-5", effort: "low" }, { provider: "openai", model: "gpt-6-luna" },
    { provider: "dashscope", model: "qwen3.7-plus" }
  ])
});

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

/** @param {any} v */
const setStr = v => typeof v === "string" && !!v.trim();

/** Non-secret provider configuration passed to the adapter (DashScope: the Singapore workspace id). @param {Env} env @param {string} id */
export function providerConfig(env, id) {
  const e = /** @type {Record<string, any>} */ (env);
  if (id === "dashscope") return { workspaceId: setStr(e.DASHSCOPE_WORKSPACE_ID) ? String(e.DASHSCOPE_WORKSPACE_ID).trim() : null };
  // deploy B6: pin each router model to the serving provider named on the consent screen (openrouter.js ROUTES)
  if (id === "openrouter") return { pinRoutes: String(e.AI_ROUTE_PIN || "").trim().toLowerCase() === "required" };
  return {};
}

/** Validators of the non-secret settings (review fix P6-2): the SAME check the adapter uses to build its URL, so a
 *  malformed value means "not ready", never "configured". */
const CONFIG_VALID = Object.freeze({ DASHSCOPE_WORKSPACE_ID: validWorkspaceId });

/** State of each required non-secret setting: "set" | "missing" | "invalid". @param {Env} env @param {string} id
 *  @returns {Record<string, "set"|"missing"|"invalid">} */
export function configState(env, id) {
  const p = PROVIDERS[id];
  const e = /** @type {Record<string, any>} */ (env);
  /** @type {Record<string, "set"|"missing"|"invalid">} */
  const out = {};
  for (const n of (p && p.config) || []) {
    const ok = /** @type {Record<string, (v: any) => boolean>} */ (CONFIG_VALID)[n];
    out[n] = !setStr(e[n]) ? "missing" : ok && !ok(e[n]) ? "invalid" : "set";
  }
  return out;
}

/** Every required non-secret setting of a provider is present AND valid (a provider that is not ready is never
 *  offered or called). @param {Env} env @param {string} id */
export function providerReady(env, id) {
  return !!PROVIDERS[id] && Object.values(configState(env, id)).every(s => s === "set");
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
