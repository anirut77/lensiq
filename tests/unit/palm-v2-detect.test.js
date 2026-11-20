"use strict";
// tests/unit/palm-v2-detect.test.js — FIXED TEST SET "palm-layers" (palm reading upgrade v1, owner order 2026-11-19), locked in
// evals-locks/palm-layers.sha256 BEFORE any product code. The classical line finder (ridge / valley filters inside the palm
// frame, skeleton, geometry) on DRAWN SYNTHETIC hands (tests/fixtures/palm-v2/synth-hand.js). Numbers here are SYNTHETIC only.
// - every line drawn on the hand is found (status found after applyDetection) within 0.04 palm widths (mean curve distance),
//   left and right hands;
// - every found line comes from the photo: each of its control points lies on a dark valley of the image;
// - a palm with no lines (only short distractor creases) gives no found line at all (false-line count 0 on the synthetic set);
// - a line not drawn is not found (fate, sun, Mercury, bracelets absent);
// - a heavily blurred photo finds fewer lines, and what it misses is notFound (some "not clear"), never a template;
// - guide-only lines in v1 (marriage, girdle of Venus) are never reported found;
// - palm.js (legacy engine) honest mode: an empty ridge map draws no heart / head / life / fate line and "not found" is not "absent".
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const SYN = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "synth-hand.js"));
const { catmull, polyDist } = require("./palm-v2-kit.js");

/** mean distance from the found line to the drawn truth (in palm widths; v scaled by the palm aspect), over the found span */
function mcd(a, b, asp) {
  const A = catmull(a, 80).map(q => [q[0], q[1] * asp]), B = catmull(b, 80).map(q => [q[0], q[1] * asp]);
  const dA = A.map(p => polyDist(p, B));
  // over the found span only: the found line may be shorter than the truth (the ends of a crease fade)
  return dA.reduce((s, v) => s + v, 0) / dA.length;
}
function run(opt) {
  const h = SYN.synthHand(opt);
  const det = PV.detect(h.rgba, h.w, h.h, h.hand, { school: "thai" });
  const st = PV.newState({ side: h.side, school: "thai" });
  PV.applyDetection(st, det);
  return { h, det, st, F: PV.frameFromHand(h.hand) };
}
const darkAt = (h, p) => { const x = Math.round(p[0]), y = Math.round(p[1]); let m = 255; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
  const i = ((y + dy) * h.w + (x + dx)) * 4; m = Math.min(m, h.rgba[i + 1]); } return m; };

test("majors + fate drawn on the synthetic hand are found within 0.04 PW, left and right; each point lies on a dark valley", () => {
  for (const side of ["right", "left"]) for (const seed of [3, 9]) {
    const { h, st, F } = run({ lines: ["heart", "head", "life", "fate"], seed, side });
    for (const id of ["heart", "head", "life", "fate"]) {
      const L = st.lines[id];
      assert.equal(L.status, "found", `${side} seed ${seed}: ${id} not found (conf ${L.conf})`);
      const d = mcd(L.cp, h.truth[id], F.asp);
      assert.ok(d <= 0.04, `${side} seed ${seed}: ${id} mean distance ${d.toFixed(3)} PW`);
      const len = P => { const C = catmull(P, 80).map(q => [q[0], q[1] * F.asp]); return C.reduce((s, p, i) => i ? s + Math.hypot(p[0] - C[i - 1][0], p[1] - C[i - 1][1]) : 0, 0); };
      assert.ok(len(L.cp) >= 0.6 * len(h.truth[id]), `${side} seed ${seed}: ${id} covers ${(len(L.cp) / len(h.truth[id])).toFixed(2)} of the drawn line (< 0.6)`);
      for (const q of L.cp) {
        const p = F.toImg(q), g = darkAt(h, p);
        assert.ok(g < 150, `${side} ${id}: control point ${q} at ${p.map(Math.round)} is not on a valley (G=${g})`);
      }
    }
    for (const id of ["sun", "mercury", "bracelet", "simian", "marriage", "girdle"]) assert.notEqual(st.lines[id].status, "found", `${side}: ${id} found but not drawn`);
  }
});
test("a palm without lines: no found line (false-line count 0, synthetic)", () => {
  for (const seed of [1, 2, 4, 6]) {
    const { st } = run({ lines: [], seed });
    const found = PV.LINES.filter(id => st.lines[id].status === "found");
    assert.deepEqual(found, [], `seed ${seed}`);
  }
});
test("a line not drawn is not found: heart + head + life only", () => {
  const { st } = run({ lines: ["heart", "head", "life"], seed: 8 });
  assert.notEqual(st.lines.fate.status, "found");
  for (const id of ["heart", "head", "life"]) assert.equal(st.lines[id].status, "found", id);
});
test("heavy blur: fewer lines found; the rest are notFound guides, never a template drawn as found", () => {
  const sharp = run({ lines: ["heart", "head", "life", "fate"], seed: 3 });
  const blur = run({ lines: ["heart", "head", "life", "fate"], seed: 3, blur: 9, depth: 0.5 });
  const n = s => PV.LINES.filter(id => s.st.lines[id].status === "found").length;
  assert.ok(n(blur) < n(sharp), `blurred ${n(blur)} vs sharp ${n(sharp)}`);
  for (const id of PV.LINES) if (blur.st.lines[id].status === "found") {
    const d = mcd(blur.st.lines[id].cp, blur.h.truth[id] || PV.guides("thai")[id].cp, blur.F.asp);
    assert.ok(blur.h.truth[id] && d <= 0.05, `blurred ${id} found off the truth (${d})`);
  }
});
test("detector output: confidence per line in [0, 1], control points in the palm frame, guide-only lines never found", () => {
  const { det, st } = run({ lines: ["heart", "head", "life", "fate", "sun", "mercury", "bracelet"], seed: 12 });
  for (const id of Object.keys(det.lines)) {
    const L = det.lines[id];
    assert.ok(PV.LINES.includes(id), id);
    assert.ok(L.conf >= 0 && L.conf <= 1, `${id} conf ${L.conf}`);
    if (L.cp) assert.ok(L.cp.length >= 2 && L.cp.every(q => q[0] > -0.6 && q[0] < 1.6 && q[1] > -0.4 && q[1] < 1.5), `${id} cp ${JSON.stringify(L.cp)}`);
  }
  for (const id of ["marriage", "girdle"]) assert.notEqual(st.lines[id].status, "found", id + " is guide-only in v1");
  assert.ok(typeof det.ms === "number");
});
test("palm.js honest mode: an empty ridge map draws no line; fate 'not found' is not 'absent'", () => {
  global.PALM_KB = require(path.join(ROOT, "palm-kb.js"));
  const PC = require(path.join(ROOT, "palm.js"));
  const h = SYN.synthHand({ lines: [] }).hand;
  const F = PC.palmFrame(h);
  const R = { resp: new Float32Array(F.w * F.h), dir: new Float32Array(F.w * F.h), w: F.w, h: F.h };
  const honest = PC.detectLines(R, F, { honest: true });
  for (const id of ["life", "head", "heart", "fate"]) {
    assert.equal(honest[id].present, false, id + " drawn without a crease");
    assert.equal(honest[id].notFound, true, id);
  }
  const lc = PC.classifyLines(honest, F.asp, R, F);
  assert.ok(!(lc.cats.fate || []).includes("absent"), "fate not found was read as absent");
  for (const id of ["life", "head", "heart"]) assert.equal(lc.cats[id], undefined, id + " read although not found");
  // the default (switch off) keeps today's behaviour
  const legacy = PC.detectLines(R, F);
  assert.equal(legacy.life.present, true);
});
