/* lensiq-member.js — member sign-in ("Sign in with Google"), the account chip in the header and the light-reading
 * gate of the fortune pages. Loaded by lensiq-config.js only when LENSIQ_API_BASE is set (never on admin.html).
 *
 * INERT unless all of these hold: the API Worker is configured, it reports `membership.required` (owner switch in
 * admin -> Members, default OFF) and window.LENSIQ_GOOGLE_CLIENT_ID is set in lensiq-config.js (the page CSP then
 * allows https://accounts.google.com/gsi/). With no backend (GitHub Pages today) this file is never even loaded.
 *
 * Tiers: guest -> light reading (summary + first sections + gentle cautions + the reminder; the rest replaced by a
 *        "sign in free with Google" card), a small soft per-device daily count, no AI writing assistant (the Worker
 *        refuses it); member -> full reading, save to history, print/PDF, AI within the daily quota; paid -> plan quotas.
 *        Safety texts (Kalama reminder, gentle cautions, notes) and consent texts are NEVER gated.
 * Google's script (https://accounts.google.com/gsi/client) is loaded only after the visitor clicks "continue with
 * Google" in our own dialog — no third-party request on page load. The ID token is verified by the Worker
 * (POST /api/auth/google, nonce from POST /api/auth/nonce); we keep only the Worker's member token — in sessionStorage
 * by default (gone when the tab closes), in localStorage only when the member ticks "remember me on this device"
 * (try/catch) — sent as `Authorization: Bearer` (the API is another origin — no third-party cookies).
 * Guest purchases (pricing.js, before sign-in was required): the one-time customer_id + order_token are kept locally
 * (PENDING_KEY) and linked to the account with POST /v1/billing/claim right after the next sign-in.
 *
 *   LQMember.active()            gate on (membership required + sign-in possible)
 *   LQMember.signedIn() / me()   current member ({user, tier, plan, quotas}) or null
 *   LQMember.token()             bearer token or "" (lensiq-fortune-hook.js adds it to /api/fortune)
 *   LQMember.signIn() / signOut() / refresh() / history() / exportData() / deleteAccount() / getSaved(id) / deleteSaved(id)
 *   LQMember.mountNav(header)    account chip (called by nav.js; idempotent); a 44 px avatar / sign-in icon on phones
 *   LQMember.claimPending() / pendingClaims() / addPendingClaim(c) / claim(c)   guest purchase -> account
 *   LQMember.receipt(paymentId) / sessions() / signOutEverywhere()             account page helpers (feature-detected)
 *   LQMember.lightResult(res, {sections, over})  pure: the guest version of a FortuneAI result
 * Events on window: "lq-member" (state changed), "lq-member-ready" (first state known).
 */
(function (root) {
  "use strict";
  /** @type {any} */
  var W = root;
  var CONSENT_VERSION = "m1"; // = backend/src/members.js MEMBER_CONSENT_VERSION
  var TOKEN_KEY = "lq-member-session";
  var COUNT_KEY = "lq-guest-reads";
  var CFG_KEY = "lq-member-cfg";
  var PENDING_KEY = "lq-pending-claims";
  var GSI_SRC = "https://accounts.google.com/gsi/client";

  /* ============================ pure helpers (unit-tested in Node) ============================ */
  // gentle-caution sentences: the markers of fortune-ai.js CAUTION_MARK_TH / _ZH / _EN (kept in sync by
  // tests/unit/member-caution-sync.test.js, which reads fortune-ai.js) plus a few extra English words
  var CAUTION_MARKS = {
    th: ["ควรระวัง", "ตึงมือ", "ระมัดระวัง", "ต้องใช้แรงมากกว่าปกติ", "ต้องการความเข้าใจมากขึ้น", "ควรใจเย็นกับกันและกัน", "เดินอย่างรอบคอบ", "จุดที่ควรใส่ใจ"],
    zh: ["紧一些", "多留意", "多留心", "多花些力气", "多一些体谅", "多一点耐心", "宜稳"],
    en: ["a little tight", "keep a closer eye", "a bit more effort", "move steadily rather than rush", "a little extra understanding", "patience with each other", "a little extra care", "move thoughtfully"],
    enExtra: ["be careful", "take care", "caution", "go carefully", "watch your spending", "tight"]
  };
  var reEsc = function (/** @type {string} */ x) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
  var CAUTION_RE = new RegExp(CAUTION_MARKS.th.concat(CAUTION_MARKS.zh, CAUTION_MARKS.en).map(reEsc).join("|") + "|\\b(?:" + CAUTION_MARKS.enExtra.map(reEsc).join("|") + ")\\b", "i");

  /** Paragraphs of `sections` that carry a gentle caution (shown to guests too — safety is never gated). */
  function cautionParagraphs(sections, max) {
    var out = [];
    (sections || []).forEach(function (/** @type {any} */ s) {
      (s && s.paragraphs || []).forEach(function (/** @type {string} */ p) {
        if (out.length < (max || 4) && CAUTION_RE.test(String(p)) && out.indexOf(p) < 0) out.push(String(p));
      });
    });
    return out;
  }

  /**
   * Guest ("light") version of a FortuneAI result. Keeps: summary, note, reminder, the first `sections` sections and
   * every gentle caution from the hidden ones. Drops: the remaining sections and the improvement plan.
   * @param {any} res @param {{sections?: number, over?: boolean, cautionTitle?: string}} [o]
   */
  function lightResult(res, o) {
    o = o || {};
    if (!res || !Array.isArray(res.sections)) return res;
    var n = o.over ? 0 : Math.max(1, o.sections == null ? 2 : o.sections);
    var open = res.sections.filter(function (/** @type {any} */ s) { return !s.collapsed; });
    var shown = open.slice(0, n);
    var hidden = res.sections.filter(function (/** @type {any} */ s) { return shown.indexOf(s) < 0; });
    var cautions = cautionParagraphs(hidden, 4);
    var out = Object.assign({}, res, { sections: shown.slice() });
    delete out.plan;
    if (cautions.length) out.sections.push({ id: "cautions", title: o.cautionTitle || "จุดที่ควรใส่ใจ", paragraphs: cautions });
    out.light = { hiddenSections: hidden.length, plan: !!(res.plan && res.plan.items && res.plan.items.length), over: !!o.over };
    return out;
  }

  /** Soft per-device daily counter: counts one more reading and returns {store, n, over}. Renders within `gapMs` of
   *  the previous count (progressive renders, a language switch re-rendering the same reading) are not counted again.
   *  @param {any} store @param {string} day @param {number} limit @param {number} [nowMs] @param {number} [gapMs] */
  function countGuest(store, day, limit, nowMs, gapMs) {
    var t = nowMs == null ? Date.now() : nowMs;
    var c = store && store.d === day ? store : { d: day, n: 0, t: 0 };
    var same = c.n > 0 && c.t && t - c.t < (gapMs == null ? 3000 : gapMs);
    var next = { d: day, n: same ? c.n : (c.n || 0) + 1, t: t };
    return { store: next, n: next.n, over: next.n > limit };
  }

  /** Gate decision from the Worker's /v1/config and the page's client id. */
  function gateOn(cfg, clientId) { return !!(cfg && cfg.membership && cfg.membership.required && clientId); }
  function signInPossible(cfg, clientId) { return !!(cfg && cfg.membership && cfg.membership.google_client_id && clientId); }

  /** Stored member session: sessionStorage first (default), then localStorage ("remember me"). Expired / malformed
   *  entries are dropped. Returns {sess, where: "session"|"local"|null}. */
  function pickSession(sessionVal, localVal, nowMs) {
    var t = nowMs == null ? Date.now() : nowMs;
    var ok = function (/** @type {any} */ v) { return !!(v && v.t && v.exp && v.exp * 1000 > t); };
    if (ok(sessionVal)) return { sess: sessionVal, where: "session" };
    if (ok(localVal)) return { sess: localVal, where: "local" };
    return { sess: null, where: null };
  }
  /** What to do with a stored guest purchase after POST /v1/billing/claim: "done" (linked: forget it), "drop" (invalid,
   *  already claimed or too old: forget it), "keep" (network / server / endpoint not deployed yet: try again later). */
  function claimOutcome(r, ageSec) {
    if (r && r.ok) return "done";
    var code = r && r.j && r.j.code;
    if (code === "already_claimed" || code === "claim_taken" || code === "invalid_claim" || code === "claim_invalid" || code === "not_found" || code === "invalid_token") return "drop";
    if (r && (r.status === 400 || r.status === 403 || r.status === 409 || r.status === 410)) return "drop";
    if (ageSec != null && ageSec > 90 * 86400) return "drop";
    return "keep";
  }
  /** Adds a guest purchase to the pending list (deduplicated by customer id, newest first, at most 5). */
  function addClaim(list, c, nowSec) {
    if (!c || !/^[A-Za-z0-9_-]{6,64}$/.test(String(c.customer_id || "")) || !/^[A-Za-z0-9_-]{16,128}$/.test(String(c.order_token || ""))) return Array.isArray(list) ? list : [];
    var rest = (Array.isArray(list) ? list : []).filter(function (x) { return x && x.customer_id !== c.customer_id; });
    return [{ customer_id: String(c.customer_id), order_token: String(c.order_token), payment_id: c.payment_id ? String(c.payment_id) : null, plan_id: c.plan_id ? String(c.plan_id) : null, at: nowSec == null ? Math.floor(Date.now() / 1000) : nowSec }].concat(rest).slice(0, 5);
  }

  /** Upgrade / report card decision for a rendered reading: "light" (guest light reading), "quota" (the writing
   *  assistant refused with code "quota" today and this reading was composed on the device) or null.
   *  @param {any} res @param {any} gated @param {string|null} quotaDay @param {string} day */
  function upsell(res, gated, quotaDay, day) {
    if (gated && gated.light) return "light";
    if (res && res.source !== "ai" && quotaDay && quotaDay === day) return "quota";
    return null;
  }

  /** Renewal reminder for a paid plan with no automatic renewal (terms section 8): due from `days` (7) before
   *  current_period_end until it ends. The Worker's own plan.renewal_due wins when it sends one.
   *  -> {due, days, ends} | {due: false}  @param {any} plan @param {number} [nowSec] @param {number} [days] */
  function renewalDue(plan, nowSec, days) {
    if (!plan || !plan.current_period_end || plan.source === "grant") return { due: false };
    var t = nowSec == null ? Math.floor(Date.now() / 1000) : nowSec, left = plan.current_period_end - t;
    var win = (days == null ? 7 : days) * 86400;
    var due = typeof plan.renewal_due === "boolean" ? plan.renewal_due : left > 0 && left <= win;
    return due ? { due: true, days: Math.max(0, Math.ceil(left / 86400)), ends: plan.current_period_end } : { due: false };
  }

  /** /api/me -> the plan shape renewalDue() reads: the Worker's top-level renewal_due / renewal (round 11) win over
   *  the client-side 7-day window. @param {any} me */
  function planForRenewal(me) {
    if (!me || !me.plan) return null;
    var p = Object.assign({}, me.plan);
    if (typeof me.renewal_due === "boolean") p.renewal_due = me.renewal_due;
    if (me.renewal && me.renewal.current_period_end) p.current_period_end = me.renewal.current_period_end;
    return p;
  }

  var pure = { planForRenewal: planForRenewal, renewalDue: renewalDue, pickSession: pickSession, claimOutcome: claimOutcome, addClaim: addClaim, lightResult: lightResult, cautionParagraphs: cautionParagraphs, countGuest: countGuest, gateOn: gateOn, signInPossible: signInPossible, upsell: upsell, CONSENT_VERSION: CONSENT_VERSION, CAUTION_RE: CAUTION_RE, CAUTION_MARKS: CAUTION_MARKS };
  if (typeof module !== "undefined" && module.exports) { module.exports = pure; return; }

  /* ============================ browser ============================ */
  var doc = root.document;
  if (!doc) return;
  var me0 = /** @type {HTMLScriptElement|null} */ (doc.currentScript);
  var dir = me0 && me0.src ? me0.src.replace(/[^/]*$/, "").replace(/\?.*$/, "") : "";
  var API = function () { return W.LQApi; };
  /** @param {string} key @param {string} thai @param {Record<string, any>} [vars] */
  var T = function (key, thai, vars) {
    if (W.LQI18N && typeof W.LQI18N.tf === "function") return W.LQI18N.tf(key, thai, vars);
    return String(thai).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  };
  var clientId = function () { return String(W.LENSIQ_GOOGLE_CLIENT_ID || "").trim(); };
  var ls = {
    get: function (/** @type {string} */ k) { try { var v = root.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (/** @type {string} */ k, /** @type {any} */ v) { try { if (v == null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var ss = {
    get: function (/** @type {string} */ k) { try { var v = root.sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (/** @type {string} */ k, /** @type {any} */ v) { try { if (v == null) root.sessionStorage.removeItem(k); else root.sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* blocked */ } }
  };
  var today = function () { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); };

  var st = /** @type {any} */ ({ cfg: ss.get(CFG_KEY), me: null, ready: false });
  var picked = pickSession(ss.get(TOKEN_KEY), ls.get(TOKEN_KEY));
  var sess = picked.sess, sessWhere = picked.where;
  if (sessWhere !== "local") ls.set(TOKEN_KEY, null);
  if (sessWhere !== "session") ss.set(TOKEN_KEY, null);
  /** @param {any} s @param {boolean} [remember] keep in localStorage (survives closing the browser) */
  function saveSession(s, remember) {
    sess = s; sessWhere = s ? (remember ? "local" : "session") : null;
    ls.set(TOKEN_KEY, s && remember ? s : null);
    ss.set(TOKEN_KEY, s && !remember ? s : null);
  }
  function token() { return sess && sess.t ? String(sess.t) : ""; }
  function active() { return gateOn(st.cfg, clientId()); }
  function googleOn() { return signInPossible(st.cfg, clientId()); }
  /** stream G: LINE Login offered by the Worker (/v1/config membership.line_enabled; the Worker refuses it otherwise) */
  function lineOn() { return !!(st.cfg && st.cfg.membership && st.cfg.membership.line_enabled); }
  function possible() { return googleOn() || lineOn(); }
  /** sign-in label for the header / buttons: names the provider(s) that are actually on */
  function signInLabel() {
    return googleOn() && lineOn() ? T("mem.chip.signinAny", "เข้าสู่ระบบ") : lineOn() ? T("mem.chip.signinLine", "เข้าสู่ระบบด้วย LINE") : T("mem.chip.signin", "เข้าสู่ระบบด้วย Google");
  }
  function ms() { return (st.cfg && st.cfg.membership) || {}; }

  /** fetch helper that keeps the error code ({ok, status, j}); bearer auth when signed in. Goes through LQApi.call
   *  (15 s timeout, credentials "omit", no-store, no-referrer); the plain fetch below is only for an older cached
   *  lensiq-api.js without call().
   * @param {string} path
   * @param {any} [o] */
  function call(path, o) {
    o = o || {};
    var a = API();
    if (!a || !a.enabled()) return Promise.resolve({ ok: false, status: 0, j: null });
    /** @type {Record<string, string>} */
    var h = Object.assign({}, o.headers || {});
    if (token() && o.auth !== false) h.Authorization = "Bearer " + token();
    if (typeof a.call === "function") return a.call(path, { method: o.method || "GET", headers: h, body: o.body, timeoutMs: o.timeoutMs || 15000 });
    if (o.body !== undefined) h["Content-Type"] = "application/json";
    return fetch(a.url(path), { method: o.method || "GET", headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .catch(function () { return { ok: false, status: 0, j: null }; });
  }

  function emit() {
    try { root.dispatchEvent(new CustomEvent("lq-member", { detail: { active: active(), signedIn: !!st.me } })); } catch (e) { /* old browser */ }
    rerender();
    renderChip();
  }

  function refresh() {
    if (!token()) { st.me = null; return Promise.resolve(null); }
    return call("/api/me").then(function (r) {
      if (r.ok && r.j) st.me = r.j;
      else if (r.status === 401) { st.me = null; saveSession(null); }
      return st.me;
    });
  }

  function init() {
    var a = API();
    if (!a || !a.enabled()) return;
    var done = function () {
      if (st.ready) return;
      st.ready = true;
      emit();
      try { root.dispatchEvent(new CustomEvent("lq-member-ready")); } catch (e) { /* ignore */ }
    };
    Promise.resolve(a.config()).then(function (/** @type {any} */ cfg) {
      if (cfg) { st.cfg = cfg; ss.set(CFG_KEY, { membership: cfg.membership || null, pricing_enabled: !!cfg.pricing_enabled, billing_enabled: !!cfg.billing_enabled, free_mode: cfg.free_mode }); }
      return lineReturn();
    }).then(function () {
      return possible() || token() ? refresh() : null;
    }).then(function () {
      if (st.me) claimPending();
      done();
      if (lineNote) { toast(lineNote.text); try { root.dispatchEvent(new CustomEvent("lq-line", { detail: lineNote })); } catch (e) { /* old browser */ } }
    }).catch(function () { done(); }); // a failed probe must not leave pages waiting for "lq-member-ready"
  }

  /* ---------------- styles (injected; style-src 'unsafe-inline' is allowed by the site CSP) ---------------- */
  var CSS = ".lq-gate{margin:1.2em 0 .4em;padding:1.1em 1.2em;border:1px solid rgba(103,79,242,.32);border-radius:16px;background:linear-gradient(180deg,rgba(103,79,242,.07),rgba(34,211,238,.05));color:inherit}" +
    ".lq-gate h3{margin:0 0 .35em;font-size:1.05rem}.lq-gate p{margin:.2em 0 .7em;line-height:1.6}.lq-gate ul{margin:.2em 0 .9em;padding-left:1.2em;line-height:1.6}" +
    ".lq-gate .lq-gate-n{font-size:.88em;opacity:.8}" +
    ".lq-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid #0e1430;background:#0e1430;color:#fff;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;max-width:100%}" +
    ".lq-btn:disabled{opacity:.45;cursor:not-allowed}.lq-btn.ghost{background:transparent;color:inherit;border-color:currentColor}.lq-btn:focus-visible{outline:3px solid #22d3ee;outline-offset:2px}" +
    ".lq-mem-actions{display:flex;flex-wrap:wrap;gap:8px;margin:.8em 0 .2em}" +
    ".nav-end{grid-area:lang;justify-self:end;display:flex;align-items:center;gap:10px;min-width:0}.nav-end .lang-switch{grid-area:auto}" +
    ".lq-acct{position:relative;flex:none}.lq-acct-btn{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 10px 0 4px;border:1px solid #e3e7f0;border-radius:999px;background:#fff;color:#0e1430;font:inherit;font-size:.8rem;cursor:pointer;max-width:220px}" +
    ".lq-acct-btn.signin{padding:0 12px}.lq-acct-btn .ic{display:none;width:22px;height:22px}.lq-av{flex:none;display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#5b47e0;color:#fff;font-weight:700;font-size:.8rem}" +
    ".lq-acct-btn span.lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".lq-acct-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:80;min-width:230px;margin:0;padding:6px;list-style:none;background:#fff;border:1px solid #e3e7f0;border-radius:12px;box-shadow:0 12px 32px rgba(14,20,48,.14)}" +
    ".lq-acct-menu a,.lq-acct-menu button{display:flex;width:100%;min-height:40px;align-items:center;padding:0 12px;border:0;border-radius:8px;background:none;color:#0e1430;font:inherit;font-size:.88rem;text-align:left;text-decoration:none;cursor:pointer}" +
    ".lq-acct-menu a:hover,.lq-acct-menu button:hover,.lq-acct-menu a:focus-visible,.lq-acct-menu button:focus-visible{background:#f2f0ff}.lq-acct-menu .who{padding:8px 12px 6px;font-size:.78rem;color:#4a5470;overflow-wrap:anywhere}" +
    ".lq-acct-menu .danger{color:#b42318}.lq-acct-item{display:none}" +
    // phones / the drawer layout: the chip becomes a 44 px avatar (or a sign-in icon) beside the menu button; the drawer
    // keeps its own "My account" / sign-in row as well
    "@media(max-width:1023.98px),(pointer:coarse) and (max-height:600px){.nav-end{gap:6px}.lq-acct{order:2}" +
    ".lq-acct-btn,.lq-acct-btn.signin{width:44px;height:44px;min-height:44px;min-width:44px;padding:0;justify-content:center;border-radius:50%;max-width:none}" +
    ".lq-acct-btn .lbl{display:none}.lq-acct-btn .ic{display:block}.lq-av{width:34px;height:34px;font-size:.9rem}" +
    ".lq-acct-menu{right:-50px;max-width:calc(100vw - 24px)}.lq-acct-item{display:block}.lq-acct-item>.nav-link{width:100%}}" +
    ".lq-dlg{margin:auto;width:min(520px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);padding:0;border:0;border-radius:18px;box-shadow:0 24px 64px rgba(14,20,48,.3);color:#0e1430;background:#fff;overflow:hidden}" +
    ".lq-dlg[open]{display:flex;flex-direction:column}" +
    ".lq-dlg::backdrop{background:rgba(14,20,48,.55)}.lq-dlg-in{padding:20px 20px 12px;overflow:auto;flex:1 1 auto;min-height:0;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}.lq-dlg h2{margin:0 0 .4em;font-size:1.2rem}" +
    ".lq-dlg-foot{flex:none;padding:12px 20px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #e3e7f0;background:#fff}.lq-dlg-foot .row{margin-top:0}" +
    ".lq-dlg p,.lq-dlg li{line-height:1.6;font-size:.92rem}.lq-dlg .lq-notice{margin:.6em 0;padding:.2em .9em;border-radius:12px;background:#f6f7fb;font-size:.85rem}.lq-dlg .lq-notice ul{margin:0 0 .6em;padding-left:1.1em}" +
    ".lq-dlg .lq-notice summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:600}" +
    ".lq-dlg label.ck{display:flex;gap:.6em;align-items:flex-start;margin:.55em 0;font-size:.9rem;line-height:1.5;cursor:pointer}.lq-dlg label.ck input{margin-top:.25em;width:18px;height:18px;flex:none}" +
    ".lq-dlg .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px}.lq-gsi{min-height:0}.lq-gsi:not(:empty){min-height:44px;margin-top:8px}.lq-dlg .st{min-height:1.4em;margin:.5em 0 0;font-size:.88rem;color:#4a5470}.lq-dlg .st.bad{color:#b42318}" +
    ".lq-dlg .row .lq-gsi:not(:empty){margin-top:0;min-height:44px}.lq-dlg .lq-keepnote{margin:.2em 0 .4em;font-size:.82rem;color:#4a5470}" +
    ".lq-up{margin:.9em 0 .4em;padding:.9em 1.1em;border:1px dashed rgba(103,79,242,.45);border-radius:14px;background:rgba(103,79,242,.04)}.lq-up h3{margin:0 0 .3em;font-size:1rem}.lq-up p{margin:.2em 0 .6em;line-height:1.6;font-size:.92rem}" +
    ".lq-gate .lq-gate-alt{margin:.7em 0 0;font-size:.88rem}.lq-gate .lq-gate-alt a,.lq-up a.lnk{color:#4b36c9;font-weight:600}" +
    ".lq-toast{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;padding:10px 16px;border-radius:999px;background:#0e1430;color:#fff;font-size:.9rem;max-width:calc(100vw - 32px - env(safe-area-inset-left) - env(safe-area-inset-right));pointer-events:none;box-shadow:0 8px 24px rgba(14,20,48,.25);text-align:center}" +
    "@media print{.lq-up,.lq-gate .lq-gate-alt,.lq-toast{display:none}}" +
    ".lq-acct-btn{position:relative}.lq-dot{position:absolute;top:2px;right:2px;width:10px;height:10px;border-radius:50%;background:#d39400;border:2px solid #fff}.lq-acct-menu a.lq-renew{color:#7a4d00;font-weight:600}" +
    ".lq-btn.lq-line{background:#06C755;border-color:#06C755;color:#fff}" +
    "@media (prefers-color-scheme:dark){.lq-gate{border-color:rgba(169,155,255,.4)}}";
  function ensureStyle() {
    if (doc.getElementById("lq-member-style") || !doc.head) return;
    var s = doc.createElement("style"); s.id = "lq-member-style"; s.textContent = CSS; doc.head.appendChild(s);
  }
  /** @param {string} tag @param {Record<string, any>|null} [attrs] @param {...any} _kids */
  function el(tag, attrs, ..._kids) {
    var e = doc.createElement(tag), a = attrs || {};
    for (var k in a) {
      if (k === "text") e.textContent = a[k];
      else if (k === "class") e.className = a[k];
      else if (a[k] !== false && a[k] != null) e.setAttribute(k, a[k] === true ? "" : String(a[k]));
    }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c != null) e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c); }
    return e;
  }

  /* ---------------- reading gate (FortuneAI.registerHooks; legacy wrapper only for an old fortune-ai.js) ---------------- */
  var PAGE_DOMAIN = { faceread: "face", palm: "palm", horoscope: "horoscope", tarot: "tarot", fengshui: "fengshui", numbers: "numbers", iching: "iching", zodiac: "zodiac", astro: "astro", dream: "dream", bazi: "bazi", taksa: "taksa", lek7: "lek7", lifegraph: "lifegraph" };
  var page = (location.pathname.split("/").pop() || "").replace(/\.html$/, "");
  var domain = PAGE_DOMAIN[page] || null;
  /** @type {{c: any, r: any, o: any}[]} */
  var shown = [];
  var counted = typeof WeakMap !== "undefined" ? new WeakMap() : null; // result -> {over} (guest count happens once per reading)
  var logged = typeof WeakSet !== "undefined" ? new WeakSet() : null;  // result -> ledger row sent (members)
  var origRender = /** @type {any} */ (null);

  /** What a given result looks like for the current visitor. */
  function gateResult(res) {
    if (!active() || st.me || !res || !Array.isArray(res.sections)) return res;
    var info = counted && counted.get(res);
    if (!info) {
      var c = countGuest(ls.get(COUNT_KEY), today(), ms().guest_daily_readings == null ? 3 : ms().guest_daily_readings);
      ls.set(COUNT_KEY, c.store);
      info = { over: c.over, n: c.n };
      if (counted) counted.set(res, info);
    }
    return lightResult(res, { sections: ms().guest_light_sections, over: info.over, cautionTitle: T("mem.gate.cautions", "จุดที่ควรใส่ใจ") });
  }

  function gateCard(light) {
    var over = light && light.over;
    var lim = ms().guest_daily_readings == null ? 3 : ms().guest_daily_readings;
    var box = el("section", { class: "lq-gate", "data-lq-gate": "", "aria-labelledby": "lqGateH" },
      el("h3", { id: "lqGateH", text: over ? T("mem.gate.overTitle", "วันนี้อ่านคำทำนายแบบย่อครบแล้ว") : T("mem.gate.title", "อ่านคำทำนายฉบับเต็มฟรี") }),
      el("p", { text: over ? T("mem.gate.over", "อุปกรณ์นี้อ่านคำทำนายแบบย่อครบ {n} ครั้งของวันนี้แล้ว เข้าสู่ระบบฟรีด้วย Google เพื่ออ่านต่อได้ทันที", { n: lim })
        : T("mem.gate.lead", "คุณกำลังอ่านฉบับย่อ เข้าสู่ระบบฟรีด้วย Google เพื่ออ่านต่อ") }),
      el("ul", null,
        el("li", { text: T("mem.gate.b1", "คำทำนายฉบับเต็มทุกหัวข้อ") }),
        el("li", { text: T("mem.gate.b2", "แผนปรับ 3 ข้อที่ทำได้จริง") }),
        el("li", { text: T("mem.gate.b3", "บันทึกประวัติการดูดวงและพิมพ์ / บันทึกเป็น PDF") })));
    if (light && light.hiddenSections && !over) box.appendChild(el("p", { class: "lq-gate-n", text: T("mem.gate.hidden", "ยังมีอีก {n} หัวข้อในฉบับเต็ม", { n: light.hiddenSections }) }));
    var b = el("button", { type: "button", class: "lq-btn", "data-lq-signin": "", text: googleOn() ? T("mem.signin.free", "เข้าสู่ระบบฟรีด้วย Google") : T("mem.signin.freeLine",
        "เข้าสู่ระบบฟรีด้วย LINE") });
    b.addEventListener("click", function () { openSignIn(); });
    box.appendChild(b);
    // a one-time full report as the paid alternative — only while the owner has the pricing page on
    if (pricingOn()) box.appendChild(el("p", { class: "lq-gate-alt", "data-lq-upsell": "report" }, T("mem.up.reportLead", "อยากได้รายงานฉบับยาวหลายศาสตร์?") + " ",
      el("a", { href: "report.html", text: T("mem.up.reportCta", "ดูรายงานดวงแบบซื้อครั้งเดียว") })));
    return box;
  }
  function pricingOn() { return !!(st.cfg && st.cfg.pricing_enabled); }

  /** Card after a reading composed on the device because the writing assistant's quota is used up today. */
  function quotaCard() {
    var on = pricingOn();
    var box = el("section", { class: "lq-up", "data-lq-upsell": "quota", "aria-labelledby": "lqUpH" },
      el("h3", { id: "lqUpH", text: T("mem.up.quotaTitle", "วันนี้ใช้ผู้ช่วยเขียนครบโควตาแล้ว") }),
      el("p", { text: on ? T("mem.up.quotaLead", "คำทำนายนี้เรียบเรียงในเครื่องแทน (ความหมายจากตำราเดียวกัน) โควตาจะกลับมาพรุ่งนี้ หรือดูแพ็กเกจพลัสและรายงานฉบับยาวได้")
        : T("mem.up.quotaSoon", "คำทำนายนี้เรียบเรียงในเครื่องแทน (ความหมายจากตำราเดียวกัน) โควตาจะกลับมาพรุ่งนี้ แพ็กเกจเพิ่มเติมยังไม่เปิดขาย") }));
    var row = el("div", { class: "lq-mem-actions" });
    row.appendChild(el("a", { class: "lq-btn ghost", href: "pricing.html", text: on ? T("mem.up.plans", "ดูแพ็กเกจและรายงาน") : T("mem.up.whatsFree", "ดูสิ่งที่ใช้ได้ฟรีและที่กำลังจะมา") }));
    if (on) row.appendChild(el("a", { class: "lq-btn ghost", href: "report.html", text: T("mem.up.redeem", "รายงานของฉัน") }));
    box.appendChild(row);
    return box;
  }

  function memberActions(res) {
    var row = el("div", { class: "lq-mem-actions", "data-lq-member-actions": "" });
    if (domain) {
      var sv = el("button", { type: "button", class: "lq-btn ghost", text: T("mem.save", "บันทึกไว้ในประวัติของฉัน") });
      sv.addEventListener("click", function () {
        sv.disabled = true;
        call("/api/me/saved", { method: "POST", body: { domain: domain, title: String(doc.title || "").slice(0, 120), data: res } }).then(function (r) {
          sv.textContent = r.ok ? T("mem.saved", "บันทึกแล้ว") : r.j && r.j.code === "saved_full" ? T("mem.saveFull", "ประวัติเต็มแล้ว ลบรายการเก่าที่หน้าบัญชีของฉัน") : T("mem.saveFail", "บันทึกไม่สำเร็จ");
          if (!r.ok) sv.disabled = false;
        });
      });
      row.appendChild(sv);
    }
    var pr = el("button", { type: "button", class: "lq-btn ghost", text: T("mem.print", "พิมพ์ / บันทึกเป็น PDF") });
    pr.addEventListener("click", function () { root.print(); });
    row.appendChild(pr);
    return row;
  }

  function decorate(container, res, gated) {
    if (!container || !container.appendChild) return;
    var up = upsell(res, gated, st.aiQuotaDay || null, today());
    if (gated && gated.light) { container.appendChild(gateCard(gated.light)); return; }
    if (up === "quota") { ensureStyle(); container.appendChild(quotaCard()); }
    if (st.me && active()) {
      container.appendChild(memberActions(res));
      if (domain && logged && !logged.has(res)) { logged.add(res); call("/api/me/usage", { method: "POST", body: { kind: "reading", domain: domain } }); }
    }
  }

  function remember(c, r, o) {
    shown = shown.filter(function (x) { return x.c !== c && x.c.isConnected !== false; });
    shown.push({ c: c, r: r, o: o });
    if (shown.length > 12) shown.shift();
  }
  var rerendering = false;
  function rerender() {
    if (!origRender) return;
    rerendering = true;
    try { shown.forEach(function (x) { if (x.c && x.c.isConnected) origRender.call(W.FortuneAI, x.c, x.r, x.o); }); } finally { rerendering = false; }
  }
  /* Explicit hooks (FortuneAI.registerHooks, fortune-ai.js): gate -> render -> decorate, and an observer of the
   * POST /api/fortune responses. Same behaviour in either script load order: when FortuneAI is not defined yet the hooks
   * object is queued on window.LQFortuneHooks and fortune-ai.js registers it when it loads. */
  var HOOKS = {
    gate: function (/** @type {any} */ result, /** @type {any} */ opts, /** @type {any} */ container) {
      if (!rerendering) remember(container, result, opts);
      var g = gateResult(result);
      if (g !== result || active()) ensureStyle();
      return g;
    },
    decorate: function (/** @type {any} */ container, /** @type {any} */ result, /** @type {any} */ g) { decorate(container, result, g); },
    onAIResponse: function (/** @type {Response} */ r) { quotaFrom(r); }
  };
  /** Notices a writing-assistant refusal for quota (POST /api/fortune -> 429 {code:"quota"}): the next reading composed
   *  on the device gets the upgrade card. Read-only: it reads a clone, the page's own response is untouched. */
  function quotaFrom(/** @type {Response} */ r) {
    if (!r || r.status !== 429) return;
    r.clone().json().then(function (/** @type {any} */ j) {
      if (!j || j.code !== "quota") return;
      var first = st.aiQuotaDay !== today();
      st.aiQuotaDay = today();
      if (first) setTimeout(rerender, 0);
    }).catch(function () { /* not JSON */ });
  }
  var hookMode = "";
  function hookFA() {
    var FA = W.FortuneAI;
    if (FA && typeof FA.registerHooks === "function") {
      FA.registerHooks(HOOKS); hookMode = "hooks";
      origRender = function (/** @type {any} */ c, /** @type {any} */ r, /** @type {any} */ o) { return W.FortuneAI.renderSections(c, r, o); };
      return true;
    }
    return false;
  }
  function attach() {
    if (hookFA()) return;
    if (!W.FortuneAI) {
      // not loaded yet: queue the hooks (drained by fortune-ai.js) and finish wiring once the page has loaded
      var q = W.LQFortuneHooks = Array.isArray(W.LQFortuneHooks) ? W.LQFortuneHooks : [];
      if (q.indexOf(HOOKS) < 0) q.push(HOOKS);
      var later = function () { if (!hookMode && !hookFA() && W.FortuneAI) legacy(); };
      if (doc.readyState === "complete") setTimeout(later, 0); else root.addEventListener("load", later);
      return;
    }
    legacy();
  }
  /** Fallback for an older cached fortune-ai.js without registerHooks: wrap renderSections and window.fetch. */
  function legacy() {
    if (hookMode) return;
    hookMode = "legacy";
    wrapFA();
    watchQuota();
  }
  function render(container, result, opts, again) {
    if (!again) remember(container, result, opts);
    var g = gateResult(result);
    if (g !== result || active()) ensureStyle();
    var out = legacyRender.call(W.FortuneAI, container, g, opts);
    decorate(container, result, g);
    return out;
  }
  var legacyRender = /** @type {any} */ (null);
  var tries = 0;
  function wrapFA() {
    var FA = W.FortuneAI;
    if (!FA || typeof FA.renderSections !== "function") { if (tries++ < 40) setTimeout(wrapFA, 250); return; }
    if (FA.renderSections.__lqMember) return;
    legacyRender = FA.renderSections;
    var wrapped = function (/** @type {any} */ c, /** @type {any} */ r, /** @type {any} */ o) { return render(c, r, o, rerendering); };
    wrapped.__lqMember = true;
    FA.renderSections = wrapped;
    origRender = wrapped;
  }
  function watchQuota() {
    if (typeof W.fetch !== "function" || W.fetch.__lqQuota) return;
    var orig = W.fetch;
    var wrapped = function (/** @type {any} */ input, /** @type {any} */ init) {
      var p = orig.apply(W, arguments);
      try {
        var u = typeof input === "string" ? input : input && input.url;
        var m = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
        var a = API();
        if (m === "POST" && a && a.enabled() && u === a.url("/api/fortune")) p.then(quotaFrom, function () { /* network: the page falls back on its own */ });
      } catch (e) { /* never break a request */ }
      return p;
    };
    wrapped.__lqQuota = true;
    wrapped.__lqTurnstile = orig.__lqTurnstile; // keep the fortune hook's idempotency flag visible
    W.fetch = wrapped;
  }

  /** For pages without FortuneAI.renderSections (fortune-kit.js plain fallback): the gated result + card. */
  function gate(res) { return gateResult(res); }

  /* ---------------- LINE Login (stream G): redirect round trip, no LINE script on our pages ---------------- */
  var LINE_KEY = "lq-line-flow";
  /** @type {any} */
  var lineNote = null;
  var LINE_ERR = {
    line_state: ["mem.line.state", "การเข้าสู่ระบบด้วย LINE หมดเวลาหรือไม่ได้เริ่มจากแท็บนี้ กรุณาลองใหม่"],
    line_already_linked: ["mem.line.taken", "บัญชี LINE นี้เชื่อมกับบัญชี LENSIQ อื่นอยู่แล้ว เราไม่รวมสองบัญชีเข้าด้วยกัน"],
    reauth_wrong_account: ["mem.line.wrong", "กรุณาใช้บัญชี LINE เดียวกับที่เชื่อมไว้"],
    reauth_stale: ["mem.line.stale", "การยืนยันต้องทำใหม่ล่าสุด กรุณาลองอีกครั้ง"],
    line_not_configured: ["mem.err.unavailable", "ระบบสมาชิกยังไม่พร้อมใช้งาน"],
    consent_required: ["mem.err.consent", "กรุณายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว"],
    account_disabled: ["mem.err.disabled", "บัญชีนี้ถูกระงับ กรุณาติดต่อฝ่ายสนับสนุน"]
  };
  var lineErrText = function (/** @type {any} */ r) { var e = LINE_ERR[r && r.j && r.j.code] || ["mem.line.fail", "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่"]; return T(e[0], e[1]); };
  /** Starts a LINE round trip: signin (Turnstile), link or reauth (member token). Keeps the browser binding in this tab's
   *  sessionStorage and leaves for LINE's consent page. Resolves the start response when it could not leave.
   *  @param {"signin"|"link"|"reauth"} mode @param {{accept?: boolean, marketing?: boolean, remember?: boolean}} [o] */
  function startLine(mode, o) {
    o = o || {};
    var a = API();
    var tk = mode === "signin" && a && a.turnstile ? a.turnstile("signin") : "";
    return Promise.resolve(tk).then(function (t) {
      return call("/api/auth/line/start", { method: "POST", auth: mode !== "signin", headers: t ? { "X-Turnstile-Token": t } : {},
        body: { mode: mode, accept_terms: !!o.accept, consent_version: CONSENT_VERSION, marketing_opt_in: !!o.marketing } });
    }).then(function (r) {
      var u = r && r.ok && r.j ? String(r.j.authorize_url || "") : "";
      // only LINE's own consent page (or this site) — never an address of another site
      if (!u || !(/^https:\/\/access\.line\.me\//.test(u) || u.indexOf(root.location.origin + "/") === 0)) return Object.assign({ left: false }, r);
      ss.set(LINE_KEY, { binding: String(r.j.binding), mode: mode, remember: !!o.remember, at: Date.now() });
      root.location.assign(u);
      return Object.assign({ left: true }, r);
    });
  }
  /** Back from LINE (?code&state, or ?error when the person cancelled): finish once, then clean the address bar. */
  function lineReturn() {
    var flow = ss.get(LINE_KEY), q;
    try { q = new URLSearchParams(root.location.search); } catch (e) { return null; }
    var code = q.get("code"), state = q.get("state"), err = q.get("error");
    if (!flow || (!code && !err)) return null;
    ss.set(LINE_KEY, null);
    try { root.history.replaceState(null, "", root.location.pathname + root.location.hash); } catch (e) { /* old browser */ }
    if (err || !code || !state || Date.now() - Number(flow.at || 0) > 600000) {
      lineNote = { mode: flow.mode, ok: false, text: err ? T("mem.line.cancel", "ยกเลิกการเข้าสู่ระบบด้วย LINE แล้ว") : T("mem.line.state",
          "การเข้าสู่ระบบด้วย LINE หมดเวลาหรือไม่ได้เริ่มจากแท็บนี้ กรุณาลองใหม่") };
      return null;
    }
    return call("/api/auth/line/finish", { method: "POST", auth: flow.mode !== "signin", body: { code: code, state: state, binding: flow.binding } }).then(function (r) {
      if (flow.mode === "signin" && r.ok && r.j && r.j.token) {
        saveSession({ t: r.j.token, exp: r.j.expires_at }, !!flow.remember);
        lineNote = { mode: "signin", ok: true, text: T("mem.welcome", "เข้าสู่ระบบแล้ว ยินดีต้อนรับ") };
      } else if (flow.mode === "link" && r.ok) lineNote = { mode: "link", ok: true, text: T("mem.line.linked", "เชื่อมบัญชี LINE แล้ว") };
      else if (flow.mode === "reauth" && r.ok) lineNote = { mode: "reauth", ok: true, text: T("mem.line.reauthOk", "ยืนยันตัวตนแล้ว ทำรายการต่อได้ภายใน 5 นาที") };
      else lineNote = { mode: flow.mode, ok: false, code: r.j && r.j.code, text: lineErrText(r) };
    });
  }
  /** Fresh confirmation with LINE (accounts without Google): a small dialog, then the round trip (the page leaves; the
   *  5-minute window is open when it comes back). Resolves false when cancelled. */
  function confirmWithLine() {
    ensureStyle();
    return new Promise(function (resolve) {
      var go = el("button", { type: "button", class: "lq-btn", "data-lq-line-reauth": "", text: T("mem.line.reauthGo", "ยืนยันด้วย LINE") });
      var cancel = el("button", { type: "button", class: "lq-btn ghost", text: T("mem.dlg.cancel", "ยกเลิก") });
      var stEl = el("p", { class: "st", role: "status", "aria-live": "polite" });
      var box = el("dialog", { class: "lq-dlg", "aria-labelledby": "lqReLH" },
        el("div", { class: "lq-dlg-in" },
          el("h2", { id: "lqReLH", text: T("mem.re.title", "ยืนยันตัวตนอีกครั้ง") }),
          el("p", { text: T("mem.line.reauthLead", "เพื่อความปลอดภัย การดาวน์โหลด ลบข้อมูล หรือเปลี่ยนสิทธิ์ ต้องยืนยันด้วยบัญชี LINE เดิมอีกครั้ง หลังยืนยันแล้วกดทำรายการอีกครั้งภายใน 5 นาที") })),
        el("div", { class: "lq-dlg-foot" }, el("div", { class: "row" }, go, cancel), stEl));
      doc.body.appendChild(box);
      var done = false;
      var finish = function (/** @type {boolean} */ ok) { if (done) return; done = true; try { box.close(); } catch (e) { /* old browser */ } box.remove(); resolve(ok); };
      cancel.addEventListener("click", function () { finish(false); });
      box.addEventListener("cancel", function () { finish(false); });
      go.addEventListener("click", function () {
        go.disabled = true;
        startLine("reauth").then(function (r) { if (!r.left) { go.disabled = false; stEl.textContent = lineErrText(r); stEl.classList.add("bad"); } });
      });
      try { if (typeof box.showModal === "function") box.showModal(); else box.setAttribute("open", ""); } catch (e) { box.setAttribute("open", ""); }
    });
  }

  /* ---------------- Google Identity Services: loaded on click only ---------------- */
  /** @type {Promise<any>|null} */
  var gsiP = null;
  function loadGsi() {
    if (W.google && W.google.accounts && W.google.accounts.id) return Promise.resolve(W.google.accounts.id);
    if (gsiP) return gsiP;
    gsiP = new Promise(function (resolve) {
      var s = doc.createElement("script");
      s.src = GSI_SRC; s.async = true;
      s.onload = function () { resolve(W.google && W.google.accounts ? W.google.accounts.id : null); };
      s.onerror = function () { gsiP = null; resolve(null); };
      doc.head.appendChild(s);
    });
    return gsiP;
  }

  var ERR = {
    nonce: ["mem.err.nonce", "การเข้าสู่ระบบหมดเวลา กรุณาลองใหม่"],
    consent_required: ["mem.err.consent", "กรุณายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว"],
    account_disabled: ["mem.err.disabled", "บัญชีนี้ถูกระงับ กรุณาติดต่อฝ่ายสนับสนุน"],
    email_unverified: ["mem.err.email", "บัญชี Google นี้ยังไม่ได้ยืนยันอีเมล"],
    turnstile_failed: ["mem.err.bot", "ยืนยันว่าไม่ใช่บอทไม่สำเร็จ กรุณาลองใหม่"],
    turnstile_not_configured: ["mem.err.unavailable", "ระบบสมาชิกยังไม่พร้อมใช้งาน"],
    google_not_configured: ["mem.err.unavailable", "ระบบสมาชิกยังไม่พร้อมใช้งาน"]
  };
  /** @type {any} */
  var dlg = null;
  function openSignIn() {
    if (!possible()) return Promise.resolve(false);
    ensureStyle();
    if (dlg && dlg.isConnected) { showDlg(); return Promise.resolve(true); }
    var q = ms();
    var terms = el("input", { type: "checkbox", name: "terms", required: true, autofocus: true, "data-lq-terms": "" });
    var mkt = el("input", { type: "checkbox", name: "marketing" });
    var keep = el("input", { type: "checkbox", name: "remember" });
    var go = el("button", { type: "button", class: "lq-btn", disabled: true, "data-lq-continue": "", hidden: !googleOn(), text: T("mem.dlg.continue", "ดำเนินการต่อด้วย Google") });
    // stream G: LINE Login next to Google (scope openid profile: LINE account id + display name; no e-mail, no picture)
    var lineBtn = lineOn() ? el("button", { type: "button", class: "lq-btn lq-line", disabled: true, "data-lq-line": "", text: T("mem.dlg.line", "ดำเนินการต่อด้วย LINE") }) : null;
    var cancel = el("button", { type: "button", class: "lq-btn ghost", text: T("mem.dlg.cancel", "ยกเลิก") });
    var slot = el("div", { class: "lq-gsi", "data-lq-gsi": "", hidden: true });
    var stEl = el("p", { class: "st", role: "status", "aria-live": "polite" });
    var link = function (/** @type {string} */ href, /** @type {string} */ k, /** @type {string} */ th) { return el("a", { href: href, target: "_blank", rel: "noopener", text: T(k, th) }); };
    // "what we keep" is a <details>: open on larger screens, one tap away on phones so the actions stay in view
    var roomy = !!(root.matchMedia && root.matchMedia("(min-width: 700px) and (min-height: 700px)").matches);
    dlg = el("dialog", { class: "lq-dlg", "aria-labelledby": "lqDlgH", "data-lq-shared": "" },
      el("div", { class: "lq-dlg-in" },
        el("h2", { id: "lqDlgH", text: googleOn() && lineOn() ? T("mem.dlg.titleAny", "เข้าสู่ระบบด้วย Google หรือ LINE") : lineOn() ? T("mem.dlg.titleLine", "เข้าสู่ระบบด้วย LINE")
            : T("mem.dlg.title", "เข้าสู่ระบบด้วย Google") }),
        el("p", { text: T("mem.dlg.lead", "สมัครสมาชิกฟรี: อ่านคำทำนายฉบับเต็ม แผนปรับ 3 ข้อ ผู้ช่วยเขียน AI วันละ {n} ครั้ง และเก็บประวัติของคุณไว้ในบัญชี", { n: q.member_ai_daily == null ? 3 : q.member_ai_daily }) }),
        el("details", { class: "lq-notice", open: roomy, "data-lq-keep": "" },
          el("summary", { text: T("mem.dlg.privacy", "ข้อมูลที่เราเก็บและเหตุผล") }),
          el("ul", null,
            googleOn() ? el("li", { text: T("mem.dlg.p1", "อีเมลที่ Google ยืนยันแล้ว รหัสบัญชี Google และชื่อเล่น (ถ้ามี) — ไม่เก็บรูปโปรไฟล์ ไม่เก็บรูปถ่ายหรือข้อมูลใบหน้า") }) : null,
            lineOn() ? el("li", { text: T("mem.dlg.pLine", "LINE: รหัสบัญชี LINE และชื่อที่แสดง — ไม่ขออีเมล ไม่เก็บรูปโปรไฟล์ ไม่เก็บโทเค็นของ LINE") }) : null,
            el("li", { text: T("mem.dlg.p2", "ใช้เพื่อให้บริการบัญชีสมาชิก นับโควตาการใช้งาน และเก็บประวัติการใช้งาน/การชำระเงิน (ฐานสัญญา ม.24(3) พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล)") }),
            el("li", { text: T("mem.dlg.p3", "ไม่เก็บเนื้อหาคำทำนาย เว้นแต่คุณกดบันทึกเอง · ไม่ใช้อีเมลส่งข่าวสารการตลาด เว้นแต่คุณเลือกรับด้านล่าง") }),
            el("li", { text: T("mem.dlg.p4", "จัดเก็บบน Cloudflare (อาจอยู่นอกประเทศไทย) · ดาวน์โหลดหรือลบข้อมูลและบัญชีได้ทุกเมื่อที่หน้า บัญชีของฉัน") }))),
        el("label", { class: "ck" }, terms, el("span", null, T("mem.dlg.accept", "ฉันยอมรับ") + " ", link("terms.html", "mem.dlg.terms", "ข้อกำหนดการใช้บริการ"), " " + T("mem.dlg.and", "และ") + " ", link("privacy.html", "mem.dlg.policy", "นโยบายความเป็นส่วนตัว"))),
        el("label", { class: "ck" }, mkt, el("span", { text: T("mem.dlg.marketing", "รับข่าวสารและข้อเสนอจาก LENSIQ ทางอีเมล (ไม่บังคับ ยกเลิกได้ทุกเมื่อ)") })),
        el("label", { class: "ck" }, keep, el("span", { text: T("mem.dlg.remember", "จดจำการเข้าสู่ระบบบนอุปกรณ์นี้ (ไม่ติ๊ก = ออกจากระบบเมื่อปิดแท็บ · อย่าติ๊กบนเครื่องสาธารณะ)") }))),
      // sticky action footer: Continue / the Google button + Cancel are always visible, even on a 360×640 phone
      // the Google button is drawn in the same row, in place of Continue, as soon as consent is ticked
      el("div", { class: "lq-dlg-foot", "data-lq-dlg-foot": "" },
        el("div", { class: "row" }, go, slot, cancel),
        stEl));
    // stream G: the LINE button sits in the same sticky row, before Cancel
    if (lineBtn) cancel.parentNode.insertBefore(lineBtn, cancel);
    doc.body.appendChild(dlg);
    terms.addEventListener("change", function () {
      if (lineBtn) lineBtn.disabled = !terms.checked;
      if (!googleOn()) { say(""); return; }
      go.disabled = !terms.checked;
      if (!terms.checked) { slot.hidden = true; if (go.hidden) { go.hidden = false; go.disabled = true; } say(""); return; }
      if (prepared) { slot.hidden = false; go.hidden = true; say(T("mem.dlg.choose", "เลือกบัญชี Google ของคุณ")); return; }
      prepare();
    });
    cancel.addEventListener("click", function () { closeDlg(); });
    /** @param {string} t @param {boolean} [bad] */
    var say = function (t, bad) { stEl.textContent = t; stEl.classList.toggle("bad", !!bad); };
    var nonce = "", prepared = false, preparing = false;
    go.addEventListener("click", function () { if (terms.checked) prepare(); });
    if (lineBtn) lineBtn.addEventListener("click", function () {
      if (!terms.checked) return;
      lineBtn.disabled = true;
      say(T("mem.line.going", "กำลังไปที่หน้า LINE…"));
      startLine("signin", { accept: true, marketing: !!mkt.checked, remember: !!keep.checked }).then(function (r) {
        if (!r.left) { lineBtn.disabled = !terms.checked; say(lineErrText(r), true); }
      });
    });
    function prepare() {
      if (!terms.checked || preparing) return;
      preparing = true;
      go.disabled = true;
      say(T("mem.dlg.loading", "กำลังเปิดหน้าต่าง Google…"));
      Promise.all([loadGsi(), call("/api/auth/nonce", { method: "POST", body: {}, auth: false })]).then(function (x) {
        var gid = x[0], n = x[1];
        preparing = false;
        if (!gid || !n.ok || !n.j || !n.j.nonce) { go.disabled = !terms.checked; go.hidden = false; say(T("mem.err.load", "เปิดหน้าต่างเข้าสู่ระบบของ Google ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่"), true); return; }
        if (!terms.checked) { go.disabled = true; return; } // consent was unticked while loading
        nonce = n.j.nonce;
        gid.initialize({ client_id: clientId(), nonce: nonce, callback: onCredential, auto_select: false, cancel_on_tap_outside: true, context: "signin", ux_mode: "popup", itp_support: true, use_fedcm_for_prompt: true });
        slot.textContent = "";
        var lang = W.LQI18N ? W.LQI18N.lang : "th";
        gid.renderButton(slot, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: lang === "zh" ? "zh_CN" : lang });
        slot.hidden = false;
        go.hidden = true;
        prepared = true;
        say(T("mem.dlg.choose", "เลือกบัญชี Google ของคุณ"));
      });
    }
    function onCredential(/** @type {any} */ resp) {
      say(T("mem.dlg.signing", "กำลังเข้าสู่ระบบ…"));
      var a = API();
      Promise.resolve(a && a.turnstile ? a.turnstile("signin") : "").then(function (tk) {
        return call("/api/auth/google", { method: "POST", auth: false, headers: tk ? { "X-Turnstile-Token": tk } : {},
          body: { credential: resp && resp.credential, nonce: nonce, accept_terms: !!terms.checked, consent_version: CONSENT_VERSION, marketing_opt_in: !!mkt.checked } });
      }).then(function (r) {
        if (!r.ok || !r.j || !r.j.token) {
          var e = ERR[r.j && r.j.code] || ["mem.err.generic", "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"];
          say(T(e[0], e[1]), true); go.hidden = false; go.disabled = !terms.checked; slot.textContent = ""; slot.hidden = true; prepared = false;
          return;
        }
        saveSession({ t: r.j.token, exp: r.j.expires_at }, !!keep.checked);
        return refresh().then(function () { closeDlg(); emit(); toast(T("mem.welcome", "เข้าสู่ระบบแล้ว ยินดีต้อนรับ")); claimPending(); });
      });
    }
    showDlg();
    return Promise.resolve(true);
  }
  function showDlg() {
    try { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); } catch (e) { dlg.setAttribute("open", ""); }
    // first focus on the consent checkbox (not the "what we keep" summary): it is the one required step
    var ck = dlg.querySelector("[data-lq-terms]");
    if (ck) try { ck.focus({ preventScroll: false }); } catch (e) { /* old browser */ }
  }
  function closeDlg() { if (!dlg) return; try { dlg.close(); } catch (e) { dlg.removeAttribute("open"); } dlg.remove(); dlg = null; }

  /** Short status toast pinned to the bottom safe area (never over the notch / home indicator); one at a time, no
   *  pointer events so it never blocks a tap on the content under it. */
  function toast(msg) {
    ensureStyle();
    var old = doc.querySelectorAll(".lq-toast");
    for (var i = 0; i < old.length; i++) old[i].remove();
    var t = el("div", { class: "lq-toast", role: "status", text: msg });
    doc.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  function signOut() {
    var p = token() ? call("/api/auth/logout", { method: "POST", body: {} }) : Promise.resolve(null);
    return p.then(function () { saveSession(null); st.me = null; emit(); return true; });
  }

  /* ---------------- guest purchases -> account (POST /v1/billing/claim) ---------------- */
  function pendingClaims() { var l = ls.get(PENDING_KEY); return Array.isArray(l) ? l : []; }
  function addPendingClaim(/** @type {any} */ c) { ls.set(PENDING_KEY, addClaim(pendingClaims(), c)); }
  /** Links one guest purchase to the signed-in account. Resolves {ok, status, j, outcome}. */
  function claim(/** @type {any} */ c) {
    if (!token()) return Promise.resolve({ ok: false, status: 401, j: null, outcome: "keep" });
    return call("/v1/billing/claim", { method: "POST", body: { customer_id: c.customer_id, order_token: c.order_token } }).then(function (r) {
      var out = claimOutcome(r, c.at ? Math.floor(Date.now() / 1000) - c.at : null);
      if (out !== "keep") ls.set(PENDING_KEY, pendingClaims().filter(function (x) { return x.customer_id !== c.customer_id; }));
      return Object.assign({ outcome: out }, r);
    });
  }
  var claiming = false;
  /** After sign-in: links every stored guest purchase; a toast when something was linked. */
  function claimPending() {
    var list = pendingClaims();
    if (!list.length || !token() || claiming) return Promise.resolve(0);
    claiming = true;
    var n = 0;
    return list.reduce(function (p, c) { return p.then(function () { return claim(c).then(function (r) { if (r.outcome === "done") n++; }); }); }, Promise.resolve())
      .then(function () {
        claiming = false;
        if (n) { toast(T("mem.claim.done", "ผูกการซื้อก่อนหน้า {n} รายการกับบัญชีของคุณแล้ว", { n: n })); return refresh().then(function () { emit(); return n; }); }
        return n;
      }, function () { claiming = false; return n; });
  }

  /* ---------------- header account chip (nav.js calls mountNav) ---------------- */
  /** @type {any} */
  var navHeader = null;
  function mountNav(header) {
    if (header) navHeader = header;
    renderChip();
  }
  function initialOf(me) {
    var s = String((me && me.user && (me.user.display_name || me.user.email)) || "?").trim();
    return (Array.from(s)[0] || "?").toUpperCase();
  }
  function renderChip() {
    var h = navHeader || doc.getElementById("siteNav") || doc.querySelector("header.nav");
    if (!h || !h.querySelector) return;
    var old = h.querySelector(".lq-acct"), oldItem = h.querySelector(".lq-acct-item");
    if (old) old.remove();
    if (oldItem) oldItem.remove();
    var compact = function (/** @type {boolean} */ on) { h.classList.toggle("has-acct", on); if (typeof W.LQNavCompact === "function") W.LQNavCompact(); };
    if (!possible() && !st.me) { compact(false); return; }
    ensureStyle();
    var lang = h.querySelector(".lang-switch");
    var end = h.querySelector(".nav-end");
    if (!end && lang) { end = el("div", { class: "nav-end" }); lang.parentNode.insertBefore(end, lang); end.appendChild(lang); }
    var box = el("div", { class: "lq-acct" });
    var list = h.querySelector(".nav-list");
    if (!st.me) {
      // label text on desktop; a person icon (44 px) on phones — the aria-label keeps the name in both
      var b = el("button", { type: "button", class: "lq-acct-btn signin", "data-lq-signin": "", "aria-label": signInLabel() });
      b.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
      b.appendChild(el("span", { class: "lbl", text: signInLabel() }));
      b.addEventListener("click", function () { openSignIn(); });
      box.appendChild(b);
      if (list) {
        var li = el("li", { class: "nav-item lq-acct-item" }), lb = el("button", { type: "button", class: "nav-link", text: signInLabel() });
        lb.addEventListener("click", function () { openSignIn(); });
        li.appendChild(lb); list.insertBefore(li, list.firstChild);
      }
    } else {
      var name = st.me.user.display_name || st.me.user.email;
      var btn = el("button", { type: "button", class: "lq-acct-btn", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": T("mem.chip.menu", "บัญชีของฉัน") + ": " + name },
        el("span", { class: "lq-av", "aria-hidden": "true", text: initialOf(st.me) }), el("span", { class: "lbl", text: name }));
      var menu = el("ul", { class: "lq-acct-menu", role: "menu", hidden: true },
        el("li", { class: "who", role: "presentation", text: st.me.user.email || st.me.user.display_name || "" }),
        el("li", { role: "presentation" }, el("a", { role: "menuitem", href: "account.html#history", text: T("mem.menu.history", "ประวัติการดูดวงของฉัน") })),
        el("li", { role: "presentation" }, el("a", { role: "menuitem", href: "account.html#plan", text: T("mem.menu.plan", "แพ็กเกจและโควตา") })),
        el("li", { role: "presentation" }, el("a", { role: "menuitem", href: "report.html", text: T("mem.menu.reports", "รายงานดวงของฉัน") })),
        pricingOn() ? el("li", { role: "presentation" }, el("a", { role: "menuitem", href: "pricing.html", text: T("mem.menu.pricing", "แพ็กเกจและราคา") })) : null,
        el("li", { role: "presentation" }, el("button", { type: "button", role: "menuitem", "data-lq-signout": "", text: T("mem.menu.signout", "ออกจากระบบ") })),
        el("li", { role: "presentation" }, el("a", { role: "menuitem", class: "danger", href: "account.html#delete", text: T("mem.menu.delete", "ลบบัญชี") })));
      var rn = renewalDue(planForRenewal(st.me));
      if (rn.due) {
        // no automatic renewal: the account menu carries the reminder (and a dot on the avatar) from 7 days before
        menu.insertBefore(el("li", { role: "presentation" }, el("a", { role: "menuitem", class: "lq-renew", href: "account.html#plan", "data-lq-renew": "", text: T("mem.menu.renew", "ต่ออายุแพ็กเกจ (เหลือ {n} วัน)", { n: rn.days }) })), menu.children[1] || null);
        btn.appendChild(el("span", { class: "lq-dot", "aria-hidden": "true" }));
        btn.setAttribute("aria-label", btn.getAttribute("aria-label") + " · " + T("mem.menu.renew", "ต่ออายุแพ็กเกจ (เหลือ {n} วัน)", { n: rn.days }));
      }
      var setOpen = function (/** @type {boolean} */ o) { menu.hidden = !o; btn.setAttribute("aria-expanded", o ? "true" : "false"); if (o) { var f = menu.querySelector("a,button"); if (f) f.focus(); } };
      btn.addEventListener("click", function () { setOpen(menu.hidden); });
      box.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { setOpen(false); btn.focus(); } });
      box.addEventListener("focusout", function (e) { if (!box.contains(/** @type {Node} */ (e.relatedTarget))) setOpen(false); });
      menu.querySelector("[data-lq-signout]").addEventListener("click", function () { signOut(); });
      box.appendChild(btn); box.appendChild(menu);
      if (list) {
        var li2 = el("li", { class: "nav-item lq-acct-item" }, el("a", { class: "nav-link", href: "account.html", text: T("mem.chip.menu", "บัญชีของฉัน") + " · " + name }));
        list.insertBefore(li2, list.firstChild);
      }
    }
    if (end) end.insertBefore(box, end.firstChild); else h.appendChild(box);
    compact(true);
  }

  /* ---------------- fresh Google confirmation before erasure / export (POST /api/auth/reauth) ---------------- */
  /** Opens a small dialog with the Google button; resolves true once the Worker accepted a fresh confirmation of the
   *  same account (opens its 5-minute window), false when cancelled or failed. */
  function confirmWithGoogle() {
    ensureStyle();
    return new Promise(function (resolve) {
      var slot = el("div", { class: "lq-gsi", "data-lq-gsi": "" });
      var stEl = el("p", { class: "st", role: "status", "aria-live": "polite", text: T("mem.dlg.loading", "กำลังเปิดหน้าต่าง Google…") });
      var cancel = el("button", { type: "button", class: "lq-btn ghost", text: T("mem.dlg.cancel", "ยกเลิก") });
      var box = el("dialog", { class: "lq-dlg", "aria-labelledby": "lqReH", "data-lq-reauth": "" },
        el("div", { class: "lq-dlg-in" },
          el("h2", { id: "lqReH", text: T("mem.re.title", "ยืนยันตัวตนอีกครั้ง") }),
          el("p", { text: T("mem.re.lead", "เพื่อความปลอดภัย การดาวน์โหลดหรือลบข้อมูลต้องยืนยันด้วยบัญชี Google เดิมอีกครั้ง") })),
        el("div", { class: "lq-dlg-foot" }, el("div", { class: "row" }, slot, cancel), stEl));
      doc.body.appendChild(box);
      var done = false;
      var finish = function (/** @type {boolean} */ ok) { if (done) return; done = true; try { box.close(); } catch (e) { /* old browser */ } box.remove(); resolve(ok); };
      var say = function (/** @type {string} */ t, /** @type {boolean} [bad] */ bad) { stEl.textContent = t; stEl.classList.toggle("bad", !!bad); };
      cancel.addEventListener("click", function () { finish(false); });
      box.addEventListener("cancel", function () { finish(false); });
      try { if (typeof box.showModal === "function") box.showModal(); else box.setAttribute("open", ""); } catch (e) { box.setAttribute("open", ""); }
      Promise.all([loadGsi(), call("/api/auth/nonce", { method: "POST", body: { purpose: "reauth" }, auth: false })]).then(function (x) {
        var gid = x[0], n = x[1];
        if (!gid || !n.ok || !n.j || !n.j.nonce) { say(T("mem.err.load", "เปิดหน้าต่างเข้าสู่ระบบของ Google ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่"), true); return; }
        var nonce = n.j.nonce;
        gid.initialize({ client_id: clientId(), nonce: nonce, auto_select: false, context: "use", ux_mode: "popup", itp_support: true,
          callback: function (/** @type {any} */ resp) {
            say(T("mem.re.checking", "กำลังยืนยัน…"), false);
            call("/api/auth/reauth", { method: "POST", body: { credential: resp && resp.credential, nonce: nonce } }).then(function (r) {
              if (r.ok) { finish(true); return; }
              var c = r.j && r.j.code;
              say(c === "reauth_wrong_account" ? T("mem.re.wrong", "กรุณาเลือกบัญชี Google เดียวกับที่ใช้สมัคร") : T("mem.re.fail", "ยืนยันไม่สำเร็จ กรุณาลองใหม่"), true);
            });
          } });
        var lang = W.LQI18N ? W.LQI18N.lang : "th";
        gid.renderButton(slot, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: lang === "zh" ? "zh_CN" : lang });
        say(T("mem.dlg.choose", "เลือกบัญชี Google ของคุณ"), false);
      });
    });
  }
  /** Runs fn(); when the Worker answers reauth_required, asks for a fresh Google confirmation once and retries. */
  function withFresh(/** @type {() => Promise<any>} */ fn) {
    return fn().then(function (r) {
      if (!r || r.ok || r.status !== 401 || !r.j || r.j.code !== "reauth_required") return r;
      // stream G: an account without Google confirms with LINE (round trip; the person repeats the action afterwards)
      var methods = (st.me && st.me.sign_in_methods) || ["google"];
      if (methods.indexOf("google") < 0 || !googleOn()) {
        return (methods.indexOf("line") >= 0 && lineOn() ? confirmWithLine() : Promise.resolve(false)).then(function () { return Object.assign({ cancelled: true }, r); });
      }
      return confirmWithGoogle().then(function (ok) { return ok ? fn() : Object.assign({ cancelled: true }, r); });
    });
  }
  /** Link Google to a signed-in account without one (POST /api/auth/link/google with a fresh ID token + nonce). */
  function linkGoogle() {
    ensureStyle();
    return new Promise(function (resolve) {
      var slot = el("div", { class: "lq-gsi", "data-lq-gsi": "" });
      var stEl = el("p", { class: "st", role: "status", "aria-live": "polite", text: T("mem.dlg.loading", "กำลังเปิดหน้าต่าง Google…") });
      var cancel = el("button", { type: "button", class: "lq-btn ghost", text: T("mem.dlg.cancel", "ยกเลิก") });
      var box = el("dialog", { class: "lq-dlg", "aria-labelledby": "lqLinkGH" },
        el("div", { class: "lq-dlg-in" }, el("h2", { id: "lqLinkGH", text: T("mem.link.gTitle", "เชื่อมบัญชี Google") }),
          el("p", { text: T("mem.link.gLead", "เลือกบัญชี Google ที่จะใช้เข้าบัญชีนี้ด้วย เราเก็บอีเมลที่ Google ยืนยันแล้วและรหัสบัญชี Google เท่านั้น") })),
        el("div", { class: "lq-dlg-foot" }, el("div", { class: "row" }, slot, cancel), stEl));
      doc.body.appendChild(box);
      var done = false;
      var finish = function (/** @type {any} */ r) { if (done) return; done = true; try { box.close(); } catch (e) { /* old browser */ } box.remove(); resolve(r); };
      cancel.addEventListener("click", function () { finish({ ok: false, cancelled: true }); });
      box.addEventListener("cancel", function () { finish({ ok: false, cancelled: true }); });
      try { if (typeof box.showModal === "function") box.showModal(); else box.setAttribute("open", ""); } catch (e) { box.setAttribute("open", ""); }
      Promise.all([loadGsi(), call("/api/auth/nonce", { method: "POST", body: {}, auth: false })]).then(function (x) {
        var gid = x[0], n = x[1];
        if (!gid || !n.ok || !n.j || !n.j.nonce) { stEl.textContent = T("mem.err.load", "เปิดหน้าต่างเข้าสู่ระบบของ Google ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่"); stEl.classList.add("bad"); return; }
        var nonce = n.j.nonce;
        gid.initialize({ client_id: clientId(), nonce: nonce, auto_select: false, context: "use", ux_mode: "popup", itp_support: true,
          callback: function (/** @type {any} */ resp) {
            call("/api/auth/link/google", { method: "POST", body: { credential: resp && resp.credential, nonce: nonce } }).then(function (r) { finish(r); });
          } });
        var lang = W.LQI18N ? W.LQI18N.lang : "th";
        gid.renderButton(slot, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: lang === "zh" ? "zh_CN" : lang });
        stEl.textContent = T("mem.dlg.choose", "เลือกบัญชี Google ของคุณ");
      });
    });
  }

  /* ---------------- account page helpers ---------------- */
  var api = {
    lightResult: lightResult, cautionParagraphs: cautionParagraphs, countGuest: countGuest, gateOn: gateOn, signInPossible: signInPossible, CONSENT_VERSION: CONSENT_VERSION, renewalDue: renewalDue, planForRenewal: planForRenewal, upsell: upsell,
    active: active, possible: possible, ready: function () { return !!st.ready; }, config: function () { return st.cfg; },
    signedIn: function () { return !!st.me; }, me: function () { return st.me; }, token: token,
    signIn: openSignIn, signOut: signOut, refresh: function () { return refresh().then(function (m) { emit(); return m; }); },
    history: function (/** @type {any} */ q) { return call("/api/me/history" + (q ? "?" + new URLSearchParams(q).toString() : "")); },
    exportData: function () { return withFresh(function () { return call("/api/me/export"); }); },
    confirmWithGoogle: confirmWithGoogle,
    getSaved: function (/** @type {string} */ id) { return call("/api/me/saved/" + encodeURIComponent(id)); },
    deleteSaved: function (/** @type {string} */ id) { return call("/api/me/saved/" + encodeURIComponent(id), { method: "DELETE" }); },
    /** save a derived reading / report to the member's history (POST /api/me/saved {domain, title, data}) */
    save: function (/** @type {string} */ dom, /** @type {string} */ title, /** @type {any} */ data) { return call("/api/me/saved", { method: "POST", body: { domain: dom, title: String(title || "").slice(0, 120), data: data } }); },
    /** perk balances (GET /api/me/entitlements) */
    entitlements: function () { return call("/api/me/entitlements"); },
    /** server check that takes one credit / counts one use (POST /api/me/entitlements/use {feature}) -> {allowed, via, credits, ...} */
    useEntitlement: function (/** @type {string} */ feature) { return call("/api/me/entitlements/use", { method: "POST", body: { feature: feature } }); },
    setMarketing: function (/** @type {boolean} */ on) { return call("/api/me/preferences", { method: "POST", body: { marketing_opt_in: !!on } }); },
    claimPending: claimPending, pendingClaims: pendingClaims, addPendingClaim: addPendingClaim, claim: claim,
    remembered: function () { return sessWhere === "local"; },
    /** receipt / tax invoice of one of the member's own payments (GET /api/me/payments/:id/receipt?format=json) ->
     *  {ok, status, j, type} — rendered by account.js with textContent (the Worker's HTML version is never opened in our
     *  origin); a non-JSON answer comes back as {blob}. */
    receipt: function (/** @type {string} */ id) {
      var a = API();
      if (!a || !a.enabled() || !token()) return Promise.resolve({ ok: false, status: 0 });
      return fetch(a.url("/api/me/payments/" + encodeURIComponent(id) + "/receipt?format=json"), { headers: { Authorization: "Bearer " + token() }, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" })
        .then(function (/** @type {Response} */ r) {
          var type = String(r.headers.get("Content-Type") || "");
          /** @type {Promise<any>} */
          var out;
          if (/json/.test(type)) out = r.json().catch(function () { return null; }).then(function (j) { return { ok: r.ok, status: r.status, j: j, type: type }; });
          else out = r.blob().then(function (b) { return { ok: r.ok, status: r.status, blob: b, type: type }; });
          return out;
        }).catch(function () { return { ok: false, status: 0 }; });
    },
    /** active sessions (GET /api/me/sessions) — {ok:false, status:404} while the Worker does not offer it */
    sessions: function () { return call("/api/me/sessions"); },
    /** revoke every other session of this account (POST /api/me/sessions/revoke {scope:"others"}) */
    signOutEverywhere: function () { return call("/api/me/sessions/revoke", { method: "POST", body: { scope: "others" } }); },
    deleteAccount: function () {
      return withFresh(function () { return call("/api/me", { method: "DELETE", body: { confirm: "DELETE" } }); }).then(function (r) {
        if (r.ok) { saveSession(null); st.me = null; emit(); }
        return r;
      });
    },
    gate: gate, mountNav: mountNav, toast: toast,
    /* stream G: sign-in methods (Google + LINE) and organisation account lite */
    googleOn: googleOn, lineOn: lineOn, lineNote: function () { return lineNote; },
    identities: function () { return call("/api/me/identities"); },
    linkLine: function () { return withFresh(function () { return startLine("link"); }); },
    linkGoogle: function () { return withFresh(linkGoogle); },
    unlink: function (/** @type {string} */ provider) { return withFresh(function () { return call("/api/me/identities/unlink", { method: "POST", body: { provider: provider } }); }); },
    orgs: function () { return call("/api/me/orgs"); },
    org: function (/** @type {string} */ id) { return call("/api/orgs/" + encodeURIComponent(id)); },
    orgProfile: function (/** @type {string} */ id, /** @type {any} */ b) { return call("/api/orgs/" + encodeURIComponent(id) + "/profile", { method: "POST", body: b }); },
    orgInvite: function (/** @type {string} */ id, /** @type {any} */ b) { return call("/api/orgs/" + encodeURIComponent(id) + "/invites", { method: "POST", body: b }); },
    orgRevoke: function (/** @type {string} */ id, /** @type {string} */ iid) { return call("/api/orgs/" + encodeURIComponent(id) + "/invites/" + encodeURIComponent(iid), { method: "DELETE" }); },
    orgAccept: function (/** @type {string} */ tok) { return call("/api/org-invites/accept", { method: "POST", body: { token: tok } }); },
    orgRole: function (/** @type {string} */ id, /** @type {string} */ uid, /** @type {string} */ role) { return withFresh(function () { return call("/api/orgs/" + encodeURIComponent(id) +
        "/members/" + encodeURIComponent(uid) + "/role", { method: "POST", body: { role: role } }); }); },
    orgRemove: function (/** @type {string} */ id, /** @type {string} */ uid) { return withFresh(function () { return call("/api/orgs/" + encodeURIComponent(id) + "/members/" +
        encodeURIComponent(uid), { method: "DELETE" }); }); },
    orgTransfer: function (/** @type {string} */ id, /** @type {string} */ uid) { return withFresh(function () { return call("/api/orgs/" + encodeURIComponent(id) + "/transfer",
        { method: "POST", body: { user_id: uid } }); }); },
    orgAudit: function (/** @type {string} */ id) { return call("/api/orgs/" + encodeURIComponent(id) + "/audit"); },
    orgLicences: function (/** @type {string} */ id) { return call("/api/orgs/" + encodeURIComponent(id) + "/licences"); }
  };
  W.LQMember = api;
  // UI strings for 中文 / English (Thai is the default in this file); loaded here because this module itself is
  // injected late — the i18n core's English sibling loader only sees script tags present when the language is applied
  ["zh", "en"].forEach(function (l) {
    var src = dir + "i18n/" + l + "-member.js?v=2";
    if (doc.querySelector('script[src*="i18n/' + l + '-member.js"]')) return;
    var sc = doc.createElement("script"); sc.src = src; sc.async = true;
    sc.onload = function () { if (W.LQI18N && W.LQI18N.lang === l) { renderChip(); rerender(); } };
    (doc.head || doc.documentElement).appendChild(sc);
  });
  root.addEventListener("lq-lang", function () { renderChip(); rerender(); });
  attach();
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", function () { renderChip(); init(); });
  else { renderChip(); init(); }
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
