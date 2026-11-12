"use strict";
// tests/unit/backend-pc-auto.test.js — Product Check live scan, TESTER-ONLY auto-send (owner order 2026-11-12): FIXED TEST
// SET written before the Worker change (sha256 in ~/LENSIQ-field/evals/live-scan/locked.sha256).
// The Worker must enforce the same rule as the page, not just the browser:
//   A1  a request marked auto (body.auto === true) is refused unless the tester gate is ON and the tester code is valid:
//       no gate (public / local / on-premise) -> 403 auto_not_allowed, 0 provider calls; gate on without or with a wrong
//       code -> 403 tester_required (as today); gate on + valid code -> served;
//   A2  the public flow is unchanged: the same request WITHOUT auto is served with no gate, and a text the device redacted
//       ([removed]) is still accepted on the preview path;
//   A3  an auto request is refused before any provider call (400 bad_input, code ai_off_auto_filter) when the text holds
//       the placeholder (something was removed: auto-send needs a capture where the guard found nothing), a POSSIBLE name
//       (LQPCGuard.possibleNames), or session evidence (option ข); checked AFTER the existing checks, so a dispensing label,
//       a personal document and a capture with no product evidence keep their own refusal codes; personal data left ->
//       ai_off_personal_data;
//   A4  "auto" must be a boolean: any other value is a malformed request (400 bad_request, 0 calls);
//   A5  auto is accepted only by the Product Check features (pc_fields / pc_claims / pc_translate): another feature with
//       auto -> 403 auto_not_allowed;
//   A6  an auto-only rate limit per caller (per minute and per day) on top of the feature limits; requests without auto
//       do not use it up;
//   A7  image mode: an auto request may carry the face-blurred photo (the face check itself is client-only, stated in
//       docs/product-check/LIVE-SCAN-RESULTS.md); the provider never receives the auto flag, the tester code or the facts.
// Mocked providers only (deps.aiAdapters); no key, no network; synthetic label text.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const CODE = "Mango-CANARY-7731-zebra-code";
const ORIGIN = "https://site.example";
const siteverify = async () => new Response(JSON.stringify({ success: true, action: "ai", hostname: "site.example" }));
const envOf = (vars = {}) => createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ANTHROPIC_API_KEY: "sk-ant-test-" + "k".repeat(40),
  TESTER_GATE: "required", TESTER_ACCESS_CODE: CODE, ...vars });
const CHAIN = [{ provider: "anthropic", model: "claude-haiku-5-5" }];
const LABEL = "ยาแก้ปวด TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nส่วนประกอบ: พาราเซตามอล 500 มก.\nEXP 01/2028";
const DISP = "ร้านยาสาธิต\nสมพร ใจสมมติ\nHN 6512345\nรับประทานครั้งละ 1 เม็ด\n" + LABEL;
const RECEIPT = "ใบเสร็จรับเงิน\nรวมทั้งสิ้น 250 บาท\n" + LABEL;
const FRONT = "ซาแมพลาม็อล ตราสาธิต\nบรรเทาปวด ลดไข้";
const FIELDS = { product_type: "drug", brand: "TESTOL", product_name: null, active_ingredients: [], dosage_form: null, registration: [], manufacturer: null, lot: null,
  expiry: null, claims_on_pack: [], languages_on_pack: [], unreadable: [] };
const IMG = { mime: "image/jpeg", base64: Buffer.from("JPEG-CANARY-BYTES-" + "x".repeat(200)).toString("base64"), width: 300, height: 200 };

function fake() {
  const calls = [];
  return { calls, adapters: { anthropic: { id: "anthropic", capabilities: () => ({ vision: true, jsonSchema: "native" }), region: () => "test-region",
    async call(r, entry) { calls.push({ r, entry }); return { ok: true, json: r.output && r.output.name === "pc_claims" ? { signals: [] }
      : r.output && r.output.name === "pc_translate" ? { source_language: "th", lines: [] } : FIELDS, model: "served", usage: { inputTokens: 100, outputTokens: 50 } }; } } } };
}
async function setup(env, o = {}) {
  const { putGateway } = await import(B + "ai/settings.js");
  const f = {};
  for (const id of ["pc_fields", "pc_claims", "pc_translate"]) f[id] = { enabled: true, chain: CHAIN, monthlyBudgetUsd: 5, perUserDaily: 1000, perUserPerMinute: 600, globalPerMinute: 10000,
    ...(id === "pc_fields" ? { imageModeAllowed: true } : {}), ...(o[id] || {}) };
  await putGateway(env.DB, { enabled: true, features: f });
}
async function post(env, feature, body, a, o = {}) {
  const { handle } = await import(B + "index.js");
  const headers = { "X-Turnstile-Token": "good", ...(o.code ? { "X-Tester-Code": o.code } : {}) };
  const r = await handle(req("/v1/ai/" + feature, { method: "POST", body, headers, origin: ORIGIN, ip: o.ip }), env, { fetch: siteverify, aiAdapters: a.adapters, sleep: async () => {},
    ...(o.deps || {}) });
  return { status: r.status, j: await r.json() };
}
const body = (input, extra = {}, mode = "text") => ({ consent: true, providers: ["anthropic"], mode, input, ...extra });

test("A1 auto needs the tester gate ON and a valid tester code; otherwise refused before any provider call", async () => {
  // no gate at all (public site without the closed test, local, on-premise): auto is never allowed
  let env = envOf({ TESTER_GATE: "", TESTER_ACCESS_CODE: undefined });
  await setup(env);
  let a = fake();
  let r = await post(env, "pc_fields", body({ text: LABEL }, { auto: true }), a);
  assert.deepEqual([r.status, r.j.fallback, r.j.reason], [403, true, "auto_not_allowed"], JSON.stringify(r.j));
  assert.equal(a.calls.length, 0, "no provider call");
  // gate on, no code / wrong code: the gate refuses first (as today)
  env = envOf();
  await setup(env);
  a = fake();
  r = await post(env, "pc_fields", body({ text: LABEL }, { auto: true }), a);
  assert.deepEqual([r.status, r.j.reason], [403, "tester_required"]);
  r = await post(env, "pc_fields", body({ text: LABEL }, { auto: true }), a, { code: "wrong-code-CANARY-0042-quokka" });
  assert.deepEqual([r.status, r.j.reason], [403, "tester_required"]);
  assert.equal(a.calls.length, 0);
  // gate on + valid code: served
  r = await post(env, "pc_fields", body({ text: LABEL }, { auto: true }), a, { code: CODE });
  assert.deepEqual([r.status, r.j.ok], [200, true], JSON.stringify(r.j));
  assert.equal(a.calls.length, 1);
});

test("A2 the public flow is unchanged: no auto flag -> served without a gate; a redacted text is still accepted on the preview path", async () => {
  const env = envOf({ TESTER_GATE: "", TESTER_ACCESS_CODE: undefined });
  await setup(env);
  const a = fake();
  let r = await post(env, "pc_fields", body({ text: LABEL }), a);
  assert.deepEqual([r.status, r.j.ok], [200, true], JSON.stringify(r.j));
  r = await post(env, "pc_fields", body({ text: LABEL }, { auto: false }), a);
  assert.deepEqual([r.status, r.j.ok], [200, true], "auto:false is the ordinary path");
  r = await post(env, "pc_claims", body({ text: LABEL + "\n[removed]" }), a);
  assert.deepEqual([r.status, r.j.ok], [200, true], "the preview path still takes a redacted text " + JSON.stringify(r.j));
  assert.equal(a.calls.length, 3);
});

test("A3 auto refuses, before any provider call: the placeholder, a possible name, session evidence; dispensing / personal document / no product keep their codes", async () => {
  const env = envOf();
  await setup(env);
  const a = fake();
  const cases = [
    [{ text: LABEL + "\n[removed]" }, "ai_off_auto_filter", "something was removed on the device"],
    [{ text: LABEL + "\nSomchai Jaidee" }, "ai_off_auto_filter", "a possible name"],
    [{ text: LABEL, sessionGtins: ["8850006939727"] }, "ai_off_auto_filter", "session evidence (option ข) is never used for auto"],
    [{ text: DISP }, "ai_off_personal_data", "a dispensing label with a name and HN"],
    [{ text: "ร้านยาสาธิต\nรับประทานครั้งละ 1 เม็ด หลังอาหาร วันละ 3 ครั้ง\nวันที่จ่ายยา 10/11/2569\nPARACETAMOL 500 mg" }, "ai_off_dispensing", "a dispensing label"],
    [{ text: RECEIPT }, "ai_off_personal_doc", "a receipt"],
    [{ text: FRONT }, "ai_off_no_product", "a front panel"],
    [{ text: LABEL + "\nโทร 081-234-5678" }, "ai_off_personal_data", "a personal phone"]
  ];
  for (const [input, code, why] of cases) {
    for (const f of ["pc_fields", "pc_claims", "pc_translate"]) {
      const r = await post(env, f, body({ ...input, target: "en" }, { auto: true }), a, { code: CODE });
      assert.deepEqual([r.status, r.j.reason, r.j.code], [400, "bad_input", code], `${f}: ${why} ${JSON.stringify(r.j)}`);
    }
  }
  assert.equal(a.calls.length, 0, "no provider call for any of them");
  // the same possible-name text WITHOUT auto goes through the preview path as today (the user saw it underlined)
  const r = await post(env, "pc_fields", body({ text: LABEL + "\nSomchai Jaidee" }), a, { code: CODE });
  assert.deepEqual([r.status, r.j.ok], [200, true], "manual path unchanged " + JSON.stringify(r.j));
});

test("A4 'auto' must be a boolean", async () => {
  const env = envOf();
  await setup(env);
  const a = fake();
  for (const v of ["true", 1, "yes", {}, [true], null]) {
    const r = await post(env, "pc_fields", body({ text: LABEL }, { auto: v }), a, { code: CODE });
    assert.deepEqual([r.status, r.j.reason], [400, "bad_request"], "auto = " + JSON.stringify(v));
  }
  assert.equal(a.calls.length, 0);
});

test("A5 auto is accepted only by the Product Check features", async () => {
  const env = envOf();
  const OUT = { type: "object", properties: { answer: { type: "string", maxLength: 40 } }, required: ["answer"], additionalProperties: false };
  const FEAT = { t_auto: { id: "t_auto", status: "live", imageCapable: false, label: { th: "ทดสอบ", en: "Test", zh: "测试" },
    build: input => ({ system: "S", text: String(input.text || ""), output: { name: "t_auto", schema: OUT } }) } };
  const { putGateway } = await import(B + "ai/settings.js");
  await putGateway(env.DB, { enabled: true, features: { t_auto: { enabled: true, chain: CHAIN, monthlyBudgetUsd: 5, perUserDaily: 100, perUserPerMinute: 100, globalPerMinute: 1000 } } },
    { features: FEAT });
  const a = fake();
  a.adapters.anthropic.call = async () => { a.calls.push(1); return { ok: true, json: { answer: "ok" }, model: "m", usage: { inputTokens: 1, outputTokens: 1 } }; };
  let r = await post(env, "t_auto", body({ text: "hello" }, { auto: true }), a, { code: CODE, deps: { aiFeatures: FEAT } });
  assert.deepEqual([r.status, r.j.reason], [403, "auto_not_allowed"], JSON.stringify(r.j));
  r = await post(env, "t_auto", body({ text: "hello" }), a, { code: CODE, deps: { aiFeatures: FEAT } });
  assert.deepEqual([r.status, r.j.ok], [200, true], "the same feature without auto is unchanged");
  assert.equal(a.calls.length, 1);
});

test("A6 an auto-only rate limit per caller (minute and day); requests without auto do not use it up", async () => {
  const { AUTO_PER_MINUTE, AUTO_PER_DAY } = await import(B + "ai/gateway.js");
  assert.ok(Number.isInteger(AUTO_PER_MINUTE) && AUTO_PER_MINUTE >= 3 && AUTO_PER_MINUTE <= 12, "per minute " + AUTO_PER_MINUTE);
  assert.ok(Number.isInteger(AUTO_PER_DAY) && AUTO_PER_DAY >= AUTO_PER_MINUTE && AUTO_PER_DAY <= 300, "per day " + AUTO_PER_DAY);
  const env = envOf();
  await setup(env);
  const a = fake();
  for (let i = 0; i < AUTO_PER_MINUTE + 3; i++) {
    const r = await post(env, "pc_fields", body({ text: LABEL }), a, { code: CODE, ip: "198.51.100.9" });
    assert.equal(r.status, 200, "manual request " + i);
  }
  let ok = 0, limited = 0;
  for (let i = 0; i < AUTO_PER_MINUTE + 2; i++) {
    const r = await post(env, i % 2 ? "pc_claims" : "pc_fields", body({ text: LABEL }, { auto: true }), a, { code: CODE, ip: "198.51.100.9" });
    if (r.status === 200) ok++; else { assert.deepEqual([r.status, r.j.reason], [429, "limit"]); limited++; }
  }
  assert.equal(ok, AUTO_PER_MINUTE, "exactly the auto per-minute allowance is served (across features)");
  assert.equal(limited, 2);
  // another caller has its own allowance
  const r = await post(env, "pc_fields", body({ text: LABEL }, { auto: true }), a, { code: CODE, ip: "198.51.100.77" });
  assert.equal(r.status, 200);
});

test("A7 image mode with auto: the face-blurred photo is accepted for a tester; the provider never sees the auto flag, the facts or the tester code", async () => {
  const env = envOf();
  await setup(env);
  const a = fake();
  const r = await post(env, "pc_fields", body({ text: LABEL, images: [IMG], gtins: ["8850006939727"], regs: ["1A 844/39"] }, { auto: true }, "image"), a, { code: CODE });
  assert.deepEqual([r.status, r.j.ok], [200, true], JSON.stringify(r.j));
  assert.equal(a.calls.length, 1);
  const sent = JSON.stringify(a.calls[0].r);
  assert.ok(sent.includes(IMG.base64), "the photo reached the provider");
  assert.ok(!/"auto"/.test(sent) && !sent.includes(CODE) && !sent.includes("8850006939727"), "no auto flag, tester code or barcode fact in the provider request");
});
