/* fortune-caution-rules-th.js — rule registry of the "สิ่งที่ควรระวัง / Things to be mindful of" section (owner item 177), Thai
 * school (taksa and มหาทักษา; lek7 is kept below as excluded: one source only). Data only. The browser never loads this file:
 * tools/fortune-caution-pack.mjs writes one small pack per page domain and language (fortune-caution-pack-<domain>-<lang>.js).
 * Every rule comes from the discipline's own rules (kbRef = where the engine already holds it; sources = two references, rule 72);
 * status "draft" until an expert of the school confirms it (design 7.1). Wording: "be careful" only, never certain, never dated,
 * no prohibition; guidance (do) is a mindset or a good deed (doCat), faith-inclusive. Tests: tests/unit/fortune-caution-*.test.js. */
(function (root) {
  "use strict";
  /** @param {string} th @param {string} en @param {string} zh */
  var T = function (th, en, zh) { return { th: th, en: en, zh: zh }; };
  var TAKSA = ["ทักษาปกรณ์ (ศิลปวัฒนธรรม: ทักษาปกรณ์ในการตั้งชื่อ, silpa-mag.com/?p=150762)", "มติชน: การลงภูมิทักษาตามวงทักษา (matichon.co.th/politics/news_1459820)"];
  var RULES = [
    { id: "th.kalakini", school: "th", domains: ["taksa", "horoscope"], kind: "overall", polarity: "caution", topic: "general",
      trigger: [{ id: "^tk\\.kalakini\\." }, { id: "^thai\\.kalakini\\." }], traditional: true, modern: false,
      sources: TAKSA.concat(["ไทยรัฐ: อักษรกาลกิณีตามวันเกิด (thairath.co.th/horoscope/belief/2531598)"]),
      kbRef: "lifecal-kb.js:kalakini", status: "draft",
      mind: T("ตามทักษา ดาวที่ตกภูมิกาลกิณีของคุณเป็นจุดที่ตำราให้ระวัง เรื่องสำคัญที่เกี่ยวกับดาวนี้ควรทำอย่างรอบคอบ",
        "In the taksa reading, the planet on your kalakini position is the point to be careful with: handle important matters linked to it with extra thought.",
        "按塔克萨，落在“卡拉吉尼”位置的星是需要留意之处，与它相关的重要事情宜多加斟酌。"),
      do: T("มีสติและค่อย ๆ คิดก่อนตัดสินใจเรื่องสำคัญ ความตั้งใจที่ดีของคุณสำคัญกว่าเสมอ", "Stay mindful and take your time before important decisions; your good intentions matter most.",
        "保持正念，重要决定前慢慢思考；您的善意与用心最重要。"), doCat: "mindful",
      cheer: T("ตำราถือว่าทุกคนมีทั้งดาวที่ต้องระวังและดาวที่ส่งเสริม การรู้จุดที่ต้องระวังช่วยให้คุณเลือกจังหวะได้ดีขึ้น",
        "By tradition everyone has both a planet to be careful with and planets that support them; knowing the first helps you choose your moments well.",
        "按传统，每个人都有需要留意的星，也有扶持自己的星；了解前者，能帮您更好地把握时机。") },
    { id: "th.maha.kalakini", school: "th", domains: ["taksa"], kind: "period", spans: ["decade"], polarity: "caution", topic: "general",
      trigger: [{ id: "^maha\\.\\d\\.kalakini$" }], traditional: true, modern: false,
      sources: TAKSA.concat(["มหาทักษา: อายุจรตามวงทักษา (lifecal.js MAHA_YEARS)"]), kbRef: "lifecal-kb.js:kalakini", status: "draft",
      mind: T("ช่วงอายุนี้อยู่ในมหาทักษาที่ตกภูมิกาลกิณี ตำราชี้ให้ระวังการตัดสินใจเรื่องใหญ่อย่างเร่งรีบ",
        "This stage of life falls in a Maha Taksa period on your kalakini position; tradition asks you to be careful with rushed big decisions.",
        "这段人生阶段处于落在“卡拉吉尼”位置的大塔克萨期，按传统要留意仓促做大决定。"),
      do: T("มีสติ ทำทีละขั้น และปรึกษาคนที่ไว้ใจก่อนลงมือ", "Stay mindful, go one step at a time, and talk to someone you trust before you act.", "保持正念，一步一步来，行动前先与信任的人商量。"), doCat: "mindful",
      cheer: T("ช่วงที่ต้องค่อย ๆ เดินคือช่วงที่วางรากฐานได้มั่นคง", "A stage that asks you to go slowly is a good stage for building firm foundations.", "需要放慢脚步的阶段，正适合打下稳固的基础。") },
    { id: "th.sri", school: "th", domains: ["taksa"], kind: "overall", polarity: "good", topic: "money",
      trigger: [{ id: "^tk\\.sri\\." }], traditional: true, modern: false, sources: TAKSA, kbRef: "lifecal-kb.js:sri", status: "draft",
      luck: T("ตามทักษา ภูมิศรีของคุณเป็นสิริมงคลด้านทรัพย์ จึงอาจมีโชคด้านการเงินจากความตั้งใจของคุณเอง",
        "In the taksa reading your sri position is auspicious for wealth, so you may have good fortune with money through your own effort.",
        "按塔克萨，您的“希利”位置主财运吉祥，您可能会凭自己的努力在钱财上有好运。"),
      do: T("แบ่งปันและช่วยเหลือคนที่ลำบากตามกำลัง ตามความเชื่อหรือศาสนาของท่าน", "Share and help people in need as you can, as your faith or religion teaches.",
        "量力分享、帮助有需要的人，按照您的信仰或宗教行善。"), doCat: "merit" },
    { id: "th.maha.good", school: "th", domains: ["taksa"], kind: "period", spans: ["decade"], polarity: "good", topic: "general",
      trigger: [{ id: "^maha\\.\\d\\.(?:sri|montri|det|utsaha)$" }], traditional: true, modern: false, sources: TAKSA, kbRef: "lifecal-kb.js:utsaha", status: "draft",
      luck: T("ช่วงอายุนี้อยู่ในมหาทักษาที่ตกภูมิดี อาจเป็นช่วงที่ความพยายามเห็นผล", "This stage of life falls in a favourable Maha Taksa position; it may be a time when effort shows results.",
        "这段人生阶段处于吉利的大塔克萨位置，可能是努力见成果的时候。"),
      do: T("รักษาศีลและทำความดีอย่างสม่ำเสมอ", "Keep the precepts and keep doing good, steadily.", "持戒，坚持行善。"), doCat: "precepts" },
  ];
  /* excluded from the section (independent review 2026-11-20): rules that fail T5 (two independent sources) stay out until a second
     source is found; lifegraph's level bands were removed (their "sources" were the team's own weights) */
  var EXCLUDED_RULES = [
    { id: "lek7.weakbase", school: "th", domains: ["lek7"], kind: "overall", polarity: "caution", topic: "general", teamChoice: "threshold: mean - 3 (lifecal-kb.js L7_TONE), expert to confirm",
      trigger: [{ id: "^l7\\.\\d\\.caution$" }], traditional: true, modern: false,
      sources: ["ตำราเลข 7 ตัว 9 ฐาน ตามที่นิยมสอน (horoscope-kb.js sevenRows / sevenMeaning)"],
      noSecondSource: "no second independent source found; an expert must confirm the rule and its threshold (design 7.2)",
      kbRef: "lifecal-kb.js:L7_TONE", status: "draft",
      mind: T("ผังเลข 7 ตัว 9 ฐานชี้ว่ามีบางภพที่พลังยังน้อย ควรใส่ใจเรื่องของภพนั้นมากขึ้นทีละน้อย",
        "Your seven-number, nine-base chart shows a house with little strength; be mindful to give that part of life a little more attention.",
        "七数九宫图显示有的宫位力量较弱，宜多留意，慢慢给予那方面更多关注。"),
      do: T("มีสติและให้เวลากับเรื่องของภพนั้นทีละน้อยอย่างสม่ำเสมอ", "Stay mindful and give that part of life a little time, steadily.", "保持正念，稳定地为那方面投入一点时间。"), doCat: "mindful",
      cheer: T("ภพที่พลังน้อยคือพื้นที่ที่เติบโตได้อีกมากเมื่อคุณใส่ใจ", "A house with little strength is room to grow when you give it care.", "力量较弱的宫位，用心照顾就有很大的成长空间。") },
  ];
  if (typeof module !== "undefined" && module.exports) { module.exports = RULES; module.exports.EXCLUDED_RULES = EXCLUDED_RULES; }
  else root.LQCautionRegistry = (root.LQCautionRegistry || []).concat(RULES);
})(typeof window !== "undefined" ? window : globalThis);
