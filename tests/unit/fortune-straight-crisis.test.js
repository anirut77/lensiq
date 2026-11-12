"use strict";
// tests/unit/fortune-straight-crisis.test.js — FIXED TEST (Part C amendment 2, owner decision 2026-11-12; locked before the
// change, sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256). With straight mode ON and an adult who chose it:
// when the crisis net, the soft step or the support card is active on the page, NO straight-mode reading and NO remedy /
// lucky-item text (remedy frames, lucky colours, the three-step plan) is produced. With a plain page, straight mode works.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");

const REMEDY = {
  th: /วิธีปรับตามตำรา|สิ่งที่ควรทำตามตำรา|เคล็ดเสริมดวง|วิธีเสริมจุดนี้|สีที่เข้ากับผลครั้งนี้|สี[^\s]{0,12}ช่วยเสริมพลัง|ถ้าอยากใช้สีช่วยเสริม|ทิศที่ส่งเสริม|ทิศมงคล/,
  en: /A simple adjustment|Try this simple adjustment|For color, you could add|tones suit you/i,
  zh: /调整的方法是|建议这样调整|颜色上可以多用|这段时间和你比较合/,
};
function page({ fields = [], card = false }) {
  return {
    querySelectorAll: () => fields.map(v => ({ value: v })),
    querySelector: sel => (card && /fa-support|fa-soft/.test(sel) ? {} : null),
  };
}
function withPage(doc, fn) {
  const had = {}, keys = ["LENSIQ_FORTUNE_STRAIGHT", "localStorage", "document"];
  for (const k of keys) had[k] = Object.prototype.hasOwnProperty.call(globalThis, k) ? [globalThis[k]] : null;
  const m = new Map();
  globalThis.LENSIQ_FORTUNE_STRAIGHT = true;
  globalThis.localStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  globalThis.document = doc;
  try { FA.straight.set({ adult: true, straight: true }); return fn(); } finally {
    for (const k of keys) if (had[k]) globalThis[k] = had[k][0]; else delete globalThis[k];
  }
}
const text = res => (res.sections || []).flatMap(s => s.paragraphs || []).join("\n");
const DOMS = ["bazi", "zodiac", "horoscope", "taksa"];

test("straight ON + soft-step words in a field: gentle reading, no remedy / lucky items, no plan (TH/EN/ZH)", async () => {
  const X = await exportTool();
  let n = 0;
  for (const fields of [["เหนื่อยจนทนไม่ไหวแล้ว"], ["I can't do this anymore"], ["我好累，撑不下去了"]]) {
    for (const d of DOMS) for (const lang of ["th", "en", "zh"]) {
      const facts = X.factsFor(d, 2, X.lcg(600 + d.length));
      const r = withPage(page({ fields }), () => FA.compose(facts, { seed: 4, lang }));
      n++;
      assert.notEqual(r.mode, "straight", `${d}/${lang}: straight while the soft step applies`);
      assert.ok(!(r.plan && r.plan.items && r.plan.items.length), `${d}/${lang}: plan shown`);
      assert.ok(!REMEDY[lang].test(text(r)), `${d}/${lang}: remedy / lucky text: ${(text(r).match(REMEDY[lang]) || [])[0]}`);
    }
  }
  assert.equal(n, 3 * DOMS.length * 3);
});

test("straight ON + support card or soft step on the page: gentle reading, no remedy / lucky items, no plan", async () => {
  const X = await exportTool();
  for (const d of DOMS) for (const lang of ["th", "en", "zh"]) {
    const facts = X.factsFor(d, 2, X.lcg(600 + d.length));
    const r = withPage(page({ fields: ["Somchai"], card: true }), () => FA.compose(facts, { seed: 4, lang }));
    assert.notEqual(r.mode, "straight", `${d}/${lang}`);
    assert.ok(!(r.plan && r.plan.items && r.plan.items.length), `${d}/${lang}: plan`);
    assert.ok(!REMEDY[lang].test(text(r)), `${d}/${lang}: remedy text`);
  }
});

test("straight ON + crisis words in a field: interpret() returns the support card, never a straight reading", async () => {
  const X = await exportTool();
  const facts = X.factsFor("bazi", 1, X.lcg(11));
  for (const v of ["อยากตาย", "I want to die", "我想死"]) {
    const r = await withPage(page({ fields: [v] }), () => FA.interpret(facts, { seed: 1, useAI: false }));
    assert.equal(r.source, "support", v);
  }
});

test("control: straight ON on a plain page reads straight (the flag above is what turns it off)", async () => {
  const X = await exportTool();
  const facts = X.factsFor("bazi", 2, X.lcg(606));
  const r = withPage(page({ fields: ["Somchai"] }), () => FA.compose(facts, { seed: 4, lang: "th" }));
  assert.equal(r.mode, "straight");
});
