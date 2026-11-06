/* ตัดพื้นหลังและรีทัชคุณภาพสูง สำหรับภาพนิ่ง (ใช้ตอนกดถ่าย ไม่ใช่พรีวิวสด)
 *
 * แนวทางที่ใช้ (อ้างอิงงานโอเพนซอร์ส):
 *  1) MODNet (ZHKKKe/MODNet, Apache-2.0; ONNX จาก Xenova/modnet) — portrait matting ให้ค่าโปร่งใส (alpha) ละเอียดถึงเส้นผม
 *     ถ้าโหลดไม่ได้ จะใช้ mask จาก MediaPipe selfie segmenter แทน
 *  2) Guided Filter (He, Sun, Tang — ECCV 2010 / TPAMI 2013) — เกลาขอบ alpha ให้ตามขอบจริงของภาพ
 *  3) Foreground color estimation (แนวคิดเดียวกับ "color decontamination" ในงาน matting) — ลบขอบสีฉากเดิมที่ติดรอบตัวคน
 *  4) Skin retouch แบบ edge-preserving: Guided filter แบบ self-guided เฉพาะบริเวณผิวหน้า
 *     (สร้าง mask จากจุด landmark 68 จุด เว้นตา คิ้ว ปาก) แล้วผสมกลับบางส่วนเพื่อคงพื้นผิวผิว
 */
(function (root) {
  "use strict";

  // ---------- ฟิลเตอร์พื้นฐาน (ฟังก์ชันล้วน ทดสอบใน Node ได้) ----------
  /** ค่าเฉลี่ยในหน้าต่าง (2r+1)^2 แบบ O(N) แยกแกน ขอบภาพหารด้วยจำนวนจุดจริง */
  function boxFilter(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let x = 0; x <= Math.min(r, w - 1); x++) s += src[o + x];
      for (let x = 0; x < w; x++) {
        const lo = x - r - 1, hi = x + r;
        if (hi < w && x > 0) s += src[o + hi];
        if (lo >= 0) s -= src[o + lo];
        tmp[o + x] = s / (Math.min(w - 1, hi) - Math.max(0, x - r) + 1);
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = 0; y <= Math.min(r, h - 1); y++) s += tmp[y * w + x];
      for (let y = 0; y < h; y++) {
        const lo = y - r - 1, hi = y + r;
        if (hi < h && y > 0) s += tmp[hi * w + x];
        if (lo >= 0) s -= tmp[lo * w + x];
        out[y * w + x] = s / (Math.min(h - 1, hi) - Math.max(0, y - r) + 1);
      }
    }
    return out;
  }

  /** Guided filter: q = mean(a)·I + mean(b) โดย a = cov(I,p)/(var(I)+eps) */
  function guidedFilter(I, p, w, h, r, eps) {
    const n = w * h, Ip = new Float32Array(n), II = new Float32Array(n);
    for (let i = 0; i < n; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
    const mI = boxFilter(I, w, h, r), mP = boxFilter(p, w, h, r), mIp = boxFilter(Ip, w, h, r), mII = boxFilter(II, w, h, r);
    const a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = mII[i] - mI[i] * mI[i], c = mIp[i] - mI[i] * mP[i];
      a[i] = c / (v + eps); b[i] = mP[i] - a[i] * mI[i];
    }
    const ma = boxFilter(a, w, h, r), mb = boxFilter(b, w, h, r), q = new Float32Array(n);
    for (let i = 0; i < n; i++) q[i] = ma[i] * I[i] + mb[i];
    return q;
  }

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  function gray(rgba, n) { const g = new Float32Array(n); for (let i = 0; i < n; i++) g[i] = (.299 * rgba[i * 4] + .587 * rgba[i * 4 + 1] + .114 * rgba[i * 4 + 2]) / 255; return g; }

  /** เกลาขอบ alpha ตามภาพจริง แล้วเพิ่มความคมขอบ
   *  r = รัศมีตามอัตราขยายของ mask (ทดสอบแล้ว r≈อัตราขยาย ดีที่สุด), k = ความคม (MODNet ใช้ต่ำเพื่อรักษาเส้นผม) */
  function refineAlpha(rgba, alpha, w, h, { r = 2, k = 2 } = {}) {
    const q = guidedFilter(gray(rgba, w * h), alpha, w, h, Math.max(1, Math.round(r)), 1e-4);
    for (let i = 0; i < q.length; i++) q[i] = clamp01((q[i] - .5) * k + .5);
    return q;
  }

  /** ประมาณสีของ "ตัวคน" ที่ขอบ เพื่อลบสีฉากเดิมที่ซึมอยู่ (halo) */
  function decontaminate(rgba, alpha, w, h) {
    const n = w * h, r = Math.max(3, Math.round(Math.min(w, h) / 120));
    const blurA = boxFilter(boxFilter(alpha, w, h, r), w, h, r);
    const out = new Uint8ClampedArray(n * 4);
    const ch = [0, 1, 2].map(c => { const p = new Float32Array(n); for (let i = 0; i < n; i++) p[i] = rgba[i * 4 + c] * alpha[i]; return boxFilter(boxFilter(p, w, h, r), w, h, r); });
    for (let i = 0; i < n; i++) {
      const a = alpha[i];
      // น้ำหนักใช้สีเดิม: เต็มเมื่อ a>=0.95, ใช้สีประมาณเมื่อ a<=0.5
      const t = clamp01((a - .5) / .45), wOrig = t * t * (3 - 2 * t), den = Math.max(blurA[i], 1e-3);
      for (let c = 0; c < 3; c++) {
        const f = Math.min(255, ch[c][i] / den);
        out[i * 4 + c] = wOrig * rgba[i * 4 + c] + (1 - wOrig) * f;
      }
      out[i * 4 + 3] = a * 255;
    }
    return out;
  }

  /** mask ผิวหน้า (0..1) จาก landmark 68 จุด: หน้า+หน้าผาก ลบตา คิ้ว ปาก แล้วเบลอขอบ */
  function skinMask(w, h, P, drawPoly) {
    const n = w * h, m = new Float32Array(n);
    const eyeMid = { x: (P[36].x + P[45].x) / 2, y: (P[36].y + P[45].y) / 2 };
    const faceH = Math.hypot(P[8].x - eyeMid.x, P[8].y - eyeMid.y);
    const lift = p => ({ x: p.x + (p.x - P[27].x) * .05, y: p.y - faceH * .45 });
    const face = [...P.slice(0, 17), ...P.slice(17, 27).reverse().map(lift)];
    const grow = (pts, k) => { const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }; return pts.map(p => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })); };
    drawPoly(m, w, h, face, 1);
    drawPoly(m, w, h, grow(P.slice(36, 42), 1.9), 0);
    drawPoly(m, w, h, grow(P.slice(42, 48), 1.9), 0);
    drawPoly(m, w, h, grow(P.slice(17, 22), 1.5), 0);
    drawPoly(m, w, h, grow(P.slice(22, 27), 1.5), 0);
    drawPoly(m, w, h, grow(P.slice(48, 60), 1.18), 0);
    drawPoly(m, w, h, grow([P[31], P[33], P[35], P[30]], 1.3), 0); // รูจมูก
    const fw = Math.hypot(P[16].x - P[0].x, P[16].y - P[0].y), r = Math.max(2, Math.round(fw * .03));
    return boxFilter(boxFilter(m, w, h, r), w, h, r);
  }

  /** เติม polygon ลงอาร์เรย์ (scanline even-odd) ใช้ได้ทั้งเบราว์เซอร์และ Node */
  function fillPoly(m, w, h, pts, v) {
    const ys = pts.map(p => p.y), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const xs = [], yy = y + .5;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > yy) !== (b.y > yy)) xs.push(a.x + (yy - a.y) / (b.y - a.y) * (b.x - a.x));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - .5)); x <= Math.min(w - 1, Math.floor(xs[k + 1] - .5)); x++) m[y * w + x] = v;
    }
  }

  /** ผิวเนียนแบบรักษาขอบ: self-guided filter ต่อช่องสี เฉพาะกรอบใบหน้า แล้วผสมตาม mask*strength */
  function smoothSkin(rgba, w, h, P, strength) {
    if (!(strength > 0)) return rgba;
    const out = new Uint8ClampedArray(rgba);
    const xs = P.map(p => p.x), ys = P.map(p => p.y), fw = Math.max(...xs) - Math.min(...xs);
    const pad = fw * .25, x0 = Math.max(0, Math.floor(Math.min(...xs) - pad)), x1 = Math.min(w, Math.ceil(Math.max(...xs) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - fw * .6)), y1 = Math.min(h, Math.ceil(Math.max(...ys) + pad));
    const cw = x1 - x0, chh = y1 - y0; if (cw < 8 || chh < 8) return rgba;
    const local = P.map(p => ({ x: p.x - x0, y: p.y - y0 }));
    const mask = skinMask(cw, chh, local, fillPoly);
    const r = Math.max(3, Math.round(fw * .035)), eps = .06 * .06, n = cw * chh, keepTexture = .25;
    for (let c = 0; c < 3; c++) {
      const I = new Float32Array(n);
      for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) I[y * cw + x] = rgba[((y + y0) * w + x + x0) * 4 + c] / 255;
      const q = guidedFilter(I, I, cw, chh, r, eps);
      for (let i = 0; i < n; i++) {
        const k = mask[i] * strength * (1 - keepTexture); if (k <= 0) continue;
        const idx = ((Math.floor(i / cw) + y0) * w + (i % cw) + x0) * 4 + c;
        out[idx] = (I[i] + (q[i] - I[i]) * k) * 255;
      }
    }
    return out;
  }

  // ---------- MODNet ผ่าน onnxruntime-web (เบราว์เซอร์เท่านั้น) ----------
  let sessionP = null;
  function loadMatting(base = "vendor/") {
    if (sessionP) return sessionP;
    sessionP = (async () => {
      if (typeof ort === "undefined") throw new Error("ไม่พบ onnxruntime-web");
      ort.env.wasm.wasmPaths = new URL(base + "ort/", location.href).href;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      return ort.InferenceSession.create(base + "models/modnet.onnx", { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    })();
    sessionP.catch(() => { sessionP = null; });
    return sessionP;
  }

  /** คืน alpha (Float32Array ขนาด w*h) จาก MODNet; ภาพยาวสุด ~512px ปัดเป็นพหุคูณของ 32 */
  async function modnetAlpha(canvas) {
    const s = await loadMatting();
    const W = canvas.width, H = canvas.height, k = 512 / Math.max(W, H);
    const mw = Math.max(32, Math.round(W * k / 32) * 32), mh = Math.max(32, Math.round(H * k / 32) * 32);
    const c = Object.assign(document.createElement("canvas"), { width: mw, height: mh }), x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(canvas, 0, 0, mw, mh);
    const px = x.getImageData(0, 0, mw, mh).data, n = mw * mh, data = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) data[ch * n + i] = (px[i * 4 + ch] / 255 - .5) / .5;
    const res = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, mh, mw]) });
    const a = res[s.outputNames[0]].data;
    return upsample(a, mw, mh, W, H);
  }

  // ---------- Face parsing (BiSeNet, ONNX uint8) — แยก ผม/ใบหน้า/คอ/เสื้อ สำหรับลำดับชั้นของสตูดิโอ ----------
  // โมเดล: github.com/yakhyo/face-parsing (MIT) น้ำหนัก ResNet18 ตัด aux head + dynamic quantization (13 MB) ดู vendor/models/FACEPARSE-LICENSE.txt
  let parseP = null;
  function loadParsing(base = "vendor/") {
    if (parseP) return parseP;
    parseP = (async () => {
      // ปิดไว้เป็นค่าเริ่มต้น: น้ำหนักโมเดลฝึกจาก CelebAMask-HQ (ใช้ได้เฉพาะงานวิจัย/ไม่ใช่เชิงพาณิชย์) — เปิดด้วย
      // window.LENSIQ_FACEPARSE = true ใน lensiq-config.js หรือ ?faceparse=1 เมื่อมีไฟล์โมเดลและสิทธิ์ใช้งานแล้ว
      if (!(self.LENSIQ_FACEPARSE === true || /[?&]faceparse=1(&|$)/.test(location.search))) throw new Error("faceparse disabled");
      if (typeof ort === "undefined") throw new Error("ไม่พบ onnxruntime-web");
      ort.env.wasm.wasmPaths = new URL(base + "ort/", location.href).href;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      return ort.InferenceSession.create(base + "models/faceparse-bisenet-r18-q8.onnx", { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    })();
    parseP.catch(() => { parseP = null; });
    return parseP;
  }
  /** รัน parser บนครอป {x,y,side} ของ canvas: คืน { logits: Float32Array [19*512*512], S: 512, C: 19 } (นอกภาพเติมสีเทากลาง) */
  async function faceParse(canvas, crop) {
    const s = await loadParsing(), S = 512;
    const c = Object.assign(document.createElement("canvas"), { width: S, height: S }), x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#808080"; x.fillRect(0, 0, S, S);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    const k = S / crop.side; x.drawImage(canvas, -crop.x * k, -crop.y * k, canvas.width * k, canvas.height * k);
    const px = x.getImageData(0, 0, S, S).data, n = S * S, data = new Float32Array(3 * n), mean = [.485, .456, .406], std = [.229, .224, .225];
    for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) data[ch * n + i] = (px[i * 4 + ch] / 255 - mean[ch]) / std[ch];
    const res = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, S, S]) });
    const o = res[s.outputNames[0]];
    return { logits: o.data, S, C: o.dims[1] };
  }

  /** ขยาย alpha ด้วย bilinear (ผ่าน canvas เพื่อความเร็ว) */
  function upsample(a, sw, sh, W, H) {
    const c = Object.assign(document.createElement("canvas"), { width: sw, height: sh }), x = c.getContext("2d");
    const id = x.createImageData(sw, sh);
    for (let i = 0; i < sw * sh; i++) { const v = clamp01(a[i]) * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    x.putImageData(id, 0, 0);
    const big = Object.assign(document.createElement("canvas"), { width: W, height: H }), bx = big.getContext("2d", { willReadFrequently: true });
    bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = "high"; bx.drawImage(c, 0, 0, W, H);
    const d = bx.getImageData(0, 0, W, H).data, out = new Float32Array(W * H);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
    return out;
  }
  /** alpha จาก mask ของ MediaPipe (canvas ที่ใช้ช่อง alpha) */
  function maskAlpha(mask, W, H) {
    const big = Object.assign(document.createElement("canvas"), { width: W, height: H }), bx = big.getContext("2d", { willReadFrequently: true });
    bx.imageSmoothingQuality = "high"; bx.drawImage(mask, 0, 0, W, H);
    const d = bx.getImageData(0, 0, W, H).data, out = new Float32Array(W * H);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] / 255;
    return out;
  }

  /**
   * ตัดคนออกจากฉากคุณภาพสูง: คืน { canvas (RGBA), method }
   * mpMask = mask จาก MediaPipe (ถ้ามี) ใช้เมื่อ MODNet ไม่พร้อม
   */
  async function cutout(img, mpMask) {
    const W = img.width, H = img.height;
    let alpha = null, method = "", opt;
    try { alpha = await modnetAlpha(img); method = "MODNet"; opt = { r: Math.max(2, Math.max(W, H) / 512), k: 1.6 }; }
    catch (e) { console.warn("MODNet ใช้ไม่ได้", e); if (mpMask) { alpha = maskAlpha(mpMask, W, H); method = "MediaPipe"; opt = { r: Math.max(2, W / mpMask.width), k: 4 }; } }
    if (!alpha) return null;
    const x = img.getContext("2d", { willReadFrequently: true }), id = x.getImageData(0, 0, W, H);
    const refined = refineAlpha(id.data, alpha, W, H, opt);
    const rgba = decontaminate(id.data, refined, W, H);
    const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
    c.getContext("2d").putImageData(new ImageData(rgba, W, H), 0, 0);
    return { canvas: c, method: method + " + Guided Filter" };
  }

  /** รีทัชผิวบน canvas (คงช่อง alpha เดิม) */
  function retouch(canvas, P, strength) {
    const W = canvas.width, H = canvas.height, x = canvas.getContext("2d", { willReadFrequently: true });
    const id = x.getImageData(0, 0, W, H), res = smoothSkin(id.data, W, H, P, strength);
    const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
    c.getContext("2d").putImageData(new ImageData(res, W, H), 0, 0);
    return c;
  }

  const api = { boxFilter, guidedFilter, refineAlpha, decontaminate, skinMask, fillPoly, smoothSkin, loadMatting, modnetAlpha, loadParsing, faceParse, maskAlpha, cutout, retouch };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PBHQ = api;
})(typeof window !== "undefined" ? window : globalThis);
