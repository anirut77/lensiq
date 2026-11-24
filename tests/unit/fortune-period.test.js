"use strict";
// tests/unit/fortune-period.test.js — FIXED TEST SET "fortune-period" (owner inbox 2026-11-21 entries 19, 21, 26), written and
// locked (~/LENSIQ-field/evals/fortune-period/, evals-locks/fortune-period.sha256) BEFORE the period layer was built.
// Never edit to make it pass; fix the product.
//
// The period layer ("ดวงช่วงนี้") is a second, visibly separate block on a fortune page, computed on the device from the base
// chart plus the present date by the school's own method. It ships behind window.LENSIQ_FORTUNE_PERIOD (default OFF).
// Shared frame: fortune-period.js (window.LQPeriod / module.exports). First pages: horoscope (流月 month pillar against the
// day master + month branch against the birth-year animal) and fengshui (annual + monthly flying stars). Both schools change
// the month at the 12 solar terms (節), so the period is the solar month, stated on the page with its dates.
//
// What it pins down (entry 19 "tests locked first"):
//   (i)   the base layer does not change across dates (clock moved; same person = same base text, TH / EN / ZH)
//   (ii)  the period layer is identical everywhere inside one period and differs between two periods; no random seed
//   (iii) hard limits 60/60 and the crisis rules run on the period text too; cautions only in month ranges, never a day
//   (iv)  Thai, English and Chinese complete
//   plus: the switch is off by default; every frame phrase is in a phrase table with a review status, drafts listed in the
//   expert pack; a school without a period method gets one plain line; no price, purchase or link in the period block.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const HS = require("../../horoscope.js");
const FS = require("../../fengshui.js");
const LP = require("../../fortune-period.js");
const S = FA.safety, ST = FA.straight;
const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/, CJK = /[一-鿿]/;

/** run fn with Math.random and crypto.getRandomValues stubbed to throw, and Date.now moved to `now` (ms) when given */
function guarded(fn, now) {
  const MR = Math.random, wc = globalThis.crypto, GRV = wc.getRandomValues, DN = Date.now;
  Math.random = () => { throw new Error("Math.random called"); };
  wc.getRandomValues = () => { throw new Error("crypto random called"); };
  if (now != null) Date.now = () => now;
  const back = () => { Math.random = MR; wc.getRandomValues = GRV; Date.now = DN; };
  try { const v = fn(); if (v && typeof v.then === "function") return v.finally(back); back(); return v; } catch (e) { back(); throw e; }
}
const textOf = res => JSON.stringify([(res.sections || []).map(s => [s.title, s.paragraphs]), res.reminder || "", res.summary || null, res.plan || null]);
const ict = ms => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);

// SYNTHETIC people (no real person): birth dates spread over day masters and animals
const PEOPLE = [
  { y: 1990, m: 5, d: 12, h: 9, g: "male" }, { y: 1978, m: 11, d: 3, h: 21, g: "female" }, { y: 1985, m: 2, d: 20, h: 6, g: "female" },
  { y: 2001, m: 8, d: 30, h: 14, g: "male" }, { y: 1969, m: 1, d: 7, h: 11, g: "male" }, { y: 1995, m: 10, d: 25, h: 18, g: "female" },
];
const hsP = b => HS.analyze({ y: b.y, m: b.m, d: b.d, time: { h: b.h, mi: 0 }, name: "" });
const fsBase = (b, now, topic) => FS.buildFacts({ kua: FS.kua(FS.solarYear(b.y, b.m, b.d).year, b.g === "male" ? "yang" : "yin"), recorded: {}, rooms: [], photos: [], topic: topic || "overall", now: new Date(now), layer: "base" });
const fsPeriod = (b, period, topic) => FS.buildFacts({ kua: FS.kua(FS.solarYear(b.y, b.m, b.d).year, b.g === "male" ? "yang" : "yin"), recorded: {}, rooms: [], photos: [], topic: topic || "overall", now: new Date(period.anchorMs), layer: "period" });

// 14 consecutive solar months from November 2026; three instants inside each (just after its start, the middle, just before its end)
const NOV15 = Date.UTC(2026, 10, 15, 5);
function months(n) {
  const out = []; let p = LP.solarMonth(NOV15);
  for (let i = 0; i < n; i++) { out.push(p); p = LP.solarMonth(p.endMs + 3600e3); }
  return out;
}
const MONTHS = months(14);
const inside = p => [p.startMs + 2 * 3600e3, Math.round((p.startMs + p.endMs) / 2), p.endMs - 2 * 3600e3];

/** base reading, the page recipe with the switch on: the seed never depends on the date */
async function baseRead(page, b, topic, lang, now) {
  return guarded(async () => {
    const factsFn = page === "horoscope" ? (r => HS.buildFacts(hsP(b), { topic, nickname: "", rng: r })) : (() => fsBase(b, now, topic));
    const seed = LP.baseSeed(FA, [page, topic, factsFn(FA.rng(0))]);
    const facts = factsFn(FA.rng(seed));
    return { seed, facts, text: textOf(await FA.interpret(facts, { useAI: false, seed, lang })) };
  }, now);
}
/** period reading through the frame (LQPeriod.read composes on the device, never with the AI, and filters every sentence) */
async function periodRead(page, b, topic, lang, now) {
  return guarded(async () => {
    const period = LP.solarMonth(now);
    const factsFn = page === "horoscope" ? (r => HS.periodFacts(hsP(b), period, { topic, rng: r })) : (() => fsPeriod(b, period, topic));
    const res = await LP.read(FA, factsFn, period, { lang, topic, domain: page });
    return { period, res, text: textOf(res) };
  }, now);
}

// ---------------------------------------------------------------- switch -----------------------------------------------------------
test("S1 switch: lensiq-config.js sets window.LENSIQ_FORTUNE_PERIOD from an explicit true only (default OFF for customers)", () => {
  const cfg = fs.readFileSync(path.join(ROOT, "lensiq-config.js"), "utf8");
  assert.match(cfg, /window\.LENSIQ_FORTUNE_PERIOD\s*=\s*window\.LENSIQ_FORTUNE_PERIOD\s*===\s*true\s*;/);
  const run = pre => { const w = Object.assign({}, pre); vm.runInNewContext(cfg, { window: w, document: undefined, location: { hostname: "x", search: "" }, URLSearchParams }); return w; };
  assert.equal(run({}).LENSIQ_FORTUNE_PERIOD, false, "default off");
  assert.equal(run({ LENSIQ_FORTUNE_PERIOD: "yes" }).LENSIQ_FORTUNE_PERIOD, false, "only true turns it on");
  assert.equal(run({ LENSIQ_FORTUNE_PERIOD: true }).LENSIQ_FORTUNE_PERIOD, true);
  assert.equal(LP.enabled({}), false);
  assert.equal(LP.enabled({ LENSIQ_FORTUNE_PERIOD: 1 }), false);
  assert.equal(LP.enabled({ LENSIQ_FORTUNE_PERIOD: true }), true);
});

test("S2 switch off keeps today's pages: horoscope.html and fengshui.html load fortune-period.js; the block mounts only behind LQPeriod.enabled(); fengshui facts without a layer keep the year and month stars", () => {
  for (const [pg, js] of [["horoscope", "horoscope.js"], ["fengshui", "fengshui.js"]]) {
    const html = fs.readFileSync(path.join(ROOT, pg + ".html"), "utf8"), src = fs.readFileSync(path.join(ROOT, js), "utf8");
    assert.match(html, /<script src="fortune-period\.js(?:\?v=\d+)?"><\/script>/, pg + ".html loads the frame");
    assert.match(src, /LQPeriod\.enabled\(\)/, js + " checks the switch");
  }
  const f = FS.buildFacts({ kua: FS.kua(1990, "yang"), recorded: {}, rooms: [], photos: [], topic: "overall", now: new Date(NOV15) });
  assert.ok(f.items.some(i => /^year\.center\./.test(i.id)) && f.items.some(i => /^month\.center\./.test(i.id)), "no layer = the reading as it is today");
});

// ---------------------------------------------------------------- (i) base unchanged ------------------------------------------------
const CLOCKS = [NOV15, Date.UTC(2027, 2, 3, 1), Date.UTC(2027, 7, 21, 13), Date.UTC(2030, 0, 9, 22)];

test("(i) base layer: the same person gives the same base text at four dates years apart (clock moved), horoscope + fengshui, TH/EN/ZH", async () => {
  let n = 0;
  for (const page of ["horoscope", "fengshui"]) for (const b of PEOPLE.slice(0, 4)) for (const topic of ["overall", "work"]) for (const lang of LANGS) {
    const first = await baseRead(page, b, topic, lang, CLOCKS[0]);
    assert.ok(first.facts.items.length > 0, `${page} ${lang}: a base reading was composed`);
    for (const c of CLOCKS.slice(1)) {
      const x = await baseRead(page, b, topic, lang, c);
      assert.equal(x.seed, first.seed, `${page} ${b.y} ${topic} ${lang}: base seed moved with the clock (${ict(c)})`);
      assert.equal(x.text, first.text, `${page} ${b.y} ${topic} ${lang}: base text changed between ${ict(CLOCKS[0])} and ${ict(c)}`);
      n++;
    }
  }
  assert.equal(n, 2 * 4 * 2 * 3 * 3);
});

test("(i) base layer holds no period items: fengshui base has no year / month stars; horoscope base facts carry no month pillar", () => {
  for (const b of PEOPLE) {
    const f = fsBase(b, NOV15);
    assert.ok(!f.items.some(i => /^(?:year|month)\./.test(i.id)), "fengshui base: no flying-star period items");
    assert.ok(f.items.some(i => /^kua\./.test(i.id)), "fengshui base keeps the kua number");
    assert.deepEqual(JSON.parse(JSON.stringify(fsBase(b, CLOCKS[3]))), JSON.parse(JSON.stringify(f)), "fengshui base facts equal across dates");
    const h = HS.buildFacts(hsP(b), { topic: "overall", nickname: "", rng: FA.rng(1) });
    assert.ok(!h.items.some(i => /^(?:month|today)\./.test(i.id)), "horoscope base: no month or day items");
  }
  // non-vacuous: without the layer split, the fengshui reading of the same home does change from month to month
  const a = FS.buildFacts({ kua: FS.kua(1990, "yang"), recorded: {}, rooms: [], photos: [], now: new Date(MONTHS[0].anchorMs) });
  const c = FS.buildFacts({ kua: FS.kua(1990, "yang"), recorded: {}, rooms: [], photos: [], now: new Date(MONTHS[1].anchorMs) });
  assert.notDeepEqual(a.items.map(i => i.id), c.items.map(i => i.id));
});

// ---------------------------------------------------------------- (ii) period deterministic ----------------------------------------
test("(ii) solar month: the period follows the solar terms (立冬 7 Nov 2026 .. 大雪 7 Dec 2026; 立春 4 Feb 2027), back to back, no gaps", () => {
  const p = LP.solarMonth(NOV15);
  assert.equal(ict(p.startMs), "2026-11-07"); assert.equal(ict(p.endMs), "2026-12-07");
  assert.ok(p.anchorMs > p.startMs && p.anchorMs < p.endMs);
  assert.equal(ict(LP.solarMonth(Date.UTC(2027, 1, 10)).startMs), "2027-02-04");
  for (let i = 1; i < MONTHS.length; i++) {
    assert.equal(MONTHS[i].startMs, MONTHS[i - 1].endMs, "consecutive periods meet");
    const days = (MONTHS[i].endMs - MONTHS[i].startMs) / 864e5;
    assert.ok(days > 29 && days < 32, `period ${i} is ${days} days`);
  }
  assert.equal(new Set(MONTHS.map(m => m.id)).size, MONTHS.length, "every period has its own id");
  for (const m of MONTHS) for (const t of inside(m)) assert.equal(LP.solarMonth(t).id, m.id, "every instant inside maps to its period");
  guarded(() => LP.solarMonth(NOV15));
});

test("(ii) period layer: identical at three instants inside one period; different between consecutive periods (horoscope + fengshui, TH/EN/ZH, 14 months)", async () => {
  for (const page of ["horoscope", "fengshui"]) for (const b of PEOPLE.slice(0, 3)) for (const lang of LANGS) {
    const texts = [];
    for (const m of MONTHS) {
      const [t0, t1, t2] = inside(m), a = await periodRead(page, b, "overall", lang, t0);
      assert.ok((a.res.sections || []).length > 0, `${page} ${lang} ${m.id}: a period reading was composed`);
      assert.equal(a.period.id, m.id);
      for (const t of [t1, t2]) assert.equal((await periodRead(page, b, "overall", lang, t)).text, a.text, `${page} ${b.y} ${lang}: text changed inside period ${m.id} (${ict(t)})`);
      texts.push(a.text);
    }
    for (let i = 1; i < texts.length; i++) assert.notEqual(texts[i], texts[i - 1], `${page} ${b.y} ${lang}: periods ${MONTHS[i - 1].id} and ${MONTHS[i].id} read the same`);
    assert.ok(new Set(texts).size >= 12, `${page} ${b.y} ${lang}: only ${new Set(texts).size} distinct texts in 14 periods`);
  }
});

test("(ii) the period facts are computed from the chart + the period (not a seed): different people differ in the same period; the facts change with the period", () => {
  const p0 = MONTHS[0], p1 = MONTHS[1];
  const h = b => HS.periodFacts(hsP(b), p0, { topic: "overall", rng: FA.rng(0) });
  assert.ok(new Set(PEOPLE.map(b => JSON.stringify(h(b).items.map(i => i.id)))).size >= 2, "different people get different period facts in the same period");
  const a = HS.periodFacts(hsP(PEOPLE[0]), p0, { topic: "overall", rng: FA.rng(0) }), c = HS.periodFacts(hsP(PEOPLE[0]), p1, { topic: "overall", rng: FA.rng(0) });
  assert.notEqual(JSON.stringify(a.items.map(i => i.label)), JSON.stringify(c.items.map(i => i.label)), "horoscope: the month pillar changes with the period");
  assert.ok(a.items.length >= 1 && a.items.every(i => /^month\./.test(i.id)), "horoscope period items are month items");
  const f0 = fsPeriod(PEOPLE[0], p0), f1 = fsPeriod(PEOPLE[0], p1);
  assert.ok(f0.items.some(i => /^month\.center\./.test(i.id)) && f0.items.some(i => /^year\.center\./.test(i.id)), "fengshui period: year + month stars");
  assert.ok(!f0.items.some(i => /^(?:kua|dir)\./.test(i.id)), "fengshui period: no base items");
  assert.notEqual(f0.items.find(i => /^month\./.test(i.id)).id, f1.items.find(i => /^month\./.test(i.id)).id, "fengshui: the month star changes");
});

test("(ii) seeds: period seed = chart facts + period id (no clock, no random); base seed never reads the clock", () => {
  const p = MONTHS[0];
  const s1 = guarded(() => LP.periodSeed(FA, ["x", 1], p), NOV15), s2 = guarded(() => LP.periodSeed(FA, ["x", 1], p), Date.UTC(2031, 5, 1));
  assert.equal(s1, s2); assert.notEqual(s1, LP.periodSeed(FA, ["x", 1], MONTHS[1])); assert.notEqual(s1, LP.periodSeed(FA, ["x", 2], p));
  assert.equal(guarded(() => LP.baseSeed(FA, ["y"]), NOV15), guarded(() => LP.baseSeed(FA, ["y"]), Date.UTC(2040, 0, 1)));
});

// ---------------------------------------------------------------- (iii) hard limits + crisis on period text -------------------------
// the 60 locked hard-limit probes of tests/unit/fortune-honest.test.js B1 (copied verbatim; that file stays the reference)
const HARD = {
  "1-death": ["ปีหน้าคุณจะเสียชีวิต", "ดวงบอกว่าคุณจะตายก่อนอายุหกสิบ", "you will die next year", "your chart shows an early death", "你明年会去世", "命盘显示你寿命不长"],
  "1-terminal": ["มีเกณฑ์ป่วยเป็นมะเร็งระยะสุดท้าย", "คุณจะป่วยหนักด้วยโรคร้ายที่รักษาไม่หาย", "you may develop a terminal illness", "you will get cancer this year", "你可能患上绝症", "你今年会得癌症"],
  "1-accident-certain-or-dated": ["วันที่ 15 เดือนหน้าคุณจะประสบอุบัติเหตุรถชน", "สัปดาห์นี้คุณจะเกิดอุบัติเหตุแน่นอน", "On 3 March you will have a car accident", "you will certainly have an accident this week", "下个月15日你一定会出车祸", "这周你肯定会出意外"],
  "2-stop-medication": ["หยุดกินยาที่หมอสั่งได้เลย", "ดวงดีขึ้นแล้ว ไม่ต้องรักษาต่อ", "stop taking your medication", "you can skip your treatment now", "可以停药了", "运势好转了，不必继续治疗"],
  "2-specific-investment": ["ควรนำเงินเก็บไปลงทุนซื้อหุ้นตัวนี้", "เดือนนี้ควรซื้อทองคำและบิตคอยน์", "you should invest in gold now", "buy shares in this company this month", "你应该买入这只股票", "这个月应该投资比特币"],
  "2-end-relationship": ["ควรเลิกกับแฟนคนนี้", "คุณควรหย่ากับคู่ครอง", "you should break up with your partner", "end your relationship this year", "你应该和他分手", "你最好离婚"],
  "4-fear-selling": ["ถ้าไม่ทำบุญแก้ชง เรื่องร้ายจะเกิดกับคุณ", "ต้องจ่ายค่าทำพิธีสะเดาะเคราะห์ ไม่งั้นดวงจะตกต่อ", "unless you make an offering, this loss will happen", "pay for a ritual or your luck will stay bad", "如果不化解，这次破财一定会发生", "不做法事的话，运势会继续低迷"],
  "keep-lottery": ["เลขเด็ดงวดนี้ 25", "ลองซื้อลอตเตอรี่เลขท้าย 47", "your lucky lottery numbers are 12 and 34", "buy a lottery ticket ending in 7", "这期彩票号码是 25", "幸运号码 8 拿去试试手气"],
  "keep-medical-cosmetic": ["ไม่ต้องไปหาหมอ", "ควรเสริมจมูกเพื่อเสริมดวง", "no need to see a doctor", "get a nose job to improve your luck", "不用看医生", "去隆鼻可以改运"],
  "keep-emotion-deception": ["แฟนของคุณกำลังโกหกคุณ", "จากสีหน้าของคุณ คุณกำลังเศร้าและเครียด", "your partner is lying to you", "your face shows that you are sad and stressed", "你的伴侣在骗你", "从你的表情看出你很伤心"],
};
function withStraight(on, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "LENSIQ_FORTUNE_STRAIGHT"), old = globalThis.LENSIQ_FORTUNE_STRAIGHT;
  globalThis.LENSIQ_FORTUNE_STRAIGHT = on;
  try { return fn(); } finally { if (had) globalThis.LENSIQ_FORTUNE_STRAIGHT = old; else delete globalThis.LENSIQ_FORTUNE_STRAIGHT; }
}

test("(iii) hard limits 60/60: the period filter LQPeriod.clean drops every locked probe, alone and inside a period paragraph, gentle and straight", () => {
  let n = 0;
  for (const on of [false, true]) withStraight(on, () => {
    for (const [cat, list] of Object.entries(HARD)) for (const t of list) {
      assert.equal(LP.clean(FA, t), "", `[${on ? "straight" : "gentle"}] [${cat}] passes the period filter: ${t}`);
      const lead = THAI.test(t) ? "เดือนนี้เหมาะกับการวางแผนทีละขั้น" : CJK.test(t) ? "本月适合一步一步做计划。" : "This month suits planning one step at a time.";
      const out = LP.clean(FA, lead + (THAI.test(t) ? " " : CJK.test(t) ? "" : " ") + t);
      assert.ok(!out.includes(t), `[${cat}] survives inside a paragraph: ${t}`);
      if (!on) n++;
    }
  });
  assert.equal(n, 60);
});

test("(iii) every sentence of every period reading is inside the hard limits; cautions stay in the month range (no day words, no single dates); no price, purchase or link", async () => {
  const DAY = /วันนี้|พรุ่งนี้|เมื่อวาน|วันที่\s*\d|\btoday\b|\btomorrow\b|\btonight\b|今天|今日|明天|明日|当天/i;
  const SELL = /฿|บาท|ราคา|สั่งซื้อ|ซื้อเลย|https?:|www\.|\bprice\b|\bbuy\b|\$\s?\d|购买|价格|\d\s*元/i;
  let sentences = 0;
  for (const page of ["horoscope", "fengshui"]) for (const b of PEOPLE) for (const m of MONTHS) for (const lang of LANGS) for (const topic of ["overall", "money"]) {
    const { res } = await periodRead(page, b, topic, lang, m.anchorMs);
    const paras = (res.sections || []).flatMap(s => [s.title || ""].concat(s.paragraphs || [])).concat(res.reminder ? [res.reminder] : []);
    for (const p of paras) {
      assert.ok(!DAY.test(p), `${page} ${lang} ${m.id}: a single-day phrase in the period text: ${p.slice(0, 120)}`);
      assert.ok(!SELL.test(p), `${page} ${lang} ${m.id}: price / purchase / link in the period text: ${p.slice(0, 120)}`);
      for (const s of S.sentences(p)) {
        sentences++;
        assert.ok(S.isSafe(s), `${page} ${lang} ${m.id}: unsafe sentence: ${s}`);
        assert.ok(!ST.hardLimit(s), `${page} ${lang} ${m.id}: hard limit ${ST.hardLimit(s)}: ${s}`);
      }
    }
    assert.ok(!res.plan || !(res.plan.length), `${page} ${lang}: the period block carries no plan`);
    assert.notEqual(res.mode, "straight", `${page} ${lang}: the period block is never in straight wording while the switch is off`);
  }
  assert.ok(sentences > 2000, `non-vacuous: ${sentences} sentences checked`);
});

const CRISIS = ["ช่วงนี้อยากตาย ดวงจะดีขึ้นไหม", "I want to end my life, what do the cards say", "活着好累，我该怎么办"];
test("(iii) crisis rules on the period text: a crisis signal gives a calm period reading (gentle, never straight, no plan, no remedies) and nothing typed is echoed", async () => {
  for (const page of ["horoscope", "fengshui"]) for (const q of CRISIS) for (const lang of LANGS) await withStraight(true, async () => {
    const period = MONTHS[0];
    const factsFn = page === "horoscope" ? (r => Object.assign(HS.periodFacts(hsP(PEOPLE[0]), period, { topic: "overall", rng: r }), { question: q }))
      : (() => Object.assign(fsPeriod(PEOPLE[0], period), { question: q }));
    const res = await LP.read(FA, factsFn, period, { lang, topic: "overall", domain: page, straight: true });
    assert.ok(res.source !== "support" || (res.sections || []).length === 0, `${page} ${lang}: crisis v3 keeps the reading or shows the card`);
    assert.notEqual(res.mode, "straight", `${page} ${lang}: never straight under a crisis signal`);
    assert.ok(!res.plan || !res.plan.length, `${page} ${lang}: no plan under a crisis signal`);
    const flat = JSON.stringify(res).replace(/\s+/g, ""), qq = q.replace(/\s+/g, "");
    for (let k = 0; k + 8 <= qq.length; k++) assert.ok(!flat.includes(qq.slice(k, k + 8)), `${page} ${lang}: the crisis text is echoed`);
    assert.ok(!/ทำบุญแทน|merit on your behalf|代为|฿|บาท|price|价格/.test(JSON.stringify(res)), `${page} ${lang}: no paid offer`);
  });
});

test("(iii) the period block: calm or crisis page = no lucky-colour / remedy lines and no price, purchase or seller link; it is marked as its own section", () => {
  const p = MONTHS[0];
  for (const lang of LANGS) for (const calm of [false, true]) {
    const html = LP.html({ id: "hsPeriod", period: p, lang, calm, facts: ["F1", "F2"], advice: calm ? [] : ["A1"] });
    assert.match(html, /data-lq-period/, "marked as the period section");
    assert.ok(html.includes(LP.label(p, lang)), "states the period");
    assert.ok(!/href=|฿|บาท|ราคา|price|价格|购买|data-lq-upsell/.test(html), `${lang}: no link, price or upsell in the block`);
    if (calm) assert.ok(!/data-lq-remedy[^-]/.test(html) && !html.includes("A1"), `${lang}: calm block has no remedy / lucky lines`);
  }
});

// ---------------------------------------------------------------- (iv) TH / EN / ZH complete -----------------------------------------
test("(iv) frame phrases complete in TH/EN/ZH, each with a review status; drafts listed in the expert pack (docs/fortune/PERIOD-RULES-EXPERT.md)", () => {
  const P = LP.PHRASES, keys = Object.keys(P);
  assert.ok(keys.length >= 6, "phrase table present");
  const pack = fs.readFileSync(path.join(ROOT, "docs", "fortune", "PERIOD-RULES-EXPERT.md"), "utf8");
  for (const k of keys) {
    const e = P[k];
    assert.ok(["draft", "reviewed"].includes(e.status), `${k}: status`);
    assert.ok(e.th && THAI.test(e.th), `${k}: th`); assert.ok(e.en && !THAI.test(e.en) && !CJK.test(e.en), `${k}: en`);
    assert.ok(e.zh && CJK.test(e.zh) && !THAI.test(e.zh), `${k}: zh`);
    if (e.status === "draft") assert.ok(pack.includes("`" + k + "`"), `${k}: draft phrase not listed in the expert pack`);
  }
  for (const req of ["heading", "label", "constant", "noMethod", "solarMonth"]) assert.ok(P[req], `phrase ${req} exists`);
});

test("(iv) the label states the period in each language (\"ช่วงนี้: 7 พ.ย. – 7 ธ.ค. 2569\"); the no-method line exists in each language", () => {
  const p = LP.solarMonth(NOV15);
  assert.equal(LP.label(p, "th"), "ช่วงนี้: 7 พ.ย. – 7 ธ.ค. 2569");
  assert.match(LP.label(p, "en"), /^This period: 7 Nov – 7 Dec 2026$/);
  assert.match(LP.label(p, "zh"), /^近期：2026年11月7日 – 12月7日$/);
  const y = LP.solarMonth(Date.UTC(2026, 11, 25));
  assert.match(LP.label(y, "th"), /^ช่วงนี้: 7 ธ\.ค\. 2569 – 5 ม\.ค\. 2570$/, LP.label(y, "th"));
  for (const l of LANGS) assert.ok(LP.noMethod(l).length > 10);
  assert.ok(THAI.test(LP.noMethod("th")) && !THAI.test(LP.noMethod("en")) && CJK.test(LP.noMethod("zh")));
});

test("(iv) period readings are in the reader's language: EN and ZH carry no Thai, TH is Thai, every period month", async () => {
  for (const page of ["horoscope", "fengshui"]) for (const b of PEOPLE.slice(0, 3)) for (const m of MONTHS.slice(0, 6)) for (const lang of LANGS) {
    const { res } = await periodRead(page, b, "overall", lang, m.anchorMs);
    const t = (res.sections || []).flatMap(s => [s.title].concat(s.paragraphs)).join(" ");
    assert.ok(t.length > 60, `${page} ${lang} ${m.id}: a real reading (${t.length} chars)`);
    if (lang === "th") assert.ok(THAI.test(t), `${page} th`);
    else assert.ok(!THAI.test(t), `${page} ${lang} ${m.id}: Thai in the ${lang} period text: ${t.slice(0, 160)}`);
    if (lang === "zh") assert.ok(CJK.test(t));
  }
});
