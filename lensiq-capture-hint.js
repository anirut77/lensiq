/* lensiq-capture-hint.js — LQHint: one live capture hint for camera pages that show a guide frame (owner request 2026-11-13).
 * Browser: window.LQHint · Node: module.exports (pure parts: classify, createTracker, text, DICT, color, icon).
 * Privacy: works on numbers only (boxes, counts, a brightness value the page already measured). No pixels, nothing stored
 * or sent. No new model: pages pass what their existing on-device detector found. No emotion or beauty scoring.
 *
 * STATES  out | far | near | tilt | dark | multi | ok | wait
 *   out    nothing found, the subject's centre is off the frame, or it is cut by one edge of the picture
 *   far    subject smaller than the frame (size ratio < far), or the page's own "too small" check failed (m.small)
 *   near   subject bigger than the frame (ratio > near), or cut by two opposite edges of the picture
 *   tilt   m.tilt = true, or |m.tilt| degrees > tiltMax
 *   dark   m.dark = true (the page's own brightness check)
 *   multi  m.n > 1 (more than one face / hand)
 *   ok     none of the above
 *   wait   no frame yet, or m.blocked (a page-specific problem the page already shows itself): no text, neutral frame
 *   Priority: multi > near > out > far > tilt > dark > wait > ok (with no subject: dark if m.dark, else out).
 *
 * classify(m, opts?, prev?) -> state
 *   m = {subject:{x,y,w,h}|null, frame:{x,y,w,h}, image?:{w,h}, n?, tilt?: bool|degrees, dark?: bool, small?: bool, blocked?: bool}
 *   Any one unit (pixels or 0..1) for all boxes. size ratio r = sqrt(subject area / frame area).
 *   centre offset = max(|dx| / frame.w, |dy| / frame.h). image: when given, a subject box touching an edge (within
 *   opts.edge x the larger side) counts as cut by that edge.
 *   Hysteresis against prev (the state on screen): leaving far needs r >= far + hyst, leaving near r <= near - hyst,
 *   leaving out offset <= center - hyst, leaving tilt |deg| <= tiltMax - tiltHyst.
 * createTracker(opts?) -> {update(m, now) -> {state, raw, changed}, state, reset()}
 *   The first state shows at once; after that a new state shows only when it has been the raw state for holdMs.
 * text(state, kind='object') -> short line in the current language (TH default; EN / ZH via LQI18N keys chint.*); "" for wait.
 *   kind: 'face' | 'hand' | 'object' (wording for tilt / multi / ok).
 * color(state) -> stroke colour for a page's canvas guide (green for ok, neutral white otherwise)
 * icon(state) -> short symbol shown next to the text (aria-hidden; the text carries the meaning)
 * mount(after, {id, kind, host}) -> UI {el, set(state), state, destroy()}  (DOM)
 *   Inserts <p class="lq-chint" role="status" aria-live="polite"> right after the element `after` (under the camera box),
 *   sets data-chint=<state> on `host` (default: `after`) for the frame outline (lensiq-capture-hint.css), re-renders on
 *   "lq-lang". set() with the same state does nothing, so screen readers hear each change once.
 */
(function (root) {
  "use strict";

  var DEFAULTS = Object.freeze({ far: 0.6, near: 1.2, center: 0.3, hyst: 0.05, tiltMax: 15, tiltHyst: 3, edge: 0.01, holdMs: 400 });
  var STATES = Object.freeze(["out", "far", "near", "tilt", "dark", "multi", "ok", "wait"]);

  var DICT = {
    th: {
      "chint.far": "ไกลไป ขยับเข้ามาใกล้อีกนิด",
      "chint.near": "ใกล้ไป ถอยออกหน่อย",
      "chint.out": "ให้อยู่ในกรอบ",
      "chint.dark": "มืดไป เพิ่มแสงอีกหน่อย",
      "chint.tilt.face": "มองตรง ตั้งศีรษะให้ตรง",
      "chint.tilt.hand": "ถือมือให้ตรง ไม่เอียง",
      "chint.tilt.object": "ถือให้ตรง ไม่เอียง",
      "chint.multi.face": "ให้มีคนเดียวในกรอบ",
      "chint.multi.hand": "ใช้มือเดียวในกรอบ",
      "chint.multi.object": "ให้มีชิ้นเดียวในกรอบ",
      "chint.ok.face": "ดีแล้ว อยู่นิ่ง ๆ",
      "chint.ok.hand": "ดีแล้ว ถือนิ่ง ๆ",
      "chint.ok.object": "ดีแล้ว ถือนิ่ง ๆ"
    },
    en: {
      "chint.far": "Too far — move closer",
      "chint.near": "Too close — move back",
      "chint.out": "Move into the frame",
      "chint.dark": "Too dark — add more light",
      "chint.tilt.face": "Look straight, keep your head level",
      "chint.tilt.hand": "Hold your hand straight",
      "chint.tilt.object": "Hold it straight",
      "chint.multi.face": "Only one person in the frame",
      "chint.multi.hand": "Only one hand in the frame",
      "chint.multi.object": "Only one item in the frame",
      "chint.ok.face": "Good — stay still",
      "chint.ok.hand": "Good — hold still",
      "chint.ok.object": "Good — hold still"
    },
    zh: {
      "chint.far": "太远了，再靠近一点",
      "chint.near": "太近了，往后退一点",
      "chint.out": "请进入框内",
      "chint.dark": "太暗了，请增加光线",
      "chint.tilt.face": "请正视镜头，头部摆正",
      "chint.tilt.hand": "手请放正，不要倾斜",
      "chint.tilt.object": "请拿正，不要倾斜",
      "chint.multi.face": "框内只能有一个人",
      "chint.multi.hand": "框内只放一只手",
      "chint.multi.object": "框内只放一件物品",
      "chint.ok.face": "很好，保持不动",
      "chint.ok.hand": "很好，保持不动",
      "chint.ok.object": "很好，保持不动"
    }
  };
  if (typeof window !== "undefined") (window.LQI18N_Q = window.LQI18N_Q || []).push({ zh: DICT.zh, en: DICT.en });

  var num = function (v) { return typeof v === "number" && isFinite(v); };
  var okBox = function (b) { return !!b && num(b.x) && num(b.y) && num(b.w) && num(b.h) && b.w > 0 && b.h > 0; };

  /** @param {any} m @param {any} [opts] @param {string|null} [prev] @returns {string} */
  function classify(m, opts, prev) {
    var o = Object.assign({}, DEFAULTS, opts || {}), h = o.hyst;
    if (!m || !okBox(m.frame)) return "wait";
    var s = m.subject, f = m.frame;
    if (!okBox(s)) return m.dark ? "dark" : "out";
    if (num(m.n) && m.n > 1) return "multi";
    var r = Math.sqrt((s.w * s.h) / (f.w * f.h));
    var cutL = false, cutR = false, cutT = false, cutB = false;
    if (m.image && m.image.w > 0 && m.image.h > 0) {
      var e = o.edge * Math.max(m.image.w, m.image.h);
      cutL = s.x <= e; cutT = s.y <= e; cutR = s.x + s.w >= m.image.w - e; cutB = s.y + s.h >= m.image.h - e;
    }
    if (r > (prev === "near" ? o.near - h : o.near) || (cutL && cutR) || (cutT && cutB)) return "near";
    var off = Math.max(Math.abs(s.x + s.w / 2 - (f.x + f.w / 2)) / f.w, Math.abs(s.y + s.h / 2 - (f.y + f.h / 2)) / f.h);
    if (cutL || cutR || cutT || cutB || off > (prev === "out" ? o.center - h : o.center)) return "out";
    if (m.small || r < (prev === "far" ? o.far + h : o.far)) return "far";
    if (m.tilt === true || (num(m.tilt) && Math.abs(m.tilt) > (prev === "tilt" ? o.tiltMax - o.tiltHyst : o.tiltMax))) return "tilt";
    if (m.dark) return "dark";
    if (m.blocked) return "wait";
    return "ok";
  }

  /** @param {any} [opts] */
  function createTracker(opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    /** @type {string|null} */ var shown = null;
    /** @type {string|null} */ var cand = null;
    var since = 0;
    return {
      get state() { return shown; },
      reset: function () { shown = null; cand = null; since = 0; },
      update: function (m, now) {
        var raw = classify(m, o, shown);
        if (shown === null) { shown = raw; cand = raw; since = now; return { state: shown, raw: raw, changed: true }; }
        if (raw === shown) { cand = raw; since = now; return { state: shown, raw: raw, changed: false }; }
        if (raw !== cand) { cand = raw; since = now; }
        if (now - since >= o.holdMs) { shown = raw; return { state: shown, raw: raw, changed: true }; }
        return { state: shown, raw: raw, changed: false };
      }
    };
  }

  var KINDS = { face: 1, hand: 1, object: 1 };
  function keyOf(state, kind) {
    var k = KINDS[kind] ? kind : "object";
    if (state === "tilt" || state === "multi" || state === "ok") return "chint." + state + "." + k;
    if (state === "far" || state === "near" || state === "out" || state === "dark") return "chint." + state;
    return null;
  }
  /** @param {string} state @param {string} [kind] @returns {string} */
  function text(state, kind) {
    var key = keyOf(state, kind);
    if (!key) return "";
    var I = typeof window !== "undefined" && window.LQI18N;
    if (I && typeof I.tf === "function") return I.tf(key, DICT.th[key]);
    return DICT.th[key];
  }
  /** @param {string} state */
  function color(state) { return state === "ok" ? "#22c55e" : "rgba(255,255,255,.85)"; }
  var ICONS = { ok: "✓", far: "+", near: "−", out: "□", tilt: "↻", dark: "◐", multi: "1" };
  /** @param {string} state */
  function icon(state) { return ICONS[state] || ""; }

  /** @param {Element} after @param {{id?: string, kind?: string, host?: Element}} [opts] */
  function mount(after, opts) {
    opts = opts || {};
    var host = opts.host || after, kind = opts.kind || "object";
    var el = document.createElement("p");
    el.className = "lq-chint";
    if (opts.id) el.id = opts.id;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.dataset.state = "wait";
    var ic = document.createElement("span"); ic.className = "lq-chint-ic"; ic.setAttribute("aria-hidden", "true");
    var tx = document.createElement("span"); tx.className = "lq-chint-tx";
    el.append(ic, tx);
    after.after(el);
    host.setAttribute("data-chint", "wait");
    /** @type {string} */ var cur = "wait";
    var render = function () {
      el.dataset.state = cur; host.setAttribute("data-chint", cur);
      ic.textContent = icon(cur); tx.textContent = text(cur, kind);
    };
    var onLang = function () { render(); };
    window.addEventListener("lq-lang", onLang);
    var ui = {
      el: el,
      get state() { return cur; },
      set: function (/** @type {string|null} */ state) {
        var s = state && STATES.indexOf(state) >= 0 ? state : "wait";
        if (s === cur) return;
        cur = s; render();
      },
      destroy: function () { window.removeEventListener("lq-lang", onLang); el.remove(); host.removeAttribute("data-chint"); }
    };
    render();
    return ui;
  }

  var api = { DEFAULTS: DEFAULTS, STATES: STATES, DICT: DICT, classify: classify, createTracker: createTracker, text: text, color: color, icon: icon, mount: mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQHint = api;
})(typeof window !== "undefined" ? window : globalThis);
