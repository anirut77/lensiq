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

/* LENSIQ_ANALYTICS: เมื่อตั้ง LENSIQ_API_BASE แล้ว จะโหลด lensiq-api.js + lensiq-analytics.js (ถามความยินยอมก่อนเสมอ,
 *   เคารพ Do-Not-Track) และ lensiq-fortune-hook.js บนหน้าดูดวง — ตั้งเป็น false เพื่อปิดสถิติทั้งหมด */
window.LENSIQ_ANALYTICS = window.LENSIQ_ANALYTICS !== false;

/* LENSIQ_FACEPARSE: สตูดิโอแต่งชุดใช้ BiSeNet (vendor/models/faceparse-bisenet-r18-q8.onnx) แทนโมเดลค่าเริ่มต้น
 *   false (ค่าเริ่มต้น) = MediaPipe Selfie Multiclass (Apache-2.0, vendor/models/selfie-multiclass-256-f16.onnx — ใช้เชิงพาณิชย์ได้)
 *   true = BiSeNet: น้ำหนักฝึกจาก CelebAMask-HQ (ใช้ได้เฉพาะงานวิจัย/ไม่ใช่เชิงพาณิชย์) ไฟล์ไม่อยู่ใน git
 *          เปิดเฉพาะเมื่อมีไฟล์โมเดลและสิทธิ์การใช้งานแล้ว (ดู vendor/models/FACEPARSE-LICENSE.txt) หรือทดสอบด้วย ?faceparse=1 */
window.LENSIQ_FACEPARSE = window.LENSIQ_FACEPARSE === true;

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
    s.src = dir + file + "?v=1";
    s.async = false; // keep order: api before analytics
    (document.head || document.documentElement).appendChild(s);
  };
  load("lensiq-api.js", "LQApi");
  // the back office (admin.html) and the pricing draft never load analytics
  if (window.LENSIQ_ANALYTICS === false || /\/(admin|pricing)\.html$/.test(location.pathname)) return;
  load("lensiq-analytics.js", "LQAnalytics");
  if (/(fortune|faceread|palm|horoscope|tarot|fengshui|numbers|iching|zodiac|astro|dream|bazi|taksa|lek7|lifegraph)\.html$/.test(location.pathname)) load("lensiq-fortune-hook.js", "__lqFortuneHook");
})();
