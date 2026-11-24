"use strict";
// node --test tests/unit — owner inbox entry 19 (2026-11-23): "same person + same period = same text; no random seed
// pretending to be astrology". LOCKED (evals-locks/fortune-90.sha256, seed/fortune-seed-determinism.test.js): never edit
// to make it pass; fix the product.
//
// The wording seed of every fortune reading is derived on the device from the reading's input data plus a period key
// (the Thai local date, UTC+7: "YYYY-MM" for base readings, "YYYY-MM-DD" for daily ones). Nothing is stored or sent.
// The shared helper is FortuneAI.seedFor(key, period, now) / FortuneAI.periodKey(period, now). Every page binder uses
// one recipe: seed = seedFor([domain, topic, factsFn(topic, rng(0))], period); facts = factsFn(topic, rng(seed));
// compose / interpret with { seed }. Tarot, I Ching and Siam Si draws stay random (the user draws); only the wording
// for a given draw is derived from the drawn cards plus the period. Checks, per page:
//   (i)   the same input + the same period, composed twice, gives identical text (TH / EN / ZH);
//   (ii)  two different inputs give different seeds;
//   (iii) the same input in two different months (daily pages: two days) gives different seeds;
//   (iv)  no Math.random and no crypto random during facts + compose (both stubbed to throw); the draws are made
//         before the stub; and the page binders in the source carry no Math.random, no seedless interpret and no
//         regenerate.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const FK = require("../../fortune-kit.js");
const HS = require("../../horoscope.js");
const ZD = require("../../zodiac.js");
const IC = require("../../iching.js");
const DR = require("../../dream.js");
const AS = require("../../astro.js");
const TR = require("../../tarot.js"), TKB = require("../../tarot-kb.js");
const NM = require("../../numbers.js");
const FS = require("../../fengshui.js");
const LC = require("../../lifecal.js"), LK = require("../../lifecal-kb.js");

const NOV = Date.UTC(2026, 10, 15, 5), DEC = Date.UTC(2026, 11, 15, 5), NOV16 = Date.UTC(2026, 10, 16, 5);
const LANGS = ["th", "en", "zh"];

/** run fn with Math.random and crypto.getRandomValues stubbed to throw */
function noRandom(fn) {
  const MR = Math.random, wc = globalThis.crypto, GRV = wc.getRandomValues;
  Math.random = () => { throw new Error("Math.random called during compose"); };
  wc.getRandomValues = () => { throw new Error("crypto random called during compose"); };
  const back = () => { Math.random = MR; wc.getRandomValues = GRV; };
  try { const v = fn(); if (v && typeof v.then === "function") return v.finally(back); back(); return v; } catch (e) { back(); throw e; }
}

/** the binder recipe (fortune-kit.js bindReading, horoscope.js / tarot.js bindReading, numbers.js narrate, fengshui.js readFortune) */
function seedOf(domain, topic, factsFn, per, now) { return FA.seedFor([domain, topic, factsFn(topic, FA.rng(0))], per, now); }
async function read(domain, topic, factsFn, per, now, lang) {
  return noRandom(async () => {
    const seed = seedOf(domain, topic, factsFn, per, now);
    const facts = Object.assign({}, factsFn(topic, FA.rng(seed)), { domain: FK.factsDomain(domain, FA), topic });
    const res = await FA.interpret(facts, { useAI: false, seed, lang });
    const text = JSON.stringify([(res.sections || []).map(s => [s.title, s.paragraphs]), res.reminder || "", res.summary || null, res.plan || null]);
    return { seed, text, res };
  });
}

// draws are inputs: made here, before any stub
const PICKS_A = [{ id: TKB.cards[3].id, rev: false }, { id: TKB.cards[40].id, rev: true }, { id: TKB.cards[70].id, rev: false }];
const PICKS_B = [{ id: TKB.cards[12].id, rev: true }, { id: TKB.cards[55].id, rev: false }, { id: TKB.cards[21].id, rev: false }];
const CAST_A = IC.cast([7, 8, 9, 7, 6, 8]), CAST_B = IC.cast([8, 8, 7, 9, 7, 7]);
const SS_A = TKB.siamsee[4], SS_B = TKB.siamsee[17];
const B1 = { y: 1990, m: 5, d: 12, h: 9, gender: "male", tz: 7, noTime: false }, B2 = { y: 1978, m: 11, d: 3, h: 21, gender: "female", tz: 7, noTime: false };
const hsP = b => HS.analyze({ y: b.y, m: b.m, d: b.d, time: { h: b.h, mi: 0 }, name: "" });
const hsDaily = b => { const P = hsP(b), D = HS.daily(P, { y: 2026, m: 11, d: 23 }), mo = HS.monthly(P, HS.julianDay(2026, 11, 23, 12) - 7 / 24); return { P, D, mo }; };
const asC = b => AS.chart({ y: b.y, m: b.m, d: b.d, time: { h: b.h, mi: 0 }, tz: 7, lat: 13.75, lon: 100.5 });
const ageOf = b => 2026 - b.y;
const lifeFn = b => { const B = LC.bazi(b), TK = LC.taksa(b), WW = LC.progressedSunChanges(b); return topic => LK.lifeFacts(B, TK, WW, LK.lifeCurves(B, TK, WW), ageOf(b), topic); };

/** page -> { domain, per, a, b }: a and b are factsFn(topic, rng) for two different inputs */
const PAGES = {
  horoscope: { domain: "horoscope", per: "m", a: (t, r) => HS.buildFacts(hsP(B1), { topic: t, nickname: "", rng: r }), b: (t, r) => HS.buildFacts(hsP(B2), { topic: t, nickname: "", rng: r }) },
  horoscopeToday: { domain: "horoscope", per: "d", a: (t, r) => { const x = hsDaily(B1); return HS.buildDailyFacts(x.P, x.D, x.mo, { topic: t, rng: r }); },
    b: (t, r) => { const x = hsDaily(B2); return HS.buildDailyFacts(x.P, x.D, x.mo, { topic: t, rng: r }); } },
  zodiac: { domain: "zodiac", per: "m", a: (t, r) => ZD.buildFacts(ZD.annual(6, 2026, 1990), t, { rng: r }), b: (t, r) => ZD.buildFacts(ZD.annual(2, 2026, 1974), t, { rng: r }) },
  zodiacPair: { domain: "zodiac", per: "m", a: t => ZD.compatFacts(ZD.compat(6, 2), t), b: t => ZD.compatFacts(ZD.compat(0, 9), t) },
  astro: { domain: "astro", per: "m", a: t => AS.buildFacts(asC(B1), t), b: t => AS.buildFacts(asC(B2), t) },
  astroToday: { domain: "astro", per: "d", a: t => AS.dailyFacts(asC(B1).sun.sign, AS.daily(asC(B1).sun.sign, new Date(NOV)), t),
    b: t => AS.dailyFacts(asC(B2).sun.sign, AS.daily(asC(B2).sun.sign, new Date(NOV)), t) },
  dream: { domain: "dream", per: "m", a: (t, r) => DR.buildFacts(["snake", "water"], "anxious", "dawn", t, { rng: r }), b: (t, r) => DR.buildFacts(["teeth"], "happy", "late", t, { rng: r }) },
  iching: { domain: "iching", per: "m", a: (t, r) => IC.buildFacts(CAST_A, t, { rng: r }), b: (t, r) => IC.buildFacts(CAST_B, t, { rng: r }) },
  ichingToday: { domain: "iching", per: "d", a: (t, r) => IC.buildFacts(CAST_A, t, { rng: r }), b: (t, r) => IC.buildFacts(CAST_B, t, { rng: r }) },
  tarot: { domain: "tarot", per: "m", a: (t, r) => TR.buildFacts(PICKS_A, t === "overall" ? "general" : t, "three", { rng: r }),
    b: (t, r) => TR.buildFacts(PICKS_B, t === "overall" ? "general" : t, "three", { rng: r }) },
  siamsee: { domain: "siamsee", per: "m", a: () => TR.siamseeFacts(SS_A), b: () => TR.siamseeFacts(SS_B) },
  bazi: { domain: "bazi", per: "m", a: t => LK.baziFacts(LC.bazi(B1), t, { age: ageOf(B1) }), b: t => LK.baziFacts(LC.bazi(B2), t, { age: ageOf(B2) }) },
  taksa: { domain: "taksa", per: "m", a: t => LK.taksaFacts(LC.taksa(B1), t, { age: ageOf(B1) }), b: t => LK.taksaFacts(LC.taksa(B2), t, { age: ageOf(B2) }) },
  lek7: { domain: "lek7", per: "m", a: t => LK.lek7Facts(LC.lek7(B1), t), b: t => LK.lek7Facts(LC.lek7(B2), t) },
  lifegraph: { domain: "lifegraph", per: "m", a: lifeFn(B1), b: lifeFn(B2) },
  numbers: { domain: "numbers", per: "m", a: t => NM.buildFacts(NM.analyzePhone("0812345678"), t, {}), b: t => NM.buildFacts(NM.analyzePhone("0899001122"), t, {}) },
  fengshui: { domain: "fengshui", per: "m", a: t => FS.buildFacts({ kua: FS.kua(1990, "male"), recorded: {}, rooms: [], photos: [], topic: t, now: new Date(NOV) }),
    b: t => FS.buildFacts({ kua: FS.kua(1975, "female"), recorded: {}, rooms: [], photos: [], topic: t, now: new Date(NOV) }) },
};

test("the shared helper: Thai local date period key and a uint32 seed", () => {
  assert.equal(typeof FA.seedFor, "function");
  assert.equal(typeof FA.periodKey, "function");
  assert.equal(FA.periodKey("m", Date.UTC(2026, 10, 30, 16, 59)), "2026-11"); // 23:59 Bangkok
  assert.equal(FA.periodKey("m", Date.UTC(2026, 10, 30, 17, 0)), "2026-12"); // 00:00 Bangkok, 1 Dec
  assert.equal(FA.periodKey("d", Date.UTC(2026, 10, 22, 17, 30)), "2026-11-23");
  assert.equal(FA.periodKey("m", new Date(NOV)), "2026-11");
  const s = FA.seedFor(["x", 1], "m", NOV);
  assert.ok(Number.isInteger(s) && s >= 0 && s < 4294967296);
  assert.equal(s, FA.seedFor(["x", 1], "m", NOV + 86400000));
  assert.notEqual(s, FA.seedFor(["x", 1], "m", DEC));
  assert.notEqual(s, FA.seedFor(["x", 2], "m", NOV));
  noRandom(() => FA.seedFor(["x"], "d"));
});

for (const [page, P] of Object.entries(PAGES)) {
  test(`${page}: same input + same period -> identical text; different input, different period -> different seed; no random`, async () => {
    const later = P.per === "d" ? NOV16 : DEC;
    for (const topic of ["overall", "love"]) {
      for (const lang of LANGS) {
        const x = await read(P.domain, topic, P.a, P.per, NOV, lang), y = await read(P.domain, topic, P.a, P.per, NOV + 3600000, lang);
        assert.equal(x.seed, y.seed, `${page} ${topic} ${lang}: same period, same seed`);
        assert.equal(x.text, y.text, `(i) ${page} ${topic} ${lang}: same input + same period must give identical text`);
        assert.ok((x.res.sections || []).length > 0, `${page} ${topic} ${lang}: a reading was composed`);
      }
      const a = noRandom(() => seedOf(P.domain, topic, P.a, P.per, NOV)), b = noRandom(() => seedOf(P.domain, topic, P.b, P.per, NOV));
      assert.notEqual(a, b, `(ii) ${page} ${topic}: two different inputs must give different seeds`);
      const c = noRandom(() => seedOf(P.domain, topic, P.a, P.per, later));
      assert.notEqual(a, c, `(iii) ${page} ${topic}: the same input in two different ${P.per === "d" ? "days" : "months"} must give different seeds`);
    }
  });
}

test("(iv) facts builders without opts.rng fall back to a deterministic generator, never Math.random", () => {
  const calls = {
    horoscope: () => HS.buildFacts(hsP(B1), { topic: "work" }),
    horoscopeToday: () => { const x = hsDaily(B1); return HS.buildDailyFacts(x.P, x.D, x.mo, { topic: "work" }); },
    zodiac: () => ZD.buildFacts(ZD.annual(6, 2026, 1990), "work", {}),
    dream: () => DR.buildFacts(["snake"], "anxious", "dawn", "work", {}),
    iching: () => IC.buildFacts(CAST_A, "work", {}),
    tarot: () => TR.buildFacts(PICKS_A, "work", "three", {}),
    tarotPosition: () => TR.positionText(TKB.byId[PICKS_A[0].id], false, "work", TKB.spreads.three.positions[0]),
  };
  for (const [k, fn] of Object.entries(calls)) {
    const a = noRandom(fn), b = noRandom(fn);
    assert.deepEqual(a, b, `${k}: the fallback must be deterministic for the same input`);
  }
});

test("(iv) page binders in the source: no Math.random, every interpret call is seeded from seedFor, no regenerate", () => {
  const FILES = ["fortune-kit.js", "horoscope.js", "zodiac.js", "dream.js", "astro.js", "lifecal-ui.js", "iching.js", "tarot.js", "numbers.js", "fengshui.js"];
  const CARD = /^\.interpret\((?:card|c), /;
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!/Math\.random/.test(src), `${f}: Math.random must not appear (draws use crypto; wording seeds come from FortuneAI.seedFor)`);
    const calls = src.match(/\.interpret\([^;]*/g) || [];
    for (const c of calls) {
      if (CARD.test(c)) continue; // tarot.js TR.interpret(card, rev, topic, pos): card meaning, not the composer
      assert.ok(/seed: seed\b/.test(c), `${f}: composer call without the derived seed: ${c.slice(0, 120)}`);
    }
    if (calls.some(c => !CARD.test(c))) assert.ok(/seedFor\(\[/.test(src), `${f}: the seed must come from FortuneAI.seedFor([...])`);
    assert.ok(!/\.regenerate\(/.test(src), `${f}: regenerate() draws a random seed; the same input + period must give the same text`);
  }
});
