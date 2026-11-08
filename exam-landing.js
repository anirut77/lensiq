/* exam-landing.js — exam.html: print button for the notice / consent template (no inline handlers under the CSP). */
(function () {
  "use strict";
  const b = document.getElementById("printNotice");
  if (b) b.addEventListener("click", () => window.print());
})();
