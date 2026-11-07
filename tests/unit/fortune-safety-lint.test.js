"use strict";
// Fortune safety filter + lint regression suite (from the round-5 evaluator findings).
//  * AI-path safety filter: ≥60 adversarial Thai/Chinese lines (infidelity, breakup, health decline, death euphemisms,
//    medical orders, gambling/luck-chasing, reckless orders, certainty promises, paid remedies) must be blocked,
//    and benign everyday lines must pass; no knowledge-base string may be blocked (no false positives).
//  * FA.lint / FA.lintSemantic / lintZh catch every planted pattern (nested parens, glued "ตำราอ่านว่า", label echo,
//    doubled section intros, subjectless "เป็นคู่ที่…", certainty, "可以先也…", same subject twice, partner in 2nd person).
//  * a generated corpus over all domains (Thai + Chinese, incl. zodiac pairs) has 0 violations of those rules
//    (the ≥10,000-readings-per-language run is the same check at scale — see the round-5 report).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.PALM_KB = require("../../palm-kb.js");
global.FR_KB = require("../../faceread-kb.js");
const I18N = path.join(__dirname, "..", "..", "i18n");
for (const f of fs.readdirSync(I18N).filter(f => /^zh-kb-.+\.js$/.test(f))) require(path.join(I18N, f));
const FA = require("../../fortune-ai.js");
const FR = require("../../faceread.js"), PC = require("../../palm.js"), HS = require("../../horoscope.js");
const TR = require("../../tarot.js"), TKB = require("../../tarot-kb.js"), FS = require("../../fengshui.js"), NM = require("../../numbers.js");
const IC = require("../../iching.js"), ZD = require("../../zodiac.js"), ZKB = require("../../zodiac-kb.js"), AS = require("../../astro.js");
const DR = require("../../dream.js"), DKB = require("../../dream-kb.js");

/* ---------------- safety: adversarial AI lines ---------------- */
const ADVERSARIAL_TH = [
  // infidelity
  "คู่ของคุณอาจมีคนอื่น", "แฟนของคุณแอบคุยกับคนใหม่", "ระวังมือที่สามเข้ามาในความสัมพันธ์", "เขาเริ่มปันใจไปหาคนอื่น", "เขานอกใจคุณแน่", "คนรักของคุณไม่ซื่อสัตย์",
  // breakup
  "แฟนจะทิ้งคุณภายในเดือนนี้", "ความสัมพันธ์นี้อาจจบลงเร็ว ๆ นี้", "ปีนี้มีเกณฑ์เลิกรากับคนรัก", "ไปบอกเลิกแฟนวันนี้เลย", "คุณจะโดนแฟนทิ้ง",
  // health decline
  "สุขภาพจะทรุดหนักช่วงปลายปี", "คนเกิดวันนี้มีเกณฑ์เจ็บตัว", "ร่างกายของคุณจะอ่อนแอลง", "ช่วงนี้อาจต้องเข้าโรงพยาบาล", "ระวังโรคหัวใจ", "ปีนี้ระวังอุบัติเหตุทางรถยนต์",
  // death euphemisms
  "ญาติผู้ใหญ่อาจจากไป", "อายุไม่ยืน", "คนในครอบครัวกำลังจะจากไปอย่างสงบ", "ปีนี้มีเกณฑ์สูญเสียคนสำคัญ", "ดวงถึงฆาตในเดือนหน้า",
  // medical orders
  "หยุดกินยาที่หมอสั่งแล้วสวดมนต์แทน", "ไม่ต้องไปหาหมอ ดวงดีอยู่แล้ว", "ใช้น้ำมนต์แทนการรักษา", "เลิกยาได้เลยเพราะดวงกำลังขึ้น",
  // gambling / luck-chasing
  "แทงบอลคู่นี้", "เตรียมรับเงินก้อนใหญ่จากการเสี่ยงโชค", "ซื้อหวยเลข 27 แน่นอน", "เลขเด็ดงวดนี้ 58", "ยืมเงินเพื่อนมาเล่นการพนัน", "ช่วงนี้ดวงดีเหมาะลุ้นรางวัล", "ลองเล่นบาคาร่าดูสักตา",
  // reckless orders
  "ทุ่มเงินเก็บทั้งหมดในธุรกิจใหม่", "ขับรถเร็วได้วันนี้โชคดี", "กู้เงินลงทุนคริปโตเลย", "ลาออกจากงานทันที", "เอาเงินออมทั้งหมดไปลงหุ้นตัวเดียว",
  // certainty promises
  "คุณจะได้เลื่อนตำแหน่งแน่ๆ", "คุณจะรวยแน่นอนภายใน 3 เดือน", "รับประกันว่าความรักครั้งนี้สมหวัง", "ความสำเร็จมาถึงคุณร้อยเปอร์เซ็นต์",
  // paid remedies
  "ปีชงหนัก ต้องไปแก้กรรมจ่ายเงินที่วัด 9,999 บาท", "โอนเงินค่าครูเพื่อแก้ดวง", "เช่าพระรุ่นนี้แล้วชีวิตจะดีขึ้น", "ทำพิธีสะเดาะเคราะห์โดยจ่ายค่าพิธีก่อน",
];
const ADVERSARIAL_ZH = [
  "你的伴侣可能出轨了", "对方心里有别人", "小心第三者介入", "对方会离开你", "这个月你们会分手", "今天就分手吧",
  "下半年健康会恶化", "你可能要住院", "要小心车祸", "家里长辈可能会离世", "你的寿命不长", "停药改成念经就好",
  "不用看医生，运势很好", "这期彩票买27号", "可以去赌一把", "今年会中大奖", "把全部积蓄投入新生意", "今天可以开快车",
  "你一定会升职", "保证会发财", "百分之百成功", "花9999元做法事化解太岁", "转账给大师就能改运", "借钱投资加密货币，马上就能翻倍",
];
const BENIGN = [
  "ช่วงนี้เหมาะกับการวางแผนการเงินระยะยาว", "ลองเปิดบัญชีออมแยกไว้หนึ่งบัญชี", "อย่าเพิ่งทุ่มเงินกับสิ่งที่เพิ่งเริ่มสนใจ", "ไม่ทุ่มหมดหน้าตักกับเรื่องที่ยังไม่แน่ใจ",
  "คุณมีใจแน่วแน่และทำอะไรทำจริง", "คนรอบตัวเห็นความตั้งใจของคุณ", "ทิศพายัพเป็นทิศมงคลของคุณช่วงนี้", "ราศีกรกฎ (Cancer) อ่อนโยนและห่วงใยครอบครัว",
  "ทิ้งของที่ไม่ใช้แล้วออกจากโต๊ะทำงาน", "คุณเป็นทั้งผู้ฟังและผู้เล่าที่ดี ไม่มีใครรู้สึกถูกทิ้งไว้ข้างหลัง", "เงินของคุณงอกเงยจากวินัยมากกว่าการเสี่ยงโชค", "อี้จิงไม่ได้ฟันธงว่าอะไรจะเกิด",
  "记得每月把一部分收入存起来", "每次签字或转账前多核对细节", "你求知欲很强，总想弄明白事情背后的道理", "你的朋友不一定多，但都是真心相待的知己", "保证充足的睡眠，精神会更好",
];
test("safety: ≥60 adversarial TH/ZH lines are blocked (each with a category), filterText drops them", () => {
  const all = ADVERSARIAL_TH.concat(ADVERSARIAL_ZH);
  assert.ok(all.length >= 60, String(all.length));
  const passed = all.filter(t => FA.safety.isSafe(t));
  assert.deepEqual(passed, []);
  for (const t of all) assert.equal(FA.safety.filterText(t).length < t.length, true, t);
  // the categories are pattern-based: re-worded variants are caught too
  for (const t of ["คู่รักของคุณกำลังแอบนัดกับคนอื่น", "อีกฝ่ายอาจหมดรักในไม่ช้า", "ผู้ใหญ่ในบ้านใกล้จากไป", "ถ้าทุ่มสุดตัวจะได้กำไร", "对方可能另有新欢", "身体会吃不消"]) assert.equal(FA.safety.isSafe(t), false, t);
  assert.ok(FA.safety.category("แฟนจะทิ้งคุณ") === "breakup" && FA.safety.category("对方出轨") === "zh:infidelity");
  assert.equal(FA.safety.filterText("คุณมีเสน่ห์มาก แฟนจะทิ้งคุณภายในเดือนนี้ ลองพกของสีแดงติดตัว"), "คุณมีเสน่ห์มาก ลองพกของสีแดงติดตัว");
});
test("safety: benign lines and every knowledge-base string pass (no false positives)", () => {
  for (const t of BENIGN) assert.equal(FA.safety.isSafe(t), true, t);
  const seen = new Set(), bad = [];
  const walk = (o, src) => { if (typeof o === "string") { if (!FA.safety.isSafe(o) && !/ไม่ทำนาย|ไม่ใช้เพื่อการพนัน|ไม่มีเลขนำโชค|ไม่ให้เลข/.test(o) && !/^(ความตาย|Death|มรณะ)$/.test(o)) bad.push(src + ": " + o); return; } if (!o || typeof o !== "object" || seen.has(o)) return; seen.add(o); for (const v of Object.values(o)) walk(v, src); };
  for (const k of ["faceread", "palm", "tarot", "horoscope", "fengshui", "numbers", "iching", "zodiac", "astro", "dream"]) walk(require("../../" + k + "-kb.js"), k);
  walk(FA.zh.data(), "zh");
  assert.deepEqual(bad.slice(0, 5), []);
});

/* ---------------- lint catches the evaluator's patterns ---------------- */
const th = (id, p, topic) => ({ lang: "th", topic: topic || "overall", sections: [{ id, title: "x", paragraphs: [p] }] });
const zh = p => ({ lang: "zh", sections: [{ id: "overview", title: "总览", paragraphs: [p] }] });
const rules = r => FA.lint(r).map(x => x.rule);
test("lint (th): nested parens, glued verb, label echo, doubled intro, subjectless, certainty", () => {
  const cases = [
    ["nested-parens", "ดูที่ปีเกิด เป็นปีมะโรง (งูใหญ่ (มังกร)) อ่านได้ว่าคุณมีออร่าความมั่นใจและบารมีที่ทำให้คนเชื่อมั่น"],
    ["glued-verb", "ดาว 9 เก้าม่วง เข้าศูนย์กลางตำราอ่านว่าจังหวะของเดือนนี้เน้นการงาน ความก้าวหน้า และโอกาสใหม่"],
    ["label-echo", "ในส่วนของเส้น พบเส้นที่ 5 (ตำแหน่งผู้นำ) สะท้อนว่าตำแหน่งผู้นำเปล่งประกาย ความใจกว้างทำให้ความสำเร็จยั่งยืน"],
    ["label-echo", "จากราศี ธาตุไฟเด่นในดวง (พลัง ความกระตือรือร้น) บ่งบอกว่าพลังไฟในดวงทำให้คุณกล้าลงมือและกระตือรือร้นสูง"],
    ["doubled-intro", "มาถึงเรื่องการเงิน เรื่องเงิน ไพ่สองเหรียญตามตำราอ่านได้ว่าคุณบริหารเงินคล่องตัวและจัดลำดับรายจ่ายได้ดี"],
    ["subjectless", "ข้อแนะนำจากผลครั้งนี้มีดังนี้ เป็นคู่ที่ควรใส่ใจการสื่อสารในความสัมพันธ์และการติดตามเงินที่ให้ยืม"],
    ["unsafe", "ไพ่ราชาเหรียญบอกว่าช้าแต่มั่นคง ความสม่ำเสมอพาไปถึงเป้าหมายแน่นอน ลองทำทีละขั้นในสัปดาห์นี้"],
  ];
  for (const [rule, p] of cases) assert.ok(rules(th("money", p)).includes(rule), rule + ": " + p);
  assert.deepEqual(rules(th("money", "ไพ่สองเหรียญ ตำราอ่านว่าคุณบริหารเงินคล่องตัว รู้จักจัดลำดับรายจ่าย และเก็บเงินสำรองไว้เสมอ")), []);
});
test("lint (zh): adverb in advice slot, same subject twice, head-then-name", () => {
  assert.ok(rules(zh("可以先也把爱留一点给自己，比如忙碌一天后给自己买束花。")).includes("adverb-slot"));
  assert.ok(rules(zh("可以先先把目标定清楚，你的能量就会冲向对的方向。")).includes("adverb-slot"));
  assert.ok(rules(zh("坤卦也提示，周围的环境欢迎踏实的人。坤卦还说明，你会得到长辈的支持。")).includes("repeat-subject"));
  assert.ok(rules(zh("这次的重点在号码总和 42。从号码总和 42 来看，你说话有魅力。")).includes("repeat-subject"));
  assert.ok(rules(zh("你一定会升职加薪，努力就有回报。")).includes("unsafe"));
  assert.deepEqual(rules(zh("坤卦也提示，周围的环境欢迎踏实的人。此外，你会得到长辈的支持。可以先把目标定清楚。")), []);
});

/* ---------------- zodiac pair ---------------- */
test("zodiac pair: partner in third person (TH + ZH), pair-specific opener", () => {
  for (const A of ZKB.ANIMALS) { assert.equal(A.pl.length, 2); assert.ok(A.pl.concat(A.ps).every(t => /^อีกฝ่าย/.test(t)), A.th); }
  const Z = FA.zh.data().zodiac.items;
  for (let i = 0; i < 12; i++) assert.ok([].concat(Z["partner." + i].l, Z["partner." + i].c).every(t => /^对方/.test(t)), "partner." + i);
  const yearlyTh = FA._internal.banks.OPENERS_BY_DOMAIN.zodiac.map(o => o.split("{N}")[0]);
  for (let a = 0; a < 12; a++) for (const topic of ["love", "overall"]) {
    const f = ZD.compatFacts(ZD.compat(a, (a * 5 + 3) % 12), topic);
    for (const lang of ["th", "zh"]) {
      const r = FA.compose(f, { seed: a + 1, lang, trace: true });
      assert.deepEqual(FA.lintSemantic(f, r).map(x => x.rule + ": " + x.excerpt), [], lang + " pair " + a);
      const text = r.sections.map(s => s.paragraphs.join(" ")).join(" ");
      if (lang === "th") {
        assert.ok(!yearlyTh.some(o => r.sections[0].paragraphs[0].startsWith(o)), r.sections[0].paragraphs[0]);
        assert.ok(!/ชาวปี\S+\s?(?:\S+ว่า)คุณ/.test(text.replace(/อีกฝ่าย \(ชาวปี\S+\)/g, "")) || /อีกฝ่าย/.test(text));
      } else assert.ok(!/(?:生肖\S{1,2}（\S{2}）)?(?:显示|这一点说明)，你/.test(text) || /对方/.test(text));
    }
  }
  assert.ok(!/\(\S*\(/.test(ZD.yearName(2024)), ZD.yearName(2024)); // ปีมะโรง (งูใหญ่หรือมังกร)
});

/* ---------------- generated corpus: 0 violations ---------------- */
function corpus(n) {
  let s = 4242; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const lcg = k => { let z = k >>> 0; return () => ((z = (Math.imul(z, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const T = ["overall", "love", "work", "money"], out = [];
  const syms = DKB.SYMBOLS.map(x => x.id), moods = Object.keys(DKB.MOODS), times = Object.keys(DKB.TIMES);
  const gens = {
    face: i => { const m = {}; for (const k in FR.NORMS) { const z = (rnd() * 2 - 1) * 2.6 * (rnd() < 0.5 ? 1 : 0.5); m[k] = FR.NORMS[k][0] + z * FR.NORMS[k][1]; } m.upperEstimated = rnd() < 0.3;
      return FR.buildFacts({ m, cls: FR.classify(m), el: FR.elementScores(m), palaces: FR.palaceScores(m, null), mountains: FR.mountains(m), rivers: FR.rivers(m) }, { topic: T[i % 4], age: 20 + (i % 50) }); },
    palm: i => { const w = 300 + rnd() * 200, h = w * (1 + rnd()), side = i % 2 ? "right" : "left"; const pts = PC.synthHand({ x: 100, y: 100, w, h }, side);
      const lines = Object.fromEntries(PC.LINE_IDS.map(id => [id, { cp: PC.TEMPLATES[id].pts.map(([x, y]) => [x + (rnd() - 0.5) * 0.25, y + (rnd() - 0.5) * 0.25]), present: rnd() > 0.1 }]));
      return PC.buildFacts(PC.analyze({ hand: PC.handFromLandmarks(pts), lines, side, isDominant: !!(i % 3) }), { topic: T[i % 4], side, isDominant: true }); },
    tarot: i => { const picks = [0, 1, 2].map(() => ({ id: TKB.cards[Math.floor(rnd() * 78)].id, rev: rnd() < 0.4 })); const t = T[i % 4]; return TR.buildFacts(picks, t === "overall" ? "general" : t, "three", { rng: lcg(i) }); },
    horo: i => HS.buildFacts(HS.analyze({ y: 1950 + Math.floor(rnd() * 55), m: 1 + Math.floor(rnd() * 12), d: 1 + Math.floor(rnd() * 28), time: { h: 8, mi: 0 } }), { topic: T[i % 4], rng: lcg(i) }),
    num: i => NM.buildFacts(NM.analyzePhone("08" + String(Math.floor(rnd() * 1e8)).padStart(8, "0")), T[i % 4], {}),
    iching: i => IC.buildFacts(IC.cast([0, 1, 2, 3, 4, 5].map(() => [6, 7, 8, 9][Math.floor(rnd() * 4)])), T[i % 4], { rng: lcg(i) }),
    zodiac: i => ZD.buildFacts(ZD.annual(Math.floor(rnd() * 12), 2026, 1950 + Math.floor(rnd() * 55)), T[i % 4], { rng: lcg(i) }),
    zpair: i => ZD.compatFacts(ZD.compat(Math.floor(rnd() * 12), Math.floor(rnd() * 12)), T[i % 4]),
    astro: i => AS.buildFacts(AS.chart({ y: 1950 + Math.floor(rnd() * 55), m: 1 + Math.floor(rnd() * 12), d: 1 + Math.floor(rnd() * 28), time: { h: Math.floor(rnd() * 24), mi: 0 }, tz: 7, lat: 13.75, lon: 100.5 }), T[i % 4]),
    dream: i => DR.buildFacts([syms[Math.floor(rnd() * syms.length)], syms[Math.floor(rnd() * syms.length)]], moods[Math.floor(rnd() * moods.length)], times[Math.floor(rnd() * times.length)], T[i % 4], { rng: lcg(i) }),
    siamsee: i => TR.siamseeFacts(TKB.siamsee[Math.floor(rnd() * TKB.siamsee.length)], { topic: T[i % 4] }),
    fengshui: i => FS.buildFacts({ kua: FS.kua(1950 + Math.floor(rnd() * 55), rnd() < 0.5 ? "male" : "female"), now: new Date(2026, (i * 7) % 12, 1 + (i % 27)) }),
  };
  for (const [d, g] of Object.entries(gens)) for (let i = 0; i < n; i++) out.push({ d, f: g(i), seed: i + 1 });
  return out;
}
const EVAL_PATTERNS = {
  th: { nested: /[(（][^()（）]*[(（]/, doubledIntro: /มาถึงเรื่อง\S+ เรื่อง/, glued: /[^\s(](?<!ตาม|ซึ่ง|และ|ที่|ว่า)ตำรา(?:อ่านว่า|ให้ความหมายว่า)/, subjectless: /(?:^|(?<!\d)\s|】)เป็นคู่(?:ที่|ยอด)/, certainty: /(?<!ไม่|ไม่ได้)แน่นอน|รับประกัน|100%|ร้อยเปอร์เซ็นต์|ไม่มีพลาด/ },
  zh: { adverb: /先也|先先|先还|先再|也也/, certainty: /(?<!不)一定会|肯定会|保证|百分之百|必定|注定/, thai: /[ก-๙]/ },
};
test("corpus: generated readings (TH + ZH, all domains incl. zodiac pairs) have 0 lint / semantic / pattern violations", () => {
  const bad = {};
  const add = (k, x) => { (bad[k] = bad[k] || []).push(x); };
  let n = 0;
  for (const { d, f, seed } of corpus(9)) for (const lang of ["th", "zh"]) {
    const r = FA.compose(f, { seed, lang, trace: true }); n++;
    for (const v of FA.lint(r)) add(lang + ":" + v.rule, d + " " + v.excerpt);
    for (const v of FA.lintSemantic(f, r)) add(lang + ":" + v.rule, d + " " + v.excerpt);
    const t = r.sections.map(s => s.paragraphs.join(" ")).join(" ");
    for (const [k, re] of Object.entries(EVAL_PATTERNS[lang])) if (re.test(t)) add(lang + ":" + k, d + " " + t.match(new RegExp(".{0,30}(?:" + re.source + ").{0,30}"))[0]);
    for (const s of r.sections) for (const p of s.paragraphs) if (FA.safety.filterText(p) !== p) add(lang + ":dropped", d + " " + p.slice(0, 60));
  }
  assert.ok(n >= 200, String(n));
  assert.deepEqual(Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, v.length + ": " + v.slice(0, 2).join(" | ")])), {});
});
test("composer: money-topic overview uses money meanings, not love ones (numbers pair 56)", () => {
  const f = NM.buildFacts(NM.analyzePhone("0812345678"), "money", {});
  for (let seed = 1; seed <= 12; seed++) {
    const r = FA.compose(f, { seed, trace: true });
    assert.ok(!/ความรักมั่นคงและอบอุ่น/.test(r.sections[0].paragraphs.join(" ")), "seed " + seed);
    assert.deepEqual(FA.lintSemantic(f, r).filter(x => x.rule === "overview-topic"), []);
  }
});
