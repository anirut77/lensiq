// @ts-check
// backend/src/ai/adapters/keycheck.js — does each configured provider key work? (owner tool: tools/ai-key-check.mjs)
//
// One cheap, read-only request per provider: the "list models" endpoint (no tokens are generated, nothing is billed),
// except OpenRouter, whose /models list is public — there /key (the key's own info) is used so the key is really tested.
// The key always travels in a header, never in the URL. The result per provider is ONLY {provider, status:
// "OK" | "FAIL" | "SKIP", http}: no response body, no error message, no key and no part of a key is ever returned.
// Endpoints marked unverified were not called with a real key while writing this (no keys are given to agents).
import { PROVIDERS, PROVIDER_IDS } from "./index.js";

/** @type {Record<string, {url: string, headers: (key: string) => Record<string, string>, verified: boolean}>} */
export const KEYCHECK = {
  anthropic: { url: "https://api.anthropic.com/v1/models?limit=1", headers: k => ({ "x-api-key": k, "anthropic-version": "2023-06-01" }), verified: true },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", headers: k => ({ "x-goog-api-key": k }), verified: true },
  openai: { url: "https://api.openai.com/v1/models", headers: k => ({ Authorization: "Bearer " + k }), verified: true },
  dashscope: { url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models", headers: k => ({ Authorization: "Bearer " + k }), verified: false },
  deepseek: { url: "https://api.deepseek.com/models", headers: k => ({ Authorization: "Bearer " + k }), verified: true },
  zai: { url: "https://api.z.ai/api/paas/v4/models", headers: k => ({ Authorization: "Bearer " + k }), verified: false },
  kimi: { url: "https://api.moonshot.ai/v1/models", headers: k => ({ Authorization: "Bearer " + k }), verified: true },
  openrouter: { url: "https://openrouter.ai/api/v1/key", headers: k => ({ Authorization: "Bearer " + k }), verified: true }
};

/**
 * @param {Record<string, string|undefined>} vars secret name -> value (env and/or backend/.dev.vars)
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{provider: string, secret: string, status: "OK"|"FAIL"|"SKIP", http: number|null, verified: boolean}[]>}
 */
export async function checkKeys(vars, fetchImpl) {
  /** @type {{provider: string, secret: string, status: "OK"|"FAIL"|"SKIP", http: number|null, verified: boolean}[]} */
  const out = [];
  for (const id of PROVIDER_IDS) {
    const secret = PROVIDERS[id].secret;
    const c = KEYCHECK[id];
    const key = String(vars[secret] || "").trim();
    if (!key) { out.push({ provider: id, secret, status: "SKIP", http: null, verified: c.verified }); continue; }
    let http = null, ok = false;
    try {
      /** @type {RequestInit} */
      const init = { method: "GET", headers: c.headers(key), redirect: "manual" };
      try { init.signal = AbortSignal.timeout(15000); } catch { /* older runtime */ }
      const r = await fetchImpl(c.url, init);
      http = r.status;
      ok = r.status >= 200 && r.status < 300;
      try { await r.body?.cancel(); } catch { /* body never read */ }
    } catch { http = null; }
    out.push({ provider: id, secret, status: /** @type {"OK"|"FAIL"} */ (ok ? "OK" : "FAIL"), http, verified: c.verified });
  }
  return out;
}
