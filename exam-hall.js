/* exam-hall.js — LENSIQ Exam Mode A: camera node (exam-hall.html).
 * The invigilator draws one polygon per seat on this camera's view (or generates a grid), then starts monitoring.
 * COCO-SSD (Apache-2.0, vendored; the default) or, as an experimental option that is off by default ("#detector" / ?yolox),
 * YOLOX-Nano (Apache-2.0, vendored, ONNX Runtime Web WASM loaded only then; docs/exam/HALL-DETECTOR-RESULTS.md: more seated people
 * found, but more false boxes on empty seats, fewer phones and slower, so it failed the switch rule) finds people and phones at 2–5 fps on this device; LQExam.createHallMonitor turns them
 * into seat events (empty / back / early / extra / aisle / lean / phone, room-event suppression, walk mode).
 * Only JSON events + a heartbeat go to the dashboard (exam-link.js). No frame is stored or sent.
 * Test seams (localhost + ?fakedet): no model; window.__LQ_FAKE_DET("exam-hall") -> [{x,y,w,h,score, cls?:"phone"}];
 * window.__LQ_FAKE_Q overrides the lighting verdict; window.__LQ_EXAM_HALL = state.
 * Face pass (EXPERIMENTAL, off by default, "#faceOn"): LQExamFace.createHallFaces() = the option picked by the fixed rule of
 * docs/exam/FACE-ENGINE-RESULTS.md §6.5 (the lab engine on the whole frame; it does NOT find small faces, §7.1); face boxes
 * drawn and counted on this device only (no event, nothing sent).
 * Test seam: __LQ_FAKE_DET("exam-hall-faces") -> [{x,y,w,h}] normalised, or "fail" (the pass switches itself off, said so).
 * Setup check ("#scBtn", only while NOT monitoring; docs/EXAM.md "Hall setup check"): about 1.4 times a second the face
 * engine measures the native camera frame; LQExamFace.hallSetupCheck turns the boxes into a width in px per face, the
 * smallest one and a warning under 48 px. The engine misses most small / distant faces, so the panel also compares the
 * COCO-SSD people count with the faces measured and is never "OK" with no face, with more people than faces, or before
 * the people count exists (one finished object-detection turn on this camera, not older than 5 s; a failing count is
 * "not measured", never 0). The check has its own engine (createHallFaces({setup: true}), HALL_SETUP.numFaces faces at
 * most; the exam loop's face pass keeps HALL_FACE.numFaces); at that limit with more people seen the panel says so
 * instead of blaming distance. Boxes and numbers on this device only: no event, nothing stored, nothing sent. The camera
 * is asked for the highest size it has (ladder 3840x2160 -> 1920x1080 -> 1280x720); the panel shows what arrived, and
 * says so when that is less than asked. The exam loop's own work stays at its old size: COCO-SSD reads a <= 416 px copy,
 * the 2 x 2 tiles, the experimental face pass and the evidence clip a <= 1280 px copy (no such copy possible on this
 * browser -> no clip, said on the page; never a clip at the camera's full size).
 * Test seams: __LQ_FAKE_DET("exam-hall-setup") -> [{x,y,w,h}] normalised, or "fail"; __LQ_FAKE_DET("exam-hall") may be
 * "fail" (object detection fails); window.__LQ_NO_TRACK_SCALE / __LQ_NO_CANVAS_STREAM switch off a way to make the clip copy.
 * Evidence clip (opt-in per exam, default OFF; ?clip=1&clipauto=1&clipdays=N or the setup form): while monitoring, the last
 * 10 s of video (no audio) stay in memory; a Watch / Check flag copies them to a pending slot that is encrypted to this
 * device only on "keep clip" (dashboard, or the button next to the event here) or auto-keep. Never uploaded.
 */
/* global LQCam, LQDetect, LQSite */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), E = W.LQExam, U = W.LQExamUI, L = W.LQExamLink, T = U.T;
  const $ = s => document.querySelector(s);
  const TEST = !!(window.LQDetect && LQDetect.isTest());
  const P = U.params();
  const K = { node: "lq-exam-node", hall: "lq-exam-hall", seats: "lq-exam-seats", seatsAr: "lq-exam-seats-ar" };
  const video = /** @type {HTMLVideoElement} */ ($("#video")), overlay = /** @type {HTMLCanvasElement} */ ($("#overlay"));
  let nodeId = U.store.get(K.node, null);
  if (!/^[a-z0-9]{6,24}$/.test(String(nodeId))) { nodeId = L.newNodeId(); U.store.set(K.node, nodeId); }

  let room = "", cam = null, coco = null, yx = null, detKind = "", link = null, mon = null, running = false, monitoring = false, walk = false, walkTimer = null;
  let seats = [], draft = null, lastDets = { persons: [], phones: [], faces: [] }, examStart = 0, fpsEma = 0, lastTick = 0, hbTimer = null;
  let profiles = {}, lastQ = { ok: true, code: "ok", score: 0 }, qAt = 0;
  /* face pass (EXPERIMENTAL, off by default; docs/exam/FACE-ENGINE-RESULTS.md §6 – §7): boxes of small faces in the wide view,
     drawn and counted for the invigilator only. Boxes and a score, nothing else: no identity, no pose, no expression; no event
     and nothing about faces is sent to the dashboard. If it cannot load or run here it switches itself off and says so. */
  const XF = W.LQExamFace;
  let faceOn = false, faceEng = null, faceErr = false;
  /* setup check (before monitoring): face width in px on the native frame; numbers on this device only */
  const SC = XF.HALL_SETUP, PROC_W = 1280; // PROC_W: the largest frame width the exam loop's face pass / clip / overlay work on
  const sc = { on: false, timer: null, busy: false, err: false, res: null };
  /* the setup check's own face engine (HALL_SETUP.numFaces faces at most); closed when the check is switched off */
  let scEng = null;
  /* people count for the setup check: performance.now() of the last FINISHED object-detection turn on this camera
     (0 = none yet, or the last turn failed). Without a fresh count the check says "not measured", never 0 people. */
  let peopleAt = 0;
  const peopleNow = () => (peopleAt && performance.now() - peopleAt <= SC.peopleMaxAgeMs ? lastDets.persons.length : null);
  const recent = [], sent = [];
  const setupGate = E.createGate({ k: 3, n: 5, stages: [{ ms: 5000, lvl: "setup" }], cooldownMs: 60000 });
  let evSeq = 0;
  const evTag = L.newNodeId().slice(0, 4);
  const Clip = W.LQExamClip;
  let clipCfg = Clip.cfgFromParams(P, null);
  const clipSt = {};
  const clips = W.LQExamClipUI.create({
    send: m => link && link.send(m), ctx: () => ({ room, node: nodeId, src: "hall" }),
    listEl: $("#clipList"), statusEl: $("#clipStatus"),
    onState: (id, st) => { clipSt[id] = st; renderRecent(); if (st === "kept" || st === "auto") $("#clipBox").hidden = false; }
  });

  let lastEngine = null; // re-rendered on every language switch (status text is written by JS, not data-i18n)
  function engine(text, kind) {
    lastEngine = [text, kind];
    const el = $("#engine"); el.textContent = typeof text === "function" ? text() : text; el.className = "status" + (kind ? " " + kind : "");
  }
  const camKey = () => room + "|" + ((cam && cam.deviceId) || "default");
  /* seats are stored normalised to the frame. A camera can deliver another frame shape at another size (4:3 at one
     size, 16:9 at a higher one), and the same numbers then land elsewhere in the room. The frame's width / height is
     stored with the seats (a number per room + camera, nothing else) and a different shape is said on the page. Seats
     saved before this existed have no stored shape: no warning is possible for them (docs/EXAM.md). */
  const frameAr = () => (video.videoWidth && video.videoHeight ? Math.round(video.videoWidth / video.videoHeight * 1e3) / 1e3 : 0);
  let seatAr = 0;
  function loadSeats() {
    const all = U.store.get(K.seats, {}); seats = E.cleanSeats(all[camKey()] || []);
    const ar = +(U.store.get(K.seatsAr, {}) || {})[camKey()];
    seatAr = seats.length && Number.isFinite(ar) && ar > 0 ? ar : 0;
    renderSeats();
  }
  function saveSeats() {
    const all = U.store.get(K.seats, {}); all[camKey()] = seats; U.store.set(K.seats, all);
    const ars = U.store.get(K.seatsAr, {}) || {};
    if (seats.length && frameAr()) ars[camKey()] = seatAr = frameAr(); else { delete ars[camKey()]; seatAr = 0; }
    U.store.set(K.seatsAr, ars);
    renderSeats(); if (monitoring) rebuild(); heartbeat(); pcUpdate();
  }
  /** seats saved on a frame of another shape (more than 2 % apart): say so until they are saved again on this one */
  function renderSeatAr() {
    const el = $("#seatAr"), now = frameAr(), off = !!(seatAr && now && seats.length && Math.abs(seatAr - now) / now > 0.02);
    el.hidden = !off;
    el.textContent = off ? T("exam.hall.seatAr", "สัดส่วนภาพจากกล้องต่างจากตอนบันทึกที่นั่ง (ตอนนั้น {a} ตอนนี้ {b}) ขอบเขตที่นั่งบนภาพอาจเลื่อน ให้ตรวจดู แล้ววาดหรือสร้างใหม่ถ้าไม่ตรง",
      { a: seatAr.toFixed(2) + ":1", b: now.toFixed(2) + ":1" }) : "";
  }

  /* ---------- seat editor ---------- */
  function renderSeats() {
    renderSeatAr();
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
  // seat layout export (numbers only: seat ids and polygons; used by tools/hall-seatwatch-replay.mjs and the session record)
  $("#exportSeats").addEventListener("click", () => {
    const b = new Blob([JSON.stringify({ format: "lensiq-exam-seats", v: 1, room, frame: { w: video.videoWidth || 0, h: video.videoHeight || 0 }, seats })], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `lensiq-exam-seats-${room || "room"}.json`; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });
  $("#clearSeats").addEventListener("click", () => { if (!seats.length || confirm(T("exam.hall.clearQ", "ลบที่นั่งทั้งหมดในมุมกล้องนี้?"))) { seats = []; saveSeats(); } });

  /* ---------- drawing ---------- */
  const LV_COL = { ok: "#3ddc84", info: "#7aa2ff", watch: "#ffd23f", check: "#ff6b5e" };
  const seatFlag = {};
  function draw() {
    // the overlay is at most PROC_W wide (a 4K camera would otherwise mean a 4K canvas and hairline strokes); all boxes are normalised
    const VW = video.videoWidth || 640, VH = video.videoHeight || 480, k = Math.min(1, PROC_W / VW);
    const W = Math.round(VW * k), H = Math.round(VH * k);
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
    c.strokeStyle = "#ffd23f"; c.lineWidth = 1.5;
    for (const b of lastDets.faces || []) c.strokeRect(b.x * W, b.y * H, b.w * W, b.h * H);
    if (sc.on && sc.res) { // setup check: one box per measured face with its width in px of the NATIVE frame
      const fs = Math.max(13, Math.round(H / 30));
      c.font = "bold " + fs + "px sans-serif"; c.lineWidth = 3;
      for (const f of sc.res.faces) {
        const col = f.small ? "#ff6b5e" : "#3ddc84", label = f.px + " px", x = f.x * W, y = f.y * H;
        c.strokeStyle = col; c.strokeRect(x, y, f.w * W, f.h * H);
        const tw = c.measureText(label).width + 8, ty = y - fs - 6 < 0 ? y + f.h * H + 2 : y - fs - 6;
        c.fillStyle = "rgba(11,16,32,.85)"; c.fillRect(x, ty, tw, fs + 6);
        c.fillStyle = col; c.fillText(label, x + 4, ty + fs);
      }
    }
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
        // the highest size the camera has: 3840x2160, then 1920x1080, then 1280x720 (what arrived is shown in the setup check)
        facing: "environment", ideal: SC.ladder.map(r => ({ width: r.width, height: r.height })), persistKey: "lq-exam-hall-cam",
        onChange: (c, ev) => {
          if (ev.type === "started") { peopleAt = 0; loadSeats(); renderSc(); } // another camera / view: the old people count is not this view's
          else if (ev.type === "ended") engine(() => T("exam.hall.camLost", "สัญญาณกล้องหลุด — กำลังลองเชื่อมต่อใหม่"), "warn");
          else if (ev.type === "reconnected") { engine(() => T("exam.hall.camBack", "กล้องกลับมาแล้ว"), "ok"); if (monitoring && clipCfg.on) armClips(); }
        }
      });
      const [, b] = await Promise.all([cam.start(), TEST ? Promise.resolve("test") : loadDetector()]);
      try { cam.attach($("#camPick")); } catch (e) { /* one camera */ }
      loadSeats();
      engine(() => T("exam.hall.ready", "พร้อม — ตัวประมวลผล: {b} · ภาพไม่ออกจากเครื่องนี้", { b: b === "test" ? "TEST" : String(b) }), "ok");
      if (!running) { running = true; loop(); }
      renderSc();
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
  /* person / phone detector (docs/exam/HALL-DETECTOR-RESULTS.md): COCO-SSD by default. YOLOX-Nano only when chosen (?yolox or
     "#detector"); its ONNX Runtime is loaded only then, and COCO-SSD takes over when it cannot run on this device (decided by
     the actual failure). Same score cuts for both. */
  const loadScript = src => new Promise((res, rej) => {
    const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = () => rej(new Error(src)); document.head.appendChild(el);
  });
  const D = E.HALL_DET, DET = { yolox: D.yolox, coco: D.coco }; // one source with tools/hall-seatwatch-replay.mjs
  async function loadDetector() {
    if ($("#detector").value === "yolox") {
      try {
        if (!W.ort) await loadScript("vendor/ort/ort.wasm.min.js");
        if (!yx) yx = await LQDetect.loadYolox();
        detKind = "yolox"; return "YOLOX-Nano · WASM";
      } catch (e) { console.warn("YOLOX unavailable, COCO-SSD fallback", e); }
    }
    const bk = await LQDetect.tfBackend();
    if (!coco) coco = await LQDetect.loadCoco("vendor/models/cocossd/model.json");
    detKind = "coco"; return "COCO-SSD · " + String(bk).toUpperCase();
  }
  async function detect() {
    if (!video.videoWidth) return null;
    if (TEST) {
      const d0 = LQDetect.fake("exam-hall", performance.now());
      if (/** @type {any} */ (d0) === "fail") throw new Error("test: object detection fails");
      const d = d0 || [];
      return { persons: d.filter(b => !b.cls || b.cls === "person"), phones: d.filter(b => b.cls === "phone"), faces: await facePass() };
    }
    const tiles = $("#tiles").checked ? { cols: 2, rows: 2, overlap: 0.2 } : null;
    // 2 x 2 tiles are cut from a frame at most PROC_W wide, as before the camera request was raised (cutting them from the 4K
    // frame was measured slower: 3.7 -> 3.2 loops per second on the development machine); the whole-frame pass reads a 416 px copy
    const src = tiles && video.videoWidth > PROC_W ? procFrame() : video;
    const c = DET[detKind === "yolox" ? "yolox" : "coco"];
    const d = detKind === "yolox"
      ? await LQDetect.detectPeople(yx, src, { classes: [c.person, c.phone], minScore: D.minScore, max: D.max, detW: D.detW, split: "auto", tiles })
      : await LQDetect.detectCoco(coco, src, { classes: [c.person, c.phone], minScore: D.minScore, max: D.max, tiles });
    return { persons: d.filter(b => b.cls === c.person && b.score >= D.personScore), phones: d.filter(b => b.cls === c.phone), faces: await facePass() };
  }
  /** experimental face pass -> normalised boxes [{x, y, w, h}] ([] when off or not working on this device) */
  async function facePass() {
    if (!faceOn || faceErr) return [];
    const Wv = video.videoWidth, Hv = video.videoHeight;
    try {
      if (TEST) {
        const f = LQDetect.fake("exam-hall-faces", performance.now());
        if (f === "fail") throw new Error("test: face pass fails");
        return (f || []).map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
      }
      if (!faceEng) faceEng = XF.createHallFaces();
      await faceEng.init();
      // the running loop never pays for a frame wider than PROC_W (what it read before the camera request was raised)
      const src = Wv > PROC_W ? procFrame() : video, Ws = Wv > PROC_W ? src.width : Wv, Hs = Wv > PROC_W ? src.height : Hv;
      return (await faceEng.detect(src)).map(f => ({ x: f.box.x / Ws, y: f.box.y / Hs, w: f.box.w / Ws, h: f.box.h / Hs }));
    } catch (e) {
      console.warn("face pass", e);
      faceErr = true;
      engine(() => T("exam.hall.faceErr", "ตัวนับใบหน้า (ทดลอง) ทำงานในเครื่องนี้ไม่ได้ จึงปิดไว้ การดูที่นั่งยังทำงานตามปกติ"), "warn");
      return [];
    }
  }
  /** the current frame scaled to PROC_W wide (only used when the camera gives more); drawn once per loop turn */
  let procCv = null, procTurn = -1, turn = 0;
  function procFrame() {
    const Wv = video.videoWidth, Hv = video.videoHeight;
    if (!procCv) procCv = document.createElement("canvas");
    const w = PROC_W, h = Math.max(2, Math.round(Hv * PROC_W / Wv));
    if (procCv.width !== w || procCv.height !== h) { procCv.width = w; procCv.height = h; procTurn = -1; }
    if (procTurn !== turn) {
      // no smoothing: on the development machine the smoothed 4K -> 1280 copy cost about 18 ms per turn, this one about 5 ms
      const cx = procCv.getContext("2d", { willReadFrequently: true }); cx.imageSmoothingEnabled = false;
      cx.drawImage(video, 0, 0, w, h); procTurn = turn;
    }
    return procCv;
  }
  /* evidence clip source: the camera stream itself up to PROC_W wide (as before). A wider camera is recorded from a copy
     at most PROC_W wide, so a kept clip is never larger or more detailed than before the camera request was raised:
     1) a clone of the camera track that the browser scales itself (no work on this page's thread), used only when the
        clone really is <= PROC_W wide and the camera track kept its own size; otherwise
     2) a PROC_W-wide canvas copy painted about 15 times a second: on each new camera frame where the browser has
        video.requestVideoFrameCallback (not a page timer, which browsers slow down in a tab that is not in front),
        else on a 66 ms timer. (LQCam pauses the camera itself while the tab is hidden, so nothing is recorded then.)
     Neither possible (no track scaling, no canvas.captureStream): NO clip. The camera's own stream is never recorded
     above PROC_W; clipOff is set and the page says that clips are not recorded on this device this session.
     Test seams (?fakedet): window.__LQ_NO_TRACK_SCALE = true skips 1); window.__LQ_NO_CANVAS_STREAM = true skips 2). */
  let clipCv = null, clipTimer = null, clipVfc = 0, clipStream = null, clipW = 0, clipGen = 0, clipOff = false;
  function renderClipOff() {
    const el = $("#clipOff"); el.hidden = !clipOff;
    el.textContent = clipOff ? T("exam.hall.clipNoSrc",
      "เครื่องนี้ทำสำเนาภาพจากกล้องที่กว้างไม่เกิน {w} px ไม่ได้ จึงไม่บันทึกคลิปหลักฐานในการเฝ้าดูรอบนี้ (ไม่บันทึกภาพขนาดเต็มของกล้องเด็ดขาด) การดูที่นั่งยังทำงานตามปกติ", { w: PROC_W }) : "";
  }
  function clipSourceStop() {
    clipGen++;
    clearInterval(clipTimer); clipTimer = null;
    if (clipVfc && video.cancelVideoFrameCallback) { try { video.cancelVideoFrameCallback(clipVfc); } catch (e) { /* already gone */ } }
    clipVfc = 0;
    if (clipOff) { clipOff = false; renderClipOff(); }
    if (clipStream) { try { clipStream.getTracks().forEach(t => t.stop()); } catch (e) { /* already stopped */ } clipStream = null; }
    clipW = 0;
  }
  /** @returns {Promise<MediaStream|null>} null when monitoring stopped (or the camera changed) while the copy was being
   *  set up, or when this browser has no way to make a copy at most PROC_W wide (clipOff is then true) */
  async function clipSource() {
    clipSourceStop();
    const gen = clipGen, cam0 = /** @type {MediaStream} */ (video.srcObject), Wv = video.videoWidth, Hv = video.videoHeight;
    clipW = Wv;
    if (!(Wv > PROC_W) || !cam0) return cam0;
    const h = Math.max(2, Math.round(Hv * PROC_W / Wv / 2) * 2);
    const main = cam0.getVideoTracks()[0];
    if (main && typeof main.clone === "function" && !(TEST && W.__LQ_NO_TRACK_SCALE)) {
      let cl = null, ok = false;
      try {
        cl = main.clone();
        await cl.applyConstraints({ width: { ideal: PROC_W }, height: { ideal: h } });
        const a = cl.getSettings(), m = main.getSettings();
        ok = a.width > 0 && a.width <= PROC_W && !(m.width < Wv);
        if (!ok && m.width < Wv) await main.applyConstraints({ width: { ideal: Wv }, height: { ideal: Hv } }); // the clone changed the camera itself: put it back
      } catch (e) { ok = false; }
      if (gen !== clipGen) { if (cl) cl.stop(); return null; }
      if (ok) { clipStream = new MediaStream([cl]); clipW = cl.getSettings().width; return clipStream; }
      if (cl) cl.stop();
    }
    if (!clipCv) clipCv = document.createElement("canvas");
    // no way to make the copy: no clip at all (never the camera's own, wider stream)
    if (typeof clipCv.captureStream !== "function" || (TEST && W.__LQ_NO_CANVAS_STREAM)) { clipW = 0; clipOff = true; renderClipOff(); return null; }
    clipCv.width = PROC_W; clipCv.height = h;
    const c = clipCv.getContext("2d"); c.imageSmoothingEnabled = false; // the cheap copy, as in procFrame()
    let paintedAt = 0;
    const paint = () => { try { if (video.videoWidth) { c.drawImage(video, 0, 0, clipCv.width, clipCv.height); paintedAt = performance.now(); } } catch (e) { /* frame not ready */ } };
    paint();
    if (typeof video.requestVideoFrameCallback === "function") {
      // one paint per camera frame, at most about 15 a second (a 30 fps camera: every other frame)
      const step = () => { if (gen !== clipGen) return; if (performance.now() - paintedAt >= 60) paint(); clipVfc = video.requestVideoFrameCallback(step); };
      clipVfc = video.requestVideoFrameCallback(step);
    } else clipTimer = setInterval(paint, 66);
    clipStream = clipCv.captureStream(15); clipW = PROC_W;
    return clipStream;
  }
  /** start the clip ring on the copy (only if still monitoring with clips on when the copy is ready) */
  function armClips() {
    clipSource().then(s => { if (s && monitoring && clipCfg.on) clips.arm(s); else if (!monitoring) clipSourceStop(); heartbeat(); }, e => console.warn("clip source", e));
  }

  /* ---------- setup check (face size in px, before monitoring) ---------- */
  /** faces on the NATIVE frame -> normalised boxes [{x, y, w, h}] (the caller multiplies by the native width) */
  async function scFaces() {
    const Wv = video.videoWidth, Hv = video.videoHeight;
    if (TEST) {
      const f = LQDetect.fake("exam-hall-setup", performance.now());
      if (f === "fail") throw new Error("test: setup check fails");
      return (f || []).slice(0, SC.numFaces).map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })); // the engine's limit, as on a real device
    }
    if (!scEng) scEng = XF.createHallFaces({ setup: true });
    await scEng.init();
    return (await scEng.detect(video)).map(f => ({ x: f.box.x / Wv, y: f.box.y / Hv, w: f.box.w / Wv, h: f.box.h / Hv }));
  }
  function scClose() { if (scEng && !sc.busy) { scEng.close(); scEng = null; } }
  async function scTick() {
    if (!sc.on || sc.busy || sc.err) return;
    if (!video.videoWidth) { sc.res = null; renderSc(); return; }
    sc.busy = true;
    try {
      const faces = await scFaces();
      if (sc.on) sc.res = XF.hallSetupCheck({ faces, people: peopleNow(), frameW: video.videoWidth, frameH: video.videoHeight, minPx: SC.minFacePx, cap: SC.numFaces });
    } catch (e) {
      console.warn("setup check", e);
      sc.err = true; sc.res = null;
    }
    sc.busy = false;
    if (!sc.on) scClose();
    renderSc(); draw();
  }
  function scSet(on) {
    sc.on = !!on && !monitoring; sc.res = null; sc.err = false;
    clearInterval(sc.timer); sc.timer = null;
    if (sc.on) { sc.timer = setInterval(scTick, SC.everyMs); scTick(); } else scClose();
    renderSc(); draw();
  }
  function renderSc() {
    const btn = $("#scBtn"), st = $("#scState"), kv = $("#scKv"), list = $("#scList"), r = sc.on ? sc.res : null;
    btn.setAttribute("aria-pressed", String(sc.on)); btn.disabled = monitoring;
    btn.textContent = sc.on ? T("exam.hall.scStop", "หยุดตรวจการติดตั้ง") : T("exam.hall.scStart", "เริ่มตรวจการติดตั้ง");
    const Wv = video.videoWidth, Hv = video.videoHeight, top = SC.ladder[0], parts = [];
    if (Wv) parts.push(T("exam.hall.scRes", "ภาพที่ได้จากกล้อง {w} × {h} px (ขอสูงสุด {aw} × {ah})", { w: Wv, h: Hv, aw: top.width, ah: top.height }));
    // the camera gave less than the top size asked for: said in words, not only as two numbers to compare
    const less = $("#scLess"), isLess = Wv > 0 && Wv < top.width;
    less.hidden = !isLess;
    less.textContent = isLess ? T("exam.hall.scLess", "ได้ภาพน้อยกว่าที่ขอ: {w} × {h} px แทน {aw} × {ah} px ใบหน้าที่ระยะเท่ากันจึงมีพิกเซลน้อยลง ให้อ่านตารางระยะกล้องตามขนาดภาพที่ได้จริง",
      { w: Wv, h: Hv, aw: top.width, ah: top.height }) : "";
    if (r) {
      parts.push(r.people == null ? T("exam.hall.scPeopleNone", "เห็นคน: ยังนับไม่ได้") : T("exam.hall.scPeople", "เห็นคน {n}", { n: r.people }),
        T("exam.hall.scFacesN", "ใบหน้าที่วัดได้ {n}", { n: r.n }));
      parts.push(r.n ? T("exam.hall.scMinPx", "ใบหน้าเล็กสุด {px} px", { px: r.minFacePx }) : T("exam.hall.scMinNone", "ใบหน้าเล็กสุด: ยังวัดไม่ได้"));
    }
    kv.innerHTML = parts.map(p => `<span>${U.esc(p)}</span>`).join("");
    list.hidden = !(r && r.n);
    list.textContent = r && r.n ? T("exam.hall.scList", "ความกว้างของแต่ละใบหน้า (px): {l}", { l: r.faces.map(f => f.px + (f.small ? " ⚠" : "")).join(" · ") }) : "";
    let text, kind = "", state = "idle";
    if (monitoring) text = T("exam.hall.scMon", "กำลังเฝ้าดูอยู่ ตรวจการติดตั้งได้เมื่อหยุดเฝ้าดู");
    else if (!sc.on) text = T("exam.hall.scIdle", "ยังไม่ได้ตรวจการติดตั้ง");
    else if (sc.err) { state = "error"; kind = "err"; text = T("exam.hall.scErr", "ตัววัดใบหน้าทำงานในเครื่องนี้ไม่ได้ จึงตรวจขนาดใบหน้าไม่ได้ การดูที่นั่งยังทำงานตามปกติ"); }
    else if (!Wv) { state = "nocam"; kind = "warn"; text = T("exam.hall.scNoCam", "เปิดกล้องก่อน แล้วจึงตรวจการติดตั้ง"); }
    else if (!r) { state = "wait"; text = T("exam.hall.scWait", "กำลังวัด..."); }
    else {
      state = r.state;
      const v = { n: r.n, p: r.people, k: r.small, px: r.minFacePx, min: r.minPx, cap: r.cap };
      // at the engine's limit the unmeasured people are not blamed on distance: the check cannot measure more at a time
      const more = !r.unmeasured ? "" : " · " + (r.atCap
        ? T("exam.hall.scCap", "ตัววัดวัดได้สูงสุดครั้งละ {cap} ใบหน้า: เห็นคน {p} คน วัดได้ {n} ใบหน้า — ให้ตรวจแถวไกลสุดโดยให้มีคนในภาพไม่เกิน {cap} คน", v)
        : T("exam.hall.scPeopleW", "เห็นคน {p} คน วัดใบหน้าได้ {n} ใบหน้า — คนที่เหลืออาจเล็กหรืออยู่ไกลเกินไป", v));
      if (r.state === "noface") {
        kind = "warn";
        text = r.people > 0 ? T("exam.hall.scNoFaceP", "เห็นคน {p} คน แต่วัดใบหน้าไม่ได้เลย — ใบหน้าอาจเล็กหรืออยู่ไกลเกินไป ขยับกล้องเข้าใกล้ ใช้กล้องความละเอียดสูงขึ้น หรือเพิ่มกล้อง", v)
          : T("exam.hall.scNoFace", "ยังวัดใบหน้าไม่ได้เลย ให้คนนั่งที่ที่นั่งและหันหน้าเข้าหากล้อง ถ้ามีคนนั่งอยู่แล้ว ใบหน้าอาจเล็กหรืออยู่ไกลเกินไป");
      } else if (r.state === "small") {
        kind = "err";
        text = T("exam.hall.scSmall",
          "คำเตือน: มีใบหน้ากว้างน้อยกว่า {min} px จำนวน {k} จาก {n} ใบหน้าที่วัดได้ (เล็กสุด {px} px) ขยับกล้องเข้าใกล้ ใช้กล้องความละเอียดสูงขึ้น หรือเพิ่มกล้อง", v) + more;
      } else if (r.state === "nopeople") {
        kind = "warn";
        text = T("exam.hall.scNoPeople", "ยังนับจำนวนคนในภาพไม่ได้ จึงยังสรุปว่าผ่านไม่ได้ — วัดใบหน้าได้ {n} ใบหน้า (เล็กสุด {px} px) รอสักครู่ ถ้าข้อความนี้ไม่หายไป ให้กด “เปิดกล้อง” อีกครั้ง", v);
      } else if (r.state === "people" || r.state === "cap") { kind = "warn"; text = more.slice(3); }
      else if (r.ok) {
        kind = "ok";
        text = T("exam.hall.scOk",
          "ใบหน้าที่วัดได้ทั้ง {n} ใบหน้ากว้างอย่างน้อย {min} px (เล็กสุด {px} px) และจำนวนคนที่เห็น ({p}) ไม่มากกว่าจำนวนใบหน้าที่วัดได้ · {min} px เป็นขั้นต่ำ ไม่ใช่การรับประกัน", v);
      } else { kind = "warn"; text = T("exam.hall.scNoCam", "เปิดกล้องก่อน แล้วจึงตรวจการติดตั้ง"); }
    }
    st.textContent = text; st.className = "status" + (kind ? " " + kind : ""); st.dataset.state = state;
  }
  $("#scBtn").addEventListener("click", () => scSet(!sc.on));
  for (const ev of ["loadedmetadata", "resize"]) video.addEventListener(ev, () => { renderSc(); renderSeatAr(); }); // the size the camera really delivers

  /* ---------- camera placement check (before monitoring; stream H 2026-11-13) ----------
     LQExam.hallPlacement on the loop's own person boxes: seats that show a person, the seated person's height in px of the
     1,280 x 720 frame the detector was measured on, against the ACTIVE detector's measured minimum (public dataset), seats
     hidden behind the row in front, seats cut by the frame edge. Numbers on this device only: nothing stored or sent. */
  const pc = { on: false, res: null };
  const PC_KIND = { noseats: "warn", nocount: "warn", fix: "err", partial: "warn", good: "ok" };
  const detChosen = () => (detKind || $("#detector").value) === "yolox" ? "yolox" : "coco";
  function pcSet(on) { pc.on = !!on && !monitoring; pc.res = null; renderPc(); draw(); }
  function pcUpdate() {
    if (!pc.on) return;
    pc.res = video.videoWidth ? E.hallPlacement({ seats, persons: peopleNow() == null ? null : lastDets.persons, frameW: video.videoWidth, frameH: video.videoHeight,
      det: detChosen(), tiles: $("#tiles").checked }) : null;
    renderPc();
  }
  function renderPc() {
    const btn = $("#pcBtn"), st = $("#pcState"), kv = $("#pcKv"), list = $("#pcList"), r = pc.on ? pc.res : null;
    btn.setAttribute("aria-pressed", String(pc.on)); btn.disabled = monitoring;
    btn.textContent = pc.on ? T("exam.hall.pcStop", "หยุดตรวจตำแหน่งกล้อง") : T("exam.hall.pcStart", "เริ่มตรวจตำแหน่งกล้อง");
    const parts = [], ids = a => a.join(", ");
    if (r && r.state !== "noseats") {
      parts.push(T("exam.hall.pcSeats", "ที่นั่ง {n}", { n: r.seats }));
      if (r.state !== "nocount") {
        parts.push(T("exam.hall.pcSeen", "เห็นคน {k} จาก {n} ที่นั่ง", { k: r.seen, n: r.seats }));
        if (r.minPx != null) parts.push(T("exam.hall.pcMin", "คนเล็กสุด {px} px (ที่นั่ง {s})", { px: r.minPx, s: r.minSeat }));
      }
      parts.push(T("exam.hall.pcNeed", "ขั้นต่ำของตัวตรวจ {px} px", { px: r.need }));
    }
    kv.innerHTML = parts.map(p => `<span>${U.esc(p)}</span>`).join("");
    const showList = !!(r && r.perSeat && r.seen);
    list.hidden = !showList;
    list.textContent = showList ? T("exam.hall.pcList", "ความสูงของคนในแต่ละที่นั่ง (px): {l}", {
      l: r.perSeat.map(s => s.id + ": " + (s.px == null ? "—" : s.px + " px") + (s.small || s.hidden || s.edge ? " ⚠" : "")).join(" · ") }) : "";
    let text, kind = "", state = "idle";
    if (monitoring) { state = "mon"; text = T("exam.hall.pcMon", "กำลังเฝ้าดูอยู่ ตรวจตำแหน่งกล้องได้เมื่อหยุดเฝ้าดู"); }
    else if (!pc.on) text = T("exam.hall.pcIdle", "ยังไม่ได้ตรวจตำแหน่งกล้อง");
    else if (!video.videoWidth) { state = "nocam"; kind = "warn"; text = T("exam.hall.pcNoCam", "เปิดกล้องก่อน แล้วจึงตรวจตำแหน่งกล้อง"); }
    else if (!r) { state = "wait"; text = T("exam.hall.pcWait", "กำลังตรวจ..."); }
    else {
      state = r.state; kind = PC_KIND[r.state] || "warn"; // the panel's look follows the verdict (one table, not per branch)
      const m = r.atMin, rate = () => (m && m.recall != null
        ? T("exam.hall.pcRate", "ที่ขนาดนี้ ({range} px) ตัวตรวจหาคนเจอ {r}% (n = {n}, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)",
          { range: m.hi == null ? m.lo + "+" : m.lo + "–" + m.hi, r: m.recall.toFixed(1), n: m.n })
        : T("exam.hall.pcRateNone", "ขนาดนี้เล็กกว่าทุกขนาดที่เคยวัด จึงไม่รู้ว่าตัวตรวจหาเจอแค่ไหน"));
      if (r.state === "noseats") { text = T("exam.hall.pcNoSeats", "วาดหรือสร้างที่นั่งก่อน แล้วจึงตรวจตำแหน่งกล้อง"); }
      else if (r.state === "nocount") { text = T("exam.hall.pcNoCount", "ยังนับคนในภาพไม่ได้ รอสักครู่ ถ้าข้อความนี้ไม่หายไป ให้กด “เปิดกล้อง” อีกครั้ง"); }
      else if (r.state === "fix") {
        const small = r.perSeat.filter(s => s.small), lines = [];
        if (small.length) {
          const px = Math.min(...small.map(s => s.px));
          lines.push(T("exam.hall.pcSmall", "ที่นั่ง {ids}: คนในภาพสูง {px} px ต่ำกว่าขั้นต่ำ {need} px — ขยับกล้องเข้าใกล้ ใช้ภาพความละเอียดสูงขึ้น หรือเพิ่มกล้อง",
            { ids: ids(r.small), px, need: r.need }) + " · " + rate());
          if (r.tilesHelp) lines.push(T("exam.hall.pcTiles", "หรือเปิด “ห้องใหญ่: แบ่งภาพ 2×2” (ขั้นต่ำที่วัดได้ {px} px แต่ช้าลง)", { px: E.HALL_PLACE.minPx["coco-t2"] }));
        }
        if (r.hidden.length) lines.push(T("exam.hall.pcHidden", "ที่นั่ง {ids}: ถูกคนแถวหน้าบังเกินครึ่ง — ยกกล้องให้สูงขึ้น (2.6 ม. ขึ้นไป) แล้วก้มลงมองที่นั่ง", { ids: ids(r.hidden) }));
        if (r.edge.length) lines.push(T("exam.hall.pcEdge", "ที่นั่ง {ids}: ชิดขอบภาพ — หันหรือถอยกล้องให้ที่นั่งอยู่ในภาพทั้งหมด", { ids: ids(r.edge) }));
        if (r.unseen.length) lines.push(T("exam.hall.pcUnseen", "ยังไม่เห็นคนที่ที่นั่ง {ids}", { ids: ids(r.unseen) }));
        text = lines.join(" · ");
      } else if (r.state === "partial") {
        text = T("exam.hall.pcPartial", "ยังไม่เห็นคนที่ที่นั่ง {ids} — ให้คนนั่งทุกที่นั่งก่อนตรวจ ถ้ามีคนนั่งอยู่แล้ว ตัวตรวจหาไม่เจอ: ขยับกล้องเข้าใกล้หรือเพิ่มกล้อง", { ids: ids(r.unseen) });
      } else {
        text = T("exam.hall.pcGood", "ตำแหน่งกล้องผ่าน: เห็นคนครบ {n} ที่นั่ง คนเล็กสุดสูง {px} px (ขั้นต่ำ {need} px) ไม่มีที่นั่งถูกบังหรือชิดขอบภาพ", { n: r.seats, px: r.minPx, need: r.need })
          + " · " + rate() + " · " + T("exam.hall.pcNoGuar", "ผ่านแล้วไม่ได้รับประกันว่าจะไม่พลาด");
      }
    }
    st.textContent = text; st.className = "status" + (kind ? " " + kind : ""); st.dataset.state = state;
  }
  $("#pcBtn").addEventListener("click", () => pcSet(!pc.on));
  $("#tiles").addEventListener("change", pcUpdate);

  async function loop() {
    if (!running) return;
    const t0 = performance.now();
    turn++;
    try {
      const d = await detect();
      if (d) {
        lastDets = d; peopleAt = performance.now(); quality(t0);
        if (lastTick) fpsEma = fpsEma ? fpsEma * 0.8 + 0.2 * (1000 / Math.max(1, t0 - lastTick)) : 1000 / Math.max(1, t0 - lastTick);
        lastTick = t0;
        if (monitoring && mon) {
          const now = Date.now();
          for (const ev of mon.frame(now, d, { walk, elapsedMin: (now - examStart) / 60000 })) send(ev);
        }
        draw(); status(); pcUpdate();
      }
    } catch (e) { console.warn(e); peopleAt = 0; } // a failing turn: the people count is unknown, not 0
    const period = 1000 / Math.max(2, Math.min(5, +$("#fps").value || 3));
    if (running) setTimeout(loop, Math.max(30, period - (performance.now() - t0)));
  }

  /* ---------- events ---------- */
  function send(ev) {
    const msg = { v: 1, type: "ev", room, node: nodeId, src: "hall", seat: ev.seat || "", sig: ev.sig, lvl: ev.lvl, t: Math.round(ev.t), id: "e" + (++evSeq).toString(36) + "-" + evTag };
    for (const k of ["dur", "n"]) if (Number.isFinite(ev[k])) msg[k] = ev[k];
    if (ev.code) msg.code = ev.code;
    if (link && link.send(msg)) sent.push(msg);
    if (msg.seat && msg.lvl !== "info" && msg.lvl !== "setup") seatFlag[msg.seat] = msg.lvl;
    if (msg.sig === "back" && msg.seat) delete seatFlag[msg.seat];
    recent.push(msg); while (recent.length > 100) recent.shift();
    if (clipCfg.on && monitoring) clips.onFlag(msg);
    while (sent.length > 5000) sent.shift();
    renderRecent();
  }
  function renderRecent() {
    const ul = $("#recent");
    if (!recent.length) { ul.innerHTML = `<li class="empty">${U.esc(T("exam.hall.none", "ยังไม่มีเหตุการณ์"))}</li>`; return; }
    ul.innerHTML = recent.slice().reverse().slice(0, 40).map(e => `<li><time>${U.esc(U.time(e.t))}</time><span class="pill lv-${U.esc(e.lvl)}">${U.esc(U.lvl(e.lvl))}</span>` +
      `<span>${e.seat ? U.esc(T("exam.c.seatN", "ที่นั่ง {s}", { s: e.seat })) + " · " : ""}${U.esc(U.reason(Object.assign({ cnt: e.n }, e)))}</span>` +
      (clipSt[e.id] ? `<span class="clip-tag">${U.esc(W.LQExamClipUI.stateText(clipSt[e.id]))}</span>` : "") +
      (clipSt[e.id] === "pending" ? `<button class="btn ghost" type="button" data-keep="${U.esc(e.id)}" aria-label="${U.esc(T("exam.clip.keep", "เก็บคลิป") + " · " + U.time(e.t) + (e.seat ? " · " + T("exam.c.seatN", "ที่นั่ง {s}", { s: e.seat }) : "") + " · " + U.sig(e.sig))}">${U.esc(T("exam.clip.keep", "เก็บคลิป"))}</button>` : "") + "</li>").join("");
  }
  function status() {
    const st = mon ? mon.state() : null, occ = st ? Object.values(st.seats).filter(s => s.occupied).length : 0;
    const parts = [
      T("exam.hall.kvSeats", "ที่นั่ง {n}", { n: seats.length }),
      monitoring ? T("exam.hall.kvOcc", "มีคนนั่ง {n}", { n: occ }) : T("exam.hall.kvIdle", "ยังไม่เริ่มเฝ้าดู"),
      T("exam.hall.kvFps", "{f} ภาพ/วินาที", { f: fpsEma.toFixed(1) }),
      T("exam.hall.kvPeople", "เห็นคน {n}", { n: lastDets.persons.length })
    ];
    if (faceOn) parts.push(faceErr ? T("exam.hall.kvFaceOff", "ตัวนับใบหน้าปิดอยู่ (ทำงานในเครื่องนี้ไม่ได้)") : T("exam.hall.kvFaces", "ใบหน้า {n} (ทดลอง)", { n: (lastDets.faces || []).length }));
    if (walk) parts.push(T("exam.hall.kvWalk", "โหมดเดินตรวจเปิดอยู่"));
    if (mon && Date.now() < mon.suppressedUntil()) parts.push(T("exam.hall.kvMuted", "พักแจ้งเตือนรายที่นั่งอยู่"));
    if (!lastQ.ok) parts.push(T("exam.hall.kvSetup", "ปรับการติดตั้ง: {w}", { w: U.what(lastQ.code) || lastQ.code }));
    $("#kv").innerHTML = parts.map(p => `<span>${U.esc(p)}</span>`).join("");
  }
  function heartbeat() {
    if (!link) return;
    link.send({ v: 1, type: "hb", room, node: nodeId, src: "hall", name: String($("#nodeName").value || "").slice(0, 40), seats: seats.map(s => s.id), t: Date.now(),
      fps: Math.round(fpsEma * 10) / 10, q: lastQ.score || 0, pos: $("#pos").value, walk, clip: clips.armed });
  }
  function rebuild() {
    mon = E.createHallMonitor(seats, { minLeaveMin: Math.max(0, +$("#minLeave").value || 0), profiles });
  }
  function onMessage(m) {
    if (m.type === "keep") clips.onMessage(m);
    else if (m.type === "prof") { profiles = m.profiles || {}; if (monitoring) rebuild(); }
    else if (m.type === "mute" && mon) { mon.mute(Date.now(), m.ms); status(); }
  }

  /* ---------- controls ---------- */
  const saved = U.store.get(K.hall, null);
  if (saved) { $("#room").value = saved.room || ""; $("#nodeName").value = saved.name || ""; if (saved.pos) $("#pos").value = saved.pos; if (saved.minLeave != null) $("#minLeave").value = saved.minLeave; }
  // experimental face pass: off unless the invigilator ticks it on this device (remembered with the node settings)
  faceOn = !!(saved && saved.faceOn === true); $("#faceOn").checked = faceOn;
  $("#faceOn").addEventListener("change", () => {
    faceOn = $("#faceOn").checked; if (!faceOn) lastDets.faces = [];
    const s = U.store.get(K.hall, {}) || {}; s.faceOn = faceOn; U.store.set(K.hall, s);
    status(); draw();
  });
  // detector: COCO-SSD unless YOLOX-Nano is chosen (remembered with the node settings, or ?yolox). A change while the camera runs reloads it.
  $("#detector").value = P.has("yolox") || (saved && saved.det === "yolox") ? "yolox" : "coco";
  $("#detector").addEventListener("change", () => {
    const s = U.store.get(K.hall, {}) || {}; s.det = $("#detector").value; U.store.set(K.hall, s);
    if (running && !TEST) loadDetector().then(b => engine(() => T("exam.hall.ready", "พร้อม — ตัวประมวลผล: {b} · ภาพไม่ออกจากเครื่องนี้", { b }), "ok"))
      .catch(e => { console.warn(e); engine(() => T("exam.hall.camErr", "เปิดกล้องไม่สำเร็จ: {m}", { m: e.message || e.name }), "err"); });
  });
  if (P.get("room")) $("#room").value = U.cleanRoom(P.get("room"));
  /* evidence clip setting: changeable while not monitoring; the room notice must say so when it is on */
  function clipUI() {
    $("#clipOn").checked = clipCfg.on; $("#clipAuto").checked = clipCfg.auto; $("#clipDays").value = String(clipCfg.days);
    $("#clipAuto").disabled = !clipCfg.on || monitoring;
    $("#clipOn").disabled = $("#clipDays").disabled = monitoring;
    $("#clipWarn").hidden = !clipCfg.on;
    $("#lead").hidden = clipCfg.on; $("#leadC").hidden = !clipCfg.on;
    $("#clipBox").hidden = !clipCfg.on && !clips.kept.length;
  }
  function readClipCfg() {
    if (monitoring) return;
    clipCfg = Clip.cleanCfg({ on: $("#clipOn").checked, auto: $("#clipAuto").checked, days: +$("#clipDays").value });
    clips.setCfg(clipCfg); clipUI();
  }
  for (const id of ["#clipOn", "#clipAuto", "#clipDays"]) $(id).addEventListener("change", readClipCfg);
  clips.setCfg(clipCfg);
  clips.refresh().then(clipUI);
  $("#recent").addEventListener("click", e => {
    const b = /** @type {HTMLElement} */ (e.target).closest("[data-keep]"); if (!b) return;
    clips.keep(b.getAttribute("data-keep"), "kept");
  });
  $("#setupForm").addEventListener("submit", e => {
    e.preventDefault();
    room = U.cleanRoom($("#room").value);
    if (!room) { engine(() => T("exam.hall.needRoom", "กรอกรหัสห้องสอบ (ตัวอักษรอังกฤษหรือตัวเลข)"), "warn"); return; }
    $("#room").value = room;
    U.store.set(K.hall, { room, name: $("#nodeName").value, pos: $("#pos").value, minLeave: $("#minLeave").value, faceOn, det: $("#detector").value });
    if (link) link.close();
    link = L.create({ room, onMessage });
    startCamera();
  });
  $("#runBtn").addEventListener("click", () => {
    if (!running) { engine(() => T("exam.hall.camFirst", "เปิดกล้องก่อน"), "warn"); return; }
    if (!monitoring && !seats.length) { engine(() => T("exam.hall.seatsFirst", "วาดหรือสร้างที่นั่งก่อนเริ่มเฝ้าดู"), "warn"); return; }
    monitoring = !monitoring;
    clips.lock(); // the kept-clip list is re-locked whenever monitoring starts or stops (invigilator PIN)
    if (monitoring) { scSet(false); pcSet(false); rebuild(); examStart = Date.now(); if (clipCfg.on) armClips(); } // the setup check never runs during the exam
    else { clips.disarm(); clipSourceStop(); } // ring stops; pending clips stay keepable until their 10-min window ends
    clipUI(); renderSc(); renderPc();
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
  window.addEventListener("lq-lang", () => { renderSeats(); renderRecent(); status(); hint(); runLabel(); renderSc(); renderPc(); renderClipOff();
    if (lastEngine) engine(lastEngine[0], lastEngine[1]); });
  engine(() => T("exam.hall.engine0", "ยังไม่ได้เปิดกล้อง"));
  renderSeats(); renderRecent(); runLabel(); hint(); renderSc(); renderPc();

  /** @type {any} */ (window).__LQ_EXAM_HALL = {
    get seats() { return seats; }, get mon() { return mon; }, get monitoring() { return monitoring; }, get walk() { return walk; },
    sent, recent, get link() { return link; }, nodeId, toNorm, clips, clipSt, get clipCfg() { return clipCfg; },
    get detector() { return { chosen: $("#detector").value, loaded: detKind }; },
    get faceOn() { return faceOn; }, get faceErr() { return faceErr; }, get faces() { return lastDets.faces || []; },
    get faceCfg() { return faceEng ? { engine: faceEng.engine, numFaces: faceEng.numFaces, conf: faceEng.conf } : null; },
    get placement() { return { on: pc.on, res: pc.res, people: peopleNow() }; },
    get setup() { return { on: sc.on, err: sc.err, res: sc.res, everyMs: SC.everyMs, cap: SC.numFaces, people: peopleNow(), engine: scEng ? { numFaces: scEng.numFaces } : null }; },
    get frame() { return { w: video.videoWidth, h: video.videoHeight, overlayW: overlay.width, clipW: clipOff ? 0 : clipW || video.videoWidth, clipOff }; }
  };
})();
