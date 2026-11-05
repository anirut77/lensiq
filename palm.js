/* ดูลายมือ AI — อ่านลายมือจากภาพถ่ายฝ่ามือเพื่อความบันเทิง
   ประมวลผลในเบราว์เซอร์ทั้งหมด ไม่ส่งและไม่บันทึกภาพ
   ส่วนแรก (PalmCore) เป็นฟังก์ชันล้วน ทดสอบใน Node ได้:  const PC = require("./palm.js")
   ส่วนหลัง (UI) ทำงานเฉพาะในเบราว์เซอร์

   โมเดลจุดบนมือ: MediaPipe Hands (lite) เวอร์ชัน TF.js graph model (Apache-2.0) จาก tfhub.dev/mediapipe/tfjs-model/handpose_3d
   เก็บไว้ที่ vendor/models/hand/{detector,landmark}/ — รันด้วย tfjs ใน vendor/face-api.js (WebGL → WASM → CPU) ไม่ใช้ MediaPipe Tasks
   ขั้นตอน pre/post-processing ย่อจาก @tensorflow-models/hand-pose-detection (tfjs runtime)

   จุด 21 จุด: 0 ข้อมือ, 1–4 นิ้วโป้ง (CMC, MCP, IP, ปลาย), 5–8 นิ้วชี้ (MCP…ปลาย), 9–12 นิ้วกลาง, 13–16 นิ้วนาง, 17–20 นิ้วก้อย

   กรอบฝ่ามือ (u, v): u = 0 ที่โคนนิ้วชี้ (MCP 5) → u = 1 ที่โคนนิ้วก้อย (MCP 17), v = 0 แนวโคนนิ้ว → v = 1 ข้อมือ
   มือซ้ายและขวาถูกทำให้อยู่ในกรอบเดียวกัน (นิ้วชี้อยู่ซ้ายเสมอ) จึงใช้แม่แบบเส้นชุดเดียว */
(function (root) {
  "use strict";
  var KB = root.PALM_KB || (typeof require === "function" ? require("./palm-kb.js") : null);

  var dist = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  var lerp = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  var round = function (v, d) { var k = Math.pow(10, d == null ? 2 : d); return Math.round(v * k) / k; };
  var normRad = function (a) { return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI)); };
  var sigmoid = function (x) { return 1 / (1 + Math.exp(-x)); };

  /* ================= โมเดลตรวจฝ่ามือ (palm detector 192×192, 2016 anchors) ================= */
  var DET = { size: 192, strides: [8, 16, 16, 16], numBoxes: 2016, stride: 19, minScore: 0.5, iou: 0.3 };
  var LM = { size: 224 };
  /** anchors แบบ SSD (fixedAnchorSize → w = h = 1): คืน Float32Array [xc, yc, ...] */
  function ssdAnchors() {
    var out = [], layer = 0, st = DET.strides;
    while (layer < st.length) {
      var last = layer, n = 0;
      while (last < st.length && st[last] === st[layer]) { n += 2; last++; } // aspect 1 + interpolated → 2 anchors ต่อชั้น
      var fm = Math.ceil(DET.size / st[layer]);
      for (var y = 0; y < fm; y++) for (var x = 0; x < fm; x++) for (var k = 0; k < n; k++) out.push((x + 0.5) / fm, (y + 0.5) / fm);
      layer = last;
    }
    return new Float32Array(out);
  }
  /** raw: Float32Array 2016×19 = [logit, xc, yc, w, h, kx0, ky0 … kx6, ky6] (พิกเซลใน 192) → detections (พิกัด 0–1 ของภาพ letterbox) */
  function decodePalms(raw, anchors, minScore) {
    var S = DET.size, res = [];
    minScore = minScore == null ? DET.minScore : minScore;
    for (var i = 0; i < DET.numBoxes; i++) {
      var o = i * DET.stride, sc = sigmoid(clamp(raw[o], -100, 100));
      if (sc < minScore) continue;
      var ax = anchors[2 * i], ay = anchors[2 * i + 1];
      var xc = raw[o + 1] / S + ax, yc = raw[o + 2] / S + ay, w = raw[o + 3] / S, h = raw[o + 4] / S;
      if (w <= 0 || h <= 0) continue;
      var kps = [];
      for (var k = 0; k < 7; k++) kps.push([raw[o + 5 + 2 * k] / S + ax, raw[o + 6 + 2 * k] / S + ay]);
      res.push({ score: sc, x: xc - w / 2, y: yc - h / 2, w: w, h: h, kps: kps });
    }
    return res;
  }
  function iou(a, b) {
    var x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    var inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    return inter / (a.w * a.h + b.w * b.h - inter || 1);
  }
  function nms(dets, thr, max) {
    var s = dets.slice().sort(function (a, b) { return b.score - a.score; }), keep = [];
    s.forEach(function (d) { if (keep.length < (max || 2) && keep.every(function (k) { return iou(k, d) <= (thr == null ? DET.iou : thr); })) keep.push(d); });
    return keep;
  }
  /** ขนาด/ขอบดำเมื่อย่อภาพ W×H ลงใน size×size แบบคงสัดส่วน */
  function letterbox(W, H, size) {
    var s = Math.min(size / W, size / H), dw = W * s, dh = H * s;
    return { scale: s, dx: (size - dw) / 2, dy: (size - dh) / 2, dw: dw, dh: dh, pad: { left: (size - dw) / 2 / size, top: (size - dh) / 2 / size, right: (size - dw) / 2 / size, bottom: (size - dh) / 2 / size } };
  }
  function unletterbox(d, pad) {
    var sx = 1 - pad.left - pad.right, sy = 1 - pad.top - pad.bottom;
    var f = function (p) { return [(p[0] - pad.left) / sx, (p[1] - pad.top) / sy]; };
    return { score: d.score, x: (d.x - pad.left) / sx, y: (d.y - pad.top) / sy, w: d.w / sx, h: d.h / sy, kps: d.kps.map(f) };
  }
  /** detection (0–1 ของภาพจริง) → กรอบหมุนสำหรับโมเดลจุด (พิกเซล): หมุนให้ ข้อมือ→โคนนิ้วกลาง ชี้ขึ้น, ขยาย 2.6×, เลื่อนขึ้นครึ่งกรอบ */
  function palmRoi(d, W, H) {
    var k0 = [d.kps[0][0] * W, d.kps[0][1] * H], k2 = [d.kps[2][0] * W, d.kps[2][1] * H];
    var rot = normRad(Math.PI / 2 - Math.atan2(-(k2[1] - k0[1]), k2[0] - k0[0]));
    var w = d.w * W, h = d.h * H, cx = (d.x + d.w / 2) * W, cy = (d.y + d.h / 2) * H, shiftY = -0.5;
    cx += -h * shiftY * Math.sin(rot); cy += h * shiftY * Math.cos(rot);
    return { cx: cx, cy: cy, size: Math.max(w, h) * 2.6, rot: rot };
  }
  /** จุด 21 จุดเดิม → กรอบสำหรับรอบที่สอง (คล้าย handLandmarksToRect: หมุนตาม ข้อมือ→เฉลี่ยโคนนิ้วชี้/นาง/กลาง) */
  function landmarksRoi(pts) {
    var p0 = pts[0], mid = [(pts[5][0] + pts[13][0]) / 2 * 0.5 + pts[9][0] * 0.5, (pts[5][1] + pts[13][1]) / 2 * 0.5 + pts[9][1] * 0.5];
    var rot = normRad(Math.PI / 2 - Math.atan2(-(mid[1] - p0[1]), mid[0] - p0[0]));
    var idx = [0, 1, 2, 3, 5, 6, 9, 10, 13, 14, 17, 18], c = Math.cos(-rot), s = Math.sin(-rot);
    var xs = [], ys = [];
    idx.forEach(function (i) { var p = pts[i]; xs.push(p[0] * c - p[1] * s); ys.push(p[0] * s + p[1] * c); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var rc = [(x0 + x1) / 2, (y0 + y1) / 2], w = x1 - x0, h = y1 - y0;
    var cx = rc[0] * Math.cos(rot) - rc[1] * Math.sin(rot), cy = rc[0] * Math.sin(rot) + rc[1] * Math.cos(rot);
    var shiftY = -0.1;
    cx += -h * shiftY * Math.sin(rot); cy += h * shiftY * Math.cos(rot);
    return { cx: cx, cy: cy, size: Math.max(w, h) * 2.0, rot: rot };
  }
  /** ทรานส์ฟอร์มของ canvas สำหรับครอปกรอบหมุน roi ลงภาพ out×out: ctx.setTransform(...m) แล้ว drawImage(src, 0, 0) */
  function roiCropMatrix(roi, out) {
    var k = out / roi.size, c = Math.cos(-roi.rot), s = Math.sin(-roi.rot);
    // p' = k·R(−rot)(p − c) + out/2
    return [k * c, k * s, -k * s, k * c, out / 2 - k * (c * roi.cx - s * roi.cy), out / 2 - k * (s * roi.cx + c * roi.cy)];
  }
  /** ผลโมเดลจุด (63 ค่า พิกเซลใน 224) → พิกัดภาพจริง */
  function projectLandmarks(raw, roi) {
    var pts = [], c = Math.cos(roi.rot), s = Math.sin(roi.rot);
    for (var i = 0; i < 21; i++) {
      var x = raw[3 * i] / LM.size - 0.5, y = raw[3 * i + 1] / LM.size - 0.5;
      pts.push([(c * x - s * y) * roi.size + roi.cx, (s * x + c * y) * roi.size + roi.cy]);
    }
    return pts;
  }

  /* ================= เรขาคณิตของมือ ================= */
  /** จาก 21 จุดของโมเดล */
  function handFromLandmarks(p) {
    return {
      source: "model", wrist: p[0],
      mcp: { index: p[5], middle: p[9], ring: p[13], pinky: p[17] },
      tip: { thumb: p[4], index: p[8], middle: p[12], ring: p[16], pinky: p[20] },
      thumbBase: p[1], pts: p
    };
  }
  /** จากจุดที่ผู้ใช้แตะเอง 7 จุด — โคนนิ้วกลาง/นางประมาณจากแนวโคนนิ้วชี้→ก้อย */
  var TAP_ORDER = ["wrist", "indexBase", "pinkyBase", "indexTip", "middleTip", "ringTip", "pinkyTip"];
  function handFromTaps(t) {
    // จุดที่แตะคือรอยพับโคนนิ้ว ซึ่งอยู่เหนือข้อนิ้ว (MCP) — ขยับลงหาฝ่ามือเล็กน้อยให้ใกล้เคียงจุดของโมเดล
    var A = t.indexBase, B = t.pinkyBase, W = t.wrist, M = lerp(A, B, 0.5);
    var down = [(W[0] - M[0]) * 0.1, (W[1] - M[1]) * 0.1], sh = function (p) { return [p[0] + down[0], p[1] + down[1]]; };
    var a = sh(A), b = sh(B);
    return {
      source: "tap", wrist: W,
      mcp: { index: a, middle: lerp(a, b, 1 / 3), ring: lerp(a, b, 2 / 3), pinky: b },
      tip: { thumb: null, index: t.indexTip, middle: t.middleTip, ring: t.ringTip, pinky: t.pinkyTip },
      thumbBase: null, pts: null
    };
  }
  /** ค่าเฉลี่ยทั่วไป (ปรับเทียบจากจุด MediaPipe ของมือผู้ใหญ่ทั่วไป) */
  var NORMS = { palm: 1.62, palmSd: 0.13, finger: 0.86, fingerSd: 0.08, thumb: 0.82, thumbSd: 0.08 };
  function measureHand(h) {
    var palmW = dist(h.mcp.index, h.mcp.pinky), palmL = dist(h.wrist, h.mcp.middle);
    var fl = function (f) { return dist(h.mcp[f], h.tip[f]); };
    var m = {
      palmW: palmW, palmL: palmL, palmRatio: palmL / palmW,
      fingerRatio: fl("middle") / palmL,
      indexRing: fl("index") / fl("ring"),
      fingers: { index: fl("index") / palmL, middle: fl("middle") / palmL, ring: fl("ring") / palmL, pinky: fl("pinky") / palmL },
      thumbRatio: h.tip.thumb && h.thumbBase ? dist(h.thumbBase, h.tip.thumb) / palmL : null,
      source: h.source
    };
    return m;
  }
  var ELEMENTS = ["earth", "air", "fire", "water"];
  /** ธาตุของมือ: ฝ่ามือยาว (zp > 0) / เหลี่ยม, นิ้วยาว (zf > 0) / สั้น → คะแนน 4 ธาตุ + ร้อยละ */
  function handElement(m) {
    var zp = (m.palmRatio - NORMS.palm) / NORMS.palmSd, zf = (m.fingerRatio - NORMS.finger) / NORMS.fingerSd;
    var sc = { earth: -zp - zf, air: -zp + zf, fire: zp - zf, water: zp + zf };
    var ex = {}, sum = 0;
    ELEMENTS.forEach(function (k) { ex[k] = Math.exp(sc[k] * 0.9); sum += ex[k]; });
    var ranked = ELEMENTS.map(function (k) { return { id: k, score: sc[k], pct: Math.round(ex[k] / sum * 100) }; }).sort(function (a, b) { return b.score - a.score; });
    return { zp: zp, zf: zf, palmShape: zp > 0 ? "long" : "square", fingerShape: zf > 0 ? "long" : "short", ranked: ranked, top: ranked[0], second: ranked[1] };
  }
  function fingerCat(m) { return m.indexRing > 1.02 ? "indexLonger" : m.indexRing < 0.965 ? "ringLonger" : "equal"; }
  function thumbCat(m) {
    if (m.thumbRatio == null) return "na";
    var z = (m.thumbRatio - NORMS.thumb) / NORMS.thumbSd;
    return z > 0.6 ? "long" : z < -0.6 ? "short" : "medium";
  }
  /** มือข้างไหน (สมมติว่าเห็นด้านฝ่ามือ ภาพไม่กลับซ้ายขวา): นิ้วชี้อยู่ขวาของนิ้วก้อยเมื่อนิ้วชี้ขึ้น = มือขวา */
  function guessSide(h) {
    var U = [h.mcp.pinky[0] - h.mcp.index[0], h.mcp.pinky[1] - h.mcp.index[1]];
    var M = lerp(h.mcp.index, h.mcp.pinky, 0.5), d = [M[0] - h.wrist[0], M[1] - h.wrist[1]];
    return U[0] * d[1] - U[1] * d[0] > 0 ? "right" : "left";
  }

  /* ================= กรอบฝ่ามือ + ภาพมาตรฐาน (canonical) ================= */
  var CANON = { u0: -0.42, u1: 1.32, v0: -0.4, v1: 1.12, s: 240 };
  function palmFrame(h, opt) {
    opt = Object.assign({}, CANON, opt || {});
    var A = h.mcp.index, B = h.mcp.pinky, W = h.wrist, M = lerp(A, B, 0.5);
    var U = [B[0] - A[0], B[1] - A[1]], V = [W[0] - M[0], W[1] - M[1]];
    var lu = Math.hypot(U[0], U[1]), lv = Math.hypot(V[0], V[1]), asp = lv / lu;
    var det = U[0] * V[1] - U[1] * V[0];
    var F = {
      A: A, U: U, V: V, asp: asp, det: det, mirrored: det < 0, opt: opt,
      w: Math.round((opt.u1 - opt.u0) * opt.s), h: Math.round((opt.v1 - opt.v0) * opt.s * asp)
    };
    F.toImg = function (q) { return [A[0] + q[0] * U[0] + q[1] * V[0], A[1] + q[0] * U[1] + q[1] * V[1]]; };
    F.toUV = function (p) { var x = p[0] - A[0], y = p[1] - A[1]; return [(x * V[1] - y * V[0]) / det, (U[0] * y - U[1] * x) / det]; };
    F.uvToPx = function (q) { return [(q[0] - opt.u0) * opt.s, (q[1] - opt.v0) * opt.s * asp]; };
    F.pxToUV = function (p) { return [p[0] / opt.s + opt.u0, p[1] / (opt.s * asp) + opt.v0]; };
    /** ctx.setTransform(...) ที่วาดภาพต้นฉบับลงภาพมาตรฐาน (ขนาด F.w × F.h) */
    F.matrix = function () {
      var a = U[0] / opt.s, b = U[1] / opt.s, c = V[0] / (opt.s * asp), d = V[1] / (opt.s * asp);
      var t = F.toImg([opt.u0, opt.v0]), dd = a * d - b * c;
      // ผกผันของ  p = [a c; b d]·x + t
      var ia = d / dd, ib = -b / dd, ic = -c / dd, id = a / dd;
      return [ia, ib, ic, id, -(ia * t[0] + ic * t[1]), -(ib * t[0] + id * t[1])];
    };
    return F;
  }

  /* ================= ประมวลผลภาพ: ความคมชัดเฉพาะที่ + ตัวกรองเส้น (Hessian หลายสเกล) ================= */
  function grayFrom(data, w, h) {
    var g = new Float32Array(w * h);
    for (var i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.3 * data[j] + 0.59 * data[j + 1] + 0.11 * data[j + 2];
    return g;
  }
  function gaussBlur(src, w, h, sigma) {
    var r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1), s = 0, i, x, y;
    for (i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
    for (i = 0; i < k.length; i++) k[i] /= s;
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var acc = 0; for (i = -r; i <= r; i++) { var xx = x + i; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; acc += src[y * w + xx] * k[i + r]; }
      tmp[y * w + x] = acc;
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var ac = 0; for (i = -r; i <= r; i++) { var yy = y + i; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy; ac += tmp[yy * w + x] * k[i + r]; }
      out[y * w + x] = ac;
    }
    return out;
  }
  /** ปรับความคมชัดเฉพาะที่ (คล้าย CLAHE): (I − ค่าเฉลี่ยรอบ ๆ) ÷ ส่วนเบี่ยงเบนรอบ ๆ, จำกัดค่าไว้ ±clip */
  function localContrast(g, w, h, r, clip) {
    r = r || 12; clip = clip || 3;
    var I = new Float64Array((w + 1) * (h + 1)), I2 = new Float64Array((w + 1) * (h + 1)), x, y;
    for (y = 0; y < h; y++) { var row = 0, row2 = 0; for (x = 0; x < w; x++) { var v = g[y * w + x]; row += v; row2 += v * v; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; I2[(y + 1) * (w + 1) + x + 1] = I2[y * (w + 1) + x + 1] + row2; } }
    var out = new Float32Array(w * h);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1), n = (x1 - x0) * (y1 - y0);
      var S = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      var S2 = I2[y1 * (w + 1) + x1] - I2[y0 * (w + 1) + x1] - I2[y1 * (w + 1) + x0] + I2[y0 * (w + 1) + x0];
      var mean = S / n, sd = Math.sqrt(Math.max(0, S2 / n - mean * mean));
      out[y * w + x] = clamp((g[y * w + x] - mean) / (sd + 4), -clip, clip);
    }
    return out;
  }
  /** ตัวกรองร่องมืด (valley) หลายสเกล: ค่าลักษณะเฉพาะของ Hessian λ1 > 0 (ขวางเส้น) และ |λ2| เล็ก (ตามเส้น)
      คืน { resp: 0–1 (หารด้วยเปอร์เซ็นไทล์ 98), dir: มุมของแนวเส้น (เรเดียน) } */
  function ridgeFilter(g, w, h, sigmas, mask) {
    sigmas = sigmas || [1.5, 2.2, 3.2];
    var resp = new Float32Array(w * h), dir = new Float32Array(w * h);
    sigmas.forEach(function (sg) {
      var L = gaussBlur(g, w, h, sg), s2 = sg * sg;
      for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
        var i = y * w + x;
        var a = L[i - 1] - 2 * L[i] + L[i + 1], c = L[i - w] - 2 * L[i] + L[i + w];
        var b = (L[i - w - 1] + L[i + w + 1] - L[i - w + 1] - L[i + w - 1]) / 4;
        var tmp = Math.sqrt((a - c) * (a - c) + 4 * b * b), l1 = (a + c + tmp) / 2, l2 = (a + c - tmp) / 2;
        var r = s2 * (l1 - 0.6 * Math.abs(l2));
        if (r > resp[i]) {
          resp[i] = r;
          // เวกเตอร์ลักษณะเฉพาะของ λ1 = แนวขวางเส้น → แนวเส้นตั้งฉาก
          var nx, ny; if (Math.abs(b) > 1e-9) { nx = b; ny = l1 - a; } else if (a >= c) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
          dir[i] = Math.atan2(ny, nx) + Math.PI / 2;
        }
      }
    });
    if (mask) for (var j = 0; j < resp.length; j++) if (!mask[j]) resp[j] = 0;
    var R0 = { resp: resp, dir: dir, w: w, h: h };
    // ปรับสเกล: เส้นจริงมีสัดส่วนพิกเซลน้อย จึงอิงทั้งเปอร์เซ็นไทล์ 99.5 และระดับพื้นผิว (มัธยฐาน × 5)
    var p50 = percentile(resp, 0.5), p995 = percentile(resp, 0.995), p = Math.max(p995, p50 * 5) || 1;
    for (var k = 0; k < resp.length; k++) resp[k] = Math.min(1, resp[k] / p);
    R0.p50 = p50; R0.p995 = p995;
    return R0;
  }
  function percentile(arr, q) {
    var s = []; for (var i = 0; i < arr.length; i += 3) if (arr[i] > 0) s.push(arr[i]);
    if (!s.length) return 0;
    s.sort(function (a, b) { return a - b; });
    return s[Math.min(s.length - 1, Math.floor(s.length * q))];
  }
  function sample(R, x, y) {
    if (x < 0 || y < 0 || x > R.w - 1.001 || y > R.h - 1.001) return 0;
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * R.w + x0, r = R.resp;
    return r[i] * (1 - fx) * (1 - fy) + r[i + 1] * fx * (1 - fy) + r[i + R.w] * (1 - fx) * fy + r[i + R.w + 1] * fx * fy;
  }
  function dirAt(R, x, y) { var xi = clamp(Math.round(x), 0, R.w - 1), yi = clamp(Math.round(y), 0, R.h - 1); return R.dir[yi * R.w + xi]; }
  /** หน้ากากเฉพาะผิวมือ (YCbCr แบบหลวม ๆ) — ลดเส้นหลอกจากฉากหลัง */
  function skinMask(data, w, h) {
    var m = new Uint8Array(w * h);
    for (var i = 0, j = 0; i < m.length; i++, j += 4) {
      var r = data[j], g = data[j + 1], b = data[j + 2];
      var cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b, yy = 0.299 * r + 0.587 * g + 0.114 * b;
      m[i] = (yy > 40 && cr > 128 && cr < 185 && cb > 70 && cb < 135 && r > b) ? 1 : 0;
    }
    // กัดขอบเข้า 4 px เพื่อตัดขอบมือ (ขั้นบันไดความสว่าง) ออก
    var out = new Uint8Array(w * h), r0 = 4;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var ok = m[y * w + x];
      for (var d = 1; ok && d <= r0; d++) ok = (x - d >= 0 && m[y * w + x - d]) && (x + d < w && m[y * w + x + d]) && (y - d >= 0 && m[(y - d) * w + x]) && (y + d < h && m[(y + d) * w + x]);
      out[y * w + x] = ok ? 1 : 0;
    }
    return out;
  }

  /* ================= แม่แบบเส้นหลัก (u, v) + การไล่ตามร่องด้วย dynamic programming ================= */
  var TEMPLATES = {
    heart: { pts: [[1.1, 0.25], [0.85, 0.22], [0.6, 0.19], [0.38, 0.15], [0.2, 0.07]], band: 0.11 },
    head: { pts: [[-0.08, 0.3], [0.18, 0.37], [0.42, 0.44], [0.66, 0.5], [0.86, 0.57]], band: 0.12 },
    life: { pts: [[-0.08, 0.32], [0.12, 0.45], [0.26, 0.62], [0.32, 0.8], [0.32, 0.98]], band: 0.14 },
    fate: { pts: [[0.5, 1.0], [0.5, 0.8], [0.48, 0.6], [0.46, 0.42], [0.43, 0.24]], band: 0.09 }
  };
  var LINE_IDS = ["life", "head", "heart", "fate"];
  /** Catmull-Rom ผ่านจุดควบคุม → n จุด */
  function spline(cp, n) {
    n = n || 48;
    var out = [], m = cp.length;
    if (m < 2) return cp.slice();
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1) * (m - 1), k = Math.min(m - 2, Math.floor(t)), f = t - k;
      var p0 = cp[Math.max(0, k - 1)], p1 = cp[k], p2 = cp[k + 1], p3 = cp[Math.min(m - 1, k + 2)];
      var f2 = f * f, f3 = f2 * f;
      out.push([0, 1].map(function (d) {
        return 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * f + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * f2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * f3);
      }));
    }
    return out;
  }
  function resample(path, n) {
    var L = [0];
    for (var i = 1; i < path.length; i++) L.push(L[i - 1] + dist(path[i - 1], path[i]));
    var tot = L[L.length - 1] || 1, out = [], j = 0;
    for (var k = 0; k < n; k++) {
      var t = tot * k / (n - 1);
      while (j < L.length - 2 && L[j + 1] < t) j++;
      var seg = (L[j + 1] - L[j]) || 1;
      out.push(lerp(path[j], path[j + 1] || path[j], clamp((t - L[j]) / seg, 0, 1)));
    }
    return out;
  }
  /** ไล่หาร่องตามแม่แบบ: จุดตัวอย่าง N จุดบนแม่แบบ, ลองเลื่อนตามแนวตั้งฉาก ±band, เลือกทางที่ผลรวมความแรงสูงสุดและเรียบ
      ทำงานในพิกัดพิกเซลของภาพมาตรฐาน (tplPx = จุดควบคุมแม่แบบในพิกเซล) */
  function traceAlong(R, tplPx, bandPx, opt) {
    opt = opt || {};
    var N = opt.n || 40, K = Math.max(3, Math.round(bandPx)), step = opt.step || 1, maxJump = opt.maxJump || 2, lam = opt.smooth == null ? 0.04 : opt.smooth;
    var base = resample(spline(tplPx, 80), N), offs = [];
    for (var k = -K; k <= K; k += step) offs.push(k);
    var nrm = base.map(function (p, i) {
      var a = base[Math.max(0, i - 1)], b = base[Math.min(N - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      return { t: [tx / l, ty / l], n: [-ty / l, tx / l] };
    });
    var S = offs.length, score = [], back = [];
    var unary = function (i, j) {
      var p = [base[i][0] + nrm[i].n[0] * offs[j], base[i][1] + nrm[i].n[1] * offs[j]];
      var r = sample(R, p[0], p[1]);
      if (r <= 0) return { v: 0, p: p };
      var d = dirAt(R, p[0], p[1]), ca = Math.abs(Math.cos(d) * nrm[i].t[0] + Math.sin(d) * nrm[i].t[1]);
      // ลงโทษการเบี่ยงจากแม่แบบเล็กน้อย
      return { v: r * (0.35 + 0.65 * ca * ca) - 0.0025 * Math.abs(offs[j]) / K, p: p };
    };
    var U = [];
    for (var i = 0; i < N; i++) { U.push([]); for (var j = 0; j < S; j++) U[i].push(unary(i, j)); }
    score.push(U[0].map(function (u) { return u.v; })); back.push(new Int16Array(S));
    for (i = 1; i < N; i++) {
      var sc = new Float32Array(S), bk = new Int16Array(S);
      for (j = 0; j < S; j++) {
        var best = -1e9, bj = j;
        for (var d = -maxJump; d <= maxJump; d++) {
          var q = j + d; if (q < 0 || q >= S) continue;
          var v = score[i - 1][q] - lam * Math.abs(d);
          if (v > best) { best = v; bj = q; }
        }
        sc[j] = best + U[i][j].v; bk[j] = bj;
      }
      score.push(sc); back.push(bk);
    }
    var jEnd = 0; for (j = 1; j < S; j++) if (score[N - 1][j] > score[N - 1][jEnd]) jEnd = j;
    var idx = new Array(N); idx[N - 1] = jEnd;
    for (i = N - 1; i > 0; i--) idx[i - 1] = back[i][idx[i]];
    var path = [], str = [];
    for (i = 0; i < N; i++) { path.push(U[i][idx[i]].p); str.push(Math.max(0, sample(R, U[i][idx[i]].p[0], U[i][idx[i]].p[1]))); }
    return { path: path, strength: str };
  }
  /** ช่วงที่เส้นปรากฏจริง: ทำให้เรียบ, หาช่วงต่อเนื่องที่แรงพอ, นับช่วงขาด */
  var TRACE = { thr: 0.2, minRun: 3, gapMin: 3 };
  function analyzeStrength(str, thr) {
    thr = thr == null ? TRACE.thr : thr;
    var n = str.length, sm = str.map(function (v, i) { return (str[Math.max(0, i - 1)] + v + str[Math.min(n - 1, i + 1)]) / 3; });
    var on = sm.map(function (v) { return v >= thr; });
    var first = -1, last = -1, i, run = 0;
    for (i = 0; i < n; i++) { run = on[i] ? run + 1 : 0; if (run >= TRACE.minRun) { first = i - run + 1; break; } }
    run = 0;
    for (i = n - 1; i >= 0; i--) { run = on[i] ? run + 1 : 0; if (run >= TRACE.minRun) { last = i + run - 1; break; } }
    if (first < 0 || last < first) return { first: -1, last: -1, coverage: 0, breaks: 0, mean: 0 };
    var cnt = 0, gaps = 0, g = 0, sum = 0;
    for (i = first; i <= last; i++) {
      sum += sm[i];
      if (on[i]) { cnt++; if (g >= TRACE.gapMin) gaps++; g = 0; } else g++;
    }
    return { first: first, last: last, coverage: cnt / n, span: (last - first + 1) / n, breaks: gaps, mean: sum / (last - first + 1) };
  }
  /** ตรวจเส้นหลักทั้งสี่ → จุดควบคุม 5 จุดต่อเส้น (u, v) + ความมั่นใจ */
  function detectLines(R, F) {
    var out = {};
    LINE_IDS.forEach(function (id) {
      var T = TEMPLATES[id], tplPx = T.pts.map(F.uvToPx);
      var bandPx = T.band * F.opt.s;
      var tr = traceAlong(R, tplPx, bandPx, { n: 40 });
      var st = analyzeStrength(tr.strength);
      var N = tr.path.length, a, b, present = true;
      if (id === "fate") {
        present = st.coverage >= 0.3 && st.span >= 0.35;
        a = st.first < 0 ? 0 : st.first; b = st.last < 0 ? N - 1 : st.last;
        if (!present) { a = 0; b = N - 1; }
      } else {
        // เส้นชีวิต/สมอง/หัวใจ: จุดเริ่มยึดตามแม่แบบ (ขอบมือมักจาง) และยาวอย่างน้อยครึ่งแม่แบบ
        a = st.first < 0 ? 0 : Math.min(st.first, Math.round(N * 0.15));
        b = st.last < 0 ? N - 1 : Math.max(st.last, Math.round(N * 0.5));
        if (id === "heart") { a = st.first < 0 ? 0 : Math.min(st.first, Math.round(N * 0.2)); }
      }
      var seg = tr.path.slice(a, b + 1);
      if (seg.length < 2) seg = tr.path;
      var cp = resample(seg, 5).map(function (p) { var q = F.pxToUV(p); return [round(q[0], 4), round(q[1], 4)]; });
      out[id] = { cp: cp, present: present, auto: { coverage: round(st.coverage, 3), breaks: st.breaks, mean: round(st.mean, 3), conf: round(clamp(st.coverage * 1.3, 0, 1), 2) } };
    });
    return out;
  }

  /* ================= วัดค่าจากเส้น (หลังผู้ใช้ปรับแล้ว) ================= */
  /** ความยาว/ความโค้งในหน่วย "ความกว้างฝ่ามือ" (u = 1 = ระยะโคนนิ้วชี้→ก้อย, v ปรับด้วยสัดส่วนฝ่ามือ asp) */
  function measureLine(id, cp, asp, R, F) {
    var phys = function (q) { return [q[0], q[1] * asp]; };
    var sp = spline(cp, 60), ph = sp.map(phys), len = 0;
    for (var i = 1; i < ph.length; i++) len += dist(ph[i - 1], ph[i]);
    var c0 = ph[0], c1 = ph[ph.length - 1], chord = dist(c0, c1) || 1e-6, dev = 0;
    ph.forEach(function (p) { var d = Math.abs((c1[0] - c0[0]) * (c0[1] - p[1]) - (c0[0] - p[0]) * (c1[1] - c0[1])) / chord; if (d > dev) dev = d; });
    var depth = null, breaks = 0;
    if (R && F) {
      var str = resample(sp.map(F.uvToPx), 40).map(function (p) { return sample(R, p[0], p[1]); });
      var srt = str.slice().sort(function (a, b) { return a - b; });
      depth = srt[Math.floor(srt.length * 0.5)];
      var g = 0;
      str.forEach(function (v) { if (v < TRACE.thr * 0.6) g++; else { if (g >= TRACE.gapMin) breaks++; g = 0; } });
    }
    var maxU = Math.max.apply(null, sp.map(function (p) { return p[0]; })), minU = Math.min.apply(null, sp.map(function (p) { return p[0]; }));
    return { length: len, curv: dev / chord, start: cp[0], end: cp[cp.length - 1], maxU: maxU, minU: minU, depth: depth, breaks: breaks, sp: sp };
  }
  var LT = { deep: 0.42, faint: 0.2, lifeWide: 0.34, lifeLong: 0.86, joined: 0.09, headStraight: 13, headSloping: 27, headLong: 0.8, headShort: 0.56, heartIndex: 0.06, heartBetween: 0.24, heartCurved: 0.07, fateLong: 0.28 };
  function depthCat(d) { return d == null ? null : d >= LT.deep ? "deep" : d < LT.faint ? "faint" : "medium"; }
  /** จัดหมวดเส้นทั้งหมด: lines = {id: {cp, present}} */
  function classifyLines(lines, asp, R, F) {
    var M = {}, C = {};
    LINE_IDS.forEach(function (id) { if (lines[id]) M[id] = measureLine(id, lines[id].cp, asp, R, F); });
    var L = M.life, H = M.head, Ht = M.heart, Ft = M.fate;
    if (L) {
      var lcats = [L.maxU >= LT.lifeWide ? "wide" : "close", L.end[1] >= LT.lifeLong ? "long" : "short"];
      var ld = depthCat(L.depth); if (ld === "deep" || ld === "faint") lcats.push(ld);
      if (L.breaks > 0) lcats.push("breaks");
      if (H) lcats.push(dist([L.start[0], L.start[1] * asp], [H.start[0], H.start[1] * asp]) < LT.joined ? "joined" : "separate");
      C.life = lcats;
    }
    if (H) {
      var ang = Math.atan2((H.end[1] - H.start[1]) * asp, Math.abs(H.end[0] - H.start[0]) || 1e-6) * 180 / Math.PI;
      H.angle = ang;
      var hc = [ang < LT.headStraight ? "straight" : ang < LT.headSloping ? "gentle" : "sloping", H.end[0] >= LT.headLong ? "long" : H.end[0] < LT.headShort ? "short" : "medium"];
      var hd = depthCat(H.depth); if (hd === "deep" || hd === "faint") hc.push(hd);
      if (H.breaks > 0) hc.push("breaks");
      C.head = hc;
    }
    if (Ht) {
      // ปลายด้านนิ้วชี้ = จุดที่ u น้อยที่สุด
      var eu = Ht.minU;
      var tc = [eu < LT.heartIndex ? "endIndex" : eu < LT.heartBetween ? "endBetween" : "endMiddle", Ht.curv >= LT.heartCurved ? "curved" : "straight"];
      var td = depthCat(Ht.depth); if (td === "deep" || td === "faint") tc.push(td);
      if (Ht.breaks > 0) tc.push("breaks");
      C.heart = tc;
    }
    if (lines.fate) {
      if (!lines.fate.present || !Ft) C.fate = ["absent"];
      else {
        var bot = Ft.start[1] >= Ft.end[1] ? Ft.start : Ft.end, top = bot === Ft.start ? Ft.end : Ft.start;
        var fc = [bot[1] < 0.72 ? "fromMiddle" : bot[0] < 0.33 ? "fromLife" : bot[0] > 0.62 ? "fromMoon" : "fromWrist"];
        if (top[1] <= LT.fateLong) fc.push("long");
        if (depthCat(Ft.depth) === "deep") fc.push("deep");
        if (Ft.breaks > 0) fc.push("breaks");
        C.fate = fc;
      }
    }
    return { m: M, cats: C };
  }

  /* ================= สร้างคำอ่าน ================= */
  function buildReading(o) {
    var E = KB.elements[o.el.top.id], second = KB.elements[o.el.second.id];
    var C = o.lc.cats, minor = o.minor || {}, mounts = o.mounts || [];
    var has = function (id, c) { return (C[id] || []).indexOf(c) >= 0; };
    var lineRows = LINE_IDS.filter(function (id) { return C[id]; }).map(function (id) {
      var def = KB.lines[id];
      return { id: id, th: def.th, cn: def.cn, color: def.color, about: def.about, items: C[id].map(function (c) { return { cat: c, label: def.cats[c].label, meaning: def.cats[c].meaning }; }) };
    });
    var fc = fingerCat(o.hm), tcat = thumbCat(o.hm);
    var S = KB.summary;
    var pers = [E.personality];
    if (has("head", "sloping")) pers.push(KB.lines.head.cats.sloping.meaning);
    else if (has("head", "straight")) pers.push(KB.lines.head.cats.straight.meaning);
    if (has("life", "wide")) pers.push(KB.lines.life.cats.wide.meaning);
    pers.push(KB.fingers[fc].meaning);
    var work = [E.work];
    if (has("head", "straight")) work.push(S.work["head.straight"]); else if (has("head", "sloping")) work.push(S.work["head.sloping"]); else if (has("head", "gentle")) work.push(S.work["head.gentle"]);
    work.push(has("fate", "absent") ? S.work["fate.absent"] : S.work["fate.present"]);
    var money = [E.money];
    if (has("head", "long")) money.push(S.money["head.long"]); else if (has("head", "short")) money.push(S.money["head.short"]);
    if (minor.money === true) money.push(S.money["minor.money"]);
    if (minor.sun === true) money.push(S.money["minor.sun"]);
    var love = [E.love];
    if (has("heart", "curved")) love.push(S.love["heart.curved"]); else if (has("heart", "straight")) love.push(S.love["heart.straight"]);
    if (minor.marriage === true) love.push(S.love["minor.marriage"]);
    var minorRows = Object.keys(KB.minor).filter(function (k) { return minor[k] === true || minor[k] === false; }).map(function (k) {
      var d = KB.minor[k]; return { id: k, th: d.th, seen: minor[k], meaning: minor[k] ? d.yes : d.no };
    });
    var mountRows = mounts.filter(function (k) { return KB.mounts[k]; }).map(function (k) { var d = KB.mounts[k]; return { id: k, th: d.th, meaning: d.meaning }; });
    var tips = [E.tip];
    if (mountRows.length) tips.push("จุดเด่นของคุณอยู่ที่" + mountRows[0].th + " — " + mountRows[0].meaning + " ลองใช้พลังด้านนี้ให้เต็มที่");
    tips.push(KB.generalTips[(o.seed || 0) % KB.generalTips.length]);
    var side = o.isDominant == null ? null : (o.isDominant ? KB.sides.dominant : KB.sides.other);
    return {
      element: E, second: second, elementId: o.el.top.id, lines: lineRows,
      finger: { cat: fc, label: KB.fingers[fc].label, meaning: KB.fingers[fc].meaning },
      thumb: { cat: tcat, label: KB.thumb[tcat].label, meaning: KB.thumb[tcat].meaning },
      personality: pers.join(" "), work: work.join(" "), money: money.join(" "), love: love.join(" "),
      minor: minorRows, mounts: mountRows, tips: tips, colors: E.colors, side: side,
      highlights: [E.traits[0], (lineRows[1] && lineRows[1].items[0].label) ? KB.lines.head.th + ": " + lineRows[1].items[0].label : E.traits[1], KB.lines.heart.th + ": " + (C.heart ? KB.lines.heart.cats[C.heart[0]].label : "—")]
    };
  }

  /** วิเคราะห์ครบชุด (หลังมีเส้นที่ผู้ใช้ยืนยันแล้ว) */
  function analyze(o) {
    var hm = measureHand(o.hand), el = handElement(hm);
    var lc = classifyLines(o.lines, o.F ? o.F.asp : hm.palmL / hm.palmW, o.R || null, o.F || null);
    var reading = KB ? buildReading({ el: el, hm: hm, lc: lc, minor: o.minor, mounts: o.mounts, isDominant: o.isDominant, seed: o.seed }) : null;
    return { hm: hm, el: el, lc: lc, reading: reading };
  }

  /** สถิติแบบไม่ระบุตัวตน (localStorage "palm-stats") — รับ/คืนออบเจ็กต์ ไม่แตะ storage เอง */
  function addStat(st, type, now) {
    st = st && typeof st === "object" ? st : {};
    var d = new Date(now || Date.now());
    var day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var out = { v: 1, total: (st.total || 0) + 1, types: Object.assign({ earth: 0, air: 0, fire: 0, water: 0 }, st.types || {}), days: Object.assign({}, st.days || {}) };
    out.types[type] = (out.types[type] || 0) + 1;
    out.days[day] = (out.days[day] || 0) + 1;
    return out;
  }

  /* ================= ข้อเท็จจริงสำหรับ FortuneAI (สัญญาข้อมูลใน fortune-ai.js) =================
     แปลงผล analyze() → facts { domain:"palm", topic, subject, headline, items[], extras }
     ความหมายมาจาก KB.interp (หลายสำนวนต่อหัวข้อ) evidence เติมค่าที่วัดได้จริงจาก KB.evidence
     strength 0..1 จากค่า z ของรูปมือ/ความชัดของเส้น/ข้อมูลที่ผู้ใช้ยืนยัน + เพิ่มให้หมวดที่ตรงหัวข้อที่เลือก
     opt = { topic, nickname, minor, mounts, side: "left"|"right", isDominant } */
  var TOPIC_IDS = ["overall", "love", "work", "money"];
  var fx = function (v, d) { return typeof v === "number" && isFinite(v) ? v.toFixed(d == null ? 2 : d) : "—"; };
  var tpl = function (s, vars) { return String(s || "").replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? "" : String(vars[k]); }); };
  var rel = function (zv, hi, lo) { var a = Math.abs(zv); return a < 0.5 ? "ใกล้ค่าทั่วไป" : (zv > 0 ? hi : lo) + (a >= 1.5 ? "กว่าค่าทั่วไปชัดเจน" : "กว่าค่าทั่วไป"); };
  /** ตัดคำออกตัวที่ขึ้นต้นสำนวน เพราะตัวเรียบเรียงเติมคำออกตัวเองอยู่แล้ว (กันซ้ำ "ว่ากันว่าว่ากันว่า") */
  var HEDGE_RE = /^(?:ตามตำรา(?:ลายมือ(?:จีน|ญี่ปุ่น|ตะวันตก|ไทย)?|จีน|ญี่ปุ่น|ตะวันตก)?|ตามความเชื่อ(?:จีน|ไทย|ญี่ปุ่น)?|ว่ากันว่า|เชื่อกันว่า|คนโบราณ(?:มอง|เชื่อ|ถือ)ว่า|หมอดู(?:ลายมือ)?(?:จีน|ญี่ปุ่น|ไทย|ตะวันตก)?(?:มอง|เชื่อ|ถือ)ว่า|ในศาสตร์ลายมือ(?:นั้น)?)\s*/;
  var unhedge = function (t) { var u = String(t).replace(HEDGE_RE, ""); return u.length >= 20 && u !== t ? u.replace(/^(?:ว่า|,)\s*/, "") : t; };
  var DEPTH_W = { deep: "ลึกชัด", faint: "บางเบา", medium: "ปานกลาง" };
  function buildFacts(R, opt) {
    opt = opt || {};
    var I = (KB && KB.interp) || {}, EV = (KB && KB.evidence) || {}, hm = R.hm, el = R.el, C = R.lc.cats, M = R.lc.m, items = [];
    var topic = TOPIC_IDS.indexOf(opt.topic) >= 0 ? opt.topic : "overall";
    var add = function (id, group, label, evidence, strength, only) {
      var src = I[id]; if (!src) return;
      var meanings = {};
      Object.keys(src).forEach(function (t) { if (!only || only.indexOf(t) >= 0) meanings[t] = src[t].map(unhedge); });
      var tags = Object.keys(meanings); if (!tags.length) return;
      if (topic !== "overall" && meanings[topic]) strength += 0.15;
      items.push({ id: id, group: group, label: label, evidence: evidence || "", strength: Math.round(clamp(strength, 0.05, 1) * 100) / 100, tags: tags, meanings: meanings });
    };
    var E = KB.elements[el.top.id], E2 = KB.elements[el.second.id];
    add("element." + el.top.id, "ธาตุประจำมือ", "มือธาตุ" + E.th, tpl(EV.element, { palmRatio: fx(hm.palmRatio), fingerPct: fx(hm.fingerRatio * 100, 0) }), 0.6 + el.top.pct / 250);
    if (el.second.pct >= 15) add("element." + el.second.id, "ธาตุรอง", "ธาตุรองอย่างธาตุ" + E2.th, "ธาตุรอง " + el.second.pct + "%", 0.2 + el.second.pct / 300, ["personality", "social", "work"]);
    add("shape.palm." + el.palmShape, "รูปฝ่ามือ", el.palmShape === "long" ? "ฝ่ามือทรงยาว" : "ฝ่ามือทรงเหลี่ยม", tpl(EV["shape.palm"], { palmRatio: fx(hm.palmRatio), rel: rel(el.zp, "ยาว", "สั้น") }), clamp(0.22 + 0.14 * Math.abs(el.zp), 0.2, 0.7));
    add("shape.fingers." + el.fingerShape, "นิ้วมือ", el.fingerShape === "long" ? "นิ้วเรียวยาว" : "นิ้วสั้นกระชับ", tpl(EV["shape.fingers"], { fingerPct: fx(hm.fingerRatio * 100, 0), rel: rel(el.zf, "ยาว", "สั้น") }), clamp(0.22 + 0.14 * Math.abs(el.zf), 0.2, 0.7));
    if (opt.isDominant != null) {
      var sd = opt.isDominant ? "dominant" : "other";
      add("side." + sd, "มือที่อ่าน", KB.sides[sd].th, tpl(EV.side, { hand: opt.side === "left" ? "มือซ้าย" : "มือขวา", th: KB.sides[sd].th }), 0.3);
    }
    var BASE = { wide: 0.6, close: 0.55, long: 0.5, short: 0.45, straight: 0.62, gentle: 0.55, sloping: 0.66, medium: 0.4, endIndex: 0.64, endBetween: 0.58, endMiddle: 0.58, curved: 0.6,
      deep: 0.5, faint: 0.42, breaks: 0.44, joined: 0.46, separate: 0.46, absent: 0.38, fromWrist: 0.58, fromLife: 0.58, fromMoon: 0.6, fromMiddle: 0.55 };
    var pct = function (v) { return fx(v * 100, 0); };
    var lineEv = function (id, c, mm) {
      var th = KB.lines[id].th;
      if (c === "absent" || !mm) return "คุณระบุว่ามองไม่เห็นเส้นวาสนาชัด";
      if (c === "deep" || c === "faint") return mm.depth == null ? "" : "ความชัดของร่อง" + th + " " + fx(mm.depth) + " จาก 1 ถือว่า" + DEPTH_W[c];
      if (c === "breaks") return "พบช่วงขาดหรือเส้นต่อ " + mm.breaks + " ช่วงตามแนว" + th;
      if (id === "life" && (c === "wide" || c === "close")) return "เส้นชีวิตโค้งออกไปถึง " + pct(mm.maxU) + "% ของความกว้างฝ่ามือ";
      if (id === "life" && (c === "joined" || c === "separate") && M.head) return "จุดเริ่มเส้นชีวิตห่างจากเส้นสมอง " + pct(dist([mm.start[0], mm.start[1] * asp], [M.head.start[0], M.head.start[1] * asp])) + "% ของความกว้างฝ่ามือ";
      if (id === "head" && mm.angle != null && (c === "straight" || c === "gentle" || c === "sloping")) return "เส้นสมองลาดลง " + fx(mm.angle, 0) + " องศา";
      if (id === "heart" && /^end/.test(c)) return "ปลายเส้นหัวใจห่างจากขอบฝั่งนิ้วชี้ " + pct(Math.max(0, mm.minU)) + "% ของความกว้างฝ่ามือ";
      if (id === "heart") return "ความโค้งของเส้นหัวใจ " + pct(mm.curv) + "% ของช่วงเส้น";
      return th + "ยาว " + fx(mm.length) + " เท่าของความกว้างฝ่ามือ";
    };
    var asp = opt.asp || hm.palmL / hm.palmW;
    LINE_IDS.forEach(function (id) {
      if (!C[id]) return;
      var def = KB.lines[id], mm = M[id];
      C[id].forEach(function (c) {
        var cat = def.cats[c]; if (!cat) return;
        add(id + "." + c, def.th, def.th + "แบบ" + cat.label.replace(/^ปลายเส้น/, "").replace(/\//g, "หรือ"), lineEv(id, c, mm), BASE[c] == null ? 0.45 : BASE[c]);
      });
    });
    var fc = fingerCat(hm), tc = thumbCat(hm);
    add("finger." + fc, "นิ้วชี้กับนิ้วนาง", KB.fingers[fc].label, tpl(EV.finger, { indexPct: fx(hm.indexRing * 100, 0) }), fc === "equal" ? 0.32 : 0.48);
    if (tc !== "na") add("thumb." + tc, "นิ้วโป้ง", KB.thumb[tc].label, tpl(EV.thumb, { thumbPct: fx(hm.thumbRatio * 100, 0) }), tc === "medium" ? 0.3 : 0.46);
    var minor = opt.minor || {};
    Object.keys(KB.minor).forEach(function (k) {
      if (minor[k] !== true && minor[k] !== false) return;
      var d = KB.minor[k];
      add("minor." + k + "." + (minor[k] ? "yes" : "no"), "เส้นรอง", d.th.replace(/\s*\(.*\)/, "") + (minor[k] ? "ซึ่งเห็นชัด" : "ซึ่งยังไม่เด่น"), tpl(EV.minor, { th: d.th.replace(/\s*\(.*\)/, ""), seen: minor[k] ? "เห็นชัด" : "ยังไม่เห็นชัด" }), minor[k] ? 0.6 : 0.28);
    });
    (opt.mounts || []).forEach(function (k) {
      var d = KB.mounts[k]; if (!d) return;
      add("mount." + k, "เนินบนฝ่ามือ", d.th + "อิ่มเด่น", tpl(EV.mount, { th: d.th, under: d.under }), 0.55);
    });
    var subject = {}, nick = String(opt.nickname || "").replace(/[<>{}]/g, "").trim().slice(0, 24);
    if (nick) subject.nickname = nick;
    return {
      domain: "palm", topic: topic, subject: subject,
      headline: "มือธาตุ" + E.th + " " + el.top.pct + "% เสริมด้วยธาตุ" + E2.th,
      items: items,
      extras: { luckyColors: E.colors.map(function (c) { return c.name; }), tips: [E.tip] }
    };
  }

  var PalmCore = {
    buildFacts: buildFacts, TOPIC_IDS: TOPIC_IDS,
    DET: DET, LM: LM, NORMS: NORMS, CANON: CANON, TEMPLATES: TEMPLATES, LINE_IDS: LINE_IDS, TRACE: TRACE, LT: LT, ELEMENTS: ELEMENTS, TAP_ORDER: TAP_ORDER,
    dist: dist, lerp: lerp, round: round, ssdAnchors: ssdAnchors, decodePalms: decodePalms, nms: nms, iou: iou, letterbox: letterbox, unletterbox: unletterbox,
    palmRoi: palmRoi, landmarksRoi: landmarksRoi, roiCropMatrix: roiCropMatrix, projectLandmarks: projectLandmarks,
    handFromLandmarks: handFromLandmarks, handFromTaps: handFromTaps, measureHand: measureHand, handElement: handElement, fingerCat: fingerCat, thumbCat: thumbCat, guessSide: guessSide,
    palmFrame: palmFrame, grayFrom: grayFrom, gaussBlur: gaussBlur, localContrast: localContrast, ridgeFilter: ridgeFilter, skinMask: skinMask, sample: sample,
    spline: spline, resample: resample, traceAlong: traceAlong, analyzeStrength: analyzeStrength, detectLines: detectLines,
    measureLine: measureLine, classifyLines: classifyLines, buildReading: buildReading, analyze: analyze, addStat: addStat
  };
  if (typeof module !== "undefined" && module.exports) module.exports = PalmCore;
  root.PalmCore = PalmCore;
})(typeof window !== "undefined" ? window : globalThis);

/* ===================================================================================== */
/* ================================== ส่วนติดต่อผู้ใช้ ================================== */
/* ===================================================================================== */
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("plApp")) (function () {
  "use strict";
  var PC = window.PalmCore, KB = window.PALM_KB;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var frame2 = function () { return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); }); };
  var HTTPS_MSG = "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด";
  var STATS_KEY = "palm-stats", PREF_KEY = "palm-prefs", IDLE_MS = 60000, MODEL_DIR = "vendor/models/hand/";
  var lsGet = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* โหมดส่วนตัว */ } };
  var prefs = Object.assign({ stats: true, dom: "right" }, lsGet(PREF_KEY, {}));

  var video = $("#plVideo"), cam = $("#plCam"), ov = $("#plOverlay"), octx = ov.getContext("2d");
  var btnCam = $("#plStartCam"), btnSnap = $("#plSnap"), fileIn = $("#plFile"), countEl = $("#plCount");
  var editSec = $("#plEdit"), resultSec = $("#plResult"), edCv = $("#plEditCanvas"), resCanvas = $("#plResCanvas");
  var S = { side: "right", sideAuto: false, dom: prefs.dom, src: null, hand: null, F: null, canon: null, R: null, auto: null, lines: null, active: "life", minor: {}, mounts: [], mode: "edit", taps: [], result: null, busy: false };
  var ready = false, models = null, looping = false;

  function engine(msg, cls) { var e = $("#plEngine"); e.textContent = msg; e.className = "pl-engine " + (cls || ""); }
  function setStep(n) { $$(".pl-steps li").forEach(function (li) { var k = +li.dataset.step; li.classList.toggle("on", k === n); li.classList.toggle("done", k < n); }); }
  function toast(msg) { var t = $("#plToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 2200); }
  var smooth = function () { return matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; };

  /* ---------- มือซ้าย/ขวา + มือข้างถนัด ---------- */
  function renderSide() {
    $$("[data-side]").forEach(function (b) { b.setAttribute("aria-checked", b.dataset.side === S.side ? "true" : "false"); });
    $$("[data-dom]").forEach(function (b) { b.setAttribute("aria-checked", b.dataset.dom === S.dom ? "true" : "false"); });
    var d = S.side === S.dom ? KB.sides.dominant : KB.sides.other;
    $("#plSideNote").innerHTML = "<b>" + esc((S.side === "left" ? "มือซ้าย" : "มือขวา") + " = " + d.th) + "</b> — " + esc(d.short) + (S.sideAuto ? ' <small class="muted">(ตรวจจากภาพ เปลี่ยนได้)</small>' : "");
  }
  $$("[data-side]").forEach(function (b) { b.addEventListener("click", function () { S.side = b.dataset.side; S.sideAuto = false; renderSide(); }); });
  $$("[data-dom]").forEach(function (b) { b.addEventListener("click", function () { S.dom = b.dataset.dom; prefs.dom = S.dom; lsSet(PREF_KEY, prefs); renderSide(); }); });
  renderSide();

  /* ---------- กล้อง (รูปแบบเดียวกับ faceread.js; ค่าเริ่มต้นกล้องหลัง + ไฟฉาย) ---------- */
  function createCamera(video, o) {
    o = o || {};
    var c = { stream: null, facing: "environment", deviceId: "", currentId: "", devices: [], mirror: false, active: false, paused: false, torch: false, torchCap: false };
    video.muted = true; video.playsInline = true; video.autoplay = true;
    video.setAttribute("playsinline", ""); video.setAttribute("muted", ""); video.setAttribute("autoplay", "");
    c.stop = function () { if (c.stream) c.stream.getTracks().forEach(function (t) { t.stop(); }); c.stream = null; c.active = false; c.torch = false; video.srcObject = null; };
    c.track = function () { return c.stream && c.stream.getVideoTracks()[0]; };
    c.start = async function () {
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error(HTTPS_MSG), { name: "Insecure" });
      c.stop();
      var base = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      var want = c.deviceId ? Object.assign({}, base, { deviceId: { exact: c.deviceId } }) : Object.assign({}, base, { facingMode: { ideal: c.facing } });
      var s;
      try { s = await navigator.mediaDevices.getUserMedia({ video: want, audio: false }); }
      catch (e) {
        if (["OverconstrainedError", "NotFoundError", "NotReadableError"].indexOf(e.name) < 0) throw e;
        c.deviceId = ""; s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      c.stream = s; video.srcObject = s;
      try { await video.play(); } catch (e) { console.warn("video.play", e); }
      if (!video.videoWidth) await new Promise(function (r) { video.addEventListener("loadedmetadata", r, { once: true }); setTimeout(r, 3000); });
      var tr = c.track(), st = (tr && tr.getSettings && tr.getSettings()) || {}, label = (tr && tr.label) || "";
      try { c.devices = (await navigator.mediaDevices.enumerateDevices()).filter(function (d) { return d.kind === "videoinput" && d.deviceId; }); } catch (e) { c.devices = []; }
      var fm = st.facingMode || (/back|rear|environment|หลัง/i.test(label) ? "environment" : /front|user|หน้า|facetime/i.test(label) ? "user" : c.devices.length < 2 ? "user" : c.facing);
      c.facing = fm === "environment" ? "environment" : "user";
      c.mirror = c.facing === "user";
      c.currentId = st.deviceId || "";
      try { var cap = tr.getCapabilities ? tr.getCapabilities() : {}; c.torchCap = !!cap.torch; } catch (e) { c.torchCap = false; }
      c.active = true;
      if (c.renderControls) c.renderControls();
      if (o.onChange) o.onChange(c);
      return c;
    };
    c.flip = function () { c.facing = c.facing === "user" ? "environment" : "user"; c.deviceId = ""; return c.start(); };
    c.use = function (id) { c.deviceId = id; return c.start(); };
    c.setTorch = async function (on) { var tr = c.track(); if (!tr || !c.torchCap) return false; await tr.applyConstraints({ advanced: [{ torch: !!on }] }); c.torch = !!on; return true; };
    c.mountControls = function (host) {
      var box = document.createElement("div"); box.className = "cam-ctl"; box.hidden = true;
      box.innerHTML = '<button type="button" class="cam-torch" aria-pressed="false" aria-label="เปิด/ปิดไฟฉาย" hidden><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10l-2 6H9zM9 9v12h6V9M12 13v3"/></svg><span>ไฟฉาย</span></button>' +
        '<button type="button" class="cam-flip" aria-label="สลับกล้องหน้า/หลัง" title="สลับกล้องหน้า/หลัง"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h11l-3-3M20 16H9l3 3"/></svg><span>สลับกล้อง</span></button><select class="cam-pick" aria-label="เลือกกล้อง"></select>';
      host.append(box);
      var torch = box.querySelector(".cam-torch"), flip = box.querySelector(".cam-flip"), pickEl = box.querySelector(".cam-pick");
      var run = function (p) { box.classList.add("busy"); p.catch(function (e) { if (o.onError) o.onError(e); }).finally(function () { box.classList.remove("busy"); }); };
      flip.onclick = function () { run(c.flip()); };
      pickEl.onchange = function () { run(c.use(pickEl.value)); };
      torch.onclick = function () { run(c.setTorch(!c.torch).then(function () { torch.setAttribute("aria-pressed", c.torch ? "true" : "false"); })); };
      c.renderControls = function () {
        var multi = c.devices.length >= 2;
        flip.hidden = !multi; pickEl.hidden = !multi; torch.hidden = !c.torchCap;
        torch.setAttribute("aria-pressed", c.torch ? "true" : "false");
        box.hidden = !multi && !c.torchCap;
        pickEl.innerHTML = c.devices.map(function (d, i) { return '<option value="' + esc(d.deviceId) + '">' + esc(d.label || "กล้อง " + (i + 1)) + "</option>"; }).join("");
        if (c.currentId) pickEl.value = c.currentId;
      };
    };
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (c.stream) { c.paused = true; c.stop(); if (o.onChange) o.onChange(c); } }
      else if (c.paused) { c.paused = false; c.start().catch(function (e) { if (o.onError) o.onError(e); }); }
    });
    window.addEventListener("pagehide", function () { if (c.stream) { c.paused = true; c.stop(); } });
    window.addEventListener("pageshow", function (e) { if (e.persisted && c.paused) { c.paused = false; c.start().catch(function (err) { if (o.onError) o.onError(err); }); } });
    return c;
  }
  function showHttpsNote(before) {
    if (window.isSecureContext || document.querySelector(".https-note")) return;
    var p = document.createElement("p"); p.className = "https-note"; p.setAttribute("role", "alert");
    p.innerHTML = 'บนมือถือต้องเปิดผ่าน <b>https://</b> — ดูวิธีในหน้า <a href="cameras.html">ระบบทั้งหมด</a>';
    before.before(p);
  }
  var camErr = function (e) {
    console.error(e);
    if (e.name === "Insecure") showHttpsNote($("#plEngine"));
    var m = { Insecure: HTTPS_MSG, NotAllowedError: "ไม่ได้รับอนุญาตให้ใช้กล้อง — ใช้ปุ่ม อัปโหลดรูป แทนได้", NotFoundError: "ไม่พบกล้อง — ใช้ปุ่ม อัปโหลดรูป แทนได้", NotReadableError: "กล้องถูกโปรแกรมอื่นใช้อยู่" }[e.name];
    engine(m || "เปิดกล้องไม่ได้: " + (e.message || e.name), "err");
  };
  function layoutCam() {
    var vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
    if (ov.width !== vw || ov.height !== vh) { ov.width = vw; ov.height = vh; }
    cam.style.aspectRatio = vw + " / " + vh;
  }
  var camera = createCamera(video, {
    onChange: function (c) { cam.classList.toggle("mirror", c.mirror); cam.classList.toggle("live", c.active); layoutCam(); if (c.active) startLoop(); },
    onError: camErr
  });
  camera.mountControls(cam);
  video.addEventListener("resize", layoutCam);

  /* ---------- โมเดลจุดบนมือ (tfjs graph model, ไม่ต้องใช้ WebGL) ---------- */
  async function initBackend() {
    var tf = faceapi.tf;
    tf.setWasmPaths("vendor/");
    var names = ["webgl", "wasm", "cpu"];
    for (var i = 0; i < names.length; i++) {
      try { if (await tf.setBackend(names[i])) { await tf.ready(); return names[i]; } } catch (e) { console.warn(names[i], e); }
    }
    throw new Error("no backend");
  }
  var modelsP = null;
  function loadModels() {
    if (!modelsP) modelsP = initBackend().then(function (b) {
      var tf = faceapi.tf;
      return Promise.all([tf.loadGraphModel(MODEL_DIR + "detector/model.json"), tf.loadGraphModel(MODEL_DIR + "landmark/model.json")]).then(function (m) {
        models = { tf: tf, det: m[0], lm: m[1], anchors: PC.ssdAnchors(), backend: b };
        ready = true;
        engine("พร้อมใช้งาน (ตัวประมวลผล: " + b.toUpperCase() + (b === "webgl" ? "" : " — อาจช้ากว่าปกติเล็กน้อย") + ")", "ok");
        return models;
      });
    }).catch(function (e) { console.error(e); engine("โหลดโมเดลจุดบนมือไม่สำเร็จ — ยังใช้งานได้โดยแตะจุดบนมือเอง", "err"); modelsP = null; throw e; });
    return modelsP;
  }
  var c192 = document.createElement("canvas"), c224 = document.createElement("canvas");
  c192.width = c192.height = PC.DET.size; c224.width = c224.height = PC.LM.size;
  async function runLandmarks(src, roi) {
    var tf = models.tf, x = c224.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#000"; x.fillRect(0, 0, 224, 224);
    x.setTransform.apply(x, PC.roiCropMatrix(roi, 224)); x.drawImage(src, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0);
    var inp = tf.tidy(function () { return tf.browser.fromPixels(c224).toFloat().div(255).expandDims(0); });
    var out = models.lm.execute(inp, ["Identity_2:0", "Identity_1:0", "Identity:0", "Identity_3:0"]);
    try {
      var lm = await out[0].data(), score = (await out[1].data())[0], hd = (await out[2].data())[0];
      return { pts: PC.projectLandmarks(lm, roi), score: score, handedness: hd };
    } finally { tf.dispose(out); inp.dispose(); }
  }
  /** หาเมือในภาพ: ตรวจฝ่ามือ → จุด 21 จุด → กรอบใหม่จากจุด → จุดรอบสอง (แม่นขึ้น) */
  async function detectHand(src, quick) {
    var tf = models.tf, W = src.width || src.videoWidth, H = src.height || src.videoHeight;
    var lb = PC.letterbox(W, H, 192), x = c192.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, 192, 192); x.drawImage(src, lb.dx, lb.dy, lb.dw, lb.dh);
    var inp = tf.tidy(function () { return tf.browser.fromPixels(c192).toFloat().div(255).expandDims(0); });
    var out = models.det.predict(inp), raw;
    try { raw = await out.data(); } finally { tf.dispose([inp, out]); }
    var dets = PC.nms(PC.decodePalms(raw, models.anchors, 0.5), 0.3, 1);
    if (!dets.length) return null;
    var d = PC.unletterbox(dets[0], lb.pad), roi = PC.palmRoi(d, W, H);
    var r1 = await runLandmarks(src, roi);
    if (r1.score < 0.5) return null;
    if (quick) return { pts: r1.pts, score: r1.score, det: d.score };
    var r2 = await runLandmarks(src, PC.landmarksRoi(r1.pts));
    var r = r2.score >= 0.5 ? r2 : r1;
    return { pts: r.pts, score: r.score, det: d.score };
  }

  /* ---------- กรอบนำทาง + ตรวจสดจากกล้อง ---------- */
  function handGuidePath(c, w, h) {
    // โครงมือแบบเรียบง่าย (ฝ่ามือ + 5 นิ้ว) กึ่งกลางภาพ
    var s = Math.min(w / 3, h / 4) * 0.95, cx = w / 2, cy = h * 0.56;
    c.beginPath();
    if (c.roundRect) c.roundRect(cx - s * 0.62, cy - s * 0.35, s * 1.24, s * 1.25, s * 0.28); else c.rect(cx - s * 0.62, cy - s * 0.35, s * 1.24, s * 1.25);
    [[-0.46, 0.95], [-0.16, 1.12], [0.16, 1.05], [0.44, 0.82]].forEach(function (f) {
      var x = cx + f[0] * s, len = f[1] * s, r = s * 0.12;
      if (c.roundRect) c.roundRect(x - r, cy - s * 0.35 - len, r * 2, len + r, r); else c.rect(x - r, cy - s * 0.35 - len, r * 2, len + r);
    });
    c.save(); c.translate(cx - s * 0.62, cy + s * 0.25); c.rotate(-0.7);
    if (c.roundRect) c.roundRect(-s * 0.13, -s * 0.72, s * 0.26, s * 0.78, s * 0.13); else c.rect(-s * 0.13, -s * 0.72, s * 0.26, s * 0.78);
    c.restore();
  }
  function drawGuide(pts, ok) {
    var w = ov.width, h = ov.height; octx.clearRect(0, 0, w, h);
    octx.lineWidth = Math.max(3, w / 240); octx.setLineDash([w / 60, w / 90]);
    octx.strokeStyle = ok ? "#22d3ee" : "rgba(255,255,255,.8)";
    handGuidePath(octx, w, h); octx.stroke(); octx.setLineDash([]);
    if (pts) {
      octx.fillStyle = ok ? "rgba(34,211,238,.95)" : "rgba(255,255,255,.8)";
      var r = Math.max(3, w / 220);
      [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17]].forEach(function (ch) {
        octx.beginPath(); ch.forEach(function (i, k) { if (k) octx.lineTo(pts[i][0], pts[i][1]); else octx.moveTo(pts[i][0], pts[i][1]); });
        octx.strokeStyle = ok ? "rgba(34,211,238,.8)" : "rgba(255,255,255,.6)"; octx.lineWidth = r * 0.8; octx.stroke();
      });
      pts.forEach(function (p) { octx.beginPath(); octx.arc(p[0], p[1], r, 0, Math.PI * 2); octx.fill(); });
    }
  }
  function renderQc(items) {
    $("#plQc").innerHTML = items.map(function (q) {
      return '<li class="' + (q.ok ? "ok" : "no") + '"><span class="dot" aria-hidden="true">' + (q.ok ? "✓" : "!") + "</span><span>" + esc(q.label) + (q.ok || !q.tip ? "" : ' <small>— ' + esc(q.tip) + "</small>") + "</span></li>";
    }).join("");
  }
  var probe = document.createElement("canvas");
  function quality(pts, W, H, src) {
    var q = [{ id: "hand", label: "พบมือ", ok: !!pts, tip: "แบฝ่ามือเข้าหากล้องให้เห็นทั้งมือ" }];
    if (!pts) return q;
    var hand = PC.handFromLandmarks(pts), m = PC.measureHand(hand);
    q.push({ id: "size", label: "มือใหญ่พอ", ok: m.palmW / Math.min(W, H) >= 0.14, tip: "ขยับมือเข้าใกล้กล้องอีกนิด" });
    var inside = pts.every(function (p) { return p[0] > W * 0.02 && p[0] < W * 0.98 && p[1] > H * 0.02 && p[1] < H * 0.98; });
    q.push({ id: "frame", label: "เห็นนิ้วและข้อมือครบ", ok: inside, tip: "ถอยมือให้นิ้วและข้อมืออยู่ในภาพ" });
    // ความสว่างกลางฝ่ามือ
    var c = PC.lerp(hand.wrist, hand.mcp.middle, 0.5), r = m.palmW * 0.35;
    probe.width = 32; probe.height = 32;
    var x = probe.getContext("2d", { willReadFrequently: true }); x.drawImage(src, c[0] - r, c[1] - r, 2 * r, 2 * r, 0, 0, 32, 32);
    var d = x.getImageData(0, 0, 32, 32).data, s = 0; for (var i = 0; i < d.length; i += 4) s += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    var lum = s / (d.length / 4);
    q.push({ id: "light", label: "แสงพอดี", ok: lum > 80 && lum < 235, tip: lum <= 80 ? "แสงน้อย ลองเปิดไฟฉายหรือหันเข้าหาแสง" : "แสงจ้าเกินไป ลองเลี่ยงแสงสะท้อน" });
    return q;
  }
  var lastQ = null;
  async function startLoop() {
    if (looping) return; looping = true;
    while (camera.active && looping) {
      if (!S.busy && ready && video.videoWidth) {
        try {
          var r = await detectHand(video, true);
          lastQ = quality(r && r.pts, video.videoWidth, video.videoHeight, video);
          if (!S.busy) { renderQc(lastQ); drawGuide(r && r.pts, lastQ.every(function (q) { return q.ok; })); }
        } catch (e) { console.warn(e); }
      } else if (!ready && video.videoWidth) drawGuide(null, false);
      await sleep(400);
    }
    looping = false;
  }

  btnCam.addEventListener("click", async function () {
    btnCam.disabled = true;
    engine("กำลังเปิดกล้อง...");
    try {
      await camera.start();
      loadModels().catch(function () {});
      $("#plCamHint").hidden = true;
      engine("กล้องพร้อม — วางฝ่ามือให้อยู่ในกรอบ แล้วกด ถ่ายภาพฝ่ามือ", "ok");
      btnCam.hidden = true; btnSnap.hidden = false;
      drawGuide(null, false);
    } catch (e) { camErr(e); btnCam.disabled = false; }
  });
  btnSnap.addEventListener("click", async function () {
    if (S.busy || !camera.active) return;
    S.busy = true; btnSnap.disabled = true; touch();
    try {
      for (var n = 3; n >= 1; n--) { countEl.textContent = n; countEl.hidden = false; await sleep(700); }
      countEl.hidden = true;
      // เก็บภาพดิบ (ไม่กลับซ้าย-ขวา) เพื่อให้ตรวจมือซ้าย/ขวาได้ถูก
      var cv = document.createElement("canvas"), sc = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
      cv.width = Math.round(video.videoWidth * sc); cv.height = Math.round(video.videoHeight * sc);
      cv.getContext("2d", { willReadFrequently: true }).drawImage(video, 0, 0, cv.width, cv.height);
      await processImage(cv);
    } catch (e) { console.error(e); engine("ถ่ายภาพไม่สำเร็จ: " + (e.message || e), "err"); }
    finally { countEl.hidden = true; S.busy = false; btnSnap.disabled = false; }
  });
  fileIn.addEventListener("change", async function () {
    var f = fileIn.files && fileIn.files[0]; fileIn.value = "";
    if (!f) return;
    touch();
    engine("กำลังเปิดรูป...");
    S.busy = true;
    try {
      var url = URL.createObjectURL(f), img = new Image();
      await new Promise(function (res, rej) { img.onload = res; img.onerror = function () { rej(new Error("เปิดไฟล์รูปไม่ได้")); }; img.src = url; });
      var sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      var cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
      cv.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      await processImage(cv);
    } catch (e) { console.error(e); engine("อ่านรูปไม่สำเร็จ: " + (e.message || e), "err"); }
    finally { S.busy = false; }
  });

  /* ---------- ประมวลผลภาพ: จุดบนมือ → กรอบฝ่ามือ → ภาพมาตรฐาน → ตัวกรองเส้น → เส้นอัตโนมัติ ---------- */
  async function processImage(cv) {
    S.src = cv; S.result = null;
    resultSec.hidden = true;
    engine("กำลังหาจุดบนมือ...");
    await frame2();
    var det = null;
    try { await loadModels(); det = await detectHand(cv, false); } catch (e) { console.warn(e); }
    var q = quality(det && det.pts, cv.width, cv.height, cv);
    renderQc(q);
    if (!det) {
      engine("ไม่พบมือในภาพอัตโนมัติ — แตะจุดบนมือเอง 7 จุดเพื่อไปต่อ", "err");
      startTap();
      return;
    }
    var warn = q.filter(function (x) { return !x.ok; }).map(function (x) { return x.tip; });
    S.hand = PC.handFromLandmarks(det.pts);
    S.side = PC.guessSide(S.hand); S.sideAuto = true; renderSide();
    await buildFromHand(warn.length ? "พบมือแล้ว (" + warn.join(" · ") + " — ผลอาจคลาดเคลื่อน)" : "พบมือแล้ว ตรวจและปรับเส้นได้ด้านล่าง", warn.length ? "err" : "ok");
  }
  async function buildFromHand(msg, cls) {
    engine("กำลังไล่เส้นบนฝ่ามือ...");
    await frame2();
    var F = PC.palmFrame(S.hand), c = document.createElement("canvas");
    c.width = F.w; c.height = F.h;
    var x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#000"; x.fillRect(0, 0, F.w, F.h);
    x.setTransform.apply(x, F.matrix()); x.imageSmoothingQuality = "high"; x.drawImage(S.src, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0);
    var id = x.getImageData(0, 0, F.w, F.h);
    var g = PC.grayFrom(id.data, F.w, F.h), mask = PC.skinMask(id.data, F.w, F.h);
    // ถ้าแยกสีผิวไม่ได้ (แสงสี/ผิวซีด) ไม่ใช้หน้ากาก
    var inPalm = 0, tot = 0;
    for (var v = 0.1; v < 0.95; v += 0.05) for (var u = 0.05; u < 0.95; u += 0.05) { var p = F.uvToPx([u, v]); tot++; if (mask[Math.round(p[1]) * F.w + Math.round(p[0])]) inPalm++; }
    var useMask = inPalm / tot > 0.6;
    // ใช้หน้ากากเฉพาะรอบนอกฝ่ามือ (ตัดขอบมือ/ฉากหลัง) — ในฝ่ามือผิวอาจมีเส้นเลือดสีเขียวอมฟ้าที่หลุดเกณฑ์สีผิว
    if (useMask) for (var yy = 0; yy < F.h; yy++) for (var xx = 0; xx < F.w; xx++) { var q = F.pxToUV([xx, yy]); if (q[0] > -0.02 && q[0] < 1.0 && q[1] > 0.02 && q[1] < 0.97) mask[yy * F.w + xx] = 1; }
    S.F = F; S.canon = c;
    S.R = PC.ridgeFilter(PC.localContrast(g, F.w, F.h, 12), F.w, F.h, [1.6, 2.4, 3.4], useMask ? mask : null);
    S.auto = PC.detectLines(S.R, F);
    S.lines = JSON.parse(JSON.stringify(S.auto));
    S.active = "life"; S.mode = "edit";
    $("#plFateNone").checked = !S.lines.fate.present;
    showEditor();
    engine(msg || "พร้อมปรับเส้น", cls || "ok");
  }

  /* ---------- ขั้นที่ 2: ตัวแก้ไขเส้น / ปักจุดเอง ---------- */
  var TAP_LABELS = { wrist: "กึ่งกลางข้อมือ", indexBase: "โคนนิ้วชี้", pinkyBase: "โคนนิ้วก้อย", indexTip: "ปลายนิ้วชี้", middleTip: "ปลายนิ้วกลาง", ringTip: "ปลายนิ้วนาง", pinkyTip: "ปลายนิ้วก้อย" };
  function showEditor() {
    editSec.hidden = false; setStep(2);
    $("#plTapBar").hidden = S.mode !== "tap";
    $("#plLineTools").hidden = S.mode === "tap";
    $("#plRead").disabled = S.mode === "tap";
    $("#plHonest").hidden = S.mode === "tap";
    renderLineChips(); renderEditor();
    editSec.scrollIntoView({ behavior: smooth(), block: "start" });
    $("#plEditTitle").focus({ preventScroll: true });
  }
  function startTap() {
    S.mode = "tap"; S.taps = [];
    var sc = Math.min(1, 900 / Math.max(S.src.width, S.src.height));
    edCv.width = Math.round(S.src.width * sc); edCv.height = Math.round(S.src.height * sc);
    showEditor(); renderTapMsg();
  }
  function renderTapMsg() {
    var k = PC.TAP_ORDER[S.taps.length];
    $("#plTapMsg").innerHTML = k ? "แตะจุดที่ " + (S.taps.length + 1) + "/7: <b>" + esc(TAP_LABELS[k]) + "</b>" : "ครบแล้ว";
    $("#plTapUndo").disabled = !S.taps.length;
    $("#plEditCap").textContent = "แตะตามลำดับ: ข้อมือ → โคนนิ้วชี้ → โคนนิ้วก้อย → ปลายนิ้วชี้ กลาง นาง ก้อย (ใช้วัดสัดส่วนมือและวางแนวเส้น)";
  }
  $("#plTapUndo").addEventListener("click", function () { S.taps.pop(); renderTapMsg(); renderEditor(); });
  $("#plTapMode").addEventListener("click", function () { if (S.src) startTap(); });
  function renderLineChips() {
    $("#plLineChips").innerHTML = PC.LINE_IDS.map(function (id) {
      var L = KB.lines[id], a = S.lines && S.lines[id] && S.lines[id].auto;
      var conf = a ? (a.conf >= 0.6 ? "ชัด" : a.conf >= 0.3 ? "พอเห็น" : "ไม่ชัด") : "";
      return '<button type="button" role="radio" class="chip-btn" style="--c:' + L.color + '" data-line="' + id + '" aria-checked="' + (S.active === id) + '"><i></i>' + esc(L.th) + (conf ? " <small>AI: " + conf + "</small>" : "") + "</button>";
    }).join("");
    $$("#plLineChips [data-line]").forEach(function (b) { b.addEventListener("click", function () { S.active = b.dataset.line; renderLineChips(); renderEditor(); }); });
  }
  $("#plFateNone").addEventListener("change", function () { if (S.lines) { S.lines.fate.present = !this.checked; if (!this.checked) S.active = "fate"; renderLineChips(); renderEditor(); } });
  $("#plResetLines").addEventListener("click", function () { if (S.auto) { S.lines = JSON.parse(JSON.stringify(S.auto)); $("#plFateNone").checked = !S.lines.fate.present; renderLineChips(); renderEditor(); toast("คืนค่าเส้นอัตโนมัติแล้ว"); } });

  // แสดงผลภาพมาตรฐาน: กลับซ้าย-ขวาเมื่อกรอบถูกสะท้อน (มือขวา) เพื่อให้ภาพตรงกับมือจริง
  function dispX(x) { return S.F && S.F.mirrored ? S.F.w - x : x; }
  function uvToDisp(q) { var p = S.F.uvToPx(q); return [dispX(p[0]), p[1]]; }
  function dispToUv(p) { return S.F.pxToUV([dispX(p[0]), p[1]]); }
  function drawCanon(c, dim) {
    var F = S.F;
    c.save(); if (F.mirrored) { c.translate(F.w, 0); c.scale(-1, 1); } c.drawImage(S.canon, 0, 0); c.restore();
    if (dim) { c.fillStyle = "rgba(14,20,48," + dim + ")"; c.fillRect(0, 0, F.w, F.h); }
  }
  function strokeLine(c, cp, color, width, dashed) {
    var sp = PC.spline(cp.map(uvToDisp), 60);
    c.save(); c.lineCap = "round"; c.lineJoin = "round";
    c.strokeStyle = "rgba(14,20,48,.55)"; c.lineWidth = width + 3; if (dashed) c.setLineDash([10, 8]);
    c.beginPath(); sp.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
    c.strokeStyle = color; c.lineWidth = width; c.stroke(); c.restore();
  }
  /** กำหนดขนาดแสดงผลของ canvas ให้คงสัดส่วนและไม่สูงเกินจอ (ไม่ใช้ object-fit เพื่อให้พิกัดนิ้วแตะตรงกับภาพ) */
  function fitEditor() {
    var host = edCv.parentElement, cw = host.clientWidth - 20, maxH = window.innerHeight * 0.78;
    if (cw <= 0) return;
    var w = Math.min(cw, maxH * edCv.width / edCv.height);
    edCv.style.width = Math.round(w) + "px"; edCv.style.height = Math.round(w * edCv.height / edCv.width) + "px";
  }
  function cssScale() { var r = edCv.getBoundingClientRect(); return r.width ? edCv.width / r.width : 1; }
  function renderEditor() {
    var c = edCv.getContext("2d");
    if (S.mode !== "tap" && S.F && (edCv.width !== S.F.w || edCv.height !== S.F.h)) { edCv.width = S.F.w; edCv.height = S.F.h; }
    fitEditor();
    if (S.mode === "tap") {
      c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(S.src, 0, 0, edCv.width, edCv.height);
      var k = edCv.width / S.src.width, r = 9 * cssScale();
      c.font = "600 " + Math.round(13 * cssScale()) + "px Prompt, system-ui, sans-serif"; c.textBaseline = "middle";
      S.taps.forEach(function (p, i) {
        c.beginPath(); c.arc(p[0] * k, p[1] * k, r, 0, Math.PI * 2); c.fillStyle = "#22d3ee"; c.fill(); c.lineWidth = 3; c.strokeStyle = "#0e1430"; c.stroke();
        c.fillStyle = "#fff"; c.strokeStyle = "rgba(14,20,48,.8)"; c.lineWidth = 4; c.strokeText(TAP_LABELS[PC.TAP_ORDER[i]], p[0] * k + r * 1.4, p[1] * k); c.fillText(TAP_LABELS[PC.TAP_ORDER[i]], p[0] * k + r * 1.4, p[1] * k);
      });
      return;
    }
    if (!S.F) return;
    c.setTransform(1, 0, 0, 1, 0, 0); drawCanon(c, 0.08);
    var sc = cssScale();
    PC.LINE_IDS.forEach(function (id) {
      var L = S.lines[id]; if (!L) return;
      var on = id === S.active;
      if (id === "fate" && !L.present) { if (on) strokeLine(c, L.cp, "rgba(167,139,250,.5)", 2 * sc, true); return; }
      strokeLine(c, L.cp, KB.lines[id].color, (on ? 4 : 2.5) * sc, false);
    });
    var A = S.lines[S.active];
    if (A && (S.active !== "fate" || A.present)) A.cp.forEach(function (q, i) {
      var p = uvToDisp(q), r = 11 * sc;
      c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fillStyle = "#fff"; c.fill();
      c.lineWidth = 4 * sc; c.strokeStyle = KB.lines[S.active].color; c.stroke();
      if (i === 0) { c.beginPath(); c.arc(p[0], p[1], r * 0.35, 0, Math.PI * 2); c.fillStyle = KB.lines[S.active].color; c.fill(); }
    });
    $("#plEditCap").textContent = "กำลังปรับ: " + KB.lines[S.active].th + " — " + KB.lines[S.active].where + " · ลากจุดกลมให้ทับรอยเส้นจริง";
  }
  function evtPt(e) { var r = edCv.getBoundingClientRect(); return [(e.clientX - r.left) * edCv.width / r.width, (e.clientY - r.top) * edCv.height / r.height]; }
  var drag = null;
  edCv.addEventListener("pointerdown", function (e) {
    touch();
    var p = evtPt(e);
    if (S.mode === "tap") {
      if (S.taps.length >= 7) return;
      var k = S.src.width / edCv.width; S.taps.push([p[0] * k, p[1] * k]); renderTapMsg(); renderEditor();
      if (S.taps.length === 7) {
        var t = {}; PC.TAP_ORDER.forEach(function (key, i) { t[key] = S.taps[i]; });
        S.hand = PC.handFromTaps(t); S.side = PC.guessSide(S.hand); S.sideAuto = true; renderSide();
        S.mode = "edit"; $("#plTapBar").hidden = true; $("#plLineTools").hidden = false; $("#plRead").disabled = false; $("#plHonest").hidden = false;
        buildFromHand("ปักจุดครบแล้ว ตรวจและปรับเส้นได้เลย", "ok");
      }
      return;
    }
    if (!S.lines) return;
    var best = null, bd = 30 * cssScale();
    var order = [S.active].concat(PC.LINE_IDS.filter(function (id) { return id !== S.active; }));
    order.forEach(function (id) {
      var L = S.lines[id]; if (!L || (id === "fate" && !L.present)) return;
      L.cp.forEach(function (q, i) { var d = PC.dist(uvToDisp(q), p) - (id === S.active ? 6 : 0); if (d < bd) { bd = d; best = { id: id, i: i }; } });
    });
    if (!best) return;
    e.preventDefault();
    drag = best; edCv.classList.add("dragging");
    try { edCv.setPointerCapture(e.pointerId); } catch (err) { /* ไม่มี pointer จริง */ }
    if (S.active !== best.id) { S.active = best.id; renderLineChips(); }
    renderEditor();
  });
  edCv.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var q = dispToUv(evtPt(e));
    S.lines[drag.id].cp[drag.i] = [PC.round(Math.max(-0.42, Math.min(1.32, q[0])), 4), PC.round(Math.max(-0.4, Math.min(1.12, q[1])), 4)];
    renderEditor();
  });
  var endDrag = function () { if (drag) { drag = null; edCv.classList.remove("dragging"); renderEditor(); } };
  edCv.addEventListener("pointerup", endDrag); edCv.addEventListener("pointercancel", endDrag);

  // เส้นรอง (ผู้ใช้ยืนยัน) และเนิน
  function renderMinor() {
    $("#plMinor").innerHTML = Object.keys(KB.minor).map(function (k) {
      var d = KB.minor[k], v = S.minor[k];
      return '<div class="minor-row"><b>' + esc(d.th) + '</b><small>' + esc(d.where) + '</small><span class="tri" role="group" aria-label="' + esc(d.th) + '">' +
        '<button type="button" data-minor="' + k + '" data-v="1" aria-pressed="' + (v === true) + '">เห็น</button>' +
        '<button type="button" data-minor="' + k + '" data-v="0" aria-pressed="' + (v === false) + '">ไม่เห็น</button></span></div>';
    }).join("");
    $$("#plMinor [data-minor]").forEach(function (b) {
      b.addEventListener("click", function () { var k = b.dataset.minor, v = b.dataset.v === "1"; S.minor[k] = S.minor[k] === v ? undefined : v; renderMinor(); });
    });
  }
  function renderMounts() {
    $("#plMounts").innerHTML = Object.keys(KB.mounts).map(function (k) {
      var d = KB.mounts[k];
      return '<button type="button" class="chip-btn" data-mount="' + k + '" aria-pressed="' + (S.mounts.indexOf(k) >= 0) + '">' + esc(d.th) + " <small>" + esc(d.under) + "</small></button>";
    }).join("");
    $$("#plMounts [data-mount]").forEach(function (b) {
      b.addEventListener("click", function () { var k = b.dataset.mount, i = S.mounts.indexOf(k); if (i >= 0) S.mounts.splice(i, 1); else S.mounts.push(k); renderMounts(); });
    });
  }
  renderMinor(); renderMounts();
  $("#plMountNote").textContent = KB.mountsNote;
  $("#plBack").addEventListener("click", function () { reset(); });

  /* ---------- ขั้นที่ 3: อ่านลายมือ ---------- */
  $("#plRead").addEventListener("click", function () {
    if (!S.hand || !S.lines) return;
    touch();
    var lines = {};
    PC.LINE_IDS.forEach(function (id) { lines[id] = { cp: S.lines[id].cp, present: id !== "fate" || S.lines[id].present }; });
    var seed = Math.round(S.hand.wrist[0] + S.hand.wrist[1]);
    var R = PC.analyze({ hand: S.hand, lines: lines, R: S.R, F: S.F, minor: S.minor, mounts: S.mounts, isDominant: S.side === S.dom, seed: seed });
    S.result = R; S.narr = null;
    renderResult(R);
    narrate(false);
    if (prefs.stats) { lsSet(STATS_KEY, PC.addStat(lsGet(STATS_KEY, null), R.el.top.id)); renderStats(); }
    resultSec.hidden = false; setStep(3);
    $("#plCardImg").hidden = true;
    resultSec.scrollIntoView({ behavior: smooth(), block: "start" });
    $("#plResTitle").focus({ preventScroll: true });
  });

  /* ---------- คำทำนายโดยละเอียด (FortuneAI: เรียบเรียงในเครื่อง หรือ Claude AI เมื่อเซิร์ฟเวอร์เปิดและผู้ใช้ยินยอม) ---------- */
  var FA = window.FortuneAI || null;
  var TOPICS = [["overall", "ภาพรวม"], ["love", "ความรัก"], ["work", "การงาน"], ["money", "การเงิน"]];
  var topic = "overall", narrToken = 0;
  function renderTopics() {
    $$("[data-topics]").forEach(function (box) {
      box.innerHTML = TOPICS.map(function (t) { return '<button type="button" role="radio" data-topic="' + t[0] + '" aria-checked="' + (t[0] === topic) + '">' + t[1] + "</button>"; }).join("");
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-topic]"); if (!b) return;
    if (b.dataset.topic === topic) return;
    topic = b.dataset.topic; renderTopics(); touch();
    if (S.result) narrate(false);
  });
  renderTopics();
  function renderPlain(box, res) {
    box.innerHTML = (res.sections || []).map(function (sc) {
      return '<section class="fa-section"><h3>' + esc(sc.title || "") + "</h3>" + (sc.paragraphs || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</section>";
    }).join("");
  }
  function legacyResult(R) {
    var rd = R.reading;
    return { source: "local", sections: [{ id: "personality", title: "บุคลิก", paragraphs: [rd.personality] }, { id: "work", title: "การงาน", paragraphs: [rd.work] },
      { id: "money", title: "การเงิน", paragraphs: [rd.money] }, { id: "love", title: "ความรัก & มิตรภาพ", paragraphs: [rd.love] }] };
  }
  function narrate(again) {
    if (!S.result) return;
    var my = ++narrToken, box = $("#plNarr"), btn = $("#plRegen"), R = S.result;
    var facts = PC.buildFacts(R, { topic: topic, nickname: $("#plNick").value, minor: S.minor, mounts: S.mounts, side: S.side, isDominant: S.side === S.dom, asp: S.F ? S.F.asp : null });
    S.facts = facts;
    var useAI = !!(FA && FA.hasConsent && FA.hasConsent());
    box.setAttribute("aria-busy", "true"); btn.disabled = true;
    if (!box.firstChild || useAI) box.innerHTML = '<p class="fa-loading">' + (useAI ? "กำลังให้ AI เรียบเรียงคำทำนาย..." : "กำลังเรียบเรียงคำทำนาย...") + "</p>";
    var p = !FA ? Promise.resolve(legacyResult(R)) : again && FA.regenerate ? FA.regenerate(facts, { useAI: useAI }) : FA.interpret(facts, { useAI: useAI });
    p.catch(function (e) { console.error(e); return FA && FA.compose ? FA.compose(facts) : legacyResult(R); }).then(function (res) {
      if (my !== narrToken || !S.result) return;
      S.narr = res;
      if (FA && FA.renderSections) FA.renderSections(box, res, { aiBadge: false }); else renderPlain(box, res);
      var src = $("#plSrc"), ai = res.source === "ai";
      src.textContent = ai ? "เรียบเรียงโดย Claude AI" : "เรียบเรียงในเครื่อง";
      src.classList.toggle("ai", ai);
      box.removeAttribute("aria-busy"); btn.disabled = false;
    });
  }
  $("#plRegen").addEventListener("click", function () { touch(); narrate(true); });
  $("#plNick").addEventListener("change", function () { if (S.result) narrate(false); });
  if (FA && FA.consentControl) FA.consentControl($("#plConsent"), { onChange: function () { if (S.result) narrate(false); } }).catch(function () { /* ไม่มีเซิร์ฟเวอร์ AI */ });

  /** ดึง 2–3 ประโยคสั้น (≤ max ตัวอักษร) จากคำทำนายที่เรียบเรียงแล้ว สำหรับการ์ดแชร์
      หาสำนวนจาก KB ที่ปรากฏจริงในภาพรวม/หัวข้อแรก ๆ ตามลำดับที่อ่าน แล้วตัดที่ช่องว่างระหว่างวลีให้สั้นลง */
  var CARD_HEDGE = /^(?:ตามตำรา(?:แล้ว)?|ตามความเชื่อ(?:แล้ว)?|ในความเชื่อ|ว่ากันว่า|เชื่อกันว่า|ดูเหมือนว่า|มีแนวโน้มว่า)\s*(?:บอกว่า|หมายถึง|หมายความว่า|มักตีความว่า)?\s*/;
  function shortClause(m, max) {
    var seg = String(m).replace(CARD_HEDGE, "").split(/\s+/).filter(Boolean), c = "";
    for (var i = 0; i < seg.length && c.length < 20; i++) { var nx = c ? c + " " + seg[i] : seg[i]; if (nx.length > max) break; c = nx; }
    return c.length >= 20 && !/[0-9()%]/.test(c) && !/(?:แบบนี้|อย่างนี้|ทรงนี้|ของคุณ|ว่า|ที่|และ|หรือ|เช่น|ค่อย ๆ|กับ|ให้)$/.test(c) ? c : "";
  }
  function keySentences(res, n, max, facts) {
    var secs = (res && res.sections) || [], out = [];
    var text = secs.filter(function (x) { return x.id !== "advice"; }).slice(0, 4).map(function (x) { return (x.paragraphs || []).join(" "); }).join(" ");
    var found = [];
    ((facts && facts.items) || []).forEach(function (it) {
      Object.keys(it.meanings || {}).forEach(function (k) {
        it.meanings[k].forEach(function (m) { var c = String(m).trim().replace(/[.。\s]+$/, ""), at = text.indexOf(c); if (at >= 0) found.push({ at: at, m: c }); });
      });
    });
    found.sort(function (a, b) { return a.at - b.at; });
    found.forEach(function (f) { if (out.length >= n) return; var c = shortClause(f.m, max); if (c && out.indexOf(c) < 0) out.push(c); });
    if (out.length < 2 && res && res.source === "ai") secs.slice(0, 2).forEach(function (x) { (x.paragraphs || []).forEach(function (p) { if (out.length < n) { var c = shortClause(p, max); if (c && out.indexOf(c) < 0) out.push(c); } }); });
    return out;
  }

  function drawResultImage(R) {
    var F = S.F, c = resCanvas.getContext("2d");
    resCanvas.width = F.w; resCanvas.height = F.h;
    drawCanon(c, 0.22);
    var sc = F.w / 420;
    PC.LINE_IDS.forEach(function (id) {
      var L = S.lines[id];
      if (id === "fate" && !L.present) return;
      strokeLine(c, L.cp, KB.lines[id].color, 4 * sc, false);
    });
    // เนิน (วาดทับเส้น พร้อมพื้นหลังป้าย)
    var fs = Math.round(12 * sc);
    c.font = "500 " + fs + "px Prompt, system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    Object.keys(KB.mounts).forEach(function (k) {
      var p = uvToDisp(KB.mounts[k].pos), on = S.mounts.indexOf(k) >= 0, t = KB.mounts[k].th.replace("เนิน", "");
      c.beginPath(); c.arc(p[0], p[1], (on ? 6 : 3.5) * sc, 0, Math.PI * 2); c.fillStyle = on ? "#fcd34d" : "rgba(255,255,255,.75)"; c.fill();
      var tw = c.measureText(t).width + fs * 0.9, th = fs * 1.5, ty = p[1] + 14 * sc;
      c.fillStyle = on ? "rgba(252,211,77,.95)" : "rgba(14,20,48,.62)";
      c.beginPath(); if (c.roundRect) c.roundRect(p[0] - tw / 2, ty - th / 2, tw, th, th / 2); else c.rect(p[0] - tw / 2, ty - th / 2, tw, th); c.fill();
      c.fillStyle = on ? "#0e1430" : "#fff"; c.fillText(t, p[0], ty + 1);
    });
    c.textAlign = "left";
  }
  var fmt = function (v, d) { return typeof v === "number" ? v.toFixed(d) : "—"; };
  function renderResult(R) {
    var rd = R.reading, E = rd.element;
    drawResultImage(R);
    $("#plElement").style.setProperty("--el", E.color);
    $("#plElement").style.setProperty("--el-soft", E.soft);
    $("#plElName").textContent = "ธาตุ" + E.th;
    $("#plElPct").textContent = R.el.top.pct + "%";
    $("#plElShape").textContent = E.shape;
    $("#plElSecond").innerHTML = "ธาตุรอง: <b>" + esc(rd.second.th) + "</b> " + R.el.second.pct + "%";
    $("#plElBars").innerHTML = R.el.ranked.map(function (r) { var e = KB.elements[r.id]; return '<div class="elbar"><span>' + esc(e.th) + '</span><i style="--w:' + r.pct + "%;--c:" + e.color + '"></i><b>' + r.pct + "%</b></div>"; }).join("");
    $("#plElTraits").innerHTML = E.traits.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    $("#plElNote").textContent = KB.elementsNote;
    $("#plSideBadge").innerHTML = rd.side ? "<b>" + esc(S.side === "left" ? "มือซ้าย" : "มือขวา") + "</b>" + esc(rd.side.th + " — " + rd.side.text) : "";
    $("#plLines").innerHTML = rd.lines.map(function (l) {
      return '<div class="line-card" style="--c:' + l.color + '"><h4>' + esc(l.th) + "<span>" + esc(l.cn) + '</span></h4><p class="about">' + esc(l.about) + "</p><ul>" +
        l.items.map(function (it) { return "<li><b>" + esc(it.label) + "</b>" + esc(it.meaning) + "</li>"; }).join("") + "</ul></div>";
    }).join("");
    $("#plLifeNote").textContent = KB.lifeLineNote;
    var hm = R.hm;
    $("#plFingers").innerHTML = [
      "<li><b>" + esc(rd.finger.label) + "</b>" + esc(rd.finger.meaning) + "</li>",
      "<li><b>" + esc(rd.thumb.label) + "</b>" + esc(rd.thumb.meaning) + "</li>",
      "<li><b>ฝ่ามือ" + (R.el.palmShape === "long" ? "ค่อนข้างยาว" : "ค่อนข้างเหลี่ยม") + " · นิ้ว" + (R.el.fingerShape === "long" ? "ค่อนข้างยาว" : "ค่อนข้างสั้น") + "</b>" + esc(E.shape) + "</li>"
    ].join("");
    var ex = rd.minor.map(function (m) { return "<li><b>" + esc(m.th) + (m.seen ? " — เห็นชัด" : " — ไม่เห็นชัด") + "</b>" + esc(m.meaning) + "</li>"; })
      .concat(rd.mounts.map(function (m) { return "<li><b>" + esc(m.th) + " เด่น</b>" + esc(m.meaning) + "</li>"; }));
    $("#plExtras").innerHTML = ex.length ? ex.join("") : '<li class="muted">ไม่ได้เลือกเส้นรองหรือเนิน — ย้อนไปเลือกในขั้นปรับเส้นได้</li>';
    $("#plColors").innerHTML = rd.colors.map(function (c) { return '<li><i style="background:' + c.hex + '"></i>' + esc(c.name) + "</li>"; }).join("");
    $("#plTips").innerHTML = rd.tips.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    $("#plHowSrc").textContent = "จุดบนมือ: " + (hm.source === "model" ? "ตรวจอัตโนมัติด้วยโมเดล MediaPipe Hands (21 จุด)" : "ผู้ใช้แตะเอง 7 จุด (โคนนิ้วกลาง/นางเป็นค่าประมาณ)") + " · ตัวประมวลผล: " + (models ? models.backend.toUpperCase() : "—");
    var M = R.lc.m, rows = [
      ["ฝ่ามือยาว ÷ กว้าง", fmt(hm.palmRatio, 2), "ข้อมือ→โคนนิ้วกลาง ÷ โคนนิ้วชี้→ก้อย (ค่าทั่วไป ~" + PC.NORMS.palm + ")"],
      ["นิ้วกลาง ÷ ฝ่ามือ", fmt(hm.fingerRatio, 2), "ความยาวนิ้วกลาง ÷ ความยาวฝ่ามือ (ค่าทั่วไป ~" + PC.NORMS.finger + ")"],
      ["นิ้วชี้ ÷ นิ้วนาง", fmt(hm.indexRing, 3), "> 1.02 นิ้วชี้ยาวกว่า · < 0.965 นิ้วนางยาวกว่า"],
      ["นิ้วโป้ง ÷ ฝ่ามือ", fmt(hm.thumbRatio, 2), "ใช้เฉพาะเมื่อโมเดลตรวจจุดนิ้วโป้งได้"]
    ];
    PC.LINE_IDS.forEach(function (id) {
      var m = M[id]; if (!m || (id === "fate" && !S.lines.fate.present)) return;
      rows.push([KB.lines[id].th, "ยาว " + fmt(m.length, 2) + " · ลึก " + fmt(m.depth, 2), "ความยาวเป็นเท่าของความกว้างฝ่ามือ · ความลึก 0–1 จากความเข้มของร่อง" + (id === "head" ? " · ลาดลง " + fmt(m.angle, 0) + "°" : "") + (m.breaks ? " · ช่วงขาด " + m.breaks : "")]);
    });
    $("#plRaw").innerHTML = rows.map(function (r) { return "<tr><td>" + esc(r[0]) + '</td><td class="num">' + esc(r[1]) + "</td><td>" + esc(r[2]) + "</td></tr>"; }).join("");
  }
  $("#plEditAgain").addEventListener("click", function () { touch(); editSec.scrollIntoView({ behavior: smooth(), block: "start" }); setStep(2); });

  /* ---------- การ์ดแชร์ 1080×1350 ---------- */
  function wrapTh(c, text, maxW) {
    var segs = (typeof Intl !== "undefined" && Intl.Segmenter) ? Array.from(new Intl.Segmenter("th", { granularity: "word" }).segment(text), function (s) { return s.segment; }) : text.split("");
    var lines = [], cur = "";
    segs.forEach(function (sg) { if (c.measureText(cur + sg).width > maxW && cur) { lines.push(cur.trim()); cur = sg.trimStart(); } else cur += sg; });
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }
  async function makeCard() {
    var R = S.result, rd = R.reading, E = rd.element;
    try { await Promise.all([document.fonts.load("700 60px Prompt"), document.fonts.load("500 30px Prompt"), document.fonts.load("400 30px Prompt")]); } catch (e) { /* ใช้ฟอนต์ระบบ */ }
    var W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d"), FF = "Prompt, system-ui, sans-serif";
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0e1430"); g.addColorStop(1, "#1e2a5a");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    var rg = c.createRadialGradient(W / 2, 450, 40, W / 2, 450, 520); rg.addColorStop(0, E.color + "88"); rg.addColorStop(1, "rgba(14,20,48,0)");
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    // โลโก้
    c.save(); c.translate(72, 64);
    c.strokeStyle = "#22d3ee"; c.lineWidth = 4; c.lineCap = "round";
    c.beginPath(); if (c.roundRect) c.roundRect(0, 0, 60, 60, 18); else c.rect(0, 0, 60, 60); c.fillStyle = "rgba(255,255,255,.08)"; c.fill();
    c.beginPath(); [[14, 24, 14, 14, 24, 14], [46, 24, 46, 14, 36, 14], [14, 36, 14, 46, 24, 46], [46, 36, 46, 46, 36, 46]].forEach(function (q) { c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.lineTo(q[4], q[5]); }); c.stroke();
    c.beginPath(); c.arc(30, 30, 8, 0, Math.PI * 2); c.fillStyle = "#8b78ff"; c.fill();
    c.restore();
    c.textBaseline = "middle"; c.textAlign = "left";
    c.font = "700 40px " + FF; c.fillStyle = "#fff"; c.fillText("LENS", 148, 96); var lw = c.measureText("LENS").width; c.fillStyle = "#a99bff"; c.fillText("IQ", 148 + lw, 96);
    c.textAlign = "right"; c.font = "500 34px " + FF; c.fillStyle = "#c9d0ea"; c.fillText("ดูลายมือ AI", W - 72, 96);
    // วงกลม + ภาพลายเส้นมือ (ไม่ใช้ภาพถ่าย)
    var cy = 440, r = 220;
    c.beginPath(); c.arc(W / 2, cy, r + 14, 0, Math.PI * 2); c.fillStyle = E.color; c.fill();
    c.save(); c.beginPath(); c.arc(W / 2, cy, r, 0, Math.PI * 2); c.clip(); c.fillStyle = "#0e1430"; c.fillRect(W / 2 - r, cy - r, 2 * r, 2 * r);
    drawPalmGlyph(c, W / 2, cy, r, S.lines, S.F ? S.F.asp : 1.6);
    c.restore();
    c.textAlign = "center"; c.fillStyle = "#fff";
    c.font = "700 92px " + FF; c.fillText("มือธาตุ" + E.th, W / 2, 750);
    c.font = "400 34px " + FF; c.fillStyle = "#c9d0ea";
    c.fillText(R.el.top.pct + "% · ธาตุรอง" + rd.second.th + " " + R.el.second.pct + "%", W / 2, 830);
    // 2–3 ประโยคเด่นจากคำทำนายที่เรียบเรียงแล้ว (สำรอง: จุดเด่นของธาตุ)
    var keys = keySentences(S.narr, 5, 60, S.facts), drawn = 0;
    if (!keys.length) keys = E.traits.slice(0, 3);
    c.font = "400 33px " + FF;
    var y = 880;
    keys.forEach(function (t) {
      var ls = wrapTh(c, t, W - 260); if (ls.length > 2) { ls = ls.slice(0, 2); ls[1] = ls[1].replace(/.$/, "…"); }
      var h = ls.length * 44 + 26;
      if (drawn >= 3 || y + h > 1160) return;
      drawn++;
      c.fillStyle = "rgba(255,255,255,.08)"; c.beginPath(); if (c.roundRect) c.roundRect(110, y, W - 220, h, 26); else c.rect(110, y, W - 220, h); c.fill();
      c.fillStyle = "#fff"; ls.forEach(function (l, i) { c.fillText(l, W / 2, y + 35 + i * 44); });
      y += h + 14;
    });
    c.font = "400 30px " + FF; c.fillStyle = "#c9d0ea";
    rd.lines.filter(function (l) { return l.id === "head" || l.id === "heart"; }).forEach(function (l, i) { c.fillText(l.th + ": " + l.items[0].label, W / 2, 1196 + i * 40, W - 140); });
    c.font = "400 24px " + FF; c.fillStyle = "#8f9bc4";
    wrapTh(c, KB.disclaimerShort + " · ไม่บันทึกภาพ", W - 140).forEach(function (l, i) { c.fillText(l, W / 2, 1290 + i * 30); });
    return cv;
  }
  /** ลายเส้นฝ่ามือแบบมินิมอลจากเส้นที่ผู้ใช้ยืนยัน (กรอบ u,v → วงกลม) */
  function drawPalmGlyph(c, cx, cy, r, lines, asp) {
    // หน่วย u = ความกว้างโคนนิ้วชี้→ก้อย; v คูณ asp ให้เป็นสัดส่วนจริง แล้ววางกลางวงกลม (ฝ่ามือ + โคนนิ้ว)
    var k = r * 1.32 / Math.max(1.43, 1.5 * asp), P = function (q) { return [cx + (q[0] - 0.47) * k, cy + 0.2 * r + (q[1] - 0.52) * k * asp]; };
    c.save();
    c.strokeStyle = "rgba(255,255,255,.32)"; c.lineWidth = 6; c.lineJoin = "round"; c.lineCap = "round";
    var tl = P([-0.22, -0.04]), br = P([1.14, 1.08]);
    c.beginPath(); if (c.roundRect) c.roundRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1], k * 0.28); else c.rect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]); c.stroke();
    [[0, 0.62], [0.33, 0.72], [0.66, 0.66], [0.98, 0.5]].forEach(function (f) { var a = P([f[0], -0.06]), b = P([f[0], -0.06 - f[1] / asp]); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineWidth = k * 0.2; c.stroke(); });
    var t0 = P([-0.2, 0.6]), t1 = P([-0.5, 0.25]); c.beginPath(); c.moveTo(t0[0], t0[1]); c.lineTo(t1[0], t1[1]); c.lineWidth = k * 0.22; c.stroke();
    PC.LINE_IDS.forEach(function (id) {
      var L = lines[id]; if (!L || (id === "fate" && !L.present)) return;
      var sp = PC.spline(L.cp, 50).map(P);
      c.strokeStyle = KB.lines[id].color; c.lineWidth = 9;
      c.beginPath(); sp.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
    });
    c.restore();
  }
  var cardUrl = null;
  $("#plShare").addEventListener("click", async function () {
    if (!S.result) return; touch();
    var b = this; b.disabled = true;
    try {
      var cv = await makeCard();
      var blob = await new Promise(function (r) { cv.toBlob(r, "image/png"); });
      if (cardUrl) URL.revokeObjectURL(cardUrl);
      cardUrl = URL.createObjectURL(blob);
      var im = $("#plCardImg"); im.src = cardUrl; im.hidden = false;
      var file = new File([blob], "lensiq-ดูลายมือ.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "ดูลายมือ AI — LENSIQ", text: "มือธาตุ" + S.result.reading.element.th + " " + KB.disclaimerShort }); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      var a = document.createElement("a"); a.href = cardUrl; a.download = "lensiq-palm.png"; document.body.append(a); a.click(); a.remove();
      toast("บันทึกการ์ดแล้ว");
    } catch (e) { console.error(e); toast("สร้างการ์ดไม่สำเร็จ"); }
    finally { b.disabled = false; }
  });
  $("#plPrint").addEventListener("click", function () { touch(); window.print(); });
  $("#plAgain").addEventListener("click", function () { reset(); });

  function reset() {
    resultSec.hidden = true; editSec.hidden = true;
    S.src = S.hand = S.F = S.canon = S.R = S.auto = S.lines = S.result = S.narr = S.facts = null;
    $("#plNick").value = ""; narrToken++; $("#plNarr").innerHTML = ""; // ชื่อเล่นไม่เก็บ ล้างทุกครั้งที่เริ่มคนถัดไป S.minor = {}; S.mounts = []; S.taps = []; S.mode = "edit"; S.sideAuto = false;
    renderMinor(); renderMounts(); renderSide();
    resCanvas.getContext("2d").clearRect(0, 0, resCanvas.width, resCanvas.height);
    edCv.getContext("2d").clearRect(0, 0, edCv.width, edCv.height);
    $("#plCardImg").hidden = true; if (cardUrl) { URL.revokeObjectURL(cardUrl); cardUrl = null; }
    renderQc([{ label: "พบมือ", ok: false, tip: "เปิดกล้องหรืออัปโหลดรูป" }]);
    setStep(1);
    $("#plStage").scrollIntoView({ block: "start" });
    engine(ready ? "พร้อมอ่านคนถัดไป" : "พร้อมใช้งาน", "ok");
    touch();
  }

  /* ---------- สถิติบูธ (ไม่ระบุตัวตน) ---------- */
  function renderStats() {
    var st = lsGet(STATS_KEY, null), box = $("#plStats");
    if (!st || !st.total) { box.innerHTML = '<p class="muted">ยังไม่มีการอ่านในเครื่องนี้</p>'; return; }
    var d = new Date(), today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    box.innerHTML = '<p class="stat-n"><b>' + st.total + "</b> ครั้ง <small>(วันนี้ " + ((st.days || {})[today] || 0) + ")</small></p>" +
      PC.ELEMENTS.map(function (k) { var n = (st.types || {})[k] || 0, e = KB.elements[k]; return '<div class="elbar"><span>' + esc(e.th) + '</span><i style="--w:' + Math.round(n / st.total * 100) + "%;--c:" + e.color + '"></i><b>' + n + "</b></div>"; }).join("");
  }
  $("#plStatsOn").checked = !!prefs.stats;
  $("#plStatsOn").addEventListener("change", function () { prefs.stats = this.checked; lsSet(PREF_KEY, prefs); });
  $("#plStatsClear").addEventListener("click", function () { if (confirm("ล้างสถิติการอ่านในเครื่องนี้?")) { try { localStorage.removeItem(STATS_KEY); } catch (e) { /* ไม่เป็นไร */ } renderStats(); } });
  renderStats();

  /* ---------- โหมดบูธ: เต็มจอ ปุ่มใหญ่ กลับหน้าเริ่มอัตโนมัติเมื่อไม่มีการใช้งาน 60 วินาที ---------- */
  var idleT = null, idleTick = null, wasFs = false;
  function touch() {
    clearTimeout(idleT); clearInterval(idleTick);
    var el = $("#plIdle"); el.hidden = true;
    if (!document.body.classList.contains("pl-kiosk") || (resultSec.hidden && editSec.hidden)) return;
    var until = Date.now() + IDLE_MS;
    idleTick = setInterval(function () {
      var left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 15) { el.hidden = false; el.textContent = "กลับหน้าเริ่มต้นใน " + left + " วินาที — แตะเพื่ออยู่ต่อ"; }
    }, 1000);
    idleT = setTimeout(function () { clearInterval(idleTick); el.hidden = true; reset(); }, IDLE_MS);
  }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { if (document.body.classList.contains("pl-kiosk")) touch(); }, { passive: true }); });
  function setKiosk(on) {
    document.body.classList.toggle("pl-kiosk", on);
    $("#plKiosk").setAttribute("aria-pressed", on ? "true" : "false");
    $("#plKioskExit").hidden = !on;
    if (on) {
      var de = document.documentElement;
      if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().then(function () { wasFs = true; }).catch(function () { /* iOS ไม่รองรับ ใช้โหมดบูธได้ปกติ */ });
      if (!camera.active) btnCam.click();
      $("#plStage").scrollIntoView({ block: "start" });
    } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    touch();
  }
  $("#plKiosk").addEventListener("click", function () { setKiosk(!document.body.classList.contains("pl-kiosk")); });
  $("#plKioskExit").addEventListener("click", function () { setKiosk(false); });
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && wasFs) { wasFs = false; setKiosk(false); } });
  window.addEventListener("resize", function () { if (!editSec.hidden) renderEditor(); });

  $("#plSources").innerHTML = KB.sources.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + "</a></li>"; }).join("");
  $("#plEthics").textContent = KB.ethics;

  if (!window.isSecureContext) showHttpsNote($("#plEngine"));
  engine("กำลังโหลดโมเดลจุดบนมือ...");
  loadModels().catch(function () {});
  window.__palm = { get S() { return S; }, makeCard: makeCard, narrate: narrate, keySentences: keySentences, reset: reset, detectHand: detectHand, loadModels: loadModels }; // ใช้ทดสอบ
})();
