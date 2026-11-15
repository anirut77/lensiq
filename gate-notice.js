/* gate-notice.js — gate-notice.html: fills the trilingual (TH/EN/ZH) plate-camera poster and the privacy-notice template
 * from the form, live, and prints one of them. Nothing is stored or sent. */
(function () {
  "use strict";
  const $$ = s => /** @type {NodeListOf<any>} */ (document.querySelectorAll(s));
  const PURPOSE = {
    parking: ["คิดค่าจอดรถ ตรวจสอบการเข้าออก และความปลอดภัยของลานจอด", "parking fee calculation, entry/exit records and car-park security", "停车收费、进出记录和停车场安全"],
    village: ["ควบคุมการเข้าออกของรถ และความปลอดภัยของโครงการ", "vehicle access control and site security", "车辆出入管理和场所安全"]
  };
  const BLANK = { site: "[ชื่อสถานที่]", ctrl: "[ชื่อผู้ควบคุมข้อมูล]", contact: "[โทร/อีเมล]" };
  function val(k) { const i = document.querySelector(`[data-f="${k}"]`); return i ? String(/** @type {any} */ (i).value || "").trim() : ""; }
  function render() {
    const v = { site: val("site") || BLANK.site, ctrl: val("ctrl") || BLANK.ctrl, contact: val("contact") || BLANK.contact };
    const pur = PURPOSE[val("purpose")] || PURPOSE.parking, log = Math.max(7, Math.min(730, Math.round(+val("logDays") || 90))), img = Math.max(0, Math.min(30, Math.round(+val("imgDays") || 0)));
    const out = { ...v, logDays: String(log), purpose_th: pur[0], purpose_en: pur[1], purpose_zh: pur[2],
      img_zh: img ? `；车牌裁剪图保存 ${img} 天` : "；不保存图像", img_zh2: img ? "，以及仅含车牌的裁剪图" : "", imgTxt_zh: img ? `${img} 天` : "不保存",
      img_th: img ? ` ภาพครอปป้าย ${img} วัน` : " ไม่เก็บภาพ", img_en: img ? `; plate crops for ${img} days` : "; no images are kept",
      img_th2: img ? " และภาพครอปเฉพาะป้ายทะเบียน" : "", img_en2: img ? " and a crop of the plate only" : "",
      imgTxt_th: img ? `${img} วัน` : "ไม่เก็บ", imgTxt_en: img ? `${img} days` : "not kept" };
    $$("[data-out]").forEach(el => { const k = el.dataset.out; if (k in out && el.textContent !== out[k]) el.textContent = out[k]; });
  }
  $$("[data-f]").forEach(i => { i.addEventListener("input", render); i.addEventListener("change", render); });
  function printEl(id) {
    const el = document.getElementById(id);
    if (!el) return;
    $$(".gk-print-on").forEach(x => x.classList.remove("gk-print-on"));
    el.classList.add("gk-print-on"); document.body.classList.add("gk-printing");
    window.print();
    setTimeout(() => document.body.classList.remove("gk-printing"), 500);
  }
  const pp = document.getElementById("gnPrintPoster"), pn = document.getElementById("gnPrintNotice");
  if (pp) pp.addEventListener("click", () => printEl("gnPoster"));
  if (pn) pn.addEventListener("click", () => printEl("gnNotice"));
  render();
})();
