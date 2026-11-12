"use strict";
// tests/unit/fortune-crisis-net.test.js — FIXED TEST SET for the crisis net (independent review 2026-11-12: the patterns
// caught 19/52 adversarial inputs). Locked before the fix (sha256 "crisis net" in ~/LENSIQ-field/evals/fortune-honest/locked.sha256).
// All inputs are synthetic. The crisis net must:
//   1. catch self-harm / suicide / violence / sexual abuse (incl. of minors) in Thai (tone-mark-insensitive), Chinese
//      (simplified AND traditional) and English (slang, numerals);
//   2. NOT trigger on idioms or fortune vocabulary (counter-cases) or on any knowledge-base string or composed reading;
//   3. run on the RAW user input of every free-text field: interpret() checks userText and every free-text field of the page
//      (FortuneAI.crisis.fields(doc)), renderSections shows the support card instead of a reading when a field trips it,
//      the report page checks its name field, and the long-name filter on horoscope / tarot no longer hides a name from it.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const C = FA.crisis;
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

// ---- must trigger (65): the 33 the review found missed + 32 more across the same families --------------------------
const MUST = {
  "zh-traditional": ["自殺", "我想自殺", "輕生", "跳樓", "自殘", "結束生命", "我想從樓上跳下去", "爸爸經常打我", "繼父摸我"],
  "zh": ["我想去死", "想一了百了", "我想离开这个世界", "我不想活了", "活着没意思", "我想割腕", "他打我", "我被性侵了", "想吃安眠药自杀", "我想上吊", "我想烧炭", "我想消失"],
  "en": ["Wanting to die", "kill my self", "kms", "unalive", "end my own life", "want 2 die", "I don't want to be here anymore", "jump off a bridge",
    "my bf hits me", "my husband beat me last night", "take all my pills tonight", "I want to kill myself", "suicidal thoughts", "I'm going to end it all",
    "I wanna die", "I wish I was dead", "thinking about self harm", "I cut myself", "better off dead", "no reason to live", "I'm going to hang myself",
    "overdose on my meds", "my stepdad touches me", "my dad hits me", "I was raped"],
  "th": ["ฆาตัวตาย", "อยากนอนแล้วไม่ตื่น", "คิดจะโดดตึก", "จะกินยานอนหลับให้หมดขวด", "แฟนตบหน้าฉันทุกวัน", "สามีชอบทำร้ายร่างกายฉัน", "พ่อเลี้ยงลวนลามหนู",
    "อยากฆ่าตัวตาย", "ไม่อยากมีชีวิตอยู่แล้ว", "อยากตาย", "คิดสั้น", "อยากจบชีวิต", "กรีดข้อมือ", "กินยาเกินขนาด", "ผูกคอตาย", "แฟนทุบตีฉัน", "โดนข่มขืน",
    "ถูกล่วงละเมิดทางเพศ", "พ่อชอบตีหนูทุกวัน"],
};
// ---- must NOT trigger: idioms, jokes, fortune vocabulary --------------------------------------------------------------
const MUST_NOT = ["ตายแล้ว ลืมกุญแจ", "dying to know", "笑死了", "ดาวมฤตยู", "เบื่อจะตายอยู่แล้ว", "killing it at work", "kill time before the meeting",
  "this joke killed me", "my husband beat me at chess", "my boyfriend hits the gym every day", "he hit me up yesterday", "I'm dying of laughter", "饿死了",
  "累死了", "ไพ่ความตาย", "Death card", "死神牌", "jump at the chance", "take my vitamins", "แฟนตบมุกเก่ง", "กินยาหมดแผงตามที่หมอสั่ง", "ดวงดี อยากรู้เรื่องงาน",
  "สามีเป็นคนดี", "my dad hits the road early", "skills", "Kumsai", "我想知道今年的财运", "結婚的日子"];

test("crisis net: every must-trigger input (65, TH/ZH-simplified/ZH-traditional/EN) shows the support card", () => {
  let n = 0;
  const miss = [];
  for (const [fam, list] of Object.entries(MUST)) for (const t of list) { n++; if (!C.check(t)) miss.push(fam + ": " + t); }
  assert.equal(n, 65);
  assert.deepEqual(miss, [], "missed " + miss.length + "/" + n);
});

test("crisis net: no counter-case (idiom, joke, fortune vocabulary) triggers", () => {
  const hit = MUST_NOT.filter(t => C.check(t));
  assert.deepEqual(hit, []);
  assert.ok(MUST_NOT.length >= 28);
});

test("crisis net: tone marks and spacing do not matter in Thai; traditional and simplified Chinese both work", () => {
  for (const t of ["ฆ่าตัวตาย", "ฆาตัวตาย", "ฆ่า ตัว ตาย", "อยาก ตาย", "อยากตาย จริงๆ"]) assert.ok(C.check(t), t);
  for (const t of ["自杀", "自殺", "跳楼", "跳樓", "自残", "自殘"]) assert.ok(C.check(t), t);
});

test("crisis net: false triggers on every knowledge-base string and on composed readings (15 domains × TH/EN/ZH) are 0", async () => {
  const strings = [];
  const seen = new Set();
  const walk = v => {
    if (typeof v === "string") { strings.push(v); return; }
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v); (Array.isArray(v) ? v : Object.values(v)).forEach(walk);
  };
  for (const f of fs.readdirSync(ROOT).filter(f => /-kb\.js$/.test(f))) walk(require(path.join(ROOT, f)));
  for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) {
    const w = {}; w.window = w; require("node:vm").runInNewContext(read("i18n/" + f), w); walk(w);
  }
  const kbHits = strings.filter(t => C.check(t));
  const X = await import("../../tools/fortune-review-export.mjs");
  let n = 0; const rdHits = [];
  for (const d of X.DOMAINS) {
    const r = X.lcg(515 + d.length);
    for (let i = 0; i < 4; i++) {
      const facts = X.factsFor(d, i, r);
      for (const lang of ["th", "en", "zh"]) { n++; if (C.check(X.readingText(FA.compose(facts, { seed: 3 + i, lang })))) rdHits.push(d + "/" + lang); }
    }
  }
  assert.ok(strings.length > 5000, "strings " + strings.length);
  assert.deepEqual(kbHits.slice(0, 5), [], `KB false triggers ${kbHits.length}/${strings.length}`);
  assert.deepEqual(rdHits, [], `reading false triggers ${rdHits.length}/${n}`);
});

test("crisis net: interpret() checks the raw text of every free-text field on the page, not only the short nickname", async () => {
  const X = await import("../../tools/fortune-review-export.mjs");
  const facts = X.factsFor("horoscope", 1, X.lcg(9));
  const fakeDoc = vals => ({ querySelectorAll: () => vals.map(v => ({ value: v })) });
  assert.equal(typeof C.fields, "function", "FortuneAI.crisis.fields(doc) collects the page's free-text fields");
  assert.match(C.fields(fakeDoc(["Somchai", "I want to die"])), /I want to die/);
  const oldDoc = globalThis.document;
  try {
    for (const name of ["I want to die", "อยากตาย จริงๆ", "我想去死"]) {
      globalThis.document = fakeDoc([name]);
      const r = await FA.interpret(facts, { seed: 1, useAI: false });
      assert.equal(r.source, "support", name);
    }
    globalThis.document = fakeDoc(["Somchai Jaidee", "งานใหม่จะดีไหม"]);
    assert.notEqual((await FA.interpret(facts, { seed: 1, useAI: false })).source, "support");
  } finally { if (oldDoc === undefined) delete globalThis.document; else globalThis.document = oldDoc; }
});

test("crisis net wiring: renderSections checks every free-text field of the page; the report page checks its name field", () => {
  const fa = read("fortune-ai.js");
  assert.match(fa, /function renderWithHooks\([^)]*\) \{[\s\S]{0,400}crisisCheck\(pageText\(/, "renderSections shows the support card when a page field trips the net");
  assert.match(read("report.js"), /FA\.crisis\.check\([^)]*rpName/, "report.js checks the name field before rendering");
});
