/* lensiq-busy.js — LQBusy: tap feedback, busy state and double-tap protection for every button (owner report 2026-11-14,
 * iPhone Safari: "I cannot tell whether a tap registered, and repeated taps highlight the text inside the button").
 * Loaded in <head> of every page before nav.js and the page scripts. Plain script, no dependencies; Node: module.exports.
 * The look is in styles.css (admin.css for the owner console): no text selection, no callout and no double-tap zoom on
 * buttons, a pressed (:active) state and a busy ([aria-busy=true]) state.
 *
 *   LQBusy.wrap(fn)        -> click (or form submit) listener: while the promise fn returns is pending, the button
 *                             (event.currentTarget; for a form: the submitter) carries aria-busy="true", every further
 *                             click on it is dropped and the listener does not run again (a second submit is cancelled);
 *                             restored when the work ends or fails (the error is passed on). A listener that returns no
 *                             promise is just called.
 *   LQBusy.run(btn, fn)    -> the same around any work: Promise of fn's result, or undefined when btn is already busy
 *   LQBusy.isBusy(btn)     -> boolean
 * Global, for every button (button, [role=button], .btn, input buttons):
 *   - a click on a busy button (or inside one) is dropped in the capture phase, before any page listener runs;
 *   - double-tap guard: a second REAL tap (event.isTrusted) on the same action button within GUARD_MS is dropped.
 *     Toggles are left alone (a second tap on a tab, chip, menu or switch is a deliberate undo): .tab, .chip,
 *     [role=tab|switch|checkbox|radio|menuitem*], aria-expanded / aria-pressed / aria-selected. Never guarded: tel: links
 *     and the help-line call buttons (.lq-call-btn), [data-lq-repeat] (steppers), form fields.
 *     Form submit buttons are left to the form (its code, or LQBusy.wrap on the submit listener), so a quick retry
 *     after an error message is not dropped. The gap is measured between the taps themselves (event.timeStamp).
 *   - camera starts: when getUserMedia is called within CAM_MS of a real tap on a button, that button is busy until the
 *     browser answers (permission prompt, camera warm-up), so a second tap cannot open a second camera.
 *   - iOS Safari only shows :active when a touchstart listener exists: one passive no-op listener is added.
 * Nothing here stores or sends anything. */
(function (root) {
  "use strict";
  var GUARD_MS = 400, CAM_MS = 3000;
  var BTN = "button, [role=button], .btn, input[type=button], input[type=submit], input[type=reset]";
  var TOGGLE = ".tab, .chip, [role=tab], [role=switch], [role=checkbox], [role=radio], " +
    "[role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [aria-expanded], [aria-pressed], [aria-selected]";
  var NEVER = "a[href^='tel:'], .lq-call-btn, [data-lq-repeat]";
  // form submit buttons: the form's own code (or LQBusy.wrap on the submit listener) guards a second submit; a time guard
  // would drop a quick, deliberate retry after an error message
  var NO_TIME_GUARD = "[type=submit], button:not([type])";
  var busy = typeof WeakSet === "function" ? new WeakSet() : null;

  function isBusy(el) { return !!(el && busy && busy.has(el)); }
  function setBusy(el, on) {
    if (!el || !busy) return;
    if (on) {
      busy.add(el);
      el.__lqBusyPrev = el.getAttribute("aria-busy");
      el.setAttribute("aria-busy", "true");
    } else {
      busy.delete(el);
      if (el.__lqBusyPrev == null) el.removeAttribute("aria-busy"); else el.setAttribute("aria-busy", el.__lqBusyPrev);
      el.__lqBusyPrev = null;
    }
  }
  var pending = typeof WeakSet === "function" ? new WeakSet() : null; // owners (button or form) whose work is running
  function run(el, fn, self, args, owner) {
    owner = owner || el;
    if (isBusy(el) || (owner && pending && pending.has(owner))) return undefined;
    var r = fn.apply(self, args || []);
    if (!r || typeof r.then !== "function") return r;
    if (owner && pending) pending.add(owner);
    setBusy(el, true);
    var done = function () { if (owner && pending) pending.delete(owner); setBusy(el, false); };
    r.then(done, done);
    return r;
  }
  // the button that shows the busy state: the clicked element itself, or for a form's submit event the submitter
  function busyEl(ev) {
    var t = ev && ev.currentTarget && ev.currentTarget.nodeType === 1 ? ev.currentTarget : null;
    if (t && t.tagName === "FORM") return ev.submitter || t.querySelector("button[type=submit], input[type=submit], button:not([type])");
    return t;
  }
  function wrap(fn) {
    /** @this {any} @param {any} ev */
    return function (ev) {
      var owner = ev && ev.currentTarget && ev.currentTarget.nodeType === 1 ? ev.currentTarget : null;
      if (owner && pending && pending.has(owner)) { if (ev.preventDefault) ev.preventDefault(); return undefined; }
      return run(busyEl(ev), fn, this, arguments, owner);
    };
  }
  var api = { wrap: wrap, run: function (el, fn) { return run(el, fn, el, [], el); }, isBusy: isBusy, GUARD_MS: GUARD_MS };

  if (typeof document !== "undefined" && document.addEventListener) {
    var last = typeof WeakMap === "function" ? new WeakMap() : null;
    /** the element a click landed on (a text node gives its parent) @param {any} x @returns {any} */
    var elOf = function (x) { return x && x.nodeType === 1 ? x : x && x.parentElement; };
    var closest = function (t, sel) { return t && t.closest ? t.closest(sel) : null; };
    root.addEventListener("click", function (ev) {
      var t = elOf(ev.target);
      if (!t) return;
      // a busy button: drop the click before any page listener sees it
      for (var p = t; p && p.nodeType === 1; p = p.parentElement) {
        if (isBusy(p)) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }
      }
      if (!ev.isTrusted || !last) return;
      var b = closest(t, BTN);
      if (!b || closest(t, NEVER) || b.matches(TOGGLE)) return;
      if (b.matches(NO_TIME_GUARD) && b.form) return;
      // the time of the tap itself (input timestamp), not of handling: a busy main thread must not stretch the gap
      var now = typeof ev.timeStamp === "number" && ev.timeStamp > 0 ? ev.timeStamp : Date.now(), prev = last.get(b);
      last.set(b, now);
      if (prev && now - prev < GUARD_MS) { ev.preventDefault(); ev.stopImmediatePropagation(); }
    }, true);
    // iOS Safari applies :active only when the page listens for touchstart
    document.addEventListener("touchstart", function () {}, { passive: true });
    // camera starts: a camera request that follows a real tap on a button (within CAM_MS) marks that button busy until
    // the browser answers (permission prompt, camera warm-up), so a second tap cannot open a second camera
    var lastTap = null, lastTapAt = 0;
    root.addEventListener("click", function (ev) {
      if (!ev.isTrusted) return;
      var t = elOf(ev.target);
      var b = closest(t, BTN);
      if (b && !closest(t, NEVER)) { lastTap = b; lastTapAt = Date.now(); }
    }, true);
    var md = root.navigator && root.navigator.mediaDevices;
    if (md && typeof md.getUserMedia === "function") {
      var gum = md.getUserMedia;
      /** @param {MediaStreamConstraints} [c] */
      md.getUserMedia = function (c) {
        var p = gum.call(md, c);
        var b = lastTap;
        if (b && b.isConnected && Date.now() - lastTapAt < CAM_MS && !isBusy(b) && p && typeof p.then === "function") {
          lastTap = null;
          setBusy(b, true);
          var done = function () { setBusy(b, false); };
          p.then(done, done);
        }
        return p;
      };
    }
  }

  root.LQBusy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
