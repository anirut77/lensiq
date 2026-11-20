"use strict";
// tests/unit/palm-capture-orient.test.js — FIXED TEST SET "palm-capture-orient" (owner request 2026-11-20: when another person
// takes the photo, the dashed hand guide pointed the wrong way: fingers down, or the hand mirrored). Locked in
// evals-locks/palm-capture-orient.sha256 (~/LENSIQ-field/evals/palm-capture-orient/) BEFORE the product change. Everything stays
// behind window.LENSIQ_PALM_V2 (off). DRAWN SYNTHETIC hands only (tests/fixtures/palm-v2/synth-capture.js, synth-orient.js);
// every number here is SYNTHETIC.
// Owner spec:
//   1 orientation-free capture: any rotation, either mirror; after capture the photo is turned and mirrored into the canonical
//     layout (fingers up, index knuckle on the image right) from the wrist-to-finger direction BEFORE line finding; the guide is
//     for distance and position only; no live hint depends on which way the fingers point.
//   2 the guide follows the hand when hand points are available (LENSIQ_PALM_LANDMARKS, tier 2-U, off in customer builds).
//   3 fallback without hand points: "own hand" / "for someone else" flip the guide 180 degrees; a "rotate frame" button flips it
//     too; default own hand; draft EN / ZH labels (owner approval pending).
//   4 left / right from the thumb position in the captured photo, never from the guide or the camera label; shown as a chip the
//     user can confirm or change; the reading follows the confirmed hand.
// Contract under test (palm-v2.js, browser global PalmV2):
//   orientPose(hand) -> { angle, quarter, mirror }: angle = direction wrist -> knuckle midpoint in degrees, 0 = fingers up,
//     clockwise positive (90 = fingers to the image right), in (-180, 180]; quarter = the nearest quarter turn 0..3 (angle / 90
//     rounded, mod 4); mirror = after turning the fingers up, the index knuckle is on the image LEFT (so a mirror is needed).
//   canonicalTransform(hand, { scale }) -> { m: [a, b, c, d, e, f] (canvas setTransform order: x' = a x + c y + e,
//     y' = b x + d y + f), w, h, angle, quarter, mirror, scale }: image px -> canonical px; covers the palm frame
//     u -0.4..1.35, v -0.15..1.25.
//   applyAffine(m, p) -> p'; mapHand(hand, fn) -> a copy with every point through fn;
//   warpRGBA(rgba, w, h, T) -> Uint8ClampedArray (T.w x T.h x 4), bilinear, outside = 0.
//   detectOriented(rgba, w, h, hand, { school }) -> the detect() result (lines in palm-frame u, v) + canon { angle, quarter,
//     mirror, w, h }: the line finder runs on the canonical image.
//   liveHint(rgba, w, h, { still }) -> { hint, hand, metrics }: the live check of the camera preview (skin blob, metrics on the
//     palm around the blob centre, captureHint); hand.tilt is null (no hint about the pointing direction); hand.open from the
//     blob's own long axis, either end.
//   guidePose({ mode, flip, hand }) -> { angle, side, by }: with hand points: angle = orientPose(hand).angle, side = the
//     thumb-geometry side as the camera sees it (handSide raw), by "landmarks"; without: angle 0 own hand / 180 for someone
//     else, + 180 when flipped (mod 360), side null, by "mode".
//   poseContour(contour, w, h, pose) -> the contour turned by pose.angle about the frame centre (and scaled down about the
//     centre only if needed to stay inside the frame).
//   T keys: mode.self, mode.other, guide.rotate, side.chip.left, side.chip.right, reading.side.left, reading.side.right.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const SY = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "synth-capture.js"));
const OR = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "synth-orient.js"));

const LANGS = ["th", "en", "zh"];
/* owner spec 2026-11-20 (TH approved wording; EN / ZH = drafts for owner approval) */
const TEXTS = {
  "mode.self": ["ถ่ายมือตัวเอง", "Photo of my hand", "拍自己的手"],
  "mode.other": ["ถ่ายให้คนอื่น", "Photo for someone else", "帮别人拍"],
  "guide.rotate": ["หมุนกรอบ", "Rotate frame", "旋转框"],
  "side.chip.right": ["มือขวา ✓ แตะเพื่อเปลี่ยน", "Right hand ✓ tap to change", "右手 ✓ 点按更改"],
  "side.chip.left": ["มือซ้าย ✓ แตะเพื่อเปลี่ยน", "Left hand ✓ tap to change", "左手 ✓ 点按更改"],
  "reading.side.right": ["อ่านจากมือขวา", "Reading of the right hand", "解读的是右手"],
  "reading.side.left": ["อ่านจากมือซ้าย", "Reading of the left hand", "解读的是左手"]
};
/* the existing consent line (unchanged; shown for "for someone else") */
const CONSENT = [
  "ถ่ายภาพมือของคนอื่นได้เฉพาะเมื่อเจ้าของมือรู้และยินยอมแล้วเท่านั้น ภาพไม่ถูกบันทึกและไม่ถูกส่งออกจากเครื่องนี้",
  "Photograph another person's hand only when they know and agree. The photo is not saved and does not leave this device.",
  "仅在对方知情并同意的情况下拍摄其手掌。照片不会被保存，也不会离开本设备。"
];
const angDiff = (a, b) => { let d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); };
const has = f => typeof PV[f] === "function";

/** the variants of one synthetic right palm (pw 480): q quarter turns clockwise, optionally mirrored first */
const BASE = SY.palmImage({ pw: 480 });
const VARIANTS = [
  { name: "0", q: 0, mir: false }, { name: "90", q: 1, mir: false }, { name: "180", q: 2, mir: false }, { name: "270", q: 3, mir: false },
  { name: "mirrored", q: 0, mir: true }, { name: "mirrored 180", q: 2, mir: true }
];
function variant(v) { let im = { w: BASE.w, h: BASE.h, rgba: BASE.rgba, taps: BASE.taps }; if (v.mir) im = OR.mirror(im); return OR.quarter(im, v.q); }
/** mean symmetric nearest distance between two control-point curves (palm widths) */
function curveDist(a, b) {
  const A = PV.catmull(a, 40), B = PV.catmull(b, 40);
  const near = (P, Q) => P.reduce((s, p) => s + Math.min(...Q.map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))), 0) / P.length;
  return (near(A, B) + near(B, A)) / 2;
}

test("orientPose: wrist-to-finger direction at 0 / 90 / 180 / 270 and mirrored; quarter turn; mirror flag", () => {
  assert.ok(has("orientPose"), "PV.orientPose missing");
  for (const v of VARIANTS) {
    const im = variant(v), p = PV.orientPose(PV.handFromTaps(im.taps));
    assert.ok(angDiff(p.angle, v.q * 90) <= 1, `${v.name}: angle ${p.angle}`);
    assert.ok(p.angle > -180 && p.angle <= 180, `${v.name}: angle range ${p.angle}`);
    assert.equal(p.quarter, v.q, `${v.name}: quarter`);
    assert.equal(p.mirror, v.mir, `${v.name}: mirror`);
  }
  // any angle, not only quarter turns
  for (const deg of [30, 45, 135, -60, 200]) {
    const lm = SY.landmarks({ rot: deg });
    const p = PV.orientPose(lm.hand);
    assert.ok(angDiff(p.angle, deg) <= 4, `landmarks rot ${deg}: angle ${p.angle}`);
    assert.equal(p.mirror, false, `landmarks rot ${deg}: right palm needs no mirror`);
    assert.equal(PV.orientPose(SY.landmarks({ rot: deg, side: "left" }).hand).mirror, true, `left palm rot ${deg}: mirror`);
  }
});

test("canonical layout BEFORE line finding: every variant becomes the same upright, index-right image", () => {
  for (const f of ["canonicalTransform", "applyAffine", "warpRGBA", "mapHand"]) assert.ok(has(f), "PV." + f + " missing");
  const ref = (() => { const h = PV.handFromTaps(BASE.taps), T = PV.canonicalTransform(h, { scale: 0.5 }); return { T, px: PV.warpRGBA(BASE.rgba, BASE.w, BASE.h, T) }; })();
  for (const v of VARIANTS) {
    const im = variant(v), hand = PV.handFromTaps(im.taps), T = PV.canonicalTransform(hand, { scale: 0.5 });
    assert.equal(T.quarter, v.q, `${v.name}: quarter`); assert.equal(T.mirror, v.mir, `${v.name}: mirror`);
    assert.ok(Math.abs(T.w - ref.T.w) <= 1 && Math.abs(T.h - ref.T.h) <= 1, `${v.name}: canonical size ${T.w}x${T.h} vs ${ref.T.w}x${ref.T.h}`);
    const ch = PV.mapHand(hand, p => PV.applyAffine(T.m, p));
    const M = [(ch.mcp.index[0] + ch.mcp.pinky[0]) / 2, (ch.mcp.index[1] + ch.mcp.pinky[1]) / 2];
    const up = Math.atan2(M[0] - ch.wrist[0], -(M[1] - ch.wrist[1])) * 180 / Math.PI;
    assert.ok(Math.abs(up) <= 1, `${v.name}: canonical fingers not up (${up} deg)`);
    assert.ok(ch.mcp.index[0] > ch.mcp.pinky[0], `${v.name}: canonical index knuckle not on the image right`);
    const px = PV.warpRGBA(im.rgba, im.w, im.h, T), w = Math.min(T.w, ref.T.w), h = Math.min(T.h, ref.T.h);
    let s = 0, n = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const a = (y * T.w + x) * 4, b = (y * ref.T.w + x) * 4;
      for (let k = 0; k < 3; k++) { s += Math.abs(px[a + k] - ref.px[b + k]); n++; }
    }
    assert.ok(s / n < 3, `${v.name}: canonical image differs from the upright one (mean abs ${(s / n).toFixed(2)})`);
  }
});

test("lines: the same synthetic hand at 0 / 90 / 180 / 270 and mirrored gives the same lines (status; curves within 0.03 palm widths)", () => {
  assert.ok(has("detectOriented"), "PV.detectOriented missing");
  const ref = PV.detectOriented(BASE.rgba, BASE.w, BASE.h, PV.handFromTaps(BASE.taps), { school: "thai" });
  const refFound = PV.LINES.filter(id => ref.lines[id] && ref.lines[id].cp);
  assert.ok(refFound.length >= 3, "upright reference finds the major lines: " + refFound.join(","));
  for (const v of VARIANTS) {
    const im = variant(v), det = PV.detectOriented(im.rgba, im.w, im.h, PV.handFromTaps(im.taps), { school: "thai" });
    assert.ok(det.canon && det.canon.quarter === v.q && det.canon.mirror === v.mir, `${v.name}: canon ${JSON.stringify(det.canon)}`);
    for (const id of PV.LINES) {
      const a = ref.lines[id] || {}, b = det.lines[id] || {};
      assert.equal(!!b.cp, !!a.cp, `${v.name} ${id}: found in one and not the other`);
      if (a.cp && b.cp) {
        const d = curveDist(a.cp, b.cp);
        assert.ok(d <= 0.03, `${v.name} ${id}: curve differs by ${d.toFixed(4)} palm widths`);
        assert.ok(Math.abs((a.conf || 0) - (b.conf || 0)) <= 0.1, `${v.name} ${id}: confidence ${a.conf} vs ${b.conf}`);
      }
    }
  }
});

test("left / right: the same result at 0 / 90 / 180 / 270 and mirrored (with the mirror known), from the thumb position", () => {
  const up = PV.handSide({ hand: PV.handFromTaps(BASE.taps), mirrored: false });
  assert.equal(up.side, "right");
  for (const v of VARIANTS) {
    const im = variant(v), s = PV.handSide({ hand: PV.handFromTaps(im.taps), mirrored: v.mir });
    assert.equal(s.side, "right", `${v.name}: side ${JSON.stringify(s)}`);
  }
  for (const side of ["left", "right"]) for (const rot of [0, 90, 180, 270, 45, -135]) for (const mir of [false, true]) {
    const lm = SY.landmarks({ side, rot, mirror: mir });
    const s = PV.handSide({ hand: lm.hand, mirrored: mir });
    assert.equal(s.side, side, `landmarks ${side} rot ${rot} mirror ${mir}: ${JSON.stringify(s)}`);
    assert.equal(s.by, "thumb", `landmarks ${side} rot ${rot}: decided by the thumb`);
  }
});

/** a synthetic right palm (pw 140) on a square so every turn keeps the same frame, seen at 160 px like the live check */
const LIVE = (() => { const im = SY.palmImage({ pw: 140 }); const side = Math.ceil(Math.hypot(im.w, im.h)); return OR.pad({ w: im.w, h: im.h, rgba: im.rgba, taps: im.taps }, side); })();
/** what the live check sees: 160 px wide, with a camera's sensor grain (same seed for every variant) */
const seen = im => OR.grain(OR.shrink(im, 160), 10, 3);
test("live check: the guide never blocks capture because of orientation (any turn, mirrored): hint ok, no tilt / open hint", () => {
  assert.ok(has("liveHint"), "PV.liveHint missing");
  for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) for (const mir of [false, true]) {
    let im = mir ? OR.mirror(LIVE) : LIVE;
    im = deg % 90 === 0 ? OR.quarter(im, deg / 90) : OR.rotate(im, deg);
    const small = seen(im), r = PV.liveHint(small.rgba, small.w, small.h, { still: true });
    assert.equal(r.hint, "ok", `${deg} deg${mir ? " mirrored" : ""}: hint ${r.hint} ${JSON.stringify(r.hand)}`);
    assert.equal(r.hand.tilt, null, `${deg}: tilt must not be measured for the live hint`);
    assert.equal(r.hand.open, true, `${deg}: open hand not seen`);
  }
  // the pointing direction alone never yields "tilt" or "open"
  for (const deg of [10, 20, 30, 60, 100, 160]) {
    const small = seen(OR.rotate(LIVE, deg)), r = PV.liveHint(small.rgba, small.w, small.h, { still: true });
    assert.ok(r.hint !== "tilt" && r.hint !== "open", `${deg}: ${r.hint}`);
  }
  // still a real check: no hand, and a moving hand
  const empty = new Uint8ClampedArray(160 * 160 * 4).fill(90);
  assert.equal(PV.liveHint(empty, 160, 160, { still: true }).hint, "noHand");
  const small = seen(LIVE);
  assert.equal(PV.liveHint(small.rgba, small.w, small.h, { still: false }).hint, "still");
});

test("guide pose: own hand 0, for someone else 180, the rotate button flips 180; with hand points the guide follows the hand", () => {
  assert.ok(has("guidePose"), "PV.guidePose missing");
  const g = o => PV.guidePose(o);
  assert.deepEqual([g({ mode: "self" }).angle, g({ mode: "self" }).by, g({ mode: "self" }).side], [0, "mode", null]);
  assert.equal(g({ mode: "other" }).angle, 180);
  assert.equal(g({ mode: "self", flip: true }).angle, 180);
  assert.equal(g({ mode: "other", flip: true }).angle % 360, 0);
  for (const side of ["left", "right"]) for (const rot of [0, 30, 90, 180, -90, 135]) for (const mode of ["self", "other"]) {
    const lm = SY.landmarks({ side, rot }), p = g({ mode, flip: mode === "other", hand: lm.hand });
    assert.equal(p.by, "landmarks");
    assert.ok(angDiff(p.angle, rot) <= 4, `${side} ${rot} ${mode}: angle ${p.angle}`);
    assert.equal(p.side, side, `${side} ${rot}: side ${p.side}`);
    // a mirrored picture of that hand looks like the other hand: the guide mirrors with it
    const pm = g({ mode, hand: SY.landmarks({ side, rot, mirror: true }).hand });
    assert.equal(pm.side, side === "left" ? "right" : "left", `${side} ${rot} mirrored picture: guide side ${pm.side}`);
  }
});

test("poseContour: the guide outline turns about the frame centre and stays inside the frame", () => {
  assert.ok(has("poseContour"), "PV.poseContour missing");
  const W = 390, H = 520, C = [[150, 100], [240, 100], [260, 300], [230, 470], [160, 470], [130, 300]];
  const same = PV.poseContour(C, W, H, { angle: 0 });
  same.forEach((p, i) => assert.ok(Math.hypot(p[0] - C[i][0], p[1] - C[i][1]) < 1e-6, "angle 0 changed the outline"));
  const flip = PV.poseContour(C, W, H, { angle: 180 });
  flip.forEach((p, i) => assert.ok(Math.hypot(p[0] - (W - C[i][0]), p[1] - (H - C[i][1])) < 1e-6, "180 is not a half turn about the centre"));
  for (const a of [30, 90, -90, 135]) {
    const P = PV.poseContour(C, W, H, { angle: a });
    assert.ok(P.every(p => p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H), `${a}: outside the frame`);
    const d = Math.atan2(P[0][0] - P[3][0], -(P[0][1] - P[3][1])) * 180 / Math.PI, d0 = Math.atan2(C[0][0] - C[3][0], -(C[0][1] - C[3][1])) * 180 / Math.PI;
    assert.ok(angDiff(d - d0, a) <= 1, `${a}: turned by ${d - d0}`);
  }
});

test("texts: own hand / for someone else / rotate frame / hand chip / reading side, exact TH / EN / ZH; the consent line is unchanged", () => {
  for (const [k, v] of Object.entries(TEXTS)) LANGS.forEach((l, i) => assert.equal(PV.T(k, l), v[i], `${k} ${l}`));
  LANGS.forEach((l, i) => assert.equal(PV.T("consent.other", l), CONSENT[i], `consent.other ${l}`));
  const all = PV.allTexts();
  for (const k of Object.keys(TEXTS)) for (const l of LANGS) assert.ok(all.some(t => t.key === k && t.lang === l), `allTexts lacks ${k} ${l}`);
});
