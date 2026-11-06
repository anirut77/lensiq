"use strict";
// lensiq-hand.js: nms (max 3), active-hand lock, gated motion fallback, parity of the pure pipeline with palm.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../../lensiq-hand.js");
const PC = require("../../palm.js");
const SG = require("../../signage.js");

const det = (x, y, w, h, score) => ({ x, y, w, h, score, kps: [] });

test("nms keeps at most 3 hands by default, highest score first, overlap suppressed", () => {
  const d = [det(0, 0, 0.1, 0.1, 0.6), det(0.2, 0, 0.1, 0.1, 0.9), det(0.4, 0, 0.1, 0.1, 0.7), det(0.6, 0, 0.1, 0.1, 0.8), det(0.21, 0.01, 0.1, 0.1, 0.85)];
  const k = H.nms(d);
  assert.equal(H.MAX_HANDS, 3);
  assert.equal(k.length, 3);
  assert.deepEqual(k.map(x => x.score), [0.9, 0.8, 0.7], "the 0.85 box overlaps the 0.9 one and is dropped");
  assert.equal(H.nms(d, 0.3, 1).length, 1);
  assert.equal(H.nms([], 0.3).length, 0);
  // same result as palm.js for its own max (2)
  assert.deepEqual(H.nms(d, 0.3, 2), PC.nms(d, 0.3, 2));
});

test("pure pipeline is identical to palm.js (anchors, decode, letterbox, rois, projection, boxes)", () => {
  const A = H.ssdAnchors(), B = PC.ssdAnchors();
  assert.equal(A.length, 2016 * 2);
  assert.deepEqual(Array.from(A), Array.from(B));
  const raw = new Float32Array(2016 * 19);
  raw[19 * 100] = 3; raw[19 * 100 + 3] = 40; raw[19 * 100 + 4] = 40; for (let k = 0; k < 14; k++) raw[19 * 100 + 5 + k] = (k % 2 ? 8 : -6) * (k + 1);
  raw[19 * 900] = -5;
  const dh = H.decodePalms(raw, A, 0.5), dp = PC.decodePalms(raw, B, 0.5);
  assert.equal(dh.length, 1);
  assert.deepEqual(dh, dp);
  const lb = H.letterbox(640, 480, 192);
  assert.deepEqual(lb, PC.letterbox(640, 480, 192));
  const u = H.unletterbox(dh[0], lb.pad);
  assert.deepEqual(u, PC.unletterbox(dp[0], lb.pad));
  const roi = H.palmRoi(u, 640, 480);
  assert.deepEqual(roi, PC.palmRoi(u, 640, 480));
  assert.deepEqual(H.roiCropMatrix(roi, 224), PC.roiCropMatrix(roi, 224));
  const lmRaw = Float32Array.from({ length: 63 }, (_, i) => (i * 37) % 224);
  const pts = H.projectLandmarks(lmRaw, roi);
  assert.deepEqual(pts, PC.projectLandmarks(lmRaw, roi));
  assert.deepEqual(H.landmarksRoi(pts), PC.landmarksRoi(pts));
  assert.deepEqual(H.handBox(pts), PC.handBox(pts));
  assert.deepEqual(H.synthHand({ x: 10, y: 20, w: 100, h: 200 }), PC.synthHand({ x: 10, y: 20, w: 100, h: 200 }));
});

test("synthetic hand -> normalised landmarks works with the signage gesture code (open palm, index tip cursor)", () => {
  const pts = H.synthHand({ x: 64, y: 96, w: 192, h: 240 });
  const lm = H.toLandmarks(pts, 640, 480);
  assert.equal(lm.length, 21);
  assert.ok(lm.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
  assert.equal(SG.isOpenPalm(lm), true);
  const c = SG.mapCursor(lm[8]);
  assert.ok(c.x > 0 && c.x < 1 && c.y >= 0 && c.y < 0.3, JSON.stringify(c));
});

test("dedupeHands drops a second hand that overlaps an earlier one", () => {
  const a = { box: { x: 0, y: 0, w: 10, h: 10 } }, b = { box: { x: 1, y: 1, w: 10, h: 10 } }, c = { box: { x: 50, y: 0, w: 10, h: 10 } };
  assert.deepEqual(H.dedupeHands([a, b, c]), [a, c]);
});

const bx = (x, y, w, h) => ({ x, y, w, h });
test("active lock: largest hand acquires; a bystander that grows later never steals the cursor", () => {
  const L = H.createActiveLock({ lostMs: 700 });
  let t = 0;
  let r = L.update([bx(0.6, 0.3, 0.1, 0.15), bx(0.1, 0.2, 0.25, 0.4)], t);
  assert.equal(r.index, 1); assert.equal(r.locked, true); assert.equal(r.n, 2);
  for (let i = 1; i <= 10; i++) {
    t += 66;
    // controller drifts right slowly; bystander grows larger than the controller and is listed first
    r = L.update([bx(0.55, 0.2, 0.35, 0.6), bx(0.1 + i * 0.01, 0.2, 0.25, 0.4)], t);
    assert.equal(r.index, 1, "frame " + i);
  }
  assert.ok(Math.abs(L.box.x - 0.2) < 1e-9);
});

test("active lock: controller missing -> held (index -1) for lostMs, bystander ignored, then released and re-acquired", () => {
  const L = H.createActiveLock({ lostMs: 700 });
  L.update([bx(0.1, 0.2, 0.25, 0.4)], 0);
  let r = L.update([bx(0.6, 0.2, 0.3, 0.5)], 300);
  assert.deepEqual([r.index, r.locked, r.held], [-1, true, true]);
  r = L.update([], 600);
  assert.equal(r.held, true);
  r = L.update([bx(0.6, 0.2, 0.3, 0.5)], 750); // > lostMs since last seen (0)
  assert.deepEqual([r.index, r.held], [0, false]);
  assert.ok(Math.abs(L.box.x - 0.6) < 1e-9);
  // controller comes back inside the window (centre distance only, no overlap needed after a small jump)
  r = L.update([bx(0.68, 0.25, 0.3, 0.5)], 800);
  assert.equal(r.index, 0);
  L.reset();
  assert.equal(L.locked, false);
  assert.deepEqual(L.update([], 900), { index: -1, locked: false, held: false, n: 0 });
});

function frames(w, h, rects) {
  const prev = new Uint8Array(w * h), cur = new Uint8Array(w * h);
  for (const [x0, y0, rw, rh] of rects) for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) cur[y * w + x] = 200;
  return [prev, cur];
}
test("motionBlobs: 4-connected components, largest first, with centroid and bbox", () => {
  const [p, c] = frames(80, 60, [[10, 10, 6, 6], [50, 30, 3, 3]]);
  const m = H.motionBlobs(p, c, 80, 60);
  assert.equal(m.n, 45); assert.equal(m.blobs.length, 2);
  assert.equal(m.blobs[0].n, 36);
  assert.ok(Math.abs(m.blobs[0].x - 13 / 80) < 1e-9 && Math.abs(m.blobs[0].y - 13 / 60) < 1e-9);
  assert.ok(Math.abs(m.blobs[0].bw - 6 / 80) < 1e-9);
  assert.equal(H.motionBlobs(p, p, 80, 60).blobs.length, 0);
});

test("motionGate: hand-sized dominant blob passes; body-sized, crowd and noise are rejected", () => {
  const gate = rects => H.motionGate(H.motionBlobs(...frames(80, 60, rects), 80, 60));
  assert.ok(gate([[20, 20, 8, 8]]), "hand-sized blob (1.3% of frame)");
  assert.equal(gate([[20, 20, 2, 2]]), null, "noise");
  assert.equal(gate([[10, 5, 30, 40]]), null, "a whole body (25%)");
  assert.equal(gate([[5, 20, 8, 8], [50, 20, 8, 8]]), null, "two similar movers: nobody gets the cursor");
  assert.ok(gate([[5, 20, 10, 10], [60, 40, 2, 2]]), "one dominant mover + small noise");
  assert.equal(gate([[0, 0, 80, 30]]), null, "half the frame moved");
  assert.equal(H.motionGate(null), null);
});
