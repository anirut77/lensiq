/* insights.js — จุดรวมสำหรับ Node/ทดสอบ: รวมทุกส่วนคำนวณของแดชบอร์ดรวม LENSIQ ไว้ใน require เดียว
   ส่วนคำนวณแยกเป็นโมดูล (ไม่ใช้ DOM ทดสอบด้วย Node ได้):
     insights-data.js      อ่าน/แปลงข้อมูลของทุกระบบ ช่วงเวลา ตัวชี้วัด CSV สำรอง/กู้คืน
     insights-demo.js      ข้อมูลตัวอย่าง
     insights-analysis.js  สถิติ (lensiq-stats.js) ความน่าเชื่อถือของข้อมูล เป้าหมาย แจ้งเตือน
     insights-cards.js     แปลผลเป็นภาษาคน รายงาน ส่งออก
     insights-i18n.js      ข้อความ TH (ค่าเริ่มต้น) ผ่าน LQI18N เมื่อมี
   ส่วนหน้าจอ: insights-charts.js (กราฟ SVG) + insights-ui.js (หน้า insights.html) — โหลดในเบราว์เซอร์เท่านั้น */
(function (root) {
  if (typeof module === "object" && module.exports) {
    module.exports = Object.assign({}, require("./insights-data.js"), require("./insights-demo.js"), require("./insights-analysis.js"), require("./insights-cards.js"));
  } else if (root) {
    // เบราว์เซอร์ (ถ้ามีหน้าใดโหลดไฟล์นี้): รวม namespace เดียว
    root.LQInsights = Object.assign({}, root.LQInsightsData, root.LQInsightsDemo, root.LQInsightsAnalysis, root.LQInsightsCards);
  }
})(typeof self !== "undefined" ? self : this);
