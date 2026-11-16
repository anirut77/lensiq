/* compat-kb.js — texts for Compatibility (ดวงสมพงษ์, compat.html), Thai / English / Simplified Chinese.
 * Owner order 2026-11-16 part A. Every text frames the result as how to make the relationship or partnership work: what fits,
 * what needs care and a practical step. Hard limits (CLAUDE.md, Fortune readings): never advise ending a relationship,
 * marriage or business; no "incompatible" verdict; no fear-selling; no death, illness, accident, medication, investment or
 * lottery wording; no emotion or deception inference. Locked tests: tests/unit/fortune-compat.test.js (H: 240 pairs, 24 groups).
 * Method tables and their sources: compat.js and docs/COMPAT-RESEARCH.md. Written for LENSIQ (no copied text). */
(function (root) {
  "use strict";
  const CATS = ["communication", "values", "money", "daily", "work", "decisions", "longterm"];
  // icon: 24x24 stroke path (drawn for LENSIQ, MIT); colour: category colour (AA on white with the text label next to it)
  const CAT = {
    communication: { color: "#2563eb", icon: "M4 5h16v10H9l-5 4z M8 9h8 M8 12h5", th: "การสื่อสาร", en: "Communication", zh: "沟通" },
    values: { color: "#7c3aed", icon: "M12 3l2.6 5.6 6 .7-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.7z", th: "ค่านิยม", en: "Values", zh: "价值观" },
    money: { color: "#b45309", icon: "M12 3v18 M16.5 7.5c-.8-1.6-2.6-2.5-4.5-2.5-2.5 0-4.5 1.3-4.5 3.3 0 4.6 9 2.4 9 7 0 2-2 3.2-4.5 3.2-2 0-3.8-.9-4.6-2.6", th: "การเงิน", en: "Money", zh: "金钱" },
    daily: { color: "#0f766e", icon: "M3 11l9-7 9 7 M6 10v10h12V10 M10 20v-5h4v5", th: "ชีวิตประจำวัน", en: "Daily life", zh: "日常生活" },
    work: { color: "#be123c", icon: "M4 8h16v11H4z M9 8V5h6v3 M4 13h16", th: "สไตล์การทำงาน", en: "Work style", zh: "做事风格" },
    decisions: { color: "#4d7c0f", icon: "M12 3v6 M12 9l-6 6 M12 9l6 6 M6 15v5 M18 15v5", th: "การตัดสินใจ", en: "Decision-making", zh: "决策方式" },
    longterm: { color: "#0369a1", icon: "M3 20h18 M5 20l4-8 4 4 6-10 M15 6h4v4", th: "แผนระยะยาว", en: "Long-term plans", zh: "长远规划" },
  };
  const LEAN = {
    fit: { th: "เข้ากันดี", en: "Good fit", zh: "契合" },
    mixed: { th: "กลาง ๆ", en: "In between", zh: "居中" },
    care: { th: "ใส่ใจเป็นพิเศษ", en: "Needs care", zh: "需多用心" },
    none: { th: "คำนวณไม่ได้", en: "Not computed", zh: "无法计算" },
  };
  const METHOD = {
    thai: { th: "ตำราไทย (วันเกิด ปีนักษัตร ธาตุ)", en: "Thai (birth day, year animal, elements)", zh: "泰式命理（出生星期、生肖、元素）", short: { th: "ตำราไทย", en: "Thai", zh: "泰式" } },
    bazi: { th: "ปาจื้อ (八字) จีน", en: "Chinese BaZi (八字)", zh: "八字合婚", short: { th: "ปาจื้อ", en: "BaZi", zh: "八字" } },
    vedic: { th: "พระเวท อัษฏกูฏ 36 คะแนน", en: "Vedic Ashtakoota (36 points)", zh: "印度吠陀 Ashtakoota（36 分）", short: { th: "พระเวท", en: "Vedic", zh: "吠陀" } },
    western: { th: "ซินาสทรี ตะวันตก", en: "Western synastry", zh: "西洋合盘", short: { th: "ตะวันตก", en: "Western", zh: "西洋" } },
  };
  const NAMES = {
    day: {
      th: ["", "วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ (กลางวัน)", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์", "วันพุธกลางคืน (ราหู)"],
      en: ["", "Sunday", "Monday", "Tuesday", "Wednesday (day)", "Thursday", "Friday", "Saturday", "Wednesday night (Rahu)"],
      zh: ["", "星期日", "星期一", "星期二", "星期三（白天）", "星期四", "星期五", "星期六", "星期三夜（罗睺）"],
    },
    animal: {
      th: ["ชวด", "ฉลู", "ขาล", "เถาะ", "มะโรง", "มะเส็ง", "มะเมีย", "มะแม", "วอก", "ระกา", "จอ", "กุน"],
      en: ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"],
      zh: ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"],
    },
    branch: ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"],
    stem: ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"],
    el5: { th: { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" }, en: { wood: "Wood", fire: "Fire", earth: "Earth", metal: "Metal", water: "Water" },
      zh: { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" } },
    el4: { th: { fire: "ไฟ", earth: "ดิน", wind: "ลม", water: "น้ำ" }, en: { fire: "fire", earth: "earth", wind: "wind", water: "water" }, zh: { fire: "火", earth: "土", wind: "风", water: "水" } },
    yel: { th: { water: "น้ำ", earth: "ดิน", wood: "ไม้", iron: "เหล็ก", gold: "ทอง", fire: "ไฟ" }, en: { water: "Water", earth: "Earth", wood: "Wood", iron: "Iron", gold: "Gold", fire: "Fire" },
      zh: { water: "水", earth: "土", wood: "木", iron: "铁", gold: "金", fire: "火" } },
    nak: {
      th: ["อัศวินี", "ภรณี", "กฤติกา", "โรหิณี", "มฤคศิรษะ", "อารทรา", "ปุนรวสุ", "ปุษยะ", "อาศเลษา", "มฆา", "ปูรวผลคุนี", "อุตรผลคุนี", "หัสตะ", "จิตรา",
        "สวาตี", "วิศาขา", "อนุราธา", "เชษฐา", "มูละ", "ปูรวาษาฒ", "อุตราษาฒ", "ศรวณะ", "ธนิษฐา", "ศตภิษัช", "ปูรวภัทรบท", "อุตรภัทรบท", "เรวตี"],
      en: ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta",
        "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada",
        "Uttara Bhadrapada", "Revati"],
    },
    rashi: {
      th: ["เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์", "ตุลย์", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน"],
      en: ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"],
      zh: ["白羊", "金牛", "双子", "巨蟹", "狮子", "处女", "天秤", "天蝎", "射手", "摩羯", "水瓶", "双鱼"],
    },
    planet: {
      th: { sun: "อาทิตย์", moon: "จันทร์", mercury: "พุธ", venus: "ศุกร์", mars: "อังคาร", jupiter: "พฤหัสบดี", saturn: "เสาร์" },
      en: { sun: "Sun", moon: "Moon", mercury: "Mercury", venus: "Venus", mars: "Mars", jupiter: "Jupiter", saturn: "Saturn" },
      zh: { sun: "太阳", moon: "月亮", mercury: "水星", venus: "金星", mars: "火星", jupiter: "木星", saturn: "土星" },
    },
    aspect: {
      th: { conj: "ร่วมองศา", sext: "มุม 60°", square: "มุมฉาก 90°", trine: "มุม 120°", opp: "มุมตรงข้าม 180°" },
      en: { conj: "conjunct", sext: "sextile (60°)", square: "square (90°)", trine: "trine (120°)", opp: "opposite (180°)" },
      zh: { conj: "合相", sext: "六合相（60°）", square: "刑相（90°）", trine: "拱相（120°）", opp: "冲相（180°）" },
    },
    koota: {
      th: { varna: "วรรณะ", vashya: "วัศยะ", tara: "ดารา", yoni: "โยนี", maitri: "เคราะห์ไมตรี", gana: "คณะ", bhakoot: "ภกูฏ", nadi: "นาฑี" },
      en: { varna: "Varna", vashya: "Vashya", tara: "Tara", yoni: "Yoni", maitri: "Graha Maitri", gana: "Gana", bhakoot: "Bhakoot", nadi: "Nadi" },
      zh: { varna: "Varna（品格）", vashya: "Vashya（相互吸引）", tara: "Tara（星运）", yoni: "Yoni（本性）", maitri: "Graha Maitri（心性）", gana: "Gana（气质）",
        bhakoot: "Bhakoot（家运）", nadi: "Nadi（节律）" },
    },
    thaiKind: {
      th: { mitr: "คู่มิตร", satru: "คู่ศัตรู (มุมมองต่าง)", somphon: "คู่สมพล", thatu: "คู่ธาตุ", same: "วันเดียวกัน", none: "คู่ทั่วไป" },
      en: { mitr: "friend pair", satru: "opposing pair (different outlooks)", somphon: "balancing pair", thatu: "same-element pair", same: "same day", none: "ordinary pair" },
      zh: { mitr: "朋友组合", satru: "相对组合（视角不同）", somphon: "平衡组合", thatu: "同元素组合", same: "同一天", none: "一般组合" },
    },
    brRel: {
      th: { six: "หกประสาน (六合)", three: "สามประสาน (三合)", dir: "ทิศเดียวกัน (三会)", same: "กิ่งเดียวกัน", clash: "ชง (六冲)", harm: "ไห่ (六害)", punish: "เฮ้ง (刑)", destroy: "ผั่ว (破)", none: "ไม่มีความสัมพันธ์พิเศษ" },
      en: { six: "six harmony (六合)", three: "three harmony (三合)", dir: "same season (三会)", same: "same branch", clash: "clash (六冲)", harm: "harm (六害)", punish: "punishment (刑)", destroy: "break (破)", none: "no special relation" },
      zh: { six: "六合", three: "三合", dir: "三会", same: "同支", clash: "六冲", harm: "六害", punish: "相刑", destroy: "相破", none: "无特别关系" },
    },
    yelRel: {
      th: { good: "เกื้อกูลกัน", mixed: "อยู่ด้วยกันได้แต่มักเห็นต่าง", care: "ต้องประคับประคองกันมากขึ้น", unstated: "ตำราไม่ได้ระบุ" },
      en: { good: "supportive", mixed: "get along but often see things differently", care: "needs more looking after", unstated: "not covered by the text" },
      zh: { good: "相互扶持", mixed: "能相处但常有不同看法", care: "需要更多用心经营", unstated: "典籍未提及" },
    },
    dmRel: {
      th: { same: "ธาตุเดียวกัน", aGen: "{a} หนุน {b}", bGen: "{b} หนุน {a}", aCtrl: "{a} กำกับ {b}", bCtrl: "{b} กำกับ {a}" },
      en: { same: "same element", aGen: "{a} feeds {b}", bGen: "{b} feeds {a}", aCtrl: "{a} steers {b}", bCtrl: "{b} steers {a}" },
      zh: { same: "同元素", aGen: "{a}生{b}", bGen: "{b}生{a}", aCtrl: "{a}克{b}", bCtrl: "{b}克{a}" },
    },
  };

  /* signal texts: f = what fits, c = what needs care, s = a practical step (always given with c) */
  const S = {
    // ---- Thai ----
    "thai.day.mitr": {
      th: { f: "{x} กับ {y} เป็นคู่มิตร คุยกันเปิดใจได้ง่ายและช่วยกันคิดเรื่องต่าง ๆ ได้ดี" },
      en: { f: "{x} and {y} are a friend pair: you open up to each other easily and think things through well together." },
      zh: { f: "{x}与{y}是朋友组合：彼此容易敞开心扉，一起想事情也很顺。" } },
    "thai.day.thatu": {
      th: { f: "{x} กับ {y} เป็นคู่ธาตุ{el}เดียวกัน จังหวะชีวิตคล้ายกัน เข้าใจกันได้โดยไม่ต้องอธิบายมาก" },
      en: { f: "{x} and {y} share the {el} element: your rhythm of life is similar, so you understand each other without long explanations." },
      zh: { f: "{x}与{y}同属{el}元素：生活节奏相近，不必多解释也能互相理解。" } },
    "thai.day.somphon": {
      th: { f: "{x} กับ {y} เป็นคู่สมพล ต่างคนต่างมีจุดแข็งที่เติมให้อีกฝ่าย" },
      en: { f: "{x} and {y} are a balancing pair: each of you brings a strength the other can lean on." },
      zh: { f: "{x}与{y}是平衡组合：各有所长，正好互补。" } },
    "thai.day.same": {
      th: { f: "{a} กับ {b} เกิด{x}เหมือนกัน นิสัยพื้นฐานคล้ายกันจึงเข้าใจกันเร็ว" },
      en: { f: "{a} and {b} were both born on a {x}: your basic temperament is alike, so you read each other quickly." },
      zh: { f: "{a}和{b}都出生在{x}：基本性情相似，很快就能读懂对方。" } },
    "thai.day.satru": {
      th: { c: "{x} กับ {y} เป็นคู่ศัตรูตามตำรา ซึ่งหมายถึงมุมมองตั้งต้นต่างกัน เรื่องเล็ก ๆ จึงอาจเห็นไม่ตรงกันบ่อย",
        s: "ตกลงกันว่าเวลาเห็นต่าง ให้แต่ละคนพูดให้จบก่อน แล้วค่อยหาทางกลางที่ทั้งสองรับได้" },
      en: { c: "{x} and {y} are an opposing pair in the tradition, meaning your starting points differ, so small things may often look different to each of you.",
        s: "Agree that when you disagree, each of you finishes speaking first, then you look for a middle way you can both accept." },
      zh: { c: "{x}与{y}在传统上是相对组合，意思是出发点不同，小事上也常常看法不一。",
        s: "约定意见不同时，先让每个人把话说完，再找双方都能接受的折中办法。" } },
    // ---- Thai year animal ----
    "thai.year.six": {
      th: { f: "ปี{x}กับปี{y}เป็นคู่สมพงษ์ (คู่ฮะ) ตามนักษัตร ช่วยหนุนกันในระยะยาว" },
      en: { f: "The {x} and {y} years are a harmony pair among the twelve animals: they support each other over time." },
      zh: { f: "{x}年与{y}年是生肖六合：长期相互扶持。" } },
    "thai.year.three": {
      th: { f: "ปี{x}กับปี{y}อยู่ในกลุ่มสามประสานเดียวกัน มีเป้าหมายไปในทางเดียวกันได้ง่าย" },
      en: { f: "The {x} and {y} years belong to the same three-harmony group: it is easy for you to aim in the same direction." },
      zh: { f: "{x}年与{y}年同属三合：目标容易一致。" } },
    "thai.year.same": {
      th: { f: "{a} กับ {b} เกิดปีนักษัตรเดียวกัน (ปี{x}) จึงเข้าใจมุมมองของกันและกันได้ง่าย" },
      en: { f: "{a} and {b} share the same year animal ({x}), so each of you easily sees where the other is coming from." },
      zh: { f: "{a}和{b}同属{x}年，容易理解彼此的角度。" } },
    "thai.year.clash": {
      th: { c: "ปี{x}กับปี{y}เป็นคู่ชงตามนักษัตร หมายถึงจังหวะและวิธีทำเรื่องต่าง ๆ ต่างกันชัด",
        s: "วางแผนเรื่องใหญ่ล่วงหน้าและแบ่งหน้าที่ให้ชัด ความต่างจะกลายเป็นข้อดีที่ช่วยมองได้รอบด้าน" },
      en: { c: "The {x} and {y} years clash among the twelve animals: your pace and ways of doing things differ clearly.",
        s: "Plan big things ahead and split the roles clearly; the difference then becomes a strength that shows you more sides of a question." },
      zh: { c: "{x}年与{y}年生肖相冲：做事的节奏和方式明显不同。", s: "大事提前规划、分工明确，差异就能变成优势，让你们看问题更全面。" } },
    "thai.year.harm": {
      th: { c: "ปี{x}กับปี{y}เป็นคู่ที่ตำราให้ระวังเรื่องความน้อยใจที่ไม่ได้พูดออกมา", s: "บอกสิ่งที่ต้องการตรง ๆ แทนการรอให้อีกฝ่ายเดา" },
      en: { c: "The {x} and {y} years are a pair the tradition asks to watch for unspoken hurt feelings.", s: "Say what you need plainly instead of waiting for the other to guess." },
      zh: { c: "{x}年与{y}年在传统上要留意没说出口的委屈。", s: "把需要直接说出来，不要等对方去猜。" } },
    "thai.year.punish": {
      th: { c: "ปี{x}กับปี{y}เป็นคู่ที่ตำราเรียกว่าเฮ้ง (刑) หมายถึงต่างคนต่างมีวิธีของตัวเองที่ค่อนข้างแน่วแน่", s: "ตั้งกติกาที่ทั้งสองเห็นด้วยเรื่องเวลาและความรับผิดชอบ แล้วทบทวนร่วมกันเป็นระยะ" },
      en: { c: "The {x} and {y} years form what the tradition calls a punishment (刑) pair: each of you holds firmly to your own way.", s: "Set rules you both agree on about time and responsibilities, and review them together now and then." },
      zh: { c: "{x}年与{y}年构成相刑：双方都比较坚持自己的做法。", s: "就时间和责任定下双方认同的规则，并定期一起回顾。" } },
    // ---- Thai year element (ตำราพรหมชาติ) ----
    "thai.yel.good": {
      th: { f: "ธาตุประจำปีเกิด {x} กับ {y} เกื้อกูลกันตามตำราพรหมชาติ เรื่องบ้านและเรื่องเงินจึงช่วยกันประคองได้ดี" },
      en: { f: "Your birth-year elements, {x} and {y}, support each other in the Phrommachat text, so home and money matters are easy to carry together." },
      zh: { f: "按《梵天书》，出生年元素{x}与{y}相互扶持，家庭和金钱方面容易一起撑起来。" } },
    "thai.yel.mixed": {
      th: { c: "ตำราพรหมชาติว่าธาตุ{x}กับธาตุ{y}อยู่ด้วยกันได้ แต่มักเห็นต่างในเรื่องการใช้จ่ายและแผนชีวิต", s: "คุยเรื่องเงินและแผนระยะยาวเป็นประจำ เช่นเดือนละครั้ง และจดสิ่งที่ตกลงกันไว้" },
      en: { c: "The Phrommachat text says {x} and {y} get along but often see spending and life plans differently.", s: "Talk about money and long-term plans regularly, for example once a month, and write down what you agree." },
      zh: { c: "《梵天书》说{x}与{y}能相处，但在花钱和人生规划上常有不同看法。", s: "定期聊聊钱和长远计划，比如每月一次，并把约定写下来。" } },
    "thai.yel.care": {
      th: { c: "ตำราพรหมชาติจัดธาตุ{x}กับธาตุ{y}ว่าต้องประคับประคองกันมากขึ้นในเรื่องบ้านและการเงิน", s: "แยกให้ชัดว่าเงินส่วนไหนเป็นของส่วนรวม ส่วนไหนเป็นของแต่ละคน และทบทวนด้วยกันทุกเดือน" },
      en: { c: "The Phrommachat text says {x} and {y} need more looking after in home and money matters.", s: "Make clear which money is shared and which is each person's own, and review it together every month." },
      zh: { c: "《梵天书》认为{x}与{y}在家庭和金钱上需要更多用心经营。", s: "分清哪些钱是共同的、哪些是个人的，每月一起回顾。" } },
    // ---- BaZi ----
    "bazi.dm.same": {
      th: { f: "ธาตุประจำตัว (เจ้าชะตา) ของ {a} กับ {b} เป็นธาตุ{x}เหมือนกัน คิดคล้ายกันและเป็นเพื่อนร่วมทางที่ดี" },
      en: { f: "{a} and {b} share the same Day Master element, {x}: you think alike and make good companions on the road." },
      zh: { f: "{a}和{b}日主同为{x}：想法相近，是很好的同路人。" } },
    "bazi.dm.gen": {
      th: { f: "ธาตุ{x}ของ {a} หล่อเลี้ยงธาตุ{y}ของ {b} ตามวัฏจักรห้าธาตุ {a} มักเป็นฝ่ายเติมพลัง ส่วน {b} เป็นฝ่ายลงมือให้เกิดผล" },
      en: { f: "In the five-element cycle, {a}'s {x} feeds {b}'s {y}: {a} tends to recharge the pair while {b} turns it into results." },
      zh: { f: "五行相生：{a}的{x}生{b}的{y}。{a}多是补充能量的一方，{b}则把它变成成果。" } },
    "bazi.dm.ctrl": {
      th: { c: "ธาตุ{x}ของ {a} กำกับธาตุ{y}ของ {b} ตามวัฏจักรห้าธาตุ {a} จึงอาจเป็นฝ่ายกำหนดทิศทางมากกว่าโดยไม่ตั้งใจ", s: "ให้ {b} เป็นฝ่ายตัดสินใจในเรื่องที่ถนัด และถามความเห็นของ {b} ก่อนสรุปเรื่องร่วมกัน" },
      en: { c: "In the five-element cycle, {a}'s {x} steers {b}'s {y}, so {a} may set the direction more often without meaning to.", s: "Let {b} lead the decisions in the areas {b} knows best, and ask {b}'s view before settling shared matters." },
      zh: { c: "五行相克：{a}的{x}克{b}的{y}，{a}可能不经意间更常主导方向。", s: "让{b}在擅长的事上做决定，共同的事情先问{b}的意见再定。" } },
    "bazi.combo": {
      th: { f: "ก้านวัน {x} กับ {y} เป็นคู่ห้าประสาน (五合) รวมกันเป็นธาตุ{el} ดึงดูดกันและเข้าขากันเมื่อทำเรื่องเดียวกัน" },
      en: { f: "The day stems {x} and {y} form one of the five combinations (五合), merging into {el}: you draw each other in and click when you work on the same thing." },
      zh: { f: "日干{x}与{y}五合化{el}：互相吸引，做同一件事时很合拍。" } },
    "bazi.stemClash": {
      th: { c: "ก้านวัน {x} กับ {y} เป็นคู่ปะทะ (天干相冲) ความเห็นของทั้งสองหนักแน่นพอ ๆ กัน", s: "ก่อนตัดสินใจเรื่องสำคัญ เขียนเหตุผลของแต่ละฝ่ายแล้ววางเทียบกัน ค่อยเลือกข้อที่ดีที่สุดจากทั้งสองฝั่ง" },
      en: { c: "The day stems {x} and {y} clash (天干相冲): both of you hold strong views.", s: "Before an important decision, write down each side's reasons, put them side by side and take the best points from both." },
      zh: { c: "日干{x}与{y}相冲：双方意见都很坚定。", s: "重要决定前，把双方的理由写下来并排比较，取两边最好的部分。" } },
    "bazi.br.good": {
      th: { f: "กิ่ง{w} {x} กับ {y} เป็น{rel} {where_fit}" },
      en: { f: "The {w} branches {x} and {y} form a {rel}: {where_fit}" },
      zh: { f: "{w}支{x}与{y}为{rel}：{where_fit}" } },
    "bazi.br.care": {
      th: { c: "กิ่ง{w} {x} กับ {y} เป็น{rel} {where_care}", s: "{where_step}" },
      en: { c: "The {w} branches {x} and {y} form a {rel}: {where_care}", s: "{where_step}" },
      zh: { c: "{w}支{x}与{y}为{rel}：{where_care}", s: "{where_step}" } },
    // ---- Vedic ----
    "vedic.varna": {
      th: { f: "{k} ได้คะแนนเต็ม: มาตรฐานที่ทั้งสองตั้งไว้กับงานและชีวิตไปทางเดียวกัน", c: "{k} ได้ {p} จาก {m}: ทั้งสองตั้งมาตรฐานกับงานและชีวิตไว้ต่างระดับกัน", s: "คุยกันว่าคำว่า \"ดีพอ\" ของแต่ละคนหมายถึงอะไร แล้วตกลงมาตรฐานร่วมกันในเรื่องที่ทำด้วยกัน" },
      en: { f: "{k} is full: the standards you each set for work and life point the same way.", c: "{k} scores {p} of {m}: you set your standards for work and life at different levels.", s: "Talk about what \"good enough\" means to each of you and agree a shared standard for the things you do together." },
      zh: { f: "{k}满分：两人对工作和生活的标准方向一致。", c: "{k}得{p}/{m}分：两人对工作和生活的标准高低不同。", s: "聊聊各自眼中的“够好”是什么，为共同的事定一个双方认可的标准。" } },
    "vedic.vashya": {
      th: { f: "{k} ได้ {p} จาก {m}: ทั้งสองดึงดูดกันและยอมฟังกันง่าย", c: "{k} ได้ {p} จาก {m}: ต่างคนต่างอยากเป็นฝ่ายนำในบางเรื่อง", s: "แบ่งกันนำคนละเรื่องตามความถนัด และบอกให้ชัดว่าเรื่องไหนใครเป็นคนตัดสิน" },
      en: { f: "{k} scores {p} of {m}: you are drawn to each other and listen to each other easily.", c: "{k} scores {p} of {m}: each of you wants to lead in some areas.", s: "Take turns leading by strength and say clearly who decides which matters." },
      zh: { f: "{k}得{p}/{m}分：彼此吸引，也愿意听对方的。", c: "{k}得{p}/{m}分：在某些事上两人都想主导。", s: "按专长轮流主导，并说清楚哪件事由谁拍板。" } },
    "vedic.tara": {
      th: { f: "{k} ได้ {p} จาก {m}: จังหวะชีวิตของทั้งสองส่งเสริมกัน", c: "{k} ได้ {p} จาก {m}: บางช่วงจังหวะชีวิตของทั้งสองไม่ตรงกัน", s: "เมื่อคนหนึ่งยุ่งหรือเหนื่อย ให้อีกคนรับเรื่องประจำวันไปก่อน แล้วสลับกันในช่วงถัดไป" },
      en: { f: "{k} scores {p} of {m}: your rhythms of life support each other.", c: "{k} scores {p} of {m}: at times your rhythms of life run out of step.", s: "When one of you is busy or tired, the other picks up the daily tasks for a while, then you swap." },
      zh: { f: "{k}得{p}/{m}分：两人的生活节奏相互助益。", c: "{k}得{p}/{m}分：有时两人的节奏不同步。", s: "一方忙或累的时候，另一方先接手日常事务，之后再轮换。" } },
    "vedic.yoni": {
      th: { f: "{k} ได้ {p} จาก {m}: นิสัยพื้นฐานและความใกล้ชิดเข้ากันได้ดี", c: "{k} ได้ {p} จาก {m}: ความต้องการเรื่องความใกล้ชิดกับพื้นที่ส่วนตัวของทั้งสองต่างกัน", s: "บอกกันตรง ๆ ว่าแต่ละคนต้องการเวลาอยู่ด้วยกันและเวลาส่วนตัวแค่ไหน แล้วจัดตารางให้มีทั้งสองแบบ" },
      en: { f: "{k} scores {p} of {m}: your basic natures and need for closeness sit well together.", c: "{k} scores {p} of {m}: you differ in how much closeness and how much personal space you need.", s: "Say plainly how much time together and time alone each of you needs, and plan a week that has both." },
      zh: { f: "{k}得{p}/{m}分：本性和亲密需求很合得来。", c: "{k}得{p}/{m}分：两人对亲密和个人空间的需要不同。", s: "坦白说出各自需要多少相处时间和独处时间，安排一周时两者都留出来。" } },
    "vedic.maitri": {
      th: { f: "{k} ได้ {p} จาก {m}: ดาวเจ้าเรือนจันทร์ของทั้งสองเป็นมิตรกัน คุยกันรู้เรื่องและคิดไปทางเดียวกัน", c: "{k} ได้ {p} จาก {m}: ดาวเจ้าเรือนจันทร์ของทั้งสองมองโลกคนละมุม", s: "ก่อนเถียงกัน ลองเล่ามุมของอีกฝ่ายให้เขาฟังก่อน แล้วถามว่าเข้าใจถูกไหม" },
      en: { f: "{k} scores {p} of {m}: the rulers of your Moon signs are friends, so you understand each other and think along the same lines.", c: "{k} scores {p} of {m}: the rulers of your Moon signs see the world from different angles.", s: "Before you argue, describe the other person's view back to them and ask whether you got it right." },
      zh: { f: "{k}得{p}/{m}分：双方月亮星座的守护星是朋友，沟通顺畅、想法相近。", c: "{k}得{p}/{m}分：双方月亮星座的守护星看世界的角度不同。", s: "争论之前，先把对方的观点复述给对方听，问问自己理解得对不对。" } },
    "vedic.gana": {
      th: { f: "{k} ได้ {p} จาก {m}: อุปนิสัยอยู่ในกลุ่มที่เข้ากัน", c: "{k} ได้ {p} จาก {m}: อุปนิสัยต่างกลุ่ม คนหนึ่งชอบความนุ่มนวล อีกคนชอบความตรงไปตรงมา", s: "ตกลงกันว่าเรื่องจริงจังจะคุยแบบไหน เช่นพูดตรงแต่สุภาพ และไม่คุยตอนที่ใครคนหนึ่งเหนื่อย" },
      en: { f: "{k} scores {p} of {m}: your temperaments belong to groups that suit each other.", c: "{k} scores {p} of {m}: your temperaments differ; one of you prefers a gentle approach, the other a direct one.", s: "Agree how serious topics are handled, for example direct but polite, and never when one of you is worn out." },
      zh: { f: "{k}得{p}/{m}分：两人的气质类型相配。", c: "{k}得{p}/{m}分：气质类型不同，一人偏温和，一人偏直接。", s: "约定严肃话题怎么谈，比如直接但有礼貌，而且不在一方很累的时候谈。" } },
    "vedic.bhakoot": {
      th: { f: "{k} ได้คะแนนเต็ม: เรื่องบ้านและการวางแผนเงินของทั้งสองไปทางเดียวกัน", c: "{k} เป็นแบบ {d}: ตำราให้ใส่ใจเรื่องการวางแผนบ้านและเงินร่วมกัน", s: "ตั้งเป้าหมายเงินร่วมกันหนึ่งข้อ เช่นเงินสำรองของบ้าน แล้วติดตามด้วยกันทุกเดือน" },
      en: { f: "{k} is full: your plans for home and money point the same way.", c: "{k} falls in the {d} positions: the tradition asks you to plan home and money together with care.", s: "Set one shared money goal, such as a household reserve, and track it together every month." },
      zh: { f: "{k}满分：家庭和理财规划方向一致。", c: "{k}为{d}位：传统上要多用心一起规划家庭和金钱。", s: "定一个共同的理财目标，比如家庭备用金，每月一起跟进。" } },
    "vedic.nadi": {
      th: { f: "{k} ได้คะแนนเต็ม: จังหวะพลังของทั้งสองต่างกันพอดีและเติมให้กัน", c: "{k} ได้ 0 จาก 8 (นาฑีเดียวกัน): จังหวะพลังของทั้งสองคล้ายกันมาก จึงอาจล้าพร้อมกันหรือเร่งพร้อมกัน", s: "จัดเวลาพักและเวลาของตัวเองให้กันและกัน และวางแผนให้ช่วงงานหนักของสองคนไม่ชนกัน" },
      en: { f: "{k} is full: your energy rhythms differ just enough to complement each other.", c: "{k} scores 0 of 8 (same Nadi): your energy rhythms are very alike, so you may tire or rush at the same time.", s: "Give each other rest and time alone, and plan so your busiest stretches do not land at the same time." },
      zh: { f: "{k}满分：两人的能量节律恰好不同，正好互补。", c: "{k}得0/8分（同一 Nadi）：能量节律很相似，可能同时疲惫或同时急躁。", s: "给彼此留出休息和独处的时间，安排时让两人最忙的阶段错开。" } },
    // ---- Western synastry, by theme ----
    "west.lum": {
      th: { f: "{pa}ของ {a} {asp} {pb}ของ {b}: เป้าหมายของคนหนึ่งกับความรู้สึกของอีกคนไปด้วยกันได้ดี", c: "{pa}ของ {a} {asp} {pb}ของ {b}: สิ่งที่คนหนึ่งอยากได้กับสิ่งที่อีกคนรู้สึกสบายใจอาจดึงไปคนละทาง", s: "ถามกันตรง ๆ ว่าอะไรทำให้แต่ละคนรู้สึกมั่นคง แล้วใส่เรื่องนั้นไว้ในแผนของทั้งคู่" },
      en: { f: "{a}'s {pa} {asp} {b}'s {pb}: one person's aims and the other's sense of comfort move together well.", c: "{a}'s {pa} {asp} {b}'s {pb}: what one of you wants and what the other feels at ease with may pull in different directions.", s: "Ask each other plainly what makes you feel secure, and build that into your shared plans." },
      zh: { f: "{a}的{pa}与{b}的{pb}{asp}：一方的目标与另一方的安心感很合拍。", c: "{a}的{pa}与{b}的{pb}{asp}：一方想要的和另一方觉得自在的，可能方向不同。", s: "坦白问问对方什么让人有安全感，并把它放进共同计划里。" } },
    "west.moonmoon": {
      th: { f: "จันทร์ของ {a} {asp} จันทร์ของ {b}: ความต้องการในชีวิตประจำวันคล้ายกัน อยู่ด้วยกันสบาย", c: "จันทร์ของ {a} {asp} จันทร์ของ {b}: สิ่งที่ทำให้แต่ละคนรู้สึกสบายในบ้านต่างกัน", s: "เขียนรายการเล็ก ๆ ว่าอะไรทำให้แต่ละคนรู้สึกสบายที่บ้าน แล้วผลัดกันทำให้อีกฝ่าย" },
      en: { f: "{a}'s Moon {asp} {b}'s Moon: your everyday needs are alike, so living side by side feels easy.", c: "{a}'s Moon {asp} {b}'s Moon: what makes each of you comfortable at home differs.", s: "Each write a short list of what makes you comfortable at home, and take turns doing those things for each other." },
      zh: { f: "{a}的月亮与{b}的月亮{asp}：日常需要相近，相处很自在。", c: "{a}的月亮与{b}的月亮{asp}：让各自在家感到舒服的东西不同。", s: "各写一张小清单，列出在家让自己舒服的事，轮流为对方做。" } },
    "west.sunsun": {
      th: { f: "อาทิตย์ของ {a} {asp} อาทิตย์ของ {b}: สิ่งที่ทั้งสองให้ความสำคัญไปทางเดียวกัน", c: "อาทิตย์ของ {a} {asp} อาทิตย์ของ {b}: ทั้งสองมีวิธีแสดงตัวตนและเป้าหมายที่ต่างกันชัด", s: "ให้แต่ละคนมีเป้าหมายของตัวเองหนึ่งข้อที่อีกฝ่ายช่วยสนับสนุน" },
      en: { f: "{a}'s Sun {asp} {b}'s Sun: what you each care about points the same way.", c: "{a}'s Sun {asp} {b}'s Sun: you express yourselves and your aims in clearly different ways.", s: "Let each of you keep one personal goal that the other actively supports." },
      zh: { f: "{a}的太阳与{b}的太阳{asp}：在乎的事方向一致。", c: "{a}的太阳与{b}的太阳{asp}：两人表达自我和目标的方式明显不同。", s: "各自保留一个个人目标，并由对方积极支持。" } },
    "west.mind": {
      th: { f: "{pa}ของ {a} {asp} {pb}ของ {b}: คุยกันเข้าใจเร็ว แลกความคิดกันได้สนุก", c: "{pa}ของ {a} {asp} {pb}ของ {b}: วิธีคิดและวิธีพูดต่างกัน อาจเข้าใจคลาดกันได้", s: "เมื่อคุยเรื่องสำคัญ ให้สรุปสั้น ๆ ปิดท้ายว่าตกลงอะไรกัน และใครทำอะไรต่อ" },
      en: { f: "{a}'s {pa} {asp} {b}'s {pb}: you get each other quickly and enjoy trading ideas.", c: "{a}'s {pa} {asp} {b}'s {pb}: you think and talk in different ways, so messages can be misread.", s: "After an important talk, sum up in one or two lines what you agreed and who does what next." },
      zh: { f: "{a}的{pa}与{b}的{pb}{asp}：一点就通，交流想法很愉快。", c: "{a}的{pa}与{b}的{pb}{asp}：思考和说话方式不同，容易误会。", s: "重要谈话结束时，用一两句话总结约定了什么、接下来谁做什么。" } },
    "west.love": {
      th: { f: "{pa}ของ {a} {asp} {pb}ของ {b}: ใส่ใจกันได้ตรงใจ และรู้วิธีทำให้อีกฝ่ายรู้สึกดี", c: "{pa}ของ {a} {asp} {pb}ของ {b}: วิธีแสดงความใส่ใจของทั้งสองต่างกัน", s: "ถามกันว่าแบบไหนที่ทำให้รู้สึกว่าได้รับความใส่ใจ เช่นคำพูด เวลา หรือการช่วยงาน แล้วใช้ภาษานั้นของอีกฝ่าย" },
      en: { f: "{a}'s {pa} {asp} {b}'s {pb}: you show care in ways that land, and know how to make the other feel good.", c: "{a}'s {pa} {asp} {b}'s {pb}: you show care in different ways.", s: "Ask each other what makes you feel cared for, such as words, time or a helping hand, and use the other person's way." },
      zh: { f: "{a}的{pa}与{b}的{pb}{asp}：关心对方总能说到心坎上。", c: "{a}的{pa}与{b}的{pb}{asp}：两人表达关心的方式不同。", s: "问问对方怎样最能感到被关心，比如言语、陪伴或帮忙，然后用对方的方式。" } },
    "west.drive": {
      th: { f: "{pa}ของ {a} {asp} {pb}ของ {b}: มีพลังลงมือไปในทางเดียวกัน ทำงานร่วมกันได้คล่อง", c: "{pa}ของ {a} {asp} {pb}ของ {b}: ทั้งสองมีพลังและความเร็วในการลงมือต่างกัน", s: "แบ่งงานเป็นช่วงสั้น ๆ ตกลงกันว่าใครเร่ง ใครตรวจ และนัดเวลาเช็กงานกัน" },
      en: { f: "{a}'s {pa} {asp} {b}'s {pb}: your drive points the same way, so you work together smoothly.", c: "{a}'s {pa} {asp} {b}'s {pb}: you differ in energy and in how fast you act.", s: "Break the work into short stages, agree who pushes and who checks, and set times to review." },
      zh: { f: "{a}的{pa}与{b}的{pb}{asp}：行动力方向一致，合作顺手。", c: "{a}的{pa}与{b}的{pb}{asp}：两人的干劲和行动速度不同。", s: "把工作拆成短阶段，约定谁推进、谁把关，并定时检查。" } },
    "west.growth": {
      th: { f: "{pa}ของ {a} {asp} {pb}ของ {b}: ช่วยกันมองโอกาสและทำให้กันและกันกล้าเติบโต", c: "{pa}ของ {a} {asp} {pb}ของ {b}: คนหนึ่งอาจมองแง่ดีเกินไปในขณะที่อีกคนยังไม่พร้อม", s: "ก่อนเริ่มเรื่องใหม่ ตั้งขอบเขตด้วยกัน เช่นงบ เวลา และจุดที่จะทบทวน" },
      en: { f: "{a}'s {pa} {asp} {b}'s {pb}: you spot chances together and encourage each other to grow.", c: "{a}'s {pa} {asp} {b}'s {pb}: one of you may be more upbeat than the other is ready for.", s: "Before starting something new, set limits together: budget, time and a point to review." },
      zh: { f: "{a}的{pa}与{b}的{pb}{asp}：一起发现机会，鼓励彼此成长。", c: "{a}的{pa}与{b}的{pb}{asp}：一方可能过于乐观，另一方还没准备好。", s: "开始新事情之前一起定好边界：预算、时间和回顾的节点。" } },
    "west.structure": {
      th: { f: "{pa}ของ {a} {asp} {pb}ของ {b}: มีความมั่นคงและความรับผิดชอบที่ช่วยให้สร้างอะไรระยะยาวด้วยกันได้", c: "{pa}ของ {a} {asp} {pb}ของ {b}: คนหนึ่งอาจรู้สึกว่าอีกคนเข้มงวดหรือคาดหวังสูง", s: "ตกลงกติกาที่จำเป็นจริง ๆ ไม่กี่ข้อ และชื่นชมกันเมื่อทำได้ตามที่ตกลง" },
      en: { f: "{a}'s {pa} {asp} {b}'s {pb}: steadiness and responsibility help you build something lasting together.", c: "{a}'s {pa} {asp} {b}'s {pb}: one of you may feel the other is strict or expects a lot.", s: "Agree on the few rules that really matter, and appreciate each other when you keep them." },
      zh: { f: "{a}的{pa}与{b}的{pb}{asp}：稳定和责任感让你们能一起建立长久的东西。", c: "{a}的{pa}与{b}的{pb}{asp}：一方可能觉得对方严格或期望很高。", s: "只约定几条真正重要的规则，做到时互相肯定。" } },
  };
  // branch relations: where (day = the couple palace / home life, year = family roots and outlook)
  const BR = {
    th: {
      w: { day: "วัน", year: "ปี" },
      fit: { day: "ชีวิตประจำวันและบรรยากาศในบ้านเข้ากันได้ดี", year: "ภูมิหลังครอบครัวและมุมมองระยะยาวหนุนกัน" },
      care: { clash: { day: "จังหวะชีวิตประจำวันต่างกันชัด", year: "ภูมิหลังและมุมมองระยะยาวต่างกัน" },
        harm: { day: "ความน้อยใจเล็ก ๆ สะสมได้ถ้าไม่พูด", year: "ความคาดหวังจากครอบครัวของแต่ละฝ่ายอาจไม่ตรงกัน" },
        punish: { day: "ต่างคนต่างมีวิธีของตัวเองในบ้าน", year: "ต่างคนต่างยึดวิธีที่เคยชินจากบ้านเดิม" },
        destroy: { day: "แผนประจำวันอาจสะดุดเพราะสื่อสารไม่ครบ", year: "แผนที่วางกับครอบครัวอาจต้องปรับบ่อย" } },
      step: { clash: "ตกลงเรื่องกิจวัตร เช่นเวลานอน งานบ้าน และเวลาส่วนตัว ให้ชัดตั้งแต่ต้น", harm: "นัดเวลาสั้น ๆ ทุกสัปดาห์เพื่อบอกเรื่องที่ค้างใจ",
        punish: "ลองทำตามวิธีของแต่ละคนสลับกัน แล้วเลือกวิธีที่ได้ผลจริง", destroy: "ยืนยันแผนกันอีกครั้งก่อนวันนัด และมีแผนสำรองไว้" },
    },
    en: {
      w: { day: "day", year: "year" },
      fit: { day: "daily life and the mood at home suit you both.", year: "family backgrounds and long-term outlooks support each other." },
      care: { clash: { day: "your daily rhythms differ clearly.", year: "your backgrounds and long-term outlooks differ." },
        harm: { day: "small hurts can pile up if left unsaid.", year: "each family's expectations may not match." },
        punish: { day: "each of you has your own way of running things at home.", year: "each of you holds on to habits from the home you grew up in." },
        destroy: { day: "daily plans can stall when details go unshared.", year: "plans made with family may need frequent changes." } },
      step: { clash: "Agree on routines early: bedtimes, housework and personal time.", harm: "Set a short weekly moment to raise whatever is still on your mind.",
        punish: "Try each person's way in turn, then keep the one that really works.", destroy: "Confirm plans again the day before and keep a back-up plan." },
    },
    zh: {
      w: { day: "日", year: "年" },
      fit: { day: "日常生活和家里的气氛都很合适。", year: "家庭背景和长远眼光相互支撑。" },
      care: { clash: { day: "日常节奏明显不同。", year: "背景和长远眼光不同。" },
        harm: { day: "小委屈不说出来会慢慢累积。", year: "双方家庭的期待可能不一致。" },
        punish: { day: "在家里各有各的做法。", year: "都坚持原生家庭的习惯。" },
        destroy: { day: "细节没沟通好，日常计划容易卡住。", year: "和家人定的计划可能常要调整。" } },
      step: { clash: "尽早约定作息：睡觉时间、家务和个人时间。", harm: "每周留一小段时间，把心里还没说的事说出来。",
        punish: "轮流试试各自的方法，再保留真正有效的那一个。", destroy: "前一天再确认一次计划，并准备备用方案。" },
    },
  };

  /* per category: a general "what fits" line (used when no method gives one), two general ways to adjust */
  const GEN = {
    communication: {
      th: { f: "ทั้งสองมีวิธีสื่อสารที่ต่างกันพอให้ได้มุมมองใหม่จากกันและกัน", a: ["ฟังให้จบก่อนตอบ แล้วถามว่า \"ที่เข้าใจแบบนี้ถูกไหม\"", "เรื่องสำคัญคุยต่อหน้าหรือโทรคุย ดีกว่าพิมพ์ข้อความยาว ๆ"] },
      en: { f: "Your ways of communicating differ just enough to give each other fresh angles.", a: ["Listen to the end before you answer, then ask \"Have I got this right?\"", "Talk important things through in person or by phone rather than in long text messages."] },
      zh: { f: "两人的沟通方式不同，正好给彼此带来新角度。", a: ["听完再回答，然后问一句“我这样理解对吗？”", "重要的事当面或打电话谈，比发长消息更好。"] } },
    values: {
      th: { f: "ทั้งสองมีเรื่องที่ให้คุณค่าร่วมกันอย่างน้อยหนึ่งเรื่อง ซึ่งเป็นแกนให้ยึดได้", a: ["เขียนสามเรื่องที่แต่ละคนให้ความสำคัญที่สุด แล้วหาเรื่องที่ตรงกัน", "เวลาค่านิยมต่างกัน ให้เคารพขอบเขตของกันแทนการเปลี่ยนอีกฝ่าย"] },
      en: { f: "You share at least one thing you both value, and it can be your anchor.", a: ["Each write down the three things you value most and look for the overlap.", "Where your values differ, respect each other's limits rather than trying to change the other person."] },
      zh: { f: "两人至少有一件共同看重的事，可以作为彼此的支点。", a: ["各写下最看重的三件事，找出重合的部分。", "价值观不同时，尊重彼此的底线，而不是试图改变对方。"] } },
    money: {
      th: { f: "มุมมองเรื่องเงินที่ต่างกันช่วยให้ทั้งสองไม่ประมาทและไม่ตึงเกินไป", a: ["ตั้งวงเงินที่ใช้ได้โดยไม่ต้องถามกัน และวงเงินที่ต้องคุยกันก่อน", "ทบทวนรายรับรายจ่ายร่วมกันเดือนละครั้ง สั้น ๆ ไม่เกินครึ่งชั่วโมง"] },
      en: { f: "Different views on money keep you from being either careless or too tight.", a: ["Set an amount each of you can spend without asking, and a level where you talk first.", "Review income and spending together once a month, briefly, within half an hour."] },
      zh: { f: "对金钱的不同看法让两人既不大意也不过紧。", a: ["约定各自不用商量就能花的额度，以及超过多少要先商量。", "每月一起简单回顾收支一次，半小时以内。"] } },
    daily: {
      th: { f: "ในชีวิตประจำวัน ทั้งสองมีจังหวะที่ปรับเข้าหากันได้", a: ["แบ่งงานประจำวันตามความถนัดและสลับกันบ้างเป็นครั้งคราว", "มีเวลาของตัวเองที่อีกฝ่ายเคารพ อย่างน้อยสัปดาห์ละครั้ง"] },
      en: { f: "In daily life your rhythms can be adjusted towards each other.", a: ["Split daily tasks by strengths and swap now and then.", "Keep some personal time the other respects, at least once a week."] },
      zh: { f: "日常生活中，两人的节奏可以相互调和。", a: ["按擅长分配日常事务，偶尔互换。", "每周至少留一段对方尊重的个人时间。"] } },
    work: {
      th: { f: "สไตล์การทำงานของทั้งสองเติมกันได้ คนหนึ่งเห็นภาพรวม อีกคนดูรายละเอียด", a: ["ก่อนเริ่มงานร่วมกัน ตกลงว่าใครทำส่วนไหน กำหนดเสร็จ และวิธีส่งต่องาน", "ชมกันเมื่องานสำเร็จ และคุยเรื่องที่ควรทำต่างไปโดยไม่โทษกัน"] },
      en: { f: "Your work styles can complement each other: one sees the big picture, the other the details.", a: ["Before working together, agree roles, deadlines and how work is handed over.", "Recognise each other when something goes well, and discuss what to change without blame."] },
      zh: { f: "两人的做事风格可以互补：一人看全局，一人顾细节。", a: ["合作前先约定角色、期限和交接方式。", "成功时互相肯定，讨论改进时不互相指责。"] } },
    decisions: {
      th: { f: "การตัดสินใจร่วมกันได้ประโยชน์จากมุมมองที่ต่างกันของทั้งสอง", a: ["เรื่องใหญ่ให้เวลาคิดอย่างน้อยหนึ่งคืนก่อนสรุป", "แยกให้ชัดว่าเรื่องไหนตัดสินคนเดียวได้ เรื่องไหนต้องตกลงร่วมกัน"] },
      en: { f: "Shared decisions benefit from your different points of view.", a: ["For big matters, allow at least one night to think before you settle.", "Make clear which matters one person can decide and which need agreement from both."] },
      zh: { f: "两人视角不同，对共同决策反而有益。", a: ["大事至少给一晚的思考时间再定。", "分清哪些事可以一人决定，哪些需要双方同意。"] } },
    longterm: {
      th: { f: "ถ้าวางแผนด้วยกัน ทั้งสองมีจุดแข็งที่ช่วยกันพาเป้าหมายระยะยาวไปถึงได้", a: ["เขียนเป้าหมายร่วมหนึ่งปีข้างหน้าสองสามข้อ แล้วทบทวนทุกสามเดือน", "เผื่อที่ให้เป้าหมายส่วนตัวของแต่ละคนอยู่ในแผนร่วมด้วย"] },
      en: { f: "When you plan together, you each bring strengths that carry long-term goals through.", a: ["Write two or three shared goals for the year ahead and review them every three months.", "Leave room in the shared plan for each person's own goals."] },
      zh: { f: "一起规划时，两人各有长处，能把长远目标走下去。", a: ["写下未来一年的两三个共同目标，每三个月回顾一次。", "在共同计划里也给各自的个人目标留出位置。"] } },
  };
  const CARE_NONE = { th: "หมวดนี้ไม่มีจุดที่ตำราให้ระวังเป็นพิเศษ", en: "No method flags anything special to watch in this area.", zh: "这一方面没有特别需要留意的地方。" };

  /* roles for a group, from the Day Master element (BaZi), framed as strengths */
  const ROLE = {
    wood: { th: { r: "ผู้ริเริ่มและพาให้เติบโต", s: "ชอบเริ่มเรื่องใหม่ มองเห็นทางพัฒนาและดึงคนอื่นให้ไปต่อ" }, en: { r: "Initiator and grower", s: "Likes starting new things, sees how they can grow and brings others along." },
      zh: { r: "开创与成长者", s: "喜欢开启新事情，看得到成长的方向，也能带动别人。" } },
    fire: { th: { r: "ผู้จุดพลังและสื่อสาร", s: "ทำให้ทีมมีชีวิตชีวา เล่าเรื่องเก่ง และทำให้คนอื่นเห็นภาพเดียวกัน" }, en: { r: "Energiser and voice", s: "Brings warmth and energy, tells the story well and helps everyone see the same picture." },
      zh: { r: "点燃与表达者", s: "给团队带来热情和活力，善于表达，让大家看到同一幅图景。" } },
    earth: { th: { r: "ผู้ประสานและสร้างความมั่นคง", s: "ใจเย็น เชื่อถือได้ คอยประสานให้ทุกคนอยู่บนแผนเดียวกัน" }, en: { r: "Anchor and coordinator", s: "Calm and reliable, keeps everyone on the same plan." },
      zh: { r: "稳定与协调者", s: "沉稳可靠，让所有人都在同一个计划上。" } },
    metal: { th: { r: "ผู้วางระบบและดูแลคุณภาพ", s: "ชัดเจน มีหลักการ ทำให้งานเป็นระบบและได้มาตรฐาน" }, en: { r: "Organiser and quality keeper", s: "Clear and principled, puts work into a system and keeps the standard up." },
      zh: { r: "规划与品质把关者", s: "清晰有原则，让事情有条理并保持水准。" } },
    water: { th: { r: "ผู้เชื่อมโยงและวางกลยุทธ์", s: "ปรับตัวเก่ง เชื่อมคนและข้อมูล มองหาทางที่ไปได้ในสถานการณ์ใหม่" }, en: { r: "Connector and strategist", s: "Adapts easily, links people and information, and finds a way forward in new situations." },
      zh: { r: "联结与谋划者", s: "适应力强，串联人和信息，在新情况中找到出路。" } },
  };
  const WORK_USE = {
    th: "ผลนี้มีไว้เพื่อให้เข้าใจกันและทำงานร่วมกันได้ดีขึ้นเท่านั้น ไม่ใช้ประกอบการตัดสินใจจ้างงาน การเลื่อนตำแหน่ง ค่าตอบแทน หรือการเลิกจ้าง",
    en: "This result is for understanding each other and working together better. It is not to be used for hiring, promotion, pay or dismissal decisions.",
    zh: "此结果仅用于增进相互理解、更好地合作，不得用于招聘、晋升、薪酬或解雇等决定。",
  };

  /* report wording */
  const T = {
    th: {
      defNames: ["คนที่ 1", "คนที่ 2", "คนที่ 3", "คนที่ 4", "คนที่ 5", "คนที่ 6", "คนที่ 7", "คนที่ 8"], and: " และ ", list: ", ",
      ovTitle: "{a} กับ {b}", ovGroupTitle: "กลุ่ม {n} คน",
      ovLead: "ภาพรวมเป็น{lean} จุดที่เข้ากันเด่นคือ {fit}", ovLeadNoFit: "ภาพรวมเป็น{lean} ทุกหมวดมีทั้งจุดที่เข้ากันและจุดที่ปรับเข้าหากันได้",
      ovCare: "เรื่องที่ควรใส่ใจคือ {care} ดูวิธีปรับได้ในแต่ละหมวด", ovCareNone: "ไม่มีหมวดไหนที่ต้องระวังเป็นพิเศษ ดูวิธีดูแลกันต่อได้ในแต่ละหมวด",
      ovAgree: "ศาสตร์ที่คำนวณได้ {n} สาย เห็นตรงกัน {k} หมวด และมองต่างกัน {d} หมวด (ดูตาราง \"ศาสตร์ไหนเห็นตรงกัน\")",
      ovFrame: "ผลนี้ช่วยให้เห็นว่าจะดูแลความสัมพันธ์อย่างไรให้ไปได้ดี ตัวเลขเป็นเกณฑ์อ้างอิงที่ต้องอ่านคู่กับรายละเอียดแต่ละหมวด ไม่ใช่คำตัดสิน",
      leanWord: { fit: "ความสัมพันธ์ที่เข้ากันดี", mixed: "ความสัมพันธ์ที่มีทั้งจุดเข้ากันและจุดที่ต้องปรับ", care: "ความสัมพันธ์ที่ต้องใส่ใจกันเป็นพิเศษ" },
      guide: "เกณฑ์อ้างอิงของ LENSIQ รวมจากข้อด้านบน ไม่ใช่ตัวเลขของตำรา",
      thaiDay: "วันเกิด: {x} กับ {y} ({k})", thaiYear: "ปีนักษัตร: ปี{x} กับ ปี{y} ({k})", thaiYel: "ธาตุปีเกิดตามตำราพรหมชาติ: {x} กับ {y} ({k})",
      baziDm: "เจ้าชะตา (ก้านวัน): {x} ธาตุ{ex} กับ {y} ธาตุ{ey} ({k})", baziDay: "กิ่งวัน: {x} กับ {y} ({k})", baziYear: "กิ่งปี: {x} กับ {y} ({k})",
      vedNak: "นักษัตรของดวงจันทร์ (นิรายนะ ลาหิรี): {a} {x} ราศี{rx} · {b} {y} ราศี{ry}",
      vedKoota: "แปดหมวด: {list}", vedOrder: "ตำรานับฝ่ายหญิงก่อน: เมื่อสลับลำดับ {a} กับ {b} คะแนนเป็น {s1} และ {s2} จาก 36 (หน้านี้ไม่ถามเพศ จึงแสดงทั้งสองแบบ)",
      vedCancel: "{k}: บางสำนักถือว่าข้อนี้ผ่อนลงเพราะดาวเจ้าเรือนเป็นดวงเดียวกันหรือเป็นมิตรกัน (คะแนนดิบไม่เปลี่ยน)",
      vedNadiEx: "{k}: บางสำนักยกเว้นข้อนี้เมื่อราศีหรือนักษัตรของสองคนต่างกัน (คะแนนดิบไม่เปลี่ยน)",
      vedUnsure: "ไม่ทราบเวลาเกิดของ {a}: ดวงจันทร์วันนั้นอยู่ได้ทั้งนักษัตร{x}และ{y} หน้านี้ใช้ตำแหน่งเที่ยงวัน",
      vedNotCouple: "อัษฏกูฏเป็นตำราจับคู่แต่งงาน สำหรับความสัมพันธ์แบบอื่นใช้เพื่อเทียบเท่านั้น",
      westPlanets: "ดาวที่ใช้: อาทิตย์ จันทร์ พุธ ศุกร์ อังคาร พฤหัสบดี เสาร์ (ระบบทรอปิคัล) มุมหลัก 5 แบบ วงคลาด 8° เมื่อมีอาทิตย์หรือจันทร์ 6° สำหรับดาวอื่น 4° สำหรับมุม 60°",
      westTop: "มุมที่เด่นที่สุด: {list}", westNone: "ไม่พบมุมหลักที่ชัดเจนระหว่างดาวของสองคน",
      westNoTime: "ไม่ทราบเวลาเกิดของบางคน ตำแหน่งดวงจันทร์คลาดได้ราว ±6° มุมของดวงจันทร์จึงนับน้ำหนักครึ่งเดียว",
      westOff: "ยังคำนวณดาวตะวันตกไม่ได้ (โหลดตัวคำนวณไม่สำเร็จ) ส่วนอื่นยังใช้ได้ตามปกติ",
      agreeYes: "ทุกศาสตร์ที่คำนวณได้มองตรงกันว่า{lean}", agreeNo: "ศาสตร์มองต่างกัน: {parts}", agreeFew: "มีศาสตร์คำนวณได้ไม่พอจะเทียบ", agreePart: "{m} ว่า{lean}",
      mapCell: "{a} กับ {b}: {lean} เด่นเรื่อง{fit}", mapCellCare: "{a} กับ {b}: {lean} ควรใส่ใจเรื่อง{care}", mapStep: "วิธีปรับ: {s}",
      grpLead: "คู่ที่เสริมกันเด่นที่สุดคือ {best} คู่ที่ควรวางกติกาให้ชัดคือ {care}", grpLeadAll: "ทุกคู่ในกลุ่มนี้เสริมกันได้ คู่ที่เด่นที่สุดคือ {best}",
      grpRoles: "หน้าที่ที่แนะนำมาจากธาตุประจำตัวของแต่ละคน เป็นจุดแข็งที่นำมาใช้ได้ ไม่ใช่ข้อจำกัด", feeds: "ช่วยเติมพลังให้ {list}",
      grpFrame: "ผลของกลุ่มช่วยให้เห็นว่าใครเสริมใคร และแบ่งหน้าที่กันอย่างไรให้ทุกคนได้ใช้จุดแข็ง",
      pairTitle: "{a} กับ {b}",
    },
    en: {
      defNames: ["Person 1", "Person 2", "Person 3", "Person 4", "Person 5", "Person 6", "Person 7", "Person 8"], and: " and ", list: ", ",
      ovTitle: "{a} and {b}", ovGroupTitle: "Group of {n}",
      ovLead: "Overall this is {lean}. Your strongest areas: {fit}.", ovLeadNoFit: "Overall this is {lean}. Every area has points that fit and points you can adjust towards each other.",
      ovCare: "Areas to look after: {care}. Each area below shows how to adjust.", ovCareNone: "No area needs special care. Each area below shows how to keep things going well.",
      ovAgree: "Of the {n} methods computed, they agree on {k} areas and see {d} areas differently (see \"Where the methods agree\").",
      ovFrame: "This result shows how to look after the relationship so it goes well. Numbers are a guide to be read with the detail of each area, not a verdict.",
      leanWord: { fit: "a relationship with a good fit", mixed: "a relationship with both easy areas and areas to adjust", care: "a relationship that asks for extra care" },
      guide: "LENSIQ guide figure combined from the lines above; not a number from the tradition itself.",
      thaiDay: "Birth days: {x} and {y} ({k})", thaiYear: "Year animals: {x} and {y} ({k})", thaiYel: "Birth-year elements (Phrommachat): {x} and {y} ({k})",
      baziDm: "Day Masters (day stems): {x} {ex} and {y} {ey} ({k})", baziDay: "Day branches: {x} and {y} ({k})", baziYear: "Year branches: {x} and {y} ({k})",
      vedNak: "Moon nakshatras (sidereal, Lahiri): {a} {x} in {rx}; {b} {y} in {ry}",
      vedKoota: "Eight kootas: {list}", vedOrder: "The tradition counts the bride first: with {a} and {b} in either order the score is {s1} or {s2} of 36 (this page does not ask anyone's gender, so both are shown).",
      vedCancel: "{k}: some schools ease this point because both signs share a ruler or the rulers are friends (the raw score is unchanged).",
      vedNadiEx: "{k}: some schools set this point aside when the two signs or nakshatras differ (the raw score is unchanged).",
      vedUnsure: "No birth time for {a}: that day the Moon could be in {x} or {y}; this page uses its noon position.",
      vedNotCouple: "Ashtakoota is a marriage-matching tradition; for other relationships it is shown for comparison only.",
      westPlanets: "Bodies used: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn (tropical). Five major aspects; orb 8° with the Sun or Moon, 6° otherwise, 4° for the sextile.",
      westTop: "Strongest contacts: {list}", westNone: "No clear major aspect between the two charts.",
      westNoTime: "A birth time is missing, so the Moon may be off by about ±6°; Moon contacts count at half weight.",
      westOff: "The western planets could not be computed (the calculator did not load); everything else still works.",
      agreeYes: "Every method computed sees this as {lean}.", agreeNo: "The methods differ: {parts}.", agreeFew: "Not enough methods computed to compare.", agreePart: "{m}: {lean}",
      mapCell: "{a} and {b}: {lean}, strongest in {fit}", mapCellCare: "{a} and {b}: {lean}, look after {care}", mapStep: "How to adjust: {s}",
      grpLead: "The pair that complements each other most: {best}. The pair that benefits most from clear ground rules: {care}.", grpLeadAll: "Every pair in this group can complement each other; the strongest is {best}.",
      grpRoles: "Suggested roles come from each person's Day Master element: strengths to use, not limits.", feeds: "Recharges {list}",
      grpFrame: "The group view shows who complements whom and how to share roles so everyone uses their strengths.",
      pairTitle: "{a} and {b}",
    },
    zh: {
      defNames: ["第一位", "第二位", "第三位", "第四位", "第五位", "第六位", "第七位", "第八位"], and: "和", list: "、",
      ovTitle: "{a}与{b}", ovGroupTitle: "{n}人小组",
      ovLead: "整体来看是{lean}。最契合的方面：{fit}。", ovLeadNoFit: "整体来看是{lean}。每个方面都有契合之处，也有可以互相调和的地方。",
      ovCare: "需要多用心的方面：{care}。下面每个方面都写了调整的方法。", ovCareNone: "没有特别需要留意的方面。下面每个方面都写了继续经营的方法。",
      ovAgree: "已计算的{n}种方法中，{k}个方面看法一致，{d}个方面看法不同（见“各方法是否一致”）。",
      ovFrame: "此结果帮助你们看到如何经营好这段关系。数字只是参考，需要和各方面的细节一起看，并非定论。",
      leanWord: { fit: "很契合的关系", mixed: "既有契合之处也有需要调和之处的关系", care: "需要多用心经营的关系" },
      guide: "LENSIQ 根据以上各项综合的参考值，并非典籍本身的数字。",
      thaiDay: "出生星期：{x}与{y}（{k}）", thaiYear: "生肖：{x}与{y}（{k}）", thaiYel: "出生年元素（《梵天书》）：{x}与{y}（{k}）",
      baziDm: "日主（日干）：{x}{ex}与{y}{ey}（{k}）", baziDay: "日支：{x}与{y}（{k}）", baziYear: "年支：{x}与{y}（{k}）",
      vedNak: "月亮星宿（恒星黄道，Lahiri）：{a} {x}（{rx}）；{b} {y}（{ry}）",
      vedKoota: "八项：{list}", vedOrder: "传统上先算女方：{a}和{b}顺序互换时分别为{s1}或{s2}分（满分36）。本页不询问性别，因此两种都列出。",
      vedCancel: "{k}：有些流派认为此项可减轻，因为双方星座守护星相同或互为朋友（原始分数不变）。",
      vedNadiEx: "{k}：有些流派在双方星座或星宿不同时不计此项（原始分数不变）。",
      vedUnsure: "{a}没有出生时间：当天月亮可能在{x}或{y}，本页采用正午位置。",
      vedNotCouple: "Ashtakoota 是婚配传统，用于其他关系时仅供比较。",
      westPlanets: "使用的星体：太阳、月亮、水星、金星、火星、木星、土星（回归黄道）。五种主要相位；有太阳或月亮时容许度 8°，其他 6°，六合相 4°。",
      westTop: "最明显的相位：{list}", westNone: "两张星盘之间没有明显的主要相位。",
      westNoTime: "有人缺少出生时间，月亮位置可能偏差约 ±6°，月亮相位只按一半权重计算。",
      westOff: "西洋行星暂时无法计算（计算模块未能载入），其他部分照常使用。",
      agreeYes: "所有已计算的方法都认为是{lean}。", agreeNo: "各方法看法不同：{parts}。", agreeFew: "已计算的方法不足以比较。", agreePart: "{m}认为{lean}",
      mapCell: "{a}与{b}：{lean}，最强在{fit}", mapCellCare: "{a}与{b}：{lean}，多留意{care}", mapStep: "调整方法：{s}",
      grpLead: "最互补的一对：{best}。最需要把规则说清楚的一对：{care}。", grpLeadAll: "这个小组每一对都能互补，最突出的是{best}。",
      grpRoles: "建议角色来自每个人的日主五行，是可以发挥的长处，不是限制。", feeds: "为{list}补充能量",
      grpFrame: "小组结果显示谁与谁互补，以及怎样分工让每个人发挥长处。",
      pairTitle: "{a}与{b}",
    },
  };

  const KB = { CATS, CAT, LEAN, METHOD, NAMES, S, BR, GEN, CARE_NONE, ROLE, WORK_USE, T };
  if (typeof module !== "undefined" && module.exports) module.exports = KB; else root.LQCompatKB = KB;
})(typeof window !== "undefined" ? window : globalThis);
