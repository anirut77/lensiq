/* admin-orgs.js — back-office "Organisations" tab (stream G, owner decisions 2026-11-13): organisation accounts LITE and
 * licence orders entered after a quotation and a bank transfer (backend/src/orgs.js). Loaded right after admin.js, which
 * exposes its helpers as window.LQAdminKit (call() asks for the password when the Worker answers reauth_required).
 * The back office never shows member e-mails or any customer people data. TH default; EN / ZH in i18n/en-admin.js,
 * i18n/zh-admin.js (ado.*). */
(function () {
  "use strict";
  var K = /** @type {any} */ (window).LQAdminKit;
  if (!K) return;
  var call = K.call, h = K.h, G = K.G, gLang = K.gLang, msg = K.msg, fail = K.fail, baht = K.baht, loaders = K.loaders, $ = K.$;
  // Back office of the LENSIQ owner: create an organisation (shows the one-time owner invitation link once), billing
  // details, members (names and roles only), status, licence orders entered after a quotation and a bank transfer (no
  // online payment; the amount is the quoted one, excl. 7 % VAT) and the organisation's audit log. Re-auth (password)
  // is asked by call() when the Worker answers reauth_required (status change, owner invitation, licence orders).
  var ado = /** @type {any} */ ({ open: "", plans: [] });
  var adoDate = function (/** @type {number|null} */ t) {
    return t ? new Date(t * 1000).toLocaleDateString(({ th: "th-TH", en: "en-GB", zh: "zh-CN" })[gLang()], { year: "numeric", month: "short", day: "numeric" }) : "—";
  };
  var adoRole = function (/** @type {string} */ r) { return r === "admin" ? G("ado.admin", "ผู้ดูแล") : r === "staff" ? G("ado.staff", "เจ้าหน้าที่") : r; };
  var adoStatus = function (/** @type {string} */ s) {
    return s === "active" ? G("ado.st.active", "ใช้งาน") : s === "suspended" ? G("ado.st.suspended", "ระงับชั่วคราว") : s === "closed" ? G("ado.st.closed", "ปิดแล้ว") : s === "cancelled"
        ? G("ado.st.cancelled", "ยกเลิก") : s;
  };
  /**  {string[]} heads @param {any[][]} rows */
  function adoTable(heads, rows) {
    var t = h("table", { class: "ad-table" }, h("thead", null, h("tr", null, ...heads.map(function (x) { return h("th", { scope: "col", text: x }); }))));
    var tb = h("tbody");
    if (!rows.length) tb.appendChild(h("tr", null, h("td", { colspan: heads.length, class: "ad-muted", text: G("ado.none", "ยังไม่มีรายการ") })));
    rows.forEach(function (r) { tb.appendChild(h("tr", null, ...r.map(function (c) { return h("td", { text: c == null ? "—" : String(c) }); }))); });
    t.appendChild(tb);
    return h("div", { class: "ad-scroll" }, t);
  }
  window.addEventListener("lq-lang", function () { if (!$("adApp").hidden && !/** @type {HTMLElement} */ (document.querySelector('[data-panel="orgs"]')).hidden) loaders.orgs(); });
  var planName = function (/** @type {any} */ p) { return gLang() === "en" ? p.name_en : gLang() === "zh" ? p.name_zh : p.name_th; };
  loaders.orgs = function () {
    Promise.all([call("/orgs"), ado.plans.length ? Promise.resolve({ plans: ado.plans }) : call("/licence-plans")]).then(function (/** @type {any[]} */ x) {
      ado.plans = x[1].plans || [];
      var ul = $("adoList"); ul.textContent = "";
      var rows = x[0].orgs || [];
      if (!rows.length) ul.appendChild(h("li", { class: "ad-muted", text: G("ado.empty", "ยังไม่มีองค์กร") }));
      rows.forEach(function (/** @type {any} */ o) {
        var b = h("button", { type: "button", class: "ad-btn ad-ghost", text: G("ado.open", "เปิด") });
        b.addEventListener("click", function () { adoOpen(o.id); });
        ul.appendChild(h("li", { "data-org": o.id },
          h("span", null, h("b", { text: o.name }), " · " + adoStatus(o.status) + " · " + G("ado.members", "สมาชิก {n}", { n: o.members }) + " · " + G("ado.licences", "ใบอนุญาต {n}",
              { n: o.licences }) +
            (o.needs_owner ? " · " + G("ado.needsOwner", "ยังไม่มีเจ้าของบัญชีองค์กร") : "")), " ", b));
      });
      if (ado.open) adoOpen(ado.open);
    }, fail);
  };
  $("adoCreate").addEventListener("submit", function (/** @type {Event} */ e) {
    e.preventDefault();
    var f = /** @type {any} */ (e.target);
    call("/orgs", { method: "POST", body: { name: String(f.elements.name.value || "").trim() } }).then(function (/** @type {any} */ r) {
      $("adoInvite").hidden = false;
      $("adoInviteLink").value = r.owner_invite.link || r.owner_invite.link_path;
      f.reset();
      msg(G("ado.created", "สร้างองค์กรแล้ว ส่งลิงก์เชิญให้เจ้าของ"));
      ado.open = r.org.id;
      loaders.orgs();
    }, fail);
  });
  /** @param {string} id */
  function adoOpen(id) {
    ado.open = id;
    Promise.all([call("/orgs/" + id), call("/orgs/" + id + "/audit")]).then(function (/** @type {any[]} */ x) { adoRender(x[0], x[1]); }, fail);
  }
  /** @param {any} d @param {any} au */
  function adoRender(d, au) {
    var box = $("adoDetail"); box.textContent = ""; box.hidden = false;
    var id = d.org.id, b = d.billing || {};
    box.appendChild(h("h3", { text: d.org.name }));
    box.appendChild(h("p", { class: d.needs_owner ? "ad-warn" : "ad-muted", text: adoStatus(d.org.status) + " · " + G("ado.since", "สร้างเมื่อ {d}", { d: adoDate(d.created_at) }) +
      (d.needs_owner ? " · " + G("ado.needsOwner", "ยังไม่มีเจ้าของบัญชีองค์กร") : "") }));
    // status + owner invitation
    var st = h("select", { id: "adoStatus", "aria-label": G("ado.status", "สถานะ") },
      ...["active", "suspended", "closed"].map(function (s) { return h("option", { value: s, text: adoStatus(s) }); }));
    /** @type {HTMLSelectElement} */ (st).value = d.org.status;
    var stBtn = h("button", { type: "button", class: "ad-btn ad-ghost", text: G("ado.setStatus", "เปลี่ยนสถานะ") });
    stBtn.addEventListener("click", function () {
      call("/orgs/" + id, { method: "PUT", body: { status: /** @type {HTMLSelectElement} */ (st).value } }).then(function () { msg(G("ado.saved", "บันทึกแล้ว")); loaders.orgs(); }, fail);
    });
    var inv = h("button", { type: "button", class: "ad-btn ad-ghost", id: "adoOwnerInvite", text: G("ado.ownerInvite", "สร้างลิงก์เชิญเจ้าของใหม่") });
    inv.addEventListener("click", function () {
      call("/orgs/" + id + "/owner-invite", { method: "POST", body: {} }).then(function (/** @type {any} */ r) {
        $("adoInvite").hidden = false; $("adoInviteLink").value = r.link || r.link_path; msg(G("ado.inviteMade", "สร้างลิงก์เชิญแล้ว (ใช้ได้ครั้งเดียว 72 ชั่วโมง)"));
      }, fail);
    });
    box.appendChild(h("div", { class: "ad-row" }, h("label", null, h("span", { text: G("ado.status", "สถานะ") }), st), stBtn, inv));
    // billing details
    var fld = function (/** @type {string} */ n, /** @type {string} */ k, /** @type {string} */ th, /** @type {Record<string, any>} */ ex) {
      return h("label", null, h("span", { text: G(k, th) }), h("input", Object.assign({ name: n, value: b[n] || "" }, ex)));
    };
    var bf = h("form", { id: "adoBilling", class: "ad-form" },
      fld("name", "ado.bName", "ชื่อสำหรับออกเอกสาร", { maxlength: "120" }), fld("tax_id", "ado.bTax", "เลขประจำตัวผู้เสียภาษี (13 หลัก)", { maxlength: "13", inputmode: "numeric" }),
      fld("address", "ado.bAddr", "ที่อยู่", { maxlength: "300" }), fld("branch", "ado.bBranch", "สาขา", { maxlength: "60" }), fld("email", "ado.bEmail", "อีเมลรับเอกสาร",
          { maxlength: "254", type: "email" }),
      h("button", { class: "ad-btn", type: "submit", text: G("ado.bSave", "บันทึกข้อมูลออกเอกสาร") }));
    bf.addEventListener("submit", function (/** @type {Event} */ e) {
      e.preventDefault();
      var el = /** @type {any} */ (bf).elements, out = /** @type {Record<string, string>} */ ({});
      ["name", "tax_id", "address", "branch", "email"].forEach(function (k) { out[k] = String(el[k].value || "").trim(); });
      call("/orgs/" + id, { method: "PUT", body: { billing: out } }).then(function () { msg(G("ado.saved", "บันทึกแล้ว")); }, fail);
    });
    box.appendChild(h("h4", { text: G("ado.billingH", "ข้อมูลออกใบเสนอราคาและใบเสร็จ") }));
    box.appendChild(bf);
    // members (names and roles only: the LENSIQ owner does not see member e-mails here)
    box.appendChild(h("h4", { text: G("ado.membersH", "ผู้ดูแลและเจ้าหน้าที่") }));
    box.appendChild(adoTable([G("ado.mName", "ชื่อ"), G("ado.mRole", "สิทธิ์"), G("ado.status", "สถานะ"), G("ado.joined", "เข้าร่วมเมื่อ")],
      (d.members || []).map(function (/** @type {any} */ m) { return [(m.display_name || "—") + (m.is_owner ? " (" + G("ado.owner", "เจ้าของ") + ")" : ""), adoRole(m.role),
          adoStatus(m.status), adoDate(m.created_at)]; })));
    // licence orders
    box.appendChild(h("h4", { text: G("ado.licH", "ใบอนุญาต (บันทึกหลังรับโอนเงิน)") }));
    var lf = h("form", { id: "adoLic", class: "ad-form" },
      h("label", null, h("span", { text: G("ado.plan", "แพ็กเกจ") }), h("select", { name: "plan_id", required: true }, h("option", { value: "", text: "—" }),
        ...ado.plans.map(function (/** @type {any} */ p) { return h("option", { value: p.id, text: planName(p) }); }))),
      h("label", null, h("span", { text: G("ado.qty", "จำนวน (ช่องทาง / คน / ผู้สอบ / ห้อง / เครื่อง-วัน)") }), h("input", { name: "quantity", type: "number", min: "1", max: "100000",
          step: "1", required: true })),
      h("label", null, h("span", { text: G("ado.from", "เริ่ม") }), h("input", { name: "starts_on", type: "date", required: true })),
      h("label", null, h("span", { text: G("ado.to", "สิ้นสุด") }), h("input", { name: "ends_on", type: "date", required: true })),
      h("label", null, h("span", { text: G("ado.ref", "เลขใบเสนอราคา / อ้างอิงการโอน") }), h("input", { name: "order_ref", maxlength: "80" })),
      h("label", null, h("span", { text: G("ado.amount", "ยอดตามใบเสนอราคา (บาท ไม่รวม VAT 7%)") }), h("input", { name: "amount", type: "number", min: "0", step: "0.01" })),
      h("label", null, h("span", { text: G("ado.note", "หมายเหตุ") }), h("input", { name: "note", maxlength: "300" })),
      h("button", { class: "ad-btn", type: "submit", text: G("ado.licAdd", "บันทึกใบอนุญาต") }));
    lf.addEventListener("submit", function (/** @type {Event} */ e) {
      e.preventDefault();
      var el = /** @type {any} */ (lf).elements;
      var amt = String(el.amount.value || "").trim();
      call("/orgs/" + id + "/licences", { method: "POST", body: {
        plan_id: el.plan_id.value, quantity: parseInt(el.quantity.value, 10), starts_on: el.starts_on.value, ends_on: el.ends_on.value,
        order_ref: el.order_ref.value || undefined, amount_satang: amt ? Math.round(parseFloat(amt) * 100) : undefined, note: el.note.value || undefined
      } }).then(function () { msg(G("ado.licDone", "บันทึกใบอนุญาตแล้ว")); adoOpen(id); }, fail);
    });
    box.appendChild(lf);
    var lt = h("table", { class: "ad-table", id: "adoLicences" },
      h("thead", null, h("tr", null, ...[G("ado.plan", "แพ็กเกจ"), G("ado.qtyShort", "จำนวน"), G("ado.period", "ช่วงเวลา"), G("ado.amountShort", "ยอด (บาท)"), G("ado.status", "สถานะ"),
          ""].map(function (x) { return h("th", { scope: "col", text: x }); }))));
    var tb = h("tbody");
    (d.licences || []).forEach(function (/** @type {any} */ l) {
      var p = ado.plans.find(function (/** @type {any} */ x) { return x.id === l.plan_id; });
      var cancel = l.status === "active" ? h("button", { type: "button", class: "ad-btn ad-ghost", text: G("ado.cancel", "ยกเลิก") }) : null;
      if (cancel) cancel.addEventListener("click", function () {
        call("/orgs/" + id + "/licences/" + l.id, { method: "PUT", body: { status: "cancelled" } }).then(function () { msg(G("ado.saved", "บันทึกแล้ว")); adoOpen(id); }, fail);
      });
      tb.appendChild(h("tr", { "data-licence": l.id }, h("td", { text: p ? planName(p) : l.plan_id }), h("td", { text: String(l.quantity) }),
        h("td", { text: adoDate(l.starts_at) + " – " + adoDate(l.ends_at) }), h("td", { text: baht(l.amount_satang) }), h("td", { text: adoStatus(l.status) }), h("td", null, cancel)));
    });
    lt.appendChild(tb);
    box.appendChild(h("div", { class: "ad-scroll" }, lt));
    // audit log
    box.appendChild(h("h4", { text: G("ado.auditH", "บันทึกการเปลี่ยนแปลงขององค์กร") }));
    var aw = h("div", { id: "adoAudit" }, h("p", { class: au.chain_ok ? "ad-muted" : "ad-warn", text: au.chain_ok ? G("ado.chainOk", "ตรวจความต่อเนื่องของบันทึกแล้ว: ไม่พบการแก้ไข")
        : G("ado.chainBad", "พบบันทึกที่ไม่ต่อเนื่อง") }));
    var al = h("ul", { class: "ado-list" });
    (au.entries || []).slice(0, 50).forEach(function (/** @type {any} */ e) {
      al.appendChild(h("li", null, adoDate(e.ts) + " · " + (e.actor || "—") + " · ", h("code", { translate: "no", text: e.action })));
    });
    aw.appendChild(al);
    box.appendChild(aw);
  }
})();
