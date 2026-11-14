"use strict";
// tests/unit/look-preview.test.js — live look preview geometry and rules (docs/BEAUTY-IMAGE-DESIGN.md §2, protocol
// docs/LOOK-PREVIEW-EVAL.md). FIXED TEST SET: written and hash-locked (evals-locks/beauty-look.sha256) BEFORE
// lensiq-look-preview.js was written and before any measurement.
//
//   P1 landmark index sets (MediaPipe Face Mesh 478): lips outer / inner rings, upper lids, brows, eye corners: valid, unique
//   P2 geometry from landmarks: lip polygon, liner base curve + wing per style, brow polygon per style
//   P3 smoothing reduces still-face jitter by at least 60 % and follows a real move within 6 frames
//   P4 only measured kinds go live: every kind in LIVE has pass:true, source "synthetic" in tools/look-preview-results.json;
//      MVP option ก: LIVE never holds hair colour, hairstyle, facial hair or earrings
//   P5 privacy and models: one face, no blendshapes, no network, no canvas export, no storage of frames
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const ROOT = join(__dirname, "..", "..");
const P = () => require("../../lensiq-look-preview.js");

/** a synthetic 478-point landmark set (normalised 0..1): a neutral face grid, enough for geometry checks */
function fakeLandmarks(dx = 0, dy = 0) {
  const lms = [];
  for (let i = 0; i < 478; i++) lms.push({ x: 0.3 + ((i * 37) % 100) / 250 + dx, y: 0.3 + ((i * 53) % 100) / 250 + dy, z: 0 });
  return lms;
}

test("P1 index sets are valid Face Mesh indices, unique, and the expected sizes", () => {
  const { IDX } = P();
  const sets = { lipOuter: 20, lipInner: 20, lidUpperL: 9, lidUpperR: 9, browL: 10, browR: 10 };
  for (const [k, n] of Object.entries(sets)) {
    const a = IDX[k];
    assert.ok(Array.isArray(a) && a.length === n, `${k} has ${n} points, got ${a && a.length}`);
    assert.equal(new Set(a).size, a.length, k + " unique");
    for (const i of a) assert.ok(Number.isInteger(i) && i >= 0 && i < 478, k + " index " + i);
  }
  for (const k of ["eyeOuterL", "eyeInnerL", "eyeOuterR", "eyeInnerR", "mouthL", "mouthR"]) assert.ok(Number.isInteger(IDX[k]) && IDX[k] < 478, k);
  // well-known Face Mesh points
  assert.ok(IDX.lipOuter.includes(61) && IDX.lipOuter.includes(291) && IDX.lipOuter.includes(0) && IDX.lipOuter.includes(17));
  assert.ok(IDX.lidUpperR.includes(33) && IDX.lidUpperR.includes(133) && IDX.lidUpperL.includes(263) && IDX.lidUpperL.includes(362));
});

test("P2 lip polygon: outer and inner rings in pixels", () => {
  const L = P(), lms = fakeLandmarks();
  const g = L.lips(lms, 640, 480);
  assert.equal(g.outer.length, 20); assert.equal(g.inner.length, 20);
  assert.deepEqual(g.outer[0], [lms[L.IDX.lipOuter[0]].x * 640, lms[L.IDX.lipOuter[0]].y * 480]);
});

test("P2 liner: base curve follows the upper lid; wing length grows thin < wing-short < wing-long", () => {
  const L = P(), lms = fakeLandmarks();
  const len = s => { const r = L.liner(lms, 640, 480, s); return r.map(e => e.wing ? Math.hypot(e.wing[1][0] - e.wing[0][0], e.wing[1][1] - e.wing[0][1]) : 0); };
  for (const s of ["thin", "tight", "wing-short", "wing-long"]) {
    const r = L.liner(lms, 640, 480, s);
    assert.equal(r.length, 2, s + ": two eyes");
    for (const e of r) assert.equal(e.base.length, 9, s + ": 9-point lid curve");
  }
  const thin = len("thin"), short = len("wing-short"), long = len("wing-long");
  for (let i = 0; i < 2; i++) { assert.equal(thin[i], 0); assert.ok(short[i] > 0 && long[i] > short[i] * 1.4, `wing ${short[i]} / ${long[i]}`); }
});

test("P2 brow styles: define/fill keep the drawn outline; extend adds a tail; lift raises the tail; arch raises the middle", () => {
  const L = P(), lms = fakeLandmarks();
  const base = L.brows(lms, 640, 480, "fill");
  assert.equal(base.length, 2);
  const minY = poly => Math.min(...poly.map(p => p[1]));
  const span = poly => Math.max(...poly.map(p => p[0])) - Math.min(...poly.map(p => p[0]));
  for (let i = 0; i < 2; i++) {
    assert.ok(base[i].length >= 10, "polygon");
    const ext = L.brows(lms, 640, 480, "extend")[i], lift = L.brows(lms, 640, 480, "lift")[i], arch = L.brows(lms, 640, 480, "arch")[i];
    assert.ok(span(ext) > span(base[i]) + 1, "extend is longer");
    assert.ok(lift.length === base[i].length, "lift keeps the point count");
    assert.ok(arch.length === base[i].length && minY(arch) < minY(base[i]), "arch is higher");
    assert.deepEqual(L.brows(lms, 640, 480, "define")[i], base[i], "define = drawn outline");
  }
});

test("P3 smoother: still-face jitter down >= 60 %, follows a real move within 6 frames", () => {
  const L = P();
  const sm = L.smoother();
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  let raw = 0, out = 0, prevR = null, prevO = null;
  for (let f = 0; f < 60; f++) {
    const lms = fakeLandmarks(rnd() * 0.004, rnd() * 0.004);
    const s = sm(lms, f * 33);
    if (prevR) { raw += Math.hypot(lms[0].x - prevR.x, lms[0].y - prevR.y); out += Math.hypot(s[0].x - prevO.x, s[0].y - prevO.y); }
    prevR = lms[0]; prevO = s[0];
  }
  assert.ok(out <= raw * 0.4, `jitter ${out} vs raw ${raw}`);
  // a real move of 0.1 (≈ 64 px) is followed within 6 frames to 90 %
  const sm2 = L.smoother(); for (let f = 0; f < 10; f++) sm2(fakeLandmarks(), f * 33);
  let got = 0;
  for (let f = 0; f < 6; f++) { const s = sm2(fakeLandmarks(0.1, 0), (10 + f) * 33); got = s[0].x - fakeLandmarks()[0].x; }
  assert.ok(got >= 0.09, "followed " + got);
});

test("P4 only measured kinds are live; never hair colour, hairstyle, facial hair or earrings in the MVP", () => {
  const L = P();
  assert.ok(Array.isArray(L.LIVE));
  for (const k of L.LIVE) assert.ok(["lip", "liner", "brow", "brow-arch", "glasses"].includes(k), "allowed kind " + k);
  const f = join(ROOT, "tools", "look-preview-results.json");
  if (L.LIVE.length) {
    assert.ok(existsSync(f), "measured results present");
    const R = JSON.parse(readFileSync(f, "utf8"));
    for (const k of L.LIVE) {
      assert.ok(R.kinds && R.kinds[k] && R.kinds[k].pass === true, k + " passed on held-out");
      assert.equal(R.kinds[k].source, "synthetic", k + " source stated");
    }
  }
});

test("P5 privacy and models: one face, no blendshapes, no network / export / storage", () => {
  const L = P();
  assert.equal(L.MP_OPTIONS.numFaces, 1);
  assert.equal(L.MP_OPTIONS.outputFaceBlendshapes, false);
  assert.ok(!L.MP_OPTIONS.outputFacialTransformationMatrixes);
  assert.ok(Object.isFrozen(L.MP_OPTIONS));
  const s = readFileSync(join(ROOT, "lensiq-look-preview.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /toDataURL/, /toBlob/, /indexedDB/, /localStorage/, /sessionStorage/,
    /outputFaceBlendshapes\s*:\s*true/, /ageGender/i, /faceExpression/i, /faceparse/i, /bisenet/i, /MediaRecorder/]) assert.ok(!re.test(s), "uses " + re);
});
