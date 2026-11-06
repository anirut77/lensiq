/* lensiq-hand.js — LQHand: shared tfjs MediaPipe-Hands (lite) pipeline + active-hand lock + gated motion fallback.
 * Browser: window.LQHand (needs vendor/face-api.js for faceapi.tf and lensiq-detect.js for the backend chain)
 * Node: module.exports (pure parts, node --test tests/unit/hand.test.js).
 * Runs on TF.js webgl -> wasm -> cpu (LQDetect.tfBackend), so it works WITHOUT WebGL (no MediaPipe Tasks needed).
 * Model: vendor/models/hand/{detector,landmark}/ (palm detector 192x192 with 2016 anchors, landmark 224x224, 21 points).
 * Pre/post-processing is the same as palm.js (palm.js keeps its own copy; behaviour there is unchanged).
 * Privacy: frames are read into small canvases for inference only; nothing is stored or sent.
 *
 * PURE
 *   DET, LM, MAX_HANDS=3
 *   ssdAnchors() -> Float32Array [xc,yc,...] (2016 anchors)
 *   decodePalms(raw, anchors, minScore=0.5) -> [{score,x,y,w,h,kps}]   (0..1 of the letterboxed 192 image)
 *   iou(a,b) · nms(dets, thr=0.3, max=MAX_HANDS) -> kept, highest score first, at most `max` (default 3)
 *   letterbox(W,H,size) · unletterbox(d,pad) · palmRoi(d,W,H) · landmarksRoi(pts) · roiCropMatrix(roi,out) · projectLandmarks(raw,roi)
 *   handBox(pts) -> {x,y,w,h} px · synthHand(box) -> 21 [x,y] px (fake detector) · toLandmarks(pts,W,H) -> [{x,y}] 0..1
 *   dedupeHands(hands, thr=0.5) -> hands whose boxes overlap an earlier (higher-ranked) hand by IoU >= thr are dropped
 *   createActiveLock({minIou=0.2, maxDist=0.15, lostMs=700}) -> {update(boxes, now) -> {index, locked, held, n}, reset(), box}
 *     boxes: normalised {x,y,w,h}. Unlocked: the largest hand (nearest the camera) is locked. Locked: only the hand that
 *     continues the locked one (IoU >= minIou or centre distance <= maxDist) is returned; every other hand is ignored.
 *     When the locked hand is missing, index = -1 and the lock is HELD for lostMs (a bystander cannot take over), then released.
 *   toGray(rgba) -> Uint8Array
 *   motionBlobs(prev, cur, w, h, thr=28) -> {n, frac, blobs:[{n, frac, x, y, bx, by, bw, bh}]}  4-connected, largest first
 *   motionGate(m, {MIN_BLOB=0.004, MAX_BLOB=0.12, MAX_W=0.45, MAX_H=0.6, MAX_TOTAL=0.3, DOMINANT=0.55}) -> blob|null
 *     A blob drives the cursor only when it is hand-sized and clearly the main mover: a crowd or body moving is rejected.
 * DOM
 *   createDetector({modelDir='vendor/models/hand/', fakeKey?:() => string}) ->
 *     {load() -> Promise<backend>, detect(src, {quick=true, max=MAX_HANDS}) -> Promise<hands>, backend, ready}
 *     hands = [{pts:[[x,y] px]x21, score, det, handedness, box:{x,y,w,h} px}], sorted by palm score, at most max.
 *     With ?fakedet on localhost (LQDetect.isTest()) no model loads: boxes from LQDetect.fake(fakeKey()) become synthHand()s.
 */
(function (root) {
  "use strict";
  const MAX_HANDS = 3;
  const DET = { size: 192, strides: [8, 16, 16, 16], numBoxes: 2016, stride: 19, minScore: 0.5, iou: 0.3 };
  const LM = { size: 224 };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const normRad = a => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

  // ================= palm detector / landmark geometry (same maths as palm.js) =================
  function ssdAnchors() {
    const out = [], st = DET.strides;
    let layer = 0;
    while (layer < st.length) {
      let last = layer, n = 0;
      while (last < st.length && st[last] === st[layer]) { n += 2; last++; }
      const fm = Math.ceil(DET.size / st[layer]);
      for (let y = 0; y < fm; y++) for (let x = 0; x < fm; x++) for (let k = 0; k < n; k++) out.push((x + 0.5) / fm, (y + 0.5) / fm);
      layer = last;
    }
    return new Float32Array(out);
  }
  function decodePalms(raw, anchors, minScore = DET.minScore) {
    const S = DET.size, res = [];
    for (let i = 0; i < DET.numBoxes; i++) {
      const o = i * DET.stride, sc = sigmoid(clamp(raw[o], -100, 100));
      if (sc < minScore) continue;
      const ax = anchors[2 * i], ay = anchors[2 * i + 1];
      const xc = raw[o + 1] / S + ax, yc = raw[o + 2] / S + ay, w = raw[o + 3] / S, h = raw[o + 4] / S;
      if (w <= 0 || h <= 0) continue;
      const kps = [];
      for (let k = 0; k < 7; k++) kps.push([raw[o + 5 + 2 * k] / S + ax, raw[o + 6 + 2 * k] / S + ay]);
      res.push({ score: sc, x: xc - w / 2, y: yc - h / 2, w, h, kps });
    }
    return res;
  }
  function iou(a, b) {
    const aw = a.w != null ? a.w : a.width, ah = a.h != null ? a.h : a.height, bw = b.w != null ? b.w : b.width, bh = b.h != null ? b.h : b.height;
    const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + aw, b.x + bw), y1 = Math.min(a.y + ah, b.y + bh);
    const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    return inter / (aw * ah + bw * bh - inter || 1);
  }
  function nms(dets, thr = DET.iou, max = MAX_HANDS) {
    const s = (dets || []).slice().sort((a, b) => b.score - a.score), keep = [];
    for (const d of s) {
      if (keep.length >= max) break;
      if (keep.every(k => iou(k, d) <= thr)) keep.push(d);
    }
    return keep;
  }
  function letterbox(W, H, size) {
    const s = Math.min(size / W, size / H), dw = W * s, dh = H * s;
    return { scale: s, dx: (size - dw) / 2, dy: (size - dh) / 2, dw, dh, pad: { left: (size - dw) / 2 / size, top: (size - dh) / 2 / size, right: (size - dw) / 2 / size, bottom: (size - dh) / 2 / size } };
  }
  function unletterbox(d, pad) {
    const sx = 1 - pad.left - pad.right, sy = 1 - pad.top - pad.bottom;
    const f = p => [(p[0] - pad.left) / sx, (p[1] - pad.top) / sy];
    return { score: d.score, x: (d.x - pad.left) / sx, y: (d.y - pad.top) / sy, w: d.w / sx, h: d.h / sy, kps: d.kps.map(f) };
  }
  function palmRoi(d, W, H) {
    const k0 = [d.kps[0][0] * W, d.kps[0][1] * H], k2 = [d.kps[2][0] * W, d.kps[2][1] * H];
    const rot = normRad(Math.PI / 2 - Math.atan2(-(k2[1] - k0[1]), k2[0] - k0[0]));
    const w = d.w * W, h = d.h * H, shiftY = -0.5;
    let cx = (d.x + d.w / 2) * W, cy = (d.y + d.h / 2) * H;
    cx += -h * shiftY * Math.sin(rot); cy += h * shiftY * Math.cos(rot);
    return { cx, cy, size: Math.max(w, h) * 2.6, rot };
  }
  function landmarksRoi(pts) {
    const p0 = pts[0], mid = [(pts[5][0] + pts[13][0]) / 2 * 0.5 + pts[9][0] * 0.5, (pts[5][1] + pts[13][1]) / 2 * 0.5 + pts[9][1] * 0.5];
    const rot = normRad(Math.PI / 2 - Math.atan2(-(mid[1] - p0[1]), mid[0] - p0[0]));
    const idx = [0, 1, 2, 3, 5, 6, 9, 10, 13, 14, 17, 18], c = Math.cos(-rot), s = Math.sin(-rot);
    const xs = [], ys = [];
    idx.forEach(i => { const p = pts[i]; xs.push(p[0] * c - p[1] * s); ys.push(p[0] * s + p[1] * c); });
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const rc = [(x0 + x1) / 2, (y0 + y1) / 2], h = y1 - y0, w = x1 - x0;
    let cx = rc[0] * Math.cos(rot) - rc[1] * Math.sin(rot), cy = rc[0] * Math.sin(rot) + rc[1] * Math.cos(rot);
    const shiftY = -0.1;
    cx += -h * shiftY * Math.sin(rot); cy += h * shiftY * Math.cos(rot);
    return { cx, cy, size: Math.max(w, h) * 2.0, rot };
  }
  function roiCropMatrix(roi, out) {
    const k = out / roi.size, c = Math.cos(-roi.rot), s = Math.sin(-roi.rot);
    return [k * c, k * s, -k * s, k * c, out / 2 - k * (c * roi.cx - s * roi.cy), out / 2 - k * (s * roi.cx + c * roi.cy)];
  }
  function projectLandmarks(raw, roi) {
    const pts = [], c = Math.cos(roi.rot), s = Math.sin(roi.rot);
    for (let i = 0; i < 21; i++) {
      const x = raw[3 * i] / LM.size - 0.5, y = raw[3 * i + 1] / LM.size - 0.5;
      pts.push([(c * x - s * y) * roi.size + roi.cx, (s * x + c * y) * roi.size + roi.cy]);
    }
    return pts;
  }
  function handBox(pts) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  }
  // open palm, fingers up, 21 points inside box (px) — test detector only
  function synthHand(box) {
    const u = [[0.5, 1], [0.3, 0.9], [0.18, 0.78], [0.1, 0.66], [0.05, 0.56], [0.32, 0.5], [0.32, 0.33], [0.32, 0.2], [0.32, 0.08],
      [0.47, 0.48], [0.47, 0.3], [0.47, 0.15], [0.47, 0], [0.62, 0.5], [0.62, 0.33], [0.62, 0.2], [0.62, 0.08], [0.76, 0.55], [0.76, 0.43], [0.76, 0.33], [0.76, 0.24]];
    const w = box.w != null ? box.w : box.width, h = box.h != null ? box.h : box.height;
    return u.map(q => [box.x + q[0] * w, box.y + q[1] * h]);
  }
  const toLandmarks = (pts, W, H) => pts.map(p => ({ x: p[0] / (W || 1), y: p[1] / (H || 1) }));
  function dedupeHands(hands, thr = 0.5) {
    const out = [];
    for (const h of hands || []) if (out.every(o => iou(o.box, h.box) < thr)) out.push(h);
    return out;
  }

  // ================= active-hand lock: one controller, bystanders ignored =================
  function createActiveLock({ minIou = 0.2, maxDist = 0.15, lostMs = 700 } = {}) {
    let box = null, lastSeen = -Infinity;
    const ctr = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const api = {
      get box() { return box; },
      get locked() { return !!box; },
      reset() { box = null; lastSeen = -Infinity; },
      update(boxes, now) {
        boxes = boxes || [];
        const n = boxes.length;
        if (box && now - lastSeen > lostMs) box = null; // lock expired
        if (box) {
          const c0 = ctr(box);
          let bi = -1, bs = -Infinity;
          boxes.forEach((b, i) => {
            const ov = iou(box, b), c = ctr(b), dd = Math.hypot(c.x - c0.x, c.y - c0.y);
            if (ov < minIou && dd > maxDist) return;
            const s = ov - dd; // overlap first, then nearest centre
            if (s > bs) { bs = s; bi = i; }
          });
          if (bi >= 0) { box = { ...boxes[bi] }; lastSeen = now; return { index: bi, locked: true, held: false, n }; }
          return { index: -1, locked: true, held: true, n };
        }
        if (!n) return { index: -1, locked: false, held: false, n };
        let bi = 0;
        boxes.forEach((b, i) => { if (b.w * b.h > boxes[bi].w * boxes[bi].h) bi = i; });
        box = { ...boxes[bi] }; lastSeen = now;
        return { index: bi, locked: true, held: false, n };
      }
    };
    return api;
  }

  // ================= motion fallback (no model): connected blobs, gated by size =================
  function toGray(rgba) {
    const g = new Uint8Array(rgba.length / 4);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
    return g;
  }
  function motionBlobs(prev, cur, w, h, thr = 28) {
    const N = w * h, mask = new Uint8Array(N);
    let n = 0;
    for (let i = 0; i < N; i++) if (Math.abs(cur[i] - prev[i]) > thr) { mask[i] = 1; n++; }
    const blobs = [];
    if (n) {
      const stack = new Int32Array(N);
      for (let s = 0; s < N; s++) {
        if (mask[s] !== 1) continue;
        let top = 0, cnt = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
        stack[top++] = s; mask[s] = 2;
        while (top) {
          const i = stack[--top], x = i % w, y = (i - x) / w;
          cnt++; sx += x; sy += y;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (x > 0 && mask[i - 1] === 1) { mask[i - 1] = 2; stack[top++] = i - 1; }
          if (x < w - 1 && mask[i + 1] === 1) { mask[i + 1] = 2; stack[top++] = i + 1; }
          if (y > 0 && mask[i - w] === 1) { mask[i - w] = 2; stack[top++] = i - w; }
          if (y < h - 1 && mask[i + w] === 1) { mask[i + w] = 2; stack[top++] = i + w; }
        }
        blobs.push({ n: cnt, frac: cnt / N, x: (sx / cnt + 0.5) / w, y: (sy / cnt + 0.5) / h, bx: x0 / w, by: y0 / h, bw: (x1 - x0 + 1) / w, bh: (y1 - y0 + 1) / h });
      }
      blobs.sort((a, b) => b.n - a.n);
    }
    return { n, frac: n / N, blobs };
  }
  const GATE = { MIN_BLOB: 0.004, MAX_BLOB: 0.12, MAX_W: 0.45, MAX_H: 0.6, MAX_TOTAL: 0.3, DOMINANT: 0.55 };
  function motionGate(m, cfg = {}) {
    const c = { ...GATE, ...cfg };
    if (!m || !m.n || !m.blobs || !m.blobs.length) return null;
    if (m.frac > c.MAX_TOTAL) return null;              // most of the frame moved (crowd, camera shake, light change)
    const b = m.blobs[0];
    if (b.frac < c.MIN_BLOB || b.frac > c.MAX_BLOB) return null; // noise / a whole body
    if (b.bw > c.MAX_W || b.bh > c.MAX_H) return null;
    if (b.n / m.n < c.DOMINANT) return null;            // several movers of similar size: nobody gets the cursor
    return b;
  }

  // ================= DOM: tfjs detector =================
  function createDetector({ modelDir = "vendor/models/hand/", fakeKey = null } = {}) {
    const LQD = root.LQDetect;
    const FAKE = !!(LQD && LQD.isTest && LQD.isTest());
    let models = null, loading = null, backend = "";
    let c192 = null, c224 = null;
    function load() {
      if (FAKE) { backend = "test"; return Promise.resolve(backend); }
      if (models) return Promise.resolve(backend);
      loading = loading || (async () => {
        if (!LQD) throw new Error("ต้องโหลด lensiq-detect.js ก่อน");
        backend = await LQD.tfBackend();
        const tf = root.faceapi.tf;
        const [det, lm] = await Promise.all([tf.loadGraphModel(modelDir + "detector/model.json"), tf.loadGraphModel(modelDir + "landmark/model.json")]);
        models = { tf, det, lm, anchors: ssdAnchors() };
        return backend;
      })().catch(e => { loading = null; throw e; });
      return loading;
    }
    async function runLandmarks(src, roi) {
      const tf = models.tf, x = c224.getContext("2d");
      x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#000"; x.fillRect(0, 0, LM.size, LM.size);
      x.setTransform(...roiCropMatrix(roi, LM.size)); x.drawImage(src, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0);
      const inp = tf.tidy(() => tf.browser.fromPixels(c224).toFloat().div(255).expandDims(0));
      const out = models.lm.execute(inp, ["Identity_2:0", "Identity_1:0", "Identity:0", "Identity_3:0"]);
      try {
        const lm = await out[0].data(), score = (await out[1].data())[0], hd = (await out[2].data())[0];
        return { pts: projectLandmarks(lm, roi), score, handedness: hd };
      } finally { tf.dispose(out); inp.dispose(); }
    }
    async function detect(src, { quick = true, max = MAX_HANDS } = {}) {
      const W = src.videoWidth || src.width, H = src.videoHeight || src.height;
      if (!W || !H) return [];
      if (FAKE) {
        const fk = LQD.fake(typeof fakeKey === "function" ? fakeKey() : fakeKey || "c1", performance.now()) || [];
        return fk.slice(0, max).map(d => { const pts = synthHand({ x: d.x * W, y: d.y * H, w: d.w * W, h: d.h * H }); return { pts, score: d.score, det: d.score, handedness: null, box: handBox(pts) }; });
      }
      if (!models) await load();
      if (!c192) { c192 = document.createElement("canvas"); c192.width = c192.height = DET.size; c224 = document.createElement("canvas"); c224.width = c224.height = LM.size; }
      const tf = models.tf, lb = letterbox(W, H, DET.size), x = c192.getContext("2d", { willReadFrequently: true });
      x.fillStyle = "#000"; x.fillRect(0, 0, DET.size, DET.size); x.drawImage(src, lb.dx, lb.dy, lb.dw, lb.dh);
      const inp = tf.tidy(() => tf.browser.fromPixels(c192).toFloat().div(255).expandDims(0));
      const out = models.det.predict(inp);
      let raw;
      try { raw = await out.data(); } finally { tf.dispose([inp, out]); }
      const dets = nms(decodePalms(raw, models.anchors, DET.minScore), DET.iou, max), hands = [];
      for (const d0 of dets) {
        const d = unletterbox(d0, lb.pad);
        const r1 = await runLandmarks(src, palmRoi(d, W, H));
        if (r1.score < 0.5) continue;
        let r = r1;
        if (!quick) { const r2 = await runLandmarks(src, landmarksRoi(r1.pts)); if (r2.score >= 0.5) r = r2; }
        hands.push({ pts: r.pts, score: r.score, det: d.score, handedness: r.handedness, box: handBox(r.pts) });
      }
      return dedupeHands(hands);
    }
    return { load, detect, get backend() { return backend; }, get ready() { return FAKE || !!models; }, fake: FAKE };
  }

  const api = {
    MAX_HANDS, DET, LM, ssdAnchors, decodePalms, iou, nms, letterbox, unletterbox, palmRoi, landmarksRoi, roiCropMatrix, projectLandmarks,
    handBox, synthHand, toLandmarks, dedupeHands, createActiveLock, toGray, motionBlobs, motionGate, GATE, createDetector
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQHand = api;
})(typeof window !== "undefined" ? window : globalThis);
