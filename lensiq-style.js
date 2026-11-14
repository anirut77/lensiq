/* lensiq-style.js — LQStyle: pure logic of the personal colour palette (Style page; docs/STYLE-DESIGN.md §1.2, §1.3, §3).
 * Browser: window.LQStyle (needs window.LQColour) · Node: module.exports. No DOM, no network, no storage.
 *
 * Colours only: the module measures colours of skin patches and hair, places them on three colour dimensions and returns
 * the two closest colour seasons with a palette. It never scores the person, never outputs a skin-tone category and never
 * names a group of people. Undertone and season are OUR operational definitions (design §3.1), with provisional
 * owner-only thresholds in vendor/style/content.json (thresholds.version is carried into every result).
 *
 *   patchCentres(lm, w, h, {makeup})        skin patches from the 478-point face mesh (normalised x / y): both cheeks,
 *                                           forehead, chin; makeup mode = jaw edge and neck only (design §1.2 step 1)
 *   robustLab(labs) -> {lab, n} | null      trims the darkest and brightest 10 % (shadows, highlights), then drops pixels
 *                                           far from the median (brows, lips, hair), median again
 *   sampleRect / samplePatches / hairLab    card-corrected Lab of a rectangle, the skin patches, the hair mask
 *   measureFrame(img, {landmarks, card, hairMask, makeup}) -> {ok, reasons, skin, hair}
 *   aggregate(frames) -> {n, skin: {L, a, b, C, h}, hair, sd: {h, L}}   robust medians over frames, spread = confidence
 *   dimensions(agg, content) -> {warmth, value, chroma}   warmth: skin hue angle (+ a little hair hue); value: skin and hair
 *                                           L*; chroma: skin C*ab with hair-skin contrast
 *   applyDrapes(dims, {warmth|value|chroma: "a"|"b"|"skip"}, content)   the user's own drape choices (a = gold / light / clear)
 *   undertone(agg, content) -> {band, pos}  cool | neutral-cool | neutral | neutral-warm | warm | unsure; pos 0..1 on a bar
 *   closest(pos, content) -> [{id, parent, d}] all 12 seasons by distance
 *   result(frames, {drapes, makeup, cardShare}, content) -> status "ok" | "unsure" (never a guess: too few frames, card
 *                                           missing in most frames, or a high spread)
 *   toSaved(result, date) / fromSaved(obj, content)   opt-in "remember my palette": season ids, swatch hex, undertone band,
 *                                           date only (no image, no skin values)
 */
(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./lensiq-colour.js") : /** @type {any} */ (root).LQColour;
  const BANDS = ["cool", "neutral-cool", "neutral", "neutral-warm", "warm"];
  const DIMS = ["warmth", "value", "chroma"];
  // Face Mesh (MediaPipe Face Landmarker, 478 points) indices; centre = mean of the listed points, radius = k x face width
  const PATCHES = {
    leftCheek: { idx: [50, 101, 118, 117, 123], k: 0.07 },
    rightCheek: { idx: [280, 330, 347, 346, 352], k: 0.07 },
    forehead: { idx: [151, 108, 337, 9], k: 0.07 },
    chin: { idx: [175, 199, 200], k: 0.05 }
  };
  const MAKEUP_PATCHES = {
    jawLeft: { idx: [172, 136, 150], k: 0.05 },
    jawRight: { idx: [397, 365, 379], k: 0.05 },
    neck: { idx: [152], k: 0.06, down: 0.12 }
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lim = v => clamp(v, -1.5, 1.5);

  /** @param {{x:number,y:number}[]} lm normalised landmarks @param {number} w @param {number} h @param {{makeup?: boolean}} [opts] */
  function patchCentres(lm, w, h, opts) {
    if (!lm || lm.length < 400) return [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of lm) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const fw = (x1 - x0) * w, fh = (y1 - y0) * h, set = opts && opts.makeup ? MAKEUP_PATCHES : PATCHES, out = [];
    for (const id of Object.keys(set)) {
      const P = /** @type {any} */ (set)[id];
      let sx = 0, sy = 0;
      for (const i of P.idx) { sx += lm[i].x; sy += lm[i].y; }
      const x = (sx / P.idx.length) * w, y = (sy / P.idx.length) * h + (P.down || 0) * fh;
      out.push({ id, x: clamp(x, 0, w - 1), y: clamp(y, 0, h - 1), r: Math.max(2, P.k * fw) });
    }
    return out;
  }

  /** @param {number[][]} labs @returns {{lab: number[], n: number} | null} */
  function robustLab(labs) {
    if (!labs || !labs.length) return null;
    const s = labs.slice().sort((p, q) => p[0] - q[0]), cut = Math.floor(s.length * 0.1);
    const mid = s.length - 2 * cut >= 3 ? s.slice(cut, s.length - cut) : s;
    const med = a => [0, 1, 2].map(i => C.median(a.map(v => v[i])));
    const m = med(mid), keep = mid.filter(v => Math.hypot(v[0] - m[0], v[1] - m[1], v[2] - m[2]) <= 10);
    const use = keep.length >= 3 ? keep : mid;
    return { lab: med(use), n: use.length };
  }

  /** card-corrected Lab of the pixels in a circle or rectangle (clipped and near-black pixels are skipped) */
  function collect(img, inside, x0, y0, x1, y1, gains, step) {
    const out = [];
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, Math.ceil(y1)); y += step) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.width, Math.ceil(x1)); x += step) {
        if (!inside(x, y)) continue;
        const i = (y * img.width + x) * 4, r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
        if (r >= 250 || g >= 250 || b >= 250 || Math.max(r, g, b) < 12) continue;
        out.push(C.correctedLab([r, g, b], gains));
      }
    }
    return out;
  }
  /** @param {{data: ArrayLike<number>, width: number, height: number}} img @param {{x:number,y:number,w:number,h:number}} rect @param {number[]} gains */
  function sampleRect(img, rect, gains) {
    const step = rect.w * rect.h > 6000 ? 2 : 1;
    return robustLab(collect(img, () => true, rect.x, rect.y, rect.x + rect.w, rect.y + rect.h, gains, step));
  }

  /**
   * @param {{data: ArrayLike<number>, width: number, height: number}} img
   * @param {{x:number,y:number}[]} lm @param {number[]} gains @param {{makeup?: boolean}} [opts]
   * @returns {{skin: number[], patches: {id: string, lab: number[], n: number}[], cheekDiff: number} | null}
   */
  function samplePatches(img, lm, gains, opts) {
    const patches = [];
    for (const c of patchCentres(lm, img.width, img.height, opts)) {
      const r2 = c.r * c.r, step = c.r > 18 ? 2 : 1;
      const res = robustLab(collect(img, (x, y) => (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y) <= r2, c.x - c.r, c.y - c.r, c.x + c.r + 1, c.y + c.r + 1, gains, step));
      if (res && res.n >= 8) patches.push({ id: c.id, lab: res.lab, n: res.n });
    }
    if (!patches.length) return null;
    const skin = [0, 1, 2].map(i => C.median(patches.map(p => p.lab[i])));
    const lc = patches.find(p => p.id === "leftCheek"), rc = patches.find(p => p.id === "rightCheek");
    return { skin, patches, cheekDiff: lc && rc ? C.deltaE2000(lc.lab, rc.lab) : 0 };
  }

  /**
   * @param {{data: ArrayLike<number>, width: number, height: number}} img
   * @param {{data: ArrayLike<number>, w: number, h: number}} mask hair probability / 0-1 mask in its own resolution
   * @param {number[]} gains
   */
  function hairLab(img, mask, gains) {
    if (!mask || !mask.data || !mask.w || !mask.h) return null;
    const sx = mask.w / img.width, sy = mask.h / img.height;
    const inside = (x, y) => mask.data[Math.min(mask.h - 1, Math.floor(y * sy)) * mask.w + Math.min(mask.w - 1, Math.floor(x * sx))] >= 0.5;
    const res = robustLab(collect(img, inside, 0, 0, img.width, img.height, gains, 2));
    return res && res.n >= 8 ? res.lab : null;
  }

  /**
   * @param {{data: ArrayLike<number>, width: number, height: number}} img
   * @param {{landmarks?: {x:number,y:number}[]|null, card?: any, hairMask?: any, makeup?: boolean}} o
   */
  function measureFrame(img, o) {
    const reasons = [];
    if (!o.card || !o.card.ok || !o.card.gains) reasons.push("card");
    if (!o.landmarks || o.landmarks.length < 400) reasons.push("face");
    if (reasons.length) return { ok: false, reasons, skin: null, hair: null };
    const p = samplePatches(img, /** @type {any} */ (o.landmarks), o.card.gains, { makeup: !!o.makeup });
    if (!p) return { ok: false, reasons: ["skin"], skin: null, hair: null };
    return { ok: true, reasons: [], skin: p.skin, hair: o.hairMask ? hairLab(img, o.hairMask, o.card.gains) : null, cheekDiff: p.cheekDiff };
  }

  /** @param {{ok?: boolean, skin?: number[]|null, hair?: number[]|null}[]} frames */
  function aggregate(frames) {
    const ok = (frames || []).filter(f => f && f.ok !== false && f.skin);
    if (!ok.length) return { n: 0, skin: null, hair: null, sd: { h: Infinity, L: Infinity } };
    const med = (arr, i) => C.median(arr.map(v => v[i]));
    const sk = ok.map(f => /** @type {number[]} */ (f.skin)), lab = [0, 1, 2].map(i => med(sk, i)), l = C.lch(lab);
    const hs = ok.filter(f => f.hair).map(f => /** @type {number[]} */ (f.hair));
    const hair = hs.length >= Math.max(1, ok.length / 3) ? [0, 1, 2].map(i => med(hs, i)) : null;
    return { n: ok.length, skin: { L: lab[0], a: lab[1], b: lab[2], C: l.C, h: l.h }, hair: hair ? { L: hair[0], a: hair[1], b: hair[2] } : null,
      sd: { h: C.robustSd(sk.map(v => C.lch(v).h)), L: C.robustSd(sk.map(v => v[0])) } };
  }

  /** @param {any} agg @param {any} content @returns {{warmth: number, value: number, chroma: number}} */
  function dimensions(agg, content) {
    const t = content.thresholds, s = agg.skin, hair = agg.hair;
    let warmth = (s.h - t.hue.neutral) / t.hue.scale, value = (s.L - t.value.skinMid) / t.value.skinScale, chroma = (s.C - t.chroma.mid) / t.chroma.scale;
    if (hair) {
      const hl = C.lch([hair.L, hair.a, hair.b]);
      if (hl.C >= t.hairHue.minC) warmth = (1 - t.hairHue.weight) * warmth + t.hairHue.weight * ((hl.h - t.hairHue.neutral) / t.hairHue.scale);
      value = (1 - t.value.hairWeight) * value + t.value.hairWeight * ((hair.L - t.value.hairMid) / t.value.hairScale);
      chroma = (1 - t.chroma.contrastWeight) * chroma + t.chroma.contrastWeight * ((s.L - hair.L - t.chroma.contrastMid) / t.chroma.contrastScale);
    }
    return { warmth: lim(warmth), value: lim(value), chroma: lim(chroma) };
  }

  /** @param {{warmth: number, value: number, chroma: number}} dims @param {any} drapes @param {any} content */
  function applyDrapes(dims, drapes, content) {
    const step = content.thresholds.drape, out = { warmth: dims.warmth, value: dims.value, chroma: dims.chroma };
    for (const d of DIMS) {
      const c = drapes && drapes[d];
      if (c === "a") out[d] = lim(out[d] + step); else if (c === "b") out[d] = lim(out[d] - step);
    }
    return out;
  }

  /** @param {any} agg @param {any} content @returns {{band: string, pos: number}} */
  function undertone(agg, content) {
    const t = content.thresholds, e = t.hue.bands;
    if (!agg || !agg.skin || agg.n < t.unsure.minFrames || !(agg.sd.h <= t.unsure.sdHue)) return { band: "unsure", pos: 0.5 };
    const h = agg.skin.h;
    let i = 0;
    while (i < e.length && h >= e[i]) i++;
    return { band: BANDS[i], pos: clamp((h - (e[0] - 4)) / (e[e.length - 1] + 4 - (e[0] - 4)), 0, 1) };
  }

  /** @param {{warmth: number, value: number, chroma: number}} pos @param {any} content */
  function closest(pos, content) {
    return content.seasons.map(s => ({ id: s.id, parent: s.parent, d: Math.hypot(pos.warmth - s.pos.warmth, pos.value - s.pos.value, pos.chroma - s.pos.chroma) }))
      .sort((p, q) => p.d - q.d);
  }

  /** @param {any} agg @param {{warmth:number,value:number,chroma:number}} dims measured (before drapes) @param {any} drapes @param {any} opts @param {any} content */
  function confidence(agg, dims, drapes, opts, content) {
    const t = content.thresholds.confidence;
    let level = agg.sd.h <= t.highSdHue && agg.sd.L <= t.highSdL ? 2 : agg.sd.h <= t.medSdHue ? 1 : 0;
    let disagree = 0;
    for (const d of DIMS) {
      const c = drapes && drapes[d];
      if ((c === "a" && dims[d] <= -t.agreeMin) || (c === "b" && dims[d] >= t.agreeMin)) disagree++;
    }
    if (disagree) level = Math.min(level, 1) - (disagree >= 2 ? 1 : 0);
    if (opts && opts.makeup) level -= 1;
    if (opts && opts.cheekDiff > 6) level -= 1; // mixed light: the two cheeks differ
    return ["low", "medium", "high"][clamp(level, 0, 2)];
  }

  /** @param {string} seasonId @param {any} content */
  function palette(seasonId, content) {
    const s = content.seasons.find(x => x.id === seasonId);
    if (!s) return [];
    return s.palette.map(p => ({ id: p.c, hex: content.colours[p.c].hex, role: p.role, name: content.colours[p.c].name }));
  }

  /**
   * @param {any[]} frames per-frame measureFrame results (or {skin, hair})
   * @param {{drapes?: any, makeup?: boolean, cardShare?: number}} opts cardShare = share of frames with a usable card
   * @param {any} content
   */
  function result(frames, opts, content) {
    const o = opts || {}, t = content.thresholds, all = frames || [];
    const agg = aggregate(all), share = o.cardShare != null ? o.cardShare : all.length ? agg.n / all.length : 0;
    const drapes = { warmth: "skip", value: "skip", chroma: "skip" };
    for (const d of DIMS) if (o.drapes && (o.drapes[d] === "a" || o.drapes[d] === "b")) drapes[d] = o.drapes[d];
    const reasons = [];
    if (agg.n < t.unsure.minFrames) reasons.push("frames");
    if (share < t.unsure.minCardShare) reasons.push("card");
    if (agg.n && !(agg.sd.h <= t.unsure.sdHue)) reasons.push("spread");
    if (reasons.length) {
      return { status: "unsure", reasons, seasons: [], palette: [], undertone: { band: "unsure", pos: 0.5 }, confidence: "low", why: [], position: null,
        drapes, n: agg.n, thresholds: t.version };
    }
    const measured = dimensions(agg, content), pos = applyDrapes(measured, drapes, content), top = closest(pos, content);
    const cheeks = all.filter(f => f && f.ok !== false && typeof f.cheekDiff === "number").map(f => f.cheekDiff);
    const why = DIMS.map(d => ({ dim: d, dir: pos[d] >= 0.25 ? "pos" : pos[d] <= -0.25 ? "neg" : "mid" }));
    return {
      status: "ok", reasons: [], seasons: [top[0].id, top[1].id], palette: palette(top[0].id, content), undertone: undertone(agg, content),
      confidence: confidence(agg, measured, drapes, { makeup: !!o.makeup, cheekDiff: cheeks.length ? C.median(cheeks) : 0 }, content),
      why, position: { warmth: pos.warmth, value: pos.value, chroma: pos.chroma }, drapes, n: agg.n, thresholds: t.version
    };
  }

  const SAVED_KEYS = ["date", "seasons", "swatches", "undertone", "v"];
  /** @param {any} r @param {string} date YYYY-MM-DD */
  function toSaved(r, date) {
    if (!r || r.status !== "ok") return null;
    return { v: 1, seasons: r.seasons.slice(0, 2), undertone: r.undertone.band, swatches: r.palette.map(p => p.hex), date: String(date) };
  }
  /** @param {any} o @param {any} content */
  function fromSaved(o, content) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    if (Object.keys(o).sort().join() !== SAVED_KEYS.join()) return null;
    const ids = new Set(content.seasons.map(s => s.id));
    if (o.v !== 1 || !Array.isArray(o.seasons) || o.seasons.length !== 2 || o.seasons[0] === o.seasons[1] || !o.seasons.every(s => ids.has(s))) return null;
    if (!BANDS.includes(o.undertone)) return null;
    if (!Array.isArray(o.swatches) || !o.swatches.length || o.swatches.length > 24 || !o.swatches.every(h => typeof h === "string" && /^#[0-9a-f]{6}$/.test(h))) return null;
    if (typeof o.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return null;
    return { v: 1, seasons: o.seasons.slice(), undertone: o.undertone, swatches: o.swatches.slice(), date: o.date };
  }

  const api = { BANDS, DIMS, PATCHES, MAKEUP_PATCHES, patchCentres, robustLab, sampleRect, samplePatches, hairLab, measureFrame, aggregate,
    dimensions, applyDrapes, undertone, closest, confidence, palette, result, toSaved, fromSaved };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQStyle = api;
})(typeof window !== "undefined" ? window : globalThis);
