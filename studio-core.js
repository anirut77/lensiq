/* studio-core.js — ฟังก์ชันประมวลผลภาพล้วน (ไม่มี DOM) สำหรับ "สตูดิโอแต่งชุด AI" (studio.html) และรูปติดบัตร (photobooth.js)
 * Browser: window.StudioCore · Node: module.exports (ทดสอบใน tests/unit/studio.test.js)
 *
 * ทุกอย่างประมวลผลบนเครื่อง ด้วย JS ล้วนบน typed array (ไม่ใช้ WebGL) — ภาพ RGBA = Uint8ClampedArray, mask/alpha = Float32Array 0..1
 *
 * เทคนิคและแหล่งอ้างอิง (เขียนใหม่จากแนวคิด/บทความ ไม่ได้คัดลอกโค้ด; ไม่มีโค้ด GPL ในไฟล์นี้):
 *  - Guided Filter — K. He, J. Sun, X. Tang, "Guided Image Filtering", ECCV 2010 / TPAMI 2013 (เกลาขอบ alpha + ผิวเนียนแบบรักษาขอบ)
 *  - Foreground estimation แบบหยาบไปละเอียด — แนวคิดจาก Germer et al., "Fast Multi-Level Foreground Estimation" (2020),
 *    github.com/pymatting/pymatting (MIT) — ลบสีฉากเดิมที่ติดขอบผม (color decontamination)
 *  - Laplacian pyramid blending — P. Burt & E. Adelson, "A Multiresolution Spline with Application to Image Mosaics" (1983);
 *    ตัวอย่างการสอน github.com/twyunting/Laplacian-Pyramids, github.com/rayryeng/laplacianBlend
 *  - Color transfer ใน CIE L*a*b* — E. Reinhard et al., "Color Transfer between Images" (2001); github.com/jrosebr1/color_transfer (MIT)
 *  - Thin-plate spline warp — F. Bookstein (1989); การใช้ TPS ดัดชุดให้เข้ารูปตัวคนแบบ CP-VTON (Wang et al., ECCV 2018) /
 *    VITON-HD (github.com/shadow2496/VITON-HD) แต่ที่นี่ใช้จุดยึด (คาง ไหล่ซ้าย ไหล่ขวา) แทนโมเดลเรียนรู้
 *  - Frequency separation / high-pass skin smoothing — github.com/YuAo/YUCIHighPassSkinSmoothing (MIT) — ที่นี่ใช้ guided filter เป็น low-pass
 *  - Light wrap — Nuke LightWrap / Natron LightWrap docs (natron.readthedocs.io) — แสงฉากหลังซึมเข้าขอบตัวคน (screen blend)
 *  - Gray-world white balance (Buchsbaum 1980) และการวัด noise ด้วย median absolute deviation ของ Laplacian (Immerkær 1996) เพื่อเติม grain ให้ตรงกัน
 */
(function (root) {
  "use strict";
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

  // =====================================================================
  // ฟิลเตอร์พื้นฐาน
  // =====================================================================
  /** ค่าเฉลี่ยในหน้าต่าง (2r+1)^2 แบบ O(N) แยกแกน ขอบภาพหารด้วยจำนวนจุดจริง */
  function boxFilter(src, w, h, r) {
    r = Math.max(0, Math.round(r));
    if (r === 0) return Float32Array.from(src);
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
  /** เบลอเกือบเกาส์เซียน: box filter 3 รอบ */
  const blur3 = (a, w, h, r) => boxFilter(boxFilter(boxFilter(a, w, h, r), w, h, r), w, h, r);

  /** Guided filter (He et al.): q = mean(a)·I + mean(b), a = cov(I,p)/(var(I)+eps) */
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

  function luma(rgba, n) { const g = new Float32Array(n); for (let i = 0; i < n; i++) g[i] = (.299 * rgba[i * 4] + .587 * rgba[i * 4 + 1] + .114 * rgba[i * 4 + 2]) / 255; return g; }
  function channel(rgba, n, c, scale = 1 / 255) { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = rgba[i * 4 + c] * scale; return o; }

  // =====================================================================
  // Matte: เกลาขอบ + ประมาณสีตัวคน
  // =====================================================================
  /**
   * เกลา alpha ให้ตามขอบจริงของภาพ (guided filter บนภาพ luma) แล้วปรับความคม และลบจุดรบกวนเล็ก ๆ
   * opt: r (รัศมี ~ อัตราขยาย mask), eps, k (ความคมรอบ 0.5), lo/hi (ค่าที่ต่ำ/สูงกว่านี้ตัดเป็น 0/1)
   */
  function refineMatte(rgba, alpha, w, h, { r = 2, eps = 1e-4, k = 1.6, lo = .04, hi = .97 } = {}) {
    const q = guidedFilter(luma(rgba, w * h), alpha, w, h, Math.max(1, Math.round(r)), eps);
    for (let i = 0; i < q.length; i++) {
      let v = clamp01((q[i] - .5) * k + .5);
      if (v < lo) v = 0; else if (v > hi) v = 1;
      q[i] = v;
    }
    return q;
  }

  /**
   * ประมาณสีของ foreground F ที่ขอบ จากสมการ matting I = aF + (1-a)B:
   *  1) F̂, B̂ แบบเรียบ = ค่าเฉลี่ยของพิกเซลที่เกือบทึบ / เกือบใส หลายระดับ หยาบ -> ละเอียด (ระดับหยาบเป็นค่าเริ่มต้นของระดับถัดไป)
   *  2) แก้สมการหา F = (I - (1-a)B̂)/a เมื่อ a ไม่เล็กเกินไป ผสมกับ F̂ เมื่อ a เล็ก
   * คืน RGBA (สี = F, alpha = a*255) — พิกเซลทึบ (a ≥ .98) คงสีเดิม
   */
  function estimateForeground(rgba, alpha, w, h, { radii = null } = {}) {
    const n = w * h, big = Math.max(4, Math.round(Math.min(w, h) / 40));
    const R = radii || [big * 4, big, Math.max(2, big >> 1), Math.max(2, big >> 2)];
    const out = new Uint8ClampedArray(n * 4), wf = new Float32Array(n), wb = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = alpha[i]; wf[i] = smooth((a - .8) / .18); wb[i] = smooth((.2 - a) / .18); }
    const dens = R.map(r => [boxFilter(wf, w, h, r), boxFilter(wb, w, h, r)]);
    const level = (ch, wt, k) => {
      const p = new Float32Array(n); for (let i = 0; i < n; i++) p[i] = ch[i] * wt[i];
      let F = null;
      R.forEach((r, li) => {
        const num = boxFilter(p, w, h, r), den = dens[li][k], e = 1e-3, nf = new Float32Array(n);
        for (let i = 0; i < n; i++) nf[i] = (num[i] + e * (F ? F[i] : 128)) / (den[i] + e);
        F = nf;
      });
      return F;
    };
    for (let c = 0; c < 3; c++) {
      const I = channel(rgba, n, c, 1), Fs = level(I, wf, 0), Bs = level(I, wb, 1);
      for (let i = 0; i < n; i++) {
        const a = alpha[i], t = smooth((a - .6) / .38);
        if (t >= 1) { out[i * 4 + c] = I[i]; continue; }
        const Fsolve = clamp((I[i] - (1 - a) * Bs[i]) / Math.max(a, .05), 0, 255), k = smooth((a - .1) / .35);
        const F = k * Fsolve + (1 - k) * Fs[i];
        out[i * 4 + c] = t * I[i] + (1 - t) * F;
      }
    }
    for (let i = 0; i < n; i++) out[i * 4 + 3] = alpha[i] * 255;
    return out;
  }

  /**
   * alpha สำรองเมื่อโมเดล matting ใช้ไม่ได้: ระยะสี (L*a*b*) จากสีฉากที่ขอบภาพ (ซ้าย/ขวา/บน) — ใช้ได้ดีกับฉากเรียบ
   * คืน Float32Array 0..1 (ยังควรผ่าน refineMatte)
   */
  function borderKeyAlpha(rgba, w, h, { t0 = 10, t1 = 28 } = {}) {
    const samples = [], band = Math.max(2, Math.round(Math.min(w, h) * .03));
    for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) if (x < band || x >= w - band || y < band) samples.push(rgbToLab(rgba[(y * w + x) * 4], rgba[(y * w + x) * 4 + 1], rgba[(y * w + x) * 4 + 2]));
    const med = [0, 1, 2].map(c => { const v = samples.map(s => s[c]).sort((a, b) => a - b); return v[v.length >> 1] || 0; });
    // ฉากไล่สี: ใช้สีฉากของแถวเดียวกันจากขอบซ้าย/ขวา ผสมกับค่ากลาง
    const rowBg = new Array(h);
    for (let y = 0; y < h; y++) {
      const l = rgbToLab(rgba[(y * w + 1) * 4], rgba[(y * w + 1) * 4 + 1], rgba[(y * w + 1) * 4 + 2]), r = rgbToLab(rgba[(y * w + w - 2) * 4], rgba[(y * w + w - 2) * 4 + 1], rgba[(y * w + w - 2) * 4 + 2]);
      rowBg[y] = [0, 1, 2].map(c => (l[c] + r[c]) / 4 + med[c] / 2);
    }
    const a = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, L = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]), b = rowBg[y];
      const d = Math.min(Math.hypot(L[0] - b[0], L[1] - b[1], L[2] - b[2]), Math.hypot(L[0] - med[0], L[1] - med[1], L[2] - med[2]));
      a[i] = smooth((d - t0) / (t1 - t0));
    }
    return blur3(a, w, h, 1);
  }

  // =====================================================================
  // สี: sRGB <-> CIE L*a*b* (D65), สถิติ, Reinhard transfer, gray world
  // =====================================================================
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255; LIN[i] = v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }
  const lin = v => { v = clamp(v, 0, 255); const i = v | 0; return i >= 255 ? LIN[255] : LIN[i] + (LIN[i + 1] - LIN[i]) * (v - i); };
  const gam = v => { v = clamp01(v); return 255 * (v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055); };
  const fLab = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fInv = t => { const t3 = t * t * t; return t3 > .008856 ? t3 : (t - 16 / 116) / 7.787; };
  function rgbToLab(r, g, b) {
    const R = lin(r), G = lin(g), B = lin(b);
    const X = (.4124 * R + .3576 * G + .1805 * B) / .95047, Y = .2126 * R + .7152 * G + .0722 * B, Z = (.0193 * R + .1192 * G + .9505 * B) / 1.08883;
    const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function labToRgb(L, a, b) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const X = fInv(fx) * .95047, Y = fInv(fy), Z = fInv(fz) * 1.08883;
    return [gam(3.2406 * X - 1.5372 * Y - .4986 * Z), gam(-.9689 * X + 1.8758 * Y + .0415 * Z), gam(.0557 * X - .2040 * Y + 1.0570 * Z)];
  }

  /** ค่าเฉลี่ย/ส่วนเบี่ยงเบนมาตรฐานของ L*a*b* ในบริเวณ mask (> thr) หรือทั้งภาพ; step = สุ่มทุก step พิกเซล */
  function labStats(rgba, w, h, mask = null, { thr = .5, step = 1, box = null } = {}) {
    const s = [0, 0, 0], q = [0, 0, 0]; let n = 0;
    const x0 = box ? Math.max(0, box.x | 0) : 0, y0 = box ? Math.max(0, box.y | 0) : 0;
    const x1 = box ? Math.min(w, Math.ceil(box.x + box.w)) : w, y1 = box ? Math.min(h, Math.ceil(box.y + box.h)) : h;
    for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
      const i = y * w + x;
      if (mask ? mask[i] <= thr : rgba[i * 4 + 3] < 128) continue;
      const L = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
      for (let c = 0; c < 3; c++) { s[c] += L[c]; q[c] += L[c] * L[c]; }
      n++;
    }
    if (!n) return null;
    const mean = s.map(v => v / n), std = q.map((v, c) => Math.sqrt(Math.max(1e-6, v / n - mean[c] * mean[c])));
    return { mean, std, n };
  }

  /**
   * Reinhard color transfer: lab' = (lab - src.mean) * dst.std/src.std + dst.mean  ผสมตาม mask*strength
   * opt.channels = ช่องที่จะโอน (เช่น [0] เฉพาะความสว่าง), opt.maxGain จำกัดอัตราขยาย std
   * คืน RGBA ใหม่ (พิกเซลนอก mask เหมือนเดิมทุกบิต)
   */
  function reinhardTransfer(rgba, w, h, mask, src, dst, { strength = 1, channels = [0, 1, 2], maxGain = 2.5 } = {}) {
    const out = new Uint8ClampedArray(rgba), g = [1, 1, 1];
    for (const c of channels) g[c] = clamp(dst.std[c] / Math.max(1e-6, src.std[c]), 1 / maxGain, maxGain);
    for (let i = 0, n = w * h; i < n; i++) {
      const m = (mask ? mask[i] : rgba[i * 4 + 3] / 255) * strength;
      if (m <= 0) continue;
      const lab = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
      for (const c of channels) lab[c] = (lab[c] - src.mean[c]) * g[c] + dst.mean[c];
      const rgb = labToRgb(lab[0], lab[1], lab[2]), k = Math.min(1, m);
      for (let c = 0; c < 3; c++) out[i * 4 + c] = rgba[i * 4 + c] + (rgb[c] - rgba[i * 4 + c]) * k;
    }
    return out;
  }

  /** gray-world: ค่าเฉลี่ย R,G,B ของบริเวณ (mask หรือทั้งภาพ) และ gain ที่ทำให้เป็นสีเทา (จำกัดช่วง) */
  function grayWorld(rgba, w, h, mask = null, { step = 2, lo = .8, hi = 1.25, neutral = false } = {}) {
    // neutral: ใช้เฉพาะพิกเซลที่สีอ่อน (น่าจะเป็นสีเทา/ขาวในฉาก) — กันเสื้อสีสดหรือผิวทำให้สมดุลเพี้ยน (แนวคิด "gray pixels")
    const pass = nz => {
      const s = [0, 0, 0]; let n = 0;
      for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
        const i = y * w + x; if (mask && mask[i] <= .5) continue;
        const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
        if (r > 250 && g > 250 && b > 250) continue; // ข้ามจุดสว่างจ้า (clipped)
        if (nz) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx < 30 || mx - mn > mx * .18) continue; }
        s[0] += r; s[1] += g; s[2] += b; n++;
      }
      return { s, n };
    };
    let { s, n } = pass(neutral);
    if (neutral && n < (w * h) / (step * step) * .01) ({ s, n } = pass(false));
    if (!n) return { mean: [128, 128, 128], gains: [1, 1, 1] };
    const mean = s.map(v => v / n), avg = (mean[0] + mean[1] + mean[2]) / 3;
    return { mean, gains: mean.map(v => clamp(avg / Math.max(1, v), lo, hi)) };
  }

  /** คูณสีด้วย gain ต่อช่อง (ตาม mask*strength) + ถนอมไฮไลต์ (knee ที่ 0.85) */
  function applyGains(rgba, w, h, gains, { mask = null, strength = 1, exposure = 1 } = {}) {
    const out = new Uint8ClampedArray(rgba), knee = 255 * .85;
    for (let i = 0, n = w * h; i < n; i++) {
      const m = (mask ? mask[i] : 1) * strength; if (m <= 0) continue;
      for (let c = 0; c < 3; c++) {
        const v = rgba[i * 4 + c];
        let t = v * (1 + (gains[c] * exposure - 1) * m);
        if (t > knee) t = knee + (255 - knee) * (1 - Math.exp(-(t - knee) / (255 - knee)));
        out[i * 4 + c] = t;
      }
    }
    return out;
  }

  // =====================================================================
  // Laplacian pyramid blending (Burt & Adelson)
  // =====================================================================
  const K5 = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
  const refl = (i, n) => { i = i < 0 ? -i : i >= n ? 2 * n - i - 2 : i; return i < 0 ? 0 : i >= n ? n - 1 : i; };
  function blur5(src, w, h) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) { let s = 0; for (let k = -2; k <= 2; k++) s += K5[k + 2] * src[o + refl(x + k, w)]; tmp[o + x] = s; }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0; for (let k = -2; k <= 2; k++) s += K5[k + 2] * tmp[refl(y + k, h) * w + x];
      out[y * w + x] = s;
    }
    return out;
  }
  function pyrDown(src, w, h) {
    const b = blur5(src, w, h), w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2), o = new Float32Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) o[y * w2 + x] = b[(2 * y) * w + 2 * x];
    return { d: o, w: w2, h: h2 };
  }
  /** ขยาย x2 แบบ bilinear (พิกัดจุดกึ่งกลางตรงกับ pyrDown ที่สุ่มที่พิกเซลคู่) */
  function pyrUp(src, w2, h2, w, h) {
    const o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = y / 2, y0 = Math.min(h2 - 1, Math.floor(fy)), y1 = Math.min(h2 - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = x / 2, x0 = Math.min(w2 - 1, Math.floor(fx)), x1 = Math.min(w2 - 1, x0 + 1), tx = fx - x0;
        const a = src[y0 * w2 + x0] + (src[y0 * w2 + x1] - src[y0 * w2 + x0]) * tx;
        const b = src[y1 * w2 + x0] + (src[y1 * w2 + x1] - src[y1 * w2 + x0]) * tx;
        o[y * w + x] = a + (b - a) * ty;
      }
    }
    return o;
  }
  /**
   * ผสม A กับ B ด้วย mask M (น้ำหนักของ B) หลายความถี่: ความถี่ต่ำผสมนุ่ม (ไม่มีรอยต่อสี/แสง) ความถี่สูงคมตาม mask
   * A, B = อาร์เรย์ของช่อง (Float32Array ต่อช่อง) ขนาด w*h; คืนอาร์เรย์ช่องที่ผสมแล้ว
   */
  function laplacianBlend(A, B, M, w, h, levels = 4) {
    const maxL = Math.max(1, Math.min(levels, Math.floor(Math.log2(Math.max(2, Math.min(w, h)))) - 1));
    const gm = [{ d: M, w, h }];
    for (let l = 1; l < maxL; l++) { const p = gm[l - 1]; gm.push(pyrDown(p.d, p.w, p.h)); }
    return A.map((Ach, ci) => {
      const ga = [{ d: Ach, w, h }], gb = [{ d: B[ci], w, h }];
      for (let l = 1; l < maxL; l++) { ga.push(pyrDown(ga[l - 1].d, ga[l - 1].w, ga[l - 1].h)); gb.push(pyrDown(gb[l - 1].d, gb[l - 1].w, gb[l - 1].h)); }
      // ระดับหยาบสุด: ผสม gaussian โดยตรง
      const top = maxL - 1, t = gm[top];
      let cur = new Float32Array(t.w * t.h);
      for (let i = 0; i < cur.length; i++) cur[i] = ga[top].d[i] * (1 - t.d[i]) + gb[top].d[i] * t.d[i];
      for (let l = top - 1; l >= 0; l--) {
        const g = gm[l], nw = g.w, nh = g.h;
        const upA = pyrUp(ga[l + 1].d, ga[l + 1].w, ga[l + 1].h, nw, nh), upB = pyrUp(gb[l + 1].d, gb[l + 1].w, gb[l + 1].h, nw, nh);
        const up = pyrUp(cur, gm[l + 1].w, gm[l + 1].h, nw, nh), next = new Float32Array(nw * nh);
        for (let i = 0; i < next.length; i++) {
          const la = ga[l].d[i] - upA[i], lb = gb[l].d[i] - upB[i], m = g.d[i];
          next[i] = up[i] + la * (1 - m) + lb * m;
        }
        cur = next;
      }
      return cur;
    });
  }

  // =====================================================================
  // Warp: similarity + thin-plate spline
  // =====================================================================
  /** แก้ระบบสมการเชิงเส้น (Gaussian elimination + partial pivot) */
  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c]; if (Math.abs(d) < 1e-12) throw new Error("singular");
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  const U = r2 => r2 > 0 ? r2 * Math.log(r2) : 0;
  /**
   * Thin-plate spline ที่ส่ง from[i] -> to[i] พอดี (lambda = 0) หรือเรียบขึ้น (lambda > 0)
   * คืน { map(x,y) -> {x,y} } ต้องมีอย่างน้อย 3 จุดที่ไม่อยู่บนเส้นตรงเดียวกัน
   */
  function tpsFit(from, to, lambda = 0) {
    const n = from.length, N = n + 3, A = [];
    for (let i = 0; i < N; i++) A.push(new Array(N).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] = i === j ? lambda : U((from[i].x - from[j].x) ** 2 + (from[i].y - from[j].y) ** 2);
      A[i][n] = A[n][i] = 1; A[i][n + 1] = A[n + 1][i] = from[i].x; A[i][n + 2] = A[n + 2][i] = from[i].y;
    }
    const bx = [...to.map(p => p.x), 0, 0, 0], by = [...to.map(p => p.y), 0, 0, 0];
    const wx = solve(A, bx), wy = solve(A, by);
    function map(x, y) {
      let sx = wx[n] + wx[n + 1] * x + wx[n + 2] * y, sy = wy[n] + wy[n + 1] * x + wy[n + 2] * y;
      for (let i = 0; i < n; i++) { const u = U((x - from[i].x) ** 2 + (y - from[i].y) ** 2); sx += wx[i] * u; sy += wy[i] * u; }
      return { x: sx, y: sy };
    }
    return { map, from, to };
  }
  /** similarity (หมุน+ย่อขยาย+เลื่อน) ที่ส่ง p1->q1, p2->q2 */
  function similarity(p1, p2, q1, q2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y, ex = q2.x - q1.x, ey = q2.y - q1.y, d = dx * dx + dy * dy || 1;
    const a = (dx * ex + dy * ey) / d, b = (dx * ey - dy * ex) / d;
    return { a, b, map: (x, y) => ({ x: q1.x + a * (x - p1.x) - b * (y - p1.y), y: q1.y + b * (x - p1.x) + a * (y - p1.y) }), scale: Math.hypot(a, b), angle: Math.atan2(b, a) };
  }

  /**
   * ดัดภาพ: สำหรับทุกพิกเซลปลายทาง (dw×dh) หา src = inv(x,y) แล้วสุ่มแบบ bilinear (นอกภาพ = โปร่งใส)
   * inv คำนวณบนกริดทุก step พิกเซล แล้ว interpolate (step = 1 = คำนวณทุกพิกเซล)
   * box = {x0,y0,x1,y1} จำกัดบริเวณปลายทางเพื่อความเร็ว
   */
  function warpRGBA(src, sw, sh, dw, dh, inv, { step = 8, box = null } = {}) {
    const out = new Uint8ClampedArray(dw * dh * 4);
    const X0 = box ? clamp(Math.floor(box.x0), 0, dw) : 0, Y0 = box ? clamp(Math.floor(box.y0), 0, dh) : 0;
    const X1 = box ? clamp(Math.ceil(box.x1), 0, dw) : dw, Y1 = box ? clamp(Math.ceil(box.y1), 0, dh) : dh;
    if (X1 <= X0 || Y1 <= Y0) return out;
    const gw = Math.ceil((X1 - X0) / step) + 1, gh = Math.ceil((Y1 - Y0) / step) + 1, gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const p = inv(X0 + i * step, Y0 + j * step); gx[j * gw + i] = p.x; gy[j * gw + i] = p.y; }
    for (let y = Y0; y < Y1; y++) {
      const fj = (y - Y0) / step, j0 = Math.min(gh - 2, Math.floor(fj)), tj = fj - j0;
      for (let x = X0; x < X1; x++) {
        let sx, sy;
        if (step === 1) { sx = gx[(y - Y0) * gw + (x - X0)]; sy = gy[(y - Y0) * gw + (x - X0)]; }
        else {
          const fi = (x - X0) / step, i0 = Math.min(gw - 2, Math.floor(fi)), ti = fi - i0, k = j0 * gw + i0;
          sx = (gx[k] * (1 - ti) + gx[k + 1] * ti) * (1 - tj) + (gx[k + gw] * (1 - ti) + gx[k + gw + 1] * ti) * tj;
          sy = (gy[k] * (1 - ti) + gy[k + 1] * ti) * (1 - tj) + (gy[k + gw] * (1 - ti) + gy[k + gw + 1] * ti) * tj;
        }
        if (sx < -.5 || sy < -.5 || sx > sw - .5 || sy > sh - .5) continue;
        const x0 = clamp(Math.floor(sx), 0, sw - 1), y0 = clamp(Math.floor(sy), 0, sh - 1), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
        const tx = clamp01(sx - x0), ty = clamp01(sy - y0), o = (y * dw + x) * 4;
        const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
        // สุ่มแบบ premultiplied alpha เพื่อไม่ให้สีของพิกเซลโปร่งใสซึมเข้าขอบ
        const w00 = (1 - tx) * (1 - ty) * src[i00 + 3], w10 = tx * (1 - ty) * src[i10 + 3], w01 = (1 - tx) * ty * src[i01 + 3], w11 = tx * ty * src[i11 + 3];
        const ws = w00 + w10 + w01 + w11; if (ws <= 0) continue;
        for (let c = 0; c < 3; c++) out[o + c] = (src[i00 + c] * w00 + src[i10 + c] * w10 + src[i01 + c] * w01 + src[i11 + c] * w11) / ws;
        out[o + 3] = ws;
      }
    }
    return out;
  }

  // =====================================================================
  // รูปทรงตัวคน/ชุด จาก silhouette
  // =====================================================================
  /** ช่วงทึบต่อเนื่องในแถว y ที่ผ่าน x0 (เดินจาก x0 ออกไปสองข้าง) */
  function runAt(alpha, w, y, x0, thr = .5) {
    x0 = clamp(Math.round(x0), 0, w - 1); const o = y * w;
    if (alpha[o + x0] <= thr) {
      let best = null; // ไม่ทึบตรงกลาง: หาจุดทึบที่ใกล้ที่สุดภายในระยะ 6% ของความกว้าง
      for (let d = 1; d < w * .06 && !best; d++) for (const x of [x0 - d, x0 + d]) if (x >= 0 && x < w && alpha[o + x] > thr) { best = x; break; }
      if (best == null) return null; x0 = best;
    }
    let l = x0, r = x0;
    while (l > 0 && alpha[o + l - 1] > thr) l--;
    while (r < w - 1 && alpha[o + r + 1] > thr) r++;
    return { l, r };
  }
  /** ช่วงทึบทั้งหมดของแถว (ซ้ายสุด–ขวาสุด) */
  function spanAt(alpha, w, y, thr = .5) {
    const o = y * w; let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (alpha[o + x] > thr) { if (l < 0) l = x; r = x; }
    return l < 0 ? null : { l, r };
  }

  /**
   * ไหล่ซ้าย/ขวา: แต่ละข้างคือแถวแรกใต้คอที่ขอบด้านนั้นห่างจากแกนกลาง ≥ 85% ของระยะมากสุด (ในช่วง 2.2 เท่าความกว้างหน้า)
   * profile(y) -> {l, r} | null ; คืน {left, right, neck:{y, l, r}, ok}
   */
  function shouldersFromProfile(profile, cx, y0, y1, fw, w) {
    const rows = [];
    for (let y = Math.max(0, Math.round(y0)); y <= y1; y++) { const s = profile(y); rows.push(s ? { y, ...s } : null); }
    const valid = rows.filter(Boolean); if (valid.length < 4) return null;
    // คอ = แถวที่แคบที่สุดในช่วงต้น (0–0.7 ความกว้างหน้า ใต้จุดเริ่ม)
    const early = valid.filter(r => r.y <= y0 + fw * .7);
    const neck = (early.length ? early : valid.slice(0, 3)).reduce((a, b) => (b.r - b.l < a.r - a.l ? b : a));
    const below = valid.filter(r => r.y >= neck.y);
    const side = (get) => {
      const ext = below.map(r => ({ y: r.y, d: get(r) })), max = Math.max(...ext.map(e => e.d));
      const hit = ext.find(e => e.d >= max * .85) || ext[ext.length - 1];
      return { y: hit.y, d: hit.d, max };
    };
    const L = side(r => cx - r.l), R = side(r => r.r - cx);
    const cropped = below.some(r => r.l <= 0) || below.some(r => r.r >= w - 1);
    return { left: { x: cx - L.d, y: L.y }, right: { x: cx + R.d, y: R.y }, neck: { y: neck.y, l: neck.l, r: neck.r }, cropped };
  }

  /**
   * ประมาณคอและไหล่ของผู้ถ่ายจาก alpha ของตัวคน (face = {cx, chinY, fw})
   * ใช้ช่วงทึบที่ผ่านแกนกลาง (ไม่รวมแขน/วัตถุที่แยกออกไป) จำกัดความกว้างไหล่ 2.0–3.6 เท่าความกว้างหน้า
   */
  function estimateBody(alpha, w, h, face) {
    const { cx, chinY, fw } = face, y1 = Math.min(h - 1, Math.round(chinY + fw * 2.2));
    const res = shouldersFromProfile(y => runAt(alpha, w, y, cx), cx, chinY + fw * .02, y1, fw, w);
    const fallback = !res;
    let left, right, neckW, neckY;
    if (res) { left = res.left; right = res.right; neckW = res.neck.r - res.neck.l + 1; neckY = res.neck.y; }
    else { left = { x: cx - fw * 1.3, y: chinY + fw * .75 }; right = { x: cx + fw * 1.3, y: chinY + fw * .75 }; neckW = fw * .5; neckY = chinY + fw * .25; }
    // จำกัดสัดส่วนให้สมจริง (ภาพครอปชิดไหล่ หรือ matte เพี้ยน)
    const fix = (p, sgn) => { const d = clamp(sgn * (p.x - cx), fw * 1.0, fw * 1.8); return { x: cx + sgn * d, y: clamp(p.y, chinY + fw * .3, chinY + fw * 1.4) }; };
    left = fix(left, -1); right = fix(right, 1);
    neckW = clamp(neckW, fw * .35, fw * .9);
    return { left, right, neck: { x: cx, y: neckY, w: neckW }, ok: !fallback && !(res && res.cropped) };
  }

  /** จุดไหล่ของชุด (alpha ของชุด, จุดคาง chin, ความกว้างหน้าอ้างอิง fw) — ใช้นิยามเดียวกับ estimateBody จึงจับคู่กันได้ */
  function garmentShoulders(alpha, w, h, chin, fw) {
    const y1 = Math.min(h - 1, Math.round(chin.y + fw * 2.2));
    let top = -1; for (let y = 0; y < h && top < 0; y++) if (spanAt(alpha, w, y)) top = y;
    if (top < 0) return null;
    const res = shouldersFromProfile(y => spanAt(alpha, w, y), chin.x, Math.max(top, chin.y), Math.max(y1, top + 8), fw, w);
    if (!res) return null;
    return { left: res.left, right: res.right, top };
  }

  /**
   * ประมาณศีรษะจาก matte เมื่อไม่มี landmark: ศีรษะ = ก้อนบนสุด คาง = แถวที่แคบสุด (คอ) ใต้ส่วนที่กว้างที่สุดของศีรษะ
   * คืน {cx, eyeY, chinY, fw, faceH, angle:0} | null
   */
  function headFromMatte(alpha, w, h) {
    let y0 = -1; for (let y = 0; y < h && y0 < 0; y++) { const s = spanAt(alpha, w, y); if (s && s.r - s.l > w * .02) y0 = y; }
    if (y0 < 0) return null;
    const s0 = spanAt(alpha, w, y0), cx0 = (s0.l + s0.r) / 2;
    let maxW = 0, maxY = y0, cx = cx0, neckY = -1, minW = Infinity;
    for (let y = y0; y < h; y++) {
      const r = runAt(alpha, w, y, cx); if (!r) break;
      const wd = r.r - r.l;
      if (y - y0 < (maxW || w * .1) * 1.4) { if (wd > maxW) { maxW = wd; maxY = y; cx = (r.l + r.r) / 2; } continue; }
      if (wd < minW) { minW = wd; neckY = y; }
      if (wd > maxW * 1.4) break; // ถึงไหล่แล้ว
    }
    if (!maxW || neckY < 0) return null;
    const chinY = Math.max(maxY + maxW * .45, neckY - maxW * .15), fw = maxW * .95, eyeY = y0 + (chinY - y0) * .5;
    return { cx, eyeY, chinY, fw, faceH: chinY - eyeY, angle: 0 };
  }

  /** เส้นคาง y(x) จาก landmark 68 จุด (0–16) หรือวงรีโดยประมาณ ใช้กำหนด "ศีรษะอยู่หน้าคอเสื้อ" */
  function jawCurve(face) {
    const P = face.P;
    if (P && P.length >= 17) {
      const jaw = P.slice(0, 17).slice().sort((a, b) => a.x - b.x);
      return x => {
        if (x <= jaw[0].x) return jaw[0].y; if (x >= jaw[16].x) return jaw[16].y;
        let i = 0; while (i < 15 && jaw[i + 1].x < x) i++;
        const a = jaw[i], b = jaw[i + 1], t = (x - a.x) / Math.max(1e-6, b.x - a.x); return a.y + (b.y - a.y) * t;
      };
    }
    const hw = face.fw / 2, top = face.eyeY;
    return x => { const t = (x - face.cx) / hw; return Math.abs(t) >= 1 ? top : top + (face.chinY - top) * Math.sqrt(1 - t * t); };
  }
  /** mask ศีรษะ+ผม (ส่วนของตัวคนที่อยู่เหนือเส้นคาง) — ขอบนุ่ม feather px */
  function headMask(alpha, w, h, face, feather = 2) {
    const m = new Float32Array(w * h), jy = jawCurve(face), pad = face.fw * .015;
    for (let x = 0; x < w; x++) {
      const cy = jy(x) + pad;
      for (let y = 0, Y = Math.min(h, Math.ceil(cy + feather)); y < Y; y++) { const i = y * w + x; m[i] = alpha[i] * smooth((cy + feather - y) / (2 * feather)); }
    }
    return m;
  }

  // =====================================================================
  // รีทัช
  // =====================================================================
  /** เติม polygon (scanline even-odd) ลง Float32Array */
  function fillPoly(m, w, h, pts, v) {
    if (!pts.length) return;
    const ys = pts.map(p => p.y), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const xs = [], yy = y + .5;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > yy) !== (b.y > yy)) xs.push(a.x + (yy - a.y) / (b.y - a.y) * (b.x - a.x)); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - .5)); x <= Math.min(w - 1, Math.floor(xs[k + 1] - .5)); x++) m[y * w + x] = v;
    }
  }
  const grow = (pts, k, dy = 0) => { const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }; return pts.map(p => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k + dy })); };

  /** ความน่าจะเป็นว่าเป็นสีผิว (YCbCr แบบนุ่ม — Chai & Ngan 1999) 0..1 */
  function skinLikelihood(r, g, b) {
    const cb = 128 - .168736 * r - .331264 * g + .5 * b, cr = 128 + .5 * r - .418688 * g - .081312 * b, y = .299 * r + .587 * g + .114 * b;
    if (y < 35 || cr < 136) return 0; // ต้องมีความแดงอมส้มพอ (กันสีขาว/เทาเป็นผิว)
    const dcr = Math.max(0, Math.abs(cr - 152) - 14) / 8, dcb = Math.max(0, Math.abs(cb - 110) - 16) / 8;
    return Math.max(0, 1 - Math.hypot(dcr, dcb)) * smooth((cr - 136) / 6);
  }

  /**
   * mask บริเวณใบหน้า: { skin, eyes, underEye, mouth } (Float32Array w*h) จาก landmark 68 จุด หรือวงรีจาก face
   * skin = หน้า+หน้าผาก ลบ ตา คิ้ว ปาก รูจมูก × ความเป็นสีผิว × alpha
   */
  function faceMasks(rgba, w, h, face, alpha = null) {
    const n = w * h, skin = new Float32Array(n), eyes = new Float32Array(n), under = new Float32Array(n), mouth = new Float32Array(n), P = face.P;
    const fw = face.fw, r = Math.max(2, Math.round(fw * .03));
    if (P && P.length >= 68) {
      const eyeMid = { x: (P[36].x + P[45].x) / 2, y: (P[36].y + P[45].y) / 2 }, faceH = Math.hypot(P[8].x - eyeMid.x, P[8].y - eyeMid.y);
      const lift = p => ({ x: p.x + (p.x - P[27].x) * .05, y: p.y - faceH * .45 });
      fillPoly(skin, w, h, [...P.slice(0, 17), ...P.slice(17, 27).reverse().map(lift)], 1);
      // บริเวณคอใต้คาง (ผิวที่เห็นเหนือคอเสื้อ)
      fillPoly(skin, w, h, [P[4], P[8], P[12], { x: P[12].x, y: P[8].y + faceH * .5 }, { x: P[4].x, y: P[8].y + faceH * .5 }], 1);
      for (const [a, b] of [[36, 42], [42, 48]]) {
        fillPoly(skin, w, h, grow(P.slice(a, b), 1.9), 0); fillPoly(eyes, w, h, grow(P.slice(a, b), 1.15), 1);
        const lo = P.slice(a, b), wd = Math.abs(lo[3].x - lo[0].x);
        fillPoly(under, w, h, [lo[0], lo[5], lo[4], lo[3], { x: lo[3].x - wd * .1, y: lo[3].y + wd * .45 }, { x: (lo[0].x + lo[3].x) / 2, y: (lo[0].y + lo[3].y) / 2 + wd * .6 }, { x: lo[0].x + wd * .1, y: lo[0].y + wd * .45 }].map(p => ({ x: p.x, y: p.y + wd * .08 })), 1);
      }
      fillPoly(skin, w, h, grow(P.slice(17, 22), 1.5), 0); fillPoly(skin, w, h, grow(P.slice(22, 27), 1.5), 0);
      fillPoly(skin, w, h, grow(P.slice(48, 60), 1.18), 0); fillPoly(skin, w, h, grow([P[31], P[33], P[35], P[30]], 1.3), 0);
      fillPoly(mouth, w, h, P.slice(60, 68), 1);
    } else {
      const ex = fw * .48, ey = (face.chinY - face.eyeY) * 1.55, cy = face.chinY - ey * .72;
      const pts = []; for (let i = 0; i < 40; i++) { const t = i / 40 * Math.PI * 2; pts.push({ x: face.cx + Math.cos(t) * ex, y: cy + Math.sin(t) * ey }); }
      fillPoly(skin, w, h, pts, 1);
    }
    const blurM = m => boxFilter(boxFilter(m, w, h, r), w, h, r);
    const S = blurM(skin);
    for (let i = 0; i < n; i++) { const k = .35 + .65 * skinLikelihood(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); S[i] *= k * (alpha ? alpha[i] : 1); }
    return { skin: S, eyes: blurM(eyes), underEye: blur3(under, w, h, r), mouth: blurM(mouth) };
  }

  /**
   * ผิวเนียนแบบ frequency separation: low = guided filter (รักษาขอบ), high = I - low
   * out = I + (low - I)·m·s·(1 - keep)  → พื้นผิวผิวคงอยู่บางส่วน; พิกเซลที่ mask = 0 ไม่เปลี่ยนแม้แต่บิตเดียว
   * blemish > 0: จุดเล็กที่มืดกว่าบริเวณรอบ ๆ (สิว/ฝ้า) แทนด้วย low-pass เต็มที่
   */
  function smoothSkin(rgba, w, h, mask, { strength = .5, radius = 6, eps = .0036, keep = .3, blemish = 0, box = null } = {}) {
    const out = new Uint8ClampedArray(rgba); if (!(strength > 0 || blemish > 0)) return out;
    // ทำงานเฉพาะกรอบที่ mask > 0 เพื่อความเร็ว
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    if (box) { x0 = Math.max(0, box.x | 0); y0 = Math.max(0, box.y | 0); x1 = Math.min(w - 1, Math.ceil(box.x + box.w)); y1 = Math.min(h - 1, Math.ceil(box.y + box.h)); }
    else for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) return out;
    const pad = radius * 2; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, n = cw * ch;
    const lows = [], Is = [];
    for (let c = 0; c < 3; c++) {
      const I = new Float32Array(n);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) I[y * cw + x] = rgba[((y + y0) * w + x + x0) * 4 + c] / 255;
      Is.push(I); lows.push(guidedFilter(I, I, cw, ch, radius, eps));
    }
    let spot = null;
    if (blemish > 0) { // จุดด่าง: luma ต่ำกว่าค่าเฉลี่ยบริเวณกว้าง (รัศมี 2r) เกินเกณฑ์
      const Lm = new Float32Array(n); for (let i = 0; i < n; i++) Lm[i] = .299 * Is[0][i] + .587 * Is[1][i] + .114 * Is[2][i];
      const wide = boxFilter(Lm, cw, ch, radius * 2); spot = new Float32Array(n);
      for (let i = 0; i < n; i++) spot[i] = smooth((wide[i] - Lm[i] - .025) / .05);
      spot = boxFilter(spot, cw, ch, Math.max(1, radius >> 2));
      // ค่าแทน = ค่าเฉลี่ยกว้างของ low-pass (ลบจุด ไม่ใช่แค่ทำให้นุ่ม)
      lows.forEach((lo, c) => { const wl = boxFilter(lo, cw, ch, radius); lows[c] = { lo, wl }; });
    }
    for (let c = 0; c < 3; c++) {
      const I = Is[c], L = spot ? lows[c].lo : lows[c], WL = spot ? lows[c].wl : null;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const li = y * cw + x, gi = (y + y0) * w + x + x0, m = mask[gi]; if (m <= 0) continue;
        let v = I[li] + (L[li] - I[li]) * m * strength * (1 - keep);
        if (spot && spot[li] > 0) { const k = clamp01(spot[li] * blemish * m); v = v + (WL[li] + (I[li] - L[li]) * keep - v) * k; }
        out[gi * 4 + c] = v * 255;
      }
    }
    return out;
  }

  /** ปรับความสว่าง/คอนทราสต์เฉพาะบริเวณ (ตา ใต้ตา ฟัน) ใน L*a*b*: dL บวก, contrast รอบค่าเฉลี่ย, bShift ลดสีเหลือง */
  function adjustRegion(rgba, w, h, mask, { dL = 0, contrast = 0, bShift = 0, onlyBright = 0 } = {}) {
    const out = new Uint8ClampedArray(rgba), st = labStats(rgba, w, h, mask, { thr: .3 });
    if (!st) return out;
    for (let i = 0, n = w * h; i < n; i++) {
      const m = mask[i]; if (m <= .01) continue;
      const lab = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
      const k = onlyBright ? smooth((lab[0] - onlyBright) / 15) * m : m;
      if (k <= 0) continue;
      lab[0] = lab[0] + (dL + (lab[0] - st.mean[0]) * contrast) * k;
      lab[2] = lab[2] + bShift * k;
      const rgb = labToRgb(lab[0], lab[1], lab[2]);
      for (let c = 0; c < 3; c++) out[i * 4 + c] = rgb[c];
    }
    return out;
  }

  /** ความใกล้เคียงสีผิวของผู้ถ่าย (ระยะ L*a*b* เทียบค่าเฉลี่ย/ส่วนเบี่ยงเบนของผิว) 0..1 เฉพาะกรอบ box (นอกกรอบ = 1) */
  function skinKeepMask(rgba, w, h, skin, box, k = 3) {
    const m = new Float32Array(w * h).fill(1);
    const x0 = clamp(Math.floor(box.x0), 0, w), x1 = clamp(Math.ceil(box.x1), 0, w), y0 = clamp(Math.floor(box.y0), 0, h), y1 = clamp(Math.ceil(box.y1), 0, h);
    const sd = skin.std.map((v, c) => Math.max(v, c ? 4 : 8));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x, L = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
      // ความสว่างให้คลาดได้มาก (เงาที่คอ) สีให้คลาดได้น้อย
      const d = Math.hypot((L[0] - skin.mean[0]) / (sd[0] * 2), (L[1] - skin.mean[1]) / sd[1], (L[2] - skin.mean[2]) / sd[2]);
      m[i] = 1 - smooth((d - k) / k);
    }
    return blur3(m, w, h, 1);
  }

  /** Unsharp mask: out = I + amount·(I - blur) · (1 - protect) */
  function sharpen(rgba, w, h, amount, { radius = 1, protect = null } = {}) {
    const out = new Uint8ClampedArray(rgba); if (!(amount > 0)) return out;
    const n = w * h;
    for (let c = 0; c < 3; c++) {
      const I = channel(rgba, n, c, 1), b = boxFilter(I, w, h, radius);
      for (let i = 0; i < n; i++) { const k = amount * (protect ? 1 - protect[i] : 1); if (k > 0) out[i * 4 + c] = I[i] + (I[i] - b[i]) * k; }
    }
    return out;
  }

  // =====================================================================
  // ผสานชุดเข้ากับภาพ
  // =====================================================================
  /** ระดับ noise (σ ของ luma 0..255) จาก median absolute Laplacian ในบริเวณ mask (Immerkær) */
  function estimateNoise(rgba, w, h, mask = null, step = 2) {
    const vals = [];
    for (let y = 1; y < h - 1; y += step) for (let x = 1; x < w - 1; x += step) {
      const i = y * w + x; if (mask && mask[i] <= .9) continue;
      const L = j => .299 * rgba[j * 4] + .587 * rgba[j * 4 + 1] + .114 * rgba[j * 4 + 2];
      vals.push(Math.abs(4 * L(i) - L(i - 1) - L(i + 1) - L(i - w) - L(i + w)));
    }
    if (vals.length < 16) return 0;
    vals.sort((a, b) => a - b);
    return vals[vals.length >> 1] / .6745 / Math.sqrt(20); // σ ของ Laplacian 5 จุด = √20·σ
  }
  /** สุ่มแบบกำหนดค่าเริ่มได้ (mulberry32) */
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  /** เติม grain แบบเกาส์เซียน (ความสว่างเท่านั้น) σ ตาม mask — ให้ชุดมี noise เท่ากับภาพถ่ายจริง */
  function addGrain(rgba, w, h, mask, sigma, seed = 7) {
    const out = new Uint8ClampedArray(rgba); if (!(sigma > .2)) return out;
    const r = rng(seed);
    for (let i = 0, n = w * h; i < n; i++) {
      const m = mask ? mask[i] : 1; if (m <= 0) continue;
      const g = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()) * sigma * m;
      for (let c = 0; c < 3; c++) out[i * 4 + c] = rgba[i * 4 + c] + g;
    }
    return out;
  }

  /**
   * ปรับชุด (RGBA ในพิกัดภาพผลลัพธ์) ให้เข้ากับแสงของภาพ:
   *  user = { gray:[r,g,b] (gray-world ของภาพผู้ถ่าย), faceLum, skin: labStats ผิวผู้ถ่าย, lr: [lumซ้าย, lumขวา], noise, cx, fw }
   *  ref  = { gray (gray-world ของชุดต้นฉบับ หรือ null = เป็นกลาง), faceLum (ของนายแบบ หรือ null) }
   * ขั้นตอน: สมดุลแสงสี (ตามสีแสงของภาพ) → ความสว่าง → เงาทิศทางซ้าย/ขวา → สีผิวส่วนคอ/อกของนายแบบให้เป็นผิวผู้ถ่าย → grain
   */
  function harmonizeGarment(rgba, w, h, user, ref = {}, { strength = 1, bright = 1, seed = 11 } = {}) {
    const n = w * h, alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) alpha[i] = rgba[i * 4 + 3] / 255;
    let out = rgba;
    // 1) สีของแสง: ให้ชุดมี "สีแสง" เดียวกับภาพ (ครึ่งหนึ่งของความต่าง เพื่อไม่ให้ชุดขาวเปลี่ยนสี)
    if (user.gray) {
      const ug = user.gray, uAvg = (ug[0] + ug[1] + ug[2]) / 3, rg = ref.gray || [1, 1, 1], rAvg = (rg[0] + rg[1] + rg[2]) / 3;
      const gains = [0, 1, 2].map(c => clamp(1 + ((ug[c] / uAvg) / (rg[c] / rAvg) - 1) * .5 * strength, .9, 1.1));
      // 2) ความสว่างโดยรวม: เทียบผิวหน้าผู้ถ่ายกับนายแบบ (ชุดจากรูปจริง) หรือค่ากลาง 165 (ชุดภาพวาด)
      let ex = 1;
      if (user.faceLum) ex = ref.faceLum ? clamp(user.faceLum / ref.faceLum, .8, 1.25) : clamp(1 + (user.faceLum / 165 - 1) * .5, .85, 1.12);
      ex = 1 + (ex - 1) * strength;
      out = applyGains(out, w, h, gains, { mask: alpha, exposure: ex * bright });
    } else if (bright !== 1) out = applyGains(out, w, h, [1, 1, 1], { mask: alpha, exposure: bright });
    // 3) แสงเข้าทางด้านเดียวกับใบหน้า
    if (user.lr && user.fw) {
      const [l, r] = user.lr, k = clamp((r - l) / Math.max(1, r + l) * 1.2, -.15, .15) * strength;
      if (Math.abs(k) > .005) {
        const o2 = new Uint8ClampedArray(out), half = user.fw * 1.6;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x; if (alpha[i] <= 0) continue;
          const g = 1 + k * clamp((x - user.cx) / half, -1, 1);
          for (let c = 0; c < 3; c++) o2[i * 4 + c] = out[i * 4 + c] * g;
        }
        out = o2;
      }
    }
    // 4) ผิวที่ติดมากับชุด (คอวี/คอนายแบบ) → Reinhard ไปยังสีผิวผู้ถ่าย
    if (user.skin && ref.hasSkin !== false) {
      const sk = new Float32Array(n); let cnt = 0;
      for (let i = 0; i < n; i++) if (alpha[i] > .1) { const v = skinLikelihood(out[i * 4], out[i * 4 + 1], out[i * 4 + 2]); if (v > .5) { sk[i] = v * alpha[i]; cnt++; } }
      if (cnt > 30) {
        const sm = blur3(sk, w, h, 1), src = labStats(out, w, h, sm, { thr: .5 });
        if (src) out = reinhardTransfer(out, w, h, sm, src, user.skin, { strength: .9 * strength });
      }
    }
    // 5) grain
    if (user.noise) {
      const gN = estimateNoise(out, w, h, alpha), add = Math.sqrt(Math.max(0, user.noise * user.noise - gN * gN));
      if (add > .3) out = addGrain(out, w, h, alpha, add * strength, seed);
    }
    if (out === rgba) out = new Uint8ClampedArray(rgba);
    for (let i = 0; i < n; i++) out[i * 4 + 3] = rgba[i * 4 + 3];
    return out;
  }

  /**
   * เงาสัมผัส: (1) เงาใต้คางบนคอ — เริ่มจากเส้นคางแล้วจางลงด้านล่าง (ไม่เป็นแถบทึบ) (2) ambient occlusion ที่คอบริเวณขอบคอเสื้อ
   * คืน Float32Array ความมืด 0..1 (คูณ (1 - shade) กับสี)
   */
  function contactShadow(garmentAlpha, w, h, face, { chin = .35, collar = .3 } = {}) {
    const n = w * h, s = new Float32Array(n), fw = face.fw, jy = jawCurve(face), fall = fw * .1, hw = fw * .42, cx = face.chinX != null ? face.chinX : face.cx;
    if (chin > 0) for (let x = Math.max(0, Math.floor(cx - hw)); x < Math.min(w, Math.ceil(cx + hw)); x++) {
      const wx = 1 - smooth(Math.abs(x - cx) / hw), y0 = jy(x);
      for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y0 + fall * 4)); y++) {
        const d = (y - y0) / fall; if (d <= 0) continue;
        s[y * w + x] = chin * wx * Math.exp(-d) * (1 - Math.exp(-d * 5));
      }
    }
    if (collar > 0 && garmentAlpha) {
      const r = Math.max(2, Math.round(fw * .03)), b = blur3(garmentAlpha, w, h, r);
      for (let i = 0; i < n; i++) { const v = b[i] * (1 - garmentAlpha[i]); if (v > 0) s[i] = Math.max(s[i], clamp01(v * 2.2) * collar); }
    }
    return s;
  }

  /** Light wrap: ขอบ foreground รับแสงจากฉากหลังที่เบลอ (screen blend) — คืน RGBA ใหม่ */
  function lightWrap(compRGBA, bgRGBA, fgAlpha, w, h, { radius = 8, amount = .35 } = {}) {
    const out = new Uint8ClampedArray(compRGBA); if (!(amount > 0)) return out;
    const n = w * h, ba = blur3(fgAlpha, w, h, Math.max(1, radius >> 1));
    const edge = new Float32Array(n); let any = false;
    for (let i = 0; i < n; i++) { const e = fgAlpha[i] * (1 - ba[i]) * 1.4; if (e > .002) { edge[i] = Math.min(1, e); any = true; } }
    if (!any) return out;
    for (let c = 0; c < 3; c++) {
      const B = blur3(channel(bgRGBA, n, c, 1 / 255), w, h, radius);
      for (let i = 0; i < n; i++) { const e = edge[i] * amount; if (e <= 0) continue; const a = out[i * 4 + c] / 255, s = 1 - (1 - a) * (1 - B[i]); out[i * 4 + c] = (a + (s - a) * e) * 255; }
    }
    return out;
  }

  /** ภาพฉากเดิมแบบเบลอ (ลบตัวคนออกด้วยการเฉลี่ยถ่วงน้ำหนัก 1-alpha) */
  function blurredBackground(rgba, alpha, w, h, radius) {
    const n = w * h, inv = new Float32Array(n); for (let i = 0; i < n; i++) inv[i] = Math.pow(1 - alpha[i], 4);
    const den = blur3(inv, w, h, radius), out = new Uint8ClampedArray(n * 4);
    const fill = blur3(den, w, h, radius * 2); // ช่วยเติมตรงกลางที่ถูกตัวคนบังทั้งหมด
    for (let c = 0; c < 3; c++) {
      const p = new Float32Array(n); for (let i = 0; i < n; i++) p[i] = rgba[i * 4 + c] * inv[i];
      const num = blur3(p, w, h, radius), num2 = blur3(num, w, h, radius * 2);
      for (let i = 0; i < n; i++) out[i * 4 + c] = den[i] > .05 ? num[i] / den[i] : (num2[i] + 1e-3 * 128) / (fill[i] + 1e-3);
    }
    for (let i = 0; i < n; i++) out[i * 4 + 3] = 255;
    return out;
  }

  /**
   * รวมภาพสุดท้าย (ทั้งหมดขนาด w×h):
   *  bg (RGBA), person (RGBA สีที่ประมาณแล้ว), pA (alpha ตัวคน), garment (RGBA หรือ null), head (mask ศีรษะที่อยู่หน้าชุด), shade (เงาสัมผัส)
   *  opt: hideBody (ซ่อนเสื้อเดิมที่อยู่ใต้แนวคอเสื้อ), levels (Laplacian), wrap (light wrap)
   * คืน { rgba, fgAlpha }
   */
  function composite({ w, h, bg, person, pA, garment = null, head = null, shade = null, hideBody = true, levels = 4, wrap = .3, wrapR = 8, neck = null, seam = null, neckKeep = null }) {
    const n = w * h, gA = new Float32Array(n), A = new Float32Array(n);
    if (garment) for (let i = 0; i < n; i++) gA[i] = (garment[i * 4 + 3] / 255) * (head ? 1 - head[i] : 1);
    for (let i = 0; i < n; i++) A[i] = pA[i];
    if (garment && hideBody) {
      // ซ่อนตัวคน (เสื้อเดิม) ใต้ขอบบนของชุดในแต่ละคอลัมน์ ที่อยู่นอกตัวชุด; ช่องคอเสื้ออยู่เหนือขอบบนจึงยังเห็นคอ
      // คอลัมน์ที่ไม่มีชุด ใช้ขอบบนของคอลัมน์ชุดที่ใกล้ที่สุด; ศีรษะ (head) ไม่ถูกซ่อนเสมอ
      const tops = new Int32Array(w).fill(-1);
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (garment[(y * w + x) * 4 + 3] > 127) { tops[x] = y; break; }
      let firstX = -1, lastX = -1; for (let x = 0; x < w; x++) if (tops[x] >= 0) { if (firstX < 0) firstX = x; lastX = x; }
      if (firstX >= 0) {
        const fe = Math.max(2, Math.round(w / 300)), T = new Int32Array(w);
        for (let x = 0; x < w; x++) T[x] = tops[x] >= 0 ? tops[x] : x < firstX ? tops[firstX] : tops[lastX];
        if (neck) {
          // นอกช่วงคอ: เส้นตัดไม่ต่ำกว่าคอลัมน์ที่อยู่ใกล้แกนกลางกว่า (ไหล่ของชุดกำหนดรูปทรง เสื้อเดิมจึงไม่โผล่ข้างชุด)
          // และยกขึ้นอีก band px กันขอบไหล่เสื้อเดิมเป็นเส้นเหนือชุด
          const c = clamp(Math.round(neck.cx), 0, w - 1), hw = Math.round(neck.halfW);
          for (let x = c + hw + 1; x < w; x++) T[x] = Math.min(T[x], T[x - 1]);
          for (let x = c - hw - 1; x >= 0; x--) T[x] = Math.min(T[x], T[x + 1]);
          for (let x = 0; x < w; x++) T[x] -= Math.round(neck.band * smooth((Math.abs(x - neck.cx) - neck.halfW) / Math.max(1, neck.halfW * .5)));
        }
        for (let x = 0; x < w; x++) {
          const t = T[x], inNeck = neck && neckKeep && Math.abs(x - neck.cx) <= neck.halfW * 1.5;
          for (let y = inNeck ? 0 : Math.max(0, t - fe); y < h; y++) {
            // ใต้ขอบบนของชุด ตัวคนเดิมถูกซ่อนทั้งหมด (ชุดบังอยู่แล้ว) — ขอบโปร่งแสงของชุดจึงผสมกับฉากหลัง ไม่ใช่เสื้อเดิม
            const i = y * w + x, k = smooth((y - (t - fe)) / (2 * fe));
            let hidden = A[i] * (1 - k);
            // ช่องคอเสื้อ: เหนือขอบชุดเก็บเฉพาะผิว (คอ) — คอเสื้อเดิมที่ไม่ใช่สีผิวถูกซ่อน
            if (inNeck && y < t + fe) hidden *= neckKeep[i];
            A[i] = head ? Math.max(hidden, Math.min(A[i], head[i])) : hidden;
          }
        }
      }
    }
    // ฐาน = ฉากหลัง + ตัวคน (มีเงาสัมผัส)
    const base = [0, 1, 2].map(() => new Float32Array(n));
    for (let i = 0; i < n; i++) {
      const a = A[i], sh = shade ? 1 - shade[i] * (1 - gA[i]) : 1;
      for (let c = 0; c < 3; c++) base[c][i] = (bg[i * 4 + c] * (1 - a) + person[i * 4 + c] * sh * a) / 255;
    }
    let outCh = base;
    if (garment) {
      // บริเวณชุด (ขยายขอบ) ใช้ Laplacian blend; ภายนอกคงฐาน
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (gA[y * w + x] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      // ผสมปกติ (alpha) ทั้งชุด แล้วใช้ Laplacian blend เฉพาะบริเวณรอยต่อคอ (seam) ถ้าระบุ
      let res = base;
      if (seam && x1 >= x0) {
        res = base.map(ch => Float32Array.from(ch));
        for (let i = 0; i < n; i++) { const m = gA[i]; if (m <= 0) continue; const gs = shade ? 1 - shade[i] * .6 : 1; for (let c = 0; c < 3; c++) res[c][i] = base[c][i] * (1 - m) + garment[i * 4 + c] / 255 * gs * m; }
        x0 = Math.max(x0, Math.floor(seam.x0)); x1 = Math.min(x1, Math.ceil(seam.x1)); y0 = Math.max(y0, Math.floor(seam.y0)); y1 = Math.min(y1, Math.ceil(seam.y1));
      }
      if (x1 >= x0 && y1 >= y0) {
        const pad = 1 << (levels + 1); x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
        const cw = x1 - x0 + 1, ch = y1 - y0 + 1, cn = cw * ch, M = new Float32Array(cn);
        const Ac = [0, 1, 2].map(() => new Float32Array(cn)), Bc = [0, 1, 2].map(() => new Float32Array(cn));
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const li = y * cw + x, gi = (y + y0) * w + x + x0, m = gA[gi]; M[li] = m;
          for (let c = 0; c < 3; c++) {
            Ac[c][li] = base[c][gi];
            const gs = shade ? 1 - shade[gi] * .6 : 1;
            Bc[c][li] = m > .004 ? garment[gi * 4 + c] / 255 * gs : base[c][gi];
          }
        }
        const bl = laplacianBlend(Ac, Bc, M, cw, ch, levels);
        let Ab = null;
        if (seam) { Ab = new Float32Array(cn); for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) Ab[y * cw + x] = A[(y + y0) * w + x + x0]; Ab = blur3(Ab, cw, ch, 2); for (let i = 0; i < cn; i++) Ab[i] = smooth((Ab[i] - .2) / .6); }
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const li = y * cw + x, gi = (y + y0) * w + x + x0;
          // ภายใน seam: น้ำหนักนุ่มที่ขอบกรอบ เพื่อไม่ให้เกิดรอยต่อของกรอบเอง
          // และเฉพาะตรงที่ชุดชนกับตัวคน (คอ) — ขอบชุดที่ชนฉากหลังใช้ alpha ปกติ จะได้ไม่เบลอ
          const k = seam ? Math.min(1, Math.min(x, cw - 1 - x, y, ch - 1 - y) / pad) * (Ab ? Ab[li] : 1) : 1;
          if (k <= 0) continue;
          for (let c = 0; c < 3; c++) res[c][gi] = seam ? (k * bl[c][li] + (1 - k) * (Ac[c][li] * (1 - M[li]) + Bc[c][li] * M[li])) : bl[c][li];
        }
      }
      outCh = res;
    }
    const rgba = new Uint8ClampedArray(n * 4), fg = new Float32Array(n);
    for (let i = 0; i < n; i++) { for (let c = 0; c < 3; c++) rgba[i * 4 + c] = outCh[c][i] * 255; rgba[i * 4 + 3] = 255; fg[i] = Math.max(A[i], gA[i]); }
    return { rgba: wrap > 0 ? lightWrap(rgba, bg, fg, w, h, { radius: wrapR, amount: wrap }) : rgba, fgAlpha: fg };
  }

  /** แก้ alpha ด้วยแปรง: edit > 0 = คืนตัวคน, < 0 = ลบ (ค่า -1..1) */
  function applyMatteEdits(alpha, edit) {
    if (!edit) return alpha;
    const o = new Float32Array(alpha.length);
    for (let i = 0; i < o.length; i++) { const e = edit[i]; o[i] = e > 0 ? Math.max(alpha[i], e) : e < 0 ? Math.min(alpha[i], 1 + e) : alpha[i]; }
    return o;
  }
  /** วาดแปรงวงกลมขอบนุ่มลง edit (value = +1 คืน, -1 ลบ) */
  function brush(edit, w, h, cx, cy, r, value, hardness = .6) {
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(h, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(w, Math.ceil(cx + r)); x++) {
      const d = Math.hypot(x - cx, y - cy) / r; if (d >= 1) continue;
      const k = d < hardness ? 1 : 1 - smooth((d - hardness) / (1 - hardness)), i = y * w + x;
      edit[i] = value > 0 ? Math.max(edit[i], k) : Math.min(edit[i], -k);
    }
  }

  const api = {
    clamp01, clamp, smooth, boxFilter, blur3, guidedFilter, luma,
    refineMatte, estimateForeground, borderKeyAlpha,
    rgbToLab, labToRgb, labStats, reinhardTransfer, grayWorld, applyGains,
    blur5, pyrDown, pyrUp, laplacianBlend,
    solve, tpsFit, similarity, warpRGBA,
    runAt, spanAt, estimateBody, garmentShoulders, headFromMatte, jawCurve, headMask,
    fillPoly, skinLikelihood, skinKeepMask, faceMasks, smoothSkin, adjustRegion, sharpen,
    estimateNoise, rng, addGrain, harmonizeGarment, contactShadow, lightWrap, blurredBackground, composite,
    applyMatteEdits, brush
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.StudioCore = api;
})(typeof window !== "undefined" ? window : globalThis);
