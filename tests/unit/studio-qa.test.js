"use strict";
// tests/unit/studio-qa.test.js — the automated QA gate (studio-qa.js) detects each failure class on synthetic composites
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Q = require(path.join(__dirname, "..", "..", "studio-qa.js"));
const SC = require(path.join(__dirname, "..", "..", "studio-core.js"));

const fill = (w, h, f) => { const a = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y); return a; };
const rgbaFill = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255; } return d; };
const W = 200, H = 240, face = { cx: 100, chinX: 100, chinY: 80, eyeY: 50, fw: 60 }, fit = { N: { x: 100, y: 95 }, s: 60, theta: 0 };

test("hairCut: a headscarf cut straight at a row is flagged; a natural ragged hair end is not", () => {
  const src = rgbaFill(W, H, () => [40, 50, 90]), alpha = new Float32Array(W * H).fill(1);
  const cut = fill(W, H, (x, y) => (y < 100 && Math.abs(x - 100) < 50 ? 1 : 0));
  assert.ok(Q.hairCut(cut, src, alpha, W, H, face).rows >= 1, "straight cut over continuous fabric");
  const ragged = fill(W, H, (x, y) => (y < 100 + ((x * 7) % 13) && Math.abs(x - 100) < 50 ? 1 : 0));
  assert.equal(Q.hairCut(ragged, src, alpha, W, H, face).rows, 0, "ragged tips are not a cut");
});

test("neckCheck: background hole in the neck, grey neck colour and an over-wide neck box are measured", () => {
  const skinLab = SC.rgbToLab(200, 150, 120), base = { W, H, face, collarY: 120, skinLab, mono: false, labOf: SC.rgbToLab };
  const neckA = fill(W, H, (x, y) => (Math.abs(x - 100) < 17 && y >= 80 && y < 125 ? 1 : 0)), zero = new Float32Array(W * H);
  const good = Q.neckCheck({ ...base, out: rgbaFill(W, H, () => [190, 140, 112]), fg: fill(W, H, (x, y) => (Math.abs(x - 100) < 60 ? 1 : 0)), neckA, frontA: zero, keepA: zero });
  assert.ok(good.bgPct < .5 && good.dE < 8 && good.wide < .7, JSON.stringify(good));
  const hole = Q.neckCheck({ ...base, out: rgbaFill(W, H, () => [190, 140, 112]), fg: fill(W, H, (x, y) => (Math.abs(x - 100) < 60 && !(Math.abs(x - 100) < 6 && y > 90 && y < 110) ? 1 : 0)), neckA, frontA: zero, keepA: zero });
  assert.ok(hole.bgPct > 3, "hole: " + hole.bgPct);
  const grey = Q.neckCheck({ ...base, out: rgbaFill(W, H, () => [150, 150, 150]), fg: fill(W, H, () => 1), neckA, frontA: zero, keepA: zero });
  assert.ok(grey.dE > 16, "grey neck: " + grey.dE);
  const box = Q.neckCheck({ ...base, out: rgbaFill(W, H, () => [190, 140, 112]), fg: fill(W, H, () => 1), neckA: fill(W, H, (x, y) => (Math.abs(x - 100) < 40 && y >= 80 && y < 125 ? 1 : 0)), frontA: zero, keepA: zero });
  assert.ok(box.wide > .82, "box: " + box.wide);
});

test("hemCheck: wavy garment sides and holes are flagged; smooth sides pass", () => {
  const fg = fill(W, H, () => 1), smooth = fill(W, H, (x, y) => (y > 90 && Math.abs(x - 100) < 80 ? 1 : 0));
  assert.ok(Q.hemCheck({ frontA: smooth, fg, W, H, fit }).rough < .02);
  const wavy = fill(W, H, (x, y) => (y > 90 && Math.abs(x - 100) < 80 + Math.sin(y * .5) * 8 ? 1 : 0));
  assert.ok(Q.hemCheck({ frontA: wavy, fg, W, H, fit }).rough > Q.LIMITS.hemRough, "wavy");
  const holed = Q.hemCheck({ frontA: smooth, fg: fill(W, H, (x, y) => ((x - 100) ** 2 + (y - 200) ** 2 < 100 ? 0 : 1)), W, H, fit });
  assert.ok(holed.holePct > Q.LIMITS.hemHolePct, "hole " + holed.holePct);
});

test("shoulderCheck: garment top far from the measured shoulder samples, and raised over the hair, are flagged", () => {
  const samples = [{ x: 40, y: 110 }, { x: 160, y: 110 }, { x: 50, y: 108 }, { x: 150, y: 108 }];
  const ok = fill(W, H, (x, y) => (y >= 109 && Math.abs(x - 100) < 80 ? 1 : 0)), hair = fill(W, H, (x, y) => (Math.abs(x - 100) > 30 && y < 140 ? 1 : 0));
  assert.ok(Q.shoulderCheck({ frontA: ok, W, H, fit, samples, hair }).dy < .05);
  const high = fill(W, H, (x, y) => (y >= 70 && Math.abs(x - 100) < 80 ? 1 : 0)), r = Q.shoulderCheck({ frontA: high, W, H, fit, samples, hair });
  assert.ok(r.dy > Q.LIMITS.shoulderDy && r.raised > Q.LIMITS.shoulderRaised, JSON.stringify(r));
});

test("accessory / skinIsland / bgChunk / hands: remnants and pasted hands are detected", () => {
  const src = rgbaFill(W, H, (x, y) => (y > 95 && y < 102 ? [20, 15, 10] : [200, 150, 120]));
  const keepNeck = fill(W, H, (x, y) => (y > 95 && y < 102 && Math.abs(x - 100) < 20 ? 1 : 0));
  assert.ok(Q.accessory({ keepA: keepNeck, src, W, H, face, jaw: () => 80 }) > Q.LIMITS.accessory, "beads left on the neck");
  const frontA = fill(W, H, (x, y) => (y > 95 ? 1 : 0)), island = fill(W, H, (x, y) => (Math.abs(x - 100) < 8 && y > 150 && y < 165 ? 1 : 0));
  assert.ok(Q.skinIsland({ keepA: island, frontA, hands: null, hair: null, W, H, face }) > Q.LIMITS.skinIsland, "skin island on the chest");
  assert.equal(Q.skinIsland({ keepA: island, frontA, hands: island, hair: null, W, H, face }), 0, "a detected hand is not an island");
  const white = rgbaFill(W, H, () => [235, 235, 235]), side = fill(W, H, (x, y) => (x > 170 && y < 70 && y > 30 ? 1 : 0));
  assert.ok(Q.bgChunk({ keepA: side, src: white, W, H, face, hairLab: [20, 2, 4], labOf: SC.rgbToLab }) > Q.LIMITS.bgChunk, "white chunk beside the head");
  const hands = fill(W, H, (x, y) => ((x - 100) ** 2 + (y - 200) ** 2 < 300 ? 1 : 0));
  assert.equal(Q.handsCheck({ hands, W, H, fit, arms: [] }).orphan, 1, "hand without a sleeve");
  assert.equal(Q.handsCheck({ hands, W, H, fit, arms: [{ hand: true, Wr: { u: 0, v: (190 - 95) / 60 } }] }).orphan, 0, "sleeve ends at the hand");
});

test("verdict maps metrics to named failure classes", () => {
  const m = { hairCut: { rows: 9 }, neck: { bgPct: 0, dE: 0, lRatio: 1, wide: .5, visible: 100 }, bgChunk: 0, hem: { rough: 0, holePct: 0 }, shoulder: { n: 0, dy: 0, raised: 0 }, accessory: 0, skinIsland: 0, hands: { orphan: 0 } };
  assert.deepEqual(Q.verdict(m), ["hair-cut"]);
});

test("floatingHand: a hand shown far from any garment is flagged; a hand on the garment is not", () => {
  const frontA = fill(W, H, (x, y) => (y > 95 && Math.abs(x - 100) < 50 ? 1 : 0));
  const far = fill(W, H, (x, y) => ((x - 185) ** 2 + (y - 200) ** 2 < 100 ? 1 : 0)), on = fill(W, H, (x, y) => ((x - 100) ** 2 + (y - 200) ** 2 < 100 ? 1 : 0));
  assert.ok(Q.floatingHand({ keepA: far, frontA, W, H, face, hands: far }) > Q.LIMITS.floatingHand);
  assert.equal(Q.floatingHand({ keepA: on, frontA, W, H, face, hands: on }), 0);
});

test("neckJoin: a background notch between the collar and the jaw, and a half-transparent collar fringe, are measured", () => {
  const fg = fill(W, H, (x, y) => (y > 70 && !(y > 85 && y < 95 && Math.abs(x - 112) < 5) ? 1 : 0)), keepA = fill(W, H, (x, y) => (y < 80 ? 1 : 0));
  const front = fill(W, H, (x, y) => (y > 95 ? 1 : Math.abs(x - 90) < 6 && y > 85 && y <= 95 ? .3 : 0));
  // ช่องที่ขอบทั้งสองข้างเป็นคอ (neckA) = รูในคอ; ช่องเดียวกันที่ข้าง ๆ ไม่ใช่ผิว (เช่น ผม) ไม่นับ
  const neckA = fill(W, H, (x, y) => (y >= 80 && y <= 95 && Math.abs(x - 112) < 30 ? 1 : 0));
  const r = Q.neckJoin({ fg, frontA: front, keepA, W, H, face, fit, neckA });
  assert.equal(Q.neckJoin({ fg, frontA: front, keepA, W, H, face, fit, neckA, hair: neckA }).gapPct, 0, "gap bounded by hair is real background");
  assert.ok(r.gapPct > Q.LIMITS.neckJoinGap, "notch " + r.gapPct);
  assert.ok(r.fringePct > 0, "fringe " + r.fringePct);
  const clean = Q.neckJoin({ fg: fill(W, H, (x, y) => (y > 70 ? 1 : 0)), frontA: fill(W, H, (x, y) => (y > 95 ? 1 : 0)), keepA, W, H, face, fit });
  assert.equal(clean.gapPct, 0);
});

test("neckFlat / strayParts / leftover: flat synthetic neck, detached fragment and plain leftover garment colour are measured", () => {
  const neckA = fill(W, H, (x, y) => (Math.abs(x - 100) < 18 && y >= 80 && y < 120 ? 1 : 0)), zero = new Float32Array(W * H);
  const flat = Q.neckFlat({ out: rgbaFill(W, H, () => [150, 100, 80]), neckA, frontA: zero, keepA: zero, W, H, face });
  assert.ok(flat.cv < Q.LIMITS.neckFlatCv && flat.area > Q.LIMITS.neckFlatArea, JSON.stringify(flat));
  const tex = Q.neckFlat({ out: rgbaFill(W, H, (x, y) => [150 + ((x * 13 + y * 7) % 90) - 45, 100, 80]), neckA, frontA: zero, keepA: zero, W, H, face });
  assert.ok(tex.cv > Q.LIMITS.neckFlatCv, "textured " + tex.cv);
  const fg = fill(W, H, (x, y) => (Math.abs(x - 100) < 60 && y > 20 ? 1 : (x - 10) ** 2 + (y - 220) ** 2 < 40 ? 1 : 0));
  assert.ok(Q.strayParts({ fg, W, H, face }) > Q.LIMITS.stray, "detached fragment");
  const keepA = fill(W, H, (x, y) => (y > 150 && y < 170 && Math.abs(x - 100) < 15 ? 1 : 0));
  assert.ok(Q.leftover({ keepA, src: rgbaFill(W, H, () => [20, 30, 70]), W, H, face, hands: null, hair: null }) > Q.LIMITS.leftover, "plain leftover patch");
});

test("neckNotch: a face cut flat and wide above a narrow neck column is a stepped notch; a rounded jaw tapering into the neck is not", () => {
  const zero = new Float32Array(W * H), neckA = fill(W, H, (x, y) => (Math.abs(x - 100) < 12 && y >= 70 && y < 110 ? 1 : 0));
  const flat = fill(W, H, (x, y) => (y < 80 && Math.abs(x - 100) < 30 ? 1 : 0));
  const r = Q.neckNotch({ keepA: flat, neckA, frontA: zero, W, H, face, collarY: 105 });
  assert.ok(r.maxJump > Q.LIMITS.neckNotch, JSON.stringify(r));
  const round = fill(W, H, (x, y) => (y < 80 && Math.abs(x - 100) < 12 + 18 * Math.sqrt(Math.max(0, 1 - ((y - 50) / 30) ** 2)) ? 1 : 0));
  assert.equal(Q.neckNotch({ keepA: round, neckA, frontA: zero, W, H, face, collarY: 105 }).maxJump, 0);
});

test("faceIsland: a thin sliver hanging off the jaw is measured; a clean rounded face edge is not", () => {
  const P = []; for (let k = 0; k < 17; k++) { const a = Math.PI * (k / 16); P.push({ x: 100 - 30 * Math.cos(a), y: 50 + 30 * Math.sin(a) }); }
  const f2 = { ...face, P };
  const clean = fill(W, H, (x, y) => ((x - 100) ** 2 / 900 + (y - 50) ** 2 / 900 < 1 ? 1 : 0));
  assert.ok(Q.faceIsland({ keepA: clean, hair: null, W, H, face: f2, SC }) <= Q.LIMITS.faceIsland, "clean edge");
  const sliver = fill(W, H, (x, y) => (clean[y * W + x] || (x >= 128 && x <= 129 && y > 55 && y < 95) ? 1 : 0));
  assert.ok(Q.faceIsland({ keepA: sliver, hair: null, W, H, face: f2, SC }) > Q.LIMITS.faceIsland, "sliver");
});

test("neckRel: a dark flat neck block (vs the lower face) is flagged; a neck with the face's tone and skin texture is not", () => {
  const zero = new Float32Array(W * H), neckA = fill(W, H, (x, y) => (Math.abs(x - 100) < 15 && y >= 80 && y < 130 ? 1 : 0)), keepA = fill(W, H, (x, y) => (y < 80 && Math.abs(x - 100) < 30 ? 1 : 0));
  const tex = (x, y) => ((x * 13 + y * 7) % 21) - 10;
  const bad = Q.neckRel({ out: rgbaFill(W, H, (x, y) => (y < 80 ? [180 + tex(x, y), 140, 120] : [70, 50, 40])), neckA, frontA: zero, keepA, W, H, face });
  assert.ok(bad.lRel < Q.LIMITS.neckRelL && bad.texRel < Q.LIMITS.neckRelTex, JSON.stringify(bad));
  const good = Q.neckRel({ out: rgbaFill(W, H, (x, y) => [165 + tex(x, y), 125, 105]), neckA, frontA: zero, keepA, W, H, face });
  assert.ok(good.lRel > Q.LIMITS.neckRelL && good.texRel > Q.LIMITS.neckRelTex, JSON.stringify(good));
});

test("jawBlob: a solid dark flap or a background gap next to the jaw (vs the original photo) is flagged; a clean jaw is not", () => {
  const P = []; for (let k = 0; k < 17; k++) { const a = Math.PI * (k / 16); P.push({ x: 100 - 40 * Math.cos(a), y: 50 + 40 * Math.sin(a) }); }
  for (let k = 17; k < 68; k++) P.push({ x: 100, y: 60 }); P[36] = { x: 85, y: 45 }; P[45] = { x: 115, y: 45 }; P[57] = { x: 100, y: 78 };
  const f2 = { ...face, P, fw: 80, chinY: 90 }, zero = new Float32Array(W * H), one = new Float32Array(W * H).fill(1);
  const inFace = (x, y) => (x - 100) ** 2 + (y - 50) ** 2 < 1600;
  const skin = (x, y) => [190 + ((x * 7 + y * 3) % 9) - 4, 140, 115];
  const src = rgbaFill(W, H, skin), clean = rgbaFill(W, H, (x, y) => (inFace(x, y) ? skin(x, y) : [215, 231, 247]));
  const fgClean = fill(W, H, (x, y) => (inFace(x, y) || y > 95 ? 1 : 0)), frontA = fill(W, H, (x, y) => (y > 95 ? 1 : 0));
  assert.equal(Q.jawBlob({ out: clean, src, srcA: zero, fg: fgClean, frontA, hair: null, W, H, face: f2 }).area, 0, "clean jaw");
  const flap = rgbaFill(W, H, (x, y) => (x >= 140 && x < 152 && y >= 60 && y < 85 ? [40, 30, 25] : inFace(x, y) ? skin(x, y) : [215, 231, 247]));
  const fgFlap = fill(W, H, (x, y) => (fgClean[y * W + x] || (x >= 140 && x < 152 && y >= 60 && y < 85) ? 1 : 0));
  const r = Q.jawBlob({ out: flap, src, srcA: zero, fg: fgFlap, frontA, hair: null, W, H, face: f2 });
  assert.ok(r.area > Q.LIMITS.jawBlob && r.kind === "dark", JSON.stringify(r));
  const gap = Q.jawBlob({ out: clean, src, srcA: one, fg: fill(W, H, (x, y) => (inFace(x, y) || y > 95 || (Math.abs(x - 100) < 25 && y < 96) ? 1 : 0)), frontA, hair: null, W, H, face: f2 });
  assert.ok(gap.area > Q.LIMITS.jawBlob && gap.kind === "gap", JSON.stringify(gap));
});

test("revealed: background that replaces the original person right beside the shown head is measured; a fully covered join is 0", () => {
  const head = fill(W, H, (x, y) => (Math.hypot(x - 100, y - 55) < 30 ? 1 : 0));
  const srcA = fill(W, H, (x, y) => (Math.hypot(x - 100, y - 55) < 30 || (Math.abs(x - 100) < 45 && y > 55) ? 1 : 0));
  const covered = fill(W, H, (x, y) => (head[y * W + x] || (Math.abs(x - 100) < 45 && y > 55) ? 1 : 0));
  assert.equal(Q.revealed({ fg: covered, srcA, keepA: head, W, H, face, SC }), 0);
  const cut = fill(W, H, (x, y) => (covered[y * W + x] && !(x > 118 && x < 145 && y > 70 && y < 100) ? 1 : 0));
  assert.ok(Q.revealed({ fg: cut, srcA, keepA: head, W, H, face, SC }) > .02, "cut beside the jaw");
  // background that was background in the original photo is not counted
  assert.equal(Q.revealed({ fg: cut, srcA: covered.map((v, i) => v * cut[i]), keepA: head, W, H, face, SC }), 0);
});
