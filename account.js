/* account.js — บัญชีของฉัน (account.html): profile, plan + quotas, history (ledger, saved readings, payments),
 * data export (PDPA portability) and account deletion (erasure). Talks to the API Worker through lensiq-member.js
 * (window.LQMember). Without the API / member sign-in the page only says that no account is needed.
 * Every server string is rendered with textContent. */
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
  function msg(/** @type {string} */ t, /** @type {boolean} */ bad) { var m = $("acMsg"); m.textContent = t || ""; m.classList.toggle("bad", !!bad); }
  /** @param {string[]} heads @param {any[][]} rows */
  function table(heads, rows) {
    if (!rows.length) return h("p", { class: "acct-muted", text: T("acct.empty", "ยังไม่มีรายการ") });
    return h("div", { class: "acct-scroll" }, h("table", { class: "acct-table" },
      h("thead", null, h("tr", null, ...heads.map(function (x) { return h("th", { scope: "col", text: x }); }))),
      h("tbody", null, ...rows.map(function (r) { return h("tr", null, ...r.map(function (c) { return h("td", { text: c == null ? "—" : String(c) }); })); }))));
  }
  var DOMAIN = /** @type {Record<string, string>} */ ({ face: "โหงวเฮ้ง", palm: "ลายมือ", horoscope: "ดวงวันเดือนปีเกิด", tarot: "ไพ่ทาโรต์", siamsee: "เซียมซี", fengshui: "ฮวงจุ้ย", numbers: "เลขมงคล",
    iching: "อี้จิง", zodiac: "12 นักษัตร", astro: "ราศีตะวันตก", dream: "ทำนายฝัน", bazi: "แปดอักษร", taksa: "ทักษา", lek7: "เลข 7 ตัว 9 ฐาน", lifegraph: "กราฟชีวิต" });
  var dname = function (/** @type {string} */ d) { return d ? T("acct.dom." + d, DOMAIN[d] || d) : "—"; };
  var KIND = /** @type {Record<string, string[]>} */ ({ signup: ["acct.k.signup", "สมัครสมาชิก"], reading: ["acct.k.reading", "อ่านคำทำนาย"], ai: ["acct.k.ai", "ผู้ช่วยเขียน AI"], payment: ["acct.k.payment", "ชำระเงิน"] });
  var kname = function (/** @type {string} */ k) { var x = KIND[k]; return x ? T(x[0], x[1]) : k; };
  var TIER = /** @type {Record<string, string[]>} */ ({ member: ["acct.tier.member", "สมาชิก (ฟรี)"], pro: ["acct.tier.pro", "โปร"], business: ["acct.tier.business", "ธุรกิจ"], enterprise: ["acct.tier.enterprise", "องค์กร"] });
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
    loadHistory(false);
  }

  function renderMe(/** @type {any} */ me) {
    var u = me.user, dl = $("acProfile");
    dl.textContent = "";
    [[T("acct.p.email", "อีเมล"), u.email], [T("acct.p.name", "ชื่อ"), u.display_name || "—"], [T("acct.p.since", "เป็นสมาชิกตั้งแต่"), day(u.created_at)],
      [T("acct.p.last", "เข้าสู่ระบบล่าสุด"), when(u.last_login_at)], [T("acct.p.consent", "ยอมรับข้อกำหนด"), u.consent_version + " · " + day(u.consent_at)]]
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
    var cfg = M().config() || {};
    $("acPlanNote").textContent = cfg.free_mode !== false ? T("acct.plan.freeNote", "ขณะนี้ LENSIQ ใช้งานฟรี ไม่มีการเรียกเก็บเงิน") : T("acct.plan.paidNote", "แพ็กเกจแบบชำระเงินจะแสดงที่นี่หลังชำระผ่าน PromptPay");
  }

  function loadHistory(/** @type {boolean} */ more) {
    var q = more && hist.next ? { before: hist.next } : null;
    M().history(q).then(function (/** @type {any} */ r) {
      if (!r.ok || !r.j) { msg(T("acct.err.load", "โหลดประวัติไม่สำเร็จ กรุณาลองใหม่"), true); return; }
      hist.ledger = more ? hist.ledger.concat(r.j.ledger) : r.j.ledger;
      hist.next = r.j.next_before;
      $("acMore").hidden = !hist.next;
      var L = $("acLedger"); L.textContent = "";
      L.appendChild(table([T("acct.h.when", "เวลา"), T("acct.h.what", "รายการ"), T("acct.h.domain", "ศาสตร์"), T("acct.h.amount", "ยอด")],
        hist.ledger.map(function (/** @type {any} */ x) { return [when(x.ts), kname(x.kind), dname(x.domain), x.amount_satang == null ? "—" : baht(x.amount_satang)]; })));
      var P = $("acPayments"); P.textContent = "";
      P.appendChild(table([T("acct.h.date", "วันที่"), T("acct.h.plan", "แพ็กเกจ"), T("acct.h.status", "สถานะ"), T("acct.h.amount", "ยอด"), T("acct.h.receipt", "เลขที่เอกสาร")],
        r.j.payments.map(function (/** @type {any} */ p) { return [day(p.created_at), (p.plan_id ? tname(p.plan_id) : "—") + (p.period ? " · " + p.period : ""), p.status, baht(p.amount_satang), p.receipt_no || "—"]; })));
      renderSaved(r.j.saved);
    });
  }

  function renderSaved(/** @type {any[]} */ list) {
    var S = $("acSaved"); S.textContent = "";
    if (!list.length) { S.appendChild(h("p", { class: "acct-muted", text: T("acct.saved.empty", "ยังไม่มีคำทำนายที่บันทึกไว้ — กด \"บันทึกไว้ในประวัติของฉัน\" ใต้คำทำนาย") })); return; }
    var ul = h("ul", { class: "acct-saved" });
    list.forEach(function (/** @type {any} */ s) {
      var view = h("button", { type: "button", text: T("acct.saved.view", "เปิดอ่าน") });
      var del = h("button", { type: "button", text: T("acct.saved.del", "ลบ") });
      view.addEventListener("click", function () { openSaved(s.id); });
      del.addEventListener("click", function () {
        if (!confirm(T("acct.saved.delq", "ลบคำทำนายที่บันทึกนี้?"))) return;
        M().deleteSaved(s.id).then(function (/** @type {any} */ r) { msg(r.ok ? T("acct.saved.deleted", "ลบแล้ว") : T("acct.err.generic", "ทำรายการไม่สำเร็จ"), !r.ok); loadHistory(false); M().refresh(); });
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

  $("acSignIn").addEventListener("click", function () { if (M()) M().signIn(); });
  $("acSignOut").addEventListener("click", function () { M().signOut().then(function () { msg(T("acct.signedout", "ออกจากระบบแล้ว")); }); });
  $("acMore").addEventListener("click", function () { loadHistory(true); });
  $("acMarketing").addEventListener("change", function (/** @type {Event} */ e) {
    var on = /** @type {HTMLInputElement} */ (e.target).checked;
    M().setMarketing(on).then(function (/** @type {any} */ r) { msg(r.ok ? T("acct.saved.pref", "บันทึกการตั้งค่าแล้ว") : T("acct.err.generic", "ทำรายการไม่สำเร็จ"), !r.ok); });
  });
  $("acExport").addEventListener("click", function () {
    M().exportData().then(function (/** @type {any} */ r) {
      if (!r.ok || !r.j) { msg(T("acct.err.generic", "ทำรายการไม่สำเร็จ"), true); return; }
      var url = URL.createObjectURL(new Blob([JSON.stringify(r.j, null, 2)], { type: "application/json" }));
      var a = h("a", { href: url, download: "lensiq-my-data.json" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      msg(T("acct.data.done", "ดาวน์โหลดข้อมูลแล้ว"));
    });
  });
  $("acDelOk").addEventListener("change", function (/** @type {Event} */ e) { $("acDelete").disabled = !/** @type {HTMLInputElement} */ (e.target).checked; });
  $("acDelete").addEventListener("click", function () {
    if (!$("acDelOk").checked || !confirm(T("acct.del.q", "ยืนยันการลบบัญชีและข้อมูลทั้งหมด? ย้อนกลับไม่ได้"))) return;
    M().deleteAccount().then(function (/** @type {any} */ r) {
      if (r.ok) { msg(T("acct.del.done", "ลบบัญชีแล้ว ขอบคุณที่ใช้ LENSIQ")); show("acOffline"); state(); }
      else msg(T("acct.err.generic", "ทำรายการไม่สำเร็จ"), true);
    });
  });

  window.addEventListener("lq-member", state);
  window.addEventListener("lq-lang", function () { if (M() && M().signedIn()) state(); });
  // lensiq-member.js is injected by lensiq-config.js (API configured); without it the offline notice stays
  if (M() && M().ready()) state();
})();
