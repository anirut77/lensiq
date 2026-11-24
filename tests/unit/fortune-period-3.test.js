"use strict";
// tests/unit/fortune-period-3.test.js — FIXED TEST SET "fortune-period" part 3 (Fable review of f83c41c7, coordinator 2026-11-24),
// written and locked (~/LENSIQ-field/evals/fortune-period/p3/, evals-locks/fortune-period.sha256) BEFORE the fixes. STRICTER than
// parts 1 and 2 (they stay as they are). Never edit to make it pass; fix the product. The switch stays OFF.
//   1  the method line names the page's own method: only solar-month blocks mention the Chinese solar terms
//   2  no year or quarter doctrine inside a month / sign / day block (fengshui keeps its annual flying star: the method itself)
//   3  astro: the Sun transit is read with Sun-transit phrases (no Moon, no emotional-focus lines); zodiac and astro use their own
//      period phrase tables (status draft, listed in docs/fortune/PERIOD-RULES-EXPERT.md, TH/EN/ZH)
//   4  no day wording in any period block (stricter list) and no base-reading opener in any language
//   5  zodiac period block <= 900 characters
//   6  luckycolor: the weekday of the advice and the label come from the same Thai (UTC+7) day, whatever the device time zone
//   7  fengshui base without a kua number has no date-dependent year-star headline and does not change with the date
//   +  hard limits and crisis rules on the new phrase tables
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
const LL = require("../../lensiq-luckycolor.js");
const S = FA.safety, ST = FA.straight;
const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/, CJK = /[一-鿿]/;
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const NOV25 = Date.UTC(2026, 10, 25, 5);
function chain(first, n, next) { const out = [first]; while (out.length < n) out.push(next(out[out.length - 1].endMs + 3600e3)); return out; }
const SM = chain(LP.solarMonth(NOV25), 14, LP.solarMonth), SG = chain(LP.signPeriod(NOV25), 13, LP.signPeriod);
const PEOPLE = [{ y: 1990, m: 5, d: 12, h: 9 }, { y: 1978, m: 11, d: 3, h: 21 }, { y: 1985, m: 2, d: 20, h: 6 }, { y: 2001, m: 8, d: 30, h: 14 }];
const hsP = b => HS.analyze({ y: b.y, m: b.m, d: b.d, time: { h: b.h, mi: 0 }, name: "" });
const chartOf = b => AS.chart({ y: b.y, m: b.m, d: b.d, time: { h: b.h, mi: 0 }, tz: 7, lat: 13.75, lon: 100.5 });
const animalOf = b => ZD.zodiacYearOf(b.y, b.m, b.d, "chinese").animal;
const RUN = {
  horoscope: { per: SM, fn: (b, p) => r => HS.periodFacts(hsP(b), p, { topic: "overall", rng: r }) },
  fengshui: { per: SM, fn: (b, p) => () => FS.buildFacts({ kua: FS.kua(b.y, "yang"), recorded: {}, rooms: [], photos: [], topic: "overall", now: new Date(p.anchorMs), layer: "period" }) },
  zodiac: { per: SM, fn: (b, p) => r => ZD.periodFacts(animalOf(b), p, { topic: "overall", rng: r }) },
  astro: { per: SG, fn: (b, p) => r => AS.periodFacts(chartOf(b).sun.sign, p, { topic: "overall", rng: r }) },
};
const body = res => (res.sections || []).flatMap(s => [s.title || ""].concat(s.paragraphs || [])).join(" ").trim();
/** every period block: 4 pages x 4 people x their periods x TH/EN/ZH x 3 topics */
let CACHE = null;
async function all() {
  if (CACHE) return CACHE;
  const out = [];
  for (const [dom, R] of Object.entries(RUN)) for (const b of PEOPLE) for (const p of R.per) for (const lang of LANGS) for (const topic of ["overall", "money", "love"]) {
    const res = await LP.read(FA, R.fn(b, p), p, { lang, topic, domain: dom });
    out.push({ dom, lang, topic, p, res, text: body(res) });
  }
  return (CACHE = out);
}

test("1 method line: astro (Sun sign) and luckycolor (day) blocks never mention the Chinese solar terms; solar-month blocks do", () => {
  const TERMS = /สารท|節|节气|solar term|\bjie\b|สุริยคติจีน|Chinese solar/i;
  for (const lang of LANGS) {
    const sg = LP.html({ id: "a", period: SG[0], lang, method: "methodAstro" }), dy = LP.html({ id: "l", period: LP.dayPeriod(NOV25), lang, method: "methodLucky", noBody: true });
    assert.ok(!TERMS.test(sg), `${lang} astro method line names the solar terms: ${sg.replace(/<[^>]+>/g, " ").slice(-260)}`);
    assert.ok(!TERMS.test(dy), `${lang} luckycolor method line names the solar terms`);
    for (const m of ["methodHoroscope", "methodFengshui", "methodZodiac"]) assert.ok(TERMS.test(LP.html({ id: "z", period: SM[0], lang, method: m })), `${lang} ${m}: solar month stated`);
  }
});

test("2 no year or quarter doctrine in any period block (TH/EN/ZH); fengshui keeps only its annual flying star", async () => {
  const QUARTER = /ไตรมาส|\bquarter(?:ly|s)?\b|季度/i;
  const YEAR = {
    th: /ปีปกติ|ทั้งปี|ตลอดปี|ปีนี้|กลางปี|ปีชง|ปีที่|ปีเป็น|ปีแห่ง/,
    en: /\b(?:this|the|whole|ordinary|harm|clash|every|a|an|each|good|hard) year\b|\byear's\b|\byearly\b|\bannual\b|Tai Sui/i,
    zh: /这一年|今年|全年|一年|本年|年中|年份|太岁|平常年|害年|冲年/,
  };
  let n = 0;
  for (const x of await all()) {
    assert.ok(!QUARTER.test(x.text), `${x.dom} ${x.lang} ${x.p.id}: quarter wording: ${x.text.slice(0, 200)}`);
    if (x.dom !== "fengshui") assert.ok(!YEAR[x.lang].test(x.text), `${x.dom} ${x.lang} ${x.p.id}: year wording "${(x.text.match(YEAR[x.lang]) || [])[0]}": ${x.text.slice(0, 220)}`);
    n++;
  }
  assert.equal(n, (14 + 14 + 14 + 13) * 4 * 3 * 3);
});

test("3 astro reads the Sun transit with its own phrases: no Moon, no emotional focus; zodiac and astro phrase tables are drafts in TH/EN/ZH, listed for the expert", async () => {
  const MOON = /ดวงจันทร์|อารมณ์|\bMoon\b|\bemotion|月亮|情绪|情感起伏/i;
  for (const x of (await all()).filter(y => y.dom === "astro")) assert.ok(!MOON.test(x.text), `astro ${x.lang} ${x.p.id}: ${x.text.slice(0, 200)}`);
  const K = LP.PERIOD_KB, pack = read("docs/fortune/PERIOD-RULES-EXPERT.md");
  assert.ok(K && K.zodiac && K.astro, "period phrase tables");
  const rels = ["clash", "harmony", "trine", "same", "harm", "punish", "break", "neutral"];
  const entries = rels.map(r => ["zodiac.rel." + r, K.zodiac[r]]).concat(Array.from({ length: 12 }, (_, h) => ["astro.house." + h, K.astro[h]]));
  for (const [key, e] of entries) {
    assert.ok(e, key);
    assert.equal(e.status, "draft", key + " is a draft for the expert");
    for (const part of ["o", "a"]) {
      assert.ok(e.th && e.th[part] && THAI.test(e.th[part]), `${key} th.${part}`);
      assert.ok(e.en && e.en[part] && !THAI.test(e.en[part]) && !CJK.test(e.en[part]), `${key} en.${part}`);
      assert.ok(e.zh && e.zh[part] && CJK.test(e.zh[part]) && !THAI.test(e.zh[part]), `${key} zh.${part}`);
    }
    assert.ok(pack.includes("`" + key + "`"), key + " listed in docs/fortune/PERIOD-RULES-EXPERT.md");
  }
});

test("4 no day wording (stricter) and no base-reading opener in any period block, TH/EN/ZH", async () => {
  const DAY = /วันนี้|พรุ่งนี้|เมื่อวาน|วันที่\s*\d|วันดี|วันที่ดี|เป็นวัน|\btoday\b|\btomorrow\b|\btonight\b|good day|a day (?:to|for)|今天|今日|明天|明日|当天|好日子|这一天/i;
  const B = FA._internal.banks, EN = FA.en.OPENERS;
  const TH_OPEN = d => (B.OPENERS_BY_DOMAIN[d] || []).map(o => o.replace(/\{N\}/g, "คุณ").replace(/\{D\}/g, "").slice(0, 18));
  const ZH = /从出生日期排出的命盘|这份命盘结合了|按八宅风水|出生资料|命盘来看|本命盘/;
  const ENX = /Your birth date sets out a chart|Feng shui looks at directions|natal chart|birth chart|your birth date/i;
  for (const x of await all()) {
    assert.ok(!DAY.test(x.text), `${x.dom} ${x.lang} ${x.p.id}: day wording "${(x.text.match(DAY) || [])[0]}": ${x.text.slice(0, 200)}`);
    if (x.lang === "th") for (const o of TH_OPEN(x.dom)) assert.ok(!x.text.includes(o), `${x.dom} th: opener "${o}"`);
    if (x.lang === "th") assert.ok(!/ราศีหลักของคุณบอก/.test(x.text), `${x.dom} th: astro opener`);
    if (x.lang === "en") { assert.ok(!ENX.test(x.text), `${x.dom} en opener`); for (const o of (EN[x.dom] || [])) assert.ok(!x.text.includes(String(o).slice(0, 24)), `${x.dom} en opener ${o}`); }
    if (x.lang === "zh") assert.ok(!ZH.test(x.text), `${x.dom} zh opener`);
  }
});

test("5 zodiac period block: at most 900 characters, still a real reading (>= 120), TH/EN/ZH", async () => {
  for (const x of (await all()).filter(y => y.dom === "zodiac")) {
    assert.ok(x.text.length <= 900, `zodiac ${x.lang} ${x.p.id}: ${x.text.length} chars`);
    assert.ok(x.text.length >= 120, `zodiac ${x.lang} ${x.p.id}: only ${x.text.length} chars`);
  }
});

test("6 luckycolor: the advice weekday and the label come from the same Thai day, whatever the device time zone", () => {
  const TZ0 = process.env.TZ;
  try {
    for (const tz of ["America/Los_Angeles", "Pacific/Honolulu", "Asia/Bangkok", "Europe/London", "Pacific/Auckland"]) {
      process.env.TZ = tz;
      for (const iso of ["2026-11-24T20:00:00Z", "2026-11-24T16:59:00Z", "2026-11-24T17:00:00Z", "2026-11-25T10:00:00Z"]) {
        const ms = Date.parse(iso), x = LP.luckyParts(LL, ms, "work"), p = LP.dayPeriod(ms);
        const ictDay = new Date(ms + 7 * 3600e3).getUTCDay();
        assert.equal(x.period.id, p.id, `${tz} ${iso}: period`);
        assert.equal(x.weekday, ictDay, `${tz} ${iso}: the advice weekday is the Thai weekday`);
        assert.equal(x.weekday, p.weekday, `${tz} ${iso}: label and advice agree`);
        assert.deepEqual(x.rec, LL.recommend(ictDay, "work"), `${tz} ${iso}: colours of the Thai weekday`);
      }
    }
  } finally { if (TZ0 === undefined) delete process.env.TZ; else process.env.TZ = TZ0; }
  const src = read("luckycolor.js"), fn = src.slice(src.indexOf("function renderPeriod"), src.indexOf("function renderPeriod") + 1600);
  assert.match(fn, /luckyParts\(/, "the page block uses LQPeriod.luckyParts");
  assert.doesNotMatch(fn, /dayPlanet\(new Date\(\)\)/, "the page block does not take the weekday from the device clock");
});

test("7 fengshui base without a kua number: no year-star headline, identical facts and text at dates years apart", async () => {
  const f = t => FS.buildFacts({ kua: null, recorded: {}, rooms: [], photos: [], topic: "overall", now: new Date(t), layer: "base" });
  const T = [NOV25, Date.UTC(2027, 2, 3), Date.UTC(2029, 6, 1), Date.UTC(2031, 0, 9)];
  const a = f(T[0]);
  assert.ok(!/ดาวประจำปี|year star|年飞星/i.test(JSON.stringify(a.headline || "")), "headline: " + a.headline);
  for (const t of T.slice(1)) assert.deepEqual(JSON.parse(JSON.stringify(f(t))), JSON.parse(JSON.stringify(a)), "base facts changed with the date");
  for (const lang of LANGS) {
    const txt = async t => { const fa = f(t), seed = LP.baseSeed(FA, ["fengshui", fa]); return JSON.stringify((await FA.interpret(fa, { useAI: false, seed, lang })).sections || []); };
    const x0 = await txt(T[0]);
    for (const t of T.slice(1)) assert.equal(await txt(t), x0, `fengshui no-kua base ${lang} changed`);
  }
});

test("+ hard limits and crisis on the new zodiac / astro phrase tables: every sentence safe; a crisis signal never echoes, never straight, no plan", async () => {
  let n = 0;
  for (const x of (await all()).filter(y => y.dom === "zodiac" || y.dom === "astro")) for (const s of S.sentences(x.text)) {
    n++; assert.ok(S.isSafe(s) && !ST.hardLimit(s), `${x.dom} ${x.lang}: ${s}`);
  }
  assert.ok(n > 1000, "non-vacuous " + n);
  for (const dom of ["zodiac", "astro"]) for (const q of ["ช่วงนี้อยากตาย ดวงจะดีขึ้นไหม", "I want to end my life, what do the cards say", "活着好累，我该怎么办"]) for (const lang of LANGS) {
    const p = RUN[dom].per[0], fn = RUN[dom].fn(PEOPLE[0], p);
    const res = await LP.read(FA, r => Object.assign(fn(r), { question: q }), p, { lang, domain: dom, straight: true });
    assert.notEqual(res.mode, "straight"); assert.ok(!res.plan || !res.plan.length);
    const flat = JSON.stringify(res).replace(/\s+/g, ""), qq = q.replace(/\s+/g, "");
    for (let k = 0; k + 8 <= qq.length; k++) assert.ok(!flat.includes(qq.slice(k, k + 8)), `${dom} ${lang}: echoed`);
  }
});
