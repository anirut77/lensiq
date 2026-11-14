// tools/attendance-face/page.js — in-page part of tools/attendance-face/run.mjs (headless Chrome, no WebGL, WASM, 1 thread).
// window.AFE = {ready, init(models), image(url)}. Evaluation only; never loaded by a product page.
// Frame: each 1350 px photo is drawn 480 x 480 into a 640 x 480 #808080 frame (a kiosk webcam frame, face at ~0.5 m).
// Baseline: LQDetect.detectFacesCascade (face-api TinyFaceDetector 320/224/160 + 68 landmarks + 128-D dlib descriptor),
//   exactly as attendance.js calls it; the largest face is kept.
// Candidates: MediaPipe Face Landmarker (vendored, Apache-2.0) finds the face and 5 points (eye centres, nose tip, mouth
//   corners); a 4-DOF similarity transform maps them onto the standard ArcFace 112 x 112 template; each ONNX embedder
//   gets that crop with its own documented preprocessing. Embeddings are L2-normalised.
const FW = 640, FH = 480, S = 480;
const TEMPLATE = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
const r4 = x => Math.round(x * 1e4) / 1e4;
const now = () => performance.now();
let lm = null, sessions = {}, specs = {};

async function init(models) {
  // face-api baseline (same loader as attendance.js)
  await LQDetect.tfBackend();
  await Promise.all(["tinyFaceDetector", "faceLandmark68Net", "faceRecognitionNet"].map(n => faceapi.nets[n].loadFromUri("vendor/models")));
  const { FilesetResolver, FaceLandmarker } = await import(new URL("vendor/mediapipe/vision_bundle.mjs", location.href).href);
  const files = await FilesetResolver.forVisionTasks(new URL("vendor/mediapipe/wasm", location.href).href);
  const task = new URL("vendor/models/face-landmarker/face_landmarker_lm.task", location.href).href;
  lm = await FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: task, delegate: "CPU" },
    runningMode: "IMAGE", numFaces: 4, minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5
  });
  ort.env.wasm.wasmPaths = new URL("vendor/ort/", location.href).href;
  ort.env.wasm.numThreads = 1;
  const info = { tfBackend: faceapi.tf.getBackend(), ortThreads: ort.env.wasm.numThreads, crossOriginIsolated: !!self.crossOriginIsolated, models: {} };
  for (const m of models) {
    const opt = { executionProviders: ["wasm"], graphOptimizationLevel: "all", logSeverityLevel: 3 };
    if (m.externalData) opt.externalData = m.externalData.map(p => ({ path: p.split("/").pop(), data: p }));
    sessions[m.key] = await ort.InferenceSession.create(m.url, opt);
    specs[m.key] = m;
    info.models[m.key] = { inputs: sessions[m.key].inputNames, outputs: sessions[m.key].outputNames };
  }
  return info;
}

function frameOf(img) {
  const c = document.createElement("canvas"); c.width = FW; c.height = FH;
  const g = c.getContext("2d"); g.fillStyle = "#808080"; g.fillRect(0, 0, FW, FH);
  g.imageSmoothingQuality = "high";
  g.drawImage(img, (FW - S) / 2, 0, S, S);
  return c;
}

// least-squares similarity transform (Umeyama, no reflection): dst ≈ s R src + t
function similarity(src, dst) {
  const n = src.length; let mx = 0, my = 0, ux = 0, uy = 0;
  for (let i = 0; i < n; i++) { mx += src[i][0]; my += src[i][1]; ux += dst[i][0]; uy += dst[i][1]; }
  mx /= n; my /= n; ux /= n; uy /= n;
  let a = 0, b = 0, v = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - mx, sy = src[i][1] - my, dx = dst[i][0] - ux, dy = dst[i][1] - uy;
    a += sx * dx + sy * dy; b += sx * dy - sy * dx; v += sx * sx + sy * sy;
  }
  const p = a / v, q = b / v; // [p -q; q p]
  return { p, q, tx: ux - (p * mx - q * my), ty: uy - (q * mx + p * my) };
}

function fivePoints(L, W, H) {
  const P = i => [L[i].x * W, L[i].y * H];
  const mean = ids => { const s = ids.map(P); return [s.reduce((a, p) => a + p[0], 0) / s.length, s.reduce((a, p) => a + p[1], 0) / s.length]; };
  // eye centres: iris centres 468 / 473 when present (478-point model), else the mean of the eye corners
  const e1 = L.length >= 478 ? P(468) : mean([33, 133]), e2 = L.length >= 478 ? P(473) : mean([362, 263]);
  const m1 = P(61), m2 = P(291);
  const eyes = [e1, e2].sort((a, b) => a[0] - b[0]), mouth = [m1, m2].sort((a, b) => a[0] - b[0]);
  return [eyes[0], eyes[1], P(1), mouth[0], mouth[1]];
}

function aligned(c, pts) {
  const T = similarity(pts, TEMPLATE);
  const o = document.createElement("canvas"); o.width = o.height = 112;
  const g = o.getContext("2d"); g.imageSmoothingQuality = "high";
  g.setTransform(T.p, T.q, -T.q, T.p, T.tx, T.ty);
  g.drawImage(c, 0, 0);
  return g.getImageData(0, 0, 112, 112).data;
}

function tensorOf(px, pre) {
  const N = 112 * 112, f = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) {
    const v = px[i * 4 + (pre.bgr ? 2 - k : k)];
    f[k * N + i] = (v - pre.mean) / pre.std;
  }
  return new ort.Tensor("float32", f, [1, 3, 112, 112]);
}

async function embed(key, px) {
  const s = sessions[key], m = specs[key], t = tensorOf(px, m.pre), feeds = {};
  for (const n of s.inputNames) feeds[n] = t; // MobileFaceNet (Qualcomm export) takes two images; both get the same crop
  const out = await s.run(feeds);
  const d = out[s.outputNames[0]].data, e = Array.from(d.slice(0, m.dim));
  Object.values(out).forEach(x => x.dispose && x.dispose());
  const nrm = Math.hypot(...e) || 1;
  return e.map(x => r4(x / nrm));
}

async function image(url) {
  const img = new Image(); img.src = url; await img.decode();
  const c = frameOf(img), out = { url, t: {} };
  // baseline
  let t0 = now();
  const rs = await LQDetect.detectFacesCascade(faceapi, c, { sizes: LQDetect.FACE_SIZES, scoreThreshold: 0.5 });
  out.t.faceapi = r4(now() - t0);
  if (rs.length) {
    const r = rs.slice().sort((a, b) => b.detection.box.area - a.detection.box.area)[0];
    out.faceapi = { n: rs.length, w: Math.round(r.detection.box.width), desc: Array.from(r.descriptor, r4) };
  } else out.faceapi = { n: 0 };
  // candidates
  t0 = now();
  const det = lm.detect(c);
  out.t.landmarker = r4(now() - t0);
  const faces = (det.faceLandmarks || []);
  if (!faces.length) { out.mp = { n: 0 }; return out; }
  const area = L => { const xs = L.map(p => p.x), ys = L.map(p => p.y); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
  const big = faces.slice().sort((a, b) => area(b) - area(a))[0];
  const pts = fivePoints(big, FW, FH);
  t0 = now(); const px = aligned(c, pts); out.t.align = r4(now() - t0);
  out.mp = { n: faces.length, pts: pts.map(p => p.map(v => Math.round(v * 10) / 10)) };
  out.emb = {};
  for (const key of Object.keys(sessions)) { t0 = now(); out.emb[key] = await embed(key, px); out.t[key] = r4(now() - t0); }
  return out;
}

window.AFE = { init, image, ready: true };
