/* account.js — บัญชีของฉัน (account.html): profile, signed-in devices (+ "sign out everywhere" when the Worker offers
 * it), plan + quotas (+ one-time report credits), linking an earlier guest purchase (POST /v1/billing/claim), history
 * (ledger, saved readings, payments + receipts), data export (PDPA portability) and account deletion (erasure, typed
 * "DELETE" confirmation — the Worker expects {confirm:"DELETE"}). Talks to the API Worker through lensiq-member.js
 * (window.LQMember). Without the API / member sign-in the page only says that no account is needed.
 * Feedback appears next to the control that triggered it (and in the toast); #acMsg mirrors it for screen readers.
 * Every server string is rendered with textContent. Optional Worker fields / endpoints are feature-detected. */
(function () {
  "use strict";
  /** @type {any} */
  var W = window;
  var $ = function (/** @type {string} */ id) { return /** @type {any} */ (document.getElementById(id)); };
  /** @param {string} key @param {string} thai @param {Record<string, any>} [vars] */
  var T = function (key, thai, vars) {
    if (W.LQI18N && typeof W.LQI18N.tf === "function") return W.LQI18N.tf(key, thai, vars);
    return String(thai).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  };
  var lang = function () { return W.LQI18N ? W.LQI18N.lang : "th"; };
  var locale = function () { return ({ th: "th-TH", en: "en-GB", zh: "zh-CN" })[lang()] || "th-TH"; };
  var when = function (/** @type {number} */ t) { return t ? new Date(t * 1000).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }) : "—"; };
  var day = function (/** @type {number} */ t) { return t ? new Date(t * 1000).toLocaleDateString(locale(), { dateStyle: "medium" }) : "—"; };
  var baht = function (/** @type {number} */ s) { return s == null ? "—" : (s / 100).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + T("acct.thb", "บาท"); };
  /** @param {string} tag @param {Record<string, any>|null} [attrs] @param {...any} kids */
  function h(tag, attrs, ...kids) {
    var e = document.createElement(tag), a = attrs || {};
    for (var k in a) {
      if (k === "text") e.textContent = a[k];
      else if (k === "class") e.className = a[k];
      else if (a[k] !== false && a[k] != null) e.setAttribute(k, a[k] === true ? "" : String(a[k]));
    }
    kids.forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  /** @param {string} t @param {boolean} [bad] */
  function msg(t, bad) { var m = $("acMsg"); m.textContent = t || ""; m.classList.toggle("bad", !!bad); }
  /** Feedback beside the control (`where` = id of an .acct-inline line), mirrored in #acMsg (aria-live) and the toast.
   *  @param {string} where @param {string} t @param {boolean} [bad] */
  function say(where, t, bad) {
    var el = $(where);
    if (el) { el.textContent = t || ""; el.classList.toggle("bad", !!bad); }
    msg(t, !!bad);
    if (t && M() && typeof M().toast === "function") M().toast(t);
  }
  /** loading placeholder (skeleton rows) for a history sub-section */
  function skeleton(/** @type {string} */ id, /** @type {number} */ n) {
    var box = $(id); box.textContent = ""; box.setAttribute("aria-busy", "true");
    var w = h("div", { class: "acct-skel", "aria-hidden": "true" });
    for (var i = 0; i < n; i++) w.appendChild(h("i"));
    box.appendChild(w);
    box.appendChild(h("span", { class: "acct-sr", text: T("acct.loading", "กำลังโหลด…") }));
  }
  /** empty state: a short line + optional link @param {string} text @param {string} [href] @param {string} [label] */
  function empty(text, href, label) {
    var p = h("p", { class: "acct-empty" }, text);
    if (href) { p.appendChild(document.createTextNode(" ")); p.appendChild(h("a", { href: href, text: label })); }
    return p;
  }
  /** @param {string[]} heads @param {any[][]} rows @param {Node} [none] empty state */
  function table(heads, rows, none) {
    if (!rows.length) return none || empty(T("acct.empty", "ยังไม่มีรายการ"));
    return h("div", { class: "acct-scroll", tabindex: "0", role: "region", "aria-label": heads.join(" · ") }, h("table", { class: "acct-table" },
      h("thead", null, h("tr", null, ...heads.map(function (x) { return h("th", { scope: "col", text: x }); }))),
      // data-label: the column name, shown beside each value when a phone stacks the rows as cards (account.css)
      h("tbody", null, ...rows.map(function (r) {
        return h("tr", null, ...r.map(function (c, i) {
          return c instanceof Node ? h("td", { "data-label": heads[i] }, c) : h("td", { "data-label": heads[i], text: c == null ? "—" : String(c) });
        }));
      }))));
  }
  var DOMAIN = /** @type {Record<string, string>} */ ({ face: "โหงวเฮ้ง", palm: "ลายมือ", horoscope: "ดวงวันเดือนปีเกิด", tarot: "ไพ่ทาโรต์", siamsee: "เซียมซี", fengshui: "ฮวงจุ้ย", numbers: "เลขมงคล",
    iching: "อี้จิง", zodiac: "12 นักษัตร", astro: "ราศีตะวันตก", dream: "ทำนายฝัน", bazi: "แปดอักษร", taksa: "ทักษา", lek7: "เลข 7 ตัว 9 ฐาน", lifegraph: "กราฟชีวิต" });
  var dname = function (/** @type {string} */ d) { return d ? T("acct.dom." + d, DOMAIN[d] || d) : "—"; };
  var KIND = /** @type {Record<string, string[]>} */ ({ signup: ["acct.k.signup", "สมัครสมาชิก"], reading: ["acct.k.reading", "อ่านคำทำนาย"], ai: ["acct.k.ai", "ผู้ช่วยเขียน AI"], payment: ["acct.k.payment", "ชำระเงิน"] });
  var kname = function (/** @type {string} */ k) { var x = KIND[k]; return x ? T(x[0], x[1]) : k; };
  var TIER = /** @type {Record<string, string[]>} */ ({ member: ["acct.tier.member", "สมาชิก (ฟรี)"], free: ["acct.tier.member", "สมาชิก (ฟรี)"], plus: ["acct.tier.plus", "สมาชิกพลัส"], pro: ["acct.tier.pro", "ครีเอเตอร์ (Creator)"], business: ["acct.tier.business", "ธุรกิจ"], enterprise: ["acct.tier.enterprise", "องค์กร"],
    report_basic: ["acct.tier.report_basic", "รายงานดวงพื้นฐาน"], report_compat: ["acct.tier.report_compat", "รายงานดวงคู่"], report_annual: ["acct.tier.report_annual", "รายงานดวงรายปี"] });
  var STATUS = /** @type {Record<string, string[]>} */ ({ pending: ["acct.st.pending", "รอชำระ"], successful: ["acct.st.successful", "ชำระแล้ว"], failed: ["acct.st.failed", "ไม่สำเร็จ"], expired: ["acct.st.expired", "หมดอายุ"],
    refunded: ["acct.st.refunded", "คืนเงินแล้ว"], mismatch: ["acct.st.mismatch", "กำลังตรวจสอบ"], cancelled: ["acct.st.cancelled", "ยกเลิก"] });
  var sname = function (/** @type {string} */ k) { var x = STATUS[k]; return x ? T(x[0], x[1]) : k || "—"; };
  var PERIOD = /** @type {Record<string, string[]>} */ ({ month: ["acct.per.month", "รายเดือน"], year: ["acct.per.year", "รายปี"], once: ["acct.per.once", "ครั้งเดียว"] });
  var pname = function (/** @type {string} */ k) { var x = PERIOD[k]; return x ? T(x[0], x[1]) : k; };
  var tname = function (/** @type {string} */ k) { var x = TIER[k]; return x ? T(x[0], x[1]) : k; };

  var M = function () { return W.LQMember; };
  var hist = /** @type {any} */ ({ ledger: [], next: null });

  function show(/** @type {string} */ which) {
    ["acOffline", "acOut", "acApp"].forEach(function (id) { $(id).hidden = id !== which; });
  }

  function state() {
    var m = M();
    if (!m || !m.ready()) { show("acOffline"); return; }
    if (!m.possible() && !m.signedIn()) { show("acOffline"); return; }
    if (!m.signedIn()) { show("acOut"); return; }
    show("acApp");
    renderMe(m.me());
    renderClaims();
    loadSessions();
    loadHistory(false);
  }

  function renderMe(/** @type {any} */ me) {
    var u = me.user, dl = $("acProfile");
    dl.textContent = "";
    [[T("acct.p.email", "อีเมล"), u.email || "—"], [T("acct.p.name", "ชื่อ"), u.display_name || "—"], [T("acct.p.since", "เป็นสมาชิกตั้งแต่"), day(u.created_at)],
      [T("acct.p.last", "เข้าสู่ระบบล่าสุด"), when(u.last_login_at)], [T("acct.p.consentOn", "ยอมรับข้อกำหนดเมื่อ"), day(u.consent_at)]]
      .forEach(function (x) { dl.appendChild(h("dt", { text: x[0] })); dl.appendChild(h("dd", { text: x[1] })); });
    $("acMarketing").checked = !!u.marketing_opt_in;
    var k = $("acKpis"); k.textContent = "";
    var q = me.quotas || {}, ai = q.ai || {};
    var kpi = function (/** @type {string} */ v, /** @type {string} */ l, /** @type {number|null} */ frac) {
      var box = h("div", { class: "acct-kpi" }, h("b", { text: v }), h("span", { text: l }));
      if (frac != null) box.appendChild(h("div", { class: "acct-bar", "aria-hidden": "true" }, h("i", { style: "width:" + Math.round(Math.min(1, Math.max(0, frac)) * 100) + "%" })));
      return box;
    };
    k.appendChild(kpi(tname(me.tier), me.plan ? T("acct.plan.until", "ใช้ได้ถึง {d}", { d: day(me.plan.current_period_end) }) : T("acct.plan.free", "แพ็กเกจปัจจุบัน"), null));
    var aiQ = ai.quota == null ? T("acct.unlimited", "ไม่จำกัด") : Math.min(ai.used, ai.quota) + " / " + ai.quota;
    k.appendChild(kpi(aiQ, ai.period === "month" ? T("acct.ai.month", "ผู้ช่วยเขียน AI เดือนนี้") : T("acct.ai.day", "ผู้ช่วยเขียน AI วันนี้"), ai.quota ? ai.used / ai.quota : null));
    k.appendChild(kpi((q.saved ? q.saved.used : 0) + " / " + (q.saved ? q.saved.max : 0), T("acct.saved.kpi", "คำทำนายที่บันทึก"), q.saved && q.saved.max ? q.saved.used / q.saved.max : null));
    k.appendChild(kpi(String(q.readings_today || 0), T("acct.read.today", "อ่านคำทำนายวันนี้"), null));
    // one-time report credits (Worker field `credits`: [{feature, remaining, granted}] or {feature: n}) — optional
    var cr = me.credits;
    var crList = Array.isArray(cr) ? cr : cr && typeof cr === "object" ? Object.keys(cr).map(function (f) { return { feature: f, remaining: cr[f] && typeof cr[f] === "object" ? cr[f].remaining : cr[f] }; }) : [];
    crList.filter(function (c) { return c && c.feature && c.remaining != null; }).forEach(function (c) {
      var box = kpi(String(c.remaining), T("acct.credit." + c.feature, c.feature === "ai_reading" ? "คำทำนาย AI ที่ซื้อไว้คงเหลือ" : TIER[c.feature] ? T(TIER[c.feature][0], TIER[c.feature][1]) + " " + T("acct.credit.left", "คงเหลือ") : c.feature), null);
      // a one-time report credit is redeemed on report.html (the server takes the credit there)
      if (/^report_/.test(c.feature) && Number(c.remaining) > 0) box.appendChild(h("a", { href: "report.html?type=" + encodeURIComponent(c.feature), "data-ac-redeem": c.feature, text: T("acct.credit.redeem", "เปิดรายงาน") }));
      k.appendChild(box);
    });
    // renewal reminder (no automatic renewal — terms section 8): from 7 days before the end of the period
    var rn = typeof M().renewalDue === "function" ? M().renewalDue(typeof M().planForRenewal === "function" ? M().planForRenewal(me) : me.plan) : { due: false };
    $("acRenew").hidden = !rn.due;
    if (rn.due) {
      $("acRenewText").textContent = T("acct.renew.text", "แพ็กเกจ {plan} จะหมดรอบในอีก {n} วัน ({d}) ไม่มีการตัดเงินอัตโนมัติ หากต้องการใช้ต่อ ให้ชำระรอบใหม่ด้วย QR พร้อมเพย์ ถ้าไม่ต่อ บัญชีจะกลับเป็นสมาชิกฟรีโดยข้อมูลไม่ถูกลบ",
        { plan: tname(me.tier), n: rn.days, d: day(rn.ends) });
      var rp = me.renewal && typeof me.renewal.renew_path === "string" && /^\/pricing\.html(\?[\w=&%.-]*)?$/.test(me.renewal.renew_path) ? me.renewal.renew_path.slice(1) : "pricing.html" + (me.plan && me.plan.id ? "?plan=" + encodeURIComponent(me.plan.id) : "");
      $("acRenewCta").setAttribute("href", rp);
    }
    var cfg = M().config() || {};
    $("acPricing").hidden = !cfg.pricing_enabled && cfg.free_mode !== false;
    $("acPlanNote").textContent = cfg.free_mode !== false ? T("acct.plan.freeNote", "ขณะนี้ LENSIQ ใช้งานฟรี ไม่มีการเรียกเก็บเงิน") : T("acct.plan.paidNote", "แพ็กเกจแบบชำระเงินจะแสดงที่นี่หลังชำระผ่าน PromptPay");
  }

  function loadHistory(/** @type {boolean} */ more) {
    var q = more && hist.next ? { before: hist.next } : null;
    if (!more) { skeleton("acSaved", 2); skeleton("acLedger", 3); skeleton("acPayments", 2); }
    $("acMore").disabled = true;
    $("acRetry").hidden = true;
    M().history(q).then(function (/** @type {any} */ r) {
      $("acMore").disabled = false;
      if (!r.ok || !r.j) {
        // failure: no "load more" (it would fail the same way), a retry button instead; sections show what is known
        $("acMore").hidden = true;
        $("acRetry").hidden = false;
        if (!more) ["acSaved", "acLedger", "acPayments"].forEach(function (id) { var b = $(id); b.textContent = ""; b.removeAttribute("aria-busy"); b.appendChild(empty(T("acct.err.section", "โหลดส่วนนี้ไม่สำเร็จ"))); });
        say("acHistMsg", T("acct.err.load", "โหลดประวัติไม่สำเร็จ กรุณาลองใหม่"), true);
        return;
      }
      say("acHistMsg", "");
      var j = r.j;
      hist.ledger = more ? hist.ledger.concat(j.ledger || []) : (j.ledger || []);
      hist.next = j.next_before || null;
      $("acMore").hidden = !hist.next;
      var L = $("acLedger"); L.textContent = ""; L.removeAttribute("aria-busy");
      L.appendChild(table([T("acct.h.when", "เวลา"), T("acct.h.what", "รายการ"), T("acct.h.domain", "ศาสตร์"), T("acct.h.amount", "ยอด")],
        hist.ledger.map(function (/** @type {any} */ x) { return [when(x.ts), kname(x.kind), dname(x.domain), x.amount_satang == null ? "—" : baht(x.amount_satang)]; }),
        empty(T("acct.ledger.empty", "ยังไม่มีการใช้งาน — อ่านคำทำนายสักศาสตร์แล้วกลับมาดูที่นี่"), "fortune.html", T("acct.off.cta", "ไปที่รวมศาสตร์ดูดวง"))));
      if (!more) renderPayments(j.payments || []);
      if (!more) renderSaved(j.saved || []);
    });
  }

  function renderPayments(/** @type {any[]} */ list) {
    var P = $("acPayments"); P.textContent = ""; P.removeAttribute("aria-busy");
    P.appendChild(table([T("acct.h.date", "วันที่"), T("acct.h.plan", "แพ็กเกจ"), T("acct.h.status", "สถานะ"), T("acct.h.amount", "ยอด (รวม VAT)"), T("acct.h.receipt", "เลขที่เอกสาร"), T("acct.h.doc", "ใบเสร็จ")],
      list.map(function (/** @type {any} */ p) {
        var doc = p.receipt_no && p.id && p.status !== "pending" ? receiptBtn(p) : "—";
        return [day(p.paid_at || p.created_at), (p.plan_id ? tname(p.plan_id) : "—") + (p.period ? " · " + pname(p.period) : ""), sname(p.status), baht(p.amount_satang), p.receipt_no || "—", doc];
      }),
      empty(T("acct.pay.empty", "ยังไม่มีการชำระเงิน"))));
  }

  /** receipt button: GET /api/me/payments/:id/receipt (bearer) -> opens the document (HTML / PDF) or shows its fields */
  function receiptBtn(/** @type {any} */ p) {
    var b = /** @type {HTMLButtonElement} */ (h("button", { type: "button", class: "acct-mini", text: T("acct.receipt.open", "เปิดใบเสร็จ"), "aria-label": T("acct.receipt.open", "เปิดใบเสร็จ") + " " + p.receipt_no }));
    b.addEventListener("click", function () {
      b.disabled = true;
      M().receipt(p.id).then(function (/** @type {any} */ r) {
        b.disabled = false;
        if (r.ok && r.j) { showReceipt(r.j, p); say("acHistMsg", T("acct.receipt.opened", "เปิดใบเสร็จ {no} แล้ว", { no: p.receipt_no })); return; }
        if (r.ok && r.blob && /pdf/.test(r.type)) {
          // a PDF (no script) is safe to hand to the browser as a download
          var url = URL.createObjectURL(r.blob), a = h("a", { href: url, download: "lensiq-receipt-" + p.receipt_no + ".pdf" });
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
          return;
        }
        say("acHistMsg", r.status === 404 ? T("acct.receipt.none", "ใบเสร็จนี้ยังเปิดออนไลน์ไม่ได้ — เลขที่เอกสาร {no} ติดต่อฝ่ายช่วยเหลือเพื่อขอสำเนา", { no: p.receipt_no }) : T("acct.err.generic", "ทำรายการไม่สำเร็จ"), true);
      });
    });
    return b;
  }
  /** Receipt fields (Worker receipt.js receiptData; older shapes tolerated) rendered with textContent + print. */
  function showReceipt(/** @type {any} */ j, /** @type {any} */ p) {
    var v = $("acSavedView"); v.textContent = ""; v.hidden = false; v.removeAttribute("lang");
    var r = j.receipt || j, l = lang();
    var title = (l === "en" && r.title_en) || (l === "zh" && r.title_zh) || r.title_th || (r.doc_type === "tax_invoice_receipt" ? T("acct.receipt.taxInv", "ใบกำกับภาษี/ใบเสร็จรับเงิน") : T("acct.receipt.title", "ใบเสร็จรับเงิน"));
    v.appendChild(h("h4", { text: title + " " + (r.receipt_no || p.receipt_no) }));
    if (r.draft) v.appendChild(h("p", { class: "acct-muted", role: "note", text: T("acct.receipt.draft", "ข้อมูลผู้ขายยังไม่ครบ เอกสารนี้ใช้ตรวจสอบเท่านั้น") }));
    var who = function (/** @type {any} */ o, /** @type {string} */ name, /** @type {string} */ tax) { o = o || {}; return [o.name || r[name], o.tax_id || r[tax], o.address, o.branch].filter(Boolean).join(" · ") || "—"; };
    var item = r.item || {};
    var vat = r.vat || (r.vat_satang != null ? { subtotal_satang: r.subtotal_satang, vat_satang: r.vat_satang } : null);
    var dl = h("dl", { class: "acct-dl" });
    [[T("acct.h.date", "วันที่"), r.date || day(r.paid_at || p.paid_at)],
      [T("acct.h.plan", "แพ็กเกจ"), (l === "en" && item.name_en) || (l === "zh" && (item.name_zh || item.name_en)) || item.name_th || tname(item.plan_id || r.plan_id || p.plan_id)],
      [T("acct.receipt.seller", "ผู้ขาย"), who(r.seller, "seller_name", "seller_tax_id")], [T("acct.receipt.buyer", "ผู้ซื้อ"), who(r.buyer, "buyer_name", "buyer_tax_id")],
      [T("acct.receipt.subtotal", "ราคาก่อน VAT"), vat && vat.subtotal_satang != null ? baht(vat.subtotal_satang) : "—"], [T("acct.receipt.vat", "VAT"), vat && vat.vat_satang != null ? baht(vat.vat_satang) : "—"],
      [T("acct.h.amount", "ยอด (รวม VAT)"), baht(r.total_satang != null ? r.total_satang : r.amount_satang != null ? r.amount_satang : p.amount_satang)]]
      .concat(r.refund ? [[T("acct.st.refunded", "คืนเงินแล้ว"), baht(r.refund.refund_satang) + " · " + day(r.refund.refunded_at)]] : [])
      .forEach(function (x) { dl.appendChild(h("dt", { text: x[0] })); dl.appendChild(h("dd", { text: x[1] })); });
    v.appendChild(dl);
    var pr = h("button", { type: "button", class: "btn ghost", text: T("acct.receipt.print", "พิมพ์ / บันทึกเป็น PDF") });
    pr.addEventListener("click", function () { window.print(); });
    v.appendChild(h("p", { class: "acct-row" }, pr));
    v.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ---------------- signed-in devices ---------------- */
  function loadSessions() {
    var here = $("acSessHere");
    here.textContent = M().remembered && M().remembered() ? T("acct.sess.remembered", "อุปกรณ์นี้: จดจำการเข้าสู่ระบบไว้ (ออกจากระบบเพื่อเลิกจดจำ)")
      : T("acct.sess.tab", "อุปกรณ์นี้: เข้าสู่ระบบเฉพาะแท็บนี้ ปิดแท็บแล้วจะออกจากระบบ");
    var box = $("acSessions"); box.textContent = "";
    if (typeof M().sessions !== "function") return;
    skeleton("acSessions", 1);
    M().sessions().then(function (/** @type {any} */ r) {
      box.textContent = ""; box.removeAttribute("aria-busy");
      var list = r.ok && r.j && Array.isArray(r.j.sessions) ? r.j.sessions : null;
      $("acSignOutAll").hidden = !list || list.length < 2;
      if (!list) return; // the Worker does not list sessions (yet): this device's line above is all we know
      box.appendChild(table([T("acct.sess.dev", "อุปกรณ์"), T("acct.sess.since", "เข้าสู่ระบบเมื่อ"), T("acct.sess.seen", "ใช้งานล่าสุด"), T("acct.sess.exp", "หมดอายุ")],
        list.map(function (/** @type {any} */ x) { return [(x.current ? T("acct.sess.this", "อุปกรณ์นี้") : T("acct.sess.other", "อุปกรณ์อื่น")) + (x.device ? " · " + x.device : ""), when(x.created_at), when(x.last_seen), day(x.expires_at)]; })));
    });
  }

  function renderSaved(/** @type {any[]} */ list) {
    var S = $("acSaved"); S.textContent = ""; S.removeAttribute("aria-busy");
    if (!list.length) { S.appendChild(empty(T("acct.saved.empty", "ยังไม่มีคำทำนายที่บันทึกไว้ — กด \"บันทึกไว้ในประวัติของฉัน\" ใต้คำทำนาย"))); return; }
    var ul = h("ul", { class: "acct-saved" });
    list.forEach(function (/** @type {any} */ s) {
      var view = h("button", { type: "button", text: T("acct.saved.view", "เปิดอ่าน") });
      var del = /** @type {HTMLButtonElement} */ (h("button", { type: "button", text: T("acct.saved.del", "ลบ"), "aria-label": T("acct.saved.del", "ลบ") + " " + (s.title || dname(s.domain)) }));
      view.addEventListener("click", function () { openSaved(s.id); });
      del.addEventListener("click", function () {
        if (!confirm(T("acct.saved.delq", "ลบคำทำนายที่บันทึกนี้?"))) return;
        del.disabled = true;
        M().deleteSaved(s.id).then(function (/** @type {any} */ r) {
          del.disabled = false;
          say("acHistMsg", r.ok ? T("acct.saved.deleted", "ลบแล้ว") : T("acct.err.generic", "ทำรายการไม่สำเร็จ"), !r.ok);
          if (r.ok) { loadHistory(false); M().refresh(); }
        });
      });
      ul.appendChild(h("li", null, h("span", { class: "t" }, (s.title || dname(s.domain)) + " ", h("small", { text: dname(s.domain) + " · " + when(s.created_at) })), view, del));
    });
    S.appendChild(ul);
  }

  function openSaved(/** @type {string} */ id) {
    M().getSaved(id).then(function (/** @type {any} */ r) {
      var v = $("acSavedView"); v.textContent = ""; v.hidden = false;
      if (!r.ok || !r.j) { v.appendChild(h("p", { text: T("acct.err.generic", "ทำรายการไม่สำเร็จ") })); return; }
      var d = r.j.data || {};
      if (d.lang === "zh") v.setAttribute("lang", "zh-Hans"); else if (d.lang === "th" || !d.lang) v.setAttribute("lang", "th"); else v.removeAttribute("lang");
      if (d.summary) { v.appendChild(h("h4", { text: d.summary.title || "" })); (d.summary.lines || []).forEach(function (/** @type {any} */ l) { v.appendChild(h("p", null, h("b", { text: l.k + " " }), l.t)); }); }
      if (d.plan) { v.appendChild(h("h4", { text: d.plan.title || "" })); (d.plan.items || []).forEach(function (/** @type {any} */ x) { v.appendChild(h("p", null, h("b", { text: x.for + " " }), x.t)); }); }
      (d.sections || []).forEach(function (/** @type {any} */ s) { v.appendChild(h("h4", { text: s.title || "" })); (s.paragraphs || []).forEach(function (/** @type {string} */ p) { v.appendChild(h("p", { text: p })); }); });
      if (d.reminder) v.appendChild(h("p", { class: "acct-muted", role: "note", text: d.reminder }));
      v.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  /* ---------------- earlier guest purchases (customer_id + order_token kept by pricing.js) ---------------- */
  function renderClaims() {
    var ul = $("acClaims"); ul.textContent = "";
    var list = M().pendingClaims ? M().pendingClaims() : [];
    if (!list.length) { ul.appendChild(h("li", { class: "acct-empty", text: T("acct.claim.none", "ไม่มีการซื้อที่รอผูกบนอุปกรณ์นี้") })); return; }
    list.forEach(function (/** @type {any} */ c) {
      var b = h("button", { type: "button", class: "btn ghost", text: T("acct.claim.cta", "ผูกกับบัญชีนี้") });
      b.addEventListener("click", function () { doClaim(c, b); });
      ul.appendChild(h("li", null, h("span", { class: "t", text: (c.plan_id ? tname(c.plan_id) + " · " : "") + T("acct.claim.order", "คำสั่งซื้อ {id}", { id: c.customer_id }) + (c.at ? " · " + day(c.at) : "") }), b));
    });
  }
  function doClaim(/** @type {any} */ c, /** @type {any} */ btn) {
    if (btn) btn.disabled = true;
    say("acClaimMsg", T("acct.claim.busy", "กำลังผูกการซื้อ…"));
    M().claim(c).then(function (/** @type {any} */ r) {
      if (btn) btn.disabled = false;
      var code = r.j && r.j.code;
      say("acClaimMsg", r.ok ? T("acct.claim.ok", "ผูกการซื้อกับบัญชีแล้ว สิทธิ์จะแสดงใน แพ็กเกจและโควตา")
        : code === "already_claimed" ? T("acct.claim.already", "การซื้อนี้ผูกกับบัญชีแล้ว")
        : code === "claim_taken" ? T("acct.claim.taken", "การซื้อนี้ผูกกับบัญชีอื่นแล้ว")
        : r.status === 404 && !code ? T("acct.claim.unavailable", "ระบบผูกการซื้อยังไม่เปิด เก็บรหัสไว้แล้วลองใหม่ภายหลัง")
        : r.outcome === "drop" ? T("acct.claim.bad", "รหัสคำสั่งซื้อหรือรหัสยืนยันไม่ถูกต้อง")
        : T("acct.err.generic", "ทำรายการไม่สำเร็จ"), !r.ok);
      renderClaims();
      if (r.ok) M().refresh();
    });
  }
  $("acClaimForm").addEventListener("submit", function (/** @type {Event} */ e) {
    e.preventDefault();
    var f = /** @type {any} */ (e.target);
    var c = { customer_id: String(f.customer_id.value || "").trim(), order_token: String(f.order_token.value || "").trim() };
    if (!c.customer_id || !c.order_token) { say("acClaimMsg", T("acct.claim.bad", "รหัสคำสั่งซื้อหรือรหัสยืนยันไม่ถูกต้อง"), true); return; }
    doClaim(c, f.querySelector("button[type=submit]"));
  });

  $("acSignIn").addEventListener("click", function () { if (M()) M().signIn(); });
  $("acSignOut").addEventListener("click", function () { M().signOut().then(function () { msg(T("acct.signedout", "ออกจากระบบแล้ว")); }); });
  $("acSignOutAll").addEventListener("click", function () {
    var b = $("acSignOutAll"); b.disabled = true;
    M().signOutEverywhere().then(function (/** @type {any} */ r) {
      b.disabled = false;
      say("acSessMsg", r.ok ? T("acct.sess.allDone", "ออกจากระบบบนอุปกรณ์อื่นทั้งหมดแล้ว") : T("acct.err.generic", "ทำรายการไม่สำเร็จ"), !r.ok);
      if (r.ok) loadSessions();
    });
  });
  $("acMore").addEventListener("click", function () { loadHistory(true); });
  $("acRetry").addEventListener("click", function () { loadHistory(false); });
  $("acMarketing").addEventListener("change", function (/** @type {Event} */ e) {
    var box = /** @type {HTMLInputElement} */ (e.target), on = box.checked;
    box.disabled = true;
    M().setMarketing(on).then(function (/** @type {any} */ r) {
      box.disabled = false;
      if (!r.ok) box.checked = !on;
      say("acMarketingMsg", r.ok ? T("acct.saved.pref", "บันทึกการตั้งค่าแล้ว") : T("acct.err.generic", "ทำรายการไม่สำเร็จ"), !r.ok);
    });
  });
  $("acExport").addEventListener("click", function () {
    var b = $("acExport"); b.disabled = true;
    say("acExportMsg", T("acct.loading", "กำลังโหลด…"));
    M().exportData().then(function (/** @type {any} */ r) {
      b.disabled = false;
      if (r && r.cancelled) { say("acExportMsg", T("acct.re.cancel", "ยกเลิกการยืนยันตัวตน ยังไม่ได้ทำรายการ"), true); return; }
      if (!r.ok || !r.j) { say("acExportMsg", T("acct.err.generic", "ทำรายการไม่สำเร็จ"), true); return; }
      var url = URL.createObjectURL(new Blob([JSON.stringify(r.j, null, 2)], { type: "application/json" }));
      var a = h("a", { href: url, download: "lensiq-my-data.json" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      say("acExportMsg", T("acct.data.done", "ดาวน์โหลดข้อมูลแล้ว"));
    });
  });
  // deletion: checkbox + the word DELETE typed (the Worker itself requires {confirm:"DELETE"})
  var delReady = function () { return $("acDelOk").checked && String($("acDelWord").value).trim() === "DELETE"; };
  var syncDel = function () { $("acDelete").disabled = !delReady(); };
  $("acDelOk").addEventListener("change", syncDel);
  $("acDelWord").addEventListener("input", syncDel);
  $("acDelete").addEventListener("click", function () {
    if (!delReady()) { say("acDelMsg", T("acct.del.need", "ติ๊กยืนยันและพิมพ์คำว่า DELETE ก่อน"), true); return; }
    $("acDelete").disabled = true;
    say("acDelMsg", T("acct.del.busy", "กำลังลบบัญชี…"));
    M().deleteAccount().then(function (/** @type {any} */ r) {
      if (r.ok) { say("acDelMsg", ""); msg(T("acct.del.done", "ลบบัญชีแล้ว ขอบคุณที่ใช้ LENSIQ")); if (M().toast) M().toast(T("acct.del.done", "ลบบัญชีแล้ว ขอบคุณที่ใช้ LENSIQ")); show("acOffline"); state(); }
      else if (r && r.cancelled) { syncDel(); say("acDelMsg", T("acct.re.cancel", "ยกเลิกการยืนยันตัวตน ยังไม่ได้ทำรายการ"), true); }
      else { syncDel(); say("acDelMsg", T("acct.err.generic", "ทำรายการไม่สำเร็จ"), true); }
    });
  });

  window.addEventListener("lq-member", state);
  window.addEventListener("lq-lang", function () { if (M() && M().signedIn()) state(); });
  // lensiq-member.js is injected by lensiq-config.js (API configured); without it the offline notice stays
  if (M() && M().ready()) state();
})();
