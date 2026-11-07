/* legal.js — small helper for the document pages (terms.html, privacy.html, help.html, camera-notice.html).
 *
 * 1) Language-aware anchors. Each page holds one full document per language (.lg-th / .lg-en / .lg-zh, legal.css).
 *    The Thai copy uses the plain ids (#p3, #t9, #h-support); English and Chinese use "en-" / "zh-" prefixed ids.
 *    A link such as privacy.html#p3 therefore always lands on section 3 of the version that is showing, and the
 *    hash is kept stable across languages (other pages and the sign-in/checkout copy can link to it).
 * 2) camera-notice.html: the sign chooser (show one sign or all) and the print button.
 * No network, no storage except reading the language from <html lang>. */
(function () {
  "use strict";
  var doc = document;
  function prefix() {
    var l = (doc.documentElement.lang || "th").toLowerCase();
    return l.indexOf("zh") === 0 ? "zh-" : l.indexOf("en") === 0 ? "en-" : "";
  }
  /** id of the visible copy of a section: "p3" -> "en-p3" in English */
  function localId(id) {
    var base = id.replace(/^(en|zh)-/, "");
    var want = prefix() + base;
    return doc.getElementById(want) ? want : doc.getElementById(base) ? base : id;
  }
  function jump(smooth) {
    var h = decodeURIComponent((location.hash || "").slice(1));
    if (!h || !/^[A-Za-z][\w-]*$/.test(h)) return;
    var id = localId(h), el = doc.getElementById(id);
    if (!el) return;
    if (el.tagName === "DETAILS") /** @type {HTMLDetailsElement} */ (el).open = true;
    el.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
  }
  // in-page links (#p3) inside any language copy: go to the copy that is showing
  doc.addEventListener("click", function (e) {
    var t = /** @type {Element} */ (e.target);
    var a = t && t.closest ? /** @type {HTMLAnchorElement|null} */ (t.closest('a[href^="#"]')) : null;
    if (!a || a.classList.contains("skip-link")) return;
    var id = a.getAttribute("href").slice(1);
    if (!id || !doc.getElementById(localId(id))) return;
    e.preventDefault();
    var base = id.replace(/^(en|zh)-/, "");
    try { history.replaceState(null, "", "#" + base); } catch (err) { /* file:// */ }
    jump(true);
    var target = doc.getElementById(localId(base));
    if (target) { if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
  });
  window.addEventListener("hashchange", function () { jump(true); });
  window.addEventListener("lq-lang", function () { if (location.hash) setTimeout(function () { jump(false); }, 30); });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", function () { jump(false); }); else jump(false);

  // ---------- camera-notice.html ----------
  function signs() {
    doc.querySelectorAll("[data-sign-pick]").forEach(function (sel) {
      var s = /** @type {HTMLSelectElement} */ (sel);
      var scope = s.closest(".lg") || doc;
      var apply = function () {
        scope.querySelectorAll(".sign[data-sign]").forEach(function (el) {
          /** @type {HTMLElement} */ (el).hidden = s.value !== "all" && el.getAttribute("data-sign") !== s.value;
        });
      };
      s.addEventListener("change", apply);
      apply();
    });
    doc.querySelectorAll("[data-print]").forEach(function (b) {
      b.addEventListener("click", function () { window.print(); });
    });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", signs); else signs();
})();
