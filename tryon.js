/* tryon.js — Try-On MVP customer page (tryon.html; docs/TRYON-DESIGN.md T4 subset). Everything runs on this device:
 *  - live camera only (LQCam / getUserMedia). There is no file input, no drop and no paste: the page cannot take a photo
 *    of someone else from disk. The camera opens only after the consent tick.
 *  - face-anchored items (glasses, hats, earrings, necklaces): MediaPipe Face Landmarker (vendored, no facial-movement
 *    model) -> LQTryOn.faceAnchors / place. Pose-anchored tops: MediaPipe selfie segmenter mask -> studio-core
 *    measureShoulders -> personTargets -> templateWarpTo (the studio's per-point garment fit, item 24), ~3 times a second.
 *  - nothing is sent or stored: the only requests are GET /v1/tryon/catalog and the GET of each catalogue image (garment
 *    cut-outs). A snapshot is saved only when the user presses the button, and carries the burned-in preview mark.
 * Test seams: ?demo=1 (built-in drawn items, no backend), ?fakelm=1 (window.__LQ_FAKE_LM() -> 478 normalised points).
 * Test hook: window.__tryon = {state, snapshot()}.
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), TO = W.LQTryOn, SC = W.StudioCore, $ = s => document.querySelector(s);
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m));
  const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
  const flag = n => new RegExp("[?&]" + n + "=1(&|$)").test(location.search);
  const abs = p => new URL(p, location.href).href;
  const state = { camera: false, frames: 0, faces: 0, engine: "", seg: "", items: [], worn: {}, last: null, placed: null, source: "demo", err: "" };
  const cv = /** @type {HTMLCanvasElement} */ ($("#toCanvas")), cx = cv.getContext("2d"), video = /** @type {HTMLVideoElement} */ ($("#toVideo"));
  let cam = null, lm = null, seg = null, raf = 0, topJob = null;
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
      // only what this page can draw (no skirts / trousers yet)
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
      b.type = "button"; b.className = "to-item"; b.dataset.item = it.id; b.dataset.cat = it.category; b.setAttribute("role", "listitem");
      b.setAttribute("aria-pressed", String(!!(state.worn[it.category] && state.worn[it.category].id === it.id)));
      b.textContent = nameOf(it);
      b.addEventListener("click", () => wear(it));
      box.appendChild(b);
    }
  }
  async function wear(it) {
    const cur = state.worn[it.category];
    if (cur && cur.id === it.id) { delete state.worn[it.category]; state.last = null; renderItems(); return; }
    try {
      const img = await imageFor(it), entry = { id: it.id, cat: it.category, img, aspect: img.height / img.width };
      if (it.category === "tops" || it.category === "outerwear" || it.category === "dresses") {
        const px = img.getContext("2d").getImageData(0, 0, img.width, img.height).data, a = new Float32Array(img.width * img.height);
        for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] / 255;
        entry.px = px; entry.anchors = SC.templateAnchors(a, img.width, img.height);
        if (!entry.anchors) { status("to.st.noAnchors", "หาคอและไหล่ของเสื้อตัวนี้ไม่พบ ใช้ภาพเสื้อที่ตัดพื้นหลังแล้ว"); return; }
      }
      state.worn[it.category] = entry; state.last = it.category; renderItems();
    } catch (e) { console.warn(e); status("to.st.imgErr", "เปิดภาพสินค้านี้ไม่ได้"); }
  }

  /* ---------- engines (on device) ---------- */
  async function loadFace() {
    if (flag("fakelm") && typeof W.__LQ_FAKE_LM === "function") { state.engine = "fake"; return; }
    try {
      const { FilesetResolver, FaceLandmarker, ImageSegmenter } = await import(abs("vendor/mediapipe/vision_bundle.mjs"));
      const files = await FilesetResolver.forVisionTasks(abs("vendor/mediapipe/wasm"));
      lm = await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: abs("vendor/models/face-landmarker/face_landmarker_lm.task"), delegate: "CPU" },
        runningMode: "VIDEO", numFaces: 2, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false });
      state.engine = "mediapipe";
      try {
        seg = await ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: abs("vendor/models/selfie_segmenter.tflite"), delegate: "CPU" },
          runningMode: "VIDEO", outputConfidenceMasks: true, outputCategoryMask: false });
        state.seg = "selfie";
      } catch (e) { console.warn("segmenter", e); state.seg = ""; }
    } catch (e) {
      console.warn("face landmarker", e); state.engine = ""; state.err = String((e && e.message) || e);
      status("to.st.noEngine", "เครื่องนี้เปิดตัวหาจุดบนใบหน้าไม่ได้ (ต้องใช้เบราว์เซอร์ที่รองรับ WebGL) ยังเห็นภาพกล้องได้ แต่วางสินค้าไม่ได้");
    }
  }
  function faces(ts) {
    if (state.engine === "fake") return [W.__LQ_FAKE_LM()];
    if (!lm) return [];
    try { const r = lm.detectForVideo(video, ts); return (r && r.faceLandmarks) || []; } catch (e) { console.warn(e); return []; }
  }

  /* ---------- tops: per-point fit on the person's silhouette (studio-core), refreshed ~3 times a second ---------- */
  const work = document.createElement("canvas"), wx = work.getContext("2d", { willReadFrequently: true });
  const topLayer = document.createElement("canvas"), tx = topLayer.getContext("2d");
  let topKey = "";
  function updateTop(A) {
    const g = state.worn.tops || state.worn.outerwear || state.worn.dresses;
    if (!g || !seg || !A || topJob) return;
    topJob = setTimeout(() => { topJob = null; }, 330);
    const k = 240 / cv.width, w = 240, h = Math.round(cv.height * k);
    work.width = w; work.height = h; wx.drawImage(video, 0, 0, w, h);
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
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!video.videoWidth) return;
    if (cv.width !== video.videoWidth || cv.height !== video.videoHeight) { cv.width = video.videoWidth; cv.height = video.videoHeight; }
    cx.drawImage(video, 0, 0, cv.width, cv.height);
    const F = faces(ts); state.faces = F.length; state.frames++;
    const A = TO.anchorsFor(F, cv.width, cv.height); // more than one face: nothing is drawn
    $("#toSnap").disabled = F.length > 1;
    if (F.length > 1) status("to.st.many", "พบมากกว่าหนึ่งคนในภาพ ลองทีละคน");
    else if (!A && state.engine) status("to.st.noFace", "ยังไม่พบใบหน้า หันหน้าเข้ากล้องในที่สว่าง");
    else if (A) status("to.st.ok", "กำลังแสดงภาพจำลองบนเครื่องนี้ ไม่มีการส่งหรือเก็บภาพ");
    if (!A) return;
    updateTop(A);
    const g = state.worn.tops || state.worn.outerwear || state.worn.dresses;
    if (g && topKey === g.id && topLayer.width === cv.width) cx.drawImage(topLayer, 0, 0);
    for (const cat of ["necklaces", "earrings", "glasses", "hats"]) {
      const it = state.worn[cat]; if (!it) continue;
      const p = TO.place(cat, A, { aspect: it.aspect }), list = Array.isArray(p) ? p : [p];
      list.forEach(q => q && drawItem(q, it.img));
      if (state.last === cat) state.placed = { ...list[0] };
    }
    if (g && state.last === g.cat) state.placed = { cat: g.cat, measured: state.top ? state.top.measured : 0 };
  }

  /** The current frame with the preview mark burned in (TO.stamp). Returns {mark, w, h, canvas}. */
  function snapshot() {
    const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height;
    const x = c.getContext("2d"); x.drawImage(cv, 0, 0); TO.stamp(x, c.width, c.height);
    return { mark: TO.MARK, w: c.width, h: c.height, canvas: c };
  }
  W.__tryon = { state, snapshot: () => { const s = snapshot(); return { mark: s.mark, w: s.w, h: s.h }; } };

  /* ---------- controls ---------- */
  const consent = /** @type {HTMLInputElement} */ ($("#toConsent")), start = /** @type {HTMLButtonElement} */ ($("#toStart"));
  consent.addEventListener("change", () => { start.disabled = !consent.checked; });
  start.addEventListener("click", async () => {
    if (!consent.checked) return; // the camera never opens without the consent tick
    start.disabled = true; status("to.st.opening", "กำลังเปิดกล้องบนเครื่องนี้...");
    try {
      if (!cam) cam = W.LQCam.create(video, { facing: "user", ideal: { width: 640, height: 480 } });
      await cam.start(); await video.play().catch(() => {});
      state.camera = true; $("#toSnap").disabled = false; $("#toStop").disabled = false; $("#toConsentCard").classList.add("done");
      await loadFace();
      cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    } catch (e) {
      console.warn(e); start.disabled = false;
      $("#toStatus").textContent = W.LQCam && W.LQCam.errorText ? W.LQCam.errorText(e) : T("to.st.camErr", "เปิดกล้องไม่ได้");
    }
  });
  $("#toStop").addEventListener("click", () => {
    cancelAnimationFrame(raf); if (cam) cam.stop(); state.camera = false;
    $("#toSnap").disabled = true; $("#toStop").disabled = true; start.disabled = !consent.checked; cx.clearRect(0, 0, cv.width, cv.height);
    status("to.st.idle", "ยังไม่ได้เปิดกล้อง");
  });
  $("#toClear").addEventListener("click", () => { state.worn = {}; state.last = null; state.placed = null; renderItems(); });
  $("#toSnap").addEventListener("click", () => {
    // saved to this device only, by the user's own action; the file carries the burned-in mark and says so in its name
    snapshot().canvas.toBlob(b => {
      if (!b) return;
      const a = document.createElement("a"), u = URL.createObjectURL(b);
      a.href = u; a.download = "lensiq-tryon-preview.jpg"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    }, "image/jpeg", .9);
  });
  W.addEventListener("lq-lang", () => renderItems());
  loadCatalog();
})();
