/* lensiq-i18n.js — LENSIQ shared i18n (Thai default, Simplified Chinese). No network, no dependencies.
 *
 *   LQI18N.add({ zh: { "home.hero.title": "…" }, th: { … } })   // or LQI18N.add("zh", {...})
 *   LQI18N.t("key", { n: 3 })   -> text in the current language; "{n}" placeholders filled from vars
 *                                  lookup: current lang -> th -> the key itself (so a Thai sentence can be its own key)
 *   LQI18N.lang                 -> "th" | "zh" ; LQI18N.lang = "zh" or LQI18N.setLang("zh") switches and persists
 *   LQI18N.apply(root?)         -> re-translates [data-i18n] / [data-i18n-attr] under root (default: document)
 *   window "lq-lang" event       -> CustomEvent detail {lang, prev, init} after every switch (and once at start-up
 *                                  when the stored language is not Thai) — pages re-render their dynamic text on it
 *
 * Markup:
 *   <h2 data-i18n="home.how.title">เริ่มใช้งานได้ใน 3 ขั้นตอน</h2>    the Thai in the markup is the default; it is
 *       remembered and restored when switching back to Thai. Elements with child elements: only the first non-empty
 *       direct text node is replaced (icons such as <svg> are kept).
 *   <h2 data-i18n>เริ่มใช้งานได้ใน 3 ขั้นตอน</h2>                     empty value = the Thai text itself is the key
 *   <input data-i18n-attr="placeholder:home.form.msg.ph;aria-label:home.form.msg">
 *   Text is always set as text (never HTML).
 * Persistence: localStorage "lq-lang" (ignored if storage is blocked). ?lang=zh|th in the URL overrides and persists.
 * <html lang> becomes "th" or "zh-Hans".
 * Dictionaries: i18n/zh-common.js (nav, footer, shared components) is loaded by nav.js; page dictionaries
 * i18n/zh-<page>.js may load before this file — they push into window.LQI18N_Q, drained here. See docs/I18N.md.
 */
(function (root) {
  "use strict";
  if (root.LQI18N && root.LQI18N.__core) return;
  var LANGS = ["th", "zh"];
  var HTML_LANG = { th: "th", zh: "zh-Hans" };
  var LABEL = { th: "ไทย", zh: "中文" };
  var KEY = "lq-lang";
  var dicts = { th: {}, zh: {} };
  var cur = "th";
  var orig = typeof WeakMap !== "undefined" ? new WeakMap() : null; // element -> {text, attrs:{}} Thai originals
  var doc = root.document;

  function norm(l) {
    l = String(l || "").toLowerCase();
    if (l.indexOf("zh") === 0 || l === "cn" || l === "中文") return "zh";
    if (l.indexOf("th") === 0) return "th";
    return null;
  }
  function storeGet() { try { return root.localStorage ? root.localStorage.getItem(KEY) : null; } catch (e) { return null; } }
  function storeSet(v) { try { if (root.localStorage) root.localStorage.setItem(KEY, v); } catch (e) { /* blocked storage */ } }

  function add(a, b) {
    if (typeof a === "string") { var l = norm(a); if (l && b && typeof b === "object") merge(l, b); }
    else if (a && typeof a === "object") for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) { var n = norm(k); if (n) merge(n, a[k]); }
    if (doc && cur !== "th") apply();
    return api;
  }
  function merge(l, d) { if (d && typeof d === "object") for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k) && typeof d[k] === "string") dicts[l][k] = d[k]; }

  function fill(s, vars) {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars, k) && vars[k] != null ? String(vars[k]) : m; });
  }
  function has(key, l) { return Object.prototype.hasOwnProperty.call(dicts[norm(l) || cur], key); }
  function t(key, vars, l) {
    l = norm(l) || cur;
    key = String(key);
    var s = has(key, l) ? dicts[l][key] : has(key, "th") ? dicts.th[key] : key;
    return fill(s, vars);
  }

  // ---------- DOM ----------
  function firstText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) return n;
    return null;
  }
  function memo(el) {
    var m = orig && orig.get(el);
    if (!m) { m = { text: null, attrs: {} }; if (orig) orig.set(el, m); }
    return m;
  }
  // Thai = the markup's own text (source of truth, so renames in HTML/JS need no dictionary change);
  // other languages = dictionary entry, else the Thai text. Thai dictionary is used only when the markup is empty.
  function pick(k, thai, l) {
    if (l !== "th" && has(k, l)) return dicts[l][k];
    return thai || (has(k, "th") ? dicts.th[k] : "");
  }
  function setText(el, key, l) {
    // nav.js wraps Thai words in <span class="lq-run">: turn those back into plain text first (re-applied for Thai)
    var w = el.querySelectorAll ? el.querySelectorAll(":scope > span.lq-run") : [];
    if (w.length) { for (var i = 0; i < w.length; i++) w[i].replaceWith(doc.createTextNode(w[i].textContent)); el.normalize(); }
    if (el.removeAttribute) el.removeAttribute("data-lqwb");
    var m = memo(el), onlyText = !el.firstElementChild, node = onlyText ? null : firstText(el);
    if (m.text == null) m.text = onlyText ? el.textContent : node ? node.nodeValue : "";
    var thai = m.text.trim(), k = key || thai;
    var out = pick(k, thai, l);
    var lead = (m.text.match(/^\s*/) || [""])[0], trail = (m.text.match(/\s*$/) || [""])[0];
    var val = lead + out + trail;
    if (onlyText) { if (el.textContent !== val) el.textContent = val; }
    else if (node && node.nodeValue !== val) node.nodeValue = val;
  }
  function setAttrs(el, spec, l) {
    var m = memo(el);
    spec.split(";").forEach(function (pair) {
      var i = pair.indexOf(":"); if (i < 0) return;
      var attr = pair.slice(0, i).trim(), key = pair.slice(i + 1).trim();
      if (!attr || /^on/i.test(attr) || attr === "href" || attr === "src") return; // text attributes only
      if (!(attr in m.attrs)) m.attrs[attr] = el.getAttribute(attr) || "";
      var thai = m.attrs[attr], out = pick(key || thai, thai, l);
      if (el.getAttribute(attr) !== out) el.setAttribute(attr, out);
    });
  }
  function apply(scope) {
    if (!doc) return;
    scope = scope || doc;
    var l = cur;
    var list = scope.querySelectorAll ? scope.querySelectorAll("[data-i18n],[data-i18n-attr]") : [];
    var all = [];
    if (scope.nodeType === 1 && (scope.hasAttribute("data-i18n") || scope.hasAttribute("data-i18n-attr"))) all.push(scope);
    for (var i = 0; i < list.length; i++) all.push(list[i]);
    all.forEach(function (el) {
      if (el.hasAttribute("data-i18n")) setText(el, el.getAttribute("data-i18n"), l);
      if (el.hasAttribute("data-i18n-attr")) setAttrs(el, el.getAttribute("data-i18n-attr"), l);
    });
    if (doc.documentElement) doc.documentElement.lang = HTML_LANG[l];
  }

  var observer = null;
  function watch() {
    if (!doc || typeof MutationObserver === "undefined") return;
    if (cur === "th") { if (observer) { observer.disconnect(); observer = null; } return; }
    if (observer) return;
    observer = new MutationObserver(function (recs) {
      recs.forEach(function (r) { for (var i = 0; i < r.addedNodes.length; i++) { var n = r.addedNodes[i]; if (n.nodeType === 1) apply(n); } });
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  }

  function emit(prev, init) {
    if (typeof root.dispatchEvent !== "function" || typeof root.CustomEvent !== "function") return;
    try { root.dispatchEvent(new root.CustomEvent("lq-lang", { detail: { lang: cur, prev: prev, init: !!init } })); } catch (e) { /* ignore */ }
  }
  function setLang(l, opts) {
    l = norm(l);
    if (!l) return cur;
    var prev = cur;
    if (!(opts && opts.persist === false)) storeSet(l);
    if (l === prev && !(opts && opts.force)) return cur;
    cur = l;
    apply();
    watch();
    emit(prev, opts && opts.init);
    return cur;
  }

  var api = {
    __core: true,
    LANGS: LANGS.slice(), LABEL: LABEL, HTML_LANG: HTML_LANG,
    add: add, t: t, has: has, apply: apply, setLang: setLang,
    get lang() { return cur; },
    set lang(v) { setLang(v); },
    /** a small helper for page code: text for the current language, with a Thai fallback when the key is unknown */
    tf: function (key, thai, vars) { return has(key) || has(key, "th") ? t(key, vars) : fill(thai, vars); },
    _dicts: dicts,
    _reset: function () { dicts.th = {}; dicts.zh = {}; cur = "th"; if (observer) { observer.disconnect(); observer = null; } }
  };
  root.LQI18N = api;

  // dictionaries queued before this file loaded (i18n/zh-<page>.js pattern)
  var q = root.LQI18N_Q;
  if (q && q.length) for (var i = 0; i < q.length; i++) add(q[i]);
  root.LQI18N_Q = { push: function (d) { add(d); return 0; }, length: 0 };

  // start-up language: ?lang= > localStorage > Thai
  var want = null;
  try { want = norm(new URLSearchParams(root.location && root.location.search || "").get("lang")); } catch (e) { want = null; }
  if (want) storeSet(want);
  else want = norm(storeGet());
  if (want && want !== "th") {
    var start = function () { setLang(want, { init: true, force: true }); };
    if (doc && doc.readyState === "loading") { cur = want; doc.addEventListener("DOMContentLoaded", function () { cur = "th"; start(); }); if (doc.documentElement) doc.documentElement.lang = HTML_LANG[want]; }
    else start();
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
