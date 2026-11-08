/* lensiq-api.js — tiny client for the optional LENSIQ API Worker (backend/, docs/BACKEND.md).
 *
 * Configured by window.LENSIQ_API_BASE (lensiq-config.js). Empty (default) = no backend: every call resolves to null
 * and nothing leaves the browser, so all pages keep working offline / on plain GitHub Pages exactly as before.
 * The page CSP must list the API origin in connect-src (node tools/csp-meta.mjs reads LENSIQ_API_BASE from
 * lensiq-config.js and adds it only when it is set).
 *
 *   LQApi.enabled()                      -> boolean
 *   LQApi.url(path)                      -> absolute URL on the API ("" when disabled)
 *   LQApi.getJSON(path, opts?)           -> Promise<object|null>   (null: disabled / network error / non-2xx)
 *   LQApi.postJSON(path, body, opts?)    -> Promise<object|null>
 *   LQApi.call(path, opts?)              -> Promise<{ok, status, j}>  like request() but keeps the HTTP status and the
 *                                           error body (codes such as "saved_full"); status 0 = disabled / network /
 *                                           timeout (opts.timeoutMs, default 15 s). Used by lensiq-member.js.
 *   LQApi.beacon(path, body)             -> boolean   (navigator.sendBeacon, text/plain = no CORS preflight)
 *   LQApi.config()                       -> Promise<{analytics, free_mode, pricing_enabled}|null>  (cached)
 *   LQApi.turnstile(action)              -> Promise<string>  fresh Cloudflare Turnstile token ("" when no site key /
 *                                           unavailable — the Worker then refuses: Turnstile is fail-closed there)
 */
(function (root) {
  "use strict";

  /** @returns {string} */
  function base() {
    var b = String((root && root.LENSIQ_API_BASE) || "").trim().replace(/\/+$/, "");
    return /^https?:\/\/[A-Za-z0-9.\-:[\]]+$/.test(b) ? b : "";
  }
  function enabled() { return !!base(); }
  /** @param {string} path */
  function url(path) { return enabled() ? base() + (path.charAt(0) === "/" ? path : "/" + path) : ""; }

  /**
   * @param {string} path
   * @param {{method?: string, body?: any, timeoutMs?: number, credentials?: RequestCredentials, headers?: Record<string, string>}} [opts]
   * @returns {Promise<any>}
   */
  function request(path, opts) {
    var o = opts || {};
    if (!enabled() || typeof fetch !== "function") return Promise.resolve(null);
    var ac = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ac ? setTimeout(function () { if (ac) ac.abort(); }, o.timeoutMs || 15000) : null;
    /** @type {RequestInit} */
    var init = { method: o.method || "GET", credentials: o.credentials || "omit", headers: o.headers || {}, signal: ac ? ac.signal : undefined };
    if (o.body !== undefined) { init.body = JSON.stringify(o.body); init.headers = Object.assign({ "Content-Type": "application/json" }, o.headers || {}); }
    return fetch(url(path), init)
      .then(function (r) { return r.ok ? r.json().catch(function () { return {}; }) : null; })
      .catch(function () { return null; })
      .finally(function () { if (timer) clearTimeout(timer); });
  }
  /** @param {string} path @param {any} [opts] */
  function getJSON(path, opts) { return request(path, opts); }
  /** @param {string} path @param {any} body @param {any} [opts] */
  function postJSON(path, body, opts) { return request(path, Object.assign({}, opts || {}, { method: "POST", body: body })); }

  /**
   * Same transport as request() (timeout, credentials "omit") but resolves {ok, status, j} — never rejects.
   * @param {string} path
   * @param {{method?: string, body?: any, timeoutMs?: number, headers?: Record<string, string>, cache?: RequestCache, referrerPolicy?: ReferrerPolicy}} [opts]
   * @returns {Promise<{ok: boolean, status: number, j: any}>}
   */
  function call(path, opts) {
    var o = opts || {};
    if (!enabled() || typeof fetch !== "function") return Promise.resolve({ ok: false, status: 0, j: null });
    var ac = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ac ? setTimeout(function () { if (ac) ac.abort(); }, o.timeoutMs || 15000) : null;
    /** @type {Record<string, string>} */
    var h = Object.assign({}, o.headers || {});
    if (o.body !== undefined) h["Content-Type"] = "application/json";
    /** @type {RequestInit} */
    var init = { method: o.method || "GET", headers: h, credentials: "omit", cache: o.cache || "no-store", referrerPolicy: o.referrerPolicy || "no-referrer", signal: ac ? ac.signal : undefined };
    if (o.body !== undefined) init.body = JSON.stringify(o.body);
    return fetch(url(path), init)
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .catch(function () { return { ok: false, status: 0, j: null }; })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  /** @param {string} path @param {any} body */
  function beacon(path, body) {
    if (!enabled()) return false;
    var data = JSON.stringify(body);
    try {
      if (root.navigator && typeof root.navigator.sendBeacon === "function") {
        return root.navigator.sendBeacon(url(path), new Blob([data], { type: "text/plain;charset=UTF-8" }));
      }
    } catch (e) { /* fall through to fetch */ }
    if (typeof fetch === "function") {
      fetch(url(path), { method: "POST", body: data, headers: { "Content-Type": "text/plain;charset=UTF-8" }, keepalive: true, credentials: "omit" }).catch(function () { /* offline */ });
      return true;
    }
    return false;
  }

  /** @type {Promise<any>|null} */
  var cfgP = null, cfgBase = "";
  function config() {
    if (!cfgP || cfgBase !== base()) { cfgBase = base(); cfgP = getJSON("/v1/config"); }
    return cfgP;
  }

  /* ---- Cloudflare Turnstile (window.LENSIQ_TURNSTILE_SITEKEY; CSP gets challenges.cloudflare.com only when set) ---- */
  /** @type {Promise<any>|null} */
  var tsLoad = null;
  /** @type {Record<string, any>} */
  var tsWidgets = {};
  function turnstileLib() {
    if (tsLoad) return tsLoad;
    tsLoad = new Promise(function (resolve) {
      var W = /** @type {any} */ (root);
      if (W.turnstile) { resolve(W.turnstile); return; }
      var d = root.document;
      if (!d) { resolve(null); return; }
      var s = d.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = function () { resolve(W.turnstile || null); };
      s.onerror = function () { resolve(null); };
      d.head.appendChild(s);
    });
    return tsLoad;
  }
  /** @param {string} action */
  function turnstile(action) {
    var key = String(/** @type {any} */ (root).LENSIQ_TURNSTILE_SITEKEY || "").trim();
    if (!key) return Promise.resolve("");
    return turnstileLib().then(function (ts) {
      if (!ts) return "";
      return new Promise(function (resolve) {
        var w = tsWidgets[action] || (tsWidgets[action] = { id: null, q: [] });
        var done = false;
        var finish = function (/** @type {string} */ t) { if (!done) { done = true; resolve(t || ""); } };
        setTimeout(function () { finish(""); }, 15000);
        w.q.push(finish);
        var flush = function (/** @type {string} */ t) { var q = w.q.splice(0); q.forEach(function (/** @type {any} */ f) { f(t); }); };
        try {
          if (w.id == null) {
            var box = root.document.createElement("div");
            box.setAttribute("data-lq-turnstile", action);
            box.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483000";
            root.document.body.appendChild(box);
            w.id = ts.render(box, { sitekey: key, action: action, execution: "execute", appearance: "interaction-only", callback: flush, "error-callback": function () { flush(""); } });
          } else ts.reset(w.id);
          ts.execute(w.id);
        } catch (e) { finish(""); }
      });
    });
  }

  var api = { enabled: enabled, base: base, url: url, getJSON: getJSON, postJSON: postJSON, call: call, beacon: beacon, config: config, turnstile: turnstile };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LQApi = api;
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
