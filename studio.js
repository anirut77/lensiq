/* สตูดิโอแต่งชุด AI — ประมวลผลบนเครื่องทั้งหมด (ไม่ส่งภาพออก ไม่เก็บภาพ; เก็บเฉพาะเทมเพลตชุดที่ผู้ใช้เพิ่มเองใน IndexedDB)
 *
 * ขั้นตอน: รูป -> MODNet (PBHQ.modnetAlpha) -> refineMatte + estimateForeground -> ใบหน้า (face-api 68 จุด หรือประมาณจาก matte)
 *   -> คอ/ไหล่จาก silhouette -> ดัดชุดด้วย TPS ให้คาง/ไหล่ตรงกัน -> harmonize (แสงสี/เงาทิศ/สีผิว/grain) -> รีทัชตัวคน
 *   -> composite (ฉากหลัง + ตัวคน + เงาสัมผัส + ชุดผสาน Laplacian + ศีรษะทับคอเสื้อ + light wrap) -> ส่งออก PNG/JPEG/รูปติดบัตร
 * ฟังก์ชันภาพทั้งหมดอยู่ใน studio-core.js (StudioCore) ซึ่งมีรายการแหล่งอ้างอิงของแต่ละเทคนิค
 */
(function () {
  "use strict";
  const SC = window.StudioCore, L = window.PBLayout;
  const $ = s => document.querySelector(s);
  const mk = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx2 = c => c.getContext("2d", { willReadFrequently: true });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const now = () => performance.now();
  const MAX_SIDE = 1200;
  const FAKE = !!(window.LQDetect && LQDetect.isTest());

  // ---------- สถานะระบบ ----------
  const eng = {};
  function status(k, t, c) {
    eng[k] = { t, c }; const e = $("#stEngine"), p = Object.values(eng);
    e.textContent = p.map(x => x.t).join(" · ");
    e.className = "engine " + (p.some(x => x.c === "err") ? "err" : p.some(x => x.c === "warn") ? "warn" : p.every(x => x.c === "ok") ? "ok" : "");
  }
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2800); }

  // ---------- state ----------
  const ST = {
    phase: "idle", W: 0, H: 0, src: null, px: null, alpha: null, fg: null, edit: null, editVer: 0, method: "",
    face: null, body: null, harm: null, masks: null,
    garments: [], gKey: "none", targets: null, manual: null,
    cache: {}, timings: {}, out: null, err: null
  };
  const val = id => +document.getElementById(id).value;
  const chk = id => document.getElementById(id).checked;

  // ---------- โมเดล ----------
  let faceP = null;
  function loadFace() {
    if (faceP) return faceP;
    faceP = (async () => {
      if (FAKE || typeof faceapi === "undefined") throw new Error("skip");
      await LQDetect.tfBackend();
      await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri("vendor/models/"), faceapi.nets.faceLandmark68Net.loadFromUri("vendor/models/")]);
      return true;
    })();
    faceP.then(() => status("face", "ตรวจจุดบนใบหน้าพร้อม", "ok"), e => status("face", e.message === "skip" ? "ประมาณใบหน้าจากรูปทรง" : "ตรวจจุดบนใบหน้าไม่ได้ (ประมาณจากรูปทรงแทน)", e.message === "skip" ? "ok" : "warn"));
    return faceP;
  }
  function init() {
    status("matte", "กำลังโหลดโมเดลตัดพื้นหลัง (MODNet)...", "");
    PBHQ.loadMatting().then(() => status("matte", "ตัดพื้นหลัง MODNet พร้อม", "ok"), e => { console.warn(e); status("matte", "MODNet ใช้ไม่ได้ (ใช้การแยกสีฉากแทน)", "warn"); });
    status("face", "กำลังโหลดตัวตรวจใบหน้า...", "");
    loadFace().catch(() => {});
    loadGarments();
    renderBgChoices(); renderIdSizes();
  }

  // ---------- ชุด ----------
  const NONE = { key: "none", name: "ไม่ใส่ชุด" };
  async function loadGarments() {
    const list = [NONE];
    let items = [];
    try { items = (await PBTpl.all()).filter(i => i.kind === "outfit"); } catch (e) { console.warn("templates", e); }
    for (const it of items) {
      try { const c = await PBTpl.blobToCanvas(it.blob); list.push(tplGarment(it, c)); } catch (e) { console.warn(e); }
    }
    for (const [k, name] of Object.entries(PBOutfits.NAMES)) list.push({ key: "v:" + k, name, kind: "vector", vk: k });
    ST.garments = list;
    if (!list.some(g => g.key === ST.gKey)) ST.gKey = list.find(g => g.kind === "tpl") ? list.find(g => g.kind === "tpl").key : "v:suit_navy";
    if (ST.gKey === "none" && !ST._userNone) ST.gKey = list.find(g => g.kind === "tpl") ? list.find(g => g.kind === "tpl").key : "v:suit_navy";
    renderGarments();
  }
  function tplGarment(it, canvas) {
    const a = it.anchor || {};
    return { key: "tpl:" + it.id, name: it.name, kind: "tpl", item: it, canvas, chin: { x: a.cx, y: a.chinY }, fw: a.fw, faceLum: a.faceLum || null, fit: it.fit || null };
  }
  /** เตรียมชุด: canvas, alpha, จุดยึด (คาง/ไหล่) */
  function prepGarment(g) {
    if (g.kind === "vector" && !g.canvas) { const r = PBOutfits.render(g.vk, 220); g.canvas = r.canvas; g.chin = r.chin; g.fw = r.fw; }
    if (!g.px) {
      const c = g.canvas; g.px = ctx2(c).getImageData(0, 0, c.width, c.height).data;
      g.alpha = new Float32Array(c.width * c.height); for (let i = 0; i < g.alpha.length; i++) g.alpha[i] = g.px[i * 4 + 3] / 255;
    }
    return g;
  }
  function garmentAnchors(g) {
    prepGarment(g);
    if (g.fit) return g.fit;
    const c = g.canvas, sh = SC.garmentShoulders(g.alpha, c.width, c.height, g.chin, g.fw);
    const left = sh ? sh.left : { x: g.chin.x - g.fw * 1.3, y: g.chin.y + g.fw * .75 }, right = sh ? sh.right : { x: g.chin.x + g.fw * 1.3, y: g.chin.y + g.fw * .75 };
    return { chin: { ...g.chin }, l: left, r: right };
  }
  const curG = () => ST.garments.find(g => g.key === ST.gKey) || NONE;

  function thumb(g) {
    const c = mk(90, 108), x = c.getContext("2d");
    x.fillStyle = "#e9eef1"; x.fillRect(0, 0, 90, 108);
    if (g.key === "none") { x.fillStyle = "#c9d1da"; x.beginPath(); x.ellipse(45, 40, 16, 20, 0, 0, 7); x.fill(); x.fillRect(22, 70, 46, 40); return c; }
    x.fillStyle = "#e0b48f"; x.beginPath(); x.ellipse(45, 26, 13, 17, 0, 0, 7); x.fill();
    try {
      prepGarment(g);
      const s = 30 / g.fw; x.drawImage(g.canvas, 45 - g.chin.x * s, 42 - g.chin.y * s, g.canvas.width * s, g.canvas.height * s);
    } catch (e) { console.warn(e); }
    return c;
  }
  function renderGarments() {
    const box = $("#stOutfits"); box.innerHTML = "";
    ST.garments.forEach(g => {
      const b = document.createElement("button"); b.type = "button"; b.className = "choice" + (g.key === ST.gKey ? " on" : "");
      b.setAttribute("aria-pressed", g.key === ST.gKey ? "true" : "false");
      b.append(thumb(g), document.createTextNode(g.name));
      if (g.kind === "tpl") { const t = document.createElement("span"); t.className = "tag-real"; t.textContent = "ภาพจริง"; b.append(t); }
      b.onclick = () => { ST.gKey = g.key; ST._userNone = g.key === "none"; ST.manual = null; renderGarments(); schedule("fit"); };
      box.append(b);
    });
    $("#stAnchorBtn").disabled = curG().key === "none";
  }

  // เพิ่มชุดใหม่: PNG พื้นใส หรือรูปคนใส่ชุด (ตัดพื้นหลัง + ศีรษะด้วย PBTpl.prepareOutfit) -> บันทึกใน IndexedDB
  $("#stGarmentFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    const msg = $("#stGarmentMsg"); msg.textContent = "กำลังเตรียมชุด (ตัดพื้นหลังและศีรษะ)...";
    try {
      try { await loadFace(); } catch { /* ไม่มีตัวตรวจใบหน้า: ใช้จุดยึดจากรูปทรง */ }
      const prep = await PBTpl.prepareOutfit(f), fin = PBTpl.finalizeOutfit(prep, .5);
      const item = { id: crypto.randomUUID(), kind: "outfit", name: f.name.replace(/\.[^.]+$/, "").slice(0, 40) || "ชุดของฉัน", anchor: fin.anchor, blob: await PBTpl.toBlob(fin.canvas), created: Date.now() };
      await PBTpl.put(item);
      const g = tplGarment(item, fin.canvas);
      ST.garments.splice(1, 0, g); ST.gKey = g.key; ST.manual = null;
      msg.textContent = `เพิ่มชุด "${item.name}" แล้ว — ถ้าไหล่ไม่ตรง กด "ตั้งจุดคอ/ไหล่ของชุด"`;
      renderGarments(); schedule("fit");
    } catch (err) { console.warn(err); msg.textContent = "เพิ่มชุดไม่สำเร็จ: " + err.message; }
  };

  // ---------- ตัวแก้จุดยึดของชุด ----------
  const anc = { g: null, pts: null, drag: null, s: 1 };
  function drawAnchor() {
    const g = anc.g, cv = $("#stAnchorCv"), maxW = Math.min(520, window.innerWidth - 64), s = Math.min(maxW / g.canvas.width, 420 / g.canvas.height);
    anc.s = s; cv.width = Math.round(g.canvas.width * s); cv.height = Math.round(g.canvas.height * s);
    const x = cv.getContext("2d"); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(g.canvas, 0, 0, cv.width, cv.height);
    const P = anc.pts;
    x.strokeStyle = "rgba(14,20,48,.6)"; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(P.l.x * s, P.l.y * s); x.lineTo(P.chin.x * s, P.chin.y * s); x.lineTo(P.r.x * s, P.r.y * s); x.stroke(); x.setLineDash([]);
    [["chin", "#674ff2"], ["l", "#0891b2"], ["r", "#0891b2"]].forEach(([k, col]) => { x.fillStyle = col; x.strokeStyle = "#fff"; x.lineWidth = 2; x.beginPath(); x.arc(P[k].x * s, P[k].y * s, 9, 0, 7); x.fill(); x.stroke(); });
  }
  $("#stAnchorBtn").onclick = () => {
    const g = curG(); if (g.key === "none") return;
    anc.g = g; anc.pts = JSON.parse(JSON.stringify(garmentAnchors(g)));
    $("#stAnchorDlg").showModal(); drawAnchor();
  };
  const cvPt = (cv, e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  $("#stAnchorCv").addEventListener("pointerdown", e => {
    const p = cvPt(e.currentTarget, e), s = anc.s; let best = null, bd = 30;
    for (const k of ["chin", "l", "r"]) { const d = Math.hypot(anc.pts[k].x * s - p.x, anc.pts[k].y * s - p.y); if (d < bd) { bd = d; best = k; } }
    if (best) { anc.drag = best; e.currentTarget.setPointerCapture(e.pointerId); }
  });
  $("#stAnchorCv").addEventListener("pointermove", e => { if (!anc.drag) return; const p = cvPt(e.currentTarget, e); anc.pts[anc.drag] = { x: p.x / anc.s, y: p.y / anc.s }; drawAnchor(); });
  $("#stAnchorCv").addEventListener("pointerup", () => { anc.drag = null; });
  $("#stAnchorSave").onclick = async () => {
    const g = anc.g; g.fit = anc.pts;
    if (g.kind === "tpl") { try { g.item = { ...g.item, fit: g.fit }; await PBTpl.put(g.item); } catch (e) { toast("บันทึกจุดยึดไม่สำเร็จ: " + e.message); } }
    $("#stAnchorDlg").close(); ST.manual = null; schedule("fit");
  };
  $("#stAnchorReset").onclick = () => { const g = anc.g, f = g.fit; g.fit = null; anc.pts = JSON.parse(JSON.stringify(garmentAnchors(g))); g.fit = f; drawAnchor(); };
  $("#stAnchorClose").onclick = () => $("#stAnchorDlg").close();

  // ---------- ฉากหลัง ----------
  const BGS = [
    ["blur", "ฉากเดิมเบลอ"], ["orig", "ฉากเดิม"], ["#ffffff", "ขาว"], ["#d7e7f7", "ฟ้าอ่อน"], ["#e4e4e4", "เทาอ่อน"], ["#1f3b6e", "น้ำเงิน"],
    ["grad", "ไล่สีสตูดิโอ"], ["custom", "สีที่เลือก"]
  ];
  let bgKey = "#d7e7f7", bgTpls = [];
  async function renderBgChoices() {
    try { bgTpls = (await PBTpl.all()).filter(i => i.kind === "bg"); } catch { bgTpls = []; }
    const box = $("#stBg");
    box.innerHTML = [...BGS, ...bgTpls.map(t => ["tpl:" + t.id, t.name])].map(([k, n]) => `<button type="button" data-k="${k}" class="${k === bgKey ? "on" : ""}">${esc(n)}</button>`).join("");
    box.querySelectorAll("button").forEach(b => b.onclick = () => { bgKey = b.dataset.k; renderBgChoices(); schedule("bg"); });
    $("#stBgColorRow").hidden = bgKey !== "custom";
  }
  $("#stBgColor").oninput = () => { if (bgKey === "custom") schedule("bg"); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  async function bgPixels(personRGBA) {
    const W = ST.W, H = ST.H, key = bgKey + "|" + (bgKey === "custom" ? $("#stBgColor").value : "") + "|" + (bgKey === "blur" || bgKey === "orig" ? ST.cache.rtKey : "");
    if (ST.cache.bgKey === key) return ST.cache.bg;
    let px;
    if (bgKey === "blur" || bgKey === "orig") {
      const base = ST.cache.rtAll || ST.px;
      px = bgKey === "blur" ? SC.blurredBackground(base, ST.alpha, W, H, Math.max(6, Math.round(Math.max(W, H) / 70))) : new Uint8ClampedArray(base);
    } else {
      const c = mk(W, H), x = c.getContext("2d");
      if (bgKey === "grad") { const g = x.createRadialGradient(W / 2, H * .35, H * .05, W / 2, H * .45, Math.max(W, H) * .8); g.addColorStop(0, "#eef1f5"); g.addColorStop(1, "#7d8794"); x.fillStyle = g; x.fillRect(0, 0, W, H); }
      else if (bgKey.startsWith("tpl:")) {
        const t = bgTpls.find(i => "tpl:" + i.id === bgKey);
        if (t) { const im = await PBTpl.blobToCanvas(t.blob), s = Math.max(W / im.width, H / im.height); x.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s); }
      } else { x.fillStyle = bgKey === "custom" ? $("#stBgColor").value : bgKey; x.fillRect(0, 0, W, H); }
      px = ctx2(c).getImageData(0, 0, W, H).data;
    }
    ST.cache.bgKey = key; ST.cache.bg = px;
    return px;
  }

  // ---------- รูปต้นฉบับ ----------
  async function fileToCanvas(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const c = toWork(bmp); bmp.close && bmp.close(); return c;
  }
  function toWork(src) {
    const w = src.width, h = src.height, k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const c = mk(Math.max(32, Math.round(w * k)), Math.max(32, Math.round(h * k)));
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  $("#stFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { await load(await fileToCanvas(f)); } catch (err) { console.warn(err); toast("เปิดรูปไม่ได้: " + err.message); }
  };

  // ---------- กล้อง (LQCam) ----------
  let cam = null;
  $("#stCamBtn").onclick = async () => {
    const v = $("#stVideo");
    if (!cam) {
      cam = LQCam.create(v, { facing: "user", ideal: { width: 1280, height: 720 }, onChange: c => v.classList.toggle("mirror", !!c.mirrored), onError: (c, e) => { if (e?.name !== "AbortError") toast(LQCam.errorText ? LQCam.errorText(e) : e.message); } });
      cam.attach($("#stCamCtl")); // ปุ่มสลับกล้อง/เลือกกล้อง (ซ่อนเมื่อมีกล้องเดียว)
    }
    $("#stCam").hidden = false;
    try { await cam.start(); v.classList.toggle("mirror", !!cam.mirrored); }
    catch (e) { console.warn(e); toast(LQCam.errorText ? LQCam.errorText(e) : "เปิดกล้องไม่ได้"); $("#stCam").hidden = true; }
  };
  $("#stCamClose").onclick = () => { if (cam) cam.stop(); $("#stCam").hidden = true; };
  $("#stShoot").onclick = async () => {
    const v = $("#stVideo"); if (!v.videoWidth) return toast("กล้องยังไม่พร้อม");
    const c = mk(v.videoWidth, v.videoHeight); c.getContext("2d").drawImage(v, 0, 0); // ไม่กลับด้าน: ให้เหมือนจริง
    cam.stop(); $("#stCam").hidden = true;
    await load(toWork(c));
  };

  // ---------- วิเคราะห์ภาพ ----------
  async function detectFace(src) {
    try { await loadFace(); } catch { return null; }
    try {
      const d = await faceapi.detectSingleFace(src, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: .4 })).withFaceLandmarks();
      if (!d) return null;
      const P = d.landmarks.positions.map(p => ({ x: p.x, y: p.y }));
      const ctr = a => ({ x: a.reduce((s, p) => s + p.x, 0) / a.length, y: a.reduce((s, p) => s + p.y, 0) / a.length });
      let a = ctr(P.slice(36, 42)), b = ctr(P.slice(42, 48)); if (a.x > b.x) [a, b] = [b, a];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return { P, cx: P[8].x, chinX: P[8].x, eyeY: mid.y, chinY: P[8].y, fw: Math.hypot(P[16].x - P[0].x, P[16].y - P[0].y), faceH: Math.hypot(P[8].x - mid.x, P[8].y - mid.y), angle: Math.atan2(b.y - a.y, b.x - a.x), eyeL: a, eyeR: b, detected: true };
    } catch (e) { console.warn("face", e); return null; }
  }

  async function load(canvas) {
    ST.phase = "analyzing"; ST.err = null; ST.cache = {}; ST.manual = null; ST.timings = {};
    const T0 = now();
    ST.src = canvas; ST.W = canvas.width; ST.H = canvas.height;
    ST.px = ctx2(canvas).getImageData(0, 0, ST.W, ST.H).data;
    ST.edit = new Float32Array(ST.W * ST.H); ST.editVer = 0;
    showView(); busy(true, "กำลังตัดพื้นหลัง...");
    await sleep(20);
    const W = ST.W, H = ST.H;
    try {
      let t = now(), raw = null;
      try { raw = await PBHQ.modnetAlpha(canvas); ST.method = "MODNet"; } catch (e) { console.warn("MODNet", e); }
      if (raw) { let s = 0; for (let i = 0; i < raw.length; i += 7) s += raw[i]; if (s / (raw.length / 7) < .02) raw = null; }
      if (!raw) { raw = SC.borderKeyAlpha(ST.px, W, H); ST.method = "แยกสีฉาก"; }
      ST.timings.matte = now() - t; t = now();
      busy(true, "กำลังเกลาขอบผม...");
      await sleep(0);
      ST.alpha = SC.refineMatte(ST.px, raw, W, H, { r: Math.max(2, Math.max(W, H) / 512), k: ST.method === "MODNet" ? 1.6 : 3 });
      ST.timings.refine = now() - t; t = now();
      ST.fg = SC.estimateForeground(ST.px, ST.alpha, W, H);
      ST.timings.foreground = now() - t; t = now();
      busy(true, "กำลังหาใบหน้า คอ และไหล่...");
      let face = await detectFace(canvas);
      if (!face) { face = SC.headFromMatte(ST.alpha, W, H); if (face) { face.chinX = face.cx; face.detected = false; } }
      if (!face) face = { cx: W / 2, chinX: W / 2, eyeY: H * .35, chinY: H * .5, fw: W * .28, faceH: H * .15, angle: 0, detected: false };
      ST.face = face;
      ST.body = SC.estimateBody(ST.alpha, W, H, { cx: face.chinX, chinY: face.chinY, fw: face.fw });
      ST.masks = SC.faceMasks(ST.px, W, H, face, ST.alpha);
      // สถิติสำหรับผสานชุด
      const fb = { x: face.cx - face.fw * .3, y: face.eyeY, w: face.fw * .6, h: (face.chinY - face.eyeY) * .75 };
      const lum = box => { const m = PBTpl.meanLum(ST.px, W, box); return m == null ? null : m; };
      const lr = [lum({ x: fb.x, y: fb.y, w: fb.w / 2, h: fb.h }), lum({ x: fb.x + fb.w / 2, y: fb.y, w: fb.w / 2, h: fb.h })];
      ST.harm = {
        gray: SC.grayWorld(ST.px, W, H, null, { neutral: true }).mean, faceLum: lum(fb), skin: SC.labStats(ST.px, W, H, ST.masks.skin, { thr: .5, step: 2 }) || SC.labStats(ST.px, W, H, null, { box: fb, step: 2 }),
        lr: lr[0] && lr[1] ? lr : null, noise: SC.estimateNoise(ST.px, W, H, ST.alpha, 2), cx: face.chinX, fw: face.fw
      };
      ST.timings.face = now() - t;
      const b = $("#stBefore"); b.width = W; b.height = H; b.getContext("2d").drawImage(canvas, 0, 0);
      for (const id of ["stOut", "stOverlay"]) { const c = document.getElementById(id); c.width = W; c.height = H; }
      ST.phase = "rendering";
      await renderNow("fit");
      ST.timings.firstResult = now() - T0;
      ST.phase = "done";
      const hint = face.detected ? "" : " (ไม่พบจุดบนใบหน้า: ประมาณจากรูปทรง ปรับจุดคอ/ไหล่ได้)";
      status("run", `ตัดพื้นหลังด้วย ${ST.method} · เสร็จใน ${(ST.timings.firstResult / 1000).toFixed(1)} วินาที${hint}`, face.detected ? "ok" : "warn");
      ["#stPng", "#stJpg", "#stIdOne", "#stIdSheet"].forEach(s => $(s).disabled = false);
    } catch (e) {
      console.error(e); ST.phase = "error"; ST.err = String(e && e.message || e); status("run", "ประมวลผลไม่สำเร็จ: " + ST.err, "err");
    } finally { busy(false); }
  }

  // ---------- ปรับชุด ----------
  function autoTargets() {
    const f = ST.face, b = ST.body;
    return { chin: { x: f.chinX, y: f.chinY }, l: { ...b.left }, r: { ...b.right } };
  }
  function adjustedTargets() {
    const T = ST.manual || autoTargets(), f = ST.face, s = val("aScale") / 100, rot = val("aRot") * Math.PI / 180;
    const dx = val("aX") / 100 * f.fw * 2, dy = val("aY") / 100 * f.fw * 2, c = T.chin, cos = Math.cos(rot), sin = Math.sin(rot);
    const tf = p => { const x = (p.x - c.x) * s, y = (p.y - c.y) * s; return { x: c.x + x * cos - y * sin + dx, y: c.y + x * sin + y * cos + dy }; };
    return { chin: tf(T.chin), l: tf(T.l), r: tf(T.r) };
  }
  /** ดัดชุดลงพิกัดภาพ: TPS ที่ทำให้ คาง/ไหล่ซ้าย/ไหล่ขวา ตรงกันพอดี + มุมล่างตาม similarity ของแนวไหล่ */
  function fitGarment(g) {
    prepGarment(g);
    const W = ST.W, H = ST.H, A = garmentAnchors(g), T = adjustedTargets(), c = g.canvas, cw = c.width, ch = c.height;
    const sim = SC.similarity(A.l, A.r, T.l, T.r);
    const extraSrc = [{ x: 0, y: ch }, { x: cw, y: ch }, { x: cw / 2, y: ch }, { x: 0, y: A.chin.y }, { x: cw, y: A.chin.y }];
    const src = [A.chin, A.l, A.r, ...extraSrc], dst = [T.chin, T.l, T.r, ...extraSrc.map(p => sim.map(p.x, p.y))];
    // จุดเสริมด้านบนมีน้ำหนักน้อย: ให้ตามการย่อขยายจากคาง (คอเสื้อไม่บิด)
    dst[6] = { x: T.chin.x + (dst[6].x - sim.map(A.chin.x, A.chin.y).x), y: T.chin.y + (dst[6].y - sim.map(A.chin.x, A.chin.y).y) };
    dst[7] = { x: T.chin.x + (dst[7].x - sim.map(A.chin.x, A.chin.y).x), y: T.chin.y + (dst[7].y - sim.map(A.chin.x, A.chin.y).y) };
    const inv = SC.tpsFit(dst, src, 1e-3);
    const xs = dst.map(p => p.x), ys = dst.map(p => p.y), m = sim.scale * Math.max(cw, ch) * .08;
    const box = { x0: Math.min(...xs) - m, y0: Math.min(...ys) - m, x1: Math.max(...xs) + m, y1: Math.max(...ys) + m };
    const warped = SC.warpRGBA(g.px, cw, ch, W, H, inv.map, { step: 8, box });
    return { warped, targets: T };
  }

  // ---------- รีทัช ----------
  function retouchKey() { return ["rAuto", "rSmooth", "rBlemish", "rEyes", "rUnder", "rTeeth", "rSharp"].map(id => id === "rAuto" ? chk(id) : val(id)).join("|"); }
  function retouch() {
    const key = retouchKey(); if (ST.cache.rtKey === key) return ST.cache.rt;
    const W = ST.W, H = ST.H, f = ST.face, m = ST.masks;
    let px = ST.fg, all = ST.px;
    if (chk("rAuto")) { // gray-world ครึ่งทาง + ความสว่างผิวหน้าเป้าหมาย ~ 160
      const gw = SC.grayWorld(ST.px, W, H, null, { lo: .88, hi: 1.12, neutral: true }), fl = ST.harm.faceLum;
      // แก้เฉพาะภาพที่มืด/สว่างเกิน: ผิวหน้า < 140 ยกขึ้น, > 215 ลดลง
      const ex = !fl ? 1 : fl < 140 ? Math.min(1.3, 150 / fl) : fl > 215 ? Math.max(.9, 200 / fl) : 1, gains = gw.gains.map(g => 1 + (g - 1) * .5);
      px = SC.applyGains(px, W, H, gains, { exposure: ex }); all = SC.applyGains(all, W, H, gains, { exposure: ex });
      for (let i = 0; i < W * H; i++) px[i * 4 + 3] = ST.fg[i * 4 + 3];
    }
    const box = { x: f.cx - f.fw * .8, y: f.eyeY - f.fw * 1.1, w: f.fw * 1.6, h: f.fw * 2.0 };
    const s = val("rSmooth") / 100, bl = val("rBlemish") / 100;
    if (s > 0 || bl > 0) px = SC.smoothSkin(px, W, H, m.skin, { strength: s, blemish: bl, radius: Math.max(3, Math.round(f.fw * .035)), eps: .0036, keep: .3, box });
    const e = val("rEyes") / 100, u = val("rUnder") / 100, t = val("rTeeth") / 100;
    if (e > 0) px = SC.adjustRegion(px, W, H, m.eyes, { dL: 5 * e, contrast: .18 * e });
    if (u > 0) px = SC.adjustRegion(px, W, H, m.underEye, { dL: 6 * u });
    if (t > 0) px = SC.adjustRegion(px, W, H, m.mouth, { dL: 4 * t, bShift: -8 * t, onlyBright: 50 });
    const sh = val("rSharp") / 100;
    if (sh > 0) { px = SC.sharpen(px, W, H, sh * .9, { radius: 1, protect: m.skin }); for (let i = 0; i < W * H; i++) px[i * 4 + 3] = ST.fg[i * 4 + 3]; }
    ST.cache.rtKey = key; ST.cache.rt = px; ST.cache.rtAll = all;
    return px;
  }

  /** mask "ผิวคอ" ในช่องคอเสื้อ — ซ่อนคอเสื้อเดิมที่ไม่ใช่สีผิว (แคชตามผลรีทัช) */
  function neckKeep(person) {
    const key = ST.cache.rtKey; if (ST.cache.nkKey === key) return ST.cache.nk;
    const f = ST.face, hw = ST.body.neck.w * .65 * 1.6;
    ST.cache.nk = ST.harm.skin ? SC.skinKeepMask(person, ST.W, ST.H, ST.harm.skin, { x0: f.chinX - hw, x1: f.chinX + hw, y0: f.chinY - f.fw * .1, y1: f.chinY + f.fw * 1.5 }) : null;
    ST.cache.nkKey = key; return ST.cache.nk;
  }
  // ---------- รวมภาพ ----------
  let pending = null, running = false;
  function schedule(level) { pending = level; clearTimeout(schedule.t); schedule.t = setTimeout(() => { if (!running && ST.phase === "done") renderNow(pending); }, 90); }
  async function renderNow(level) {
    if (!ST.alpha) return;
    running = true; pending = null; busy(true, "กำลังรวมภาพ...");
    await sleep(0);
    try {
      const W = ST.W, H = ST.H, t0 = now(), g = curG(), f = ST.face;
      let t = now();
      const person = retouch(); ST.timings.retouch = now() - t; t = now();
      const pA = SC.applyMatteEdits(ST.alpha, ST.editVer ? ST.edit : null);
      const gk = [g.key, ...["aScale", "aRot", "aX", "aY", "aBright", "oHarm"].map(val), JSON.stringify(ST.manual), JSON.stringify(g.fit || null)].join("|");
      let garment = null, gAlpha = null;
      if (g.key !== "none") {
        if (ST.cache.gk !== gk) {
          const fit = fitGarment(g);
          const h = SC.harmonizeGarment(fit.warped, W, H, ST.harm, { gray: null, faceLum: g.faceLum, hasSkin: g.kind === "tpl" }, { strength: val("oHarm") / 100, bright: val("aBright") / 100 });
          ST.cache.gk = gk; ST.cache.garment = h; ST.targets = fit.targets;
        }
        garment = ST.cache.garment;
        gAlpha = new Float32Array(W * H); for (let i = 0; i < gAlpha.length; i++) gAlpha[i] = garment[i * 4 + 3] / 255;
      } else ST.targets = null;
      ST.timings.fit = now() - t; t = now();
      const bg = await bgPixels(person);
      const head = SC.headMask(pA, W, H, f, Math.max(1.5, f.fw * .012));
      const sv = val("oShadow") / 100, shade = garment ? SC.contactShadow(gAlpha, W, H, f, { chin: .3 * sv, collar: .3 * sv }) : null;
      const r = SC.composite({ w: W, h: H, bg, person, pA, garment, head, shade, hideBody: chk("oHide"), levels: 4, wrap: bgKey === "orig" ? 0 : val("oWrap") / 100 * .4, wrapR: Math.max(4, Math.round(Math.max(W, H) / 120)),
        neck: { cx: f.chinX, halfW: ST.body.neck.w * .65, band: f.fw * .12 }, neckKeep: neckKeep(person), seam: { x0: f.chinX - f.fw * .8, x1: f.chinX + f.fw * .8, y0: f.chinY - f.fw * .15, y1: f.chinY + f.fw * .9 } });
      ST.timings.composite = now() - t;
      ST.timings.render = now() - t0;
      ST.out = r.rgba;
      $("#stOut").getContext("2d").putImageData(new ImageData(r.rgba, W, H), 0, 0);
      drawOverlay();
    } catch (e) { console.error(e); toast("รวมภาพไม่สำเร็จ: " + e.message); }
    finally {
      running = false; busy(false);
      if (pending) schedule(pending);
    }
  }

  // ---------- มุมมอง / เทียบ / เครื่องมือ ----------
  let mode = "view";
  function showView() { $("#stSrc").hidden = true; $("#stView").hidden = false; }
  function busy(on, t) { const b = $("#stBusy"); b.hidden = !on; if (t) b.textContent = t; }
  function syncSplit() { const v = val("stSplit"); $("#stCompare").style.setProperty("--split", v + "%"); $("#stSplitLine").hidden = v <= 0 || v >= 100; }
  $("#stSplit").oninput = syncSplit;
  $("#stMode").querySelectorAll("button").forEach(b => b.onclick = () => {
    mode = b.dataset.m; $("#stMode").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    $("#stBrushRow").hidden = !(mode === "restore" || mode === "erase");
    $("#stCompare").dataset.mode = mode;
    $("#stHint").textContent = mode === "fit" ? "ลากจุดม่วง = คาง, จุดฟ้า = ปลายไหล่ เพื่อให้ชุดเข้ารูป" : mode === "view" ? "เลื่อนแถบ ก่อน | หลัง เพื่อเทียบภาพ" : "ระบายบนภาพ: " + (mode === "restore" ? "คืนส่วนของตัวคนที่ถูกตัดหาย" : "ลบพื้นหลังที่ติดมา");
    drawOverlay();
  });
  function drawOverlay(cursor) {
    const c = $("#stOverlay"), x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
    const r = Math.max(8, ST.W / 70);
    if (mode === "fit" && ST.targets) {
      const T = ST.targets; x.lineWidth = Math.max(2, r * .25); x.strokeStyle = "rgba(255,255,255,.85)"; x.setLineDash([r, r * .6]);
      x.beginPath(); x.moveTo(T.l.x, T.l.y); x.lineTo(T.chin.x, T.chin.y); x.lineTo(T.r.x, T.r.y); x.stroke(); x.setLineDash([]);
      [["chin", "#674ff2"], ["l", "#0891b2"], ["r", "#0891b2"]].forEach(([k, col]) => { x.fillStyle = col; x.strokeStyle = "#fff"; x.beginPath(); x.arc(T[k].x, T[k].y, r, 0, 7); x.fill(); x.stroke(); });
    }
    if (cursor && (mode === "restore" || mode === "erase")) { x.strokeStyle = mode === "restore" ? "#22c55e" : "#ef4444"; x.lineWidth = Math.max(2, ST.W / 400); x.beginPath(); x.arc(cursor.x, cursor.y, brushR(), 0, 7); x.stroke(); }
  }
  const brushR = () => val("stBrush") / 400 * Math.max(ST.W, ST.H);
  let drag = null;
  const ov = $("#stOverlay");
  ov.addEventListener("pointerdown", e => {
    if (mode === "view" || !ST.alpha) return;
    const p = cvPt(ov, e);
    if (mode === "fit" && ST.targets) {
      let best = null, bd = Math.max(24, ST.W / 25);
      for (const k of ["chin", "l", "r"]) { const d = Math.hypot(ST.targets[k].x - p.x, ST.targets[k].y - p.y); if (d < bd) { bd = d; best = k; } }
      if (!best) return;
      drag = { k: best }; ov.setPointerCapture(e.pointerId); e.preventDefault();
    } else if (mode === "restore" || mode === "erase") {
      drag = { brush: true }; ov.setPointerCapture(e.pointerId); e.preventDefault(); paint(p);
    }
  });
  ov.addEventListener("pointermove", e => {
    const p = cvPt(ov, e);
    if (!drag) { if (mode === "restore" || mode === "erase") drawOverlay(p); return; }
    if (drag.k) { ST.targets[drag.k] = p; drawOverlay(); }
    else { paint(p); drawOverlay(p); }
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.k) {
      // แปลงจุดที่ลาก (หลังปรับ ขนาด/หมุน/เลื่อน) กลับเป็นจุดอ้างอิง แล้วรีเซ็ตแถบเลื่อน
      ST.manual = { chin: { ...ST.targets.chin }, l: { ...ST.targets.l }, r: { ...ST.targets.r } };
      ["aScale"].forEach(id => document.getElementById(id).value = 100); ["aRot", "aX", "aY"].forEach(id => document.getElementById(id).value = 0);
      schedule("fit");
    } else schedule("matte");
    drag = null;
  };
  ov.addEventListener("pointerup", endDrag); ov.addEventListener("pointercancel", endDrag);
  function paint(p) { SC.brush(ST.edit, ST.W, ST.H, p.x, p.y, brushR(), mode === "restore" ? 1 : -1); ST.editVer++; }
  $("#stUndoEdit").onclick = () => { ST.edit.fill(0); ST.editVer = 0; schedule("matte"); };
  $("#stNew").onclick = () => { $("#stView").hidden = true; $("#stSrc").hidden = false; ST.phase = "idle"; };
  $("#stAutoFit").onclick = () => { ST.manual = null; ["aScale", "aBright"].forEach(id => document.getElementById(id).value = 100); ["aRot", "aX", "aY"].forEach(id => document.getElementById(id).value = 0); schedule("fit"); };

  // แถบเลื่อน/ตัวเลือก -> รวมภาพใหม่
  ["aScale", "aRot", "aX", "aY", "aBright", "oHarm", "oShadow", "oWrap", "rSmooth", "rBlemish", "rEyes", "rUnder", "rTeeth", "rSharp"].forEach(id => document.getElementById(id).addEventListener("input", () => schedule(id)));
  ["oHide", "rAuto"].forEach(id => document.getElementById(id).addEventListener("change", () => schedule(id)));

  // ---------- ส่งออก ----------
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
  function save(c, type, name) {
    return new Promise(res => c.toBlob(b => {
      if (!b) { toast("สร้างไฟล์ไม่สำเร็จ"); return res(null); }
      const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${name}-${stamp()}.${type === "image/jpeg" ? "jpg" : "png"}`;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      window.__studio.lastExport = { type, size: b.size, w: c.width, h: c.height, name: a.download }; res(b);
    }, type, .92));
  }
  $("#stPng").onclick = () => save($("#stOut"), "image/png", "lensiq-studio");
  $("#stJpg").onclick = () => save($("#stOut"), "image/jpeg", "lensiq-studio");
  let idSize = "1";
  function renderIdSizes() {
    const box = $("#stIdSize");
    box.innerHTML = Object.entries(L.ID_SIZES).map(([k, s]) => `<button type="button" data-k="${k}" class="${k === idSize ? "on" : ""}">${esc(s.label)}</button>`).join("");
    box.querySelectorAll("button").forEach(b => b.onclick = () => { idSize = b.dataset.k; renderIdSizes(); });
  }
  function idPhoto() {
    const s = L.ID_SIZES[idSize], W = L.cmToPx(s.w), H = L.cmToPx(s.h), c = mk(W, H), x = c.getContext("2d"), f = ST.face;
    x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
    const cr = L.idCrop({ cx: f.cx, eyeY: f.eyeY, chinY: f.chinY }, { w: W, h: H });
    x.save(); x.translate(W / 2, (f.eyeY - cr.sy) * cr.scale); x.rotate(-(f.angle || 0)); x.translate(-W / 2, -(f.eyeY - cr.sy) * cr.scale);
    x.imageSmoothingQuality = "high"; x.drawImage($("#stOut"), cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, W, H); x.restore();
    return c;
  }
  $("#stIdOne").onclick = () => save(idPhoto(), "image/png", "lensiq-id-" + idSize);
  $("#stIdSheet").onclick = () => {
    const p = idPhoto(), sh = L.tileSheet(L.PAPERS["4x6"], L.ID_SIZES[idSize]), c = mk(sh.W, sh.H), x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, sh.W, sh.H);
    sh.pos.forEach(q => { x.drawImage(p, q.x, q.y, q.w, q.h); x.strokeStyle = "#ccc"; x.lineWidth = 1; x.strokeRect(q.x - .5, q.y - .5, q.w + 1, q.h + 1); });
    save(c, "image/jpeg", "lensiq-id-sheet-" + idSize);
  };

  // ---------- test hook (ใช้โดย tests/e2e/studio.e2e.mjs; ไม่เก็บหรือส่งข้อมูล) ----------
  window.__studio = { load: c => load(toWork(c)), state: ST, render: () => renderNow("test"), garments: () => ST.garments.map(g => g.key), select: k => { ST.gKey = k; renderGarments(); return renderNow("test"); }, idPhoto, lastExport: null };
  init();
})();
