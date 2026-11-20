/* palm-v3-lines.js — palm principal-line finder v3 (SPIKE, owner order 2026-11-20), behind the existing switch window.LENSIQ_PALM_V2
   plus its own sub-switch window.LENSIQ_PALM_V3_LINES (default off). Does NOT replace palm-v2-detect.js until the reviewer and the
   owner agree. Our own code, written from the papers; no model weights, no outside data, nothing leaves the device.
   Pipeline:
   1 canonical ROI from the hand frame (u: index knuckle -> little-finger knuckle, v: knuckle line -> wrist). Because u always runs
     index -> little finger, a right hand lands in the same layout as a left hand (mirrored). Two scales: s = 224 px per palm width
     for the majors, 640 for the minors. Area-averaged sampling (no aliasing from a 1000 px palm).
   2 photometric normalisation: grey = (G + B) / 2 (creases show best in G and B; R is weakest: measured on the owner's development
     photos, dev only), divided by the masked Gaussian skin background (sigma 0.06 PW); near a hard shadow step, where an
     edge-aware (bilateral, range 0.18 on the log ratio) background differs from it by more than 2-5 %, the edge-aware one is used,
     so no dark halo appears along the step (owner item 185-2, dev seeds only); then CLAHE. Creases are dark valleys: every filter
     looks for minima.
   3 line energy + direction, three methods (selectable): "mfrat" (Huang, Jia & Zhang, Pattern Recognition 2008: 12 directions in a
     p x p window, line width matched to the crease, energy = window mean - darkest line mean, direction = argmin), "wld" (wide line
     detector, Liu, Zhang & You, IEEE TIP 2007: isotropic nonlinear filter, a circular mask counts pixels not brighter than the
     centre; response = half the mask area minus that count), "comp" (competitive-code style: real Gabor bank, 12 orientations,
     winner-take-all on the minimum response, Kong & Zhang ICPR 2004).
   4 wrinkle removal by energy AND direction (Huang et al.): each line scores only energy whose direction agrees with the curve
     tangent (cos^2) and lies in the line's expected direction band.
   5 curve fitting instead of thresholding: each line is a cubic Bezier with start / end zones relative to the hand frame
     (BezierPalm, ECCV 2022 uses Bezier palm lines); maximise mean directional energy; then a minimal path (Dijkstra, cost = inverse
     energy, turn penalty) inside a corridor so the drawn line follows the real crease.
   6 confidence without a big dataset: per palm, a null distribution from many random curves of the same family (z = (S - mu) / sd)
     plus the same search on rotated / mirrored energy maps (reported); a line is drawn solid only when z >= Z_LIMIT; otherwise the
     page shows "not clear in this photo". Z_LIMIT is set on DEV synthetic seeds only (never on the locked test seeds or any photo).
   7 minors (second pass, s = 640): fate, sun, mercury (near-vertical), bracelet (across the wrist), girdle (above the heart line).
     Marriage lines sit on the edge of the hand and are usually not visible in a frontal photo: never searched, said plainly.
   Every constant is PROVISIONAL (synthetic dev seeds). Browser: window.PalmV3Lines · Node: module.exports. */
(function (root) {
  "use strict";
  var CFG = { sMaj: 224, sMin: 512, u0: -0.3, u1: 1.25, v0: -0.08, v1: 1.15, normSigma: 0.06, claheTiles: 8, claheClip: 2.5,
    method: "mfrat", norm: (typeof process !== "undefined" && process.env && process.env.LQ_V3_NORM) || "hybrid", bilRange: 0.18, hybLo: +((typeof process !== "undefined" && process.env && process.env.LQ_V3_HLO) || 0.02), hybHi: +((typeof process !== "undefined" && process.env && process.env.LQ_V3_HHI) || 0.05), cap: +((typeof process !== "undefined" && process.env && process.env.LQ_V3_CAP) || 1e9),
        erode: +((typeof process !== "undefined" && process.env && process.env.LQ_V3_ERODE) || 0), nRandom: 500, nSearch: 1200, PROVISIONAL: true };
  /* PROVISIONAL z limit, set 2026-11-20 on DEV synthetic seeds only (never on the locked test seeds, never on a photo), for the
     MFRAT map with the two-flank valley check: 153 crease-free dev textures (seeds 201-213: textures.js, tex2.js crease-free
     effects, synth-real texture) gave max z 7.68 (darkSkin), p95 6.21; realistic dev creases (synth-real seeds 101-112, full depth)
     gave min z 7.77 / 8.75 / 9.37 (heart), 10.79 (head), 15.85 (life). 8.2 = 0.5 above the whole dev null; one dev heart of 12
     falls below it. Faint creases (depth x 0.6) fall below it often (heart down to z 4.2): they are shown as "not clear". */
  var Z_LIMIT = 8.2;
  var MAJORS = ["heart", "head", "life"], MINORS = ["fate", "sun", "mercury", "bracelet", "girdle"];
  /* zone priors in the hand frame (u, v): start box, end box, bend range (PW, along the chord normal), direction band of the chord
     (degrees from the +u axis, image y down), drawn-length minimum (PW) */
  var PRIOR = {
    heart: { a: [[0.92, 1.2], [0.0, 0.32]], b: [[-0.1, 0.45], [-0.06, 0.24]], bend: 0.08, band: [-35, 35] },
    head: { a: [[-0.22, 0.15], [0.08, 0.36]], b: [[0.45, 0.95], [0.24, 0.66]], bend: 0.08, band: [0, 60] },
    life: { a: [[-0.12, 0.28], [0.1, 0.36]], b: [[0.15, 0.62], [0.68, 1.06]], bend: 0.16, band: [45, 110] },
    fate: { a: [[0.3, 0.7], [0.65, 1.05]], b: [[0.3, 0.7], [0.12, 0.5]], bend: 0.05, band: [-115, -65] },
    sun: { a: [[0.55, 0.8], [0.3, 0.6]], b: [[0.55, 0.8], [0.02, 0.25]], bend: 0.04, band: [-115, -65] },
    mercury: { a: [[0.75, 1.05], [0.35, 0.75]], b: [[0.8, 1.08], [0.05, 0.3]], bend: 0.05, band: [-120, -60] },
    bracelet: { a: [[0.0, 0.25], [0.98, 1.14]], b: [[0.7, 1.05], [0.98, 1.14]], bend: 0.04, band: [-20, 20] },
    girdle: { a: [[0.15, 0.4], [-0.04, 0.12]], b: [[0.6, 0.9], [-0.04, 0.12]], bend: 0.06, band: [-30, 30] }
  };
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function frameFromHand(h) {
    var A = h.mcp.index, B = h.mcp.pinky, W = h.wrist, M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    var U = [B[0] - A[0], B[1] - A[1]], V = [W[0] - M[0], W[1] - M[1]], pw = Math.hypot(U[0], U[1]);
    return { A: A, U: U, V: V, pw: pw, asp: Math.hypot(V[0], V[1]) / (pw || 1), toImg: function (q) { return [A[0] + q[0] * U[0] + q[1] * V[0], A[1] + q[0] * U[1] + q[1] * V[1]]; } };
  }
  /* ---------------- 1 canonical ROI ---------------- */
  function roi(rgba, W, H, F, s) {
    var w = Math.round((CFG.u1 - CFG.u0) * s), h = Math.round((CFG.v1 - CFG.v0) * s * F.asp), n = w * h;
    var g = new Float32Array(n), skin = new Uint8Array(n), k = clamp(Math.ceil(F.pw / s), 1, 4);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var sg = 0, sr = 0, sb = 0, sgg = 0, cnt = 0;
      for (var j = 0; j < k; j++) for (var i = 0; i < k; i++) {
        var p = F.toImg([CFG.u0 + (x + (i + 0.5) / k) / s, CFG.v0 + (y + (j + 0.5) / k) / (s * F.asp)]), X = Math.floor(p[0]), Y = Math.floor(p[1]);
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        var o = (Y * W + X) * 4; sr += rgba[o]; sgg += rgba[o + 1]; sb += rgba[o + 2]; cnt++;
      }
      var I = y * w + x;
      if (!cnt) continue;
      sr /= cnt; sgg /= cnt; sb /= cnt; sg = (sgg + sb) / 2;
      g[I] = sg;
      var cb = 128 - 0.1687 * sr - 0.3313 * sgg + 0.5 * sb, cr = 128 + 0.5 * sr - 0.4187 * sgg - 0.0813 * sb;
      skin[I] = cr > 128 && cr < 195 && cb > 60 && cb < 140 && sr > sb && sr > 20 ? 1 : 0;
    }
    var m = morph(morph(skin, w, h, 3, true), w, h, 3, false); // close crease holes
    m = largest(m, w, h);
    var inner = morph(m, w, h, Math.max(2, Math.round(0.025 * s)), false); // energy is not trusted near the hand edge
    return { g: g, mask: m, inner: inner, w: w, h: h, s: s, asp: F.asp };
  }
  function morph(m, w, h, r, dil) {
    var tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), x, y, k;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var v = dil ? 0 : 1; for (k = -r; k <= r; k++) { var xx = x + k, q = xx < 0 || xx >= w ? 0 : m[y * w + xx];
        if (dil ? q : !q) { v = dil ? 1 : 0; break; } } tmp[y * w + x] = v; }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var u = dil ? 0 : 1; for (k = -r; k <= r; k++) { var yy = y + k, q2 = yy < 0 || yy >= h ? 0 : tmp[yy * w + x];
        if (dil ? q2 : !q2) { u = dil ? 1 : 0; break; } } out[y * w + x] = u; }
    return out;
  }
  function largest(m, w, h) { // keep the largest connected skin region (the palm)
    var lab = new Int32Array(w * h), best = 0, bestN = 0, cur = 0, st = [];
    for (var i = 0; i < w * h; i++) if (m[i] && !lab[i]) {
      cur++; var cnt = 0; lab[i] = cur; st.push(i);
      while (st.length) { var p = st.pop(), x = p % w, y = (p - x) / w; cnt++;
        if (x > 0 && m[p - 1] && !lab[p - 1]) { lab[p - 1] = cur; st.push(p - 1); } if (x < w - 1 && m[p + 1] && !lab[p + 1]) { lab[p + 1] = cur; st.push(p + 1); }
        if (y > 0 && m[p - w] && !lab[p - w]) { lab[p - w] = cur; st.push(p - w); } if (y < h - 1 && m[p + w] && !lab[p + w]) { lab[p + w] = cur; st.push(p + w); } }
      if (cnt > bestN) { bestN = cnt; best = cur; }
    }
    var out = new Uint8Array(w * h); for (var j = 0; j < w * h; j++) out[j] = lab[j] === best ? 1 : 0;
    return out;
  }
  function blur(src, w, h, sigma) {
    var r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1), s = 0, i, x, y;
    for (i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
    for (i = 0; i < k.length; i++) k[i] /= s;
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (y = 0; y < h; y++) { var row = y * w; for (x = 0; x < w; x++) { var a = 0; for (i = -r; i <= r; i++) { var xx = x + i; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx;
        a += src[row + xx] * k[i + r]; } tmp[row + x] = a; } }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var b = 0; for (i = -r; i <= r; i++) { var yy = y + i; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy; b += tmp[yy * w + x] * k[i + r];
        } out[y * w + x] = b; }
    return out;
  }
  /* ---------------- 2 photometric normalisation ---------------- */
  function clahe(v, mask, w, h, tiles, clip) {
    var tw = Math.ceil(w / tiles), th = Math.ceil(h / tiles), maps = [], tx, ty, i, x, y;
    for (ty = 0; ty < tiles; ty++) for (tx = 0; tx < tiles; tx++) {
      var hist = new Float32Array(256), cnt = 0;
      for (y = ty * th; y < Math.min(h, (ty + 1) * th); y++) for (x = tx * tw; x < Math.min(w, (tx + 1) * tw); x++) { i = y * w + x; if (!mask[i]) continue; hist[clamp(Math.round(v[i]), 0,
          255)]++; cnt++; }
      var map = new Float32Array(256);
      if (cnt < 16) { for (i = 0; i < 256; i++) map[i] = i; maps.push(map); continue; }
      var lim = clip * cnt / 256, ex = 0; for (i = 0; i < 256; i++) if (hist[i] > lim) { ex += hist[i] - lim; hist[i] = lim; }
      var add = ex / 256, c = 0; for (i = 0; i < 256; i++) { c += hist[i] + add; map[i] = 255 * c / cnt; }
      maps.push(map);
    }
    var out = new Float32Array(w * h);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; if (!mask[i]) { out[i] = 128; continue; }
      var gx = (x + 0.5) / tw - 0.5, gy = (y + 0.5) / th - 0.5, x0 = clamp(Math.floor(gx), 0, tiles - 1), y0 = clamp(Math.floor(gy), 0, tiles - 1);
      var x1 = Math.min(tiles - 1, x0 + 1), y1 = Math.min(tiles - 1, y0 + 1), fx = clamp(gx - x0, 0, 1), fy = clamp(gy - y0, 0, 1), b = clamp(Math.round(v[i]), 0, 255);
      out[i] = (maps[y0 * tiles + x0][b] * (1 - fx) + maps[y0 * tiles + x1][b] * fx) * (1 - fy) + (maps[y1 * tiles + x0][b] * (1 - fx) + maps[y1 * tiles + x1][b] * fx) * fy;
    }
    return out;
  }
  /** skin background for the normalisation. "gauss": masked Gaussian (sigma 0.06 PW). "bilateral" (185-2): the same, but each
      pixel's background averages only skin of similar brightness (range weight on the log ratio, sigma CFG.bilRange), computed at
      full resolution on a sparse support, so the far side of a hard shadow step does not leak into it and no
      dark halo appears along the step; crease-level darkening (8-14 %) stays inside the range kernel. */
  function background(R) {
    var w = R.w, h = R.h, n = w * h, i, sg = CFG.normSigma * R.s;
    var mf = new Float32Array(n), gm = new Float32Array(n); for (i = 0; i < n; i++) { mf[i] = R.mask[i]; gm[i] = R.mask[i] ? R.g[i] : 0; }
    var bg = blur(gm, w, h, sg), bm = blur(mf, w, h, sg), out = new Float32Array(n);
    for (i = 0; i < n; i++) out[i] = bm[i] > 1e-3 ? bg[i] / bm[i] : 1;
    if (CFG.norm !== "bilateral" && CFG.norm !== "hybrid") return out;
    // full resolution, sparse support: every 3rd pixel within 2.2 sigma; range weight on the log ratio to this pixel's own
    // (lightly smoothed) brightness, so skin across a hard shadow step does not count
    var g0 = blur(R.g, w, h, 0.7), lg = new Float32Array(n), x, y; for (i = 0; i < n; i++) lg[i] = Math.log(Math.max(1, g0[i]));
    var st = 3, rad = Math.ceil(2.2 * sg / st) * st, rs = CFG.bilRange, out2 = new Float32Array(n), offs = [];
    for (var dy = -rad; dy <= rad; dy += st) for (var dx = -rad; dx <= rad; dx += st) { var sp = Math.exp(-(dx * dx + dy * dy) / (2 * sg * sg)); if (sp > 0.01) offs.push(dx, dy, sp); }
    var inv = 1 / (2 * rs * rs);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; if (!R.mask[i]) { out2[i] = 1; continue; }
      var c0 = lg[i], sw = 0, sv = 0;
      for (var k = 0; k < offs.length; k += 3) { var xx = x + offs[k], yy = y + offs[k + 1]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; var q = yy * w + xx; if (!R.mask[q]) continue;
        var dr = lg[q] - c0, wt = offs[k + 2] * Math.exp(-dr * dr * inv); sw += wt; sv += wt * lg[q]; }
      out2[i] = sw ? Math.exp(sv / sw) : Math.max(1, g0[i]);
    }
    if (CFG.norm === "hybrid") { // the edge-aware background only where it differs strongly from the plain one (near a hard step)
      for (i = 0; i < n; i++) { if (!R.mask[i]) continue; var lr = Math.abs(Math.log(Math.max(1, out2[i]) / Math.max(1, out[i]))), wb = clamp((lr - CFG.hybLo) / (CFG.hybHi - CFG.hybLo), 0, 1);
        out2[i] = Math.exp((1 - wb) * Math.log(Math.max(1, out[i])) + wb * Math.log(Math.max(1, out2[i]))); }
    }
    return out2;
  }
  function normalise(R) {
    var w = R.w, h = R.h, n = w * h, i, b = background(R), v = new Float32Array(n);
    for (i = 0; i < n; i++) v[i] = R.mask[i] ? clamp(128 + (R.g[i] / Math.max(b[i], 1) - 1) * 400, 0, 255) : 128;
    var c = clahe(v, R.mask, w, h, CFG.claheTiles, CFG.claheClip);
    return blur(c, w, h, 0.6);
  }
  /* ---------------- 3 line energy + direction ---------------- */
  var NDIR = 12;
  /** MFRAT: p x p window, 12 directions, line width L px; energy = window mean - darkest line mean; direction = argmin */
  function mfrat(N, mask, w, h, p, L) {
    var r = (p - 1) >> 1, E = new Float32Array(w * h), D = new Float32Array(w * h), A = new Float32Array(w * h), offs = [], sides = [], d, t, l;
    for (d = 0; d < NDIR; d++) {
      var th = d * Math.PI / NDIR, c = Math.cos(th), s = Math.sin(th), set = {}, list = [];
      var tStep = p > 21 ? 1 : 0.5, lStep = L > 3 ? (L - 1) / 2 : 1; // large windows (minor scale): sparser samples, same geometry
      for (t = -r; t <= r; t += tStep) for (l = -(L - 1) / 2; l <= (L - 1) / 2 + 1e-9; l += lStep) { var dx = Math.round(t * c - l * s), dy = Math.round(t * s + l * c), key = dx + "," + dy;
          if (!set[key]) { set[key] = 1; list.push(dx, dy); } }
      offs.push(list);
      // the two flanking lines (both sides of the crease, 1.5 px beyond its half width): a valley is darker than BOTH sides,
      // a shadow step edge is darker than one side only (keeps MFRAT from answering to shading edges)
      // two flank distances: just beyond the matched width (narrow creases) and about 2 x beyond it (wide head-line creases)
      var pair = [(L - 1) / 2 + 1.5, L + 1.5].map(function (off) { var sa = [], sb = [];
        for (var tt = -r; tt <= r; tt += 1) { sa.push(Math.round(tt * c - off * s), Math.round(tt * s + off * c)); sb.push(Math.round(tt * c + off * s), Math.round(tt * s - off * c)); }
        return [sa, sb]; });
      sides.push(pair);
    }
    // window mean by integral image
    var I = new Float64Array((w + 1) * (h + 1)), x, y;
    for (y = 0; y < h; y++) { var row = 0; for (x = 0; x < w; x++) { row += N[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
    for (y = r; y < h - r; y++) for (x = r; x < w - r; x++) {
      var i = y * w + x; if (!mask[i]) continue;
      var x0 = x - r, y0 = y - r, x1 = x + r + 1, y1 = y + r + 1, mean = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / (p * p);
      var best = 1e9, bd = 0;
      for (d = 0; d < NDIR; d++) { var o = offs[d], sum = 0; for (var k = 0; k < o.length; k += 2) sum += N[i + o[k + 1] * w + o[k]]; sum /= o.length / 2; if (sum < best) { best = sum; bd = d; } }
      var fl = [], fa = [], fb = [];
      for (var pp = 0; pp < 2; pp++) { var sd2 = sides[bd][pp], ma = 0, mb = 0;
        for (var q = 0; q < sd2[0].length; q += 2) { ma += N[clamp(i + sd2[0][q + 1] * w + sd2[0][q], 0, w * h - 1)]; mb += N[clamp(i + sd2[1][q + 1] * w + sd2[1][q], 0, w * h - 1)]; }
        ma /= sd2[0].length / 2; mb /= sd2[1].length / 2; fa.push(ma); fb.push(mb); fl.push(Math.min(ma, mb)); }
      var flank = Math.max(fl[0], fl[1]), depth = Math.max(0, Math.min(mean - best, flank - best));
      // wall asymmetry |left wall - right wall| / depth: a crease rises on both walls (dev photos under side light: median 0.20-0.27,
      // 90th percentile 0.38-0.52); the dark halo that a shadow STEP leaves after normalisation has one wall far higher than the
      // other (asymmetry > 1). Energy fades from asymmetry 0.7 and is gone at 1.1
      var hiA = Math.max(fa[0], fa[1]), hiB = Math.max(fb[0], fb[1]), asym = depth > 0 ? Math.abs(hiA - hiB) / (Math.max(hiA, hiB) - best + 1e-6) : 0;
      E[i] = depth * clamp((1.1 - asym) / 0.4, 0, 1); D[i] = bd * Math.PI / NDIR; A[i] = asym;
    }
    return { E: E, D: D, A: A };
  }
  /** structure-tensor line direction (along the line) of a grey image */
  function tensorDir(N, w, h, sigma) {
    var gx = new Float32Array(w * h), gy = new Float32Array(w * h), x, y, i;
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x; gx[i] = (N[i + 1] - N[i - 1]) / 2; gy[i] = (N[i + w] - N[i - w]) / 2; }
    var xx = new Float32Array(w * h), yy = new Float32Array(w * h), xy = new Float32Array(w * h);
    for (i = 0; i < w * h; i++) { xx[i] = gx[i] * gx[i]; yy[i] = gy[i] * gy[i]; xy[i] = gx[i] * gy[i]; }
    xx = blur(xx, w, h, sigma); yy = blur(yy, w, h, sigma); xy = blur(xy, w, h, sigma);
    var D = new Float32Array(w * h);
    for (i = 0; i < w * h; i++) { var a = 0.5 * Math.atan2(2 * xy[i], xx[i] - yy[i]); D[i] = ((a + Math.PI / 2) % Math.PI + Math.PI) % Math.PI; } // gradient dir + 90 deg
    return D;
  }
  /** wide line detector (dark lines): m = sum over a disc of sech^5(max(0, I(x) - I(x0)) / t); response = g - m if m < g (g = half the disc) */
  function wld(N, mask, w, h, r, t) {
    var offs = [], dx, dy; for (dy = -r; dy <= r; dy++) for (dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) offs.push(dy * w + dx);
    var g = offs.length / 2, E = new Float32Array(w * h), LUT = new Float32Array(256);
    for (var k = 0; k < 256; k++) { var c = 1 / Math.cosh(k / t); LUT[k] = c * c * c * c * c; }
    for (var y = r; y < h - r; y++) for (var x = r; x < w - r; x++) {
      var i = y * w + x; if (!mask[i]) continue;
      var c0 = N[i], m = 0; for (var j = 0; j < offs.length; j++) { var dd = N[i + offs[j]] - c0; m += dd <= 0 ? 1 : LUT[Math.min(255, Math.round(dd))]; }
      E[i] = m < g ? (g - m) / g : 0;
    }
    return { E: E, D: tensorDir(N, w, h, 2) };
  }
  /** competitive-code style: even (real) Gabor, 12 orientations, winner-take-all on the minimum response (dark line) */
  function comp(N, mask, w, h, lambda) {
    var sig = 0.5 * lambda, R = Math.ceil(2.2 * sig), E = new Float32Array(w * h), D = new Float32Array(w * h), best = new Float32Array(w * h).fill(1e9), d;
    for (d = 0; d < NDIR; d++) {
      var th = d * Math.PI / NDIR, ct = Math.cos(th), st = Math.sin(th), K = [], sum = 0, cnt = 0;
      for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) {
        var along = dx * ct + dy * st, across = -dx * st + dy * ct; // line direction th: the profile runs across
        var v = Math.exp(-(across * across + 0.25 * along * along) / (2 * sig * sig)) * Math.cos(2 * Math.PI * across / lambda);
        if (Math.abs(v) > 0.01) { K.push(dy * w + dx, v); sum += v; cnt++; }
      }
      var mean = sum / cnt, norm = 0; for (var q = 1; q < K.length; q += 2) { K[q] -= mean; norm += Math.abs(K[q]); }
      for (q = 1; q < K.length; q += 2) K[q] /= norm / 2;
      for (var y = R; y < h - R; y++) for (var x = R; x < w - R; x++) {
        var i = y * w + x; if (!mask[i]) continue;
        var acc = 0; for (var k = 0; k < K.length; k += 2) acc += N[i + K[k]] * K[k + 1];
        if (acc < best[i]) { best[i] = acc; D[i] = th; }
      }
    }
    for (var j = 0; j < w * h; j++) E[j] = mask[j] && best[j] < 0 ? -best[j] : 0;
    return { E: E, D: D };
  }
  /** energy map of the chosen method, scaled by the median energy on the inner palm (scale-free) */
  function energy(N, R, method) {
    var s = R.s, out;
    var cw = Math.max(1, 0.013 * s); // crease FWHM about 0.013 PW (dev measurement)
    if (method === "wld") out = wld(N, R.mask, R.w, R.h, Math.max(3, Math.round(1.6 * cw)), 6);
    else if (method === "comp") out = comp(N, R.mask, R.w, R.h, Math.max(4, 3 * cw));
    else out = mfrat(N, R.mask, R.w, R.h, 2 * Math.round(0.035 * s) + 1, Math.max(1, Math.round(cw)));
    var vals = [], i; for (i = 0; i < out.E.length; i += 3) if (R.inner[i]) vals.push(out.E[i]);
    vals.sort(function (a, b) { return a - b; });
    var med = vals[vals.length >> 1] || 1e-6, p90 = vals[Math.floor(vals.length * 0.9)] || 1e-6, sc = Math.max(med, 0.25 * p90, 1e-6);
    for (i = 0; i < out.E.length; i++) out.E[i] = R.inner[i] ? out.E[i] / sc : 0;
    out.method = method || "mfrat";
    return out;
  }
  /* ---------------- 5 curve family + scoring ---------------- */
  /** the Bezier for t in [0, 1]; beyond its ends it continues straight along the end tangent (used to look past the fitted ends) */
  function bezExt(P, t) {
    if (t >= 0 && t <= 1) return bez(P, t);
    var a = t < 0 ? P[0] : P[3], b = t < 0 ? P[1] : P[2], dx = 3 * (a[0] - b[0]), dy = 3 * (a[1] - b[1]), d = t < 0 ? -t : t - 1;
    if (t < 0) return [a[0] + dx * d, a[1] + dy * d];
    return [a[0] + dx * d, a[1] + dy * d];
  }
  function bez(P, t) { var a = 1 - t; return [a * a * a * P[0][0] + 3 * a * a * t * P[1][0] + 3 * a * t * t * P[2][0] + t * t * t * P[3][0],
      a * a * a * P[0][1] + 3 * a * a * t * P[1][1] + 3 * a * t * t * P[2][1] + t * t * t * P[3][1]]; }
  /** params [ax, ay, bx, by, b1, b2] in metric frame units (u, v * asp) -> control points */
  function ctrl(q) {
    var ax = q[0], ay = q[1], bx = q[2], by = q[3], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9, nx = -dy / L, ny = dx / L;
    return [[ax, ay], [ax + dx / 3 + nx * q[4], ay + dy / 3 + ny * q[4]], [ax + 2 * dx / 3 + nx * q[5], ay + 2 * dy / 3 + ny * q[5]], [bx, by]];
  }
  /** per-sample directional energy along a curve (metric frame units -> ROI px); band = allowed line direction band (rad) or null */
  function samples(M, P, ns, band, ta, tb) {
    var s = M.s, out = new Float32Array(ns), pts = [], t0 = ta == null ? 0 : ta, t1 = tb == null ? 1 : tb;
    for (var k = 0; k < ns; k++) pts.push(bezExt(P, t0 + (t1 - t0) * k / (ns - 1)));
    for (k = 0; k < ns; k++) {
      var a = pts[Math.max(0, k - 1)], b = pts[Math.min(ns - 1, k + 1)], th = Math.atan2(b[1] - a[1], b[0] - a[0]);
      var nx = -Math.sin(th), ny = Math.cos(th), best = 0;
      for (var o = -1; o <= 1; o++) {
        var x = Math.round((pts[k][0] - CFG.u0) * s + nx * o), y = Math.round((pts[k][1] - CFG.v0 * M.asp) * s + ny * o);
        if (x < 0 || y < 0 || x >= M.w || y >= M.h) continue;
        var i = y * M.w + x, e = M.E[i]; if (!e) continue;
        var dd = M.D[i] - th, c = Math.cos(dd), ag = c * c;
        if (band && !inBand(M.D[i], band)) ag *= 0.15;
        e *= ag; if (e > best) best = e;
      }
      out[k] = best;
    }
    return out;
  }
  function inBand(d, band) { // d in [0, pi): line direction; band [lo, hi] degrees (any sign); lines are undirected
    var deg = d * 180 / Math.PI;
    for (var k = -1; k <= 1; k++) { var x = deg + 180 * k; if (x >= band[0] - 10 && x <= band[1] + 10) return true; }
    return false;
  }
  /** curve score = mean of the CAPPED directional energy along the curve: a continuous crease scores high everywhere; a chain of a
      few very dark short wrinkles cannot buy the score back with a handful of strong samples */
  function score(M, q, band) {
    var e = samples(M, ctrl(q), 60, band), s = 0, cap = CFG.cap, r = CFG.erode, n = e.length;
    for (var k = 0; k < n; k++) { var m = e[k]; for (var j = Math.max(0, k - r); j <= Math.min(n - 1, k + r); j++) if (e[j] < m) m = e[j]; s += m < cap ? m : cap; }
    return s / n;
  }
  function priorBox(id, asp) { var P = PRIOR[id]; return { ax: P.a[0], ay: [P.a[1][0] * asp, P.a[1][1] * asp], bx: P.b[0], by: [P.b[1][0] * asp, P.b[1][1] * asp], bend: P.bend }; }
  function sampleIn(B, r) { return [B.ax[0] + r() * (B.ax[1] - B.ax[0]), B.ay[0] + r() * (B.ay[1] - B.ay[0]), B.bx[0] + r() * (B.bx[1] - B.bx[0]), B.by[0] + r() * (B.by[1] - B.by[0]),
      (r() * 2 - 1) * B.bend, (r() * 2 - 1) * B.bend]; }
  function clampQ(q, B) { return [clamp(q[0], B.ax[0], B.ax[1]), clamp(q[1], B.ay[0], B.ay[1]), clamp(q[2], B.bx[0], B.bx[1]), clamp(q[3], B.by[0], B.by[1]), clamp(q[4], -B.bend, B.bend),
      clamp(q[5], -B.bend, B.bend)]; }
  /** zone-prior search: random candidates -> top K -> coordinate hill climb */
  function search(M, id, r, nCand) {
    var B = priorBox(id, M.asp), band = PRIOR[id].band, cands = [];
    for (var k = 0; k < nCand; k++) { var q = sampleIn(B, r); cands.push({ q: q, s: score(M, q, band) }); }
    cands.sort(function (a, b) { return b.s - a.s; });
    var best = null;
    cands.slice(0, 12).forEach(function (c) {
      var q = c.q.slice(), s0 = c.s, step = 0.03;
      for (var it = 0; it < 5 && step > 0.004; it++) {
        var improved = false;
        for (var j = 0; j < 6; j++) for (var sg = -1; sg <= 1; sg += 2) {
          var q2 = q.slice(); q2[j] += sg * step; q2 = clampQ(q2, B); var s2 = score(M, q2, band);
          if (s2 > s0) { s0 = s2; q = q2; improved = true; }
        }
        if (!improved) step /= 2;
      }
      if (!best || s0 > best.s) best = { q: q, s: s0 };
    });
    return best;
  }
  /** geometry refit (drawing only; the z score uses the mean-energy fit): starting from the fit, maximise the INTEGRATED energy
      above 0.6 x the fit's own median energy, sum (e - level) x length, with the end boxes widened by 0.1 PW, so the drawn curve follows the
      whole crease instead of its strongest stretch */
  function refit(M, id, q0, tau) {
    var B = priorBox(id, M.asp), W = 0.1, band = PRIOR[id].band;
    var BB = { ax: [B.ax[0] - W, B.ax[1] + W], ay: [B.ay[0] - W, B.ay[1] + W], bx: [B.bx[0] - W, B.bx[1] + W], by: [B.by[0] - W, B.by[1] + W], bend: B.bend * 1.5 };
    var e0 = Array.from(samples(M, ctrl(q0), 80, band)).sort(function (x, y) { return x - y; }), medFit = Math.max(tau, e0[e0.length >> 1]);
    var lvl = Math.max(tau, 0.6 * medFit), cap = 2 * medFit; // extending only pays where the crease is at least 0.6 x as strong as itself
    var G = function (q) { var P = ctrl(q), e = samples(M, P, 80, band), L = 0, a = bez(P, 0), sum = 0;
      for (var k = 1; k <= 8; k++) { var b = bez(P, k / 8); L += Math.hypot(b[0] - a[0], b[1] - a[1]); a = b; }
      for (var j = 0; j < e.length; j++) sum += Math.min(e[j], cap) - lvl;
      return sum / e.length * L; };
    var q = q0.slice(), g0 = G(q), step = 0.04;
    for (var it = 0; it < 40 && step > 0.004; it++) {
      var improved = false;
      for (var j = 0; j < 6; j++) for (var sg = -1; sg <= 1; sg += 2) { var q2 = q.slice(); q2[j] += sg * step; q2 = clampQ(q2, BB); var g2 = G(q2); if (g2 > g0) { g0 = g2; q = q2;
          improved = true; } }
      if (!improved) step /= 2;
    }
    return q;
  }
  /* ---------------- 6 null distribution ---------------- */
  /** random curves of the same family anywhere on the inner palm (same chord length range, any orientation) */
  function nullRandom(M, id, r, n) {
    var B = priorBox(id, M.asp), out = [], tries = 0;
    var Lmin = Math.hypot(B.bx[0] - B.ax[1], B.by[0] - B.ay[1]), Lmax = Math.hypot(B.bx[1] - B.ax[0], B.by[1] - B.ay[0]);
    Lmin = Math.max(0.15, Math.min(Lmin, Lmax * 0.6));
    while (out.length < n && tries < n * 20) {
      tries++;
      var L = Lmin + r() * (Lmax - Lmin), th = r() * 2 * Math.PI, ax = -0.1 + r() * 1.2, ay = (0.0 + r() * 1.05) * M.asp;
      var q = [ax, ay, ax + L * Math.cos(th), ay + L * Math.sin(th), (r() * 2 - 1) * B.bend, (r() * 2 - 1) * B.bend];
      var P = ctrl(q), ok = true;
      for (var k = 0; k <= 4 && ok; k++) { var p = bez(P, k / 4), x = Math.round((p[0] - CFG.u0) * M.s), y = Math.round((p[1] - CFG.v0 * M.asp) * M.s);
          ok = x >= 0 && y >= 0 && x < M.w && y < M.h && M.inner[y * M.w + x]; }
      if (!ok) continue;
      // the random curve is scored against ITS OWN direction (no zone band): the background level of a curve of this family
      out.push(score(M, q, null));
    }
    out.sort(function (a, b) { return a - b; });
    var mu = 0; out.forEach(function (v) { mu += v; }); mu /= out.length || 1;
    var sd = 0; out.forEach(function (v) { sd += (v - mu) * (v - mu); }); sd = Math.sqrt(sd / Math.max(1, out.length - 1)) || 1e-6;
    return { mu: mu, sd: sd, n: out.length, p99: out[Math.floor(out.length * 0.99)] || 0, max: out[out.length - 1] || 0 };
  }
  /** the same zone search on a transformed energy map (rotate 90 / 180 / 270, mirror): report-only second null */
  function transformMap(M, kind) {
    var w = M.w, h = M.h, E = new Float32Array(w * h), D = new Float32Array(w * h), inner = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var sx, sy, dmap;
      if (kind === "rot180") { sx = w - 1 - x; sy = h - 1 - y; dmap = function (d) { return d; }; }
      else if (kind === "flipV") { sx = x; sy = h - 1 - y; dmap = function (d) { return (Math.PI - d) % Math.PI; }; }
      else if (kind === "flipH") { sx = w - 1 - x; sy = y; dmap = function (d) { return (Math.PI - d) % Math.PI; }; }
      else { // rot90 about the centre (square-ish crop): (x, y) <- (cx + (y - cy), cy - (x - cx))
        var cx = w / 2, cy = h / 2; sx = Math.round(cx + (y - cy)); sy = Math.round(cy - (x - cx)); dmap = function (d) { return (d + Math.PI / 2) % Math.PI; };
      }
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      var i = y * w + x, j = sy * w + sx; E[i] = M.E[j]; D[i] = dmap(M.D[j]); inner[i] = M.inner[j];
    }
    return { E: E, D: D, inner: inner, w: w, h: h, s: M.s, asp: M.asp };
  }
  /* ---------------- 5b minimal path refinement ---------------- */
  /** Dijkstra in a corridor around the fitted curve: state = (pixel, heading 0..7); step cost = length / (eps + directional energy)
      + turn penalty. Returns ROI px points. */
  function minimalPath(M, P, t0, t1, corridorPx) {
    var w = M.w, h = M.h, s = M.s, ns = 120, pts = [], k;
    for (k = 0; k < ns; k++) { var p = bezExt(P, t0 + (t1 - t0) * k / (ns - 1)); pts.push([(p[0] - CFG.u0) * s, (p[1] - CFG.v0 * M.asp) * s]); }
    var inC = new Uint8Array(w * h), cr = Math.ceil(corridorPx);
    pts.forEach(function (q) { for (var dy = -cr; dy <= cr; dy++) for (var dx = -cr; dx <= cr; dx++) { if (dx * dx + dy * dy > cr * cr) continue; var x = Math.round(q[0] + dx),
        y = Math.round(q[1] + dy); if (x >= 0 && y >= 0 && x < w && y < h) inC[y * w + x] = 1; } });
    return dijkstra(M, [Math.round(pts[0][0]), Math.round(pts[0][1])], [Math.round(pts[ns - 1][0]), Math.round(pts[ns - 1][1])], inC);
  }
  /** cheapest 8-connected path S -> T (ROI px) inside the mask inC; state = (pixel, heading); step = length / (eps + directional
      energy) + turn penalty (continuity) */
  function dijkstra(M, S, T, inC) {
    var w = M.w, h = M.h, k;
    var DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1], dist = new Float64Array(w * h * 8).fill(Infinity), prev = new Int32Array(w * h * 8).fill(-1);
    var heap = [], push = function (d, st) { heap.push([d, st]); var i = heap.length - 1; while (i > 0) { var pa = (i - 1) >> 1; if (heap[pa][0] <= heap[i][0]) break; var t = heap[pa];
        heap[pa] = heap[i]; heap[i] = t; i = pa; } };
    var pop = function () { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = 2 * i + 1, r2 = l + 1, m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r2 < heap.length && heap[r2][0] < heap[m][0]) m = r2; if (m === i) break; var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
            } } return top; };
    var si = S[1] * w + S[0]; if (si < 0 || si >= w * h) return null;
    for (k = 0; k < 8; k++) { dist[si * 8 + k] = 0; push(0, si * 8 + k); }
    var ti = T[1] * w + T[0], goal = -1, eps = 0.15;
    while (heap.length) {
      var top = pop(), d = top[0], st = top[1]; if (d > dist[st]) continue;
      var pi = st >> 3, hd = st & 7; if (pi === ti) { goal = st; break; }
      var x = pi % w, y = (pi - x) / w;
      for (var nh = 0; nh < 8; nh++) {
        var turn = Math.min(Math.abs(nh - hd), 8 - Math.abs(nh - hd)); if (turn > 2) continue;
        var xx = x + DX[nh], yy = y + DY[nh]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        var q = yy * w + xx; if (!inC[q]) continue;
        var th = Math.atan2(DY[nh], DX[nh]), c = Math.cos(M.D[q] - th), e = M.E[q] * c * c, len = (nh & 1) ? 1.4142 : 1;
        var nd = d + len / (eps + e) + 0.6 * turn * turn, ns2 = q * 8 + nh;
        if (nd < dist[ns2]) { dist[ns2] = nd; prev[ns2] = st; push(nd, ns2); }
      }
    }
    if (goal < 0) return null;
    var path = []; for (var cur = goal; cur >= 0; cur = prev[cur]) { var pix = cur >> 3; path.push([pix % w, (pix - pix % w) / w]); }
    path.reverse();
    return path;
  }
  /** 4b guided tracing (live-wire): the user taps the START and END of a line (hand-frame u, v); the darkest continuous path between
      them on the energy map, inside a band around the chord (0.35 x the tap distance, at least 0.12 PW). Returns {cp (u, v),
      path (ROI px), meanEnergy}. The result is the user's own trace (status "added"), never a detection. */
  function guided(M, a, b) {
    var s = M.s, toPx = function (q) { return [(q[0] - CFG.u0) * s, (q[1] - CFG.v0) * s * M.asp]; }, A = toPx(a), B = toPx(b);
    var w = M.w, h = M.h, inC = new Uint8Array(w * h), dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1, band = Math.max(0.12 * s, 0.35 * Math.sqrt(L2));
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var t = clamp(((x - A[0]) * dx + (y - A[1]) * dy) / L2, 0, 1), d = Math.hypot(x - A[0] - t * dx, y - A[1] - t * dy);
      if (d <= band) inC[y * w + x] = 1; // outside the palm the energy is 0, so the path avoids it without being forbidden
    }
    var S = [Math.round(A[0]), Math.round(A[1])], T = [Math.round(B[0]), Math.round(B[1])];
    [S, T].forEach(function (p) { for (var r = 0; r <= 2; r++) for (var oy = -r; oy <= r; oy++) for (var ox = -r; ox <= r; ox++) { var xx = p[0] + ox, yy = p[1] + oy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) inC[yy * w + xx] = 1; } });
    var path = dijkstra(M, S, T, inC);
    if (!path) return null;
    var sm = smoothPath(path, 2), e = 0; sm.forEach(function (p) { e += M.E[Math.round(p[1]) * w + Math.round(p[0])] || 0; });
    return { path: sm, meanEnergy: round(e / sm.length, 3), cp: resample(sm, 12).map(function (p) { return [round(CFG.u0 + p[0] / s, 4), round(CFG.v0 + p[1] / (s * M.asp), 4)]; }) };
  }
  /** line tracking past the ends of the refined path (classical crease following). The crease is followed in steps of 0.025 PW
      along a PREDICTED direction: the path's own end direction turned by its own end curvature (at most 3.4 degrees a step), with
      candidates within +-20 degrees and at most 25 degrees in total away from the prediction. A step's energy counts only pixels
      whose direction is within 15 degrees of the step. All levels come from THIS palm's null of one step (the best of the same 9
      candidate directions at 240 random points): a step needs the null's 80th percentile; the extension is kept only up to where
      its running sum of (energy - the null's 95th percentile) peaks, and tracking stops once that sum falls 3 levels below its
      peak; one gap of up to 0.075 PW is crossed only when two steps beyond it both pass the 95th percentile (the skipped steps
      count as a loss). The line never leaves its zone (the hull of its start / end boxes + 0.04 PW; the heart line is not
      extended under the index finger, u < 0) and never runs along a line already drawn. ROI px in and out. */
  function track(M, path, id, tau, maxPW) {
    var s = M.s, step = Math.max(3, 0.025 * s), out = path.slice(), band = PRIOR[id].band, Z = PRIOR[id], mg = 0.04;
    // the heart line is not extended under the index finger (u < 0: it would run on into the head / life start); conservative:
    // a real heart line that does reach there is drawn a little short, never long
    var uLo = id === "heart" ? 0 : Math.min(Z.a[0][0], Z.b[0][0]) - mg, uHi = Math.max(Z.a[0][1], Z.b[0][1]) + mg, vLo = Math.min(Z.a[1][0], Z.b[1][0]) - mg, vHi = Math.max(Z.a[1][1],
        Z.b[1][1]) + mg;
    var inZone = function (p) { var u = CFG.u0 + p[0] / s, v = CFG.v0 + p[1] / (s * M.asp), x = Math.round(p[0]), y = Math.round(p[1]);
      if (M.taken && x >= 0 && y >= 0 && x < M.w && y < M.h && M.taken[y * M.w + x]) return false; // never run along a line already drawn
      return u >= uLo && u <= uHi && v >= vLo && v <= vHi; };
    // the null of ONE tracking step on this palm: the best of the same 9 candidate directions at random inner points
    var bgv = [], rr = rng(4242), tries = 0;
    while (bgv.length < 240 && tries < 4000) { tries++; var bx = rr() * M.w, by = rr() * M.h; if (!M.inner[Math.floor(by) * M.w + Math.floor(bx)]) continue;
      var th0 = rr() * Math.PI, bb = 0; for (var aa = -20; aa <= 20; aa += 5) { var t2 = th0 + aa * Math.PI / 180, ee = segE0([bx, by], [Math.cos(t2), Math.sin(t2)]); if (ee > bb) bb = ee;
          } bgv.push(bb); }
    bgv.sort(function (x, y) { return x - y; });
    var qbg = function (f) { return bgv.length ? bgv[Math.min(bgv.length - 1, Math.floor(f * bgv.length))] : 0; };
    var keep = Math.max(2 * tau, qbg(0.8)), level = Math.max(2 * tau, qbg(0.95)), jump = Math.max(2 * tau, qbg(0.95));
    var segE = segE0;
    function segE0(p, d) { var n = Math.max(2, Math.round(step)), th = Math.atan2(d[1], d[0]), sum = 0, nx = -d[1], ny = d[0];
      for (var k = 1; k <= n; k++) { var best = 0; for (var o = -1; o <= 1; o++) { var x = Math.round(p[0] + d[0] * step * k / n + nx * o), y = Math.round(p[1] + d[1] * step * k / n + ny * o);
        if (x < 0 || y < 0 || x >= M.w || y >= M.h || !M.inner[y * M.w + x]) return -1; var i = y * M.w + x, c = Math.cos(M.D[i] - th), e = c * c >= 0.933 ? M.E[i] : 0; if (e > best) best = e;
            } sum += best; } // hard direction gate: within 15 degrees
      return sum / n; }
    var ang = function (d) { return Math.atan2(d[1], d[0]); }, rot = function (d, r) { return [d[0] * Math.cos(r) - d[1] * Math.sin(r), d[0] * Math.sin(r) + d[1] * Math.cos(r)]; };
    var wrap = function (x) { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
    var grow = function (P) { // extends P at its END
      var N = P.length, k = Math.min(Math.round(0.08 * s), N - 1), k2 = Math.min(2 * k, N - 1);
      if (k < 2) return P;
      var d1 = [P[N - 1][0] - P[N - 1 - k][0], P[N - 1][1] - P[N - 1 - k][1]], d0 = [P[N - 1 - k][0] - P[N - 1 - k2][0], P[N - 1 - k][1] - P[N - 1 - k2][1]];
      var turnPerStep = k2 > k ? clamp(wrap(ang(d1) - ang(d0)) * step / Math.max(1, Math.hypot(d1[0], d1[1])), -0.06, 0.06) : 0; // end curvature, <= 3.4 deg / step
      var dl = Math.hypot(d1[0], d1[1]) || 1, pred = [d1[0] / dl, d1[1] / dl], len = 0, gaps = 0, dev = 0, N0 = P.length, gain = 0, bestGain = 0, bestLen = N0;
      while (len < maxPW * s) {
        var p = P[P.length - 1], best = null; pred = rot(pred, turnPerStep);
        for (var a = -20; a <= 20; a += 5) { var r = a * Math.PI / 180, dd = rot(pred, r);
          if (Math.abs(dev + r) > 25 * Math.PI / 180) continue;
          if (band && !inBand(((ang(dd) % Math.PI) + Math.PI) % Math.PI, band)) continue;
          var qq = [p[0] + dd[0] * step, p[1] + dd[1] * step]; if (!inZone(qq)) continue;
          var e = segE(p, dd); if (e > keep && (!best || e > best.e)) best = { e: e, d: dd, r: r, q: qq }; }
        var skipped = 0;
        if ((!best || best.e < level) && gaps < 1) { // a weak step: one gap of up to 3 steps (0.075 PW) is crossed when the crease
          for (var g = 1; g <= 3; g++) {                   // continues beyond it, strongly, along the prediction
            var p2 = [p[0] + pred[0] * step * g, p[1] + pred[1] * step * g], q2 = [p2[0] + pred[0] * step, p2[1] + pred[1] * step];
            if (!inZone(p2) || !inZone(q2)) break;
            var e2 = segE(p2, pred), q3 = [q2[0] + pred[0] * step, q2[1] + pred[1] * step], e3 = inZone(q3) ? segE(q2, pred) : -1;
            if (e2 > jump && e3 > level) { best = { e: e2, d: pred, r: 0, q: q2 }; gaps++; skipped = g; break; } // two steps beyond confirm it
          }
        }
        if (!best) break;
        var n = Math.max(2, Math.round(Math.hypot(best.q[0] - p[0], best.q[1] - p[1])));
        for (var j = 1; j <= n; j++) P.push([p[0] + (best.q[0] - p[0]) * j / n, p[1] + (best.q[1] - p[1]) * j / n]);
        len += Math.hypot(best.q[0] - p[0], best.q[1] - p[1]);
        gain += best.e - level - 0.3 * level * skipped; if (gain > bestGain) { bestGain = gain; bestLen = P.length; } // keep only the extension that pays for itself
        if (gain < bestGain - 3 * level) break; // a long weak run that never pays back: the crease has ended
        dev += best.r * 0.5; pred = rot(pred, best.r * 0.5); // follow half of the chosen deviation
      }
      P.length = bestLen; // the extension is cut where its running sum of (energy - level) peaks: a weak tail is dropped
      return P;
    };
    // trim: never end on points weaker than the crease itself (a step can overshoot the real end)
    var trim = function (P) { while (P.length > 8) { var t = P[P.length - 1], m = 0;
      for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) { var x = Math.round(t[0]) + ox, y = Math.round(t[1]) + oy; if (x >= 0 && y >= 0 && x < M.w && y < M.h) m = Math.max(m,
          M.E[y * M.w + x]); }
      if (m >= keep) break; P.pop(); } return P; };
    out = trim(grow(out)); out = trim(grow(out.reverse())).reverse();
    return out;
  }
  /** end trim on the PHOTO itself, not on the windowed energy: MFRAT's p x p window makes the energy run on past a crease end
      by about half the window, so each end is cut back while the local valley contrast (the grey at the point vs both flanks at
      1.5 x the crease width, best of +-1 px across) averaged over 5 points stays below half of the line's own median contrast */
  function trimLocal(M, P) {
    if (!M.N || P.length < 12) return P;
    var s = M.s, o = Math.max(2, Math.round(1.5 * 0.013 * s)), lc = [];
    for (var k = 0; k < P.length; k++) {
      var a = P[Math.max(0, k - 3)], b = P[Math.min(P.length - 1, k + 3)], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl, best = -1e9;
      for (var c = -1; c <= 1; c++) {
        var g = function (off) { var x = Math.round(P[k][0] + nx * (c + off)), y = Math.round(P[k][1] + ny * (c + off)); return x >= 0 && y >= 0 && x < M.w && y < M.h ? M.N[y * M.w + x] : 128; };
        var v = Math.min(g(o), g(-o)) - g(0); if (v > best) best = v;
      }
      lc.push(best);
    }
    var srt = lc.slice().sort(function (x, y) { return x - y; }), med = srt[srt.length >> 1], lim = 0.5 * med;
    var avg = function (k) { var sum = 0, n = 0; for (var j = Math.max(0, k - 2); j <= Math.min(lc.length - 1, k + 2); j++) { sum += lc[j]; n++; } return sum / n; };
    var i0 = 0, i1 = P.length - 1;
    while (i0 < i1 - 10 && avg(i0) < lim) i0++;
    while (i1 > i0 + 10 && avg(i1) < lim) i1--;
    return P.slice(i0, i1 + 1);
  }
  function smoothPath(P, r) { return P.map(function (_, i) { var sx = 0, sy = 0, c = 0; for (var k = -r; k <= r; k++) { var q = P[clamp(i + k, 0, P.length - 1)]; sx += q[0]; sy += q[1]; c++;
      } return [sx / c, sy / c]; }); }
  function resample(P, n) {
    var cum = [0]; for (var i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    var L = cum[cum.length - 1] || 1, out = [], j = 0;
    for (var k = 0; k < n; k++) { var t = L * k / (n - 1); while (j < P.length - 2 && cum[j + 1] < t) j++; var f = (t - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
        out.push([P[j][0] + (P[j + 1][0] - P[j][0]) * f, P[j][1] + (P[j + 1][1] - P[j][1]) * f]); }
    return out;
  }
  /** supported extent along the fitted curve: the max-sum run of (e - tau), so a line is never drawn past what the photo shows */
  function extent(e, tau) {
    var best = 0, bi = 0, bj = -1, cur = 0, ci = 0;
    for (var k = 0; k < e.length; k++) { if (cur <= 0) { cur = 0; ci = k; } cur += e[k] - tau; if (cur > best) { best = cur; bi = ci; bj = k; } }
    return bj < 0 ? null : [bi, bj];
  }
  /** features from the refined path: breaks (runs of low energy inside the drawn extent) */
  function features(M, path, tau) {
    var f = { breaks: [] }, run = -1, s = M.s;
    for (var k = 0; k < path.length; k++) {
      var i = Math.round(path[k][1]) * M.w + Math.round(path[k][0]), low = (M.E[i] || 0) < tau;
      if (low && run < 0) run = k; if ((!low || k === path.length - 1) && run >= 0) { var len = (k - run) / s; if (len >= 0.03) f.breaks.push({ at: (run + k) / 2 / path.length,
          lengthPW: Math.round(len * 1000) / 1000 }); run = -1; }
    }
    return f;
  }
  /* ---------------- detect ---------------- */
  function fitLines(M, ids, seed, opts) {
    var r = rng(seed), out = {}, zLimit = opts.zLimit == null ? Z_LIMIT : opts.zLimit;
    ids.forEach(function (id) {
      var best = search(M, id, r, opts.nSearch || CFG.nSearch), nul = nullRandom(M, id, r, opts.nRandom || CFG.nRandom);
      var z = (best.s - nul.mu) / nul.sd, L = { id: id, score: round(best.s, 4), z: round(z, 2), nullMu: round(nul.mu, 4), nullSd: round(nul.sd, 4), nullP99: round(nul.p99, 4), nullN: nul.n };
      L.solid = z >= zLimit;
      L.status = L.solid ? "found" : "unclear";
      // drawn extent: the fitted curve is extended past both ends (t -0.08 .. 1.08, straight along the end tangents) and the line runs as far as the crease does
      // (the mean-energy fit itself prefers the strongest stretch; the z score above uses the fit only)
      var tau = nul.mu + 1.0 * nul.sd, TA = -0.08, TB = 1.08, NS = 140, P = ctrl(opts._noRefit ? best.q : refit(M, id, best.q, tau)), e = samples(M, P, NS, PRIOR[id].band, TA, TB),
        eMid = Array.from(samples(M, P, 60, PRIOR[id].band)).sort(function (x, y) { return x - y; }), ex = extent(e, Math.max(tau, 0.6 * eMid[30]));
      L.fit = P.map(function (q) { return [round(q[0], 4), round(q[1] / M.asp, 4)]; });
      if (opts.transformNull) {
        L.rotNull = ["rot180", "flipV", "flipH", "rot90"].map(function (kind) { var T = transformMap(M, kind), b = search(T, id, rng(seed + 7), Math.round((opts.nSearch || CFG.nSearch) / 2));
            return { kind: kind, s: round(b.s, 4), z: round((b.s - nul.mu) / nul.sd, 2) }; });
      }
      if (ex && (ex[1] - ex[0]) >= 8) {
        var t0 = TA + (TB - TA) * ex[0] / (NS - 1), t1 = TA + (TB - TA) * ex[1] / (NS - 1), path = minimalPath(M, P, t0, t1, Math.max(3, 0.025 * M.s));
        if (path && path.length > 4) {
          var sm = trimLocal(M, smoothPath(opts._noTrack ? smoothPath(path, 2) : track(M, smoothPath(path, 2), id, tau, 0.45), 2)), cp = resample(sm,
              9).map(function (p) { return [round(CFG.u0 + p[0] / M.s, 4),
              round(CFG.v0 + p[1] / (M.s * M.asp), 4)]; });
          L.path = sm; L.extent = [round(t0, 3), round(t1, 3)];
          if (L.solid) { L.cp = cp; L.features = features(M, sm, tau); } else L.candidate = cp; // below the limit: never drawn as detected
        }
      }
      if (L.solid && !L.cp) { L.solid = false; L.status = "unclear"; }
      if (L.solid && L.path) { // pixels of a drawn line: a later line's tracking stops there (life / head join, heart / head)
        if (!M.taken) M.taken = new Uint8Array(M.w * M.h);
        var tr = Math.max(2, Math.round(0.015 * M.s));
        L.path.forEach(function (p) { for (var dy = -tr; dy <= tr; dy++) for (var dx = -tr; dx <= tr; dx++) { var x = Math.round(p[0]) + dx, y = Math.round(p[1]) + dy;
          if (x >= 0 && y >= 0 && x < M.w && y < M.h) M.taken[y * M.w + x] = 1; } });
      }
      out[id] = L;
    });
    return out;
  }
  function round(x, d) { var k = Math.pow(10, d); return Math.round(x * k) / k; }
  function prepare(rgba, W, H, hand, s, method) {
    var F = frameFromHand(hand), R = roi(rgba, W, H, F, s), N = normalise(R), En = energy(N, R, method);
    return { F: F, R: R, N: N, M: { E: En.E, D: En.D, A: En.A, N: N, inner: R.inner, w: R.w, h: R.h, s: R.s, asp: R.asp, method: En.method } };
  }
  /** find lines. opts: {method: "mfrat"|"wld"|"comp", minors: bool, zLimit (dev only), seed, transformNull: bool, keepMaps: bool} */
  function detect(rgba, W, H, hand, opts) {
    opts = opts || {};
    var t0 = Date.now(), method = opts.method || CFG.method, A = prepare(rgba, W, H, hand, CFG.sMaj, method);
    var lines = fitLines(A.M, MAJORS, opts.seed || 1, opts), res = { lines: lines, zLimit: opts.zLimit == null ? Z_LIMIT : opts.zLimit, asp: Math.round(A.F.asp * 1000) / 1000, s: CFG.sMaj,
        method: method,
      marriage: "not searched: marriage lines sit on the edge of the hand and are usually not visible in a frontal photo" };
    if (opts.minors) {
      var B = prepare(rgba, W, H, hand, Math.min(CFG.sMin, Math.max(CFG.sMaj, Math.round(A.F.pw))), method);
      // girdle of Venus: searched only ABOVE a solid heart line, with the heart line's own crease removed from the map
      var ids = MINORS.filter(function (id) { return id !== "girdle"; }), H0 = lines.heart;
      var mn = fitLines(B.M, ids, (opts.seed || 1) + 101, opts);
      if (H0 && H0.solid && H0.cp) {
        var top = Math.min.apply(null, H0.cp.map(function (q) { return q[1]; })), M2 = Object.assign({}, B.M, { E: new Float32Array(B.M.E) }), hs = B.M.s;
        var hp = H0.cp.map(function (q) { return [(q[0] - CFG.u0) * hs, (q[1] - CFG.v0) * hs * B.M.asp]; }), rr = 0.035 * hs;
        for (var yy = 0; yy < M2.h; yy++) for (var xx = 0; xx < M2.w; xx++) { for (var k = 0; k < hp.length - 1; k++) { var a = hp[k], b = hp[k + 1], dx = b[0] - a[0], dy = b[1] - a[1],
            l2 = dx * dx + dy * dy || 1,
          t = clamp(((xx - a[0]) * dx + (yy - a[1]) * dy) / l2, 0, 1); if (Math.hypot(xx - a[0] - t * dx, yy - a[1] - t * dy) < rr) { M2.E[yy * M2.w + xx] = 0; break; } } }
        var saved = PRIOR.girdle; PRIOR.girdle = { a: [saved.a[0], [-0.04, Math.max(-0.03, top - 0.03)]], b: [saved.b[0], [-0.04, Math.max(-0.03, top - 0.03)]], bend: saved.bend,
            band: saved.band };
        try { mn.girdle = fitLines(M2, ["girdle"], (opts.seed || 1) + 202, opts).girdle; } finally { PRIOR.girdle = saved; }
      } else mn.girdle = { id: "girdle", solid: false, status: "unclear", z: null, note: "searched only above a solid heart line" };
      Object.keys(mn).forEach(function (id) { lines[id] = mn[id]; });
      res.sMin = B.M.s; if (opts.keepMaps) res._min = B;
    }
    if (opts.keepMaps) res._maj = A;
    res.ms = Date.now() - t0;
    return res;
  }
  /** v3 result -> the v2 detection shape for PalmV2.applyDetection: conf >= THRESH(id) exactly when the line is solid (z >= limit);
      a major below the limit keeps conf in (0.05, THRESH) so the page shows "not clear in this photo" */
  var THR = { life: 0.5, head: 0.5, heart: 0.5, fate: 0.55, sun: 0.6, mercury: 0.6, marriage: 0.65, girdle: 0.65, bracelet: 0.6, simian: 0.7 };
  function toV2(det) {
    var lines = {};
    Object.keys(det.lines).forEach(function (id) {
      var L = det.lines[id], thr = THR[id] || 0.6;
      if (L.solid && L.cp) lines[id] = { cp: L.cp, conf: Math.min(1, thr + 0.05 + 0.02 * (L.z - det.zLimit)) };
      else lines[id] = { cp: null, conf: MAJORS.indexOf(id) >= 0 ? Math.max(0.06, Math.min(thr - 0.1, 0.06 + 0.04 * Math.max(0, L.z))) : 0 };
    });
    return { lines: lines, asp: det.asp };
  }
  var api = { CFG: CFG, Z_LIMIT: Z_LIMIT, PRIOR: PRIOR, MAJORS: MAJORS, MINORS: MINORS, detect: detect, toV2: toV2, prepare: prepare, guided: guided, fitLines: fitLines,
    _internal: { roi: roi, normalise: normalise, energy: energy, mfrat: mfrat, wld: wld, comp: comp, search: search, nullRandom: nullRandom, transformMap: transformMap,
      minimalPath: minimalPath, dijkstra: dijkstra, frameFromHand: frameFromHand, ctrl: ctrl, bez: bez, samples: samples, smoothPath: smoothPath, resample: resample } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PalmV3Lines = api;
})(typeof window !== "undefined" ? window : globalThis);
