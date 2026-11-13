/* lensiq-thai-canon.js — LQThaiCanon: one canonical shape of Thai text for MATCHING (browser: window.LQThaiCanon,
 * Node: module.exports; no dependencies). Independent review 2026-11-14: sara am ำ (U+0E33) arrives decomposed as nikhahit
 * U+0E4D + sara aa U+0E32 (NFKC does this; PDF copy-paste, some keyboards and OCR do too), with the tone mark typed after ำ
 * ("ลดนำ้หนัก"), or with zero-width characters inside a word. Patterns are written with ำ and the tone mark before it, so
 * those shapes slipped past the crisis net, the medicine emergency check, the Product Check guard and the fortune filter.
 *   canon(s): NFC; invisible characters removed (zero-width U+200B-U+200D, LRM / RLM U+200E-U+200F, word joiner and
 *   invisible operators U+2060-U+2064, U+FEFF, soft hyphen, CGJ U+034F, U+180E; thai-canon-2 review 2026-11-14);
 *   nikhahit + sara aa (with tone marks U+0E48-U+0E4B before or between them) -> tone marks + ำ; a tone mark typed after ำ moved before it. Idempotent;
 *   text that needs none of this is returned as NFC.
 * Use it on the copy that is MATCHED (the input of a check), not to rewrite what the user sees. Unit test:
 * tests/unit/thai-sara-am-canon.test.js. */
(function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m; else /** @type {any} */ (root).LQThaiCanon = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const NEED = /[\u0e4d\u200b-\u200f\u2060-\u2064\ufeff\u00ad\u180e]|\u034f|\u0e33[\u0e48-\u0e4b]/;
  const ZW = /[\u200b-\u200f\u2060-\u2064\ufeff\u00ad\u180e]|\u034f/g; // the invisible characters listed above
  const JOIN = /([่-๋]*)ํ([่-๋]*)า/g; // (tone) ํ (tone) า -> (tones) ำ
  const TONE_AFTER = /ำ([่-๋]+)/g; // ำ + tone -> tone + ำ
  /** the canonical copy of s for matching @param {any} s @returns {string} */
  function canon(s) {
    let t = String(s == null ? "" : s).normalize("NFC");
    if (!NEED.test(t)) return t;
    t = t.replace(ZW, "");
    for (let i = 0; i < 4; i++) {
      const next = t.replace(JOIN, "$1$2ำ").replace(TONE_AFTER, "$1ำ");
      if (next === t) break;
      t = next;
    }
    return t;
  }
  return { canon };
});
