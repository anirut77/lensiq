/* tests/fixtures/palm-v3/synth-real.js — FIXED TEST SET "palm-v3-lines" (palm v3 line-finder spike, owner order 2026-11-20).
 * REALISTIC SHALLOW creases on a drawn synthetic hand (no photo of any person). Geometry, frame and taps come from
 * tests/fixtures/palm-v2/synth-hand.js (same hand, same u/v frame); the shading is replaced:
 *   - skin: daylight phone-photo tone, smooth mottling, pores, fine micro-hatching (textures.js "skin" at half depth), short
 *     wrinkles (depth 0.03-0.07, 0.03-0.15 palm widths), grey noise sigma 3, a soft lighting gradient;
 *   - principal creases (heart, head, life; fate when asked): cubic Bezier curves with jittered control points, Gaussian valley
 *     profile with the values MEASURED on the owner's two daylight development photos along the spike agent's own dev trace
 *     (tools/palm-v3-measure.mjs, G / Lab-L channels): relative depth 0.08-0.14 at the centre (the owner photos gave 0.08-0.16 for
 *     heart and life, 0.09-0.31 for head), sigma 0.0055 palm widths (FWHM 0.009-0.025 PW measured, median about 0.013),
 *     depth varying along the line (x 0.45-1.3) and, half the time, one faint gap. RPG-Palm (2023) and Diff-Palm (2025) report that
 *     naive synthetic creases (the 55 %-deep lines of synth-hand.js) do not transfer to real photos; these are 4-7x shallower.
 * The measured values are inputs to this generator only; no accuracy figure comes from the owner's photos.
 *   const R = require("./synth-real.js"); const h = R.synthReal({ seed: 21, side: "left", lines: ["heart","head","life"] });
 *   h = synth-hand output (w, h, rgba, hand, taps, pw, toImg, side) + truth {id: dense [[u,v],...]} + params.
 * Options: seed, side, lines (default heart, head, life), depthScale (default 1), noCreases (true = the texture alone).
 * Numbers measured on this hand are SYNTHETIC, never field numbers. */
(function (root) {
  "use strict";
  var SYN = root.PalmSynth || require("../palm-v2/synth-hand.js");
  var TEX = root.PalmTextures || require("../palm-v2/textures.js");
  /* base cubic Bezier control points (u, v) per line; each control point is jittered +-0.03 */
  var BASE = {
    heart: [[1.12, 0.16], [0.8, 0.12], [0.45, 0.08], [0.08, 0.07]],
    head: [[-0.12, 0.18], [0.2, 0.18], [0.5, 0.26], [0.75, 0.42]],
    life: [[0.1, 0.2], [0.28, 0.35], [0.38, 0.6], [0.32, 0.95]],
    fate: [[0.5, 0.97], [0.5, 0.75], [0.48, 0.5], [0.47, 0.3]]
  };
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function bez(P, t) { var a = 1 - t; return [a * a * a * P[0][0] + 3 * a * a * t * P[1][0] + 3 * a * t * t * P[2][0] + t * t * t * P[3][0],
    a * a * a * P[0][1] + 3 * a * a * t * P[1][1] + 3 * a * t * t * P[2][1] + t * t * t * P[3][1]]; }
  function synthReal(o) {
    o = o || {};
    var seed = o.seed == null ? 21 : o.seed, r = rng(seed * 2654435761 + 17), lines = o.lines || ["heart", "head", "life"];
    var h = SYN.synthHand({ lines: [], seed: seed, side: "right", distract: 0 });
    var W = h.w, H = h.h, n = W * H, pw = h.pw, i, x, y;
    var skin = new Uint8Array(n);
    for (i = 0; i < n; i++) { var j = i * 4; skin[i] = h.rgba[j] === 70 && h.rgba[j + 1] === 92 && h.rgba[j + 2] === 120 ? 0 : 1; }
    // darkness field D (multiplicative 1 - D) and additive grey A
    var T = TEX.texture("skin", W, H, seed, pw), D = new Float32Array(n), A = T.A;
    for (i = 0; i < n; i++) D[i] = 0.5 * 0.55 * T.D[i]; // half the textures.js skin depth (x 0.55 as in textures.apply)
    var stamp = function (pts, depthAt, sigma) { // pts in image px, depthAt(k) per point
      var R = Math.ceil(sigma * 3);
      for (var k = 0; k < pts.length; k++) {
        var q = pts[k], dk = depthAt(k);
        if (dk <= 0) continue;
        for (var yy = Math.max(0, Math.floor(q[1] - R)); yy <= Math.min(H - 1, Math.ceil(q[1] + R)); yy++) for (var xx = Math.max(0, Math.floor(q[0] - R)); xx <= Math.min(W - 1, Math.ceil(q[0] + R)); xx++) {
          var d2 = (xx + 0.5 - q[0]) * (xx + 0.5 - q[0]) + (yy + 0.5 - q[1]) * (yy + 0.5 - q[1]), v = dk * Math.exp(-d2 / (2 * sigma * sigma)), ii = yy * W + xx;
          if (v > D[ii]) D[ii] = v;
        }
      }
    };
    var dense = function (P, step) { var out = [P[0]]; for (var k = 1; k < P.length; k++) { var a = out[out.length - 1], b = P[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L >= step) { var m = Math.floor(L / step); for (var s = 1; s <= m; s++) out.push([a[0] + (b[0] - a[0]) * s / m, a[1] + (b[1] - a[1]) * s / m]); } } return out; };
    // short wrinkles: two dominant directions plus random ones
    for (var k = 0; k < 90; k++) {
      var u0 = -0.15 + r() * 1.3, v0 = 0.0 + r() * 1.05, ang = r() < 0.6 ? (r() < 0.5 ? 0.5 : 2.4) + (r() - 0.5) * 0.6 : r() * Math.PI, len = (0.03 + r() * 0.12) * pw;
      var a0 = h.toImg([u0, v0]), b0 = [a0[0] + Math.cos(ang) * len, a0[1] + Math.sin(ang) * len], dep = 0.03 + r() * 0.04;
      stamp(dense([a0, b0], 0.5), function () { return dep; }, 0.004 * pw + 0.3);
    }
    var truth = {}, params = {};
    if (!o.noCreases) lines.forEach(function (id) {
      var P = BASE[id].map(function (q) { return [q[0] + (r() - 0.5) * 0.06, q[1] + (r() - 0.5) * 0.06]; });
      var N = 200, uv = []; for (var t = 0; t <= N; t++) uv.push(bez(P, t / N));
      var px = dense(uv.map(h.toImg), 0.5), M = px.length;
      var depth = (0.08 + r() * 0.06) * (o.depthScale == null ? 1 : o.depthScale), sigma = 0.0055 * pw * (0.8 + r() * 0.45);
      var f = 1 + r() * 2, ph = r() * 6.283, gap = r() < 0.5 ? 0.1 + r() * 0.75 : -1, gapLen = (0.03 + r() * 0.03) * pw / (px.length * 0.5 || 1);
      var depthAt = function (kk) { var t = kk / (M - 1), m = 0.85 + 0.3 * Math.sin(6.283 * f * t + ph); m = Math.max(0.45, Math.min(1.3, m));
        if (gap >= 0 && t >= gap && t <= gap + gapLen) m *= 0.25; return depth * m; };
      stamp(px, depthAt, sigma);
      truth[id] = uv; params[id] = { cp: P, depth: depth, sigmaPW: sigma / pw, gap: gap >= 0 ? [gap, gap + gapLen] : null };
    });
    // shading: daylight phone tone (median grey about 125-150), mottling, noise, lighting gradient
    var gx = (r() - 0.5) * 0.3, gy = (r() - 0.5) * 0.3, cx0 = W / 2, cy0 = H / 2, ph2 = r() * 1000;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x; var jj = i * 4;
      if (!skin[i]) continue;
      var mott = 5 * Math.sin((x + ph2) / 41) * Math.cos((y - ph2) / 59) + 3 * Math.sin((x - y + ph2) / 23);
      var light = 1 + gx * (x - cx0) / W + gy * (y - cy0) / H, f2 = (1 - D[i]) * light, nz = (r() - 0.5) * 6 * 1.7;
      h.rgba[jj] = (188 + mott + A[i] * 0.5) * f2 + nz; h.rgba[jj + 1] = (138 + mott + A[i] * 0.5) * f2 + nz; h.rgba[jj + 2] = (122 + mott + A[i] * 0.5) * f2 + nz;
    }
    var out = h;
    if (o.side === "left") { // mirror (same rule as synth-hand.js)
      var m2 = new Uint8ClampedArray(h.rgba.length);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { var s0 = (y * W + x) * 4, s1 = (y * W + (W - 1 - x)) * 4; m2[s1] = h.rgba[s0]; m2[s1 + 1] = h.rgba[s0 + 1]; m2[s1 + 2] = h.rgba[s0 + 2]; m2[s1 + 3] = 255; }
      var mx = function (p) { return [W - p[0], p[1]]; }, hand = h.hand, taps = h.taps, toImg0 = h.toImg;
      Object.keys(taps).forEach(function (kk) { taps[kk] = mx(taps[kk]); });
      hand.wrist = mx(hand.wrist); Object.keys(hand.mcp).forEach(function (kk) { hand.mcp[kk] = mx(hand.mcp[kk]); });
      Object.keys(hand.tip).forEach(function (kk) { if (hand.tip[kk]) hand.tip[kk] = mx(hand.tip[kk]); });
      out.rgba = m2; out.side = "left"; out.toImg = function (q) { return mx(toImg0(q)); };
    }
    out.truth = truth; out.params = params;
    return out;
  }
  var api = { synthReal: synthReal, BASE: BASE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PalmSynthReal = api;
})(typeof window !== "undefined" ? window : globalThis);
