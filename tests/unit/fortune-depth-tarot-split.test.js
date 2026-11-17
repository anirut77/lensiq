// fortune-depth-tarot-split.test.js — tarot caution paragraphs split into caution / non-caution sentence runs
// (fortune-depth.js splitCaution, independent review 2026-11-18). Cautions stay shown (fortune-layout-caution.test.js, locked,
// checks that independently); here: a split never cuts inside brackets, never leaves a one-word paragraph, and a crisis /
// calm reading is not split. Synthetic draws, TH / EN / ZH.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js"), TR = require("../../tarot.js"), KB = require("../../tarot-kb.js");

const lcg = s => () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
function draws(n) {
  const r = lcg(20261118), out = [], spreads = Object.keys(KB.spreads);
  for (let i = 0; i < n; i++) {
    const sp = spreads[i % spreads.length], k = KB.spreads[sp].positions.length, used = new Set(), picks = [];
    while (picks.length < k) { const c = KB.cards[Math.floor(r() * KB.cards.length)]; if (!used.has(c.id)) { used.add(c.id); picks.push({ id: c.id, rev: r() < 0.4 }); } }
    out.push({ sp, picks, q: ["general", "love", "work", "money"][i % 4] });
  }
  return out;
}
const bal = t => (t.match(/[(（]/g) || []).length === (t.match(/[)）]/g) || []).length;

test("tarot split: balanced brackets in every paragraph, no tiny paragraphs, cautions marked", () => {
  let split = 0;
  for (const d of draws(60)) for (const lang of ["th", "en", "zh"]) {
    const r = FA.compose(TR.buildFacts(d.picks, d.q, d.sp, { rng: lcg(7) }), { seed: 11, lang });
    for (const s of r.sections) {
      assert.equal(s.caution.length, s.paragraphs.length);
      for (const p of s.paragraphs) {
        assert.ok(bal(p), `${lang} unbalanced: ${p}`);
        assert.ok(p.trim().length >= (lang === "zh" ? 6 : 12), `${lang} tiny paragraph: ${p}`);
      }
      if (s.caution.some(Boolean) && s.caution.some(c => !c)) split++;
    }
  }
  assert.ok(split > 0, "some sections hold both caution and folded paragraphs");
});

test("tarot split: a calm (crisis) reading is not split and gets no depth text", () => {
  const d = draws(5)[3], f = TR.buildFacts(d.picks, "love", d.sp, { rng: lcg(3) });
  const calm = FA.compose(f, { seed: 5, lang: "th", userText: "อยากตายจริงๆ" });
  assert.ok(!calm.sections.some(s => s.id === "depth"));
  const DP = require("../../fortune-depth.js"), before = JSON.stringify(calm.sections);
  DP.splitCaution(calm, f, "th", ["x".repeat(20)], { calm: true });
  assert.equal(JSON.stringify(calm.sections), before);
});
