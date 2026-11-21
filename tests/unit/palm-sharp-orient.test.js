"use strict";
// tests/unit/palm-sharp-orient.test.js — FIXED TEST SET "palm-sharp-orient" (owner decision 206, 2026-11-21: "if the product's
// sharpness measure depends on orientation, fix the product and lock a test that it is equal at 0 / 90 / 180 / 270"). Locked in
// evals-locks/palm-sharp-orient.sha256 (~/LENSIQ-field/evals/palm-sharp-orient/) BEFORE the product change. Behind
// window.LENSIQ_PALM_V2 (off). DRAWN SYNTHETIC hands only (tests/fixtures/palm-v2/synth-capture.js, synth-orient.js); every
// number here is SYNTHETIC.
// Cause found (2026-11-21, synthetic frames, product at 94872611): the SAME preview frame turned 90 / 180 / 270 degrees (or
// mirrored) gave a different live sharpness: spread 44 % (160 x 213), 39 % (240 x 320), 45 % (120 x 160), 59 % (camera-grain
// frame 160 x 213). Reasons in palm-v2.js: the hand mask is always 160 px WIDE (a landscape frame gets a coarser mask), the mask
// lookup and the ROI resampling are anchored at the top-left pixel (floor), so which pixels are repeated or painted depends on the
// frame's direction; and the preview is grabbed 160 px WIDE, so a phone held sideways gives a 160 x 120 frame.
// Contract under test:
//   liveHint(rgba, w, h, { still }).metrics.sharp is the same (max / min - 1 <= TOL) for a frame and that frame turned 90 / 180 /
//     270 degrees, and mirrored at each turn; the hint is the same; also when only the hand's square block is turned inside an
//     upright portrait frame (the hand pointing another way, same pixels).
//   the calibrated condition is kept: an upright portrait frame 160 px wide reads within TOL of the value at 94872611 (the
//     provisional threshold CAPTURE_T.sharp = 6 was set there), and a blurred hand is still "blur" at every turn.
//   previewSize(vw, vh) -> { w, h }: the live check's preview size, SHORT side 160 (the same pixels per hand however the phone is
//     held); palm-v2-ui.js grabs the preview with it.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const SY = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "synth-capture.js"));
const OR = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "synth-orient.js"));

const TOL = 0.03; // equal within 3 % (owner decision 206: "equal within a small tolerance")
/** the drawn right palm (pw 100) on a square, box-shrunk to 240 and placed at y 40 of a 240 x 320 portrait camera frame */
function cam(o) {
  o = o || {};
  const im = SY.palmImage({ pw: 100, blur: o.blur || 0 }), sq = OR.pad({ w: im.w, h: im.h, rgba: im.rgba }, Math.ceil(Math.hypot(im.w, im.h)));
  const s = OR.shrink(sq, 240), f = { w: 240, h: 320, rgba: new Uint8ClampedArray(240 * 320 * 4) };
  for (let i = 0; i < 240 * 320; i++) { f.rgba[i * 4] = 60; f.rgba[i * 4 + 1] = 80; f.rgba[i * 4 + 2] = 110; f.rgba[i * 4 + 3] = 255; }
  for (let y = 0; y < 240; y++) for (let x = 0; x < 240; x++) for (let k = 0; k < 4; k++) f.rgba[((y + 40) * 240 + x) * 4 + k] = s.rgba[(y * 240 + x) * 4 + k];
  return f;
}
/** preview frames of several sizes; CAM160 = grain added at the camera's 240 px then shrunk (like tests/e2e camera) */
const FRAMES = {
  P160: o => OR.grain(OR.shrink(cam(o), 160), 10, 3),
  P240: o => OR.grain(cam(o), 10, 3),
  P120: o => OR.grain(OR.shrink(cam(o), 120), 10, 3),
  CAM160: o => OR.shrink(OR.grain(cam(o), 10, 9), 160)
};
const live = f => PV.liveHint(new Uint8ClampedArray(f.rgba), f.w, f.h, { still: true });
const spread = v => Math.max(...v) / Math.min(...v) - 1;
/** the frame turned q quarters clockwise, mirrored first when m */
const turned = (F, q, m) => OR.quarter(m ? OR.mirror(F) : F, q);
/** the frame with its square block (side n at x0, y0) turned q quarters in place: the hand points another way, same pixels */
function blockTurn(F, q, x0, y0, n) {
  const blk = { w: n, h: n, rgba: new Uint8ClampedArray(n * n * 4) };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let k = 0; k < 4; k++) blk.rgba[(y * n + x) * 4 + k] = F.rgba[((y + y0) * F.w + x + x0) * 4 + k];
  const t = OR.quarter(blk, q), o = new Uint8ClampedArray(F.rgba);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let k = 0; k < 4; k++) o[((y + y0) * F.w + x + x0) * 4 + k] = t.rgba[(y * n + x) * 4 + k];
  return { w: F.w, h: F.h, rgba: o };
}

test("206: the same preview frame turned 0 / 90 / 180 / 270 (and mirrored) gives the same sharpness (within 3 %) and the same hint", () => {
  for (const [name, fn] of Object.entries(FRAMES)) for (const blur of [0, 0.02]) {
    const F = fn({ blur }), vals = [], hints = [];
    for (const m of [false, true]) for (const q of [0, 1, 2, 3]) { const r = live(turned(F, q, m)); vals.push(r.metrics.sharp); hints.push(r.hint); }
    assert.ok(spread(vals) <= TOL, `${name} ${F.w}x${F.h} blur ${blur}: sharpness ${vals.map(v => v.toFixed(2)).join(" / ")} (spread ${(spread(vals) * 100).toFixed(1)} %)`);
    assert.equal(new Set(hints).size, 1, `${name} blur ${blur}: hints differ by turn ${hints.join(" / ")}`);
  }
});

test("206: the hand turned inside an upright portrait frame (same pixels, square block turned) gives the same sharpness (within 3 %)", () => {
  const cases = [["P160", 0, 27, 160], ["CAM160", 0, 27, 160], ["P240", 0, 40, 240], ["P120", 0, 20, 120]];
  for (const [name, x0, y0, n] of cases) for (const blur of [0, 0.02]) {
    const F = FRAMES[name]({ blur }), vals = [], hints = [];
    for (const q of [0, 1, 2, 3]) { const r = live(blockTurn(F, q, x0, y0, n)); vals.push(r.metrics.sharp); hints.push(r.hint); }
    assert.ok(spread(vals) <= TOL, `${name} block blur ${blur}: sharpness ${vals.map(v => v.toFixed(2)).join(" / ")} (spread ${(spread(vals) * 100).toFixed(1)} %)`);
    assert.equal(new Set(hints).size, 1, `${name} block blur ${blur}: hints differ ${hints.join(" / ")}`);
  }
});

test("206: the calibrated condition is kept (upright portrait 160 px wide within 3 % of 94872611) and a blurred hand is still 'blur' at every turn", () => {
  // values measured on the product at 94872611 (where CAPTURE_T.sharp = 6 was set): P160 10.387 ok, CAM160 8.117 ok, CAM160 blur 0.02 5.666 blur
  const BASE = [["P160", 0, 10.387, "ok"], ["CAM160", 0, 8.117, "ok"], ["CAM160", 0.02, 5.666, "blur"]];
  for (const [name, blur, v0, hint] of BASE) {
    const r = live(FRAMES[name]({ blur }));
    assert.ok(Math.abs(r.metrics.sharp / v0 - 1) <= TOL, `${name} blur ${blur}: ${r.metrics.sharp.toFixed(3)} vs ${v0} at 94872611`);
    assert.equal(r.hint, hint, `${name} blur ${blur}: hint`);
  }
  assert.equal(PV.CAPTURE_T.sharp, 6, "the provisional sharpness threshold is unchanged");
  const B = FRAMES.CAM160({ blur: 0.02 });
  for (const m of [false, true]) for (const q of [0, 1, 2, 3]) assert.equal(live(turned(B, q, m)).hint, "blur", `blurred hand turn ${q}${m ? " mirrored" : ""} not 'blur'`);
  // still a contrast measure: the blurred hand reads clearly lower than the sharp one at every turn
  const S0 = FRAMES.P160({}), B0 = FRAMES.P160({ blur: 0.02 });
  for (const q of [0, 1, 2, 3]) {
    const s = live(turned(S0, q, false)).metrics.sharp, b = live(turned(B0, q, false)).metrics.sharp;
    assert.ok(b <= 0.85 * s, `turn ${q}: blurred ${b.toFixed(2)} not clearly below sharp ${s.toFixed(2)}`);
  }
});

test("206: the live preview is grabbed with its SHORT side 160 (same pixels per hand however the phone is held)", () => {
  assert.equal(typeof PV.previewSize, "function", "PV.previewSize missing");
  assert.deepEqual(PV.previewSize(240, 320), { w: 160, h: 213 });
  assert.deepEqual(PV.previewSize(320, 240), { w: 213, h: 160 });
  assert.deepEqual(PV.previewSize(1080, 1920), { w: 160, h: 284 });
  assert.deepEqual(PV.previewSize(1920, 1080), { w: 284, h: 160 });
  assert.deepEqual(PV.previewSize(480, 480), { w: 160, h: 160 });
  const ui = fs.readFileSync(path.join(ROOT, "palm-v2-ui.js"), "utf8");
  const body = ui.slice(ui.indexOf("function liveCheck("), ui.indexOf("function liveCheck(") + 600);
  assert.match(body, /PV\.previewSize\(\s*vw\s*,\s*vh\s*\)/, "liveCheck must size the preview with PV.previewSize(vw, vh)");
});
