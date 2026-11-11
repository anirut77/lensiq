// @ts-check
// backend/src/ai/adapters/keycheck.js — does each configured provider key work? (owner tool: tools/ai-key-check.mjs)
//
// One cheap request per provider that generates no text and bills nothing: the "list models" endpoint, except
//   - OpenRouter: its /models list is public, so /key (the key's own info) is used and the key is really tested;
//   - z.ai: no list-models endpoint is documented (API reference and openapi.json read 2026-11-10), so the documented
//     tokenizer (POST /paas/v4/tokenizer, counts tokens of a one-word message; billing not stated) is used;
//   - DashScope (Alibaba Model Studio, Singapore): GET /api/v1/models on the workspace host
//     https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com (docs updated 2026-11-06). The workspace id comes from
//     DASHSCOPE_WORKSPACE_ID; without it the check FAILS without sending anything (note says why).
// Endpoint sources (read 2026-11-10, no key used): docs/AI-GATEWAY.md §3a. The key always travels in a header, never in
// the URL or the body. The result per provider is ONLY {provider, secret, status: "OK" | "FAIL" | "SKIP", http,
// verified, note?}: no response body, no error message, no key and no part of a key is ever returned.
import { WS_RE } from "./dashscope.js";
import { PROVIDERS, PROVIDER_IDS } from "./index.js";

/** @typedef {{url: string | ((vars: Record<string, string|undefined>) => string|null), method?: "GET"|"POST", body?: any,
 *    headers: (key: string) => Record<string, string>, verified: boolean, needs?: string}} Check */
/** @type {Record<string, Check>} */
export const KEYCHECK = {
  anthropic: { url: "https://api.anthropic.com/v1/models?limit=1", headers: k => ({ "x-api-key": k, "anthropic-version": "2023-06-01" }), verified: true },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", headers: k => ({ "x-goog-api-key": k }), verified: true },
  openai: { url: "https://api.openai.com/v1/models", headers: k => ({ Authorization: "Bearer " + k }), verified: true },
  dashscope: {
    url: v => { const ws = String(v.DASHSCOPE_WORKSPACE_ID || "").trim(); return WS_RE.test(ws) ? `https://${ws}.ap-southeast-1.maas.aliyuncs.com/api/v1/models?page_size=1` : null; },
    headers: k => ({ Authorization: "Bearer " + k }), verified: true, needs: "DASHSCOPE_WORKSPACE_ID"
  },
  deepseek: { url: "https://api.deepseek.com/models", headers: k => ({ Authorization: "Bearer " + k }), verified: true },
  zai: {
    url: "https://api.z.ai/api/paas/v4/tokenizer", method: "POST", body: { model: "glm-4.6v", messages: [{ role: "user", content: "ok" }] },
    headers: k => ({ Authorization: "Bearer " + k, "Content-Type": "application/json" }), verified: true
  },
  kimi: { url: "https://api.moonshot.ai/v1/models", headers: k => ({ Authorization: "Bearer " + k }), verified: true },
  openrouter: { url: "https://openrouter.ai/api/v1/key", headers: k => ({ Authorization: "Bearer " + k }), verified: true }
};

/** @typedef {{provider: string, secret: string, status: "OK"|"FAIL"|"SKIP", http: number|null, verified: boolean, note?: string}} Row */

/**
 * @param {Record<string, string|undefined>} vars secret name -> value (env and/or backend/.dev.vars), plus
 *   DASHSCOPE_WORKSPACE_ID (not a secret)
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<Row[]>}
 */
export async function checkKeys(vars, fetchImpl) {
  /** @type {Row[]} */
  const out = [];
  for (const id of PROVIDER_IDS) {
    const secret = PROVIDERS[id].secret;
    const c = KEYCHECK[id];
    const key = String(vars[secret] || "").trim();
    if (!key) { out.push({ provider: id, secret, status: "SKIP", http: null, verified: c.verified }); continue; }
    const url = typeof c.url === "function" ? c.url(vars) : c.url;
    if (!url) { out.push({ provider: id, secret, status: "FAIL", http: null, verified: c.verified, note: (c.needs || "configuration") + " not set" }); continue; }
    let http = null, ok = false;
    try {
      /** @type {RequestInit} */
      const init = { method: c.method || "GET", headers: c.headers(key), redirect: "manual" };
      if (c.body) init.body = JSON.stringify(c.body);
      try { init.signal = AbortSignal.timeout(15000); } catch { /* older runtime */ }
      const r = await fetchImpl(url, init);
      http = r.status;
      ok = r.status >= 200 && r.status < 300;
      try { await r.body?.cancel(); } catch { /* body never read */ }
    } catch { http = null; }
    out.push({ provider: id, secret, status: /** @type {"OK"|"FAIL"} */ (ok ? "OK" : "FAIL"), http, verified: c.verified });
  }
  return out;
}

// ---- admin panel key management (ai/keystore.js; owner spec 2026-11-11) ---------------------------------------------
/** Accepted key shapes. Only characters providers use in keys; documented prefixes where a provider has one. */
export const KEY_CHARS = /^[A-Za-z0-9._-]+$/;
/** @type {Record<string, RegExp>} */
export const KEY_SHAPES = Object.freeze({
  anthropic: /^sk-ant-[A-Za-z0-9_-]{20,200}$/,
  openrouter: /^sk-or-v1-[A-Za-z0-9]{20,200}$/,
  gemini: /^AIza[A-Za-z0-9_-]{30,60}$/,
  // generic "sk-" shapes refuse the documented prefixes of other providers (an Anthropic or OpenRouter key pasted in
  // the wrong row would otherwise be sent to this provider)
  openai: /^sk-(?!ant-|or-)[A-Za-z0-9_-]{20,250}$/,
  deepseek: /^sk-(?!ant-|or-)[A-Za-z0-9]{20,100}$/,
  kimi: /^sk-(?!ant-|or-)[A-Za-z0-9]{20,100}$/,
  dashscope: /^sk-(?!ant-|or-)[A-Za-z0-9]{20,100}$/,
  zai: /^[A-Za-z0-9]{16,80}\.[A-Za-z0-9]{8,80}$/
});
/** Providers whose key check is documented as billing nothing (keycheck.js); others are not tested from the panel. */
export const PANEL_TESTABLE = Object.freeze(PROVIDER_IDS.filter(id => id !== "zai"));
/** Variables for checkKeys() testing ONE provider with `key`, plus the non-secret settings its check needs.
 *  @param {Record<string, any>} env @param {string} id @param {string} key */
export function checkVars(env, id, key) {
  return { [PROVIDERS[id].secret]: key, DASHSCOPE_WORKSPACE_ID: env.DASHSCOPE_WORKSPACE_ID };
}
