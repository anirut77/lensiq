/* lensiq-exam-face.js — LQExamFace: the face engine of LENSIQ Exam (exam-lab.html). Face presence, face count and head
 * pose only: no identity, no expression, no age / gender (CLAUDE.md: no emotion inference in Exam; docs/EXAM.md).
 * Browser: window.LQExamFace (load after lensiq-exam.js) · Node: require("./lensiq-exam-face.js") (pure parts).
 *
 * Engines
 *   "mediapipe" (DEFAULT, every build): MediaPipe Face Landmarker (vendor/models/face-landmarker/face_landmarker_lm.task,
 *     Apache-2.0) through the vendored Tasks Vision bundle, CPU delegate, IMAGE mode, up to 4 faces, the facial
 *     transformation matrix for head pose. Only the options in MP_OPTIONS are ever passed; the bundle's per-face score
 *     outputs for facial movements are never requested (their default is off) and never read. No WebGL probe gates it:
 *     the page switches the face signals off ("fix setup", honest) only when init() or detect() actually fails (e.g.
 *     MediaPipe's frame upload threw "activeTexture" on a Mac Chrome with every WebGL context disabled, 2026-11-10; CI's
 *     Linux Chrome runs the same bundle while reporting no WebGL). It never falls back to another model in a customer build.
 *   "faceapi" (research demo only): the earlier face-api.js TinyFaceDetector (320 -> 224) + 68 landmarks, kept in the
 *     repo and reachable only when the device's "Research demo" switch is on (window.LENSIQ_RESEARCH.on, lensiq-config.js)
 *     AND the page URL has ?faceengine=faceapi. vendor/face-api.js is injected on demand; customer builds never load it.
 *
 * API
 *   MESH68 {68-index: mesh index}   the MediaPipe points that stand in for the 68-point indices poseFrom68 reads
 *   meshTo68(lms, W, H) -> [{x, y}] x68 (px)      unmapped indices = mesh centre (poseFrom68 never reads them)
 *   boxOf(lms, W, H) -> {x, y, w, h} px            bounding box of the landmarks
 *   matrixAngles(data16) -> {yaw, pitch}|null      degrees from a column-major 4x4 facial transformation matrix:
 *     yaw < 0 = nose toward the image's left (poseFrom68 convention), pitch > 0 = looking down
 *   poseFromMesh(lms, W, H, {pose=DEFAULT_POSE ("mesh68") | "matrix", matrix}) -> {yaw, pitchN, mar, ipd}|null
 *     matrix: yaw / pitch from the matrix, pitchN = 0.45 + pitch / PITCH_K (so LQExam.pitchDeg reads degrees);
 *     mesh68: LQExam.poseFrom68(meshTo68(...)). mar / ipd from the mapped inner-lip / outer-eye points either way.
 *   synthMesh(box px, yawDeg, pitchDeg, mar, W, H) -> {lms, matrix}   test seam (?fakedet): the inverse of poseFromMesh
 *   pickEngine(win) -> "mediapipe"|"faceapi"        "faceapi" only with research demo on + ?faceengine=faceapi
 *   DEFAULT_POSE · MP_OPTIONS (frozen) · MP_TUNABLE · cleanOptions(x) -> only MP_TUNABLE keys with valid values
 *   FACEAPI_NETS · FACEAPI_OPTS
 *   create(name, {base}) -> engine {name, init() -> Promise, detect(src) -> Promise<[{box, yaw, pitchN, mar, ipd}]>}
 */
(/** @param {any} root @param {(root: any) => any} factory */ function (root, factory) {
  const m = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = m; else root.LQExamFace = m;
})(typeof self !== "undefined" ? self : this, function (/** @type {any} */ root) {
  "use strict";
  /** @type {any} */
  const E = typeof module !== "undefined" && module.exports ? require("./lensiq-exam.js") : root.LQExam;
  const fin = v => typeof v === "number" && Number.isFinite(v);
  const DEG = 180 / Math.PI;
  const PITCH_K = 120; // = lensiq-exam.js PITCH_K (degrees per unit of pitchN)

  /* 68-point index -> MediaPipe Face Mesh index (unmirrored image: 68's "0" / "36" are on the image's left = mesh 234 / 33) */
  const MESH68 = Object.freeze({ 0: 234, 16: 454, 30: 1, 36: 33, 45: 263, 8: 152, 60: 78, 61: 82, 62: 13, 63: 312, 64: 308, 65: 317, 66: 14, 67: 87 });
  const lmPx = (l, W, H) => ({ x: l.x * W, y: l.y * H });

  function boxOf(lms, W, H) {
    if (!lms || !lms.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of lms) { if (!l || !fin(l.x) || !fin(l.y)) continue; x0 = Math.min(x0, l.x); x1 = Math.max(x1, l.x); y0 = Math.min(y0, l.y); y1 = Math.max(y1, l.y); }
    if (!fin(x0) || !fin(x1)) return null;
    return { x: x0 * W, y: y0 * H, w: (x1 - x0) * W, h: (y1 - y0) * H };
  }
  function meshTo68(lms, W, H) {
    if (!lms || lms.length < 455) return null;
    const b = boxOf(lms, W, H), c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const pts = Array.from({ length: 68 }, () => ({ x: c.x, y: c.y }));
    for (const [i, j] of Object.entries(MESH68)) pts[+i] = lmPx(lms[j], W, H);
    return pts;
  }
  /** column-major 4x4 (MediaPipe Matrix.data): the face's forward axis = 3rd column of the rotation, metric space x right, y up */
  function matrixAngles(d) {
    if (!d || d.length < 16) return null;
    const fx = d[8], fy = d[9], fz = d[10];
    if (![fx, fy, fz].every(fin)) return null;
    const n = Math.hypot(fx, fy, fz); if (!(n > 0)) return null;
    return { yaw: Math.atan2(fx, fz) * DEG, pitch: Math.atan2(-fy, Math.hypot(fx, fz)) * DEG };
  }
  // picked on the dev split by the fixed rule of docs/exam/FACE-ENGINE-RESULTS.md §1.7 (head-turn class accuracy):
  // mesh68 76.3 % vs matrix 71.1 % on dev renders. "matrix" is kept (lower median yaw error, under-reads large turns).
  const DEFAULT_POSE = "mesh68";
  /** @param {any[]} lms @param {number} W @param {number} H @param {{pose?: string, matrix?: any}} [o] */
  function poseFromMesh(lms, W, H, o) {
    const pts = meshTo68(lms, W, H); if (!pts) return null;
    const p68 = E.poseFrom68(pts);
    if (!p68) return null;
    const pose = (o && o.pose) || DEFAULT_POSE;
    if (pose === "mesh68") return p68;
    const m = o && o.matrix, a = matrixAngles(m && m.data ? m.data : m);
    if (!a) return null; // matrix mode without a matrix: no pose (head turn is not evaluated for this frame)
    return { yaw: a.yaw, pitchN: 0.45 + a.pitch / PITCH_K, mar: p68.mar, ipd: p68.ipd };
  }
  /** test seam: 478 normalised landmarks + a matrix whose poseFromMesh() gives back ~ (yawDeg, pitchDeg, mar) inside box */
  function synthMesh(box, yawDeg = 0, pitchDegV = 0, mar = 0.05, W = 640, H = 480) {
    const p68 = E.synth68(box, yawDeg, pitchDegV, mar), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const lms = Array.from({ length: 478 }, () => ({ x: cx / W, y: cy / H, z: 0 }));
    lms[10] = { x: cx / W, y: box.y / H, z: 0 }; // forehead top: the landmark box spans the given box
    for (const [i, j] of Object.entries(MESH68)) lms[j] = { x: p68[+i].x / W, y: p68[+i].y / H, z: 0 };
    const y = yawDeg / DEG, p = pitchDegV / DEG, data = new Array(16).fill(0);
    data[0] = 1; data[5] = 1; data[15] = 1;
    data[8] = Math.sin(y) * Math.cos(p); data[9] = -Math.sin(p); data[10] = Math.cos(y) * Math.cos(p);
    return { lms, matrix: { data } };
  }

  /* ---------- engines ---------- */
  const MP_OPTIONS = Object.freeze({
    runningMode: "IMAGE", numFaces: 4, minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    outputFacialTransformationMatrixes: true
  });
  const MP_MODEL = "vendor/models/face-landmarker/face_landmarker_lm.task";
  /** the only options a caller may change (thresholds and face count); everything else, including any output switch,
      is fixed by MP_OPTIONS and dropped from create({options}) / setOptions() */
  const MP_TUNABLE = Object.freeze(["numFaces", "minFaceDetectionConfidence", "minFacePresenceConfidence", "minTrackingConfidence"]);
  /** @param {any} x @returns {Record<string, number>} */
  function cleanOptions(x) {
    /** @type {Record<string, number>} */ const out = {};
    if (!x || typeof x !== "object") return out;
    for (const k of MP_TUNABLE) {
      const v = x[k];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (k === "numFaces") { if (Number.isInteger(v) && v >= 1 && v <= 8) out[k] = v; } else if (v >= 0 && v <= 1) out[k] = v;
    }
    return out;
  }
  const FACEAPI_NETS = Object.freeze(["tinyFaceDetector", "faceLandmark68Net"]);
  const FACEAPI_OPTS = Object.freeze({ sizes: [320, 224], scoreThreshold: 0.5, descriptors: false });

  function pickEngine(win) {
    const w = win || root;
    let q = "";
    try { q = new URLSearchParams(w.location.search).get("faceengine") || ""; } catch (e) { q = ""; }
    const research = !!(w.LENSIQ_RESEARCH && w.LENSIQ_RESEARCH.on === true && w.LENSIQ_PROFILE === "demo");
    return research && q === "faceapi" ? "faceapi" : "mediapipe";
  }
  const srcSize = src => ({ W: src.videoWidth || src.naturalWidth || src.width || 0, H: src.videoHeight || src.naturalHeight || src.height || 0 });

  /** o.vision (test seam, Node only): {FilesetResolver, FaceLandmarker} instead of importing the vendored bundle
   * @param {{base?: string, options?: object, pose?: string, vision?: any}} [o] */
  function createMediaPipe(o) {
    const base = (o && o.base) || (typeof location !== "undefined" ? location.href : "");
    const abs = p => new URL(p, base).href;
    const opts = Object.assign({}, MP_OPTIONS, cleanOptions(o && o.options));
    const pose = (o && o.pose) || DEFAULT_POSE;
    let lm = null, initP = null;
    const eng = {
      name: "mediapipe", options: opts,
      init() {
        if (!initP) initP = (async () => {
          const { FilesetResolver, FaceLandmarker } = (o && o.vision) || await import(abs("vendor/mediapipe/vision_bundle.mjs"));
          const files = await FilesetResolver.forVisionTasks(abs("vendor/mediapipe/wasm"));
          lm = await FaceLandmarker.createFromOptions(files, Object.assign({ baseOptions: { modelAssetPath: abs(MP_MODEL), delegate: "CPU" } }, opts));
          return eng;
        })();
        initP.catch(() => { initP = null; });
        return initP;
      },
      async setOptions(x) { const c = cleanOptions(x); await eng.init(); Object.assign(opts, c); await lm.setOptions(c); },
      async detect(src) {
        if (!lm) await eng.init();
        const { W, H } = srcSize(src);
        const r = lm.detect(src);
        const L = (r && r.faceLandmarks) || [], M = (r && r.facialTransformationMatrixes) || [];
        return L.map((l, i) => Object.assign({ box: boxOf(l, W, H) }, poseFromMesh(l, W, H, { pose, matrix: M[i] }) || { yaw: NaN, pitchN: NaN, mar: NaN, ipd: NaN }));
      },
      /** raw landmarks + matrices (the eval tool's renderer needs the mesh) */
      raw(src) { return lm.detect(src); },
      close() { try { lm && lm.close(); } catch (e) { /* ignore */ } lm = null; initP = null; }
    };
    return eng;
  }

  /** research demo only: face-api.js, injected on demand (never in a customer build) */
  /** @param {{base?: string}} [o] */
  function createFaceApi(o) {
    const base = (o && o.base) || (typeof location !== "undefined" ? location.href : "");
    const abs = p => new URL(p, base).href;
    let initP = null;
    const script = src => new Promise((res, rej) => {
      if (root.faceapi) { res(null); return; }
      const s = document.createElement("script"); s.src = src; s.onload = () => res(null); s.onerror = () => rej(new Error("load " + src));
      document.head.appendChild(s);
    });
    const eng = {
      name: "faceapi", backend: "",
      init() {
        if (!initP) initP = (async () => {
          await script(abs("vendor/face-api.js"));
          const fa = root.faceapi, tf = fa.tf;
          try { tf.setWasmPaths && tf.setWasmPaths(abs("vendor/")); } catch (e) { /* ignore */ }
          const gl = root.LQDetect && root.LQDetect.hasWebGL ? root.LQDetect.hasWebGL() : true;
          let q = ""; try { q = location.search; } catch (e) { q = ""; }
          const order = /[?&](cpu|nogl)\b/.test(q) || !gl ? ["wasm", "cpu"] : ["webgl", "wasm", "cpu"];
          for (const b of order) { try { if (await tf.setBackend(b)) { await tf.ready(); eng.backend = b; break; } } catch (e) { /* next */ } }
          await Promise.all(FACEAPI_NETS.map(n => fa.nets[n].loadFromUri(abs("vendor/models/"))));
          return eng;
        })();
        initP.catch(() => { initP = null; });
        return initP;
      },
      async detect(src) {
        await eng.init();
        const r = await root.LQDetect.detectFacesCascade(root.faceapi, src, FACEAPI_OPTS);
        return r.map(x => { const b = x.detection.box; return Object.assign({ box: { x: b.x, y: b.y, w: b.width, h: b.height } }, E.poseFrom68(x.landmarks.positions)); });
      }
    };
    return eng;
  }
  function create(name, o) { return name === "faceapi" ? createFaceApi(o) : createMediaPipe(o); }

  /* ---------- face boxes only (BlazeFace): hall small faces, lab second-person pass ---------- */
  /* docs/exam/FACE-ENGINE-RESULTS.md §6 – §7. Boxes and a detection score only: no landmarks, no pose, no identity, no
     expression. "short" = the detector inside the Face Landmarker (vendored bundle). The BlazeFace full-range model was
     measured too (it needs Tasks Vision 1.2.2: the vendored 0.10.x bundle rejects it, 2304 vs 896 anchors) but met no rule,
     so its files are NOT named here: the measurement tool passes them in `o.files` (tools/exam-hall-face-page.mjs). */
  const FD_MODELS = Object.freeze({
    short: Object.freeze({ bundle: "vendor/mediapipe/vision_bundle.mjs", wasm: "vendor/mediapipe/wasm", model: "vendor/models/face-gate/blaze_face_short_range.tflite" })
  });
  /** n x n overlapping tiles, normalised (= LQDetect.tileRects(n, n, overlap)) */
  function tileRects(n, overlap = 0.2) {
    const out = [], t = 1 / (n - (n - 1) * overlap);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = n > 1 ? c * (1 - t) / (n - 1) : 0, y = n > 1 ? r * (1 - t) / (n - 1) : 0;
      out.push({ x, y, w: Math.min(t, 1 - x), h: Math.min(t, 1 - y) });
    }
    return out;
  }
  const area = b => Math.max(0, b.w) * Math.max(0, b.h);
  function inter(a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  }
  /** same face: IoU >= iou or >= ios of the smaller box inside the other */
  function sameFace(a, b, iou = 0.3, ios = 0.6) {
    const i = inter(a, b), u = area(a) + area(b) - i;
    return (u > 0 && i / u >= iou) || i / Math.max(1e-9, Math.min(area(a), area(b))) >= ios;
  }
  /** score-sorted greedy merge of [{box, score}] (px) -> kept boxes */
  function mergeFaces(dets, o) {
    const keep = [];
    for (const d of (dets || []).filter(x => x && x.box && area(x.box) > 0).sort((a, b) => (b.score || 0) - (a.score || 0))) {
      if (!keep.some(k => sameFace(k.box, d.box, o && o.iou, o && o.ios))) keep.push(d);
    }
    return keep;
  }
  /** a detection box (px in the tile crop) -> frame px; null when it touches an inner tile edge (the face is cut) */
  function mapTileBox(b, rect, W, H, edge = 2) {
    const ox = rect.x * W, oy = rect.y * H, tw = rect.w * W, th = rect.h * H;
    const inner = { l: rect.x > 1e-6, t: rect.y > 1e-6, r: rect.x + rect.w < 1 - 1e-6, b: rect.y + rect.h < 1 - 1e-6 };
    if ((inner.l && b.x <= edge) || (inner.t && b.y <= edge) || (inner.r && b.x + b.w >= tw - edge) || (inner.b && b.y + b.h >= th - edge)) return null;
    return { x: ox + b.x, y: oy + b.y, w: b.w, h: b.h };
  }
  /** extra faces that are not the same face as any primary face (lab second-person pass) */
  function addSecondary(primary, extra) {
    const out = primary.slice();
    for (const e of mergeFaces(extra || [])) if (!out.some(p => p.box && sameFace(p.box, e.box))) out.push(e);
    return out;
  }
  /** defaults of createFaceBoxes (the measurement tool passes every field). NOT a pick: no BlazeFace option met the fixed
   *  hall rule (§6.5, §7.1), so no page creates a FaceDetector; tools/exam-hall-face-eval.mjs is the only caller.
   *  @type {Readonly<{model: string, tiles: number, whole: boolean, conf: number, overlap: number}>} */
  const FB_DEFAULT = Object.freeze({ model: "short", tiles: 3, whole: true, conf: 0.5, overlap: 0.2 });
  /** hall face pass = the option the fixed rule of §6.5 picked on dev (§7.1): the lab engine on the whole frame, numFaces 8,
   *  detection 0.5. It finds NO face 24 – 48 px wide (0 / 207 dev, 0 / 195 held-out): the small-face issue is not fixed. */
  const HALL_FACE = Object.freeze({ engine: "landmarker", numFaces: 8, conf: 0.5 });
  /** hall face pass (experimental, off by default): boxes only -> {init, detect(src) -> [{box px}]}; no pose, no landmarks out
   * @param {{base?: string, vision?: any}} [o] */
  function createHallFaces(o) {
    const e = createMediaPipe(Object.assign({}, o || {}, { options: { numFaces: HALL_FACE.numFaces, minFaceDetectionConfidence: HALL_FACE.conf } }));
    return {
      name: "hallfaces", engine: HALL_FACE.engine, numFaces: HALL_FACE.numFaces, conf: HALL_FACE.conf,
      init: () => e.init(),
      async detect(/** @type {any} */ src) { return (await e.detect(src)).map((/** @type {any} */ f) => ({ box: f.box })); },
      close() { if (e.close) e.close(); }
    };
  }
  /** lab second-person cue = N4@0.5, the option the fixed rule of §6.8 picked on dev (§7.2): COCO-SSD person boxes (score >=
   *  minScore from the detector, counted at >= score, one box per person at IoU >= iou). The monitor uses the count only
   *  while the face engine sees at least one face, so the no-face signal is unchanged. */
  const LAB_PEOPLE = Object.freeze({ minScore: 0.3, score: 0.5, iou: 0.5, max: 20 });
  /** person boxes [{box|x,y,w,h, score}] -> the kept boxes (>= score, merged); units do not matter (IoU only)
   * @param {any[]} dets @param {number} [score] */
  function peopleBoxes(dets, score = LAB_PEOPLE.score) {
    return mergeFaces((dets || []).filter(d => d && d.score >= score).map(d => ({ box: d.box || { x: d.x, y: d.y, w: d.w, h: d.h }, score: d.score })), { iou: LAB_PEOPLE.iou, ios: 2 });
  }
  /** face boxes: {model (a label; "short" = FD_MODELS.short), files {bundle, wasm, model} for any other model, tiles 0|2|3,
   * whole (a whole-frame pass too), conf} -> {init, detect(src) -> [{box px, score}]}
   * o.vision / o.makeCanvas (test seams): {FilesetResolver, FaceDetector} / () => a canvas-like object for the tile crops
   * @param {{model?: string, files?: {bundle: string, wasm: string, model: string}, tiles?: number, whole?: boolean, conf?: number, overlap?: number,
   *   base?: string, vision?: any, makeCanvas?: () => any}} [o] */
  function createFaceBoxes(o) {
    const c = Object.assign({}, FB_DEFAULT, o || {});
    const M = c.files || FD_MODELS.short;
    const tiles = c.tiles === 2 || c.tiles === 3 ? c.tiles : 0;
    const conf = fin(c.conf) && c.conf > 0 && c.conf < 1 ? c.conf : 0.5;
    const base = c.base || (typeof location !== "undefined" ? location.href : "");
    const abs = p => new URL(p, base).href;
    const rects = (c.whole !== false || !tiles ? [{ x: 0, y: 0, w: 1, h: 1 }] : []).concat(tiles ? tileRects(tiles, c.overlap) : []);
    let fd = null, initP = null, cv = null;
    const eng = {
      name: "faceboxes", model: c.files ? String(c.model || "custom") : "short", tiles, whole: rects[0].w === 1, conf, passes: rects.length,
      init() {
        if (!initP) initP = (async () => {
          const { FilesetResolver, FaceDetector } = c.vision || await import(abs(M.bundle));
          const files = await FilesetResolver.forVisionTasks(abs(M.wasm));
          fd = await FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: abs(M.model), delegate: "CPU" }, runningMode: "IMAGE", minDetectionConfidence: conf });
          return eng;
        })();
        initP.catch(() => { initP = null; });
        return initP;
      },
      async detect(src) {
        if (!fd) await eng.init();
        const { W, H } = srcSize(src);
        if (!W || !H) return [];
        const all = [];
        for (const r of rects) {
          let img = src, cw = W, ch = H;
          if (r.w < 1 || r.h < 1) {
            cw = Math.max(1, Math.round(r.w * W)); ch = Math.max(1, Math.round(r.h * H));
            if (!cv) cv = c.makeCanvas ? c.makeCanvas() : document.createElement("canvas");
            if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
            cv.getContext("2d").drawImage(src, r.x * W, r.y * H, cw, ch, 0, 0, cw, ch);
            img = cv;
          }
          const res = fd.detect(img);
          for (const d of (res && res.detections) || []) {
            const bb = d.boundingBox; if (!bb) continue;
            const m = mapTileBox({ x: bb.originX, y: bb.originY, w: bb.width, h: bb.height }, r, W, H);
            if (m) all.push({ box: m, score: d.categories && d.categories[0] ? d.categories[0].score : 0 });
          }
        }
        return mergeFaces(all);
      },
      close() { try { fd && fd.close(); } catch (e) { /* ignore */ } fd = null; initP = null; }
    };
    return eng;
  }

  return {
    MESH68, PITCH_K, DEFAULT_POSE, MP_OPTIONS, MP_TUNABLE, MP_MODEL, FACEAPI_NETS, FACEAPI_OPTS, cleanOptions,
    boxOf, meshTo68, matrixAngles, poseFromMesh, synthMesh, pickEngine, create, createMediaPipe, createFaceApi,
    FD_MODELS, FB_DEFAULT, HALL_FACE, LAB_PEOPLE, tileRects, sameFace, mergeFaces, mapTileBox, addSecondary, peopleBoxes, createFaceBoxes, createHallFaces
  };
});
