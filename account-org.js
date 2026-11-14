/* account-org.js — stream G (owner decisions 2026-11-13) on account.html: sign-in methods (Google + LINE: link, unlink),
 * the organisation account LITE (my organisations; for an organisation admin: members, invitations, billing details,
 * licences and the organisation's audit log) and invitation links (account.html#org_invite=<token>).
 * Talks to the Worker through lensiq-member.js (window.LQMember). The invitation token is read from the address bar once,
 * kept in sessionStorage until it is used or dropped, and removed from the address bar at once. No customer people data
 * (employees, plates, candidates) is shown or sent: the organisation account holds only the organisation's name, billing
 * details and its admins / staff. Every server string is rendered with textContent. */
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
  var M = function () { return W.LQMember; };
  // org-p1: organisation accounts appear only when BOTH switches are on (window.LENSIQ_ORG_ACCOUNTS === true here and
  // the Worker's ORG_ACCOUNTS = "on", read by LQMember.orgOn() from /v1/config); otherwise no organisation request is sent
  var clientOrg = W.LENSIQ_ORG_ACCOUNTS === true;
  var orgOn = function () { var m = M(); return clientOrg && !!m && typeof m.orgOn === "function" && !!m.orgOn(); };
  var lang = function () { return W.LQI18N ? W.LQI18N.lang : "th"; };
  var day = function (/** @type {number} */ t) { return t ? new Date(t * 1000).toLocaleDateString(({ th: "th-TH", en: "en-GB", zh: "zh-CN" })[lang()] || "th-TH", { dateStyle: "medium" }) : "—"; };
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
  /** @param {string} where @param {string} t @param {boolean} [bad] */
  function say(where, t, bad) {
    var el = $(where);
    if (el) { el.textContent = t || ""; el.classList.toggle("bad", !!bad); }
    var m = $("acMsg"); if (m) { m.textContent = t || ""; m.classList.toggle("bad", !!bad); }
  }
  /** @param {string[]} heads @param {any[][]} rows */
  function table(heads, rows) {
    return h("div", { class: "acct-scroll", tabindex: "0", role: "region", "aria-label": heads.join(" · ") }, h("table", { class: "acct-table" },
      h("thead", null, h("tr", null, ...heads.map(function (x) { return h("th", { scope: "col", text: x }); }))),
      h("tbody", null, ...rows.map(function (r) {
        return h("tr", null, ...r.map(function (c, i) { return c instanceof Node ? h("td", { "data-label": heads[i] }, c) : h("td", { "data-label": heads[i], text: c == null ? "—" : String(c) }); }));
      }))));
  }
  var ROLE = /** @type {Record<string, string[]>} */ ({ admin: ["acct.org.admin", "ผู้ดูแล"], staff: ["acct.org.staff", "เจ้าหน้าที่"] });
  var rname = function (/** @type {string} */ r) { var x = ROLE[r]; return x ? T(x[0], x[1]) : r; };
  var PRODUCT = /** @type {Record<string, string>} */ ({ gate: "Gate", attendance: "Attendance", exam: "Exam", crowd: "Crowd" });
  var errText = function (/** @type {any} */ r) {
    var c = r && r.j && r.j.code;
    return c === "invite_invalid" ? T("acct.inv.invalid", "ลิงก์เชิญนี้ใช้ไม่ได้แล้ว (ใช้ไปแล้ว หมดอายุ หรือถูกยกเลิก) กรุณาขอลิงก์ใหม่")
      : c === "invite_email_mismatch" ? T("acct.inv.email", "ลิงก์เชิญนี้ส่งถึงอีเมลอื่น กรุณาเข้าสู่ระบบด้วยบัญชีที่ได้รับเชิญ")
      : c === "already_member" ? T("acct.inv.already", "คุณเป็นสมาชิกขององค์กรนี้อยู่แล้ว")
      : c === "org_owner_protected" ? T("acct.org.ownerProt", "เปลี่ยนสิทธิ์หรือนำเจ้าของบัญชีองค์กรออกไม่ได้ ให้โอนความเป็นเจ้าของก่อน")
      : c === "org_suspended" ? T("acct.org.suspended", "บัญชีองค์กรนี้ถูกระงับชั่วคราว ดูข้อมูลและส่งออกได้ แต่แก้ไขไม่ได้")
      : c === "transfer_target" ? T("acct.org.transferTarget", "โอนความเป็นเจ้าของได้เฉพาะผู้ดูแลคนอื่นที่ใช้งานอยู่")
      : c === "last_sign_in_method" ? T("acct.meth.last", "ยกเลิกวิธีเข้าสู่ระบบสุดท้ายที่เหลืออยู่ไม่ได้")
      : c === "line_already_linked" || c === "google_already_linked" ? T("acct.meth.taken", "บัญชีนี้เชื่อมกับบัญชี LENSIQ อื่นอยู่แล้ว เราไม่รวมสองบัญชีเข้าด้วยกัน")
      : r && r.cancelled ? T("acct.re.cancel", "ยกเลิกการยืนยันตัวตน ยังไม่ได้ทำรายการ")
      : T("acct.err.generic", "ทำรายการไม่สำเร็จ");
  };

  /* ---------------- invitation link ---------------- */
  var INV_KEY = "lq-org-invite";
  var ss = {
    get: function () { try { return sessionStorage.getItem(INV_KEY) || ""; } catch (e) { return ""; } },
    set: function (/** @type {string} */ v) { try { if (v) sessionStorage.setItem(INV_KEY, v); else sessionStorage.removeItem(INV_KEY); } catch (e) { /* blocked */ } }
  };
  (function readInvite() {
    var m = /(?:^#|&)org_invite=([A-Za-z0-9_-]{43})(?:&|$)/.exec(location.hash || "");
    if (!m) return;
    // switched off on this site: the token is not kept, but it still leaves the address bar (review I6)
    if (clientOrg) ss.set(m[1]);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* old browser */ }
  })();
  function renderInvite() {
    var tok = ss.get(), box = $("acInvite"), m = M();
    if (m && m.ready() && !orgOn()) { if (tok) ss.set(""); box.hidden = true; return; } // the Worker has it off: drop the token
    box.hidden = !tok || !m || !m.ready();
    if (box.hidden) return;
    var inn = !!m.signedIn();
    $("acInviteNeed").hidden = inn;
    $("acInviteAccept").disabled = !inn;
  }
  $("acInviteAccept").addEventListener("click", function () {
    var tok = ss.get(), b = $("acInviteAccept");
    if (!tok || !M() || !M().signedIn()) return;
    b.disabled = true;
    M().orgAccept(tok).then(function (/** @type {any} */ r) {
      b.disabled = false;
      if (r.ok && r.j) {
        ss.set("");
        say("acOrgMsg", T("acct.inv.done", "เข้าร่วม {org} แล้ว ในฐานะ{role}", { org: r.j.org && r.j.org.name || "", role: rname(r.j.role) }));
        $("acInvite").hidden = true;
        loadOrgs();
        return;
      }
      if (r.j && (r.j.code === "invite_invalid" || r.j.code === "already_member")) ss.set("");
      say("acInviteMsg", errText(r), true);
    });
  });
  $("acInviteDrop").addEventListener("click", function () { ss.set(""); $("acInvite").hidden = true; });

  /* ---------------- sign-in methods ---------------- */
  function loadMethods() {
    var box = $("acMethods"), m = M();
    if (!m || !m.signedIn() || typeof m.identities !== "function") return;
    m.identities().then(function (/** @type {any} */ r) {
      box.textContent = "";
      var list = r.ok && r.j && Array.isArray(r.j.methods) ? r.j.methods : (m.me().sign_in_methods || []).map(function (/** @type {string} */ p) { return { provider: p, linked: true }; });
      var linked = list.filter(function (/** @type {any} */ x) { return x.linked; }).length;
      var ul = h("ul", { class: "acct-saved" });
      [["google", "Google"], ["line", "LINE"]].forEach(function (pv) {
        var it = list.find(function (/** @type {any} */ x) { return x.provider === pv[0]; }) || { provider: pv[0], linked: false };
        var on = pv[0] === "google" ? m.googleOn() : m.lineOn();
        var li = h("li", { "data-method": pv[0] },
          h("span", { class: "t" }, h("b", { text: pv[1] }), " · ", it.linked ? T("acct.meth.on", "เชื่อมแล้ว") + (it.linked_at ? " (" + day(it.linked_at) + ")" : "") : T("acct.meth.off",
              "ยังไม่ได้เชื่อม")));
        if (!it.linked) {
          // a provider the owner has not switched on is shown, but its button is disabled
          var lk = /** @type {any} */ (h("button", { type: "button", "data-link": pv[0], disabled: !on, text: on ? T("acct.meth.link", "เชื่อม {p}", { p: pv[1] }) : T("acct.meth.soon",
              "เชื่อม {p} (ยังไม่เปิดใช้)", { p: pv[1] }) }));
          lk.addEventListener("click", function () {
            lk.disabled = true;
            (pv[0] === "line" ? m.linkLine() : m.linkGoogle()).then(function (/** @type {any} */ x) {
              lk.disabled = false;
              if (pv[0] === "line") { if (!x.left) say("acMethMsg", errText(x), true); return; }
              if (x.ok) { say("acMethMsg", T("acct.meth.linked", "เชื่อม {p} แล้ว", { p: pv[1] })); m.refresh(); loadMethods(); } else if (!x.cancelled) say("acMethMsg", errText(x), true);
            });
          });
          li.appendChild(lk);
        } else if (it.linked && linked > 1) {
          var un = /** @type {any} */ (h("button", { type: "button", "data-unlink": pv[0], text: T("acct.meth.unlink", "ยกเลิกการเชื่อม") }));
          un.addEventListener("click", function () {
            un.disabled = true;
            m.unlink(pv[0]).then(function (/** @type {any} */ x) {
              un.disabled = false;
              if (x.ok) { say("acMethMsg", T("acct.meth.unlinked", "ยกเลิกการเชื่อม {p} แล้ว", { p: pv[1] })); m.refresh(); loadMethods(); } else say("acMethMsg", errText(x), true);
            });
          });
          li.appendChild(un);
        }
        ul.appendChild(li);
      });
      box.appendChild(ul);
    });
  }

  /* ---------------- organisations ---------------- */
  var cur = /** @type {any} */ ({ list: [], id: "", seq: 0 });
  function loadOrgs() {
    var m = M();
    if (!orgOn()) { $("org").hidden = true; return; }
    if (!m || !m.signedIn() || typeof m.orgs !== "function") return;
    m.orgs().then(function (/** @type {any} */ r) {
      cur.list = r.ok && r.j && Array.isArray(r.j.orgs) ? r.j.orgs : [];
      $("org").hidden = !cur.list.length;
      var box = $("acOrgs"); box.textContent = "";
      if (!cur.list.length) { $("acOrgDetail").textContent = ""; return; }
      if (!cur.list.some(function (/** @type {any} */ o) { return o.id === cur.id; })) cur.id = cur.list[0].id;
      var ul = h("ul", { class: "acct-saved" });
      cur.list.forEach(function (/** @type {any} */ o) {
        var li = h("li", { "data-org": o.id, "data-export-only": o.export_only ? "" : null },
          h("span", { class: "t" }, h("b", { text: o.name }), " · ", rname(o.role) + (o.is_owner ? " · " + T("acct.org.owner", "เจ้าของบัญชีองค์กร") : "") + (o.status === "suspended"
              ? " · " + T("acct.org.susp", "ระงับชั่วคราว") : "") + (o.export_only ? " · " + T("acct.org.closedExp", "ปิดแล้ว (ส่งออกข้อมูลได้เท่านั้น)") : "")));
        if (cur.list.length > 1) {
          var b = h("button", { type: "button", "aria-pressed": String(o.id === cur.id), text: T("acct.org.open", "เปิด") });
          b.addEventListener("click", function () { cur.id = o.id; loadOrgs(); });
          li.appendChild(b);
        }
        ul.appendChild(li);
      });
      box.appendChild(ul);
      loadDetail(cur.id);
    });
  }

  /** @param {string} id */
  function loadDetail(id) {
    var m = M(), box = $("acOrgDetail"), seq = ++cur.seq;
    var o = cur.list.find(function (/** @type {any} */ x) { return x.id === id; });
    if (o && o.export_only) { // review L1: a closed organisation offers only the export (its other routes answer 404)
      box.textContent = "";
      box.appendChild(exportBlock({ org: { id: o.id, name: o.name, status: o.status } }));
      return;
    }
    Promise.all([m.org(id), m.orgLicences(id)]).then(function (/** @type {any[]} */ x) {
      if (seq !== cur.seq) return; // a newer render is on its way
      var r = x[0], lic = x[1];
      box.textContent = "";
      if (!r.ok || !r.j) { say("acOrgMsg", errText(r), true); return; }
      var v = r.j;
      box.appendChild(licenceBlock(lic.ok ? lic.j : null));
      if (v.role !== "admin") { box.appendChild(h("p", { class: "acct-muted", text: T("acct.org.staffNote",
          "คุณเป็นเจ้าหน้าที่ขององค์กรนี้ การจัดการสมาชิกและข้อมูลออกเอกสารทำโดยผู้ดูแล") })); return; }
      box.appendChild(membersBlock(v));
      box.appendChild(inviteBlock(v));
      box.appendChild(billingBlock(v));
      box.appendChild(exportBlock(v));
      var au = h("div", { id: "acOrgAudit" });
      box.appendChild(h("h3", { text: T("acct.org.auditH", "บันทึกการเปลี่ยนแปลงขององค์กร") }));
      box.appendChild(au);
      m.orgAudit(id).then(function (/** @type {any} */ a) {
        if (!a.ok || !a.j) return;
        au.appendChild(h("p", { class: "acct-muted", text: a.j.chain_ok ? T("acct.org.chainOk", "ตรวจความต่อเนื่องของบันทึกแล้ว: ไม่พบการแก้ไข") : T("acct.org.chainBad",
            "พบบันทึกที่ไม่ต่อเนื่อง กรุณาติดต่อ LENSIQ") }));
        au.appendChild(table([T("acct.org.when", "เวลา"), T("acct.org.who", "ผู้ทำ"), T("acct.org.what", "รายการ")],
          (a.j.entries || []).slice(0, 20).map(function (/** @type {any} */ e) { return [day(e.ts), e.actor || "—", h("span", { translate: "no", text: e.action })]; })));
      });
    });
  }

  function licenceBlock(/** @type {any} */ l) {
    var wrap = h("div", { id: "acOrgLic" }, h("h3", { text: T("acct.org.licH", "ใบอนุญาตและแพ็กเกจฟรี") }));
    var rows = /** @type {any[][]} */ ([]);
    if (l && l.products) Object.keys(PRODUCT).forEach(function (p) {
      var x = l.products[p];
      if (x && x.licensed) rows.push([PRODUCT[p], String(x.quantity), day(x.ends_at)]);
    });
    wrap.appendChild(rows.length ? table([T("acct.org.product", "ผลิตภัณฑ์"), T("acct.org.qty", "จำนวน"), T("acct.org.until", "ใช้ได้ถึง")], rows)
      : h("p", { class: "acct-muted", text: T("acct.org.noLic", "ยังไม่มีใบอนุญาต ใช้แพ็กเกจฟรีได้ตามเงื่อนไข") }));
    wrap.appendChild(h("p", { class: "acct-muted", text: T("ft.notice",
        "ขีดจำกัดของแพ็กเกจฟรียังไม่บังคับใช้ เราจะประกาศวันเริ่มล่วงหน้าอย่างน้อย 30 วัน และเริ่มใช้ 30 วันหลังวันประกาศ ส่งออกข้อมูลของคุณได้เสมอ") }));
    return wrap;
  }

  function membersBlock(/** @type {any} */ v) {
    var m = M(), me = m.me() && m.me().user ? m.me().user.id : "";
    var rows = (v.members || []).map(function (/** @type {any} */ x) {
      var act = h("span", null);
      if (!x.is_owner) {
        var sel = h("select", { "aria-label": T("acct.org.role", "สิทธิ์") + ": " + (x.display_name || "") },
          h("option", { value: "staff", text: rname("staff") }), h("option", { value: "admin", text: rname("admin") }));
        /** @type {HTMLSelectElement} */ (sel).value = x.role;
        sel.addEventListener("change", function () {
          m.orgRole(v.org.id, x.user_id, /** @type {HTMLSelectElement} */ (sel).value).then(function (/** @type {any} */ r) {
            say("acOrgMsg", r.ok ? T("acct.org.roleDone", "เปลี่ยนสิทธิ์แล้ว") : errText(r), !r.ok);
            if (!r.ok) /** @type {HTMLSelectElement} */ (sel).value = x.role; else loadDetail(v.org.id);
          });
        });
        var rm = h("button", { type: "button", class: "acct-mini", text: x.user_id === me ? T("acct.org.leave", "ออกจากองค์กร") : T("acct.org.remove", "นำออก") });
        rm.addEventListener("click", function () {
          m.orgRemove(v.org.id, x.user_id).then(function (/** @type {any} */ r) { say("acOrgMsg", r.ok ? T("acct.org.removed", "นำออกแล้ว") : errText(r), !r.ok); if (r.ok) loadOrgs(); });
        });
        act.append(sel, " ", rm);
        if (v.is_owner && x.role === "admin" && x.status === "active") {
          var tr = h("button", { type: "button", class: "acct-mini", text: T("acct.org.transfer", "โอนความเป็นเจ้าของ") });
          tr.addEventListener("click", function () {
            m.orgTransfer(v.org.id, x.user_id).then(function (/** @type {any} */ r) { say("acOrgMsg", r.ok ? T("acct.org.transferred", "โอนความเป็นเจ้าของแล้ว") : errText(r),
                !r.ok); if (r.ok) loadOrgs(); });
          });
          act.append(" ", tr);
        }
      } else act.textContent = T("acct.org.owner", "เจ้าของบัญชีองค์กร");
      return [x.display_name || "—", x.email || "—", rname(x.role), act];
    });
    return h("div", { id: "acOrgMembers" }, h("h3", { text: T("acct.org.membersH", "ผู้ดูแลและเจ้าหน้าที่") }),
      table([T("acct.org.name", "ชื่อ"), T("acct.p.email", "อีเมล"), T("acct.org.role", "สิทธิ์"), T("acct.org.actions", "จัดการ")], rows));
  }

  function inviteBlock(/** @type {any} */ v) {
    var m = M();
    var f = h("form", { id: "acOrgInvite", class: "acct-form", novalidate: true },
      h("label", null, h("span", { text: T("acct.org.role", "สิทธิ์") }), h("select", { name: "role", class: "acct-input" }, h("option", { value: "staff", text: rname("staff") }),
          h("option", { value: "admin", text: rname("admin") }))),
      h("label", null, h("span", { text: T("acct.org.invEmail", "ผูกกับอีเมล (ไม่บังคับ: เราเก็บเป็นรหัสแฮช ไม่เก็บตัวอีเมล)") }), h("input", { name: "email", type: "email",
          maxlength: "254", autocomplete: "off", class: "acct-input" })),
      h("p", { class: "acct-row" }, h("button", { type: "submit", class: "btn ghost", text: T("acct.org.invCreate", "สร้างลิงก์เชิญ") })));
    var out = h("p", { class: "acct-row", hidden: true }, h("input", { id: "acOrgInviteLink", class: "acct-input", readonly: true, "aria-label": T("acct.org.invLink",
        "ลิงก์เชิญ (ใช้ได้ครั้งเดียว ภายใน 72 ชั่วโมง)") }));
    f.addEventListener("submit", function (/** @type {Event} */ e) {
      e.preventDefault();
      var el = /** @type {any} */ (f).elements;
      m.orgInvite(v.org.id, { role: el.role.value, email: String(el.email.value || "").trim() || undefined }).then(function (/** @type {any} */ r) {
        if (!r.ok || !r.j) { say("acOrgMsg", errText(r), true); return; }
        var link = new URL(String(r.j.link_path), location.href).href;
        out.hidden = false;
        $("acOrgInviteLink").value = link;
        say("acOrgMsg", T("acct.org.invDone", "สร้างลิงก์เชิญแล้ว ส่งให้ผู้รับเอง ลิงก์ใช้ได้ครั้งเดียวภายใน 72 ชั่วโมง"));
      });
    });
    var pending = (v.invites || []).map(function (/** @type {any} */ i) {
      var rv = h("button", { type: "button", class: "acct-mini", text: T("acct.org.revoke", "ยกเลิกลิงก์") });
      rv.addEventListener("click", function () { m.orgRevoke(v.org.id, i.id).then(function (/** @type {any} */ r) { say("acOrgMsg", r.ok ? T("acct.org.revoked", "ยกเลิกลิงก์แล้ว")
          : errText(r), !r.ok); if (r.ok) loadDetail(v.org.id); }); });
      return [rname(i.role), i.email_bound ? T("acct.org.bound", "ผูกอีเมล") : "—", day(i.expires_at), rv];
    });
    return h("div", null, h("h3", { text: T("acct.org.invH", "เชิญผู้ดูแลหรือเจ้าหน้าที่") }), f, out,
      pending.length ? table([T("acct.org.role", "สิทธิ์"), T("acct.org.bound", "ผูกอีเมล"), T("acct.org.expires", "หมดอายุ"), T("acct.org.actions", "จัดการ")], pending) : null);
  }

  function billingBlock(/** @type {any} */ v) {
    var m = M(), b = v.billing || {};
    var fld = function (/** @type {string} */ n, /** @type {string} */ k, /** @type {string} */ th, /** @type {Record<string, any>} */ extra) {
      return h("label", null, h("span", { text: T(k, th) }), h("input", Object.assign({ name: n, class: "acct-input", value: b[n] || "" }, extra)));
    };
    var f = h("form", { id: "acOrgBilling", class: "acct-form", novalidate: true },
      fld("name", "acct.org.bName", "ชื่อสำหรับออกเอกสาร (นิติบุคคลหรือบุคคล)", { maxlength: "120", autocomplete: "organization" }),
      fld("tax_id", "acct.org.bTax", "เลขประจำตัวผู้เสียภาษี (13 หลัก)", { maxlength: "13", inputmode: "numeric", pattern: "\\d{13}" }),
      fld("address", "acct.org.bAddr", "ที่อยู่สำหรับออกเอกสาร", { maxlength: "300", autocomplete: "street-address" }),
      fld("branch", "acct.org.bBranch", "สาขา (เช่น สำนักงานใหญ่)", { maxlength: "60" }),
      fld("email", "acct.org.bEmail", "อีเมลรับใบเสนอราคาและใบเสร็จ", { maxlength: "254", type: "email", autocomplete: "email" }),
      h("p", { class: "acct-row" }, h("button", { type: "submit", class: "btn ghost", text: T("acct.org.bSave", "บันทึกข้อมูลออกเอกสาร") })));
    f.addEventListener("submit", function (/** @type {Event} */ e) {
      e.preventDefault();
      var el = /** @type {any} */ (f).elements, out = /** @type {Record<string, string>} */ ({});
      ["name", "tax_id", "address", "branch", "email"].forEach(function (k) { out[k] = String(el[k].value || "").trim(); });
      m.orgProfile(v.org.id, { billing: out }).then(function (/** @type {any} */ r) {
        say("acOrgMsg", r.ok ? T("acct.org.bDone", "บันทึกข้อมูลออกเอกสารแล้ว") : (r.status === 400 ? T("acct.org.bBad",
            "ข้อมูลไม่ถูกต้อง: เลขผู้เสียภาษีต้องมี 13 หลัก และอีเมลต้องถูกต้อง") : errText(r)), !r.ok);
      });
    });
    return h("div", null, h("h3", { text: T("acct.org.billingH", "ข้อมูลออกใบเสนอราคาและใบเสร็จ") }),
      h("p", { class: "acct-muted", text: T("acct.org.billingNote", "ใช้ออกใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จหลังโอนเงินผ่านธนาคาร ไม่มีการชำระเงินออนไลน์") }), f);
  }

  /** org-p1: export of the organisation's own data (admins; always available, also when suspended) */
  function exportBlock(/** @type {any} */ v) {
    var m = M();
    var b = /** @type {any} */ (h("button", { type: "button", id: "acOrgExport", class: "btn ghost", text: T("acct.org.export", "ส่งออกข้อมูลองค์กร (ไฟล์ JSON)") }));
    b.addEventListener("click", function () {
      b.disabled = true;
      m.orgExport(v.org.id).then(function (/** @type {any} */ r) {
        b.disabled = false;
        if (!r.ok || !r.j) { say("acOrgMsg", errText(r), true); return; }
        var url = URL.createObjectURL(new Blob([JSON.stringify(r.j, null, 2)], { type: "application/json" }));
        var a = /** @type {any} */ (h("a", { href: url, download: "lensiq-org-" + v.org.id + ".json" }));
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        say("acOrgMsg", T("acct.org.exportDone", "ส่งออกแล้ว: ไฟล์มีชื่อองค์กร ข้อมูลออกเอกสาร สมาชิก ลิงก์เชิญที่เปิดอยู่ ใบอนุญาต และบันทึกการเปลี่ยนแปลง"));
      });
    });
    return h("div", { id: "acOrgExportBox" }, h("h3", { text: T("acct.org.exportH", "ส่งออกข้อมูลองค์กร") }),
      h("p", { class: "acct-muted", text: T("acct.org.exportText",
          "ส่งออกได้เสมอ แม้บัญชีองค์กรถูกระงับหรือใบอนุญาตหมดอายุ ต้องยืนยันตัวตนอีกครั้งก่อนส่งออก ไฟล์ไม่มีข้อมูลพนักงาน ทะเบียนรถ ผู้สอบ หรือภาพใด ๆ") }),
      h("p", { class: "acct-row" }, b));
  }

  /* ---------------- wiring ---------------- */
  function signedOutLabels() {
    var m = M();
    if (!m || !m.ready() || m.signedIn() || typeof m.lineOn !== "function") return;
    if (m.lineOn() && !m.googleOn()) {
      $("acSignIn").textContent = T("acct.out.ctaLine", "เข้าสู่ระบบฟรีด้วย LINE");
      $("acOut").querySelector("p").textContent = T("acct.out.textLine", "เข้าสู่ระบบฟรีด้วย LINE เพื่อเก็บประวัติของคุณและจัดการบัญชีองค์กร");
    }
  }
  var queued = false;
  /** coalesces the bursts of "lq-member" / "lq-member-ready" events into one render */
  function refresh() {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; render(); }, 0);
  }
  function render() {
    renderInvite();
    signedOutLabels();
    var m = M();
    if (!m || !m.signedIn()) { var o = $("org"); if (o) o.hidden = true; return; }
    loadMethods();
    loadOrgs();
  }
  W.addEventListener("lq-member", refresh);
  W.addEventListener("lq-member-ready", refresh);
  // a language switch re-renders; feedback lines written in the old language are cleared
  W.addEventListener("lq-lang", function () { ["acMethMsg", "acOrgMsg", "acInviteMsg"].forEach(function (id) { say(id, ""); }); if (M() && M().ready()) refresh(); });
  if (M() && M().ready()) refresh();
})();
