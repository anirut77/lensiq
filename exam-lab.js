/* exam-lab.js — LENSIQ Exam Mode B: candidate page (exam-lab.html).
 * Flow: notice + consent -> camera & lighting check -> calibration (baseline head pose) -> fullscreen exam.
 * Frames are analysed on this device (MediaPipe Face Landmarker via lensiq-exam-face.js for face presence, count and head
 * pose; COCO-SSD on the standalone TF.js runtime for phone / book / laptop / screen). face-api.js is never loaded unless the
 * device's "Research demo" switch is on AND the URL has ?faceengine=faceapi (LQExamFace.pickEngine);
 * only JSON events (LQExam.cleanMsg) go to the room dashboard (exam-link.js). No image, audio or name ever leaves the page.
 * Test seams (localhost + ?fakedet, LQDetect.isTest()): no models; window.__LQ_FAKE_DET("exam-lab") returns
 *   [{x,y,w,h, yaw?, pitch?, mar?}] faces (normalised; turned into 68 synthetic landmarks) and [{cls:"phone"|..., score}] objects;
 *   window.__LQ_FAKE_Q = {ok, code, score} overrides the lighting verdict. ?calsec=N shortens calibration. window.__LQ_EXAM_LAB = state.
 *   Fake faces go through the same pose code as the real engine (LQExamFace.synthMesh -> poseFromMesh).
 * Face detector cannot load or run (decided only by an actual failure of init() or detect(), never by a WebGL probe; seen on
 *   a Mac Chrome with WebGL disabled, and with WebAssembly removed): the face signals are switched off and said so
 *   (candidate: status line; invigilator: one "fix setup" event, code "faceoff"); an absent detector never reads as "no face".
 *   __LQ_EXAM_LAB.faceRuns counts successful detector calls.
 * Evidence clip (opt-in per exam, default OFF; ?clip=1&clipauto=1&clipdays=N or the invigilator settings): the notice and
 *   consent text change BEFORE consent, then the setting is locked. During the exam the last 10 s of video (no audio) stay in
 *   memory; a Watch / Check flag copies them to a pending slot that is encrypted to this device only when the invigilator
 *   taps "keep clip" on the dashboard (or auto-keep). Never uploaded (exam-clip-ui.js / lensiq-exam-clip.js).
 */
/* global LQCam, LQDetect, LQSite */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), E = W.LQExam, F = W.LQExamFace, U = W.LQExamUI, L = W.LQExamLink, T = U.T;
  const $ = s => document.querySelector(s);
  const TEST = !!(window.LQDetect && LQDetect.isTest());
  const DEMO = !!(W.LQDemo && W.LQDemo.on); // sales demo mode (?demo=1, lensiq-demo.js): a sample session without the camera
  const P = U.params();
  const K = { node: "lq-exam-node", lab: "lq-exam-lab", log: "lq-exam-lab-log", active: "lq-exam-active" };
  const COCO_NAME = { 76: "phone", 83: "book", 72: "laptop", 71: "screen" };
  const video = /** @type {HTMLVideoElement} */ ($("#video")), overlay = /** @type {HTMLCanvasElement} */ ($("#overlay"));
  let nodeId = U.store.get(K.node, null);
  if (!/^[a-z0-9]{6,24}$/.test(String(nodeId))) { nodeId = L.newNodeId(); U.store.set(K.node, nodeId); }

  let phase = "notice", room = "", seat = "", link = null, mon = null, cam = null, coco = null, modelsReady = false;
  let faceEng = null, faceOff = false, faceOffSent = false, faceRuns = 0;
  let running = false, profile = null, lastQ = { ok: true, code: "ok", score: 0 }, lastFaces = [], frames = 0, fpsEma = 0, lastTick = 0;
  let calSamples = [], calEnd = 0, calLen = 120, hbTimer = null, promptTimer = null, wasFs = false, reloadPending = false;
  const own = U.store.get(K.log, []).filter(e => e && E.SIGNALS[e.sig]);
  const sent = [];
  const frozen = E.createFrozen({ ms: 4000 });
  let qAt = 0, cocoN = 0, evSeq = 0, peopleN = 0, peopleAt = -Infinity;
  const evTag = L.newNodeId().slice(0, 4); // event ids unique per page load: "e<n>-<tag>" (≤ 16 chars, CODE_RE)
  const Clip = W.LQExamClip;
  let clipCfg = Clip.cfgFromParams(P, null);
  const clips = W.LQExamClipUI.create({
    send: m => link && link.send(m), ctx: () => ({ room, node: nodeId, src: "lab" }),
    listEl: $("#clipList"), statusEl: $("#clipStatus"),
    onState: (id, st) => { const e = own.find(x => x.id === id); if (e) { e.clipSt = st; U.store.set(K.log, own); renderOwn(); } }
  });

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
    multiface: ["exam.lab.pMulti", "เห็นมากกว่าหนึ่งคนในภาพ — หากมีคนอื่นอยู่ใกล้ โปรดแจ้งผู้คุมสอบ"],
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
      const clipTxt = e.clipSt ? W.LQExamClipUI.stateText(e.clipSt) : "";
      return `<li><time>${U.esc(U.time(e.t))}</time><span>${U.esc(U.reason(e))}</span><span class="note">— ${U.esc(told)}</span>` +
        `${clipTxt ? `<span class="clip-tag">${U.esc(clipTxt)}</span>` : ""}</li>`;
    }).join("");
  }

  /* ---------- events out ---------- */
  function handle(evs) {
    for (const ev of evs) {
      if (ev.lvl === "prompt") { prompt(ev.sig); continue; }
      if (ev.lvl === "end") { if (ev.sig === "noface") $("#prompt").hidden = true; continue; }
      if (ev.local) continue;
      if (ev.code !== "faceoff" && (ev.prompt || ev.lvl === "setup" || (ev.lvl !== "info" && PROMPTS[ev.sig]))) prompt(ev.sig);
      const msg = { v: 1, type: "ev", room, node: nodeId, src: "lab", seat, sig: ev.sig, lvl: ev.lvl, t: Math.round(ev.t), id: "e" + (++evSeq).toString(36) + "-" + evTag };
      for (const k of ["dur", "n"]) if (Number.isFinite(ev[k])) msg[k] = ev[k];
      if (ev.what) msg.what = ev.what;
      if (ev.code) msg.code = ev.code;
      if (link && link.send(msg)) sent.push(msg);
      own.push({ t: msg.t, sig: msg.sig, lvl: msg.lvl, dur: msg.dur, cnt: msg.n, what: msg.what, code: msg.code, id: msg.id });
      if (clipCfg.on) clips.onFlag(msg);
      while (own.length > 500) own.shift();
      U.store.set(K.log, own);
    }
    if (evs.length) renderOwn();
  }
  function heartbeat() {
    if (!link) return;
    link.send({ v: 1, type: "hb", room, node: nodeId, src: "lab", name: "", seats: [seat], t: Date.now(), fps: Math.round(fpsEma * 10) / 10, q: lastQ.score || 0, clip: clips.armed });
  }
  function onMessage(m) {
    if (m.type === "keep") { clips.onMessage(m); return; }
    if (m.type === "prof" && m.profiles) {
      const p = m.profiles[seat] || null;
      if (JSON.stringify(p) !== JSON.stringify(profile)) {
        profile = p; buildMonitor();
        engine(() => (p ? T("exam.lab.profOn", "ผู้คุมสอบตั้งเงื่อนไขเฉพาะบุคคลสำหรับที่นั่งนี้แล้ว") : T("exam.lab.profOff", "ใช้เงื่อนไขมาตรฐาน")), "ok");
      }
    }
  }

  /* ---------- camera + models ---------- */
  const faceOffText = () => T("exam.lab.faceOff",
    "ตัวตรวจใบหน้าทำงานในเครื่องนี้ไม่ได้ (เช่น เบราว์เซอร์ไม่รองรับ WebGL หรือ WebAssembly): ระบบจะไม่ดูใบหน้า จำนวนใบหน้า และการหันศีรษะ ผู้คุมสอบจะเห็นว่าต้องปรับการติดตั้ง ไม่ใช่ความผิดของคุณ");
  /** the face engine cannot run here: face signals off, said so once to the invigilator ("fix setup", not an alert) */
  function setFaceOff() {
    if (!faceOff) { faceOff = true; lastFaces = []; engine(faceOffText, "warn"); renderChecks(); }
    if (phase === "exam" && !faceOffSent) { faceOffSent = true; handle([{ sig: "setup", lvl: "setup", t: Date.now(), code: "faceoff" }]); }
  }
  async function loadModels() {
    if (modelsReady) return TEST ? "test" : "ok";
    if (TEST) { modelsReady = true; return "test"; }
    const b = await LQDetect.tfBackend();
    faceEng = F.create(F.pickEngine(window));
    try { await faceEng.init(); } catch (e) { console.warn("face engine", e); faceOff = true; }
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
          else if (ev.type === "reconnected") { engine(() => T("exam.lab.camBack", "กล้องกลับมาแล้ว"), "ok"); if (phase === "exam" && clipCfg.on) clips.arm(video.srcObject); }
        }
      });
      const [, b] = await Promise.all([cam.start(), loadModels()]);
      try { cam.attach($("#camPick")); } catch (e) { /* single camera */ }
      engine(() => T("exam.lab.ready", "พร้อม — ตัวประมวลผล: {b} · ภาพไม่ออกจากเครื่องนี้", { b: String(b).toUpperCase() }), "ok");
      if (faceOff) { faceOff = false; setFaceOff(); }
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
    items.push(faceOff ? ["warn", T("exam.lab.chkFaceOff", "ตัวตรวจใบหน้าทำงานในเครื่องนี้ไม่ได้ — ระบบจะไม่ดูใบหน้าและการหันศีรษะ")]
      : lastFaces.length === 1 ? ["ok", T("exam.lab.chkFace", "เห็นใบหน้าหนึ่งใบหน้า")]
      : ["warn", lastFaces.length ? T("exam.lab.chkMany", "เห็น {n} ใบหน้า — ควรมีเพียงคุณในภาพ", { n: lastFaces.length })
        : T("exam.lab.chkNoFace", "ยังไม่เห็นใบหน้า — ขยับให้อยู่ในกรอบและเพิ่มแสง")]);
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
      const fa = F.pickEngine(window) === "faceapi";
      const fake = LQDetect.fake("exam-lab", performance.now()) || [];
      peopleN = F.peopleBoxes(fake.filter(f => f.cls === "person").map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h, score: f.score != null ? f.score : 0.9 }))).length; peopleAt = performance.now();
      for (const f of fake) {
        if (f.cls === "person") continue;
        if (f.cls) { objects.push({ cls: f.cls, score: f.score != null ? f.score : 0.9 }); continue; }
        const box = { x: f.x * W, y: f.y * H, w: f.w * W, h: f.h * H }, mar = f.mar != null ? f.mar : 0.05;
        const m = F.synthMesh(box, f.yaw || 0, f.pitch || 0, mar, W, H);
        faces.push(Object.assign(fa ? E.poseFrom68(E.synth68(box, f.yaw || 0, f.pitch || 0, mar)) : F.poseFromMesh(m.lms, W, H, { matrix: m.matrix }), { box }));
      }
    } else {
      if (!faceOff && faceEng) {
        try { for (const f of await faceEng.detect(video)) faces.push(f); faceRuns++; } catch (e) { console.warn("face engine", e); setFaceOff(); }
      }
      if (coco && cocoN++ % 3 === 0) {
        // one inference, two decodes: phones / books exactly as before, and person boxes for the second-person cue
        // (LQExamFace.LAB_PEOPLE = option N4@0.5 of docs/exam/FACE-ENGINE-RESULTS.md §7.2). Boxes are counted, never kept.
        const [d, pers] = await LQDetect.detectCocoMulti(coco, video, [{ classes: [76, 83, 72, 71], minScore: 0.4, max: 10 },
          { classes: [0], minScore: F.LAB_PEOPLE.minScore, iou: F.LAB_PEOPLE.iou, max: F.LAB_PEOPLE.max }]);
        objects = d.map(o => ({ cls: COCO_NAME[o.cls], score: o.score }));
        peopleN = F.peopleBoxes(pers).length; peopleAt = performance.now();
      }
    }
    // the person count is read on every 3rd frame; it is used until the next read, never when older than 2 s
    const people = performance.now() - peopleAt <= 2000 ? peopleN : 0;
    return { faces, objects, people, W, H, faceOff };
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
        if (phase === "exam" && mon) handle(mon.frame(now, { faces: o.faces, objects: o.objects, people: o.people, quality: q, faceOff: o.faceOff }));
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
      : faceOff ? T("exam.lab.calOff", "ปรับเทียบการหันศีรษะไม่ได้ เพราะตัวตรวจใบหน้าทำงานในเครื่องนี้ไม่ได้ คุณยังเริ่มสอบได้")
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

  /* ---------- evidence clip: notice + consent text follow the setting until consent is given ---------- */
  function clipNotice() {
    const on = clipCfg.on;
    $("#n2").hidden = on; $("#n2c").hidden = !on; $("#n5c").hidden = !on;
    $("#lead").hidden = on; $("#leadC").hidden = !on;
    $("#consentTxt").hidden = on; $("#consentClip").hidden = !on;
    $("#n5c").textContent = !on ? "" : clipCfg.auto
      ? T("exam.lab.n5a",
        "คลิปหลักฐาน (สถาบันเปิดใช้สำหรับการสอบนี้): ระหว่างสอบ เครื่องนี้จำภาพวิดีโอ 10 วินาทีล่าสุดไว้ในหน่วยความจำ (ไม่มีเสียง) เมื่อมีการแจ้งให้ผู้คุมสอบมาดู คลิปช่วงนั้นจะถูกเก็บในเครื่องนี้โดยอัตโนมัติ แบบเข้ารหัส ไม่ถูกส่งออกจากเครื่อง และลบเองภายใน {d} วัน คลิปใช้ประกอบการตรวจของผู้คุมสอบเท่านั้น ไม่ใช่การตัดสิน",
        { d: clipCfg.days })
      : T("exam.lab.n5c",
        "คลิปหลักฐาน (สถาบันเปิดใช้สำหรับการสอบนี้): ระหว่างสอบ เครื่องนี้จำภาพวิดีโอ 10 วินาทีล่าสุดไว้ในหน่วยความจำ (ไม่มีเสียง) เมื่อมีการแจ้งให้ผู้คุมสอบมาดู คลิปช่วงนั้นอาจถูกเก็บในเครื่องนี้ถ้าผู้คุมสอบกด “เก็บคลิป” แบบเข้ารหัส ไม่ถูกส่งออกจากเครื่อง และลบเองภายใน {d} วัน ถ้าไม่มีใครกดเก็บ คลิปจะถูกลบจากหน่วยความจำ",
        { d: clipCfg.days });
    $("#monClip").hidden = !on;
    $("#clipBox").hidden = !on && !clips.kept.length;
    $("#clipOn").checked = on; $("#clipAuto").checked = clipCfg.auto; $("#clipAuto").disabled = !on || phase !== "notice"; $("#clipDays").value = String(clipCfg.days);
  }
  function readClipCfg() {
    if (phase !== "notice") return; // locked after consent: the candidate agreed to what the notice said
    const before = JSON.stringify(clipCfg);
    clipCfg = Clip.cleanCfg({ on: $("#clipOn").checked, auto: $("#clipAuto").checked, days: +$("#clipDays").value });
    clips.setCfg(clipCfg); clipNotice();
    if (JSON.stringify(clipCfg) !== before && $("#consent").checked) {
      $("#consent").checked = false; // the candidate must tick the wording they actually read
      $("#noticeMsg").textContent = T("exam.lab.reread", "ประกาศเปลี่ยนแล้ว โปรดอ่านอีกครั้งแล้วติ๊กยินยอมใหม่");
    }
  }
  for (const id of ["#clipOn", "#clipAuto", "#clipDays"]) $(id).addEventListener("change", readClipCfg);
  clips.setCfg(clipCfg);
  clips.refresh().then(clipNotice);

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
    if (clipCfg.on && !clips.pin.has()) { msg.textContent = T("exam.lab.needPin", "ผู้คุมสอบ: ตั้ง PIN สำหรับคลิปหลักฐานในกล่อง “คลิปหลักฐานในเครื่องนี้” ก่อน หรือปิดคลิปหลักฐาน"); $("#clipBox").open = true; return; }
    msg.textContent = "";
    clips.lock(); // the candidate never sees the kept-clip list
    for (const id of ["#clipOn", "#clipAuto", "#clipDays"]) $(id).disabled = true; // consent covers exactly this setting
    $("#room").value = room; $("#seat").value = seat;
    U.store.set(K.lab, { room, seat });
    if (link) link.close();
    link = L.create({ room, onMessage });
    buildMonitor();
    if (DEMO) { // no camera, no models: straight to the exam step; events come from the demo panel's buttons
      const mon = document.querySelector('#monitor [data-i18n="exam.lab.mon"]'); // walkthrough W-021: never "camera is running" in the demo
      if (mon) { mon.setAttribute("data-i18n", "demo.exam.mon"); mon.textContent = T("demo.exam.mon", "โหมดสาธิต: ไม่ได้เปิดกล้อง · ไม่มีการส่งภาพ"); }
      show("exam"); wasFs = false;
      engine(() => T("demo.exam.engine", "โหมดสาธิต: ไม่ได้เปิดกล้อง เหตุการณ์ในบันทึกเป็นตัวอย่าง"), "warn");
    } else { show("cam"); startCamera(); }
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
    clips.lock();
    if (clipCfg.on) { clips.arm(video.srcObject); $("#clipBox").hidden = false; } // count only; list needs the invigilator PIN
    const ext = /** @type {any} */ (window.screen).isExtended;
    if (ext === true) B("screens", { extended: true });
    if (E.isVirtualCamLabel(cam && cam.label)) B("virtualcam");
    if (faceOff) setFaceOff(); // tells the invigilator once: face signals are off on this device ("fix setup")
    heartbeat();
  });
  $("#reFs").addEventListener("click", async () => { try { await document.documentElement.requestFullscreen(); } catch (e) { /* ignore */ } });
  $("#endExam").addEventListener("click", () => {
    running = false; clearInterval(hbTimer);
    clips.disarm(); // the memory ring stops; pending clips stay keepable for their 10-min window, kept (encrypted) clips until their auto-delete date
    clips.lock();
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
    renderOwn(); if (phase === "cam") renderChecks(); clipNotice();
    if (lastEngine) engine(lastEngine[0], lastEngine[1]);
    const pe = $("#prompt"); if (!pe.hidden && promptSig && PROMPTS[promptSig]) pe.textContent = T(PROMPTS[promptSig][0], PROMPTS[promptSig][1]);
    qAt = 0; // re-render the light message in the new language on the next frame
  });

  /** @type {any} */ (window).__LQ_EXAM_LAB = {
    get phase() { return phase; }, get mon() { return mon; }, get baseline() { return mon && mon.baseline; },
    own, sent, get link() { return link; }, get quality() { return lastQ; }, get faces() { return lastFaces; }, nodeId, clips, get clipCfg() { return clipCfg; },
    get faceEngine() { return faceEng ? faceEng.name : TEST ? "test" : null; }, get faceOff() { return faceOff; }, get faceRuns() { return faceRuns; }
  };
  // demo mode only: a simulated event goes through the same path as a real one (own log, gentle prompt, room link)
  if (DEMO) /** @type {any} */ (window).__LQ_EXAM_LAB.demoEvent = (/** @type {string} */ sig) => {
    const s = E.SIGNALS[sig]; if (!s) return;
    const extra = sig === "noface" ? { dur: 5000 } : sig === "multiface" ? { n: 2 } : sig === "phone" ? { what: "phone" } : sig === "away" ? { dur: 3000 } : {};
    handle([Object.assign({ sig, lvl: s.lvl, t: Date.now(), prompt: true }, extra)]);
  };
})();
