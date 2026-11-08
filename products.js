/* products.js — the product landing pages (retail.html, hr.html, creative-suite.html) as customer-facing one-pagers.
 *
 * 1) Contact block ([data-pd-seller]) filled from window.LENSIQ_SELLER (lensiq-config.js — the one place the seller's
 *    name, e-mail and LINE OA are configured). Until they are filled it says honestly that the details are announced
 *    before sales open and points to the demo-request form; nothing is invented.
 * 2) "Print / save as PDF" ([data-pd-print]) — the browser's print dialog with the print stylesheet in products.css
 *    (A4, no menu / footer / other-product links, contact block kept), in the language that is showing (TH / EN / 中文).
 * No network, no storage. Pure helper contactOf() is unit-tested in Node (tests/unit/commercial-collateral.test.js). */
(function (root) {
  "use strict";
  /** @type {any} */
  var W = root;
  /** @param {any} v */
  var has = function (v) { var t = typeof v === "string" ? v.trim() : ""; return !!t && !/^\[.*\]$/.test(t); };
  /** Contact lines a one-pager may print: [{k: "name"|"email"|"line"|"site", v, href?}] — only filled values. @param {any} seller @param {string} [site] */
  function contactOf(seller, site) {
    var s = seller && typeof seller === "object" ? seller : {}, out = [];
    if (has(s.name)) out.push({ k: "name", v: s.name.trim() });
    if (has(s.email) && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(s.email.trim())) out.push({ k: "email", v: s.email.trim(), href: "mailto:" + s.email.trim() });
    if (has(s.line)) {
      var id = s.line.trim(), at = id.charAt(0) === "@" ? id : "@" + id;
      if (/^@[A-Za-z0-9._-]{2,40}$/.test(at)) out.push({ k: "line", v: at, href: "https://line.me/R/ti/p/" + encodeURIComponent(at) });
    }
    if (site && /^https?:\/\//.test(site)) out.push({ k: "site", v: site.replace(/^https?:\/\//, "").replace(/\/$/, ""), href: site });
    return out;
  }
  if (typeof module !== "undefined" && module.exports) { module.exports = { contactOf: contactOf }; return; }

  var doc = W.document;
  (W.LQI18N_Q = W.LQI18N_Q || []).push({
    en: {
      "pd.c.name": "Provider", "pd.c.email": "E-mail", "pd.c.line": "LINE", "pd.c.site": "Website",
      "pd.c.pending": "The provider's company name, e-mail and LINE OA will be announced before sales open. Until then, please use the",
      "pd.c.form": "Demo-request form"
    },
    zh: {
      "pd.c.name": "服务提供方", "pd.c.email": "电子邮箱", "pd.c.line": "LINE", "pd.c.site": "网站",
      "pd.c.pending": "服务提供方的公司名称、电子邮箱和 LINE 官方账号将在开售前公布。在此之前，请使用",
      "pd.c.form": "演示申请表"
    }
  });
  /** @param {string} k @param {string} th */
  var T = function (k, th) { return W.LQI18N && typeof W.LQI18N.tf === "function" ? W.LQI18N.tf(k, th) : th; };
  var LABEL = /** @type {Record<string, string[]>} */ ({ name: ["pd.c.name", "ผู้ให้บริการ"], email: ["pd.c.email", "อีเมล"], line: ["pd.c.line", "LINE"], site: ["pd.c.site", "เว็บไซต์"] });
  function render() {
    var site = "";
    try { site = /^https?:$/.test(location.protocol) ? location.origin + location.pathname.replace(/[^/]*$/, "") : ""; } catch (e) { /* file:// */ }
    doc.querySelectorAll("[data-pd-seller]").forEach(function (/** @type {HTMLElement} */ box) {
      var lines = contactOf(W.LENSIQ_SELLER, site), interest = box.getAttribute("data-interest") || "";
      box.textContent = "";
      var dl = doc.createElement("dl");
      dl.className = "pd-contact-dl";
      lines.forEach(function (x) {
        var dt = doc.createElement("dt"), dd = doc.createElement("dd");
        dt.textContent = T(LABEL[x.k][0], LABEL[x.k][1]);
        if (x.href) { var a = doc.createElement("a"); a.href = x.href; a.textContent = x.v; if (x.k === "line") { a.target = "_blank"; a.rel = "noopener"; } dd.appendChild(a); } else dd.textContent = x.v;
        dl.appendChild(dt); dl.appendChild(dd);
      });
      if (!lines.some(function (x) { return x.k === "email" || x.k === "line"; })) {
        var p = doc.createElement("p");
        p.className = "pd-contact-pend";
        p.textContent = T("pd.c.pending", "ชื่อบริษัท อีเมล และ LINE OA ของผู้ให้บริการจะประกาศก่อนเปิดขาย ระหว่างนี้ติดต่อผ่าน") + " ";
        var f = doc.createElement("a");
        f.href = "index.html" + (/^[a-z]{2,20}$/.test(interest) ? "?interest=" + interest : "") + "#contact";
        f.textContent = T("pd.c.form", "แบบฟอร์มขอเดโม");
        p.appendChild(f);
        box.appendChild(p);
      }
      if (dl.childNodes.length) box.appendChild(dl);
    });
  }
  doc.addEventListener("click", function (/** @type {Event} */ e) {
    var t = /** @type {Element} */ (e.target);
    if (t && t.closest && t.closest("[data-pd-print]")) W.print();
  });
  // lensiq-config.js comes after this file: fill once every sync script has run
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", render); else render();
  W.addEventListener("lq-lang", render);
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
