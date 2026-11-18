/* lensiq-outfit.js — LQOutfit: pure logic of the daily outfit and hair colour match (Style page S4, docs/STYLE-DESIGN.md
 * §1.4, §3.4). Browser: window.LQOutfit (needs window.LQColour) · Node: module.exports. No DOM, no network, no storage.
 *
 * Colours only: it measures the colours of clothes in a flat-lay or garment photo (no person in the picture) and scores
 * colours against colours. It never looks at or scores a person.
 *
 *   extract(img, {gains, card, whole, maxPx}) -> {status "ok"|"empty", colours [{lab, rgb, hex, share}], n, k}
 *       img = ImageData-like {data RGBA, width, height}. Pixels are sampled on a grid (<= maxPx, default 16 000), turned into
 *       CIELAB (card-corrected when `gains` from LQColour.cardStats are given), the card box is left out, and the
 *       background is the median colour of the frame border (pixels within max(8, 4 x border spread) of it, capped at 16,
 *       are background; `whole: true` = the garment fills the photo, nothing is removed). k-means in CIELAB for k = 1..5
 *       (k-means++ with a fixed seed, so the same photo gives the same colours), k chosen by the silhouette score (k = 1
 *       when no split reaches 0.25), clusters closer than CIEDE2000 8 merged, shares under 5 % dropped.
 *   pairRaw(p, q)      two-colour harmony CH of Ou & Luo, "A colour harmony model for two-colour combinations", Color Res.
 *                      Appl. 31(3), 2006: CH = HC + HL + HH (chromatic difference, lightness sum and difference, hue
 *                      effect of each colour). Re-implemented from the published equations; no code copied.
 *   toScore(raw) = round(100 / (1 + exp(-3 raw))) · bandOf(score): high >= 65, mid 40..64, low < 40
 *   harmony(items)     items [{lab, share}] -> {score, raw, band, reasons, pairs}; raw = mean of the pairs weighted by the
 *                      product of their shares; null score / band for fewer than two colours
 *   hairMatch(hairLab, items) -> {score, raw, band, best} | null   hair colour against the outfit colours (share-weighted)
 *   lucky(items, dayPlanet, goal, LQLucky) -> LQLucky.evaluate(families by share, dayPlanet, goal), unchanged
 *   suggest({items, harmony, lucky, hair}) -> [{key, i?, hex?, family?}]  reversible colour suggestions only (swap one
 *                      piece for a neutral, add a lighter / darker piece, add an accent in today's colour, a hair accessory
 *                      colour); keys from SUGGEST_KEYS
 */
(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./lensiq-colour.js") : /** @type {any} */ (root).LQColour;
  const REASON_KEYS = ["tonal", "analogous", "neutralAccent", "neutrals", "lightContrast", "strongCompete", "lowContrast"];
  const SUGGEST_KEYS = ["keep", "swapNeutral", "addContrast", "addAccentToday", "hairAccessory"];
  const HAIR = [
    { id: "black", hex: "#1b1a1a" }, { id: "darkBrown", hex: "#3b2a21" }, { id: "brown", hex: "#5b3f2e" }, { id: "lightBrown", hex: "#8a6446" },
    { id: "blonde", hex: "#b8925f" }, { id: "auburn", hex: "#7b3626" }, { id: "grey", hex: "#a9a7a3" }
  ];
  const NEUTRALS = ["#f4f3ef", "#e6dcc8", "#c7c7c4", "#8c8c8a", "#3a3a3c", "#1f1f21"];
  const NEUTRAL_C = 8, STRONG_C = 25;
  const rad = Math.PI / 180;

  // ---------- harmony (Ou & Luo 2006) ----------
  const hueOf = lab => (Math.atan2(lab[2], lab[1]) / rad + 360) % 360;
  const chromaOf = lab => Math.hypot(lab[1], lab[2]);
  function hueEffect(L, c, h) {
    const EC = 0.5 + 0.5 * Math.tanh(-2 + 0.5 * c);
    const HS = -0.08 - 0.14 * Math.sin((h + 50) * rad) - 0.07 * Math.sin((2 * h + 90) * rad);
    const x = (90 - h) / 10, EY = ((0.22 * L - 12.8) / 10) * Math.exp(x - Math.exp(x));
    return EC * (HS + EY);
  }
  /** @param {number[]} p Lab @param {number[]} q Lab */
  function pairRaw(p, q) {
    const c1 = chromaOf(p), c2 = chromaOf(q), h1 = hueOf(p), h2 = hueOf(q);
    let dh = Math.abs(h1 - h2); if (dh > 180) dh = 360 - dh;
    const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(dh * rad / 2), dC = Math.sqrt(dH * dH + ((c1 - c2) / 1.46) ** 2);
    const HC = 0.04 + 0.53 * Math.tanh(0.8 - 0.045 * dC);
    const HLsum = 0.28 + 0.54 * Math.tanh(-3.88 + 0.029 * (p[0] + q[0]));
    const HdL = 0.14 + 0.15 * Math.tanh(-2 + 0.2 * Math.abs(p[0] - q[0]));
    return HC + HLsum + HdL + hueEffect(p[0], c1, h1) + hueEffect(q[0], c2, h2);
  }
  /** @param {number} raw */
  const toScore = raw => Math.round(100 / (1 + Math.exp(-3 * raw)));
  /** @param {number} s */
  const bandOf = s => (s >= 65 ? "high" : s >= 40 ? "mid" : "low");
  const hueGap = (a, b) => { let d = Math.abs(hueOf(a) - hueOf(b)); return d > 180 ? 360 - d : d; };

  /** @param {{lab:number[]}[]} items */
  function reasonsOf(items) {
    const labs = items.map(i => i.lab), neutral = labs.map(l => chromaOf(l) < NEUTRAL_C), chrom = labs.filter((l, i) => !neutral[i]);
    const out = new Set();
    let maxGap = 0, maxDL = 0, compete = false;
    for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) {
      const dL = Math.abs(labs[i][0] - labs[j][0]);
      maxDL = Math.max(maxDL, dL);
      if (!neutral[i] && !neutral[j]) {
        const g = hueGap(labs[i], labs[j]);
        maxGap = Math.max(maxGap, g);
        if (chromaOf(labs[i]) >= STRONG_C && chromaOf(labs[j]) >= STRONG_C && g >= 60 && dL < 20) compete = true;
      }
    }
    if (!chrom.length) out.add("neutrals");
    else if (chrom.length === 1) out.add("neutralAccent");
    else if (chrom.length === labs.length) { if (maxGap <= 20) out.add("tonal"); else if (maxGap <= 60) out.add("analogous"); }
    if (maxDL >= 25) out.add("lightContrast");
    if (compete) out.add("strongCompete");
    if (maxDL < 10) out.add("lowContrast");
    return REASON_KEYS.filter(k => out.has(k));
  }

  /** @param {{lab:number[], share?:number}[]} items */
  function harmony(items) {
    const list = (items || []).filter(i => i && i.lab);
    if (list.length < 2) return { score: null, raw: null, band: null, reasons: [], pairs: [] };
    const pairs = [];
    let sw = 0, s = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const raw = pairRaw(list[i].lab, list[j].lab), w = (list[i].share || 0) * (list[j].share || 0);
      pairs.push({ i, j, raw }); sw += w; s += w * raw;
    }
    const raw = sw > 0 ? s / sw : pairs.reduce((a, p) => a + p.raw, 0) / pairs.length, score = toScore(raw);
    return { score, raw, band: bandOf(score), reasons: reasonsOf(list), pairs };
  }

  /** @param {number[]} hairLab @param {{lab:number[], share?:number}[]} items */
  function hairMatch(hairLab, items) {
    const list = (items || []).filter(i => i && i.lab);
    if (!hairLab || !list.length) return null;
    let sw = 0, s = 0, best = 0, bestRaw = -Infinity;
    list.forEach((it, i) => {
      const r = pairRaw(hairLab, it.lab), w = it.share || 0;
      sw += w; s += w * r;
      if (r > bestRaw) { bestRaw = r; best = i; }
    });
    const raw = sw > 0 ? s / sw : list.reduce((a, it) => a + pairRaw(hairLab, it.lab), 0) / list.length, score = toScore(raw);
    return { score, raw, band: bandOf(score), best };
  }

  // ---------- lucky-colour link (LQLucky, unchanged) ----------
  function lucky(items, dayPlanet, goal, L) {
    const LL = L || /** @type {any} */ (root).LQLucky;
    if (!LL) return null;
    const acc = new Map();
    for (const it of [...(items || [])].sort((a, b) => (b.share || 0) - (a.share || 0))) {
      const rgb = it.rgb || C.labToRgb(it.lab), fam = LL.classify(rgb[0], rgb[1], rgb[2]);
      acc.set(fam, (acc.get(fam) || 0) + (it.share || 0));
    }
    const list = [...acc.entries()].map(([family, share]) => ({ family, share })).sort((a, b) => b.share - a.share);
    return LL.evaluate(list, dayPlanet, goal);
  }

  // ---------- suggestions (reversible: colours of pieces and accessories only) ----------
  function suggest(o) {
    const items = (o && o.items) || [], h = (o && o.harmony) || harmony(items), out = [];
    if (!items.length) return out;
    if (h.band === "high") out.push({ key: "keep" });
    if (h.reasons.includes("strongCompete")) {
      let pick = -1;
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i].lab, b = items[j].lab;
        if (chromaOf(a) >= STRONG_C && chromaOf(b) >= STRONG_C && hueGap(a, b) >= 60 && Math.abs(a[0] - b[0]) < 20) {
          const k = (items[j].share || 0) <= (items[i].share || 0) ? j : i;
          if (pick < 0 || (items[k].share || 0) < (items[pick].share || 0)) pick = k;
        }
      }
      if (pick >= 0) {
        let best = NEUTRALS[0], bestScore = -Infinity;
        for (const hex of NEUTRALS) {
          const trial = items.map((it, i) => (i === pick ? { lab: C.hexToLab(hex), share: it.share } : it)), r = harmony(trial).raw;
          if (r != null && r > bestScore) { bestScore = r; best = hex; }
        }
        out.push({ key: "swapNeutral", i: pick, hex: best });
      }
    }
    if (h.reasons.includes("lowContrast") && h.band !== "high") {
      const meanL = items.reduce((s, it) => s + it.lab[0] * (it.share || 0), 0) / (items.reduce((s, it) => s + (it.share || 0), 0) || 1);
      out.push({ key: "addContrast", hex: meanL >= 50 ? NEUTRALS[4] : NEUTRALS[0] });
    }
    const lk = o && o.lucky;
    if (lk && lk.level >= 0 && lk.level < 3 && lk.accent && lk.accent.length) {
      const LL = /** @type {any} */ (root).LQLucky || (typeof module !== "undefined" && module.exports ? require("./lensiq-luckycolor.js") : null);
      const fam = lk.accent[0];
      out.push({ key: "addAccentToday", family: fam, hex: LL && LL.FAMILIES[fam] ? LL.FAMILIES[fam].hex : undefined });
    }
    if (o && o.hair) {
      const m = hairMatch(o.hair, items);
      if (m) out.push({ key: "hairAccessory", i: m.best, hex: C.rgbToHex(items[m.best].rgb || C.labToRgb(items[m.best].lab)) });
    }
    return out;
  }

  // ---------- colour extraction ----------
  let LUT = null;
  const lut = () => LUT || (LUT = Float64Array.from({ length: 256 }, (_, v) => C.srgbToLinear(v)));
  function labOfPixel(r, g, b, gains) {
    const T = lut(), k = gains || [1, 1, 1];
    return C.xyzToLab(C.linToXyz([T[r] * k[0], T[g] * k[1], T[b] * k[2]]));
  }
  const d76 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  function seeded(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

  /** k-means++ in Lab with a fixed seed @param {Float64Array} P flat Lab @param {number} n @param {number} k */
  function kmeans(P, n, k, seed) {
    const rnd = seeded(seed), cent = new Float64Array(k * 3), lab = new Int32Array(n), d2 = new Float64Array(n).fill(Infinity);
    let first = Math.floor(rnd() * n);
    cent.set([P[first * 3], P[first * 3 + 1], P[first * 3 + 2]], 0);
    for (let c = 1; c < k; c++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const dx = P[i * 3] - cent[(c - 1) * 3], dy = P[i * 3 + 1] - cent[(c - 1) * 3 + 1], dz = P[i * 3 + 2] - cent[(c - 1) * 3 + 2];
        d2[i] = Math.min(d2[i], dx * dx + dy * dy + dz * dz); sum += d2[i];
      }
      let t = rnd() * sum, pick = n - 1;
      for (let i = 0; i < n; i++) { t -= d2[i]; if (t <= 0) { pick = i; break; } }
      cent.set([P[pick * 3], P[pick * 3 + 1], P[pick * 3 + 2]], c * 3);
    }
    for (let it = 0; it < 20; it++) {
      let moved = 0;
      for (let i = 0; i < n; i++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < k; c++) {
          const dx = P[i * 3] - cent[c * 3], dy = P[i * 3 + 1] - cent[c * 3 + 1], dz = P[i * 3 + 2] - cent[c * 3 + 2], d = dx * dx + dy * dy + dz * dz;
          if (d < bd) { bd = d; best = c; }
        }
        if (lab[i] !== best) { lab[i] = best; moved++; }
      }
      const sum = new Float64Array(k * 3), cnt = new Float64Array(k);
      for (let i = 0; i < n; i++) { const c = lab[i]; cnt[c]++; sum[c * 3] += P[i * 3]; sum[c * 3 + 1] += P[i * 3 + 1]; sum[c * 3 + 2] += P[i * 3 + 2]; }
      for (let c = 0; c < k; c++) if (cnt[c]) for (let j = 0; j < 3; j++) cent[c * 3 + j] = sum[c * 3 + j] / cnt[c];
      if (it > 0 && !moved) break;
    }
    return { cent, lab };
  }
  /** mean silhouette on an evenly spaced subsample (<= 400 points) */
  function silhouette(P, n, lab, k) {
    const m = Math.min(n, 400), step = n / m, idx = Array.from({ length: m }, (_, i) => Math.floor(i * step));
    let total = 0;
    for (const i of idx) {
      const sum = new Float64Array(k), cnt = new Float64Array(k);
      for (const j of idx) {
        if (i === j) continue;
        const d = Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]);
        sum[lab[j]] += d; cnt[lab[j]]++;
      }
      const own = lab[i], a = cnt[own] ? sum[own] / cnt[own] : 0;
      let b = Infinity;
      for (let c = 0; c < k; c++) if (c !== own && cnt[c]) b = Math.min(b, sum[c] / cnt[c]);
      total += !cnt[own] || b === Infinity ? 0 : (b - a) / Math.max(a, b);
    }
    return total / m;
  }

  /**
   * @param {{data: ArrayLike<number>, width: number, height: number}} img
   * @param {{gains?: number[], card?: {x:number,y:number,w:number,h:number}|null, whole?: boolean, maxPx?: number}} [opts]
   */
  function extract(img, opts) {
    const o = opts || {}, W = img.width, H = img.height, maxPx = o.maxPx || 16000;
    const step = Math.max(1, Math.ceil(Math.sqrt((W * H) / maxPx))), band = Math.max(2, Math.round(Math.min(W, H) * 0.06));
    const cb = o.card ? { x: o.card.x - 4, y: o.card.y - 4, w: o.card.w + 8, h: o.card.h + 8 } : null;
    const labs = [], border = [];
    for (let y = Math.floor(step / 2); y < H; y += step) for (let x = Math.floor(step / 2); x < W; x += step) {
      if (cb && x >= cb.x && x < cb.x + cb.w && y >= cb.y && y < cb.y + cb.h) continue;
      const i = (y * W + x) * 4;
      if (img.data[i + 3] < 128) continue;
      const l = labOfPixel(img.data[i], img.data[i + 1], img.data[i + 2], o.gains);
      const edge = x < band || y < band || x >= W - band || y >= H - band;
      labs.push({ l, edge });
      if (edge) border.push(l);
    }
    let fg = labs.map(p => p.l);
    if (!o.whole && border.length) {
      const med = [0, 1, 2].map(c => C.median(border.map(l => l[c])));
      const spread = C.median(border.map(l => d76(l, med)));
      const thr = Math.min(16, Math.max(8, 4 * spread));
      fg = labs.filter(p => !p.edge && d76(p.l, med) > thr).map(p => p.l);
    }
    if (fg.length < Math.max(20, 0.02 * labs.length)) return { status: "empty", colours: [], n: fg.length, k: 0 };
    const n = fg.length, P = new Float64Array(n * 3);
    fg.forEach((l, i) => { P[i * 3] = l[0]; P[i * 3 + 1] = l[1]; P[i * 3 + 2] = l[2]; });
    let pick = { k: 1, cent: Float64Array.from(meanLab(P, n)), lab: new Int32Array(n) }, bestS = 0.25;
    for (let k = 2; k <= Math.min(5, n); k++) {
      const r = kmeans(P, n, k, 1000 + k), s = silhouette(P, n, r.lab, k);
      if (s > bestS + 1e-9) { bestS = s; pick = { k, cent: r.cent, lab: r.lab }; }
    }
    // clusters -> colours; merge closer than CIEDE2000 8 (largest first), drop shares under 5 %
    let cl = [];
    for (let c = 0; c < pick.k; c++) {
      let cnt = 0; const s = [0, 0, 0];
      for (let i = 0; i < n; i++) if (pick.lab[i] === c) { cnt++; s[0] += P[i * 3]; s[1] += P[i * 3 + 1]; s[2] += P[i * 3 + 2]; }
      if (cnt) cl.push({ lab: s.map(v => v / cnt), cnt });
    }
    cl.sort((a, b) => b.cnt - a.cnt);
    const merged = [];
    for (const c of cl) {
      const m = merged.find(x => C.deltaE2000(x.lab, c.lab) < 8);
      if (m) { const t = m.cnt + c.cnt; m.lab = m.lab.map((v, j) => (v * m.cnt + c.lab[j] * c.cnt) / t); m.cnt = t; } else merged.push({ lab: c.lab.slice(), cnt: c.cnt });
    }
    cl = merged.filter(c => c.cnt / n >= 0.05);
    const tot = cl.reduce((s, c) => s + c.cnt, 0);
    const colours = cl.sort((a, b) => b.cnt - a.cnt).map(c => {
      const lab = c.lab.map(v => Math.round(v * 100) / 100), rgb = C.labToRgb(lab);
      return { lab, rgb, hex: C.rgbToHex(rgb), share: c.cnt / tot };
    });
    return { status: "ok", colours, n, k: pick.k };
  }
  function meanLab(P, n) { const s = [0, 0, 0]; for (let i = 0; i < n; i++) { s[0] += P[i * 3]; s[1] += P[i * 3 + 1]; s[2] += P[i * 3 + 2]; } return s.map(v => v / n); }

  const api = { REASON_KEYS, SUGGEST_KEYS, HAIR, NEUTRALS, pairRaw, toScore, bandOf, harmony, hairMatch, lucky, suggest, extract };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQOutfit = api;
})(typeof window !== "undefined" ? window : globalThis);
