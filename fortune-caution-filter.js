/* fortune-caution-filter.js — the own filter of the "สิ่งที่ควรระวัง" section (owner item 177; design 4(d) + owner refinement
 * 2026-11-20): "be careful" wording only, never certain, never a prohibition; accidents, illness and travel never with a single
 * day or date and never under a one-day period (month ranges are fine); people only in broad terms; broad body areas allowed, no
 * diagnosis or treatment; luck lines say "may"; guidance is a mindset or a good deed with no amount, named recipient, big
 * donation, ritual sequence or link; plus the shared hard limits of fortune-straight.js. The illness relaxation applies to this
 * section only (fortune-ai.js isSafe is unchanged). Used in Node by fortune-caution-core.js and by tools/fortune-caution-pack.mjs,
 * which writes a browser pack only from texts this filter allows, so the browser does not load it. */
(function (root) {
  "use strict";
  var NODE = typeof module !== "undefined" && module.exports && typeof require === "function";
  /** @param {string} flags @param {...RegExp} parts */
  var rx = function (flags) { return new RegExp([].slice.call(arguments, 1).map(function (r) { return r.source; }).join("|"), flags); };
  var MONTHS_TH = "ม\\.ค|ก\\.พ|มี\\.ค|เม\\.ย|พ\\.ค|มิ\\.ย|ก\\.ค|ส\\.ค|ก\\.ย|ต\\.ค|พ\\.ย|ธ\\.ค|มกรา|กุมภา|มีนา|เมษา|พฤษภา|มิถุนา|กรกฎา|สิงหา|กันยา|ตุลา|พฤศจิกา|ธันวา";
  var RE = {
    // a single day or a full date (month names and month ranges alone are allowed)
    day: rx("i", new RegExp("วันที่\\s*\\d|\\d{1,2}\\s*(?:" + MONTHS_TH + ")|\\d{1,2}\\s*/\\s*\\d{1,2}|วัน(?:จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)|วันนี้|พรุ่งนี้|มะรืน|คืนนี้"),
      /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b|\bon (?:the )?\d/,
      /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b|\btoday\b|\btomorrow\b|\btonight\b/,
      /\d+\s*(?:日|号)|[一二三四五六七八九十]+(?:日|号)|星期[一二三四五六日天]|周[一二三四五六日]|礼拜[一二三四五六日天]|今天|明天|后天|今晚/),
    accIllTravel: /อุบัติเหตุ|บาดเจ็บ|ป่วย|ไม่สบาย|เป็นไข้|เจ็บ|เดินทาง|\baccident|\binjur|\bill\b|\billness|\bsick|\bfever|\bunwell|\btravel|意外|事故|受伤|生病|发烧|不适|出行|旅行|出门|远行/i,
    accType: /รถชน|ชนรถ|รถคว่ำ|รถพลิก|(?:ถูก|โดน)รถ|\b(?:car|road|traffic|motorbike|motorcycle|bike|bus) (?:crash|accident|collision|wreck)|\bcrash|\bhit by a (?:car|bus|truck)\b|车祸|撞车|翻车|被车撞/i,
    cert: /แน่นอน|แน่\s?ๆ|ต้องเกิด|จะเกิด|จะเจอ|จะโดน|จะประสบ|ฟันธง|\b(?:will|certain|certainly|definitely|for sure|bound to|destined)\b|一定|肯定|必定|必然|注定|铁定/i,
    caution: /ระวัง|ใส่ใจ|\bbe careful\b|\bbe mindful\b|\bwatch\b|\bcareful\b|\bmindful\b|留意|小心|注意/i,
    may: /อาจ|\b(?:may|might|could)\b|可能|或许|也许|有望/i,
    promise: /แน่นอน|จะได้|รับรอง|ได้แน่|การันตี|\b(?:will|guaranteed?|sure to|certain to)\b|一定|必定|保证|肯定会|必然/i,
    prohib: /ห้าม|อย่า(?!ง)|ต้องไม่|จงอย่า|\bmust not\b|\bmustn'?t\b|\bnever\b|\bdon'?t\b|\bdo not\b|\bforbidden\b|\bprohibit\w*|禁止|不要|不许|不可以|切勿|千万别|不得|严禁/i,
    death: /ตาย|เสียชีวิต|สิ้นใจ|อายุสั้น|มรณะ|ถึงชีวิต|\b(?:die|dies|dying|death|dead|fatal|pass(?:es|ed)? away|short life)\b|死|去世|过世|离世|短命|寿命/i,
    terminal: /มะเร็ง|โรคร้าย|ระยะสุดท้าย|รักษาไม่หาย|\b(?:cancer|terminal|incurable|tumou?r)\b|癌|绝症|晚期|肿瘤/i,
    medication: rx("i", /(?:หยุด|เลิก|งด)(?:การ)?(?:กิน|ทาน|ใช้)?ยา|(?:หยุด|เลิก)(?:การ)?รักษา|ไม่ต้อง(?:รักษา|หาหมอ|พบแพทย์|ไปหาหมอ)/,
      /\b(?:stop|skip|quit|drop)\w* (?:taking )?(?:your )?(?:medication|medicine|meds|treatment|chemo)|no need to see a doctor/, /停药|不用(?:吃药|治疗|看医生)|不必(?:吃药|治疗)|放弃治疗/),
    med: rx("i", /ชื่อยา|ขนาดยา|กินยา|ทานยา|พาราเซตามอล|สมุนไพร|รักษาด้วย|เป็นโรค|วินิจฉัย/,
      /\b(?:take \d|mg\b|dose|dosage|paracetamol|herbs?|cure|diagnos\w*|you have (?:diabetes|a disease))/, /服用|剂量|毫克|草药|治好|诊断|得了\S*病/),
    asset: /หุ้น|ทองคำ|คริปโต|บิตคอยน์|กองทุน|ที่ดิน|คอนโด|อสังหา|\b(?:stocks?|shares|gold|bitcoin|crypto\w*|funds?|real estate|property|land)\b|股票|黄金|比特币|基金|加密货币|房产|房地产/i,
    endRel: rx("i", /เลิกกับ|เลิกรา|บอกเลิก|หย่า|ตัดขาด|分手|离婚|断绝/, /\b(?:break up|divorce|split up|end (?:it|the relationship|your relationship))\b/,
      /\bleave (?:him|her|them|your (?:partner|husband|wife|boyfriend|girlfriend))\b/),
    fear: rx("i", /(?:ถ้า|หาก)(?:คุณ)?ไม่(?:ได้)?(?:ทำบุญ|แก้|สะเดาะ|ทำพิธี|บูชา|จ่าย|ซื้อ|ถวาย|บริจาค)|ไม่งั้น|ไม่อย่างนั้น|มิฉะนั้น|จนกว่า(?:จะ)?(?:ทำบุญ|จ่าย|บริจาค|ทำพิธี)/,
      /\bunless you\b|\bor else\b|\bif you (?:don'?t|do not)\b|除非|否则|不化解/),
    merit: rx("i", /ทำบุญ(?:ให้)?(?:หนัก|ใหญ่|มาก ๆ|เยอะ ๆ)|ทำบุญ\s*\d+\s*วัด|(?:บริจาค|ถวาย|ทำบุญ)[^\s]{0,12}\d[\d,]*\s*(?:บาท|฿)|สะเดาะเคราะห์|ทำพิธี|บวช(?:แก้|สะเดาะ)/,
      /ปล่อย(?:ปลา|นก|สัตว์)\s*\d+|ไหว้(?:ให้)?ครบ\s*\d+|ยิ่งทำบุญมากยิ่ง|ต้องทำบุญ|บริจาค(?:เยอะ|มาก|ก้อนใหญ่|ทั้งหมด)|ก้อนใหญ่/,
      /\b(?:large|big|generous|major|huge) (?:donation|offering|gift)s?\b|\b(?:elaborate|expensive|costly) (?:ritual|ceremon)|\bmake merit at \d+|\bdonate \S*\d|\bthe more you (?:give|donate)\b/,
      /\bmust (?:donate|make merit)\b|大做法事|做法事|捐(?:一大笔|巨款|大笔|很多|大量)|重金|(?:拜|去)\s*\d+\s*(?:座|间)(?:庙|寺)|越捐越|必须(?:捐|供奉|做法事)|请大师|大笔/),
    lottery: rx("i", /หวย|ลอตเตอรี|ล็อตเตอรี|สลาก|เลขเด็ด|เลขนำโชค|เลขเสี่ยงโชค|แทง(?:หวย|บอล)|พนัน|คาสิโน|บาคาร่า|เสี่ยงโชค|ถูกรางวัล/,
      /\blotter(?:y|ies)\b|\blotto\b|\bticket|\bgambl|\bbet(?:ting|s)?\b|\bcasino|\bjackpot|\bscratch card|\blucky numbers?\b/, /彩票|博彩|赌|下注|中奖|六合彩|幸运号码/,
      /(?:โชค|luck|运)[\s\S]{0,20}\d{2,6}|\d{2,6}[\s\S]{0,20}(?:โชค|luck|运)/),
    sales: /บาท|ราคา|ซื้อ|สั่ง|ร้าน|โปรโมชัน|แพ็กเกจ|สมาชิก|ปลดล็อก|\b(?:price|buy|order|shop|unlock|premium)|价格|购买|下单|商店|解锁|会员|https?:|www\.|\.com\b|<a\b|href/i,
    money: /฿|\bbaht\b|\bdollars?\b|\$|泰铢|块钱|\d+\s*元/i,
    people: rx("i", /คนจีน|คนไทย|คนลาว|คนพม่า|คนเขมร|ฝรั่ง|แขก|ชาวต่างชาติ|ต่างด้าว|มุสลิม|อิสลาม|คริสต์|พุทธ|ฮินดู|คนผิว|คนเกิดปี|คนชื่อ|ผู้ชาย|ผู้หญิง|ผม(?:ยาว|สั้น)|ใส่แว่น/,
      /\b(?:Chinese|Thai|Lao|Burmese|Khmer|foreigners?|Muslims?|Islam\w*|Christians?|Buddhists?|Hindus?|Jews?|Jewish|black|white|named|men|women|man with|woman with|born in the year)\b/,
      /华人|中国人|泰国人|外国人|老外|穆斯林|基督徒|佛教徒|印度教|属[鼠牛虎兔龙蛇马羊猴鸡狗猪]|男人|女人|戴眼镜/),
    recipient: /วัด[ก-ฮ]|มูลนิธิ[ก-ฮ]|โรงพยาบาล[ก-ฮ]|\b[A-Z][a-z]+ (?:Temple|Foundation|Hospital|Church|Mosque|Shrine)\b|\bWat [A-Z]|[一-鿿]{1,4}寺(?!庙)|基金会/,
    ritual: /แล้วจึง|จุดธูป|สวดมนต์\s*\d|ถวายสังฆทาน|พิธี|\britual|ceremon|incense|then (?:light|chant|pray)|仪式|法事|上香|烧香|然后(?:拜|念)/i,
    /* independent review of wave 0 (2026-11-20): general rules for each gap the reviewer's probes found */
    certLoss: /จะ(?:เสีย|ป่วย|เจ็บ|สูญ|ขาดทุน|โดน|ถูกโกง|แย่)|(?:你|您)?会(?:破财|生病|患病|出事|失去|损失|倒霉|受伤|遇到麻烦|赔)|\byou will (?:lose|fall|get sick|be ill)/i,
    prohib2: /ไม่ควร|\bat all costs\b|\bavoid\b[^.]*\bat all\b|不应该|不宜/i,
    accType2: rx("i", /มอเตอร์ไซค์|รถล้ม|จมน้ำ|ไฟไหม้|เพลิงไหม้|เลือดตกยางออก|ถูกแทง|ถูกยิง|ตกที่สูง|ไฟดูด/,
      /\b(?:drown\w*|bloodshed|blood|fire|motorbike|motorcycle|stabb\w*|shot|electrocut\w*)\b|溺水|火灾|失火|血光|淹|摔车|触电/),
    disease: rx("i", /โรค|หัวใจวาย|เบาหวาน|ความดันสูง|อัมพาต|ไมเกรน/,
      /\b(?:heart (?:disease|attack)|diabetes|stroke|hypertension|asthma|covid|migraine|kidney disease|liver disease)\b/,
      /心脏病|糖尿病|高血压|中风|哮喘|心梗|肝病|肾病|偏头痛/),
    remedy: rx("i", /เพื่อรักษา|รักษาอาการ|รักษาโรค|แก้โรค|(?:ดื่ม|กิน|ทาน)\S{0,16}ทุกวัน\S{0,6}(?:รักษา|หาย)/,
      /\b(?:to (?:treat|cure|heal)|remedy for|treatment for)\b|治疗|治病|疗法|偏方|调理/),
    person: rx("", /(?<!เ)ชื่อ\s?[ก-ฮ]|ที่ชื่อ|คนที่(?:ขับ|ใส่|สวม|มีรถ)|(?:รถ|เสื้อ|ผม)สี[ก-๙]/,
      /\b(?:with the \w+ (?:car|shirt|hair)|named|called [A-Z])\b/, /姓\S{1,2}的|叫\S{1,3}的人|开\S{0,3}车的|穿\S{0,4}的人/),
    group: rx("", /คน(?:อีสาน|เหนือ|ใต้|ภาค|กรุง|ญี่ปุ่น|อินเดีย|เกาหลี|เวียดนาม|ญวน|มอญ)|คนเกิดวัน|ชาว(?:อีสาน|เขา|ญี่ปุ่น|อินเดีย|จีน)/,
      /\b(?:Indians?|Japanese|Koreans?|Vietnamese|Africans?|Europeans?|Americans?|Westerners?|Asians?|northerners|southerners|people born on)\b/,
      /日本人|韩国人|印度人|越南人|外地人|南方人|北方人|东北人|黑人|白人|洋人|星期\S出生的人/),
    asset2: /เงินดิจิทัล|เหรียญดิจิทัล|โทเคน|ฟอเร็กซ์|เทรด|\b(?:digital (?:money|currency|coins?)|tokens?|NFTs?|forex|trading)\b|数字货币|虚拟币|币圈|炒股|外汇/i,
    endRel2: /断了|散了|分开吧|เลิกคบ/,
    fear2: /(?:ถ้า|หาก)(?:คุณ)?ไม่(?:ได้)?(?:ไป)?(?:ไหว้|ใส่บาตร|สวด)|\bif you (?:skip|miss|forget|ignore|neglect)\b/i,
    merit2: rx("i", /พระ(?:อาจารย์|ครู|มหา|อธิการ)|หลวง(?:พ่อ|ปู่|ตา)|จำนวนมาก|มหาศาล/,
      /\b(?:a (?:lot of|large sum of) money|(?:a |one )?(?:hundred|thousand|million) (?:baht|dollars?))\b/, /[一二三四五六七八九十百千万亿两]+\s*(?:元|块|万)/),
    luck2: /เลขทะเบียน|ทะเบียนรถ|เลขเบอร์|\b(?:licen[cs]e plate|plate number)\b|大奖/i,
    luckBuy: /บูชา|เช่า|ของมงคล|เครื่องราง|จ่าย|\b(?:amulet|talisman|worship|purchase|pay)\w*|供奉|护身符|开运物|购买/i,
  };
  var straight = function () { return root.LQFortuneStraight || (NODE ? require("./fortune-straight.js") : null); };
  /** @param {any} s */
  var canon = function (s) { return String(s == null ? "" : s).normalize("NFC"); };
  /**
   * "" = the text may be shown in this section; otherwise the reason it is refused.
   * @param {string} text @param {string} kind "mind" | "do" | "cheer" | "luck" | "label" @param {{part?: string, span?: string}} [ctx]
   */
  function check(text, kind, ctx) {
    var t = canon(text), c = ctx || {}, FS = straight();
    if (!t.trim()) return "empty";
    if (!FS) return "no-filter"; // fail closed: the shared hard limits are missing
    var hl = FS.hardLimit(t);
    if (hl && hl !== "1:accident") return hl; // accidents: this section's own rules below (month ranges allowed)
    var order = ["death", "terminal", "medication", "med", "disease", "remedy", "asset", "asset2", "endRel", "endRel2", "fear", "fear2", "merit", "merit2",
      "lottery", "luck2", "sales", "money", "certLoss"];
    for (var i = 0; i < order.length; i++) if (RE[order[i]].test(t)) return order[i];
    if (RE.accType.test(t) || RE.accType2.test(t)) return "accident-type";
    // owner rule 2026-11-20: month ranges, never a single day — on every topic, and nothing under a one-day period
    if (RE.day.test(t)) return "date";
    if (c.part === "period" && c.span === "day") return "one-day-period";
    if (RE.accIllTravel.test(t) && RE.cert.test(t)) return "accident-certain";
    if (kind === "label") return "";
    if (RE.prohib.test(t) || RE.prohib2.test(t)) return "prohibition";
    if (RE.people.test(t) || RE.person.test(t) || RE.group.test(t)) return "people";
    if (kind === "mind") { if (!RE.caution.test(t)) return "no-caution-verb"; if (RE.cert.test(t)) return "certain"; }
    if (kind === "luck") { if (!RE.may.test(t)) return "no-may"; if (RE.promise.test(t)) return "promise"; if (RE.luckBuy.test(t)) return "luck-tied"; }
    if (kind === "cheer" && RE.promise.test(t)) return "promise";
    if (kind === "do") { if (/\d/.test(t)) return "number"; if (RE.recipient.test(t)) return "recipient"; if (RE.ritual.test(t)) return "ritual"; }
    return "";
  }

  var api = { RE: RE, check: check };
  if (NODE) module.exports = api; else root.LQFortuneCautionFilter = api;
})(typeof window !== "undefined" ? window : globalThis);
