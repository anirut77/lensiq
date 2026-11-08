/* admin.js — LENSIQ back office (admin.html) talking to the API Worker (backend/src/index.js, /admin/api/*).
 *
 * Session: cookie mode (httpOnly __Host- cookie, credentials:"include", X-CSRF-Token on writes) when the page is served
 * from the API's own ORIGIN (recommended: the Worker serves admin.html at https://admin.<domain>, docs/BACKEND.md);
 * bearer mode (token kept in memory only — gone on reload) for any other origin. The only thing kept in localStorage is
 * the trusted-device token (it exempts this browser from the login slow-down but never replaces the password/TOTP).
 * All server data is rendered with textContent (no innerHTML of server strings).
 */
(function () {
  "use strict";
  var $ = function (/** @type {string} */ id) { return /** @type {any} */ (document.getElementById(id)); };
  var API = /** @type {any} */ (window).LQApi;
  var state = { mode: "cookie", token: "", csrf: "", me: /** @type {any} */ (null) };

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
      p.textContent = "ยืนยันรหัสผ่านอีกครั้งก่อนแก้ไขรายการสำคัญ (มีผล 5 นาที)";
      var pw = document.createElement("input");
      pw.type = "password"; pw.autocomplete = "current-password"; pw.required = true; pw.placeholder = "รหัสผ่าน";
      pw.setAttribute("aria-label", "รหัสผ่าน");
      var tp = document.createElement("input");
      tp.inputMode = "numeric"; tp.autocomplete = "one-time-code"; tp.placeholder = "รหัส TOTP 6 หลัก"; tp.setAttribute("aria-label", "รหัส TOTP");
      tp.hidden = !(state.me && state.me.totp_enabled);
      var ok = document.createElement("button"); ok.type = "submit"; ok.value = "ok"; ok.textContent = "ยืนยัน";
      var no = document.createElement("button"); no.type = "submit"; no.value = "cancel"; no.formNoValidate = true; no.textContent = "ยกเลิก";
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

  function show(/** @type {string} */ which) {
    ["adOffline", "adBoot", "adLogin", "adApp"].forEach(function (id) { $(id).hidden = id !== which; });
    $("adLogout").hidden = which !== "adApp";
  }

  /* ---------------- start ---------------- */
  function start() {
    if (!API || !API.enabled()) { $("adConn").textContent = "ออฟไลน์"; show("adOffline"); return; }
    $("adConn").textContent = API.base().replace(/^https?:\/\//, "");
    state.mode = sameOrigin() ? "cookie" : "bearer";
    call("/state").then(function (st) {
      if (!st.bootstrapped) { show("adBoot"); return; }
      // cookie mode: maybe still signed in (GET /me also rotates the CSRF token)
      if (state.mode === "cookie") return call("/me").then(enter, function () { show("adLogin"); });
      show("adLogin");
    }).catch(function () { msg("เชื่อมต่อ API ไม่ได้ (ตรวจ ALLOWED_ORIGINS / ADMIN_ORIGINS และ CSP)", true); show("adLogin"); });
  }

  function enter(/** @type {any} */ me) {
    state.me = me;
    if (me.csrf) state.csrf = me.csrf;
    show("adApp");
    msg("");
    tab("analytics");
  }

  $("adBootForm").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {HTMLFormElement} */ (ev.target);
    var d = Object.fromEntries(new FormData(f));
    call("/bootstrap", { method: "POST", body: d }).then(function () { f.reset(); msg("สร้างบัญชีแล้ว — ลบ ADMIN_BOOTSTRAP_TOKEN ด้วย wrangler secret delete แล้วเข้าสู่ระบบ"); show("adLogin"); },
      function (/** @type {any} */ e) { msg(e.message, true); });
  });

  $("adLoginForm").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {HTMLFormElement} */ (ev.target);
    var d = /** @type {any} */ (Object.fromEntries(new FormData(f)));
    if (d.mode === "cookie" || d.mode === "bearer") state.mode = d.mode;
    var body = { username: d.username, password: d.password, totp: d.totp || undefined, mode: state.mode };
    call("/login", { method: "POST", body: body }).then(function (/** @type {any} */ r) {
      f.reset();
      state.csrf = r.csrf || "";
      state.token = r.token || "";
      if (r.device) device.set(r.device);
      return call("/me").then(enter);
    }).catch(function (/** @type {any} */ e) { msg(e.message, true); });
  });

  $("adLogout").addEventListener("click", function () {
    call("/logout", { method: "POST", body: {} }).catch(function () { /* already gone */ }).then(function () {
      state.token = ""; state.csrf = ""; show("adLogin"); msg("ออกจากระบบแล้ว");
    });
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
      tsn.textContent = t.configured ? "" : "⚠ Turnstile ยังไม่ได้ตั้งค่า — ผู้ช่วยเขียน AI ถูกปฏิเสธทุกคำขอ (fail closed) จนกว่าจะตั้ง TURNSTILE_SECRET (wrangler secret put) และ TURNSTILE_HOSTNAMES" +
        (t.local_dev_bypass ? " · TURNSTILE_DISABLED_FOR_LOCAL_DEV เปิดอยู่: ยกเว้นเฉพาะคำขอจาก localhost" : "");
      var k = r.key;
      $("adKeyStatus").textContent = "ที่มาของคีย์: " + ({ worker_secret: "Worker secret (แนะนำ)", admin_encrypted: "เก็บแบบเข้ารหัสจากหน้านี้", none: "ยังไม่มีคีย์ — AI ปิดอยู่" }[/** @type {"worker_secret"|"admin_encrypted"|"none"} */ (k.source)] || k.source) +
        (k.stored_encrypted ? " · คีย์เข้ารหัสอัปเดต " + when(k.stored_updated_at) + (k.stored_readable ? "" : " (ถอดรหัสไม่ได้ — KEK เปลี่ยน?)") : "") +
        " · SECRETS_KEK: " + (k.kek_configured ? "ตั้งแล้ว" : "ยังไม่ตั้ง") + (k.kek_error ? " (" + k.kek_error + ")" : "");
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
      bn.textContent = bt.configured ? "" : "⚠ Turnstile ยังไม่ได้ตั้งค่า — การชำระเงินผ่านหน้าราคาจะถูกปฏิเสธ (fail closed) จนกว่าจะตั้ง TURNSTILE_SECRET และ TURNSTILE_HOSTNAMES";
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
      if (!r.google_client_id_set) w.push("ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID (wrangler.toml) — สมาชิกเข้าสู่ระบบไม่ได้ และสวิตช์บังคับเข้าสู่ระบบจะไม่มีผล");
      if (!(r.turnstile || {}).configured) w.push("Turnstile ยังไม่ได้ตั้งค่า — การเข้าสู่ระบบถูกปฏิเสธ (fail closed)");
      if (s.membership_required && !r.effective_required) w.push("สวิตช์เปิดอยู่แต่ยังไม่มีผล (ต้องมี GOOGLE_CLIENT_ID)");
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
      $("adTotpState").textContent = me.totp_enabled ? "เปิดใช้งานอยู่" : "ยังไม่เปิด (แนะนำให้เปิด)";
      $("adTotpSetup").hidden = !!me.totp_enabled;
      $("adTotpDisable").hidden = !me.totp_enabled;
      $("adTotpBox").hidden = true;
    }, fail);
    call("/audit").then(function (/** @type {any} */ r) {
      var el = $("adAudit"); el.textContent = "";
      el.appendChild(table(["เวลา", "ผู้กระทำ", "การกระทำ", "รายละเอียด"], r.audit.map(function (/** @type {any} */ a) { return [when(a.ts), a.actor, a.action, a.detail]; })));
    }, fail);
  };
  $("adTotpSetup").addEventListener("click", function () {
    var pw = /** @type {HTMLInputElement} */ ($("adTotpPw")).value;
    /** @type {HTMLInputElement} */ ($("adTotpPw")).value = "";
    call("/totp/setup", { method: "POST", body: { password: pw } }).then(function (/** @type {any} */ r) {
      $("adTotpSecret").textContent = r.secret; $("adTotpUri").textContent = r.uri; $("adTotpBox").hidden = false;
    }, fail);
  });
  $("adTotpEnable").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target);
    call("/totp/enable", { method: "POST", body: { code: f.code.value } }).then(function () { f.reset(); $("adTotpSecret").textContent = ""; $("adTotpUri").textContent = ""; msg("เปิด TOTP แล้ว"); loaders.security(); }, fail);
  });
  $("adTotpDisable").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target);
    call("/totp/disable", { method: "POST", body: { password: f.password.value, code: f.code.value } }).then(function () { f.reset(); msg("ปิด TOTP แล้ว"); loaders.security(); }, fail);
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
