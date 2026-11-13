/* lensiq-look-art.js — illustration cards for look suggestions (docs/BEAUTY-IMAGE-DESIGN.md §1, §2: hairstyle, facial hair
 * and earrings are shown as illustrated cards, not as a live preview). Every card is our own simple line drawing, written
 * here as inline SVG (no image file, no photo of a person, no external reference). Colour follows the text (currentColor);
 * the accent stroke uses --look-accent.
 *
 *   LQLookArt.svg(id) -> "<svg ...>...</svg>" (decorative: aria-hidden, the suggestion text sits next to it) | ""
 *   LQLookArt.IDS -> every card id
 */
(function (root) {
  "use strict";
  var FACE = '<path d="M30 14c-10 0-16 9-16 21 0 14 8 27 16 27s16-13 16-27c0-12-6-21-16-21z" class="f"/>';
  // eye pair (eyes at y 36) and a brow template for the brow cards (brows drawn by each card)
  var EYES = '<path d="M20 37q4-3 8 0q-4 2-8 0zM32 37q4-3 8 0q-4 2-8 0z" class="t"/>';
  /** a bigger single eye (for liner cards), drawn at 20..100 x, centre y 44 */
  var EYE = '<path d="M22 44q38-26 76 0q-38 22-76 0z" class="t"/><circle cx="60" cy="43" r="9" class="t"/><circle cx="60" cy="43" r="3.5" class="d"/>';
  var LIPS = '<path d="M26 40q10-12 22-6q12-6 22 6q-11 16-22 16t-22-16z" class="t"/><path d="M26 40q22 5 44 0" class="t"/>';
  /** @type {Record<string, string>} */
  var BODY = {
    // ---- brows (single brow over an eye, 120 x 80) ----
    "brow-arch": EYE + '<path d="M20 26q34-22 82-4" class="a w"/>',
    "brow-extend": EYE + '<path d="M24 24q24-12 50-8" class="t w"/><path d="M74 16q18 1 30 10" class="a w dash"/>',
    "brow-lift": EYE + '<path d="M20 26q30-10 52-10q14 0 30-8" class="a w"/>',
    "brow-define": EYE + '<path d="M20 26q36-18 84-6" class="a w"/><path d="M30 22l3-4M42 18l3-4M54 16l3-4M66 15l3-4M78 15l3-4M90 17l3-4" class="a"/>',
    "brow-fill": EYE + '<path d="M20 26q36-18 84-6" class="t w"/><path d="M44 18q12-4 24-3" class="a w"/>',
    "brow-open": '<path d="M6 30q20-10 42-6M72 24q22-4 42 6" class="t w"/><path d="M52 18v20M68 18v20" class="a dash"/>',
    // ---- liner (single eye) ----
    "liner-thin": EYE + '<path d="M22 44q38-26 76 0" class="a"/>',
    "liner-wing-short": EYE + '<path d="M22 44q38-26 76 0l10-8" class="a w"/>',
    "liner-wing-long": EYE + '<path d="M22 44q38-26 76 0l20-14" class="a w"/>',
    "liner-tight": EYE + '<path d="M24 44q36-24 72 0" class="a w"/>',
    // ---- lips ----
    "lip-warm": LIPS + '<path d="M28 41q20 4 40 0q-9 13-20 13t-20-13z" class="a fill"/>',
    "lip-center": LIPS + '<ellipse cx="48" cy="44" rx="9" ry="5" class="a fill"/>',
    "lip-matte": LIPS + '<path d="M27 40q10-11 21-5q11-6 21 5q-10 15-21 15t-21-15z" class="a fill"/>',
    "lip-gloss": LIPS + '<path d="M40 47q8 3 16 0" class="a"/><circle cx="58" cy="45" r="2" class="a fill"/>',
    // ---- hair (face outline + hairstyle) ----
    "hair-open": FACE + EYES + '<path d="M14 30q2-20 16-22q14 2 16 22" class="a w"/><path d="M14 30q-2 8 0 14M46 30q2 8 0 14" class="a"/>',
    "hair-cheek": FACE + EYES + '<path d="M14 34q0-24 16-24q16 0 16 24" class="a w"/><path d="M14 34q2 10 6 14M46 34q-2 10-6 14" class="a w"/>',
    "hair-chin": FACE + EYES + '<path d="M14 32q0-24 16-24q16 0 16 24q4 16 6 30M14 32q-4 16-6 30" class="a w"/><path d="M8 62q3 3 7 0M45 62q3 3 7 0" class="a"/>',
    "hair-colour": '<path d="M40 70q-6-30 4-52q12-14 32 0q10 22 4 52" class="t w"/><path d="M48 66q-3-22 2-40M60 66v-46M72 66q3-22-2-40" class="a w"/>',
    // ---- facial hair ----
    "beard-jaw": FACE + EYES + '<path d="M17 46q4 16 13 16q9 0 13-16" class="a w"/><path d="M24 50q6 3 12 0" class="t"/>',
    "beard-light": FACE + EYES + '<path d="M18 48q4 13 12 13q8 0 12-13" class="a dash"/><path d="M24 50q6 3 12 0" class="t"/>',
    "moustache": FACE + EYES + '<path d="M23 48q7-4 7 0q0-4 7 0" class="a w"/><path d="M25 52q5 2 10 0" class="t"/>',
    // ---- accessories ----
    "ear-drop": '<path d="M50 14q-14 0-14 18q0 12 10 16" class="t w"/><circle cx="48" cy="52" r="2" class="a fill"/><path d="M48 54v8M48 62q-6 8 0 12q6-4 0-12z" class="a w"/>',
    "ear-hoop": '<path d="M50 14q-14 0-14 18q0 12 10 16" class="t w"/><circle cx="48" cy="60" r="10" class="a w"/>',
    "ear-stud": '<path d="M50 14q-14 0-14 18q0 12 10 16" class="t w"/><circle cx="47" cy="50" r="4" class="a fill"/>',
    "ear-angular": '<path d="M50 14q-14 0-14 18q0 12 10 16" class="t w"/><path d="M48 52l-6 12h12z" class="a w"/>',
    "glasses-round": '<circle cx="38" cy="40" r="14" class="a w"/><circle cx="82" cy="40" r="14" class="a w"/><path d="M52 38q8-4 16 0M24 38l-12-4M96 38l12-4" class="a"/>',
    "glasses-rect": '<rect x="22" y="30" width="32" height="22" rx="5" class="a w"/><rect x="66" y="30" width="32" height="22" rx="5" class="a w"/><path d="M54 38q6-3 12 0M22 36l-10-3M98 36l10-3" class="a"/>',
    "glasses-cat": '<path d="M22 36q2 16 16 16q14 0 16-14q-14-8-32-10zM98 36q-2 16-16 16q-14 0-16-14q14-8 32-10z" class="a w"/><path d="M54 40q6-3 12 0" class="a"/>',
    "necklace-long": '<path d="M30 10q0 40 30 56q30-16 30-56" class="a w"/><circle cx="60" cy="68" r="4" class="a fill"/>'
  };
  // styles live in LQLook.CSS, scoped to .lq-look-art (an inline <style> here would leak to the whole page)
  var CSS = ".lq-look-art .f,.lq-look-art .t{fill:none;stroke:currentColor;stroke-width:1.6;opacity:.55}" +
    ".lq-look-art .a{fill:none;stroke:var(--look-accent,#a0466e);stroke-width:2}.lq-look-art .w{stroke-width:3.2;stroke-linecap:round}" +
    ".lq-look-art .dash{stroke-dasharray:4 3}.lq-look-art .fill{fill:var(--look-accent,#a0466e);fill-opacity:.55}.lq-look-art .d{fill:currentColor;opacity:.5}";

  /** @param {string} id @returns {string} */
  function svg(id) {
    var b = BODY[id];
    if (!b) return "";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80" aria-hidden="true" focusable="false" class="lq-look-art">' + b + "</svg>";
  }

  var api = { svg: svg, IDS: Object.keys(BODY), CSS: CSS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else /** @type {any} */ (root).LQLookArt = api;
})(typeof window !== "undefined" ? window : globalThis);
