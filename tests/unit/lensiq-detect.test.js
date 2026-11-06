"use strict";
// node --test tests/unit — LQDetect pure decoder parity with store.decodePersons.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../../lensiq-detect.js");
const store = require("../../store.js");

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

test("(12) decodeCoco classes [0] equals store.decodePersons on random tensors", () => {
  for (let k = 0; k < 200; k++) {
    const r = rng(500 + k), N = 1 + Math.floor(r() * 60), C = 90;
    const boxes = new Float32Array(N * 4), scores = new Float32Array(N * C);
    for (let i = 0; i < N; i++) {
      const y = r() * 1.1 - 0.05, x = r() * 1.1 - 0.05;
      boxes.set([y, x, y + r() * 0.5 - 0.05, x + r() * 0.4 - 0.05], i * 4);
      for (let c = 0; c < C; c++) scores[i * C + c] = r() * (c === 0 ? 1 : 0.6);
    }
    const opts = [[0.4, 0.5, 20], [0.2, 0.3, 5], [0.6, 0.7, 50]][k % 3];
    const want = store.decodePersons(boxes, scores, N, C, ...opts);
    const got = D.decodeCoco(boxes, scores, N, C, { classes: [0], minScore: opts[0], iou: opts[1], max: opts[2] });
    assert.deepEqual(got.map(({ cls, ...b }) => { assert.equal(cls, 0); return b; }), want);
    assert.deepEqual(D.decodeCoco(boxes, scores, N, C), store.decodePersons(boxes, scores, N, C).map(b => ({ ...b, cls: 0 })));
  }
});

test("decodeCoco multi-class picks the best listed class; nms parity", () => {
  const boxes = [0.1, 0.1, 0.5, 0.3, 0.6, 0.6, 0.9, 0.9], C = 3;
  const scores = [0.1, 0.8, 0.5, 0.9, 0.1, 0.2];
  const got = D.decodeCoco(boxes, scores, 2, C, { classes: [1, 2] });
  assert.deepEqual(got.map(d => d.cls), [1]);
  assert.equal(D.decodeCoco(boxes, scores, 2, C, { classes: [0, 2] }).length, 2);
  const r = rng(1), cand = Array.from({ length: 40 }, () => ({ x: r() * 0.5, y: r() * 0.5, w: 0.2, h: 0.2, score: r() }));
  assert.deepEqual(D.nms(cand, 0.4, 10), store.nms(cand, 0.4, 10));
});

test("Node: isTest/fake are inert without a browser", () => {
  assert.equal(D.isTest(), false);
  assert.equal(D.fake("c1", 0), null);
});

test("tileRects covers the frame with the requested overlap; mergeTiles drops duplicates and tile-cut halves", () => {
  const D = require("../../lensiq-detect.js");
  const r = D.tileRects(2, 2, 0.2);
  assert.equal(r.length, 4);
  for (const t of r) { assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.w <= 1 + 1e-9 && t.y + t.h <= 1 + 1e-9); }
  assert.ok(Math.abs(r[0].w - 1 / 1.8) < 1e-9 && Math.abs(r[1].x + r[1].w - 1) < 1e-9, "edge tiles touch the borders");
  assert.ok(r[0].x + r[0].w > r[1].x, "neighbouring tiles overlap");
  assert.deepEqual(D.tileRects(1, 1), [{ x: 0, y: 0, w: 1, h: 1 }]);
  const full = { x: 0.40, y: 0.30, w: 0.10, h: 0.30, score: 0.9 };
  const same = { x: 0.405, y: 0.30, w: 0.10, h: 0.30, score: 0.8 };   // IoU > 0.5
  const half = { x: 0.40, y: 0.30, w: 0.05, h: 0.30, score: 0.85 };   // cut by a tile edge, fully inside `full`
  const other = { x: 0.70, y: 0.30, w: 0.10, h: 0.30, score: 0.5 };
  const m = D.mergeTiles([same, half, full, other]);
  assert.deepEqual(m.map(d => d.score), [0.9, 0.5]);
  assert.equal(D.mergeTiles([full, other], { max: 1 }).length, 1);
});
