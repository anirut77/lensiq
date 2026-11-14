/* pricing.js — pricing page (pricing.html), TH / EN / 中文.
 * Plans come from the API Worker (GET /v1/billing/plans: {free_mode, billing_enabled, pricing_enabled, vat_registered,
 * plans?: [{id, name_th, name_en, name_zh, kind: subscription|one_time, status, price_month_satang, price_year_satang,
 * price_once_satang, entitlements: {feature: {quota, period}}, perks?}], perks?: registry}) and are shown only when the
 * Worker says pricing_enabled. ?preview=1 shows every plan (draft ones too) with a "draft — not an offer" banner and tag;
 * without an API, preview falls back to the built-in DRAFT copy. Outside preview nothing is marked draft and only
 * 'active' plans are listed.
 * Buy buttons: only for plans with status 'active' while the Worker reports billing_enabled (which requires
 * FREE_MODE=false). When member sign-in is set up (lensiq-member.js present and possible), signing in is required
 * before the checkout form; otherwise (legacy guest checkout) the one-time customer_id + order_token are kept locally
 * ("lq-pending-claims") so the purchase can be linked to an account after sign-in (POST /v1/billing/claim).
 * Perks carry a status from the Worker's perk registry: 'coming_soon' perks are labelled "coming soon".
 * Prices are VAT-inclusive totals (Thai B2C); with VAT registration the 7 % share is shown under the price.
 * Pure helpers are unit-tested in Node (tests/unit/pricing.test.js). */
(function (root) {
  "use strict";
  /** @type {any} */
  var W = root;

  /* ============================ pure helpers ============================ */
  // Fallback copy for ?preview=1 without an API — same ids / prices as backend/migrations/0003 + 0006 (draft).
  var DRAFT = [
    { id: "free", kind: "subscription", status: "active", name_th: "สมาชิกฟรี", name_en: "Free member", name_zh: "免费会员", price_month_satang: 0, price_year_satang: 0,
      entitlements: { ai_reading: { quota: 3, period: "day" } },
      perks: [{ id: "full_readings", status: "active" }, { id: "history", status: "active" }, { id: "print_pdf", status: "active" }] },
    { id: "plus", kind: "subscription", status: "draft", name_th: "สมาชิกพลัส", name_en: "Member Plus", name_zh: "加强会员", price_month_satang: 14900, price_year_satang: 99000,
      entitlements: { ai_reading: { quota: 30, period: "month" } },
      // = docs/BILLING-PLAN.md 3.0: 50 saved readings (owner setting); a member discount on reports is an owner option
      perks: [{ id: "full_readings", status: "active" }, { id: "history", status: "active" }, { id: "english_readings", status: "active" }, { id: "saved_50", status: "active" }, { id: "member_discount", status: "coming_soon" }] },
    { id: "pro", kind: "subscription", status: "draft", name_th: "ครีเอเตอร์", name_en: "Creator", name_zh: "创作者", price_month_satang: 99000, price_year_satang: 990000,
      entitlements: { ai_reading: { quota: 100, period: "month" }, analytics_days: { quota: 90, period: "day" }, csv_export: { quota: null, period: "month" }, hub_nodes: { quota: 3, period: "month" } },
      // round 12: sold on what is delivered today (docs/BILLING-PLAN.md 3.1 "Positioning", docs/SUPPORT.md 0)
      perks: [{ id: "support_2d", status: "active" }] },
    { id: "business", kind: "subscription", status: "draft", name_th: "ธุรกิจ", name_en: "Business", name_zh: "商业版", price_month_satang: 390000, price_year_satang: 3900000,
      entitlements: { ai_reading: { quota: 600, period: "month" }, analytics_days: { quota: 400, period: "day" }, csv_export: { quota: null, period: "month" }, hub_nodes: { quota: 20, period: "month" } },
      perks: [{ id: "tax_invoice", status: "active" }, { id: "support_nbd", status: "active" }, { id: "onboarding", status: "active" }, { id: "pilot_credit", status: "active" }] },
    { id: "enterprise", kind: "subscription", status: "draft", name_th: "องค์กร", name_en: "Enterprise", name_zh: "企业版", price_month_satang: null, price_year_satang: null,
      entitlements: { ai_reading: { quota: null, period: "day" } }, perks: [{ id: "onprem", status: "active" }, { id: "dpa", status: "active" }] },
    { id: "report_basic", kind: "one_time", status: "draft", name_th: "รายงานดวงพื้นฐาน", name_en: "Basic reading report", name_zh: "基础运势报告", price_once_satang: 4900,
      entitlements: { report_basic: { quota: 1, period: "once" }, ai_reading: { quota: 1, period: "once" } }, perks: [{ id: "report_saved", status: "active" }, { id: "print_pdf", status: "active" }] },
    { id: "report_compat", kind: "one_time", status: "draft", name_th: "รายงานดวงคู่", name_en: "Compatibility report", name_zh: "合盘报告", price_once_satang: 9900,
      entitlements: { report_compat: { quota: 1, period: "once" }, ai_reading: { quota: 2, period: "once" } }, perks: [{ id: "report_saved", status: "active" }, { id: "print_pdf", status: "active" }] },
    { id: "report_annual", kind: "one_time", status: "draft", perks: [{ id: "report_saved", status: "active" }, { id: "pdf_report", status: "active" }], name_th: "รายงานดวงรายปี", name_en: "Annual forecast report", name_zh: "年度运势报告", price_once_satang: 19900,
      entitlements: { report_annual: { quota: 1, period: "once" }, ai_reading: { quota: 3, period: "once" } } }
  ];
  // Built-in perk labels (the Worker's registry may add its own labels; it always wins).
  var PERKS = /** @type {Record<string, string[]>} */ ({
    full_readings: ["pr.perk.full_readings", "คำทำนายฉบับเต็มทุกศาสตร์"],
    history: ["pr.perk.history", "เก็บประวัติและคำทำนายที่บันทึกไว้"],
    print_pdf: ["pr.perk.print_pdf", "พิมพ์ / บันทึกเป็น PDF"],
    english_readings: ["pr.perk.english_readings", "คำทำนายภาษาอังกฤษ"],
    annual_discount: ["pr.perk.annual_discount", "รายงานรายปีราคาพิเศษปีละครั้ง"],
    saved_200: ["pr.perk.saved_200", "บันทึกคำทำนายได้ 200 รายการ"],
    saved_50: ["pr.perk.saved_50", "บันทึกคำทำนายได้ 50 รายการ"],
    member_discount: ["pr.perk.member_discount", "ส่วนลดรายงานสำหรับสมาชิก"],
    report_saved: ["pr.perk.report_saved", "รายงานบันทึกไว้ในประวัติของบัญชี (หน้ารายงานของฉัน)"],
    tax_invoice: ["pr.perk.tax_invoice", "ใบกำกับภาษีเต็มรูป"],
    onprem: ["pr.perk.onprem", "ติดตั้งในเครือข่ายองค์กร / SLA"],
    dpa: ["pr.perk.dpa", "DPA และเอกสาร PDPA"],
    pdf_report: ["pr.perk.pdf_report", "รายงานฉบับ PDF (พิมพ์ / บันทึกเป็น PDF)"],
    support_2d: ["pr.perk.support_2d", "ช่วยเหลือทางอีเมล ตอบกลับภายใน 2 วันทำการ"],
    support_nbd: ["pr.perk.support_nbd", "ช่วยเหลือทางอีเมลและ LINE ตอบกลับวันทำการถัดไป"],
    onboarding: ["pr.perk.onboarding", "โทรแนะนำการตั้งค่า 30 นาที 1 ครั้ง"],
    pilot_credit: ["pr.perk.pilot_credit", "ค่าทดลองหน้างาน 2 สัปดาห์หักจากค่าบริการงวดแรก (ตามใบเสนอราคา)"]
  });
  /** Features every tier already has for free on the device: listed for clarity, never sold as a paid perk. */
  var INCLUDED = /** @type {Record<string, boolean>} */ ({ csv_export: true });
  var FEATURES = /** @type {Record<string, string[]>} */ ({
    ai_reading: ["pr.q.ai", "คำทำนายเรียบเรียงด้วย AI {n} ครั้ง{per}", "คำทำนายเรียบเรียงด้วย AI ไม่จำกัด (ใช้อย่างเหมาะสม)"],
    analytics_days: ["pr.q.analytics", "สถิติย้อนหลัง {n} วัน", "สถิติย้อนหลังไม่จำกัด"],
    csv_export: ["pr.q.csv", "ส่งออก CSV — ใช้ได้ฟรีในเครื่องทุกแผน", "ส่งออก CSV — ใช้ได้ฟรีในเครื่องทุกแผน"],
    hub_nodes: ["pr.q.hub", "ฮับรวมยอด {n} จุด", "ฮับรวมยอดไม่จำกัดจุด"],
    report_basic: ["pr.q.report_basic", "รายงานดวงพื้นฐาน {n} ฉบับ (3 ศาสตร์: แปดอักษร · ทักษา · เลข 7 ตัว พร้อมเจาะลึกงาน เงิน ความรัก และแผน 30 วัน)"],
    report_compat: ["pr.q.report_compat", "รายงานดวงคู่ {n} ฉบับ"],
    report_annual: ["pr.q.report_annual", "รายงานดวงรายปี {n} ฉบับ (หลายศาสตร์ รายเดือน)"]
  });
  var PER = /** @type {Record<string, string[]>} */ ({ day: ["pr.q.perDay", "/วัน"], month: ["pr.q.perMonth", "/เดือน"], year: ["pr.q.perYear", "/ปี"], once: ["pr.q.perOnce", " ต่อการซื้อ"] });

  /** Thai VAT-inclusive split (same as backend/src/billing.js splitVat). */
  function vatSplit(total, registered) {
    if (total == null || !registered) return { total: total, subtotal: total, vat: 0 };
    var vat = Math.round(total * 700 / 10700);
    return { total: total, subtotal: total - vat, vat: vat };
  }
  function isOnce(p) { return !!p && (p.kind === "one_time" || p.kind === "once" || (p.price_once_satang != null && p.price_month_satang == null && p.price_year_satang == null)); }
  /** Price in satang for the chosen period (one-time plans ignore the period); null = quotation. */
  function priceOf(p, period) {
    if (!p) return null;
    if (isOnce(p)) return p.price_once_satang == null ? null : p.price_once_satang;
    var v = period === "year" ? p.price_year_satang : p.price_month_satang;
    return v == null ? null : v;
  }
  function planName(p, lang) {
    if (!p) return "";
    return (lang === "en" && p.name_en) || (lang === "zh" && (p.name_zh || p.name_en)) || p.name_th || p.name_en || p.id;
  }
  /** Can this plan be bought right now? Only 'active' plans, only while billing is on, never free / quotation. */
  function buyable(p, info, period) {
    var price = priceOf(p, period);
    return !!(info && info.billing_enabled && p && p.status === "active" && p.purchasable !== false && p.id !== "free" && typeof price === "number" && price > 0);
  }
  /** Plans to list: from the Worker when it sent any (preview: all, else only 'active'); preview without API -> DRAFT. */
  function visiblePlans(info, preview) {
    var list = info && Array.isArray(info.plans) && info.plans.length ? info.plans : preview ? DRAFT : [];
    return list.filter(function (p) { return p && p.id && (preview || p.status === "active") && p.status !== "retired"; });
  }
  /** Perks of a plan with their status, merged with the Worker's registry (array of {id,...} or {id: {...}}).
   *  A perk is a string id or {id, status, label_th|th, label_en|en, label_zh|zh}. Unknown status -> 'active'. */
  function perksOf(p, registry) {
    var reg = /** @type {Record<string, any>} */ ({});
    if (Array.isArray(registry)) registry.forEach(function (r) { if (r && r.id) reg[r.id] = r; });
    else if (registry && typeof registry === "object") Object.keys(registry).forEach(function (k) { reg[k] = Object.assign({ id: k }, registry[k]); });
    var own = p && Array.isArray(p.perks) ? p.perks : [];
    // registry entries that name this plan (plans: [...] / plan_ids: [...]) count as perks of it too
    Object.keys(reg).forEach(function (k) {
      var r = reg[k], ids = r.plans || r.plan_ids;
      if (Array.isArray(ids) && ids.indexOf(p && p.id) >= 0 && !own.some(function (x) { return (typeof x === "string" ? x : x && x.id) === k; })) own = own.concat([k]);
    });
    return own.map(function (x) {
      var o = typeof x === "string" ? { id: x } : Object.assign({}, x || {});
      var r = o.id ? reg[o.id] || {} : {};
      var st = o.status || r.status || "active";
      return {
        id: o.id || null,
        status: st === "coming_soon" ? "coming_soon" : "active",
        th: o.label_th || o.th || r.label_th || r.th || r.name_th || "",
        en: o.label_en || o.en || r.label_en || r.en || r.name_en || "",
        zh: o.label_zh || o.zh || r.label_zh || r.zh || r.name_zh || ""
      };
    }).filter(function (x) { return x.id || x.th || x.en; });
  }
  /** Quota lines from entitlements: [{key, thai, vars, status, label}] (quota 0 = not included -> skipped; null =
   *  unlimited). status 'coming_soon' comes from the entitlement itself or the Worker's perk registry
   *  ({feature: {status, th, en, zh}}, backend constants.js PERKS); a feature only the registry knows uses its label. */
  function quotaLines(ents, registry) {
    var out = [];
    var reg = registry && typeof registry === "object" && !Array.isArray(registry) ? registry : {};
    Object.keys(ents || {}).forEach(function (f) {
      var e = ents[f] || {}, def = FEATURES[f], r = reg[f] || null;
      if (e.quota === 0) return;
      var status = (e.status || (r && r.status)) === "coming_soon" ? "coming_soon" : "active";
      if (!def) {
        if (r && (r.th || r.en)) out.push({ key: null, thai: r.th || r.en, feature: f, unlimited: e.quota == null, vars: { n: e.quota, per: null }, status: status, label: { th: r.th || "", en: r.en || "", zh: r.zh || "" } });
        return;
      }
      var per = PER[e.period] || null;
      var unl = e.quota == null;
      out.push({ key: unl ? def[0] + ".unl" : def[0], thai: unl ? def[2] || def[1] : def[1], feature: f, unlimited: unl, vars: { n: e.quota == null ? null : e.quota, per: per && f === "ai_reading" ? per : null }, status: status, label: null, included: !!INCLUDED[f] });
    });
    return out;
  }

  var pure = { DRAFT: DRAFT, PERKS: PERKS, FEATURES: FEATURES, INCLUDED: INCLUDED, vatSplit: vatSplit, isOnce: isOnce, priceOf: priceOf, planName: planName, buyable: buyable, visiblePlans: visiblePlans, perksOf: perksOf, quotaLines: quotaLines };
  if (typeof module !== "undefined" && module.exports) { module.exports = pure; return; }

  /* ============================ browser ============================ */
  var doc = root.document;
  var $ = function (/** @type {string} */ id) { return /** @type {any} */ (doc.getElementById(id)); };
  var API = W.LQApi;
  var MEM = function () { return W.LQMember; };
  /** @param {string} key @param {string} thai @param {Record<string, any>} [vars] */
  var T = function (key, thai, vars) {
    if (W.LQI18N && typeof W.LQI18N.tf === "function") return W.LQI18N.tf(key, thai, vars);
    return String(thai).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  };
  var lang = function () { return W.LQI18N ? W.LQI18N.lang : "th"; };
  var locale = function () { return ({ th: "th-TH", en: "en-GB", zh: "zh-CN" })[lang()] || "th-TH"; };
  var preview = /[?&]preview=1\b/.test(location.search);
  var period = "month";
  var info = /** @type {any} */ ({ pricing_enabled: false, billing_enabled: false, free_mode: true, vat_registered: false });
  var chosen = /** @type {any} */ (null);

  var baht = function (/** @type {number|null} */ s) {
    if (s == null) return T("pr.contact", "ติดต่อฝ่ายขาย");
    var n = (s / 100).toLocaleString(locale(), { maximumFractionDigits: s % 100 ? 2 : 0, minimumFractionDigits: s % 100 ? 2 : 0 });
    return T("pr.baht", "{n} บาท", { n: n });
  };
  /** @param {string} tag @param {Record<string, any>|null} [attrs] @param {...any} kids */
  function h(tag, attrs, ...kids) {
    var e = doc.createElement(tag), a = attrs || {};
    for (var k in a) {
      if (k === "text") e.textContent = a[k];
      else if (k === "class") e.className = a[k];
      else if (a[k] !== false && a[k] != null) e.setAttribute(k, a[k] === true ? "" : String(a[k]));
    }
    kids.forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c); });
    return e;
  }
  function perText(p) { return isOnce(p) ? T("pr.per.onceShort", "จ่ายครั้งเดียว") : period === "year" ? T("pr.per.yearShort", "/ ปี") : T("pr.per.monthShort", "/ เดือน"); }
  function quotaText(q) {
    if (!q.key) { var l = lang(), t = (l === "en" && q.label.en) || (l === "zh" && q.label.zh) || q.label.th || q.thai; return q.vars.n != null && !q.unlimited && q.vars.n > 1 ? t + " × " + q.vars.n : t; }
    return T(q.key, q.thai, { n: q.vars.n, per: q.vars.per ? T(q.vars.per[0], q.vars.per[1]) : "" });
  }

  function card(p) {
    var price = priceOf(p, period);
    var c = h("article", { class: "pr-card" + (p.id === "plus" ? " pr-feature" : ""), "data-plan": p.id });
    c.appendChild(h("h3", { text: planName(p, lang()) }));
    var pr = h("p", { class: "pr-price" }, h("span", { class: "pr-amt", text: baht(price) }));
    if (price) pr.appendChild(h("span", { class: "pr-per", text: perText(p) }));
    if (preview && p.status !== "active") pr.appendChild(h("span", { class: "pr-tag", text: T("pr.draft.tag", "ร่าง") }));
    c.appendChild(pr);
    // VAT-inclusive total, the period and (yearly) the saving
    if (price) {
      var v = vatSplit(price, info.vat_registered);
      c.appendChild(h("p", { class: "pr-vat", text: info.vat_registered ? T("pr.vat.incl", "รวม VAT 7% แล้ว (ก่อน VAT {sub} + VAT {vat})", { sub: baht(v.subtotal), vat: baht(v.vat) }) : T("pr.vat.none", "ราคาสุทธิที่ชำระ") }));
      if (!isOnce(p)) {
        var m = p.price_month_satang, y = p.price_year_satang;
        c.appendChild(h("p", { class: "pr-meta", text: period === "year" ? T("pr.meta.year", "ใช้ได้ 365 วันต่อการชำระ · ไม่ต่ออายุอัตโนมัติ") : T("pr.meta.month", "ใช้ได้ 30 วันต่อการชำระ · ไม่ต่ออายุอัตโนมัติ") }));
        if (period === "year" && m && y && y < m * 12) c.appendChild(h("p", { class: "pr-save", text: T("pr.save", "ประหยัด {p}% เทียบรายเดือน 12 เดือน", { p: Math.round((1 - y / (m * 12)) * 100) }) }));
      } else c.appendChild(h("p", { class: "pr-meta", text: T("pr.meta.once", "ซื้อครั้งเดียว ไม่มีรายจ่ายต่อเนื่อง") }));
    }
    var ul = h("ul", { class: "pr-perks" });
    quotaLines(p.entitlements, info.perks).forEach(function (q) {
      var li = h("li", { class: q.status === "coming_soon" ? "soon" : q.included ? "incl" : null, text: quotaText(q) });
      if (q.status === "coming_soon") li.appendChild(h("span", { class: "pr-soon", text: T("pr.soon", "เร็ว ๆ นี้") }));
      ul.appendChild(li);
    });
    perksOf(p, info.perks).forEach(function (k) {
      var def = k.id ? PERKS[k.id] : null;
      var label = (lang() === "en" && k.en) || (lang() === "zh" && k.zh) || (def ? T(def[0], k.th || def[1]) : k.th || k.en || k.id);
      var li = h("li", { class: k.status === "coming_soon" ? "soon" : null, text: label });
      if (k.status === "coming_soon") li.appendChild(h("span", { class: "pr-soon", text: T("pr.soon", "เร็ว ๆ นี้") }));
      ul.appendChild(li);
    });
    if (ul.childNodes.length) c.appendChild(ul);
    if (buyable(p, info, period)) {
      var b = h("button", { type: "button", class: "pr-btn", text: isOnce(p) ? T("pr.buy.once", "ซื้อรายงานนี้") : T("pr.buy", "เลือกแพ็กเกจนี้") });
      b.addEventListener("click", function () { choose(p); });
      c.appendChild(b);
    } else if (price == null && p.id !== "free") {
      c.appendChild(h("p", { class: "pr-meta", text: T("pr.quote", "ราคาตามใบเสนอราคา ติดต่อฝ่ายขาย") }));
    }
    return c;
  }

  function render() {
    var list = visiblePlans(info, preview);
    var subs = list.filter(function (p) { return !isOnce(p); }), once = list.filter(isOnce);
    var g = $("prGrid"); g.textContent = "";
    subs.forEach(function (p) { g.appendChild(card(p)); });
    var o = $("prOnce"); o.textContent = "";
    once.forEach(function (p) { o.appendChild(card(p)); });
    $("prSubsH").hidden = !subs.length; g.hidden = !subs.length;
    doc.querySelector(".pr-toggle").hidden = !subs.some(function (p) { return p.price_year_satang != null || p.price_month_satang != null; });
    $("prOnceH").hidden = $("prOnceLead").hidden = o.hidden = !once.length;
    $("prVat").textContent = info.vat_registered ? T("pr.vat.note", "ราคาทั้งหมดรวมภาษีมูลค่าเพิ่ม 7% แล้ว ออกใบเสร็จรับเงิน/ใบกำกับภาษีหลังชำระ")
      : T("pr.vat.noteNone", "ราคาทั้งหมดเป็นยอดที่ชำระจริง ผู้ขายยังไม่จดทะเบียนภาษีมูลค่าเพิ่ม จึงไม่มี VAT และออกใบเสร็จรับเงิน");
    if (chosen) summary();
  }

  /** Sign-in before checkout: whenever member sign-in is available (or the Worker requires it for checkout). */
  function needSignIn() {
    var m = MEM();
    if (m && m.signedIn()) return false;
    return !!(info.billing_enabled && (info.member_required_for_checkout || (m && (m.active() || (typeof m.possible === "function" && m.possible())))));
  }
  function summary() {
    var price = priceOf(chosen, period);
    $("prSum").textContent = T("pr.co.sum", "{plan} · {per} · ยอดชำระ {amt}", { plan: planName(chosen, lang()), per: isOnce(chosen) ? T("pr.per.onceShort", "จ่ายครั้งเดียว") : period === "year" ? T("pr.per.year", "รายปี") : T("pr.per.month", "รายเดือน"), amt: baht(price) }) +
      (info.vat_registered ? " " + T("pr.co.vat", "(รวม VAT {vat})", { vat: baht(vatSplit(price, true).vat) }) : "");
    var gate = needSignIn();
    $("prSignIn").hidden = !gate;
    $("prSignInBtn").hidden = !MEM(); // required but sign-in not set up on this site: the note alone explains it
    $("prForm").hidden = gate;
  }
  function choose(p) {
    chosen = p;
    $("prCheckout").hidden = false;
    $("prQr").textContent = "";
    summary();
    $("prCheckout").scrollIntoView({ behavior: "smooth", block: "start" });
    try { $("prCheckout").focus({ preventScroll: true }); } catch (e) { /* old browser */ }
  }

  document.querySelectorAll(".pr-toggle button").forEach(function (b) {
    b.addEventListener("click", function () {
      period = String(b.getAttribute("data-period"));
      document.querySelectorAll(".pr-toggle button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      render();
    });
  });
  $("prSignInBtn").addEventListener("click", function () { var m = MEM(); if (m) m.signIn(); });

  /** fetch keeping the error code ({ok, status, j}) */
  function call(path, body, headers) {
    return fetch(API.url(path), { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: JSON.stringify(body), credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .catch(function () { return { ok: false, status: 0, j: null }; });
  }
  /** keep a guest purchase for linking after sign-in (same list as lensiq-member.js addPendingClaim) */
  function keepClaim(r) {
    var c = { customer_id: r.customer_id, order_token: r.order_token, payment_id: r.payment_id || null, plan_id: chosen && chosen.id };
    var m = MEM();
    if (m && typeof m.addPendingClaim === "function") { m.addPendingClaim(c); return; }
    try {
      var l = JSON.parse(localStorage.getItem("lq-pending-claims") || "[]");
      l = (Array.isArray(l) ? l : []).filter(function (x) { return x && x.customer_id !== c.customer_id; });
      l.unshift(Object.assign(c, { at: Math.floor(Date.now() / 1000) }));
      localStorage.setItem("lq-pending-claims", JSON.stringify(l.slice(0, 5)));
    } catch (e) { /* storage blocked: the codes are on screen */ }
  }
  var idem = "";
  $("prForm").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target);
    var box = $("prQr");
    if (!chosen) return;
    if (needSignIn()) { summary(); box.textContent = T("pr.co.signin", "กรุณาเข้าสู่ระบบ (ฟรี) ก่อนซื้อ เพื่อผูกการชำระเงินและใบเสร็จกับบัญชีของคุณ"); MEM().signIn(); return; }
    if (!f.accept.checked) { box.textContent = T("pr.co.accept", "กรุณายอมรับข้อกำหนดและนโยบายการคืนเงินก่อน"); return; }
    if (f.age && !f.age.checked) { box.textContent = T("pr.co.age", "กรุณายืนยันว่ามีอายุ 20 ปีบริบูรณ์ขึ้นไป หรือได้รับความยินยอมจากผู้ปกครองแล้ว"); f.age.focus(); return; }
    box.textContent = T("pr.co.creating", "กำลังสร้าง QR…");
    var submit = f.querySelector("button[type=submit]"); submit.disabled = true;
    // one Idempotency-Key per attempt: a double tap / retry does not create a second payment
    if (!idem) idem = Array.from(crypto.getRandomValues(new Uint8Array(16)), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    var m = MEM();
    // Turnstile is required by the Worker for checkout (fail closed)
    Promise.resolve(API.turnstile ? API.turnstile("checkout") : "").then(function (/** @type {string} */ tok) {
      /** @type {Record<string, string>} */
      var hd = { "Idempotency-Key": idem };
      if (tok) hd["X-Turnstile-Token"] = tok;
      if (m && m.token()) hd.Authorization = "Bearer " + m.token();
      return call("/v1/billing/checkout", {
        plan_id: chosen.id, period: isOnce(chosen) ? "once" : period, accept_terms: !!f.accept.checked, age_confirm: !!(f.age && f.age.checked),
        buyer: { name: f.name.value, email: f.email.value, tax_id: f.tax_id.value, address: f.address.value, branch: f.branch.value }
      }, hd);
    }).then(function (/** @type {any} */ res) {
      submit.disabled = false;
      var r = res && res.ok ? res.j : null;
      if (!r) {
        var code = res && res.j && res.j.code;
        box.textContent = code === "member_required" ? T("pr.co.signin", "กรุณาเข้าสู่ระบบ (ฟรี) ก่อนซื้อ เพื่อผูกการชำระเงินและใบเสร็จกับบัญชีของคุณ")
          : code === "age_confirmation_required" || code === "guardian_consent_required" ? T("pr.co.age", "กรุณายืนยันว่ามีอายุ 20 ปีบริบูรณ์ขึ้นไป หรือได้รับความยินยอมจากผู้ปกครองแล้ว")
          : res && res.status === 429 ? T("pr.co.busy", "มีการสร้างรายการมากเกินไป กรุณารอสักครู่แล้วลองใหม่")
          : T("pr.co.fail", "สร้างรายการชำระเงินไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่");
        if (code === "member_required" && m) m.signIn();
        return;
      }
      idem = "";
      box.textContent = "";
      var img = h("img", { alt: T("pr.co.qrAlt", "QR พร้อมเพย์"), width: 240, height: 240 }); box.appendChild(img);
      var stl = h("p", { text: T("pr.co.scan", "สแกนด้วยแอปธนาคาร · ยอด {amt}", { amt: baht(r.amount_satang) }) }); box.appendChild(stl);
      var keep = h("p", { class: "pr-small" });
      if (r.linked_to_account) keep.appendChild(doc.createTextNode(T("pr.co.linked", "การชำระเงินนี้ผูกกับบัญชีของคุณแล้ว ดูสถานะและใบเสร็จได้ที่หน้า บัญชีของฉัน")));
      else if (r.customer_id && r.order_token) {
        keepClaim(r);
        keep.appendChild(doc.createTextNode(T("pr.co.keep", "เก็บรหัสคำสั่งซื้อนี้ไว้ (ใช้ผูกสิทธิ์กับบัญชีหลังเข้าสู่ระบบ แสดงเพียงครั้งเดียว อุปกรณ์นี้จำไว้ให้แล้ว): ")));
        keep.appendChild(h("code", { text: r.customer_id + " / " + r.order_token }));
      }
      box.appendChild(keep);
      fetch(API.url(r.qr_path), { credentials: "omit" }).then(function (x) { return x.ok ? x.blob() : null; }).then(function (b) { if (b) img.setAttribute("src", URL.createObjectURL(b)); }).catch(function () { /* QR image optional */ });
      var n = 0;
      var t = setInterval(function () {
        if (++n > 180) { clearInterval(t); stl.textContent = T("pr.co.expired", "QR หมดอายุ กรุณาสร้างใหม่"); return; }
        API.getJSON(r.status_path).then(function (/** @type {any} */ s) {
          if (!s || s.status === "pending") return;
          clearInterval(t);
          stl.textContent = s.status === "successful" ? T("pr.co.paid", "ชำระเงินสำเร็จ · เลขที่เอกสาร {no}", { no: s.receipt_no || "—" }) : T("pr.co.failed", "การชำระเงินไม่สำเร็จ ({st})", { st: s.status });
          if (s.status === "successful") {
            img.remove();
            if (m && m.signedIn()) { m.refresh(); keep.appendChild(doc.createTextNode(" ")); keep.appendChild(h("a", { href: "account.html#history", text: T("pr.co.account", "ดูใบเสร็จที่ บัญชีของฉัน") })); }
            if (chosen && /^report_/.test(chosen.id)) { keep.appendChild(doc.createTextNode(" · ")); keep.appendChild(h("a", { href: "report.html?type=" + encodeURIComponent(chosen.id), text: T("pr.co.openReport", "เปิดรายงานที่ซื้อ") })); }
          }
        });
      }, 5000);
    });
  });

  /* ---- "notify me when sales open" (pricing not open): lensiq-leads.js — API -> /v1/leads, else mailto / LINE ---- */
  (function () {
    var f = /** @type {any} */ ($("prNotify"));
    if (!f) return;
    f.addEventListener("submit", function (/** @type {Event} */ ev) {
      ev.preventDefault();
      var out = $("prNotifyMsg"); out.textContent = "";
      var email = String(f.email.value || "").trim();
      var L = W.LQLeads;
      if (!(L ? L.isEmail(email) : /@/.test(email))) { out.textContent = T("pr.off.badEmail", "กรุณากรอกอีเมลให้ถูกต้อง"); f.email.focus(); return; }
      if (!f.consent.checked) { out.textContent = T("pr.off.needConsent", "กรุณาติ๊กยินยอมก่อน"); return; }
      if (!L) { out.textContent = T("pr.off.none", "ยังไม่ได้ส่ง: ระบบรับคำขอออนไลน์และช่องทางติดต่อจะประกาศก่อนเปิดขาย"); return; }
      var lead = { name: "notify-me", email: email, interest: "notify-" + f.interest.value, source: "pricing", lang: lang(), message: "notify me when sales open" };
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      out.textContent = T("pr.off.sending", "กำลังส่ง…");
      L.submit(lead, { subject: "LENSIQ — notify me when sales open" }).then(function (/** @type {any} */ r) {
        btn.disabled = false; out.textContent = "";
        if (r.ok) { f.reset(); out.textContent = T("pr.off.sent", "บันทึกแล้ว เราจะแจ้งทางอีเมลเมื่อเปิดขาย"); return; }
        if (r.via === "api") {
          // the server form failed (review of lead-form-fix): keep the e-mail, say why, offer LINE (same wording as the home form)
          out.appendChild(doc.createTextNode(r.reason === "turnstile"
            ? T("home.err.ts", "ยังไม่ได้ส่ง: ยืนยันว่าเป็นคนไม่สำเร็จ ข้อความของคุณยังอยู่ในแบบฟอร์ม กด “ส่งอีกครั้ง” หรือติดต่อเราทาง LINE {id}", { id: r.lineId || "" })
            : T("home.err.send", "ยังไม่ได้ส่ง: ระบบหรือเครือข่ายขัดข้อง ข้อความของคุณยังอยู่ในแบบฟอร์ม กด “ส่งอีกครั้ง” หรือติดต่อเราทาง LINE {id}", { id: r.lineId || "" })));
          if (r.line) {
            out.appendChild(doc.createTextNode(" "));
            out.appendChild(h("a", { href: r.line, target: "_blank", rel: "noopener", text: T("home.ok.line", "แชตทาง LINE {id}", { id: r.lineId || "" }) }));
          }
          return;
        }
        if (r.href || r.line) {
          out.appendChild(doc.createTextNode(T("pr.off.fallback", "ยังไม่ได้ส่ง: ระบบรับคำขอออนไลน์ยังไม่เปิด ส่งต่อทางอีเมลหรือ LINE ได้ที่นี่") + " "));
          if (r.href) out.appendChild(h("a", { href: r.href, text: T("home.ok.mailto", "ส่งทางอีเมล") }));
          if (r.href && r.line) out.appendChild(doc.createTextNode(" · "));
          if (r.line) out.appendChild(h("a", { href: r.line, target: "_blank", rel: "noopener", text: T("home.ok.line", "แชตทาง LINE {id}", { id: r.lineId || "" }) }));
          return;
        }
        // round 12: nothing can send it yet — keep it in this browser only (lensiq-leads.js queue, shown in the box below)
        var kept = typeof L.queue === "function" && L.queue(lead);
        out.textContent = kept ? T("pr.off.queued", "ยังไม่ได้ส่ง: ระบบรับคำขอออนไลน์และช่องทางติดต่อจะประกาศก่อนเปิดขาย เก็บคำขอไว้ในเบราว์เซอร์นี้เท่านั้นแล้ว (ส่งได้เมื่อประกาศช่องทาง)")
          : T("pr.off.none", "ยังไม่ได้ส่ง: ระบบรับคำขอออนไลน์และช่องทางติดต่อจะประกาศก่อนเปิดขาย");
        if (kept) f.reset();
      });
    });
  })();

  // back link: return to the previous LENSIQ page when there is one
  (function () {
    var b = $("prBack");
    try { if (doc.referrer && new URL(doc.referrer).origin === location.origin && history.length > 1) b.addEventListener("click", function (/** @type {Event} */ e) { e.preventDefault(); history.back(); }); } catch (e) { /* ignore */ }
  })();

  function show() {
    $("prFree").hidden = info.free_mode === false;
    var on = !!(info.pricing_enabled && visiblePlans(info, false).length) || preview;
    $("prPlans").hidden = !on;
    $("prHidden").hidden = on;
    if ($("prOff")) $("prOff").hidden = on;
    $("prDraft").hidden = !preview;
    if (on) render();
    // renewal link from account.html / the account menu (pricing.html?plan=plus&period=year): open that plan's checkout
    var q = new URLSearchParams(location.search), want = q.get("plan") || q.get("renew");
    if (on && want && !chosen) {
      if (q.get("period") === "year") { period = "year"; doc.querySelectorAll(".pr-toggle button").forEach(function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-period") === "year")); }); render(); }
      var p = visiblePlans(info, preview).filter(function (x) { return x.id === want; })[0];
      if (p && buyable(p, info, period)) choose(p);
    }
  }
  W.addEventListener("lq-lang", function () { if (!$("prPlans").hidden) render(); });
  W.addEventListener("lq-member", function () { if (chosen) summary(); });
  if (API && API.enabled()) API.getJSON("/v1/billing/plans").then(function (/** @type {any} */ r) { if (r) info = r; show(); });
  else show();
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
