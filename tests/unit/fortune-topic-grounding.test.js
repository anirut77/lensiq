"use strict";
// Fortune topic-following advice + AI grounding gate regression suite (from the round-6 evaluator findings).
//  * numbers: every number pattern has its own meaning (no shared generic sentence), the digit-sum is not introduced twice
//  * advice follows the asked topic in every domain (composer) and the lint rule "advice-topic" catches the old output
//  * label-echo / report-chain catch "ผลรวม 44 (…) แสดงว่าตามแนวที่อ่านผลรวมเป็นคู่เลข ผลรวม 44 ให้ข้อคิดว่า"
//  * AI path: a grounding gate keeps only sentences that restate a vetted local sentence; free-form claims are removed
//    even when the category filter misses them, while locally composed text survives the gate (≥ 95 %)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.PALM_KB = require("../../palm-kb.js");
global.FR_KB = require("../../faceread-kb.js");
const I18N = path.join(__dirname, "..", "..", "i18n");
for (const f of fs.readdirSync(I18N).filter(f => /^zh-kb-.+\.js$/.test(f))) require(path.join(I18N, f));
const FA = require("../../fortune-ai.js");
const NM = require("../../numbers.js"), NKB = require("../../numbers-kb.js");
const TR = require("../../tarot.js"), TKB = require("../../tarot-kb.js"), HS = require("../../horoscope.js");
const IC = require("../../iching.js"), ZD = require("../../zodiac.js"), DR = require("../../dream.js"), DKB = require("../../dream-kb.js");

const text = r => r.sections.map(s => s.paragraphs.join(" ")).join(" ");

test("numbers: each pattern has its own meanings; no generic shared pattern sentence", () => {
  const ids = ["run", "up", "down", "mirror", "abab", "aabb", "nozero"];
  const seen = new Map();
  for (const id of ids) {
    const m = NKB.patterns[id];
    assert.ok(m && m.personality && m.personality.length, id);
    for (const k in m) for (const s of m[k]) { assert.ok(!seen.has(s), "shared: " + s); seen.set(s, id); assert.ok(FA.safety.isSafe(s), s); }
  }
  for (const ph of ["0812345678", "0899998877", "0861234321", "0891357913"]) {
    const f = NM.buildFacts(NM.analyzePhone(ph), "overall", {});
    for (const it of f.items.filter(x => /^pattern\./.test(x.id))) {
      const all = Object.values(it.meanings).flat().join(" ");
      assert.doesNotMatch(all, /สะท้อนความเป็นระเบียบและจังหวะที่ลงตัว|ทำให้จำง่ายและติดหู/, it.id);
    }
    // ผลรวมในคำทำนายไม่มีคำนำ "ผลรวม NN ให้ข้อคิดว่า" ซ้อนกับชื่อ
    const sum = f.items.find(x => /^sum\./.test(x.id));
    for (const k in sum.meanings) for (const m of sum.meanings[k]) assert.doesNotMatch(m, /^ผลรวม|ตามแนวที่อ่าน/, m);
    for (const lang of ["th", "zh"]) for (const seed of [1, 2, 3]) {
      const r = FA.compose(f, { seed, lang });
      assert.doesNotMatch(text(r), /ตามแนวที่อ่านผลรวม|ให้ข้อคิดว่า ผลรวม/);
    }
  }
  // Chinese: the repeated-digit pattern names the repeated digits (999), not the run length
  const z = FA.zh.item("numbers", { id: "pattern.run", label: "เลขซ้ำ 3 ตัว (999)", tags: ["personality"], meanings: {} });
  assert.match(z.label, /999/);
});

test("advice follows the asked topic (phone 0812345678 / money and a corpus over domains)", () => {
  const f = NM.buildFacts(NM.analyzePhone("0812345678"), "money", {});
  for (const lang of ["th", "zh"]) for (let seed = 0; seed < 12; seed++) {
    const r = FA.compose(f, { seed, lang });
    const adv = r.sections.filter(s => s.id === "advice" || s.id === "money").map(s => s.paragraphs.join(" ")).join(" ");
    assert.doesNotMatch(adv, /สื่อสารในความสัมพันธ์|伴侣沟通/, lang + "#" + seed);
    assert.deepEqual(FA.lint(r).filter(x => x.rule === "advice-topic"), [], lang + "#" + seed);
  }
  const gens = [
    t => TR.buildFacts([{ id: TKB.cards[13].id, rev: false }, { id: TKB.cards[30].id, rev: true }, { id: TKB.cards[50].id, rev: false }], t === "overall" ? "general" : t, "three", {}),
    t => HS.buildFacts(HS.analyze({ y: 1990, m: 5, d: 12, time: { h: 8, mi: 0 } }), { topic: t }),
    t => IC.buildFacts(IC.cast([7, 8, 9, 6, 7, 7]), t, {}),
    t => ZD.buildFacts(ZD.annual(3, 2026, 1987), t, {}),
    t => DR.buildFacts([DKB.SYMBOLS[3].id, DKB.SYMBOLS[40].id], Object.keys(DKB.MOODS)[0], Object.keys(DKB.TIMES)[0], t, {}),
    t => NM.buildFacts(NM.analyzePhone("0899998877"), t, {}),
  ];
  for (const g of gens) for (const t of ["love", "work", "money", "overall"]) for (const lang of ["th", "zh"]) for (const seed of [3, 9]) {
    const r = FA.compose(g(t === "overall" ? "overall" : t), { seed, lang });
    assert.deepEqual(FA.lint(r).filter(x => x.rule === "advice-topic").map(x => x.excerpt), [], t + "/" + lang);
  }
});

test("lint: advice-topic, label-echo and report-chain catch the old echoed numbers output", () => {
  const rules = r => FA.lint(r).map(x => x.rule);
  const money = p => ({ lang: "th", topic: "money", sections: [{ id: "money", title: "x", paragraphs: [p] }] });
  assert.ok(rules(money("ส่วนเรื่องการเงินที่อยากรู้ มีจุดที่บอกได้ชัดคือคู่ 56 กับคู่ 78 คู่ 56 บ่งบอกว่าผสมปัญญากับความสุข ทำให้ชีวิตลงตัวทั้งงานและเงิน ก้าวแรกในเรื่องการเงินที่ทำได้เลยคือใส่ใจการสื่อสารในความสัมพันธ์และการติดตามเงินที่ให้ยืม")).includes("advice-topic"));
  assert.ok(rules({ lang: "th", topic: "money", sections: [{ id: "advice", title: "x", paragraphs: ["ปิดท้ายด้วยสิ่งที่ลงมือได้เลย ลองบอกคำชื่นชมคนรักแบบเจาะจงวันละเรื่อง"] }] }).includes("advice-topic"));
  // คำที่บังเอิญมีตัวอักษรของหัวข้อไม่นับ (สีน้ำเงิน, โต๊ะทำงาน, "ลองบอก" ที่มี "งบ")
  assert.deepEqual(rules({ lang: "th", topic: "love", sections: [{ id: "advice", title: "x", paragraphs: ["สีที่เข้ากับผลครั้งนี้คือฟ้าคราม และเงิน ลองหันโต๊ะทำงานไปทางทิศเหนือ ลองบอกความในใจกับคนรักให้ชัด"] }] }).filter(x => x === "advice-topic"), []);
  const echo = rules({ lang: "th", sections: [{ id: "work", title: "x", paragraphs: ["หันมาดูเรื่องงานบ้าง ผลรวม 44 (คู่สื่อสารสองเท่า) แสดงว่าตามแนวที่อ่านผลรวมเป็นคู่เลข ผลรวม 44 ให้ข้อคิดว่า เหมาะกับงานสื่อสาร งานสอน หรืองานคอนเทนต์"] }] });
  assert.ok(echo.includes("label-echo") && echo.includes("report-chain"), echo.join());
  assert.ok(rules({ lang: "zh", topic: "money", sections: [{ id: "money", title: "财运", paragraphs: ["你问的财运，可以从数对 56 来看。建议你多和伴侣沟通，把心里话说出来。"] }] }).includes("advice-topic"));
});

test("safety: category filter catches every probe category without blocking negations or card names", () => {
  for (const t of ["เดือนหน้าอาจมีเรื่องเสียใจเกี่ยวกับคนในบ้าน", "ช่วงนี้อย่าขึ้นเครื่องบิน", "คนรักของคุณกำลังมีความลับกับคนอื่น", "เขาไม่ได้รักคุณจริง",
    "เปลี่ยนชื่อแล้วจะรวยทันที", "เล่นหุ้นปั่นช่วงนี้กำไรงาม", "กู้นอกระบบมาขยายกิจการได้เลย", "ลาออกพรุ่งนี้เลย ไม่ต้องคิดมาก", "งดไปหาหมอฟันไปก่อน ดวงไม่ดี",
    "ดวงบอกว่าลูกในท้องจะเป็นผู้ชาย", "เลขมงคลของคุณคือ 15 และ 51 ลองเอาไปเสี่ยงดู", "ห้ามแต่งงานปีนี้เด็ดขาด", "明年你会生个儿子", "这个月别坐飞机", "改名以后就会发财"]) {
    assert.equal(FA.safety.isSafe(t), false, t);
  }
  for (const t of ["ไพ่ความตาย (Death) หมายถึงการเปลี่ยนผ่าน ไม่ใช่ความตายจริง", "死神牌象征转变而不是真的死亡", "การออมและลงทุนระยะยาวอย่างสม่ำเสมอให้ผลดีกว่าการเก็งกำไร",
    "ความชัดเจนและการตัดสินใจอย่างเด็ดขาดจะช่วยให้ทุกอย่างกลับมาราบรื่น", "ฝันว่าตั้งครรภ์หมายถึงสิ่งดีที่กำลังก่อตัว", "ถ้ารู้สึกเหนื่อยลองไปพบแพทย์เพื่อตรวจสุขภาพประจำปี"]) {
    assert.equal(FA.safety.isSafe(t), true, t);
  }
  // ชื่อไพ่ถูกตัดออกเฉพาะชื่อ เนื้อความต้องห้ามที่เหลือยังถูกจับ
  assert.equal(FA.safety.isSafe("ไพ่ความตายบอกว่าคุณจะตายปีนี้"), false);
  assert.equal(FA.safety.isSafe("ไม่ใช่ความตายจริง แต่ญาติจะเสียชีวิต"), false);
});

const CTX = () => [
  NM.buildFacts(NM.analyzePhone("0812345678"), "money", {}),
  TR.buildFacts([{ id: TKB.cards[13].id, rev: false }, { id: TKB.cards[30].id, rev: true }, { id: TKB.cards[50].id, rev: false }], "love", "three", {}),
  HS.buildFacts(HS.analyze({ y: 1990, m: 5, d: 12, time: { h: 8, mi: 0 } }), { topic: "work" }),
  IC.buildFacts(IC.cast([7, 8, 9, 6, 7, 7]), "overall", {}),
];

test("AI grounding gate: locally composed text survives (≥ 95 %), injected free-form claims are removed", () => {
  let kept = 0, all = 0;
  for (const f of CTX()) for (const seed of [5, 11, 99]) {
    const loc = FA.compose(f, { seed: 1 }), ai = FA.compose(f, { seed });
    const g = FA.safety.groundAI(ai.sections.map(s => ({ id: s.id, title: "x", paragraphs: s.paragraphs })), f, loc, []);
    kept += g.log.kept; all += g.log.kept + g.log.dropped;
    assert.ok(g.sections && g.sections.some(s => s.id === "overview"));
  }
  assert.ok(kept / all >= 0.95, String(kept / all));
  // ข้อความที่ตัวกรองหมวดเนื้อหาไม่รู้จัก ก็ถูกตัดเพราะไม่มีต้นทาง
  const inject = ["ช่วงนี้มีโอกาสเดินทางไกลแต่ควรเลื่อนไปก่อน", "คุณจะเจอเนื้อคู่ในเดือนหน้า", "ชีวิตคุณถูกลิขิตให้ล้มเหลว ทำอะไรก็ไม่ขึ้น",
    "ลาออกจากงานพรุ่งนี้เลย ดวงบอกให้ไป", "คำทำนายนี้แม่นยำ 100% เชื่อได้เลย", "คุณอ้วนเกินไป ดวงความรักเลยไม่มา", "ซื้อเลข 27 กับ 72 ไว้"];
  CTX().forEach((f, i) => {
    const loc = FA.compose(f, { seed: 1 }), ai = FA.compose(f, { seed: 77 + i });
    const secs = ai.sections.map(s => ({ id: s.id, title: "AI title " + s.id, paragraphs: s.paragraphs.slice() }));
    const tgt = secs.find(s => s.id === f.topic) || secs[1];
    tgt.paragraphs[0] += " " + inject.join(" ");
    const g = FA.safety.groundAI(secs, f, loc, []);
    const out = g.sections.map(s => s.title + " " + s.paragraphs.join(" ")).join(" ");
    for (const line of inject) for (const u of FA.safety.sentences(line)) assert.ok(!out.includes(u), u);
    assert.ok(!/AI title/.test(out), "titles come from the local table");
  });
  // ทั้งชุดไม่มีต้นทาง → null (ผู้เรียกใช้ตัวเรียบเรียงในเครื่อง)
  const f = CTX()[0];
  const g = FA.safety.groundAI([{ id: "overview", title: "x", paragraphs: ["วันนี้ฝนจะตกหนักทั่วกรุงเทพ ระวังน้ำท่วมขังถนน", "ราคาทองจะพุ่งขึ้นสัปดาห์หน้า"] }], f, FA.compose(f, { seed: 1 }), []);
  assert.equal(g.sections, null);
});

test("AI grounding: negations must come from the source with the same word, numbers must exist in the facts", () => {
  const f = CTX()[0], loc = FA.compose(f, { seed: 1 });
  const c = FA.safety.groundCorpus(f, [loc]);
  assert.equal(FA.safety.groundUnit("ทำอะไรก็ไม่ขึ้น", c).ok, false);
  assert.equal(FA.safety.groundUnit("เลขมงคลของคุณคือ 15 และ 51", c).ok, false);
  assert.equal(FA.safety.groundUnit("ตามตำรา คู่ 78 ชี้ว่าคุณเหมาะกับการลงทุนระยะยาว", c).ok, true);
});
