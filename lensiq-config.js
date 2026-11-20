/* lensiq-config.js — LENSIQ site settings (change here, not in page code). Full notes per setting: docs/CONFIG-NOTES.md.
 * LENSIQ_API_BASE: API server (AI readings, statistics, payments); "" = no backend, every page works offline. */
window.LENSIQ_API_BASE = window.LENSIQ_API_BASE || "";

/* LENSIQ_TURNSTILE_SITEKEY: Turnstile site key for the AI writing assistant; "" = off; set before going live */
window.LENSIQ_TURNSTILE_SITEKEY = window.LENSIQ_TURNSTILE_SITEKEY || "";

/* LENSIQ_GOOGLE_CLIENT_ID: public OAuth client ID for member sign-in; "" = no membership */
window.LENSIQ_GOOGLE_CLIENT_ID = window.LENSIQ_GOOGLE_CLIENT_ID || "";

/* LENSIQ_ANALYTICS: with LENSIQ_API_BASE, consent-gated statistics; false = all statistics off */
window.LENSIQ_ANALYTICS = window.LENSIQ_ANALYTICS !== false;

/* LENSIQ_MERIT_INTEREST_FORM (Merit MVP): paid merit-service interest form; off until L42/L43 and the owner; needs the Worker switch */
window.LENSIQ_MERIT_INTEREST_FORM = window.LENSIQ_MERIT_INTEREST_FORM === true;

/* LENSIQ_ORG_ACCOUNTS (org-p1): organisation accounts; off until the owner approves; needs ORG_ACCOUNTS = "on" on the Worker */
window.LENSIQ_ORG_ACCOUNTS = window.LENSIQ_ORG_ACCOUNTS === true;

/* LENSIQ_FACEPARSE: true = BiSeNet (non-commercial, file not in git); false = MediaPipe Selfie Multiclass (Apache-2.0) */
window.LENSIQ_FACEPARSE = window.LENSIQ_FACEPARSE === true;

/* LENSIQ_AGE_GENDER: signage age/gender option (UTKFace, research only, F5); research demo only; false = never loaded */
window.LENSIQ_AGE_GENDER = window.LENSIQ_AGE_GENDER !== false;

/* LENSIQ_FORTUNE_STRAIGHT: "read it straight" option, 18+ confirm; OFF since 2026-11-12 (docs/INCIDENT-2026-11-12-STRAIGHT-OFF.md) */
window.LENSIQ_FORTUNE_STRAIGHT = false;

/* fortune-paid switches: off */
window.LENSIQ_FORTUNE_PAID = window.LENSIQ_FORTUNE_PAID === true;
window.LENSIQ_FORTUNE_PLAN = window.LENSIQ_FORTUNE_PLAN === true;
window.LENSIQ_FORTUNE_SOURCES = window.LENSIQ_FORTUNE_SOURCES === true;

/* LENSIQ_LOOK_SALON (decision 2026-11-14 ก): shop-catalogue mode of the look suggestions; off until a human approval step exists */
window.LENSIQ_LOOK_SALON = false;

/* LENSIQ_EXPRESSION (round 16): faceExpressionNet (F5) on neuro, signage, booth, photobooth; research demo only */
/** @type {any} */ (window).LENSIQ_EXPRESSION = /** @type {any} */ (window).LENSIQ_EXPRESSION !== false;

/* LENSIQ_RESEARCH_DEMO (round 16): per-device research demo switch; false = customer installation, locked off */
/** @type {any} */ (window).LENSIQ_RESEARCH_DEMO = /** @type {any} */ (window).LENSIQ_RESEARCH_DEMO !== false; // customer installation: = false

/* LENSIQ_PC_THAI_EQUIV (round 17 P9): Thai same-ingredient list on the travel card; off until the owner decides (L13) */
window.LENSIQ_PC_THAI_EQUIV = window.LENSIQ_PC_THAI_EQUIV === true;

/* palm v2 (2026-11-19, docs/acceptance/palm.md): off unless exactly true · LANDMARKS = MediaPipe hands (tier 2-U), demo profile only */
window.LENSIQ_PALM_V2 = window.LENSIQ_PALM_V2 === true;
window.LENSIQ_PALM_LANDMARKS = window.LENSIQ_PALM_LANDMARKS !== false;

/* LENSIQ_PROFILE: "commercial" (default, customer mode: research models off) | "demo"; result in window.LENSIQ_RESEARCH */
(function () {
  "use strict";
  var W = /** @type {any} */ (window), KEY = "lq-research-demo";
  var pre = W.LENSIQ_PROFILE, stored = null, legacy = null;
  try { if (typeof localStorage !== "undefined") { stored = localStorage.getItem(KEY); legacy = localStorage.getItem("lq-profile"); } } catch (e) { /* storage blocked: customer mode */ }
  var locked = W.LENSIQ_RESEARCH_DEMO === false ? "operator" : pre === "commercial" ? "profile" : null;
  var on = locked ? false : stored === "on" ? true : stored === "off" || legacy === "commercial" ? false : pre === "demo";
  W.LENSIQ_PROFILE = on ? "demo" : "commercial";
  W.LENSIQ_RESEARCH = { on: on, locked: locked, key: KEY, operatorDemo: pre === "demo" && !locked };
  if (!on) { W.LENSIQ_AGE_GENDER = false; W.LENSIQ_EXPRESSION = false; W.LENSIQ_FACEPARSE = false; W.LENSIQ_PALM_LANDMARKS = false; }
})();

/* LENSIQ_SELLER: seller details read by help, terms, privacy, the contact form and pricing; empty = neutral text.
 *   sales_open: true only when selling; tools/check-legal.mjs checks the required fields */
window.LENSIQ_SELLER = window.LENSIQ_SELLER || {
  sales_open: false,     // เปิดขายบริการแบบชำระเงินแล้วหรือยัง
  name: "",              // ชื่อนิติบุคคล/บุคคลผู้ให้บริการ (= SELLER_NAME)
  tax_id: "",            // เลขประจำตัวผู้เสียภาษี 13 หลัก (= SELLER_TAX_ID)
  address: "",           // ที่อยู่ (= SELLER_ADDRESS)
  email: "",             // อีเมลฝ่ายช่วยเหลือ
  line: "",              // LINE Official Account เช่น "@lensiq" (ช่องทางสำรองของแบบฟอร์มทั่วไป: กรอกแล้วแสดงบนหน้าเว็บทันที)
  quote_line: "@632yliiw", // LINE Official Account "LENSIQ" ของแบรนด์ สำหรับขอใบเสนอราคา (12 พ.ย. 2569) แสดงเฉพาะเมื่อ LENSIQ_LEADS_FORM เปิด
  dpo_name: "",          // ชื่อ / ตำแหน่ง DPO หรือผู้ติดต่อด้านข้อมูลส่วนบุคคล
  dpo_email: "",         // อีเมล DPO
  status_url: "",        // หน้าสถานะระบบ (https://…)
  effective_date: "",    // วันที่มีผลของข้อกำหนด/นโยบาย เช่น "1 ธันวาคม 2569"
  email_provider: "",    // ผู้ให้บริการอีเมลฝ่ายช่วยเหลือ (นโยบายความเป็นส่วนตัว ข้อผู้รับข้อมูล)
  email_provider_location: "",
  cookie_name: "",       // คุกกี้เซสชันสมาชิก (ปัจจุบันไม่มี: ใช้ Bearer token ใน sessionStorage)
  cookie_duration: "",
  anthropic_retention: "",
  counsel_confirmed: false // ทนายความยืนยันเกณฑ์อายุ ฐานการส่งข้อมูลต่างประเทศ และระยะเวลาเก็บแล้ว
};

/* LENSIQ_LEADS_FORM: quote requests to POST /v1/leads (on by owner order 2026-11-12); false = kept in the browser only */
window.LENSIQ_LEADS_FORM = window.LENSIQ_LEADS_FORM !== false;
/* LENSIQ_LEADS_NOTICE: "if sending fails, use LINE" note; off since 2026-11-16 (owner order); true turns it back on */
window.LENSIQ_LEADS_NOTICE = window.LENSIQ_LEADS_NOTICE === true;

/* round 12: warning bar on camera pages when the research demo is on outside the demo site (?profilebanner=1 forces it) */
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

/* loader: only with LENSIQ_API_BASE; same-origin files (CSP script-src 'self') */
(function () {
  "use strict";
  if (!/^https?:\/\//.test(String(window.LENSIQ_API_BASE || "")) || typeof document === "undefined") return;
  var me = /** @type {HTMLScriptElement|null} */ (document.currentScript);
  var dir = me && me.src ? me.src.replace(/[^/]*$/, "") : "";
  /** @param {string} file @param {string} global */
  var load = function (file, global) {
    if (/** @type {any} */ (window)[global] || document.querySelector('script[src*="' + file + '"]')) return;
    var s = document.createElement("script");
    s.src = dir + file + "?v=6"; // v6: fortune-pet merge (analytics page list)
    s.async = false; // keep order: api before analytics
    (document.head || document.documentElement).appendChild(s);
  };
  load("lensiq-api.js", "LQApi");
  // not on admin, pricing or counselling (77 ก)
  if (window.LENSIQ_ANALYTICS !== false && !/\/(admin|pricing|counselling)\.html$/.test(location.pathname)) load("lensiq-analytics.js", "LQAnalytics");
  // member sign-in (account chip in the header, light reading for guests) — inert unless the Worker reports
  // membership and LENSIQ_GOOGLE_CLIENT_ID is set; never on the back office
  // LENSIQ_MEMBER = false (set by a deploy config for a page that needs the API but no sign-in) skips it
  if (/** @type {any} */ (window).LENSIQ_MEMBER !== false && !/\/admin\.html$/.test(location.pathname)) load("lensiq-member.js", "LQMember");
  // fortune pages: analytics hook (no-op without consent) + Turnstile token for the AI writing assistant (when configured)
  if (/(fortune|faceread|palm|horoscope|tarot|fengshui|numbers|iching|zodiac|astro|dream|bazi|taksa|lek7|lifegraph)\.html$/.test(location.pathname)) load("lensiq-fortune-hook.js", "__lqFortuneHook");
})();

/* LENSIQ_TRYON: AI try-on (photobooth.js), matches backend TRYON; off = no /api/tryon/status call */
window.LENSIQ_TRYON = window.LENSIQ_TRYON === true;
/* LENSIQ_CONVERT_SERVER: PDF -> DOCX via server.py only; off = convert in the browser */
window.LENSIQ_CONVERT_SERVER = window.LENSIQ_CONVERT_SERVER === true;
/* LENSIQ_HELP_TOP_STICKY (75 ก): 1323 icon in the sticky bar; false = in the page */
window.LENSIQ_HELP_TOP_STICKY = window.LENSIQ_HELP_TOP_STICKY !== false;

/* LENSIQ_FORTUNE_THEME (decision 92): "a" = fortune theme; "classic" = previous look (docs/FORTUNE-THEME.md "Switch back") */
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
