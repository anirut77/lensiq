/* tests/bench/bench-page2.js — window.LQB2, browser side of the driver / neuro / checkout benchmarks.
 * Calls the same production code paths as the pages:
 *   driver.js  faceapi TinyFaceDetector (inputSize 224 default, score 0.4) + 68 landmarks -> landmark points (EAR in Node)
 *   neuro.js   faceapi TinyFaceDetector (320, 0.45) + landmarks + faceExpressionNet
 *   checkout.js native BarcodeDetector({formats: getSupportedFormats()}) on rendered barcode scenes
 * Only numbers leave the page. */
(function () {
  "use strict";
  const MODEL = "vendor/models/";
  const img = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("load " + url)); i.src = url; });
  const r3 = v => Math.round(v * 1e3) / 1e3;
  const loaded = new Set();
  async function nets(names) {
    await LQDetect.tfBackend();
    await Promise.all(names.filter(n => !loaded.has(n)).map(async n => { await faceapi.nets[n].loadFromUri(MODEL); loaded.add(n); }));
  }
  /* small/cropped dataset faces: upscale to `scale`× and centre on a grey `padTo` canvas (detector needs context) */
  function prep(src, { scale = 1, padTo = 0, gray = false } = {}) {
    if (scale === 1 && !padTo) return src;
    const w = Math.round(src.width * scale), h = Math.round(src.height * scale), P = Math.max(padTo, w, h);
    const c = document.createElement("canvas"); c.width = c.height = P;
    const x = c.getContext("2d"); x.fillStyle = "#808080"; x.fillRect(0, 0, P, P);
    x.imageSmoothingQuality = "high"; x.drawImage(src, (P - w) / 2, (P - h) / 2, w, h);
    if (gray) { const d = x.getImageData(0, 0, P, P); for (let i = 0; i < d.data.length; i += 4) { const v = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; } x.putImageData(d, 0, 0); }
    return c;
  }
  /* grey 32×16 patch around one eye (6 landmarks), 1.8× the eye width — the same crop as driver.js eyePatchRect/eyeGray,
     input of the eye-patch classifier (eyeClosedScore) */
  const pc = document.createElement("canvas"); pc.width = 32; pc.height = 16;
  function eyePatch(src, p) {
    const cx = p.reduce((a, q) => a + q.x, 0) / 6, cy = p.reduce((a, q) => a + q.y, 0) / 6, w = Math.hypot(p[3].x - p[0].x, p[3].y - p[0].y) * 1.8, h = w / 2;
    const x = pc.getContext("2d", { willReadFrequently: true }); x.drawImage(src, cx - w / 2, cy - h / 2, w, h, 0, 0, 32, 16);
    const d = x.getImageData(0, 0, 32, 16).data, g = new Uint8Array(512);
    for (let i = 0; i < 512; i++) g[i] = (d[4 * i] * 0.299 + d[4 * i + 1] * 0.587 + d[4 * i + 2] * 0.114) | 0;
    let s = ""; for (const v of g) s += String.fromCharCode(v); return btoa(s);
  }
  /* video-like frame-to-frame variation of a still photo (seeded): shift ±3%, scale ±5%, exposure ±15%, slight blur */
  function jitter(src, seed) {
    let t = seed * 2654435761 >>> 0; const r = () => ((t = (t * 1664525 + 1013904223) >>> 0) / 4294967296);
    const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
    const x = c.getContext("2d"), W = src.width, H = src.height, k = 1 + (r() - 0.5) * 0.1;
    x.fillStyle = "#808080"; x.fillRect(0, 0, W, H);
    x.filter = `brightness(${(0.85 + r() * 0.3).toFixed(3)}) blur(${(r() * 0.8).toFixed(2)}px)`;
    x.drawImage(src, (W - W * k) / 2 + (r() - 0.5) * 0.06 * W, (H - H * k) / 2 + (r() - 0.5) * 0.06 * H, W * k, H * k);
    return c;
  }
  const largest = rs => rs.slice().sort((a, b) => b.detection.box.area - a.detection.box.area)[0];

  let bd = null;
  const LQB2 = {
    /* driver: 68-point landmarks of the largest face, as driver.js gets them */
    async driver(urls, { inputSize = 224, scoreThreshold = 0.4, scale = 1, padTo = 0, patches = false, aug = 0 } = {}) {
      await nets(["tinyFaceDetector", "faceLandmark68Net"]);
      const opts = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold });
      const out = [];
      for (const u of urls) {
        let src = prep(await img(u), { scale, padTo });
        if (aug) src = jitter(src, aug);
        const t0 = performance.now();
        const rs = await faceapi.detectAllFaces(src, opts).withFaceLandmarks();
        const ms = Math.round(performance.now() - t0);
        if (!rs.length) { out.push({ n: 0, ms }); continue; }
        const r = largest(rs), b = r.detection.box;
        out.push({ n: rs.length, ms, score: r3(r.detection.score), box: [r3(b.x), r3(b.y), r3(b.width), r3(b.height)], W: src.width, H: src.height,
          pts: r.landmarks.positions.map(p => [r3(p.x), r3(p.y)]), eyes: patches ? [36, 42].map(k => eyePatch(src, r.landmarks.positions.slice(k, k + 6))) : undefined });
      }
      return out;
    },
    /* neuro: page pipeline (detect + landmarks + expressions) and, separately, the expression classifier alone on the
       whole (cropped) image — FER images are already face crops */
    async neuro(urls, { inputSize = 320, scoreThreshold = 0.45, scale = 1, padTo = 0 } = {}) {
      await nets(["tinyFaceDetector", "faceLandmark68Net", "faceExpressionNet"]);
      const opts = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold });
      const out = [];
      for (const u of urls) {
        const raw = await img(u), src = prep(raw, { scale, padTo });
        const rs = await faceapi.detectAllFaces(src, opts).withFaceLandmarks().withFaceExpressions();
        const crop = prep(raw, { scale: 112 / raw.width });
        const ex = await faceapi.nets.faceExpressionNet.predictExpressions(crop);
        const row = { n: rs.length, cls: Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, r3(v)])) };
        if (rs.length) row.pipe = Object.fromEntries(Object.entries(largest(rs).expressions).map(([k, v]) => [k, r3(v)]));
        out.push(row);
      }
      return out;
    },
    async barcodeFormats() {
      if (!("BarcodeDetector" in window)) return null;
      return BarcodeDetector.getSupportedFormats();
    },
    /* checkout: decode one rendered scene (data URL or canvas spec) with the page's detector configuration */
    async barcode(dataUrls) {
      if (!bd) bd = new BarcodeDetector({ formats: await BarcodeDetector.getSupportedFormats() });
      const out = [];
      for (const u of dataUrls) {
        const im = await img(u);
        const t0 = performance.now();
        let codes = [];
        try { codes = await bd.detect(im); } catch (e) { out.push({ err: String(e) }); continue; }
        out.push({ ms: Math.round(performance.now() - t0), codes: codes.map(c => ({ v: c.rawValue, f: c.format })) });
      }
      return out;
    }
  };
  // ---------- licence-clean barcode renderers (written for this benchmark; EAN-13 / UPC-A and Code 128-B) ----------
  const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const EAN_PAR = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
  const inv = s => s.replace(/./g, c => c === "0" ? "1" : "0");
  function eanModules(code13) {
    const d = code13.split("").map(Number), par = EAN_PAR[d[0]];
    let m = "101";
    for (let i = 1; i <= 6; i++) { const L = EAN_L[d[i]]; m += par[i - 1] === "L" ? L : inv(L).split("").reverse().join(""); }
    m += "01010";
    for (let i = 7; i <= 12; i++) m += inv(EAN_L[d[i]]);
    return { mods: m + "101", quietL: 11, quietR: 7 };
  }
  const C128 = ("212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 " +
    "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 " +
    "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
    "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
    "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 " +
    "114131 311141 411131 211412 211214 211232 2331112").split(" ");
  function c128Modules(text) {
    const vals = [104, ...text.split("").map(c => c.charCodeAt(0) - 32)];
    const chk = vals.reduce((s, v, i) => s + v * (i || 1), 0) % 103;
    let m = "";
    for (const v of [...vals, chk, 106]) C128[v].split("").forEach((w, i) => { m += (i % 2 ? "0" : "1").repeat(+w); });
    return { mods: m, quietL: 10, quietR: 10 };
  }
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const gauss = r => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  /* one camera-like 640×480 scene: textured package background, white label, barcode drawn with module width `mod` px,
     rotated `rot`°, foreshortened by `tilt`° (cos scale + shear), optional cylinder curvature, then optical blur, dim/glare
     lighting, sensor noise, partial occlusion and JPEG compression. */
  async function scene(s) {
    const W = 640, H = 480, r = rng(s.seed);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const hue = Math.floor(r() * 360);
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, `hsl(${hue},45%,42%)`); g.addColorStop(1, `hsl(${(hue + 40) % 360},50%,28%)`);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 18; i++) { x.fillStyle = `hsla(${(hue + r() * 120) | 0},60%,${30 + r() * 50}%,.5)`; x.font = `${20 + r() * 40 | 0}px sans-serif`; x.fillText("LENSIQ snack 50g".slice(0, 4 + (r() * 12 | 0)), r() * W, r() * H); }
    if (s.text != null) {
      const { mods, quietL, quietR } = s.kind === "c128" ? c128Modules(s.text) : eanModules(s.text);
      const n = mods.length + quietL + quietR, bw = n * s.mod, bh = Math.max(40, Math.round(bw * (s.kind === "c128" ? 0.3 : 0.7)));
      const lab = document.createElement("canvas"); lab.width = Math.ceil(bw); lab.height = bh;
      const lx = lab.getContext("2d"); lx.fillStyle = "#fff"; lx.fillRect(0, 0, lab.width, bh); lx.fillStyle = "#111";
      for (let i = 0; i < mods.length; i++) if (mods[i] === "1") lx.fillRect((quietL + i) * s.mod, 0, s.mod + 0.02, bh);
      x.save(); x.translate(W / 2 + (r() - 0.5) * 30, H / 2 + (r() - 0.5) * 30); x.rotate((s.rot || 0) * Math.PI / 180);
      const t = (s.tilt || 0) * Math.PI / 180; x.transform(Math.cos(t), Math.sin(t) * 0.25, 0, 1, 0, 0);
      x.fillStyle = "#f4f4f0"; x.fillRect(-bw / 2 - 8, -bh / 2 - 8, bw + 16, bh + 16);
      if (s.curve) { // label wrapped on a cylinder (can/bottle), seen head-on: arc position u -> screen X = R·sin(u/R)
        const R = bw / 2 / (s.curve * Math.PI / 180);
        for (let u = 0; u < bw; u++) { const a = (u - bw / 2) / R; x.drawImage(lab, u, 0, 1, bh, R * Math.sin(a), -bh / 2, Math.max(0.05, Math.cos(a)) + 0.02, bh); }
      } else x.drawImage(lab, -bw / 2, -bh / 2);
      x.restore();
      if (s.occlude) { x.fillStyle = "#c33"; x.fillRect(W / 2 - bw * 0.05, H / 2 - bh, bw * s.occlude, bh * 2); } // finger/sticker over part of the code
    }
    let src = c;
    if (s.blur || s.motion) {
      const b = document.createElement("canvas"); b.width = W; b.height = H; const bx = b.getContext("2d");
      if (s.blur) { bx.filter = `blur(${s.blur}px)`; bx.drawImage(c, 0, 0); }
      else { bx.globalAlpha = 1 / 9; for (let k = -4; k <= 4; k++) bx.drawImage(c, k * s.motion / 8, 0); }
      src = b;
    }
    const y = src.getContext("2d"), d = y.getImageData(0, 0, W, H), p = d.data;
    const gain = s.light ?? 1, glare = s.glare || 0;
    for (let i = 0; i < p.length; i += 4) {
      const px = (i >> 2) % W, py = (i >> 2) / W | 0, gl = glare ? glare * 255 * Math.exp(-((px - W * 0.55) ** 2 + (py - H * 0.45) ** 2) / (2 * 90 * 90)) : 0;
      const nz = s.noise ? gauss(r) * s.noise : 0;
      for (let k = 0; k < 3; k++) p[i + k] = p[i + k] * gain + gl + nz;
    }
    y.putImageData(d, 0, 0);
    const blob = await new Promise(res => src.toBlob(res, "image/jpeg", s.jpeg ?? 0.85));
    return createImageBitmap(blob);
  }
  LQB2.barcodeScenes = async function (specs) {
    if (!bd) bd = new BarcodeDetector({ formats: await BarcodeDetector.getSupportedFormats() });
    const out = [];
    for (const s of specs) {
      const bmp = await scene(s), t0 = performance.now();
      let codes = [];
      try { codes = await bd.detect(bmp); } catch (e) { out.push({ err: String(e) }); continue; }
      out.push({ ms: Math.round(performance.now() - t0), codes: codes.map(c => ({ v: c.rawValue, f: c.format })) });
    }
    return out;
  };
  /* debugging aid: PNG data URL of one scene */
  LQB2.sceneUrl = async s => { const b = await scene(s), c = document.createElement("canvas"); c.width = b.width; c.height = b.height; c.getContext("2d").drawImage(b, 0, 0); return c.toDataURL("image/jpeg", 0.9); };
  window.LQB2 = LQB2;
})();
