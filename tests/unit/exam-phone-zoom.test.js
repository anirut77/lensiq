"use strict";
// tests/unit/exam-phone-zoom.test.js — Exam lab phone zoom pass (owner decision 217 ก, 2026-11-21; docs/exam/EXAMLAB-PHONE-SET.md
// "Tuning"). Pure parts: the crop rects, the shipped settings' bounds, and that the page's live loop and the measuring
// harnesses use the same object pass.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const E = require("../../lensiq-exam.js");
const D = require("../../lensiq-detect.js");

const near = (/** @type {any[]} */ a, /** @type {any[]} */ b) => {
  assert.equal(a.length, b.length);
  a.forEach((r, i) => { for (const k of ["x", "y", "w", "h"]) assert.ok(Math.abs(r[k] - b[i][k]) < 1e-9, `${i}.${k}`); });
};

test("full-height grids equal LQDetect.tileRects", () => {
  near(E.phoneZoomRects({ cols: 2, rows: 2, overlap: 0.2 }), D.tileRects(2, 2, 0.2));
  near(E.phoneZoomRects({ cols: 3, rows: 3, overlap: 0.25 }), D.tileRects(3, 3, 0.25));
});

test("a band config stays inside y0..y1 and covers it", () => {
  const r = E.phoneZoomRects({ cols: 3, rows: 1, overlap: 0.2, y0: 0.35, y1: 1 });
  assert.equal(r.length, 3);
  for (const q of r) { assert.ok(q.y >= 0.35 - 1e-9 && q.y + q.h <= 1 + 1e-9); assert.ok(q.x >= 0 && q.x + q.w <= 1 + 1e-9); }
  assert.ok(Math.abs(r[0].x) < 1e-9 && Math.abs(r[2].x + r[2].w - 1) < 1e-9);
});

test("shipped zoom settings: crop cut never below the lab phone threshold, at most 9 crops", () => {
  const z = E.LAB_PHONE_ZOOM;
  assert.ok(Object.isFrozen(z));
  assert.equal(typeof z.on, "boolean");
  assert.ok(z.minScore >= E.DEFAULTS.phoneConf && z.minScore <= 1);
  assert.ok(E.phoneZoomRects(z).length >= 1 && E.phoneZoomRects(z).length <= 9);
});

test("the live loop and the harnesses share one object pass", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "exam-lab.js"), "utf8");
  assert.match(src, /async function objectPass\(coco, video, zoom\)/);
  assert.match(src, /const r = await objectPass\(coco, video\);/);
  assert.match(src, /LQDetect\.detectCocoRects\(coco, video, E\.phoneZoomRects\(z\)/);
  assert.match(src, /objectPass \/\/ measuring harnesses/);
  assert.equal((src.match(/detectCocoMulti\(/g) || []).length, 1, "one COCO call site in exam-lab.js");
});
