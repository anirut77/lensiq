"use strict";
// tests/unit/single-subject.test.js — WP6: one subject only in faceread (quality gate + locked capture) and palm (nearest hand).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
global.PALM_KB = require(path.join(ROOT, "palm-kb.js"));
const FR = require(path.join(ROOT, "faceread.js"));
const PC = require(path.join(ROOT, "palm.js"));

const W = 640, H = 480;
const faceAt = (x, y, w, h) => { const box = { x, y, width: w, height: h }; return { box, score: 0.9, pts: FR.synthFace(box) }; };
const jitter = (d, k) => ({ box: { ...d.box, x: d.box.x + k }, score: d.score, pts: d.pts.map(p => [p[0] + k * 0.5, p[1] - k * 0.25]) });
const A = faceAt(150, 120, 180, 220), B = faceAt(420, 100, 150, 190);

test("synthFace is a frontal face that passes the pose checks", () => {
  const p = FR.headPose(A.pts);
  assert.ok(Math.abs(p.yaw) < 1e-9 && Math.abs(p.roll) < 1e-9);
});

test("FR.quality: n=2 -> single.ok false; n=1 -> true; n omitted -> no item (backward compatible)", () => {
  const two = FR.quality(A, W, H, null, 2), one = FR.quality(A, W, H, null, 1), none = FR.quality(A, W, H, null);
  const single = q => q.find(i => i.id === "single");
  assert.equal(single(two).ok, false);
  assert.equal(single(two).label, "มีใบหน้าเดียวในกรอบ");
  assert.equal(single(one).ok, true);
  assert.equal(single(none), undefined);
  assert.ok(one.every(i => i.ok), "one frontal face of good size passes everything");
  assert.ok(two.some(i => !i.ok));
});

test("pickFace: largest without history, IoU continuity with a previous box", () => {
  const small = faceAt(40, 40, 100, 120);
  assert.equal(FR.pickFace([small, A], null, W, H).index, 1);
  const p = FR.pickFace([A, small], null, W, H);
  // previous box on the small face keeps the small face even though A is larger
  const q = FR.pickFace([A, small], FR.pickFace([small], null, W, H).boxN, W, H);
  assert.equal(p.index, 0); assert.equal(q.index, 1); assert.equal(q.continuity, true); assert.equal(q.n, 2);
});

test("capture with alternating faces A and B averages only A", () => {
  const cap = FR.createCapture({ minIou: 0.3 });
  const seq = [];
  for (let i = 0; i < 12; i++) seq.push(i % 2 ? [B] : [A], i % 3 ? [B, A] : [A, B]);
  seq.forEach(list => cap.push(list, W, H));
  assert.ok(cap.frames.length >= 12, "A frames kept: " + cap.frames.length);
  assert.ok(cap.frames.every(f => f === A.pts), "every kept frame is A");
  const avg = cap.average();
  avg.forEach((p, i) => { assert.ok(Math.abs(p[0] - A.pts[i][0]) < 1e-6 && Math.abs(p[1] - A.pts[i][1]) < 1e-6, "pt " + i); });
});

test("capture locks to the first good face even when B is larger and comes later; jittered A is still A", () => {
  const big = faceAt(300, 60, 300, 360);
  const cap = FR.createCapture({ minIou: 0.3 });
  const As = [0, 2, -2, 3, -1].map(k => jitter(A, k));
  cap.push([As[0]], W, H);
  for (let i = 1; i < As.length; i++) { cap.push([big], W, H); cap.push([big, As[i]], W, H); }
  assert.equal(cap.frames.length, As.length);
  assert.ok(cap.skipped >= As.length - 1, "frames with only B are skipped");
  const avg = cap.average(), ref = FR.averageLandmarks(As.map(d => d.pts));
  avg.forEach((p, i) => assert.ok(Math.abs(p[0] - ref[i][0]) < 1e-6 && Math.abs(p[1] - ref[i][1]) < 1e-6));
});

test("capture: accept() rejects a bad first frame, so the lock starts on the first good one", () => {
  const cap = FR.createCapture({ accept: d => d !== B });
  cap.push([B], W, H); cap.push([A], W, H); cap.push([B], W, H);
  assert.equal(cap.frames.length, 1);
  assert.equal(cap.frames[0], A.pts);
});

test("palm: pickHand chooses the hand nearest the guide centre and reports n", () => {
  const near = { box: { x: 250, y: 200, w: 140, h: 160 } }, far = { box: { x: 10, y: 10, w: 200, h: 220 } };
  const r = PC.pickHand([far, near], null, W, H);
  assert.equal(r.index, 1); assert.equal(r.n, 2);
  assert.equal(PC.pickHand([], null, W, H).index, -1);
  // continuity: the previous hand stays primary
  const r2 = PC.pickHand([far, near], { x: 10 / W, y: 10 / H, w: 200 / W, h: 220 / H }, W, H);
  assert.equal(r2.index, 0);
});

test("palm: handBox and synthHand round-trip, handBox covers all 21 points", () => {
  const pts = PC.synthHand({ x: 200, y: 100, w: 200, h: 260 });
  assert.equal(pts.length, 21);
  const b = PC.handBox(pts);
  pts.forEach(p => assert.ok(p[0] >= b.x - 1e-9 && p[0] <= b.x + b.w + 1e-9 && p[1] >= b.y - 1e-9 && p[1] <= b.y + b.h + 1e-9));
});

test("palm: nms keeps up to 2 separate hands", () => {
  const d = [{ x: .1, y: .1, w: .2, h: .2, score: .9 }, { x: .11, y: .1, w: .2, h: .2, score: .8 }, { x: .6, y: .5, w: .2, h: .2, score: .7 }];
  const k = PC.nms(d, 0.3, 2);
  assert.equal(k.length, 2); assert.equal(k[1].score, .7);
});
