"use strict";
// tests/fixtures/thai-sara-am-forms.js — FIXED TEST SET helper (thai-sara-am, locked 2026-11-14 before the fix; sha256 in
// evals-locks/thai-sara-am.sha256 and ~/LENSIQ-field/evals/thai-sara-am/locked.sha256).
// Thai sara am ำ (U+0E33) arrives in other shapes: decomposed as nikhahit U+0E4D + sara aa U+0E32 (NFKC does this; PDF
// copy-paste, some keyboards and OCR too), with the tone mark on either side of the nikhahit, with the tone mark typed AFTER
// ำ ("ลดนำ้หนัก"), and with zero-width characters inside the word. forms(text) returns every shape of one example.
const AM = "ำ", NIK = "ํ", AA = "า", TONE = "[่-๋]";

/** every shape of `s` (s written normally, composed ำ, tone mark before ำ) as [label, text]; duplicates dropped
 *  @param {string} s @param {{words?: string[]}} [o] words: the same text split into words (adds the spaced forms) */
function forms(s, o) {
  const dec = (/** @type {string} */ x) => x.normalize("NFKC"); // ำ -> ํ + า, tone mark stays before ํ
  const out = [
    ["composed", s],
    ["decomposed (NFKC)", dec(s)],
    ["decomposed, nikhahit before the tone mark", s.replace(new RegExp("(" + TONE + ")" + AM, "g"), NIK + "$1" + AA).replace(new RegExp(AM, "g"), NIK + AA)],
    ["tone mark typed after ำ", s.replace(new RegExp("(" + TONE + ")" + AM, "g"), AM + "$1")],
    ["decomposed, tone mark typed after า", s.replace(new RegExp("(" + TONE + ")" + AM, "g"), NIK + AA + "$1").replace(new RegExp(AM, "g"), NIK + AA)],
    ["zero-width space after ำ", s.replace(new RegExp(AM, "g"), AM + "​")],
    ["zero-width joiner between ํ and า", dec(s).replace(new RegExp(NIK, "g"), NIK + "‍")],
    ["zero-width non-joiner inside the word", s.replace(new RegExp(AM, "g"), "‌" + AM)],
  ];
  if (o && o.words) {
    out.push(["spaced", o.words.join(" ")]);
    out.push(["spaced + decomposed", dec(o.words.join(" "))]);
  }
  const seen = new Set();
  return out.filter(([, t]) => (seen.has(t) ? false : (seen.add(t), true)));
}

module.exports = { forms, AM, NIK, AA };
