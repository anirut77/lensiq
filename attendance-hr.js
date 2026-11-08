/* attendance-hr.js — employee time attendance on attendance.html (added on top of the training check-in; nothing removed).
   Mode switch "เช็คชื่ออบรม/กิจกรรม" (the original page, default) | "ลงเวลาทำงานพนักงาน" (this file):
     punches        face (attendance.js checkIn -> LQHR.facePunch), PIN, QR badge (scanner / BarcodeDetector) — PIN/QR is
                    also the non-biometric alternative for employees who decline face data (PDPA s.26)
     admin          employees + departments, shifts (grace, OT rules, night shifts), Thai holidays + leave, monthly summary
                    + payroll / daily / audit CSV, manager corrections (append-only, hash-chained audit log), kiosk mode,
                    multi-device file merge, time-record retention (>= 2 years, s.114) separate from face retention
   All maths lives in lensiq-timeclock.js (LQClock, unit-tested). Storage: this browser only (localStorage att-hr-*).
   Text: Thai defaults here, English / Chinese via LQI18N.tf("attendance.hr.<key>") in i18n/{en,zh}-attendance.js. */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), C = W.LQClock, Q = W.LQQR;
  if (!C) return;
  const $ = s => /** @type {any} */ (document.querySelector(s));
  const $all = s => /** @type {HTMLElement[]} */ ([...document.querySelectorAll(s)]);
  const CORE = () => W.__ATT_CORE || { people: [], ready: false, scanning: false, say: () => {}, video: null, isTest: false };
  const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m));
  /** @param {string} k @param {string} th @param {object} [v] */
  const T = (k, th, v) => (W.LQI18N && W.LQI18N.tf ? W.LQI18N.tf("attendance.hr." + k, th, v) : fill(th, v));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const U = s => `<span translate="no" data-i18n-skip>${esc(s)}</span>`; // user data: never machine-translated
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { msg("#hrDataMsg", T("full", "พื้นที่จัดเก็บเต็มหรือถูกบล็อก — ส่งออกไฟล์บันทึกเวลาเก็บไว้ก่อน"), "err"); return false; } };
  const rand = (n = 10) => C.newToken(n).toLowerCase().replace(/[^a-z0-9]/g, "x");
  const KEY = { set: "att-hr-settings", emps: "att-hr-emps", shifts: "att-hr-shifts", punches: "att-hr-punches", audit: "att-hr-audit", leave: "att-hr-leave", hol: "att-hr-holidays" };
  const MIN = C.MIN, now = () => Date.now(), today = () => C.dateKey(now());
  const hmm = m => (m < 0 ? "-" : "") + Math.floor(Math.abs(m) / 60) + ":" + String(Math.abs(m) % 60).padStart(2, "0");
  const msg = (sel, text, cls = "") => { const el = $(sel); if (el) { el.textContent = text; el.className = (el.classList.contains("scan-msg") ? "form-msg scan-msg " : "form-msg ") + cls; } };

  // ------------------------------------------------------------ state
  const S = Object.assign({ mode: "training", dev: "", devName: "", retYears: 2, mgrSalt: "", mgrHash: "", noticeSeen: false, kiosk: false, devs: {} }, load(KEY.set, {}));
  if (!/^d[a-z0-9]{8,24}$/.test(S.dev)) S.dev = "d" + rand(12);
  S.retYears = C.retentionYears(S.retYears);
  let emps = load(KEY.emps, []), punches = load(KEY.punches, []), audit = load(KEY.audit, []), leave = load(KEY.leave, []);
  let shifts = load(KEY.shifts, null), holidays = load(KEY.hol, null);
  const fresh = !Array.isArray(shifts) || !shifts.length;
  if (fresh) shifts = [{ id: "day", start: "08:00", end: "17:00" }, { id: "night", start: "20:00", end: "05:00" }].map(C.normShift);
  shifts = shifts.map(s => { try { return C.normShift(s); } catch { return null; } }).filter(Boolean);
  if (!Array.isArray(holidays)) holidays = C.thaiHolidays(new Date().getFullYear());
  if (!Array.isArray(emps)) emps = [];
  if (!Array.isArray(punches)) punches = [];
  if (!Array.isArray(audit)) audit = [];
  if (!Array.isArray(leave)) leave = [];
  const saveSet = () => save(KEY.set, S);
  saveSet();
  if (fresh) { save(KEY.shifts, shifts); save(KEY.hol, holidays); }

  // labels (literal keys: tests/unit/attendance-hr.test.js checks each has en + zh)
  const PT = () => ({ auto: T("pt.auto", "อัตโนมัติ (ครั้งแรก = เข้า ต่อไป = ออก)"), in: T("pt.in", "เข้างาน"), out: T("pt.out", "ออกงาน"), break_out: T("pt.break_out", "เริ่มพัก"), break_in: T("pt.break_in", "กลับจากพัก") });
  const MT = () => ({ face: T("m.face", "ใบหน้า"), pin: T("m.pin", "PIN"), qr: T("m.qr", "บัตร QR"), manual: T("m.manual", "แก้ไขโดยผู้จัดการ") });
  const LV = () => ({ sick: T("lv.sick", "ลาป่วย"), personal: T("lv.personal", "ลากิจ"), annual: T("lv.annual", "ลาพักร้อน"), maternity: T("lv.maternity", "ลาคลอด"), other: T("lv.other", "ลาอื่น ๆ") });
  const KIND = () => ({ work: T("k.work", "วันทำงาน"), holiday: T("k.holiday", "วันหยุดตามประเพณี"), off: T("k.off", "วันหยุดประจำสัปดาห์") });
  const ST = () => ({ present: T("st.present", "มาทำงาน"), absent: T("st.absent", "ขาดงาน (ให้ตรวจ)"), incomplete: T("st.incomplete", "ลงเวลาไม่ครบ (ให้ตรวจ)"), on_duty: T("st.on_duty", "กำลังทำงาน"),
    pending: T("st.pending", "ยังไม่ถึงเวลา"), leave: T("st.leave", "ลา"), holiday: T("k.holiday", "วันหยุดตามประเพณี"), off: T("k.off", "วันหยุดประจำสัปดาห์") });
  const FL = () => ({ late: T("f.late", "มาสาย"), early: T("f.early", "ออกก่อน"), ot: T("f.ot", "OT"), ot_pending: T("f.ot_pending", "OT รออนุมัติ"), missing_out: T("f.missing_out", "ไม่มีเวลาออก"),
    missing_in: T("f.missing_in", "ไม่มีเวลาเข้า"), missing_break_in: T("f.missing_break_in", "ไม่มีเวลากลับจากพัก"), long_break: T("f.long_break", "พักเกินเวลา"), holiday_work: T("f.holiday_work", "ทำงานวันหยุด"),
    rest_day_work: T("f.rest_day_work", "ทำงานวันหยุดประจำสัปดาห์"), holiday_ot: T("f.holiday_ot", "OT วันหยุด"), half_leave: T("f.half_leave", "ลาครึ่งวัน") });
  const ACT = () => ({ punch_add: T("a.punch_add", "เพิ่มเวลา"), punch_void: T("a.punch_void", "ยกเลิกเวลา"), punch_edit: T("a.punch_edit", "แก้เวลา"), leave_add: T("a.leave_add", "บันทึกการลา"),
    leave_remove: T("a.leave_remove", "ยกเลิกการลา"), ot_approve: T("a.ot_approve", "อนุมัติ OT"), holiday_add: T("a.holiday_add", "เพิ่มวันหยุด"), holiday_remove: T("a.holiday_remove", "ลบวันหยุด"),
    emp_add: T("a.emp_add", "เพิ่มพนักงาน"), emp_edit: T("a.emp_edit", "แก้ไขพนักงาน"), emp_remove: T("a.emp_remove", "ปิดการใช้งานพนักงาน"), shift_edit: T("a.shift_edit", "แก้ไขกะ"),
    settings: T("a.settings", "เปลี่ยนการตั้งค่า"), purge: T("a.purge", "ลบบันทึกที่เกินระยะเก็บ"), import: T("a.import", "นำเข้าไฟล์จากเครื่องอื่น") });
  const HOL = () => ({ newyear: T("h.newyear", "วันขึ้นปีใหม่"), makha: T("h.makha", "วันมาฆบูชา"), chakri: T("h.chakri", "วันจักรี"), songkran: T("h.songkran", "วันสงกรานต์"), labour: T("h.labour", "วันแรงงานแห่งชาติ"),
    coronation: T("h.coronation", "วันฉัตรมงคล"), visakha: T("h.visakha", "วันวิสาขบูชา"), queen: T("h.queen", "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี"), asalha: T("h.asalha", "วันอาสาฬหบูชา"),
    king: T("h.king", "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว"), mother: T("h.mother", "วันแม่แห่งชาติ"), rama9: T("h.rama9", "วันนวมินทรมหาราช"), chula: T("h.chula", "วันปิยมหาราช"),
    father: T("h.father", "วันพ่อแห่งชาติ"), constitution: T("h.constitution", "วันรัฐธรรมนูญ"), nye: T("h.nye", "วันสิ้นปี") });
  const WD = () => [T("wd0", "อา"), T("wd1", "จ"), T("wd2", "อ"), T("wd3", "พ"), T("wd4", "พฤ"), T("wd5", "ศ"), T("wd6", "ส")];
  const holName = h => (h.key && HOL()[h.key]) || h.name || "";
  const holHtml = h => (h.key && HOL()[h.key] ? esc(HOL()[h.key]) : U(h.name || ""));

  // ------------------------------------------------------------ helpers
  const live = () => emps.filter(e => !e.removed);
  const empById = id => emps.find(e => e.id === id);
  const empByCode = code => live().find(e => e.code === code);
  const shiftOf = e => shifts.find(s => s.id === (e && e.shift)) || shifts[0];
  const effective = () => C.applyCorrections(punches, audit);
  const who = () => String(($("#hrBy") || {}).value || "").trim();
  const mgrOk = () => !S.mgrHash || C.pinHash(String(($("#hrMgrPinIn") || {}).value || ""), S.mgrSalt) === S.mgrHash;
  /** checks who + manager PIN; returns an error text or "" */
  function authErr() {
    if (!who()) { const el = $("#hrBy"); if (el) { el.classList.add("invalid"); el.focus(); } return T("needBy", "กรุณากรอกชื่อผู้ดูแลที่ทำรายการด้านบนก่อน"); }
    if (!mgrOk()) return T("badMgr", "PIN ผู้จัดการไม่ถูกต้อง");
    return "";
  }
  function addAudit(e) {
    const x = C.auditEntry(audit, Object.assign({ by: who() || "admin" }, e), S.dev, now());
    audit.push(x); save(KEY.audit, audit); return x;
  }
  const download = (name, text, type = "text/csv;charset=utf-8") => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const optList = (list, sel, first) => (first ? `<option value="">${esc(first)}</option>` : "") + list.map(([v, t]) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(t)}</option>`).join("");
  const depts = () => [...new Set(live().map(e => e.dept).filter(Boolean))].sort();

  // ------------------------------------------------------------ punching
  const lock = C.createLock({ max: 5, lockMs: 60000 }), kioskLock = C.createLock({ max: 15, lockMs: 120000 });
  function doPunch(e, method) {
    const ts = now(), sh = shiftOf(e), eff = effective(), time = C.clock(ts);
    const acc = C.acceptPunch(eff, e.id, ts, { gapMs: 60000, dev: S.dev });
    if (!acc.ok) { const t = T("dup", "{name} ลงเวลาแล้วเมื่อ {time}", { name: e.name, time: C.clock(acc.last.ts) }); return { kind: "dup", text: t, msg: t, time }; }
    const type = ($("#hrType") || {}).value || "auto", meaning = type === "auto" ? C.autoMeaning(eff, e.id, ts, sh) : type;
    punches.push({ id: S.dev + "-" + ts.toString(36) + rand(3), emp: e.id, ts, type, method, dev: S.dev });
    if (!save(KEY.punches, punches)) { punches.pop(); const t = T("saveFail", "บันทึกเวลาไม่สำเร็จ"); return { kind: "err", text: t, msg: t }; }
    let extra = "";
    if (meaning === "in") {
      const d = C.shiftDateOf(ts, sh), late = Math.floor((ts - C.shiftWindow(sh, d).start) / MIN);
      if (late > sh.graceLate && C.dayKind(sh, d, C.holidayMap(holidays, sh.days)) === "work") extra = T("lateN", " · สาย {n} นาที (ให้ผู้จัดการตรวจ)", { n: late });
    }
    if (acc.clockBack) extra += T("clockBack", " · นาฬิกาเครื่องนี้ย้อนหลังกว่าการลงเวลาครั้งก่อน กรุณาตรวจเวลาเครื่อง");
    const t = T("okP", "✓ {name}: {what} {time}", { name: e.name, what: PT()[meaning], time }) + extra;
    renderToday();
    return { kind: "ok", text: t, msg: t, time };
  }
  /** called by attendance.js checkIn() in employee mode */
  function facePunch(p) {
    const e = empByCode(p.code);
    if (!e) { const t = T("noEmp", "{name} ยังไม่ได้เพิ่มเป็นพนักงาน (จัดการเวลาทำงาน › พนักงาน)", { name: p.name }); return { kind: "err", text: t, msg: t }; }
    if (e.noFace) { const t = T("optOut", "{name} เลือกไม่ใช้ใบหน้า — ลงเวลาด้วย PIN หรือบัตร QR", { name: e.name }); return { kind: "err", text: t, msg: t }; }
    return doPunch(e, "face");
  }
  function showPunch(r) { msg("#hrPunchMsg", r.msg || r.text, r.kind === "ok" ? "ok" : r.kind === "dup" ? "warn" : "err"); CORE().say(r.msg || r.text, r.kind === "ok" ? "ok" : r.kind === "dup" ? "warn" : "err"); }
  $("#hrPinForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const code = $("#hrCode").value.trim(), pin = $("#hrPin").value, k = "c:" + code;
    const left = lock.locked(k) || kioskLock.locked("all");
    if (left) return msg("#hrPunchMsg", T("locked", "ใส่ PIN ผิดหลายครั้ง ลองใหม่ใน {s} วินาที", { s: Math.ceil(left / 1000) }), "err");
    const e = empByCode(code);
    if (!code || !C.validPin(pin) || !e || !e.pinHash || C.pinHash(pin, e.pinSalt) !== e.pinHash) {
      lock.fail(k); kioskLock.fail("all"); $("#hrPin").value = "";
      return msg("#hrPunchMsg", T("badPin", "รหัสพนักงานหรือ PIN ไม่ถูกต้อง"), "err");
    }
    lock.ok(k); $("#hrPin").value = ""; $("#hrCode").value = "";
    showPunch(doPunch(e, "pin"));
  });
  function handleQr(text) {
    const q = C.parseQr(text), e = q && empByCode(q.code);
    if (!e || !e.qr || e.qr !== q.token) return msg("#hrPunchMsg", T("badQr", "บัตร QR ไม่ถูกต้องหรือถูกยกเลิกแล้ว"), "err");
    showPunch(doPunch(e, "qr"));
  }
  $("#hrQr").addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); const v = ev.target.value; ev.target.value = ""; if (v.trim()) handleQr(v); } });
  // camera QR scan: BarcodeDetector (Chrome / Android / macOS) on the page's camera; test mode reads window.__LQ_FAKE_QR()
  let qrTimer = 0, qrDet = null;
  if ("BarcodeDetector" in W || CORE().isTest) $("#hrQrCam").hidden = false;
  $("#hrQrCam").addEventListener("click", () => {
    if (qrTimer) { clearInterval(qrTimer); qrTimer = 0; $("#hrQrCam").textContent = T("qrCam", "สแกนบัตร QR ด้วยกล้อง"); return; }
    if (!CORE().ready) return msg("#hrPunchMsg", T("camNo", "กล้องยังไม่พร้อม"), "err");
    try { if (!CORE().isTest) qrDet = new W.BarcodeDetector({ formats: ["qr_code"] }); } catch { return msg("#hrPunchMsg", T("qrNo", "เบราว์เซอร์นี้สแกน QR ด้วยกล้องไม่ได้ — ใช้เครื่องอ่านบัตรหรือ PIN"), "err"); }
    $("#hrQrCam").textContent = T("qrStop", "หยุดสแกน QR");
    msg("#hrPunchMsg", T("qrShow", "ยกบัตร QR ให้กล้องเห็น"), "");
    let busy = false, lastText = "", lastAt = 0;
    qrTimer = W.setInterval(async () => {
      if (busy) return; busy = true;
      try {
        let v = "";
        if (CORE().isTest) v = typeof W.__LQ_FAKE_QR === "function" ? String(W.__LQ_FAKE_QR() || "") : "";
        else { const r = await qrDet.detect(CORE().video); v = r && r[0] ? r[0].rawValue : ""; }
        if (v && (v !== lastText || now() - lastAt > 5000)) { lastText = v; lastAt = now(); handleQr(v); }
      } catch { /* frame not ready */ }
      busy = false;
    }, 400);
  });
  function renderToday() {
    const d = today(), list = effective().filter(p => C.dateKey(p.ts) === d).reverse(), pt = PT(), mt = MT();
    $("#hrTodayN").textContent = list.length;
    $("#hrToday").innerHTML = list.slice(0, 60).map(p => { const e = empById(p.emp) || { name: "?", code: "" };
      return `<li><span>${U(e.name)} <small>${U(e.code)}</small></span><small>${esc(C.clock(p.ts))} · ${esc(pt[p.type] && p.type !== "auto" ? pt[p.type] : T("pt.scan", "ลงเวลา"))} · ${esc(mt[p.method] || p.method)}</small></li>`; }).join("");
  }

  // ------------------------------------------------------------ mode / kiosk / clock
  function setMode(m, first) {
    S.mode = m === "employee" ? "employee" : "training"; saveSet();
    document.body.classList.toggle("att-emp", S.mode === "employee");
    $all(".mode-btn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === S.mode)));
    if (S.mode !== "employee") { if (S.kiosk) exitKiosk(); const t = $("#tabPin"); if (t && t.classList.contains("active")) $('.tab[data-t="checkin"]').click(); }
    else if (!S.noticeSeen) { $("#hrNotice").open = true; S.noticeSeen = true; saveSet(); }
    if (!first) renderAll();
  }
  $all(".mode-btn").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  function enterKiosk(gesture) {
    S.kiosk = true; saveSet(); document.body.classList.add("att-kiosk");
    $("#hrKiosk").firstElementChild.textContent = T("kexB", "ออกจากคิออสก์");
    $('.tab[data-t="checkin"]').click(); $("#pane-pin").hidden = false;
    if (gesture && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    // start the face scan as soon as the camera + models are ready (a kiosk restored after a reload starts by itself)
    let n = 0;
    const t = setInterval(() => {
      const c = CORE();
      if (++n > 120 || !S.kiosk) return clearInterval(t);
      if (c.ready) { clearInterval(t); if (c.people.length && !c.scanning) $("#startScan").click(); }
    }, 500);
  }
  function exitKiosk() {
    S.kiosk = false; saveSet(); document.body.classList.remove("att-kiosk"); $("#hrKioskExit").hidden = true;
    $("#pane-pin").hidden = !$("#tabPin").classList.contains("active");
    $("#hrKiosk").firstElementChild.textContent = T("kiosk", "โหมดคิออสก์");
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  $("#hrKiosk").addEventListener("click", () => {
    if (!S.kiosk) return enterKiosk(true);
    if (!S.mgrHash) return exitKiosk();
    $("#hrKioskExit").hidden = false; $("#hrKioskPin").focus();
  });
  $("#hrKioskExit").addEventListener("submit", ev => {
    ev.preventDefault();
    const left = kioskLock.locked("exit"); if (left) return msg("#hrKioskMsg", T("locked", "ใส่ PIN ผิดหลายครั้ง ลองใหม่ใน {s} วินาที", { s: Math.ceil(left / 1000) }), "err");
    if (C.pinHash($("#hrKioskPin").value, S.mgrSalt) !== S.mgrHash) { kioskLock.fail("exit"); $("#hrKioskPin").value = ""; return msg("#hrKioskMsg", T("badMgr", "PIN ผู้จัดการไม่ถูกต้อง"), "err"); }
    $("#hrKioskPin").value = ""; msg("#hrKioskMsg", ""); exitKiosk();
  });
  function tick() { const t = now(), d = C.dateKey(t); $("#hrClock").textContent = C.clock(t); $("#hrDate").textContent = d + " · " + WD()[C.weekday(d)]; }
  tick(); setInterval(tick, 1000);
  // PIN tab pane (attendance.js hides the other panes; this one is ours)
  $all(".tab").forEach(t => t.addEventListener("click", () => { $("#pane-pin").hidden = t.dataset.t !== "pin"; }));

  // ------------------------------------------------------------ admin tabs
  let hTab = "emp";
  $all(".hr-tab").forEach(b => b.addEventListener("click", () => {
    hTab = b.dataset.h;
    $all(".hr-tab").forEach(x => { x.classList.toggle("active", x === b); x.setAttribute("aria-selected", String(x === b)); });
    $all(".hr-pane").forEach(p => { p.hidden = p.id !== "hr-" + hTab; });
    renderAll();
  }));
  $("#hrBy").value = (() => { try { return sessionStorage.getItem("att-hr-by") || ""; } catch { return ""; } })();
  $("#hrBy").addEventListener("input", () => { $("#hrBy").classList.remove("invalid"); try { sessionStorage.setItem("att-hr-by", who()); } catch {} });

  // ---- employees
  let editId = null;
  function faceState(e) {
    if (e.noFace) return T("noFaceS", "ไม่ใช้ใบหน้า");
    return CORE().people.some(p => p.code === e.code && Array.isArray(p.descriptor)) ? T("faceOk", "ใบหน้า ✓") : T("faceNo", "ยังไม่ลงทะเบียนใบหน้า");
  }
  function renderEmps() {
    const f = $("#hrDeptE").value, ds = depts();
    $("#hrDeptE").innerHTML = optList(ds.map(d => [d, d]), f, T("allDept", "ทุกแผนก"));
    $("#hrDeptList").innerHTML = ds.map(d => `<option value="${esc(d)}"></option>`).join("");
    $("#hrEmpShift").innerHTML = optList(shifts.map(s => [s.id, s.name]), $("#hrEmpShift").value || shifts[0].id);
    const rows = live().filter(e => !f || e.dept === f);
    $("#hrEmpBody").innerHTML = rows.map(e => `<tr><td>${U(e.code)}</td><td>${U(e.name)}</td><td>${U(e.dept || "")}</td><td>${U(shiftOf(e).name)}</td><td>${esc([faceState(e), e.pinHash ? "PIN ✓" : "", e.qr ? "QR ✓" : ""].filter(Boolean).join(" · "))}</td>
      <td class="hr-btns"><button type="button" class="btn ghost small" data-edit="${esc(e.id)}">${esc(T("edit", "แก้ไข"))}</button><button type="button" class="btn ghost small" data-badge="${esc(e.id)}">${esc(T("badge", "บัตร QR"))}</button><button type="button" class="btn ghost small danger" data-off="${esc(e.id)}">${esc(T("off", "ปิดการใช้งาน"))}</button></td></tr>`).join("")
      || `<tr><td colspan="6">${esc(T("noEmps", "ยังไม่มีพนักงาน เพิ่มด้วยฟอร์มด้านบน"))}</td></tr>`;
  }
  $("#hrDeptE").addEventListener("change", renderEmps);
  function resetEmpForm() { editId = null; const f = $("#hrEmpForm"); f.reset(); f.code.disabled = false; $("#hrEmpSave").textContent = T("empSave", "บันทึกพนักงาน"); }
  $("#hrEmpNew").addEventListener("click", () => { resetEmpForm(); msg("#hrEmpMsg", ""); });
  $("#hrEmpForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, code = f.code.value.trim(), name = f.name.value.trim(), dept = f.dept.value.trim(), pin = f.pin.value;
    if (!code || !name) return msg("#hrEmpMsg", T("needCodeName", "กรุณากรอกรหัสและชื่อ"), "err");
    if (/[\u0000-\u001f<>]/.test(code)) return msg("#hrEmpMsg", T("badCode", "รหัสมีอักขระที่ใช้ไม่ได้"), "err");
    if (pin && !C.validPin(pin)) return msg("#hrEmpMsg", T("pinRule", "PIN ต้องเป็นตัวเลข 4–8 หลัก"), "err");
    const dup = emps.find(e => e.code === code && e.id !== editId && !e.removed);
    if (dup) return msg("#hrEmpMsg", T("dupCode", "รหัสนี้มีพนักงานแล้ว"), "err");
    const old = editId ? empById(editId) : null, before = old ? { code: old.code, name: old.name, dept: old.dept, shift: old.shift, noFace: !!old.noFace } : null;
    const e = old || { id: "e" + rand(10), code, created: now(), qr: C.newToken(20) };
    const newShift = f.shift.value || shifts[0].id, from = old && C.isDate(f.shiftFrom.value) ? f.shiftFrom.value : old ? today() : "2000-01-01";
    const changed = !old || old.shift !== newShift;
    if (changed) {
      // earlier days stay on the old shift (C.monthSummary reads e.shiftHist); the new assignment replaces any later ones
      const hist = Array.isArray(e.shiftHist) && e.shiftHist.length ? e.shiftHist : old ? [{ from: "2000-01-01", shift: old.shift }] : [];
      e.shiftHist = hist.filter(h => h.from < from).concat([{ from, shift: newShift }]);
    }
    Object.assign(e, { name, dept, shift: newShift, noFace: f.noFace.checked });
    if (pin) { e.pinSalt = C.newToken(16); e.pinHash = C.pinHash(pin, e.pinSalt); }
    if (!old) emps.push(e);
    save(KEY.emps, emps);
    addAudit({ action: old ? "emp_edit" : "emp_add", emp: e.id, before, after: { code: e.code, name, dept, shift: e.shift, shiftFrom: changed ? from : undefined, noFace: e.noFace, pin: pin ? "set" : old && old.pinHash ? "kept" : "none" }, reason: "" });
    const faceToo = e.noFace && CORE().people.some(p => p.code === e.code);
    resetEmpForm(); renderAll();
    msg("#hrEmpMsg", T("empSaved", "บันทึก {name} แล้ว", { name }) + (old && changed ? T("shiftFromN", " · กะใหม่มีผลตั้งแต่ {d} (วันก่อนหน้าคิดตามกะเดิม)", { d: from }) : "") + (faceToo ? T("delFace", " · พนักงานเลือกไม่ใช้ใบหน้า: ลบข้อมูลใบหน้าของรหัสนี้ที่แท็บลงทะเบียนใบหน้า") : ""), faceToo ? "warn" : "ok");
  });
  $("#hrEmpBody").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    const e = empById(b.dataset.edit || b.dataset.badge || b.dataset.off); if (!e) return;
    if (b.dataset.edit) {
      editId = e.id; const f = $("#hrEmpForm");
      f.code.value = e.code; f.code.disabled = true; f.name.value = e.name; f.dept.value = e.dept || ""; f.shift.value = e.shift; f.noFace.checked = !!e.noFace; f.pin.value = "";
      $("#hrEmpSave").textContent = T("empUpd", "บันทึกการแก้ไข"); f.name.focus();
    } else if (b.dataset.badge) showBadge(e);
    else if (confirm(T("offQ", "ปิดการใช้งาน {name}? บันทึกเวลาที่มีอยู่ยังเก็บไว้ตามระยะเก็บ", { name: e.name }))) {
      e.removed = now(); save(KEY.emps, emps); addAudit({ action: "emp_remove", emp: e.id, before: { code: e.code, name: e.name }, after: null, reason: "" }); renderAll();
    }
  });
  function showBadge(e) {
    const box = $("#hrBadge");
    if (!e.qr) { e.qr = C.newToken(20); save(KEY.emps, emps); }
    let svg = ""; try { svg = Q ? Q.svg(C.qrPayload(e.code, e.qr), { scale: 5, label: "QR " + e.code }) : ""; } catch { svg = ""; }
    box.innerHTML = `<div class="badge-card">${svg}<b>${U(e.name)}</b><span>${U(e.code)}</span><small>${U(e.dept || "")}</small></div>
      <div class="hr-actions"><button type="button" class="btn primary" data-print>${esc(T("print", "พิมพ์บัตร"))}</button><button type="button" class="btn ghost" data-renew>${esc(T("renew", "ออกบัตรใหม่ (บัตรเดิมใช้ไม่ได้)"))}</button><button type="button" class="btn ghost" data-close>${esc(T("close", "ปิด"))}</button></div>
      <p class="hint">${esc(T("badgeHint", "บัตรนี้ใช้แทนใบหน้าได้ เก็บให้ดีเหมือนกุญแจ หากหายให้กด ออกบัตรใหม่"))}</p>`;
    box.hidden = false; box.dataset.emp = e.id;
  }
  $("#hrBadge").addEventListener("click", ev => {
    const b = ev.target.closest("button"), box = $("#hrBadge"), e = empById(box.dataset.emp); if (!b || !e) return;
    if (b.hasAttribute("data-close")) { box.hidden = true; box.innerHTML = ""; }
    else if (b.hasAttribute("data-print")) { document.body.classList.add("att-print-badge"); W.print(); setTimeout(() => document.body.classList.remove("att-print-badge"), 500); }
    else if (b.hasAttribute("data-renew")) { e.qr = C.newToken(20); save(KEY.emps, emps); addAudit({ action: "emp_edit", emp: e.id, before: { qr: "old" }, after: { qr: "renewed" }, reason: "" }); showBadge(e); }
  });

  // ---- shifts
  let shiftSel = shifts[0].id;
  function renderShifts() {
    if (!shifts.some(s => s.id === shiftSel)) shiftSel = shifts[0].id;
    $("#hrShiftPick").innerHTML = optList(shifts.map(s => [s.id, s.name + (C.crossesMidnight(s) ? " ☾" : "")]), shiftSel);
    const s = shifts.find(x => x.id === shiftSel), f = $("#hrShiftForm");
    for (const k of ["name", "start", "end", "breakMin", "graceLate", "graceEarly", "otMinMin", "otRound", "otStartAfter"]) f[k].value = s[k];
    f.otApproval.checked = s.otApproval;
    const wd = WD();
    $("#hrDays").innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `<label class="check"><input type="checkbox" value="${d}"${s.days.includes(d) ? " checked" : ""}> <span>${esc(wd[d])}</span></label>`).join("");
  }
  $("#hrShiftPick").addEventListener("change", ev => { shiftSel = ev.target.value; renderShifts(); });
  $("#hrShiftAdd").addEventListener("click", () => { const s = C.normShift({ id: "s" + rand(8), start: "09:00", end: "18:00" }); shifts.push(s); save(KEY.shifts, shifts); shiftSel = s.id; renderShifts(); msg("#hrShiftMsg", T("shiftNew", "เพิ่มกะใหม่แล้ว แก้ไขแล้วกดบันทึก"), "ok"); });
  $("#hrShiftForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, i = shifts.findIndex(s => s.id === shiftSel); if (i < 0) return;
    const raw = { id: shiftSel, name: f.name.value.trim() || f.start.value + "–" + f.end.value, start: f.start.value, end: f.end.value, otApproval: f.otApproval.checked,
      days: [...$("#hrDays").querySelectorAll("input:checked")].map(x => +(/** @type {HTMLInputElement} */ (x)).value) };
    for (const k of ["breakMin", "graceLate", "graceEarly", "otMinMin", "otRound", "otStartAfter"]) raw[k] = f[k].value === "" ? undefined : +f[k].value;
    let s; try { s = C.normShift(raw); } catch { return msg("#hrShiftMsg", T("shiftBad", "เวลาเข้า/ออกไม่ถูกต้อง"), "err"); }
    if (!s.days.length) return msg("#hrShiftMsg", T("shiftNoDays", "เลือกวันทำงานอย่างน้อย 1 วัน"), "err");
    const before = shifts[i]; shifts[i] = s; save(KEY.shifts, shifts);
    addAudit({ action: "shift_edit", target: s.id, before, after: s, reason: "" });
    renderAll(); msg("#hrShiftMsg", T("shiftSaved", "บันทึกกะ {name} แล้ว", { name: s.name }) + (C.crossesMidnight(s) ? T("night", " (ข้ามเที่ยงคืน: นับเป็นวันที่เริ่มกะ)") : ""), "ok");
  });

  // ---- holidays + leave
  const Y0 = new Date().getFullYear();
  let year = Y0;
  function renderCal() {
    $("#hrYear").innerHTML = [Y0 - 1, Y0, Y0 + 1].map(y => `<option value="${y}"${y === year ? " selected" : ""}>${y} (${esc(T("be", "พ.ศ. {y}", { y: y + 543 }))})</option>`).join("");
    const list = holidays.filter(h => h.date.startsWith(year + "-")).sort((a, b) => a.date.localeCompare(b.date)), wd = WD();
    $("#hrHolBody").innerHTML = list.map(h => `<tr><td>${esc(h.date)} ${esc(wd[C.weekday(h.date)])}</td><td>${holHtml(h)}</td><td><button type="button" class="btn ghost small danger" data-hdel="${esc(h.date)}">${esc(T("del", "ลบ"))}</button></td></tr>`).join("")
      || `<tr><td colspan="3">${esc(T("noHol", "ยังไม่มีวันหยุดในปีนี้"))}</td></tr>`;
    const subs = [...C.holidayMap(list, shifts[0].days).values()].filter(h => h.sub);
    const notes = [T("holCount", "ปี {y} มีวันหยุด {n} วัน (กฎหมายกำหนดอย่างน้อย 13 วัน รวมวันแรงงานแห่งชาติ ม.29)", { y: year, n: list.length })];
    if (list.length < 13) notes.push(T("holFew", "น้อยกว่า 13 วัน — ตรวจประกาศวันหยุดของบริษัท"));
    if (!list.some(h => h.date === year + "-05-01")) notes.push(T("holLabour", "ยังไม่มีวันแรงงาน (1 พ.ค.)"));
    if (!C.hasLunar(year)) notes.push(T("holLunar", "วันมาฆบูชา วิสาขบูชา และอาสาฬหบูชาของปีนี้ยังไม่อยู่ในรายการ (ตามปฏิทินจันทรคติ) — เพิ่มเองตามประกาศ"));
    if (subs.length) notes.push(T("holSub", "วันหยุดชดเชยของกะแรก: {list}", { list: subs.map(h => h.date + " ← " + h.sub).join(", ") }));
    notes.push(T("holCheck", "ตรวจทุกวันกับประกาศวันหยุดประจำปีของบริษัทก่อนใช้คำนวณเงินเดือน"));
    $("#hrHolNote").textContent = notes.join(" · ");
    // leave
    $("#hrLeaveEmp").innerHTML = optList(live().map(e => [e.id, e.code + " " + e.name]), $("#hrLeaveEmp").value);
    const lv = LV(), ll = leave.filter(l => l.date.startsWith(year + "-")).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
    $("#hrLeaveBody").innerHTML = ll.map(l => { const e = empById(l.emp) || { code: "?", name: "" };
      return `<tr class="${l.removed ? "hr-void" : ""}"><td>${esc(l.date)}</td><td>${U(e.code + " " + e.name)}</td><td>${esc(lv[l.type] || l.type)}${l.part < 1 ? " ½" : ""}</td><td>${U(l.reason || "")}</td><td>${l.removed ? esc(T("cancelled", "ยกเลิกแล้ว")) : `<button type="button" class="btn ghost small danger" data-ldel="${esc(l.id)}">${esc(T("cancel", "ยกเลิก"))}</button>`}</td></tr>`; }).join("")
      || `<tr><td colspan="5">${esc(T("noLeave", "ยังไม่มีการลาในปีนี้"))}</td></tr>`;
    const use = C.leaveUsage(leave, year), ref = C.LEAVE_REF, cell = (n, r) => `<td${r && n > r ? ' class="hr-bad"' : ""}>${n}${r ? " / " + r : ""}</td>`;
    $("#hrLeaveUse").innerHTML = live().filter(e => use.has(e.id)).map(e => { const u = use.get(e.id);
      return `<tr><td>${U(e.code + " " + e.name)}</td>${cell(u.sick, ref.sick)}${cell(u.personal, ref.personal)}${cell(u.annual, ref.annual)}${cell(u.maternity)}${cell(u.other)}</tr>`; }).join("")
      || `<tr><td colspan="6">${esc(T("noLeave", "ยังไม่มีการลาในปีนี้"))}</td></tr>`;
  }
  $("#hrYear").addEventListener("change", ev => { year = +ev.target.value; renderCal(); });
  $("#hrHolDefault").addEventListener("click", () => {
    const have = new Set(holidays.map(h => h.date)), add = C.thaiHolidays(year).filter(h => !have.has(h.date));
    holidays.push(...add); save(KEY.hol, holidays);
    if (add.length) addAudit({ action: "holiday_add", before: null, after: { year, n: add.length }, reason: "" });
    renderCal();
  });
  $("#hrHolForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, date = f.date.value, name = f.name.value.trim();
    if (!C.isDate(date) || !name) return;
    holidays = holidays.filter(h => h.date !== date).concat([{ date, name }]); save(KEY.hol, holidays);
    addAudit({ action: "holiday_add", before: null, after: { date, name }, reason: "" });
    year = +date.slice(0, 4); f.reset(); renderAll();
  });
  $("#hrHolBody").addEventListener("click", ev => {
    const b = ev.target.closest("[data-hdel]"); if (!b) return;
    const h = holidays.find(x => x.date === b.dataset.hdel); if (!h) return;
    holidays = holidays.filter(x => x !== h); save(KEY.hol, holidays);
    addAudit({ action: "holiday_remove", before: { date: h.date, name: holName(h) }, after: null, reason: "" }); renderAll();
  });
  $("#hrLeaveForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, e = empById(f.emp.value), from = f.from.value, to = f.to.value || from;
    if (!e) return msg("#hrLeaveMsg", T("pickEmp", "เลือกพนักงาน"), "err");
    if (!C.isDate(from) || !C.isDate(to) || to < from) return msg("#hrLeaveMsg", T("badRange", "ช่วงวันที่ไม่ถูกต้อง"), "err");
    const err = authErr(); if (err) return msg("#hrLeaveMsg", err, "err");
    const type = f.type.value, part = f.half.checked ? 0.5 : 1, reason = f.reason.value.trim() || LV()[type];
    let n = 0;
    for (let d = from; d <= to && n < 62; d = C.addDays(d, 1), n++) {
      const l = { id: "l" + rand(10), emp: e.id, date: d, type, part, reason, at: now() };
      leave.push(l); addAudit({ action: "leave_add", emp: e.id, target: l.id, before: null, after: { date: d, type, part }, reason });
    }
    save(KEY.leave, leave); f.reset(); renderAll();
    msg("#hrLeaveMsg", T("leaveSaved", "บันทึกการลา {n} วันของ {name} แล้ว (นับเฉพาะวันทำงานของกะ)", { n, name: e.name }), "ok");
  });
  $("#hrLeaveBody").addEventListener("click", ev => {
    const b = ev.target.closest("[data-ldel]"); if (!b) return;
    const l = leave.find(x => x.id === b.dataset.ldel); if (!l) return;
    const err = authErr(); if (err) return msg("#hrLeaveMsg", err, "err");
    l.removed = now(); save(KEY.leave, leave);
    addAudit({ action: "leave_remove", emp: l.emp, target: l.id, before: { date: l.date, type: l.type, part: l.part }, after: null, reason: T("a.leave_remove", "ยกเลิกการลา") });
    renderAll();
  });

  // ---- monthly summary / payroll
  const month = () => $("#hrMonth").value || today().slice(0, 7);
  function summary() {
    const s = C.monthSummary({ emps, shifts, punches, audit, leave, holidays, month: month(), dept: $("#hrDeptM").value || "" });
    s.rows = s.rows.filter(r => { const e = empById(r.emp); return !e.removed || r.daysWorked || r.leaveDays; });
    return s;
  }
  let dayEmp = null;
  function renderMonth() {
    const f = $("#hrDeptM").value;
    $("#hrDeptM").innerHTML = optList(depts().map(d => [d, d]), f, T("allDept", "ทุกแผนก"));
    const s = summary();
    $("#hrSumBody").innerHTML = s.rows.map(r => `<tr${r.weekOtOver.length || r.weekNormalOver.length ? ' class="hr-flag"' : ""}><td>${U(r.code)}</td><td>${U(r.name)}</td><td>${U(r.dept)}</td><td>${r.daysWorked}/${r.scheduled}</td><td>${r.lateCount} · ${r.lateMin}</td><td>${r.earlyMin}</td>
      <td>${hmm(r.otMin)}${r.otPendingMin ? ` <small>(+${hmm(r.otPendingMin)} ${esc(T("f.ot_pending", "OT รออนุมัติ"))})</small>` : ""}</td><td>${hmm(r.holidayMin + r.holidayOtMin)}</td><td>${r.leaveDays}</td><td>${r.absentDays}</td><td>${r.incompleteDays}</td><td>${r.corrections}</td>
      <td><button type="button" class="btn ghost small" data-day="${esc(r.emp)}">${esc(T("daily", "ดูรายวัน"))}</button></td></tr>`).join("")
      || `<tr><td colspan="13">${esc(T("noRows", "ยังไม่มีข้อมูลในเดือนนี้"))}</td></tr>`;
    const over = s.rows.filter(r => r.weekOtOver.length);
    $("#hrMonthNote").textContent = [T("sumNote", "สรุปจากบันทึกเวลาในเครื่องนี้และไฟล์ที่นำเข้า · รายการ \"ให้ตรวจ\" เป็นข้อสังเกตให้ผู้จัดการตรวจ ไม่ใช่การตัดสิน — ตรวจและแก้ไขก่อนส่งเงินเดือน"),
      over.length ? T("otOver", "OT รวมเกิน 36 ชม./สัปดาห์ (ให้ตรวจ): {n} คน", { n: over.length }) : "",
      s.rows.some(r => r.weekNormalOver.length) ? T("normOver", "ชั่วโมงทำงานปกติเกิน 48 ชม./สัปดาห์ (ให้ตรวจ): {n} คน", { n: s.rows.filter(r => r.weekNormalOver.length).length }) : ""].filter(Boolean).join(" · ");
    if (dayEmp && s.days.has(dayEmp)) renderDays(s); else $("#hrDayBox").hidden = true;
  }
  function renderDays(s) {
    const e = empById(dayEmp), list = s.days.get(dayEmp), K = KIND(), stt = ST(), fl = FL(), wd = WD();
    $("#hrDayH").innerHTML = U(e.code + " " + e.name) + " · " + esc(month());
    $("#hrDayBody").innerHTML = list.map(d => {
      const out = d.out == null ? "" : C.clock(d.out) + (C.dateKey(d.out) !== d.date ? " (+1)" : "");
      const notes = [stt[d.status] || d.status, ...d.flags.map(x => fl[x] || x), d.leave ? (LV()[d.leave.type] + (d.leave.part < 1 ? " ½" : "")) : "", d.corrected ? T("fixedN", "แก้ไข {n} รายการ", { n: d.corrected }) : ""].filter(Boolean);
      const cls = d.status === "absent" || d.status === "incomplete" || d.flags.some(x => x === "late" || x === "early" || x === "long_break") ? "hr-flag" : d.kind !== "work" ? "hr-off" : "";
      return `<tr class="${cls}"><td>${esc(d.date)} ${esc(wd[C.weekday(d.date)])}</td><td>${esc(K[d.kind])}</td><td>${d.in == null ? "" : esc(C.clock(d.in))}</td><td>${esc(out)}</td><td>${d.workedMin ? hmm(d.workedMin) : ""}</td><td>${d.lateMin || ""}</td><td>${d.earlyMin || ""}</td>
        <td>${d.otMin || d.holidayOtMin ? hmm(d.otMin + d.holidayOtMin) : d.otPending ? `<small>${hmm(d.otRawMin)}?</small>` : ""}</td><td>${esc(notes.join(" · "))}</td>
        <td>${d.otPending ? `<button type="button" class="btn ghost small" data-otok="${esc(d.date)}">${esc(T("a.ot_approve", "อนุมัติ OT"))}</button>` : ""}<button type="button" class="btn ghost small" data-fix="${esc(d.date)}">${esc(T("fix", "แก้ไขเวลา"))}</button></td></tr>`;
    }).join("");
    $("#hrDayBox").hidden = false;
  }
  $("#hrMonth").value = today().slice(0, 7);
  ["#hrMonth", "#hrDeptM"].forEach(s => $(s).addEventListener("change", renderMonth));
  $("#hrSumBody").addEventListener("click", ev => { const b = ev.target.closest("[data-day]"); if (b) { dayEmp = b.dataset.day; renderMonth(); $("#hrDayBox").scrollIntoView({ block: "nearest" }); } });
  $("#hrDayBody").addEventListener("click", ev => {
    const ok = ev.target.closest("[data-otok]"), fx = ev.target.closest("[data-fix]");
    if (ok) {
      const err = authErr(); if (err) return msg("#hrMonthNote", err, "err");
      addAudit({ action: "ot_approve", emp: dayEmp, target: dayEmp + "|" + ok.dataset.otok, before: null, after: { approved: true }, reason: T("a.ot_approve", "อนุมัติ OT") });
      renderMonth();
    } else if (fx) { $(".hr-tab[data-h=audit]").click(); $("#hrFixEmp").value = dayEmp; $("#hrFixDate").value = fx.dataset.fix; renderFix(); }
  });
  const csvName = k => `lensiq-${k}-${month()}${$("#hrDeptM").value ? "-dept" : ""}.csv`;
  $("#hrPayCsv").addEventListener("click", () => download(csvName("payroll"), C.payrollCsv(summary())));
  $("#hrDetailCsv").addEventListener("click", () => download(csvName("timesheet"), C.detailCsv(summary())));
  // PDPA s.30 right of access: one employee's own time records (+ the corrections made to them) for the chosen month
  $("#hrEmpCsv").addEventListener("click", () => {
    const s = summary(), r = s.rows.find(x => x.emp === dayEmp); if (!r) return;
    const e = empById(dayEmp);
    // one file (browsers may block a second download): the daily records, a blank line, then the change history
    download(`lensiq-my-records-${month()}-${e.code}.csv`, C.detailCsv({ month: s.month, rows: [r], days: s.days }) + "\r\n\r\n" + C.auditCsv(audit.filter(a => a.emp === dayEmp), emps).replace(/^\ufeff/, ""));
  });
  $("#hrAuditCsv").addEventListener("click", () => download(`lensiq-audit-${today()}.csv`, C.auditCsv(audit, emps)));

  // ---- corrections + audit log
  function renderFix() {
    $("#hrFixEmp").innerHTML = optList(live().map(e => [e.id, e.code + " " + e.name]), $("#hrFixEmp").value);
    if (!$("#hrFixDate").value) $("#hrFixDate").value = today();
    const e = empById($("#hrFixEmp").value), date = $("#hrFixDate").value, pt = PT(), mt = MT();
    if (!e || !C.isDate(date)) { $("#hrFixList").innerHTML = ""; return; }
    const sh = shiftOf(e), list = effective().filter(p => p.emp === e.id && (C.shiftDateOf(p.ts, sh) === date || C.dateKey(p.ts) === date));
    $("#hrFixList").innerHTML = list.map(p => `<li data-pid="${esc(p.id)}"><span><b>${esc(C.dateKey(p.ts) + " " + C.clock(p.ts))}</b> ${esc(pt[p.type] || p.type)} · ${esc(mt[p.method] || p.method)}${p.corrected ? " · " + esc(T("fixed", "แก้ไขแล้ว")) : ""}</span>
      <span class="hr-btns"><label class="sr"><span>${esc(T("newTime", "เวลาใหม่"))}</span><input type="time" value="${esc(C.clock(p.ts))}" data-newt></label><button type="button" class="btn ghost small" data-pedit>${esc(T("saveTime", "บันทึกเวลาใหม่"))}</button><button type="button" class="btn ghost small danger" data-pvoid>${esc(T("voidP", "ยกเลิกรายการนี้"))}</button></span></li>`).join("")
      || `<li>${esc(T("noPunch", "ไม่มีการลงเวลาในวันนี้"))}</li>`;
  }
  ["#hrFixEmp", "#hrFixDate"].forEach(s => $(s).addEventListener("change", renderFix));
  const fixReason = () => $("#hrFixReason").value.trim();
  function fixGuard() {
    const err = authErr(); if (err) { msg("#hrFixMsg", err, "err"); return false; }
    if (!fixReason()) { msg("#hrFixMsg", T("needReason", "กรุณากรอกเหตุผลของการแก้ไข"), "err"); $("#hrFixReason").focus(); return false; }
    return true;
  }
  $("#hrFixForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, e = empById(f.emp.value), date = f.date.value, t = C.hm(f.time.value);
    if (!e || !C.isDate(date) || isNaN(t)) return msg("#hrFixMsg", T("needFix", "เลือกพนักงาน วันที่ และเวลา"), "err");
    if (!fixGuard()) return;
    const ts = C.dayStart(date) + t * MIN, p = { id: S.dev + "-m" + ts.toString(36) + rand(3), emp: e.id, ts, type: f.type.value, method: "manual", dev: S.dev };
    addAudit({ action: "punch_add", emp: e.id, target: p.id, before: null, after: p, reason: fixReason() });
    f.time.value = ""; $("#hrFixReason").value = ""; renderAll();
    msg("#hrFixMsg", T("fixOk", "บันทึกการแก้ไขแล้ว (เก็บในประวัติ)"), "ok");
  });
  $("#hrFixList").addEventListener("click", ev => {
    const li = ev.target.closest("li[data-pid]"), ed = ev.target.closest("[data-pedit]"), vd = ev.target.closest("[data-pvoid]");
    if (!li || (!ed && !vd)) return;
    const p = effective().find(x => x.id === li.dataset.pid); if (!p || !fixGuard()) return;
    if (vd) addAudit({ action: "punch_void", emp: p.emp, target: p.id, before: { ts: p.ts, type: p.type, method: p.method }, after: null, reason: fixReason() });
    else {
      const t = C.hm(li.querySelector("[data-newt]").value); if (isNaN(t)) return;
      const ts = C.dayStart(C.dateKey(p.ts)) + t * MIN; if (ts === p.ts) return;
      addAudit({ action: "punch_edit", emp: p.emp, target: p.id, before: { ts: p.ts, type: p.type }, after: { ts, type: p.type }, reason: fixReason() });
    }
    $("#hrFixReason").value = ""; renderAll(); msg("#hrFixMsg", T("fixOk", "บันทึกการแก้ไขแล้ว (เก็บในประวัติ)"), "ok");
  });
  const fmtVal = v => v == null ? "" : typeof v !== "object" ? String(v) : Object.entries(v).filter(([k]) => !["id", "emp", "dev"].includes(k)).map(([k, x]) => k + ": " + (k === "ts" ? C.dateKey(x) + " " + C.clock(x) : typeof x === "object" ? JSON.stringify(x) : x)).join(", ");
  function renderAudit() {
    const v = C.verifyAudit(audit), a = ACT();
    $("#hrChain").textContent = v.ok ? T("chainOk", "ตรวจลำดับประวัติแล้ว: ครบถ้วน {n} รายการ ไม่มีรายการถูกแก้หรือลบ", { n: audit.length }) + (v.truncated.length ? T("chainTrunc", " (รายการเก่าที่เกินระยะเก็บถูกลบตามนโยบาย)") : "")
      : T("chainBad", "พบรายการในประวัติที่ไม่ตรงลำดับหรือถูกแก้ไขภายนอก {n} รายการ — ให้ตรวจ", { n: v.bad.length });
    $("#hrChain").className = "hint " + (v.ok ? "" : "hr-bad");
    $("#hrAuditBody").innerHTML = audit.slice().sort((x, y) => y.at - x.at).slice(0, 300).map(x => { const e = empById(x.emp);
      return `<tr${v.bad.includes(x.id) ? ' class="hr-flag"' : ""}><td>${esc(C.dateKey(x.at) + " " + C.clock(x.at))}</td><td>${U(x.by)}</td><td>${esc(a[x.action] || x.action)}</td><td>${e ? U(e.code + " " + e.name) : ""}</td><td>${U(fmtVal(x.before))}</td><td>${U(fmtVal(x.after))}</td><td>${U(x.reason)}</td></tr>`; }).join("")
      || `<tr><td colspan="7">${esc(T("noAudit", "ยังไม่มีการแก้ไข"))}</td></tr>`;
  }

  // ---- settings / multi-device / retention
  function renderData() {
    $("#hrDevName").value = S.devName || ""; $("#hrRet").value = String(S.retYears);
    let bytes = 0; try { for (const k of Object.values(KEY)) bytes += (localStorage.getItem(k) || "").length * 2; } catch {}
    const kb = Math.round(bytes / 1024);
    msg("#hrDataMsg", T("usage", "บันทึกเวลา {p} รายการ · ประวัติ {a} รายการ · ใช้พื้นที่ประมาณ {kb} KB (เบราว์เซอร์จำกัดราว 5,000 KB — ส่งออกไฟล์สำรองทุกเดือน)", { p: punches.length, a: audit.length, kb }), kb > 3500 ? "warn" : "");
  }
  $("#hrDataSave").addEventListener("click", () => {
    const pin = $("#hrMgrPinNew").value, before = { devName: S.devName, retYears: S.retYears, mgrPin: S.mgrHash ? "set" : "none" };
    if (pin && !C.validPin(pin)) return msg("#hrDataMsg", T("pinRule", "PIN ต้องเป็นตัวเลข 4–8 หลัก"), "err");
    if (S.mgrHash && !mgrOk()) return msg("#hrDataMsg", T("badMgr", "PIN ผู้จัดการไม่ถูกต้อง"), "err");
    S.devName = $("#hrDevName").value.trim().slice(0, 40); S.retYears = C.retentionYears($("#hrRet").value);
    if (pin) { S.mgrSalt = C.newToken(16); S.mgrHash = C.pinHash(pin, S.mgrSalt); }
    saveSet(); $("#hrMgrPinNew").value = "";
    addAudit({ action: "settings", before, after: { devName: S.devName, retYears: S.retYears, mgrPin: S.mgrHash ? (pin ? "changed" : "set") : "none" }, reason: "" });
    retention(); renderAll(); msg("#hrDataMsg", T("saved", "บันทึกแล้ว"), "ok");
  });
  $("#hrExport").addEventListener("click", () => {
    const pack = C.makePack({ dev: S.dev, devName: S.devName, punches, audit, emps: live() });
    download(`lensiq-timeclock-${S.dev}-${today()}.json`, JSON.stringify(pack), "application/json");
  });
  $("#hrImport").addEventListener("change", async ev => {
    const files = [...ev.target.files], packs = [], bad = [];
    for (const f of files) {
      try { const r = C.cleanPack(JSON.parse(await f.text())); if (r.ok && r.pack.dev !== S.dev) packs.push(r.pack); else bad.push(f.name); } catch { bad.push(f.name); }
    }
    ev.target.value = "";
    if (packs.length) {
      const m = C.mergePacks({ punches, audit, emps }, packs);
      punches = m.punches; audit = m.audit; emps = m.emps;
      for (const p of packs) if (p.devName) S.devs[p.dev] = p.devName;
      save(KEY.punches, punches); save(KEY.emps, emps); saveSet();
      addAudit({ action: "import", before: null, after: { files: packs.length, punches: m.added.punches, audit: m.added.audit, emps: m.added.emps, from: packs.map(p => p.devName || p.dev).join(" ") }, reason: "" });
      renderAll();
      msg("#hrDataMsg", T("merged", "รวมแล้ว: บันทึกเวลาใหม่ {p} · ประวัติ {a} · พนักงานใหม่ {e}", { p: m.added.punches, a: m.added.audit, e: m.added.emps }) + (bad.length ? T("mergeBad", " · ไฟล์ที่ใช้ไม่ได้ {n}", { n: bad.length }) : ""), "ok");
    } else msg("#hrDataMsg", T("mergeNone", "ไม่มีไฟล์ที่ใช้ได้ (ไฟล์ต้องมาจากเครื่องอื่นและเป็นไฟล์บันทึกเวลาของ LENSIQ)"), "err");
  });
  function retention() {
    const r = C.purge({ punches, audit, leave }, S.retYears);
    if (!r.removed) return;
    punches = r.punches; audit = r.audit; leave = r.leave;
    save(KEY.punches, punches); save(KEY.leave, leave); save(KEY.audit, audit);
    addAudit({ by: "system", action: "purge", before: null, after: { removed: r.removed, years: S.retYears }, reason: "" });
  }

  // ------------------------------------------------------------ render all
  function renderAll() {
    if (S.mode !== "employee") return;
    renderToday();
    if (hTab === "emp") renderEmps();
    else if (hTab === "shift") renderShifts();
    else if (hTab === "cal") renderCal();
    else if (hTab === "month") renderMonth();
    else if (hTab === "audit") { renderFix(); renderAudit(); }
    else if (hTab === "data") renderData();
    if (S.kiosk) $("#hrKiosk").firstElementChild.textContent = T("kexB", "ออกจากคิออสก์");
  }
  W.addEventListener("lq-lang", () => { renderAll(); $("#hrQrCam").textContent = qrTimer ? T("qrStop", "หยุดสแกน QR") : T("qrCam", "สแกนบัตร QR ด้วยกล้อง"); tick(); });

  // public API (attendance.js + tests)
  W.LQHR = {
    active: () => S.mode === "employee",
    facePunch,
    blockFace: code => { const e = S.mode === "employee" && empByCode(code); return e && e.noFace ? T("optOutReg", "พนักงานรหัสนี้เลือกไม่ใช้ใบหน้า — ไม่เก็บข้อมูลใบหน้า") : ""; },
    get state() { return { S, emps, shifts, punches, audit, leave, holidays }; },
    summary, setMode, enterKiosk, exitKiosk, renderAll
  };

  retention();
  const qp = new URLSearchParams(location.search);
  if (qp.get("mode") === "employee") S.mode = "employee";
  setMode(S.mode, true);
  if (S.mode === "employee" && (S.kiosk || qp.has("kiosk"))) enterKiosk(false);
  renderAll();
})();
