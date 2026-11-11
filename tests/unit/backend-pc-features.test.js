"use strict";
// tests/unit/backend-pc-features.test.js — round 17 P7 FIXED TEST SET for the Product Check AI features pc_fields,
// pc_claims, pc_translate (backend/src/ai/pc-features.js, gateway verify hook). Written before the client was wired.
// Mocked providers only (fake adapters through deps.aiAdapters); no key, no network. Synthetic label text only.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const siteverify = async () => new Response(JSON.stringify({ success: true, action: "ai", hostname: "site.example" }));
const envOf = (vars = {}) => createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ANTHROPIC_API_KEY: "sk-ant-test-" + "k".repeat(40), OPENAI_API_KEY: "o-test", ...vars });
const CHAIN = [{ provider: "anthropic", model: "claude-haiku-5-5" }, { provider: "openai", model: "gpt-6-luna" }];
const LABEL = "ยาแก้ปวด TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nรักษาหายขาด 100% ไม่มีผลข้างเคียง\nEXP 01/2028";

function fake(id, script) {
  const calls = [];
  return { calls, adapter: { id, capabilities: () => ({ vision: true, jsonSchema: "native" }), region: () => "test-region",
    async call(r, entry) { calls.push({ r, entry }); return script(calls.length, r, entry); } } };
}
const ok = json => ({ ok: true, json, model: "served", usage: { inputTokens: 100, outputTokens: 50 } });

async function setup(env, features) {
  const { putGateway } = await import(B + "ai/settings.js");
  const f = {};
  for (const id of features) f[id] = { enabled: true, chain: CHAIN, monthlyBudgetUsd: 5, perUserDaily: 100, perUserPerMinute: 100, globalPerMinute: 1000,
    ...(id === "pc_fields" ? { imageModeAllowed: true } : {}) };
  await putGateway(env.DB, { enabled: true, features: f });
}
async function post(env, feature, body, adapters, opts = {}) {
  const { handle } = await import(B + "index.js");
  const r = await handle(req("/v1/ai/" + feature, { method: "POST", body, origin: opts.origin, base: opts.base, headers: { "X-Turnstile-Token": "good" } }), env,
    { fetch: siteverify, aiAdapters: adapters, sleep: async () => {} });
  return { status: r.status, j: await r.json() };
}
const body = (input, mode = "text") => ({ consent: true, providers: ["anthropic", "openai"], mode, input });

test("P7-1 registry: pc_fields / pc_claims / pc_translate are live with a build; a new install keeps them OFF with budget 0 and no image mode", async () => {
  const { FEATURES } = await import(B + "ai/features.js");
  const { DEFAULT_GATEWAY, getGateway } = await import(B + "ai/settings.js");
  for (const id of ["pc_fields", "pc_claims", "pc_translate"]) {
    assert.equal(FEATURES[id].status, "live", id);
    assert.equal(typeof FEATURES[id].build, "function", id);
    const d = DEFAULT_GATEWAY.features[id];
    assert.equal(d.enabled, false, id + " off"); assert.equal(d.monthlyBudgetUsd, 0, id + " budget 0"); assert.equal(d.imageModeAllowed, false, id + " image off");
  }
  assert.equal(DEFAULT_GATEWAY.enabled, false, "AI off globally on a new install");
  const env = envOf();
  const g = await getGateway(env.DB);
  assert.equal(g.enabled, false);
  const r = await post(env, "pc_claims", body({ text: LABEL }), { anthropic: fake("anthropic", () => ok({ signals: [] })).adapter });
  assert.equal(r.j.reason, "disabled", "nothing runs on a new install");
});

test("P7-2 schemas: supported subset, strict (no extra keys, every key required), and NO verdict field anywhere", async () => {
  const { assertSupportedSchema } = await import(B + "ai/schema.js");
  const P = await import(B + "ai/pc-features.js");
  const VERDICT = /illegal|legal|fake|genuine|authentic|counterfeit|safe|verdict|score|approved|compliant|risk_level|confidence/i;
  const walk = (s, path) => {
    assertSupportedSchema(s);
    if (s.type === "object" || (Array.isArray(s.type) && s.type.includes("object"))) {
      assert.equal(s.additionalProperties, false, path + " additionalProperties false");
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), path + " every key required");
      for (const [k, v] of Object.entries(s.properties)) { assert.ok(!VERDICT.test(k), `${path}.${k} is not a verdict field`); walk(v, path + "." + k); }
    }
    if (s.items) walk(s.items, path + "[]");
  };
  walk(P.FIELDS_SCHEMA, "pc_fields"); walk(P.CLAIMS_SCHEMA, "pc_claims"); walk(P.TRANSLATE_SCHEMA, "pc_translate");
  for (const [id, p] of Object.entries(P.PROMPTS)) {
    assert.match(p, /never judge whether the product is legal, registered, genuine, fake, safe or effective/, id + " prompt forbids verdicts");
    assert.match(p, /never give dosing/, id + " no dosing advice");
    assert.match(p, /\[removed\]/, id + " tells the model about redacted personal data");
    assert.ok(p.length < 2000, id + " short system prompt");
  }
});

test("P7-3 pc_claims rule ids = the text-detectable rules of RULES.md (lensiq-claims-rules.js), same English titles", async () => {
  const P = await import(B + "ai/pc-features.js");
  const LQClaims = require("../../lensiq-claims.js");
  const text = LQClaims.RULES.filter(r => r.detect === "text");
  assert.deepEqual(P.PC_CLAIM_RULES.map(r => r[0]), text.map(r => r.id));
  for (const [id, title] of P.PC_CLAIM_RULES) assert.equal(title, LQClaims.RULES.find(r => r.id === id).title_en, id);
  assert.deepEqual(P.CLAIMS_SCHEMA.properties.signals.items.properties.rule_id.enum, text.map(r => r.id));
  const b = P.buildClaims({ text: LABEL, category: "drug" });
  assert.match(b.system, /D01: Miraculous/); assert.doesNotMatch(b.system, /F13:|C01:|H01:/, "only the category's rule family is offered");
  assert.match(P.buildClaims({ text: LABEL }).system, /C08:/, "unknown category: every rule");
});

test("P7-4 pc_claims: verbatim evidence spans pass; a span that is not in the text sent is rejected (retried, then the next provider)", async () => {
  const env = envOf();
  await setup(env, ["pc_claims"]);
  const good = { signals: [{ rule_id: "D01", evidence: "รักษาหายขาด" }, { rule_id: "F04", evidence: "ไม่มีผลข้างเคียง" }, { rule_id: "D01", evidence: "รักษาหายขาด" }] };
  const a = fake("anthropic", () => ok(good));
  // no category: every rule id is kept (owner order 2026-11-12: with a category, off-family ids are dropped; see P8-F2)
  const r = await post(env, "pc_claims", body({ text: LABEL }), { anthropic: a.adapter });
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.json.signals.map(s => [s.rule_id, s.evidence]), [["D01", "รักษาหายขาด"], ["F04", "ไม่มีผลข้างเคียง"]], "deduplicated");
  assert.equal(r.j.json.signals[0].start, LABEL.indexOf("รักษาหายขาด"));
  assert.ok(!a.calls[0].r.images, "text only");
  assert.match(a.calls[0].r.text, /รักษาหายขาด/);
  // category drug: the same answer, F04 (food family) is dropped, D01 kept and deduplicated
  const rd = await post(env, "pc_claims", body({ text: LABEL, category: "drug" }), { anthropic: fake("anthropic", () => ok(good)).adapter });
  assert.equal(rd.status, 200);
  assert.deepEqual(rd.j.json.signals.map(s => [s.rule_id, s.evidence]), [["D01", "รักษาหายขาด"]], "deduplicated, off-family dropped");
  assert.deepEqual(rd.j.meta, { off_family_dropped: 1 });
  // hallucinated span: first provider answers it twice (retry once), the second provider answers a good one
  const h = { signals: [{ rule_id: "D01", evidence: "หายขาดแน่นอน 100 %" }] };
  const bad = fake("anthropic", () => ok(h)), next = fake("openai", () => ok(good));
  const r2 = await post(env, "pc_claims", body({ text: LABEL }), { anthropic: bad.adapter, openai: next.adapter });
  assert.equal(bad.calls.length, 2, "schema_mismatch: one retry on the same model");
  assert.equal(next.calls.length, 1); assert.equal(r2.j.ok, true); assert.equal(r2.j.provider, "openai");
  // every provider hallucinates -> fallback, the page keeps its on-device result
  const r3 = await post(env, "pc_claims", body({ text: LABEL }), { anthropic: fake("anthropic", () => ok(h)).adapter, openai: fake("openai", () => ok(h)).adapter });
  assert.equal(r3.status, 502); assert.equal(r3.j.fallback, true); assert.equal(r3.j.reason, "invalid_output");
  // an unknown rule id is a schema error
  const r4 = await post(env, "pc_claims", body({ text: LABEL }), { anthropic: fake("anthropic", () => ok({ signals: [{ rule_id: "X99", evidence: "รักษาหายขาด" }] })).adapter,
    openai: fake("openai", () => ok({ signals: [{ rule_id: "X99", evidence: "รักษาหายขาด" }] })).adapter });
  assert.equal(r4.j.reason, "invalid_output");
  // image mode is never allowed for pc_claims
  const r5 = await post(env, "pc_claims", body({ text: LABEL, images: [{ mime: "image/jpeg", base64: "AAAA", width: 4, height: 4 }] }, "image"), { anthropic: a.adapter });
  assert.equal(r5.j.reason, "image_not_allowed");
});

test("P7-5 pc_fields: registration numbers not in the OCR text are marked 'model'; an unparseable expiry becomes null + unreadable; caps applied", async () => {
  const env = envOf();
  await setup(env, ["pc_fields"]);
  const json = { product_type: "drug", brand: "TESTOL", product_name: "TESTOL 500", active_ingredients: [{ name_on_pack: "paracetamol", inn: "paracetamol", strength: "500", unit: "mg" }],
    dosage_form: "tablet", registration: [{ number: "1A844/39", country: "TH", kind: "drug" }, { number: "2A 99/99", country: "TH", kind: "drug" }], manufacturer: null, lot: null,
    expiry: "next year", claims_on_pack: Array.from({ length: 20 }, (_, i) => "claim " + i), languages_on_pack: ["th", "en"], unreadable: [] };
  const a = fake("anthropic", () => ok(json));
  const r = await post(env, "pc_fields", body({ text: LABEL, script: "th" }), { anthropic: a.adapter });
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.json.registration.map(x => [x.number, x.source]), [["1A844/39", "ocr"], ["2A 99/99", "model"]]);
  assert.equal(r.j.json.expiry, null); assert.ok(r.j.json.unreadable.includes("expiry"));
  assert.equal(r.j.json.claims_on_pack.length, 12);
  assert.match(a.calls[0].r.text, /Label script chosen by the user: th/);
  // image mode: the image goes to the adapter only in image mode; text mode drops an image the page should not have sent
  const img = [{ mime: "image/jpeg", base64: "AAAA", width: 640, height: 480 }];
  const ai = fake("anthropic", () => ok({ ...json, expiry: "2028-01" }));
  const ri = await post(env, "pc_fields", body({ text: "", images: img }, "image"), { anthropic: ai.adapter });
  assert.equal(ri.status, 200); assert.equal(ai.calls[0].r.images.length, 1); assert.match(ai.calls[0].r.text, /read the fields from the product image/);
  assert.equal(ri.j.json.expiry, "2028-01");
  const at = fake("anthropic", () => ok(json));
  await post(env, "pc_fields", body({ text: LABEL, images: img }, "text"), { anthropic: at.adapter });
  assert.ok(!at.calls[0].r.images, "text mode never forwards an image");
  // text mode without text is refused before any call
  const an = fake("anthropic", () => ok(json));
  const rn = await post(env, "pc_fields", body({ text: "  " }), { anthropic: an.adapter });
  assert.equal(rn.j.reason, "bad_input"); assert.equal(an.calls.length, 0);
});

test("P7-6 pc_translate: lines must come from the text sent; an invented source line rejects the answer", async () => {
  const env = envOf();
  await setup(env, ["pc_translate"]);
  const text = "布洛芬缓释胶囊\n每日两次\n国药准字H20013062";
  const good = { source_language: "zh", lines: [{ source: "布洛芬缓释胶囊", translation: "ไอบูโพรเฟน แคปซูลออกฤทธิ์นาน" }, { source: "每日两次", translation: "วันละ 2 ครั้ง" }] };
  const a = fake("anthropic", () => ok(good));
  const r = await post(env, "pc_translate", body({ text, target: "th" }), { anthropic: a.adapter });
  assert.equal(r.status, 200); assert.equal(r.j.json.lines.length, 2); assert.match(a.calls[0].r.text, /Target language: Thai/);
  const inv = { source_language: "zh", lines: [{ source: "本品安全无副作用", translation: "x" }] };
  const r2 = await post(env, "pc_translate", body({ text }), { anthropic: fake("anthropic", () => ok(inv)).adapter, openai: fake("openai", () => ok(inv)).adapter });
  assert.equal(r2.j.reason, "invalid_output");
});

test("P7-7 server-side patient-name guard (same module as the page): text that still carries a name, HN, phone or ID is refused before any call", async () => {
  const env = envOf();
  await setup(env, ["pc_fields", "pc_claims", "pc_translate"]);
  const G = require("../../lensiq-pc-guard.js");
  // the non-dispensing texts are product labels (a registration number or two label cues): since the product-label evidence
  // filter (owner decision 2026-11-10) only a product label is accepted once it is clean
  const leaks = ["ชื่อผู้ป่วย: สมมติ ใจทดสอบ\nPARACETAMOL 500 mg", "Patient: Testy McSample\nIBUPROFEN", "HN: 6512345 ยาแก้แพ้", "โทร 081-234-5678 ยาทา\nเลขทะเบียน 1A 844/39",
    "เลขประจำตัวประชาชน 1-1037-00123-45-" + "1", "患者姓名：测试明 阿莫西林", "คุณสมมติ ใจทดสอบ ติดต่อ mock@example.test\nยาทา\nเลขทะเบียน 2A 45/61",
    "Name: Jane Placeholder\nVitamin C 1000 mg\nDietary Supplement\n60 Tablets"];
  assert.equal(G.DEFAULTS.dispensingAI, "off", "owner decision pending: AI off for dispensing labels by default");
  let accepted = 0, refusedLabel = 0;
  for (const t of leaks) {
    for (const f of ["pc_fields", "pc_claims", "pc_translate"]) {
      const a = fake("anthropic", () => ok({}));
      const r = await post(env, f, body({ text: t }), { anthropic: a.adapter });
      assert.equal(r.j.reason, "bad_input", `${f} refuses: ${t.slice(0, 20)}`); assert.equal(a.calls.length, 0, "no provider call");
    }
    const red = G.redact(t);
    assert.ok(red.count >= 1);
    const a = fake("anthropic", () => ok({ signals: [] }));
    const r = await post(env, "pc_claims", body({ text: red.text }), { anthropic: a.adapter });
    if (G.isDispensingLabel(red.text) || /เลขประจำตัวประชาชน/.test(red.text)) { // patient / HN / ID-card cues stay in the redacted text: AI off by default
      assert.equal(r.j.reason, "bad_input", "dispensing label / personal document refused even when redacted: " + red.text); assert.equal(a.calls.length, 0); refusedLabel++;
      continue;
    }
    assert.equal(r.status, 200, "the redacted text is accepted: " + red.text);
    assert.ok(!a.calls[0].r.text.includes("สมมติ ใจทดสอบ") && !a.calls[0].r.text.includes("McSample"));
    accepted++;
  }
  assert.ok(accepted >= 3 && refusedLabel >= 3, `accepted ${accepted}, dispensing refused ${refusedLabel}`);
});

test("P7-9 server-side product-label evidence (the page's own decision, LQPCGuard.aiGate): a personal document or a text with no label evidence is refused before any call", async () => {
  const env = envOf();
  await setup(env, ["pc_fields", "pc_claims", "pc_translate"]);
  const G = require("../../lensiq-pc-guard.js");
  const clean = t => G.redact(t).text;
  const REFUSE = [
    clean("ผู้รับ: คุณสมมติ ใจทดสอบ\nโทร 081-234-5678\nสินค้า: TESTOL 500 mg เลขทะเบียน 1A 844/39\nผู้ส่ง: ร้านยาสาธิต"), // a parcel label that lists the product
    "SHIP TO:\nSample Naturals LLC warehouse\nTracking # 1Z 999\nContents: Fish Oil 1000 mg softgels, Supplement Facts",
    "ใบรับรองแพทย์\nผลการวินิจฉัย: ไข้หวัดใหญ่\nยา: พาราเซตามอล 500 มก. เลขทะเบียน 1A 844/39",
    "订单编号：202411100987\n商品：钙维生素D软胶囊 60粒 保健食品\n谢谢惠顾",
    "สวัสดีครับ ฝากซื้อยาแก้ปวดให้หน่อย", "Take 2 tablets 3 times a day", "น้ำดื่ม ตราสาธิต\n600 มล."
  ];
  for (const t of REFUSE) {
    assert.deepEqual(G.scan(t), [], "the text itself is clean (refused for what it is, not for personal data): " + t);
    for (const f of ["pc_fields", "pc_claims", "pc_translate"]) {
      const a = fake("anthropic", () => ok({}));
      const r = await post(env, f, body({ text: t }), { anthropic: a.adapter });
      assert.equal(r.j.reason, "bad_input", `${f} refuses: ${t.slice(0, 30)}`); assert.equal(a.calls.length, 0, "no provider call");
    }
    // image mode with the same text: refused too
    const ai = fake("anthropic", () => ok({}));
    const ri = await post(env, "pc_fields", body({ text: t, images: [{ mime: "image/jpeg", base64: "AAAA", width: 4, height: 4 }] }, "image"), { anthropic: ai.adapter });
    assert.equal(ri.j.reason, "bad_input", "image mode: " + t.slice(0, 30)); assert.equal(ai.calls.length, 0);
  }
  // facts handed in by the page: a decoded barcode (check digit verified here), a registration number (must stand in the text)
  const sig = { signals: [] };
  const a1 = fake("anthropic", () => ok(sig));
  const r1 = await post(env, "pc_claims", body({ text: "น้ำดื่ม ตราสาธิต\n600 มล.", gtins: ["8850006939727"] }), { anthropic: a1.adapter });
  assert.equal(r1.status, 200);
  assert.ok(!a1.calls[0].r.text.includes("8850006939727") && !a1.calls[0].r.system.includes("8850006939727"), "the barcode is evidence for the Worker, never sent to the provider");
  for (const bad of [{ gtins: ["8850006939720"] }, { gtins: "8850006939727" }, { gtins: [8850006939727] }, { regs: ["1A 844/39"] }]) {
    const a2 = fake("anthropic", () => ok(sig));
    const r2 = await post(env, "pc_claims", body({ text: "น้ำดื่ม ตราสาธิต\n600 มล.", ...bad }), { anthropic: a2.adapter });
    assert.equal(r2.j.reason, "bad_input", JSON.stringify(bad)); assert.equal(a2.calls.length, 0);
  }
  const a3 = fake("anthropic", () => ok(sig));
  assert.equal((await post(env, "pc_claims", body({ text: "ผู้รับ: ร้านค้า\nน้ำดื่ม 600 มล.", gtins: ["8850006939727"] }), { anthropic: a3.adapter })).j.reason, "bad_input",
    "a barcode never overrides a personal-document sign");
  // a product label still goes through
  const a4 = fake("anthropic", () => ok(sig));
  assert.equal((await post(env, "pc_claims", body({ text: LABEL }), { anthropic: a4.adapter })).status, 200);
});

test("P7-8 local eval echo: cost + latency only with AI_EVAL_LOCAL=1 AND a localhost request URL AND a localhost Origin; never otherwise", async () => {
  const good = { signals: [] };
  const e1 = envOf({ ALLOWED_ORIGINS: "https://site.example,http://localhost:8000", TURNSTILE_DISABLED_FOR_LOCAL_DEV: "true" });
  await setup(e1, ["pc_claims"]);
  const r1 = await post(e1, "pc_claims", body({ text: LABEL }), { anthropic: fake("anthropic", () => ok(good)).adapter }, { origin: "http://localhost:8000" });
  assert.equal(r1.status, 200); assert.equal(r1.j.eval, undefined, "no AI_EVAL_LOCAL -> no eval info");
  const e2 = envOf({ ALLOWED_ORIGINS: "https://site.example,http://localhost:8000", AI_EVAL_LOCAL: "1" });
  await setup(e2, ["pc_claims"]);
  const dev = { origin: "http://localhost:8000", base: "http://127.0.0.1:8787" }; // local wrangler dev
  const r2 = await post(e2, "pc_claims", body({ text: LABEL }), { anthropic: fake("anthropic", () => ok(good)).adapter }, dev);
  assert.equal(r2.status, 200); assert.ok(r2.j.eval && r2.j.eval.costMicros > 0 && r2.j.eval.attempts[0].model === "claude-haiku-5-5");
  const r2b = await post(e2, "pc_claims", body({ text: LABEL }), { anthropic: fake("anthropic", () => ok(good)).adapter }, { origin: "http://localhost:8000" });
  assert.equal(r2b.status, 200); assert.equal(r2b.j.eval, undefined, "variable + localhost Origin but a public request host (deployed Worker): no cost echo");
  const r3 = await post(e2, "pc_claims", body({ text: LABEL }), { anthropic: fake("anthropic", () => ok(good)).adapter });
  assert.equal(r3.status, 200); assert.equal(r3.j.eval, undefined, "a public Origin never gets eval info");
});

// ---- P7-9: local evaluation mode ("eval bypass", owner decision 2026-11-10) -------------------------------------------
// In local evaluation mode (AI_EVAL_LOCAL=1 in the Worker's own environment AND a localhost Origin: the same condition
// as the cost echo) the product-label filter is skipped so advert snippets can be scored. These tests prove the mode
// cannot be active in a deployed Worker and that the name guard and the dispensing refusal are never skipped.
const AD = "อาหารเสริมลดน้ำหนัก ผอมไวใน 7 วัน ไม่มีผลข้างเคียง รักษาหายขาด"; // advert wording, no label evidence
const AD_SHIP = "โปรวันนี้ จัดส่งฟรี เก็บเงินปลายทาง ครีมหน้าขาวใน 3 วัน รักษาสิวหายขาด"; // advert with a personal-document sign
const DISPENSING = "ชื่อผู้ป่วย: [removed]\nHN [removed]\nรับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร\nPARACETAMOL 500 mg";
const WITH_NAME = "ชื่อผู้ป่วย: สมมติ ใจทดสอบ\nครีมหน้าขาว รักษาสิวหายขาด";
const LOCAL = "http://localhost:8000";
const DEV = "http://127.0.0.1:8787"; // the host a local `wrangler dev` serves the Worker under
const LOCAL_ENV = { ALLOWED_ORIGINS: "https://site.example," + LOCAL, TURNSTILE_DISABLED_FOR_LOCAL_DEV: "true", AI_EVAL_LOCAL: "1" };

test("P7-9a the fixtures are what the tests assume (the page's own decision refuses them)", () => {
  const G = require("../../lensiq-pc-guard.js");
  assert.equal(G.aiGate(AD).reason, "no-product");
  assert.equal(G.aiGate(AD_SHIP).reason, "personal-doc");
  assert.equal(G.aiGate(DISPENSING).reason, "dispensing");
  assert.equal(G.scan(DISPENSING).length, 0, "the dispensing fixture is already redacted: only the dispensing rule can refuse it");
  assert.ok(G.scan(WITH_NAME).length > 0);
});

test("P7-9b local evaluation mode skips ONLY the product-label filter: the name guard and the dispensing refusal still refuse, with no provider call", async () => {
  const env = envOf(LOCAL_ENV);
  await setup(env, ["pc_fields", "pc_claims", "pc_translate"]);
  for (const text of [AD, AD_SHIP]) {
    const a = fake("anthropic", () => ok({ signals: [] }));
    const r = await post(env, "pc_claims", body({ text, category: "supplement" }), { anthropic: a.adapter }, { origin: LOCAL, base: DEV });
    assert.equal(r.status, 200, "advert text reaches the model in local evaluation mode");
    assert.equal(a.calls.length, 1);
    assert.ok(r.j.eval && r.j.eval.costMicros > 0, "same mode as the cost echo");
  }
  for (const f of ["pc_fields", "pc_claims", "pc_translate"]) {
    for (const text of [DISPENSING, WITH_NAME]) {
      const a = fake("anthropic", () => ok({ signals: [] })), o = fake("openai", () => ok({ signals: [] }));
      const r = await post(env, f, body({ text }), { anthropic: a.adapter, openai: o.adapter }, { origin: LOCAL, base: DEV });
      assert.equal(r.status, 400, f); assert.equal(r.j.reason, "bad_input", f);
      assert.equal(a.calls.length + o.calls.length, 0, f + ": nothing sent");
    }
  }
});

test("P7-9c a deployed Worker: without the variable, from a public Origin, or under a public request host (even with a localhost Origin), the filter applies", async () => {
  const cases = [
    [envOf({ ALLOWED_ORIGINS: "https://site.example," + LOCAL, TURNSTILE_DISABLED_FOR_LOCAL_DEV: "true" }), LOCAL, "no variable, localhost Origin"],
    [envOf({ ALLOWED_ORIGINS: "https://site.example," + LOCAL, TURNSTILE_DISABLED_FOR_LOCAL_DEV: "true", AI_EVAL_LOCAL: "true" }), LOCAL, "only the exact value 1 counts"],
    [envOf({ ALLOWED_ORIGINS: "https://site.example," + LOCAL, TURNSTILE_DISABLED_FOR_LOCAL_DEV: "true", AI_EVAL_LOCAL: "0" }), LOCAL, "0 is off"],
    [envOf(LOCAL_ENV), "https://site.example", "variable set, public Origin"],
    [envOf(LOCAL_ENV), "https://site.example", "variable set, localhost URL, public Origin", DEV],
    // the Origin header is caller-chosen: with the variable set and a localhost Origin, a Worker reached under a public
    // host (any deployed Worker) still gets neither the bypass nor the cost echo
    [envOf(LOCAL_ENV), LOCAL, "variable set, localhost Origin, PUBLIC request host", "https://api.example"],
    [envOf(LOCAL_ENV), LOCAL, "variable set, localhost Origin, workers.dev host", "https://lensiq-api.example.workers.dev"],
    [envOf(LOCAL_ENV), LOCAL, "variable set, localhost Origin, look-alike host", "https://localhost.evil.example"]
  ];
  for (const [env, origin, name, base] of cases) {
    await setup(env, ["pc_claims", "pc_translate"]);
    for (const text of [AD, AD_SHIP]) {
      const a = fake("anthropic", () => ok({ signals: [] }));
      const r = await post(env, "pc_claims", body({ text }), { anthropic: a.adapter }, { origin, base });
      assert.equal(r.status, 400, name); assert.equal(r.j.reason, "bad_input", name);
      assert.equal(r.j.eval, undefined, name); assert.equal(a.calls.length, 0, name + ": nothing sent");
    }
  }
  // contrast: variable + localhost URL + localhost Origin -> the bypass and the cost echo are on
  {
    const env = envOf(LOCAL_ENV);
    await setup(env, ["pc_claims"]);
    const a = fake("anthropic", () => ok({ signals: [] }));
    const r = await post(env, "pc_claims", body({ text: AD }), { anthropic: a.adapter }, { origin: LOCAL, base: "http://localhost:8787" });
    assert.equal(r.status, 200); assert.equal(a.calls.length, 1); assert.ok(r.j.eval && r.j.eval.costMicros > 0);
    const a2 = fake("anthropic", () => ok({ signals: [] }));
    const r2 = await post(env, "pc_claims", body({ text: LABEL }), { anthropic: a2.adapter }, { origin: LOCAL, base: "https://api.example" });
    assert.equal(r2.status, 200); assert.equal(r2.j.eval, undefined, "a product label from a public host: answered, no cost echo");
  }
  // production ALLOWED_ORIGINS has no localhost: a forged localhost Origin is refused by the router before the gateway
  const prod = envOf({ ALLOWED_ORIGINS: "https://site.example", AI_EVAL_LOCAL: "1" });
  await setup(prod, ["pc_claims"]);
  const a = fake("anthropic", () => ok({ signals: [] }));
  const r = await post(prod, "pc_claims", body({ text: AD }), { anthropic: a.adapter }, { origin: LOCAL });
  assert.equal(r.status, 403); assert.equal(a.calls.length, 0);
  // look-alike origins are not local
  const { evalLocalMode } = await import(B + "ai/gateway.js");
  const rq = (o, base = DEV) => new Request(base + "/v1/ai/pc_claims", { method: "POST", headers: o == null ? {} : { Origin: o } });
  for (const o of [null, "", "null", "https://localhost.evil.example", "http://localhost.evil.example:8000", "https://site.example",
    "http://127.0.0.1.evil.example", "http://evil.example/localhost"]) {
    assert.equal(evalLocalMode({ AI_EVAL_LOCAL: "1" }, rq(o)), false, String(o));
  }
  for (const base of [DEV, "http://localhost:8787", "http://[::1]:8787"]) assert.equal(evalLocalMode({ AI_EVAL_LOCAL: "1" }, rq(LOCAL, base)), true, base);
  for (const base of ["https://api.example", "https://lensiq-api.example.workers.dev", "https://localhost.evil.example", "https://127.0.0.1.evil.example",
    "https://evil.example/localhost", "http://127.0.0.2:8787", "http://10.0.0.5:8787"]) {
    assert.equal(evalLocalMode({ AI_EVAL_LOCAL: "1" }, rq(LOCAL, base)), false, "public or look-alike request host: " + base);
  }
  assert.equal(evalLocalMode({}, rq(LOCAL)), false);
  assert.equal(evalLocalMode({ AI_EVAL_LOCAL: 1 }, rq(LOCAL)), true, "wrangler --var gives a string; a number 1 is the same switch");
  assert.equal(evalLocalMode({ AI_EVAL_LOCAL: "1 " }, rq(LOCAL)), false);
});

test("P7-9d not settable from the request: body, input, query string and headers cannot switch it on", async () => {
  const { handle } = await import(B + "index.js");
  const flags = { evalLocal: true, eval: true, AI_EVAL_LOCAL: "1", ai_eval_local: 1, labelFilter: "off", skipGate: true, bypass: true };
  const headers = { "X-Turnstile-Token": "good", "X-AI-Eval-Local": "1", "AI-Eval-Local": "1", "X-Eval": "1", "X-Forwarded-Host": "localhost:8000", "X-Forwarded-For": "127.0.0.1",
    Referer: LOCAL + "/medicine.html", Cookie: "AI_EVAL_LOCAL=1; evalLocal=1" };
  // (1) deployed shape: no variable; every request-side switch at once, from a public and from a localhost Origin
  // (2) variable set (as on the owner's laptop) but a public Origin
  const envs = [
    [envOf({ ALLOWED_ORIGINS: "https://site.example," + LOCAL, TURNSTILE_DISABLED_FOR_LOCAL_DEV: "true" }), ["https://site.example", LOCAL]],
    [envOf(LOCAL_ENV), ["https://site.example"]]
  ];
  for (const [env, origins] of envs) {
    await setup(env, ["pc_fields", "pc_claims", "pc_translate"]);
    for (const origin of origins) {
      for (const f of ["pc_fields", "pc_claims", "pc_translate"]) {
        const a = fake("anthropic", () => ok({ signals: [] })), o = fake("openai", () => ok({ signals: [] }));
        const b = { ...body({ text: AD, ...flags, o: flags, mode: "eval" }), ...flags, o: flags, opts: flags };
        const r = await handle(req("/v1/ai/" + f + "?AI_EVAL_LOCAL=1&evalLocal=true&eval=1", { method: "POST", body: b, origin, headers }), env,
          { fetch: siteverify, aiAdapters: { anthropic: a.adapter, openai: o.adapter }, sleep: async () => {} });
        const j = await r.json();
        assert.equal(r.status, 400, f + " " + origin); assert.equal(j.reason, "bad_input"); assert.equal(j.eval, undefined);
        assert.equal(a.calls.length + o.calls.length, 0, f + ": nothing sent");
      }
    }
    assert.equal(env.AI_EVAL_LOCAL, envs[0][0] === env ? undefined : "1", "a request never changes the Worker's environment");
  }
  // the builders take the flag only from the gateway's second argument, never from the input
  const P = await import(B + "ai/pc-features.js");
  for (const build of [P.buildFields, P.buildClaims, P.buildTranslate]) {
    assert.throws(() => build({ text: AD, evalLocal: true }, { mode: "text" }), /AI off for this text: no-product/);
    assert.throws(() => build({ text: AD }, { mode: "text", evalLocal: "1" }), /no-product/, "only the boolean true from the gateway counts");
    assert.throws(() => build({ text: DISPENSING }, { mode: "text", evalLocal: true }), /dispensing/);
    assert.throws(() => build({ text: WITH_NAME }, { mode: "text", evalLocal: true }), /personal data left/);
    assert.ok(build({ text: AD }, { mode: "text", evalLocal: true }).text.includes(AD));
  }
});

test("P7-9e not settable from the admin API / panel or any stored setting; production config never defines it", async () => {
  const { readFileSync, readdirSync, statSync, existsSync } = require("node:fs");
  const { join } = require("node:path");
  const ROOT = join(__dirname, "..", "..");
  // (1) an owner PUT with every imaginable switch: the stored settings do not carry it and the filter still applies
  const env = envOf({ ALLOWED_ORIGINS: "https://site.example," + LOCAL, TURNSTILE_DISABLED_FOR_LOCAL_DEV: "true" });
  await setup(env, ["pc_claims"]);
  const { putGateway, getGateway } = await import(B + "ai/settings.js");
  const sw = { evalLocal: true, eval: true, AI_EVAL_LOCAL: "1", labelFilter: "off" };
  try {
    await putGateway(env.DB, { enabled: true, ...sw, features: { pc_claims: { enabled: true, chain: CHAIN,
      monthlyBudgetUsd: 5, perUserDaily: 100, perUserPerMinute: 100, globalPerMinute: 1000, ...sw } } });
  } catch { /* refusing the unknown keys is as good as ignoring them */ }
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('AI_EVAL_LOCAL', '\"1\"', 1), ('ai_eval_local', '{\"enabled\":true}', 1) ON CONFLICT (key) DO NOTHING").run();
  assert.ok(!/eval_?local|labelFilter/i.test(JSON.stringify(await getGateway(env.DB)).replace(/"last_eval"/g, "")), "no such key in the stored AI settings");
  for (const origin of ["https://site.example", LOCAL]) {
    const a = fake("anthropic", () => ok({ signals: [] }));
    const r = await post(env, "pc_claims", body({ text: AD }), { anthropic: a.adapter }, { origin });
    assert.equal(r.status, 400, origin); assert.equal(r.j.reason, "bad_input"); assert.equal(a.calls.length, 0);
  }
  assert.equal(env.AI_EVAL_LOCAL, undefined);
  // (2) source: the variable is read in ONE place (gateway.js evalLocalMode), never assigned, never read from a setting;
  //     the admin panel and the admin API do not know it
  const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const src = walk(join(ROOT, "backend", "src")).filter(f => f.endsWith(".js"));
  const users = src.filter(f => /[.\[]\s*["'`]?AI_EVAL_LOCAL/.test(readFileSync(f, "utf8"))).map(f => f.slice(join(ROOT, "backend", "src").length + 1).replace(/\\/g, "/"));
  assert.deepEqual(users, ["ai/gateway.js"], "AI_EVAL_LOCAL is read (property access; comments may name it) only by the gateway");
  const gwSrc = readFileSync(join(ROOT, "backend", "src", "ai", "gateway.js"), "utf8");
  assert.equal((gwSrc.match(/env\.AI_EVAL_LOCAL/g) || []).length, 1, "one read");
  assert.match(gwSrc, /export const evalLocalMode = \(env, request\) => String\(env\.AI_EVAL_LOCAL \|\| ""\) === "1" && isLocalRequestUrl\(request\) && isLocalOrigin\(request\);/);
  assert.match(gwSrc, /const evalLocal = evalLocalMode\(env, request\);/);
  assert.match(gwSrc, /meta\.build\(input, \{ mode, evalLocal \}\)/);
  for (const f of src) {
    const s = readFileSync(f, "utf8");
    assert.ok(!/AI_EVAL_LOCAL\s*=[^=]/.test(s.replace(/AI_EVAL_LOCAL=1/g, "")), f + ": never assigned");
    // evalLocal is produced by the gateway only; no other module may create it (e.g. from a body or a setting)
    if (!/ai[/\\](gateway|pc-features)\.js$/.test(f)) assert.ok(!/evalLocal/.test(s), f + ": does not touch evalLocal");
  }
  const pcSrc = readFileSync(join(ROOT, "backend", "src", "ai", "pc-features.js"), "utf8");
  assert.ok(!/input\.evalLocal|input\[["']evalLocal/.test(pcSrc), "the builders never read the flag from the input");
  for (const f of ["admin.js", "admin.html", "lensiq-ai.js", "lensiq-pc-ai.js", "lensiq-config.js", "medicine.html"]) {
    assert.ok(!/AI_EVAL_LOCAL|evalLocal/.test(readFileSync(join(ROOT, f), "utf8")), f + ": the site has no such switch");
  }
  // (3) production config: wrangler.toml (any [vars] / [env.*] section), the deploy scripts and CI never define it
  const toml = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
  assert.ok(!/AI_EVAL_LOCAL/.test(toml), "backend/wrangler.toml never mentions AI_EVAL_LOCAL");
  assert.ok(!/localhost|127\.0\.0\.1/.test(toml.split("\n").filter(l => /^\s*ALLOWED_ORIGINS\s*=/.test(l)).join("\n")), "production ALLOWED_ORIGINS has no localhost");
  for (const p of [join(ROOT, "backend", "package.json"), join(ROOT, "package.json")]) {
    const scripts = JSON.parse(readFileSync(p, "utf8")).scripts || {};
    for (const [k, v] of Object.entries(scripts)) assert.ok(!/AI_EVAL_LOCAL/.test(v), p + " script " + k);
    for (const [k, v] of Object.entries(scripts)) if (/wrangler\s+deploy/.test(v)) assert.ok(!/--var|--env/.test(v), k + ": deploy passes no extra variable");
  }
  const wf = join(ROOT, ".github", "workflows");
  if (existsSync(wf)) for (const f of readdirSync(wf)) assert.ok(!/AI_EVAL_LOCAL/.test(readFileSync(join(wf, f), "utf8")), f);
  // the only file that may carry it is the git-ignored backend/.dev.vars (tests/unit/backend-site.test.js checks the ignore rule)
});
