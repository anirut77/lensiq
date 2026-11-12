"use strict";
// tests/unit/fortune-crisis-net-3.test.js — FIXED TEST SET, crisis net round 3 (independent set at 23c47d4: must-trigger 9/60,
// child sexual abuse 0/7, benign 1/40). Locked before the change (sha256 "crisis net ROUND 3" in
// ~/LENSIQ-field/evals/fortune-honest/locked.sha256). The reviewer's 100 inputs are DEVELOPMENT data from now on (a fresh
// held-out set is needed for the next independent measure). Three parts:
//   (A) fail-safe display: a typed name / question that is more than a plain name is never echoed (placeholder instead)
//   (B) soft check: ambiguous distress words, or a name field with > 3 words or a pronoun / verb, show a gentle
//       "are you okay?" step BEFORE any reading, with "I'd like to talk to someone" (support card) and "Just the reading"
//   (C) patterns: the reviewer's additions (child sexual abuse, Thai slang / negation spellings, English plain words and
//       methods, Chinese, KO / JA / MS / VI) and normalisation (! -> i, - and . between letters, >= 3 single letters joined).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const C = FA.crisis;
const CR = require("../../fortune-crisis.js");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

// [lang, family, text] — SH self-harm, PM plan/method, VI violence, CA child sexual abuse (reviewer's set, verbatim)
const MUST60 = [
  ["th", "SH", "ไม่อยากอยู่ในโลกนี้อีกต่อไปแล้ว"], ["th", "SH", "อยากหลับแล้วไม่ต้องตื่นอีกเลย"], ["th", "SH", "อยากตุยแล้วอ่ะ"],
  ["th", "SH", "อยากม่องเท่งไปเลย"], ["th", "PM", "เขียนจดหมายลาตายไว้แล้ว"], ["th", "SH", "ขอลาโลกนี้ไปก่อนนะทุกคน"],
  ["th", "SH", "ชีวิตไร้ค่า ตายๆไปซะดีกว่า"], ["th", "SH", "มะอยากมีชีวิตอยู่แล้ว"], ["th", "SH", "หม่ายอยากอยู่แล้วอ่ะ"],
  ["th", "SH", "ฆ่าตัวตาญดีไหม"], ["th", "PM", "คิดจะกระโดดน้ำตายที่สะพานพระราม 8"], ["th", "PM", "จะกินยาฆ่าหญ้าให้มันจบ"],
  ["th", "SH", "บ่อยากเป็นอยู่แล้ว เบื่อโลก"], ["th", "SH", "ข่อยอยากตายแล้ว"], ["th", "VI", "พ่อเมาแล้วเอาไม้ฟาดหนูทุกคืน"],
  ["th", "VI", "แฟนชอบบีบคอเวลาโกรธ"], ["th", "VI", "ผัวเอามีดจ่อคอขู่จะฆ่า"], ["th", "CA", "โดนพ่อเลี้ยงขืนใจ"],
  ["th", "CA", "ลุงข้างบ้านบังคับให้หนูถอดเสื้อ"], ["th", "CA", "น้าเขยแอบดูหนูอาบน้ำแล้วจับหน้าอก"], ["en", "SH", "i wanna d!e"],
  ["en", "SH", "k-m-s"], ["en", "SH", "su1c1de is the only way out"], ["en", "SH", "I don't wanna be alive anymore"],
  ["en", "SH", "been thinking about unaliving myself"], ["en", "SH", "sewerslide"], ["en", "SH", "I'm gonna off myself"],
  ["en", "SH", "I don't see the point in living anymore"], ["en", "SH", "I can't do this anymore, I just want to sleep forever"],
  ["en", "PM", "planning my exit, wrote goodbye letters to everyone"], ["en", "PM", "bought a rope, tonight's the night"],
  ["en", "PM", "how many paracetamol does it take to die"], ["en", "SH", "I wish I'd never wake up"],
  ["en", "VI", "my dad chokes me when he's drunk"], ["en", "VI", "my husband threatens to kill me"], ["en", "VI", "he forced himself on me"],
  ["en", "VI", "I was SA'd last week"], ["en", "CA", "my mom's boyfriend comes into my room at night"],
  ["en", "CA", "my coach sends me nude pics and says it's our secret"], ["en", "SH", "I want to d i e"], ["zh", "SH", "想结束这一切"],
  ["zh", "SH", "不如死了算了"], ["zh", "SH", "人间不值得，我想走了"], ["zh", "PM", "我准备好遗书了"], ["zh", "PM", "想割手腕"], ["zh", "VI", "爸爸喝醉就用皮带抽我"],
  ["zh", "VI", "男友掐我脖子"], ["zh-t", "CA", "他強迫我發生關係"], ["zh", "CA", "舅舅摸我下面"], ["zh-t", "SH", "我想輕 生"], ["zh-t", "SH", "活著沒意思"],
  ["zh-t", "PM", "我想吃一整瓶藥"], ["zh-t", "PM", "想從頂樓跳下去"], ["zh", "SH", "活 着 好 累 不 想 再 撑 了"], ["zh-t", "SH", "好想死掉"], ["ja", "SH", "もう消えてしまいたい"],
  ["ko", "SH", "죽고 싶어"], ["ms", "SH", "aku nak mati"], ["vi", "SH", "tôi muốn chết"], ["mixed", "SH", "อยากจะ end it all แล้ว"],
];
const BENIGN40 = [
  "ไพ่ Death ออกมาในตำแหน่งอนาคต แปลว่าอะไร", "ฝันว่าพ่อที่ตายไปแล้วมาหา", "ฝันว่าตกตึกตาย เลขอะไรดี", "ดาวมฤตยูย้ายราศีปีนี้ส่งผลอย่างไร",
  "ขำจนจะตายแล้ว", "รักเขามากจนแทบขาดใจ เขาจะกลับมาไหม", "คิดถึงแฟนเก่าจะตายอยู่แล้ว", "งานหนักจนอยากลาออก", "ตีกอล์ฟกับพ่อวันอาทิตย์ ฤกษ์ไหนดี",
  "ผมยิงประตูชนะทีมพ่อ", "แม่ตีราคาบ้านเท่าไหร่ดี", "ไม่อยากอยู่คอนโดแล้ว อยากย้ายบ้าน", "ปีนี้ชงไหม กลัวจะแย่", "ตัดผมวันไหนดี",
  "ฆ่าเวลารอสัมภาษณ์งาน", "kill time before my flight", "my boss is killing me lol, will I get a raise?", "die Antwort ist ja",
  "Death card reversed in a love reading", "I dreamt my grandma died, what does it mean?", "I'm dead tired, career outlook for 2027?",
  "this level is impossible, I died 20 times", "we killed it at the match yesterday", "my son beat me at chess again",
  "my partner hits the snooze button every morning", "dying my hair red, is it lucky?", "the Hanged Man came up, should I wait?",
  "my ex is dead to me, will I meet someone new?", "mortgage — when to pay it off?", "Tower card and the Ten of Swords together?", "相思成疾，他还会回来吗",
  "死神牌正位代表什么", "梦见自己死了好不好", "我老公打游戏打到半夜", "气死我了，事业运怎么样", "打死我也不说", "爷爷過世後家裡風水要注意什麼", "考試考砸了，想死的心都有了 哈哈——不，是想知道下次考運",
  "Kumusta, swerte ba ako ngayong taon?", "死んだ魚の目って言われる、恋愛運は？",
];
// plain fortune questions and plain names: no soft step (target: 0 of these 40)
const PLAIN = [
  "งานใหม่จะดีไหม", "ปีนี้การเงินเป็นอย่างไร", "ความรักช่วงนี้จะดีขึ้นไหม", "ควรย้ายบ้านเดือนไหนดี", "ไพ่ Death กลับหัวหมายถึงอะไร",
  "ดาวมฤตยูย้ายราศีปีนี้ส่งผลอย่างไร", "ฝันว่าคนตาย หมายถึงอะไร", "สีมงคลวันจันทร์คือสีอะไร", "เปิดร้านวันไหนดี", "เบอร์นี้ดีไหม",
  "ปีชงต้องระวังอะไร", "ดวงสอบเข้ามหาวิทยาลัย", "Will I get a new job this year?", "What does the Death card reversed mean in love?",
  "Is next month good for moving house?", "lucky colour for my interview", "How is my money luck in 2027?", "Should I start my business in spring?",
  "I dreamt my grandma died, what does it mean?", "What does the Tower card mean?", "Is this phone number lucky?",
  "When is a good day to sign a contract?", "Will my relationship get better?", "career outlook for next year", "今年事业运怎么样", "死神牌逆位什么意思", "梦见死人是什么意思",
  "什么时候搬家好", "我的财运如何", "今年适合结婚吗", "这个手机号码好不好", "考试运怎么样", "Somchai", "สมชาย ใจดี", "王小明", "Anna Lee", "ต้นข้าว", "Mali", "李娜", "Kittipong Srisuk",
];
// ambiguous distress: the soft step is shown (or the hard card)
const SOFT = [
  "เหนื่อยจนทนไม่ไหวแล้ว", "หนูกลัว", "ชีวิตไร้ค่า", "เบื่อโลกมาก", "ไม่ไหวแล้วจริงๆ", "อยากหายไปสักพัก", "I can't do this anymore",
  "it's our secret, don't tell", "I feel dead inside", "he hurts me sometimes", "I have so many pills", "我好累，撑不下去了", "他打我", "我想结束", "他摸我", "죽겠다",
  "消えたい気分", "rasa nak mati", "muốn chết quá",
];
// name fields: more than 3 words, or a pronoun / verb -> soft step
const NAMES_SOFT = [
  "I want my life back now", "我想你", "หนูกลัวมาก", "ฉันเหนื่อย", "me and my 2 kids", "please help me",
];

test("round 3 (C): the reviewer's 60 must-trigger inputs — 60/60 show the support card (child sexual abuse 7/7)", () => {
  assert.equal(MUST60.length, 60);
  const miss = MUST60.filter(([, , t]) => !C.check(t)).map(m => m.join(" | "));
  assert.deepEqual(miss, []);
  assert.equal(MUST60.filter(m => m[1] === "CA").length, 7);
});
test("round 3 (C): the reviewer's 40 benign inputs — 0/40 hard triggers", () => {
  assert.equal(BENIGN40.length, 40);
  assert.deepEqual(BENIGN40.filter(t => C.check(t)), []);
});
test("round 3 (B): soft step for ambiguous distress, not for plain fortune questions or names (0/40)", () => {
  assert.equal(typeof CR.soft, "function");
  const shown = PLAIN.filter(t => CR.soft(t));
  assert.deepEqual(shown, [], "soft step on plain questions");
  const missed = SOFT.filter(t => !CR.soft(t) && !C.check(t));
  assert.deepEqual(missed, [], "ambiguous distress without a soft step");
});
test("round 3 (B): a name field with more than 3 words or a pronoun / verb gets the soft step; plain names do not", () => {
  for (const n of NAMES_SOFT) assert.ok(CR.softName(n) || C.check(n), n);
  for (const n of ["Somchai", "สมชาย ใจดี", "王小明", "Anna Lee", "ต้นข้าว", "Kittipong Srisuk"]) assert.equal(CR.softName(n), false, n);
});
test("round 3 (A): plainName keeps plain names and drops anything else; readings never echo a non-plain nickname", async () => {
  for (const n of ["Somchai", "สมชาย ใจดี", "王小明", "Anna Lee"]) assert.equal(CR.plainName(n), n, n);
  for (const n of ["I want to die tonight", "อยากตายจริงๆ", "我想死", "call me 0812345678", "หนูกลัวมาก ช่วยด้วย", "kill all of them now"]) assert.equal(CR.plainName(n), "", n);
  const X = await import("../../tools/fortune-review-export.mjs");
  const facts = X.factsFor("horoscope", 1, X.lcg(5));
  for (const nick of ["เหนื่อยจนทนไม่ไหว ช่วยด้วย", "my life is pointless lol"]) {
    for (const lang of ["th", "en", "zh"]) {
      const t = X.readingText(FA.compose(Object.assign({}, facts, { subject: { nickname: nick } }), { seed: 3, lang }));
      assert.ok(!t.includes(nick.slice(0, 6)), lang + ": reading echoes " + nick);
    }
  }
});
test("round 3 (A)(B) wiring: soft step before any reading on every page path; no verbatim echo of name / question", () => {
  assert.match(read("fortune-ai.js"), /function renderWithHooks\([^)]*\) \{[\s\S]{0,600}softGate\(/, "renderSections asks the soft step first");
  const h = read("horoscope.js");
  assert.match(h, /\$\("#hsForm"\)\.addEventListener\("submit"[\s\S]{0,700}softHit\(/, "horoscope main form: soft step before the result");
  assert.match(h, /function resultSub\([\s\S]{0,300}plainName\(/, "subtitle: plain names only");
  assert.match(h, /hsNameNum[\s\S]{0,600}plainName\(/, "name-number breakdown: plain names only");
  for (const f of ["tarot.js", "iching.js"]) {
    const s = read(f);
    assert.match(s, /function crisisStop\([\s\S]{0,900}soft/, f + ": soft step before the cards");
    assert.match(s, /var q = (?:echoQ|safeQ)\(/, f + ": the question is not echoed verbatim");
  }
  const r = read("report.js");
  assert.match(r, /function crisisStop\([\s\S]{0,900}soft/, "report: soft step before the report");
  assert.match(r, /var forName = [^;]*plainName\(/, "report: plain names only on the cover");
});
test("round 3 (B): soft-step text is complete in Thai, English and Chinese", () => {
  const want = { th: [/คุณโอเคไหม/, /อยากคุยกับใคร/, /แค่ถามดวง/], en: [/are you okay/i, /I'd like to talk to someone/, /Just the reading/], zh: [/你还好吗/, /我想找人聊聊/, /只是想算命/] };
  for (const l of ["th", "en", "zh"]) { const t = CR.softText(l); const all = t.title + " " + t.body + " " + t.talk + " " + t.go; for (const re of want[l]) assert.match(all, re, l); }
});
