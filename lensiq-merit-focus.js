/* lensiq-merit-focus.js — the "chosen for your result" line of the belief panel (owner order 2026-11-17, 4b). Loaded by
 * lensiq-merit.js together with the cards (after a reading, never before a user action: speed budgets), and required by
 * tests/unit/merit-advice.test.js in Node. Pure: no DOM, nothing sent anywhere.
 *   LQMeritFocus.focusLine(facts, page, lang) -> one line (TH / EN / ZH) or ""     LQMeritFocus.FOCUS  the fixed wording
 */
(function (root) {
  "use strict";
  /** @type {any} */
  var C = typeof module !== "undefined" && module.exports ? require("./lensiq-merit-core.js") : /** @type {any} */ (root).LQMeritCore;
  if (!C) return;
  /* ---------------- "chosen for your result" line (owner order 2026-11-17, 4b) ----------------
   * One plain line above the cards that names what in THIS reading the cards were matched to: the discipline, the area of
   * life asked about, and up to two result facts (element and its customary colour, birth day and its customary colour,
   * zodiac year, stick / hexagram / sum / Kua number, the area of life the result asks to watch). Fixed wording, TH / EN /
   * ZH, written for LENSIQ as general belief information (no promise, no price, no instruction); checked by the shared
   * wording lint in tests. Built on the device from the facts; nothing is sent. */
  var FOCUS = {
    disc: {
      face: ["โหงวเฮ้ง", "face reading", "面相"], palm: ["ลายมือ", "palm reading", "手相"], horoscope: ["ดวงชะตา", "horoscope", "命盘"],
      tarot: ["ไพ่ทาโรต์", "tarot", "塔罗牌"], siamsee: ["เซียมซี", "fortune sticks", "求签"], fengshui: ["ฮวงจุ้ย", "feng shui", "风水"],
      numbers: ["เลขศาสตร์", "numerology", "数字命理"], iching: ["อี้จิง", "I Ching", "易经"], zodiac: ["ปีนักษัตร", "Chinese zodiac", "生肖"],
      astro: ["โหราศาสตร์ตะวันตก", "Western astrology", "西洋占星"], dream: ["ทำนายฝัน", "dream reading", "解梦"], bazi: ["ปาจื้อ", "BaZi", "八字"],
      taksa: ["ทักษา", "Thai taksa", "泰式塔萨"], lek7: ["เลข 7 ตัว", "Thai lek 7", "泰式七数"], lifegraph: ["กราฟชีวิต", "life graph", "人生曲线"]
    },
    topic: { overall: ["ภาพรวม", "overall", "整体"], love: ["ความรัก", "love", "感情"], work: ["การงาน", "work", "事业"], money: ["การเงิน", "money", "财运"] },
    el: {
      wood: ["ไม้", "wood", "木", "สีเขียว", "green", "绿色"], fire: ["ไฟ", "fire", "火", "สีแดง", "red", "红色"],
      earth: ["ดิน", "earth", "土", "สีเหลืองหรือน้ำตาล", "yellow or brown", "黄色或棕色"],
      metal: ["ทอง", "metal", "金", "สีขาวหรือเงิน", "white or silver", "白色或银色"], water: ["น้ำ", "water", "水", "สีดำหรือน้ำเงิน", "black or blue", "黑色或蓝色"]
    },
    day: [["อาทิตย์", "Sunday", "星期日", "สีแดง", "red", "红色"], ["จันทร์", "Monday", "星期一", "สีเหลืองหรือครีม", "yellow or cream", "黄色或米色"],
      ["อังคาร", "Tuesday", "星期二", "สีชมพู", "pink", "粉红色"], ["พุธ (กลางวัน)", "Wednesday (daytime)", "星期三（白天）", "สีเขียว", "green", "绿色"],
      ["พฤหัสบดี", "Thursday", "星期四", "สีส้มหรือแสด", "orange", "橙色"], ["ศุกร์", "Friday", "星期五", "สีฟ้าหรือน้ำเงิน", "light or dark blue", "浅蓝或深蓝色"],
      ["เสาร์", "Saturday", "星期六", "สีม่วงหรือดำ", "purple or black", "紫色或黑色"], ["พุธกลางคืน (ราหู)", "Wednesday night (Rahu)", "星期三夜（罗睺）", "สีเทา", "grey", "灰色"]],
    animal: [["ชวด", "Rat", "鼠"], ["ฉลู", "Ox", "牛"], ["ขาล", "Tiger", "虎"], ["เถาะ", "Rabbit", "兔"], ["มะโรง", "Dragon", "龙"], ["มะเส็ง", "Snake", "蛇"],
      ["มะเมีย", "Horse", "马"], ["มะแม", "Goat", "羊"], ["วอก", "Monkey", "猴"], ["ระกา", "Rooster", "鸡"], ["จอ", "Dog", "狗"], ["กุน", "Pig", "猪"]],
    sign: [["เมษ", "Aries", "白羊座"], ["พฤษภ", "Taurus", "金牛座"], ["เมถุน", "Gemini", "双子座"], ["กรกฎ", "Cancer", "巨蟹座"], ["สิงห์", "Leo", "狮子座"],
      ["กันย์", "Virgo", "处女座"], ["ตุลย์", "Libra", "天秤座"], ["พิจิก", "Scorpio", "天蝎座"], ["ธนู", "Sagittarius", "射手座"], ["มังกร", "Capricorn", "摩羯座"],
      ["กุมภ์", "Aquarius", "水瓶座"], ["มีน", "Pisces", "双鱼座"]],
    area: { work: ["การงาน", "work", "事业"], money: ["การเงิน", "money", "财运"], love: ["ความรัก", "love", "感情"], care: ["การดูแลตัวเอง", "self-care", "自我照顾"] },
    hand: { water: ["น้ำ", "water", "水"], air: ["ลม", "air", "风"], fire: ["ไฟ", "fire", "火"], earth: ["ดิน", "earth", "土"] },
    mood: { happy: ["มีความสุข", "happy", "开心"], excited: ["ตื่นเต้น", "excited", "兴奋"], calm: ["สงบ", "calm", "平静"], anxious: ["กังวล", "anxious", "焦虑"],
      sad: ["เศร้า", "sad", "难过"], confused: ["สับสน", "confused", "困惑"] },
    bhumi: { boriwan: ["บริวาร", "Boriwan (people around you)", "眷属位"], ayu: ["อายุ", "Ayu (vitality)", "寿元位"], det: ["เดช", "Det (authority)", "威权位"],
      sri: ["ศรี", "Sri (good fortune)", "吉祥位"], mula: ["มูละ", "Mula (foundations)", "根基位"], utsaha: ["อุตสาหะ", "Utsaha (effort)", "勤勉位"],
      montri: ["มนตรี", "Montri (support)", "辅佐位"], kalakini: ["กาลกิณี", "Kalakini (obstacles)", "障碍位"] },
    house: [["ตนุ", "Tanu (self)", "第一宫（自我）"], ["กดุมภะ", "Kadumpha (wealth)", "第二宫（财富）"], ["สหัชชะ", "Sahatcha (siblings and friends)", "第三宫（兄弟朋友）"],
      ["พันธุ", "Phanthu (home and family)", "第四宫（家庭）"], ["ปุตตะ", "Putta (love and creativity)", "第五宫（爱情与创作）"], ["อริ", "Ari (rivals and hard work)", "第六宫（对手与努力）"],
      ["ปัตนิ", "Patni (partner)", "第七宫（伴侣）"]],
    t: {
      useful: ["ธาตุที่ผลว่าช่วยเสริมคือธาตุ{e} ตามความเชื่อแบบจีนคู่กับ{c}", "the element your result calls helpful is {e}, which Chinese custom pairs with {c}", "结果中有益的元素是{e}，民间习俗配{c}"],
      lack: ["ผลว่าธาตุ{e}มีน้อย ตามความเชื่อแบบจีนธาตุนี้คู่กับ{c}", "your result shows little {e}, which Chinese custom pairs with {c}", "结果显示{e}偏少，民间习俗中此元素配{c}"],
      face: ["ธาตุของรูปหน้าคือธาตุ{e} ตามความเชื่อแบบจีนคู่กับ{c}", "your face shape reads as {e}, which Chinese custom pairs with {c}", "面形属{e}，民间习俗配{c}"],
      day: ["เกิดวัน{d} สีประจำวันตามความเชื่อแบบไทยคือ{c}", "born on a {d}; in Thai custom that day's colour is {c}", "生于{d}，泰国习俗中这天的颜色是{c}"],
      animal: ["ปีเกิดปี{a}", "born in the year of the {a}", "生肖属{a}"],
      sign: ["ดวงอาทิตย์อยู่ราศี{a}", "Sun in {a}", "太阳在{a}"],
      stick: ["เซียมซีใบที่ {n}", "stick number {n}", "第{n}签"],
      hex: ["กว้าที่ {n}", "hexagram {n}", "第{n}卦"],
      sum: ["ผลรวมเลข {n}", "digit sum {n}", "数字总和{n}"],
      kua: ["เลขกัว {n}", "Kua number {n}", "命卦{n}"],
      cards: ["ไพ่ที่เปิด {n} ใบ เป็นไพ่ชุดใหญ่ {k} ใบ", "{n} card(s) drawn, {k} from the major arcana", "抽了{n}张牌，其中大阿尔卡那{k}张"],
      cards0: ["ไพ่ที่เปิด {n} ใบ ไม่มีไพ่ชุดใหญ่", "{n} card(s) drawn, none from the major arcana", "抽了{n}张牌，没有大阿尔卡那"],
      hand: ["มือธาตุ{e}", "a {e} hand", "{e}型手"],
      mood: ["ความรู้สึกในฝันคือ{a}", "the dream felt {a}", "梦中的感受是{a}"],
      syms: ["สัญลักษณ์ในฝัน {n} อย่าง", "{n} dream symbol(s)", "梦中有{n}个象征"],
      maha: ["อายุจรตามมหาทักษาอยู่ในภูมิ{a}", "your current taksa age period sits in {a}", "目前大运塔萨落在{a}"],
      house: ["ภพที่ผลให้ค่อย ๆ เติมคือภพ{a}", "the house your result asks you to build up slowly is {a}", "结果提示慢慢加强{a}"],
      strong: ["ภพที่มีพลังเด่นคือภพ{a}", "your strongest house is {a}", "最强的是{a}"],
      good: ["ช่วงนี้ผลเด่นเรื่อง{a}", "your result is strongest in {a} for now", "目前结果在{a}方面较好"],
      watch: ["ช่วงนี้ผลให้ใส่ใจเรื่อง{a}เป็นพิเศษ", "your result asks for extra care with {a} for now", "结果提示近期多留意{a}"],
      lineA: ["คำแนะนำด้านล่างเลือกตามผล{d}ของคุณ: {x} ส่วนเรื่องที่ดูคือ{t}", "The guidance below was picked for your {d} result: {x}; area asked about: {t}.", "以下建议根据你的{d}结果挑选：{x}；所看的方面：{t}。"],
      lineB: ["คำแนะนำด้านล่างเลือกตามผล{d}ของคุณ และเรื่องที่ดูคือ{t}", "The guidance below was picked for your {d} result; area asked about: {t}.", "以下建议根据你的{d}结果挑选；所看的方面：{t}。"]
    }
  };
  /** @param {string} tpl @param {Record<string, string>} v */
  function fill(tpl, v) { return tpl.replace(/\{(\w)\}/g, function (_, k) { return v[k] != null ? v[k] : ""; }); }
  /** The "chosen for your result" line, or "" when the reading's facts say nothing usable. @param {any} facts @param {string} [page] @param {string} [lang] */
  function focusLine(facts, page, lang) {
    var f = facts && typeof facts === "object" ? facts : null;
    if (!f || !Array.isArray(f.items)) return "";
    var L = ["th", "en", "zh"].indexOf(C.normLang(lang)), d = typeof f.domain === "string" && FOCUS.disc[f.domain] ? f.domain : C.PAGE_DOMAIN[String(page || "").split("/").pop() || ""];
    if (!d || !FOCUS.disc[d]) return "";
    var T = FOCUS.t, x = /** @type {string[]} */ ([]), m, cards = 0;
    /** @param {string} k @param {Record<string, string>} v */
    var put = function (k, v) { if (x.length < 2) x.push(fill(T[k][L], v)); };
    var ids = f.items.filter(function (/** @type {any} */ it) { return it && typeof it.id === "string"; });
    var find = function (/** @type {RegExp} */ re) { for (var i = 0; i < ids.length; i++) { var r = re.exec(ids[i].id); if (r) return { m: r, it: ids[i] }; } return null; };
    var elOf = function (/** @type {string} */ e, /** @type {string} */ k) { var E = FOCUS.el[e]; if (E) put(k, { e: E[L], c: E[3 + L] }); };
    if (d === "palm" || d === "astro" || d === "dream") { /* Western elements / dream symbols: no Chinese element line */ }
    else if ((m = find(/(?:^|\.)useful\.(wood|fire|earth|metal|water)$/))) elOf(m.m[1], "useful");
    else if ((m = find(/(?:^|\.)(?:lack|lo)\.(wood|fire|earth|metal|water)$/))) elOf(m.m[1], "lack");
    else if (d === "face" && (m = find(/^element\.(wood|fire|earth|metal|water)$/))) elOf(m.m[1], "face");
    if ((m = find(/^thai\.day\.([0-7])$/))) { var D = FOCUS.day[+m.m[1]]; put("day", { d: D[L], c: D[3 + L] }); }
    if ((m = find(/^(?:animal|cn\.year)\.(\d{1,2})(?:\.|$)/)) && +m.m[1] <= 11) put("animal", { a: FOCUS.animal[+m.m[1]][L] });
    if ((m = find(/^sun\.(\d{1,2})$/)) && +m.m[1] <= 11) put("sign", { a: FOCUS.sign[+m.m[1]][L] });
    if ((m = find(/^siamsee\.(\d{1,3})$/))) put("stick", { n: m.m[1] });
    if ((m = find(/^hex\.(\d{1,2})$/))) put("hex", { n: m.m[1] });
    if ((m = find(/^sum\.(\d{1,3})$/))) put("sum", { n: m.m[1] });
    if ((m = find(/^kua\.(\d)$/))) put("kua", { n: m.m[1] });
    var majors = 0, syms = 0;
    ids.forEach(function (/** @type {any} */ it) { if (/^card\./.test(it.id)) { cards++; if (/^card\.[a-z]+\.m\d/.test(it.id)) majors++; } if (/^sym\./.test(it.id)) syms++; });
    if (cards) put(majors ? "cards" : "cards0", { n: String(cards), k: String(majors) });
    if (d === "palm" && (m = find(/^element\.(water|air|fire|earth)$/))) put("hand", { e: FOCUS.hand[m.m[1]][L] });
    if ((m = find(/^mood\.(happy|excited|calm|anxious|sad|confused)$/))) put("mood", { a: FOCUS.mood[m.m[1]][L] });
    if (syms) put("syms", { n: String(syms) });
    if ((m = find(/^maha\.\d+\.(boriwan|ayu|det|sri|mula|utsaha|montri|kalakini)$/))) put("maha", { a: FOCUS.bhumi[m.m[1]][L] });
    if ((m = find(/^l7\.([0-6])\.caution$/))) put("house", { a: FOCUS.house[+m.m[1]][L] });
    else if ((m = find(/^l7\.([0-6])\.favourable$/))) put("strong", { a: FOCUS.house[+m.m[1]][L] });
    if ((m = find(/^lg\.now\.(work|money|love|care)\.caution$/))) put("watch", { a: FOCUS.area[m.m[1]][L] });
    else if ((m = find(/^lg\.now\.(work|money|love|care)\.favourable$/))) put("good", { a: FOCUS.area[m.m[1]][L] });
    var tp = FOCUS.topic[typeof f.topic === "string" && FOCUS.topic[f.topic] ? f.topic : "overall"][L];
    var sep = L === 2 ? "；" : L === 1 ? "; " : " และ";
    return x.length ? fill(T.lineA[L], { d: FOCUS.disc[d][L], x: x.join(sep), t: tp }) : fill(T.lineB[L], { d: FOCUS.disc[d][L], t: tp });
  }

  var api = { VERSION: 1, FOCUS: FOCUS, focusLine: focusLine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else /** @type {any} */ (root).LQMeritFocus = api;
})(typeof window !== "undefined" ? window : globalThis);
