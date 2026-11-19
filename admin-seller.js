/* admin-seller.js — back-office "ข้อมูลกิจการ" tab (owner order 2026-11-18): the seller's business details and the
 * quotation / invoice / receipt documents generated from them (backend/src/seller.js). Owner only (the Worker refuses
 * everyone else, read included). Fetched by admin-orgs.js the first time the tab is opened (not on page load: admin.html
 * speed budget); admin.js exposes window.LQAdminKit: call() asks for the password and the 6-digit code when the Worker
 * answers reauth_required / reauth_inline_required.
 * Privacy: tax ID, bank account number and phone come back masked (last 4) and are never put back into the form; the
 * owner's entries are kept in memory only (no browser storage) and sent only to the admin API. TH default; EN / ZH in
 * i18n/en-admin.js, i18n/zh-admin.js (ads.*). Documents: print-ready A4 HTML from the Worker, shown in a sandboxed frame
 * with no script; "Print / Save as PDF" uses the browser's own print dialog. */
(function () {
  "use strict";
  var K = /** @type {any} */ (window).LQAdminKit;
  if (!K) return;
  var call = K.call, h = K.h, G = K.G, gLang = K.gLang, msg = K.msg, fail = K.fail, baht = K.baht, loaders = K.loaders, $ = K.$;
  var kit = /** @type {any} */ (window).__LQAdmin || {};
  var ads = /** @type {any} */ ({ view: null, prices: [], docs: [] });
  var MASKED = { tax_id: "tax_id_masked", bank_account_no: "bank_account_no_masked", contact_phone: "contact_phone_masked" };
  var PLAIN = ["legal_name", "branch", "address", "bank_name", "bank_account_name", "contact_email", "contact_line", "doc_prefix"];
  var LABEL = /** @type {Record<string, string[]>} */ ({
    legal_name: ["ads.m.legal_name", "ชื่อกิจการ"], tax_id: ["ads.m.tax_id", "เลขประจำตัวผู้เสียภาษี"], address: ["ads.m.address", "ที่อยู่"],
    vat_status: ["ads.m.vat_status", "สถานะภาษีมูลค่าเพิ่ม"], bank_name: ["ads.m.bank_name", "ธนาคาร"], bank_account_name: ["ads.m.bank_account_name", "ชื่อบัญชี"],
    bank_account_no: ["ads.m.bank_account_no", "เลขที่บัญชี"], contact: ["ads.m.contact", "ช่องทางติดต่ออย่างน้อยหนึ่งช่องทาง"], doc_prefix: ["ads.m.doc_prefix", "อักษรนำหน้าเลขที่เอกสาร"]
  });
  var TYPE = /** @type {Record<string, string[]>} */ ({ quotation: ["ads.t.quotation", "ใบเสนอราคา"], invoice: ["ads.t.invoice", "ใบแจ้งหนี้"], receipt: ["ads.t.receipt", "ใบเสร็จรับเงิน"] });
  var STATUS = /** @type {Record<string, string[]>} */ ({ draft: ["ads.s.draft", "ฉบับร่าง"], issued: ["ads.s.issued", "ออกแล้ว"], void: ["ads.s.void", "ยกเลิกแล้ว"] });
  var lbl = function (/** @type {string[]} */ x) { return G(x[0], x[1]); };
  var shown = function () { return !$("adApp").hidden && !/** @type {HTMLElement} */ (document.querySelector('[data-panel="seller"]')).hidden; };
  /** plain message for the codes this tab can get */
  function bad(/** @type {any} */ e) {
    if (e && e.code === "owner_totp_required") return msg(G("ads.e.totp", "เปิดการยืนยันตัวตนสองชั้น (แท็บความปลอดภัย) ก่อนแก้ข้อมูลกิจการ"), true);
    if (e && e.code === "not_on_price_list") return msg(G("ads.e.price", "รายการในฉบับร่างนี้ไม่อยู่ในรายการราคาที่อนุมัติแล้ว สร้างฉบับร่างใหม่"), true);
    if (e && e.code === "seller_incomplete") return msg(G("ads.e.incomplete", "ยังไม่ได้กรอกข้อมูลกิจการ: กรอกข้อมูลกิจการให้ครบก่อนออกเอกสาร"), true);
    if (e && (e.code === "bad_field" || e.code === "unknown_field")) return msg(G("ads.e.field", "ข้อมูลบางช่องไม่ถูกรูปแบบ กรุณาตรวจอีกครั้ง"), true);
    if (e && (e.code === "logo_type" || e.code === "logo_too_large")) return msg(G("ads.e.logo", "โลโก้ต้องเป็น PNG, JPEG หรือ WebP ขนาดไม่เกิน 200 KB"), true);
    if (e && (e.code === "reauth_failed" || e.code === "reauth_inline_required" || e.code === "reauth_required")) return msg(G("ads.e.re", "ยังไม่ได้บันทึก: รหัสผ่านหรือรหัส 6 หลักไม่ถูกต้อง"), true);
    if (e && e.status === 401) return fail(e);
    return msg(kit.friendly ? kit.friendly(e) : e.message, true);
  }

  function renderState() {
    var v = ads.view;
    if (!v) return;
    var st = $("adsState");
    st.className = v.complete ? "ad-muted" : "ad-warn";
    st.textContent = v.complete ? G("ads.complete", "ข้อมูลกิจการครบแล้ว ออกเอกสารได้")
      : G("ads.missing", "ยังไม่ได้กรอกข้อมูลกิจการ ยังขาด: {list}", { list: v.missing.map(function (/** @type {string} */ k) { return LABEL[k] ? lbl(LABEL[k]) : k; }).join(", ") });
    var f = /** @type {any} */ ($("adsForm")).elements, p = v.profile;
    PLAIN.forEach(function (k) { f[k].value = p[k] || ""; f[k].setAttribute("data-user-value", "1"); });
    Object.keys(MASKED).forEach(function (k) {
      f[k].value = ""; f["clear_" + k].checked = false;
      var m = p[MASKED[k]];
      f[k].placeholder = m ? G("ads.keep", "ตั้งไว้แล้ว {m} (เว้นว่าง = ไม่เปลี่ยน)", { m: m }) : "";
    });
    f.vat_registered.value = p.vat_registered === true ? "yes" : p.vat_registered === false ? "no" : "";
    f.vat_rate.value = "7"; // fixed: approved prices are excl. 7 % VAT (the Worker accepts only 700)
    $("adsLogoState").textContent = v.logo.set ? G("ads.logoSet", "มีโลโก้แล้ว ({kb} KB)", { kb: Math.ceil(v.logo.bytes / 1024) }) : G("ads.logoNone", "ยังไม่มีโลโก้");
  }
  function renderPrices() {
    var sel = /** @type {HTMLSelectElement} */ (/** @type {any} */ ($("adsDocForm")).elements.line_id), keep = sel.value;
    sel.textContent = "";
    ads.prices.forEach(function (/** @type {any} */ l) {
      var name = gLang() === "en" ? l.name_en + " (" + l.unit_en + ")" : gLang() === "zh" ? l.name_zh + "（" + l.unit_zh + "）" : l.name_th + " (" + l.unit_th + ")";
      sel.appendChild(h("option", { value: l.id, text: name + " · " + baht(l.pilot_satang) + " " + G("ads.exVat", "บาท ไม่รวม VAT") }));
    });
    if (keep) sel.value = keep;
  }
  function renderDocs() {
    var ul = $("adsDocs");
    ul.textContent = "";
    if (!ads.docs.length) ul.appendChild(h("li", { class: "ad-muted", text: G("ads.noDocs", "ยังไม่มีเอกสาร") }));
    ads.docs.forEach(function (/** @type {any} */ d) {
      var li = h("li", { class: "ads-doc", "data-doc": d.id },
        h("span", null, h("b", { text: lbl(TYPE[d.doc_type]) }), " · " + (d.number || lbl(STATUS.draft)) + (d.status === "void" ? " · " + lbl(STATUS.void) : "") + " · ",
          h("span", { "data-user-value": "1", text: d.buyer_name }), " · " + baht(d.total_satang) + " " + G("ads.baht", "บาท")));
      var btn = function (/** @type {string} */ act, /** @type {string} */ key, /** @type {string} */ th, /** @type {() => void} */ fn) {
        var b = h("button", { type: "button", class: "ad-btn ad-ghost", "data-act": act, text: G(key, th) });
        b.addEventListener("click", fn);
        li.appendChild(b);
      };
      btn("preview", "ads.open", "เปิดดู / พิมพ์", function () { preview(d.id); });
      if (d.status === "draft") btn("issue", "ads.issue", "ออกเลขที่เอกสาร", function () { issue(d.id); });
      if (d.status !== "void") btn("void", "ads.void", "ยกเลิกเอกสาร", function () { voidDoc(d.id); });
      if (d.unavailable_lines && d.unavailable_lines.length) {
        li.appendChild(h("span", { class: "ad-warn", text: G("ads.unavailable", "มีรายการที่ไม่อยู่ในรายการราคาที่อนุมัติแล้ว ออกเลขที่ไม่ได้ สร้างฉบับร่างใหม่") }));
      }
      ul.appendChild(li);
    });
  }
  function loadDocs() { return call("/seller/docs").then(function (/** @type {any} */ r) { ads.docs = r.docs || []; renderDocs(); }); }
  loaders.seller = function () {
    Promise.all([call("/seller"), ads.prices.length ? Promise.resolve({ lines: ads.prices }) : call("/seller/prices"), call("/seller/docs")]).then(function (/** @type {any[]} */ x) {
      ads.view = x[0]; ads.prices = x[1].lines || []; ads.docs = x[2].docs || [];
      renderState(); renderPrices(); renderDocs();
    }, bad);
  };
  window.addEventListener("lq-lang", function () { if (shown()) { renderState(); renderPrices(); renderDocs(); } });

  $("adsForm").addEventListener("submit", function (/** @type {Event} */ e) {
    e.preventDefault();
    var f = /** @type {any} */ ($("adsForm")).elements, p = (ads.view || { profile: {} }).profile, out = /** @type {Record<string, any>} */ ({});
    PLAIN.forEach(function (k) { var v = String(f[k].value || "").trim(); if (v !== (p[k] || "")) out[k] = v; });
    // masked fields: empty = keep; the "remove" box sends "" (clears the stored value)
    Object.keys(MASKED).forEach(function (k) { var v = String(f[k].value || "").trim(); if (v) out[k] = v; else if (f["clear_" + k].checked) out[k] = ""; });
    var vr = f.vat_registered.value;
    if (vr === "yes" || vr === "no") {
      var want = vr === "yes";
      if (want !== p.vat_registered) out.vat_registered = want;
      if (want) {
        if (p.vat_rate_bp !== 700) out.vat_rate_bp = 700;
      }
    }
    if (!Object.keys(out).length) { msg(G("ads.nothing", "ไม่มีอะไรเปลี่ยน")); return; }
    call("/seller", { method: "PUT", body: out }).then(function (/** @type {any} */ r) {
      ads.view = r; renderState(); msg(G("ads.saved", "บันทึกข้อมูลกิจการแล้ว"));
    }, bad);
  });

  $("adsLogoFile").addEventListener("change", function () {
    var inp = /** @type {HTMLInputElement} */ ($("adsLogoFile")), file = inp.files && inp.files[0];
    if (!file) return;
    if (["image/png", "image/jpeg", "image/webp"].indexOf(file.type) < 0 || file.size > 200000) { bad({ code: "logo_type" }); inp.value = ""; return; }
    var rd = new FileReader();
    rd.onload = function () {
      var data = String(rd.result || "").replace(/^data:[^,]*,/, "");
      call("/seller/logo", { method: "PUT", body: { mime: file.type, data: data } }).then(function (/** @type {any} */ r) {
        ads.view = r; renderState(); msg(G("ads.logoSaved", "บันทึกโลโก้แล้ว"));
      }, bad).then(function () { inp.value = ""; });
    };
    rd.readAsDataURL(file);
  });
  $("adsLogoDel").addEventListener("click", function () {
    call("/seller/logo", { method: "DELETE", body: {} }).then(function (/** @type {any} */ r) { ads.view = r; renderState(); msg(G("ads.logoRemoved", "ลบโลโก้แล้ว")); }, bad);
  });

  $("adsDocForm").addEventListener("submit", function (/** @type {Event} */ e) {
    e.preventDefault();
    var f = /** @type {any} */ ($("adsDocForm")).elements, type = f.doc_type.value;
    var buyer = /** @type {Record<string, string>} */ ({ name: String(f.buyer_name.value || "").trim() });
    if (!buyer.name) { msg(G("ads.e.buyer", "กรุณากรอกชื่อลูกค้า"), true); return; }
    var tax = String(f.buyer_tax_id.value || "").trim(), addr = String(f.buyer_address.value || "").trim();
    if (tax) buyer.tax_id = tax;
    if (addr) buyer.address = addr;
    var body = /** @type {Record<string, any>} */ ({ doc_type: type, buyer: buyer, lines: [{ id: f.line_id.value, qty: parseInt(f.line_qty.value, 10) || 1 }] });
    var days = String(f.days.value || "").trim();
    if (days && type === "quotation" && parseInt(days, 10) >= 1) body.valid_days = parseInt(days, 10);
    if (days && type === "invoice") body.due_days = parseInt(days, 10);
    if (type === "receipt" && f.paid_on.value) body.paid_on = f.paid_on.value;
    if (String(f.ref.value || "").trim()) body.ref = String(f.ref.value).trim();
    call("/seller/docs", { method: "POST", body: body }).then(function () {
      msg(G("ads.created", "สร้างฉบับร่างแล้ว"));
      ["buyer_name", "buyer_tax_id", "buyer_address", "days", "paid_on", "ref"].forEach(function (k) { f[k].value = ""; });
      return loadDocs();
    }, bad);
  });

  function preview(/** @type {string} */ id) {
    call("/seller/docs/" + id, { raw: true }).then(function (/** @type {Response} */ r) { return r.text(); }).then(function (/** @type {string} */ html) {
      $("adsPreviewBox").hidden = false;
      /** @type {HTMLIFrameElement} */ ($("adsPreview")).srcdoc = html;
    }, bad);
  }
  $("adsPrint").addEventListener("click", function () {
    var fr = /** @type {HTMLIFrameElement} */ ($("adsPreview"));
    try { if (fr.contentWindow) fr.contentWindow.print(); } catch (e) { msg(G("ads.e.print", "พิมพ์ไม่ได้ในเบราว์เซอร์นี้"), true); }
  });
  function issue(/** @type {string} */ id) {
    call("/seller/docs/" + id + "/issue", { method: "POST", body: {} }).then(function (/** @type {any} */ r) {
      msg(G("ads.issued", "ออกเอกสารแล้ว เลขที่ {n}", { n: r.doc.number }));
      return loadDocs();
    }, bad);
  }
  function voidDoc(/** @type {string} */ id) {
    if (!window.confirm(G("ads.voidConfirm", "ยกเลิกเอกสารนี้? เลขที่เดิมจะไม่ถูกนำกลับมาใช้"))) return;
    call("/seller/docs/" + id + "/void", { method: "POST", body: {} }).then(function () { msg(G("ads.voided", "ยกเลิกเอกสารแล้ว")); return loadDocs(); }, bad);
  }
})();
