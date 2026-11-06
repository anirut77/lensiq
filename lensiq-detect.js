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

  const api = { tfBackend, hasWebGL, loadCoco, decodeCoco, nms, detectCoco, tileRects, mergeTiles, loadEmbedder, embedBox, EMB_NODE, isTest, fake };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQDetect = api;
})(typeof window !== "undefined" ? window : globalThis);
