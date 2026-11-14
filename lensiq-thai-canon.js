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
 * tests/unit/thai-sara-am-canon.test.js. Also jakoScript(s) / withoutJaKo(facts): Japanese / Korean script (owner decision
 * 2026-11-14; tests/unit/pc-jako-policy.test.js). */
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
  /* Japanese / Korean script (owner decision 2026-11-14, option ข and stricter): text with Japanese script (hiragana, katakana,
     or kanji in a Japanese context) or Korean script (hangul) is never sent to AI automatically, on any path. Shared here
     because every page that may send text loads this file (Product Check guard, fortune). Kanji in a Japanese context = a
     Japanese-only character form (shinjitai such as 薬 剤 様 県 歳 発 売, kokuji such as 働 込 畑), 々 / 〆, or a Japanese era
     date; Chinese text (simplified or traditional) without these does not count. Thai / full-width digits are folded first. */
  const JAKO_RE = new RegExp("[\\u3040-\\u30FF\\u31F0-\\u31FF\\uFF66-\\uFF9F\\u1100-\\u11FF\\u3130-\\u318F\\uA960-\\uA97F\\uAC00-\\uD7AF\\uD7B0-\\uD7FF" +
    "\\uFFA0-\\uFFDC\\u3200-\\u321E\\u3260-\\u327E\\u32D0-\\u32FE\\u3300-\\u3357\\u3005\\u3006\\u{1B000}-\\u{1B16F}]|" +
    "[薬剤様県歳発売読済険証検験効処亜歯髪涙塩経続総緑縁説変圧鉄粋渋姫黒恵帯気広辺沢浜栄斎駅図対楽価実単関拡勧権労円働込畑峠枠]|" +
    "(?:令和|平成|昭和|大正)\\s*(?:\\d|元年)", "u");
  /** @param {any} s @returns {boolean} */
  const jakoScript = s => JAKO_RE.test(canon(s).replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 0x0E50)).replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xFF10)));
  /** a copy of v with every string (and object key) in JA / KO script left out @param {any} v @returns {any} */
  const dropJK = v => (typeof v === "string" ? (jakoScript(v) ? undefined : v) : Array.isArray(v) ? v.map(dropJK).filter(x => x !== undefined)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => !jakoScript(k)).map(([k, x]) => [k, dropJK(x)]).filter(([, x]) => x !== undefined)) : v);
  /** Fortune facts (compact / Worker-cleaned shape) without JA / KO strings: an item whose label or id is dropped goes; an empty
   *  subject / extras goes. @param {any} f */
  function withoutJaKo(f) {
    const d = dropJK(f);
    if (!d || typeof d !== "object") return d;
    if (Array.isArray(d.items)) d.items = d.items.filter((/** @type {any} */ it) => it && it.label && it.id !== undefined);
    for (const k of ["subject", "extras"]) if (d[k] && typeof d[k] === "object" && !Object.keys(d[k]).length) delete d[k];
    return d;
  }
  return { canon, jakoScript, withoutJaKo };
});
