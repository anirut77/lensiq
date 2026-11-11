/* parking.js — LENSIQ Gate · ลานจอดรถ (parking.html). Entry / exit pairing by plate, fee rules, shop e-stamps, PromptPay
 * QR with the exact amount (built on this device), receipts, occupancy, end-of-shift reconciliation, CSV, accuracy check.
 * Pure rules live in gate-rules.js / lensiq-plate.js / lensiq-promptpay.js (unit-tested); this file is the screen.
 * Test hook: window.__LQ_PK (state + helpers) for tests/e2e/gate-parking.e2e.mjs. */
(function () {
  "use strict";
  const W = /** @type {any} */ (window);
  const LP = W.LQPlate, GR = W.LQGateRules, PP = W.LQPromptPay;
  const kit = W.GateKit.init({ ns: "lq-gate-parking", page: "parking", defaults: {
    fees: { ...GR.DEFAULT_FEES }, siteName: "", ppId: "", capacity: 50, laneDir: "both", rcSeq: 0, stampSecret: "", shift: null } });
  const { T, esc, store, fmtTime, money } = kit;
  const $ = s => /** @type {any} */ (document.querySelector(s));
  const $$ = s => /** @type {any[]} */ ([...document.querySelectorAll(s)]);
  if (!kit.cfg().stampSecret) kit.setCfg({ stampSecret: Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("") });
  const C = () => kit.cfg();
  const evs = () => store.list("ev");
  const pay = { entry: null, exit: null, stamps: [], result: null, method: "" };
  // sales demo mode (?demo=1, lensiq-demo.js): never a PromptPay ID and never a real payment QR (no real money destination)
  const DEMO = !!(W.LQDemo && W.LQDemo.on);
  W.__LQ_PK = { kit, pay, store };

  /* ---------- tabs ---------- */
  const tabs = $$("[data-tab]");
  function showTab(id) {
    tabs.forEach(b => { const on = b.dataset.tab === id; b.setAttribute("aria-selected", String(on)); const p = document.getElementById("tab-" + b.dataset.tab); if (p) p.hidden = !on; });
    if (id === "lot") renderLot(); if (id === "log") renderLog(); if (id === "shift") renderShift();
  }
  tabs.forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

  /* ---------- lane ---------- */
  const actions = () => {
    const d = C().laneDir, a = [];
    if (d !== "out") a.push({ id: "in", key: "pk.act.in", th: "บันทึกรถเข้า", cls: "go" });
    if (d !== "in") a.push({ id: "out", key: "pk.act.out", th: "รถออก: คิดค่าจอด", cls: "primary" });
    return a;
  };
  const mpassFor = (key, province) => store.list("mpass").find(m => m.key === key && (!m.province || !province || m.province === province) && m.until >= Date.now());
  kit.mountSetup($("#pkSetup"));
  kit.mountLane($("#pkLane"), {
    actions: actions(),
    onRead(cur) {
      const x = $("#gkExtra");
      if (!x) return;
      if (!cur.ok) { x.innerHTML = ""; return; }
      const open = GR.pair(evs(), cur.key, { province: cur.province });
      const mp = mpassFor(cur.key, cur.province);
      x.innerHTML = (mp ? `<p class="gk-banner" data-s="resident">${esc(T("pk.st.mpass", "บัตรจอดรายเดือน — ยกเว้นค่าจอด"))}</p>` : "") +
        (open.entry ? `<p class="hint">${esc(T("pk.st.inside", "รถคันนี้อยู่ในลานตั้งแต่ {t}", { t: fmtTime(open.entry.at) }))}${open.dist ? " · " + esc(T("pk.st.lookalike", "ทะเบียนใกล้เคียง (อักษรคล้ายกัน) — ตรวจให้แน่ใจ")) : ""}</p>` : "");
    },
    async onAction(id, fin) {
      if (!kit.cfg().ack) { kit.toast(T("gk.st.ack", "ยืนยันประกาศ PDPA ด้านบนก่อนเปิดกล้อง"), "err"); return false; }
      if (id === "in") {
        const dup = GR.occupancy(evs()).find(e => e.key === fin.key && (!e.province || !fin.province || e.province === fin.province));
        if (dup && !confirm(T("pk.q.dup", "ทะเบียนนี้บันทึกเข้าแล้วเมื่อ {t} และยังไม่ออก บันทึกเข้าซ้ำ?", { t: fmtTime(dup.at) }))) return false;
        const ev = store.put({ id: kit.uid("ev-"), kind: "ev", at: fin.at, dir: "in", key: fin.key, province: fin.province, moto: fin.moto, gate: C().gate || "", by: kit.operator(),
          conf: fin.auto ? fin.auto.conf : null, agree: fin.auto ? fin.auto.agree : null, auto: !!fin.auto, edited: fin.edited });
        kit.toast(T("pk.st.inOk", "บันทึกรถเข้า {p} แล้ว", { p: fin.line1 }));
        renderLot();
        return ev;
      }
      const ev = { id: kit.uid("ev-"), kind: "ev", at: fin.at, dir: "out", key: fin.key, province: fin.province, moto: fin.moto, gate: C().gate || "", by: kit.operator(),
        conf: fin.auto ? fin.auto.conf : null, agree: fin.auto ? fin.auto.agree : null, auto: !!fin.auto, edited: fin.edited, paid: false };
      store.put(ev);
      startPay(ev);
      return ev;
    }
  });

  /* ---------- payment ---------- */
  function startPay(exit) {
    const p = GR.pair(evs(), exit.key, { province: exit.province });
    pay.exit = exit; pay.entry = p.entry; pay.stamps = []; pay.method = ""; pay.alts = p.alternatives;
    $("#pkPay").hidden = false; $("#pkQrBox").hidden = true; $("#pkStamp").value = ""; $("#pkStampMsg").textContent = ""; $("#pkPayMsg").textContent = "";
    const sel = $("#pkEntrySel"), open = GR.occupancy(evs());
    $("#pkPickEntry").hidden = !!p.entry;
    sel.innerHTML = `<option value="">${esc(T("pk.pay.lost", "บัตรหาย / ไม่พบรถเข้า (ค่าบริการคงที่)"))}</option>` + open.slice(0, 200).map(e => `<option value="${esc(e.id)}">${esc(LP.format(e.key))} · ${esc(kit.provName(e.province))} · ${esc(fmtTime(e.at))}</option>`).join("");
    computeFee();
    $("#pkPay").scrollIntoView({ block: "nearest" });
  }
  $("#pkEntrySel").addEventListener("change", () => { pay.entry = store.get($("#pkEntrySel").value) || null; computeFee(); });
  function computeFee() {
    const ex = pay.exit; if (!ex) return;
    const mp = mpassFor(ex.key, ex.province);
    const r = GR.fee(pay.entry ? pay.entry.at : 0, ex.at, C().fees, { pass: !!mp, stamps: pay.stamps.map(s => s.shop), lost: !pay.entry });
    pay.result = r;
    const dur = r.minutes ? T("pk.dur", "{h} ชม. {m} นาที", { h: Math.floor(r.minutes / 60), m: r.minutes % 60 }) : "—";
    $("#pkPayInfo").innerHTML = `<dl class="gk-kv"><dt>${esc(T("gk.col.plate", "ทะเบียน"))}</dt><dd>${kit.plateHTML(ex.key)} ${esc(kit.provName(ex.province))}</dd>` +
      `<dt>${esc(T("pk.col.in", "เวลาเข้า"))}</dt><dd>${pay.entry ? esc(fmtTime(pay.entry.at)) : esc(T("pk.pay.noEntry", "ไม่พบ"))}</dd><dt>${esc(T("pk.col.out", "เวลาออก"))}</dt><dd>${esc(fmtTime(ex.at))}</dd>` +
      `<dt>${esc(T("pk.col.dur", "จอดมาแล้ว"))}</dt><dd>${esc(dur)}</dd></dl>` + (pay.entry && pay.entry.key !== ex.key ? `<p class="gk-valid" data-kind="warn">${esc(T("pk.st.pairLook", "จับคู่กับรถเข้า {p} (อักษรคล้ายกัน) — ตรวจให้แน่ใจ", { p: LP.format(pay.entry.key) }))}</p>` : "") +
      (pay.alts && pay.alts.length ? `<p class="gk-valid" data-kind="warn">${esc(T("pk.st.dupIn", "ทะเบียนนี้มีรายการเข้าที่ยังไม่ออก {n} รายการ — ใช้รายการล่าสุด", { n: pay.alts.length + 1 }))}</p>` : "");
    $("#pkFee").textContent = r.rule === "pass" ? T("pk.fee.pass", "บัตรรายเดือน: ฿0") : r.rule === "free" ? T("pk.fee.free", "ไม่เสียค่าจอด (อยู่ในเวลาจอดฟรี)") : T("pk.fee.amt", "ค่าจอด {a}", { a: money(r.fee) });
    const LBL = { hourly: ["pk.part.hourly", "ค่าจอดรายชั่วโมง"], overnight: ["pk.part.night", "ค่าค้างคืน"], discount: ["pk.part.disc", "ส่วนลดตราประทับ"], lost: ["pk.part.lost", "บัตรหาย/ไม่พบรถเข้า"], stampMin: ["pk.part.stampMin", "เวลาจอดฟรีจากตราประทับ"] };
    $("#pkFeeParts").innerHTML = r.parts.map(p => `<dt>${esc(T(LBL[p.k][0], LBL[p.k][1]))}</dt><dd>${esc(money(p.amt))}</dd>`).join("") +
      (r.capped ? `<dt>${esc(T("pk.part.cap", "เพดานรายวัน"))}</dt><dd>✓</dd>` : "") + (r.nights ? `<dt>${esc(T("pk.part.nights", "จำนวนคืน"))}</dt><dd>${r.nights}</dd>` : "") +
      pay.stamps.map(s => `<dt>${esc(T("pk.part.stamp", "ตราประทับ"))}</dt><dd lang="th" translate="no">${esc(s.code)} · ${esc(s.shop.name)}</dd>`).join("");
    const zero = r.fee === 0;
    $$("[data-pay]").forEach(b => { b.hidden = zero ? b.dataset.pay !== "exempt" : false; });
    const ex2 = /** @type {any} */ (document.querySelector('[data-pay="exempt"]'));
    ex2.textContent = zero ? T("pk.pay.zero", "ยืนยันรถออก (ไม่มีค่าจอด)") : T("pk.pay.exempt", "ยกเว้นค่าจอด");
    if (!$("#pkQrBox").hidden) showQr();
  }
  $("#pkStampBtn").addEventListener("click", () => {
    const used = new Set(store.list("stampUsed").map(s => s.code).concat(pay.stamps.map(s => s.code)));
    const r = GR.stampCheck(C().stampSecret, $("#pkStamp").value, shopList(), used);
    const msg = { format: ["pk.sp.bad", "รูปแบบรหัสไม่ถูกต้อง"], shop: ["pk.sp.noShop", "ไม่พบร้านค้านี้ หรือร้านปิดใช้งาน"], check: ["pk.sp.check", "รหัสไม่ถูกต้อง (ตรวจสอบไม่ผ่าน)"], used: ["pk.sp.used", "รหัสนี้ถูกใช้ไปแล้ว"] };
    const m = $("#pkStampMsg");
    if (!r.ok) { m.textContent = T(msg[r.why][0], msg[r.why][1]); m.dataset.kind = "err"; return; }
    pay.stamps.push({ code: r.code, shop: r.shop });
    m.textContent = T("pk.sp.ok", "ใช้ตราประทับ {s} แล้ว", { s: r.shop.name }); m.dataset.kind = "ok"; $("#pkStamp").value = "";
    computeFee();
  });
  function showQr() {
    if (DEMO) {
      $("#pkQrBox").hidden = true; pay.payload = null;
      $("#pkPayMsg").textContent = T("demo.pk.noQr", "ตัวอย่าง / SAMPLE: โหมดสาธิตไม่สร้าง QR พร้อมเพย์จริง ไม่มีการโอนเงิน");
      return;
    }
    const id = C().ppId;
    if (!PP.validTarget(id)) { $("#pkPayMsg").textContent = T("pk.pp.noId", "ยังไม่ได้ตั้งค่าพร้อมเพย์ (แท็บ ตั้งค่า)"); $("#pkQrBox").hidden = true; return; }
    const payload = PP.payload(id, pay.result.fee);
    PP.draw($("#pkQr"), payload, { scale: 6, margin: 4 });
    pay.payload = payload;
    $("#pkQrAmt").textContent = money(pay.result.fee);
    $("#pkQrBox").hidden = false;
  }
  $$("[data-pay]").forEach(b => b.addEventListener("click", () => {
    const m = b.dataset.pay;
    if (m === "promptpay") { pay.method = "promptpay"; showQr(); return; }
    if (m === "exempt" && pay.result.fee > 0 && !confirm(T("pk.q.exempt", "ยกเว้นค่าจอด {a}? รายการนี้จะแสดงในสรุปกะ", { a: money(pay.result.fee) }))) return;
    finishPay(m);
  }));
  $("#pkQrDone").addEventListener("click", () => finishPay("promptpay"));
  $("#pkPayCancel").addEventListener("click", () => {
    if (pay.exit && !pay.exit.paid) { pay.exit.void = true; store.put(pay.exit); }
    pay.exit = null; $("#pkPay").hidden = true;
  });
  function finishPay(method) {
    const ex = pay.exit, r = pay.result; if (!ex || !r) return;
    const amount = method === "exempt" ? 0 : r.fee;
    const seq = (C().rcSeq || 0) + 1; kit.setCfg({ rcSeq: seq });
    const no = "R" + new Date().getFullYear() + "-" + String(seq).padStart(6, "0");
    const rc = store.put({ id: "rc-" + no, kind: "rc", at: Date.now(), no, ev: ex.id, entryAt: pay.entry ? pay.entry.at : null, exitAt: ex.at, key: ex.key, province: ex.province, minutes: r.minutes,
      fee: r.fee, amount, method: r.rule === "pass" ? "pass" : method, rule: r.rule, parts: r.parts, stamps: pay.stamps.map(s => s.code), site: C().siteName || "", by: kit.operator(), shift: C().shift ? C().shift.id : "" });
    for (const s of pay.stamps) store.put({ id: "su-" + s.code, kind: "stampUsed", at: Date.now(), code: s.code, rc: no });
    Object.assign(ex, { paid: true, fee: r.fee, amount, method: rc.method, pairedWith: pay.entry ? pay.entry.id : "", rc: no });
    store.put(ex);
    pay.exit = null; $("#pkPay").hidden = true;
    showReceipt(rc);
    kit.toast(T("pk.st.paid", "บันทึกรถออกและออกใบเสร็จ {n} แล้ว", { n: no }));
    renderLot();
  }
  function showReceipt(rc) {
    const M = { cash: ["pk.m.cash", "เงินสด"], promptpay: ["pk.m.pp", "พร้อมเพย์"], exempt: ["pk.m.exempt", "ยกเว้น"], pass: ["pk.m.pass", "บัตรรายเดือน"] };
    $("#pkRcBody").innerHTML = `<h3 lang="th" translate="no">${esc(rc.site || "LENSIQ Gate")}</h3><p class="hint">${esc(T("pk.rc.title", "ใบรับเงินค่าจอดรถ"))} · ${esc(rc.no)}</p>
      <dl class="gk-kv"><dt>${esc(T("gk.col.plate", "ทะเบียน"))}</dt><dd>${kit.plateHTML(rc.key)}</dd><dt>${esc(T("gk.col.prov", "จังหวัด"))}</dt><dd>${esc(kit.provName(rc.province) || "—")}</dd>
      <dt>${esc(T("pk.col.in", "เวลาเข้า"))}</dt><dd>${rc.entryAt ? esc(fmtTime(rc.entryAt)) : "—"}</dd><dt>${esc(T("pk.col.out", "เวลาออก"))}</dt><dd>${esc(fmtTime(rc.exitAt))}</dd>
      <dt>${esc(T("pk.col.fee", "ค่าจอด"))}</dt><dd>${esc(money(rc.fee))}</dd><dt>${esc(T("pk.rc.paid", "ชำระ"))}</dt><dd>${esc(money(rc.amount))} · ${esc(T(M[rc.method][0], M[rc.method][1]))}</dd>
      <dt>${esc(T("gk.col.by", "เจ้าหน้าที่"))}</dt><dd lang="th" translate="no">${esc(rc.by)}</dd></dl><p class="hint">${esc(T("pk.rc.keep", "เก็บใบเสร็จนี้ไว้เป็นหลักฐาน"))}</p>`;
    $("#pkReceipt").hidden = false; pay.lastRc = rc;
  }
  const printEl = el => { $$(".gk-print-on").forEach(x => x.classList.remove("gk-print-on")); el.classList.add("gk-print-on"); document.body.classList.add("gk-printing"); window.print(); setTimeout(() => document.body.classList.remove("gk-printing"), 500); };
  $("#pkRcPrint").addEventListener("click", () => printEl($("#pkReceipt")));
  $("#pkRcClose").addEventListener("click", () => { $("#pkReceipt").hidden = true; });

  /* ---------- lot ---------- */
  function renderLot() {
    const open = GR.occupancy(evs()), cap = +C().capacity || 0, now = Date.now();
    $("#pkLotStats").innerHTML = `<div class="gk-stat"><b>${open.length}</b><span>${esc(T("pk.lot.in", "รถอยู่ในลาน"))}</span></div>` +
      (cap ? `<div class="gk-stat"><b>${Math.max(0, cap - open.length)}</b><span>${esc(T("pk.lot.free", "ช่องว่าง (จาก {c})", { c: cap }))}</span></div>` : "") +
      `<div class="gk-stat"><b>${evs().filter(e => e.dir === "in" && now - e.at < 86400000).length}</b><span>${esc(T("pk.lot.today", "รถเข้า 24 ชม. ล่าสุด"))}</span></div>`;
    $("#pkLotBody").innerHTML = open.slice(0, 500).map(e => {
      const m = Math.ceil((now - e.at) / 60000), f = GR.fee(e.at, now, C().fees, { pass: !!mpassFor(e.key, e.province) });
      return `<tr><td>${kit.plateHTML(e.key)}</td><td>${esc(kit.provName(e.province) || "—")}</td><td>${esc(fmtTime(e.at))}</td><td>${esc(T("pk.dur", "{h} ชม. {m} นาที", { h: Math.floor(m / 60), m: m % 60 }))}</td><td>${esc(money(f.fee))}</td>
        <td><button class="btn ghost small" type="button" data-void="${esc(e.id)}">${esc(T("pk.lot.void", "นำออกจากรายการ"))}</button></td></tr>`;
    }).join("") || `<tr><td colspan="6">${esc(T("pk.lot.empty", "ไม่มีรถในลาน"))}</td></tr>`;
  }
  $("#pkLotBody").addEventListener("click", e => {
    const b = /** @type {any} */ (e.target).closest("[data-void]"); if (!b) return;
    const ev = store.get(b.dataset.void); if (!ev) return;
    const why = prompt(T("pk.q.void", "เหตุผลที่นำรายการนี้ออก (เช่น บันทึกผิด รถออกทางอื่น)"), "");
    if (why == null) return;
    kit.correct(ev, "void", true, why); kit.renderAudit && kit.renderAudit(); renderLot();
  });

  /* ---------- log + corrections ---------- */
  let editing = null;
  function renderLog() {
    const q = LP.normalize($("#pkSearch").value);
    const rows = evs().filter(e => !q || e.key.includes(q)).slice(-300).reverse();
    $("#pkLogBody").innerHTML = rows.map(e => `<tr${e.void ? ' class="bad"' : ""}><td>${esc(fmtTime(e.at))}</td><td>${esc(e.dir === "in" ? T("pk.dir.in", "ทางเข้า") : T("pk.dir.out", "ทางออก"))}</td><td>${kit.plateHTML(e.key)}</td><td>${esc(kit.provName(e.province) || "—")}</td>
      <td>${e.auto ? esc(T("pk.log.auto", "ระบบอ่าน {c}%", { c: Math.round((e.conf || 0) * 100) })) + (e.edited ? " · " + esc(T("pk.log.edited", "แก้ไขแล้ว")) : "") : esc(T("pk.log.manual", "พิมพ์เอง"))}${e.void ? " · " + esc(T("pk.log.void", "ยกเลิก")) : ""}</td>
      <td>${e.dir === "out" ? (e.paid ? esc(money(e.amount)) : esc(T("pk.log.unpaid", "ยังไม่ชำระ"))) : ""}</td><td lang="th" translate="no">${esc(e.by || "")}</td>
      <td><button class="btn ghost small" type="button" data-edit="${esc(e.id)}">${esc(T("pk.log.edit", "แก้ไข"))}</button></td></tr>`).join("") || `<tr><td colspan="8">${esc(T("pk.log.empty", "ยังไม่มีบันทึก"))}</td></tr>`;
  }
  $("#pkSearch").addEventListener("input", renderLog);
  $("#pkLogBody").addEventListener("click", e => {
    const b = /** @type {any} */ (e.target).closest("[data-edit]"); if (!b) return;
    editing = store.get(b.dataset.edit); if (!editing) return;
    $("#pkEdit").hidden = false; $("#pkEditPlate").value = LP.format(editing.key); kit.provinceOptions($("#pkEditProv"), C().common, editing.province); $("#pkEditWhy").value = "";
    $("#pkEdit").scrollIntoView({ block: "nearest" });
  });
  $("#pkEditCancel").addEventListener("click", () => { editing = null; $("#pkEdit").hidden = true; });
  $("#pkEditSave").addEventListener("click", () => {
    if (!editing) return;
    const p = LP.parse($("#pkEditPlate").value, { moto: !!editing.moto });
    if (!p.ok) { kit.toast(T("gk.v.bad", "รูปแบบไม่ถูก: ตัวเลข (ถ้ามี) + อักษร 2 ตัว + เลข 1–4 หลัก"), "err"); return; }
    const why = $("#pkEditWhy").value.trim();
    kit.correct(editing, "key", p.key, why); kit.correct(editing, "province", $("#pkEditProv").value, why);
    editing = null; $("#pkEdit").hidden = true; renderLog(); kit.renderAudit && kit.renderAudit();
  });
  const evCols = () => [{ k: "at", label: "time", v: r => new Date(r.at).toISOString() }, { k: "dir" }, { k: "key", label: "plate", v: r => LP.format(r.key) }, { k: "province", v: r => LP.provinceName(r.province, "en") },
    { k: "auto" }, { k: "conf" }, { k: "edited" }, { k: "void" }, { k: "fee" }, { k: "amount" }, { k: "method" }, { k: "rc" }, { k: "gate" }, { k: "by" }];
  $("#pkCsv").addEventListener("click", () => kit.csv("parking-log.csv", evs(), evCols()));
  $("#pkRcCsv").addEventListener("click", () => kit.csv("parking-receipts.csv", store.list("rc"), [{ k: "no" }, { k: "at", label: "time", v: r => new Date(r.at).toISOString() }, { k: "key", label: "plate", v: r => LP.format(r.key) },
    { k: "minutes" }, { k: "fee" }, { k: "amount" }, { k: "method" }, { k: "rule" }, { k: "stamps", v: r => (r.stamps || []).join(" ") }, { k: "shift" }, { k: "by" }]));
  kit.mountAudit($("#pkAudit"));

  /* ---------- shift ---------- */
  function shiftPayments() {
    const sh = C().shift; if (!sh) return [];
    return store.list("rc").filter(r => r.at >= sh.at).map(r => ({ method: r.method, amount: r.amount, rule: r.rule, stamps: (r.stamps || []).length }));
  }
  function reconTable(r, sh) {
    const unpaid = evs().filter(e => e.dir === "out" && !e.paid && !e.void && sh && e.at >= sh.at).length;
    const rows = [["pk.rc.cash", "เงินสดที่รับ", money(r.cash)], ["pk.rc.pp", "พร้อมเพย์ (ตรวจกับแอปธนาคาร)", money(r.promptpay)], ["pk.rc.total", "รวมรับ", money(r.total)],
      ["pk.rc.float", "เงินทอนตั้งต้น", money(r.float)], ["pk.rc.expect", "เงินสดที่ควรมีในลิ้นชัก", money(r.expectedCash)], ["pk.rc.counted", "เงินสดที่นับได้", r.counted == null ? "—" : money(r.counted)],
      ["pk.rc.diff", "ส่วนต่าง", r.diff == null ? "—" : (r.diff > 0 ? "+" : "") + money(r.diff).replace("฿-", "-฿")], ["pk.rc.n", "จำนวนใบเสร็จ", String(r.n)], ["pk.rc.exempt", "ยกเว้น/ฟรี/รายเดือน", String(r.exempt)],
      ["pk.rc.stamps", "ตราประทับที่ใช้", String(r.stamps)], ["pk.rc.lost", "บัตรหาย/ไม่พบรถเข้า", String(r.lost)], ["pk.rc.unpaid", "รถออกที่ยังไม่ชำระ", String(unpaid)], ["pk.rc.open", "รถยังอยู่ในลาน", String(GR.occupancy(evs()).length)]];
    return `<div class="table-wrap"><table class="gk-table"><tbody>${rows.map(([k, th, v]) => `<tr${k === "pk.rc.diff" && r.diff ? ' class="bad"' : ""}><th>${esc(T(k, th))}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderShift() {
    const sh = C().shift;
    $("#pkShiftState").textContent = sh ? T("pk.sh.since", "เปิดกะตั้งแต่ {t} โดย {b}", { t: fmtTime(sh.at), b: sh.by }) : T("pk.sh.none", "ยังไม่ได้เปิดกะ");
    $("#pkShiftOpen").disabled = !!sh; $("#pkShiftClose").disabled = !sh; $("#pkFloat").disabled = !!sh;
    $("#pkRecon").innerHTML = sh ? reconTable(GR.reconcile(shiftPayments(), { float: sh.float, counted: $("#pkCounted").value }), sh) : "";
    $("#pkShiftList").innerHTML = store.list("shift").slice(-30).reverse().map(s => `<li>${esc(fmtTime(s.at))} – ${esc(fmtTime(s.closedAt))}: ${esc(T("pk.sh.sum", "รับ {t} · ส่วนต่าง {d}", { t: money(s.rep.total), d: s.rep.diff == null ? "—" : money(s.rep.diff) }))}</li>`).join("") || `<li>${esc(T("pk.sh.empty", "ยังไม่มีกะที่ปิด"))}</li>`;
  }
  $("#pkCounted").addEventListener("input", renderShift);
  $("#pkShiftOpen").addEventListener("click", () => { kit.setCfg({ shift: { id: kit.uid("sh-"), at: Date.now(), float: +$("#pkFloat").value || 0, by: kit.operator() } }); renderShift(); });
  $("#pkShiftClose").addEventListener("click", () => {
    const sh = C().shift; if (!sh) return;
    if ($("#pkCounted").value === "" && !confirm(T("pk.q.noCount", "ยังไม่ได้กรอกเงินสดที่นับได้ ปิดกะเลย?"))) return;
    const rep = GR.reconcile(shiftPayments(), { float: sh.float, counted: $("#pkCounted").value });
    store.put({ id: sh.id, kind: "shift", at: sh.at, closedAt: Date.now(), by: sh.by, float: sh.float, rep });
    kit.setCfg({ shift: null }); $("#pkCounted").value = ""; renderShift();
    kit.toast(T("pk.sh.closed", "ปิดกะแล้ว"));
  });
  $("#pkShiftPrint").addEventListener("click", () => printEl($("#pkShiftCard")));

  /* ---------- settings ---------- */
  function fillSettings() {
    const f = C().fees;
    $$("[data-fee]").forEach(i => { const k = i.dataset.fee; if (i.type === "checkbox") i.checked = !!f[k]; else i.value = f[k] == null ? "" : f[k]; });
    $("#pkSiteName").value = C().siteName || ""; $("#pkPpId").value = DEMO ? "" : C().ppId || ""; $("#pkPpId").disabled = DEMO;
    $("#pkCapacity").value = C().capacity || ""; $("#pkDir").value = C().laneDir || "both";
    kit.provinceOptions($("#pkMpProv"), C().common, "");
    renderLists();
  }
  $("#pkPpId").addEventListener("input", () => { const v = $("#pkPpId").value, m = $("#pkPpMsg"); m.textContent = !v ? "" : PP.validTarget(v) ? T("pk.pp.ok", "รูปแบบพร้อมเพย์ถูกต้อง") : T("pk.pp.bad", "ใช้เบอร์มือถือ 10 หลัก หรือเลขประจำตัวผู้เสียภาษี 13 หลัก"); m.dataset.kind = PP.validTarget(v) ? "ok" : "err"; });
  $("#pkSetSave").addEventListener("click", () => {
    const fees = { ...C().fees };
    $$("[data-fee]").forEach(i => { const k = i.dataset.fee; fees[k] = i.type === "checkbox" ? i.checked : i.type === "time" ? i.value : i.value === "" ? (k === "firstRate" ? null : 0) : Math.max(0, +i.value); });
    const ppId = DEMO ? "" : $("#pkPpId").value.replace(/[^0-9]/g, "");
    kit.setCfg({ fees, siteName: $("#pkSiteName").value.trim(), ppId: ppId && PP.validTarget(ppId) ? ppId : "", capacity: Math.max(0, +$("#pkCapacity").value || 0), laneDir: $("#pkDir").value });
    $("#pkSetMsg").textContent = T("pk.set.saved", "บันทึกแล้ว") + (ppId && !PP.validTarget(ppId) ? " · " + T("pk.pp.bad", "ใช้เบอร์มือถือ 10 หลัก หรือเลขประจำตัวผู้เสียภาษี 13 หลัก") : "");
    // the lane buttons follow the lane direction
    const act = $("#gkActions"); if (act) act.innerHTML = actions().map(a => `<button class="btn ${a.cls}" type="button" data-act="${a.id}" data-i18n="${a.key}">${esc(T(a.key, a.th))}</button>`).join("");
    fillSettings();
  });
  function renderLists() {
    $("#pkMpList").innerHTML = store.list("mpass").map(m => `<li>${kit.plateHTML(m.key)} ${esc(kit.provName(m.province))} · ${esc(T("pk.mp.to", "ถึง {d}", { d: new Date(m.until).toLocaleDateString() }))} <button class="btn ghost small" type="button" data-del="${esc(m.id)}">${esc(T("pk.del", "ลบ"))}</button></li>`).join("") || `<li>${esc(T("pk.mp.none", "ยังไม่มีบัตรรายเดือน"))}</li>`;
    $("#pkSpList").innerHTML = shopList().map(s => `<li><b lang="th" translate="no">${esc(s.id)} · ${esc(s.name)}</b> — ${esc(T("pk.sp.rule", "ฟรี {m} นาที ส่วนลด {d}", { m: s.freeMin, d: money(s.discount) }))}
      <button class="btn ghost small" type="button" data-codes="${esc(s.id)}">${esc(T("pk.sp.gen", "สร้างรหัส 20 ใบ"))}</button> <button class="btn ghost small" type="button" data-del="${esc("shop-" + s.id)}">${esc(T("pk.del", "ลบ"))}</button></li>`).join("") || `<li>${esc(T("pk.sp.none", "ยังไม่มีร้านค้า"))}</li>`;
  }
  $("#pkMpAdd").addEventListener("click", () => {
    const p = LP.parse($("#pkMpPlate").value); if (!p.ok) { kit.toast(T("gk.v.bad", "รูปแบบไม่ถูก: ตัวเลข (ถ้ามี) + อักษร 2 ตัว + เลข 1–4 หลัก"), "err"); return; }
    const until = $("#pkMpUntil").value ? new Date($("#pkMpUntil").value + "T23:59:59").getTime() : Date.now() + 31 * 86400000;
    store.put({ id: kit.uid("mp-"), kind: "mpass", at: Date.now(), key: p.key, province: $("#pkMpProv").value, until });
    $("#pkMpPlate").value = ""; renderLists();
  });
  $("#pkSpAdd").addEventListener("click", () => {
    const id = $("#pkSpId").value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (!id || !$("#pkSpName").value.trim()) { kit.toast(T("pk.sp.need", "ใส่รหัสร้านและชื่อร้าน"), "err"); return; }
    store.put({ id: "shop-" + id, kind: "shop", at: Date.now(), code: id, name: $("#pkSpName").value.trim(), freeMin: Math.max(0, +$("#pkSpMin").value || 0), discount: Math.max(0, +$("#pkSpDisc").value || 0), serial: 0, active: true });
    $("#pkSpId").value = ""; $("#pkSpName").value = ""; renderLists();
  });
  // shop records: store id "shop-<CODE>", .code = the shop code the stamp rules use as id
  const shopList = () => store.list("shop").map(s => ({ ...s, id: s.code }));
  document.addEventListener("click", e => {
    const t = /** @type {any} */ (e.target);
    const d = t.closest && t.closest("[data-del]");
    if (d) { store.del(d.dataset.del); renderLists(); return; }
    const c = t.closest && t.closest("[data-codes]");
    if (c) {
      const raw = store.get("shop-" + c.dataset.codes); if (!raw) return;
      const start = raw.serial || 0, codes = Array.from({ length: 20 }, (_, i) => GR.stampMake(C().stampSecret, raw.code, start + i));
      raw.serial = start + 20; store.put(raw);
      $("#pkCodesH").textContent = T("pk.sp.codesFor", "รหัสตราประทับของร้าน {s}", { s: raw.name });
      $("#pkCodeList").innerHTML = codes.map(x => `<li lang="th" translate="no">${esc(x)}</li>`).join("");
      $("#pkCodes").hidden = false; W.__LQ_PK.codes = codes;
    }
  });
  $("#pkCodesPrint").addEventListener("click", () => printEl($("#pkCodes")));
  W.__LQ_PK.shopList = shopList;
  kit.mountRetention($("#pkRetention"));
  kit.mountCheck($("#pkCheck"));

  store.ready.then(() => { fillSettings(); renderLot(); renderLog(); renderShift(); });
  window.addEventListener("lq-lang", () => { renderLot(); renderLog(); renderShift(); renderLists(); if (pay.exit) computeFee(); if (pay.lastRc && !$("#pkReceipt").hidden) showReceipt(pay.lastRc); });
})();
