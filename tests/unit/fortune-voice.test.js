"use strict";
// tests/unit/fortune-voice.test.js — FIXED TEST SET, phase fortune-voice (owner inbox entries 22 items 2 and 4, and 23;
// 2026-11-23). Written and locked (evals-locks/fortune-voice.sha256, ~/LENSIQ-field/evals/fortune-voice/) BEFORE any
// product change on branch fortune-voice.
//   A  (entry 22 item 2, option ก) the re-word button reads exactly "เล่าอีกแบบ" · "Tell it another way" · "换个方式说说"
//      in all 7 places (palm, faceread, fengshui, numbers, horoscope, tarot, fortune-kit) and their dictionaries; the old
//      labels ("อ่านอีกสำนวน", "Rephrase", "Reword it", "换一种说法") are gone; no explanation next to it. Behaviour is
//      covered by tests/unit/fortune-reword-note.test.js (same result, new wording).
//   B  (entry 22 item 4) the 16 "machinery" sentences of the entry-20 audit list ง (items 1-16; item 17 is part C) speak
//      plainly: no system / model / composer / processor / random talk and no file name, in TH, EN and ZH; nothing claims
//      a human reader is present; the user still knows what to do next (where to put the hand or face, that it is loading,
//      that it failed and what to do). Item 4 keeps "lines in photos are often unclear". Item 11 is true to the code (the
//      daily direction and word are fixed for a date and birth weekday). Item 12: no file name in an error message.
//   C  (entry 23) the "composed by the writing assistant / AI (Claude)" label is gone from the reading, cards, share and
//      print (page code, dictionaries and the shared renderer). The consent step, privacy.html, terms.html and help keep
//      naming the writing assistant (Claude by Anthropic). docs/LEGAL-PACKET.md carries the two lawyer questions.
// Static scan = every file the site serves (root *.html / *.js, i18n/*.js, share/). Comment lines are skipped.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const isComment = line => /^\s*(?:\/\/|\/?\*|<!--)/.test(line);

function servedFiles() {
  const out = [];
  for (const f of fs.readdirSync(ROOT)) if (/\.(html|js)$/.test(f)) out.push(f);
  for (const d of ["i18n", "share"]) {
    const dir = path.join(ROOT, d);
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/\.(html|js|json|txt)$/.test(f)) out.push(d + "/" + f);
  }
  return out;
}
/** the fortune group: category 6 pages and their scripts, KBs and dictionaries (plus the product catalogue that describes them) */
const FORTUNE_FILE = /^(?:fortune|faceread|palm|horoscope|tarot|iching|bazi|taksa|lek7|numbers|fengshui|dream|zodiac|astro|lifegraph|lifecal|planner|luckycolor|report|cat-fortune|compat|petread)[\w.-]*\.(?:html|js)$|^i18n\/(?:en|zh)-(?:fortune|luckycolor|kb-|products)[\w.-]*\.js$/;
/** non-comment lines of every served file (or of the fortune group only) that match one of the patterns */
/** file text with comments blanked (block and line comments in scripts, <!-- --> in html), line numbers kept */
function code(f) {
  const keepLines = m => m.replace(/[^\n]/g, " ");
  let s = read(f);
  if (f.endsWith(".html")) return s.replace(/<!--[\s\S]*?-->/g, keepLines);
  s = s.replace(/\/\*[\s\S]*?\*\//g, keepLines);
  return s.replace(/(^|[\s;,{}()])\/\/[^\n]*/g, (m, p) => p + keepLines(m.slice(p.length)));
}
function scan(patterns, skip = () => false, only = null) {
  const hits = [];
  for (const f of servedFiles().filter(f => !only || only.test(f))) {
    code(f).split("\n").forEach((line, i) => {
      if (isComment(line) || skip(f, line)) return;
      for (const re of patterns) if (re.test(line)) hits.push(`${f}:${i + 1} ${re} → ${line.trim().slice(0, 100)}`);
    });
  }
  return hits;
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** dictionary value "key": "..." in an i18n file (first match) */
function dict(file, key) {
  const m = read(file).match(new RegExp('"' + esc(key) + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
  return m ? m[1].replace(/\\"/g, '"') : null;
}
/** Thai text of the element carrying data-i18n="key" in an html file */
function html(file, key) {
  const m = read(file).match(new RegExp('data-i18n="' + esc(key) + '"[^>]*>([^<]*)<'));
  return m ? m[1].trim() : null;
}
/** Thai fallback of T("key", "...") (or KT / engineT) in a script */
function fallback(file, key) {
  const m = read(file).match(new RegExp('["\']' + esc(key) + '["\']\\s*,\\s*"((?:[^"\\\\]|\\\\.)*)"'));
  return m ? m[1] : null;
}

/* ================= A: the button label ================= */
const LABEL = { th: "เล่าอีกแบบ", en: "Tell it another way", zh: "换个方式说说" };
const OLD_LABELS = [/อ่านอีกสำนวน/, /\bRephrase\b/, /\bReword it\b/, /换一种说法/];

test("A: the re-word button reads 'เล่าอีกแบบ' in all 7 places (static html and script fallbacks)", () => {
  for (const [page, id] of [["palm.html", "plRegen"], ["faceread.html", "frRegen"], ["fengshui.html", "fsAgain"], ["numbers.html", "nmAgain2"]]) {
    const m = read(page).match(new RegExp('<button[^>]*id="' + id + '"[^>]*>([^<]*)</button>'));
    assert.ok(m, page + " #" + id + " still present");
    assert.match(m[0], /data-i18n="fortune\.common\.regen"/, page + " keeps its key");
    assert.equal(m[1], LABEL.th, page);
  }
  assert.equal(fallback("tarot.js", "tarot.regen"), LABEL.th);
  assert.equal(fallback("fortune-kit.js", "fk.again"), LABEL.th);
  assert.equal(fallback("horoscope.js", "horoscope.x.again"), LABEL.th);
});

test("A: the EN / ZH dictionaries give 'Tell it another way' / '换个方式说说' for every button key", () => {
  for (const [file, keys] of [["i18n/en-fortune.js", ["fortune.common.regen", "fk.again"]], ["i18n/en-fortune-horoscope.js", ["horoscope.x.again"]], ["i18n/en-fortune-tarot.js", ["tarot.regen"]]]) {
    for (const k of keys) assert.equal(dict(file, k), LABEL.en, file + " " + k);
  }
  for (const [file, keys] of [["i18n/zh-fortune.js", ["fortune.common.regen", "fk.again"]], ["i18n/zh-fortune-horoscope.js", ["horoscope.x.again"]], ["i18n/zh-fortune-tarot.js", ["tarot.regen"]]]) {
    for (const k of keys) assert.equal(dict(file, k), LABEL.zh, file + " " + k);
  }
});

test("A: the old labels appear in no served file; no explanation sits next to the button", () => {
  assert.deepEqual(scan(OLD_LABELS), []);
  for (const [page, id] of [["palm.html", "plRegen"], ["faceread.html", "frRegen"]]) {
    const s = read(page), i = s.indexOf('id="' + id + '"');
    const row = s.slice(s.lastIndexOf('<div class="fa-actions">', i), s.indexOf("</div>", i));
    const btn = row.match(/<button[^>]*>[^<]*<\/button>/)[0];
    assert.doesNotMatch(row.replace(btn, "").replace(/<[^>]*>/g, " "), /[฀-๿a-zA-Z一-鿿]/, page + ": no text beside the button");
  }
});

/* ================= B: the 16 machinery sentences ================= */
const MACHINE = {
  th: /ระบบ|โมเดล|เรียบเรียง|ตัวประมวลผล|ประมวลผล|สุ่ม|อัลกอริทึม|ผลวัด|\.js\b/,
  en: /\bsystem\b|\bmodels?\b|\bcompos(?:e|er|ing|ed)\b|\bprocessor\b|\brandom|\balgorithm|\.js\b|\bpreparing the system\b/i,
  zh: /系统|模型|处理器|处理方式|随机|撰写|整理|组织|生成器|算法|\.js/,
};
// nothing may claim a human reader is present
const HUMAN = {
  th: /หมอดู|ผู้อ่านดวง|ดิฉัน|(?:^|\s)ผม(?:จะ|ขอ|ว่า)|(?:^|\s)ฉัน|(?:^|\s)เรา(?:จะ|ขอ|ช่วย|ดู)/,
  en: /\bI\b|\bI'll\b|\bwe\b|\bour\b|\bus\b|fortune[- ]?teller|\bastrologer\b|\breader\b/i,
  zh: /我|算命先生|大师|师傅|老师/,
};
/** one row per sentence: where its TH / EN / ZH text lives, and what it must still tell the user */
const ITEMS = [
  { n: "1a", th: () => html("fortune.html", "pd.f.palm.p"), en: () => dict("i18n/en-products.js", "pd.f.palm.p"), zh: () => dict("i18n/zh-products.js", "pd.f.palm.p") },
  { n: "1b", th: () => html("fortune.html", "fortune.hub.card.palm.desc"), en: () => dict("i18n/en-fortune-hub.js", "fortune.hub.card.palm.desc"), zh: () => dict("i18n/zh-fortune-hub.js", "fortune.hub.card.palm.desc") },
  { n: "2a", th: () => html("fortune.html", "fortune.hub.card.dream.desc"), en: () => dict("i18n/en-fortune-hub.js", "fortune.hub.card.dream.desc"), zh: () => dict("i18n/zh-fortune-hub.js", "fortune.hub.card.dream.desc"),
    need: { th: /ไม่มีเลข/, en: /no numbers/i, zh: /不提供/ } },
  { n: "2b", th: () => (read("dream.html").match(/data-i18n-attr="content:dream\.metaDesc"\s+content="([^"]*)"/) || [])[1], en: () => dict("i18n/en-fortune-dream.js", "dream.metaDesc"), zh: () => dict("i18n/zh-fortune-dream.js", "dream.metaDesc") },
  { n: "2c", th: () => (read("dream.html").match(/property="og:description"\s+content="([^"]*)"/) || [])[1] },
  { n: "3", th: () => html("palm.html", "palm.lead"), en: () => dict("i18n/en-fortune.js", "palm.lead"), zh: () => dict("i18n/zh-fortune.js", "palm.lead") },
  { n: "4", th: () => html("palm.html", "palm.honest1"), en: () => dict("i18n/en-fortune-palm.js", "palm.honest1"), zh: () => dict("i18n/zh-fortune-palm.js", "palm.honest1"),
    need: { th: /ไม่ชัด/, en: /unclear|not clear/i, zh: /不够清楚|不清楚/ } },
  { n: "5", th: () => (read("palm-kb.js").match(/k: "ทั้งสองมือ", t: "([^"\\]*(?:\\.[^"\\]*)*)"/) || [])[1], en: () => dict("i18n/en-fortune-palm.js", "palm.kb.hands.tradition.2.t"), zh: () => dict("i18n/zh-fortune-palm.js", "palm.kb.hands.tradition.2.t") },
  { n: "6a", th: () => (read("palm.html").match(/id="plEngine"[^>]*>([^<]*)</) || [])[1], en: () => dict("i18n/en-fortune-palm.js", "palm.eng.prep"), zh: () => dict("i18n/zh-fortune-palm.js", "palm.eng.prep") },
  { n: "6b", th: () => fallback("palm.js", "palm.eng.loading"), en: () => dict("i18n/en-fortune-palm.js", "palm.eng.loading"), zh: () => dict("i18n/zh-fortune-palm.js", "palm.eng.loading"),
    need: { th: /รอ|กำลัง/, en: /moment|\.\.\.|…/i, zh: /稍候|正在/ } },
  { n: "6c", th: () => fallback("palm.js", "palm.eng.modelFail"), en: () => dict("i18n/en-fortune-palm.js", "palm.eng.modelFail"), zh: () => dict("i18n/zh-fortune-palm.js", "palm.eng.modelFail"),
    need: { th: /แตะจุด/, en: /\btap\b/i, zh: /点/ } },
  { n: "7a", th: () => fallback("faceread.js", "faceread.eng.opening"), en: () => dict("i18n/en-fortune-faceread.js", "faceread.eng.opening"), zh: () => dict("i18n/zh-fortune-faceread.js", "faceread.eng.opening"),
    need: { th: /กล้อง/, en: /camera/i, zh: /摄像头|相机/ } },
  { n: "7b", th: () => fallback("faceread.js", "faceread.eng.loading"), en: () => dict("i18n/en-fortune-faceread.js", "faceread.eng.loading"), zh: () => dict("i18n/zh-fortune-faceread.js", "faceread.eng.loading"),
    need: { th: /รอ|กำลัง/, en: /moment|\.\.\.|…/i, zh: /稍候|正在/ } },
  { n: "7c", th: () => fallback("faceread.js", "faceread.eng.uploading"), en: () => dict("i18n/en-fortune-faceread.js", "faceread.eng.uploading"), zh: () => dict("i18n/zh-fortune-faceread.js", "faceread.eng.uploading"),
    need: { th: /รูป/, en: /photo/i, zh: /照片/ } },
  { n: "7d", th: () => fallback("faceread.js", "faceread.eng.switching"), en: () => dict("i18n/en-fortune-faceread.js", "faceread.eng.switching"), zh: () => dict("i18n/zh-fortune-faceread.js", "faceread.eng.switching") },
  { n: "7e", th: () => (read("faceread.js").match(/modelSlow: "([^"]*)"/) || [])[1], en: () => dict("i18n/en-fortune-faceread.js", "faceread.eng.modelSlow"), zh: () => dict("i18n/zh-fortune-faceread.js", "faceread.eng.modelSlow"),
    need: { en: /Upload photo/, zh: /上传照片/ } },
  { n: "7f", th: () => (read("faceread.js").match(/modelFail2: "([^"]*)"/) || [])[1], en: () => dict("i18n/en-fortune-faceread.js", "faceread.eng.modelFail2"), zh: () => dict("i18n/zh-fortune-faceread.js", "faceread.eng.modelFail2"),
    need: { en: /Upload photo/, zh: /上传照片/ } },
  { n: "7g", en: () => dict("i18n/en-fortune-faceread.js", "faceread.eng.prep"), zh: () => dict("i18n/zh-fortune-faceread.js", "faceread.eng.prep") },
  { n: "8a", th: () => fallback("faceread.js", "faceread.eng.camReadyAuto"), en: () => dict("i18n/en-fortune-faceread.js", "faceread.eng.camReadyAuto"), zh: () => dict("i18n/zh-fortune-faceread.js", "faceread.eng.camReadyAuto"),
    need: { th: /วงรี[\s\S]*3-2-1/, en: /oval[\s\S]*3-2-1/, zh: /椭圆[\s\S]*3-2-1/ } },
  { n: "8b", th: () => fallback("faceread.js", "faceread.eng.camReadyRear"), en: () => dict("i18n/en-fortune-faceread.js", "faceread.eng.camReadyRear"), zh: () => dict("i18n/zh-fortune-faceread.js", "faceread.eng.camReadyRear"),
    need: { th: /วงรี[\s\S]*3-2-1/, en: /oval[\s\S]*3-2-1/, zh: /椭圆[\s\S]*3-2-1/ } },
  { n: "10a", th: () => fallback("fortune-kit.js", "fk.loading"), en: () => dict("i18n/en-fortune.js", "fk.loading"), zh: () => dict("i18n/zh-fortune.js", "fk.loading"), need: { th: /รอ/, en: /moment/i, zh: /稍候/ } },
  { n: "10b", th: () => fallback("palm.js", "palm.narr.loading"), en: () => dict("i18n/en-fortune-palm.js", "palm.narr.loading"), zh: () => dict("i18n/zh-fortune-palm.js", "palm.narr.loading"), need: { th: /รอ/, en: /moment/i, zh: /稍候/ } },
  { n: "10c", th: () => fallback("faceread.js", "faceread.narr.local"), en: () => dict("i18n/en-fortune-faceread.js", "faceread.narr.local"), zh: () => dict("i18n/zh-fortune-faceread.js", "faceread.narr.local"), need: { th: /รอ/, en: /moment/i, zh: /稍候/ } },
  { n: "10d", th: () => fallback("horoscope.js", "horoscope.x.composing"), en: () => dict("i18n/en-fortune-horoscope.js", "horoscope.x.composing"), zh: () => dict("i18n/zh-fortune-horoscope.js", "horoscope.x.composing"), need: { th: /รอ/, en: /moment/i, zh: /稍候/ } },
  { n: "10e", th: () => fallback("tarot.js", "tarot.composing"), en: () => dict("i18n/en-fortune-tarot.js", "tarot.composing"), zh: () => dict("i18n/zh-fortune-tarot.js", "tarot.composing"), need: { th: /รอ/, en: /moment/i, zh: /稍候/ } },
  { n: "10f", th: () => fallback("numbers.js", "numbers.loading"), en: () => dict("i18n/en-fortune-numbers.js", "numbers.loading"), zh: () => dict("i18n/zh-fortune-numbers.js", "numbers.loading"), need: { th: /รอ/, en: /moment/i, zh: /稍候/ } },
  { n: "11", th: () => (read("numbers.js").match(/"(ทิศและคำพลัง[^"]*)"/) || [])[1], en: () => dict("i18n/en-fortune-numbers.js", "numbers.daily.n3"), zh: () => dict("i18n/zh-fortune-numbers.js", "numbers.daily.n3") },
  { n: "12", th: () => fallback("numbers.js", "numbers.noComposer"), en: () => dict("i18n/en-fortune-numbers.js", "numbers.noComposer"), zh: () => dict("i18n/zh-fortune-numbers.js", "numbers.noComposer"),
    need: { th: /โหลดหน้า(?:นี้)?ใหม่/, en: /reload/i, zh: /重新加载|刷新/ } },
  { n: "13", th: () => fallback("fengshui.js", "fengshui.readFail"), en: () => dict("i18n/en-fortune-fengshui.js", "fengshui.readFail"), zh: () => dict("i18n/zh-fortune-fengshui.js", "fengshui.readFail"),
    need: { th: /อีกครั้ง/, en: /again/i, zh: /再/ } },
  { n: "14a", th: () => html("zodiac.html", "zodiac.summary1"), en: () => dict("i18n/en-fortune.js", "zodiac.summary1"), zh: () => dict("i18n/zh-fortune.js", "zodiac.summary1") },
  { n: "14b", th: () => html("zodiac.html", "zodiac.birthHint"), en: () => dict("i18n/en-fortune-zodiac.js", "zodiac.birthHint"), zh: () => dict("i18n/zh-fortune-zodiac.js", "zodiac.birthHint") },
  { n: "15a", th: () => (read("fengshui-kb.js").match(/genderNote: "([^"]*)"/) || [])[1], en: () => dict("i18n/en-fortune-fengshui.js", "fengshui.genderNote"), zh: () => dict("i18n/zh-fortune-fengshui.js", "fengshui.genderNote") },
  { n: "15b", th: () => (read("fengshui-kb.js").match(/lichunNote: "([^"]*)"/) || [])[1], en: () => dict("i18n/en-fortune-fengshui.js", "fengshui.lichunNote"), zh: () => dict("i18n/zh-fortune-fengshui.js", "fengshui.lichunNote") },
  { n: "16", th: () => fallback("luckycolor.js", "lucky.eng.multi"), en: () => dict("i18n/en-luckycolor.js", "lucky.eng.multi"), zh: () => dict("i18n/zh-luckycolor.js", "lucky.eng.multi") },
];

test("B: every listed sentence exists in each of its languages, with no machinery talk and no human reader", () => {
  const bad = [];
  for (const it of ITEMS) {
    for (const lang of ["th", "en", "zh"]) {
      if (!it[lang]) continue;
      const s = it[lang]();
      if (!s || !s.trim()) { bad.push(it.n + "/" + lang + ": missing"); continue; }
      if (MACHINE[lang].test(s)) bad.push(it.n + "/" + lang + ": machinery " + MACHINE[lang].exec(s)[0] + " in " + s);
      if (HUMAN[lang].test(s)) bad.push(it.n + "/" + lang + ": human reader " + HUMAN[lang].exec(s)[0] + " in " + s);
      if (it.need && it.need[lang] && !it.need[lang].test(s)) bad.push(it.n + "/" + lang + ": lost what the user must still know (" + it.need[lang] + ") in " + s);
    }
  }
  assert.deepEqual(bad, []);
});

test("B: the old machinery wording is gone from every served file (TH / EN / ZH)", () => {
  const OLD = [
    /ระบบหาเส้นหลัก/, /ระบบหาสัญลักษณ์/, /ระบบไล่เส้น/, /ระบบจะเทียบ/, /ระบบจะเปรียบเทียบ/, /กำลังเตรียมระบบ/, /โมเดลจุดบนมือ/,
    /โมเดลวิเคราะห์ใบหน้า/, /โหลดโมเดล/, /ตัวประมวลผลสำรอง/, /ระบบจะนับ/, /จากสัดส่วนที่วัดได้บนใบหน้า/, /กำลังเรียบเรียงคำ/,
    /สุ่มจากวันที่/, /ตัวเรียบเรียงคำอ่าน/, /เรียบเรียงไม่สำเร็จ/, /ตัวเรียบเรียงในเครื่อง/, /ให้ระบบหาปีนักษัตร/, /ระบบจะใช้วันเกิด/,
    /ระบบจะแสดงทั้งสองแบบ/, /ระบบคำนวณวันลี่ชุน/, /ด้วยโมเดลในเครื่อง/,
    /the system finds/i, /we find its symbols/i, /the system traces/i, /the system compares/i, /hand landmark model/i,
    /face analysis model/i, /loading the model/i, /backup processor/i, /Composing (?:your|the) reading/i, /Preparing the reading/i,
    /are drawn from the date/i, /Reading composer/i, /Could not create the reading/i, /the system will work out/i,
    /the system uses it/i, /the system shows both/i, /The system derives/i, /on-device model/i, /Preparing the system/i,
    /系统帮你找出/, /系统自动找出/, /系统会自动描出/, /系统会比较/, /关键点模型/, /人脸分析模型/, /加载模型/, /备用处理方式/,
    /正在撰写解读/, /正在组织解读/, /正在整理解读/, /随机生成/, /解读生成器/, /生成解读失败/, /由系统推算/, /系统会以生日/,
    /系统会同时显示/, /系统根据太阳/, /设备上的模型/, /正在准备系统/,
  ];
  // the separate how-it-is-calculated lines (palm.how.model, palm.modelNote) are not in the list and stay
  assert.deepEqual(scan(OLD, (f, line) => /palm\.how\.model|palm\.modelNote|"palm\.how\.|palm\.raw\./.test(line), FORTUNE_FILE), []);
});

test("B item 12: no error message on a fortune page names a file", () => {
  const hits = [];
  for (const f of servedFiles().filter(f => /^(?:i18n\/(?:en|zh)-fortune|numbers|palm|faceread|fengshui|tarot|horoscope|fortune-kit|zodiac|dream|luckycolor)/.test(f))) {
    read(f).split("\n").forEach((line, i) => {
      if (isComment(line)) return;
      const m = line.match(/"([a-zA-Z.]*(?:noComposer|Fail|fail|err|Err|error|Error)[a-zA-Z0-9.]*)"\s*[:,]\s*"([^"]*)"/);
      if (m && /[\w-]+\.(?:js|json|onnx|mjs|wasm)\b/.test(m[2])) hits.push(`${f}:${i + 1} ${m[1]} → ${m[2]}`);
    });
  }
  assert.deepEqual(hits, []);
});

test("B item 11: the daily direction and word are the same all day for a birth weekday and change with the date (the sentence says so)", () => {
  const NM = require("../../numbers.js");
  const d = new Date(2026, 10, 23, 9), later = new Date(2026, 10, 23, 22);
  for (const wd of ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]) {
    const a = NM.dailyEnergy(wd, d), b = NM.dailyEnergy(wd, later);
    assert.equal(a.direction + "|" + a.word.w, b.direction + "|" + b.word.w, wd + ": same date, same result");
  }
  const seen = new Set();
  for (let i = 0; i < 14; i++) { const e = NM.dailyEnergy("sun", new Date(2026, 0, 1 + i)); seen.add(e.direction + "|" + e.word.w); }
  assert.ok(seen.size > 3, "changes from day to day");
  const th = NM.dailyEnergy("sun", d).notes.join(" ");
  assert.doesNotMatch(th, /สุ่ม/);
});

test("B item 9: the face-reading opener no longer says 'from the proportions measured on the face'", () => {
  global.PALM_KB = require("../../palm-kb.js");
  global.FR_KB = require("../../faceread-kb.js");
  assert.ok(!read("fortune-ai.js").includes("จากสัดส่วนที่วัดได้บนใบหน้า"));
});

/* ================= C: no AI label on the result ================= */
const LABELS = [
  /เรียบเรียงโดย\s*(?:ผู้ช่วยเขียน|AI|Claude)/, /\b(?:Composed|Phrased|Written|Arranged) by the writing assistant\b/i, /\b(?:Composed|Phrased|Written) by (?:AI|Claude)\b/i,
  /由写作助手[^"]{0,24}(?:撰写|整理|润色)/, /由\s*(?:AI|Claude)[^"]{0,12}(?:撰写|整理|润色)/,
];

test("C: no served file carries the 'composed by the writing assistant / AI (Claude)' label (TH / EN / ZH)", () => {
  assert.deepEqual(scan(LABELS), []);
});

test("C: no page sets a source label on the reading, and the label keys are gone from the dictionaries", () => {
  const hits = [];
  for (const f of servedFiles()) {
    const s = read(f);
    for (const k of ["palm.src.ai", "faceread.src.ai", "fk.src.ai", "horoscope.x.srcAI", "tarot.srcAI", "numbers.src.ai", "fengshui.src.ai"]) {
      if (s.includes('"' + k + '"')) hits.push(f + " " + k);
    }
  }
  assert.deepEqual(hits, []);
});

test("C: the shared renderer puts no label on an AI-written reading, whatever the caller asks", () => {
  global.PALM_KB = global.PALM_KB || require("../../palm-kb.js");
  global.FR_KB = global.FR_KB || require("../../faceread-kb.js");
  const FA = require("../../fortune-ai.js");
  const res = { source: "ai", lang: "th", sections: [{ id: "overview", title: "ภาพรวม", paragraphs: ["ข้อความทดสอบหนึ่งย่อหน้า"] }] };
  for (const opts of [{}, { aiBadge: true }, { aiBadge: "เรียบเรียงโดย AI" }, { domain: "fengshui" }]) {
    const h = FA.toHTML(res, opts);
    assert.ok(h.includes("ข้อความทดสอบหนึ่งย่อหน้า"), "the reading itself is shown");
    assert.doesNotMatch(h, /fa-ai-badge|Claude|Anthropic|ผู้ช่วยเขียน|เรียบเรียงโดย/, JSON.stringify(opts));
  }
});

test("C: the consent step and the privacy / terms / help notices still name the writing assistant (untouched by entry 23)", () => {
  assert.match(read("fortune-ai.js"), /const CONSENT_TEXT = "ให้ผู้ช่วยเขียน \(Claude โดย Anthropic\) ช่วยเรียบเรียงคำทำนาย/);
  assert.match(read("numbers.html"), /ผู้ช่วยเขียนคำทำนาย \(Claude โดย Anthropic สหรัฐอเมริกา\)/);
  assert.match(read("fengshui.html"), /ผู้ช่วยเขียนคำทำนาย \(Claude โดย Anthropic สหรัฐอเมริกา\)/);
  assert.match(dict("i18n/en-fortune-numbers.js", "numbers.consent"), /Claude by Anthropic/);
  assert.match(dict("i18n/zh-fortune-numbers.js", "numbers.consent"), /Anthropic 的 Claude/);
  assert.match(dict("i18n/en-common.js", "pdpa.ai.consent"), /Claude by Anthropic/);
  assert.match(read("privacy.html"), /ผู้ช่วยเขียนคำทำนาย \(Claude โดย Anthropic\)/);
  assert.match(read("terms.html"), /ผู้ช่วยเขียนคำทำนาย \(Claude โดย Anthropic\)/);
  assert.match(read("help.html"), /Claude โดย Anthropic/);
});

test("C: docs/LEGAL-PACKET.md asks the lawyer whether consent + privacy notice is enough, and to check the AI provider's terms", () => {
  const s = read("docs/LEGAL-PACKET.md");
  assert.match(s, /คำทำนายที่เขียนโดย AI ไม่มีป้ายบนผล/);
  assert.match(s, /ขั้นยินยอม/);
  assert.match(s, /ประกาศความเป็นส่วนตัว/);
  assert.match(s, /เพียงพอหรือไม่/);
  assert.match(s, /เงื่อนไขการใช้งานของผู้ให้บริการ AI[^\n]*เปิดเผย/);
});

test("all: nothing in the new wording says or implies that a human fortune teller wrote the reading or is present", () => {
  const add = [LABEL.th, LABEL.en, LABEL.zh];
  for (const s of add) for (const lang of ["th", "en", "zh"]) assert.doesNotMatch(s, HUMAN[lang]);
  assert.deepEqual(scan([/หมอดู(?:จะ|กำลัง)(?:เล่า|อ่าน|ดู)ให้/, /\bthe (?:fortune[- ]?teller|reader) (?:is|will)\b/i, /算命先生(?:正在|会)/]), []);
});
