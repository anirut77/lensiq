/* tools/look-synth-face.js — synthetic face renderer for the look-preview measurement (docs/LOOK-PREVIEW-EVAL.md).
 * No photo of any person: every face is drawn here from numbers (seeded), so the true outlines of lips, eyes, brows,
 * hair and eye corners are known exactly ("drawn ground truth"). Used only by tools/look-preview-eval.mjs in headless
 * Chrome; not part of the site build.
 *
 *   LQSynthFace.params(seed) -> p      deterministic parameters for one face (skin, shape, pose, light)
 *   LQSynthFace.draw(ctx, W, H, p, {jitter?}) -> gt  draws the face, returns ground truth in pixels:
 *     { lipOuter: [[x,y]...], lipInner, eyes: [{upper, lower, inner, outer}] (image-left eye first), brows: [poly, poly],
 *       hair: poly, ipd, centre: [x,y] }
 */
(function (root) {
  "use strict";
  function rng(seed) {
    var a = (seed * 2654435761) >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  // skin base colours spanning light to deep (sRGB), hair colours, lip colours
  var SKIN = [[241, 204, 176], [228, 185, 150], [210, 160, 120], [187, 136, 98], [160, 110, 76], [128, 84, 58], [96, 62, 44]];
  var HAIR = [[22, 18, 16], [45, 32, 24], [70, 48, 32], [110, 78, 50], [30, 26, 26]];
  var LIP = [[178, 92, 96], [160, 78, 80], [196, 112, 112], [140, 70, 72]];
  function params(seed) {
    var r = rng(seed + 1);
    var pick = function (arr) { return arr[Math.floor(r() * arr.length)]; };
    return {
      seed: seed,
      skin: SKIN[seed % SKIN.length], hair: pick(HAIR), lip: pick(LIP),
      faceW: lerp(1.05, 1.2, r()), faceH: lerp(1.0, 1.0, r()),          // relative to IPD units below
      ipd: lerp(48, 72, r()),                                            // px at 640 x 480
      eyeW: lerp(0.40, 0.50, r()), eyeH: lerp(0.15, 0.22, r()), eyeTilt: lerp(-0.05, 0.07, r()),
      browGap: lerp(0.22, 0.34, r()), browArch: lerp(0.02, 0.12, r()), browThick: lerp(0.06, 0.11, r()), browLen: lerp(0.52, 0.66, r()),
      mouthW: lerp(0.75, 1.0, r()), lipUp: lerp(0.09, 0.14, r()), lipLow: lerp(0.11, 0.17, r()), mouthY: lerp(1.08, 1.22, r()),
      noseY: lerp(0.72, 0.84, r()),
      roll: lerp(-12, 12, r()), cx: lerp(0.42, 0.58, r()), cy: lerp(0.42, 0.56, r()),
      light: lerp(-0.5, 0.5, r()), warm: lerp(-0.12, 0.12, r()), bright: lerp(0.8, 1.15, r()),
      bg: [Math.round(lerp(90, 200, r())), Math.round(lerp(90, 200, r())), Math.round(lerp(90, 200, r()))]
    };
  }
  var rgb = function (c, k, warm, bright) {
    var w = warm || 0, b = bright || 1;
    var cl = function (v) { return Math.max(0, Math.min(255, Math.round(v))); };
    return "rgb(" + cl(c[0] * k * b * (1 + w)) + "," + cl(c[1] * k * b) + "," + cl(c[2] * k * b * (1 - w)) + ")";
  };
  /** quadratic-bezier sample @returns {number[][]} */
  function quad(a, c, b, n) {
    var out = [];
    for (var i = 0; i <= n; i++) { var t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
    return out;
  }
  function path(ctx, pts, close) { ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); if (close) ctx.closePath(); }

  function draw(ctx, W, H, p, opt) {
    var o = opt || {}, jr = rng((p.seed + 7) * 31 + (o.frame || 0)), jit = o.jitter || 0;
    var u = p.ipd, cx = p.cx * W + (jr() - 0.5) * jit, cy = p.cy * H + (jr() - 0.5) * jit, th = p.roll * Math.PI / 180;
    var cos = Math.cos(th), sin = Math.sin(th);
    // face coordinates: origin between the eyes, unit = IPD, y down
    var T = function (x, y) { return [cx + (x * cos - y * sin) * u, cy + (x * sin + y * cos) * u]; };
    var TP = function (pts) { return pts.map(function (q) { return T(q[0], q[1]); }); };
    var K = function (k) { return rgb(p.skin, k, p.warm, p.bright); };
    ctx.fillStyle = "rgb(" + p.bg.join(",") + ")"; ctx.fillRect(0, 0, W, H);
    // neck and shoulders
    path(ctx, TP([[-0.45, 1.5], [0.45, 1.5], [0.5, 2.5], [1.8, 2.9], [2, 4.5], [-2, 4.5], [-1.8, 2.9], [-0.5, 2.5]]), true);
    ctx.fillStyle = K(0.82); ctx.fill();
    // hair behind the head
    var hw = p.faceW * 1.12, hh = p.faceH;
    var hairBack = [];
    for (var i = 0; i <= 40; i++) { var a = Math.PI + i / 40 * Math.PI; hairBack.push([Math.cos(a) * hw, 0.1 + Math.sin(a) * 1.35]); }
    hairBack.push([hw, 0.9], [hw * 0.8, 1.1], [-hw * 0.8, 1.1], [-hw, 0.9]);
    path(ctx, TP(hairBack), true); ctx.fillStyle = rgb(p.hair, 1, 0, p.bright); ctx.fill();
    // face oval with shading (light from the left or right)
    var face = [];
    for (var j = 0; j < 64; j++) { var b = j / 64 * Math.PI * 2; var yy = Math.sin(b), sx = yy > 0 ? 1 - 0.28 * yy * yy : 1; face.push([Math.cos(b) * p.faceW * sx,
      0.35 + yy * p.faceH * (yy > 0 ? 1.5 : 1.3)]); }
    path(ctx, TP(face), true);
    var c0 = T(-p.light * 0.6, 0.2), g = ctx.createRadialGradient(c0[0], c0[1], u * 0.1, c0[0], c0[1], u * 1.6);
    g.addColorStop(0, K(1.04)); g.addColorStop(0.7, K(0.94)); g.addColorStop(1, K(0.78));
    ctx.fillStyle = g; ctx.fill();
    // ears
    [-1, 1].forEach(function (s) { path(ctx, TP([[s * p.faceW * 0.98, -0.05], [s * (p.faceW + 0.12), 0.05], [s * (p.faceW + 0.1), 0.45], [s * p.faceW * 0.96, 0.55]]),
      true); ctx.fillStyle = K(0.88); ctx.fill(); });
    // hair fringe line (hairline), the hair polygon for ground truth = back hair minus face is approximated by the cap
    var cap = [];
    for (var k = 0; k <= 30; k++) { var c = Math.PI + k / 30 * Math.PI; cap.push([Math.cos(c) * p.faceW * 1.02, -0.72 + Math.sin(c) * 0.55]); }
    cap.push([p.faceW * 0.95, -0.6], [0, -0.82], [-p.faceW * 0.95, -0.6]);
    path(ctx, TP(cap), true); ctx.fillStyle = rgb(p.hair, 1, 0, p.bright); ctx.fill();
    // eyes
    var eyes = [];
    [-0.5, 0.5].forEach(function (ex, idx) {
      var s = idx ? 1 : -1, w = p.eyeW / 2, h = p.eyeH;
      var inner = [ex - s * w, s * 0 + p.eyeTilt * 0.5 * 0], outer = [ex + s * w, -p.eyeTilt];
      inner = [ex - s * w, 0]; // inner corner level, outer corner lifted by tilt
      var up = quad(inner, [ex, -h * 1.15], outer, 16), lo = quad(inner, [ex, h * 0.75], outer, 16);
      var white = up.concat(lo.slice().reverse());
      path(ctx, TP(white), true); ctx.fillStyle = "rgb(236,234,228)"; ctx.fill();
      var ic = T(ex, -h * 0.12); ctx.save(); path(ctx, TP(white), true); ctx.clip();
      ctx.beginPath(); ctx.arc(ic[0], ic[1], u * h * 0.62, 0, Math.PI * 2); ctx.fillStyle = "rgb(70,46,30)"; ctx.fill();
      ctx.beginPath(); ctx.arc(ic[0], ic[1], u * h * 0.28, 0, Math.PI * 2); ctx.fillStyle = "rgb(12,10,10)"; ctx.fill();
      ctx.beginPath(); ctx.arc(ic[0] + u * 0.03, ic[1] - u * 0.03, u * 0.018, 0, Math.PI * 2); ctx.fillStyle = "rgb(250,250,250)"; ctx.fill();
      ctx.restore();
      // upper lid line and crease
      path(ctx, TP(up), false); ctx.strokeStyle = "rgb(40,28,24)"; ctx.lineWidth = Math.max(1, u * 0.022); ctx.stroke();
      path(ctx, TP(quad([inner[0] + s * 0.02, inner[1] - 0.05], [ex, -h * 1.9], [outer[0] - s * 0.02, outer[1] - 0.06], 12)), false);
      ctx.strokeStyle = K(0.72); ctx.lineWidth = Math.max(1, u * 0.012); ctx.stroke();
      path(ctx, TP(lo), false); ctx.strokeStyle = K(0.7); ctx.lineWidth = Math.max(1, u * 0.01); ctx.stroke();
      eyes.push({ upper: TP(up), lower: TP(lo), inner: T(inner[0], inner[1]), outer: T(outer[0], outer[1]) });
    });
    // brows: tapered shapes (head thicker, tail thin)
    var brows = [];
    [-1, 1].forEach(function (s) {
      var x0 = s * 0.27, x1 = s * (0.27 + p.browLen), y0 = -p.browGap - 0.02, yT = -p.browGap + 0.02;
      var top = quad([x0, y0 - p.browThick], [(x0 + x1) / 2 + s * 0.08, y0 - p.browThick - p.browArch * 2.2], [x1, yT - p.browThick * 0.25], 14);
      var bot = quad([x0, y0], [(x0 + x1) / 2 + s * 0.08, y0 - p.browArch * 1.6], [x1, yT], 14);
      var poly = top.concat(bot.slice().reverse());
      path(ctx, TP(poly), true); ctx.fillStyle = rgb(p.hair, 1.1, 0, p.bright); ctx.fill();
      brows.push(TP(poly));
    });
    // nose: bridge shading and nostrils
    var nb = T(-0.06 * Math.sign(p.light || 1), 0.1), nt = T(0, p.noseY);
    var ng = ctx.createLinearGradient(nb[0], nb[1], nt[0], nt[1]); ng.addColorStop(0, K(0.98)); ng.addColorStop(1, K(0.9));
    path(ctx, TP([[-0.08, 0.05], [0.08, 0.05], [0.16, p.noseY], [-0.16, p.noseY]]), true); ctx.fillStyle = ng; ctx.fill();
    path(ctx, TP(quad([-0.2, p.noseY - 0.02], [0, p.noseY + 0.12], [0.2, p.noseY - 0.02], 10)), false); ctx.strokeStyle = K(0.66); ctx.lineWidth = Math.max(1, u * 0.02); ctx.stroke();
    [-0.09, 0.09].forEach(function (nx) { var q = T(nx, p.noseY + 0.01); ctx.beginPath(); ctx.ellipse(q[0], q[1], u * 0.045, u * 0.022, th, 0, Math.PI * 2); ctx.fillStyle = K(0.45); ctx.fill(); });
    // lips
    var mw = p.mouthW / 2, my = p.mouthY;
    var L = [-mw, my], R = [mw, my];
    var upTop = quad(L, [-mw * 0.4, my - p.lipUp * 1.25], [0, my - p.lipUp * 0.75], 10).concat(quad([0, my - p.lipUp * 0.75], [mw * 0.4, my - p.lipUp * 1.25], R, 10).slice(1));
    var lowBot = quad(R, [0, my + p.lipLow * 2.0], L, 20);
    var seam = quad(L, [0, my + 0.015], R, 20);
    var outer = upTop.concat(lowBot.slice(1, -1));
    path(ctx, TP(upTop.concat(seam.slice().reverse())), true); ctx.fillStyle = rgb(p.lip, 0.92, p.warm, p.bright); ctx.fill();
    path(ctx, TP(seam.concat(lowBot.slice(1))), true); ctx.fillStyle = rgb(p.lip, 1.05, p.warm, p.bright); ctx.fill();
    path(ctx, TP(seam), false); ctx.strokeStyle = rgb(p.lip, 0.55, 0, p.bright); ctx.lineWidth = Math.max(1, u * 0.014); ctx.stroke();
    // chin shadow
    var ch = T(0, 1.62); ctx.beginPath(); ctx.ellipse(ch[0], ch[1], u * 0.22, u * 0.05, th, 0, Math.PI * 2); ctx.fillStyle = K(0.9); ctx.fill();
    return { lipOuter: TP(outer), lipInner: TP(seam), mouthCorners: [T(L[0], L[1]), T(R[0], R[1])], eyes: eyes, brows: brows, hair: TP(hairBack), ipd: u, centre: [cx, cy], roll: p.roll };
  }

  var api = { params: params, draw: draw };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LQSynthFace = api;
})(typeof window !== "undefined" ? window : globalThis);
