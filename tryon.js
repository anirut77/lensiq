/* tryon.js — Try-On customer page (tryon.html; docs/TRYON-DESIGN.md T4 subset + owner decision 2026-11-18). Everything
 * runs on this device:
 *  - the picture: the live camera (LQCam / getUserMedia) OR one photo the person picks from this device (image only, read
 *    in the page with createImageBitmap; never uploaded, never stored). Both open only after the consent tick; there is no
 *    drop and no paste.
 *  - face-anchored items (glasses, hats, earrings, necklaces): MediaPipe Face Landmarker (vendored, no facial-movement
 *    model) -> LQTryOn.faceAnchors / place.
 *  - pose-anchored clothes (tops, outerwear, dresses, skirts, trousers; front view, one person): MediaPipe Pose Landmarker
 *    lite, LAZY: loadPose() fetches the model only when the person picks one of these items -> LQTryOn.bodyAnchors ->
 *    garmentTargets -> studio-core templateWarpTo / warpRGBA, ~3 times a second on the camera, once per photo. When the pose
 *    engine cannot run, tops fall back to the selfie-mask fit (studio item 24).
 *  - nothing is sent or stored: the only requests are GET /v1/tryon/catalog, the GET of each catalogue image (garment
 *    cut-outs) and the page's own static files (models, runtime). A snapshot is saved only when the person presses the
 *    button, and carries the burned-in preview mark. The page says plainly that it is a preview of placement and colour,
 *    not a realistic fitting.
 * Test seams: ?demo=1 (built-in drawn items, no backend), ?fakelm=1 (window.__LQ_FAKE_LM() -> 478 normalised points),
 * ?fakepose=1 (window.__LQ_FAKE_POSE() -> [33 normalised points] per person). Test hook: window.__tryon = {state, snapshot()}.
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), TO = W.LQTryOn, SC = W.StudioCore, $ = s => document.querySelector(s);
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m));
  const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
  const flag = n => new RegExp("[?&]" + n + "=1(&|$)").test(location.search);
  const abs = p => new URL(p, location.href).href;
  const POSE_MODEL = "vendor/models/pose-landmarker/pose_landmarker_lite.task";
  const POSE_ORDER = ["trousers", "skirts", "dresses", "tops", "outerwear"]; // drawn bottom layer first
  const FACE_CATS = ["necklaces", "earrings", "glasses", "hats"];
  const state = { camera: false, mode: "", frames: 0, faces: 0, engine: "", seg: "", items: [], worn: {}, last: null, placed: null, source: "demo",
    err: "", pose: { engine: "", loading: false, n: 0, reason: "" } };
  const cv = /** @type {HTMLCanvasElement} */ ($("#toCanvas")), cx = cv.getContext("2d", { willReadFrequently: true });
  const video = /** @type {HTMLVideoElement} */ ($("#toVideo"));
  let cam = null, lm = null, seg = null, pose = null, files = null, posePromise = null, raf = 0, topJob = null, photo = null, photoGen = 0;
  const status = (k, th, v) => { $("#toStatus").textContent = T(k, th, v); };

  /* ---------- catalogue: the shop's published items (GET only), or the built-in drawn samples ---------- */
  const nameOf = it => { const l = (W.LQI18N && W.LQI18N.lang) || "th"; return (it.name && (it.name[l] || it.name.th)) || it.id; };
  async function imageFor(it) {
    if (it.draw) return TO.drawDemo(it.draw, it.colour);
    const r = await fetch(W.LQApi.url(it.asset.url), { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!r.ok) throw new Error("image " + r.status);
    const bmp = await createImageBitmap(await r.blob()), c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
    return c;
  }
  async function loadCatalog() {
    let items = null;
    if (!flag("demo") && W.LQApi && W.LQApi.enabled()) {
      const j = await W.LQApi.getJSON("/v1/tryon/catalog");
      // only what this page can draw
      if (j && Array.isArray(j.items) && j.items.length) { items = j.items.filter(i => TO.DRAWABLE.includes(i.category)); state.source = "shop"; }
    }
    state.items = items && items.length ? items : TO.DEMO.slice();
    if (!(items && items.length)) state.source = "demo";
    $("#toSrc").textContent = state.source === "shop" ? T("to.items.shop", "สินค้าจากแคตตาล็อกของร้าน ({n} รายการ)", { n: state.items.length })
      : T("to.items.demo", "สินค้าตัวอย่าง (ภาพวาด) — ยังไม่ได้เชื่อมแคตตาล็อกของร้าน");
    renderItems();
  }
  function renderItems() {
    const box = $("#toItems"); box.textContent = "";
    for (const it of state.items) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "to-item chip"; b.dataset.item = it.id; b.dataset.cat = it.category; b.setAttribute("role", "listitem");
      b.setAttribute("aria-pressed", String(!!(state.worn[it.category] && state.worn[it.category].id === it.id)));
      b.textContent = nameOf(it);
      b.addEventListener("click", () => wear(it));
      box.appendChild(b);
    }
  }
  async function wear(it) {
    const cur = state.worn[it.category];
    if (cur && cur.id === it.id) { delete state.worn[it.category]; state.last = null; state.placed = null; poseKey = ""; renderItems(); return; }
    try {
      const img = await imageFor(it), entry = { id: it.id, cat: it.category, img, aspect: img.height / img.width };
      if (TO.POSE_CATS.includes(it.category)) {
        const px = img.getContext("2d").getImageData(0, 0, img.width, img.height).data, a = new Float32Array(img.width * img.height);
        for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] / 255;
        entry.px = px; entry.anchors = TO.garmentAnchorsFromAlpha(it.category, a, img.width, img.height, SC);
        if (!entry.anchors) { status("to.st.noAnchors", "หาขอบของสินค้านี้ไม่พบ ใช้ภาพสินค้าที่ตัดพื้นหลังแล้ว"); return; }
      }
      state.worn[it.category] = entry; state.last = it.category; state.placed = null; poseKey = ""; renderItems();
      if (TO.POSE_CATS.includes(it.category) && state.mode) loadPose(); // the pose model is fetched only now (lazy)
    } catch (e) { console.warn(e); status("to.st.imgErr", "เปิดภาพสินค้านี้ไม่ได้"); }
  }

  /* ---------- engines (on device) ---------- */
  const fileset = async () => {
    const mp = await import(abs("vendor/mediapipe/vision_bundle.mjs"));
    if (!files) files = await mp.FilesetResolver.forVisionTasks(abs("vendor/mediapipe/wasm"));
    return mp;
  };
  async function loadFace() {
    if (lm || state.engine) return;
    if (flag("fakelm") && typeof W.__LQ_FAKE_LM === "function") { state.engine = "fake"; return; }
    try {
      const { FaceLandmarker, ImageSegmenter } = await fileset();
      lm = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: abs("vendor/models/face-landmarker/face_landmarker_lm.task"), delegate: "CPU" },
        runningMode: "VIDEO", numFaces: 2, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false });
      state.engine = "mediapipe";
      try {
        seg = await ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: abs("vendor/models/selfie_segmenter.tflite"), delegate: "CPU" },
          runningMode: "VIDEO", outputConfidenceMasks: true, outputCategoryMask: false });
        state.seg = "selfie";
      } catch (e) { console.warn("segmenter", e); state.seg = ""; }
    } catch (e) {
      console.warn("face landmarker", e); state.engine = ""; state.err = String((e && e.message) || e);
      status("to.st.noEngine", "เครื่องนี้เปิดตัวหาจุดบนใบหน้าไม่ได้ (ต้องใช้เบราว์เซอร์ที่รองรับ WebGL) ยังเห็นภาพได้ แต่วางแว่น หมวก และต่างหูไม่ได้");
    }
  }
  /** the pose model (about 5.5 MB) is fetched only when a clothes item is picked and a picture is on screen */
  function loadPose() {
    if (pose || state.pose.engine) return Promise.resolve();
    if (flag("fakepose") && typeof W.__LQ_FAKE_POSE === "function") { state.pose.engine = "fake"; return Promise.resolve(); }
    if (posePromise) return posePromise;
    state.pose.loading = true;
    posePromise = (async () => {
      try {
        const { PoseLandmarker } = await fileset();
        pose = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: abs(POSE_MODEL), delegate: "CPU" },
          runningMode: "VIDEO", numPoses: 2, outputSegmentationMasks: false });
        state.pose.engine = "mediapipe";
      } catch (e) { console.warn("pose landmarker", e); state.pose.engine = "none"; state.err = String((e && e.message) || e); }
      state.pose.loading = false; poseKey = "";
    })();
    return posePromise;
  }
  let lastTs = 0;
  const stamp = ts => { lastTs = Math.max(lastTs + 1, Math.round(ts)); return lastTs; }; // MediaPipe VIDEO mode needs rising times
  const source = () => (state.mode === "photo" ? photo : state.mode === "camera" && video.videoWidth ? video : null);
  let faceCache = { gen: -1, F: [] };
  function faces(ts) {
    if (state.engine === "fake") return [W.__LQ_FAKE_LM()];
    if (!lm) return [];
    if (state.mode === "photo" && faceCache.gen === photoGen) return faceCache.F;
    try {
      const r = lm.detectForVideo(source(), stamp(ts)), F = (r && r.faceLandmarks) || [];
      if (state.mode === "photo") faceCache = { gen: photoGen, F };
      return F;
    } catch (e) { console.warn(e); return []; }
  }
  function poses(ts) {
    if (state.pose.engine === "fake") return W.__LQ_FAKE_POSE() || [];
    if (!pose) return [];
    try { const r = pose.detectForVideo(source(), stamp(ts)); return (r && r.landmarks) || []; }
    catch (e) { console.warn("pose", e); state.pose.engine = "none"; return []; } // e.g. no GL context: tops use the selfie-mask fit
  }

  /* ---------- clothes from the pose: warped cut-outs on one layer ---------- */
  const poseLayer = document.createElement("canvas"), px2 = poseLayer.getContext("2d"), tmp = document.createElement("canvas"), tx2 = tmp.getContext("2d");
  let poseKey = "", poseJob = null, poseOn = false, placedPose = {}, smooth = null;
  const wornPose = () => POSE_ORDER.filter(c => state.worn[c]);
  const isPoint = (k, v) => v && typeof v === "object" && "x" in v && k !== "across" && k !== "down";
  function smoothBody(b) {
    // the camera only: a light running average so the garment does not jitter; reset on a jump (another person, a step)
    if (state.mode !== "camera" || !smooth || Math.abs(smooth.B - b.B) > .25 * b.B) { smooth = b; return b; }
    const out = Object.assign({}, b);
    for (const [k, v] of Object.entries(b)) if (isPoint(k, v) && smooth[k]) out[k] = { x: .5 * v.x + .5 * smooth[k].x, y: .5 * v.y + .5 * smooth[k].y };
    out.B = .5 * b.B + .5 * smooth.B; smooth = out; return out;
  }
  function updatePose(ts) {
    const cats = wornPose();
    if (!cats.length || !(state.pose.engine === "fake" || state.pose.engine === "mediapipe")) { poseOn = false; placedPose = {}; state.pose.n = 0; return; }
    const key = photoGen + "|" + cats.map(c => state.worn[c].id).join(",") + "|" + cv.width + "x" + cv.height;
    if (state.mode === "photo" ? key === poseKey : poseJob) return;
    if (state.mode === "camera") poseJob = setTimeout(() => { poseJob = null; }, 330);
    const P = poses(ts), one = TO.poseFor(P);
    state.pose.n = P.length; poseKey = key;
    if (!one) { poseOn = false; placedPose = {}; state.pose.reason = P.length > 1 ? "many" : "none"; return; }
    const raw = TO.bodyAnchors(one, cv.width, cv.height);
    if (!raw || !raw.ok) { poseOn = false; placedPose = {}; state.pose.reason = (raw && raw.reason) || "none"; return; }
    const body = smoothBody(raw);
    poseLayer.width = cv.width; poseLayer.height = cv.height; px2.clearRect(0, 0, cv.width, cv.height);
    tmp.width = cv.width; tmp.height = cv.height;
    placedPose = {}; state.pose.reason = "";
    for (const cat of cats) {
      const g = state.worn[cat], r = TO.garmentTargets(cat, body, g.anchors);
      if (!r.ok) { if (!state.pose.reason) state.pose.reason = r.reason; continue; }
      const tw = SC.templateWarpTo(g.anchors, r.targets), xs = r.targets.map(t => t.x), ys = r.targets.map(t => t.y), pad = .25 * body.B;
      const box = { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
      const out = SC.warpRGBA(g.px, g.img.width, g.img.height, cv.width, cv.height, tw.inv, { step: 8, box });
      tx2.putImageData(new ImageData(out, cv.width, cv.height), 0, 0); px2.drawImage(tmp, 0, 0);
      placedPose[cat] = { cat, B: body.B, targets: Object.fromEntries(r.targets.map(t => [t.k, { x: t.x, y: t.y }])) };
    }
    poseOn = Object.keys(placedPose).length > 0;
  }

  /* ---------- tops without the pose engine: per-point fit on the person's silhouette (studio-core, item 24) ---------- */
  const work = document.createElement("canvas"), wx = work.getContext("2d", { willReadFrequently: true });
  const topLayer = document.createElement("canvas"), tx = topLayer.getContext("2d");
  let topKey = "";
  function updateTop(A) {
    const g = state.worn.tops || state.worn.outerwear || state.worn.dresses;
    if (!g || !seg || !A || topJob || !g.anchors || g.anchors.length < 7) return;
    topJob = setTimeout(() => { topJob = null; }, 330);
    const k = 240 / cv.width, w = 240, h = Math.round(cv.height * k);
    work.width = w; work.height = h; wx.drawImage(source(), 0, 0, w, h);
    let alpha;
    try {
      const r = seg.segmentForVideo(work, performance.now()), m = r.confidenceMasks && r.confidenceMasks[0];
      if (!m) return;
      const a = m.getAsFloat32Array(); alpha = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alpha[y * w + x] = a[Math.min(m.height - 1, Math.floor(y * m.height / h)) * m.width + Math.min(m.width - 1, Math.floor(x * m.width / w))];
      if (r.close) r.close();
    } catch (e) { console.warn(e); return; }
    const f0 = TO.faceForStudio(A), face = { ...f0, cx: f0.cx * k, chinX: f0.chinX * k, chinY: f0.chinY * k, fw: f0.fw * k, eyeY: f0.eyeY * k };
    const Fm = SC.measureShoulders(alpha, w, h, face, {}), fit = SC.fitFromTargets({ chin: Fm.chin, l: Fm.l, r: Fm.r });
    const pt = SC.personTargets(g.anchors, fit, alpha, w, h, face, { side: Fm.side });
    const targets = pt.targets.map(t => ({ x: t.x / k, y: t.y / k, k: t.k })), tw = SC.templateWarpTo(g.anchors, targets);
    const xs = targets.map(t => t.x), ys = targets.map(t => t.y), pad = fit.s / k;
    const box = { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
    const out = SC.warpRGBA(g.px, g.img.width, g.img.height, cv.width, cv.height, tw.inv, { step: 8, box });
    topLayer.width = cv.width; topLayer.height = cv.height; tx.putImageData(new ImageData(out, cv.width, cv.height), 0, 0);
    topKey = g.id; state.top = { measured: pt.targets.filter(t => t.src === "measured").length };
  }

  /* ---------- drawing ---------- */
  function drawItem(p, img) {
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
    if (p.cat === "glasses") cx.drawImage(img, -p.w / 2, -p.h / 2, p.w, p.h);
    else if (p.cat === "hats") cx.drawImage(img, -p.w / 2, -p.h * .86, p.w, p.h); // brim line ~86 % down the drawing
    else cx.drawImage(img, -p.w / 2, 0, p.w, p.h); // earrings / necklaces hang from the point
    cx.restore();
  }
  const POSE_MSG = {
    many: ["to.st.many", "พบมากกว่าหนึ่งคนในภาพ ลองทีละคน"],
    none: ["to.st.noBody", "ยังไม่พบร่างกาย หันหน้าเข้ากล้องให้เห็นตั้งแต่ศีรษะถึงสะโพก"],
    side: ["to.st.side", "หันหน้าตรงเข้ากล้อง ตอนนี้รองรับเฉพาะภาพหน้าตรง"],
    shoulders: ["to.st.body", "ให้เห็นไหล่และสะโพกในภาพ"], hips: ["to.st.body", "ให้เห็นไหล่และสะโพกในภาพ"],
    knees: ["to.st.knees", "ถอยห่างอีกนิดให้เห็นถึงเข่า สำหรับชุดเดรสและกระโปรง"],
    ankles: ["to.st.ankles", "ถอยห่างอีกนิดให้เห็นถึงข้อเท้า สำหรับกางเกงขายาว"],
    anchors: ["to.st.noAnchors", "หาขอบของสินค้านี้ไม่พบ ใช้ภาพสินค้าที่ตัดพื้นหลังแล้ว"]
  };
  function showStatus(F, A, cats) {
    const top = state.worn.tops || state.worn.outerwear || state.worn.dresses;
    if (F.length > 1 || (cats.length && state.pose.n > 1)) status("to.st.many", "พบมากกว่าหนึ่งคนในภาพ ลองทีละคน");
    else if (cats.length && state.pose.loading) status("to.st.poseLoading", "กำลังโหลดตัวหาจุดบนร่างกายบนเครื่องนี้ (ครั้งแรกประมาณ 6 MB)...");
    else if (cats.length && state.pose.engine === "none" && !top) {
      status("to.st.noPose", "เครื่องนี้เปิดตัวหาจุดบนร่างกายไม่ได้ (ต้องใช้เบราว์เซอร์ที่รองรับ WebGL) จึงวางกระโปรงและกางเกงไม่ได้");
    } else if (cats.length && state.pose.reason && POSE_MSG[state.pose.reason]) status(...POSE_MSG[state.pose.reason]);
    else if (!cats.length && !A && state.engine) status("to.st.noFace", "ยังไม่พบใบหน้า หันหน้าเข้ากล้องในที่สว่าง");
    else if (state.mode === "photo") status("to.st.photoOk", "กำลังแสดงภาพจำลองบนรูปที่เลือก รูปอยู่บนเครื่องนี้เท่านั้น ไม่ส่งและไม่เก็บ");
    else status("to.st.ok", "กำลังแสดงภาพจำลองบนเครื่องนี้ ไม่มีการส่งหรือเก็บภาพ");
  }
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    const S = source(); if (!S) return;
    const sw = state.mode === "photo" ? S.width : video.videoWidth, sh = state.mode === "photo" ? S.height : video.videoHeight;
    if (cv.width !== sw || cv.height !== sh) { cv.width = sw; cv.height = sh; poseKey = ""; }
    cx.drawImage(S, 0, 0, cv.width, cv.height);
    const F = faces(ts); state.faces = F.length; state.frames++;
    const A = TO.anchorsFor(F, cv.width, cv.height); // more than one face: no face item is drawn
    const cats = wornPose();
    if (cats.length && !state.pose.engine && !state.pose.loading) loadPose();
    updatePose(ts);
    $("#toSnap").disabled = F.length > 1 || state.pose.n > 1;
    showStatus(F, A, cats);
    if (poseOn) cx.drawImage(poseLayer, 0, 0);
    else if (state.pose.engine === "none" && A) {
      updateTop(A);
      const g = state.worn.tops || state.worn.outerwear || state.worn.dresses;
      if (g && topKey === g.id && topLayer.width === cv.width) cx.drawImage(topLayer, 0, 0);
    }
    let placed = null;
    if (A) for (const cat of FACE_CATS) {
      const it = state.worn[cat]; if (!it) continue;
      const p = TO.place(cat, A, { aspect: it.aspect }), list = Array.isArray(p) ? p : [p];
      list.forEach(q => q && drawItem(q, it.img));
      if (state.last === cat) placed = { ...list[0] };
    }
    if (state.last && TO.POSE_CATS.includes(state.last)) placed = placedPose[state.last] || null;
    state.placed = placed;
  }

  /** The current picture with the preview mark burned in (TO.stamp). Returns {mark, w, h, canvas}. */
  function snapshot() {
    const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height;
    const x = c.getContext("2d"); x.drawImage(cv, 0, 0); TO.stamp(x, c.width, c.height);
    return { mark: TO.MARK, w: c.width, h: c.height, canvas: c };
  }
  W.__tryon = { state, snapshot: () => { const s = snapshot(); return { mark: s.mark, w: s.w, h: s.h }; } };

  /* ---------- controls: consent first, then the camera or one photo from this device ---------- */
  const consent = /** @type {HTMLInputElement} */ ($("#toConsent")), photoIn = /** @type {HTMLInputElement} */ ($("#toPhoto"));
  const start = /** @type {HTMLButtonElement} */ ($("#toStart")), photoBtn = $("#toPhotoLabel");
  const syncConsent = () => {
    start.disabled = !consent.checked || state.camera; photoIn.disabled = !consent.checked;
    photoBtn.classList.toggle("is-disabled", !consent.checked); photoBtn.setAttribute("aria-disabled", String(!consent.checked));
  };
  consent.addEventListener("change", syncConsent);
  const running = () => { $("#toSnap").disabled = false; $("#toStop").disabled = false; $("#toConsentCard").classList.add("done"); };
  function clearPicture() {
    cancelAnimationFrame(raf); if (cam) cam.stop(); state.camera = false; state.mode = ""; photo = null; photoGen++;
    poseOn = false; placedPose = {}; smooth = null; state.placed = null; state.pose.n = 0;
    $("#toSnap").disabled = true; $("#toStop").disabled = true; cx.clearRect(0, 0, cv.width, cv.height);
  }
  start.addEventListener("click", async () => {
    if (!consent.checked) return; // the camera never opens without the consent tick
    if (state.mode === "photo") clearPicture();
    start.disabled = true; status("to.st.opening", "กำลังเปิดกล้องบนเครื่องนี้...");
    try {
      if (!cam) cam = W.LQCam.create(video, { facing: "user", ideal: { width: 640, height: 480 } });
      await cam.start(); await video.play().catch(() => {});
      state.camera = true; state.mode = "camera"; running();
      await loadFace();
      if (wornPose().length) loadPose();
      cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    } catch (e) {
      console.warn(e); start.disabled = false;
      $("#toStatus").textContent = W.LQCam && W.LQCam.errorText ? W.LQCam.errorText(e) : T("to.st.camErr", "เปิดกล้องไม่ได้");
    }
  });
  photoIn.addEventListener("change", async () => {
    const f = photoIn.files && photoIn.files[0];
    photoIn.value = ""; // the page keeps no reference to the file
    if (!consent.checked || !f) return; // a photo is read only after the consent tick
    if (!/^image\//.test(f.type)) { status("to.st.photoErr", "เปิดรูปนี้ไม่ได้ ลองรูปอื่น (JPG หรือ PNG)"); return; }
    try {
      const bmp = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
      if (cam) cam.stop();
      state.camera = false; state.mode = "photo"; photo = c; photoGen++; poseKey = ""; smooth = null; running(); syncConsent();
      await loadFace();
      if (wornPose().length) loadPose();
      cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    } catch (e) { console.warn(e); status("to.st.photoErr", "เปิดรูปนี้ไม่ได้ ลองรูปอื่น (JPG หรือ PNG)"); }
  });
  $("#toStop").addEventListener("click", () => { clearPicture(); syncConsent(); status("to.st.idle", "ยังไม่ได้เปิดกล้องหรือเลือกรูป"); });
  $("#toClear").addEventListener("click", () => { state.worn = {}; state.last = null; state.placed = null; poseKey = ""; poseOn = false; renderItems(); });
  $("#toSnap").addEventListener("click", () => {
    // saved to this device only, by the person's own action; the file carries the burned-in mark and says so in its name
    snapshot().canvas.toBlob(b => {
      if (!b) return;
      const a = document.createElement("a"), u = URL.createObjectURL(b);
      a.href = u; a.download = "lensiq-tryon-preview.jpg"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    }, "image/jpeg", .9);
  });
  W.addEventListener("lq-lang", () => renderItems());
  syncConsent();
  loadCatalog();
})();
