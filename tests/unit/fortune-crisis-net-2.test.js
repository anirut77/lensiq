"use strict";
// tests/unit/fortune-crisis-net-2.test.js — FIXED TEST SET, amendment 2 of the crisis net (independent re-measure 2026-11-12
// of 0f0ae99: old set 46/52, new adversarial 10/40, benign 1/30 false trigger; spaced Chinese and letter-spaced English got
// full readings in the browser). Stricter only: tests/unit/fortune-crisis-net.test.js is unchanged and still runs.
// Locked before the fix (sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256, "crisis net amendment 2").
// Inputs are the reviewer's sets verbatim (synthetic): OLD52 and NEW40 must trigger, BENIGN30 must not.
// Decision recorded: everyday hyperbole (เหนื่อยจะตาย, 累死, 笑死, "killing me with deadlines") must NOT trigger; any
// "want to die" phrasing must, in any spacing, spelling, leetspeak or language mix.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const C = FA.crisis;
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

const OLD52 = [
  "อยากตาย", "อยาก ตาย", "อยากตายยยย", "ฆาตัวตาย", "ฆ่าตัวตาย", "ไม่อยากมีชีวิตอยู่", "ไม่อยากอยู่แล้ว", "อยากหายไปจากโลกนี้",
  "เหนื่อยจนไม่อยากหายใจ", "อยากไปให้พ้นๆ จากโลกนี้", "อยากจบชีวิต", "อยากนอนแล้วไม่ตื่น", "จะกินยานอนหลับให้หมดขวด", "คิดจะโดดตึก",
  "ไม่มีใครต้องการฉัน ฉันควรไปจากโลกนี้", "แฟนตบหน้าฉันทุกวัน", "พ่อเลี้ยงลวนลามหนู", "สามีชอบทำร้ายร่างกายฉัน", "kill my self", "kms",
  "i want to unalive myself", "I wanna end my own life", "want 2 die", "I don't want to be here anymore", "thinking about ending things",
  "I'm going to jump off a bridge", "my bf hits me", "my husband beat me last night", "I plan to take all my pills tonight", "W A N T  T O  D I E",
  "Wanting to die", "自殺", "我想自殺", "輕生", "跳樓", "自殘", "結束生命", "不想活了", "活不下去", "我想死", "我想去死", "想一了百了", "家暴", "老公打我", "男朋友经常打我", "我被家暴了", "想跳楼",
  "我想离开这个世界", "อยากตาย I want to die 想死", "ดวงจะดีไหม i want 2 d1e", "ช่วงนี้อยากตาย", "อยากตาย555",
];
const NEW40 = [
  ["th-indirect", "ไม่อยากอยู่บนโลกนี้แล้ว"], ["th-misspell", "อยากต๊ายยยย"], ["th-misspell", "อยากตัยแล้ว"],
  ["th-slang", "อยากไปเกิดใหม่ เหนื่อยกับชีวิตมาก"], ["th-indirect", "ทุกคนคงสบายขึ้นถ้าไม่มีฉัน"],
  ["th-indirect", "ไม่อยากเป็นภาระใครแล้ว จะไปให้พ้น"], ["th-method", "ซื้อเชือกมาแล้ว คืนนี้จะจบ"], ["th-method", "จะเผาถ่านในห้อง"],
  ["th-slang", "ไม่ไหวแล้ว อยากไปจากโลกนี้"], ["th-isan", "อยากตายคักๆ เด้อ"], ["th-isan", "บ่อยากอยู่แล้ว"],
  ["th-isan", "เบิ่ดใจ บ่อยากมีชีวิตอยู่"], ["th-northern", "บ่อยากอยู่แล้วเจ้า อยากต๋าย"], ["th-minor-abuse", "ครูจับตัวหนูไม่เหมาะสม หนูกลัว"],
  ["th-minor-abuse", "อาชอบเข้ามาจับหนูตอนกลางคืน"], ["th-abuse", "ผัวกระทืบกูทุกคืน"], ["en-spaced", "k i l l m y s e l f"],
  ["en-leet", "i w4nt t0 d13"], ["en-leet", "k1ll mys3lf"], ["en-indirect", "everyone would be better off without me"],
  ["en-indirect", "I just want it all to stop forever"], ["en-indirect", "I'm planning to end it tonight"],
  ["en-indirect", "i'd rather not be alive"], ["en-slang", "gonna kys"], ["en-method", "I've been stockpiling pills"],
  ["en-minor-abuse", "my teacher touches me and says not to tell"], ["en-minor-abuse", "my uncle makes me do things I don't like at night"],
  ["en-abuse", "my step-dad beats me"], ["zh", "活着没意思"], ["zh", "我不想活下去了"], ["zh-indirect", "没有我大家会过得更好"], ["zh-pinyin", "wo xiang si"],
  ["zh-pinyin", "xiang si le, bu xiang huo le"], ["zh-trad", "我想結束自己的生命"], ["zh-minor-abuse", "继父晚上进我房间摸我"], ["zh-abuse", "我老公天天打我"], ["ja", "死にたい"],
  ["ja", "消えたい"], ["emoji-mixed", "🔪🩸 อยากตาย 😭"], ["mixed", "อยาก die มากๆ"],
];
const BENIGN30 = [
  "ดวงชะตาเรื่องความตาย ของไพ่ Death", "ไพ่ Death กลับหัวหมายถึงอะไร", "die Hochzeit ist im Mai, ist das ein guter Tag?",
  "kill time while waiting for the reading", "笑死我了", "เหนื่อยจะตายอยู่แล้ว งานเยอะ", "ร้อนจะตาย ฤกษ์ย้ายบ้านเดือนเมษาดีไหม", "หิวจะตาย ขอดวงความรัก",
  "อยากรู้ว่าตายแล้วไปไหน ตามความเชื่อ", "ฝันว่าคนตาย หมายถึงอะไร", "ฝันเห็นงูกัดตาย", "ฝันว่าตัวเองตาย", "ตายายของฉันเกิดปีขาล",
  "ปลาตายในตู้ ฮวงจุ้ยไม่ดีไหม", "อยากย้ายไปอยู่ต่างประเทศ ไม่อยากอยู่ที่นี่แล้ว งานไม่ดี", "ต้นไม้ตายหมดเลย ทำเลบ้านไม่ดีหรือเปล่า",
  "my phone battery is dying", "the Tower and Death cards came up together", "I'd kill for a promotion this year",
  "my boss is killing me with deadlines", "my brother beat me at badminton", "my mom hit me with a surprise party",
  "Is 2027 a good year to end my lease?", "相思病怎么办，他喜欢我吗", "死神牌逆位什么意思", "累死我了，想问事业运", "我爷爷去年去世了，想看看家运", "梦见死人是什么意思",
  "Diet plan: want to drop 2 dress sizes", "skills killer app — lucky colour for launch",
];
// spacing / leetspeak / dialect variants (the browser misses)
const SPACED = ["我 想 死", "自 杀", "我 不想 活 了", "I w a n t t o d i e", "k i l l m y s e l f", "W A N T  T O  D I E", "อ ย า ก ฆ่ า ตั ว ต า ย", "อยาก  ตาย",
  "i w4nt t0 d13", "k1ll mys3lf", "บ่อยากอยู่แล้ว", "我 想 自 殺"];

test("amendment 2: the reviewer's old set — 52/52 trigger", () => {
  assert.equal(OLD52.length, 52);
  assert.deepEqual(OLD52.filter(t => !C.check(t)), []);
});
test("amendment 2: the reviewer's new adversarial set — 40/40 trigger (TH dialect/misspelling, EN leet/indirect, ZH pinyin, JA, emoji, mixed)", () => {
  assert.equal(NEW40.length, 40);
  assert.deepEqual(NEW40.filter(([, t]) => !C.check(t)).map(([c, t]) => c + ": " + t), []);
});
test("amendment 2: benign set — 0/30 false triggers (hyperbole, fortune vocabulary, idioms, 'hit me with a surprise party')", () => {
  assert.equal(BENIGN30.length, 30);
  assert.deepEqual(BENIGN30.filter(t => C.check(t)), []);
});
test("amendment 2: spaced Chinese, letter-spaced and leetspeak English, Isan บ่ all trigger", () => {
  assert.deepEqual(SPACED.filter(t => !C.check(t)), []);
});
test("amendment 2 wiring (horoscope): partner name and name-number fields are checked; a crisis name replaces every reading tab and is not echoed", () => {
  const h = read("horoscope.js");
  assert.match(h, /\$\("#hsPartner"\)\.addEventListener\("submit"[\s\S]{0,300}crisisHit\(/, "partner submit checks the partner name first");
  assert.match(h, /hsNameNum[\s\S]{0,400}crisisHit\(/, "the name-number field is checked");
  assert.match(h, /\$\("#hsForm"\)\.addEventListener\("submit"[\s\S]{0,400}crisisHit\(/, "the main form checks the page fields before any reading");
  assert.match(h, /function showCrisis\([\s\S]{0,800}\["pn-ov", "pn-th", "pn-bz", "pn-nu", "pn-td"\][\s\S]{0,400}hsResSub/, "every tab cleared and the subtitle emptied");
});
