/* lensiq-merit-core.js — pure logic of the Merit MVP panel (owner order 2026-11-12; docs/MERIT-DESIGN.md). No DOM.
 *
 *   LQMeritCore.keysFromFacts(facts, page?)  -> matching keys of a reading, computed ON THE DEVICE from FortuneAI facts
 *                                               ("any", "domain:<d>", "animal:<n>", "chong", "element:<el>", "weak")
 *   LQMeritCore.match(items, {choice, keys, perType = 2, max = 8})  -> the items to show, in type order
 *   LQMeritCore.panelModel(items, {choice, keys, lang, pageFlag, serverFlag, crisis})  -> what lensiq-merit.js draws, or
 *                                               null while the crisis state is set (nothing next to a support card)
 *   LQMeritCore.paidAllowed({pageFlag, serverFlag, crisis})  -> true only for pageFlag === true && serverFlag === true && !crisis
 *   loadChoice / saveChoice (device storage "lq-merit-tradition"), crisisActive (reads the shared fortune crisis state; Merit stores nothing about a crisis)
 *   LABEL / NO_GUARANTEE   fixed strings (TH / EN / ZH), never admin-editable;   UI  every panel string in TH / EN / ZH
 * Nothing here sends anything anywhere. Used by lensiq-merit.js (browser) and tests/unit/merit.test.js (Node).
 */
(function (root) {
  "use strict";
  var TRADITIONS = ["thai_buddhist", "chinese_folk", "hindu_brahman", "general"];
  var CHOICES = ["", "thai_buddhist", "chinese_folk", "hindu_brahman", "general", "off"];
  var TYPES = ["place", "offering", "chong", "lucky_item"];
  var DOMAINS = ["zodiac", "bazi", "taksa", "lek7", "horoscope", "tarot", "siamsee", "iching", "dream", "astro", "numbers", "fengshui", "face", "palm",
    "lifegraph", "luckycolor", "planner"];
  var KEY_RE = new RegExp("^(?:any|chong|weak|domain:(?:" + DOMAINS.join("|") + ")|animal:(?:[0-9]|1[01])|element:(?:wood|fire|earth|metal|water))$");
  var PAGE_DOMAIN = { "faceread.html": "face", "palm.html": "palm", "horoscope.html": "horoscope", "tarot.html": "tarot", "fengshui.html": "fengshui",
    "numbers.html": "numbers", "iching.html": "iching", "zodiac.html": "zodiac", "astro.html": "astro", "dream.html": "dream", "bazi.html": "bazi",
    "taksa.html": "taksa", "lek7.html": "lek7", "lifegraph.html": "lifegraph", "luckycolor.html": "luckycolor", "planner.html": "planner" };
  var STORE_KEY = "lq-merit-tradition";
  var CHONG_REL = /^(?:(?:today|month)\.)?rel\.(?:clash|same|harm|punish|break)$/;

  var LABEL = Object.freeze({ th: "ตามความเชื่อ โปรดใช้วิจารณญาณ", en: "According to belief, please use your own judgement", zh: "依据民间信仰，请自行判断" });
  var NO_GUARANTEE = Object.freeze({
    th: "ไม่มีสิ่งใดรับประกันผล ข้อมูลนี้อ่านได้ฟรีและไม่ผูกกับการซื้อสิ่งใด",
    en: "Nothing here guarantees any result. This information is free and is not tied to buying anything.",
    zh: "以上内容不保证任何结果。此信息免费提供，与购买任何东西无关。"
  });

  var UI = {
    th: {
      title: "สิ่งที่ทำได้ตามความเชื่อ",
      intro: "แนวทางที่ผู้มีความเชื่อนิยมทำ เลือกความเชื่อของคุณเพื่อดูเฉพาะที่ตรงกัน อ่านได้ฟรี",
      pick: "ความเชื่อหรือประเพณีของคุณ",
      privacy: "ตัวเลือกนี้และผลดวงของคุณเก็บอยู่ในเครื่องนี้เท่านั้น ไม่ถูกส่งออกไป",
      "c.": "ทุกความเชื่อ (ยังไม่ได้เลือก)",
      "c.thai_buddhist": "พุทธแบบไทย",
      "c.chinese_folk": "ความเชื่อแบบจีน",
      "c.hindu_brahman": "ฮินดู–พราหมณ์",
      "c.general": "ไม่ระบุความเชื่อ (คำแนะนำทั่วไป)",
      "c.off": "ไม่ต้องแสดงส่วนนี้",
      "t.place": "สถานที่ไหว้หรือทำบุญ",
      "t.offering": "ของถวายและวิธีไหว้",
      "t.chong": "ธรรมเนียมช่วงปีชง",
      "t.lucky_item": "ของมงคลติดตัว พก หรือแขวน",
      sample: "ตัวอย่าง",
      place: "สถานที่",
      area: "พื้นที่",
      empty: "ยังไม่มีคำแนะนำสำหรับความเชื่อนี้และผลดวงนี้",
      off: "ซ่อนส่วนนี้ไว้ตามที่คุณเลือก เปลี่ยนได้ที่ตัวเลือกด้านบน",
      "p.title": "บริการทำบุญแทน (ไม่บังคับ)",
      "p.lead": "สำหรับผู้ที่ไปเองไม่สะดวก ทีมงานไปไหว้หรือถวายของแทนได้ เป็นบริการด้านเวลาและการเดินทางของทีมงาน ไม่ใช่การซื้อผลลัพธ์ คำแนะนำด้านบนใช้ได้ฟรีโดยไม่ต้องใช้บริการนี้",
      "p.fee": "ค่าบริการ (เวลาและค่าเดินทางของทีมงาน) แสดงแยกจากเงินทำบุญเสมอ",
      "p.donation": "เงินทำบุญส่งต่อเต็มจำนวน พร้อมรูปหรือวิดีโอยืนยันและใบเสร็จ",
      "p.status": "ยังไม่เปิดจองและไม่มีการเก็บเงิน ตอนนี้แจ้งความสนใจไว้ได้เท่านั้น",
      "f.name": "ชื่อหรือชื่อเล่น",
      "f.channel": "ช่องทางติดต่อ",
      "ch.line": "LINE",
      "ch.phone": "โทรศัพท์",
      "ch.email": "อีเมล",
      "f.contact": "LINE ID เบอร์โทร หรืออีเมล",
      "f.item": "คำแนะนำที่สนใจ",
      "f.from": "ช่วงวันที่สะดวก ตั้งแต่",
      "f.to": "ถึง",
      "f.consent": "ฉันยินยอมให้ LENSIQ เก็บชื่อ ช่องทางติดต่อ รายการที่สนใจ และช่วงวันที่ เพื่อติดต่อกลับเรื่องบริการนี้เท่านั้น ฉันเข้าใจว่ารายการที่เลือกอาจบอกถึงความเชื่อทางศาสนาของฉัน",
      "f.notice": "เราเก็บเฉพาะข้อมูลข้างต้น ไม่เก็บวันเกิด ที่อยู่ หรือรูปภาพ ข้อมูลถูกลบอัตโนมัติภายใน {n} วัน ขอลบก่อนหน้านั้นได้ อ่านเพิ่มที่",
      "f.noticeNoDays": "เราเก็บเฉพาะข้อมูลข้างต้น ไม่เก็บวันเกิด ที่อยู่ หรือรูปภาพ ข้อมูลถูกลบอัตโนมัติตามระยะเวลาที่กำหนด ขอลบก่อนหน้านั้นได้ อ่านเพิ่มที่",
      "f.privacy": "ความเป็นส่วนตัว",
      "f.send": "ส่งความสนใจ",
      "f.ok": "ได้รับแล้ว ทีมงานจะติดต่อกลับเมื่อบริการเปิด",
      "f.err": "ส่งไม่สำเร็จ ตรวจข้อมูลแล้วลองอีกครั้ง",
      "f.consentNeeded": "กรุณาติ๊กยินยอมก่อนส่ง"
    },
    en: {
      title: "What believers do",
      intro: "Practices people of each tradition follow. Choose your tradition to see only what matches. Free to read.",
      pick: "Your belief or tradition",
      privacy: "This choice and your reading stay on this device and are never sent.",
      "c.": "All traditions (not chosen yet)",
      "c.thai_buddhist": "Thai Buddhist",
      "c.chinese_folk": "Chinese folk belief",
      "c.hindu_brahman": "Hindu / Brahman",
      "c.general": "No particular tradition (general tips)",
      "c.off": "Don't show this section",
      "t.place": "Places to pray or make merit",
      "t.offering": "What to offer and how",
      "t.chong": "Customs in a clash (chong) year",
      "t.lucky_item": "Lucky items to wear, carry or hang",
      sample: "Sample",
      place: "Place",
      area: "Area",
      empty: "No guidance yet for this tradition and this reading.",
      off: "This section is hidden as you chose. Change it with the choice above.",
      "p.title": "Merit on your behalf (optional)",
      "p.lead": "For people who cannot travel, our staff can go and pay respects or make the offering for you. This is a service of staff time and travel, not a purchase of any result. The guidance above is free without this service.",
      "p.fee": "The service fee (staff time and travel) is always shown separately from the donation.",
      "p.donation": "The donation is passed on in full, with photo or video proof and a receipt.",
      "p.status": "Booking is not open and no payment is taken. For now you can only register your interest.",
      "f.name": "Name or nickname",
      "f.channel": "Contact channel",
      "ch.line": "LINE",
      "ch.phone": "Phone",
      "ch.email": "E-mail",
      "f.contact": "LINE ID, phone number or e-mail",
      "f.item": "Guidance you are interested in",
      "f.from": "Preferred dates from",
      "f.to": "to",
      "f.consent": "I agree that LENSIQ keeps my name, contact channel, chosen item and date window only to contact me about this service. I understand the chosen item may reveal my religious belief.",
      "f.notice": "We keep only the details above: no birth date, address or photo. They are deleted automatically within {n} days, or earlier on request. Read more:",
      "f.noticeNoDays": "We keep only the details above: no birth date, address or photo. They are deleted automatically after a set period, or earlier on request. Read more:",
      "f.privacy": "Privacy",
      "f.send": "Register interest",
      "f.ok": "Received. Our team will contact you when the service opens.",
      "f.err": "Could not send. Check the details and try again.",
      "f.consentNeeded": "Please tick the consent box first."
    },
    zh: {
      title: "按习俗可以做的事",
      intro: "各传统信众常做的事。选择你的信仰，只看与之相符的内容。免费阅读。",
      pick: "你的信仰或传统",
      privacy: "此选择和你的解读只保存在本设备上，不会发送出去。",
      "c.": "所有传统（尚未选择）",
      "c.thai_buddhist": "泰国佛教",
      "c.chinese_folk": "中国民间信仰",
      "c.hindu_brahman": "印度教 / 婆罗门",
      "c.general": "不限信仰（一般建议）",
      "c.off": "不显示此部分",
      "t.place": "参拜或行善的地方",
      "t.offering": "供品与参拜方式",
      "t.chong": "犯太岁年份的习俗",
      "t.lucky_item": "随身佩戴、携带或悬挂的吉祥物",
      sample: "示例",
      place: "地点",
      area: "地区",
      empty: "暂无适合此信仰和此解读的内容。",
      off: "已按你的选择隐藏此部分，可在上方选项中更改。",
      "p.title": "代为行善服务（可选）",
      "p.lead": "为不方便亲自前往的人提供：工作人员可代你前往参拜或供奉。这是工作人员时间和交通的服务，不是购买任何结果。上方的建议无需此服务即可免费使用。",
      "p.fee": "服务费（工作人员时间和交通）始终与捐款分开显示。",
      "p.donation": "捐款全额转交，并附照片或视频证明及收据。",
      "p.status": "尚未开放预订，也不收取任何费用。目前只能登记意向。",
      "f.name": "姓名或昵称",
      "f.channel": "联系方式",
      "ch.line": "LINE",
      "ch.phone": "电话",
      "ch.email": "电子邮件",
      "f.contact": "LINE ID、电话号码或电子邮件",
      "f.item": "感兴趣的建议",
      "f.from": "方便的日期：从",
      "f.to": "到",
      "f.consent": "我同意 LENSIQ 保存我的姓名、联系方式、所选项目和日期范围，仅用于就此服务联系我。我明白所选项目可能透露我的宗教信仰。",
      "f.notice": "我们只保存上述信息，不保存生日、地址或照片。信息会在 {n} 天内自动删除，也可提前要求删除。详见：",
      "f.noticeNoDays": "我们只保存上述信息，不保存生日、地址或照片。信息会在规定期限后自动删除，也可提前要求删除。详见：",
      "f.privacy": "隐私",
      "f.send": "登记意向",
      "f.ok": "已收到。服务开放时我们的团队会联系你。",
      "f.err": "发送失败，请检查信息后重试。",
      "f.consentNeeded": "请先勾选同意。"
    }
  };
  var PAID_KEYS = ["p.title", "p.lead", "p.fee", "p.donation", "p.status"];
  var PAID_FIELDS = ["name", "channel", "contact", "item_id", "date_from", "date_to", "consent"];

  /** @param {any} v @returns {string} */
  function normChoice(v) { return typeof v === "string" && CHOICES.indexOf(v) >= 0 ? v : ""; }
  /** @param {any} lang @returns {"th"|"en"|"zh"} */
  function normLang(lang) { return lang === "en" || lang === "zh" ? lang : "th"; }
  /** Text of a {th, en, zh} object in a language (Thai as the fallback). @param {any} o @param {string} lang */
  function text(o, lang) {
    if (!o || typeof o !== "object") return "";
    var v = o[normLang(lang)];
    return typeof v === "string" && v ? v : typeof o.th === "string" ? o.th : "";
  }

  /** @param {any} store */
  function loadChoice(store) { try { return store ? normChoice(store.getItem(STORE_KEY)) : ""; } catch (e) { return ""; } }
  /** @param {any} store @param {any} v */
  function saveChoice(store, v) { try { if (store) store.setItem(STORE_KEY, normChoice(v)); } catch (e) { /* private mode: not remembered */ } }
  /* Crisis state (owner decision 2026-11-12, session only, L59): Merit keeps NO crisis state of its own and writes nothing
   * about a crisis anywhere. It asks the shared fortune crisis state: FortuneAI.crisis.allow("merit") (fortune-ai.js), else
   * LQFortuneCrisis.allow("merit") (fortune-crisis.js). Whatever that state covers (the page, or the browser session once
   * fortune-crisis.js keeps it there) Merit follows automatically. With neither API on the page there is no reading to
   * attach to, so nothing is shown anyway.
   * @param {any} [win] the window (default: this one) @param {any} [d] the document */
  function crisisActive(win, d) {
    var w = win || root;
    try {
      var FA = w && w.FortuneAI;
      if (FA && FA.crisis && typeof FA.crisis.allow === "function") return !FA.crisis.allow("merit", d);
    } catch (e) { /* fall through */ }
    try {
      var CR = w && w.LQFortuneCrisis;
      if (CR && typeof CR.allow === "function") return !CR.allow("merit", d);
    } catch (e) { /* no shared state */ }
    return false;
  }

  /** Items whose every text passes the wording lint (the page re-checks what the server sent). No lint: nothing.
   *  @param {any[]} items @param {any} lint */
  function safeItems(items, lint) {
    if (typeof lint !== "function") return [];
    return (Array.isArray(items) ? items : []).filter(function (it) {
      if (!it || typeof it !== "object") return false;
      return ["title", "body", "place", "area"].every(function (f) {
        var o = it[f];
        if (o == null) return f === "place" || f === "area";
        if (typeof o !== "object") return false;
        return ["th", "en", "zh"].every(function (l) { return o[l] == null || !lint(String(o[l])).length; });
      });
    });
  }

  /** Matching keys of a reading, from FortuneAI facts (never sent anywhere). @param {any} facts @param {string} [page] */
  function keysFromFacts(facts, page) {
    var out = ["any"];
    var add = function (/** @type {string} */ k) { if (KEY_RE.test(k) && out.indexOf(k) < 0) out.push(k); };
    var f = facts && typeof facts === "object" ? facts : null;
    var d = f && typeof f.domain === "string" && DOMAINS.indexOf(f.domain) >= 0 ? f.domain : null;
    if (!d && typeof page === "string") d = PAGE_DOMAIN[page.split("/").pop() || ""] || null;
    if (d) add("domain:" + d);
    var items = f && Array.isArray(f.items) ? f.items : [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || typeof it !== "object" || typeof it.id !== "string") continue;
      var id = it.id, m;
      if ((m = /^animal\.(\d{1,2})$/.exec(id)) && +m[1] <= 11) add("animal:" + (+m[1]));
      if (CHONG_REL.test(id) || /^today\.clash$/.test(id)) add("chong");
      if ((m = /(?:^|\.)(?:useful|lack|lo)\.(wood|fire|earth|metal|water)$/.exec(id))) add("element:" + m[1]);
      // face reading uses the Chinese five elements; palmistry's "element.water" is the Western four-element hand type
      if ((m = /^element\.(wood|fire|earth|metal|water)$/.exec(id)) && d !== "palm") add("element:" + m[1]);
      if (it.polarity === "challenge" || it.tone === "caution" || id === "str.weak") add("weak");
    }
    return out;
  }

  /** Does an item belong to the chosen tradition? @param {any} it @param {string} choice */
  function traditionOk(it, choice) {
    if (choice === "off") return false;
    if (!choice) return true;
    if (choice === "general") return it.tradition === "general";
    return it.tradition === choice || it.tradition === "general";
  }

  /** FNV-1a 32-bit + murmur3 finalizer: a stable, non-secret hash (same input, same number, on every device). @param {string} s */
  function hash32(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    // final avalanche (murmur3 fmix32): strings that differ only in the last character still spread evenly
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  /** A stable string that identifies a reading's RESULT (discipline, area of life asked about, every fact id with its tone),
   *  used only to rotate equally good cards. Same result -> same cards; a different result -> usually different cards.
   *  Computed and used on the device only. @param {any} facts @param {string} [page] */
  function resultSeed(facts, page) {
    var f = facts && typeof facts === "object" ? facts : null;
    if (!f) return "";
    var d = typeof f.domain === "string" && DOMAINS.indexOf(f.domain) >= 0 ? f.domain : (typeof page === "string" && PAGE_DOMAIN[page.split("/").pop() || ""]) || "";
    var ids = (Array.isArray(f.items) ? f.items : []).filter(function (/** @type {any} */ it) { return it && typeof it.id === "string"; })
      .map(function (/** @type {any} */ it) { return it.id + "/" + (it.polarity || it.tone || ""); }).sort();
    if (!ids.length) return "";
    return d + "|" + (typeof f.topic === "string" ? f.topic : "") + "|" + ids.join(",");
  }

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
    var L = ["th", "en", "zh"].indexOf(normLang(lang)), d = typeof f.domain === "string" && FOCUS.disc[f.domain] ? f.domain : PAGE_DOMAIN[String(page || "").split("/").pop() || ""];
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

  /** @param {any[]} items @param {{choice?: string, keys?: string[], perType?: number, max?: number, seed?: string, mix?: boolean}} o */
  function match(items, o) {
    var opt = o || {}, choice = normChoice(opt.choice), keys = Array.isArray(opt.keys) ? opt.keys : ["any"];
    var seed = typeof opt.seed === "string" ? opt.seed : "", mix = opt.mix === true;
    var perType = opt.perType == null ? 2 : opt.perType, max = opt.max == null ? 8 : opt.max;
    var chong = keys.indexOf("chong") >= 0;
    /** @type {any[]} */
    var cand = [];
    (Array.isArray(items) ? items : []).forEach(function (it) {
      if (!it || typeof it !== "object" || (it.status && it.status !== "published")) return;
      if (TYPES.indexOf(it.type) < 0 || !traditionOk(it, choice)) return;
      if (it.type === "chong" && !chong) return; // ชง customs only for a ชง reading (R4)
      var ik = Array.isArray(it.keys) ? it.keys : [];
      var hits = ik.filter(function (/** @type {string} */ k) { return keys.indexOf(k) >= 0; });
      if (!hits.length) return;
      cand.push({ it: it, score: hits.filter(function (/** @type {string} */ k) { return k !== "any"; }).length });
    });
    var out = /** @type {any[]} */ ([]);
    TYPES.forEach(function (ty) {
      var c = cand.filter(function (x) { return x.it.type === ty; });
      // Equal matches: with a reading's result seed, rotate by a stable hash of (result, item) so one reading always gets
      // the same cards and different results spread over every card (owner order 2026-11-17, 4b, route ก). Without a seed
      // (no reading facts): the admin sort order, then id, as before.
      if (seed) c.forEach(function (x) { x.rot = hash32(seed + "\u0001" + String(x.it.id)); });
      c.sort(function (a, b) {
        return b.score - a.score || (seed ? a.rot - b.rot : 0) || (Number(a.it.sort) || 0) - (Number(b.it.sort) || 0) || String(a.it.id).localeCompare(String(b.it.id));
      });
      var pick = c.slice(0, perType);
      // mix (no tradition chosen yet, a reading's result known): per type the closest match to the result (a specific key,
      // ties rotated) plus ONE more card rotated over everything else that matches, so no single card is shown to everyone.
      if (mix && seed) {
        pick = c.length && c[0].score > 0 ? [c[0]] : [];
        var rest = c.filter(function (x) { return pick.indexOf(x) < 0; }).sort(function (a, b) { return a.rot - b.rot; });
        if (rest.length) pick.push(rest[0]);
        pick = pick.slice(0, perType);
      }
      pick.forEach(function (x) { if (out.length < max) out.push(x.it); });
    });
    return out;
  }

  /** @param {{pageFlag?: any, serverFlag?: any, crisis?: any}} o */
  function paidAllowed(o) { return !!o && o.pageFlag === true && o.serverFlag === true && o.crisis === false; }

  /** @param {any[]} items @param {{choice?: string, keys?: string[], facts?: any, page?: string, seed?: string, lang?: string, pageFlag?: any, serverFlag?: any, crisis?: boolean, retentionDays?: any}} o */
  function panelModel(items, o) {
    var opt = o || {};
    if (opt.crisis) return null;
    var lang = normLang(opt.lang), U = UI[lang], choice = normChoice(opt.choice);
    var keys = Array.isArray(opt.keys) ? opt.keys : keysFromFacts(opt.facts, opt.page);
    var seed = typeof opt.seed === "string" ? opt.seed : resultSeed(opt.facts, opt.page);
    // no tradition chosen yet: a mixed panel (closest match + one rotated card per type); a chosen tradition: up to 2 per type
    var shown = match(items, { choice: choice, keys: keys, seed: seed, mix: !choice });
    var cards = shown.map(function (it) {
      return { id: String(it.id), type: it.type, tradition: it.tradition, typeLabel: U["t." + it.type], title: text(it.title, lang), body: text(it.body, lang),
        place: it.place ? text(it.place, lang) : "", area: it.area ? text(it.area, lang) : "", sample: it.sample === true, label: LABEL[lang] };
    });
    var paid = null;
    if (choice !== "off" && cards.length && paidAllowed({ pageFlag: opt.pageFlag, serverFlag: opt.serverFlag, crisis: opt.crisis === true })) {
      /** @type {Record<string, string>} */
      var t = {};
      PAID_KEYS.forEach(function (k) { t[k] = U[k]; });
      var days = Number(opt.retentionDays);
      t["f.notice"] = Number.isInteger(days) && days > 0 && days <= 3650 ? U["f.notice"].replace("{n}", String(days)) : U["f.noticeNoDays"];
      paid = { after: "guidance", text: t, fields: PAID_FIELDS.slice(), items: cards.map(function (c) { return { id: c.id, title: c.title }; }) };
    }
    var focus = cards.length && choice !== "off" ? focusLine(opt.facts, opt.page, lang) : "";
    return { lang: lang, choice: choice, off: choice === "off", cards: cards, focus: focus, footer: NO_GUARANTEE[lang], paid: paid };
  }

  var api = {
    VERSION: 1, TRADITIONS: TRADITIONS, CHOICES: CHOICES, TYPES: TYPES, DOMAINS: DOMAINS, KEY_RE: KEY_RE, STORE_KEY: STORE_KEY,
    LABEL: LABEL, NO_GUARANTEE: NO_GUARANTEE, UI: UI,
    normChoice: normChoice, normLang: normLang, text: text, loadChoice: loadChoice, saveChoice: saveChoice, crisisActive: crisisActive,
    safeItems: safeItems,
    keysFromFacts: keysFromFacts, resultSeed: resultSeed, hash32: hash32, focusLine: focusLine, FOCUS: FOCUS, match: match, paidAllowed: paidAllowed, panelModel: panelModel
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else /** @type {any} */ (root).LQMeritCore = api;
})(typeof window !== "undefined" ? window : globalThis);
