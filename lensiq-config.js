/* lensiq-config.js — ค่าตั้งของเว็บ LENSIQ (แก้ได้โดยไม่ต้องแตะโค้ดหน้าอื่น)
 *
 * LENSIQ_API_BASE: ที่อยู่เซิร์ฟเวอร์ API (Flask server.py) สำหรับฟีเจอร์ AI เช่น ดูดวง AI
 *   ""  (ค่าเริ่มต้น) = ใช้เซิร์ฟเวอร์เดียวกับหน้าเว็บ เช่น http://localhost:8000
 *   ตัวอย่างเมื่อนำ backend ไปโฮสต์แยก (หน้าเว็บอยู่บน GitHub Pages):
 *     window.LENSIQ_API_BASE = "https://lensiq-api.onrender.com";
 *   แล้วตั้ง LENSIQ_ALLOW_ORIGIN=https://<ชื่อผู้ใช้>.github.io บนเซิร์ฟเวอร์ (ดู AI-SETUP.md)
 */
window.LENSIQ_API_BASE = window.LENSIQ_API_BASE || "";

/* LENSIQ_FACEPARSE: สตูดิโอแต่งชุดใช้ BiSeNet (vendor/models/faceparse-bisenet-r18-q8.onnx) แทนโมเดลค่าเริ่มต้น
 *   false (ค่าเริ่มต้น) = MediaPipe Selfie Multiclass (Apache-2.0, vendor/models/selfie-multiclass-256-f16.onnx — ใช้เชิงพาณิชย์ได้)
 *   true = BiSeNet: น้ำหนักฝึกจาก CelebAMask-HQ (ใช้ได้เฉพาะงานวิจัย/ไม่ใช่เชิงพาณิชย์) ไฟล์ไม่อยู่ใน git
 *          เปิดเฉพาะเมื่อมีไฟล์โมเดลและสิทธิ์การใช้งานแล้ว (ดู vendor/models/FACEPARSE-LICENSE.txt) หรือทดสอบด้วย ?faceparse=1 */
window.LENSIQ_FACEPARSE = window.LENSIQ_FACEPARSE === true;
