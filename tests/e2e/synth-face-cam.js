/* tests/e2e/synth-face-cam.js — init script: ONE fake front camera whose 1280x720 canvas shows a SYNTHETIC face drawn with
 * canvas shapes and gradients (an oval, two eyes, brows, nose, mouth, hair). No photo, no real person. TinyFaceDetector
 * finds it (WebKit, score ~0.76 at inputSize 224). Used by tests/e2e/faceread-webkit.e2e.mjs.
 * window.__LQ_SYNTH = { opens, blank(on) }   blank(true) paints a plain background (no face) instead of the face.
 */
(function () {
  "use strict";
  if (window.__LQ_SYNTH) return;
  var md = navigator.mediaDevices || new EventTarget();
  try { Object.defineProperty(navigator, "mediaDevices", { get: function () { return md; }, configurable: true }); } catch (e) { /* pinned already */ }
  var S = { opens: 0, blank: false };
  function __lqDrawSynthFace(ctx, W, H, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#8a9bb0"); g.addColorStop(1, "#5d6b7c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cx = W / 2 + Math.sin((t || 0) / 900) * 2, cy = H * 0.5, fw = H * 0.26, fh = H * 0.34;
    // neck + shoulders
    ctx.fillStyle = "#c98f6c"; ctx.fillRect(cx - fw * 0.38, cy + fh * 0.7, fw * 0.76, fh * 0.6);
    ctx.fillStyle = "#34495e"; ctx.beginPath(); ctx.ellipse(cx, H + fh * 0.2, fw * 1.9, fh * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    // hair back
    ctx.fillStyle = "#1d140f"; ctx.beginPath(); ctx.ellipse(cx, cy - fh * 0.18, fw * 1.08, fh * 1.02, 0, 0, Math.PI * 2); ctx.fill();
    // face with radial shading
    const sk = ctx.createRadialGradient(cx - fw * 0.15, cy - fh * 0.2, fw * 0.1, cx, cy, fw * 1.15);
    sk.addColorStop(0, "#f1c9a5"); sk.addColorStop(0.7, "#d9a27c"); sk.addColorStop(1, "#a8714f");
    ctx.fillStyle = sk; ctx.beginPath(); ctx.ellipse(cx, cy, fw, fh, 0, 0, Math.PI * 2); ctx.fill();
    // fringe
    ctx.fillStyle = "#1d140f"; ctx.beginPath(); ctx.ellipse(cx, cy - fh * 0.88, fw * 0.95, fh * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    const ex = fw * 0.4, ey = cy - fh * 0.12;
    for (const s of [-1, 1]) {
      // brow
      ctx.strokeStyle = "#2a1c14"; ctx.lineWidth = fh * 0.05; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx + s * ex * 0.45, ey - fh * 0.17); ctx.quadraticCurveTo(cx + s * ex, ey - fh * 0.24, cx + s * ex * 1.55, ey - fh * 0.15); ctx.stroke();
      // socket shadow
      ctx.fillStyle = "rgba(120,70,45,.35)"; ctx.beginPath(); ctx.ellipse(cx + s * ex, ey, fw * 0.26, fh * 0.11, 0, 0, Math.PI * 2); ctx.fill();
      // eye white, iris, pupil
      ctx.fillStyle = "#f4f1ec"; ctx.beginPath(); ctx.ellipse(cx + s * ex, ey, fw * 0.17, fh * 0.055, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3b2516"; ctx.beginPath(); ctx.arc(cx + s * ex, ey, fh * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#050302"; ctx.beginPath(); ctx.arc(cx + s * ex, ey, fh * 0.022, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#20140c"; ctx.lineWidth = fh * 0.014; ctx.beginPath(); ctx.ellipse(cx + s * ex, ey, fw * 0.17, fh * 0.055, 0, Math.PI, 2 * Math.PI); ctx.stroke();
    }
    // nose
    const ns = ctx.createLinearGradient(cx - fw * 0.15, 0, cx + fw * 0.15, 0); ns.addColorStop(0, "rgba(130,80,50,.45)");
    ns.addColorStop(0.5, "rgba(255,230,200,.25)"); ns.addColorStop(1, "rgba(130,80,50,.45)");
    ctx.fillStyle = ns; ctx.beginPath(); ctx.moveTo(cx - fw * 0.06, ey); ctx.lineTo(cx - fw * 0.17, cy + fh * 0.27); ctx.lineTo(cx + fw * 0.17, cy + fh * 0.27);
    ctx.lineTo(cx + fw * 0.06, ey); ctx.fill();
    ctx.fillStyle = "rgba(80,40,25,.7)"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * fw * 0.08, cy + fh * 0.27, fw * 0.045, fh * 0.02, 0, 0, Math.PI * 2); ctx.fill(); }
    // mouth
    ctx.fillStyle = "#a4473f"; ctx.beginPath(); ctx.ellipse(cx, cy + fh * 0.5, fw * 0.3, fh * 0.065, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#5a1f1a"; ctx.lineWidth = fh * 0.015; ctx.beginPath(); ctx.moveTo(cx - fw * 0.3, cy + fh * 0.5);
    ctx.quadraticCurveTo(cx, cy + fh * 0.53, cx + fw * 0.3, cy + fh * 0.5); ctx.stroke();
    // jaw shadow
    ctx.strokeStyle = "rgba(110,65,40,.35)"; ctx.lineWidth = fw * 0.08; ctx.beginPath(); ctx.ellipse(cx, cy, fw * 0.97, fh * 0.97, 0, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  md.enumerateDevices = function () {
    return Promise.resolve([{ deviceId: "synth-face-1", groupId: "synth", kind: "videoinput", label: "Synthetic face camera", toJSON: function () { return {}; } }]);
  };
  md.getUserMedia = function (c) {
    if (!c || !c.video) return Promise.reject(new TypeError("video required"));
    S.opens++;
    var cv = document.createElement("canvas"); cv.width = 1280; cv.height = 720;
    var x = cv.getContext("2d");
    var paint = function () { if (S.blank) { x.fillStyle = "#6f7f92"; x.fillRect(0, 0, 1280, 720); } else __lqDrawSynthFace(x, 1280, 720, performance.now()); };
    paint(); setInterval(paint, 66);
    var st = cv.captureStream(15), tr = st.getVideoTracks()[0];
    var gs = tr.getSettings.bind(tr);
    tr.getSettings = function () { return Object.assign({}, gs(), { deviceId: "synth-face-1", width: 1280, height: 720, facingMode: "user" }); };
    tr.getCapabilities = function () { return { deviceId: "synth-face-1", width: { min: 1, max: 1280 }, height: { min: 1, max: 720 } }; };
    tr.applyConstraints = function () { return Promise.resolve(); };
    return Promise.resolve(st);
  };
  window.__LQ_SYNTH = { get opens() { return S.opens; }, blank: function (on) { S.blank = !!on; } };
})();
