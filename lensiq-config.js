/* lensiq-config.js — LENSIQ site settings (change here, not in page code). Notes per setting and the comments that stood here: docs/CONFIG-NOTES.md. */
window.LENSIQ_API_BASE = window.LENSIQ_API_BASE || "";

window.LENSIQ_TURNSTILE_SITEKEY = window.LENSIQ_TURNSTILE_SITEKEY || "";

window.LENSIQ_GOOGLE_CLIENT_ID = window.LENSIQ_GOOGLE_CLIENT_ID || "";

window.LENSIQ_ANALYTICS = window.LENSIQ_ANALYTICS !== false;

window.LENSIQ_MERIT_INTEREST_FORM = window.LENSIQ_MERIT_INTEREST_FORM === true;

window.LENSIQ_ORG_ACCOUNTS = window.LENSIQ_ORG_ACCOUNTS === true;

window.LENSIQ_FACEPARSE = window.LENSIQ_FACEPARSE === true;

window.LENSIQ_AGE_GENDER = window.LENSIQ_AGE_GENDER !== false;

window.LENSIQ_FORTUNE_STRAIGHT = false;

window.LENSIQ_FORTUNE_PAID = window.LENSIQ_FORTUNE_PAID === true;
window.LENSIQ_FORTUNE_PLAN = window.LENSIQ_FORTUNE_PLAN === true;
window.LENSIQ_FORTUNE_SOURCES = window.LENSIQ_FORTUNE_SOURCES === true;

window.LENSIQ_FORTUNE_CAUTIONS = window.LENSIQ_FORTUNE_CAUTIONS === true;
window.LENSIQ_FORTUNE_CAUTIONS_CN_WEST = window.LENSIQ_FORTUNE_CAUTIONS_CN_WEST === true;
window.LENSIQ_FORTUNE_CAUTIONS_DRAFTS = window.LENSIQ_FORTUNE_CAUTIONS_DRAFTS === true;

// period layer "ดวงช่วงนี้" (owner inbox 2026-11-21 entries 19/21/26; fortune-period.js): OFF for customers until the owner turns it on
window.LENSIQ_FORTUNE_PERIOD = window.LENSIQ_FORTUNE_PERIOD === true;

window.LENSIQ_COMPAT_V2 = window.LENSIQ_COMPAT_V2 === true;

window.LENSIQ_PET_ZODIAC = window.LENSIQ_PET_ZODIAC === true;
window.LENSIQ_PET_CARD_CLASSIC = window.LENSIQ_PET_CARD_CLASSIC === true;
window.LENSIQ_PET_ZODIAC_ODDS = window.LENSIQ_PET_ZODIAC_ODDS || "b";

window.LENSIQ_CARD_BRAND = typeof window.LENSIQ_CARD_BRAND === "string" && window.LENSIQ_CARD_BRAND.trim() ? window.LENSIQ_CARD_BRAND : "LENSIQ";
window.LENSIQ_CARD_SHOW_ADDRESS = window.LENSIQ_CARD_SHOW_ADDRESS === true;

window.LENSIQ_LOOK_SALON = false;

/** @type {any} */ (window).LENSIQ_EXPRESSION = /** @type {any} */ (window).LENSIQ_EXPRESSION !== false;

/** @type {any} */ (window).LENSIQ_RESEARCH_DEMO = /** @type {any} */ (window).LENSIQ_RESEARCH_DEMO !== false;

window.LENSIQ_EXAM_PHONE_ZOOM = window.LENSIQ_EXAM_PHONE_ZOOM === true;

window.LENSIQ_PC_THAI_EQUIV = window.LENSIQ_PC_THAI_EQUIV === true;

window.LENSIQ_PALM_V2 = window.LENSIQ_PALM_V2 === true;
window.LENSIQ_PALM_LANDMARKS = window.LENSIQ_PALM_LANDMARKS !== false;

(function () {
  "use strict";
  var W = /** @type {any} */ (window), KEY = "lq-research-demo";
  var pre = W.LENSIQ_PROFILE, stored = null, legacy = null;
  try { if (typeof localStorage !== "undefined") { stored = localStorage.getItem(KEY); legacy = localStorage.getItem("lq-profile"); } } catch (e) {  }
  var locked = W.LENSIQ_RESEARCH_DEMO === false ? "operator" : pre === "commercial" ? "profile" : null;
  var on = locked ? false : stored === "on" ? true : stored === "off" || legacy === "commercial" ? false : pre === "demo";
  W.LENSIQ_PROFILE = on ? "demo" : "commercial";
  W.LENSIQ_RESEARCH = { on: on, locked: locked, key: KEY, operatorDemo: pre === "demo" && !locked };
  if (!on) { W.LENSIQ_AGE_GENDER = false; W.LENSIQ_EXPRESSION = false; W.LENSIQ_FACEPARSE = false; W.LENSIQ_PALM_LANDMARKS = false; }
})();

window.LENSIQ_SELLER = window.LENSIQ_SELLER || {
  sales_open: false,
  name: "",
  tax_id: "",
  address: "",
  email: "",
  line: "",
  quote_line: "@632yliiw",
  dpo_name: "",
  dpo_email: "",
  status_url: "",
  effective_date: "",
  email_provider: "",
  email_provider_location: "",
  cookie_name: "",
  cookie_duration: "",
  anthropic_retention: "",
  counsel_confirmed: false
};

window.LENSIQ_LEADS_FORM = window.LENSIQ_LEADS_FORM !== false;

window.LENSIQ_LEADS_NOTICE = window.LENSIQ_LEADS_NOTICE === true;

(function () {
  "use strict";
  if (typeof document === "undefined" || typeof location === "undefined") return;
  var TXT = {
    th: { b: "เครื่องนี้เปิด \"เดโมงานวิจัย\" อยู่: โมเดลอายุ/เพศ (UTKFace) และสีหน้าที่ใช้ข้อมูลใบอนุญาตวิจัยยังทำงานได้ ห้ามใช้เชิงพาณิชย์ — ปิดได้ที่", a: "ตั้งค่าชุดการติดตั้ง" },
    en: {
      b: "\"Research demo\" is on for this device: the research-licence age/gender (UTKFace) and expression models can still run. Not for commercial use — switch it off in",
      a: "Installation profile settings"
    },
    zh: { b: "本设备已开启“研究演示”：基于研究许可数据的年龄/性别（UTKFace）与表情模型仍可运行，不得用于商业用途 — 可在此关闭：", a: "安装配置设置" }
  };
  var lang = function () { var l = (window.LQI18N && window.LQI18N.lang) || document.documentElement.lang || "th"; return /^zh/.test(l) ? "zh" : /^en/.test(l) ? "en" : "th"; };
  var camPage = /(store|customers|attendance|driver|qc|signage|booth|neuro|photobooth|cameras)\.html$/.test(location.pathname);
  var demoHost = /(^|\.)github\.io$|^localhost$|^127\.0\.0\.1$|^\[?::1\]?$|^$/.test(location.hostname || "");
  var force = /[?&]profilebanner=1\b/.test(location.search || "");
  function banner() {
    if (!camPage || window.LENSIQ_PROFILE !== "demo" || (demoHost && !force) || document.getElementById("lqDemoBanner")) return;
    var host = document.querySelector("main") || document.body; if (!host) return;
    var p = document.createElement("p"); p.id = "lqDemoBanner"; p.className = "lq-demo-banner"; p.setAttribute("role", "note"); p.setAttribute("data-i18n-skip", "");
    Object.assign(p.style, { margin: "8px 0", padding: "8px 12px", borderRadius: "10px", background: "#fdeaea", color: "#a12b20", border: "1px solid #f3b7b0", fontSize: ".86rem" });
    var t = document.createElement("span"), a = document.createElement("a");
    a.href = "cameras.html#profile"; a.style.marginLeft = "6px";
    p.appendChild(t); p.appendChild(a); host.insertBefore(p, host.firstChild);
    var fill = function () { var x = TXT[lang()]; t.textContent = x.b; a.textContent = x.a; };
    fill(); window.addEventListener("lq-lang", fill);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", banner); else banner();
})();

(function () {
  "use strict";
  if (!/^https?:\/\//.test(String(window.LENSIQ_API_BASE || "")) || typeof document === "undefined") return;
  var me = /** @type {HTMLScriptElement|null} */ (document.currentScript);
  var dir = me && me.src ? me.src.replace(/[^/]*$/, "") : "";
  /** @param {string} file @param {string} global */
  var load = function (file, global) {
    if (/** @type {any} */ (window)[global] || document.querySelector('script[src*="' + file + '"]')) return;
    var s = document.createElement("script");
    s.src = dir + file + "?v=7";
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
  };
  load("lensiq-api.js", "LQApi");

  if (window.LENSIQ_ANALYTICS !== false && !/\/(admin|pricing|counselling)\.html$/.test(location.pathname)) load("lensiq-analytics.js", "LQAnalytics");

  if (/** @type {any} */ (window).LENSIQ_MEMBER !== false && !/\/admin\.html$/.test(location.pathname)) load("lensiq-member.js", "LQMember");

  if (/(fortune|faceread|palm|horoscope|tarot|fengshui|numbers|iching|zodiac|astro|dream|bazi|taksa|lek7|lifegraph)\.html$/.test(location.pathname)) load("lensiq-fortune-hook.js", "__lqFortuneHook");
})();

window.LENSIQ_TRYON = window.LENSIQ_TRYON === true;

window.LENSIQ_CONVERT_SERVER = window.LENSIQ_CONVERT_SERVER === true;

window.LENSIQ_HELP_TOP_STICKY = window.LENSIQ_HELP_TOP_STICKY !== false;

window.LENSIQ_FORTUNE_THEME = window.LENSIQ_FORTUNE_THEME || "a";
(function () {
  /** @param {Document} doc */
  function apply(doc) {
    var h = doc && doc.documentElement, t = ["lq-ft", "lq-ft-menu", "lq-ft-read", "lq-ft-entry"];
    if (!h || window.LENSIQ_FORTUNE_THEME !== "classic" || !h.classList.contains("lq-ft")) return false;
    for (var i = 0; i < t.length; i++) h.classList.remove(t[i]);
    h.classList.add("lq-ft-classic");
    var e = doc.getElementById("lqFtEntry");
    if (e) e.remove();
    return true;
  }
  /** @type {any} */ (window).LQFortuneTheme = { apply: apply };
  if (typeof document !== "undefined") apply(document);
})();
