"use strict";
// tests/unit/style-colour.test.js — Personal Colour MVP (docs/STYLE-DESIGN.md, approved 2026-11-10: palette with the
// white-balance card step). FIXED TEST SET: written and hash-locked (evals-locks/beauty-look.sha256) BEFORE lensiq-colour.js,
// style.html and style.js were written. Never edited to make the product pass.
//
// The synthetic part is STYLE-DESIGN set "S" (synthetic, no people): our own 24 Lab patches and 90 synthetic skin colours
// rendered under 5 simulated lights (diagonal channel gains + small channel cross-talk + exposure + noise, a SIMPLIFIED camera
// model that this file defines independently of the product). Targets = STYLE-DESIGN §4.2 (proposed, S-D8), the ones that a
// synthetic set can measure. Numbers from this test are SYNTHETIC and are labelled so wherever they are shown.
//
//   C1 colour maths: sRGB <-> CIELAB (D65) round trip; CIEDE2000 on published test pairs (Sharma, Wu, Dalal 2005)
//   C2 card step: gains from a grey card; clipped / too dark / uneven / coloured cards are refused with a reason
//   C3 after the card step: median CIEDE2000 over 24 patches <= 4.0 and p90 <= 6.0 under every simulated light
//   C4 repeatability over 5 lights: within-person SD of skin h_ab <= 2.0 deg and of L* <= 2.0 (median person);
//      same undertone band in all lights >= 80 % of people ("unsure" counts as a miss); season top-1 the same >= 70 %,
//      top-2 contains the D65 top-1 >= 90 %; gap between L* tertiles <= 10 percentage points on each rate
//   C5 output: 5 undertone bands + "unsure"; 12 seasons under 4 parents; each parent palette >= 12 swatches with own names
//      TH / EN / ZH; no skin-tone category, ethnicity, whitening or beauty wording anywhere in the module's text
//   C6 privacy: no network, no storage of frames or Lab values of skin, no canvas export in the colour module
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const ROOT = join(__dirname, "..", "..");
const C = () => require("../../lensiq-colour.js");
const lint = () => require("../../lensiq-look-lint.js");

/* ---------------- independent reference maths for the simulation ---------------- */
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const enc = v => { const x = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(x * 255))); };
function labToLinear([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = t => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = 0.95047 * inv(fx), Y = inv(fy), Z = 1.08883 * inv(fz);
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
}
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
// simulated lights: channel gains and a small cross-talk (camera RGB mixing); exposure per capture
const LIGHTS = {
  A: { g: [1.0, 0.71, 0.37], x: 0.04 }, D50: { g: [1.0, 0.94, 0.81], x: 0.02 }, D65: { g: [1, 1, 1], x: 0 },
  F2: { g: [0.97, 1.0, 0.66], x: 0.05 }, F11: { g: [0.93, 1.0, 0.72], x: 0.05 }
};
function capture(linRGB, light, exposure) {
  const { g, x } = LIGHTS[light];
  const m = [linRGB[0] * (1 - 2 * x) + linRGB[1] * x + linRGB[2] * x, linRGB[1] * (1 - 2 * x) + linRGB[0] * x + linRGB[2] * x, linRGB[2] * (1 - 2 * x) + linRGB[0] * x + linRGB[1] * x];
  return m.map((v, i) => Math.max(0, Math.min(255, enc(Math.max(0, v * g[i] * exposure)) + Math.round(gauss() * 2))));
}
const samples = (lab, light, exposure, n = 25) => { const l = labToLinear(lab); return Array.from({ length: n }, () => capture(l, light, exposure)); };
const GREY = [50, 0, 0];
// our own 24 test patches (not any commercial chart): neutrals, skin-like, and moderately saturated colours
const PATCHES = [[96, 0, 0], [81, 0, 0], [66, 0, 0], [50, 0, 0], [35, 0, 0], [21, 0, 0], [66, 14, 18], [58, 16, 22], [45, 14, 20], [72, 10, 22], [38, 12, 14], [62, 18, 26],
  [52, -20, 20], [45, 30, 10], [60, 5, -30], [40, 20, -40], [70, -10, 40], [55, 40, 30], [48, -30, -10], [75, 5, 60], [35, 25, -25], [65, -25, 5], [42, 45, 25], [58, 0, -35]];
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
const p90 = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(0.9 * (s.length - 1) + 0.5))]; };
const sd = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

/* ---------------- C1 ---------------- */
test("C1 sRGB <-> CIELAB round trip and CIEDE2000 on published test pairs", () => {
  const { rgbToLab, labToRgb, deltaE2000 } = C();
  for (const rgb of [[0, 0, 0], [255, 255, 255], [119, 119, 119], [200, 150, 120], [30, 90, 200]]) {
    const back = labToRgb(rgbToLab(rgb));
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - rgb[i]) <= 1, `${rgb} -> ${back}`);
  }
  const L = rgbToLab([119, 119, 119]);
  assert.ok(Math.abs(L[0] - 50) < 0.6 && Math.abs(L[1]) < 0.3 && Math.abs(L[2]) < 0.3, "18% grey ~ L 50: " + L);
  const pairs = [[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425], [[50, 0, 0], [50, -1, 2], 2.3669], [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644]];
  for (const [a, b, e] of pairs) assert.ok(Math.abs(deltaE2000(a, b) - e) < 0.0005, `dE00 ${a} ${b}: ${deltaE2000(a, b)} vs ${e}`);
});

/* ---------------- C2 ---------------- */
test("C2 card step: gains from a grey card; clipped, dark, uneven and coloured cards are refused with a reason", () => {
  const { cardGains } = C();
  const ok = cardGains(samples(GREY, "A", 1));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.ok(ok.gains[2] > ok.gains[0], "warm light: blue gain larger");
  assert.equal(cardGains(samples([98, 0, 0], "D65", 1.6)).why, "clipped");
  assert.equal(cardGains(samples(GREY, "D65", 0.08)).why, "dark");
  const uneven = samples(GREY, "D65", 0.6, 12).concat(samples(GREY, "D65", 1.4, 13));
  assert.equal(cardGains(uneven).why, "uneven");
  assert.equal(cardGains(samples([50, 40, 30], "D65", 1)).why, "colour", "a red card is not a white / grey card under daylight");
});

/* ---------------- C3 ---------------- */
test("C3 after the card step: median CIEDE2000 over 24 patches <= 4.0 and p90 <= 6.0 under every simulated light", () => {
  const { cardGains, correct, rgbToLab, deltaE2000 } = C();
  const rows = [];
  for (const light of Object.keys(LIGHTS)) {
    const exp = 0.85 + 0.2 * rnd();
    const g = cardGains(samples(GREY, light, exp));
    assert.equal(g.ok, true, light + " card ok");
    const errs = PATCHES.map(p => {
      const px = samples(p, light, exp, 9).map(s => correct(s, g.gains));
      const mean = [0, 1, 2].map(i => median(px.map(q => q[i])));
      return deltaE2000(rgbToLab(mean), p);
    });
    rows.push({ light, median: +median(errs).toFixed(2), p90: +p90(errs).toFixed(2) });
  }
  console.log("C3 (synthetic) CIEDE2000 after card correction:", JSON.stringify(rows));
  for (const r of rows) assert.ok(r.median <= 4.0 && r.p90 <= 6.0, JSON.stringify(r));
});

/* ---------------- C4 ---------------- */
test("C4 repeatability over 5 lights (90 synthetic skin colours): hue / L* SD, same band, same season, tertile gap", () => {
  const { measure, undertone, seasons } = C();
  const people = [];
  for (let i = 0; i < 90; i++) {
    const t = i % 30, Lv = 35 + 40 * ((i * 7) % 90) / 89, h = 42 + 30 * rnd(), Cc = 14 + 16 * rnd();
    people.push({ L: Lv, lab: [Lv, Cc * Math.cos(h * Math.PI / 180), Cc * Math.sin(h * Math.PI / 180)], tertile: Lv < 48.3 ? 0 : Lv < 61.7 ? 1 : 2, t });
  }
  const res = people.map(p => {
    const per = Object.keys(LIGHTS).map(light => {
      const exp = 0.8 + 0.35 * rnd();
      const m = measure({ card: samples(GREY, light, exp), skin: samples(p.lab, light, exp, 30) });
      assert.equal(m.ok, true, JSON.stringify(m).slice(0, 120));
      return { light, hue: m.hue, L: m.L, band: undertone(m), top: seasons(m.lab).slice(0, 2).map(s => s.id) };
    });
    const ref = per.find(x => x.light === "D65");
    return {
      tertile: p.tertile, hueSd: sd(per.map(x => x.hue)), lSd: sd(per.map(x => x.L)),
      sameBand: per.every(x => x.band === ref.band && x.band !== "unsure"),
      sameTop1: per.every(x => x.top[0] === ref.top[0]), top2: per.every(x => x.top.includes(ref.top[0]))
    };
  });
  const rate = (k, f = () => true) => { const r = res.filter(f); return r.filter(x => x[k]).length / r.length; };
  const summary = { hueSdMedian: +median(res.map(r => r.hueSd)).toFixed(2), lSdMedian: +median(res.map(r => r.lSd)).toFixed(2),
    sameBand: +rate("sameBand").toFixed(3), sameTop1: +rate("sameTop1").toFixed(3), top2: +rate("top2").toFixed(3) };
  const gaps = {};
  for (const k of ["sameBand", "sameTop1", "top2"]) { const r = [0, 1, 2].map(t => rate(k, x => x.tertile === t)); gaps[k] = +((Math.max(...r) - Math.min(...r)) * 100).toFixed(1); }
  console.log("C4 (synthetic) repeatability:", JSON.stringify(summary), "tertile gap (points):", JSON.stringify(gaps));
  assert.ok(summary.hueSdMedian <= 2.0 && summary.lSdMedian <= 2.0, JSON.stringify(summary));
  assert.ok(summary.sameBand >= 0.8, "same band " + summary.sameBand);
  assert.ok(summary.sameTop1 >= 0.7 && summary.top2 >= 0.9, JSON.stringify(summary));
  for (const k of Object.keys(gaps)) assert.ok(gaps[k] <= 10, `tertile gap ${k} = ${gaps[k]} points`);
});

/* ---------------- C5 ---------------- */
test("C5 bands, seasons, palettes and wording", () => {
  const M = C();
  assert.deepEqual(M.BANDS, ["warm", "neutral-warm", "neutral", "neutral-cool", "cool", "unsure"]);
  assert.equal(M.SEASONS.length, 12);
  const parents = new Set(M.SEASONS.map(s => s.parent));
  assert.deepEqual([...parents].sort(), ["autumn", "spring", "summer", "winter"]);
  for (const s of M.SEASONS) for (const l of ["th", "en", "zh"]) assert.ok(s.name[l] && s.name[l].length > 1, s.id + " name " + l);
  for (const p of parents) {
    const pal = M.PALETTES[p];
    assert.ok(Array.isArray(pal) && pal.length >= 12, p + " palette size");
    for (const sw of pal) {
      assert.match(sw.hex, /^#[0-9a-f]{6}$/i);
      for (const l of ["th", "en", "zh"]) assert.ok(sw.name[l], p + " swatch name " + l);
      assert.ok(!/pantone|\bPMS\b/i.test(JSON.stringify(sw.name)), "own colour names, no Pantone");
    }
  }
  // a measurement with a large spread is "unsure"
  assert.equal(M.undertone({ hue: 60, chroma: 20, spread: 9 }), "unsure");
  assert.equal(M.undertone({ hue: 60, chroma: 3, spread: 1 }), "unsure");
  // wording: every string the module shows passes the look lint (whitening, score, negative, procedure) and names no skin-tone
  // category or ethnicity
  const strings = [];
  const walk = v => { if (typeof v === "string") strings.push(v); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
  walk(M.TEXT); walk(M.SEASONS.map(s => s.name)); walk(Object.values(M.PALETTES).map(p => p.map(s => s.name)));
  assert.ok(strings.length > 60, "texts found: " + strings.length);
  const SKIN = /light skin|dark skin|fair skin|tanned|\btan\b|olive skin|skin tone|fitzpatrick|monk scale|ethnic|race|asian|caucasian|ผิวขาว|ผิวคล้ำ|ผิวเข้ม|ผิวสองสี|ผิวแทน|เชื้อชาติ|白皙|黑皮|肤色深|肤色浅|人种|种族/i;
  for (const s of strings) {
    assert.deepEqual(lint().lintLook(s).filter(h => h.code !== "price"), [], "lint: " + s);
    assert.ok(!SKIN.test(s), "skin-tone / ethnicity wording: " + s);
  }
});

/* ---------------- C6 ---------------- */
test("C6 privacy: the colour module has no network, storage or canvas export", () => {
  const s = readFileSync(join(ROOT, "lensiq-colour.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /toDataURL/, /toBlob/, /indexedDB/, /localStorage/, /sessionStorage/]) assert.ok(!re.test(s), "uses " + re);
});
