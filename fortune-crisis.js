/* fortune-crisis.js — the crisis net of every fortune page (TH / EN / ZH): check() (hard net: the card), soft() / softName()
 * (the gentle "are you okay?" step), fields(), the page / tab calm and crisis state, allow(). Thai is matched without spaces and
 * tone marks on the canonical copy (lensiq-thai-canon.js), traditional Chinese folded to simplified, English slang / leetspeak.
 * The card wording, calm filter, hope frame and calm top button are in fortune-crisis-calm.js, loaded on demand (see below).
 * Rules: docs/CRISIS-FLOW-V2.md; the commented history of each pattern is in git (before 2026-11-16).
 * REVIEW: patterns and wording still need a review by a Thai mental-health professional (L63). */
(function (root) {
  "use strict";
  const TONE = /[็-์]/g;
  /** @param {RegExp} re */
  const toneless = re => new RegExp(re.source.replace(TONE, ""), re.flags);
  const TC = typeof module !== "undefined" && module.exports && typeof require === "function" ? require("./lensiq-thai-canon.js") : null;
  /** @param {any} s @returns {string} */
  const canon = s => { const C = TC || root.LQThaiCanon; return C ? C.canon(s) : String(s == null ? "" : s).normalize("NFC"); };
  const TH = [
    /ฆ่าตัว(?:ตาย)?|อยาก(?:จะ)?(?:ไป)?(?:ต(?:า|ั)ย(?!ตัว)|die)|ไม่อยาก(?:มีชีวิต(?:อยู่)?|อยู่(?:แล้ว|ต่อ|บนโลก)|ตื่น(?:ขึ้นมา)?อีก|หายใจ)|อยากหายไป(?:จากโลก)?/,
    /อยากไปเกิดใหม่|ไปจากโลกนี้|(?:จะ|อยาก)ไปให้พ้น|ไม่อยากเป็นภาระ|(?:ทุกคน|คนอื่น|ครอบครัว)[^\s]{0,6}(?:สบาย|ดี|มีความสุข)(?:ขึ้น)?[^\s]{0,4}(?:ถ้า|หาก)(?:ไม่มี|ขาด)(?:ฉัน|หนู|ผม|เรา|กู)/,
    /เชือก[^\s]{0,14}(?:จบ|ตาย)|(?:คืนนี้|วันนี้)(?:จะ|ขอ)จบ(?!งาน|โปรเจ|เรื่อง|การ)|เผาถ่าน/,
    /จับ(?:ตัว)?(?:หนู|ฉัน|ผม)[^\s]{0,14}(?:ไม่เหมาะสม|กลางคืน|ตอนนอน|ในห้อง)|จับตัวหนู/,
    /อยากนอน(?:หลับ)?(?:แล้ว|ไป)?(?:ไม่|ไม่ต้อง)ตื่น|ไม่อยากตื่น|ชีวิต(?:นี้)?ไม่มี(?:ความหมาย|ค่า)|(?:ควร|อยาก)จบ(?:ทุกอย่าง|ทุกสิ่ง|มันซะ|ชีวิต)|จบชีวิต|คิดสั้น/,
    /ทำร้ายตัวเอง|ทำร้ายตนเอง|กรีด(?:ข้อมือ|แขน|ตัวเอง)|ปลิดชีพ|กินยา(?:ตาย|เกินขนาด|ฆ่าตัว)|(?:กิน|ทาน)ยา(?:นอนหลับ|ฆ่าแมลง|พิษ|เบื่อ)|ยาพิษ|ผูกคอ|แขวนคอ/,
    /(?:โดด|กระโดด)(?:ตึก|สะพาน|น้ำตาย|ลงจาก|จากตึก|จากที่สูง|ลงมาตาย)/,
    /(?:ถูก|โดน)(?:ทำร้าย(?:ร่างกาย)?|ทุบตี|ตบตี|ซ้อม|ข่มขืน|ล่วงละเมิด|ลวนลาม|ทารุณ|กักขัง|อนาจาร)|ข่มขืน|ล่วงละเมิดทางเพศ|อนาจาร|ความรุนแรงในครอบครัว/,
    /ไม่อยาก(?:เป็น)?อยู่(?:ใน|บน)?โลก|ไม่อยาก(?:เป็น)?อยู่(?:แล้ว|ต่อ|อีกต่อไป)|อยาก(?:นอน|หลับ)(?:หลับ)?(?:แล้ว|ไป)?(?:ไม่|ไม่ต้อง)ตื่น/,
    /อยาก(?:จะ)?(?:ไป)?(?:ตุย|ม่องเท่ง)|จดหมายลาตาย|ลาโลก|ตาย(?:ๆ)?ไป(?:ซะ|เสีย)(?:ดีกว่า)?|ตายๆไป|ยาฆ่าหญ้า|ยาเบื่อหนู/,
    /ขู่(?:จะ)?ฆ่า|มีด(?:มา)?จ่อ|(?:แฟน|สามี|ภรรยา|ผัว|เมีย|พ่อ|แม่|พ่อเลี้ยง|แม่เลี้ยง)[^\s]{0,10}บีบคอ/,
    /ขืนใจ|บังคับ(?:ให้)?(?:หนู|ฉัน|ผม)?(?:ถอด|แก้)(?:เสื้อ|กางเกง|ผ้า)|แอบดู(?:หนู|ฉัน|ผม)?(?:อาบน้ำ|แก้ผ้า|เปลี่ยนเสื้อ)|จับ(?:หน้าอก|ของสงวน|นม(?!แม่))/,
    new RegExp("(?:แฟน|สามี|ภรรยา|ผัว|เมีย|พ่อ|แม่|พ่อเลี้ยง|แม่เลี้ยง|ลุง|น้า|อา|พี่ชาย|ครู|ญาติ)[^\\s]{0,16}?" +
      "(?:ตบ(?!มุก)|ตี(?!กอล์ฟ|เทนนิส|ลูกบอล|กลอง|ราคา|ความ)|ทุบ|ต่อย|เตะ|กระทืบ|ชก|ฟาด|หวด|เฆี่ยน|ทำร้าย|ซ้อม|บีบคอ|" +
      "ข่มขืน|ลวนลาม|ล่วงละเมิด|จับ(?:หน้าอก|ของสงวน))[^\\s]{0,8}?(?:ฉัน|หนู|ผม|เรา|ดิฉัน|กู)"),
    /(?:กิน|ทาน|กลืน)ยา[^\s]{0,6}(?:ให้หมด|ทั้ง)(?:ขวด|แผง|กระปุก|กล่อง)|(?:จะ|อยาก)(?:กิน|ทาน|กลืน)ยา[^\s]{0,6}หมด(?:ขวด|แผง|กระปุก|กล่อง)(?!ตาม)/,
    /อยู่ไป(?:ก็)?(?:เป็นภาระ|ไม่มีประโยชน์|เปล่าประโยชน์|ไร้ค่า)|เป็นภาระ[^\s]{0,10}(?:ไปให้พ้น|หายไป|ตายไป|ไม่อยู่)/,
    /จดหมายลา(?!ออก|ป่วย|งาน|กิจ|พัก|บวช|คลอด|เรียน|หยุด|ศึกษา|ไปเรียน|เที่ยว)|เขียน(?:จดหมาย|โน้ต)?ลา(?:ทุกคน|โลก|ครั้งสุดท้าย)/,
    /อยาก(?:หลับ|นอน)(?:ไป|ยาว)?(?:ตลอดกาล|ตลอดไป|ชั่วนิรันดร์|ไม่ต้องตื่น)/,
    /(?:พรุ่งนี้|คืนนี้|วันนี้|ต่อไป|หลังจากนี้)(?:ก็)?(?:จะ)?ไม่มี(?:ฉัน|หนู|ผม|เรา|กู|ดิฉัน)(?:อยู่)?(?:แล้ว|อีก(?:แล้ว|ต่อไป)?|บนโลก)/,
    /(?:ดูด|สูด|ดม)(?:แก๊ส|แก็ส|ก๊าซ|ควันท่อ|ควันรถ|ควันถ่าน)[^\s]{0,8}(?:ตาย|ในรถ|ให้หมด)|รมควัน(?:ตัวเอง)?ในรถ/,
    /(?:want|wanna|gonna|goingto)(?:to|2)?(?:ตาย|ตุย|ม่องเท่ง|จบชีวิต|ฆ่าตัวตาย)/i,
    /เตรียม(?:เชือก|ถ่าน)|เตรียมยา(?:นอนหลับ|ฆ่าแมลง|พิษ)|เตรียมยา[^\s]{0,12}(?:หลายแผง|หลายขวด|ทีเดียว|ให้หมด)|ยา[^\s]{0,16}(?:กิน|ทาน|กลืน)[^\s]{0,4}(?:ทีเดียว|รวดเดียว)/,
    /ตั้งใจ(?:กิน|ทาน|กลืน)[^\s]{0,8}(?:ให้หมด|ทีเดียว|รวดเดียว)|จบ[^\s]{0,10}ด้วยมือ(?:ของ)?(?:ตัวเอง|ตนเอง)|ไม่มีเหตุผล(?:ที่)?(?:จะ)?(?:อยู่|มีชีวิต)/,
    /ไม่อยาก(?:live|exist|bealive|alive|stayalive)/i,
    /(?:เก็บ|สะสม|ตุน)ยา[^\s]{0,12}(?:หลายแผง|หลายขวด|หลายกล่อง|เป็นกล่อง|เป็นกำ|ไว้เยอะ)|(?:กิน|ทาน|กลืน)ยา[^\s]{0,6}หมด(?:แผง|ขวด|กระปุก|กล่อง)(?!ตาม)/,
    /ดาดฟ้า[^\s]{0,26}(?:กระโดด|โดด)|(?:กระโดด|โดด)(?:ลง)?(?:จาก)?(?:ตึก|สะพาน|ดาดฟ้า|ที่สูง)|(?:ซื้อ|เตรียม)เชือก(?:มา)?(?:แล้ว|ไว้แล้ว|ไว้ใน(?:ห้อง|บ้าน))/,
    new RegExp(String.raw`(?:บุหรี่|ไฟแช็ก|ไฟแช็ค|เหล็กร้อน)[^\s]{0,6}(?:จี้|ลน|นาบ)[^\s]{0,6}(?:แขน|ขา|มือ|ตัว)|(?:มีด|ใบมีด|คัตเตอร์)[^\s]{0,4}(?:กรีด` +
      String.raw`|แทง|เฉือน|ปาด)(?:แขน|ข้อมือ|ขา|คอ|ตัวเอง)|(?:แทง|กรีด)(?:คอ|แขน|ข้อมือ)?ตัวเอง`),
    new RegExp(String.raw`(?:พ่อเลี้ยง|แม่เลี้ยง|ลุง|น้า|อา|ครู|พี่ชาย|ญาติ|พ่อ)[^\s]{0,6}(?:แตะต้อง|ลูบคลำ|ลูบ|จับ)(?:ตัว)?(?:หนู` +
      String.raw`|ฉัน|ผม)|(?:สามี|ผัว|แฟน|เมีย|ภรรยา|พ่อ|แม่|พ่อเลี้ยง|แม่เลี้ยง)[^\s]{0,4}ขู่(?:ว่า)?(?:จะ)?ฆ่า`),
    /(?:พ่อ|แม่|สามี|ผัว|แฟน|พ่อเลี้ยง|แม่เลี้ยง|ลุง|ป้า)[^\s]{0,3}ตี(?:หนู|ฉัน|ผม|เรา)?ด้วย(?:ไม้แขวนเสื้อ|เข็มขัด|ไม้|สายไฟ|ไม้เรียว)/,
    new RegExp(String.raw`วางแผน[^\s]{0,30}(?:วันสุดท้าย|จะจากไป)|(?:หลับ|นอน)[^\s]{0,10}ไม่(?:ต้อง)?ตื่น(?:มา|ขึ้นมา)?(?:อีก)?(?:เลย)?(?:คง` +
      String.raw`|ก็)?ดี|ตาย[^\n]{0,30}อยากให้(?:มัน)?เป็น(?:เรื่อง)?จริง|จบมัน(?:เลย|ซะ(?:ที)?)ดีกว่า`),
    /\bcut(?:แขน|ข้อมือ|ตัวเอง)|jump(?:off)?(?:ลง)?(?:จาก)?(?:ตึก|สะพาน|ดาดฟ้า)/i,
  ].map(toneless);
  const EN = [
    /\bno (?:reason|point) (?:to|in) (?:keep(?:ing)? )?(?:living|live|go(?:ing)? on|be(?:ing)? alive|stay(?:ing)? alive)\b|\bnothing (?:left )?to live for\b/i,
    /\b(?:life|living) (?:is ?n['’]?t|is not|ain['’]?t) worth (?:living|it)\b|\bnot worth living\b|\bdone with (?:life|living)\b/i,
    /\b(?:shoot|hang|drown|stab|poison|gas|electrocute) myself\b|\bend (?:my|this) (?:suffering|pain)\b/i,
    /\b(?:bought|got|have|saved(?: up)?|collected|stocked up on|ready) (?:a |the |some |enough |all the )?(?:rope|pills)\b|\bwan(?:t(?:ed)?|na) (?:to |2 )?di+e+\b/i,
    /\bend(?:ing)? (?:it all|everything)\b|\bdone for good\b|\bno point anymore\b|\bctb\b|\bcheck(?:ing)? out (?:of life|for good|permanently)\b/i,
    /\b(?:standing |sitting )?(?:on|at) (?:the )?(?:edge of (?:the )?)?(?:bridge|roof|rooftop|ledge)\b.{0,24}\b(?:right now|tonight|jump)\b|\bstanding on the (?:bridge|roof|rooftop|ledge)\b/i,
    /\b(?:going to|gonna|will|about to|want to) jump(?: off)?\b(?! (?:rope|start|in|on board|into))|\bjump(?: off)? (?:\w+ )?tonight\b/i,
    new RegExp(String.raw`\b(?:took|taken|swallowed|downed) (?:all|every one of) (?:my|the) (?:meds|medication|medicine|pills|tablets)\b` +
      String.raw`|\bhow many (?:paracetamol|tylenol|panadol|pills|sleeping pills|tablets)\b.{0,24}\b(?:take|kill|enough` +
      String.raw`|overdose)\b`, "i"),
    /\bwr(?:ote|itten) (?:the |my )?(?:goodbye|suicide|farewell|last) (?:notes?|letters?)\b|\bwr(?:ote|itten) the notes? for my family\b/i,
    /\bburn(?:ing|ed|s)? (?:my ?self|my (?:arms?|skin|wrists?|legs?))\b|\bcigarette burns?\b|\bburning myself\b/i,
    new RegExp(String.raw`\b(?:dad|father|mom|mum|mother|stepdad|stepmom|stepfather|stepmother|uncle|brother|husband|boyfriend|partner)\b[^.]{0,20}\b(?:beats` +
      String.raw`|hits|whips|kicks|touches|starves|locks) (?:me|us)\b(?! up)|\bstarv(?:es|ed|ing) (?:me|us)\b|\block(?:s` +
      String.raw`|ed)? (?:me|us) (?:in|up)\b`, "i"),
    /\b(?:want(?:s|ed|ing)?|wanna|going) (?:to|2) die\b|\bwanna die\b|\bkill (?:my ?self|myself)\b|\bkms\b|\bunalive\b|\bend (?:my|my own) life\b|\bsuicidal\b/i,
    /\bdon'?t want to (?:be here|exist|live|be alive|wake up)\b|\bjump(?:ing)? off (?:a|the) (?:bridge|building|roof|cliff)\b|\bbetter off dead\b/i,
    /\btake (?:all|all of) (?:my|the) (?:pills|meds|tablets|sleeping pills)\b|\bhang myself\b|\bslit my wrists?\b/i,
    /\bkys\b|\bbetter off without me\b|\brather (?:not be alive|be dead|not exist|not wake up)\b/i,
    /\bwant (?:it|everything) (?:all )?to (?:stop|end)(?: forever)?\b(?! well| happily)/i,
    /\b(?:plan(?:ning)?|going|gonna) to end it\b(?! with| between| off)|\bend(?:ing)? things\b(?! with| between| off| on)|\bstockpil\w* (?:pills|meds|tablets|sleeping pills)\b/i,
    /\bmakes? me do things\b|\bwo xiang (?:qu )?si\b|\bbu xiang huo\b/i,
    /\bsuicid\w*|\bunaliv\w*|\bsewer ?slide\b|\boff myself\b|\bdon'?t (?:want to|wanna) (?:be alive|live|exist|be here)\b/i,
    /\b(?:no|don'?t see the|what'?s the) point (?:in |of )?(?:living|being alive|life|going on)\b|\bsleep forever\b|\bnever wake up\b/i,
    /\bgoodbye (?:letters?|notes?)\b|\bsuicide note\b|\bplanning my exit\b|\b(?:bought|got|have) (?:a )?rope\b|\b(?:how many|how much)\b[^.?]{0,40}\b(?:to|2) die\b/i,
    /\bthreaten\w* to kill me\b|\bforced (?:himself|herself|themselves) on me\b|\bcomes? into my (?:room|bed) at night\b|\bnudes?\b[^.]{0,40}\bsecret\b|\bsends? me nudes?\b/i,
    /\bSA'?d\b|\bgot SA\b|\bnude pics\b/,
    /\bk[i1!]l{1,2} ?(?:my ?self|myslef|mysefl|meself)\b|\b(?:sucide|sucid\w+|suicde\w*|suiside\w*|suicied|sucicid\w*|suiscid\w*|suisid\w*|sooicid\w*)\b/i,
    new RegExp("\\b(?:my )?(?:bf|gf|boyfriend|girlfriend|husband|wife|partner|dad|father|mom|mum|mother|step-?dad|step-?father|step-?mom|step-?mother|uncle|brother|teacher|coach|cousin|grandpa)" +
      " (?:\\w+ )?(?:hits|hit|beats|beat|punches|punched|kicks|kicked|slaps|slapped|chokes|choked|abuses|abused|rapes|raped|touches|touched) me\\b(?!\\s+(?:at|in|to|up|on|off)\\b)" +
      "(?!\\s+with (?:a |an |the )?(?:surprise|news|question|idea|joke|gift|compliment|party))", "i"),
  ];
  const ZH = [
    /(?:楼顶|天台|楼上|桥上)[^。]{0,8}跳|(?:用刀|拿刀|刀片)[^。]{0,3}(?:划|割|刺)自己|(?:割|划伤)自己|想s(?![a-z])|自sha|威胁(?:说)?要杀(?:了)?我|一睡不醒|再也不(?:要)?醒|消失算了|消失就好/i,
    /了结(?:自己|此生|生命|我自己|一切)|了断(?:自己|此生)?|准备(?:好)?了?(?:绳子|药|炭|刀)|活着没有?(?:任何)?理由|没有活下去的理由/,
    /自杀|自尽|轻生|想死(?!的心|你|您|妳)|活不下去|活着没意思|活着好累|不想(?:再)?醒来|想消失|结束一切|结束(?:自己的)?生命|自残|自伤|割腕|跳楼|寻死|吞药|服药过量|家暴|家庭暴力|性侵|强奸/,
    /被(?:人)?(?:打|殴打|袭击|虐待|性侵|强奸|侵犯|猥亵)/,
    /想去死|一了百了|离开(?:这个)?(?:世界|人世)|不想活|安眠药|上吊|烧炭|跳河|跳桥|卧轨|(?:楼|窗|桥)(?:上)?跳下/,
    /(?:男朋友|男友|老公|丈夫|爸爸|爸|妈妈|妈|继父|继母|哥哥|叔叔|舅舅|姑父|姨父|表哥|他|她)[^。，]{0,12}?(?:打|揍|殴打|虐待|掐|踢|扇|抽)我(?!电话|手机)/,
    /(?:继父|叔叔|舅舅|姑父|姨父|爸爸|老师|哥哥|表哥|他)[^。，]{0,10}(?:摸|猥亵|性侵)我/,
    /结束这一切|死了算了|不如死了|人间不值得|遗书|割(?:手)?腕|一整瓶药|吃一整瓶|强迫我?(?:发生关系|做爱|上床)|摸我下面/,
    /죽고\s?싶|자살|\b(?:nak|mahu|ingin) mati\b|bunuh diri|muốn chết|tự tử|tự sát|消えて(?:しまい)?たい/i,
    /没有我[^。]{0,8}更好/,
    /死にたい|消えたい|自殺したい|生きていたくない|死のう/,
    /生无可恋(?!脸|表情|的表情)|(?:想|要|去|准备|打算)紫砂(?!壶|杯|锅|陶)|伤害自己|弄伤自己|划伤自己|伤自己/,
  ];
  /** @type {Record<string, string>} */
  const T2S = { 殺: "杀", 殘: "残", 結: "结", 輕: "轻", 樓: "楼", 從: "从", 經: "经", 繼: "继", 離: "离", 開: "开", 這: "这", 個: "个", 傷: "伤", 為: "为", 對: "对",
    媽: "妈", 強: "强", 姦: "奸", 藥: "药", 過: "过", 會: "会", 沒: "没", 義: "义", 時: "时", 讓: "让", 動: "动", 橋: "桥", 頂: "顶", 後: "后", 來: "来", 說: "说",
    話: "话", 無: "无", 戀: "恋", 毆: "殴", 決: "决", 斷: "断", 盡: "尽", 尋: "寻", 燒: "烧", 掛: "挂", 臥: "卧", 軌: "轨", 師: "师", 褻: "亵", 跡: "迹", 剎: "刹", 襲: "袭", 擊: "击",
    著: "着", 撐: "撑", 遺: "遗", 書: "书", 發: "发", 關: "关", 係: "系", 間: "间", 帶: "带", 頸: "颈", 腳: "脚",
    脅: "胁", 準: "准", 備: "备", 繩: "绳", 別: "别", 條: "条", 訊: "讯", 見: "见", 們: "们", 麼: "么", 夢: "梦", 歡: "欢" };
  const T2S_RE = new RegExp("[" + Object.keys(T2S).join("") + "]", "g");
  /** @param {any} text */
  /** @type {Record<string, string>} */
  const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", "@": "a", $: "s" };
  const COMPACT = /wanttodie|wannadie|wantodie|killmyself|endmylife|iwanttodie|suicide|kms|kys/;
  /** @param {string} t */
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
  const JOKE = /อยาก\s*(?:จะ\s*)?ตาย\s*(?:เพราะ\s*|จน\s*)?(?:หัวเราะ|ขำ|ตลก)(?!\s*ไม่)/g;
  /** @param {any} text */
  const unjoke = text => canon(text).replace(JOKE, " ");
  /** @param {any} text */
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
  const FREE_TEXT = 'textarea, input:not([type]), input[type="text"], input[type="search"]';
  /** @param {any} [doc] */
  function fields(doc) {
    try {
      const d = doc || root.document;
      if (!d || typeof d.querySelectorAll !== "function") return "";
      return Array.from(d.querySelectorAll(FREE_TEXT)).map(e => String((e && e.value) || "")).filter(Boolean).join("\n");
    } catch (e) { return ""; }
  }
  const SOFT = [
    toneless(/ตาย|ตุย|ลาโลก|เป็นภาระ|ลาก่อน|จดหมายลา|หลับไปตลอด|แก๊ส|เหนื่อย[^\s]{0,12}ไม่ไหว|ทน[^\s]{0,8}ไม่ไหว|ไม่ไหวแล้ว|กลัว|ทำร้าย|จับ[^\s]{0,6}หนู|เบื่อโลก|ไร้ค่า|อยากหายไป|เจ็บปวด/),
    /\b(?:die|died|dying|dead|death|kill\w*|suicid\w*|end it|can'?t do this|hurts? me|touch(?:es|ed)? me|rope|pills|secret|hopeless|worthless|pointless|kil|sucid\w*|only way out|goodbye forever)\b/i,
    /死|自杀|走了|结束|生无可恋|紫砂|伤害自己|打我|摸我|强迫|遗书|撑不下去|活着|没意义|죽|消え|\bmati\b|chết/i,
  ];
  const IDIOMS = [toneless(/(?:หิว|ร้อน|ขำ|ง่วง|หนาว|อร่อย|สวย|น่ารัก|ตลก|เผ็ด|เมื่อย|เบื่อ|หอม|ฮา|หนัก)(?:จน)?(?:แทบ)?(?:จะ)?ตาย(?:อยู่แล้ว|แล้ว|เลย)?/g),
    toneless(new RegExp(String.raw`(?<!อยาก|จะ)[^\sอ]{0,10}แทบ(?:จะ)?ตาย|(?<!อยาก|จะ|ไม่)ตายแล้ว[!！]*(?=ลืม|เผลอ|พลาด|สาย|ทำ(?:ของ)?หาย|โทรศัพท์)` +
      String.raw`|(?:แมว|หมา|สุนัข|ปลา|นก|กระต่าย|ต้นไม้)(?:ที่บ้าน|ของ(?:ฉัน|เรา|หนู|ผม))?ตาย`, "g")),
    /\bstarving(?: to death)?\b|\bkill(?:ed|ing)? it\b|\bdrop[- ]dead \w+|\b(?:phone|laptop|battery|car|computer|tv|printer|plant)s? (?:just |has |have )?(?:died|is dead|is dying)\b/gi,
    new RegExp(String.raw`\bdying (?:of|from) (?:laughter|laughing)\b|\bdying to (?:know|see|try|hear|meet|go|find out|read|get)\b|` +
      String.raw`\b(?:traffic|heat|weather|work|job|homework|exams?|commute|deadlines?|this|it|wait(?:ing)?|suspense|boss|cold|noise|joke|cramp)\b[^.?!]{0,12}\b(?:is|are|was) killing me\b|` +
      String.raw`\b(?:could|would|'d) kill for\b|\bkilling it\b|\bdead tired\b|\b(?:bored|scared|worried|tickled|freezing) to death\b|\b(?:this|that) joke killed me\b`, "gi"),
    /(?:笑|饿|热|困|冷|忙|吓|气|渴|烦|累)死(?:了|我了|人了|啦)?|想死(?:你|您|你们|妳)(?:了|啦)?/g];
  /** @param {string} t */
  const idiomBase = (/** @type {string} */ t) => { const x = /[\u4e00-\u9fff]/.test(t) ? t.replace(T2S_RE, c => T2S[c]) : t; return x.replace(/\s+(?=[ก-๛])|(?<=[ก-๛])\s+/g, "").replace(TONE, ""); };
  const unidiom = (/** @type {string} */ t) => { let x = idiomBase(t); for (const re of IDIOMS) x = x.replace(re, " "); return x; };
  const hasIdiom = (/** @type {string} */ t) => { const x = idiomBase(t); return IDIOMS.some(re => { re.lastIndex = 0; const r = re.test(x); re.lastIndex = 0; return r; }); };
  const FORTUNE_CTX = [/ไพ่(?:ใบ)?ความตาย|ไพ่\s*Death|ฝัน[^\n]{0,30}/g,
    /\b(?:the )?Death(?=[^.?]{0,25}\bcards?\b)|\bDeath card\b|\bDeath (?:reversed|upright)\b|\bdream\w*\b[^.?]{0,50}|\bdead tired\b|\bkill(?:ing)? (?:time|it)\b/gi,
    /死神牌?|梦见[^。？]{0,12}|梦到[^。？]{0,12}|夢見[^。？]{0,12}|夢到[^。？]{0,12}/g];
  /** @param {any} text */
  function soft(text) {
    let t = unjoke(text);
    for (const re of FORTUNE_CTX) t = t.replace(re, " ");
    t = unidiom(t);
    const th = t.replace(/\s+/g, "").replace(TONE, ""), zh = t.replace(T2S_RE, c => T2S[c]).replace(/\s+/g, "");
    return SOFT[0].test(th) || SOFT[1].test(enCopy(t)) || SOFT[2].test(zh) || FAREWELL.some(re => re.test(th) || re.test(t) || re.test(zh));
  }
  const FAREWELL = [toneless(new RegExp(String.raw`คงไม่ได้(?:เจอ(?:กัน)?|กลับมา)(?:อีก)?แล้ว|ฝาก(?:ดูแล|เลี้ยง)(?:แมว|หมา|สุนัข|ลูก)|คงไม่ได้เจอ(?:กัน)?อีก|` +
    String.raw`ครั้งสุดท้าย(?:ก่อน|ที่ได้)|สุดท้ายก่อนไป|จดหมายถึง[^\s]{0,12}ไว้แล้ว`)),
    new RegExp(String.raw`\b(?:this is )?my (?:last|final) (?:message|goodbye|post|words|note)\b|\b(?:good)?bye (?:everyone|everybody` +
      String.raw`|world|all)\b|\bfinal goodbye\b|\b(?:look after|take care of) my (?:dog|cat|pets?|kids?) (?:when|after) I'?m gone\b`, "i"),
    /永别|再见了.{0,8}最后|这是(?:我)?最后一次|最后一条(?:消息|信息)|遗言/];
  const NAME_DISTRESS = [toneless(/กลัว|เหนื่อย|ช่วยด้วย|ช่วยที|เจ็บ|ร้องไห้|เศร้า|ทนไม่|ไม่ไหว|ตาย|โดน|ถูกทำ|ทำร้าย|เกลียด|เหงา/),
    /\b(?:help|scared|afraid|alone|hurt|hurts|pain|cry|crying|hate|kill|die|dead|abuse\w*|hit|hits|beat|beats|tired|sad|lonely|unsafe|please)\b/i,
    /救|怕|痛|疼|哭|累|打我|死|孤单|难过|伤心|想你/];
  const NAME_ORDINARY = [toneless(/ไหม|มั้ย|หรือเปล่า|อย่างไร|ยังไง|เมื่อไร|งาน|ตำแหน่ง|สอบ|ปีนี้|เดือน|ดวง|ฝัน|ไพ่|โชค|ความรัก|เงิน/),
    /\?\s*$|\b(?:job|career|work|exams?|promotion|interview|business|shop|money|love|marriage|year|month|lucky|luck|cards?|tarot|dream\w*|funeral|horoscope|zodiac|mean)\b/i,
    /吗|么|什么|怎么|如何|运|梦|牌|工作|升职|考试|今年|代表/];
  const NAME_TH = toneless(/(?:ฉัน|หนู|ผม|กู|เรา|ดิฉัน)(?:อยาก|จะ|ไม่|กลัว|เหนื่อย|รู้สึก|โดน|ถูก|ต้อง)|อยาก|ไม่|ช่วยด้วย|กลัว|เหนื่อย/);
  const NAME_EN = /\b(?:i|i'm|im|me|my|myself|you|we|he|she|they|want|wanna|need|help|hate|kill|die|am|is|are|was|can'?t|don'?t|please)\b/i;
  const NAME_ZH = /我|你|他|她|想|要|不|死|打|救/;
  /** @param {any} name */
  function softName(name) {
    const n = canon(name).trim();
    if (!n) return false;
    if (soft(n)) return true;
    let n0 = unjoke(n);
    for (const re of FORTUNE_CTX) n0 = n0.replace(re, " ");
    n0 = unidiom(n0);
    const th0 = n0.replace(/\s+/g, "").replace(TONE, ""), zh0 = n0.replace(T2S_RE, c => T2S[c]);
    if (NAME_DISTRESS[0].test(th0) || NAME_DISTRESS[1].test(n0) || NAME_DISTRESS[2].test(zh0)) return true;
    const zhN = n.replace(T2S_RE, c => T2S[c]);
    if (hasIdiom(n) || unjoke(n) !== n || NAME_ORDINARY[0].test(n.replace(/\s+/g, "").replace(TONE, "")) || NAME_ORDINARY[1].test(n) || NAME_ORDINARY[2].test(zhN)) return false;
    return n.split(/\s+/).length > 3 || NAME_TH.test(n.replace(/\s+/g, "").replace(TONE, "")) || NAME_EN.test(n) || NAME_ZH.test(n) ||
      (/\d/.test(n) && /\p{L}/u.test(n)) || soft(n);
  }
  /** @param {any} name */
  function plainName(name) {
    const n = String(name == null ? "" : name).trim();
    return n && n.length <= 40 && !softName(n) && !check(n) ? n : "";
  }
  const NAME_FIELDS = "#hsName, #hsPName, #hsNameNum, #frNick, #plNick, #nmName, #rpName";
  /** @param {any} [doc] */
  function pageSoft(doc) {
    const all = fields(doc);
    if (!all || all === answered) return false;
    if (soft(all)) return true;
    try {
      const d = doc || root.document;
      return Array.from(d.querySelectorAll(NAME_FIELDS)).some(e => softName(e && e.value));
    } catch (e) { return false; }
  }
  let answered = "";
  /** @param {any} [doc] */
  const ack = doc => { answered = fields(doc); setCalm(doc); };
  /** @type {Record<string, Record<string, string>>} */
  const SOFT_TEXT = {
    th: { title: "ข้อความนี้ฟังดูหนักใจ คุณโอเคไหม?", body: "ถ้ามีเรื่องหนักใจ มีคนพร้อมรับฟังเสมอ ถ้าแค่อยากดูดวง เลือกด้านล่างได้เลย",
      talk: "อยากคุยกับใคร", go: "แค่ถามดวง", qHidden: "(คำถามที่คุณพิมพ์ไว้)" },
    en: { title: "This sounds heavy — are you okay?", body: "If something is weighing on you, people are ready to listen. If you only want the reading, choose below.",
      talk: "I'd like to talk to someone", go: "Just the reading", qHidden: "(the question you typed)" },
    zh: { title: "这听起来很沉重，你还好吗？", body: "如果有心事，随时有人愿意倾听。如果只是想看解读，请在下面选择。", talk: "我想找人聊聊", go: "只是想算命", qHidden: "（你输入的问题）" },
  };
  const softText = (/** @type {string} */ lang) => SOFT_TEXT[lang === "en" || lang === "zh" ? lang : "th"];
  const SOFT_CSS = ".fa-soft{border:2px solid #fcd34d;border-radius:16px;padding:16px;margin:8px 0;background:rgba(252,211,77,.08)}.fa-soft h3{margin:0 0 .4em}" +
    ".fa-soft .fa-soft-act{display:flex;flex-wrap:wrap;gap:.6em;margin-top:.8em}.fa-soft button{min-height:44px;padding:.5em 1em;border-radius:12px;max-width:100%}";
  /** @param {any} box @param {string} lang @param {() => void} onGo @param {() => void} onTalk */
  function renderSoft(box, lang, onGo, onTalk) {
    const doc = box.ownerDocument || root.document, t = softText(lang || (root.LQI18N && root.LQI18N.lang) || "th");
    try {
      if (!doc.getElementById("fa-soft-style")) { const st = doc.createElement("style"); st.id = "fa-soft-style"; st.textContent = SOFT_CSS; doc.head.appendChild(st); }
    } catch (e) { /* no DOM */ }
    /** @param {string} tag @param {string} [text] */
    const el = (tag, text) => { const e = doc.createElement(tag); if (text) e.textContent = text; return e; };
    box.textContent = "";
    const sec = el("section"); sec.className = "fa-soft"; sec.setAttribute("role", "group");
    const h = el("h3", t.title), act = el("div"); act.className = "fa-soft-act";
    const talk = el("button", t.talk), go = el("button", t.go);
    talk.type = "button"; go.type = "button"; talk.className = "btn primary"; go.className = "btn ghost";
    talk.setAttribute("data-soft", "talk"); go.setAttribute("data-soft", "go");
    talk.addEventListener("click", () => onTalk()); go.addEventListener("click", () => onGo());
    act.appendChild(talk); act.appendChild(go); sec.appendChild(h); sec.appendChild(el("p", t.body)); sec.appendChild(act);
    box.appendChild(sec);
    try { h.tabIndex = -1; h.focus({ preventScroll: true }); } catch (e) { /* no DOM */ }
    return sec;
  }
  /** before a reading is drawn: ask first when needed; true when the step was shown
   *  @param {any} container @param {string} lang @param {() => void} proceed @param {(box: any) => void} card */
  function softGate(container, lang, proceed, card) {
    const doc = container && container.ownerDocument;
    if (!container || !pageSoft(doc)) return false;
    renderSoft(container, lang, () => { ack(doc); proceed(); }, () => card(container));
    return true;
  }

  const SESSION_KEY = "lq-fortune-calm";
  function sessionOn() { try { const st = root.sessionStorage; return !!(st && st.getItem(SESSION_KEY) === "1"); } catch (e) { return false; } }
  function sessionSet() { try { const st = root.sessionStorage; if (st) st.setItem(SESSION_KEY, "1"); } catch (e) { /* private mode: page-level only */ } }
  const CALM_CSS = "html[data-lq-calm] [data-lq-remedy],html[data-lq-calm] [data-lq-upsell],html[data-lq-crisis] [data-lq-upsell]{display:none!important}" +
    "html[data-lq-calm] [data-lq-straight],html[data-lq-calm] [data-lq-paid-link],html[data-lq-calm] a[href*=\"pricing.html\"]," +
    "html[data-lq-calm] a[href*=\"terms.html#t9\"]{display:none!important}" +
    "html[data-lq-calm] .fa-straight{display:none!important}" +
    "html[data-lq-calm] [data-lq-belief],html[data-lq-crisis] [data-lq-belief]{display:none!important}";
  /** @param {any} [doc] */
  function markCalm(doc) {
    const d = doc || root.document;
    if (!d || typeof d !== "object") return;
    try { if (d.documentElement && d.documentElement.setAttribute) d.documentElement.setAttribute("data-lq-calm", "1"); } catch (e) { /* no DOM */ }
    try {
      if (d.getElementById && !d.getElementById("lq-calm-style") && d.head) { const st = d.createElement("style"); st.id = "lq-calm-style"; st.textContent = CALM_CSS; d.head.appendChild(st); }
    } catch (e) { /* no DOM */ }
    try {
      if (d.body) calmTop(d);
      else if (typeof d.addEventListener === "function") d.addEventListener("DOMContentLoaded", () => calmTop(d), { once: true });
    } catch (e) { /* no DOM */ }
  }
  /** @param {any} [doc] */
  function setCalm(doc) { sessionSet(); markCalm(doc); }
  /** @type {WeakSet<object>|null} */
  const ACTIVE = typeof WeakSet !== "undefined" ? new WeakSet() : null;
  const CRISIS_CSS = "html[data-lq-crisis] [data-lq-remedy]{display:none!important}";
  /** @param {any} [doc] @returns {any} */
  const docOf = doc => doc || root.document || null;
  /** @param {any} [doc] */
  function active(doc) {
    const d = docOf(doc);
    if (!d) return false;
    if (ACTIVE && typeof d === "object" && ACTIVE.has(d)) return true;
    try { return !!(d.documentElement && d.documentElement.getAttribute && d.documentElement.getAttribute("data-lq-crisis") === "1"); } catch (e) { return false; }
  }
  /** @param {any} [doc] */
  function setActive(doc) {
    const d = docOf(doc);
    if (!d || typeof d !== "object") return;
    if (ACTIVE) ACTIVE.add(d);
    setCalm(d); // the session flag: every later fortune page in this tab is calm
    try { if (d.documentElement && d.documentElement.setAttribute) d.documentElement.setAttribute("data-lq-crisis", "1"); } catch (e) { /* no DOM */ }
    try {
      if (d.getElementById && !d.getElementById("lq-crisis-style") && d.head) { const st = d.createElement("style"); st.id = "lq-crisis-style"; st.textContent = CRISIS_CSS; d.head.appendChild(st); }
    } catch (e) { /* styles.css has the same rule */ }
    try { if (typeof root.dispatchEvent === "function" && typeof root.CustomEvent === "function") root.dispatchEvent(new root.CustomEvent("lq-crisis")); } catch (e) { /* no events */ }
  }
  /** may a renderer show this kind of content ("remedy" | "lucky" | "paid" | "merit" | "straight" | "reco" | "lead" | "share" |
   *  "belief" | "plan" | "price")? false while the page is calm or in the crisis state. crisis-v2-live: decision 23 (coordinator
   *  default ก) and CLAUDE.md hard limit 3 ("when it triggers no remedies, paid service or straight reading is shown"): free belief
   *  guidance (merit, prayer, ไหว้ไท้ส่วย, gems) is refused too (v2 had allowed it). Neutral colours ("colour") stay allowed.
   *  @param {string} kind @param {any} [doc] */
  const allow = (kind, doc) => kind === "colour" || kind === "color" || (!active(doc) && !calmOn(doc));
  /** @param {any} [doc] */
  function calmOn(doc) {
    if (active(doc) || sessionOn()) return true;
    const d = docOf(doc);
    try { return !!(d && d.documentElement && d.documentElement.getAttribute && d.documentElement.getAttribute("data-lq-calm") === "1"); } catch (e) { return false; }
  }
  /** the page's free-text fields hold crisis or distress words (or a name field holds more than a name); ignores ack()
   *  @param {any} [doc] */
  function distress(doc) {
    const all = fields(doc);
    if (all && (check(all) || soft(all))) return true;
    try { const d = docOf(doc); return !!d && Array.from(d.querySelectorAll(NAME_FIELDS)).some(e => softName(e && e.value)); } catch (e) { return false; }
  }

  /** the facts without what the reader typed (crisis flow v2: never echo it): no question, the nickname only when it is a plain name
   *  @param {any} facts @param {(t: any) => boolean} [isCrisis] the caller's crisis check (default: check) */
  function withoutTyped(facts, isCrisis) {
    if (!facts || typeof facts !== "object") return facts;
    const sub = Object.assign({}, facts.subject || {}), nick = sub.nickname;
    if (nick != null) { const plain = plainName(nick); if (plain && !(isCrisis || check)(plain)) sub.nickname = plain; else delete sub.nickname; }
    const out = Object.assign({}, facts, { subject: sub });
    delete out.question;
    return out;
  }
  /** @type {WeakMap<object, string>|null} the field values the reader continued past, per page (memory only) */
  const CONTINUED = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  /** the reader pressed "continue" on the card: these field values do not show the card (or the soft step) again
   *  @param {any} [doc] */
  function continued(doc) {
    const d = docOf(doc);
    if (!d || typeof d !== "object") return;
    const f = fields(d);
    if (CONTINUED) CONTINUED.set(d, f);
    answered = f;
    setCalm(d);
  }
  /** @param {any} [doc] */
  function acked(doc) {
    const d = docOf(doc);
    if (!d || typeof d !== "object" || !CONTINUED || !CONTINUED.has(d)) return false;
    return fields(d) === CONTINUED.get(d);
  }
  /** @param {any} [doc] */
  function pending(doc) { const f = fields(doc); return !!f && check(f) && !acked(doc); }


  // the calm part (fortune-crisis-calm.js) loads in a calm tab at once, else on the first touch of a free-text field; until it is
  // in, actions that could show a reading are held and replayed (fail closed; tests/e2e/crisis-cold-throttled.e2e.mjs)
  /** @type {any} */ let part = null;
  let inflight = false, waited = false;
  /** @type {(v?: any) => void} */ let done = () => {};
  const ready = new Promise(r => { done = r; });
  /** @type {{type: string, el: any, sub?: any}[]} */ const held = [];
  const SRC = (() => { try { const s = /** @type {any} */ (root.document && root.document.currentScript); return s && s.src ? String(s.src).replace(/[^/]*$/, "") : ""; } catch (e) { return ""; } })();
  /** start loading the calm part (once; retried after a failure) @returns {Promise<any>} */
  function need() {
    const d = root.document;
    if (part || inflight || !d || typeof d.createElement !== "function" || !d.head) return ready;
    inflight = true;
    const add = (/** @type {string} */ f, /** @type {boolean} */ main) => {
      const s = d.createElement("script"); s.src = SRC + f; s.async = false;
      if (main && s.addEventListener) s.addEventListener("error", () => { inflight = false; if (held.length || waited) setTimeout(need, 2000); });
      d.head.appendChild(s);
    };
    if (!root.LQHelpline) add("lensiq-helpline.js?v=1", false);
    add("fortune-crisis-calm.js?v=1", true);
    return ready;
  }
  /** the calm part (or anything that may draw a reading) is needed before this page's next action */
  const needs = () => !part && (calmOn() || !!fields().trim());
  const CLICKABLE = 'button, a[href], input, select, summary, label, [role="button"], [data-lq-continue]';
  /** @param {any} e */
  function gate(e) {
    if (part) return;
    const t = e.target;
    if (!t || t.nodeType !== 1 || typeof t.closest !== "function") return;
    if (t.matches(FREE_TEXT)) need(); // the reader is about to type: load now
    if (e.type === "focusin" || e.type === "pointerdown" || !needs()) return;
    let el = t;
    if (e.type === "click") { el = t.closest(CLICKABLE); if (!el || el.matches(FREE_TEXT)) return; }
    else if (e.type === "input" && !t.matches(FREE_TEXT)) return;
    need();
    if (e.cancelable) e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "input" || e.type === "change") { const i = held.findIndex(h => h.type === e.type && h.el === el); if (i >= 0) held.splice(i, 1); }
    held.push({ type: e.type, el, sub: e.submitter });
    try { el.setAttribute("aria-busy", "true"); } catch (x) { /* no DOM */ }
  }
  function replay() {
    for (const h of held.splice(0)) {
      try {
        h.el.removeAttribute("aria-busy");
        if (h.type === "click") h.el.click();
        else if (h.type === "submit") { try { h.el.requestSubmit(h.sub || undefined); } catch (x) { h.el.requestSubmit(); } }
        else h.el.dispatchEvent(new Event(h.type, { bubbles: true }));
      } catch (x) { /* element gone */ }
    }
  }
  /** @param {any} [doc] */
  const calmTop = doc => { if (part) return part.calmTop(doc); need().then(() => part && part.calmTop(doc)); return null; };
  const stubs = {
    calmTop,
    /** @param {any} c */ calmDock: c => { if (part) return part.calmDock(c); need().then(() => part && part.calmDock(c)); return null; },
    /** @param {any} t */ calmText: t => (need(), void t, ""),
    /** @param {any} t */ adviceKind: t => (need(), canon(t).trim() ? "remedy" : ""),
    fatalistic: () => (need(), true),
    hope: () => (need(), { open: "", close: "", reviewStatus: "pending-professional-review" }),
    /** @param {any} res */ calmReading: res => (need(), !res || res.crisis ? res
      : Object.assign({}, res, { sections: [], summary: undefined, why: undefined, plan: undefined, calm: true })),
  };
  const api = Object.assign({ check, unjoke, fields, soft, softName, plainName, pageSoft, ack, renderSoft, softGate, softText, active, setActive, allow,
    calmOn, setCalm, markCalm, distress, SESSION_KEY, continued, acked, pending, withoutTyped,
    // ready(typed): resolves at once, or once the calm part is in when a reading may need it
    /** @param {boolean} [typed] */ ready: typed => { waited = true; return part || !(typed || needs()) ? Promise.resolve(true) : need().then(() => true); }, loaded: () => !!part,
    /** @param {(c: any) => any} f */ __install: f => {
      if (part) return;
      part = f({ root, canon, calmOn, distress, markCalm });
      Object.assign(api, part); inflight = false; done(part);
      try { if (root.document && calmOn(root.document)) part.calmTop(root.document); } catch (e) { /* no DOM */ }
      replay();
    } }, stubs);
  if (typeof module !== "undefined" && module.exports) { api.__install(require("./fortune-crisis-calm.js")); module.exports = api; }
  else {
    /** @type {any} */ (root).LQFortuneCrisis = api;
    try {
      if (typeof root.addEventListener === "function") for (const t of ["click", "submit", "change", "input", "focusin", "pointerdown"]) root.addEventListener(t, gate, true);
      if (root.document && sessionOn()) markCalm(root.document);
      const d = root.document;
      if (d && typeof d.addEventListener === "function") d.addEventListener("DOMContentLoaded", () => { if (needs()) need(); }, { once: true });
    } catch (e) { /* no DOM */ }
  }
})(typeof window !== "undefined" ? window : globalThis);
