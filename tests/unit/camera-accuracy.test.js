// Camera accuracy helpers (added in round 4): YOLOX decoding, ByteTrack-style association, line-crossing hysteresis/confirmation,
// face quality gate, per-person enrolment thresholds, multi-frame consensus, booth count-only mode.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../../lensiq-detect.js");
const T = require("../../lensiq-track.js");
const ST = require("../../store.js");
const B = require("../../booth.js");

test("decodeYolox: grid offsets, exp sizes, obj×cls score, letterbox scale, NMS", () => {
  const S = 32, strides = [8, 16, 32];
  const A = (S / 8) ** 2 + (S / 16) ** 2 + (S / 32) ** 2; // 16 + 4 + 1
  const C5 = 85, out = new Float32Array(A * C5);
  // anchor 5 = stride 8, gy=1, gx=1: centre ((0.5+1)*8, (0.5+1)*8) = (12,12), size exp(0)*8 = 8
  const set = (i, v) => out.set(v, i * C5);
  const row = (dx, dy, lw, lh, obj, person) => { const r = new Float32Array(C5); r.set([dx, dy, lw, lh, obj]); r[5] = person; return r; };
  set(5, row(0.5, 0.5, 0, 0, 0.9, 0.9));
  set(6, row(0.5, 0.5, 0, 0, 0.9, 0.8)); // neighbour, overlaps 0 (x 16..24 vs 8..16) -> kept
  set(17, row(0.5, 0.5, Math.log(2), Math.log(2), 0.9, 0.3)); // stride 16, gy=0,gx=1: centre (24,8) size 32 — score 0.27 < 0.4
  const d = D.decodeYolox(out, A, C5, S, { minScore: 0.4, scale: 2, strides });
  assert.equal(d.length, 2);
  assert.deepEqual([d[0].x, d[0].y, d[0].w, d[0].h], [4, 4, 4, 4]); // (12-4)/2 … in source px
  assert.ok(Math.abs(d[0].score - 0.81) < 1e-6);
  assert.equal(d[0].cls, 0);
  // duplicate box -> NMS keeps the best
  set(6, row(0.5, 0.5, 0, 0, 0.9, 0.8)); set(5, row(0.5, 0.5, 0, 0, 0.9, 0.9));
  set(4, row(1.5, 0.5, 0, 0, 0.9, 0.7)); // gx=0 + 1.5 = same centre as anchor 5 at gy=1? (gy=1 row starts at 4)
  const d2 = D.decodeYolox(out, A, C5, S, { minScore: 0.4, strides });
  assert.equal(d2.filter(b => b.x === 8 && b.y === 8).length, 1);
});

test("byte association: a low-score detection keeps the track alive; low-score dets never start a track", () => {
  const cfg = { ...T.PRESET.person, ASSIGN: "byte", HIGH: 0.5, LOW: 0.2, NEW_MIN: 0.5, MAX_MISSED_MS: 300 };
  const Tr = T.newTracker(cfg);
  T.updateTracker(Tr, [{ x: 0.1, y: 0.1, w: 0.1, h: 0.3, score: 0.9 }], 0);
  T.updateTracker(Tr, [{ x: 0.11, y: 0.1, w: 0.1, h: 0.3, score: 0.9 }], 100);
  const r = T.updateTracker(Tr, [{ x: 0.12, y: 0.1, w: 0.1, h: 0.3, score: 0.3 }, { x: 0.7, y: 0.5, w: 0.1, h: 0.3, score: 0.35 }], 200);
  assert.equal(r.seen.length, 1);
  assert.equal(r.seen[0].id, 1);
  assert.equal(r.born.length, 0, "low-score det far away is not born");
  assert.equal(Tr.tracks.length, 1);
  // a confident det of a different size is not glued to the track (size ratio gate)
  const r2 = T.updateTracker(Tr, [{ x: 0.12, y: 0.1, w: 0.3, h: 0.9, score: 0.9 }], 300);
  assert.equal(r2.born.length, 1);
});

test("trackerCfgFor scales DIST_REL with the frame interval", () => {
  const c = T.trackerCfgFor({ ...T.PRESET.person, DIST_REL: 0.3 }, 166);
  assert.ok(Math.abs(c.DIST_REL - 0.6) < 0.01);
  assert.equal(T.trackerCfgFor(T.PRESET.person, 166).DIST_REL, undefined);
});

test("crossStep: hysteresis band and confirmation frames", () => {
  const line = { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } };
  // confirm 2: crossing then immediately back = no count
  let m = {};
  const run = (xs, cfg, h = 0) => xs.map(x => ST.crossStep(m, line, { x, y: 0.5 }, false, cfg, h));
  assert.deepEqual(run([0.4, 0.6, 0.4, 0.4], { confirm: 2 }), [null, null, null, null]);
  m = {};
  const r = run([0.4, 0.6, 0.62], { confirm: 2 });
  assert.equal(r[2] != null, true); assert.equal(r[1], null);
  // same direction as checkCrossing
  const m2 = {}; ST.checkCrossing(m2, line, { x: 0.4, y: 0.5 }); const ref = ST.checkCrossing(m2, line, { x: 0.6, y: 0.5 });
  assert.equal(r[2], ref);
  // band relative to box height: 0.05 from the line is "on the line" for a 0.6-tall box with bandRel 0.1
  m = {};
  assert.deepEqual(run([0.4, 0.55, 0.45], { bandRel: 0.1 }, 0.6), [null, null, null]);
  m = {};
  assert.equal(run([0.4, 0.6], { bandRel: 0.1 }, 0.6)[1], ref);
});

test("stepCam uses crossStep when the tracker cfg has CROSS", () => {
  const pipe = ST.newPipe(), day = ST.newDay("2000-01-01");
  const cam = { slot: "c1", role: "door", line: { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } }, zones: [] };
  const cfg = { ...T.trackerCfgFor(ST.ST_TRACK, 200), CROSS: { confirm: 2, bandRel: 0.1 } };
  const xs = [0.3, 0.36, 0.42, 0.48, 0.54, 0.6, 0.66];
  const got = xs.map((x, i) => ST.stepCam(pipe, cam, day, [{ x: x - 0.05, y: 0.3, w: 0.1, h: 0.3, score: 0.9 }], i * 200, cfg).crossings.length);
  assert.equal(got.reduce((a, b) => a + b, 0), 1);
  assert.equal(day.in + day.out, 1);
});

test("faceQuality / qualityOk: size, score, yaw from landmarks", () => {
  const lm = Array.from({ length: 68 }, () => [50, 50]);
  lm[36] = [30, 40]; lm[45] = [70, 40]; lm[30] = [50, 55];
  const q = T.faceQuality({ box: { width: 100, height: 120 }, score: 0.9, landmarks: lm });
  assert.equal(q.size, 100); assert.equal(q.yaw, 0);
  assert.ok(T.qualityOk(q));
  lm[30] = [68, 55];
  const q2 = T.faceQuality({ box: { w: 100, h: 120 }, score: 0.9, landmarks: lm });
  assert.ok(q2.yaw > 0.8); assert.ok(!T.qualityOk(q2));
  assert.ok(!T.qualityOk(T.faceQuality({ box: { w: 30, h: 30 }, score: 0.9 })));
  assert.ok(!T.qualityOk(T.faceQuality({ box: { w: 100, h: 100 }, score: 0.45 })));
  assert.ok(!T.qualityOk({ size: 100, score: 0.9, yaw: 0, sharp: 10 }, { minSharp: 40 }));
});

test("enrolGallery: per-person limit tightens near look-alikes; matchFace honours it", () => {
  const v = (...a) => Float32Array.from({ length: 4 }, (_, i) => a[i] || 0);
  const people = [{ label: "A", ds: [v(0, 0), v(0.05, 0)] }, { label: "B", ds: [v(0.5, 0)] }, { label: "C", ds: [v(3, 3)] }];
  const g = T.enrolGallery(people, { maxDist: 0.55, k: 0.8, floor: 0.3, centroid: false });
  assert.equal(g.length, 4);
  assert.equal(T.enrolGallery(people).length, 3, "centroid: one entry per person");
  const thr = Object.fromEntries(g.map(e => [e.label, e.thr]));
  assert.ok(Math.abs(thr.A - 0.36) < 1e-6, "0.8 × 0.45"); assert.equal(thr.C, 0.55);
  // probe 0.38 from A: inside the global 0.55 but outside A's own 0.36 -> unknown
  const m = T.matchFace(v(-0.38, 0), g, { maxDist: 0.55 });
  assert.equal(m.label, "unknown"); assert.ok(Math.abs(m.limit - 0.36) < 1e-6);
  assert.equal(T.matchFace(v(-0.1, 0), g, { maxDist: 0.55 }).label, "A");
  // old galleries without thr behave as before
  assert.equal(T.matchFace(v(-0.38, 0), [{ label: "A", d: v(0, 0) }], { maxDist: 0.55 }).label, "A");
});

test("createConsensus: need of last N frames, unknown votes against", () => {
  const c = T.createConsensus({ need: 2, of: 3, windowMs: 1000 });
  assert.equal(c.push("t", "A", 0), null);
  assert.equal(c.push("t", "unknown", 10), null);
  assert.equal(c.push("t", "A", 20), "A");
  assert.equal(c.push("u", "B", 0), null);
  assert.equal(c.push("u", "A", 1), null);
  assert.equal(c.push("u", "unknown", 2), null);
  assert.equal(c.push("u", "B", 3), null, "B 1 of last 3");
  c.prune(5000); assert.equal(c.size(), 0);
});

test("booth count-only: visitors and dwell from position only, no descriptors anywhere", () => {
  const S = B.newState("x", "2026-01-01");
  let now = 1e6;
  const face = x => ({ desc: null, e: [1, 0, 0, 0, 0, 0, 0], v: 0, att: 1, area: 0.04, box: { x, y: 0.3, w: 0.2, h: 0.2 }, score: 0.9 });
  for (let k = 0; k < 8; k++) { now += 250; B.observe(S, [face(0.3 + k * 0.002)], now, B.runtime(S, "c1"), { countOnly: true, cam: "c1" }); }
  assert.equal(S.visitors.length, 1);
  assert.deepEqual(S.desc, {});
  assert.equal(S.cands.length, 0);
  // the same position after a short gap (occlusion) keeps the visitor; a different place = new visitor
  now += 1500; for (let k = 0; k < 6; k++) { now += 250; B.observe(S, [face(0.31)], now, B.runtime(S, "c1"), { countOnly: true, cam: "c1" }); }
  assert.equal(S.visitors.length, 1);
  for (let k = 0; k < 6; k++) { now += 250; B.observe(S, [face(0.31), face(0.75)], now, B.runtime(S, "c1"), { countOnly: true, cam: "c1" }); }
  assert.equal(S.visitors.length, 2);
  assert.ok(S.visitors[0].dwell > 2);
});
