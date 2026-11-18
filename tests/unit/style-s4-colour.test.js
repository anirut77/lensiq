"use strict";
// tests/unit/style-colour.test.js — lensiq-colour.js (Style MVP, docs/STYLE-DESIGN.md §3.1, §3.3). FIXED TEST: hash-locked
// in evals-locks/style-mvp.sha256 BEFORE lensiq-colour.js was written. Source label: synthetic (colours and images are
// built here; CIEDE2000 pairs are the published test data of Sharma, Wu, Dalal, Color Res. Appl. 30(1), 2005).
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../lensiq-colour.js");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

test("exports the colour API", () => {
  for (const f of ["srgbToLinear", "linearToSrgb", "linToXyz", "xyzToLab", "rgbToLab", "labToRgb", "hexToRgb", "rgbToHex", "hexToLab",
    "lch", "deltaE2000", "median", "robustSd", "cardStats", "applyGains", "correctedLab", "detectCard"]) assert.equal(typeof C[f], "function", f);
});

test("sRGB <-> linear and Lab: white, black, primaries (D65)", () => {
  for (const v of [0, 1, 10, 50, 128, 200, 254, 255]) near(C.linearToSrgb(C.srgbToLinear(v)), v, 1e-6, "round trip " + v);
  const w = C.rgbToLab([255, 255, 255]);
  near(w[0], 100, 0.01, "white L"); near(w[1], 0, 0.01, "white a"); near(w[2], 0, 0.01, "white b");
  const k = C.rgbToLab([0, 0, 0]);
  near(k[0], 0, 0.01, "black L");
  const red = C.rgbToLab([255, 0, 0]);
  near(red[0], 53.24, 0.05, "red L"); near(red[1], 80.09, 0.1, "red a"); near(red[2], 67.2, 0.1, "red b");
  const blue = C.rgbToLab([0, 0, 255]);
  near(blue[0], 32.3, 0.05, "blue L"); near(blue[1], 79.19, 0.1, "blue a"); near(blue[2], -107.86, 0.1, "blue b");
  for (const hex of ["#000000", "#ffffff", "#c8966e", "#1f2a44", "#ffc3a0", "#7fd8c8"]) {
    assert.equal(C.rgbToHex(C.labToRgb(C.hexToLab(hex))), hex, "hex round trip " + hex);
    assert.deepEqual(C.hexToRgb(hex).length, 3);
  }
  const l = C.lch([50, 0, 20]);
  near(l.C, 20, 1e-9, "C"); near(l.h, 90, 1e-9, "h");
  near(C.lch([50, -10, -10]).h, 225, 1e-9, "h in [0, 360)");
});

test("CIEDE2000 matches all 34 published test pairs to 1e-4 (Sharma, Wu, Dalal 2005)", () => {
  const P = [[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425], [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412], [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, -1.1848, -84.8006], [50, 0, -82.7485], 1.0], [[50, -0.9009, -85.5211], [50, 0, -82.7485], 1.0],
    [[50, 0, 0], [50, -1, 2], 2.3669], [[50, -1, 2], [50, 0, 0], 2.3669], [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, 2.49, -0.001], [50, -2.49, 0.001], 7.1792], [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
    [[50, 2.49, -0.001], [50, -2.49, 0.0012], 7.2195], [[50, -0.001, 2.49], [50, 0.0009, -2.49], 4.8045],
    [[50, -0.001, 2.49], [50, 0.001, -2.49], 4.8045], [[50, -0.001, 2.49], [50, 0.0011, -2.49], 4.7461],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065], [[50, 2.5, 0], [73, 25, -18], 27.1492], [[50, 2.5, 0], [61, -5, 29], 22.8977],
    [[50, 2.5, 0], [56, -27, -3], 31.903], [[50, 2.5, 0], [58, 24, 15], 19.4535], [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
    [[50, 2.5, 0], [50, 3.2972, 0], 1.0], [[50, 2.5, 0], [50, 1.8634, 0.5757], 1.0], [[50, 2.5, 0], [50, 3.2592, 0.335], 1.0],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644], [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
    [[61.2901, 3.7196, -5.3901], [61.4292, 2.248, -4.962], 1.8731], [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373], [[36.4612, 47.858, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
    [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441], [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
    [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377], [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082]];
  assert.equal(P.length, 34);
  P.forEach(([a, b, e], i) => {
    near(C.deltaE2000(a, b), e, 1e-4, "pair " + (i + 1));
    near(C.deltaE2000(b, a), e, 1e-4, "pair " + (i + 1) + " symmetric");
  });
  assert.equal(C.deltaE2000([50, 10, 10], [50, 10, 10]), 0);
});

test("median and robust SD ignore outliers", () => {
  assert.equal(C.median([5, 1, 3]), 3);
  assert.equal(C.median([4, 1, 3, 2]), 2.5);
  const xs = [10, 10.5, 9.5, 10.2, 9.8, 10.1, 9.9, 100, -50];
  assert.ok(C.robustSd(xs) < 1, "robust SD " + C.robustSd(xs));
});

// ---- synthetic images (ImageData-like {data, width, height}) ----
function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function image(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = fn(x, y), i = (y * w + x) * 4; data[i] = v[0]; data[i + 1] = v[1]; data[i + 2] = v[2]; data[i + 3] = 255; }
  return { data, width: w, height: h };
}
const cast = (rgb, g) => rgb.map((v, i) => C.linearToSrgb(Math.min(1, C.srgbToLinear(v) * g[i])));
const iou = (a, b) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0); return i / (a.w * a.h + b.w * b.h - i);
};
const GREY = [118, 118, 118]; // ~18 % grey in sRGB
function scene({ g = [1, 1, 1], card = GREY, cardBox = { x: 220, y: 80, w: 60, h: 80 }, ramp = 0, seed = 7, noCard = false } = {}) {
  const r = rand(seed), skin = C.labToRgb([62, 14, 22]), bg = [70, 90, 120];
  return image(320, 240, (x, y) => {
    let v;
    if (!noCard && x >= cardBox.x && x < cardBox.x + cardBox.w && y >= cardBox.y && y < cardBox.y + cardBox.h) {
      const k = 1 + ramp * ((x - cardBox.x) / cardBox.w - 0.5);
      v = card.map(c => Math.min(255, c * k + (r() - 0.5) * 3));
    } else if ((x - 110) ** 2 / 55 ** 2 + (y - 120) ** 2 / 75 ** 2 < 1) v = skin.map(c => c + (r() - 0.5) * 4);
    else v = bg.map(c => c + (r() - 0.5) * 70);
    return cast(v.map(c => Math.max(0, Math.min(255, c))), g);
  });
}
const FACE = { x: 50, y: 40, w: 120, h: 160 };

test("cardStats: gains make the card neutral at its nominal reflectance; corrected colours undo a light cast", () => {
  const g = [1.3, 1.0, 0.65], img = scene({ g }), box = { x: 220, y: 80, w: 60, h: 80 };
  const st = C.cardStats(img, box, { target: 0.18 });
  assert.equal(st.ok, true, JSON.stringify(st.reasons));
  assert.deepEqual(st.reasons, []);
  assert.equal(st.gains.length, 3);
  const lin = C.applyGains(cast(GREY, g), st.gains);
  for (const v of lin) near(v, 0.18, 0.01, "card channel after gains");
  const lab = C.correctedLab(cast(C.labToRgb([62, 14, 22]), g), st.gains), ref = C.rgbToLab(C.labToRgb([62, 14, 22]));
  // 118 sRGB grey is ~18.1 % reflectance: L* may shift by < 1 after normalising to 0.18
  assert.ok(C.deltaE2000(lab, ref) < 1.5, "skin after correction dE00 " + C.deltaE2000(lab, ref));
  const raw = C.rgbToLab(cast(C.labToRgb([62, 14, 22]), g));
  assert.ok(C.deltaE2000(raw, ref) > 5, "the cast is real before correction");
  assert.ok(st.area > 0.05 && st.area < 0.07, "area share " + st.area);
});

test("cardStats rejects a clipped, a too small and an unevenly lit card (design §3.3)", () => {
  const clipped = C.cardStats(scene({ card: [255, 255, 255] }), { x: 220, y: 80, w: 60, h: 80 }, { target: 0.9 });
  assert.equal(clipped.ok, false); assert.ok(clipped.reasons.includes("clipped"), JSON.stringify(clipped.reasons));
  const small = C.cardStats(scene({ cardBox: { x: 220, y: 80, w: 20, h: 30 } }), { x: 220, y: 80, w: 20, h: 30 }, { target: 0.18 });
  assert.equal(small.ok, false); assert.ok(small.reasons.includes("small"), JSON.stringify(small.reasons));
  const uneven = C.cardStats(scene({ ramp: 0.3 }), { x: 220, y: 80, w: 60, h: 80 }, { target: 0.18 });
  assert.equal(uneven.ok, false); assert.ok(uneven.reasons.includes("uneven"), JSON.stringify(uneven.reasons));
  assert.ok(uneven.gradient > 0.08, "gradient " + uneven.gradient);
  const even = C.cardStats(scene({ ramp: 0.04 }), { x: 220, y: 80, w: 60, h: 80 }, { target: 0.18 });
  assert.equal(even.ok, true, "a 4 % ramp is accepted " + JSON.stringify(even.reasons));
});

test("detectCard finds the card next to the face (also under a strong warm cast), ignores the face, and returns null without a card", () => {
  const truth = { x: 220, y: 80, w: 60, h: 80 };
  for (const g of [[1, 1, 1], [1.35, 1.0, 0.6], [0.8, 1.0, 1.3]]) {
    const d = C.detectCard(scene({ g }), { exclude: FACE });
    assert.ok(d && d.box, "found under cast " + g);
    assert.ok(iou(d.box, truth) >= 0.7, "IoU " + iou(d.box, truth) + " " + JSON.stringify(d.box));
  }
  assert.equal(C.detectCard(scene({ noCard: true }), { exclude: FACE }), null, "no card -> null (the skin area is excluded)");
  const tap = C.detectCard(scene({}), { exclude: FACE, at: { x: 250, y: 120 } });
  assert.ok(tap && iou(tap.box, truth) >= 0.7, "tap on the card selects it");
  assert.equal(C.detectCard(scene({}), { exclude: FACE, at: { x: 10, y: 10 } }), null, "tap on noisy background selects nothing");
});
