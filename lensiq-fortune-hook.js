/* lensiq-fortune-hook.js — integration hook for the fortune pages (separate from fortune-ai.js, which the fortune team
 * owns). Loaded by lensiq-config.js only when LENSIQ_API_BASE is set.
 *
 * 1) Analytics (no-op unless the visitor opted in, lensiq-analytics.js): wraps FortuneAI.interpret(facts, opts)
 *    transparently (same arguments, same returned promise value) to record
 *      reading_domain {domain: facts.domain}                 — one of the 15 fixed domain ids
 *      feature_used   {feature: "fortune.reading", step: start|complete}
 *      feature_used   {feature: "fortune.ai" | "fortune.local"}
 *    Nothing from the facts other than the domain id is read.
 * 2) Cloudflare Turnstile (only when window.LENSIQ_TURNSTILE_SITEKEY is set): loads the Turnstile widget (invisible
 *    unless Cloudflare needs an interaction) and adds a fresh `X-Turnstile-Token` header to the POST that fortune-ai.js
 *    makes to <LENSIQ_API_BASE>/api/fortune — no other request is touched. Without a token the Worker refuses the AI
 *    call and the page falls back to the local composer, exactly as when AI is off.
 *
 * Fortune team: the cleaner long-term version is an `opts.headers` / `getAIHeaders()` hook in fortune-ai.js; then the
 * fetch wrapper here can go. Analytics can likewise be called directly (guarded by `root.LQAnalytics &&`).
 */
(function (root) {
  "use strict";
  /** @type {any} */
  var W = root;
  W.__lqFortuneHook = true;

  /* ---------------- analytics ---------------- */
  var tries = 0;
  function wrap() {
    var FA = W.FortuneAI;
    if (!FA || typeof FA.interpret !== "function") { if (tries++ < 40) setTimeout(wrap, 250); return; }
    if (FA.interpret.__lqHooked) return;
    var orig = FA.interpret;
    /** @this {any} */
    var hooked = function (/** @type {any} */ facts, /** @type {any} */ opts) {
      var A = root.LQAnalytics;
      try { if (A && facts && facts.domain) { A.domain(String(facts.domain)); A.feature("fortune.reading", "start"); } } catch (e) { /* never break a reading */ }
      var p = orig.apply(this, arguments);
      if (A && p && typeof p.then === "function") {
        p.then(function (/** @type {any} */ r) {
          try { A.feature("fortune.reading", "complete"); A.feature(r && r.source === "ai" ? "fortune.ai" : "fortune.local"); } catch (e) { /* ignore */ }
        }, function () { /* the page handles its own errors */ });
      }
      return p;
    };
    hooked.__lqHooked = true;
    FA.interpret = hooked;
  }

  /* ---------------- Turnstile ---------------- */
  var siteKey = String(W.LENSIQ_TURNSTILE_SITEKEY || "").trim();
  var widgetId = /** @type {any} */ (null);
  var pending = /** @type {Array<(t: string) => void>} */ ([]);
  var loadP = /** @type {Promise<any>|null} */ (null);
  function loadTurnstile() {
    if (loadP) return loadP;
    loadP = new Promise(function (resolve) {
      if (W.turnstile) { resolve(W.turnstile); return; }
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = function () { resolve(W.turnstile || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return loadP;
  }
  /** A fresh single-use token (or "" when Turnstile is unavailable — the Worker then refuses and the page falls back). */
  function token() {
    return loadTurnstile().then(function (ts) {
      if (!ts) return "";
      return new Promise(function (resolve) {
        var done = false;
        var finish = function (/** @type {string} */ t) { if (!done) { done = true; resolve(t || ""); } };
        setTimeout(function () { finish(""); }, 15000);
        pending.push(finish);
        try {
          if (widgetId == null) {
            var box = document.createElement("div");
            box.setAttribute("data-lq-turnstile", "");
            box.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483000";
            document.body.appendChild(box);
            widgetId = ts.render(box, {
              sitekey: siteKey, action: "fortune", execution: "execute", appearance: "interaction-only",
              callback: function (/** @type {string} */ t) { var q = pending.splice(0); q.forEach(function (f) { f(t); }); },
              "error-callback": function () { var q = pending.splice(0); q.forEach(function (f) { f(""); }); }
            });
          } else ts.reset(widgetId);
          ts.execute(widgetId);
        } catch (e) { finish(""); }
      });
    });
  }
  function hookFetch() {
    if (!siteKey || typeof W.fetch !== "function" || W.fetch.__lqTurnstile) return;
    var orig = W.fetch;
    var target = function () { return String(W.LENSIQ_API_BASE || "").replace(/\/+$/, "") + "/api/fortune"; };
    var wrapped = function (/** @type {any} */ input, /** @type {any} */ init) {
      var url = typeof input === "string" ? input : input && input.url;
      var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (method !== "POST" || url !== target()) return orig.apply(W, arguments);
      return token().then(function (t) {
        var i2 = Object.assign({}, init || {});
        var h = new Headers((init && init.headers) || {});
        if (t) h.set("X-Turnstile-Token", t);
        i2.headers = h;
        return orig.call(W, input, i2);
      });
    };
    wrapped.__lqTurnstile = true;
    W.fetch = wrapped;
  }

  hookFetch();
  if (root.document && root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", wrap);
  else wrap();
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
