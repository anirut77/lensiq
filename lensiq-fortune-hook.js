/* lensiq-fortune-hook.js — optional analytics hook for the fortune pages (separate from fortune-ai.js, which the
 * fortune team owns). Loaded by lensiq-config.js only when LENSIQ_API_BASE is set; does nothing unless the visitor
 * opted in to analytics (lensiq-analytics.js).
 *
 * Wraps FortuneAI.interpret(facts, opts) transparently (same arguments, same returned promise value) to record:
 *   reading_domain {domain: facts.domain}            — one of the 15 fixed domain ids
 *   feature_used   {feature: "fortune.reading", step: start|complete}
 *   feature_used   {feature: "fortune.ai" | "fortune.local"}   which composer produced the result
 * Nothing from the facts other than the domain id is read.
 *
 * Fortune team: to drop this wrapper, call LQAnalytics.domain(facts.domain) / LQAnalytics.feature(...) directly from
 * fortune-ai.js (guarded by `root.LQAnalytics &&`) and remove this file from lensiq-config.js.
 */
(function (root) {
  "use strict";
  var tries = 0;
  function wrap() {
    var FA = /** @type {any} */ (root).FortuneAI;
    if (!FA || typeof FA.interpret !== "function") { if (tries++ < 40) setTimeout(wrap, 250); return; }
    if (FA.interpret.__lqHooked) return;
    var orig = FA.interpret;
    /** @this {any} */
    var hooked = function (/** @type {any} */ facts, /** @type {any} */ opts) {
      var A = root.LQAnalytics;
      try { if (A && facts && facts.domain) { A.domain(String(facts.domain)); A.feature("fortune.reading", "start"); } } catch (e) { /* never break a reading */ }
      var p = orig.apply(this, arguments);
      if (A && p && typeof p.then === "function") {
        p.then(function (/** @type {any} */ r) {
          try { A.feature("fortune.reading", "complete"); A.feature(r && r.source === "ai" ? "fortune.ai" : "fortune.local"); } catch (e) { /* ignore */ }
        }, function () { /* the page handles its own errors */ });
      }
      return p;
    };
    hooked.__lqHooked = true;
    FA.interpret = hooked;
  }
  if (root.document && root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", wrap);
  else wrap();
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
