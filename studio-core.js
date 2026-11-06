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
    // แกนตั้ง: ผลรวมสะสมรายคอลัมน์ เดินทีละแถว (อ่านหน่วยความจำต่อเนื่อง เร็วกว่าเดินทีละคอลัมน์หลายเท่า)
    const col = new Float64Array(w);
    for (let y = 0; y <= Math.min(r, h - 1); y++) { const o = y * w; for (let x = 0; x < w; x++) col[x] += tmp[o + x]; }
    for (let y = 0; y < h; y++) {
      const lo = y - r - 1, hi = y + r;
      if (hi < h && y > 0) { const o = hi * w; for (let x = 0; x < w; x++) col[x] += tmp[o + x]; }
      if (lo >= 0) { const o = lo * w; for (let x = 0; x < w; x++) col[x] -= tmp[o + x]; }
      const inv = 1 / (Math.min(h - 1, hi) - Math.max(0, y - r) + 1), o = y * w;
      for (let x = 0; x < w; x++) out[o + x] = col[x] * inv;
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
  function estimateForeground(rgba, alpha, w, h, { radii = null, half = null } = {}) {
    // ภาพใหญ่: คำนวณสีพื้นหน้า/หลังแบบเบลอที่ความละเอียดครึ่งหนึ่ง (เป็นสนามสีที่เรียบอยู่แล้ว) แล้วขยายกลับ — เร็วขึ้น ~3 เท่า
    if (half == null ? w * h > 250000 && !radii : half) return estimateForegroundHalf(rgba, alpha, w, h);
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
  function estimateForegroundHalf(rgba, alpha, w, h) {
    const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2), n2 = w2 * h2, n = w * h;
    const big = Math.max(4, Math.round(Math.min(w, h) / 40)), R = [big * 4, big, Math.max(2, big >> 1), Math.max(2, big >> 2)].map(r => Math.max(1, Math.round(r / 2)));
    const wf = new Float32Array(n2), wb = new Float32Array(n2), ch = [0, 1, 2].map(() => [new Float32Array(n2), new Float32Array(n2)]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, j = (y >> 1) * w2 + (x >> 1), a = alpha[i], f = smooth((a - .8) / .18), b = smooth((.2 - a) / .18);
      wf[j] += f / 4; wb[j] += b / 4; for (let c = 0; c < 3; c++) { ch[c][0][j] += rgba[i * 4 + c] * f / 4; ch[c][1][j] += rgba[i * 4 + c] * b / 4; }
    }
    const dens = R.map(r => [boxFilter(wf, w2, h2, r), boxFilter(wb, w2, h2, r)]);
    const level = (p, k) => { let F = null; R.forEach((r, li) => { const num = boxFilter(p, w2, h2, r), den = dens[li][k], e = 1e-3, nf = new Float32Array(n2); for (let i = 0; i < n2; i++) nf[i] = (num[i] + e * (F ? F[i] : 128)) / (den[i] + e); F = nf; }); return F; };
    const out = new Uint8ClampedArray(n * 4);
    for (let c = 0; c < 3; c++) {
      const Fs = level(ch[c][0], 0), Bs = level(ch[c][1], 1);
      for (let y = 0; y < h; y++) {
        const fy = Math.min(h2 - 1, Math.max(0, (y - .5) / 2)), y0 = Math.floor(fy), y1 = Math.min(h2 - 1, y0 + 1), ty = fy - y0;
        for (let x = 0; x < w; x++) {
          const i = y * w + x, a = alpha[i], t = smooth((a - .6) / .38), I = rgba[i * 4 + c];
          if (t >= 1 || a <= 0) { out[i * 4 + c] = I; continue; }
          const fx = Math.min(w2 - 1, Math.max(0, (x - .5) / 2)), x0 = Math.floor(fx), x1 = Math.min(w2 - 1, x0 + 1), tx = fx - x0;
          const bl = A => (A[y0 * w2 + x0] * (1 - tx) + A[y0 * w2 + x1] * tx) * (1 - ty) + (A[y1 * w2 + x0] * (1 - tx) + A[y1 * w2 + x1] * tx) * ty;
          const fs = bl(Fs), bs = bl(Bs), Fsolve = clamp((I - (1 - a) * bs) / Math.max(a, .05), 0, 255), k = smooth((a - .1) / .35);
          out[i * 4 + c] = t * I + (1 - t) * (k * Fsolve + (1 - k) * fs);
        }
      }
    }
    for (let i = 0; i < n; i++) out[i * 4 + 3] = alpha[i] * 255;
    return out;
  }
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
    // เบลอเฉพาะแถบแถวรอบใบหน้า (mask อยู่ในบริเวณนี้ทั้งหมด) — เร็วกว่าเบลอทั้งภาพหลายเท่า
    const ya = Math.max(0, Math.floor(face.eyeY - fw * 1.5)), yb = Math.min(h, Math.ceil(face.chinY + fw * 1.0)), hh = Math.max(1, yb - ya);
    const inRows = f => m => { const o = new Float32Array(n); o.set(f(m.subarray(ya * w, yb * w)), ya * w); return o; };
    const blurM = inRows(m => boxFilter(boxFilter(m, w, hh, r), w, hh, r)), blurU = inRows(m => blur3(m, w, hh, r));
    const S = blurM(skin);
    for (let i = ya * w; i < yb * w; i++) { if (!S[i]) continue; const k = .35 + .65 * skinLikelihood(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); S[i] *= k * (alpha ? alpha[i] : 1); }
    return { skin: S, eyes: blurM(eyes), underEye: blurU(under), mouth: blurM(mouth) };
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
    if (w * h > 400000 && step < 4) step = 4; // ภาพใหญ่: สุ่มห่างขึ้น (ค่ามัธยฐานเสถียรอยู่แล้ว)
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
  function harmonizeGarment(rgba, w, h, user, ref = {}, { strength = 1, bright = 1, seed = 11, mono = false } = {}) {
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
    for (let i = 0; i < n; i++) {
      out[i * 4 + 3] = rgba[i * 4 + 3];
      if (mono) { const y = .299 * out[i * 4] + .587 * out[i * 4 + 1] + .114 * out[i * 4 + 2]; out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = y; } // ภาพขาวดำ: ชุดเป็นขาวดำด้วย
    }
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
      // เฉพาะแถบรอบคอเสื้อ (คางลงไป ~1.3 หน้า) — ไม่ต้องเบลอทั้งภาพ
      const r = Math.max(2, Math.round(fw * .03)), ya = Math.max(0, Math.floor(face.chinY - fw * .3)), yb = Math.min(h, Math.ceil(face.chinY + fw * 1.3));
      if (yb > ya + 2) {
        const b = blur3(garmentAlpha.subarray(ya * w, yb * w), w, yb - ya, r);
        for (let k = 0; k < b.length; k++) { const i = ya * w + k, v = b[k] * (1 - garmentAlpha[i]); if (v > 0) s[i] = Math.max(s[i], clamp01(v * 2.2) * collar); }
      }
    }
    return s;
  }

  /** Light wrap: ขอบ foreground รับแสงจากฉากหลังที่เบลอ (screen blend) — คืน RGBA ใหม่ */
  const lwCache = { bg: null, r: 0, n: 0, B: null };
  function lightWrap(compRGBA, bgRGBA, fgAlpha, w, h, { radius = 8, amount = .35 } = {}) {
    const out = new Uint8ClampedArray(compRGBA); if (!(amount > 0)) return out;
    const n = w * h, ba = blur3(fgAlpha, w, h, Math.max(1, radius >> 1));
    const edge = new Float32Array(n); let any = false;
    for (let i = 0; i < n; i++) { const e = fgAlpha[i] * (1 - ba[i]) * 1.4; if (e > .002) { edge[i] = Math.min(1, e); any = true; } }
    if (!any) return out;
    // ฉากหลังเบลอ: แคชตามอาร์เรย์ฉาก+รัศมี (เปลี่ยนชุดไม่ต้องเบลอฉากใหม่) และฉากสีเดียวไม่ต้องเบลอเลย
    if (!(lwCache.bg === bgRGBA && lwCache.r === radius && lwCache.n === n)) {
      let uni = true; for (let i = 0; i < n * 4 && uni; i += 4 * 61) uni = bgRGBA[i] === bgRGBA[0] && bgRGBA[i + 1] === bgRGBA[1] && bgRGBA[i + 2] === bgRGBA[2];
      lwCache.bg = bgRGBA; lwCache.r = radius; lwCache.n = n;
      lwCache.B = [0, 1, 2].map(c => uni ? new Float32Array(n).fill(bgRGBA[c] / 255) : blur3(channel(bgRGBA, n, c, 1 / 255), w, h, radius));
    }
    for (let c = 0; c < 3; c++) {
      const B = lwCache.B[c];
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

  // =====================================================================
  // แยกส่วนใบหน้า/ผม/คอ/เสื้อ (face parsing) และลำดับชั้นภาพ
  // =====================================================================
  /*
   * โมเดล: BiSeNet face parsing (CelebAMask-HQ 19 คลาส) — github.com/yakhyo/face-parsing (MIT; สถาปัตยกรรมจาก
   * zllrunning/face-parsing.PyTorch, MIT) แปลงเป็น ONNX แล้ว quantize น้ำหนักเป็น uint8 (vendor/models/faceparse-bisenet-r18-q8.onnx)
   * อินพุต: ภาพครอปสี่เหลี่ยมรอบใบหน้า 512×512 (normalize ImageNet) เอาต์พุต: logits [19,512,512]
   */
  const PARSE_LABELS = ["background", "skin", "l_brow", "r_brow", "l_eye", "r_eye", "eye_g", "l_ear", "r_ear", "ear_r", "nose", "mouth", "u_lip", "l_lip", "neck", "neck_l", "cloth", "hair", "hat"];
  /** กลุ่มคลาส: head = ใบหน้า+หู+ต่างหู+แว่น+หมวก (อยู่หน้าชุด), hair (อยู่หน้าชุด), neck (อยู่หลังชุด), cloth = เสื้อเดิม+สร้อยคอ (ซ่อน) */
  const PARSE_GROUPS = { head: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 18], hair: [17], neck: [14], cloth: [15, 16], bg: [0] };

  /** กรอบครอป (สี่เหลี่ยมจัตุรัส) สำหรับ parser: ด้าน k×ความกว้างหน้า ศูนย์กลางใต้ตา (ให้ครอบผมยาวถึงไหล่) */
  function parseCrop(face, k = 3) {
    const side = Math.max(16, face.fw * k);
    return { x: face.cx - side / 2, y: face.eyeY + face.fw * .2 * k - side / 2, side };
  }
  /** softmax ต่อพิกเซล แล้วรวมความน่าจะเป็นตามกลุ่ม: logits = Float32Array [C, n] (C = 19) → {head, hair, neck, cloth, bg} */
  function parseGroups(logits, n, C = 19) {
    const out = {}, gi = new Int8Array(C).fill(-1), names = Object.keys(PARSE_GROUPS);
    names.forEach((g, k) => { out[g] = new Float32Array(n); PARSE_GROUPS[g].forEach(c => { if (c < C) gi[c] = k; }); });
    const arr = names.map(g => out[g]), e = new Float32Array(C);
    for (let i = 0; i < n; i++) {
      let m = -Infinity; for (let c = 0; c < C; c++) { const v = logits[c * n + i]; if (v > m) m = v; }
      let s = 0; for (let c = 0; c < C; c++) { e[c] = Math.exp(logits[c * n + i] - m); s += e[c]; }
      for (let c = 0; c < C; c++) if (gi[c] >= 0) arr[gi[c]][i] += e[c] / s;
    }
    return out;
  }
  /** ขยาย map S×S ของครอปกลับเป็นพิกัดภาพ W×H (bilinear) — นอกครอป = outside */
  function cropToImage(map, S, crop, W, H, outside = 0) {
    const o = new Float32Array(W * H); if (outside) o.fill(outside);
    const k = S / crop.side, x0 = Math.max(0, Math.floor(crop.x)), y0 = Math.max(0, Math.floor(crop.y));
    const x1 = Math.min(W, Math.ceil(crop.x + crop.side)), y1 = Math.min(H, Math.ceil(crop.y + crop.side));
    for (let y = y0; y < y1; y++) {
      const fy = (y + .5 - crop.y) * k - .5, j0 = clamp(Math.floor(fy), 0, S - 1), j1 = Math.min(S - 1, j0 + 1), ty = clamp01(fy - j0);
      for (let x = x0; x < x1; x++) {
        const fx = (x + .5 - crop.x) * k - .5, i0 = clamp(Math.floor(fx), 0, S - 1), i1 = Math.min(S - 1, i0 + 1), tx = clamp01(fx - i0);
        const a = map[j0 * S + i0] + (map[j0 * S + i1] - map[j0 * S + i0]) * tx, b = map[j1 * S + i0] + (map[j1 * S + i1] - map[j1 * S + i0]) * tx;
        o[y * W + x] = a + (b - a) * ty;
      }
    }
    return o;
  }
  /**
   * รวมผลโมเดล 6 คลาส (MediaPipe Selfie Multiclass: 0 bg, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others) หลายรอบ
   * runs = [{prob [6*S*S] CHW, S, rect {x,y,w,h}}] เรียงจากหยาบ (ทั้งภาพ) ไปละเอียด (ครอปศีรษะ) — รอบหลังทับรอบก่อนภายในกรอบ
   * (ขอบกรอบผสมนุ่ม) แล้วจัดกลุ่มแบบมีเงื่อนไขว่าเป็นตัวคน (หารด้วย 1 - bg; ขอบนอกตัวคนใช้ alpha จาก MODNet อยู่แล้ว):
   *   head = ผิวหน้า (รวมหู) + เครื่องประดับใกล้ศีรษะ (ต่างหู แว่น หมวก — ไม่กลายเป็นรู), hair = ผม,
   *   neck = ผิวกายบริเวณคอ, cloth = เสื้อเดิม + เครื่องประดับที่อก (สร้อย) , skin = ผิวกายส่วนอื่น (มือ/แขน)
   */
  function multiclassGroups(runs, W, H, face) {
    const n = W * H, C = 6, acc = new Float32Array(C * n), wsum = new Float32Array(n);
    for (const r of runs) {
      const S = r.S, R = r.rect, kx = S / R.w, ky = S / R.h, fe = Math.max(4, Math.min(R.w, R.h) * .06), full = R.x <= 0 && R.y <= 0 && R.x + R.w >= W && R.y + R.h >= H;
      const x0 = Math.max(0, Math.floor(R.x)), x1 = Math.min(W, Math.ceil(R.x + R.w)), y0 = Math.max(0, Math.floor(R.y)), y1 = Math.min(H, Math.ceil(R.y + R.h)), SS = S * S;
      for (let y = y0; y < y1; y++) {
        const fy = (y + .5 - R.y) * ky - .5, j0 = clamp(Math.floor(fy), 0, S - 1), j1 = Math.min(S - 1, j0 + 1), ty = clamp01(fy - j0);
        for (let x = x0; x < x1; x++) {
          const fx = (x + .5 - R.x) * kx - .5, i0 = clamp(Math.floor(fx), 0, S - 1), i1 = Math.min(S - 1, i0 + 1), tx = clamp01(fx - i0);
          // น้ำหนัก: เต็มภายใน ลดลงที่ขอบกรอบ (ขอบภาพจริงไม่นับ) — รอบละเอียดแทนที่รอบหยาบ
          const d = Math.min(R.x <= 0 ? 1e9 : x - R.x, R.y <= 0 ? 1e9 : y - R.y, R.x + R.w >= W ? 1e9 : R.x + R.w - x, R.y + R.h >= H ? 1e9 : R.y + R.h - y);
          const w = full ? 1 : smooth(d / fe), i = y * W + x;
          if (w <= 0) continue;
          const a00 = j0 * S + i0, a01 = j0 * S + i1, a10 = j1 * S + i0, a11 = j1 * S + i1;
          // รอบละเอียดถ่วง 70% (ไม่ทับทั้งหมด -> ไม่มีรอยต่อตรงที่ขอบกรอบ) และผมใช้ค่าสูงสุด (ผมยาวบนเสื้อสีเข้มที่รอบหยาบพลาด)
          const bw = wsum[i] ? w * .7 : 1;
          for (let c = 0; c < C; c++) {
            const p = r.prob, o = c * SS, top = p[o + a00] + (p[o + a01] - p[o + a00]) * tx, bot = p[o + a10] + (p[o + a11] - p[o + a10]) * tx, v = top + (bot - top) * ty;
            const b = acc[c * n + i] * (1 - bw) + v * bw;
            acc[c * n + i] = c === 1 && wsum[i] ? Math.max(b, v * w) : b;
          }
          wsum[i] = 1;
        }
      }
    }
    const head = new Float32Array(n), hair = new Float32Array(n), neck = new Float32Array(n), cloth = new Float32Array(n), skin = new Float32Array(n), acc5 = new Float32Array(n), hwA = new Float32Array(n);
    const fw = face.fw, cx = face.chinX != null ? face.chinX : face.cx, jy = jawCurve(face);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!wsum[i]) { cloth[i] = 1; continue; }
      const pe = Math.max(1e-4, 1 - acc[i]), ph = acc[n + i] / pe, pb = acc[2 * n + i] / pe, pf = acc[3 * n + i] / pe, pc = acc[4 * n + i] / pe, po = acc[5 * n + i] / pe;
      const dy = y - face.chinY, dx = Math.abs(x - cx);
      // เครื่องประดับใกล้ศีรษะ (ต่างหูห้อยถึงใต้คางเล็กน้อย แว่น หมวก) = ศีรษะ; ต่ำกว่านั้น (สร้อย/เข็มกลัด) = เสื้อ
      // ต่างหูอยู่ข้างแก้ม/ใต้ติ่งหู (|dx| > 0.4 หน้า) ส่วนสร้อยคออยู่กลางใต้คาง
      const nearHead = Math.max(smooth((fw * .08 - dy) / (fw * .12)) * smooth((fw * 1.25 - dx) / (fw * .2)), smooth((fw * .25 - dy) / (fw * .1)) * smooth((dx - fw * .36) / (fw * .08)) * smooth((fw * .72 - dx) / (fw * .08)) * smooth((po - .35) / .25));
      // คอ: ผิวกายใต้คาง ในแนวกึ่งกลาง (มือ/แขนที่อยู่ไกล = skin)
      const inNeck = smooth((fw * .62 - dx) / (fw * .12)) * smooth((fw * 1.3 - dy) / (fw * .2)) * (y > jy(x) - fw * .35 ? 1 : 0);
      // ผ้าคลุมศีรษะ/หมวกผ้า (คลาส clothes เหนือระดับปาก) = ศีรษะ
      // ผ้าคลุมศีรษะ/หมวกผ้า (เหนือแนวคาง) — คัดเฉพาะส่วนที่ต่อกับผ้าเหนือระดับตาด้านล่าง (ปกเสื้อสูงไม่ต่อขึ้นไป จึงไม่ถูกนับ)
      // ข้อจำกัด: ชายผ้าที่คลุมลงใต้คางยังถูกแทนด้วยชุดใหม่ (เสื้อเดิมต่อเนื่องกับผ้าคลุม แยกด้วยคลาสไม่ได้)
      const hw = pc * smooth((face.chinY - y) / (fw * .1)) * smooth((fw * 1.2 - dx) / (fw * .2));
      head[i] = pf + po * nearHead + hw; hwA[i] = hw; hair[i] = ph; neck[i] = pb * inNeck; skin[i] = pb * (1 - inNeck);
      cloth[i] = pc - hw + po * (1 - nearHead); acc5[i] = po;
    }
    // ผ้าคลุมศีรษะ/หมวก ต้องต่อกับส่วนเหนือระดับตา — ปกเสื้อสูง (ทรงโบราณ) ที่ไม่ต่อขึ้นไปถึงศีรษะ กลับเป็นเสื้อเดิม (ซ่อน)
    {
      const on = new Uint8Array(n), seen = new Uint8Array(n), st = [];
      for (let i = 0; i < n; i++) on[i] = hwA[i] > .3 ? 1 : 0;
      for (let y = 0; y < Math.min(H, Math.round(face.eyeY)); y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (on[i] && !seen[i]) { seen[i] = 1; st.push(i); } }
      while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= n || seen[j] || !on[j] || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue; seen[j] = 1; st.push(j); } }
      for (let i = 0; i < n; i++) if (hwA[i] > 0 && !seen[i]) { head[i] -= hwA[i]; cloth[i] += hwA[i]; }
    }
    // คอต้องต่อกับใต้คาง (ผิวที่โมเดลทายผิดบนเสื้อสีเข้ม/ฉาก = เสื้อเดิม ซ่อนไว้)
    {
      const on = new Uint8Array(n), seen = new Uint8Array(n), st = [];
      for (let i = 0; i < n; i++) on[i] = neck[i] > .35 ? 1 : 0;
      for (let y = Math.max(0, Math.round(face.chinY - fw * .2)); y < Math.min(H, Math.round(face.chinY + fw * .35)); y++) for (let x = Math.max(0, Math.round(cx - fw * .25)); x < Math.min(W, Math.round(cx + fw * .25)); x++) { const i = y * W + x; if (on[i] && !seen[i]) { seen[i] = 1; st.push(i); } }
      while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= n || seen[j] || !on[j] || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue; seen[j] = 1; st.push(j); } }
      const near = dilate01(seen, W, H, Math.max(2, Math.round(fw * .03)), Math.max(0, Math.round(face.chinY - fw * .4)));
      for (let i = 0; i < n; i++) if (neck[i] > 0 && !seen[i]) { const k = neck[i] * near[i]; cloth[i] += neck[i] - k; neck[i] = k; }
    }
    return { head, hair, neck, cloth, skin, acc: acc5 };
  }

  /** ความน่าจะเป็น "เป็นตัวคน" (1 - background) ของผลรอบทั้งภาพ ขยายเป็น W×H (bilinear) */
  function parsePersonProb(run, W, H) {
    const S = run.S, o = new Float32Array(W * H), p = run.prob, R = run.rect;
    for (let y = 0; y < H; y++) {
      const fy = (y + .5 - R.y) * S / R.h - .5, j0 = clamp(Math.floor(fy), 0, S - 1), j1 = Math.min(S - 1, j0 + 1), ty = clamp01(fy - j0);
      for (let x = 0; x < W; x++) {
        const fx = (x + .5 - R.x) * S / R.w - .5, i0 = clamp(Math.floor(fx), 0, S - 1), i1 = Math.min(S - 1, i0 + 1), tx = clamp01(fx - i0);
        const a = p[j0 * S + i0] + (p[j0 * S + i1] - p[j0 * S + i0]) * tx, b = p[j1 * S + i0] + (p[j1 * S + i1] - p[j1 * S + i0]) * tx;
        o[y * W + x] = 1 - (a + (b - a) * ty);
      }
    }
    return o;
  }
  /**
   * อุดรูใน matte: ภายในตัวคนที่โมเดลแยกส่วนมั่นใจมาก (> 0.85, หดขอบเข้า ~1.5 พิกเซลของกริด 256) แต่ MODNet ให้ค่าต่ำ
   * (ใบหน้าในภาพขาวดำเก่า เสื้อสีเข้มบนฉากมืด) — ขอบนอกยังมาจาก MODNet + guided filter; จำกัดในกรอบรอบตัวคนหลัก
   */
  function fillMatteFromParse(raw, run, W, H) {
    const pp = parsePersonProb(run, W, H), n = W * H, out = new Float32Array(raw);
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (raw[y * W + x] > .5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { x0 = 0; x1 = W - 1; y0 = 0; y1 = H - 1; }
    const px = Math.round((x1 - x0) * .1), py = Math.round((y1 - y0) * .1); x0 = Math.max(0, x0 - px); x1 = Math.min(W - 1, x1 + px); y0 = Math.max(0, y0 - py); y1 = Math.min(H - 1, y1 + py);
    const m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = smooth((pp[i] - .85) / .1);
    const r = Math.max(2, Math.round(Math.max(W / run.S, H / run.S) * 1.5)), er = minFilter(m, W, H, r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (er[i] > out[i]) out[i] = er[i]; }
    return out;
  }
  /** alpha = max(alpha, รูปหน้าจาก landmark 68 จุด หดเข้า 6% ขอบนุ่ม) */
  function fillFaceMatte(alpha, W, H, face) {
    const Pp = face.P, eyeMid = { x: (Pp[36].x + Pp[45].x) / 2, y: (Pp[36].y + Pp[45].y) / 2 }, fh = Math.hypot(Pp[8].x - eyeMid.x, Pp[8].y - eyeMid.y);
    const lift = p => ({ x: p.x, y: p.y - fh * .25 }), m = new Float32Array(W * H);
    fillPoly(m, W, H, grow([...Pp.slice(0, 17), ...Pp.slice(17, 27).reverse().map(lift)], .94), 1);
    const b = blur3(m, W, H, Math.max(1, Math.round(face.fw * .01))), out = new Float32Array(alpha);
    for (let i = 0; i < out.length; i++) if (b[i] > out[i]) out[i] = b[i];
    return out;
  }
  /** ขยายมาสก์ 0/1 (Uint8) ด้วย max filter แยกแกนรัศมี r เฉพาะแถว y0.. -> Float32Array 0/1 (เร็วกว่าเบลอทั้งภาพ) */
  function dilate01(on, W, H, r, y0 = 0) {
    const t = new Uint8Array(W * H), o = new Float32Array(W * H);
    for (let y = y0; y < H; y++) { let last = -1e9; const row = y * W; for (let x = 0; x < W; x++) { if (on[row + x]) last = x; t[row + x] = x - last <= r ? 1 : 0; } last = 1e9; for (let x = W - 1; x >= 0; x--) { if (on[row + x]) last = x; if (last - x <= r) t[row + x] = 1; } }
    for (let x = 0; x < W; x++) { let last = -1e9; for (let y = y0; y < H; y++) { if (t[y * W + x]) last = y; if (y - last <= r) o[y * W + x] = 1; } last = 1e9; for (let y = H - 1; y >= y0; y--) { if (t[y * W + x]) last = y; if (last - y <= r) o[y * W + x] = 1; } }
    return o;
  }
  /** blur3 เฉพาะแถว y0.. (ส่วนบนคืน 0) */
  function blur3Rows(a, W, H, r, y0) {
    y0 = Math.max(0, Math.min(H - 1, Math.floor(y0)));
    const sub = blur3(a.subarray(y0 * W), W, H - y0, r), o = new Float32Array(W * H); o.set(sub, y0 * W); return o;
  }
  /** min filter แยกแกน (กร่อนมาสก์) */
  function minFilter(m, W, H, r) {
    const t = new Float32Array(W * H), o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 1; for (let k = -r; k <= r; k++) { const xx = x + k; const q = xx < 0 || xx >= W ? 0 : m[y * W + xx]; if (q < v) v = q; } t[y * W + x] = v; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 1; for (let k = -r; k <= r; k++) { const yy = y + k; const q = yy < 0 || yy >= H ? 0 : t[yy * W + x]; if (q < v) v = q; } o[y * W + x] = v; }
    return o;
  }
  /** ประมาณใบหน้าจากผลแยกส่วน (เมื่อหา landmark ไม่ได้): กรอบของผิวหน้า (รวมหู) ก้อนใหญ่สุด */
  function faceFromParse(run, W, H) {
    const S = run.S, p = run.prob, R = run.rect, SS = S * S, on = new Uint8Array(SS);
    for (let i = 0; i < SS; i++) on[i] = p[3 * SS + i] > .5 ? 1 : 0;
    const lab = new Int32Array(SS).fill(-1); let best = null;
    for (let s0 = 0; s0 < SS; s0++) {
      if (!on[s0] || lab[s0] >= 0) continue;
      const st = [s0]; lab[s0] = s0; let cnt = 0, x0 = S, x1 = 0, y0 = S, y1 = 0, sx = 0;
      while (st.length) { const i = st.pop(), x = i % S, y = (i / S) | 0; cnt++; sx += x; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; for (const j of [i - 1, i + 1, i - S, i + S]) if (j >= 0 && j < SS && on[j] && lab[j] < 0 && Math.abs((j % S) - x) <= 1) { lab[j] = s0; st.push(j); } }
      if (!best || cnt > best.cnt) best = { cnt, x0, x1, y0, y1, cx: sx / cnt };
    }
    if (!best || best.cnt < 30) return null;
    const kx = R.w / S, ky = R.h / S, fw = (best.x1 - best.x0 + 1) * kx * .95, top = R.y + best.y0 * ky, chinY = R.y + (best.y1 + 1) * ky;
    return { cx: R.x + (best.cx + .5) * kx, eyeY: top + (chinY - top) * .42, chinY, fw, faceH: (chinY - top) * .58, angle: 0 };
  }

  /**
   * แสงเงาจริงจากเสื้อเดิม (ให้ชุดใหม่ดูเป็นภาพถ่าย): ใช้ความสว่างของ "ผ้าสีหลัก" ของเสื้อเดิม (กลุ่มสีที่พบมากสุด เช่น ตัวสูท
   * ไม่รวมเชิ้ตขาว/เนคไท -> ไม่มีรอยปกเดิมโผล่) แบบ normalized convolution:
   *   low  = แสงรวม (ด้านข้าง/ใต้แขนมืด) จากเบลอใหญ่ 0.35 หน้า, detail = รอยยับจริง (เบลอ 0.012 / 0.06 หน้า — ตัดลายผ้าละเอียดทิ้ง)
   * คืน Float32Array ตัวคูณ (1 = ไม่เปลี่ยน) หรือ null ถ้าไม่มีผ้าพอ
   */
  function clothShading(rgba, alpha, layers, W, H, face, { lowAmt = .8, detAmt = .9 } = {}) {
    const n = W * H, fw = face.fw, y0 = Math.max(0, Math.round(face.chinY));
    const Ls = [], As = [], Bs = [];
    for (let y = y0; y < H; y += 3) for (let x = 0; x < W; x += 3) { const i = y * W + x; if (alpha[i] > .8 && layers.body[i] > .6) { const q = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); Ls.push(q[0]); As.push(q[1]); Bs.push(q[2]); } }
    if (Ls.length < 200) return null;
    // กลุ่มสีหลัก: โหมดของ (a,b) ใน histogram หยาบ + ช่วง L ที่พบมากสุดในกลุ่มนั้น
    const key = (a, b) => (Math.round(a / 6) + 50) * 101 + Math.round(b / 6) + 50, hist = new Map();
    for (let k = 0; k < Ls.length; k++) { const q = key(As[k], Bs[k]); hist.set(q, (hist.get(q) || 0) + 1); }
    let best = -1, bc = 0; for (const [q, c] of hist) if (c > bc) { bc = c; best = q; }
    const ma = (Math.floor(best / 101) - 50) * 6, mb = (best % 101 - 50) * 6, Lc = [];
    for (let k = 0; k < Ls.length; k++) if (Math.hypot(As[k] - ma, Bs[k] - mb) < 10) Lc.push(Ls[k]);
    Lc.sort((p, q) => p - q); const Lmed = Lc[Lc.length >> 1], Llo = Lc[Math.floor(Lc.length * .05)] - 6, Lhi = Lc[Math.floor(Lc.length * .95)] + 6;
    const m = new Float32Array(n), Lm = new Float32Array(n);
    for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (alpha[i] < .7 || layers.body[i] < .5) continue;
      const q = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); if (Math.hypot(q[1] - ma, q[2] - mb) > 12 || q[0] < Llo || q[0] > Lhi) continue;
      m[i] = 1; Lm[i] = q[0] + 2;
    }
    // normalized convolution ที่ความละเอียดครึ่งหนึ่ง (สนามแสงเงาเรียบอยู่แล้ว) แล้วขยายกลับแบบ bilinear
    const W2 = Math.ceil(W / 2), H2 = Math.ceil((H - y0) / 2), m2 = new Float32Array(W2 * H2), L2 = new Float32Array(W2 * H2);
    for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, j = ((y - y0) >> 1) * W2 + (x >> 1); m2[j] += m[i] / 4; L2[j] += Lm[i] / 4; }
    const up = A => { const o = new Float32Array(n); for (let y = y0; y < H; y++) { const fy = Math.min(H2 - 1, Math.max(0, (y - y0 - .5) / 2)), ja = Math.floor(fy), jb = Math.min(H2 - 1, ja + 1), ty = fy - ja; for (let x = 0; x < W; x++) { const fx = Math.min(W2 - 1, Math.max(0, (x - .5) / 2)), ia = Math.floor(fx), ib = Math.min(W2 - 1, ia + 1), tx = fx - ia; o[y * W + x] = (A[ja * W2 + ia] * (1 - tx) + A[ja * W2 + ib] * tx) * (1 - ty) + (A[jb * W2 + ia] * (1 - tx) + A[jb * W2 + ib] * tx) * ty; } } return o; };
    const nb = r => { r = Math.max(1, Math.round(r / 2)); return [up(blur3(L2, W2, H2, r)), up(blur3(m2, W2, H2, r))]; };
    // รอยยับกว้าง (0.03 / 0.15 หน้า) — เส้นบาง ๆ เช่น ขอบปกเดิม ตะเข็บ ลายผ้า ถูกเบลอหายไป ไม่เป็นรอยเสื้อเดิมบนชุดใหม่
    const [lA, lB] = nb(Math.max(4, Math.round(fw * .35 / 2.2))), [mA, mB] = nb(Math.max(2, Math.round(fw * .15 / 2.2))), [fA, fB] = nb(Math.max(1, Math.round(fw * .03 / 2.2)));
    const mean = Lmed + 2, out = new Float32Array(n).fill(1), det = new Float32Array(n);
    // ผ้าเดิมสีดำ/มืดมาก: ข้อมูลแสงเงาเป็น noise เสียส่วนใหญ่ -> ลดน้ำหนักลง (L* 12 = ไม่ใช้, 32 ขึ้นไป = เต็ม)
    const trust = smooth((Lmed - 12) / 20); lowAmt *= .35 + .65 * trust; detAmt *= trust;
    let e = 0, ec = 0;
    for (let i = y0 * W; i < n; i++) {
      if (lB[i] < .05) continue;
      const cover = smooth((mB[i] - .35) / .5) * smooth((fB[i] - .5) / .4);
      // อัตราส่วนแบบมีพื้น (+12 L*): ผ้าสีเข้มมาก (L* ~10–20) ไม่ขยาย noise จนเป็นด่าง
      if (cover > 0) { det[i] = clamp((fA[i] / Math.max(1e-3, fB[i]) + 12) / (mA[i] / Math.max(1e-3, mB[i]) + 12), .9, 1.1); e += Math.abs(det[i] - 1) * cover; ec += cover; } else det[i] = 1;
    }
    // ผ้าลายหยาบ (ทวีด/ถัก): พลังงานรายละเอียดสูง = ลายผ้า ไม่ใช่รอยยับ -> ลดน้ำหนัก
    const tex = ec ? e / ec : 0, dA = detAmt * clamp(1 - (tex - .02) / .025, 0, 1);
    for (let i = y0 * W; i < n; i++) {
      if (lB[i] < .05) continue;
      const low = clamp((lA[i] / lB[i] + 12) / (mean + 12), .78, 1.15), cover = smooth((mB[i] - .35) / .5) * smooth((fB[i] - .5) / .4);
      out[i] = Math.pow(low, lowAmt) * (1 + (Math.pow(det[i], dA) - 1) * cover);
    }
    out.texture = tex;
    return out;
  }

  /** ระยะ (พิกเซล) จากจุดในมาสก์ถึงขอบที่ใกล้ที่สุด — chamfer 3-4 สองรอบ (ประมาณ Euclidean) */
  function distanceInside(mask, W, H, thr = .5) {
    const n = W * H, d = new Float32Array(n), BIG = 1e9;
    for (let i = 0; i < n; i++) d[i] = mask[i] > thr ? BIG : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1); else v = Math.min(v, 1);
      if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + 1.4142); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 1.4142); } else v = Math.min(v, 1e9);
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!d[i]) continue;
      let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1); else v = Math.min(v, 1);
      if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 1.4142); if (x > 0) v = Math.min(v, d[i + W - 1] + 1.4142); }
      d[i] = v;
    }
    return d;
  }
  /** โครงร่างไหล่มาตรฐาน (หน่วยมาตรฐาน: N = โคนคอ, ไหล่กว้าง 3.0) — ใช้แทนขอบไหล่จริงเฉพาะส่วนที่ผมบังอยู่ */
  function canonShoulder(u, v) {
    const a = Math.abs(u); if (a > 1.62) return 0;
    const top = a < .33 ? -.22 : a < 1.2 ? -.22 + (a - .33) / .87 * .35 : .13 + ((a - 1.2) / .42) ** 2 * .6;
    return v > top ? 1 : 0;
  }
  /**
   * มาสก์ตัดชุดตามรูปร่างจริง: ตัวคนที่ไม่ใช่ศีรษะ/ผม (รวมคอ เสื้อเดิม แขน) ∪ (ส่วนที่ผมบัง × โครงร่างไหล่มาตรฐาน)
   * ขยายเล็กน้อย (ชุดมีความหนา) แล้วเกลาขอบนุ่ม — คืน { clip, form } โดย form = ความนูนของลำตัว/แขน (หน่วยมาตรฐาน)
   * จากระยะถึงขอบเงาตัว: ขอบไหล่/แขนโค้งมนแบบภาพถ่าย ไม่ใช่กล่องแบน
   */
  function garmentClip(alpha, layers, W, H, face, fit) {
    const n = W * H, m = new Float32Array(n), cs = Math.cos(fit.theta || 0), sn = Math.sin(fit.theta || 0), s = fit.s;
    const yTop = Math.max(0, Math.floor(face.chinY - face.fw * .6));
    // จำกัดความกว้างไม่เกินลำตัวคนทั่วไปมาก (ชุดอวกาศ หมวกที่ถือ เก้าอี้ ไม่กลายเป็นก้อนชุดใหญ่ผิดรูป)
    for (let y = yTop; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (alpha[i] <= .01) continue;
      const dx = x - fit.N.x, dy = y - fit.N.y, u = Math.abs(dx * cs + dy * sn) / s, v = (-dx * sn + dy * cs) / s;
      m[i] = alpha[i] * (1 - layers.keep[i]) * smooth((1.9 + .1 * Math.max(0, v) - u) / .1);
    }
    // ไหล่ที่ผมบัง: ประมาณขอบบนของไหล่ใต้ผมจากคอลัมน์ข้างเคียงที่เห็นขอบไหล่จริง (ต่อเส้นตรง) — ด้านนอกที่ไม่มีข้อมูลใช้ความลาดของไหล่มาตรฐาน
    const yb = new Int32Array(W).fill(-1), occ = new Uint8Array(W), oR = Math.max(2, Math.round(face.fw * .03));
    for (let x = 0; x < W; x++) {
      for (let y = yTop; y < H; y++) if (m[y * W + x] > .5) { yb[x] = y; break; }
      if (yb[x] < 0) continue;
      for (let d = 1; d <= oR; d++) { const y = yb[x] - d; if (y < 0) break; const j = y * W + x; if (layers.hair[j] * layers.keep[j] * alpha[j] > .25) { occ[x] = 1; break; } }
    }
    const cxN = fit.N.x, nh = face.fw * .3;
    for (const sd of [-1, 1]) {
      const xs = []; for (let x = 0; x < W; x++) if (sd * (x - cxN) > nh) xs.push(x);
      if (sd < 0) xs.reverse(); // จากในออกนอก
      let lastK = -1;
      for (let k = 0; k < xs.length; k++) {
        const x = xs[k]; if (yb[x] < 0) continue;
        if (!occ[x]) { lastK = k; continue; }
        // หาคอลัมน์ที่รู้ค่าถัดออกไป
        let nk = -1; for (let q = k + 1; q < xs.length; q++) { const xx = xs[q]; if (yb[xx] >= 0 && !occ[xx]) { nk = q; break; } if (yb[xx] < 0) break; }
        let yi;
        const canonY = xx => { const dx = xx - fit.N.x, u = dx / s; const a = Math.abs(u); return fit.N.y + s * (a < 1.2 ? -.22 + (a - .33) / .87 * .35 : .13 + ((a - 1.2) / .42) ** 2 * .6); };
        if (lastK >= 0 && nk >= 0) { const xa = xs[lastK], xb = xs[nk], t = (x - xa) / (xb - xa); yi = yb[xa] + (yb[xb] - yb[xa]) * t; }
        else if (lastK >= 0) { const xa = xs[lastK]; yi = yb[xa] + canonY(x) - canonY(xa); }
        else if (nk >= 0) { const xb = xs[nk]; yi = yb[xb] + canonY(x) - canonY(xb); }
        else yi = canonY(x);
        yi = Math.max(yTop, Math.round(yi));
        for (let y = yi; y < yb[x]; y++) { const i = y * W + x; if (alpha[i] > .2) m[i] = 1; }
      }
    }
    // ผมที่พาดอยู่บนลำตัว (ปอยผม/ลอนผมด้านข้าง): ใต้ผมต้องมีชุดด้วย — เติมช่วงระหว่างขอบซ้าย-ขวาของลำตัวในแถวเดียวกัน
    // เฉพาะพิกเซลที่เป็นตัวคน (ผม) — ช่องว่างจริงระหว่างแขนกับลำตัว (ฉากหลัง alpha=0) ไม่ถูกเติม
    for (let y = Math.max(yTop, Math.round(fit.N.y)); y < H; y++) {
      let l = -1, r = -1; for (let x = 0; x < W; x++) if (m[y * W + x] > .5) { if (l < 0) l = x; r = x; }
      if (l < 0) continue;
      for (let x = l; x <= r; x++) { const i = y * W + x; if (m[i] < .5 && alpha[i] > .2 && layers.hair[i] * layers.keep[i] > .1) m[i] = Math.max(m[i], Math.min(1, alpha[i] * 1.5)); }
    }
    // เฉพาะก้อนที่ต่อกับลำตัวหลัก (ตัดเศษ matte บนธง/เฟอร์นิเจอร์ที่ไม่ต่อกับตัวคน)
    {
      const on = new Uint8Array(n), st = [];
      const sx0 = Math.max(0, Math.round(fit.N.x - s * .6)), sx1 = Math.min(W - 1, Math.round(fit.N.x + s * .6)), sy0 = Math.max(yTop, Math.round(fit.N.y + s * .2)), sy1 = Math.min(H - 1, Math.round(fit.N.y + s * 1.2));
      for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) { const i = y * W + x; if (m[i] > .3 && !on[i]) { on[i] = 1; st.push(i); } }
      while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < yTop * W || j >= n || on[j] || m[j] <= .3 || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue; on[j] = 1; st.push(j); } }
      if (st.length === 0) { let any = 0; for (let i = 0; i < n; i++) any |= on[i]; if (any) for (let i = 0; i < n; i++) if (!on[i] && m[i] > 0) { /* ขอบจาง ๆ ติดก้อนหลักยังคงไว้ */ const x = i % W; const nb = (x > 0 && on[i - 1]) || (x < W - 1 && on[i + 1]) || (i >= W && on[i - W]) || (i + W < n && on[i + W]); if (!nb) m[i] = 0; } }
    }
    // ปิดรูเล็ก ๆ (กระดุม/เงาที่ matte พลาด) + ความหนาของผ้า: max filter แล้วเบลอ
    const r = Math.max(1, Math.round(face.fw * .012));
    const dil = new Float32Array(n);
    for (let y = yTop; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W && m[y * W + xx] > v) v = m[y * W + xx]; } dil[y * W + x] = v; }
    const dil2 = new Float32Array(n);
    for (let y = yTop; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= yTop && yy < H && dil[yy * W + x] > v) v = dil[yy * W + x]; } dil2[y * W + x] = v; }
    const clip = blur3Rows(dil2, W, H, Math.max(1, Math.round(r * .8)), yTop);
    for (let i = 0; i < n; i++) clip[i] = clamp01((clip[i] - .5) * 1.6 + .5);
    const d = distanceInside(clip, W, H), R = s * .42, form = new Float32Array(n);
    for (let i = 0; i < n; i++) { if (!d[i]) continue; const t = Math.min(1, d[i] / R); form[i] = .42 * Math.sqrt(1 - (1 - t) * (1 - t)); }
    // เกลี่ยให้เรียบ (chamfer distance มีขั้นบันได -> แสงเงาเป็นเส้น)
    return { clip, form: blur3Rows(form, W, H, Math.max(2, Math.round(s * .04)), yTop) };
  }

  /**
   * วัดคอจริงสำหรับวางคอเสื้อ: ครึ่งความกว้างคอ (พิกเซล) และระดับขอบบนของเสื้อเดิมข้างคอ (คอเสื้อใหม่ต้องคลุมถึง)
   * คืน { half, ySide, yCenter } (ySide/yCenter = null ถ้าวัดไม่ได้)
   */
  function neckMeasure(alpha, layers, W, H, face) {
    const fw = face.fw, cx = Math.round(face.chinX != null ? face.chinX : face.cx), widths = [];
    for (let y = Math.round(face.chinY + fw * .08); y <= Math.min(H - 1, Math.round(face.chinY + fw * .6)); y++) {
      let l = -1, r = -1;
      for (let x = Math.max(0, cx - Math.round(fw * .6)); x <= Math.min(W - 1, cx + Math.round(fw * .6)); x++) if (alpha[y * W + x] * layers.neck[y * W + x] > .5) { if (l < 0) l = x; r = x; }
      if (l >= 0 && r - l > fw * .25 && r - l < fw * .9 && l < cx && r > cx) widths.push(r - l + 1);
    }
    widths.sort((a, b) => a - b);
    const half = clamp(widths.length >= 3 ? widths[Math.floor(widths.length * .6)] / 2 : fw * .29, fw * .22, fw * .36);
    const clothTop = x => {
      x = clamp(Math.round(x), 0, W - 1);
      for (let y = Math.max(0, Math.round(face.chinY - fw * .1)); y <= Math.min(H - 1, Math.round(face.chinY + fw * 1.3)); y++) {
        const i = y * W + x; if (alpha[i] > .5 && layers.body[i] > .55 && layers.neck[i] < .3) return y;
      }
      return null;
    };
    const ys = [clothTop(cx - half - fw * .03), clothTop(cx + half + fw * .03)].filter(v => v != null);
    return { half, ySide: ys.length ? Math.min(...ys) : null, yCenter: clothTop(cx) };
  }

  /** ภายในครอปหรือไม่ (ใช้ร่วมกับ cropToImage) */
  const inCrop = (crop, x, y) => x >= crop.x && x < crop.x + crop.side && y >= crop.y && y < crop.y + crop.side;

  /**
   * แยกส่วนแบบ heuristic (สำรองเมื่อโหลดโมเดล parsing ไม่ได้): จัดกลุ่มสีผม vs เสื้อเดิม ใน L*a*b* โดยใช้ landmark กำหนดบริเวณเก็บตัวอย่าง
   *  - ผม: ตัวอย่างเหนือหน้าผากและข้างแก้ม (ที่ไม่ใช่สีผิว) · เสื้อ: ตัวอย่างที่อก/ไหล่ · คอ: สีผิวใต้คางใกล้แกนกลาง
   * คืน {head, hair, neck, cloth} (Float32Array W*H, 0..1 — ยังไม่คูณ alpha)
   */
  function heuristicParse(rgba, alpha, W, H, face) {
    const n = W * H, fw = face.fw, cx = face.chinX != null ? face.chinX : face.cx, jy = jawCurve(face);
    const head = new Float32Array(n), hair = new Float32Array(n), neck = new Float32Array(n), cloth = new Float32Array(n);
    const sample = (x0, x1, y0, y1, skinOk) => {
      const pts = [], st = Math.max(1, Math.round(fw / 60));
      for (let y = Math.max(0, Math.round(y0)); y < Math.min(H, y1); y += st) for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, x1); x += st) {
        const i = y * W + x; if (alpha[i] < .9) continue;
        const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
        if (!skinOk && skinLikelihood(r, g, b) > .4) continue;
        pts.push(rgbToLab(r, g, b));
      }
      if (pts.length < 8) return null;
      const m = [0, 1, 2].map(c => pts.reduce((s, p) => s + p[c], 0) / pts.length);
      const sd = [0, 1, 2].map(c => Math.sqrt(pts.reduce((s, p) => s + (p[c] - m[c]) ** 2, 0) / pts.length) + (c ? 3 : 6));
      return { m, sd, n: pts.length };
    };
    const hairM = (() => {
      const a = [sample(cx - fw * .35, cx + fw * .35, face.eyeY - fw * 1.0, face.eyeY - fw * .62, false), sample(cx - fw * .78, cx - fw * .55, face.eyeY, face.chinY, false), sample(cx + fw * .55, cx + fw * .78, face.eyeY, face.chinY, false)].filter(Boolean);
      if (!a.length) return null; a.sort((p, q) => q.n - p.n); return a[0];
    })();
    const clothM = sample(cx - fw * 1.0, cx + fw * 1.0, face.chinY + fw * 1.1, face.chinY + fw * 1.6, false);
    const dist = (L, M) => Math.hypot((L[0] - M.m[0]) / M.sd[0], (L[1] - M.m[1]) / M.sd[1], (L[2] - M.m[2]) / M.sd[2]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (alpha[i] <= .02) { cloth[i] = 0; continue; }
      const jyx = jy(x);
      if (y < jyx && Math.abs(x - cx) < fw * .62) { head[i] = 1; continue; }
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], L = rgbToLab(r, g, b);
      const dy = y - face.chinY, dx = Math.abs(x - cx);
      let ph = 0;
      if (hairM && dx < fw * 1.6 && dy < fw * 1.9) {
        const dh = dist(L, hairM), dc = clothM ? dist(L, clothM) : 4;
        ph = smooth((dc - dh + .5) / 2) * smooth((3.5 - dh) / 1.5) * smooth((fw * 1.9 - dy) / (fw * .4));
        if (y < face.eyeY) ph = Math.max(ph, .9); // เหนือระดับตา (นอกใบหน้า) = ผม
      } else if (y < face.chinY) ph = 1;
      const pn = dx < fw * .4 && dy > -fw * .3 && dy < fw * .9 ? skinLikelihood(r, g, b) * (1 - ph) : 0;
      hair[i] = ph; neck[i] = pn; cloth[i] = Math.max(0, 1 - ph - pn);
    }
    return { head, hair, neck, cloth };
  }

  /**
   * ชั้นของตัวคนจากผล parsing (ความน่าจะเป็นในพิกัดภาพ; นอกครอป: เหนือเส้นคาง = ศีรษะ, ใต้ = เสื้อ)
   *  keepS = ศีรษะ+ผม (วางหน้าชุด), neckS = คอ (วางหลังชุด), hairS = ผม, bodyS = ส่วนที่เหลือ (เสื้อเดิม/แขน — ถูกชุดใหม่แทนที่)
   *  เกลาขอบ keep ด้วย guided filter ตามภาพ (รอยต่อผม/เสื้อเดิม คมตามขอบจริง)
   */
  function personLayers(rgba, alpha, W, H, face, P, crop = null) {
    const n = W * H, jy = jawCurve(face), keep = new Float32Array(n), neck = new Float32Array(n), hair = new Float32Array(n), body = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let h, hr, nk;
      if (!crop || inCrop(crop, x, y)) { h = P.head[i]; hr = P.hair[i]; nk = P.neck[i]; }
      else { const above = y < jy(x); h = above ? 1 : 0; hr = 0; nk = 0; }
      // ใต้แนวคาง ส่วนที่วางหน้าชุดมีได้เฉพาะผม (กันจุดสีเสื้อเดิมที่โมเดลทายผิดเป็น "ผิว" โผล่บนชุด)
      if (y > Math.max(jy(x), face.chinY) + face.fw * .45) h = 0;
      // ผิวใต้แนวกราม (ตาม landmark) คือคอในเงา ไม่ใช่ใบหน้า -> ไปชั้นคอ (หลังชุด) — ยกเว้นเครื่องประดับ (ต่างหู)
      else if (face.P && x > face.P[2].x && x < face.P[14].x && y > jy(x) + face.fw * .1 && !(P.acc && P.acc[i] > .3)) { nk = Math.max(nk, h * (P.cloth && P.cloth[i] > h ? 0 : 1)); h = 0; }
      const k = smooth((h + hr - .3) / .4), nn = smooth((nk - .3) / .4) * (1 - k);
      keep[i] = k; neck[i] = nn; hair[i] = smooth((hr - .3) / .4); body[i] = Math.max(0, 1 - k - nn);
    }
    // ผมใต้คางต้องต่อเนื่องกับผมบนศีรษะ (flood fill) — ก้อนที่โมเดลทายผิดบนไหล่/เสื้อเดิม ถูกตัดทิ้ง
    {
      const on = new Uint8Array(n), seen = new Uint8Array(n), st = [], lim = face.chinY + face.fw * .1;
      for (let i = 0; i < n; i++) on[i] = keep[i] > .35 && alpha[i] > .3 ? 1 : 0;
      // เมล็ด: ใบหน้า + ศีรษะเหนือระดับตา (ผมที่แยกเป็นปอยเหนือหน้าก็ยังนับ) — ก้อนที่อยู่ใต้คางแต่ไม่ต่อกับศีรษะจะถูกตัด
      const fx0 = face.cx - face.fw * .4, fx1 = face.cx + face.fw * .4;
      for (let y = 0; y < Math.min(H, lim); y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (on[i] && !seen[i] && (y < face.eyeY || (x > fx0 && x < fx1))) { seen[i] = 1; st.push(i); } }
      while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= n || seen[j] || !on[j] || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue; seen[j] = 1; st.push(j); } }
      // ส่วนที่ไม่ต่อกับศีรษะ (ทั้งก้อนชัดและขอบจาง ๆ) ใต้คาง = ไม่ใช่ผม — คงไว้เฉพาะรอบ ๆ ก้อนที่ต่อกับศีรษะ
      const yl = Math.max(0, Math.floor(face.eyeY)), near = dilate01(seen, W, H, Math.max(2, Math.round(face.fw * .03)), yl);
      for (let i = yl * W; i < n; i++) if (keep[i] > 0 && !seen[i]) { const k = keep[i] * near[i]; body[i] = Math.min(1, body[i] + keep[i] - k); hair[i] *= keep[i] > 0 ? k / keep[i] : 0; keep[i] = k; }
    }
    // ใบหน้าจาก landmark (หดเข้า 10%) ที่เป็นสีผิว ต้องอยู่หน้าชุดเสมอ — กันรูบนใบหน้าเมื่อ parser พลาด (ภาพวาด/แสงแปลก)
    if (face.P && face.P.length >= 68) {
      const Fm = new Float32Array(n), Pp = face.P, eyeMid = { x: (Pp[36].x + Pp[45].x) / 2, y: (Pp[36].y + Pp[45].y) / 2 }, fh = Math.hypot(Pp[8].x - eyeMid.x, Pp[8].y - eyeMid.y);
      const lift = p => ({ x: p.x, y: p.y - fh * .3 }), g = grow([...Pp.slice(0, 17), ...Pp.slice(17, 27).reverse().map(lift)], .9);
      fillPoly(Fm, W, H, g, 1);
      for (let i = 0; i < n; i++) if (Fm[i] > keep[i]) { keep[i] = Fm[i]; neck[i] = Math.min(neck[i], 1 - keep[i]); body[i] = Math.max(0, 1 - keep[i] - neck[i]); }
    }
    // guided filter บนกรอบรอบศีรษะ (ขอบผม/เสื้อเดิมตามขอบภาพ) — นอกกรอบคงเดิม
    const fw = face.fw, bx = { x0: Math.max(0, Math.floor(face.cx - fw * 2)), x1: Math.min(W, Math.ceil(face.cx + fw * 2)), y0: Math.max(0, Math.floor(face.eyeY - fw * 1.4)), y1: Math.min(H, Math.ceil(face.chinY + fw * 2.4)) };
    const cw = bx.x1 - bx.x0, ch = bx.y1 - bx.y0;
    if (cw > 8 && ch > 8) {
      const I = new Float32Array(cw * ch), p = new Float32Array(cw * ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = (y + bx.y0) * W + x + bx.x0; I[y * cw + x] = (.299 * rgba[i * 4] + .587 * rgba[i * 4 + 1] + .114 * rgba[i * 4 + 2]) / 255; p[y * cw + x] = keep[i]; }
      const q = guidedFilter(I, p, cw, ch, Math.max(2, Math.round(fw * .02)), 2e-3);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const li = y * cw + x, i = (y + bx.y0) * W + x + bx.x0, v = clamp01((q[li] - .5) * 1.25 + .5);
        // ใช้ค่าที่เกลาเฉพาะบริเวณรอยต่อ (ค่าเดิมไม่ชัดเจน) — ภายในศีรษะ/ภายนอกไม่เปลี่ยน
        const edge = 1 - Math.abs(keep[i] - .5) * 2; keep[i] = keep[i] + (v - keep[i]) * Math.min(1, edge * 1.5);
        neck[i] = Math.min(neck[i], 1 - keep[i]); body[i] = Math.max(0, 1 - keep[i] - neck[i]);
      }
    }
    return { keep, neck, hair, body };
  }

  /**
   * วัดไหล่จาก silhouette (ไม่รวมศีรษะ ผม คอ) — ทนต่อผมยาวคลุมไหล่และแขนกอดอก:
   *  1) ขอบบนของไหล่ที่ระยะ 0.7–1.45 เท่าความกว้างหน้าจากแกนกลาง ทั้งสองข้าง (ข้ามจุดที่มีผมอยู่ติดด้านบน)
   *  2) fit เส้นตรง y = a + b·(x - cx) → มุมเอียงไหล่ (จำกัด ±15°)
   *  3) ความกว้างไหล่ = ช่วงทึบที่ผ่านแกนกลาง ณ แถวเดลตอยด์ (ไม่รวมผม) จำกัด 2.5–3.3 เท่าความกว้างหน้า (ค่าก่อนหน้า 2.9)
   * คืน {N, s, theta, width, measured, l, r, chin(=N), samples}
   */
  const SHOULDER_PRIOR = { lo: 2.5, hi: 3.3, mid: 2.9 };
  function measureShoulders(alpha, W, H, face, { keep = null, hair = null, neck = null, canon = null } = {}) {
    const C = canon || { lineY: .07, deltoidY: .68, width: 3.0, L: { x: -1.4, y: .24 }, R: { x: 1.4, y: .24 } };
    const fw = face.fw, cx = face.chinX != null ? face.chinX : face.cx, chinY = face.chinY;
    const bodyAt = i => alpha[i] * (1 - (keep ? keep[i] : 0)) * (1 - (neck ? neck[i] : 0));
    const y0 = Math.max(0, Math.round(chinY - fw * .4)), y1 = Math.min(H - 1, Math.round(chinY + fw * 1.5)), occR = Math.max(2, Math.round(fw * .05));
    const samples = [];
    for (const sd of [-1, 1]) for (const k of [.7, .85, 1.0, 1.15, 1.3, 1.45]) {
      const x = Math.round(cx + sd * k * fw); if (x < 0 || x >= W) continue;
      for (let y = y0; y <= y1; y++) {
        if (bodyAt(y * W + x) <= .5) continue;
        let occ = false;
        for (let d = 1; d <= occR && !occ; d++) { const yy = y - d; if (yy < 0) break; const j = yy * W + x; if ((hair && hair[j] > .3 && alpha[j] > .3) || (keep && keep[j] > .5 && alpha[j] > .5)) occ = true; }
        if (!occ && y > y0) samples.push({ x, y, sd });
        break;
      }
    }
    let a = chinY + fw * .5, b = 0, measured = false;
    const fitLine = S => {
      const n = S.length, mx = S.reduce((s, p) => s + p.x - cx, 0) / n, my = S.reduce((s, p) => s + p.y, 0) / n;
      let sxx = 0, sxy = 0; for (const p of S) { sxx += (p.x - cx - mx) ** 2; sxy += (p.x - cx - mx) * (p.y - my); }
      const both = S.some(p => p.sd < 0) && S.some(p => p.sd > 0);
      const bb = both && sxx > 0 ? sxy / sxx : 0;
      // ไหล่ลาดเป็นรูป ^ สมมาตร: ถ้ามีข้างเดียวใช้ค่าเฉลี่ยเป็นระดับไหล่ (ไม่เอียง)
      return { b: bb, a: my - bb * mx };
    };
    if (samples.length >= 2) {
      let f = fitLine(samples), S = samples;
      const res = p => Math.abs(p.y - (f.a + f.b * (p.x - cx)));
      const keepS = S.filter(p => res(p) < fw * .18);
      if (keepS.length >= 2 && keepS.length < S.length) { S = keepS; f = fitLine(S); }
      a = f.a; b = f.b; measured = true;
    }
    const theta = clamp(Math.atan(b), -.26, .26);
    a = clamp(a, chinY + fw * .05, chinY + fw * 1.1);
    // ความกว้างไหล่ ณ แถวเดลตอยด์
    const yw = Math.round(a + (C.deltoidY - C.lineY) * fw), widths = [];
    let lsum = 0, rsum = 0, cropped = false;
    for (let dy = -2; dy <= 2; dy++) {
      const y = yw + Math.round(dy * fw * .03); if (y < 0 || y >= H) continue;
      const o = y * W, at = x => alpha[o + x] * (1 - (hair ? hair[o + x] : 0)) > .5;
      let x0 = clamp(Math.round(cx), 0, W - 1);
      if (!at(x0)) continue;
      let l = x0, r = x0; while (l > 0 && at(l - 1)) l--; while (r < W - 1 && at(r + 1)) r++;
      if (l <= 0 || r >= W - 1) cropped = true;
      widths.push(r - l + 1); lsum += l; rsum += r;
    }
    let width = SHOULDER_PRIOR.mid * fw, xc = cx;
    if (widths.length) {
      widths.sort((p, q) => p - q);
      const wm = widths[widths.length >> 1], lm = lsum / widths.length, rm = rsum / widths.length;
      width = cropped ? Math.max(wm, SHOULDER_PRIOR.mid * fw) : wm;
      if (!cropped) xc = clamp((lm + rm) / 2, cx - fw * .25, cx + fw * .25);
    }
    width = clamp(width, SHOULDER_PRIOR.lo * fw, SHOULDER_PRIOR.hi * fw);
    const s = width / C.width, cs = Math.cos(theta), sn = Math.sin(theta);
    const yl = a + Math.tan(theta) * (xc - cx);
    const N = { x: xc + sn * C.lineY * s, y: yl - cs * C.lineY * s };
    const map = p => ({ x: N.x + s * (cs * p.x - sn * p.y), y: N.y + s * (sn * p.x + cs * p.y) });
    return { N, s, theta, width, measured, cropped, l: map(C.L), r: map(C.R), chin: { ...N }, samples, line: { a, b } };
  }
  /** จากจุดยึด 3 จุด (chin = โคนคอ N, l/r = บนไหล่) -> {N, s, theta} (ใช้กับจุดที่ผู้ใช้ลาก) */
  function fitFromTargets(T, canon = null) {
    const C = canon || { L: { x: -1.4, y: .24 }, R: { x: 1.4, y: .24 } };
    const d = Math.hypot(T.r.x - T.l.x, T.r.y - T.l.y), s = d / (C.R.x - C.L.x), theta = Math.atan2(T.r.y - T.l.y, T.r.x - T.l.x);
    return { N: { x: T.chin.x, y: T.chin.y }, s, theta };
  }

  /**
   * คอ: ใช้ผิวคอจริง (จาก parsing) แล้ว "ต่อคอ" ลงไปใต้คอเสื้อใหม่ (คอเสื้อเดิมมักบังโคนคอ) ให้สีผิวต่อเนื่อง:
   *  ขอบซ้าย/ขวาของคอที่เห็น -> ต่อลงแบบบานออกเล็กน้อย (กล้ามเนื้อ trapezius), สีจากแถวล่างสุดของคอจริงรายคอลัมน์ มืดลงเล็กน้อยตามความลึก + grain
   *  ถ้าไม่เห็นคอเลย (คอเต่า/ไม่มี parsing) สร้างคอจากสีผิวหน้า (มืดลง) กว้าง ~0.54 เท่าความกว้างหน้า
   *  เติมรูในคอ (สร้อยคอที่ถูกซ่อน) ด้วยสีคอลัมน์เดียวกัน
   * คืน { rgba, alpha } ของชั้นคอ (ขนาด W×H)
   */
  function synthNeck(person, alpha, neckS, keepS, W, H, face, fit, { skinRGB = null, noise = 1.5, seed = 5, hair = null, collarY = -.22, half = null } = {}) {
    const n = W * H, fw = face.fw, cx = face.chinX != null ? face.chinX : face.cx, jy = jawCurve(face);
    const rgba = new Uint8ClampedArray(n * 4), A = new Float32Array(n), skinLum = skinRGB ? .299 * skinRGB[0] + .587 * skinRGB[1] + .114 * skinRGB[2] : 0;
    neckS = new Float32Array(neckS); // สำเนา (แก้ค่าได้โดยไม่กระทบชั้นเดิม)
    const cs = Math.cos(fit.theta || 0), sn = Math.sin(fit.theta || 0), s = fit.s, drop = fit.drop || 0;
    // แนวคอเสื้อใหม่ (ด้านหน้า ~0.3 หน่วยใต้ขอบบนคอเสื้อ): ใช้คอจริงเหนือแนวนี้เป็นต้นแบบ ใต้แนวนี้ชุดบังอยู่แล้ว
    const yCollar = fit.N.y + s * (collarY + drop + .3) * cs;
    const yEnd = Math.min(H - 1, Math.ceil(fit.N.y + s * (collarY + drop + .75) + Math.abs(sn) * fw * .8));
    const yTop = Math.max(0, Math.floor(face.eyeY + (face.chinY - face.eyeY) * .3)), xL = Math.max(0, Math.floor(cx - fw * .9)), xR = Math.min(W - 1, Math.ceil(cx + fw * .9));
    // 1) ชั้นคอจริง + สีตัวคนใต้ขอบล่างของใบหน้า (กันฉากหลังซึมเป็นเส้นสว่างที่รอยต่อคาง/คอ) — ศีรษะวางทับอยู่แล้ว
    for (let y = yTop; y <= yEnd; y++) for (let x = xL; x <= xR; x++) {
      // ใต้ขอบใบหน้าเท่านั้น (ไม่เกินแนวกราม + 0.06 หน้า) — ไม่ลากเศษปกเสื้อเดิม/เงาเคราลงมาเป็นชั้นคอ
      const i = y * W + x, under = keepS[i] * (hair ? 1 - hair[i] : 1) * (Math.abs(x - cx) < fw * .55 && y < jy(x) + fw * .06 ? 1 : 0);
      const v = alpha[i] * Math.min(1, neckS[i] + under); if (v <= 0) continue;
      // ปกเสื้อขาวที่ parser ทายเป็นผิวคอ (พบในภาพขาวดำ): สว่างกว่าผิวหน้ามาก -> ไม่ใช้เป็นคอจริง (ส่วนที่สร้างจะเติมแทน)
      if (skinLum && neckS[i] > under) { const lum = .299 * person[i * 4] + .587 * person[i * 4 + 1] + .114 * person[i * 4 + 2]; if (lum > Math.max(skinLum * 1.3, skinLum + 45)) { neckS[i] = 0; continue; } }
      A[i] = v; for (let c = 0; c < 3; c++) rgba[i * 4 + c] = person[i * 4 + c];
    }
    // 2) ขอบคอที่เห็นในแต่ละแถว (เหนือแนวคอเสื้อใหม่)
    const obs = new Map();
    for (let y = Math.max(0, Math.round(face.chinY - fw * .3)); y <= Math.min(yEnd, yCollar); y++) {
      let l = -1, r = -1, cnt = 0;
      for (let x = xL; x <= xR; x++) if (alpha[y * W + x] * neckS[y * W + x] > .5) { if (l < 0) l = x; r = x; cnt++; }
      const wd = r - l + 1;
      if (l >= 0 && cnt > wd * .6 && wd >= fw * .22 && wd <= fw * .85 && Math.abs((l + r) / 2 - cx) < fw * .3) obs.set(y, { l, r });
    }
    const ys = [...obs.keys()].sort((p, q) => p - q), med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
    let yb, edges = new Map(), ref;
    if (ys.length >= 3) {
      yb = ys[ys.length - 1];
      for (const y of ys) { const nb = ys.filter(q => Math.abs(q - y) <= 3).map(q => obs.get(q)); edges.set(y, { l: med(nb.map(e => e.l)), r: med(nb.map(e => e.r)) }); }
      // สีอ้างอิงรายคอลัมน์: เฉลี่ยผิวคอที่เห็นทั้งหมด (ช่วงกว้างครอบคลุมด้านข้าง) — ไม่ใช้แถวติดคอเสื้อเดิมที่มีเงา
      const eb0 = edges.get(yb), ext = Math.round(fw * .3), cxx = Math.round((eb0.l + eb0.r) / 2), eb = { l: Math.min(eb0.l, cxx - ext), r: Math.max(eb0.r, cxx + ext) };
      const cols = eb.r - eb.l + 1, ry0 = Math.round(Math.max(ys[0], yb - fw * .14)), ry1 = Math.max(ry0 + 1, Math.round(yb - fw * .03));
      ref = { l: eb.l, ch: [0, 1, 2].map(() => new Float32Array(cols)) }; const cnt = new Float32Array(cols);
      for (let y = Math.max(0, ry0); y <= ry1; y++) for (let x = eb.l; x <= eb.r; x++) { const i = y * W + x; if (alpha[i] * neckS[i] > .8) { for (let c = 0; c < 3; c++) ref.ch[c][x - eb.l] += person[i * 4 + c]; cnt[x - eb.l]++; } }
      let tot = [0, 0, 0], tn = 0; for (let k = 0; k < cols; k++) if (cnt[k]) { for (let c = 0; c < 3; c++) tot[c] += ref.ch[c][k]; tn += cnt[k]; }
      const mean = tn ? tot.map(v => v / tn) : (skinRGB || [180, 140, 120]).map(v => v * .85);
      for (let k = 0; k < cols; k++) for (let c = 0; c < 3; c++) ref.ch[c][k] = cnt[k] ? ref.ch[c][k] / cnt[k] : mean[c];
      for (let c = 0; c < 3; c++) ref.ch[c] = boxFilter(ref.ch[c], cols, 1, Math.max(1, Math.round(fw * .03)));
    } else {
      // ไม่เห็นคอ: เริ่มใต้คาง สีผิวหน้ามืดลง ด้านข้างมืดกว่า (ทรงกระบอก)
      // ไม่เห็นคอ (คอเสื้อเดิมสูง/เครา): สร้างจากสีผิวหน้า ทรงกระบอก (กลางสว่าง ข้างมืด) — ความมืดใต้คางใส่ในลูปหลัก
      yb = Math.round(face.chinY - fw * .1);
      const hh = half || fw * .28, l = Math.round(cx - hh), r = Math.round(cx + hh), cols = r - l + 1, base = (skinRGB || [190, 150, 125]).map(v => v * .9);
      edges.set(yb, { l, r });
      ref = { l, synth: true, ch: [0, 1, 2].map(c => { const a = new Float32Array(cols); for (let k = 0; k < cols; k++) { const t = (k / Math.max(1, cols - 1)) * 2 - 1; a[k] = base[c] * (.8 + .2 * Math.sqrt(Math.max(0, 1 - t * t))); } return a; }) };
    }
    const cols = ref.ch[0].length, R = rng(seed), minHalf = half ? half * 1.04 : Math.max(fw * .3, s * .3), maxHalf = minHalf + fw * .14, fe = Math.max(1.5, fw * .02);
    // คอที่เห็นอยู่ในเงามืด (ใต้คาง/คอเสื้อเดิม): ยกความสว่างของส่วนที่สร้างให้ใกล้ผิวจริง (0.62–1.0 เท่าผิวหน้า)
    if (skinRGB) {
      const Ls = .299 * skinRGB[0] + .587 * skinRGB[1] + .114 * skinRGB[2]; let Lr = 0;
      for (let k = 0; k < cols; k++) Lr += .299 * ref.ch[0][k] + .587 * ref.ch[1][k] + .114 * ref.ch[2][k];
      Lr /= Math.max(1, cols); const tgt = clamp(Lr, Ls * .62, Ls), g = clamp(tgt / Math.max(1, Lr), .7, 1.8);
      if (Math.abs(g - 1) > .01) for (let c = 0; c < 3; c++) for (let k = 0; k < cols; k++) ref.ch[c][k] = ref.ch[c][k] * g * .7 + skinRGB[c] * (tgt / Math.max(1, Ls)) * .3 * (g > 1 ? 1 : 0) + (g > 1 ? 0 : ref.ch[c][k] * g * .3);
    }
    // สีคอ = ความสว่างจากคอจริง (เงาตามจริง) + สีผิว (a*, b*) จากใบหน้า — กันคอสีเทา/ม่วงเมื่อ parser เอาเสื้อขาว/เงามาปน
    if (skinRGB) {
      const sk = rgbToLab(skinRGB[0], skinRGB[1], skinRGB[2]);
      for (let k = 0; k < cols; k++) {
        const L = rgbToLab(ref.ch[0][k], ref.ch[1][k], ref.ch[2][k]), Lv = clamp(L[0], sk[0] * .55, sk[0] * 1.02), w = ref.synth ? 1 : .7;
        const q = labToRgb(Lv, L[1] + (sk[1] * (Lv / Math.max(1, sk[0])) ** .3 - L[1]) * w, L[2] + (sk[2] * (Lv / Math.max(1, sk[0])) ** .3 - L[2]) * w);
        for (let c = 0; c < 3; c++) ref.ch[c][k] = q[c];
      }
    }
    const colAt = (x, c) => ref.ch[c][clamp(Math.round(x - ref.l), 0, cols - 1)];
    const widen = e => { const c = (e.l + e.r) / 2, h = Math.max(minHalf, (e.r - e.l) / 2); return { l: c - h, r: c + h, ol: e.l, or: e.r }; };
    const eb = widen(edges.get(yb)), first = widen(edges.get(ys.length >= 3 ? ys[0] : yb));
    // ความสว่างแปรผันความถี่ต่ำเล็กน้อย (ผิวจริงไม่เรียบสนิท)
    const lowN = (x, y) => { const q = fw * .12, xi = Math.floor(x / q), yi = Math.floor(y / q), tx = x / q - xi, ty = y / q - yi, hsh = (a, b) => { let h = (a * 374761393 + b * 668265263 + seed * 97) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }; const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty); return (hsh(xi, yi) * (1 - u) + hsh(xi + 1, yi) * u) * (1 - v) + (hsh(xi, yi + 1) * (1 - u) + hsh(xi + 1, yi + 1) * u) * v - .5; };
    // 3) คอเต็มรูป: จากใต้แนวคาง (เริ่มซ้อนใต้ใบหน้าเล็กน้อย ไม่มีช่องว่าง) ลงไปใต้คอเสื้อใหม่ เติมเฉพาะที่ไม่มีผิวคอจริง
    const yS = Math.max(0, Math.floor(face.chinY - fw * .45));
    // ขอบบนของคอรายคอลัมน์ = ขอบล่างของใบหน้าจริง (keep) — คอติดกับใบหน้าตามรูปทรงจริง (หน้าเอียง/หันข้างก็ไม่มีช่องหรือขั้นบันได)
    const topY = new Float32Array(W).fill(-1), x0c = Math.max(0, Math.floor(cx - maxHalf - fe)), x1c = Math.min(W - 1, Math.ceil(cx + maxHalf + fe));
    for (let x = x0c; x <= x1c; x++) {
      // ปลายล่างของช่วงใบหน้าช่วงแรก (ไล่จากบนลงล่าง) — ไม่ใช้ก้อนที่หลุดอยู่ใต้คาง
      let yk = -1, seen = false;
      for (let y = Math.max(0, yS - Math.round(fw * .3)); y <= Math.min(yEnd, Math.round(face.chinY + fw * .3)); y++) {
        const on = keepS[y * W + x] * alpha[y * W + x] > .5 && !(hair && hair[y * W + x] > .5);
        if (on) { seen = true; yk = y; } else if (seen) break;
      }
      topY[x] = yk >= 0 ? Math.min(yk - fw * .03, Math.max(jy(x), yS)) : Math.max(jy(x), yS); // ไม่ต่ำกว่าแนวคาง (parser พลาดใต้คาง ก็ไม่เกิดช่อง)
    }
    let last = first;
    for (let y = yS; y <= yEnd; y++) {
      const below = y > yb, t = below ? y - yb : 0;
      if (!below && edges.has(y)) last = widen(edges.get(y));
      const e = below ? eb : last;
      // ใต้คอที่เห็น: คอที่สร้างอยู่กึ่งกลางช่องคอเสื้อ (N.x) บานออกเล็กน้อย — ไม่ตามแนวคอเอียงของภาพเดิม
      // ทรงคอ: กว้างคงที่ แล้วบานออกเป็นกล้ามเนื้อบ่าเฉพาะช่วงท้ายใกล้คอเสื้อ (ไม่ใช่แท่งสี่เหลี่ยม)
      const flareK = smooth((y - (yCollar - fw * .22)) / (fw * .3)), hb = Math.min(maxHalf, Math.max(minHalf, (eb.r - eb.l) / 2) + flareK * fw * .12), nx = cx + (fit.N.x - cx) * smooth(t / Math.max(1, yCollar - yb)); // จากใต้คางค่อย ๆ ไปกลางคอเสื้อ
      // เหนือแนวต่อคอ: กว้างอย่างน้อยเท่าคอปกติ (คอจริงที่เห็นแคบเพราะเงา/ปกเดิม) — ไม่เกิดขั้นบันไดที่แนวต่อ
      // (ศูนย์กลางใต้คาง ไม่ใช่กลางไหล่: หน้าเอียง/ภาพหน้าใหญ่ คอไม่โผล่ออกนอกแนวกราม)
      const mh = Math.min(minHalf, fw * .3), l = below ? nx - hb : Math.min(Math.max(e.l, eb.l - fw * .08), cx - mh), r = below ? nx + hb : Math.max(Math.min(e.r, eb.r + fw * .08), cx + mh);
      // ใต้คางอยู่ในเงา (สว่างขึ้นเมื่อห่างคาง) — ใช้เต็มที่เมื่อสร้างคอเองทั้งหมด
      const dark = below ? (ref.synth ? .76 + .2 * smooth((y - face.chinY) / (fw * .45)) : 1 - .08 * smooth(t / (fw * .45))) : 1;
      for (let x = Math.max(0, Math.floor(l - fe)); x <= Math.min(W - 1, Math.ceil(r + fe)); x++) {
        // ใบหน้าอยู่ด้านบน; ด้านข้างใต้หู (เหนือระดับคาง) ใช้เฉพาะผิวคอจริง ไม่สร้างเพิ่ม
        // ขอบบนของคอที่สร้าง = แนวกรามจริง (โค้งตามคาง ไม่ใช่เส้นตรง/ขั้นบันได)
        // คออยู่หลังใบหน้า: เริ่มสูงถึงแนวกราม (ส่วนที่ใบหน้าบังไม่เห็น) — ไม่มีช่อง/ชั้นหักระหว่างกรามกับคอ
        const i = y * W + x, ty = Math.max(Math.min(topY[x] >= 0 ? topY[x] : 1e9, jy(x)), face.chinY - fw * .45); if (y < ty - fe) continue;
        let edge = smooth(Math.min((x - l) / fe + .5, (r - x) / fe + .5, (y - ty) / fe + .5));
        if (!below) { // เหนือแนวต่อคอ: แถบกลางใต้คาง หรือรูที่มีผิวคอจริงล้อมทั้งซ้ายและขวา (ไม่ลากแถบออกด้านข้าง)
          const d = Math.round(fe * 2), enclosed = x - d >= 0 && x + d < W && neckS[i - d] * alpha[i - d] > .5 && neckS[i + d] * alpha[i + d] > .5;
          if (!enclosed) edge = Math.min(edge, smooth((mh - Math.abs(x - cx)) / fe + .5));
        }
        if (edge <= A[i] + .02) continue;
        const g = noise > 0 ? Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(6.2832 * R()) * noise : 0, lf = 1 + lowN(x, y) * .05;
        const u = (x - (below ? nx : (l + r) / 2)) / Math.max(1, (r - l) / 2), out = Math.max(0, e.ol - x, x - e.or) / Math.max(1, minHalf * .6), sd = (1 - .1 * smooth(out)) * (below && ref.synth ? .86 + .14 * Math.sqrt(Math.max(0, 1 - u * u)) : 1); // ทรงกระบอก: ข้างคอมืดลง
        const k = (edge - A[i]) / Math.max(1e-3, edge);
        for (let c = 0; c < 3; c++) rgba[i * 4 + c] = rgba[i * 4 + c] * (1 - k) + (colAt(x, c) * dark * sd * lf + g) * k;
        A[i] = edge;
      }
    }
    for (let i = 0; i < n; i++) rgba[i * 4 + 3] = A[i] * 255;
    return { rgba, alpha: A, yb, lb: Math.round(eb.l), rb: Math.round(eb.r), yCollar };
  }

  /** เงาผมที่ตกลงบนชุด: เบลอ mask ผม แล้วเลื่อนลงตามทิศแสง */
  function hairShadow(hairA, W, H, fw, { dy = .03, r = .03, amount = .35 } = {}) {
    // แถวบนสุดที่มีผม -> เบลอเฉพาะช่วงนั้นลงไป
    let yTop = H; for (let i = 0; i < hairA.length; i++) if (hairA[i] > .01) { yTop = Math.floor(i / W); break; }
    if (yTop >= H) return new Float32Array(W * H);
    const R = Math.max(1, Math.round(fw * r)), b = blur3Rows(hairA, W, H, R, Math.max(0, yTop - R * 3)), out = new Float32Array(W * H), sh = Math.round(fw * dy);
    for (let y = 0; y < H; y++) { const ys = y - sh; if (ys < 0) continue; for (let x = 0; x < W; x++) out[y * W + x] = clamp01(b[ys * W + x] * 1.3) * amount; }
    return out;
  }

  /**
   * รวมภาพตามลำดับชั้นของสตูดิโอจริง: ฉาก → ปกหลังคอ (back) → คอ (neck) → ชุด (front) → ศีรษะ+ผม (keep)
   *  person = สีตัวคน (ประมาณ foreground แล้ว), keepA = alpha ของศีรษะ+ผม, neck = {rgba, alpha}, back/front = RGBA ของชุดในพิกัดภาพ
   *  neckShade = เงาบนคอ (ใต้คาง + ขอบคอเสื้อ), gShade = เงาผมบนชุด, under = {rgba, alpha} ตัวคนเดิมใต้ชุด (เมื่อไม่ซ่อนเสื้อเดิม)
   * คืน { rgba, fgAlpha }
   */
  function composeLayers({ w, h, bg, person, keepA, neck = null, back = null, front = null, under = null, neckShade = null, gShade = null, wrap = .3, wrapR = 8 }) {
    const n = w * h, out = new Uint8ClampedArray(n * 4), fg = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      let r = bg[j], g = bg[j + 1], b = bg[j + 2], f = 0;
      if (under) { const a = under.alpha[i]; if (a > 0) { r += (under.rgba[j] - r) * a; g += (under.rgba[j + 1] - g) * a; b += (under.rgba[j + 2] - b) * a; f = a; } }
      if (back) { const a = back[j + 3] / 255; if (a > 0) { r += (back[j] - r) * a; g += (back[j + 1] - g) * a; b += (back[j + 2] - b) * a; f = a; } }
      if (neck) { const a = neck.alpha[i]; if (a > 0) { const s = neckShade ? 1 - neckShade[i] : 1; r += (neck.rgba[j] * s - r) * a; g += (neck.rgba[j + 1] * s - g) * a; b += (neck.rgba[j + 2] * s - b) * a; f = Math.max(f, a); } }
      if (front) { const a = front[j + 3] / 255; if (a > 0) { const s = gShade ? 1 - gShade[i] : 1; r += (front[j] * s - r) * a; g += (front[j + 1] * s - g) * a; b += (front[j + 2] * s - b) * a; f = Math.max(f, a); } }
      const a = keepA[i]; if (a > 0) { r += (person[j] - r) * a; g += (person[j + 1] - g) * a; b += (person[j + 2] - b) * a; f = Math.max(f, a); }
      out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = 255; fg[i] = f;
    }
    return { rgba: wrap > 0 ? lightWrap(out, bg, fg, w, h, { radius: wrapR, amount: wrap }) : out, fgAlpha: fg };
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
    estimateNoise, rng, addGrain, harmonizeGarment, contactShadow, lightWrap, blurredBackground,
    PARSE_LABELS, PARSE_GROUPS, parseCrop, parseGroups, cropToImage, multiclassGroups, parsePersonProb, fillMatteFromParse, minFilter, dilate01, blur3Rows, clothShading, faceFromParse, fillFaceMatte, distanceInside, canonShoulder, garmentClip, neckMeasure, heuristicParse, personLayers,
    SHOULDER_PRIOR, measureShoulders, fitFromTargets, synthNeck, hairShadow, composeLayers,
    applyMatteEdits, brush
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.StudioCore = api;
})(typeof window !== "undefined" ? window : globalThis);
