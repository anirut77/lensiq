"use strict";
// tests/unit/fortune-caution-limits.test.js — FIXED TEST SET fortune-caution (owner item 177, 2026-11-20). Locked BEFORE any
// product code (evals-locks/fortune-caution.sha256, ~/LENSIQ-field/evals/fortune-caution/). Design ~/Desktop/LENSIQ-review/
// fortune-cautions/DESIGN-TH.md 4(d)-(f), 5.1: T6 hard-limit scan of every text the section can show, T7 forbidden probes
// refused / allowed probes pass (product filter check()), T8 "be careful" wording, T13 no price or sales words, T19 luck
// lines say "may", T20 lottery and gambling, T21 luck lines free of assets, buying and heavy merit. SYNTHETIC probes only.
// Owner refinement 2026-11-20 (about 10:25), in this lock: (1) time: never a single day or date; month ranges allowed, also
// for accident, illness and travel under "this period" (replaces D-1); (2) tone: "be careful", never a prohibition (scan
// PROHIB); no certainty; (3) people only in broad terms: no named or described person, no ethnicity, religion or other group
// (scan PEOPLE); (4) broad body areas allowed as "be careful", no diagnosis or treatment (MED); (5) travel allowed as "be
// careful if you travel during ...", specific accident types stay filtered; (6) guidance = mindset and good deeds only:
// whitelist mindful / precepts / merit / parents / religion, religion-inclusive wording, no amounts, no named recipients,
// no big donations, no links, no ritual sequences.
// The test owns its own scan lists; the product's check() is only measured by the probes (T7).
// RELOCK 3 (2026-11-20, independent review of wave 0 at 7c3d9fd1 + owner rule "month ranges, never a single day"), STRICTER: the
// reviewer's 60 forbidden and 16 allowed probes (REVIEW_*) and our generalisations of each gap (GEN_*) are added; a day or date
// is refused on EVERY topic and anything under a one-day period is refused; new test scans: certainty with loss or illness
// verbs, ไม่ควร / "at all costs", accident types beyond cars (motorbike, drowning, fire, bloodshed), named diseases and remedies,
// people named, described, by region, ethnicity or birth day, digital assets, 断了, skipped-offering conditionals, named monks,
// large amounts and Chinese numerals, plates and 大奖.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const FIX = JSON.parse(readFileSync(join(__dirname, "fixtures", "fortune-caution-profiles.json"), "utf8"));
const LANGS = ["th", "en", "zh"];
const ON = { drafts: true, cnWest: true };
const core = require(join(ROOT, "fortune-caution-core.js"));
const shell = require(join(ROOT, "fortune-caution.js"));
const FS = require(join(ROOT, "fortune-straight.js"));
const RULES = core.rules();
const canon = s => String(s).normalize("NFC");
/** one RegExp from several parts @param {string} flags @param {...RegExp} parts */
const rx = (flags, ...parts) => new RegExp(parts.map(x => x.source).join("|"), flags);

/* ---------------- the test's own scan lists ---------------- */
const SCAN = {
  death: /ตาย|เสียชีวิต|สิ้นใจ|อายุสั้น|มรณะ|ถึงชีวิต|\b(?:die|dies|dying|death|dead|fatal|pass(?:es|ed)? away|short life)\b|死|去世|过世|离世|短命|寿命/i,
  terminal: /มะเร็ง|โรคร้าย|ระยะสุดท้าย|รักษาไม่หาย|\b(?:cancer|terminal|incurable|tumou?r)\b|癌|绝症|晚期|肿瘤/i,
  medication: rx("i", /(?:หยุด|เลิก|งด)(?:การ)?(?:กิน|ทาน|ใช้)?ยา|(?:หยุด|เลิก)(?:การ)?รักษา|ไม่ต้อง(?:รักษา|หาหมอ|พบแพทย์|ไปหาหมอ)/,
    /\b(?:stop|skip|quit|drop)\w* (?:taking )?(?:your )?(?:medication|medicine|meds|treatment|chemo)|no need to see a doctor/,
    /停药|不用(?:吃药|治疗|看医生)|不必(?:吃药|治疗)|放弃治疗/),
  asset: /หุ้น|ทองคำ|คริปโต|บิตคอยน์|กองทุน|ที่ดิน|คอนโด|อสังหา|\b(?:stocks?|shares|gold|bitcoin|crypto\w*|funds?|real estate|property|land)\b|股票|黄金|比特币|基金|加密货币|房产|房地产/i,
  endRelationship: /เลิกกับ|เลิกรา|บอกเลิก|หย่า|ตัดขาด|\b(?:break up|divorce|split up|leave (?:him|her|them|your (?:partner|husband|wife)))\b|分手|离婚|断绝/i,
  fear: /(?:ถ้า|หาก)(?:คุณ)?ไม่(?:ทำบุญ|แก้|สะเดาะ|ทำพิธี|บูชา|จ่าย|ซื้อ|ถวาย|บริจาค)|ไม่งั้น|มิฉะนั้น|จนกว่าจะ(?:ทำบุญ|จ่าย|บริจาค|ทำพิธี)|\bunless you\b|\bor else\b|除非|否则|不化解/i,
  meritHeavy: new RegExp([/ทำบุญ(?:ให้)?(?:หนัก|ใหญ่|มาก ๆ|เยอะ ๆ)/, /ทำบุญ\s*\d+\s*วัด/, /(?:บริจาค|ถวาย|ทำบุญ)[^\s]{0,12}\d[\d,]*\s*(?:บาท|฿)/, /สะเดาะเคราะห์(?:ใหญ่|ครั้งใหญ่)/,
    /ทำพิธี/, /บวช(?:แก้|สะเดาะ)/, /ปล่อย(?:ปลา|นก|สัตว์)\s*\d+/, /ไหว้(?:ให้)?ครบ\s*\d+\s*(?:วัด|ที่)/, /ยิ่งทำบุญมากยิ่ง/, /ต้องทำบุญ/, /บริจาค(?:เยอะ|มาก|ก้อนใหญ่|ทั้งหมด)|ก้อนใหญ่/,
    /\b(?:large|big|generous|major|huge) (?:donation|offering|gift)s?\b/, /\b(?:elaborate|expensive|costly) (?:ritual|ceremon)/, /\bmake merit at \d+ temples\b/, /\bdonate \S*\d/,
    /\bthe more you (?:give|donate)\b/, /\bmust (?:donate|make merit)\b/, /大做法事|做法事|捐(?:一大笔|巨款|大笔|很多|大量)|重金|(?:拜|去)\s*\d+\s*(?:座|间)(?:庙|寺)|越捐越|必须(?:捐|供奉|做法事)|请大师|大笔/]
    .map(r => r.source).join("|"), "i"),
  lottery: new RegExp([/หวย|ลอตเตอรี่|ล็อตเตอรี่|สลากกินแบ่ง|เลขเด็ด|เลขนำโชค(?!.*สี)|เลขเสี่ยงโชค|แทง(?:หวย|บอล)|พนัน|คาสิโน|บาคาร่า|เสี่ยงโชค|ซื้อ(?:หวย|สลาก|ล็อตเตอรี่)/,
    /\blotter(?:y|ies)\b|\blotto\b|\bticket|\bgambl|\bbet(?:ting|s)?\b|\bcasino|\bjackpot|\bscratch card|\blucky numbers?\b/, /彩票|博彩|赌|下注|中奖号码|买彩票|六合彩|幸运号码/].map(r => r.source).join("|"), "i"),
  sales: /บาท|ราคา|ซื้อ|สั่ง|ร้าน|โปรโมชัน|แพ็กเกจ|สมาชิก|ปลดล็อก|\b(?:price|buy|order|shop|unlock|premium)|价格|购买|下单|商店|解锁|会员/i,
  money: /บาท|฿|\bbaht\b|\bdollars?\b|\$|泰铢|块钱|\d+\s*元/i,
  link: /https?:|www\.|\.com\b|<a\b|href/i,
  med: rx("i", /ชื่อยา|ขนาดยา|กินยา|ทานยา|พาราเซตามอล|สมุนไพร|รักษาด้วย|เป็นโรค|วินิจฉัย/,
    /\b(?:take \d|mg\b|dose|dosage|paracetamol|herbs?|cure|diagnos\w*|you have (?:diabetes|a disease))|服用|剂量|毫克|草药|治好|诊断/,
    /得了\S*病/),
  prohib: /ห้าม|อย่า(?!ง)|ต้องไม่|จงอย่า|\bmust not\b|\bmustn'?t\b|\bnever\b|\bdon'?t\b|\bdo not\b|\bforbidden\b|\bprohibit\w*|禁止|不要|不许|不可以|切勿|千万别|不得|严禁/i,
  people: rx("i", /คนจีน|คนไทย|คนลาว|คนพม่า|คนเขมร|ฝรั่ง|แขก|ชาวต่างชาติ|ต่างด้าว|มุสลิม|อิสลาม|คริสต์|พุทธ|ฮินดู|คนผิว|คนเกิดปี|คนชื่อ/,
    /ผู้ชาย|ผู้หญิง|ผม(?:ยาว|สั้น)|ใส่แว่น/,
    /\b(?:Chinese|Thai|Lao|Burmese|Khmer|foreigners?|Muslims?|Islam\w*|Christians?|Buddhists?|Hindus?|Jews?|Jewish|black|white|named|men|women|man with|woman with|born in the year)\b/,
    /华人|中国人|泰国人|外国人|老外|穆斯林|基督徒|佛教徒|印度教|属[鼠牛虎兔龙蛇马羊猴鸡狗猪]|男人|女人|戴眼镜/),
  ritualSeq: /แล้วจึง|จุดธูป|สวดมนต์\s*\d|ถวายสังฆทาน|พิธี|\britual|ceremon|incense|then (?:light|chant|pray)|仪式|法事|上香|烧香|然后(?:拜|念)/i,
  recipient: /วัด[ก-ฮ]|มูลนิธิ[ก-ฮ]|โรงพยาบาล[ก-ฮ]|\b[A-Z][a-z]+ (?:Temple|Foundation|Hospital|Church|Mosque|Shrine)\b|\bWat [A-Z]|[一-鿿]{1,4}寺(?!庙)|基金会/,
};
const SCAN3 = {
  cert: /จะ(?:เสีย|ป่วย|เจ็บ|สูญ|ขาดทุน|โดน|ถูกโกง|แย่)|(?:你|您)?会(?:破财|生病|患病|出事|失去|损失|倒霉|受伤|遇到麻烦|赔)|\byou will (?:lose|fall|get sick|be ill)/i,
  prohib: /ไม่ควร|\bat all costs\b|\bavoid\b[^.]*\bat all\b|不应该|不宜/i,
  accType: /มอเตอร์ไซค์|รถล้ม|จมน้ำ|ไฟไหม้|เพลิงไหม้|เลือดตกยางออก|ถูกแทง|\b(?:drown\w*|bloodshed|blood|fire|motorbike|motorcycle|stabb\w*)\b|溺水|火灾|血光|淹|摔车/i,
  disease: /โรค|หัวใจวาย|เบาหวาน|ความดันสูง|อัมพาต|\b(?:heart (?:disease|attack)|diabetes|stroke|hypertension|asthma|cancer|covid)\b|心脏病|糖尿病|高血压|中风|哮喘|心梗/i,
  remedy: /เพื่อรักษา|รักษาอาการ|รักษาโรค|แก้โรค|(?:ดื่ม|กิน|ทาน)\S{0,16}ทุกวัน\S{0,6}(?:รักษา|หาย)|\b(?:to (?:treat|cure|heal)|remedy for|treatment for)\b|治疗|治病|疗法|偏方/i,
  person: /ชื่อ\s?[ก-ฮ]|ที่ชื่อ|คนที่(?:ขับ|ใส่|สวม|มีรถ)|(?:รถ|เสื้อ|ผม)สี[ก-๙]|\b(?:with the \w+ (?:car|shirt|hair)|named|called [A-Z])\b|姓\S{1,2}的|叫\S{1,3}的人|开\S{0,3}车的|穿\S{0,4}的人/,
  group: rx("", /คน(?:อีสาน|เหนือ|ใต้|ภาค|กรุง|ญี่ปุ่น|อินเดีย|เกาหลี|เวียดนาม|ญวน|มอญ)|คนเกิดวัน/,
    /ชาว(?:อีสาน|เขา|ญี่ปุ่น|อินเดีย|จีน)/,
    /\b(?:Indians?|Japanese|Koreans?|Vietnamese|Africans?|Europeans?|Americans?|Westerners?|Asians?|northerners|southerners|people born on)\b/,
    /日本人|韩国人|印度人|越南人|外地人|南方人|北方人|东北人|黑人|白人|洋人|星期\S出生的人/),
  asset2: /เงินดิจิทัล|เหรียญดิจิทัล|โทเคน|ฟอเร็กซ์|เทรด|\b(?:digital (?:money|currency|coins?)|tokens?|NFTs?|forex|trading)\b|数字货币|虚拟币|币圈|炒股|外汇/i,
  endRel2: /断了|散了|分开吧|เลิกคบ/,
  fear2: /(?:ถ้า|หาก)(?:คุณ)?ไม่(?:ได้)?(?:ไป)?(?:ไหว้|ใส่บาตร|สวด)|\bif you (?:skip|miss|forget|ignore|neglect)\b/i,
  merit2: rx("i", /พระ(?:อาจารย์|ครู|มหา|อธิการ)|หลวง(?:พ่อ|ปู่|ตา)|จำนวนมาก|มหาศาล/,
    /\b(?:a (?:lot of|large sum of) money|(?:a |one )?(?:hundred|thousand|million) (?:baht|dollars?))\b/,
    /[一二三四五六七八九十百千万亿两]+\s*(?:元|块|万)/),
  luck2: /เลขทะเบียน|ทะเบียนรถ|เลขเบอร์|\b(?:licen[cs]e plate|plate number)\b|大奖/i,
};
const ACC_ILL_TRAVEL = /อุบัติเหตุ|บาดเจ็บ|ป่วย|ไม่สบาย|เป็นไข้|เจ็บ|เดินทาง|\baccident|\binjur|\bill\b|\billness|\bsick|\bfever|\bunwell|\btravel|意外|事故|受伤|生病|发烧|不适|出行|旅行|出门|远行/i;
const MONTHS_TH = "ม\\.ค|ก\\.พ|มี\\.ค|เม\\.ย|พ\\.ค|มิ\\.ย|ก\\.ค|ส\\.ค|ก\\.ย|ต\\.ค|พ\\.ย|ธ\\.ค|มกรา|กุมภา|มีนา|เมษา|พฤษภา|มิถุนา|กรกฎา|สิงหา|กันยา|ตุลา|พฤศจิกา|ธันวา";
const DAY_DATE = new RegExp([`วันที่\\s*\\d|\\d{1,2}\\s*(?:${MONTHS_TH})|\\d{1,2}\\s*/\\s*\\d{1,2}|วัน(?:จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)|วันนี้|พรุ่งนี้|มะรืน|คืนนี้`,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b|\bon (?:the )?\d/.source,
  /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b|\btoday\b|\btomorrow\b|\btonight\b/.source,
  /\d+\s*(?:日|号)|[一二三四五六七八九十]+(?:日|号)|星期[一二三四五六日天]|周[一二三四五六日]|礼拜[一二三四五六日天]|今天|明天|后天|今晚/.source].join("|"), "i");
const CAUTION_VERB = /ระวัง|ใส่ใจ|\bbe careful\b|\bbe mindful\b|\bwatch\b|\bcareful\b|\bmindful\b|留意|小心|注意/i;
const CERT = /แน่นอน|ต้องเกิด|จะเกิด|จะเจอ|จะโดน|ฟันธง|\b(?:will|certain|certainly|definitely|for sure|bound to|destined)\b|一定|肯定|必定|必然|注定/i;
const MAY = /อาจ|\b(?:may|might|could)\b|可能|或许|也许|有望/i;
const PROMISE = /แน่นอน|จะได้|รับรอง|ได้แน่|การันตี|\b(?:will|guaranteed?|sure to|certain to)\b|一定|必定|保证|肯定会|必然/i;
const LUCK_BUY = /บูชา|เช่า|ของมงคล|เครื่องราง|จ่าย|\b(?:amulet|talisman|worship|purchase|pay)\w*|供奉|护身符|开运物/i;
const NEAR_DIGITS = /(?:โชค|luck|运)[\s\S]{0,20}\d{2,6}|\d{2,6}[\s\S]{0,20}(?:โชค|luck|运)/i;
const GUIDE_CAT = {
  mindful: /มีสติ|\bmindful|正念/i,
  precepts: /ศีล|\bprecepts?\b|持戒|守戒|戒律/i,
  merit: /ทำบุญ|บริจาค|ช่วยเหลือ|แบ่งปัน|\b(?:merit|donat\w*|help\w*|charit\w*|give)\b|行善|布施|捐助|帮助|助人|善事/i,
  parents: /พ่อแม่|บิดามารดา|\bparents\b|父母/i,
  religion: /ความเชื่อหรือศาสนา|ศาสนาของ|\b(?:faith|religion)\b|信仰|宗教/i,
};
const FAITH_SPECIFIC = /วัด|พระ|ใส่บาตร|\btemples?\b|\bmonks?\b|寺|庙|佛|僧/i;
const FAITH_INCLUSIVE = /ศาสนสถาน|ความเชื่อหรือศาสนา|ศาสนาของ|\bplaces? of worship\b|\bfaith\b|\breligion\b|宗教场所|信仰|宗教/i;

/** every text the section can show: [{ where, kind, lang, text }] */
function allTexts() {
  const out = [];
  for (const r of RULES) for (const f of ["mind", "do", "cheer", "luck"]) if (r[f]) for (const l of LANGS) out.push({ where: r.id + "." + f, kind: f, lang: l, text: canon(r[f][l]), rule: r });
  for (const [k, v] of Object.entries(core.LABELS)) for (const l of LANGS) out.push({ where: "label." + k, kind: "label", lang: l, text: canon(v[l]) });
  for (const [k, v] of Object.entries(shell.TEXT)) for (const l of LANGS) out.push({ where: "shell." + k, kind: "label", lang: l, text: canon(v[l]) });
  return out;
}
const ALL = allTexts();
const RULE_TEXTS = ALL.filter(x => x.kind !== "label");
/** rendered section text of every locked reading (period labels included) */
const RENDERED = [];
for (const r of FIX.readings) for (const lang of LANGS) {
  const per = r.period ? FIX.periods[r.period] : null;
  const m = core.build({ domain: r.domain, facts: { domain: r.domain, items: r.items }, period: per, lang }, ON);
  RENDERED.push({ r, lang, per, m, text: core.html(m).replace(/<[^>]+>/g, " ") });
}

test("T6 hard limits: no text the section can show touches death, terminal illness, medication, assets, ending a relationship, fear-selling, heavy merit", () => {
  assert.ok(RULE_TEXTS.length >= 240, "rule texts scanned: " + RULE_TEXTS.length);
  const hits = [];
  for (const x of ALL) {
    if (FS.hardLimit(x.text)) hits.push(x.where + " " + x.lang + " hardLimit " + FS.hardLimit(x.text));
    for (const k of ["death", "terminal", "medication", "asset", "endRelationship", "fear", "meritHeavy", "lottery", "med", "link"]) {
      if (SCAN[k].test(x.text)) hits.push(x.where + " " + x.lang + " " + k + ": " + x.text);
    }
  }
  for (const x of RULE_TEXTS) for (const k of ["prohib", "people", "money"]) if (SCAN[k].test(x.text)) hits.push(x.where + " " + x.lang + " " + k + ": " + x.text);
  for (const x of RENDERED) for (const k of ["death", "terminal", "medication", "endRelationship", "fear", "meritHeavy", "lottery", "link"]) {
    if (SCAN[k].test(x.text)) hits.push(x.r.name + " " + x.lang + " rendered " + k);
  }
  assert.deepEqual(hits, []);
});

test("T6 / N7 time (owner 2026-11-20): accident, illness and travel never with a single day or date, never under a one-day period", () => {
  const hits = [];
  for (const x of RULE_TEXTS) if (DAY_DATE.test(x.text)) hits.push(x.where + " " + x.lang + " (a day or date, any topic): " + x.text);
  for (const x of RENDERED) if (DAY_DATE.test(x.text)) hits.push(x.r.name + " " + x.lang + " rendered: a day or date");
  for (const x of RULE_TEXTS) for (const [k, re] of Object.entries(SCAN3)) if (re.test(x.text)) hits.push(x.where + " " + x.lang + " " + k + ": " + x.text);
  for (const x of RENDERED) {
    const p = x.m.parts.find(q => q.part === "period");
    if (!p || !x.per || x.per.span !== "day") continue;
    for (const it of p.mind.concat(p.cheer, p.guide)) if (ACC_ILL_TRAVEL.test(it.text)) hits.push(x.r.name + " " + x.lang + " one-day period: " + it.text);
  }
  assert.deepEqual(hits, []);
});

test("T8 every 'be mindful of' line is 'be careful' wording, never certain, never a prohibition", () => {
  for (const x of RULE_TEXTS.filter(t => t.kind === "mind")) {
    assert.match(x.text, CAUTION_VERB, x.where + " " + x.lang + ": caution verb");
    assert.doesNotMatch(x.text, CERT, x.where + " " + x.lang + ": certainty");
    assert.doesNotMatch(x.text, SCAN.prohib, x.where + " " + x.lang + ": prohibition");
  }
  for (const x of RENDERED) for (const p of x.m.parts) for (const it of p.mind) assert.match(it.text, CAUTION_VERB, x.r.name + " " + x.lang);
});

test("T13 no price, sales or shop words and no link anywhere in the section", () => {
  const hits = ALL.filter(x => SCAN.sales.test(x.text) || SCAN.link.test(x.text)).map(x => x.where + " " + x.lang + ": " + x.text);
  for (const x of RENDERED) if (SCAN.sales.test(x.text)) hits.push(x.r.name + " " + x.lang + " rendered");
  for (const x of RENDERED) assert.doesNotMatch(core.html(x.m), /<a\b|href=|data-lq-(?:upsell|remedy|paid)/, x.r.name + ": no link or paid block");
  assert.deepEqual(hits, []);
});

test("T19 luck lines always say 'may' and never promise; encouragement never promises", () => {
  const luck = RULE_TEXTS.filter(x => x.kind === "luck");
  assert.ok(luck.length >= 30, "luck lines: " + luck.length);
  for (const x of luck) { assert.match(x.text, MAY, x.where + " " + x.lang + ": may"); assert.doesNotMatch(x.text, PROMISE, x.where + " " + x.lang + ": promise"); }
  for (const x of RULE_TEXTS.filter(t => t.kind === "cheer")) assert.doesNotMatch(x.text, PROMISE, x.where + " " + x.lang + ": promise");
  for (const x of RENDERED) for (const p of x.m.parts) for (const c of p.cheer) if (c.luck) assert.match(c.text, MAY, x.r.name + " " + x.lang);
});

test("T20 no lottery or gambling words, and no number next to a luck word, anywhere in the section", () => {
  const hits = ALL.filter(x => SCAN.lottery.test(x.text)).map(x => x.where + " " + x.lang);
  // period labels come from the page (ages, a 大运 pillar); the number-near-luck rule covers the section's own texts
  for (const x of ALL) if (NEAR_DIGITS.test(x.text)) hits.push(x.where + " " + x.lang + " number near luck: " + x.text);
  for (const x of RENDERED) if (SCAN.lottery.test(x.text)) hits.push(x.r.name + " " + x.lang + " rendered");
  assert.deepEqual(hits, []);
});

test("T21 luck lines name no asset, no price, no buying or worship for luck, no heavy merit", () => {
  for (const x of RULE_TEXTS.filter(t => t.kind === "luck")) {
    for (const k of ["asset", "sales", "meritHeavy", "money"]) assert.doesNotMatch(x.text, SCAN[k], x.where + " " + x.lang + ": " + k);
    assert.doesNotMatch(x.text, LUCK_BUY, x.where + " " + x.lang + ": tied to buying or worship");
  }
});

test("guidance whitelist (owner 2026-11-20): every 'what to do' is a mindset or a good deed, faith-inclusive, no amount, recipient, big donation or ritual", () => {
  const dos = RULE_TEXTS.filter(x => x.kind === "do");
  assert.ok(dos.length >= 60, "guidance texts: " + dos.length);
  for (const x of dos) {
    const cat = x.rule.doCat, at = x.where + " " + x.lang;
    assert.ok(GUIDE_CAT[cat], at + ": category " + cat);
    assert.match(x.text, GUIDE_CAT[cat], at + ": the text is of its category " + cat + ": " + x.text);
    assert.doesNotMatch(x.text, /\d/, at + ": no amount or number");
    for (const k of ["money", "recipient", "meritHeavy", "link", "ritualSeq", "prohib", "people"]) assert.doesNotMatch(x.text, SCAN[k], at + ": " + k + ": " + x.text);
    if (FAITH_SPECIFIC.test(x.text)) assert.match(x.text, FAITH_INCLUSIVE, at + ": faith-specific wording must be offered for any faith: " + x.text);
  }
  for (const x of RENDERED) for (const p of x.m.parts) for (const g of p.guide) {
    const r = RULES.find(y => y.id === g.rule);
    assert.ok(r && r.do && g.text === canon(r.do[x.lang]), x.r.name + " " + x.lang + ": guidance comes from the rule's own whitelisted text");
  }
});

/* ---------------- T7 probes: the product filter refuses every forbidden probe and lets every allowed one through ---------------- */
const DAY = { part: "period", span: "day" }, MONTH = { part: "period", span: "month" }, OVERALL = { part: "overall" };
const FORBID = {
  th: {
    mind: ["ปีนี้อาจถึงตาย ควรระวัง", "ระวังจะเสียชีวิตก่อนวัยอันควร", "ดวงชี้ว่าอายุสั้น ควรระวัง", "ระวังความตายของคนในบ้าน", "ช่วงนี้ระวังเจ็บหนักถึงชีวิต", "ตำราว่าจะสิ้นใจในวัยกลางคน ระวังไว้",
      "ระวังผลข้างเคียง ควรหยุดกินยาไปก่อน", "ระวังไว้ ไม่ต้องรักษาแล้วจะหายเอง", "ควรเลิกรักษาแล้วหันมาทำบุญแทน ระวังด้วย", "ระวังยา ควรงดยาที่หมอสั่ง",
      "ระวังการเงิน ควรลงทุนในหุ้นตัวนี้", "ควรซื้อทองคำเก็บไว้ ระวังเงินเฟ้อ", "ระวังพลาดโอกาส ลงทุนคริปโตตอนนี้", "ระวังเงินหาย ซื้อที่ดินไว้ดีกว่า",
      "ระวังความรัก ควรเลิกกับแฟนคนนี้", "ระวังคู่ครอง ควรหย่าเสียดีกว่า", "ระวังคนรัก ให้บอกเลิกเขาไปเลย", "ระวังความสัมพันธ์ เลิกกับเขาซะ",
      "ระวังเคราะห์ ถ้าไม่ทำบุญเรื่องร้ายจะตามมา", "ระวังดวงตก ต้องทำพิธีถึงจะพ้น", "ระวังให้ดี ไม่หายจนกว่าจะบริจาค", "ระวังโชคร้าย ทำบุญด่วนไม่งั้นแย่",
      "วันที่ 5 มี.ค. ระวังอุบัติเหตุ", "พรุ่งนี้ระวังเจ็บป่วย", "วันจันทร์หน้าระวังการเดินทาง", "12/3 ระวังเป็นไข้", "วันนี้ระวังอุบัติเหตุ", "ระวังอุบัติเหตุวันเสาร์นี้",
      "ระวังรถชนช่วงนี้", "ปีนี้จะเกิดอุบัติเหตุแน่นอน ระวังไว้", "ระวังโดนรถเฉี่ยว", "ฟันธงว่าจะประสบอุบัติเหตุ ระวังด้วย",
      "ระวังเป็นไข้ ให้กินยาพาราเซตามอลวันละ 2 เม็ด", "ระวังสุขภาพ ไม่ต้องหาหมอ", "ระวังท้องเสีย รักษาด้วยสมุนไพร", "ระวังไว้ คุณเป็นโรคเบาหวาน",
      "ห้ามเดินทางไกลช่วงนี้", "อย่าออกจากบ้านตอนกลางคืน ระวังไว้", "ระวัง ต้องไม่เซ็นสัญญาใด ๆ", "ห้ามตัดสินใจเรื่องใหญ่ ระวังด้วย",
      "ระวังคนจีนที่เข้ามาหา", "ระวังผู้ชายผมยาวที่ทำงาน", "ระวังคนเกิดปีวอก", "ระวังชาวมุสลิมในที่ทำงาน",
      "งานช่วงนี้หนักมาก", "เงินจะไหลออก"],
    do: ["ควรทำบุญหนัก ๆ ทั้งเดือน", "ทำบุญ 9 วัดในวันเดียว", "บริจาค 9,999 บาทให้วัด", "สะเดาะเคราะห์ครั้งใหญ่", "ทำพิธีใหญ่แก้ดวง", "บวชแก้เคราะห์", "ปล่อยปลา 108 ตัว", "ยิ่งทำบุญมากยิ่งได้มาก",
      "บริจาคเงินก้อนใหญ่ให้มูลนิธิ", "ทำบุญที่วัดพระแก้วเท่านั้น", "ดูรายละเอียดที่ https://example.com"],
    luck: ["ระวังพลาดโชค ซื้อหวยงวดนี้", "อาจมีโชคจากเลขเด็ด 59", "อาจมีโชคจากการเสี่ยงโชค", "อาจโชคดีถ้าแทงบอล", "อาจได้ลาภจากสลากกินแบ่ง", "อาจมีโชคเล่นคาสิโน", "อาจมีโชคจากลอตเตอรี่",
      "อาจถูกรางวัลจากการพนัน",
      "จะได้เงินก้อนใหญ่แน่นอน", "รับรองว่ามีโชค", "การันตีว่าได้งานใหม่", "มีโชคจากผู้ใหญ่", "อาจมีโชคถ้าบูชาเครื่องราง", "อาจมีโชคเมื่อซื้อของมงคล", "อาจมีโชคจากการลงทุนในหุ้น"],
  },
  en: {
    mind: ["Be careful, you may die young.", "Watch out: death is near this year.", "Be careful, your chart shows a short life.", "Be mindful of a fatal accident.",
      "A relative may pass away soon, be careful.", "Be careful of dying before fifty.",
      "Be careful: stop taking your medication for now.", "Be mindful and skip your treatment this month.", "You can quit your meds, just be careful.", "Watch your health and stop your chemo.",
      "Be careful with money and invest in gold.", "Watch your savings: buy shares now.", "Be mindful and invest in crypto this year.", "Be careful, buy property before prices rise.",
      "Be careful in love: you should break up.", "Be mindful, it is time to divorce.", "Watch your relationship and leave your partner.", "Be careful, you need to end your relationship.",
      "Be careful: unless you donate, bad luck stays.", "Be mindful, if you don't make merit things go wrong.", "Watch out: pay for the ritual or else your luck falls.",
        "Be careful, without an offering this would get worse.",
      "Be careful of an accident on 5 March.", "Be careful of falling ill tomorrow.", "Be careful when travelling next Monday.", "Watch for a fever on 12/3.",
        "Be careful of an accident today.", "Be careful of an injury on Saturday.",
      "Be careful of a car crash this year.", "You will have an accident, be careful.", "Be careful of being hit by a car.", "An accident is certain, be mindful.",
      "Be careful of a fever; take 500 mg paracetamol.", "Be careful, no need to see a doctor.", "Watch your stomach and cure it with herbs.", "Be careful, you have diabetes.",
      "You must not travel this month, be careful.", "Be careful and never sign a contract now.", "Be careful: do not leave home at night.", "Be careful, big decisions are forbidden.",
      "Be careful of foreigners.", "Watch out for a tall man with glasses.", "Be careful of people born in the year of the Monkey.", "Be careful of Christians at work.",
      "Work is very heavy now.", "Money flows out."],
    do: ["Make a large donation to the temple.", "Hold an elaborate ritual this month.", "Make merit at 9 temples.", "Donate 5,000 baht.", "The more you donate, the better.",
      "You must make merit to be safe.",
      "Make a big offering at the shrine.", "Book an expensive ceremony.", "Give a huge gift to the foundation.", "Donate only to Wat Arun.", "See https://example.com for details."],
    luck: ["You may get lucky with the lottery.", "You may win if you buy a ticket.", "Lucky numbers 12 and 45 may help.", "You may have luck at the casino.",
      "You might win a bet this week.", "You could hit the jackpot.",
      "You may win with a scratch card.", "Gambling may bring luck.", "You will get a promotion.", "Luck is guaranteed.", "You are sure to win.", "Money comes from a senior person.",
      "You may have luck if you buy an amulet.", "You may get lucky after paying for a blessing.", "You may profit if you buy shares."],
  },
  zh: {
    mind: ["留意今年有死亡之兆。", "小心短命。", "注意家人可能去世。", "留意寿命不长。", "小心有生命危险会死。", "注意活不长。",
      "留意身体，先停药吧。", "小心，不用治疗了。", "注意，不必再吃药。", "留意健康，放弃治疗。",
      "留意财运，买入股票。", "小心通胀，投资黄金。", "注意机会，购买比特币。", "留意存款，投资房产。",
      "留意感情，应该分手。", "小心婚姻，最好离婚。", "注意感情，赶紧和他分手。", "留意关系，离开他吧。",
      "留意，除非你捐钱，否则运气不好。", "小心，不做法事的话会出事。", "注意，不化解就会倒霉。", "留意，要想转运必须捐钱。",
      "3月5日留意意外。", "明天小心生病。", "下周一出行要小心。", "12日留意发烧。", "今天小心意外。", "星期六注意受伤。",
      "留意车祸。", "一定会出意外，小心。", "小心被车撞。", "注定会发生事故，注意。",
      "留意发烧，服用退烧药两片。", "小心身体，不用看医生。", "注意胃，用草药治好。", "留意，你得了糖尿病。",
      "禁止远行，留意。", "小心，不要签合同。", "切勿夜里出门，注意。", "注意，不得做重大决定。",
      "留意外国人。", "小心戴眼镜的高个男人。", "注意属猴的人。", "留意穆斯林同事。",
      "最近工作很重。", "钱财外流。"],
    do: ["大做法事化解。", "捐一大笔钱给寺庙。", "去9座庙拜拜。", "越捐越好。", "必须捐款。", "重金请大师。", "做法事三天。", "捐巨款积福。", "给某某基金会捐款。", "只去玉佛寺布施。", "详情见 https://example.com"],
    luck: ["可能会中彩票。", "或许买彩票有好运。", "幸运号码 18 可能带来好运。", "可能在赌场有运气。", "下注可能会赢。", "也许中奖号码是 23。", "六合彩可能中。", "博彩可能有收获。",
      "一定会发财。", "保证有好运。", "肯定会升职。", "贵人带来财运。", "购买护身符可能带来好运。", "供奉神像或许有好运。", "买入股票可能有收益。"],
  },
};
const ALLOW = {
  th: {
    mind: ["ตามตำรา ช่วงนี้ควรระวังอุบัติเหตุ เดินทางอย่างไม่ประมาท", "ควรระวังอุบัติเหตุเล็ก ๆ น้อย ๆ ระหว่างทำงาน", "ระวังการลื่นหกล้มในบ้าน", "ใส่ใจความปลอดภัยและระวังอุบัติเหตุบนท้องถนน",
      "ระวังเจ็บป่วยหรือเป็นไข้ พักผ่อนให้พอ", "ช่วงนี้ควรระวังสุขภาพ ถ้ารู้สึกไม่สบายควรไปพบแพทย์", "ระวังสุขภาพเกี่ยวกับแขน ขา และท้อง", "ใส่ใจการพักผ่อน ระวังเป็นไข้ช่วงอากาศเปลี่ยน",
      "ระวังและสังเกตอาการของตัวเอง ถ้าไม่สบายควรพบแพทย์", "ระวังการใช้จ่ายเกินงบ", "ระวังการลงทุน ศึกษาข้อมูลให้รอบคอบก่อนตัดสินใจ", "ระวังเรื่องไม่คาดคิดและคนที่ไม่หวังดี",
      "ระวังการถูกหลอกให้จ่ายเงิน", "ระวังหากต้องเดินทางไกลในช่วงนี้"],
    month: ["ช่วงเดือน มี.ค.–เม.ย. ควรระวังอุบัติเหตุมากขึ้น", "ระวังหากต้องเดินทางในช่วงเดือนมีนาคมถึงเมษายน", "ระวังสุขภาพเกี่ยวกับท้องในช่วงเดือนนี้ ถ้าไม่สบายควรพบแพทย์"],
    do: ["ทำบุญหรือบริจาคตามกำลังให้วัด ศาสนสถาน มูลนิธิ หรือบ้านพักคนชรา", "รักษาศีลและมีสติในทุกวัน", "ไหว้และเคารพพ่อแม่", "ปฏิบัติตามความเชื่อหรือศาสนาของท่าน",
      "ช่วยเหลือสังคมและคนที่ลำบากตามกำลัง"],
    luck: ["ช่วงนี้อาจมีผู้ใหญ่ให้การสนับสนุน", "อาจมีรายได้เพิ่มจากความขยัน"],
  },
  en: {
    mind: ["By tradition, be careful of accidents now and travel with care.", "Be careful of small accidents at work.", "Be careful not to slip and fall at home.",
      "Be mindful of safety and careful of accidents on the road.",
      "Be careful of falling ill or catching a fever; rest well.", "Be careful with your health, and see a doctor if you feel unwell.", "Be careful with your arms, legs and stomach.",
        "Be mindful of rest and careful of fevers when the weather changes.",
      "Be careful and watch how you feel; see a doctor if unwell.", "Be careful not to spend over budget.", "Be careful with investments and study them well before you decide.",
        "Be careful of the unexpected and of people who wish you ill.",
      "Be careful of being tricked into paying money.", "Be careful if you need to travel far during this time."],
    month: ["During March to April, be more careful of accidents.", "Be careful if you travel between March and April.", "Be careful with your stomach this month, and see a doctor if unwell."],
    do: ["Make merit or donate as you can to a temple, place of worship, charity or care home.", "Keep the precepts and stay mindful every day.", "Pay respect to your parents.",
      "Practise according to your own faith or religion.", "Help society and people in need as you can."],
    luck: ["A senior person may support you now.", "Your income could grow from steady work."],
  },
  zh: {
    mind: ["按传统，这段时间留意意外，出行多加小心。", "工作时留意小意外。", "在家小心滑倒。", "注意安全，留意路上的意外。",
      "留意生病或发烧，好好休息。", "这段时间注意健康，如感不适请就医。", "留意手臂、腿和腹部的健康。", "注意休息，天气变化时留意发烧。",
      "留意身体的感觉，不适时请看医生。", "留意开支，避免超出预算。", "投资要小心，决定前先充分了解。", "留意意料之外的事和心怀不轨的人。",
      "小心被骗付钱。", "如需远行，这段时间多加留意。"],
    month: ["三月至四月期间，多留意意外。", "三月到四月如需出行，请多小心。", "本月留意肠胃健康，如有不适请就医。"],
    do: ["量力行善，向寺庙、宗教场所、慈善机构或养老院捐助。", "持戒并时时保持正念。", "孝敬父母。", "按照您自己的信仰或宗教修行。", "量力帮助社会和有需要的人。"],
    luck: ["这段时间可能会有长辈支持您。", "收入或许会因勤奋而增加。"],
  },
};

test("T7 forbidden probes: the section's filter refuses every one (TH / EN / ZH)", () => {
  let n = 0;
  const pass = [];
  for (const l of LANGS) for (const kind of ["mind", "do", "luck"]) for (const t of FORBID[l][kind]) {
    n++;
    if (!core.check(t, kind, OVERALL)) pass.push(l + " " + kind + ": " + t);
  }
  assert.ok(n >= 200, "forbidden probes: " + n);
  assert.deepEqual(pass, [], "forbidden probes the filter let through");
});

test("T7 allowed probes pass (accidents, illness, body areas, travel, spending, investing, people in broad terms, ordinary merit, 'may' luck)", () => {
  const refused = [];
  for (const l of LANGS) {
    for (const t of ALLOW[l].mind) if (core.check(t, "mind", OVERALL)) refused.push(l + " mind: " + t + " -> " + core.check(t, "mind", OVERALL));
    for (const t of ALLOW[l].month) if (core.check(t, "mind", MONTH)) refused.push(l + " month: " + t + " -> " + core.check(t, "mind", MONTH));
    for (const t of ALLOW[l].do) if (core.check(t, "do", OVERALL)) refused.push(l + " do: " + t + " -> " + core.check(t, "do", OVERALL));
    for (const t of ALLOW[l].luck) if (core.check(t, "luck", OVERALL)) refused.push(l + " luck: " + t + " -> " + core.check(t, "luck", OVERALL));
  }
  assert.deepEqual(refused, []);
});

test("T7 time: accident, illness and travel are refused under a one-day period and allowed under a month range", () => {
  for (const l of LANGS) {
    for (const t of ALLOW[l].month) assert.ok(core.check(t, "mind", DAY), l + ": refused under a one-day period: " + t);
    for (const t of ALLOW[l].mind.filter(x => ACC_ILL_TRAVEL.test(x))) {
      assert.ok(core.check(t, "mind", DAY), l + ": refused under a one-day period: " + t);
      assert.equal(core.check(t, "mind", MONTH), "", l + ": allowed under a month range: " + t);
    }
  }
});

test("T7 D-2: the illness relaxation is for this section only; the main reading filter still cuts the same sentences", () => {
  const FA = require(join(ROOT, "fortune-ai.js"));
  for (const t of [ALLOW.th.mind[4], ALLOW.en.mind[4], ALLOW.zh.mind[4]]) assert.equal(FA.safety.isSafe(t), false, "main filter unchanged: " + t);
});

test("the probe lists are self-consistent (every forbidden probe hits a test scan or a structural rule)", () => {
  // guards the probes themselves: a forbidden probe that no test-owned scan recognises would be a weak probe
  const struct = (t, kind) => (kind === "mind" && (!CAUTION_VERB.test(t) || CERT.test(t))) || (kind === "luck" && (!MAY.test(t) || PROMISE.test(t) || LUCK_BUY.test(t))) ||
    ((ACC_ILL_TRAVEL.test(t) && DAY_DATE.test(t))) || /\d/.test(t) && kind === "do" || /รถชน|โดนรถ|car crash|hit by a car|车祸|被车撞/i.test(t);
  const weak = [];
  for (const l of LANGS) for (const kind of ["mind", "do", "luck"]) for (const t of FORBID[l][kind]) {
    if (!Object.values(SCAN).some(re => re.test(t)) && !struct(t, kind) && !FS.hardLimit(t)) weak.push(l + " " + kind + ": " + t);
  }
  assert.deepEqual(weak, []);
});

/* ---------------- RELOCK 3: the reviewer's probes (verbatim) and our generalisations of each gap ---------------- */
const REVIEW_FORBID = [
  ["ระวังการใช้จ่ายในวันที่ 5", "mind"], ["วันจันทร์นี้ควรระวังการตัดสินใจเรื่องเงิน", "mind"], ["วันจันทร์นี้ระวังการเดินทาง", "mind"], ["5日留意开支。", "mind"],
  ["5日小心出行。", "mind"], ["Be careful with spending on the 5th.", "mind"], ["Be careful with money on March 5.", "mind"], ["ระวังเรื่องงานในวันพฤหัสบดีหน้า", "mind"],
  ["ระวังคุณจะเสียเงินก้อนโต", "mind"], ["ปีนี้คุณจะเสียทรัพย์ ควรระวัง", "mind"], ["你会破财，要小心。", "mind"], ["今年你会生病，要留意。", "mind"],
  ["ไม่ควรเดินทางไกล ระวังด้วย", "mind"], ["ระวังอย่าไปไหนคนเดียว", "mind"], ["Avoid travelling at all costs; be careful.", "mind"], ["ระวังมอเตอร์ไซค์ล้ม", "mind"],
  ["ระวังจมน้ำช่วงนี้", "mind"], ["ระวังไฟไหม้บ้าน", "mind"], ["Be careful of drowning this year.", "mind"], ["留意溺水。", "mind"], ["ระวังโรคหัวใจ", "mind"],
  ["ระวังโรคเบาหวานกำเริบ", "mind"], ["Be careful of a heart attack.", "mind"], ["留意心脏病。", "mind"], ["ระวังสุขภาพ ควรดื่มน้ำขิงทุกวันเพื่อรักษา", "mind"],
  ["ระวังเพื่อนร่วมงานที่ชื่อสมชาย", "mind"], ["小心姓王的人。", "mind"], ["ระวังคนที่ขับรถสีแดง", "mind"], ["Be careful of your neighbour with the red car.", "mind"],
  ["ระวังคนอีสาน", "mind"], ["Be careful of Indians at work.", "mind"], ["小心日本人。", "mind"], ["ระวังการลงทุนในเงินดิจิทัล", "mind"],
  ["Be careful but buy Tesla shares now.", "mind"], ["ระวังพลาด ควรซื้อสลากออมสิน", "mind"], ["ระวัง ควรเลิกคบแฟนคนนี้", "mind"], ["小心，跟他断了吧。", "mind"],
  ["Be careful; it's time to leave your wife.", "mind"], ["ระวังเคราะห์ร้ายตามมาถ้าไม่ไปไหว้", "mind"], ["Be careful; bad luck follows if you skip the offering.", "mind"],
  ["ทำบุญ 9 วัด 9 พระ", "do"], ["ถวายสังฆทาน 9 ชุด", "do"], ["ทำบุญให้พระอาจารย์สมชาย", "do"], ["บริจาคเงินจำนวนมากให้วัด", "do"],
  ["Donate a thousand baht to the temple.", "do"], ["捐一万元给寺庙。", "do"], ["ไปทำบุญที่วัดพระธาตุดอยสุเทพ", "do"], ["อาจมีโชคจากเลขทะเบียนรถ", "luck"],
  ["อาจถูกหวยงวดหน้า", "luck"], ["You may win the lottery soon.", "luck"], ["可能会中大奖。", "luck"], ["อาจมีโชคถ้าซื้อพระเครื่อง", "luck"], ["อาจรวยจากการเทรดหุ้น", "luck"],
  ["อาจมีโชคถ้าทำบุญหนัก ๆ", "luck"], ["คุณจะได้โชคใหญ่", "luck"], ["ระวังเลือดตกยางออก", "mind"], ["ระวังอันตรายถึงชีวิต", "mind"], ["小心血光之灾。", "mind"],
  ["Be careful of bloodshed this year.", "mind"], ["ระวังคนเกิดวันอังคาร", "mind"],
];
const REVIEW_ALLOW = [
  ["ระวังการใช้จ่ายเกินตัวในช่วงเดือน มี.ค.–เม.ย.", "mind", "month"], ["ช่วงกลางปีควรระวังการเดินทางไกล", "mind"], ["ระวังสุขภาพบริเวณหลังและไหล่ ถ้าไม่สบายควรพบแพทย์", "mind"],
  ["ระวังการถูกหลอกให้โอนเงิน", "mind"], ["ระวังคนที่ไม่หวังดี", "mind"], ["Be careful of being tricked into paying for something.", "mind"], ["留意被骗付款。", "mind"],
  ["三月到五月出行多留意。", "mind", "month"], ["Be mindful of your back and shoulders; see a doctor if unwell.", "mind"], ["ใส่บาตรและทำบุญตามกำลัง", "do"],
  ["ช่วยเหลือเพื่อนบ้านที่ลำบาก", "do"], ["孝敬父母，多陪伴家人。", "do"], ["อาจมีผู้ใหญ่ช่วยเหลือในช่วงนี้", "luck"], ["You may find support from colleagues.", "luck"],
  ["这段时间可能有贵人相助。", "luck"], ["ระวังการพูดจาที่อาจทำให้เข้าใจผิด", "mind"],
];
// our generalisations: the same gap in other words and the other languages
const GEN_FORBID = [
  ["ระวังเรื่องเงินวันศุกร์หน้า", "mind"], ["ช่วงวันที่ 12 ควรระวังคำพูด", "mind"], ["Be careful at work this Friday.", "mind"], ["Be careful with contracts on the 21st.", "mind"],
  ["本月12号留意合同。", "mind"], ["星期五小心说话。", "mind"], ["ระวังไว้ คุณจะป่วยหนักปีนี้", "mind"], ["Be careful, you will lose money this year.", "mind"],
  ["留意，您会损失一笔钱。", "mind"], ["ช่วงนี้ไม่ควรเซ็นสัญญา ระวังด้วย", "mind"], ["Be careful and avoid parties at all costs.", "mind"], ["留意，今年不宜出远门。", "mind"],
  ["ระวังถูกแทงช่วงนี้", "mind"], ["ระวังเพลิงไหม้ในที่ทำงาน", "mind"], ["Be careful of a motorbike fall.", "mind"], ["Watch out for fire at home this year.", "mind"],
  ["留意火灾。", "mind"], ["小心摔车。", "mind"], ["ระวังความดันสูง", "mind"], ["Be careful of a stroke this year.", "mind"], ["留意高血压。", "mind"],
  ["ระวังปวดหัว ควรกินยาหม่องเพื่อรักษา", "mind"], ["Be careful with your stomach and drink ginger tea to treat it.", "mind"], ["留意胃，用偏方调理。", "mind"],
  ["ระวังหัวหน้าที่ชื่อวิชัย", "mind"], ["Be careful of a colleague named John.", "mind"], ["小心叫小李的人。", "mind"], ["ระวังคนที่ใส่เสื้อสีดำ", "mind"],
  ["Be careful of the man with the black car.", "mind"], ["小心开白车的人。", "mind"], ["ระวังคนภาคใต้", "mind"], ["Be careful of Koreans at work.", "mind"], ["小心南方人。", "mind"],
  ["Be careful of people born on Saturday.", "mind"], ["小心星期六出生的人。", "mind"], ["ระวังการเทรดฟอเร็กซ์", "mind"], ["Be careful with crypto tokens.", "mind"],
  ["留意数字货币。", "mind"], ["留意，和她散了吧。", "mind"], ["ระวังเคราะห์ถ้าไม่ใส่บาตร", "mind"], ["Be careful; trouble comes if you miss the ritual.", "mind"],
  ["ทำบุญกับหลวงพ่อของวัดนี้", "do"], ["Donate a hundred dollars to the shrine.", "do"], ["捐三千元行善。", "do"], ["บริจาคเงินมหาศาลให้มูลนิธิ", "do"],
  ["อาจมีโชคจากเลขเบอร์โทร", "luck"], ["You may get lucky with your licence plate.", "luck"], ["或许能中大奖。", "luck"],
];
const GEN_ALLOW = [
  ["ช่วงเดือน ก.ค.–ส.ค. ควรระวังสุขภาพ ถ้าไม่สบายควรพบแพทย์", "mind", "month"], ["Between June and July, be careful with spending.", "mind", "month"],
  ["六月到七月留意开支。", "mind", "month"], ["ระวังการตัดสินใจเรื่องเงินแบบรีบร้อน", "mind"], ["Be careful not to rush money decisions.", "mind"], ["留意仓促做决定。", "mind"],
  ["รักษาศีลและมีสติ", "do"], ["Keep the precepts and stay mindful.", "do"], ["持戒并保持正念。", "do"],
];
const ctxOf = sp => (sp ? { part: "period", span: sp } : { part: "overall" });

test("RELOCK 3 forbidden probes: the reviewer's 60 and our generalisations are all refused", () => {
  const pass = [];
  for (const [t, k] of REVIEW_FORBID.concat(GEN_FORBID)) if (!core.check(t, k, OVERALL)) pass.push(k + ": " + t);
  assert.equal(REVIEW_FORBID.length, 60);
  assert.deepEqual(pass, [], "probes the filter let through");
});

test("RELOCK 3 allowed probes: the reviewer's 16 and ours pass", () => {
  const refused = [];
  for (const [t, k, sp] of REVIEW_ALLOW.concat(GEN_ALLOW)) { const why = core.check(t, k, ctxOf(sp)); if (why) refused.push(k + ": " + t + " -> " + why); }
  assert.equal(REVIEW_ALLOW.length, 16);
  assert.deepEqual(refused, []);
});

test("RELOCK 3 never a single day: every text under a one-day period is refused, on every topic", () => {
  for (const [t, k] of REVIEW_ALLOW.concat(GEN_ALLOW).filter(x => x[1] !== "do")) assert.ok(core.check(t, k, DAY), "allowed under a one-day period: " + t);
});

test("RELOCK 3 the new probes are recognised by the test's own scans (no weak probe)", () => {
  const weak = [];
  const struct = (t, kind) => (kind === "luck" && (!MAY.test(t) || PROMISE.test(t) || LUCK_BUY.test(t))) || (kind === "do" && /\d/.test(t)) || DAY_DATE.test(t);
  for (const [t, k] of REVIEW_FORBID.concat(GEN_FORBID)) {
    if (![...Object.values(SCAN), ...Object.values(SCAN3)].some(re => re.test(t)) && !struct(t, k) && !FS.hardLimit(t)) weak.push(k + ": " + t);
  }
  assert.deepEqual(weak, []);
});
