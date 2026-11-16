/* lensiq-crisis-takeover.js — crisis-net hotfix 2026-11-16 (docs/INCIDENT-2026-11-16-CRISIS-LEAK.md). Loaded right after
 * fortune-crisis.js on every fortune page with an input or a result (not the fortune.html hub: no input, no result). Uses
 * window.LQFortuneCrisis at call time. Exposes window.LQCrisisTakeover(cardOrContainer); FortuneAI.crisis.render calls it.
 * Fixed tests (locked before this file was written): tests/e2e/crisis-net-hotfix-{a,b,c,d}.e2e.mjs, tests/unit/crisis-input-inventory.test.js. */
(function (root) {
  "use strict";
  if (!root.document) return;
  /** @returns {any} */
  const CR = () => /** @type {any} */ (root).LQFortuneCrisis || {};
  const FREE_TEXT = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="tel"]';
  const active = (/** @type {any} */ d) => !!(CR().active && CR().active(d));
  const setActive = (/** @type {any} */ d) => { if (CR().setActive) CR().setActive(d); };
  const check = (/** @type {any} */ t) => !!(CR().check && CR().check(t));
  const fields = (/** @type {any} */ d) => (CR().fields ? CR().fields(d) : "");
  const helpLine = (/** @type {any} */ d, /** @type {string} */ l) => CR().helpLine(d, l);
  /* ---------------- crisis-net hotfix 2026-11-16 (owner order a + b; docs/INCIDENT-2026-11-16-CRISIS-LEAK.md) ----------------
     (a) takeover(card): when the support card is shown, NOTHING from the result area stays visible: every result root of the
     page (an element with data-lq-result or an id ending in "Result" or "Stats") is swept: the branch that holds the card stays, every
     other element is marked data-lq-crisis-hide (hidden by html[data-lq-crisis] [data-lq-crisis-hide], so page code that sets
     .hidden = false later cannot bring it back): reading text, score rings, letter strips, face / palm maps, charts, share /
     print buttons, prices. Kept: the card, the help lines, forms and the boxes the visitor types into. Then the screen
     scrolls to the card (below the sticky top bar). Roots that never held the card are swept the same way.
     (b) the crisis check runs BEFORE any format or validation check: a capture-phase "submit" listener on the window runs
     before every form's own handler; with a crisis signal in any free-text field of the page (or the page already in the
     crisis state) it stops the page's handler and shows the card in the form's slot (data-lq-crisis-slot="<selector>", else
     a .lq-crisis-slot right after the form, outside any remedy / paid block). Boxes that reformat while typing (type=tel,
     type=search, data-lq-crisis-live) are checked on "input" before the page's formatter. Forms whose page handler already
     runs the net first on every field and draws the card in its own place carry data-lq-crisis-own and are left to it.
     Shared helper for pages on other branches: window.LQCrisisTakeover(cardOrContainer) (see the incident record). */
  const HIDE = "data-lq-crisis-hide";
  const TAKEOVER_CSS = "html[data-lq-crisis] [" + HIDE + "]{display:none!important}";
  // the page's reading counters ("1 today") go too: they change with the reading just made
  const ROOTS = '[data-lq-result], [id$="Result"], [id$="Stats"]';
  const KEEP = ".fa-support, .fa-soft, .lq-helpline, #lqHelpTop, .lq-crisis-slot, form, script, style, template";
  const FIELD = FREE_TEXT + ", select";
  /** hide every child of el that does not hold the card, a form or a field (recursing into the ones that do)
   *  @param {any} el @param {any} card */
  function sweep(el, card) {
    for (const c of Array.from(el.children || [])) {
      if (card && (c === card || c.contains(card))) { c.removeAttribute(HIDE); if (c !== card) sweep(c, card); continue; }
      if (c.matches(KEEP)) continue;
      if (c.matches(FIELD) || c.querySelector(FIELD) || c.querySelector(".fa-support, .lq-crisis-slot")) { sweep(c, card); continue; }
      c.setAttribute(HIDE, "");
    }
  }
  /** scroll so the card's heading is the first thing below the sticky top bar @param {any} card */
  function toCard(card) {
    const d = card.ownerDocument, w = d && d.defaultView;
    if (!w) return;
    const go = () => {
      try {
        if (!card.isConnected) return;
        const h = card.querySelector("h3") || card, nav = d.querySelector(".nav");
        const pin = d.getElementById("lqHelpTop"), pinB = pin && w.getComputedStyle(pin).position === "sticky" ? pin.getBoundingClientRect().bottom : 0; // the 1323 icon in the sticky bar
        const navB = Math.max(0, nav ? nav.getBoundingClientRect().bottom : 0, pinB), b = h.getBoundingClientRect();
        if (b.top < navB + 4 || b.bottom > w.innerHeight - 8) w.scrollTo(0, Math.max(0, w.scrollY + b.top - navB - 12));
      } catch (e) { /* no layout */ }
    };
    go();
    try { w.requestAnimationFrame(go); w.setTimeout(go, 450); w.setTimeout(go, 1100); } catch (e) { /* no timers */ }
  }
  /** (a) the card replaces every result area of the page; the screen scrolls to it @param {any} target the card or its container */
  function takeover(target) {
    try {
      const d = target && target.ownerDocument;
      if (!d || !d.querySelectorAll) return;
      const card = target.matches && target.matches(".fa-support") ? target : (target.querySelector && target.querySelector(".fa-support")) || target;
      if (!active(d)) setActive(d);
      if (!d.getElementById("lq-takeover-style") && d.head) { const st = d.createElement("style"); st.id = "lq-takeover-style"; st.textContent = TAKEOVER_CSS; d.head.appendChild(st); }
      for (let a = card; a && a !== d.body; a = a.parentElement) { a.removeAttribute(HIDE); if (a.hidden) a.hidden = false; }
      const roots = Array.from(d.querySelectorAll(ROOTS)).filter(r => !Array.from(d.querySelectorAll(ROOTS)).some(o => o !== r && o.contains(r)));
      for (const r of roots) {
        if (r.contains(card)) sweep(r, card);
        else if (r.matches(KEEP) || r.querySelector(FIELD)) sweep(r, null);
        else r.setAttribute(HIDE, "");
      }
      toCard(card);
    } catch (e) { /* never break the card */ }
  }
  /** the card container for a form or field: data-lq-crisis-slot, else a slot after the form (outside remedy / paid blocks) @param {any} el */
  function slotFor(el) {
    const d = el.ownerDocument, form = el.closest ? el.closest("form") || el : el;
    const sel = form.getAttribute && form.getAttribute("data-lq-crisis-slot"), named = sel ? d.querySelector(sel) : null;
    if (named) return named;
    const after = (form.closest && form.closest("[data-lq-remedy], [data-lq-upsell]")) || form;
    let slot = after.nextElementSibling;
    if (!(slot && slot.classList.contains("lq-crisis-slot"))) { slot = d.createElement("div"); slot.className = "lq-crisis-slot"; slot.tabIndex = -1; after.insertAdjacentElement("afterend", slot); }
    return slot;
  }
  /** show the support card in slot (FortuneAI draws it; renderSupport calls takeover) @param {any} slot */
  function cardIn(slot) {
    const FA = /** @type {any} */ (root).FortuneAI, d = slot.ownerDocument;
    for (let a = slot; a && a !== d.body; a = a.parentElement) { a.removeAttribute(HIDE); if (a.hidden) a.hidden = false; }
    const lang = (root.LQI18N && root.LQI18N.lang) || "th";
    if (FA && FA.crisis && FA.crisis.render) FA.crisis.render(slot, FA.crisis.result({ lang: lang === "en" || lang === "zh" ? lang : "th" }));
    else { setActive(d); slot.textContent = ""; slot.appendChild(helpLine(d, lang)); }
    takeover(slot);
    try { slot.focus({ preventScroll: true }); } catch (e) { /* no focus */ }
  }
  /** (b) the crisis net first: true when it stopped the event and showed the card @param {any} el form or field @param {string} [text] */
  function first(el, text) {
    try {
      const d = el && el.ownerDocument;
      if (!d) return false;
      if (!(active(d) || check(text != null ? text : fields(d)))) return false;
      cardIn(slotFor(el));
      return true;
    } catch (e) { return false; }
  }
  const LIVE = 'input[type="search"], input[type="tel"], [data-lq-crisis-live]';
  // .lq-merit: lensiq-merit.js checks its interest form itself and draws the card in its panel (tests/e2e/merit-crisis.e2e.mjs)
  const own = (/** @type {any} */ el) => !!(el && el.closest && el.closest("[data-lq-crisis-own], .lq-merit"));
  try {
    if (root.document && typeof root.addEventListener === "function") {
      root.addEventListener("submit", e => {
        const f = /** @type {any} */ (e.target);
        if (!f || !f.matches || !f.matches("form") || own(f)) return;
        if (first(f)) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
      root.addEventListener("input", e => {
        const t = /** @type {any} */ (e.target);
        if (!t || !t.matches || !t.matches(LIVE) || own(t)) return;
        if (check(t.value) && first(t, t.value)) e.stopImmediatePropagation(); // before the page's formatter strips the text
      }, true);
    }
  } catch (e) { /* no DOM */ }

  /** @type {any} */ (root).LQCrisisTakeover = takeover;
  /** @type {any} */ (root).LQCrisisFirst = first;
})(typeof window !== "undefined" ? window : globalThis);
