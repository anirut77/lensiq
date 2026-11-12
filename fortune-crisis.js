/* fortune-crisis.js — the widened crisis net for every fortune page (independent review 2026-11-12: the patterns in
 * fortune-ai.js caught 19/52 adversarial inputs). Loaded before fortune-ai.js; fortune-ai.js requires it in Node and keeps
 * its own original patterns as well, so the net never gets weaker if this file is missing.
 * check(text) runs on the RAW user text: Thai is matched without spaces and without tone marks (ฆาตัวตาย = ฆ่าตัวตาย),
 * traditional Chinese is folded to simplified (自殺 = 自杀), English is case-insensitive with common slang and numerals
 * ("kms", "unalive", "want 2 die"). Families: suicide and self-harm, wanting to disappear or not wake up, violence by a
 * partner or family member, sexual abuse (incl. of children). fields(doc) returns the text of every free-text field on
 * the page, so a phrase typed into a name box is caught as well as one typed into a question box.
 * Fixed tests (locked before this file was written): tests/unit/fortune-crisis-net.test.js, tests/e2e/fortune-crisis-fields.e2e.mjs.
 * REVIEW: like the support card, these patterns still need a review by a Thai mental-health professional. */
(function (root) {
  "use strict";
  const TONE = /[็-์]/g;
  /** Thai pattern written normally; matched against text with spaces and tone marks removed @param {RegExp} re */
  const toneless = re => new RegExp(re.source.replace(TONE, ""), re.flags);
  const TH = [
    /ฆ่าตัว(?:ตาย)?|อยาก(?:จะ)?(?:ไป)?(?:ต(?:า|ั)ย(?!ตัว)|die)|ไม่อยาก(?:มีชีวิต(?:อยู่)?|อยู่(?:แล้ว|ต่อ|บนโลก)|ตื่น(?:ขึ้นมา)?อีก|หายใจ)|อยากหายไป(?:จากโลก)?/,
    /อยากไปเกิดใหม่|ไปจากโลกนี้|(?:จะ|อยาก)ไปให้พ้น|ไม่อยากเป็นภาระ|(?:ทุกคน|คนอื่น|ครอบครัว)[^\s]{0,6}(?:สบาย|ดี|มีความสุข)(?:ขึ้น)?[^\s]{0,4}(?:ถ้า|หาก)(?:ไม่มี|ขาด)(?:ฉัน|หนู|ผม|เรา|กู)/,
    /เชือก[^\s]{0,14}(?:จบ|ตาย)|(?:คืนนี้|วันนี้)(?:จะ|ขอ)จบ(?!งาน|โปรเจ|เรื่อง|การ)|เผาถ่าน/,
    /จับ(?:ตัว)?(?:หนู|ฉัน|ผม)[^\s]{0,14}(?:ไม่เหมาะสม|กลางคืน|ตอนนอน|ในห้อง)|จับตัวหนู/,
    /อยากนอน(?:หลับ)?(?:แล้ว|ไป)?(?:ไม่|ไม่ต้อง)ตื่น|ไม่อยากตื่น|ชีวิต(?:นี้)?ไม่มี(?:ความหมาย|ค่า)|(?:ควร|อยาก)จบ(?:ทุกอย่าง|ทุกสิ่ง|มันซะ|ชีวิต)|จบชีวิต|คิดสั้น/,
    /ทำร้ายตัวเอง|ทำร้ายตนเอง|กรีด(?:ข้อมือ|แขน|ตัวเอง)|ปลิดชีพ|กินยา(?:ตาย|เกินขนาด|ฆ่าตัว)|(?:กิน|ทาน)ยา(?:นอนหลับ|ฆ่าแมลง|พิษ|เบื่อ)|ยาพิษ|ผูกคอ|แขวนคอ/,
    /(?:โดด|กระโดด)(?:ตึก|สะพาน|น้ำตาย|ลงจาก|จากตึก|จากที่สูง|ลงมาตาย)/,
    /(?:ถูก|โดน)(?:ทำร้าย(?:ร่างกาย)?|ทุบตี|ตบตี|ซ้อม|ข่มขืน|ล่วงละเมิด|ลวนลาม|ทารุณ|กักขัง|อนาจาร)|ข่มขืน|ล่วงละเมิดทางเพศ|อนาจาร|ความรุนแรงในครอบครัว/,
    new RegExp("(?:แฟน|สามี|ภรรยา|ผัว|เมีย|พ่อ|แม่|พ่อเลี้ยง|แม่เลี้ยง|ลุง|น้า|อา|พี่ชาย|ครู|ญาติ)[^\\s]{0,10}?" +
      "(?:ตบ(?!มุก)|ตี(?!กอล์ฟ|เทนนิส|ลูกบอล|กลอง|ราคา|ความ)|ทุบ|ต่อย|เตะ|กระทืบ|ชก|ทำร้าย|ซ้อม|บีบคอ|ข่มขืน|ลวนลาม|ล่วงละเมิด|จับ(?:หน้าอก|ของสงวน))[^\\s]{0,8}?(?:ฉัน|หนู|ผม|เรา|ดิฉัน|กู)"),
  ].map(toneless);
  const EN = [
    /\b(?:want(?:s|ed|ing)?|wanna|going) (?:to|2) die\b|\bwanna die\b|\bkill (?:my ?self|myself)\b|\bkms\b|\bunalive\b|\bend (?:my|my own) life\b|\bsuicidal\b/i,
    /\bdon'?t want to (?:be here|exist|live|be alive|wake up)\b|\bjump(?:ing)? off (?:a|the) (?:bridge|building|roof|cliff)\b|\bbetter off dead\b/i,
    /\btake (?:all|all of) (?:my|the) (?:pills|meds|tablets|sleeping pills)\b|\bhang myself\b|\bslit my wrists?\b/i,
    /\bkys\b|\bbetter off without me\b|\brather (?:not be alive|be dead|not exist|not wake up)\b/i,
    /\bwant (?:it|everything) (?:all )?to (?:stop|end)(?: forever)?\b(?! well| happily)/i,
    /\b(?:plan(?:ning)?|going|gonna) to end it\b(?! with| between| off)|\bend(?:ing)? things\b(?! with| between| off| on)|\bstockpil\w* (?:pills|meds|tablets|sleeping pills)\b/i,
    /\bmakes? me do things\b|\bwo xiang (?:qu )?si\b|\bbu xiang huo\b/i,
    new RegExp("\\b(?:my )?(?:bf|gf|boyfriend|girlfriend|husband|wife|partner|dad|father|mom|mum|mother|step-?dad|step-?father|step-?mom|step-?mother|uncle|brother|teacher|coach|cousin|grandpa)" +
      " (?:\\w+ )?(?:hits|hit|beats|beat|punches|punched|kicks|kicked|slaps|slapped|chokes|choked|abuses|abused|rapes|raped|touches|touched) me\\b(?!\\s+(?:at|in|to|up|on|off)\\b)" +
      "(?!\\s+with (?:a |an |the )?(?:surprise|news|question|idea|joke|gift|compliment|party))", "i"),
  ];
  const ZH = [
    /自杀|自尽|轻生|想死|活不下去|活着没意思|活着好累|不想(?:再)?醒来|想消失|结束一切|结束(?:自己的)?生命|自残|自伤|割腕|跳楼|寻死|吞药|服药过量|家暴|家庭暴力|性侵|强奸/,
    /被(?:人)?(?:打|殴打|袭击|虐待|性侵|强奸|侵犯|猥亵)/,
    /想去死|一了百了|离开(?:这个)?(?:世界|人世)|不想活|安眠药|上吊|烧炭|跳河|跳桥|卧轨|(?:楼|窗|桥)(?:上)?跳下/,
    /(?:男朋友|老公|丈夫|爸爸|爸|妈妈|妈|继父|继母|哥哥|叔叔|他|她)(?:经常|总是|一直|昨晚|又|天天|每天)?(?:打|揍|殴打|虐待|掐|踢|扇)我/,
    /(?:继父|叔叔|爸爸|老师|哥哥|他)[^。，]{0,10}(?:摸|猥亵|性侵)我/,
    /没有我[^。]{0,8}更好/,
    /死にたい|消えたい|自殺したい|生きていたくない|死のう/,
  ];
  // traditional → simplified for the characters these patterns use
  /** @type {Record<string, string>} */
  const T2S = { 殺: "杀", 殘: "残", 結: "结", 輕: "轻", 樓: "楼", 從: "从", 經: "经", 繼: "继", 離: "离", 開: "开", 這: "这", 個: "个", 傷: "伤", 為: "为", 對: "对",
    媽: "妈", 強: "强", 姦: "奸", 藥: "药", 過: "过", 會: "会", 沒: "没", 義: "义", 時: "时", 讓: "让", 動: "动", 橋: "桥", 頂: "顶", 後: "后", 來: "来", 說: "说",
    話: "话", 毆: "殴", 決: "决", 斷: "断", 盡: "尽", 尋: "寻", 燒: "烧", 掛: "挂", 臥: "卧", 軌: "轨", 師: "师", 褻: "亵", 跡: "迹", 剎: "刹", 襲: "袭", 擊: "击" };
  const T2S_RE = new RegExp("[" + Object.keys(T2S).join("") + "]", "g");
  /** true when the text shows a crisis signal @param {any} text */
  // English copies: leetspeak undone (0→o 1→i 3→e 4→a @→a $→s), spaces collapsed; letter-spaced runs ("I w a n t t o d i e") joined
  /** @type {Record<string, string>} */
  const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", "@": "a", $: "s" };
  const COMPACT = /wanttodie|wannadie|wantodie|killmyself|endmylife|iwanttodie|suicide|kms|kys/;
  /** runs of ≥ 4 single-letter tokens, each joined @param {string} t */
  function letterRuns(t) {
    const out = []; let run = [];
    for (const w of t.split(/\s+/).concat([""])) { if (/^[a-z]$/i.test(w)) run.push(w); else { if (run.length >= 4) out.push(run.join("").toLowerCase()); run = []; } }
    return out;
  }
  /** true when the text shows a crisis signal @param {any} text */
  function check(text) {
    const t = String(text == null ? "" : text).normalize("NFC");
    if (!t.trim()) return false;
    const th = t.replace(/บ่(?=\s*(?:อยาก|ไหว|อยู่|มี))/g, "ไม่").replace(/\s+/g, "").replace(TONE, "");
    const zh = t.replace(T2S_RE, c => T2S[c]).replace(/\s+/g, "");
    const leet = t.replace(/[0134@$]/g, c => LEET[c]).replace(/\s+/g, " ");
    return TH.some(re => re.test(th)) || EN.some(re => re.test(t) || re.test(leet)) || ZH.some(re => re.test(zh)) ||
      letterRuns(t.replace(/[0134@$]/g, c => LEET[c])).some(r => COMPACT.test(r));
  }
  const FREE_TEXT = 'textarea, input:not([type]), input[type="text"], input[type="search"]';
  /** the raw text of every free-text field on the page (empty without a DOM) @param {any} [doc] */
  function fields(doc) {
    try {
      const d = doc || root.document;
      if (!d || typeof d.querySelectorAll !== "function") return "";
      return Array.from(d.querySelectorAll(FREE_TEXT)).map(e => String((e && e.value) || "")).filter(Boolean).join("\n");
    } catch (e) { return ""; }
  }
  const api = { check, fields };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else /** @type {any} */ (root).LQFortuneCrisis = api;
})(typeof window !== "undefined" ? window : globalThis);
