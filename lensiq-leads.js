/* lensiq-leads.js — one transport for the contact / demo-request form (index.html), the "notify me" boxes (pricing.html,
 * account.html) and any other lead form. TH / EN / 中文 texts stay in the calling page.
 *
 *   1) API configured (LENSIQ_API_BASE): POST <api>/v1/leads {name, org, email, phone, interest, plan, message, source,
 *      lang, consent: true} with a fresh Cloudflare Turnstile token (X-Turnstile-Token, action "lead") — the Worker keeps
 *      it in the admin inbox and notifies the owner. Resolves {via: "api", ok: true}.
 *   2) No API, or the Worker refused / is not deployed yet: a mailto: link to LENSIQ_SELLER.email (subject + body filled
 *      in, the visitor's own mail app sends it) and/or the LINE Official Account link (LENSIQ_SELLER.line).
 *      Resolves {via: "mailto" | "line", ok: false, href, line}. Nothing has been sent at that point — the page says so.
 *   3) Neither configured: {via: "none", ok: false} — the page says honestly that the details are not announced yet.
 * Nothing is sent anywhere else; the lead never goes to analytics. Pure helpers are unit-tested in Node
 * (tests/unit/leads.test.js). */
(function (root) {
  "use strict";
  var LIMITS = /** @type {Record<string, number>} */ ({ name: 120, org: 160, email: 254, phone: 32, interest: 40, plan: 40, message: 1000, source: 40, lang: 5 });

  /** A config value that is really filled in (not empty, not a "[placeholder]"). @param {any} v */
  function filled(v) { var s = typeof v === "string" ? v.trim() : ""; return !!s && !/^\[.*\]$/.test(s); }

  /** LENSIQ_SELLER with every value trimmed; unfilled values become "". @param {any} cfg */
  function sellerOf(cfg) {
    var out = /** @type {Record<string, any>} */ ({});
    var c = cfg && typeof cfg === "object" ? cfg : {};
    Object.keys(c).forEach(function (k) { out[k] = typeof c[k] === "string" ? (filled(c[k]) ? c[k].trim() : "") : c[k]; });
    return out;
  }
  /** Plausible e-mail address. @param {string} e */
  function isEmail(e) { return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(String(e || "")); }
  /** LINE Official Account add-friend URL for "@id" / "id" ("" when unset or malformed). @param {string} id */
  function lineUrl(id) {
    var s = String(id || "").trim();
    if (!s) return "";
    if (/^https:\/\/(line\.me|lin\.ee)\//.test(s)) return s;
    s = s.charAt(0) === "@" ? s : "@" + s;
    return /^@[A-Za-z0-9._-]{2,40}$/.test(s) ? "https://line.me/R/ti/p/" + encodeURIComponent(s) : "";
  }
  /** Lead fields clipped to the Worker's limits (strings only). @param {any} lead */
  function cleanLead(lead) {
    var out = /** @type {Record<string, string>} */ ({});
    Object.keys(LIMITS).forEach(function (k) {
      var v = lead && lead[k] != null ? String(lead[k]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim() : "";
      if (v) out[k] = v.slice(0, LIMITS[k]);
    });
    return out;
  }
  /** mailto: link with the lead in the body (the visitor's mail app sends it). @param {string} to @param {any} lead @param {string} [subject] */
  function mailtoHref(to, lead, subject) {
    if (!isEmail(to)) return "";
    var l = cleanLead(lead);
    var lines = [["Name", l.name], ["Organisation", l.org], ["E-mail", l.email], ["Phone", l.phone], ["Interest", l.interest], ["Plan", l.plan], ["Page", l.source]]
      .filter(function (x) { return x[1]; }).map(function (x) { return x[0] + ": " + x[1]; });
    if (l.message) lines.push("", l.message);
    var subj = subject || ("LENSIQ — " + (l.interest || "contact") + (l.org ? " — " + l.org : ""));
    return "mailto:" + to + "?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(lines.join("\n"));
  }
  /** Which fallback the page can offer without an API: {mailto, line, any}. @param {any} cfg */
  function fallbackOf(cfg) {
    var s = sellerOf(cfg);
    var line = lineUrl(s.line || "");
    return { email: isEmail(s.email) ? s.email : "", line: line, lineId: line ? String(s.line) : "", any: !!(isEmail(s.email) || line) };
  }

  var pure = { filled: filled, sellerOf: sellerOf, isEmail: isEmail, lineUrl: lineUrl, cleanLead: cleanLead, mailtoHref: mailtoHref, fallbackOf: fallbackOf, LIMITS: LIMITS };
  if (typeof module !== "undefined" && module.exports) { module.exports = pure; return; }

  /* ============================ browser ============================ */
  /** @type {any} */
  var W = root;
  /**
   * Sends a lead (see the header). Never rejects.
   * @param {any} lead @param {{subject?: string}} [opts]
   * @returns {Promise<{via: string, ok: boolean, href?: string, line?: string, lineId?: string, status?: number}>}
   */
  function submit(lead, opts) {
    var o = opts || {};
    var body = Object.assign(cleanLead(lead), { consent: true });
    var fb = function (/** @type {number} */ status) {
      var f = fallbackOf(W.LENSIQ_SELLER);
      var href = f.email ? mailtoHref(f.email, lead, o.subject) : "";
      return { via: href ? "mailto" : f.line ? "line" : "none", ok: false, href: href || undefined, line: f.line || undefined, lineId: f.lineId || undefined, status: status };
    };
    var A = W.LQApi;
    if (!A || !A.enabled() || typeof A.call !== "function") return Promise.resolve(fb(0));
    return Promise.resolve(A.turnstile ? A.turnstile("lead") : "").then(function (/** @type {string} */ tok) {
      return A.call("/v1/leads", { method: "POST", body: body, headers: tok ? { "X-Turnstile-Token": tok } : {} });
    }).then(function (/** @type {any} */ r) {
      return r && r.ok ? { via: "api", ok: true, status: r.status } : fb(r ? r.status : 0);
    }, function () { return fb(0); });
  }
  W.LQLeads = Object.assign({ submit: submit, fallback: function () { return fallbackOf(W.LENSIQ_SELLER); } }, pure);
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
