/* lensiq-config.js — ค่าตั้งของเว็บ LENSIQ (แก้ได้โดยไม่ต้องแตะโค้ดหน้าอื่น)
 *
 * LENSIQ_API_BASE: ที่อยู่เซิร์ฟเวอร์ API สำหรับฟีเจอร์ AI (ดูดวง AI), สถิติการใช้งาน และการชำระเงิน
 *   ""  (ค่าเริ่มต้น) = ไม่มี backend แยก: ดูดวง AI ใช้เซิร์ฟเวอร์เดียวกับหน้าเว็บ (server.py เช่น http://localhost:8000)
 *       ถ้ามี ไม่เช่นนั้นใช้ตัวเรียบเรียงในเครื่อง — ไม่โหลดสถิติ ไม่ส่งข้อมูลใดออกไป ทุกหน้าใช้งานแบบออฟไลน์ได้เหมือนเดิม
 *   ตัวอย่าง Cloudflare Worker (backend/, ดู docs/BACKEND.md):
 *     window.LENSIQ_API_BASE = window.LENSIQ_API_BASE || "https://api.example.com";
 *   แล้วรัน node tools/csp-meta.mjs เพื่อเพิ่ม origin นี้ใน connect-src ของทุกหน้า และตั้ง ALLOWED_ORIGINS บน Worker
 *   (server.py แบบเดิม: ตั้ง LENSIQ_ALLOW_ORIGIN=https://<ชื่อผู้ใช้>.github.io บนเซิร์ฟเวอร์ — ดู AI-SETUP.md)
 */
window.LENSIQ_API_BASE = window.LENSIQ_API_BASE || "";

/* LENSIQ_TURNSTILE_SITEKEY: Cloudflare Turnstile site key สำหรับผู้ช่วยเขียน AI บน Worker (ใช้คู่กับ secret TURNSTILE_SECRET)
 *   ""  (ค่าเริ่มต้น) = ไม่ใช้ — **ต้องตั้งก่อนเปิดใช้งานจริง** (กันบอทใช้โควตา AI) แล้วรัน node tools/csp-meta.mjs
 *   (เพิ่ม https://challenges.cloudflare.com ใน CSP เฉพาะเมื่อตั้งค่านี้) */
window.LENSIQ_TURNSTILE_SITEKEY = window.LENSIQ_TURNSTILE_SITEKEY || "";

/* LENSIQ_GOOGLE_CLIENT_ID: OAuth 2.0 Client ID (ประเภท Web application) จาก Google Cloud Console สำหรับ "เข้าสู่ระบบด้วย Google"
 *   ของสมาชิก — เป็นค่าสาธารณะ (ไม่ใช่ความลับ) ต้องตรงกับ GOOGLE_CLIENT_ID ใน backend/wrangler.toml
 *   ""  (ค่าเริ่มต้น) = ไม่มีระบบสมาชิก: ไม่แสดงปุ่มเข้าสู่ระบบ ไม่จำกัดคำทำนาย ทุกหน้าทำงานเหมือนเดิม
 *   ตั้งค่าแล้วรัน node tools/csp-meta.mjs (เพิ่ม https://accounts.google.com/gsi/ ใน CSP เฉพาะเมื่อตั้งค่านี้)
 *   สคริปต์ของ Google โหลดเฉพาะเมื่อผู้ใช้กดปุ่มเข้าสู่ระบบเท่านั้น — ดู docs/BACKEND.md "Member sign-in" */
window.LENSIQ_GOOGLE_CLIENT_ID = window.LENSIQ_GOOGLE_CLIENT_ID || "";

/* LENSIQ_ANALYTICS: เมื่อตั้ง LENSIQ_API_BASE แล้ว จะโหลด lensiq-api.js + lensiq-analytics.js (ถามความยินยอมก่อนเสมอ,
 *   เคารพ Do-Not-Track) และ lensiq-fortune-hook.js บนหน้าดูดวง — ตั้งเป็น false เพื่อปิดสถิติทั้งหมด */
window.LENSIQ_ANALYTICS = window.LENSIQ_ANALYTICS !== false;

/* LENSIQ_FACEPARSE: สตูดิโอแต่งชุดใช้ BiSeNet (vendor/models/faceparse-bisenet-r18-q8.onnx) แทนโมเดลค่าเริ่มต้น
 *   false (ค่าเริ่มต้น) = MediaPipe Selfie Multiclass (Apache-2.0, vendor/models/selfie-multiclass-256-f16.onnx — ใช้เชิงพาณิชย์ได้)
 *   true = BiSeNet: น้ำหนักฝึกจาก CelebAMask-HQ (ใช้ได้เฉพาะงานวิจัย/ไม่ใช่เชิงพาณิชย์) ไฟล์ไม่อยู่ใน git
 *          เปิดเฉพาะเมื่อมีไฟล์โมเดลและสิทธิ์การใช้งานแล้ว (ดู vendor/models/FACEPARSE-LICENSE.txt) หรือทดสอบด้วย ?faceparse=1 */
window.LENSIQ_FACEPARSE = window.LENSIQ_FACEPARSE === true;

/* LENSIQ_AGE_GENDER: ตัวเลือก "ใช้อายุ/เพศ" ของป้ายโฆษณา (signage.html) — โมเดล face-api.js ageGenderNet ฝึกจาก UTKFace
 *   (ข้อมูลอนุญาตเฉพาะงานวิจัย ไม่ใช่เชิงพาณิชย์ — LICENSES/THIRD_PARTY.md F5) โหลดเฉพาะเมื่อเปิดตัวเลือกนี้เท่านั้น
 *   true (ค่าเริ่มต้น สำหรับเดโม) = แสดงตัวเลือก · false = ซ่อนตัวเลือกและไม่โหลดโมเดลเลย (ใช้งานเชิงพาณิชย์จนกว่าทนายความจะยืนยันสิทธิ์) */
window.LENSIQ_AGE_GENDER = window.LENSIQ_AGE_GENDER !== false;

/* LENSIQ_PROFILE: ชุดค่าการติดตั้ง — "demo" (ค่าเริ่มต้น) | "commercial"
 *   "commercial" = ติดตั้งให้ลูกค้าที่จ่ายเงิน: บังคับ LENSIQ_AGE_GENDER = false (ไม่โหลด/ไม่แสดงอายุ/เพศที่ฝึกจาก UTKFace)
 *   และ LENSIQ_FACEPARSE = false (BiSeNet ไม่ใช่เชิงพาณิชย์) แม้จะตั้งค่าอื่นไว้ก่อนหน้า — ตั้งก่อนโหลดไฟล์นี้ เช่น
 *   <script>window.LENSIQ_PROFILE = "commercial"</script> ; ป้าย "โมเดลใบอนุญาตวิจัย" บนหน้ากล้องยังแสดงอยู่
 *   เพราะโมเดลตรวจจับ/จดจำใบหน้าของ face-api.js ยังรอความเห็นทนายความ (LICENSES/THIRD_PARTY.md F5/F6) */
/* round 12: เลือก "ใช้งานเชิงพาณิชย์" ได้จากหน้า กล้องและการติดตั้ง (cameras.html#profile) — จำไว้ในเครื่องนี้ (localStorage "lq-profile")
 *   ค่าที่จำไว้เปลี่ยนได้เฉพาะ demo -> commercial เท่านั้น (ไม่เคยเปิดโมเดลวิจัยกลับมาเองเมื่อหน้าเว็บตั้ง commercial ไว้แล้ว) */
try { if (window.LENSIQ_PROFILE !== "commercial" && typeof localStorage !== "undefined" && localStorage.getItem("lq-profile") === "commercial") window.LENSIQ_PROFILE = "commercial"; } catch (e) { /* storage blocked */ }
window.LENSIQ_PROFILE = window.LENSIQ_PROFILE === "commercial" ? "commercial" : "demo";
if (window.LENSIQ_PROFILE === "commercial") { window.LENSIQ_AGE_GENDER = false; window.LENSIQ_FACEPARSE = false; }

/* LENSIQ_SELLER: ข้อมูลผู้ให้บริการ/ผู้ขาย — แหล่งเดียวที่หน้า ช่วยเหลือ ข้อกำหนด ความเป็นส่วนตัว (legal.js) แบบฟอร์มติดต่อ
 *   (lensiq-leads.js) และหน้าราคาอ่านไปแสดง กรอกที่นี่ที่เดียวแล้วทุกหน้าเปลี่ยนตาม ช่องที่ว่างจะแสดงข้อความกลาง
 *   "รายละเอียดผู้ให้บริการจะประกาศก่อนเปิดขาย / ติดต่อผ่านแบบฟอร์ม" แทนวงเล็บ [..]
 *   sales_open: true เฉพาะเมื่อเปิดขายจริงแล้ว — node tools/check-legal.mjs จะล้มเหลวถ้า sales_open (หรือ BILLING_ENABLED/
 *   FREE_MODE=false ใน backend/wrangler.toml) แต่ช่องที่จำเป็นยังว่าง (ต้องตรงกับ SELLER_* ใน wrangler.toml)
 *   ค่าที่เป็นตัวเลขร่าง (retention_*) ใช้แสดงในนโยบายความเป็นส่วนตัวพร้อมป้าย "ร่าง" จนกว่าทนายความยืนยัน */
window.LENSIQ_SELLER = window.LENSIQ_SELLER || {
  sales_open: false,     // เปิดขายบริการแบบชำระเงินแล้วหรือยัง
  name: "",              // ชื่อนิติบุคคล/บุคคลผู้ให้บริการ (= SELLER_NAME)
  tax_id: "",            // เลขประจำตัวผู้เสียภาษี 13 หลัก (= SELLER_TAX_ID)
  address: "",           // ที่อยู่ (= SELLER_ADDRESS)
  email: "",             // อีเมลฝ่ายช่วยเหลือ
  line: "",              // LINE Official Account เช่น "@lensiq"
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

/* round 12: ป้องกันการติดตั้งเชิงพาณิชย์ที่ลืมตั้งชุดค่า — บนหน้ากล้อง เมื่อชุดค่ายังเป็น "demo" และหน้าเว็บไม่ได้เปิดจากเว็บสาธิต
 *   (github.io) หรือเครื่องนักพัฒนา (localhost) จะแสดงแถบเตือนด้านบนว่าโมเดลใบอนุญาตวิจัยยังเปิดอยู่ พร้อมลิงก์ไปตั้งค่า
 *   (?profilebanner=1 บังคับแสดงเพื่อทดสอบ) ; และสวิตช์ #lqProfile ในหน้า cameras.html ใช้เปิด/ปิด "ใช้งานเชิงพาณิชย์" ของเครื่องนี้ */
(function () {
  "use strict";
  if (typeof document === "undefined" || typeof location === "undefined") return;
  var TXT = {
    th: { b: "ชุดค่า \"เดโม\" ยังเปิดอยู่บนเว็บนี้: โมเดลอายุ/เพศที่ฝึกจากข้อมูลใบอนุญาตวิจัย (UTKFace) ยังใช้ได้ ถ้าเป็นการติดตั้งเชิงพาณิชย์ให้เปิด \"ใช้งานเชิงพาณิชย์\"", a: "ตั้งค่าชุดการติดตั้ง",
          on: "เครื่องนี้: ใช้งานเชิงพาณิชย์ (ปิดโมเดลอายุ/เพศ UTKFace และ BiSeNet)", off: "เครื่องนี้: ชุดค่าเดโม (เปิดโมเดลใบอนุญาตวิจัยได้)", fixed: "หน้าเว็บนี้ตั้ง LENSIQ_PROFILE = \"commercial\" ไว้แล้ว" },
    en: { b: "The \"demo\" profile is still active on this site: the age/gender model trained on research-licence data (UTKFace) can still run. For a commercial installation, switch on \"Commercial use\"", a: "Installation profile settings",
          on: "This device: commercial use (UTKFace age/gender and BiSeNet models off)", off: "This device: demo profile (research-licence models allowed)", fixed: "This site already sets LENSIQ_PROFILE = \"commercial\"" },
    zh: { b: "本网站仍在使用“演示”配置：基于研究许可数据（UTKFace）训练的年龄/性别模型仍可运行。如为商业部署，请开启“商业使用”", a: "安装配置设置",
          on: "本设备：商业使用（已关闭 UTKFace 年龄/性别与 BiSeNet 模型）", off: "本设备：演示配置（允许使用研究许可模型）", fixed: "本网站已设置 LENSIQ_PROFILE = \"commercial\"" }
  };
  var lang = function () { var l = (window.LQI18N && window.LQI18N.lang) || document.documentElement.lang || "th"; return /^zh/.test(l) ? "zh" : /^en/.test(l) ? "en" : "th"; };
  var camPage = /(store|customers|attendance|driver|qc|signage|booth|cameras)\.html$/.test(location.pathname);
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
  function profileSwitch() {
    var cb = /** @type {HTMLInputElement|null} */ (document.getElementById("lqProfile")), st = document.getElementById("lqProfileState"); if (!cb) return;
    var stored = false; try { stored = localStorage.getItem("lq-profile") === "commercial"; } catch (e) { /* blocked */ }
    var fixed = window.LENSIQ_PROFILE === "commercial" && !stored;
    cb.checked = window.LENSIQ_PROFILE === "commercial"; cb.disabled = fixed;
    var fill = function () { var x = TXT[lang()]; if (st) st.textContent = fixed ? x.fixed : cb.checked ? x.on : x.off; };
    cb.addEventListener("change", function () {
      try { if (cb.checked) localStorage.setItem("lq-profile", "commercial"); else localStorage.removeItem("lq-profile"); } catch (e) { /* blocked */ }
      location.reload();
    });
    fill(); window.addEventListener("lq-lang", fill);
  }
  var go = function () { banner(); profileSwitch(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();

/* ตัวโหลด: เฉพาะเมื่อมี LENSIQ_API_BASE — ไฟล์มาจากต้นทางเดียวกับหน้าเว็บ (CSP script-src 'self') */
(function () {
  "use strict";
  if (!/^https?:\/\//.test(String(window.LENSIQ_API_BASE || "")) || typeof document === "undefined") return;
  var me = /** @type {HTMLScriptElement|null} */ (document.currentScript);
  var dir = me && me.src ? me.src.replace(/[^/]*$/, "") : "";
  /** @param {string} file @param {string} global */
  var load = function (file, global) {
    if (/** @type {any} */ (window)[global] || document.querySelector('script[src*="' + file + '"]')) return;
    var s = document.createElement("script");
    s.src = dir + file + "?v=2";
    s.async = false; // keep order: api before analytics
    (document.head || document.documentElement).appendChild(s);
  };
  load("lensiq-api.js", "LQApi");
  // the back office (admin.html) and the pricing draft never load analytics
  if (window.LENSIQ_ANALYTICS !== false && !/\/(admin|pricing)\.html$/.test(location.pathname)) load("lensiq-analytics.js", "LQAnalytics");
  // member sign-in (account chip in the header, light reading for guests) — inert unless the Worker reports
  // membership and LENSIQ_GOOGLE_CLIENT_ID is set; never on the back office
  if (!/\/admin\.html$/.test(location.pathname)) load("lensiq-member.js", "LQMember");
  // fortune pages: analytics hook (no-op without consent) + Turnstile token for the AI writing assistant (when configured)
  if (/(fortune|faceread|palm|horoscope|tarot|fengshui|numbers|iching|zodiac|astro|dream|bazi|taksa|lek7|lifegraph)\.html$/.test(location.pathname)) load("lensiq-fortune-hook.js", "__lqFortuneHook");
})();
