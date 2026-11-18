"use strict";
// tests/unit/style-outfit.test.js — lensiq-outfit.js (Style S4: daily outfit and hair colour match, docs/STYLE-DESIGN.md
// §1.4, §3.4). FIXED TEST: hash-locked in evals-locks/style-s4.sha256 BEFORE lensiq-outfit.js was written.
// Source label: synthetic (every colour and image is built here; no people, no photos). The Personal Colour part
// (undertone / season) is parked and is NOT part of this module.
//
// API under test (window.LQOutfit / module.exports; needs lensiq-colour.js):
//   pairRaw(lab1, lab2) -> number       two-colour harmony CH of Ou & Luo (Color Res. Appl. 31(3), 2006), re-implemented
//   toScore(raw) -> 0..100 integer      Math.round(100 / (1 + exp(-3 raw)));  bandOf(score) -> "high"|"mid"|"low"
//   harmony(items) -> {score, raw, band, reasons, pairs}   items [{lab, share}]; raw = share-product-weighted mean of the
//                                       pairs; band high >= 65, mid 40..64, low < 40; null fields for fewer than 2 items
//   extract(img, {gains, card, maxPx}) -> {status "ok"|"empty", colours [{lab, rgb, hex, share}], n}
//   hairMatch(hairLab, items) -> {score, raw, band, best} | null
//   lucky(items, dayPlanet, goal, LQLucky) -> LQLucky.evaluate(list of {family, share}, dayPlanet, goal)
//   suggest({items, harmony, lucky, hair}) -> [{key, ...}] keys from SUGGEST_KEYS only
//   HAIR [{id, hex}], REASON_KEYS, SUGGEST_KEYS
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../lensiq-colour.js");
const O = require("../../lensiq-outfit.js");
const LQLucky = require("../../lensiq-luckycolor.js");

let seed = 7;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const LCh = (L, Ch, h) => [L, Ch * Math.cos(h * Math.PI / 180), Ch * Math.sin(h * Math.PI / 180)];

// ---- independent reference of the published equations (Ou & Luo 2006), used only to pin the product formula ----
function refCH(p, q) {
  const rad = Math.PI / 180, tanh = Math.tanh;
  const c1 = Math.hypot(p[1], p[2]), c2 = Math.hypot(q[1], q[2]);
  const h1 = (Math.atan2(p[2], p[1]) / rad + 360) % 360, h2 = (Math.atan2(q[2], q[1]) / rad + 360) % 360;
  let dh = Math.abs(h1 - h2); if (dh > 180) dh = 360 - dh;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(dh * rad / 2), dCab = c1 - c2;
  const dC = Math.sqrt(dH * dH + (dCab / 1.46) ** 2);
  const HC = 0.04 + 0.53 * tanh(0.8 - 0.045 * dC);
  const HLsum = 0.28 + 0.54 * tanh(-3.88 + 0.029 * (p[0] + q[0]));
  const HdL = 0.14 + 0.15 * tanh(-2 + 0.2 * Math.abs(p[0] - q[0]));
  const hsy = (L, c, h) => {
    const EC = 0.5 + 0.5 * tanh(-2 + 0.5 * c);
    const HS = -0.08 - 0.14 * Math.sin((h + 50) * rad) - 0.07 * Math.sin((2 * h + 90) * rad);
    const x = (90 - h) / 10, EY = ((0.22 * L - 12.8) / 10) * Math.exp(x - Math.exp(x));
    return EC * (HS + EY);
  };
  return HC + HLsum + HdL + hsy(p[0], c1, h1) + hsy(q[0], c2, h2);
}

// ---- synthetic flat lay: garments of one Lab colour each, fabric noise, shading, plain background, optional cast + card ----
function flatlay({ W = 640, H = 480, bg = [90, 1, 5], garments, cast = [1, 1, 1], card = null, noise = 6, s = 3 }) {
  let st = s >>> 0;
  const r = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  const toLin = lab => C.hexToRgb(C.rgbToHex(C.labToRgb(lab))).map(C.srgbToLinear);
  const bgl = toLin(bg), gl = garments.map(g => toLin(g.lab)), data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let l = bgl, n = 3;
    for (let k = 0; k < garments.length; k++) {
      const b = garments[k].box;
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) { const f = 1 - 0.06 * (y - b.y) / b.h; l = gl[k].map(c => c * f); n = noise; }
    }
    if (card && x >= card.x && x < card.x + card.w && y >= card.y && y < card.y + card.h) { l = [0.9, 0.9, 0.9]; n = 1.5; }
    const i = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(C.linearToSrgb(l[c] * cast[c]) + (r() - 0.5) * 2 * n);
    data[i + 3] = 255;
  }
  return { data, width: W, height: H };
}
const G3 = [
  { lab: [32, 8, -38], box: { x: 50, y: 50, w: 230, h: 170 } },   // navy, 39 100 px
  { lab: [85, -2, 14], box: { x: 360, y: 50, w: 220, h: 170 } },  // beige, 37 400 px
  { lab: [48, 52, 30], box: { x: 200, y: 280, w: 200, h: 150 } }  // brick red, 30 000 px
];
const nearest = (colours, lab) => Math.min(...colours.map(c => C.deltaE2000(c.lab, lab)));

test("exports the outfit API", () => {
  for (const f of ["pairRaw", "toScore", "bandOf", "harmony", "extract", "hairMatch", "lucky", "suggest"]) assert.equal(typeof O[f], "function", f);
  assert.ok(Array.isArray(O.HAIR) && O.HAIR.length >= 6, "hair swatches");
  for (const h of O.HAIR) { assert.match(h.hex, /^#[0-9a-f]{6}$/); assert.match(h.id, /^[a-z][a-zA-Z]+$/); }
  assert.deepEqual([...O.REASON_KEYS].sort(), ["analogous", "lightContrast", "lowContrast", "neutralAccent", "neutrals", "strongCompete", "tonal"]);
  assert.deepEqual([...O.SUGGEST_KEYS].sort(), ["addAccentToday", "addContrast", "hairAccessory", "keep", "swapNeutral"]);
});

test("pairRaw equals the published two-colour model (Ou & Luo 2006) and is symmetric", () => {
  for (let i = 0; i < 300; i++) {
    const p = LCh(10 + rnd() * 85, rnd() * 80, rnd() * 360), q = LCh(10 + rnd() * 85, rnd() * 80, rnd() * 360);
    const a = O.pairRaw(p, q), b = O.pairRaw(q, p);
    assert.ok(Number.isFinite(a), "finite");
    assert.ok(Math.abs(a - refCH(p, q)) < 1e-9, `formula ${a} vs ${refCH(p, q)}`);
    assert.ok(Math.abs(a - b) < 1e-12, "symmetric");
  }
  // neutral pairs (hue undefined) must not produce NaN
  assert.ok(Number.isFinite(O.pairRaw([95, 0, 0], [15, 0, 0])));
});

test("pairRaw follows the published principles (direction only)", () => {
  // a lightness difference raises harmony (same hue and chroma, same lightness sum 110)
  // re-lock 2026-11-18 (before any measurement): the first version compared 70 + 40 with 70 + 66, so the pairs differed in
  // lightness SUM (110 vs 136) as well as difference, and the model's lightness-sum term (a separate, stronger published
  // effect) decided it. The principle is about the difference at a fixed sum; both pairs now sum to 110. Not looser: the
  // product formula is still pinned to the published equations by the test above.
  assert.ok(O.pairRaw(LCh(70, 20, 60), LCh(40, 20, 60)) > O.pairRaw(LCh(57, 20, 60), LCh(53, 20, 60)));
  // a higher lightness sum raises harmony
  assert.ok(O.pairRaw(LCh(85, 20, 200), LCh(60, 20, 200)) > O.pairRaw(LCh(45, 20, 200), LCh(20, 20, 200)));
  // two strong near-complementary colours at the same lightness are less harmonious than a tonal pair
  assert.ok(O.pairRaw(LCh(52, 75, 30), LCh(52, 75, 210)) < O.pairRaw(LCh(80, 25, 30), LCh(50, 25, 32)));
});

test("toScore: logistic mapping 0..100, 50 at raw 0, monotone", () => {
  assert.equal(O.toScore(0), 50);
  let prev = -1;
  for (let r = -2; r <= 2; r += 0.05) {
    const s = O.toScore(r);
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 100, "range " + s);
    assert.ok(s >= prev, "monotone"); prev = s;
    assert.equal(s, Math.round(100 / (1 + Math.exp(-3 * r))));
  }
});

test("harmony: weighted mean of pairs, bands, reasons as keys only", () => {
  const none = O.harmony([{ lab: [50, 0, 0], share: 1 }]);
  assert.equal(none.score, null); assert.equal(none.band, null);
  assert.equal(O.harmony([]).score, null);
  const a = { lab: LCh(80, 20, 40), share: 0.5 }, b = { lab: LCh(45, 22, 42), share: 0.5 }, c = { lab: LCh(55, 70, 220), share: 0.2 };
  const two = O.harmony([a, b]);
  assert.ok(Math.abs(two.raw - O.pairRaw(a.lab, b.lab)) < 1e-12);
  assert.equal(two.score, O.toScore(two.raw));
  const items = [{ ...a, share: 0.5 }, { ...b, share: 0.3 }, c];
  const w = [[0, 1, 0.5 * 0.3], [0, 2, 0.5 * 0.2], [1, 2, 0.3 * 0.2]];
  const exp = w.reduce((s, [i, j, x]) => s + x * O.pairRaw(items[i].lab, items[j].lab), 0) / w.reduce((s, x) => s + x[2], 0);
  const three = O.harmony(items);
  assert.ok(Math.abs(three.raw - exp) < 1e-12, "weighted mean");
  assert.equal(three.pairs.length, 3);
  for (const [score, band] of [[65, "high"], [64, "mid"], [40, "mid"], [39, "low"]]) assert.equal(O.bandOf(score), band);
  for (const r of [two, three]) {
    assert.ok(["high", "mid", "low"].includes(r.band));
    for (const k of r.reasons) assert.ok(O.REASON_KEYS.includes(k), "reason key " + k);
  }
  assert.ok(O.harmony([{ lab: [94, 0, 1], share: 0.6 }, { lab: LCh(40, 45, 250), share: 0.4 }]).reasons.includes("neutralAccent"));
  assert.ok(O.harmony([{ lab: LCh(80, 20, 40), share: 0.5 }, { lab: LCh(50, 24, 44), share: 0.5 }]).reasons.includes("tonal"));
  assert.ok(O.harmony([{ lab: LCh(52, 75, 30), share: 0.5 }, { lab: LCh(53, 72, 205), share: 0.5 }]).reasons.includes("strongCompete"));
  assert.ok(O.harmony([{ lab: [95, 0, 0], share: 0.5 }, { lab: [15, 0, 0], share: 0.5 }]).reasons.includes("neutrals"));
});

test("extract: three garments on a plain background -> three colours near the truth, background left out", () => {
  const img = flatlay({ garments: G3 });
  const r = O.extract(img, {});
  assert.equal(r.status, "ok");
  assert.equal(r.colours.length, 3, JSON.stringify(r.colours.map(c => c.hex)));
  for (const g of G3) assert.ok(nearest(r.colours, g.lab) <= 6, "garment " + g.lab + " dE " + nearest(r.colours, g.lab));
  assert.ok(nearest(r.colours, [90, 1, 5]) > 8, "background is not a garment colour");
  const sum = r.colours.reduce((s, c) => s + c.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, "shares sum to 1");
  for (let i = 1; i < r.colours.length; i++) assert.ok(r.colours[i - 1].share >= r.colours[i].share, "sorted by share");
  for (const c of r.colours) { assert.match(c.hex, /^#[0-9a-f]{6}$/); assert.equal(c.rgb.length, 3); assert.ok(c.share >= 0.05); }
  const again = O.extract(img, {});
  assert.deepEqual(again.colours.map(c => c.hex), r.colours.map(c => c.hex), "deterministic");
});

test("extract: empty background -> status empty; one garment -> one colour", () => {
  assert.equal(O.extract(flatlay({ garments: [] }), {}).status, "empty");
  const one = O.extract(flatlay({ garments: [{ lab: [40, 30, -30], box: { x: 150, y: 100, w: 300, h: 250 } }] }), {});
  assert.equal(one.status, "ok");
  assert.equal(one.colours.length, 1);
  assert.ok(C.deltaE2000(one.colours[0].lab, [40, 30, -30]) <= 6);
});

test("extract with the white card: a warm cast is corrected (gains from LQColour.cardStats), card left out", () => {
  const card = { x: 303, y: 180, w: 34, h: 120 }, cast = [1.0, 0.85, 0.61];
  const img = flatlay({ garments: G3, cast, card });
  const cs = C.cardStats(img, card, { target: 0.9 });
  assert.ok(cs.ok, "card usable: " + cs.reasons);
  const r = O.extract(img, { gains: cs.gains, card });
  assert.equal(r.colours.length, 3, JSON.stringify(r.colours.map(c => c.hex)));
  for (const g of G3) assert.ok(nearest(r.colours, g.lab) <= 6, "corrected garment dE " + nearest(r.colours, g.lab));
  const raw = O.extract(img, {});
  assert.ok(G3.some(g => nearest(raw.colours, g.lab) > 6), "without the card the cast shows (control)");
});

test("speed budget: extract on 640 x 480 <= 300 ms (median of 5, this machine)", () => {
  const img = flatlay({ garments: G3 }), ms = [];
  for (let i = 0; i < 5; i++) { const t = process.hrtime.bigint(); O.extract(img, {}); ms.push(Number(process.hrtime.bigint() - t) / 1e6); }
  ms.sort((x, y) => x - y);
  assert.ok(ms[2] <= 300, "median ms " + ms[2]);
});

test("hairMatch: weighted mean of hair vs outfit pairs; best = the most harmonious outfit colour", () => {
  assert.equal(O.hairMatch([30, 8, 12], []), null);
  const items = [{ lab: [85, -2, 14], share: 0.6 }, { lab: LCh(60, 80, 135), share: 0.4 }];
  const hair = C.hexToLab(O.HAIR.find(h => h.id === "darkBrown").hex);
  const r = O.hairMatch(hair, items);
  const raws = items.map(it => O.pairRaw(hair, it.lab));
  const exp = (0.6 * raws[0] + 0.4 * raws[1]) / 1;
  assert.ok(Math.abs(r.raw - exp) < 1e-12);
  assert.equal(r.score, O.toScore(exp));
  assert.equal(r.best, raws[0] >= raws[1] ? 0 : 1);
  assert.equal(r.band, O.bandOf(r.score));
});

test("lucky: the outfit colours go to LQLucky.evaluate unchanged (families by share)", () => {
  const items = [{ lab: C.rgbToLab([224, 49, 49]), rgb: [224, 49, 49], share: 0.6 }, { lab: C.rgbToLab([248, 249, 250]), rgb: [248, 249, 250], share: 0.4 }];
  for (let day = 0; day < 7; day++) for (const goal of ["work", "money", "love", "support"]) {
    const exp = LQLucky.evaluate([{ family: LQLucky.classify(224, 49, 49), share: 0.6 }, { family: LQLucky.classify(248, 249, 250), share: 0.4 }], day, goal);
    assert.deepEqual(O.lucky(items, day, goal, LQLucky), exp, `day ${day} ${goal}`);
  }
  // two outfit colours of the same family are summed
  const same = [{ rgb: [224, 49, 49], lab: C.rgbToLab([224, 49, 49]), share: 0.3 }, { rgb: [200, 40, 40], lab: C.rgbToLab([200, 40, 40]), share: 0.3 },
    { rgb: [30, 60, 150], lab: C.rgbToLab([30, 60, 150]), share: 0.4 }];
  const ev = O.lucky(same, 0, "work", LQLucky);
  assert.equal(ev.family, LQLucky.classify(224, 49, 49), "red 0.6 beats navy 0.4");
});

test("suggest: reversible colour suggestions only, from a fixed key set", () => {
  assert.deepEqual(O.suggest({ items: [], harmony: O.harmony([]), lucky: null, hair: null }), []);
  const clashItems = [{ lab: LCh(52, 75, 30), rgb: C.labToRgb(LCh(52, 75, 30)), share: 0.6 }, { lab: LCh(53, 72, 205), rgb: C.labToRgb(LCh(53, 72, 205)), share: 0.4 }];
  const h = O.harmony(clashItems);
  const lk = O.lucky(clashItems, 3, "work", LQLucky);
  const s = O.suggest({ items: clashItems, harmony: h, lucky: lk, hair: null });
  assert.ok(s.some(x => x.key === "swapNeutral" && x.i === 1), "swap the smaller strong colour for a neutral: " + JSON.stringify(s));
  if (lk.level < 3) assert.ok(s.some(x => x.key === "addAccentToday" && x.family === lk.accent[0]), "accent in today's colour");
  const good = [{ lab: [94, 0, 1], rgb: [240, 240, 240], share: 0.6 }, { lab: LCh(40, 45, 250), rgb: C.labToRgb(LCh(40, 45, 250)), share: 0.4 }];
  const gh = O.harmony(good);
  const gs = O.suggest({ items: good, harmony: gh, lucky: null, hair: null });
  if (gh.band === "high") assert.ok(gs.some(x => x.key === "keep"));
  assert.ok(!gs.some(x => x.key === "addAccentToday"), "no lucky suggestion when the lucky link is off");
  const hs = O.suggest({ items: good, harmony: gh, lucky: null, hair: C.hexToLab(O.HAIR[0].hex) });
  const hairS = hs.find(x => x.key === "hairAccessory");
  assert.ok(hairS && /^#[0-9a-f]{6}$/.test(hairS.hex), "hair accessory colour");
  for (const list of [s, gs, hs]) for (const x of list) assert.ok(O.SUGGEST_KEYS.includes(x.key), "key " + x.key);
});

test("no person, no storage, no network in the module", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../lensiq-outfit.js"), "utf8");
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|getUserMedia/);
  assert.doesNotMatch(src, /undertone|\bseasons?\b|\bskin\b|\bface\b/i, "no Personal Colour / face logic here");
});
