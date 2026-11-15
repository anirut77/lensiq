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
  const PRICES = { group: 49, full: 99, year: 199, plus: 149 };
  const TEXT = {
    th: {
      groupLabel: "อ่านเชิงลึกหมวด {g}", fullLabel: "คำทำนายฉบับเต็ม ทุกหมวด", yearLabel: "ฉบับเต็ม พร้อมรายเดือนทั้งปี", plusLabel: "Plus: อ่านเชิงลึกทุกหน้าดูดวง",
      panelTitle: "อ่านเชิงลึกเพิ่มเติม", lead: "สิ่งที่จะได้อ่าน", currency: "บาท", perMonth: "ต่อเดือน", buy: "เลือก",
      freeNote: "ภาพรวม ข้อควรระวัง และคำแนะนำตามความเชื่อทุกข้ออ่านได้ฟรีเสมอ ส่วนเชิงลึกเป็นรายละเอียดเพิ่ม ไม่ใช่ทางแก้",
      notOnSale: "ยังไม่เปิดขาย ระบบสั่งซื้อยังไม่เชื่อมต่อ และไม่มีการเก็บเงิน", monthly: "รายเดือน 12 เดือน", plusAll: "อ่านเชิงลึกทุกหมวด บนหน้าดูดวงทุกหน้า",
    },
    en: {
      groupLabel: "In-depth reading: {g}", fullLabel: "Full reading, every group", yearLabel: "Full reading with the year month by month",
      plusLabel: "Plus: in-depth text on every fortune page", panelTitle: "Read in more depth", lead: "You will get", currency: "THB", perMonth: "per month",
      buy: "Choose", freeNote: "The overview, every caution and every piece of belief guidance are always free. The in-depth text adds detail; it is not a remedy.",
      notOnSale: "Not on sale yet. Ordering is not connected and nothing is charged.", monthly: "Month by month, 12 months",
      plusAll: "In-depth text for every group on every fortune page",
    },
    zh: {
      groupLabel: "深入解读：{g}", fullLabel: "完整解读（全部类别）", yearLabel: "完整解读＋全年逐月", plusLabel: "Plus：所有占卜页面的深入解读", panelTitle: "深入阅读",
      lead: "您将获得", currency: "泰铢", perMonth: "每月", buy: "选择", freeNote: "总览、每一条注意事项和每一条依传统说法的建议始终免费。深入内容只是更多细节，不是化解方法。",
      notOnSale: "尚未开售。下单功能未接通，不会收取任何费用。", monthly: "逐月解读（12 个月）", plusAll: "所有占卜页面全部类别的深入解读",
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
    if (isCaution(t, ctx.lang) || ctx.plan.some((/** @type {string} */ q) => q && t.includes(q))) return "free";
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
      for (const p of parts) {
        const where = p.visible || s.id === "advice" ? "free" : classify(p.text, ctx);
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
    const offer = (plan, label, headings, extra) => Object.assign({ plan, price: /** @type {any} */ (PRICES)[plan], priceText: priceText(/** @type {any} */ (PRICES)[plan], l, plan === "plus"),
      label, headings }, extra || {});
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

  /* ---------------- DOM (only with the switch on) ---------------- */
  const CSS = ".lq-paid-offer{margin:.6em 0 1em;padding:.75em .9em;border:1px solid rgba(201,162,39,.55);border-radius:14px;background:rgba(201,162,39,.07);" +
    "max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}.lq-paid-title{margin:0 0 .3em;font-weight:600;display:flex;gap:.4em;align-items:center}" +
    ".lq-paid-price{margin:0 0 .3em;font-weight:700;font-size:1.05em}.lq-paid-lead{margin:.2em 0;font-size:.9em;opacity:.85}" +
    ".lq-paid-heads{margin:0 0 .5em;padding-left:1.2em}.lq-paid-free{margin:.2em 0 .5em;font-size:.84em;opacity:.8}" +
    "button.lq-paid-buy{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:.35em 1.1em;border-radius:999px;" +
    "font:inherit;font-weight:600;cursor:pointer;max-width:100%;white-space:normal;text-align:center}.lq-paid-panel{margin:1em 0}" +
    ".lq-paid-panel>h3{margin:.2em 0 .5em;font-size:1rem}.lq-paid-icon{width:1.2em;height:1.2em;flex:none}" +
    "html[data-lq-crisis] [data-lq-paid],html[data-lq-calm] [data-lq-paid]{display:none!important}";
  const LOCK = '<svg class="lq-paid-icon" data-icon="lock" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/>' +
    '<path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg>';
  /** @type {{container: any, bodies: {body: any, nodes: any[]}[], buttons: any[], groups: any[], lang: string, monthly: any}[]} */
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
    const l = langOf(res.lang || pageLang()), straight = res.mode === "straight", plan = planFrags(res, l);
    ensureStyle(doc);
    // this file can load before fortune-read.js (nav.js inserts it), so its hook may run first: group the reading here
    // (fortune-read's enhance is idempotent: a group already made is left as it is)
    const R = RD();
    if (R && R.enhance && container.querySelector(".fa-section:not([data-lq-grouped])")) { try { R.enhance(container, res); } catch (e) { return; } }
    // a re-render of the same container replaced its nodes: forget the old record
    DONE = DONE.filter(r => r.container !== container && r.container.isConnected !== false);
    const rec = { container, bodies: /** @type {any[]} */ ([]), buttons: /** @type {any[]} */ ([]), groups: /** @type {any[]} */ ([]), lang: l, monthly: res.monthly };
    const groups = rec.groups;
    for (const sec of container.querySelectorAll(".fa-section[data-lq-grouped]")) {
      if (sec.closest(".fa-support")) continue;
      const id = sec.getAttribute("data-section") || "";
      const h = sec.querySelector("h3, h4"), title = h ? h.textContent.trim() : id;
      const bodies = [...sec.querySelectorAll(".lq-more-body")].filter(b => b.closest(".fa-section") === sec);
      if (id === "advice" || !bodies.length) continue;
      const texts = [...sec.querySelectorAll("p")].filter(p => !p.closest("[data-lq-paid]")).map(p => p.textContent);
      const ctx = { lang: l, straight, plan, sectionCaution: !!sec.querySelector(".lq-caution") || texts.some(t => isCaution(t, l)) };
      let locked = 0;
      for (const body of bodies) {
        const nodes = [...body.childNodes];
        let keep = true; // an advice box follows its paragraph
        for (const n of nodes) {
          if (n.tagName === "P") keep = classify(n.textContent, ctx) === "free";
          if (!keep) { n.remove(); if (n.tagName === "P") locked++; }
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
    for (const o of all) panel.appendChild(offerEl(doc, o, l));
    const secs = [...container.querySelectorAll(".fa-section[data-lq-grouped]")], last = secs[secs.length - 1];
    if (last && last.parentNode) last.parentNode.insertBefore(panel, last.nextSibling); else container.appendChild(panel);
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
  }

  const api = { PRICES, TEXT, enabled, safe, split, offers, apply, decorate, allowed, withdraw };
  if (isNode) module.exports = api; else W.LQPaid = api;
})(typeof window !== "undefined" ? window : globalThis);
