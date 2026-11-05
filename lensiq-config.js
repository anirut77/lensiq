/* lensiq-config.js — ค่าตั้งของเว็บ LENSIQ (แก้ได้โดยไม่ต้องแตะโค้ดหน้าอื่น)
 *
 * LENSIQ_API_BASE: ที่อยู่เซิร์ฟเวอร์ API (Flask server.py) สำหรับฟีเจอร์ AI เช่น ดูดวง AI
 *   ""  (ค่าเริ่มต้น) = ใช้เซิร์ฟเวอร์เดียวกับหน้าเว็บ เช่น http://localhost:8000
 *   ตัวอย่างเมื่อนำ backend ไปโฮสต์แยก (หน้าเว็บอยู่บน GitHub Pages):
 *     window.LENSIQ_API_BASE = "https://lensiq-api.onrender.com";
 *   แล้วตั้ง LENSIQ_ALLOW_ORIGIN=https://<ชื่อผู้ใช้>.github.io บนเซิร์ฟเวอร์ (ดู AI-SETUP.md)
 */
window.LENSIQ_API_BASE = window.LENSIQ_API_BASE || "";
