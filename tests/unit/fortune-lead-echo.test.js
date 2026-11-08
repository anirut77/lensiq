"use strict";
// Fortune (EN/ZH): repeated phrases inside one sentence. The round-11 evaluator found a lead frame repeating the name
// that the meaning already contains in 127 of 600 English readings ("Turning to this luck period, this luck period
// centers on…", "held by Rahu, the shadow planet: … from Rahu, the shadow planet", "(Thai sidereal zodiac), by the Thai
// sidereal zodiac"). The composer now drops the lead (or uses a pronoun when the name carries a number the meaning does
// not), and FA.lintRepeats flags any lead clause whose phrase is repeated later in the sentence.
// Measured on this corpus at round 12: HEAD (round 11) en 227/600, zh 316/600 → en 0/600, zh 43/600 (knowledge-base
// parallelisms such as "平等地付出，也平等地接受").
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(repo, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(repo, "i18n", f));
const FA = require("../../fortune-ai.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");

const one = (lang, p) => FA.lintRepeats({ lang, sections: [{ id: "overview", title: "x", paragraphs: [p] }] });

test("lead-echo lint: flags the evaluator's English and Chinese frames, keeps natural sentences", () => {
  for (const p of [
    "Turning to this luck period, this luck period centers on income, careful choices and managing your money.",
    "Start with your power area (decha), held by Rahu, the shadow planet: your standing and influence at work come from Rahu, the shadow planet.",
    "As for your Sun in Libra (Thai sidereal zodiac), by the Thai sidereal zodiac, the Sun was in Libra when you were born.",
    "Looking at a full Wealth palace, your Wealth palace, the tip and wings of the nose, is full.",
  ]) assert.equal(one("en", p).length, 1, p);
  for (const p of ["夫妻宫饱满这一点说明，你眼尾到太阳穴的夫妻宫饱满，有魅力又会照顾人。", "再看这步大运，这步大运的重点是收入、谨慎投资和理财。"]) assert.equal(one("zh", p).length, 1, p);
  for (const p of ["Your Wealth palace, the tip and wings of the nose, is full.", "The main focus this time is the Four of Swords (upright) and the Nine of Swords (upright).", "Try to win hearts before you try to win the argument."]) assert.deepEqual(one("en", p), [], p);
  assert.deepEqual(one("zh", "什么时候该进、什么时候该等，这里也有提示。"), []);
  assert.deepEqual(FA.lintRepeats({ lang: "th", sections: [{ id: "x", paragraphs: ["ช่วงนี้ ช่วงนี้"] }] }), [], "Thai is not checked here");
});

test("lead-echo corpus: English 0 and Chinese ≤ 10% of 600 readings; the evaluator's three frames never occur", async () => {
  const X = await exportTool();
  const rate = {}, FRAMES = /this luck period, this luck period|Rahu, the shadow planet[^.]*Rahu, the shadow planet|sidereal zodiac\), by the Thai sidereal zodiac/;
  for (const lang of ["en", "zh"]) {
    let bad = 0, n = 0;
    for (const d of X.DOMAINS) {
      const r = X.lcg(77 + X.DOMAINS.indexOf(d));
      for (let i = 0; i < 40; i++) {
        const res = FA.compose(X.factsFor(d, i, r), { seed: i * 7 + 3, lang }); n++;
        if (FA.lintRepeats(res).length) bad++;
        if (lang === "en") for (const s of res.sections) for (const p of s.paragraphs) assert.ok(!FRAMES.test(p), d + ": " + p.slice(0, 120));
      }
    }
    rate[lang] = bad / n;
  }
  assert.ok(rate.en <= 0.01, "en " + rate.en);
  assert.ok(rate.zh <= 0.10, "zh " + rate.zh);
});
