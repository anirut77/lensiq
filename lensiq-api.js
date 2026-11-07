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
 *   LQApi.beacon(path, body)             -> boolean   (navigator.sendBeacon, text/plain = no CORS preflight)
 *   LQApi.config()                       -> Promise<{analytics, free_mode, pricing_enabled}|null>  (cached)
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
    var timer = ac ? setTimeout(function () { ac.abort(); }, o.timeoutMs || 15000) : null;
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

  var api = { enabled: enabled, base: base, url: url, getJSON: getJSON, postJSON: postJSON, beacon: beacon, config: config };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LQApi = api;
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
