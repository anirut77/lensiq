/* solutions.js — solutions.html: the print button. The sector catalogue is static markup (data-i18n), so it reads without
 * JavaScript. Owner decision 226 (2026-11-22): no status labels and no status filter for customers; a card of a product that
 * is not offered carries data-lq-off and nav.js hides it. Test hook: window.__LQSOL = {count()} (cards a customer sees). */
(function () {
  "use strict";
  const cards = /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".sl-card")]);
  function count() { return cards.filter(c => !c.hasAttribute("data-lq-off") && c.getClientRects().length > 0).length; }
  const pr = document.getElementById("slPrint");
  if (pr) pr.addEventListener("click", () => window.print());
  /** @type {any} */ (window).__LQSOL = { count };
})();
