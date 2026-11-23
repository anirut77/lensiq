"use strict";
// tests/unit/faceread-tier1.test.js — face reading on the tier-1 face model (lensiq-face-mesh68.js, MediaPipe Face Landmarker,
// LICENSES/TIERS.md M2), behind window.LENSIQ_FACEREAD_TIER1 (off). Checks the 478 -> 68 point pick, the detection shape faceread.js
// expects, the separate calibration (FRCore.setEngine) and that the default engine and its numbers are untouched.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const M = require("../../lensiq-face-mesh68.js");
const FR = require("../../faceread.js");
const root = path.join(__dirname, "..", "..");

test("MAP68 picks 68 distinct Face Mesh points, all inside the 478-point mesh", () => {
  assert.equal(M.MAP68.length, 68);
  assert.equal(new Set(M.MAP68).size, 68);
  for (const k of M.MAP68) assert.ok(Number.isInteger(k) && k >= 0 && k < 478, "bad index " + k);
});

test("toDets: normalised landmarks -> pixel box + 68 points in the iBUG order faceread.js uses", () => {
  const L = Array.from({ length: 478 }, (_, i) => ({ x: 0.3 + (i % 20) * 0.02, y: 0.2 + Math.floor(i / 20) * 0.025, z: 0 }));
  const d = M.toDets({ faceLandmarks: [L] }, 1000, 800);
  assert.equal(d.length, 1);
  assert.equal(d[0].pts.length, 68);
  assert.deepEqual(d[0].pts[8], [L[152].x * 1000, L[152].y * 800]); // chin
  const b = d[0].box;
  assert.ok(Math.abs(b.x - 300) < 1e-9 && Math.abs(b.width - 0.38 * 1000) < 1e-6, JSON.stringify(b));
  assert.deepEqual(M.toDets({ faceLandmarks: [] }, 10, 10), []);
  assert.deepEqual(M.toDets(null, 10, 10), []);
});

test("every left/right pick is the Face Mesh mirror of its iBUG partner (all 68 points; jaw 9 = 379, mirror of 150)", () => {
  // Face Mesh mirror pairs (canonical topology; jaw, brows, eyes, nose and outer lip also checked on 5 London dev photos and
  // their horizontal flips, 2026-11-24, numbers only)
  const MIR = { 127: 356, 234: 454, 93: 323, 132: 361, 58: 288, 172: 397, 136: 365, 150: 379, 152: 152, 70: 300, 63: 293, 105: 334, 66: 296, 107: 336,
    168: 168, 197: 197, 5: 5, 4: 4, 75: 305, 97: 326, 2: 2, 33: 263, 160: 387, 158: 385, 133: 362, 153: 380, 144: 373,
    61: 291, 39: 269, 37: 267, 0: 0, 405: 181, 314: 84, 17: 17, 78: 308, 82: 312, 13: 13, 317: 87, 14: 14 };
  for (const [a, b] of Object.entries(MIR)) MIR[b] = +a;
  // iBUG-68 mirror (same table as faceread.js FLIP68)
  const FLIP68 = [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 27, 28, 29, 30, 35, 34, 33, 32, 31,
    45, 44, 43, 42, 47, 46, 39, 38, 37, 36, 41, 40, 54, 53, 52, 51, 50, 49, 48, 59, 58, 57, 56, 55, 64, 63, 62, 61, 60, 67, 66, 65];
  M.MAP68.forEach((k, i) => assert.equal(MIR[k], M.MAP68[FLIP68[i]], `iBUG ${i} (mesh ${k}) <-> iBUG ${FLIP68[i]} (mesh ${M.MAP68[FLIP68[i]]})`));
  assert.equal(M.MAP68[9], 379);
});

test("apply() swaps FRCore to the tier-1 calibration in place and back; the face-api numbers are unchanged", () => {
  const before = JSON.stringify([FR.NORMS, FR.THRESH, FR.HAIR.fallbackRatio]);
  assert.equal(FR.engine, "faceapi");
  assert.equal(M.apply(FR, true), "mp");
  assert.equal(FR.engine, "mp");
  assert.deepEqual(FR.NORMS, M.CAL.NORMS);
  assert.equal(Object.keys(M.CAL.NORMS).sort().join(), Object.keys(JSON.parse(before)[0]).sort().join(), "same keys as the face-api calibration");
  for (const [k, [med, sd]] of Object.entries(FR.NORMS)) assert.ok(isFinite(med) && sd > 0, k);
  for (const k of ["zoneDom", "typeZ", "tiltZ", "palaceZ"]) assert.equal(FR.THRESH[k], JSON.parse(before)[1][k], "z-based threshold unchanged: " + k);
  assert.equal(FR.HAIR.fallbackRatio, M.CAL.fallbackRatio);
  assert.equal(FR.zOf("eyeGap", M.CAL.NORMS.eyeGap[0]), 0, "FRCore's own z uses the swapped values");
  assert.equal(M.apply(FR, false), "faceapi");
  assert.equal(JSON.stringify([FR.NORMS, FR.THRESH, FR.HAIR.fallbackRatio]), before);
  assert.equal(FR.NORMS.eyeGap[0], 1.612);
});

test("same 68 points -> identical analysis on each engine (determinism holds after switching back and forth)", () => {
  const pts = FR.synthFace({ x: 100, y: 120, width: 300, height: 340 });
  const run = () => { const R = FR.analyze(pts, null, 30); return JSON.stringify([R.cls, R.el.ranked]); };
  const a = run(); M.apply(FR, true); const m1 = run(); M.apply(FR, false); const b = run(); M.apply(FR, true); const m2 = run(); M.apply(FR, false);
  assert.equal(a, b); assert.equal(m1, m2);
});

test("switch: off in lensiq-config.js (?frengine= only on localhost); the page loads the tier-1 module only when it is on", () => {
  const cfg = fs.readFileSync(path.join(root, "lensiq-config.js"), "utf8");
  assert.match(cfg, /typeof location !== "undefined" && \/\^\(localhost\|127\\\.0\\\.0\\\.1\)\$\/\.test\(location\.hostname\) && \/\[\?&\]frengine=\(mp\|faceapi\)\\b\/\.test\(location\.search\)/);
  assert.match(cfg, /: window\.LENSIQ_FACEREAD_TIER1 === true;/);
  const js = fs.readFileSync(path.join(root, "faceread.js"), "utf8");
  assert.match(js, /MP = window\.LENSIQ_FACEREAD_TIER1 === true/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "faceread.html"), "utf8"), /lensiq-face-mesh68/);
});

test("the vendored model file is the tier-1 one with no facial-movement (blendshape) member", () => {
  const buf = fs.readFileSync(path.join(root, M.MODEL));
  assert.equal(require("node:crypto").createHash("sha256").update(buf).digest("hex"), "56224ce15fcbff363ed5ce9a9a17761b9b9fd8f3a03bbe0bf94ea900e1f2cd57");
  assert.ok(!buf.includes(Buffer.from("face_blendshapes")), "blendshape model must not be in the file");
});
