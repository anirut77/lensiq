/* lensiq-i18n-rt.js — run-time Chinese for text that page scripts write in Thai (status lines, toasts, tables,
 * dialogs, canvas labels). Companion of lensiq-i18n.js; used by the camera pages and converter.html.
 *
 * Why: the camera pages build most of their live text in JS (≈1,500 Thai literals). Rather than threading t() through
 * every renderer, page code keeps writing Thai, and while 中文 is active this module translates what reaches the page:
 *   1. exact phrase      "หยุดวิเคราะห์แล้ว"            -> dictionary entry
 *   2. template          "มี {n} คนในร้าน"             -> keys with {name} placeholders (regex, anchored)
 *   3. Thai runs         every run of Thai words inside a mixed string ("กล้อง 2 · คน 5") is looked up on its own;
 *                        an unknown run is split at spaces; a word with no entry is translated only if it is
 *                        entirely made of known phrases (≥ 3 chars each), otherwise it stays Thai (never guessed).
 * Live updates keep working because the page keeps writing Thai and every write is translated again (MutationObserver
 * on text, childList and text attributes). Switching back to ไทย restores the exact Thai originals.
 * Also covered while 中文 is active: alert/confirm/prompt messages and CanvasRenderingContext2D fillText/strokeText/
 * measureText (chart and overlay labels).
 * Not translated: <textarea>, <input> values, contenteditable, [translate=no], [data-i18n-skip] (user data), CSV/JSON
 * exports (files keep Thai headers so existing spreadsheets do not break).
 *
 * Dictionaries: (window.LQI18N_RT = window.LQI18N_RT || []).push({ "ไทย": "中文", "มี {n} คน": "{n} 人" })
 * API: LQI18N_RTX.tr(thai) -> current-language text; .active; .stats().
 */
(function (root) {
  "use strict";
  if (root.LQI18N_RTX) return;
  var doc = root.document;
  var TH = /[฀-๿]/;
  var SEG = /[฀-๿]+(?:[  ]+[฀-๿]+)*/g;
  var ATTRS = ["title", "placeholder", "aria-label", "alt", "aria-valuetext", "data-tip"];
  var dict = Object.create(null), tmpls = [], maxKey = 0;
  var cache = new Map();
  var active = false, observer = null, busy = false;
  var texts = typeof WeakMap !== "undefined" ? new WeakMap() : null; // Text node -> {th, zh}
  var attrs = typeof WeakMap !== "undefined" ? new WeakMap() : null; // Element -> {attr: {th, zh}}
  var nTr = 0;

  function esc(s) { return s.replace(/[.*+?^$()|[\]\\]/g, "\\$&"); }
  function add(d) {
    if (!d || typeof d !== "object") return;
    for (var k in d) {
      if (!Object.prototype.hasOwnProperty.call(d, k) || typeof d[k] !== "string") continue;
      var key = String(k).replace(/\s+/g, " ").trim();
      if (/\{\w+\}/.test(key)) {
        var names = [];
        var src = esc(key).replace(/\\?\{(\w+)\\?\}/g, function (m, n) { names.push(n); return "([\\s\\S]+?)"; });
        tmpls.push({ re: new RegExp("^" + src + "$"), names: names, out: d[k] });
      } else {
        dict[key] = d[k];
        if (key.length > maxKey) maxKey = key.length;
      }
    }
    cache.clear();
    if (active) scan(doc && doc.documentElement);
  }

  function fill(out, names, m) {
    return out.replace(/\{(\w+)\}/g, function (all, n) { var i = names.indexOf(n); return i >= 0 ? tr(m[i + 1]) : all; });
  }
  function tmpl(s) {
    for (var i = 0; i < tmpls.length; i++) { var m = tmpls[i].re.exec(s); if (m) return fill(tmpls[i].out, tmpls[i].names, m); }
    return null;
  }
  // greedy longest match of known phrases (≥ 3 chars) covering a whole run that has no dictionary entry
  function greedy(run) {
    var out = "", i = 0, hit = false;
    while (i < run.length) {
      var found = 0;
      for (var L = Math.min(maxKey, run.length - i); L >= 3; L--) {
        var piece = run.substr(i, L);
        if (dict[piece] !== undefined) { found = L; out += dict[piece]; break; }
      }
      if (!found) return run; // only when the whole run is made of known phrases (keeps names such as สมชาย intact)
      i += found; hit = true;
    }
    return hit ? out : run;
  }
  function seg(run) {
    if (dict[run] !== undefined) return dict[run];
    var t = tmpl(run); if (t != null) return t;
    if (/\s/.test(run)) return run.split(/([  ]+)/).map(function (p) { return TH.test(p) ? seg(p) : p; }).join("");
    return greedy(run);
  }
  // dates/times written with toLocale*String("th-TH"): "6 พ.ย. 2569", "6 พฤศจิกายน 2569", "21:42 น." -> 2026年11月6日, 21:42
  var MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  var MONF = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  var DATE_RE = new RegExp("(\\d{1,2})\\s*(" + MONF.concat(MON).map(esc).join("|") + ")(?:\\s*(\\d{4}|\\d{2})(?!\\d|:))?", "g");
  function dates(s) {
    if (s.indexOf("฿") >= 0) s = s.replace(/฿\s?(-?[\d,]+(?:\.\d+)?)/g, "$1 泰铢"); // prices: ฿60 -> 60 泰铢
    if (!/[ก-ฮ]\.|คม|ยน|พันธ์|น\./.test(s)) return s;
    return s.replace(DATE_RE, function (all, d, m, y) {
      var mi = MON.indexOf(m); if (mi < 0) mi = MONF.indexOf(m);
      var out = (mi + 1) + "月" + (+d) + "日";
      if (y) { var Y = +y; if (y.length === 2) Y += 2500; if (Y > 2400) Y -= 543; out = Y + "年" + out; }
      return out;
    }).replace(/(\d{1,2}[:.]\d{2}(?::\d{2})?)\s*น\./g, "$1");
  }
  /** Thai -> Chinese (current dictionaries). Strings without Thai are returned unchanged. */
  function tr(s) {
    if (s == null) return s;
    s = String(s);
    if (!TH.test(s)) return s;
    var c = cache.get(s); if (c !== undefined) return c;
    var lead = s.match(/^\s*/)[0], trail = s.slice(lead.length).match(/\s*$/)[0], core = s.slice(lead.length, s.length - trail.length);
    var norm = core.replace(/\s+/g, " "), out;
    if (dict[norm] !== undefined) out = dict[norm];
    else { out = tmpl(norm); if (out == null) { core = dates(core); out = TH.test(core) ? core.replace(SEG, seg) : core; } }
    out = lead + out + trail;
    if (cache.size > 4000) cache.clear();
    cache.set(s, out);
    nTr++;
    return out;
  }

  // ---------- DOM ----------
  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var tg = e.tagName;
      if (tg === "SCRIPT" || tg === "STYLE" || tg === "TEXTAREA" || tg === "NOSCRIPT" || tg === "CODE" || tg === "PRE") return true;
      if (e.isContentEditable || e.getAttribute("translate") === "no" || e.hasAttribute("data-i18n-skip")) return true;
      if (tg === "BODY" || tg === "HTML") return false;
    }
    return false;
  }
  function doText(n) {
    var v = n.nodeValue;
    if (!v || !TH.test(v)) return;
    var r = texts && texts.get(n);
    if (r && v === r.zh) return;
    var p = n.parentElement; if (!p || skipEl(p)) return;
    var z = tr(v);
    if (z !== v) { if (texts) texts.set(n, { th: v, zh: z }); n.nodeValue = z; }
  }
  function doAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = el.getAttribute(a);
      if (!v || !TH.test(v)) continue;
      var m = attrs && attrs.get(el);
      if (m && m[a] && m[a].zh === v) continue;
      if (skipEl(el) && el.tagName !== "TEXTAREA") continue;
      var z = tr(v);
      if (z !== v) { if (attrs) { if (!m) { m = {}; attrs.set(el, m); } m[a] = { th: v, zh: z }; } el.setAttribute(a, z); }
    }
    if (el.tagName === "INPUT" && /^(button|submit|reset)$/i.test(el.type) && TH.test(el.value)) {
      var mv = attrs && attrs.get(el);
      if (!(mv && mv.value && mv.value.zh === el.value)) { var zv = tr(el.value); if (zv !== el.value) { if (attrs) { if (!mv) { mv = {}; attrs.set(el, mv); } mv.value = { th: el.value, zh: zv }; } el.value = zv; } }
    }
  }
  function scan(rootNode) {
    if (!rootNode) return;
    if (rootNode.nodeType === 3) { doText(rootNode); return; }
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9 && rootNode.nodeType !== 11) return;
    if (rootNode.nodeType === 1) doAttrs(rootNode);
    var w = doc.createTreeWalker(rootNode, 5 /* SHOW_ELEMENT | SHOW_TEXT */), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  // nav.js splits Thai text into <span class="lq-run"> word boxes for line breaking (Thai mode only): join them back
  // into one text node first, so a sentence is translated as a sentence and not word by word
  function unwrapRuns(rootNode) {
    var runs = rootNode.querySelectorAll ? rootNode.querySelectorAll("span.lq-run") : [], parents = [];
    for (var i = 0; i < runs.length; i++) {
      var sp = runs[i], p = sp.parentNode; if (!p) continue;
      p.replaceChild(doc.createTextNode(sp.textContent), sp);
      if (parents.indexOf(p) < 0) parents.push(p);
    }
    for (var j = 0; j < parents.length; j++) { parents[j].normalize(); if (parents[j].removeAttribute) parents[j].removeAttribute("data-lqwb"); }
  }
  function restore(rootNode) {
    if (!rootNode) return;
    var back = [];
    var w = doc.createTreeWalker(rootNode, 5), n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { var r = texts && texts.get(n); if (r && n.nodeValue === r.zh) back.push([n, r.th]); if (r) texts.delete(n); }
      else { var m = attrs && attrs.get(n); if (!m) continue;
        var el = /** @type {HTMLInputElement} */ (n); for (var a in m) { if (a === "value") { if (el.value === m[a].zh) el.value = m[a].th; } else if (el.getAttribute(a) === m[a].zh) el.setAttribute(a, m[a].th); }
        attrs.delete(n); }
    }
    // new Text nodes (not nodeValue) so nav.js sees an added node and re-applies Thai line breaking
    for (var i = 0; i < back.length; i++) {
      var t = back[i][0], par = t.parentNode; if (!par) continue;
      par.replaceChild(doc.createTextNode(back[i][1]), t);
      if (par.removeAttribute) par.removeAttribute("data-lqwb");
    }
  }
  function onMut(recs) {
    if (busy) return;
    busy = true;
    try {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === "characterData") doText(r.target);
        else if (r.type === "attributes") { if (r.target.nodeType === 1) doAttrs(r.target); }
        else for (var j = 0; j < r.addedNodes.length; j++) scan(r.addedNodes[j]);
      }
    } finally { busy = false; }
  }

  // ---------- dialogs + canvas ----------
  function wrapDialogs() {
    ["alert", "confirm", "prompt"].forEach(function (k) {
      var f = root[k]; if (typeof f !== "function" || f.__lqrt) return;
      var w = function (msg, def) { return f.call(root, active ? tr(msg) : msg, def); };
      w.__lqrt = true; root[k] = w;
    });
  }
  function wrapCanvas() {
    var C = root.CanvasRenderingContext2D; if (!C || C.prototype.__lqrt) return;
    ["fillText", "strokeText", "measureText"].forEach(function (k) {
      var f = C.prototype[k]; if (typeof f !== "function") return;
      C.prototype[k] = function (text) {
        if (active && typeof text === "string" && TH.test(text)) { var a = Array.prototype.slice.call(arguments); a[0] = tr(text); return f.apply(this, a); }
        return f.apply(this, arguments);
      };
    });
    C.prototype.__lqrt = true;
  }
  // spoken alerts (driver page): speak the Chinese text with a Chinese voice while 中文 is active
  function wrapSpeech() {
    var S = root.speechSynthesis; if (!S || typeof S.speak !== "function" || /** @type {any} */ (S.speak).__lqrt) return;
    var f = S.speak;
    var w = function (u) {
      if (active && u && typeof u.text === "string" && TH.test(u.text)) { try { u.text = tr(u.text); u.lang = "zh-CN"; } catch (e) { /* read-only in some engines */ } }
      return f.call(S, u);
    };
    w.__lqrt = true;
    try { S.speak = w; } catch (e) { /* ignore */ }
  }

  function start() {
    if (active || !doc || !doc.documentElement) return;
    active = true;
    busy = true; try { unwrapRuns(doc.documentElement); scan(doc.documentElement); } finally { busy = false; }
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(onMut);
      observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(["value"]) });
    }
  }
  function stop() {
    if (!active) return;
    active = false;
    if (observer) { observer.disconnect(); observer = null; }
    restore(doc.documentElement);
  }
  function sync(lang) { if (lang === "zh") start(); else stop(); }

  var q = root.LQI18N_RT;
  if (q && q.length) for (var i = 0; i < q.length; i++) add(q[i]);
  root.LQI18N_RT = { push: function (d) { add(d); return 0; }, length: 0 };
  root.LQI18N_RTX = { tr: tr, add: add, get active() { return active; }, stats: function () { return { phrases: Object.keys(dict).length, templates: tmpls.length, translated: nTr }; } };
  wrapDialogs();
  wrapCanvas();
  wrapSpeech();
  if (typeof root.addEventListener === "function") root.addEventListener("lq-lang", function (/** @type {CustomEvent} */ e) { sync(e && e.detail && e.detail.lang); });
  // the core fires "lq-lang" once after its first apply when the stored language is Chinese; if it already ran
  // (this file loaded late), start now.
  if (doc && root.LQI18N && root.LQI18N.lang === "zh" && doc.readyState !== "loading") start();
})(typeof window !== "undefined" ? window : globalThis);
