/* lensiq-merit.js — "สิ่งที่ทำได้ตามความเชื่อ / What believers do / 按习俗可以做的事" under every fortune reading (Merit MVP,
 * owner order 2026-11-12; docs/MERIT-DESIGN.md, docs/MERIT-RESULTS.md). Logic in lensiq-merit-core.js (LQMeritCore).
 *
 * Loaded by nav.js on the fortune pages, so the fortune page files are not edited: it wraps FortuneAI.interpret /
 * regenerate (to read the reading's facts ON THE DEVICE) and FortuneAI.renderSections (to put one panel right after the
 * reading container) from the outside — same arguments, same return values, the reading itself is never changed.
 *
 *   - Guidance items: every published item from <LENSIQ_API_BASE>/v1/merit/guidance (admin-managed), or the bundled
 *     samples (lensiq-merit-seed.js) when there is no backend. The request carries nothing about the reader; matching
 *     and the tradition filter run here. The tradition choice is kept in this browser only ("lq-merit-tradition").
 *   - Every card carries the fixed label "according to belief, please use your own judgement"; the panel ends with the
 *     fixed no-guarantee line. No prices, links or buy buttons.
 *   - The optional paid "on your behalf" section (a request-interest form only; booking stays off until legal review)
 *     shows only when window.LENSIQ_MERIT_INTEREST_FORM === true AND the server says interest_form = true AND the crisis
 *     state is not set. Default: off.
 *   - Crisis net: whenever a FortuneAI support card (.fa-support) appears on the page, or the reading is a support
 *     result, "lq-crisis-at" is set (and kept in memory when storage is blocked) and every panel is withdrawn for 24 h
 *     (no merit content next to a support card); another tab's support card withdraws it too (storage event). Crisis
 *     wording typed into the form, or a crisis state at submit time, shows the support card and sends nothing.
 *   - Every item is re-checked with the shared wording lint (lensiq-merit-lint.js) before it is shown.
 */
(function (root) {
  "use strict";
  /** @type {any} */
  var W = root;
  if (W.LQMerit) return;
  var doc = root.document;
  var C = W.LQMeritCore;
  if (!C || !doc) return;

  var state = { items: /** @type {any[]|null} */ (null), serverFlag: false, retentionDays: /** @type {any} */ (null), loading: /** @type {Promise<void>|null} */ (null),
    facts: /** @type {any} */ (null) };
  /** Defence in depth: whatever the server or the bundle holds, the page shows only items that pass the shared lint. @param {any} items */
  var clean = function (items) { return C.safeItems(items, W.LQMeritLint && W.LQMeritLint.lintMerit); };
  /** @type {HTMLElement|null} */
  var panel = null;
  var page = (root.location && root.location.pathname.split("/").pop()) || "";

  var store = function () { try { return root.localStorage; } catch (e) { return null; } };
  var lang = function () { return C.normLang(W.LQI18N ? W.LQI18N.lang : "th"); };
  var apiBase = function () { var b = String(W.LENSIQ_API_BASE || "").trim().replace(/\/+$/, ""); return /^https?:\/\//.test(b) ? b : ""; };

  /* ---------------- data: the Worker, else the bundled samples ---------------- */
  function seed() {
    return new Promise(function (resolve) {
      var done = function () { state.items = clean(W.LQ_MERIT_SEED); state.serverFlag = false; resolve(undefined); };
      if (W.LQ_MERIT_SEED) return done();
      var s = doc.createElement("script");
      s.src = "lensiq-merit-seed.js?v=1"; s.async = true;
      s.onload = done; s.onerror = done;
      (doc.head || doc.documentElement).appendChild(s);
    });
  }
  /** @returns {Promise<void>} */
  function load() {
    if (state.loading) return state.loading;
    var base = apiBase();
    state.loading = !base || typeof W.fetch !== "function" ? seed()
      : W.fetch(base + "/v1/merit/guidance", { credentials: "omit", referrerPolicy: "no-referrer" })
        .then(function (/** @type {Response} */ r) { return r.ok ? r.json() : null; })
        .then(function (/** @type {any} */ j) {
          if (!j || !Array.isArray(j.items)) return seed();
          state.items = clean(j.items); state.serverFlag = j.interest_form === true; state.retentionDays = j.interest_retention_days;
          return undefined;
        }, function () { return seed(); });
    return /** @type {Promise<void>} */ (state.loading);
  }

  /* ---------------- styles ---------------- */
  function style() {
    if (doc.getElementById("lq-merit-style")) return;
    var st = doc.createElement("style");
    st.id = "lq-merit-style";
    st.textContent =
      ".lq-merit{margin:18px 0;padding:16px;border:1px solid rgba(103,79,242,.28);border-radius:16px;background:rgba(103,79,242,.04);max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}" +
      ".lq-merit *{box-sizing:border-box}.lq-merit h2{font-size:1.1rem;margin:0 0 .4em}.lq-merit h3{font-size:1rem;margin:1em 0 .4em}.lq-merit h4{font-size:1rem;margin:0 0 .3em}" +
      ".lq-merit p{margin:.35em 0;line-height:1.6}.lq-merit-pick{display:flex;flex-direction:column;gap:4px;margin:.6em 0;font-weight:600}" +
      ".lq-merit select,.lq-merit input:not([type=checkbox]){display:block;min-height:44px;width:100%;max-width:100%;min-width:0;font:inherit;font-size:16px;font-weight:400;" +
      "padding:8px 10px;border:1px solid #c9cde0;border-radius:10px;background:#fff;color:#0e1430}" +
      ".lq-merit-cards{display:grid;gap:10px}.lq-merit-card{border:1px solid #dde2ef;border-radius:12px;padding:12px;background:#fff;color:#0e1430}" +
      ".lq-merit-badge{display:inline-block;font-size:.78rem;padding:2px 8px;border-radius:99px;background:#fff3cd;color:#6b4f00;margin-bottom:4px}" +
      ".lq-merit-where{font-size:.9rem;color:#525c78}.lq-merit-label{font-size:.88rem;color:#4b36c9;font-weight:600}" +
      ".lq-merit-foot,.lq-merit-privacy,.lq-merit-notice{font-size:.88rem;opacity:.9}" +
      ".lq-merit-paid{margin-top:18px;padding-top:12px;border-top:1px dashed #b9bfd6}.lq-merit-paid ul{padding-left:1.2em;margin:.4em 0}" +
      ".lq-merit-form{display:grid;gap:10px;margin-top:8px}.lq-merit-form label{display:flex;flex-direction:column;gap:4px}" +
      ".lq-merit-form label.lq-merit-consent{flex-direction:row;align-items:flex-start;gap:10px;min-height:44px}" +
      ".lq-merit-consent input{width:22px;height:22px;flex:none;margin-top:3px}" +
      ".lq-merit button{min-height:44px;min-width:44px;padding:8px 20px;border-radius:99px;border:0;background:#0e1430;color:#fff;font:inherit;cursor:pointer;justify-self:start}" +
      ".lq-merit button[disabled]{opacity:.55;cursor:default}.lq-merit-status{min-height:1.2em;font-size:.92rem;color:#0e7a4a}.lq-merit-status.bad{color:#b42318}" +
      "@media (prefers-color-scheme:dark){.lq-merit-card{background:#1b2140;color:#eef0ff;border-color:#333a5c}.lq-merit select,.lq-merit input:not([type=checkbox])" +
      "{background:#1b2140;color:#eef0ff;border-color:#4a5280}.lq-merit-where{color:#c3c8e6}.lq-merit-label{color:#b9abff}.lq-merit-badge{background:#4a3d00;color:#ffe08a}" +
      ".lq-merit button{background:#b9abff;color:#0e1430}}" +
      "body[class*='-kiosk'] .lq-merit{display:none}@media print{.lq-merit-paid{display:none}}";
    (doc.head || doc.documentElement).appendChild(st);
  }

  /* ---------------- DOM helpers (text only, never HTML from data) ---------------- */
  /** @param {string} tag @param {string} [cls] @param {string} [txt] */
  function el(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var uid = 0;

  /* ---------------- crisis ---------------- */
  function hidePanels() {
    if (panel && !panel.querySelector(".fa-support")) { panel.textContent = ""; panel.hidden = true; }
  }
  function onCrisis() { C.markCrisis(store()); hidePanels(); }
  /** @param {Node} n */
  function isOutsideSupport(n) {
    if (!n || n.nodeType !== 1) return false;
    var e = /** @type {Element} */ (n);
    var s = e.matches(".fa-support") ? e : e.querySelector(".fa-support");
    return !!s && !s.closest(".lq-merit");
  }
  function watchCrisis() {
    if (typeof root.MutationObserver !== "function") return;
    var mo = new root.MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var k = 0; k < added.length; k++) if (isOutsideSupport(added[k])) { onCrisis(); return; }
      }
    });
    mo.observe(doc.documentElement, { childList: true, subtree: true });
    if (isOutsideSupport(doc.documentElement)) onCrisis();
  }
  /** Support card in place of the panel's content (crisis wording typed into the form, or the server said so). */
  function showSupport() {
    C.markCrisis(store());
    var FA = W.FortuneAI;
    if (!panel) return;
    panel.textContent = "";
    var box = el("div", "lq-merit-support");
    panel.appendChild(box);
    if (FA && FA.crisis && FA.crisis.render) FA.crisis.render(box, FA.crisis.result({ lang: lang() }));
    try { box.setAttribute("tabindex", "-1"); box.focus(); } catch (e) { /* older browsers */ }
  }

  /* ---------------- panel ---------------- */
  /** @param {HTMLElement} p */
  function render(p) {
    var L = lang(), U = C.UI[L];
    if (C.crisisActive(store())) { p.textContent = ""; p.hidden = true; return; }
    if (!state.items) { p.hidden = true; load().then(function () { if (p.isConnected) render(p); }); return; }
    var m = C.panelModel(state.items, { choice: C.loadChoice(store()), keys: C.keysFromFacts(state.facts, page), lang: L,
      pageFlag: W.LENSIQ_MERIT_INTEREST_FORM === true, serverFlag: state.serverFlag, crisis: false, retentionDays: state.retentionDays });
    if (!m) { p.textContent = ""; p.hidden = true; return; }
    p.textContent = "";
    p.hidden = false;
    p.setAttribute("lang", L === "zh" ? "zh-Hans" : L);
    var h = el("h2", null, U.title); h.id = "lq-merit-h-" + (++uid);
    p.setAttribute("aria-labelledby", h.id);
    p.appendChild(h);
    p.appendChild(el("p", "lq-merit-intro", U.intro));
    var pick = el("label", "lq-merit-pick"), sel = /** @type {HTMLSelectElement} */ (el("select"));
    sel.name = "tradition";
    C.CHOICES.forEach(function (/** @type {string} */ c) { var o = /** @type {HTMLOptionElement} */ (el("option", null, U["c." + c])); o.value = c; sel.appendChild(o); });
    sel.value = m.choice;
    sel.addEventListener("change", function () {
      C.saveChoice(store(), sel.value);
      render(p);
      var s2 = /** @type {HTMLElement|null} */ (p.querySelector("select[name=tradition]"));
      if (s2) s2.focus();
    });
    pick.appendChild(el("span", null, U.pick)); pick.appendChild(sel);
    p.appendChild(pick);
    p.appendChild(el("p", "lq-merit-privacy", U.privacy));
    if (m.off) { p.appendChild(el("p", "lq-merit-off", U.off)); return; }
    if (!m.cards.length) { p.appendChild(el("p", "lq-merit-empty", U.empty)); p.appendChild(el("p", "lq-merit-foot", m.footer)); return; }
    var lastType = "", wrap = el("div", "lq-merit-cards");
    m.cards.forEach(function (/** @type {any} */ c) {
      if (c.type !== lastType) { lastType = c.type; wrap.appendChild(el("h3", "lq-merit-type", c.typeLabel)); }
      var card = el("article", "lq-merit-card");
      card.setAttribute("data-type", c.type); card.setAttribute("data-tradition", c.tradition); card.setAttribute("data-id", c.id);
      if (c.sample) card.appendChild(el("span", "lq-merit-badge", U.sample));
      card.appendChild(el("h4", null, c.title));
      card.appendChild(el("p", null, c.body));
      if (c.place || c.area) {
        var wh = el("p", "lq-merit-where");
        if (c.place) wh.appendChild(doc.createTextNode(U.place + ": " + c.place));
        if (c.place && c.area) wh.appendChild(doc.createTextNode(" · "));
        if (c.area) wh.appendChild(doc.createTextNode(U.area + ": " + c.area));
        card.appendChild(wh);
      }
      card.appendChild(el("p", "lq-merit-label", c.label));
      wrap.appendChild(card);
    });
    p.appendChild(wrap);
    p.appendChild(el("p", "lq-merit-foot", m.footer));
    if (m.paid) p.appendChild(paidSection(m.paid, U, L));
  }

  /** The optional paid section: description + "request interest" form (minimum fields). @param {any} paid @param {any} U @param {string} L */
  function paidSection(paid, U, L) {
    var sec = el("section", "lq-merit-paid");
    var h = el("h3", null, paid.text["p.title"]); h.id = "lq-merit-ph-" + (++uid);
    sec.setAttribute("aria-labelledby", h.id);
    sec.appendChild(h);
    sec.appendChild(el("p", null, paid.text["p.lead"]));
    var ul = el("ul");
    ul.appendChild(el("li", null, paid.text["p.fee"])); ul.appendChild(el("li", null, paid.text["p.donation"]));
    sec.appendChild(ul);
    sec.appendChild(el("p", "lq-merit-note", paid.text["p.status"]));
    var f = /** @type {HTMLFormElement} */ (el("form", "lq-merit-form"));
    /** @param {string} label @param {HTMLElement} input */
    var field = function (label, input) { var l = el("label"); l.appendChild(el("span", null, label)); l.appendChild(input); f.appendChild(l); return input; };
    /** @param {string} name @param {string} [type] */
    var input = function (name, type) { var i = /** @type {HTMLInputElement} */ (el("input")); i.name = name; i.type = type || "text"; i.required = true; return i; };
    var name = input("name"); name.maxLength = 60; name.setAttribute("autocomplete", "nickname"); field(U["f.name"], name);
    var ch = /** @type {HTMLSelectElement} */ (el("select")); ch.name = "channel";
    ["line", "phone", "email"].forEach(function (k) { var o = /** @type {HTMLOptionElement} */ (el("option", null, U["ch." + k])); o.value = k; ch.appendChild(o); });
    field(U["f.channel"], ch);
    var contact = input("contact"); contact.maxLength = 254; contact.autocomplete = "off"; field(U["f.contact"], contact);
    var item = /** @type {HTMLSelectElement} */ (el("select")); item.name = "item_id";
    paid.items.forEach(function (/** @type {any} */ x) { var o = /** @type {HTMLOptionElement} */ (el("option", null, x.title)); o.value = x.id; item.appendChild(o); });
    field(U["f.item"], item);
    var from = input("date_from", "date"); field(U["f.from"], from);
    var to = input("date_to", "date"); field(U["f.to"], to);
    var cl = el("label", "lq-merit-consent"), consent = input("consent", "checkbox");
    cl.appendChild(consent); cl.appendChild(el("span", null, U["f.consent"]));
    f.appendChild(cl);
    var notice = el("p", "lq-merit-notice", paid.text["f.notice"] + " ");
    var a = /** @type {HTMLAnchorElement} */ (el("a", null, U["f.privacy"])); a.href = "privacy.html";
    notice.appendChild(a);
    f.appendChild(notice);
    var send = /** @type {HTMLButtonElement} */ (el("button", null, U["f.send"])); send.type = "submit";
    f.appendChild(send);
    var status = el("p", "lq-merit-status"); status.setAttribute("role", "status");
    f.appendChild(status);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      status.className = "lq-merit-status"; status.textContent = "";
      var FA = W.FortuneAI;
      // crisis net first, on the device: nothing is sent, the support card replaces the offer. The crisis state is checked
      // again here too (it may have been set after the form was drawn, e.g. in another tab or with storage blocked).
      if (C.crisisActive(store())) { showSupport(); return; }
      if (FA && FA.crisis && FA.crisis.check && FA.crisis.check(name.value, contact.value)) { showSupport(); return; }
      if (!consent.checked) { status.className = "lq-merit-status bad"; status.textContent = U["f.consentNeeded"]; return; }
      var body = { name: name.value.trim(), channel: ch.value, contact: contact.value.trim(), item_id: item.value, date_from: from.value, date_to: to.value,
        consent: true, consent_version: "m1", lang: L };
      var base = apiBase();
      if (!base) { status.className = "lq-merit-status bad"; status.textContent = U["f.err"]; return; }
      send.disabled = true;
      var tok = W.LQApi && W.LQApi.turnstile ? W.LQApi.turnstile("merit") : Promise.resolve("");
      Promise.resolve(tok).catch(function () { return ""; }).then(function (/** @type {any} */ t) {
        /** @type {Record<string, string>} */
        var headers = { "Content-Type": "application/json" };
        if (t) headers["X-Turnstile-Token"] = String(t);
        return W.fetch(base + "/v1/merit/interest", { method: "POST", headers: headers, body: JSON.stringify(body), credentials: "omit", referrerPolicy: "no-referrer" });
      }).then(function (/** @type {Response} */ r) {
        return r.json().catch(function () { return {}; }).then(function (/** @type {any} */ j) {
          if (r.status === 403 && j && j.code === "support") { showSupport(); return; }
          if (!r.ok) throw new Error("HTTP " + r.status);
          f.reset();
          status.textContent = U["f.ok"];
        });
      }).catch(function () { status.className = "lq-merit-status bad"; status.textContent = U["f.err"]; })
        .then(function () { send.disabled = false; });
    });
    sec.appendChild(f);
    return sec;
  }

  /** @param {Element|null} e */
  var inHiddenTab = function (e) { return !!(e && e.closest && e.closest("[role=tabpanel][hidden]")); };
  /** Put the (single) panel right after the reading container (after the report button when it is there). A reading drawn
   *  into a hidden tab (e.g. horoscope "today") never takes the panel away from a visible one. @param {Element} container */
  function place(container) {
    if (!container || !container.parentNode) return null;
    if (panel && panel.isConnected && inHiddenTab(container) && !inHiddenTab(panel)) return panel;
    if (!panel) { panel = el("section", "lq-merit"); panel.hidden = true; }
    var anchor = container, nx = container.nextElementSibling;
    if (nx && nx.classList && nx.classList.contains("lq-rp-wrap")) anchor = nx;
    if (anchor.nextElementSibling !== panel) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    return panel;
  }
  /** @param {Element} container @param {any} result */
  function afterReading(container, result) {
    if (result && result.crisis) { onCrisis(); return; }
    if (C.crisisActive(store())) { hidePanels(); return; }
    if (!result || !(result.sections || []).length) return;
    var p = place(container);
    if (!p) return;
    style();
    render(p);
  }

  /* ---------------- hooks on FortuneAI (outside the fortune team's file) ---------------- */
  var tries = 0;
  /** @param {any} FA @param {string} name @param {(o: Function) => Function} make */
  function wrapFn(FA, name, make) {
    var orig = FA[name];
    if (typeof orig !== "function" || orig.__lqMerit) return;
    var hooked = make(orig);
    /** @type {any} */ (hooked).__lqMerit = true;
    // keep flags other wrappers set on the function they wrapped (lensiq-fortune-hook.js, lensiq-report.js, lensiq-member.js)
    Object.keys(orig).forEach(function (k) { if (!(k in hooked)) /** @type {any} */ (hooked)[k] = orig[k]; });
    FA[name] = hooked;
  }
  function wrap() {
    var FA = W.FortuneAI;
    if (!FA || typeof FA.renderSections !== "function") {
      // nav.js may run this file before fortune-ai.js: every classic script has run by DOMContentLoaded (before any reading)
      if (doc.readyState === "loading" && !tries++) doc.addEventListener("DOMContentLoaded", wrap);
      else if (tries++ < 60) setTimeout(wrap, 250);
      return;
    }
    var facts = function (/** @type {Function} */ orig) {
      return /** @this {any} */ function (/** @type {any} */ f) { state.facts = f; return orig.apply(this, arguments); };
    };
    wrapFn(FA, "interpret", facts);
    wrapFn(FA, "regenerate", facts);
    wrapFn(FA, "renderSections", function (orig) {
      return /** @this {any} */ function (/** @type {Element} */ container, /** @type {any} */ result) {
        var out = orig.apply(this, arguments);
        try { afterReading(container, result); } catch (e) { /* never break a reading */ }
        return out;
      };
    });
  }

  root.addEventListener("lq-lang", function () { if (panel && !panel.hidden && panel.isConnected) render(panel); });
  // a support card in another tab of this browser: withdraw the panel and any paid offer here too
  root.addEventListener("storage", function (ev) { if (ev && ev.key === C.CRISIS_KEY && C.crisisActive(store())) hidePanels(); });
  W.LQMerit = { render: function () { if (panel) render(panel); }, load: load, state: state };
  watchCrisis();
  wrap();
})(typeof window !== "undefined" ? window : globalThis);
