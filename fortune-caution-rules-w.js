/* fortune-caution-rules-w.js — rule registry of the "สิ่งที่ควรระวัง" section (owner item 177), Western school. Data only; the browser
 * loads the per-page packs of tools/fortune-caution-pack.mjs. Shown only with LENSIQ_FORTUNE_CAUTIONS_CN_WEST (D-6: off until a
 * Western-school expert reviews). Only the Saturn return exists: transits, retrogrades and hard aspects need planet positions. */
(function (root) {
  "use strict";
  var RULES = [
    { id: "w.saturn.return", school: "w", domains: ["astro"], kind: "period", spans: ["years"], polarity: "caution", topic: "general",
      trigger: [{ id: "^saturn\\.return$" }], traditional: false, modern: true,
      sources: ["Ptolemy, Tetrabiblos (2nd c.): Saturn as the slow, restraining planet; its sidereal period of about 29.5 years",
        "Liz Greene, Saturn: A New Look at an Old Devil (1976): the Saturn return as a modern stage of life review"],
      kbRef: "lifecal.js:SATURN_RETURNS", status: "draft",
      mind: "w.saturn.return.mind",
      do: "w.saturn.return.do", doCat: "mindful",
      cheer: "w.saturn.return.cheer" },
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = RULES;
  else root.LQCautionRegistry = (root.LQCautionRegistry || []).concat(RULES);
})(typeof window !== "undefined" ? window : globalThis);
