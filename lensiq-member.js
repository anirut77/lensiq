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
 * (POST /api/auth/google, nonce from POST /api/auth/nonce); we keep only the Worker's member token, in localStorage
 * (try/catch), sent as `Authorization: Bearer` (the API is another origin — no third-party cookies).
 *
 *   LQMember.active()            gate on (membership required + sign-in possible)
 *   LQMember.signedIn() / me()   current member ({user, tier, plan, quotas}) or null
 *   LQMember.token()             bearer token or "" (lensiq-fortune-hook.js adds it to /api/fortune)
 *   LQMember.signIn() / signOut() / refresh() / history() / exportData() / deleteAccount() / getSaved(id) / deleteSaved(id)
 *   LQMember.mountNav(header)    account chip (called by nav.js; idempotent)
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
  var GSI_SRC = "https://accounts.google.com/gsi/client";

  /* ============================ pure helpers (unit-tested in Node) ============================ */
  // gentle-caution sentences (same markers as fortune-ai.js CAUTION_MARK_TH / _ZH, plus English wording)
  var CAUTION_RE = /ควรระวัง|ตึงมือ|ระมัดระวัง|ต้องใช้แรงมากกว่าปกติ|ต้องการความเข้าใจมากขึ้น|ควรใจเย็นกับกันและกัน|เดินอย่างรอบคอบ|จุดที่ควรใส่ใจ|紧一些|多留意|多留心|多花些力气|多一些体谅|多一点耐心|宜稳|\b(?:be careful|take care|caution|go carefully|watch your spending|tight)\b/i;

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

  var pure = { lightResult: lightResult, cautionParagraphs: cautionParagraphs, countGuest: countGuest, gateOn: gateOn, signInPossible: signInPossible, CONSENT_VERSION: CONSENT_VERSION };
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
    set: function (/** @type {string} */ k, /** @type {any} */ v) { try { root.sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* blocked */ } }
  };
  var today = function () { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); };

  var st = /** @type {any} */ ({ cfg: ss.get(CFG_KEY), me: null, ready: false });
  var sess = ls.get(TOKEN_KEY);
  if (sess && (!sess.t || !sess.exp || sess.exp * 1000 < Date.now())) { sess = null; ls.set(TOKEN_KEY, null); }
  function token() { return sess && sess.t ? String(sess.t) : ""; }
  function active() { return gateOn(st.cfg, clientId()); }
  function possible() { return signInPossible(st.cfg, clientId()); }
  function ms() { return (st.cfg && st.cfg.membership) || {}; }

  /** fetch helper that keeps the error code ({ok, status, j}); bearer auth when signed in. */
  function call(/** @type {string} */ path, /** @type {any} */ o) {
    o = o || {};
    var a = API();
    if (!a || !a.enabled()) return Promise.resolve({ ok: false, status: 0, j: null });
    /** @type {Record<string, string>} */
    var h = Object.assign({}, o.headers || {});
    if (o.body !== undefined) h["Content-Type"] = "application/json";
    if (token() && o.auth !== false) h.Authorization = "Bearer " + token();
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
      else if (r.status === 401) { st.me = null; sess = null; ls.set(TOKEN_KEY, null); }
      return st.me;
    });
  }

  function init() {
    var a = API();
    if (!a || !a.enabled()) return;
    Promise.resolve(a.config()).then(function (/** @type {any} */ cfg) {
      if (cfg) { st.cfg = cfg; ss.set(CFG_KEY, { membership: cfg.membership || null }); }
      return possible() || token() ? refresh() : null;
    }).then(function () {
      st.ready = true;
      emit();
      try { root.dispatchEvent(new CustomEvent("lq-member-ready")); } catch (e) { /* ignore */ }
    });
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
    ".lq-acct-btn.signin{padding:0 12px}.lq-av{flex:none;display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#5b47e0;color:#fff;font-weight:700;font-size:.8rem}" +
    ".lq-acct-btn span.lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".lq-acct-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:80;min-width:230px;margin:0;padding:6px;list-style:none;background:#fff;border:1px solid #e3e7f0;border-radius:12px;box-shadow:0 12px 32px rgba(14,20,48,.14)}" +
    ".lq-acct-menu a,.lq-acct-menu button{display:flex;width:100%;min-height:40px;align-items:center;padding:0 12px;border:0;border-radius:8px;background:none;color:#0e1430;font:inherit;font-size:.88rem;text-align:left;text-decoration:none;cursor:pointer}" +
    ".lq-acct-menu a:hover,.lq-acct-menu button:hover,.lq-acct-menu a:focus-visible,.lq-acct-menu button:focus-visible{background:#f2f0ff}.lq-acct-menu .who{padding:8px 12px 6px;font-size:.78rem;color:#4a5470;overflow-wrap:anywhere}" +
    ".lq-acct-menu .danger{color:#b42318}.lq-acct-item{display:none}" +
    "@media(max-width:1099.98px),(pointer:coarse) and (max-height:600px){.lq-acct{display:none}.lq-acct-item{display:block}.lq-acct-item>.nav-link{width:100%}}" +
    ".lq-dlg{margin:auto;width:min(520px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);padding:0;border:0;border-radius:18px;box-shadow:0 24px 64px rgba(14,20,48,.3);color:#0e1430;background:#fff}" +
    ".lq-dlg::backdrop{background:rgba(14,20,48,.55)}.lq-dlg-in{padding:20px 20px 18px;overflow:auto}.lq-dlg h2{margin:0 0 .4em;font-size:1.2rem}" +
    ".lq-dlg p,.lq-dlg li{line-height:1.6;font-size:.92rem}.lq-dlg .lq-notice{margin:.6em 0;padding:.7em .9em;border-radius:12px;background:#f6f7fb;font-size:.85rem}.lq-dlg .lq-notice ul{margin:.3em 0 0;padding-left:1.1em}" +
    ".lq-dlg label.ck{display:flex;gap:.6em;align-items:flex-start;margin:.55em 0;font-size:.9rem;line-height:1.5;cursor:pointer}.lq-dlg label.ck input{margin-top:.25em;width:18px;height:18px;flex:none}" +
    ".lq-dlg .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px}.lq-gsi{min-height:44px;margin-top:10px}.lq-dlg .st{min-height:1.4em;margin:.5em 0 0;font-size:.88rem;color:#4a5470}.lq-dlg .st.bad{color:#b42318}" +
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

  /* ---------------- reading gate (wraps FortuneAI.renderSections) ---------------- */
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
    var b = el("button", { type: "button", class: "lq-btn", "data-lq-signin": "", text: T("mem.signin.free", "เข้าสู่ระบบฟรีด้วย Google") });
    b.addEventListener("click", function () { openSignIn(); });
    box.appendChild(b);
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
    if (gated && gated.light) container.appendChild(gateCard(gated.light));
    else if (st.me && active()) {
      container.appendChild(memberActions(res));
      if (domain && logged && !logged.has(res)) { logged.add(res); call("/api/me/usage", { method: "POST", body: { kind: "reading", domain: domain } }); }
    }
  }

  function remember(c, r, o) {
    shown = shown.filter(function (x) { return x.c !== c && x.c.isConnected !== false; });
    shown.push({ c: c, r: r, o: o });
    if (shown.length > 12) shown.shift();
  }
  function rerender() {
    if (!origRender) return;
    shown.forEach(function (x) { if (x.c && x.c.isConnected) render(x.c, x.r, x.o, true); });
  }
  function render(container, result, opts, again) {
    if (!again) remember(container, result, opts);
    var g = gateResult(result);
    if (g !== result || active()) ensureStyle();
    var out = origRender.call(W.FortuneAI, container, g, opts);
    decorate(container, result, g);
    return out;
  }
  var tries = 0;
  function wrapFA() {
    var FA = W.FortuneAI;
    if (!FA || typeof FA.renderSections !== "function") { if (tries++ < 40) setTimeout(wrapFA, 250); return; }
    if (FA.renderSections.__lqMember) return;
    origRender = FA.renderSections;
    var wrapped = function (/** @type {any} */ c, /** @type {any} */ r, /** @type {any} */ o) { return render(c, r, o, false); };
    wrapped.__lqMember = true;
    FA.renderSections = wrapped;
  }
  /** For pages without FortuneAI.renderSections (fortune-kit.js plain fallback): the gated result + card. */
  function gate(res) { return gateResult(res); }

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
    var terms = el("input", { type: "checkbox", name: "terms", required: true });
    var mkt = el("input", { type: "checkbox", name: "marketing" });
    var go = el("button", { type: "button", class: "lq-btn", disabled: true, "data-lq-continue": "", text: T("mem.dlg.continue", "ดำเนินการต่อด้วย Google") });
    var cancel = el("button", { type: "button", class: "lq-btn ghost", text: T("mem.dlg.cancel", "ยกเลิก") });
    var slot = el("div", { class: "lq-gsi", "data-lq-gsi": "" });
    var stEl = el("p", { class: "st", role: "status", "aria-live": "polite" });
    var link = function (/** @type {string} */ href, /** @type {string} */ k, /** @type {string} */ th) { return el("a", { href: href, target: "_blank", rel: "noopener", text: T(k, th) }); };
    dlg = el("dialog", { class: "lq-dlg", "aria-labelledby": "lqDlgH", "data-lq-shared": "" },
      el("div", { class: "lq-dlg-in" },
        el("h2", { id: "lqDlgH", text: T("mem.dlg.title", "เข้าสู่ระบบด้วย Google") }),
        el("p", { text: T("mem.dlg.lead", "สมัครสมาชิกฟรี: อ่านคำทำนายฉบับเต็ม แผนปรับ 3 ข้อ ผู้ช่วยเขียน AI วันละ {n} ครั้ง และเก็บประวัติของคุณไว้ในบัญชี", { n: q.member_ai_daily == null ? 3 : q.member_ai_daily }) }),
        el("div", { class: "lq-notice", role: "note" },
          el("strong", { text: T("mem.dlg.privacy", "ข้อมูลที่เราเก็บและเหตุผล") }),
          el("ul", null,
            el("li", { text: T("mem.dlg.p1", "อีเมลที่ Google ยืนยันแล้ว รหัสบัญชี Google และชื่อเล่น (ถ้ามี) — ไม่เก็บรูปโปรไฟล์ ไม่เก็บรูปถ่ายหรือข้อมูลใบหน้า") }),
            el("li", { text: T("mem.dlg.p2", "ใช้เพื่อให้บริการบัญชีสมาชิก นับโควตาการใช้งาน และเก็บประวัติการใช้งาน/การชำระเงิน (ฐานสัญญา ม.24(3) พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล)") }),
            el("li", { text: T("mem.dlg.p3", "ไม่เก็บเนื้อหาคำทำนาย เว้นแต่คุณกดบันทึกเอง · ไม่ใช้อีเมลส่งข่าวสารการตลาด เว้นแต่คุณเลือกรับด้านล่าง") }),
            el("li", { text: T("mem.dlg.p4", "จัดเก็บบน Cloudflare (อาจอยู่นอกประเทศไทย) · ดาวน์โหลดหรือลบข้อมูลและบัญชีได้ทุกเมื่อที่หน้า บัญชีของฉัน") }))),
        el("label", { class: "ck" }, terms, el("span", null, T("mem.dlg.accept", "ฉันยอมรับ") + " ", link("terms.html", "mem.dlg.terms", "ข้อกำหนดการใช้บริการ"), " " + T("mem.dlg.and", "และ") + " ", link("privacy.html", "mem.dlg.policy", "นโยบายความเป็นส่วนตัว"))),
        el("label", { class: "ck" }, mkt, el("span", { text: T("mem.dlg.marketing", "รับข่าวสารและข้อเสนอจาก LENSIQ ทางอีเมล (ไม่บังคับ ยกเลิกได้ทุกเมื่อ)") })),
        el("div", { class: "row" }, go, cancel),
        slot, stEl));
    doc.body.appendChild(dlg);
    terms.addEventListener("change", function () { go.disabled = !terms.checked; });
    cancel.addEventListener("click", function () { closeDlg(); });
    /** @param {string} t @param {boolean} [bad] */
    var say = function (t, bad) { stEl.textContent = t; stEl.classList.toggle("bad", !!bad); };
    var nonce = "";
    go.addEventListener("click", function () {
      if (!terms.checked) return;
      go.disabled = true;
      say(T("mem.dlg.loading", "กำลังเปิดหน้าต่าง Google…"));
      Promise.all([loadGsi(), call("/api/auth/nonce", { method: "POST", body: {}, auth: false })]).then(function (x) {
        var gid = x[0], n = x[1];
        if (!gid || !n.ok || !n.j || !n.j.nonce) { go.disabled = false; say(T("mem.err.load", "เปิดหน้าต่างเข้าสู่ระบบของ Google ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่"), true); return; }
        nonce = n.j.nonce;
        gid.initialize({ client_id: clientId(), nonce: nonce, callback: onCredential, auto_select: false, cancel_on_tap_outside: true, context: "signin", ux_mode: "popup", itp_support: true, use_fedcm_for_prompt: true });
        slot.textContent = "";
        var lang = W.LQI18N ? W.LQI18N.lang : "th";
        gid.renderButton(slot, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: lang === "zh" ? "zh_CN" : lang });
        go.hidden = true;
        say(T("mem.dlg.choose", "เลือกบัญชี Google ของคุณ"));
      });
    });
    function onCredential(/** @type {any} */ resp) {
      say(T("mem.dlg.signing", "กำลังเข้าสู่ระบบ…"));
      var a = API();
      Promise.resolve(a && a.turnstile ? a.turnstile("signin") : "").then(function (tk) {
        return call("/api/auth/google", { method: "POST", auth: false, headers: tk ? { "X-Turnstile-Token": tk } : {},
          body: { credential: resp && resp.credential, nonce: nonce, accept_terms: !!terms.checked, consent_version: CONSENT_VERSION, marketing_opt_in: !!mkt.checked } });
      }).then(function (r) {
        if (!r.ok || !r.j || !r.j.token) {
          var e = ERR[r.j && r.j.code] || ["mem.err.generic", "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"];
          say(T(e[0], e[1]), true); go.hidden = false; go.disabled = !terms.checked; slot.textContent = "";
          return;
        }
        sess = { t: r.j.token, exp: r.j.expires_at };
        ls.set(TOKEN_KEY, sess);
        return refresh().then(function () { closeDlg(); emit(); toast(T("mem.welcome", "เข้าสู่ระบบแล้ว ยินดีต้อนรับ")); });
      });
    }
    showDlg();
    return Promise.resolve(true);
  }
  function showDlg() { try { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); } catch (e) { dlg.setAttribute("open", ""); } }
  function closeDlg() { if (!dlg) return; try { dlg.close(); } catch (e) { dlg.removeAttribute("open"); } dlg.remove(); dlg = null; }

  function toast(msg) {
    var t = el("div", { class: "lq-toast", role: "status", text: msg });
    t.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483000;padding:10px 16px;border-radius:999px;background:#0e1430;color:#fff;font-size:.9rem;max-width:calc(100vw - 32px)";
    doc.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  function signOut() {
    var p = token() ? call("/api/auth/logout", { method: "POST", body: {} }) : Promise.resolve(null);
    return p.then(function () { sess = null; st.me = null; ls.set(TOKEN_KEY, null); emit(); return true; });
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
    if (!possible() && !st.me) return;
    ensureStyle();
    var lang = h.querySelector(".lang-switch");
    var end = h.querySelector(".nav-end");
    if (!end && lang) { end = el("div", { class: "nav-end" }); lang.parentNode.insertBefore(end, lang); end.appendChild(lang); }
    var box = el("div", { class: "lq-acct" });
    var list = h.querySelector(".nav-list");
    if (!st.me) {
      var b = el("button", { type: "button", class: "lq-acct-btn signin", "data-lq-signin": "", text: T("mem.chip.signin", "เข้าสู่ระบบด้วย Google") });
      b.addEventListener("click", function () { openSignIn(); });
      box.appendChild(b);
      if (list) {
        var li = el("li", { class: "nav-item lq-acct-item" }), lb = el("button", { type: "button", class: "nav-link", text: T("mem.chip.signin", "เข้าสู่ระบบด้วย Google") });
        lb.addEventListener("click", function () { openSignIn(); });
        li.appendChild(lb); list.insertBefore(li, list.firstChild);
      }
    } else {
      var name = st.me.user.display_name || st.me.user.email;
      var btn = el("button", { type: "button", class: "lq-acct-btn", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": T("mem.chip.menu", "บัญชีของฉัน") + ": " + name },
        el("span", { class: "lq-av", "aria-hidden": "true", text: initialOf(st.me) }), el("span", { class: "lbl", text: name }));
      var menu = el("ul", { class: "lq-acct-menu", role: "menu", hidden: true },
        el("li", { class: "who", role: "presentation", text: st.me.user.email }),
        el("li", { role: "presentation" }, el("a", { role: "menuitem", href: "account.html#history", text: T("mem.menu.history", "ประวัติการดูดวงของฉัน") })),
        el("li", { role: "presentation" }, el("a", { role: "menuitem", href: "account.html#plan", text: T("mem.menu.plan", "แพ็กเกจและโควตา") })),
        el("li", { role: "presentation" }, el("button", { type: "button", role: "menuitem", "data-lq-signout": "", text: T("mem.menu.signout", "ออกจากระบบ") })),
        el("li", { role: "presentation" }, el("a", { role: "menuitem", class: "danger", href: "account.html#delete", text: T("mem.menu.delete", "ลบบัญชี") })));
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
  }

  /* ---------------- account page helpers ---------------- */
  var api = {
    lightResult: lightResult, cautionParagraphs: cautionParagraphs, countGuest: countGuest, gateOn: gateOn, signInPossible: signInPossible, CONSENT_VERSION: CONSENT_VERSION,
    active: active, possible: possible, ready: function () { return !!st.ready; }, config: function () { return st.cfg; },
    signedIn: function () { return !!st.me; }, me: function () { return st.me; }, token: token,
    signIn: openSignIn, signOut: signOut, refresh: function () { return refresh().then(function (m) { emit(); return m; }); },
    history: function (/** @type {any} */ q) { return call("/api/me/history" + (q ? "?" + new URLSearchParams(q).toString() : "")); },
    exportData: function () { return call("/api/me/export"); },
    getSaved: function (/** @type {string} */ id) { return call("/api/me/saved/" + encodeURIComponent(id)); },
    deleteSaved: function (/** @type {string} */ id) { return call("/api/me/saved/" + encodeURIComponent(id), { method: "DELETE" }); },
    setMarketing: function (/** @type {boolean} */ on) { return call("/api/me/preferences", { method: "POST", body: { marketing_opt_in: !!on } }); },
    deleteAccount: function () {
      return call("/api/me", { method: "DELETE", body: { confirm: "DELETE" } }).then(function (r) {
        if (r.ok) { sess = null; st.me = null; ls.set(TOKEN_KEY, null); emit(); }
        return r;
      });
    },
    gate: gate, mountNav: mountNav
  };
  W.LQMember = api;
  // UI strings for 中文 / English (Thai is the default in this file); loaded here because this module itself is
  // injected late — the i18n core's English sibling loader only sees script tags present when the language is applied
  ["zh", "en"].forEach(function (l) {
    var src = dir + "i18n/" + l + "-member.js?v=1";
    if (doc.querySelector('script[src*="i18n/' + l + '-member.js"]')) return;
    var sc = doc.createElement("script"); sc.src = src; sc.async = true;
    sc.onload = function () { if (W.LQI18N && W.LQI18N.lang === l) { renderChip(); rerender(); } };
    (doc.head || doc.documentElement).appendChild(sc);
  });
  root.addEventListener("lq-lang", function () { renderChip(); rerender(); });
  wrapFA();
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", function () { renderChip(); init(); });
  else { renderChip(); init(); }
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
