"use strict";
// node --test tests/unit — driver.js pure parts: driver selection among several faces (WP5).
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../../driver.js");

// Normalised, unmirrored boxes. Camera faces the occupants: the right-seat driver appears on the IMAGE LEFT.
const driver = { x: 0.10, y: 0.25, w: 0.22, h: 0.40, score: 0.80 };
const passenger = { x: 0.62, y: 0.22, w: 0.24, h: 0.44, score: 0.99 }; // larger + higher detector score

test("pickDriver: seatSide 'right' picks the image-left driver over a higher-score passenger", () => {
  const r = D.pickDriver([passenger, driver], null, "right");
  assert.equal(r.index, 1); assert.equal(r.continuity, false); assert.equal(r.n, 2);
  // 'left' seat -> the image-right face; 'auto' -> largest
  assert.equal(D.pickDriver([passenger, driver], null, "left").index, 0);
  assert.equal(D.pickDriver([passenger, driver], null, "auto").index, 0);
});

test("pickDriver: once locked, a missing driver is -1 (face_missing), never the passenger", () => {
  const locked = D.pickDriver([passenger, driver], null, "right");
  const prev = [passenger, driver][locked.index];
  const moved = { ...driver, x: driver.x + 0.02, y: driver.y + 0.01 };
  const r1 = D.pickDriver([passenger, moved], prev, "right");
  assert.equal(r1.index, 1); assert.equal(r1.continuity, true);
  const r2 = D.pickDriver([passenger], moved, "right");
  assert.equal(r2.index, -1); assert.equal(r2.n, 1);
  assert.equal(D.pickDriver([], moved, "right").index, -1);
});

test("pickDriver: re-acquires at the calibrated anchor, not anywhere else", () => {
  const anchor = driver;
  const lastSeen = { ...driver, x: 0.35 }; // drifted away from the anchor before being lost
  const back = { ...driver, x: 0.11 };
  assert.equal(D.pickDriver([passenger, back], lastSeen, "right", anchor).index, 1);
  assert.equal(D.pickDriver([passenger], lastSeen, "right", anchor).index, -1);
});

test("synthFace: landmarks reproduce the requested EAR/MAR and face 0 yaw", () => {
  const f = D.synthFace({ ...driver, ear: 0.3, mar: 0.12 }, 640, 480);
  const m = D.faceMetrics(f.pts);
  assert.ok(Math.abs(m.ear - 0.3) < 1e-9, "ear " + m.ear);
  assert.ok(Math.abs(m.mar - 0.12) < 1e-9, "mar " + m.mar);
  assert.ok(Math.abs(m.yaw) < 1e-9);
  assert.equal(f.box.width, driver.w * 640);
});

test("summarizeTrip carries occupantsMax as a plain aggregate", () => {
  const s = D.summarizeTrip({ id: "T1", driver: "a", plate: "b", start: 0, occupantsMax: 3 }, [], 60000);
  assert.equal(s.occupantsMax, 3);
  assert.equal(D.summarizeTrip({ id: "T2", start: 0 }, [], 1000).occupantsMax, 0);
});
