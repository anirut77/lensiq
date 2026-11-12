/* legal.js — small helper for the document pages (terms.html, privacy.html, help.html, camera-notice.html).
 *
 * 1) Language-aware anchors. Each page holds one full document per language (.lg-th / .lg-en / .lg-zh, legal.css).
 *    The Thai copy uses the plain ids (#p3, #t9, #h-support); English and Chinese use "en-" / "zh-" prefixed ids.
 *    A link such as privacy.html#p3 therefore always lands on section 3 of the version that is showing, and the
 *    hash is kept stable across languages (other pages and the sign-in/checkout copy can link to it).
 * 2) camera-notice.html: the sign chooser (show one sign or all) and the print button.
 * 3) Seller / support details from window.LENSIQ_SELLER (lensiq-config.js) — see seller() below.
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

  // ---------- seller / support details (terms.html, privacy.html, help.html) ----------
  // Every not-yet-announced detail is a <span class="ph pend" data-seller="key"> whose markup already carries the
  // neutral per-language wording ("announced before sales open · use the contact form"). window.LENSIQ_SELLER
  // (lensiq-config.js) is the single source: a filled key replaces the wording on every page at once. The demo notice
  // ([data-seller-demo]) stays until sales_open is true AND the required keys are filled (tools/check-legal.mjs
  // enforces the same rule before a deploy).
  var REQUIRED = ["name", "tax_id", "address", "email", "effective_date", "dpo_email"];
  /** @param {any} v */
  var has = function (v) { var t = typeof v === "string" ? v.trim() : ""; return !!t && !/^\[.*\]$/.test(t); };
  function seller() {
    var c = /** @type {any} */ (window).LENSIQ_SELLER;
    var s = c && typeof c === "object" ? c : {};
    doc.querySelectorAll("[data-seller]").forEach(function (node) {
      var el = /** @type {HTMLElement} */ (node), k = el.getAttribute("data-seller") || "", v = s[k];
      if (k === "draft") { el.title = (prefix() === "zh-" ? "草案数值，待律师确认" : prefix() === "en-" ? "draft value, to be confirmed by counsel" : "ค่าร่าง รอทนายความยืนยัน"); return; }
      if (k === "counsel") { if (s.counsel_confirmed === true) el.hidden = true; return; }
      // the quote-request LINE Official Account is shown only while the quote form is switched on
      if (k === "quote_line" && !leadsOn()) return;
      if (k === "quote_line" && /^@?[A-Za-z0-9._-]{2,40}$/.test(String(v || "").trim())) {
        var id = String(v).trim(), oa = id.charAt(0) === "@" ? id : "@" + id, ql = doc.createElement("a");
        ql.href = "https://line.me/R/ti/p/" + oa; ql.target = "_blank"; ql.rel = "noopener"; ql.textContent = oa;
        ql.setAttribute("data-quote-line", ""); ql.setAttribute("translate", "no");
        // the link replaces the placeholder, so it sits in the running sentence (an inline text link, WCAG 2.5.8)
        if (el.parentNode) el.parentNode.replaceChild(ql, el);
        return;
      }
      if (!has(v)) return;
      var t = String(v).trim();
      el.textContent = "";
      el.classList.remove("pend");
      el.setAttribute("data-filled", "");
      var a = doc.createElement("a");
      if ((k === "email" || k === "dpo_email") && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(t)) a.href = "mailto:" + t;
      else if (k === "status_url" && /^https:\/\//.test(t)) a.href = t;
      else if (k === "line" && /^@?[A-Za-z0-9._-]{2,40}$/.test(t)) { a.href = "https://line.me/R/ti/p/" + encodeURIComponent(t.charAt(0) === "@" ? t : "@" + t); a.target = "_blank"; a.rel = "noopener"; }
      if (a.href) { a.textContent = t; el.appendChild(a); } else el.textContent = t;
    });
    var ready = s.sales_open === true && REQUIRED.every(function (k) { return has(s[k]); });
    doc.querySelectorAll("[data-seller-demo]").forEach(function (n) { /** @type {HTMLElement} */ (n).hidden = ready; });
    // privacy.html "quote requests" section (owner decision 2026-11-12): rendered only while the form is on
    doc.querySelectorAll("[data-leads-notice]").forEach(function (n) { /** @type {HTMLElement} */ (n).hidden = !leadsOn(); });
  }
  /** Quote-request form switch (lensiq-config.js; false as shipped). Only a literal true counts. */
  function leadsOn() { return /** @type {any} */ (window).LENSIQ_LEADS_FORM === true; }
  // lensiq-config.js comes after this file: fill once the document (and every sync script) has run
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", seller); else seller();
  window.addEventListener("lq-lang", function () { seller(); });
})();
