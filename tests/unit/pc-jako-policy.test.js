"use strict";
// tests/unit/pc-jako-policy.test.js — owner decision 2026-11-14 (option ข and stricter): text with Japanese script (kana,
// or kanji in a Japanese context) or Korean script (hangul) is NEVER sent to AI automatically, on any path, and never as a
// photo; the user may still send the TEXT after the open preview. Enforced on the page (lensiq-pc-ai.js, lensiq-pc-live.js)
// and in the Worker (backend/src/ai/pc-features.js; fortune: fortune-ai.js + backend/src/fortune.js). Also the stream pc-jk
// bare-name shapes on JA / KO text. Synthetic texts written for this test (not from any hold-out).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const G = require("../../lensiq-pc-guard.js");
const LV = require("../../lensiq-pc-live.js");
const PCAI = require("../../lensiq-pc-ai.js");
const FA = require("../../fortune-ai.js");
const ROOT = path.join(__dirname, "../..");

const JA = "のどスッキリ飴 80g\n原材料名 砂糖 水あめ ハーブエキス\n販売者 さくら製菓株式会社\n4901234567894";
const KO = "비타민C 1000 60정\n원재료명 비타민C 셀룰로스\n판매원 한빛헬스(주)\n8801234567893";
const ZH_S = "维生素C咀嚼片 60片\n配料 维生素C 山梨糖醇\n生产商 华康药业有限公司\n6901234567892";
const ZH_T = "維生素C錠 60錠\n成分 維生素C 纖維素\n製造商 台康藥品股份有限公司\n4711234567893";
const TH = "วิตามินซี 1000 มก. 60 เม็ด\nส่วนประกอบ วิตามินซี\nเลขทะเบียน อย. 10-1-12345-5-0001\n8851234567896";

test("jakoScript: kana, hangul, Japanese-only kanji and era dates count; Chinese (simplified / traditional), Thai and Latin do not", () => {
  for (const t of [JA, KO, "ﾋﾞﾀﾐﾝC", "医薬品 錠剤", "佐々木", "令和7年3月", "㌔", "ㄱㄴ", "(株)ﾃｽﾄ"]) assert.equal(G.jakoScript(t), true, t);
  for (const t of [ZH_S, ZH_T, TH, "Vitamin C 500 mg", "", "藥品 每日兩次", "药品 每日两次"]) assert.equal(G.jakoScript(t), false, t);
  assert.equal(G.jakoScript("Vitamin C", { script: "ko" }), true, "the user's own Korean script choice counts");
});

test("one-tap: autoBlock and autoDecision refuse JA / KO text with its own reason; Thai and Chinese labels are unchanged", () => {
  const ok = { tester: true, autoOn: true, hidden: false, face: { ran: true, faces: 0 }, key: "k", sent: [], count: 0, cap: 1 };
  for (const t of [JA, KO]) {
    assert.equal(G.autoBlock(t), true);
    const facts = { gtins: [t.split("\n").pop()] };
    assert.equal(LV.autoDecision({ ...ok, ...LV.autoTextCheck(G, t, facts) }).reason, "jako", t);
  }
  assert.equal(LV.autoDecision({ ...ok, ...LV.autoTextCheck(G, "Vitamin C 60 tablets\nIngredients ascorbic acid\nMade by X Co., Ltd.", { gtins: ["8801234567893"] }, { script: "ko" }) }).reason, "jako");
  for (const t of [ZH_S, TH]) {
    const facts = { gtins: [t.split("\n").pop()] };
    assert.notEqual(LV.autoDecision({ ...ok, ...LV.autoTextCheck(G, t, facts) }).reason, "jako", t);
  }
});

test("photo: decide() offers text only for JA / KO even when the guard found nothing; imageCheck itself is unchanged", () => {
  const f = ["pc_fields", "pc_claims", "pc_translate"];
  assert.equal(G.imageCheck(JA).block, false);
  assert.deepEqual(PCAI.decide({ mode: "image", image: G.imageCheck(JA), features: f, jako: true }), { offer: "text" });
  assert.deepEqual(PCAI.decide({ mode: "image", image: G.imageCheck(ZH_S), features: f, jako: false }), { send: "image" });
  assert.deepEqual(PCAI.decide({ mode: "text", image: G.imageCheck(JA), features: f, jako: true }), { send: "text" });
});

test("Worker (second check): JA / KO text needs previewed: true, never a photo, never auto; other text unchanged", async () => {
  const P = await import("../../backend/src/ai/pc-features.js");
  const code = (/** @type {Function} */ fn) => { try { fn(); return "ok"; } catch (e) { return P.refusalCode(e) || "error:" + e.message; } };
  const img = [{ mime: "image/jpeg", base64: "AA==", width: 1, height: 1 }];
  for (const t of [JA, KO]) {
    const base = { text: t, gtins: [t.split("\n").pop()] };
    for (const b of [P.buildFields, P.buildClaims, P.buildTranslate]) {
      assert.equal(code(() => b(base, { mode: "text" })), "ai_off_jako_preview", "no preview mark");
      assert.equal(code(() => b({ ...base, previewed: "yes" }, { mode: "text" })), "ai_off_jako_preview", "the mark must be true");
      assert.equal(code(() => b({ ...base, previewed: true }, { mode: "text" })), "ok", "explicit send after the preview");
    }
    assert.equal(code(() => P.buildFields({ ...base, previewed: true, images: img }, { mode: "image" })), "ai_off_jako_photo");
    assert.equal(code(() => P.autoCheck({ ...base, previewed: true })), "ai_off_auto_filter", "auto never, even with the mark");
  }
  const lat = { text: "Vitamin C 60 tablets\nIngredients ascorbic acid\nMade by X Co., Ltd.", gtins: ["8801234567893"] };
  assert.equal(code(() => P.buildFields({ ...lat, script: "ko" }, { mode: "text" })), "ai_off_jako_preview", "script ko counts");
  assert.equal(code(() => P.buildFields(lat, { mode: "text" })), "ok");
  for (const t of [ZH_S, TH]) {
    const base = { text: t, gtins: [t.split("\n").pop()] };
    assert.equal(code(() => P.buildFields(base, { mode: "text" })), "ok", "public flow without the mark is unchanged for " + t.slice(0, 8));
    assert.equal(code(() => P.buildFields({ ...base, images: img }, { mode: "image" })), "ok");
  }
  assert.deepEqual([...P.JAKO_REFUSAL_CODES], ["ai_off_jako_preview", "ai_off_jako_photo"]);
});

test("page: every non-auto request carries previewed: true; the auto request never does; the JA / KO preview is always open", () => {
  const src = fs.readFileSync(path.join(ROOT, "lensiq-pc-ai.js"), "utf8");
  assert.match(src, /const pv = o\.auto \? \{\} : \{ previewed: true \};/);
  assert.equal((src.match(/\.\.\.fx, \.\.\.pv/g) || []).length, 4, "pc_fields (text + image), pc_claims, pc_translate");
  assert.match(src, /previewText\(g, g\.count > 0 \|\| disp \|\| jako \|\| !c\.remembered\)/);
  assert.match(src, /open: open \|\| jako \|\|/);
});

test("fortune: a JA / KO nickname or fact never reaches the model (page and Worker); the rule equals the guard's", () => {
  const corpus = [JA, KO, ZH_S, ZH_T, TH, "ゆうき", "민준", "佐々木", "令和元年", "昭和52年", "藥", "薬", "ﾃｽﾄ", "Tum", "ทูม", "２０２５", "円", "元"];
  for (const t of corpus) assert.equal(FA.privacy.jakoScript(t), G.jakoScript(t), t);
  const facts = { domain: "palm", topic: "overall", subject: { nickname: "ゆうき", ageBand: "25-34" }, headline: "ok",
    items: [{ id: "a", label: "เส้นชีวิต", tags: ["x"], meanings: { overall: ["ดี", "민준 씨"] } }, { id: "b", label: "手相の線", tags: [], meanings: {} }],
    extras: { tips: ["พักผ่อน", "ゆっくり"] } };
  const out = FA.privacy.withoutJaKo(facts);
  assert.equal(out.subject.nickname, undefined);
  assert.equal(out.subject.ageBand, "25-34");
  assert.deepEqual(out.items.map((/** @type {any} */ i) => i.id), ["a"]);
  assert.deepEqual(out.items[0].meanings.overall, ["ดี"]);
  assert.deepEqual(out.extras.tips, ["พักผ่อน"]);
  assert.ok(!/[ぁ-ヿ가-힣]/u.test(JSON.stringify(FA._internal.factsForAI(facts))), "factsForAI drops them on the page");
  const w = fs.readFileSync(path.join(ROOT, "backend/src/fortune.js"), "utf8");
  assert.match(w, /import ThaiCanonModule from "\.\.\/\.\.\/lensiq-thai-canon\.js";/, "the Worker imports the rule itself (fails closed)");
  assert.match(w, /facts = \/\*\* @type \{any\} \*\/ \(ThaiCanonModule\)\.withoutJaKo\(cleanFacts\(body\.facts\)\)/, "the Worker drops them again");
  // review findings 2026-11-14: compatibility forms and kanji-numeral era dates; the OCR output (not the edited box) decides the photo
  for (const t of ["㍻", "㋿", "🈀", "平成五年", "毎食後", "桜"]) assert.equal(G.jakoScript(t), true, t);
  for (const t of ["维生素C 每日", "說明書 每次"]) assert.equal(G.jakoScript(t), false, t);
  assert.match(fs.readFileSync(path.join(ROOT, "lensiq-pc-ai.js"), "utf8"), /const jako = jakoOf\(ocrText\(\) \|\| text\) \|\| jakoOf\(text\);/);
});

test("bare-name shapes on JA / KO text are removed; the same shapes on product words and on non-JA/KO text are kept", () => {
  const names = (/** @type {string} */ t) => G.redact(t).removed.map((/** @type {any} */ r) => r.text);
  const head = "原材料名 砂糖 水あめ\n販売者 さくら製菓株式会社\n4901234567894\n";
  const kh = "원재료명 정제수 설탕\n판매원 한빛식품(주)\n8801234567893\n";
  assert.deepEqual(names(head + "3号室 山口 花子"), ["山口 花子"]);
  assert.deepEqual(names(kh + "102호 박서준"), ["박서준"]);
  assert.deepEqual(names(head + "2年1組 けんた"), ["けんた"]);
  assert.deepEqual(names(head + "高 橋 美 咲"), ["高 橋 美 咲"]);
  assert.deepEqual(names(kh + "김 하 늘"), ["김 하 늘"]);
  assert.deepEqual(names(kh + "다은이 꺼"), ["다은"]);
  assert.deepEqual(names(head + "中島 陽菜"), ["中島 陽菜"]);
  assert.deepEqual(names(head + "Suzuki 蓮"), ["Suzuki 蓮"]);
  assert.deepEqual(names(head + "はるき 夕食後2錠"), ["はるき"]);
  assert.deepEqual(names(head + "2015.04.21"), ["2015.04.21"]);
  assert.deepEqual(names(kh + "현우 010-5550-1234").sort(), ["010-5550-1234", "현우"].sort());
  assert.deepEqual(names(head + "井\n上\n大\n和"), ["井\n上\n大\n和"]);
  assert.deepEqual(names("받는 곳\n" + kh + "부산광역시 해운대구 해운대로 12 3동 405호"), ["부산광역시 해운대구 해운대로 12 3동 405호"]);
  // product words in the same shapes stay
  for (const t of [head + "のどあめ", head + "ミルキー", kh + "유산균 하루 1포", kh + "어린이 하루 2회", kh + "일반의약품", kh + "화장품",
    head + "中村屋", head + "大人 1日3回", head + "賞味期限 2027.04.21", kh + "위장약 하루 3회", head + "こどもの", kh + "초코반 쿠키", kh + "새싹반 이유식"]) {
    assert.deepEqual(names(t).filter(x => !/^\d{13}$/.test(x)), [], t);
  }
  // nothing new on a text without JA / KO script
  assert.deepEqual(names("Ingredients sugar\nNet 50 g\n3 Room Anna"), []);
  assert.deepEqual(G.redact("配料 白砂糖\n净含量 50 g\n高 橋 美 咲").removed.filter((/** @type {any} */ r) => r.kind === "name"), [], "Chinese text: no JA / KO shape");
});

test("i18n: every new string exists in EN and ZH", () => {
  const keys = ["md.pc.ai.offerJako", "md.pc.ai.prevJako", "md.pc.ai.n.jakoPreview", "md.pc.ai.n.jakoPhoto", "md.pc.tap.w.jako"];
  const src = fs.readFileSync(path.join(ROOT, "lensiq-pc-ai.js"), "utf8");
  for (const f of ["i18n/en-med.js", "i18n/zh-med.js"]) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const k of keys) { assert.ok(s.includes(`"${k}":`), f + " " + k); assert.ok(src.includes(`"${k}"`), "used: " + k); }
  }
});
