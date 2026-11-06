/* lensiq-detect.js — LQDetect: TF.js backend chain, COCO-SSD loader/decoder and a localhost-only fake-detector seam.
 * Browser: window.LQDetect (needs vendor/face-api.js loaded first for faceapi.tf) · Node: module.exports (pure parts).
 * Never relies on WebGL: with ?cpu or ?nogl, or when no WebGL context exists, the chain is wasm -> cpu.
 *
 * API
 *   tfBackend() -> Promise<'webgl'|'wasm'|'cpu'>   cached; faceapi.tf.setWasmPaths('vendor/'); chain webgl -> wasm -> cpu
 *   hasWebGL() -> boolean                            true when a webgl/webgl2 context can be created
 *   loadCoco(url='vendor/models/cocossd/model.json') -> Promise<GraphModel>   cached per URL, warmed up once
 *   decodeCoco(boxes, scores, N, C, {classes=[0], minScore=0.4, iou=0.5, max=20}) -> [{x,y,w,h,score,cls}]
 *     pure. boxes [N*4] (ymin,xmin,ymax,xmax normalised), scores [N*C]. The best listed class per box is used.
 *     classes [0] reproduces store.decodePersons exactly (plus a cls:0 field).
 *   nms(cand, iouThr=0.5, maxOut=20) -> cand[]      same as store.nms
 *   detectCoco(model, src:HTMLVideoElement|HTMLCanvasElement|HTMLImageElement, {detW=416, classes=[0], minScore=0.4, iou=0.5, max=20, canvas?, tiles?})
 *     -> Promise<dets>   downscales to detW wide, tf.tidy + dispose every tensor; boxes normalised to the source.
 *     tiles: {cols, rows, overlap=0.2} -> ALSO runs the model on cols×rows overlapping crops of the source (each crop
 *       scaled to <= detW wide) and merges with the full-frame pass (mergeTiles). COCO-SSD resizes every input to its fixed
 *       300×300 tensor, so a larger detW does NOT help small/far people — tiling does (tests/bench, ACCURACY.md). Cost:
 *       1 + cols×rows model runs per frame.
 *   tileRects(cols, rows, overlap) -> [{x,y,w,h}] normalised crops covering the frame
 *     Tile boxes touching an inner tile edge are dropped (people cut in half by a tile; large people come from the full frame).
 *   mergeTiles(dets, {iou=0.5, ios=0.7, max}) -> dets   score-sorted greedy merge: a box is dropped when it overlaps a kept
 *     box by IoU >= iou, or when >= ios of the SMALLER box lies inside the kept box (a person cut by a tile edge)
 *   loadEmbedder(url='vendor/models/mobilenet/model.json') -> Promise<GraphModel>   MobileNetV2 (store re-ID), cached, warmed
 *   embedBox(model, src:canvas|video|img, box{x,y,w,h normalised}, {pad=0.04, canvas?}) -> Float32Array(1280)|null
 *     crops box (+pad on each side, clipped to the image) from src, resizes to 224x224, returns the AvgPool feature
 *     (not normalised; cosine() normalises). null when the crop is smaller than 4x8 px. Used by store.js and tests/bench.
 *   loadYolox(url=YOLOX_DEFAULT) -> Promise<{kind:'yolox', session, S:416}>  YOLOX (Apache-2.0) on ORT Web WASM (vendor/ort, needs
 *     window.ort); detectYolox(m, src, opts) same contract as detectCoco (+ split:'auto'); detectPeople(m, src, opts) dispatches.
 *   decodeYolox(out, A, C5, S, {classes, minScore, iou, max, scale}) -> dets in letterboxed-source px (pure)
 *   faceSharpness(src, box px) -> Laplacian variance of the face crop (quality gate)
 *   detectFacesCascade(faceapi, src, {sizes=[320,224,160], scoreThreshold=0.5, descriptors=true}) -> Promise<results[]>
 *     TinyFaceDetector + 68 landmarks (+ descriptors) at sizes[0]; only when that finds no face, again at the next size.
 *     A face that fills a large part of the frame (someone close to a kiosk camera) is often missed at 320 and found at
 *     160: CASIA-FaceV5 faces found 60% -> see ACCURACY.md §2. Costs a second (cheaper) pass only on empty frames.
 *   isTest() -> boolean   location.hostname in {localhost,127.0.0.1} && URLSearchParams has 'fakedet'
 *   fake(key, now) -> dets|null   isTest() ? (window.__LQ_FAKE_DET?.(key, now) ?? null) : null
 *     Pages call fake() before the real model; with ?fakedet they skip model loading entirely.
 */
(function (root) {
  "use strict";

  function iou(a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const uni = a.w * a.h + b.w * b.h - inter;
    return uni > 0 ? inter / uni : 0;
  }
  function nms(cand, iouThr = 0.5, maxOut = 20) {
    cand = cand.slice().sort((a, b) => b.score - a.score);
    const keep = [];
    for (const c of cand) {
      if (keep.length >= maxOut) break;
      if (keep.every(k => iou(k, c) <= iouThr)) keep.push(c);
    }
    return keep;
  }
  function decodeCoco(boxes, scores, N, C, { classes = [0], minScore = 0.4, iou: iouThr = 0.5, max = 20 } = {}) {
    const cand = [];
    for (let i = 0; i < N; i++) {
      let sc = -Infinity, cls = -1;
      for (const k of classes) { const v = scores[i * C + k]; if (v > sc) { sc = v; cls = k; } }
      if (!(sc >= minScore)) continue;
      const y1 = Math.max(0, boxes[i * 4]), x1 = Math.max(0, boxes[i * 4 + 1]), y2 = Math.min(1, boxes[i * 4 + 2]), x2 = Math.min(1, boxes[i * 4 + 3]);
      if (x2 <= x1 || y2 <= y1) continue;
      cand.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, score: sc, cls });
    }
    return nms(cand, iouThr, max);
  }

  const hasDOM = typeof document !== "undefined";
  const params = () => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(""); } };

  let glCache = null;
  function hasWebGL() {
    if (glCache != null) return glCache;
    if (!hasDOM) return (glCache = false);
    try { const c = document.createElement("canvas"); glCache = !!(c.getContext("webgl2") || c.getContext("webgl")); }
    catch { glCache = false; }
    return glCache;
  }

  let backendP = null;
  function tfBackend() {
    if (backendP) return backendP;
    backendP = (async () => {
      const tf = root.faceapi && root.faceapi.tf;
      if (!tf) throw new Error("ไม่พบไลบรารี vendor/face-api.js");
      try { tf.setWasmPaths && tf.setWasmPaths("vendor/"); } catch (e) { console.warn("setWasmPaths", e); }
      const q = params();
      const order = q.has("cpu") || q.has("nogl") || !hasWebGL() ? ["wasm", "cpu"] : ["webgl", "wasm", "cpu"];
      for (const name of order) {
        try { if (await tf.setBackend(name)) { await tf.ready(); return name; } } catch (e) { console.warn(name, e); }
      }
      throw new Error("ไม่มีตัวประมวลผล TensorFlow.js ที่ใช้ได้");
    })();
    backendP.catch(() => { backendP = null; });
    return backendP;
  }

  const models = new Map();
  function loadCoco(url = "vendor/models/cocossd/model.json") {
    const href = new URL(url, location.href).href;
    if (models.has(href)) return models.get(href);
    const p = (async () => {
      await tfBackend();
      const tf = root.faceapi.tf;
      const model = await tf.loadGraphModel(href);
      const warm = tf.zeros([1, 180, 320, 3], "int32");
      try { (await model.executeAsync(warm)).forEach(t => t.dispose()); } finally { warm.dispose(); }
      return model;
    })();
    models.set(href, p);
    p.catch(() => models.delete(href));
    return p;
  }

  function tileRects(cols = 2, rows = 2, overlap = 0.2) {
    const out = [];
    const tw = 1 / (cols - (cols - 1) * overlap), th = 1 / (rows - (rows - 1) * overlap);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = cols > 1 ? c * (1 - tw) / (cols - 1) : 0, y = rows > 1 ? r * (1 - th) / (rows - 1) : 0;
      out.push({ x, y, w: Math.min(tw, 1 - x), h: Math.min(th, 1 - y) });
    }
    return out;
  }
  function mergeTiles(dets, { iou: iouThr = 0.5, ios = 0.7, max = 20 } = {}) {
    const keep = [];
    for (const d of dets.slice().sort((a, b) => b.score - a.score)) {
      if (keep.length >= max) break;
      const dup = keep.some(k => {
        if (iou(k, d) >= iouThr) return true;
        const x1 = Math.max(k.x, d.x), y1 = Math.max(k.y, d.y), x2 = Math.min(k.x + k.w, d.x + d.w), y2 = Math.min(k.y + k.h, d.y + d.h);
        const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        return inter / Math.max(1e-9, Math.min(k.w * k.h, d.w * d.h)) >= ios;
      });
      if (!dup) keep.push(d);
    }
    return keep;
  }

  let sharedCanvas = null;
  async function runCoco(model, src, rect, W, H, detW, c, opts) {
    const tf = root.faceapi.tf;
    const rx = rect.x * W, ry = rect.y * H, rw = rect.w * W, rh = rect.h * H;
    const sw = Math.max(1, Math.round(Math.min(detW, rw))), sh = Math.max(1, Math.round(rh * sw / rw));
    if (c.width !== sw || c.height !== sh) { c.width = sw; c.height = sh; }
    c.getContext("2d", { willReadFrequently: true }).drawImage(src, rx, ry, rw, rh, 0, 0, sw, sh);
    const input = tf.tidy(() => tf.browser.fromPixels(c).expandDims(0));
    let outs;
    try { outs = await model.executeAsync(input); } finally { input.dispose(); }
    try {
      const bt = outs.find(t => t.shape.length === 4 && t.shape[3] === 4), st = outs.find(t => t !== bt);
      const [scores, boxes] = await Promise.all([st.data(), bt.data()]);
      const e = 0.01; // a box touching an INNER tile edge is a person cut by the tile: dropped (the full frame or the overlap sees it whole)
      return decodeCoco(boxes, scores, st.shape[1], st.shape[2], opts)
        .filter(d => !((rect.x > 0 && d.x <= e) || (rect.x + rect.w < 0.999 && d.x + d.w >= 1 - e) || (rect.y > 0 && d.y <= e) || (rect.y + rect.h < 0.999 && d.y + d.h >= 1 - e)))
        .map(d => ({ ...d, x: rect.x + d.x * rect.w, y: rect.y + d.y * rect.h, w: d.w * rect.w, h: d.h * rect.h }));
    } finally { outs.forEach(t => t.dispose()); }
  }
  let tileCanvas = null;
  /** @param {any} model @param {any} src @param {LQDetectOpts} [o] */
  async function detectCoco(model, src, { detW = 416, classes = [0], minScore = 0.4, iou: iouThr = 0.5, max = 20, canvas, tiles = null } = {}) {
    const W = src.videoWidth || src.naturalWidth || src.width, H = src.videoHeight || src.naturalHeight || src.height;
    if (!W || !H) return [];
    const c = canvas || sharedCanvas || (sharedCanvas = document.createElement("canvas"));
    const opts = { classes, minScore, iou: iouThr, max: tiles ? Math.max(max, 50) : max };
    // full frame last into `c`, so callers that crop from `c` (store re-ID) still see the whole frame
    let all = [];
    if (tiles && tiles.cols * tiles.rows > 1) {
      const tc = tileCanvas || (tileCanvas = document.createElement("canvas"));
      for (const r of tileRects(tiles.cols, tiles.rows, tiles.overlap != null ? tiles.overlap : 0.2)) all.push(...await runCoco(model, src, r, W, H, detW, tc, opts));
    }
    const full = await runCoco(model, src, { x: 0, y: 0, w: 1, h: 1 }, W, H, detW, c, opts);
    if (!all.length) return full.slice(0, max);
    return mergeTiles(full.concat(all), { iou: iouThr, max });
  }

  /* ---------- YOLOX (Apache-2.0, Megvii) on ONNX Runtime Web (WASM, no WebGL) ----------
   * Official YOLOX ONNX export: input "images" [1,3,S,S] BGR 0..255, letterboxed top-left on grey 114; output [1,A,85]
   * = raw (dx,dy,log w,log h) per grid cell + sigmoid(obj) + sigmoid(80 COCO classes); strides 8/16/32. */
  function decodeYolox(out, A, C5, S, { classes = [0], minScore = 0.4, iou: iouThr = 0.5, max = 20, scale = 1, strides = [8, 16, 32] } = {}) {
    const cand = [];
    let i = 0;
    for (const st of strides) {
      const g = Math.floor(S / st);
      for (let gy = 0; gy < g; gy++) for (let gx = 0; gx < g; gx++, i++) {
        if (i >= A) break;
        const o = i * C5, obj = out[o + 4];
        if (!(obj >= minScore)) continue;
        let sc = -Infinity, cls = -1;
        for (const k of classes) { const v = obj * out[o + 5 + k]; if (v > sc) { sc = v; cls = k; } }
        if (!(sc >= minScore)) continue;
        const cx = (out[o] + gx) * st, cy = (out[o + 1] + gy) * st, w = Math.exp(out[o + 2]) * st, h = Math.exp(out[o + 3]) * st;
        // back to the un-letterboxed source pixels (divide by scale), then the caller normalises
        cand.push({ x: (cx - w / 2) / scale, y: (cy - h / 2) / scale, w: w / scale, h: h / scale, score: sc, cls });
      }
    }
    return nms(cand, iouThr, max);
  }
  const YOLOX_DEFAULT = "vendor/models/yolox/yolox_nano_416.onnx"; // the vendored model (tiny is benchmarked only, not shipped)
  function ortReady() {
    const ort = root.ort;
    if (!ort) throw new Error("ไม่พบไลบรารี vendor/ort/ort.wasm.min.js");
    try {
      ort.env.wasm.wasmPaths = new URL("vendor/ort/", location.href).href;
      ort.env.wasm.numThreads = root.crossOriginIsolated ? Math.min(4, (root.navigator && navigator.hardwareConcurrency) || 1) : 1;
    } catch (e) { console.warn("ort env", e); }
    return ort;
  }
  /* loadYolox(url) -> Promise<{kind:'yolox', session, S}> cached per URL, warmed up once */
  function loadYolox(url = YOLOX_DEFAULT) {
    const href = new URL(url, location.href).href;
    if (models.has(href)) return models.get(href);
    const p = (async () => {
      const ort = ortReady();
      const session = await ort.InferenceSession.create(href, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      const S = 416;
      const r = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", new Float32Array(3 * S * S).fill(114), [1, 3, S, S]) });
      Object.values(r).forEach(t => t.dispose && t.dispose());
      return { kind: "yolox", session, S };
    })();
    models.set(href, p);
    p.catch(() => models.delete(href));
    return p;
  }
  let yxCanvas = null, yxBuf = null;
  async function runYolox(m, src, rect, W, H, opts) {
    const ort = root.ort, S = m.S;
    const rx = rect.x * W, ry = rect.y * H, rw = rect.w * W, rh = rect.h * H;
    const scale = Math.min(S / rw, S / rh), dw = Math.max(1, Math.round(rw * scale)), dh = Math.max(1, Math.round(rh * scale));
    const c = yxCanvas || (yxCanvas = document.createElement("canvas"));
    if (c.width !== S || c.height !== S) { c.width = S; c.height = S; }
    const x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "rgb(114,114,114)"; x.fillRect(0, 0, S, S);
    x.drawImage(src, rx, ry, rw, rh, 0, 0, dw, dh);
    const px = x.getImageData(0, 0, S, S).data, n = S * S;
    const buf = yxBuf && yxBuf.length === 3 * n ? yxBuf : (yxBuf = new Float32Array(3 * n));
    for (let i = 0, j = 0; i < n; i++, j += 4) { buf[i] = px[j + 2]; buf[n + i] = px[j + 1]; buf[2 * n + i] = px[j]; } // BGR planes
    const res = await m.session.run({ [m.session.inputNames[0]]: new ort.Tensor("float32", buf, [1, 3, S, S]) });
    const t = res[m.session.outputNames[0]];
    try {
      const e = 0.01;
      return decodeYolox(t.data, t.dims[1], t.dims[2], S, { ...opts, scale })
        .map(d => { // clip to the drawn area, normalise to the rect
          const x1 = Math.max(0, d.x) / rw, y1 = Math.max(0, d.y) / rh, x2 = Math.min(rw, d.x + d.w) / rw, y2 = Math.min(rh, d.y + d.h) / rh;
          return { ...d, x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
        })
        .filter(d => d.w > 0 && d.h > 0)
        .filter(d => !((rect.x > 0 && d.x <= e) || (rect.x + rect.w < 0.999 && d.x + d.w >= 1 - e) || (rect.y > 0 && d.y <= e) || (rect.y + rect.h < 0.999 && d.y + d.h >= 1 - e)))
        .map(d => ({ ...d, x: rect.x + d.x * rect.w, y: rect.y + d.y * rect.h, w: d.w * rect.w, h: d.h * rect.h }));
    } finally { Object.values(res).forEach(v => v.dispose && v.dispose()); }
  }
  /* detectYolox(m, src, {detW, classes, minScore, iou, max, canvas, tiles, split}) — same contract as detectCoco.
   * The source is also drawn detW wide into `canvas` (store re-ID crops from it). split:'auto' runs 2 overlapping
   * square-ish halves instead of one letterboxed pass when the frame is wider than 4:3 (a 16:9 frame letterboxed to 416²
   * wastes 44% of the input), so people keep ~1.8× more pixels for the same 2 model runs as COCO-SSD 2×1 tiles. */
  /** @param {any} m @param {any} src @param {LQDetectOpts} [o] */
  async function detectYolox(m, src, { detW = 416, classes = [0], minScore = 0.4, iou: iouThr = 0.5, max = 20, canvas, tiles = null, split = null } = {}) {
    const W = src.videoWidth || src.naturalWidth || src.width, H = src.videoHeight || src.naturalHeight || src.height;
    if (!W || !H) return [];
    const c = canvas || sharedCanvas || (sharedCanvas = document.createElement("canvas"));
    const sw = Math.max(1, Math.round(Math.min(detW, W))), sh = Math.max(1, Math.round(H * sw / W));
    if (c.width !== sw || c.height !== sh) { c.width = sw; c.height = sh; }
    c.getContext("2d", { willReadFrequently: true }).drawImage(src, 0, 0, W, H, 0, 0, sw, sh);
    const opts = { classes, minScore, iou: iouThr, max: 100 };
    let rects = [{ x: 0, y: 0, w: 1, h: 1 }];
    if (tiles && tiles.cols * tiles.rows > 1) rects = rects.concat(tileRects(tiles.cols, tiles.rows, tiles.overlap != null ? tiles.overlap : 0.2));
    else if (split === "auto" && W / H > 1.5) rects = tileRects(2, 1, 0.2);
    const all = [];
    for (const r of rects) all.push(...await runYolox(m, src, r, W, H, opts));
    return rects.length === 1 ? all.slice(0, max) : mergeTiles(all, { iou: iouThr, max });
  }
  /* detectPeople(model, src, opts): COCO-SSD GraphModel or a loadYolox() handle */
  function detectPeople(model, src, opts) { return model && model.kind === "yolox" ? detectYolox(model, src, opts) : detectCoco(model, src, opts); }

  const EMB_NODE = "module_apply_default/MobilenetV2/Logits/AvgPool";
  function loadEmbedder(url = "vendor/models/mobilenet/model.json") {
    const href = new URL(url, location.href).href;
    if (models.has(href)) return models.get(href);
    const p = (async () => {
      await tfBackend();
      const tf = root.faceapi.tf;
      const m = await tf.loadGraphModel(href);
      tf.tidy(() => m.execute({ images: tf.zeros([1, 224, 224, 3]) }, EMB_NODE)).dispose();
      return m;
    })();
    models.set(href, p);
    p.catch(() => models.delete(href));
    return p;
  }
  let cropCanvas = null;
  /** @param {any} model @param {any} src @param {any} box @param {LQDetectOpts} [o] */
  function embedBox(model, src, box, { pad = 0.04, canvas } = {}) {
    const tf = root.faceapi.tf;
    const W = src.videoWidth || src.naturalWidth || src.width, H = src.videoHeight || src.naturalHeight || src.height;
    if (!W || !H) return null;
    const x = Math.max(0, (box.x - pad * box.w) * W), y = Math.max(0, (box.y - pad * box.h) * H);
    const w = Math.min(W - x, box.w * (1 + 2 * pad) * W), h = Math.min(H - y, box.h * (1 + 2 * pad) * H);
    if (!(w >= 4 && h >= 8)) return null;
    const c = canvas || cropCanvas || (cropCanvas = document.createElement("canvas"));
    if (c.width !== 224 || c.height !== 224) { c.width = 224; c.height = 224; }
    c.getContext("2d", { willReadFrequently: true }).drawImage(src, x, y, w, h, 0, 0, 224, 224);
    const out = tf.tidy(() => model.execute({ images: tf.browser.fromPixels(c).toFloat().div(255).expandDims(0) }, EMB_NODE).reshape([-1]));
    try { return Float32Array.from(out.dataSync()); } finally { out.dispose(); }
  }

  /* faceSharpness(src, box{x,y,w,h px}) -> number  variance of the 4-neighbour Laplacian on a 64×64 grey crop of the face
   * (0..~2000; < ~40 = blurred or motion-smeared). Used as a quality gate before face matching (LQTrack.faceQuality). */
  let sharpCanvas = null;
  function faceSharpness(src, box) {
    if (!hasDOM || !box || !(box.w > 4 && box.h > 4)) return 0;
    const N = 64, c = sharpCanvas || (sharpCanvas = document.createElement("canvas"));
    if (c.width !== N) { c.width = N; c.height = N; }
    const x = c.getContext("2d", { willReadFrequently: true });
    try { x.drawImage(src, box.x + box.w * 0.15, box.y + box.h * 0.15, box.w * 0.7, box.h * 0.7, 0, 0, N, N); } catch { return 0; }
    const d = x.getImageData(0, 0, N, N).data, g = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < N - 1; y++) for (let xx = 1; xx < N - 1; xx++) {
      const i = y * N + xx, l = g[i - 1] + g[i + 1] + g[i - N] + g[i + N] - 4 * g[i];
      s += l; s2 += l * l; n++;
    }
    const m = s / n; return Math.round((s2 / n - m * m) * 10) / 10;
  }

  function isTest() {
    try { return (location.hostname === "localhost" || location.hostname === "127.0.0.1") && params().has("fakedet"); }
    catch { return false; }
  }
  function fake(key, now) {
    if (!isTest()) return null;
    const f = root.__LQ_FAKE_DET;
    if (typeof f !== "function") return null;
    const r = f(key, now);
    return r == null ? null : r;
  }

  const FACE_SIZES = Object.freeze([320, 224, 160]);
  async function detectFacesCascade(fa, src, { sizes = FACE_SIZES, scoreThreshold = 0.5, descriptors = true } = {}) {
    for (const inputSize of sizes) {
      let q = fa.detectAllFaces(src, new fa.TinyFaceDetectorOptions({ inputSize, scoreThreshold })).withFaceLandmarks();
      if (descriptors) q = q.withFaceDescriptors();
      const r = await q;
      if (r && r.length) return r;
    }
    return [];
  }
  const api = { detectFacesCascade, FACE_SIZES, tfBackend, hasWebGL, loadCoco, decodeCoco, nms, detectCoco, decodeYolox, loadYolox, detectYolox, detectPeople, YOLOX_DEFAULT, tileRects, mergeTiles, loadEmbedder, embedBox, EMB_NODE, faceSharpness, isTest, fake };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQDetect = api;
})(typeof window !== "undefined" ? window : globalThis);
