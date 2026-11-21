"use strict";
// tests/unit/exam-phone-zoom-switch.test.js — owner decision 221, default ข (2026-11-21): the Exam lab phone zoom pass
// (decision 217, docs/exam/EXAMLAB-PHONE-SET.md) sits behind LENSIQ_EXAM_PHONE_ZOOM, OFF unless exactly true (default, and
// customer builds ship the default). OFF = objectPass is the full-frame call only, exactly as before 217. ON = the measured
// g3x3 path (LQExam.LAB_PHONE_ZOOM), plus a time guard (reviewer suggestion; NOT present when the A2 result was measured):
// after a crop pass slower than 300 ms the crops are skipped until 5 s have passed, then tried again.
// Locked BEFORE the product change (evals-locks/exam-a2-switch.sha256).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const E = require("../../lensiq-exam.js");

const R = path.join(__dirname, "..", "..");
const read = (/** @type {string} */ p) => fs.readFileSync(path.join(R, p), "utf8");

/** run lensiq-config.js in a bare sandbox with a preset window value @param {any} preset */
function config(preset) {
  /** @type {any} */ const win = {};
  if (preset !== undefined) win.LENSIQ_EXAM_PHONE_ZOOM = preset;
  const store = { getItem: () => null, setItem() {}, removeItem() {} };
  vm.runInNewContext(read("lensiq-config.js"), { window: win, localStorage: store });
  return win.LENSIQ_EXAM_PHONE_ZOOM;
}

test("lensiq-config.js: LENSIQ_EXAM_PHONE_ZOOM is off unless exactly true", () => {
  assert.equal(config(undefined), false, "default off");
  assert.equal(config(false), false);
  assert.equal(config("true"), false, "a string is not true");
  assert.equal(config(1), false);
  assert.equal(config(true), true, "operator preset true turns it on");
  assert.match(read("lensiq-config.js"), /window\.LENSIQ_EXAM_PHONE_ZOOM = window\.LENSIQ_EXAM_PHONE_ZOOM === true;/);
  assert.match(read("types/lensiq-globals.d.ts"), /LENSIQ_EXAM_PHONE_ZOOM\?: boolean;/);
});

test("phoneZoomFor: switch off -> no zoom (full frame only); on -> the measured g3x3 settings; an explicit harness setting wins", () => {
  assert.equal(E.phoneZoomFor({}), null);
  assert.equal(E.phoneZoomFor({ LENSIQ_EXAM_PHONE_ZOOM: false }), null);
  assert.equal(E.phoneZoomFor({ LENSIQ_EXAM_PHONE_ZOOM: "true" }), null);
  assert.equal(E.phoneZoomFor(null), null);
  assert.equal(E.phoneZoomFor({ LENSIQ_EXAM_PHONE_ZOOM: true }), E.LAB_PHONE_ZOOM);
  assert.deepEqual({ ...E.LAB_PHONE_ZOOM }, { on: true, cols: 3, rows: 3, overlap: 0.25, y0: 0, y1: 1, minScore: 0.6 }, "the settings measured on the locked A2 set");
  const off = { on: false };
  assert.equal(E.phoneZoomFor({}, off), off);
  assert.equal(E.phoneZoomFor({ LENSIQ_EXAM_PHONE_ZOOM: true }, off), off);
});

test("time guard: a crop pass over 300 ms pauses the crops for 5 s, then they are tried again", () => {
  const g = E.createZoomGuard();
  assert.equal(g.maxMs, 300); assert.equal(g.backoffMs, 5000);
  assert.equal(g.allow(0), true, "first pass allowed");
  g.record(1000, 250);
  assert.equal(g.allow(1001), true, "fast pass: next one allowed");
  g.record(2000, 450);
  assert.equal(g.allow(2001), false, "slow pass: skipped");
  assert.equal(g.allow(6999), false);
  assert.equal(g.allow(7000), true, "tried again after 5 s");
  g.record(7000, 100);
  assert.equal(g.allow(7001), true);
  const h = E.createZoomGuard({ maxMs: 100, backoffMs: 50 });
  h.record(0, 101); assert.equal(h.allow(49), false); assert.equal(h.allow(50), true);
});

test("exam-lab.js objectPass: switch read through phoneZoomFor; off = the one full-frame call; guard only on the live path", () => {
  const src = read("exam-lab.js");
  const body = src.slice(src.indexOf("async function objectPass("), src.indexOf("async function observe()"));
  assert.match(body, /const z = E\.phoneZoomFor\(W, zoom\);/);
  assert.match(body, /if \(z && z\.on && !d\.some\(o => o\.cls === 76 && o\.score >= E\.DEFAULTS\.phoneConf\) && \(zoom \|\| zoomGuard\.allow\(t0\)\)\)/);
  assert.match(body, /if \(!zoom\) zoomGuard\.record\(t0, performance\.now\(\) - t0\);/);
  assert.equal((body.match(/detectCocoMulti\(/g) || []).length, 1);
  assert.equal((body.match(/detectCocoRects\(/g) || []).length, 1, "crops only inside the switched branch");
  assert.match(src, /const zoomGuard = E\.createZoomGuard\(\);/);
});
