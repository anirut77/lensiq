/* lensiq-pc-run.js — LQPCRun: the on-device runtime of Product Check (P2). Browser only; the pure parts are in
 * lensiq-pc.js (LQPC, unit-tested). Everything here runs on this device: nothing is uploaded, nothing is stored.
 *
 *   ocr(canvas, {script}) -> {boxes, lines:[{text, conf, box}], text, ms:{det, rec, total}}
 *       PP-OCRv5 mobile det (DB) -> boxes in reading order -> per-script PP-OCRv5 mobile rec (th | cjk | ko | latin) + CTC
 *   detect(canvas) -> {boxes, ms} · recognize(canvas, box, script) -> {text, conf}
 *   barcodes(source, {engine: "auto"|"native"|"zxing"}) -> {engine, codes:[{rawValue, format}]}
 *       native BarcodeDetector first, then the zxing-wasm ponyfill (self-hosted vendor/zxing/, never a CDN; CSP stays 'self')
 *   faceCheck(frameCanvas, cropRect) -> LQPC.faceGate(...) result + {runs}   BlazeFace short range (MediaPipe FaceDetector
 *       from vendor/mediapipe) on the whole frame, 2 x 2 overlapping tiles of it (small / background faces) AND the crop;
 *       fails closed when the model does not load or cannot run (no WebAssembly, a load or run error; WebGL is NOT required:
 *       CI's Chrome has no WebGL at all and BlazeFace still runs there)
 *       Kept as an API; the upload path does not block on a face any more (owner decision 2026-11-10), it blurs:
 *   uploadCanvas(frame, crop, maxSide) -> {canvas, scale}   the crop at upload resolution (long side <= 1,024 px)
 *   faceRuns(frame, crop, {maxSide, tiles}) -> {loaded, error?, runs, upload, scale, crop}   BlazeFace on the frame, 2 x 2
 *       tiles and the upload image at upload resolution (boxes in frame pixels) -> LQPC.faceBlurPlan
 *   faceBlur(canvas, regions) -> n   irreversible blur + pixelate of each region, in place
 *   quality(canvas, boxes) -> LQPC.assess(...)
 *   loaded() -> {det, rec:{th, cjk, ko, latin}, zxing, face}  (what has been downloaded in this tab)
 * Models load lazily (first use), one script at a time; ONNX Runtime Web WASM, one thread, no WebGL.
 * Test seams (localhost only): ?fakeface -> window.__LQ_FAKE_FACE(scope) returns [{score}] instead of running BlazeFace;
 * ?noface -> the face models are treated as missing (fail-closed test); ?pcbar=zxing|native forces a barcode engine;
 * ?fakeocr -> window.__LQ_FAKE_PCOCR(canvas) returns the lines read (strings or {text, conf}) and window.__LQ_FAKE_PCBAR(canvas)
 * the barcodes, instead of the models (live-scan rule tests; each only when the page defines it).
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), P = W.LQPC;
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const flag = f => local && new URLSearchParams(location.search).has(f);
  const flagVal = f => (local ? new URLSearchParams(location.search).get(f) : null);
  const abs = p => new URL(p, location.href).href;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const loadScript = src => new Promise((res,
    rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
  const state = { det: false, rec: {}, zxing: false, face: false };

  /* ---------- ONNX Runtime ---------- */
  let ortP = null;
  function ort() {
    if (!ortP) ortP = (async () => {
      if (!W.ort) await loadScript("vendor/ort/ort.wasm.min.js");
      const o = W.ort;
      o.env.wasm.wasmPaths = abs("vendor/ort/");
      o.env.wasm.numThreads = 1;
      try { o.env.logLevel = "error"; } catch { /* older runtime */ }
      return o;
    })();
    ortP.catch(() => { ortP = null; });
    return ortP;
  }
  const sessions = {};
  function session(url, label, bytes) {
    if (!sessions[url]) {
      sessions[url] = (async () => {
        const o = await ort();
        const note = W.LQModels && W.LQModels.loading ? W.LQModels.loading({ label, mb: Math.round(bytes / 1048576 * 10) / 10, url }) : null;
        try {
          const s = await o.InferenceSession.create(abs(url), { executionProviders: ["wasm"], graphOptimizationLevel: "all", logSeverityLevel: 3 });
          if (note) note.done();
          return s;
        } catch (e) { if (note) note.fail(); throw e; }
      })();
      sessions[url].catch(() => { delete sessions[url]; });
    }
    return sessions[url];
  }
  const dicts = {};
  function dict(url) {
    if (!dicts[url]) { dicts[url] = fetch(url).then(r => { if (!r.ok) throw new Error("dict " + r.status); return r.text(); }).then(P.parseDict); dicts[url].catch(() => { delete dicts[url]; }); }
    return dicts[url];
  }
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
  const ctx = c => /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));

  /* ---------- test seam (?fakeocr, localhost only) ---------- */
  const fakeOcr = () => flag("fakeocr") && typeof W.__LQ_FAKE_PCOCR === "function";
  const fakeBox = src => ({ x0: Math.round(src.width * 0.05), y0: Math.round(src.height * 0.05), x1: Math.round(src.width * 0.95), y1: Math.round(src.height * 0.95), score: 1 });

  /* ---------- text detection (PP-OCRv5 mobile det, DB head) ---------- */
  async function detect(src, o = {}) {
    if (fakeOcr()) { await Promise.resolve(); return { boxes: [fakeBox(src)], ms: 0 }; }
    const t0 = now(), s = await session(P.DET.model, "Text finder (PP-OCRv5 det)", P.DET.bytes), onnx = W.ort;
    state.det = true;
    const sw = src.width, sh = src.height, lim = o.maxSide || 960;
    // DetResizeForTest(resize_long = 960): keep the aspect, both sides a multiple of 32
    const k = Math.min(1, lim / Math.max(sw, sh));
    const w = Math.max(32, Math.round((sw * k) / 32) * 32), h = Math.max(32, Math.round((sh * k) / 32) * 32);
    const c = canvas(w, h), x = ctx(c);
    x.drawImage(src, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, n = w * h, buf = new Float32Array(3 * n);
    // DecodeImage BGR, then NormalizeImage with the ImageNet mean / std applied in that (BGR) channel order, CHW
    const M = [0.485, 0.456, 0.406], S = [0.229, 0.224, 0.225];
    for (let i = 0; i < n; i++) {
      buf[i] = (d[4 * i + 2] / 255 - M[0]) / S[0];
      buf[n + i] = (d[4 * i + 1] / 255 - M[1]) / S[1];
      buf[2 * n + i] = (d[4 * i] / 255 - M[2]) / S[2];
    }
    const out = await s.run({ [s.inputNames[0]]: new onnx.Tensor("float32", buf, [1, 3, h, w]) });
    const t = out[s.outputNames[0]], mh = t.dims[2], mw = t.dims[3];
    const boxes = P.scaleBoxes(P.dbBoxes(t.data, mw, mh, o.db || {}), sw / mw, sh / mh, sw, sh);
    return { boxes, ms: now() - t0 };
  }

  /* ---------- recognition (per script) ---------- */
  async function rec(script) {
    const m = P.SCRIPTS[script] || P.SCRIPTS[P.DEFAULT_SCRIPT];
    const [s, dct] = await Promise.all([session(m.model, `Text reader (PP-OCRv5 ${script})`, m.bytes), dict(m.dict)]);
    state.rec[script] = true;
    return { s, dct };
  }
  /** one text box -> {text, conf}; tall boxes (h >= 1.5 w) are read rotated, as PaddleOCR does */
  async function recognize(src, b, script) {
    const { s, dct } = await rec(script), onnx = W.ort;
    const rot = b.angle != null, bw = Math.max(1, rot ? b.rw : b.x1 - b.x0), bh = Math.max(1, rot ? b.rh : b.y1 - b.y0), tall = !rot && bh >= 1.5 * bw;
    const H = 48, ratio = tall ? bh / bw : bw / bh;
    const Wd = Math.max(16, Math.min(3200, Math.ceil(H * ratio)));
    const c = canvas(Wd, H), x = ctx(c);
    if (rot) { // tilted line: sample along its rotated rectangle (PaddleOCR crops the min-area box the same way)
      x.fillStyle = "#fff"; x.fillRect(0, 0, Wd, H);
      x.translate(Wd / 2, H / 2); x.scale(Wd / bw, H / bh); x.rotate(-b.angle); x.translate(-b.cx, -b.cy);
      x.drawImage(src, 0, 0);
      x.setTransform(1, 0, 0, 1, 0, 0);
    } else if (tall) { x.translate(0, H); x.rotate(-Math.PI / 2); x.drawImage(src, b.x0, b.y0, bw, bh, 0, 0, H, Wd); }
    else x.drawImage(src, b.x0, b.y0, bw, bh, 0, 0, Wd, H);
    const d = x.getImageData(0, 0, Wd, H).data, n = Wd * H, buf = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) { // BGR, (v / 255 - 0.5) / 0.5
      buf[i] = d[4 * i + 2] / 127.5 - 1; buf[n + i] = d[4 * i + 1] / 127.5 - 1; buf[2 * n + i] = d[4 * i] / 127.5 - 1;
    }
    const out = await s.run({ [s.inputNames[0]]: new onnx.Tensor("float32", buf, [1, 3, H, Wd]) });
    const t = out[s.outputNames[0]], [, T, C] = t.dims;
    const r = P.ctcDecode(t.data, T, C, dct);
    return { text: r.text, conf: r.conf };
  }
  /** full OCR of a canvas: boxes, lines in reading order (words of one line joined with a space), timings */
  async function ocr(src, o = {}) {
    const script = P.SCRIPTS[o.script] ? o.script : P.DEFAULT_SCRIPT, t0 = now();
    if (fakeOcr()) {
      await Promise.resolve();
      const box = fakeBox(src), lines = (W.__LQ_FAKE_PCOCR(src) || []).map(l => (typeof l === "string" ? { text: l, conf: 0.9 } : { text: String(l.text || ""), conf: l.conf == null ? 0.9 : l.conf }))
        .filter(l => l.text.trim()).map(l => ({ ...l, boxes: [box] }));
      return { script, boxes: [box], lines, text: lines.map(l => l.text).join("\n"), ms: { det: 0, rec: 0, total: now() - t0 } };
    }
    const det = await detect(src, o);
    const t1 = now(), lines = [];
    for (const line of P.sortLines(det.boxes).slice(0, o.maxLines || 80)) {
      const parts = [];
      for (const b of line) { const r = await recognize(src, b, script); if (r.text.trim()) parts.push({ ...r, box: b }); }
      if (parts.length) {
        lines.push({ text: parts.map(p => p.text.trim()).join(" "), conf: Math.min(...parts.map(p => p.conf)), boxes: parts.map(p => p.box) });
        // progressive reading (live scan, stream F): the lines read so far, so the checklist can tick before the last line
        if (o.onLine) { try { o.onLine(lines.slice()); } catch { /* the caller's problem, never the OCR's */ } }
      }
    }
    const t2 = now();
    return { script, boxes: det.boxes, lines, text: lines.map(l => l.text).join("\n"), ms: { det: t1 - t0, rec: t2 - t1, total: t2 - t0 } };
  }

  /* ---------- barcodes ---------- */
  const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "data_matrix", "qr_code"];
  let zxP = null;
  function zxing() {
    if (!zxP) zxP = (async () => {
      if (!W.BarcodeDetectionAPI) await loadScript("vendor/zxing/barcode-detector-ponyfill.js");
      const api = W.BarcodeDetectionAPI;
      // self-hosted wasm: the ponyfill's default would fetch it from a CDN, which the page CSP (connect-src 'self') forbids
      api.prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? abs("vendor/zxing/" + path) : prefix + path) } });
      state.zxing = true;
      return new api.BarcodeDetector({ formats: FORMATS });
    })();
    zxP.catch(() => { zxP = null; });
    return zxP;
  }
  async function barcodes(src, o = {}) {
    if (flag("fakeocr") && typeof W.__LQ_FAKE_PCBAR === "function") {
      await Promise.resolve();
      return { engine: "seam", codes: (W.__LQ_FAKE_PCBAR(src) || []).map(c => ({ rawValue: String(c.rawValue), format: c.format })) };
    }
    const engine = flagVal("pcbar") || o.engine || "auto";
    if (engine !== "zxing" && "BarcodeDetector" in W) {
      try {
        const sup = await W.BarcodeDetector.getSupportedFormats();
        const det = new W.BarcodeDetector({ formats: FORMATS.filter(f => sup.includes(f)) });
        const codes = (await det.detect(src)).map(c => ({ rawValue: String(c.rawValue || ""), format: c.format }));
        if (codes.length || engine === "native") return { engine: "native", codes };
      } catch { if (engine === "native") return { engine: "native", codes: [], error: true }; }
    }
    if (engine === "native") return { engine: "none", codes: [] };
    const det = await zxing();
    const codes = (await det.detect(src)).map(c => ({ rawValue: String(c.rawValue || ""), format: c.format }));
    return { engine: "zxing", codes };
  }

  /* ---------- face gate (BlazeFace short range: frame, 2 x 2 tiles, crop) ---------- */
  let faceP = null;
  function faceModels() {
    if (!faceP) faceP = (async () => {
      if (flag("noface")) throw new Error("face model missing (test)");
      const { FilesetResolver, FaceDetector } = await import(abs("vendor/mediapipe/vision_bundle.mjs"));
      const files = await FilesetResolver.forVisionTasks(abs("vendor/mediapipe/wasm"));
      // short range only: the full-range BlazeFace (2304 anchors) is rejected by this Tasks bundle's graph (896 anchors), so
      // small / background faces are covered by running the short-range model on overlapping tiles instead
      const d = await FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: abs("vendor/models/face-gate/blaze_face_short_range.tflite"), delegate: "CPU" },
        runningMode: "IMAGE", minDetectionConfidence: 0.2 });
      state.face = true;
      return [d];
    })();
    faceP.catch(() => { faceP = null; });
    return faceP;
  }
  /**
   * detections of one canvas -> [{score, box}] with box in FRAME pixels (dx, dy = where this canvas sits in the frame), so a
   * later faceBlur(frame, faces) can use them. A detection without a finite score keeps score null: LQPC.faceGate counts
   * that as a face (never as 0).
   */
  const facesIn = (dets, c, dx = 0, dy = 0) => dets.flatMap(d => (d.detect(c).detections || []).map(x => {
    const raw = x.categories && x.categories[0] ? x.categories[0].score : undefined, b = x.boundingBox;
    return {
      score: typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw * 1000) / 1000 : null,
      box: b ? { x: Math.round(b.originX + dx), y: Math.round(b.originY + dy), w: Math.round(b.width), h: Math.round(b.height) } : null
    };
  }));
  /**
   * faceCheck(frame, crop{x,y,w,h}) -> {allow, reason, maxScore, runs}; any failure -> blocked (fail closed).
   * Kept as an API for other callers; the upload path no longer blocks on a face (owner decision 2026-11-10): it uses
   * faceRuns + LQPC.faceBlurPlan + faceBlur below.
   */
  async function faceCheck(frame, crop) {
    const runs = [];
    if (flag("fakeface") && typeof W.__LQ_FAKE_FACE === "function") {
      for (const scope of ["frame", "crop"]) runs.push({ scope, faces: W.__LQ_FAKE_FACE(scope) || [] });
      return { ...P.faceGate({ loaded: true, runs }), runs };
    }
    let dets;
    try { dets = await faceModels(); } catch (e) { return { ...P.faceGate({ loaded: false }), runs, error: String((e && e.message) || e) }; }
    try {
      runs.push({ scope: "frame", faces: facesIn(dets, frame) });
      const tw = Math.round(frame.width * 0.6), th = Math.round(frame.height * 0.6), tiles = [];
      for (const [tx, ty] of [[0, 0], [frame.width - tw, 0], [0, frame.height - th], [frame.width - tw, frame.height - th]]) {
        const t = canvas(tw, th);
        ctx(t).drawImage(frame, tx, ty, tw, th, 0, 0, tw, th);
        tiles.push(...facesIn(dets, t, tx, ty));
      }
      runs.push({ scope: "tiles", faces: tiles });
      const r = crop || { x: 0, y: 0, w: frame.width, h: frame.height };
      const c = canvas(r.w, r.h);
      ctx(c).drawImage(frame, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      runs.push({ scope: "crop", faces: facesIn(dets, c, r.x, r.y) });
      return { ...P.faceGate({ loaded: true, runs }), runs };
    } catch (e) {
      return { ...P.faceGate({ loaded: true, error: String((e && e.message) || e), runs }), runs, error: String((e && e.message) || e) };
    }
  }

  /* ---------- face blur before upload (owner decision 2026-11-10: blur, never block) ---------- */
  /**
   * uploadCanvas(frame, crop, maxSide=1024) -> {canvas, scale}: the picture that would be sent = the crop, scaled so the long
   * side is at most maxSide (design §8.2). Re-encoding it later (toBlob) drops EXIF.
   */
  function uploadCanvas(frame, crop, maxSide = 1024) {
    const r = crop || { x: 0, y: 0, w: frame.width, h: frame.height }, k = Math.min(1, maxSide / Math.max(r.w, r.h));
    const c = canvas(Math.round(r.w * k), Math.round(r.h * k));
    ctx(c).drawImage(frame, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return { canvas: c, scale: k };
  }
  /**
   * closeView(frame, fill) -> {canvas, ox, oy, k}: the whole frame letterboxed on a grey square (side 640 px) so that it
   * fills `fill` of the side. A face larger than the frame's short side, or cut by the frame edge, is then fully inside the
   * model's view with a margin around it (the close-up pass). Boxes map back with x_frame = (x - ox) / k.
   */
  function closeView(frame, fill) {
    const S = 640, k = (S * fill) / Math.max(frame.width, frame.height), w = Math.round(frame.width * k), h = Math.round(frame.height * k);
    const c = canvas(S, S), x = ctx(c), ox = Math.round((S - w) / 2), oy = Math.round((S - h) / 2);
    x.fillStyle = "#808080"; x.fillRect(0, 0, S, S);
    x.drawImage(frame, 0, 0, frame.width, frame.height, ox, oy, w, h);
    return { canvas: c, ox, oy, k };
  }
  /** faces of the close-up pass, boxes in FRAME pixels (they may reach past the frame edge; faceBlurPlan clamps) */
  function closeFaces(dets, frame, fill) {
    const v = closeView(frame, fill);
    return facesIn(dets, v.canvas).map(f => ({ score: f.score, box: f.box ? { x: Math.round((f.box.x - v.ox) / v.k), y: Math.round((f.box.y - v.oy) / v.k),
      w: Math.round(f.box.w / v.k), h: Math.round(f.box.h / v.k) } : null }));
  }
  /** faceClose(frame, fill) -> {loaded, error?, faces}: the close-up pass alone (measurement: tools/pc-faceblur-eval.mjs) */
  async function faceClose(frame, fill) {
    try { return { loaded: true, faces: closeFaces(await faceModels(), frame, fill) }; } catch (e) { return { loaded: false, error: String((e && e.message) || e), faces: [] }; }
  }
  /**
   * faceRuns(frame, crop, {maxSide=1024, tiles=true, grid=2, overlap=1/3, upscale=1, close=0}) -> {loaded, error?, runs, upload,
   * scale, crop}. BlazeFace on the whole frame, on grid x grid overlapping tiles (when tiles; LQPC.tileRects, optional upscale
   * per tile), on the letterboxed frame (when close > 0: the close-up pass, `close` = share of the view the frame fills) AND
   * on the upload image itself (the crop at upload resolution); every box in FRAME pixels -> LQPC.faceBlurPlan.
   * SAME PICTURE: the frame is copied once at the start, before any await; every pass and the upload image come from that
   * copy, so a picture changed while the detector loads can never be blurred with another picture's faces.
   * loaded = false / error when the detector cannot run (no model, no WebAssembly, any load / run error): faceBlurPlan then
   * answers text only. Test seam ?fakeface: __LQ_FAKE_FACE(scope) for the scopes frame / tiles / close / upload returns
   * [{score, box}] with boxes in frame pixels.
   */
  async function faceRuns(frame0, crop, o = {}) {
    const frame = canvas(frame0.width, frame0.height);
    ctx(frame).drawImage(frame0, 0, 0);
    const grid = o.grid || 2, overlap = o.overlap == null ? 1 / 3 : o.overlap, up2 = o.upscale > 1 ? o.upscale : 1, close = o.close > 0 ? Math.min(1, o.close) : 0;
    const tiles = o.tiles !== false, up = uploadCanvas(frame, crop, o.maxSide || 1024), r = crop ? { ...crop } : { x: 0, y: 0, w: frame.width, h: frame.height };
    const base = { upload: up.canvas, scale: up.scale, crop: r, w: frame.width, h: frame.height };
    const runs = [];
    if (flag("fakeface") && typeof W.__LQ_FAKE_FACE === "function") {
      for (const scope of ["frame", ...(tiles ? ["tiles"] : []), ...(close ? ["close"] : []), "upload"]) runs.push({ scope, faces: W.__LQ_FAKE_FACE(scope) || [] });
      await Promise.resolve(); // the real path awaits the model here; keep the seam asynchronous too
      return { loaded: true, runs, ...base };
    }
    let dets;
    try { dets = await faceModels(); } catch (e) { return { loaded: false, error: String((e && e.message) || e), runs, ...base }; }
    try {
      runs.push({ scope: "frame", faces: facesIn(dets, frame) });
      if (tiles) {
        // grid x grid overlapping tiles (LQPC.tileRects); each tile optionally upscaled before detection, boxes scaled back
        const found = [];
        for (const g of P.tileRects(frame.width, frame.height, grid, overlap)) {
          const t = canvas(Math.round(g.w * up2), Math.round(g.h * up2));
          ctx(t).drawImage(frame, g.x, g.y, g.w, g.h, 0, 0, t.width, t.height);
          found.push(...facesIn(dets, t).map(f => ({ score: f.score, box: f.box ? { x: Math.round(f.box.x / up2 + g.x), y: Math.round(f.box.y / up2 + g.y),
            w: Math.round(f.box.w / up2), h: Math.round(f.box.h / up2) } : null })));
        }
        runs.push({ scope: "tiles", faces: found });
      }
      if (close) runs.push({ scope: "close", faces: closeFaces(dets, frame, close) });
      // the upload image at upload resolution; its boxes go back to frame pixels (/ scale + crop origin)
      const k = up.scale;
      runs.push({ scope: "upload", faces: facesIn(dets, up.canvas).map(f => ({ score: f.score, box: f.box ? { x: Math.round(f.box.x / k + r.x), y: Math.round(f.box.y / k + r.y),
        w: Math.round(f.box.w / k), h: Math.round(f.box.h / k) } : null })) });
      return { loaded: true, runs, ...base };
    } catch (e) {
      return { loaded: true, error: String((e && e.message) || e), runs, ...base };
    }
  }
  /**
   * faceBlur(canvas, regions, {blocks=8}) -> number of regions blurred. IRREVERSIBLE, in place: each region is blurred
   * (canvas filter, where the browser has it) and then pixelated — every block of the region is replaced by its mean colour,
   * at most `blocks` blocks across the longer side (a block is >= 4 px), so the original pixels cannot be recovered.
   */
  function faceBlur(c, regions, o = {}) {
    const x = ctx(c), blocks = o.blocks || 8;
    let n = 0;
    for (const g of regions || []) {
      const rx = Math.max(0, Math.floor(g.x)), ry = Math.max(0, Math.floor(g.y)), rw = Math.min(c.width, Math.ceil(g.x + g.w)) - rx, rh = Math.min(c.height, Math.ceil(g.y + g.h)) - ry;
      if (!(rw > 0 && rh > 0)) continue;
      const b = Math.max(4, Math.ceil(Math.max(rw, rh) / blocks));
      if ("filter" in x) { // 1. blur (ignored where canvas filters are not supported; the pixelation below always runs)
        const t = canvas(rw, rh);
        ctx(t).drawImage(c, rx, ry, rw, rh, 0, 0, rw, rh);
        x.save(); x.beginPath(); x.rect(rx, ry, rw, rh); x.clip(); x.filter = `blur(${Math.max(2, b / 2)}px)`; x.drawImage(t, rx, ry); x.restore();
      }
      const im = x.getImageData(rx, ry, rw, rh), d = im.data; // 2. pixelate: block means
      for (let by = 0; by < rh; by += b) for (let bx = 0; bx < rw; bx += b) {
        const ex = Math.min(rw, bx + b), ey = Math.min(rh, by + b);
        let R = 0, G = 0, B = 0, A = 0, m = 0;
        for (let yy = by; yy < ey; yy++) for (let xx = bx; xx < ex; xx++) { const i = (yy * rw + xx) * 4; R += d[i]; G += d[i + 1]; B += d[i + 2]; A += d[i + 3]; m++; }
        R = Math.round(R / m); G = Math.round(G / m); B = Math.round(B / m); A = Math.round(A / m);
        for (let yy = by; yy < ey; yy++) for (let xx = bx; xx < ex; xx++) { const i = (yy * rw + xx) * 4; d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = A; }
      }
      x.putImageData(im, rx, ry);
      n++;
    }
    return n;
  }

  /* ---------- quality ---------- */
  function quality(src, boxes) {
    const k = Math.min(1, 1280 / Math.max(src.width, src.height)), w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
    const c = canvas(w, h), x = ctx(c);
    x.drawImage(src, 0, 0, w, h);
    const im = x.getImageData(0, 0, w, h);
    return P.assess(im, boxes ? boxes.map(b => ({ x0: b.x0 * k, x1: b.x1 * k, y0: b.y0 * k, y1: b.y1 * k })) : undefined);
  }

  W.LQPCRun = { ocr, detect, recognize, barcodes, faceCheck, uploadCanvas, faceRuns, faceClose, faceBlur, quality, loaded: () => JSON.parse(JSON.stringify(state)) };
})();
