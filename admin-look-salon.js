/* admin-look-salon.js — salon catalogue approval step in the back office (admin.html tab "lsalon"; backend/src/look-salon.js;
 * owner decision 2026-11-18; docs/BEAUTY-IMAGE-DESIGN.md §4).
 *
 * Uses the admin session, request helper and tab loaders of admin.js (window.__LQAdmin). What each account may do is decided
 * on the Worker: every entry is saved as "pending"; only the approver roles (default: the LENSIQ owner; LOOK_SALON_APPROVERS
 * may add LENSIQ admins) see the approve button, and the Worker refuses anyone else. An edit sends the entry back to
 * pending. The wording check runs on the Worker on every save and again at approval; it is a first step, not a complete
 * filter, so a person reads every entry. No photo is uploaded: shapes are preset cards, points, colour codes, liner styles
 * or SVG path data. The salon's text is shown as text (never as HTML), marked translate="no".
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), A = W.__LQAdmin, $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
  if (!A || !$("lsList")) return;
  const G = A.G, h = A.h;
  const st = { data: /** @type {any} */ (null), cur: /** @type {any} */ (null), rejectId: "", rejectVersion: 0, histId: "" };
  const role = () => { const m = A.me(); return m ? String(m.role) : ""; };
  const isDecider = () => role() === "owner" || role() === "lensiq_admin";
  const KIND = { brow: "ทรงคิ้ว", lip: "สีปาก", liner: "สไตล์อายไลเนอร์", hair: "ภาพวาดทรงผม" };
  const STATUS = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ส่งกลับให้แก้", hidden: "ซ่อนแล้ว" };
  const ACTION = { created: "สร้าง", updated: "แก้ไข (กลับเป็นรออนุมัติ)", lint_refused: "ตัวตรวจถ้อยคำไม่ผ่าน", approve_refused: "อนุมัติไม่สำเร็จ",
    approved: "อนุมัติ", rejected: "ส่งกลับ", hidden: "ซ่อน" };
  const REASON = { wording: "ถ้อยคำ", procedure: "มีชื่อหัตถการหรือวิธีทำ", rights: "สิทธิ์ในรูปทรงหรือภาพวาด", shape: "รูปทรงไม่ชัดหรือไม่ถูกต้อง", other: "อื่น ๆ" };
  const HIT = { procedure: "ชื่อหัตถการหรือวิธีทำ", whitening: "การทำให้ผิวขาว", negative: "บอกว่าส่วนใดของใบหน้าไม่ดีหรือต้องแก้", score: "คะแนนหรือการเทียบความงาม",
    threat: "บอกว่าโชคจะเสียถ้าไม่ทำ", purchase: "คำชวนซื้อ", price: "ราคา", link: "ลิงก์หรือช่องทางติดต่อ", guarantee: "การรับประกันผล", markup: "โค้ดหรือแท็ก" };
  const FIELD = { name_th: "ชื่อ (ไทย)", name_en: "ชื่อ (อังกฤษ)", name_zh: "ชื่อ (จีน)", desc_th: "คำอธิบาย (ไทย)", desc_en: "คำอธิบาย (อังกฤษ)", desc_zh: "คำอธิบาย (จีน)",
    code: "รหัสสี", shape: "รูปทรง", kind: "ประเภท" };
  const CARD = { "brow-arch": "คิ้วโค้ง", "brow-extend": "คิ้วต่อหาง", "brow-lift": "คิ้วปลายยก", "brow-define": "คิ้วเส้นชัด", "brow-fill": "คิ้วเติมกลาง", "brow-open": "ระยะหว่างคิ้ว",
    "lip-warm": "ปากโทนอุ่น", "lip-center": "ปากเน้นกลาง", "lip-matte": "ปากแมตต์", "lip-gloss": "ปากเงา" };
  const ERR = {
    bad_body: "คำขอไม่ถูกต้อง ลองใหม่อีกครั้ง", unknown_field: "มีช่องข้อมูลที่ระบบไม่รู้จัก", invalid_kind: "เลือกประเภทรายการ",
    rights_required: "ติ๊กยืนยันว่าร้านเป็นเจ้าของหรือมีสิทธิ์ใช้รูปทรงหรือภาพวาดนี้", invalid_name: "ชื่อไทย 1–80 ตัวอักษร ชื่ออื่นไม่เกิน 80 ตัวอักษร",
    invalid_desc: "คำอธิบายไม่เกิน 300 ตัวอักษร", invalid_code: "รหัสสีไม่เกิน 24 ตัวอักษร", invalid_shape: "รูปทรงไม่ถูกต้องสำหรับประเภทนี้ ตรวจแบบภาพ จุด สี สไตล์ หรือข้อมูลเส้น",
    no_change: "ยังไม่มีอะไรเปลี่ยน", stale_version: "รายการนี้ถูกแก้ไขหลังคุณเปิดดู โหลดใหม่แล้วอ่านอีกครั้ง", not_pending: "อนุมัติหรือส่งกลับได้เฉพาะรายการที่รออนุมัติ",
    approver_not_allowed: "บัญชีนี้อนุมัติรายการไม่ได้ เจ้าของ LENSIQ เป็นผู้อนุมัติ", invalid_reason: "เลือกเหตุผลจากรายการ", invalid_version: "โหลดรายการใหม่แล้วลองอีกครั้ง",
    not_changed: "ไม่มีอะไรเปลี่ยน", not_found: "ไม่พบรายการนี้", forbidden_role: "บัญชีของคุณทำรายการนี้ไม่ได้", not_signed_in: "กรุณาเข้าสู่ระบบใหม่",
    lint_failed: "ตัวตรวจถ้อยคำไม่ผ่าน แก้ข้อความแล้วบันทึกใหม่"
  };
  const err = (/** @type {any} */ e) => {
    if (!e || !e.code) return A.friendly(e);
    let t = G("ls.e." + e.code, ERR[/** @type {keyof typeof ERR} */ (e.code)] || A.friendly(e));
    if (e.code === "lint_failed" && Array.isArray(e.fields)) {
      t += ": " + e.fields.map((/** @type {any} */ f) => fieldName(f.field) + " (" + (f.codes || []).map(hitName).join(", ") + ")").join("; ");
    }
    return t;
  };
  const kindName = (/** @type {string} */ k) => G("ls.k." + k, KIND[/** @type {keyof typeof KIND} */ (k)] || k);
  const stName = (/** @type {string} */ s) => G("ls.s." + s, STATUS[/** @type {keyof typeof STATUS} */ (s)] || s);
  const actName = (/** @type {string} */ a) => G("ls.a." + a, ACTION[/** @type {keyof typeof ACTION} */ (a)] || a);
  const reasonName = (/** @type {string} */ r) => G("ls.r." + r, REASON[/** @type {keyof typeof REASON} */ (r)] || r);
  const hitName = (/** @type {string} */ c) => G("ls.hit." + c, HIT[/** @type {keyof typeof HIT} */ (c)] || c);
  const fieldName = (/** @type {string} */ f) => G("ls.fld." + f, FIELD[/** @type {keyof typeof FIELD} */ (f)] || f);
  const cardName = (/** @type {string} */ c) => G("ls.card." + c, CARD[/** @type {keyof typeof CARD} */ (c)] || c);
  const when = (/** @type {number} */ t) => (t ? new Date(t * 1000).toLocaleString(G("ls.locale", "th-TH")) : "—");

  function load() {
    A.call("/look-salon/entries").then((/** @type {any} */ r) => { st.data = r; render(); }, (/** @type {any} */ e) => A.msg(err(e), true));
  }
  A.loaders.lsalon = load;

  /** the salon's own text: shown as text, never translated by the browser */
  const salonText = (/** @type {string} */ t, /** @type {string} */ l) => h("div", { class: "ls-name", lang: l, translate: "no" }, t);
  function render() {
    const d = st.data; if (!d) return;
    $("lsApprover").textContent = d.can_approve ? G("ls.ap.you", "บัญชีนี้อนุมัติรายการได้ อ่านทุกข้อความก่อนกดอนุมัติ")
      : G("ls.ap.owner", "เจ้าของ LENSIQ เป็นผู้อนุมัติ (ค่าเริ่มต้น) รายการที่คุณบันทึกจะรออนุมัติ");
    const box = $("lsList"); box.textContent = "";
    if (!d.entries.length) { box.appendChild(h("p", { class: "ad-muted", text: G("ls.none", "ยังไม่มีรายการ") })); return; }
    d.entries.forEach((/** @type {any} */ it) => {
      const btn = (/** @type {string} */ act, /** @type {string} */ key, /** @type {string} */ th) => h("button", { class: "ad-btn ad-ghost", type: "button", "data-act": act, text: G(key, th) });
      const lintBad = Array.isArray(it.lint) && it.lint.length > 0;
      const acts = [btn("edit", "ls.act.edit", "แก้ไข"), btn("history", "ls.act.history", "ประวัติ")];
      if (it.status === "pending" && d.can_approve && !lintBad) acts.push(btn("approve", "ls.act.approve", "อนุมัติฉบับนี้"));
      if (it.status === "pending" && isDecider()) acts.push(btn("reject", "ls.act.reject", "ส่งกลับให้แก้"));
      if (it.status !== "hidden" && isDecider()) acts.push(btn("hide", "ls.act.hide", "ซ่อน"));
      const texts = [];
      for (const k of ["name_th", "name_en", "name_zh", "desc_th", "desc_en", "desc_zh", "code"]) if (it[k]) texts.push(salonText(it[k], k.slice(-2) === "de" ? "th" : k.slice(-2)));
      const shape = it.shape || {};
      const shapeText = it.kind === "lip" ? (shape.hex || "") + (shape.gloss != null ? " · " + G("ls.gloss", "เงา {g}", { g: shape.gloss }) : "")
        : it.kind === "liner" ? G("ls.st." + shape.style, shape.style || "") : it.kind === "hair" ? G("ls.pathLen", "ข้อมูลเส้น {n} ตัวอักษร", { n: String(shape.path || "").length })
          : (shape.card ? cardName(shape.card) : "") + (shape.points ? " · " + G("ls.points", "{n} จุด", { n: shape.points.length }) : "");
      box.appendChild(h("div", { class: "am-row ls-row", "data-id": it.id, "data-status": it.status },
        h("div", { class: "am-meta" }, h("span", { class: "ls-status", "data-status": it.status, text: stName(it.status) }),
          " · " + kindName(it.kind) + " · " + G("ls.ver", "ฉบับที่ {v}", { v: it.version }) + (shapeText ? " · " + shapeText : "")),
        ...texts,
        it.status === "rejected" && it.reject_reason ? h("div", { class: "am-meta", text: G("ls.rejWhy", "เหตุผลที่ส่งกลับ: {r}", { r: reasonName(it.reject_reason) }) }) : null,
        lintBad ? h("div", { class: "ad-alert ad-bad", text: G("ls.lintBad", "ตัวตรวจถ้อยคำพบปัญหา จึงอนุมัติไม่ได้: {x}",
          { x: it.lint.map((/** @type {any} */ f) => fieldName(f.field) + " (" + f.codes.map(hitName).join(", ") + ")").join("; ") }) }) : null,
        h("div", { class: "ad-row" }, ...acts)));
    });
  }
  $("lsList").addEventListener("click", (/** @type {any} */ ev) => {
    const b = ev.target && ev.target.closest && ev.target.closest("button[data-act]"); if (!b) return;
    const id = b.closest(".ls-row").getAttribute("data-id"), act = b.getAttribute("data-act");
    const it = st.data.entries.find((/** @type {any} */ x) => x.id === id); if (!it) return;
    const done = () => { A.msg(G("ls.done", "บันทึกแล้ว")); load(); if (st.histId === id) history(id); };
    if (act === "edit") return edit(it);
    if (act === "history") return history(id);
    if (act === "approve") {
      return A.call("/look-salon/entries/" + id + "/approve", { method: "POST", body: { version: it.version } }).then(done, (/** @type {any} */ e) => { A.msg(err(e), true); load(); });
    }
    if (act === "reject") {
      st.rejectId = id; st.rejectVersion = it.version;
      const dlg = $("lsRejectDlg"); dlg.querySelector("select").value = "wording";
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      return;
    }
    if (act === "hide") {
      return A.call("/look-salon/entries/" + id + "/hide", { method: "POST", body: {} }).then(done, (/** @type {any} */ e) => A.msg(err(e), true));
    }
  });
  $("lsRejectDlg").addEventListener("close", () => {
    const dlg = $("lsRejectDlg");
    if (dlg.returnValue !== "ok" || !st.rejectId) { st.rejectId = ""; return; }
    const id = st.rejectId; st.rejectId = "";
    A.call("/look-salon/entries/" + id + "/reject", { method: "POST", body: { version: st.rejectVersion, reason: dlg.querySelector("select").value } })
      .then(() => { A.msg(G("ls.done", "บันทึกแล้ว")); load(); }, (/** @type {any} */ e) => { A.msg(err(e), true); load(); });
  });

  function history(/** @type {string} */ id) {
    st.histId = id;
    A.call("/look-salon/entries/" + id + "/history").then((/** @type {any} */ r) => {
      const ul = $("lsHist"); ul.textContent = "";
      r.events.forEach((/** @type {any} */ e) => {
        const extra = e.detail && e.detail.reason ? " · " + reasonName(e.detail.reason)
          : e.detail && e.detail.hits ? " · " + e.detail.hits.map(hitName).join(", ")
            : e.detail && e.detail.why ? " · " + G("ls.e." + e.detail.why, ERR[/** @type {keyof typeof ERR} */ (e.detail.why)] || e.detail.why) : "";
        ul.appendChild(h("li", { text: when(e.at) + " · " + actName(e.action) + " · " + e.actor + " · " + G("ls.ver", "ฉบับที่ {v}", { v: e.version }) + extra }));
      });
      $("lsHistBox").hidden = false;
    }, (/** @type {any} */ e) => A.msg(err(e), true));
  }

  /* ---------- form ---------- */
  const f = /** @type {any} */ ($("lsForm"));
  function syncKind() {
    const k = f.kind.value;
    document.querySelectorAll("#lsForm [data-ls-for]").forEach(el => { /** @type {any} */ (el).hidden = !String(el.getAttribute("data-ls-for")).split(" ").includes(k); });
    const sel = $("lsCard"), cur = sel.value; sel.textContent = "";
    const cards = (st.data && st.data.cards && st.data.cards[k]) || [];
    if (k === "lip") sel.appendChild(h("option", { value: "", text: G("ls.card.none", "ไม่มีภาพประกอบ") }));
    cards.forEach((/** @type {string} */ c) => sel.appendChild(h("option", { value: c, text: cardName(c) })));
    if (cards.includes(cur)) sel.value = cur;
  }
  f.kind.addEventListener("change", syncKind);
  const showErr = (/** @type {string} */ t) => { const e = $("lsErr"); e.textContent = t; e.hidden = !t; };
  function edit(/** @type {any} */ it) {
    st.cur = it || null;
    f.reset();
    showErr("");
    $("lsEditH").textContent = it ? G("ls.edit.h2", "แก้ไขรายการ (จะกลับเป็นรออนุมัติ)") : G("ls.edit.h", "รายละเอียดรายการ");
    f.kind.value = it ? it.kind : "brow";
    syncKind();
    if (it) {
      for (const k of ["name_th", "name_en", "name_zh", "desc_th", "desc_en", "desc_zh", "code"]) f.elements[k].value = it[k] || "";
      const s = it.shape || {};
      if (s.card) f.card.value = s.card;
      if (s.points) f.points.value = s.points.map((/** @type {number[]} */ p) => p.join(",")).join("; ");
      if (s.hex) f.hex.value = s.hex;
      if (s.gloss != null) f.gloss.value = String(s.gloss);
      if (s.style) f.style.value = s.style;
      if (s.path) f.path.value = s.path;
      f.rights_ok.checked = !!it.rights_ok;
    }
    $("lsEdit").hidden = false;
    $("lsEdit").scrollIntoView && $("lsEdit").scrollIntoView({ block: "nearest" });
  }
  $("lsNew").addEventListener("click", () => edit(null));
  $("lsCancel").addEventListener("click", () => { $("lsEdit").hidden = true; st.cur = null; showErr(""); });

  /** @returns {any} shape object for the chosen kind (the Worker checks it) */
  function shapeOf(/** @type {string} */ k) {
    if (k === "brow") {
      /** @type {any} */ const s = {};
      if (f.card.value) s.card = f.card.value;
      const pts = String(f.points.value || "").trim();
      if (pts) s.points = pts.split(";").map(p => p.trim()).filter(Boolean).map(p => p.split(",").map(x => Number(x.trim())));
      return s;
    }
    if (k === "lip") {
      /** @type {any} */ const s = { hex: String(f.hex.value || "").toLowerCase() };
      if (String(f.gloss.value).trim() !== "") s.gloss = Number(f.gloss.value);
      if (f.card.value) s.card = f.card.value;
      return s;
    }
    if (k === "liner") return { style: f.style.value };
    return { path: String(f.path.value || "").trim() };
  }
  $("lsSave").addEventListener("click", () => {
    const k = f.kind.value;
    const v = (/** @type {string} */ n) => { const x = String(f.elements[n].value || "").trim(); return x || null; };
    /** @type {any} */
    const body = { kind: k, name_th: String(f.name_th.value || "").trim(), name_en: v("name_en"), name_zh: v("name_zh"),
      desc_th: v("desc_th"), desc_en: v("desc_en"), desc_zh: v("desc_zh"), shape: shapeOf(k), rights_ok: !!f.rights_ok.checked };
    if (k === "lip") body.code = v("code");
    showErr("");
    const p = st.cur ? A.call("/look-salon/entries/" + st.cur.id, { method: "PUT", body }) : A.call("/look-salon/entries", { method: "POST", body });
    p.then(() => { A.msg(G("ls.saved", "บันทึกแล้ว: รออนุมัติ")); $("lsEdit").hidden = true; st.cur = null; load(); },
      (/** @type {any} */ e) => showErr(err(e)));
  });
  // language change: redraw the list and the open history in the new language
  window.addEventListener("lq-lang", () => { if (st.data) { render(); syncKind(); } if (st.histId && !$("lsHistBox").hidden) history(st.histId); });
})();
