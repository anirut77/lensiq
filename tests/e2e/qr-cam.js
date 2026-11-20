/* tests/e2e/qr-cam.js — init script (Chrome: Page.addScriptToEvaluateOnNewDocument; WebKit: page.addInitScript) that fakes
 * ONE camera showing a QR badge, for the Attendance PIN / QR tests (attendance-pinqr.e2e.mjs, attendance-qr-webkit.e2e.mjs).
 * The camera is a 640 x 480 canvas.captureStream(): white, with the QR code of window.__QR_TEXT drawn in the middle by the
 * page's own encoder (window.LQQR.matrix, attendance-qr.js) once both exist, 8 px per module, quiet zone 4 modules.
 * window.__QR_CAM_DENY = true makes getUserMedia reject with NotAllowedError. window.__QR_CAM.opens counts the streams given.
 * Synthetic: no person is filmed. Test-only: nothing here is loaded by production pages.
 */
(function () {
  "use strict";
  if (window.__QR_CAM) return;
  const md = navigator.mediaDevices;
  if (!md) return; // insecure context: nothing to fake
  const W = 640, H = 480, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  let tick = 0;
  function paint() {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    const text = window.__QR_TEXT, Q = window.LQQR;
    if (text && Q && Q.matrix) {
      try {
        const m = Q.matrix(String(text)), s = 8, side = (m.size + 8) * s, x0 = Math.round((W - side) / 2) + 4 * s, y0 = Math.round((H - side) / 2) + 4 * s;
        ctx.fillStyle = "#000000";
        for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.get(x, y)) ctx.fillRect(x0 + x * s, y0 + y * s, s, s);
      } catch (e) { /* text too long for the encoder: blank frame */ }
    }
    tick++; ctx.fillStyle = tick % 2 ? "#fefefe" : "#fdfdfd"; ctx.fillRect(0, 0, 2, 2); // frames keep changing
  }
  paint();
  setInterval(paint, 100);
  const state = { opens: 0 };
  window.__QR_CAM = state;
  md.getUserMedia = async () => {
    if (window.__QR_CAM_DENY) throw new DOMException("Permission denied", "NotAllowedError");
    state.opens++;
    return cv.captureStream(15);
  };
  md.enumerateDevices = async () => [{ deviceId: "qr-cam-1", groupId: "qr", kind: "videoinput", label: "QR test camera", toJSON() { return this; } }];
})();
