/* palm-v2-worker.js — Web Worker of the palm reading upgrade v1: runs the classical line finder (palm-v2-detect.js) off the main
   thread so the page never freezes (independent review round 1, d). Same origin only (CSP worker-src 'self'). It receives a crop
   of the photo as pixels, returns line geometry and the finder's maps, keeps nothing and sends nothing anywhere. */
(function () {
  "use strict";
  var W = /** @type {any} */ (self);
  W.importScripts("palm-v2-kb.js?v=1", "palm-v2-detect.js?v=2", "palm-v2.js?v=5");
  var PV = W.PalmV2;
  W.addEventListener("message", function (ev) {
    var m = ev.data || {};
    try {
      var det = PV.detect(m.rgba, m.w, m.h, m.hand, { school: m.school });
      var D = det._D;
      W.postMessage({ id: m.id, det: det }, [D.R.buffer, D.g.buffer]);
    } catch (e) { W.postMessage({ id: m.id, error: String(e && e.message || e) }); }
  });
})();
