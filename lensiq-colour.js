/* lensiq-colour.js — LQColour: shared colour maths for the Style page (docs/STYLE-DESIGN.md §3.1, §3.3).
 * Browser: window.LQColour · Node: module.exports. No DOM, no network, no storage: numbers only.
 *
 * Pipeline: camera sRGB (8 bit) -> linear RGB -> white-balance gains from a card in the same frame (diagonal von Kries in
 * linear RGB, so the card becomes neutral at its nominal reflectance) -> XYZ (D65) -> CIELAB (D65 white).
 * CIEDE2000: re-implemented from Sharma, Wu, Dalal, "The CIEDE2000 color-difference formula: implementation notes,
 * supplementary test data, and mathematical observations", Color Res. Appl. 30(1), 2005 (no code copied; the 34 published
 * test pairs are in tests/unit/style-colour.test.js).
 * studio-core.js keeps its own rgbToLab (studio unchanged); this module is the shared one for new pages.
 *
 * Card (design §3.3):
 *   detectCard(img, {exclude, at})  largest near-uniform, bright, low-to-moderate-chroma, rectangular region outside the
 *                                   face box (a colour cast keeps a grey card uniform but tints it, so chroma is loose);
 *                                   with `at` (a tap) the region under that point. -> {box, cells} | null
 *   cardStats(img, box, {target})   inner 60 % median linear RGB -> gains = target / median; refuses "clipped" (any
 *                                   channel >= 250 on > 1 % of the inner pixels), "small" (< 1 % of the frame), "uneven"
 *                                   (left-right luminance gradient > 8 %), "dark" (median < 20 of 255).
 * img = ImageData-like {data: RGBA Uint8ClampedArray, width, height}; boxes are {x, y, w, h} in pixels.
 */
(function (root) {
  "use strict";
  const D65 = [0.95047, 1, 1.08883];
  const M = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]];
  const MI = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]];
  const EPS = 216 / 24389, KAPPA = 24389 / 27;

  /** @param {number} v 0..255 @returns {number} linear 0..1 */
  function srgbToLinear(v) { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  /** @param {number} l linear @returns {number} 0..255 (not rounded) */
  function linearToSrgb(l) { const c = Math.max(0, l); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); }
  /** @param {number[][]} m @param {number[]} v */
  const mul = (m, v) => [0, 1, 2].map(i => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);
  /** @param {number[]} lin linear RGB @returns {number[]} XYZ (Y = 1 for white) */
  function linToXyz(lin) { return mul(M, lin); }
  /** @param {number[]} xyz @returns {number[]} L*a*b* (D65) */
  function xyzToLab(xyz) {
    const f = t => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
    const fx = f(xyz[0] / D65[0]), fy = f(xyz[1] / D65[1]), fz = f(xyz[2] / D65[2]);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  /** @param {number[]} lab @returns {number[]} XYZ */
  function labToXyz(lab) {
    const fy = (lab[0] + 16) / 116, fx = fy + lab[1] / 500, fz = fy - lab[2] / 200;
    const inv = t => (t * t * t > EPS ? t * t * t : (116 * t - 16) / KAPPA);
    return [D65[0] * inv(fx), lab[0] > KAPPA * EPS ? Math.pow(fy, 3) : lab[0] / KAPPA, D65[2] * inv(fz)];
  }
  /** @param {number[]} rgb 0..255 @returns {number[]} Lab */
  function rgbToLab(rgb) { return xyzToLab(linToXyz(rgb.map(srgbToLinear))); }
  /** @param {number[]} lab @returns {number[]} rounded, clamped 0..255 */
  function labToRgb(lab) { return mul(MI, labToXyz(lab)).map(v => Math.max(0, Math.min(255, Math.round(linearToSrgb(v))))); }
  /** @param {string} hex "#rrggbb" @returns {number[]} */
  function hexToRgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex)); const n = m ? parseInt(m[1], 16) : 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  /** @param {number[]} rgb @returns {string} */
  function rgbToHex(rgb) { return "#" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }
  /** @param {string} hex */
  function hexToLab(hex) { return rgbToLab(hexToRgb(hex)); }
  /** @param {number[]} lab @returns {{L:number, C:number, h:number}} h in degrees [0, 360) */
  function lch(lab) { const h = Math.atan2(lab[2], lab[1]) * 180 / Math.PI; return { L: lab[0], C: Math.hypot(lab[1], lab[2]), h: (h + 360) % 360 }; }

  /** CIEDE2000 colour difference (kL = kC = kH = 1) @param {number[]} p @param {number[]} q */
  function deltaE2000(p, q) {
    const rad = Math.PI / 180, [L1, a1, b1] = p, [L2, a2, b2] = q;
    const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2, Cb7 = Math.pow(Cb, 7);
    const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + Math.pow(25, 7))));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1 = Math.hypot(a1p, b1), C2 = Math.hypot(a2p, b2);
    const hue = (b, a) => (a === 0 && b === 0 ? 0 : ((Math.atan2(b, a) / rad) % 360 + 360) % 360);
    const h1 = hue(b1, a1p), h2 = hue(b2, a2p), zero = C1 * C2 === 0;
    let dh = zero ? 0 : h2 - h1;
    if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
    const dL = L2 - L1, dC = C2 - C1, dH = 2 * Math.sqrt(C1 * C2) * Math.sin(dh * rad / 2);
    const Lb = (L1 + L2) / 2, Cp = (C1 + C2) / 2;
    let hb = h1 + h2;
    if (!zero) hb = Math.abs(h1 - h2) <= 180 ? hb / 2 : hb < 360 ? (hb + 360) / 2 : (hb - 360) / 2;
    const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
    const Cp7 = Math.pow(Cp, 7), RC = 2 * Math.sqrt(Cp7 / (Cp7 + Math.pow(25, 7)));
    const RT = -Math.sin(2 * 30 * Math.exp(-Math.pow((hb - 275) / 25, 2)) * rad) * RC;
    const SL = 1 + 0.015 * Math.pow(Lb - 50, 2) / Math.sqrt(20 + Math.pow(Lb - 50, 2)), SC = 1 + 0.045 * Cp, SH = 1 + 0.015 * Cp * T;
    const x = dL / SL, y = dC / SC, z = dH / SH;
    return Math.sqrt(x * x + y * y + z * z + RT * y * z);
  }

  /** @param {number[]} xs */
  function median(xs) {
    if (!xs.length) return NaN;
    const s = Float64Array.from(xs).sort(), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  /** robust standard deviation: 1.4826 x median absolute deviation @param {number[]} xs */
  function robustSd(xs) { if (xs.length < 2) return 0; const m = median(xs); return 1.4826 * median(xs.map(v => Math.abs(v - m))); }

  /** @param {number[]} rgb 0..255 @param {number[]} gains @returns {number[]} corrected linear RGB */
  function applyGains(rgb, gains) { return [0, 1, 2].map(i => srgbToLinear(rgb[i]) * gains[i]); }
  /** @param {number[]} rgb @param {number[]} gains */
  function correctedLab(rgb, gains) { return xyzToLab(linToXyz(applyGains(rgb, gains))); }

  /** @param {{width:number, height:number}} img @param {{x:number,y:number,w:number,h:number}} b */
  function clampBox(img, b) {
    const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y));
    return { x, y, w: Math.max(0, Math.min(img.width, Math.round(b.x + b.w)) - x), h: Math.max(0, Math.min(img.height, Math.round(b.y + b.h)) - y) };
  }

  /**
   * @param {{data: ArrayLike<number>, width: number, height: number}} img
   * @param {{x:number,y:number,w:number,h:number}} box
   * @param {{target?: number}} [opts] target = the card's nominal linear reflectance (18 % grey 0.18, white card 0.9)
   */
  function cardStats(img, box, opts) {
    const target = (opts && opts.target) || 0.18, b = clampBox(img, box), reasons = [];
    const ix = b.x + Math.round(b.w * 0.2), iy = b.y + Math.round(b.h * 0.2), iw = Math.max(1, Math.round(b.w * 0.6)), ih = Math.max(1, Math.round(b.h * 0.6));
    const ch = [[], [], []], third = iw / 3;
    let clip = 0, n = 0, left = 0, nl = 0, right = 0, nr = 0;
    for (let y = iy; y < iy + ih && y < img.height; y++) for (let x = ix; x < ix + iw && x < img.width; x++) {
      const i = (y * img.width + x) * 4, r = img.data[i], g = img.data[i + 1], bl = img.data[i + 2];
      if (r >= 250 || g >= 250 || bl >= 250) clip++;
      const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(bl), Y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      ch[0].push(lr); ch[1].push(lg); ch[2].push(lb); n++;
      if (x - ix < third) { left += Y; nl++; } else if (x - ix >= 2 * third) { right += Y; nr++; }
    }
    const lin = ch.map(median), area = (b.w * b.h) / (img.width * img.height);
    const mean = (left + right) / Math.max(1, nl + nr), gradient = nl && nr && mean > 0 ? Math.abs(left / nl - right / nr) / mean : 0;
    if (!n) reasons.push("small");
    if (n && clip / n > 0.01) reasons.push("clipped");
    if (area < 0.01 && !reasons.includes("small")) reasons.push("small");
    if (gradient > 0.08) reasons.push("uneven");
    if (n && Math.max(linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2])) < 20) reasons.push("dark");
    const gains = lin.map(v => (v > 1e-4 ? target / v : 1));
    return { ok: reasons.length === 0, reasons, gains, lin, area, gradient, clippedShare: n ? clip / n : 0, box: b };
  }

  /**
   * Find a white / grey card: grid cells (8 px) that are uniform (SD <= 6 of 255), bright enough (max channel >= 45) and
   * not strongly coloured ((max - min) / max <= 0.38: a light cast tints a grey card); neighbouring cells with similar
   * means are joined; a component must fill >= 70 % of its bounding box, cover 0.3-25 % of the frame and have an aspect
   * ratio of 1:4-4:1. Cells whose centre lies in `exclude` (the face box) are ignored.
   * @param {{data: ArrayLike<number>, width: number, height: number}} img
   * @param {{exclude?: {x:number,y:number,w:number,h:number}|null, at?: {x:number,y:number}|null, cell?: number}} [opts]
   * @returns {{box: {x:number,y:number,w:number,h:number}, cells: number} | null}
   */
  function detectCard(img, opts) {
    const o = opts || {}, S = o.cell || 8, gw = Math.floor(img.width / S), gh = Math.floor(img.height / S), ex = o.exclude;
    const mean = new Float32Array(gw * gh * 3), good = new Uint8Array(gw * gh);
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      const k = cy * gw + cx, mx = cx * S + S / 2, my = cy * S + S / 2;
      if (ex && mx >= ex.x && mx < ex.x + ex.w && my >= ex.y && my < ex.y + ex.h) continue;
      let s0 = 0, s1 = 0, s2 = 0, q0 = 0, q1 = 0, q2 = 0;
      for (let y = cy * S; y < cy * S + S; y++) for (let x = cx * S; x < cx * S + S; x++) {
        const i = (y * img.width + x) * 4, r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
        s0 += r; s1 += g; s2 += b; q0 += r * r; q1 += g * g; q2 += b * b;
      }
      const n = S * S, m0 = s0 / n, m1 = s1 / n, m2 = s2 / n;
      const sd = Math.sqrt(Math.max(0, (q0 / n - m0 * m0 + q1 / n - m1 * m1 + q2 / n - m2 * m2) / 3));
      const hi = Math.max(m0, m1, m2), lo = Math.min(m0, m1, m2);
      mean[k * 3] = m0; mean[k * 3 + 1] = m1; mean[k * 3 + 2] = m2;
      if (sd <= 6 && hi >= 45 && (hi - lo) / hi <= 0.38) good[k] = 1;
    }
    const label = new Int32Array(gw * gh).fill(-1), comps = [];
    for (let k0 = 0; k0 < gw * gh; k0++) {
      if (!good[k0] || label[k0] >= 0) continue;
      const id = comps.length, stack = [k0];
      let n = 0, x0 = gw, y0 = gh, x1 = -1, y1 = -1;
      label[k0] = id;
      while (stack.length) {
        const k = /** @type {number} */ (stack.pop()), cx = k % gw, cy = (k - cx) / gw;
        n++; x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy, nk = ny * gw + nx;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || !good[nk] || label[nk] >= 0) continue;
          if (Math.abs(mean[nk * 3] - mean[k * 3]) > 12 || Math.abs(mean[nk * 3 + 1] - mean[k * 3 + 1]) > 12 || Math.abs(mean[nk * 3 + 2] - mean[k * 3 + 2]) > 12) continue;
          label[nk] = id; stack.push(nk);
        }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, share = (n * S * S) / (img.width * img.height);
      const ok = n / (bw * bh) >= 0.7 && share >= 0.003 && share <= 0.25 && bw / bh <= 4 && bh / bw <= 4 && n >= 4;
      comps.push({ ok, n, box: { x: x0 * S, y: y0 * S, w: bw * S, h: bh * S } });
    }
    let pick = null;
    if (o.at) {
      const cx = Math.floor(o.at.x / S), cy = Math.floor(o.at.y / S);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const l = label[ny * gw + nx];
        if (l >= 0 && comps[l].ok) { pick = comps[l]; break; }
      }
    } else for (const c of comps) if (c.ok && (!pick || c.n > pick.n)) pick = c;
    return pick ? { box: pick.box, cells: pick.n } : null;
  }

  const api = { D65, srgbToLinear, linearToSrgb, linToXyz, xyzToLab, labToXyz, rgbToLab, labToRgb, hexToRgb, rgbToHex, hexToLab, lch,
    deltaE2000, median, robustSd, applyGains, correctedLab, cardStats, detectCard };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQColour = api;
})(typeof window !== "undefined" ? window : globalThis);
