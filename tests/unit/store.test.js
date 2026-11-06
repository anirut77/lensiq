"use strict";
// node --test tests/unit — store.js multi-camera: migration, per-camera pipes on a shared day, CSV byCam rows.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../store.js");
const T = require("../../lensiq-track.js");

function memStore(init) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return { m, get: k => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)), keys: () => [...m.keys()], obj: () => Object.fromEntries(m) };
}
const legacy = () => ({
  "st-settings": { line: { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } }, swap: true, zones: [{ id: "z1", name: "ชั้นวาง", queue: false, cashier: true, x: 0, y: 0, w: 0.3, h: 0.3 }, { id: "z2", name: "คิว", queue: true, cashier: false, x: 0.5, y: 0.5, w: 0.2, h: 0.2 }], maxOcc: 12, serviceSec: 60, queueAlert: 5, detW: 512, heatOn: true },
  "st-heat": [0, 1, 2],
  "st-day-2026-11-01": { date: "2026-11-01", in: 10, out: 8, occ: 2, peak: 5, peakAt: 1, maxQueue: 2, hourly: { in: Array(24).fill(0), out: Array(24).fill(0) }, zones: { z1: { name: "ชั้นวาง", visits: 4, dwellSum: 1000, dwellN: 2, peak: 1 } } },
  "other-key": "x"
});

test("existing exports still load", () => {
  for (const k of ["ST_CFG", "dayKey", "iou", "center", "foot", "normRect", "pointInRect", "newTracker", "updateTracker", "lineSide", "segmentsIntersect", "checkCrossing", "newDay", "applyCrossing", "zoneStep", "closeZones", "avgDwellSec", "queueInfo", "conversion", "newHeat", "heatAdd", "heatMax", "heatColor", "heatToRGBA", "buildCsv", "decodePersons", "nms"])
    assert.ok(S[k] !== undefined, k);
  assert.equal(S.iou, T.iou); // identical maths re-exported from LQTrack
  const d = S.newDay("2026-11-06");
  assert.deepEqual(d.byCam, {}); assert.equal(d.zv, 2);
});

test("migrateStore is idempotent and keeps the old fields", () => {
  const st = memStore(legacy());
  const first = S.migrateStore(st.get, st.set, st.keys());
  assert.ok(first.includes("st-cams") && first.includes("st-cam-c1") && first.includes("st-heat-c1") && first.includes("st-day-2026-11-01"));
  const snap1 = st.obj();
  const second = S.migrateStore(st.get, st.set, st.keys());
  assert.deepEqual(second, []);
  assert.deepEqual(st.obj(), snap1);
  const J = k => JSON.parse(st.get(k));
  assert.equal(J("st-cams").cams[0].slot, "c1");
  assert.deepEqual(J("st-cam-c1").line, legacy()["st-settings"].line);
  assert.equal(J("st-cam-c1").swap, true);
  assert.equal(J("st-cam-c1").detW, 512);
  assert.deepEqual(J("st-cam-c1").zones.map(z => z.id), ["z1", "z2"]);
  const set = J("st-settings");
  assert.equal(set.cashierZone, "c1:z1"); assert.equal(set.queueZone, "c1:z2"); assert.equal(set.sv, 2);
  assert.ok(set.line && set.zones.length === 2 && set.maxOcc === 12, "old settings fields still present");
  assert.equal(st.get("st-heat"), st.get("st-heat-c1"), "old heat key kept");
  const d = J("st-day-2026-11-01");
  assert.deepEqual(Object.keys(d.zones), ["c1:z1"]); assert.equal(d.zv, 2); assert.equal(d.in, 10);
  assert.deepEqual(d.byCam, { c1: { name: "กล้อง 1", in: 10, out: 8 } });
  assert.equal(st.get("other-key"), "x");
  // a new (v2) day with a ':' key is never re-prefixed
  st.set("st-day-2026-11-02", JSON.stringify({ ...S.newDay("2026-11-02"), zones: { "c2:z1": { name: "a", visits: 1, dwellSum: 0, dwellN: 0, peak: 1 } } }));
  S.migrateStore(st.get, st.set, st.keys());
  assert.deepEqual(Object.keys(J("st-day-2026-11-02").zones), ["c2:z1"]);
});

test("migrateStore on a fresh browser only creates st-cams", () => {
  const st = memStore({});
  assert.deepEqual(S.migrateStore(st.get, st.set, st.keys()), ["st-cams"]);
  assert.deepEqual(S.migrateStore(st.get, st.set, st.keys()), []);
});

// scripted walk: x from x0 to x1 over n frames, one person
const walk = (x0, x1, n) => Array.from({ length: n }, (_, i) => [{ x: x0 + (x1 - x0) * i / (n - 1) - 0.05, y: 0.3, w: 0.1, h: 0.4, score: 0.9 }]);
const LINE = { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } };

test("two pipes merge into one day: day.in = sum of cameras, namespaced zones do not collide", () => {
  const day = S.newDay("2026-11-06"), p1 = S.newPipe(), p2 = S.newPipe();
  const z = [{ id: "z1", name: "โซน", x: 0, y: 0, w: 0.4, h: 1 }];
  const c1 = { slot: "c1", name: "หน้า", role: "both", line: LINE, swap: false, zones: z };
  const c2 = { slot: "c2", name: "หลัง", role: "both", line: LINE, swap: false, zones: z };
  const tc = T.trackerCfgFor(T.PRESET.person, 100);
  let now = new Date(2026, 10, 6, 10).getTime();
  const f1 = walk(0.8, 0.2, 12), f2 = walk(0.8, 0.2, 12);
  for (let i = 0; i < 12; i++) { now += 100; S.stepCam(p1, c1, day, f1[i], now, tc); S.stepCam(p2, c2, day, f2[i], now + 50, tc); }
  for (let i = 0; i < 15; i++) { now += 100; S.stepCam(p1, c1, day, f1[11], now, tc); S.stepCam(p2, c2, day, f2[11], now + 50, tc); }
  assert.equal(day.in, 2);
  assert.equal(day.in, day.byCam.c1.in + day.byCam.c2.in);
  assert.deepEqual(day.byCam.c1, { name: "หน้า", in: 1, out: 0 });
  assert.ok(day.zones["c1:z1"] && day.zones["c2:z1"]);
  assert.equal(day.zones["c1:z1"].visits, 1); assert.equal(day.zones["c2:z1"].visits, 1);
  assert.equal(day.zones.z1, undefined);
  assert.equal(p1.zoneCounts["c1:z1"], 1); assert.equal(p2.zoneCounts["c2:z1"], 1);
});

test("role 'zone' never changes in/out; role 'door' records no zones", () => {
  const day = S.newDay("2026-11-06"), pz = S.newPipe(), pd = S.newPipe();
  const z = [{ id: "z1", name: "โซน", x: 0, y: 0, w: 0.4, h: 1 }];
  let now = 1e12;
  const f = walk(0.8, 0.2, 12);
  for (let i = 0; i < 25; i++) {
    now += 100;
    S.stepCam(pz, { slot: "c3", name: "z", role: "zone", line: LINE, zones: z }, day, f[Math.min(i, 11)], now);
    S.stepCam(pd, { slot: "c4", name: "d", role: "door", line: null, zones: z }, day, f[Math.min(i, 11)], now);
  }
  assert.equal(day.in, 0); assert.equal(day.out, 0);
  assert.ok(day.zones["c3:z1"].visits === 1);
  assert.equal(day.zones["c4:z1"], undefined);
});

test("buildCsv includes the byCam rows and camera-prefixed zone names", () => {
  const d = S.newDay("2026-11-06");
  d.in = 3; d.out = 1;
  d.byCam = { c1: { name: "ประตูหน้า", in: 2, out: 1 }, c2: { name: "ประตูหลัง", in: 1, out: 0 } };
  d.zones = { "c2:z1": { name: "แคชเชียร์", visits: 2, dwellSum: 4000, dwellN: 2, peak: 1 } };
  const csv = S.buildCsv([d], "c2:z1");
  assert.match(csv, /รายกล้อง/);
  assert.match(csv, /2026-11-06,ประตูหน้า,2,1/);
  assert.match(csv, /2026-11-06,ประตูหลัง,1,0/);
  assert.match(csv, /ประตูหลัง · แคชเชียร์,2,2\.0,1/);
  assert.match(csv, /2026-11-06,3,1,0,,0,66\.7/); // conversion uses the namespaced cashier id
});
