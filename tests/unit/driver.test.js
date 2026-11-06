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

// ---- round 5: eye-patch classifier (EYE_MODEL, trained on Open/Closed Eyes ODC-BY only) ----
const eyeImg = closed => { // synthetic 32×16 grey eye: skin 170, dark open iris disc or a thin dark lid line
  const g = new Uint8Array(512).fill(170);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    if (closed ? Math.abs(y - 9) <= 0 && x > 6 && x < 26 : (x - 16) ** 2 + (y - 8) ** 2 < 25) g[y * 32 + x] = 40;
  }
  return g;
};

test("EYE_MODEL: 128 weights + bias + EAR term; eyeVec is normalised and mirrors", () => {
  assert.equal(D.EYE_MODEL.w.length, 128);
  assert.ok(D.EYE_MODEL.w.every(Number.isFinite) && Number.isFinite(D.EYE_MODEL.b) && Number.isFinite(D.EYE_MODEL.e));
  const g = new Uint8Array(512); for (let i = 0; i < 512; i++) g[i] = (i % 32) * 8; // left→right ramp
  const v = D.eyeVec(g), m = D.eyeVec(g, true);
  assert.ok(Math.abs(v.reduce((a, b) => a + b, 0)) < 1e-9);
  assert.ok(v[0] < v[15] && m[0] > m[15]);
  for (let k = 0; k < 16; k++) assert.ok(Math.abs(v[k] - m[15 - k]) < 1e-12);
});

test("eyePatchRect: 1.8 × eye width, 2:1, centred on the 6 eye landmarks (same as the bench crop)", () => {
  const p = [{ x: 100, y: 50 }, { x: 110, y: 46 }, { x: 120, y: 46 }, { x: 130, y: 50 }, { x: 120, y: 54 }, { x: 110, y: 54 }];
  const r = D.eyePatchRect(p);
  assert.ok(Math.abs(r.w - 54) < 1e-9 && Math.abs(r.h - 27) < 1e-9);
  assert.ok(Math.abs(r.x + r.w / 2 - 115) < 1e-9 && Math.abs(r.y + r.h / 2 - 50) < 1e-9);
});

test("eyeClosedScore: NaN without patches; scores a closed synthetic eye above an open one", () => {
  assert.ok(Number.isNaN(D.eyeClosedScore(null, null, 0.3)));
  const open = D.eyeClosedScore(eyeImg(false), eyeImg(false), 0.3), shut = D.eyeClosedScore(eyeImg(true), eyeImg(true), 0.3);
  assert.ok(Number.isFinite(open) && Number.isFinite(shut));
  assert.ok(shut > open, `closed ${shut} should score above open ${open}`);
});

test("calibrate: eye baseline from the driver's own frames; guard when calibration frames already look closed", () => {
  const frames = base => Array.from({ length: 12 }, (_, i) => ({ face: true, ear: 0.3, yaw: 0, pitch: 1, mar: 0.1, eyeScore: base + (i % 3 - 1) * 0.1 }));
  const c = D.calibrate(frames(-2));
  assert.equal(c.eyeBase, -2); assert.equal(c.eyeThr, -2 + D.DR_DEFAULTS.eyeDelta);
  assert.equal(D.calibrate(frames(2.5)).eyeThr, null); // > eyeMaxBase -> EAR only
  assert.equal(D.calibrate(frames(-2).map(f => ({ ...f, eyeScore: NaN }))).eyeThr, null); // no crops (test mode) -> EAR only
  assert.equal(D.calibrate([]).eyeThr, null);
});

test("createMonitor: classifier decides when calibrated, EAR is the fallback for frames without a crop", () => {
  const mon = D.createMonitor({ thr: 0.25, eyeThr: 1 });
  const f = (t, ear, eyeScore) => mon.update({ t, face: true, ear, mar: 0.1, yaw: 0, pitch: 1, eyeScore });
  let r = f(0, 0.3, 2); assert.equal(r.metrics.closed, true); assert.equal(r.metrics.eyeMode, true); // EAR open, eyes closed
  r = f(100, 0.2, 0); assert.equal(r.metrics.closed, false); // EAR low, classifier open -> open
  r = f(200, 0.2, NaN); assert.equal(r.metrics.closed, true); assert.equal(r.metrics.eyeMode, false); // no crop -> EAR
  const old = D.createMonitor({ thr: 0.25 }); // no eye baseline -> EAR only (as before round 5)
  assert.equal(old.update({ t: 0, face: true, ear: 0.3, mar: 0.1, yaw: 0, pitch: 1, eyeScore: 5 }).metrics.closed, false);
});

test("createMonitor: a sustained classifier closure still needs the page's duration rule (long_closure after 1.5 s)", () => {
  const mon = D.createMonitor({ thr: 0.25, eyeThr: 1 });
  const ev = [];
  for (let t = 0; t <= 2000; t += 100) ev.push(...mon.update({ t, face: true, ear: 0.3, mar: 0.1, yaw: 0, pitch: 1, eyeScore: 3 }).events);
  assert.ok(ev.some(e => e.type === "long_closure"));
  assert.ok(!ev.some(e => e.type === "long_closure" && e.t !== 0));
});

test("adaptiveEyeBase: low percentile of recent scores, null below the sample minimum", () => {
  assert.equal(D.adaptiveEyeBase([1, 2, 3], 0.2, 15), null);
  const s = Array.from({ length: 20 }, (_, i) => i); // 0..19
  assert.equal(D.adaptiveEyeBase(s, 0.2, 15), 3);
  assert.equal(D.adaptiveEyeBase([...s, NaN, NaN], 0.5, 15), 9, "NaN (no crop) ignored");
});

/* round 6: open eyes whose score drifts above the calibration threshold (light or pose changed after calibration) */
const run = (mon, from, to, score, step = 100) => { const out = { ev: [], closed: 0, n: 0, last: null };
  for (let t = from; t < to; t += step) { const r = mon.update({ t, face: true, ear: 0.3, mar: 0.1, yaw: 0, pitch: 1, eyeScore: score(t) }); out.ev.push(...r.events); out.n++; if (r.metrics.closed) out.closed++; out.last = r.metrics; }
  return out; };
const jit = t => ((t * 7919) % 1000) / 1000 - 0.5; // deterministic ±0.5 noise

test("createMonitor adaptive baseline: open eyes after a +4 session shift stop being called closed; fixed baseline keeps alarming", () => {
  const cal = { thr: 0.25, eyeThr: -3 + D.DR_DEFAULTS.eyeDelta }; // calibrated at -3 -> threshold 0
  const score = t => (t < 60000 ? -3 : 1) + jit(t);              // after 60 s the open-eye level moves to +1 (> threshold)
  const fixed = run(D.createMonitor(cal, { eyeAdaptive: false }), 0, 180000, score);
  const adapt = run(D.createMonitor(cal), 0, 180000, score);
  assert.ok(fixed.ev.some(e => e.type === "long_closure" || e.type === "perclos"), "round-5 rule raises false alarms");
  assert.ok(adapt.closed / adapt.n < 0.1, `adaptive: ${adapt.closed}/${adapt.n} frames closed`);
  assert.ok(adapt.last.eyeThrNow > 1 && adapt.last.eyeThrNow <= 0 + D.DR_DEFAULTS.eyeAdaptMaxRise);
  assert.ok(adapt.ev.filter(e => e.type === "long_closure").length <= 1, "at most one alert while the window catches up");
  assert.equal(adapt.ev.filter(e => e.type === "long_closure" && e.t > 75000).length, 0);
});

test("createMonitor adaptive baseline: real closures are still caught (threshold only rises, low percentile resists closures)", () => {
  const cal = { thr: 0.25, eyeThr: 0 };
  // open at -3, then a 2-s closure (+6) every 12 s for 3 minutes (PERCLOS ≈ 17%)
  const score = t => (t > 30000 && (t - 30000) % 12000 < 2000 ? 6 : -3) + jit(t);
  const r = run(D.createMonitor(cal), 0, 210000, score);
  const lc = r.ev.filter(e => e.type === "long_closure");
  assert.equal(lc.length, 15, "every 2-s closure raises long_closure");
  assert.ok(r.ev.some(e => e.type === "perclos"));
  assert.ok(Math.abs(r.last.eyeThrNow - 0) < 1e-9, "baseline stayed at the calibration level");
});

test("createMonitor adaptive baseline: never lowers the threshold, never absorbs a closure from the start of the trip", () => {
  const low = run(D.createMonitor({ thr: 0.25, eyeThr: 0 }), 0, 30000, t => -8 + jit(t));
  assert.equal(low.last.eyeThrNow, 0);
  const start = run(D.createMonitor({ thr: 0.25, eyeThr: 0 }), 0, 4000, () => 4);
  assert.ok(start.ev.some(e => e.type === "long_closure" && e.level === 3), "4 s closed from t=0 reaches danger level");
  assert.equal(start.closed, start.n);
});
