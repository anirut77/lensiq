/* lensiq-merit-core.js — pure logic of the Merit MVP panel (owner order 2026-11-12; docs/MERIT-DESIGN.md). No DOM.
 *
 *   LQMeritCore.keysFromFacts(facts, page?)  -> matching keys of a reading, computed ON THE DEVICE from FortuneAI facts
 *                                               ("any", "domain:<d>", "animal:<n>", "chong", "element:<el>", "weak")
 *   LQMeritCore.match(items, {choice, keys, perType = 2, max = 8})  -> the items to show, in type order
 *   LQMeritCore.panelModel(items, {choice, keys, lang, pageFlag, serverFlag, crisis})  -> what lensiq-merit.js draws, or
 *                                               null while the crisis state is set (nothing next to a support card)
 *   LQMeritCore.paidAllowed({pageFlag, serverFlag, crisis})  -> true only for pageFlag === true && serverFlag === true && !crisis
 *   loadChoice / saveChoice (device storage "lq-merit-tradition"), crisisActive / markCrisis ("lq-crisis-at", 24 h)
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
  var STORE_KEY = "lq-merit-tradition", CRISIS_KEY = "lq-crisis-at", CRISIS_WINDOW_MS = 24 * 3600 * 1000;
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
      "f.notice": "เราเก็บเฉพาะข้อมูลข้างต้น ไม่เก็บวันเกิด ที่อยู่ หรือรูปภาพ ข้อมูลถูกลบอัตโนมัติภายใน 90 วัน ขอลบก่อนหน้านั้นได้ อ่านเพิ่มที่",
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
      "f.notice": "We keep only the details above: no birth date, address or photo. They are deleted automatically within 90 days, or earlier on request. Read more:",
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
      "f.notice": "我们只保存上述信息，不保存生日、地址或照片。信息会在 90 天内自动删除，也可提前要求删除。详见：",
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
  /** @param {any} store @param {number} [nowMs] */
  function crisisActive(store, nowMs) {
    var at;
    try { at = store ? Number(store.getItem(CRISIS_KEY)) : NaN; } catch (e) { return false; }
    if (!isFinite(at) || at <= 0) return false;
    var t = nowMs == null ? Date.now() : nowMs;
    return t - at < CRISIS_WINDOW_MS; // a timestamp in the future (clock skew) also counts: the safe side
  }
  /** @param {any} store @param {number} [nowMs] */
  function markCrisis(store, nowMs) { try { if (store) store.setItem(CRISIS_KEY, String(nowMs == null ? Date.now() : nowMs)); } catch (e) { /* blocked storage */ } }

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
      if ((m = /^element\.(wood|fire|earth|metal|water)$/.exec(id))) add("element:" + m[1]);
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

  /** @param {any[]} items @param {{choice?: string, keys?: string[], perType?: number, max?: number}} o */
  function match(items, o) {
    var opt = o || {}, choice = normChoice(opt.choice), keys = Array.isArray(opt.keys) ? opt.keys : ["any"];
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
      c.sort(function (a, b) { return b.score - a.score || (Number(a.it.sort) || 0) - (Number(b.it.sort) || 0) || String(a.it.id).localeCompare(String(b.it.id)); });
      c.slice(0, perType).forEach(function (x) { if (out.length < max) out.push(x.it); });
    });
    return out;
  }

  /** @param {{pageFlag?: any, serverFlag?: any, crisis?: any}} o */
  function paidAllowed(o) { return !!o && o.pageFlag === true && o.serverFlag === true && o.crisis === false; }

  /** @param {any[]} items @param {{choice?: string, keys?: string[], lang?: string, pageFlag?: any, serverFlag?: any, crisis?: boolean}} o */
  function panelModel(items, o) {
    var opt = o || {};
    if (opt.crisis) return null;
    var lang = normLang(opt.lang), U = UI[lang], choice = normChoice(opt.choice);
    var shown = match(items, { choice: choice, keys: opt.keys });
    var cards = shown.map(function (it) {
      return { id: String(it.id), type: it.type, tradition: it.tradition, typeLabel: U["t." + it.type], title: text(it.title, lang), body: text(it.body, lang),
        place: it.place ? text(it.place, lang) : "", area: it.area ? text(it.area, lang) : "", sample: it.sample === true, label: LABEL[lang] };
    });
    var paid = null;
    if (choice !== "off" && cards.length && paidAllowed({ pageFlag: opt.pageFlag, serverFlag: opt.serverFlag, crisis: opt.crisis === true })) {
      /** @type {Record<string, string>} */
      var t = {};
      PAID_KEYS.forEach(function (k) { t[k] = U[k]; });
      paid = { after: "guidance", text: t, fields: PAID_FIELDS.slice(), items: cards.map(function (c) { return { id: c.id, title: c.title }; }) };
    }
    return { lang: lang, choice: choice, off: choice === "off", cards: cards, footer: NO_GUARANTEE[lang], paid: paid };
  }

  var api = {
    VERSION: 1, TRADITIONS: TRADITIONS, CHOICES: CHOICES, TYPES: TYPES, DOMAINS: DOMAINS, KEY_RE: KEY_RE, STORE_KEY: STORE_KEY, CRISIS_KEY: CRISIS_KEY,
    CRISIS_WINDOW_MS: CRISIS_WINDOW_MS, LABEL: LABEL, NO_GUARANTEE: NO_GUARANTEE, UI: UI,
    normChoice: normChoice, normLang: normLang, text: text, loadChoice: loadChoice, saveChoice: saveChoice, crisisActive: crisisActive, markCrisis: markCrisis,
    keysFromFacts: keysFromFacts, match: match, paidAllowed: paidAllowed, panelModel: panelModel
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else /** @type {any} */ (root).LQMeritCore = api;
})(typeof window !== "undefined" ? window : globalThis);
