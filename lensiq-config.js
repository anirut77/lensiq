/* lensiq-config.js — LENSIQ site settings (change here, not in page code).
 * LENSIQ_API_BASE: API server for AI readings, usage statistics and payments. "" (default) = no separate backend: AI readings use
 *   the page's own server (server.py) if any, else the on-device composer; no statistics, nothing sent, every page works offline.
 *   Cloudflare Worker (backend/, docs/BACKEND.md): set it to "https://api.example.com" (keeping a value set earlier),
 *   then run node tools/csp-meta.mjs (adds the origin to connect-src) and set ALLOWED_ORIGINS on the Worker
 *   (old server.py: LENSIQ_ALLOW_ORIGIN=https://<user>.github.io on the server, AI-SETUP.md) */
window.LENSIQ_API_BASE = window.LENSIQ_API_BASE || "";

/* LENSIQ_TURNSTILE_SITEKEY: Cloudflare Turnstile site key for the AI writing assistant on the Worker (pairs with the secret
 *   TURNSTILE_SECRET). "" (default) = off; **set it before going live** (keeps bots off the AI quota), then run node tools/csp-meta.mjs
 *   (adds https://challenges.cloudflare.com to the CSP only when set) */
window.LENSIQ_TURNSTILE_SITEKEY = window.LENSIQ_TURNSTILE_SITEKEY || "";

/* LENSIQ_GOOGLE_CLIENT_ID: OAuth 2.0 Web client ID from Google Cloud Console for member "Sign in with Google"; public, not a
 *   secret; must match GOOGLE_CLIENT_ID in backend/wrangler.toml. "" (default) = no membership: no sign-in button, no reading limit.
 *   After setting it run node tools/csp-meta.mjs (adds https://accounts.google.com/gsi/ only then). Google's script loads only when
 *   the visitor taps sign-in (docs/BACKEND.md "Member sign-in"). */
window.LENSIQ_GOOGLE_CLIENT_ID = window.LENSIQ_GOOGLE_CLIENT_ID || "";

/* LENSIQ_ANALYTICS: เมื่อตั้ง LENSIQ_API_BASE แล้ว จะโหลด lensiq-api.js + lensiq-analytics.js (ถามความยินยอมก่อนเสมอ,
 *   เคารพ Do-Not-Track) และ lensiq-fortune-hook.js บนหน้าดูดวง — ตั้งเป็น false เพื่อปิดสถิติทั้งหมด */
window.LENSIQ_ANALYTICS = window.LENSIQ_ANALYTICS !== false;

/* LENSIQ_MERIT_INTEREST_FORM (Merit MVP, 2026-11-12): แบบฟอร์ม "แจ้งความสนใจบริการทำบุญแทน" ใต้คำแนะนำตามความเชื่อบนหน้าดูดวง
 *   false (ค่าเริ่มต้น) = ไม่แสดงส่วนบริการแบบเสียเงินเลย — คำแนะนำฟรียังแสดงตามปกติ
 *   ห้ามเปิดจนกว่าทนายตอบ CTO-BRIEF L42 / L43 และเจ้าของตัดสินใจ — ต้องเปิดคู่กับ MERIT_INTEREST_FORM = "on" บน Worker
 *   (ตั้ง true อย่างเดียวไม่มีผล ถ้าเซิร์ฟเวอร์ไม่ตอบว่าเปิด) และไม่แสดงเลยระหว่างสถานะวิกฤตของหน้าดูดวง (เฉพาะเซสชันเบราว์เซอร์, L59) */
window.LENSIQ_MERIT_INTEREST_FORM = window.LENSIQ_MERIT_INTEREST_FORM === true;

/* LENSIQ_ORG_ACCOUNTS (org-p1, 2026-11-14): short organisation accounts (name, billing details, admins / staff, invite links,
 *   data export) on the account page (account-org.js) and the "organisation" tab of the back office. false (default) = nothing
 *   shown, no organisation request sent; do not turn on before the owner approves. Needs ORG_ACCOUNTS = "on" on the Worker too
 *   (true alone does nothing if the server does not say it is on); only a real true counts. */
window.LENSIQ_ORG_ACCOUNTS = window.LENSIQ_ORG_ACCOUNTS === true;

/* LENSIQ_FACEPARSE: the outfit studio uses BiSeNet (vendor/models/faceparse-bisenet-r18-q8.onnx) instead of the default model.
 *   false (default) = MediaPipe Selfie Multiclass (Apache-2.0, commercial use allowed). true = BiSeNet, trained on CelebAMask-HQ
 *   (research / non-commercial only; file not in git): only with the model file and a licence (vendor/models/FACEPARSE-LICENSE.txt)
 *   or for testing with ?faceparse=1 */
window.LENSIQ_FACEPARSE = window.LENSIQ_FACEPARSE === true;

/* LENSIQ_AGE_GENDER: ตัวเลือก "ใช้อายุ/เพศ" ของป้ายโฆษณา (signage.html) — โมเดล face-api.js ageGenderNet ฝึกจาก UTKFace
 *   (ข้อมูลอนุญาตเฉพาะงานวิจัย ไม่ใช่เชิงพาณิชย์ — LICENSES/THIRD_PARTY.md F5) โหลดเฉพาะเมื่อเปิดตัวเลือกนี้เท่านั้น
 *   ใช้ได้เฉพาะในโหมดเดโมงานวิจัย (ดู LENSIQ_PROFILE ด้านล่าง) · false = ซ่อนตัวเลือกและไม่โหลดโมเดลเลยแม้ในโหมดเดโม */
window.LENSIQ_AGE_GENDER = window.LENSIQ_AGE_GENDER !== false;

/* LENSIQ_FORTUNE_STRAIGHT (owner decision 2026-11-12: APPROVED; switched OFF again 2026-11-12 23:5x by the owner's standing
 *   order "if the fresh crisis review fails, turn it off immediately": docs/INCIDENT-2026-11-12-STRAIGHT-OFF.md): ตัวเลือก
 *   "ดูตรง ๆ / Read it straight / 直说" บนหน้าดูดวง · ต้องยืนยันอายุ 18+ ก่อน (จำไว้ในเครื่อง) · ผู้ที่ยังไม่ยืนยันหรือปิดตัวเลือก
 *   ได้ถ้อยคำนุ่มนวล · ระหว่างที่ตาข่ายวิกฤต ขั้นถามความรู้สึก หรือการ์ดช่วยเหลือทำงาน ไม่มีโหมดตรงและไม่มีเคล็ด/ของมงคล
 *   false = ซ่อนตัวเลือกทั้งหมด (tests/unit/fortune-honest.test.js ตรวจค่าที่ส่งมอบ) */
window.LENSIQ_FORTUNE_STRAIGHT = false;

/* fortune-paid switches: off */
window.LENSIQ_FORTUNE_PAID = window.LENSIQ_FORTUNE_PAID === true;
window.LENSIQ_FORTUNE_PLAN = window.LENSIQ_FORTUNE_PLAN === true;
window.LENSIQ_FORTUNE_SOURCES = window.LENSIQ_FORTUNE_SOURCES === true;
/* LENSIQ_PET_ZODIAC (owner spec 2026-11-19): the petread share card becomes a card the system draws (12 zodiac animals + a
 * secret card, independent of the reading, free) with a collection kept on this device. Off on the live site until the owner
 * approves the samples. LENSIQ_PET_CARD_CLASSIC (spec name PET_CARD_CLASSIC, decision 138 ข): true = the 4 classic colour
 * themes even with zodiac on; default false. LENSIQ_PET_ZODIAC_ODDS: odds preset of lensiq-pet-draw.js, "b" (decision 137 ข:
 * day's animal x2, secret 1 in 50, 1 in 10 on full-moon days) or "a" (all equal, 1 in 50). */
window.LENSIQ_PET_ZODIAC = window.LENSIQ_PET_ZODIAC === true;
window.LENSIQ_PET_CARD_CLASSIC = window.LENSIQ_PET_CARD_CLASSIC === true;
window.LENSIQ_PET_ZODIAC_ODDS = window.LENSIQ_PET_ZODIAC_ODDS || "b";

/* LENSIQ_LOOK_SALON (owner decision 2026-11-14, ข้อแนะนำการแต่งลุค ตัวเลือก ก): "โหมดร้าน" ของข้อแนะนำการแต่งลุค (แสดงชื่อแบบจาก
 *   แคตตาล็อกที่ร้านพิมพ์เอง) ปิดตายจนกว่าจะมีขั้นตอนให้คน (เจ้าของหรือ admin) อนุมัติข้อความที่ร้านพิมพ์ก่อนแสดง
 *   (docs/BEAUTY-IMAGE-DESIGN.md §4) ขั้นตอนนี้ยังไม่ได้สร้าง · ตั้ง true อย่างเดียวไม่มีผล: lensiq-look.js ต้องมีขั้นตอนอนุมัติด้วย
 *   ข้อแนะนำแบบคงที่ 31 ข้อและภาพตัวอย่างสดไม่ขึ้นกับสวิตช์นี้ (เทสต์ look ที่ล็อกไว้ 2026-11-14 ตรวจค่าที่ส่งมอบ: evals-locks/beauty-look.sha256) */
window.LENSIQ_LOOK_SALON = false;

/* LENSIQ_EXPRESSION (round 16): โมเดลสีหน้า face-api.js faceExpressionNet (ข้อมูลฝึกไม่ชัดเรื่องสิทธิ์ — F5) ที่หน้า neuro,
 *   signage (ยิ้ม/Valence/อารมณ์), booth (สีหน้าหลัก/Valence) และ photobooth (ตรวจสีหน้ารูปติดบัตร) ใช้
 *   ใช้ได้เฉพาะในโหมดเดโมงานวิจัย · false = ไม่โหลดแม้ในโหมดเดโม */
/** @type {any} */ (window).LENSIQ_EXPRESSION = /** @type {any} */ (window).LENSIQ_EXPRESSION !== false;

/* LENSIQ_RESEARCH_DEMO (round 16): สวิตช์ "เดโมงานวิจัย" ของแต่ละเครื่อง (cameras.html#profile และหน้าที่ใช้โมเดลวิจัย)
 *   true (ค่าเริ่มต้น) = ผู้ใช้เปิดเดโมงานวิจัยในเครื่องตัวเองได้ (ปิดไว้เป็นค่าเริ่มต้น จำไว้ในเครื่อง ปิดกลับได้ตลอด)
 *   false = **การติดตั้งให้ลูกค้า: ล็อกปิด** สวิตช์ใช้ไม่ได้ และไม่มีทางเปิดโมเดลอายุ/เพศหรือสีหน้าได้เลย
 *   (แก้บรรทัดนี้เป็น window.LENSIQ_RESEARCH_DEMO = false; ในชุดไฟล์ที่ส่งให้ลูกค้า) */
/** @type {any} */ (window).LENSIQ_RESEARCH_DEMO = /** @type {any} */ (window).LENSIQ_RESEARCH_DEMO !== false; // customer installation: = false

/* LENSIQ_PC_THAI_EQUIV (round 17 P9): การ์ด "โหมดเดินทาง" ในหน้าตรวจสินค้า (medicine.html, lensiq-pc-travel.js) แสดงรายชื่อสินค้าในไทย
 *   ที่มีตัวยาเดียวกับสินค้าต่างประเทศ (จาก TMT ฉบับ 17 ก.พ. 2563, CC BY — เป็นรายชื่อ ไม่ใช่คำแนะนำ ไม่ใช่ทะเบียน อย.)
 *   false (ค่าเริ่มต้น) = ปิด: การ์ดบอกว่ารอหนังสืออนุญาตใช้ข้อมูลทะเบียนจาก อย. (CTO-BRIEF L13) และให้ชื่อสามัญไปถามเภสัชกร
 *   true = เปิด (เจ้าของตัดสินใจเท่านั้น) · ต้องเป็น true จริงเท่านั้น ค่าอื่นถือว่าปิด */
window.LENSIQ_PC_THAI_EQUIV = window.LENSIQ_PC_THAI_EQUIV === true;

/* LENSIQ_PROFILE: ชุดค่าการติดตั้ง — "commercial" (ค่าเริ่มต้นตั้งแต่ round 16: โหมดลูกค้า ทุกเว็บรวม GitHub Pages) | "demo"
 *   โหมดลูกค้า: LENSIQ_AGE_GENDER = LENSIQ_EXPRESSION = LENSIQ_FACEPARSE = false — ไม่โหลดและไม่แสดงโมเดลอายุ/เพศ (UTKFace)
 *   และโมเดลสีหน้า · BiSeNet (ไม่ใช่เชิงพาณิชย์) ปิดค่าเริ่มต้น ลิงก์ทดสอบ ?faceparse=1 ใช้ได้เฉพาะเมื่อ LENSIQ_PROFILE === "demo" และเปิดเดโมงานวิจัย
 *   (PBHQ.faceparseAllowed ใน photobooth-hq.js ใช้ทั้ง studio.js และ photobooth-hq.js;
 *   ไฟล์โมเดลไม่อยู่ใน git จึงโหลดไม่ได้บนเว็บสาธิต) · โมเดลตรวจจับ/จุดใบหน้า/จดจำใบหน้าของ face-api.js ยังทำงานเหมือนเดิม
 *   (ยังรอความเห็นทนายความ LICENSES/THIRD_PARTY.md F5/F6 ป้าย "โมเดลใบอนุญาตวิจัย" บนหน้ากล้องจึงยังแสดงอยู่)
 *   "demo" = เดโมงานวิจัย: เปิดจากสวิตช์ในเครื่อง (localStorage "lq-research-demo" = "on") หรือผู้ติดตั้งตั้ง
 *   window.LENSIQ_PROFILE = "demo" ก่อนโหลดไฟล์นี้ (เครื่องสาธิต) — สวิตช์ในเครื่องยังปิดกลับได้
 *   ล็อกโหมดลูกค้า (สวิตช์เปิดไม่ได้): LENSIQ_RESEARCH_DEMO = false หรือผู้ติดตั้งตั้ง LENSIQ_PROFILE = "commercial" ไว้ก่อน
 *   ค่าเดิมของ round 12: localStorage "lq-profile" = "commercial" ยังหมายถึงปิดเดโมงานวิจัยในเครื่องนี้
 *   ผลรวมอยู่ใน window.LENSIQ_RESEARCH = { on, locked: null | "operator" | "profile", key } (lensiq-research.js ใช้แสดงสวิตช์) */
(function () {
  "use strict";
  var W = /** @type {any} */ (window), KEY = "lq-research-demo";
  var pre = W.LENSIQ_PROFILE, stored = null, legacy = null;
  try { if (typeof localStorage !== "undefined") { stored = localStorage.getItem(KEY); legacy = localStorage.getItem("lq-profile"); } } catch (e) { /* storage blocked: customer mode */ }
  var locked = W.LENSIQ_RESEARCH_DEMO === false ? "operator" : pre === "commercial" ? "profile" : null;
  var on = locked ? false : stored === "on" ? true : stored === "off" || legacy === "commercial" ? false : pre === "demo";
  W.LENSIQ_PROFILE = on ? "demo" : "commercial";
  W.LENSIQ_RESEARCH = { on: on, locked: locked, key: KEY, operatorDemo: pre === "demo" && !locked };
  if (!on) { W.LENSIQ_AGE_GENDER = false; W.LENSIQ_EXPRESSION = false; W.LENSIQ_FACEPARSE = false; }
})();

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

/* LENSIQ_LEADS_FORM: แบบฟอร์มขอใบเสนอราคาส่งถึงเซิร์ฟเวอร์ (POST /v1/leads แล้วเข้ากล่องรับในหลังบ้าน) ค่าเริ่มต้น: เปิด
 *   (คำสั่งเจ้าของ 12 พ.ย. 2569: เปิดแบบฟอร์มเมื่อกล่องรับ ข้อความความเป็นส่วนตัว และเกตพร้อม)
 *   เปิด: ส่งได้เฉพาะหน้าที่ตั้ง API ไว้ (deploy/public-site.json: index.html) พร้อม Turnstile; ข้อ "คำขอใบเสนอราคา" ใน
 *   privacy.html แสดง · ปิด (ตั้ง false ก่อนโหลดไฟล์นี้): ไม่ส่งอะไรออกจากเครื่อง เก็บคำขอไว้ในเบราว์เซอร์เท่านั้น และซ่อนข้อนั้น
 *   (docs/LEADS-DESIGN.md) */
window.LENSIQ_LEADS_FORM = window.LENSIQ_LEADS_FORM !== false;
/* LENSIQ_LEADS_NOTICE: ข้อความสั้นข้างแบบฟอร์มขอใบเสนอราคา "หากส่งไม่ได้ ติดต่อทาง LINE" พร้อม ID จาก LENSIQ_SELLER.quote_line (คำสั่งเจ้าของ 13 พ.ย. 2569:
 *   แสดงไว้จนกว่าแก้ปัญหาส่งบน iPhone และเจ้าของตรวจบน iPhone แล้ว) ปิดได้โดยตั้ง false */
/*   ปิดแล้ว 16 พ.ย. 2569 (คำสั่งเจ้าของ): เจ้าของยืนยันว่าส่งจาก iPhone ได้และแจ้งเตือน LINE ถึง (คำขอ b0011eb6, 15 พ.ย. 22:35)
 *   เปิดคืนได้โดยตั้ง true */
window.LENSIQ_LEADS_NOTICE = window.LENSIQ_LEADS_NOTICE === true;

/* round 12 (round 16 wording): ป้องกันการติดตั้งให้ลูกค้าที่ยังเปิดเดโมงานวิจัยค้างไว้ — บนหน้ากล้อง เมื่อเครื่องนี้เปิด
 *   "เดโมงานวิจัย" อยู่และหน้าเว็บไม่ได้เปิดจากเว็บสาธิต (github.io) หรือเครื่องนักพัฒนา (localhost) จะแสดงแถบเตือนด้านบน
 *   ว่าโมเดลใบอนุญาตวิจัยเปิดอยู่ พร้อมลิงก์ไปปิด (?profilebanner=1 บังคับแสดงเพื่อทดสอบ) ; สวิตช์อยู่ใน lensiq-research.js */
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
