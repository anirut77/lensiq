/* fortune-period.js: the period layer ("ดวงช่วงนี้") of the fortune pages (owner inbox 2026-11-21 entries 19, 21, 26).
   A second block, visibly separate from the base reading (พื้นดวง), computed ON THE DEVICE from the base chart plus the
   present date by the school's own method. Behind window.LENSIQ_FORTUNE_PERIOD (lensiq-config.js, default OFF).
   Rules (entry 19): the base layer never changes with the date (baseSeed has no clock); the period layer is deterministic
   (same person + same period = same text, a new period = new computed facts; no random seed); cautions only in month ranges,
   never a single day (day words in borrowed phrases are turned into the period); the period is stated on the page; every
   frame phrase lives in PHRASES with a review status (drafts listed in docs/fortune/PERIOD-RULES-EXPERT.md); the reading is
   composed by fortune-ai.js on the device only (never the AI), so the crisis net and hard limits apply, and every sentence is
   filtered again (clean) with the safety lexicon and the hard-limit check. The block carries no plan, price, purchase or link.
   Astronomy: the solar terms (節) that start each Chinese solar month, from the low-precision solar longitude of Meeus,
   Astronomical Algorithms ch. 25 (our own code, about 0.01 degree = about 15 minutes; enough to date a month). No ephemeris. */
(function (root) {
  "use strict";
  var D2R = Math.PI / 180, DAY = 864e5, ICT = 7 * 3600e3;
  var norm = function (x) { x %= 360; return x < 0 ? x + 360 : x; };
  var angDiff = function (a, b) { return ((a - b + 540) % 360) - 180; };

  /** the switch (window.LENSIQ_FORTUNE_PERIOD === true only) @param {any} [w] */
  function enabled(w) { var o = w || root; return !!o && o.LENSIQ_FORTUNE_PERIOD === true; }

  /* ---------- apparent solar longitude (Meeus ch. 25, low precision) ---------- */
  function sunLon(ms) {
    var T = (ms / DAY + 2440587.5 - 2451545) / 36525;
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T, M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    var om = (125.04 - 1934.136 * T) * D2R;
    return norm(L0 + C - 0.00569 - 0.00478 * Math.sin(om));
  }
  var MEAN = 0.98564736, J2000MS = Date.UTC(2000, 0, 1, 12);
  /** instant of the c-th solar-term boundary: unwrapped longitude 15 + 30 c degrees (節: 立春 315, 驚蟄 345, 清明 15, ...).
   *  The first guess depends on c only, so every caller gets the same instant to the millisecond. */
  function termMs(c) {
    var lon = 15 + 30 * c, t = J2000MS + (lon - 280.46646 + 1.9) / MEAN * DAY;
    for (var i = 0; i < 12; i++) { var d = angDiff(norm(lon), sunLon(t)); t += d / MEAN * DAY; if (Math.abs(d) < 1e-9) break; }
    return Math.round(t / 60000) * 60000;
  }
  /** the Chinese solar month (between two 節) that holds the instant ms */
  function solarMonth(ms) {
    var t = +ms, c = Math.floor(((t - J2000MS) / DAY * MEAN + 280.46646 - 15) / 30);
    for (var k = 0; k < 3 && termMs(c) > t; k++) c--;
    for (k = 0; k < 3 && termMs(c + 1) <= t; k++) c++;
    var s = termMs(c), e = termMs(c + 1);
    var lon = norm(15 + 30 * c);
    return { kind: "solar-month", id: "sm-" + ictDate(s).iso, c: c, startMs: s, endMs: e, anchorMs: Math.round((s + e) / 2), termLon: lon,
      branch: (2 + Math.round(norm(lon - 315) / 30)) % 12 }; // 立春 (315) opens the 寅 month (branch 2)
  }
  /** instant the apparent Sun reaches unwrapped tropical longitude 30 c (sign boundaries; guess depends on c only) */
  function signMs(c) {
    var lon = 30 * c, t = J2000MS + (lon - 280.46646 + 1.9) / MEAN * DAY;
    for (var i = 0; i < 12; i++) { var d = angDiff(norm(lon), sunLon(t)); t += d / MEAN * DAY; if (Math.abs(d) < 1e-9) break; }
    return Math.round(t / 60000) * 60000;
  }
  /** the Sun's tropical sign period (Western astrology: 30 degrees from 0 Aries) that holds ms; sign 0 = Aries */
  function signPeriod(ms) {
    var t = +ms, c = Math.floor(((t - J2000MS) / DAY * MEAN + 280.46646) / 30);
    for (var k = 0; k < 3 && signMs(c) > t; k++) c--;
    for (k = 0; k < 3 && signMs(c + 1) <= t; k++) c++;
    var s = signMs(c), e = signMs(c + 1);
    return { kind: "sun-sign", id: "ss-" + ictDate(s).iso, c: c, sign: ((c % 12) + 12) % 12, startMs: s, endMs: e, anchorMs: Math.round((s + e) / 2) };
  }
  /** the Thai calendar day (UTC+7) that holds ms */
  function dayPeriod(ms) {
    var d = ictDate(+ms), s = Date.UTC(d.y, d.m - 1, d.d) - ICT;
    return { kind: "day", id: "d-" + d.iso, startMs: s, endMs: s + DAY, anchorMs: s + DAY / 2, weekday: new Date(s + ICT).getUTCDay() };
  }
  function ictDate(ms) { var d = new Date(ms + ICT); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), iso: d.toISOString().slice(0, 10) }; }

  /* ---------- phrase table (status: reviewed = already on the pages; draft = new, for the expert pack and the owner) ---------- */
  var PHRASES = {
    heading: { status: "draft", th: "ดวงช่วงนี้", en: "This period", zh: "近期运势" },
    label: { status: "draft", th: "ช่วงนี้: {range}", en: "This period: {range}", zh: "近期：{range}" },
    constant: { status: "draft", th: "คำทำนายพื้นดวงด้านบนคำนวณจากข้อมูลเกิด จึงเหมือนเดิมทุกครั้ง ส่วนนี้คำนวณใหม่เมื่อเข้าช่วงใหม่",
      en: "The base reading above comes from your birth data and stays the same. This part is worked out again when a new period begins.",
      zh: "上面的基本解读来自出生资料，每次都一样；这一部分在进入新的时段时重新推算。" },
    solarMonth: { status: "draft", th: "ช่วงเวลานับตามเดือนสุริยคติจีน ซึ่งเริ่มที่สารทจีน (節) ตามตำรา",
      en: "Periods follow the Chinese solar months, which begin at the solar terms (jie).", zh: "时段按节气（节）划分的月份计算。" },
    noMethod: { status: "draft", th: "ศาสตร์นี้ไม่มีวิธีดูตามช่วงเวลา คำทำนายในหน้านี้จึงเป็นพื้นดวงอย่างเดียว",
      en: "This school has no method for reading a period, so this page gives the base reading only.", zh: "这门学问没有按时段推算的方法，所以本页只有基本解读。" },
    belief: { status: "reviewed", th: "ตามความเชื่อ โปรดใช้วิจารณญาณ", en: "According to belief, please use your own judgement.", zh: "依据传统说法，请自行判断。" },
    methodHoroscope: { status: "draft", th: "คำนวณจากเสาเดือน (ปาจื้อ 流月) ของช่วงนี้เทียบธาตุประจำตัว และกิ่งเดือนเทียบปีนักษัตรของคุณ",
      en: "Worked out from this period's month pillar (BaZi liu yue) against your Day Master, and its branch against your animal sign.",
      zh: "依据本时段的月柱（流月）对照你的日主，以及月支对照你的生肖推算。" },
    methodFengshui: { status: "draft", th: "คำนวณจากดาวเหินประจำปี (เริ่มที่ลี่ชุน) และดาวเหินประจำเดือนของช่วงนี้ เทียบกับห้องในผังบ้านของคุณ",
      en: "Worked out from the annual flying star (the year begins at Li Chun) and this period's monthly flying star, set against the rooms on your floor plan.",
      zh: "依据年飞星（以立春为岁首）和本时段的月飞星，对照你户型图中的房间推算。" },
    factMonthPillar: { status: "draft", th: "เสาเดือนของช่วงนี้: {gz} (ธาตุ{el})", en: "This period's month pillar: {gz} ({el})", zh: "本时段月柱：{gz}（{el}）" },
    noMethodDraw: { status: "draft", th: "ศาสตร์นี้เป็นการเสี่ยงทาย ผลสุ่มใหม่ทุกครั้งที่ทำ จึงไม่มีชั้นดวงช่วงนี้แยก",
      en: "This school works by drawing: each draw is new, so there is no separate reading for the period.", zh: "这门学问靠抽取，每次结果都是新的，所以没有单独的近期解读。" },
    constantNoBase: { status: "draft", th: "หน้านี้ไม่ใช้ข้อมูลเกิด จึงไม่มีพื้นดวง คำแนะนำนี้เปลี่ยนตามวัน",
      en: "This page does not use birth data, so there is no base reading; this advice changes with the day.", zh: "本页不使用出生资料，所以没有基本解读；这里的建议随日期变化。" },
    methodZodiac: { status: "draft", th: "คำนวณจากกิ่งของเดือนสุริยคติจีน (流月) ของช่วงนี้เทียบปีนักษัตรของคุณ",
      en: "Worked out from the branch of this Chinese solar month (liu yue) against your animal sign.", zh: "依据本时段节气月的月支（流月）对照你的生肖推算。" },
    methodAstro: { status: "draft", th: "คำนวณจากราศีที่ดวงอาทิตย์จรอยู่ในช่วงนี้ นับเป็นเรือนจากราศีอาทิตย์กำเนิดของคุณ (ยังไม่รวมดาวเคราะห์อื่น)",
      en: "Worked out from the sign the Sun is passing through in this period, counted as a house from your birth Sun sign (other planets not included yet).",
      zh: "依据本时段太阳所在的星座，从你的出生太阳星座起算宫位（暂不含其他行星）。" },
    methodLucky: { status: "draft", th: "สีของวันคำนวณจากดาวประจำวันนี้ตามทักษา (ทักษาจร)", en: "The day's colours come from today's ruling planet in the Thai taksa order.",
      zh: "当天的颜色依据泰式塔克萨（Taksa）当日星曜推算。" },
    factMonthBranch: { status: "draft", th: "กิ่งเดือนของช่วงนี้: {br} · เทียบปีนักษัตรของคุณ: {rel}", en: "This period's month branch: {br} · against your animal sign: {rel}",
      zh: "本时段月支：{br} · 对照你的生肖：{rel}" },
    factSunSign: { status: "draft", th: "ดวงอาทิตย์จรอยู่ราศี{sign} · เรือนที่ {house} นับจากราศีอาทิตย์ของคุณ", en: "The Sun is in {sign} this period · house {house} from your Sun sign",
      zh: "本时段太阳在{sign} · 从你的太阳星座起算第{house}宫" },
    secOverview: { status: "draft", th: "ภาพรวมช่วงนี้", en: "This period at a glance", zh: "本时段概况" },
    closing: { status: "draft", th: "ทั้งหมดนี้เป็นแนวโน้มตามความเชื่อ ใช้เป็นข้อคิดประกอบ ส่วนสิ่งที่คุณเลือกทำเองสำคัญกว่าเสมอ",
      en: "These are tendencies in traditional belief, offered as food for thought; what you choose to do matters more.",
      zh: "这些只是传统说法里的倾向，可以作为参考；真正重要的，始终是你自己选择怎么做、怎么坚持。" },
    secAdvice: { status: "draft", th: "สิ่งที่ทำได้", en: "What you can do", zh: "可以做的事" },
    factStars: { status: "draft", th: "ดาวประจำปี {y} · ดาวประจำเดือน {m}", en: "Year star {y} · month star {m}", zh: "年飞星{y} · 月飞星{m}" },
  };
  var EL = { wood: { th: "ไม้", en: "wood", zh: "木" }, fire: { th: "ไฟ", en: "fire", zh: "火" }, earth: { th: "ดิน", en: "earth", zh: "土" },
    metal: { th: "ทอง", en: "metal", zh: "金" }, water: { th: "น้ำ", en: "water", zh: "水" } };
  var BR = { th: ["ชวด", "ฉลู", "ขาล", "เถาะ", "มะโรง", "มะเส็ง", "มะเมีย", "มะแม", "วอก", "ระกา", "จอ", "กุน"],
    en: ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"],
    zh: ["子（鼠）", "丑（牛）", "寅（虎）", "卯（兔）", "辰（龙）", "巳（蛇）", "午（马）", "未（羊）", "申（猴）", "酉（鸡）", "戌（狗）", "亥（猪）"] };
  var SIGN = { th: ["เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์", "ตุลย์", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน"],
    en: ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"],
    zh: ["白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"] };
  var REL = { clash: { th: "ชง", en: "clash", zh: "相冲" }, harmony: { th: "ประสาน (หกประสาน)", en: "six-harmony", zh: "六合" }, trine: { th: "สามประสาน", en: "trine", zh: "三合" },
    same: { th: "นักษัตรเดียวกัน", en: "same sign", zh: "同属相" }, harm: { th: "ทำร้าย (害)", en: "harm", zh: "相害" }, punish: { th: "ลงโทษ (刑)", en: "punishment", zh: "相刑" },
    "break": { th: "แตก (破)", en: "break", zh: "相破" }, neutral: { th: "ปกติ", en: "neutral", zh: "平" } };
  var DAY_N = { th: ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"],
    en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], zh: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] };
  var TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  var EN_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var langOf = function (l) { if (l === "en" || l === "zh" || l === "th") return l;
    try { var g = root.LQI18N && root.LQI18N.lang; return g === "en" || g === "zh" ? g : "th"; } catch (e) { return "th"; } };
  function phrase(key, lang, vars) {
    var e = PHRASES[key]; if (!e) return "";
    return String(e[langOf(lang)] || e.th).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }
  var elName = function (el, lang) { return (EL[el] || {})[langOf(lang)] || el; };
  function range(p, lang) {
    var a = ictDate(p.startMs), b = ictDate(p.endMs), L = langOf(lang), same = a.y === b.y;
    if (p.kind === "day") {
      var wd = DAY_N[L][p.weekday];
      return L === "en" ? wd + " " + a.d + " " + EN_MON[a.m - 1] + " " + a.y : L === "zh" ? a.y + "年" + a.m + "月" + a.d + "日 " + wd : wd + " " + a.d + " " + TH_MON[a.m - 1] + " " + (a.y + 543);
    }
    if (L === "en") return a.d + " " + EN_MON[a.m - 1] + (same ? "" : " " + a.y) + " – " + b.d + " " + EN_MON[b.m - 1] + " " + b.y;
    if (L === "zh") return a.y + "年" + a.m + "月" + a.d + "日 – " + (same ? "" : b.y + "年") + b.m + "月" + b.d + "日";
    return a.d + " " + TH_MON[a.m - 1] + (same ? "" : " " + (a.y + 543)) + " – " + b.d + " " + TH_MON[b.m - 1] + " " + (b.y + 543);
  }
  /** "ช่วงนี้: 7 พ.ย. – 7 ธ.ค. 2569" */
  function label(p, lang) { return phrase("label", lang, { range: range(p, lang) }); }
  function noMethod(lang, kind) { return phrase(kind === "draw" ? "noMethodDraw" : "noMethod", lang); }

  /* ---------- seeds: the base seed has no clock; the period seed = chart facts + the period id ---------- */
  var BASE_EPOCH = Date.UTC(2000, 0, 15, 5);
  function baseSeed(FA, key) { return FA.seedFor(key, "m", BASE_EPOCH); }
  function periodSeed(FA, key, p) { return FA.seedFor([key, p.id], "m", BASE_EPOCH); }

  /* ---------- the period voice: borrowed day phrases become the period; every sentence filtered again ---------- */
  function localize(t, lang, yearWords, sunForMoon) {
    var s = String(t || ""), L = langOf(lang);
    // facts.periodSunForMoon: the house lines borrowed from the daily Moon reading (astro) are read for the transiting Sun
    if (sunForMoon) s = L === "en" ? s.replace(/\bthe Moon\b/g, "the Sun").replace(/\bThe Moon\b/g, "The Sun") : L === "zh" ? s.replace(/月亮/g, "太阳") : s.replace(/ดวงจันทร์/g, "ดวงอาทิตย์");
    // facts.periodYearWords: phrases written for a year (zodiac 太岁 lines) read for the period
    if (yearWords) s = L === "en" ? s.replace(/\bthis year's\b/g, "this period's").replace(/\bThis year's\b/g, "This period's")
      .replace(/\bthis year\b/g, "this period").replace(/\bThis year\b/g, "This period")
      : L === "zh" ? s.replace(/今年/g, "这段时间").replace(/本年/g, "这段时间") : s.replace(/ปีนี้/g, "ช่วงเวลานี้");
    if (L === "en") return s.replace(/\btoday's\b/g, "this period's").replace(/\bToday's\b/g, "This period's").replace(/\btoday\b/g, "this period").replace(/\bToday\b/g, "This period")
      .replace(/\btonight\b/gi, "in the evenings").replace(/\btomorrow\b/gi, "in the days ahead");
    if (L === "zh") return s.replace(/今天|今日|当天/g, "这段时间").replace(/明天|明日/g, "接下来几天");
    // "บทบาท" holds the letters of "บาท" (baht): read as "หน้าที่" so no price word can be mistaken in the block
    return s.replace(/บทบาท/g, "หน้าที่").replace(/วันนี้/g, "ช่วงเวลานี้").replace(/พรุ่งนี้/g, "วันข้างหน้า").replace(/เมื่อวาน/g, "ที่ผ่านมา");
  }
  /** drop every sentence outside the hard limits or the safety lexicon (gentle and straight checks both) */
  function clean(FA, text) {
    var S = FA.safety, ST = FA.straight, s = String(text || "").normalize("NFC");
    var zh = /[一-鿿]/.test(s) && !/[฀-๿]/.test(s);
    var ok = function (x) { return S.isSafe(x) && !(ST && ST.hardLimit && ST.hardLimit(x)) && !(ST && ST.isSafe && !ST.isSafe(x)); };
    if (!s.trim()) return "";
    if (!ok(s)) return ""; // a paragraph that fails as a whole is dropped whole (no fragment of it is kept)
    var out = S.sentences(s).filter(ok).join(zh ? "" : " ").trim();
    return out && ok(out) ? out : "";
  }

  /* period phrase tables (all DRAFT; docs/fortune/PERIOD-RULES-EXPERT.md) live with their page engines to keep this frame
     light on every fortune page (speed budget): zodiac.js ZD.PERIOD_KB, astro.js AS.PERIOD_KB. The period facts carry their entry
     (facts.periodKB = { table, key, entry }). */

  var S0 = function (FA, t) { return FA.safety.sentences(String(t || "")); };
  /** compose the period reading on the device. factsFn(rng) gives the period facts; opts: { lang, topic, domain, press } */
  /* period guards (Fable review 2026-11-24): a month / sign / day block holds no day wording, no quarter and (except feng shui,
     whose annual flying star is the method) no year doctrine; such sentences are left out of the borrowed composer text */
  var G_DAY = /วันนี้|พรุ่งนี้|เมื่อวาน|วันที่\s*\d|วันดี|วันที่ดี|เป็นวัน|\btoday\b|\btomorrow\b|\btonight\b|good day|a day (?:to|for)|今天|今日|明天|明日|当天|好日子|这一天/i;
  var G_QUARTER = /ไตรมาส|\bquarter(?:ly|s)?\b|季度/i;
  var G_YEAR = { th: /ปีปกติ|ทั้งปี|ตลอดปี|ปีนี้|กลางปี|ปีชง|ปีที่|ปีเป็น|ปีแห่ง/,
    en: /\b(?:this|the|whole|ordinary|harm|clash|every|a|an|each|good|hard) year\b|\byear's\b|\byearly\b|\bannual\b|Tai Sui/i,
    zh: /这一年|今年|全年|一年|本年|年中|年份|太岁|平常年|害年|冲年/ };
  var reEsc = function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
  /** the base reading's opener at the start of a Thai paragraph (fortune-ai.js OPENERS_BY_DOMAIN / OPENERS; {N} = the name) */
  function stripThOpener(FA, dom, t) {
    var B = FA._internal && FA._internal.banks; if (!B) return t;
    var list = (B.OPENERS_BY_DOMAIN && B.OPENERS_BY_DOMAIN[dom] || []).concat(B.OPENERS || []);
    for (var i = 0; i < list.length; i++) {
      var re = new RegExp("^\\s*" + list[i].split(/\{[ND]\}/).map(reEsc).join(".{0,30}?") + "\\s*");
      if (re.test(t)) return t.replace(re, "");
    }
    return t;
  }
  function guard(FA, t, lang, dom) {
    var zh = lang === "zh", keep = S0(FA, t).filter(function (x) {
      return !G_DAY.test(x) && !G_QUARTER.test(x) && (dom === "fengshui" || !G_YEAR[lang].test(x));
    });
    return keep.join(zh ? "" : " ").trim();
  }
  /** compose the period reading on the device. factsFn(rng) gives the period facts; opts: { lang, topic, domain, press }.
   *  facts.periodKB = { table, key }: the block is written from the period phrase tables (PERIOD_KB) instead of the composer */
  function read(FA, factsFn, p, opts) {
    opts = opts || {};
    var lang = langOf(opts.lang), topic = opts.topic || "overall", dom = opts.domain || "fortune";
    var f0 = factsFn(FA.rng(0)), seed = periodSeed(FA, [dom, "period", topic, f0], p);
    if (opts.press) seed = FA.seedFor([seed, opts.press], "m", BASE_EPOCH);
    var facts = Object.assign({}, factsFn(FA.rng(seed)), { topic: topic }), yw = !!facts.periodYearWords, sm = !!facts.periodSunForMoon;
    // the computed facts of the period, stated first (facts.periodLead: [{ key: PHRASES key, vars }]; vars.el = an element)
    var lead = (facts.periodLead || []).map(function (x) {
      var v = Object.assign({}, x.vars), L2 = langOf(lang); if (v.el) v.el = elName(v.el, lang);
      if (v.br != null) v.br = BR[L2][v.br]; if (v.sign != null) v.sign = SIGN[L2][v.sign]; if (v.rel) v.rel = (REL[v.rel] || REL.neutral)[L2];
      return clean(FA, phrase(x.key, lang, v));
    }).filter(Boolean);
    var K = facts.periodKB, E = K && K.entry;
    if (E) {
      var secs0 = [{ id: "overview", title: phrase("secOverview", lang), paragraphs: [clean(FA, E[lang].o)].filter(Boolean) },
        { id: "advice", title: phrase("secAdvice", lang), paragraphs: [clean(FA, E[lang].a), clean(FA, phrase("closing",
          lang))].filter(Boolean) }].filter(function (s) { return s.paragraphs.length; });
      if (lead.length) secs0.unshift({ id: "period", title: "", paragraphs: lead });
      return Promise.resolve({ source: "local", mode: "gentle", lang: lang, sections: secs0, plan: null, period: p.id, seed: seed });
    }
    return Promise.resolve(FA.interpret(facts, { useAI: false, seed: seed, lang: lang, straight: false })).then(function (res) {
      res = res || {};
      var secs = (res.sections || []).map(function (s, si) {
        var paras = (s.paragraphs || []).map(function (x, pi) {
          var t = localize(x, lang, yw, sm);
          if (lang === "th" && si === 0 && pi === 0) t = stripThOpener(FA, dom, t);
          return clean(FA, guard(FA, t, lang, dom));
        }).filter(function (x) { return x && x.length > 1; });
        return Object.assign({}, s, { title: clean(FA, localize(s.title, lang, yw, sm)) || s.title, paragraphs: paras });
      }).filter(function (s) { return s.paragraphs.length; });
      // coordinator note 3: in EN / ZH the composer opens with the base reading's chart introduction ("Your birth date sets out a
      // chart…", "从出生日期排出的命盘来看…"); the period block starts with its own facts, so that first sentence is left out
      if ((lang === "en" || lang === "zh") && secs.length && secs[0].paragraphs.length) {
        var first = S0(FA, secs[0].paragraphs[0]);
        if (first.length > 1) secs[0] = Object.assign({}, secs[0], { paragraphs: [first.slice(1).join(lang === "zh" ? "" : " ")].concat(secs[0].paragraphs.slice(1)) });
      }
      if (lead.length) secs.unshift({ id: "period", title: "", paragraphs: lead });
      var rem = res.reminder ? clean(FA, guard(FA, localize(res.reminder, lang, yw, sm), lang, dom)) : res.reminder;
      return Object.assign({}, res, { sections: secs, plan: null, reminder: rem, summary: null, period: p.id, seed: seed });
    });
  }

  /* ---------- the block ---------- */
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  /** opts: { id, period, lang, calm, facts: [computed lines], advice: [free belief advice lines], method: PHRASES key } */
  function html(opts) {
    var L = langOf(opts.lang), id = esc(opts.id || "lqPeriod");
    return '<section class="lq-period" id="' + id + '" data-lq-period aria-labelledby="' + id + '-h">' +
      '<h3 id="' + id + '-h"><span class="lq-period-pill">' + esc(phrase("heading", L)) + "</span></h3>" +
      '<p class="lq-period-label">' + esc(label(opts.period, L)) + "</p>" +
      '<p class="lq-period-constant">' + esc(phrase(opts.constant || "constant", L)) + "</p>" +
      ((opts.facts || []).length ? '<ul class="lq-period-facts">' + opts.facts.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") +
      (!opts.calm && (opts.advice || []).length ? '<ul class="lq-period-advice" data-lq-remedy>' + opts.advice.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") +
      (opts.noBody ? "" : '<div class="lq-period-body" id="' + id + '-body" aria-live="polite"></div>') +
      '<p class="lq-period-method">' + esc((opts.method ? phrase(opts.method, L) + " " : "") + (opts.period && opts.period.kind === "solar-month" ? phrase("solarMonth",
        L) + " · " : "") + phrase("belief", L)) + "</p></section>";
  }
  var CSS = ".lq-period{margin:18px 0 8px;padding:14px 14px 10px;border:1px solid #c9c2f5;border-left:5px solid #674ff2;border-radius:12px;background:#f7f5ff}" +
    ".lq-period h3{margin:0 0 6px;font-size:1.05em}.lq-period-pill{display:inline-block;padding:2px 10px;border-radius:999px;background:#674ff2;color:#fff;font-size:.9em}" +
    ".lq-period-label{margin:4px 0;font-weight:700;color:#3a2aa8}.lq-period-constant,.lq-period-method{margin:4px 0;font-size:.88em;color:#4a4f66}" +
    ".lq-period-facts,.lq-period-advice{margin:6px 0;padding-left:1.2em}.lq-period-body .fa-section h4{margin:10px 0 4px;font-size:1em}.lq-period-body p{margin:4px 0}";
  function style(doc) {
    try { if (doc && doc.getElementById && !doc.getElementById("lq-period-style") && doc.head) {
      var st = doc.createElement("style"); st.id = "lq-period-style"; st.textContent = CSS; doc.head.appendChild(st); } } catch (e) { /* no DOM */ }
  }
  function calmNow(doc) { try { var CR = root.LQFortuneCrisis; return !!(CR && (CR.calmOn(doc) || CR.active(doc))); } catch (e) { return false; } }
  function plain(el, res) {
    el.innerHTML = (res.sections || []).map(function (s) { return '<section class="fa-section">' + (s.title ? "<h4>" + esc(s.title) + "</h4>" : "")
      + (s.paragraphs || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</section>"; }).join("");
  }
  /** put the block into host (replacing what was there) and compose it. opts: html() opts + { FA, factsFn, domain, topic } */
  function mount(host, opts) {
    if (!host || !enabled()) return Promise.resolve(null);
    var doc = host.ownerDocument, FA = opts.FA || root.FortuneAI, L = langOf(opts.lang), calm = calmNow(doc);
    style(doc);
    host.innerHTML = html(Object.assign({}, opts, { lang: L, calm: calm }));
    host.hidden = false;
    var body = host.querySelector(".lq-period-body");
    if (!FA || !FA.interpret) return Promise.resolve(null);
    return read(FA, opts.factsFn, opts.period, { lang: L, topic: opts.topic, domain: opts.domain }).then(function (res) {
      if (!body.isConnected) return res;
      // plain sections only: no summary box, read-more fold, report link or merit / place guidance inside the period block
      plain(body, res);
      return res;
    }).catch(function () { plain(body, { sections: [] }); return null; });
  }

  /* pages whose school has no period method carry <p data-lq-period-none="" | "draw" hidden>: filled and shown when the switch is on */
  function noMethodLines(doc) {
    try {
      if (!doc || !doc.querySelectorAll || !enabled()) return;
      Array.prototype.forEach.call(doc.querySelectorAll("[data-lq-period-none]"), function (e) {
        e.textContent = noMethod(langOf(), e.getAttribute("data-lq-period-none")); e.hidden = false;
      });
    } catch (e) { /* no DOM */ }
  }
  try {
    var d0 = root.document;
    if (d0 && d0.addEventListener) {
      if (d0.readyState === "loading") d0.addEventListener("DOMContentLoaded", function () { noMethodLines(d0); }); else noMethodLines(d0);
      if (root.addEventListener) root.addEventListener("lq-lang", function () { noMethodLines(d0); });
    }
  } catch (e) { /* no DOM */ }

  /** luckycolor: the Thai day (UTC+7), its weekday and the day's colours for a goal, all from the same day (L = LQLucky) */
  function luckyParts(L, ms, goal) { var p = dayPeriod(ms); return { period: p, weekday: p.weekday, rec: L.recommend(p.weekday, goal) }; }

  var api = { enabled: enabled, sunLon: sunLon, termMs: termMs, solarMonth: solarMonth, signPeriod: signPeriod, dayPeriod: dayPeriod, luckyParts: luckyParts,
    noMethodLines: noMethodLines,
    ictDate: ictDate, PHRASES: PHRASES, phrase: phrase, elName: elName,
    label: label, range: range, noMethod: noMethod, BASE_EPOCH: BASE_EPOCH, baseSeed: baseSeed, periodSeed: periodSeed, localize: localize, clean: clean,
    read: read, html: html, mount: mount, style: style };
  // the phrase tables, for tests and the expert-pack export (Node only; pages read facts.periodKB.entry)
  Object.defineProperty(api, "PERIOD_KB", { enumerable: true, get: function () {
    try { return typeof require === "function" ? { zodiac: require("./zodiac.js").PERIOD_KB, astro: require("./astro.js").PERIOD_KB } : null; } catch (e) { return null; }
  } });
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LQPeriod = api;
})(typeof window !== "undefined" ? window : globalThis);
