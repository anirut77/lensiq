"use strict";
// tests/unit/lensiq-ai.test.js — round 17 P5 fixed test set: browser helper lensiq-ai.js (consent screen data, remembered
// consent with withdrawal, fallback messages in TH / EN / ZH, mode choice). Pure functions; no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const AI = require("../../lensiq-ai.js");

const INFO = {
  feature: "pc_fields", enabled: true, imageModeAllowed: true, stores: false,
  chain: [
    {
      provider: "anthropic", model: "claude-haiku-5-5", name: { th: "Anthropic", en: "Anthropic", zh: "Anthropic" },
      region: { th: "สหรัฐฯ", en: "USA (global routing)", zh: "美国" }, retention: { th: "ลบภายใน 30 วัน", en: "Deleted within 30 days", zh: "30 天内删除" }
    },
    {
      provider: "gemini", model: "gemini-3.5-flash-lite", name: { th: "Google Gemini", en: "Google Gemini", zh: "Google Gemini" },
      region: { th: "ไม่ระบุประเทศ", en: "Any country", zh: "任意国家" }, retention: { th: "x", en: "x", zh: "x" }
    }
  ]
};

/** In-memory localStorage stand-in. */
function store(throwing) {
  const m = new Map();
  return {
    getItem: k => { if (throwing) throw new Error("blocked"); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (throwing) throw new Error("blocked"); m.set(k, String(v)); },
    removeItem: k => { if (throwing) throw new Error("blocked"); m.delete(k); },
    m
  };
}

test("every string exists in TH, EN and ZH", () => {
  const th = Object.keys(AI.STR.th).sort();
  assert.deepEqual(Object.keys(AI.STR.en).sort(), th);
  assert.deepEqual(Object.keys(AI.STR.zh).sort(), th);
  for (const l of ["th", "en", "zh"]) for (const k of th) assert.ok(AI.STR[l][k].trim().length > 1, `${l}.${k}`);
});

test("consent screen text names the provider actually used, the model and where data is processed", () => {
  for (const lang of ["th", "en", "zh"]) {
    const v = AI.consentView(INFO, lang, "text");
    assert.equal(v.provider, INFO.chain[0].name[lang]);
    assert.equal(v.model, "claude-haiku-5-5");
    assert.equal(v.region, INFO.chain[0].region[lang]);
    assert.equal(v.retention, INFO.chain[0].retention[lang]);
    assert.deepEqual(v.fallbacks, [INFO.chain[1].name[lang] + " (" + INFO.chain[1].region[lang] + ")"]);
    assert.equal(v.sends, AI.STR[lang].sendsText);
    assert.equal(v.stores, AI.STR[lang].storesNothing);
  }
  assert.equal(AI.consentView(INFO, "en", "image").sends, AI.STR.en.sendsImage);
  assert.equal(AI.consentView(INFO, "xx", "text").provider, "Anthropic", "unknown language -> Thai");
});

test("mode choice: text only is the default and the fallback; image only when the feature allows it", () => {
  assert.deepEqual(AI.modes(INFO), ["text", "image"]);
  assert.deepEqual(AI.modes({ ...INFO, imageModeAllowed: false }), ["text"]);
  assert.equal(AI.pickMode(INFO, "image"), "image");
  assert.equal(AI.pickMode({ ...INFO, imageModeAllowed: false }, "image"), "text");
  assert.equal(AI.pickMode(INFO, undefined), "text");
});

test("remember my choice: stored per feature + chain; a changed chain asks again; withdraw removes it; blocked storage is safe", () => {
  const s = store();
  assert.equal(AI.rememberedConsent(s, INFO), null);
  AI.saveConsent(s, INFO, "image", true);
  const c = AI.rememberedConsent(s, INFO);
  assert.deepEqual([c.mode, c.providers], ["image", ["anthropic", "gemini"]]);
  assert.equal(AI.rememberedConsent(s, { ...INFO, chain: [INFO.chain[1]] }), null, "different providers -> ask again");
  assert.equal(AI.rememberedConsent(s, { ...INFO, imageModeAllowed: false }).mode, "text", "image no longer allowed -> text");
  assert.equal(AI.withdraw(s, "pc_fields"), true);
  assert.equal(AI.rememberedConsent(s, INFO), null);
  AI.saveConsent(s, INFO, "text", false);
  assert.equal(AI.rememberedConsent(s, INFO), null, "not remembered when the box is unticked");
  const bad = store(true);
  assert.doesNotThrow(() => AI.saveConsent(bad, INFO, "text", true));
  assert.equal(AI.rememberedConsent(bad, INFO), null);
  assert.equal(AI.withdraw(bad, "pc_fields"), false);
  assert.equal(AI.rememberedConsent(null, INFO), null, "no storage at all");
});

test("request body carries consent + the providers shown; fallback reasons have TH/EN/ZH messages", () => {
  const b = AI.requestBody(INFO, "text", { text: "x" });
  assert.deepEqual(b, { consent: true, providers: ["anthropic", "gemini"], mode: "text", input: { text: "x" } });
  for (const lang of ["th", "en", "zh"]) {
    assert.equal(AI.fallbackMessage("budget", lang), AI.STR[lang].fbBudget);
    const reasons = ["limit", "disabled", "consent_required", "provider_error", "invalid_output", "content_policy", "turnstile", "member_required", "network", "whatever"];
    for (const r of reasons) assert.ok(AI.fallbackMessage(r, lang).length > 5, r);
  }
  assert.match(AI.STR.en.fbBudget, /on-device result only/);
  assert.match(AI.STR.th.fbBudget, /ในเครื่อง/);
  assert.equal(AI.checkedBy({ providerName: { en: "Anthropic" }, regionText: { en: "USA" } }, "en"), AI.STR.en.checkedBy.replace("{provider}", "Anthropic").replace("{region}", "USA"));
});

test("lensiq-ai.js: uses LQApi (CSP connect-src unchanged), wired into typecheck and eslint like other lensiq-*.js", () => {
  const src = readFileSync(join(ROOT, "lensiq-ai.js"), "utf8");
  assert.match(src, /LQApi/);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "")), "no hard-coded hosts");
  assert.match(src, /\/v1\/ai\/providers\?feature=/);
  const ts = JSON.parse(readFileSync(join(ROOT, "tsconfig.typecheck.json"), "utf8"));
  assert.ok(ts.files.includes("lensiq-ai.js"));
  assert.match(readFileSync(join(ROOT, "eslint.config.mjs"), "utf8"), /"LQAI"/);
});
