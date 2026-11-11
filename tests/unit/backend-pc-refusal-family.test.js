"use strict";
// tests/unit/backend-pc-refusal-family.test.js — P8 follow-up FIXED TEST SET (owner order 2026-11-12, written before the
// change): (F1) a refusal of the text itself carries a documented code next to the unchanged reason "bad_input";
// (F2) pc_claims with a product category drops signals outside the category's rule family (the rules the prompt
// listed) and returns only the COUNT. Mocked providers only; synthetic texts only (look-alikes, no measured text).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const siteverify = async () => new Response(JSON.stringify({ success: true, action: "ai", hostname: "site.example" }));
const envOf = (vars = {}) => createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ANTHROPIC_API_KEY: "sk-ant-test-" + "k".repeat(40), OPENAI_API_KEY: "o-test", ...vars });
const CHAIN = [{ provider: "anthropic", model: "claude-haiku-5-5" }, { provider: "openai", model: "gpt-6-luna" }];
const LOCAL = "http://localhost:8000";
const DEV = "http://127.0.0.1:8787";
const LOCAL_ENV = { ALLOWED_ORIGINS: "https://site.example," + LOCAL, TURNSTILE_DISABLED_FOR_LOCAL_DEV: "true", AI_EVAL_LOCAL: "1" };

// synthetic texts
const LABEL = "ยาแก้ปวด TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nรักษาหายขาด 100% ไม่มีผลข้างเคียง\nEXP 01/2028";
const HERBAL = "ยาสมุนไพรตราทดสอบ\nทะเบียนยาเลขที่ G 123/60\nบำรุงตับ ล้างสารพิษ รักษาเบาหวานหายขาด";
const FOOD = "นมผงสำหรับทารก ตราทดสอบ\nอย. 10-1-12345-1-0001\nเสริมสร้างสมอง ดีที่สุดสำหรับลูกน้อย";
const WITH_NAME = "ชื่อผู้ป่วย: สมมติ ทดสอบ\nยาแก้ปวด TESTOL 500 mg\nเลขทะเบียน 1A 844/39";
const DISPENSING = "โรงพยาบาลตัวอย่าง\nAMOXICILLIN 500 mg\nรับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร";
const PERSONAL_DOC = "ผู้รับ: ร้านค้า\nน้ำดื่ม 600 มล.";
const NO_PRODUCT = "ครีมช่วยให้ผิวกระจ่างใสทันใจ ไม่ต้องรอ";
const ZH_ADVERT = "专为糖尿病病人研制，服用后降低血糖，远离并发症"; // 病人 inside running text: no dispensing sign
const ZH_PACK = "国药准字Z20000000\n本品适用于高血压病人的辅助治疗。\n用法用量：口服，一次2粒，一日3次\n规格：0.5g×24粒";

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

/* ------------------------------ F1: documented refusal codes ------------------------------ */

test("F1-1 a refusal of the text answers reason bad_input (unchanged, HTTP 400, no provider call) plus a documented code, for all three features", async () => {
  const P = await import(B + "ai/pc-features.js");
  assert.deepEqual([...P.INPUT_REFUSAL_CODES], ["ai_off_personal_data", "ai_off_dispensing", "ai_off_personal_doc", "ai_off_no_product"]);
  const env = envOf();
  await setup(env, ["pc_fields", "pc_claims", "pc_translate"]);
  const cases = [
    [WITH_NAME, {}, "ai_off_personal_data"],
    [DISPENSING, {}, "ai_off_dispensing"],
    [PERSONAL_DOC, { gtins: ["8850006939727"] }, "ai_off_personal_doc"],
    [NO_PRODUCT, {}, "ai_off_no_product"]
  ];
  for (const f of ["pc_fields", "pc_claims", "pc_translate"]) {
    for (const [text, facts, code] of cases) {
      const a = fake("anthropic", () => ok({ signals: [] })), o = fake("openai", () => ok({ signals: [] }));
      const r = await post(env, f, body({ text, ...facts }), { anthropic: a.adapter, openai: o.adapter });
      assert.equal(r.status, 400, f + " " + code); assert.equal(r.j.fallback, true);
      assert.equal(r.j.reason, "bad_input", "the page and the eval runner keep keying on bad_input");
      assert.equal(r.j.code, code, f + ": " + text.slice(0, 20));
      assert.equal(a.calls.length + o.calls.length, 0, "no provider call");
      assert.ok(!JSON.stringify(r.j).includes(text.split("\n")[0]), "the refusal never echoes the text");
    }
  }
});

test("F1-2 a malformed request is bad_input WITHOUT a code; a success never carries one", async () => {
  const env = envOf();
  await setup(env, ["pc_claims", "pc_translate"]);
  const a = fake("anthropic", () => ok({ signals: [] }));
  for (const input of [{ text: "" }, { text: "x".repeat(8001) }, { text: 42 }]) {
    const r = await post(env, "pc_claims", body(input), { anthropic: a.adapter });
    assert.equal(r.status, 400); assert.equal(r.j.reason, "bad_input"); assert.equal(r.j.code, undefined, JSON.stringify(input).slice(0, 30));
  }
  const r = await post(env, "pc_claims", body({ text: LABEL }), { anthropic: a.adapter });
  assert.equal(r.status, 200); assert.equal(r.j.code, undefined);
  const { refusalCode } = await import(B + "ai/pc-features.js");
  assert.equal(refusalCode(Object.assign(new Error("x"), { code: "ai_off_something_else" })), null, "only a documented code leaves the Worker");
  assert.equal(refusalCode(null), null); assert.equal(refusalCode(new Error("AI off for this text: dispensing")), null);
});

test("F1-3 local evaluation mode: the product-label part is skipped (no code); dispensing and personal data are still refused with their code", async () => {
  const env = envOf(LOCAL_ENV);
  await setup(env, ["pc_claims"]);
  const a = fake("anthropic", () => ok({ signals: [] }));
  const opt = { origin: LOCAL, base: DEV };
  const r1 = await post(env, "pc_claims", body({ text: NO_PRODUCT }), { anthropic: a.adapter }, opt);
  assert.equal(r1.status, 200, "advert snippet reaches the model in local evaluation mode");
  const r2 = await post(env, "pc_claims", body({ text: DISPENSING }), { anthropic: a.adapter }, opt);
  assert.equal(r2.status, 400); assert.equal(r2.j.reason, "bad_input"); assert.equal(r2.j.code, "ai_off_dispensing");
  const r3 = await post(env, "pc_claims", body({ text: WITH_NAME }), { anthropic: a.adapter }, opt);
  assert.equal(r3.j.code, "ai_off_personal_data");
  assert.equal(a.calls.length, 1, "only the advert snippet was sent");
});

test("F1-4 Chinese running text with 病人 (patients) is no dispensing label: an advert is refused only for missing label evidence, a pack is allowed", async () => {
  const env = envOf();
  await setup(env, ["pc_claims"]);
  const a = fake("anthropic", () => ok({ signals: [] }));
  const r1 = await post(env, "pc_claims", body({ text: ZH_ADVERT, category: "supplement" }), { anthropic: a.adapter });
  assert.equal(r1.status, 400); assert.equal(r1.j.code, "ai_off_no_product", "deployed Worker: no label evidence (not dispensing, not personal data)");
  const r2 = await post(env, "pc_claims", body({ text: ZH_PACK, category: "drug" }), { anthropic: a.adapter });
  assert.equal(r2.status, 200, "a Chinese pack text with a registration number and 病人 in the indication reaches the model");
  assert.equal(a.calls.length, 1);
  assert.match(a.calls[0].r.text, /高血压病人的辅助治疗/, "sent whole: nothing after 病人 is removed as a name");
  const local = envOf(LOCAL_ENV);
  await setup(local, ["pc_claims"]);
  const b = fake("anthropic", () => ok({ signals: [] }));
  const r3 = await post(local, "pc_claims", body({ text: ZH_ADVERT, category: "supplement" }), { anthropic: b.adapter }, { origin: LOCAL, base: DEV });
  assert.equal(r3.status, 200, "local evaluation mode: the advert snippet is scored");
  assert.ok(b.calls[0].r.text.includes(ZH_ADVERT));
});

/* ------------------------------ F2: rule family filter ------------------------------ */

test("F2-1 verifyClaims with a category: off-family ids dropped (not rejected), in-family kept, count in meta; no category = unchanged", async () => {
  const P = await import(B + "ai/pc-features.js");
  const sig = [{ rule_id: "H01", evidence: "รักษาเบาหวานหายขาด" }, { rule_id: "F10", evidence: "บำรุงตับ" }, { rule_id: "D08", evidence: "รักษาเบาหวานหายขาด" },
    { rule_id: "F10", evidence: "ล้างสารพิษ" }, { rule_id: "H02", evidence: "บำรุงตับ" }];
  const v = P.verifyClaims(HERBAL, "herbal")({ signals: sig });
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.json.signals.map(s => s.rule_id), ["H01", "H02"]);
  assert.deepEqual(v.meta, { off_family_dropped: 3 });
  // an off-family signal whose span is not in the text is dropped too: it does not reject (and retry) the whole answer
  const v2 = P.verifyClaims(HERBAL, "herbal")({ signals: [{ rule_id: "F10", evidence: "not in the text" }, { rule_id: "H01", evidence: "รักษาเบาหวานหายขาด" }] });
  assert.deepEqual(v2.errors, []); assert.deepEqual(v2.json.signals.map(s => s.rule_id), ["H01"]); assert.deepEqual(v2.meta, { off_family_dropped: 1 });
  // an IN-family hallucinated span still rejects the answer
  assert.ok(P.verifyClaims(HERBAL, "herbal")({ signals: [{ rule_id: "H01", evidence: "not in the text" }] }).errors.length > 0);
  // every signal off-family: an empty, valid answer
  const v3 = P.verifyClaims(HERBAL, "herbal")({ signals: [{ rule_id: "D08", evidence: "บำรุงตับ" }] });
  assert.deepEqual(v3.json, { signals: [] }); assert.deepEqual(v3.meta, { off_family_dropped: 1 });
  // no category: every rule id of the schema kept, no metadata (current behaviour)
  const v4 = P.verifyClaims(HERBAL)({ signals: sig });
  assert.deepEqual(v4.json.signals.map(s => s.rule_id), ["H01", "F10", "D08", "F10", "H02"]); assert.equal(v4.meta, undefined);
  assert.equal(P.verifyClaims(HERBAL, null)({ signals: sig }).meta, undefined);
});

test("F2-2 F22 (infant formula) only for food: dropped on supplement and every other category, kept on food", async () => {
  const P = await import(B + "ai/pc-features.js");
  const s = { signals: [{ rule_id: "F22", evidence: "นมผงสำหรับทารก" }, { rule_id: "F02", evidence: "ดีที่สุดสำหรับลูกน้อย" }] };
  const food = P.verifyClaims(FOOD, "food")(s);
  assert.deepEqual(food.json.signals.map(x => x.rule_id), ["F22", "F02"]); assert.deepEqual(food.meta, { off_family_dropped: 0 });
  const supp = P.verifyClaims(FOOD, "supplement")(s);
  assert.deepEqual(supp.json.signals.map(x => x.rule_id), ["F02"]); assert.deepEqual(supp.meta, { off_family_dropped: 1 });
  for (const cat of ["drug", "herbal", "cosmetic"]) assert.deepEqual(P.verifyClaims(FOOD, cat)(s).json.signals, [], cat);
  // the filter is the SAME list the prompt offers (claimRulesFor), for every category
  for (const cat of ["drug", "supplement", "food", "herbal", "cosmetic"]) {
    const listed = [...P.buildClaims({ text: LABEL, category: cat }).system.matchAll(/^([A-Z]\d\d): /gm)].map(m => m[1]);
    assert.deepEqual(listed, P.claimRulesFor(cat).map(r => r[0]), cat);
    const all = { signals: P.RULE_IDS.map(id => ({ rule_id: id, evidence: "TESTOL" })) };
    const kept = P.verifyClaims(LABEL, cat)(all);
    assert.deepEqual(kept.json.signals.map(x => x.rule_id), listed, cat + ": exactly the listed rules survive");
    assert.equal(kept.meta.off_family_dropped, P.RULE_IDS.length - listed.length, cat);
  }
  assert.ok(!P.claimRulesFor("supplement").some(r => r[0] === "F22")); assert.ok(P.claimRulesFor("food").some(r => r[0] === "F22"));
});

test("F2-3 through the gateway: schema unchanged, no verdict field, dropped count in response meta (a count only), no meta without a category", async () => {
  const P = await import(B + "ai/pc-features.js");
  assert.deepEqual(P.CLAIMS_SCHEMA.properties.signals.items.properties.rule_id.enum, [...P.RULE_IDS], "the schema still lists every rule id");
  assert.deepEqual(Object.keys(P.CLAIMS_SCHEMA.properties), ["signals"]);
  const env = envOf();
  await setup(env, ["pc_claims"]);
  const answer = { signals: [{ rule_id: "H01", evidence: "รักษาเบาหวานหายขาด" }, { rule_id: "F10", evidence: "บำรุงตับ" }, { rule_id: "D08", evidence: "รักษาเบาหวานหายขาด" }] };
  const a = fake("anthropic", () => ok(answer));
  const r = await post(env, "pc_claims", body({ text: HERBAL, category: "herbal" }), { anthropic: a.adapter });
  assert.equal(r.status, 200); assert.equal(a.calls.length, 1, "dropping is not a schema error: no retry");
  assert.deepEqual(r.j.json.signals.map(s => [s.rule_id, s.evidence]), [["H01", "รักษาเบาหวานหายขาด"]]);
  assert.deepEqual(Object.keys(r.j.json), ["signals"]);
  for (const s of r.j.json.signals) assert.deepEqual(Object.keys(s).sort(), ["evidence", "rule_id", "start"]);
  assert.deepEqual(r.j.meta, { off_family_dropped: 2 });
  const VERDICT = /illegal|legal|fake|genuine|authentic|counterfeit|safe|verdict|score|approved|compliant|risk_level|confidence/i;
  const keys = JSON.stringify(r.j).match(/"[A-Za-z_]+":/g).join(" ");
  assert.ok(!VERDICT.test(keys), "no verdict field anywhere in the answer: " + keys);
  assert.ok(!JSON.stringify(r.j.meta).includes("F10") && !JSON.stringify(r.j.meta).includes("D08"), "no dropped rule id in the metadata");
  assert.ok(!JSON.stringify(r.j).includes("บำรุงตับ"), "the dropped evidence never leaves the Worker");
  // no category: unchanged, every id kept, no meta key at all
  const r2 = await post(env, "pc_claims", body({ text: HERBAL }), { anthropic: fake("anthropic", () => ok(answer)).adapter });
  assert.deepEqual(r2.j.json.signals.map(s => s.rule_id), ["H01", "F10", "D08"]); assert.ok(!("meta" in r2.j));
  // an unknown category string counts as no category (buildClaims ignores it, so does the filter)
  const r3 = await post(env, "pc_claims", body({ text: HERBAL, category: "device" }), { anthropic: fake("anthropic", () => ok(answer)).adapter });
  assert.equal(r3.j.json.signals.length, 3); assert.ok(!("meta" in r3.j));
  // other features never carry meta
  await setup(env, ["pc_translate"]);
  const t = await post(env, "pc_translate", body({ text: LABEL, target: "en" }), { anthropic: fake("anthropic", () => ok({ source_language: "th", lines: [] })).adapter });
  assert.equal(t.status, 200); assert.ok(!("meta" in t.j));
});

test("F2-4 the gateway passes a validator's metadata as counts only (no text, no ids, no nesting)", async () => {
  const { verifyMeta } = await import(B + "ai/gateway.js");
  assert.deepEqual(verifyMeta({ off_family_dropped: 2 }), { off_family_dropped: 2 });
  assert.equal(verifyMeta(undefined), null); assert.equal(verifyMeta([1]), null); assert.equal(verifyMeta("x"), null);
  assert.deepEqual(verifyMeta({ off_family_dropped: 1, rule: "F10", ids: ["F10"], evidence: "บำรุงตับ", neg: -1, frac: 1.5, Upper: 3, nested: { a: 1 } }), { off_family_dropped: 1 });
  assert.equal(verifyMeta({ rule: "F10" }), null);
});
