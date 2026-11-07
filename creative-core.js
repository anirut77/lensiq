/* creative-core.js — LQCreative: pure image metrics for creative.html (Creative Lab). No DOM, no network, no models.
 * UMD: browser window.LQCreative · Node require("./creative-core.js"). Used by creative.js, tests/unit/creative.test.js
 * and tests/bench/creative.bench.mjs (the benchmark runs exactly these functions).
 *
 * Inputs
 *   img  = {data: Uint8ClampedArray RGBA, width, height}   (ImageData-like)
 *   map  = {data: Float32Array, w, h}                       (row-major, one value per pixel)
 *   rect = {x, y, w, h}                                     normalised 0..1 of the image
 *
 * Predicted attention (saliency) — classic, training-free models, no learned weights:
 *   spectralResidual   Hou & Zhang, CVPR 2007 (doi:10.1109/CVPR.2007.383267), per CIELAB channel at 64×64
 *   ittiLite           centre–surround contrast of intensity, colour opponency (a*, b*) and orientation energy on a
 *                      Gaussian pyramid with Itti's map normalisation N(.) — after Itti, Koch & Niebur, PAMI 1998
 *                      (doi:10.1109/34.730558). Simplified: oriented gradient energy instead of Gabor filters.
 *   priors             faces (Cerf et al., NIPS 2008) and text (Wang & Pomplun, J Vis 2012) as Gaussian blobs from detector
 *                      boxes; centre bias (Tatler, J Vis 2007). Weights were fitted on 300 MIT1003 images and evaluated on
 *                      the other 703 (ACCURACY.md §10).
 *   fixationOrder      winner-take-all + inhibition of return on the map: a predicted order, not eye tracking.
 * Evaluation metrics (Bylinskii et al., PAMI 2019, doi:10.1109/TPAMI.2018.2815601): aucJudd, aucBorji, nss, cc.
 * Clarity: edgeDensity, colorfulness (Hasler & Süsstrunk 2003), colourCount, detectText (heuristic morphology),
 *   textContrast (WCAG 2.x contrast ratio of the two luminance clusters in a box), palette (k-means in CIELAB),
 *   colourFamily, gaze (head direction from 68-point landmarks) and gazeTargets.
 * Interpretation: findings(m) -> flags used by the guide cards; compare(list) -> predicted ranking with reasons.
 */
(/** @param {any} root */ function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LQCreative = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const VERSION = 1;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const fin = x => typeof x === "number" && Number.isFinite(x);

  /* deterministic RNG (mulberry32) */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------------------------------------------------------------- sizes, resampling
  /** fit (w, h) inside maxSide keeping aspect; never upsizes */
  function fitSize(w, h, maxSide) {
    const s = Math.min(1, maxSide / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }
  /** resample one channel: area average when shrinking, bilinear when enlarging (per axis) */
  function resample(src, sw, sh, dw, dh) {
    const out = new Float32Array(dw * dh);
    if (sw === dw && sh === dh) { out.set(src); return out; }
    // horizontal pass
    const tmp = new Float32Array(dw * sh);
    for (let y = 0; y < sh; y++) {
      const row = y * sw;
      for (let x = 0; x < dw; x++) {
        let v;
        if (dw <= sw) {
          const x0 = Math.floor(x * sw / dw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sw / dw));
          let s = 0; for (let k = x0; k < x1; k++) s += src[row + k]; v = s / (x1 - x0);
        } else {
          const fx = clamp((x + 0.5) * sw / dw - 0.5, 0, sw - 1), i = Math.floor(fx), j = Math.min(sw - 1, i + 1), t = fx - i;
          v = src[row + i] * (1 - t) + src[row + j] * t;
        }
        tmp[y * dw + x] = v;
      }
    }
    for (let x = 0; x < dw; x++) {
      for (let y = 0; y < dh; y++) {
        let v;
        if (dh <= sh) {
          const y0 = Math.floor(y * sh / dh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sh / dh));
          let s = 0; for (let k = y0; k < y1; k++) s += tmp[k * dw + x]; v = s / (y1 - y0);
        } else {
          const fy = clamp((y + 0.5) * sh / dh - 0.5, 0, sh - 1), i = Math.floor(fy), j = Math.min(sh - 1, i + 1), t = fy - i;
          v = tmp[i * dw + x] * (1 - t) + tmp[j * dw + x] * t;
        }
        out[y * dw + x] = v;
      }
    }
    return out;
  }
  /** RGBA image -> {r,g,b} Float32 0..1 at (w, h) (area average) */
  function rgbPlanes(img, w = img.width, h = img.height) {
    const n = img.width * img.height, r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n), d = img.data;
    for (let i = 0; i < n; i++) { r[i] = d[4 * i] / 255; g[i] = d[4 * i + 1] / 255; b[i] = d[4 * i + 2] / 255; }
    if (w === img.width && h === img.height) return { r, g, b, w, h };
    return { r: resample(r, img.width, img.height, w, h), g: resample(g, img.width, img.height, w, h), b: resample(b, img.width, img.height, w, h), w, h };
  }

  // ---------------------------------------------------------------- colour science
  const lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  /** WCAG 2.x relative luminance of sRGB 0..255 */
  function relLuminance(rgb) { return 0.2126 * lin(rgb[0] / 255) + 0.7152 * lin(rgb[1] / 255) + 0.0722 * lin(rgb[2] / 255); }
  /** WCAG contrast ratio 1..21 */
  function contrastRatio(a, b) { const la = relLuminance(a), lb = relLuminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
  /** WCAG 2.x level for text: "AAA" | "AA" | "AA-large" | "fail". large = large-scale text (≥ 18 pt or 14 pt bold) */
  function wcagLevel(ratio, large) {
    if (large) return ratio >= 4.5 ? "AAA" : ratio >= 3 ? "AA" : "fail";
    return ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA-large" : "fail";
  }
  const fLab = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  /** sRGB 0..1 -> CIELAB (D65) */
  function rgb01ToLab(r, g, b) {
    const R = lin(r), G = lin(g), B = lin(b);
    const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
    const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
    const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
    const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  const rgbToLab = rgb => rgb01ToLab(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  function labToRgb(lab) {
    const fy = (lab[0] + 16) / 116, fx = fy + lab[1] / 500, fz = fy - lab[2] / 200;
    const inv = t => t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27);
    const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
    const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, G = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z, B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
    const g = c => { c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055; return Math.round(clamp(c, 0, 1) * 255); };
    return [g(R), g(G), g(B)];
  }
  const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); // CIE76
  const hex = rgb => "#" + rgb.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  function labPlanes(P) {
    const n = P.w * P.h, L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) { const l = rgb01ToLab(P.r[i], P.g[i], P.b[i]); L[i] = l[0]; A[i] = l[1]; B[i] = l[2]; }
    return { L, A, B, w: P.w, h: P.h };
  }
  /** colour family of an sRGB colour (CIELAB lightness, chroma and hue angle) */
  function colourFamily(rgb) {
    const [L, a, b] = rgbToLab(rgb), C = Math.hypot(a, b);
    let hue = Math.atan2(b, a) * 180 / Math.PI; if (hue < 0) hue += 360;
    if (C < 12) return L < 22 ? "black" : L > 88 ? "white" : "grey";
    if (hue >= 345 || hue < 22) return L > 70 ? "pink" : "red";
    if (hue < 52) return L > 78 && C < 45 ? "pink" : L < 38 ? "brown" : "red";
    if (hue < 80) return L < 50 ? "brown" : "orange";
    if (hue < 112) return L < 50 ? "brown" : "yellow";
    if (hue < 175) return "green";
    if (hue < 250) return "cyan";
    if (hue < 318) return "blue";
    return L > 72 ? "pink" : "purple";
  }

  // ---------------------------------------------------------------- filters
  function gaussKernel(sigma) {
    const r = Math.max(1, Math.ceil(3 * sigma)), k = new Float32Array(2 * r + 1);
    let s = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    return { k, r };
  }
  /** separable Gaussian blur, clamped borders */
  function blur(src, w, h, sigma) {
    if (!(sigma > 0)) return Float32Array.from(src);
    const { k, r } = gaussKernel(sigma), tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * src[y * w + clamp(x + i, 0, w - 1)];
      tmp[y * w + x] = s;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * tmp[clamp(y + i, 0, h - 1) * w + x];
      out[y * w + x] = s;
    }
    return out;
  }
  /** min-max to 0..1 (constant map -> zeros) */
  function normalize(src) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < src.length; i++) { const v = src[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const out = new Float32Array(src.length), d = hi - lo;
    if (!(d > 1e-12)) return out;
    for (let i = 0; i < src.length; i++) out[i] = (src[i] - lo) / d;
    return out;
  }

  // ---------------------------------------------------------------- FFT (radix-2, in place)
  function fft1(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  /** 2-D FFT of an n×n (power of 2) complex array, in place */
  function fft2(re, im, n, inverse) {
    const rr = new Float64Array(n), ri = new Float64Array(n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) { rr[x] = re[y * n + x]; ri[x] = im[y * n + x]; }
      fft1(rr, ri, inverse);
      for (let x = 0; x < n; x++) { re[y * n + x] = rr[x]; im[y * n + x] = ri[x]; }
    }
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) { rr[y] = re[y * n + x]; ri[y] = im[y * n + x]; }
      fft1(rr, ri, inverse);
      for (let y = 0; y < n; y++) { re[y * n + x] = rr[y]; im[y * n + x] = ri[y]; }
    }
  }

  // ---------------------------------------------------------------- saliency components
  const SR_N = 64;
  /** spectral residual on one n×n channel -> n×n energy map (not blurred) */
  function srChannel(ch, n) {
    let mu = 0; for (let i = 0; i < ch.length; i++) mu += ch[i]; mu /= ch.length;
    const re = Float64Array.from(ch, v => v - mu), im = new Float64Array(n * n); // zero mean: the map has no DC offset
    fft2(re, im, n, false);
    const logA = new Float64Array(n * n), ph = new Float64Array(n * n);
    let mA = 0; for (let i = 0; i < n * n; i++) mA += Math.hypot(re[i], im[i]);
    const eps = 1e-3 * mA / (n * n) + 1e-12; // relative floor: exact spectral zeros (flat synthetic shapes) must not become −∞ outliers
    for (let i = 0; i < n * n; i++) { logA[i] = Math.log(Math.hypot(re[i], im[i]) + eps); ph[i] = Math.atan2(im[i], re[i]); }
    logA[0] = (logA[1] + logA[n] + logA[n + 1]) / 3; // the removed DC bin must not drag down its neighbours' local average
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += logA[((y + dy + n) % n) * n + ((x + dx + n) % n)]; // spectrum is periodic
      const i = y * n + x, e = i ? Math.exp(logA[i] - s / 9) : 0;
      re[i] = e * Math.cos(ph[i]); im[i] = e * Math.sin(ph[i]);
    }
    fft2(re, im, n, true);
    const out = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) out[i] = re[i] * re[i] + im[i] * im[i];
    return out;
  }
  /** spectral residual saliency of lab planes, returned at (w, h), normalised 0..1 */
  function spectralResidual(lab, w = lab.w, h = lab.h) {
    // SR is invariant to the channel's contrast, so a nearly flat channel (a*/b* of a grey image) would come out as strong
    // as a contrasty one: each channel's map is scaled to sum 1 and weighted by that channel's standard deviation.
    let acc = new Float32Array(SR_N * SR_N);
    for (const ch0 of [lab.L, lab.A, lab.B]) {
      const ch = resample(ch0, lab.w, lab.h, SR_N, SR_N);
      let mu = 0, v = 0; for (let i = 0; i < ch.length; i++) mu += ch[i]; mu /= ch.length;
      for (let i = 0; i < ch.length; i++) v += (ch[i] - mu) * (ch[i] - mu);
      const sd = Math.sqrt(v / ch.length); if (sd < 0.5) continue; // < 0.5 ΔE: flat channel
      const m = srChannel(ch, SR_N); let s = 0; for (let i = 0; i < m.length; i++) s += m[i];
      if (s > 0) for (let i = 0; i < acc.length; i++) acc[i] += sd * m[i] / s;
    }
    acc = blur(acc, SR_N, SR_N, 2);
    return normalize(resample(acc, SR_N, SR_N, w, h));
  }

  /** Itti normalisation N(.): scale to 0..1 then weight by (1 - mean of the other local maxima)^2 */
  function ittiN(m, w, h) {
    const n = normalize(m);
    let s = 0, c = 0, gmax = 0;
    for (let i = 0; i < n.length; i++) if (n[i] > gmax) gmax = n[i];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const v = n[y * w + x]; if (v < 0.05 || v >= gmax) continue;
      let peak = true;
      for (let dy = -1; dy <= 1 && peak; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && n[(y + dy) * w + x + dx] > v) { peak = false; break; }
      if (peak) { s += v; c++; }
    }
    const mb = c ? s / c : 0, f = (1 - mb) * (1 - mb);
    for (let i = 0; i < n.length; i++) n[i] *= f;
    return n;
  }
  function pyramid(ch, w, h, levels) {
    const P = [{ d: ch, w, h }];
    for (let l = 1; l < levels; l++) {
      const p = P[l - 1], b = blur(p.d, p.w, p.h, 1), nw = Math.max(1, p.w >> 1), nh = Math.max(1, p.h >> 1);
      P.push({ d: resample(b, p.w, p.h, nw, nh), w: nw, h: nh });
    }
    return P;
  }
  function orientEnergy(ch, w, h, theta) {
    const c = Math.cos(theta), s = Math.sin(theta), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = ch[y * w + clamp(x + 1, 0, w - 1)] - ch[y * w + clamp(x - 1, 0, w - 1)];
      const gy = ch[clamp(y + 1, 0, h - 1) * w + x] - ch[clamp(y - 1, 0, h - 1) * w + x];
      out[y * w + x] = Math.abs(gx * c + gy * s);
    }
    return out;
  }
  const CS = [[1, 3], [1, 4], [2, 4], [2, 5]];
  /** centre–surround feature maps of one channel pyramid, summed with N(.), at (tw, th) */
  function csSum(P, tw, th) {
    const acc = new Float32Array(tw * th);
    for (const [c, s] of CS) {
      if (!P[s]) continue;
      const a = resample(P[c].d, P[c].w, P[c].h, tw, th), b = resample(P[s].d, P[s].w, P[s].h, tw, th), d = new Float32Array(tw * th);
      for (let i = 0; i < d.length; i++) d[i] = Math.abs(a[i] - b[i]);
      const n = ittiN(d, tw, th);
      for (let i = 0; i < acc.length; i++) acc[i] += n[i];
    }
    return acc;
  }
  /** Itti–Koch-style saliency of lab planes, at (w, h), normalised 0..1 */
  function ittiLite(lab, w = lab.w, h = lab.h) {
    const LV = 6, tw = Math.max(4, lab.w >> 2), th = Math.max(4, lab.h >> 2);
    const I = csSum(pyramid(lab.L, lab.w, lab.h, LV), tw, th);
    const Ca = csSum(pyramid(lab.A, lab.w, lab.h, LV), tw, th), Cb = csSum(pyramid(lab.B, lab.w, lab.h, LV), tw, th);
    const C = new Float32Array(tw * th); for (let i = 0; i < C.length; i++) C[i] = Ca[i] + Cb[i];
    const O = new Float32Array(tw * th);
    for (const th0 of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4]) {
      const P = pyramid(lab.L, lab.w, lab.h, LV).map(p => ({ d: orientEnergy(p.d, p.w, p.h, th0), w: p.w, h: p.h }));
      const n = ittiN(csSum(P, tw, th), tw, th);
      for (let i = 0; i < O.length; i++) O[i] += n[i];
    }
    const nI = ittiN(I, tw, th), nC = ittiN(C, tw, th), nO = ittiN(O, tw, th), S = new Float32Array(tw * th);
    for (let i = 0; i < S.length; i++) S[i] = (nI[i] + nC[i] + nO[i]) / 3;
    return normalize(resample(blur(S, tw, th, 1), tw, th, w, h));
  }

  /** anisotropic Gaussian centre bias, peak 1 at the centre; sigma in fractions of width/height */
  function centerBias(w, h, sx = 0.25, sy = 0.25) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = ((x + 0.5) / w - 0.5) / sx, dy = ((y + 0.5) / h - 0.5) / sy;
      out[y * w + x] = Math.exp(-(dx * dx + dy * dy) / 2);
    }
    return out;
  }
  /** Gaussian blobs at rects (normalised); sigma = spread × box size; each blob peaks at its weight (default 1); max-combined */
  function boxPrior(w, h, rects, spread = 0.5) {
    const out = new Float32Array(w * h);
    for (const r of rects || []) {
      const cx = (r.x + r.w / 2) * w, cy = (r.y + r.h / 2) * h, sx = Math.max(1, r.w * w * spread), sy = Math.max(1, r.h * h * spread), wt = fin(r.weight) ? r.weight : 1;
      const x0 = Math.max(0, Math.floor(cx - 3 * sx)), x1 = Math.min(w - 1, Math.ceil(cx + 3 * sx)), y0 = Math.max(0, Math.floor(cy - 3 * sy)), y1 = Math.min(h - 1, Math.ceil(cy + 3 * sy));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / sx, dy = (y + 0.5 - cy) / sy, v = wt * Math.exp(-(dx * dx + dy * dy) / 2);
        if (v > out[y * w + x]) out[y * w + x] = v;
      }
    }
    return out;
  }

  /* Combination weights from MIT1003 (tests/bench/creative.bench.mjs --fit, 300 tuning images; ACCURACY.md §10).
   * sr/ik/face/text/sigma are the fitted values. The fit also wanted a pure, tight centre bias (cb 1, cbSigma 0.18);
   * that is partly a lab artefact (centred images, first fixation at the centre) and would bury logos and CTAs placed
   * near the edges of real creatives, so a milder centre bias is shipped (held-out NSS 1.59 instead of 1.72). */
  const PARAMS = { sr: 1, ik: 0.2, face: 1.5, text: 0.25, cb: 0.8, cbSigma: 0.24, sigma: 0.02 };
  const MAP_SIDE = 128;

  /** bottom-up components of an RGBA image at map size: {sr, ik, w, h} */
  function components(img, maxSide = MAP_SIDE) {
    const { w, h } = fitSize(img.width, img.height, maxSide);
    const lab = labPlanes(rgbPlanes(img, w, h));
    return { sr: spectralResidual(lab), ik: ittiLite(lab), w, h };
  }
  /** combine components + priors -> attention map (sums to 1). priors: {faces:[rect], texts:[rect]} */
  function combine(comp, priors = {}, p = PARAMS) {
    const { w, h } = comp, n = w * h, raw = new Float32Array(n);
    const F = priors.faces && priors.faces.length ? boxPrior(w, h, priors.faces, 0.45) : null;
    const T = priors.texts && priors.texts.length ? boxPrior(w, h, priors.texts, 0.5) : null;
    for (let i = 0; i < n; i++) raw[i] = p.sr * comp.sr[i] + p.ik * comp.ik[i] + (F ? p.face * F[i] : 0) + (T ? p.text * T[i] : 0);
    const CB = centerBias(w, h, p.cbSigma, p.cbSigma), sig = p.sigma * Math.max(w, h);
    const b = blur(raw, w, h, sig);
    let mx = 0; for (let i = 0; i < n; i++) if (b[i] > mx) mx = b[i];
    const out = new Float32Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) { out[i] = (mx > 0 ? b[i] / mx : 0) * ((1 - p.cb) + p.cb * CB[i]) + 1e-6; s += out[i]; }
    for (let i = 0; i < n; i++) out[i] /= s;
    return { data: out, w, h };
  }
  /** full predicted-attention map of an image */
  function saliency(img, priors, p) { return combine(components(img), priors, p); }

  // ---------------------------------------------------------------- reading the map
  /** share of the map's mass inside a rect; lift = share / area (1 = what a uniform map would give) */
  function regionShare(map, r) {
    const { w, h, data } = map;
    const x0 = clamp(Math.floor(r.x * w), 0, w), x1 = clamp(Math.ceil((r.x + r.w) * w), 0, w), y0 = clamp(Math.floor(r.y * h), 0, h), y1 = clamp(Math.ceil((r.y + r.h) * h), 0, h);
    let s = 0, tot = 0;
    for (let i = 0; i < data.length; i++) tot += data[i];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += data[y * w + x];
    const area = Math.max(1e-9, ((x1 - x0) * (y1 - y0)) / (w * h));
    const share = tot > 0 ? s / tot : 0;
    return { share, area, lift: share / area };
  }
  /** predicted order of first looks: winner-take-all + inhibition of return (radius = fraction of the longer side) */
  function fixationOrder(map, { n = 5, radius = 0.12, minRel = 0.15 } = {}) {
    const { w, h } = map, d = Float32Array.from(map.data), R = radius * Math.max(w, h);
    let tot = 0; for (let i = 0; i < d.length; i++) tot += d[i];
    const out = []; let first = 0;
    for (let k = 0; k < n; k++) {
      let bi = -1, bv = -Infinity;
      for (let i = 0; i < d.length; i++) if (d[i] > bv) { bv = d[i]; bi = i; }
      if (bi < 0 || bv <= 0) break;
      if (!k) first = bv; else if (bv < first * minRel) break;
      const fx = bi % w, fy = (bi / w) | 0;
      let mass = 0;
      for (let y = Math.max(0, Math.floor(fy - R)); y <= Math.min(h - 1, Math.ceil(fy + R)); y++)
        for (let x = Math.max(0, Math.floor(fx - R)); x <= Math.min(w - 1, Math.ceil(fx + R)); x++) {
          const q = (x - fx) * (x - fx) + (y - fy) * (y - fy); if (q > R * R) continue;
          mass += d[y * w + x]; d[y * w + x] = 0;
        }
      out.push({ x: (fx + 0.5) / w, y: (fy + 0.5) / h, value: bv, share: tot > 0 ? mass / tot : 0 });
    }
    return out;
  }
  const inRect = (p, r, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
  /** for each region: share/lift and the 1-based rank of the first predicted look that lands in it (0 = none) */
  function regionReport(map, regions, order) {
    return (regions || []).map(r => {
      const s = regionShare(map, r), k = order.findIndex(o => inRect(o, r, 0.02));
      return { ...r, share: s.share, area: s.area, lift: s.lift, rank: k + 1 };
    });
  }

  // ---------------------------------------------------------------- benchmark metrics
  /** fixation pixel indices -> map coords. fix: Int32Array of indices into map.data (repeats allowed) */
  function nss(map, fix) {
    const d = map.data, n = d.length;
    let m = 0; for (let i = 0; i < n; i++) m += d[i]; m /= n;
    let v = 0; for (let i = 0; i < n; i++) v += (d[i] - m) * (d[i] - m);
    const sd = Math.sqrt(v / (n - 1)); if (!(sd > 0) || !fix.length) return 0;
    let s = 0; for (const i of fix) s += (d[i] - m) / sd;
    return s / fix.length;
  }
  /** Pearson linear correlation between two maps of the same size */
  function cc(a, b) {
    const n = a.length; let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
  }
  /** AUC-Judd: thresholds at the saliency of each fixation; TP over fixations, FP over all other pixels */
  function aucJudd(map, fix) {
    const d = map.data, n = d.length; if (!fix.length) return NaN;
    fix = Array.from(new Set(fix)); // positives = fixated pixels (binary fixation map)
    const tv = Array.from(fix, i => d[i] + 1e-9 * ((i * 2654435761) % 997) / 997).sort((a, b) => b - a); // tiny jitter breaks ties
    const all = Float64Array.from(d, (v, i) => v + 1e-9 * ((i * 2654435761) % 997) / 997).sort().reverse();
    const nf = tv.length, nn = n - nf;
    let auc = 0, ptp = 0, pfp = 0, j = 0;
    for (let k = 0; k < nf; k++) {
      const t = tv[k];
      while (j < n && all[j] >= t) j++;
      const tp = (k + 1) / nf, fp = Math.max(0, (j - (k + 1)) / nn);
      auc += (fp - pfp) * (tp + ptp) / 2; ptp = tp; pfp = fp;
    }
    auc += (1 - pfp) * (1 + ptp) / 2;
    return auc;
  }
  /** AUC-Borji: negatives sampled uniformly (nSplits × nFix), thresholds every 0.1 of the normalised map */
  function aucBorji(map, fix, { nSplits = 100, step = 0.1, seed = 1 } = {}) {
    const d = normalize(map.data), n = d.length, R = rng(seed); if (!fix.length) return NaN;
    const pos = Array.from(fix, i => d[i]);
    let tot = 0;
    for (let s = 0; s < nSplits; s++) {
      const neg = pos.map(() => d[Math.floor(R() * n)]);
      const pts = [[0, 0]];
      for (let t = 1 + 1e-9; t >= -1e-9; t -= step) pts.push([neg.filter(v => v >= t).length / neg.length, pos.filter(v => v >= t).length / pos.length]);
      pts.push([1, 1]);
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let a = 0; for (let k = 1; k < pts.length; k++) a += (pts[k][0] - pts[k - 1][0]) * (pts[k][1] + pts[k - 1][1]) / 2;
      tot += a;
    }
    return tot / nSplits;
  }

  // ---------------------------------------------------------------- clarity metrics
  /** luminance 0..255 (Rec. 709 on gamma values) of an RGBA image */
  function gray(img) {
    const n = img.width * img.height, g = new Float32Array(n), d = img.data;
    for (let i = 0; i < n; i++) g[i] = 0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2];
    return g;
  }
  function sobel(g, w, h) {
    const m = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
      m[i] = Math.hypot(gx, gy) / 8;
    }
    return m;
  }
  /** share of pixels on a visible edge (Sobel magnitude ≥ thr grey levels per pixel) — feature clutter proxy */
  function edgeDensity(img, thr = 12) {
    const w = img.width, h = img.height, m = sobel(gray(img), w, h);
    let c = 0; for (let i = 0; i < m.length; i++) if (m[i] >= thr) c++;
    return (w > 2 && h > 2) ? c / ((w - 2) * (h - 2)) : 0;
  }
  /** Hasler & Süsstrunk (2003) colourfulness M (0 = grey; ≈ 33 moderate, 59 quite, 82 highly, 109 extremely colourful) */
  function colorfulness(img) {
    const d = img.data, n = img.width * img.height;
    let mrg = 0, myb = 0, srg = 0, syb = 0;
    for (let i = 0; i < n; i++) { const r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2], rg = r - g, yb = 0.5 * (r + g) - b; mrg += rg; myb += yb; srg += rg * rg; syb += yb * yb; }
    mrg /= n; myb /= n; srg = Math.max(0, srg / n - mrg * mrg); syb = Math.max(0, syb / n - myb * myb);
    return Math.sqrt(srg + syb) + 0.3 * Math.hypot(mrg, myb);
  }
  const CF_BANDS = [[15, "none"], [33, "slight"], [45, "moderate"], [59, "average"], [82, "quite"], [109, "high"], [Infinity, "extreme"]];
  const colorfulBand = M => CF_BANDS.find(b => M < b[0])[1];
  /** number of 4-bit-per-channel colour bins that together cover `cover` of the pixels */
  function colourCount(img, cover = 0.9) {
    const bins = new Uint32Array(4096), d = img.data, n = img.width * img.height;
    for (let i = 0; i < n; i++) bins[(d[4 * i] >> 4) << 8 | (d[4 * i + 1] >> 4) << 4 | d[4 * i + 2] >> 4]++;
    const s = Array.from(bins).filter(v => v).sort((a, b) => b - a);
    let acc = 0, k = 0; while (k < s.length && acc < cover * n) acc += s[k++];
    return k;
  }
  /** complexity 0..100 from edge density and colour count (documented heuristic, not a validated scale) */
  function complexityScore(ed, colours) {
    const e = clamp(ed / 0.30, 0, 1), c = clamp(Math.log2(Math.max(1, colours)) / Math.log2(400), 0, 1);
    return Math.round(100 * (0.7 * e + 0.3 * c));
  }
  const complexityBand = s => s < 30 ? "low" : s < 55 ? "medium" : "high";

  function otsu(values, lo = 0, hi = 255, nb = 64) {
    const hist = new Float64Array(nb), span = Math.max(1e-9, hi - lo);
    for (const v of values) hist[clamp(Math.floor((v - lo) / span * nb), 0, nb - 1)]++;
    const N = values.length; let sAll = 0; for (let i = 0; i < nb; i++) sAll += i * hist[i];
    let wB = 0, sB = 0, best = -1, bt = 0;
    for (let t = 0; t < nb - 1; t++) {
      wB += hist[t]; if (!wB) continue; const wF = N - wB; if (!wF) break;
      sB += t * hist[t]; const mB = sB / wB, mF = (sAll - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; bt = t; }
    }
    return lo + (bt + 1) * span / nb;
  }
  function dilate(b, w, h, rx, ry) {
    const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) { let run = -1; for (let x = 0; x < w; x++) { if (b[y * w + x]) run = x; t[y * w + x] = run >= 0 && x - run <= rx ? 1 : 0; } run = -1; for (let x = w - 1; x >= 0; x--) { if (b[y * w + x]) run = x; if (run >= 0 && run - x <= rx) t[y * w + x] = 1; } }
    for (let x = 0; x < w; x++) { let run = -1; for (let y = 0; y < h; y++) { if (t[y * w + x]) run = y; o[y * w + x] = run >= 0 && y - run <= ry ? 1 : 0; } run = -1; for (let y = h - 1; y >= 0; y--) { if (t[y * w + x]) run = y; if (run >= 0 && run - y <= ry) o[y * w + x] = 1; } }
    return o;
  }
  function erode(b, w, h, rx, ry) { const inv = new Uint8Array(w * h); for (let i = 0; i < inv.length; i++) inv[i] = b[i] ? 0 : 1; const d = dilate(inv, w, h, rx, ry); for (let i = 0; i < d.length; i++) d[i] = d[i] ? 0 : 1; return d; }
  function components8(b, w, h) {
    const lab = new Int32Array(w * h).fill(-1), out = [], st = [];
    for (let i = 0; i < b.length; i++) {
      if (!b[i] || lab[i] >= 0) continue;
      const id = out.length; let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0;
      st.push(i); lab[i] = id;
      while (st.length) {
        const p = st.pop(), x = p % w, y = (p / w) | 0; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx; if (b[q] && lab[q] < 0) { lab[q] = id; st.push(q); }
        }
      }
      out.push({ x0, y0, x1, y1, n });
    }
    return out;
  }
  /** text-like regions (heuristic: dense, regularly alternating strong edges grouped into lines). Returns normalised
   *  rects {x,y,w,h,score}. Works best on graphic text (posters, packaging, banners); misses thin, curved or tiny text and can
   *  fire on fine regular textures (barcodes, stripes). */
  function detectText(img, { minH = 6, debug = null } = {}) {
    const w = img.width, h = img.height, g = gray(img);
    const grad = new Float32Array(w * h);
    // thin (forward-difference) edges: a 3×3 morphological gradient merges the strokes of small text into a solid blob
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const i = y * w + x; grad[i] = Math.max(Math.abs(g[i + 1] - g[i]), Math.abs(g[i + w] - g[i]));
    }
    const thr = clamp(otsu(grad), 20, 36); // bounded: low-contrast text must still be found (that is what we grade)
    const bin = new Uint8Array(w * h); for (let i = 0; i < bin.length; i++) bin[i] = grad[i] >= thr ? 1 : 0;
    const kx = Math.max(2, Math.round(Math.max(w, h) / 90));
    const closed = erode(dilate(bin, w, h, kx, 1), w, h, kx, 1);
    const out = [];
    for (const c of components8(closed, w, h)) {
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      const rej = why => { if (debug) debug.push({ why, x: c.x0, y: c.y0, w: bw, h: bh }); };
      if (bh < minH || bh > h * 0.35 || bw < bh * 1.1 || bw * bh < 80) { if (bw * bh >= 80) rej("size"); continue; }
      let on = 0; for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) on += bin[y * w + x];
      const fill = on / (bw * bh);
      if (fill < 0.12 || fill > 0.92) { rej("fill " + fill.toFixed(2)); continue; }
      // transitions along three scan lines: text alternates edge/no-edge many times per line height
      let tr = 0;
      for (const fy of [0.35, 0.5, 0.65]) { const y = c.y0 + Math.round(fy * (bh - 1)); let prev = 0; for (let x = c.x0; x <= c.x1; x++) { const v = bin[y * w + x]; if (v !== prev) tr++; prev = v; } }
      const perH = tr / 3 / (bw / bh);
      if (perH < 1.2) { rej("trans " + perH.toFixed(2)); continue; }
      // interior: text has edges across the whole box; an outline / frame is empty in the middle
      let inner = 0; const ix0 = c.x0 + Math.floor(bw * 0.2), ix1 = c.x1 - Math.floor(bw * 0.2), iy0 = c.y0 + Math.floor(bh * 0.25), iy1 = c.y1 - Math.floor(bh * 0.25);
      for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) inner += bin[y * w + x];
      const innerFill = inner / Math.max(1, (ix1 - ix0 + 1) * (iy1 - iy0 + 1));
      if (innerFill < 0.4 * fill) { rej("hollow " + innerFill.toFixed(2)); continue; }
      // vertical regularity: rows with edges should cover most of the box height (rejects thin lines/stripes)
      let rows = 0; for (let y = c.y0; y <= c.y1; y++) { let r = 0; for (let x = c.x0; x <= c.x1; x++) r += bin[y * w + x]; if (r > bw * 0.04) rows++; }
      if (rows / bh < 0.6) { rej("rows " + (rows / bh).toFixed(2)); continue; }
      out.push({ x: c.x0 / w, y: c.y0 / h, w: bw / w, h: bh / h, score: +clamp(fill * perH / 3, 0, 1).toFixed(3) });
    }
    return mergeRects(out).slice(0, 40);
  }
  function mergeRects(rs) {
    rs = rs.slice().sort((a, b) => b.w * b.h - a.w * a.h);
    const keep = [];
    for (const r of rs) {
      const k = keep.find(q => { const ix = Math.max(0, Math.min(q.x + q.w, r.x + r.w) - Math.max(q.x, r.x)), iy = Math.max(0, Math.min(q.y + q.h, r.y + r.h) - Math.max(q.y, r.y)); return ix * iy > 0.5 * r.w * r.h; });
      if (!k) keep.push({ ...r });
    }
    return keep;
  }
  /** union area of rects (normalised) on a coarse grid */
  function rectsArea(rs, G = 200) {
    const m = new Uint8Array(G * G);
    for (const r of rs || []) for (let y = Math.floor(r.y * G); y < Math.min(G, Math.ceil((r.y + r.h) * G)); y++) for (let x = Math.floor(r.x * G); x < Math.min(G, Math.ceil((r.x + r.w) * G)); x++) m[y * G + x] = 1;
    let s = 0; for (let i = 0; i < m.length; i++) s += m[i];
    return s / (G * G);
  }
  /** text vs background colours inside a rect: two luminance clusters (Otsu); the smaller cluster is the text.
   *  Uses the outer half of each cluster (away from the threshold) so anti-aliased edges do not dilute the colours. */
  function textContrast(img, r, { largeFrac = 0.04 } = {}) {
    const w = img.width, h = img.height, d = img.data;
    const x0 = clamp(Math.floor(r.x * w), 0, w - 1), x1 = clamp(Math.ceil((r.x + r.w) * w), x0 + 1, w), y0 = clamp(Math.floor(r.y * h), 0, h - 1), y1 = clamp(Math.ceil((r.y + r.h) * h), y0 + 1, h);
    const px = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = 4 * (y * w + x); px.push([d[i], d[i + 1], d[i + 2], 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]]); }
    const t = otsu(px.map(p => p[3]));
    const lo = px.filter(p => p[3] < t), hi = px.filter(p => p[3] >= t);
    if (!lo.length || !hi.length) return null;
    const core = (arr, dark) => { const s = arr.slice().sort((a, b) => a[3] - b[3]), half = dark ? s.slice(0, Math.max(1, s.length >> 1)) : s.slice(s.length >> 1); return [0, 1, 2].map(k => half.reduce((a, p) => a + p[k], 0) / half.length); };
    const cl = core(lo, true), ch = core(hi, false), textDark = lo.length <= hi.length;
    const fg = textDark ? cl : ch, bg = textDark ? ch : cl, ratio = contrastRatio(fg, bg);
    const large = r.h >= largeFrac;
    return { fg: fg.map(Math.round), bg: bg.map(Math.round), ratio: +ratio.toFixed(2), large, level: wcagLevel(ratio, large) };
  }

  /** dominant colours: k-means (k-means++ init, seeded) in CIELAB on up to 6,000 pixels; clusters closer than ΔE 12 merged */
  function palette(img, { k = 6, seed = 7, iters = 12 } = {}) {
    const d = img.data, n = img.width * img.height, step = Math.max(1, Math.floor(n / 6000)), pts = [];
    for (let i = 0; i < n; i += step) if (d[4 * i + 3] > 16) pts.push(rgbToLab([d[4 * i], d[4 * i + 1], d[4 * i + 2]]));
    if (!pts.length) return [];
    const R = rng(seed), C = [pts[Math.floor(R() * pts.length)]];
    while (C.length < Math.min(k, pts.length)) {
      const dist = pts.map(p => Math.min(...C.map(c => deltaE(p, c) ** 2)));
      const tot = dist.reduce((a, b) => a + b, 0); if (!(tot > 0)) break;
      let u = R() * tot, j = 0; while (u > dist[j] && j < pts.length - 1) u -= dist[j++];
      C.push(pts[j]);
    }
    const asg = new Int32Array(pts.length);
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < pts.length; i++) { let b = 0, bd = Infinity; for (let c = 0; c < C.length; c++) { const q = deltaE(pts[i], C[c]); if (q < bd) { bd = q; b = c; } } asg[i] = b; }
      const S = C.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < pts.length; i++) { const s = S[asg[i]]; s[0] += pts[i][0]; s[1] += pts[i][1]; s[2] += pts[i][2]; s[3]++; }
      for (let c = 0; c < C.length; c++) if (S[c][3]) C[c] = [S[c][0] / S[c][3], S[c][1] / S[c][3], S[c][2] / S[c][3]];
    }
    let cl = C.map((c, i) => ({ lab: c, n: 0, i }));
    for (let i = 0; i < pts.length; i++) cl[asg[i]].n++;
    cl = cl.filter(c => c.n).sort((a, b) => b.n - a.n);
    const merged = [];
    for (const c of cl) {
      const m = merged.find(q => deltaE(q.lab, c.lab) < 12);
      if (m) { const t = m.n + c.n; m.lab = m.lab.map((v, j) => (v * m.n + c.lab[j] * c.n) / t); m.n = t; } else merged.push({ lab: c.lab.slice(), n: c.n });
    }
    return merged.sort((a, b) => b.n - a.n).map(c => { const rgb = labToRgb(c.lab); return { rgb, hex: hex(rgb), share: c.n / pts.length, lab: c.lab.map(v => +v.toFixed(1)), family: colourFamily(rgb) }; });
  }
  /** how much a rect's mean colour stands out from the whole image (ΔE76 to the image mean colour, excluding the rect) */
  function distinctiveness(img, r) {
    const w = img.width, h = img.height, d = img.data, inS = [0, 0, 0, 0], outS = [0, 0, 0, 0];
    const x0 = Math.floor(r.x * w), x1 = Math.ceil((r.x + r.w) * w), y0 = Math.floor(r.y * h), y1 = Math.ceil((r.y + r.h) * h);
    const step = Math.max(1, Math.floor(Math.sqrt(w * h / 20000)));
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = 4 * (y * w + x), s = x >= x0 && x < x1 && y >= y0 && y < y1 ? inS : outS;
      s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; s[3]++;
    }
    if (!inS[3] || !outS[3]) return 0;
    return deltaE(rgbToLab(inS.slice(0, 3).map(v => v / inS[3])), rgbToLab(outS.slice(0, 3).map(v => v / outS[3])));
  }

  // ---------------------------------------------------------------- faces and gaze cues
  const mean2 = pts => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length });
  /** head direction from landmarks (image px): yaw ≈ (nose tip − eye midpoint) / eye distance.
   *  dir: +1 = turned toward the image's right, −1 = image left, 0 = toward the viewer */
  function gaze(face, thr = 0.16) {
    const le = mean2(face.le), re = mean2(face.re), mid = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 };
    const ed = Math.hypot(re.x - le.x, re.y - le.y) || 1, yaw = (face.nose.x - mid.x) / ed;
    return { yaw: +yaw.toFixed(3), dir: yaw > thr ? 1 : yaw < -thr ? -1 : 0 };
  }
  /** regions a face's head direction points at: region centre on the turned side, within ±50° of horizontal */
  function gazeTargets(faceRect, dir, regions) {
    if (!dir) return [];
    const cx = faceRect.x + faceRect.w / 2, cy = faceRect.y + faceRect.h / 2;
    return (regions || []).filter(r => {
      const dx = r.x + r.w / 2 - cx, dy = r.y + r.h / 2 - cy;
      return Math.sign(dx) === dir && Math.abs(dx) > faceRect.w * 0.5 && Math.abs(dy) <= Math.abs(dx) * 1.2;
    });
  }

  // ---------------------------------------------------------------- layout / reading path
  /** Z-path zone of a point: "tl" | "tr" | "bl" | "br" | "c" (centre third) */
  function zone(p) {
    if (Math.abs(p.x - 0.5) < 1 / 6 && Math.abs(p.y - 0.5) < 1 / 6) return "c";
    return (p.y < 0.5 ? "t" : "b") + (p.x < 0.5 ? "l" : "r");
  }

  // ---------------------------------------------------------------- interpretation
  const KEY_TYPES = ["brand", "product", "cta", "price"];
  /** flags from an analysed creative m = {regions:[{type,share,lift,rank,distinct}], order, textArea, texts:[{level}],
   *  complexity, faces:[{dir, targets:[type]}], palette} -> [{id, status: "good"|"tip"|"info", key, vars}] */
  function findings(m) {
    const F = [], R = m.regions || [], by = t => R.filter(r => r.type === t);
    const best = t => by(t).sort((a, b) => b.share - a.share)[0];
    const brand = best("brand"), cta = best("cta"), price = best("price"), product = best("product");
    // von Restorff: is the CTA isolated (distinct colour) and seen early?
    if (cta) {
      if (cta.rank && cta.rank <= 3) F.push({ id: "restorff", status: "good", key: "f.cta.early", vars: { rank: cta.rank } });
      else F.push({ id: "restorff", status: "tip", key: cta.distinct < 20 ? "f.cta.blend" : "f.cta.late", vars: { de: Math.round(cta.distinct || 0) } });
    } else F.push({ id: "restorff", status: "info", key: "f.cta.none", vars: {} });
    // mere exposure: brand visibility
    if (brand) F.push({ id: "exposure", status: brand.lift >= 1.2 || (brand.rank && brand.rank <= 3) ? "good" : "tip", key: brand.lift >= 1.2 || (brand.rank && brand.rank <= 3) ? "f.brand.seen" : "f.brand.weak", vars: { pct: Math.round(brand.share * 100), lift: +brand.lift.toFixed(1) } });
    else F.push({ id: "exposure", status: "info", key: "f.brand.none", vars: {} });
    // reading pattern: text-heavy -> F; sparse -> Z (brand top-left, CTA bottom-right are conventional)
    const heavy = (m.textArea || 0) > 0.25;
    const ctaZone = cta ? zone({ x: cta.x + cta.w / 2, y: cta.y + cta.h / 2 }) : null;
    F.push({ id: "reading", status: heavy ? "tip" : ctaZone === "br" || ctaZone === "bl" || ctaZone === "c" ? "good" : cta ? "tip" : "info",
      key: heavy ? "f.read.heavy" : cta ? (ctaZone === "br" || ctaZone === "bl" || ctaZone === "c" ? "f.read.cta.ok" : "f.read.cta.top") : "f.read.sparse", vars: { pct: Math.round((m.textArea || 0) * 100) } });
    // anchoring / scarcity / decoy are content strategies: only advice when a price/offer region is marked
    F.push({ id: "anchoring", status: price ? "tip" : "info", key: price ? "f.price.anchor" : "f.price.none", vars: price ? { rank: price.rank || "–" } : {} });
    F.push({ id: "scarcity", status: price ? "tip" : "info", key: price ? "f.scarcity.offer" : "f.scarcity.none", vars: {} });
    F.push({ id: "decoy", status: "info", key: by("price").length >= 2 || by("product").length >= 2 ? "f.decoy.multi" : "f.decoy.single", vars: {} });
    // social proof / faces
    const faces = m.faces || [];
    const cued = faces.filter(f => (f.targets || []).some(t => KEY_TYPES.includes(t)));
    if (cued.length) F.push({ id: "gaze", status: "good", key: "f.gaze.cue", vars: { n: cued.length } });
    else if (faces.some(f => f.dir === 0)) F.push({ id: "gaze", status: product || cta ? "tip" : "info", key: "f.gaze.direct", vars: { n: faces.length } });
    else if (faces.length) F.push({ id: "gaze", status: "tip", key: "f.gaze.away", vars: { n: faces.length } });
    else F.push({ id: "gaze", status: "info", key: "f.gaze.none", vars: {} });
    F.push({ id: "social", status: "info", key: faces.length ? "f.social.faces" : "f.social.none", vars: { n: faces.length } });
    // clarity
    const fails = (m.texts || []).filter(t => t.level === "fail").length;
    if ((m.texts || []).length) F.push({ id: "legibility", status: fails ? "tip" : "good", key: fails ? "f.text.low" : "f.text.ok", vars: { n: fails, of: m.texts.length } });
    if (fin(m.complexity)) F.push({ id: "clutter", status: m.complexity >= 55 ? "tip" : "good", key: m.complexity >= 55 ? "f.clutter.high" : "f.clutter.ok", vars: { s: m.complexity } });
    return F;
  }

  /** predicted score 0..1 with parts; regions shared by type (sum of key-region shares) */
  function score(m) {
    const parts = {};
    const R = (m.regions || []).filter(r => KEY_TYPES.includes(r.type));
    if (R.length) {
      const share = R.reduce((a, r) => a + r.share, 0), area = Math.min(1, R.reduce((a, r) => a + r.area, 0));
      parts.focus = clamp((share - area) / Math.max(0.05, 1 - area) * 2 + 0.5, 0, 1);  // 0.5 = no better than its area
      parts.early = R.some(r => r.rank && r.rank <= 2) ? 1 : R.some(r => r.rank && r.rank <= 4) ? 0.6 : 0.2;
    }
    const T = m.texts || [];
    if (T.length) parts.legible = T.filter(t => t.level !== "fail").length / T.length;
    if (fin(m.complexity)) parts.clarity = 1 - clamp((m.complexity - 35) / 45, 0, 1);
    if (fin(m.textArea)) parts.text = 1 - clamp((m.textArea - 0.2) / 0.3, 0, 1);
    const W = { focus: 0.35, early: 0.2, legible: 0.2, clarity: 0.15, text: 0.1 };
    let s = 0, ws = 0; for (const k in parts) { s += W[k] * parts[k]; ws += W[k]; }
    return { total: ws ? s / ws : null, parts };
  }
  /** rank creatives by predicted score; winner only when ahead by ≥ margin, else "close" */
  function compare(list, margin = 0.06) {
    const rows = list.map((m, i) => ({ i, name: m.name, ...score(m) })).sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
    const close = rows.length < 2 || rows[0].total == null || rows[1].total == null || rows[0].total - rows[1].total < margin;
    // which parts decide it: where the leader is ≥ 0.15 ahead of the runner-up
    const why = !close ? Object.keys(rows[0].parts).filter(k => rows[1].parts[k] != null && rows[0].parts[k] - rows[1].parts[k] >= 0.15) : [];
    const sameRegions = list.length > 1 && list.every(m => (m.regions || []).some(r => KEY_TYPES.includes(r.type))) ;
    return { rows, winner: close ? null : rows[0].i, close, why, sameRegions };
  }

  return {
    VERSION, PARAMS, MAP_SIDE, KEY_TYPES, rng, clamp, fitSize, resample, rgbPlanes, labPlanes, blur, normalize, fft1, fft2,
    relLuminance, contrastRatio, wcagLevel, rgbToLab, labToRgb, deltaE, hex, colourFamily,
    spectralResidual, srChannel, ittiLite, ittiN, centerBias, boxPrior, components, combine, saliency,
    regionShare, fixationOrder, regionReport, nss, cc, aucJudd, aucBorji,
    gray, edgeDensity, colorfulness, colorfulBand, colourCount, complexityScore, complexityBand, otsu, detectText, rectsArea, textContrast,
    palette, distinctiveness, gaze, gazeTargets, zone, findings, score, compare
  };
});
