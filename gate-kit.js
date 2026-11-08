/* gate-kit.js — GateKit: the shared screen parts of LENSIQ Gate (parking.html, village.html).
 * Needs lensiq-plate.js (LQPlate), gate-rules.js; optional lensiq-camera.js (LQCam), lensiq-detect.js (LQDetect test seam),
 * lensiq-sitecheck.js (LQSite stats), vendor/ort (OCR). Thai is the default text; en/zh come from i18n/{en,zh}-gate.js
 * (generated markup carries data-i18n keys, status lines use tf()).
 *
 *   GateKit.init({ns, page, defaults}) -> kit
 *     kit.cfg() / kit.setCfg(patch)      settings (localStorage `${ns}-cfg`: numbers / names only, never images)
 *     kit.store                           IndexedDB `${ns}` (memory fallback): records {id, kind, at, ...}
 *                                         kinds: ev (gate event) · img (plate crop, optional, 7-30 d) · rc (receipt) · au (audit)
 *                                         · chk (accuracy row) · shift · page lists (res / deny / pass / mpass / shop)
 *     kit.mountSetup(el)                  PDPA notice + operator acknowledgement (camera stays off until acknowledged)
 *     kit.mountLane(el, {actions, onRead, onAction, moto})   camera / demo source, tap-to-crop, auto-read, guard confirm
 *     kit.mountRetention(el) · kit.mountCheck(el) · kit.mountAudit(el) · kit.correct(ev, field, to, why)
 *     kit.csv(name, rows, cols) · kit.toast(msg) · kit.fmtTime(ms) · kit.money(n) · kit.plateHTML(key, chars?)
 * Privacy: frames are read in memory; crops are kept only when the owner turns that on (IndexedDB, auto-deleted).
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window);
  const LP = W.LQPlate;
  const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : th.replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? String(v[x]) : m)));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lang = () => (W.LQI18N && W.LQI18N.lang) || "th";
  const locale = () => ({ th: "th-TH", en: "en-GB", zh: "zh-CN" }[lang()] || "th-TH");
  const fmtTime = ms => new Date(ms).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmtClock = ms => new Date(ms).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const money = n => "฿" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const TEST = !!(W.LQDetect && W.LQDetect.isTest && W.LQDetect.isTest());
  const DEMO_PLATES = [["1กข 2345", "bangkok"], ["ขค 789", "chonburi"], ["3ฒพ 12", "chiangmai"], ["กท 4567", "nonthaburi"], ["9กก 9999", "bangkok"]];

  /* ---------------- storage ---------------- */
  function openStore(ns) {
    const mem = new Map();
    let db = null;
    const ready = new Promise(res => {
      let req;
      try { req = indexedDB.open(ns, 1); } catch { res(false); return; }
      req.onupgradeneeded = () => { try { req.result.createObjectStore("rec", { keyPath: "id" }); } catch { /* exists */ } };
      req.onerror = () => res(false);
      req.onsuccess = () => {
        db = req.result;
        try {
          const all = db.transaction("rec").objectStore("rec").getAll();
          all.onsuccess = () => { for (const r of all.result || []) mem.set(r.id, r); res(true); };
          all.onerror = () => res(true);
        } catch { res(true); }
      };
    });
    const tx = (fn) => { if (!db) return; try { const t = db.transaction("rec", "readwrite"); fn(t.objectStore("rec")); } catch { /* quota / closed: memory copy stays */ } };
    return {
      ready,
      list: kind => [...mem.values()].filter(r => !kind || r.kind === kind).sort((a, b) => a.at - b.at),
      get: id => mem.get(id) || null,
      put(r) { mem.set(r.id, r); tx(s => s.put(r)); return r; },
      del(id) { mem.delete(id); tx(s => s.delete(id)); },
      clear(kind) { for (const r of [...mem.values()]) if (!kind || r.kind === kind) this.del(r.id); },
      size: () => mem.size
    };
  }
  function lsGet(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v && typeof v === "object" ? { ...d, ...v } : { ...d }; } catch { return { ...d }; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }

  /* ---------------- small UI helpers ---------------- */
  let toastEl = null;
  function toast(msg, kind) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast gk-toast"; toastEl.setAttribute("role", "status"); toastEl.setAttribute("aria-live", "polite"); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.dataset.kind = kind || ""; toastEl.classList.add("show");
    clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 3200);
  }
  function download(name, text, type = "text/csv;charset=utf-8") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function plateHTML(key, chars) {
    const p = LP.parse(key), moto = LP.parse(key, { moto: true }), q = p.ok ? p : moto.ok ? moto : null;
    const low = new Set((chars || []).map((c, i) => (c && c.p < 0.6 ? i : -1)).filter(i => i >= 0));
    if (!q) return `<span class="gk-plate" lang="th" translate="no">${esc(key || "—")}</span>`;
    const s = [...q.key].map((c, i) => `<span class="${low.has(i) ? "low" : ""}">${esc(c)}</span>`), cut = q.prefix.length + q.letters.length;
    return `<span class="gk-plate" lang="th" translate="no">${s.slice(0, cut).join("")} ${s.slice(cut).join("")}</span>`;
  }
  function provinceOptions(sel, common, value) {
    const l = lang(), list = LP.provinceList(common || []);
    const nCommon = (common || []).filter(id => LP.PROVINCES.some(p => p.id === id)).length;
    sel.innerHTML = `<option value="">${esc(T("gk.prov.none", "— ไม่ระบุจังหวัด —"))}</option>` + list.map((p, i) =>
      (i === nCommon && nCommon ? `<option disabled>──────────</option>` : "") + `<option value="${esc(p.id)}">${esc(l === "th" ? p.th : p.en)}</option>`).join("");
    sel.value = value || "";
  }
  const provName = id => LP.provinceName(id, lang() === "th" ? "th" : "en");

  /* ---------------- demo plate source (synthetic, no people, no real vehicles) ---------------- */
  function drawDemo(c, text, prov, o = {}) {
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
    c.width = 640; c.height = 360;
    const night = !!o.night;
    x.fillStyle = night ? "#15171d" : "#4b5263"; x.fillRect(0, 0, 640, 360);
    x.fillStyle = night ? "#22252d" : "#636b7e"; x.fillRect(120, 70, 400, 230); // car body
    x.fillStyle = night ? "#2d313b" : "#7c8496"; x.fillRect(150, 90, 340, 60);   // windscreen
    const px = 200, py = 175, pw = 240, ph = 112;
    x.fillStyle = night ? "#c9cbd0" : "#fbfbf7"; x.fillRect(px, py, pw, ph);
    x.strokeStyle = "#111"; x.lineWidth = 4; x.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
    x.fillStyle = "#111"; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = "600 46px Prompt, Thonburi, sans-serif"; x.fillText(text, px + pw / 2, py + 40);
    x.font = "500 24px Prompt, Thonburi, sans-serif"; x.fillText(LP.provinceName(prov, "th"), px + pw / 2, py + 86);
  }

  function init(opts) {
    const ns = opts.ns, CFG_KEY = ns + "-cfg";
    const DEF = { ack: null, operator: "", gate: "", common: ["bangkok", "nonthaburi", "pathumthani", "samutprakan"], imgDays: 7, logDays: 90, receiptYears: 5,
      keepCrops: false, autoRead: false, frames: 5, debounceSec: 20, minPlatePx: 60, ...(opts.defaults || {}) };
    let C = lsGet(CFG_KEY, DEF);
    const store = openStore(ns);
    const kit = { ns, T, esc, lang, fmtTime, fmtClock, money, toast, plateHTML, provName, provinceOptions, store, uid, TEST, sleep };
    kit.cfg = () => C;
    kit.setCfg = patch => { C = { ...C, ...patch }; lsSet(CFG_KEY, C); return C; };
    kit.operator = () => C.operator || T("gk.op.anon", "เจ้าหน้าที่");

    /* ---- retention: runs at start and every hour ---- */
    kit.purge = () => {
      const r = LP.purge(store.list(), Date.now(), { imgDays: C.imgDays, logDays: C.logDays, receiptYears: C.receiptYears });
      r.drop.forEach(x => store.del(x.id));
      return r.drop.length;
    };
    store.ready.then(() => { kit.purge(); setInterval(kit.purge, 3600000); });

    /* ---- append-only correction audit ---- */
    kit.audit = () => store.list("au").sort((a, b) => a.seq - b.seq);
    kit.correct = (ev, field, to, why) => {
      const from = ev[field];
      if (String(from == null ? "" : from) === String(to == null ? "" : to)) return null;
      const e = LP.auditAppend(kit.audit(), { ref: ev.id, field, from, to, by: kit.operator(), why: why || "" });
      store.put({ id: "au-" + String(e.seq).padStart(7, "0"), kind: "au", ...e });
      ev[field] = to; ev.edited = true; store.put(ev);
      return e;
    };
    kit.csv = (name, rows, cols) => download(name, LP.toCSV(rows, cols));
    kit.download = download;

    /* ---------------- PDPA setup ---------------- */
    kit.mountSetup = (el, onDone) => {
      el.innerHTML = `<div class="gk-setup card" role="region" aria-labelledby="gkSetupH">
        <h2 id="gkSetupH" data-i18n="gk.setup.h">ก่อนเริ่มใช้งาน: แจ้งเรื่องข้อมูลส่วนบุคคล (PDPA)</h2>
        <p data-i18n="gk.setup.p1">เลขทะเบียนรถที่ระบุเจ้าของได้เป็นข้อมูลส่วนบุคคล ต้องติดป้ายแจ้งให้ผู้ขับขี่เห็นก่อนถึงจุดกล้อง บอกวัตถุประสงค์ ระยะเวลาเก็บ และช่องทางติดต่อ</p>
        <ul class="gk-list">
          <li data-i18n="gk.setup.l1">ประมวลผลในเครื่องนี้ ไม่ส่งภาพออกไปที่ใด</li>
          <li data-i18n="gk.setup.l2">ระบบเสนอเลขทะเบียน เจ้าหน้าที่เป็นผู้ยืนยันหรือแก้ไขทุกครั้ง การแก้ไขถูกบันทึกแบบแก้ย้อนหลังไม่ได้</li>
          <li data-i18n="gk.setup.l3">ภาพครอปป้ายทะเบียนปิดไว้เป็นค่าเริ่มต้น ถ้าเปิด จะลบอัตโนมัติภายใน 7–30 วัน</li>
          <li data-i18n="gk.setup.l4">ไม่ใช้จดจำใบหน้า และไม่ประเมินอารมณ์หรือพฤติกรรมของผู้ขับขี่</li>
        </ul>
        <p class="gk-links"><a class="btn ghost" href="gate-notice.html" data-i18n="gk.setup.kit">ป้ายแจ้งและประกาศความเป็นส่วนตัว (พิมพ์ได้)</a></p>
        <label class="gk-field"><span data-i18n="gk.setup.op">ชื่อเจ้าหน้าที่ประจำจุด (ใช้ในบันทึกการแก้ไข)</span><input id="gkOp" type="text" maxlength="40" autocomplete="off"></label>
        <label class="gk-field"><span data-i18n="gk.setup.gate">ชื่อจุด/ช่องทาง</span><input id="gkGate" type="text" maxlength="40" autocomplete="off"></label>
        <label class="gk-check"><input type="checkbox" id="gkAck1"> <span data-i18n="gk.setup.a1">ติดป้ายแจ้งการใช้กล้องอ่านทะเบียนก่อนถึงจุดกล้องแล้ว</span></label>
        <label class="gk-check"><input type="checkbox" id="gkAck2"> <span data-i18n="gk.setup.a2">เข้าใจว่าระบบเสนอผล และเจ้าหน้าที่เป็นผู้ตัดสินใจ</span></label>
        <button class="btn primary" type="button" id="gkAckBtn" disabled data-i18n="gk.setup.go">เริ่มใช้งาน</button>
      </div>`;
      const $ = s => /** @type {HTMLInputElement} */ (el.querySelector(s));
      $("#gkOp").value = C.operator || ""; $("#gkGate").value = C.gate || "";
      const upd = () => { $("#gkAckBtn").disabled = !($("#gkAck1").checked && $("#gkAck2").checked); };
      $("#gkAck1").addEventListener("change", upd); $("#gkAck2").addEventListener("change", upd);
      $("#gkAckBtn").addEventListener("click", () => {
        kit.setCfg({ ack: { at: Date.now(), by: $("#gkOp").value.trim() }, operator: $("#gkOp").value.trim(), gate: $("#gkGate").value.trim() });
        el.hidden = true; if (onDone) onDone();
      });
      el.hidden = !!C.ack;
      if (C.ack && onDone) onDone();
    };

    /* ---------------- lane: camera / demo, tap-to-crop, read, confirm ---------------- */
    kit.mountLane = (el, lo) => {
      el.innerHTML = `<div class="gk-lane">
        <div class="gk-camcol">
          <div class="gk-cam" id="gkCam">
            <video id="gkVideo" autoplay muted playsinline aria-label="ภาพจากกล้อง" data-i18n-attr="aria-label:gk.cam.video"></video>
            <canvas id="gkDemo" hidden aria-label="ภาพตัวอย่างป้ายจำลอง" data-i18n-attr="aria-label:gk.cam.demo"></canvas>
            <canvas id="gkOverlay" aria-hidden="true"></canvas>
            <p class="gk-cam-msg" id="gkCamMsg" data-i18n="gk.cam.off">กล้องยังไม่เปิด — เปิดกล้อง ใช้ภาพตัวอย่าง หรือพิมพ์เลขทะเบียนเองทางขวา</p>
          </div>
          <div class="gk-row">
            <button class="btn primary" type="button" id="gkCamBtn" data-i18n="gk.cam.start">เปิดกล้อง</button>
            <button class="btn ghost" type="button" id="gkDemoBtn" data-i18n="gk.cam.demoBtn">ใช้ภาพตัวอย่าง</button>
            <button class="btn ghost" type="button" id="gkNextBtn" hidden data-i18n="gk.cam.next">รถคันถัดไป (ตัวอย่าง)</button>
            <button class="btn ghost" type="button" id="gkReadBtn" disabled data-i18n="gk.cam.read">อ่านป้ายตอนนี้</button>
          </div>
          <label class="gk-check"><input type="checkbox" id="gkAuto"> <span data-i18n="gk.cam.auto">อ่านอัตโนมัติเมื่อเห็นป้าย (โหลดโมเดลอ่านอักษรไทย 7.5 MB ครั้งแรก)</span></label>
          <p class="hint" data-i18n="gk.cam.tap">แตะหรือลากกรอบรอบป้ายทะเบียนบนภาพ เพื่ออ่านเฉพาะส่วนนั้น</p>
          <p class="gk-status" id="gkStatus" role="status" aria-live="polite"></p>
        </div>
        <div class="gk-confirm card" id="gkConfirm" aria-labelledby="gkConfH">
          <h2 id="gkConfH" data-i18n="gk.conf.h">ยืนยันเลขทะเบียน</h2>
          <div class="gk-crop-wrap"><canvas id="gkCrop" width="240" height="112" aria-label="ภาพครอปป้ายทะเบียน" data-i18n-attr="aria-label:gk.conf.crop"></canvas><p class="gk-sugg" id="gkSugg"></p></div>
          <label class="gk-field"><span data-i18n="gk.conf.plate">เลขทะเบียน</span>
            <input id="gkPlate" type="text" inputmode="text" maxlength="12" autocomplete="off" lang="th" placeholder="เช่น 1กข 2345" data-i18n-attr="placeholder:gk.conf.plate.ph"></label>
          <p class="gk-valid" id="gkValid" aria-live="polite"></p>
          <label class="gk-field"><span data-i18n="gk.conf.prov">จังหวัด</span><select id="gkProv"></select></label>
          <label class="gk-check"><input type="checkbox" id="gkMoto"> <span data-i18n="gk.conf.moto">รถจักรยานยนต์ (ป้าย 3 บรรทัด)</span></label>
          <div class="gk-tick" id="gkTick" hidden role="group" aria-label="ผลการอ่านของระบบ" data-i18n-attr="aria-label:gk.tick.h">
            <span data-i18n="gk.tick.h">ผลการอ่านของระบบ</span>
            <button class="btn ghost" type="button" data-tick="1" aria-pressed="false" data-i18n="gk.tick.ok">✓ อ่านถูก</button>
            <button class="btn ghost" type="button" data-tick="0" aria-pressed="false" data-i18n="gk.tick.bad">✗ อ่านผิด</button>
          </div>
          <div class="gk-extra" id="gkExtra"></div>
          <div class="gk-row gk-actions" id="gkActions"></div>
          <button class="btn ghost" type="button" id="gkClear" data-i18n="gk.conf.clear">ล้าง</button>
        </div>
      </div>`;
      const $ = s => /** @type {any} */ (el.querySelector(s));
      const video = $("#gkVideo"), demo = $("#gkDemo"), ov = $("#gkOverlay"), frame = document.createElement("canvas");
      const st = { cam: null, source: "", busy: false, read: null, box: null, lastKey: "", lastAt: 0, prev: null, tick: null, demoI: 0, luma: null, loop: 0 };
      kit.lane = st;
      /** status line; a plate inside the message is wrapped in lang="th" (plate data, not interface text) */
      const status = (msg, kind, plate) => {
        const s = $("#gkStatus"); s.dataset.kind = kind || "";
        const i = plate ? msg.indexOf(plate) : -1;
        if (i < 0) { s.textContent = msg; return; }
        const sp = document.createElement("span"); sp.lang = "th"; sp.translate = false; sp.textContent = plate;
        s.replaceChildren(msg.slice(0, i), sp, msg.slice(i + plate.length));
      };
      provinceOptions($("#gkProv"), C.common, "");
      $("#gkAuto").checked = !!C.autoRead;
      $("#gkActions").innerHTML = (lo.actions || []).map(a => `<button class="btn ${a.cls || "primary"}" type="button" data-act="${esc(a.id)}" data-i18n="${esc(a.key)}">${esc(a.th)}</button>`).join("");
      const ackOk = () => !!kit.cfg().ack;

      function grab() {
        const src = st.source === "demo" ? demo : video;
        const w = st.source === "demo" ? demo.width : video.videoWidth, h = st.source === "demo" ? demo.height : video.videoHeight;
        if (!w || !h) return null;
        frame.width = w; frame.height = h;
        const x = /** @type {CanvasRenderingContext2D} */ (frame.getContext("2d", { willReadFrequently: true }));
        x.drawImage(src, 0, 0, w, h);
        return frame;
      }
      function drawBox(b, color) {
        const r = ov.getBoundingClientRect(); ov.width = Math.round(r.width) || 640; ov.height = Math.round(r.height) || 360;
        const x = ov.getContext("2d"); x.clearRect(0, 0, ov.width, ov.height);
        if (!b) return;
        x.strokeStyle = color || "#22d3ee"; x.lineWidth = 3; x.strokeRect(b.x * ov.width, b.y * ov.height, b.w * ov.width, b.h * ov.height);
      }
      function showCrop(f, b) {
        const c = $("#gkCrop"), x = c.getContext("2d");
        x.fillStyle = "#e9ecf3"; x.fillRect(0, 0, c.width, c.height);
        if (!f || !b) return;
        const sx = b.x * f.width, sy = b.y * f.height, sw = b.w * f.width, sh = b.h * f.height;
        if (sw > 2 && sh > 2) x.drawImage(f, sx, sy, sw, sh, 0, 0, c.width, c.height);
      }
      const ready = () => { $("#gkReadBtn").disabled = !st.source; };

      async function startCam() {
        if (!ackOk()) { status(T("gk.st.ack", "ยืนยันประกาศ PDPA ด้านบนก่อนเปิดกล้อง"), "err"); return; }
        if (!W.LQCam) { status(T("gk.st.nocam", "เบราว์เซอร์นี้เปิดกล้องไม่ได้ — ใช้ภาพตัวอย่างหรือพิมพ์เลขทะเบียนเอง"), "err"); return; }
        try {
          if (!st.cam) st.cam = W.LQCam.create(video, { facing: "environment", ideal: { width: 1280, height: 720 }, persistKey: ns + "-cam", mirror: false });
          await st.cam.start();
          st.source = "cam"; demo.hidden = true; video.hidden = false; $("#gkNextBtn").hidden = true; $("#gkCamMsg").hidden = true;
          $("#gkCamBtn").textContent = T("gk.cam.stop", "ปิดกล้อง"); status(T("gk.st.camon", "กล้องเปิดแล้ว"), "ok"); ready();
        } catch (e) { status((W.LQCam.errorText ? W.LQCam.errorText(e) : String(e)), "err"); }
      }
      function stopCam() { if (st.cam) st.cam.stop(); st.source = ""; $("#gkCamBtn").textContent = T("gk.cam.start", "เปิดกล้อง"); $("#gkCamMsg").hidden = false; ready(); }
      function demoNext() {
        const list = W.__LQ_DEMO_PLATES || DEMO_PLATES, [t, p] = list[st.demoI++ % list.length];
        drawDemo(demo, t, p, { night: st.demoI % 4 === 0 });
        drawBox(null);
      }
      $("#gkCamBtn").addEventListener("click", () => (st.source === "cam" ? stopCam() : startCam()));
      $("#gkDemoBtn").addEventListener("click", async () => {
        if (!ackOk()) { status(T("gk.st.ack", "ยืนยันประกาศ PDPA ด้านบนก่อนเปิดกล้อง"), "err"); return; }
        if (st.cam) st.cam.stop();
        try { await document.fonts.load("600 46px Prompt", "กข"); } catch { /* fonts API missing */ }
        st.source = "demo"; video.hidden = true; demo.hidden = false; $("#gkCamMsg").hidden = true; $("#gkNextBtn").hidden = false; demoNext();
        status(T("gk.st.demo", "ภาพตัวอย่าง: ป้ายจำลองที่วาดขึ้น ไม่ใช่รถจริง"), "ok"); ready();
      });
      $("#gkNextBtn").addEventListener("click", demoNext);

      // tap / drag a box around the plate
      let drag = null;
      ov.addEventListener("pointerdown", e => { if (!st.source) return; const r = ov.getBoundingClientRect(); drag = { x0: (e.clientX - r.left) / r.width, y0: (e.clientY - r.top) / r.height, x1: null, y1: null }; ov.setPointerCapture(e.pointerId); });
      ov.addEventListener("pointermove", e => { if (!drag) return; const r = ov.getBoundingClientRect(); drag.x1 = (e.clientX - r.left) / r.width; drag.y1 = (e.clientY - r.top) / r.height; drawBox(rectOf(drag)); });
      ov.addEventListener("pointerup", () => {
        if (!drag) return;
        const b = rectOf(drag); drag = null;
        st.box = b; drawBox(b, "#f5b301"); readNow(b);
      });
      function rectOf(d) {
        if (d.x1 == null || Math.abs(d.x1 - d.x0) < 0.03) { const w = 0.3, h = 0.3 * (16 / 9) / 2.2; return { x: Math.max(0, Math.min(1 - w, d.x0 - w / 2)), y: Math.max(0, Math.min(1 - h, d.y0 - h / 2)), w, h }; }
        const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
        return { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(1, Math.abs(d.x1 - d.x0)), h: Math.min(1, Math.abs(d.y1 - d.y0)) };
      }

      async function ensureOcr() {
        if (TEST && typeof W.__LQ_FAKE_PLATE === "function") return true;
        try { status(T("gk.st.loading", "กำลังโหลดโมเดลอ่านอักษรไทย…")); await LP.loadOcr(); return true; }
        catch (e) { status(T("gk.st.noocr", "โหลดโมเดลอ่านอักษรไม่ได้ — พิมพ์เลขทะเบียนเองได้ตามปกติ"), "err"); return false; }
      }
      /** multi-frame read: N frames ~120 ms apart, plate box from the guard's tap or the detector, then a per-char vote */
      async function readNow(box, auto) {
        if (st.busy || !st.source) return null;
        st.busy = true;
        try {
          if (!(await ensureOcr())) return null;
          status(T("gk.st.reading", "กำลังอ่านป้าย…"));
          const reads = []; let lastF = null, lastB = null, small = false, prov = new Map();
          for (let i = 0; i < Math.max(1, Math.min(10, C.frames || 5)); i++) {
            const f = grab(); if (!f) break;
            let b = box;
            if (!b && !(TEST && W.__LQ_FAKE_PLATE)) { const c = await LP.detect(f); b = c[0] || null; }
            if (!b && TEST) b = { x: 0.31, y: 0.49, w: 0.38, h: 0.31 };
            if (!b) continue;
            if (b.w * f.width < (C.minPlatePx || 60)) { small = true; continue; }
            const r = await LP.readPlate(f, b, { moto: $("#gkMoto").checked });
            lastF = f; lastB = b;
            if (r && r.key) { reads.push(r); if (r.province) prov.set(r.province, (prov.get(r.province) || 0) + 1); }
            if (st.source === "demo" && i >= 1 && reads.length >= 2 && reads.every(x => x.key === reads[0].key)) break; // a still image: two agreeing reads are enough
            await sleep(120);
          }
          if (lastF && lastB) { showCrop(lastF, lastB); drawBox(lastB); const g = LP.grayOf(lastF, 160); st.luma = LP.lumaMean(g.gray); }
          const v = LP.vote(reads, { moto: $("#gkMoto").checked });
          if (!v) { status(small ? T("gk.st.small", "ป้ายเล็กเกินไป — ให้รถเข้าใกล้กล้องหรือซูมเข้า") : T("gk.st.none", "อ่านป้ายไม่ได้ — แตะกรอบรอบป้าย หรือพิมพ์เลขทะเบียนเอง"), "err"); return null; }
          const province = [...prov].sort((a, b) => b[1] - a[1])[0];
          const read = { ...v, province: province ? province[0] : "", at: Date.now(), night: LP.isNight(Date.now(), st.luma == null ? {} : { luma: st.luma }) };
          if (auto && read.key === st.lastKey && Date.now() - st.lastAt < (C.debounceSec || 20) * 1000) { status(T("gk.st.same", "ป้ายเดิม — ข้าม (กันบันทึกซ้ำ)")); return null; }
          st.lastKey = read.key; st.lastAt = Date.now();
          setRead(read);
          status(T("gk.st.read", "ระบบเสนอ {p} (มั่นใจ {c}%, ตรงกัน {a}/{n} ภาพ) — ตรวจและยืนยัน", { p: read.line1, c: Math.round(read.conf * 100), a: Math.round(read.agree * read.n), n: read.n }), "ok", read.line1);
          return read;
        } finally { st.busy = false; }
      }
      kit.readNow = readNow;
      $("#gkReadBtn").addEventListener("click", () => readNow(st.box));

      // auto-read loop: a candidate seen twice in a row triggers a multi-frame read; the same plate is debounced
      async function loopTick() {
        if (!$("#gkAuto").checked || !st.source || st.busy || !ackOk()) return;
        if (st.read && !st.read.done) return; // the guard has not handled the current read yet
        const f = grab(); if (!f) return;
        let b = null;
        if (TEST && typeof W.__LQ_FAKE_PLATE === "function") b = W.__LQ_FAKE_PLATE(Date.now()) ? { x: 0.31, y: 0.49, w: 0.38, h: 0.31 } : null;
        else { const c = await LP.detect(f); b = c[0] && c[0].score >= 0.12 ? c[0] : null; }
        if (!b) { st.prev = null; return; }
        if (st.prev) await readNow(null, true);
        st.prev = b;
      }
      $("#gkAuto").addEventListener("change", async () => {
        kit.setCfg({ autoRead: $("#gkAuto").checked });
        if ($("#gkAuto").checked) await ensureOcr();
      });
      st.loop = setInterval(() => { loopTick().catch(() => {}); }, 800);

      // ---- confirm panel ----
      function setRead(read) {
        st.read = read; st.tick = null;
        $("#gkPlate").value = read ? LP.format(read.key) : "";
        if (read && read.province) $("#gkProv").value = read.province;
        $("#gkSugg").innerHTML = read ? T("gk.conf.sugg", "ระบบเสนอ") + " " + plateHTML(read.key, read.chars) + (read.low && read.low.length ? ` <small>${esc(T("gk.conf.low", "ตัวที่ขีดเส้นใต้ ระบบไม่มั่นใจ"))}</small>` : "") : "";
        updTick(); validate();
      }
      kit.setRead = setRead;
      function updTick() {
        const on = !!(st.read && kit.checking && kit.checking());
        $("#gkTick").hidden = !on;
        el.querySelectorAll("[data-tick]").forEach(b => b.setAttribute("aria-pressed", String(st.tick === (b.dataset.tick === "1"))));
      }
      el.querySelectorAll("[data-tick]").forEach(b => b.addEventListener("click", () => { st.tick = b.dataset.tick === "1"; if (st.tick && st.read) setPlateValue(st.read.key); updTick(); }));
      function setPlateValue(k) { $("#gkPlate").value = LP.format(k); validate(); }
      function current() {
        const moto = $("#gkMoto").checked, p = LP.parse($("#gkPlate").value, { moto });
        return { ok: p.ok, key: p.ok ? p.key : "", line1: p.line1, province: $("#gkProv").value, moto, parsed: p };
      }
      kit.current = current;
      function validate() {
        const c = current(), v = $("#gkValid");
        if (!$("#gkPlate").value.trim()) { v.textContent = ""; v.dataset.kind = ""; }
        else if (c.ok) { v.textContent = c.parsed.legacy ? T("gk.v.legacy", "รูปแบบป้ายรุ่นเก่า (อักษรตัวเดียว) — ตรวจอีกครั้ง") : T("gk.v.ok", "รูปแบบถูกต้อง"); v.dataset.kind = c.parsed.legacy ? "warn" : "ok"; }
        else { v.textContent = c.moto ? T("gk.v.badMoto", "รูปแบบไม่ถูก: ตัวเลข (ถ้ามี) + อักษร 2–3 ตัว + เลข 1–4 หลัก") : T("gk.v.bad", "รูปแบบไม่ถูก: ตัวเลข (ถ้ามี) + อักษร 2 ตัว + เลข 1–4 หลัก"); v.dataset.kind = "err"; }
        el.querySelectorAll("[data-act]").forEach(b => { b.disabled = !c.ok && !b.hasAttribute("data-noplate"); });
        if (lo.onRead) lo.onRead(c, st.read);
      }
      $("#gkPlate").addEventListener("input", validate);
      $("#gkProv").addEventListener("change", validate);
      $("#gkMoto").addEventListener("change", validate);
      $("#gkClear").addEventListener("click", () => { if (st.read) st.read.done = true; setRead(null); showCrop(null, null); drawBox(null); status(""); });
      el.querySelector("#gkActions").addEventListener("click", async e => {
        const b = /** @type {any} */ (e.target).closest("[data-act]");
        if (!b || /** @type {HTMLButtonElement} */ (b).disabled) return;
        const c = current();
        if (!c.ok && !b.hasAttribute("data-noplate")) return;
        const auto = st.read && !st.read.done ? st.read : null;
        const fin = { key: c.key, line1: c.line1, province: c.province, moto: c.moto, auto, edited: !!auto && (auto.key !== c.key || (!!auto.province && auto.province !== c.province)), at: Date.now() };
        const ev = await lo.onAction(b.dataset.act, fin);
        if (ev === false) return; // the page refused (e.g. payment not finished)
        if (ev && ev.id) {
          if (auto && fin.edited) { // keep what the system suggested next to what the guard confirmed (append-only)
            const e1 = LP.auditAppend(kit.audit(), { ref: ev.id, field: "plate", from: auto.key + (auto.province ? "/" + auto.province : ""), to: c.key + (c.province ? "/" + c.province : ""), by: kit.operator(), why: "confirm" });
            store.put({ id: "au-" + String(e1.seq).padStart(7, "0"), kind: "au", ...e1 });
          }
          if (auto && C.keepCrops) saveCrop(ev.id);
          if (auto && kit.checking && kit.checking()) kit.addCheck({ read: auto.key, truth: c.key, ok: st.tick == null ? null : st.tick, provRead: auto.province, provTruth: c.province, night: auto.night });
        }
        if (auto) auto.done = true;
        setRead(null); showCrop(null, null); drawBox(null);
      });
      function saveCrop(ref) {
        const c = $("#gkCrop");
        if (!c.toBlob) return;
        c.toBlob(b => { if (b) store.put({ id: "img-" + ref, kind: "img", ref, at: Date.now(), blob: b }); }, "image/jpeg", 0.7);
      }
      window.addEventListener("lq-lang", () => { provinceOptions($("#gkProv"), C.common, $("#gkProv").value); validate(); if (st.read) setRead(st.read); });
      validate();
      return st;
    };

    /* ---------------- retention + common provinces ---------------- */
    kit.mountRetention = (el) => {
      el.innerHTML = `<h3 data-i18n="gk.ret.h">ระยะเก็บข้อมูล (ลบอัตโนมัติ)</h3>
        <div class="gk-grid3">
          <label class="gk-field"><span data-i18n="gk.ret.img">ภาพครอปป้าย (วัน, 7–30)</span><input id="gkImgDays" type="number" min="1" max="30" step="1"></label>
          <label class="gk-field"><span data-i18n="gk.ret.log">บันทึกเข้า-ออก (วัน)</span><input id="gkLogDays" type="number" min="7" max="730" step="1"></label>
          <label class="gk-field"><span data-i18n="gk.ret.rc">ใบเสร็จ (ปี)</span><input id="gkRcYears" type="number" min="1" max="10" step="1"></label>
        </div>
        <label class="gk-check"><input type="checkbox" id="gkKeep"> <span data-i18n="gk.ret.keep">เก็บภาพครอปป้ายทะเบียน (ปิดไว้เป็นค่าเริ่มต้น เก็บในเครื่องนี้เท่านั้น)</span></label>
        <label class="gk-field"><span data-i18n="gk.ret.common">จังหวัดที่พบบ่อยที่จุดนี้ (แสดงก่อนในรายการ)</span><select id="gkCommon" multiple size="6"></select></label>
        <label class="gk-field"><span data-i18n="gk.ret.op">ชื่อเจ้าหน้าที่</span><input id="gkOp2" type="text" maxlength="40" autocomplete="off"></label>
        <div class="gk-row"><button class="btn primary" type="button" id="gkRetSave" data-i18n="gk.ret.save">บันทึกการตั้งค่า</button>
        <button class="btn ghost danger" type="button" id="gkWipe" data-i18n="gk.ret.wipe">ลบข้อมูลทั้งหมดในเครื่องนี้</button></div>
        <p class="hint" id="gkRetMsg" role="status"></p>`;
      const $ = s => /** @type {any} */ (el.querySelector(s));
      const fill = () => {
        $("#gkImgDays").value = C.imgDays; $("#gkLogDays").value = C.logDays; $("#gkRcYears").value = C.receiptYears; $("#gkKeep").checked = !!C.keepCrops; $("#gkOp2").value = C.operator || "";
        const sel = $("#gkCommon"), l = lang();
        sel.innerHTML = LP.PROVINCES.map(p => `<option value="${esc(p.id)}"${C.common.includes(p.id) ? " selected" : ""}>${esc(l === "th" ? p.th : p.en)}</option>`).join("");
      };
      fill();
      window.addEventListener("lq-lang", fill);
      $("#gkRetSave").addEventListener("click", () => {
        const n = (v, lo2, hi) => Math.min(hi, Math.max(lo2, Math.round(+v) || lo2));
        kit.setCfg({ imgDays: n($("#gkImgDays").value, 1, 30), logDays: n($("#gkLogDays").value, 7, 730), receiptYears: n($("#gkRcYears").value, 1, 10), keepCrops: $("#gkKeep").checked,
          common: [...$("#gkCommon").selectedOptions].map(o => o.value).slice(0, 12), operator: $("#gkOp2").value.trim() });
        if (!C.keepCrops) store.clear("img");
        const k = kit.purge(); fill();
        $("#gkRetMsg").textContent = T("gk.ret.saved", "บันทึกแล้ว · ลบข้อมูลที่เกินกำหนด {n} รายการ", { n: k });
        if (kit.lane) { const s = /** @type {HTMLSelectElement} */ (document.querySelector("#gkProv")); if (s) provinceOptions(s, C.common, s.value); }
      });
      $("#gkWipe").addEventListener("click", () => {
        if (!confirm(T("gk.ret.wipeQ", "ลบบันทึก ใบเสร็จ รายชื่อ และการตั้งค่าทั้งหมดของหน้านี้ในเครื่องนี้? ย้อนกลับไม่ได้"))) return;
        store.clear(); try { localStorage.removeItem(CFG_KEY); localStorage.removeItem(ns + "-sitecheck"); localStorage.removeItem(ns + "-cam"); } catch { /* ignore */ }
        location.reload();
      });
    };

    /* ---------------- audit view ---------------- */
    kit.mountAudit = (el) => {
      const render = () => {
        const a = kit.audit(), v = LP.auditVerify(a);
        el.innerHTML = `<h3 data-i18n="gk.au.h">บันทึกการแก้ไข (เพิ่มได้อย่างเดียว)</h3>
          <p class="gk-valid" data-kind="${v.ok ? "ok" : "err"}">${esc(v.ok ? T("gk.au.ok", "ตรวจสายบันทึกแล้ว: ไม่มีการแก้ย้อนหลัง ({n} รายการ)", { n: a.length }) : T("gk.au.bad", "สายบันทึกขาดที่รายการ {n} — มีการแก้หรือลบย้อนหลัง", { n: v.bad }))}</p>
          <div class="table-wrap"><table class="gk-table"><thead><tr><th>#</th><th data-i18n="gk.col.time">เวลา</th><th data-i18n="gk.col.field">รายการ</th><th data-i18n="gk.col.from">เดิม</th><th data-i18n="gk.col.to">แก้เป็น</th><th data-i18n="gk.col.by">ผู้แก้</th></tr></thead>
          <tbody>${a.slice(-200).reverse().map(e => `<tr><td>${e.seq}</td><td>${esc(fmtTime(e.at))}</td><td>${esc(T("gk.f." + e.field, e.field))}</td><td lang="th" translate="no">${esc(e.from)}</td><td lang="th" translate="no">${esc(e.to)}</td><td lang="th" translate="no">${esc(e.by)}</td></tr>`).join("") || `<tr><td colspan="6" data-i18n="gk.au.none">ยังไม่มีการแก้ไข</td></tr>`}</tbody></table></div>
          <button class="btn ghost" type="button" id="gkAuCsv" data-i18n="gk.au.csv">ส่งออกบันทึกการแก้ไข (CSV)</button>`;
        el.querySelector("#gkAuCsv").addEventListener("click", () => kit.csv(ns + "-audit.csv", a, ["seq", "at", "ref", "field", "from", "to", "by", "why", "prev", "hash"].map(k => ({ k, v: k === "at" ? r => new Date(r.at).toISOString() : undefined }))));
      };
      kit.renderAudit = render;
      render();
      window.addEventListener("lq-lang", render);
    };

    /* ---------------- on-site accuracy check ---------------- */
    const CHK_KEY = ns + "-sitecheck";
    let checking = false;
    kit.checking = () => checking;
    kit.addCheck = row => { store.put({ id: uid("chk-"), kind: "chk", at: Date.now(), ...row }); if (kit.renderCheck) kit.renderCheck(); };
    kit.mountCheck = (el) => {
      el.innerHTML = `<h2 data-i18n="gk.chk.h">ตรวจความแม่นยำหน้างาน</h2>
        <p class="hint" data-i18n="gk.chk.intro">ระหว่างตรวจ ทุกครั้งที่ระบบเสนอเลขทะเบียน เจ้าหน้าที่กด ✓ อ่านถูก หรือ ✗ อ่านผิด (หรือแก้เลขแล้วยืนยัน ซึ่งนับเป็น ✗) ระบบคำนวณความแม่นยำทั้งป้าย รายตัวอักษร และแยกกลางวัน/กลางคืน พร้อมช่วงความเชื่อมั่น 95%</p>
        <ol class="gk-list"><li data-i18n="gk.chk.s1">เปิด "อ่านอัตโนมัติ" แล้วกด "เริ่มตรวจ"</li><li data-i18n="gk.chk.s2">เก็บอย่างน้อย 100 คัน และกลางคืนอย่างน้อย 30 คัน</li><li data-i18n="gk.chk.s3">กด "จบและคำนวณ" แล้วส่งออกผลเก็บไว้</li></ol>
        <div class="gk-row"><button class="btn primary" type="button" id="gkChkStart" data-i18n="gk.chk.start">เริ่มตรวจ</button><button class="btn ghost" type="button" id="gkChkStop" disabled data-i18n="gk.chk.stop">จบและคำนวณ</button>
        <button class="btn ghost" type="button" id="gkChkExp" hidden data-i18n="gk.chk.exp">ส่งออกผลตรวจ (.json)</button></div>
        <p class="gk-status" id="gkChkLive" role="status" aria-live="polite"></p>
        <div id="gkChkRep"></div>
        <details class="gk-hist"><summary data-i18n="gk.chk.hist">ผลตรวจที่ผ่านมา</summary><ul id="gkChkHist"></ul></details>
        <p class="hint" data-i18n="gk.chk.priv">คำนวณในเครื่องนี้ ไม่บันทึกภาพ ไฟล์ส่งออกมีเพียงเลขที่ระบบอ่าน เลขที่เจ้าหน้าที่ยืนยัน และตัวเลขที่คำนวณได้</p>`;
      const $ = s => /** @type {any} */ (el.querySelector(s));
      let t0 = 0, last = null;
      const rows = () => store.list("chk").filter(r => r.at >= t0);
      const VERD = { pass: ["gk.v.pass", "ผ่าน (ยืนยันแล้ว)"], ontrack: ["gk.v.ontrack", "ตรงเป้าจนถึงตอนนี้ — เก็บเพิ่ม"], more: ["gk.v.more", "ข้อมูลยังไม่พอหรือยังไม่ถึงเป้า"], fail: ["gk.v.fail", "ไม่ผ่าน — ปรับกล้องแล้วตรวจใหม่"] };
      const MET = { plate: ["gk.m.plate", "ป้ายถูกทั้งป้าย"], char: ["gk.m.char", "ตัวอักษรถูก"], day: ["gk.m.day", "กลางวัน (ทั้งป้าย)"], night: ["gk.m.night", "กลางคืน (ทั้งป้าย)"], province: ["gk.m.prov", "จังหวัดตรงกับที่เจ้าหน้าที่เลือก"] };
      const NEED = { reads: ["gk.need.reads", "การอ่าน (อีกราว {n} คัน)"], night: ["gk.need.night", "การอ่านตอนกลางคืน (อีกราว {n} คัน)"] };
      const hist = () => { try { const a = JSON.parse(localStorage.getItem(CHK_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
      const renderRep = rep => {
        if (!rep) { $("#gkChkRep").innerHTML = ""; return; }
        const need = (rep.need || []).filter(x => x.more > 0 && NEED[x.group]).map(x => T(NEED[x.group][0], NEED[x.group][1], { n: Math.ceil(x.more) }));
        $("#gkChkRep").innerHTML = `<p class="gk-verdict" data-v="${esc(rep.verdict)}"><b>${esc(T(VERD[rep.verdict][0], VERD[rep.verdict][1]))}</b></p>` +
          (need.length && rep.verdict !== "pass" ? `<p class="hint">${esc(T("gk.chk.need", "ต้องเก็บเพิ่ม:"))} ${need.map(esc).join(" · ")}</p>` : "") +
          `<div class="table-wrap"><table class="gk-table"><thead><tr><th data-i18n="gk.col.metric">ตัวชี้วัด</th><th data-i18n="gk.col.value">ผล</th><th data-i18n="gk.col.ci">ช่วงความเชื่อมั่น 95%</th><th data-i18n="gk.col.target">เป้า</th><th>n</th></tr></thead><tbody>` +
          rep.metrics.map(m => `<tr class="${m.ok === false ? "bad" : m.ok ? "ok" : ""}"><th>${esc(T(MET[m.k][0], MET[m.k][1]))}</th><td>${esc(m.v)}</td><td>${esc(m.ci)}</td><td>${esc(m.target)}</td><td>${m.n}</td></tr>`).join("") + `</tbody></table></div>`;
      };
      const renderHist = () => { $("#gkChkHist").innerHTML = hist().map(h => `<li>${esc(fmtTime(h.at))} — <b>${esc(T(VERD[h.verdict] ? VERD[h.verdict][0] : "gk.v.more", VERD[h.verdict] ? VERD[h.verdict][1] : h.verdict))}</b> <small>${esc(h.summary)}</small></li>`).join("") || `<li data-i18n="gk.chk.none">ยังไม่มีผลตรวจ</li>`; };
      kit.renderCheck = () => {
        if (!checking) return;
        const r = rows(), ok = r.filter(x => (x.ok != null ? x.ok : x.read === x.truth)).length;
        $("#gkChkLive").textContent = T("gk.chk.live", "กำลังตรวจ: อ่านแล้ว {n} คัน ถูก {k} คัน (กลางคืน {m})", { n: r.length, k: ok, m: r.filter(x => x.night).length });
      };
      $("#gkChkStart").addEventListener("click", () => { checking = true; t0 = Date.now(); last = null; $("#gkChkStart").disabled = true; $("#gkChkStop").disabled = false; $("#gkChkExp").hidden = true; renderRep(null); kit.renderCheck(); if (kit.setRead && kit.lane && kit.lane.read) kit.setRead(kit.lane.read); });
      $("#gkChkStop").addEventListener("click", () => {
        checking = false; $("#gkChkStart").disabled = false; $("#gkChkStop").disabled = true;
        const R = rows(); last = LP.accuracy(R);
        renderRep(last); $("#gkChkLive").textContent = "";
        const a = hist(); a.unshift({ v: 2, at: Date.now(), verdict: last.verdict, summary: `${last.metrics[0].v} (n=${last.n})`, cam: C.gate || "" });
        try { localStorage.setItem(CHK_KEY, JSON.stringify(a.slice(0, 20))); } catch { /* ignore */ }
        renderHist(); $("#gkChkExp").hidden = false;
        kit.lastCheck = last;
      });
      $("#gkChkExp").addEventListener("click", () => {
        if (!last) return;
        const doc = { format: "lensiq-sitecheck", v: 1, kind: "gate", created: new Date().toISOString(), note: "plate text and computed numbers only - no images", gate: C.gate || "", report: { ...last, metrics: last.metrics }, rows: rows().map(r => ({ at: r.at, read: r.read, truth: r.truth, ok: r.ok, night: !!r.night, provRead: r.provRead || "", provTruth: r.provTruth || "" })) };
        download(ns + "-sitecheck.json", JSON.stringify(doc, null, 1), "application/json");
      });
      renderHist();
      window.addEventListener("lq-lang", () => { renderHist(); renderRep(last); kit.renderCheck(); });
    };
    return kit;
  }
  W.GateKit = { init, openStore, drawDemo, DEMO_PLATES, T, esc };
})();
