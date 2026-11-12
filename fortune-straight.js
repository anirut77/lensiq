/* fortune-straight.js — Part C of the owner order 2026-11-12: honest negative readings ("ดูตรง ๆ / Read it straight / 直说").
 * NOT DEPLOYED: lensiq-config.js sets window.LENSIQ_FORTUNE_STRAIGHT = false until the owner approves
 * docs/FORTUNE-HONEST-READINGS.md. Split out of fortune-ai.js (size cap). Loaded before fortune-ai.js on every fortune page;
 * fortune-ai.js requires it in Node. Holds: the hard limits (both modes), the honest-negative phrases straight mode lets
 * through, the straight lead lexicon (TH/EN/ZH), the user's per-device choice and the control.
 * Tests: tests/unit/fortune-honest.test.js (locked before building, sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256)
 * and tests/e2e/fortune-straight.e2e.mjs. */
(function (root) {
  "use strict";
  /* โหมดตรง: บอกผลไม่ดีตามที่ศาสตร์คำนวณได้ตรง ๆ (ช่วงดวงอ่อน เงิน งาน ความสัมพันธ์ นิสัยสุขภาพ การเดินทาง ความขัดแย้ง อุปสรรค
     การสูญเสีย คนไม่หวังดี) แต่ข้อห้ามเด็ดขาด (hardLimit) ใช้กับทั้งสองโหมด:
       (1) ความตาย โรคร้ายระยะสุดท้าย อุบัติเหตุที่ฟันธงหรือระบุวัน  (2) สั่งหยุดยา/การรักษา สั่งลงทุนเฉพาะเจาะจง สั่งเลิกกับคนรัก
       (3) ตาข่ายวิกฤตมาก่อนเสมอ (ใน fortune-ai.js compose/interpret)  (4) ห้ามขายความกลัว: "ถ้าไม่จ่าย/ไม่ทำพิธี เรื่องร้ายจะเกิด"
       และยังห้าม: เลขเสี่ยงโชค คำแนะนำทางการแพทย์/ศัลยกรรม การอ่านอารมณ์หรือการโกหกของผู้ใช้/คนรัก */
  /** one RegExp from several parts (keeps long alternations readable) @param {string} flags @param {...RegExp} parts */
  const rx = (flags, ...parts) => new RegExp(parts.map(p => p.source).join("|"), flags);
  /** @type {Record<string, RegExp>} */
  const HL_TH = {
    "1:death": /เสียชีวิต|ความตาย(?!ตัว)|ตายก่อน|ตายเร็ว|จะตาย(?!ตัว)|ถึงตาย|ตายโหง|อายุสั้น|สิ้นใจ|มรณะ|ถึงแก่ชีวิต|(?:อุบัติเหตุ|อันตราย|เจ็บ)[^\s]{0,6}ถึงชีวิต|ถึงแก่กรรม|หมดอายุขัย/,
    "1:terminal": /ระยะสุดท้าย|โรคร้าย|รักษาไม่หาย|ป่วยหนัก|ป่วยเป็นมะเร็ง|เป็นมะเร็ง|พิการ|เนื้องอก|ติดเตียง/,
    "2:medication": rx("", /(?:หยุด|เลิก|งด)(?:การ)?(?:กิน|ทาน|ใช้)?ยา(?![กวมยงนสใ])|ไม่ต้อง(?:รักษา|กินยา|ทานยา|ฟอกไต|ทำคีโม|ให้คีโม|ฉายแสง)|(?:เลิก|หยุด)(?:การ)?รักษา/,
      /ทิ้งยา|หยุด(?:ให้|ทำ)?(?:คีโม|เคมีบำบัด|ฉายแสง|ฟอกไต)/),
    "2:invest": /(?:ลงทุน|ซื้อ)(?:ใน)?(?:ซื้อ)?(?:หุ้น|ทองคำ|ทอง(?=\s|$|และ|หรือ|แท่ง|รูปพรรณ|เลย|ไว้)|บิตคอยน์|คริปโต|กองทุน|ที่ดิน|คอนโด|อสังหา)/,
    "2:end-relationship": /(?:ควร|ต้อง|ให้|ลอง)(?:จะ)?(?:เลิกกับ|เลิกรา|เลิกคบ|บอกเลิก|หย่า|ตัดขาด(?:กับ)?(?:แฟน|คนรัก|คู่))|เลิกกับ(?:เขา|เธอ|แฟน|คนนี้)(?:ซะ|เถอะ|เลย|ไปเลย)/,
    "4:fear-selling": rx("", /(?:ถ้า|หาก)(?:คุณ)?ไม่(?:ได้)?(?:ทำบุญ|แก้(?:ชง|ดวง|กรรม)?|สะเดาะ|ทำพิธี|บูชา|จ่าย|ซื้อ|ถวาย)/,
      /ต้อง(?:ทำบุญ|ทำพิธี|จ่าย|บริจาค|บูชา|สะเดาะเคราะห์|ถวาย)[^\s]{0,10}ถึงจะ|(?:ไม่หาย|ไม่พ้น|ไม่ดีขึ้น|ไม่ผ่าน)จนกว่า(?:จะ)?(?:ทำบุญ|ทำพิธี|จ่าย|บูชา|สะเดาะ|บริจาค)/,
      /(?:ทำบุญ|แก้ชง|สะเดาะ|ทำพิธี|บูชา|จ่าย|ซื้อ|ถวาย)[\s\S]{0,40}?(?:ไม่งั้น|ไม่อย่างนั้น|มิฉะนั้น)/, /(?:หาย|พ้น|รอด|ผ่าน)(?:เคราะห์)?(?:ก็)?ต่อเมื่อ/),
    "keep:emotion": /(?:จาก|ดู)(?:สีหน้า|ใบหน้า|แววตา|ท่าทาง|น้ำเสียง)(?:ของคุณ)?[\s\S]{0,12}(?:เศร้า|เครียด|โกรธ|กังวล|ไม่มีความสุข|โกหก|ซึมเศร้า)/,
  };
  /** @type {Record<string, RegExp>} */
  const HL_EN = {
    "1:death": /\b(?:die|dies|dying|death|dead|pass(?:es|ed)? away|short life|early grave|fatal|days are numbered)\b/i,
    "1:terminal": /\bterminal(?:ly)?\b|\bincurable\b|\bcancer\b|\btumou?rs?\b|\bbedridden\b/i,
    "2:medication": /\b(?:stop|skip|quit|drop)(?:ping)? (?:taking )?(?:your )?(?:medication|medicine|meds|pills|treatment|chemo\w*|dialysis)\b/i,
    "2:invest": rx("i", /\binvest(?:ing)? (?:in|your (?:money|savings) in) (?:gold|stocks?|shares|bitcoin|crypto\w*|funds?|property|real estate|land)\b/,
      /\binvest(?:ing)? in this (?:company|stock|fund|coin)\b/, /\bbuy(?:ing)? (?:shares|stocks?|gold|bitcoin|crypto\w*|property|real estate|land)\b/,
      /\bbuy(?:ing)? [A-Z]\w+ (?:stock|shares)\b/, /\binvest(?:ing)? in [A-Z]\w+\b/),
    "2:end-relationship": rx("i", /\b(?:should|need to|must|better|time to|have to)\s+(?:break up|divorce|split up|end (?:it|the relationship|your relationship))\b/,
      /\b(?:should|need to|must|better|time to|have to)\s+leave (?:him|her|them|your (?:partner|husband|wife|boyfriend|girlfriend))\b/, /\bend your relationship\b/,
      /\bleave your (?:husband|wife|partner|boyfriend|girlfriend)\b/),
    "4:fear-selling": rx("i", /\bunless you (?:pay|donate|buy|make (?:an )?offering|perform|do (?:a|the) ritual|make merit)/,
      /\bif you (?:don'?t|do not|won'?t|will not|refuse to) (?:pay|donate|buy|make (?:an )?offering|perform|make merit|do (?:a|the) ritual)/,
      /\b(?:pay|donate|buy)\b[^.]{0,40}\bor (?:else )?(?:your|the|this)\b/, /\bwithout (?:an? )?(?:offering|donation|payment|ritual|ceremony|merit)\b[^.]{0,40}\b(?:will|would)\b/),
    "keep:lottery": /\bplay \d+ (?:in|on) the (?:draw|lottery|lotto)\b|\blottery\b|\blotto\b/i,
    "keep:emotion": rx("i",
      /\byour (?:face|expression|eyes|voice) (?:shows?|says?|tells?|reveals?)(?: (?:me|us))?(?: that)? you(?:'re| are)? (?:\w+ )?(?:sad|angry|stressed|anxious|lying|unhappy|depressed)\b/,
      /\byour (?:eyes|face|expression|voice) (?:look|looks|seem|seems|sound|sounds) (?:\w+ )?(?:sad|angry|stressed|anxious|unhappy|depressed|tired)\b/),
  };
  /** @type {Record<string, RegExp>} */
  const HL_ZH = {
    "1:death": /死|去世|过世|离世|離世|亡|寿命不长|短命|活不长|大限|命不久|阳寿/,
    "1:terminal": /绝症|癌|晚期|不治之症|肿瘤|卧床不起/,
    "2:medication": /停药|把药停|(?:别|不用|不要|不必)(?:再)?(?:吃药|服药)|(?:不必|不用|停止|放弃)(?:继续)?(?:治疗|化疗|透析|放疗)/,
    "2:invest": /(?:买入|买进|购买|投资|买)(?:点|些|这只|这支)?(?:股票|黄金|比特币|基金|加密货币|房产|房地产)/,
    "2:end-relationship": /(?:应该|最好|该|必须|赶紧)(?:和[^。，]{0,4})?(?:分手|离婚|断绝|离开他|离开她)|离开(?:他|她)吧|分(?:开|手)吧/,
    "4:fear-selling": rx("", /除非(?:你)?(?:花钱|付钱|付费|捐|做法事|化解|供奉|请)|不(?:化解|做法事|捐|付钱|供奉|请符)[^。]{0,12}(?:就|会)|不做法事的话/,
      /要想(?:转运|改运|化解|好运)[^。]{0,6}(?:必须|得|要)(?:捐|花钱|付|做法事|供奉|买)|买[^。]{0,8}(?:护身符|符|开运物|吉祥物)[^。]{0,10}(?:就会|就能|会)/),
    "keep:emotion": /(?:从|看)(?:你的)?(?:表情|面部|脸|眼神|声音)[^。，]{0,6}(?:伤心|难过|生气|焦虑|在说谎|不开心|抑郁)|你(?:看起来|看上去|显得)(?:很|有点|非常)?(?:难过|伤心|悲伤|不开心|焦虑|生气|抑郁)/,
    "keep:lottery": /下期(?:号码|开奖)|开奖号码|彩票/,
  };
  // อุบัติเหตุ: ใช้ได้เฉพาะแบบ "ควรระวัง" ที่ไม่ฟันธงและไม่ระบุวัน; ชนิดเฉพาะ (รถชน / car crash / 车祸) ห้ามเสมอ
  const ACC_TH = /อุบัติเหตุ|ประสบเหตุ|บาดเจ็บ/, ACC_SPECIFIC_TH = /รถชน|ชนรถ|รถคว่ำ|รถพลิก|(?:ถูก|โดน)รถ/;
  const CERT_TH = /แน่นอน|แน่\s?ๆ|ต้อง(?:เกิด|เจอ|โดน|ประสบ)|จะ(?:เกิด|ประสบ|โดน|เจอ|มี)|ฟันธง/;
  const DATE_TH = rx("", /วันที่\s*\d|\d{1,2}\s*(?:ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค)/,
    /มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม/,
    /สัปดาห์นี้|สัปดาห์หน้า|อาทิตย์หน้า|เดือนหน้า|พรุ่งนี้|มะรืน|วันนี้|คืนนี้|ภายใน\s*\d/,
    /วัน(?:จันทร์|อังคาร|พุธ|พฤหัส(?:บดี)?|ศุกร์|เสาร์|อาทิตย์)(?:หน้า|นี้)|สงกรานต์|ปีใหม่|ลอยกระทง|ตรุษจีน|\d{1,2}\/\d{1,2}|เดือน\s*\d|ปี\s*(?:25|20)\d\d|ปีหน้า/);
  const ACC_EN = /\baccidents?\b|\binjur\w*/i;
  const ACC_SPECIFIC_EN = rx("i", /\b(?:car|road|traffic|motorbike|motorcycle|bike|bus) (?:crash|accident|collision|wreck)/, /\bcrash(?:es|ed|ing)? (?:your|the|a|into)\b/,
    /\bhit by a (?:car|bus|truck)\b/);
  const CERT_EN = /\bwill\b|\bcertain(?:ly)?\b|\bdefinitely\b|\bfor sure\b|\bbound to\b|\b(?:is|are) going to\b|\bdestined\b/i;
  const DAYS = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/.source;
  const DATE_EN = rx("i", /\bon \d|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*|\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d/,
    new RegExp("\\b(?:this|next) (?:week|weekend|month|year|" + DAYS.slice(3, -1) + ")\\b|\\bon " + DAYS + "\\b"), /\btomorrow\b|\btonight\b|\btoday\b|\bwithin \d/,
    /\b(?:in|during|over|at|by) (?:January|February|March|April|May|June|July|August|September|October|November|December|New Year|Christmas|Songkran|Easter)\b/,
    /\b(?:New Year|Christmas|Songkran|Lunar New Year|Chinese New Year)\b|\b\d{1,2}\/\d{1,2}\b|\bin (?:19|20)\d\d\b/);
  const ACC_ZH = /意外|事故|受伤/, ACC_SPECIFIC_ZH = /车祸|撞车|翻车|被车撞/;
  const CERT_ZH = /一定|肯定|必定|必然|注定|铁定|会出|会发生|会遇到/;
  const DATE_ZH = /\d+\s*(?:月|日|号)|下(?:个)?(?:月|周|星期|礼拜)|这(?:个)?(?:周|星期|礼拜)|本周|明天|后天|今天|今晚|明年|今年|[一二三四五六七八九十]{1,2}月|春节|中秋|清明|端午|元旦|过年/;
  /** ข้อห้ามเด็ดขาด (ทั้งสองโหมด) → "1:death" | "1:accident" | "2:…" | "4:fear-selling" | "keep:emotion" | ""
   *  @param {string} t text already normalised by fortune-ai.js (negations and card names removed) */
  function hardLimit(t) {
    const ZOD = /\b(?:signs?|zodiac|astrology|Sun|Moon|Rising|Ascendant|season|Aries|Taurus|Gemini|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)\b|♋|ราศี|กรกฎ|巨蟹/;
    const en = ZOD.test(t) || /^\s*Cancer\s*$/.test(t) ? t.replace(/\bCancer\b/g, "") : t;
    for (const k in HL_TH) if (HL_TH[k].test(t)) { if (k === "1:terminal" && /มะเร็ง/.test(t) && !/ป่วย|โรค|ระยะ/.test(t)) continue; return k; }
    for (const k in HL_EN) if (HL_EN[k].test(k === "1:terminal" || k === "1:death" ? en : t)) return k;
    for (const k in HL_ZH) if (HL_ZH[k].test(t)) return k;
    if (ACC_SPECIFIC_TH.test(t) || ACC_SPECIFIC_EN.test(t) || ACC_SPECIFIC_ZH.test(t)) return "1:accident";
    if (ACC_TH.test(t) && (CERT_TH.test(t) || DATE_TH.test(t))) return "1:accident";
    if (ACC_EN.test(t) && (CERT_EN.test(t) || DATE_EN.test(t))) return "1:accident";
    if (ACC_ZH.test(t) && (CERT_ZH.test(t) || DATE_ZH.test(t))) return "1:accident";
    return "";
  }
  /* คำบอกผลไม่ดีแบบตรง ๆ ที่โหมดตรงยอมให้ผ่าน (ตัดออกก่อนตรวจ ส่วนอื่นของประโยคยังตรวจด้วยตัวกรองเต็มเหมือนเดิม)
     ไม่รวมคำแบบหมดหวัง/ฟันธง (หายนะ พังทลาย ชีวิตพัง ไม่มีทางรอด หมดหวัง ซวยหนัก doomed hopeless 完蛋 没有希望) — ยังถูกตัด */
  const HONEST_TH = rx("g", /ดวง(?:การเงิน|การงาน|ความรัก|โดยรวม|ของคุณ)?(?:ช่วงนี้)?(?:ตก|อ่อน|ไม่ดี|ไม่ค่อยดี)|ช่วงดวงตก|เคราะห์ร้าย(?:เล็ก\s?ๆ\s?น้อย\s?ๆ|เล็กน้อย)?|เคราะห์/,
    /อับโชค|โชคไม่ดี|อัปมงคล|ซวย(?!หนัก)|(?:ควร)?ระวัง(?:เรื่อง)?อุบัติเหตุ|เสี่ยง(?:ต่อ)?(?:การเกิด)?อุบัติเหตุ/,
    /สุขภาพ(?:ไม่ค่อยดี|ไม่ดี|อ่อนแอ|ถดถอย|แย่ลง)|ร่างกาย(?:อ่อนล้า|อ่อนแอ)(?:ง่าย)?|เสียเงิน|สูญเสีย(?:เงิน|ทรัพย์|ของ)|ของหาย/,
    /คนไม่หวังดี|คนคิดร้าย|มีปากเสียง|ทะเลาะ|ขัดแย้ง|ผิดใจ|อุปสรรค|ติดขัด|ล่าช้า/);
  const HONEST_EN = rx("gi", /\b(?:bad luck|unlucky|misfortune|low luck|luck is low|weak (?:period|spell|patch)|(?:risk|chance) of (?:an )?accidents?)\b/,
    /\bcareful\b[^.]{0,40}\baccidents?\b|\baccidents? (?:or|and) lost (?:belongings|things)\b/, /\b(?:lose money|losses|setbacks?|people who wish you ill|ill-wishers?)\b/);
  const HONEST_ZH = /(?:整体)?运势低迷|财运低迷|运势不佳|运气不好|倒霉|厄运|(?:小心|当心|注意|提防)(?:意外|交通|小人)|破财|小人|不顺|阻碍/g;
  const stripHonest = (/** @type {string} */ t) => t.replace(HONEST_TH, " ").replace(HONEST_EN, " ").replace(HONEST_ZH, "，");
  // a finding the tradition itself names as unfavourable (its Thai label) counts as a caution in straight mode
  const LABEL_NEG = /อุปสรรค|กาลกิณี|ปีชง|อัปมงคล|เคราะห์|ขัดแย้ง|ขึ้นลง/;
  /** @type {Record<string, string>} */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const escapeHtml = (/** @type {any} */ s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ESC[c]);
  /* ---- ตัวเลือก "ดูตรง ๆ" ของผู้ใช้ (จำไว้ในเครื่อง localStorage "lq-fortune-straight" = { adult, straight }) ----
     เสนอเมื่อเปิดสวิตช์ window.LENSIQ_FORTUNE_STRAIGHT เท่านั้น · ต้องยืนยันว่าอายุ 18 ปีขึ้นไปก่อน · ยืนยันแล้วค่าเริ่มต้นคือ "ตรง"
     ยังไม่ยืนยัน = ถ้อยคำนุ่มนวล (โหมดเดิม) เสมอ */
  const STRAIGHT_KEY = "lq-fortune-straight";
  const straightEnabled = () => /** @type {any} */ (root).LENSIQ_FORTUNE_STRAIGHT === true;
  /** @returns {{ adult: boolean, straight: boolean }} */
  function straightGet() {
    let v = null;
    try { const ls = root.localStorage; v = ls ? JSON.parse(ls.getItem(STRAIGHT_KEY) || "null") : null; } catch (e) { v = null; }
    return { adult: !!(v && v.adult === true), straight: !(v && v.straight === false) };
  }
  /** @param {{ adult?: boolean, straight?: boolean }} [p] */
  function straightSet(p) {
    const v = Object.assign(straightGet(), p || {}), out = { adult: v.adult === true, straight: v.straight !== false };
    try { const ls = root.localStorage; if (ls) ls.setItem(STRAIGHT_KEY, JSON.stringify(out)); } catch (e) { /* โหมดส่วนตัว: จำไม่ได้ จึงกลับเป็นถ้อยคำนุ่มนวล */ }
    return out;
  }
  const straightActive = () => { if (!straightEnabled()) return false; const p = straightGet(); return p.adult && p.straight; };
  /* ประโยคนำของจุดที่ศาสตร์ชี้ว่าไม่ดี — โหมดตรง: บอกผลตรง ๆ (ไม่ฟันธง ไม่ระบุวัน ไม่ขู่ ไม่แต่งเหตุการณ์ที่ศาสตร์ไม่ได้บอก)
     แล้วตามด้วยสิ่งที่ทำได้เหมือนเดิม */
  const STRAIGHT_LEAD = {
    th: {
      money: ["พูดกันตรง ๆ ด้านการเงินช่วงนี้ดวงตก มีเกณฑ์เสียเงินหรือมีรายจ่ายเกินคาด", "ตามหลักของศาสตร์นี้ ดวงการเงินช่วงนี้อ่อน เงินเข้าช้าและเก็บเงินได้ยากกว่าปกติ"],
      work: ["พูดกันตรง ๆ ดวงการงานช่วงนี้มีอุปสรรค งานอาจติดขัดหรือล่าช้ากว่าที่หวัง", "ตามหลักของศาสตร์นี้ ด้านการงานช่วงนี้ดวงอ่อน มีเกณฑ์ขัดแย้งกับคนรอบตัว และอาจมีคนไม่หวังดี"],
      love: ["พูดกันตรง ๆ ความสัมพันธ์ช่วงนี้มีเกณฑ์ทะเลาะหรือผิดใจกัน", "ตามหลักของศาสตร์นี้ เรื่องหัวใจช่วงนี้ดวงอ่อน ขัดแย้งและห่างเหินกันได้ง่าย"],
      overview: ["พูดกันตรง ๆ ดวงของคุณมีจุดที่ตามหลักของศาสตร์นี้นับเป็นผลไม่ดี และทำให้ดวงอ่อนลงในช่วงนี้", "ตามหลักของศาสตร์นี้ มีผลที่ไม่ดีอยู่ในดวง ช่วงนี้ดวงอ่อนและมีอุปสรรคมากกว่าปกติ"],
    },
    zh: {
      money: ["直说吧，这段时间财运低迷，容易破财或有计划外的开支", "照直讲，财务上正处在不顺的时期，进账慢，钱也比平时难存"],
      work: ["直说吧，工作上阻碍多，事情容易拖延受阻", "照直讲，这段时间工作不顺，容易和身边的人起冲突，也要提防小人"],
      love: ["直说吧，感情上容易争执、互不相让", "照直讲，这段时间感情不顺，容易冲突或疏远"],
      overview: ["直说吧，你的命盘里有不顺的一面，按规则算是不利的结果", "照直讲，按这门命理的规则，命盘里有不利的一项，这段时间阻碍会比平时多"],
    },
    en: {
      money: ["To put it plainly, this is a weak period for money, with losses or costs you did not plan for",
        "Straight answer: money is in a weak spell, income comes in slowly and saving is harder than usual"],
      work: ["To put it plainly, work faces obstacles now, with delays and setbacks", "Straight answer: work is in a weak spell, with conflict around you and people who wish you ill"],
      love: ["To put it plainly, the relationship is in a weak spell, and arguments come easily",
        "Straight answer: matters of the heart are in a weak period, and conflict or distance can build up"],
      overview: ["To put it plainly, your chart has a weak patch here, and by the tradition's rules it counts as an unfavourable result",
        "Straight answer: by the rules of this tradition there is an unfavourable sign in your chart, a weak period when obstacles come more often than usual"],
    },
  };
  /* owner decision 2026-11-12: a permanent birth-chart feature (BaZi strength / weakest element, Taksa kalakini bhumi, lek 7 base)
     is not "this period": it gets a birth-chart lead; "this period" stays for time-based findings (ชง, luck pillars, yearly) */
  const NATAL_RE = /^(?:str\.|el\.lo\.|bazi\.lack\.|tk\.kalakini\.|l\d+\.\d+\.caution)/;
  const isNatal = (/** @type {any} */ it) => !!(it && NATAL_RE.test(String(it.id || "")));
  const NATAL_LEAD = {
    th: {
      money: ["ตามดวงกำเนิด จุดที่ต้องระวังของคุณคือเรื่องเงิน ดวงการเงินอ่อนโดยพื้นฐาน เก็บเงินได้ยากกว่าคนทั่วไป"],
      work: ["ตามดวงกำเนิด จุดที่ต้องระวังของคุณคือเรื่องงาน งานมักมีอุปสรรคและติดขัดง่าย"],
      love: ["ตามดวงกำเนิด จุดที่ต้องระวังของคุณคือเรื่องความรัก มักมีเกณฑ์ขัดแย้งหรือผิดใจกันง่าย"],
      overview: ["ตามดวงกำเนิด จุดที่ต้องระวังของคุณคือจุดนี้ ซึ่งตามหลักของศาสตร์นี้เป็นจุดที่ดวงอ่อน"],
    },
    zh: {
      money: ["按命盘，你需要注意的是财运，容易破财或有计划外的开支"], work: ["按命盘，你需要注意的是事业，容易遇到阻碍和拖延"],
      love: ["按命盘，你需要注意的是感情，容易争执、互不相让"], overview: ["按命盘，你需要注意的是这一点，按规则属于不顺的一面"],
    },
    en: {
      money: ["By your birth chart, the point to watch is money, where losses or costs you did not plan for come more easily"],
      work: ["By your birth chart, the point to watch is work, where obstacles and delays come more easily"],
      love: ["By your birth chart, the point to watch is your relationships, where arguments and conflict come easily"],
      overview: ["By your birth chart, the point to watch is this one, which by the tradition's rules is a weak patch"],
    },
  };
  /* owner decision 2026-11-12: while the crisis state (FortuneAI.crisis.active), the soft step or the support card is active, readings are
     gentle and carry no remedy or lucky-item text (fortune-crisis.js: the fields and the soft words; the DOM: a card or a step) */
  const CRM = (typeof module !== "undefined" && module.exports && typeof require === "function" ? require("./fortune-crisis.js") : root.LQFortuneCrisis) || null;
  /** @param {any} [doc] */
  function calm(doc) {
    try {
      const d = doc || root.document, t = CRM && d ? CRM.fields(d) : "";
      // one crisis state: the page-level state (fortune-crisis.js active(), <html data-lq-crisis>) plus the field checks
      if (CRM && CRM.active && CRM.active(d)) return true;
      return !!((t && CRM && (CRM.check(t) || CRM.soft(t))) || (d && typeof d.querySelector === "function" && d.querySelector(".fa-support, .fa-soft")));
    } catch (e) { return false; }
  }
  // ข้อความของตัวเลือก (ไทย / อังกฤษ / จีน)
  const STRAIGHT_TEXT = {
    th: { label: "ดูตรง ๆ", adult: "ฉันอายุ 18 ปีขึ้นไป และขอให้บอกผลตามศาสตร์แบบไม่อ้อมค้อม",
      hint: "บอกช่วงดวงอ่อนและเรื่องที่ต้องระวังตรง ๆ ตามที่ศาสตร์คำนวณได้ ไม่ทำนายความตาย โรคร้าย หรืออุบัติเหตุแบบฟันธง " +
        "ไม่สั่งหยุดยา ลงทุน หรือเลิกกับใคร และไม่มีการขายพิธีแก้ดวง",
      gentle: "ถ้ายังไม่ยืนยันอายุ คำอ่านจะใช้ถ้อยคำนุ่มนวลตามเดิม", next: "จำไว้ในเครื่องนี้แล้ว มีผลกับคำอ่านครั้งถัดไป" },
    en: { label: "Read it straight", adult: "I am 18 or older and want the result stated plainly",
      hint: "States weak periods and what to watch out for as the tradition's rules give them. No predictions of death, terminal illness or a " +
        "certain accident, no instructions to stop treatment, invest or leave someone, and no paid rituals.",
      gentle: "Until you confirm your age, readings keep the gentler wording", next: "Saved on this device; applies to your next reading" },
    zh: { label: "直说模式", adult: "我已年满 18 岁，希望直接说明结果",
      hint: "按传统规则直接说明运势低迷的时期和需要注意的地方。不预言死亡、绝症或确定的意外，不叫你停止治疗、投资或离开某人，也不推销任何付费化解。",
      gentle: "确认年龄之前，解读仍使用较温和的措辞", next: "已保存在本设备，下次解读生效" },
  };
  const straightText = (/** @type {string} */ lang) => STRAIGHT_TEXT[lang === "zh" || lang === "en" ? lang : "th"];
  /** @param {string} lang */
  function straightControlHTML(lang) {
    const t = straightText(lang), p = straightGet();
    return '<div class="fa-straight" role="group" aria-label="' + escapeHtml(t.label) + '">' +
      '<label><input type="checkbox" data-fs="adult"' + (p.adult ? " checked" : "") + "> <span>" + escapeHtml(t.adult) + "</span></label>" +
      '<label><input type="checkbox" data-fs="straight"' + (p.adult && p.straight ? " checked" : "") + (p.adult ? "" : " disabled") + "> <b>" + escapeHtml(t.label) + "</b></label>" +
      '<p class="fa-straight-hint">' + escapeHtml(p.adult ? t.hint : t.gentle) + "</p>" +
      '<p class="fa-straight-next" role="status" hidden>' + escapeHtml(t.next) + "</p></div>";
  }
  const STRAIGHT_CSS = ".fa-straight{border:1px dashed rgba(103,79,242,.4);border-radius:12px;padding:.6em .9em;margin:.2em 0 1em;font-size:.92em;line-height:1.5}" +
    ".fa-straight label{display:flex;gap:.5em;align-items:flex-start;cursor:pointer;min-height:32px}.fa-straight p{margin:.3em 0 0;opacity:.85}";
  /** the control, drawn above a reading by FortuneAI.renderSections when the flag is on @param {Element} container @param {string} lang */
  function straightControl(container, lang) {
    const doc = container.ownerDocument || root.document;
    try {
      if (!doc.getElementById("fa-straight-style")) { const st = doc.createElement("style"); st.id = "fa-straight-style"; st.textContent = STRAIGHT_CSS; doc.head.appendChild(st); }
    } catch (e) { /* ไม่มี DOM */ }
    const wrap = doc.createElement("div");
    wrap.innerHTML = straightControlHTML(lang); // ข้อความคงที่ของเราเอง ผ่าน escapeHtml แล้ว
    const box = /** @type {HTMLElement} */ (wrap.firstChild), t = straightText(lang);
    const a = /** @type {HTMLInputElement} */ (box.querySelector('[data-fs="adult"]')), s = /** @type {HTMLInputElement} */ (box.querySelector('[data-fs="straight"]'));
    const hint = /** @type {HTMLElement} */ (box.querySelector(".fa-straight-hint")), next = /** @type {HTMLElement} */ (box.querySelector(".fa-straight-next"));
    a.addEventListener("change", () => {
      const p = straightSet({ adult: a.checked });
      s.disabled = !p.adult; s.checked = p.adult && p.straight; hint.textContent = p.adult ? t.hint : t.gentle; next.hidden = false;
    });
    s.addEventListener("change", () => { straightSet({ straight: s.checked }); next.hidden = false; });
    return box;
  }
  const api = { hardLimit, stripHonest, LABEL_NEG, LEADS: STRAIGHT_LEAD, NATAL_LEADS: NATAL_LEAD, isNatal, calm, enabled: straightEnabled, active: straightActive, get: straightGet, set: straightSet,
    text: straightText, controlHTML: straightControlHTML, control: straightControl };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else /** @type {any} */ (root).LQFortuneStraight = api;
})(typeof window !== "undefined" ? window : globalThis);
