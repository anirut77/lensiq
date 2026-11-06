"use strict";
// booth.js multi-camera: per-camera trackers over ONE shared gallery -> cross-camera dedupe, roles, per-camera stats,
// engagement funnel, aggregate-only stats CSV (no visitor ids), privacy of the persisted shape.
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../../booth.js");

const unit = k => Array.from({ length: 128 }, (_, i) => (i === k ? 1 : 0));
const near = (k, j, t) => unit(k).map((x, i) => x * (1 - t) + (i === j ? t : 0));
const face = (desc, box, extra = {}) => ({ desc, e: [0, 1, 0, 0, 0, 0, 0], v: 0.8, att: 1, area: box.w * box.h, box, ...extra });
const box = (x, y = 0.3, w = 0.15, h = 0.2) => ({ x, y, w, h });
const T0 = new Date(2026, 10, 6, 14, 0, 0).getTime();
const fresh = () => { const S = B.newState("t", B.dayKey(T0)); S.descDay = B.dayKey(T0); return S; };
// one tick per camera, interleaved like the scheduler does
function run(S, steps, perCam) {
  let now = T0;
  for (let k = 0; k < steps; k++) for (const [cam, primary, faces] of perCam) {
    now += 125;
    B.observe(S, faces(k), now, B.runtime(S, cam), { cam, primary, timeline: false });
  }
  return now;
}

test("same person on two cameras at the same time is ONE visitor (shared candidate, then shared V###)", () => {
  const S = fresh();
  run(S, 12, [["c1", true, () => [face(unit(0), box(0.2))]], ["c2", false, () => [face(near(0, 5, 0.2), box(0.6, 0.4))]]]);
  assert.equal(S.visitors.length, 1);
  const v = S.visitors[0];
  assert.deepEqual(Object.keys(v.cams).sort(), ["c1", "c2"]);
  assert.ok(v.cams.c1.d > 0.5 && v.cams.c2.d > 0.5, JSON.stringify(v.cams));
  assert.ok(v.dwell > 2 && v.dwell < 3.2, "dwell counts wall time once, not per camera: " + v.dwell);
});

test("a visitor promoted on the primary camera is recognised later on an aux camera (match by descriptor, existing threshold)", () => {
  const S = fresh();
  let now = run(S, 12, [["c1", true, () => [face(unit(0), box(0.2))]]]);
  assert.equal(S.visitors.length, 1);
  now += 4000; // walks to the demo table
  for (let k = 0; k < 6; k++) { now += 250; B.observe(S, [face(near(0, 9, 0.25), box(0.5))], now, B.runtime(S, "c2"), { cam: "c2", primary: false, timeline: false }); }
  assert.equal(S.visitors.length, 1);
  assert.ok(S.visitors[0].cams.c2);
  // a different person (distance > MATCH) on the aux camera becomes a new visitor
  for (let k = 0; k < 6; k++) { now += 250; B.observe(S, [face(unit(3), box(0.1))], now, B.runtime(S, "c2"), { cam: "c2", primary: false, timeline: false }); }
  assert.equal(S.visitors.length, 2);
  assert.ok(B.dist(unit(0), unit(3)) > B.CFG.MATCH);
});

test("aux camera counts identity and time but not attention/expression; primary does", () => {
  const S = fresh();
  run(S, 10, [["c2", false, () => [face(unit(1), box(0.3))]]]);
  const v = S.visitors[0];
  assert.equal(v.frames, 0); assert.equal(v.att, 0); assert.equal(v.vSum, 0);
  assert.ok(v.dwell > 0);
  const S2 = fresh();
  run(S2, 10, [["c1", true, () => [face(unit(1), box(0.3))]]]);
  assert.ok(S2.visitors[0].frames > 0 && S2.visitors[0].att > 0);
});

test("trackers are per camera; dropRuntime forgets one camera only; timeline union via inFrameUnion", () => {
  const S = fresh();
  assert.notEqual(B.runtime(S, "c1"), B.runtime(S, "c2"));
  assert.equal(B.runtime(S, "c1"), B.runtime(S, "c1"));
  const r1 = B.runtime(S, "c1");
  B.dropRuntime(S, "c2");
  assert.equal(B.runtime(S, "c1"), r1);
  assert.equal(B.inFrameUnion([[{ id: "V001", confirmed: true }, { id: null, confirmed: true }], [{ id: "V001", confirmed: true }, { id: "V002", confirmed: false }]]), 1);
  const before = S.timeline.length;
  B.observe(S, [face(unit(0), box(0.2))], T0, B.runtime(S, "c1"), { cam: "c1", timeline: false });
  assert.equal(S.timeline.length, before, "timeline:false leaves the timeline to the page");
  B.noteTimeline(S, 2, T0); B.noteTimeline(S, 1, T0 + 10);
  assert.equal(S.timeline.at(-1).n, 2);
});

test("normalizeRoles: exactly one primary (first primary kept, else the first camera)", () => {
  assert.deepEqual(B.normalizeRoles([{ slot: "c1", role: "both" }, { slot: "c2", role: "both" }]), [{ slot: "c1", role: "primary" }, { slot: "c2", role: "aux" }]);
  assert.deepEqual(B.normalizeRoles([{ slot: "c1", role: "aux" }, { slot: "c2", role: "primary" }, { slot: "c3", role: "primary" }]).map(r => r.role), ["aux", "primary", "aux"]);
  assert.deepEqual(B.normalizeRoles([]), []);
});

test("camStats per camera + combined unique; funnel stages; hourly per camera", () => {
  const S = fresh();
  const mk = (id, dwell, cams, acts = []) => ({ id, first: T0, last: T0 + dwell * 1000, dwell, visits: 1, arrivals: [T0], frames: 1, att: 1, emo: [1, 0, 0, 0, 0, 0, 0], vSum: 0, acts, cams });
  S.visitors.push(mk("V001", 40, { c1: { f: T0, l: T0, d: 35 }, c2: { f: T0 + 3600e3, l: T0, d: 6 } }, ["ทดลอง"]));
  S.visitors.push(mk("V002", 6, { c2: { f: T0, l: T0, d: 6 } }));
  S.visitors.push(mk("V003", 2, { c1: { f: T0, l: T0, d: 2 } }));
  S.visitors.push(mk("V004", 1, undefined)); // legacy visitor without per-camera data
  const cs = B.camStats(S, [{ slot: "c1", name: "หน้าบูธ", role: "primary" }, { slot: "c2", name: "ทางเข้า", role: "aux" }], { c1: 1 });
  assert.equal(cs.unique, 4); assert.equal(cs.multi, 1);
  assert.deepEqual(cs.rows.map(r => [r.slot, r.unique, r.stopped, r.inFrame]), [["c1", 2, 1, 1], ["c2", 2, 2, 0]]);
  assert.equal(cs.rows[0].avgDwell, 18.5);
  const m = B.aggregate(S, T0);
  assert.deepEqual(m.funnel, { passed: 4, stopped: 2, engaged: 1, joined: 1 });
  const hb = B.hourlyByCam(S, ["c1", "c2"]);
  assert.equal(hb.c1[14], 2); assert.equal(hb.c2[14], 1); assert.equal(hb.c2[15], 1);
});

test("stats CSV is aggregate-only: no visitor ids, no descriptors, includes funnel/camera/hourly rows", () => {
  const S = fresh();
  run(S, 12, [["c1", true, () => [face(unit(0), box(0.2))]], ["c2", false, () => [face(unit(0), box(0.6)), face(unit(7), box(0.1))]]]);
  B.markActivity(S, S.visitors[0].id, "ทดลองสินค้า");
  const csv = B.buildStatsCsv(S, [{ slot: "c1", name: "=หน้าบูธ", role: "primary" }, { slot: "c2", name: "ทางเข้า", role: "aux" }], T0 + 60000);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(!/V\d{3}/.test(csv), "no visitor ids");
  assert.ok(!/0\.\d{4},0\.\d{4}/.test(csv), "no descriptor-like arrays");
  for (const k of ['"funnel","passed"', '"funnel","joined"', '"camera","c1"', '"camera","c2"', '"camera_hourly","c2@14:00"', '"summary","seen_by_2plus_cams"', '"activity","ทดลองสินค้า"']) assert.ok(csv.includes(k), k);
  assert.ok(csv.includes(`"'=หน้าบูธ"`), "formula injection guarded");
  assert.ok(csv.includes('"summary","unique","ผู้เข้าชมไม่ซ้ำ (ทุกกล้อง)","2"'));
});

test("privacy: per-camera fields persist as numbers only; desc stays out of booth-state by default", () => {
  const S = fresh();
  run(S, 10, [["c1", true, () => [face(unit(0), box(0.2))]], ["c2", false, () => [face(unit(0), box(0.6))]]]);
  const o = B.serializeState(S, false), st = JSON.parse(o.state);
  assert.ok(!("desc" in st) && !("cands" in st));
  for (const v of st.visitors) for (const e of Object.values(v.cams)) assert.deepEqual(Object.keys(e).sort(), ["d", "f", "l"]);
  assert.equal(Object.keys(JSON.parse(o.session).desc).length, 1, "one shared gallery entry for one person on two cameras");
  // restored state (same tab, same day) re-matches across cameras with fresh trackers
  const R = B.restoreState(o.state, o.session, false, T0 + 5000);
  let now = T0 + 6000;
  for (let k = 0; k < 6; k++) { now += 250; B.observe(R, [face(unit(0), box(0.4))], now, B.runtime(R, "c2"), { cam: "c2", primary: false }); }
  assert.equal(R.visitors.length, 1);
});
