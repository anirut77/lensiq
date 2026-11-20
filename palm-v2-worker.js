/* palm-v2-worker.js — Web Worker of the palm reading upgrade v1: runs the classical line finder (palm-v2-detect.js) off the main
   thread so the page never freezes (independent review round 1, d). Same origin only (CSP worker-src 'self'). It receives a crop
   of the photo as pixels, returns line geometry and the finder's maps, keeps nothing and sends nothing anywhere. */
(function () {
  "use strict";
  var W = /** @type {any} */ (self);
  W.importScripts("palm-v2-kb.js?v=1", "palm-v2-detect.js?v=2", "palm-v2.js?v=2");
  var PV = W.PalmV2, V3 = null;
  /** v3 result in the v2 shape (applyDetection); geometry only, no maps */
  function v3Det(V3m, m) {
    var d = V3m.detect(m.rgba, m.w, m.h, m.hand, { minors: true }), v2 = V3m.toV2(d), z = {};
    Object.keys(d.lines).forEach(function (id) { z[id] = { z: d.lines[id].z, solid: d.lines[id].solid }; });
    return { lines: v2.lines, asp: v2.asp, ms: d.ms, s: d.s, v3: { zLimit: d.zLimit, method: d.method, lines: z, marriage: d.marriage }, lowRes: false };
  }
  W.addEventListener("message", function (ev) {
    var m = ev.data || {};
    try {
      if (m.v3) { // v3 spike finder (sub-switch LENSIQ_PALM_V3_LINES): same origin script, nothing sent anywhere
        if (!V3) { W.importScripts("palm-v3-lines.js?v=1"); V3 = W.PalmV3Lines; }
        W.postMessage({ id: m.id, det: v3Det(V3, m) });
        return;
      }
      var det = PV.detect(m.rgba, m.w, m.h, m.hand, { school: m.school });
      var D = det._D;
      W.postMessage({ id: m.id, det: det }, [D.R.buffer, D.g.buffer]);
    } catch (e) { W.postMessage({ id: m.id, error: String(e && e.message || e) }); }
  });
})();
