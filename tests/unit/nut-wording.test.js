"use strict";
// tests/unit/nut-wording.test.js — Nutrition MVP wellbeing and claims rules (docs/NUTRITION-DESIGN.md §7, CLAUDE.md "no medical
// advice", "all user-facing text complete in Thai, English and Chinese"). FIXED TEST, locked before the page existed.
//   1. no judging, dieting, pressure, medical or "allergen-free" wording in any TH / EN / ZH string of the page;
//   2. the fixed lines exist in all three languages: not medical advice + see a doctor or dietitian, "always check the
//      actual label yourself", "no allergen text found does not mean there is none", support line 1323 in Help;
//   3. en-nut.js and zh-nut.js have the same keys as each other and as every key the page and its script use;
//   4. no value is judged by colour: the page's CSS has no red / green / amber status palette for values;
//   5. on-device: the page script never calls fetch / XMLHttpRequest / sendBeacon / WebSocket and loads no AI client.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const dict = (file, lang) => { const w = {}; w.window = w; vm.runInNewContext(read(file), w); return Object.assign({}, ...w.LQI18N_Q.map(q => q[lang] || {})); };
const html = read("nutrition.html"), ui = read("lensiq-nut-ui.js"), css = read("nutrition.css");
const en = dict("i18n/en-nut.js", "en"), zh = dict("i18n/zh-nut.js", "zh");
const text = s => s.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
const thaiStrings = [text(html), ...[...ui.matchAll(/"([^"]*[฀-๿][^"]*)"/g)].map(m => m[1])].join("\n");
const enAll = Object.values(en).join("\n"), zhAll = Object.values(zh).join("\n");

const BANNED = {
  th: [/ดีต่อสุขภาพ/, /ไม่ดีต่อสุขภาพ/, /อาหารขยะ/, /ลดน้ำหนัก/, /เผาผลาญ/, /รู้สึกผิด/, /เป้าหมาย/, /แคลอรีคงเหลือ/, /เหลืออีก/, /คะแนน/, /เกรด/, /ดัชนีมวลกาย/,
    /BMI/, /น้ำหนักตัว/, /ปลอดสารก่อภูมิแพ้/, /ไม่มีสารก่อภูมิแพ้/, /ปลอดภัยสำหรับ/, /ควรกิน/, /ห้ามกิน/, /อาหารคลีน/, /ติดต่อกัน \d+ วัน/, /ชาเลนจ์/, /รักษา/],
  en: [/\bhealthy\b/i, /\bunhealthy\b/i, /\bjunk\b/i, /\bclean eating\b/i, /\bcheat\b/i, /\bguilt/i, /\bburn (it )?off\b/i, /\blose weight\b/i, /\bweight loss\b/i,
    /\bdiet plan\b/i, /\bgoal\b/i, /\btarget\b/i, /\bremaining\b/i, /\bstreak\b/i, /\bscore\b/i, /\bgrade\b/i, /\bBMI\b/, /\ballergen[- ]free\b/i, /\bsafe for\b/i,
    /\byou should eat\b/i, /\bcure\b/i, /\btreat(s|ment)?\b/i, /\bchallenge\b/i],
  zh: [/健康食品/, /不健康/, /垃圾食品/, /减肥/, /燃烧/, /罪恶感/, /目标/, /剩余/, /评分/, /等级/, /体重/, /无过敏原/, /对.*安全/, /应该吃/, /治疗/, /挑战/]
};

test("no judging, dieting, pressure, medical or 'allergen-free' wording in Thai, English or Chinese", () => {
  for (const re of BANNED.th) assert.ok(!re.test(thaiStrings), "Thai: " + re);
  for (const re of BANNED.en) assert.ok(!re.test(enAll), "English: " + re + " in " + (enAll.match(re) || [""])[0]);
  for (const re of BANNED.zh) assert.ok(!re.test(zhAll), "Chinese: " + re);
});

test("fixed lines in all three languages: not medical advice, check the actual label, 'not found is not none', 1323 in Help", () => {
  assert.match(html, /ข้อมูลเพื่อประกอบการตัดสินใจ ไม่ใช่คำแนะนำทางการแพทย์/);
  assert.match(html, /โปรดปรึกษาแพทย์หรือนักกำหนดอาหาร/);
  assert.match(thaiStrings, /โปรดตรวจฉลากจริงด้วยตัวเองทุกครั้ง/);
  assert.match(thaiStrings, /ไม่พบข้อความเรื่องสารก่อภูมิแพ้ในภาพนี้ ซึ่งไม่ได้แปลว่าไม่มี/);
  assert.match(html, /1323/);
  assert.match(enAll, /not medical advice/i); assert.match(enAll, /doctor or (a )?dietitian/i);
  assert.match(enAll, /always check the actual label yourself/i); assert.match(enAll, /does not mean there is none/i);
  assert.match(zhAll, /不是医疗建议/); assert.match(zhAll, /医生或营养师/); assert.match(zhAll, /请务必亲自核对实际标签/); assert.match(zhAll, /不代表没有/);
});

test("en-nut.js and zh-nut.js: same keys, every key used by the page and its script, no Thai left in values", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), "en / zh key sets");
  const used = new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]));
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const part of m[1].split(";")) used.add(part.split(":")[1]);
  for (const m of ui.matchAll(/\bT\("([a-z0-9._-]+)"/g)) used.add(m[1]);
  assert.ok(used.size >= 40, "keys used: " + used.size);
  for (const k of used) { assert.ok(en[k], "en missing " + k); assert.ok(zh[k], "zh missing " + k); }
  for (const [k, v] of Object.entries({ ...en, ...zh })) assert.ok(!/[ก-๙]/.test(v), "Thai in a translation: " + k);
});

test("values are not judged by colour (no red / amber / green value palette) and the page never uploads", () => {
  assert.ok(!/\b(traffic|nut-(good|bad|high|low|ok|warn))\b/.test(css + html + ui), "no judging classes");
  assert.ok(!/#(e53935|f44336|d32f2f|43a047|4caf50|2e7d32|ffb300|ff9800)\b/i.test(css), "no red / green / amber value colours");
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|new WebSocket|LQAI\b/.test(ui), "label mode runs on the device only");
  assert.ok(!/lensiq-ai\.js|lensiq-api\.js/.test(html), "no AI or backend client on the page");
});
