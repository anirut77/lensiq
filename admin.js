/* admin.js — LENSIQ back office (admin.html) talking to the API Worker (backend/src/index.js, /admin/api/*).
 *
 * Session: cookie mode (httpOnly __Host- cookie, credentials:"include", X-CSRF-Token on writes) when the page is served
 * from the API's own ORIGIN (recommended: the Worker serves admin.html at https://admin.<domain>, docs/BACKEND.md);
 * bearer mode (token kept in memory only — gone on reload) for any other origin. The mode is chosen automatically
 * (sessionMode); nothing on the page offers it. Developers only: localStorage "lq-admin-dev" = "1" lets ?session=cookie
 * or ?session=bearer override it and shows the API host in the header.
 * First run (no owner yet): setup code + username + password -> signs in -> 2-step verification (QR drawn on this
 * device by attendance-qr.js; the secret never goes into a URL) -> ten one-time recovery codes. Passwords and the setup
 * code are only ever sent to the Worker; nothing secret is written to storage or logged. The only thing kept in localStorage is
 * the trusted-device token (it exempts this browser from the login slow-down but never replaces the password/TOTP).
 * All server data is rendered with textContent (no innerHTML of server strings).
 */
(function () {
  "use strict";
  var $ = function (/** @type {string} */ id) { return /** @type {any} */ (document.getElementById(id)); };
  var API = /** @type {any} */ (window).LQApi;
  var state = { mode: "cookie", token: "", csrf: "", me: /** @type {any} */ (null) };
  /** Text in the current language: Thai is the default text given here; English / Chinese come from i18n/*-admin.js.
   *  @param {string} key @param {string} thai @param {Record<string, any>} [vars] */
  var G = function (key, thai, vars) {
    var I = /** @type {any} */ (window).LQI18N;
    return I && typeof I.tf === "function" ? I.tf(key, thai, vars) : thai.replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? String(vars[k]) : m; });
  };
  var gLang = function () { var I = /** @type {any} */ (window).LQI18N; return I && (I.lang === "en" || I.lang === "zh") ? I.lang : "th"; };

  /** @param {string} tag @param {Record<string, any>} [attrs] @param {...any} kids */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var a = attrs || {};
    for (var k in a) {
      if (k === "text") el.textContent = a[k];
      else if (k === "class") el.className = a[k];
      else if (a[k] !== false && a[k] != null) el.setAttribute(k, a[k] === true ? "" : String(a[k]));
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    }
    return el;
  }
  /** @param {string} t @param {boolean} [bad] */
  function msg(t, bad) { var m = $("adMsg"); m.textContent = t || ""; m.classList.toggle("ad-bad", !!bad); }
  var baht = function (/** @type {number|null} */ s) { return s == null ? "—" : (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var when = function (/** @type {number|null} */ t) { return t ? new Date(t * 1000).toLocaleString("th-TH") : "—"; };

  /** @param {string} path @param {{method?: string, body?: any, raw?: boolean, noReauth?: boolean}} [o] */
  function call(path, o) {
    var opt = o || {};
    if (!API || !API.enabled()) return Promise.reject(new Error("API not configured"));
    /** @type {Record<string, string>} */
    var headers = {};
    if (opt.body !== undefined) headers["Content-Type"] = "application/json";
    if (state.mode === "bearer" && state.token) headers.Authorization = "Bearer " + state.token;
    if (state.mode === "cookie" && state.csrf && opt.method && opt.method !== "GET") headers["X-CSRF-Token"] = state.csrf;
    if (path === "/login" && device.get()) headers["X-LQ-Device"] = device.get();
    return fetch(API.url("/admin/api" + path), {
      method: opt.method || "GET", headers: headers, credentials: state.mode === "cookie" ? "include" : "omit",
      body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined, cache: "no-store", referrerPolicy: "no-referrer"
    }).then(function (r) {
      if (opt.raw && r.ok) return r;
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = /** @type {any} */ (new Error(j.error || ("HTTP " + r.status))); e.status = r.status; e.code = j.code;
          e.retry = Number(r.headers.get("Retry-After")) || 0;
          // round 11: sensitive edits need a recent re-auth — ask once, open the 5-min window (POST /reauth), retry once
          if (j.code === "reauth_required" && !opt.noReauth && path !== "/reauth") {
            return askReauth().then(function (/** @type {any} */ cred) {
              if (!cred) throw e;
              return call("/reauth", { method: "POST", body: cred, noReauth: true }).then(function () {
                return call(path, Object.assign({}, opt, { noReauth: true }));
              });
            });
          }
          // round 12: money operations with live keys (or MONEY_REAUTH=inline) need the password IN this request
          if (j.code === "reauth_inline_required" && !opt.noReauth && opt.body && typeof opt.body === "object") {
            return askReauth().then(function (/** @type {any} */ cred) {
              if (!cred) throw e;
              return call(path, Object.assign({}, opt, { noReauth: true, body: Object.assign({}, opt.body, cred) }));
            });
          }
          throw e;
        }
        return j;
      });
    });
  }

  /** Password (+ TOTP when on) dialog for re-auth; resolves null when cancelled. Built in JS (no inline handlers). */
  function askReauth() {
    return new Promise(function (resolve) {
      var d = document.createElement("dialog");
      d.className = "ad-reauth";
      var f = document.createElement("form");
      f.method = "dialog";
      var p = document.createElement("p");
      p.textContent = G("adm.re.p", "ยืนยันรหัสผ่านอีกครั้งก่อนแก้ไขรายการสำคัญ (มีผล 5 นาที)");
      var pw = document.createElement("input");
      pw.type = "password"; pw.autocomplete = "current-password"; pw.required = true; pw.placeholder = G("adm.pw", "รหัสผ่าน");
      pw.setAttribute("aria-label", G("adm.pw", "รหัสผ่าน"));
      var tp = document.createElement("input");
      tp.inputMode = "numeric"; tp.autocomplete = "one-time-code"; tp.placeholder = G("adm.re.code", "รหัส 6 หลักจากแอปยืนยันตัวตน");
      tp.setAttribute("aria-label", G("adm.re.code", "รหัส 6 หลักจากแอปยืนยันตัวตน"));
      tp.hidden = !(state.me && state.me.totp_enabled);
      var ok = document.createElement("button"); ok.type = "submit"; ok.value = "ok"; ok.textContent = G("adm.re.ok", "ยืนยัน");
      var no = document.createElement("button"); no.type = "submit"; no.value = "cancel"; no.formNoValidate = true; no.textContent = G("adm.re.no", "ยกเลิก");
      f.append(p, pw, tp, ok, no);
      d.appendChild(f);
      document.body.appendChild(d);
      d.addEventListener("close", function () {
        var v = d.returnValue === "ok" && pw.value ? { password: pw.value, totp: tp.value || undefined } : null;
        d.remove();
        resolve(v);
      });
      if (typeof d.showModal === "function") d.showModal(); else resolve(null);
      pw.focus();
    });
  }

  /** Cookie mode only when the API is exactly this page's origin (no public-suffix guessing such as "co.th"). */
  function sameOrigin() {
    try { return new URL(API.base()).origin === location.origin; } catch (e) { return false; }
  }
  var DEV_KEY = "lq-admin-device";
  var device = {
    get: function () { try { return localStorage.getItem(DEV_KEY) || ""; } catch (e) { return ""; } },
    set: function (/** @type {string} */ v) { try { localStorage.setItem(DEV_KEY, v); } catch (e) { /* private mode */ } }
  };

  var SCREENS = ["adOffline", "adBoot", "adLogin", "adTwo", "adCodes", "adApp"];
  function show(/** @type {string} */ which) {
    SCREENS.forEach(function (id) { $(id).hidden = id !== which; });
    $("adLogout").hidden = which !== "adApp";
    amsg("");
    var first = $(which).querySelector("input:not([type=checkbox]), button.ad-wide");
    if (first && which !== "adApp") try { first.focus({ preventScroll: true }); } catch (e) { /* older browsers */ }
  }
  /** Message inside the visible sign-in / setup card (role=alert: read out, and next to the form, not below the page).
   *  @param {string} t @param {boolean} [bad] */
  function amsg(t, bad) {
    document.querySelectorAll("[data-auth-msg]").forEach(function (m) {
      var on = !!t && !(/** @type {HTMLElement} */ (m.closest("section"))).hidden;
      m.textContent = on ? t : ""; /** @type {HTMLElement} */ (m).hidden = !on; m.classList.toggle("ad-bad", on && !!bad);
    });
  }
  /** Owner-readable reason for a refused sign-in / setup request (never the server's English text or a status code). */
  function friendly(/** @type {any} */ e) {
    var mins = e && e.retry ? Math.max(1, Math.ceil(e.retry / 60)) : 0;
    switch (e && e.code) {
      case "invalid_token": return G("adm.e.token", "รหัสตั้งค่าครั้งแรกไม่ถูกต้อง ตรวจว่าคัดลอกมาครบทุกตัวและไม่มีช่องว่างเกิน");
      case "already_setup": return G("adm.e.done", "ระบบนี้มีบัญชีเจ้าของอยู่แล้ว กรุณาเข้าสู่ระบบ");
      case "setup_closed": return G("adm.e.closed", "การตั้งค่าครั้งแรกถูกปิดไว้ กรุณาติดต่อผู้ติดตั้งระบบเพื่อออกรหัสตั้งค่าใหม่");
      case "invalid_username": return G("adm.e.user", "ชื่อผู้ใช้ต้องยาว 3 ถึง 64 ตัว และใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข จุด ขีด ขีดล่าง หรือ @");
      case "weak_password": return G("adm.e.weak", "รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร และไม่ใช้ตัวอักษรซ้ำกันเกือบทั้งหมด");
      case "invalid_credentials": return G("adm.e.cred", "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      case "invalid_totp": return G("adm.e.code", "รหัส 6 หลักไม่ถูกต้องหรือหมดอายุแล้ว ดูรหัสล่าสุดในแอปแล้วลองอีกครั้ง");
      case "invalid_recovery": return G("adm.e.rec", "รหัสกู้คืนไม่ถูกต้อง หรือเคยใช้ไปแล้ว");
      case "reauth_failed": return G("adm.e.re", "รหัสผ่านหรือรหัสยืนยันไม่ถูกต้อง");
      case "reauth_revoked": return G("adm.e.revoked", "ระบบออกจากระบบให้แล้วเพราะยืนยันผิดหลายครั้ง กรุณาเข้าสู่ระบบใหม่");
      case "totp_unavailable": return G("adm.e.twoOff", "ยังเปิดการยืนยันตัวตนสองชั้นไม่ได้ กรุณาติดต่อผู้ติดตั้งระบบ");
      case "totp_already_on": return G("adm.e.twoOn", "การยืนยันตัวตนสองชั้นเปิดใช้อยู่แล้ว");
      case "too_many": case "admin_busy": case "reauth_rate_limited":
        return mins ? G("adm.e.many", "ลองหลายครั้งเกินไป กรุณารอประมาณ {n} นาทีแล้วลองใหม่", { n: mins }) : G("adm.e.many0", "ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่");
    }
    if (!e || !e.status) return G("adm.e.net", "เชื่อมต่อระบบไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง");
    return G("adm.e.other", "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  /** Disables a form's buttons while its request is running (no double submit). @param {any} f @param {boolean} on */
  function busy(f, on) { f.querySelectorAll("button").forEach(function (/** @type {HTMLButtonElement} */ b) { b.disabled = on; }); }

  function devFlag() { try { return localStorage.getItem("lq-admin-dev") === "1"; } catch (e) { return false; } }
  /** Cookie session when this page and the API share an origin, else an in-memory token. Chosen automatically. */
  function sessionMode() {
    var auto = sameOrigin() ? "cookie" : "bearer";
    if (!devFlag()) return auto;
    var m = null;
    try { m = new URLSearchParams(location.search).get("session"); } catch (e) { /* no override */ }
    return m === "cookie" || m === "bearer" ? m : auto;
  }

  /* ---------------- start ---------------- */
  // first: true while the first-run steps are on screen; pw: the password just typed, kept in memory only until the
  // 2-step setup request has been sent (that request needs it) and then dropped
  var flow = { first: false, pw: "", back: "" };
  function start() {
    if (!API || !API.enabled()) { show("adOffline"); return; }
    if (devFlag()) { $("adConn").textContent = API.base().replace(/^https?:\/\//, ""); $("adConn").hidden = false; }
    state.mode = sessionMode();
    call("/state").then(function (st) {
      if (!st.bootstrapped) { show("adBoot"); return; }
      // cookie mode: maybe still signed in (GET /me also rotates the CSRF token)
      if (state.mode === "cookie") return call("/me").then(enter, function () { show("adLogin"); });
      show("adLogin");
    }).catch(function (e) { show("adLogin"); amsg(friendly(e), true); });
  }

  function enter(/** @type {any} */ me) {
    state.me = me;
    if (me.csrf) state.csrf = me.csrf;
    flow.first = false; flow.pw = ""; flow.back = "";
    show("adApp");
    msg("");
    tab("analytics");
  }

  // show / hide what was typed (setup code, passwords)
  document.querySelectorAll(".ad-eye").forEach(function (b) {
    b.addEventListener("click", function () {
      var i = $(b.getAttribute("data-eye") || ""), showing = i.type === "text";
      i.type = showing ? "password" : "text";
      b.setAttribute("aria-pressed", String(!showing));
      b.textContent = showing ? G("adm.show", "แสดง") : G("adm.hide", "ซ่อน");
    });
  });
  function hideTyped() {
    document.querySelectorAll(".ad-eye").forEach(function (b) { $(b.getAttribute("data-eye") || "").type = "password"; b.textContent = G("adm.show", "แสดง"); b.removeAttribute("aria-pressed"); });
  }

  /** Signs in, then goes to the back office, or to the 2-step setup while that is still off.
   *  @param {string} username @param {string} password @param {{totp?: string, recovery?: string}} second */
  function signIn(username, password, second) {
    var body = { username: username, password: password, totp: second.totp || undefined, recovery: second.recovery || undefined, mode: state.mode };
    return call("/login", { method: "POST", body: body }).then(function (/** @type {any} */ r) {
      state.csrf = r.csrf || "";
      state.token = r.token || "";
      if (r.device) device.set(r.device);
      return call("/me").then(function (/** @type {any} */ me) {
        state.me = me;
        if (me.csrf) state.csrf = me.csrf;
        if (!me.totp_enabled) { flow.pw = password; startTwo(); return; }
        enter(me);
        if (r.recovery_left != null) msg(G("adm.rec.left", "เข้าสู่ระบบด้วยรหัสกู้คืนแล้ว เหลือรหัสที่ใช้ได้อีก {n} รหัส (สร้างชุดใหม่ได้ที่แท็บความปลอดภัย)", { n: r.recovery_left }));
      });
    });
  }

  $("adBootForm").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target);
    var token = String(f.token.value || "").trim(), username = String(f.username.value || "").trim(), pw = String(f.password.value || "");
    if (token.length < 32) { amsg(G("adm.v.token", "รหัสตั้งค่าครั้งแรกยาวอย่างน้อย 32 ตัว กรุณาวางรหัสให้ครบ"), true); f.token.focus(); return; }
    if (!/^[A-Za-z0-9._@-]{3,64}$/.test(username)) { amsg(friendly({ status: 400, code: "invalid_username" }), true); f.username.focus(); return; }
    if (pw.length < 12) { amsg(friendly({ status: 400, code: "weak_password" }), true); f.password.focus(); return; }
    if (pw !== f.password2.value) { amsg(G("adm.v.match", "รหัสผ่านสองช่องไม่ตรงกัน กรุณาพิมพ์ใหม่"), true); f.password2.focus(); return; }
    amsg(""); busy(f, true);
    call("/bootstrap", { method: "POST", body: { token: token, username: username, password: pw } }).then(function () {
      f.reset(); hideTyped();
      flow.first = true;
      // the account exists from here on: sign in with what was just typed and continue with step 2
      return signIn(username, pw, {}).catch(function () {
        flow.first = false; show("adLogin");
        amsg(G("adm.boot.made", "สร้างบัญชีแล้ว กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านที่ตั้งไว้"));
      });
    }, function (/** @type {any} */ e) {
      if (e && e.code === "already_setup") { f.reset(); hideTyped(); show("adLogin"); }
      amsg(friendly(e), true);
    }).then(function () { busy(f, false); });
  });

  var useRecovery = false;
  function swapSecond(/** @type {boolean} */ rec) {
    useRecovery = rec;
    $("adLoginCodeL").hidden = rec; $("adLoginRecL").hidden = !rec;
    $("adLoginSwap").textContent = rec ? G("adm.login.useCode", "ใช้รหัส 6 หลักจากแอปแทน") : G("adm.login.useRec", "ไม่มีโทรศัพท์อยู่กับตัว ใช้รหัสกู้คืนแทน");
    $("adLoginSwap").setAttribute("data-i18n", rec ? "adm.login.useCode" : "adm.login.useRec");
  }
  $("adLoginSwap").addEventListener("click", function () { swapSecond(!useRecovery); });

  $("adLoginForm").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target);
    var username = String(f.username.value || "").trim(), pw = String(f.password.value || "");
    var code = String(f.totp.value || "").replace(/\s/g, ""), rec = String(f.recovery.value || "").trim();
    if (!username || !pw) { amsg(G("adm.v.need", "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน"), true); return; }
    if (!useRecovery && code && !/^\d{6}$/.test(code)) { amsg(G("adm.v.code", "รหัสจากแอปเป็นตัวเลข 6 หลัก"), true); f.totp.focus(); return; }
    amsg(""); busy(f, true);
    signIn(username, pw, useRecovery ? { recovery: rec } : { totp: code }).then(function () { f.reset(); hideTyped(); swapSecond(false); },
      function (/** @type {any} */ e) { f.totp.value = ""; amsg(friendly(e), true); }).then(function () { busy(f, false); });
  });

  $("adLogout").addEventListener("click", function () {
    call("/logout", { method: "POST", body: {} }).catch(function () { /* already gone */ }).then(function () {
      state.token = ""; state.csrf = ""; state.me = null; show("adLogin"); amsg(G("adm.out", "ออกจากระบบแล้ว"));
    });
  });

  /* ---------------- 2-step verification + recovery codes ---------------- */
  function steps(/** @type {string} */ id) { var o = $(id).querySelector(".ad-steps"); if (o) o.hidden = !flow.first; }
  /** Asks the Worker for a new authenticator secret (needs the password once) and shows it as a QR code + text. */
  function startTwo() {
    var pw = flow.pw; flow.pw = "";
    show("adTwo"); steps("adTwo");
    $("adTwoSkip").hidden = flow.first; twoFailed = false;
    $("adTwoQr").textContent = ""; $("adTwoKey").textContent = ""; $("adTwoForm").reset();
    call("/totp/setup", { method: "POST", body: { password: pw }, noReauth: true }).then(function (/** @type {any} */ r) {
      var QR = /** @type {any} */ (window).LQQR;
      try {
        // drawn on this device: the secret is not sent anywhere to make the picture
        var img = h("img", { alt: G("adm.two.qrAlt", "คิวอาร์โค้ดสำหรับแอปยืนยันตัวตน"), width: 220, height: 220 });
        img.setAttribute("src", "data:image/svg+xml;charset=utf-8," + encodeURIComponent(QR.svg(r.uri, { scale: 6 })));
        $("adTwoQr").appendChild(img);
      } catch (e) { $("adTwoQr").textContent = G("adm.two.noQr", "แสดงคิวอาร์โค้ดไม่ได้ กรุณาพิมพ์รหัสตั้งค่าด้านล่างลงในแอป"); }
      $("adTwoKey").textContent = String(r.secret).replace(/(.{4})/g, "$1 ").trim();
      $("adTwoKey").setAttribute("data-raw", r.secret);
    }, function (/** @type {any} */ e) {
      // no dead end: the account exists, so the owner can always go on and turn 2-step verification on later
      $("adTwoSkip").hidden = false; twoFailed = true;
      amsg(friendly(e), true);
    });
  }
  var twoFailed = false;
  function leaveTwo() {
    $("adTwoQr").textContent = ""; $("adTwoKey").textContent = ""; $("adTwoKey").removeAttribute("data-raw");
  }
  /** @param {string} text */
  function copyText(text) {
    var n = /** @type {any} */ (navigator);
    var p = n.clipboard && n.clipboard.writeText ? n.clipboard.writeText(text) : Promise.reject(new Error("no clipboard"));
    return p.then(function () { amsg(G("adm.copied", "คัดลอกแล้ว")); }, function () { amsg(G("adm.copyNo", "คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกเอง"), true); });
  }
  $("adTwoCopy").addEventListener("click", function () { copyText($("adTwoKey").getAttribute("data-raw") || ""); });
  $("adTwoSkip").addEventListener("click", function () { leaveTwo(); call("/me").then(enter, function () { show("adLogin"); }); });
  $("adTwoForm").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target), code = String(f.code.value || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) { amsg(G("adm.v.code", "รหัสจากแอปเป็นตัวเลข 6 หลัก"), true); f.code.focus(); return; }
    amsg(""); busy(f, true);
    call("/totp/enable", { method: "POST", body: { code: code } }).then(function (/** @type {any} */ r) {
      leaveTwo(); f.reset();
      showCodes(r.recovery_codes || []);
    }, function (/** @type {any} */ e) { f.code.value = ""; amsg(friendly(e), true); }).then(function () { busy(f, false); $("adTwoSkip").hidden = flow.first && !twoFailed; });
  });

  var codesShown = /** @type {string[]} */ ([]);
  /** The ten one-time codes, shown once. Kept in memory only while this screen is open. @param {string[]} codes */
  function showCodes(codes) {
    codesShown = codes.slice();
    show("adCodes"); steps("adCodes");
    var ol = $("adCodesList"); ol.textContent = "";
    codes.forEach(function (c) { ol.appendChild(h("li", { text: c })); });
    $("adCodesOk").checked = false; $("adCodesDone").disabled = true;
  }
  var codesText = function () { return "LENSIQ " + G("adm.codes.file", "รหัสกู้คืน (ใช้ได้รหัสละหนึ่งครั้ง)") + "\n\n" + codesShown.join("\n") + "\n"; };
  $("adCodesOk").addEventListener("change", function () { $("adCodesDone").disabled = !$("adCodesOk").checked; });
  $("adCodesCopy").addEventListener("click", function () { copyText(codesShown.join("\n")); });
  $("adCodesSave").addEventListener("click", function () {
    var url = URL.createObjectURL(new Blob([codesText()], { type: "text/plain;charset=utf-8" }));
    var a = h("a", { href: url, download: "lensiq-recovery-codes.txt" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  $("adCodesDone").addEventListener("click", function () {
    var back = flow.back;
    codesShown = []; $("adCodesList").textContent = "";
    call("/me").then(function (/** @type {any} */ me) { enter(me); if (back) tab(back); }, function () { show("adLogin"); });
  });

  /* ---------------- tabs ---------------- */
  var loaders = /** @type {Record<string, () => void>} */ ({});
  function tab(/** @type {string} */ name) {
    document.querySelectorAll(".ad-tabs [role=tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === name)); });
    document.querySelectorAll(".ad-panel").forEach(function (p) { /** @type {HTMLElement} */ (p).hidden = p.getAttribute("data-panel") !== name; });
    if (loaders[name] && !$("adApp").hidden) loaders[name]();
  }
  document.querySelectorAll(".ad-tabs [role=tab]").forEach(function (b) { b.addEventListener("click", function () { tab(String(b.getAttribute("data-tab"))); }); });
  var fail = function (/** @type {any} */ e) { if (e && e.status === 401) { show("adLogin"); msg("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", true); } else msg(e.message, true); };

  /** @param {string[]} heads @param {any[][]} rows */
  function table(heads, rows) {
    var t = h("table", { class: "ad-table" });
    t.appendChild(h("thead", null, h("tr", null, ...heads.map(function (x) { return h("th", { scope: "col", text: x }); }))));
    var tb = h("tbody");
    if (!rows.length) tb.appendChild(h("tr", null, h("td", { colspan: heads.length, class: "ad-muted", text: "ไม่มีข้อมูล" })));
    rows.forEach(function (r) { tb.appendChild(h("tr", null, ...r.map(function (c) { return h("td", { text: c == null ? "—" : String(c) }); }))); });
    t.appendChild(tb);
    return h("div", { class: "ad-scroll" }, t);
  }

  /* ---------------- analytics ---------------- */
  function rangeQs() {
    var f = /** @type {HTMLFormElement} */ ($("adRange"));
    var q = new URLSearchParams();
    if (f.from.value) q.set("from", f.from.value);
    if (f.to.value) q.set("to", f.to.value);
    return q.toString();
  }
  /** Single-series bar chart (sessions per day): rounded data ends, hover tooltip via <title>, table view below. */
  function chart(/** @type {any[]} */ days) {
    var W = 720, H = 200, P = { l: 36, r: 8, t: 10, b: 22 };
    var max = Math.max(1, ...days.map(function (d) { return d.sessions; }));
    var bw = (W - P.l - P.r) / days.length;
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "เซสชันรายวัน " + days.length + " วัน สูงสุด " + max);
    svg.setAttribute("class", "ad-svg");
    /** @param {string} tag @param {Record<string, any>} at */
    var s = function (tag, at) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, String(at[k])); svg.appendChild(e); return e; };
    [0, 0.5, 1].forEach(function (f) {
      var y = P.t + (H - P.t - P.b) * (1 - f);
      s("line", { x1: P.l, x2: W - P.r, y1: y, y2: y, class: "ad-grid-line" });
      s("text", { x: P.l - 6, y: y + 4, "text-anchor": "end", class: "ad-axis" }).textContent = String(Math.round(max * f));
    });
    days.forEach(function (d, i) {
      var hgt = (H - P.t - P.b) * d.sessions / max;
      var x = P.l + i * bw + 1, w = Math.max(1, bw - 2), y = H - P.b - hgt;
      var g = document.createElementNS(NS, "g");
      svg.appendChild(g);
      var hit = document.createElementNS(NS, "rect"); // hit target bigger than the mark
      [["x", P.l + i * bw], ["y", P.t], ["width", bw], ["height", H - P.t - P.b], ["fill", "transparent"]].forEach(function (kv) { hit.setAttribute(String(kv[0]), String(kv[1])); });
      g.appendChild(hit);
      if (hgt > 0) {
        var r = Math.min(4, w / 2, hgt);
        var path = document.createElementNS(NS, "path");
        path.setAttribute("d", "M" + x + "," + (H - P.b) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (H - P.b) + "Z");
        path.setAttribute("class", "ad-bar");
        g.appendChild(path);
      }
      var tt = document.createElementNS(NS, "title");
      tt.textContent = d.day + ": " + d.sessions + " เซสชัน, " + d.visitors + " ผู้เข้าชม (ไม่ซ้ำในวัน)";
      g.appendChild(tt);
      if (i === 0 || i === days.length - 1 || (days.length > 10 && i % Math.ceil(days.length / 6) === 0)) {
        s("text", { x: x + w / 2, y: H - 6, "text-anchor": "middle", class: "ad-axis" }).textContent = d.day.slice(5);
      }
    });
    return svg;
  }
  loaders.analytics = function () {
    call("/analytics/summary?" + rangeQs()).then(function (/** @type {any} */ s) {
      var f = /** @type {HTMLFormElement} */ ($("adRange"));
      f.from.value = s.from; f.to.value = s.to;
      var k = $("adKpis");
      k.textContent = "";
      s.funnel = s.funnel || { visit: 0, start: 0, complete: 0 }; s.funnel_by_feature = s.funnel_by_feature || []; s.totals = s.totals || {}; s.retention = s.retention || {};
      var conv = s.funnel.start ? Math.round(s.funnel.complete / s.funnel.start * 100) + "%" : "—";
      [["เซสชันทั้งหมด", s.totals.sessions], ["เฉลี่ยต่อวัน", s.dau_avg], ["เซสชัน 7 วันล่าสุด", s.weekly_active_sessions],
        ["เริ่ม → สำเร็จ", conv], ["ผู้กลับมาใช้", s.retention.returning_share == null ? "—" : Math.round(s.retention.returning_share * 100) + "%"]]
        .forEach(function (x) { k.appendChild(h("div", { class: "ad-kpi" }, h("span", { class: "ad-kpi-v", text: String(x[1]) }), h("span", { class: "ad-kpi-l", text: String(x[0]) }))); });
      var c = $("adChart"); c.textContent = ""; c.appendChild(chart(s.days));
      var t = $("adTables"); t.textContent = "";
      var kv = function (/** @type {any[]} */ a) { return a.map(function (x) { return [x.key || "(ว่าง)", x.n]; }); };
      var blocks = [
        ["หน้า (page views)", ["หน้า", "ครั้ง"], kv(s.pages)],
        ["ฟีเจอร์", ["ฟีเจอร์", "ครั้ง"], kv(s.features)],
        ["ศาสตร์ดูดวง", ["ศาสตร์", "ครั้ง"], kv(s.domains)],
        ["Funnel", ["ขั้น", "เซสชัน"], [["เข้าชม", s.funnel.visit], ["เริ่มใช้ฟีเจอร์", s.funnel.start], ["ทำสำเร็จ", s.funnel.complete]]],
        ["Funnel ต่อฟีเจอร์", ["ฟีเจอร์", "เริ่ม", "สำเร็จ"], s.funnel_by_feature.map(function (x) { return [x.feature, x.start, x.complete]; })],
        ["ภาษา (เซสชัน)", ["ภาษา", "เซสชัน"], kv(s.lang)],
        ["อุปกรณ์ (เซสชัน)", ["อุปกรณ์", "เซสชัน"], kv(s.device)],
        ["ข้อผิดพลาด", ["ชนิด", "ครั้ง"], kv(s.errors)],
        ["ระยะเวลาเซสชัน", ["ช่วง", "ครั้ง"], kv(s.duration)],
        ["การกลับมา (ห่างจากครั้งก่อน)", ["ช่วง", "เซสชัน"], kv(s.retention.buckets)],
        ["รายวัน (ตารางของกราฟ)", ["วัน", "เซสชัน", "ผู้เข้าชม", "เหตุการณ์"], s.days.map(function (d) { return [d.day, d.sessions, d.visitors, d.events]; })]
      ];
      blocks.forEach(function (b) { t.appendChild(h("section", { class: "ad-card" }, h("h3", { text: String(b[0]) }), table(/** @type {string[]} */ (b[1]), /** @type {any[][]} */ (b[2])))); });
      $("adNotes").textContent = s.notes.join(" · ");
    }, fail);
  };
  $("adRange").addEventListener("submit", function (/** @type {Event} */ ev) { ev.preventDefault(); loaders.analytics(); });
  $("adCsv").addEventListener("click", function () {
    call("/analytics/csv?" + rangeQs(), { raw: true }).then(function (/** @type {Response} */ r) { return r.blob(); }).then(function (/** @type {Blob} */ b) {
      var a = h("a", { href: URL.createObjectURL(b), download: "lensiq-analytics.csv" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.getAttribute("href") || ""); }, 5000);
    }, fail);
  });

  /* ---------------- AI ---------------- */
  loaders.ai = function () {
    call("/ai").then(function (/** @type {any} */ r) {
      var f = /** @type {any} */ ($("adAiForm"));
      var s = r.settings;
      f.enabled.checked = !!s.enabled; f.provider.value = s.provider; f.model.value = s.model;
      f.effort.textContent = "";
      r.efforts.forEach(function (/** @type {string} */ e) { f.effort.appendChild(h("option", { value: e, text: e, selected: e === s.effort })); });
      f.max_tokens.value = s.max_tokens; f.temperature.value = s.temperature == null ? "" : s.temperature;
      f.rpm.value = s.rpm; f.daily_max.value = s.daily_max; f.per_caller_daily.value = s.per_caller_daily; f.global_rpm.value = s.global_rpm;
      var box = $("adDomains"); box.textContent = "";
      Object.keys(s.domains).forEach(function (d) { box.appendChild(h("label", null, h("input", { type: "checkbox", name: "d_" + d, checked: !!s.domains[d] }), " " + d)); });
      var tsn = $("adTsNotice"), t = r.turnstile || {};
      tsn.hidden = !!t.configured;
      tsn.textContent = t.configured ? "" : "⚠ ระบบกันบอทยังไม่ได้ตั้งค่า ผู้ช่วยเขียน AI จะปฏิเสธทุกคำขอจนกว่าผู้ติดตั้งระบบจะตั้งให้เสร็จ" +
        (t.local_dev_bypass ? " · โหมดทดสอบในเครื่องเปิดอยู่: ยกเว้นเฉพาะคำขอจากเครื่องนักพัฒนา" : "");
      var k = r.key;
      var srcText = { worker_secret: "ตั้งไว้บนเซิร์ฟเวอร์ตอนติดตั้ง (แนะนำ)", admin_encrypted: "เก็บแบบเข้ารหัสจากหน้านี้", none: "ยังไม่มีคีย์ AI ปิดอยู่" };
      $("adKeyStatus").textContent = "ที่มาของคีย์: " + (srcText[/** @type {"worker_secret"|"admin_encrypted"|"none"} */ (k.source)] || k.source) +
        (k.stored_encrypted ? " · คีย์เข้ารหัสอัปเดต " + when(k.stored_updated_at) + (k.stored_readable ? "" : " (อ่านไม่ได้แล้ว กรุณาตั้งใหม่)") : "") +
        " · การเข้ารหัสบนเซิร์ฟเวอร์: " + (k.kek_configured && !k.kek_error ? "พร้อม" : "ยังไม่พร้อม (ติดต่อผู้ติดตั้งระบบ)");
      // round 17: a stored key the gateway does not read (legacyKeyStore off) — TH / EN / ZH via i18n/*-admin.js
      var lk = $("adKeyLegacy");
      lk.hidden = !r.legacy_key_unused;
      lk.textContent = r.legacy_key_unused
        ? G("adg.legacyUnused", "มีคีย์ Anthropic ที่เก็บแบบเข้ารหัสไว้จากแท็บนี้ แต่ไม่ได้ใช้ ตั้งคีย์ในการ์ด \"คีย์ของผู้ให้บริการ AI\" " +
          "ของแท็บ AI Gateway แทน หรือเปิดสวิตช์อ่านคีย์แบบเดิมในแท็บนั้น")
        : "";
    }, fail);
  };
  $("adAiForm").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target);
    /** @type {Record<string, boolean>} */
    var domains = {};
    f.querySelectorAll("input[name^=d_]").forEach(function (/** @type {HTMLInputElement} */ i) { domains[i.name.slice(2)] = i.checked; });
    var body = {
      enabled: f.enabled.checked, provider: f.provider.value, model: f.model.value.trim(), effort: f.effort.value,
      max_tokens: parseInt(f.max_tokens.value, 10), temperature: f.temperature.value === "" ? null : Number(f.temperature.value),
      rpm: parseInt(f.rpm.value, 10), daily_max: parseInt(f.daily_max.value, 10),
      per_caller_daily: parseInt(f.per_caller_daily.value, 10), global_rpm: parseInt(f.global_rpm.value, 10), domains: domains
    };
    call("/ai", { method: "PUT", body: body }).then(function () { msg("บันทึกการตั้งค่า AI แล้ว"); }, fail);
  });
  $("adKeyForm").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target);
    var key = f.key.value;
    f.reset(); // never keep the key in the DOM
    call("/ai/key", { method: "PUT", body: { key: key } }).then(function () { msg("บันทึกคีย์แบบเข้ารหัสแล้ว"); loaders.ai(); }, fail);
  });
  $("adKeyDel").addEventListener("click", function () {
    if (!confirm("ลบคีย์ที่เก็บแบบเข้ารหัส?")) return;
    call("/ai/key", { method: "DELETE" }).then(function () { msg("ลบคีย์แล้ว"); loaders.ai(); }, fail);
  });

  /* ---------------- AI Gateway (round 17 P5; backend/src/ai/, docs/AI-GATEWAY.md) ----------------
   * Global switch, legacy key store switch, provider allowlist (key set / not set only), per-feature switch, ordered
   * chain editor, budget and limits, monthly usage. Saving needs re-auth (call() asks for the password once). Thai is the
   * default text; English / Chinese come from i18n/en-admin.js / i18n/zh-admin.js (keys adg.*). */
  var gw = /** @type {any} */ ({ data: null, usage: null, keys: null });
  var NUM_FIELDS = [
    ["timeoutMs", "adg.f.timeout", "เวลารอต่อครั้ง (มิลลิวินาที)", 1000, 120000, 1000],
    ["monthlyBudgetUsd", "adg.f.budget", "งบประมาณต่อเดือน (USD) — 0 = ไม่ให้ทำงาน", 0, 100000, 0.01],
    ["perUserDaily", "adg.f.pud", "ต่อผู้ใช้ต่อวัน", 0, 10000, 1],
    ["perUserPerMinute", "adg.f.pum", "ต่อผู้ใช้ต่อนาที", 0, 600, 1],
    ["globalPerMinute", "adg.f.gpm", "รวมทุกคนต่อนาที", 1, 10000, 1],
    ["maxOutputTokens", "adg.f.maxout", "โทเค็นคำตอบสูงสุด", 64, 8192, 1]
  ];
  function chainRow(/** @type {any} */ e, /** @type {HTMLElement} */ list) {
    var d = gw.data;
    var row = h("div", { class: "ad-row adg-chain" });
    var ps = h("select", { "aria-label": G("adg.chain.provider", "ผู้ให้บริการ"), class: "adg-p" });
    d.providers.forEach(function (/** @type {any} */ p) { ps.appendChild(h("option", { value: p.id, text: p.name[gLang()] || p.id, selected: p.id === e.provider })); });
    var listId = "adgM" + Math.random().toString(36).slice(2, 8);
    var mi = h("input", { class: "adg-m", value: e.model || "", list: listId, "aria-label": G("adg.chain.model", "โมเดล"), autocomplete: "off", spellcheck: "false" });
    var dl = h("datalist", { id: listId });
    var fillModels = function () {
      dl.textContent = "";
      var p = d.providers.find(function (/** @type {any} */ x) { return x.id === ps.value; });
      ((p && p.models) || []).forEach(function (/** @type {string} */ m) { dl.appendChild(h("option", { value: m })); });
    };
    fillModels(); ps.addEventListener("change", fillModels);
    var es = h("select", { class: "adg-e", "aria-label": "Effort" });
    es.appendChild(h("option", { value: "", text: "—" }));
    d.efforts.forEach(function (/** @type {string} */ x) { es.appendChild(h("option", { value: x, text: x, selected: x === e.effort })); });
    var up = h("button", { type: "button", class: "ad-btn ad-ghost", "aria-label": G("adg.chain.up", "เลื่อนขึ้น"), text: "↑" });
    var down = h("button", { type: "button", class: "ad-btn ad-ghost", "aria-label": G("adg.chain.down", "เลื่อนลง"), text: "↓" });
    var del = h("button", { type: "button", class: "ad-btn ad-ghost", "aria-label": G("adg.chain.del", "ลบแถวนี้"), text: "✕" });
    up.addEventListener("click", function () { if (row.previousElementSibling) list.insertBefore(row, row.previousElementSibling); });
    down.addEventListener("click", function () { if (row.nextElementSibling) list.insertBefore(row.nextElementSibling, row); });
    del.addEventListener("click", function () { row.remove(); });
    row.append(ps, mi, dl, es, up, down, del);
    list.appendChild(row);
  }
  function featureCard(/** @type {any} */ meta, /** @type {any} */ f) {
    var card = h("div", { class: "ad-card adg-feature", "data-feature": meta.id });
    card.appendChild(h("h3", null, (meta.label[gLang()] || meta.id) + " ", h("code", { text: meta.id })));
    var status = meta.status === "live" ? G("adg.st.live", "สถานะ: ใช้งานจริง")
      : G("adg.st.planned", "สถานะ: วางแผน (ยังไม่มีหน้าใช้งาน ตั้งค่าไว้ล่วงหน้าได้)");
    card.appendChild(h("p", { class: "ad-muted", text: status }));
    if (meta.legacy) {
      card.appendChild(h("p", { class: "ad-muted", text: G("adg.legacyNote",
        "ฟีเจอร์เดิมของคำทำนาย: สวิตช์ โมเดล effort และขีดจำกัดต่อผู้ใช้ใช้ค่าชุดเดียวกับแท็บ \"ตั้งค่า AI\" แถวแรกต้องเป็น Anthropic งบประมาณว่าง = ไม่จำกัด (เหมือนเดิม)") }));
    }
    card.appendChild(h("label", { class: "ad-inline" }, h("input", { type: "checkbox", class: "adg-on", checked: !!f.enabled }), " " + G("adg.f.on", "เปิดฟีเจอร์นี้")));
    card.appendChild(h("p", { class: "ad-muted", text: G("adg.chain.h", "ลำดับผู้ให้บริการ (บนสุดใช้ก่อน ถ้าล้มเหลวจะใช้แถวถัดไปตามนโยบาย)") }));
    var list = h("div", { class: "adg-list" });
    (f.chain || []).forEach(function (/** @type {any} */ e) { chainRow(e, list); });
    card.appendChild(list);
    var add = h("button", { type: "button", class: "ad-btn ad-ghost", text: G("adg.chain.add", "+ เพิ่มผู้ให้บริการ") });
    add.addEventListener("click", function () { chainRow({ provider: gw.data.providers[0].id, model: "" }, list); });
    card.appendChild(add);
    var form = h("div", { class: "ad-form adg-nums" });
    NUM_FIELDS.forEach(function (x) {
      var v = f[String(x[0])];
      var ph = meta.legacy && x[0] === "monthlyBudgetUsd" ? G("adg.f.nobudget", "ว่าง = ไม่จำกัด") : "";
      var inp = h("input", { type: "number", name: x[0], min: x[3], max: x[4], step: x[5], value: v == null ? "" : v, placeholder: ph });
      form.appendChild(h("label", null, G(String(x[1]), String(x[2])), inp));
    });
    if (meta.imageCapable) {
      form.appendChild(h("label", { class: "ad-inline" }, h("input", { type: "checkbox", class: "adg-img", checked: !!f.imageModeAllowed }),
        " " + G("adg.f.image", "อนุญาตโหมดภาพ (ผู้ใช้ต้องยินยอมเองอีกครั้ง ค่าเริ่มต้น: ข้อความเท่านั้น)")));
    }
    card.appendChild(form);
    return card;
  }
  function renderGateway() {
    var d = gw.data;
    if (!d) return;
    var s = d.settings;
    $("adgOn").checked = !!s.enabled;
    $("adgLegacy").checked = !!s.legacyKeyStore;
    $("adgEval").textContent = s.last_eval || G("adg.eval.none", "ยังไม่เคยประเมิน (ทำในขั้น P8)");
    var pv = $("adgProv"); pv.textContent = "";
    var boxes = h("div", { class: "ad-checks adg-prov" });
    d.providers.forEach(function (/** @type {any} */ p) {
      boxes.appendChild(h("label", { title: p.region[gLang()] }, h("input", { type: "checkbox", "data-provider": p.id, checked: s.providers[p.id] !== false }),
        " " + (p.name[gLang()] || p.id) + " · " + (p.key_set ? G("adg.key.set", "คีย์: ตั้งแล้ว") : G("adg.key.unset", "คีย์: ยังไม่ตั้ง")) +
        (p.implemented ? "" : " · " + G("adg.notImpl", "ยังไม่มีตัวเชื่อม (P6)")) +
        (p.config_names || []).map(function (/** @type {string} */ n) {
          var st = (p.config_state || {})[n] || (p.config_set ? "set" : "missing");
          if (st === "set") return "";
          return " · " + n + " " + (st === "invalid" ? G("adg.cfg.invalid", "รูปแบบไม่ถูกต้อง (ผู้ให้บริการนี้จะไม่ถูกใช้)")
            : G("adg.cfg.unset", "ยังไม่ตั้ง (ผู้ให้บริการนี้จะไม่ถูกใช้)"));
        }).join("")));
    });
    pv.appendChild(boxes);
    var notes = d.providers.filter(function (/** @type {any} */ p) { return p.note; });
    if (notes.length) {
      pv.appendChild(h("p", { class: "ad-muted", text: G("adg.notes.h", "หมายเหตุของผู้ให้บริการ") }));
      var ul = h("ul", { class: "ad-muted adg-notes" });
      notes.forEach(function (/** @type {any} */ p) { ul.appendChild(h("li", { text: (p.name[gLang()] || p.id) + ": " + (p.note[gLang()] || p.note.th) })); });
      // a deployment that pins serving providers: only these models can be used, every other model is refused
      d.providers.filter(function (/** @type {any} */ p) { return p.usable_models && p.usable_models.length; }).forEach(function (/** @type {any} */ p) {
        ul.appendChild(h("li", { class: "adg-pin", text: (p.name[gLang()] || p.id) + ": " +
          G("adg.pin.only", "การติดตั้งนี้ตรึงผู้ให้บริการปลายทางไว้ ใช้ได้เฉพาะโมเดลต่อไปนี้ โมเดลอื่นจะถูกปฏิเสธจนกว่าจะเพิ่มการตรึงในโค้ด:") + " " + p.usable_models.join(", ") }));
      });
      pv.appendChild(ul);
    }
    pv.appendChild(table([G("adg.t.provider", "ผู้ให้บริการ"), G("adk.t.source", "คีย์ที่ใช้อยู่"), G("adg.t.region", "ประมวลผลที่")],
      d.providers.map(function (/** @type {any} */ p) { return [p.name[gLang()] || p.id, keySourceText(p.key_source, p.key_last4), p.region[gLang()]]; })));
    renderKeys();
    var fx = $("adgFeatures"); fx.textContent = "";
    d.features.forEach(function (/** @type {any} */ m) { fx.appendChild(featureCard(m, s.features[m.id] || {})); });
    var u = gw.usage, ub = $("adgUsage"); ub.textContent = "";
    if (u) {
      ub.appendChild(h("p", { class: "ad-muted", text: G("adg.u.month", "เดือน") + " " + u.month }));
      ub.appendChild(table([G("adg.u.feature", "ฟีเจอร์"), G("adg.u.req", "คำขอ"), G("adg.u.ok", "สำเร็จ"), G("adg.u.fb", "ใช้ผลในเครื่อง"),
        G("adg.u.calls", "เรียกผู้ให้บริการ"), G("adg.u.cost", "ค่าใช้จ่าย (USD)"), G("adg.u.budget", "งบที่ใช้ / งบ"), "p50", "p95"],
        u.features.map(function (/** @type {any} */ r) {
          return [r.feature, r.requests, r.ok, r.fallbacks, r.calls, r.cost_usd.toFixed(4), r.budget_used_usd.toFixed(4) + " / " + (r.budget_usd == null ? "∞" : r.budget_usd),
            r.p50_ms == null ? "—" : "≤ " + r.p50_ms + " ms", r.p95_ms == null ? "—" : "≤ " + r.p95_ms + " ms"];
        })));
      var pc = u.providers_cost_usd || {}, names = /** @type {Record<string, string>} */ ({});
      ((gw.data && gw.data.providers) || []).forEach(function (/** @type {any} */ p) { names[p.id] = p.name[gLang()] || p.id; });
      ub.appendChild(h("h3", { text: G("adk.cost.h", "ค่าใช้จ่ายต่อผู้ให้บริการ (USD)") }));
      ub.appendChild(Object.keys(pc).length
        ? table([G("adg.t.provider", "ผู้ให้บริการ"), G("adg.u.cost", "ค่าใช้จ่าย (USD)")], Object.keys(pc).map(function (k) { return [names[k] || k, pc[k].toFixed(4)]; }))
        : h("p", { class: "ad-muted", text: G("adk.cost.none", "ยังไม่มีค่าใช้จ่ายในเดือนนี้") }));
    }
  }
  loaders.aigw = function () {
    Promise.all([call("/ai/gateway"), call("/ai/usage"), call("/ai/keys")]).then(function (/** @type {any[]} */ r) {
      gw.data = r[0]; gw.usage = r[1]; gw.keys = r[2].keys; renderGateway();
    }, fail);
  };

  /* ---------------- AI provider keys (write-only; last 4 characters only) ---------------- */
  /** @param {string} source @param {string|null} last4 */
  function keySourceText(source, last4) {
    if (source === "panel") return G("adk.src.panel", "ตั้งในแผงนี้ (ลงท้าย {l})", { l: last4 || "" });
    if (source === "server") return G("adk.src.server", "ตั้งไว้บนเซิร์ฟเวอร์ตอนติดตั้ง");
    return G("adk.src.none", "ยังไม่มีคีย์ ผู้ให้บริการนี้จะไม่ถูกใช้");
  }
  function renderKeys() {
    var box = $("adkList"); box.textContent = "";
    // a key set in the panel that can no longer be read: the server key (if any) is used instead; say so loudly
    var bad = (gw.keys || []).filter(function (/** @type {any} */ k) { return k.unreadable; });
    if (bad.length) box.appendChild(h("p", { class: "ad-warn", role: "alert",
      text: G("adk.warn.unreadable", "คีย์ที่ตั้งในแผงนี้อ่านไม่ได้ {n} รายการ ระบบจะใช้คีย์บนเซิร์ฟเวอร์แทนถ้ามี กรุณาตั้งคีย์ใหม่", { n: bad.length }) }));
    var names = /** @type {Record<string, string>} */ ({});
    ((gw.data && gw.data.providers) || []).forEach(function (/** @type {any} */ p) { names[p.id] = p.name[gLang()] || p.id; });
    (gw.keys || []).forEach(function (/** @type {any} */ k) {
      var st = keySourceText(k.source, k.last4);
      if (k.unreadable) st = G("adk.src.unreadable", "คีย์ที่ตั้งในแผง (ลงท้าย {l}) อ่านไม่ได้ จึงไม่ถูกใช้ กรุณาตั้งใหม่", { l: k.last4 || "" });
      else if (k.panel_set && k.server_set) st += " · " + G("adk.src.both", "ใช้แทนคีย์บนเซิร์ฟเวอร์");
      var test = k.checked_at ? (k.check_ok ? G("adk.test.ok", "ทดสอบล่าสุด: ใช้ได้") : G("adk.test.fail", "ทดสอบล่าสุด: ใช้ไม่ได้")) + " · " + when(k.checked_at) : "";
      var row = h("div", { class: "adk-row", "data-provider": k.provider },
        h("b", { text: names[k.provider] || k.provider }),
        h("span", { class: "adk-st" + (k.unreadable ? " adk-bad" : ""), text: st }),
        k.set_at ? h("span", { class: "ad-muted", text: G("adk.setAt", "ตั้งเมื่อ") + " " + when(k.set_at) }) : null,
        test ? h("span", { class: "ad-muted adk-test", text: test }) : null);
      var btns = h("div", { class: "ad-row" });
      var bSet = h("button", { class: "ad-btn", type: "button", text: k.panel_set ? G("adk.replace", "เปลี่ยนคีย์") : G("adk.set", "ตั้งคีย์") });
      bSet.addEventListener("click", function () { keyDialog(k.provider, names[k.provider] || k.provider, k.panel_set ? "replace" : "set"); });
      btns.appendChild(bSet);
      if (k.testable && k.source !== "none") {
        var bTest = /** @type {HTMLButtonElement} */ (h("button", { class: "ad-btn ad-ghost", type: "button", text: G("adk.test", "ทดสอบคีย์") }));
        bTest.addEventListener("click", function () {
          bTest.disabled = true;
          call("/ai/keys/" + k.provider + "/test", { method: "POST", body: {} }).then(function (/** @type {any} */ r) {
            msg(r.status === "OK" ? G("adk.test.okMsg", "{p}: คีย์ใช้ได้", { p: names[k.provider] || k.provider })
              : G("adk.test.failMsg", "{p}: คีย์ใช้ไม่ได้ ตรวจว่าคีย์ถูกต้องและยังไม่ถูกยกเลิก", { p: names[k.provider] || k.provider }), r.status !== "OK");
            return call("/ai/keys").then(function (/** @type {any} */ x) { gw.keys = x.keys; renderKeys(); });
          }, function (/** @type {any} */ e) { msg(friendly(e), true); }).then(function () { bTest.disabled = false; });
        });
        btns.appendChild(bTest);
      } else if (!k.testable && k.source !== "none") {
        btns.appendChild(h("span", { class: "ad-muted", text: G("adk.test.no", "ผู้ให้บริการนี้ไม่ได้ระบุว่าการทดสอบไม่มีค่าใช้จ่าย จึงไม่ทดสอบจากแผงนี้") }));
      }
      if (k.panel_set) {
        var bDel = h("button", { class: "ad-btn ad-ghost", type: "button", text: G("adk.remove", "ลบคีย์ในแผงนี้") });
        bDel.addEventListener("click", function () { keyDialog(k.provider, names[k.provider] || k.provider, "remove"); });
        btns.appendChild(bDel);
      }
      row.appendChild(btns);
      box.appendChild(row);
    });
  }
  var keyDlg = /** @type {{id: string, what: string}|null} */ (null);
  // closed in any way (Save, Cancel, Esc): nothing typed stays in the page
  $("adkDlg").addEventListener("close", function () { /** @type {any} */ ($("adkForm")).reset(); keyDlg = null; $("adkErr").hidden = true; });
  /** Heading and button of the open key dialog in the current language. */
  function keyDlgTexts() {
    if (!keyDlg) return;
    var p = ((gw.data && gw.data.providers) || []).find(function (/** @type {any} */ x) { return x.id === keyDlg.id; });
    var name = p ? p.name[gLang()] || p.id : keyDlg.id;
    $("adkDlgH").textContent = keyDlg.what === "remove" ? G("adk.dlg.remove", "ลบคีย์ของ {p} ที่ตั้งในแผงนี้", { p: name })
      : keyDlg.what === "replace" ? G("adk.dlg.replace", "เปลี่ยนคีย์ของ {p}", { p: name }) : G("adk.dlg.set", "ตั้งคีย์ของ {p}", { p: name });
    $("adkOk").textContent = keyDlg.what === "remove" ? G("adk.remove", "ลบคีย์ในแผงนี้") : G("adk.save", "บันทึก");
  }
  /** Set / replace / remove dialog: the key, the password and the 6-digit code go only into this one request.
   *  @param {string} id @param {string} name @param {"set"|"replace"|"remove"} what */
  function keyDialog(id, name, what) {
    var d = /** @type {any} */ ($("adkDlg")), f = /** @type {any} */ ($("adkForm")), err = $("adkErr");
    f.reset(); err.hidden = true; err.textContent = "";
    f.key.closest("label").hidden = what === "remove";
    keyDlg = { id: id, what: what };
    keyDlgTexts();
    var done = function () { f.reset(); keyDlg = null; d.close(); };
    f.onsubmit = function (/** @type {any} */ ev) {
      if (!ev.submitter || ev.submitter.value !== "ok") { done(); ev.preventDefault(); return; }
      ev.preventDefault();
      var key = String(f.key.value || "").trim(), code = String(f.totp.value || "").replace(/\s/g, "");
      var bad = function (/** @type {string} */ t) { err.textContent = t; err.hidden = false; err.classList.add("ad-bad"); };
      if (what !== "remove" && !key) { bad(G("adk.v.key", "กรุณาวางคีย์")); return; }
      if (!f.password.value) { bad(G("adm.v.pw", "กรุณากรอกรหัสผ่านก่อน")); return; }
      if (!/^\d{6}$/.test(code)) { bad(G("adm.v.code", "รหัสจากแอปเป็นตัวเลข 6 หลัก")); return; }
      var body = what === "remove" ? { password: f.password.value, totp: code } : { key: key, password: f.password.value, totp: code };
      $("adkOk").disabled = true;
      call("/ai/keys/" + id, { method: what === "remove" ? "DELETE" : "PUT", body: body, noReauth: true }).then(function (/** @type {any} */ r) {
        done(); gw.keys = r.keys;
        msg(what === "remove" ? G("adk.removed", "ลบคีย์ของ {p} แล้ว", { p: name }) : G("adk.saved", "บันทึกคีย์ของ {p} แล้ว", { p: name }));
        loaders.aigw();
      }, function (/** @type {any} */ e) {
        f.password.value = ""; f.totp.value = ""; f.key.value = "";
        bad(e && e.code === "invalid_key_format" ? G("adk.e.format", "คีย์นี้ไม่ใช่รูปแบบของผู้ให้บริการนี้ ตรวจว่าคัดลอกมาครบและเลือกผู้ให้บริการถูก")
          : e && e.code === "owner_totp_required" ? G("adk.e.two", "ต้องเปิดการยืนยันตัวตนสองชั้นก่อน (แท็บความปลอดภัย)")
          : e && e.code === "kek_missing" ? G("adk.e.kek", "เซิร์ฟเวอร์ยังไม่พร้อมเก็บคีย์ กรุณาติดต่อผู้ติดตั้งระบบ")
          : e && (e.code === "reauth_failed" || e.code === "reauth_inline_required") ? G("adm.e.re", "รหัสผ่านหรือรหัสยืนยันไม่ถูกต้อง") : friendly(e));
      }).then(function () { $("adkOk").disabled = false; });
    };
    if (typeof d.showModal === "function") d.showModal();
    (what === "remove" ? f.password : f.key).focus();
  }
  function collectGateway() {
    /** @type {Record<string, boolean>} */
    var providers = {};
    document.querySelectorAll("#adgProv input[data-provider]").forEach(function (/** @type {any} */ i) { providers[i.getAttribute("data-provider")] = i.checked; });
    /** @type {Record<string, any>} */
    var features = {};
    document.querySelectorAll(".adg-feature").forEach(function (/** @type {any} */ c) {
      var id = c.getAttribute("data-feature");
      var meta = gw.data.features.find(function (/** @type {any} */ m) { return m.id === id; }) || {};
      /** @type {any[]} */
      var chain = [];
      c.querySelectorAll(".adg-chain").forEach(function (/** @type {any} */ r) {
        var model = r.querySelector(".adg-m").value.trim();
        if (!model) return;
        /** @type {Record<string, string>} */
        var e = { provider: r.querySelector(".adg-p").value, model: model };
        if (r.querySelector(".adg-e").value) e.effort = r.querySelector(".adg-e").value;
        chain.push(e);
      });
      /** @type {Record<string, any>} */
      var f = { enabled: c.querySelector(".adg-on").checked, chain: chain };
      NUM_FIELDS.forEach(function (x) {
        var k = String(x[0]);
        var v = c.querySelector("input[name=" + k + "]").value;
        if (v === "" && meta.legacy && k === "monthlyBudgetUsd") { f.monthlyBudgetUsd = null; return; }
        if (v !== "") f[k] = k === "monthlyBudgetUsd" ? Number(v) : parseInt(v, 10);
      });
      var img = c.querySelector(".adg-img");
      if (img) f.imageModeAllowed = img.checked;
      features[id] = f;
    });
    return { enabled: $("adgOn").checked, legacyKeyStore: $("adgLegacy").checked, providers: providers, features: features };
  }
  $("adgSave").addEventListener("click", function () {
    call("/ai/gateway", { method: "PUT", body: collectGateway() }).then(function (/** @type {any} */ r) {
      gw.data.settings = r.settings; renderGateway(); msg(G("adg.saved", "บันทึกการตั้งค่า AI Gateway แล้ว"));
    }, fail);
  });
  $("adgLang").addEventListener("change", function () {
    var I = /** @type {any} */ (window).LQI18N;
    if (I && typeof I.setLang === "function") I.setLang($("adgLang").value);
  });
  $("adLang").addEventListener("change", function () {
    var I = /** @type {any} */ (window).LQI18N;
    if (I && typeof I.setLang === "function") I.setLang($("adLang").value);
  });
  window.addEventListener("lq-lang", function () {
    $("adgLang").value = gLang(); $("adLang").value = gLang();
    amsg(""); swapSecond(useRecovery); hideTyped();
    document.title = "LENSIQ " + G("adm.brand", "หลังบ้าน");
    if (gw.data) renderGateway();
    keyDlgTexts();
  });
  $("adLang").value = gLang();

  /* ---------------- billing ---------------- */
  loaders.billing = function () {
    call("/billing").then(function (/** @type {any} */ b) {
      var st = $("adBillStatus"); st.textContent = "";
      st.appendChild(table(["รายการ", "ค่า"], [
        ["FREE_MODE (ทุกฟีเจอร์ฟรี)", b.free_mode ? "เปิด" : "ปิด"], ["รับชำระเงิน (BILLING_ENABLED)", b.billing_enabled ? "เปิด" : "ปิด"],
        ["จดทะเบียน VAT", b.vat_registered ? "ใช่ (7%)" : "ไม่ (ออกใบเสร็จเท่านั้น)"],
        ["Opn secret key", b.opn.secret_key ? (b.opn.test_key ? "ตั้งแล้ว (ทดสอบ)" : "ตั้งแล้ว (LIVE)") : "ยังไม่ตั้ง"],
        ["Opn public key", b.opn.public_key ? "ตั้งแล้ว" : "ยังไม่ตั้ง"], ["Opn webhook secret", b.opn.webhook_secret ? "ตั้งแล้ว" : "ยังไม่ตั้ง"]
      ]));
      $("adPricingOn").checked = !!b.settings.pricing_page_enabled;
      var bn = $("adBillTs"), bt = b.turnstile || {};
      bn.hidden = !!bt.configured;
      bn.textContent = bt.configured ? "" : "⚠ ระบบกันบอทยังไม่ได้ตั้งค่า การชำระเงินผ่านหน้าราคาจะถูกปฏิเสธจนกว่าผู้ติดตั้งระบบจะตั้งให้เสร็จ";
      var pl = $("adPlans"); pl.textContent = "";
      pl.appendChild(table(["แพ็กเกจ", "สถานะ", "รายเดือน (บาท)", "รายปี (บาท)", "AI/วัน"], b.plans.map(function (/** @type {any} */ p) {
        var ai = p.entitlements.ai_reading;
        return [p.name_th + " / " + p.name_en, p.status === "draft" ? "ร่าง" : p.status, baht(p.price_month_satang), baht(p.price_year_satang), ai ? (ai.quota == null ? "ไม่จำกัด" : ai.quota) : "—"];
      })));
    }, fail);
    call("/billing/payments").then(function (/** @type {any} */ r) {
      var el = $("adPayments"); el.textContent = "";
      el.appendChild(h("p", { class: "ad-muted", text: "ทั้งหมด " + r.total + " รายการ · รายได้จริง (live) " + baht(r.live_revenue_satang) + " บาท" }));
      el.appendChild(table(["วันที่", "ประเภท", "สถานะ", "ยอด", "VAT", "เลขที่เอกสาร", "ผู้ซื้อ", "เลขผู้เสียภาษี", "โหมด"], r.payments.map(function (/** @type {any} */ p) {
        return [when(p.created_at), p.kind === "admin_test" ? "ทดสอบ" : (p.plan_id || "") + " " + (p.period || ""), p.status, baht(p.amount_satang), baht(p.vat_satang), p.receipt_no, p.buyer_name, p.buyer_tax_id, p.livemode ? "LIVE" : "test"];
      })));
    }, fail);
    call("/billing/webhooks").then(function (/** @type {any} */ r) {
      var el = $("adWebhooks"); el.textContent = "";
      el.appendChild(table(["เวลา", "event", "key", "charge", "ผล"], r.webhooks.map(function (/** @type {any} */ w) { return [when(w.received_at), w.event_id, w.event_key, w.charge_id, w.result]; })));
    }, fail);
  };
  $("adPricingOn").addEventListener("change", function (/** @type {Event} */ ev) {
    call("/billing/settings", { method: "PUT", body: { pricing_page_enabled: /** @type {HTMLInputElement} */ (ev.target).checked } }).then(function () { msg("บันทึกแล้ว"); }, fail);
  });
  var pollTimer = /** @type {any} */ (null);
  $("adTestCharge").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target);
    var box = $("adQr"); box.textContent = "กำลังสร้าง…";
    call("/billing/test-charge", { method: "POST", body: { amount_satang: Math.round(Number(f.baht.value) * 100) } }).then(function (/** @type {any} */ r) {
      box.textContent = "";
      var img = h("img", { alt: "PromptPay QR (ทดสอบ)", width: 240, height: 240 });
      var stEl = h("p", { class: "ad-muted", text: "สถานะ: pending · ยอด " + baht(r.amount_satang) + " บาท · หมดอายุ " + when(r.expires_at) });
      box.appendChild(img); box.appendChild(stEl);
      box.appendChild(h("p", { class: "ad-muted", text: "โหมดทดสอบ: กด Mark as successful ใน Opn dashboard แล้วรอสถานะอัปเดต" }));
      // QR comes through the Worker as SVG; shown as a blob: image (page CSP allows img-src blob:)
      fetch(API.url(r.qr_path), { credentials: "omit" }).then(function (x) { return x.ok ? x.blob() : null; }).then(function (b) { if (b) img.setAttribute("src", URL.createObjectURL(b)); });
      if (pollTimer) clearInterval(pollTimer);
      var n = 0;
      pollTimer = setInterval(function () {
        if (++n > 120) { clearInterval(pollTimer); return; }
        API.getJSON(r.status_path).then(function (/** @type {any} */ s) {
          if (!s) return;
          stEl.textContent = "สถานะ: " + s.status + (s.receipt_no ? " · เลขที่ " + s.receipt_no : "");
          if (s.status !== "pending") { clearInterval(pollTimer); loaders.billing(); }
        });
      }, 5000);
    }, function (/** @type {any} */ e) { box.textContent = ""; fail(e); });
  });

  /* ---------------- members ---------------- */
  loaders.members = function () {
    call("/membership").then(function (/** @type {any} */ r) {
      var f = /** @type {any} */ ($("adMemForm")), s = r.settings;
      f.membership_required.checked = !!s.membership_required;
      ["guest_daily_readings", "guest_light_sections", "member_ai_daily", "member_saved_max"].forEach(function (k) { f[k].value = s[k]; });
      var box = $("adMemPlans"); box.textContent = "";
      r.plan_ai_quotas.filter(function (/** @type {any} */ p) { return p.plan_id !== "free"; }).forEach(function (/** @type {any} */ p) {
        box.appendChild(h("label", null, p.plan_id + " (" + (p.period === "month" ? "ต่อเดือน" : "ต่อวัน") + ") ", h("input", { type: "number", min: 0, max: 1000000, step: 1, name: "q_" + p.plan_id, value: p.quota == null ? "" : p.quota, placeholder: "ไม่จำกัด" })));
      });
      var w = [];
      if (!r.google_client_id_set) w.push("ยังไม่ได้ตั้งการเข้าสู่ระบบด้วย Google บนเซิร์ฟเวอร์ สมาชิกเข้าสู่ระบบไม่ได้ และสวิตช์บังคับเข้าสู่ระบบจะไม่มีผล");
      if (!(r.turnstile || {}).configured) w.push("ระบบกันบอทยังไม่ได้ตั้งค่า การเข้าสู่ระบบถูกปฏิเสธ");
      if (s.membership_required && !r.effective_required) w.push("สวิตช์เปิดอยู่แต่ยังไม่มีผล (ต้องตั้งการเข้าสู่ระบบด้วย Google บนเซิร์ฟเวอร์ก่อน)");
      $("adMemWarn").hidden = !w.length; $("adMemWarn").textContent = w.map(function (x) { return "⚠ " + x; }).join(" · ");
    }, fail);
    memList("");
  };
  function memList(/** @type {string} */ q) {
    call("/members" + (q ? "?q=" + encodeURIComponent(q) : "")).then(function (/** @type {any} */ r) {
      var k = $("adMemKpis"); k.textContent = "";
      var tiers = Object.keys(r.tiers).map(function (t) { return t + " " + r.tiers[t]; }).join(" · ");
      [["สมาชิกทั้งหมด", r.count], ["ใช้งานอยู่", r.active], ["ถูกระงับ", r.disabled], ["รับข่าวสาร", r.marketing_opt_in], ["แยกตามระดับ", tiers]]
        .forEach(function (x) { k.appendChild(h("div", { class: "ad-kpi" }, h("span", { class: "ad-kpi-v", text: String(x[1]) }), h("span", { class: "ad-kpi-l", text: String(x[0]) }))); });
      var sg = $("adMemSignups"); sg.textContent = "";
      sg.appendChild(h("h3", { text: "สมัครใหม่รายวัน (30 วัน)" }));
      sg.appendChild(table(["วัน", "สมัครใหม่"], r.signups.map(function (/** @type {any} */ d) { return [d.day, d.n]; })));
      var el = $("adMemList"); el.textContent = "";
      var t = table(["อีเมล", "ชื่อ", "ระดับ", "สถานะ", "สมัครเมื่อ", "เข้าสู่ระบบล่าสุด", "จัดการ"], r.users.map(function (/** @type {any} */ u) {
        return [u.email, u.display_name, u.plan || "member", u.status === "active" ? "ใช้งาน" : "ระงับ", when(u.created_at), when(u.last_login_at), ""];
      }));
      el.appendChild(t);
      var rows = t.querySelectorAll("tbody tr");
      r.users.forEach(function (/** @type {any} */ u, /** @type {number} */ i) {
        var cell = rows[i] && rows[i].lastChild; if (!cell) return;
        var b = h("button", { type: "button", class: "ad-btn ad-ghost", text: u.status === "active" ? "ระงับบัญชี" : "เปิดใช้งาน" });
        b.addEventListener("click", function () {
          var next = u.status === "active" ? "disabled" : "active";
          if (next === "disabled" && !confirm("ระงับบัญชีนี้และออกจากระบบทุกอุปกรณ์?")) return;
          call("/members/" + u.id + "/status", { method: "POST", body: { status: next } }).then(function () { msg("บันทึกแล้ว"); memList(q); }, fail);
        });
        cell.textContent = ""; cell.appendChild(b);
      });
    }, fail);
  }
  $("adMemSearch").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    memList(String(/** @type {any} */ (ev.target).q.value || "").trim());
  });
  $("adMemForm").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target);
    var settings = { membership_required: f.membership_required.checked };
    ["guest_daily_readings", "guest_light_sections", "member_ai_daily", "member_saved_max"].forEach(function (k) { /** @type {any} */ (settings)[k] = parseInt(f[k].value, 10); });
    /** @type {Record<string, number|null>} */
    var plans = {};
    f.querySelectorAll("input[name^=q_]").forEach(function (/** @type {HTMLInputElement} */ i) { plans[i.name.slice(2)] = i.value === "" ? null : parseInt(i.value, 10); });
    call("/membership", { method: "PUT", body: { settings: settings, plan_ai_quotas: plans } }).then(function () { msg("บันทึกการตั้งค่าสมาชิกแล้ว"); loaders.members(); }, fail);
  });

  /* ---------------- security ---------------- */
  loaders.security = function () {
    call("/me").then(function (/** @type {any} */ me) {
      if (me.csrf) state.csrf = me.csrf;
      state.me = me;
      $("adTotpState").textContent = me.totp_enabled ? G("adm.sec.isOn", "เปิดใช้งานอยู่") : G("adm.sec.isOff", "ยังไม่เปิด (แนะนำให้เปิด)");
      $("adTotpOn").hidden = !!me.totp_enabled;
      $("adTotpDisable").hidden = !me.totp_enabled;
      $("adRecBox").hidden = !me.totp_enabled;
      $("adRecLeft").textContent = String(me.recovery_left || 0);
    }, fail);
    call("/audit").then(function (/** @type {any} */ r) {
      var el = $("adAudit"); el.textContent = "";
      el.appendChild(table(["เวลา", "ผู้กระทำ", "การกระทำ", "รายละเอียด"], r.audit.map(function (/** @type {any} */ a) { return [when(a.ts), a.actor, a.action, a.detail]; })));
    }, fail);
  };
  // same QR + recovery-code screens as the first run; "Done" comes back to this tab
  $("adTotpSetup").addEventListener("click", function () {
    var pw = /** @type {HTMLInputElement} */ ($("adTotpPw")).value;
    /** @type {HTMLInputElement} */ ($("adTotpPw")).value = "";
    if (!pw) { msg(G("adm.v.pw", "กรุณากรอกรหัสผ่านก่อน"), true); return; }
    flow.first = false; flow.back = "security"; flow.pw = pw;
    msg("");
    startTwo();
  });
  $("adRecNew").addEventListener("click", function () {
    askReauth().then(function (/** @type {any} */ cred) {
      if (!cred) return;
      call("/totp/recovery", { method: "POST", body: cred, noReauth: true }).then(function (/** @type {any} */ r) {
        flow.first = false; flow.back = "security";
        showCodes(r.recovery_codes || []);
      }, function (/** @type {any} */ e) { msg(friendly(e), true); });
    });
  });
  $("adTotpDisable").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target), v = String(f.code.value || "").trim();
    var body = /^\d{6}$/.test(v) ? { password: f.password.value, code: v } : { password: f.password.value, recovery: v };
    call("/totp/disable", { method: "POST", body: body, noReauth: true }).then(function () { f.reset(); msg(G("adm.sec.offOk", "ปิดการยืนยันตัวตนสองชั้นแล้ว")); loaders.security(); },
      function (/** @type {any} */ e) { msg(friendly(e), true); });
  });
  $("adPw").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target);
    call("/password", { method: "POST", body: { current: f.current.value, next: f.next.value, totp: f.totp.value || undefined } }).then(function () { f.reset(); msg("เปลี่ยนรหัสผ่านแล้ว"); }, fail);
  });

  /* ---------------- retention ---------------- */
  loaders.retention = function () {
    call("/retention").then(function (/** @type {any} */ r) {
      var c = r.config, el = $("adRet"); el.textContent = "";
      el.appendChild(table(["ข้อมูล", "ระยะเวลาเก็บ"], [
        ["เหตุการณ์ดิบ (analytics events)", c.rawEventDays + " วัน แล้วเก็บเฉพาะยอดรวมรายวัน"], ["ยอดรวมรายวัน", "เก็บถาวร"],
        ["salt รายวัน (แฮชผู้เข้าชม)", "ลบในวันถัดไป"], ["ตัวนับการใช้งาน (โควตา)", c.usageDays + " วัน"],
        ["เนื้อหา webhook", c.webhookPayloadDays + " วัน"], ["audit log", c.auditDays + " วัน"],
        ["รายการชำระเงิน / ใบเสร็จ", "ไม่ลบอัตโนมัติ (เอกสารบัญชี/ภาษี ≥ 5 ปี)"]
      ]));
    }, fail);
  };
  $("adRetRun").addEventListener("click", function () {
    call("/retention/run", { method: "POST", body: {} }).then(function (/** @type {any} */ r) { $("adRetOut").textContent = JSON.stringify(r, null, 2); }, fail);
  });

  start();
})();
