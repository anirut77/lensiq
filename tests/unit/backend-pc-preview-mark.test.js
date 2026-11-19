"use strict";
// tests/unit/backend-pc-preview-mark.test.js — owner decision 146 (2026-11-19, option ก), route 1: the Worker refuses every
// non-auto Product Check text request without the page's preview mark (previewed: true), in every script; Japanese / Korean
// keep their own code (ai_off_jako_preview). The mark comes from the request input; "auto" comes only from the gateway's
// second argument (a tester one-tap request, which goes through autoCheck instead), never from the input.
const test = require("node:test");
const assert = require("node:assert/strict");

const TEXTS = {
  th: "ยาแก้ปวด TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nส่วนประกอบ: พาราเซตามอล 500 มก.\nEXP 01/2028",
  en: "Vitamin C 60 tablets\nIngredients: ascorbic acid\nDirections: take 1 tablet daily\nMade by X Co., Ltd.\n0012345678905",
  zh: "维生素C片 保健食品\n配料：维生素C、淀粉\n用法用量：每日1次，每次1片\n生产企业：示例有限公司\n6901234567892",
  ja: "第2類医薬品 かぜ薬\n成分 アセトアミノフェン 300mg\n用法・用量 1回2錠 1日3回\n製造販売元 田村製薬株式会社\n4901234567894",
  ko: "종합비타민 건강기능식품\n원재료명 비타민C\n섭취방법 1일 1회 1정\n제조원 한빛제약\n8801234567893"
};

test("every script: no preview mark -> refused before any call; the mark (true only) -> accepted", async () => {
  const P = await import("../../backend/src/ai/pc-features.js");
  const code = fn => { try { fn(); return "ok"; } catch (e) { return P.refusalCode(e) || "error:" + e.message; } };
  assert.deepEqual([...P.PREVIEW_REFUSAL_CODES], ["ai_off_preview"]);
  for (const [lang, text] of Object.entries(TEXTS)) {
    const want = lang === "ja" || lang === "ko" ? "ai_off_jako_preview" : "ai_off_preview";
    const gtins = [text.split("\n").pop()].filter(x => /^\d+$/.test(x));
    for (const b of [P.buildFields, P.buildClaims, P.buildTranslate]) {
      const base = { text, gtins, script: lang === "ko" ? "ko" : "th", target: "en" };
      assert.equal(code(() => b(base, { mode: "text" })), want, `${lang}: no mark`);
      assert.equal(code(() => b({ ...base, previewed: "true" }, { mode: "text" })), want, `${lang}: the mark must be the boolean true`);
      assert.equal(code(() => b({ ...base, previewed: 1 }, { mode: "text" })), want, `${lang}: 1 is not the mark`);
      assert.equal(code(() => b({ ...base, auto: true }, { mode: "text" })), want, `${lang}: auto in the INPUT never replaces the mark`);
      assert.equal(code(() => b({ ...base, previewed: true }, { mode: "text" })), "ok", `${lang}: with the mark`);
    }
  }
});
