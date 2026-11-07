// Fortune fact-aware grounding, topic sections, safety categories and review export (added in round 10): the asked topic always has its own section, a fact-aware AI grounding gate (swapped values,
// names, topics and directions are rejected), new safety categories (TH/EN/ZH), wording fixes, Kalama Sutta in every
// reminder, and the native-review export (English + caution probes).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(repo, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(repo, "i18n", f));
const FA = require("../../fortune-ai.js");
const S = FA.safety;
const exportTool = () => import("../../tools/fortune-review-export.mjs");

const TOPICS = ["overall", "love", "work", "money"];
const POINTER = /read on below|section on it below|下面单独细说|接着往下看|ขอเล่าละเอียด|หัวข้อถัดไป/;

test("topic section: every domain × TH/ZH/EN × 4 topics × several seeds has a section for the asked topic; no pointer without it", async () => {
  const X = await exportTool();
  let n = 0;
  for (const d of X.DOMAINS) {
    const r = X.lcg(1000 + d.length * 31);
    for (let i = 0; i < 12; i++) {
      const facts = X.factsFor(d, i, r), topic = TOPICS[i % 4];
      for (const lang of ["th", "zh", "en"]) for (const seed of [3 + i, 4242 + i]) {
        const res = FA.compose(facts, { seed, lang });
        const ids = res.sections.map(s => s.id), text = res.sections.flatMap(s => s.paragraphs).join(" ");
        n++;
        if (topic !== "overall") assert.ok(ids.includes(topic), `${d}/${lang}/${topic}/seed ${seed}: sections ${ids.join(",")}`);
        if (POINTER.test(text)) assert.ok(topic !== "overall" && ids.includes(topic), `${d}/${lang}/${topic}: pointer line without the section`);
        for (const s of res.sections) for (const p of s.paragraphs) assert.ok(S.isSafe(p), `${d}/${lang}: unsafe ${p.slice(0, 80)}`);
      }
    }
  }
  assert.ok(n >= 15 * 12 * 3 * 2, String(n));
});

test("topic section: a tradition that says little about the topic says so plainly; taksa love reads from ภูมิบริวาร (spouse and family)", async () => {
  const X = await exportTool();
  const r = X.lcg(99 + 5 * 7);
  let facts; for (let k = 0; k <= 1; k++) facts = X.factsFor("taksa", k, r);
  assert.equal(facts.topic, "love");
  const th = FA.compose(facts, { seed: 1001, lang: "th" }), zh = FA.compose(facts, { seed: 1001, lang: "zh" }), en = FA.compose(facts, { seed: 1001, lang: "en" });
  const sec = (res, id) => res.sections.find(s => s.id === id);
  assert.match(sec(th, "love").paragraphs.join(" "), /คู่ครองและคนในครอบครัว/);
  assert.match(sec(zh, "love").paragraphs.join(""), /伴侣和家人/);
  assert.match(sec(en, "love").paragraphs.join(" "), /partner and family/);
  // a domain with no love line at all (numbers without love pairs) gets the honest line instead of an empty promise
  const plain = { domain: "numbers", topic: "love", items: [{ id: "x.1", label: "ผลรวม 41", short: "ผลรวม 41", strength: 0.8, tags: ["work"], meanings: { personality: ["คุณเป็นคนตั้งใจทำสิ่งที่เริ่มไว้ให้เสร็จ"], work: ["งานที่ต้องใช้ความละเอียดเหมาะกับคุณ"] } }] };
  const p = FA.compose(plain, { seed: 7, lang: "th" });
  const love = p.sections.find(s => s.id === "love");
  assert.ok(love, p.sections.map(s => s.id).join(","));
  assert.match(love.paragraphs.join(" "), /ไม่ได้พูดถึงเรื่องความรักโดยตรง|ให้ข้อมูลเรื่องความรักโดยตรงไม่มากนัก|ตำราดูจาก/);
});

/* ---------- grounding gate: fact-aware ---------- */
const SW_TH = [["ธาตุ", ["ไม้", "ไฟ", "ดิน", "โลหะ", "น้ำ"]], ["ดาว", ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "ราหู"]],
  ["ภูมิ", ["บริวาร", "อายุ", "เดช", "ศรี", "มูละ", "อุตสาหะ", "มนตรี", "กาลกิณี"]], ["ราศี", ["เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์", "ตุลย์", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน"]]];
const POL_TH = [["มากขึ้น", "น้อยลง"], ["น้อยลง", "มากขึ้น"], ["บ่อยขึ้น", "น้อยลง"], ["เพิ่มขึ้น", "ลดลง"], ["ลดลง", "เพิ่มขึ้น"], ["ดีขึ้น", "แย่ลง"], ["เพิ่ม", "ลด"], ["ขึ้น", "ลง"]];
const TOP_TH = [["ความรัก", "การเงิน"], ["การเงิน", "ความรัก"], ["การงาน", "ความรัก"], ["คนรัก", "ลูกค้า"], ["ทรัพย์", "ความรัก"]];
const SW_ZH = [[["木", "火", "土", "金", "水"], /(?<=[属旺喜忌五行日主])[木火土金水]|[木火土金水](?=[气命行])/], [["太阳", "月亮", "火星", "水星", "木星", "金星", "土星", "罗睺"], /太阳|月亮|火星|水星|木星|金星|土星|罗睺/],
  [["随从宫", "寿宫", "威权宫", "吉祥宫", "根基宫", "勤勉宫", "辅佐宫", "忌星宫"], /随从宫|寿宫|威权宫|吉祥宫|根基宫|勤勉宫|辅佐宫|忌星宫/]];
const POL_ZH = [["增加", "减少"], ["减少", "增加"], ["更多", "更少"], ["多", "少"], ["上升", "下降"], ["提高", "降低"]];
const TOP_ZH = [["感情", "财运"], ["财运", "感情"], ["事业", "感情"], ["工作", "感情"]];
function mutate(u, lang, r) {
  const out = [];
  if (lang === "th") {
    for (const [pre, vals] of SW_TH) { const m = new RegExp(pre + "(" + vals.join("|") + ")").exec(u); if (m) { const alt = vals.filter(v => v !== m[1]); out.push(u.replace(m[0], pre + alt[Math.floor(r() * alt.length)])); } }
    for (const [a, b] of POL_TH) if (u.includes(a)) { out.push(u.replace(a, b)); break; }
    for (const [a, b] of TOP_TH) if (u.includes(a)) { out.push(u.replace(a, b)); break; }
  } else {
    for (const [vals, re] of SW_ZH) { const m = re.exec(u); if (m) { const alt = vals.filter(v => v !== m[0]); out.push(u.replace(m[0], alt[Math.floor(r() * alt.length)])); } }
    for (const [a, b] of POL_ZH) if (u.includes(a)) { out.push(u.replace(a, b)); break; }
    for (const [a, b] of TOP_ZH) if (u.includes(a)) { out.push(u.replace(a, b)); break; }
  }
  return out;
}

test("grounding: value/topic/direction mutations of grounded claims are < 5 % accepted; benign rewording keeps ≥ 98.5 %", async () => {
  const X = await exportTool();
  let keep = 0, all = 0, acc = 0, mut = 0;
  for (const lang of ["th", "zh"]) for (const d of X.DOMAINS) {
    const r = X.lcg(4242 + d.length * 13 + (lang === "zh" ? 7 : 0));
    for (let i = 0; i < 4; i++) {
      const f = X.factsFor(d, i, r);
      const locs = [FA.compose(f, { seed: 1 + i, lang: "th" }), FA.compose(f, { seed: 8 + i, lang: "th" })];
      if (lang === "zh") locs.push(FA.compose(f, { seed: 1 + i, lang: "zh" }));
      const c = S.groundCorpus(f, locs), ai = FA.compose(f, { seed: 500 + i, lang });
      for (const s of ai.sections) for (const p of s.paragraphs) for (const u of S.sentences(p)) {
        const g = S.groundUnit(u, c, { sec: s.id });
        all++; if (g.ok) keep++;
        if (!g.ok || !/^grounded/.test(g.reason) || u.replace(/\s/g, "").length < 16) continue;
        for (const m of mutate(u, lang, r)) {
          if (m === u || c.vetted.some(v => v.t === m)) continue;
          mut++; if (S.groundUnit(m, c, { sec: s.id }).ok) acc++;
        }
      }
    }
  }
  assert.ok(keep / all >= 0.985, `benign keep ${keep}/${all}`);
  assert.ok(mut >= 300, `mutations ${mut}`);
  assert.ok(acc / mut < 0.05, `accepted mutations ${acc}/${mut}`);
});

test("grounding: the evaluator's swaps are rejected and the originals kept", () => {
  const facts = {
    domain: "taksa", topic: "money", items: [
      { id: "tk.sri.5", label: "ภูมิศรี (ดาวพฤหัสบดี)", short: "ภูมิศรี", strength: 0.9, tags: ["money"], meanings: { money: ["โชคและความเป็นสิริมงคลด้านทรัพย์มาจากดาวพฤหัสบดี"] } },
      { id: "tk.kalakini.3", label: "ภูมิกาลกิณี (ดาวอังคาร)", short: "ภูมิกาลกิณี", strength: 0.6, tone: "caution", tags: ["advice"], meanings: { advice: ["ลองเลี่ยงสีของดาวอังคารในวันสำคัญ"] } },
      { id: "tk.det.7", label: "ภูมิเดช (ดาวเสาร์)", short: "ภูมิเดช", strength: 0.8, tags: ["work"], meanings: { work: ["อำนาจและบารมีในการงานมาจากดาวเสาร์"] } },
      { id: "bz.dm", label: "ธาตุไม้", short: "ธาตุไม้", strength: 0.8, tags: ["personality"], meanings: { personality: ["ธาตุไม้ช่วยหนุนให้คุณเติบโตอย่างมั่นคง"] } },
    ],
  };
  const c = S.groundCorpus(facts, [{ sections: [{ id: "love", paragraphs: ["ลองพูดคุยกับคนสำคัญให้บ่อยขึ้น", "ความรักของคุณอ่อนโยนและเต็มไปด้วยความเข้าใจ"] }] }]);
  const pairs = [
    ["ภูมิศรี (ดาวพฤหัสบดี) ชี้ว่าโชคและความเป็นสิริมงคลด้านทรัพย์มาจากดาวพฤหัสบดี", "ภูมิกาลกิณี (ดาวพฤหัสบดี) ชี้ว่าโชคและความเป็นสิริมงคลด้านทรัพย์มาจากดาวพฤหัสบดี"],
    ["โชคและความเป็นสิริมงคลด้านทรัพย์มาจากดาวพฤหัสบดี", "โชคและความเป็นสิริมงคลด้านทรัพย์มาจากดาวเสาร์"],
    ["ธาตุไม้ช่วยหนุนให้คุณเติบโตอย่างมั่นคง", "ธาตุโลหะช่วยหนุนให้คุณเติบโตอย่างมั่นคง"],
    ["ลองพูดคุยกับคนสำคัญให้บ่อยขึ้น", "ลองพูดคุยกับคนสำคัญให้น้อยลง"],
    ["ความรักของคุณอ่อนโยนและเต็มไปด้วยความเข้าใจ", "การเงินของคุณอ่อนโยนและเต็มไปด้วยความเข้าใจ"],
  ];
  for (const [ok, bad] of pairs) {
    assert.ok(S.groundUnit(ok, c, { sec: "love" }).ok, "kept: " + ok);
    assert.equal(S.groundUnit(bad, c, { sec: "love" }).ok, false, "rejected: " + bad);
  }
  // Chinese: bhumi ↔ planet pairing
  const zf = { domain: "taksa", topic: "money", items: [{ id: "tk.sri.1", label: "ภูมิศรี (ดาวอาทิตย์)", short: "ภูมิศรี", strength: 0.9, tags: ["money"], meanings: { money: ["财运上的福气和吉祥来自太阳"] } }] };
  const zc = S.groundCorpus(zf, [{ sections: [{ id: "money", paragraphs: ["吉祥宫（太阳）这一点说明，财运上的福气和吉祥来自太阳。", "接下来适合从小处着手，积少成多。"] }] }]);
  assert.ok(S.groundUnit("吉祥宫（太阳）这一点说明，财运上的福气和吉祥来自太阳。", zc, { sec: "money" }).ok);
  assert.equal(S.groundUnit("吉祥宫（木星）这一点说明，财运上的福气和吉祥来自太阳。", zc, { sec: "money" }).ok, false);
  assert.equal(S.groundUnit("接下来适合从小处着手，积少成少。", zc, { sec: "money" }).ok, false);
});

/* ---------- safety ---------- */
test("safety: breakup/fatal/jail predictions, cosmetic surgery for luck, all-in investing, scam fear and zodiac/birth-year discrimination are blocked (TH/EN/ZH)", () => {
  const bad = [
    "ปีนี้จะเลิกกับแฟน", "ควรไปทำศัลยกรรมจมูกเพื่อเสริมดวง", "ระวังถูกโกงเงิน", "ห้ามแต่งงานกับคนเกิดปีขาล", "คนปีชงไม่ควรจ้างงาน", "คนเกิดปีมะเส็งนิสัยไม่ดี", "ปีนี้เป็นปีอันตรายของคุณ", "ควรเอาเงินทั้งหมดไปลงทุนหุ้น",
    "a fatal year", "This is a fatal year for you", "your marriage will end this year", "You will go to jail", "you should get a nose job to improve your luck",
    "people born in the year of the tiger are untrustworthy", "Don't hire people born in a clash year", "people born in the Year of the Snake should never marry Tiger people", "you may get scammed this month",
    "把钱全部投资股票", "你会坐牢", "属虎的人不可信", "不要嫁给属虎的人", "犯太岁的人不要录用", "你应该去整容改运", "今年是你的凶年", "这个月你容易被骗钱",
  ];
  for (const t of bad) assert.equal(S.isSafe(t), false, t);
  const ok = [
    "ระวังมิจฉาชีพ ตรวจสอบก่อนโอนเงินทุกครั้ง", "Be careful with offers that sound too good; check before you transfer money", "转账前先核实对方身份，多一分小心",
    "ปีขาลเป็นปีแห่งความกล้า", "People born in the Year of the Tiger are traditionally seen as brave", "属虎的人在传统说法里勇敢有冲劲",
    "ความสัมพันธ์ต้องการการสื่อสารมากขึ้น", "Your relationship benefits from honest talk", "你的事业运稳定", "ดวงตายาวเป็นเสน่ห์",
  ];
  for (const t of ok) assert.ok(S.isSafe(t), t);
});

/* ---------- wording ---------- */
test("wording: no 'ดูที่X เป็น', no doubled และ in colour lists, formula evidence on a 'why' line, EN life graph and ZH horoscope labels not repeated", async () => {
  const X = await exportTool();
  let why = 0;
  for (const d of ["face", "tarot", "bazi", "lifegraph", "horoscope"]) {
    const r = X.lcg(77 + d.length);
    for (let i = 0; i < 16; i++) {
      const f = X.factsFor(d, i, r);
      for (const lang of ["th", "zh", "en"]) {
        const res = FA.compose(f, { seed: 9 + i, lang }), txt = res.sections.flatMap(s => s.paragraphs).join("\n");
        assert.doesNotMatch(txt, /ดูที่[^\s]{0,30} เป็น/, d);
        assert.doesNotMatch(txt, /(?:สี|โทน)\S*และ\S*\s?และ/, d);
        assert.doesNotMatch(txt, /\d+%\s*\+|ธาตุหนุนเจ้าชะตา \d/, d);
        assert.doesNotMatch(txt, /Start with your love life \(from|Love: Start with your love/i, d);
        assert.doesNotMatch(txt, /泰式恒星黄道[^。]{0,60}泰式恒星黄道/, d);
        if (res.why) { why++; assert.match(FA.toHTML(res), /class="fa-more fa-why"/); }
      }
    }
  }
  assert.ok(why > 0, "the bazi strength formula is shown on the why line");
});

test("reminder: every reminder variant names the Kalama Sutta (กาลามสูตร / Kalama Sutta / 《卡拉玛经》)", () => {
  const f = { domain: "tarot", topic: "overall", items: [{ id: "a", label: "ไพ่ดวงดาว", strength: 0.8, tags: ["overview"], meanings: { overview: ["ความหวังกลับมา"] } }] };
  const RE = { th: /กาลามสูตร/, zh: /《卡拉玛经》/, en: /Kalama Sutta/ };
  for (const lang of ["th", "zh", "en"]) {
    const seen = new Set();
    for (let s = 0; s < 80; s++) seen.add(FA.compose(f, { seed: s, lang }).reminder);
    assert.ok(seen.size >= 5, lang + " variety " + seen.size);
    for (const t of seen) assert.match(t, RE[lang], t);
  }
});

/* ---------- native review export ---------- */
test("review export: English readings included; domains without engine cautions get labelled caution probes; no empty caution cell", async () => {
  const X = await exportTool();
  const { rows, gaps } = X.sample({ per: 1, domains: ["face", "dream", "tarot"], pool: 24 });
  assert.equal(rows.length, 3 * 3 * 3, "3 domains × 3 languages × 3 tones");
  assert.ok(rows.some(r => r.lang === "en"));
  for (const r of rows.filter(r => r.lang === "en")) assert.doesNotMatch(r.text, /[฀-๿一-鿿]/, r.id);
  for (const d of ["face", "dream"]) for (const lang of ["th", "zh", "en"]) {
    const c = rows.find(r => r.domain === d && r.lang === lang && r.tone === "caution");
    assert.match(c.cautions, /^[1-9]\d*\/\d+ \(probe\)$/, d + "/" + lang);
  }
  assert.ok(!gaps.some(g => g.note), JSON.stringify(gaps));
});
