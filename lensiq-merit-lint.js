/* lensiq-merit-lint.js — wording lint for belief-guidance text (Merit MVP; CLAUDE.md "Remedies and merit" + Fortune bans).
 * ONE module for both sides: the API Worker imports it (backend/src/merit.js: every admin save is refused on a hit) and
 * the fortune pages load it (nav.js; lensiq-merit.js drops any item that fails, defence in depth).
 *
 *   LQMeritLint.lintMerit(text, {only?}) -> [] when clean, else [{code, match}]
 *   codes: guarantee, fix_luck, fear, health, lottery, price, purchase, urgency, link, markup, personal
 *
 * Before matching, the text is normalised so that disguises do not slip through (independent review 2026-11-12):
 * NFKC (fullwidth letters), zero-width / soft-hyphen / word-joiner / BOM removed, Cyrillic and Greek look-alikes mapped to
 * Latin, Thai digits to 0-9, and SARA AM re-joined (NFKC turns "ำ" into U+0E4D U+0E32, which no rule below would match). Thai and Chinese rules run on a "squashed" form (spaces and punctuation removed, so
 * "แก้-ดวง" or "รับ ประกัน" count); English rules run on the lower-cased text (word boundaries kept), plus a squashed
 * check for "guarant…" ("g u a r a n t e e d"). Phone numbers are found by counting digits in a run (>= 9).
 */
(function (root) {
  "use strict";
  var ZW = /[​-‍­⁠﻿᠎]/g;
  /** @type {Record<string, string>} */
  var HOMO = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ӏ": "l", "һ": "h", "к": "k", "м": "m",
    "т": "t", "в": "b", "н": "h", "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "Ү": "Y", "І": "I",
    "ο": "o", "α": "a", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "τ": "t", "υ": "u", "ρ": "p", "Ο": "O", "Α": "A", "Ε": "E", "Ι": "I", "Κ": "K", "Τ": "T", "ɡ": "g" };
  var THAI_NUM = "(?:หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ยี่สิบ|ร้อย|พัน|หมื่น|แสน|ล้าน)";
  var TLD = "(?:com|net|org|co|me|ly|io|gl|th|shop|app|link|xyz|info|biz|cc|gg|tk|ws|page|site|online|store)";

  /** @param {string} t @returns {string} */
  function joinSaraAm(t) { return t.replace(/\u0E4D([\u0E48-\u0E4B]?)\u0E32/g, "$1\u0E33"); }

  /** @param {any} text @returns {string} */
  function normalise(text) {
    var t = String(text == null ? "" : text);
    try { t = t.normalize("NFKC"); } catch (e) { /* very old engines */ }
    t = t.replace(ZW, "");
    // NFKC splits Thai SARA AM (U+0E33 "ำ") into NIKHAHIT (U+0E4D) + SARA AA (U+0E32); the rules below are written with U+0E33, so
    // join it back (also when the tone mark sits between the two, "น" + "ํ" + "้" + "า"). Done after the zero-width strip so that
    // "จ" + "ํ" + ZWSP + "า" is joined too. Patterns and input are now normalised the same way (found by stream D1, 2026-11-13).
    t = joinSaraAm(t);
    t = t.replace(/[Ͱ-ϿЀ-ԯɡ]/g, function (c) { return HOMO[c] || c; });
    t = t.replace(/[๐-๙]/g, function (d) { return String(d.charCodeAt(0) - 0x0E50); });
    return t;
  }

  // Each rule: th / zh run on the squashed text, en on the lower-cased text, sq on squashed lower-case Latin, any on the
  // normalised text (case-insensitive where flagged).
  /** @type {Record<string, {th?: RegExp, en?: RegExp, zh?: RegExp, sq?: RegExp, any?: RegExp}>} */
  var LINT = {
    guarantee: {
      th: /การันตี|รับประกัน|แน่นอน|ได้ผลแน่|ได้ผล100|ได้ผลทันที|ร้อยเปอร์เซ็นต์|ศักดิ์สิทธิ์ที่สุด|ขออะไรได้หมด|สมหวัง|ปังแน่|ให้ปัง|ทันตาเห็น|จะดีขึ้น|ดีขึ้นทันที/,
      en: new RegExp("\\bguarant\\w*|\\bpromise[ds]?\\b|\\bdefinitely\\b|\\bcertain(?:ly)? to\\b|\\bsure to\\b|\\bwill (?:surely|certainly)\\b|" +
        "\\b100 ?(?:%|percent\\b|per cent\\b)|\\bmost powerful\\b|\\bworks? every time\\b|\\balways works\\b|\\bnever fails\\b"),
      zh: /保证|保證|包准|包準|保准|保準|包你|一定(?:会|能|灵|會|靈)|百分之百|绝对|絕對|必定|有求必应|有求必應|最灵|最靈/,
      sq: /guarant/
    },
    fix_luck: {
      th: /แก้ดวง|เปลี่ยนดวง|แก้เคราะห์|ตัดกรรม|สะเดาะเคราะห์|หายชง|แก้ชงได้ผล|ดวงดีขึ้น|เสริมดวง|รวย|ปลดหนี้|แก้ซวย|พลิกดวง|หายขาด|พ้นเคราะห์|ปัดเป่า|ขจัดเคราะห์|เรียกทรัพย์/,
      en: new RegExp("\\bfix(?:es|ed|ing)? (?:your |the )?(?:bad )?(?:luck|fortune|clash)\\b|\\bremove[sd]? (?:your |the )?(?:bad luck|misfortune|clash|curse)|" +
        "\\bchange (?:your )?(?:luck|fortune|destiny)\\b|\\bturn(?:s|ing)? (?:your )?(?:luck|fortune|life) around\\b|\\b(?:luck|fortune|life) (?:will )?turns? around\\b|" +
        "\\bluck (?:will )?improves?\\b|\\b(?:boost|increase|raise|attract|improve)\\w* (?:your |the )?(?:luck|fortune|wealth)\\b|\\bend (?:your )?bad luck\\b|" +
        "\\b(?:get|getting|be|become|becoming) rich\\b"),
      zh: /改运|改運|转运|轉運|化解一切|消灾|消災|驱邪|驅邪|破解|去霉运|去霉運|改命|好运马上|好運馬上|发财|發財|旺财|旺財/
    },
    fear: {
      th: /ซวย|เคราะห์ร้าย|อัปมงคล|หายนะ|ภัยพิบัติ|อุบัติเหตุ|ความตาย|เสียชีวิต|ถึงชีวิต|ถึงตาย|โชคร้าย|ดวงไม่ดี|ภัยร้าย|คำสาป|ดวงตก|เรื่องไม่ดี|เหตุร้าย|ถ้าไม่(?:ไหว้|ไป|ทำบุญ|ถวาย|บูชา|แก้ชง)/,
      en: new RegExp("\\bbad luck\\b|\\bmisfortune\\b|\\bdisasters?\\b|\\bcatastroph\\w*|\\bdoom\\w*|\\bcurse[ds]?\\b|\\bdeath\\b|\\bdie\\b|\\baccidents?\\b|\\bdanger\\w*|" +
        "\\bunlucky\\b|\\bbad things\\b|\\bsomething bad\\b|\\bif you (?:do not|don'?t) (?:pray|go|visit|offer|make merit)\\b"),
      zh: /霉运|霉運|厄运|厄運|倒霉|灾祸|災禍|灾难|災難|大难|大難|血光|死亡|意外|诅咒|詛咒|不吉利|出事|不拜/
    },
    health: {
      th: /รักษาโรค|หายป่วย|หายจากโรค|เจ็บป่วย|โรคร้าย|มะเร็ง|ตั้งครรภ์|มีลูกง่าย|ลดน้ำหนัก|รักษาอาการ/,
      en: /\bcure[sd]?\b|\bheal(?:s|ing|ed)?\b|\billness\w*|\bdiseases?\b|\bsickness\b|\bpregnan\w*|\bfertility\b|\bweight loss\b/,
      zh: /治病|治疗|治療|病愈|病癒|疾病|怀孕|懷孕|求子|减肥|減肥/
    },
    lottery: {
      th: /หวย|เลขเด็ด|ลอตเตอรี่|ล็อตเตอรี่|สลากกินแบ่ง|เลขนำโชค/,
      en: /\blotter\w*|\blucky numbers?\b|\bwinning numbers?\b|\bjackpot\b/,
      zh: /彩票|中奖号码|中獎號碼|幸运号码|幸運號碼|六合彩|特码|特碼/
    },
    price: {
      th: new RegExp("\\d[\\d,.]*บาท|ราคา|ค่าบูชา|ค่าใช้จ่าย|" + THAI_NUM + "บาท"),
      en: /\b(?:thb|baht|usd)\b|[$€£]\s?\d|\bprices?\b|\bpriced\b|\bcosts?\b|\bfees?\b/,
      zh: /[\d一二三四五六七八九十百千万萬两兩]+(?:元|块|塊|泰铢|泰銖|铢|銖)|价格|價格|费用|費用|价钱|價錢|只要\d|只需\d|仅需|僅需/,
      any: /\d[\d,.]*\s*(?:บาท|฿)|฿\s*\d|\d\s*\.-(?!\d)/
    },
    purchase: {
      th: /สั่งซื้อ|ซื้อได้ที่|ซื้อเลย|เช่าบูชา|จำหน่าย|โอนเงิน|ชำระเงิน|ร้านค้า|ร้านเรา|ช้อป/,
      en: /\bbuy\w*|\bpurchas\w*|\bshop\w*|\border now\b|\bfor sale\b|\bsell(?:s|ing)?\b/,
      zh: /购买|購買|下单|下單|购物|購物|出售|售卖|售賣|商店|网店|網店|请购|請購/
    },
    urgency: {
      th: /ด่วน|วันนี้เท่านั้น|หมดเขต|จำนวนจำกัด|เหลือเพียง|เหลืออีก\d|นับถอยหลัง|ก่อนสาย|รีบ|เสียโอกาส|พลาดโอกาส/,
      en: new RegExp("\\blimited (?:time|offer|slots?|stock|spots?|places?)\\b|\\bonly \\d+ (?:slots? |places? |spots? )?(?:left|remaining)\\b|\\bhurry\\b|" +
        "\\blast chance\\b|\\bact now\\b|\\bcount ?down\\b|\\bdon'?t miss\\b|\\btoday only\\b|\\btoo late\\b"),
      zh: /限时|限時|名额有限|名額有限|仅剩|僅剩|只剩|倒计时|倒計時|立即|马上|馬上|错过|錯過|最后机会|最後機會|今天截止/
    },
    link: {
      any: new RegExp("\\b[a-z][a-z0-9+.-]{1,15}:\\/\\/|\\b(?:javascript|vbscript|data):|\\bwww\\.|line\\.me|lin\\.ee|" +
        "[a-z0-9-]+(?:\\.|\\[dot\\]|\\(dot\\)|\\{dot\\})" + TLD + "\\b|[a-z0-9-]+\\s+(?:\\.|dot)\\s+(?:com|net|org|shop|co)\\b", "i")
    },
    markup: { any: /<\/?[a-z!][a-z0-9-]*[\s>\/]|<\/?[a-z!][a-z0-9-]*$|\bon[a-z]+\s*=/i },
    personal: {
      th: /ไลน์|ไอดี|ศูนย์แปด|ศูนย์เก้า|ศูนย์หก/,
      en: /\b(?:zero|oh) (?:zero|one|two|three|four|five|six|seven|eight|nine)\b|\bline\s*id\b/,
      any: /[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}|(?:^|[\s(:：])@[a-z0-9._-]{2,}/i
    }
  };
  var CODES = Object.keys(LINT);

  /** A run of digits with separators holding 9 or more digits (a phone number in any layout). @param {string} t */
  function phoneHit(t) {
    var re = /\+?\d[\d\s().\/-]{6,}\d/g, m;
    while ((m = re.exec(t))) {
      var n = (m[0].match(/\d/g) || []).length;
      if (n >= 9) return m[0];
    }
    return null;
  }

  /** @param {any} text @param {{only?: string[]}} [opts] @returns {{code: string, match: string}[]} */
  function lintMerit(text, opts) {
    var o = opts || {};
    var t = normalise(text);
    if (!t.trim()) return [];
    var lower = t.toLowerCase();
    // squashing can bring a nikhahit and a sara aa together that were typed apart ("ท ํ า"), so join again
    var squash = joinSaraAm(lower.replace(/[^\p{L}\p{M}\p{N}]+/gu, ""));
    /** @type {{code: string, match: string}[]} */
    var out = [];
    for (var i = 0; i < CODES.length; i++) {
      var code = CODES[i];
      if (o.only && o.only.indexOf(code) < 0) continue;
      var rx = LINT[code], m = null;
      if (rx.th) m = rx.th.exec(squash);
      if (!m && rx.zh) m = rx.zh.exec(squash);
      if (!m && rx.en) m = rx.en.exec(lower);
      if (!m && rx.sq) m = rx.sq.exec(squash);
      if (!m && rx.any) m = rx.any.exec(t);
      var hit = m ? m[0] : code === "personal" ? phoneHit(t) : null;
      if (hit) out.push({ code: code, match: hit.slice(0, 40) });
    }
    return out;
  }

  var api = { lintMerit: lintMerit, normalise: normalise, LINT_CODES: CODES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else /** @type {any} */ (root).LQMeritLint = api;
})(typeof window !== "undefined" ? window : globalThis);
