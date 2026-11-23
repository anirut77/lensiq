"use strict";
// node --test tests/unit — owner inbox entry 20 / coordinator 2026-11-23: the "read another wording" button (อ่านอีกสำนวน / again /
// regen) still re-words, without any random source. LOCKED (evals-locks/fortune-90.sha256, seed-press/fortune-seed-press.test.js):
// never edit to make it pass; fix the product.
//
// Seed = input + Thai-date period + press index. The press index is 0 on load (and on a new input or topic) and goes up by 1 per
// press of the button. Recipe used by every page binder that has such a button:
//   seed = FortuneAI.seedFor([domain, topic, factsFn(topic, rng(0))], period)       (the first view, as in fortune-seed-determinism)
//   facts = factsFn(topic, rng(seed))                                               (facts do not depend on the press)
//   wording seed = press ? FortuneAI.seedFor([seed, press], period) : seed          (press 0 = the first view)
// Checks, per page (TH / EN / ZH):
//   (a) the same input + period + press n gives the same text (n = 0..3);
//   (b) press n and press n + 1 give different wording, with identical facts (items unchanged);
//   (c) press 0 equals the first view (no press key);
//   (d) no Math.random and no crypto random while composing (both stubbed to throw);
//   (e) source: every page with such a button counts presses, derives the wording seed with seedFor([seed, press], ...) and never
//       calls regenerate() (which draws a random seed).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
global.PALM_KB = require("../../palm-kb.js");
global.FR_KB = require("../../faceread-kb.js");
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
const FR = require("../../faceread.js"), PC = require("../../palm.js");

const NOV = Date.UTC(2026, 10, 15, 5);
const LANGS = ["th", "en", "zh"];

function noRandom(fn) {
  const MR = Math.random, wc = globalThis.crypto, GRV = wc.getRandomValues;
  Math.random = () => { throw new Error("Math.random called during compose"); };
  wc.getRandomValues = () => { throw new Error("crypto random called during compose"); };
  const back = () => { Math.random = MR; wc.getRandomValues = GRV; };
  try { const v = fn(); if (v && typeof v.then === "function") return v.finally(back); back(); return v; } catch (e) { back(); throw e; }
}

/** press = null: the first view (no press key at all); press = n: the n-th press of the button (0 = on load) */
async function read(domain, topic, factsFn, per, press, lang) {
  return noRandom(async () => {
    const seed = FA.seedFor([domain, topic, factsFn(topic, FA.rng(0))], per, NOV);
    const facts = Object.assign({}, factsFn(topic, FA.rng(seed)), { domain: FK.factsDomain(domain, FA), topic });
    const wseed = press ? FA.seedFor([seed, press], per, NOV) : seed;
    const res = await FA.interpret(facts, { useAI: false, seed: wseed, lang });
    return { facts: JSON.stringify(facts), text: JSON.stringify([(res.sections || []).map(s => [s.title, s.paragraphs]), res.summary || null]), n: (res.sections || []).length };
  });
}

// synthetic inputs only; draws are made here, before any stub
const PICKS = [{ id: TKB.cards[3].id, rev: false }, { id: TKB.cards[40].id, rev: true }, { id: TKB.cards[70].id, rev: false }];
const CAST = IC.cast([7, 8, 9, 7, 6, 8]);
const B1 = { y: 1990, m: 5, d: 12, h: 9, gender: "male", tz: 7, noTime: false };
const hsP = () => HS.analyze({ y: B1.y, m: B1.m, d: B1.d, time: { h: B1.h, mi: 0 }, name: "" });
const asC = () => AS.chart({ y: B1.y, m: B1.m, d: B1.d, time: { h: B1.h, mi: 0 }, tz: 7, lat: 13.75, lon: 100.5 });
const FACE = (() => { const m = {}; let k = 0; for (const key in FR.NORMS) { m[key] = FR.NORMS[key][0] + ((k++ % 5) - 2) * 0.6 * FR.NORMS[key][1]; } m.upperEstimated = false; return m; })();
const faceR = { m: FACE, cls: FR.classify(FACE), el: FR.elementScores(FACE), palaces: FR.palaceScores(FACE, null), mountains: FR.mountains(FACE), rivers: FR.rivers(FACE) };
const palmR = (() => {
  const pts = PC.synthHand({ x: 100, y: 100, w: 400, h: 640 }, "right");
  const lines = Object.fromEntries(PC.LINE_IDS.map((id, i) => [id, { cp: PC.TEMPLATES[id].pts.map(([x, y], j) => [x + ((i + j) % 3 - 1) * 0.05, y + ((i * j) % 3 - 1) * 0.05]), present: true }]));
  return PC.analyze({ hand: PC.handFromLandmarks(pts), lines, side: "right", isDominant: true });
})();

const PAGES = {
  horoscope: { domain: "horoscope", per: "m", fn: (t, r) => HS.buildFacts(hsP(), { topic: t, nickname: "", rng: r }) },
  zodiac: { domain: "zodiac", per: "m", fn: (t, r) => ZD.buildFacts(ZD.annual(6, 2026, 1990), t, { rng: r }) },
  astro: { domain: "astro", per: "m", fn: t => AS.buildFacts(asC(), t) },
  dream: { domain: "dream", per: "m", fn: (t, r) => DR.buildFacts(["snake", "water"], "anxious", "dawn", t, { rng: r }) },
  iching: { domain: "iching", per: "m", fn: (t, r) => IC.buildFacts(CAST, t, { rng: r }) },
  tarot: { domain: "tarot", per: "m", fn: (t, r) => TR.buildFacts(PICKS, t === "overall" ? "general" : t, "three", { rng: r }) },
  bazi: { domain: "bazi", per: "m", fn: t => LK.baziFacts(LC.bazi(B1), t, { age: 36 }) },
  lifegraph: { domain: "lifegraph", per: "m",
    fn: t => { const B = LC.bazi(B1), TK = LC.taksa(B1), WW = LC.progressedSunChanges(B1); return LK.lifeFacts(B, TK, WW, LK.lifeCurves(B, TK, WW), 36, t); } },
  numbers: { domain: "numbers", per: "m", fn: t => NM.buildFacts(NM.analyzePhone("08" + "1234" + "5678"), t, {}) },
  fengshui: { domain: "fengshui", per: "m", fn: t => FS.buildFacts({ kua: FS.kua(1990, "male"), recorded: {}, rooms: [], photos: [], topic: t, now: new Date(NOV) }) },
  faceread: { domain: "faceread", per: "m", fn: t => FR.buildFacts(faceR, { topic: t, nickname: "", age: 36 }) },
  palm: { domain: "palm", per: "m", fn: t => PC.buildFacts(palmR, { topic: t, nickname: "", side: "right", isDominant: true }) },
};

for (const [page, P] of Object.entries(PAGES)) {
  test(`${page}: press n is deterministic, press n and n + 1 differ in wording with the same facts, press 0 = first view`, async () => {
    for (const lang of LANGS) {
      const first = await read(P.domain, "overall", P.fn, P.per, null, lang);
      assert.ok(first.n > 0, `${page} ${lang}: a reading was composed`);
      const views = [];
      for (let n = 0; n <= 3; n++) {
        const a = await read(P.domain, "overall", P.fn, P.per, n, lang), b = await read(P.domain, "overall", P.fn, P.per, n, lang);
        assert.equal(a.text, b.text, `(a) ${page} ${lang}: press ${n} twice must give the same text`);
        assert.equal(a.facts, first.facts, `(b) ${page} ${lang}: press ${n} must not change the facts`);
        views.push(a.text);
      }
      assert.equal(views[0], first.text, `(c) ${page} ${lang}: press 0 must equal the first view`);
      for (let n = 0; n < 3; n++) assert.notEqual(views[n], views[n + 1], `(b) ${page} ${lang}: press ${n} and press ${n + 1} must give different wording`);
    }
  });
}

test("(e) every page with a re-word button counts presses and seeds the wording from seedFor([seed, press], ...), never regenerate()", () => {
  const FILES = ["fortune-kit.js", "horoscope.js", "tarot.js", "numbers.js", "fengshui.js", "faceread.js", "palm.js"];
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!/\.regenerate\(/.test(src), `${f}: regenerate() draws a random seed`);
    assert.ok(!/Math\.random/.test(src), `${f}: Math.random must not appear`);
    assert.ok(/seedFor\(\[seed, press\]/.test(src), `${f}: the wording seed must be seedFor([seed, press], ...)`);
    assert.ok(/press\s*(?:\+\+|\+= 1)|\+\+\s*[\w.]*press\b/i.test(src), `${f}: the press index must go up by 1 per press`);
  }
});
