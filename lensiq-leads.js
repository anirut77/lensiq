/* lensiq-leads.js — one transport for the contact / demo-request form (index.html), the "notify me" boxes (pricing.html,
 * account.html) and any other lead form. TH / EN / 中文 texts stay in the calling page.
 *
 *   1) Form switched on (LENSIQ_LEADS_FORM, ON since the owner decision 2026-11-12) and API configured: POST <api>/v1/leads {name, org, email, phone, interest, plan, message, source,
 *      lang, consent: true} with a fresh Cloudflare Turnstile token (X-Turnstile-Token, action "lead") — the Worker keeps
 *      it in the admin inbox and notifies the owner. Resolves {via: "api", ok: true}.
 *   2) No API, or the Worker refused / is not deployed yet: a mailto: link to LENSIQ_SELLER.email (subject + body filled
 *      in, the visitor's own mail app sends it) and/or the LINE Official Account link (LENSIQ_SELLER.line).
 *      Resolves {via: "mailto" | "line", ok: false, href, line}. Nothing has been sent at that point — the page says so.
 *   3) Neither configured: {via: "none", ok: false} — the page says honestly that the details are not announced yet.
 *   Part E (owner order 2026-11-14, defect W-001): a request counts as sent ONLY on a 2xx from /v1/leads. A request the
 *   server did not confirm (network, 403 bot check, 5xx, offline) is kept in the "lq-leads" queue below and retried by
 *   flushQueue() — on page load, when the device comes back online, and after the next confirmed send — each time with
 *   its own fresh Turnstile token; it leaves the queue only after the server confirmed it (2xx).
 *   Round 12 — nothing is lost in the static build: a lead that could not be sent is queued in THIS browser only
 *   (localStorage "lq-leads", at most QUEUE_MAX, never sent anywhere by itself). Every [data-lq-pending] box on the page
 *   then shows "n requests not sent yet" with copy / delete, and — once the owner fills LENSIQ_SELLER.email / .line or
 *   deploys the Worker — "send now" (API) or ready mailto / LINE links. The one place to configure the fallback is
 *   LENSIQ_SELLER in lensiq-config.js; the owner's go-live list (lensiq-golive.js, help.html?owner=1) flags it.
 * Nothing is sent anywhere else; the lead never goes to analytics. Pure helpers are unit-tested in Node
 * (tests/unit/leads.test.js). */
(function (root) {
  "use strict";
  var QUEUE_KEY = "lq-leads", QUEUE_MAX = 10;
  var LIMITS = /** @type {Record<string, number>} */ ({ name: 120, org: 160, email: 254, phone: 32, interest: 40, message: 1000, source: 40, lang: 5 });

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

  /** Queue after adding one lead (cleaned, stamped, newest last, at most QUEUE_MAX). @param {any[]} list @param {any} lead @param {number} [now] */
  function queueAdd(list, lead, now) {
    var l = (Array.isArray(list) ? list : []).filter(function (x) { return x && typeof x === "object"; });
    var c = /** @type {Record<string, any>} */ (cleanLead(lead));
    if (!c.email && !c.name && !c.message) return l.slice(-QUEUE_MAX);
    c.id = String(lead && lead.id || (now || Date.now()).toString(36));
    c.createdAt = String(lead && lead.createdAt || new Date(now || Date.now()).toISOString());
    l = l.filter(function (x) { return x.id !== c.id; });
    l.push(c);
    return l.slice(-QUEUE_MAX);
  }
  /** Plain-text copy of queued leads (for the visitor's clipboard). @param {any[]} list */
  function queueText(list) {
    return (Array.isArray(list) ? list : []).map(function (x) {
      var l = cleanLead(x);
      return [["Name", l.name], ["Organisation", l.org], ["E-mail", l.email], ["Phone", l.phone], ["Interest", l.interest], ["Plan", l.plan], ["Message", l.message]]
        .filter(function (p) { return p[1]; }).map(function (p) { return p[0] + ": " + p[1]; }).join("\n");
    }).join("\n\n---\n\n");
  }

  var pure = { filled: filled, sellerOf: sellerOf, isEmail: isEmail, lineUrl: lineUrl, cleanLead: cleanLead, mailtoHref: mailtoHref, fallbackOf: fallbackOf, queueAdd: queueAdd, queueText: queueText, LIMITS: LIMITS, QUEUE_KEY: QUEUE_KEY, QUEUE_MAX: QUEUE_MAX };
  if (typeof module !== "undefined" && module.exports) { module.exports = pure; return; }

  /* ============================ browser ============================ */
  /** @type {any} */
  var W = root;
  /** The quote-request form sends to the server only while the owner has switched it on (window.LENSIQ_LEADS_FORM ===
   *  true in lensiq-config.js, on by default since the owner decision of 2026-11-12) AND the API is configured. Off: nothing leaves
   *  the device; the request stays in this browser (or goes through the visitor's own mail / LINE app if configured). */
  var serverOn = function () { var A = W.LQApi; return W.LENSIQ_LEADS_FORM === true && !!(A && A.enabled && A.enabled() && typeof A.call === "function"); };
  /** The LINE ID offered on the quote-request confirmation (LENSIQ_SELLER.quote_line), "" while the form is off. */
  var quoteLine = function () { var s = sellerOf(W.LENSIQ_SELLER); return W.LENSIQ_LEADS_FORM === true && /^@?[A-Za-z0-9._-]{2,40}$/.test(s.quote_line || "") ? s.quote_line : ""; };
  /* one send at a time (the form, the queue box and the automatic retry share one Turnstile widget and its tokens are
   * single-use); `inflight` = ids being sent right now */
  /** @type {Promise<any>} */
  var chain = Promise.resolve();
  /** @type {Record<string, boolean>} */
  var inflight = {};
  /** @param {() => (Promise<any>|undefined)} fn */
  function serial(fn) { var p = chain.then(fn, fn); chain = p.then(function () { return undefined; }, function () { return undefined; }); return p; }
  /** the device says it has no network (navigator.onLine === false) */
  function offline() { return !!(W.navigator && W.navigator.onLine === false); }
  /**
   * Sends a lead (see the header). Never rejects.
   * @param {any} lead @param {{subject?: string, turnstile?: any}} [opts]
   * @returns {Promise<{via: string, ok: boolean, href?: string, line?: string, lineId?: string, status?: number}>}
   */
  function submit(lead, opts) {
    var id = lead && lead.id ? String(lead.id) : "";
    return serial(function () {
      if (id) inflight[id] = true;
      return send(lead, opts).then(function (/** @type {any} */ r) { if (id) delete inflight[id]; return r; });
    });
  }
  /** @param {any} lead @param {{subject?: string, turnstile?: any}} [opts] */
  function send(lead, opts) {
    var o = opts || {};
    var body = Object.assign(cleanLead(lead), { consent: true });
    var fb = function (/** @type {number} */ status) {
      var f = fallbackOf(W.LENSIQ_SELLER);
      var href = f.email ? mailtoHref(f.email, lead, o.subject) : "";
      return { via: href ? "mailto" : f.line ? "line" : "none", ok: false, href: href || undefined, line: f.line || undefined, lineId: f.lineId || undefined, status: status };
    };
    // the server form (owner bug report 2026-11-13): never POST without a Turnstile token, never fall back silently;
    // a failure says why and offers the LINE ID, and the page keeps what the customer typed
    var failApi = function (/** @type {string} */ reason, /** @type {number} */ status) {
      var id = quoteLine();
      return { via: "api", ok: false, reason: reason, status: status, lineId: id || undefined, line: id ? lineUrl(id) || undefined : undefined };
    };
    return apiReady().then(function () {
      var A = W.LQApi;
      // the server form is configured and on, but lensiq-api.js did not arrive (slow or failed load): an honest error with
      // LINE and the text kept, never the browser-only "announced before sales" path
      if (String(W.LENSIQ_API_BASE || "").trim() && W.LENSIQ_LEADS_FORM === true && !(A && typeof A.call === "function")) return failApi("network", 0);
      if (!serverOn()) return fb(0);
      // no network: say so at once (no bot check, no POST); the page queues it and flushQueue() sends it when back online
      if (offline()) return failApi("offline", 0);
      return Promise.resolve(A.turnstile ? A.turnstile("lead", o.turnstile) : "").then(function (/** @type {string} */ tok) {
        // with a site key (every real deployment) no token = no send; without one (local development) the Worker decides
        if (!tok && String(W.LENSIQ_TURNSTILE_SITEKEY || "").trim()) return failApi("turnstile", 0);
        return Promise.resolve(A.call("/v1/leads", { method: "POST", body: body, headers: tok ? { "X-Turnstile-Token": tok } : {} })).then(function (/** @type {any} */ r) {
          return r && r.ok ? { via: "api", ok: true, status: r.status } : failApi(r && r.status === 403 ? "turnstile" : r && r.status ? "server" : "network", r ? r.status : 0);
        }, function () { return failApi("network", 0); });
      });
    });
  }
  /** lensiq-config.js loads lensiq-api.js after the page: when an API is configured, wait for it (up to 8 s) so a quick
   *  "send" never takes the browser-only path by mistake */
  function apiReady() {
    if (!String(W.LENSIQ_API_BASE || "").trim() || W.LENSIQ_LEADS_FORM !== true) return Promise.resolve();
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function poll() { if ((W.LQApi && W.LQApi.call) || Date.now() - t0 > 8000) resolve(undefined); else setTimeout(poll, 100); })();
    });
  }
  /* ---- local queue (this browser only) + the "not sent yet" box ---- */
  function readQ() { try { var l = JSON.parse(W.localStorage.getItem(QUEUE_KEY) || "[]"); return Array.isArray(l) ? l.filter(function (x) { return x && typeof x === "object"; }) : []; } catch (e) { return []; } }
  /** @param {any[]} l */
  function writeQ(l) { try { if (l.length) W.localStorage.setItem(QUEUE_KEY, JSON.stringify(l.slice(-QUEUE_MAX))); else W.localStorage.removeItem(QUEUE_KEY); return true; } catch (e) { return false; } }
  /** Keeps a lead that could not be sent (returns false when storage is blocked). @param {any} lead */
  function queue(lead) { var ok = writeQ(queueAdd(readQ(), lead)); renderPending(); return ok; }
  function clearQueue() { writeQ([]); renderPending(); }
  /** Removes one request from the queue (after the server confirmed it). @param {string} id */
  function unqueue(id) { var l = readQ(), k = l.filter(function (x) { return String(x.id) !== String(id); }); if (k.length !== l.length) writeQ(k); renderPending(); }
  /** Is this request still waiting in the queue? @param {string} id */
  function isQueued(id) { return readQ().some(function (x) { return String(x.id) === String(id); }); }
  /** @type {Promise<{sent: string[], left: number}>|null} */
  var flushing = null;
  /** @type {Record<string, boolean>} ids the queue delivered (server confirmed) during this page view */
  var confirmed = {};
  /** @param {string} id */
  function wasSent(id) { return !!confirmed[String(id)]; }
  /**
   * Sends every queued request (oldest first), each with its own Turnstile token, and removes a request ONLY after the
   * server confirmed it with a 2xx. Stops at a failed bot check or when the device is offline. Only while the server form
   * is on. Never rejects. Fires "lq-leads-sent" {detail: {ids}} for what was confirmed.
   * @param {{turnstile?: any}} [opts] @returns {Promise<{sent: string[], left: number}>}
   */
  function flushQueue(opts) {
    if (flushing) return flushing;
    var sent = /** @type {string[]} */ ([]);
    flushing = apiReady().then(function () {
      if (!serverOn() || !readQ().length || offline()) return;
      var stop = false;
      return readQ().reduce(function (p, item) {
        return p.then(function () {
          if (stop) return;
          return serial(function () {
            var id = String(item.id || "");
            // sent meanwhile by the form (or deleted by the person): skip
            if (!id || inflight[id] || !isQueued(id)) return undefined;
            if (offline()) { stop = true; return undefined; }
            inflight[id] = true;
            return send(item, { subject: "LENSIQ demo request", turnstile: opts && opts.turnstile }).then(function (/** @type {any} */ r) {
              delete inflight[id];
              if (r && r.via === "api" && r.ok) { unqueue(id); sent.push(id); confirmed[id] = true; }
              else if (r && (r.reason === "turnstile" || r.reason === "offline")) stop = true;
            });
          });
        });
      }, Promise.resolve());
    }).then(function () {
      flushing = null;
      renderPending();
      if (sent.length) {
        try { if (typeof W.CustomEvent === "function" && W.dispatchEvent) W.dispatchEvent(new W.CustomEvent("lq-leads-sent", { detail: { ids: sent.slice() } })); } catch (e) { /* old browser */ }
      }
      return { sent: sent, left: readQ().length };
    }, function () { flushing = null; return { sent: sent, left: readQ().length }; });
    return flushing;
  }
  /** automatic retry: page load, back online (the page's own Turnstile box when it has one) */
  function autoFlush() {
    if (!readQ().length) return;
    var box = W.document && W.document.getElementById ? W.document.getElementById("lqTurnstile") : null;
    flushQueue(box ? { turnstile: { container: box } } : undefined);
  }
  (W.LQI18N_Q = W.LQI18N_Q || []).push({
    en: {
      "leads.q.wait": "{n} request(s) not sent yet — kept in this browser only. The contact channel will be announced before sales open; you can copy or delete them",
      "leads.q.ready": "{n} request(s) not sent yet are kept in this browser. You can send them to the team now",
      "leads.q.send": "Send now", "leads.q.copy": "Copy text", "leads.q.copied": "Copied", "leads.q.del": "Delete from this browser",
      "leads.q.sent": "Sent {n} request(s) to the team", "leads.q.fail": "Could not send now; the requests stay in this browser",
      "leads.q.mail": "Send by e-mail", "leads.q.line": "Chat on LINE"
    },
    zh: {
      "leads.q.wait": "有 {n} 条申请尚未发送，只保存在此浏览器中。联系渠道将在开售前公布，您可以复制或删除",
      "leads.q.ready": "此浏览器中保存着 {n} 条尚未发送的申请，现在可以发送给团队",
      "leads.q.send": "立即发送", "leads.q.copy": "复制文本", "leads.q.copied": "已复制", "leads.q.del": "从此浏览器删除",
      "leads.q.sent": "已向团队发送 {n} 条申请", "leads.q.fail": "暂时无法发送，申请仍保存在此浏览器中",
      "leads.q.mail": "通过邮件发送", "leads.q.line": "在 LINE 上聊天"
    }
  });
  /** @param {string} k @param {string} th @param {any} [v] */
  var T = function (k, th, v) { return W.LQI18N && typeof W.LQI18N.tf === "function" ? W.LQI18N.tf(k, th, v) : String(th).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var apiOn = serverOn;
  /** @param {string} tag @param {string} [cls] @param {string} [text] */
  var mk = function (tag, cls, text) { var e = W.document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function renderPending() {
    if (!W.document || !W.document.querySelectorAll) return;
    var boxes = W.document.querySelectorAll("[data-lq-pending]");
    if (!boxes.length) return;
    var list = readQ(), fb = fallbackOf(W.LENSIQ_SELLER), ready = apiOn() || fb.any;
    Array.prototype.forEach.call(boxes, function (/** @type {HTMLElement} */ box) {
      box.textContent = "";
      box.hidden = !list.length;
      if (!list.length) return;
      box.appendChild(mk("p", "", ready ? T("leads.q.ready", "มีคำขอ {n} รายการที่ยังไม่ได้ส่ง เก็บไว้ในเบราว์เซอร์นี้ ตอนนี้ส่งถึงทีมงานได้แล้ว", { n: list.length })
        : T("leads.q.wait", "มีคำขอ {n} รายการที่ยังไม่ได้ส่ง เก็บไว้ในเบราว์เซอร์นี้เท่านั้น ช่องทางติดต่อจะประกาศก่อนเปิดขาย คัดลอกเก็บไว้หรือลบได้", { n: list.length })));
      var row = mk("p", "lq-pending-acts"), out = mk("span", "lq-pending-msg");
      out.setAttribute("role", "status");
      if (apiOn()) {
        var sendBtn = /** @type {HTMLButtonElement} */ (mk("button", "btn ghost", T("leads.q.send", "ส่งตอนนี้")));
        sendBtn.type = "button";
        sendBtn.addEventListener("click", function () {
          sendBtn.disabled = true;
          // removed from the queue only after the server confirmed each one (flushQueue)
          flushQueue().then(function (r) {
            if (!r.left) {
              Array.prototype.forEach.call(W.document.querySelectorAll("[data-lq-pending]"), function (/** @type {HTMLElement} */ b) { b.hidden = !r.sent.length; b.textContent = r.sent.length ? T("leads.q.sent", "ส่งคำขอ {n} รายการถึงทีมงานแล้ว", { n: r.sent.length }) : ""; });
            } else {
              Array.prototype.forEach.call(W.document.querySelectorAll("[data-lq-pending] .lq-pending-msg"), function (/** @type {HTMLElement} */ o) { o.textContent = T("leads.q.fail", "ยังส่งไม่ได้ตอนนี้ คำขอยังเก็บไว้ในเบราว์เซอร์นี้"); });
            }
          });
        });
        row.appendChild(sendBtn);
        var ql = quoteLine(), qlu = ql ? lineUrl(ql) : "";
        if (qlu) { var lb = /** @type {HTMLAnchorElement} */ (mk("a", "btn ghost", T("leads.q.line", "แชตทาง LINE"))); lb.href = qlu; lb.target = "_blank"; lb.rel = "noopener"; row.appendChild(lb); }
      } else if (fb.any) {
        list.slice(-3).forEach(function (l) {
          if (fb.email) { var a = /** @type {HTMLAnchorElement} */ (mk("a", "btn ghost", T("leads.q.mail", "ส่งทางอีเมล"))); a.href = mailtoHref(fb.email, l); row.appendChild(a); }
        });
        if (fb.line) { var b2 = /** @type {HTMLAnchorElement} */ (mk("a", "btn ghost", T("leads.q.line", "แชตทาง LINE"))); b2.href = fb.line; b2.target = "_blank"; b2.rel = "noopener"; row.appendChild(b2); }
      }
      var cp = /** @type {HTMLButtonElement} */ (mk("button", "btn ghost", T("leads.q.copy", "คัดลอกข้อความ")));
      cp.type = "button";
      cp.addEventListener("click", function () {
        var txt = queueText(readQ());
        var done = function () { out.textContent = T("leads.q.copied", "คัดลอกแล้ว"); };
        try { W.navigator.clipboard.writeText(txt).then(done, function () { /* clipboard blocked */ }); } catch (e) { /* old browser */ }
      });
      var del = /** @type {HTMLButtonElement} */ (mk("button", "btn ghost", T("leads.q.del", "ลบออกจากเบราว์เซอร์นี้")));
      del.type = "button";
      del.addEventListener("click", clearQueue);
      row.appendChild(cp); row.appendChild(del); row.appendChild(out);
      box.appendChild(row);
    });
  }
  if (W.document && W.addEventListener) {
    W.addEventListener("load", renderPending);
    W.addEventListener("lq-lang", renderPending);
    W.addEventListener("load", autoFlush);
    W.addEventListener("online", autoFlush);
  }
  W.LQLeads = Object.assign({ submit: submit, serverOn: serverOn, quoteLine: quoteLine, queue: queue, queued: readQ, clearQueue: clearQueue,
    unqueue: unqueue, isQueued: isQueued, flushQueue: flushQueue, wasSent: wasSent, offline: offline,
    renderPending: renderPending, fallback: function () { return fallbackOf(W.LENSIQ_SELLER); } }, pure);
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
