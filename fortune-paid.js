/* fortune-paid.js — paid depth for fortune readings (owner order 2026-11-15). DESIGN ONLY, SWITCHED OFF.
 * docs/FORTUNE-PAID-DESIGN.md · fixed tests: tests/unit/fortune-paid.test.js, tests/e2e/fortune-paid.e2e.mjs (locked before this file).
 *
 * Switch: window.LENSIQ_FORTUNE_PAID === true (lensiq-config.js, default false). Off = nav.js does not load this file, and
 * if it is loaded anyway nothing changes: apply() returns the same result and decorate() returns before touching the page.
 * No payment is connected: a tap on a purchase control only shows "not on sale yet" and fires "lq-paid-request" on window.
 *
 * Free = an overview of every group: the main point, every caution in full, the guidance that goes with a caution (the
 * improvement plan, the advice group, any folded sentence that gives advice in a group with a caution), the summary, the
 * reminder, the help line. Paid = the rest of a group's in-depth text (what fortune-read.js puts behind "read more").
 *   rule a  a caution and its guidance are never paid; a paid part never carries a caution (composer marks + caution
 *           leads + caution words; anything that looks like a caution goes free)
 *   rule b  crisis / calm state (FortuneAI.crisis.allow("paid") false): nothing is locked, no price, no offer; on the
 *           "lq-crisis" event every offer is removed and the locked text is given back as free "read more"
 *   rule c  every offer shows its price and the list of headings the person will get, before its button
 *   rule d  paid text passes the same hard-limit and safety filters as free text (safe()); text that fails is dropped
 * Prices (approved list, THB, VAT included for consumers): 49 one group · 99 full reading · 199 full + month by month
 * (offered only when the result carries 12 months: res.monthly) · Plus 149 per month (everything). */
(function (root) {
  "use strict";
  /** @type {any} */
  const W = root;
  const isNode = typeof module !== "undefined" && module.exports && typeof require === "function";
  // plan: PROPOSAL (owner to confirm, docs/PENDING-DECISIONS.md); the plan itself is behind its own sub-switch LENSIQ_FORTUNE_PLAN
  const PRICES = { group: 49, full: 99, year: 199, plus: 149, plan: 99 };
  const GOALS = ["work", "money", "love", "health", "protection", "barami"];
  const TEXT = {
    th: {
      groupLabel: "อ่านเชิงลึกหมวด {g}", fullLabel: "คำทำนายฉบับเต็ม ทุกหมวด", yearLabel: "ฉบับเต็ม พร้อมรายเดือนทั้งปี", plusLabel: "Plus: อ่านเชิงลึกทุกหน้าดูดวง",
      panelTitle: "อ่านเชิงลึกเพิ่มเติม", lead: "สิ่งที่จะได้อ่าน", currency: "บาท", perMonth: "ต่อเดือน", buy: "เลือก",
      freeNote: "ภาพรวม ข้อควรระวัง และคำแนะนำตามความเชื่อทุกข้ออ่านได้ฟรีเสมอ ส่วนเชิงลึกเป็นรายละเอียดเพิ่ม ไม่ใช่ทางแก้",
      notOnSale: "ยังไม่เปิดขาย ระบบสั่งซื้อยังไม่เชื่อมต่อ และไม่มีการเก็บเงิน", monthly: "รายเดือน 12 เดือน", plusAll: "อ่านเชิงลึกทุกหมวด บนหน้าดูดวงทุกหน้า",
      ladderTitle: "ราคาทั้งหมด", ladder_group: "อ่านเชิงลึก 1 หมวด", ladder_full: "ทุกหมวด", ladder_year: "ทุกหมวด พร้อมรายเดือนทั้งปี", ladder_plus: "Plus ทุกหน้าดูดวง",
      beforePay: "ก่อนชำระเงิน: สิ่งที่จะได้อ่าน", madeFor: "ทำสำหรับ", madeForAnon: "คำทำนายนี้ทำจากข้อมูลที่คุณกรอกในหน้านี้",
      payNote: "ชำระด้วย PromptPay ได้โดยไม่ต้องสมัครสมาชิก เมื่อเปิดขาย (ตอนนี้ยังไม่เปิด)",
      planTitle: "แผนมูตามเป้าหมาย (ตามความเชื่อ)", planLead: "เลือกเป้าหมายของคุณเอง แล้วเราจัดลำดับและตารางเวลาให้",
      planFree: "สถานที่ สี และทิศในแผนเป็นข้อมูลฟรีทั้งหมดในคำทำนายและรายการสิ่งที่ทำได้ตามความเชื่อ ส่วนที่เสียค่าบริการคือการจัดลำดับและตารางเวลาให้คุณ ไม่สัญญาผลใด ๆ",
      planLabel: "แผนมูเพื่อ{g}", plan_place: "สถานที่", plan_time: "วันและเวลา", plan_steps: "ลำดับขั้นตอน", plan_offering: "ของถวาย", plan_colour: "สีและทิศของคุณ",
      "goal.work": "การงาน", "goal.money": "การเงิน", "goal.love": "ความรัก", "goal.health": "สุขภาพใจและกาย", "goal.protection": "ความคุ้มครอง", "goal.barami": "บารมี",
      belief: "ตามความเชื่อ โปรดใช้วิจารณญาณ", stepOffering: "เตรียม{x}", stepPlace: "ไปที่{x}", stepTime: "เลือกวันเกิดของคุณในสัปดาห์หรือวันพระ ช่วงเช้า",
      stepColour: "แต่งกายสีที่คำทำนายของคุณระบุ: {x}", stepDirection: "เมื่อไหว้ หันหน้าไปทางที่คำทำนายของคุณระบุ: {x}",
      stepIntent: "ตั้งจิตเรื่อง{g} แล้วทำความดีต่อเนื่องในชีวิตประจำวัน", shareTitle: "ผลดูดวงจาก LENSIQ",
      srcTitle: "แหล่งที่แนะนำ (ร้านภายนอก)", srcNote: "ลิงก์ไปร้านภายนอก เราไม่ได้ขายสินค้าเองและไม่ได้สัญญาผลใด ๆ ตามความเชื่อ โปรดใช้วิจารณญาณ",
    },
    en: {
      groupLabel: "In-depth reading: {g}", fullLabel: "Full reading, every group", yearLabel: "Full reading with the year month by month",
      plusLabel: "Plus: in-depth text on every fortune page", panelTitle: "Read in more depth", lead: "You will get", currency: "THB", perMonth: "per month",
      buy: "Choose", freeNote: "The overview, every caution and every piece of belief guidance are always free. The in-depth text adds detail; it is not a remedy.",
      notOnSale: "Not on sale yet. Ordering is not connected and nothing is charged.", monthly: "Month by month, 12 months",
      plusAll: "In-depth text for every group on every fortune page",
      ladderTitle: "All prices", ladder_group: "One group in depth", ladder_full: "Every group", ladder_year: "Every group with the year month by month",
      ladder_plus: "Plus, every fortune page", beforePay: "Before you pay: what you will get", madeFor: "Made for",
      madeForAnon: "This reading was made from what you entered on this page", payNote: "PromptPay without signing up, once sales open (not open yet)",
      planTitle: "Goal-based plan (by belief)", planLead: "Choose your own goal, and we arrange the order and the timing for you",
      planFree: "The places, colours and directions in the plan are all free information in your reading and in the belief guidance list. " +
        "The paid part is arranging the order and timing for you. No result is promised.",
      planLabel: "Plan for {g}", plan_place: "Places", plan_time: "Day and time", plan_steps: "Order of steps", plan_offering: "Offerings", plan_colour: "Your colours and directions",
      "goal.work": "work", "goal.money": "money", "goal.love": "love", "goal.health": "wellbeing", "goal.protection": "protection", "goal.barami": "barami (standing)",
      belief: "According to belief, please use your own judgement", stepOffering: "Prepare {x}", stepPlace: "Go to {x}",
      stepTime: "Choose the weekday you were born on, or a Buddhist holy day, in the morning",
      stepColour: "Dress in the colours your reading names: {x}", stepDirection: "When paying respects, face the direction your reading names: {x}",
      stepIntent: "Set your intention for {g}, then keep doing good in daily life", shareTitle: "A LENSIQ fortune reading",
      srcTitle: "Recommended sources (outside shops)", srcNote: "Links go to outside shops. We do not sell these items and promise no result. According to belief, please use your own judgement.",
    },
    zh: {
      groupLabel: "深入解读：{g}", fullLabel: "完整解读（全部类别）", yearLabel: "完整解读＋全年逐月", plusLabel: "Plus：所有占卜页面的深入解读", panelTitle: "深入阅读",
      lead: "您将获得", currency: "泰铢", perMonth: "每月", buy: "选择", freeNote: "总览、每一条注意事项和每一条依传统说法的建议始终免费。深入内容只是更多细节，不是化解方法。",
      notOnSale: "尚未开售。下单功能未接通，不会收取任何费用。", monthly: "逐月解读（12 个月）", plusAll: "所有占卜页面全部类别的深入解读",
      ladderTitle: "全部价格", ladder_group: "一个类别的深入解读", ladder_full: "全部类别", ladder_year: "全部类别＋全年逐月", ladder_plus: "Plus（所有占卜页面）",
      beforePay: "付款前：您将获得的内容", madeFor: "为您制作", madeForAnon: "本解读根据您在本页填写的资料制作", payNote: "开售后可用 PromptPay 付款，无需注册（目前尚未开放）",
      planTitle: "按目标的参拜安排（依传统说法）", planLead: "请先选择您自己的目标，我们为您安排顺序和时间",
      planFree: "安排中的地点、颜色和方位在您的解读和按习俗可以做的事中全部免费提供。付费部分是为您安排顺序和时间，不承诺任何结果。",
      planLabel: "{g}参拜安排", plan_place: "地点", plan_time: "日期和时间", plan_steps: "步骤顺序", plan_offering: "供品", plan_colour: "您的颜色和方位",
      "goal.work": "事业", "goal.money": "财运", "goal.love": "感情", "goal.health": "身心安康", "goal.protection": "平安守护", "goal.barami": "威望",
      belief: "依据传统说法，请自行判断", stepOffering: "准备{x}", stepPlace: "前往{x}", stepTime: "选择您出生的星期几或佛日的早上",
      stepColour: "穿您的解读所说的颜色：{x}", stepDirection: "礼拜时面向您的解读所说的方位：{x}", stepIntent: "为{g}发愿，并在日常生活中持续行善", shareTitle: "LENSIQ 占卜结果",
      srcTitle: "推荐来源（外部商店）", srcNote: "链接通往外部商店，我们不出售这些物品，也不承诺任何结果。依据传统说法，请自行判断。",
    },
  };
  /** @param {any} l @returns {"th"|"en"|"zh"} */
  const langOf = l => (l === "en" || l === "zh" ? l : "th");
  /** @returns {any} */
  const FA = () => W.FortuneAI || (isNode ? require("./fortune-ai.js") : null);
  /** @returns {any} */
  const RD = () => W.LQRead || (isNode ? require("./fortune-read.js") : null);
  /** the switch: only a literal true turns it on @param {any} [w] */
  const enabled = w => (w || W).LENSIQ_FORTUNE_PAID === true;

  /* ---------------- rule d: the same filters as free text ---------------- */
  /** @param {any} text @param {{straight?: boolean}} [o] */
  function safe(text, o) {
    const F = FA();
    if (!F || !F.safety || !F.straight) return false;
    const t = String(text == null ? "" : text);
    if (F.straight.hardLimit(t)) return false;
    return o && o.straight ? !!F.straight.isSafe(t) : !!F.safety.isSafe(t);
  }

  /* ---------------- rule a: what counts as a caution or as guidance ---------------- */
  const CAUTION = {
    th: new RegExp("ระวัง|อุปสรรค|ดวงตก|ดวงอ่อน|ดวงที่อ่อน|เคราะห์|ปีชง|เสียเงิน|เสียทรัพย์|ทะเลาะ|ผิดใจ|ไม่หวังดี|ขัดแย้ง|ศัตรู|สูญเสีย|" +
      "ติดขัด|ล่าช้า|ตึงมือ|อ่อนล้า|กาลกิณี|อัปมงคล|ไม่ค่อยดี|ไม่ดี|ไม่ราบรื่น|แกว่ง|เสี่ยง|จุดอ่อน|ใส่ใจ"),
    en: new RegExp("\\b(?:careful|caution\\w*|beware|weak(?:er|ness|est)?|obstacles?|loss(?:es)?|losing|conflicts?|delays?|setbacks?|risks?|risky|strain\\w*|" +
      "tension|watch out|avoid\\w*|challeng\\w*|difficult\\w*|trouble\\w*|unfavou?rable|ill-wishers?|wish you ill|bad luck|pitfalls?|overspend\\w*|disputes?|" +
      "quarrel\\w*|tight|mind (?:your|the)|pay attention)\\b", "i"),
    zh: /小心|注意|谨慎|阻碍|阻力|破财|小人|冲突|不利|低迷|压力|风险|避免|挑战|困难|麻烦|波折|争执|口舌|紧张|留意|提防|太岁|弱点|偏弱/,
  };
  const ADVICE = {
    th: /ควร|ลอง|แนะนำ|เคล็ด|วิธี|บูชา|ทำบุญ|ไหว้|สวดมนต์|สีที่|ทิศ|ใส่|พกติดตัว|ช่วยได้|ทำได้/,
    en: /\b(?:try|should|tip|suggest\w*|recommend\w*|wear|carry|choose|make merit|pray\w*|offerings?|remed\w*|helps?|consider|keep)\b/i,
    zh: /建议|可以|不妨|宜|应|穿|佩戴|选择|供奉|拜|行善|祈福|有助/,
  };
  /* review F1 / F2 (2026-11-15): belief guidance (lucky colour, direction, rite, element tip, lucky item), feng-shui flying stars
     2 / 5 and "avoid / don't" warnings are never paid, in any group (fallback to the composer's section.guidance marks) */
  /** @param {"th"|"en"|"zh"} l @returns {RegExp} */
  const guideRe = l => { const F = FA(); return (F && F.straight && F.straight.GUIDE && F.straight.GUIDE[l]) || /$^/; };
  // the reading layout draws an advice box (data-lq-remedy) after such a part: never take it away (fortune-read.js adviceBox rule)
  const FRAME = { th: /ควร|ลอง|วิธีปรับ|สิ่งที่ทำได้|ข้อแนะนำ|เคล็ด|เลือก|ใส่|ใช้กับ|สีที่เข้ากับ|สีมงคล|ทิศที่ส่งเสริม|ไหว้|บูชา|ทำบุญ/,
    en: /\b(?:try|wear|choose|should|tip|remedy|suit|face|pay|make merit|pray)\b/i, zh: /建议|可以|不妨|穿|选择|宜|适合|朝|拜|供奉|孝/ };
  /** @param {string} t @param {"th"|"en"|"zh"} l */
  const adviceBox = (t, l) => { const R = RD(); return !!(R && R.adviceKinds && R.adviceKinds(t, l).length && FRAME[l].test(t)); };
  const leadCache = /** @type {Record<string, string[]>} */ ({});
  /** caution leads the composer can use (straight leads, natal leads, gentle caution leads), whole and their tails */
  function leads(/** @type {"th"|"en"|"zh"} */ l) {
    if (leadCache[l]) return leadCache[l];
    const F = FA(), out = new Set();
    /** @param {any} x @returns {string[]} */
    const flat = x => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === "object" ? Object.values(x).flatMap(flat) : typeof x === "string" ? [x] : []);
    try {
      const all = flat(F.straight.LEADS && F.straight.LEADS[l]).concat(flat(F.straight.NATAL_LEADS && F.straight.NATAL_LEADS[l]),
        flat(F._internal && F._internal.cautionLeads ? F._internal.cautionLeads(l) : []));
      const min = l === "zh" ? 6 : 14, re = l === "zh" ? /[，,]/g : l === "en" ? /, | /g : / /g;
      for (const raw of all) {
        const lead = String(raw).replace(/[.。]$/, "");
        if (lead.length >= min) out.add(lead);
        let m; re.lastIndex = 0;
        while ((m = re.exec(lead))) { const t = lead.slice(m.index + m[0].length); if (t.length >= min) out.add(t); }
      }
    } catch (e) { /* no leads: the caution words still apply */ }
    return (leadCache[l] = [...out]);
  }
  /** @param {string} m @param {"th"|"en"|"zh"} l */
  function fragments(m, l) {
    m = String(m || "").trim();
    if (l === "zh") return m.split(/[，。；！？、]/).map(x => x.trim()).filter(x => x.length >= 8);
    if (l === "en") return m.split(/[,;:.!?]\s+|\s+(?:and|but|so)\s+/).map(x => x.trim()).filter(x => x.length >= 25);
    return m.split(/\s+/).filter(x => x.length >= 15);
  }
  /** @param {string} t @param {"th"|"en"|"zh"} l */
  const isCaution = (t, l) => CAUTION[l].test(t) || leads(l).some(q => t.includes(q));
  /** guidance pieces of the reading's own improvement plan (always free) @param {any} res @param {"th"|"en"|"zh"} l */
  const planFrags = (res, l) => ((res && res.plan && res.plan.items) || [])
    .flatMap((/** @type {any} */ x) => [String(x.t || "")].concat(fragments(x.t, l))).filter(Boolean);
  /** where one folded part goes: "free" | "paid" | "drop" @param {string} t @param {any} ctx */
  function classify(t, ctx) {
    if (!safe(t, { straight: ctx.straight })) return "drop";
    if (ctx.marked) return "free"; // the composer's guidance mark (section.guidance)
    if (isCaution(t, ctx.lang) || ctx.plan.some((/** @type {string} */ q) => q && t.includes(q))) return "free";
    if (guideRe(ctx.lang).test(t) || adviceBox(t, ctx.lang)) return "free"; // review F1 / F2: in every group, caution or not
    if (ctx.sectionCaution && ADVICE[ctx.lang].test(t)) return "free";
    return "paid";
  }
  /** the heading the layout shows for a section @param {any} s @param {"th"|"en"|"zh"} l */
  function titleOf(s, l) {
    const R = RD(), F = FA(), id = s && s.id;
    const std = [F && F.SECTION_TITLES, F && F.en && F.en.TITLES, F && F.zh && F.zh.TITLES].map(x => (x && x[id]) || "").filter(Boolean);
    if (R && R.HEADINGS[l][id] && (!s.title || std.includes(s.title) || id === "brief")) return R.HEADINGS[l][id];
    return String((s && s.title) || (R && R.HEADINGS[l][id]) || id || "");
  }

  /** split one composed result into free and paid parts (pure; the switch is checked by apply / decorate)
   *  @param {any} res @param {{lang?: string, straight?: boolean}} [o] */
  function split(res, o) {
    o = o || {};
    if (!res || res.crisis || res.source === "support" || !Array.isArray(res.sections) || !res.sections.length) return null;
    const R = RD(); if (!R) return null;
    const lang = langOf(o.lang || res.lang), straight = o.straight != null ? !!o.straight : res.mode === "straight";
    const plan = planFrags(res, lang);
    const groups = res.sections.map((/** @type {any} */ s) => {
      const parts = R.planSection(s, lang);
      const g = { id: s.id, title: titleOf(s, lang), free: /** @type {string[]} */ ([]), paid: /** @type {string[]} */ ([]), dropped: /** @type {string[]} */ ([]) };
      const ctx = { lang, straight, plan, sectionCaution: parts.some((/** @type {any} */ p) => p.caution || isCaution(p.text, lang)) };
      const marks = Array.isArray(s.guidance) && s.guidance.length === (s.paragraphs || []).length ? s.guidance : null;
      for (const p of parts) {
        const where = p.visible || s.id === "advice" ? "free" : classify(p.text, Object.assign({}, ctx, { marked: !!(marks && marks[p.para]) }));
        (where === "free" ? g.free : where === "paid" ? g.paid : g.dropped).push(p.text);
      }
      return g;
    });
    const free = Object.assign({}, res, { sections: groups.map((/** @type {any} */ g) => ({ id: g.id, title: g.title, paragraphs: g.free.slice() })) });
    return { lang, straight, groups, free, monthly: Array.isArray(res.monthly) ? res.monthly : null };
  }

  /** @param {number} n @param {"th"|"en"|"zh"} l @param {boolean} [month] */
  function priceText(n, l, month) {
    const T = TEXT[l];
    if (l === "zh") return (month ? T.perMonth + " " : "") + n + " " + T.currency;
    return n + " " + T.currency + (month ? " " + T.perMonth : "");
  }
  /** the offers for one split (rule c: price + headings on every one; rule b: none in the crisis state)
   *  @param {any} sp @param {string} [lang] @param {{crisis?: boolean, doc?: any}} [o] */
  function offers(sp, lang, o) {
    o = o || {};
    if (!sp || o.crisis || !allowed(o.doc)) return [];
    const l = langOf(lang || sp.lang), T = TEXT[l];
    const paid = sp.groups.filter((/** @type {any} */ g) => g.paid.length);
    if (!paid.length) return [];
    const titles = paid.map((/** @type {any} */ g) => g.title);
    /** @param {string} plan @param {string} label @param {string[]} headings @param {any} [extra] */
    const offer = (plan, label, headings, extra) => { const pt = priceText(/** @type {any} */ (PRICES)[plan], l, plan === "plus");
      return Object.assign({ plan, price: /** @type {any} */ (PRICES)[plan], priceText: pt, label, headings, button: T.buy + " · " + pt }, extra || {}); };
    const out = paid.map((/** @type {any} */ g) => offer("group", T.groupLabel.replace("{g}", g.title), [g.title], { group: g.id }));
    out.push(offer("full", T.fullLabel, titles.slice()));
    if (Array.isArray(sp.monthly) && sp.monthly.length) out.push(offer("year", T.yearLabel, titles.concat(T.monthly)));
    out.push(offer("plus", T.plusLabel, [T.plusAll].concat(titles)));
    return out;
  }
  /** rule b: may paid content show on this page? (crisis state, calm session) @param {any} [doc] */
  function allowed(doc) {
    const F = FA();
    try { return !(F && F.crisis && F.crisis.allow && !F.crisis.allow("paid", doc)); } catch (e) { return false; }
  }
  /** the result to use: the same object when off, in the crisis state, or for a support card @param {any} res @param {any} [o] */
  function apply(res, o) {
    o = o || {};
    if (!enabled() || o.crisis || !allowed(o.doc) || !res || res.crisis) return res;
    return split(res, o) || res;
  }

  /* ---------------- owner order 2026-11-15 (2): ladder, preview, made-for, share card, funnel, goal-based plan ---------------- */
  /** the price ladder shown together (49 one group · 99 every group · 199 with the year · Plus 149 per month) @param {string} [lang] */
  function ladder(lang) {
    const l = langOf(lang), T = /** @type {any} */ (TEXT[l]);
    return ["group", "full", "year", "plus"].map(plan => ({ plan, price: /** @type {any} */ (PRICES)[plan], priceText: priceText(/** @type {any} */ (PRICES)[plan], l, plan === "plus"),
      label: T["ladder_" + plan] }));
  }
  /** @param {string} t @param {"th"|"en"|"zh"} l */
  const line = (t, l) => { const max = l === "zh" ? 40 : 90; t = String(t || "").trim(); return t.length > max ? t.slice(0, max).trim() + "…" : t; };
  /** who the reading was made for: the nickname when given, the reading's headline (from the birth data the page used) */
  function madeFor(/** @type {any} */ subj, /** @type {"th"|"en"|"zh"} */ l) {
    const T = TEXT[l], bits = [subj && subj.nickname, subj && subj.headline].map(x => String(x || "").trim()).filter(Boolean);
    return bits.length ? T.madeFor + ": " + bits.join(" · ") : T.madeForAnon;
  }
  /** conversion b + c: the pre-payment preview: every paid group's heading with at most its first two paid lines
   *  @param {any} sp @param {string} [lang] @param {any} [subj] @param {{crisis?: boolean, doc?: any}} [o] */
  function preview(sp, lang, subj, o) {
    o = o || {};
    if (!sp || o.crisis || !allowed(o.doc)) return null;
    const l = langOf(lang || sp.lang), paid = sp.groups.filter((/** @type {any} */ g) => g.paid.length);
    if (!paid.length) return null;
    const groups = paid.map((/** @type {any} */ g) => ({ title: g.title, lines: g.paid.slice(0, 2).map((/** @type {string} */ t) => line(t, l)) }));
    return { title: TEXT[l].beforePay, madeFor: madeFor(subj, l), groups,
      ladder: ladder(l), note: TEXT[l].payNote };
  }
  /** conversion f: a share card with no personal data unless the person chooses it (showName / showBirth)
   *  @param {any} res @param {{lang?: string, nickname?: string, headline?: string, showName?: boolean, showBirth?: boolean}} [o] */
  function shareCard(res, o) {
    o = o || {};
    if (!res || res.crisis || res.source === "support" || !Array.isArray(res.sections) || !res.sections.length) return null;
    const l = langOf(o.lang || res.lang), R = RD(), nick = String(o.nickname || "").trim(), head = String(o.headline || "").trim();
    const scrub = (/** @type {string} */ t) => { let x = String(t || ""); for (const v of [nick, head]) if (v) x = x.split(v).join(""); return x.replace(/\s{2,}/g, " ").trim(); };
    const gist = R ? (R.planSection(res.sections[0], l)[0] || {}).text : (res.sections[0].paragraphs || [])[0];
    const lines = [line(scrub(gist), l)].filter(Boolean);
    if (o.showName && nick) lines.unshift(nick);
    if (o.showBirth && head) lines.push(head);
    return { title: TEXT[l].shareTitle, lines };
  }
  const STEPS = ["overview", "open", "tap", "paid"];
  /** funnel: one total per step through the consent-gated analytics (nothing without it; no personal field) @param {string} step */
  function funnel(step) {
    const A = W.LQAnalytics;
    if (STEPS.indexOf(step) < 0 || !A || typeof A.feature !== "function") return false;
    try { if (typeof A.consent === "function" && A.consent() !== "yes") return false; A.feature("fortune.paid." + step, "start"); return true; } catch (e) { return false; }
  }
  /** the plan needs both switches exactly true */
  const planEnabled = () => enabled() && W.LENSIQ_FORTUNE_PLAN === true;
  /** @returns {any} */
  const MLINT = () => W.LQMeritLint || (isNode ? require("./lensiq-merit-lint.js") : null);
  /** published Merit entries usable in a plan: never a "weak" / "chong" entry (a plan is never the answer to a warning) @param {any[]} items */
  function planItems(items) {
    const L = MLINT();
    return (Array.isArray(items) ? items : []).filter(it => it && it.status === "published" && it.type !== "chong" && !(it.keys || []).some((/** @type {string} */ k) => k === "weak" || k === "chong"))
      .filter(it => { try { return !L || !L.lintMerit || !(L.lintMerit(it) || []).length; } catch (e) { return true; } });
  }
  /** goal-based plan (แผนมูตามเป้าหมาย): chosen by the person's goal only; places from published Merit entries; colours and
   *  directions only from the facts' extras that the free reading already shows; every step "according to belief", no promise
   *  @param {string} goal @param {{facts?: any, res?: any, lang?: string, items?: any[], crisis?: boolean, doc?: any}} o */
  function planFor(goal, o) {
    o = o || {};
    if (!planEnabled() || o.crisis || !allowed(o.doc) || GOALS.indexOf(goal) < 0) return null;
    const res = o.res, F = o.facts || {};
    if (!res || res.crisis || res.source === "support") return null;
    const l = langOf(o.lang || res.lang), T = /** @type {any} */ (TEXT[l]), pick = (/** @type {any} */ x) => String((x && (x[l] || x.th)) || "").replace(/^(?:ตัวอย่าง|Sample|示例)[:：]\s*/, "").trim();
    const its = planItems(o.items || W.LQ_MERIT_SEED || []), dom = "domain:" + (F.domain || "");
    const fits = (/** @type {any} */ it) => (it.keys || []).some((/** @type {string} */ k) => k === "any" || k === dom);
    const places = its.filter(it => it.type === "place" && fits(it)).slice(0, 2), offs = its.filter(it => it.type === "offering" && fits(it)).slice(0, 2);
    if (!places.length) return null;
    const sp = split(res, { lang: l }), free = sp ? sp.groups.flatMap((/** @type {any} */ g) => g.free).join(" ") + JSON.stringify(res.summary || "") + JSON.stringify(res.plan || "") : "";
    const ex = F.extras || {}, flat = (/** @type {any} */ x) => [].concat(x || []).flat().map(String);
    const colours = flat(ex.luckyColors).filter(c => c && free.includes(c)), directions = flat(ex.directions).filter(d => d && free.includes(d));
    const g = T["goal." + goal], steps = [];
    if (offs.length) steps.push(fill(T.stepOffering, offs.map(it => pick(it.title)).join(l === "zh" ? "、" : ", ")));
    steps.push(fill(T.stepPlace, places.map(it => pick(it.place) || pick(it.title)).join(l === "zh" ? "、" : ", ")), T.stepTime);
    if (colours.length) steps.push(fill(T.stepColour, colours.join(l === "zh" ? "、" : ", ")));
    if (directions.length) steps.push(fill(T.stepDirection, directions.join(l === "zh" ? "、" : ", ")));
    steps.push(T.stepIntent.replace("{g}", g));
    const out = { goal, title: T.planLabel.replace("{g}", g), belief: T.belief, placeIds: places.map(it => it.id), colours, directions,
      steps: steps.map((t, i) => ({ n: i + 1, text: t + (l === "zh" ? "（" + T.belief + "）" : " (" + T.belief + ")") })) };
    return out.steps.every(x => safe(x.text, { straight: false }) && safe(x.text, { straight: true })) ? out : null;
  }
  /* owner decision 2026-11-15 (decision 46, option ก): "recommended sources" with links to outside sellers (we sell nothing
     ourselves), behind its own off flag LENSIQ_FORTUNE_SOURCES (and the paid switch). Entries come from W.LQ_FORTUNE_SOURCES
     (admin-managed later; none ship). Only published + approved https entries; never a weak / chong entry (never the fix for a
     warning); the note passes the hard-limit filters and makes no promise; nothing in the crisis state. */
  const sourcesEnabled = () => enabled() && W.LENSIQ_FORTUNE_SOURCES === true;
  const NO_PROMISE = /แน่นอน|รับรอง|ดวงดีขึ้น|แก้ชง|ไม่งั้น|guarantee|will (?:bring|fix|change)|or your luck|保证|一定会|不付钱|倒霉/i;
  /** @param {any} list @param {{lang?: string, crisis?: boolean, doc?: any}} [o] */
  function sources(list, o) {
    o = o || {};
    if (!sourcesEnabled() || o.crisis || !allowed(o.doc) || !Array.isArray(list)) return [];
    const l = langOf(o.lang), tx = (/** @type {any} */ x) => String((x && typeof x === "object" ? x[l] || x.th : x) || "").trim();
    return list.filter(it => it && typeof it === "object" && it.status === "published" && it.approved === true && /^https:\/\/[^\s"'<>]+$/.test(String(it.url || "")) &&
      !(it.keys || []).some((/** @type {string} */ k) => k === "weak" || k === "chong") && tx(it.name))
      .map(it => ({ id: String(it.id || ""), name: tx(it.name), url: String(it.url), note: tx(it.note) }))
      .filter(x => !NO_PROMISE.test(x.note + " " + x.name) && safe(x.note || x.name, { straight: false }) && safe(x.note || x.name, { straight: true })).slice(0, 6);
  }
  /** @param {string} t @param {string} x */
  const fill = (t, x) => t.replace("{x}", x);

  /* ---------------- DOM (only with the switch on) ---------------- */
  const CSS = ".lq-paid-offer{margin:.6em 0 1em;padding:.75em .9em;border:1px solid rgba(201,162,39,.55);border-radius:14px;background:rgba(201,162,39,.07);" +
    "max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}.lq-paid-title{margin:0 0 .3em;font-weight:600;display:flex;gap:.4em;align-items:center}" +
    ".lq-paid-price{margin:0 0 .3em;font-weight:700;font-size:1.05em}.lq-paid-lead{margin:.2em 0;font-size:.9em;opacity:.85}" +
    ".lq-paid-heads{margin:0 0 .5em;padding-left:1.2em}.lq-paid-free{margin:.2em 0 .5em;font-size:.84em;opacity:.8}" +
    "button.lq-paid-buy{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:.35em 1.1em;border-radius:999px;" +
    "font:inherit;font-weight:600;cursor:pointer;max-width:100%;white-space:normal;text-align:center}.lq-paid-panel{margin:1em 0}" +
    ".lq-paid-panel>h3{margin:.2em 0 .5em;font-size:1rem}.lq-paid-icon{width:1.2em;height:1.2em;flex:none}" +
    ".lq-paid-ladder{list-style:none;margin:.3em 0 .8em;padding:0;display:grid;gap:.3em}.lq-paid-ladder li{display:flex;justify-content:space-between;gap:.6em;" +
    "padding:.35em .6em;border-radius:10px;background:rgba(201,162,39,.08)}.lq-paid-ladder b{white-space:nowrap}.lq-paid-preview,.lq-paid-plan{margin:.8em 0;padding:.75em .9em;border-radius:14px;" +
    "border:1px solid rgba(103,79,242,.35);background:rgba(103,79,242,.05);overflow-wrap:anywhere}.lq-pv-list{list-style:none;margin:.4em 0;padding:0;display:grid;gap:.6em}" +
    ".lq-pv-line{margin:.15em 0;font-size:.92em;opacity:.85}.lq-pv-for{font-weight:600}.lq-paid-goals{display:flex;flex-wrap:wrap;gap:.4em;margin:.4em 0}" +
    ".lq-paid-goal{min-height:44px;padding:.3em .9em;border-radius:999px}.lq-paid-goal[aria-pressed=true]{outline:2px solid #674ff2}" +
    "html[data-lq-crisis] [data-lq-paid],html[data-lq-calm] [data-lq-paid]{display:none!important}";
  const LOCK = '<svg class="lq-paid-icon" data-icon="lock" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/>' +
    '<path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg>';
  /** @type {any} the last reading's nickname / headline (memory only) */
  let SUBJ = null;
  /** @type {{container: any, bodies: {body: any, nodes: any[]}[], buttons: any[], groups: any[], lang: string, monthly: any, sp?: any}[]} */
  let DONE = [];
  /** @param {any} doc */
  function ensureStyle(doc) {
    try {
      if (!doc.getElementById("lq-paid-style") && doc.head) { const s = doc.createElement("style"); s.id = "lq-paid-style"; s.textContent = CSS; doc.head.appendChild(s); }
    } catch (e) { /* no DOM */ }
  }
  /** one offer block: label, price and heading list first, the button last @param {any} doc @param {any} of @param {"th"|"en"|"zh"} l */
  function offerEl(doc, of, l) {
    const T = TEXT[l];
    /** @param {string} tag @param {string} cls @param {string} [text] */
    const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const box = el("div", "lq-paid-offer");
    box.setAttribute("data-lq-paid", ""); box.setAttribute("data-lq-upsell", ""); box.setAttribute("data-lq-offer", of.plan);
    if (of.group) box.setAttribute("data-lq-group", of.group);
    const title = el("p", "lq-paid-title"); title.innerHTML = LOCK; title.appendChild(el("span", "", of.label)); box.appendChild(title);
    box.appendChild(el("p", "lq-paid-price", of.priceText));
    box.appendChild(el("p", "lq-paid-lead", T.lead));
    const ul = el("ul", "lq-paid-heads"); for (const h of of.headings) ul.appendChild(el("li", "", h)); box.appendChild(ul);
    const b = el("button", "chip lq-paid-buy", T.buy + " · " + of.priceText);
    b.type = "button"; b.setAttribute("data-lq-buy", of.plan); b.setAttribute("aria-label", of.label + " · " + of.priceText);
    const note = el("p", "lq-paid-note"); note.setAttribute("data-lq-paid-note", ""); note.setAttribute("role", "status"); note.hidden = true;
    b.addEventListener("click", () => {
      note.textContent = T.notOnSale; note.hidden = false; // no payment is connected (owner order 2026-11-15)
      funnel("tap"); try { showPreview(doc, l); } catch (e) { /* keep the page */ }
      try { W.dispatchEvent(new W.CustomEvent("lq-paid-request", { detail: { plan: of.plan, group: of.group || null, price: of.price } })); } catch (e) { /* no events */ }
    });
    box.appendChild(b); box.appendChild(note);
    return box;
  }
  const pageLang = () => { try { return langOf(W.LQI18N && W.LQI18N.lang); } catch (e) { return "th"; } };
  /** after FortuneAI.renderSections + fortune-read.js: lock the paid parts of each group, add the offers
   *  @param {any} container @param {any} [original] @param {any} [shown] */
  function decorate(container, original, shown) {
    if (!enabled()) return; // off: never touch the page
    if (!container || !container.querySelectorAll) return;
    const doc = container.ownerDocument || W.document;
    if (!allowed(doc)) return;
    const res = shown || original;
    if (!res || res.crisis || res.source === "support" || container.closest && container.closest(".fa-support")) return;
    const l = langOf(res.lang || pageLang()), straight = res.mode === "straight";
    ensureStyle(doc);
    // this file can load before fortune-read.js (nav.js inserts it), so its hook may run first: group the reading here
    // (fortune-read's enhance is idempotent: a group already made is left as it is)
    const R = RD();
    if (R && R.enhance && container.querySelector(".fa-section:not([data-lq-grouped])")) { try { R.enhance(container, res); } catch (e) { return; } }
    // a re-render of the same container replaced its nodes: forget the old record
    DONE = DONE.filter(r => r.container !== container && r.container.isConnected !== false);
    const sp = split(res, { lang: l, straight }), used = new Set();
    const rec = { container, bodies: /** @type {any[]} */ ([]), buttons: /** @type {any[]} */ ([]), groups: /** @type {any[]} */ ([]), lang: l, monthly: res.monthly, sp };
    const groups = rec.groups;
    for (const sec of container.querySelectorAll(".fa-section[data-lq-grouped]")) {
      if (sec.closest(".fa-support")) continue;
      const id = sec.getAttribute("data-section") || "";
      const h = sec.querySelector("h3, h4"), title = h ? h.textContent.trim() : id;
      const bodies = [...sec.querySelectorAll(".lq-more-body")].filter(b => b.closest(".fa-section") === sec);
      if (id === "advice" || !bodies.length) continue;
      // the parts to lock are exactly the paid parts of split() for this group (same rules as the tests); a group the
      // result does not describe (other renderer, AI text) is left whole. Advice boxes and any other node are never removed.
      const g = sp && sp.groups.find((/** @type {any} */ x, /** @type {number} */ k) => x.id === id && !used.has(k));
      if (g) used.add(sp.groups.indexOf(g));
      const paid = g ? g.paid.slice() : [];
      let locked = 0;
      for (const body of bodies) {
        const nodes = [...body.childNodes];
        for (const n of nodes) {
          if (n.tagName !== "P") continue;
          const k = paid.indexOf(n.textContent);
          if (k < 0) continue;
          paid.splice(k, 1); n.remove(); locked++;
        }
        if (nodes.length !== body.childNodes.length) rec.bodies.push({ body, nodes });
      }
      if (!locked) continue;
      const btn = [...sec.querySelectorAll("button.lq-more")].find(b => b.closest(".fa-section") === sec);
      if (btn && bodies.every(b => !b.childNodes.length)) { btn.hidden = true; rec.buttons.push(btn); }
      groups.push({ id, title, paid: [locked] });
      sec.appendChild(offerEl(doc, offers({ lang: l, groups: [{ id, title, paid: [1] }] }, l, { doc }).find(o => o.plan === "group"), l));
    }
    if (!groups.length) { restore(rec); return; }
    DONE.push(rec);
    panelFor(doc, container, l);
    funnel("overview");
    if (!container.__lqPaidOpen) {
      container.__lqPaidOpen = true;
      container.addEventListener("click", (/** @type {any} */ e) => { if (e.target && e.target.closest && e.target.closest(".fa-section button.lq-more")) funnel("open"); });
    }
  }
  /** @param {any} doc @param {string} tag @param {string} [cls] @param {string} [text] */
  const mk = (doc, tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  /** the ladder list (49 / 99 / 199 / 149 together) @param {any} doc @param {"th"|"en"|"zh"} l */
  function ladderEl(doc, l) {
    const ul = mk(doc, "ul", "lq-paid-ladder"); ul.setAttribute("aria-label", TEXT[l].ladderTitle);
    for (const r of ladder(l)) { const li = mk(doc, "li", ""); li.appendChild(mk(doc, "span", "", r.label + " ")); li.appendChild(mk(doc, "b", "", r.priceText)); ul.appendChild(li); }
    return ul;
  }
  /** conversion b + c: the pre-payment preview for every reading on the page (headings + first two paid lines, who it is for) */
  function showPreview(/** @type {any} */ doc, /** @type {"th"|"en"|"zh"} */ l) {
    for (const e of doc.querySelectorAll(".lq-paid-preview")) e.remove();
    const live = DONE.filter(r => r.container.isConnected !== false && r.sp);
    const groups = live.flatMap(r => r.sp.groups.filter((/** @type {any} */ g) => g.paid.length));
    const pv = preview({ lang: l, groups }, l, SUBJ, { doc });
    const panel = doc.querySelector(".lq-paid-panel");
    if (!pv || !panel) return;
    const box = mk(doc, "section", "lq-paid-preview"); box.setAttribute("data-lq-paid", ""); box.setAttribute("data-lq-upsell", ""); box.setAttribute("aria-live", "polite");
    box.appendChild(mk(doc, "h3", "", pv.title));
    const mf = mk(doc, "p", "lq-pv-for", pv.madeFor); mf.setAttribute("data-lq-made-for", ""); box.appendChild(mf);
    const ul = mk(doc, "ul", "lq-pv-list");
    for (const g of pv.groups) {
      const li = mk(doc, "li", "lq-pv-group"); li.appendChild(mk(doc, "b", "lq-pv-title", g.title));
      for (const t of g.lines) li.appendChild(mk(doc, "p", "lq-pv-line", t));
      ul.appendChild(li);
    }
    box.appendChild(ul); box.appendChild(ladderEl(doc, l)); box.appendChild(mk(doc, "p", "lq-paid-free", pv.note));
    panel.parentNode.insertBefore(box, panel.nextSibling);
  }
  /** the goal-based plan block (both switches on): the goal picker first; the plan offer (price + headings) only after a goal */
  function planEl(/** @type {any} */ doc, /** @type {"th"|"en"|"zh"} */ l) {
    const T = /** @type {any} */ (TEXT[l]), blk = mk(doc, "section", "lq-paid-plan");
    blk.setAttribute("data-lq-plan", ""); blk.setAttribute("data-lq-paid", ""); blk.setAttribute("data-lq-upsell", "");
    blk.appendChild(mk(doc, "h3", "", T.planTitle)); blk.appendChild(mk(doc, "p", "lq-paid-lead", T.planLead)); blk.appendChild(mk(doc, "p", "lq-paid-free", T.planFree));
    const row = mk(doc, "div", "lq-paid-goals"); row.setAttribute("role", "group"); row.setAttribute("aria-label", T.planLead);
    for (const goal of GOALS) {
      const b = mk(doc, "button", "chip lq-paid-goal", T["goal." + goal]); b.type = "button"; b.setAttribute("data-lq-goal", goal); b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        for (const x of row.querySelectorAll("[data-lq-goal]")) x.setAttribute("aria-pressed", x === b ? "true" : "false");
        const old = blk.querySelector('[data-lq-offer="plan"]'); if (old) old.remove();
        const pt = priceText(PRICES.plan, l);
        blk.appendChild(offerEl(doc, { plan: "plan", price: PRICES.plan, priceText: pt, label: T.planLabel.replace("{g}", T["goal." + goal]), button: T.buy + " · " + pt,
          headings: [T.plan_place, T.plan_time, T.plan_steps, T.plan_offering, T.plan_colour] }, l));
      });
      row.appendChild(b);
    }
    blk.appendChild(row);
    return blk;
  }
  /** one panel per page (a page can show two readings, e.g. astro: birth chart + today): the full / year / Plus offers cover
   *  every reading on the page that has paid depth; drawn after the last section of the reading decorated last
   *  @param {any} doc @param {any} container @param {"th"|"en"|"zh"} l */
  function panelFor(doc, container, l) {
    for (const e of doc.querySelectorAll(".lq-paid-panel")) e.remove();
    const live = DONE.filter(r => r.groups.length && r.container.isConnected !== false);
    const seen = new Set(), groups = [];
    for (const r of live) for (const g of r.groups) if (!seen.has(g.title)) { seen.add(g.title); groups.push(g); }
    if (!groups.length) return;
    const monthly = live.map(r => r.monthly).find(m => Array.isArray(m) && m.length) || null;
    const all = offers({ lang: l, groups, monthly }, l, { doc }).filter(o => o.plan !== "group");
    const panel = doc.createElement("section"); panel.className = "lq-paid-panel";
    panel.setAttribute("data-lq-paid", ""); panel.setAttribute("data-lq-upsell", "");
    const h = doc.createElement("h3"); h.textContent = TEXT[l].panelTitle; panel.appendChild(h);
    const fn = doc.createElement("p"); fn.className = "lq-paid-free"; fn.textContent = TEXT[l].freeNote; panel.appendChild(fn);
    panel.appendChild(ladderEl(doc, l));
    for (const o of all) panel.appendChild(offerEl(doc, o, l));
    if (planEnabled()) panel.appendChild(planEl(doc, l));
    const src = sources(W.LQ_FORTUNE_SOURCES, { lang: l, doc });
    if (src.length) {
      const blk = mk(doc, "section", "lq-paid-sources"); blk.setAttribute("data-lq-sources", ""); blk.setAttribute("data-lq-paid", ""); blk.setAttribute("data-lq-upsell", "");
      blk.appendChild(mk(doc, "h3", "", TEXT[l].srcTitle)); blk.appendChild(mk(doc, "p", "lq-paid-free", TEXT[l].srcNote));
      const ul = mk(doc, "ul", "lq-paid-heads");
      for (const x of src) {
        const li = mk(doc, "li", ""), a = mk(doc, "a", "", x.name); a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer nofollow";
        li.appendChild(a); if (x.note) li.appendChild(mk(doc, "span", "", " · " + x.note)); ul.appendChild(li);
      }
      blk.appendChild(ul); panel.appendChild(blk);
    }
    // at the end of the reading (after the reminder, before the help line): the panel and the plan are never next to a group
    const help = [...container.children].find((/** @type {any} */ e) => e.matches && e.matches(".lq-helpline, .lq-helpline-result"));
    if (help) container.insertBefore(panel, help); else container.appendChild(panel);
  }
  /** give the locked text back (free "read more") and remove every offer of one decorated reading @param {any} rec */
  function restore(rec) {
    for (const { body, nodes } of rec.bodies) { while (body.firstChild) body.removeChild(body.firstChild); for (const n of nodes) body.appendChild(n); }
    for (const b of rec.buttons) b.hidden = false;
    try { for (const e of rec.container.querySelectorAll("[data-lq-paid]")) e.remove(); } catch (e) { /* gone */ }
  }
  /** rule b: the crisis state was set on this page — withdraw everything paid */
  function withdraw() {
    for (const rec of DONE) restore(rec);
    DONE = [];
    try { for (const e of W.document.querySelectorAll("[data-lq-paid]")) e.remove(); } catch (e) { /* no DOM */ }
  }
  const HOOK = { decorate(/** @type {any} */ c, /** @type {any} */ orig, /** @type {any} */ shown) { try { decorate(c, orig, shown); } catch (e) { /* keep the reading */ } } };
  if (W.document && enabled()) {
    try { if (W.FortuneAI && W.FortuneAI.registerHooks) W.FortuneAI.registerHooks(HOOK); else (W.LQFortuneHooks = W.LQFortuneHooks || []).push(HOOK); } catch (e) { /* none */ }
    try { W.addEventListener("lq-crisis", withdraw); } catch (e) { /* no events */ }
    // conversion c: remember (in memory only, never sent or stored) the nickname and the headline of the last reading's facts
    const wrapI = () => { const F = W.FortuneAI; if (!F || typeof F.interpret !== "function" || F.interpret.__lqPaid) return !!F;
      const orig = F.interpret, w = /** @this {any} @param {any} facts */ function (facts) {
        try { SUBJ = { nickname: facts && facts.subject && facts.subject.nickname, headline: facts && facts.headline }; } catch (e) { /* none */ }
        return orig.apply(this, arguments); }; /** @type {any} */ (w).__lqPaid = true; F.interpret = w; return true; };
    if (!wrapI()) { let n = 0; const t = setInterval(() => { if (wrapI() || ++n > 40) clearInterval(t); }, 250); }
  }

  const api = { PRICES, TEXT, GOALS, enabled, planEnabled, safe, split, offers, apply, decorate, allowed, withdraw, ladder, preview, shareCard, funnel, planFor, planItems, sourcesEnabled, sources };
  if (isNode) module.exports = api; else W.LQPaid = api;
})(typeof window !== "undefined" ? window : globalThis);
