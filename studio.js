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
  const MAX_SIDE = 1200, HI_SIDE = 2400;
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
    const cls = p.some(x => x.c === "err") ? "err" : p.some(x => x.c === "warn") ? "warn" : p.every(x => x.c === "ok") ? "ok" : "";
    e.className = "engine " + cls;
    // บรรทัดสถานะแบบง่าย (#stReady) — ชื่อโมเดลและวิธีที่ใช้อยู่ใน "รายละเอียดทางเทคนิค" (#stEngine)
    const r = $("#stReady"); if (!r) return;
    const all = Object.values(eng), err = all.find(x => x.c === "err");
    r.textContent = err ? err.t
      : eng.run ? (eng.run.c === "warn" ? T("studio.js.ready.doneWarn", "เสร็จแล้ว ({s} วินาที) · ไม่พบจุดบนใบหน้า ปรับจุดคอและไหล่ได้", { s: status.secs || "?" }) : T("studio.js.ready.done", "เสร็จแล้ว ({s} วินาที)", { s: status.secs || "?" }))
      : all.some(x => x.c === "") ? T("studio.js.ready.loading", "กำลังเตรียมระบบ...")
      : all.some(x => x.c === "warn") ? T("studio.js.ready.fallback", "พร้อมใช้งาน (บางส่วนใช้วิธีสำรอง ดูรายละเอียดทางเทคนิค)")
      : T("studio.js.ready.ok", "พร้อมใช้งาน");
    r.className = "engine " + cls;
  }
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2800); }

  // ---------- state ----------
  const ST = {
    phase: "idle", W: 0, H: 0, src: null, px: null, alpha: null, fg: null, edit: null, editVer: 0, method: "",
    face: null, body: null, harm: null, masks: null, layers: null, fitAuto: null, parse: "",
    garments: [], gKey: "none", targets: null, manual: null,
    cache: {}, timings: {}, out: null, err: null, qa: null, shown: null, draft: null, draftOK: new Set(), coverMode: "auto", variant: null, conf: null
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
    // ค่าเริ่มต้น = ไม่ใส่ชุด (ฉากหลังใหม่ + รีทัช = ผลที่เชื่อถือได้) — เลือกชุดให้เองเฉพาะเมื่อความมั่นใจที่ปรับเทียบแล้วถึงเกณฑ์ (StudioQA.defaultOutfitAllowed)
    const auto = window.StudioQA && window.StudioQA.defaultOutfitAllowed && window.StudioQA.defaultOutfitAllowed();
    if (!list.some(g => g.key === ST.gKey)) ST.gKey = "none";
    if (ST.gKey === "none" && !ST._userNone && auto) ST.gKey = list.find(g => g.kind === "tpl") ? list.find(g => g.kind === "tpl").key : "v:suit_navy";
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
      let fin = PBTpl.finalizeOutfit(prep, .5), photo = null;
      // ชุดวางราบบนพื้นเรียบ (ไม่มีคน — MODNet ตัดไม่ได้): แยกสีพื้นหลังจากขอบภาพแทน
      { const a = alphaOf(fin.canvas); let cov = 0; for (let i = 0; i < a.length; i += 7) cov += a[i] > .5; if (cov / (a.length / 7) < .05 || prep.source === "photo" && !(fin.anchor && fin.anchor.faceLum)) {
        const src = await PBTpl.fileToCanvas(f), px = ctx2(src).getImageData(0, 0, src.width, src.height), al = SC.refineMatte(px.data, SC.borderKeyAlpha(px.data, src.width, src.height), src.width, src.height, { k: 3 });
        photo = { px: new Uint8ClampedArray(px.data), alpha: al, W: src.width, H: src.height };
        for (let i = 0; i < al.length; i++) px.data[i * 4 + 3] = al[i] * 255;
        const bb = PBTpl.opaqueBBox(px.data, src.width, src.height) || { x: 0, y: 0, w: src.width, h: src.height }, full = mk(src.width, src.height); full.getContext("2d").putImageData(px, 0, 0);
        const c = mk(bb.w, bb.h); c.getContext("2d").drawImage(full, -bb.x, -bb.y); fin = { canvas: c, anchor: { faceLum: null } };
      } }
      const anchors = SC.templateAnchors(alphaOf(fin.canvas), fin.canvas.width, fin.canvas.height);
      // ตรวจรูปชุดก่อนใช้ (studio-qa.js garmentPhotoCheck): ไม่ผ่าน = ไม่เพิ่ม และบอกวิธีถ่ายใหม่; คำเตือน = เพิ่มพร้อมคำแนะนำ
      const pc = window.StudioQA ? (photo ? window.StudioQA.garmentPhotoCheck({ ...photo, anchors, labOf: SC.rgbToLab })
        : window.StudioQA.garmentPhotoCheck({ px: ctx2(fin.canvas).getImageData(0, 0, fin.canvas.width, fin.canvas.height).data, alpha: alphaOf(fin.canvas), W: fin.canvas.width, H: fin.canvas.height, anchors, labOf: SC.rgbToLab, hasBg: false })) : { ok: !!anchors, issues: [] };
      ST.garmentCheck = pc;
      const tips = pc.issues.map(i => "• " + garmentTip(i.k)).join("\n");
      if (!pc.ok) { msg.textContent = T("studio.js.outfit.reject", "ยังใช้รูปชุดนี้ไม่ได้ — ถ่ายใหม่ตามนี้:") + "\n" + tips; return; }
      const item = { id: crypto.randomUUID(), kind: "outfit", name: f.name.replace(/\.[^.]+$/, "").slice(0, 40) || T("studio.js.myOutfit", "ชุดของฉัน"), anchor: fin.anchor, anchors, blob: await PBTpl.toBlob(fin.canvas), created: Date.now() };
      await PBTpl.put(item);
      const g = tplGarment(item, fin.canvas);
      ST.garments.splice(1, 0, g); ST.gKey = g.key; ST.manual = null;
      msg.textContent = T("studio.js.outfit.added", 'เพิ่มชุด "{n}" แล้ว — ถ้าไหล่ไม่ตรง กด "ตั้งจุดคอ/ไหล่ของชุด"', { n: item.name }) + (tips ? "\n" + T("studio.js.outfit.tips", "ผลจะดีขึ้นถ้าถ่ายใหม่:") + "\n" + tips : "");
      renderGarments(); schedule("fit");
    } catch (err) { console.warn(err); msg.textContent = T("studio.js.outfit.fail", "เพิ่มชุดไม่สำเร็จ: {e}", { e: err.message }); }
  };

  /** คำแนะนำการถ่ายรูปชุดตามปัญหาที่ตรวจพบ (garmentPhotoCheck) */
  function garmentTip(k) {
    const th = {
      notFound: "หาตัวเสื้อในรูปไม่พบ — วางชุดบนพื้นเรียบสีตัดกับชุด ถ่ายให้เห็นทั้งตัวเสื้อ",
      tooSmall: "ชุดเล็กเกินไปในภาพ — ถ่ายใกล้ขึ้นให้ชุดกินพื้นที่ราวครึ่งภาพ",
      fillsFrame: "ชุดเต็มภาพจนไม่เห็นพื้น — ถอยกล้องออกให้เห็นพื้นรอบชุด",
      cutOff: "ชุดถูกตัดที่ขอบภาพ — เว้นที่ว่างรอบชุด เห็นตั้งแต่คอ ไหล่ ถึงชายเสื้อ",
      lowContrast: "สีพื้นใกล้กับสีชุด — ใช้พื้นสีตัดกัน (ชุดเข้มบนพื้นขาว ชุดอ่อนบนพื้นเข้ม)",
      unevenBg: "แสงบนพื้นไม่สม่ำเสมอหรือมีเงา — ใช้แสงกระจาย ไม่ใช้แฟลช",
      busyBg: "พื้นมีลายหรือรอย — ใช้ผ้าปูหรือกระดาษสีเรียบ",
      exposure: "ภาพสว่างหรือมืดเกินไป — ปรับแสงให้เห็นเนื้อผ้า",
      pieces: "มีชิ้นส่วนแยกจากตัวชุด (เงาหรือลายพื้น) — ใช้พื้นเรียบและแสงสม่ำเสมอ",
      tilted: "ชุดวางเอียง — จัดไหล่สองข้างให้ระดับเดียวกันและคอเสื้ออยู่ตรงกลาง",
      folds: "มีรอยพับหรือเงาแรงบนชุด — รีดหรือจัดผ้าให้เรียบ"
    }[k] || k;
    return T("studio.js.gtip." + k, th);
  }

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
    // ภาพต้นฉบับที่ใหญ่กว่าภาพทำงาน: เก็บไว้ไม่เกิน HI_SIDE สำหรับไฟล์ความละเอียดสูง (แบบไม่ใส่ชุด) — อยู่ในหน่วยความจำเท่านั้น
    if (k < 1) { const kh = Math.min(1, HI_SIDE / Math.max(w, h)), hc = mk(Math.round(w * kh), Math.round(h * kh)); hc.getContext("2d").drawImage(src, 0, 0, hc.width, hc.height); c._hi = hc; }
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
    ST.phase = "analyzing"; ST.err = null; ST.cache = {}; ST.manual = null; ST.timings = {}; ST.qa = null; ST.draftOK = new Set(); ST.shown = null; ST.draft = null; ST.noq = null; ST.noqAnyway = false; ST.origFallback = false; ST.reviewed = new Set(); $("#stQa").hidden = true;
    const T0 = now();
    ST.src = canvas; ST.W = canvas.width; ST.H = canvas.height; ST.hi = canvas._hi || null; ST.idSpec = null; if ($("#stIdSpec")) $("#stIdSpec").innerHTML = "";
    ST.px = ctx2(canvas).getImageData(0, 0, ST.W, ST.H).data;
    ST.edit = new Float32Array(ST.W * ST.H); ST.editVer = 0;
    prog.t0 = T0; showView(); busy(true, prog(1, T("studio.js.busy.matte", "กำลังตัดพื้นหลัง...")));
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
      busy(true, prog(2, T("studio.js.busy.refine", "กำลังเกลาขอบผม...")));
      await sleep(0);
      ST.alpha = SC.refineMatte(ST.px, raw, W, H, { r: Math.max(2, Math.max(W, H) / 512), k: ST.method === "MODNet" ? 1.6 : 3 });
      ST.timings.refine = now() - t; t = now();
      busy(true, prog(3, T("studio.js.busy.face", "กำลังหาใบหน้า คอ และไหล่...")));
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
      busy(true, prog(4, T("studio.js.busy.parse", "กำลังแยกผม ใบหน้า และคอ...")));
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
      // ตรวจความเหมาะสมของรูปก่อนเสนอชุด (studio-qa.js photoSuitability): หน้าตรง เห็นคอ ผมไม่คลุมไหล่ เสื้อเรียบ เห็นไหล่
      ST.pre = null; try { if (window.StudioQA && window.StudioQA.photoSuitability) ST.pre = window.StudioQA.photoSuitability({ px: ST.px, alpha: ST.alpha, hair: ST.layers.hair, neck: ST.layers.neck, W, H, face }); } catch (e) { console.warn("pre-flight", e); }
      renderPre();
      const b = $("#stBefore"); b.width = W; b.height = H; b.getContext("2d").drawImage(canvas, 0, 0);
      for (const id of ["stOut", "stOverlay"]) { const c = document.getElementById(id); c.width = W; c.height = H; }
      ST.phase = "rendering"; prog.step = 5;
      await renderNow("fit");
      ST.timings.firstResult = now() - T0; prog.t0 = 0;
      try { localStorage.setItem("lq.studio.ms", String(Math.round(ST.timings.firstResult / Math.max(.2, W * H / 1e6)))); } catch { /* ไม่มี storage: ใช้ค่าประมาณเริ่มต้น */ }
      ST.phase = "done";
      const hint = face.detected ? "" : " " + T("studio.js.noFace", "(ไม่พบจุดบนใบหน้า: ประมาณจากรูปทรง ปรับจุดคอ/ไหล่ได้)");
      status.secs = (ST.timings.firstResult / 1000).toFixed(1);
      status("run", T("studio.js.done", "ตัดพื้นหลังด้วย {m} · แยกผม/คอ: {p} · เสร็จใน {s} วินาที{hint}", { m: ST.method, p: ST.parse, s: (ST.timings.firstResult / 1000).toFixed(1), hint }), face.detected ? "ok" : "warn");
      ["#stPng", "#stJpg", "#stIdOne", "#stIdSheet", "#stIdCheck"].forEach(s => $(s).disabled = false); $("#stHiRes").disabled = !ST.hi;
    } catch (e) {
      console.error(e); ST.phase = "error"; ST.err = String(e && e.message || e); status("run", T("studio.js.fail", "ประมวลผลไม่สำเร็จ: {e}", { e: ST.err }), "err");
    } finally { busy(false); }
  }

  // ---------- ปรับชุด ----------
  /** แยก ผม/ใบหน้า/คอ/เสื้อ: BiSeNet บนครอปรอบใบหน้า (ถ้าผมยาวถึงขอบล่างของครอป รันซ้ำด้วยครอปที่ใหญ่ขึ้น) สำรอง = heuristic */
  // ?faceparse=1 only on a research-demo device (PBHQ.faceparseAllowed); no PBHQ = off
  const parseOptIn = () => !!(self.PBHQ && PBHQ.faceparseAllowed && PBHQ.faceparseAllowed(self));
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
  // ---------- จุดยึดชุด 7 จุด (item 24): คอ ปกคอ ×2 ปลายไหล่ ×2 ชายเสื้อ ×2 — ลากได้ทุกจุด ชุดดัดตามจุด (thin-plate spline) ----------
  const FIT_KEYS = ["chin", "cl", "cr", "l", "r", "hl", "hr"];
  const STD_UV = () => {
    const C = /** @type {any} */ (window).PBOutfits.CANON;
    return { chin: [0, 0], cl: [-.33, C.collarY], cr: [.33, C.collarY], l: [C.L.x, C.L.y], r: [C.R.x, C.R.y], hl: [-1.5, 2.6], hr: [1.5, 2.6] }; };
  /** ตำแหน่งมาตรฐานของ 7 จุดตาม fit (N, s, theta) — ชุดสำเร็จรูปและชุดที่ไม่มีจุดยึด */
  function canonPts(fit) {
    const cs = Math.cos(fit.theta || 0), sn = Math.sin(fit.theta || 0), o = {}, U = STD_UV();
    for (const k of FIT_KEYS) { const [u, v] = U[k]; o[k] = { x: fit.N.x + fit.s * (cs * u - sn * v), y: fit.N.y + fit.s * (sn * u + cs * v) }; }
    return o;
  }
  const hasAnchors = g => !!g && g.kind !== "vector" && Array.isArray(g.anchors) && g.anchors.length >= 5;
  /** จุดอัตโนมัติ: ชุดที่มีจุดยึด = จุดที่วัดจากตัวคนรายจุด (SC.personTargets); อื่น ๆ = ตำแหน่งมาตรฐานตามแนวไหล่ที่วัดได้ */
  function autoHandles(g) {
    const F = ST.fitAuto, fit3 = { chin: { ...F.chin }, l: { ...F.l }, r: { ...F.r } }, key = (g ? g.key : "") + "|" + JSON.stringify(g && g.anchors || null);
    if (ST.cache.ahKey === key) return ST.cache.ah;
    const fit = SC.fitFromTargets(fit3, /** @type {any} */ (window).PBOutfits.CANON), handles = canonPts(fit);
    ST.fitSrc = "canon";
    if (hasAnchors(g)) {
      const Ly = ST.layers || {}, pt = SC.personTargets(g.anchors, fit, ST.alpha, ST.W, ST.H, ST.face, { side: F.side, hair: Ly.hair || null, keep: Ly.keep || null });
      pt.targets.forEach(t => { handles[t.k === "neck" ? "chin" : t.k] = { x: t.x, y: t.y }; });
      ST.fitSrc = pt.targets.map(t => t.k + ":" + t.src).join(" ");
    }
    ST.cache.ahKey = key; ST.cache.ah = { handles, fit3 };
    return ST.cache.ah;
  }
  /** จุดที่ใช้จริง (ลากเอง หรืออัตโนมัติ) หลังแถบ ขนาด/หมุน/เลื่อน + fit3 = จุด คอ/ไหล่ สำหรับวางทั้งชุด (similarity) */
  function adjustedTargets(g) {
    const A = autoHandles(g), H0 = ST.manual || A.handles, f = ST.face, s = val("aScale") / 100, rot = val("aRot") * Math.PI / 180;
    const dx = val("aX") / 100 * f.fw * 2, dy = val("aY") / 100 * f.fw * 2, c = H0.chin, cos = Math.cos(rot), sin = Math.sin(rot);
    const tf = p => { const x = (p.x - c.x) * s, y = (p.y - c.y) * s; return { x: c.x + x * cos - y * sin + dx, y: c.y + x * sin + y * cos + dy }; };
    const T = {}; for (const k of FIT_KEYS) T[k] = tf(H0[k] || A.handles[k]);
    // วางทั้งชุด: ย้ายจุดคอ/ไหล่อัตโนมัติด้วย similarity จากปลายไหล่อัตโนมัติ -> ปลายไหล่ที่ใช้ แล้วเลื่อนตามจุดคอ (ไม่ลาก ไม่ปรับ = เหมือนเดิม)
    const sim = SC.similarity(A.handles.l, A.handles.r, T.l, T.r), m = p => sim.map(p.x, p.y), c0 = m(A.handles.chin), ex = { x: T.chin.x - c0.x, y: T.chin.y - c0.y };
    const mv = p => { const q = m(p); return { x: q.x + ex.x, y: q.y + ex.y }; };
    T.fit3 = { chin: mv(A.fit3.chin), l: mv(A.fit3.l), r: mv(A.fit3.r) };
    return T;
  }
  /** ลากจุดเอง (ชุดสำเร็จรูป / ชุดไม่มีจุดยึด): ดัดชั้นชุดที่วาดแล้วจากตำแหน่งมาตรฐานไปยังจุดที่ลาก — ไม่ลาก = ไม่แตะภาพ */
  function postWarp(layers, fit, T) {
    if (!ST.manual) return layers;
    const from = canonPts(fit), F = [], Tt = [];
    let moved = false; for (const k of FIT_KEYS) { F.push(from[k]); Tt.push(T[k]); if (Math.hypot(T[k].x - from[k].x, T[k].y - from[k].y) > 1) moved = true; }
    if (!moved) return layers;
    const tps = SC.tpsFit(Tt, F, .02 * fit.s * fit.s / 1e4), inv = (x, y) => tps.map(x, y), W = ST.W, H = ST.H;
    return layers.map(d => d ? SC.warpRGBA(d, W, H, W, H, inv, { step: 4 }) : d);
  }
  const pixels = c => ctx2(c).getImageData(0, 0, c.width, c.height).data;
  /** ทิศแสงจากความสว่างแก้มซ้าย/ขวา (ใช้ให้แสงเงาผ้าตรงกับใบหน้า) */
  function lightDir() { const lr = ST.harm && ST.harm.lr; return { x: lr ? SC.clamp((lr[1] - lr[0]) / Math.max(1, lr[0] + lr[1]) * 4, -.6, .6) : -.2 }; }
  /**
   * วางชุดลงพิกัดภาพแบบ similarity (ไม่ดัด/บิด): ชุดสำเร็จรูปวาดตรงที่ขนาด s/มุม theta/โคนคอ N (คมชัด มีชั้นปกหลังคอแยก)
   * ชุดจากรูปจริง (tpl) ใช้ similarity จากจุดไหล่ของเทมเพลตไปยังจุดไหล่ของผู้ถ่าย
   */
  function fitGarment(g) {
    const W = ST.W, H = ST.H, T = adjustedTargets(g), fit = SC.fitFromTargets(T.fit3, PBOutfits.CANON);
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
      fit.nw = nwU || .33;
      const L = PBOutfits.layers(g.vk, { W, H, s: fit.s, theta: fit.theta, N: fit.N, light: lightDir(), seed: 7, drop: fit.drop, clip: C.clip, form: C.form, nw: nwU, side: fit.side, arms: C.arms });
      const [fr, bk] = postWarp([pixels(L.front), pixels(L.back)], fit, T); return { front: fr, back: bk, targets: T, fit };
    }
    prepGarment(g);
    if (g.anchors && g.anchors.length >= 5) {
      // เทมเพลตจากรูปถ่าย: ดัดด้วย thin-plate spline จากจุดยึดของชุด (ช่องคอ ปก ไหล่ ชายเสื้อ) ไปยังตำแหน่งบนตัวคน
      // ตามแนวไหล่จริง (เอียง/ไหล่สองข้างไม่เท่ากัน) — คางและผมวางทับภายหลัง (ลำดับชั้นเดียวกับชุดสำเร็จรูป)
      fit.side = ST.manual ? null : ST.fitAuto.side;
      const tw = SC.templateWarpTo(g.anchors, g.anchors.map(a => T[a.k === "neck" ? "chin" : a.k] || T.chin)), cs = Math.cos(fit.theta), sn = Math.sin(fit.theta), s = fit.s;
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
    return { front: postWarp([pixels(c)], fit, T)[0], back: null, targets: T, fit };
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
    running = true; pending = null; busy(true, prog.t0 ? prog(5, T("studio.js.busy.compose", "กำลังรวมภาพ...")) : T("studio.js.busy.compose", "กำลังรวมภาพ..."));
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
        if (neck) { neck = { ...neck, rgba: new Uint8ClampedArray(neck.rgba), alpha: new Float32Array(neck.alpha) }; SC.restoreNeckSides(neck, keepA, fA, person, pA, W, H, f, neck.yCollar || f.chinY + f.fw * .4, ST.layers.hair); SC.fillNeckGaps(neck, keepA, fA, W, H, f, (neck.yCollar || f.chinY + f.fw * .4) + f.fw * .15, ST.harm.skinRGB, ST.layers.hair, person); }
        neckShade = SC.contactShadow(fA, W, H, f, { chin: .3 * sv, collar: .38 * sv });
        const hairA = new Float32Array(n); for (let i = 0; i < n; i++) hairA[i] = keepA[i] * Ly.hair[i];
        gShade = sv > 0 ? SC.hairShadow(hairA, W, H, f.fw, { amount: .32 * sv }) : null;
        // เงาสัมผัสใต้มือ/แขนที่วางหน้าชุด (มือไม่ดู "แปะ"): เบลอ mask มือแล้วเลื่อนลงเล็กน้อย
        if (sv > 0 && HS) { const ha = new Float32Array(n); for (let i = 0; i < n; i++) ha[i] = HS[i] * pA[i]; const hs = SC.hairShadow(ha, W, H, f.fw, { dy: .05, r: .05, amount: .45 * sv }); if (gShade) for (let i = 0; i < n; i++) gShade[i] = Math.max(gShade[i], hs[i]); else gShade = hs; }
        if (!chk("oHide")) { under = { rgba: person, alpha: new Float32Array(n) }; for (let i = 0; i < n; i++) under.alpha[i] = pA[i] * Ly.body[i]; }
      } else { ST.targets = null; keepA.set(safeKeep(pA)); ST.timings.fit = now() - t; t = now(); }
      ST.timings.neck = now() - t; t = now();
      const bg = await bgPixels(person), wrapK = bgKey === "orig" ? 0 : val("oWrap") / 100 * .4, wrapR = Math.max(4, Math.round(Math.max(W, H) / 120));
      // แบบคอสูง (ปิดรอยต่อคอ): ผ้าคอเต่าทับคอที่สร้าง ใต้ตัวชุดและศีรษะ (studio-core.js coverLayer)
      const neckBase = neck, coverOf = () => {
        if (!ST.cache.fit || !neckBase) return null;
        const ck = [ST.cache.nkKey, g.key, ST.cache.gk].join("#");
        if (ST.cache.coverKey !== ck) { ST.cache.coverL = SC.coverLayer(W, H, f, ST.cache.fit, { color: ST.harm.mono ? Array(3).fill(Math.round(coverColor(g).reduce((a, v, i) => a + v * [.299, .587, .114][i], 0))) : coverColor(g), light: lightDir(), noise: Math.min(4, ST.harm.noise || 0), collarY: PBOutfits.CANON.collarY, nw: ST.cache.fit.nw || .33, half: ST.neckM ? ST.neckM.half : null }); ST.cache.coverKey = ck; }
        return ST.cache.coverL;
      };
      const composeG = withCover => {
        let nk = neckBase; ST.cache.cover = null;
        // คอที่สร้างนอกผ้า (แผ่นผิวกว้างใต้มุมกราม) ไม่แสดงในแบบคอสูง — เหลือเฉพาะผ้า (มุมกรามยื่นเหนือฉากตามธรรมชาติ)
        if (withCover && neckBase) { const cv = coverOf(); if (cv) { nk = SC.mergeCover({ ...neckBase, rgba: new Uint8ClampedArray(neckBase.rgba), alpha: new Float32Array(n) }, cv, n); ST.cache.cover = cv; } }
        return SC.composeLayers({ w: W, h: H, bg, person, keepA, neck: nk, back, front, under, neckShade, gShade, wrap: wrapK, wrapR });
      };
      const coverMode = COVER_Q != null ? (COVER_Q ? "on" : "off") : ST.coverMode;
      let r = composeG(g.key !== "none" && coverMode === "on");
      ST.timings.composite = now() - t;
      ST.out = r.rgba; ST.fgAlpha = r.fgAlpha; ST.keepA = keepA; ST.draft = null; ST.shown = g.key === "none" ? "none" : "garment"; ST.variant = ST.cache.cover ? "cover" : null; ST.conf = null; ST.qaPlain = null;
      // ประตูคุณภาพ (studio-qa.js ชุด gate + ความมั่นใจจากตัวจำแนกที่เรียนรู้ learnedGate): ผลแต่งชุดที่ไม่ผ่าน หรือความมั่นใจต่ำกว่าเกณฑ์
      // ไม่ถูกแสดงเป็นผลหลัก — แสดงแบบปลอดภัยแทน (เสื้อเดิมของผู้ถ่าย + ฉากหลังใหม่ + รีทัช: ไม่มีรอยต่อคอ/กราม)
      // ผู้ใช้เลือกดู "แบบร่าง" ได้เองโดยมีป้ายเตือน — โหมด auto: ถ้าข้างกรามเปิด (ไม่มีผมบัง) ใช้แบบคอสูงทุกครั้ง ไม่ว่าแบบเดิมจะผ่านหรือไม่ (ตรงกับ ACCURACY.md §11 รอบ 10)
      ST.qa = null; ST.timings.qa = 0;
      if (g.key !== "none" && window.StudioQA && ST.cache.fit && front) {
        const tq = now();
        const judge = () => {
          let q; try { q = window.StudioQA.evaluate(ST, SC, { gate: true }); } catch (e) { console.warn("qa", e); q = { pass: false, fails: ["qa-error"], m: {} }; }
          // ok = ผ่านประตูกฎ (studio-qa.js verdict); conf = อัตราภาพชุดที่ไม่มีรอยซึ่งวัดได้ (ปรับเทียบบนชุด dev) แสดงในข้อความ — ไม่ใช้ตัดสินรายภาพ
          // เพราะตัวจำแนกที่เรียนรู้ไม่แยกภาพดี/เสียบนคนที่ไม่เคยเห็น (ACCURACY.md §11) จึงไม่เลือกชุดให้เองตอนเปิดรูป (defaultOutfit)
          q.ok = q.pass;
          try { q.jf = window.StudioQA.jawFeatures(window.StudioQA.jawCropOf(ST)); if (window.StudioQA.confidence) q.conf = window.StudioQA.confidence(q.m, q.jf, { cover: !!ST.cache.cover }); } catch (e) { console.warn("conf", e); }
          return q;
        };
        ST.qa = judge();
        // โหมด auto: ข้างกรามเปิด (ผมไม่บัง ≥ COVER_OPEN) -> ใช้แบบคอสูงแทน (วัดบนชุด dev: ภาพชุดที่มีรอย 70/108 เทียบ 83/108 แบบเดิม — ACCURACY.md §11)
        if (coverMode === "auto" && neckBase && ST.qa.jf && ST.qa.jf.open >= COVER_OPEN) {
          const plain = ST.qa, rc = composeG(true);
          ST.out = rc.rgba; ST.fgAlpha = rc.fgAlpha;
          r = rc; ST.qa = judge(); ST.qaPlain = plain; ST.variant = "cover";
        }
        ST.conf = ST.qa.conf ? ST.qa.conf.p : null;
        ST.timings.qa = now() - tq;
        // draftOK = ผู้ใช้สลับจากค่าเริ่มต้นของชุดนี้: ไม่ผ่าน -> ดูแบบร่าง, ผ่าน -> ดูแบบไม่ใส่ชุด ("plain")
        const ok = ST.qa.ok, flip = ST.draftOK.has(g.key);
        if (!ok || flip) ST.draft = r;
        if (ok ? flip : !flip) {
          const sc = SC.composeLayers({ w: W, h: H, bg, person, keepA: safeKeep(pA), wrap: wrapK, wrapR });
          ST.out = sc.rgba; ST.fgAlpha = sc.fgAlpha; ST.shown = ok ? "plain" : "safe";
        } else { ST.out = r.rgba; ST.fgAlpha = r.fgAlpha; if (!ok) ST.shown = "draft"; }
      } else if (g.key !== "none") {
        // round 12: ปิดแบบปลอดภัย (fail closed) — ตัวตรวจ (studio-qa.js) โหลดไม่สำเร็จ หรือไม่มีผลจัดชุด/ชั้นชุด: ไม่แสดงชุดที่ไม่ได้ตรวจเป็นผลหลัก
        // แสดงแบบไม่ใส่ชุดก่อน ดูชุดได้เมื่อกดเอง ("unchecked": ป้ายเตือนของตัวเอง ป้ายมุมภาพ และต้องยืนยันก่อนส่งออกเหมือนแบบร่าง)
        ST.qa = { pass: false, ok: false, fails: ["unchecked"], m: {}, unchecked: true };
        ST.draft = r;
        if (ST.draftOK.has(g.key)) { ST.out = r.rgba; ST.fgAlpha = r.fgAlpha; ST.shown = "unchecked"; }
        else { const sc = SC.composeLayers({ w: W, h: H, bg, person, keepA: safeKeep(pA), wrap: wrapK, wrapR }); ST.out = sc.rgba; ST.fgAlpha = sc.fgAlpha; ST.shown = "safe"; }
      }
      noOutfitGate();
      ST.timings.render = now() - t0;
      $("#stOut").getContext("2d").putImageData(new ImageData(ST.out, W, H), 0, 0);
      drawOverlay();
      showGate();
    } catch (e) { console.error(e); toast(T("studio.js.composeFail", "รวมภาพไม่สำเร็จ: {e}", { e: e.message })); }
    finally {
      running = false; busy(false);
      if (pending) schedule(pending);
    }
  }

  // แบบคอสูง: ?cover=1 บังคับเปิดทุกชุด, ?cover=0 ปิด (ablation ใน tests/bench) — ค่าเริ่มต้น = ST.coverMode ("auto": ใช้เมื่อข้างกรามเปิด jawFeatures.open ≥ COVER_OPEN ไม่ขึ้นกับผลตรวจแบบเดิม)
  const COVER_Q = (q => q == null ? null : q === "1")(new URLSearchParams(location.search).get("cover"));
  const COVER_OPEN = .5; // jawFeatures.open: สัดส่วนแถบข้างกรามที่ไม่มีผมบัง (ด้านที่เปิดกว่า)
  /** สีผ้าคอเต่า: ชุดขาว -> ขาวนวล, กากี -> กากีเข้ม, สูท/อื่น ๆ -> เทาถ่าน; ชุดจากรูปจริง -> สีผ้าหลักที่เข้มลง */
  function coverColor(g) {
    if (g.kind === "vector") return { civil: [236, 234, 228], khaki: [121, 106, 72], student: [236, 236, 232], student_f: [236, 236, 232], shirt_tie: [236, 236, 232] }[g.vk] || [44, 46, 52];
    const m = g.mainColor || (g.anchors && g.anchors.length >= 5 ? (g.mainColor = templateMain(g)) : [60, 60, 60]); return m.map(v => Math.round(v * .8));
  }
  /** แบบปลอดภัย (ไม่ใส่ชุด): ตัวคนทั้งหมด ยกเว้นเกาะเล็กที่หลุดจากตัว (เศษธง/ฉากที่ matte ติดมา < 0.15 หน้า²) */
  // round 11: + ก้อนแยก < 35% ของตัวหลัก และเส้นจางลอย ๆ (SC.cleanLeftovers) — ไม่ใช้ตัวเลือก pp (ลบส่วนที่โมเดลแยกส่วนบอกว่าเป็นฉาก):
  //  ในชุดวัดผลมันตัดสูท/เสื้อสีเข้มเป็นรูใน 9+ จาก 62 คน จึงปิดไว้ (เศษธง/เก้าอี้ที่ต่อกับตัวยังเหลือ: ขั้นตรวจก่อนพิมพ์ชี้ให้ผู้ใช้ดู)
  //  ตัวหลักเล็กกว่า 5% ของภาพ = ตัดพื้นหลังล้มเหลว (ภาพมืด/ขาวดำเก่า): แสดงรูปเดิมทั้งภาพแทนภาพที่ตัวคนหายไป แล้วบอกผู้ใช้ (ST.matteFail)
  //  ?clean=0 = แบบเดิม (เทียบใน tests/bench)
  const CLEAN = new URLSearchParams(location.search).get("clean") !== "0";
  function safeKeep(pA) {
    const ck = ST.editVer + "|" + ST.W + "x" + ST.H; if (ST.cache.safeKey === ck && ST.cache.safeK) return new Float32Array(ST.cache.safeK);
    let k = new Float32Array(pA);
    if (!CLEAN) SC.removeStrayIslands(k, new Float32Array(k.length), ST.W, ST.H, Math.round(ST.face.fw * ST.face.fw * .15));
    else {
      const info = SC.cleanLeftovers(k, ST.W, ST.H, ST.face);
      ST.matteFail = info.mainFrac < .05; ST.cleanInfo = info;
      if (ST.matteFail) k = new Float32Array(k.length).fill(1);
    }
    ST.cache.safeKey = ck; ST.cache.safeK = k; return new Float32Array(k);
  }
  // ---------- round 12: ประตูคุณภาพของแบบไม่ใส่ชุด (ผลหลักของหน้า: ฉากหลังใหม่ + รีทัชบางเบา) ----------
  // ตรวจภาพตัดพื้นหลังหลังเก็บกวาด (StudioQA.noOutfitCheck: ตัวคนหาย เศษแยก ฉากติดข้างศีรษะ ลำตัวถูกตัดตรง) ถ้าไม่ผ่าน
  // แสดงรูปเดิมที่ไม่ได้แก้ไข (ST.origFallback) แทนภาพที่มีรอย พร้อมกรอบสีแดงตรงจุดที่พบ — ผู้ใช้ดูแบบแก้ไขได้เมื่อกดเอง (ST.noqAnyway)
  // และต้องยืนยันก่อนส่งออก; ตัวตรวจโหลดไม่สำเร็จ = ไม่ผ่าน (fail closed) · ?noq=0 = ปิด (เทียบใน tests/bench)
  const NOQ = new URLSearchParams(location.search).get("noq") !== "0";
  function noOutfitGate() {
    ST.origFallback = false;
    const noOut = ST.shown === "none" || ST.shown === "safe" || ST.shown === "plain";
    if (!noOut || !NOQ || ST.matteFail || !ST.cache.safeK) return;
    const ck = ST.cache.safeKey;
    if (!ST.noq || ST.noq.key !== ck) {
      let q;
      try { q = window.StudioQA && window.StudioQA.noOutfitCheck ? window.StudioQA.noOutfitCheck({ keep: ST.cache.safeK, W: ST.W, H: ST.H, face: ST.face, hair: ST.layers && ST.layers.hair, src: ST.px }) : { pass: false, fails: ["unchecked"], marks: [], m: {} }; }
      catch (e) { console.warn("no-outfit qa", e); q = { pass: false, fails: ["qa-error"], marks: [], m: {} }; }
      ST.noq = { ...q, key: ck };
    }
    if (!ST.noq.pass && !ST.noqAnyway) { ST.out = new Uint8ClampedArray(ST.px); ST.origFallback = true; }
  }
  /** แบบไม่ใส่ชุดที่ไม่ผ่านการตรวจแต่ผู้ใช้เลือกดูเอง (ต้องยืนยันก่อนส่งออก) */
  const noOutfitFlagged = () => !!(ST.noq && !ST.noq.pass && ST.noqAnyway && (ST.shown === "none" || ST.shown === "safe" || ST.shown === "plain"));
  // ---------- ประตูคุณภาพ: บอกผู้ใช้ตรง ๆ ว่าแสดงอะไร และทำไม ----------
  // ablation (tests/bench): ?wear=0.42,0.7 = WEAR k,t ของ synthNeck
  { const w = new URLSearchParams(location.search).get("wear"); if (w) { const [k, t] = w.split(",").map(Number); if (isFinite(k)) SC.WEAR.k = k; if (isFinite(t)) SC.WEAR.t = t; } }
  const QA_GROUP = f => f === "unchecked" ? "unchecked" : /^(neck|jaw|face-island)/.test(f) ? "neck" : /^(hem|balloon|shoulder)/.test(f) ? "shape" : /hand/.test(f) ? "hands" : f === "hair-cut" ? "hair" : "bits";
  /** ตัวเลขบนหน้าจอมาจาก StudioQA.FIGURES (สร้างจากป้ายกำกับ + บันทึกผลตรวจที่ commit ไว้: tests/bench/studio-figures.mjs) — ทุกข้อความใช้ชุดเดียวกัน
   *  บอกทั้งชุดทดสอบ (คนที่ระบบไม่เคยเห็น) และชุดพัฒนา ไม่เลือกเฉพาะตัวเลขที่ดูดีกว่า */
  const FIG = () => (window.StudioQA && window.StudioQA.FIGURES) || null;
  const figVars = () => { const F = FIG(); if (!F) return null; const a = F.shownBad.test.p, b = F.shownBad.dev.p; return { test: a, dev: b, lo: Math.min(a, b), hi: Math.max(a, b), nt: F.shownBad.test.n, nd: F.shownBad.dev.n }; };
  /** ข้อความผลตรวจแบบไม่ใส่ชุด (StudioQA.noOutfitCheck) */
  const NOQ_TXT = k => T("studio.js.noq.f." + k, { empty: "ตัวคนหายจากภาพตัด", island: "เศษที่ไม่ต่อกับตัวคน", attached: "ฉากหลังติดข้างศีรษะ (ธง เก้าอี้ วงกบ)", "cut-bottom": "ลำตัวถูกตัดตรงเหนือขอบล่าง", "cut-left": "ขอบตัวคนถูกตัดเป็นเส้นตรง", "cut-right": "ขอบตัวคนถูกตัดเป็นเส้นตรง", unchecked: "ตัวตรวจโหลดไม่สำเร็จ", "qa-error": "ตรวจไม่ได้" }[k] || k);
  const noqList = () => [...new Set((ST.noq ? ST.noq.fails : []).map(NOQ_TXT))].join(", ");
  function showGate() {
    const el = $("#stQa"), msg = $("#stQaMsg"), btn = $("#stQaDraft"); if (!el) return;
    if (ST.shown === "none" && ST.matteFail) { el.hidden = false; el.dataset.shown = "none"; el.dataset.fails = "matte-fail"; msg.textContent = T("studio.js.qa.matteFail", "ตัดพื้นหลังไม่สำเร็จบนรูปนี้ จึงแสดงรูปเดิมทั้งภาพแทน ลองรูปที่หน้าชัด แสงพอ และฉากเรียบ"); btn.hidden = true; return; }
    btn.hidden = false;
    // round 12: แบบไม่ใส่ชุดที่ไม่ผ่านการตรวจ: แสดงรูปเดิม (หรือแบบแก้ไขเมื่อผู้ใช้เลือกเอง) พร้อมเหตุผลและปุ่มสลับ
    if (ST.shown === "none" && ST.noq && !ST.noq.pass) {
      el.hidden = false; el.dataset.shown = ST.origFallback ? "orig" : "noq-draft"; el.dataset.fails = ST.noq.fails.join(" ");
      msg.textContent = ST.origFallback
        ? T("studio.js.noq.orig", "การตรวจอัตโนมัติพบปัญหาในภาพที่เปลี่ยนฉากหลัง ({f}) จึงแสดงรูปเดิมที่ยังไม่ได้แก้ไขแทน จุดที่พบอยู่ในกรอบสีแดง แก้ด้วยแปรงลบพื้นหลัง/แปรงคืนตัวคน หรือใช้รูปที่ถ่ายหน้าผนังเรียบ", { f: noqList() })
        : T("studio.js.noq.draft", "กำลังแสดงภาพที่เปลี่ยนฉากหลังแล้วแม้ไม่ผ่านการตรวจอัตโนมัติ ({f}) ตรวจจุดในกรอบสีแดงก่อนใช้ ต้องยืนยันก่อนส่งออก", { f: noqList() });
      btn.textContent = ST.origFallback ? T("studio.js.noq.showEdited", "ดูภาพที่แก้ไขแล้ว (อาจมีเศษฉากหลัง)") : T("studio.js.noq.showOrig", "กลับไปรูปเดิม");
      btn.setAttribute("aria-label", btn.textContent); return;
    }
    if (!["safe", "draft", "garment", "plain", "unchecked"].includes(ST.shown)) { el.hidden = true; delete el.dataset.fails; return; }
    const groups = [...new Set((ST.qa ? ST.qa.fails : []).map(QA_GROUP))].map(k => T("studio.js.qa.g." + k, { neck: "รอยต่อคอ/กราม", shape: "ทรงชุดที่ไหล่/ชายเสื้อ", hands: "มือและแขนเสื้อ", hair: "ผมที่ถูกตัด", bits: "เศษภาพรอบตัว", unchecked: "ตัวตรวจคุณภาพโหลดไม่สำเร็จ ชุดจึงยังไม่ได้ตรวจ" }[k])).join(", ");
    const g0 = groups || T("studio.js.qa.g.conf", "ความมั่นใจต่ำ");
    el.hidden = false; el.dataset.fails = ST.qa ? ST.qa.fails.join(" ") : ""; el.dataset.shown = ST.shown;
    // ผ่านการตรวจอัตโนมัติแล้วก็ยังพลาดได้บ่อย (ACCURACY.md §11): บอกตรง ๆ ทุกครั้งที่แสดงชุด
    msg.textContent = ST.shown === "safe"
      ? T("studio.js.qa.safe", "ชุดนี้ยังสวมบนรูปนี้ได้ไม่เนียน ({g}) จึงแสดงเฉพาะฉากหลังใหม่และรีทัชกับเสื้อเดิมของคุณ — ลองรูปหน้าตรงที่เห็นคอชัด ผมไม่บังไหล่", { g: g0 })
      : ST.shown === "draft" ? T("studio.js.qa.draft", "กำลังแสดงชุดแบบร่างที่ไม่ผ่านการตรวจอัตโนมัติ ({g}) อาจเห็นรอยต่อ ตรวจภาพก่อนใช้งาน", { g: g0 })
      : ST.shown === "unchecked" ? T("studio.js.qa.unchecked", "กำลังแสดงชุดที่ยังไม่ได้ตรวจอัตโนมัติ (ตัวตรวจคุณภาพโหลดไม่สำเร็จ) อาจเห็นรอยต่อที่คอหรือกราม ภาพมีป้าย \"ภาพจำลองชุด\" และต้องยืนยันก่อนส่งออก")
      : ST.shown === "garment" ? (figVars() ? T("studio.js.qa.previewFig", "ชุดตัวอย่างเป็นภาพจำลอง (พรีวิว) ไม่ใช่ภาพสวมจริง: ในการทดสอบของเรา (ให้คะแนนโดย AI ไม่ใช่คน) ภาพชุดที่ผ่านการตรวจอัตโนมัติแล้วยังเห็นรอยที่กราม ใต้หู หรือปลายผม {lo}–{hi}% — {test}% ในชุดทดสอบ (คนที่ระบบไม่เคยเห็น {nt} ภาพ) และ {dev}% ในชุดพัฒนา ({nd} ภาพ) ตรวจบริเวณคอก่อนใช้ และใช้แบบไม่ใส่ชุดสำหรับรูปทางการ", figVars())
        : T("studio.js.qa.preview", "ชุดเป็นชุดตัวอย่าง (พรีวิว) ไม่ใช่ภาพสวมจริง: ในชุดทดสอบของเรา ภาพชุดที่ผ่านการตรวจอัตโนมัติแล้วราว 1 ใน 3 ยังเห็นรอยที่กราม ใต้หู หรือปลายผม ตรวจบริเวณคอก่อนใช้ และใช้แบบไม่ใส่ชุดสำหรับรูปทางการ"))
      : T("studio.js.qa.plain", "กำลังแสดงรูปของคุณแบบไม่ใส่ชุด (ฉากหลังใหม่ + รีทัช)");
    const extra = [];
    if (ST.variant === "cover" && (ST.shown === "garment" || ST.shown === "draft" || ST.shown === "unchecked")) extra.push(T("studio.js.qa.cover", "ใช้แบบคอสูง (คอเต่า) ให้อัตโนมัติ เพื่อปิดรอยต่อข้างกรามและใต้หู"));
    // ความมั่นใจที่ปรับเทียบ (studio-qa.js confidence): มีค่าเฉพาะภาพที่ผ่านประตูกฎ จึงแสดงตอนกำลังแสดงชุด และต่ำกว่าเกณฑ์เท่านั้น
    // ตัวเลขชุดเดียวกับข้อความด้านบน (StudioQA.FIGURES): บอกเป็นอัตราภาพที่มีรอย ทั้งชุดพัฒนาและชุดทดสอบ จึงไม่ขัดกัน
    if (ST.shown === "garment" && ST.qa && ST.qa.conf && !ST.qa.conf.show) {
      const F = FIG(), c = F && F[ST.variant === "cover" ? "calibCover" : "calibPlain"];
      extra.push(c ? T("studio.js.qa.lowConf3", "ภาพชุดแบบนี้ ({v}) ที่ผ่านการตรวจแล้วยังมีรอย {bd}% ในชุดพัฒนา ({nd} ภาพ) และ {bt}% ในชุดทดสอบ ({nt} ภาพ) ระบบจึงไม่เลือกชุดให้เอง (ต้องไม่มีรอยอย่างน้อย {t}% ในชุดพัฒนา)", { v: ST.variant === "cover" ? T("studio.js.qa.vCover", "แบบคอสูง") : T("studio.js.qa.vPlain", "แบบเดิม"), bd: 100 - c.dev.p, nd: c.dev.n, bt: 100 - c.test.p, nt: c.test.n, t: Math.round(100 * ST.qa.conf.t) })
        : T("studio.js.qa.lowConf2", "ในรูปชุดพัฒนาของเรา ภาพชุดแบบนี้ที่ผ่านการตรวจแล้วไม่มีรอยเพียง {p}% (ต่ำกว่าเกณฑ์ {t}% ที่ระบบจะเลือกชุดให้เอง)", { p: Math.round(100 * ST.qa.conf.p), t: Math.round(100 * ST.qa.conf.t) }));
    }
    if (ST.origFallback && (ST.shown === "safe" || ST.shown === "plain")) extra.push(T("studio.js.noq.origOutfit", "ภาพแบบไม่ใส่ชุดก็ไม่ผ่านการตรวจอัตโนมัติ ({f}) จึงแสดงรูปเดิมที่ยังไม่ได้แก้ไข", { f: noqList() }));
    if (ST.matteFail && (ST.shown === "safe" || ST.shown === "plain")) extra.push(T("studio.js.qa.matteFail", "ตัดพื้นหลังไม่สำเร็จบนรูปนี้ จึงแสดงรูปเดิมทั้งภาพแทน ลองรูปที่หน้าชัด แสงพอ และฉากเรียบ"));
    if (ST.pre && !ST.pre.ok && ST.shown !== "plain") extra.push(T("studio.js.qa.preBad", "รูปนี้ไม่ตรงตามคำแนะนำสำหรับชุดตัวอย่าง (ดูรายการในส่วนชุดตัวอย่าง)"));
    if (ST.shown === "safe" || ST.shown === "draft" || ST.shown === "unchecked") extra.push(T("studio.js.qa.photoTip", "รูปใหม่ช่วยได้มากกว่าการเปลี่ยนชุด: ชุดอื่นบนรูปเดียวกันมักติดปัญหาเดียวกัน"));
    if (extra.length) msg.textContent += " " + extra.join(" ");
    el.dataset.variant = ST.variant || "";
    btn.textContent = ST.shown === "safe" ? T("studio.js.qa.showDraft", "ดูชุดแบบร่าง (อาจมีรอยต่อ)") : ST.shown === "draft" || ST.shown === "unchecked" ? T("studio.js.qa.showSafe", "กลับไปแบบปลอดภัย")
      : ST.shown === "garment" ? T("studio.js.qa.showPlain", "ดูแบบไม่ใส่ชุด") : T("studio.js.qa.showPreview", "ดูชุดแบบตัวอย่าง");
    btn.setAttribute("aria-label", btn.textContent);
  }
  $("#stQaDraft").onclick = () => {
    if (ST.shown === "none" && ST.noq && !ST.noq.pass) { ST.noqAnyway = !ST.noqAnyway; schedule("noq"); return; }
    const k = ST.gKey; if (ST.draftOK.has(k)) ST.draftOK.delete(k); else ST.draftOK.add(k); schedule("draft");
  };

  /** ผลตรวจความเหมาะสมของรูป (ก่อนลองชุด) ในส่วน "ชุดตัวอย่าง (ทดลอง)" — ไม่ซ่อนชุด: ผู้ใช้ยังลองได้ แต่รู้ล่วงหน้าว่ามักมีรอย */
  function renderPre() {
    const el = $("#stPre"); if (!el) return;
    const r = ST.pre; if (!r) { el.hidden = true; return; }
    const txt = {
      frontal: [T("studio.js.pre.frontal", "หน้าตรง"), T("studio.js.pre.frontalBad", "หน้าหันหรือเอียง ชุดมักไม่เข้ารูป"), T("studio.js.pre.frontalNA", "ตรวจทิศทางใบหน้าไม่ได้ (ไม่พบจุดบนใบหน้า)")],
      neck: [T("studio.js.pre.neck", "เห็นคอชัด"), T("studio.js.pre.neckBad", "เห็นคอน้อย (ปกเสื้อ ผม หรือเงาบังคอ)")],
      hair: [T("studio.js.pre.hair", "ผมไม่คลุมไหล่และข้างกราม"), T("studio.js.pre.hairBad", "ผมคลุมไหล่หรือข้างกราม")],
      clothes: [T("studio.js.pre.clothes", "เสื้อเรียบ ไม่มีลาย"), T("studio.js.pre.clothesBad", "เสื้อมีลาย ปก หรือเครื่องประดับมาก มักโผล่รอบชุด")],
      framing: [T("studio.js.pre.framing", "เห็นไหล่ในภาพ"), T("studio.js.pre.framingBad", "ภาพตัดชิดใต้คาง ไม่เห็นไหล่")]
    };
    el.hidden = false; el.dataset.ok = r.ok ? "1" : "0";
    el.innerHTML = `<b>${esc(r.ok ? T("studio.js.pre.ok", "ตรวจรูปก่อนลองชุด: รูปนี้ตรงตามคำแนะนำ (ภาพชุดยังมีรอยได้ราวครึ่งหนึ่ง)") : T("studio.js.pre.bad", "ตรวจรูปก่อนลองชุด: รูปนี้ไม่ตรงตามคำแนะนำในข้อที่มีเครื่องหมาย ! ยังลองชุดได้ (เป็นคำแนะนำ ไม่ใช่การรับประกัน: ภาพชุดมีรอยได้ราวครึ่งหนึ่งไม่ว่ารูปจะผ่านหรือไม่)"))}</b>` +
      `<ul>${r.items.map(i => `<li class="${i.ok === false ? "warn" : "ok"}" data-k="${i.k}">${esc((txt[i.k] || [i.k, i.k])[i.ok === false ? 1 : i.ok == null && txt[i.k][2] ? 2 : 0])}</li>`).join("")}</ul>`;
  }

  // ---------- มุมมอง / เทียบ / เครื่องมือ ----------
  let mode = "view";
  function showView() { $("#stSrc").hidden = true; $("#stView").hidden = false; }
  function busy(on, t) { const b = $("#stBusy"); b.hidden = !on; if (t) b.textContent = t; }
  /** ข้อความความคืบหน้า: ขั้นที่ i/5 และเวลาที่เหลือโดยประมาณ (จากรอบก่อนบนเครื่องนี้ ต่อเมกะพิกเซล; ค่าเริ่มต้น ~9 วินาที/MP บน M1 แบบ CPU) */
  function prog(i, label) {
    prog.step = i; let per = 9000; try { per = +localStorage.getItem("lq.studio.ms") || per; } catch { /* ไม่มี storage */ }
    const est = per * Math.max(.2, ST.W * ST.H / 1e6), left = Math.max(1, Math.round((est - (now() - (prog.t0 || now()))) / 1000));
    return T("studio.js.busy.step", "ขั้น {i}/5 · {l} · เหลือราว {s} วินาที", { i, l: label, s: left });
  }
  function syncSplit() { const v = val("stSplit"); $("#stCompare").style.setProperty("--split", v + "%"); $("#stSplitLine").hidden = v <= 0 || v >= 100; }
  $("#stSplit").oninput = syncSplit;
  $("#stMode").querySelectorAll("button").forEach(b => b.onclick = () => {
    mode = b.dataset.m; $("#stMode").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    $("#stBrushRow").hidden = !(mode === "restore" || mode === "erase");
    $("#stCompare").dataset.mode = mode;
    // the hem points are named only when their handles are inside the picture (a tight crop hides them)
    const hemShown = mode === "fit" && fitHandleKeys().some(k => k === "hl" || k === "hr");
    $("#stHint").textContent = mode === "fit" && hemShown ? T("studio.js.hint.fitPts", "ลากจุดเพื่อให้ชุดเข้ารูป: ม่วง = โคนคอ, ชมพู = ปกคอ, ฟ้า = ปลายไหล่, ส้ม = ชายเสื้อ (ชุดดัดตามทุกจุด)")
      : mode === "fit" ? T("studio.js.hint.fitPtsNoHem", "ลากจุดเพื่อให้ชุดเข้ารูป: ม่วง = โคนคอ, ชมพู = ปกคอ, ฟ้า = ปลายไหล่ (ชุดดัดตามทุกจุด)")
      : mode === "view" ? T("studio.js.hint.view", "เลื่อนแถบ ก่อน | หลัง เพื่อเทียบภาพ")
      : mode === "restore" ? T("studio.js.hint.restore", "ระบายบนภาพ: คืนส่วนของตัวคนที่ถูกตัดหาย") : T("studio.js.hint.erase", "ระบายบนภาพ: ลบพื้นหลังที่ติดมา");
    drawOverlay();
  });
  function drawOverlay(cursor) {
    const c = $("#stOverlay"), x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
    const r = Math.max(8, ST.W / 70);
    if (mode === "fit" && ST.targets) {
      const T = ST.targets; x.lineWidth = Math.max(2, r * .25); x.strokeStyle = "rgba(255,255,255,.85)"; x.setLineDash([r, r * .6]);
      x.beginPath(); ["hl", "l", "cl", "chin", "cr", "r", "hr"].forEach((k, i) => x[i ? "lineTo" : "moveTo"](T[k].x, T[k].y)); x.stroke(); x.setLineDash([]);
      const col = { chin: "#674ff2", cl: "#db2777", cr: "#db2777", l: "#0891b2", r: "#0891b2", hl: "#ea580c", hr: "#ea580c" };
      fitHandleKeys().forEach(k => { x.fillStyle = col[k]; x.strokeStyle = "#fff"; x.beginPath(); x.arc(T[k].x, T[k].y, k === "cl" || k === "cr" ? r * .75 : r, 0, 7); x.fill(); x.stroke(); });
    }
    // round 12: กรอบสีแดงตรงจุดที่การตรวจแบบไม่ใส่ชุดพบ (เหมือนขั้นตรวจก่อนพิมพ์ของตู้ถ่ายรูป)
    if (ST.noq && !ST.noq.pass && ST.noq.marks && (ST.shown === "none" || ST.shown === "safe" || ST.shown === "plain")) {
      x.save(); x.strokeStyle = "#e11d48"; x.lineWidth = Math.max(3, ST.W / 240); x.setLineDash([x.lineWidth * 3, x.lineWidth * 2]);
      for (const m of ST.noq.marks) if (m.k !== "empty") x.strokeRect(m.x - 4, m.y - 4, m.w + 8, m.h + 8);
      x.restore();
    }
    if (cursor && (mode === "restore" || mode === "erase")) { x.strokeStyle = mode === "restore" ? "#22c55e" : "#ef4444"; x.lineWidth = Math.max(2, ST.W / 400); x.beginPath(); x.arc(cursor.x, cursor.y, brushR(), 0, 7); x.stroke(); }
  }
  /** จุดที่ลากได้: ทั้ง 7 จุด ["chin", "cl", "cr", "l", "r", "hl", "hr"] ที่อยู่ในภาพ (ชายเสื้อที่ตกนอกภาพครอปไม่แสดง) */
  const inView = p => !!p && p.x >= 0 && p.y >= 0 && p.x < ST.W && p.y < ST.H;
  const fitHandleKeys = () => ["chin", "cl", "cr", "l", "r", "hl", "hr"].filter(k => ST.targets && inView(ST.targets[k]));
  const brushR = () => val("stBrush") / 400 * Math.max(ST.W, ST.H);
  let drag = null;
  const ov = $("#stOverlay");
  ov.addEventListener("pointerdown", e => {
    if (mode === "view" || !ST.alpha) return;
    const p = cvPt(ov, e);
    if (mode === "fit" && ST.targets) {
      // touch radius: at least 24 CSS px on screen, whatever the canvas is scaled to (a phone shows a 900-px photo at ~360 px)
      const box = ov.getBoundingClientRect(), k = box.width > 0 ? ST.W / box.width : 1;
      let best = null, bd = Math.max(24 * k, ST.W / 25);
      for (const k of fitHandleKeys()) { const d = Math.hypot(ST.targets[k].x - p.x, ST.targets[k].y - p.y); if (d < bd) { bd = d; best = k; } }
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
      ST.manual = {}; for (const k of FIT_KEYS) ST.manual[k] = { x: ST.targets[k].x, y: ST.targets[k].y };
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
  $("#stCover").onchange = e => { ST.coverMode = e.target.value; schedule("cover"); };
  $("#stIdOutfit").onchange = () => { $("#stIdSpec").innerHTML = ""; };

  // ---------- ส่งออก ----------
  // ไฟล์ที่มีชุดจำลอง: ป้ายมุมภาพ "ภาพจำลองชุด / outfit preview" (ปิดได้เฉพาะไฟล์ทั่วไป ไม่ใช่รูปติดบัตร) + ต่อท้ายชื่อไฟล์ + ข้อความใน PNG (tEXt/iTXt) / JPEG (COM)
  // ยืนยันก่อนส่งออกแบบร่างที่ไม่ผ่านการตรวจ และก่อนทำรูปติดบัตรที่มีชุด — รูปติดบัตรใช้แบบไม่ใส่ชุดเป็นค่าเริ่มต้น
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
  const MARK_TXT = "ภาพจำลองชุด / outfit preview";
  const META_EN = "LENSIQ Studio outfit preview: the garment is synthetic (drawn by software), not a photo of this person wearing it.";
  const synthetic = () => ST.shown === "garment" || ST.shown === "draft" || ST.shown === "unchecked";
  /** ป้ายมุมขวาล่าง (พื้นเข้มโปร่ง ตัวอักษรขาว) — ขนาดตามภาพ */
  function drawMark(c) { return L.previewMark(c.getContext("2d"), c.width, c.height, MARK_TXT); }
  /** กล่องยืนยัน (dialog#stConfirm) — คืน Promise<boolean> */
  function confirmBox(text, okLabel) {
    const d = $("#stConfirm"); $("#stConfirmMsg").textContent = text; $("#stConfirmOk").textContent = okLabel || T("studio.js.cf.ok", "ส่งออกต่อ");
    return new Promise(res => {
      const done = v => { $("#stConfirmOk").onclick = $("#stConfirmNo").onclick = d.oncancel = null; if (d.open) d.close(); res(v); };
      $("#stConfirmOk").onclick = () => done(true); $("#stConfirmNo").onclick = () => done(false); d.oncancel = () => done(false);
      d.showModal();
    });
  }
  async function save(c, type, name, { synth = false, mark = synth, kind = "image" } = {}) {
    if (synth && mark) { const m = mk(c.width, c.height); m.getContext("2d").drawImage(c, 0, 0); drawMark(m); c = m; }
    const b = await new Promise(r => c.toBlob(r, type, .92));
    if (!b) { toast(T("studio.js.fileFail", "สร้างไฟล์ไม่สำเร็จ")); return null; }
    let out = b;
    if (synth) {
      const u = new Uint8Array(await b.arrayBuffer());
      out = new Blob([type === "image/png" ? SC.pngWithText(u, [["Description", META_EN], ["Comment", "LENSIQ: ภาพจำลองชุด (outfit preview) ชุดเป็นภาพที่โปรแกรมวาดขึ้น ไม่ใช่ภาพถ่ายขณะสวมจริง"], ["Software", "LENSIQ Studio"]]) : SC.jpegWithComment(u, META_EN)], { type });
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(out); a.download = `${name}${synth ? "-outfit-preview" : ""}-${stamp()}.${type === "image/jpeg" ? "jpg" : "png"}`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    window.__studio.lastExport = { type, size: out.size, w: c.width, h: c.height, name: a.download, synthetic: synth, mark: synth && mark, kind, blob: out };
    return out;
  }
  /** แบบร่างที่ไม่ผ่านการตรวจ: ยืนยันก่อนส่งออก */
  // round 12: + ชุดที่ยังไม่ได้ตรวจ (ตัวตรวจโหลดไม่สำเร็จ) และแบบไม่ใส่ชุดที่ไม่ผ่านการตรวจแต่ผู้ใช้เลือกดูเอง ต้องยืนยันเหมือนแบบร่าง
  const draftOK = async () => ST.shown === "draft" ? confirmBox(T("studio.js.cf.draft", "ภาพนี้เป็นชุดแบบร่างที่ไม่ผ่านการตรวจอัตโนมัติ อาจเห็นรอยต่อที่คอหรือกราม ไฟล์จะมีป้าย \"ภาพจำลองชุด\" ส่งออกต่อหรือไม่"))
    : ST.shown === "unchecked" ? confirmBox(T("studio.js.cf.unchecked", "ภาพนี้มีชุดจำลองที่ยังไม่ได้ตรวจอัตโนมัติ (ตัวตรวจคุณภาพโหลดไม่สำเร็จ) อาจเห็นรอยต่อที่คอหรือกราม ไฟล์จะมีป้าย \"ภาพจำลองชุด\" ส่งออกต่อหรือไม่"))
    : noOutfitFlagged() ? confirmBox(T("studio.js.cf.noq", "ภาพนี้ไม่ผ่านการตรวจอัตโนมัติ ({f}) อาจมีเศษฉากหลังหรือรอยตัด ส่งออกต่อหรือไม่", { f: noqList() }))
    : true;
  async function saveMain(type) {
    if (!(await draftOK())) return null;
    if (!(await reviewGate("main", $("#stOut"), mainFindings()))) return null;
    return save($("#stOut"), type, "lensiq-studio", { synth: synthetic(), mark: chk("stMark") });
  }
  // ---------- round 12: ตรวจภาพก่อนส่งออก (บังคับ ครั้งเดียวต่อภาพ: ภาพหลัก, ไฟล์ความละเอียดสูง และรูปติดบัตร — เหมือนตู้ถ่ายรูป) ----------
  // แสดงภาพพร้อมกรอบสีแดง (StudioQA.noOutfitCheck บนภาพหลัก / StudioQA.idLeftovers บนรูปติดบัตร) + ข้อกำหนดรูปติดบัตร ผู้ใช้ต้องติ๊ก "ตรวจแล้ว"
  const reviewKey = kind => [kind, ST.editVer, ST.gKey, ST.shown, ST.noqAnyway, ST.origFallback, bgKey, idSize, ST.cache.rtKey, ST.draftOK.has(ST.gKey), chk("stIdOutfit")].join("#");
  const RV_TXT = k => T("studio.js.rv." + k, { none: "ไม่พบเศษฉากหลังหรือรอยตัดตรงโดยอัตโนมัติ (ยังควรตรวจด้วยตาเอง)", orig: "แสดงรูปเดิมที่ยังไม่ได้แก้ไข เพราะภาพที่เปลี่ยนฉากหลังไม่ผ่านการตรวจ", outfit: "มีชุดจำลอง (ภาพที่โปรแกรมวาด ไม่ใช่ภาพสวมจริง)" }[k] || k);
  /** จุดที่ควรตรวจบนภาพหลัก: ผลตรวจแบบไม่ใส่ชุด + ชุดจำลอง */
  function mainFindings() {
    const f = [], noOut = ST.shown === "none" || ST.shown === "safe" || ST.shown === "plain";
    if (noOut && ST.noq && !ST.noq.pass) { if (ST.origFallback) f.push({ k: "orig", text: RV_TXT("orig") }); else ST.noq.fails.forEach(k => f.push({ k, text: NOQ_TXT(k) })); }
    if (synthetic()) f.push({ k: "outfit", text: RV_TXT("outfit") });
    return { items: f, marks: noOut && ST.noq && !ST.noq.pass && !ST.origFallback ? ST.noq.marks : [] };
  }
  function reviewGate(kind, canvas, { items = [], marks = [], spec = null } = {}) {
    const key = reviewKey(kind);
    if (ST.reviewed && ST.reviewed.has(key)) return Promise.resolve(true);
    const d = $("#stReview"); if (!d || !d.showModal) return Promise.resolve(true);
    const c = mk(canvas.width, canvas.height), x = c.getContext("2d"); x.drawImage(canvas, 0, 0);
    x.strokeStyle = "#e11d48"; x.lineWidth = Math.max(3, c.width / 120); x.setLineDash([x.lineWidth * 3, x.lineWidth * 2]);
    for (const m of marks) if (m.k !== "empty") x.strokeRect(m.x - 4, m.y - 4, m.w + 8, m.h + 8);
    // ภาพตัวอย่างเล็กพอสำหรับกล่องโต้ตอบ (ไม่ใช่ไฟล์ที่ส่งออก)
    const k = Math.min(1, 900 / Math.max(c.width, c.height)), v = mk(Math.round(c.width * k), Math.round(c.height * k)); v.getContext("2d").drawImage(c, 0, 0, v.width, v.height);
    $("#stReviewImg").src = v.toDataURL("image/jpeg", .85);
    $("#stReviewList").innerHTML = (items.length ? items.map(i => `<li class="warn" data-k="${esc(i.k)}">${esc(i.text)}</li>`).join("") : `<li class="ok" data-k="none">${esc(RV_TXT("none"))}</li>`) + (spec || "");
    const ok = $("#stReviewOk"), go = $("#stReviewGo"); ok.checked = false; go.disabled = true; ok.onchange = () => { go.disabled = !ok.checked; };
    return new Promise(res => {
      const done = v2 => { go.onclick = $("#stReviewNo").onclick = d.oncancel = null; if (d.open) d.close(); if (v2) ST.reviewed.add(key); res(v2); };
      go.onclick = () => done(ok.checked); $("#stReviewNo").onclick = () => done(false); d.oncancel = () => done(false);
      d.showModal();
    });
  }
  $("#stPng").onclick = () => saveMain("image/png");
  $("#stJpg").onclick = () => saveMain("image/jpeg");
  $("#stHiRes").onclick = async () => {
    const b = $("#stHiRes"); b.disabled = true; busy(true, T("studio.js.busy.hires", "กำลังทำไฟล์ความละเอียดสูง..."));
    try { if (!(await draftOK()) || !(await reviewGate("hires", $("#stOut"), mainFindings()))) return; const c = await hiResSafe(); if (c) await save(c, "image/png", "lensiq-studio-hires", { kind: "hires" }); } catch (e) { console.warn(e); toast(T("studio.js.fileFail", "สร้างไฟล์ไม่สำเร็จ")); }
    finally { busy(false); b.disabled = !ST.hi; }
  };
  let idSize = "1";
  function renderIdSizes() {
    const box = $("#stIdSize");
    box.innerHTML = Object.entries(L.ID_SIZES).map(([k, s]) => `<button type="button" data-k="${k}" class="${k === idSize ? "on" : ""}">${esc(T("studio.js.size." + k, s.label))}</button>`).join("");
    box.querySelectorAll("button").forEach(b => b.onclick = () => { idSize = b.dataset.k; renderIdSizes(); $("#stIdSpec").innerHTML = ""; });
  }
  /** ภาพสำหรับรูปติดบัตร: ค่าเริ่มต้น = แบบไม่ใส่ชุด (เสื้อเดิม + ฉากหลังใหม่ + รีทัช); ใส่ชุดเฉพาะเมื่อผู้ใช้เลือกเองและกำลังแสดงชุด */
  async function idSource() {
    const withOutfit = chk("stIdOutfit") && synthetic();
    if (withOutfit || !synthetic()) return { canvas: $("#stOut"), synth: withOutfit, alpha: ST.fgAlpha };
    const sc = await safeComposite(), c = mk(ST.W, ST.H); c.getContext("2d").putImageData(new ImageData(sc.rgba, ST.W, ST.H), 0, 0);
    return { canvas: c, synth: false, alpha: sc.fgAlpha };
  }
  /** ประกอบแบบไม่ใส่ชุดจากสถานะปัจจุบัน (ใช้ค่ารีทัช/ฉากหลังที่เลือก) */
  async function safeComposite() {
    const person = retouch(), pA = SC.applyMatteEdits(ST.alpha, ST.editVer ? ST.edit : null), bg = await bgPixels(person);
    return SC.composeLayers({ w: ST.W, h: ST.H, bg, person, keepA: safeKeep(pA), wrap: bgKey === "orig" ? 0 : val("oWrap") / 100 * .4, wrapR: Math.max(4, Math.round(Math.max(ST.W, ST.H) / 120)) });
  }
  function idPhoto(src = $("#stOut")) {
    const s = L.ID_SIZES[idSize], W = L.cmToPx(s.w), H = L.cmToPx(s.h), c = mk(W, H), x = c.getContext("2d"), f = ST.face;
    x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
    const cr = L.idCrop({ cx: f.cx, eyeY: f.eyeY, chinY: f.chinY }, { w: W, h: H });
    x.save(); x.translate(W / 2, (f.eyeY - cr.sy) * cr.scale); x.rotate(-(f.angle || 0)); x.translate(-W / 2, -(f.eyeY - cr.sy) * cr.scale);
    // ภาพต้นฉบับสั้นกว่ากรอบเล็กน้อย: ต่อขอบล่างเล็กน้อย (ช่องใหญ่ปล่อยไว้ให้ขั้นตรวจชี้)
    x.imageSmoothingQuality = "high"; x.scale(cr.scale, cr.scale); x.translate(-cr.sx, -cr.sy); extendDraw(x, src, f); x.restore();
    return c;
  }
  /** วาดภาพ (พิกัดภาพทำงาน) แล้วต่อขอบล่างลงไปไม่เกิน 0.35 หน้า (ช่องเล็กใต้ลำตัว) — ไม่ยืดไกล/ด้านข้าง: ทำให้เกิดลายเส้นในชุดวัดผล */
  function extendDraw(x, img, f) {
    const w = img.width, h = img.height, k = Math.max(2, Math.round(h * .004));
    x.drawImage(img, 0, 0);
    x.drawImage(img, 0, h - k, w, k, 0, h - 1, w, f.fw * .35);
  }
  /** alpha ของตัวคนในพิกัดรูปติดบัตร (ใช้ตรวจสัดส่วนศีรษะ/ฉากหลัง) */
  function idAlpha(alpha) {
    const c = mk(ST.W, ST.H), id = new ImageData(ST.W, ST.H); for (let i = 0; i < alpha.length; i++) { const v = alpha[i] * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    c.getContext("2d").putImageData(id, 0, 0);
    const p = idPhoto(c), d = ctx2(p).getImageData(0, 0, p.width, p.height).data, a = new Float32Array(p.width * p.height); for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255; return a;
  }
  /** ยืนยันก่อนทำรูปติดบัตรที่มีชุด */
  async function idGo() {
    const src = await idSource();
    if (src.synth && !(await confirmBox(T("studio.js.cf.id", "รูปติดบัตรนี้มีชุดจำลอง หลายหน่วยงานไม่รับรูปที่แต่งชุดหรือเปลี่ยนฉากหลังด้วยดิจิทัล ไฟล์จะมีป้าย \"ภาพจำลองชุด\" ที่มุมเสมอ ทำต่อหรือไม่"), T("studio.js.cf.idOk", "ทำรูปติดบัตรแบบมีชุด")))) return null;
    return src;
  }
  /** ขั้นตรวจก่อนส่งออกรูปติดบัตร: กรอบสีแดงบนเศษที่ไม่ต่อกับตัวและรอยตัดตรง (StudioQA.idLeftovers) + ข้อกำหนด (idSpecCheck) */
  async function idReview(src) {
    const p = idPhoto(src.canvas), items = [], marks = [];
    if (src.synth) items.push({ k: "outfit", text: RV_TXT("outfit") });
    if (ST.origFallback && !src.synth) items.push({ k: "orig", text: RV_TXT("orig") });
    let spec = "";
    try {
      if (window.StudioQA && window.StudioQA.idLeftovers) {
        const a = idAlpha(src.alpha || ST.fgAlpha), f = ST.face, cr = L.idCrop({ cx: f.cx, eyeY: f.eyeY, chinY: f.chinY }, { w: p.width, h: p.height });
        const face = { cx: (f.cx - cr.sx) * cr.scale, eyeY: (f.eyeY - cr.sy) * cr.scale, chinY: (f.chinY - cr.sy) * cr.scale, fw: f.fw * cr.scale };
        const lo = window.StudioQA.idLeftovers({ pa: a, W: p.width, H: p.height, face });
        lo.islands.forEach(b => { marks.push({ k: "island", ...b }); }); if (lo.islands.length) items.push({ k: "island", text: NOQ_TXT("island") });
        lo.cuts.filter(c => c.k !== "empty").forEach(c => { marks.push({ k: "cut-" + c.k, x: Math.min(c.x0, c.x1), y: Math.min(c.y0, c.y1), w: Math.abs(c.x1 - c.x0) + 1, h: Math.abs(c.y1 - c.y0) + 1 }); items.push({ k: "cut-" + c.k, text: NOQ_TXT("cut-" + c.k) }); });
        const r = await idCheck(); if (r) spec = $("#stIdSpec").querySelector("ul") ? $("#stIdSpec").querySelector("ul").innerHTML.replace(/data-k="/g, 'data-k="spec-') : "";
      } else items.push({ k: "unchecked", text: NOQ_TXT("unchecked") });
    } catch (e) { console.warn("id review", e); }
    const uniq = []; items.forEach(i => { if (!uniq.some(u => u.text === i.text)) uniq.push(i); });
    return reviewGate("id", p, { items: uniq, marks, spec });
  }
  $("#stIdOne").onclick = async () => { const src = await idGo(); if (src && await idReview(src)) save(idPhoto(src.canvas), "image/png", "lensiq-id-" + idSize, { synth: src.synth, mark: true, kind: "id" }); };
  $("#stIdSheet").onclick = async () => {
    const src = await idGo(); if (!src || !(await idReview(src))) return;
    const p = idPhoto(src.canvas); if (src.synth) drawMark(p); // ป้ายอยู่บนทุกรูปในแผ่น
    const sh = L.tileSheet(L.PAPERS["4x6"], L.ID_SIZES[idSize]), c = mk(sh.W, sh.H), x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, sh.W, sh.H);
    sh.pos.forEach(q => { x.drawImage(p, q.x, q.y, q.w, q.h); x.strokeStyle = "#ccc"; x.lineWidth = 1; x.strokeRect(q.x - .5, q.y - .5, q.w + 1, q.h + 1); });
    save(c, "image/jpeg", "lensiq-id-sheet-" + idSize, { synth: src.synth, mark: false, kind: "sheet" });
  };
  // ตรวจรูปติดบัตรตามข้อกำหนดทั่วไป (studio-qa.js idSpecCheck) — ค่าประมาณ ไม่ใช่การรับรองของหน่วยงาน
  async function idCheck() {
    const src = await idSource(), p = idPhoto(src.canvas), d = ctx2(p).getImageData(0, 0, p.width, p.height).data, s = L.ID_SIZES[idSize];
    const a = idAlpha(src.alpha || ST.fgAlpha), f = ST.face, cr = L.idCrop({ cx: f.cx, eyeY: f.eyeY, chinY: f.chinY }, { w: p.width, h: p.height });
    const face = { cx: (f.cx - cr.sx) * cr.scale, eyeY: (f.eyeY - cr.sy) * cr.scale, chinY: (f.chinY - cr.sy) * cr.scale, fw: f.fw * cr.scale };
    const r = window.StudioQA.idSpecCheck({ px: d, alpha: a, W: p.width, H: p.height, face, size: s, dpi: L.DPI, outfit: src.synth });
    ST.idSpec = r; renderIdSpec(r); return r;
  }
  $("#stIdCheck").onclick = () => idCheck();
  function renderIdSpec(r) {
    const txt = {
      size: v => T("studio.js.id.size", "ขนาด {w}×{h} พิกเซล = {cw}×{ch} ซม. ที่ 300 DPI", v), sizeBad: v => T("studio.js.id.sizeBad", "ขนาดไม่ตรงข้อกำหนด ({w}×{h} พิกเซล)", v),
      head: v => T("studio.js.id.head", "ศีรษะ (กระหม่อมถึงคาง) {p}% ของความสูงรูป อยู่ในช่วงทั่วไป {lo}–{hi}%", v), headBad: v => T("studio.js.id.headBad", "ศีรษะ {p}% ของความสูงรูป นอกช่วงทั่วไป {lo}–{hi}% ปรับระยะถ่ายหรือถ่ายใหม่", v),
      top: v => T("studio.js.id.top", "เว้นที่เหนือศีรษะ {p}% ของความสูงรูป", v), topBad: v => T("studio.js.id.topBad", "ที่เหนือศีรษะ {p}% ไม่พอดี (ควร 3–20%) ศีรษะอาจถูกตัด", v),
      center: () => T("studio.js.id.center", "ใบหน้าอยู่กึ่งกลาง"), centerBad: () => T("studio.js.id.centerBad", "ใบหน้าไม่อยู่กึ่งกลาง"),
      bg: v => T("studio.js.id.bg", "ฉากหลังเรียบ สีเดียว (ส่วนเบี่ยงเบน {sd})", v), bgBad: v => T("studio.js.id.bgBad", "ฉากหลังไม่เรียบหรือมีลาย (ส่วนเบี่ยงเบน {sd}) เลือกฉากสีขาวหรือฟ้าเรียบ", v),
      exposure: v => T("studio.js.id.exp", "ความสว่างใบหน้าพอดี ({l})", v), exposureBad: v => T("studio.js.id.expBad", "ความสว่างใบหน้าไม่พอดี ({l}) หรือสว่าง/มืดจนเสียรายละเอียด {c}%", v),
      outfit: () => T("studio.js.id.outfitNone", "ไม่มีชุดจำลอง (เสื้อของคุณเอง)"), outfitBad: () => T("studio.js.id.outfit", "มีชุดจำลองในรูป หลายหน่วยงานไม่รับ")
    };
    $("#stIdSpec").innerHTML = `<ul class="st-spec">${r.items.map(i => `<li class="${i.ok ? "ok" : "warn"}" data-k="${i.k}">${esc((txt[i.k + (i.ok ? "" : "Bad")] || (() => i.k))(i.v || {}))}</li>`).join("")}</ul>` +
      (r.icao ? `<p class="hint">${esc(T("studio.js.id.icao", "หนังสือเดินทางตามแนว ICAO (3.5×4.5 ซม.) ใช้ศีรษะ 71–80% ของความสูงรูป ซึ่งต่างจากรูปติดบัตรทั่วไป"))}</p>` : "") +
      `<p class="note">${esc(T("studio.js.id.rules", "หลายหน่วยงานไม่รับรูปที่เปลี่ยนฉากหลัง แต่งชุด หรือแก้ไขด้วยดิจิทัล เช่น แนวทางรูปหนังสือเดินทางออสเตรเลีย (สถานเอกอัครราชทูตออสเตรเลียประจำประเทศไทย) ให้ใช้รูปที่ไม่ถูกแก้ไขด้วยดิจิทัล และเกาหลีใต้ไม่รับรูปที่สร้างหรือแต่งด้วย AI สำหรับบัตรประจำตัว ตรวจข้อกำหนดของหน่วยงานก่อนใช้ ถ้าห้ามตกแต่ง ให้ใช้รูปถ่ายจริงหน้าฉากจริง"))}</p>`;
  }

  // ---------- ไฟล์ความละเอียดสูง (สูงสุด 2400 พิกเซล เฉพาะแบบไม่ใส่ชุด) ----------
  // ภาพทำงานจำกัดที่ 1200 พิกเซล; ไฟล์ใหญ่ใช้ภาพต้นฉบับที่ ≤ 2400 พิกเซล + matte ขยายแล้วเกลาขอบใหม่ (guided filter) + ผลรีทัช/ปรับแสงจากภาพทำงาน (ขยาย)
  async function hiResSafe() {
    const hi = ST.hi; if (!hi) return null;
    // round 12: แบบไม่ใส่ชุดไม่ผ่านการตรวจ (แสดงรูปเดิมอยู่): ไฟล์ความละเอียดสูง = รูปเดิมที่ยังไม่ได้แก้ไข
    if (ST.origFallback) { const c = mk(hi.width, hi.height); c.getContext("2d").drawImage(hi, 0, 0); return c; }
    const W = ST.W, H = ST.H, HW = hi.width, HH = hi.height, kx = HW / W, ky = HH / H, person = retouch(), BG = await bgPixels(person);
    const hpx = ctx2(hi).getImageData(0, 0, HW, HH).data;
    const up = (get, ch) => { // bilinear
      const o = new Float32Array(HW * HH * ch);
      for (let y = 0; y < HH; y++) {
        const fy = Math.min(H - 1, Math.max(0, (y + .5) / ky - .5)), y0 = Math.floor(fy), y1 = Math.min(H - 1, y0 + 1), ty = fy - y0;
        for (let x = 0; x < HW; x++) {
          const fx = Math.min(W - 1, Math.max(0, (x + .5) / kx - .5)), x0 = Math.floor(fx), x1 = Math.min(W - 1, x0 + 1), tx = fx - x0;
          for (let c = 0; c < ch; c++) o[(y * HW + x) * ch + c] = (get(y0 * W + x0, c) * (1 - tx) + get(y0 * W + x1, c) * tx) * (1 - ty) + (get(y1 * W + x0, c) * (1 - tx) + get(y1 * W + x1, c) * tx) * ty;
        }
      }
      return o;
    };
    await sleep(0);
    const k0 = safeKeep(SC.applyMatteEdits(ST.alpha, ST.editVer ? ST.edit : null)), keep = up(i => k0[i], 1);
    const a = SC.refineMatte(hpx, keep, HW, HH, { r: Math.max(2, Math.max(HW, HH) / 512), k: 1.6 });
    await sleep(0);
    const D = up((i, c) => person[i * 4 + c] - ST.px[i * 4 + c], 3), B = up((i, c) => BG[i * 4 + c], 3), out = new ImageData(HW, HH);
    for (let i = 0; i < HW * HH; i++) { const al = a[i]; for (let c = 0; c < 3; c++) out.data[i * 4 + c] = B[i * 3 + c] + (hpx[i * 4 + c] + D[i * 3 + c] - B[i * 3 + c]) * al; out.data[i * 4 + 3] = 255; }
    const c = mk(HW, HH); c.getContext("2d").putImageData(out, 0, 0); return c;
  }

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
  window.__studio = { addTemplate, load: c => load(toWork(c)), state: ST, render: () => renderNow("test"), garments: () => ST.garments.map(g => g.key), select: k => { ST.gKey = k; renderGarments(); return renderNow("test"); }, idPhoto, idCheck, safeComposite, lastExport: null };
  // เปลี่ยนภาษา: วาดรายการชุด/ฉากหลังใหม่ (ข้อความสถานะจะเป็นภาษาใหม่ในรอบประมวลผลถัดไป)
  window.addEventListener("lq-lang", () => { if (ST.garments.length) renderGarments(); renderBgChoices(); renderPre(); });
  init();
})();
