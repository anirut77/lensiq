"use strict";
// tests/unit/crisis-v3-pre.test.js — FIXED TEST SET "crisis-v3", decision 84 (both options built; the owner chooses). Locked BEFORE the
// option ข product code (evals-locks/crisis-v3.sha256, tag `pre-lock`; ledger docs/CRISIS-V3-RELOCKS.md). Browser half:
// tests/e2e/crisis-v3-pre{,-en,-zh}.e2e.mjs.
//   P1 lensiq-config.js ships option ก: window.LENSIQ_CRISIS_PRELINE is false unless something set it to true first.
//   P2 LQFortuneCrisis.plan(text) is true for the narrow listed explicit-plan phrases (TH / EN / ZH, spacing and case varied), and
//      every one of them is also caught by the crisis net (check).
//   P3 plan() is false for crisis phrases that are not an explicit plan, and for ordinary text that shares words with the list.
//   P4 LQFortuneCrisis.preHTML(lang): one short warm line and exactly one link, tel:1323; no other number, no counselling list, no
//      "flagged" wording, no Thai in EN / ZH, no statistics; the class is lq-crisis-pre.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const fresh = f => { const p = path.join(ROOT, f); delete require.cache[require.resolve(p)]; return require(p); };
const LANGS = ["th", "en", "zh"];

const PLAN = {
  th: ["คืนนี้จะจบชีวิต", "จะฆ่าตัวตายคืนนี้", "วางแผนฆ่าตัวตายไว้แล้ว", "พรุ่งนี้จะจบชีวิตตัวเอง", "คืนนี้  จะ จบชีวิต"],
  en: ["I'm planning to end it tonight", "I am going to kill myself tonight", "I have a plan to kill myself", "Tonight I will end my life",
    "I'll kill myself tonight", "I'M PLANNING TO END IT TONIGHT"],
  zh: ["今晚就结束生命", "我今晚要自杀", "我已经计划好自杀了", "明天我就结束自己的生命", "今晚 就 结束 生命"],
};
const NOT_PLAN_CRISIS = {
  th: ["อยากตายจริงๆ", "ไม่อยากอยู่แล้ว", "เหนื่อยจนไม่อยากมีชีวิตอยู่"],
  en: ["I want to die", "I can't go on anymore", "I don't want to live anymore"],
  zh: ["我不想活了", "活着好累", "我想死"],
};
const ORDINARY = {
  th: ["คืนนี้จะไปกินข้าวกับเพื่อน", "วางแผนเที่ยวคืนนี้", "งานจะจบคืนนี้", "ขำจนจะตาย"],
  en: ["I'm planning a trip tonight", "I'm planning to end the meeting tonight", "the movie will end tonight", "Tonight I will end my diet"],
  zh: ["今晚就结束项目", "我计划好旅行了", "明天我就结束这个会议", "今晚吃什么"],
};
const FLAGGED = /ขอหยุดคำทำนาย|ฟังดูหนักใจ|คุณโอเคไหม|ขอไม่อ่านดวง|ข้อความนี้ฟังดู|pause the reading|sounds heavy|are you okay|will not give a fortune|this sounds|暂停这次解读|听起来很沉重|你还好吗|先不做占卜/i;

test("P1: lensiq-config.js ships option ก (LENSIQ_CRISIS_PRELINE false unless already true)", () => {
  const src = fs.readFileSync(path.join(ROOT, "lensiq-config.js"), "utf8");
  assert.match(src, /window\.LENSIQ_CRISIS_PRELINE\s*=\s*window\.LENSIQ_CRISIS_PRELINE\s*===\s*true\s*;/, "one switch, default ก");
  for (const [pre, want] of [[undefined, false], [false, false], ["yes", false], [true, true]]) {
    const win = pre === undefined ? {} : { LENSIQ_CRISIS_PRELINE: pre };
    const line = src.match(/window\.LENSIQ_CRISIS_PRELINE\s*=\s*window\.LENSIQ_CRISIS_PRELINE\s*===\s*true\s*;/)[0];
    vm.runInNewContext(line, { window: win });
    assert.equal(win.LENSIQ_CRISIS_PRELINE, want, "preset " + String(pre));
  }
});

test("P2: plan() is true for every listed explicit-plan phrase, and the crisis net catches each", () => {
  const CR = fresh("fortune-crisis.js");
  assert.equal(typeof CR.plan, "function", "LQFortuneCrisis.plan exists");
  for (const lang of LANGS) for (const t of PLAN[lang]) {
    assert.equal(CR.plan(t), true, lang + ": plan " + JSON.stringify(t));
    assert.equal(CR.check(t), true, lang + ": crisis net " + JSON.stringify(t));
  }
});

test("P3: plan() is false for crisis phrases without a plan and for ordinary text", () => {
  const CR = fresh("fortune-crisis.js");
  for (const lang of LANGS) {
    for (const t of NOT_PLAN_CRISIS[lang]) assert.equal(CR.plan(t), false, lang + ": not a plan " + JSON.stringify(t));
    for (const t of ORDINARY[lang]) assert.equal(CR.plan(t), false, lang + ": ordinary " + JSON.stringify(t));
  }
  for (const t of ["", null, undefined, 42]) assert.equal(CR.plan(/** @type {any} */ (t)), false, "empty / not text");
});

test("P4: preHTML(lang): one short warm line, one tel:1323 link only, nothing flagged, no other number, no statistics", () => {
  const CR = fresh("fortune-crisis.js");
  assert.equal(typeof CR.preHTML, "function", "LQFortuneCrisis.preHTML exists");
  for (const lang of LANGS) {
    const h = CR.preHTML(lang);
    assert.match(h, /class="lq-crisis-pre[" ]/, lang + ": class lq-crisis-pre");
    const hrefs = [...h.matchAll(/href="([^"]*)"/g)].map(m => m[1]);
    assert.deepEqual(hrefs, ["tel:1323"], lang + ": one link, tel:1323");
    const warm = (h.match(/<p class="lq-crisis-pre-warm"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "";
    const wt = warm.replace(/<[^>]+>/g, "").trim();
    assert.ok(wt.length > 0 && wt.length <= (lang === "zh" ? 60 : 140), lang + ": warm line length " + wt.length);
    assert.ok((wt.match(/[.!?。！？]/g) || []).length <= 2, lang + ": one short line");
    const text = h.replace(/<[^>]+>/g, " ");
    assert.ok(!FLAGGED.test(text), lang + ": no flagged wording");
    assert.ok(!/(?<!\d)(?:1669|191|1300)(?!\d)|02[\s-]?113[\s-]?6789|samaritans/i.test(text), lang + ": no other number");
    assert.ok(!/%|\d+\s*(?:คน|people|人)/.test(text), lang + ": no statistics");
    if (lang !== "th") assert.ok(!/[฀-๿]/.test(text), lang + ": no Thai");
  }
});
