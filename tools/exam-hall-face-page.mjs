// tools/exam-hall-face-page.mjs — the in-page part of tools/exam-hall-face-eval.mjs (runs inside headless Chrome on
// exam-hall.html). window.__eh = {init, hall, lab, latency}. Uses the page's own code: LQExamFace.createMediaPipe (the lab
// engine), LQExamFace.createFaceBoxes (the hall / second-person pass) and LQDetect.detectCoco (COCO-SSD).
// Frames: hall 1280 x 720, lab 640 x 480, image letterboxed on #808080 (docs/exam/FACE-ENGINE-RESULTS.md §6).
// `vendorBase` = the same-origin URL prefix under which the eval tool serves the measurement-only files (Tasks Vision
// 1.2.2 + BlazeFace full-range), which are kept OUTSIDE the repo (docs/exam/FACE-ENGINE-RESULTS.md §7.3).
export async function PAGE_LIB(vendorBase) {
  const load = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
  if (!window.LQExamFace) await load("lensiq-exam-face.js");
  const F = window.LQExamFace, D = window.LQDetect;
  const eh = { fl: {}, fb: {}, coco: null };
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  async function frame(data, FW, FH) {
    const img = new Image(); img.src = "data:image/jpeg;base64," + data; await img.decode();
    const c = canvas(FW, FH), g = c.getContext("2d");
    g.fillStyle = "#808080"; g.fillRect(0, 0, FW, FH);
    const s = Math.min(FW / img.naturalWidth, FH / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s, ox = (FW - w) / 2, oy = (FH - h) / 2;
    g.drawImage(img, ox, oy, w, h);
    return { c, map: (x0, x1, y0, y1) => ({ x: ox + x0 * w, y: oy + y0 * h, w: (x1 - x0) * w, h: (y1 - y0) * h }) };
  }
  const r1 = v => Math.round(v * 10) / 10;
  const box1 = b => ({ x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h) });
  // FaceDetector engines: one per (model, conf); tiles are applied by separate createFaceBoxes instances sharing nothing
  const FB = [];
  for (const model of ["short", "full"]) for (const conf of [0.5, 0.3]) for (const tiles of [0, 2, 3]) FB.push({ model, conf, tiles, whole: true });
  for (const conf of [0.5, 0.3]) FB.push({ model: "short", conf, tiles: 2, whole: false }); // lab N3 (tiles only)
  // measurement-only files (docs/exam/FACE-ENGINE-RESULTS.md §7.3): outside the repo, named here, never in a page script
  if (!vendorBase) throw new Error("exam-hall-face-page: vendorBase missing (the eval tool passes it)");
  const FULL = { bundle: vendorBase + "/mediapipe-1.2.2/vision_bundle.mjs", wasm: vendorBase + "/mediapipe-1.2.2/wasm", model: vendorBase + "/models/face-detector-full/blaze_face_full_range.tflite" };
  for (const o of FB) if (o.model === "full") o.files = FULL;
  const fbKey = o => `${o.model}@${o.conf}:t${o.tiles}${o.whole ? "" : "only"}`;
  /** keys: a subset of the engine keys (fl4@0.5 …, short@0.5:t2 …, coco). One phase per page load: Chrome keeps at most
   *  16 live WebGL contexts per page and silently drops the oldest (seen: 18 MediaPipe instances -> the first Face
   *  Landmarkers returned no face at all), so the eval creates few engines per page. */
  eh.init = async keys => {
    for (const k of keys) {
      if (k === "coco") { await D.tfBackend(); eh.coco = await D.loadCoco("vendor/models/cocossd/model.json"); continue; }
      if (k.startsWith("fl")) { const [n, t] = [+k[2], +k.split("@")[1]]; const e = F.createMediaPipe({ options: { numFaces: n, minFaceDetectionConfidence: t } }); await e.init();
        eh.fl[k] = e; continue; }
      const o = FB.find(x => fbKey(x) === k); if (!o) throw new Error("unknown engine " + k);
      const e = F.createFaceBoxes(o); await e.init(); eh.fb[k] = e;
    }
    const w = canvas(1280, 720); w.getContext("2d").fillRect(0, 0, 1280, 720);
    for (const e of Object.values(eh.fl)) await e.detect(w);
    for (const e of Object.values(eh.fb)) await e.detect(w);
    if (eh.coco) await D.detectCoco(eh.coco, w, { classes: [0], minScore: 0.3, max: 20 });
    return { fl: Object.keys(eh.fl), fb: Object.keys(eh.fb), coco: !!eh.coco, tf: window.tf && window.tf.getBackend() };
  };
  eh.allKeys = () => ["fl4@0.5", "fl4@0.3", "fl8@0.5", "fl8@0.3", ...FB.map(fbKey)];
  async function flBoxes(e, c) { const t0 = performance.now(); const r = await e.detect(c); return { ms: performance.now() - t0, d: r.map(f => ({ box: box1(f.box) })) }; }
  async function fbBoxes(e, c) { const t0 = performance.now(); const r = await e.detect(c); return { ms: performance.now() - t0, d: r.map(f => ({ box: box1(f.box),
    s: Math.round(f.score * 1000) / 1000 })) }; }
  async function cocoBoxes(c, W, H) {
    const t0 = performance.now();
    const r = await D.detectCoco(eh.coco, c, { classes: [0], minScore: 0.3, max: 20 });
    return { ms: performance.now() - t0, d: r.map(b => ({ box: box1({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H }), s: Math.round(b.score * 1000) / 1000 })) };
  }
  eh.hall = async (data, faces) => {
    const fr = await frame(data, 1280, 720);
    const boxes = faces.map(f => ({ ...box1(fr.map(f[0], f[1], f[2], f[3])), ign: !!f[4] }));
    const out = { boxes, fl: {}, fb: {} };
    for (const [k, e] of Object.entries(eh.fl)) out.fl[k] = await flBoxes(e, fr.c);
    for (const [k, e] of Object.entries(eh.fb)) if (!k.endsWith("only")) out.fb[k] = await fbBoxes(e, fr.c);
    return out;
  };
  eh.lab = async (data, faces, persons) => {
    const fr = await frame(data, 640, 480);
    const out = { faces: faces.map(f => box1(fr.map(...f))), persons: persons.map(p => box1(fr.map(...p))), fl: {}, fb: {} };
    for (const k of ["fl4@0.5", "fl4@0.3"]) if (eh.fl[k]) out.fl[k] = await flBoxes(eh.fl[k], fr.c);
    for (const k of ["full@0.5:t0", "full@0.3:t0", "short@0.5:t2only", "short@0.3:t2only"]) if (eh.fb[k]) out.fb[k] = await fbBoxes(eh.fb[k], fr.c);
    if (eh.coco) out.coco = await cocoBoxes(fr.c, 640, 480);
    return out;
  };
  /** timing on a fixed subset: every hall option as the page would run it, plus COCO-SSD (hall call) */
  eh.latency = async (datas, keys) => {
    const frames = []; for (const d of datas) frames.push((await frame(d, 1280, 720)).c);
    const out = {};
    for (const k of keys) {
      const e = eh.fl[k] || eh.fb[k]; if (!e) continue; const ms = [];
      await e.detect(frames[0]);
      for (const c of frames) { const t0 = performance.now(); await e.detect(c); ms.push(performance.now() - t0); }
      out[k] = ms;
    }
    if (!eh.coco) return out;
    const ms = [];
    await D.detectCoco(eh.coco, frames[0], { classes: [0, 76], minScore: 0.35, max: 40 });
    for (const c of frames) { const t0 = performance.now(); await D.detectCoco(eh.coco, c, { classes: [0, 76], minScore: 0.35, max: 40 }); ms.push(performance.now() - t0); }
    out.coco = ms;
    return out;
  };
  window.__eh = eh;
  return true;
}
