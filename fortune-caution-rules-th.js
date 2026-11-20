/* fortune-caution-rules-th.js — rule registry of the "สิ่งที่ควรระวัง / Things to be mindful of" section (owner item 177), Thai
 * school (taksa and มหาทักษา; lek7 is kept below as excluded: one source only). Data only. The browser never loads this file:
 * tools/fortune-caution-pack.mjs writes one small pack per page domain and language (fortune-caution-pack-<domain>-<lang>.js).
 * Every rule comes from the discipline's own rules (kbRef = where the engine already holds it; sources = two references, rule 72);
 * status "draft" until an expert of the school confirms it (design 7.1). Wording: "be careful" only, never certain, never dated,
 * no prohibition; guidance (do) is a mindset or a good deed (doCat), faith-inclusive. Tests: tests/unit/fortune-caution-*.test.js. */
(function (root) {
  "use strict";
  var TAKSA = ["ทักษาปกรณ์ (ศิลปวัฒนธรรม: ทักษาปกรณ์ในการตั้งชื่อ, silpa-mag.com/?p=150762)", "มติชน: การลงภูมิทักษาตามวงทักษา (matichon.co.th/politics/news_1459820)"];
  var RULES = [
    { id: "th.kalakini", school: "th", domains: ["taksa", "horoscope"], kind: "overall", polarity: "caution", topic: "general",
      trigger: [{ id: "^tk\\.kalakini\\." }, { id: "^thai\\.kalakini\\." }], traditional: true, modern: false,
      sources: TAKSA.concat(["ไทยรัฐ: อักษรกาลกิณีตามวันเกิด (thairath.co.th/horoscope/belief/2531598)"]),
      kbRef: "lifecal-kb.js:kalakini", status: "draft",
      mind: "th.kalakini.mind",
      do: "th.kalakini.do", doCat: "mindful",
      cheer: "th.kalakini.cheer" },
    { id: "th.maha.kalakini", school: "th", domains: ["taksa"], kind: "period", spans: ["decade"], polarity: "caution", topic: "general",
      trigger: [{ id: "^maha\\.\\d\\.kalakini$" }], traditional: true, modern: false,
      sources: TAKSA.concat(["มหาทักษา: อายุจรตามวงทักษา (lifecal.js MAHA_YEARS)"]), kbRef: "lifecal-kb.js:kalakini", status: "draft",
      mind: "th.maha.kalakini.mind",
      do: "th.maha.kalakini.do", doCat: "mindful",
      cheer: "th.maha.kalakini.cheer" },
    { id: "th.sri", school: "th", domains: ["taksa"], kind: "overall", polarity: "good", topic: "money",
      trigger: [{ id: "^tk\\.sri\\." }], traditional: true, modern: false, sources: TAKSA, kbRef: "lifecal-kb.js:sri", status: "draft",
      luck: "th.sri.luck",
      do: "th.sri.do", doCat: "merit" },
    { id: "th.maha.good", school: "th", domains: ["taksa"], kind: "period", spans: ["decade"], polarity: "good", topic: "general",
      trigger: [{ id: "^maha\\.\\d\\.(?:sri|montri|det|utsaha)$" }], traditional: true, modern: false, sources: TAKSA, kbRef: "lifecal-kb.js:utsaha", status: "draft",
      luck: "th.maha.good.luck",
      do: "th.maha.good.do", doCat: "precepts" },
  ];
  /* excluded from the section (independent review 2026-11-20): rules that fail T5 (two independent sources) stay out until a second
     source is found; lifegraph's level bands were removed (their "sources" were the team's own weights) */
  var EXCLUDED_RULES = [
    { id: "lek7.weakbase", school: "th", domains: ["lek7"], kind: "overall", polarity: "caution", topic: "general", teamChoice: "threshold: mean - 3 (lifecal-kb.js L7_TONE), expert to confirm",
      trigger: [{ id: "^l7\\.\\d\\.caution$" }], traditional: true, modern: false,
      sources: ["ตำราเลข 7 ตัว 9 ฐาน ตามที่นิยมสอน (horoscope-kb.js sevenRows / sevenMeaning)"],
      noSecondSource: "no second independent source found; an expert must confirm the rule and its threshold (design 7.2)",
      kbRef: "lifecal-kb.js:L7_TONE", status: "draft",
      wording: "none in the register until a second source exists" },
  ];
  if (typeof module !== "undefined" && module.exports) { module.exports = RULES; module.exports.EXCLUDED_RULES = EXCLUDED_RULES; }
  else root.LQCautionRegistry = (root.LQCautionRegistry || []).concat(RULES);
})(typeof window !== "undefined" ? window : globalThis);
