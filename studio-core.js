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
  function harmonizeGarment(rgba, w, h, user, ref = {}, opt = {}) {
    // ทำเฉพาะกรอบที่มีชุด (เร็วขึ้นมากเมื่อชุดกินพื้นที่ส่วนหนึ่งของภาพ) — ผลเหมือนทำทั้งภาพ (พิกเซลนอกชุดโปร่งใส)
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) if (rgba[(o + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0) return new Uint8ClampedArray(rgba);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    if (cw * ch > w * h * .8) return harmonizeFull(rgba, w, h, user, ref, opt);
    const sub = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) sub.set(rgba.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * cw * 4);
    const r = harmonizeFull(sub, cw, ch, { ...user, cx: user.cx != null ? user.cx - x0 : user.cx }, ref, opt), out = new Uint8ClampedArray(rgba.length);
    for (let y = 0; y < ch; y++) out.set(r.subarray(y * cw * 4, (y + 1) * cw * 4), ((y + y0) * w + x0) * 4);
    return out;
  }
  function harmonizeFull(rgba, w, h, user, ref = {}, { strength = 1, bright = 1, seed = 11, mono = false } = {}) {
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
    const head = new Float32Array(n), hair = new Float32Array(n), neck = new Float32Array(n), cloth = new Float32Array(n), skin = new Float32Array(n), acc5 = new Float32Array(n), hwA = new Float32Array(n), oA = new Float32Array(n), fA = new Float32Array(n);
    const fw = face.fw, cx = face.chinX != null ? face.chinX : face.cx, jy = jawCurve(face);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!wsum[i]) { cloth[i] = 1; continue; }
      const pe = Math.max(1e-4, 1 - acc[i]), ph = acc[n + i] / pe, pb = acc[2 * n + i] / pe, pf = acc[3 * n + i] / pe, pc = acc[4 * n + i] / pe, po = acc[5 * n + i] / pe;
      const dy = y - face.chinY, dx = Math.abs(x - cx);
      // เครื่องประดับใกล้ศีรษะ (ต่างหูห้อยถึงใต้คางเล็กน้อย แว่น หมวก) = ศีรษะ; ต่ำกว่านั้น (สร้อย/เข็มกลัด) = เสื้อ
      // ต่างหูอยู่ข้างแก้ม/ใต้ติ่งหู (|dx| > 0.4 หน้า) ส่วนสร้อยคออยู่กลางใต้คาง
      const nearHead = Math.max(smooth((fw * .08 - dy) / (fw * .12)) * smooth((fw * 1.25 - dx) / (fw * .2)), smooth((fw * .08 - dy) / (fw * .1)) * smooth((dx - fw * .36) / (fw * .08)) * smooth((fw * .72 - dx) / (fw * .08)) * smooth((po - .35) / .25));
      // คอ: ผิวกายใต้คาง ในแนวกึ่งกลาง (มือ/แขนที่อยู่ไกล = skin)
      const inNeck = smooth((fw * .62 - dx) / (fw * .12)) * smooth((fw * 1.3 - dy) / (fw * .2)) * (y > jy(x) - fw * .35 ? 1 : 0);
      // ผ้าคลุมศีรษะ/หมวกผ้า (คลาส clothes เหนือระดับปาก) = ศีรษะ
      // ผ้าคลุมศีรษะ/หมวกผ้า (เหนือแนวคาง) — คัดเฉพาะส่วนที่ต่อกับผ้าเหนือระดับตาด้านล่าง (ปกเสื้อสูงไม่ต่อขึ้นไป จึงไม่ถูกนับ)
      // ข้อจำกัด: ชายผ้าที่คลุมลงใต้คางยังถูกแทนด้วยชุดใหม่ (เสื้อเดิมต่อเนื่องกับผ้าคลุม แยกด้วยคลาสไม่ได้)
      // ต้องเป็น "คน" จริงตามโมเดล (พื้นหลังรวม < 0.5): เป้ชุดอวกาศ/พนักเก้าอี้ที่รอบละเอียดบอกว่าเป็นฉาก ไม่ใช่ผ้าคลุมศีรษะ
      const isP = smooth((.55 - acc[i]) / .2);
      const hw = pc * smooth((face.chinY - y) / (fw * .1)) * smooth((fw * 1.2 - dx) / (fw * .2)) * isP;
      head[i] = pf + po * nearHead * isP + hw; hwA[i] = hw; oA[i] = po * nearHead * isP; fA[i] = pf; hair[i] = ph; neck[i] = pb * inNeck; skin[i] = pb * (1 - inNeck);
      cloth[i] = pc - hw + po * (1 - nearHead * isP); acc5[i] = po;
    }
    // เครื่องประดับ/วัตถุ "others" ใกล้ศีรษะ ต้องแตะใบหน้า (ต่างหู แว่น) หรือคลุมกระหม่อม (หมวก) — เป้/พนักเก้าอี้ข้างศีรษะที่มีผมคั่น = ไม่ใช่ศีรษะ
    {
      const on = new Uint8Array(n), seen = new Uint8Array(n), st = [], fOn = new Uint8Array(n);
      for (let i = 0; i < n; i++) { on[i] = oA[i] > .25 ? 1 : 0; fOn[i] = fA[i] > .5 ? 1 : 0; }
      const nearF = dilate01(fOn, W, H, Math.max(2, Math.round(fw * .05)));
      const sx0 = Math.round(cx - fw * .45), sx1 = Math.round(cx + fw * .45), sy1 = Math.round(face.eyeY - fw * .35);
      for (let i = 0; i < n; i++) { if (!on[i]) continue; const x = i % W, y = (i / W) | 0; if (nearF[i] || (y < sy1 && x > sx0 && x < sx1)) { seen[i] = 1; st.push(i); } }
      while (st.length) { const i = st.pop(), x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && on[j] && !seen[j]) { seen[j] = 1; st.push(j); } }
      for (let i = 0; i < n; i++) if (oA[i] > 0 && !seen[i]) { head[i] -= oA[i]; cloth[i] += oA[i]; }
    }
    // ผ้าคลุมศีรษะ/หมวก ต้องต่อกับส่วนเหนือระดับตา — ปกเสื้อสูง (ทรงโบราณ) ที่ไม่ต่อขึ้นไปถึงศีรษะ กลับเป็นเสื้อเดิม (ซ่อน)
    {
      const on = new Uint8Array(n), seen = new Uint8Array(n), st = [];
      for (let i = 0; i < n; i++) on[i] = hwA[i] > .3 ? 1 : 0;
      // เมล็ด: เหนือกระหม่อม (|dx| < 0.45 หน้า, สูงกว่าตา 0.35 หน้า) — หมวก/ผ้าคลุมผมคลุมศีรษะจากด้านบน;
      // เป้/พนักเก้าอี้/ปกเสื้อสูงที่อยู่ข้างศีรษะ (มีผมคั่น) ไม่ใช่เครื่องประดับศีรษะ
      for (let y = 0; y < Math.min(H, Math.round(face.eyeY - fw * .35)); y++) for (let x = Math.max(0, Math.round(face.cx - fw * .45)); x < Math.min(W, Math.round(face.cx + fw * .45)); x++) { const i = y * W + x; if (on[i] && !seen[i]) { seen[i] = 1; st.push(i); } }
      while (st.length) { const i = st.pop(), x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= n || seen[j] || !on[j] || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue; seen[j] = 1; st.push(j); } }
      for (let i = 0; i < n; i++) if (hwA[i] > 0 && !seen[i]) { head[i] -= hwA[i]; cloth[i] += hwA[i]; hwA[i] = 0; }
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
    return { head, hair, neck, cloth, skin, acc: acc5, hw: hwA };
  }

  /**
   * ผ้าคลุมศีรษะ (ฮิญาบ/ผ้าโพก) ที่คลุมลงใต้คาง: โมเดลแยกส่วนให้ผ้าใต้คางเป็น "เสื้อ" (ต่อเนื่องกับเสื้อเดิม) — ถ้าไม่แก้จะถูกตัดตรงที่คาง
   *  1) แบบสีของผ้าคลุม = ฮิสโตแกรม RGB (8×8×8) จากผ้าคลุมเหนือคางที่ยืนยันแล้ว (P.hw) เทียบกับเสื้อเดิมช่วงล่างของภาพ
   *  2) อัตราส่วนความน่าจะเป็น (เฉลี่ยในหน้าต่าง ~0.08 หน้า เพราะผ้าลายมีหลายสี) → ขยายพื้นที่จากผ้าคลุมเหนือคางลงมา (ต่อเนื่องเท่านั้น)
   *  3) ปิด/เปิด (morphology) + เติมรูเล็ก → ย้ายจาก "เสื้อ" ไปเป็น "ศีรษะ" (วางหน้าชุดใหม่ ทั้งผืน ไม่ตัดที่คาง)
   * คืน Float32Array (ผ้าคลุมส่วนใต้คาง 0..1) หรือ null ถ้าไม่มีผ้าคลุมศีรษะ
   */
  function headwearExtend(rgba, alpha, P, W, H, face) {
    if (!P.hw) return null;
    const n = W * H, fw = face.fw, cx = face.chinX != null ? face.chinX : face.cx, cy = Math.round(face.chinY);
    const bin = i => ((rgba[i * 4] >> 5) << 6) | ((rgba[i * 4 + 1] >> 5) << 3) | (rgba[i * 4 + 2] >> 5), lum = i => .299 * rgba[i * 4] + .587 * rgba[i * 4 + 1] + .114 * rgba[i * 4 + 2];
    // ผ้าคลุม/หมวกส่วนที่ต่ำกว่าระดับตา ต้องมีสีที่พบในส่วนเหนือตา (ผืนเดียวกัน) — ปกโค้ทสีเข้มข้างเคราที่ต่อกับผมขาว
    // (โมเดลทายผมเป็น "ผ้า") ไม่ใช่ผ้าคลุมศีรษะ -> คืนเป็นเสื้อเดิม
    {
      const Ha = new Float32Array(512); let na = 0;
      for (let y = 0; y < Math.round(face.eyeY); y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (P.hw[i] > .5) { Ha[bin(i)]++; na++; } }
      if (na > 30) {
        const sm = new Float32Array(512); for (let b = 0; b < 512; b++) { const r = b >> 6, g = (b >> 3) & 7, bl = b & 7; let t = 0; for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) { const R2 = r + dr, G2 = g + dg, B2 = bl + db; if (R2 >= 0 && R2 < 8 && G2 >= 0 && G2 < 8 && B2 >= 0 && B2 < 8) t += Ha[(R2 << 6) | (G2 << 3) | B2]; } sm[b] = t / na; }
        // ภาพขาวดำ: ฮิสโตแกรมสีแยกไม่ออก ใช้ความสว่างเฉลี่ยของผ้าเหนือตาแทน (ผมขาวที่ทายเป็นผ้า vs ปกโค้ทดำ)
        let ml = 0, chroma = 0; for (let y = 0; y < Math.round(face.eyeY); y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (P.hw[i] > .5) { ml += lum(i); chroma += Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) - Math.min(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); } }
        ml /= na; const mono = chroma / na < 10;
        for (let y = Math.round(face.eyeY + fw * .2); y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, v = P.hw[i]; if (v <= 0 || (sm[bin(i)] > .004 && !(mono && Math.abs(lum(i) - ml) > 60))) continue; P.hw[i] = 0; P.head[i] = Math.max(0, P.head[i] - v); P.cloth[i] += v; }
      }
    }
    const Hs = new Float32Array(512), Ht = new Float32Array(512); let ns = 0, nt = 0;
    for (let y = Math.max(0, Math.round(face.eyeY - fw * .2)); y < Math.min(H, cy + Math.round(fw * .1)); y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (P.hw[i] > .5 && alpha[i] > .6) { Hs[bin(i)]++; ns++; } }
    if (ns < fw * fw * .12) return null;
    const yt0 = Math.min(H - 1, Math.max(cy + Math.round(fw * 2.6), Math.round(H * .82)));
    for (let y = yt0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = y * W + x; if (alpha[i] > .6 && P.cloth[i] > .5) { Ht[bin(i)]++; nt++; } }
    if (nt < 50) return null;
    // ความน่าจะเป็นผ้าคลุมรายพิกเซล (ใต้คาง) แล้วเฉลี่ยในหน้าต่าง
    const y0 = Math.max(0, cy - Math.round(fw * .15)), y1 = Math.min(H, cy + Math.round(fw * 2.8)), rows = y1 - y0;
    if (rows < 4) return null;
    const pr = new Float32Array(W * rows);
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (alpha[i] < .5) continue; const b = bin(i), a = (Hs[b] + .5) / ns, c = (Ht[b] + .5) / nt; pr[(y - y0) * W + x] = a / (a + c); }
    const pm = boxFilter(pr, W, rows, Math.max(1, Math.round(fw * .05)));
    // ความเป็นลายผ้า: ส่วนเบี่ยงเบนความสว่างเฉพาะที่ — ปกสูทเรียบสีเดียวกับสีพื้นของผ้าคลุม ไม่ถูกนับเป็นผ้าคลุม
    const Lr = new Float32Array(W * rows), L2 = new Float32Array(W * rows);
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const i = y * W + x, l = (.299 * rgba[i * 4] + .587 * rgba[i * 4 + 1] + .114 * rgba[i * 4 + 2]) / 255, j = (y - y0) * W + x; Lr[j] = l; L2[j] = l * l; }
    const tr = Math.max(1, Math.round(fw * .04)), mL = boxFilter(Lr, W, rows, tr), mL2 = boxFilter(L2, W, rows, tr);
    const on = new Uint8Array(n), grow = new Uint8Array(n), st = [];
    for (let y = y0; y < y1; y++) for (let x = Math.max(0, Math.round(cx - fw * 1.6)); x < Math.min(W, Math.round(cx + fw * 1.6)); x++) {
      const i = y * W + x; if (alpha[i] < .5 || P.head[i] - P.hw[i] > .5) continue; // ใบหน้าไม่ใช่ผ้า
      const j = (y - y0) * W + x, sd = Math.sqrt(Math.max(0, mL2[j] - mL[j] * mL[j]));
      if (pm[j] > .6 && (sd > .05 || pr[j] > .6)) on[i] = 1;
    }
    for (let x = 0; x < W; x++) for (let y = Math.max(y0, cy - Math.round(fw * .4)); y <= Math.min(y1 - 1, cy + 1); y++) { const i = y * W + x; if (P.hw[i] > .5 && !grow[i]) { grow[i] = 1; st.push(i); } }
    while (st.length) { const i = st.pop(), x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= y0 * W && j < y1 * W && on[j] && !grow[j]) { grow[j] = 1; st.push(j); } }
    for (let i = 0; i < y0 * W; i++) grow[i] = 0;
    // morphology เฉพาะแถบรอบผ้าคลุม (ไม่ทั้งภาพ — เร็วขึ้น)
    const bx0 = Math.max(0, Math.round(cx - fw * 1.8)), bx1 = Math.min(W - 1, Math.round(cx + fw * 1.8)), bw = bx1 - bx0 + 1, bh = y1 - y0, band = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) band[y * bw + x] = grow[(y + y0) * W + x + bx0];
    let gb = closeR(band, bw, bh, Math.max(1, Math.round(fw * .04)));
    gb = openR(fillHoles(gb, bw, bh, Math.round((fw * .5) ** 2)), bw, bh, Math.max(1, Math.round(fw * .03)));
    const g = new Uint8Array(n); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) g[(y + y0) * W + x + bx0] = gb[y * bw + x];
    // สีเสื้อเดิมที่ติดมา (ปกสูทเรียบใต้ผ้าคลุม): ส่วนที่เรียบไม่มีลาย ลึกกว่าคาง 0.6 หน้า ไม่ใช่ผ้าคลุม
    for (let y = Math.round(face.chinY + fw * .6); y < y1; y++) for (let x = bx0; x <= bx1; x++) { const i = y * W + x, j = (y - y0) * W + x; if (!g[i]) continue; const sd = Math.sqrt(Math.max(0, mL2[j] - mL[j] * mL[j])); if (sd < .035 && pr[j] < .75) g[i] = 0; }
    let cnt = 0; const out = new Float32Array(n);
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if ((g[i] || (y <= cy + 2 && P.hw[i] > .3)) && alpha[i] > .3) { out[i] = 1; if (y > cy) cnt++; } }
    if (cnt < fw * fw * .08) return null;
    const sm = blur3Rows(out, W, H, Math.max(1, Math.round(fw * .012)), y0);
    for (let i = 0; i < n; i++) { const v = sm[i]; if (v <= 0) continue; P.head[i] = Math.max(P.head[i], v); P.cloth[i] = Math.max(0, P.cloth[i] - v); P.neck[i] *= 1 - v; }
    P.hwx = sm;
    return sm;
  }
  /**
   * "ผม" ใต้คางที่สีเหมือนเสื้อเดิมมากกว่าผมบนศีรษะ (ปกโค้ทสีเข้มที่โมเดลทายเป็นผม ข้างคอ) -> เสื้อเดิม (ซ่อนใต้ชุดใหม่)
   * แบบสี = ฮิสโตแกรม RGB ของผมเหนือระดับตา เทียบเสื้อเดิมช่วงล่างของภาพ; ย้ายเฉพาะที่ชัดเจน (อัตราส่วน < 0.3 หลังเฉลี่ยหน้าต่าง)
   * ผมดำบนสูทดำ (แยกด้วยสีไม่ได้) คงเป็นผมเหมือนเดิม — คืนจำนวนพิกเซลที่ย้าย
   */
  function hairCleanup(rgba, alpha, P, W, H, face) {
    const fw = face.fw, cy = Math.round(face.chinY);
    const bin = i => ((rgba[i * 4] >> 5) << 6) | ((rgba[i * 4 + 1] >> 5) << 3) | (rgba[i * 4 + 2] >> 5);
    const Hh = new Float32Array(512), Hc = new Float32Array(512); let nh = 0, nc = 0;
    for (let y = 0; y < Math.round(face.eyeY); y += 2) for (let x = 0; x < W; x += 2) { const i = y * W + x; if (P.hair[i] > .6 && alpha[i] > .7) { Hh[bin(i)]++; nh++; } }
    const yt0 = Math.min(H - 1, Math.max(cy + Math.round(fw * 1.8), Math.round(H * .8)));
    for (let y = yt0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = y * W + x; if (alpha[i] > .6 && P.cloth[i] > .5) { Hc[bin(i)]++; nc++; } }
    if (nh < 80 || nc < 80) return 0;
    const y0 = Math.min(H, cy + Math.round(fw * .05)), rows = H - y0; if (rows < 4) return 0;
    const pr = new Float32Array(W * rows).fill(.5);
    for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (P.hair[i] < .3) continue; const b = bin(i), a = (Hh[b] + .5) / nh, c = (Hc[b] + .5) / nc; pr[(y - y0) * W + x] = a / (a + c); }
    const rb = Math.max(1, Math.round(fw * .04)), pm = boxFilter(boxFilter(pr, W, rows, rb), W, rows, rb); let moved = 0; // กรองกล่อง 2 รอบ (ไม่เกิดรอยตัดเป็นสี่เหลี่ยม)
    for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, h = P.hair[i]; if (h < .3) continue; const k = smooth((.32 - pm[(y - y0) * W + x]) / .12) * smooth((y - y0) / (fw * .35)); if (k <= 0) continue; /* ไล่จากแนวคางลงไป (ไม่ตัดผมเป็นเส้นตรงที่ระดับคาง) */ P.hair[i] = h * (1 - k); P.cloth[i] += h * k; if (k > .5) moved++; }
    return moved;
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
  function fillMatteFromParse(raw, run, W, H, pp = null) {
    pp = pp || parsePersonProb(run, W, H); const n = W * H, out = new Float32Array(raw);
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (raw[y * W + x] > .5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { x0 = 0; x1 = W - 1; y0 = 0; y1 = H - 1; }
    const px = Math.round((x1 - x0) * .1), py = Math.round((y1 - y0) * .1); x0 = Math.max(0, x0 - px); x1 = Math.min(W - 1, x1 + px); y0 = Math.max(0, y0 - py); y1 = Math.min(H - 1, y1 + py);
    const m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = smooth((pp[i] - .85) / .1);
    // กร่อนขอบเข้า r พิกเซล (distance transform — O(n) แทน min filter O(n·r))
    const r = Math.max(2, Math.round(Math.max(W / run.S, H / run.S) * 1.5)), on = new Uint8Array(n); for (let i = 0; i < n; i++) on[i] = m[i] > .02 ? 1 : 0;
    const dd = edt(on, W, H), er = new Float32Array(n); for (let i = 0; i < n; i++) er[i] = dd[i] > r ? m[i] : 0;
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
   * ระยะ (พิกเซล) จากจุดในมาสก์ (on[i] = 1) ถึงจุดนอกมาสก์ที่ใกล้สุด — chamfer 3-4 สองรอบ (ประมาณ Euclidean ±8%)
   * borders = ขอบภาพที่ถือว่าเป็น "นอกมาสก์" {l, r, t, b} (ค่าเริ่มต้น: ทุกด้าน) — ตัวคนที่ล้นขอบล่างของภาพไม่ถูกกร่อนจากขอบล่าง
   */
  function edt(on, W, H, { l = true, r = true, t = true, b = true } = {}) {
    const n = W * H, d = new Float32Array(n), BIG = 1e9, D = 1.4142;
    for (let i = 0; i < n; i++) d[i] = on[i] ? BIG : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1); else if (l) v = Math.min(v, 1);
      if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + D); if (x < W - 1) v = Math.min(v, d[i - W + 1] + D); } else if (t) v = Math.min(v, 1);
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!d[i]) continue;
      let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1); else if (r) v = Math.min(v, 1);
      if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + D); if (x > 0) v = Math.min(v, d[i + W - 1] + D); } else if (b) v = Math.min(v, 1);
      d[i] = v;
    }
    return d;
  }
  /** morphology บนมาสก์ 0/1 (Uint8Array) ด้วยโครงสร้างวงกลมรัศมี r (ผ่าน distance transform — O(n) ไม่ขึ้นกับ r) */
  function dilateR(on, W, H, r) { const inv = new Uint8Array(on.length); for (let i = 0; i < on.length; i++) inv[i] = on[i] ? 0 : 1; const d = edt(inv, W, H, { l: false, r: false, t: false, b: false }), o = new Uint8Array(on.length); for (let i = 0; i < on.length; i++) o[i] = on[i] || d[i] <= r ? 1 : 0; return o; }
  function erodeR(on, W, H, r, borders = { l: false, r: false, t: false, b: false }) { const d = edt(on, W, H, borders), o = new Uint8Array(on.length); for (let i = 0; i < on.length; i++) o[i] = d[i] > r ? 1 : 0; return o; }
  /** ปิด (เติมร่อง/ช่องแคบ) และเปิด (ลบติ่งบาง ๆ) */
  const closeR = (on, W, H, r) => erodeR(dilateR(on, W, H, r), W, H, r);
  const openR = (on, W, H, r) => dilateR(erodeR(on, W, H, r), W, H, r);
  /**
   * เติมรูภายในมาสก์: ก้อนพื้นหลังที่ไม่แตะขอบ ซ้าย/ขวา/บน ของภาพ และเล็กกว่า maxArea พิกเซล (ช่องว่างจริงระหว่างแขนกับลำตัวที่ใหญ่กว่านี้คงไว้)
   * ขอบล่างไม่นับเป็น "ภายนอก" (ตัวคนล้นขอบล่างของภาพ) — คืน Uint8Array ใหม่
   */
  function fillHoles(on, W, H, maxArea, force = null) {
    const n = W * H, out = Uint8Array.from(on), lab = new Int32Array(n).fill(-1), st = [];
    for (let s0 = 0; s0 < n; s0++) {
      if (on[s0] || lab[s0] >= 0) continue;
      const comp = []; let border = false; lab[s0] = s0; st.push(s0);
      while (st.length) {
        const i = st.pop(), x = i % W, y = (i / W) | 0; comp.push(i);
        if (x === 0 || x === W - 1 || y === 0) border = true;
        if (x > 0 && !on[i - 1] && lab[i - 1] < 0) { lab[i - 1] = s0; st.push(i - 1); }
        if (x < W - 1 && !on[i + 1] && lab[i + 1] < 0) { lab[i + 1] = s0; st.push(i + 1); }
        if (y > 0 && !on[i - W] && lab[i - W] < 0) { lab[i - W] = s0; st.push(i - W); }
        if (y < H - 1 && !on[i + W] && lab[i + W] < 0) { lab[i + W] = s0; st.push(i + W); }
      }
      if (!border && (comp.length <= maxArea || (force && force(comp)))) for (const i of comp) out[i] = 1;
    }
    return out;
  }
  /** ก้อนที่ต่อกับจุดเมล็ดใด ๆ ในกรอบ seed {x0,y0,x1,y1} (4-connected) — คืน Uint8Array */
  function componentFrom(on, W, H, seed) {
    const n = W * H, o = new Uint8Array(n), st = [];
    for (let y = Math.max(0, seed.y0 | 0); y <= Math.min(H - 1, seed.y1 | 0); y++) for (let x = Math.max(0, seed.x0 | 0); x <= Math.min(W - 1, seed.x1 | 0); x++) { const i = y * W + x; if (on[i] && !o[i]) { o[i] = 1; st.push(i); } }
    while (st.length) { const i = st.pop(), x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && on[j] && !o[j]) { o[j] = 1; st.push(j); } }
    return o;
  }
  /**
   * ขอบบนของไหล่ (หน่วยมาตรฐาน v ที่ |u|) ตามโครงร่างไหล่มาตรฐาน + ค่าชดเชยรายข้าง side = {l:[c0,c1], r:[c0,c1]}
   * (ไหล่ซ้าย/ขวาของคนจริงลาดไม่เท่ากัน: c0 = เลื่อนขึ้นลง, c1 = ความลาดเพิ่มต่อหน่วยระยะจากแกนกลาง)
   */
  function shoulderTop(u, side = null) {
    const a = Math.abs(u);
    let v = a < .33 ? -.22 : a < 1.2 ? -.22 + (a - .33) / .87 * .35 : .13 + Math.min(1, (a - 1.2) / .42) ** 2 * .6 + Math.max(0, a - 1.62) * 2;
    if (side) { const c = u < 0 ? side.l : side.r; if (c) v += (c[0] + c[1] * (a - 1)) * smooth((a - .35) / .5); }
    return v;
  }
  /**
   * มาสก์ตัดชุด (silhouette ของชุด) จากตัวคนจริง แต่ทนต่อ matte ที่ผิดพลาด:
   *  1) ตัวคน (ไม่รวมใบหน้า/ผ้าคลุมศีรษะ; ผมนับได้ — ชุดอยู่ใต้ผม) ที่โมเดลแยกส่วนยืนยันว่าเป็นคน (pp) — ตัดเศษฉาก (ธง/เสา) ที่ MODNet ติดมา
   *  2) ไม่สูงกว่าแนวไหล่ที่วัดได้รายข้าง (ใต้ผมยาวไหล่ไม่ "ยก" ขึ้นถึงคาง) และไม่กว้างเกินโครงร่างคน (ชุดอวกาศ/เก้าอี้ ไม่กลายเป็นชุดก้อนใหญ่)
   *  3) morphology: ปิดร่อง → เติมรูเล็ก (กระดุม/สร้อย/เงา) → เปิด (ลบติ่งบาง) → เฉพาะก้อนหลักที่ต่อกับลำตัว → เกลาเส้นขอบให้เรียบ (ไม่มีชายเสื้อเป็นคลื่น)
   *  4) ตัวคนที่ล้นขอบล่างของภาพ: ชุดยาวถึงขอบภาพ (เติมช่องว่างที่เปิดออกด้านล่าง)
   * คืน { clip, form } — form = ความนูนของลำตัว/แขน (หน่วยมาตรฐาน) จากระยะถึงขอบ
   */
  /** ย่อครึ่ง (เฉลี่ย 2×2) / ขยายสองเท่า (bilinear) สำหรับงาน morphology ที่ไม่ต้องละเอียดระดับพิกเซล */
  /** ย่อ k เท่า (เฉลี่ย k×k) / ขยาย k เท่า (bilinear) */
  function downK(a, W, H, k) { if (k === 2) return half2(a, W, H); const w = Math.ceil(W / k), h = Math.ceil(H / k), o = new Float32Array(w * h), c = new Float32Array(w * h); for (let y = 0; y < H; y++) { const r = ((y / k) | 0) * w; for (let x = 0; x < W; x++) { const j = r + ((x / k) | 0); o[j] += a[y * W + x]; c[j]++; } } for (let j = 0; j < o.length; j++) o[j] /= c[j] || 1; return o; }
  function upK(a, w, h, W, H, k) {
    if (k === 2) return up2(a, w, h, W, H);
    const o = new Float32Array(W * H), sh = (k - 1) / 2;
    for (let y = 0; y < H; y++) { const fy = Math.min(h - 1, Math.max(0, (y - sh) / k)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < W; x++) { const fx = Math.min(w - 1, Math.max(0, (x - sh) / k)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0; o[y * W + x] = (a[y0 * w + x0] * (1 - tx) + a[y0 * w + x1] * tx) * (1 - ty) + (a[y1 * w + x0] * (1 - tx) + a[y1 * w + x1] * tx) * ty; } }
    return o;
  }
  function half2(a, W, H) { const w = Math.ceil(W / 2), h = Math.ceil(H / 2), o = new Float32Array(w * h); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[(y >> 1) * w + (x >> 1)] += a[y * W + x] * .25; return o; }
  function up2(a, w, h, W, H) {
    const o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) { const fy = Math.min(h - 1, Math.max(0, (y - .5) / 2)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < W; x++) { const fx = Math.min(w - 1, Math.max(0, (x - .5) / 2)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0; o[y * W + x] = (a[y0 * w + x0] * (1 - tx) + a[y0 * w + x1] * tx) * (1 - ty) + (a[y1 * w + x0] * (1 - tx) + a[y1 * w + x1] * tx) * ty; } }
    return o;
  }
  function garmentClip(alpha, layers, W, H, face, fit, opt = {}) {
    // ภาพใหญ่: คำนวณที่ความละเอียดครึ่งหนึ่ง (รูปร่างชุดเรียบอยู่แล้ว) แล้วขยายกลับ — เร็วขึ้น ~4 เท่า
    if (W * H > 300000 && !opt.full) {
      const k = W * H > 900000 ? 3 : 2, w = Math.ceil(W / k), h = Math.ceil(H / k), hf = v => ({ ...v, x: v.x / k, y: v.y / k }), dn = a => downK(a, W, H, k);
      const f2 = { ...face, cx: face.cx / k, chinX: face.chinX != null ? face.chinX / k : undefined, chinY: face.chinY / k, eyeY: face.eyeY / k, fw: face.fw / k, P: null };
      const L2 = { keep: dn(layers.keep), hair: dn(layers.hair || new Float32Array(W * H)) };
      const r = garmentClip(dn(alpha), L2, w, h, f2, { ...fit, N: hf(fit.N), s: fit.s / k }, { ...opt, pp: opt.pp ? dn(opt.pp) : null, full: true });
      const clip = upK(r.clip, w, h, W, H, k), form = upK(r.form, w, h, W, H, k);
      for (let i = 0; i < clip.length; i++) clip[i] = clamp01((clip[i] - .5) * 2 + .5);
      return { clip, form };
    }
    return garmentClipFull(alpha, layers, W, H, face, fit, opt);
  }
  function garmentClipFull(alpha, layers, W, H, face, fit, { pp = null, side = null, nw = .33 } = {}) {
    const n = W * H, cs = Math.cos(fit.theta || 0), sn = Math.sin(fit.theta || 0), s = fit.s, N = fit.N, fw = face.fw;
    const yTop = Math.max(0, Math.floor(Math.min(face.chinY - fw * .6, N.y - s * .6)));
    const keep = layers.keep, hair = layers.hair || new Float32Array(n);
    let on = new Uint8Array(n);
    // ตัวคนข้างคอที่มีผมยาวอยู่ด้านนอก (ปกเสื้อเดิมตั้งระหว่างผมกับคอ): ชุดคลุมได้ — ไม่มีช่องฉากหลังระหว่างผมกับคอ
    const hq = Math.max(2, Math.round(s * .2)), hairOut = (x, y, sd) => { for (let k = 2; k <= hq; k += 2) { const xx = x + sd * k; if (xx < 0 || xx >= W) break; if (hair[y * W + xx] > .4) return true; } return false; };
    // ตัวคนใต้ปลายผมยาว (ผมคลุมไหล่ลงมา): ชุดต้องอยู่ใต้ผมด้วย ไม่มีช่องฉากหลังระหว่างปลายผมกับไหล่ชุด
    const hu = Math.max(2, Math.round(s * .3)), hairAbove = (x, y) => { for (let k = 2; k <= hu; k += 2) { const yy = y - k; if (yy < 0) break; if (hair[yy * W + x] > .4 && alpha[yy * W + x] > .5) return true; } return false; };
    for (let y = yTop; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, a = alpha[i]; if (a <= .35) continue;
      const hr = hair[i] > .3, k = keep[i] > .5;
      if (k && !hr) continue; // ใบหน้า/ผ้าคลุมศีรษะ/มือที่อยู่หน้าชุด ไม่ใช่ส่วนที่ชุดคลุม (มือจัดการแยก)
      const dx = x - N.x, dy = y - N.y, u = (dx * cs + dy * sn) / s, v = (-dx * sn + dy * cs) / s, au = Math.abs(u);
      // matte ติดฉากด้านข้าง (ธง/เสา): โมเดลแยกส่วนบอกว่าไม่ใช่คน — ใช้เฉพาะนอกแนวลำตัว (โมเดลพลาดบนผ้าสีเข้มกลางตัวได้)
      if (pp && pp[i] < .2 && au > 1.3) continue;
      // เหนือแนวไหล่ — ยกเว้นตัวคนข้างคอที่ไม่ใช่ผม (ปกเสื้อเดิมตั้งสูง): ถ้าไม่คลุมจะเห็นฉากหลังเป็นรูระหว่างผมกับคอเสื้อ
      if (au > nw + .06 && v < shoulderTop(u, side) - .07 && !(au < .6 && v > shoulderTop(u, side) - .17 && !hr && a > .5 && y > face.chinY) && !(au < .62 && v > shoulderTop(u, side) - .25 && !hr && a > .5 && y > face.chinY && hairOut(x, y, u < 0 ? -1 : 1)) && !(au < 1.7 && v > shoulderTop(u, side) - .4 && !hr && a > .5 && y > face.chinY && hairAbove(x, y))) continue;
      if (au <= nw + .06 && v < -.45) continue;
      const env = 1.68 - .1 * smooth((v - 1.0) / 1.5); if (au > env) continue; // กว้างเกินคน (ชุดอวกาศ/หมวกที่ถือ ไม่ทำให้ชุดพองเป็นถุง)
      if (hr && (au > 1.62 || a < .5)) continue; // ผมยาวที่ตกนอกไหล่: ไม่มีชุดใต้ผม
      on[y * W + x] = 1;
    }
    // แกนลำตัวขั้นต่ำ (|u| < 1.0 ใต้แนวไหล่ ลงถึงขอบล่าง): ลำตัวคนต้องมีอยู่จริงแม้ matte หาย (ผ้าคลุมไหล่/ขนสัตว์สีดำบนฉากมืด)
    for (let y = Math.max(yTop, Math.round(N.y)); y < H; y++) for (let x = Math.max(0, Math.round(N.x - s * 1.2)); x <= Math.min(W - 1, Math.round(N.x + s * 1.2)); x++) {
      const dx = x - N.x, dy = y - N.y, u = (dx * cs + dy * sn) / s, v = (-dx * sn + dy * cs) / s;
      if (Math.abs(u) < 1.0 && v > Math.max(.15, shoulderTop(u, side) + .05) && !(keep[y * W + x] > .5 && hair[y * W + x] < .3)) on[y * W + x] = 1;
    }
    const r1 = Math.max(1, Math.round(s * .04)), r2 = Math.max(1, Math.round(s * .06));
    on = closeR(on, W, H, r1);
    // รูใหญ่กลางลำตัว (เชิ้ตขาว/เสื้อในที่ matte พลาด) ก็เติม — ช่องว่างจริงระหว่างแขนกับลำตัวอยู่ด้านข้าง (|u| > 0.8)
    // + ช่องที่เปิดออกขอบล่างของภาพ (ระหว่างหมวกที่ถือ/ถุงมือกับลำตัว) — ไม่ทำให้ชายชุดเป็นหยัก/หนวด
    const midHole = comp => { let su = 0, bot = false, x0 = W, x1 = 0; for (const i of comp) { const x = i % W, dx = x - N.x, dy = ((i / W) | 0) - N.y; su += (dx * cs + dy * sn) / s; if (i >= (H - 1) * W) bot = true; if (x < x0) x0 = x; if (x > x1) x1 = x; } return (bot && x1 - x0 < s * .7) || Math.abs(su / comp.length) < .8; };
    on = fillHoles(on, W, H, Math.round((s * .5) ** 2), midHole);
    on = openR(on, W, H, r2);
    // หัวไหล่มน (ไม่เป็นมุมกล่องจากบ่าเสริมของสูทเดิม): เปิดด้วยรัศมีใหญ่เฉพาะช่วงไหล่ด้านนอก
    {
      const big = openR(on, W, H, Math.max(2, Math.round(s * .09)));
      for (let y = yTop; y < Math.min(H, Math.round(N.y + s * 1.3)); y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!on[i] || big[i]) continue;
        const dx = x - N.x, dy = y - N.y, u = (dx * cs + dy * sn) / s; if (Math.abs(u) > .75) on[i] = 0;
      }
    }
    // ก้อนหลัก: ต่อกับลำตัวใต้โคนคอ
    on = componentFrom(on, W, H, { x0: N.x - s * .5, x1: N.x + s * .5, y0: N.y + s * .3, y1: N.y + s * 1.2 });
    // ด้านข้างของชุดเรียบตามแนวตั้ง (ผ้าทิ้งตัว): ขอบซ้าย/ขวารายแถว (ใต้รักแร้) -> median + เฉลี่ยตามแนวตั้ง แล้วเติมช่วงระหว่างขอบ
    // ยกเว้นช่องว่างจริงขนาดใหญ่ระหว่างแขนกับลำตัว (รูที่ไม่ถูกเติมข้างบน) — ไม่มีชายเสื้อ/ข้างเสื้อเป็นคลื่นตามเศษ matte
    {
      const yA = Math.max(yTop, Math.round(N.y + s * .95)), rows = H - yA;
      if (rows > 8) {
        const Ls = new Float32Array(rows).fill(NaN), Rs = new Float32Array(rows).fill(NaN);
        for (let y = yA; y < H; y++) { let l = -1, r = -1; for (let x = 0; x < W; x++) if (on[y * W + x]) { if (l < 0) l = x; r = x; } if (l >= 0) { Ls[y - yA] = l; Rs[y - yA] = r; } }
        const med = (A, k) => { const o = new Float32Array(A.length).fill(NaN); for (let j = 0; j < A.length; j++) { if (isNaN(A[j])) continue; const w = []; for (let q = Math.max(0, j - k); q <= Math.min(A.length - 1, j + k); q++) if (!isNaN(A[q])) w.push(A[q]); w.sort((a, b) => a - b); o[j] = w[w.length >> 1]; } return o; };
        const avg = (A, k) => { const o = new Float32Array(A.length).fill(NaN); for (let j = 0; j < A.length; j++) { if (isNaN(A[j])) continue; let t = 0, c = 0; for (let q = Math.max(0, j - k); q <= Math.min(A.length - 1, j + k); q++) if (!isNaN(A[q])) { t += A[q]; c++; } o[j] = t / c; } return o; };
        const km = Math.max(2, Math.round(s * .35)), ka = Math.max(1, Math.round(s * .12));
        const L2 = avg(med(Ls, km), ka), R2 = avg(med(Rs, km), ka);
        const holes = new Uint8Array(n); { const filled = fillHoles(on, W, H, n); for (let i = yA * W; i < n; i++) holes[i] = filled[i] && !on[i] ? 1 : 0; }
        for (let y = yA; y < H; y++) {
          const j = y - yA; if (isNaN(L2[j])) continue;
          const t = smooth((y - yA) / Math.max(1, s * .35)); // ต่อจากช่วงไหล่แบบนุ่ม
          const l = Math.round(Ls[j] + (L2[j] - Ls[j]) * t), r = Math.round(Rs[j] + (R2[j] - Rs[j]) * t);
          for (let x = 0; x < W; x++) { const i = y * W + x; on[i] = x >= l && x <= r && !holes[i] ? 1 : 0; }
        }
      }
    }
    // ชายล่าง: คอลัมน์ที่มีชุดภายใน 4% ของความสูงจากขอบล่าง -> ยาวถึงขอบภาพ (ไม่มีชายเสื้อหยัก/ลอย)
    const yb = Math.max(yTop, H - 1 - Math.max(2, Math.round(H * .04)));
    for (let x = 0; x < W; x++) { let last = -1; for (let y = yb; y < H; y++) if (on[y * W + x]) last = y; if (last >= 0) for (let y = last; y < H; y++) on[y * W + x] = 1; }
    // เกลาเส้นขอบ: เบลอแล้วตัดที่ 0.5 (ความโค้งเรียบ) แล้วขอบนุ่ม ~1 พิกเซล
    const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = on[i];
    const rs = Math.max(1, Math.round(s * .025)), b = blur3Rows(f, W, H, rs, yTop), sm = new Float32Array(n);
    for (let i = 0; i < n; i++) sm[i] = b[i] > .5 ? 1 : 0;
    const clip = blur3Rows(sm, W, H, 1, yTop);
    for (let i = 0; i < n; i++) clip[i] = clamp01((clip[i] - .5) * 1.4 + .5);
    const ins = new Uint8Array(n); for (let i = 0; i < n; i++) ins[i] = clip[i] > .5 ? 1 : 0;
    const d = edt(ins, W, H, { l: false, r: false, t: true, b: false }), R = s * .3, form = new Float32Array(n);
    for (let i = 0; i < n; i++) { if (!ins[i]) continue; const t = Math.min(1, d[i] / R); form[i] = .3 * Math.sqrt(1 - (1 - t) * (1 - t)); }
    return { clip, form: blur3Rows(form, W, H, Math.max(2, Math.round(s * .04)), yTop) };
  }

  /** มือ (ก้อน > .5) ที่มีส่วนใดอยู่ห่างจากชุด (clip > .5) ไม่เกิน r พิกเซล — ก้อนที่ลอยนอกชุดถูกตัดทิ้ง (คืน Float32Array หรือ null) */
  function handsNearGarment(hands, clip, W, H, r) {
    const n = W * H, on = new Uint8Array(n); for (let i = 0; i < n; i++) on[i] = clip[i] > .5 ? 1 : 0;
    const near = dilateR(on, W, H, r), lab = new Int32Array(n).fill(-1), out = new Float32Array(n); let any = false;
    for (let s0 = 0; s0 < n; s0++) {
      if (hands[s0] <= .5 || lab[s0] >= 0) continue;
      const st = [s0], comp = []; lab[s0] = s0; let tn = 0;
      while (st.length) { const i = st.pop(), x = i % W; comp.push(i); if (near[i]) tn++; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && hands[j] > .5 && lab[j] < 0) { lab[j] = s0; st.push(j); } }
      // ต้องอยู่บน/ติดชุดอย่างน้อย 35% ของก้อน (มือที่วางบนตัว/ปลายแขนเสื้อ) — มือที่ยื่นออกไปถือวัตถุนอกลำตัวถูกตัด
      if (tn >= comp.length * .35 && comp.length >= r * r * 2) { any = true; for (const i of comp) out[i] = 1; }
    }
    if (!any) return null;
    // ส่วนที่ยื่นออกไปไกลจากชุดมาก (> 2.5r — ปลายถุงมือ/วัตถุที่ถือ) ตัดออก; ส่วนที่ติดชุดคงไว้ทั้งหมด
    const keepNear = dilateR(Uint8Array.from(out, v => v > 0 ? 1 : 0), W, H, 2), far = dilateR(on, W, H, Math.max(2, Math.round(r * .4)));
    for (let i = 0; i < n; i++) out[i] = keepNear[i] && far[i] ? hands[i] : 0;
    return out;
  }
  /**
   * โครงแขน (หน่วยมาตรฐานของชุด: N = โคนคอ, u = ข้าง, v = ลง) จากเงาชุด clip + มือที่เห็น (hands)
   *  ไหล่ (v 0.35) → ศอก (v ~2.5, ชิดขอบนอกของเงาตัว) → ข้อมือ: ถ้าเห็นมือ แขนท่อนล่างชี้จากศอกไปข้อมือ (ปลายก้อนมือฝั่งศอก)
   *  มือที่อยู่สูงกว่าศอกและออกด้านข้าง (กอดอก) มาจากศอกฝั่งตรงข้าม; มือต่ำ (ประสานมือ/วางบนโต๊ะ) มาจากศอกฝั่งเดียวกัน
   *  ไม่เห็นมือ: แขนตกตรงลงถึงขอบภาพ
   * คืน [{side, S, E, Wr, w:[ไหล่, ศอก, ข้อมือ], hand, d:{u,v} ทิศแขนท่อนล่าง}] เรียงลำดับการวาด (แขนที่อยู่บนสุดวาดท้าย)
   */
  function armModel(clip, hands, W, H, fit, face) {
    const cs = Math.cos(fit.theta || 0), sn = Math.sin(fit.theta || 0), s = fit.s, N = fit.N;
    const toI = (u, v) => ({ x: N.x + s * (cs * u - sn * v), y: N.y + s * (sn * u + cs * v) });
    const toC = (x, y) => { const dx = x - N.x, dy = y - N.y; return { u: (dx * cs + dy * sn) / s, v: (-dx * sn + dy * cs) / s }; };
    const at = (u, v) => { const p = toI(u, v), x = Math.round(p.x), y = Math.round(p.y); return x >= 0 && y >= 0 && x < W && y < H ? clip[y * W + x] : -1; };
    // ขอบนอกของเงาตัวที่ระดับ v (เดินออกจากแกนกลาง) — null ถ้าล้นขอบภาพ/ไม่มีตัว
    const edgeU = (sd, v) => { let last = null; for (let u = 0; u <= 2.3; u += .5 / s + .004) { const a = at(sd * u, v); if (a < 0) return last == null ? null : { u: last, cropped: true }; if (a > .5) last = u; } return last == null ? null : { u: last, cropped: false }; };
    const vBot = toC(N.x, H - 1).v;
    // ภาพครอปชิด (ขอบล่างของภาพอยู่เหนือระดับศอก): แขนส่วนใหญ่อยู่นอกภาพ — ไม่สร้างโครงแขน (ใช้ตะเข็บแขนมาตรฐาน)
    if (vBot < 2.2) return [];
    const arms = [];
    for (const sd of [-1, 1]) {
      const e7 = edgeU(sd, .75), uS = clamp(e7 ? e7.u - .3 : 1.25, .72, 1.5), vE = Math.min(2.55, vBot - .1);
      const eE = edgeU(sd, vE), uE = clamp(eE ? eE.u - .28 : uS, .72, 1.75);
      arms.push({ side: sd, S: { u: sd * uS, v: .35 }, E: { u: sd * uE, v: vE }, Wr: { u: sd * (uE - .05), v: vBot + .6 }, w: [.52, .46, .4], hand: false, d: { u: 0, v: 1 }, order: 0 });
    }
    if (hands) {
      // ก้อนมือ (4-connected, ค่า > .5) ในพิกัดมาตรฐาน
      const n = W * H, lab = new Int32Array(n).fill(-1), comps = [];
      for (let s0 = 0; s0 < n; s0++) {
        if (hands[s0] <= .5 || lab[s0] >= 0) continue;
        const st = [s0], pts = []; lab[s0] = s0;
        while (st.length) { const i = st.pop(), x = i % W; pts.push(i); for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && hands[j] > .5 && lab[j] < 0) { lab[j] = s0; st.push(j); } }
        if (pts.length >= s * s * .03) comps.push(pts.map(i => toC(i % W, (i / W) | 0)));
      }
      comps.sort((a, b) => b.length - a.length);
      const used = {};
      const hs = comps.slice(0, 2).map(P => { const c = P.reduce((q, p) => ({ u: q.u + p.u / P.length, v: q.v + p.v / P.length }), { u: 0, v: 0 }); return { P, c }; });
      for (const h of hs) {
        let sd = Math.abs(h.c.u) < .12 ? 0 : Math.sign(h.c.u);
        const vE = arms[0].E.v;
        if (sd && h.c.v < vE - .15 && Math.abs(h.c.u) > .45) sd = -sd; // กอดอก: มือวางบนแขนอีกข้าง
        if (!sd) sd = used[-1] ? 1 : used[1] ? -1 : (hs.length > 1 && hs.find(q => q !== h).c.u < h.c.u ? 1 : -1);
        if (used[sd]) sd = -sd; if (used[sd]) continue;
        used[sd] = 1; h.sd = sd;
      }
      for (const h of hs) {
        if (!h.sd) continue;
        const A = arms[h.sd < 0 ? 0 : 1], E = A.E, du = h.c.u - E.u, dv = h.c.v - E.v, L = Math.hypot(du, dv) || 1, d = { u: du / L, v: dv / L };
        const t = h.P.map(p => (p.u - E.u) * d.u + (p.v - E.v) * d.v), tMin = Math.min(...t), tMax = Math.max(...t), lim = tMin + (tMax - tMin) * .15;
        let wu = 0, wv = 0, c = 0, pmin = 1e9, pmax = -1e9;
        h.P.forEach((p, k) => { if (t[k] > lim) return; wu += p.u; wv += p.v; c++; const q = -(p.u - E.u) * d.v + (p.v - E.v) * d.u; if (q < pmin) pmin = q; if (q > pmax) pmax = q; });
        const Wr = { u: wu / c + d.u * .05, v: wv / c + d.v * .05 }, fl = Math.hypot(Wr.u - E.u, Wr.v - E.v);
        if (fl < .35 || fl > 2.8) continue;
        A.Wr = Wr; A.d = d; A.hand = true; A.w = [.52, .46, clamp((pmax - pmin) * 1.05, .3, .44)]; A.order = 2 - h.c.v * .1;
      }
      for (const A of arms) if (!A.hand) A.order = -1;
    }
    return arms.sort((a, b) => a.order - b.order);
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

  /**
   * มือ/แขนเปลือย (วางหน้าชุดใหม่): ผิวกาย (parser) ต่ำกว่าคาง 0.9 หน้า เป็นก้อน ๆ
   *  - ตัดก้อนที่ต่อขึ้นไปถึงแนวเริ่ม (y0) ใกล้แกนกลาง = ผิวอกในคอวีลึก (ต้องถูกชุดใหม่คลุม ไม่ใช่ "มือ")
   *  - ตัดก้อนเล็กกว่า 2% ของ (ความกว้างหน้า)² (จุดผิวที่ทายผิดบนเสื้อเดิม)
   * คืน Float32Array (0..1) หรือ null
   */
  function handsMask(rgba, alpha, skinP, W, H, face, { mono = false } = {}) {
    const n = W * H, fw = face.fw, cx = face.chinX != null ? face.chinX : face.cx, y0 = Math.max(0, Math.round(face.chinY + fw * .9));
    const v = new Float32Array(n), on = new Uint8Array(n);
    for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, k = smooth((skinP[i] - .4) / .3) * smooth((y - y0) / (fw * .15)) * (alpha[i] > .3 ? 1 : 0);
      if (k > 0 && (mono || skinLikelihood(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) > .15)) { v[i] = k; if (k > .3) on[i] = 1; }
    }
    let faceLab = null; { let a = 0, b = 0, c = 0; for (let y = Math.round(face.eyeY); y < Math.round(face.chinY); y += 2) for (let x = Math.round(cx - fw * .25); x < cx + fw * .25; x += 2) { if (x < 0 || x >= W || y < 0 || y >= H) continue; const i = y * W + x; if (skinLikelihood(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) < .3) continue; const q = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); a += q[1]; b += q[2]; c++; } if (c > 30) faceLab = [0, a / c, b / c]; }
    const lab = new Int32Array(n).fill(-1), st = [], keepC = new Uint8Array(n); let any = false;
    for (let s0 = y0 * W; s0 < n; s0++) {
      if (!on[s0] || lab[s0] >= 0) continue;
      const comp = []; lab[s0] = s0; st.push(s0); let top = H, topX = 0, bx0 = W, bx1 = 0, by1 = 0, sx = 0;
      while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; comp.push(i); sx += x; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y > by1) by1 = y; if (y < top) { top = y; topX = x; } for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= y0 * W && j < n && on[j] && lab[j] < 0) { lab[j] = s0; st.push(j); } }
      const chest = top <= y0 + Math.max(2, fw * .2) && Math.abs(topX - cx) < fw * .7;
      // แถบแนวตั้งกลางอก (เสื้อในสีเนื้อ/ผิวในช่องเสื้อเปิด) ไม่ใช่มือ: มือเป็นก้อนกว้าง ไม่ใช่แถบยาวตรงกลางลำตัว
      const strip = Math.abs(sx / comp.length - cx) < fw * .45 && (by1 - top) > (bx1 - bx0) * 1.3;
      // สีต้องใกล้ผิวหน้าของคนเดียวกัน (แถบสีแดง/ส้มของชุดเดิมที่ผ่านเกณฑ์ "สีผิว" ไม่ใช่มือ) — ภาพขาวดำข้าม
      let far = false;
      if (faceLab && !mono) { let a = 0, b = 0, c = 0; for (let k = 0; k < comp.length; k += 5) { const i = comp[k], q = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); a += q[1]; b += q[2]; c++; } far = Math.hypot(a / c - faceLab[1], b / c - faceLab[2]) > 20; }
      if (chest || strip || far || comp.length < fw * fw * .02) continue;
      for (const i of comp) keepC[i] = 1; any = true;
    }
    if (!any) return null;
    const near = dilate01(keepC, W, H, Math.max(2, Math.round(fw * .03)), y0);
    for (let i = 0; i < n; i++) v[i] *= near[i];
    return v;
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
  function contourSlivers(keep, neck, hair, body, Fo, W, H, face, hwx = null) {
    const fw = face.fw, x0 = Math.max(0, Math.floor(face.cx - fw * 1.3)), x1 = Math.min(W, Math.ceil(face.cx + fw * 1.3)), y0 = Math.max(0, Math.floor(face.eyeY)), y1 = Math.min(H, Math.ceil(face.chinY + fw * .9));
    const bw = x1 - x0, bh = y1 - y0; if (bw < 4 || bh < 4) return 0;
    const on = new Uint8Array(bw * bh), fo = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = (y + y0) * W + x + x0; on[y * bw + x] = keep[i] > .5 ? 1 : 0; fo[y * bw + x] = Fo[i] ? 1 : 0; }
    const r = Math.max(1, Math.round(fw * .015)), op = dilateR(erodeR(on, bw, bh, r, { l: false, r: false, t: false, b: false }), bw, bh, r + 1), near = dilateR(fo, bw, bh, Math.round(fw * .12));
    const kill = new Uint8Array(bw * bh);
    for (let k = 0; k < bw * bh; k++) if (on[k] && !op[k] && !fo[k] && near[k]) kill[k] = 1;
    // ก้อนเล็กที่อยู่นอกโครงหน้า (หลัง opening แล้ว) — เศษข้างหู/ขอบกราม
    const rest = new Uint8Array(bw * bh); for (let k = 0; k < bw * bh; k++) rest[k] = on[k] && !kill[k] && !fo[k] ? 1 : 0;
    const seen = new Uint8Array(bw * bh), lim = fw * fw * .01;
    for (let s0 = 0; s0 < bw * bh; s0++) {
      if (!rest[s0] || seen[s0]) continue; const st = [s0], comp = []; seen[s0] = 1; let touchFace = false;
      while (st.length) { const k = st.pop(), x = k % bw; comp.push(k); for (const j of [x > 0 ? k - 1 : -1, x < bw - 1 ? k + 1 : -1, k - bw, k + bw]) { if (j < 0 || j >= bw * bh) continue; if (fo[j] && on[j]) touchFace = true; if (rest[j] && !seen[j]) { seen[j] = 1; st.push(j); } } }
      // ต่อกับหน้าเพียงเล็กน้อย/ไม่ต่อ และเล็ก = เศษ (ผมก้อนใหญ่/หู ต่อกับผมด้านบน จึงใหญ่กว่าเกณฑ์)
      if (comp.length < lim && comp.some(k => near[k])) for (const k of comp) kill[k] = 1;
      else if (!touchFace && comp.length < lim * 2 && comp.every(k => near[k])) for (const k of comp) kill[k] = 1;
    }
    let c = 0;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const k = y * bw + x; if (!kill[k]) continue; const i = (y + y0) * W + x + x0; if (hwx && hwx[i] > .1) continue; // ผ้าคลุมศีรษะ: ชายผ้าบางไม่ใช่เศษ
      body[i] = Math.min(1, body[i] + keep[i]); keep[i] = 0; hair[i] = 0; c++;
    }
    // ขอบจาง ๆ รอบส่วนที่ตัด (keep < .5) ไม่ทิ้งเป็นเส้นบาง
    for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) {
      const k = y * bw + x, i = (y + y0) * W + x + x0; if (on[k] || fo[k] || keep[i] <= 0) continue;
      if (kill[k - 1] || kill[k + 1] || kill[k - bw] || kill[k + bw]) { body[i] = Math.min(1, body[i] + keep[i]); keep[i] = 0; hair[i] = 0; }
    }
    return c;
  }
  function personLayers(rgba, alpha, W, H, face, P, crop = null) {
    const n = W * H, jy = jawCurve(face), keep = new Float32Array(n), neck = new Float32Array(n), hair = new Float32Array(n), body = new Float32Array(n);
    // โครงหน้าตาม landmark (กราม + คิ้วยกขึ้น) ขยาย 3% — ผิวนอกโครงนี้ที่ต่ำกว่าระดับติ่งหู = ด้านข้างคอในเงา ไม่ใช่ใบหน้า
    let Fo = null; const cxF = face.chinX != null ? face.chinX : face.cx;
    if (face.P && face.P.length >= 68) {
      const Pp = face.P, eyeMid = { x: (Pp[36].x + Pp[45].x) / 2, y: (Pp[36].y + Pp[45].y) / 2 }, fh = Math.hypot(Pp[8].x - eyeMid.x, Pp[8].y - eyeMid.y);
      Fo = new Float32Array(n); fillPoly(Fo, W, H, grow([...Pp.slice(0, 17), ...Pp.slice(17, 27).reverse().map(p => ({ x: p.x, y: p.y - fh * .3 }))], 1.03), 1);
    }
    // ผิวใต้กราม: กลางคางต้องเป็นสีผิว (เคราคงไว้); ข้างกรามรวมผิวในเงา (มืด อิ่มตัวต่ำ) — ผ้า/ลายสีอื่น (ผ้าคลุม) ไม่ตัด
    // มีผ้าคลุมศีรษะ (ฮิญาบ) คลุมข้างกราม: ไม่ใช้กฎตัดใต้กราม (ชายผ้าสีเข้ม/ลายสีผิวถูกตัดเป็นรูขาว)
    let hasHw = false; if (P.hwx) { let c = 0; for (let i = 0; i < n; i += 3) if (P.hwx[i] > .5) c += 3; hasHw = c > face.fw * face.fw * .05; }
    const jawSkin = (i, side) => { const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], sl = skinLikelihood(r, g, b); if (sl > .4) return true; if (!side) return false; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx < 90 && mx - mn < 40 && r >= b - 6; };
    // ใต้ "กรามล่าง" เท่านั้น: จุดกรามที่ใกล้ที่สุดเป็น P4–P12 (ใต้คาง/มุมกราม) — ข้างกรามบน (P0–3, P13–16 ติดหู) ไม่ตัด
    // ตัดตามแนวตั้งเดิมทำให้ผิวระหว่างแก้มกับหูหายเป็นร่อง หูกลายเป็น "แผ่นห้อย" แยกจากหน้า (r05) หรือติ่งหูถูกตัดเป็นเส้นตรง (r18)
    const underLowerJaw = (x, y) => { const Pj = face.P; let bi = 0, bd = 1e18; for (let k = 0; k < 17; k++) { const d = (Pj[k].x - x) ** 2 + (Pj[k].y - y) ** 2; if (d < bd) { bd = d; bi = k; } } return bi >= 4 && bi <= 12 && y > jy(x) + face.fw * .02; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let h, hr, nk;
      if (!crop || inCrop(crop, x, y)) { h = P.head[i]; hr = P.hair[i]; nk = P.neck[i]; }
      else { const above = y < jy(x); h = above ? 1 : 0; hr = 0; nk = 0; }
      // ใต้แนวคาง ส่วนที่วางหน้าชุดมีได้เฉพาะผม (กันจุดสีเสื้อเดิมที่โมเดลทายผิดเป็น "ผิว" โผล่บนชุด)
      // ใต้คาง: เฉพาะผ้าคลุมศีรษะที่ยืนยันแล้ว — และเครา (ศีรษะที่ไม่ใช่สีผิว ใกล้กลางคาง) ลงได้ถึง 0.75 หน้า (ไม่ตัดเคราเป็นเส้นตรง)
      if (y > Math.max(jy(x), face.chinY) + face.fw * (Math.abs(x - (face.chinX != null ? face.chinX : face.cx)) < face.fw * .45 && skinLikelihood(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) < .3 ? .75 : .45)) h = P.hwx ? P.hwx[i] : 0;
      // ผิวใต้แนวกราม (ตาม landmark) คือคอในเงา ไม่ใช่ใบหน้า -> ไปชั้นคอ (หลังชุด) — ยกเว้นเครื่องประดับ (ต่างหู)
      // เฉพาะแนวคอ (|dx| < ~0.37 หน้า ไล่นุ่ม): ข้างกราม/ใต้หูคงเป็นศีรษะ — ไม่มีขอบตัดตรงแนวตั้งบนผม/แก้มที่ปลายกราม
      else if (face.P && x > face.P[2].x && x < face.P[14].x && y > jy(x) + face.fw * .1 && !(P.acc && P.acc[i] > .3) && !(P.hwx && P.hwx[i] > .5)) { const wN = 1 - smooth((Math.abs(x - (face.chinX != null ? face.chinX : face.cx)) - face.fw * .32) / (face.fw * .1)); nk = Math.max(nk, h * wN * (P.cloth && P.cloth[i] > h ? 0 : 1)); h *= 1 - wN; }
      // ผิวข้างกรามใต้แนว landmark (นอกแถบคอ) = ด้านข้างคอในเงา ไม่ใช่ใบหน้า — ตัดออก ให้ขอบหน้าโค้งตามกราม (ไม่ใช่ขอบล่างแบนกว้าง + บากเป็นขั้นที่ปลายกราม)
      if (Fo && !hasHw && h > 0 && !Fo[i] && y > face.eyeY && underLowerJaw(x, y) && y < face.chinY + face.fw * .6 && Math.abs(x - cxF) < face.fw * .8 && hr < .15 && !(P.acc && P.acc[i] > .3) && !(P.hwx && P.hwx[i] > .1) && jawSkin(i, Math.abs(x - cxF) > face.fw * .42)) h = 0; // ข้างกราม: ตัดทั้งผิวในเงา; กลางคาง: เฉพาะผิว (เคราคงไว้)
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
    // เศษบาง/เกาะเล็กติดขอบหน้า (เส้นขาวข้างกราม เศษข้างหู): นอกโครงหน้า ต่ำกว่าระดับตา — ตัดส่วนที่หายไปเมื่อ opening รัศมี 1.5% หน้า และก้อนเล็ก < 0.01 fw²
    if (Fo) contourSlivers(keep, neck, hair, body, Fo, W, H, face, P.hwx || null);
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
      // เอียงได้เฉพาะเมื่อเห็นไหล่ทั้งสองข้าง ข้างละ ≥ 2 จุด (ภาพครอปชิด/จุดเดียวข้างหนึ่ง ทำให้มุมเพี้ยนถึงขีดจำกัด)
      const both = S.filter(p => p.sd < 0).length >= 2 && S.filter(p => p.sd > 0).length >= 2;
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
    const theta = clamp(Math.atan(b), -.22, .22);
    a = clamp(a, chinY + fw * .35, chinY + fw * .8); // แนวไหล่ต่ำกว่าคางอย่างน้อย 0.35 หน้า (ไม่เป็น 'หัวโต' ไหล่ชิดคาง); โคนคอไม่ต่ำกว่าคาง 0.8 หน้า (ปกชุดอวกาศ/บ่าเสริมใหญ่ ไม่ทำให้คอยาวผิดจริง)
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
    const rawWidth = width;
    // กว้างเกินคนมาก (> 3.8 หน้า: ชุดอวกาศ/เสื้อคลุมหนา) — ไหล่จริงอยู่ข้างใน ใช้ความกว้างปกติแทนขีดบน (ชุดใหม่ไม่บวม)
    if (width > 3.8 * fw && !cropped) width = 3.0 * fw;
    width = clamp(width, SHOULDER_PRIOR.lo * fw, SHOULDER_PRIOR.hi * fw);
    const s = width / C.width, cs = Math.cos(theta), sn = Math.sin(theta);
    const yl = a + Math.tan(theta) * (xc - cx);
    const N = { x: xc + sn * C.lineY * s, y: yl - cs * C.lineY * s };
    const map = p => ({ x: N.x + s * (cs * p.x - sn * p.y), y: N.y + s * (sn * p.x + cs * p.y) });
    return { N, s, theta, width, measured, cropped, l: map(C.L), r: map(C.R), chin: { ...N }, samples, line: { a, b }, side: sideOffsets(samples, N, s, theta), rawWidth };
  }
  /**
   * ค่าชดเชยแนวไหล่รายข้าง (หน่วยมาตรฐาน) จากจุดขอบบนของไหล่ที่วัดได้: residual = v_จริง - shoulderTop(u) ต่อข้าง
   * fit c0 + c1·(|u| - 1) (≥ 2 จุด) หรือ c0 อย่างเดียว (1 จุด); ข้างที่ผมบังทั้งหมดใช้ค่าความลาดของอีกข้าง (ไหล่คนสมมาตรโดยประมาณ)
   * คืน {l:[c0,c1], r:[c0,c1]} (จำกัด |c0| ≤ 0.2, |c1| ≤ 0.25)
   */
  function sideOffsets(samples, N, s, theta) {
    const cs = Math.cos(theta), sn = Math.sin(theta), per = { l: [], r: [] };
    for (const p of samples || []) { const dx = p.x - N.x, dy = p.y - N.y, u = (dx * cs + dy * sn) / s, v = (-dx * sn + dy * cs) / s; if (Math.abs(u) < .5) continue; per[u < 0 ? "l" : "r"].push({ a: Math.abs(u) - 1, r: v - shoulderTop(u) }); }
    const fit1 = P => {
      if (!P.length) return null;
      const ma = P.reduce((q, p) => q + p.a, 0) / P.length, mr = P.reduce((q, p) => q + p.r, 0) / P.length;
      let sxx = 0, sxy = 0; for (const p of P) { sxx += (p.a - ma) ** 2; sxy += (p.a - ma) * (p.r - mr); }
      const c1 = P.length >= 2 && sxx > 1e-4 ? clamp(sxy / sxx, -.25, .25) : 0;
      return [clamp(mr - c1 * ma, -.2, .2), c1];
    };
    let l = fit1(per.l), r = fit1(per.r);
    if (!l && r) l = [r[0], r[1]]; if (!r && l) r = [l[0], l[1]];
    return { l: l || [0, 0], r: r || [0, 0] };
  }
  /**
   * จุดยึดอัตโนมัติของเทมเพลตชุดจากรูปถ่าย (PNG พื้นใส: ชุดวางราบ/หุ่นล่องหน/ตัดจากรูปคน) จาก alpha ของชุด
   * คืนรายการ [{x, y, u, v, k}] — (x, y) ในภาพเทมเพลต, (u, v) ตำแหน่งในพิกัดมาตรฐานของตัวคน (N = โคนคอ, ไหล่กว้าง 3.0)
   *  neck  = ก้นช่องคอด้านหน้า (จุดต่ำสุดของขอบบนช่วงกลาง)      -> (0, -0.05)
   *  cl/cr = ปลายปกคอซ้าย/ขวา (จุดสูงสุดของขอบบนสองข้างช่องคอ)   -> (∓0.33, -0.22)
   *  l/r   = ปลายไหล่ (ขอบบนเริ่มชันลงเป็นแขนเสื้อ)              -> (∓1.45, 0.25)
   *  hl/hr = มุมชายเสื้อ                                           -> (∓1.5, v ตามสัดส่วนจริงของเทมเพลต)
   * คืน null ถ้าไม่พบชุด
   */
  function templateAnchors(alpha, W, H) {
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha[y * W + x] > .5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0 || x1 - x0 < 8 || y1 - y0 < 8) return null;
    const Wg = x1 - x0 + 1, Hg = y1 - y0 + 1, top = new Float32Array(W).fill(NaN);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (alpha[y * W + x] > .5) { top[x] = y; break; }
    // แกนกลาง: กึ่งกลางของแถวกว้างสุดในช่วงบน 35%
    let cx = (x0 + x1) / 2, bw = 0;
    for (let y = y0; y < y0 + Hg * .35; y++) { let a = -1, b = -1; for (let x = x0; x <= x1; x++) if (alpha[y * W + x] > .5) { if (a < 0) a = x; b = x; } if (a >= 0 && b - a > bw) { bw = b - a; cx = (a + b) / 2; } }
    const T = x => { x = clamp(Math.round(x), x0, x1); return isNaN(top[x]) ? y1 : top[x]; };
    // ช่องคอ: จุดลึกสุดของขอบบนในช่วงกลาง ±0.15 ความกว้าง
    let nx = cx, ny = -1; for (let x = Math.round(cx - Wg * .15); x <= Math.round(cx + Wg * .15); x++) { const t = T(x); if (t > ny) { ny = t; nx = x; } }
    // ปลายปกคอ: จุดสูงสุดของขอบบนระหว่างช่องคอถึง 0.3 ความกว้างออกไป
    const peak = sd => { let bx = nx, by = Infinity; for (let k = 1; k < Wg * .3; k++) { const x = nx + sd * k, t = T(x); if (t < by) { by = t; bx = x; } } return { x: bx, y: by }; };
    const cl = peak(-1), cr = peak(1);
    // ปลายไหล่: เดินออกจากปลายปก หาตำแหน่งแรกที่ขอบบนชัน (> 1.2 ต่อพิกเซล) หรือขอบนอกสุด
    const tip = (c, sd) => { const st = Math.max(2, Math.round(Wg * .01)); let x = c.x + sd * Wg * .12, last = { x: c.x, y: c.y }; while (sd < 0 ? x > x0 + st : x < x1 - st) { const a = T(x), b = T(x + sd * st); if (b - a > st * 1.2) return { x, y: a }; last = { x, y: a }; x += sd * st; } return last; };
    const l = tip(cl, -1), r = tip(cr, 1);
    const span = y => { let a = -1, b = -1; for (let x = x0; x <= x1; x++) if (alpha[y * W + x] > .5) { if (a < 0) a = x; b = x; } return { a, b }; };
    const yh = Math.max(y0, Math.round(y1 - Hg * .02)), hs = span(yh);
    const sc = Math.max(1, Math.hypot(r.x - l.x, r.y - l.y) / 2.9), hv = (yh - ny) / sc - .05;
    return [
      { k: "neck", x: nx, y: ny, u: 0, v: -.05 }, { k: "cl", x: cl.x, y: cl.y, u: -.33, v: -.22 }, { k: "cr", x: cr.x, y: cr.y, u: .33, v: -.22 },
      { k: "l", x: l.x, y: l.y, u: -1.45, v: .25 }, { k: "r", x: r.x, y: r.y, u: 1.45, v: .25 },
      { k: "hl", x: hs.a, y: yh, u: -1.5, v: hv }, { k: "hr", x: hs.b, y: yh, u: 1.5, v: hv }
    ];
  }
  /**
   * ฟังก์ชันย้อนกลับ (พิกัดภาพผลลัพธ์ -> พิกัดเทมเพลต) สำหรับดัดเทมเพลตลงตัวคนด้วย thin-plate spline:
   * จุดยึดแต่ละจุดมี (u, v) มาตรฐาน -> ตำแหน่งบนตัวคน = fit (N, s, theta) + ค่าชดเชยแนวไหล่รายข้าง (side) + ระดับคอเสื้อ (drop)
   * คืน { inv, targets }
   */
  function templateWarp(anchors, fit, { side = null, drop = 0, lambda = .02 } = {}) {
    const cs = Math.cos(fit.theta || 0), sn = Math.sin(fit.theta || 0), s = fit.s, N = fit.N;
    const targets = anchors.map(a => {
      let v = a.v; const au = Math.abs(a.u);
      if (side) { const c = a.u < 0 ? side.l : side.r; if (c) v += (c[0] + c[1] * (au - 1)) * smooth((au - .35) / .5); }
      if (au < .5 && a.v < .3) v += drop * (1 - smooth((au - .3) / .4));
      return { x: N.x + s * (cs * a.u - sn * v), y: N.y + s * (sn * a.u + cs * v) };
    });
    const T = tpsFit(targets, anchors.map(a => ({ x: a.x, y: a.y })), lambda * s * s / 1e4);
    return { inv: (x, y) => T.map(x, y), targets };
  }
  /** จากจุดยึด 3 จุด (chin = โคนคอ N, l/r = บนไหล่) -> {N, s, theta} (ใช้กับจุดที่ผู้ใช้ลาก) */
  function fitFromTargets(T, canon = null) {
    const C = canon || { L: { x: -1.4, y: .24 }, R: { x: 1.4, y: .24 } };
    const d = Math.hypot(T.r.x - T.l.x, T.r.y - T.l.y), s = d / (C.R.x - C.L.x), theta = Math.atan2(T.r.y - T.l.y, T.r.x - T.l.x);
    return { N: { x: T.chin.x, y: T.chin.y }, s, theta };
  }

  /**
   * คอ (ชั้นหลังชุด) แบบรูปทรงเรขาคณิต: ทรงกระบอกจากใต้กราม (กึ่งกลางกราม) ลงไปกึ่งกลางคอเสื้อ (N) บานออกเป็นกล้ามเนื้อบ่าช่วงท้าย
   *  - ภายในรูปทรงเท่านั้น (ไม่มี "กล่อง" ผิวด้านข้างจากผล parsing ที่เป็นสี่เหลี่ยม/เงาฉาก)
   *  - ใช้ผิวคอจริงเฉพาะพิกเซลที่ parser บอกว่าเป็นคอ และสีใกล้ผิวหน้า (ในภาพสี: สี a*b* ใกล้; ความสว่างคลาดได้มากเพราะเงา)
   *    สร้อยคอ/เม็ดลูกปัด/ปกเสื้อเดิม (ไม่ใช่ผิว) ถูกแทนด้วยผิวที่สร้าง — ไม่มีเศษสร้อยค้างบนคอ
   *  - ผิวที่สร้าง: สีอ้างอิงรายแถวจากผิวคอจริง (หรือผิวหน้ามืดลงเมื่อไม่เห็นคอ) × เงาทรงกระบอก × เงาใต้คาง + grain
   * คืน { rgba, alpha, yb, lb, rb, yCollar }
   */
  // คอใต้หู (กล้ามเนื้อข้างคอ): ครึ่งความกว้าง = k × ระยะ P1–P15 (ระดับติ่งหู) เรียวลงสู่ขนาดคอปกติภายใน t × หน้า
  const WEAR = { k: .42, t: .7 };
  function synthNeck(person, alpha, neckS, keepS, W, H, face, fit, { skinRGB = null, noise = 1.5, seed = 5, hair = null, collarY = -.22, half = null, mono = false } = {}) {
    const n = W * H, fw = face.fw, P = face.P, jy = jawCurve(face), R = rng(seed);
    const rgba = new Uint8ClampedArray(n * 4), A = new Float32Array(n);
    const cs = Math.cos(fit.theta || 0), sn = Math.sin(fit.theta || 0), s = fit.s, drop = fit.drop || 0;
    // แกนคออยู่ใต้กะโหลก (กึ่งกลางระหว่างมุมกราม) ไม่ใช่ใต้ปลายคาง — หน้าหันข้าง คางเลื่อนไป แต่คอไม่เลื่อนตาม
    const cxJaw = P && P.length >= 17 ? (P[3].x + P[13].x) / 2 * .5 + P[8].x * .5 : (face.chinX != null ? face.chinX : face.cx);
    // ขอบบนของคอ: ใต้แนวกรามภายในช่วงกราม; นอกช่วงกราม (ใต้หู/หลังกราม) เริ่มที่ระดับคาง — ไม่มีแผ่นคอโผล่ข้างแก้ม/ใต้หู
    const jx0 = P && P.length >= 17 ? Math.min(P[4].x, P[12].x) : -1e9, jx1 = P && P.length >= 17 ? Math.max(P[4].x, P[12].x) : 1e9;
    // นอกช่วงกราม (ใต้หู): คอข้างเริ่มที่ระดับติ่งหู — อยู่ใต้ศีรษะ (keep) จึงเห็นเฉพาะช่องระหว่างหู/ผมกับบ่า (เดิมเป็นฉากโผล่ หูเหมือนแผ่นห้อย)
    const yLobe = P && P.length >= 17 ? Math.max(P[3].y, P[13].y) : face.chinY - fw * .12;
    const topAt = x => x >= jx0 && x <= jx1 ? Math.min(jy(x), face.chinY) - fw * .35 : Math.min(face.chinY - fw * .12, yLobe);
    const yCollar = fit.N.y + s * (collarY + drop + .3) * cs;
    const yEnd = Math.min(H - 1, Math.ceil(fit.N.y + s * (collarY + drop + .75) + Math.abs(sn) * fw * .8));
    const hTop = clamp(half || fw * .29, fw * .25, fw * .31), yS = Math.max(0, Math.floor(face.chinY - fw * .45)), fe = Math.max(1.5, fw * .02);
    const sk = skinRGB ? rgbToLab(skinRGB[0], skinRGB[1], skinRGB[2]) : [62, 14, 18];
    const yAng = P && P.length >= 17 ? (P[4].y + P[12].y) / 2 : face.chinY - fw * .2, wEar = P && P.length >= 17 ? Math.abs(P[15].x - P[1].x) * WEAR.k : 0, wEar0 = P && P.length >= 17 ? Math.abs(P[13].x - P[3].x) * .42 : 0;
    // ข้างที่ผมยาวบังข้างกราม: คอกว้างแบบเดิม (คอกว้างถึงใต้หูจะโผล่เป็นแผ่นเงาเข้มระหว่างปลายผมกับบ่า)
    const hairSide = sd => { if (!hair || !P || P.length < 17) return false; let c = 0, t = 0; const cxc = face.chinX != null ? face.chinX : face.cx; for (let y = Math.max(0, Math.round(yAng)); y < Math.min(H, Math.round(face.chinY)); y += 2) for (let d = fw * .3; d < fw * .7; d += 2) { const x = Math.round(cxc + sd * d); if (x < 0 || x >= W) continue; const i = y * W + x; t++; if (keepS[i] > .5 && hair[i] > .5) c++; } return t > 0 && c / t > .3; };
    const hairL = hairSide(-1), hairR = hairSide(1);
    const geom = y => {
      const t = clamp01((y - face.chinY) / Math.max(1, yEnd - face.chinY));
      // คอตั้งตรงเป็นหลัก: เลื่อนไปทางกลางคอเสื้อได้ไม่เกิน 0.12 หน้า (ไม่เป็นแถบคอเฉียงยาวเมื่อหน้าหันข้าง)
      // เรียวเล็กน้อยใต้คาง (0.9 เท่า) บานออกสู่บ่า — ไม่เป็นแท่งสี่เหลี่ยม
      const c = cxJaw + clamp(fit.N.x - cxJaw, -fw * .12, fw * .12) * smooth(t);
      let h = hTop * (.9 + .15 * smooth(t)) + fw * .06 * smooth((y - (yCollar - fw * .25)) / (fw * .4));
      // ช่วงบนใต้มุมกราม คอกว้างถึงใต้หู (กล้ามเนื้อข้างคอ) แล้วเรียวลงสู่ขนาดปกติภายใน 0.4 หน้า
      let h0 = h; if (wEar0 > h0) h0 += (wEar0 - h0) * (1 - smooth((y - yAng) / (fw * .4)));
      if (wEar > h) h += (wEar - h) * (1 - smooth((y - yAng) / (fw * WEAR.t)));
      return { c, h, h0 };
    };
    // ผิวคอจริงที่เชื่อได้: parser = คอ, สีใกล้ผิวหน้า, ไม่ใช่ผม
    const real = new Float32Array(n);
    for (let y = yS; y <= yEnd; y++) {
      const g = geom(y);
      for (let x = Math.max(0, Math.floor(g.c - g.h - fe * 2)); x <= Math.min(W - 1, Math.ceil(g.c + g.h + fe * 2)); x++) {
        const i = y * W + x, v = alpha[i] * neckS[i] * (hair ? 1 - hair[i] : 1); if (v <= .3) continue;
        const L = rgbToLab(person[i * 4], person[i * 4 + 1], person[i * 4 + 2]);
        const dC = mono ? 0 : Math.hypot(L[1] - sk[1], L[2] - sk[2]), dL = L[0] - sk[0];
        // ปกขาว/ฉากสว่างที่ทายเป็นคอ (สว่างกว่าผิวหน้ามาก) หรือสร้อยสีเข้ม (มืดกว่าผิวมาก) = ไม่ใช่ผิว
        // ภาพขาวดำ: แยกด้วยสีไม่ได้ — ยอมให้มืดกว่าผิวหน้าน้อยกว่า (เสื้อ/ปกเดิมสีเข้มไม่ถูกนับเป็นคอจริง)
        // ผิวเรียบ: ส่วนเบี่ยงเบนความสว่างเฉพาะที่ (5×5) ต่ำ — ผ้าทวีด/ลูกปัด/ลายเสื้อเดิม มีลายสูง ไม่ใช่ผิวคอ
        let s1 = 0, s2 = 0, sc = 0; for (let dy = -2; dy <= 2; dy += 2) for (let dx = -2; dx <= 2; dx += 2) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx, l = .299 * person[j * 4] + .587 * person[j * 4 + 1] + .114 * person[j * 4 + 2]; s1 += l; s2 += l * l; sc++; }
        const sdv = Math.sqrt(Math.max(0, s2 / sc - (s1 / sc) ** 2));
        const ok = (1 - smooth((dC - 14) / 10)) * (1 - smooth((dL - 12) / 10)) * (1 - smooth((-dL - (mono ? 16 : 30)) / (mono ? 8 : 12))) * (1 - smooth((sdv - 14) / 10));
        real[i] = v * ok;
      }
    }
    const realB = blur3Rows(real, W, H, Math.max(1, Math.round(fw * .012)), yS);
    // สีอ้างอิงรายแถว (ค่าเฉลี่ยผิวจริงในแถว เบลอตามแนวตั้ง); แถวที่ไม่เห็นคอใช้ค่าจากแถวที่ใกล้สุด
    const rows = yEnd - yS + 1, ref = [0, 1, 2].map(() => new Float32Array(rows)), wr = new Float32Array(rows);
    for (let y = yS; y <= yEnd; y++) {
      const g = geom(y); let t0 = 0, t1 = 0, t2 = 0, ws = 0;
      for (let x = Math.max(0, Math.floor(g.c - g.h)); x <= Math.min(W - 1, Math.ceil(g.c + g.h)); x++) { const i = y * W + x, w = real[i] > .6 ? 1 : 0; if (!w) continue; t0 += person[i * 4]; t1 += person[i * 4 + 1]; t2 += person[i * 4 + 2]; ws++; }
      const j = y - yS; if (ws >= g.h * .5) { ref[0][j] = t0 / ws; ref[1][j] = t1 / ws; ref[2][j] = t2 / ws; wr[j] = 1; }
    }
    let lastJ = -1; for (let j = 0; j < rows; j++) if (wr[j]) lastJ = j;
    let firstJ = -1; for (let j = 0; j < rows; j++) if (wr[j]) { firstJ = j; break; }
    // ไม่เห็นคอจริงเลย (คอเสื้อสูง/เทอร์เทิลเน็ก): ใช้สีผิวหน้าส่วนล่าง (แก้มล่าง/คาง) ของคนนั้นเอง — ไม่ใช่ค่าเฉลี่ยทั้งหน้าคูณมืด
    let low = null; {
      const cxl = face.chinX != null ? face.chinX : face.cx; let a0 = 0, a1 = 0, a2 = 0, c = 0;
      for (let y = Math.max(0, Math.round(face.chinY - fw * .42)); y < Math.min(H, Math.round(face.chinY - fw * .1)); y += 2) for (let x = Math.max(0, Math.round(cxl - fw * .3)); x < Math.min(W, Math.round(cxl + fw * .3)); x += 2) {
        const i = y * W + x; if (keepS[i] < .8 || alpha[i] < .8 || (!mono && skinLikelihood(person[i * 4], person[i * 4 + 1], person[i * 4 + 2]) < .5)) continue;
        const l = .299 * person[i * 4] + .587 * person[i * 4 + 1] + .114 * person[i * 4 + 2]; if (mono && (l < 40 || l > 235)) continue;
        a0 += person[i * 4]; a1 += person[i * 4 + 1]; a2 += person[i * 4 + 2]; c++;
      }
      if (c > 30) low = [a0 / c, a1 / c, a2 / c];
    }
    const base = low ? low.map(v => v * .95) : skinRGB ? skinRGB.map(v => v * .9) : [170, 130, 110];
    // แถวที่ไม่เห็นคอ: ใกล้แถวที่เห็น ใช้สีแถวนั้น; ห่างออกไป (> 0.1 หน้า) ไล่เข้าหาสีผิวหน้าส่วนล่าง — คอจริงที่เห็นเพียงแถบเล็กในเงา ไม่ลามเป็นทั้งแท่งคอสีเข้ม
    for (let j = 0; j < rows; j++) if (!wr[j]) { const k = j > lastJ && lastJ >= 0 ? lastJ : j < firstJ && firstJ >= 0 ? firstJ : -1; const wb = k >= 0 ? smooth((Math.abs(j - k) - fw * .1) / (fw * .25)) : 1; for (let c = 0; c < 3; c++) ref[c][j] = k >= 0 ? ref[c][k] * (1 - wb) + base[c] * wb : base[c]; wr[j] = -wb; }
    for (let c = 0; c < 3; c++) ref[c] = boxFilter(ref[c], 1, rows, Math.max(1, Math.round(fw * .08)));
    // สีอ้างอิงต้องเป็นผิว: ดึง a*b* เข้าหาผิวหน้า, ความสว่างอยู่ในช่วง 0.55–1.02 เท่าผิวหน้า (กันคอเทา/ม่วง/ดำ)
    for (let j = 0; j < rows; j++) {
      const L = rgbToLab(ref[0][j], ref[1][j], ref[2][j]), Lv = clamp(L[0], sk[0] * (wr[j] > 0 ? .55 : .55 + .25 * Math.min(1, -wr[j] || (firstJ < 0 ? 1 : 0))), sk[0] * 1.02), k = wr[j] > 0 ? .5 : .85;
      const q = labToRgb(Lv, mono ? L[1] : L[1] + (sk[1] - L[1]) * k, mono ? L[2] : L[2] + (sk[2] - L[2]) * k);
      for (let c = 0; c < 3; c++) ref[c][j] = q[c];
    }
    let seenRows = 0; for (let j = 0; j < rows; j++) if (wr[j] > 0) seenRows++;
    const seeAny = seenRows > fw * .3;
    // เห็นคอจริงเพียงแถบเล็ก (เงาเหนือคอเสื้อเต่า): ไม่ใช้สีแถบนั้นลามทั้งคอ — ใช้สีผิวหน้าส่วนล่างทุกแถว (เงา/ไล่แสงมาจาก cyl + chinSh)
    if (!seeAny && low) for (let j = 0; j < rows; j++) { const q = labToRgb(...(() => { const L = rgbToLab(base[0], base[1], base[2]); return [clamp(L[0], sk[0] * .8, sk[0] * 1.02), L[1], L[2]]; })()); for (let c = 0; c < 3; c++) ref[c][j] = q[c]; }
    // ลายผิวจริง (ไม่ใช่สีเรียบ): รายละเอียดความถี่สูงของผิวช่วงคาง/แก้มล่าง (luma - ค่าเฉลี่ยเฉพาะที่) นำมาวางบนคอที่สร้าง
    const cx = face.chinX != null ? face.chinX : face.cx, dx0 = Math.max(0, Math.round(cx - fw * .4)), dx1 = Math.min(W - 1, Math.round(cx + fw * .4)), dy0 = Math.max(0, Math.round(face.chinY - fw * .26)), dy1 = Math.max(dy0 + 2, Math.min(H - 1, Math.round(face.chinY - fw * .06)));
    const dw = dx1 - dx0 + 1, dh = dy1 - dy0 + 1, DL = new Float32Array(dw * dh), DK = new Float32Array(dw * dh);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const i = (y + dy0) * W + x + dx0; DL[y * dw + x] = .299 * person[i * 4] + .587 * person[i * 4 + 1] + .114 * person[i * 4 + 2]; DK[y * dw + x] = keepS[i] * alpha[i] * (skinLikelihood(person[i * 4], person[i * 4 + 1], person[i * 4 + 2]) > .55 ? 1 : 0); }
    const DB = boxFilter(DL, dw, dh, Math.max(1, Math.round(fw * .03))), detAt = (x, y) => { const sx = clamp(Math.round(cx - dx0 + (x - cx) * .8), 0, dw - 1), sy = clamp(Math.round(dh - 1 - ((y - yS) % Math.max(4, dh * .6))), 0, dh - 1), k = sy * dw + sx; return DK[k] > .7 ? clamp(DL[k] - DB[k], -8, 8) : 0; };
    for (let y = yS; y <= yEnd; y++) {
      const g = geom(y), j = y - yS;
      for (let x = Math.max(0, Math.floor(g.c - g.h - fe)); x <= Math.min(W - 1, Math.ceil(g.c + g.h + fe)); x++) {
        const hh = (x < g.c ? hairL : hairR) ? g.h0 : g.h, i = y * W + x, u = (x - g.c) / hh, top = topAt(x);
        if (y < top) continue;
        const edge = smooth(Math.min((hh - Math.abs(x - g.c)) / fe + .5, (y - top) / fe + .5)); if (edge <= 0) continue;
        // ทรงกระบอก: ข้างคอมืดลง; ใต้คางอยู่ในเงา (มากขึ้นเมื่อไม่เห็นคอจริงเลย)
        // ทรงกระบอก (ข้างคอมืดชัด) + เงาใต้กรามไล่ยาว + ลายผิวจริง — คอไม่เป็นแผ่นสีเรียบ
        // ไม่เห็นคอจริง: เงาข้างคอเบากว่า + ไล่ความสว่างตามแนวตั้ง (ใต้คางมืดกว่าเล็กน้อย สว่างขึ้นสู่คอเสื้อ) — ไม่เป็นแผ่นสีเข้มเรียบ
        const cyl = seeAny ? .6 + .4 * Math.pow(Math.max(0, 1 - u * u), .45) : .74 + .26 * Math.pow(Math.max(0, 1 - u * u), .6), dy = y - jy(x);
        const chinSh = dy > 0 ? (seeAny ? 1 - .12 * Math.exp(-dy / (fw * .2)) : .84 + .16 * smooth(dy / (fw * .6))) : 1;
        const gr = noise > 0 ? Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(6.2832 * R()) * noise : 0, wR = Math.min(1, realB[i] * 1.2) * (real[i] > 0 ? 1 : .6) * (seeAny ? 1 : .35), det = detAt(x, y) * .8;
        for (let c = 0; c < 3; c++) { const syn = ref[c][j] * cyl * chinSh + gr + det; rgba[i * 4 + c] = syn + (person[i * 4 + c] - syn) * wR; }
        A[i] = edge;
      }
    }
    for (let i = 0; i < n; i++) rgba[i * 4 + 3] = A[i] * 255;
    const gb = geom(Math.round(yCollar));
    return { rgba, alpha: A, yb: Math.round(yCollar), lb: Math.round(gb.c - gb.h), rb: Math.round(gb.c + gb.h), yCollar };
  }

  /**
   * ลบเกาะเล็กที่หลุดจากตัว (เศษถุงมือ/วัตถุ/สีชุดเดิม): ก้อน 4-connected ของ keep (> .5) ที่ไม่ต่อกับก้อนใหญ่สุดของ "ตัวคนในผลลัพธ์"
   * (keep ∪ ชุด ∪ คอ) และเล็กกว่า minArea พิกเซล -> keep = 0 (แก้ในตัว) คืนจำนวนพิกเซลที่ลบ
   */
  function removeStrayIslands(keepA, cover, W, H, minArea) {
    const n = W * H, on = new Uint8Array(n); for (let i = 0; i < n; i++) on[i] = keepA[i] > .5 || cover[i] > .5 ? 1 : 0;
    const lab = new Int32Array(n).fill(-1), sizes = []; let id = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (!on[s0] || lab[s0] >= 0) continue;
      const st = [s0]; lab[s0] = id; let c = 0;
      while (st.length) { const i = st.pop(), x = i % W; c++; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && on[j] && lab[j] < 0) { lab[j] = id; st.push(j); } }
      sizes.push(c); id++;
    }
    if (sizes.length < 2) return 0;
    let big = 0; for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[big]) big = k;
    let removed = 0;
    for (let i = 0; i < n; i++) { const l = lab[i]; if (l >= 0 && l !== big && sizes[l] < minArea && keepA[i] > 0) { keepA[i] = 0; removed++; } }
    return removed;
  }
  /**
   * ปิดช่องฉากหลังระหว่างกราม/ผมกับคอเสื้อ: ในแถบจากคางถึงขอบบนชุด (|dx| < 0.65 หน้า) พิกเซลที่ไม่มีอะไรคลุม แต่มีสิ่งคลุมทั้งซ้ายและขวา
   * -> เติมเป็นคอ (สีเฉลี่ยของคอในแถวนั้น หรือผิวมืดลง = เงาในร่องคอเสื้อ) แก้ neck.rgba/alpha ในตัว คืนจำนวนพิกเซลที่เติม
   */
  function fillNeckGaps(neck, keepA, frontA, W, H, face, yEnd, skinRGB = null, hairA = null, src = null) {
    // เติมเฉพาะ "รู" 2 มิติที่ปิดล้อมในช่วงคอ (ฉากโผล่เป็นรอยบาก/ช่องเล็กระหว่างคอ-คาง-ปกเสื้อ) ที่ขอบส่วนใหญ่เป็นผิวคอ/หน้า
    // ช่องที่มีผมเป็นขอบ (ฉากจริงระหว่างผมยาวกับคอ) หรือเปิดออกด้านข้าง ไม่เติม — เดิมเติมทีละแถวทำให้เกิดแถบน้ำตาลเป็นเส้น ๆ
    const fw = face.fw, cx = Math.round(face.chinX != null ? face.chinX : face.cx), y0 = Math.max(0, Math.round(face.chinY - fw * .15)), y1 = Math.min(H - 1, Math.round(yEnd));
    const xa = Math.max(0, cx - Math.round(fw * .65)), xb = Math.min(W - 1, cx + Math.round(fw * .65)), bw = xb - xa + 1, bh = y1 - y0 + 1;
    if (bh < 3) return 0;
    const cov = i => Math.max(keepA[i], frontA[i], neck.alpha[i]), lab = new Int32Array(bw * bh).fill(-1), base = skinRGB || [150, 110, 90];
    let filled = 0, id = 0;
    for (let s0 = 0; s0 < bw * bh; s0++) {
      if (lab[s0] >= 0) continue; const sx = s0 % bw, sy = (s0 / bw) | 0; if (cov((sy + y0) * W + sx + xa) >= .5) continue;
      const st = [s0], comp = []; lab[s0] = id; let open = false, eSkin = 0, eHair = 0, eAll = 0;
      while (st.length) {
        const k = st.pop(), x = k % bw, y = (k / bw) | 0; comp.push(k);
        if (x === 0 || x === bw - 1 || y === 0) open = true;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || nx >= bw || ny < 0 || ny >= bh) continue; const kk = ny * bw + nx, i = (ny + y0) * W + nx + xa;
          if (cov(i) >= .5) { eAll++; if (hairA && hairA[i] > .4) eHair++; else if (frontA[i] < .5) eSkin++; continue; }
          if (lab[kk] < 0) { lab[kk] = id; st.push(kk); }
        }
      }
      id++;
      // รูที่ผมยาวเป็นขอบด้านหนึ่ง (ระหว่างผมกับคอ ปิดด้วยชุดด้านล่าง): ในภาพจริงเป็นเงาคอ/ไหล่ ไม่ใช่ฉากสว่าง — เติมเป็นเงา
      const hairHole = eHair > eAll * .25;
      if (open || comp.length > fw * fw * (hairHole ? .12 : .04) || !eAll || eSkin < eAll * (hairHole ? .1 : .3)) continue;
      // สีเงา: ผิวคอเฉลี่ยรอบรู มืดลงเล็กน้อย
      let sr = 0, sg = 0, sb = 0, sn = 0;
      for (const k of comp) { const x = k % bw + xa, y = ((k / bw) | 0) + y0; for (const j of [y * W + x - 2, y * W + x + 2, (y - 2) * W + x]) if (j >= 0 && j < W * H && neck.alpha[j] > .9) { sr += neck.rgba[j * 4]; sg += neck.rgba[j * 4 + 1]; sb += neck.rgba[j * 4 + 2]; sn++; } }
      const col = (sn ? [sr / sn, sg / sn, sb / sn] : base).map(v => v * (hairHole ? .5 : .8));
      // รูข้างผม: ใช้พิกเซลจริงของภาพเดิม (คอ/ไหล่ในเงาจริง) ถ้าเป็นผิวหรือเงามืด — ไม่เป็นแผ่นสีเรียบ
      for (const k of comp) {
        const i = (((k / bw) | 0) + y0) * W + k % bw + xa, kk = 1 - cov(i); let c = col;
        if (hairHole && src) { const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2]; if (skinLikelihood(r, g, b) > .3 || Math.max(r, g, b) < 70) c = [r, g, b]; }
        for (let q = 0; q < 3; q++) neck.rgba[i * 4 + q] = neck.rgba[i * 4 + q] * (1 - kk) + c[q] * kk; neck.alpha[i] = 1; neck.rgba[i * 4 + 3] = 255; filled++;
      }
      // ขอบรู 2 พิกเซล (ขอบจางของผม/คอ) เติมด้วย — ไม่เหลือเส้นฉากบาง ๆ รอบส่วนที่เติม
      if (hairHole && src) for (const k of comp) { const cx0 = k % bw + xa, cy0 = ((k / bw) | 0) + y0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = cx0 + dx, y = cy0 + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x, cv = cov(i); if (cv >= .98 || neck.alpha[i] >= 1) continue;
        const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2]; if (!(skinLikelihood(r, g, b) > .3 || Math.max(r, g, b) < 70)) continue;
        for (let q = 0; q < 3; q++) neck.rgba[i * 4 + q] = src[i * 4 + q]; neck.alpha[i] = 1; neck.rgba[i * 4 + 3] = 255;
      } }
    }
    return filled;
  }
  /**
   * ข้างคอจริงจากภาพเดิม: ช่องฉากระหว่างคอ-หู/ผม-คอเสื้อ (ใต้ระดับติ่งหู ถึงคอเสื้อ) ที่ภาพเดิมเป็นตัวคน (alpha สูง) และเป็นผิว/เงามืด
   * เติมด้วยพิกเซลจริงของภาพเดิม (คอข้าง/เงาใต้หู) โดยงอกจากขอบคอ/ศีรษะออกไปไม่เกิน 0.3 หน้า — ไม่เป็นช่องฉากหรือหู "แผ่นห้อย"
   */
  function restoreNeckSides(neck, keepA, frontA, src, srcA, W, H, face, yEnd, hairA = null) {
    const fw = face.fw, P = face.P, cx = face.chinX != null ? face.chinX : face.cx;
    const y0 = Math.max(0, Math.round(P && P.length >= 17 ? Math.min(P[2].y, P[14].y) : face.chinY - fw * .3)), y1 = Math.min(H - 1, Math.round(yEnd));
    const xa = Math.max(0, Math.round(cx - fw * .8)), xb = Math.min(W - 1, Math.round(cx + fw * .8)), bw = xb - xa + 1, bh = y1 - y0 + 1, lim = fw * .3;
    if (bw < 4 || bh < 4) return 0;
    const cov = i => Math.max(keepA[i], frontA[i], neck.alpha[i]);
    // ผิว/เงาผิว (มืดแต่ยังอมแดง ไม่ใช่ดำ/เทาเป็นกลางของเสื้อคอเต่า) หรือผม — ตัวคนตาม matte เดิม
    const ok = i => { if (srcA[i] < .85) return false; const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2]; return skinLikelihood(r, g, b) > .35 || (Math.max(r, g, b) < 80 && r - b > 8 && r >= g) || (hairA && hairA[i] > .6); };
    const dist = new Float32Array(bw * bh).fill(1e9), q = [], M = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = (y + y0) * W + x + xa; if (cov(i) >= .5 && frontA[i] < .5) { dist[y * bw + x] = 0; q.push(y * bw + x); } }
    for (let h = 0; h < q.length; h++) {
      const k = q[h], x = k % bw, y = (k / bw) | 0, d = dist[k];
      if (d + 1 > lim) continue;
      for (const kk of [x > 0 ? k - 1 : -1, x < bw - 1 ? k + 1 : -1, y > 0 ? k - bw : -1, y < bh - 1 ? k + bw : -1]) {
        if (kk < 0 || dist[kk] <= d + 1) continue; const j = ((kk / bw) | 0) * W + y0 * W + kk % bw + xa;
        if (cov(j) >= .5 || !ok(j)) continue; dist[kk] = d + 1; M[kk] = 1; q.push(kk);
      }
    }
    // opening + ก้อนเล็ก: ไม่ทิ้งเส้นบาง/จุดกระจาย (ขอบผม ขอบเสื้อเดิม)
    const r = Math.max(1, Math.round(fw * .012)), Mo = dilateR(erodeR(M, bw, bh, r), bw, bh, r);
    const seen = new Uint8Array(bw * bh), minA = fw * fw * .004; let filled = 0;
    for (let s0 = 0; s0 < bw * bh; s0++) {
      if (!Mo[s0] || seen[s0]) continue; const st = [s0], comp = []; seen[s0] = 1;
      while (st.length) { const k = st.pop(), x = k % bw; comp.push(k); for (const kk of [x > 0 ? k - 1 : -1, x < bw - 1 ? k + 1 : -1, k - bw, k + bw]) if (kk >= 0 && kk < bw * bh && Mo[kk] && !seen[kk]) { seen[kk] = 1; st.push(kk); } }
      if (comp.length < minA) continue;
      // ต้อง "ห้อยใต้" ศีรษะ/คอ (มีหัว/คอ/ส่วนที่เติมเหนือขึ้นไปภายใน 0.12 หน้า) — เศษข้างคอเสื้อที่โผล่ขึ้นจากบ่า ไม่เติม
      let under = 0; const up = Math.round(fw * .12);
      for (const k of comp) { const x = k % bw + xa, y = ((k / bw) | 0) + y0; for (let d = 1; d <= up; d++) { const yy = y - d; if (yy < 0) break; const j = yy * W + x; if ((Math.max(keepA[j], neck.alpha[j]) >= .5 && frontA[j] < .5)) { under++; break; } } }
      if (under < comp.length * .6) continue;
      for (const k of comp) { const j = ((k / bw) | 0) * W + y0 * W + k % bw + xa, a = 1 - cov(j); for (let c = 0; c < 3; c++) neck.rgba[j * 4 + c] = neck.rgba[j * 4 + c] * (1 - a) + src[j * 4 + c] * a; neck.alpha[j] = 1; neck.rgba[j * 4 + 3] = 255; filled++; }
    }
    return filled;
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

  /**
   * ชั้น "คอสูง" (แบบปิดรอยต่อคอ): ผ้าถักคอเต่าวางระหว่างคอกับตัวชุด (ทับคอที่สร้าง อยู่ใต้ตัวชุดและศีรษะ)
   * ขอบบนซ่อนอยู่ใต้แนวกราม 0.06 หน้า (ศีรษะวางทับ) กว้างถึงมุมกราม/ใต้หู แล้วเรียวลงสู่ช่องคอเสื้อ — ช่อง/บาก/เส้นตัดข้างกรามและใต้หู
   * กลายเป็นผ้าแทนฉากหรือคอที่สร้าง  (รอบ 10: ACCURACY.md §11 วัดผลแยก)
   *  color = [r,g,b] ของผ้า, light.x = ทิศแสงจากใบหน้า (-1..1), noise = grain เท่าภาพจริง
   * คืน { rgba, alpha } ขนาด W×H (ฟังก์ชันล้วน)
   */
  function coverLayer(W, H, face, fit, { color = [43, 45, 51], light = { x: -.2 }, noise = 1.5, collarY = -.22, nw = .33, half = null, seed = 11 } = {}) {
    const n = W * H, rgba = new Uint8ClampedArray(n * 4), A = new Float32Array(n), fw = face.fw, P = face.P, jy = jawCurve(face), R = rng(seed);
    const s = fit.s, drop = fit.drop || 0, cs = Math.cos(fit.theta || 0);
    const cx = P && P.length >= 17 ? ((P[3].x + P[13].x) / 2 + P[8].x) / 2 : (face.chinX != null ? face.chinX : face.cx);
    // กว้างเท่าคอ (ไม่ใช่เท่ากราม — ผ้ากว้างถึงกรามดูเป็นเฝือกคอ) ขอบบนไม่สูงกว่ามุมกราม (ไม่โผล่ข้างแก้ม/หู)
    const hwTop = clamp((half || fw * .29) * 1.12, fw * .28, fw * .36);
    const yTopSide = P && P.length >= 17 ? (P[4].y + P[12].y) / 2 : face.chinY - fw * .2;
    const yCol = fit.N.y + s * (collarY + drop) * cs, yEnd = Math.min(H - 1, Math.ceil(yCol + s * .35));
    const hwCol = Math.max(fw * .36, Math.min(fw * .5, nw * s * 1.15)), fold = face.chinY + fw * .17, fe = Math.max(1.2, fw * .012);
    const y0 = Math.max(0, Math.floor(Math.min(yTopSide, face.chinY - fw * .3)));
    for (let y = y0; y <= yEnd; y++) {
      const t = clamp01((y - face.chinY) / Math.max(1, yCol - face.chinY)), hw = hwTop + (hwCol - hwTop) * smooth(t);
      const c = cx + (fit.N.x - cx) * smooth(t);
      for (let x = Math.max(0, Math.floor(c - hw - 2)); x <= Math.min(W - 1, Math.ceil(c + hw + 2)); x++) {
        const dx = x - c, top = Math.max(Math.min(jy(x), face.chinY) - fw * .06, yTopSide);
        const a = clamp01((y - top) / fe) * clamp01((hw - Math.abs(dx)) / fe); if (a <= 0) continue;
        const u = clamp(dx / hw, -1, 1), cyl = 1 - .3 * u * u + .12 * light.x * u;
        const rib = 1 + .045 * Math.sin(x / Math.max(1.5, fw * .02) * Math.PI);
        // ขอบพับของคอเต่า: เส้นเงาใต้รอยพับ และขอบพับสว่างกว่าเล็กน้อย
        const dF = (y - fold) / (fw * .03), crease = dF > 0 && dF < 2.5 ? 1 - .18 * Math.exp(-dF * 1.2) : dF <= 0 && dF > -3 ? 1 + .05 : 1;
        const k = cyl * rib * crease, i = y * W + x, gn = (R() - .5) * 2 * noise;
        rgba[i * 4] = clamp(color[0] * k + gn, 0, 255); rgba[i * 4 + 1] = clamp(color[1] * k + gn, 0, 255); rgba[i * 4 + 2] = clamp(color[2] * k + gn, 0, 255); rgba[i * 4 + 3] = 255 * a; A[i] = a;
      }
    }
    return { rgba, alpha: A, yTop: y0, yEnd };
  }
  /** วางชั้น cover ทับชั้นคอ (คอที่สร้าง + ผ้า) — แก้ neck ในที่ (rgba/alpha) */
  function mergeCover(neck, cover, n) {
    for (let i = 0; i < n; i++) { const a = cover.alpha[i]; if (a <= 0) continue; const b = neck.alpha[i], o = a + b * (1 - a); for (let c = 0; c < 3; c++) neck.rgba[i * 4 + c] = (cover.rgba[i * 4 + c] * a + neck.rgba[i * 4 + c] * b * (1 - a)) / Math.max(1e-6, o); neck.alpha[i] = o; }
    return neck;
  }
  // ---------- ข้อมูลกำกับไฟล์ส่งออก (ป้าย "ภาพจำลองชุด") ----------
  let CRC_T = null;
  function crc32(b, a = 0, e = b.length) {
    if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
    let c = 0xffffffff; for (let i = a; i < e; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
  }
  const utf8 = t => typeof TextEncoder !== "undefined" ? new TextEncoder().encode(t) : Uint8Array.from(Buffer.from(t, "utf8"));
  /**
   * แทรกข้อความลงไฟล์ PNG หลัง IHDR: entries = [[keyword, text], ...] — ข้อความ ASCII ใช้ tEXt, ข้อความอื่น (ไทย/จีน) ใช้ iTXt (UTF-8)
   * คืน Uint8Array ใหม่ (ไฟล์ที่ไม่ใช่ PNG คืนค่าเดิม)
   */
  function pngWithText(bytes, entries) {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10]; if (bytes.length < 33 || sig.some((v, i) => bytes[i] !== v)) return bytes;
    const ihdrEnd = 8 + 12 + ((bytes[8] << 24 | bytes[9] << 16 | bytes[10] << 8 | bytes[11]) >>> 0), chunks = [];
    for (const [k, t] of entries) {
      const ascii = /^[\x20-\x7e]*$/.test(t), kw = utf8(k.slice(0, 79)), tx = utf8(t);
      const data = ascii ? new Uint8Array([...kw, 0, ...tx]) : new Uint8Array([...kw, 0, 0, 0, 0, 0, ...tx]); // iTXt: ไม่บีบอัด ไม่ระบุภาษา
      const type = utf8(ascii ? "tEXt" : "iTXt"), c = new Uint8Array(12 + data.length), L = data.length;
      c.set([L >>> 24 & 255, L >>> 16 & 255, L >>> 8 & 255, L & 255], 0); c.set(type, 4); c.set(data, 8);
      const crc = crc32(c, 4, 8 + L); c.set([crc >>> 24 & 255, crc >>> 16 & 255, crc >>> 8 & 255, crc & 255], 8 + L); chunks.push(c);
    }
    const add = chunks.reduce((t, c) => t + c.length, 0), out = new Uint8Array(bytes.length + add);
    out.set(bytes.subarray(0, ihdrEnd), 0); let o = ihdrEnd; for (const c of chunks) { out.set(c, o); o += c.length; } out.set(bytes.subarray(ihdrEnd), o);
    return out;
  }
  /** อ่านข้อความ tEXt/iTXt จาก PNG: คืน { keyword: text } */
  function pngTexts(bytes) {
    const r = {}; let o = 8; const dec = b => typeof TextDecoder !== "undefined" ? new TextDecoder().decode(b) : Buffer.from(b).toString("utf8");
    while (o + 12 <= bytes.length) {
      const L = (bytes[o] << 24 | bytes[o + 1] << 16 | bytes[o + 2] << 8 | bytes[o + 3]) >>> 0, type = String.fromCharCode(...bytes.subarray(o + 4, o + 8)), d = bytes.subarray(o + 8, o + 8 + L);
      if (type === "tEXt" || type === "iTXt") { const z = d.indexOf(0), k = dec(d.subarray(0, z)); if (type === "tEXt") r[k] = dec(d.subarray(z + 1)); else { let q = z + 3; q = d.indexOf(0, q) + 1; q = d.indexOf(0, q) + 1; r[k] = dec(d.subarray(q)); } }
      if (type === "IEND") break; o += 12 + L;
    }
    return r;
  }
  /** แทรกส่วน COM (ข้อความ ASCII) หลัง SOI ของไฟล์ JPEG */
  function jpegWithComment(bytes, text) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
    const t = utf8(text.slice(0, 60000)), L = t.length + 2, out = new Uint8Array(bytes.length + 2 + L);
    out.set([0xff, 0xd8, 0xff, 0xfe, L >> 8 & 255, L & 255], 0); out.set(t, 6); out.set(bytes.subarray(2), 6 + t.length);
    return out;
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

  /**
   * เก็บกวาดเศษที่ matte ติดมาสำหรับภาพแบบไม่ใส่ชุด / รูปติดบัตร (round 11) — แก้ keep (0..1) ในตัว คืน { parse, islands, faint, mainFrac }
   *  1) parse (เฉพาะเมื่อส่ง pp — หน้าเว็บไม่ส่ง: บนภาพจริง 62 คน โมเดล 6 คลาสให้สูท/เสื้อสีเข้มเป็นฉาก ทำให้ลำตัวเป็นรู):
   *     ส่วนที่ matte ว่าเป็นคน แต่โมเดลแยกส่วน (pp = ความน่าจะเป็นว่าเป็นคน จาก parsePersonProb) มั่นใจว่าเป็นฉาก (< 0.12)
   *     นอกวงศีรษะและไม่ใช่ผม — ธง เก้าอี้ ฉากที่ต่อกับตัว — เฉพาะก้อนที่หนา (หดขอบ r แล้วยังเหลือ ≥ 0.03 หน้า²) ไม่แตะขอบตัวคนบาง ๆ
   *  2) islands: ก้อนที่ไม่ต่อกับตัวหลัก เล็กกว่า 35% ของตัวหลัก (เดิม: < 0.15 หน้า²)
   *  3) faint: เส้น/เงาจาง (keep < 0.5) ที่อยู่ห่างจากตัวหลักเกิน r — เส้นขอบลอย ๆ ที่ removeStrayIslands ไม่เห็น
   *  mainFrac = พื้นที่ตัวหลัก / ภาพ (ต่ำมาก = ตัดพื้นหลังล้มเหลว ผู้เรียกตัดสินใจเอง)
   */
  /** ติดป้ายก้อน 4 ทิศของมาสก์ 0/1 (เร็ว: สแต็ก Int32Array ไม่สร้างอาร์เรย์ต่อพิกเซล) -> { lab, sizes } */
  function labelComps(on, W, H) {
    const n = W * H, lab = new Int32Array(n).fill(-1), sizes = [], st = new Int32Array(n);
    for (let s0 = 0; s0 < n; s0++) {
      if (!on[s0] || lab[s0] >= 0) continue;
      const id = sizes.length; let sp = 0, c = 0; st[sp++] = s0; lab[s0] = id;
      while (sp) {
        const i = st[--sp], x = i % W; c++;
        if (x > 0 && on[i - 1] && lab[i - 1] < 0) { lab[i - 1] = id; st[sp++] = i - 1; }
        if (x < W - 1 && on[i + 1] && lab[i + 1] < 0) { lab[i + 1] = id; st[sp++] = i + 1; }
        if (i >= W && on[i - W] && lab[i - W] < 0) { lab[i - W] = id; st[sp++] = i - W; }
        if (i + W < n && on[i + W] && lab[i + W] < 0) { lab[i + W] = id; st[sp++] = i + W; }
      }
      sizes.push(c);
    }
    return { lab, sizes };
  }
  function cleanLeftovers(keep, W, H, face, { pp = null, hair = null, ppMax = .12 } = {}) {
    // ตัดสินบนกริดหยาบ (ด้านยาว ≤ 400 ช่อง) แล้วใช้กับทุกพิกเซล — เร็วพอสำหรับภาพทำงาน ~1.2 MP (แคชใน studio.js safeKeep)
    const f = Math.max(1, Math.ceil(Math.max(W, H) / 400)), w = Math.ceil(W / f), h = Math.ceil(H / f), m = w * h;
    const fw = face.fw / f, r = Math.max(2, Math.round(Math.max(w, h) / 256 * 1.5)), info = { parse: 0, islands: 0, faint: 0, mainFrac: 0 };
    const hcx = face.cx / f, hcy = ((face.eyeY + face.chinY) / 2 - face.fw * .1) / f, rx = fw * .75, ry = fw * 1.15;
    const kMax = new Float32Array(m), ppL = pp ? new Float32Array(m) : null, hL = hair ? new Float32Array(m) : null, cnt = new Float32Array(m);
    for (let y = 0; y < H; y++) { const cy = (y / f) | 0; for (let x = 0; x < W; x++) { const i = y * W + x, c = cy * w + ((x / f) | 0); if (keep[i] > kMax[c]) kMax[c] = keep[i]; if (ppL) ppL[c] += pp[i]; if (hL && hair[i] > hL[c]) hL[c] = hair[i]; cnt[c]++; } }
    if (ppL) for (let c = 0; c < m; c++) ppL[c] /= cnt[c] || 1;
    let rm = null;
    if (ppL) {
      const cand = new Uint8Array(m);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = y * w + x; if (kMax[c] > .5 && ppL[c] < ppMax && !(hL && hL[c] > .3) && ((x - hcx) / rx) ** 2 + ((y - hcy) / ry) ** 2 > 1) cand[c] = 1; }
      const core = erodeR(cand, w, h, r), { lab, sizes } = labelComps(core, w, h), minA = fw * fw * .03, sel = new Uint8Array(m); let any = false;
      for (let c = 0; c < m; c++) if (lab[c] >= 0 && sizes[lab[c]] >= minA) { sel[c] = 1; any = true; }
      if (any) rm = dilateR(sel, w, h, r + 1.5);
    }
    // ก้อนหลัก (มีใบหน้า) + ก้อนใหญ่ ≥ 35% ของก้อนหลัก; ที่เหลือที่อยู่ห่างก้อนเหล่านี้เกิน 2r ช่อง = เศษ/เส้นจาง
    const on = new Uint8Array(m); for (let c = 0; c < m; c++) on[c] = kMax[c] > .5 && !(rm && rm[c] && ppL[c] < .25) ? 1 : 0;
    const { lab, sizes } = labelComps(on, w, h);
    if (!sizes.length) return info;
    const fc = Math.round(clamp(hcy, 0, h - 1)) * w + Math.round(clamp(hcx, 0, w - 1));
    let main = lab[fc] >= 0 ? lab[fc] : 0; if (lab[fc] < 0) for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[main]) main = k;
    info.mainFrac = +(sizes[main] / m).toFixed(4);
    const keepSet = new Uint8Array(m); for (let c = 0; c < m; c++) { const l = lab[c]; if (l >= 0 && (l === main || sizes[l] >= sizes[main] * .35)) keepSet[c] = 1; }
    const near = dilateR(keepSet, w, h, r * 2);
    for (let y = 0; y < H; y++) { const cy = (y / f) | 0; for (let x = 0; x < W; x++) { const i = y * W + x; if (!(keep[i] > 0)) continue; const c = cy * w + ((x / f) | 0);
      if (rm && rm[c] && pp[i] < .25 && !(hair && hair[i] > .3)) { keep[i] = 0; info.parse++; }
      else if (!near[c]) { if (keep[i] > .5) info.islands++; else info.faint++; keep[i] = 0; } } }
    return info;
  }
  const api = {
    cleanLeftovers, labelComps,
    clamp01, clamp, smooth, boxFilter, blur3, guidedFilter, luma,
    refineMatte, estimateForeground, borderKeyAlpha,
    rgbToLab, labToRgb, labStats, reinhardTransfer, grayWorld, applyGains,
    blur5, pyrDown, pyrUp, laplacianBlend,
    solve, tpsFit, similarity, warpRGBA,
    runAt, spanAt, estimateBody, garmentShoulders, headFromMatte, jawCurve, headMask,
    fillPoly, skinLikelihood, skinKeepMask, faceMasks, smoothSkin, adjustRegion, sharpen,
    estimateNoise, rng, addGrain, harmonizeGarment, contactShadow, lightWrap, blurredBackground,
    PARSE_LABELS, PARSE_GROUPS, parseCrop, parseGroups, cropToImage, multiclassGroups, headwearExtend, hairCleanup, parsePersonProb, fillMatteFromParse, minFilter, dilate01, blur3Rows, clothShading, faceFromParse, fillFaceMatte, distanceInside, canonShoulder, garmentClip, edt, dilateR, erodeR, closeR, openR, fillHoles, componentFrom, shoulderTop, neckMeasure, handsMask, handsNearGarment, armModel, heuristicParse, personLayers,
    SHOULDER_PRIOR, measureShoulders, sideOffsets, removeStrayIslands, fillNeckGaps, restoreNeckSides, WEAR, templateAnchors, templateWarp, fitFromTargets, synthNeck, hairShadow, composeLayers, coverLayer, mergeCover, crc32, pngWithText, pngTexts, jpegWithComment,
    applyMatteEdits, brush
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.StudioCore = api;
})(typeof window !== "undefined" ? window : globalThis);
