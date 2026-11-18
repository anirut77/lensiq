// tools/hall-faces-page.mjs — the in-page part of tools/hall-faces-eval.mjs (runs inside headless Chrome on a page of
// the served repo). window.__hf = {build, init, frame, latency}.
//   build(spec)            renders one synthetic hall frame (tools/hall-faces-scene.js) -> {jpeg (base64), gt}
//   init(engine)           "lm8" = LQExamFace.createHallFaces() (the current hall face pass, vendored bundle) or a
//                          FaceDetector (MediaPipe Tasks Vision 1.2.2, CPU delegate, IMAGE mode, minDetectionConfidence
//                          0.3) on one model file: "short" | "dense" | "sparse"
//   frame(b64, tiles)      raw boxes per pass: whole frame + every tile size (px, overlap 0.2), boxes mapped to frame px,
//                          boxes touching an inner tile edge dropped (LQExamFace.mapTileBox); merging happens in Node
//   latency(b64s, configs, scale)  ms per full sweep (whole + tiles + merge) as a page would run it
// Measurement-only files (Tasks Vision 1.2.2, BlazeFace full-range dense + sparse) are served by the eval tool under
// `vendorBase` from OUTSIDE the repo; no page script of the product names them.
export async function PAGE_LIB(vendorBase) {
  const load = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
  if (!window.LQSynthFace) await load("tools/look-synth-face.js");
  if (!window.LQHallScene) await load("tools/hall-faces-scene.js");
  if (!window.LQExamFace) await load("lensiq-exam-face.js");
  const F = window.LQExamFace;
  const hf = { eng: null, name: null };
  const MODELS = {
    short: "vendor/models/face-gate/blaze_face_short_range.tflite",
    dense: vendorBase + "/legacy/face_detection_full_range.tflite",
    sparse: vendorBase + "/legacy/face_detection_full_range_sparse.tflite"
  };
  const MP = { bundle: vendorBase + "/mediapipe-1.2.2/vision_bundle.mjs", wasm: vendorBase + "/mediapipe-1.2.2/wasm" };
  const abs = p => new URL(p, location.href).href;
  const r1 = v => Math.round(v * 10) / 10;

  hf.build = async spec => {
    const c = document.createElement("canvas");
    const gt = window.LQHallScene.render(c, spec);
    const url = c.toDataURL("image/jpeg", 0.9);
    return { jpeg: url.slice(url.indexOf(",") + 1), gt: { faces: gt.faces.map(f => ({ x: r1(f.x), y: r1(f.y), w: r1(f.w), h: r1(f.h), px: f.px })), backs: gt.backs, persons: gt.persons } };
  };

  hf.init = async name => {
    hf.name = name;
    if (name === "lm8") { hf.eng = F.createHallFaces(); await hf.eng.init(); hf.kind = "lm"; }
    else {
      const { FilesetResolver, FaceDetector } = await import(abs(MP.bundle));
      const files = await FilesetResolver.forVisionTasks(abs(MP.wasm));
      hf.eng = await FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: abs(MODELS[name]), delegate: "CPU" }, runningMode: "IMAGE", minDetectionConfidence: 0.3 });
      hf.kind = "fd";
    }
    const w = document.createElement("canvas"); w.width = 640; w.height = 480; w.getContext("2d").fillRect(0, 0, 640, 480);
    await detectRaw(w);
    return { name, kind: hf.kind };
  };
  async function detectRaw(img) {
    if (hf.kind === "lm") return (await hf.eng.detect(img)).map(f => ({ box: f.box, score: 1 }));
    const res = hf.eng.detect(img);
    return ((res && res.detections) || []).filter(d => d.boundingBox).map(d => ({ box: { x: d.boundingBox.originX, y: d.boundingBox.originY, w: d.boundingBox.width, h: d.boundingBox.height },
      score: d.categories && d.categories[0] ? d.categories[0].score : 0 }));
  }
  /** SAHI-style slices of T px with overlap ov (fraction), evenly spread; normalised rects for mapTileBox */
  function tilesPx(W, H, T, ov = 0.2) {
    const axis = L => {
      if (L <= T) return [[0, L]];
      const o = T * ov, n = Math.ceil((L - o) / (T - o)), out = [];
      for (let i = 0; i < n; i++) out.push([Math.round(i * (L - T) / (n - 1)), T]);
      return out;
    };
    const out = [];
    for (const [y, h] of axis(H)) for (const [x, w] of axis(W)) out.push({ x: x / W, y: y / H, w: w / W, h: h / H });
    return out;
  }
  hf.tilesPx = tilesPx;
  const cvs = {};
  async function pass(src, W, H, rect) {
    if (rect.w >= 1 && rect.h >= 1) return (await detectRaw(src)).map(d => ({ box: d.box, score: d.score }));
    const cw = Math.round(rect.w * W), ch = Math.round(rect.h * H), key = cw + "x" + ch;
    const cv = cvs[key] || (cvs[key] = Object.assign(document.createElement("canvas"), { width: cw, height: ch }));
    cv.getContext("2d").drawImage(src, Math.round(rect.x * W), Math.round(rect.y * H), cw, ch, 0, 0, cw, ch);
    const out = [];
    for (const d of await detectRaw(cv)) { const m = F.mapTileBox(d.box, rect, W, H); if (m) out.push({ box: m, score: d.score }); }
    return out;
  }
  async function toCanvas(b64, scale = 1) {
    const img = new Image(); img.src = "data:image/jpeg;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  const rb = d => ({ x: r1(d.box.x), y: r1(d.box.y), w: r1(d.box.w), h: r1(d.box.h), s: Math.round(d.score * 1000) / 1000 });
  hf.frame = async (b64, tiles) => {
    const c = await toCanvas(b64), W = c.width, H = c.height, out = { whole: (await pass(c, W, H, { x: 0, y: 0, w: 1, h: 1 })).map(rb) };
    for (const T of tiles) { const all = []; for (const r of tilesPx(W, H, T)) all.push(...await pass(c, W, H, r)); out["t" + T] = all.map(rb); }
    return out;
  };
  /** configs: [{tiles: T px or 0, conf}] -> {key: [ms per sweep]} (whole + tiles + merge, as a page would run it) */
  hf.latency = async (b64s, configs, scale = 1) => {
    const frames = []; for (const b of b64s) frames.push(await toCanvas(b, scale));
    const out = {};
    for (const cf of configs) {
      const W = frames[0].width, H = frames[0].height, rects = [{ x: 0, y: 0, w: 1, h: 1 }].concat(cf.tiles ? tilesPx(W, H, cf.tiles) : []);
      const sweep = async c => { const all = []; for (const r of rects) all.push(...await pass(c, W, H, r)); return F.mergeFaces(all.filter(d => d.score >= cf.conf)); };
      await sweep(frames[0]);
      const ms = [];
      for (const c of frames) { const t0 = performance.now(); await sweep(c); ms.push(Math.round((performance.now() - t0) * 10) / 10); }
      out[`${hf.name}:t${cf.tiles}@${cf.conf}:${W}x${H}`] = { ms, passes: rects.length };
    }
    return out;
  };
  window.__hf = hf;
  return true;
}
