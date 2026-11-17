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
  // round 2: fortune-crisis.js may fail to load: then the crisis state is the <html> flag, the net is FortuneAI's own patterns
  // (fortune-ai.js) and the page fields are read here, so the early net still sets the crisis state (v3: no card)
  const FAC = () => (/** @type {any} */ (root).FortuneAI || {}).crisis || {};
  const ATTR = "data-lq-crisis";
  const active = (/** @type {any} */ d) => !!(CR().active ? CR().active(d) : d && d.documentElement.getAttribute(ATTR) === "1");
  const setActive = (/** @type {any} */ d) => { if (CR().setActive) CR().setActive(d); else d.documentElement.setAttribute(ATTR, "1"); };
  const check = (/** @type {any} */ t) => !!(CR().check ? CR().check(t) : FAC().check && FAC().check(t));
  const fields = (/** @type {any} */ d) => (CR().fields ? CR().fields(d) : Array.from(d.querySelectorAll(FREE_TEXT)).map((/** @type {any} */ e) => e.value).filter(Boolean).join("\n"));
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
  // round 2: the "report a problem with this reading" button (lensiq-report.js) goes too
  const TAKEOVER_CSS = "html[data-lq-crisis] [" + HIDE + "],html[data-lq-crisis] .lq-rp-wrap{display:none!important}";
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
  /** (b) the crisis net first: true when it stopped the event and showed the card @param {any} el form or field @param {string} [text] */
  function first(el, text) {
    try {
      const d = el && el.ownerDocument;
      if (!d) return false;
      if (!(active(d) || check(text != null ? text : fields(d)))) return false;
      setActive(d); // crisis v3 (owner decision 2026-11-17): the flag first, then the page goes on (no card; closing line at the end)
      return false;
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

  // round 2: after a language switch or a resize the card is brought back to the first screen
  const back = () => { try { const c = root.document.querySelector(".fa-support"); if (c && active(root.document)) root.setTimeout(() => toCard(c), 300); } catch (e) { /* no DOM */ } };
  try { root.addEventListener("lq-lang", back); root.addEventListener("resize", back); } catch (e) { /* no events */ }
  /** crisis v3 stand-in for fortune-crisis.js (fortune-ai.js uses it only when that file failed to load) @param {(t: any) => boolean} crisisCheck */
  function standIn(crisisCheck) {
    const d0 = root.document, FT = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="tel"]';
    const CSS = ":is(html[data-lq-crisis],html[data-lq-calm]) :is([data-lq-remedy],[data-lq-upsell],[id$=Share],[id$=Print],[id$=Stats],[data-lq-share],[data-lq-print]," +
      ".fa-straight,.fa-plan){display:none!important}.lq-call-mini>a.lq-call-btn{display:inline-flex;align-items:center;min-height:44px;min-width:44px}";
    const W = { th: ["หากมีเรื่องทุกข์ใจ ลองคุยกับคนใกล้ชิด หรือโทร 1323 มีคนพร้อมรับฟัง", "โทร 1323", "ช่องทางให้คำปรึกษา"],
      en: ["If something weighs on you, talk to someone close, or call 1323. Someone is ready to listen.", "Call 1323", "Counselling services"],
      zh: ["如果心里有事，可以和身边的人聊聊，或拨打 1323，有人愿意倾听。", "拨打 1323", "咨询服务渠道"] };
    const L = l => W[l === "en" || l === "zh" ? l : "th"];
    const on = d => (d || d0).documentElement.getAttribute("data-lq-crisis") === "1";
    const calm = d => { if (on(d)) return true; try { return root.sessionStorage.getItem("lq-fortune-calm") === "1"; } catch (e) { return false; } };
    const fields = d => Array.from((d || d0).querySelectorAll(FT)).map(e => /** @type {any} */ (e).value).filter(Boolean).join("\n");
    const esc = t => String(t).replace(/[&<>"]/g, c => "&#" + c.charCodeAt(0) + ";");
    const helpHTML = (l, cls) => { const w = L(l); return '<aside class="lq-helpline' + (cls ? " " + esc(cls) : "") + '" role="note"><p class="lq-helpline-warm">' + esc(w[0]) +
      '</p><span class="lq-call-mini"><a class="lq-call-btn" href="tel:1323"><b>' + esc(w[1]) + '</b></a></span> <span class="lq-helpline-more"><a href="counselling.html">' + esc(w[2]) + "</a></span></aside>"; };
    return { check: () => false, unjoke: t => t, fields, active: on, calmOn: calm, allow: (k, d) => !calm(d), helpHTML,
      setActive(d) {
        const x = d || d0; x.documentElement.setAttribute("data-lq-crisis", "1");
        try { root.sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) { /* page-level only */ }
        if (!x.getElementById("lq-standin-style")) { const st = x.createElement("style"); st.id = "lq-standin-style"; st.textContent = CSS; x.head.appendChild(st); }
        try { root.dispatchEvent(new root.CustomEvent("lq-crisis")); } catch (e) { /* no events */ }
      },
      distress: d => !!crisisCheck(fields(d)), plainName: t => (t && !crisisCheck(t) && String(t).length <= 40 ? t : ""),
      helpLine(d, l, cls) { const t = (d || d0).createElement("template"); t.innerHTML = helpHTML(l, cls); return t.content.firstChild; } };
  }
  /** @type {any} */ (root).LQCrisisTakeover = takeover;
  /** @type {any} */ (root).LQCrisisStandIn = standIn;
  /** @type {any} */ (root).LQCrisisFirst = first;
})(typeof window !== "undefined" ? window : globalThis);
