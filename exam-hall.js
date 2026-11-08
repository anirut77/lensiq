/* exam-hall.js — LENSIQ Exam Mode A: camera node (exam-hall.html).
 * The invigilator draws one polygon per seat on this camera's view (or generates a grid), then starts monitoring.
 * COCO-SSD (Apache-2.0, vendored) finds people and phones at 2–5 fps on this device; LQExam.createHallMonitor turns them
 * into seat events (empty / back / early / extra / aisle / lean / phone, room-event suppression, walk mode).
 * Only JSON events + a heartbeat go to the dashboard (exam-link.js). No frame is stored or sent.
 * Test seams (localhost + ?fakedet): no model; window.__LQ_FAKE_DET("exam-hall") -> [{x,y,w,h,score, cls?:"phone"}];
 * window.__LQ_FAKE_Q overrides the lighting verdict; window.__LQ_EXAM_HALL = state.
 */
/* global LQCam, LQDetect, LQSite */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), E = W.LQExam, U = W.LQExamUI, L = W.LQExamLink, T = U.T;
  const $ = s => document.querySelector(s);
  const TEST = !!(window.LQDetect && LQDetect.isTest());
  const P = U.params();
  const K = { node: "lq-exam-node", hall: "lq-exam-hall", seats: "lq-exam-seats" };
  const video = /** @type {HTMLVideoElement} */ ($("#video")), overlay = /** @type {HTMLCanvasElement} */ ($("#overlay"));
  let nodeId = U.store.get(K.node, null);
  if (!/^[a-z0-9]{6,24}$/.test(String(nodeId))) { nodeId = L.newNodeId(); U.store.set(K.node, nodeId); }

  let room = "", cam = null, coco = null, link = null, mon = null, running = false, monitoring = false, walk = false, walkTimer = null;
  let seats = [], draft = null, lastDets = { persons: [], phones: [] }, examStart = 0, fpsEma = 0, lastTick = 0, hbTimer = null;
  let profiles = {}, lastQ = { ok: true, code: "ok", score: 0 }, qAt = 0;
  const recent = [], sent = [];
  const setupGate = E.createGate({ k: 3, n: 5, stages: [{ ms: 5000, lvl: "setup" }], cooldownMs: 60000 });

  let lastEngine = null; // re-rendered on every language switch (status text is written by JS, not data-i18n)
  function engine(text, kind) {
    lastEngine = [text, kind];
    const el = $("#engine"); el.textContent = typeof text === "function" ? text() : text; el.className = "status" + (kind ? " " + kind : "");
  }
  const camKey = () => room + "|" + ((cam && cam.deviceId) || "default");
  function loadSeats() { const all = U.store.get(K.seats, {}); seats = E.cleanSeats(all[camKey()] || []); renderSeats(); }
  function saveSeats() { const all = U.store.get(K.seats, {}); all[camKey()] = seats; U.store.set(K.seats, all); renderSeats(); if (monitoring) rebuild(); heartbeat(); }

  /* ---------- seat editor ---------- */
  function renderSeats() {
    $("#seatCount").textContent = String(seats.length);
    const ul = $("#seatList");
    if (!seats.length) { ul.innerHTML = `<li class="empty">${U.esc(T("exam.hall.noSeats", "ยังไม่มีที่นั่ง — วาดบนภาพหรือสร้างผังแบบตาราง"))}</li>`; return; }
    ul.innerHTML = seats.map((s, i) => `<li><label><span class="sr-only">${U.esc(T("exam.hall.seatId", "เลขที่นั่ง"))}</span><input data-i="${i}" value="${U.esc(s.id)}" maxlength="16" aria-label="${U.esc(T("exam.hall.renameL", "เลขที่นั่ง {id}", { id: s.id }))}"></label>` +
      `<button class="btn ghost danger" type="button" data-del="${i}">${U.esc(T("exam.hall.del", "ลบ"))}</button></li>`).join("");
  }
  $("#seatList").addEventListener("change", e => {
    const el = /** @type {HTMLInputElement} */ (e.target); if (!el.dataset || el.dataset.i == null) return;
    const id = U.cleanSeat(el.value), i = +el.dataset.i;
    if (!id || seats.some((s, j) => j !== i && s.id === id)) { el.value = seats[i].id; engine(() => T("exam.hall.dupSeat", "เลขที่นั่งต้องไม่ว่างและไม่ซ้ำกัน"), "warn"); return; }
    seats[i].id = id; saveSeats();
  });
  $("#seatList").addEventListener("click", e => {
    const b = /** @type {HTMLElement} */ (e.target).closest("[data-del]"); if (!b) return;
    seats.splice(+b.getAttribute("data-del"), 1); saveSeats();
  });
  function nextSeatId() { let n = 1; const have = new Set(seats.map(s => s.id)); while (have.has(String(n))) n++; return String(n); }
  function setDrawing(on) {
    draft = on ? [] : null;
    $("#drawBtn").setAttribute("aria-pressed", String(on));
    $("#closePoly").disabled = !on; $("#cancelPoly").disabled = !on;
    hint();
  }
  $("#drawBtn").addEventListener("click", () => setDrawing(draft == null));
  $("#cancelPoly").addEventListener("click", () => setDrawing(false));
  $("#closePoly").addEventListener("click", () => {
    if (!draft || draft.length < 3) { engine(() => T("exam.hall.need3", "ต้องวางอย่างน้อย 3 จุด"), "warn"); return; }
    let id = U.cleanSeat($("#seatId").value) || nextSeatId();
    if (seats.some(s => s.id === id)) id = nextSeatId();
    seats.push({ id, poly: draft.map(p => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]) });
    $("#seatId").value = ""; setDrawing(false); saveSeats();
  });
  /** pointer -> normalised video coordinates (the canvas uses object-fit: contain like the video) */
  function toNorm(ev) {
    const r = overlay.getBoundingClientRect(), W = overlay.width || 640, H = overlay.height || 480;
    const s = Math.min(r.width / W, r.height / H), ox = (r.width - W * s) / 2, oy = (r.height - H * s) / 2;
    return [Math.max(0, Math.min(1, (ev.clientX - r.left - ox) / (W * s))), Math.max(0, Math.min(1, (ev.clientY - r.top - oy) / (H * s)))];
  }
  overlay.addEventListener("pointerdown", ev => { if (draft == null) return; ev.preventDefault(); draft.push(toNorm(ev)); if (draft.length > 24) draft.shift(); draw(); });
  $("#makeGrid").addEventListener("click", () => {
    const rows = Math.max(1, Math.min(12, +$("#gRows").value || 1)), cols = Math.max(1, Math.min(16, +$("#gCols").value || 1)), first = Math.max(1, +$("#gFirst").value || 1);
    const ids = Array.from({ length: rows * cols }, (_, i) => String(first + i));
    const keep = seats.filter(s => !ids.includes(s.id));
    seats = keep.concat(E.gridSeats({ x: 0.04, y: 0.3, w: 0.92, h: 0.66 }, rows, cols, ids));
    saveSeats();
  });
  $("#clearSeats").addEventListener("click", () => { if (!seats.length || confirm(T("exam.hall.clearQ", "ลบที่นั่งทั้งหมดในมุมกล้องนี้?"))) { seats = []; saveSeats(); } });

  /* ---------- drawing ---------- */
  const LV_COL = { ok: "#3ddc84", info: "#7aa2ff", watch: "#ffd23f", check: "#ff6b5e" };
  const seatFlag = {};
  function draw() {
    const W = video.videoWidth || 640, H = video.videoHeight || 480;
    if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
    const c = overlay.getContext("2d"); c.clearRect(0, 0, W, H);
    const st = mon ? mon.state().seats : {};
    c.font = "bold " + Math.round(H / 22) + "px sans-serif"; c.lineWidth = 3;
    for (const s of seats) {
      const occ = st[s.id] && st[s.id].occupied, col = LV_COL[seatFlag[s.id] || "ok"];
      c.strokeStyle = col; c.fillStyle = occ ? "rgba(61,220,132,.18)" : "rgba(255,255,255,.06)";
      c.beginPath(); s.poly.forEach((p, i) => (i ? c.lineTo(p[0] * W, p[1] * H) : c.moveTo(p[0] * W, p[1] * H))); c.closePath(); c.fill(); c.stroke();
      const ct = E.polyCentroid(s.poly); c.fillStyle = "#fff"; c.fillText(s.id, ct[0] * W - 8, ct[1] * H + 6);
    }
    c.strokeStyle = "#22d3ee"; c.lineWidth = 2;
    for (const b of lastDets.persons) c.strokeRect(b.x * W, b.y * H, b.w * W, b.h * H);
    c.strokeStyle = "#ff6b5e";
    for (const b of lastDets.phones) c.strokeRect(b.x * W, b.y * H, b.w * W, b.h * H);
    if (draft && draft.length) {
      c.strokeStyle = "#fff"; c.setLineDash([6, 4]); c.beginPath();
      draft.forEach((p, i) => (i ? c.lineTo(p[0] * W, p[1] * H) : c.moveTo(p[0] * W, p[1] * H))); c.stroke(); c.setLineDash([]);
      c.fillStyle = "#fff"; for (const p of draft) { c.beginPath(); c.arc(p[0] * W, p[1] * H, 5, 0, 7); c.fill(); }
    }
  }

  /* ---------- camera / detection ---------- */
  async function startCamera() {
    engine(() => T("exam.hall.loading", "กำลังเปิดกล้องและโหลดโมเดล (ในเครื่องนี้)..."));
    try {
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error("insecure"), { name: "Insecure" });
      if (!cam) cam = LQCam.create(video, {
        facing: "environment", ideal: { width: 1280, height: 720 }, persistKey: "lq-exam-hall-cam",
        onChange: (c, ev) => {
          if (ev.type === "started") loadSeats();
          else if (ev.type === "ended") engine(() => T("exam.hall.camLost", "สัญญาณกล้องหลุด — กำลังลองเชื่อมต่อใหม่"), "warn");
          else if (ev.type === "reconnected") engine(() => T("exam.hall.camBack", "กล้องกลับมาแล้ว"), "ok");
        }
      });
      const [, b] = await Promise.all([cam.start(), TEST ? Promise.resolve("test") : LQDetect.tfBackend().then(async bk => { if (!coco) coco = await LQDetect.loadCoco("vendor/models/cocossd/model.json"); return bk; })]);
      try { cam.attach($("#camPick")); } catch (e) { /* one camera */ }
      loadSeats();
      engine(() => T("exam.hall.ready", "พร้อม — ตัวประมวลผล: {b} · ภาพไม่ออกจากเครื่องนี้", { b: String(b).toUpperCase() }), "ok");
      if (!running) { running = true; loop(); }
      clearInterval(hbTimer); hbTimer = setInterval(heartbeat, 5000); heartbeat();
    } catch (e) {
      console.warn(e);
      engine(() => T("exam.hall.camErr", "เปิดกล้องไม่สำเร็จ: {m}", { m: (LQCam.errorText && LQCam.errorText(e)) || e.message || e.name }), "err");
    }
  }
  const qCanvas = document.createElement("canvas"); qCanvas.width = 160; qCanvas.height = 90;
  function quality(t) {
    if (t - qAt < 1000) return lastQ;
    qAt = t;
    let st = null;
    try { const c = qCanvas.getContext("2d", { willReadFrequently: true }); c.drawImage(video, 0, 0, 160, 90); st = LQSite.frameStats(c.getImageData(0, 0, 160, 90)); } catch (e) { st = null; }
    const fake = TEST ? /** @type {any} */ (window).__LQ_FAKE_Q : null;
    lastQ = fake || (TEST ? { ok: true, code: "ok", score: 90 } : E.lightingVerdict(st));
    if (monitoring) { const r = setupGate.push(Date.now(), !lastQ.ok); for (const f of r.fire) send({ seat: "", sig: "setup", lvl: f.lvl, t: Date.now(), code: lastQ.code }); }
    return lastQ;
  }
  async function detect() {
    if (!video.videoWidth) return null;
    if (TEST) {
      const d = LQDetect.fake("exam-hall", performance.now()) || [];
      return { persons: d.filter(b => !b.cls || b.cls === "person"), phones: d.filter(b => b.cls === "phone") };
    }
    const tiles = $("#tiles").checked ? { cols: 2, rows: 2, overlap: 0.2 } : null;
    const d = await LQDetect.detectCoco(coco, video, { classes: [0, 76], minScore: 0.35, max: 40, tiles });
    return { persons: d.filter(b => b.cls === 0 && b.score >= 0.4), phones: d.filter(b => b.cls === 76) };
  }
  async function loop() {
    if (!running) return;
    const t0 = performance.now();
    try {
      const d = await detect();
      if (d) {
        lastDets = d; quality(t0);
        if (lastTick) fpsEma = fpsEma ? fpsEma * 0.8 + 0.2 * (1000 / Math.max(1, t0 - lastTick)) : 1000 / Math.max(1, t0 - lastTick);
        lastTick = t0;
        if (monitoring && mon) {
          const now = Date.now();
          for (const ev of mon.frame(now, d, { walk, elapsedMin: (now - examStart) / 60000 })) send(ev);
        }
        draw(); status();
      }
    } catch (e) { console.warn(e); }
    const period = 1000 / Math.max(2, Math.min(5, +$("#fps").value || 3));
    if (running) setTimeout(loop, Math.max(30, period - (performance.now() - t0)));
  }

  /* ---------- events ---------- */
  function send(ev) {
    const msg = { v: 1, type: "ev", room, node: nodeId, src: "hall", seat: ev.seat || "", sig: ev.sig, lvl: ev.lvl, t: Math.round(ev.t) };
    for (const k of ["dur", "n"]) if (Number.isFinite(ev[k])) msg[k] = ev[k];
    if (ev.code) msg.code = ev.code;
    if (link && link.send(msg)) sent.push(msg);
    if (msg.seat && msg.lvl !== "info" && msg.lvl !== "setup") seatFlag[msg.seat] = msg.lvl;
    if (msg.sig === "back" && msg.seat) delete seatFlag[msg.seat];
    recent.push(msg); while (recent.length > 100) recent.shift();
    while (sent.length > 5000) sent.shift();
    renderRecent();
  }
  function renderRecent() {
    const ul = $("#recent");
    if (!recent.length) { ul.innerHTML = `<li class="empty">${U.esc(T("exam.hall.none", "ยังไม่มีเหตุการณ์"))}</li>`; return; }
    ul.innerHTML = recent.slice().reverse().slice(0, 40).map(e => `<li><time>${U.esc(U.time(e.t))}</time><span class="pill lv-${U.esc(e.lvl)}">${U.esc(U.lvl(e.lvl))}</span>` +
      `<span>${e.seat ? U.esc(T("exam.c.seatN", "ที่นั่ง {s}", { s: e.seat })) + " · " : ""}${U.esc(U.reason(Object.assign({ cnt: e.n }, e)))}</span></li>`).join("");
  }
  function status() {
    const st = mon ? mon.state() : null, occ = st ? Object.values(st.seats).filter(s => s.occupied).length : 0;
    const parts = [
      T("exam.hall.kvSeats", "ที่นั่ง {n}", { n: seats.length }),
      monitoring ? T("exam.hall.kvOcc", "มีคนนั่ง {n}", { n: occ }) : T("exam.hall.kvIdle", "ยังไม่เริ่มเฝ้าดู"),
      T("exam.hall.kvFps", "{f} ภาพ/วินาที", { f: fpsEma.toFixed(1) }),
      T("exam.hall.kvPeople", "เห็นคน {n}", { n: lastDets.persons.length })
    ];
    if (walk) parts.push(T("exam.hall.kvWalk", "โหมดเดินตรวจเปิดอยู่"));
    if (mon && Date.now() < mon.suppressedUntil()) parts.push(T("exam.hall.kvMuted", "พักแจ้งเตือนรายที่นั่งอยู่"));
    if (!lastQ.ok) parts.push(T("exam.hall.kvSetup", "ปรับการติดตั้ง: {w}", { w: U.what(lastQ.code) || lastQ.code }));
    $("#kv").innerHTML = parts.map(p => `<span>${U.esc(p)}</span>`).join("");
  }
  function heartbeat() {
    if (!link) return;
    link.send({ v: 1, type: "hb", room, node: nodeId, src: "hall", name: String($("#nodeName").value || "").slice(0, 40), seats: seats.map(s => s.id), t: Date.now(), fps: Math.round(fpsEma * 10) / 10, q: lastQ.score || 0, pos: $("#pos").value, walk });
  }
  function rebuild() {
    mon = E.createHallMonitor(seats, { minLeaveMin: Math.max(0, +$("#minLeave").value || 0), profiles });
  }
  function onMessage(m) {
    if (m.type === "prof") { profiles = m.profiles || {}; if (monitoring) rebuild(); }
    else if (m.type === "mute" && mon) { mon.mute(Date.now(), m.ms); status(); }
  }

  /* ---------- controls ---------- */
  const saved = U.store.get(K.hall, null);
  if (saved) { $("#room").value = saved.room || ""; $("#nodeName").value = saved.name || ""; if (saved.pos) $("#pos").value = saved.pos; if (saved.minLeave != null) $("#minLeave").value = saved.minLeave; }
  if (P.get("room")) $("#room").value = U.cleanRoom(P.get("room"));
  $("#setupForm").addEventListener("submit", e => {
    e.preventDefault();
    room = U.cleanRoom($("#room").value);
    if (!room) { engine(() => T("exam.hall.needRoom", "กรอกรหัสห้องสอบ (ตัวอักษรอังกฤษหรือตัวเลข)"), "warn"); return; }
    $("#room").value = room;
    U.store.set(K.hall, { room, name: $("#nodeName").value, pos: $("#pos").value, minLeave: $("#minLeave").value });
    if (link) link.close();
    link = L.create({ room, onMessage });
    startCamera();
  });
  $("#runBtn").addEventListener("click", () => {
    if (!running) { engine(() => T("exam.hall.camFirst", "เปิดกล้องก่อน"), "warn"); return; }
    if (!monitoring && !seats.length) { engine(() => T("exam.hall.seatsFirst", "วาดหรือสร้างที่นั่งก่อนเริ่มเฝ้าดู"), "warn"); return; }
    monitoring = !monitoring;
    if (monitoring) { rebuild(); examStart = Date.now(); }
    runLabel();
    engine(() => (monitoring ? T("exam.hall.on", "กำลังเฝ้าดู — ส่งเฉพาะเหตุการณ์ไปที่แดชบอร์ด") : T("exam.hall.off", "หยุดเฝ้าดูแล้ว")), "ok");
    heartbeat(); status();
  });
  function setWalk(on) {
    walk = on; clearTimeout(walkTimer);
    if (on) walkTimer = setTimeout(() => setWalk(false), 5 * 60000); // auto-off after 5 minutes
    runLabel();
    heartbeat(); status();
  }
  $("#walkBtn").addEventListener("click", () => setWalk(!walk));
  $("#muteBtn").addEventListener("click", () => {
    const now = Date.now();
    if (mon) mon.mute(now, 60000);
    if (link) link.send({ v: 1, type: "mute", room, t: now, ms: 60000 });
    send({ seat: "", sig: "roommute", lvl: "info", t: now, dur: 60000 });
    status();
  });
  $("#exportEv").addEventListener("click", () => L.exportFile(`lensiq-exam-${room || "room"}-${nodeId}.json`, sent));
  function runLabel() {
    $("#runBtn").setAttribute("aria-pressed", String(monitoring));
    $("#runBtn").textContent = monitoring ? T("exam.hall.stop", "หยุดเฝ้าดู") : T("exam.hall.run", "เริ่มเฝ้าดู");
    $("#walkBtn").setAttribute("aria-pressed", String(walk));
    $("#walkBtn").textContent = walk ? T("exam.hall.walkOff", "ปิดโหมดเดินตรวจ") : T("exam.hall.walk", "โหมดเดินตรวจ (ผู้คุมสอบเดินในห้อง)");
  }
  function hint() {
    $("#drawHint").textContent = draft != null ? T("exam.hall.drawing", "แตะบนภาพเพื่อวางมุมของที่นั่ง {id} (3 จุดขึ้นไป) แล้วกด “ปิดรูปที่นั่ง”", { id: U.cleanSeat($("#seatId").value) || nextSeatId() }) : T("exam.hall.drawHint", "แตะบนภาพเพื่อวางมุมของที่นั่ง (3 จุดขึ้นไป) แล้วกด “ปิดรูปที่นั่ง”");
  }
  window.addEventListener("lq-lang", () => { renderSeats(); renderRecent(); status(); hint(); runLabel(); if (lastEngine) engine(lastEngine[0], lastEngine[1]); });
  engine(() => T("exam.hall.engine0", "ยังไม่ได้เปิดกล้อง"));
  renderSeats(); renderRecent(); runLabel(); hint();

  /** @type {any} */ (window).__LQ_EXAM_HALL = {
    get seats() { return seats; }, get mon() { return mon; }, get monitoring() { return monitoring; }, get walk() { return walk; },
    sent, recent, get link() { return link; }, nodeId, toNorm
  };
})();
