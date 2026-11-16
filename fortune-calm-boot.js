/* fortune-calm-boot.js — for a page with no free-text field and no reading (cat-fortune.html): in a calm tab (the session flag
 * "lq-fortune-calm" set by fortune-crisis.js) it loads the crisis code, which makes the top help button the calm one. In a
 * normal tab it loads nothing (crisis-v2-live speed fix 2026-11-16; tests/e2e/speed-budget.e2e.mjs). */
(function () {
  "use strict";
  var on = false;
  try { on = window.sessionStorage.getItem("lq-fortune-calm") === "1"; } catch (e) { /* storage blocked: not calm */ }
  if (!on) return;
  try { document.documentElement.setAttribute("data-lq-calm", "1"); } catch (e) { /* no DOM */ }
  ["lensiq-thai-canon.js?v=3", "lensiq-helpline.js?v=1", "fortune-crisis.js?v=14"].forEach(function (f) {
    var s = document.createElement("script"); s.src = f; s.async = false; document.head.appendChild(s);
  });
})();
