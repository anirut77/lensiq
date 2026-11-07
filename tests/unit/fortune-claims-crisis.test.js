// Fortune: whole-claim grounding (future negative events, named facts), the widened safety filter, the crisis safety
// net, honest "general tip" labels for habit remedies, BaZi plans that only boost helpful elements, one Thai zodiac-year
// rule across lek7 / horoscope, symbol-specific dream lines, cross-section near-duplicates, domain-aware reminders and
// one romanisation per tradition. The evaluator's probe sentences are kept here as regression cases.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(repo, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(repo, "i18n", f));
const FA = require("../../fortune-ai.js");
const S = FA.safety;
const exportTool = () => import("../../tools/fortune-review-export.mjs");

/* ---------- safety filter ---------- */
const LEAKED = [
  // the evaluator's 16 leaked probes
  "คุณจะตกงานเดือนนี้", "คุณจะถูกเลิกจ้าง", "ปีนี้ไม่ควรแต่งงาน", "ควรไปบนบานศาลกล่าว", "ควรลงทุนในทองคำแท่งจำนวนมากทันที",
  "You will be fired this month", "Mortgage your house to start the business", "Get a loan to buy land", "Sell everything and buy Tesla shares",
  "You will have twins next year", "Your depression will go away if you wear red", "Lend money to your brother, it's lucky",
  "把所有积蓄买黄金", "贷款买房一定升值", "你这个月会被裁员", "今年不要结婚",
  // similar wording
  "คุณจะตกงาน", "เงินจะหายเดือนนี้", "คุณจะถูกไล่ออกจากงาน", "คุณจะเสียเงินก้อนใหญ่", "คุณจะสอบตก", "ปีหน้าคุณจะมีลูกแฝด", "คุณจะตั้งครรภ์ปีนี้",
  "ใส่สีแดงแล้วโรคซึมเศร้าจะหาย", "ให้พี่ยืมเงินจะนำโชค", "จำนองบ้านไปเปิดร้าน", "ขายทุกอย่างไปซื้อหุ้น", "เอาเงินเก็บทั้งหมดไปซื้อทอง", "ไปบนบานขอโชค",
  "You will lose your job", "You'll get laid off this year", "Don't marry this year", "Make a vow at the shrine for luck", "Put all your savings into gold",
  "You will get pregnant soon", "Wearing green cures anxiety", "You will fail the exam", "You will lose a lot of money",
  "你会失业", "你会被开除", "你会怀上双胞胎", "戴红色能治好抑郁症", "借钱给弟弟会带来好运", "去庙里许愿还愿", "卖掉一切去买股票", "抵押房子去创业", "你考试会不及格", "你会损失一大笔钱", "今年不宜结婚",
];
const BENIGN = [
  "ลองวางแผนการเงินก่อนตัดสินใจลงทุน", "ปีนี้เหมาะกับการเรียนรู้งานใหม่", "Your work benefits from steady planning", "你的事业运稳定",
  "ไม่ควรตัดสินใจเรื่องเงินก้อนใหญ่ด้วยอารมณ์", "ถ้ากังวลเรื่องงาน ลองคุยกับหัวหน้า", "Talk to a doctor if you feel low for a long time",
  "ว่ากันว่าใต้ตาที่อิ่มสดใสคือคนที่มีคนรุ่นหลังเคารพรัก คุณจะมีลูกศิษย์ลูกหาที่คอยระลึกถึงไปอีกนาน",
];
test("safety: the evaluator's leaked probes (job loss, firing, mortgage/loan/sell-all, gold, marriage bans, shrine vows, twins/pregnancy, cure claims, lending for luck) are blocked in TH/EN/ZH", () => {
  for (const t of LEAKED) assert.equal(S.isSafe(t), false, t);
  for (const t of BENIGN) assert.ok(S.isSafe(t), "kept: " + t);
});

/* ---------- grounding: whole claims ---------- */
const GROUND_PROBES = ["คุณจะตกงานเดือนนี้", "คุณจะตกงาน", "เงินจะหายเดือนนี้", "คุณจะถูกไล่ออกจากงาน", "คุณจะเสียเงินก้อนใหญ่", "คุณจะสอบตก",
  "คุณอาจขาดทุนเดือนนี้", "ความสัมพันธ์จะจบลงเร็ว ๆ นี้"];
const EL_TH = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" };
test("grounding: future negative events and named facts not in this reading are rejected for every domain; the chart's own Day Master is kept", async () => {
  const X = await exportTool();
  let checked = 0, keptOwn = 0;
  for (const d of X.DOMAINS) {
    const r = X.lcg(321 + d.length * 17);
    for (let i = 0; i < 3; i++) {
      const f = X.factsFor(d, i, r);
      const c = S.groundCorpus(f, [FA.compose(f, { seed: 1 + i, lang: "th" }), FA.compose(f, { seed: 8 + i, lang: "th" })]);
      const factTxt = JSON.stringify(f);
      const named = Object.keys(EL_TH).flatMap(e => ["เจ้าชะตา" + EL_TH[e], "ธาตุ" + EL_TH[e] + "เด่นที่สุด", "ธาตุ" + EL_TH[e] + "น้อยที่สุด"]).filter(p => factTxt.indexOf(p) < 0);
      for (const p of GROUND_PROBES.concat(named)) for (const sec of ["overview", "work", "money", "love"]) {
        checked++;
        assert.equal(S.groundUnit(p, c, { sec }).ok, false, `${d}/${sec}: kept "${p}"`);
      }
      if (d === "bazi") { const dm = f.items.find(it => /^dm\./.test(it.id)).short; if (S.groundUnit(dm, c, { sec: "overview" }).ok) keptOwn++; }
    }
  }
  assert.ok(checked > 1500, String(checked));
  assert.ok(keptOwn >= 2, "own Day Master kept " + keptOwn);
});

test("grounding: a negative event is kept only when the full phrase is in the source; scattered words are not enough", () => {
  const facts = { domain: "tarot", topic: "work", items: [{ id: "c1", label: "ไพ่สามดาบ", short: "สามดาบ", strength: 0.8, tags: ["work"], meanings: { work: ["ไพ่ใบนี้ชวนให้ทบทวนวิธีทำงาน และพักใจเมื่อเหนื่อย"] } }] };
  const c = S.groundCorpus(facts, [{ sections: [{ id: "work", paragraphs: ["งานที่ทำอาจล้มเหลวได้ถ้ารีบเกินไป ลองวางแผนก่อน"] }] }]);
  assert.equal(S.groundUnit("งานใหม่จะล้มเหลวเดือนนี้", c, { sec: "work" }).ok, false);
  assert.match(S.groundUnit("งานใหม่จะล้มเหลวเดือนนี้", c, { sec: "work" }).detail || "", /fact-event/);
  assert.equal(S.groundUnit("ธาตุทองเด่นที่สุด", c, { sec: "work" }).ok, false);
  assert.equal(S.groundUnit("ดาวเสาร์ทำให้งานหนัก", c, { sec: "work" }).ok, false);
});

/* ---------- crisis safety net ---------- */
test("crisis: self-harm / abuse text (TH/EN/ZH) gives a calm support card with 1323, 1669 and 191 instead of a reading; ordinary dreams do not", async () => {
  const yes = ["ฝันว่าฆ่าตัวตาย อยากตายจริงๆ", "ไม่อยากมีชีวิตอยู่แล้ว", "ช่วงนี้ทำร้ายตัวเองบ่อย", "แฟนตบตีฉันทุกวัน", "I want to die", "I keep hurting myself", "my husband hits me", "我不想活了", "我想自杀", "他经常打我"];
  const no = ["ฝันเห็นงูใหญ่ในบ้าน", "ฝันว่าคนตาย", "ฝันว่าตายแล้วฟื้น", "ฝันว่าถูกไล่ตาม", "I dreamed of a snake", "梦见家里有一条大蛇", "ดวงตายาว"];
  for (const t of yes) assert.ok(FA.crisis.check(t), t);
  for (const t of no) assert.equal(FA.crisis.check(t), false, t);
  for (const lang of ["th", "en", "zh"]) {
    const r = FA.crisis.result({ lang });
    assert.equal(r.crisis, true); assert.equal(r.reviewStatus, "pending-professional-review");
    const nums = r.support.lines.map(l => l.n);
    for (const n of ["1323", "1669", "191"]) assert.ok(nums.includes(n), lang + " " + n);
    const txt = JSON.stringify(r.support);
    if (lang !== "th") assert.ok(!/[฀-๿]/.test(txt), lang + " has Thai");
    assert.ok(!/[0-9]{2}\s*ตัว|lottery|彩票|guarantee|一定|แน่นอน/i.test(txt), lang + ": support card makes no claims");
    const html = FA.toHTML(r);
    assert.match(html, /href="tel:1323"/); assert.match(html, /data-review="pending-professional-review"/);
  }
  // interpret: a nickname or question with crisis words never reaches the reading (or the AI)
  const facts = { domain: "tarot", topic: "overall", subject: { nickname: "อยากตาย" }, items: [{ id: "x", label: "ไพ่ดวงดาว", strength: 0.8, tags: ["overview"], meanings: { overview: ["คุณมีความหวังและกำลังใจที่ดี"] } }] };
  const res = await FA.interpret(facts, { useAI: true, lang: "th" });
  assert.equal(res.source, "support");
  const res2 = await FA.interpret(Object.assign({}, facts, { subject: {}, question: "I want to kill myself" }), { useAI: false, lang: "en" });
  assert.equal(res2.source, "support"); assert.equal(res2.lang, "en");
});

/* ---------- remedies: honest labels, helpful elements only ---------- */
test("remedies: generic habits are labelled ข้อแนะนำทั่วไป, never 'ตามตำรา' / เคล็ดเสริมดวง; the lint rule catches it", async () => {
  const X = await exportTool();
  let n = 0;
  for (const d of X.DOMAINS) {
    const r = X.lcg(77 + d.length * 3);
    for (let i = 0; i < 8; i++) {
      const res = FA.compose(X.factsFor(d, i, r), { seed: 100 + i, lang: "th" });
      n++;
      assert.deepEqual(FA.lint(res).filter(x => x.rule === "habit-as-tradition"), [], d);
    }
  }
  assert.ok(n >= 120);
  const bad = { lang: "th", sections: [{ id: "love", paragraphs: ["วิธีเสริมจุดนี้ตามตำราคือกันเวลาคุยกันแบบไม่ดูโทรศัพท์วันละสิบห้านาที และบอกขอบคุณในเรื่องเล็ก ๆ"] }] };
  assert.ok(FA.lint(bad).some(x => x.rule === "habit-as-tradition"));
  const ok = { lang: "th", sections: [{ id: "love", paragraphs: ["วิธีเสริมจุดนี้ตามตำราคือเลือกสีเขียวให้บ่อยขึ้น วางต้นไม้เล็ก ๆ ใกล้โต๊ะ"] }] };
  assert.ok(!FA.lint(ok).some(x => x.rule === "habit-as-tradition"));
});

test("BaZi: every plan boosts only the chart's helpful elements (TH/ZH/EN); plan-element lint catches a wrong element", async () => {
  const X = await exportTool();
  const r = X.lcg(2026);
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const f = X.factsFor("bazi", i, r);
    assert.ok(Array.isArray(f.helpful) && f.helpful.length, "helpful elements in facts");
    for (const lang of ["th", "zh", "en"]) {
      const res = FA.compose(f, { seed: i + 1, lang }); n++;
      for (const p of (res.plan && res.plan.items) || []) { const e = (/^el\.(\w+)$/.exec(p.key || "") || [])[1]; if (e) assert.ok(f.helpful.includes(e), `${lang}: ${e} not in ${f.helpful}`); }
      assert.deepEqual(FA.lintSemantic(f, res).filter(x => x.rule === "plan-element"), []);
    }
  }
  assert.equal(n, 180);
  const f = X.factsFor("bazi", 0, X.lcg(5)), res = FA.compose(f, { seed: 1 });
  const wrong = ["wood", "fire", "earth", "metal", "water"].find(e => !f.helpful.includes(e));
  const forged = Object.assign({}, res, { plan: { title: "x", items: [{ t: "x", key: "el." + wrong, cat: "element", family: "element", item: f.items[0].id }] } });
  assert.ok(FA.lintSemantic(f, forged).some(x => x.rule === "plan-element"));
});

/* ---------- one Thai zodiac-year rule ---------- */
test("zodiac year: lek7 (lifecal) and the horoscope page use the same rule (1st waxing day of month 5); Songkran rule is kept as a note", () => {
  const LC = require("../../lifecal.js"), HS = require("../../horoscope.js");
  // the evaluator's two dates
  assert.equal(LC.zodiacYearThai({ y: 2024, m: 4, d: 10, noTime: true }), 4); // มะโรง (Dragon), as on the horoscope page
  assert.equal(LC.zodiacYearThai({ y: 2026, m: 4, d: 1, noTime: true }), 6); // มะเมีย (Horse)
  let n = 0, differ = 0;
  for (let y = 1950; y <= 2040; y += 3) for (const [m, d] of [[1, 15], [3, 20], [4, 1], [4, 10], [4, 14], [4, 25], [5, 10], [11, 30]]) {
    const b = { y, m, d, noTime: true };
    const hs = HS.zodiacYears(y, m, d, HS.julianDay ? HS.julianDay(y, m, d, 5) : 0, 7).thai.animal;
    assert.equal(LC.zodiacYearThai(b), hs, `${y}-${m}-${d}`);
    const L = LC.lek7(b);
    assert.equal(L.zodiac, hs);
    assert.equal(L.zodiacRuleDiffers, L.zodiacSongkran !== L.zodiac);
    if (L.zodiacRuleDiffers) differ++;
    n++;
  }
  assert.ok(n > 200 && differ > 0, `${n} dates, ${differ} near the year change`);
});

/* ---------- dream symbols ---------- */
test("dream: ≥ 60 symbols have their own work/money/love lines (TH, mirrored in ZH/EN); theme fallback lines say they are theme-level", () => {
  const KB = require("../../dream-kb.js"), DR = require("../../dream.js");
  const full = KB.SYMBOLS.filter(s => ["w", "m", "l"].every(f => s.x[f]));
  assert.ok(full.length >= 60, "symbols with w/m/l: " + full.length);
  const OMEN = /ลาง|สัญญาณ|นิมิต|บอกเหตุ|เห็นผล|โชคลาภ|โชคดี|ไหลมา|เข้ามา|เนื้อคู่|จะได้|จะมี|จะงอกเงย|กำลังจะ|อาจมี|มีโอกาส|มีแนวโน้ม|บารมี|ข่าวดี|อุปถัมภ์|คุ้มครอง/;
  const ZH = globalThis.FORTUNE_ZH.dream.items, EN = globalThis.FORTUNE_EN.dream.items;
  for (const id of Object.keys(KB.MORE)) for (const f of Object.keys(KB.MORE[id])) {
    const th = KB.MORE[id][f];
    assert.ok(S.isSafe(th) && !OMEN.test(th), id + "." + f + ": " + th);
    assert.ok(ZH["sym." + id][f] && !/[฀-๿]/.test(ZH["sym." + id][f]) && S.isSafe(ZH["sym." + id][f]), "zh " + id + "." + f);
    assert.ok(EN["sym." + id][f] && !/[฀-๿]/.test(EN["sym." + id][f]) && S.isSafe(EN["sym." + id][f]), "en " + id + "." + f);
  }
  // a symbol without its own lines (omen dream) reads the theme line framed as theme-level
  const plain = KB.SYMBOLS.find(s => !s.x.w);
  assert.ok(plain, "a symbol still without its own work line");
  const f = DR.buildFacts([plain.id], "happy", "dawn", "work", { rng: () => 0.3 });
  const it = f.items.find(x => x.id === "sym." + plain.id);
  if (it.meanings.work) for (const m of it.meanings.work) assert.match(m, /^ภาพฝันในธีม/, m);
  // the evaluator's non-sequiturs now read the symbol's own line
  const hotel = DR.buildFacts(["hotel"], "happy", "dawn", "work", { rng: () => 0.3 }).items.find(x => x.id === "sym.hotel");
  assert.match(hotel.meanings.work[0], /โรงแรม/);
  assert.ok(hotel.meanings.work.slice(1).every(m => /^ภาพฝันในธีม/.test(m)), hotel.meanings.work.join(" | "));
});

/* ---------- near-duplicates, reminders, romanisation ---------- */
test("readings: no cross-section near-duplicate sentences (> 0.65) in TH/ZH/EN; the checker catches an injected repeat", async () => {
  const X = await exportTool();
  let n = 0;
  for (const d of X.DOMAINS) {
    const r = X.lcg(55 + d.length * 7);
    for (let i = 0; i < 6; i++) {
      const f = X.factsFor(d, i, r);
      for (const lang of ["th", "zh", "en"]) {
        const res = FA.compose(f, { seed: 300 + i, lang }); n++;
        assert.deepEqual(FA.nearDupPairs(res.sections, lang, res._dupNames).map(x => x.b), [], `${d}/${lang}`);
      }
    }
  }
  assert.ok(n >= 270);
  const rep = "The main focus this time is a Three Harmony year and the Dog.";
  const en = { lang: "en", sections: [{ id: "overview", paragraphs: [rep + " Something else entirely here."] }, { id: "love", paragraphs: [rep + " Love grows when you listen."] }] };
  assert.ok(FA.lint(en).some(x => x.rule === "near-duplicate"));
  const zh = { lang: "zh", sections: [{ id: "overview", paragraphs: ["把想法多分享给身边的人，争取更多支持。今天适合整理计划。"] }, { id: "advice", paragraphs: ["把想法多分享给身边的人，争取大家的支持。"] }] };
  assert.ok(FA.lint(zh).some(x => x.rule === "near-duplicate"));
});

test("reminder: 'astrological' wording only for astrology domains; tarot/face/palm/dream/feng shui name their own tradition", () => {
  const item = { id: "x", label: "สิ่งที่พบ", strength: 0.8, tags: ["overview"], meanings: { overview: ["คุณมีความหวังและกำลังใจที่ดีในช่วงนี้มาก"] } };
  for (const domain of ["tarot", "face", "palm", "dream", "fengshui", "numbers", "iching", "siamsee"]) for (let s = 0; s < 30; s++) for (const lang of ["th", "zh", "en"]) {
    const rm = FA.compose({ domain, topic: "overall", items: [item] }, { seed: s, lang }).reminder;
    assert.ok(!/โหราศาสตร์|astrolog|占星/i.test(rm), `${domain}/${lang}: ${rm.slice(0, 60)}`);
  }
  let astro = 0;
  for (let s = 0; s < 60; s++) if (/ตำราโหราศาสตร์/.test(FA.compose({ domain: "horoscope", topic: "overall", items: [item] }, { seed: s }).reminder)) astro++;
  assert.ok(astro > 0, "astrology domains keep the astrological wording");
});

test("romanisation: one spelling per tradition in the English fortune files (BaZi, Taksa, Lek 7 Tua 9 Than)", () => {
  const files = fs.readdirSync(path.join(repo, "i18n")).filter(f => /^en-(?:fortune|kb|rt-fortune)/.test(f)).map(f => path.join(repo, "i18n", f)).concat([path.join(repo, "fortune-ai.js")]);
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    assert.ok(!/Ba Zi|Thaksa|Lek Jet Tua/.test(t), path.basename(f));
  }
});

test("crisis net R11-eval: indirect phrasings in TH/EN/ZH, violent-dream parity, breakup wording is not a crisis", () => {
  const yes = ["ไม่อยากตื่นมาเจอวันพรุ่งนี้", "ชีวิตไม่มีความหมาย", "ฉันควรจบทุกอย่างไหม", "ควรฆ่าตัวตายดีไหม",
    "I can't go on anymore", "I want to disappear", "should I just end it", "should I just end it all?", "I dreamt I was attacked",
    "活着好累", "我不想再醒来", "梦见被人打"];
  const no = ["งานใหม่จะดีไหม", "Will I get the job?", "今年财运如何", "Should I end it with my boyfriend?", "ความรักปีนี้เป็นอย่างไร"];
  for (const t of yes) assert.ok(FA.crisis.check(t), t);
  for (const t of no) assert.equal(FA.crisis.check(t), false, t);
});

test("crisis net is wired into the Tarot and I Ching question boxes", () => {
  for (const [f, q] of [["tarot.js", "#trQuestion"], ["iching.js", "#icQuestion"]]) {
    const src = fs.readFileSync(path.join(repo, f), "utf8");
    assert.match(src, /function crisisStop\(q\)/, f);
    assert.ok(src.includes('crisisStop($("' + q + '").value)'), f + " checks " + q + " before the reading");
  }
});
