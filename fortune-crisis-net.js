/* fortune-crisis-net.js — the crisis net (patterns + check), ONE source: copied into fortune-crisis.js (tools/fortune-read-embed.mjs);
 * the fortune-read.js stand-in loads it alone when fortune-crisis.js failed to load. Raw text: Thai without spaces / tone marks,
 * traditional Chinese folded, English slang and numerals. Tests: fortune-crisis-net*, crisis-net-fallback. Needs a professional review. */
(function (root) {
  "use strict";
  const TONE = /[็-์]/g;
  /** Thai pattern written normally; matched against text with spaces and tone marks removed @param {RegExp} re */
  const toneless = re => new RegExp(re.source.replace(TONE, ""), re.flags);
  /* review 2026-11-14: sara am ำ arrives decomposed (nikhahit + sara aa), with the tone mark after it, or with zero-width
     characters inside a word; every check runs on the canonical copy (lensiq-thai-canon.js, looked up at call time) */
  const TC = typeof module !== "undefined" && module.exports && typeof require === "function" ? require("./lensiq-thai-canon.js") : null;
  /** @param {any} s @returns {string} */
  const canon = s => { const C = TC || root.LQThaiCanon; return C ? C.canon(s) : String(s == null ? "" : s).normalize("NFC"); };
  const TH = [
    /ฆ่าตัว(?:ตาย)?|อยาก(?:จะ)?(?:ไป)?(?:ต(?:า|ั)ย(?!ตัว)|die)|ไม่อยาก(?:มีชีวิต(?:อยู่)?|อยู่(?:แล้ว|ต่อ|บนโลก)|ตื่น(?:ขึ้นมา)?อีก|หายใจ)|อยากหายไป(?:จากโลก)?/,
    /อยากไปเกิดใหม่|ไปจากโลกนี้|(?:จะ|อยาก)ไปให้พ้น|ไม่อยากเป็นภาระ|(?:ทุกคน|คนอื่น|ครอบครัว)[^\s]{0,6}(?:สบาย|ดี|มีความสุข)(?:ขึ้น)?[^\s]{0,4}(?:ถ้า|หาก)(?:ไม่มี|ขาด)(?:ฉัน|หนู|ผม|เรา|กู)/,
    /เชือก[^\s]{0,14}(?:จบ|ตาย)|(?:คืนนี้|วันนี้)(?:จะ|ขอ)จบ(?!งาน|โปรเจ|เรื่อง|การ)|เผาถ่าน/,
    /จับ(?:ตัว)?(?:หนู|ฉัน|ผม)[^\s]{0,14}(?:ไม่เหมาะสม|กลางคืน|ตอนนอน|ในห้อง)|จับตัวหนู/,
    /อยากนอน(?:หลับ)?(?:แล้ว|ไป)?(?:ไม่|ไม่ต้อง)ตื่น|ไม่อยากตื่น|ชีวิต(?:นี้)?ไม่มี(?:ความหมาย|ค่า)|(?:ควร|อยาก)จบ(?:ทุกอย่าง|ทุกสิ่ง|มันซะ|ชีวิต)|จบชีวิต|คิดสั้น/,
    /จะจบ(?:ทุกอย่าง|ทุกสิ่ง)(?:แล้ว|เลย|คืนนี้|วันนี้|ซะ)/, // review round 2
    /ทำร้ายตัวเอง|ทำร้ายตนเอง|กรีด(?:ข้อมือ|แขน|ตัวเอง)|ปลิดชีพ|กินยา(?:ตาย|เกินขนาด|ฆ่าตัว)|(?:กิน|ทาน)ยา(?:นอนหลับ|ฆ่าแมลง|พิษ|เบื่อ)|ยาพิษ|ผูกคอ|แขวนคอ/,
    /(?:โดด|กระโดด)(?:ตึก|สะพาน|น้ำตาย|ลงจาก|จากตึก|จากที่สูง|ลงมาตาย)/,
    /(?:ถูก|โดน)(?:ทำร้าย(?:ร่างกาย)?|ทุบตี|ตบตี|ซ้อม|ข่มขืน|ล่วงละเมิด|ลวนลาม|ทารุณ|กักขัง|อนาจาร)|ข่มขืน|ล่วงละเมิดทางเพศ|อนาจาร|ความรุนแรงในครอบครัว/,
    // round 3 (review 2026-11-12): more ways to say it, plans and methods, threats, sexual abuse of children
    /ไม่อยาก(?:เป็น)?อยู่(?:ใน|บน)?โลก|ไม่อยาก(?:เป็น)?อยู่(?:แล้ว|ต่อ|อีกต่อไป)|อยาก(?:นอน|หลับ)(?:หลับ)?(?:แล้ว|ไป)?(?:ไม่|ไม่ต้อง)ตื่น/,
    /อยาก(?:จะ)?(?:ไป)?(?:ตุย|ม่องเท่ง)|จดหมายลาตาย|ลาโลก|ตาย(?:ๆ)?ไป(?:ซะ|เสีย)(?:ดีกว่า)?|ตายๆไป|ยาฆ่าหญ้า|ยาเบื่อหนู/,
    /ขู่(?:จะ)?ฆ่า|มีด(?:มา)?จ่อ|(?:แฟน|สามี|ภรรยา|ผัว|เมีย|พ่อ|แม่|พ่อเลี้ยง|แม่เลี้ยง)[^\s]{0,10}บีบคอ/,
    /ขืนใจ|บังคับ(?:ให้)?(?:หนู|ฉัน|ผม)?(?:ถอด|แก้)(?:เสื้อ|กางเกง|ผ้า)|แอบดู(?:หนู|ฉัน|ผม)?(?:อาบน้ำ|แก้ผ้า|เปลี่ยนเสื้อ)|จับ(?:หน้าอก|ของสงวน|นม(?!แม่))/,
    new RegExp("(?:แฟน|สามี|ภรรยา|ผัว|เมีย|พ่อ|แม่|พ่อเลี้ยง|แม่เลี้ยง|ลุง|น้า|อา|พี่ชาย|ครู|ญาติ)[^\\s]{0,16}?" +
      "(?:ตบ(?!มุก)|ตี(?!กอล์ฟ|เทนนิส|ลูกบอล|กลอง|ราคา|ความ)|ทุบ|ต่อย|เตะ|กระทืบ|ชก|ฟาด|หวด|เฆี่ยน|ทำร้าย|ซ้อม|บีบคอ|" +
      "ข่มขืน|ลวนลาม|ล่วงละเมิด|จับ(?:หน้าอก|ของสงวน))[^\\s]{0,8}?(?:ฉัน|หนู|ผม|เรา|ดิฉัน|กู)"),
    // crisis fix 4 (fresh review 2026-11-12 misses, dev data): pills by the bottle, a burden, farewell letters, sleeping forever,
    // "tomorrow I won't be here", gas in a car, mixed English + Thai
    /(?:กิน|ทาน|กลืน)ยา[^\s]{0,6}(?:ให้หมด|ทั้ง)(?:ขวด|แผง|กระปุก|กล่อง)|(?:จะ|อยาก)(?:กิน|ทาน|กลืน)ยา[^\s]{0,6}หมด(?:ขวด|แผง|กระปุก|กล่อง)(?!ตาม)/,
    /อยู่ไป(?:ก็)?(?:เป็นภาระ|ไม่มีประโยชน์|เปล่าประโยชน์|ไร้ค่า)|เป็นภาระ[^\s]{0,10}(?:ไปให้พ้น|หายไป|ตายไป|ไม่อยู่)/,
    /จดหมายลา(?!ออก|ป่วย|งาน|กิจ|พัก|บวช|คลอด|เรียน|หยุด|ศึกษา|ไปเรียน|เที่ยว)|เขียน(?:จดหมาย|โน้ต)?ลา(?:ทุกคน|โลก|ครั้งสุดท้าย)/,
    /อยาก(?:หลับ|นอน)(?:ไป|ยาว)?(?:ตลอดกาล|ตลอดไป|ชั่วนิรันดร์|ไม่ต้องตื่น)/,
    /(?:พรุ่งนี้|คืนนี้|วันนี้|ต่อไป|หลังจากนี้)(?:ก็)?(?:จะ)?ไม่มี(?:ฉัน|หนู|ผม|เรา|กู|ดิฉัน)(?:อยู่)?(?:แล้ว|อีก(?:แล้ว|ต่อไป)?|บนโลก)/,
    /(?:ดูด|สูด|ดม)(?:แก๊ส|แก็ส|ก๊าซ|ควันท่อ|ควันรถ|ควันถ่าน)[^\s]{0,8}(?:ตาย|ในรถ|ให้หมด)|รมควัน(?:ตัวเอง)?ในรถ/,
    /(?:want|wanna|gonna|goingto)(?:to|2)?(?:ตาย|ตุย|ม่องเท่ง|จบชีวิต|ฆ่าตัวตาย)/i,
  ].map(toneless);
  const EN = [
    /\b(?:want(?:s|ed|ing)?|wanna|going) (?:to|2) die\b|\bwanna die\b|\bkill (?:my ?self|myself)\b|\bkms\b|\bunalive\b|\bend (?:my|my own) life\b|\bsuicidal\b/i,
    /\bdon'?t want to (?:be here|exist|live|be alive|wake up)\b|\bjump(?:ing)? off (?:a|the) (?:bridge|building|roof|cliff)\b|\bbetter off dead\b/i,
    /\btake (?:all|all of) (?:my|the) (?:pills|meds|tablets|sleeping pills)\b|\bhang myself\b|\bslit my wrists?\b/i,
    /\bkys\b|\bbetter off without me\b|\brather (?:not be alive|be dead|not exist|not wake up)\b/i,
    /\bwant (?:it|everything) (?:all )?to (?:stop|end)(?: forever)?\b(?! well| happily)/i,
    /\bend it all\b(?! with| between| off)/i, // review round 2: "gonna end it all tonight"
    // owner decision 105 ค (2026-11-18): BOTH "end it all" patterns. The line above OR this one: a first-person / intent word within
    // 25 characters before "end(ing) it all", or pills / rope / bridge / tonight / forever within 20 after (no with / between / off
    // exclusion here). Set: crisis-endall (synthetic). On the expert review list: docs/CRISIS-EXPERT-REVIEW.md
    new RegExp("\\b(?:i|i'm|im|i'll|ill|i've|ive|i'd|me|wanna|gonna|gotta|want(?:s|ed)? to|going to|ready to|decided to|time to|" +
      "planning to|plan to|might|just)\\b[^.!?\\n]{0,25}?\\bend(?:ing)? it all\\b|\\bend(?:ing)? it all\\b[^.!?\\n]{0,20}\\b(?:pills?|rope|bridge|tonight|forever)\\b", "i"),
    /\b(?:plan(?:ning)?|going|gonna) to end it\b(?! with| between| off)|\bend(?:ing)? things\b(?! with| between| off| on)|\bstockpil\w* (?:pills|meds|tablets|sleeping pills)\b/i,
    /\bmakes? me do things\b|\bwo xiang (?:qu )?si\b|\bbu xiang huo\b/i,
    /\bsuicid\w*|\bunaliv\w*|\bsewer ?slide\b|\boff myself\b|\bdon'?t (?:want to|wanna) (?:be alive|live|exist|be here)\b/i,
    /\b(?:no|don'?t see the|what'?s the) point (?:in |of )?(?:living|being alive|life|going on)\b|\bsleep forever\b|\bnever wake up\b/i,
    /\bgoodbye (?:letters?|notes?)\b|\bsuicide note\b|\bplanning my exit\b|\b(?:bought|got|have) (?:a )?rope\b|\b(?:how many|how much)\b[^.?]{0,40}\b(?:to|2) die\b/i,
    /\bthreaten\w* to kill me\b|\bforced (?:himself|herself|themselves) on me\b|\bcomes? into my (?:room|bed) at night\b|\bnudes?\b[^.]{0,40}\bsecret\b|\bsends? me nudes?\b/i,
    /\bSA'?d\b|\bgot SA\b|\bnude pics\b/,
    // crisis fix 4: misspellings ("kil myself", "sucide")
    /\bk[i1!]l{1,2} ?(?:my ?self|myslef|mysefl|meself)\b|\b(?:sucide|sucid\w+|suicde\w*|suiside\w*|suicied|sucicid\w*|suiscid\w*|suisid\w*|sooicid\w*)\b/i,
    new RegExp("\\b(?:my )?(?:bf|gf|boyfriend|girlfriend|husband|wife|partner|dad|father|mom|mum|mother|step-?dad|step-?father|step-?mom|step-?mother|uncle|brother|teacher|coach|cousin|grandpa)" +
      " (?:\\w+ )?(?:hits|hit|beats|beat|punches|punched|kicks|kicked|slaps|slapped|chokes|choked|abuses|abused|rapes|raped|touches|touched) me\\b(?!\\s+(?:at|in|to|up|on|off)\\b)" +
      "(?!\\s+with (?:a |an |the )?(?:surprise|news|question|idea|joke|gift|compliment|party))", "i"),
  ];
  const ZH = [
    /自杀|自尽|轻生|想死(?!的心)|活不下去|活着没意思|活着好累|不想(?:再)?醒来|想消失|结束一切|结束(?:自己的)?生命|自残|自伤|割腕|跳楼|寻死|吞药|服药过量|家暴|家庭暴力|性侵|强奸/,
    /被(?:人)?(?:打|殴打|袭击|虐待|性侵|强奸|侵犯|猥亵)/,
    /想去死|一了百了|离开(?:这个)?(?:世界|人世)|不想活|安眠药|上吊|烧炭|跳河|跳桥|卧轨|(?:楼|窗|桥)(?:上)?跳下/,
    /(?:男朋友|男友|老公|丈夫|爸爸|爸|妈妈|妈|继父|继母|哥哥|叔叔|舅舅|姑父|姨父|表哥|他|她)[^。，]{0,12}?(?:打|揍|殴打|虐待|掐|踢|扇|抽)我(?!电话|手机)/,
    /(?:继父|叔叔|舅舅|姑父|姨父|爸爸|老师|哥哥|表哥|他)[^。，]{0,10}(?:摸|猥亵|性侵)我/,
    /结束这一切|死了算了|不如死了|人间不值得|遗书|割(?:手)?腕|一整瓶药|吃一整瓶|强迫我?(?:发生关系|做爱|上床)|摸我下面/,
    /죽고\s?싶|자살|\b(?:nak|mahu|ingin) mati\b|bunuh diri|muốn chết|tự tử|tự sát|消えて(?:しまい)?たい/i,
    /没有我[^。]{0,8}更好/,
    /死にたい|消えたい|自殺したい|生きていたくない|死のう/,
    // crisis fix 4: "nothing left to live for", the homophone slang 紫砂 (= 自杀; not the teapot), hurting oneself
    /生无可恋(?!脸|表情|的表情)|(?:想|要|去|准备|打算)紫砂(?!壶|杯|锅|陶)|伤害自己|弄伤自己|划伤自己|伤自己/,
  ];
  // traditional → simplified for the characters these patterns use
  /** @type {Record<string, string>} */
  const T2S = { 殺: "杀", 殘: "残", 結: "结", 輕: "轻", 樓: "楼", 從: "从", 經: "经", 繼: "继", 離: "离", 開: "开", 這: "这", 個: "个", 傷: "伤", 為: "为", 對: "对",
    媽: "妈", 強: "强", 姦: "奸", 藥: "药", 過: "过", 會: "会", 沒: "没", 義: "义", 時: "时", 讓: "让", 動: "动", 橋: "桥", 頂: "顶", 後: "后", 來: "来", 說: "说",
    話: "话", 無: "无", 戀: "恋", 毆: "殴", 決: "决", 斷: "断", 盡: "尽", 尋: "寻", 燒: "烧", 掛: "挂", 臥: "卧", 軌: "轨", 師: "师", 褻: "亵", 跡: "迹", 剎: "刹", 襲: "袭", 擊: "击",
    著: "着", 撐: "撑", 遺: "遗", 書: "书", 發: "发", 關: "关", 係: "系", 間: "间", 帶: "带", 頸: "颈", 腳: "脚" };
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
  /** English copy (round 3): ! → i, "-" / "." between letters dropped (k-m-s), runs of ≥ 3 single letters joined in place ("d i e")
   *  @param {string} t */
  function enCopy(t) {
    const words = t.replace(/!/g, "i").replace(/([a-z])[-.](?=[a-z])/gi, "$1").replace(/[0134@$]/g, c => LEET[c]).split(/\s+/), out = []; let run = [];
    for (const w of words.concat([""])) {
      if (/^[a-z]$/i.test(w)) { run.push(w); continue; }
      if (run.length >= 3) out.push(run.join("")); else out.push(...run);
      run = []; if (w) out.push(w);
    }
    return out.join(" ");
  }
  /* crisis fix 4: "อยากตายเพราะหัวเราะ" (dying of laughter) is a joke idiom, not a crisis signal: that exact idiom is taken out
     before the hard net; the rest of the text is still checked, and the soft step still sees "ตาย" */
  const JOKE = /อยาก\s*(?:จะ\s*)?ตาย\s*(?:เพราะ\s*|จน\s*)?(?:หัวเราะ|ขำ|ตลก)(?!\s*ไม่)/g;
  /** the text without the dying-of-laughter idiom @param {any} text */
  const unjoke = text => canon(text).replace(JOKE, " ");
  /** true when the text shows a crisis signal @param {any} text */
  function check(text) {
    const t = unjoke(text);
    if (!t.trim()) return false;
    const th = t.replace(/(?:บ่|มะ|หม่าย|ม่าย)(?=\s*(?:อยาก|ไหว|อยู่|มี))/g, "ไม่").replace(/\s+/g, "").replace(TONE, "");
    const zh = t.replace(T2S_RE, c => T2S[c]).replace(/\s+/g, "");
    const leet = t.replace(/[0134@$]/g, c => LEET[c]).replace(/\s+/g, " ");
    const en2 = enCopy(t);
    return TH.some(re => re.test(th)) || EN.some(re => re.test(t) || re.test(leet) || re.test(en2)) || ZH.some(re => re.test(zh)) || ZH.some(re => re.test(t)) ||
      letterRuns(t.replace(/[0134@$]/g, c => LEET[c])).some(r => COMPACT.test(r));
  }
  const NET = { check, unjoke, canon, toneless, enCopy, TONE, T2S, T2S_RE };
  if (typeof module !== "undefined" && module.exports && !Object.keys(module.exports).length) module.exports = NET;
  /** @type {any} */ (root).LQCrisisNet = NET;
})(typeof window !== "undefined" ? window : globalThis);
