/* ดูลายมือ — อ่านลายมือจากภาพถ่ายฝ่ามือเพื่อความบันเทิง
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
  var LQT = root.LQTrack || (typeof require === "function" ? require("./lensiq-track.js") : null);

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
  var NORMS = { palm: 1.62, palmSd: 0.13, finger: 0.86, fingerSd: 0.08, thumb: 0.82, thumbSd: 0.08,
    // ความยาวแต่ละนิ้ว ÷ ความยาวฝ่ามือ, นิ้วก้อย ÷ นิ้วนาง, มุมนิ้วโป้ง–นิ้วชี้ (องศา), ช่องห่างเฉลี่ยของนิ้วที่ติดกัน (องศา)
    fingers: { index: 0.78, middle: 0.86, ring: 0.81, pinky: 0.63 }, fingerEachSd: 0.07,
    pinkyRing: 0.78, pinkyRingSd: 0.06, thumbAngle: 46, thumbAngleSd: 12, spread: 10, spreadSd: 4 };
  /** มุม (องศา) ระหว่างเวกเตอร์ a0→a1 กับ b0→b1 */
  function angleBetween(a0, a1, b0, b1) {
    var ux = a1[0] - a0[0], uy = a1[1] - a0[1], vx = b1[0] - b0[0], vy = b1[1] - b0[1];
    var c = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
    return Math.acos(clamp(c, -1, 1)) * 180 / Math.PI;
  }
  function measureHand(h) {
    var palmW = dist(h.mcp.index, h.mcp.pinky), palmL = dist(h.wrist, h.mcp.middle);
    var fl = function (f) { return dist(h.mcp[f], h.tip[f]); };
    var m = {
      palmW: palmW, palmL: palmL, palmRatio: palmL / palmW,
      fingerRatio: fl("middle") / palmL,
      indexRing: fl("index") / fl("ring"),
      fingers: { index: fl("index") / palmL, middle: fl("middle") / palmL, ring: fl("ring") / palmL, pinky: fl("pinky") / palmL },
      thumbRatio: h.tip.thumb && h.thumbBase ? dist(h.thumbBase, h.tip.thumb) / palmL : null,
      pinkyRing: fl("pinky") / fl("ring"),
      // มุมกางนิ้วโป้ง (MCP→ปลายนิ้วโป้ง เทียบ MCP→ปลายนิ้วชี้) — ใช้เป็นตัวแทนความยืดหยุ่นของนิ้วโป้งตามตำรา
      thumbAngle: h.pts ? angleBetween(h.pts[2], h.pts[4], h.mcp.index, h.tip.index) : null,
      // ช่องห่างเฉลี่ยของนิ้วที่ติดกัน (ชี้–กลาง, กลาง–นาง, นาง–ก้อย)
      spread: (angleBetween(h.mcp.index, h.tip.index, h.mcp.middle, h.tip.middle) + angleBetween(h.mcp.middle, h.tip.middle, h.mcp.ring, h.tip.ring) + angleBetween(h.mcp.ring, h.tip.ring, h.mcp.pinky, h.tip.pinky)) / 3,
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
  /* ---------- ลักษณะนิ้วเพิ่มเติม (ตำราตะวันตก: นิ้วประจำดาว มุมนิ้วโป้ง ระยะห่างนิ้ว) ---------- */
  var FINGER_PLANET = { index: "jupiter", middle: "saturn", ring: "apollo", pinky: "mercury" };
  function fingerZ(m) {
    var z = {};
    Object.keys(NORMS.fingers).forEach(function (f) { z[f] = (m.fingers[f] - NORMS.fingers[f]) / NORMS.fingerEachSd; });
    return z;
  }
  function thumbAngleCat(m) { return m.thumbAngle == null ? "na" : m.thumbAngle > 60 ? "wide" : m.thumbAngle < 34 ? "narrow" : "medium"; }
  function pinkyCat(m) { var z = (m.pinkyRing - NORMS.pinkyRing) / NORMS.pinkyRingSd; return z > 0.8 ? "long" : z < -0.8 ? "short" : "medium"; }
  function spreadCat(m) { return m.spread == null ? "na" : m.spread > 15 ? "open" : m.spread < 6 ? "close" : "medium"; }
  /** นิ้วเด่น: นิ้วที่ยาวกว่าค่าทั่วไปมากที่สุด (z ≥ 0.7) → นิ้วประจำดาว; ไม่เช่นนั้น "balanced" */
  function fingerDom(m) {
    var z = fingerZ(m), best = "index";
    Object.keys(z).forEach(function (f) { if (z[f] > z[best]) best = f; });
    return z[best] >= 0.7 ? { id: FINGER_PLANET[best], finger: best, z: z[best] } : { id: "balanced", finger: null, z: z[best] };
  }

  /* ---------- มือซ้าย/ขวา ----------
     ภาพทุกภาพที่ตรวจเป็นภาพดิบจากกล้อง (ไม่กลับซ้าย-ขวา แม้พรีวิวกล้องหน้าจะแสดงแบบกระจก)
     เมื่อเห็นด้านฝ่ามือในภาพดิบ: มือขวา = ลำดับ นิ้วชี้→นิ้วก้อย หมุนตามเข็มนาฬิกาเทียบแนว ข้อมือ→โคนนิ้ว (นิ้วชี้อยู่ขวาเมื่อนิ้วชี้ขึ้น)
     นิ้วโป้งต้องอยู่ฝั่งนิ้วชี้ของแกนฝ่ามือ ใช้ตรวจว่าจุดของโมเดลเรียงถูก */
  function handChirality(h) {
    var U = [h.mcp.pinky[0] - h.mcp.index[0], h.mcp.pinky[1] - h.mcp.index[1]];
    var M = lerp(h.mcp.index, h.mcp.pinky, 0.5), d = [M[0] - h.wrist[0], M[1] - h.wrist[1]];
    var cr = U[0] * d[1] - U[1] * d[0], n = cr / ((Math.hypot(U[0], U[1]) * Math.hypot(d[0], d[1])) || 1);
    var thumbOk = null;
    if (h.tip.thumb) { var t = [h.tip.thumb[0] - M[0], h.tip.thumb[1] - M[1]]; thumbOk = (t[0] * U[0] + t[1] * U[1]) < 0; }
    return { side: cr > 0 ? "right" : "left", conf: round(clamp(Math.abs(n), 0, 1) * (thumbOk === false ? 0.5 : 1), 3), thumbOk: thumbOk };
  }
  /** มือข้างไหน (สมมติว่าเห็นด้านฝ่ามือ ภาพไม่กลับซ้ายขวา) — คงไว้เพื่อความเข้ากันได้ */
  function guessSide(h) { return handChirality(h).side; }
  var flipSide = function (s) { return s === "left" ? "right" : s === "right" ? "left" : s; };
  /** ตัดสินข้างมือ: o = { hand | pts, handedness?: คะแนนดิบของโมเดล, mirrored?: พิกัดมาจากภาพที่กลับซ้าย-ขวาแล้ว }
      เรขาคณิตของจุดเป็นหลัก (เชื่อถือได้เมื่อ conf ≥ 0.2); ป้ายของโมเดลใช้เมื่อเรขาคณิตกำกวม
      MediaPipe Hands รายงาน handedness โดยถือว่าภาพเข้า "กลับแบบกระจกแล้ว" (กล้องหน้า/เซลฟี): คะแนน = โอกาสเป็นมือขวาในภาพกระจก
      ภาพดิบที่ไม่กลับด้านจึงต้องกลับป้าย → คืน { side, conf, source: "geometry"|"model", agree, maybeBack } */
  function resolveSide(o) {
    var h = o.hand || handFromLandmarks(o.pts), g = handChirality(h), mir = !!o.mirrored;
    var gs = mir ? flipSide(g.side) : g.side, ms = null, mc = 0;
    if (typeof o.handedness === "number" && isFinite(o.handedness)) {
      var asMirrored = o.handedness >= 0.5 ? "right" : "left"; // ตามแบบแผนของ MediaPipe
      ms = mir ? asMirrored : flipSide(asMirrored);
      mc = Math.abs(o.handedness - 0.5) * 2;
    }
    var agree = ms ? ms === gs : null;
    if (g.conf >= 0.2 || !ms) return { side: gs, conf: g.conf, source: "geometry", agree: agree, maybeBack: agree === false && mc > 0.8 && g.conf >= 0.2, thumbOk: g.thumbOk };
    return { side: ms, conf: round(mc * 0.6, 3), source: "model", agree: agree, maybeBack: false, thumbOk: g.thumbOk };
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
    /** @type {any[][]} */
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
    var ta = thumbAngleCat(o.hm), pk = pinkyCat(o.hm), fd = fingerDom(o.hm), spc = spreadCat(o.hm);
    var est = o.est ? o.est.ranked.map(function (r) { var d = KB.mounts[r.id], bg = KB.bagua[KB.mountBagua[r.id]]; return { id: r.id, th: d.th, under: d.under, level: r.level, top: o.est.top.indexOf(r.id) >= 0, meaning: d.meaning, bagua: bg ? { id: KB.mountBagua[r.id], th: bg.th, cn: bg.cn, theme: bg.theme } : null }; }) : [];
    return {
      thumbAngle: ta === "na" ? null : { cat: ta, label: KB.thumbAngle[ta].label, meaning: KB.thumbAngle[ta].meaning },
      pinky: { cat: pk, label: KB.pinky[pk].label, meaning: KB.pinky[pk].meaning },
      fingerDom: { cat: fd.id, label: KB.fingerDom[fd.id].label, planet: KB.fingerDom[fd.id].planet, meaning: KB.fingerDom[fd.id].meaning },
      spread: spc === "na" ? null : { cat: spc, label: KB.spread[spc].label, meaning: KB.spread[spc].meaning },
      mountsEst: est,
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
    var est = KB ? estimateMounts(hm, lc, o.R || null, o.F || null) : null;
    var reading = KB ? buildReading({ el: el, hm: hm, lc: lc, est: est, minor: o.minor, mounts: o.mounts, isDominant: o.isDominant, seed: o.seed }) : null;
    return { hm: hm, el: el, lc: lc, mounts: est, side: o.side || null, reading: reading };
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
  var SHAPE_Z = 0.5; // ตรงกับเกณฑ์ของ rel(): |z| < 0.5 = "ใกล้ค่าทั่วไป"
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
    // รูปฝ่ามือ/นิ้ว: แยกเป็นข้อเฉพาะเมื่อค่าห่างค่าทั่วไปพอ (|z| ≥ SHAPE_Z) — ถ้าใกล้ค่าทั่วไป คำว่า "ทรงยาว/ทรงเหลี่ยม"
    // จะขัดกับหลักฐาน "ใกล้ค่าทั่วไป" (ธาตุประจำมือยังสรุปรูปมือไว้แล้ว)
    if (Math.abs(el.zp) >= SHAPE_Z) add("shape.palm." + el.palmShape, "รูปฝ่ามือ", el.palmShape === "long" ? "ฝ่ามือทรงยาว" : "ฝ่ามือทรงเหลี่ยม", tpl(EV["shape.palm"], { palmRatio: fx(hm.palmRatio), rel: rel(el.zp, "ยาว", "สั้น") }), clamp(0.22 + 0.14 * Math.abs(el.zp), 0.2, 0.7));
    if (Math.abs(el.zf) >= SHAPE_Z) add("shape.fingers." + el.fingerShape, "นิ้วมือ", el.fingerShape === "long" ? "นิ้วเรียวยาว" : "นิ้วสั้นกระชับ", tpl(EV["shape.fingers"], { fingerPct: fx(hm.fingerRatio * 100, 0), rel: rel(el.zf, "ยาว", "สั้น") }), clamp(0.22 + 0.14 * Math.abs(el.zf), 0.2, 0.7));
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
      // ยาว/สั้น จัดจากตำแหน่งปลายเส้น จึงบอกตำแหน่งปลายเส้น (ไม่ใช่ "ยาว x เท่า" ซึ่งอ่านแล้วขัดกับหมวด "สั้น")
      if (id === "life" && (c === "long" || c === "short") && mm.end) return "ปลายเส้นชีวิตลงไปถึง " + pct(mm.end[1]) + "% ของความยาวฝ่ามือ ถือว่า" + (c === "long" ? "ลงไปลึกใกล้ข้อมือ" : "จบก่อนถึงข้อมือ");
      if (id === "head" && (c === "long" || c === "short" || c === "medium") && mm.end) return "ปลายเส้นสมองไปถึง " + pct(mm.end[0]) + "% ของความกว้างฝ่ามือ ถือว่า" + (c === "long" ? "ยาว" : c === "short" ? "สั้น" : "ยาวปานกลาง");
      if (id === "fate" && c === "long" && mm.start && mm.end) return "เส้นวาสนาขึ้นไปเกือบถึงโคนนิ้ว เหลือห่างเพียง " + pct(Math.min(mm.start[1], mm.end[1])) + "% ของความยาวฝ่ามือ";
      return "ความยาว" + th + " " + fx(mm.length) + " เท่าของความกว้างฝ่ามือ";
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
    var ta = thumbAngleCat(hm);
    if (ta !== "na") add("thumbangle." + ta, "มุมนิ้วโป้ง", KB.thumbAngle[ta].label, tpl(EV.thumbAngle, { deg: fx(hm.thumbAngle, 0) }), ta === "medium" ? 0.3 : 0.5);
    var pk = pinkyCat(hm);
    add("pinky." + pk, "นิ้วก้อย", KB.pinky[pk].label, tpl(EV.pinky, { pct: fx(hm.pinkyRing * 100, 0) }), pk === "medium" ? 0.26 : 0.46);
    var fdm = fingerDom(hm), FD = KB.fingerDom[fdm.id];
    add("fingerdom." + fdm.id, "นิ้วเด่น", FD.label, fdm.id === "balanced" ? "นิ้วทั้งสี่ยาวใกล้ค่าทั่วไป" : tpl(EV.fingerDom, { finger: FD.finger, pct: fx(hm.fingers[fdm.finger] * 100, 0), rel: rel(fdm.z, "ยาว", "สั้น") }),
      fdm.id === "balanced" ? 0.3 : clamp(0.36 + 0.08 * fdm.z, 0.36, 0.64));
    var spc = spreadCat(hm);
    if (spc !== "na") add("spread." + spc, "ระยะห่างนิ้ว", KB.spread[spc].label, tpl(EV.spread, { deg: fx(hm.spread, 0) }), spc === "medium" ? 0.24 : 0.42);
    var minor = opt.minor || {};
    Object.keys(KB.minor).forEach(function (k) {
      if (minor[k] !== true && minor[k] !== false) return;
      var d = KB.minor[k];
      add("minor." + k + "." + (minor[k] ? "yes" : "no"), "เส้นรอง", d.th.replace(/\s*\(.*\)/, "") + (minor[k] ? "ซึ่งเห็นชัด" : "ซึ่งยังไม่เด่น"), tpl(EV.minor, { th: d.th.replace(/\s*\(.*\)/, ""), seen: minor[k] ? "เห็นชัด" : "ยังไม่เห็นชัด" }), minor[k] ? 0.6 : 0.28);
    });
    // เนิน: ที่ผู้ใช้เลือก + ที่ประเมินจากภาพ (รหัสเดียวกัน รวมหลักฐาน) แล้วต่อด้วยตำแหน่งแปดทิศของเนินแรก ๆ
    var chosen = (opt.mounts || []).filter(function (k) { return KB.mounts[k]; }), est = R.mounts ? R.mounts.top : [];
    var mids = chosen.concat(est.filter(function (k) { return chosen.indexOf(k) < 0 && KB.mounts[k]; }));
    mids.forEach(function (k) {
      var d = KB.mounts[k], picked = chosen.indexOf(k) >= 0, e = est.indexOf(k) >= 0, lvl = R.mounts ? R.mounts.level[k] : null;
      var ev = [picked ? tpl(EV.mount, { th: d.th, under: d.under }) : "", e && lvl != null ? tpl(EV.mountEst, { th: d.th, level: lvl }) : ""].filter(Boolean).join(" · ");
      add("mount." + k, "เนินบนฝ่ามือ", d.th + (picked ? "อิ่มเด่น" : "ค่อนข้างเด่น"), ev, picked ? (e ? 0.62 : 0.55) : clamp(0.3 + (lvl || 50) / 400, 0.3, 0.52));
    });
    var palaces = [];
    mids.slice(0, 2).forEach(function (k) { var b = KB.mountBagua && KB.mountBagua[k]; if (b && palaces.indexOf(b) < 0 && I["bagua." + b]) palaces.push(b); });
    palaces.forEach(function (b, i) {
      var B = KB.bagua[b];
      add("bagua." + b, "ผังแปดทิศ", "ตำแหน่ง" + B.th, tpl(EV.bagua, { area: B.area, th: B.th + " " + B.cn }), i ? 0.3 : 0.38);
    });
    // โหมดดูทั้งสองมือ: มือที่สองได้หัวข้อ "เทียบสองมือ" ให้ตัวเรียบเรียงเล่าเชื่อมกับมือแรก
    if (opt.compare && opt.compare.first) {
      var cm = compareHands(opt.compare.first, R), sm = cm.similar ? "same" : "shift";
      add("compare." + sm, "เทียบสองมือ", cm.similar ? "สองมือคล้ายกัน" : "สองมือต่างกันอย่างน่าสนใจ",
        tpl(EV.compare, { a: opt.compare.sideA || "มือแรก", b: opt.compare.sideB || "มือที่สอง" }) + " เหมือนกัน " + cm.same + " จาก " + cm.total + " หัวข้อ", 0.66);
    }
    // short = ชื่อย่อที่ตัวเรียบเรียงใช้หลังเอ่ยชื่อเต็มครั้งแรก เช่น "เส้นหัวใจแบบค่อนข้างตรง" → "เส้นหัวใจ"
    items.forEach(function (it) {
      var sh = it.label.replace(/(แบบ|ซึ่ง|อิ่มเด่น|ค่อนข้าง|ยาวใกล้เคียง|ทรง|สั้นกระชับ|ยาวเรียว).*$/, "").trim();
      if (sh && sh !== it.label && sh.length >= 3) it.short = sh;
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

  /* ================= หลายมือในภาพ: เลือกมือในกรอบนำทาง ================= */
  var GUIDE_C = { x: 0.5, y: 0.5 };
  /** กรอบรอบจุด 21 จุด (px) */
  function handBox(pts) {
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 };
  }
  /** เลือกมือหลักจาก hands = [{box:{x,y,w,h} (px)}]: มือเดิม (IoU ≥ 0.3 กับ prevBox 0..1) ไม่เช่นนั้นมือที่ใกล้กลางกรอบนำทาง → {index, n, boxN} */
  function pickHand(hands, prevBox, W, H) {
    hands = hands || [];
    var boxes = hands.map(function (h) { return LQT.toNorm(h.box, W, H); });
    var r = LQT.pickPrimary(boxes, prevBox || null, { minIou: 0.3, prefer: /** @type {any} */ (GUIDE_C) });
    return { index: r.index, n: r.n, continuity: r.continuity, boxN: r.index >= 0 ? boxes[r.index] : null };
  }
  /** มือแบสมมติ 21 จุดในกรอบ box (px) — ใช้กับตัวตรวจจับจำลองในการทดสอบเท่านั้น
      side: "left" (ค่าเดิม — นิ้วชี้อยู่ซ้ายในภาพดิบ) หรือ "right" (กลับซ้าย-ขวาในกรอบ) */
  function synthHand(box, side) {
    var u = [[0.5, 1], [0.3, 0.9], [0.18, 0.78], [0.1, 0.66], [0.05, 0.56], [0.32, 0.5], [0.32, 0.33], [0.32, 0.2], [0.32, 0.08],
      [0.47, 0.48], [0.47, 0.3], [0.47, 0.15], [0.47, 0], [0.62, 0.5], [0.62, 0.33], [0.62, 0.2], [0.62, 0.08], [0.76, 0.55], [0.76, 0.43], [0.76, 0.33], [0.76, 0.24]];
    var w = box.w != null ? box.w : box.width, h = box.h != null ? box.h : box.height, R = side === "right";
    return u.map(function (q) { return [box.x + (R ? 1 - q[0] : q[0]) * w, box.y + q[1] * h]; });
  }

  /* ================= กรอบนำทางรูปมือ (มือซ้าย/ขวา) ================= */
  /** แม่แบบมือซ้ายแบฝ่ามือเข้าหากล้อง ในภาพดิบ (นิ้วชี้อยู่ซ้าย) หน่วย = ความกว้างโคนนิ้วชี้→ก้อย ≈ 1, ข้อมือที่ (0,0), แกน y ชี้ลง
      สัดส่วนตรงกับ NORMS: ฝ่ามือยาว 1.62 เท่าของความกว้าง นิ้วยาวตามค่าทั่วไป นิ้วโป้งกาง ~45° */
  var GUIDE_HAND = (function () {
    var p = new Array(21);
    p[0] = [0, 0]; p[1] = [-0.36, -0.22]; p[2] = [-0.78, -0.48]; p[3] = [-1.1, -0.75]; p[4] = [-1.36, -0.98];
    /** @type {any[]} */
    var F = [[5, [-0.5, -1.55], -10, NORMS.fingers.index], [9, [-0.16, -1.62], 0, NORMS.fingers.middle], [13, [0.18, -1.56], 8, NORMS.fingers.ring], [17, [0.5, -1.42], 18, NORMS.fingers.pinky]];
    var palmL = Math.hypot(0.16, 1.62);
    F.forEach(function (f) {
      var a = f[2] * Math.PI / 180, d = [Math.sin(a), -Math.cos(a)], L = f[3] * palmL;
      p[f[0]] = f[1];
      [0.45, 0.75, 1].forEach(function (t, k) { p[f[0] + 1 + k] = [f[1][0] + d[0] * L * t, f[1][1] + d[1] * L * t]; });
    });
    return p;
  })();
  var GUIDE_R = { thumb: 0.17, index: 0.14, middle: 0.145, ring: 0.135, pinky: 0.12 };
  /** เส้นรอบรูปมือ (ฝ่ามือ + นิ้วห้านิ้ว) จากจุด 21 จุดในหน่วยแม่แบบของมือซ้าย → จุดของรูปปิด */
  function handContour(p) {
    var out = [], sub = function (a, b) { return [a[0] - b[0], a[1] - b[1]]; }, nrm = function (v) { var l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    var add = function (a, v, k) { return [a[0] + v[0] * k, a[1] + v[1] * k]; };
    var fing = /** @type {any[]} */ ([["pinky", 17], ["ring", 13], ["middle", 9], ["index", 5]]).map(function (f) {
      var b = p[f[1]], t = p[f[1] + 3], d = nrm(sub(t, b)), n = [-d[1], d[0]], r = GUIDE_R[f[0]];
      return { b: b, t: t, d: d, n: n, r: r };
    });
    var arc = function (c, d, n, r, from) { for (var k = 0; k <= 8; k++) { var a = Math.PI * k / 8, v = [n[0] * Math.cos(a) * from + d[0] * Math.sin(a), n[1] * Math.cos(a) * from + d[1] * Math.sin(a)]; out.push([c[0] + v[0] * r, c[1] + v[1] * r]); } };
    var web = 0.3;
    out.push([0.42, 0.06], [0.6, -0.55], [0.64, -1.05]);
    fing.forEach(function (f, i) {
      // ขอบฝั่งนิ้วก้อย (+n) ขึ้นไป → โค้งปลายนิ้ว → ขอบฝั่งนิ้วชี้ (−n) ลงมาถึงง่ามนิ้ว
      var start = i === 0 ? add(add(f.b, f.n, f.r), f.d, 0.05) : add(add(f.b, f.n, f.r), f.d, web);
      out.push(start);
      var c = add(f.t, f.d, -f.r * 0.5);
      arc(c, f.d, f.n, f.r, 1);
      if (i < fing.length - 1) {
        var g = fing[i + 1], a = add(add(f.b, f.n, -f.r), f.d, web), b = add(add(g.b, g.n, g.r), g.d, web);
        out.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.04]);
      } else out.push(add(add(f.b, f.n, -f.r), f.d, 0.02));
    });
    // ง่ามนิ้วโป้ง → นิ้วโป้ง (ขอบบน → ปลาย → ขอบล่าง) → เนินฐานนิ้วโป้ง → ข้อมือ
    var tb = p[2], tt = p[4], td = nrm(sub(tt, tb)), tn = [td[1], -td[0]], r = GUIDE_R.thumb;
    if (tn[1] > 0) tn = [-tn[0], -tn[1]]; // ให้ tn ชี้ไปทางนิ้วชี้ (ขึ้นบน)
    out.push([(p[5][0] + tb[0]) / 2 + 0.02, (p[5][1] + tb[1]) / 2 - 0.02], add(p[2], tn, r), add(p[3], tn, r));
    arc(add(tt, td, -r * 0.5), td, tn, r, 1);
    out.push(add(p[3], tn, -r), add(p[2], tn, -r * 1.15), add(p[1], tn, -r * 1.4), [-0.46, 0.06]);
    return out;
  }
  var GUIDE_CONTOUR = handContour(GUIDE_HAND);
  /** กรอบนำทางสำหรับมือ side ในภาพขนาด W×H (พิกเซลของภาพดิบ)
      opt.mirrored = พรีวิวแสดงแบบกระจก (กล้องหน้า) → display = พิกัดที่ผู้ใช้เห็นบนจอ (raw กลับซ้าย-ขวา)
      ผืนวาด (overlay) ถูกกลับด้านด้วย CSS พร้อมวิดีโอ จึงวาดด้วย raw เสมอ แล้วรูปที่เห็นจะตรงกับมือในพรีวิว
      ขนาดปรับตามสัดส่วนภาพ: มือ (รวมนิ้ว) กว้างไม่เกิน 62% และสูงไม่เกิน 84% ของภาพ */
  function guideTemplate(side, W, H, opt) {
    opt = opt || {};
    var sx = side === "right" ? -1 : 1, xs = GUIDE_CONTOUR.map(function (q) { return q[0] * sx; }), ys = GUIDE_CONTOUR.map(function (q) { return q[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var fill = opt.fill || 1, k = Math.min(W * 0.62 / (x1 - x0), H * 0.84 / (y1 - y0)) * fill;
    var ox = W / 2 - (x0 + x1) / 2 * k, oy = H * 0.5 - (y0 + y1) / 2 * k;
    var T = function (q) { return [ox + q[0] * sx * k, oy + q[1] * k]; };
    var raw = GUIDE_HAND.map(T), contour = GUIDE_CONTOUR.map(T);
    var disp = function (pp) { return opt.mirrored ? pp.map(function (q) { return [W - q[0], q[1]]; }) : pp.map(function (q) { return [q[0], q[1]]; }); };
    return { side: side, W: W, H: H, mirrored: !!opt.mirrored, scale: k, palmW: dist(raw[5], raw[17]), raw: raw, contour: contour, display: disp(raw), displayContour: disp(contour),
      // มือที่ผู้ใช้เห็นบนจอ: นิ้วโป้งอยู่ฝั่งไหน (สำหรับข้อความ/ทดสอบ)
      thumbOnScreen: (disp(raw)[4][0] < W / 2) ? "left" : "right" };
  }
  var FIT_IDX = [0, 1, 2, 4, 5, 8, 9, 12, 13, 16, 17, 20];
  /** ความตรงกรอบ 0..1: ระยะเฉลี่ยของจุดสำคัญ (ข้อมือ โคนนิ้ว ปลายนิ้ว) จากแม่แบบ หารด้วยความกว้างฝ่ามือของแม่แบบ */
  function fitScore(pts, tpl) {
    if (!pts || !tpl) return 0;
    var s = 0; FIT_IDX.forEach(function (i) { s += dist(pts[i], tpl.raw[i]); });
    return round(clamp(1 - s / FIT_IDX.length / (tpl.palmW * 0.9), 0, 1), 3);
  }

  /* ================= เนิน (ประเมินจากภาพ) + ผังแปดทิศ ================= */
  var MOUNT_IDS = ["jupiter", "saturn", "sun", "mercury", "venus", "moon", "mars"];
  /** คะแนนความเด่นของเนินทั้งเจ็ด: นิ้วที่ตรงกับเนิน (ตำราตะวันตก: นิ้วยาว ↔ เนินใต้นิ้วเด่น), รูปเส้นรอบเนิน
      (เส้นชีวิตโค้งกว้าง ↔ เนินศุกร์, เส้นสมองลาดลง ↔ เนินจันทร์, ช่องกลางมือกว้าง ↔ ที่ราบอังคาร) และความเรียบของผิวในภาพ (เส้นยิบน้อย = อิ่ม)
      คืน { ranked: [{id, score, level}], level: {id: 0..100}, top: [id…] (1–2 เนิน) } */
  function estimateMounts(hm, lc, R, F) {
    var z = fingerZ(hm), M = (lc && lc.m) || {}, sc = {};
    var tz = hm.thumbRatio == null ? 0 : (hm.thumbRatio - NORMS.thumb) / NORMS.thumbSd;
    var az = hm.thumbAngle == null ? 0 : (hm.thumbAngle - NORMS.thumbAngle) / NORMS.thumbAngleSd;
    var pz = (hm.pinkyRing - NORMS.pinkyRing) / NORMS.pinkyRingSd, zp = (hm.palmRatio - NORMS.palm) / NORMS.palmSd;
    sc.jupiter = z.index; sc.saturn = z.middle; sc.sun = z.ring; sc.mercury = 0.6 * z.pinky + 0.4 * pz;
    sc.venus = 0.4 * tz + (M.life ? clamp((M.life.maxU - 0.3) / 0.05, -2.5, 2.5) * 0.6 : 0);
    sc.moon = 0.3 * zp + (M.head && M.head.angle != null ? clamp((M.head.angle - 20) / 9, -2.5, 2.5) * 0.7 : 0);
    var gap = 0;
    if (M.head && M.heart) {
      var vAt = function (sp) { var b = sp[0]; sp.forEach(function (q) { if (Math.abs(q[0] - 0.5) < Math.abs(b[0] - 0.5)) b = q; }); return b[1]; };
      gap = clamp(((vAt(M.head.sp) - vAt(M.heart.sp)) - 0.24) / 0.07, -2.5, 2.5);
    }
    sc.mars = 0.35 * az + 0.25 * tz + 0.4 * gap;
    if (R && F) { // ความเรียบของผิว: ค่าตอบสนองเส้นเฉลี่ยรอบตำแหน่งเนิน (น้อย = เรียบ/อิ่ม) เทียบกับเนินอื่น
      var tex = {}, vals = [];
      MOUNT_IDS.forEach(function (k) {
        var c = KB && KB.mounts[k] ? KB.mounts[k].pos : [0.5, 0.5], s = 0, n = 0;
        for (var du = -0.08; du <= 0.081; du += 0.04) for (var dv = -0.06; dv <= 0.061; dv += 0.03) { var px = F.uvToPx([c[0] + du, c[1] + dv]); s += sample(R, px[0], px[1]); n++; }
        tex[k] = s / n; vals.push(tex[k]);
      });
      var mu = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length, sd = Math.sqrt(vals.reduce(function (a, b) { return a + (b - mu) * (b - mu); }, 0) / vals.length) || 1;
      MOUNT_IDS.forEach(function (k) { sc[k] += 0.4 * clamp(-(tex[k] - mu) / sd, -2, 2); });
    }
    var level = {}, ranked = MOUNT_IDS.map(function (k) { var l = Math.round(100 * sigmoid(sc[k] * 0.9)); level[k] = l; return { id: k, score: round(sc[k], 3), level: l }; })
      .sort(function (a, b) { return b.score - a.score; });
    var top = ranked.filter(function (r) { return r.score >= 0.45; }).slice(0, 2).map(function (r) { return r.id; });
    if (!top.length) top = [ranked[0].id];
    return { ranked: ranked, level: level, top: top };
  }

  /* ================= เทียบสองมือ (ศักยภาพที่ติดตัว ↔ สิ่งที่สร้างขึ้นเอง) ================= */
  /** a = ผล analyze() ของมือที่ติดตัว (ไม่ถนัด), b = ของมือที่สร้างเอง (ถนัด) → แถวเทียบ + ร้อยละที่เหมือน */
  function compareHands(a, b) {
    var rows = [], lab = function (id, c) { return KB.lines[id] && KB.lines[id].cats[c] ? KB.lines[id].cats[c].label : c; };
    var push = function (key, th, va, vb, ta, tb) { rows.push({ key: key, th: th, a: ta, b: tb, same: va === vb }); };
    var ea = a.el.top.id, eb = b.el.top.id;
    push("element", "ธาตุประจำมือ", ea, eb, "ธาตุ" + KB.elements[ea].th, "ธาตุ" + KB.elements[eb].th);
    LINE_IDS.forEach(function (id) {
      var ca = (a.lc.cats[id] || [])[0], cb = (b.lc.cats[id] || [])[0];
      if (ca && cb) push(id, KB.lines[id].th, ca, cb, lab(id, ca), lab(id, cb));
    });
    var fa = fingerCat(a.hm), fb = fingerCat(b.hm);
    push("finger", "นิ้วชี้กับนิ้วนาง", fa, fb, KB.fingers[fa].label, KB.fingers[fb].label);
    var da = fingerDom(a.hm).id, db = fingerDom(b.hm).id;
    push("fingerDom", "นิ้วเด่น", da, db, KB.fingerDom[da].label, KB.fingerDom[db].label);
    var ta = thumbAngleCat(a.hm), tb = thumbAngleCat(b.hm);
    if (ta !== "na" && tb !== "na") push("thumbAngle", "มุมนิ้วโป้ง", ta, tb, KB.thumbAngle[ta].label, KB.thumbAngle[tb].label);
    var ma = a.mounts ? a.mounts.top[0] : null, mb = b.mounts ? b.mounts.top[0] : null;
    if (ma && mb) push("mount", "เนินที่เด่น", ma, mb, KB.mounts[ma].th, KB.mounts[mb].th);
    var same = rows.filter(function (r) { return r.same; }).length;
    return { rows: rows, same: same, total: rows.length, similarity: rows.length ? round(same / rows.length, 3) : 1, similar: rows.length ? same / rows.length >= 0.6 : true };
  }
  /** ย่อหน้าเทียบสองมือ (เชิงบวก) — opt = { sideA: "มือซ้าย", sideB: "มือขวา", seed } → { title, paragraphs, cmp } */
  function buildComparison(a, b, opt) {
    opt = opt || {};
    var C = KB.compare, cmp = compareHands(a, b), seed = (opt.seed || 0) >>> 0, k = 0;
    var pick = function (arr) { var v = arr[(seed + 7 * k++) % arr.length]; return v; };
    var A = opt.sideA || "มือที่ติดตัว", B = opt.sideB || "มือที่สร้างเอง";
    var V = { a: A, b: B };
    var P = [tpl(pick(C.intro), V)], el = cmp.rows[0];
    P.push(el.same ? tpl(pick(C.sameEl), { el: KB.elements[a.el.top.id].th }) : tpl(pick(C.diffEl), { a: A, b: B, elA: KB.elements[a.el.top.id].th, elB: KB.elements[b.el.top.id].th }));
    var lr = cmp.rows.filter(function (r) { return LINE_IDS.indexOf(r.key) >= 0; });
    var diff = lr.filter(function (r) { return !r.same; }).slice(0, 2), same = lr.filter(function (r) { return r.same; }).slice(0, diff.length ? 1 : 2);
    diff.forEach(function (r) { P.push(tpl(pick(C.diffLine), { line: r.th, a: A, b: B, ca: r.a.replace(/^ปลายเส้น/, ""), cb: r.b.replace(/^ปลายเส้น/, "") })); });
    same.forEach(function (r) { P.push(tpl(pick(C.sameLine), { line: r.th })); });
    var mr = cmp.rows.filter(function (r) { return r.key === "mount"; })[0];
    if (mr) P.push(mr.same ? tpl(pick(C.sameMounts), { ma: mr.a }) : tpl(pick(C.mounts), { ma: mr.a, mb: mr.b }));
    P.push(pick(C.closing));
    return { title: C.title, paragraphs: P, cmp: cmp };
  }

  var PalmCore = {
    handBox: handBox, pickHand: pickHand, synthHand: synthHand, GUIDE_C: GUIDE_C,
    buildFacts: buildFacts, TOPIC_IDS: TOPIC_IDS,
    DET: DET, LM: LM, NORMS: NORMS, CANON: CANON, TEMPLATES: TEMPLATES, LINE_IDS: LINE_IDS, TRACE: TRACE, LT: LT, ELEMENTS: ELEMENTS, TAP_ORDER: TAP_ORDER,
    dist: dist, lerp: lerp, round: round, ssdAnchors: ssdAnchors, decodePalms: decodePalms, nms: nms, iou: iou, letterbox: letterbox, unletterbox: unletterbox,
    palmRoi: palmRoi, landmarksRoi: landmarksRoi, roiCropMatrix: roiCropMatrix, projectLandmarks: projectLandmarks,
    handFromLandmarks: handFromLandmarks, handFromTaps: handFromTaps, measureHand: measureHand, handElement: handElement, fingerCat: fingerCat, thumbCat: thumbCat, guessSide: guessSide,
    handChirality: handChirality, resolveSide: resolveSide, flipSide: flipSide, angleBetween: angleBetween,
    thumbAngleCat: thumbAngleCat, pinkyCat: pinkyCat, spreadCat: spreadCat, fingerDom: fingerDom, fingerZ: fingerZ,
    GUIDE_HAND: GUIDE_HAND, guideTemplate: guideTemplate, handContour: handContour, fitScore: fitScore,
    MOUNT_IDS: MOUNT_IDS, estimateMounts: estimateMounts, compareHands: compareHands, buildComparison: buildComparison,
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
  /* ---------- ภาษา (TH ค่าเริ่มต้น | 中文): ข้อความไทยอยู่ในโค้ด/KB, ภาษาจีนจาก i18n/zh-fortune-palm.js และ i18n/zh-kb-palm.js ---------- */
  /** @param {string} k @param {string} th @param {Record<string, any>} [v] */
  var T = function (k, th, v) { return window.LQI18N ? window.LQI18N.tf(k, th, v) : th.replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var isZh = function () { return !!(window.LQI18N && window.LQI18N.lang === "zh"); };
  /** ข้อความจาก KB (palm-kb.js) → คีย์ palm.kb.<path> ในพจนานุกรมภาษาจีน */
  var KT = function (path, th) { return T("palm.kb." + path, th); };
  var isEn = function () { return !!(window.LQI18N && /** @type {string} */ (window.LQI18N.lang) === "en"); };
  /** โหมดแปล (จีน/อังกฤษ): คลัง zh-kb-palm.js / en-kb-palm.js มีคีย์และช่องเดียวกัน */
  var trL = function () { return isZh() || isEn(); };
  var ZI = function (key) { var z = isEn() ? window.FORTUNE_EN && window.FORTUNE_EN.palm : window.FORTUNE_ZH && window.FORTUNE_ZH.palm; return (z && z.items && z.items[key]) || null; };
  var capL = function (t) { return isEn() && typeof t === "string" ? t.charAt(0).toUpperCase() + t.slice(1) : t; };
  /** ความหมายภาษาจีนจาก zh-kb (ช่องแรกที่มีตามลำดับ order) — โหมดไทยคืนข้อความเดิม */
  var ZM = function (key, th, order) {
    if (!trL()) return th;
    var it = ZI(key); if (!it) return th;
    var o = (order || "opwlmcta").split("");
    for (var i = 0; i < o.length; i++) if (it[o[i]]) return capL([].concat(it[o[i]])[0]);
    return th;
  };
  var HTTPS_MSG = "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด";
  var STATS_KEY = "palm-stats", PREF_KEY = "palm-prefs", IDLE_MS = 60000, MODEL_DIR = "vendor/models/hand/";
  var lsGet = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* โหมดส่วนตัว */ } };
  var prefs = Object.assign({ stats: true, dom: "right", sideMode: "auto" }, lsGet(PREF_KEY, {}));
  if (["left", "right", "auto", "both"].indexOf(prefs.sideMode) < 0) prefs.sideMode = "auto";

  var video = $("#plVideo"), cam = $("#plCam"), ov = $("#plOverlay"), octx = ov.getContext("2d");
  var btnCam = $("#plStartCam"), btnSnap = $("#plSnap"), fileIn = $("#plFile"), countEl = $("#plCount");
  var editSec = $("#plEdit"), resultSec = $("#plResult"), edCv = $("#plEditCanvas"), resCanvas = $("#plResCanvas");
  // sideMode: left | right | auto | both — side: ข้างที่อ่านในรอบนี้, sideSrc: manual | detect, liveSide: ข้างที่เห็นสด ๆ จากกล้อง
  // pair/pairStep: โหมดทั้งสองมือ (มือที่ 1 = ศักยภาพที่ติดตัว, มือที่ 2 = สิ่งที่สร้างขึ้นเอง) · cmp: ผลเทียบสองมือ
  var S = { sideMode: prefs.sideMode, side: "right", sideSrc: "manual", sideDet: null, sideMismatch: null, liveSide: null, liveCand: null, liveCount: 0, guide: null,
    pair: [], pairStep: 0, cmp: null, cmpFirst: null, dom: prefs.dom, src: null, hand: null, F: null, canon: null, R: null, auto: null, lines: null, active: "life", minor: {}, mounts: [], mode: "edit", taps: [], result: null, busy: false };
  var ready = false, models = null, looping = false;

  /** msg = ข้อความ หรือฟังก์ชันที่คืนข้อความ (ฟังก์ชันจะถูกเรียกใหม่เมื่อเปลี่ยนภาษา) */
  var lastEngine = null;
  function engine(msg, cls) {
    lastEngine = [msg, cls];
    var e = $("#plEngine"); e.textContent = typeof msg === "function" ? msg() : msg; e.className = "pl-engine " + (cls || "");
  }
  function setStep(n) { $$(".pl-steps li").forEach(function (li) { var k = +li.dataset.step; li.classList.toggle("on", k === n); li.classList.toggle("done", k < n); }); }
  var toastTimer = 0;
  function toast(msg) { var t = $("#plToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200); }
  var smooth = function () { return matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; };

  /* ---------- มือซ้าย/ขวา/อัตโนมัติ/ทั้งสองมือ + มือข้างถนัด ---------- */
  var SIDE_TH = { left: "มือซ้าย", right: "มือขวา" };
  /** ชื่อข้างมือสำหรับแสดงผล (SIDE_TH ภาษาไทยยังใช้กับ buildFacts/buildComparison) */
  var sideTh = function (s) { return T("palm.side." + s, SIDE_TH[s]); };
  var inbornSide = function () { return S.dom === "right" ? "left" : "right"; };
  var roleKey = function (side) { return side === S.dom ? "dominant" : "other"; };
  /** บทบาทของมือ {th, short, text} ตามภาษาที่เลือก */
  var roleOf = function (side) { var k = roleKey(side), d = KB.sides[k]; return { th: KT("sides." + k + ".th", d.th), short: KT("sides." + k + ".short", d.short), text: KT("sides." + k + ".text", d.text) }; };
  var roleInborn = function () { return KT("hands.roles.inborn", KB.hands.roles.inborn); };
  var roleMade = function () { return KT("hands.roles.made", KB.hands.roles.made); };
  /** ข้างที่ต้องการในรอบนี้ (null = อัตโนมัติ ตรวจจากภาพ) */
  function expectedSide() {
    if (S.sideMode === "left" || S.sideMode === "right") return S.sideMode;
    if (S.sideMode === "both") return S.pairStep === 0 ? inbornSide() : S.dom;
    return null;
  }
  /** ข้างของกรอบนำทาง: ข้างที่เลือก → ข้างที่ตรวจพบ (อัตโนมัติ) → ข้างที่ถนัด */
  var guideSide = function () { return expectedSide() || S.liveSide || S.dom; };
  function renderSide() {
    $$("[data-side]").forEach(function (b) { b.setAttribute("aria-checked", b.dataset.side === S.sideMode ? "true" : "false"); });
    $$("[data-dom]").forEach(function (b) { b.setAttribute("aria-checked", b.dataset.dom === S.dom ? "true" : "false"); });
    var exp = expectedSide(), html, H = KB.hands;
    if (S.sideMode === "both") {
      html = "<b>" + esc(T("palm.sn.both", "ดูทั้งสองมือ")) + "</b> — " + esc(T("palm.handN", "มือที่ {n}", { n: 1 })) + ": " + esc(sideTh(inbornSide()) + " (" + roleInborn() + ")") + " → " + esc(T("palm.handN", "มือที่ {n}", { n: 2 })) + ": " + esc(sideTh(S.dom) + " (" + roleMade() + ")") +
        '<br><small class="muted">' + esc(T("palm.sn.now", "ตอนนี้: มือที่ {n}/2", { n: S.pairStep + 1 })) + " · " + esc(sideTh(exp)) + "</small>";
    } else if (exp) {
      var d = roleOf(exp);
      html = "<b>" + esc(sideTh(exp) + " = " + d.th + " · " + d.short) + "</b> — " + esc(d.text);
    } else {
      html = "<b>" + esc(T("palm.sn.auto", "อัตโนมัติ")) + "</b> — " + esc(KT("hands.modes.auto.short", H.modes.auto.short)) + (S.liveSide ? " · " + esc(T("palm.sn.seeing", "ตอนนี้เห็น")) + " <b>" + esc(sideTh(S.liveSide)) + "</b> (" + esc(roleOf(S.liveSide).short) + ")" : "");
    }
    $("#plSideNote").innerHTML = html;
  }
  function resetPair() { S.pair = []; S.pairStep = 0; S.cmp = null; S.cmpFirst = null; renderPair(); }
  $$("[data-side]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (S.sideMode === b.dataset.side) return;
      S.sideMode = b.dataset.side; prefs.sideMode = S.sideMode; lsSet(PREF_KEY, prefs);
      resetPair(); renderSide(); touch();
    });
  });
  $$("[data-dom]").forEach(function (b) { b.addEventListener("click", function () { if (S.dom === b.dataset.dom) return; S.dom = b.dataset.dom; prefs.dom = S.dom; lsSet(PREF_KEY, prefs); if (S.pairStep === 0) resetPair(); renderSide(); if (S.hand) renderReadSide(); }); });
  function renderTradition() { $("#plTradition").innerHTML = KB.hands.tradition.map(function (t, i) { return "<li><b>" + esc(KT("hands.tradition." + i + ".k", t.k)) + ":</b> " + esc(KT("hands.tradition." + i + ".t", t.t)) + "</li>"; }).join(""); }
  renderTradition();
  /** ข้างที่ตรวจได้จากภาพ → ข้างที่จะอ่าน (ข้างที่เลือกไว้มาก่อน; อัตโนมัติใช้ผลตรวจ) */
  function applyDetectedSide(rs) {
    S.sideDet = rs;
    var exp = expectedSide();
    if (exp) { S.side = exp; S.sideSrc = "manual"; S.sideMismatch = rs && rs.conf >= 0.2 && rs.side !== exp ? rs.side : null; }
    else { S.side = rs ? rs.side : S.dom; S.sideSrc = rs ? "detect" : "manual"; S.sideMismatch = null; }
  }
  function renderReadSide() {
    var box = $("#plReadSide"); box.hidden = !S.hand;
    if (!S.hand) return;
    var d = roleOf(S.side);
    $("#plReadSideText").innerHTML = esc(T("palm.rs.reading", "กำลังอ่าน")) + " <b>" + esc(sideTh(S.side)) + "</b> " + esc(d.th + " · " + d.short) + (S.sideSrc === "detect" ? ' <small class="muted">' + esc(T("palm.fromImage", "(ตรวจจากภาพ)")) + "</small>" : "") +
      (S.sideMode === "both" ? ' <small class="muted">· ' + esc(T("palm.handNof2", "มือที่ {n}/2", { n: S.pairStep + 1 })) + "</small>" : "") +
      (S.sideMismatch ? '<span class="warn">' + esc(T("palm.rs.mismatch", "ภาพนี้ดูเหมือน{seen} แต่เลือกอ่าน{side}ไว้ — ถ้าถ่ายผิดข้าง กด ถ่ายใหม่ หรือสลับข้างได้", { seen: sideTh(S.sideMismatch), side: sideTh(S.side) })) + "</span>" : "");
    var swap = $("#plSideSwap");
    swap.textContent = T("palm.rs.swap", "สลับเป็น{side}", { side: sideTh(PC.flipSide(S.side)) });
    // the visible text is now the accessible name (WCAG 2.5.3); the static aria-label only covers the empty button at load
    swap.removeAttribute("aria-label"); swap.removeAttribute("data-i18n-attr");
  }
  $("#plSideSwap").addEventListener("click", function () {
    S.side = PC.flipSide(S.side); S.sideSrc = "manual";
    S.sideMismatch = S.sideDet && S.sideDet.conf >= 0.2 && S.sideDet.side !== S.side ? S.sideDet.side : null;
    renderReadSide(); touch();
  });
  /** ผลสด ๆ จากกล้อง: ข้างที่เห็นต้องตรงกัน 2 รอบติดก่อนเปลี่ยน (กันกระพริบ) */
  function updateLiveSide(rs) {
    if (!rs || rs.conf < 0.2) return;
    if (rs.side === S.liveCand) S.liveCount++; else { S.liveCand = rs.side; S.liveCount = 1; }
    if (S.liveCount >= 2 && S.liveSide !== rs.side) { S.liveSide = rs.side; renderSide(); }
  }
  renderSide();

  /* ---------- กล้อง (LQCam.create: กล้องหลัง 1920×1080 + ไฟฉาย; สำรองข้อจำกัดทีละขั้นโดยไม่ทิ้งความละเอียดที่ขอ) ---------- */
  /** ปุ่มไฟฉาย (เมื่อกล้องรองรับ) + สลับกล้อง + ตัวเลือกกล้อง (เมื่อมี ≥ 2 ตัว) วางทับมุมขวาบนของกรอบกล้อง */
  function mountCamCtl(host, c, onError) {
    var box = document.createElement("div"); box.className = "cam-ctl"; box.hidden = true;
    box.innerHTML = '<button type="button" class="cam-torch" aria-pressed="false" aria-label="เปิด/ปิดไฟฉาย" data-i18n-attr="aria-label:palm.cam.torchAria" hidden><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10l-2 6H9zM9 9v12h6V9M12 13v3"/></svg><span data-i18n="palm.cam.torch">ไฟฉาย</span></button>' +
      '<button type="button" class="cam-flip" aria-label="สลับกล้องหน้า/หลัง" title="สลับกล้องหน้า/หลัง" data-i18n-attr="aria-label:palm.cam.flipAria;title:palm.cam.flipAria"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h11l-3-3M20 16H9l3 3"/></svg><span data-i18n="palm.cam.flip">สลับกล้อง</span></button><select class="cam-pick" aria-label="เลือกกล้อง" data-i18n-attr="aria-label:palm.cam.pick"></select>';
    host.append(box);
    var torch = /** @type {HTMLButtonElement} */ (box.querySelector(".cam-torch")), flip = /** @type {HTMLButtonElement} */ (box.querySelector(".cam-flip")), pickEl = /** @type {HTMLSelectElement} */ (box.querySelector(".cam-pick"));
    var render = function () {
      var devs = c.devices.filter(function (d) { return d.deviceId; }), multi = devs.length >= 2, tc = c.active && c.torchSupported;
      flip.hidden = !multi; pickEl.hidden = !multi; torch.hidden = !tc;
      torch.setAttribute("aria-pressed", c.torch ? "true" : "false");
      box.hidden = !multi && !tc;
      pickEl.innerHTML = devs.map(function (d, i) { return '<option value="' + esc(d.deviceId) + '">' + esc(d.label || T("palm.cam.n", "กล้อง {n}", { n: i + 1 })) + "</option>"; }).join("");
      if (c.deviceId) pickEl.value = c.deviceId;
    };
    var run = function (p) { box.classList.add("busy"); p.catch(function (e) { if (e && e.name !== "AbortError" && onError) onError(e); }).finally(function () { box.classList.remove("busy"); render(); }); };
    flip.onclick = function () { run(c.flip()); };
    pickEl.onchange = function () { run(c.start(pickEl.value)); };
    torch.onclick = function () { run(c.setTorch(!c.torch)); };
    return render;
  }
  function showHttpsNote(before) {
    if (window.isSecureContext || document.querySelector(".https-note")) return;
    var p = document.createElement("p"); p.className = "https-note"; p.setAttribute("role", "alert");
    p.innerHTML = '<span data-i18n="palm.https.a">บนมือถือต้องเปิดผ่าน</span> <b>https://</b> <span data-i18n="palm.https.b">— ดูวิธีในหน้า</span> <a href="cameras.html" data-i18n="palm.https.link">ระบบทั้งหมด</a>';
    before.before(p);
  }
  var camErr = function (e) {
    console.error(e);
    if (e.name === "Insecure") showHttpsNote($("#plEngine"));
    var m = { Insecure: ["palm.err.https", HTTPS_MSG], NotAllowedError: ["palm.err.denied", "ไม่ได้รับอนุญาตให้ใช้กล้อง — ใช้ปุ่ม อัปโหลดรูป แทนได้"], NotFoundError: ["palm.err.nocam", "ไม่พบกล้อง — ใช้ปุ่ม อัปโหลดรูป แทนได้"], NotReadableError: ["palm.err.busy", "กล้องถูกโปรแกรมอื่นใช้อยู่"] }[e.name];
    engine(function () { return m ? T(m[0], m[1]) : T("palm.err.cam", "เปิดกล้องไม่ได้: {msg}", { msg: e.message || e.name }); }, "err");
  };
  function layoutCam() {
    var vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
    if (ov.width !== vw || ov.height !== vh) { ov.width = vw; ov.height = vh; }
    cam.style.aspectRatio = vw + " / " + vh;
  }
  var renderCamCtl = function () {};
  var camera = LQCam.create(video, {
    facing: "environment", ideal: { width: 1920, height: 1080 }, torch: true,
    onChange: function (c, ev) {
      renderCamCtl();
      if (ev.type === "devices") return;
      cam.classList.toggle("mirror", c.mirrored); cam.classList.toggle("live", c.active); layoutCam();
      if (ev.type === "started" && c.active) { prevHand = null; startLoop(); }
      if (ev.type === "ended") engine(function () { return T("palm.eng.camLost", "สัญญาณกล้องหลุด — กดเปิดกล้องอีกครั้ง"); }, "err");
    },
    onError: function (c, e) { if (e && e.name !== "AbortError") camErr(e); }
  });
  renderCamCtl = mountCamCtl(cam, camera, camErr);
  video.addEventListener("resize", layoutCam);

  /* ---------- โมเดลจุดบนมือ (tfjs graph model, ไม่ต้องใช้ WebGL) ---------- */
  var FAKE = !!(window.LQDetect && LQDetect.isTest()); // ?fakedet บน localhost: ตัวตรวจจับจำลองสำหรับทดสอบ ไม่โหลดโมเดล
  var modelsP = null;
  function loadModels() {
    if (FAKE) { ready = true; models = models || { fake: true }; engine(function () { return T("palm.eng.readyFake", "พร้อมใช้งาน (ตัวตรวจจับจำลองสำหรับทดสอบ)"); }, "ok"); return Promise.resolve(models); }
    if (!modelsP) modelsP = LQDetect.tfBackend().then(function (b) {
      var tf = faceapi.tf;
      return Promise.all([tf.loadGraphModel(MODEL_DIR + "detector/model.json"), tf.loadGraphModel(MODEL_DIR + "landmark/model.json")]).then(function (m) {
        models = { tf: tf, det: m[0], lm: m[1], anchors: PC.ssdAnchors(), backend: b };
        ready = true;
        engine(function () { return T("palm.eng.ready", "พร้อมใช้งาน{slow}", { b: b.toUpperCase(), slow: b === "webgl" ? "" : T("palm.eng.slow", " (เครื่องนี้อาจอ่านผลช้ากว่าปกติเล็กน้อย)") }); }, "ok");
        return models;
      });
    }).catch(function (e) { console.error(e); engine(function () { return T("palm.eng.modelFail", "โหลดโมเดลจุดบนมือไม่สำเร็จ — ยังใช้งานได้โดยแตะจุดบนมือเอง"); }, "err"); modelsP = null; throw e; });
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
  /** หามือในภาพ (สูงสุด 2 มือ): ตรวจฝ่ามือ → จุด 21 จุด → กรอบใหม่จากจุด → จุดรอบสอง (แม่นขึ้น)
      คืน [{pts, score, det, handedness, box:{x,y,w,h} px}] — handedness ดิบจากโมเดล (ภาพไม่กลับด้าน ใช้ PC.guessSide ตัดสินข้างมือ) */
  async function detectHands(src, quick) {
    var W = src.width || src.videoWidth, H = src.height || src.videoHeight;
    if (FAKE) {
      var fk = LQDetect.fake(camera.deviceId || "c1", performance.now()) || [];
      return fk.map(function (d) { var box = { x: d.x * W, y: d.y * H, w: d.w * W, h: d.h * H }, pts = PC.synthHand(box, d.side); return { pts: pts, score: d.score, det: d.score, handedness: typeof d.handedness === "number" ? d.handedness : null, box: PC.handBox(pts) }; });
    }
    var tf = models.tf;
    var lb = PC.letterbox(W, H, 192), x = c192.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, 192, 192); x.drawImage(src, lb.dx, lb.dy, lb.dw, lb.dh);
    var inp = tf.tidy(function () { return tf.browser.fromPixels(c192).toFloat().div(255).expandDims(0); });
    var out = models.det.predict(inp), raw;
    try { raw = await out.data(); } finally { tf.dispose([inp, out]); }
    var dets = PC.nms(PC.decodePalms(raw, models.anchors, 0.5), 0.3, 2), hands = [];
    for (var i = 0; i < dets.length; i++) {
      var d = PC.unletterbox(dets[i], lb.pad), roi = PC.palmRoi(d, W, H);
      var r1 = await runLandmarks(src, roi);
      if (r1.score < 0.5) continue;
      var r = r1;
      if (!quick) { var r2 = await runLandmarks(src, PC.landmarksRoi(r1.pts)); if (r2.score >= 0.5) r = r2; }
      hands.push({ pts: r.pts, score: r.score, det: d.score, handedness: r.handedness, box: PC.handBox(r.pts) });
    }
    // สองกรอบฝ่ามืออาจได้จุดของมือเดียวกัน: ตัดมือที่ซ้อนกันมาก
    return hands.filter(function (h, k) { return hands.slice(0, k).every(function (o) { return PC.iou(o.box, h.box) < 0.5; }); });
  }
  /** มือเดียว (มือหลัก) หรือ null — รูปแบบเดิม {pts, score, det, handedness} สำหรับโค้ดทดสอบ */
  async function detectHand(src, quick) {
    var W = src.width || src.videoWidth, H = src.height || src.videoHeight;
    return primaryHand(await detectHands(src, quick), null, W, H).hand;
  }
  /** มือหลักในภาพ (ใกล้กลางกรอบนำทาง / มือเดิม) → {hand, n, others, boxN} */
  function primaryHand(hands, prev, W, H) {
    var p = PC.pickHand(hands, prev, W, H);
    return { hand: p.index >= 0 ? hands[p.index] : null, n: hands.length, boxN: p.boxN, others: hands.filter(function (h, i) { return i !== p.index; }) };
  }

  /* ---------- กรอบนำทาง + ตรวจสดจากกล้อง ---------- */
  /** กรอบนำทางรูปมือของข้างที่ต้องการ ในพิกัดภาพดิบ (ผืนวาดกลับด้านพร้อมวิดีโอด้วย CSS เมื่อเป็นกล้องหน้า) */
  function currentGuide() { return PC.guideTemplate(guideSide(), ov.width, ov.height, { mirrored: camera.mirrored }); }
  function drawGuide(pts, ok, others, tpl) {
    var w = ov.width, h = ov.height; octx.clearRect(0, 0, w, h);
    tpl = tpl || currentGuide();
    octx.lineWidth = Math.max(3, w / 240); octx.setLineDash([w / 60, w / 90]); octx.lineJoin = "round";
    octx.strokeStyle = ok ? "#22d3ee" : "rgba(255,255,255,.85)";
    octx.beginPath(); tpl.contour.forEach(function (q, i) { if (i) octx.lineTo(q[0], q[1]); else octx.moveTo(q[0], q[1]); }); octx.closePath();
    octx.fillStyle = "rgba(34,211,238,.06)"; octx.fill(); octx.stroke(); octx.setLineDash([]);
    if (pts) {
      octx.fillStyle = ok ? "rgba(34,211,238,.95)" : "rgba(255,255,255,.8)";
      var r = Math.max(3, w / 220);
      [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17]].forEach(function (ch) {
        octx.beginPath(); ch.forEach(function (i, k) { if (k) octx.lineTo(pts[i][0], pts[i][1]); else octx.moveTo(pts[i][0], pts[i][1]); });
        octx.strokeStyle = ok ? "rgba(34,211,238,.8)" : "rgba(255,255,255,.6)"; octx.lineWidth = r * 0.8; octx.stroke();
      });
      pts.forEach(function (p) { octx.beginPath(); octx.arc(p[0], p[1], r, 0, Math.PI * 2); octx.fill(); });
    }
    (others || []).forEach(function (o) { // มืออื่น: หรี่ลง ไม่ใช้ในการอ่าน
      var b = o.box;
      octx.fillStyle = "rgba(14,20,48,.5)"; octx.fillRect(b.x, b.y, b.w, b.h);
      octx.strokeStyle = "rgba(255,255,255,.35)"; octx.lineWidth = Math.max(2, w / 400); octx.strokeRect(b.x, b.y, b.w, b.h);
    });
  }
  /** ป้ายตรวจคุณภาพ: ข้อความ หรือ [คีย์, ไทย, vars] (แปลตอนแสดงผล เพื่อสลับภาษาได้) */
  var qtx = function (x) { return Array.isArray(x) ? T(x[0], x[1], x[2]) : x; };
  var lastQcItems = null;
  function renderQc(items) {
    lastQcItems = items;
    $("#plQc").innerHTML = items.map(function (q) {
      return '<li class="' + (q.ok ? "ok" : "no") + '"><span class="dot" aria-hidden="true">' + (q.ok ? "✓" : "!") + "</span><span>" + esc(qtx(q.label)) + (q.ok || !q.tip ? "" : ' <small>— ' + esc(qtx(q.tip)) + "</small>") + "</span></li>";
    }).join("");
  }
  var probe = document.createElement("canvas");
  function quality(pts, W, H, src, n) {
    /** @type {any[]} */
    var q = [{ id: "hand", label: ["palm.qc.hand", "พบมือ"], ok: !!pts, tip: ["palm.qc.hand.tip", "แบฝ่ามือเข้าหากล้องให้เห็นทั้งมือ"] }];
    if (!pts) return q;
    if (n != null) q.push({ id: "single", label: ["palm.qc.single", "ใช้มือเดียวในกรอบ"], ok: n <= 1, tip: ["palm.qc.single.tip", "พบ {n} มือ ใช้มือที่จะอ่านเพียงข้างเดียว (อ่านมือที่อยู่กลางกรอบ)", { n: n }] });
    var hand = PC.handFromLandmarks(pts), m = PC.measureHand(hand);
    q.push({ id: "size", label: ["palm.qc.size", "มือใหญ่พอ"], ok: m.palmW / Math.min(W, H) >= 0.14, tip: ["palm.qc.size.tip", "ขยับมือเข้าใกล้กล้องอีกนิด"] });
    var inside = pts.every(function (p) { return p[0] > W * 0.02 && p[0] < W * 0.98 && p[1] > H * 0.02 && p[1] < H * 0.98; });
    q.push({ id: "frame", label: ["palm.qc.frame", "เห็นนิ้วและข้อมือครบ"], ok: inside, tip: ["palm.qc.frame.tip", "ถอยมือให้นิ้วและข้อมืออยู่ในภาพ"] });
    // ความสว่างกลางฝ่ามือ
    var c = PC.lerp(hand.wrist, hand.mcp.middle, 0.5), r = m.palmW * 0.35;
    probe.width = 32; probe.height = 32;
    var x = probe.getContext("2d", { willReadFrequently: true }); x.drawImage(src, c[0] - r, c[1] - r, 2 * r, 2 * r, 0, 0, 32, 32);
    var d = x.getImageData(0, 0, 32, 32).data, s = 0; for (var i = 0; i < d.length; i += 4) s += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    var lum = s / (d.length / 4);
    q.push({ id: "light", label: ["palm.qc.light", "แสงพอดี"], ok: lum > 80 && lum < 235, tip: lum <= 80 ? ["palm.qc.dark", "แสงน้อย ลองเปิดไฟฉายหรือหันเข้าหาแสง"] : ["palm.qc.bright", "แสงจ้าเกินไป ลองเลี่ยงแสงสะท้อน"] });
    return q;
  }
  var lastQ = null, prevHand = null;
  /** ป้ายบนภาพกล้อง: ข้างของกรอบ + ความตรงกรอบ + เตือนเมื่อเห็นมือผิดข้าง */
  function renderGuideBar(tpl, fit, seenWrong, exp) {
    $("#plGuideBar").hidden = false;
    $("#plGuideSide").textContent = T("palm.guide.side", "กรอบ{side}", { side: sideTh(tpl.side) }) + (S.sideMode === "auto" ? (S.liveSide ? T("palm.guide.found", " (ตรวจพบ)") : T("palm.guide.wait", " (รอตรวจ)")) : "");
    var f = $("#plFit");
    f.textContent = fit == null ? "" : T("palm.guide.fit", "ตรงกรอบ {p}%", { p: Math.round(fit * 100) });
    f.className = "pl-fit " + (fit == null ? "" : fit >= 0.7 ? "good" : fit >= 0.4 ? "mid" : "low");
    var wEl = $("#plWrong");
    wEl.hidden = !seenWrong;
    if (seenWrong) wEl.textContent = S.sideMode === "both" ? T("palm.guide.wrongBoth", "ตอนนี้เห็น{seen} — รอบนี้อ่าน{side}ไว้", { seen: sideTh(seenWrong), side: sideTh(exp) }) : T("palm.guide.wrong", "ตอนนี้เห็น{seen} — เลือก{side}ไว้", { seen: sideTh(seenWrong), side: sideTh(exp) });
  }
  /** ป้ายเตือนบนภาพกล้องเมื่อเห็นมากกว่า 1 มือ */
  function renderMulti(n) { var el = $("#plMulti"); if (el) el.hidden = !(n > 1); }
  async function startLoop() {
    if (looping) return; looping = true;
    while (camera.active && looping) {
      if (!S.busy && ready && video.videoWidth) {
        try {
          var W = video.videoWidth, H = video.videoHeight, ph = primaryHand(await detectHands(video, true), prevHand, W, H), r = ph.hand;
          prevHand = ph.boxN;
          var rs = r ? PC.resolveSide({ pts: r.pts, handedness: r.handedness }) : null;
          if (S.sideMode === "auto") updateLiveSide(rs);
          lastQ = quality(r && r.pts, W, H, video, ph.n);
          var exp = expectedSide(), wrong = !!(exp && rs && rs.conf >= 0.2 && rs.side !== exp && ph.n <= 1);
          if (exp && rs) lastQ.push({ id: "side", label: ["palm.qc.side", "เป็น{side}ตามที่เลือก", { side: sideTh(exp) }], ok: !wrong, tip: ["palm.qc.side.tip", "ตอนนี้เห็น{side}", { side: sideTh(rs.side) }] });
          var tpl = currentGuide(), fit = r ? PC.fitScore(r.pts, tpl) : null;
          S.guide = { side: tpl.side, fit: fit, wrong: wrong, seen: rs ? rs.side : null, mirrored: tpl.mirrored, thumbOnScreen: tpl.thumbOnScreen };
          if (!S.busy) { renderQc(lastQ); drawGuide(r && r.pts, lastQ.every(function (q) { return q.ok; }), ph.others, tpl); renderMulti(ph.n); renderGuideBar(tpl, fit, wrong ? rs.side : null, exp); }
        } catch (e) { console.warn(e); }
      } else if (!ready && video.videoWidth) drawGuide(null, false);
      await sleep(400);
    }
    looping = false;
  }

  btnCam.addEventListener("click", async function () {
    btnCam.disabled = true;
    engine(function () { return T("palm.eng.opening", "กำลังเปิดกล้อง..."); });
    try {
      await camera.start();
      loadModels().catch(function () {});
      $("#plCamHint").hidden = true;
      engine(function () { return T("palm.eng.camReady", "กล้องพร้อม — วางฝ่ามือให้อยู่ในกรอบ แล้วกด ถ่ายภาพฝ่ามือ"); }, "ok");
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
    } catch (e) { console.error(e); engine(T("palm.eng.snapFail", "ถ่ายภาพไม่สำเร็จ: {msg}", { msg: e.message || e }), "err"); }
    finally { countEl.hidden = true; S.busy = false; btnSnap.disabled = false; }
  });
  fileIn.addEventListener("change", async function () {
    var f = fileIn.files && fileIn.files[0]; fileIn.value = "";
    if (!f) return;
    touch();
    engine(function () { return T("palm.eng.openingImg", "กำลังเปิดรูป..."); });
    S.busy = true;
    try {
      var url = URL.createObjectURL(f), img = new Image();
      await new Promise(function (res, rej) { img.onload = res; img.onerror = function () { rej(new Error(T("palm.err.file", "เปิดไฟล์รูปไม่ได้"))); }; img.src = url; });
      var sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      var cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
      cv.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      await processImage(cv);
    } catch (e) { console.error(e); engine(T("palm.eng.imgFail", "อ่านรูปไม่สำเร็จ: {msg}", { msg: e.message || e }), "err"); }
    finally { S.busy = false; }
  });

  /* ---------- ประมวลผลภาพ: จุดบนมือ → กรอบฝ่ามือ → ภาพมาตรฐาน → ตัวกรองเส้น → เส้นอัตโนมัติ ---------- */
  async function processImage(cv) {
    S.src = cv; S.result = null;
    resultSec.hidden = true;
    engine(function () { return T("palm.eng.finding", "กำลังหาจุดบนมือ..."); });
    await frame2();
    var det = null, nh = 0;
    try { await loadModels(); var hs = await detectHands(cv, false); nh = hs.length; det = primaryHand(hs, null, cv.width, cv.height).hand; } catch (e) { console.warn(e); }
    var q = quality(det && det.pts, cv.width, cv.height, cv, nh);
    renderQc(q);
    if (!det) {
      engine(function () { return T("palm.eng.noHand", "ไม่พบมือในภาพอัตโนมัติ — แตะจุดบนมือเอง 7 จุดเพื่อไปต่อ"); }, "err");
      startTap();
      return;
    }
    var warn = q.filter(function (x) { return !x.ok; }).map(function (x) { return x.tip; });
    S.hand = PC.handFromLandmarks(det.pts);
    applyDetectedSide(PC.resolveSide({ pts: det.pts, handedness: det.handedness }));
    var mis = S.sideMismatch, rside = S.side;
    if (mis) warn.push(["palm.warn.mismatch", "ภาพนี้ดูเหมือน{seen} แต่เลือกอ่าน{side}ไว้", { seen: sideTh(mis), side: sideTh(rside) }]);
    await buildFromHand(function () {
      var sv = { side: sideTh(rside) };
      if (mis) warn[warn.length - 1][2] = { seen: sideTh(mis), side: sideTh(rside) };
      return warn.length ? T("palm.eng.foundWarn", "พบ{side}แล้ว ({warn} — ผลอาจคลาดเคลื่อน)", { side: sv.side, warn: warn.map(qtx).join(" · ") }) : T("palm.eng.found", "พบ{side}แล้ว ตรวจและปรับเส้นได้ด้านล่าง", sv);
    }, warn.length ? "err" : "ok");
  }
  async function buildFromHand(msg, cls) {
    engine(function () { return T("palm.eng.tracing", "กำลังไล่เส้นบนฝ่ามือ..."); });
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
    engine(msg || function () { return T("palm.eng.editReady", "พร้อมปรับเส้น"); }, cls || "ok");
  }

  /* ---------- ขั้นที่ 2: ตัวแก้ไขเส้น / ปักจุดเอง ---------- */
  var TAP_LABELS = { wrist: "กึ่งกลางข้อมือ", indexBase: "โคนนิ้วชี้", pinkyBase: "โคนนิ้วก้อย", indexTip: "ปลายนิ้วชี้", middleTip: "ปลายนิ้วกลาง", ringTip: "ปลายนิ้วนาง", pinkyTip: "ปลายนิ้วก้อย" };
  var tapLabel = function (k) { return T("palm.tap." + k, TAP_LABELS[k]); };
  function showEditor() {
    editSec.hidden = false; setStep(2);
    $("#plTapBar").hidden = S.mode !== "tap";
    $("#plLineTools").hidden = S.mode === "tap";
    $("#plRead").disabled = S.mode === "tap";
    $("#plHonest").hidden = S.mode === "tap";
    renderReadSide(); renderLineChips(); renderEditor();
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
    $("#plTapMsg").innerHTML = k ? esc(T("palm.tap.n", "แตะจุดที่ {n}/7", { n: S.taps.length + 1 })) + ": <b>" + esc(tapLabel(k)) + "</b>" : esc(T("palm.tap.done", "ครบแล้ว"));
    $("#plTapUndo").disabled = !S.taps.length;
    $("#plEditCap").textContent = T("palm.tap.order", "แตะตามลำดับ: ข้อมือ → โคนนิ้วชี้ → โคนนิ้วก้อย → ปลายนิ้วชี้ กลาง นาง ก้อย (ใช้วัดสัดส่วนมือและวางแนวเส้น)");
  }
  $("#plTapUndo").addEventListener("click", function () { S.taps.pop(); renderTapMsg(); renderEditor(); });
  $("#plTapMode").addEventListener("click", function () { if (S.src) startTap(); });
  function renderLineChips() {
    $("#plLineChips").innerHTML = PC.LINE_IDS.map(function (id) {
      var L = KB.lines[id], a = S.lines && S.lines[id] && S.lines[id].auto;
      var conf = a ? (a.conf >= 0.6 ? T("palm.conf.hi", "ชัด") : a.conf >= 0.3 ? T("palm.conf.mid", "พอเห็น") : T("palm.conf.lo", "ไม่ชัด")) : "";
      return '<button type="button" role="radio" class="chip-btn" style="--c:' + L.color + '" data-line="' + id + '" aria-checked="' + (S.active === id) + '"><i></i>' + esc(KT("lines." + id + ".th", L.th)) + (conf ? " <small>(" + conf + ")</small>" : "") + "</button>";
    }).join("");
    $$("#plLineChips [data-line]").forEach(function (b) { b.addEventListener("click", function () { S.active = b.dataset.line; renderLineChips(); renderEditor(); }); });
  }
  $("#plFateNone").addEventListener("change", /** @this {HTMLInputElement} */ function () { if (S.lines) { S.lines.fate.present = !this.checked; if (!this.checked) S.active = "fate"; renderLineChips(); renderEditor(); } });
  $("#plResetLines").addEventListener("click", function () { if (S.auto) { S.lines = JSON.parse(JSON.stringify(S.auto)); $("#plFateNone").checked = !S.lines.fate.present; renderLineChips(); renderEditor(); toast(T("palm.toast.reset", "คืนค่าเส้นอัตโนมัติแล้ว")); } });

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
        c.fillStyle = "#fff"; c.strokeStyle = "rgba(14,20,48,.8)"; c.lineWidth = 4; c.strokeText(tapLabel(PC.TAP_ORDER[i]), p[0] * k + r * 1.4, p[1] * k); c.fillText(tapLabel(PC.TAP_ORDER[i]), p[0] * k + r * 1.4, p[1] * k);
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
    $("#plEditCap").textContent = T("palm.edit.cap", "กำลังปรับ: {line} — {where} · ลากจุดกลมให้ทับรอยเส้นจริง", { line: KT("lines." + S.active + ".th", KB.lines[S.active].th), where: KT("lines." + S.active + ".where", KB.lines[S.active].where) });
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
        S.hand = PC.handFromTaps(t); applyDetectedSide(PC.resolveSide({ hand: S.hand })); renderReadSide();
        S.mode = "edit"; $("#plTapBar").hidden = true; $("#plLineTools").hidden = false; $("#plRead").disabled = false; $("#plHonest").hidden = false;
        buildFromHand(function () { return T("palm.eng.tapsDone", "ปักจุดครบแล้ว ตรวจและปรับเส้นได้เลย"); }, "ok");
      }
      return;
    }
    if (!S.lines) return;
    /** @type {any} */
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
      var d = KB.minor[k], v = S.minor[k], nm = KT("minor." + k + ".th", d.th);
      return '<div class="minor-row"><b>' + esc(nm) + '</b><small>' + esc(KT("minor." + k + ".where", d.where)) + '</small><span class="tri" role="group" aria-label="' + esc(nm) + '">' +
        '<button type="button" data-minor="' + k + '" data-v="1" aria-pressed="' + (v === true) + '">' + esc(T("palm.minor.yes", "เห็น")) + '</button>' +
        '<button type="button" data-minor="' + k + '" data-v="0" aria-pressed="' + (v === false) + '">' + esc(T("palm.minor.no", "ไม่เห็น")) + '</button></span></div>';
    }).join("");
    $$("#plMinor [data-minor]").forEach(function (b) {
      b.addEventListener("click", function () { var k = b.dataset.minor, v = b.dataset.v === "1"; S.minor[k] = S.minor[k] === v ? undefined : v; renderMinor(); });
    });
  }
  function renderMounts() {
    $("#plMounts").innerHTML = Object.keys(KB.mounts).map(function (k) {
      var d = KB.mounts[k];
      return '<button type="button" class="chip-btn" data-mount="' + k + '" aria-pressed="' + (S.mounts.indexOf(k) >= 0) + '">' + esc(KT("mounts." + k + ".th", d.th)) + " <small>" + esc(KT("mounts." + k + ".under", d.under)) + "</small></button>";
    }).join("");
    $$("#plMounts [data-mount]").forEach(function (b) {
      b.addEventListener("click", function () { var k = b.dataset.mount, i = S.mounts.indexOf(k); if (i >= 0) S.mounts.splice(i, 1); else S.mounts.push(k); renderMounts(); });
    });
  }
  renderMinor(); renderMounts();
  function renderMountNote() { $("#plMountNote").textContent = KT("mountsNote", KB.mountsNote); }
  renderMountNote();
  // ถ่ายใหม่: ล้างเฉพาะมือปัจจุบัน (โหมดทั้งสองมือยังเก็บผลมือที่ 1 ไว้)
  $("#plBack").addEventListener("click", function () {
    clearReading(); renderSide(); renderPair(); setStep(1); touch();
    $("#plStage").scrollIntoView({ block: "start" });
    engine(function () { return T("palm.eng.retake", "ถ่าย{side}ใหม่ได้เลย", { side: sideTh(guideSide()) }); }, "ok");
  });

  /* ---------- ขั้นที่ 3: อ่านลายมือ ---------- */
  $("#plRead").addEventListener("click", function () {
    if (!S.hand || !S.lines) return;
    touch();
    var lines = {};
    PC.LINE_IDS.forEach(function (id) { lines[id] = { cp: S.lines[id].cp, present: id !== "fate" || S.lines[id].present }; });
    var seed = Math.round(S.hand.wrist[0] + S.hand.wrist[1]);
    var R = PC.analyze({ hand: S.hand, lines: lines, R: S.R, F: S.F, minor: S.minor, mounts: S.mounts, isDominant: S.side === S.dom, side: S.side, seed: seed });
    S.result = R; S.narr = null; S.cmp = null; S.cmpFirst = null;
    if (S.sideMode === "both" && S.pairStep === 1 && S.pair[0]) {
      // มือที่ติดตัว (ไม่ถนัด) อยู่ฝั่ง a เสมอ แม้ผู้ใช้จะสลับข้างเอง
      var h1 = S.pair[0], h2 = { side: S.side, R: R }, A = h1, B = h2;
      if (h1.side === S.dom && h2.side !== S.dom) { A = h2; B = h1; }
      S.cmp = PC.buildComparison(A.R, B.R, { sideA: SIDE_TH[A.side], sideB: SIDE_TH[B.side], seed: seed });
      S.cmp.A = A; S.cmp.B = B; S.cmpFirst = h1;
    }
    renderResult(R); renderPair();
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
      box.innerHTML = TOPICS.map(function (t) { return '<button type="button" role="radio" data-topic="' + t[0] + '" aria-checked="' + (t[0] === topic) + '">' + esc(T("palm.topic." + t[0], t[1])) + "</button>"; }).join("");
    });
  }
  document.addEventListener("click", function (e) {
    var tg = /** @type {any} */ (e.target), b = tg && tg.closest && tg.closest("[data-topic]"); if (!b) return;
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
    var ek = "element." + R.el.top.id;
    return { source: "local", sections: [{ id: "personality", title: T("palm.sec.personality", "บุคลิก"), paragraphs: [ZM(ek, rd.personality, "p")] }, { id: "work", title: T("palm.sec.work", "การงาน"), paragraphs: [ZM(ek, rd.work, "w")] },
      { id: "money", title: T("palm.sec.money", "การเงิน"), paragraphs: [ZM(ek, rd.money, "m")] }, { id: "love", title: T("palm.sec.love", "ความรัก & มิตรภาพ"), paragraphs: [ZM(ek, rd.love, "l")] }] };
  }
  function narrate(again) {
    if (!S.result) return;
    var my = ++narrToken, box = $("#plNarr"), btn = $("#plRegen"), R = S.result;
    var facts = PC.buildFacts(R, { topic: topic, nickname: $("#plNick").value, minor: S.minor, mounts: S.mounts, side: S.side, isDominant: S.side === S.dom, asp: S.F ? S.F.asp : null,
      compare: S.cmpFirst ? { first: S.cmpFirst.R, sideA: SIDE_TH[S.cmpFirst.side], sideB: SIDE_TH[S.side] } : null });
    S.facts = facts;
    var useAI = !!(FA && FA.hasConsent && FA.hasConsent());
    box.setAttribute("aria-busy", "true"); btn.disabled = true;
    if (!box.firstChild || useAI) box.innerHTML = '<p class="fa-loading">' + esc(useAI ? T("palm.narr.loadingAI", "กำลังให้ผู้ช่วยเขียนคำทำนาย (Claude โดย Anthropic) เรียบเรียง...") : T("palm.narr.loading", "กำลังเรียบเรียงคำทำนาย...")) + "</p>";
    var p = !FA ? Promise.resolve(legacyResult(R)) : again && FA.regenerate ? FA.regenerate(facts, { useAI: useAI }) : FA.interpret(facts, { useAI: useAI });
    p.catch(function (e) { console.error(e); return FA && FA.compose ? FA.compose(facts) : legacyResult(R); }).then(function (res) {
      if (my !== narrToken || !S.result) return;
      S.narr = res;
      var shown = res;
      if (S.cmp) { // ส่วนเทียบสองมือ ต่อจากภาพรวม
        var secs = (res.sections || []).slice(), at = secs.length && secs[0].id === "overview" ? 1 : 0;
        var cv = cmpView();
        secs.splice(at, 0, { id: "compare", title: cv.title, paragraphs: cv.paragraphs });
        shown = Object.assign({}, res, { sections: secs });
      }
      if (FA && FA.renderSections) FA.renderSections(box, shown, { aiBadge: false }); else renderPlain(box, shown);
      var src = $("#plSrc"), ai = res.source === "ai";
      src.textContent = ai ? T("palm.src.ai", "เรียบเรียงโดยผู้ช่วยเขียนคำทำนาย (Claude โดย Anthropic)") : T("palm.src.local", "เรียบเรียงในเครื่อง");
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
  /** ภาษาจีน: หาสำนวนจาก zh-kb ของหัวข้อในผลวัดที่ปรากฏในคำทำนาย แล้วตัดที่เครื่องหมาย "，" ถ้ายาวเกิน max */
  function keySentencesZh(res, n, max, facts) {
    var secs = (res && res.sections) || [], out = [], found = [];
    var text = secs.filter(function (x) { return x.id !== "advice"; }).slice(0, 4).map(function (x) { return (x.paragraphs || []).join(""); }).join("");
    ((facts && facts.items) || []).forEach(function (it) {
      var z = ZI(it.id); if (!z) return;
      "opwmlct".split("").forEach(function (fk) { [].concat(z[fk] || []).forEach(function (m) { var at = text.indexOf(m); if (at >= 0) found.push({ at: at, m: m }); }); });
    });
    found.sort(function (a, b) { return a.at - b.at; });
    found.forEach(function (f) {
      if (out.length >= n) return;
      var c = f.m.length <= max ? f.m : f.m.split("，")[0];
      if (c.length >= 8 && c.length <= max && out.indexOf(c) < 0) out.push(c);
    });
    return out;
  }
  function keySentences(res, n, max, facts) {
    if (res && res.lang === "en" && window.FortuneAI && window.FortuneAI.en) return window.FortuneAI.en.keyLines(res, n, max); // English result
    if (isZh()) return keySentencesZh(res, n, max, facts);
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
      // เนินที่ผู้ใช้เลือก หรือที่ประเมินจากภาพว่าเด่น = สีทอง
      var p = uvToDisp(KB.mounts[k].pos), on = S.mounts.indexOf(k) >= 0 || !!(R.mounts && R.mounts.top.indexOf(k) >= 0), t = KT("mounts." + k + ".short", KB.mounts[k].th.replace("เนิน", ""));
      c.beginPath(); c.arc(p[0], p[1], (on ? 6 : 3.5) * sc, 0, Math.PI * 2); c.fillStyle = on ? "#fcd34d" : "rgba(255,255,255,.75)"; c.fill();
      var tw = c.measureText(t).width + fs * 0.9, th = fs * 1.5, ty = p[1] + 14 * sc;
      c.fillStyle = on ? "rgba(252,211,77,.95)" : "rgba(14,20,48,.62)";
      c.beginPath(); if (c.roundRect) c.roundRect(p[0] - tw / 2, ty - th / 2, tw, th, th / 2); else c.rect(p[0] - tw / 2, ty - th / 2, tw, th); c.fill();
      c.fillStyle = on ? "#0e1430" : "#fff"; c.fillText(t, p[0], ty + 1);
    });
    c.textAlign = "left";
  }
  var fmt = function (v, d) { return typeof v === "number" ? v.toFixed(d) : "—"; };
  /** ชื่อธาตุสั้น (ดิน / 土) และชื่อมือตามธาตุ (มือธาตุดิน / 土型手) */
  var elTh = function (id) { return KT("elements." + id + ".th", KB.elements[id].th); };
  var elHand = function (id) { var z = isZh() && ZI("element." + id); return z ? z.n : "มือธาตุ" + KB.elements[id].th; };
  var LINE_ORDER = { life: "pt", head: "pwm", heart: "lpc", fate: "wtm" };
  /** หมวดนิ้ว/นิ้วโป้ง… ใน KB → คีย์ใน zh-kb */
  var GRP_ZK = { fingers: "finger", fingerDom: "fingerdom", pinky: "pinky", thumb: "thumb", thumbAngle: "thumbangle", spread: "spread" };
  var grpLabel = function (grp, cat, th) { return KT(grp + "." + cat + ".label", th); };
  var grpMeaning = function (grp, cat, th) { var k = GRP_ZK[grp] + "." + cat; return ZI(k) ? ZM(k, th, "pwcml") : KT(grp + "." + cat + ".meaning", th); };
  var lineCatLabel = function (id, cat) { var c = KB.lines[id].cats[cat]; return KT("lines." + id + ".cats." + cat, c ? c.label : cat); };
  function renderResult(R) {
    var rd = R.reading, E = rd.element, eid = R.el.top.id, sid = R.el.second.id;
    drawResultImage(R);
    $("#plElement").style.setProperty("--el", E.color);
    $("#plElement").style.setProperty("--el-soft", E.soft);
    $("#plElName").textContent = isZh() ? elHand(eid) : "ธาตุ" + E.th;
    $("#plElPct").textContent = R.el.top.pct + "%";
    $("#plElShape").textContent = KT("elements." + eid + ".shape", E.shape);
    $("#plElSecond").innerHTML = esc(T("palm.el.second", "ธาตุรอง")) + ": <b>" + esc(elTh(sid)) + "</b> " + R.el.second.pct + "%";
    $("#plElBars").innerHTML = R.el.ranked.map(function (r) { var e = KB.elements[r.id]; return '<div class="elbar"><span>' + esc(elTh(r.id)) + '</span><i style="--w:' + r.pct + "%;--c:" + e.color + '"></i><b>' + r.pct + "%</b></div>"; }).join("");
    $("#plElTraits").innerHTML = E.traits.map(function (t, i) { return "<li>" + esc(KT("elements." + eid + ".traits." + i, t)) + "</li>"; }).join("");
    $("#plElNote").textContent = KT("elementsNote", KB.elementsNote);
    var sk = rd.side ? (rd.side === KB.sides.dominant ? "dominant" : "other") : null;
    $("#plSideBadge").innerHTML = "<b>" + esc(T("palm.badge.from", "อ่านจาก{side}", { side: sideTh(S.side) })) + "</b>" + (sk ? esc(KT("sides." + sk + ".th", rd.side.th) + " · " + KT("sides." + sk + ".short", rd.side.short) + " — " + KT("sides." + sk + ".text", rd.side.text)) : "") +
      (S.sideSrc === "detect" ? ' <small class="muted">' + esc(T("palm.fromImage", "(ตรวจจากภาพ)")) + "</small>" : "") + (S.sideMode === "both" ? ' <small class="muted">· ' + esc(T("palm.handNof2", "มือที่ {n}/2", { n: S.pairStep + 1 })) + "</small>" : "");
    $("#plLines").innerHTML = rd.lines.map(function (l) {
      return '<div class="line-card" style="--c:' + l.color + '"><h4>' + esc(KT("lines." + l.id + ".th", l.th)) + "<span>" + esc(T("palm.lineEn." + l.id, l.cn)) + '</span></h4><p class="about">' + esc(KT("lines." + l.id + ".about", l.about)) + "</p><ul>" +
        l.items.map(function (it) { return "<li><b>" + esc(lineCatLabel(l.id, it.cat)) + "</b>" + esc(ZM(l.id + "." + it.cat, it.meaning, LINE_ORDER[l.id])) + "</li>"; }).join("") + "</ul></div>";
    }).join("");
    $("#plLifeNote").textContent = KT("lifeLineNote", KB.lifeLineNote);
    var hm = R.hm;
    var li = function (x, grp) { return x ? "<li><b>" + esc(grpLabel(grp, x.cat, x.label)) + "</b>" + esc(grpMeaning(grp, x.cat, x.meaning)) + "</li>" : ""; };
    var balanced = T("palm.shape.balanced", "สัดส่วนสมดุล");
    $("#plFingers").innerHTML = [
      li(rd.finger, "fingers"), li(rd.fingerDom, "fingerDom"), li(rd.pinky, "pinky"), li(rd.thumb, "thumb"), li(rd.thumbAngle, "thumbAngle"), li(rd.spread, "spread"),
      "<li><b>" + esc(T("palm.shape.palm", "ฝ่ามือ") + (Math.abs(R.el.zp) < 0.5 ? balanced : R.el.palmShape === "long" ? T("palm.shape.palmLong", "ค่อนข้างยาว") : T("palm.shape.palmSquare", "ค่อนข้างเหลี่ยม")) + " · " +
        T("palm.shape.fingers", "นิ้ว") + (Math.abs(R.el.zf) < 0.5 ? balanced : R.el.fingerShape === "long" ? T("palm.shape.fingerLong", "ค่อนข้างยาว") : T("palm.shape.fingerShort", "ค่อนข้างสั้น"))) + "</b>" + esc(KT("elements." + eid + ".shape", E.shape)) + "</li>"
    ].join("");
    var ex = rd.minor.map(function (m) { return "<li><b>" + esc(KT("minor." + m.id + ".th", m.th) + (m.seen ? T("palm.minor.seenClear", " — เห็นชัด") : T("palm.minor.notClear", " — ไม่เห็นชัด"))) + "</b>" + esc(ZM("minor." + m.id + "." + (m.seen ? "yes" : "no"), m.meaning, "wmlct")) + "</li>"; })
      .concat(rd.mounts.map(function (m) { return "<li><b>" + esc(KT("mounts." + m.id + ".th", m.th) + T("palm.mount.prominent", " เด่น")) + "</b>" + esc(ZM("mount." + m.id, m.meaning, "p")) + "</li>"; }));
    $("#plExtras").innerHTML = ex.length ? ex.join("") : '<li class="muted">' + esc(T("palm.extras.none", "ไม่ได้เลือกเส้นรองหรือเนิน — ย้อนไปเลือกในขั้นปรับเส้นได้")) + "</li>";
    $("#plMountEst").innerHTML = rd.mountsEst.map(function (m) {
      var bg = "";
      if (m.bagua) bg = " · " + (trL() ? KT("bagua." + m.bagua.id + ".th", m.bagua.th) + (isEn() ? " (" : "（") + KT("bagua." + m.bagua.id + ".theme", m.bagua.theme) + (isEn() ? ")" : "）") : m.bagua.th + " " + m.bagua.cn + " (" + m.bagua.theme + ")");
      return '<div class="mest' + (m.top ? " top" : "") + '"><b>' + esc(KT("mounts." + m.id + ".th", m.th) + (m.top ? T("palm.mest.top", " · เด่น") : "")) + "</b><span>" + m.level + "%</span><i style=\"--w:" + m.level + '%"></i><small>' + esc(KT("mounts." + m.id + ".under", m.under) + bg) + "</small></div>";
    }).join("");
    $("#plMountEstNote").textContent = KT("mountEstNote", KB.mountEstNote);
    $("#plColors").innerHTML = rd.colors.map(function (c, i) { return '<li><i style="background:' + c.hex + '"></i>' + esc(KT("elements." + eid + ".colors." + i, c.name)) + "</li>"; }).join("");
    $("#plTips").innerHTML = rd.tips.map(function (t) {
      if (!trL()) return "<li>" + esc(t) + "</li>";
      var gi = KB.generalTips.indexOf(t), z = t === E.tip ? KT("elements." + eid + ".tip", t) : gi >= 0 ? KT("generalTips." + gi, t) :
        rd.mounts.length ? T("palm.tip.mount", "จุดเด่นของคุณอยู่ที่{mount}", { mount: KT("mounts." + rd.mounts[0].id + ".th", rd.mounts[0].th) }) : t;
      return "<li>" + esc(z) + "</li>";
    }).join("");
    $("#plHowSrc").textContent = T("palm.how.points", "จุดบนมือ") + ": " + (hm.source === "model" ? T("palm.how.model", "ตรวจอัตโนมัติด้วยโมเดล MediaPipe Hands (21 จุด)") : T("palm.how.taps", "ผู้ใช้แตะเอง 7 จุด (โคนนิ้วกลาง/นางเป็นค่าประมาณ)")) + " · " + T("palm.how.backend", "ตัวประมวลผล") + ": " + (models && models.backend ? models.backend.toUpperCase() : models && models.fake ? T("palm.how.fake", "ตัวตรวจจับจำลอง") : "—");
    var M = R.lc.m, N = PC.NORMS, rows = [
      [T("palm.raw.palm", "ฝ่ามือยาว ÷ กว้าง"), fmt(hm.palmRatio, 2), T("palm.raw.palmD", "ข้อมือ→โคนนิ้วกลาง ÷ โคนนิ้วชี้→ก้อย (ค่าทั่วไป ~{n})", { n: N.palm })],
      [T("palm.raw.finger", "นิ้วกลาง ÷ ฝ่ามือ"), fmt(hm.fingerRatio, 2), T("palm.raw.fingerD", "ความยาวนิ้วกลาง ÷ ความยาวฝ่ามือ (ค่าทั่วไป ~{n})", { n: N.finger })],
      [T("palm.raw.ir", "นิ้วชี้ ÷ นิ้วนาง"), fmt(hm.indexRing, 3), T("palm.raw.irD", "> 1.02 นิ้วชี้ยาวกว่า · < 0.965 นิ้วนางยาวกว่า")],
      [T("palm.raw.thumb", "นิ้วโป้ง ÷ ฝ่ามือ"), fmt(hm.thumbRatio, 2), T("palm.raw.thumbD", "ใช้เฉพาะเมื่อโมเดลตรวจจุดนิ้วโป้งได้")],
      [T("palm.raw.ta", "มุมนิ้วโป้ง–นิ้วชี้"), fmt(hm.thumbAngle, 0) + "°", T("palm.raw.taD", "> 60° กางกว้าง · < 34° ชิด (ค่าทั่วไป ~{n}°)", { n: N.thumbAngle })],
      [T("palm.raw.pinky", "นิ้วก้อย ÷ นิ้วนาง"), fmt(hm.pinkyRing, 2), T("palm.raw.pinkyD", "ค่าทั่วไป ~{n}", { n: N.pinkyRing })],
      [T("palm.raw.spread", "ช่องห่างนิ้วเฉลี่ย"), fmt(hm.spread, 0) + "°", T("palm.raw.spreadD", "> 15° กางห่าง · < 6° ชิด")]
    ];
    PC.LINE_IDS.forEach(function (id) {
      var m = M[id]; if (!m || (id === "fate" && !S.lines.fate.present)) return;
      rows.push([KT("lines." + id + ".th", KB.lines[id].th), T("palm.raw.lineV", "ยาว {len} · ลึก {depth}", { len: fmt(m.length, 2), depth: fmt(m.depth, 2) }),
        T("palm.raw.lineD", "ความยาวเป็นเท่าของความกว้างฝ่ามือ · ความลึก 0–1 จากความเข้มของร่อง") + (id === "head" ? T("palm.raw.slope", " · ลาดลง {deg}°", { deg: fmt(m.angle, 0) }) : "") + (m.breaks ? T("palm.raw.breaks", " · ช่วงขาด {n}", { n: m.breaks }) : "")]);
    });
    $("#plRaw").innerHTML = rows.map(function (r) { return "<tr><td>" + esc(r[0]) + '</td><td class="num">' + esc(r[1]) + "</td><td>" + esc(r[2]) + "</td></tr>"; }).join("");
  }
  /* ---------- เทียบสองมือตามภาษาที่เลือก (ไทย: ผลจาก PC.buildComparison · จีน: เรียบเรียงจากแถวเทียบชุดเดียวกัน) ---------- */
  var CMP_ROW = { element: "ธาตุประจำมือ", finger: "นิ้วชี้กับนิ้วนาง", fingerDom: "นิ้วเด่น", thumbAngle: "มุมนิ้วโป้ง", mount: "เนินที่เด่น" };
  function cmpRowName(key, th) { return KB.lines[key] ? KT("lines." + key + ".th", th) : T("palm.cmp.row." + key, CMP_ROW[key] || th); }
  function cmpVal(key, R, th) {
    if (key === "element") return elHand(R.el.top.id);
    if (KB.lines[key]) return lineCatLabel(key, (R.lc.cats[key] || [])[0]);
    if (key === "finger") return grpLabel("fingers", PC.fingerCat(R.hm), th);
    if (key === "fingerDom") return grpLabel("fingerDom", PC.fingerDom(R.hm).id, th);
    if (key === "thumbAngle") return grpLabel("thumbAngle", PC.thumbAngleCat(R.hm), th);
    if (key === "mount" && R.mounts) return KT("mounts." + R.mounts.top[0] + ".th", th);
    return th;
  }
  function cmpView() {
    var c = S.cmp; if (!c) return null;
    if (!isZh()) return { title: c.title, paragraphs: c.paragraphs, rows: c.cmp.rows };
    var rows = c.cmp.rows.map(function (r) { return { key: r.key, th: cmpRowName(r.key, r.th), a: cmpVal(r.key, c.A.R, r.a), b: cmpVal(r.key, c.B.R, r.b), same: r.same }; });
    var V = { a: sideTh(c.A.side), b: sideTh(c.B.side) }, P = [T("palm.cmpz.intro", "{a}บอกศักยภาพที่ติดตัวมา ส่วน{b}บอกสิ่งที่คุณลงมือสร้างขึ้นเอง", V)];
    var el = rows[0];
    P.push(el.same ? T("palm.cmpz.sameEl", "ทั้งสองมือเป็น{el}เหมือนกัน", { el: el.a }) : T("palm.cmpz.diffEl", "{a}เป็น{elA} ส่วน{b}เป็น{elB}", { a: V.a, b: V.b, elA: el.a, elB: el.b }));
    var lr = rows.filter(function (r) { return PC.LINE_IDS.indexOf(r.key) >= 0; });
    var diff = lr.filter(function (r) { return !r.same; }).slice(0, 2), same = lr.filter(function (r) { return r.same; }).slice(0, diff.length ? 1 : 2);
    diff.forEach(function (r) { P.push(T("palm.cmpz.diffLine", "{line}บน{a}เป็นแบบ{ca} ส่วนบน{b}เป็นแบบ{cb}", { line: r.th, a: V.a, b: V.b, ca: r.a, cb: r.b })); });
    same.forEach(function (r) { P.push(T("palm.cmpz.sameLine", "{line}ของทั้งสองมือคล้ายกัน", { line: r.th })); });
    var mr = rows.filter(function (r) { return r.key === "mount"; })[0];
    if (mr) P.push(mr.same ? T("palm.cmpz.sameMounts", "{ma}เด่นทั้งสองมือ", { ma: mr.a }) : T("palm.cmpz.mounts", "เนินที่เด่นบนมือที่ติดตัวคือ{ma} และบนมือที่สร้างเองคือ{mb}", { ma: mr.a, mb: mr.b }));
    P.push(T("palm.cmpz.closing", "มือที่ติดตัวบอกว่าคุณเริ่มจากตรงไหน มือที่สร้างเองบอกว่าคุณมาไกลแค่ไหน"));
    return { title: T("palm.cmpz.title", c.title), paragraphs: P, rows: rows };
  }
  /* ---------- โหมดทั้งสองมือ: ไปถ่ายมือที่ 2 / ตารางเทียบ ---------- */
  function renderPair() {
    var nx = $("#plPairNext"), cmpSec = $("#plCompare");
    var showNext = S.sideMode === "both" && S.pairStep === 0 && !!S.result;
    nx.hidden = !showNext;
    if (showNext) {
      var nextSide = S.side === S.dom ? inbornSide() : S.dom;
      $("#plPairMsg").innerHTML = esc(T("palm.pair.a", "อ่านมือที่ 1:")) + " <b>" + esc(sideTh(S.side)) + "</b> (" + esc(roleOf(S.side).short) + ") " + esc(T("palm.pair.b", "แล้ว — ต่อไปถ่าย")) + "<b>" + esc(sideTh(nextSide)) + "</b> (" + esc(roleOf(nextSide).short) + ") " + esc(T("palm.pair.c", "เพื่อเทียบกัน"));
      $("#plNextHand").textContent = T("palm.pair.btn", "ถ่ายมือที่ 2: {side}", { side: sideTh(nextSide) });
    } else $("#plNextHand").textContent = T("palm.nextHand", "ถ่ายมือที่ 2");
    cmpSec.hidden = !S.cmp;
    if (!S.cmp) { $("#plCmpTitle").textContent = T("palm.cmp.title", "เทียบสองมือ"); return; }
    var c = S.cmp.cmp, cv = cmpView();
    $("#plCmpTitle").textContent = cv.title;
    $("#plCmpA").textContent = sideTh(S.cmp.A.side) + " · " + roleInborn();
    $("#plCmpB").textContent = sideTh(S.cmp.B.side) + " · " + roleMade();
    $("#plCmpSum").textContent = T("palm.cmp.sum", "เหมือนกัน {same} จาก {total} หัวข้อ — {verdict} (อ่านคำอธิบายในคำทำนายด้านบน)", { same: c.same, total: c.total, verdict: c.similar ? T("palm.cmp.similar", "สองมือไปในทางเดียวกัน") : T("palm.cmp.differ", "สองมือต่างกันอย่างน่าสนใจ") });
    $("#plCmpRows").innerHTML = cv.rows.map(function (r) { return "<tr><td>" + esc(r.th) + '</td><td class="' + (r.same ? "same" : "") + '">' + esc(r.a) + '</td><td class="' + (r.same ? "same" : "") + '">' + esc(r.b) + (r.same ? " ✓" : "") + "</td></tr>"; }).join("");
  }
  $("#plNextHand").addEventListener("click", function () {
    if (!S.result) return;
    touch();
    S.pair = [{ side: S.side, R: S.result }]; S.pairStep = 1;
    clearReading();
    renderSide(); renderPair(); setStep(1);
    $("#plStage").scrollIntoView({ behavior: smooth(), block: "start" });
    var nxs = expectedSide(), camOn = camera.active;
    engine(function () { return T("palm.eng.next", "ถ่าย{side} ({role}) ต่อได้เลย", { side: sideTh(nxs), role: roleOf(nxs).short }) + (camOn ? "" : T("palm.eng.nextCam", " — เปิดกล้องหรืออัปโหลดรูป")); }, "ok");
  });
  $("#plEditAgain").addEventListener("click", function () { touch(); editSec.scrollIntoView({ behavior: smooth(), block: "start" }); setStep(2); });

  /* ---------- การ์ดแชร์ 1080×1350 ---------- */
  function wrapTh(c, text, maxW) {
    var segs = (typeof Intl !== "undefined" && Intl.Segmenter) ? Array.from(new Intl.Segmenter(isZh() ? "zh" : "th", { granularity: "word" }).segment(text), function (s) { return s.segment; }) : text.split("");
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
    c.textAlign = "right"; c.font = "500 34px " + FF; c.fillStyle = "#c9d0ea"; c.fillText(T("palm.card.title", "ดูลายมือ"), W - 72, 96);
    // วงกลม + ภาพลายเส้นมือ (ไม่ใช้ภาพถ่าย)
    var cy = 440, r = 220;
    c.beginPath(); c.arc(W / 2, cy, r + 14, 0, Math.PI * 2); c.fillStyle = E.color; c.fill();
    c.save(); c.beginPath(); c.arc(W / 2, cy, r, 0, Math.PI * 2); c.clip(); c.fillStyle = "#0e1430"; c.fillRect(W / 2 - r, cy - r, 2 * r, 2 * r);
    drawPalmGlyph(c, W / 2, cy, r, S.lines, S.F ? S.F.asp : 1.6);
    c.restore();
    c.textAlign = "center"; c.fillStyle = "#fff";
    c.font = "700 92px " + FF; c.fillText(elHand(R.el.top.id), W / 2, 750);
    c.font = "400 34px " + FF; c.fillStyle = "#c9d0ea";
    c.fillText(sideTh(S.side) + " · " + R.el.top.pct + "% · " + T("palm.card.second", "ธาตุรอง{el}", { el: elTh(R.el.second.id) }) + " " + R.el.second.pct + "%", W / 2, 830);
    // 2–3 ประโยคเด่นจากคำทำนายที่เรียบเรียงแล้ว (สำรอง: จุดเด่นของธาตุ)
    var keys = keySentences(S.narr, 5, 60, S.facts), drawn = 0;
    if (!keys.length) keys = E.traits.slice(0, 3).map(function (t, i) { return KT("elements." + R.el.top.id + ".traits." + i, t); });
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
    rd.lines.filter(function (l) { return l.id === "head" || l.id === "heart"; }).forEach(function (l, i) { c.fillText(KT("lines." + l.id + ".th", l.th) + ": " + lineCatLabel(l.id, l.items[0].cat), W / 2, 1196 + i * 40, W - 140); });
    c.font = "400 24px " + FF; c.fillStyle = "#8f9bc4";
    wrapTh(c, KT("disclaimerShort", KB.disclaimerShort) + " · " + T("palm.card.noSave", "ไม่บันทึกภาพ"), W - 140).forEach(function (l, i) { c.fillText(l, W / 2, 1290 + i * 30); });
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
        try { await navigator.share({ files: [file], title: T("palm.share.title", "ดูลายมือ — LENSIQ"), text: elHand(S.result.el.top.id) + " " + KT("disclaimerShort", KB.disclaimerShort) }); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      var a = document.createElement("a"); a.href = cardUrl; a.download = "lensiq-palm.png"; document.body.append(a); a.click(); a.remove();
      toast(T("palm.toast.saved", "บันทึกการ์ดแล้ว"));
    } catch (e) { console.error(e); toast(T("palm.toast.cardFail", "สร้างการ์ดไม่สำเร็จ")); }
    finally { b.disabled = false; }
  });
  $("#plPrint").addEventListener("click", function () { touch(); window.print(); });
  $("#plAgain").addEventListener("click", function () { reset(); });

  /** ล้างผลของมือปัจจุบัน (คงโหมดและผลมือที่ 1 ไว้) */
  function clearReading() {
    resultSec.hidden = true; editSec.hidden = true;
    S.src = S.hand = S.F = S.canon = S.R = S.auto = S.lines = S.result = S.narr = S.facts = null;
    S.cmp = null; S.cmpFirst = null; S.sideDet = null; S.sideMismatch = null;
    narrToken++; $("#plNarr").innerHTML = "";
    S.minor = {}; S.mounts = []; S.taps = []; S.mode = "edit";
    renderMinor(); renderMounts();
    resCanvas.getContext("2d").clearRect(0, 0, resCanvas.width, resCanvas.height);
    edCv.getContext("2d").clearRect(0, 0, edCv.width, edCv.height);
    $("#plCardImg").hidden = true; if (cardUrl) { URL.revokeObjectURL(cardUrl); cardUrl = null; }
    renderQc([{ label: ["palm.qc.hand", "พบมือ"], ok: false, tip: ["palm.qc.startTip", "เปิดกล้องหรืออัปโหลดรูป"] }]);
  }
  function reset() {
    clearReading();
    $("#plNick").value = ""; // ชื่อเล่นไม่เก็บ ล้างทุกครั้งที่เริ่มคนถัดไป
    S.liveSide = S.liveCand = null; S.liveCount = 0;
    resetPair(); renderSide();
    setStep(1);
    $("#plStage").scrollIntoView({ block: "start" });
    engine(function () { return ready ? T("palm.eng.nextPerson", "พร้อมอ่านคนถัดไป") : T("palm.eng.readyShort", "พร้อมใช้งาน"); }, "ok");
    touch();
  }

  /* ---------- สถิติบูธ (ไม่ระบุตัวตน) ---------- */
  function renderStats() {
    var st = lsGet(STATS_KEY, null), box = $("#plStats");
    if (!st || !st.total) { box.innerHTML = '<p class="muted">' + esc(T("palm.stats.none", "ยังไม่มีการอ่านในเครื่องนี้")) + "</p>"; return; }
    var d = new Date(), today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    box.innerHTML = '<p class="stat-n"><b>' + st.total + "</b> " + esc(T("palm.stats.times", "ครั้ง")) + " <small>(" + esc(T("palm.stats.today", "วันนี้ {n}", { n: (st.days || {})[today] || 0 })) + ")</small></p>" +
      PC.ELEMENTS.map(function (k) { var n = (st.types || {})[k] || 0, e = KB.elements[k]; return '<div class="elbar"><span>' + esc(elTh(k)) + '</span><i style="--w:' + Math.round(n / st.total * 100) + "%;--c:" + e.color + '"></i><b>' + n + "</b></div>"; }).join("");
  }
  $("#plStatsOn").checked = !!prefs.stats;
  $("#plStatsOn").addEventListener("change", /** @this {HTMLInputElement} */ function () { prefs.stats = this.checked; lsSet(PREF_KEY, prefs); });
  $("#plStatsClear").addEventListener("click", function () { if (confirm(T("palm.stats.confirm", "ล้างสถิติการอ่านในเครื่องนี้?"))) { try { localStorage.removeItem(STATS_KEY); } catch (e) { /* ไม่เป็นไร */ } renderStats(); } });
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
      if (left <= 15) { el.hidden = false; el.textContent = T("palm.idle", "กลับหน้าเริ่มต้นใน {n} วินาที — แตะเพื่ออยู่ต่อ", { n: left }); }
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

  function renderSources() {
    $("#plEthics").textContent = KT("ethics", KB.ethics);
  }
  renderSources();

  if (!window.isSecureContext) showHttpsNote($("#plEngine"));
  engine(function () { return T("palm.eng.loading", "กำลังโหลดโมเดลจุดบนมือ..."); });
  loadModels().catch(function () {});
  renderPair();

  /* ---------- สลับภาษา (TH | 中文): วาดข้อความที่สร้างจาก JS ใหม่ และเรียบเรียงคำทำนายใหม่จากผลวัดชุดเดิม ---------- */
  window.addEventListener("lq-lang", function () {
    renderSide(); renderTradition(); renderTopics(); renderMinor(); renderMounts(); renderMountNote(); renderSources(); renderStats();
    if (lastQcItems) renderQc(lastQcItems);
    if (lastEngine && typeof lastEngine[0] === "function") engine(lastEngine[0], lastEngine[1]);
    if (S.hand) renderReadSide();
    if (!editSec.hidden && S.src) { if (S.mode === "tap") renderTapMsg(); else renderLineChips(); renderEditor(); }
    renderPair();
    if (S.result) { renderResult(S.result); $("#plCardImg").hidden = true; narrate(false); }
  });
  window.__palm = { get S() { return S; }, get guide() { return S.guide; }, makeCard: makeCard, narrate: narrate, keySentences: keySentences, reset: reset, detectHand: detectHand, detectHands: detectHands, loadModels: loadModels }; // ใช้ทดสอบ
})();
