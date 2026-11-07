/* lensiq-i18n.js — LENSIQ shared i18n (Thai default, English, Simplified Chinese). No third-party requests, no dependencies.
 *
 *   LQI18N.add({ zh: { "home.hero.title": "…" }, th: { … } })   // or LQI18N.add("zh", {...})
 *   LQI18N.t("key", { n: 3 })   -> text in the current language; "{n}" placeholders filled from vars
 *                                  lookup: current lang -> th -> the key itself (so a Thai sentence can be its own key)
 *   LQI18N.lang                 -> "th" | "en" | "zh" ; LQI18N.lang = "en" or LQI18N.setLang("en") switches and persists
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
 * Persistence: localStorage "lq-lang" (ignored if storage is blocked). ?lang=th|en|zh in the URL overrides and persists.
 * <html lang> becomes "th", "en" or "zh-Hans".
 * English dictionaries are loaded on demand (same origin): when English is chosen, every <script src="i18n/zh-X.js">
 * on the page gets its sibling i18n/en-X.js injected (zh-kb-* → en-kb-*: the English reading data for fortune-ai.js); the language is applied
 * (and "lq-lang" fired) once they have loaded, so page code re-renders with English already available.
 * Dictionaries: i18n/zh-common.js (nav, footer, shared components) is loaded by nav.js; page dictionaries
 * i18n/zh-<page>.js may load before this file — they push into window.LQI18N_Q, drained here. See docs/I18N.md.
 *
 * Coverage (for translators / CI):
 *   LQI18N.coverage(root?, {top, all, lang}) -> {thai, cjk, latin, kept, pct, nodes, mixed, attrs, top:[{text, path, thai, mixed}]}
 *                                  visible text + text attributes (placeholder/title/aria-label/alt) + <title>;
 *                                  pct = Thai letters / (Thai + Chinese letters) * 100 (English: Thai + Latin letters). Content that is meant to stay
 *                                  Thai (sample data, Thai names) is excluded when marked lang="th" or translate="no".
 *   ?i18n=debug (or localStorage "lq-i18n-debug" = "1") -> dev overlay in 中文 mode: Thai leftovers outlined in red,
 *                                  a badge with the live Thai % (click it to log the list). tools/zh-coverage.mjs
 *                                  runs the same measurement headless on every page.
 */
/** @typedef {"th"|"en"|"zh"} LQLang */
/** @typedef {{text: string, path: string, thai: number, mixed: boolean}} LQCoverageItem */
/** @typedef {{thai: number, cjk: number, latin: number, kept: number, pct: number, nodes: number, mixed: number, attrs: number, top: LQCoverageItem[]}} LQCoverage */
(function (root) {
  "use strict";
  if (root.LQI18N && root.LQI18N.__core) return;
  var LANGS = ["th", "en", "zh"];
  var HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
  var LABEL = { th: "ไทย", en: "English", zh: "中文" };
  var KEY = "lq-lang";
  var dicts = { th: {}, en: {}, zh: {} };
  /** @type {LQLang} */
  var cur = "th";
  var orig = typeof WeakMap !== "undefined" ? new WeakMap() : null; // element -> {text, attrs:{}} Thai originals
  var doc = root.document;

  /** @param {*} l @returns {LQLang|null} */
  function norm(l) {
    l = String(l || "").toLowerCase();
    if (l.indexOf("zh") === 0 || l === "cn" || l === "中文") return "zh";
    if (l.indexOf("th") === 0) return "th";
    if (l.indexOf("en") === 0) return "en";
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
  /**
   * @param {string} key dictionary key (a Thai sentence can be its own key)
   * @param {Object<string, *>} [vars] values for {name} placeholders
   * @param {string} [l] language, default = current
   * @returns {string}
   */
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
  /**
   * @param {*} l "th" | "zh" (also "zh-Hans", "cn", "中文")
   * @param {{persist?: boolean, force?: boolean, init?: boolean, loaded?: boolean, prevLang?: string}} [opts]
   * @returns {LQLang}
   */
  function setLang(l, opts) {
    l = norm(l);
    if (!l) return cur;
    var prev = cur;
    if (!(opts && opts.persist === false)) storeSet(l);
    if (l === prev && !(opts && opts.force)) return cur;
    if (l === "en" && !(opts && opts.loaded)) {
      // load the English dictionaries first, then switch (page code re-renders on "lq-lang" with English available)
      // init = false: page code renders before the English dictionaries arrive, so it must re-render now even at start-up
      // (pages skip start-up events "when nothing changed from Thai")
      var o = {}; for (var k in opts || {}) o[k] = opts[k]; o.loaded = true; o.persist = false; o.prevLang = opts && opts.prevLang || prev; o.init = false;
      loadSiblings("en").then(function () { if (want2 === l) setLang(l, o); });
      want2 = l;
      return cur;
    }
    want2 = l;
    cur = l;
    apply();
    watch();
    emit(opts && opts.prevLang || prev, opts && opts.init);
    return cur;
  }
  var want2 = null;

  // ---------- on-demand dictionaries: i18n/zh-X.js -> i18n/<lang>-X.js ----------
  var loading = {};
  /** @param {string} l @returns {Promise<void>} */
  function loadSiblings(l) {
    if (!doc || !doc.querySelectorAll) return Promise.resolve();
    var tags = doc.querySelectorAll('script[src*="i18n/zh-"]'), jobs = [];
    for (var i = 0; i < tags.length; i++) {
      var src = tags[i].getAttribute("src") || "", m = /^(.*?i18n\/)zh-([\w-]+\.js)(\?.*)?$/.exec(src);
      // zh-kb-* is Chinese reading data: its English sibling (en-kb-*) is the English reading data, other languages skip it
      if (!m || (/^kb-/.test(m[2]) && l !== "en")) continue;
      var url = m[1] + l + "-" + m[2] + (m[3] || "");
      if (!loading[url]) loading[url] = new Promise(function (res) {
        var sc = doc.createElement("script"); sc.src = url; sc.async = false;
        sc.onload = sc.onerror = function () { res(); };
        (doc.head || doc.documentElement).appendChild(sc);
      });
      jobs.push(loading[url]);
    }
    return Promise.all(jobs).then(function () { /* done */ });
  }

  // ---------- coverage measurement + dev overlay ----------
  // Thai letters (not the ฿ sign U+0E3F, which English and Chinese text keep for prices)
  var TH1 = /[\u0E01-\u0E3A\u0E40-\u0E5B]/, TH_RE = /[\u0E01-\u0E3A\u0E40-\u0E5B]/g, ZH_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/g, LA_RE = /[A-Za-z]/g;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TEXTAREA: 1 };
  var KEEP_SEL = "[lang^=th],[translate=no],#lq-i18n-debug";
  function count(s, re) { var m = s.match(re); return m ? m.length : 0; }
  function shortPath(el) {
    var parts = [];
    for (var e = el, i = 0; e && e.nodeType === 1 && i < 4; e = e.parentElement, i++) {
      var p = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(p + "#" + e.id); break; }
      var cls = typeof e.className === "string" ? e.className.trim().split(/\s+/).filter(function (c) { return c && c.indexOf("lq-") !== 0; })[0] : "";
      parts.unshift(cls ? p + "." + cls : p);
    }
    return parts.join(">");
  }
  function shown(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    var cs = root.getComputedStyle ? root.getComputedStyle(el) : null;
    return !cs || (cs.visibility !== "hidden" && cs.display !== "none");
  }
  /** @param {Element} [scope] @param {{top?: number, all?: boolean, lang?: string}} [opts] all = include hidden text (closed menus, dialogs);
   *  lang = target language (default: current) — pct = Thai letters / (Thai + Chinese letters) for zh, / (Thai + Latin letters) for en
   *  @returns {LQCoverage} */
  function coverage(scope, opts) {
    var vis = opts && opts.all ? function () { return true; } : shown;
    var en = (norm(opts && opts.lang) || cur) === "en";
    var res = { thai: 0, cjk: 0, latin: 0, kept: 0, pct: 0, nodes: 0, mixed: 0, attrs: 0, top: [] };
    if (!doc || !doc.body) return res;
    scope = scope || doc.body;
    var byEl = typeof Map !== "undefined" ? new Map() : null, list = [];
    function note(el, text, th, zh) {
      var la = count(text, LA_RE);
      res.thai += th; res.cjk += zh; res.latin += la;
      if (en) zh = la;
      if (!th) return;
      res.nodes++;
      if (zh) res.mixed++;
      var it = byEl && byEl.get(el);
      if (!it) { it = { text: "", path: shortPath(el), thai: 0, mixed: false }; if (byEl) byEl.set(el, it); list.push(it); }
      it.thai += th; it.mixed = it.mixed || !!zh;
      if (it.text.length < 80) it.text = (it.text ? it.text + " " : "") + text.replace(/\s+/g, " ").trim().slice(0, 80 - it.text.length);
    }
    var walker = doc.createTreeWalker(scope, 4), n;
    while ((n = walker.nextNode())) {
      var el = n.parentElement, v = n.nodeValue;
      if (!el || !v || !v.trim() || SKIP_TAGS[el.tagName] || !vis(el)) continue;
      if (el.closest(KEEP_SEL)) { res.kept += count(v, TH_RE); continue; } // Thai on purpose (lang="th" content, names)
      note(el, v, count(v, TH_RE), count(v, ZH_RE));
    }
    var other = function () { return en ? res.latin : res.cjk; };
    var attrEls = scope.querySelectorAll("[placeholder],[title],[aria-label],img[alt],input[type=button][value],input[type=submit][value]");
    for (var i = 0; i < attrEls.length; i++) {
      var a = attrEls[i];
      if (a.closest(KEEP_SEL) || !vis(a)) continue;
      ["placeholder", "title", "aria-label", "alt", "value"].forEach(function (name) {
        if (name === "value" && a.tagName !== "INPUT") return;
        var val = a.getAttribute(name);
        if (!val) return;
        var th = count(val, TH_RE);
        if (th) res.attrs++;
        note(a, "[" + name + "] " + val, th, count(val, ZH_RE));
      });
    }
    if (scope === doc.body && doc.title) note(doc.documentElement, "<title> " + doc.title, count(doc.title, TH_RE), count(doc.title, ZH_RE));
    res.pct = res.thai + other() ? Math.round(1000 * res.thai / (res.thai + other())) / 10 : 0;
    res.top = list.sort(function (x, y) { return y.thai - x.thai; }).slice(0, (opts && opts.top) || 15);
    return res;
  }

  var dbg = null;
  function debugOn() {
    var q = ""; try { q = new URLSearchParams(root.location && root.location.search || "").get("i18n") || ""; } catch (e) { q = ""; }
    if (q === "debug") return true;
    try { return !!root.localStorage && root.localStorage.getItem("lq-i18n-debug") === "1"; } catch (e) { return false; }
  }
  function debugOverlay() {
    if (!doc || !doc.body || dbg) return;
    dbg = { badge: doc.createElement("button"), marked: [], timer: 0, last: null };
    var b = dbg.badge;
    b.id = "lq-i18n-debug"; b.type = "button"; b.setAttribute("translate", "no");
    b.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483647;padding:6px 10px;border:0;border-radius:8px;font:600 12px/1.2 system-ui,sans-serif;color:#fff;background:#be123c;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer";
    b.addEventListener("click", function () { if (root.console && dbg.last) root.console.table(dbg.last.top); });
    doc.body.appendChild(b);
    var run = function () {
      dbg.timer = 0;
      dbg.marked.forEach(function (el) { el.style.outline = el.getAttribute("data-lq-ol") || ""; el.removeAttribute("data-lq-ol"); });
      dbg.marked = [];
      if (cur === "th") { b.textContent = "i18n debug: switch to EN / 中文"; b.style.background = "#334155"; return; }
      var r = dbg.last = coverage(doc.body, { top: 500 });
      b.textContent = "TH " + r.pct + "% · " + r.nodes + " nodes" + (r.mixed ? " · " + r.mixed + " mixed" : "");
      b.style.background = r.pct === 0 ? "#047857" : "#be123c";
      var all = doc.body.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        var el = /** @type {HTMLElement} */ (all[i]);
        if (el === b || el.closest(KEEP_SEL) || SKIP_TAGS[el.tagName]) continue;
        var own = false;
        for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && TH1.test(c.nodeValue)) { own = true; break; }
        if (!own || !shown(el)) continue;
        el.setAttribute("data-lq-ol", el.style.outline || "");
        el.style.outline = "2px dashed #e11d48";
        dbg.marked.push(el);
      }
    };
    var later = function () { if (!dbg.timer) dbg.timer = setTimeout(run, 400); };
    if (typeof MutationObserver !== "undefined") new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) if (recs[i].target !== b && !(recs[i].type === "attributes")) { later(); return; }
    }).observe(doc.body, { childList: true, subtree: true, characterData: true });
    root.addEventListener("lq-lang", later);
    later();
  }

  var api = {
    __core: true,
    LANGS: LANGS.slice(), LABEL: LABEL, HTML_LANG: HTML_LANG,
    add: add, t: t, has: has, apply: apply, setLang: setLang,
    get lang() { return cur; },
    set lang(v) { setLang(v); },
    /** a small helper for page code: text for the current language, with a Thai fallback when the key is unknown */
    tf: function (key, thai, vars) { return has(key) || has(key, "th") ? t(key, vars) : fill(thai, vars); },
    coverage: coverage, debugOverlay: debugOverlay,
    _dicts: dicts,
    loadSiblings: loadSiblings,
    _reset: function () { dicts.th = {}; dicts.en = {}; dicts.zh = {}; cur = "th"; want2 = null; if (observer) { observer.disconnect(); observer = null; } }
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
    // English: LQI18N.lang reads "en" while its dictionaries load (page code renders in English from the start);
    // the "lq-lang" event still reports prev = "th"
    var start = function () { setLang(want, { init: true, force: true, prevLang: "th" }); };
    if (doc && doc.readyState === "loading") { cur = want; doc.addEventListener("DOMContentLoaded", function () { if (want !== "en") cur = "th"; start(); }); if (doc.documentElement) doc.documentElement.lang = HTML_LANG[want]; }
    else { if (want === "en") { cur = want; if (doc && doc.documentElement) doc.documentElement.lang = "en"; } start(); }
  }
  if (doc && debugOn()) { if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", debugOverlay); else debugOverlay(); }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
