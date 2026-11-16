/* tests/fixtures/face-capture/face-model.js — SYNTHETIC face for the face-capture tests (owner order 2026-11-16, item A).
 * No photo and no real person: a 68-point face built from round anthropometric numbers (millimetres), turned in 3-D, and
 * projected through a pinhole model of a phone camera. Optional: a drawn picture of that face (flat shapes on an RGBA
 * buffer) with blur, dark, backlight and glasses-glare conditions, for the image-quality checks.
 * Node: module.exports · Browser (e2e init script): window.__FCModel. Test fixture only; no product page loads it.
 *
 * Camera model. A lens of focal length f35 (35 mm-equivalent; the 35 mm frame is 36 x 24 mm, diagonal 43.27 mm) on a
 * 4:3 sensor covers 34.62 x 25.96 equivalent-mm (0.8 and 0.6 of the diagonal). A 16:9 video mode keeps the long side
 * and crops the short side to 34.62 x 9/16 = 19.47 mm. Held upright, the short side is the picture width. Focal length
 * in pixels = f35 / (equivalent width in mm) x (picture width in px). So the eye distance as a share of the picture
 * width is IPD x f35 / (distance x equivalent width) (see docs/FACE-CAPTURE.md).
 *
 * PROFILES  id -> {f35, sensor:'16:9'|'4:3', W, H, facing}
 * model(ipd=63) -> [[x,y,z] x 68] mm, origin between the eyes, x right (picture), y down, z towards the camera
 * shot({profile, d, ipd, yaw, pitch, roll, tx, ty}) -> {W, H, f, pts:[[u,v] x 68]}
 *   d = camera-to-eyes distance in mm; yaw > 0 turns the nose to picture-right; pitch > 0 = chin UP (head back);
 *   roll > 0 = clockwise on the picture; tx, ty = where the face centre (eyes + 0.2 x eyes-to-chin) lands, as a share of
 *   W and H (default 0.5, 0.42 = the centre of the guide oval).
 * render({W, H, pts, light, bg, backlight, dark, glasses, glare, blur, noise, seed}) -> {width, height, data}
 * sha256Hex(buf) (Node only), png(img) -> Buffer (Node only, for the reviewer's preview pictures)
 */
(function (root) {
  "use strict";
  var DIAG = Math.hypot(36, 24);
  var LONG = 0.8 * DIAG, SHORT43 = 0.6 * DIAG, SHORT169 = LONG * 9 / 16;
  var PROFILES = {
    "iphone-front-16x9": { f35: 23, sensor: "16:9", W: 720, H: 1280, facing: "user" },
    "iphone-front-4x3": { f35: 23, sensor: "4:3", W: 480, H: 640, facing: "user" },
    "android-front-24-16x9": { f35: 24, sensor: "16:9", W: 720, H: 1280, facing: "user" },
    "android-front-25-16x9": { f35: 25, sensor: "16:9", W: 720, H: 1280, facing: "user" },
    "android-front-26-16x9": { f35: 26, sensor: "16:9", W: 720, H: 1280, facing: "user" },
    "android-front-25-4x3": { f35: 25, sensor: "4:3", W: 480, H: 640, facing: "user" },
    "rear-26-16x9": { f35: 26, sensor: "16:9", W: 720, H: 1280, facing: "environment" }
  };
  /** equivalent width (mm) of the picture's horizontal side, phone upright */
  function eqWidth(p) { return p.sensor === "4:3" ? SHORT43 : SHORT169; }
  function focalPx(p) { return p.f35 / eqWidth(p) * p.W; }
  /** expected eye distance / picture width (the short side when upright) */
  function iodFrac(p, d, ipd) { return (ipd || 63) * p.f35 / (d * eqWidth(p)); }
  function distanceFor(p, frac, ipd) { return (ipd || 63) * p.f35 / (frac * eqWidth(p)); }

  /** 68 points (iBUG order), mm; eye centres at x = +-31.17 for ipd 62.33, scaled to ipd */
  function model(ipd) {
    var P = [], i, t;
    for (i = 0; i <= 16; i++) { t = Math.PI * i / 16; P.push([-68 * Math.cos(t), 5 + 107 * Math.sin(t), -75 + 65 * Math.sin(t)]); }
    var brow = [[-55, -20], [-45, -25], [-34, -27], [-22, -25], [-11, -21]];
    brow.forEach(function (b) { P.push([b[0], b[1], -10 - 15 * Math.abs(b[0]) / 55]); });
    brow.slice().reverse().forEach(function (b) { P.push([-b[0], b[1], -10 - 15 * Math.abs(b[0]) / 55]); });
    [[-10, -2], [5, 8], [20, 18], [37, 28]].forEach(function (n) { P.push([0, n[0], n[1]]); });
    [[-17, 42, 8], [-9, 44, 14], [0, 46, 18], [9, 44, 14], [17, 42, 8]].forEach(function (n) { P.push(n); });
    var eyeL = [[-46, 0], [-36, -4], [-26, -4], [-17, 0], [-26, 4], [-36, 4]];
    eyeL.forEach(function (e) { P.push([e[0], e[1], -15 - 5 * (Math.abs(e[0]) - 17) / 29]); });
    [[17, 0], [26, -4], [36, -4], [46, 0], [36, 4], [26, 4]].forEach(function (e) { P.push([e[0], e[1], -15 - 5 * (Math.abs(e[0]) - 17) / 29]); });
    [[-25, 70, -8], [-15, 65, 0], [-6, 63, 4], [0, 64, 5], [6, 63, 4], [15, 65, 0], [25, 70, -8], [15, 76, 0], [6, 79, 4], [0, 80, 5], [-6, 79, 4], [-15, 76, 0]]
      .forEach(function (m) { P.push(m); });
    [[-20, 70, -4], [-6, 68, 3], [0, 68, 3], [6, 68, 3], [20, 70, -4], [6, 72, 3], [0, 72, 3], [-6, 72, 3]].forEach(function (m) { P.push(m); });
    var k = (ipd || 63) / 62.333;
    return P.map(function (p) { return [p[0] * k, p[1] * k, p[2] * k]; });
  }
  var rad = function (deg) { return (deg || 0) * Math.PI / 180; };
  /** yaw (about y), then pitch (about x), then roll (about the view axis) */
  function turn(P, yaw, pitch, roll) {
    var a = rad(yaw), b = rad(pitch), c = rad(roll);
    return P.map(function (p) {
      var x = p[0] * Math.cos(a) + p[2] * Math.sin(a), y = p[1], z = -p[0] * Math.sin(a) + p[2] * Math.cos(a);
      var y2 = y * Math.cos(b) - z * Math.sin(b), z2 = z * Math.cos(b) + y * Math.sin(b);
      return [x * Math.cos(c) - y2 * Math.sin(c), x * Math.sin(c) + y2 * Math.cos(c), z2];
    });
  }
  function project(P, f, W, H, ox, oy, d) {
    return P.map(function (p) { var D = d - p[2]; return [W / 2 + f * (p[0] + ox) / D, H / 2 + f * (p[1] + oy) / D]; });
  }
  var mean = function (pts, a, b) { var x = 0, y = 0; for (var i = a; i <= b; i++) { x += pts[i][0]; y += pts[i][1]; } return [x / (b - a + 1), y / (b - a + 1)]; };
  /** face centre used by the guide: eye midpoint + 0.2 x (chin - eye midpoint) */
  function faceCentre(pts) {
    var L = mean(pts, 36, 41), R = mean(pts, 42, 47), e = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2], c = pts[8];
    return [e[0] + 0.2 * (c[0] - e[0]), e[1] + 0.2 * (c[1] - e[1])];
  }
  function shot(o) {
    var p = typeof o.profile === "string" ? PROFILES[o.profile] : o.profile;
    var W = o.W || p.W, H = o.H || p.H, f = p.f35 / eqWidth(p) * W, d = o.d;
    var P = turn(model(o.ipd || 63), o.yaw, o.pitch, o.roll);
    var tx = o.tx == null ? 0.5 : o.tx, ty = o.ty == null ? 0.42 : o.ty, ox = 0, oy = 0, pts;
    for (var k = 0; k < 6; k++) { // place the face centre on (tx, ty): the shift is linear in the offsets for a far-away face
      pts = project(P, f, W, H, ox, oy, d);
      var c = faceCentre(pts);
      ox += (tx * W - c[0]) * d / f; oy += (ty * H - c[1]) * d / f;
    }
    pts = project(P, f, W, H, ox, oy, d);
    return { W: W, H: H, f: f, pts: pts.map(function (q) { return [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]; }) };
  }

  /* ---------------- drawing (flat shapes on an RGBA buffer; no canvas needed) ---------------- */
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function Img(W, H) { return { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) }; }
  function fillAll(img, c) { for (var i = 0; i < img.data.length; i += 4) { img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; } }
  function put(img, x, y, c) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    var i = (y * img.width + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
  }
  /** even-odd scanline fill of a polygon (pixel centres) */
  function poly(img, pts, c) {
    var y0 = Math.max(0, Math.floor(Math.min.apply(null, pts.map(function (p) { return p[1]; })))),
      y1 = Math.min(img.height - 1, Math.ceil(Math.max.apply(null, pts.map(function (p) { return p[1]; }))));
    for (var y = y0; y <= y1; y++) {
      var yc = y + 0.5, xs = [];
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var a = pts[i], b = pts[j];
        if ((a[1] > yc) !== (b[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (var k = 0; k + 1 < xs.length; k += 2) for (var x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(img.width - 1, Math.floor(xs[k + 1] - 0.5)); x++) put(img, x, y, c);
    }
  }
  function ellipse(img, cx, cy, rx, ry, c, rot) {
    var n = 48, P = [], cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
    for (var i = 0; i < n; i++) { var t = 2 * Math.PI * i / n, x = rx * Math.cos(t), y = ry * Math.sin(t); P.push([cx + x * cr - y * sr, cy + x * sr + y * cr]); }
    poly(img, P, c);
  }
  function line(img, pts, w, c) {
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / Math.max(1, w / 3)));
      for (var k = 0; k <= n; k++) ellipse(img, a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, w / 2, w / 2, c);
    }
  }
  function boxBlur(img, r) {
    if (!(r >= 1)) return img;
    var W = img.width, H = img.height, d = img.data, tmp = new Float32Array(W * H), ch, x, y, s, k;
    for (var pass = 0; pass < 3; pass++) for (ch = 0; ch < 3; ch++) {
      for (y = 0; y < H; y++) { s = 0; for (k = -r; k <= r; k++) s += d[(y * W + Math.min(W - 1, Math.max(0, k))) * 4 + ch];
        for (x = 0; x < W; x++) { tmp[y * W + x] = s / (2 * r + 1); s += d[(y * W + Math.min(W - 1, x + r + 1)) * 4 + ch] - d[(y * W + Math.max(0, x - r)) * 4 + ch]; } }
      for (x = 0; x < W; x++) { s = 0; for (k = -r; k <= r; k++) s += tmp[Math.min(H - 1, Math.max(0, k)) * W + x];
        for (y = 0; y < H; y++) { d[(y * W + x) * 4 + ch] = s / (2 * r + 1); s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
    }
    return img;
  }
  var mul = function (c, k) { return [c[0] * k, c[1] * k, c[2] * k]; };
  /** aligned frame of the eyes: unit = eye distance */
  function eyeFrame(pts) {
    var L = mean(pts, 36, 41), R = mean(pts, 42, 47), th = Math.atan2(R[1] - L[1], R[0] - L[0]), iod = Math.hypot(R[0] - L[0], R[1] - L[1]);
    var c = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2];
    return { L: L, R: R, c: c, iod: iod, th: th, img: function (x, y) { return [c[0] + iod * (x * Math.cos(th) - y * Math.sin(th)), c[1] + iod * (x * Math.sin(th) + y * Math.cos(th))]; } };
  }
  function render(o) {
    var W = o.W, H = o.H, pts = o.pts, img = Img(W, H), F = eyeFrame(pts), u = F.iod;
    var light = o.dark ? 0.2 : o.light == null ? 1 : o.light, faceK = o.backlight ? 0.42 * light : light;
    var bg = o.backlight ? [252, 250, 246] : mul(o.bg || [150, 160, 172], light);
    fillAll(img, bg);
    if (o.backlight) { var wall = mul([120, 118, 115], light); poly(img, [[0, H * 0.75], [W, H * 0.75], [W, H], [0, H]], wall); }
    var skin = mul([214, 168, 136], faceK), skinDark = mul([176, 128, 100], faceK), hair = mul([38, 28, 22], faceK);
    // neck and shoulders
    poly(img, [pts[5], pts[11], [pts[11][0], H + 10], [pts[5][0], H + 10]], skinDark);
    ellipse(img, F.c[0], pts[8][1] + 2.6 * u, 2.4 * u, 1.3 * u, mul([52, 70, 92], faceK));
    // hair behind the head
    var hc = F.img(0, -0.95); ellipse(img, hc[0], hc[1], 1.4 * u, 1.0 * u, hair, F.th);
    // face: jaw 0..16 plus a forehead arc back to 0
    var face = pts.slice(0, 17).map(function (p) { return p.slice(); });
    for (var i = 1; i < 16; i++) { var t = Math.PI * i / 16; face.push(F.img(1.08 * Math.cos(t), -0.15 - 1.05 * Math.sin(t))); }
    poly(img, face, skin);
    // fringe
    var fr = F.img(0, -1.05); ellipse(img, fr[0], fr[1], 1.0 * u, 0.32 * u, hair, F.th);
    // brows
    line(img, pts.slice(17, 22), 0.085 * u, mul([48, 34, 26], faceK)); line(img, pts.slice(22, 27), 0.085 * u, mul([48, 34, 26], faceK));
    // eyes
    [[36, 41, F.L], [42, 47, F.R]].forEach(function (e) {
      poly(img, pts.slice(e[0], e[1] + 1), mul([236, 232, 226], faceK));
      ellipse(img, e[2][0], e[2][1], 0.085 * u, 0.085 * u, mul([78, 50, 32], faceK));
      ellipse(img, e[2][0], e[2][1], 0.038 * u, 0.038 * u, mul([12, 9, 7], faceK));
      line(img, pts.slice(e[0], e[0] + 4), 0.022 * u, mul([40, 26, 18], faceK));
    });
    // nose and mouth
    line(img, [pts[27], pts[30]], 0.05 * u, mul([196, 150, 120], faceK));
    ellipse(img, (pts[31][0] + pts[32][0]) / 2, pts[32][1], 0.045 * u, 0.025 * u, mul([92, 56, 40], faceK), F.th);
    ellipse(img, (pts[34][0] + pts[35][0]) / 2, pts[34][1], 0.045 * u, 0.025 * u, mul([92, 56, 40], faceK), F.th);
    poly(img, pts.slice(48, 60), mul([168, 74, 68], faceK));
    line(img, pts.slice(60, 65), 0.02 * u, mul([96, 36, 32], faceK));
    // glasses: thin frames around each eye; glare = a saturated patch on the upper part of each lens
    if (o.glasses || o.glare) {
      [F.L, F.R].forEach(function (e, side) {
        var cx = e[0], cy = e[1], hw = 0.42 * u, hh = 0.3 * u, c = Math.cos(F.th), s = Math.sin(F.th);
        var corner = function (x, y) { return [cx + x * c - y * s, cy + x * s + y * c]; };
        line(img, [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh), corner(-hw, -hh)], 0.035 * u, mul([30, 30, 34], faceK));
        if (o.glare) { var g = corner(side ? -0.1 * u : 0.1 * u, -0.1 * u); ellipse(img, g[0], g[1], 0.3 * u, 0.13 * u, [255, 255, 255], F.th + (side ? 0.3 : -0.3)); }
      });
    }
    if (o.blur) boxBlur(img, Math.round(o.blur));
    if (o.noise) { var r = rng(o.seed || 7), n = o.noise; for (var q = 0; q < img.data.length; q += 4) { var v = (r() - 0.5) * 2 * n; img.data[q] += v; img.data[q + 1] += v; img.data[q + 2] += v; } }
    return img;
  }

  var api = { PROFILES: PROFILES, eqWidth: eqWidth, focalPx: focalPx, iodFrac: iodFrac, distanceFor: distanceFor, model: model, turn: turn, shot: shot, faceCentre: faceCentre, render: render };
  if (typeof module !== "undefined" && module.exports) {
    var crypto = require("node:crypto"), zlib = require("node:zlib");
    api.sha256Hex = function (buf) { return crypto.createHash("sha256").update(Buffer.from(buf.buffer || buf)).digest("hex"); };
    api.png = function (img) {
      var W = img.width, H = img.height, raw = Buffer.alloc((W * 3 + 1) * H);
      for (var y = 0; y < H; y++) {
        raw[y * (W * 3 + 1)] = 0;
        for (var x = 0; x < W; x++) { var i = (y * W + x) * 4, o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = img.data[i]; raw[o + 1] = img.data[i + 1]; raw[o + 2] = img.data[i + 2]; }
      }
      var crcT = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
      var crc = function (b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
      var chunk = function (type, data) {
        var len = Buffer.alloc(4); len.writeUInt32BE(data.length); var td = Buffer.concat([Buffer.from(type), data]);
        var cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]);
      };
      var ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
      return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
    };
    module.exports = api;
  }
  if (typeof window !== "undefined") root.__FCModel = api;
})(typeof window !== "undefined" ? window : globalThis);
