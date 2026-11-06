"use strict";
// node --test tests/unit — LQTrack: store.js parity, Hungarian, lost pool, helpers.
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../../lensiq-track.js");
const store = require("../../store.js");

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

test("(1) parity with store.updateTracker on 200 random streams (ST_CFG)", () => {
  for (let k = 0; k < 200; k++) {
    const r = rng(1000 + k);
    const A = store.newTracker(), B = T.newTracker();
    let people = Array.from({ length: 1 + Math.floor(r() * 5) }, () => ({ x: r() * 0.8, y: r() * 0.6, w: 0.05 + r() * 0.15, h: 0.1 + r() * 0.3, vx: (r() - 0.5) * 0.04, vy: (r() - 0.5) * 0.02 }));
    let now = 1000;
    for (let f = 0; f < 40; f++) {
      now += r() < 0.1 ? 600 + r() * 1500 : 50 + r() * 150;
      if (r() < 0.08) people.push({ x: r() * 0.8, y: r() * 0.6, w: 0.1, h: 0.25, vx: (r() - 0.5) * 0.04, vy: 0 });
      if (r() < 0.05 && people.length) people.splice(Math.floor(r() * people.length), 1);
      people.forEach(p => { p.x += p.vx; p.y += p.vy; });
      const dets = people.filter(() => r() > 0.15).map(p => ({ x: p.x + (r() - 0.5) * 0.01, y: p.y, w: p.w, h: p.h, score: 0.4 + r() * 0.6 }));
      const ra = store.updateTracker(A, dets, now);
      const rb = T.updateTracker(B, dets, now, store.ST_CFG);
      assert.deepEqual(rb.seen.map(t => t.id), ra.seen.map(t => t.id), `stream ${k} frame ${f} seen`);
      assert.deepEqual(rb.removed, ra.removed, `stream ${k} frame ${f} removed`);
      assert.equal(B.nextId, A.nextId);
      assert.deepEqual(B.tracks.map(t => [t.id, t.box, t.vx, t.vy, t.hits, t.lastSeen]), A.tracks.map(t => [t.id, t.box, t.vx, t.vy, t.hits, t.lastSeen]));
    }
  }
});

function brute(cost) {
  const R = cost.length, C = cost[0].length, used = new Array(C).fill(false);
  let best = { n: -1, c: Infinity };
  (function rec(i, n, c) {
    if (i === R) { if (n > best.n || (n === best.n && c < best.c - 1e-12)) best = { n, c }; return; }
    rec(i + 1, n, c);
    for (let j = 0; j < C; j++) if (!used[j] && Number.isFinite(cost[i][j])) { used[j] = true; rec(i + 1, n + 1, c + cost[i][j]); used[j] = false; }
  })(0, 0, 0);
  return best;
}
function evalPairs(cost, pairs) {
  const rows = new Set(), cols = new Set(); let c = 0;
  for (const [i, j] of pairs) {
    assert.ok(!rows.has(i) && !cols.has(j), "row/col reused");
    assert.ok(Number.isFinite(cost[i][j]), "forbidden pair returned");
    rows.add(i); cols.add(j); c += cost[i][j];
  }
  return { n: pairs.length, c };
}

test("(2) lsa matches brute force (300 random 6x6 with Infinity, plus 4x7 and 7x4)", () => {
  const r = rng(7);
  const mk = (R, C, pInf) => Array.from({ length: R }, () => Array.from({ length: C }, () => (r() < pInf ? Infinity : Math.round(r() * 100) / 10)));
  const shapes = [];
  for (let k = 0; k < 300; k++) shapes.push(mk(6, 6, k % 3 === 0 ? 0 : 0.35));
  for (let k = 0; k < 100; k++) shapes.push(mk(4, 7, 0.3), mk(7, 4, 0.3));
  shapes.push(mk(3, 3, 1)); // all forbidden
  for (const cost of shapes) {
    const b = brute(cost), got = evalPairs(cost, T.lsa(cost));
    assert.equal(got.n, Math.max(0, b.n));
    assert.ok(Math.abs(got.c - (b.n > 0 ? b.c : 0)) < 1e-9, `cost ${got.c} vs ${b.c}`);
  }
  assert.deepEqual(T.lsa([]), []);
  assert.deepEqual(T.lsa([[1, 2], [2, 1]]), [[0, 0], [1, 1]]);
});

function crossing(hz, cfg) {
  const tr = T.newTracker(cfg), dt = 1000 / hz, ids = new Map();
  for (let t = 0; t <= 3000; t += dt) {
    const s = t / 3000; // 0..1
    const a = { x: 0.1 + 0.7 * s, y: 0.30, w: 0.1, h: 0.3, score: 0.9, who: "a" };
    const b = { x: 0.8 - 0.7 * s, y: 0.36, w: 0.1, h: 0.3, score: 0.9, who: "b" };
    T.updateTracker(tr, [a, b], 1000 + t);
    for (const k of tr.tracks) if (k.lastSeen === 1000 + t) {
      const who = k.det.who;
      if (!ids.has(who)) ids.set(who, new Set());
      ids.get(who).add(k.id);
    }
  }
  return ids;
}
test("(3) Hungarian keeps ids of 2 crossing boxes at 12 Hz and at 3 Hz (trackerCfgFor)", () => {
  for (const [hz, cfg] of [[12, T.PRESET.person], [3, T.trackerCfgFor(T.PRESET.person, 333)]]) {
    const ids = crossing(hz, cfg);
    assert.deepEqual([...ids.get("a")], [1], `a @${hz}Hz`);
    assert.deepEqual([...ids.get("b")], [2], `b @${hz}Hz`);
  }
  const c = T.trackerCfgFor(T.PRESET.person, 333);
  assert.equal(c.MAX_MISSED_MS, 1000);
  assert.equal(T.trackerCfgFor(T.PRESET.person, 500).MAX_MISSED_MS, 1500);
  assert.ok(Math.abs(c.DIST_MAX - Math.min(0.3, 0.12 * 333 / 83)) < 1e-12);
  assert.equal(c.REVIVE_DIST, 2 * c.DIST_MAX);
  assert.equal(T.trackerCfgFor(T.PRESET.person, 50).DIST_MAX, 0.12);
});

function gap(ms) {
  const cfg = { ...T.PRESET.person, LOST_TTL_MS: 2000 };
  const tr = T.newTracker(cfg), d = () => [{ x: 0.45, y: 0.3, w: 0.1, h: 0.3, score: 0.9 }];
  let now = 0;
  for (; now <= 1000; now += 100) T.updateTracker(tr, d(), now);
  const last = now - 100;
  for (now = last + 100; now < last + ms; now += 100) T.updateTracker(tr, [], now);
  return T.updateTracker(tr, d(), last + ms);
}
test("(4) lost pool: 1.5 s gap revives the id, 2.5 s gap gives a new id", () => {
  const a = gap(1500);
  assert.equal(a.revived.length, 1); assert.equal(a.revived[0].id, 1); assert.equal(a.born.length, 0);
  assert.deepEqual(a.seen.map(t => t.id), [1]);
  const b = gap(2500);
  assert.equal(b.revived.length, 0); assert.equal(b.born.length, 1); assert.equal(b.born[0].id, 2);
  // removed is reported once when the lost track expires
  const cfg = { ...T.PRESET.person, LOST_TTL_MS: 2000 }, tr = T.newTracker(cfg);
  T.updateTracker(tr, [{ x: 0.1, y: 0.1, w: 0.1, h: 0.1, score: 1 }], 0);
  const rem = [];
  for (let t = 100; t <= 3000; t += 100) rem.push(...T.updateTracker(tr, [], t).removed);
  assert.deepEqual(rem, [1]);
  assert.equal(tr.lost.length, 0);
});

test("(5) assignUnique: two faces nearest the same key -> one assignment, closer wins", () => {
  const m = T.assignUnique([{ i: 0, key: "A", dist: 0.3 }, { i: 1, key: "A", dist: 0.2 }, { i: 1, key: "B", dist: 0.9 }], 0.5);
  assert.equal(m.size, 1);
  assert.deepEqual(m.get(1), { key: "A", dist: 0.2 });
  assert.equal(m.has(0), false);
  const m2 = T.assignUnique([{ i: 0, key: "A", dist: 0.3 }, { i: 1, key: "A", dist: 0.2 }, { i: 0, key: "B", dist: 0.4 }], 0.5);
  assert.deepEqual(m2.get(0), { key: "B", dist: 0.4 });
});

test("(6) createConfirm: pending, confirmed, already; confirmed again after a gap > windowMs", () => {
  const c = T.createConfirm({ need: 2, windowMs: 1500 });
  assert.equal(c.hit("k", 0), "pending");
  assert.equal(c.hit("k", 100), "confirmed");
  assert.equal(c.hit("k", 200), "already");
  assert.equal(c.hit("k", 1600), "already");
  assert.equal(c.has("k"), true);
  assert.equal(c.hit("k", 3200), "pending");
  assert.equal(c.hit("k", 3300), "confirmed");
  assert.deepEqual(c.prune(10000), ["k"]);
  assert.equal(c.has("k"), false);
  c.hit("z", 0); c.reset("z"); assert.equal(c.has("z"), false);
});

test("(7) pickPrimary: lockOnly returns -1, imageLeft prefers the left box, continuity", () => {
  const L = { x: 0.1, y: 0.3, w: 0.2, h: 0.3 }, R = { x: 0.7, y: 0.3, w: 0.2, h: 0.3 };
  assert.equal(T.pickPrimary([L, R], null, { prefer: "imageLeft" }).index, 0);
  assert.equal(T.pickPrimary([R, L], null, { prefer: "imageLeft" }).index, 1);
  assert.equal(T.pickPrimary([L, R], null, { prefer: "imageRight" }).index, 1);
  const prev = { x: 0.71, y: 0.3, w: 0.2, h: 0.3 };
  assert.deepEqual(T.pickPrimary([L, R], prev, { prefer: "imageLeft" }), { index: 1, continuity: true, n: 2 });
  const far = { x: 0.4, y: 0.0, w: 0.05, h: 0.05 };
  assert.deepEqual(T.pickPrimary([L, R], far, { lockOnly: true }), { index: -1, continuity: false, n: 2 });
  assert.equal(T.pickPrimary([L, R], far, { prefer: "imageLeft" }).index, 0);
  assert.deepEqual(T.pickPrimary([], null), { index: -1, continuity: false, n: 0 });
  const big = { x: 0.6, y: 0.1, w: 0.4, h: 0.6 };
  assert.equal(T.pickPrimary([L, big], null).index, 1);
  assert.equal(T.pickPrimary([L, R], null, { prefer: { x: 0.8, y: 0.45 } }).index, 1);
});

test("(13) snapshot has no det payload; geometry helpers", () => {
  const tr = T.newTracker(T.PRESET.face);
  T.updateTracker(tr, [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, score: 0.9, descriptor: new Float32Array([0.123456, 0.5]), landmarks: [1, 2] }], 0);
  assert.ok(tr.tracks[0].det.descriptor, "det kept in memory");
  const snap = T.snapshot(tr), js = JSON.stringify(snap);
  assert.ok(!/descriptor|landmarks|"det"/.test(js), js);
  assert.equal(snap.tracks[0].id, 1);
  assert.deepEqual(T.toNorm({ x: 10, y: 20, width: 100, height: 50 }, 200, 100), { x: 0.05, y: 0.2, w: 0.5, h: 0.5 });
  assert.deepEqual(T.toNorm({ x: 10, y: 20, w: 100, h: 50 }, 200, 100), { x: 0.05, y: 0.2, w: 0.5, h: 0.5 });
  const a = { x: 0, y: 0, w: 1, h: 1 }, b = { x: 0.5, y: 0.5, w: 1, h: 1 };
  assert.equal(T.iou(a, b), store.iou(a, b));
  assert.deepEqual(T.foot(b), store.foot(b));
  assert.equal(T.DEFAULTS.ASSIGN, "greedy");
  for (const k of ["person", "face", "hand", "object"]) assert.equal(T.PRESET[k].ASSIGN, "hungarian");
});

test("matchFace: nearest under maxDist, margin to the runner-up rejects ambiguous matches", () => {
  const T = require("../../lensiq-track.js");
  const v = (...a) => Float32Array.from(a);
  const gal = [{ label: "a", d: v(0, 0) }, { label: "b", d: v(1, 0) }, { label: "a", d: v(0, 0.1) }];
  assert.strictEqual(T.matchFace(v(0.1, 0), gal, { maxDist: 0.55 }).label, "a");
  assert.strictEqual(T.matchFace(v(5, 5), gal, { maxDist: 0.55 }).label, "unknown");
  // between a and b: a at 0.45, b at 0.55 -> accepted without margin, rejected with margin 0.2 (ambiguous)
  const mid = v(0.45, 0);
  assert.strictEqual(T.matchFace(mid, gal, { maxDist: 0.55 }).label, "a");
  const r = T.matchFace(mid, gal, { maxDist: 0.55, margin: 0.2 });
  assert.strictEqual(r.label, "unknown"); assert.ok(r.ambiguous);
  // the runner-up must be ANOTHER label: two samples of "a" never make it ambiguous
  assert.strictEqual(T.matchFace(v(0, 0.05), gal, { maxDist: 0.55, margin: 0.2 }).label, "a");
  assert.strictEqual(T.matchFace(v(0, 0), null).label, "unknown");
});
