/* exam-lab.js — LENSIQ Exam Mode B: candidate page (exam-lab.html).
 * Flow: notice + consent -> camera & lighting check -> calibration (baseline head pose) -> fullscreen exam.
 * Frames are analysed on this device (face-api TinyFaceDetector + 68 landmarks, COCO-SSD for phone / book / laptop / screen);
 * only JSON events (LQExam.cleanMsg) go to the room dashboard (exam-link.js). No image, audio or name ever leaves the page.
 * Test seams (localhost + ?fakedet, LQDetect.isTest()): no models; window.__LQ_FAKE_DET("exam-lab") returns
 *   [{x,y,w,h, yaw?, pitch?, mar?}] faces (normalised; turned into 68 synthetic landmarks) and [{cls:"phone"|..., score}] objects;
 *   window.__LQ_FAKE_Q = {ok, code, score} overrides the lighting verdict. ?calsec=N shortens calibration. window.__LQ_EXAM_LAB = state.
 */
/* global LQCam, LQDetect, LQSite, faceapi */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), E = W.LQExam, U = W.LQExamUI, L = W.LQExamLink, T = U.T;
  const $ = s => document.querySelector(s);
  const TEST = !!(window.LQDetect && LQDetect.isTest());
  const P = U.params();
  const K = { node: "lq-exam-node", lab: "lq-exam-lab", log: "lq-exam-lab-log", active: "lq-exam-active" };
  const COCO_NAME = { 76: "phone", 83: "book", 72: "laptop", 71: "screen" };
  const video = /** @type {HTMLVideoElement} */ ($("#video")), overlay = /** @type {HTMLCanvasElement} */ ($("#overlay"));
  let nodeId = U.store.get(K.node, null);
  if (!/^[a-z0-9]{6,24}$/.test(String(nodeId))) { nodeId = L.newNodeId(); U.store.set(K.node, nodeId); }

  let phase = "notice", room = "", seat = "", link = null, mon = null, cam = null, coco = null, modelsReady = false;
  let running = false, profile = null, lastQ = { ok: true, code: "ok", score: 0 }, lastFaces = [], frames = 0, fpsEma = 0, lastTick = 0;
  let calSamples = [], calEnd = 0, calLen = 120, hbTimer = null, promptTimer = null, wasFs = false, reloadPending = false;
  const own = U.store.get(K.log, []).filter(e => e && E.SIGNALS[e.sig]);
  const sent = [];
  const frozen = E.createFrozen({ ms: 4000 });
  let qAt = 0, cocoN = 0;

  /* ---------- small UI helpers ---------- */
  let lastEngine = null; // re-rendered on every language switch (status text is written by JS, not data-i18n)
  function engine(text, kind) {
    lastEngine = [text, kind];
    const el = $("#engine"); el.textContent = typeof text === "function" ? text() : text; el.className = "status" + (kind ? " " + kind : "");
  }
  function show(p) {
    phase = p;
    for (const [id, step] of [["stepNotice", "notice"], ["stepCam", "cam"], ["stepCal", "cal"], ["stepExam", "exam"]]) $("#" + id).hidden = step !== p && !(p === "done" && step === "exam");
    document.querySelectorAll("#steps li").forEach((/** @type {HTMLElement} */ li) => { if (li.dataset.step === p) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current"); });
    $("#monitor").hidden = !(p === "cal" || p === "exam");
  }
  function baseCfg() {
    return { allowBook: $("#allowBook").checked, allowLaptop: $("#allowLaptop").checked, allowScreen: $("#allowScreen").checked, mouth: $("#mouthOn").checked };
  }
  function buildMonitor() {
    const b = mon ? mon.baseline : null;
    mon = E.createLabMonitor(E.applyAccommodation(baseCfg(), profile));
    if (b) mon.setBaseline(b);
  }
  const PROMPTS = {
    noface: ["exam.lab.pNoface", "ไม่เห็นใบหน้า — ขยับให้อยู่ในกรอบกล้อง หรือเพิ่มแสงด้านหน้า"],
    setup: ["exam.lab.pSetup", "ภาพไม่ชัดหรือแสงไม่พอ — ปรับแสงหรือมุมกล้อง (ไม่ใช่ความผิดของคุณ)"],
    fsexit: ["exam.lab.pFs", "คุณออกจากโหมดเต็มจอ — กดปุ่ม “กลับเข้าเต็มจอ” เพื่อทำข้อสอบต่อ"],
    multiface: ["exam.lab.pMulti", "เห็นมากกว่าหนึ่งใบหน้า — หากมีคนอื่นอยู่ใกล้ โปรดแจ้งผู้คุมสอบ"],
    phone: ["exam.lab.pPhone", "อาจมีโทรศัพท์ในภาพ — โปรดเก็บโทรศัพท์ให้พ้นมือ ผู้คุมสอบอาจมาดู"],
    object: ["exam.lab.pObject", "อาจมีหนังสือหรืออุปกรณ์อื่นในภาพ — ถ้าไม่ได้รับอนุญาตโปรดเก็บ"],
    headturn: ["exam.lab.pTurn", "ดูเหมือนคุณหันออกจากจอนาน — ถ้าต้องการความช่วยเหลือ ยกมือเรียกผู้คุมสอบ"],
    away: ["exam.lab.pAway", "คุณสลับออกจากหน้าข้อสอบ — โปรดอยู่ในหน้านี้จนส่งข้อสอบ"],
    screens: ["exam.lab.pScreens", "พบจอภาพที่สอง — ถ้าไม่ได้รับอนุญาต โปรดถอดหรือปิดจอนั้น"]
  };
  let promptSig = null;
  function prompt(sig) {
    const p = PROMPTS[sig]; if (!p) return;
    promptSig = sig;
    const el = $("#prompt"); el.textContent = T(p[0], p[1]); el.hidden = false;
    if (sig === "fsexit") $("#reFs").hidden = false;
    clearTimeout(promptTimer); if (sig !== "fsexit") promptTimer = setTimeout(() => { el.hidden = true; }, 10000);
  }
  function renderOwn() {
    const ul = $("#ownLog");
    if (!own.length) { ul.innerHTML = `<li class="empty">${U.esc(T("exam.lab.ownEmpty", "ยังไม่มีเหตุการณ์"))}</li>`; return; }
    ul.innerHTML = own.slice().reverse().slice(0, 200).map(e => {
      const told = e.lvl === "watch" || e.lvl === "check" ? T("exam.lab.toldCheck", "แจ้งผู้คุมสอบให้มาดู") : e.lvl === "setup" ? T("exam.lab.toldSetup", "แจ้งให้ปรับการติดตั้ง") : T("exam.lab.toldInfo", "บันทึกไว้");
      return `<li><time>${U.esc(U.time(e.t))}</time><span>${U.esc(U.reason(e))}</span><span class="note">— ${U.esc(told)}</span></li>`;
    }).join("");
  }

  /* ---------- events out ---------- */
  function handle(evs) {
    for (const ev of evs) {
      if (ev.lvl === "prompt") { prompt(ev.sig); continue; }
      if (ev.lvl === "end") { if (ev.sig === "noface") $("#prompt").hidden = true; continue; }
      if (ev.local) continue;
      if (ev.prompt || ev.lvl === "setup" || (ev.lvl !== "info" && PROMPTS[ev.sig])) prompt(ev.sig);
      const msg = { v: 1, type: "ev", room, node: nodeId, src: "lab", seat, sig: ev.sig, lvl: ev.lvl, t: Math.round(ev.t) };
      for (const k of ["dur", "n"]) if (Number.isFinite(ev[k])) msg[k] = ev[k];
      if (ev.what) msg.what = ev.what;
      if (ev.code) msg.code = ev.code;
      if (link && link.send(msg)) sent.push(msg);
      own.push({ t: msg.t, sig: msg.sig, lvl: msg.lvl, dur: msg.dur, cnt: msg.n, what: msg.what, code: msg.code });
      while (own.length > 500) own.shift();
      U.store.set(K.log, own);
    }
    if (evs.length) renderOwn();
  }
  function heartbeat() {
    if (!link) return;
    link.send({ v: 1, type: "hb", room, node: nodeId, src: "lab", name: "", seats: [seat], t: Date.now(), fps: Math.round(fpsEma * 10) / 10, q: lastQ.score || 0 });
  }
  function onMessage(m) {
    if (m.type === "prof" && m.profiles) {
      const p = m.profiles[seat] || null;
      if (JSON.stringify(p) !== JSON.stringify(profile)) {
        profile = p; buildMonitor();
        engine(() => (p ? T("exam.lab.profOn", "ผู้คุมสอบตั้งเงื่อนไขเฉพาะบุคคลสำหรับที่นั่งนี้แล้ว") : T("exam.lab.profOff", "ใช้เงื่อนไขมาตรฐาน")), "ok");
      }
    }
  }

  /* ---------- camera + models ---------- */
  async function loadModels() {
    if (TEST || modelsReady) return TEST ? "test" : "ok";
    const b = await LQDetect.tfBackend();
    await Promise.all(["tinyFaceDetector", "faceLandmark68Net"].map(n => faceapi.nets[n].loadFromUri("vendor/models/")));
    try { coco = await LQDetect.loadCoco("vendor/models/cocossd/model.json"); } catch (e) { console.warn("COCO-SSD", e); coco = null; }
    modelsReady = true; return b;
  }
  async function startCamera() {
    engine(() => T("exam.lab.loading", "กำลังเปิดกล้องและโหลดโมเดล (ในเครื่องนี้)..."));
    try {
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error("insecure"), { name: "Insecure" });
      if (!cam) cam = LQCam.create(video, {
        facing: "user", ideal: { width: 640, height: 480 }, persistKey: "lq-exam-cam",
        onChange: (c, ev) => {
          if (ev.type === "started") { $("#camWrap").classList.toggle("mirror", c.mirrored); checkCamLabel(); }
          else if (ev.type === "ended") engine(() => T("exam.lab.camLost", "สัญญาณกล้องหลุด — ระบบกำลังลองเชื่อมต่อใหม่"), "warn");
          else if (ev.type === "reconnected") engine(() => T("exam.lab.camBack", "กล้องกลับมาแล้ว"), "ok");
        }
      });
      const [, b] = await Promise.all([cam.start(), loadModels()]);
      try { cam.attach($("#camPick")); } catch (e) { /* single camera */ }
      engine(() => T("exam.lab.ready", "พร้อม — ตัวประมวลผล: {b} · ภาพไม่ออกจากเครื่องนี้", { b: String(b).toUpperCase() }), "ok");
      running = true; loop();
      renderChecks();
    } catch (e) {
      console.warn(e);
      const msg = window.LQCam && LQCam.errorText ? LQCam.errorText(e) : e.message;
      engine(() => T("exam.lab.camErr", "เปิดกล้องไม่สำเร็จ: {m}", { m: msg || e.name }), "err");
    }
  }
  function checkCamLabel() {
    const label = cam && cam.label || "";
    if (E.isVirtualCamLabel(label) && phase === "exam" && mon) handle(mon.browser(Date.now(), "virtualcam"));
    renderChecks();
  }
  function renderChecks() {
    const items = [];
    const label = cam && cam.label || "";
    items.push(E.isVirtualCamLabel(label) ? ["warn", T("exam.lab.chkVirt", "กล้องที่เลือกดูเหมือนกล้องเสมือน (เช่น OBS) — โปรดเลือกกล้องจริง")] : ["ok", T("exam.lab.chkCam", "กล้อง: {l}", { l: label || T("exam.lab.camUnnamed", "ไม่มีชื่อ") })]);
    const ext = window.screen && /** @type {any} */ (window.screen).isExtended;
    items.push(ext === true ? ["warn", T("exam.lab.chkScreens", "พบจอภาพมากกว่าหนึ่งจอ — ถ้าไม่ได้รับอนุญาตโปรดถอดจอที่สอง")] : ["ok", ext === false ? T("exam.lab.chkOne", "จอภาพ: หนึ่งจอ") : T("exam.lab.chkUnknown", "เบราว์เซอร์นี้ไม่บอกจำนวนจอภาพ")]);
    items.push(lastFaces.length === 1 ? ["ok", T("exam.lab.chkFace", "เห็นใบหน้าหนึ่งใบหน้า")] : ["warn", lastFaces.length ? T("exam.lab.chkMany", "เห็น {n} ใบหน้า — ควรมีเพียงคุณในภาพ", { n: lastFaces.length }) : T("exam.lab.chkNoFace", "ยังไม่เห็นใบหน้า — ขยับให้อยู่ในกรอบและเพิ่มแสง")]);
    $("#checks").innerHTML = items.map(([k, s]) => `<li class="${k === "ok" ? "" : "warn-li"}">${k === "ok" ? "✓" : "!"} ${U.esc(s)}</li>`).join("");
  }
  const qCanvas = document.createElement("canvas"); qCanvas.width = 160; qCanvas.height = 120;
  function quality(t) {
    if (t - qAt < 1000) return lastQ;
    qAt = t;
    let st = null;
    try { const c = qCanvas.getContext("2d", { willReadFrequently: true }); c.drawImage(video, 0, 0, 160, 120); st = LQSite.frameStats(c.getImageData(0, 0, 160, 120)); } catch (e) { st = null; }
    if (st && frozen.push(t, st.thumb) && phase === "exam" && mon) handle(mon.browser(Date.now(), "frozen"));
    const fake = TEST ? /** @type {any} */ (window).__LQ_FAKE_Q : null;
    lastQ = fake || (TEST ? { ok: true, code: "ok", score: 90 } : E.lightingVerdict(st));
    const m = $("#lightMeter"); m.setAttribute("aria-valuenow", String(lastQ.score)); m.querySelector("i").style.width = lastQ.score + "%";
    $("#lightVal").textContent = lastQ.score + "/100";
    const lm = $("#lightMsg");
    lm.textContent = lastQ.ok ? T("exam.lab.lightOk", "แสงและภาพใช้ได้") : T("exam.lab.lightBad", "ปรับการติดตั้ง: {w}", { w: U.what(lastQ.code) || lastQ.code });
    lm.className = "status " + (lastQ.ok ? "ok" : "warn");
    return lastQ;
  }
  async function observe() {
    const W = video.videoWidth, H = video.videoHeight;
    if (!W || !H) return null;
    const faces = [];
    let objects;
    if (TEST) {
      objects = [];
      for (const f of LQDetect.fake("exam-lab", performance.now()) || []) {
        if (f.cls) { objects.push({ cls: f.cls, score: f.score != null ? f.score : 0.9 }); continue; }
        const box = { x: f.x * W, y: f.y * H, w: f.w * W, h: f.h * H };
        faces.push(Object.assign(E.poseFrom68(E.synth68(box, f.yaw || 0, f.pitch || 0, f.mar != null ? f.mar : 0.05)), { box }));
      }
    } else {
      const r = await LQDetect.detectFacesCascade(faceapi, video, { sizes: [320, 224], scoreThreshold: 0.5, descriptors: false });
      for (const x of r) { const b = x.detection.box; faces.push(Object.assign(E.poseFrom68(x.landmarks.positions), { box: { x: b.x, y: b.y, w: b.width, h: b.height } })); }
      if (coco && cocoN++ % 3 === 0) {
        const d = await LQDetect.detectCoco(coco, video, { classes: [76, 83, 72, 71], minScore: 0.4, max: 10 });
        objects = d.map(o => ({ cls: COCO_NAME[o.cls], score: o.score }));
      }
    }
    return { faces, objects, W, H };
  }
  function draw(o) {
    if (!o) return;
    if (overlay.width !== o.W) { overlay.width = o.W; overlay.height = o.H; }
    const c = overlay.getContext("2d"); c.clearRect(0, 0, o.W, o.H);
    c.lineWidth = 3; c.strokeStyle = o.faces.length === 1 ? "#3ddc84" : "#ffd23f";
    const mir = cam && cam.mirrored;
    for (const f of o.faces) { const b = f.box; c.strokeRect(mir ? o.W - b.x - b.w : b.x, b.y, b.w, b.h); }
  }
  async function loop() {
    if (!running) return;
    const t0 = performance.now();
    try {
      const o = await observe();
      if (o) {
        const now = Date.now(), q = quality(t0);
        lastFaces = o.faces; draw(o); frames++;
        if (lastTick) fpsEma = fpsEma ? fpsEma * 0.8 + 0.2 * (1000 / Math.max(1, t0 - lastTick)) : 1000 / Math.max(1, t0 - lastTick);
        lastTick = t0;
        if (phase === "cam" && frames % 4 === 0) renderChecks();
        if (phase === "cal") calStep(now, o);
        if (phase === "exam" && mon) handle(mon.frame(now, { faces: o.faces, objects: o.objects, quality: q }));
      }
    } catch (e) { console.warn(e); }
    if (running) setTimeout(loop, Math.max(30, 250 - (performance.now() - t0)));
  }

  /* ---------- calibration ---------- */
  function startCal() {
    const q = Number(P.get("calsec"));
    calLen = Number.isFinite(q) && q >= 1 && q <= 300 ? q : Number($("#calLen").value) || 120;
    calSamples = []; calEnd = Date.now() + calLen * 1000;
    $("#toExam").disabled = true; show("cal");
    $("#calMsg").textContent = T("exam.lab.calRun", "กำลังปรับเทียบ... มองจอตามปกติ เหลือ {n} วินาที", { n: calLen });
  }
  function calStep(now, o) {
    const f = o.faces.length === 1 ? o.faces[0] : null;
    calSamples.push({ faces: o.faces.length, yaw: f ? f.yaw : null, pitchN: f ? f.pitchN : null });
    const left = Math.max(0, calEnd - now);
    $("#calBar").style.width = Math.round(100 * (1 - left / (calLen * 1000))) + "%";
    if (left > 0) { $("#calMsg").textContent = T("exam.lab.calRun", "กำลังปรับเทียบ... มองจอตามปกติ เหลือ {n} วินาที", { n: Math.ceil(left / 1000) }); return; }
    const b = E.calibrate(calSamples);
    buildMonitor(); mon.setBaseline(b);
    U.store.set(K.lab, { room, seat, baseline: b });
    phase = "calDone";
    $("#calMsg").textContent = b.ok ? T("exam.lab.calOk", "ปรับเทียบแล้ว — ระบบจะเทียบการหันศีรษะกับท่าปกติของคุณ")
      : T("exam.lab.calFail", "ปรับเทียบไม่สำเร็จ (เห็นใบหน้าชัดเพียง {p}% ของเวลา) — ระบบจะไม่ดูการหันศีรษะ คุณยังเริ่มสอบได้ หรือปรับแสงแล้วปรับเทียบใหม่", { p: Math.round(b.onePct * 100) });
    $("#calMsg").className = "status " + (b.ok ? "ok" : "warn");
    $("#toExam").disabled = false;
  }

  /* ---------- browser signals ---------- */
  const B = (type, data) => { if (phase === "exam" && mon) handle(mon.browser(Date.now(), type, data)); };
  function wireBrowser() {
    window.addEventListener("blur", () => B("blur"));
    window.addEventListener("focus", () => B("focus"));
    document.addEventListener("visibilitychange", () => B(document.hidden ? "hidden" : "visible"));
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) { wasFs = true; $("#reFs").hidden = true; if (!$("#prompt").hidden && $("#prompt").textContent === T(PROMPTS.fsexit[0], PROMPTS.fsexit[1])) $("#prompt").hidden = true; }
      else if (wasFs) { wasFs = false; B("fsexit"); }
    });
    for (const ty of ["copy", "cut", "contextmenu"]) document.addEventListener(ty, () => B(ty));
    document.addEventListener("paste", e => { let n = 0; try { n = ((e.clipboardData && e.clipboardData.getData("text")) || "").length; } catch (x) { n = 0; } B("paste", { len: n }); });
    window.addEventListener("beforeprint", () => B("print"));
    const ps = e => { if (e.key === "PrintScreen") B("printscreen"); };
    document.addEventListener("keyup", ps); document.addEventListener("keydown", ps);
    try { /** @type {any} */ (window.screen).addEventListener("change", () => B("screens", { extended: !!(/** @type {any} */ (window.screen).isExtended) })); } catch (e) { /* no Window Management API */ }
    if (navigator.mediaDevices) navigator.mediaDevices.addEventListener("devicechange", () => { B("devicechange"); setTimeout(checkCamLabel, 500); });
    window.addEventListener("online", () => B("online"));
    window.addEventListener("offline", () => B("offline"));
  }
  try {
    const nav = /** @type {any} */ (performance.getEntriesByType("navigation")[0]);
    reloadPending = !!sessionStorage.getItem(K.active) && nav && nav.type === "reload";
  } catch (e) { reloadPending = false; }

  /* ---------- flow ---------- */
  const saved = U.store.get(K.lab, null);
  if (saved) { $("#room").value = saved.room || ""; $("#seat").value = saved.seat || ""; }
  if (P.get("room")) $("#room").value = U.cleanRoom(P.get("room"));
  if (P.get("seat")) $("#seat").value = U.cleanSeat(P.get("seat"));

  $("#noticeForm").addEventListener("submit", e => {
    e.preventDefault();
    room = U.cleanRoom($("#room").value); seat = U.cleanSeat($("#seat").value);
    const msg = $("#noticeMsg");
    if (!room || !seat) { msg.textContent = T("exam.lab.needIds", "กรอกรหัสห้องสอบและเลขที่นั่ง (ตัวอักษรอังกฤษหรือตัวเลข)"); return; }
    if (!$("#consent").checked) { msg.textContent = T("exam.lab.needConsent", "โปรดอ่านประกาศและติ๊กยินยอมก่อน หรือกด “ขอทางเลือกอื่น”"); return; }
    msg.textContent = "";
    $("#room").value = room; $("#seat").value = seat;
    U.store.set(K.lab, { room, seat });
    if (link) link.close();
    link = L.create({ room, onMessage });
    buildMonitor();
    show("cam"); startCamera();
    clearInterval(hbTimer); hbTimer = setInterval(heartbeat, 5000); setTimeout(heartbeat, 300);
  });
  $("#decline").addEventListener("click", () => {
    $("#noticeMsg").textContent = T("exam.lab.declined", "ระบบจะไม่เปิดกล้อง โปรดแจ้งผู้คุมสอบเพื่อขอทางเลือกอื่น เช่น สอบในห้องที่มีผู้คุมสอบดูแล การไม่ยินยอมไม่ทำให้คุณเสียสิทธิ์สอบ");
  });
  $("#toCal").addEventListener("click", startCal);
  $("#toExam").addEventListener("click", async () => {
    try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch (e) { /* refused: the exam still starts */ }
    wasFs = !!document.fullscreenElement;
    show("exam");
    try { sessionStorage.setItem(K.active, room + "|" + seat); } catch (e) { /* ignore */ }
    if (reloadPending) { reloadPending = false; B("reload"); }
    const ext = /** @type {any} */ (window.screen).isExtended;
    if (ext === true) B("screens", { extended: true });
    if (E.isVirtualCamLabel(cam && cam.label)) B("virtualcam");
    heartbeat();
  });
  $("#reFs").addEventListener("click", async () => { try { await document.documentElement.requestFullscreen(); } catch (e) { /* ignore */ } });
  $("#endExam").addEventListener("click", () => {
    running = false; clearInterval(hbTimer);
    try { cam && cam.stop(); } catch (e) { /* ignore */ }
    try { sessionStorage.removeItem(K.active); } catch (e) { /* ignore */ }
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
    wasFs = false; show("done");
    $("#monitor").hidden = true;
    engine(() => T("exam.lab.ended", "ส่งข้อสอบแล้ว กล้องปิดแล้ว บันทึกเหตุการณ์ของคุณยังดูได้ด้านล่าง"), "ok");
  });
  $("#exportOwn").addEventListener("click", () => L.exportFile(`lensiq-exam-${room || "room"}-${seat || "seat"}.json`, sent.length ? sent : own.map(e => ({ v: 1, type: "ev", room: room || "room", node: nodeId, src: "lab", seat: seat || "0", sig: e.sig, lvl: e.lvl, t: e.t }))));
  wireBrowser();
  renderOwn();
  engine(() => T("exam.lab.engine0", "ยังไม่ได้เปิดกล้อง"));
  window.addEventListener("lq-lang", () => {
    renderOwn(); if (phase === "cam") renderChecks();
    if (lastEngine) engine(lastEngine[0], lastEngine[1]);
    const pe = $("#prompt"); if (!pe.hidden && promptSig && PROMPTS[promptSig]) pe.textContent = T(PROMPTS[promptSig][0], PROMPTS[promptSig][1]);
    qAt = 0; // re-render the light message in the new language on the next frame
  });

  /** @type {any} */ (window).__LQ_EXAM_LAB = {
    get phase() { return phase; }, get mon() { return mon; }, get baseline() { return mon && mon.baseline; },
    own, sent, get link() { return link; }, get quality() { return lastQ; }, get faces() { return lastFaces; }, nodeId
  };
})();
