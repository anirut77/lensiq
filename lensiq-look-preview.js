/* lensiq-look-preview.js — "ลองดูผ่านกล้อง / Try with camera / 用相机试试": live preview of a look suggestion on faceread.
 * docs/BEAUTY-IMAGE-DESIGN.md §2 (MVP option ก: brows, lip colour, eyeliner), protocol docs/LOOK-PREVIEW-EVAL.md.
 *
 * Engine: MediaPipe Face Landmarker 478 (vendor/models/face-landmarker/face_landmarker_lm.task, Apache-2.0; the facial-movement
 * model is removed from that file) through the vendored Tasks Vision bundle, CPU delegate, VIDEO mode, ONE face, no
 * blendshapes, no transformation matrix. Frames stay in this tab: the camera frame and the drawing live only in a canvas on
 * screen; nothing is saved, uploaded or exported (no save button in the MVP). The camera stops when the dialog closes.
 *
 * Only kinds that passed the fixed synthetic measurement are LIVE (tools/look-preview-results.json; the unit test checks it).
 * Other suggestions keep their illustration card.
 *
 *   IDX · MP_OPTIONS · LIVE
 *   lips(lms, W, H) -> {outer, inner}          liner(lms, W, H, style) -> [{base, wing|null, width}] x2
 *   brows(lms, W, H, style) -> [poly, poly]    glasses(lms, W, H) -> {outerR, innerR, outerL, innerL, mid}
 *   smoother() -> (lms, tMs) -> lms            draw(ctx, lms, W, H, look) · eraseBrows(ctx, lms, W, H)
 *   available() · buttonHTML(item, lang) · bind(container, items, lang) · open(item, lang) · close()
 */
(function (root) {
  "use strict";
  var NODE = typeof module !== "undefined" && module.exports;
  /* MediaPipe Face Mesh indices. "R" = the subject's right eye / brow (image left in an unmirrored frame). */
  var IDX = Object.freeze({
    lipOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
    lipInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
    lidUpperR: [33, 246, 161, 160, 159, 158, 157, 173, 133],   // outer -> inner
    lidUpperL: [263, 466, 388, 387, 386, 385, 384, 398, 362],  // outer -> inner
    browR: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],         // upper outer -> inner, then lower inner -> outer
    browL: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
    eyeOuterR: 33, eyeInnerR: 133, eyeOuterL: 263, eyeInnerL: 362, mouthL: 61, mouthR: 291
  });
  var MP_OPTIONS = Object.freeze({ runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
    minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
  /** kinds that passed the fixed synthetic measurement (tools/look-preview-results.json) */
  // measured 2026-11-13 on held-out synthetic faces (tools/look-preview-results.json, docs/LOOK-PREVIEW-RESULTS.md);
  // brow-arch and glasses passed there too but stay off until a field check (no skin texture / head turns in the set)
  var LIVE = ["lip", "liner", "brow"];

  var px = function (/** @type {any[]} */ lms, /** @type {number} */ i, /** @type {number} */ W, /** @type {number} */ H) { return [lms[i].x * W, lms[i].y * H]; };
  var ring = function (/** @type {any[]} */ lms, /** @type {number[]} */ idx, /** @type {number} */ W, /** @type {number} */ H) { return idx.map(function (i) { return px(lms, i, W, H); }); };
  var sub = function (/** @type {number[]} */ a, /** @type {number[]} */ b) { return [a[0] - b[0], a[1] - b[1]]; };
  var len = function (/** @type {number[]} */ v) { return Math.hypot(v[0], v[1]) || 1e-9; };
  var unit = function (/** @type {number[]} */ v) { var n = len(v); return [v[0] / n, v[1] / n]; };
  var mean = function (/** @type {number[][]} */ ps) { var x = 0, y = 0; ps.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / ps.length, y / ps.length]; };
  /** the face's "up" direction in the image: perpendicular to the eye line, pointing to the forehead (y < 0 side) */
  function upDir(/** @type {any[]} */ lms, /** @type {number} */ W, /** @type {number} */ H) {
    var a = px(lms, IDX.eyeOuterR, W, H), b = px(lms, IDX.eyeOuterL, W, H), e = unit(sub(b, a)), u = [e[1], -e[0]];
    return u[1] > 0 ? [-u[0], -u[1]] : u;
  }

  function lips(/** @type {any[]} */ lms, /** @type {number} */ W, /** @type {number} */ H) {
    return { outer: ring(lms, IDX.lipOuter, W, H), inner: ring(lms, IDX.lipInner, W, H) };
  }
  var WING = /** @type {Record<string, number>} */ ({ thin: 0, tight: 0, "wing-short": 0.2, "wing-long": 0.4 });
  /** eyeliner base curve on the upper lid (outer -> inner) and the wing from the outer corner */
  function liner(/** @type {any[]} */ lms, /** @type {number} */ W, /** @type {number} */ H, /** @type {string} */ style) {
    var up = upDir(lms, W, H);
    return [IDX.lidUpperR, IDX.lidUpperL].map(function (idx) {
      var base = ring(lms, idx, W, H), outer = base[0], inner = base[base.length - 1];
      var w = len(sub(outer, inner)), k = WING[style] || 0, wing = null;
      if (k > 0) {
        var out = unit(sub(outer, inner)), a = 0.45; // about 26° above the eye line
        var d = unit([out[0] * Math.cos(a) + up[0] * Math.sin(a), out[1] * Math.cos(a) + up[1] * Math.sin(a)]);
        wing = [outer, [outer[0] + d[0] * w * k, outer[1] + d[1] * w * k]];
      }
      return { base: base, wing: wing, width: w };
    });
  }
  /** brow polygons per style: fill / define = the brow as the landmarks give it; extend = a longer tail; lift = tail raised;
   *  arch = the middle raised (used with eraseBrows) */
  function brows(/** @type {any[]} */ lms, /** @type {number} */ W, /** @type {number} */ H, /** @type {string} */ style) {
    var up = upDir(lms, W, H);
    return [IDX.browR, IDX.browL].map(function (idx) {
      var poly = ring(lms, idx, W, H);
      var upper = poly.slice(0, 5), lower = poly.slice(5); // upper outer->inner, lower inner->outer
      var L = len(sub(upper[0], upper[4]));
      if (style === "extend") {
        // along the eye line (roll clamped to ±35°), away from the brow head, starting from the brow's outermost point
        var eye = unit(sub(px(lms, IDX.eyeOuterL, W, H), px(lms, IDX.eyeOuterR, W, H)));
        var ang = Math.max(-0.61, Math.min(0.61, Math.atan2(eye[1], eye[0] < 0 ? -eye[0] : eye[0])));
        var dir = [Math.cos(ang), Math.sin(ang)], away = sub(mean([upper[0], lower[4]]), mean([upper[4], lower[0]]));
        if (dir[0] * away[0] + dir[1] * away[1] < 0) dir = [-dir[0], -dir[1]];
        var far = poly.reduce(function (a, p) { return (p[0] - a[0]) * dir[0] > 0 ? p : a; }, poly[0]);
        var tip = [far[0] + dir[0] * L * 0.22 + up[0] * L * 0.02, far[1] + dir[1] * L * 0.22 + up[1] * L * 0.02];
        return [tip].concat(upper, lower);
      }
      if (style === "lift") {
        var wt = [1, 0.5, 0, 0, 0], lf = function (p, w) { return [p[0] + up[0] * L * 0.14 * w, p[1] + up[1] * L * 0.14 * w]; };
        return upper.map(function (p, i) { return lf(p, wt[i]); }).concat(lower.map(function (p, i) { return lf(p, wt[4 - i]); }));
      }
      if (style === "arch") {
        var wa = [0.2, 0.75, 1, 0.6, 0.2], ar = function (p, w) { return [p[0] + up[0] * L * 0.1 * w, p[1] + up[1] * L * 0.1 * w]; };
        return upper.map(function (p, i) { return ar(p, wa[i]); }).concat(lower.map(function (p, i) { return ar(p, wa[4 - i]); }));
      }
      return poly;
    });
  }
  function glasses(/** @type {any[]} */ lms, /** @type {number} */ W, /** @type {number} */ H) {
    var oR = px(lms, IDX.eyeOuterR, W, H), iR = px(lms, IDX.eyeInnerR, W, H), oL = px(lms, IDX.eyeOuterL, W, H), iL = px(lms, IDX.eyeInnerL, W, H);
    return { outerR: oR, innerR: iR, outerL: oL, innerL: iL, mid: mean([iR, iL]) };
  }

  /** One Euro filter on every landmark (still face: strong smoothing; real move: follows quickly) */
  function smoother(/** @type {any} */ o) {
    var minCut = (o && o.minCutoff) || 1.2, beta = (o && o.beta) || 18, dCut = 1.0;
    /** @type {any[]|null} */ var prev = null, dprev = /** @type {any[]|null} */ (null), tPrev = 0;
    var alpha = function (/** @type {number} */ cut, /** @type {number} */ dt) { var tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / dt); };
    return function (/** @type {any[]} */ lms, /** @type {number} */ t) {
      if (!prev || !dprev) { prev = lms.map(function (p) { return { x: p.x, y: p.y, z: p.z || 0 }; }); dprev = lms.map(function () { return { x: 0, y: 0 }; }); tPrev = t; return prev; }
      var dt = Math.max(1e-3, (t - tPrev) / 1000); tPrev = t;
      var ad = alpha(dCut, dt), P = prev, D = dprev;
      var out = lms.map(function (p, i) {
        var dx = (p.x - P[i].x) / dt, dy = (p.y - P[i].y) / dt;
        var ex = D[i].x + ad * (dx - D[i].x), ey = D[i].y + ad * (dy - D[i].y);
        D[i] = { x: ex, y: ey };
        var a = alpha(minCut + beta * Math.hypot(ex, ey), dt);
        return { x: P[i].x + a * (p.x - P[i].x), y: P[i].y + a * (p.y - P[i].y), z: p.z || 0 };
      });
      prev = out; return out;
    };
  }

  /* ---------------- drawing (on the preview canvas only) ---------------- */
  function poly(/** @type {any} */ ctx, /** @type {number[][]} */ ps) { ctx.moveTo(ps[0][0], ps[0][1]); for (var i = 1; i < ps.length; i++) ctx.lineTo(ps[i][0], ps[i][1]); ctx.closePath(); }
  /** skin colour just below a brow (between brow and eye), median of a small patch @returns {number[]} */
  function skinBelow(/** @type {any} */ ctx, /** @type {number[][]} */ brow, /** @type {number[]} */ up) {
    var c = mean(brow), L = len(sub(brow[0], brow[4]));
    var x = Math.round(c[0] - up[0] * L * 0.22), y = Math.round(c[1] - up[1] * L * 0.22), r = Math.max(2, Math.round(L * 0.08));
    var d = ctx.getImageData(Math.max(0, x - r), Math.max(0, y - r), 2 * r, r).data, R = [], G = [], B = [];
    for (var i = 0; i < d.length; i += 4) { R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); }
    var med = function (/** @type {number[]} */ a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1] || 0; };
    return [med(R), med(G), med(B)];
  }
  /** the erase step of an arch change: cover each drawn brow with the skin colour found just below it (soft edge) */
  function eraseBrows(/** @type {any} */ ctx, /** @type {any[]} */ lms, /** @type {number} */ W, /** @type {number} */ H) {
    var up = upDir(lms, W, H);
    brows(lms, W, H, "fill").forEach(function (b) {
      var s = skinBelow(ctx, b, up), L = len(sub(b[0], b[4]));
      ctx.save(); ctx.fillStyle = "rgb(" + s.join(",") + ")"; ctx.strokeStyle = ctx.fillStyle; ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, L * 0.12); ctx.filter = "blur(" + Math.max(1, Math.round(L * 0.025)) + "px)";
      ctx.beginPath(); poly(ctx, b); ctx.fill(); ctx.stroke(); ctx.restore();
    });
  }
  /** draw one look on top of the frame already on ctx. look = {kind: "lip"|"liner"|"brow"|"brow-arch", lip, finish, liner, brow}
   *  @param {any} ctx @param {any[]} lms @param {number} W @param {number} H @param {any} look */
  function draw(ctx, lms, W, H, look) {
    var k = look && look.kind;
    ctx.save();
    if (k === "lip") {
      var g = lips(lms, W, H), col = (look.lip && look.lip[look.shade || 0]) || "#c2455a";
      ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = look.finish === "gloss" ? 0.38 : 0.55; ctx.fillStyle = col;
      ctx.beginPath(); poly(ctx, g.outer); poly(ctx, g.inner); ctx.fill("evenodd");
      if (look.finish === "gloss") {
        ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.18; ctx.fillStyle = "#ffffff";
        var lo = mean(g.outer.slice(3, 8)), w = len(sub(g.outer[0], g.outer[10]));
        ctx.beginPath(); ctx.ellipse(lo[0], lo[1] - w * 0.05, w * 0.14, w * 0.04, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (k === "liner") {
      liner(lms, W, H, look.liner || "thin").forEach(function (e) {
        var lw = Math.max(1.2, e.width * (look.liner === "tight" ? 0.045 : 0.06));
        ctx.globalAlpha = 0.9; ctx.strokeStyle = look.liner === "tight" ? "#3a2418" : "#141010"; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(e.base[0][0], e.base[0][1]); for (var i = 1; i < e.base.length - 2; i++) ctx.lineTo(e.base[i][0], e.base[i][1]); ctx.stroke();
        if (e.wing) {
          var a = e.wing[0], b = e.wing[1], n = unit(sub(b, a)), m = [-n[1] * lw * 0.6, n[0] * lw * 0.6];
          ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(a[0] + m[0], a[1] + m[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(a[0] - m[0], a[1] - m[1]); ctx.closePath(); ctx.fill();
        }
      });
    } else if (k === "brow" || k === "brow-arch") {
      var st = k === "brow-arch" ? "arch" : look.brow || "fill";
      if (k === "brow-arch") eraseBrows(ctx, lms, W, H);
      ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = st === "define" ? 0.3 : 0.5; ctx.fillStyle = look.browColour || "#4a3426";
      ctx.filter = "blur(0.6px)";
      brows(lms, W, H, st).forEach(function (b) { ctx.beginPath(); poly(ctx, b); ctx.fill(); });
    }
    ctx.restore();
  }

  /* ---------------- the dialog (browser only) ---------------- */
  var TXT = {
    th: { title: "ลองดูผ่านกล้อง", note: "ไม่เก็บภาพ ภาพไม่ออกจากเครื่อง ปิดหน้าต่างนี้แล้วกล้องหยุดทันที ภาพตัวอย่างเป็นการวาดทับโดยประมาณ สีบนจอเพี้ยนตามแสงและกล้อง",
      close: "ปิด", tryBtn: "ลองดูผ่านกล้อง", unavailable: "อุปกรณ์นี้แสดงภาพตัวอย่างสดไม่ได้ (ต้องใช้กล้องและการประมวลผลกราฟิกของเบราว์เซอร์) ดูภาพวาดประกอบแทนได้",
      measured: "ความแม่นยำวัดจากใบหน้าสังเคราะห์ (วาดขึ้น) ยังไม่ได้วัดกับคนจริง", styles: "แบบ", loading: "กำลังเปิดกล้อง…" },
    en: { title: "Try with camera",
      note: "No photos are stored; images never leave your device, and the camera stops when you close this window. " +
        "The preview is an approximate overlay; screen colours vary with light and camera.",
      close: "Close", tryBtn: "Try with camera",
      unavailable: "Live preview is not available on this device (it needs a camera and the browser's graphics processing). The illustration shows the idea instead.",
      measured: "Accuracy measured on synthetic (drawn) faces only, not yet on real people", styles: "Style", loading: "Starting the camera…" },
    zh: { title: "用相机试试", note: "不保存照片，图像不会离开你的设备，关闭此窗口后相机立即停止。预览为近似叠加效果，屏幕颜色会随光线和相机而不同。",
      close: "关闭", tryBtn: "用相机试试", unavailable: "此设备无法显示实时预览（需要相机和浏览器的图形处理功能），可以参考示意图。",
      measured: "准确度仅在合成（绘制）人脸上测量，尚未在真人上测量", styles: "样式", loading: "正在打开相机…" }
  };
  var STYLES = /** @type {Record<string, string[]>} */ ({ brow: ["fill", "define", "extend", "lift"], liner: ["thin", "tight", "wing-short", "wing-long"] });
  var STYLE_NAME = /** @type {Record<string, Record<string, string>>} */ ({
    th: { fill: "เติมให้เต็ม", define: "เน้นเส้นเดิม", extend: "ต่อหางคิ้ว", lift: "ยกหางคิ้ว", arch: "โค้งขึ้น",
      thin: "เส้นบาง", tight: "ชิดโคนขนตา", "wing-short": "ปีกสั้น", "wing-long": "ปีกยาว" },
    en: { fill: "Fill", define: "Define", extend: "Longer tail", lift: "Lifted tail", arch: "Arch", thin: "Thin", tight: "Tight line", "wing-short": "Short wing", "wing-long": "Long wing" },
    zh: { fill: "补满", define: "勾勒原眉", extend: "延长眉尾", lift: "眉尾上扬", arch: "弯眉", thin: "细线", tight: "内眼线", "wing-short": "短眼尾", "wing-long": "长眼尾" }
  });
  var langOf = function (/** @type {any} */ l) { return l === "en" || l === "zh" ? l : "th"; };
  /** @type {Record<string, string>} */
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  var esc = function (/** @type {any} */ s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  var kindOf = function (/** @type {any} */ it) { return it && it.preview && LIVE.indexOf(it.preview) >= 0 ? it.preview : null; };

  function available() {
    var n = /** @type {any} */ (root).navigator;
    return LIVE.length > 0 && !!(n && n.mediaDevices && n.mediaDevices.getUserMedia);
  }
  function buttonHTML(/** @type {any} */ it, /** @type {string} */ lang) {
    var k = kindOf(it);
    return k ? '<button type="button" class="btn ghost lq-look-try" data-look-try="' + esc(k) + '" data-look-for="' + esc(it.id) + '">' + esc(TXT[langOf(lang)].tryBtn) + "</button>" : "";
  }
  function bind(/** @type {any} */ container, /** @type {any[]} */ items, /** @type {string} */ lang) {
    Array.prototype.forEach.call(container.querySelectorAll("[data-look-try]"), function (/** @type {any} */ b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-look-for"), it = (items || []).filter(function (x) { return x.id === id; })[0];
        if (it) open(it, lang);
      });
    });
  }

  var S = /** @type {any} */ ({ stream: null, raf: 0, lm: null, dlg: null, look: null, smooth: null, token: null });
  /* one token per open(): close() and a new open() cancel it, so a camera that starts after the dialog was closed (permission
     prompt still open, slow camera) is stopped at once and never drawn (independent review S1) */
  function newToken() {
    if (S.token) S.token.cancel();
    var t = { cancelled: false, cancel: function () { t.cancelled = true; } };
    S.token = t;
    return t;
  }
  /** @param {() => Promise<any>} gum @param {{cancelled: boolean}} token @returns {Promise<any>} */
  async function acquire(gum, token) {
    var s = await gum();
    if (token.cancelled) { try { s.getTracks().forEach(function (/** @type {any} */ x) { x.stop(); }); } catch (e) { /* gone */ } return null; }
    return s;
  }
  async function engine() {
    if (S.lm) return S.lm;
    var base = new URL(".", root.location.href).href;
    var V = await import(base + "vendor/mediapipe/vision_bundle.mjs");
    var files = await V.FilesetResolver.forVisionTasks(base + "vendor/mediapipe/wasm");
    var model = base + "vendor/models/face-landmarker/face_landmarker_lm.task";
    S.lm = await V.FaceLandmarker.createFromOptions(files, Object.assign({ baseOptions: { modelAssetPath: model, delegate: "CPU" } }, MP_OPTIONS));
    return S.lm;
  }
  function stop() {
    if (S.token) { S.token.cancel(); S.token = null; }
    if (S.raf) { root.cancelAnimationFrame(S.raf); S.raf = 0; }
    if (S.stream) { S.stream.getTracks().forEach(function (/** @type {any} */ t) { t.stop(); }); S.stream = null; }
    var v = S.dlg && S.dlg.querySelector("video");
    if (v) { try { v.pause(); } catch (e) { /* ignore */ } v.srcObject = null; }
  }
  function close() { stop(); if (S.dlg && S.dlg.open) S.dlg.close(); }
  function unavailable() {
    var u = S.dlg && S.dlg.querySelector("[data-look-unavailable]"), w = S.dlg && S.dlg.querySelector("[data-look-live]");
    stop(); if (u) u.hidden = false; if (w) w.hidden = true;
  }
  function dialog(/** @type {string} */ l) {
    var d = root.document, t = TXT[l];
    var dlg = d.getElementById("lqLookPreview");
    if (!dlg) {
      dlg = d.createElement("dialog"); dlg.id = "lqLookPreview"; dlg.className = "lq-look-dialog"; dlg.setAttribute("data-lq-look", "");
      dlg.setAttribute("aria-labelledby", "lqLookPreviewTitle");
      d.body.appendChild(dlg);
      dlg.addEventListener("close", stop);
      dlg.addEventListener("cancel", stop);
    }
    dlg.setAttribute("lang", l === "zh" ? "zh-Hans" : l);
    dlg.innerHTML = '<h3 id="lqLookPreviewTitle">' + esc(t.title) + "</h3>" +
      '<div data-look-live><video playsinline muted hidden></video><canvas width="640" height="480" class="lq-look-canvas"></canvas>' +
      '<div class="lq-look-styles" role="group" aria-label="' + esc(t.styles) + '"></div></div>' +
      '<p data-look-unavailable hidden>' + esc(t.unavailable) + "</p>" +
      '<p class="lq-look-dnote">' + esc(t.note) + '</p><p class="lq-look-dnote">' + esc(t.measured) + "</p>" +
      '<button type="button" class="btn primary" data-look-close>' + esc(t.close) + "</button>";
    dlg.querySelector("[data-look-close]").addEventListener("click", close);
    S.dlg = dlg;
    return dlg;
  }
  function styleChips(/** @type {any} */ dlg, /** @type {any} */ it, /** @type {string} */ l) {
    var box = dlg.querySelector(".lq-look-styles"), k = it.preview, opts = /** @type {any[]} */ ([]);
    if (k === "lip") opts = (it.look && it.look.lip || []).map(function (c, i) { return { v: i, label: c, swatch: c }; });
    else if (k === "brow") opts = STYLES.brow.concat(LIVE.indexOf("brow-arch") >= 0 ? ["arch"] : []).map(function (s) { return { v: s, label: STYLE_NAME[l][s] }; });
    else if (k === "liner") opts = STYLES.liner.map(function (s) { return { v: s, label: STYLE_NAME[l][s] }; });
    box.innerHTML = opts.map(function (o, i) {
      return '<button type="button" class="btn ghost" data-look-style="' + esc(o.v) + '" aria-pressed="' + (i ? "false" : "true") + '">' +
        (o.swatch ? '<i class="lq-look-sw" style="background:' + esc(o.swatch) + '"></i>' : "") + esc(o.swatch ? (i + 1) : o.label) + "</button>";
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll("[data-look-style]"), function (/** @type {any} */ b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(box.querySelectorAll("[data-look-style]"), function (/** @type {any} */ x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        var v = b.getAttribute("data-look-style");
        if (k === "lip") S.look.shade = +v; else if (k === "liner") S.look.liner = v;
        else { S.look.kind = v === "arch" ? "brow-arch" : "brow"; S.look.brow = v; }
      });
    });
  }
  /** open the dialog for one suggestion @param {any} it @param {string} lang */
  async function open(it, lang) {
    stop(); // a previous session (and its pending camera start) ends here
    var l = langOf(lang), dlg = /** @type {any} */ (dialog(l)), k = kindOf(it), token = newToken();
    S.look = Object.assign({ kind: k, shade: 0 }, it.look || {});
    if (k === "brow" && S.look.brow === "arch") S.look.brow = "fill"; // arch change only when brow-arch itself passed
    styleChips(dlg, it, l);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    var v = dlg.querySelector("video"), cv = dlg.querySelector("canvas"), ctx = cv.getContext("2d", { willReadFrequently: true });
    try {
      var gum = function () { return root.navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); };
      var stream = await acquire(gum, token);
      if (!stream) return; // closed (or opened again) while the camera was starting: already stopped
      S.stream = stream;
      v.srcObject = stream; await v.play();
      var lm = await engine();
      if (token.cancelled) return; // closed while the model loaded: stop() has run
      S.smooth = smoother();
      var tick = function () {
        if (!S.stream || token.cancelled) return;
        var W = v.videoWidth || 640, H = v.videoHeight || 480;
        if (cv.width !== W) { cv.width = W; cv.height = H; }
        ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0, W, H); ctx.restore(); // mirror, like a mirror
        var now = root.performance.now(), res = lm.detectForVideo(v, now), f = res && res.faceLandmarks && res.faceLandmarks[0];
        if (f) {
          var m = S.smooth(f.map(function (p) { return { x: 1 - p.x, y: p.y, z: p.z }; }), now);
          draw(ctx, m, W, H, S.look);
        }
        S.raf = root.requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { if (!token.cancelled) unavailable(); }
  }

  var api = { IDX: IDX, MP_OPTIONS: MP_OPTIONS, LIVE: LIVE, lips: lips, liner: liner, brows: brows, glasses: glasses, smoother: smoother, draw: draw,
    eraseBrows: eraseBrows, available: available, buttonHTML: buttonHTML, bind: bind, open: open, close: close, acquire: acquire, newToken: newToken, TEXT: TXT };
  if (NODE) module.exports = api; else /** @type {any} */ (root).LQLookPreview = api;
})(typeof window !== "undefined" ? window : globalThis);
