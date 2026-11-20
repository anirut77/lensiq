/* fortune-caution-rules-w.js — rule registry of the "สิ่งที่ควรระวัง" section (owner item 177), Western school. Data only; the browser
 * loads the per-page packs of tools/fortune-caution-pack.mjs. Shown only with LENSIQ_FORTUNE_CAUTIONS_CN_WEST (D-6: off until a
 * Western-school expert reviews). Only the Saturn return exists: transits, retrogrades and hard aspects need planet positions. */
(function (root) {
  "use strict";
  /** @param {string} th @param {string} en @param {string} zh */
  var T = function (th, en, zh) { return { th: th, en: en, zh: zh }; };
  var RULES = [
    { id: "w.saturn.return", school: "w", domains: ["astro"], kind: "period", spans: ["years"], polarity: "caution", topic: "general",
      trigger: [{ id: "^saturn\\.return$" }], traditional: false, modern: true,
      sources: ["Ptolemy, Tetrabiblos (2nd c.): Saturn as the slow, restraining planet; its sidereal period of about 29.5 years",
        "Liz Greene, Saturn: A New Look at an Old Devil (1976): the Saturn return as a modern stage of life review"],
      kbRef: "lifecal.js:SATURN_RETURNS", status: "draft",
      mind: T("ตามโหราศาสตร์ตะวันตกสมัยใหม่ ช่วงอายุนี้ตรงกับรอบการกลับมาของดาวเสาร์ ควรระวังการรับภาระเกินกำลังและการรีบเปลี่ยนแปลงเรื่องใหญ่",
        "In modern Western astrology this age falls in the Saturn return; be careful not to take on too much or to rush big changes.",
        "按现代西方占星，这一年龄段正值土星回归，留意承担过多或仓促做重大改变。"),
      do: T("มีสติ ทบทวนเป้าหมายระยะยาว และรับผิดชอบทีละขั้น", "Stay mindful: review your long-term goals and take on responsibility one step at a time.",
        "保持正念，回顾长远目标，一步一步承担责任。"), doCat: "mindful",
      cheer: T("ช่วงนี้มักเป็นช่วงที่วางรากฐานให้ชีวิตช่วงถัดไป", "This stage often lays the foundation for the next part of life.", "这一阶段往往为人生的下一段打下基础。") },
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = RULES;
  else root.LQCautionRegistry = (root.LQCautionRegistry || []).concat(RULES);
})(typeof window !== "undefined" ? window : globalThis);
