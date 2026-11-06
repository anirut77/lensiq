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
 *   detectCoco(model, src:HTMLVideoElement|HTMLCanvasElement, {detW=416, classes=[0], minScore=0.4, iou=0.5, max=20, canvas?})
 *     -> Promise<dets>   downscales to detW wide, tf.tidy + dispose every tensor; boxes normalised to the source.
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

  let sharedCanvas = null;
  async function detectCoco(model, src, { detW = 416, classes = [0], minScore = 0.4, iou: iouThr = 0.5, max = 20, canvas } = {}) {
    const tf = root.faceapi.tf;
    const W = src.videoWidth || src.width, H = src.videoHeight || src.height;
    if (!W || !H) return [];
    const c = canvas || sharedCanvas || (sharedCanvas = document.createElement("canvas"));
    const sw = Math.min(detW, W), sh = Math.max(1, Math.round(H * sw / W));
    if (c.width !== sw || c.height !== sh) { c.width = sw; c.height = sh; }
    c.getContext("2d", { willReadFrequently: true }).drawImage(src, 0, 0, sw, sh);
    const input = tf.tidy(() => tf.browser.fromPixels(c).expandDims(0));
    let outs;
    try { outs = await model.executeAsync(input); } finally { input.dispose(); }
    try {
      const bt = outs.find(t => t.shape.length === 4 && t.shape[3] === 4), st = outs.find(t => t !== bt);
      const [scores, boxes] = await Promise.all([st.data(), bt.data()]);
      return decodeCoco(boxes, scores, st.shape[1], st.shape[2], { classes, minScore, iou: iouThr, max });
    } finally { outs.forEach(t => t.dispose()); }
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

  const api = { tfBackend, hasWebGL, loadCoco, decodeCoco, nms, detectCoco, isTest, fake };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQDetect = api;
})(typeof window !== "undefined" ? window : globalThis);
