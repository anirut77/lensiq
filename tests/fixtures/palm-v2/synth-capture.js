/* tests/fixtures/palm-v2/synth-capture.js — FIXED TEST SET "palm-layers" relock4 (palm v2 capture guidance, upload minimum and
 * handedness; owner orders 2026-11-20). DRAWN, SYNTHETIC images and landmark sets only (no photo of any person).
 * Pure JavaScript (Node and browser global PalmCapSynth).
 *   palmImage({ pw, blur, clip, side, mirror, seed }) -> { w, h, rgba, taps, hand, pw }
 *     pw    palm width in image px (index-to-little-finger knuckle distance, the 7-tap rule's knuckles), default 480;
 *     blur  Gaussian-like blur (3 box passes), sigma in palm widths (0.02 = soft focus), default 0;
 *     clip  fraction of the B2.3 palm ROI (u 0-1, v 0.05-0.95) painted pure white (255, 255, 255) like a flash blow-out, default 0;
 *     side  "right" (default) | "left": the palm side of that hand, fingers up, as a rear camera sees it (not mirrored);
 *     mirror true = the whole image flipped left-right (what a front camera preview or a mirrored selfie shows).
 *   The skin texture and the creases are defined in palm units, so the sharpness measure does not depend on pw.
 *   landmarks({ side, mirror, rot, scale, at, foldThumb }) -> { pts: 21 MediaPipe-order points, hand }
 *     a right hand's palm side (rear camera, fingers up) has its thumb on the image right; "left" flips x; mirror flips x again;
 *     rot rotates the whole hand (degrees, image coordinates); foldThumb puts the thumb tip across the palm (ambiguous).
 * Numbers measured on these images are SYNTHETIC, never field numbers. */
(function (root) {
  "use strict";
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function hash(ix, iy, seed) {
    var h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  /** bilinear value noise in [-0.5, 0.5], lattice spacing `cell` (same units as u, v) */
  function noise(u, v, cell, seed) {
    var x = u / cell, y = v / cell, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return (a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy) - 0.5;
  }
  function inPoly(x, y, P) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
    }
    return c;
  }
  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-9, t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  /* major creases in the palm frame (u, v), as polylines */
  var CREASES = [
    [[1.05, 0.22], [0.8, 0.19], [0.55, 0.17], [0.3, 0.12], [0.12, 0.06]],
    [[-0.06, 0.3], [0.2, 0.36], [0.45, 0.42], [0.7, 0.49], [0.88, 0.56]],
    [[-0.06, 0.33], [0.13, 0.47], [0.23, 0.63], [0.27, 0.8], [0.27, 0.97]],
    [[0.52, 0.97], [0.51, 0.78], [0.49, 0.58], [0.47, 0.4]]
  ];

  function palmImage(o) {
    o = o || {};
    var pw0 = o.pw || 480, seed = o.seed == null ? 11 : o.seed;
    // creases (taps) are placed so that the 7-tap rule's knuckles are exactly pw0 apart
    var W = Math.round(pw0 * 2.4), H = Math.round(pw0 * 3.3), cx = W / 2;
    var A = [cx + pw0 * 0.5, pw0 * 1.3], B = [cx - pw0 * 0.5, pw0 * 1.3], Wr = [cx, pw0 * 1.3 + pw0 * 1.45];
    // knuckle K = crease C + 0.1 (W - M_C): pick the creases so that K = A, B
    var Mk = lerp(A, B, 0.5), Mc = [(Mk[0] - 0.1 * Wr[0]) / 0.9, (Mk[1] - 0.1 * Wr[1]) / 0.9], dn = [(Wr[0] - Mc[0]) * 0.1, (Wr[1] - Mc[1]) * 0.1];
    var tA = [A[0] - dn[0], A[1] - dn[1]], tB = [B[0] - dn[0], B[1] - dn[1]];
    var U = [B[0] - A[0], B[1] - A[1]], V = [Wr[0] - Mk[0], Wr[1] - Mk[1]], det = U[0] * V[1] - U[1] * V[0];
    var toImg = function (q) { return [A[0] + q[0] * U[0] + q[1] * V[0], A[1] + q[0] * U[1] + q[1] * V[1]]; };
    var toUV = function (x, y) { var a = x - A[0], b = y - A[1]; return [(a * V[1] - b * V[0]) / det, (U[0] * b - U[1] * a) / det]; };
    var palm = [[-0.12, -0.04], [1.1, -0.02], [1.14, 0.5], [1.05, 1.0], [0.75, 1.12], [0.2, 1.12], [-0.1, 0.95], [-0.2, 0.5]].map(toImg);
    var arm = [[0.02, 0.95], [1.0, 0.95], [1.02, 1.6], [0.0, 1.6]].map(toImg);
    var tipsUV = { index: [0.0, -0.62], middle: [0.33, -0.7], ring: [0.66, -0.64], pinky: [1.0, -0.48] };
    var basesUV = { index: [0.0, 0.02], middle: [1 / 3, 0.0], ring: [2 / 3, 0.02], pinky: [1.0, 0.05] };
    var caps = [];
    Object.keys(tipsUV).forEach(function (f) { caps.push([toImg(basesUV[f]), toImg(tipsUV[f]), pw0 * (f === "pinky" ? 0.085 : 0.1)]); });
    var thumbA = toImg([-0.2, 0.72]), thumbB = toImg([-0.62, 0.2]);
    caps.push([thumbA, thumbB, pw0 * 0.12]);
    var crease = CREASES.map(function (c) { return c.map(toImg); });
    var cw = pw0 * 0.006; // crease half-width (Gaussian sigma), palm units
    var rgba = new Uint8ClampedArray(W * H * 4), x, y;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var j = (y * W + x) * 4, p = [x + 0.5, y + 0.5], s = inPoly(p[0], p[1], palm) || inPoly(p[0], p[1], arm);
      for (var c = 0; !s && c < caps.length; c++) s = segDist(p, caps[c][0], caps[c][1]) <= caps[c][2];
      if (!s) { rgba[j] = 60; rgba[j + 1] = 80; rgba[j + 2] = 110; rgba[j + 3] = 255; continue; }
      var uv = toUV(p[0], p[1]);
      var t = 0.09 * noise(uv[0], uv[1], 0.008, seed) + 0.065 * noise(uv[0], uv[1], 0.03, seed + 1) + 0.04 * noise(uv[0], uv[1], 0.12, seed + 2);
      var dk = 0;
      for (var k = 0; k < crease.length; k++) {
        var P = crease[k], best = 1e9;
        for (var m = 0; m < P.length - 1; m++) { var d = segDist(p, P[m], P[m + 1]); if (d < best) best = d; }
        if (best < cw * 4) dk = Math.max(dk, 0.3 * Math.exp(-best * best / (2 * cw * cw)));
      }
      var f = (1 + t) * (1 - dk);
      rgba[j] = 214 * f; rgba[j + 1] = 170 * f; rgba[j + 2] = 146 * f; rgba[j + 3] = 255;
    }
    if (o.blur) boxBlur3(rgba, W, H, o.blur * pw0);
    if (o.clip) { // a pure white disc on the palm centre, area = clip x ROI area (ROI: u 0..1, v 0.05..0.95)
      var area = Math.abs(det) * 0.9 * o.clip, R = Math.sqrt(area / Math.PI), g0 = toImg([0.5, 0.5]);
      for (y = Math.max(0, Math.floor(g0[1] - R - 1)); y <= Math.min(H - 1, Math.ceil(g0[1] + R + 1)); y++)
        for (x = Math.max(0, Math.floor(g0[0] - R - 1)); x <= Math.min(W - 1, Math.ceil(g0[0] + R + 1)); x++)
          if (Math.hypot(x + 0.5 - g0[0], y + 0.5 - g0[1]) <= R) { var jj = (y * W + x) * 4; rgba[jj] = 255; rgba[jj + 1] = 255; rgba[jj + 2] = 255; }
    }
    var taps = { wrist: Wr, indexBase: tA, pinkyBase: tB, indexTip: toImg(tipsUV.index), middleTip: toImg(tipsUV.middle), ringTip: toImg(tipsUV.ring), pinkyTip: toImg(tipsUV.pinky) };
    var hand = { source: "tap", wrist: Wr.slice(), mcp: { index: A.slice(), middle: lerp(A, B, 1 / 3), ring: lerp(A, B, 2 / 3), pinky: B.slice() },
      tip: { thumb: null, index: taps.indexTip, middle: taps.middleTip, ring: taps.ringTip, pinky: taps.pinkyTip }, thumbBase: null, pts: null };
    var out = { w: W, h: H, rgba: rgba, taps: taps, hand: hand, pw: pw0, thumbTip: thumbB, side: "right", mirrored: false };
    var flip = (o.side === "left") !== !!o.mirror; // a left hand's palm is the mirror image of a right hand's palm
    if (flip) {
      var mrr = new Uint8ClampedArray(rgba.length);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { var s0 = (y * W + x) * 4, s1 = (y * W + (W - 1 - x)) * 4; mrr[s1] = rgba[s0]; mrr[s1 + 1] = rgba[s0 + 1];
        mrr[s1 + 2] = rgba[s0 + 2]; mrr[s1 + 3] = 255; }
      var mx = function (q) { return q ? [W - q[0], q[1]] : q; };
      Object.keys(taps).forEach(function (kk) { taps[kk] = mx(taps[kk]); });
      hand.wrist = mx(hand.wrist); Object.keys(hand.mcp).forEach(function (kk) { hand.mcp[kk] = mx(hand.mcp[kk]); });
      Object.keys(hand.tip).forEach(function (kk) { hand.tip[kk] = mx(hand.tip[kk]); });
      out.rgba = mrr; out.thumbTip = mx(thumbB);
    }
    out.side = o.side === "left" ? "left" : "right"; out.mirrored = !!o.mirror;
    return out;
  }
  function boxBlur3(rgba, W, H, sigma) {
    var R = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2)), tmp = new Float32Array(W * H), x, y;
    for (var ch = 0; ch < 3; ch++) for (var pass = 0; pass < 3; pass++) {
      for (y = 0; y < H; y++) { var acc = 0; for (x = -R; x <= R; x++) acc += rgba[(y * W + Math.min(W - 1, Math.max(0, x))) * 4 + ch];
        for (x = 0; x < W; x++) { tmp[y * W + x] = acc / (2 * R + 1); acc += rgba[(y * W + Math.min(W - 1, x + R + 1)) * 4 + ch] - rgba[(y * W + Math.max(0, x - R)) * 4 + ch]; } }
      for (x = 0; x < W; x++) { var ac = 0; for (y = -R; y <= R; y++) ac += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
        for (y = 0; y < H; y++) { rgba[(y * W + x) * 4 + ch] = ac / (2 * R + 1); ac += tmp[Math.min(H - 1, y + R + 1) * W + x] - tmp[Math.max(0, y - R) * W + x]; } }
    }
  }

  /* 21 MediaPipe-order hand points of a RIGHT hand's palm side, rear camera (not mirrored), fingers up, unit = about one palm
     width; x to the image right, y down. The thumb (1-4) and the index knuckle (5) are on the image right. */
  var RIGHT = [[0, 0], [0.35, -0.25], [0.6, -0.45], [0.8, -0.65], [0.95, -0.85], [0.45, -1.4], [0.48, -1.75], [0.5, -2.0], [0.5, -2.25],
    [0.12, -1.45], [0.12, -1.85], [0.12, -2.15], [0.12, -2.4], [-0.2, -1.4], [-0.22, -1.78], [-0.24, -2.05], [-0.25, -2.28],
    [-0.5, -1.3], [-0.55, -1.58], [-0.58, -1.8], [-0.6, -2.0]];
  function landmarks(o) {
    o = o || {};
    var fx = (o.side === "left" ? -1 : 1) * (o.mirror ? -1 : 1), a = (o.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    var sc = o.scale || 400, at = o.at || [600, 900];
    var base = RIGHT.map(function (p) { return p.slice(); });
    if (o.foldThumb) { base[3] = [0.1, -0.85]; base[4] = [-0.3, -0.95]; } // thumb tip lies across the palm, towards the little finger
    var pts = base.map(function (p) { var x = p[0] * fx, y = p[1]; return [at[0] + sc * (x * ca - y * sa), at[1] + sc * (x * sa + y * ca)]; });
    var hand = { source: "model", wrist: pts[0], mcp: { index: pts[5], middle: pts[9], ring: pts[13], pinky: pts[17] },
      tip: { thumb: pts[4], index: pts[8], middle: pts[12], ring: pts[16], pinky: pts[20] }, thumbBase: pts[1], pts: pts };
    return { pts: pts, hand: hand };
  }
  var api = { palmImage: palmImage, landmarks: landmarks, CREASES: CREASES };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PalmCapSynth = api;
})(typeof window !== "undefined" ? window : globalThis);
