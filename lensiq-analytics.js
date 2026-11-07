/* lensiq-analytics.js — privacy-first, opt-in usage analytics for LENSIQ (PDPA). Needs lensiq-api.js.
 *
 * Off unless ALL of: LENSIQ_API_BASE is set, the browser does not send Do-Not-Track / Global Privacy Control, and the
 * visitor clicked "ยอมรับ" (opt-in) on the banner. Choice is kept in localStorage ("lq-analytics") and can be changed
 * with LQAnalytics.setConsent(false) or the "การตั้งค่าคุกกี้/สถิติ" link (LQAnalytics.showBanner()).
 *
 * Sent (coarse, allowlisted — the Worker rejects anything else): event name, a random per-tab session id
 * (sessionStorage, not persistent), page slug, feature slug + start/complete, fortune domain, error CLASS (e.g.
 * "TypeError" — never the message or stack), language, device class, session-duration bucket, a coarse "days since
 * last visit" bucket. Never: images, face data, free text, names, URLs/query strings, IP (the Worker keeps only a
 * day-salted hash for same-day unique counts).
 *
 *   LQAnalytics.track(name, fields)          name: page_view | feature_used | reading_domain | studio_render_done | error | session_end
 *   LQAnalytics.feature("studio.render", "start" | "complete")
 *   LQAnalytics.domain("palm")
 *   LQAnalytics.renderDone()
 *   LQAnalytics.error(err)                   records err.name only
 *   LQAnalytics.consent() / setConsent(bool) / showBanner()
 * Other scripts may also dispatch: document.dispatchEvent(new CustomEvent("lensiq:track", {detail: {n: "feature_used", feature: "palm", step: "start"}}))
 */
(function (root) {
  "use strict";
  var doc = root.document;
  var KEY = "lq-analytics", LAST = "lq-a-last", SID = "lq-a-sid", RET = "lq-a-ret";
  // version of the consent text below; sent with every batch and logged by the Worker (backend constants.js CONSENT_VERSIONS)
  var CONSENT_VERSION = "a1";
  var FIELDS = {
    page: /^[a-z][a-z0-9-]{0,31}$/, feature: /^[a-z][a-z0-9_.-]{0,47}$/, err: /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/,
    domain: /^(face|palm|horoscope|tarot|siamsee|fengshui|numbers|iching|zodiac|astro|dream|bazi|taksa|lek7|lifegraph)$/,
    step: /^(start|complete)$/, lang: /^(th|en|zh)$/, device: /^(mobile|tablet|desktop)$/,
    dur: /^(lt10s|10-30s|30s-2m|2-10m|10m\+)$/, ret: /^(new|d1|d2-7|d8-30|d30\+)$/
  };
  var NAMES = /^(page_view|feature_used|reading_domain|studio_render_done|error|session_end)$/;
  // Same allowlists as the Worker (backend/src/constants.js — drift test in tests/unit/backend-site.test.js).
  // A value that is not listed is sent as "other": the Worker rejects unlisted values.
  var ALLOW = {
    page: ["about", "account", "astro", "attendance", "bazi", "booth", "camera-notice", "cameras", "checkout", "converter", "creative", "creative-suite", "customers", "dream", "driver", "faceread", "fengshui", "fortune", "help", "horoscope", "hr", "iching", "index", "insights", "interview", "lek7", "lifegraph", "neuro", "numbers", "palm", "photobooth", "pricing", "privacy", "qc", "retail", "signage", "store", "studio", "taksa", "tarot", "teamface", "terms", "zodiac", "other"],
    feature: ["fortune.reading", "fortune.ai", "fortune.local", "studio.render", "photobooth.capture", "photobooth.print", "booth.count", "store.count", "signage.play", "camera.start", "camera.denied", "attendance.checkin", "customers.lookup", "checkout.scan", "qc.inspect", "driver.alert", "neuro.session", "insights.view", "insights.export", "converter.convert", "creative.analyse", "creative.compare", "interview.session", "teamface.card", "pricing.view", "palm", "faceread", "tarot", "horoscope", "other"],
    err: ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError", "UnhandledRejection", "AbortError", "NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError", "SecurityError", "QuotaExceededError", "NetworkError", "TimeoutError", "InvalidStateError", "DataError", "OperationError", "UnknownError", "EncodingError", "NotSupportedError", "WebGLContextLost", "ModelLoadError", "CameraError", "other"]
  };
  var TEXT = {
    th: { msg: "ขอเก็บสถิติการใช้งานแบบไม่ระบุตัวตน (หน้าที่เปิด ฟีเจอร์ที่ใช้ ภาษา ชนิดอุปกรณ์) เพื่อปรับปรุงบริการ ไม่เก็บรูป ใบหน้า ข้อความ หรือที่อยู่ IP ข้อมูลประมวลผลบน Cloudflare (ต่างประเทศ) ลบข้อมูลดิบภายใน 90 วัน เปลี่ยนใจได้ทุกเมื่อ", yes: "ยอมรับ", no: "ไม่ยอมรับ", label: "การเก็บสถิติการใช้งาน" },
    en: { msg: "May we collect anonymous usage statistics (pages, features, language, device type) to improve the service? No photos, faces, text or IP addresses are stored. Processed on Cloudflare (outside Thailand); raw data deleted within 90 days. You can change your mind at any time.", yes: "Accept", no: "Decline", label: "Usage statistics" },
    zh: { msg: "是否允许收集匿名使用统计（页面、功能、语言、设备类型）以改进服务？不保存照片、人脸、文字或 IP 地址。数据在 Cloudflare（泰国境外）处理，原始数据 90 天内删除，可随时更改。", yes: "同意", no: "拒绝", label: "使用统计" }
  };

  /** @param {Storage|undefined} s @param {string} k */
  function sget(s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  /** @param {Storage|undefined} s @param {string} k @param {string|null} v */
  function sset(s, k, v) { try { if (s) { if (v == null) s.removeItem(k); else s.setItem(k, v); } } catch (e) { /* private mode */ } }
  var LS = (function () { try { return root.localStorage; } catch (e) { return undefined; } })();
  var SS = (function () { try { return root.sessionStorage; } catch (e) { return undefined; } })();

  function api() { return root.LQApi && root.LQApi.enabled() ? root.LQApi : null; }
  function dnt() {
    var n = /** @type {any} */ (root.navigator || {});
    return n.doNotTrack === "1" || /** @type {any} */ (root).doNotTrack === "1" || n.msDoNotTrack === "1" || n.globalPrivacyControl === true;
  }
  /** @returns {"yes"|"no"|null} */
  function consent() {
    var raw = sget(LS, KEY);
    try { var o = raw ? JSON.parse(raw) : null; return o && o.v === 1 && (o.cv || CONSENT_VERSION) === CONSENT_VERSION && (o.choice === "yes" || o.choice === "no") ? o.choice : null; } catch (e) { return null; }
  }
  function active() { return !!api() && !dnt() && consent() === "yes"; }

  function lang() {
    var l = String((doc && doc.documentElement.lang) || "th").toLowerCase();
    return l.indexOf("zh") === 0 ? "zh" : l.indexOf("en") === 0 ? "en" : "th";
  }
  function device() {
    var w = root.innerWidth || 1280;
    return w < 768 ? "mobile" : w < 1100 ? "tablet" : "desktop";
  }
  function page() {
    var p = String((root.location && root.location.pathname) || "").split("/").pop() || "index";
    p = p.replace(/\.html?$/i, "").toLowerCase();
    return ALLOW.page.indexOf(p) >= 0 ? p : "other";
  }
  function randHex(n) {
    var a = new Uint8Array(n);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function sid() {
    var s = sget(SS, SID);
    if (!s || !/^[a-f0-9]{32}$/.test(s) || /\d{5,}/.test(s)) {
      // the Worker rejects sids with a 6+ digit run: retry a few times, then break any run deterministically
      for (var tries = 0; tries < 8 && (!s || /\d{5,}/.test(s)); tries++) s = randHex(16);
      s = s.replace(/\d{5,}/g, function (r) { return r.replace(/(\d{4})(\d)/g, function (_, a, d) { return a + "abcdef".charAt(+d % 6); }); });
      sset(SS, SID, s);
    }
    return s;
  }
  var today = function () { return new Date().toISOString().slice(0, 10); };
  /** Coarse days-since-last-visit bucket, once per session; stored only with consent. */
  function retBucket() {
    if (sget(SS, RET)) return undefined;
    var last = sget(LS, LAST), t = today();
    sset(SS, RET, "1");
    sset(LS, LAST, t);
    if (!last || !/^\d{4}-\d{2}-\d{2}$/.test(last)) return "new";
    var d = Math.round((Date.parse(t) - Date.parse(last)) / 86400000);
    return d <= 1 ? "d1" : d <= 7 ? "d2-7" : d <= 30 ? "d8-30" : "d30+";
  }
  function durBucket(ms) {
    var s = ms / 1000;
    return s < 10 ? "lt10s" : s < 30 ? "10-30s" : s < 120 ? "30s-2m" : s < 600 ? "2-10m" : "10m+";
  }

  /** @type {Array<Record<string, string>>} */
  var queue = [];
  var timer = /** @type {any} */ (null);
  var started = Date.now();
  var errors = 0;

  /** @param {boolean} [useBeacon] */
  function flush(useBeacon) {
    if (timer) { clearTimeout(timer); timer = null; }
    var a = api();
    if (!queue.length || !a || !active()) { queue = []; return; }
    var events = queue.splice(0, 50);
    var body = { v: 1, consent: true, cv: CONSENT_VERSION, events: events };
    if (useBeacon) a.beacon("/v1/events", body);
    else a.postJSON("/v1/events", body, { timeoutMs: 8000 });
    if (queue.length) flush(useBeacon);
  }

  /** @param {string} name @param {Record<string, any>} [fields] */
  function track(name, fields) {
    if (!active() || !NAMES.test(String(name))) return false;
    /** @type {Record<string, string>} */
    var e = { n: String(name), sid: sid(), lang: lang(), device: device() };
    var f = fields || {};
    for (var k in f) {
      if (!Object.prototype.hasOwnProperty.call(FIELDS, k)) continue; // unknown keys are dropped, never sent
      var v = String(f[k]);
      if (!FIELDS[k].test(v)) continue;
      e[k] = /** @type {any} */ (ALLOW)[k] && /** @type {any} */ (ALLOW)[k].indexOf(v) < 0 ? "other" : v;
    }
    if (name === "page_view" && !e.page) e.page = page();
    queue.push(e);
    if (queue.length >= 20) flush(false);
    else if (!timer) timer = setTimeout(function () { flush(false); }, 10000);
    return true;
  }

  function pageView() {
    /** @type {Record<string, string>} */
    var f = { page: page() };
    var r = retBucket();
    if (r) f.ret = r;
    track("page_view", f);
  }

  /** @param {boolean} on */
  function setConsent(on) {
    sset(LS, KEY, JSON.stringify({ v: 1, cv: CONSENT_VERSION, choice: on ? "yes" : "no", at: today() }));
    if (!on) { queue = []; sset(LS, LAST, null); sset(SS, RET, null); sset(SS, SID, null); }
    hideBanner();
    if (on) { started = Date.now(); pageView(); }
  }

  var bannerEl = /** @type {HTMLElement|null} */ (null);
  function hideBanner() { if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl); bannerEl = null; }
  function showBanner() {
    if (!doc || !doc.body || !api() || dnt()) return null;
    hideBanner();
    var t = TEXT[lang()] || TEXT.th;
    var box = doc.createElement("div");
    box.setAttribute("role", "region");
    box.setAttribute("aria-label", t.label);
    box.setAttribute("data-lq-analytics-banner", "");
    box.setAttribute("data-i18n-skip", "");
    box.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:640px;margin:0 auto;padding:14px 16px;border-radius:14px;" +
      "background:#0e1430;color:#f4f6ff;box-shadow:0 8px 30px rgba(0,0,0,.35);font:14px/1.5 system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:10px;align-items:center";
    var p = doc.createElement("p");
    p.style.cssText = "margin:0;flex:1 1 280px;font-size:14px";
    p.textContent = t.msg;
    var btns = doc.createElement("div");
    btns.style.cssText = "display:flex;gap:8px;flex:0 0 auto";
    /** @param {string} label @param {boolean} on @param {boolean} primary */
    var mk = function (label, on, primary) {
      var b = doc.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "min-height:44px;min-width:88px;padding:0 16px;border-radius:10px;font:600 14px system-ui,sans-serif;cursor:pointer;border:1px solid #22d3ee;" +
        (primary ? "background:#22d3ee;color:#0e1430" : "background:transparent;color:#f4f6ff");
      b.addEventListener("click", function () { setConsent(on); });
      return b;
    };
    // equal prominence: declining is as easy as accepting (PDPA / consent best practice)
    btns.appendChild(mk(t.no, false, false));
    btns.appendChild(mk(t.yes, true, true));
    box.appendChild(p);
    box.appendChild(btns);
    doc.body.appendChild(box);
    bannerEl = box;
    return box;
  }

  function init() {
    if (!api() || dnt()) return;
    var c = consent();
    if (c === null) showBanner();
    else if (c === "yes") pageView();
    root.addEventListener("error", function (ev) {
      if (errors++ < 5) track("error", { err: (ev && ev.error && ev.error.name) || "Error" });
    });
    root.addEventListener("unhandledrejection", function (ev) {
      var r = ev && /** @type {any} */ (ev).reason;
      if (errors++ < 5) track("error", { err: (r && r.name) || "UnhandledRejection" });
    });
    root.addEventListener("pagehide", function () {
      track("session_end", { dur: durBucket(Date.now() - started) });
      flush(true);
    });
    if (doc) {
      doc.addEventListener("visibilitychange", function () { if (doc.visibilityState === "hidden") flush(true); });
      doc.addEventListener("lensiq:track", function (ev) {
        var d = /** @type {any} */ (ev).detail || {};
        track(d.n, d);
      });
    }
  }

  var LQAnalytics = {
    track: track,
    /** @param {string} name @param {"start"|"complete"} [step] */
    feature: function (name, step) { return track("feature_used", step ? { feature: name, step: step } : { feature: name }); },
    /** @param {string} d */
    domain: function (d) { return track("reading_domain", { domain: d }); },
    renderDone: function () { return track("studio_render_done", { page: page() }); },
    /** @param {any} err */
    error: function (err) { return track("error", { err: (err && err.name) || "Error" }); },
    consent: consent, setConsent: setConsent, showBanner: showBanner, active: active, flush: flush,
    _internal: { durBucket: durBucket, page: page, dnt: dnt }
  };
  root.LQAnalytics = LQAnalytics;
  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
