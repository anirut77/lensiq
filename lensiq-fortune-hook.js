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
 * 3) Member sign-in (lensiq-member.js, only when the owner turned membership on): adds `Authorization: Bearer <member
 *    token>` to the same POST and to the GET /api/fortune/status probe, so the Worker applies the member's AI quota.
 *    Guests' requests are unchanged.
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

  /* ---------------- Turnstile (token from lensiq-api.js LQApi.turnstile) + member session ---------------- */
  var siteKey = String(W.LENSIQ_TURNSTILE_SITEKEY || "").trim();
  /** A fresh single-use token, or "" (the Worker then refuses — Turnstile is fail-closed — and the page falls back). */
  function token() { return siteKey && W.LQApi && W.LQApi.turnstile ? W.LQApi.turnstile("fortune") : Promise.resolve(""); }
  /** Member bearer token from lensiq-member.js (signed-in members get their AI quota; "" for guests). */
  function memberToken() { try { return W.LQMember && W.LQMember.token ? String(W.LQMember.token() || "") : ""; } catch (e) { return ""; } }
  function hookFetch() {
    if (typeof W.fetch !== "function" || W.fetch.__lqTurnstile) return;
    var orig = W.fetch;
    var api = function () { return String(W.LENSIQ_API_BASE || "").replace(/\/+$/, ""); };
    var wrapped = function (/** @type {any} */ input, /** @type {any} */ init) {
      var url = typeof input === "string" ? input : input && input.url;
      var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      var post = method === "POST" && url === api() + "/api/fortune";
      var status = method === "GET" && url === api() + "/api/fortune/status";
      var mt = post || status ? memberToken() : "";
      // only the AI writing-assistant requests are touched; the status probe only when a member is signed in
      if (!(post && (siteKey || mt)) && !(status && mt)) return orig.apply(W, arguments);
      return (post ? token() : Promise.resolve("")).then(function (t) {
        var i2 = Object.assign({}, init || {});
        var h = new Headers((init && init.headers) || {});
        if (t) h.set("X-Turnstile-Token", t);
        if (mt) h.set("Authorization", "Bearer " + mt);
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
