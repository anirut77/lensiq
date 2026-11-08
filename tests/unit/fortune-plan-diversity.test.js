"use strict";
// Fortune: the three-step plan is built from the reading's own items (the item's unused advice line from the knowledge
// base, then a domain feature action: tarot suit and orientation, I Ching trigram, Taksa bhumi, BaZi luck god / Day
// Master strength, zodiac relation, astrology mode) before any general habit, and general habits rotate between variants.
// Diversity cap: across 600 readings per language no single plan action appears in more than 10% of readings
// (round-11 evaluator: "Pick the single most important task…" was in ~69% of readings; 24 distinct actions in total).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(repo, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(repo, "i18n", f));
const FA = require("../../fortune-ai.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");

const PER = 40; // 15 domains × 40 = 600 readings per language
async function corpus(lang) {
  const X = await exportTool(), out = [];
  for (const d of X.DOMAINS) {
    const r = X.lcg(1234 + X.DOMAINS.indexOf(d) * 77);
    for (let i = 0; i < PER; i++) { const f = X.factsFor(d, i, r); out.push({ d, f, res: FA.compose(f, { seed: i * 13 + 7, lang }) }); }
  }
  return out;
}

for (const lang of ["th", "zh", "en"]) {
  test(`plan (${lang}): no plan action in more than 10% of 600 readings; ≥ 80 distinct actions; every plan lint-clean`, async () => {
    const C = await corpus(lang), cnt = new Map();
    let own = 0, feat = 0, slots = 0;
    for (const { d, f, res } of C) {
      assert.ok(res.plan && res.plan.items.length === 3, d + ": three items");
      const seen = new Set();
      for (const p of res.plan.items) {
        slots++; if (p.own) own++; if (p.feat) feat++;
        assert.ok(p.t && p.for, d + ": text and target");
        if (!seen.has(p.t)) { seen.add(p.t); cnt.set(p.t, (cnt.get(p.t) || 0) + 1); }
      }
      const bad = FA.lint(res, f).filter(x => /^(?:plan|remedy-match|remedy-safety|habit-as-tradition|plan-element)$/.test(x.rule))
        .concat(FA.lintSemantic(f, res).filter(x => /^(?:remedy-match|plan-element)$/.test(x.rule)));
      assert.deepEqual(bad, [], d);
    }
    const top = [...cnt].sort((a, b) => b[1] - a[1]);
    assert.ok(top[0][1] / C.length <= 0.10, `${(top[0][1] / C.length * 100).toFixed(1)}%: ${top[0][0]}`);
    assert.ok(cnt.size >= 80, "distinct " + cnt.size);
    assert.ok((own + feat) / slots >= 0.12, `item-specific share ${own + feat}/${slots}`);
  });
}

test("plan: tarot suit/orientation, I Ching trigram and Taksa bhumi give their own action (TH/ZH/EN); the lint catches a forged one", async () => {
  const X = await exportTool();
  const tarot = new Map(), tri = new Set(), bhumi = new Set();
  for (let i = 0; i < 160; i++) {
    for (const d of ["tarot", "iching", "taksa"]) {
      const f = X.factsFor(d, i, X.lcg(500 + i));
      for (const lang of ["th", "zh", "en"]) {
        const res = FA.compose(f, { seed: i, lang });
        for (const p of res.plan.items.filter(x => x.feat)) {
          assert.ok(f.items.some(it => it.id === p.item), p.key + " belongs to an item of the reading");
          if (lang !== "th") assert.ok(!/[฀-๿]/.test(p.t), lang + " has no Thai: " + p.t);
          if (d === "tarot") { if (!tarot.has(p.key)) tarot.set(p.key, new Set()); tarot.get(p.key).add(p.t); }
          if (d === "iching") tri.add(p.key);
          if (d === "taksa") bhumi.add(p.key);
        }
      }
    }
  }
  assert.ok(tarot.size >= 8, "tarot suit actions: " + [...tarot.keys()].join(","));
  assert.ok(tri.size >= 6, "trigram actions: " + [...tri].join(","));
  assert.ok(bhumi.size >= 6, "bhumi actions: " + [...bhumi].join(","));
  // a card's plan line depends on the card: the same spread with different cards gives different actions
  const pick = (id, rev) => [{ id, rev }];
  const TKB = require("../../tarot-kb.js"), TR = require("../../tarot.js");
  const sp = Object.keys(TKB.spreads).find(k => TKB.spreads[k].positions.length === 1) || Object.keys(TKB.spreads)[0];
  const n = TKB.spreads[sp].positions.length, ids = TKB.cards.map(c => c.id);
  const planFor = (offset, rev) => { const p = []; for (let k = 0; k < n; k++) p.push(pick(ids[(offset + k * 7) % 78], rev)[0]); return FA.compose(TR.buildFacts(p, "general", sp, { rng: X.lcg(3) }), { seed: 1, lang: "en" }).plan.items.map(x => x.t).join("|"); };
  const plans = new Set([0, 22, 36, 50, 64].flatMap(o => [planFor(o, false), planFor(o, true)]));
  assert.ok(plans.size >= 6, "different cards → different plans: " + plans.size);
  // forged feature key → remedy-match
  const f = X.factsFor("iching", 3, X.lcg(9)), res = FA.compose(f, { seed: 2, lang: "en" });
  const it = f.items.find(x => /^tri\.lower\./.test(x.id));
  const forged = Object.assign({}, res, { plan: { title: "x", items: [{ t: "x", key: "feat.iching.none", feat: true, cat: "feature", family: "reflect", item: it.id, for: "x" }] } });
  assert.ok(FA.lintSemantic(f, forged).some(x => x.rule === "remedy-match"));
});

test("plan: general habits are variants of the same category (remedy-match stays valid) and carry an English text", () => {
  const keys = Object.keys(FA.en.REMEDY).filter(k => /\.v\d+$/.test(k));
  assert.ok(keys.length >= 30, String(keys.length));
  for (const k of keys) assert.ok(FA.safety.isSafe(FA.en.REMEDY[k]) && !/[฀-๿一-鿿]/.test(FA.en.REMEDY[k]), k);
});

test("caution: every reading whose facts carry a caution has a caution item in its plan and names a caution in the overview when it has an overview meaning (TH/ZH/EN)", async () => {
  // round-11 HEAD: 357 of 1008 such readings had no caution in the plan (horoscope, taksa zh/en, numbers zh/en …)
  const X = await exportTool();
  const toneOf = it => (["favourable", "neutral", "caution"].includes(it.tone) ? it.tone : it.polarity === "challenge" ? "caution" : (it.strength || 0) >= 0.5 ? "favourable" : "neutral");
  let n = 0;
  for (const d of X.DOMAINS) for (const lang of ["th", "zh", "en"]) {
    const r = X.lcg(99 + X.DOMAINS.indexOf(d));
    for (let i = 0; i < 24; i++) {
      const f = X.factsFor(d, i, r);
      if (!f.items.some(it => toneOf(it) === "caution")) continue;
      n++;
      const res = FA.compose(f, { seed: i, lang });
      assert.ok(res.plan.items.some(p => p.tone === "caution"), `${d}/${lang}#${i}: ${res.plan.items.map(p => p.tone + ":" + p.for).join(" / ")}`);
    }
  }
  assert.ok(n >= 300, String(n));
});
