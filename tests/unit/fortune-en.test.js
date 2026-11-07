"use strict";
// node --test tests/unit — English readings (fortune-ai.js composeEn + i18n/en-kb-*.js).
//  * every domain / page: readings across seeds, topics and polarities are 100 % English (no Thai/Chinese characters),
//    pass the English lint (incl. remedy-safety, remedy-match, caution-gentle, advice-topic, label-echo, report-chain) and
//    the semantic lint, keep the hard bans, and always carry the Kalama-sutta reminder and the three-step plan
//  * caution items are worded gently and followed by something practical to do
//  * the English knowledge bases mirror the Chinese ones key for key and every string is English and safe
//  * Thai and Chinese output is unchanged by the English path (language is chosen per call)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.PALM_KB = require("../../palm-kb.js");
global.FR_KB = require("../../faceread-kb.js");
const I18N = path.join(__dirname, "..", "..", "i18n");
for (const f of fs.readdirSync(I18N).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(I18N, f));
const FA = require("../../fortune-ai.js");
const FR = require("../../faceread.js"), PC = require("../../palm.js"), HS = require("../../horoscope.js");
const TR = require("../../tarot.js"), TKB = require("../../tarot-kb.js"), FS = require("../../fengshui.js"), NM = require("../../numbers.js");
const IC = require("../../iching.js"), ZD = require("../../zodiac.js"), AS = require("../../astro.js");
const DR = require("../../dream.js"), DKB = require("../../dream-kb.js");
const LC = require("../../lifecal.js"), K = require("../../lifecal-kb.js");

const FOREIGN = /[฀-๿⺀-鿿豈-﫿　-〿＀-￯]/;
const BANS = /\b(?:die|dies|died|dying|death|dead|ill|illness|sick\w*|disease|injur\w*|accidents?|disasters?|divorc\w*|affairs?|cheat\w*|unfaithful|lotter\w*|gambl\w*|lucky numbers?|amulets?|talismans?|surgery|cosmetic|botox|medication|pills?|supplements?)\b/i;
const text = r => r.sections.map(s => s.paragraphs.join(" ")).join(" ");
const everything = r => [text(r), r.reminder || "", ((r.plan && r.plan.items) || []).map(p => p.for + " " + p.t).join(" "), ((r.summary && r.summary.lines) || []).map(l => l.k + " " + l.t).join(" ")].join(" ");

function corpus(n) {
  let s = 777; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const lcg = k => { let z = k >>> 0; return () => ((z = (Math.imul(z, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const T = ["overall", "love", "work", "money"], out = [];
  const syms = DKB.SYMBOLS.map(x => x.id), moods = Object.keys(DKB.MOODS), times = Object.keys(DKB.TIMES);
  const date = () => ({ y: 1950 + Math.floor(rnd() * 55), m: 1 + Math.floor(rnd() * 12), d: 1 + Math.floor(rnd() * 28), h: Math.floor(rnd() * 24), gender: rnd() < 0.5 ? "male" : "female" });
  const gens = {
    faceread: i => { const m = {}; for (const k in FR.NORMS) { const z = (rnd() * 2 - 1) * 2.6 * (rnd() < 0.5 ? 1 : 0.5); m[k] = FR.NORMS[k][0] + z * FR.NORMS[k][1]; } m.upperEstimated = rnd() < 0.3;
      return FR.buildFacts({ m, cls: FR.classify(m), el: FR.elementScores(m), palaces: FR.palaceScores(m, null), mountains: FR.mountains(m), rivers: FR.rivers(m) }, { topic: T[i % 4], age: 20 + (i % 50) }); },
    palm: i => { const w = 300 + rnd() * 200, h = w * (1 + rnd()), side = i % 2 ? "right" : "left"; const pts = PC.synthHand({ x: 100, y: 100, w, h }, side);
      const lines = Object.fromEntries(PC.LINE_IDS.map(id => [id, { cp: PC.TEMPLATES[id].pts.map(([x, y]) => [x + (rnd() - 0.5) * 0.25, y + (rnd() - 0.5) * 0.25]), present: rnd() > 0.1 }]));
      return PC.buildFacts(PC.analyze({ hand: PC.handFromLandmarks(pts), lines, side, isDominant: !!(i % 3) }), { topic: T[i % 4], side, isDominant: true }); },
    tarot: i => { const picks = [0, 1, 2].map(() => ({ id: TKB.cards[Math.floor(rnd() * 78)].id, rev: rnd() < 0.4 })); const t = T[i % 4]; return TR.buildFacts(picks, t === "overall" ? "general" : t, "three", { rng: lcg(i) }); },
    siamsee: i => TR.siamseeFacts(TKB.siamsee[Math.floor(rnd() * TKB.siamsee.length)], { topic: T[i % 4] }),
    horoscope: i => { const d = date(); return HS.buildFacts(HS.analyze({ y: d.y, m: d.m, d: d.d, time: { h: 8, mi: 0 } }), { topic: T[i % 4], rng: lcg(i) }); },
    numbers: i => NM.buildFacts(NM.analyzePhone("08" + String(Math.floor(rnd() * 1e8)).padStart(8, "0")), T[i % 4], {}),
    iching: i => IC.buildFacts(IC.cast([0, 1, 2, 3, 4, 5].map(() => [6, 7, 8, 9][Math.floor(rnd() * 4)])), T[i % 4], { rng: lcg(i) }),
    zodiac: i => ZD.buildFacts(ZD.annual(Math.floor(rnd() * 12), 2026, 1950 + Math.floor(rnd() * 55)), T[i % 4], { rng: lcg(i) }),
    zodiacPair: i => ZD.compatFacts(ZD.compat(Math.floor(rnd() * 12), Math.floor(rnd() * 12)), T[i % 4]),
    astro: i => { const d = date(); return AS.buildFacts(AS.chart({ y: d.y, m: d.m, d: d.d, time: { h: d.h, mi: 0 }, tz: 7, lat: 13.75, lon: 100.5 }), T[i % 4]); },
    dream: i => DR.buildFacts([syms[Math.floor(rnd() * syms.length)], syms[Math.floor(rnd() * syms.length)]], moods[Math.floor(rnd() * moods.length)], times[Math.floor(rnd() * times.length)], T[i % 4], { rng: lcg(i) }),
    fengshui: i => FS.buildFacts({ kua: FS.kua(1950 + Math.floor(rnd() * 55), rnd() < 0.5 ? "male" : "female"), now: new Date(2026, (i * 7) % 12, 1 + (i % 27)) }),
    bazi: i => { const d = date(); return K.baziFacts(LC.bazi(d), T[i % 4], { age: 20 + (i % 50) }); },
    taksa: i => { const d = date(); return K.taksaFacts(LC.taksa(d), T[i % 4], { age: 20 + (i % 50) }); },
    lek7: i => { const d = date(); return K.lek7Facts(LC.lek7(d), T[i % 4]); },
    lifegraph: i => { const d = date(), B = LC.bazi(d), TK = LC.taksa(d), WW = LC.progressedSunChanges(d); return K.lifeFacts(B, TK, WW, K.lifeCurves(B, TK, WW), 20 + (i % 50), T[i % 4]); },
  };
  for (const [d, g] of Object.entries(gens)) for (let i = 0; i < n; i++) out.push({ d, f: g(i), seed: i + 1 });
  return out;
}
const CORPUS = corpus(12);

test("corpus: English readings on every page are English-only, lint-clean, safe, with reminder and plan", () => {
  const bad = {}, add = (k, x) => { (bad[k] = bad[k] || []).push(x); };
  const perDomain = {};
  let n = 0, cautions = 0;
  for (const { d, f, seed } of CORPUS) for (const s2 of [seed, seed + 100]) {
    const r = FA.compose(f, { seed: s2, lang: "en", trace: true }); n++;
    perDomain[d] = (perDomain[d] || 0) + 1;
    if (r.lang !== "en") { add("not-english", d); continue; }
    const all = everything(r);
    if (FOREIGN.test(all)) add("foreign", d + " " + all.match(/.{0,20}[฀-๿⺀-鿿豈-﫿　-〿＀-￯].{0,20}/)[0]);
    if (BANS.test(all.replace(/\bDeath\s*\(XIII\)/g, ""))) add("ban", d + " " + all.match(BANS)[0]);
    for (const v of FA.lint(r)) add("lint:" + v.rule, d + " " + v.excerpt);
    for (const v of FA.lintSemantic(f, r)) add("semantic:" + v.rule, d + " " + v.excerpt);
    if (!r.reminder || !/judgement/.test(r.reminder) || !/actions|you do/.test(r.reminder)) add("reminder", d);
    if (!r.plan || r.plan.items.length !== 3 || r.plan.items.some(p => !p.t || !p.for)) add("plan", d + " " + JSON.stringify(r.plan && r.plan.items.length));
    if (text(r).length < 600) add("thin", d + " " + text(r).length);
    if (/There isn't an English reading/.test(text(r))) add("no-data", d);
    if (/needs a little more care|a little tight|a bit more effort|extra understanding|extra care/.test(text(r))) cautions++;
  }
  assert.ok(n >= 380, String(n));
  assert.ok(Object.keys(perDomain).length >= 16, Object.keys(perDomain).join());
  assert.ok(cautions >= 20, "caution readings in corpus: " + cautions);
  assert.deepEqual(Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, v.length + ": " + v.slice(0, 2).join(" | ")])), {});
});

test("polarity: caution items are gentle and followed by a practical step; favorable items are not marked as cautions", () => {
  const f = { domain: "numbers", topic: "money", items: [
    { id: "pair.08", label: "คู่ 08", tags: ["money", "personality"], strength: 0.8, polarity: "challenge", meanings: { money: ["x"] } },
    { id: "pair.24", label: "คู่ 24", tags: ["love", "money"], strength: 0.9, meanings: { love: ["x"] } },
    { id: "pair.56", label: "คู่ 56", tags: ["work"], strength: 0.4, meanings: { work: ["x"] } }] };
  for (let seed = 1; seed <= 20; seed++) {
    const r = FA.compose(f, { seed, lang: "en" });
    const t = text(r);
    assert.match(t, /money may feel a little tight|keep a closer eye on spending|needs a little more care|pays to slow down/i, "seed " + seed);
    assert.deepEqual(FA.lint(r).filter(x => x.rule === "caution-gentle"), [], "seed " + seed);
    assert.ok(r.plan.items[0].tone === "caution" || r.plan.items.some(p => p.item === "pair.08"), "caution first in plan");
  }
  // the lint catches harsh or action-less caution wording
  const bad = p => FA.lint({ lang: "en", topic: "money", sections: [{ id: "money", title: "Money", paragraphs: [p] }] }).map(x => x.rule);
  assert.ok(bad("The traditional reading suggests money may feel a little tight for a while, and it looks terrible.").includes("caution-gentle"));
  assert.ok(bad("The traditional reading suggests money may feel a little tight for a while. Your color is green. Your number is calm. Things are quiet.").includes("caution-gentle"));
});

test("lint (en): label-echo, report-chain, advice-topic, remedy-safety, foreign script and bans are caught", () => {
  const rules = (p, id, topic, plan) => FA.lint({ lang: "en", topic: topic || "overall", sections: [{ id: id || "overview", title: "x", paragraphs: [p] }], plan }).map(x => x.rule);
  assert.ok(rules("The Lovers card suggests that the lovers in your life are close.").includes("label-echo"));
  assert.ok(rules("Pair 44 suggests that, as with all pairs, the reading shows that you are a communicator.").includes("report-chain"));
  assert.ok(rules("Finally, here are some things you can do right away. Try to tell your partner how much you love them.", "advice", "money").includes("advice-topic"));
  assert.ok(rules("A simple adjustment: buy a lucky bracelet and wear it daily.").includes("remedy-safety"));
  assert.ok(rules("x", "overview", "overall", { items: [{ t: "Get botox for a fresh look.", cat: "grooming", family: "face", item: "brow.x" }] }).includes("remedy-safety"));
  assert.ok(rules("Your reading mentions ไพ่ and 塔罗.").includes("foreign-script"));
  for (const t of ["Your partner is having an affair.", "You will definitely win the lottery.", "Your health will decline this year.", "Buy an amulet to remove bad karma.", "Skip your doctor appointment this month.", "Avoid travel by plane this month.", "Change your phone number and you will get rich.", "Stop taking your medication."])
    assert.ok(rules(t).includes("unsafe"), t);
  assert.deepEqual(rules("Turning to the Ace of Swords, an honest conversation makes things clearer. It would help to think clearly and speak kindly."), []);
});

test("knowledge bases: English mirrors Chinese key for key; every string is English and safe", () => {
  const ZH = FA.zh.data(), EN = FA.en.data(), bad = [];
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(ZH).sort());
  for (const d of Object.keys(ZH)) {
    const missing = Object.keys(ZH[d].items).filter(k => !EN[d].items[k]);
    assert.deepEqual(missing.slice(0, 5), [], d);
    const walk = (o, at) => { if (typeof o === "string") { if (FOREIGN.test(o) || !FA.safety.isSafe(o)) bad.push(at + ": " + o); return; } if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, at + "." + k); };
    walk(EN[d].items, d);
  }
  assert.deepEqual(bad.slice(0, 5), []);
  for (const k of Object.keys(FA.en.REMEDY)) assert.ok(FA.safety.isSafe(FA.en.REMEDY[k]) && !FOREIGN.test(FA.en.REMEDY[k]), k);
  for (const t of FA.en.REMINDER) assert.ok(FA.safety.isSafe(t) && /Kalama|judgement/.test(t), t);
});

test("language is per call: Thai and Chinese readings are unchanged by the English path; missing English data falls back to Thai", () => {
  const f = NM.buildFacts(NM.analyzePhone("0812345678"), "money", {});
  const th1 = JSON.stringify(FA.compose(f, { seed: 5, lang: "th" })), zh1 = JSON.stringify(FA.compose(f, { seed: 5, lang: "zh" }));
  FA.compose(f, { seed: 5, lang: "en" });
  assert.equal(JSON.stringify(FA.compose(f, { seed: 5, lang: "th" })), th1);
  assert.equal(JSON.stringify(FA.compose(f, { seed: 5, lang: "zh" })), zh1);
  // an item without English data is skipped, never shown in Thai
  const unknown = FA.compose({ domain: "tarot", topic: "overall", items: [{ id: "card.past.nosuchcard", label: "ไพ่ทดสอบ", tags: ["personality"], meanings: { personality: ["คุณเป็นคนใจดี"] } }] }, { seed: 1, lang: "en" });
  assert.equal(unknown.lang, "en");
  assert.doesNotMatch(text(unknown), /[\u0E00-\u0E7F]/);
  // the writing assistant is not used in English (local composer only)
  return FA.interpret(f, { lang: "en", useAI: true, seed: 2 }).then(r => { assert.equal(r.source, "local"); assert.equal(r.lang, "en"); });
});

test("rendering: English result sets lang=en and English 'Read more'", () => {
  const f = TR.buildFacts([{ id: TKB.cards[0].id, rev: false }, { id: TKB.cards[30].id, rev: true }, { id: TKB.cards[50].id, rev: false }], "love", "three", {});
  const r = FA.compose(f, { seed: 3, lang: "en" });
  const h = FA.toHTML(r);
  assert.doesNotMatch(h, /[฀-๿]/);
  assert.match(h, /Your three-step plan/);
  assert.match(h, /Kalama|judgement/);
});
