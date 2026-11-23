// fortune-siamsee-label.test.js — the Siam Si overview never names the slip twice in a row (independent review 2026-11-18:
// "เซียมซีใบที่ 21 (ดี) จากเซียมซีใบที่ 21 (ดี)": the headline equals the item label; fortune-depth.js keeps one). 28 slips x 4 topics x 12 seeds, TH.
const test = require("node:test");
const assert = require("node:assert");
const TR = require("../../tarot.js"), KB = require("../../tarot-kb.js"), FA = require("../../fortune-ai.js");

test("siamsee: the overview never repeats the slip label back to back", () => {
  let n = 0;
  for (const s of KB.siamsee) for (const topic of ["overall", "love", "work", "money"]) for (let seed = 1; seed <= 12; seed++) {
    const f = TR.siamseeFacts(s, { topic }), esc = t => t.replace(/[()]/g, "\\$&"), lab = esc(f.headline), item = esc(f.items[0].label);
    const r = FA.compose(f, { seed, lang: "th" });
    const text = r.sections.map(x => x.paragraphs.join(" ")).join(" ");
    for (const x of [lab, item]) assert.ok(!new RegExp(x + "\\s*(?:จาก|ซึ่ง|คือ)?\\s*" + x).test(text), `slip ${s.n} ${topic}#${seed}: ${text.slice(0, 200)}`);
    assert.ok(!/เซียมซีใบที่ \d+ \([^)]*\)\s*(?:จาก|ซึ่ง|คือ)?\s*เซียมซีใบที่ \d+/.test(text), `slip ${s.n} ${topic}#${seed}: ${text.slice(0, 200)}`);
    n++;
  }
  assert.equal(n, 28 * 4 * 12);
});
