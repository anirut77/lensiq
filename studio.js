/* สตูดิโอแต่งชุด AI — ประมวลผลบนเครื่องทั้งหมด (ไม่ส่งภาพออก ไม่เก็บภาพ; เก็บเฉพาะเทมเพลตชุดที่ผู้ใช้เพิ่มเองใน IndexedDB)
 *
 * ขั้นตอน: รูป -> MODNet (PBHQ.modnetAlpha) + อุดรูด้วยโมเดล 6 คลาส -> refineMatte -> ใบหน้า (face-api 68 จุด / จากผลแยกส่วน / จาก matte)
 *   -> แยก ผม/ใบหน้า+หู+เครื่องประดับ/คอ/เสื้อเดิม/มือ ด้วย MediaPipe Selfie Multiclass (Apache-2.0, PBHQ.multiclassParse 3 รอบ)
 *      [BiSeNet เป็นตัวเลือกเท่านั้น: ?faceparse=1 / LENSIQ_FACEPARSE — น้ำหนักไม่ใช่เชิงพาณิชย์; สำรองสุดท้าย = จัดกลุ่มสี]
 *   -> วัดไหล่/คอจาก silhouette -> วาดชุดลงพิกัดภาพแล้วตัดตามเงาตัวจริง (ไหล่ แขน ลำตัว) + แสงเงา/รอยยับจริงจากเสื้อเดิม
 *   -> harmonize -> ต่อคอใต้คอเสื้อ -> รีทัช
 *   -> รวมภาพตามลำดับชั้น: ฉาก → ปกหลังคอ → คอ → ชุด → ศีรษะ+ผม+มือ (ผมคลุมไหล่ชุดได้ ไม่มีเส้นตัดตรง) + เงา + light wrap
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
  /** ข้อความตามภาษา (ไทยเป็นค่าเริ่มต้น; จีนจาก i18n/zh-studio.js ผ่าน lensiq-i18n.js) */
  const T = (k, th, v) => window.LQI18N && LQI18N.tf ? LQI18N.tf(k, th, v) : th.replace(/\{(\w+)\}/g, (m, q) => v && v[q] != null ? v[q] : m);

  // ---------- สถานะระบบ ----------
  const eng = {};
  function status(k, t, c) {
    eng[k] = { t, c }; const e = $("#stEngine");
    let p = Object.values(eng);
    // หลังประมวลผลเสร็จ: แสดงบรรทัดผลลัพธ์ (ระบุวิธีที่ใช้แล้ว) + คำเตือนเท่านั้น — ไม่ซ้ำ "MODNet … MODNet"
    if (eng.run && eng.run.c !== "err") p = [eng.run, ...Object.entries(eng).filter(([q, x]) => q !== "run" && (x.c === "warn" || x.c === "err")).map(([, x]) => x)];
    e.textContent = p.map(x => x.t).join(" · ");
    e.className = "engine " + (p.some(x => x.c === "err") ? "err" : p.some(x => x.c === "warn") ? "warn" : p.every(x => x.c === "ok") ? "ok" : "");
  }
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2800); }

  // ---------- state ----------
  const ST = {
    phase: "idle", W: 0, H: 0, src: null, px: null, alpha: null, fg: null, edit: null, editVer: 0, method: "",
    face: null, body: null, harm: null, masks: null, layers: null, fitAuto: null, parse: "",
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
    faceP.then(() => status("face", T("studio.js.st.faceOk", "ตรวจจุดบนใบหน้าพร้อม"), "ok"), e => status("face", e.message === "skip" ? T("studio.js.st.faceSkip", "ประมาณใบหน้าจากรูปทรง") : T("studio.js.st.faceFail", "ตรวจจุดบนใบหน้าไม่ได้ (ประมาณจากรูปทรงแทน)"), e.message === "skip" ? "ok" : "warn"));
    return faceP;
  }
  function init() {
    status("matte", T("studio.js.st.matteLoading", "กำลังโหลดโมเดลตัดพื้นหลัง (MODNet)..."), "");
    PBHQ.loadMatting().then(() => status("matte", T("studio.js.st.matteOk", "ตัดพื้นหลัง MODNet พร้อม"), "ok"), e => { console.warn(e); status("matte", T("studio.js.st.matteFail", "MODNet ใช้ไม่ได้ (ใช้การแยกสีฉากแทน)"), "warn"); });
    status("parse", T("studio.js.st.parseLoading", "กำลังโหลดโมเดลแยกผม/คอ/เสื้อ..."), "");
    PBHQ.loadMulticlass().then(() => status("parse", T("studio.js.st.parseOk", "แยกผม/ใบหน้า/คอ/เสื้อ (MediaPipe Multiclass) พร้อม"), "ok"), e => { console.warn(e); status("parse", T("studio.js.st.parseFail", "โหลดโมเดลแยกผม/คอไม่ได้ (ใช้การจัดกลุ่มสีแทน)"), "warn"); });
    status("face", T("studio.js.st.faceLoading", "กำลังโหลดตัวตรวจใบหน้า..."), "");
    loadFace().catch(() => {});
    loadGarments();
    renderBgChoices(); renderIdSizes();
  }

  // ---------- ชุด ----------
  const NONE = { key: "none", get name() { return T("studio.js.none", "ไม่ใส่ชุด"); } };
  async function loadGarments() {
    const list = [NONE];
    let items = [];
    try { items = (await PBTpl.all()).filter(i => i.kind === "outfit"); } catch (e) { console.warn("templates", e); }
    for (const it of items) {
      try { const c = await PBTpl.blobToCanvas(it.blob); list.push(tplGarment(it, c)); } catch (e) { console.warn(e); }
    }
    for (const [k, th] of Object.entries(PBOutfits.NAMES)) list.push({ key: "v:" + k, get name() { return T("pbo." + k, th); }, kind: "vector", vk: k });
    ST.garments = list;
    if (!list.some(g => g.key === ST.gKey)) ST.gKey = list.find(g => g.kind === "tpl") ? list.find(g => g.kind === "tpl").key : "v:suit_navy";
    if (ST.gKey === "none" && !ST._userNone) ST.gKey = list.find(g => g.kind === "tpl") ? list.find(g => g.kind === "tpl").key : "v:suit_navy";
    renderGarments();
  }
  function tplGarment(it, canvas) {
    const a = it.anchor || {};
    return { key: "tpl:" + it.id, name: it.name, kind: "tpl", item: it, canvas, chin: { x: a.cx, y: a.chinY }, fw: a.fw, faceLum: a.faceLum || null, fit: it.fit || null, anchors: it.anchors || null };
  }
  /** เตรียมชุด: canvas, alpha, จุดยึด (คาง/ไหล่) */
  function prepGarment(g) {
    if (g.kind === "vector" && !g.canvas) { const r = PBOutfits.render(g.vk, 64); g.canvas = r.canvas; g.chin = r.chin; g.fw = r.fw; }
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
      if (g.kind === "tpl") { const t = document.createElement("span"); t.className = "tag-real"; t.textContent = T("studio.js.real", "ภาพจริง"); b.append(t); }
      b.onclick = () => { ST.gKey = g.key; ST._userNone = g.key === "none"; ST.manual = null; renderGarments(); schedule("fit"); };
      box.append(b);
    });
    $("#stAnchorBtn").disabled = curG().kind !== "tpl";
  }

  // เพิ่มชุดใหม่: PNG พื้นใส หรือรูปคนใส่ชุด (ตัดพื้นหลัง + ศีรษะด้วย PBTpl.prepareOutfit) -> บันทึกใน IndexedDB
  $("#stGarmentFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    const msg = $("#stGarmentMsg"); msg.textContent = T("studio.js.outfit.preparing", "กำลังเตรียมชุด (ตัดพื้นหลังและศีรษะ)...");
    try {
      try { await loadFace(); } catch { /* ไม่มีตัวตรวจใบหน้า: ใช้จุดยึดจากรูปทรง */ }
      const prep = await PBTpl.prepareOutfit(f);
      let fin = PBTpl.finalizeOutfit(prep, .5);
      // ชุดวางราบบนพื้นเรียบ (ไม่มีคน — MODNet ตัดไม่ได้): แยกสีพื้นหลังจากขอบภาพแทน
      { const a = alphaOf(fin.canvas); let cov = 0; for (let i = 0; i < a.length; i += 7) cov += a[i] > .5; if (cov / (a.length / 7) < .05 || prep.source === "photo" && !(fin.anchor && fin.anchor.faceLum)) {
        const src = await PBTpl.fileToCanvas(f), px = ctx2(src).getImageData(0, 0, src.width, src.height), al = SC.refineMatte(px.data, SC.borderKeyAlpha(px.data, src.width, src.height), src.width, src.height, { k: 3 });
        for (let i = 0; i < al.length; i++) px.data[i * 4 + 3] = al[i] * 255;
        const bb = PBTpl.opaqueBBox(px.data, src.width, src.height) || { x: 0, y: 0, w: src.width, h: src.height }, full = mk(src.width, src.height); full.getContext("2d").putImageData(px, 0, 0);
        const c = mk(bb.w, bb.h); c.getContext("2d").drawImage(full, -bb.x, -bb.y); fin = { canvas: c, anchor: { faceLum: null } };
      } }
      const anchors = SC.templateAnchors(alphaOf(fin.canvas), fin.canvas.width, fin.canvas.height);
      const item = { id: crypto.randomUUID(), kind: "outfit", name: f.name.replace(/\.[^.]+$/, "").slice(0, 40) || T("studio.js.myOutfit", "ชุดของฉัน"), anchor: fin.anchor, anchors, blob: await PBTpl.toBlob(fin.canvas), created: Date.now() };
      await PBTpl.put(item);
      const g = tplGarment(item, fin.canvas);
      ST.garments.splice(1, 0, g); ST.gKey = g.key; ST.manual = null;
      msg.textContent = T("studio.js.outfit.added", 'เพิ่มชุด "{n}" แล้ว — ถ้าไหล่ไม่ตรง กด "ตั้งจุดคอ/ไหล่ของชุด"', { n: item.name });
      renderGarments(); schedule("fit");
    } catch (err) { console.warn(err); msg.textContent = T("studio.js.outfit.fail", "เพิ่มชุดไม่สำเร็จ: {e}", { e: err.message }); }
  };

  // ---------- ตัวแก้จุดยึดของชุด ----------
  const anc = { g: null, pts: null, drag: null, s: 1 };
  function drawAnchor() {
    const g = anc.g, cv = $("#stAnchorCv"), maxW = Math.min(520, window.innerWidth - 64), s = Math.min(maxW / g.canvas.width, 420 / g.canvas.height);
    anc.s = s; cv.width = Math.round(g.canvas.width * s); cv.height = Math.round(g.canvas.height * s);
    const x = cv.getContext("2d"); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(g.canvas, 0, 0, cv.width, cv.height);
    const P = anc.pts;
    if (Array.isArray(P)) { // เทมเพลตรูปถ่าย: จุดยึดทุกจุด (ช่องคอ ปก ไหล่ ชายเสื้อ)
      const col = { neck: "#674ff2", cl: "#a855f7", cr: "#a855f7", l: "#0891b2", r: "#0891b2", hl: "#16a34a", hr: "#16a34a" };
      x.strokeStyle = "rgba(14,20,48,.6)"; x.setLineDash([4, 4]); x.beginPath(); ["hl", "l", "cl", "neck", "cr", "r", "hr"].forEach((k, i) => { const q = P.find(p => p.k === k); if (q) x[i ? "lineTo" : "moveTo"](q.x * s, q.y * s); }); x.stroke(); x.setLineDash([]);
      P.forEach(q => { x.fillStyle = col[q.k] || "#674ff2"; x.strokeStyle = "#fff"; x.lineWidth = 2; x.beginPath(); x.arc(q.x * s, q.y * s, 8, 0, 7); x.fill(); x.stroke(); });
      return;
    }
    x.strokeStyle = "rgba(14,20,48,.6)"; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(P.l.x * s, P.l.y * s); x.lineTo(P.chin.x * s, P.chin.y * s); x.lineTo(P.r.x * s, P.r.y * s); x.stroke(); x.setLineDash([]);
    [["chin", "#674ff2"], ["l", "#0891b2"], ["r", "#0891b2"]].forEach(([k, col]) => { x.fillStyle = col; x.strokeStyle = "#fff"; x.lineWidth = 2; x.beginPath(); x.arc(P[k].x * s, P[k].y * s, 9, 0, 7); x.fill(); x.stroke(); });
  }
  $("#stAnchorBtn").onclick = () => {
    const g = curG(); if (g.kind !== "tpl") return;
    anc.g = g; anc.pts = JSON.parse(JSON.stringify(g.anchors || garmentAnchors(g)));
    $("#stAnchorDlg").showModal(); drawAnchor();
  };
  const cvPt = (cv, e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  $("#stAnchorCv").addEventListener("pointerdown", e => {
    const p = cvPt(e.currentTarget, e), s = anc.s; let best = null, bd = 30;
    const keys = Array.isArray(anc.pts) ? anc.pts.map((_, i) => i) : ["chin", "l", "r"];
    for (const k of keys) { const d = Math.hypot(anc.pts[k].x * s - p.x, anc.pts[k].y * s - p.y); if (d < bd) { bd = d; best = k; } }
    if (best != null) { anc.drag = best; e.currentTarget.setPointerCapture(e.pointerId); }
  });
  $("#stAnchorCv").addEventListener("pointermove", e => { if (anc.drag == null) return; const p = cvPt(e.currentTarget, e); anc.pts[anc.drag] = { ...anc.pts[anc.drag], x: p.x / anc.s, y: p.y / anc.s }; drawAnchor(); });
  $("#stAnchorCv").addEventListener("pointerup", () => { anc.drag = null; });
  $("#stAnchorSave").onclick = async () => {
    const g = anc.g; if (Array.isArray(anc.pts)) g.anchors = anc.pts; else g.fit = anc.pts;
    if (g.kind === "tpl") { try { g.item = Array.isArray(anc.pts) ? { ...g.item, anchors: g.anchors } : { ...g.item, fit: g.fit }; await PBTpl.put(g.item); } catch (e) { toast(T("studio.js.anchorFail", "บันทึกจุดยึดไม่สำเร็จ: {e}", { e: e.message })); } }
    $("#stAnchorDlg").close(); ST.manual = null; schedule("fit");
  };
  $("#stAnchorReset").onclick = () => {
    const g = anc.g;
    if (Array.isArray(anc.pts)) { prepGarment(g); anc.pts = SC.templateAnchors(g.alpha, g.canvas.width, g.canvas.height) || anc.pts; drawAnchor(); return; }
    const f = g.fit; g.fit = null; anc.pts = JSON.parse(JSON.stringify(garmentAnchors(g))); g.fit = f; drawAnchor();
  };
  $("#stAnchorClose").onclick = () => $("#stAnchorDlg").close();

  // ---------- ฉากหลัง ----------
  const BGS = [
    ["blur", "ฉากเดิมเบลอ", "blur"], ["orig", "ฉากเดิม", "orig"], ["#ffffff", "ขาว", "white"], ["#d7e7f7", "ฟ้าอ่อน", "sky"], ["#e4e4e4", "เทาอ่อน", "gray"], ["#1f3b6e", "น้ำเงิน", "blue"],
    ["grad", "ไล่สีสตูดิโอ", "grad"], ["custom", "สีที่เลือก", "custom"]
  ];
  let bgKey = "#d7e7f7", bgTpls = [];
  async function renderBgChoices() {
    try { bgTpls = (await PBTpl.all()).filter(i => i.kind === "bg"); } catch { bgTpls = []; }
    const box = $("#stBg");
    box.innerHTML = [...BGS.map(([k, n, q]) => [k, T("studio.js.bg." + q, n)]), ...bgTpls.map(t => ["tpl:" + t.id, t.name])].map(([k, n]) => `<button type="button" data-k="${k}" class="${k === bgKey ? "on" : ""}">${esc(n)}</button>`).join("");
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
      const bl = SC.blurredBackground(base, ST.alpha, W, H, Math.max(6, Math.round(Math.max(W, H) / 70)));
      if (bgKey === "blur") px = bl;
      else { px = new Uint8ClampedArray(base); for (let i = 0; i < W * H; i++) { const a = ST.alpha[i]; for (let c = 0; c < 3; c++) px[i * 4 + c] = base[i * 4 + c] * (1 - a) + bl[i * 4 + c] * a; } } // ฉากเดิม: ลบตัวคนเดิมออก (ชุดเดิมไม่โผล่)
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
    try { await load(await fileToCanvas(f)); } catch (err) { console.warn(err); toast(T("studio.js.openFail", "เปิดรูปไม่ได้: {e}", { e: err.message })); }
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
    catch (e) { console.warn(e); toast(LQCam.errorText ? LQCam.errorText(e) : T("studio.js.camFail", "เปิดกล้องไม่ได้")); $("#stCam").hidden = true; }
  };
  $("#stCamClose").onclick = () => { if (cam) cam.stop(); $("#stCam").hidden = true; };
  $("#stShoot").onclick = async () => {
    const v = $("#stVideo"); if (!v.videoWidth) return toast(T("studio.js.camNotReady", "กล้องยังไม่พร้อม"));
    const c = mk(v.videoWidth, v.videoHeight); c.getContext("2d").drawImage(v, 0, 0); // ไม่กลับด้าน: ให้เหมือนจริง
    cam.stop(); $("#stCam").hidden = true;
    await load(toWork(c));
  };

  // ---------- วิเคราะห์ภาพ ----------
  async function detectFace(src) {
    try { await loadFace(); } catch { return null; }
    try {
      let d = null;
      // ลองหลายขนาดอินพุต (ใบหน้าเล็ก/ใหญ่มาก ภาพเก่า แว่นหนา) ก่อนใช้การประมาณจากผลแยกส่วน
      for (const [inputSize, scoreThreshold] of [[416, .4], [608, .3], [320, .3], [224, .25]]) { d = await faceapi.detectSingleFace(src, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })).withFaceLandmarks(); if (d) break; }
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
    showView(); busy(true, T("studio.js.busy.matte", "กำลังตัดพื้นหลัง..."));
    await sleep(20);
    const W = ST.W, H = ST.H;
    try {
      let t = now(), raw = null;
      try { raw = await PBHQ.modnetAlpha(canvas); ST.method = "MODNet"; } catch (e) { console.warn("MODNet", e); }
      if (raw) { let s = 0; for (let i = 0; i < raw.length; i += 7) s += raw[i]; if (s / (raw.length / 7) < .02) raw = null; }
      if (!raw) { raw = SC.borderKeyAlpha(ST.px, W, H); ST.method = T("studio.js.m.colorKey", "แยกสีฉาก"); }
      ST.timings.matte = now() - t; t = now();
      // โมเดล 6 คลาสรอบแรก (ทั้งภาพ): ใช้อุดรูที่ MODNet พลาด (ภาพขาวดำเก่า/แสงน้อย/ฉากลาย) และหาใบหน้าเมื่อไม่พบ landmark
      ST.mcFull = null;
      ST.pp = null;
      if (!parseOptIn()) try { ST.mcFull = await PBHQ.multiclassParse(canvas, { x: 0, y: 0, w: W, h: H }); ST.pp = SC.parsePersonProb(ST.mcFull, W, H); raw = SC.fillMatteFromParse(raw, ST.mcFull, W, H, ST.pp); } catch (e) { console.warn("multiclass", e); }
      ST.timings.parse0 = now() - t; t = now();
      busy(true, T("studio.js.busy.refine", "กำลังเกลาขอบผม..."));
      await sleep(0);
      ST.alpha = SC.refineMatte(ST.px, raw, W, H, { r: Math.max(2, Math.max(W, H) / 512), k: ST.method === "MODNet" ? 1.6 : 3 });
      ST.timings.refine = now() - t; t = now();
      busy(true, T("studio.js.busy.face", "กำลังหาใบหน้า คอ และไหล่..."));
      let face = await detectFace(canvas);
      if (!face && ST.mcFull) { face = SC.faceFromParse(ST.mcFull, W, H); if (face) { face.chinX = face.cx; face.detected = false; } }
      if (!face) { face = SC.headFromMatte(ST.alpha, W, H); if (face) { face.chinX = face.cx; face.detected = false; } }
      if (!face) face = { cx: W / 2, chinX: W / 2, eyeY: H * .35, chinY: H * .5, fw: W * .28, faceH: H * .15, angle: 0, detected: false };
      ST.face = face;
      // ใบหน้าตาม landmark ต้องเป็นตัวคนเสมอ (MODNet พลาดบนใบหน้าในภาพขาวดำเก่าบางภาพ)
      if (face.detected && face.P) ST.alpha = SC.fillFaceMatte(ST.alpha, W, H, face);
      ST.timings.face = now() - t; t = now();
      ST.fg = SC.estimateForeground(ST.px, ST.alpha, W, H);
      ST.timings.foreground = now() - t; t = now();
      busy(true, T("studio.js.busy.parse", "กำลังแยกผม ใบหน้า และคอ..."));
      await sleep(0);
      const { P, crop } = await parsePerson(canvas, face); ST.parseP = P;
      { const t2 = now(); ST.headwear = !crop ? SC.headwearExtend(ST.px, ST.alpha, P, W, H, face) : null; if (!crop) SC.hairCleanup(ST.px, ST.alpha, P, W, H, face); ST.timings.headwear = now() - t2; } // ฮิญาบ/ผ้าคลุมที่คลุมลงใต้คาง
      ST.layers = SC.personLayers(ST.px, ST.alpha, W, H, face, P, crop);
      ST.timings.parse = now() - t; t = now();
      // มือ/แขนเปลือย (ผิวกายที่อยู่ต่ำกว่าอก เช่น กอดอก ประสานมือ) วางหน้าชุดใหม่ — ไม่หายไปใต้ชุด
      ST.hands = null;
      const monoImg = (() => { const st = SC.labStats(ST.px, W, H, null, { step: 6 }); return !!st && Math.hypot(st.mean[1], st.mean[2]) < 2.5 && st.std[1] < 2.5 && st.std[2] < 2.5; })();
      if (P.skin) ST.hands = SC.handsMask(ST.px, ST.alpha, P.skin, W, H, face, { mono: monoImg });
      ST.neckM = SC.neckMeasure(ST.alpha, ST.layers, W, H, face);
      ST.clothSh = SC.clothShading(ST.px, ST.alpha, ST.layers, W, H, face);
      // แสงเงาจากเสื้อเดิม: เก็บเฉพาะความถี่ต่ำ (ลายทาง/ลวดลายเสื้อเดิมไม่กลายเป็น "คราบเมฆ" บนชุดสีอ่อน)
      if (ST.clothSh) { const b = SC.blur3(ST.clothSh, W, H, Math.max(2, Math.round(face.fw * .05))); for (let i = 0; i < W * H; i++) ST.clothSh[i] = SC.clamp(1 + (b[i] - 1) * .7, .88, 1.08); }
      ST.fitAuto = SC.measureShoulders(ST.alpha, W, H, face, { keep: ST.layers.keep, hair: ST.layers.hair, neck: ST.layers.neck, canon: PBOutfits.CANON });
      ST.body = { left: ST.fitAuto.l, right: ST.fitAuto.r, neck: { x: ST.fitAuto.N.x, y: ST.fitAuto.N.y }, width: ST.fitAuto.width, theta: ST.fitAuto.theta, ok: ST.fitAuto.measured };
      ST.masks = SC.faceMasks(ST.px, W, H, face, ST.alpha);
      // สถิติสำหรับผสานชุด
      const fb = { x: face.cx - face.fw * .3, y: face.eyeY, w: face.fw * .6, h: (face.chinY - face.eyeY) * .75 };
      const lum = box => { const m = PBTpl.meanLum(ST.px, W, box); return m == null ? null : m; };
      const lr = [lum({ x: fb.x, y: fb.y, w: fb.w / 2, h: fb.h }), lum({ x: fb.x + fb.w / 2, y: fb.y, w: fb.w / 2, h: fb.h })];
      ST.harm = {
        gray: SC.grayWorld(ST.px, W, H, null, { neutral: true }).mean, faceLum: lum(fb), skin: SC.labStats(ST.px, W, H, ST.masks.skin, { thr: .5, step: 2 }) || SC.labStats(ST.px, W, H, null, { box: fb, step: 2 }),
        lr: lr[0] && lr[1] ? lr : null, noise: SC.estimateNoise(ST.px, W, H, ST.alpha, 2), cx: face.chinX, fw: face.fw
      };
      const sk = ST.harm.skin ? SC.labToRgb(...ST.harm.skin.mean) : null; ST.harm.skinRGB = sk;
      // ภาพขาวดำ (chroma เฉลี่ยของทั้งภาพต่ำมาก) -> ชุดเป็นขาวดำด้วย
      { const st = SC.labStats(ST.px, W, H, null, { step: 4 }); ST.harm.mono = !!st && Math.hypot(st.mean[1], st.mean[2]) < 2.5 && st.std[1] < 2.5 && st.std[2] < 2.5; }
      if (ST.harm.mono) { const ls = []; for (let i = 0; i < W * H; i += 13) if (ST.alpha[i] > .8) ls.push(.299 * ST.px[i * 4] + .587 * ST.px[i * 4 + 1] + .114 * ST.px[i * 4 + 2]); ls.sort((a, b) => a - b); if (ls.length > 100) ST.harm.tone = { bp: SC.clamp(ls[Math.floor(ls.length * .02)], 0, 60), wp: SC.clamp(ls[Math.floor(ls.length * .98)], 180, 255) }; }
      ST.timings.stats = now() - t;
      const b = $("#stBefore"); b.width = W; b.height = H; b.getContext("2d").drawImage(canvas, 0, 0);
      for (const id of ["stOut", "stOverlay"]) { const c = document.getElementById(id); c.width = W; c.height = H; }
      ST.phase = "rendering";
      await renderNow("fit");
      ST.timings.firstResult = now() - T0;
      ST.phase = "done";
      const hint = face.detected ? "" : " " + T("studio.js.noFace", "(ไม่พบจุดบนใบหน้า: ประมาณจากรูปทรง ปรับจุดคอ/ไหล่ได้)");
      status("run", T("studio.js.done", "ตัดพื้นหลังด้วย {m} · แยกผม/คอ: {p} · เสร็จใน {s} วินาที{hint}", { m: ST.method, p: ST.parse, s: (ST.timings.firstResult / 1000).toFixed(1), hint }), face.detected ? "ok" : "warn");
      ["#stPng", "#stJpg", "#stIdOne", "#stIdSheet"].forEach(s => $(s).disabled = false);
    } catch (e) {
      console.error(e); ST.phase = "error"; ST.err = String(e && e.message || e); status("run", T("studio.js.fail", "ประมวลผลไม่สำเร็จ: {e}", { e: ST.err }), "err");
    } finally { busy(false); }
  }

  // ---------- ปรับชุด ----------
  /** แยก ผม/ใบหน้า/คอ/เสื้อ: BiSeNet บนครอปรอบใบหน้า (ถ้าผมยาวถึงขอบล่างของครอป รันซ้ำด้วยครอปที่ใหญ่ขึ้น) สำรอง = heuristic */
  const parseOptIn = () => self.LENSIQ_FACEPARSE === true || /[?&]faceparse=1(&|$)/.test(location.search);
  async function parsePerson(canvas, face) {
    const W = ST.W, H = ST.H;
    const optIn = parseOptIn();
    // ค่าเริ่มต้น: MediaPipe Selfie Multiclass (Apache-2.0) 3 รอบ — ทั้งภาพ, ครึ่งตัว, ศีรษะ (ความละเอียดสูงที่ผม/หู/ต่างหู)
    if (!optIn) try {
      const fw = face.fw, sq = (cx, cy, side) => ({ x: cx - side / 2, y: cy - side / 2, w: side, h: side });
      const rects = ST.mcFull ? [] : [{ x: 0, y: 0, w: W, h: H }];
      const bust = sq(face.cx, face.chinY + fw * .55, fw * 4.6), head = sq(face.cx, face.eyeY + fw * .35, fw * 2.9);
      if (bust.w < Math.max(W, H) * .4) rects.push(bust); // คนเล็กมากในภาพเท่านั้น: เพิ่มรอบครึ่งตัว (รอบศีรษะครอบคลุมคอ/คอเสื้อแล้ว)
      // รอบศีรษะเฉพาะเมื่อใบหน้าในรอบทั้งภาพยังเล็ก (< 60 ช่องของกริด 256) — ภาพหน้าใหญ่ใช้รอบเดียวพอ (เร็วขึ้น)
      if (head.w < Math.max(W, H) * .6 && fw * 256 / Math.max(W, H) < 60) rects.push(head);
      const t0 = now(), runs = ST.mcFull ? [ST.mcFull] : []; for (const r of rects) runs.push(await PBHQ.multiclassParse(canvas, r));
      const t1 = now(), P = SC.multiclassGroups(runs, W, H, face);
      ST.timings.parseRuns = t1 - t0; ST.timings.parseGroups = now() - t1;
      ST.parse = "MediaPipe Multiclass"; status("parse", T("studio.js.st.parseOk", "แยกผม/ใบหน้า/คอ/เสื้อ (MediaPipe Multiclass) พร้อม"), "ok");
      return { P, crop: null };
    } catch (e) { console.warn("multiclass parsing", e); status("parse", T("studio.js.st.parseRunFail", "แยกผม/คอด้วยโมเดลไม่ได้ (ใช้การจัดกลุ่มสีแทน)"), "warn"); }
    if (!FAKE && optIn) try {
      let crop = SC.parseCrop(face, 3), r = await PBHQ.faceParse(canvas, crop), g = SC.parseGroups(r.logits, r.S * r.S, r.C);
      const S = r.S; let edge = 0; for (let y = S - 6; y < S; y++) for (let x = 0; x < S; x++) edge += g.hair[y * S + x];
      if (edge / (6 * S) > .08) { crop = SC.parseCrop(face, 4.4); r = await PBHQ.faceParse(canvas, crop); g = SC.parseGroups(r.logits, r.S * r.S, r.C); }
      const P = {}; for (const k of ["head", "hair", "neck", "cloth"]) P[k] = SC.cropToImage(g[k], r.S, crop, W, H);
      ST.parse = "BiSeNet"; status("parse", T("studio.js.st.bisenetOk", "แยกผม/คอ (BiSeNet) พร้อม"), "ok");
      return { P, crop };
    } catch (e) { console.warn("face parsing", e); status("parse", T("studio.js.st.parseRunFail", "แยกผม/คอด้วยโมเดลไม่ได้ (ใช้การจัดกลุ่มสีแทน)"), "warn"); }
    ST.parse = T("studio.js.p.colorCluster", "จัดกลุ่มสี");
    return { P: SC.heuristicParse(ST.px, ST.alpha, W, H, face), crop: null };
  }
  function autoTargets() {
    const F = ST.fitAuto;
    return { chin: { ...F.chin }, l: { ...F.l }, r: { ...F.r } };
  }
  function adjustedTargets() {
    const T = ST.manual || autoTargets(), f = ST.face, s = val("aScale") / 100, rot = val("aRot") * Math.PI / 180;
    const dx = val("aX") / 100 * f.fw * 2, dy = val("aY") / 100 * f.fw * 2, c = T.chin, cos = Math.cos(rot), sin = Math.sin(rot);
    const tf = p => { const x = (p.x - c.x) * s, y = (p.y - c.y) * s; return { x: c.x + x * cos - y * sin + dx, y: c.y + x * sin + y * cos + dy }; };
    return { chin: tf(T.chin), l: tf(T.l), r: tf(T.r) };
  }
  const pixels = c => ctx2(c).getImageData(0, 0, c.width, c.height).data;
  /** ทิศแสงจากความสว่างแก้มซ้าย/ขวา (ใช้ให้แสงเงาผ้าตรงกับใบหน้า) */
  function lightDir() { const lr = ST.harm && ST.harm.lr; return { x: lr ? SC.clamp((lr[1] - lr[0]) / Math.max(1, lr[0] + lr[1]) * 4, -.6, .6) : -.2 }; }
  /**
   * วางชุดลงพิกัดภาพแบบ similarity (ไม่ดัด/บิด): ชุดสำเร็จรูปวาดตรงที่ขนาด s/มุม theta/โคนคอ N (คมชัด มีชั้นปกหลังคอแยก)
   * ชุดจากรูปจริง (tpl) ใช้ similarity จากจุดไหล่ของเทมเพลตไปยังจุดไหล่ของผู้ถ่าย
   */
  function fitGarment(g) {
    const W = ST.W, H = ST.H, T = adjustedTargets(), fit = SC.fitFromTargets(T, PBOutfits.CANON);
    if (g.kind === "vector") {
      const f = ST.face, cs = Math.cos(fit.theta), sn = Math.sin(fit.theta), NM = ST.neckM;
      // ขอบบนคอเสื้อข้างคอ = ขอบบนของเสื้อเดิมข้างคอ (คลุมเสื้อเดิมพอดี ไม่มีเศษเสื้อเดิม/ช่องว่างที่คอ) จำกัดช่วง 0.12–0.6 เท่าหน้าใต้คาง
      // คอสั้น/คอเสื้อเดิมสูงถึงคาง: ยกคอเสื้อขึ้นชิดคางได้ (ไม่สร้างคอยาวผิดจริง)
      // สัดส่วนร่างกาย: คอที่เห็นเหนือคอเสื้อ ≥ 0.12 หน้า (ศีรษะไม่ "จม" อยู่บนบ่า; ไม่ยืดคอยาวในภาพครอปชิด)
      const yT = SC.clamp(NM && NM.ySide != null ? NM.ySide - f.fw * .04 : f.chinY + f.fw * .3, f.chinY + f.fw * .12, f.chinY + f.fw * .36);
      const nwU = NM ? (NM.half + f.fw * .02) / fit.s : null;
      fit.drop = SC.clamp(((yT - fit.N.y) - sn * (nwU || .33) * fit.s) / (fit.s * cs) - PBOutfits.CANON.collarY, -1.6, .6);
      // ไหล่วัดได้ต่ำมาก (ปกชุดอวกาศ/ไหล่ลาด): ไม่ยืดคอยาวผิดจริง — ยกทั้งชุดขึ้นจนคอเสื้ออยู่ใต้คางพอดี
      if (fit.drop < -.6) { const k = (-.6 - fit.drop) * fit.s; fit.N = { x: fit.N.x + sn * k, y: fit.N.y - cs * k }; fit.drop = -.6; }
      const ck = [fit.N.x, fit.N.y, fit.s, fit.theta].map(v => v.toFixed(2)).join("|") + "|" + ST.editVer;
      fit.side = ST.manual ? null : ST.fitAuto.side;
      if (ST.cache.clipKey !== ck) { ST.cache.clip = SC.garmentClip(SC.applyMatteEdits(ST.alpha, ST.editVer ? ST.edit : null), ST.layers, W, H, f, fit, { pp: ST.pp, side: fit.side, nw: nwU || .33 }); ST.cache.clipKey = ck; }
      const C = ST.cache.clip;
      if (!C.arms) {
        // มือที่อยู่นอกชุด (ถือหมวก/วัตถุนอกลำตัวที่ถูกตัดออก) จะลอยกลางฉาก — ใช้เฉพาะมือที่อยู่ติดชุด (≤ 0.12 s)
        C.hands = ST.hands ? SC.handsNearGarment(ST.hands, C.clip, W, H, fit.s * .12) : null;
        C.arms = SC.armModel(C.clip, C.hands, W, H, fit, f);
      }
      ST.handsUsed = C.hands;
      const L = PBOutfits.layers(g.vk, { W, H, s: fit.s, theta: fit.theta, N: fit.N, light: lightDir(), seed: 7, drop: fit.drop, clip: C.clip, form: C.form, nw: nwU, side: fit.side, arms: C.arms });
      return { front: pixels(L.front), back: pixels(L.back), targets: T, fit };
    }
    prepGarment(g);
    if (g.anchors && g.anchors.length >= 5) {
      // เทมเพลตจากรูปถ่าย: ดัดด้วย thin-plate spline จากจุดยึดของชุด (ช่องคอ ปก ไหล่ ชายเสื้อ) ไปยังตำแหน่งบนตัวคน
      // ตามแนวไหล่จริง (เอียง/ไหล่สองข้างไม่เท่ากัน) — คางและผมวางทับภายหลัง (ลำดับชั้นเดียวกับชุดสำเร็จรูป)
      fit.side = ST.manual ? null : ST.fitAuto.side;
      const tw = SC.templateWarp(g.anchors, fit, { side: fit.side }), cs = Math.cos(fit.theta), sn = Math.sin(fit.theta), s = fit.s;
      const ext = [[-2.3, -.7], [2.3, -.7], [-2.3, 9], [2.3, 9]].map(([u, v]) => ({ x: fit.N.x + s * (cs * u - sn * v), y: fit.N.y + s * (sn * u + cs * v) }));
      const xs = [...tw.targets, ...ext].map(p => p.x), ys = [...tw.targets, ...ext].map(p => p.y);
      const box = { x0: Math.max(0, Math.min(...xs)), y0: Math.max(0, Math.min(...ys)), x1: Math.min(W, Math.max(...xs)), y1: Math.min(H, Math.max(...ys)) };
      const front = SC.warpRGBA(g.px, g.canvas.width, g.canvas.height, W, H, tw.inv, { step: 6, box });
      // ตัดตามเงาตัวคนจริง (เหมือนชุดสำเร็จรูป): ชุดไม่ยื่นเกินลำตัว/แขน และไม่ทับผมที่ตกนอกไหล่ — ขอบชุดในรูปยังคงเดิมเมื่อแคบกว่าตัว
      const ck = [fit.N.x, fit.N.y, fit.s, fit.theta].map(v => v.toFixed(2)).join("|") + "|" + ST.editVer;
      if (ST.cache.clipKey !== ck) { ST.cache.clip = SC.garmentClip(SC.applyMatteEdits(ST.alpha, ST.editVer ? ST.edit : null), ST.layers, W, H, ST.face, fit, { pp: ST.pp, side: fit.side, nw: .33 }); ST.cache.clipKey = ck; }
      const C = ST.cache.clip; if (!C.hands) C.hands = ST.hands ? SC.handsNearGarment(ST.hands, C.clip, W, H, fit.s * .12) : null; ST.handsUsed = C.hands;
      for (let i = 0; i < W * H; i++) front[i * 4 + 3] = front[i * 4 + 3] * C.clip[i];
      const mp = (u, v) => ({ x: fit.N.x + s * (cs * u - sn * v), y: fit.N.y + s * (sn * u + cs * v) });
      // ขอบช่องคอของเทมเพลต (เศษฉาก/ขอบขาวของรูปต้นฉบับ): กร่อนเข้าเล็กน้อยเฉพาะบริเวณช่องคอ
      {
        const q = mp(0, -.1), R = s * .75, x0 = Math.max(0, Math.floor(q.x - R)), x1 = Math.min(W, Math.ceil(q.x + R)), y0 = Math.max(0, Math.floor(q.y - R)), y1 = Math.min(H, Math.ceil(q.y + R * .8)), bw = x1 - x0, bh = y1 - y0;
        const er = Math.max(1, Math.round(s * .015));
        if (bw > 4 * er && bh > 4 * er) { const a = new Float32Array(bw * bh); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) a[y * bw + x] = front[((y + y0) * W + x + x0) * 4 + 3] / 255; const e = SC.minFilter(a, bw, bh, er);
          // เฉพาะด้านในกรอบ (ขอบกรอบไม่ถูกกร่อน — ไม่เกิดเส้นสี่เหลี่ยม) ไล่น้ำหนักตามระยะจากจุดกลางช่องคอ
          for (let y = er; y < bh - er; y++) for (let x = er; x < bw - er; x++) { const i = ((y + y0) * W + x + x0) * 4 + 3, w = 1 - SC.smooth((Math.hypot(x + x0 - q.x, y + y0 - q.y) - R * .55) / (R * .3)); front[i] = front[i] + (e[y * bw + x] * 255 - front[i]) * w; } }
      }
      // แขนท่อนล่างหน้าลำตัว (กอดอก/ประสานมือ): แขนเสื้อตามทิศแขนจริง สีผ้าเดียวกับเทมเพลต
      if (!C.arms) C.arms = SC.armModel(C.clip, C.hands, W, H, fit, ST.face);
      if (!g.mainColor) g.mainColor = templateMain(g);
      const fa = C.arms.some(a => a.hand) ? PBOutfits.forearms({ W, H, s, theta: fit.theta, N: fit.N, light: lightDir(), arms: C.arms, color: `rgb(${g.mainColor.join(",")})`, cuff: g.cuff || null, clip: C.clip, form: C.form }) : null;
      // แขนท่อนล่างค่อย ๆ ปรากฏจากข้อศอก (ต่อเนียนกับแขนเสื้อในรูป ไม่เป็นปลายท่อกลม)
      const fe = C.arms.filter(a => a.hand).map(a => { const E = mp(a.E.u, a.E.v), Wr = mp(a.Wr.u, a.Wr.v), L = Math.hypot(Wr.x - E.x, Wr.y - E.y) || 1; return { E, dx: (Wr.x - E.x) / L, dy: (Wr.y - E.y) / L, L }; });
      if (fa) { const d = pixels(fa); for (let i = 0; i < W * H; i++) { let k = d[i * 4 + 3] / 255; if (k <= 0) continue;
        { const x = i % W, y = (i / W) | 0; let best = 1e9, ramp = 1; for (const e of fe) { const t = (x - e.E.x) * e.dx + (y - e.E.y) * e.dy, q = Math.abs(-(x - e.E.x) * e.dy + (y - e.E.y) * e.dx); if (q < best) { best = q; ramp = SC.smooth(t / (e.L * .3)); } } k *= ramp; if (k <= 0) continue; } for (let c = 0; c < 3; c++) front[i * 4 + c] = front[i * 4 + c] * (1 - k) + d[i * 4 + c] * k; front[i * 4 + 3] = Math.max(front[i * 4 + 3], k * 255); } }
      // ซับในคอเสื้อ (มืด) ใต้ช่องคอ: ช่องระหว่างคอเสื้อกับกราม/คอ ไม่เห็นฉากหลัง — คอของผู้ถ่ายวางทับ
      const bc = mk(W, H), bx = bc.getContext("2d"), lin = g.mainColor.map(v => Math.round(v * .4));
      bx.fillStyle = `rgb(${lin[0]},${lin[1]},${lin[2]})`; bx.filter = `blur(${Math.max(1, s * .01).toFixed(1)}px)`; bx.beginPath();
      [mp(-.36, -.3), tw.targets[1], tw.targets[0], tw.targets[2], mp(.36, -.3)].forEach((p, i) => bx[i ? "lineTo" : "moveTo"](p.x, p.y)); bx.closePath(); bx.fill();
      const back = pixels(bc); for (let i = 0; i < W * H; i++) back[i * 4 + 3] *= C.clip[i]; // เฉพาะภายในเงาชุด (ไม่เป็นสามเหลี่ยมดำข้างคอ)
      return { front, back, targets: T, fit };
    }
    const A = garmentAnchors(g), sim = SC.similarity(A.l, A.r, T.l, T.r), c = mk(W, H), x = c.getContext("2d");
    x.imageSmoothingQuality = "high"; x.setTransform(sim.a, sim.b, -sim.b, sim.a, T.l.x - sim.a * A.l.x + sim.b * A.l.y, T.l.y - sim.b * A.l.x - sim.a * A.l.y);
    x.drawImage(g.canvas, 0, 0);
    return { front: pixels(c), back: null, targets: T, fit };
  }

  // ---------- รีทัช ----------
  function retouchKey() { return ["rAuto", "rSmooth", "rBlemish", "rEyes", "rUnder", "rTeeth", "rSharp"].map(id => id === "rAuto" ? chk(id) : val(id)).join("|"); }
  function retouch() {
    const key = retouchKey(); if (ST.cache.rtKey === key) return ST.cache.rt;
    const W = ST.W, H = ST.H, f = ST.face, m = ST.masks;
    let px = ST.fg, all = ST.px;
    if (chk("rAuto")) { // gray-world ครึ่งทาง + ความสว่างผิวหน้าเป้าหมาย ~ 160
      // ความสว่าง: ตัดสินจากความสว่างของทั้งภาพ (ไม่ใช่สีผิว) — ผิวเข้มไม่ถูกทำให้สว่าง/ซีดผิดจริง
      // สมดุลสี: gray-world ครึ่งทาง จำกัด ±4% (กันผิวอมเขียว/เหลืองจากการชดเชยเกิน)
      const gw = SC.grayWorld(ST.px, W, H, null, { lo: .92, hi: 1.08, neutral: true });
      let ys = 0, yc = 0; for (let i = 0; i < W * H; i += 37) { ys += .299 * ST.px[i * 4] + .587 * ST.px[i * 4 + 1] + .114 * ST.px[i * 4 + 2]; yc++; }
      const ym = ys / Math.max(1, yc), ex = ym < 45 ? Math.min(1.12, 55 / Math.max(1, ym)) : ym > 200 ? Math.max(.92, 185 / ym) : 1; // เฉพาะภาพที่มืดจัดทั้งภาพ
      // แก้สีเฉพาะเมื่อภาพติดสีชัดเจน (gray-world เบี่ยง > 6%) — ภาพปกติคงสีผิวเดิมทุกประการ (ไม่อมเขียว/เหลือง)
      // ไม่ปรับสมดุลสีผิว: ฉากเดิมถูกแทนที่อยู่แล้ว และ gray-world ที่อิงฉาก/เสื้อเดิม (ชั้นหนังสือ เสื้อแดง) ทำให้ผิวเพี้ยน
      // — แก้เฉพาะภาพที่ติดสีรุนแรง (> 15%) และเพียงครึ่งทาง จำกัด ±3%
      const cast = Math.max(...gw.gains.map(g => Math.abs(g - 1))) > .15, gains = cast ? gw.gains.map(g => SC.clamp(1 + (g - 1) * .5, .97, 1.03)) : [1, 1, 1];
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

  // ---------- รวมภาพ ----------
  let pending = null, running = false;
  function schedule(level) { pending = level; clearTimeout(schedule.t); schedule.t = setTimeout(() => { if (!running && ST.phase === "done") renderNow(pending); }, 90); }
  async function renderNow(level) {
    if (!ST.alpha) return;
    running = true; pending = null; busy(true, T("studio.js.busy.compose", "กำลังรวมภาพ..."));
    await sleep(0);
    try {
      const W = ST.W, H = ST.H, t0 = now(), g = curG(), f = ST.face;
      let t = now();
      const person = retouch(); ST.timings.retouch = now() - t; t = now();
      const pA = SC.applyMatteEdits(ST.alpha, ST.editVer ? ST.edit : null), n = W * H, Ly = ST.layers;
      const gk = [g.key, ...["aScale", "aRot", "aX", "aY", "aBright", "oHarm"].map(val), JSON.stringify(ST.manual), JSON.stringify(g.fit || null), JSON.stringify(g.anchors || null)].join("|");
      let front = null, back = null, neck = null, neckShade = null, gShade = null, under = null;
      const sv = val("oShadow") / 100, keepA = new Float32Array(n);
      if (g.key !== "none") {
        if (ST.cache.gk !== gk) {
          const fit = fitGarment(g), hm = { strength: val("oHarm") / 100, bright: val("aBright") / 100, mono: !!ST.harm.mono }, ref = { gray: null, faceLum: g.faceLum, hasSkin: g.kind === "tpl" };
          ST.cache.front = SC.harmonizeGarment(fit.front, W, H, ST.harm, ref, hm);
          // แสงเงาและรอยยับจริงจากเสื้อเดิม (ตามแถบ "กลมกลืนแสงสี")
          if (ST.clothSh && hm.strength > 0) { const fr = ST.cache.front, sh = ST.clothSh, k = hm.strength; for (let i = 0; i < W * H; i++) { if (!fr[i * 4 + 3] || sh[i] === 1) continue; const m = 1 + (sh[i] - 1) * k; fr[i * 4] *= m; fr[i * 4 + 1] *= m; fr[i * 4 + 2] *= m; } }
          // ภาพขาวดำ/ภาพเก่า: ช่วงความสว่างของชุดตามภาพจริง (จุดดำ/ขาวของตัวคนเดิม — ภาพเก่ามีดำไม่สนิท ขาวไม่จ้า)
          if (ST.harm.mono && ST.harm.tone) { const fr = ST.cache.front, { bp, wp } = ST.harm.tone; for (let i = 0; i < W * H; i++) { if (!fr[i * 4 + 3]) continue; for (let c = 0; c < 3; c++) fr[i * 4 + c] = bp + fr[i * 4 + c] * (wp - bp) / 255; } }
          ST.cache.back = fit.back ? SC.harmonizeGarment(fit.back, W, H, ST.harm, { ...ref, hasSkin: false }, { ...hm, seed: 13 }) : null;
          ST.cache.gk = gk; ST.targets = fit.targets; ST.cache.fit = fit.fit;
        }
        front = ST.cache.front; back = ST.cache.back;
        ST.timings.fit = now() - t; t = now();
        // คอ: คอจริง + ต่อคอลงใต้คอเสื้อใหม่ (แคชตามชุด/รีทัช/การแก้ matte)
        // คอขึ้นกับตำแหน่งคอเสื้อ (fit) ไม่ใช่แบบชุด: เปลี่ยนชุดสำเร็จรูปไม่ต้องสร้างคอใหม่
        const cf = ST.cache.fit, nkKey = [cf.N.x, cf.N.y, cf.s, cf.theta, cf.drop || 0].map(v => (+v).toFixed(2)).join("|") + "|" + ST.cache.rtKey + "|" + ST.editVer;
        if (ST.cache.nkKey !== nkKey) { ST.cache.neck = SC.synthNeck(person, pA, Ly.neck, Ly.keep, W, H, f, ST.cache.fit, { skinRGB: ST.harm.skinRGB, noise: Math.min(4, ST.harm.noise || 0), hair: Ly.hair, collarY: PBOutfits.CANON.collarY, half: ST.neckM ? ST.neckM.half : null, mono: !!ST.harm.mono }); ST.cache.nkKey = nkKey; }
        neck = ST.cache.neck;
        for (let i = 0; i < n; i++) keepA[i] = pA[i] * Ly.keep[i];
        const HS = g.kind === "vector" || (g.anchors && g.anchors.length >= 5) ? ST.handsUsed : ST.hands;
        if (HS) for (let i = 0; i < n; i++) if (HS[i] > 0) keepA[i] = Math.max(keepA[i], pA[i] * HS[i]);
        const fA = new Float32Array(n); for (let i = 0; i < n; i++) fA[i] = front[i * 4 + 3] / 255;
        // เศษที่หลุดจากตัว (ถุงมือ/วัตถุ/สีชุดเดิม) และช่องฉากหลังระหว่างกราม-คอเสื้อ
        { const cover = new Float32Array(n); for (let i = 0; i < n; i++) cover[i] = Math.max(fA[i], neck ? neck.alpha[i] : 0); SC.removeStrayIslands(keepA, cover, W, H, Math.round(f.fw * f.fw * .15)); }
        if (neck) { neck = { ...neck, rgba: new Uint8ClampedArray(neck.rgba), alpha: new Float32Array(neck.alpha) }; SC.fillNeckGaps(neck, keepA, fA, W, H, f, (neck.yCollar || f.chinY + f.fw * .4) + f.fw * .15, ST.harm.skinRGB, ST.layers.hair); }
        neckShade = SC.contactShadow(fA, W, H, f, { chin: .3 * sv, collar: .38 * sv });
        const hairA = new Float32Array(n); for (let i = 0; i < n; i++) hairA[i] = keepA[i] * Ly.hair[i];
        gShade = sv > 0 ? SC.hairShadow(hairA, W, H, f.fw, { amount: .32 * sv }) : null;
        // เงาสัมผัสใต้มือ/แขนที่วางหน้าชุด (มือไม่ดู "แปะ"): เบลอ mask มือแล้วเลื่อนลงเล็กน้อย
        if (sv > 0 && HS) { const ha = new Float32Array(n); for (let i = 0; i < n; i++) ha[i] = HS[i] * pA[i]; const hs = SC.hairShadow(ha, W, H, f.fw, { dy: .05, r: .05, amount: .45 * sv }); if (gShade) for (let i = 0; i < n; i++) gShade[i] = Math.max(gShade[i], hs[i]); else gShade = hs; }
        if (!chk("oHide")) { under = { rgba: person, alpha: new Float32Array(n) }; for (let i = 0; i < n; i++) under.alpha[i] = pA[i] * Ly.body[i]; }
      } else { ST.targets = null; keepA.set(pA); ST.timings.fit = now() - t; t = now(); }
      ST.timings.neck = now() - t; t = now();
      const bg = await bgPixels(person);
      const r = SC.composeLayers({ w: W, h: H, bg, person, keepA, neck, back, front, under, neckShade, gShade, wrap: bgKey === "orig" ? 0 : val("oWrap") / 100 * .4, wrapR: Math.max(4, Math.round(Math.max(W, H) / 120)) });
      ST.timings.composite = now() - t;
      ST.timings.render = now() - t0;
      ST.out = r.rgba; ST.fgAlpha = r.fgAlpha; ST.keepA = keepA;
      $("#stOut").getContext("2d").putImageData(new ImageData(r.rgba, W, H), 0, 0);
      drawOverlay();
    } catch (e) { console.error(e); toast(T("studio.js.composeFail", "รวมภาพไม่สำเร็จ: {e}", { e: e.message })); }
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
    $("#stHint").textContent = mode === "fit" ? T("studio.js.hint.fit", "ลากจุดม่วง = คาง, จุดฟ้า = ปลายไหล่ เพื่อให้ชุดเข้ารูป") : mode === "view" ? T("studio.js.hint.view", "เลื่อนแถบ ก่อน | หลัง เพื่อเทียบภาพ") : mode === "restore" ? T("studio.js.hint.restore", "ระบายบนภาพ: คืนส่วนของตัวคนที่ถูกตัดหาย") : T("studio.js.hint.erase", "ระบายบนภาพ: ลบพื้นหลังที่ติดมา");
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
      if (!b) { toast(T("studio.js.fileFail", "สร้างไฟล์ไม่สำเร็จ")); return res(null); }
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
  /** เพิ่มเทมเพลตชุดจากรูปถ่าย (canvas พื้นใส + จุดยึด) — ใช้โดยชุดทดสอบ/สคริปต์วัดผล ไม่บันทึกลงเครื่อง */
  function addTemplate(canvas, anchors, { name = "template", faceLum = null } = {}) {
    const id = "t" + Math.random().toString(36).slice(2, 8), g = tplGarment({ id, name, anchor: { faceLum }, anchors: anchors || SC.templateAnchors(alphaOf(canvas), canvas.width, canvas.height) }, canvas);
    ST.garments.splice(1, 0, g); renderGarments(); return g.key;
  }
  /** สีผ้าหลักของเทมเพลต: ค่ามัธยฐานของพิกเซลทึบรอบจุดไหล่ (ตัวเสื้อ ไม่ใช่เชิ้ต/เนคไทกลางอก) */
  function templateMain(g) {
    // ตัวเสื้อด้านข้าง (ไม่รวมแนวกลางที่เป็นเชิ้ต/เนคไท) ช่วงไหล่ถึงกลางตัว — ค่ามัธยฐานความสว่าง แล้วใช้สีของพิกเซลรอบค่ามัธยฐาน
    prepGarment(g); const A = g.anchors, W = g.canvas.width, H = g.canvas.height, px = g.px, k = q => A.find(p => p.k === q);
    const l = k("l"), r = k("r"), n = k("neck"), hl = k("hl"); if (!l || !r || !n) return [60, 60, 60];
    const y0 = Math.round(Math.max(l.y, r.y)), y1 = Math.round(Math.min(H - 1, y0 + ((hl ? hl.y : H) - y0) * .5)), sw = r.x - l.x, pts = [];
    for (let y = y0; y <= y1; y += 3) for (let x = Math.round(l.x); x <= r.x; x += 3) { if (Math.abs(x - n.x) < sw * .2) continue; const i = (y * W + x) * 4; if (px[i + 3] < 220) continue; pts.push([.299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2], px[i], px[i + 1], px[i + 2]]); }
    if (!pts.length) return [60, 60, 60];
    pts.sort((a, b) => a[0] - b[0]); const mid = pts.slice(Math.floor(pts.length * .4), Math.ceil(pts.length * .6));
    return [1, 2, 3].map(c => Math.round(mid.reduce((t, p) => t + p[c], 0) / mid.length));
  }
  const alphaOf = c => { const d = ctx2(c).getImageData(0, 0, c.width, c.height).data, a = new Float32Array(c.width * c.height); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255; return a; };
  window.__studio = { addTemplate, load: c => load(toWork(c)), state: ST, render: () => renderNow("test"), garments: () => ST.garments.map(g => g.key), select: k => { ST.gKey = k; renderGarments(); return renderNow("test"); }, idPhoto, lastExport: null };
  // เปลี่ยนภาษา: วาดรายการชุด/ฉากหลังใหม่ (ข้อความสถานะจะเป็นภาษาใหม่ในรอบประมวลผลถัดไป)
  window.addEventListener("lq-lang", () => { if (ST.garments.length) renderGarments(); renderBgChoices(); });
  init();
})();
