/* palm-handmodel.js — PalmHandModel: decoding of the hand model's outputs for palm.html (palm detector 192x192 with 2016 SSD
   anchors, 21-point landmarks 224x224). Pure math: no DOM, no text, nothing stored or sent. Moved unchanged out of palm.js
   (eslint size cap, branch palm-90, 2026-11-23); palm.js re-exports every name in PalmCore, so callers are unchanged.
   Browser: window.PalmHandModel (parser-run before palm.js) · Node: module.exports. */
(function (root) {
  "use strict";
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
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

  var PalmHandModel = { DET: DET, LM: LM, ssdAnchors: ssdAnchors, decodePalms: decodePalms, iou: iou, nms: nms, letterbox: letterbox, unletterbox: unletterbox, palmRoi: palmRoi, landmarksRoi: landmarksRoi, roiCropMatrix: roiCropMatrix, projectLandmarks: projectLandmarks };
  if (typeof module !== "undefined" && module.exports) module.exports = PalmHandModel;
  root.PalmHandModel = PalmHandModel;
})(typeof window !== "undefined" ? window : globalThis);
