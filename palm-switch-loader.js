/* palm-switch-loader.js — loads palm reading upgrade v1 (palm-v2-*) on palm.html; moved unchanged out of palm.js (size cap).
   Must load right after palm.js. Holds no palm v2 code: it downloads palm-v2-* only when LENSIQ_PALM_V2 is true. */
/* palm reading upgrade v1 (switch window.LENSIQ_PALM_V2, lensiq-config.js ships false): its code and style are downloaded ONLY when
   the switch is on (independent review round 1, c); dynamic scripts with async = false run in order */
if (typeof window !== "undefined" && typeof document !== "undefined" && window.LENSIQ_PALM_V2 === true && document.getElementById("plV2")) {
  var pv2css = document.createElement("link"); pv2css.rel = "stylesheet"; pv2css.href = "palm-v2.css?v=3"; document.head.appendChild(pv2css);
  var pv2js = ["palm-v2-kb.js?v=1", "palm-v2-detect.js?v=2", "palm-v2.js?v=5", "palm-v2-ui.js?v=4"];
  pv2js.forEach(function (src) { var el = document.createElement("script"); el.src = src; el.async = false; document.body.appendChild(el); });
}
