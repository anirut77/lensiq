"use strict";
// tests/unit/pc-ai.test.js — round 17 P7 fixed test set: the pure parts of lensiq-pc-ai.js (mode decision with the
// patient-name guard, claims agreement, translation target, registration agreement) and the ONE-screen consent data of
// lensiq-ai.js groupInfo (provider / model / country named per feature). Synthetic data; no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const PCAI = require("../../lensiq-pc-ai.js");
const AI = require("../../lensiq-ai.js");
const G = require("../../lensiq-pc-guard.js");

const prov = (provider, model, en, region) => ({ provider, model, name: { th: en, en, zh: en }, region: { th: region, en: region, zh: region }, retention: { th: "r", en: "r", zh: "r" } });
const INFOS = [
  { feature: "pc_fields", enabled: true, imageModeAllowed: true, chain: [prov("anthropic", "claude-haiku-5-5", "Anthropic", "USA"), prov("openai", "gpt-6-luna", "OpenAI", "USA")] },
  { feature: "pc_claims", enabled: true, imageModeAllowed: false, chain: [prov("anthropic", "claude-sonnet-5-5", "Anthropic", "USA"), prov("dashscope", "qwen3.7-plus", "Alibaba Cloud",
    "Singapore")] },
  { feature: "pc_translate", enabled: false, imageModeAllowed: false, chain: [prov("openai", "gpt-6-luna", "OpenAI", "USA")] }
];

test("decide(): text is the default; image only for pc_fields when chosen; personal data OR a dispensing label blocks the photo and offers text only", () => {
  const clean = "PARACETAMOL 500 mg 1A 844/39", pii = "ชื่อผู้ป่วย: สมมติ ใจทดสอบ\nPARACETAMOL 500 mg", disp = "ร้านยาสาธิต\nสมพร ใจสมมติ\nรับประทานครั้งละ 1 เม็ด";
  const f = ["pc_fields", "pc_claims"];
  assert.deepEqual(PCAI.decide({ mode: "text", image: G.imageCheck(clean), features: f }), { send: "text" });
  assert.deepEqual(PCAI.decide({ mode: "image", image: G.imageCheck(clean), features: f }), { send: "image" });
  assert.deepEqual(PCAI.decide({ mode: "image", image: G.imageCheck(pii), features: f }), { offer: "text" });
  assert.deepEqual(PCAI.decide({ mode: "image", image: G.imageCheck(disp), features: f }), { offer: "text" }, "dispensing label with a bare name");
  assert.equal(G.imageCheck(disp).dispensing, true, "a dispensing label blocks the photo whatever was found");
  assert.deepEqual(PCAI.decide({ mode: "image", image: undefined, features: f }), { offer: "text" }, "no check result: no photo");
  assert.deepEqual(PCAI.decide({ mode: "text", image: G.imageCheck(pii), features: f }), { send: "text" }, "text mode sends the redacted text");
  assert.deepEqual(PCAI.decide({ mode: "image", image: G.imageCheck(clean), features: ["pc_claims"] }), { send: "text" }, "no image without pc_fields");
  const r = G.redact(pii);
  assert.ok(!r.text.includes("สมมติ") && r.text.includes(G.PLACEHOLDER));
});

test("agreement(): AI signals vs on-device LQClaims hits — both / AI only / device only, by rule id", () => {
  const a = PCAI.agreement([{ rule_id: "D01" }, { rule_id: "F04" }, { rule_id: "D01" }], [{ rule_id: "D01" }, { rule_id: "D02" }]);
  assert.deepEqual(a, { both: ["D01"], aiOnly: ["F04"], deviceOnly: ["D02"] });
  assert.deepEqual(PCAI.agreement([], []), { both: [], aiOnly: [], deviceOnly: [] });
});

test("translateTarget(): CJK / Korean / Latin labels are translated into the page language; a label already in it is not", () => {
  assert.equal(PCAI.translateTarget("布洛芬缓释胶囊 每日两次", "th"), "th");
  assert.equal(PCAI.translateTarget("식품의약품안전처 허가", "th"), "th");
  assert.equal(PCAI.translateTarget("Ibuprofen tablets, take with food", "th"), "th");
  assert.equal(PCAI.translateTarget("ยาแก้ปวด ลดไข้ PARA", "th"), null);
  assert.equal(PCAI.translateTarget("Ibuprofen tablets, take with food", "en"), null);
  assert.equal(PCAI.translateTarget("布洛芬缓释胶囊", "zh"), null);
  assert.equal(PCAI.translateTarget("ビタミンC 配合", "zh"), "zh", "Japanese on a Chinese page");
  assert.equal(PCAI.translateTarget("12 3", "th"), null, "too little text");
});

test("regAgree(): an AI registration number is compared with the on-device numbers (spacing / dashes ignored)", () => {
  const r = PCAI.regAgree([{ number: "1A844/39", source: "ocr" }, { number: "2A 1/60", source: "model" }], ["1A 844/39"]);
  assert.deepEqual(r.map(x => x.agree), [true, false]);
});

test("groupInfo(): ONE consent screen names the provider, model and processing country used for EACH switched-on feature", () => {
  const g = AI.groupInfo("pc", INFOS, PCAI.LABELS);
  assert.deepEqual(g.features, ["pc_fields", "pc_claims"], "a switched-off feature is not on the screen");
  assert.equal(g.imageModeAllowed, true);
  assert.deepEqual(g.chain.map(c => c.provider + "|" + c.model), ["anthropic|claude-haiku-5-5", "openai|gpt-6-luna", "anthropic|claude-sonnet-5-5", "dashscope|qwen3.7-plus"]);
  for (const l of ["th", "en", "zh"]) {
    const v = AI.consentView(g, l, "image");
    assert.equal(v.parts.length, 2);
    assert.equal(v.parts[0].label, PCAI.LABELS.pc_fields[l]);
    assert.match(v.parts[0].text, /Anthropic.*claude-haiku-5-5.*USA/);
    assert.match(v.parts[1].text, /Anthropic.*claude-sonnet-5-5.*USA/);
    assert.ok(v.retentions.some(x => /Alibaba Cloud/.test(x)), "retention of every provider that may receive data");
    assert.equal(v.sends, AI.STR[l].sendsImage);
  }
  assert.match(AI.STR.en.modeImage, /faces blurred first/); assert.match(AI.STR.th.modeImage, /เบลอใบหน้า/); assert.match(AI.STR.zh.modeImage, /模糊人脸/);
  const body = AI.requestBody(g, "text", { text: "x", images: [{}] });
  assert.deepEqual(body.providers, ["anthropic", "openai", "dashscope"], "unique providers the user saw");
  assert.equal(body.input.images, undefined, "text mode never carries an image");
  const none = AI.groupInfo("pc", [{ ...INFOS[2] }], PCAI.LABELS);
  assert.equal(none.enabled, false, "nothing switched on: no screen, nothing sent");
  // remember + withdraw work on the group id
  const m = new Map(), s = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  AI.saveConsent(s, g, "image", true);
  assert.equal(AI.rememberedConsent(s, g).mode, "image");
  assert.equal(AI.rememberedConsent(s, AI.groupInfo("pc", [INFOS[0], { ...INFOS[1], chain: [prov("deepseek", "deepseek-flash", "DeepSeek", "China")] }], PCAI.LABELS)), null,
    "a provider not on the accepted screen -> ask again");
  AI.withdraw(s, "pc");
  assert.equal(AI.rememberedConsent(s, g), null);
});

test("gateNote() / captureFacts(): the notice per refusal reason; the page hands the guard its decoded barcodes and parsed registration numbers", () => {
  assert.equal(PCAI.gateNote("ok"), ""); assert.equal(PCAI.gateNote("dispensing"), "dispOff");
  assert.equal(PCAI.gateNote("personal-doc"), "personalDoc"); assert.equal(PCAI.gateNote("no-product"), "noProduct");
  const P = { barcodeInfo: (raw, format) => ({ gtin: /^\d+$/.test(raw) ? raw : "", gtinValid: raw === "8850006939727", format }),
    findRegNumbers: t => (/1A 844\/39/.test(t) ? [{ norm: "1A 844/39", ok: true, note: "" }, { norm: "A 1/22", ok: true, note: "uncertain" }] : []) };
  const f = PCAI.captureFacts(P, "TESTOL\nเลขทะเบียน 1A 844/39", [{ rawValue: "8850006939727", format: "ean_13" },
    { rawValue: "8850006939720", format: "ean_13" }, { rawValue: "https://x.test", format: "qr_code" }]);
  assert.deepEqual(f, { gtins: ["8850006939727"], regs: ["1A 844/39"] }, "only valid barcodes; uncertain shapes are not evidence");
  assert.deepEqual(PCAI.captureFacts(null, "x", null), { gtins: [], regs: [] });
  // the same decision for both modes: decided before any mode is known
  assert.equal(G.aiGate("น้ำดื่ม 600 มล.", PCAI.captureFacts(P, "น้ำดื่ม 600 มล.", [{ rawValue: "8850006939727", format: "ean_13" }])).allow, true);
  assert.equal(G.aiGate("น้ำดื่ม 600 มล.", PCAI.captureFacts(P, "น้ำดื่ม 600 มล.", [])).reason, "no-product");
  const src = readFileSync(join(ROOT, "lensiq-pc-ai.js"), "utf8");
  assert.ok(src.indexOf("const g0 = gate(text);") > 0 && src.indexOf("const g0 = gate(text);") < src.indexOf("ensureConsentGroup(GROUP"), "the gate runs before the consent screen");
  assert.ok(!/isDispensingLabel\(v\)/.test(src) && /const g2 = gate\(v\);/.test(src), "the edited preview text goes through the same gate");
});

test("wiring: medicine.html loads lensiq-ai.js, the guard and lensiq-pc-ai.js; every md.pc.ai.* string exists in EN and ZH; no verdict words", () => {
  const html = readFileSync(join(ROOT, "medicine.html"), "utf8");
  const order = ["lensiq-api.js", "lensiq-ai.js", "lensiq-pc-guard.js", "lensiq-pc-lookup.js", "lensiq-pc-ai.js"].map(f => html.indexOf(`<script src="${f}`));
  assert.ok(order.every(i => i > 0) && order.every((x, i) => i === 0 || x > order[i - 1]), "script order " + order);
  const src = readFileSync(join(ROOT, "lensiq-pc-ai.js"), "utf8");
  const keys = [...new Set(src.match(/"md\.pc\.ai\.[a-zA-Z.]+"/g).map(x => x.slice(1, -1)))];
  global.window = {};
  require("../../i18n/en-med.js"); require("../../i18n/zh-med.js");
  const q = global.window.LQI18N_Q;
  for (const l of ["en", "zh"]) {
    const d = Object.assign({}, ...q.filter(o => o[l]).map(o => o[l]));
    for (const k of keys) assert.ok(d[k] && d[k].trim(), `${l} ${k}`);
    const BAN = /illegal|fake|counterfeit|genuine|authentic|违法|假冒|假货|正品/i;
    for (const k of keys) assert.ok(!BAN.test(d[k]), `${l} ${k} has a verdict word`);
  }
  assert.ok(!/ผิดกฎหมาย|ปลอม|ของแท้/.test(src), "no Thai verdict words in the module");
  delete global.window;
});
