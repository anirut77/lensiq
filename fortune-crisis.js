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
    // detection v2 (owner decision item 7, 2026-11-13; dev data: the 2026-11-13 review's misses, spent): preparing the means,
    // "by my own hand", no reason to live, mixed Thai + English "ไม่อยาก live"
    /เตรียม(?:เชือก|ถ่าน)|เตรียมยา(?:นอนหลับ|ฆ่าแมลง|พิษ)|เตรียมยา[^\s]{0,12}(?:หลายแผง|หลายขวด|ทีเดียว|ให้หมด)|ยา[^\s]{0,16}(?:กิน|ทาน|กลืน)[^\s]{0,4}(?:ทีเดียว|รวดเดียว)/,
    /ตั้งใจ(?:กิน|ทาน|กลืน)[^\s]{0,8}(?:ให้หมด|ทีเดียว|รวดเดียว)|จบ[^\s]{0,10}ด้วยมือ(?:ของ)?(?:ตัวเอง|ตนเอง)|ไม่มีเหตุผล(?:ที่)?(?:จะ)?(?:อยู่|มีชีวิต)/,
    /ไม่อยาก(?:live|exist|bealive|alive|stayalive)/i,
    // detection v3 (review 2026-11-14, spent set as dev data): stockpiled / taken pills, rooftop, rope bought, burns and cuts,
    // abuse disclosures (touching, threats to kill, beatings with an object), a planned last day, not waking up, a death dream wished true
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
    // detection v4 (review 3 on fresh-2026-11-14b, spent: dev data): high-acuity families escalate to the card
    toneless(new RegExp(String.raw`ยานอนหลับ[^\s]{0,10}(?:สอง|สาม|สี่|หลาย|\d)แผง|(?:เก็บ|สะสม|ตุน)ยา[^\s]{0,14}(?:แผง|ขวด|กล่อง)[^\s]{0,8}(?:คืนนี้|วันนี้|พรุ่งนี้)|` +
      String.raw`กินยา[^\s]{0,6}(?:หลับยาว|หลับไม่ตื่น|หลับไปเลย|หลับไปตลอด)`, "i")),
    toneless(new RegExp(String.raw`ดาดฟ้า[^\s]{0,40}(?:ไม่ลงมา|ไม่กลับลงไป)|(?:ยืน|นั่ง)(?:อยู่)?(?:บน|ริม|ขอบ)(?:ดาดฟ้า|สะพาน|ตึก|ระเบียง)[^\s]{0,12}(?:ตอนนี้|ข้างล่าง|โดด|กระโดด|ลงไป)|` +
      String.raw`ขับรถ(?:ตก|พุ่งลง)(?:สะพาน|เหว|แม่น้ำ|คลอง)|ขับรถ(?:ลง|พุ่ง)(?:สะพาน|แม่น้ำ|คลอง|เหว)[^\s]{0,16}(?:ตอนตี|คืนนี้|ตอนนี้|ให้ตาย|ไปเลย)`, "i")),
    toneless(new RegExp(String.raw`(?:จุด|เผา)(?:เตา)?ถ่าน[^\s]{0,16}(?:ห้องปิด|ในห้อง|ในรถ|ปิดกระจก|ปิดประตู)|เอาหัว(?:โขก|กระแทก|ชน)(?:ผนัง|กำแพง|พื้น)[^\s]{0,10}(?:เลือด|จนเจ็บ)|` +
      String.raw`(?:คัตเตอร์|มีด|ใบมีด|มีดโกน)[^\s]{0,3}(?:กรีด|เฉือน|ปาด)(?:ต้นขา|ขา|แขน|ข้อมือ|ท้อง|ตัวเอง)`, "i")),
    toneless(new RegExp(String.raw`(?:แฟน|สามี|ผัว|เมีย|ภรรยา|พ่อ|แม่|พ่อเลี้ยง|แม่เลี้ยง)[^\s]{0,10}(?:ตบหน้า|บีบคอ)|บีบคอ[^\s]{0,8}หายใจไม่ออก|` +
      String.raw`(?:พ่อ|แม่|สามี|ผัว|แฟน|พ่อเลี้ยง|แม่เลี้ยง|ลุง|ป้า|ครู)เอา(?:เข็มขัด|ไม้แขวนเสื้อ|ไม้เรียว|ไม้|สายไฟ)(?:ตี|ฟาด|หวด|เฆี่ยน)|` +
      String.raw`(?:พ่อเลี้ยง|แม่เลี้ยง|ลุง|น้า|อา|ญาติ|พี่ชาย)[^\s]{0,6}(?:เข้า(?:มา)?(?:ใน)?ห้อง|มานอน)[^\s]{0,8}(?:กลางคืน|ดึก)|` +
      String.raw`(?:ครู|อาจารย์|ติวเตอร์|โค้ช)[^\s]{0,10}(?:ส่งรูป|ลวนลาม|แตะต้อง|จับตัว|จับหน้าอก)|ขู่[^\s]{0,6}ห้ามบอก`, "i")),
    toneless(new RegExp(String.raw`(?:จะ|ขอ)ตาย(?:คืนนี้|วันนี้|พรุ่งนี้|ตอนนี้)|ไม่เหลือเหตุผล(?:ให้|ที่จะ)?(?:อยู่|มีชีวิต)|อยากให้ทุกอย่างจบ(?:วันนี้|คืนนี้)|` +
      String.raw`(?:แฟน|สามี|ผัว|พ่อ|แม่)(?:hits?|beats?|chokes?|choked|hit)(?:me|us)`, "i")),
  ].map(toneless);
  const EN = [
    // detection v4 (review 3, spent set as dev data): overdose taken, at the edge now, means ready, self-harm with a body part,
    // abuse by partner / family / teacher, threats to kill, "how to die", not planning to be here
    new RegExp(String.raw`\b(?:took|swallowed|taken|downed)\b[^.]{0,24}\b(?:tablets|pills|meds|medication|sleeping pills|painkillers)\b[^.]{0,30}\b(?:ago|already|just now|tonight)\b|` +
      String.raw`\b(?:took|swallowed|downed) all (?:of )?(?:my |the |her |his |\w+'s )?(?:tablets|pills|meds|medication)\b`, "i"),
    new RegExp(String.raw`\b(?:standing|sitting|i'?m) (?:on|at) (?:the )?(?:edge of (?:the )?)?(?:overpass|bridge|roof|rooftop|ledge|balcony)\b|` +
      String.raw`\b(?:tied|tie|hung|knotted) (?:the |a |my )?(?:cord|rope|belt|noose)\b[^.]{0,30}\b(?:rail|beam` +
      String.raw`|ceiling|fan|door|closet|already)\b|\b(?:rope|cord|noose) is (?:already )?(?:tied|ready|up)\b` +
      String.raw`|` +
      String.raw`\bdriv(?:e|ing) (?:my car )?(?:into|off) (?:the |a )?(?:river|bridge|cliff|lake|sea|wall|truck|traffic)\b|\bbought charcoal\b`, "i"),
    new RegExp(String.raw`\b(?:cut|sliced|slashed|carved)\b[^.]{0,6}\b(?:my )?(?:forearm|arms?|wrists?|thighs?|legs?|stomach|skin)\b[^.]{0,24}\b(?:again|deeper|open|on purpose|bleed\w*|myself)\b|` +
      String.raw`\b(?:husband|wife|boyfriend|girlfriend|partner|dad|father|mom|mum|mother|stepdad|stepmom|stepfather` +
      String.raw`|stepmother)\b[^.]{0,20}\b(?:hit|choked|strangled|slapped|punched|kicked|beat) (?:me|us)\b(?! (?:at` +
      String.raw`|in|up|with a surprise))`, "i"),
    new RegExp(String.raw`\b(?:teacher|tutor|coach|priest|pastor|uncle|stepdad|stepfather)\b[^.]{0,40}\b(?:photos|pictures|nudes|pics)\b[^.]{0,40}\b(?:tell|threat\w*|secret)\b|` +
      String.raw`\b(?:says?|said|threaten(?:s|ed)?)\b[^.]{0,15}\b(?:he|she|they)?(?:'ll| will| would| is going to| gonna)? ?kill me\b|\bwill kill me if\b|` +
      String.raw`\b(?:least painful|painless|easiest|quickest) way to (?:die|go|end it)\b|\bhow to die\b`, "i"),
    new RegExp(String.raw`\bdon'?t plan on being (?:here|alive|around)\b|\b(?:pain|suffering) would (?:finally )?stop\b|\bno reason to (?:keep )?(?:going|go on)\b|\bwant it (?:all )?over\b`, "i"),
    // detection v2 (2026-11-13): no reason to live, not worth living, done with life, method + myself, preparing the means,
    // "want to diee" (stretched letters)
    /\bno (?:reason|point) (?:to|in) (?:keep(?:ing)? )?(?:living|live|go(?:ing)? on|be(?:ing)? alive|stay(?:ing)? alive)\b|\bnothing (?:left )?to live for\b/i,
    /\b(?:life|living) (?:is ?n['’]?t|is not|ain['’]?t) worth (?:living|it)\b|\bnot worth living\b|\bdone with (?:life|living)\b/i,
    /\b(?:shoot|hang|drown|stab|poison|gas|electrocute) myself\b|\bend (?:my|this) (?:suffering|pain)\b/i,
    /\b(?:bought|got|have|saved(?: up)?|collected|stocked up on|ready) (?:a |the |some |enough |all the )?(?:rope|pills)\b|\bwan(?:t(?:ed)?|na) (?:to |2 )?di+e+\b/i,
    // detection v3 (review 2026-11-14, spent set as dev data)
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
    // crisis fix 4: misspellings ("kil myself", "sucide")
    /\bk[i1!]l{1,2} ?(?:my ?self|myslef|mysefl|meself)\b|\b(?:sucide|sucid\w+|suicde\w*|suiside\w*|suicied|sucicid\w*|suiscid\w*|suisid\w*|sooicid\w*)\b/i,
    new RegExp("\\b(?:my )?(?:bf|gf|boyfriend|girlfriend|husband|wife|partner|dad|father|mom|mum|mother|step-?dad|step-?father|step-?mom|step-?mother|uncle|brother|teacher|coach|cousin|grandpa)" +
      " (?:\\w+ )?(?:hits|hit|beats|beat|punches|punched|kicks|kicked|slaps|slapped|chokes|choked|abuses|abused|rapes|raped|touches|touched) me\\b(?!\\s+(?:at|in|to|up|on|off)\\b)" +
      "(?!\\s+with (?:a |an |the )?(?:surprise|news|question|idea|joke|gift|compliment|party))", "i"),
  ];
  const ZH = [
    // detection v4 (review 3): at the edge, charcoal, blades on a body part, burns, a stepparent at night, a whole bottle swallowed,
    // the rope tied, a teacher groping + threats, threats to kill, how to die, ending it today
    new RegExp(String.raw`(?:天台|楼顶|桥|楼)(?:的)?(?:边上|边缘|栏杆外)|(?:买|准备)(?:了|好)?(?:木)?炭[^。]{0,10}(?:烧|车里|房间)|` +
      String.raw`(?:刀片|美工刀|刀|剪刀)[^。]{0,3}(?:划|割|刺)(?:了)?(?:手腕|手臂|大腿|腿|胳膊|自己)|(?:烟头|打火机)[^。]{0,3}烫(?:伤)?自己|` +
      String.raw`(?:继父|继母|叔叔|舅舅|姑父)[^。]{0,4}(?:晚上|半夜)?(?:进|来)(?:我|我的)?房间|(?:整瓶|整盒|一瓶|一盒)[^。]{0,4}(?:药|安眠药)[^。]{0,3}(?:都|全)?(?:吞|吃)|` +
      String.raw`绳子[^。]{0,4}(?:绑|系|挂)好|(?:老师|教练|补习)[^。]{0,8}(?:毛手毛脚|摸我|偷拍|威胁我不(?:准|许)说)|(?:说|威胁)[^。]{0,10}杀(?:了)?我|` +
      String.raw`怎么死|怎样死|如何死|(?:今天|今晚|现在)就?想(?:了结|结束(?:这一切|一切|生命)?)`),
    // detection v2 (2026-11-13): 了结 / 了断 oneself, preparing the means, no reason to live
    // detection v3 (review 2026-11-14): rooftop / bridge + jump, cutting oneself, 想s / 自sha, threats to kill, never waking up, disappearing
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
    // crisis fix 4: "nothing left to live for", the homophone slang 紫砂 (= 自杀; not the teapot), hurting oneself
    /生无可恋(?!脸|表情|的表情)|(?:想|要|去|准备|打算)紫砂(?!壶|杯|锅|陶)|伤害自己|弄伤自己|划伤自己|伤自己/,
  ];
  // traditional → simplified for the characters these patterns use
  /** @type {Record<string, string>} */
  const T2S = { 殺: "杀", 殘: "残", 結: "结", 輕: "轻", 樓: "楼", 從: "从", 經: "经", 繼: "继", 離: "离", 開: "开", 這: "这", 個: "个", 傷: "伤", 為: "为", 對: "对",
    媽: "妈", 強: "强", 姦: "奸", 藥: "药", 過: "过", 會: "会", 沒: "没", 義: "义", 時: "时", 讓: "让", 動: "动", 橋: "桥", 頂: "顶", 後: "后", 來: "来", 說: "说",
    話: "话", 無: "无", 戀: "恋", 毆: "殴", 決: "决", 斷: "断", 盡: "尽", 尋: "寻", 燒: "烧", 掛: "挂", 臥: "卧", 軌: "轨", 師: "师", 褻: "亵", 跡: "迹", 剎: "刹", 襲: "袭", 擊: "击",
    著: "着", 撐: "撑", 遺: "遗", 書: "书", 發: "发", 關: "关", 係: "系", 間: "间", 帶: "带", 頸: "颈", 腳: "脚",
    脅: "胁", 劃: "划", 煙: "烟", 燙: "烫", 補: "补", 習: "习", 樣: "样", 較: "较", 嚇: "吓", 熱: "热", 綁: "绑", 繫: "系", 準: "准", 備: "备", 繩: "绳", 別: "别", 條: "条", 訊: "讯", 見: "见", 們: "们", 麼: "么", 夢: "梦", 歡: "欢" };
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
  const FREE_TEXT = 'textarea, input:not([type]), input[type="text"], input[type="search"]';
  /** the raw text of every free-text field on the page (empty without a DOM) @param {any} [doc] */
  function fields(doc) {
    try {
      const d = doc || root.document;
      if (!d || typeof d.querySelectorAll !== "function") return "";
      return Array.from(d.querySelectorAll(FREE_TEXT)).map(e => String((e && e.value) || "")).filter(Boolean).join("\n");
    } catch (e) { return ""; }
  }
  /* ---------------- round 3 (B): the soft check ----------------
     Ambiguous distress words (or a name field with > 3 words, a pronoun / verb, digits mixed with letters) → a gentle
     "are you okay?" step BEFORE any reading: "I'd like to talk to someone" → the support card, "Just the reading" → go on.
     Fortune vocabulary (the Death card, 死神牌, dreams about a death, "kill time") is removed first; otherwise it errs on
     the side of asking. */
  const SOFT = [
    toneless(/ตาย|ตุย|ลาโลก|เป็นภาระ|ลาก่อน|จดหมายลา|หลับไปตลอด|แก๊ส|เหนื่อย[^\s]{0,12}ไม่ไหว|ทน[^\s]{0,8}ไม่ไหว|ไม่ไหวแล้ว|กลัว|ทำร้าย|จับ[^\s]{0,6}หนู|เบื่อโลก|ไร้ค่า|อยากหายไป|เจ็บปวด/),
    /\b(?:die|died|dying|dead|death|kill\w*|suicid\w*|end it|can'?t do this|hurts? me|touch(?:es|ed)? me|rope|pills|secret|hopeless|worthless|pointless|kil|sucid\w*|only way out|goodbye forever)\b/i,
    /死|自杀|走了|结束|生无可恋|紫砂|伤害自己|打我|摸我|强迫|遗书|撑不下去|活着|没意义|죽|消え|\bmati\b|chết/i,
  ];
  /* detection v2 (2026-11-13): everyday hyperbole is taken out before the soft check (หิวจะตาย, dying of laughter, 笑死了 …);
     the hard net never sees this list (it runs on the raw text) */
  const IDIOMS = [
    // detection v4: "X จะตาย" hyperbole not said of oneself, a proverb and names / words that contain ตาย; English hyperbole with
    // killed / killing / death of me / killer; 吓死 / 热死 handled by the folded Chinese list below
    toneless(/(?<!อยาก|ฉัน|หนู|ผม|กู|เรา|ดิฉัน)(?:จน)?จะตาย(?!คืนนี้|วันนี้|พรุ่งนี้|ตอนนี้|เร็ว|แน่|ไปจริง)(?:อยู่)?(?:แล้ว)?|ปลาหมอตายเพราะปาก|ตายตะวัน|ตายใจ|ตายตัว/g),
    new RegExp(String.raw`\b(?:show|joke|movie|video|episode|meme|it|this|that|set)\b[^.]{0,14}\bkilled me\b|` +
      String.raw`\b(?:feet|back|knees|legs|shoes|head|neck|stomach|eyes|hands|calves)\b (?:is|are) killing me\b|\bthe death of me\b|\bkiller (?!instinct)\w+|` +
      String.raw`\bkill two birds\b|\bcould (?:murder|kill) (?:a|an|for a)\b|\b(?:battery|phone battery)\b[^.]{0,10}\b(?:died` +
      String.raw`|is dead|dead)\b`, "gi"),toneless(/(?:หิว|ร้อน|ขำ|ง่วง|หนาว|อร่อย|สวย|น่ารัก|ตลก|เผ็ด|เมื่อย|เบื่อ|หอม|ฮา|หนัก)(?:จน)?(?:แทบ)?(?:จะ)?ตาย(?:อยู่แล้ว|แล้ว|เลย)?/g),
    // detection v3: "X แทบตาย" (เหนื่อยแทบตาย, รักเธอแทบตาย), the exclamation ตายแล้ว! before a slip, a pet or a plant that died
    toneless(new RegExp(String.raw`(?<!อยาก|จะ)[^\sอ]{0,10}แทบ(?:จะ)?ตาย|(?<!อยาก|จะ|ไม่)ตายแล้ว[!！]*(?=ลืม|เผลอ|พลาด|สาย|ทำ(?:ของ)?หาย|โทรศัพท์)` +
      String.raw`|(?:แมว|หมา|สุนัข|ปลา|นก|กระต่าย|ต้นไม้)(?:ที่บ้าน|ของ(?:ฉัน|เรา|หนู|ผม))?ตาย`, "g")),
    /\bstarving(?: to death)?\b|\bkill(?:ed|ing)? it\b|\bdrop[- ]dead \w+|\b(?:phone|laptop|battery|car|computer|tv|printer|plant)s? (?:just |has |have )?(?:died|is dead|is dying)\b/gi,
    new RegExp(String.raw`\bdying (?:of|from) (?:laughter|laughing)\b|\bdying to (?:know|see|try|hear|meet|go|find out|read|get)\b|` +
      String.raw`\b(?:traffic|heat|weather|work|job|homework|exams?|commute|deadlines?|this|it|wait(?:ing)?|suspense|boss|cold|noise|joke|cramp)\b[^.?!]{0,12}\b(?:is|are|was) killing me\b|` +
      String.raw`\b(?:could|would|'d) kill for\b|\bkilling it\b|\bdead tired\b|\b(?:bored|scared|worried|tickled|freezing) to death\b|\b(?:this|that) joke killed me\b`, "gi"),
    /(?:笑|饿|热|困|冷|忙|吓|气|渴|烦|累)死(?:了|我了|人了|啦)?|想死(?:你|您|你们|妳)(?:了|啦)?/g];
  /** the text without everyday hyperbole (for the soft checks) @param {string} t */
  const idiomBase = (/** @type {string} */ t) => { const x = /[\u4e00-\u9fff]/.test(t) ? t.replace(T2S_RE, c => T2S[c]) : t; return x.replace(/\s+(?=[ก-๛])|(?<=[ก-๛])\s+/g, "").replace(TONE, ""); };
  const unidiom = (/** @type {string} */ t) => { let x = idiomBase(t); for (const re of IDIOMS) x = x.replace(re, " "); return x; };
  const hasIdiom = (/** @type {string} */ t) => { const x = idiomBase(t); return IDIOMS.some(re => { re.lastIndex = 0; const r = re.test(x); re.lastIndex = 0; return r; }); };
  const FORTUNE_CTX = [/ไพ่(?:ใบ)?ความตาย|ไพ่\s*Death|ฝัน[^\n]{0,30}/g,
    /\b(?:the )?Death(?=[^.?]{0,25}\bcards?\b)|\bDeath card\b|\bDeath (?:reversed|upright)\b|\bdream\w*\b[^.?]{0,50}|\bdead tired\b|\bkill(?:ing)? (?:time|it)\b/gi,
    /死神牌?|梦见[^。？]{0,12}|梦到[^。？]{0,12}|夢見[^。？]{0,12}|夢到[^。？]{0,12}/g];
  /** ambiguous distress words (fortune vocabulary removed first) @param {any} text */
  function soft(text) {
    let t = unjoke(text);
    for (const re of FORTUNE_CTX) t = t.replace(re, " ");
    t = unidiom(t);
    const th = t.replace(/\s+/g, "").replace(TONE, ""), zh = t.replace(T2S_RE, c => T2S[c]).replace(/\s+/g, "");
    return SOFT[0].test(th) || SOFT[1].test(enCopy(t)) || SOFT[2].test(zh) || FAREWELL.some(re => re.test(th) || re.test(t) || re.test(zh));
  }
  // detection v2 (2026-11-13): farewell / last-time wording gets at least the soft step
  const FAREWELL = [
    // detection v4 (review 3): indirect wishes, hand-overs, last reading, gone-for-good wording
    toneless(new RegExp(String.raw`รถชน[^\s]{0,16}(?:จบ|ตาย)|จบ(?:ๆ)?ไปสักที|จะไม่มี(?:เรา|ฉัน|หนู|ผม)(?:ให้|ให้ใคร)?(?:ห่วง|เป็นห่วง)|(?:ดูดวง|คำทำนาย)ครั้งสุดท้าย|` +
      String.raw`ฝากบอก(?:แม่|พ่อ|ทุกคน)[^\s]{0,6}(?:ว่า)?รัก|(?:ยก|แจก)ของ(?:ทั้งหมด)?ให้[^\s]{0,18}ไม่ต้องรอ|จากไป(?:แบบ|โดย)?ไม่(?:ต้อง)?กลับมา|(?:good)?byeทุกคน|finalดูดวง`, "i")),
    new RegExp(String.raw`\bstop(?:ped)? existing\b|\bnobody would (?:notice|care|miss me)\b|\b(?:tired|sick) of (?:being alive|living)\b|` +
      String.raw`\bschedul\w* (?:them|it|messages?|letters?) to (?:send|go out)\b|\bmy (?:last|final) reading\b|\b(?:wasn'?t|was not|isn'?t) (?:his|her|their|your) fault\b|` +
      String.raw`\bwhen (?:i'?m|im|i am) gone\b|\bdone after tonight\b|\bif i jump\b|\bbetter off without me\b`, "i"),
    /不用醒来|醒不来就好|没有我[^。]{0,4}(?:会)?(?:比较|更)好|不想再撑/,
    toneless(new RegExp(String.raw`คงไม่ได้(?:เจอ(?:กัน)?|กลับมา)(?:อีก)?แล้ว|ฝาก(?:ดูแล|เลี้ยง)(?:แมว|หมา|สุนัข|ลูก)|คงไม่ได้เจอ(?:กัน)?อีก|` +
    String.raw`ครั้งสุดท้าย(?:ก่อน|ที่ได้)|สุดท้ายก่อนไป|จดหมายถึง[^\s]{0,12}ไว้แล้ว`)),
    new RegExp(String.raw`\b(?:this is )?my (?:last|final) (?:message|goodbye|post|words|note)\b|\b(?:good)?bye (?:everyone|everybody` +
      String.raw`|world|all)\b|\bfinal goodbye\b|\b(?:look after|take care of) my (?:dog|cat|pets?|kids?) (?:when|after) I'?m gone\b`, "i"),
    /永别|再见了.{0,8}最后|这是(?:我)?最后一次|最后一条(?:消息|信息)|遗言/];
  // detection v2 (2026-11-13): a name field gets the soft step for a distress word; an ordinary short question or topic phrase
  // ("will I get the job?", "ปีนี้จะได้ย้ายงานไหม", "今年会升职吗") or everyday hyperbole does not; otherwise the round-3 rules
  // detection v4: a name written as one distress token (wanttodie, killme …) is distress; a name that only looks like a proper
  // Latin name (Killian O'Brien, Mortimer Death) is not, unless it carries a distress word
  const NAME_COMPACT = /wan(?:t|na)to?die|killme|killmyself|endmylife|suicid/i;
  const PROPER_LATIN = /^[A-Z][a-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,2}$/;
  const NAME_DISTRESS = [toneless(/กลัว|เหนื่อย|ช่วยด้วย|ช่วยที|เจ็บ|ร้องไห้|เศร้า|ทนไม่|ไม่ไหว|ตาย|โดน|ถูกทำ|ทำร้าย|เกลียด|เหงา/),
    /\b(?:help|scared|afraid|alone|hurt|hurts|pain|cry|crying|hate|kill|die|dead|abuse\w*|hit|hits|beat|beats|tired|sad|lonely|unsafe|please)\b/i,
    /救|怕|痛|疼|哭|累|打我|死|孤单|难过|伤心|想你|最后一天/];
  const NAME_ORDINARY = [toneless(/ไหม|มั้ย|หรือเปล่า|อย่างไร|ยังไง|เมื่อไร|งาน|ตำแหน่ง|สอบ|ปีนี้|เดือน|ดวง|ฝัน|ไพ่|โชค|ความรัก|เงิน/),
    /\?\s*$|\b(?:job|career|work|exams?|promotion|interview|business|shop|money|love|marriage|year|month|lucky|luck|cards?|tarot|dream\w*|funeral|horoscope|zodiac|mean)\b/i,
    /吗|么|什么|怎么|如何|运|梦|牌|工作|升职|考试|今年|代表/];
  const NAME_TH = toneless(/(?:ฉัน|หนู|ผม|กู|เรา|ดิฉัน)(?:อยาก|จะ|ไม่|กลัว|เหนื่อย|รู้สึก|โดน|ถูก|ต้อง)|อยาก|ไม่|ช่วยด้วย|กลัว|เหนื่อย/);
  const NAME_EN = /\b(?:i|i'm|im|me|my|myself|you|we|he|she|they|want|wanna|need|help|hate|kill|die|am|is|are|was|can'?t|don'?t|please)\b/i;
  const NAME_ZH = /我|你|他|她|想|要|不|死|打|救/;
  /** a name field that is more than a plain name @param {any} name */
  function softName(name) {
    const n = canon(name).trim();
    if (!n) return false;
    if (NAME_COMPACT.test(n.replace(/[\s_.-]+/g, ""))) return true;
    if (PROPER_LATIN.test(n) && !NAME_DISTRESS[1].test(n.replace(/\b(?:kill\w+|death)\b/gi, " "))) return false;
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
  /** (A) the text if it is a plain name, else "" (never echo anything else) @param {any} name */
  function plainName(name) {
    const n = String(name == null ? "" : name).trim();
    return n && n.length <= 40 && !softName(n) && !check(n) ? n : "";
  }
  const NAME_FIELDS = "#hsName, #hsPName, #hsNameNum, #frNick, #plNick, #nmName, #rpName";
  /** the page's fields need the soft step (and it has not been answered for exactly these values) @param {any} [doc] */
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
  /** the reader chose "Just the reading" for the current field values @param {any} [doc] */
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
  /** draw the soft step into box (textContent only) @param {any} box @param {string} lang @param {() => void} onGo @param {() => void} onTalk */
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
  /* ---------------- help line (owner order 2026-11-12) ----------------
     A calm line with real help resources on every fortune page and under every reading; it needs no detection.
     Numbers, hours and cost are only what docs/CRISIS-RESOURCES.md verified from official sources (checked 2026-11-12):
     1323 (Department of Mental Health: free, 24 hours) and 1669 (medical emergency; hours and cost not shown, not read
     directly on niems.go.th). No verified Chinese-language line exists in Thailand: the Chinese text says so.
     HELP is the canonical wording: tools/helpline.mjs writes the static Thai line into every fortune page (it shows
     without JavaScript), i18n/{en,zh}-common.js carry the same English / Chinese text under help.line.* (unit-tested). */
  /** @type {{tel: string[], th: Record<string, string>, en: Record<string, string>, zh: Record<string, string>}} */
  const HELP = {
    tel: ["1323", "1669"],
    th: { label: "สายด่วนช่วยเหลือ", lead: "ถ้ากำลังรู้สึกไม่ไหว โทรคุยได้ที่สายด่วนสุขภาพจิต", free: "ฟรี ตลอด 24 ชั่วโมง", emerg: "เจ็บป่วยฉุกเฉิน",
      note: "อยู่ต่างประเทศ โทรเบอร์ฉุกเฉินของประเทศนั้น" },
    en: { label: "Help lines", lead: "If things feel like too much, you can talk to someone: Thai mental health hotline", free: "free, 24 hours",
      emerg: "Medical emergency", note: "Outside Thailand, call your local emergency number." },
    zh: { label: "求助热线", lead: "如果你感觉撑不下去，可以打电话找人聊聊：泰国心理健康热线", free: "免费，24 小时", emerg: "医疗急救",
      note: "目前没有经核实的泰国中文热线；不在泰国时请拨打当地紧急电话。" },
  };
  /** the help line's parts in order: [kind, field or number] */
  const HELP_PARTS = [["t", "lead"], ["tel", "1323"], ["t", "free"], ["sep", ""], ["t", "emerg"], ["tel", "1669"], ["note", "note"]];
  const helpLang = (/** @type {any} */ l) => (l === "en" || l === "zh" ? l : "th");
  /** the help line as an element (textContent only). With the page's i18n present it is built in Thai with data-i18n keys
   *  and translated by LQI18N (so it follows later language switches); without it, in the given language.
   *  @param {any} [doc] @param {string} [lang] @param {string} [cls] extra class */
  function helpLine(doc, lang, cls) {
    const d = doc || root.document, I = /** @type {any} */ (root).LQI18N, i18n = !!(I && typeof I.apply === "function");
    const L = HELP[i18n ? "th" : helpLang(lang)];
    /** @param {string} tag @param {string} [c] @param {string} [t] */
    const el = (tag, c, t) => { const e = d.createElement(tag); if (c) e.className = c; if (t != null) e.textContent = t; return e; };
    // crisis fix 4: under a reading on a calm page (crisis state, calm session, soft step answered or distress typed) the line is
    // sticky, so it stays in the viewport next to the reading
    const calmHere = !!cls && /lq-helpline-result/.test(cls) && (calmOn(d) || distress(d));
    if (calmHere) { markCalm(d); pinBar(d, i18n ? I.lang : lang, null); } // crisis flow v2: the page's ONE pinned bar (fixed, in view)
    const box = el("aside", "lq-helpline" + (cls ? " " + cls : ""));
    box.setAttribute("role", "note"); box.setAttribute("aria-label", L.label); box.setAttribute("data-i18n-attr", "aria-label:help.line.label");
    for (const [k, v] of HELP_PARTS) {
      if (k === "tel") { const a = el("a", "lq-helpline-tel", v); a.setAttribute("href", "tel:" + v); box.appendChild(a); }
      else if (k === "sep") { const x = el("span", "lq-helpline-sep", "·"); x.setAttribute("aria-hidden", "true"); box.appendChild(x); }
      else { const x = el("span", k === "note" ? "lq-helpline-note" : "", L[v]); x.setAttribute("data-i18n", "help.line." + v); box.appendChild(x); }
      if (k !== "note") box.appendChild(d.createTextNode(" "));
    }
    if (i18n) { try { I.apply(box); } catch (e) { /* i18n not ready: Thai stays */ } }
    return box;
  }
  const escH = (/** @type {any} */ s) => String(s).replace(/[&<>"]/g, c => (/** @type {Record<string, string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }))[c]);
  /** the help line as HTML in one language (Thai carries the data-i18n keys) @param {string} [lang] @param {string} [cls] */
  function helpHTML(lang, cls) {
    const l = helpLang(lang), L = HELP[l], key = (/** @type {string} */ k) => (l === "th" ? ' data-i18n="help.line.' + k + '"' : "");
    const parts = HELP_PARTS.map(([k, v]) => k === "tel" ? '<a class="lq-helpline-tel" href="tel:' + v + '">' + v + "</a>"
      : k === "sep" ? '<span class="lq-helpline-sep" aria-hidden="true">·</span>'
      : "<span" + (k === "note" ? ' class="lq-helpline-note"' : "") + key(v) + ">" + escH(L[v]) + "</span>");
    return '<aside class="lq-helpline' + (cls ? " " + escH(cls) : "") + '" role="note" aria-label="' + escH(L.label) + '"' +
      (l === "th" ? ' data-i18n-attr="aria-label:help.line.label"' : "") + ">" + parts.join(" ") + "</aside>";
  }

  /* ---------------- crisis state (owner order 2026-11-12) ----------------
     Once the support card has been shown on a page (hard net, or the soft step's "talk" path), the PAGE is in the crisis
     state until it is reloaded: FortuneAI shows the support card instead of any later reading, hooks (member, merit,
     paid services) do not run, and <html data-lq-crisis="1"> hides every block marked data-lq-remedy (lucky items,
     remedies, recommendations, lead forms, share cards) through styles.css. Any renderer of remedies, lucky items, paid
     or merit services or straight-mode readings must ask allow(kind) first.
     Crisis fix 4 (owner decision 2026-11-12): the state also holds for the browser session (this tab). ONE sessionStorage
     boolean ("lq-fortune-calm" = "1"; no timestamp, no text) is set when the support card is shown or the soft step is
     answered with "Just the reading". Every fortune page opened later in the same tab is then calm: gentle wording only, no
     straight reading, no remedy / lucky-item / paid / merit block (<html data-lq-calm>), and the help line stays in view next
     to the reading. Closing the tab clears it. Without storage the page-level behaviour stays. */
  const SESSION_KEY = "lq-fortune-calm";
  /** the tab's session flag (false when storage is unavailable) */
  function sessionOn() { try { const st = root.sessionStorage; return !!(st && st.getItem(SESSION_KEY) === "1"); } catch (e) { return false; } }
  function sessionSet() { try { const st = root.sessionStorage; if (st) st.setItem(SESSION_KEY, "1"); } catch (e) { /* private mode: page-level only */ } }
  const CALM_CSS = "html[data-lq-calm] [data-lq-remedy],html[data-lq-calm] [data-lq-upsell],html[data-lq-crisis] [data-lq-upsell]{display:none!important}" +
    // review 2026-11-14 (rules d, e): the straight-option paragraph and links to pricing / plans / refunds (same rule in styles.css)
    "html[data-lq-calm] [data-lq-straight],html[data-lq-calm] [data-lq-paid-link],html[data-lq-calm] a[href*=\"pricing.html\"]," +
    "html[data-lq-calm] a[href*=\"terms.html#t9\"]{display:none!important}" +
    "html[data-lq-calm] .fa-straight{display:none!important}" +
    ".lq-helpline-calm,.lq-helpline-dock{position:sticky;bottom:0;z-index:5;box-shadow:0 -2px 10px rgba(20,50,74,.18)}";
  /** mark this page calm (attribute + styles; page-level, nothing stored) @param {any} [doc] */
  function markCalm(doc) {
    const d = doc || root.document;
    if (!d || typeof d !== "object") return;
    try { if (d.documentElement && d.documentElement.setAttribute) d.documentElement.setAttribute("data-lq-calm", "1"); } catch (e) { /* no DOM */ }
    try {
      if (d.getElementById && !d.getElementById("lq-calm-style") && d.head) { const st = d.createElement("style"); st.id = "lq-calm-style"; st.textContent = CALM_CSS; d.head.appendChild(st); }
    } catch (e) { /* no DOM */ }
  }
  /** calm page: one sticky help line docked in the reading's result section (the section can start with large images, so the
   *  reading's own line may be below the fold); it stays at the bottom of the viewport while that section is on screen
   *  @param {any} container the reading's container @param {string} [lang] */
  function calmDock(container, lang) {
    try {
      const d = container && container.ownerDocument;
      if (!d || !(calmOn(d) || distress(d))) return null;
      // the page's result section (#trResult, #hsResult, …), else the outermost section around the reading
      const up = container.parentElement;
      let sec = up && up.closest ? up.closest('[id$="Result"]') : null;
      for (let e = up; !sec && e && e !== d.body; e = e.parentElement) if (e.tagName === "SECTION" && !(e.parentElement && e.parentElement.closest("section"))) sec = e;
      // crisis flow v2 (coordinator review 2026-11-13): ONE pinned bar per page, fixed at the bottom of the viewport; it is
      // moved into the section of the latest reading (or the reading's container), so it stays next to the reading
      Array.from(container.querySelectorAll(".lq-helpline-calm")).forEach(e => e.classList.remove("lq-helpline-calm"));
      return pinBar(d, lang, sec || container);
    } catch (e) { return null; }
  }
  /** the reader answered the soft step with "Just the reading" (or saw the card): calm for the rest of the session @param {any} [doc] */
  function setCalm(doc) { sessionSet(); markCalm(doc); }
  /** @type {WeakSet<object>|null} */
  const ACTIVE = typeof WeakSet !== "undefined" ? new WeakSet() : null;
  const CRISIS_CSS = "html[data-lq-crisis] [data-lq-remedy]{display:none!important}";
  /** @param {any} [doc] @returns {any} */
  const docOf = doc => doc || root.document || null;
  /** true when this page is in the crisis state @param {any} [doc] */
  function active(doc) {
    const d = docOf(doc);
    if (!d) return false;
    if (ACTIVE && typeof d === "object" && ACTIVE.has(d)) return true;
    try { return !!(d.documentElement && d.documentElement.getAttribute && d.documentElement.getAttribute("data-lq-crisis") === "1"); } catch (e) { return false; }
  }
  /** put this page into the crisis state (called when the support card is shown) @param {any} [doc] */
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
  /** may a renderer show this kind of content ("remedy" | "lucky" | "paid" | "merit" | "straight" | "reco" | "lead" | "share")?
   *  false while the page is in the crisis state. Crisis flow v2 §3 (owner decision 2026-11-13): free belief guidance ("belief":
   *  merit, prayer, chanting, meditation, labelled "according to belief") and neutral colours ("colour") are always allowed;
   *  "merit" stays the merit SERVICE (paid / on your behalf) and is refused. @param {string} kind @param {any} [doc] */
  const allow = (kind, doc) => kind === "belief" || kind === "colour" || kind === "color" || (!active(doc) && !calmOn(doc));
  /** true when this page is calm: the crisis state, the tab's session flag, or the soft step answered here @param {any} [doc] */
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

  /* ---------------- crisis flow v2 (owner decision 2026-11-13, docs/CRISIS-FLOW-V2.md) ----------------
     "Respond, support and keep the door open": the acknowledgement card comes first, the reading follows on "continue".
     Here: (1) the advice classifier and the fatalistic filter that calm readings pass through (word lists per language,
     tests/unit/fortune-crisis-flow-v2.test.js); (2) the hope frame; (3) the pinned help bar (1323 + the other verified lines);
     (4) the in-memory "continued" state: the field values the reader continued past are kept in memory only (never stored,
     never sent), so the card comes back only when a NEW hard-net signal is typed.
     REVIEW: the hope frame and the help-bar wording are pending review by a Thai mental-health professional (launch item L63). */
  /** advice kinds in priority order: anything that sells, buys or carries an object wins over belief and colour words */
  const KINDS = ["lucky", "purchase", "remedy", "belief", "colour"];
  /** @type {Record<string, RegExp[]>} word lists per kind: [Thai, English, Chinese] */
  const WORDS = {
    lucky: [
      /ของมงคล|เครื่องราง|ของขลัง|วัตถุมงคล|พระเครื่อง|ตะกรุด|หินมงคล|หินนำโชค|กำไล|คริสตัล|ของนำโชค|เครื่องประดับ|ผ้ายันต์|ยันต์|ปี่เซียะ|พวงกุญแจ|เหรียญนำโชค|รูปเคารพ|เครื่องรางของขลัง/,
      new RegExp(String.raw`\b(?:amulets?|talisman\w*|lucky charms?|good[- ]luck charms?|charm bracelets?|crystals?(?! clear)|gemstones?|lucky (?:items?` +
        String.raw`|objects?|stones?|bracelets?|coins?|tokens?)|pendants?|bracelets?|figurines?|sacred images?|statuettes?|keychains?)\b`, "i"),
      /吉祥物|护身符|开运物|开运|水晶|手链|手串|貔貅|饰品|摆件|佛牌|符咒|平安符|转运|神像|幸运物/,
    ],
    purchase: [
      /ซื้อ(?!ใจ)|สั่งซื้อ|เช่า(?:พระ|บูชา)|ราคา|\d[\d,]*\s*บาท|฿|โอนเงิน|จ่ายเงิน|ชำระเงิน|ค่าบริการ|ทำบุญแทน|บริการ[^\s]{0,8}แทน/,
      /\b(?:buy|buying|bought|purchas\w*|prices?|priced|fees?|baht|shop|on your behalf|pay(?:ment|ing)? (?:for|us|the fee))\b|฿/i,
      /购买|买(?!单)|价格|付款|支付|下单|商店|泰铢|代办|代为|费用/,
    ],
    remedy: [
      new RegExp(String.raw`(?:เปลี่ยน|ตั้ง)(?:ชื่อ|นามสกุล|เบอร์|เลขทะเบียน|ทะเบียน)|เลขมงคล|เบอร์มงคล|เลขนำโชค|วาง[^\s]{0,14}(?:ในบ้าน|ที่บ้าน` +
        String.raw`|หน้าบ้าน|บนโต๊ะ|ในห้อง)|แขวน|ทำพิธี|สะเดาะเคราะห์|ตัดกรรม|แก้กรรม|เสริมฮวงจุ้ย|วิธีปรับ|ข้อแนะนำทั่วไปคือ|เคล็ดเสริมดวง` +
        String.raw`|วิธีเสริมจุดนี้|สิ่งที่ควรทำตามตำรา|สีที่เข้ากับผลครั้งนี้|ถ้าอยากใช้สีช่วยเสริม|ทิศที่ส่งเสริม|ทิศมงคล`),
      new RegExp(String.raw`\b(?:change (?:your )?(?:name|phone number|number|plate)|lucky numbers?|place (?:a|an|the|some) [^.]{0,30}\b(?:in` +
        String.raw`|at|on|by) (?:your|the) (?:home|house|desk|door|bedroom|room)|hang (?:a|an)|rituals?|ceremon\w*|a simple adjustment` +
        String.raw`|try this simple adjustment|for colou?r, you could add|tones suit you)\b`, "i"),
      /改名|换号|吉祥号码|幸运数字|摆放|挂在|放在家|办公桌上|仪式|法事|调整的方法是|建议这样调整|颜色上可以多用|这段时间和你比较合/,
    ],
    belief: [
      /ทำบุญ|ไหว้|ขอพร|สวดมนต์|สมาธิ|ใส่บาตร|กรวดน้ำ|แผ่เมตตา|รักษาศีล|ทำความดี|ทำทาน|ปฏิบัติธรรม/,
      /\b(?:merit|pray\w*|chant\w*|meditat\w*|temples?|shrines?|good deeds?|alms|kindness)\b/i,
      /行善|祈祷|祈福|诵经|念经|冥想|静坐|拜佛|参拜|拜太岁|布施|做好事|上香|礼佛/,
    ],
    colour: [
      /สี(?:ประจำ|มงคล|เสื้อ|แดง|เหลือง|ชมพู|เขียว|ส้ม|ฟ้า|น้ำเงิน|ม่วง|ดำ|เทา|ขาว|ครีม|ทอง|เงิน|น้ำตาล|ของวัน)|โทนสี/,
      /\b(?:colou?rs?|red|yellow|pink|green|orange|blue|navy|purple|black|grey|gray|white|cream|gold)\b/i,
      /颜色|红色|黄色|粉色|绿色|橙色|蓝色|紫色|黑色|灰色|白色|色系/,
    ],
  };
  /** the kind of an advice line: "lucky" | "purchase" | "remedy" | "belief" | "colour" | "" @param {any} text */
  function adviceKind(text) {
    const t = canon(text);
    if (!t.trim()) return "";
    for (const k of KINDS) if (WORDS[k].some(re => re.test(t))) return k;
    return "";
  }
  /** fatalistic: an unavoidable bad outcome, or a bad period with no way forward. [Thai, English, Chinese] */
  const FATAL = [
    new RegExp(String.raw`หลีกเลี่ยงไม่ได้|หนีไม่พ้น|ไม่มีทาง(?:แก้|รอด|ออก|ดีขึ้น|หนี)|หมดหวัง|สิ้นหวัง|ไม่มีวัน(?:ดีขึ้น|สำเร็จ|หาย|สมหวัง)` +
      String.raw`|ชะตาขาด|ถึงฆาต|เคราะห์หนัก|ดวงซวย|ซวยหนัก|ล่มจม|พังทลาย|หายนะ|จุดจบ|ย่อยยับ|(?:จะ|ต้อง)(?:ล้มเหลว|สูญเสียทุกอย่าง` +
      String.raw`|พังพินาศ)|ไม่มีอะไรช่วยได้|ทำอะไรก็ไม่ขึ้น|อับจน|ดวงตกหนัก|ตกต่ำที่สุด`),
    new RegExp(String.raw`\b(?:inevitabl\w*|unavoidabl\w*|doom(?:ed)?|hopeless\w*|no way out|nothing (?:you can do|can help)|bound to (?:fail` +
      String.raw`|lose|suffer)|will (?:surely |certainly )?(?:fail|lose everything|be ruined)|ruin(?:ed|ous|s)?|disaster\w*|catastroph\w*` +
      String.raw`|cursed|never (?:get better|recover|succeed)|no escape|cannot escape)\b`, "i"),
    /注定|无法避免|不可避免|难逃|在劫难逃|必然失败|必定失败|毫无希望|没有希望|绝望|绝境|无路可走|厄运|灾难|劫数|大凶|一败涂地|永远不会好|无可挽回|走投无路/,
  ];
  const BAD = [
    /ดวงตก|ดวงอ่อน|ดวงไม่ดี|ช่วงขาลง|ช่วงไม่ดี|ช่วงวิกฤต|ตกต่ำ|เคราะห์|มีเกณฑ์(?:เสีย|สูญ|เจ็บ|ป่วย)|ดวงถดถอย/,
    /\b(?:weak (?:period|patch|phase|spot)|bad (?:period|luck|time|year|patch)|low (?:period|point|phase)|hard (?:period|year)|losses|setbacks?|misfortune|unlucky)\b/i,
    /运势低迷|运势不佳|低谷|不顺|坏运|凶|破财|损失|阻碍|倒霉/,
  ];
  const FORWARD = [
    /ผ่านไป|ค่อย ?ๆ|ทำได้|ลอง|ควร|ช่วย|ดีขึ้น|เริ่ม|วางแผน|ดูแล|พัก|ปรึกษา|ทีละ|รับมือ|แก้ไข|ป้องกัน|เตรียม|ระวัง|เติบโต|เรียนรู้|โอกาส/,
    /\b(?:pass(?:es)?|can|could|try|step|plan\w*|help\w*|improv\w*|ease|recover\w*|look after|rest|talk|prepar\w*|watch|steady|careful\w*|learn\w*|grow\w*|chance)\b/i,
    /会过去|可以|试着|慢慢|好转|一步|计划|照顾|休息|聊聊|准备|注意|帮助|调整|稳|学习|成长|机会/,
  ];
  const any = (/** @type {RegExp[]} */ list, /** @type {string} */ t) => list.some(re => re.test(t));
  /** true when the sentence states an unavoidable bad outcome or a bad period without a way forward @param {any} text @param {string} [lang] */
  // eslint-disable-next-line no-unused-vars
  function fatalistic(text, lang) {
    const t = canon(text);
    if (!t.trim()) return false;
    return any(FATAL, t) || (any(BAD, t) && !any(FORWARD, t));
  }
  /** the sentences of a paragraph; Thai clauses are separated by spaces @param {string} t */
  function pieces(t) {
    const out = [];
    for (const s of String(t).match(/[^.!?。！？]+[.!?。！？]*\s*/g) || []) {
      if (/[฀-๿]/.test(s)) out.push(...s.trim().split(/\s+/).filter(Boolean));
      else if (s.trim()) out.push(s.trim());
    }
    return out;
  }
  /** a paragraph for a calm reading: lucky-object, purchase, other-remedy and fatalistic sentences removed; free belief
   *  guidance and colours stay ("" when nothing is left) @param {any} text @param {string} [lang] */
  function calmText(text, lang) {
    const ps = pieces(canon(text));
    const keep = ps.filter((p, i) => {
      const k = adviceKind(p);
      if (k === "lucky" || k === "purchase" || k === "remedy") return false;
      if (any(FATAL, p)) return false;
      // a Thai clause may get its way forward from the clause next to it
      if (any(BAD, p) && !any(FORWARD, p) && !(/[฀-๿]/.test(p) && (any(FORWARD, ps[i + 1] || "") || any(FORWARD, ps[i - 1] || "")))) return false;
      return true;
    });
    void lang;
    return keep.join(" ").replace(/\s+([,.!?。！？，])/g, "$1").trim();
  }
  /** the hope frame of a calm reading (a fixed opening and closing line) */
  const HOPE = {
    reviewStatus: "pending-professional-review",
    th: { open: "ช่วงที่หนักใจไม่ได้อยู่ตลอดไป อ่านคำทำนายต่อไปนี้เป็นแนวทางเบา ๆ ได้ สิ่งที่คุณทำได้ในแต่ละวันสำคัญกว่าดวงเสมอ",
      close: "ทุกช่วงเวลาค่อย ๆ ผ่านไปได้ทีละวัน ดูแลเรื่องเล็ก ๆ อย่างกินข้าว พักผ่อน และคุยกับคนที่ไว้ใจ ถ้าอยากคุยกับใครตอนนี้ โทร 1323 ได้ฟรี ตลอด 24 ชั่วโมง" },
    en: { open: "Hard periods do not last forever. Read what follows as a gentle guide; what you can do each day matters more than any reading.",
      close: "Every period can be taken one day at a time. Look after the small things: eating, resting and talking to someone you trust. " +
        "If you would like to talk to someone now, call 1323, free, 24 hours." },
    zh: { open: "艰难的时期不会一直持续。下面的内容可以当作温和的参考；你每天能做的事，比任何解读都重要。",
      close: "每段时期都可以一天一天地走过。照顾好小事：按时吃饭、好好休息、和信任的人聊聊。如果现在想找人聊聊，可以拨打 1323，免费，24 小时。" },
  };
  /** the hope frame in one language @param {any} lang */
  const hope = lang => { const L = /** @type {any} */ (HOPE)[helpLang(lang)]; return { open: L.open, close: L.close, reviewStatus: HOPE.reviewStatus }; };
  /** the pinned help bar: 1323 always visible, the other verified lines (docs/CRISIS-RESOURCES.md) behind "more help lines" */
  const BAR = {
    th: { label: "สายด่วนช่วยเหลือ", lead: "อยากคุยกับใครตอนนี้ โทร", free: "ฟรี ตลอด 24 ชั่วโมง", more: "เบอร์ช่วยเหลืออื่น ๆ",
      lines: [["02 113 6789", "สมาคมสะมาริตันส์แห่งประเทศไทย รับฟังทุกเรื่อง 12:00–22:00 น.", "021136789"],
        ["1300", "ศูนย์ช่วยเหลือสังคม กระทรวง พม. ความรุนแรงในครอบครัว ปัญหาเด็กและเยาวชน ตลอด 24 ชั่วโมง"], ["191", "เหตุด่วนเหตุร้าย / แจ้งตำรวจ"],
        ["1669", "เจ็บป่วยฉุกเฉิน / ต้องการรถพยาบาล"]] },
    en: { label: "Help lines", lead: "Want to talk to someone now? Call", free: "free, 24 hours", more: "More help lines",
      lines: [["02 113 6789", "Samaritans of Thailand, listening line, 12:00–22:00", "021136789"],
        ["1300", "Social Assistance Center (Ministry of Social Development and Human Security): domestic violence, children and young people; 24 hours"],
        ["191", "Police emergency"], ["1669", "Medical emergency / ambulance"]] },
    zh: { label: "求助热线", lead: "现在想找人聊聊？请拨打", free: "免费，24 小时", more: "更多求助热线",
      lines: [["02 113 6789", "泰国撒玛利亚会（Samaritans of Thailand）倾听热线，12:00–22:00", "021136789"],
        ["1300", "泰国社会援助中心（社会发展与人类安全部）：家庭暴力、儿童和青少年问题，24 小时"], ["191", "报警（泰国警察）"], ["1669", "医疗急救 / 救护车"]] },
  };
  /** the pinned help bar as an element (textContent only) @param {any} [doc] @param {string} [lang] @param {string} [cls] */
  function helpBar(doc, lang, cls) {
    const d = doc || root.document, I = /** @type {any} */ (root).LQI18N;
    const l = helpLang(lang || (I && I.lang) || "th"), L = BAR[l];
    const el = (tag, c, t) => { const e = d.createElement(tag); if (c) e.className = c; if (t != null) e.textContent = t; return e; };
    const tel = (n, t) => { const a = el("a", "lq-helpline-tel", n); a.setAttribute("href", "tel:" + (t || n).replace(/\s+/g, "")); return a; };
    const box = el("aside", "lq-helpline lq-helpbar" + (cls ? " " + cls : ""));
    box.setAttribute("role", "note"); box.setAttribute("aria-label", L.label); box.setAttribute("data-review", "pending-professional-review");
    box.setAttribute("lang", l === "zh" ? "zh-Hans" : l);
    const row = el("p", "lq-helpbar-main");
    row.appendChild(el("span", null, L.lead + " ")); row.appendChild(tel("1323")); row.appendChild(el("span", null, " " + L.free));
    box.appendChild(row);
    const more = el("details", "lq-helpbar-more"); more.setAttribute("data-lq-more", "");
    more.appendChild(el("summary", null, L.more));
    const ul = el("ul");
    for (const [n, t, x] of L.lines) { const li = el("li"); li.appendChild(tel(n, x)); li.appendChild(el("span", null, " " + t)); ul.appendChild(li); }
    more.appendChild(ul); box.appendChild(more);
    try { ensureBarStyle(d); } catch (e) { /* no DOM */ }
    return box;
  }
  // only one bar is sticky: the dock in the reading's section (or the line under it until the dock exists); the page bar is fixed
  const BAR_CSS = ".lq-helpbar.lq-helpline-dock,.lq-helpbar.lq-helpline-calm{position:sticky;bottom:0;z-index:6}" +
    ".lq-helpbar{margin:10px 0 0;padding:8px 12px;border-radius:12px;background:#0b3b5a;color:#fff;" +
    "box-shadow:0 -2px 10px rgba(20,50,74,.25);font-size:.95rem;line-height:1.45}.lq-helpbar p{margin:0}.lq-helpbar a.lq-helpline-tel{color:#fff;font-weight:700;" +
    "display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 10px;border-radius:10px;background:rgba(255,255,255,.16);" +
    "text-decoration:none}.lq-helpbar details{margin-top:2px}.lq-helpbar summary{cursor:pointer;min-height:44px;display:flex;align-items:center}" +
    ".lq-helpbar ul{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:4px}.lq-helpbar li{display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
    ".lq-helpbar-page{position:fixed;left:8px;right:8px;bottom:8px;max-width:900px;margin:0 auto}body.lq-has-helpbar{padding-bottom:120px}" +
    ".fa-hope{margin:.4em 0 1em;padding:.7em .9em;border-left:3px solid #38bdf8;background:rgba(56,189,248,.08);border-radius:8px;line-height:1.6}" +
    "@media print{.lq-helpbar{position:static;box-shadow:none}.lq-helpbar-page{display:none}}";
  /** @param {any} d */
  function ensureBarStyle(d) {
    if (!d || !d.head || typeof d.getElementById !== "function" || d.getElementById("lq-helpbar-style")) return;
    const st = d.createElement("style"); st.id = "lq-helpbar-style"; st.textContent = BAR_CSS; d.head.appendChild(st);
  }
  /** a calm page without a reading (fortune hub, planner, lucky-colour mirror): one help bar fixed at the bottom @param {any} [doc] */
  function pageBar(doc) { return pinBar(doc, undefined, null); }
  /** the page's ONE pinned help bar (fixed at the bottom): created once, then moved into `host` (default: the body)
   *  @param {any} doc @param {string|undefined} lang @param {any} host */
  function pinBar(doc, lang, host) {
    try {
      const d = doc || root.document;
      if (!d || !d.body) return null;
      let bar = d.querySelector(".lq-helpbar-pin");
      if (!bar) { bar = helpBar(d, lang, "lq-helpbar-page lq-helpbar-pin"); d.body.classList.add("lq-has-helpbar"); }
      const to = host || d.body;
      if (bar.parentNode !== to) to.appendChild(bar);
      return bar;
    } catch (e) { return null; }
  }
  const CARD = {
    th: {
      title: "เราอยู่ตรงนี้นะ",
      lead: "ขอบคุณที่บอกให้เรารู้ ช่วงนี้คุณอาจกำลังแบกเรื่องหนักใจอยู่ ความรู้สึกแบบนี้เกิดขึ้นได้กับทุกคน และคุณไม่ต้องผ่านมันไปคนเดียว",
      body: "ถ้าอยากคุยกับใครสักคนตอนนี้ มีคนพร้อมรับฟังและช่วยเหลือ แตะที่เบอร์เพื่อโทรได้เลย",
      lines: [["1323", "สายด่วนสุขภาพจิต กรมสุขภาพจิต — โทรฟรี ตลอด 24 ชั่วโมง"], ["1669", "เจ็บป่วยฉุกเฉิน / ต้องการรถพยาบาล"], ["191", "เหตุด่วนเหตุร้าย / แจ้งตำรวจ"],
        ["1300", "ศูนย์ช่วยเหลือสังคม กระทรวง พม. — ความรุนแรงในครอบครัว ปัญหาเด็กและเยาวชน ตลอด 24 ชั่วโมง"],
        ["02 113 6789", "สมาคมสะมาริตันส์แห่งประเทศไทย — รับฟังทุกเรื่อง 12:00–22:00 น.", "021136789"]],
      after: "ถ้าทำได้ ลองบอกคนที่คุณไว้ใจสักคนว่ากำลังรู้สึกอย่างไร ถ้ารู้สึกไม่ปลอดภัยตอนนี้ ไปโรงพยาบาลใกล้บ้านหรือโทร 1669 ถ้าอยู่นอกประเทศไทย โทรเบอร์ฉุกเฉินของประเทศนั้น",
      cont: "ดูคำทำนายต่อ",
      contNote: "คำทำนายยังอยู่ และเบอร์ช่วยเหลือจะอยู่ด้านล่างของหน้าจอตลอด",
      foot: "ข้อความที่คุณพิมพ์ไม่ได้ถูกบันทึกหรือส่งไปที่ใด · ถ้อยคำบนการ์ดนี้กำลังรอผู้เชี่ยวชาญด้านสุขภาพจิตตรวจทาน",
      call: "โทร",
    },
    en: {
      title: "We're here with you",
      lead: "Thank you for letting us know. You may be carrying something heavy right now. Feelings like this can happen to anyone, and you don't have to go through them alone.",
      body: "If you'd like to talk to someone now, people are ready to listen and help. Tap a number to call.",
      lines: [["1323", "Thai Department of Mental Health hotline — free, 24 hours"], ["1669", "Medical emergency / ambulance"], ["191", "Police emergency"],
        ["1300", "Social Assistance Center (Ministry of Social Development and Human Security) — domestic violence, children and young people; 24 hours"],
        ["02 113 6789", "Samaritans of Thailand — listening line, 12:00–22:00", "021136789"]],
      after: "If you can, tell someone you trust how you are feeling. If you feel unsafe right now, go to the nearest hospital or call 1669. Outside Thailand, call your local emergency number.",
      cont: "Continue to the reading",
      contNote: "Your reading is still here, and the help lines stay at the bottom of the screen.",
      foot: "Nothing you typed was saved or sent anywhere · The wording on this card is awaiting review by a mental-health professional",
      call: "Call",
    },
    zh: {
      title: "我们在这里陪着你",
      lead: "谢谢你告诉我们。你现在可能正承受着很沉重的事情。有这样的感受并不奇怪，你不需要独自面对。",
      body: "如果你现在想找人聊聊，有人愿意倾听和帮助。点一下号码就可以拨打。",
      lines: [["1323", "泰国心理健康热线（泰国卫生部心理健康司）— 免费，24 小时"], ["1669", "医疗急救 / 救护车"], ["191", "报警（泰国警察）"], ["1300", "泰国社会援助中心（社会发展与人类安全部）— 家庭暴力、儿童和青少年问题，24 小时"],
        ["02 113 6789", "泰国撒玛利亚会（Samaritans of Thailand）倾听热线 — 12:00–22:00", "021136789"]],
      after: "如果可以，请告诉一位你信任的人你现在的感受。如果你现在觉得不安全，请去最近的医院或拨打 1669。如果你不在泰国，请拨打当地的紧急电话。",
      cont: "继续查看解读",
      contNote: "解读还在，求助热线会一直显示在屏幕下方。",
      foot: "你输入的内容没有被保存或发送 · 这张卡片的措辞正在等待心理健康专业人士审阅",
      call: "拨打",
    },
  };
  const CALM_ADVICE = { th: "คำแนะนำ", en: "Advice", zh: "建议" };
  /** crisis flow v2 §2–§4: a reading for the calm state. Gentle only (a straight reading is never calmed, see renderWithHooks),
   *  no plan, every paragraph through the calm filter (lucky objects, purchases, other remedies and fatalistic sentences out;
   *  free belief guidance and colours stay), the hope frame added. Idempotent. @param {any} res */
  function calmReading(res) {
    if (!res || res.crisis || !Array.isArray(res.sections)) return res;
    if (res.calm) return res;
    const lang = res.lang === "en" || res.lang === "zh" ? res.lang : "th", ct = t => calmText(t, lang);
    const out = Object.assign({}, res);
    delete out.plan;
    let secs = res.sections.map(s => {
      const ps = (s.paragraphs || []).map(ct).filter(p => p.trim());
      const n = (s.paragraphs || []).length, main = typeof s.main === "number" && s.main > 0 && s.main < n ? Math.max(1, Math.min(ps.length, s.main)) : s.main;
      const o = Object.assign({}, s, { paragraphs: ps, main });
      if (s.id === "advice" || (s.title && adviceKind(s.title) && /^(?:lucky|purchase|remedy)$/.test(adviceKind(s.title)))) o.title = CALM_ADVICE[lang]; // "…และเคล็ดเสริมดวง" → "คำแนะนำ"
      return o;
    }).filter(s => s.paragraphs.length);
    if (!secs.length) secs = [{ id: "overview", title: (res.sections[0] && res.sections[0].title) || "", paragraphs: [HOPE[lang].open] }];
    out.sections = secs;
    if (res.summary && Array.isArray(res.summary.lines)) out.summary = Object.assign({}, res.summary, { lines: res.summary.lines.map(l => Object.assign({}, l, { t: ct(l.t) })).filter(l => l.t) });
    if (res.why && Array.isArray(res.why.lines)) out.why = Object.assign({}, res.why, { lines: res.why.lines.map(l => Object.assign({}, l, { t: ct(l.t) })).filter(l => l.t) });
    out.hope = hope(lang);
    out.calm = true;
    return out;
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
  /** the page's current field values are the ones the reader continued past @param {any} [doc] */
  function acked(doc) {
    const d = docOf(doc);
    if (!d || typeof d !== "object" || !CONTINUED || !CONTINUED.has(d)) return false;
    return fields(d) === CONTINUED.get(d);
  }
  /** a hard-net signal in the page's fields that the reader has not continued past @param {any} [doc] */
  function pending(doc) { const f = fields(doc); return !!f && check(f) && !acked(doc); }

  // a fortune page opened later in a calm session is calm from the start
  try { if (root.document && sessionOn()) markCalm(root.document); } catch (e) { /* no DOM */ }
  // crisis flow v2: a calm page without a reading (fortune hub, planner, lucky colour) gets the pinned help bar at the bottom
  try {
    const d = root.document;
    const bar = () => { try { if (calmOn(d) && !(/** @type {any} */ (root).FortuneAI)) pageBar(d); } catch (e) { /* no DOM */ } };
    if (d && typeof d.addEventListener === "function") { if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", bar); else bar(); }
  } catch (e) { /* no DOM */ }

  const api = { check, unjoke, fields, soft, softName, plainName, pageSoft, ack, renderSoft, softGate, softText, HELP, helpLine, helpHTML, active, setActive, allow,
    calmOn, setCalm, markCalm, calmDock, distress, SESSION_KEY,
    adviceKind, fatalistic, calmText, HOPE, hope, helpBar, pageBar, continued, acked, pending, WORDS, CARD, calmReading, withoutTyped };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else /** @type {any} */ (root).LQFortuneCrisis = api;
})(typeof window !== "undefined" ? window : globalThis);
