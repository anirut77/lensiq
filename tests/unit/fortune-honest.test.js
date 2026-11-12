"use strict";
// tests/unit/fortune-honest.test.js — FIXED TEST SET for owner order 2026-11-12 Part C ("honest negative readings").
// Written and locked (sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256) BEFORE the straight mode was built.
// NOT DEPLOYED: the feature ships switched OFF (window.LENSIQ_FORTUNE_STRAIGHT = false) until the owner approves the rule
// text and examples in docs/FORTUNE-HONEST-READINGS.md.
//
// What it pins down:
//   A. shipped config: the flag is false; with the flag off nothing changes (straight never active, readings identical)
//   B. hard limits, TH / EN / ZH, blocked in straight mode AND in gentle mode:
//      (1) death, terminal illness, a specific accident stated as certain or dated
//      (2) instruction to stop medication / treatment, to make a specific investment, to end a relationship
//      (3) crisis net first: straight mode never bypasses it (compose and interpret)
//      (4) no fear-selling: "the bad result happens unless you pay / perform something"
//      kept: no lottery numbers; no medical or cosmetic advice; no emotion / deception inference
//   C. straight mode lets plain unfavourable statements through (weak period, money, work, relationships, health habits,
//      travel, conflict, obstacles, loss, ill-wishers) that the gentle filter hides
//   D. the composer in straight mode: real readings state the unfavourable result plainly, stay inside every hard limit,
//      keep something to do after each caution, keep the reminder and the plan
//   E. the user's choice: offered only with an adult confirmation, default ON once confirmed, remembered per device,
//      gentle wording for anyone who has not confirmed
//   F. the control's text is complete in Thai, English and Chinese
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const S = FA.safety;
const ST = FA.straight;
const exportTool = () => import("../../tools/fortune-review-export.mjs");

// a fake per-device store (the browser's localStorage)
function fakeStore() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
function withFlag(on, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "LENSIQ_FORTUNE_STRAIGHT"), old = globalThis.LENSIQ_FORTUNE_STRAIGHT;
  const oldLs = globalThis.localStorage;
  globalThis.LENSIQ_FORTUNE_STRAIGHT = on;
  globalThis.localStorage = fakeStore();
  try { return fn(); } finally {
    if (had) globalThis.LENSIQ_FORTUNE_STRAIGHT = old; else delete globalThis.LENSIQ_FORTUNE_STRAIGHT;
    if (oldLs === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldLs;
  }
}
const isCaution = it => it.tone === "caution" || it.polarity === "challenge";
const text = res => (res.sections || []).flatMap(s => s.paragraphs || []).join("\n");

// ---------------------------------------------------------------- A. shipped config ----------------------------------
test("A1 shipped config: lensiq-config.js sets window.LENSIQ_FORTUNE_STRAIGHT = false", () => {
  const cfg = fs.readFileSync(path.join(ROOT, "lensiq-config.js"), "utf8");
  assert.match(cfg, /window\.LENSIQ_FORTUNE_STRAIGHT\s*=\s*false\s*;/);
  assert.doesNotMatch(cfg, /window\.LENSIQ_FORTUNE_STRAIGHT\s*=\s*true/);
});

test("A2 flag off: straight mode is never active, even if this device stored adult + straight", () => {
  withFlag(false, () => {
    ST.set({ adult: true, straight: true });
    assert.equal(ST.enabled(), false);
    assert.equal(ST.active(), false);
  });
  withFlag(undefined, () => { ST.set({ adult: true, straight: true }); assert.equal(ST.active(), false); });
});

test("A3 flag off: readings are identical to gentle mode (same text, mode 'gentle') across domains × TH/EN/ZH", async () => {
  const X = await exportTool();
  let n = 0;
  for (const d of ["bazi", "taksa", "zodiac", "horoscope", "numbers", "tarot", "palm", "dream"]) {
    const r = X.lcg(4100 + d.length);
    for (let i = 0; i < 3; i++) {
      const facts = X.factsFor(d, i, r);
      for (const lang of ["th", "en", "zh"]) {
        const a = withFlag(false, () => { ST.set({ adult: true, straight: true }); return FA.compose(facts, { seed: 7 + i, lang }); });
        const b = FA.compose(facts, { seed: 7 + i, lang, straight: false });
        assert.equal(X.readingText(a), X.readingText(b), `${d}/${lang}`);
        assert.equal(a.mode, "gentle");
        n++;
      }
    }
  }
  assert.equal(n, 8 * 3 * 3);
});

// ---------------------------------------------------------------- B. hard limits -------------------------------------
const HARD = {
  "1-death": [
    "ปีหน้าคุณจะเสียชีวิต", "ดวงบอกว่าคุณจะตายก่อนอายุหกสิบ", "you will die next year", "your chart shows an early death", "你明年会去世", "命盘显示你寿命不长",
  ],
  "1-terminal": [
    "มีเกณฑ์ป่วยเป็นมะเร็งระยะสุดท้าย", "คุณจะป่วยหนักด้วยโรคร้ายที่รักษาไม่หาย", "you may develop a terminal illness", "you will get cancer this year", "你可能患上绝症", "你今年会得癌症",
  ],
  "1-accident-certain-or-dated": [
    "วันที่ 15 เดือนหน้าคุณจะประสบอุบัติเหตุรถชน", "สัปดาห์นี้คุณจะเกิดอุบัติเหตุแน่นอน", "On 3 March you will have a car accident", "you will certainly have an accident this week",
    "下个月15日你一定会出车祸", "这周你肯定会出意外",
  ],
  "2-stop-medication": [
    "หยุดกินยาที่หมอสั่งได้เลย", "ดวงดีขึ้นแล้ว ไม่ต้องรักษาต่อ", "stop taking your medication", "you can skip your treatment now", "可以停药了", "运势好转了，不必继续治疗",
  ],
  "2-specific-investment": [
    "ควรนำเงินเก็บไปลงทุนซื้อหุ้นตัวนี้", "เดือนนี้ควรซื้อทองคำและบิตคอยน์", "you should invest in gold now", "buy shares in this company this month", "你应该买入这只股票", "这个月应该投资比特币",
  ],
  "2-end-relationship": [
    "ควรเลิกกับแฟนคนนี้", "คุณควรหย่ากับคู่ครอง", "you should break up with your partner", "end your relationship this year", "你应该和他分手", "你最好离婚",
  ],
  "4-fear-selling": [
    "ถ้าไม่ทำบุญแก้ชง เรื่องร้ายจะเกิดกับคุณ", "ต้องจ่ายค่าทำพิธีสะเดาะเคราะห์ ไม่งั้นดวงจะตกต่อ", "unless you make an offering, this loss will happen",
    "pay for a ritual or your luck will stay bad", "如果不化解，这次破财一定会发生", "不做法事的话，运势会继续低迷",
  ],
  "keep-lottery": ["เลขเด็ดงวดนี้ 25", "ลองซื้อลอตเตอรี่เลขท้าย 47", "your lucky lottery numbers are 12 and 34", "buy a lottery ticket ending in 7", "这期彩票号码是 25", "幸运号码 8 拿去试试手气"],
  "keep-medical-cosmetic": ["ไม่ต้องไปหาหมอ", "ควรเสริมจมูกเพื่อเสริมดวง", "no need to see a doctor", "get a nose job to improve your luck", "不用看医生", "去隆鼻可以改运"],
  "keep-emotion-deception": [
    "แฟนของคุณกำลังโกหกคุณ", "จากสีหน้าของคุณ คุณกำลังเศร้าและเครียด", "your partner is lying to you", "your face shows that you are sad and stressed",
    "你的伴侣在骗你", "从你的表情看出你很伤心",
  ],
};

test("B1 hard limits (1)(2)(4) + kept bans: blocked in straight mode AND gentle mode, TH/EN/ZH (each category ≥ 2 per language)", () => {
  let n = 0;
  for (const [cat, list] of Object.entries(HARD)) {
    const langs = { th: 0, en: 0, zh: 0 };
    for (const t of list) {
      const lang = /[฀-๿]/.test(t) ? "th" : /[一-鿿]/.test(t) ? "zh" : "en";
      langs[lang]++;
      assert.equal(ST.isSafe(t), false, `straight lets through [${cat}] ${t}`);
      assert.equal(S.isSafe(t), false, `gentle lets through [${cat}] ${t}`);
      assert.ok(ST.hardLimit(t) || !S.isSafe(t), `[${cat}] ${t}`);
      n++;
    }
    for (const l of ["th", "en", "zh"]) assert.ok(langs[l] >= 2, `${cat}: ${l} has ${langs[l]}`);
  }
  assert.equal(n, 60);
});

test("B2 hard-limit categories are named for the record (hardLimit() returns the limit number for (1) (2) (4))", () => {
  for (const [cat, list] of Object.entries(HARD)) {
    const want = cat.split("-")[0];
    if (!/^[124]$/.test(want)) continue;
    for (const t of list) assert.match(String(ST.hardLimit(t)), new RegExp("^" + want + ":"), `${cat}: ${t} → ${ST.hardLimit(t)}`);
  }
});

const CRISIS = ["ช่วงนี้อยากตาย ดวงจะดีขึ้นไหม", "I want to end my life, what do the cards say", "活着好累，我该怎么办"];

test("B3 (3) crisis net first: with straight on, compose and interpret return the support card, never a reading (TH/EN/ZH)", async () => {
  const X = await exportTool();
  const facts = X.factsFor("bazi", 1, X.lcg(31));
  for (const q of CRISIS) for (const lang of ["th", "en", "zh"]) {
    const f = Object.assign({}, facts, { question: q });
    const c = FA.compose(f, { seed: 5, lang, straight: true });
    assert.equal(c.source, "support", `compose ${lang}: ${q}`);
    assert.equal(c.crisis, true);
    const i = await FA.interpret(f, { seed: 5, lang, straight: true, useAI: false });
    assert.equal(i.source, "support", `interpret ${lang}: ${q}`);
    const u = await FA.interpret(facts, { seed: 5, lang, straight: true, useAI: false, userText: q });
    assert.equal(u.source, "support", `interpret userText ${lang}: ${q}`);
    assert.ok(!/ทำบุญแทน|merit on your behalf|代为/.test(JSON.stringify(c)), "no paid merit offer on the support card");
  }
});

// ---------------------------------------------------------------- C. honest negatives allowed -------------------------
const PLAIN = [
  "ช่วงนี้ดวงการเงินตก มีเกณฑ์เสียเงินหรือมีรายจ่ายเกินคาด",
  "ช่วงนี้ดวงตก งานมีอุปสรรคและอาจมีคนไม่หวังดีคอยขัดขวาง",
  "ปีนี้เป็นปีชง ดวงโดยรวมอ่อน มีเคราะห์ร้ายเล็ก ๆ น้อย ๆ เข้ามาได้",
  "การเดินทางช่วงนี้ควรระวังอุบัติเหตุและของหาย",
  "ช่วงนี้ร่างกายอ่อนล้าง่าย สุขภาพไม่ค่อยดีถ้าพักผ่อนน้อย",
  "ความสัมพันธ์ช่วงนี้มีเกณฑ์ทะเลาะหรือผิดใจกัน",
  "This is a weak period for money: expect losses or unexpected costs.",
  "Bad luck at work this month: obstacles, delays and people who wish you ill.",
  "Be careful when travelling: there is a risk of accidents or lost belongings.",
  "这段时间财运低迷，容易破财或有意外开支。",
  "工作上阻碍多，要提防小人。",
  "出行要小心意外和丢失财物。",
];

test("C1 straight mode lets plain unfavourable statements through (TH/EN/ZH); the gentle filter hides at least half of them", () => {
  let hidden = 0;
  for (const t of PLAIN) {
    assert.equal(ST.isSafe(t), true, `straight hides: ${t} (${S.category(t)})`);
    assert.equal(ST.hardLimit(t), "", `not a hard limit: ${t}`);
    if (!S.isSafe(t)) hidden++;
  }
  assert.ok(hidden >= PLAIN.length / 2, `gentle hides ${hidden}/${PLAIN.length}`);
});

// ---------------------------------------------------------------- D. straight composer --------------------------------
const MARK = {
  th: /ดวง(?:การเงิน|การงาน|ความรัก|โดยรวม)?(?:ตก|อ่อน)|ช่วงอ่อน|อุปสรรค|เสียเงิน|ขัดแย้ง|ทะเลาะ|คนไม่หวังดี|ติดขัด|สูญเสีย/,
  en: /\b(?:weak (?:period|spell|patch)|obstacles?|losses|lose money|conflict|arguments?|people who wish you ill|setbacks?|delays?|bad luck)\b/i,
  zh: /低迷|阻碍|破财|冲突|争执|小人|不顺|受阻/,
};
const ACTION = {
  th: /ควร|ลอง|วางแผน|กันเงิน|ตรวจ|พัก|คุย|ฟัง|เผื่อ|ทบทวน|แบ่ง|จด/,
  en: /\b(?:try|plan|set aside|check|rest|talk|listen|keep|review|make|take|ask|leave|note|pause|break)\b/i,
  zh: /建议|不妨|可以|记得|试着|先|把|多|宜/,
};
const DOMS = ["bazi", "taksa", "lek7", "zodiac", "horoscope", "numbers", "tarot"];

test("D1 straight readings (7 domains × TH/EN/ZH × 4 caution fact sets): plain negative stated, every sentence inside the hard limits, reminder + plan kept", async () => {
  const X = await exportTool();
  let n = 0, marked = 0, differ = 0;
  for (const d of DOMS) {
    const r = X.lcg(9100 + d.length * 7);
    let got = 0;
    for (let i = 0; i < 40 && got < 4; i++) {
      const facts = X.factsFor(d, i, r);
      if (!(facts.items || []).some(isCaution)) continue;
      got++;
      for (const lang of ["th", "en", "zh"]) {
        const s = FA.compose(facts, { seed: 300 + i, lang, straight: true }), g = FA.compose(facts, { seed: 300 + i, lang, straight: false });
        const t = text(s);
        n++;
        assert.equal(s.mode, "straight", `${d}/${lang}`);
        assert.ok(s.reminder && s.reminder.length > 20, `${d}/${lang}: reminder`);
        assert.ok(s.plan && s.plan.items && s.plan.items.length, `${d}/${lang}: plan`);
        for (const p of (s.sections || []).flatMap(x => x.paragraphs)) for (const x of S.sentences(p)) {
          assert.equal(ST.hardLimit(x), "", `${d}/${lang}: hard limit in ${x}`);
          assert.ok(ST.isSafe(x), `${d}/${lang}: unsafe ${x}`);
        }
        if (MARK[lang].test(t)) marked++;
        if (t !== text(g)) differ++;
      }
    }
    assert.equal(got, 4, `${d}: caution fact sets found ${got}`);
  }
  assert.equal(n, DOMS.length * 4 * 3);
  assert.ok(marked >= n * 0.9, `plain negative in ${marked}/${n}`);
  assert.ok(differ >= n * 0.9, `straight differs from gentle in ${differ}/${n}`);
});

test("D2 every plain negative is followed by something to do (no bare doom), and no fear-selling or paid-merit wording anywhere", async () => {
  const X = await exportTool();
  const FEAR = /ถ้าไม่(?:ทำบุญ|แก้|สะเดาะ|ทำพิธี|บูชา|จ่าย)|ไม่งั้น|unless you|or (?:else )?your luck|除非|不化解|不做法事/i;
  const PAID = /ทำบุญแทน|บริการทำบุญ|ค่าบริการ|merit on your behalf|paid (?:merit|ritual|service)|代为|代办|付费/i;
  for (const d of DOMS) {
    const r = X.lcg(7300 + d.length);
    for (let i = 0; i < 12; i++) {
      const facts = X.factsFor(d, i, r);
      if (!(facts.items || []).some(isCaution)) continue;
      for (const lang of ["th", "en", "zh"]) {
        const s = FA.compose(facts, { seed: 51 + i, lang, straight: true });
        for (const p of (s.sections || []).flatMap(x => x.paragraphs)) {
          assert.ok(!FEAR.test(p) && !PAID.test(p), `${d}/${lang}: ${p.slice(0, 120)}`);
          const sents = S.sentences(p);
          sents.forEach((x, k) => {
            if (!MARK[lang].test(x)) return;
            const win = sents.slice(k, k + (lang === "en" ? 4 : 8)).join(" ");
            assert.ok(ACTION[lang].test(win), `${d}/${lang}: no action after: ${x.slice(0, 120)}`);
          });
        }
      }
    }
  }
});

test("D3 gentle mode (straight: false) keeps the gentle filter: no plain-negative lead phrases from the straight lexicon", async () => {
  const X = await exportTool();
  const leads = ST.LEADS;
  assert.ok(leads && leads.th && leads.en && leads.zh, "straight lead lexicon exported for review");
  const all = { th: Object.values(leads.th).flat(), en: Object.values(leads.en).flat(), zh: Object.values(leads.zh).flat() };
  for (const l of ["th", "en", "zh"]) assert.ok(all[l].length >= 8, l + " leads " + all[l].length);
  for (const d of DOMS) {
    const r = X.lcg(2200 + d.length);
    for (let i = 0; i < 6; i++) {
      const facts = X.factsFor(d, i, r);
      for (const lang of ["th", "en", "zh"]) {
        const t = text(FA.compose(facts, { seed: 9 + i, lang, straight: false }));
        for (const lead of all[lang]) assert.ok(!t.includes(lead.replace(/[.。]$/, "")), `${d}/${lang} gentle shows straight lead: ${lead}`);
      }
    }
  }
});

// ---------------------------------------------------------------- E. the user's choice --------------------------------
test("E1 choice: offered only after an adult confirmation; default ON once confirmed; switchable; remembered per device", () => {
  withFlag(true, () => {
    assert.equal(ST.enabled(), true);
    assert.deepEqual(ST.get(), { adult: false, straight: true });
    assert.equal(ST.active(), false, "no adult confirmation → gentle");
    ST.set({ adult: true });
    assert.equal(ST.active(), true, "adult confirmed → straight by default");
    const raw = globalThis.localStorage.getItem("lq-fortune-straight");
    assert.ok(raw && JSON.parse(raw).adult === true, "remembered on this device: " + raw);
    ST.set({ straight: false });
    assert.equal(ST.active(), false, "user chose gentle");
    assert.equal(JSON.parse(globalThis.localStorage.getItem("lq-fortune-straight")).straight, false);
    ST.set({ straight: true });
    assert.equal(ST.active(), true);
    ST.set({ adult: false });
    assert.equal(ST.active(), false, "withdrawing the adult confirmation falls back to gentle");
  });
});

test("E2 with the flag on and an adult who chose straight, compose() without options reads straight; without confirmation it reads gentle", async () => {
  const X = await exportTool();
  const facts = X.factsFor("bazi", 2, X.lcg(77));
  withFlag(true, () => {
    assert.equal(FA.compose(facts, { seed: 3, lang: "th" }).mode, "gentle");
    ST.set({ adult: true, straight: true });
    const a = FA.compose(facts, { seed: 3, lang: "th" });
    assert.equal(a.mode, "straight");
    assert.equal(text(a), text(FA.compose(facts, { seed: 3, lang: "th", straight: true })));
  });
});

// ---------------------------------------------------------------- F. control text TH/EN/ZH ----------------------------
test("F1 the control's text is complete in Thai, English and Chinese (label, adult confirmation, gentle fallback note)", () => {
  const want = { th: /ดูตรง ๆ/, en: /Read it straight/, zh: /直说/ };
  for (const lang of ["th", "en", "zh"]) {
    const t = ST.text(lang);
    assert.match(t.label, want[lang]);
    for (const k of ["label", "adult", "hint", "next", "gentle"]) {
      assert.ok(typeof t[k] === "string" && t[k].length >= 4, `${lang}.${k}`);
      if (lang !== "th") assert.ok(!/[฀-๿]/.test(t[k]), `${lang}.${k} has Thai`);
    }
    assert.match(t.adult, lang === "th" ? /18/ : /18/);
  }
  const h = ST.controlHTML("th");
  assert.match(h, /type="checkbox"[^>]*data-fs="adult"/);
  assert.match(h, /type="checkbox"[^>]*data-fs="straight"/);
});
