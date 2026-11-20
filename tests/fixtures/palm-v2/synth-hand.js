/* tests/fixtures/palm-v2/synth-hand.js — FIXED TEST SET "palm-layers" (palm reading upgrade v1, 2026-11-19).
 * A DRAWN, SYNTHETIC hand (no photo of any person): a skin-coloured palm polygon, four finger capsules and a thumb, a
 * seeded skin texture with short distractor creases, and the palm lines asked for, each a dark Gaussian valley along a
 * known curve. Pure JavaScript (Node and browser): returns RGBA pixels, the hand geometry and the ground truth.
 *   const S = require("./synth-hand.js"); const h = S.synthHand({ lines: ["heart", "head", "life"], seed: 7 });
 *   h = { w, h, rgba: Uint8ClampedArray, hand: {source, wrist, mcp:{index,middle,ring,pinky}, tip:{...}, thumbBase:null, pts:null},
 *         taps: {wrist, indexBase, pinkyBase, indexTip, middleTip, ringTip, pinkyTip}, truth: {id: [[u,v],...]}, pw, toImg(uv) }
 * Frame (u, v): u = 0 at the index knuckle (MCP), u = 1 at the little-finger knuckle, v = 0 on the knuckle line, v = 1 at the
 * wrist. "taps" are the 7 points a person taps (finger creases, tips, wrist); "hand" is what the 7-tap rule turns them into
 * (knuckles = creases moved 10 % of the way towards the wrist), so both routes give the same frame.
 * Options: lines (ids drawn), seed, blur (box-blur radius px), glare (bright clipped blob on the palm), dark (0-1 gain),
 *   bright (add), uneven (a strong shadow edge across the palm), distract (number of short random creases, default 140),
 *   depth (gain on line darkness, default 1), side ("right" default | "left" = mirrored image), scale (default 1).
 * Accuracy numbers measured on this hand are SYNTHETIC, never field numbers. */
(function (root) {
  "use strict";
  var TRUTH = {
    heart: [[1.08, 0.22], [0.85, 0.19], [0.62, 0.17], [0.4, 0.13], [0.2, 0.05]],
    head: [[-0.06, 0.3], [0.2, 0.36], [0.45, 0.42], [0.68, 0.48], [0.85, 0.55]],
    life: [[-0.06, 0.33], [0.13, 0.47], [0.24, 0.63], [0.28, 0.8], [0.27, 0.97]],
    fate: [[0.52, 0.98], [0.51, 0.78], [0.49, 0.58], [0.47, 0.4], [0.45, 0.25]],
    sun: [[0.68, 0.45], [0.67, 0.3], [0.66, 0.12]],
    mercury: [[0.92, 0.42], [0.91, 0.28], [0.9, 0.14]],
    bracelet: [[0.15, 1.06], [0.5, 1.075], [0.9, 1.06]],
    simian: [[1.08, 0.27], [0.7, 0.28], [0.35, 0.3], [-0.06, 0.31]]
  };
  var STYLE = { heart: [1, 1.9], head: [1, 1.9], life: [1, 2.0], fate: [0.8, 1.5], sun: [0.7, 1.2], mercury: [0.7, 1.2], bracelet: [0.8, 1.4], simian: [1, 2.0] };
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  /** Chaikin smoothing, 3 rounds, end points kept */
  function smooth(p) {
    for (var r = 0; r < 3; r++) {
      var q = [p[0]];
      for (var i = 0; i < p.length - 1; i++) { q.push(lerp(p[i], p[i + 1], 0.25)); q.push(lerp(p[i], p[i + 1], 0.75)); }
      q.push(p[p.length - 1]); p = q;
    }
    return p;
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
  function synthHand(o) {
    o = o || {};
    var W = 900, H = 1200, sc = o.scale || 1, rand = rng(o.seed == null ? 7 : o.seed);
    var lines = o.lines || ["heart", "head", "life", "fate"];
    // taps (image px) -> hand by the 7-tap rule
    var cx = 450, k = sc;
    var P = function (x, y) { return [cx + (x - cx) * k, 600 + (y - 600) * k]; };
    var tW = P(450, 1080), tA = P(600, 560), tB = P(300, 600);
    var M = lerp(tA, tB, 0.5), down = [(tW[0] - M[0]) * 0.1, (tW[1] - M[1]) * 0.1];
    var A = [tA[0] + down[0], tA[1] + down[1]], B = [tB[0] + down[0], tB[1] + down[1]];
    var Mm = lerp(A, B, 0.5), U = [B[0] - A[0], B[1] - A[1]], V = [tW[0] - Mm[0], tW[1] - Mm[1]];
    var toImg = function (q) { return [A[0] + q[0] * U[0] + q[1] * V[0], A[1] + q[0] * U[1] + q[1] * V[1]]; };
    var det = U[0] * V[1] - U[1] * V[0];
    var toUV = function (x, y) { var a = x - A[0], b = y - A[1]; return [(a * V[1] - b * V[0]) / det, (U[0] * b - U[1] * a) / det]; };
    var tips = { index: [0.0, -0.62], middle: [0.33, -0.7], ring: [0.66, -0.64], pinky: [1.0, -0.48] };
    var bases = { index: [0.0, 0.02], middle: [1 / 3, 0.0], ring: [2 / 3, 0.02], pinky: [1.0, 0.05] };
    var palmUV = [[-0.12, -0.04], [1.1, -0.02], [1.14, 0.5], [1.05, 1.0], [0.75, 1.12], [0.2, 1.12], [-0.1, 0.95], [-0.2, 0.5]];
    var palm = palmUV.map(toImg), pw = Math.hypot(U[0], U[1]);
    var caps = [];
    Object.keys(tips).forEach(function (f) { caps.push([toImg(bases[f]), toImg(tips[f]), pw * (f === "pinky" ? 0.085 : 0.1)]); });
    caps.push([toImg([-0.2, 0.72]), toImg([-0.62, 0.2]), pw * 0.12]); // thumb
    var arm = [[0.02, 0.95], [1.0, 0.95], [1.02, 1.5], [0.0, 1.5]].map(toImg);
    // base colours
    var rgba = new Uint8ClampedArray(W * H * 4), dark = new Float32Array(W * H), skin = new Uint8Array(W * H), x, y, i;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      var p = [x + 0.5, y + 0.5], s = inPoly(p[0], p[1], palm) || inPoly(p[0], p[1], arm);
      for (var c = 0; !s && c < caps.length; c++) s = segDist(p, caps[c][0], caps[c][1]) <= caps[c][2];
      skin[i] = s ? 1 : 0;
    }
    // distractor creases (short, light) + skin mottling
    var nd = o.distract == null ? 140 : o.distract;
    var stamp = function (path, depth, sigma) {
      var r = Math.ceil(sigma * 3);
      for (var j = 0; j < path.length - 1; j++) {
        var a = path[j], b = path[j + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.5));
        for (var t = 0; t <= n; t++) {
          var q = lerp(a, b, t / n), x0 = Math.floor(q[0] - r), x1 = Math.ceil(q[0] + r), y0 = Math.floor(q[1] - r), y1 = Math.ceil(q[1] + r);
          for (var yy = Math.max(0, y0); yy <= Math.min(H - 1, y1); yy++) for (var xx = Math.max(0, x0); xx <= Math.min(W - 1, x1); xx++) {
            var d2 = (xx + 0.5 - q[0]) * (xx + 0.5 - q[0]) + (yy + 0.5 - q[1]) * (yy + 0.5 - q[1]), v = depth * Math.exp(-d2 / (2 * sigma * sigma)), ii = yy * W + xx;
            if (v > dark[ii]) dark[ii] = v;
          }
        }
      }
    };
    for (var d = 0; d < nd; d++) {
      var u0 = -0.1 + rand() * 1.2, v0 = 0.02 + rand() * 1.0, ang = rand() * Math.PI, len = 0.02 + rand() * 0.035;
      var a0 = toImg([u0, v0]), L0 = len * pw;
      stamp([a0, [a0[0] + Math.cos(ang) * L0, a0[1] + Math.sin(ang) * L0]], 0.22 + rand() * 0.12, 0.9);
    }
    var gain = o.depth == null ? 1 : o.depth;
    lines.forEach(function (id) {
      var st = STYLE[id] || [0.8, 1.4], pts = smooth(TRUTH[id].map(toImg));
      stamp(pts, Math.min(1, st[0] * gain), st[1] * sc);
    });
    var gr = rand() * 1000;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x; var j = i * 4;
      if (!skin[i]) { rgba[j] = 70; rgba[j + 1] = 92; rgba[j + 2] = 120; rgba[j + 3] = 255; continue; }
      var mott = 6 * Math.sin((x + gr) / 37) * Math.cos((y - gr) / 53) + (rand() - 0.5) * 10;
      var f = 1 - 0.55 * dark[i];
      rgba[j] = (222 + mott) * f; rgba[j + 1] = (176 + mott) * f; rgba[j + 2] = (150 + mott) * f; rgba[j + 3] = 255;
    }
    if (o.uneven) { // a hard shadow across the lower-left of the palm
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { var uv = toUV(x, y); if (uv[0] + uv[1] * 0.6 < 0.55) { j = (y * W + x) * 4; rgba[j] *= 0.42; rgba[j + 1] *= 0.42; rgba[j + 2] *= 0.42; } }
    }
    if (o.glare) { // clipped white blob on the palm centre
      var g0 = toImg([0.5, 0.45]), gR = pw * 0.18;
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { var dd = Math.hypot(x - g0[0], y - g0[1]); if (dd < gR) { j = (y * W + x) * 4; var w8 = dd < gR * 0.7 ? 1 : (gR - dd) / (gR * 0.3);
        rgba[j] += (255 - rgba[j]) * w8; rgba[j + 1] += (255 - rgba[j + 1]) * w8; rgba[j + 2] += (255 - rgba[j + 2]) * w8; } }
    }
    if (o.dark != null || o.bright != null) {
      var gk = o.dark == null ? 1 : o.dark, add = o.bright || 0;
      for (j = 0; j < rgba.length; j += 4) { rgba[j] = rgba[j] * gk + add; rgba[j + 1] = rgba[j + 1] * gk + add; rgba[j + 2] = rgba[j + 2] * gk + add; }
    }
    if (o.blur) { // separable box blur, 3 passes
      var R = Math.max(1, Math.round(o.blur)), tmp = new Float32Array(W * H);
      for (var ch = 0; ch < 3; ch++) for (var pass = 0; pass < 3; pass++) {
        for (y = 0; y < H; y++) { var acc = 0; for (x = -R; x <= R; x++) acc += rgba[(y * W + Math.min(W - 1, Math.max(0, x))) * 4 + ch];
          for (x = 0; x < W; x++) { tmp[y * W + x] = acc / (2 * R + 1); acc += rgba[(y * W + Math.min(W - 1, x + R + 1)) * 4 + ch] - rgba[(y * W + Math.max(0, x - R)) * 4 + ch]; } }
        for (x = 0; x < W; x++) { var ac = 0; for (y = -R; y <= R; y++) ac += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
          for (y = 0; y < H; y++) { rgba[(y * W + x) * 4 + ch] = ac / (2 * R + 1); ac += tmp[Math.min(H - 1, y + R + 1) * W + x] - tmp[Math.max(0, y - R) * W + x]; } }
      }
    }
    var taps = { wrist: tW, indexBase: tA, pinkyBase: tB, indexTip: toImg(tips.index), middleTip: toImg(tips.middle), ringTip: toImg(tips.ring), pinkyTip: toImg(tips.pinky) };
    var hand = { source: "tap", wrist: tW, mcp: { index: A, middle: lerp(A, B, 1 / 3), ring: lerp(A, B, 2 / 3), pinky: B },
      tip: { thumb: null, index: taps.indexTip, middle: taps.middleTip, ring: taps.ringTip, pinky: taps.pinkyTip }, thumbBase: null, pts: null };
    var truth = {}; lines.forEach(function (id) { truth[id] = TRUTH[id].map(function (q) { return q.slice(); }); });
    var out = { w: W, h: H, rgba: rgba, hand: hand, taps: taps, truth: truth, pw: pw, toImg: toImg, side: "right" };
    if (o.side === "left") { // mirror the image and every point
      var m = new Uint8ClampedArray(rgba.length);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { var s0 = (y * W + x) * 4, s1 = (y * W + (W - 1 - x)) * 4; m[s1] = rgba[s0]; m[s1 + 1] = rgba[s0 + 1]; m[s1 + 2] = rgba[s0 + 2];
        m[s1 + 3] = 255; }
      var mx = function (p) { return [W - p[0], p[1]]; };
      Object.keys(taps).forEach(function (kk) { taps[kk] = mx(taps[kk]); });
      hand.wrist = mx(hand.wrist); Object.keys(hand.mcp).forEach(function (kk) { hand.mcp[kk] = mx(hand.mcp[kk]); });
      Object.keys(hand.tip).forEach(function (kk) { if (hand.tip[kk]) hand.tip[kk] = mx(hand.tip[kk]); });
      out.rgba = m; out.side = "left"; out.toImg = function (q) { return mx(toImg(q)); };
    }
    return out;
  }
  var api = { synthHand: synthHand, TRUTH: TRUTH };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PalmSynth = api;
})(typeof window !== "undefined" ? window : globalThis);
