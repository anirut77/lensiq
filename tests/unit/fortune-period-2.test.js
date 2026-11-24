"use strict";
// tests/unit/fortune-period-2.test.js — FIXED TEST SET "fortune-period" part 2 (owner inbox 2026-11-21 entries 19, 26; coordinator
// 2026-11-24), written and locked (~/LENSIQ-field/evals/fortune-period/p2/, evals-locks/fortune-period.sha256) BEFORE these pages
// were built. Never edit to make it pass; fix the product. Same rules as tests/unit/fortune-period.test.js, for:
//   zodiac     base = the birth animal + the reading of the year the reader picked; period = 流月: the branch of the Chinese solar
//              month against the birth animal (solar month from LQPeriod.solarMonth, which now carries .branch)
//   astro      base = the natal chart; period = the Sun's tropical sign (LQPeriod.signPeriod, 30 degrees from 0 Aries) as a solar
//              house counted from the natal Sun sign (existing code only; no planet positions, no astronomy-engine)
//   luckycolor no base layer (no birth data); period = the day (LQPeriod.dayPeriod, Thai date) — advice only, never a caution
//   tarot, iching (draws), dream, lek7: no period method — one plain line on the page ([data-lq-period-none]); palm, pet later
//   note 3 (coordinator): the period block in EN / ZH does not open with the birth-chart introduction of the base reading
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const HS = require("../../horoscope.js");
const FS = require("../../fengshui.js");
const ZD = require("../../zodiac.js");
const AS = require("../../astro.js");
const LP = require("../../fortune-period.js");
const S = FA.safety, ST = FA.straight;
const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/, CJK = /[一-鿿]/;
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const ict = ms => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
const textOf = res => JSON.stringify([(res.sections || []).map(s => [s.title, s.paragraphs]), res.reminder || "", res.summary || null, res.plan || null]);
function guarded(fn, now) {
  const MR = Math.random, wc = globalThis.crypto, GRV = wc.getRandomValues, DN = Date.now;
  Math.random = () => { throw new Error("Math.random called"); };
  wc.getRandomValues = () => { throw new Error("crypto random called"); };
  if (now != null) Date.now = () => now;
  const back = () => { Math.random = MR; wc.getRandomValues = GRV; Date.now = DN; };
  try { const v = fn(); if (v && typeof v.then === "function") return v.finally(back); back(); return v; } catch (e) { back(); throw e; }
}
// SYNTHETIC people
const PEOPLE = [{ y: 1990, m: 5, d: 12, h: 9 }, { y: 1978, m: 11, d: 3, h: 21 }, { y: 1985, m: 2, d: 20, h: 6 }, { y: 2001, m: 8, d: 30, h: 14 }];
const animalOf = b => ZD.zodiacYearOf(b.y, b.m, b.d, "chinese").animal;
const chartOf = b => AS.chart({ y: b.y, m: b.m, d: b.d, time: { h: b.h, mi: 0 }, tz: 7, lat: 13.75, lon: 100.5 });
const NOV25 = Date.UTC(2026, 10, 25, 5);
const CLOCKS = [NOV25, Date.UTC(2027, 2, 3, 1), Date.UTC(2027, 7, 21, 13), Date.UTC(2030, 0, 9, 22)];
function chain(first, n, next) { const out = [first]; while (out.length < n) out.push(next(out[out.length - 1].endMs + 3600e3)); return out; }
const SM = chain(LP.solarMonth(NOV25), 14, LP.solarMonth), SG = chain(LP.signPeriod(NOV25), 13, LP.signPeriod);
const inside = p => [p.startMs + 2 * 3600e3, Math.round((p.startMs + p.endMs) / 2), p.endMs - 2 * 3600e3];

const PAGE = {
  zodiac: { per: SM, facts: (b, p) => r => ZD.periodFacts(animalOf(b), p, { topic: "overall", rng: r }), at: LP.solarMonth,
    base: (b, topic) => r => ZD.buildFacts(ZD.annual(animalOf(b), 2026, ZD.zodiacYearOf(b.y, b.m, b.d, "chinese").year), topic, { rng: r }) },
  astro: { per: SG, facts: (b, p) => r => AS.periodFacts(chartOf(b).sun.sign, p, { topic: "overall", rng: r }), at: LP.signPeriod,
    base: (b, topic) => () => AS.buildFacts(chartOf(b), topic) },
};
async function periodRead(page, b, lang, now, topic) {
  return guarded(async () => {
    const p = PAGE[page].at(now), res = await LP.read(FA, PAGE[page].facts(b, p), p, { lang, topic: topic || "overall", domain: page });
    return { p, res, text: textOf(res) };
  }, now);
}

// ---------------------------------------------------------------- switch + pages -----------------------------------------------------
test("S pages: zodiac / astro / luckycolor load the frame and mount only behind LQPeriod.enabled(); tarot, iching, dream, lek7 carry the no-method line", () => {
  for (const [html, js] of [["zodiac.html", "zodiac.js"], ["astro.html", "astro.js"], ["luckycolor.html", "luckycolor.js"]]) {
    assert.match(read(html), /<script src="fortune-period\.js(?:\?v=\d+)?"><\/script>/, html + " loads the frame");
    assert.match(read(js), /LQPeriod\.enabled\(\)/, js + " checks the switch");
  }
  for (const [html, kind] of [["tarot.html", "draw"], ["iching.html", "draw"], ["dream.html", ""], ["lek7.html", ""]]) {
    const h = read(html);
    assert.match(h, /<script src="fortune-period\.js(?:\?v=\d+)?"><\/script>/, html + " loads the frame");
    assert.match(h, new RegExp('<p [^>]*data-lq-period-none="' + kind + '"[^>]*\\shidden'), html + ": the no-method line is in the page, hidden until the switch is on");
  }
  // the shared binder (fortune-kit.js) gives a base reading a seed without the clock when the switch is on
  assert.match(read("fortune-kit.js"), /period === "base"/);
});

// ---------------------------------------------------------------- (i) base unchanged ----------------------------------------------------
test("(i) base layer: zodiac (fixed chosen year) and astro natal reading give the same text at four dates years apart, TH/EN/ZH", async () => {
  let n = 0;
  for (const page of ["zodiac", "astro"]) for (const b of PEOPLE.slice(0, 3)) for (const lang of LANGS) {
    const one = async now => guarded(async () => {
      const fn = PAGE[page].base(b, "overall"), seed = LP.baseSeed(FA, [page, "overall", fn(FA.rng(0))]);
      return textOf(await FA.interpret(Object.assign({}, fn(FA.rng(seed)), { topic: "overall" }), { useAI: false, seed, lang }));
    }, now);
    const first = await one(CLOCKS[0]);
    for (const c of CLOCKS.slice(1)) { assert.equal(await one(c), first, `${page} ${b.y} ${lang}: base changed at ${ict(c)}`); n++; }
  }
  assert.equal(n, 2 * 3 * 3 * 3);
});

// ---------------------------------------------------------------- (ii) periods ----------------------------------------------------------
test("(ii) period frames: solar month carries its branch (立冬 month = 亥 11); sun-sign period 22 Nov – 22 Dec 2026 is Sagittarius (8); day period follows the Thai date", () => {
  const m = LP.solarMonth(NOV25);
  assert.equal(m.branch, 11); assert.equal(LP.solarMonth(Date.UTC(2027, 1, 10)).branch, 2);
  for (let i = 1; i < SM.length; i++) assert.equal(SM[i].branch, (SM[i - 1].branch + 1) % 12);
  const s = LP.signPeriod(Date.UTC(2026, 11, 1));
  assert.equal(s.sign, 8); assert.equal(ict(s.startMs), "2026-11-22"); assert.equal(ict(s.endMs), "2026-12-22");
  for (let i = 1; i < SG.length; i++) { assert.equal(SG[i].startMs, SG[i - 1].endMs); assert.equal(SG[i].sign, (SG[i - 1].sign + 1) % 12); }
  for (const p of SG) for (const t of inside(p)) assert.equal(LP.signPeriod(t).id, p.id);
  const d = LP.dayPeriod(Date.UTC(2026, 10, 23, 17, 0)); // 00:00 Bangkok, 24 Nov
  assert.equal(d.id, "d-2026-11-24"); assert.equal(LP.dayPeriod(Date.UTC(2026, 10, 24, 16, 59)).id, "d-2026-11-24");
  assert.equal(LP.dayPeriod(Date.UTC(2026, 10, 24, 17, 0)).id, "d-2026-11-25");
  assert.equal(LP.label(d, "th"), "ช่วงนี้: วันอังคาร 24 พ.ย. 2569");
  assert.equal(LP.label(d, "en"), "This period: Tuesday 24 Nov 2026");
  assert.equal(LP.label(d, "zh"), "近期：2026年11月24日 星期二");
  assert.equal(LP.label(s, "th"), "ช่วงนี้: 22 พ.ย. – 22 ธ.ค. 2569");
});

test("(ii) zodiac + astro period text: identical at three instants inside a period, different between consecutive periods, no random (TH/EN/ZH)", async () => {
  for (const page of ["zodiac", "astro"]) for (const b of PEOPLE.slice(0, 3)) for (const lang of LANGS) {
    const texts = [];
    for (const p of PAGE[page].per) {
      const [a, m, z] = inside(p), x = await periodRead(page, b, lang, a);
      assert.equal(x.p.id, p.id);
      assert.ok((x.res.sections || []).length > 0, `${page} ${lang} ${p.id}: composed`);
      for (const t of [m, z]) assert.equal((await periodRead(page, b, lang, t)).text, x.text, `${page} ${b.y} ${lang}: changed inside ${p.id}`);
      texts.push(x.text);
    }
    for (let i = 1; i < texts.length; i++) assert.notEqual(texts[i], texts[i - 1], `${page} ${b.y} ${lang}: consecutive periods read the same`);
  }
});

test("(ii) the period facts come from the chart + the period: zodiac relation of the month branch to the animal; astro house = transit Sun sign - natal Sun sign", () => {
  for (const b of PEOPLE) {
    const p = SM[0], f = ZD.periodFacts(animalOf(b), p, { topic: "overall", rng: FA.rng(0) });
    assert.ok(f.items.length >= 1 && f.items[0].id === "rel." + ZD.relation(animalOf(b), p.branch), "zodiac: rel.<relation of the month branch>");
    const q = SG[0], C = chartOf(b), g = AS.periodFacts(C.sun.sign, q, { topic: "overall", rng: FA.rng(0) });
    assert.equal(g.items[0].id, "day.house." + ((q.sign - C.sun.sign + 12) % 12), "astro: solar house of the transit Sun");
  }
});

// ---------------------------------------------------------------- (iii) limits ----------------------------------------------------------
test("(iii) zodiac + astro period text: every sentence inside the hard limits; no day words (cautions in the period range only); no price, purchase or link", async () => {
  const DAY = /วันนี้|พรุ่งนี้|เมื่อวาน|วันที่\s*\d|\btoday\b|\btomorrow\b|\btonight\b|今天|今日|明天|明日|当天/i;
  const SELL = /฿|บาท|ราคา|สั่งซื้อ|ซื้อเลย|https?:|www\.|\bprice\b|\bbuy\b|\$\s?\d|购买|价格|\d\s*元/i;
  let n = 0;
  for (const page of ["zodiac", "astro"]) for (const b of PEOPLE) for (const p of PAGE[page].per) for (const lang of LANGS) {
    const { res } = await periodRead(page, b, lang, p.anchorMs, "money");
    for (const para of (res.sections || []).flatMap(s => [s.title || ""].concat(s.paragraphs || []))) {
      assert.ok(!DAY.test(para), `${page} ${lang} ${p.id}: day word: ${para.slice(0, 120)}`);
      assert.ok(!SELL.test(para), `${page} ${lang} ${p.id}: sell: ${para.slice(0, 120)}`);
      for (const s of S.sentences(para)) { n++; assert.ok(S.isSafe(s) && !ST.hardLimit(s), `${page} ${lang}: ${s}`); }
    }
    assert.ok(!res.plan || !res.plan.length); assert.notEqual(res.mode, "straight");
  }
  assert.ok(n > 1500, `non-vacuous: ${n}`);
});

test("(iii) crisis rules: a crisis signal in the facts gives a calm zodiac / astro period reading, nothing echoed, no plan", async () => {
  const Q = ["ช่วงนี้อยากตาย ดวงจะดีขึ้นไหม", "I want to end my life, what do the cards say", "活着好累，我该怎么办"];
  for (const page of ["zodiac", "astro"]) for (const q of Q) for (const lang of LANGS) {
    const p = PAGE[page].per[0], fn = PAGE[page].facts(PEOPLE[0], p);
    const res = await LP.read(FA, r => Object.assign(fn(r), { question: q }), p, { lang, domain: page, straight: true });
    assert.notEqual(res.mode, "straight"); assert.ok(!res.plan || !res.plan.length);
    const flat = JSON.stringify(res).replace(/\s+/g, ""), qq = q.replace(/\s+/g, "");
    for (let k = 0; k + 8 <= qq.length; k++) assert.ok(!flat.includes(qq.slice(k, k + 8)), `${page} ${lang}: echoed`);
  }
});

// ---------------------------------------------------------------- (iv) languages + note 3 ----------------------------------------------
test("(iv) phrases: the new frame phrases are complete in TH/EN/ZH with a status, drafts in the expert pack; the draw line exists", () => {
  const pack = read("docs/fortune/PERIOD-RULES-EXPERT.md");
  for (const k of ["noMethodDraw", "constantNoBase", "methodZodiac", "methodAstro", "methodLucky", "factMonthBranch", "factSunSign"]) {
    const e = LP.PHRASES[k]; assert.ok(e, k);
    assert.ok(THAI.test(e.th) && e.en && !THAI.test(e.en) && !CJK.test(e.en) && CJK.test(e.zh) && !THAI.test(e.zh), k + " TH/EN/ZH");
    if (e.status === "draft") assert.ok(pack.includes("`" + k + "`"), k + " in the expert pack");
  }
  for (const l of LANGS) assert.ok(LP.noMethod(l, "draw").length > 10 && LP.noMethod(l, "draw") !== LP.noMethod(l));
});

test("(iv) zodiac + astro period readings in EN / ZH carry no Thai; TH is Thai", async () => {
  for (const page of ["zodiac", "astro"]) for (const b of PEOPLE.slice(0, 2)) for (const p of PAGE[page].per.slice(0, 6)) for (const lang of LANGS) {
    const { res } = await periodRead(page, b, lang, p.anchorMs);
    const t = (res.sections || []).flatMap(s => [s.title].concat(s.paragraphs)).join(" ");
    assert.ok(t.length > 60, `${page} ${lang}: real text`);
    if (lang === "th") assert.ok(THAI.test(t)); else assert.ok(!THAI.test(t), `${page} ${lang}: Thai in ${t.slice(0, 160)}`);
  }
});

test("note 3: the EN / ZH period block does not open with the base reading's birth-chart introduction (horoscope, fengshui, zodiac, astro)", async () => {
  const INTRO = {
    en: /Your birth date sets out a chart|Feng shui looks at directions|your kua number \(a personal number from your birth year\)|natal chart|birth chart|your birth date/i,
    zh: /从出生日期排出的命盘|这份命盘结合了|按八宅风水|出生资料|命盘来看|本命盘/,
  };
  const P0 = PEOPLE[0], sm = LP.solarMonth(NOV25), sg = LP.signPeriod(NOV25);
  const runs = {
    horoscope: [sm, r => HS.periodFacts(HS.analyze({ y: P0.y, m: P0.m, d: P0.d, time: { h: P0.h, mi: 0 }, name: "" }), sm, { topic: "overall", rng: r })],
    fengshui: [sm, () => FS.buildFacts({ kua: FS.kua(1990, "yang"), recorded: {}, rooms: [], photos: [], topic: "overall", now: new Date(sm.anchorMs), layer: "period" })],
    zodiac: [sm, PAGE.zodiac.facts(P0, sm)], astro: [sg, PAGE.astro.facts(P0, sg)],
  };
  let n = 0;
  for (const [dom, [p, fn]] of Object.entries(runs)) for (const lang of ["en", "zh"]) for (const topic of ["overall", "work", "love"]) {
    const res = await LP.read(FA, fn, p, { lang, topic, domain: dom });
    const t = (res.sections || []).flatMap(s => s.paragraphs || []).join(" ");
    assert.ok(!INTRO[lang].test(t), `${dom} ${lang} ${topic}: the period block opens like a birth-chart reading: ${t.slice(0, 200)}`);
    n++;
  }
  assert.equal(n, 4 * 2 * 3);
});
