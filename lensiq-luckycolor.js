/* lensiq-luckycolor.js — LQLucky: pure logic for the lucky-colour outfit mirror (luckycolor.html).
 * Browser: window.LQLucky · Node: module.exports. No DOM, no network, no storage: numbers and colour names only.
 *
 * Tradition (สีมงคลประจำวัน, ทักษาจร): today's weekday planet starts the Taksa wheel at "บริวาร" and walks the Taksa
 * order (อาทิตย์ จันทร์ อังคาร พุธ เสาร์ พฤหัสบดี ราหู ศุกร์) — the same rule as horoscope.js taksa(). Each bhumi (ภูมิ)
 * then names the planet whose colour supports one area of life today:
 *   work (การงาน) = เดช (+ อุตสาหะ) · money (โชคลาภ) = ศรี (+ มูละ) · love (เสน่ห์ ความรัก) = ศรี (+ อายุ)
 *   support (ผู้ใหญ่อุปถัมภ์) = มนตรี (+ บริวาร)
 * POSITIVE FRAMING ONLY: the result never says "avoid" / "bad luck" and never names กาลกิณี. A colour that is not one of
 * today's supporting colours (or a neutral such as white / brown) is "a good base" with a suggested accent colour.
 *
 * API
 *   PLANETS[0..7]            {key, hexes} 0 Sun … 6 Sat, 7 Rahu (เทา)
 *   FAMILIES                 {key: {hex, planet|null}} colour families the classifier returns
 *   BHUMI                    bhumi keys in wheel order
 *   GOALS                    {work|money|love|support: {primary, secondary}} (bhumi keys)
 *   taksa(planet) -> {bhumi: planet}       bhumiOf(dayPlanet, planet) -> bhumi key | null
 *   dayPlanet(date) -> 0..6 (calendar weekday; the wearing tradition follows the calendar day)
 *   rgbToHsl(r, g, b) -> [h 0..360, s 0..1, l 0..1]     classify(r, g, b) -> family key
 *   familiesOf(planet) -> family keys                    recommend(dayPlanet, goal) -> {primary:{bhumi, planet, families}, secondary:{…}}
 *   faceBoxFromProb(prob, S, {cls=3, thr=.5, minPx}) -> {x0,y0,x1,y1} (mask px) | null
 *   clothesMaskFromProb(prob, S, {thr=.5, face}) -> {mask:Uint8Array(S*S), w:S, h:S, face, n, noFace}
 *     prob = softmax CHW from PBHQ.multiclassParse (0 bg, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others);
 *     keeps clothes pixels strictly BELOW the face box (a hat or a collar above the chin is not "the outfit").
 *   personMask(alpha, w, h, {thr=.5, headFrac=.24}) -> same shape (fallback: MediaPipe person mask minus the head band)
 *   guideMask(w, h) -> same shape (last fallback: a fixed box over the chest, the user frames the shirt)
 *   dominantColors(rgba, w, h, mask, {step=1, minShare=.04}) -> {n, list:[{family, share, rgb:[r,g,b]}]} (share desc)
 *     the mask (any size) is mapped onto the pixel grid by normalised coordinates
 *   smooth(prev, next, a=.5) -> blended list (EMA of shares, to stop flicker between frames)
 *   evaluate(list, dayPlanet, goal) -> {level 0..3, family, planet, bhumi|null, accent:[family], support:[{family, bhumi}]}
 *     3 = matches today's main colour for the goal · 2 = today's second colour for the goal ·
 *     1 = supports another area today (bhumi named) · 0 = a good neutral base, add an accent (no negative wording)
 */
(function (root) {
  "use strict";

  /** Planet colours as in horoscope-kb.js days[] (อาทิตย์แดง จันทร์เหลือง/ครีม อังคารชมพู พุธเขียว พฤหัสส้ม ศุกร์ฟ้า/น้ำเงิน เสาร์ม่วง/ดำ ราหูเทา) */
  const PLANETS = [
    { key: "sun", hexes: ["#e03131"] },
    { key: "mon", hexes: ["#f2b705", "#f3e5b5"] },
    { key: "tue", hexes: ["#e64980"] },
    { key: "wed", hexes: ["#2f9e44"] },
    { key: "thu", hexes: ["#f76707"] },
    { key: "fri", hexes: ["#4dabf7", "#1c3f94"] },
    { key: "sat", hexes: ["#7048e8", "#212529"] },
    { key: "rahu", hexes: ["#868e96"] }
  ];
  const FAMILIES = {
    red: { hex: "#e03131", planet: 0 },
    yellow: { hex: "#f2b705", planet: 1 },
    cream: { hex: "#f3e5b5", planet: 1 },
    pink: { hex: "#e64980", planet: 2 },
    green: { hex: "#2f9e44", planet: 3 },
    orange: { hex: "#f76707", planet: 4 },
    sky: { hex: "#4dabf7", planet: 5 },
    navy: { hex: "#1c3f94", planet: 5 },
    purple: { hex: "#7048e8", planet: 6 },
    black: { hex: "#212529", planet: 6 },
    grey: { hex: "#868e96", planet: 7 },
    white: { hex: "#f8f9fa", planet: null },
    brown: { hex: "#8b5a2b", planet: null }
  };
  const TAKSA_ORDER = [0, 1, 2, 3, 6, 4, 7, 5];
  const BHUMI = ["boriwan", "ayu", "dech", "sri", "mula", "utsaha", "montri", "kalakini"];
  const GOALS = {
    work: { primary: "dech", secondary: "utsaha" },
    money: { primary: "sri", secondary: "mula" },
    love: { primary: "sri", secondary: "ayu" },
    support: { primary: "montri", secondary: "boriwan" }
  };

  function taksa(planet) {
    const start = TAKSA_ORDER.indexOf(planet), out = {};
    if (start < 0) return out;
    BHUMI.forEach((b, i) => { out[b] = TAKSA_ORDER[(start + i) % 8]; });
    return out;
  }
  function bhumiOf(dayPlanet, p) {
    if (p == null) return null;
    const t = taksa(dayPlanet);
    for (const k of BHUMI) if (t[k] === p) return k;
    return null;
  }
  function dayPlanet(date) { return (date instanceof Date ? date : new Date(date)).getDay(); }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
    return [h, Math.min(1, s), l];
  }

  /** Colour family of one pixel (thresholds tuned for fabric under indoor light; dark / washed-out first, then hue). */
  function classify(r, g, b) {
    const [h, s, l] = rgbToHsl(r, g, b), chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    if (l < 0.13 || (l < 0.22 && chroma < 0.12)) return "black";
    if (chroma < 0.1 || s < 0.12) { if (l > 0.82) return "white"; if (l < 0.24) return "black"; return "grey"; }
    if (l > 0.93) return "white";
    if (h >= 35 && h < 65 && l > 0.72 && s < 0.75) return "cream";
    if (h < 12 || h >= 345) return l > 0.72 ? "pink" : (l < 0.25 ? "brown" : "red");
    if (h < 40) return l < 0.4 || (s < 0.45 && l < 0.55) ? "brown" : (l > 0.8 ? "cream" : "orange");
    if (h < 68) return l < 0.3 ? "brown" : "yellow";
    if (h < 165) return "green";
    if (h < 200) return "sky";
    if (h < 250) return l > 0.52 ? "sky" : "navy";
    if (h < 292) return "purple";
    return l < 0.3 ? "purple" : "pink";
  }

  function familiesOf(planet) { return Object.keys(FAMILIES).filter(k => FAMILIES[k].planet === planet); }
  function recommend(dp, goal) {
    const g = GOALS[goal] || GOALS.work, t = taksa(dp);
    const one = b => ({ bhumi: b, planet: t[b], families: familiesOf(t[b]) });
    return { goal: GOALS[goal] ? goal : "work", primary: one(g.primary), secondary: one(g.secondary) };
  }

  function faceBoxFromProb(prob, S, { cls = 3, thr = 0.5, minPx = 0 } = {}) {
    const n = S * S, off = cls * n, min = minPx || Math.max(12, Math.round(n * 0.002));
    let x0 = S, y0 = S, x1 = -1, y1 = -1, c = 0;
    for (let i = 0; i < n; i++) if (prob[off + i] > thr) {
      const x = i % S, y = (i / S) | 0; c++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return c >= min ? { x0, y0, x1, y1 } : null;
  }
  /** @param {Float32Array} prob @param {number} S @param {{thr?: number, face?: {x0:number,y0:number,x1:number,y1:number}|null}} [o] */
  function clothesMaskFromProb(prob, S, { thr = 0.5, face = undefined } = {}) {
    const n = S * S, mask = new Uint8Array(n), f = face === undefined ? faceBoxFromProb(prob, S) : face, off = 4 * n;
    const top = f ? f.y1 + 1 : 0;
    let c = 0;
    for (let i = top * S; i < n; i++) if (prob[off + i] > thr) { mask[i] = 1; c++; }
    return { mask, w: S, h: S, face: f, n: c, noFace: !f };
  }
  function personMask(alpha, w, h, { thr = 0.5, headFrac = 0.24 } = {}) {
    let y0 = h, y1 = -1;
    for (let i = 0; i < w * h; i++) if (alpha[i] > thr) { const y = (i / w) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const mask = new Uint8Array(w * h);
    if (y1 < 0) return { mask, w, h, face: null, n: 0, noFace: true };
    const top = Math.round(y0 + (y1 - y0 + 1) * headFrac);
    let c = 0;
    for (let i = top * w; i < w * h; i++) if (alpha[i] > thr) { mask[i] = 1; c++; }
    return { mask, w, h, face: { x0: 0, y0, x1: w - 1, y1: top - 1, approx: true }, n: c, noFace: false };
  }
  function guideMask(w, h) {
    const mask = new Uint8Array(w * h); let c = 0;
    for (let y = Math.round(h * 0.55); y < Math.round(h * 0.95); y++) for (let x = Math.round(w * 0.3); x < Math.round(w * 0.7); x++) { mask[y * w + x] = 1; c++; }
    return { mask, w, h, face: null, n: c, noFace: true, guide: true };
  }

  function dominantColors(rgba, w, h, m, { step = 1, minShare = 0.04 } = {}) {
    const acc = {};
    let n = 0;
    for (let y = 0; y < h; y += step) {
      const my = Math.min(m.h - 1, Math.floor((y + 0.5) * m.h / h));
      for (let x = 0; x < w; x += step) {
        const mx = Math.min(m.w - 1, Math.floor((x + 0.5) * m.w / w));
        if (!m.mask[my * m.w + mx]) continue;
        const i = (y * w + x) * 4;
        if (rgba[i + 3] < 128) continue;
        const k = classify(rgba[i], rgba[i + 1], rgba[i + 2]);
        const a = acc[k] || (acc[k] = { c: 0, r: 0, g: 0, b: 0 });
        a.c++; a.r += rgba[i]; a.g += rgba[i + 1]; a.b += rgba[i + 2]; n++;
      }
    }
    const list = Object.keys(acc).map(k => ({ family: k, share: acc[k].c / n, rgb: [acc[k].r / acc[k].c, acc[k].g / acc[k].c, acc[k].b / acc[k].c].map(Math.round) }))
      .filter(e => e.share >= minShare).sort((a, b) => b.share - a.share || (a.family < b.family ? -1 : 1));
    return { n, list };
  }

  function smooth(prev, next, a = 0.5) {
    if (!prev || !prev.length) return next.slice();
    const m = new Map();
    for (const e of prev) m.set(e.family, { family: e.family, share: e.share * (1 - a), rgb: e.rgb });
    for (const e of next) { const o = m.get(e.family); m.set(e.family, { family: e.family, share: (o ? o.share : 0) + e.share * a, rgb: e.rgb }); }
    const out = [...m.values()].filter(e => e.share >= 0.03), tot = out.reduce((s, e) => s + e.share, 0) || 1;
    return out.map(e => Object.assign(e, { share: e.share / tot })).sort((x, y) => y.share - x.share || (x.family < y.family ? -1 : 1));
  }

  function evaluate(list, dp, goal) {
    const rec = recommend(dp, goal), top = list && list[0];
    const accent = rec.primary.families.slice();
    if (!top) return { level: -1, family: null, planet: null, bhumi: null, accent, support: [], rec };
    const fam = FAMILIES[top.family], planet = fam ? fam.planet : null, b = bhumiOf(dp, planet);
    let level = 0;
    if (b && b === rec.primary.bhumi) level = 3;
    else if (b && b === rec.secondary.bhumi) level = 2;
    else if (b && b !== "kalakini") level = 1;
    // secondary colours in the outfit (>= 15 %) that support the goal — always good news, never a warning
    const support = list.slice(1).filter(e => e.share >= 0.15).map(e => ({ family: e.family, bhumi: bhumiOf(dp, FAMILIES[e.family] ? FAMILIES[e.family].planet : null) }))
      .filter(e => e.bhumi === rec.primary.bhumi || e.bhumi === rec.secondary.bhumi);
    return { level, family: top.family, planet, bhumi: level >= 1 ? b : null, accent: level === 3 ? [] : accent, support, rec };
  }

  const api = { PLANETS, FAMILIES, BHUMI, GOALS, TAKSA_ORDER, taksa, bhumiOf, dayPlanet, rgbToHsl, classify, familiesOf, recommend,
    faceBoxFromProb, clothesMaskFromProb, personMask, guideMask, dominantColors, smooth, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LQLucky = api;
})(typeof window !== "undefined" ? window : globalThis);
