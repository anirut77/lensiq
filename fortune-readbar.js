/* fortune-readbar.js — sticky "read" bar on the fortune reading pages (owner order 2026-11-16 item 3, review of 08c7b6f:
 * "the main action is on the first screen" means the button that gives the reading). The page's own read / submit button is
 * marked data-lq-read; while that button is below the visible area (and no reading is on screen) a compact bar at the bottom
 * shows a copy of it (same label, page language, 44 px+); a tap clicks the real button, so validation, the crisis net and the
 * reading flow are the page's own. Hidden when the real button or a reading is on screen, when the page is in the crisis state
 * (html[data-lq-crisis]) or a help card is shown, and in print. Bottom of the screen only: it never covers the top bar's help
 * control. Single source; tools/fortune-read-embed.mjs copies it into fortune-read.js (reading pages) and planner.js. */
(function (root) {
  "use strict";
  var doc = root.document;
  if (!doc || !doc.querySelector || root.__lqReadbar) return;
  root.__lqReadbar = true;
  /** @type {any} */ var bar = null, btn = null, real = null, raf = 0;
  /** @returns {any} */
  function pick() {
    var all = doc.querySelectorAll("[data-lq-read]");
    for (var i = 0; i < all.length; i++) if (all[i].getClientRects().length) return all[i];
    return null;
  }
  function onScreen(e) { var r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < root.innerHeight && r.width > 0; }
  function readingShown() {
    var r = doc.querySelectorAll(".fa-section, .fa-support, [data-lq-result]");
    for (var i = 0; i < r.length; i++) if (r[i].getClientRects().length && onScreen(r[i])) return true;
    return false;
  }
  function build() {
    var st = doc.createElement("style");
    st.textContent = ".lq-readbar{position:fixed;left:0;right:0;bottom:0;z-index:55;padding:8px 16px calc(8px + env(safe-area-inset-bottom));" +
      "background:rgba(255,255,255,.96);border-top:1px solid #e3e7f0;box-shadow:0 -6px 18px rgba(14,20,48,.08)}" +
      ".lq-readbar .btn{display:flex;width:100%;max-width:520px;min-height:48px;margin:0 auto}.lq-readbar[hidden]{display:none}" +
      "@media print{.lq-readbar{display:none!important}}";
    doc.head.appendChild(st);
    bar = doc.createElement("div"); bar.className = "lq-readbar"; bar.hidden = true;
    btn = doc.createElement("button"); btn.type = "button"; btn.className = "btn primary big";
    btn.addEventListener("click", function () {
      if (!real || real.disabled) return;
      var y = root.scrollY, r = real;
      r.click();
      // the page did not move to its result: bring the form's button (and what it shows below it) into view
      root.setTimeout(function () { if (root.scrollY === y && r.isConnected) r.scrollIntoView({ block: "center" }); }, 250);
    });
    bar.appendChild(btn); doc.body.appendChild(bar);
  }
  function sync() {
    raf = 0;
    real = pick();
    var crisis = doc.documentElement.hasAttribute("data-lq-crisis");
    var show = !!real && !crisis && real.getBoundingClientRect().top > root.innerHeight - 8 && !readingShown();
    if (show && !bar) build();
    if (!bar) return;
    if (show) {
      btn.textContent = (real.textContent || "").replace(/\s+/g, " ").trim();
      btn.disabled = !!real.disabled;
    }
    if (bar.hidden === show) { bar.hidden = !show; doc.body.style.paddingBottom = show ? bar.offsetHeight + "px" : ""; }
  }
  function later() { if (!raf) raf = root.requestAnimationFrame(sync); }
  ["scroll", "resize", "lq-lang"].forEach(function (t) { root.addEventListener(t, later, { passive: true }); });
  ["input", "change", "click"].forEach(function (t) { doc.addEventListener(t, later, true); });
  if (root.MutationObserver) {
    var mo = new root.MutationObserver(function () { sync(); }); // crisis flag / button state: at once, not on the next frame
    mo.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-lq-crisis"] });
    // the page enables its button later (dream: after the symbols are found)
    var watch = function () { var r = doc.querySelectorAll("[data-lq-read]"); for (var i = 0; i < r.length; i++) mo.observe(r[i], { attributes: true, attributeFilter: ["disabled"] }); };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", watch); else watch();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", later); else later();
  root.addEventListener("load", later);
  root.setInterval(function () { if (bar && !doc.hidden) sync(); }, 400); // smooth scrolling, late layout: settle within 0.4 s
})(typeof window !== "undefined" ? window : globalThis);
