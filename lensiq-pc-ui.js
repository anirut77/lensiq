/* lensiq-pc-ui.js — the "Product Check" tab of medicine.html (round 17, phase P2: on-device recognition only).
 * Flow: camera snapshot or photo -> text boxes (PP-OCRv5 det) -> automatic crop the user can redraw -> quality hints ->
 * OCR in the chosen script (editable text) + barcodes (native, then zxing-wasm) -> registration-number SHAPES per
 * country, GS1 fields (expiry shown as a printed fact), "how to verify" links, "could not check" list.
 * Never: a verdict (genuine / fake), a score, dosing words, an upload or stored image. History rows (numbers and barcodes
 * only, never the OCR text) are written only when the page's opt-in history is on (window.__LQ_MED.cfg.hist).
 * Extension point for the over-claim rules (P3): after every read or edit the tab fires
 * window "lq-pc-text" {detail: {text, script}} and leaves #pcClaimsSlot empty for that card.
 * Upload preview (owner decision 2026-11-10: blur faces, never block on a face): prepareUpload() blurs every detected face
 * region of the crop, shows the picture with "N face regions blurred" and waits for "Use this picture" / "Back"; text only
 * when the face detector cannot run. Not wired to the AI yet (P7 calls it); nothing is uploaded in this phase.
 * Test hooks (any host; they only expose what the page already shows): window.__LQ_PC = {st, setImage(canvas), read(),
 * scan(), faceCheck(), prepareUpload(), reparse()}.
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), P = W.LQPC, R = W.LQPCRun, M = W.LQMed;
  const $ = s => /** @type {any} */ (document.querySelector(s));
  if (!P || !R || !$("#tab-pc")) return;
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? String(v[x]) : m));
  const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const status = (text, kind) => { const el = $("#pcStatus"); el.textContent = text || ""; if (kind) el.dataset.kind = kind; else delete el.dataset.kind; };
  const link = (href, text) => `<a class="btn ghost small" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
  const badge = (text, k) => `<span class="md-badge"${k ? ` data-k="${k}"` : ""}>${esc(text)}</span>`;
  const raw = s => `<span translate="no">${esc(s)}</span>`;
  const card = (k, inner, id) => `<section class="card md-res"${id ? ` id="${id}"` : ""} data-k="${k}">${inner}</section>`;
  const mb = b => Math.round(b / 1048576);

  const st = { gen: 0, script: P.DEFAULT_SCRIPT, cam: null, still: false, crop: null, boxes: [], ocr: null, codes: null, quality: null, text: "", busy: false, read: false };
  W.__LQ_PC = { st };

  /* ---------- labels (TH default; EN / ZH in i18n/en-med.js, i18n/zh-med.js) ---------- */
  const COUNTRY = () => ({ TH: T("md.pc.c.TH", "ไทย"), MY: T("md.pc.c.MY", "มาเลเซีย"), SG: T("md.pc.c.SG", "สิงคโปร์"), CA: T("md.pc.c.CA", "แคนาดา"),
    US: T("md.pc.c.US", "สหรัฐอเมริกา"), CN: T("md.pc.c.CN", "จีน"), EU: T("md.pc.c.EU", "สหภาพยุโรป"), AU: T("md.pc.c.AU", "ออสเตรเลีย"),
    JP: T("md.pc.c.JP", "ญี่ปุ่น"), KR: T("md.pc.c.KR", "เกาหลีใต้"), "US/CA": T("md.pc.c.USCA", "สหรัฐอเมริกาหรือแคนาดา") });
  const KIND = () => ({ drug: T("md.pc.k.drug", "เลขทะเบียนยา"), "herbal-or-drug": T("md.pc.k.herbal", "เลขทะเบียนยาแผนโบราณหรือสมุนไพร"),
    food: T("md.pc.k.food", "เลขสารบบอาหาร (13 หลัก)"), cosmetic: T("md.pc.k.cosmetic", "เลขที่ใบรับจดแจ้งเครื่องสำอาง"),
    device: T("md.pc.k.device", "เลขเครื่องมือแพทย์"), advert: T("md.pc.k.advert", "เลขที่ใบอนุญาตโฆษณา"),
    mal: T("md.pc.k.mal", "เลขทะเบียน MAL (NPRA)"), not: T("md.pc.k.not", "เลขจดแจ้งเครื่องสำอาง NOT (NPRA)"),
    sin: T("md.pc.k.sin", "เลขทะเบียนยา SIN (HSA)"), din: T("md.pc.k.din", "เลขทะเบียนยา DIN (Health Canada)"),
    npn: T("md.pc.k.npn", "เลขผลิตภัณฑ์สุขภาพธรรมชาติ NPN (Health Canada)"), ndc: T("md.pc.k.ndc", "รหัสยา NDC (FDA สหรัฐฯ)"),
    "cn-drug": T("md.pc.k.cndrug", "เลขอนุมัติยา (NMPA)"), "cn-health": T("md.pc.k.cnhealth", "เลขอนุมัติอาหารสุขภาพ (จีน)"),
    "cn-cosmetic": T("md.pc.k.cncos", "เลขอนุมัติเครื่องสำอางพิเศษ (NMPA)"), eu: T("md.pc.k.eu", "เลขอนุญาตจำหน่ายของสหภาพยุโรป (EMA)"),
    aust: T("md.pc.k.aust", "เลข AUST L / R (TGA)") });
  const NOTE = () => ({ older: T("md.pc.n.older", "รูปแบบ 10 หลักแบบเก่า ยังไม่ได้ยืนยันรูปแบบนี้กับ อย."), unverified: T("md.pc.n.unverified", "โครงสร้างของเลขนี้ยังไม่ได้ยืนยันกับหน่วยงาน"),
    uncertain: T("md.pc.n.uncertain", "ไม่มีตัวเลขนำหน้า อาจเป็นเลขครั้งที่ผลิตหรือวันที่ ไม่ใช่เลขทะเบียน ตรวจกับกล่องอีกครั้ง") });
  const VLABEL = () => ({ oryor: T("md.pc.v.oryor", "ตรวจเลขที่ oryor.com หรือแอป ORYOR Smart"), thfda: T("md.pc.v.thfda", "ค้นทะเบียนที่เว็บไซต์ อย."),
    npra: T("md.pc.v.npra", "NPRA QUEST3+ (มาเลเซีย)"), hsa: T("md.pc.v.hsa", "HSA (สิงคโปร์)"), dpd: T("md.pc.v.dpd", "Drug Product Database (แคนาดา)"),
    lnhpd: T("md.pc.v.lnhpd", "Natural Health Products Database (แคนาดา)"), ndc: T("md.pc.v.ndc", "NDC Directory (FDA สหรัฐฯ)"),
    dailymed: T("md.pc.v.dailymed", "DailyMed (NLM สหรัฐฯ)"), nmpa: T("md.pc.v.nmpa", "NMPA (จีน)"), ema: T("md.pc.v.ema", "EMA (สหภาพยุโรป)"),
    tga: T("md.pc.v.tga", "TGA (ออสเตรเลีย)"), pmda: T("md.pc.v.pmda", "PMDA (ญี่ปุ่น)"), mfds: T("md.pc.v.mfds", "MFDS (เกาหลีใต้)"),
    gs1: T("md.pc.v.gs1", "Verified by GS1 (เจ้าของรหัสบาร์โค้ด)"), who: T("md.pc.v.who", "ประกาศเตือนผลิตภัณฑ์ยาขององค์การอนามัยโลก (WHO)") });
  const HINT = () => ({ blur: T("md.pc.q.blur", "ภาพอาจไม่คมชัด ถือกล้องให้นิ่ง หรือแตะเพื่อโฟกัสแล้วถ่ายใหม่"), glare: T("md.pc.q.glare", "มีแสงสะท้อนบนฉลาก เอียงสินค้าเล็กน้อยหรือย้ายจากแสงไฟ"),
    dark: T("md.pc.q.dark", "ภาพมืดเกินไป ถ่ายในที่สว่างขึ้น"), bright: T("md.pc.q.bright", "ภาพสว่างจ้าเกินไป บางส่วนของฉลากอาจหายไป"),
    small: T("md.pc.q.small", "ตัวอักษรในภาพเล็กมาก เข้าใกล้ฉลากมากขึ้น"), notext: T("md.pc.q.notext", "ไม่พบตัวอักษรในภาพ ลองถ่ายด้านที่มีฉลากหรือเลขทะเบียน") });
  const SCRIPT_NAME = () => ({ th: T("md.pc.s.th", "ไทย + อังกฤษ"), cjk: T("md.pc.s.cjk", "จีน / ญี่ปุ่น + อังกฤษ"), ko: T("md.pc.s.ko", "เกาหลี + อังกฤษ"), latin: T("md.pc.s.latin", "อักษรละติน") });

  /* ---------- image + crop box (images stay in memory only) ---------- */
  const video = $("#pcVideo"), still = $("#pcStill"), box = $("#pcCam"), cropEl = $("#pcCrop");
  const sctx = () => /** @type {CanvasRenderingContext2D} */ (still.getContext("2d", { willReadFrequently: true }));
  function fit() { const r = box.getBoundingClientRect(), k = Math.min(r.width / still.width, r.height / still.height); return { r, k, x: (r.width - still.width * k) / 2,
    y: (r.height - still.height * k) / 2 }; }
  function placeCrop() {
    if (!st.still || !st.crop) { cropEl.hidden = true; return; }
    const f = fit(), c = st.crop;
    if (!(f.r.width > 0)) return;
    cropEl.hidden = false;
    Object.assign(cropEl.style, { left: ((f.x + c.x * f.k) / f.r.width) * 100 + "%", top: ((f.y + c.y * f.k) / f.r.height) * 100 + "%", width: ((c.w * f.k) / f.r.width) * 100 + "%",
      height: ((c.h * f.k) / f.r.height) * 100 + "%" });
  }
  function cropCanvas() {
    const c = st.crop || { x: 0, y: 0, w: still.width, h: still.height }, o = document.createElement("canvas");
    o.width = Math.max(1, c.w); o.height = Math.max(1, c.h);
    /** @type {CanvasRenderingContext2D} */ (o.getContext("2d")).drawImage(still, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
    return o;
  }
  let drag = null;
  box.addEventListener("pointerdown", e => {
    if (!st.still) return;
    const f = fit();
    drag = { x: (e.clientX - f.r.left - f.x) / f.k, y: (e.clientY - f.r.top - f.y) / f.k };
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener("pointermove", e => {
    if (!drag) return;
    const f = fit(), cl = (v, m) => Math.min(m, Math.max(0, v));
    const x = cl((e.clientX - f.r.left - f.x) / f.k, still.width), y = cl((e.clientY - f.r.top - f.y) / f.k, still.height), x0 = cl(drag.x, still.width), y0 = cl(drag.y, still.height);
    if (Math.abs(x - x0) > 16 && Math.abs(y - y0) > 12) { st.crop = { x: Math.round(Math.min(x, x0)), y: Math.round(Math.min(y, y0)), w: Math.round(Math.abs(x - x0)),
      h: Math.round(Math.abs(y - y0)) }; placeCrop(); }
  });
  box.addEventListener("pointerup", () => { drag = null; });
  box.addEventListener("keydown", e => { // arrows move the crop box, Shift + arrows resize it
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || !st.still || !st.crop) return;
    e.preventDefault();
    const c = { ...st.crop }, sx = Math.round(still.width * 0.02), sy = Math.round(still.height * 0.02), cl = (v, a, b) => Math.min(b, Math.max(a, v));
    if (e.shiftKey) { c.w = cl(c.w + d[0] * sx, 16, still.width - c.x); c.h = cl(c.h + d[1] * sy, 12, still.height - c.y); }
    else { c.x = cl(c.x + d[0] * sx, 0, still.width - c.w); c.y = cl(c.y + d[1] * sy, 0, still.height - c.h); }
    st.crop = c; placeCrop();
  });
  window.addEventListener("resize", placeCrop);

  function showWrap(live) {
    $("#pcCamWrap").hidden = false;
    video.hidden = !live; still.hidden = live;
    $("#pcSnap").hidden = !live;
    for (const id of ["#pcRun", "#pcAuto"]) $(id).hidden = live;
  }
  async function startCam() {
    clearImage();
    showWrap(true);
    try {
      if (!st.cam) st.cam = W.LQCam.create(video, { facing: "environment", ideal: { width: 1920, height: 1080 }, mirror: false });
      await st.cam.start();
      status(T("md.pc.st.camOn", "กล้องเปิดอยู่ หันไปที่ฉลากแล้วกด 'ถ่ายภาพนี้' ภาพไม่ถูกบันทึกหรือส่งออก"), "ok");
    } catch (err) { status(W.LQCam && W.LQCam.errorText ? W.LQCam.errorText(err) : T("md.pc.st.camErr", "เปิดกล้องไม่ได้ เลือกรูปจากเครื่องแทน"), "err"); }
  }
  function stopCam() { if (st.cam) { try { st.cam.stop(); } catch { /* already stopped */ } } }
  function clearImage() {
    stopCam();
    if (st.still) { sctx().clearRect(0, 0, still.width, still.height); still.width = still.height = 1; }
    Object.assign(st, { still: false, crop: null, boxes: [], ocr: null, codes: null, quality: null, text: "", read: false });
    $("#pcCamWrap").hidden = true; $("#pcOut").innerHTML = ""; $("#pcHints").innerHTML = ""; cropEl.hidden = true;
    st.gen++; closePrev("back");
  }
  /** put a picture (canvas / image / video frame) into the still canvas (<= 1600 px long side) and analyse it */
  async function setImage(src, w, h) {
    stopCam();
    st.gen++; closePrev("back"); // a new picture: any preview or face search of the old one is void
    const k = Math.min(1, 1600 / Math.max(w, h));
    still.width = Math.max(1, Math.round(w * k)); still.height = Math.max(1, Math.round(h * k));
    sctx().drawImage(src, 0, 0, still.width, still.height);
    Object.assign(st, { still: true, crop: null, boxes: [], ocr: null, codes: null, quality: null, text: "", read: false });
    showWrap(false);
    $("#pcOut").innerHTML = ""; $("#pcHints").innerHTML = "";
    await autoCrop();
    if (st.crop) await read();
  }
  W.__LQ_PC.setImage = c => setImage(c, c.width, c.height);
  W.__LQ_PC.clear = () => clearImage(); // same as "Close camera / clear picture" (the button is disabled while busy; a new file is not)

  /* ---------- analysis ---------- */
  const firstLoad = () => (R.loaded().det ? "" : " " + T("md.pc.st.first", "(ครั้งแรกโหลดโมเดลประมาณ {mb} MB)", { mb: mb(P.downloadBytes(st.script)) }));
  async function busy(fn) {
    if (st.busy) return;
    st.busy = true;
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll("#tab-pc .md-row button"))) b.disabled = true;
    try { await fn(); } finally { st.busy = false; for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll("#tab-pc .md-row button"))) b.disabled = false; }
  }
  async function autoCrop() {
    if (!st.still) return;
    await busy(async () => {
      status(T("md.pc.st.find", "กำลังหาตำแหน่งตัวอักษรในเครื่องนี้…") + firstLoad(), "");
      try {
        const d = await R.detect(still);
        st.boxes = d.boxes;
        st.crop = P.cropFromBoxes(d.boxes, still.width, still.height) || { x: 0, y: 0, w: still.width, h: still.height };
        placeCrop();
        const inCrop = st.boxes.filter(b => b.x0 >= st.crop.x && b.y0 >= st.crop.y && b.x1 <= st.crop.x + st.crop.w && b.y1 <= st.crop.y + st.crop.h)
          .map(b => ({ ...b, x0: b.x0 - st.crop.x, x1: b.x1 - st.crop.x, y0: b.y0 - st.crop.y, y1: b.y1 - st.crop.y }));
        st.quality = R.quality(cropCanvas(), inCrop);
        renderHints();
        status(d.boxes.length ? T("md.pc.st.found", "พบตัวอักษร {n} จุด วางกรอบให้แล้ว ลากบนรูปเพื่อวางกรอบใหม่ได้", { n: d.boxes.length }) : T("md.pc.st.none",
          "ไม่พบตัวอักษร ลากบนรูปเพื่อวางกรอบเอง หรือถ่ายใหม่ให้ชัดขึ้น"), d.boxes.length ? "ok" : "warn");
      } catch { st.crop = { x: 0, y: 0, w: still.width, h: still.height }; placeCrop(); status(T("md.pc.st.modelErr",
        "โหลดหรือรันโมเดลไม่ได้ พิมพ์เลขเองที่แท็บ 'กล่อง / ฉลาก / ชื่อยา' แทน"), "err"); }
    });
  }
  async function read() {
    if (!st.still) { status(T("md.pc.st.noImg", "เปิดกล้องแล้วถ่ายภาพ หรือเลือกรูปก่อน"), "warn"); return; }
    await busy(async () => {
      status(T("md.pc.st.reading", "กำลังอ่านฉลาก ({s}) ในเครื่องนี้…", { s: SCRIPT_NAME()[st.script] }) + (R.loaded().rec[st.script] ? "" : " " + T("md.pc.st.firstRec",
        "(ครั้งแรกโหลดโมเดลภาษานี้ประมาณ {mb} MB)", { mb: mb(P.SCRIPTS[st.script].bytes) })), "");
      try {
        st.ocr = await R.ocr(cropCanvas(), { script: st.script });
        st.text = st.ocr.text;
      } catch { st.ocr = null; status(T("md.pc.st.modelErr", "โหลดหรือรันโมเดลไม่ได้ พิมพ์เลขเองที่แท็บ 'กล่อง / ฉลาก / ชื่อยา' แทน"), "err"); return; }
      try { st.codes = await R.barcodes(still); } catch { st.codes = { engine: "none", codes: [], error: true }; }
      st.read = true;
      status(T("md.pc.st.done", "อ่านเสร็จใน {s} วินาทีบนเครื่องนี้ ตรวจและแก้ข้อความด้านล่างได้", { s: (st.ocr.ms.total / 1000).toFixed(1) }), "ok");
      emergency(); renderOut(); remember(); announce();
    });
  }
  async function scan() {
    if (!st.still) { status(T("md.pc.st.noImg", "เปิดกล้องแล้วถ่ายภาพ หรือเลือกรูปก่อน"), "warn"); return; }
    await busy(async () => {
      status(T("md.pc.st.scan", "กำลังหาบาร์โค้ดในเครื่องนี้…"), "");
      try { st.codes = await R.barcodes(still); } catch { st.codes = { engine: "none", codes: [], error: true }; }
      st.read = true;
      status(st.codes.codes.length ? T("md.pc.st.barOk", "พบบาร์โค้ด {n} รายการ", { n: st.codes.codes.length }) : T("md.pc.st.barNone", "ไม่พบบาร์โค้ด ลองให้บาร์โค้ดเต็มภาพและไม่สะท้อนแสง"),
        st.codes.codes.length ? "ok" : "warn");
      renderOut(); remember();
    });
  }
  W.__LQ_PC.read = read; W.__LQ_PC.scan = scan;
  /** face gate on the current picture (whole frame + crop). Kept as a hook / API; the upload path does NOT use it any more
   *  (owner decision 2026-11-10: faces are blurred by prepareUpload, an upload is never blocked because of a face) */
  W.__LQ_PC.faceCheck = () => (st.still ? R.faceCheck(still, st.crop) : Promise.resolve({ ...P.faceGate(null), runs: [] }));
  /* ---------- upload preview: faces blurred before any picture leaves the device (owner decision 2026-11-10) ---------- */
  // Not wired to the AI yet (P7 calls prepareUpload). A face never blocks an upload: every detected face region is blurred
  // (pixelated, irreversible) in the picture that would be sent, the user sees that picture and the count, and can go back.
  // If the face detector cannot run, the picture is NOT sent: that check goes as text only (blurring cannot fix a detector
  // that did not run). Nothing is uploaded or stored here.
  const prev = $("#pcPrev");
  let pending = null; // resolver of the preview that is waiting for the user's choice
  const UP_REASON = () => ({ "model-missing": T("md.pc.up.rModel", "โหลดตัวหาใบหน้าบนเครื่องนี้ไม่ได้ จึงไม่รู้ว่ามีใบหน้าตรงไหน การเบลอจึงช่วยไม่ได้"),
    error: T("md.pc.up.rError", "ตัวหาใบหน้าทำงานไม่สำเร็จบนเบราว์เซอร์นี้ จึงไม่รู้ว่ามีใบหน้าตรงไหน การเบลอจึงช่วยไม่ได้"),
    "not-run": T("md.pc.up.rError", "ตัวหาใบหน้าทำงานไม่สำเร็จบนเบราว์เซอร์นี้ จึงไม่รู้ว่ามีใบหน้าตรงไหน การเบลอจึงช่วยไม่ได้"),
    "bad-score": T("md.pc.up.rBad", "ผลจากตัวหาใบหน้าอ่านไม่ได้ จึงไม่แน่ใจว่าเบลอใบหน้าได้ครบ"),
    "bad-box": T("md.pc.up.rBad", "ผลจากตัวหาใบหน้าอ่านไม่ได้ จึงไม่แน่ใจว่าเบลอใบหน้าได้ครบ"),
    "bad-frame": T("md.pc.up.rBad", "ผลจากตัวหาใบหน้าอ่านไม่ได้ จึงไม่แน่ใจว่าเบลอใบหน้าได้ครบ"),
    "no-image": T("md.pc.st.noImg", "เปิดกล้องแล้วถ่ายภาพ หรือเลือกรูปก่อน") });
  function closePrev(choice) {
    if (pending) { const r = pending; pending = null; r(choice); }
    prev.hidden = true; prev.innerHTML = "";
  }
  function showTextOnly(reason) {
    closePrev("back");
    prev.innerHTML = card("warn", `<h3>${esc(T("md.pc.up.textOnlyH", "ครั้งนี้ใช้เฉพาะข้อความ ไม่ส่งภาพ"))}</h3>` +
      `<p class="md-status" data-kind="warn" data-reason="${esc(reason)}">${esc(UP_REASON()[reason] || UP_REASON().error)}</p>` +
      `<p class="hint">${esc(T("md.pc.up.textOnlyT", "ภาพไม่ถูกส่ง ใช้เฉพาะข้อความที่อ่านได้บนเครื่องนี้ (แก้ไขได้ด้านล่าง) ลองใหม่บนเบราว์เซอร์อื่นได้ถ้าต้องการส่งภาพ"))}</p>`, "pcPrevCard");
    prev.hidden = false;
  }
  /**
   * prepareUpload() -> Promise of
   *   {blob, blurredCount}          the user pressed "Use this picture": a JPEG of the crop (long side <= 1,024 px, EXIF
   *                                 dropped by re-encoding) with every detected face region blurred; blurredCount = regions
   *   {textOnly: true, reason}      the face detector could not run / gave unreadable output (LQPC.faceBlurPlan) or there
   *                                 is no picture: send text only, never this picture
   *   {cancelled: true, reason: "back"}   the user went back (to redraw the box); nothing is sent
   *   {cancelled: true, reason: "busy" | "changed"}   another analysis was running, or the picture was replaced / cleared
   *                                 while the faces were being found; nothing is sent
   * Faces never block: a picture with faces is blurred and shown, not refused.
   * SAME PICTURE: LQPCRun.faceRuns copies the picture before its first await and builds the upload image from that copy;
   * a generation counter (st.gen, bumped by every new / cleared picture) is checked after the await, so the regions found
   * are always blurred on, and sent with, exactly the picture the detector saw.
   */
  async function prepareUpload() {
    closePrev("back");
    if (!st.still) { showTextOnly("no-image"); return { textOnly: true, reason: "no-image" }; }
    if (st.busy) return { cancelled: true, reason: "busy" };
    const set = P.FACE_BLUR, gen = st.gen;
    let out = null, up = null, n = 0;
    await busy(async () => {
      status(T("md.pc.up.scan", "กำลังหาใบหน้าในภาพบนเครื่องนี้ เพื่อเบลอก่อนส่ง…"), "");
      let fr;
      try { fr = await R.faceRuns(still, st.crop, { tiles: set.tiles, grid: set.grid, overlap: set.overlap, upscale: set.upscale, close: set.close, maxSide: 1024 }); }
      catch (e) { fr = { loaded: false, error: String(e) }; }
      if (gen !== st.gen) { status("", ""); out = { cancelled: true, reason: "changed" }; return; }
      const plan = P.faceBlurPlan(fr, fr.w, fr.h, { threshold: set.threshold, pad: set.pad, tiles: set.tiles,
        need: ["frame", ...(set.tiles ? ["tiles"] : []), ...(set.close ? ["close"] : []), "upload"], crop: fr.crop, scale: fr.scale });
      if (plan.textOnly) { status("", ""); showTextOnly(plan.reason); out = { textOnly: true, reason: plan.reason }; return; }
      up = fr.upload; n = R.faceBlur(up, plan.regions);
    });
    if (out) return out;
    if (!up) return { cancelled: true, reason: "busy" };
    up.id = "pcPrevImg";
    up.setAttribute("role", "img");
    up.setAttribute("aria-label", T("md.pc.up.imgA", "ภาพที่จะส่ง บริเวณใบหน้าถูกเบลอแล้ว"));
    prev.innerHTML = card("info", `<h3>${esc(T("md.pc.up.h", "ภาพที่จะส่ง: ตรวจก่อนส่ง"))}</h3>` +
      `<p class="md-status" data-kind="${n ? "ok" : ""}" id="pcPrevCount" data-n="${n}">${esc(n === 1 ? T("md.pc.up.n1", "เบลอบริเวณใบหน้าแล้ว 1 จุด")
        : n ? T("md.pc.up.n", "เบลอบริเวณใบหน้าแล้ว {n} จุด", { n }) : T("md.pc.up.none", "ไม่พบใบหน้าในภาพ ไม่มีบริเวณที่ต้องเบลอ"))}</p><div class="pc-prev-img"></div>` +
      `<p class="hint">${esc(T("md.pc.up.note",
        "เครื่องนี้หาใบหน้าและเบลอให้อัตโนมัติ รวมถึงภาพคนบนบรรจุภัณฑ์ ใบหน้าที่เล็กมากอาจหาไม่พบ ถ้ายังเห็นใบหน้าหรือชื่อคน กด 'กลับไปแก้กรอบ' ยังไม่มีการส่งภาพจนกว่าจะกด 'ใช้ภาพนี้'"))}</p>` +
      `<div class="md-row"><button class="btn ghost" type="button" id="pcPrevBack">${esc(T("md.pc.up.back", "กลับไปแก้กรอบ"))}</button>` +
      `<button class="btn primary" type="button" id="pcPrevUse">${esc(T("md.pc.up.use", "ใช้ภาพนี้"))}</button></div>`, "pcPrevCard");
    prev.querySelector(".pc-prev-img").appendChild(up);
    prev.hidden = false;
    status(T("md.pc.up.ready", "ภาพพร้อมให้ตรวจ ยังไม่มีการส่ง"), "ok");
    prev.scrollIntoView({ block: "nearest" });
    const choice = await new Promise(res => { pending = res; });
    if (choice !== "use") { up.width = up.height = 1; return { cancelled: true, reason: "back" }; }
    // the only image encoding in Product Check: the BLURRED crop, after the user confirmed it in the preview (P7 sends it)
    const blob = await new Promise(res => up.toBlob(res, "image/jpeg", 0.85));
    up.width = up.height = 1;
    return blob ? { blob, blurredCount: n } : { textOnly: true, reason: "error" };
  }
  prev.addEventListener("click", e => {
    if (e.target.closest("#pcPrevBack")) { closePrev("back"); status(T("md.pc.up.backSt", "ยังไม่ส่งภาพ วางกรอบใหม่ได้"), ""); $("#pcCam").focus(); }
    else if (e.target.closest("#pcPrevUse")) closePrev("use");
  });
  W.__LQ_PC.prepareUpload = prepareUpload;

  function reparse() { const t = $("#pcText"); if (t) st.text = t.value; emergency(); renderOut(); remember(); announce(); }
  W.__LQ_PC.reparse = reparse;
  /** same emergency card as the "Box / label" tab (LQMed.emergency): overdose / poisoning / self-harm wording in the text */
  function emergency() {
    const e = M && M.emergency ? M.emergency(st.text || "") : { poison: false, self: false }, box = $("#mdEmerg");
    if (!e.poison || !box) return false;
    box.hidden = false;
    const self = $("#mdEmSelf"); if (self) self.hidden = !e.self;
    box.scrollIntoView({ block: "start" }); box.focus({ preventScroll: true });
    return true;
  }
  const announce = () => { try { window.dispatchEvent(new CustomEvent("lq-pc-text", { detail: { text: st.text, script: st.script } })); } catch { /* old browser */ } };

  /* ---------- results ---------- */
  function renderHints() {
    const H = HINT(), q = st.quality;
    $("#pcHints").innerHTML = q && q.hints.length ? q.hints.map(h => `<li data-q="${h}">${esc(H[h] || h)}</li>`).join("") : "";
  }
  function renderOut() {
    const C = COUNTRY(), K = KIND(), N = NOTE(), V = VLABEL(), today = P.localDate(new Date());
    const regs = P.findRegNumbers(st.text || "");
    const codes = ((st.codes && st.codes.codes) || []).map(c => P.barcodeInfo(c.rawValue, c.format));
    const countries = new Set(["TH"]);
    let h = "";
    if (st.ocr || st.text) {
      h += card("info", `<h3>${esc(T("md.pc.r.text", "ข้อความที่อ่านได้ (แก้ไขได้)"))}</h3>` +
        `<p class="hint">${esc(st.ocr ? T("md.pc.r.textMeta", "อ่านด้วยโมเดล {s} ได้ {n} บรรทัด อาจอ่านผิด ตรวจกับฉลากจริงทุกครั้ง", { s: SCRIPT_NAME()[st.ocr.script],
          n: st.ocr.lines.length }) : "")}</p>` +
        `<label class="md-field"><span>${esc(T("md.pc.r.textL", "ข้อความจากฉลาก"))}</span><textarea id="pcText" rows="6" translate="no" spellcheck="false"></textarea></label>` +
        `<div class="md-row"><button class="btn ghost" type="button" id="pcReparse">${esc(T("md.pc.r.reparse", "ตรวจข้อความที่แก้ไขแล้ว"))}</button></div>`, "pcTextCard");
      // registration-number shapes
      let r = `<h3>${esc(T("md.pc.r.regs", "เลขทะเบียนที่พบ (ตรวจเฉพาะรูปแบบ)"))}</h3>`;
      if (!regs.length) r += `<p class="md-status" data-kind="warn">${esc(T("md.pc.r.noReg",
        "ไม่พบเลขทะเบียนในข้อความที่อ่านได้ ยา อาหารบางประเภท และเครื่องสำอางที่ขายในไทยต้องแสดงเลข ดูด้านข้างหรือด้านหลังกล่อง หรือถามผู้ขาย"))}</p>`;
      else r += `<div class="md-cands">` + regs.map(x => {
        countries.add(x.country);
        return `<div class="md-cand" data-country="${esc(x.country)}" data-kind="${esc(x.kind)}"><p class="md-imp">${raw(x.norm)}</p><div class="md-badges">${badge(C[x.country]
          || x.country)}${badge(K[x.kind] || x.kind)}${badge(T("md.pc.r.shape", "รูปแบบตรง ยังไม่ได้ตรวจกับทะเบียน"), "warn")}</div>` +
          (x.note && N[x.note] ? `<p class="hint">${esc(N[x.note])}</p>` : "") + `<div class="md-row">${(P.VERIFY[x.country] || []).map(v => link(v.url, V[v.id] || v.id)).join("")}</div></div>`;
      }).join("") + `</div>`;
      h += card(regs.length ? "info" : "warn", r, "pcRegs");
    }
    if (st.codes) {
      let b = `<h3>${esc(T("md.pc.r.codes", "บาร์โค้ด"))}</h3>`;
      if (!codes.length) b += `<p class="md-status" data-kind="warn">${esc(st.codes.error ? T("md.pc.r.barErr",
        "สแกนบาร์โค้ดไม่สำเร็จบนเบราว์เซอร์นี้ พิมพ์ตัวเลขใต้บาร์โค้ดในช่องข้อความแทน") : T("md.pc.r.noBar", "ไม่พบบาร์โค้ดในภาพ"))}</p>`;
      for (const c of codes) b += codeBlock(c, C, today, countries);
      h += card(codes.length ? "info" : "warn", b, "pcCodes");
    }
    if (st.read) {
      const links = [...countries].flatMap(c => P.VERIFY[c] || []).concat(P.VERIFY.WHO);
      h += card("info", `<h3>${esc(T("md.pc.r.how", "วิธีตรวจต่อด้วยตัวเอง"))}</h3><p class="hint">${esc(T("md.pc.r.howT",
        "ตรวจเลขทะเบียนกับหน่วยงานของประเทศที่ระบุ ในไทยใช้ oryor.com แอป ORYOR Smart หรือ LINE @FDAthai ถ้าไม่แน่ใจ อย่าใช้สินค้า และถามเภสัชกร"))}</p>` +
        `<div class="md-row">${links.map(v => link(v.url, V[v.id] || v.id)).join("")}</div>`, "pcHow");
      const miss = [T("md.pc.x.registry", "ยังไม่ได้ตรวจเลขกับฐานข้อมูลทะเบียนของหน่วยงาน (ขั้นนี้ตรวจเฉพาะรูปแบบเลข)"),
        T("md.pc.x.claims", "ยังไม่ได้ตรวจคำโฆษณาเกินจริงบนฉลากในขั้นนี้"),
        T("md.pc.x.printedExp", "วันหมดอายุที่พิมพ์เป็นตัวอักษรยังไม่ได้อ่านอัตโนมัติ ดูบนกล่องเอง (ระบบอ่านเฉพาะวันหมดอายุในบาร์โค้ด GS1)")];
      if (!regs.length) miss.push(T("md.pc.x.noReg", "ไม่พบเลขทะเบียน จึงตรวจรูปแบบเลขไม่ได้"));
      if (!codes.length) miss.push(T("md.pc.x.noBar", "ไม่พบบาร์โค้ด จึงไม่มีข้อมูล GTIN ล็อต หรือวันหมดอายุจากบาร์โค้ด"));
      if (st.ocr && st.ocr.lines.length < 2) miss.push(T("md.pc.x.script", "อ่านได้น้อย ฉลากอาจเป็นภาษาอื่น ลองเปลี่ยนภาษาบนฉลากแล้วอ่านใหม่"));
      h += card("warn", `<h3>${esc(T("md.pc.r.cant", "สิ่งที่ยังตรวจไม่ได้"))}</h3><ul class="md-list">${miss.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`, "pcCant");
    }
    $("#pcOut").innerHTML = h;
    const ta = $("#pcText");
    if (ta) ta.value = st.text || "";
  }
  function codeBlock(c, C, today, countries) {
    const issuer = c.prefix && c.prefix.issuer ? T("md.pc.r.issuer", "รหัส {code}: เลขนี้ออกโดย GS1 {who} ไม่ได้บอกว่าผลิตที่ประเทศใด", { code: c.prefix.code, who: C[c.prefix.issuer]
      || c.prefix.issuer }) : "";
    if (c.prefix && /^(TH|MY|SG|CN|JP|KR|AU)$/.test(c.prefix.issuer)) countries.add(c.prefix.issuer);
    if (c.kind === "gtin") {
      return `<div class="md-cand" data-code="gtin"><p class="md-imp">${raw(c.gtin)}</p><div class="md-badges">${badge(String(c.format || "").toUpperCase() || "GTIN")}` +
        `${c.gtinValid ? badge(T("md.pc.r.ckOk", "เลขตรวจสอบถูกต้อง"), "ok") : badge(T("md.pc.r.ckBad", "เลขตรวจสอบไม่ตรง: อ่านหรือพิมพ์ใหม่"), "warn")}</div>` +
        (issuer ? `<p class="hint">${esc(issuer)}</p>` : "") + `<p class="hint">${esc(T("md.pc.r.noGtinDb",
          "ไม่มีฐานข้อมูลเปิดของทางการที่จับคู่บาร์โค้ดกับสินค้าไทย ใช้เลขทะเบียนบนกล่องตรวจแทน"))}</p></div>`;
    }
    if (c.kind === "gs1") {
      const e = c.expiry, past = !!e && P.expiryStatus(e.iso, today) === "past";
      const rows = [[T("md.pc.r.gtin", "GTIN"), c.gtin + " " + (c.gtinValid ? "✓" : "✗")]];
      if (e) rows.push([T("md.pc.r.exp", "วันหมดอายุ (ตามที่พิมพ์ในบาร์โค้ด)"), e.iso]);
      if (c.lot) rows.push([T("md.pc.r.lot", "เลขที่ผลิต / ล็อต"), c.lot]);
      if (c.serial) rows.push([T("md.pc.r.serial", "เลขประจำชิ้น"), c.serial]);
      for (const f of c.fields.filter(f => !["01", "17", "10", "21"].includes(f.ai))) rows.push([`AI (${f.ai})`, f.value]);
      return `<div class="md-cand" data-code="gs1"><div class="md-badges">${badge("GS1 " + (String(c.format || "").toUpperCase() || ""))}${c.gtinValid ? badge(T("md.pc.r.ckOk",
        "เลขตรวจสอบถูกต้อง"), "ok") : badge(T("md.pc.r.ckBad", "เลขตรวจสอบไม่ตรง: อ่านหรือพิมพ์ใหม่"), "warn")}` +
        `</div>${past ? `<p class="md-status" data-kind="err" data-signal="expiry-past">${esc(T("md.pc.r.expPast",
          "วันหมดอายุที่พิมพ์ไว้ดูเหมือนผ่านมาแล้ว ตรวจวันที่บนบรรจุภัณฑ์ ถ้าผ่านแล้วจริง อย่าใช้ และถามเภสัชกร"))}</p>` : ""}<dl class="md-kv">${rows.map(([k,
          v]) => `<dt>${esc(k)}</dt><dd>${raw(v)}</dd>`).join("")}</dl>` +
        (e ? `<p class="hint">${esc(T("md.pc.r.expFact", "เป็นข้อมูลที่พิมพ์ไว้ในบาร์โค้ด ไม่ได้ตรวจกับผู้ผลิต เทียบกับวันที่พิมพ์บนกล่องด้วย"))}${e.dayAssumed ? " "
          + esc(T("md.pc.r.expDay", "บาร์โค้ดระบุวันที่เป็น 00 ตามมาตรฐาน GS1 หมายถึงวันสุดท้ายของเดือน")) : ""}</p>` : "") +
        (issuer ? `<p class="hint">${esc(issuer)}</p>` : "") + "</div>";
    }
    return `<div class="md-cand" data-code="other"><div class="md-badges">${badge(String(c.format || "").toUpperCase()
      || "CODE")}</div><p class="md-text">${raw(c.raw)}</p><p class="hint">${esc(T("md.pc.r.other", "ข้อความในรหัสนี้แสดงตามที่อ่านได้ ไม่ได้เปิดลิงก์ให้อัตโนมัติ"))}</p></div>`;
  }
  /** opt-in history (same list as the other tabs): registration numbers and barcodes only, never the OCR text or images */
  function remember() {
    const med = W.__LQ_MED;
    if (!med || !med.cfg || !med.cfg.hist || !M) return;
    const regs = P.findRegNumbers(st.text || "").map(r => r.norm), codes = ((st.codes && st.codes.codes) || []).map(c => P.barcodeInfo(c.rawValue, c.format)).map(c => c.gtin || "").filter(Boolean);
    const q = [...regs, ...codes].join(" · ");
    if (!q || (M.emergency && M.emergency(st.text || "").poison)) return;
    try {
      const list = JSON.parse(localStorage.getItem("lq-med-history") || "[]");
      localStorage.setItem("lq-med-history", JSON.stringify(M.historyAdd(list, { kind: "pc", q, r: [...new Set(P.findRegNumbers(st.text || "").map(r => r.country))].join(", ") || "-" })));
    } catch { /* storage blocked: works without it */ }
  }

  /* ---------- wiring ---------- */
  $("#pcScript").addEventListener("change", e => { st.script = P.SCRIPTS[e.target.value] ? e.target.value : P.DEFAULT_SCRIPT; });
  $("#pcCamBtn").addEventListener("click", startCam);
  $("#pcSnap").addEventListener("click", () => {
    if (!(st.cam && video.videoWidth)) { status(T("md.pc.st.noImg", "เปิดกล้องแล้วถ่ายภาพ หรือเลือกรูปก่อน"), "warn"); return; }
    setImage(video, video.videoWidth, video.videoHeight);
  });
  $("#pcRun").addEventListener("click", read);
  $("#pcAuto").addEventListener("click", async () => { await autoCrop(); });
  $("#pcBar").addEventListener("click", scan);
  $("#pcClear").addEventListener("click", () => { clearImage(); status(T("md.pc.st.cleared", "ปิดกล้องและล้างรูปแล้ว ไม่มีภาพเหลือในเครื่อง"), ""); });
  $("#pcOut").addEventListener("click", e => { if (e.target.closest("#pcReparse")) reparse(); });
  $("#pcFile").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const url = URL.createObjectURL(f);
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      await setImage(img, img.naturalWidth, img.naturalHeight);
    } catch { status(T("md.pc.st.imgErr", "เปิดรูปนี้ไม่ได้"), "err"); } finally { URL.revokeObjectURL(url); }
  });
  // leaving the tab (or the page) closes the camera; the picture stays in memory until "clear" or page close
  new MutationObserver(() => { if ($("#tab-pc").hidden) stopCam(); }).observe($("#tab-pc"), { attributes: true, attributeFilter: ["hidden"] });
  window.addEventListener("pagehide", clearImage);
  window.addEventListener("lq-lang", () => { renderHints(); if (st.read || st.text) { const t = $("#pcText"); if (t) st.text = t.value; renderOut(); } });
})();
