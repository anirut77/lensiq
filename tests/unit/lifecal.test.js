"use strict";
// node --test tests/unit — lifecal.js calendar math (solar terms, new moons, 八字, ทักษา, Thai lunar month, เลข 7 ตัว)
// and the round-7 reading features: tone (favourable/neutral/caution) with gentle caution + action, closing reminder on
// every reading (TH/ZH), the four new composer domains (bazi, taksa, lek7, lifegraph) lint-clean in both languages.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.PALM_KB = require("../../palm-kb.js");
global.FR_KB = require("../../faceread-kb.js");
const I18N = path.join(__dirname, "..", "..", "i18n");
for (const f of fs.readdirSync(I18N).filter(f => /^zh-kb-.+\.js$/.test(f))) require(path.join(I18N, f));
const FA = require("../../fortune-ai.js");
const LC = require("../../lifecal.js"), K = require("../../lifecal-kb.js");
const NM = require("../../numbers.js"), TR = require("../../tarot.js"), TKB = require("../../tarot-kb.js"), IC = require("../../iching.js");

const near = (a, b, min, msg) => assert.ok(Math.abs(a - b) * 1440 <= min, `${msg}: off by ${Math.round(Math.abs(a - b) * 1440)} min`);

test("solar terms and new moons match published times (± 20 min)", () => {
  // 立春 2024-02-04 16:27 (UTC+8), 冬至 2024-12-21 17:21, 春分 2025-03-20 17:01, 夏至 2023-06-21 22:58
  near(LC.solarTermJD(2024, 315), LC.jd(2024, 2, 4, 16, 27, 8), 20, "lichun 2024");
  near(LC.solarTermJD(2024, 270), LC.jd(2024, 12, 21, 17, 21, 8), 20, "winter solstice 2024");
  near(LC.solarTermJD(2025, 0), LC.jd(2025, 3, 20, 17, 1, 8), 20, "march equinox 2025");
  near(LC.solarTermJD(2023, 90), LC.jd(2023, 6, 21, 22, 58, 8), 20, "june solstice 2023");
  // new moons: 2000-01-06 18:14 UT, 2024-04-08 18:21 UT (total eclipse)
  near(LC.newMoonJD(0), LC.jd(2000, 1, 6, 18, 14, 0), 20, "new moon 2000-01-06");
  near(LC.newMoonBefore(LC.jd(2024, 4, 9, 12, 0, 7)).jd, LC.jd(2024, 4, 8, 18, 21, 0), 20, "new moon 2024-04-08");
});

test("八字: four pillars of known dates, year at 立春, month at 节, 23:00 day change, luck pillars", () => {
  const b = LC.bazi({ y: 2000, m: 1, d: 1, h: 12, mi: 0, tz: 8, gender: "male" });
  assert.deepEqual([b.pillars.year.zh, b.pillars.month.zh, b.pillars.day.zh, b.pillars.hour.zh], ["己卯", "丙子", "戊午", "戊午"]);
  // 己 (yin) year + male → backward; previous 节 大雪 1999-12-07 ≈ 25 days → start ≈ 8 years
  assert.equal(b.luck.forward, false); assert.ok(Math.abs(b.luck.startAge - 8.2) < 0.3, String(b.luck.startAge));
  assert.equal(b.luck.pillars[0].pillar.zh, "乙亥");
  // 1984-02-05 is after 立春 (02-04 23:19) → 甲子 year, 丙寅 month; 02-04 morning is still 癸亥 year, 乙丑 month
  const a = LC.bazi({ y: 1984, m: 2, d: 5, h: 10, tz: 8 }), z = LC.bazi({ y: 1984, m: 2, d: 4, h: 10, tz: 8 });
  assert.deepEqual([a.pillars.year.zh, a.pillars.month.zh], ["甲子", "丙寅"]);
  assert.deepEqual([z.pillars.year.zh, z.pillars.month.zh], ["癸亥", "乙丑"]);
  // 23:00 belongs to the next day (子时)
  assert.equal(LC.bazi({ y: 2000, m: 1, d: 1, h: 23, mi: 30, tz: 8 }).pillars.day.zh, LC.pillar(LC.jdn(2000, 1, 2) + 49).zh);
  // day pillar cycle: consecutive days advance by one
  assert.equal(LC.bazi({ y: 2000, m: 1, d: 2, h: 12, tz: 8 }).pillars.day.zh, "己未");
  assert.equal(b.elements.length, 5); assert.ok(["strong", "balanced", "weak"].includes(b.strength));
});

test("ทักษา, Thai lunar month and เลข 7 ตัว", () => {
  assert.equal(LC.weekday(2000, 1, 1), 6); // Saturday
  assert.equal(LC.birthPlanet({ y: 1990, m: 5, d: 16, h: 20 }).planet, 8, "Wednesday night = ราหู");
  assert.equal(LC.birthPlanet({ y: 1990, m: 5, d: 17, h: 4 }).planet, 8, "before 06:00 on Thursday = Wednesday night");
  const T = LC.taksa({ y: 1990, m: 5, d: 12, h: 8 }); // Saturday → เสาร์
  assert.equal(T.birth.planet, 7); assert.equal(T.bhumi.boriwan, 7); assert.equal(T.bhumi.ayu, 5); assert.equal(T.bhumi.kalakini, 4);
  assert.equal(T.maha[0].planet, 7); assert.equal(T.maha[0].to, 10); assert.equal(T.maha[1].planet, 5);
  assert.equal(Object.values(LC.MAHA_YEARS).reduce((a, x) => a + x, 0), 108);
  // Buddhist holidays fall on full moons of known Thai lunar months (2024): มาฆบูชา เดือน 3, วิสาขบูชา 6, อาสาฬหบูชา 8, ออกพรรษา 11
  for (const [m, d, want] of [[2, 24, 3], [5, 22, 6], [7, 20, 8], [10, 17, 11]]) assert.equal(LC.thaiLunarMonth({ y: 2024, m, d }).month, want, `2024-${m}-${d}`);
  const L = LC.lek7({ y: 1990, m: 5, d: 12, h: 8 });
  assert.deepEqual(L.rows[0], [7, 1, 2, 3, 4, 5, 6]); assert.equal(L.rows[2][0], 7); // Saturday = 7, ปีมะเมีย = 7
  assert.deepEqual(L.sum, L.rows[0].map((v, i) => v + L.rows[1][i] + L.rows[2][i]));
  const W = LC.progressedSunChanges({ y: 1990, m: 5, d: 12, h: 8 });
  assert.equal(W.natalSign, 1); assert.ok(W.changes[0].age > 5 && W.changes[0].age < 12);
});

const B = LC.bazi({ y: 1990, m: 5, d: 12, h: 8, gender: "female" }), TK = LC.taksa({ y: 1990, m: 5, d: 12, h: 8 }), WW = LC.progressedSunChanges({ y: 1990, m: 5, d: 12, h: 8 });
const CC = K.lifeCurves(B, TK, WW);
const NEW = t => [K.baziFacts(B, t, { age: 36 }), K.taksaFacts(TK, t, { age: 36 }), K.lek7Facts(LC.lek7({ y: 1990, m: 5, d: 12, h: 8 }), t), K.lifeFacts(B, TK, WW, CC, 36, t),
  K.baziFacts(LC.bazi({ y: 1975, m: 11, d: 30, h: 22, gender: "male" }), t, { age: 51 }), K.taksaFacts(LC.taksa({ y: 2001, m: 3, d: 7, h: 19 }), t, { age: 25 })];

test("new domains: bazi / taksa / lek7 / lifegraph compose lint-clean in TH and ZH, with a closing reminder", () => {
  const bad = [];
  for (const t of ["overall", "love", "work", "money"]) for (const f of NEW(t)) for (const lang of ["th", "zh"]) for (const seed of [1, 2, 3]) {
    const r = FA.compose(f, { seed, lang, trace: true });
    assert.ok(r.sections.length >= 2, f.domain + "/" + lang);
    assert.ok(r.reminder && r.reminder.length > 30, "reminder");
    if (lang === "zh") assert.ok(!/[฀-๿]/.test(r.sections.map(s => s.paragraphs.join("")).join("")), "no Thai in zh " + f.domain);
    for (const x of FA.lint(r).concat(FA.lintSemantic(f, r))) bad.push(`${f.domain}/${lang}/${t}#${seed} ${x.rule}: ${x.excerpt}`);
  }
  assert.deepEqual(bad.slice(0, 6), []);
});

test("life graph: 4 curves over ages 0–96, turning points name their system, wellbeing never mentions illness", () => {
  assert.equal(CC.points.length, 97); assert.deepEqual(CC.doms, ["work", "money", "love", "care"]);
  for (const p of CC.points) for (const v of p.v) assert.ok(v >= 8 && v <= 95);
  assert.ok(CC.turns.some(t => t.sys === "taksa") && CC.turns.some(t => t.sys === "bazi") && CC.turns.some(t => t.sys === "west"));
  for (const t of Object.values(K.DOM_LINE.care).concat(K.DOM_ACT.care)) assert.ok(FA.safety.isSafe(t) && !/โรค|ป่วย|เจ็บ/.test(t), t);
  const f = K.lifeFacts(B, TK, WW, CC, 36, "overall");
  for (const it of f.items) assert.ok(/ทักษา|八字|ตะวันตก|มหาทักษา/.test(it.evidence + it.group), "system named: " + it.id);
});

test("tone: caution items are said plainly but gently, followed by an action; harsh or action-less cautions are linted", () => {
  // numbers care pair 67 in a money reading, iching 困 (47), tarot Tower upright
  const facts = [NM.buildFacts(NM.analyzePhone("0812345678"), "money", {}), IC.buildFacts(IC.cast([8, 7, 8, 7, 7, 8]), "work", {}),
    TR.buildFacts([{ id: "m16", rev: false }, { id: TKB.cards[30].id, rev: false }, { id: TKB.cards[50].id, rev: false }], "money", "three", {})];
  let shown = 0;
  for (const f of facts) for (const lang of ["th", "zh"]) for (let seed = 0; seed < 6; seed++) {
    const r = FA.compose(f, { seed, lang });
    const t = r.sections.map(s => s.paragraphs.join(" ")).join(" ");
    if (/ตำราชี้ว่า|ตำรามองว่า|紧一些|多留意|多留心|宜稳|多花些力气|多一些体谅/.test(t)) shown++;
    assert.deepEqual(FA.lint(r).filter(x => x.rule === "caution-gentle"), [], f.domain + "/" + lang + "#" + seed);
  }
  assert.ok(shown >= 18, "cautions shown in " + shown + "/36 readings");
  const L = p => FA.lint({ lang: "th", topic: "money", sections: [{ id: "money", title: "x", paragraphs: [p] }] }).filter(x => x.rule === "caution-gentle").length;
  assert.ok(L("ช่วงนี้ตำราชี้ว่าเรื่องเงินอาจตึงมืออยู่บ้าง ดวงตกหนักมาก") > 0, "harsh");
  assert.ok(L("ช่วงนี้ตำราชี้ว่าเรื่องเงินอาจตึงมืออยู่บ้าง") > 0, "no action");
  assert.equal(L("ช่วงนี้ตำราชี้ว่าเรื่องเงินอาจตึงมืออยู่บ้าง ควรวางแผนใช้จ่ายให้รัดกุม"), 0);
});

test("closing reminder: every reading (TH/ZH, local and rendered) ends with a varied Kalama-spirit reminder", () => {
  const f = NM.buildFacts(NM.analyzePhone("0899998877"), "overall", {});
  const seen = { th: new Set(), zh: new Set() };
  for (const lang of ["th", "zh"]) for (let s = 0; s < 30; s++) { const r = FA.compose(f, { seed: s, lang }); seen[lang].add(r.reminder); assert.ok(FA.safety.isSafe(r.reminder), r.reminder); }
  assert.ok(seen.th.size >= 4 && seen.zh.size >= 4, `variety ${seen.th.size}/${seen.zh.size}`);
  for (const t of seen.th) assert.match(t, /วิจารณญาณ|เหตุผลของตัวเอง|ไตร่ตรอง/);
  for (const t of seen.th) assert.match(t, /การกระทำ|กรรม|ไม่เที่ยง/);
  const html = FA.toHTML(FA.compose(f, { seed: 1 }));
  assert.match(html, /class="fa-reminder"/);
});

test("AI grounding recall (round 7): synonyms, nominalisation and segmentation variants are kept; harmful insertions are not", () => {
  const f = TR.buildFacts([{ id: TKB.cards[17].id, rev: false }, { id: TKB.cards[40].id, rev: true }, { id: TKB.cards[63].id, rev: false }], "money", "three", { rng: () => 0.4 });
  const c = FA.safety.groundCorpus(f, [FA.compose(f, { seed: 3 }), FA.compose(f, { seed: 3 + 7919 })]);
  for (const t of ["ราชาดาบชี้ว่าการใช้ตรรกะและเหตุผลคือจุดแข็งของคุณตอนนี้", "ลองตั้งงบประมาณและเป้าหมายเล็ก ๆ ที่วัดผลได้ แล้วทบทวนทุกสัปดาห์",
    "หัวหน้าจะเห็นคุณค่าของคุณมากขึ้นเมื่อคุณแสดงความยุติธรรมให้เห็น", "ในเรื่องงาน หากทีมยังไม่เข้าจังหวะ ลองเปิดใจคุยกันเรื่องการปล่อยวาง"]) assert.ok(FA.safety.groundUnit(t, c).ok, t);
  for (const t of ["ไพ่ดวงดาวบอกว่าการเงินจะดีขึ้นแน่นอน จึงควรนำเงินเก็บทั้งหมดไปลงทุน", "ช่วงนี้ไม่ควรเดินทางไกลเพราะดวงไม่ดี", "ทบทวนทุกสัปดาห์แล้วคุณจะรวยภายในสามเดือน",
    "ราชาดาบเตือนว่าคนรักของคุณอาจกำลังปิดบังบางอย่าง", "เลข 17 ตามไพ่ดวงดาวคือเลขนำโชคของคุณ"]) assert.equal(FA.safety.groundUnit(t, c).ok, false, t);
  // a thin AI section is topped up with local sentences instead of being left with one or two lines
  const g = FA.safety.groundAI([{ id: "overview", title: "x", paragraphs: ["ราชาดาบชี้ว่าการใช้ตรรกะและเหตุผลคือจุดแข็งของคุณตอนนี้"] }, { id: "money", title: "x", paragraphs: ["การเงินของคุณมีแนวโน้มค่อย ๆ ฟื้นตัวและดีขึ้น"] }], f, FA.compose(f, { seed: 3 }), []);
  const money = g.sections.find(s => s.id === "money");
  assert.ok(FA.safety.sentences(money.paragraphs.join(" ")).length >= 3, money.paragraphs.join(" "));
});

test("remedies: every reading has a 3-point plan specific to its findings (TH/ZH), safe and matching the finding", () => {
  const FR = require("../../faceread.js");
  const face = (() => { const m = {}; for (const k in FR.NORMS) m[k] = FR.NORMS[k][0] - 1.6 * FR.NORMS[k][1]; const R = { m, cls: FR.classify(m), el: FR.elementScores(m), palaces: FR.palaceScores(m, null), mountains: FR.mountains(m), rivers: FR.rivers(m) }; return FR.buildFacts(R, { topic: "love", age: 30 }); })();
  const all = [face, NM.buildFacts(NM.analyzePhone("0812345678"), "money", {}), K.baziFacts(B, "overall", { age: 36 }), IC.buildFacts(IC.cast([8, 7, 8, 7, 7, 8]), "work", {})];
  for (const f of all) for (const lang of ["th", "zh"]) for (const seed of [1, 2]) {
    const r = FA.compose(f, { seed, lang, trace: true });
    assert.ok(r.plan && r.plan.items.length === 3, f.domain + " plan " + JSON.stringify(r.plan));
    for (const p of r.plan.items) {
      assert.ok(FA.safety.isSafe(p.t) && !/ศัลยกรรม|ซื้อ|เครื่องราง|เปลี่ยนชื่อ|เปลี่ยนเบอร์|整形|购买|改名/.test(p.t), p.t);
      if (lang === "zh") assert.ok(!/[฀-๿]/.test(p.for + p.t), "zh plan has Thai: " + p.for);
    }
    assert.deepEqual(FA.lint(r).concat(FA.lintSemantic(f, r)).filter(x => /^remedy/.test(x.rule)), []);
  }
  // face remedies are grooming/expression/skincare/posture, element lacks get the tradition's colours + routine
  const pf = FA.compose(face, { seed: 1 }).plan.items;
  assert.ok(pf.every(p => ["grooming", "expression", "skincare", "posture", "habit", "element"].includes(p.cat)), JSON.stringify(pf));
  const bz = FA.compose(K.baziFacts(B, "overall", { age: 36 }), { seed: 1 }).plan.items.find(p => p.item === "el.lo." + K.EL[B.weakest].key);
  assert.ok(bz && new RegExp(K.EL[B.weakest].color.split("และ")[0]).test(bz.t), "weak element remedy names its colour: " + (bz && bz.t));
  // lint: unsafe or mismatched remedies are flagged
  const L = r => FA.lint(r).concat(FA.lintSemantic(all[1], r)).map(x => x.rule);
  const base = FA.compose(all[1], { seed: 1 });
  assert.ok(L(Object.assign({}, base, { plan: { title: "x", items: [{ t: "ไปทำศัลยกรรมจมูกและซื้อเครื่องรางเสริมดวง", cat: "money", family: "money", item: base.plan.items[0].item }] } })).includes("remedy-safety"));
  assert.ok(L(Object.assign({}, base, { plan: { title: "x", items: [{ t: "เล็มขนคิ้วให้เป็นระเบียบ", cat: "grooming", family: "money", item: base.plan.items[0].item }] } })).includes("remedy-match"));
  // HTML shows the plan card
  assert.match(FA.toHTML(base), /class="fa-plan"/);
});

test("closing reminder states: nothing is certain, analysis from texts and tradition, own judgement, actions change things", () => {
  const f = NM.buildFacts(NM.analyzePhone("0899998877"), "overall", {});
  for (let s = 0; s < 24; s++) {
    const th = FA.compose(f, { seed: s }).reminder, zh = FA.compose(f, { seed: s, lang: "zh" }).reminder;
    assert.match(th, /ไม่มีอะไรแน่นอน/); assert.match(th, /ตำรา/); assert.match(th, /ความเชื่อดั้งเดิม/); assert.doesNotMatch(th + zh, /สถิติ|统计/);
    assert.match(zh, /保证/); assert.match(zh, /信仰/); assert.match(zh, /判断|理智|思量/); assert.match(zh, /行动|所作所为|善行/);
  }
});

test("Thai lunar month (shared by horoscope.js and lifecal.js): Buddhist holy days 2020–2030 and อธิกมาส as 8-8", () => {
  const HSC = require("../../horoscope.js");
  // [วิสาขบูชา, อาสาฬหบูชา, ออกพรรษา, ลอยกระทง] — in อธิกมาส years วิสาขบูชา moves to month 7 and อาสาฬหบูชา is in the second month 8
  const D = { 2020: [[5, 6], [7, 5], [10, 2], [10, 31]], 2021: [[5, 26], [7, 24], [10, 21], [11, 19]], 2022: [[5, 15], [7, 13], [10, 10], [11, 8]], 2023: [[6, 3], [8, 1], [10, 29], [11, 27]],
    2024: [[5, 22], [7, 20], [10, 17], [11, 15]], 2025: [[5, 11], [7, 10], [10, 7], [11, 5]], 2026: [[5, 31], [7, 29], [10, 26], [11, 24]], 2027: [[5, 20], [7, 18], [10, 15], [11, 14]],
    2028: [[5, 9], [7, 7], [10, 3], [11, 2]], 2029: [[5, 27], [7, 25], [10, 22], [11, 21]], 2030: [[5, 17], [7, 15], [10, 11], [11, 10]] };
  const ADHIKAMAS = new Set([2021, 2023, 2026, 2029]);
  for (const y of Object.keys(D).map(Number)) {
    const [vi, as, ok, lk] = D[y].map(([m, d]) => LC.thaiLunarMonth({ y, m, d }));
    const leap = ADHIKAMAS.has(y);
    assert.equal(vi.month, leap ? 7 : 6, y + " วิสาขบูชา");
    assert.equal(as.month, 8, y + " อาสาฬหบูชา"); assert.equal(as.secondEight, leap, y + " 8 หลัง");
    assert.equal(ok.month, 11, y + " ออกพรรษา"); assert.equal(lk.month, 12, y + " ลอยกระทง");
    // horoscope.js gives the same month (one shared routine)
    for (const [m, d] of D[y]) assert.equal(HSC.thaiLunarMonth(HSC.julianDay(y, m, d, 5)).month, LC.thaiLunarMonth({ y, m, d }).month, `${y}-${m}-${d}`);
  }
  // the evaluator's 2025 cases: Chinese leap 6 is not a Thai 8-8
  assert.deepEqual([LC.thaiLunarMonth({ y: 2025, m: 8, d: 9 }).month, LC.thaiLunarMonth({ y: 2025, m: 8, d: 9 }).secondEight], [9, false]);
  // อธิกมาส years follow the 19-year cycle (7 in 19)
  const ad = []; for (let y = 2001; y <= 2019; y++) if (LC.thaiLunarMonth({ y, m: 8, d: 15 }).adhikamas) ad.push(y);
  assert.equal(ad.length, 7, ad.join(","));
});

test("grounding (round 8): polarity reversal, exclusivity and fate-over-people are rejected; compound/segmentation variants are kept", () => {
  const ZD = require("../../zodiac.js");
  const f = ZD.buildFacts(ZD.annual(4, 2026, 1988), "work", { rng: () => 0.3 });
  const c = FA.safety.groundCorpus(f, [FA.compose(f, { seed: 5 }), FA.compose(f, { seed: 5 + 7919 })]);
  for (const t of ["ฟังเสียงคนรอบข้างน้อยลง เชื่อดวงอย่างเดียวพอ", "ฟังเสียงคนรอบข้างให้น้อยลง", "ไม่ต้องฟังคนรอบข้าง ดวงรู้ดีกว่า", "เชื่อดวงมากกว่าหมอ"]) {
    assert.equal(FA.safety.sentences(t).every(u => FA.safety.groundUnit(u, c).ok), false, t);
  }
  for (const t of ["เชื่อไพ่อย่างเดียวพอ ไม่ต้องปรึกษาใคร", "ดวงสำคัญกว่าคำแนะนำของแพทย์", "只信命就够了，不用听别人", "命运比医生更可靠"]) assert.equal(FA.safety.isSafe(t), false, t);
  for (const t of ["คุณมีบารมีและความมั่นใจที่ทำให้คนรอบข้างเชื่อถือ", "ลองรับฟังความเห็นของคนรอบตัวให้มากขึ้น", "เพื่อน ๆ มักพึ่งพาคุณและให้ความเคารพคุณ", "ปีนี้เหมาะกับการเรียนเพิ่มเติม เข้าคอร์สอบรม หรือหาเมนเทอร์"]) {
    assert.ok(FA.safety.sentences(t).every(u => FA.safety.groundUnit(u, c).ok), t);
  }
});
test("grounding (round 8): direction words must not be flipped against the source", () => {
  const f = NM.buildFacts(NM.analyzePhone("0812345678"), "money", {});
  const c = FA.safety.groundCorpus(f, [{ sections: [{ id: "money", paragraphs: ["ลองเก็บออมให้มากขึ้นทีละน้อยทุกเดือน", "ควรเพิ่มเวลาพักผ่อนในวันหยุด"] }] }]);
  assert.ok(FA.safety.groundUnit("ลองเก็บออมให้มากขึ้นทีละน้อยทุกเดือน", c).ok);
  assert.equal(FA.safety.groundUnit("ลองเก็บออมให้น้อยลงทีละน้อยทุกเดือน", c).ok, false);
  assert.equal(FA.safety.groundUnit("ควรลดเวลาพักผ่อนในวันหยุด", c).ok, false);
});
