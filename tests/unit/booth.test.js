"use strict";
// node --test tests/unit — booth.js pure layer: spatial tracks bound to visitors, nearest candidate, timeline, privacy persistence.
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../../booth.js");

const unit = k => Array.from({ length: 128 }, (_, i) => (i === k ? 1 : 0));
const mix = (a, b, t) => a.map((x, i) => x * (1 - t) + b[i] * t);
const face = (desc, box, extra = {}) => ({ desc, e: [1, 0, 0, 0, 0, 0, 0], v: 0, att: 1, area: box.w * box.h, box, ...extra });
const box = (x, y = 0.3, w = 0.15, h = 0.2) => ({ x, y, w, h });
const T0 = new Date(2026, 10, 6, 12, 0, 0).getTime();

test("descriptor drifting past 0.5 over 20 frames on one continuous track keeps one visitor id", () => {
  const S = B.newState("t", B.dayKey(T0));
  S.descDay = B.dayKey(T0);
  const A = unit(0), Z = unit(1); // |A-Z| = 1.414
  // warm-up: same face 6 frames -> promoted to V001
  let now = T0;
  for (let k = 0; k < 6; k++) { now += 250; B.observe(S, [face(A, box(0.3))], now); }
  assert.equal(S.visitors.length, 1);
  const ids = new Set();
  for (let k = 1; k <= 20; k++) {
    now += 250;
    const d = mix(A, Z, k / 20);
    const [r] = B.observe(S, [face(d, box(0.3 + k * 0.004))], now);
    ids.add(r.id);
  }
  assert.ok(B.dist(A, Z) > 0.5);
  assert.deepEqual([...ids], ["V001"]);
  assert.equal(S.visitors.length, 1, "no second visitor created");
});

test("same drift but the face disappears and comes back elsewhere is a fresh lookup (no spatial carry-over)", () => {
  const S = B.newState("t"); S.descDay = B.dayKey(T0);
  let now = T0;
  for (let k = 0; k < 6; k++) { now += 250; B.observe(S, [face(unit(0), box(0.1))], now); }
  now += 5000; // track expired (MAX_MISSED_MS 1500)
  for (let k = 0; k < 6; k++) { now += 250; B.observe(S, [face(unit(1), box(0.7))], now); }
  assert.equal(S.visitors.length, 2);
});

test("unknown face joins the NEAREST pending candidate, not the first one under MATCH", () => {
  const S = B.newState("t"); S.descDay = B.dayKey(T0);
  const base = unit(0);
  const cA = mix(base, unit(2), 0.2), cB = mix(base, unit(3), 0.05);
  const R = B.newRuntime();
  B.observe(S, [face(cA, box(0.05)), face(cB, box(0.7))], T0, R);
  assert.equal(S.cands.length, 2);
  const [first, second] = S.cands;
  assert.ok(B.dist(first.desc, base) < 0.5 && B.dist(second.desc, base) < 0.5, "both under MATCH");
  assert.ok(B.dist(second.desc, base) < B.dist(first.desc, base), "second is nearer");
  // new face at a new position (new track) with the base descriptor
  const R2 = B.newRuntime(); // fresh tracker so the face is a new unbound track
  B.observe(S, [face(base, box(0.4))], T0 + 100, R2);
  assert.equal(S.cands.length, 2, "joined an existing candidate");
  assert.equal(second.obs.length, 2, "nearest candidate got the observation");
  assert.equal(first.obs.length, 1);
  assert.equal(B.nearestCand([first, second], base, new Set()), second);
});

test("timeline ignores unconfirmed faces and unrecognised candidates", () => {
  const S = B.newState("t"); S.descDay = B.dayKey(T0);
  S.visitors.push({ id: "V001", first: T0 - 9e4, last: T0 - 9e4, dwell: 0, visits: 1, arrivals: [T0 - 9e4], frames: 0, att: 0, emo: [0, 0, 0, 0, 0, 0, 0], vSum: 0, acts: [] });
  S.desc.V001 = unit(0); S.seq = 1;
  const t = Math.floor(T0 / 5000) * 5000 + 10;
  // frame 1: known visitor (new track, hits 1 = unconfirmed) + stranger
  let res = B.observe(S, [face(unit(0), box(0.1)), face(unit(5), box(0.6))], t);
  assert.equal(res.find(r => r.box.x === 0.1).id, "V001");
  assert.equal(S.timeline.at(-1).n, 0, "unconfirmed track not counted");
  assert.equal(B.inFrameCount(res), 0);
  res = B.observe(S, [face(unit(0), box(0.1)), face(unit(5), box(0.6))], t + 250);
  assert.equal(S.timeline.at(-1).n, 1, "confirmed + bound only; candidate excluded");
  assert.equal(B.inFrameCount(res), 1);
});

test("two people in frame keep distinct ids; max 6 faces analysed per frame", () => {
  const S = B.newState("t"); S.descDay = B.dayKey(T0);
  let now = T0, res;
  const faces = () => Array.from({ length: 8 }, (_, i) => face(unit(i), box(0.02 + i * 0.12, 0.3, 0.1 + (i < 6 ? 0.01 : 0), 0.2)));
  for (let k = 0; k < 6; k++) { now += 250; res = B.observe(S, faces(), now); }
  assert.equal(res.length, 6);
  assert.equal(new Set(res.map(r => r.id)).size, 6);
  assert.equal(S.visitors.length, 6);
});

test("hitBox picks the tapped box, smallest containing, or nearest within slack", () => {
  const fr = [{ id: "V001", box: box(0.1, 0.1, 0.5, 0.5) }, { id: "V002", box: box(0.2, 0.2, 0.1, 0.1) }, { id: "V003", box: box(0.8, 0.8, 0.1, 0.1) }];
  assert.equal(B.hitBox(fr, 0.25, 0.25).id, "V002");
  assert.equal(B.hitBox(fr, 0.5, 0.5).id, "V001");
  assert.equal(B.hitBox(fr, 0.78, 0.85).id, "V003");
  assert.equal(B.hitBox(fr, 0.75, 0.05), null);
});

test("privacy: default serialise strips desc from booth-state; session copy restores same-day only", () => {
  const S = B.newState("งาน"); S.descDay = B.dayKey(T0); S.desc = { V001: [0.1, 0.2] }; S.cands = [{ desc: [1] }];
  const off = B.serializeState(S, false);
  assert.ok(!("desc" in JSON.parse(off.state)) && !("cands" in JSON.parse(off.state)));
  assert.deepEqual(JSON.parse(off.session).desc, S.desc);
  assert.equal(off.vault, null);
  // remember ON: booth-state still has no desc; the {day, desc} copy goes to the encrypted vault (lqv-booth-desc)
  const on = B.serializeState(S, true);
  assert.ok(!("desc" in JSON.parse(on.state)));
  assert.deepEqual(on.vault, { day: S.descDay, desc: S.desc });
  assert.deepEqual(B.restoreState(on.state, null, true, T0 + 1000, on.vault).desc, S.desc, "decrypted vault copy restores same day");
  assert.deepEqual(B.restoreState(on.state, null, false, T0 + 1000, on.vault).desc, {}, "vault ignored when remember is off");
  // reload, same day
  let R = B.restoreState(off.state, off.session, false, T0 + 1000);
  assert.deepEqual(R.desc, S.desc);
  // reload without the tab's session -> nothing remembered
  R = B.restoreState(off.state, null, false, T0 + 1000);
  assert.deepEqual(R.desc, {});
  // next day -> purged in both modes
  const next = T0 + 36 * 3600e3;
  assert.deepEqual(B.restoreState(off.state, off.session, false, next).desc, {});
  assert.deepEqual(B.restoreState(on.state, null, true, next, on.vault).desc, {});
});

test("legacy booth-state (desc in localStorage, no prefs) still loads", () => {
  const legacy = JSON.stringify({ event: { name: "เก่า", date: "2026-11-06" }, seq: 2, visitors: [{ id: "V001", first: T0, last: T0, dwell: 3, visits: 1, arrivals: [T0], frames: 4, att: 2, emo: [1, 0, 0, 0, 0, 0, 0], vSum: 0, acts: ["ทดลอง"] }], timeline: [{ t: T0, n: 1 }], desc: { V001: [0.5] }, descDay: B.dayKey(T0) });
  const S = B.restoreState(legacy, null, true, T0 + 1000);
  assert.equal(S.visitors.length, 1); assert.deepEqual(S.desc, { V001: [0.5] });
  const S2 = B.restoreState(legacy, null, false, T0 + 1000);
  assert.equal(S2.event.name, "เก่า");
  assert.ok(!("desc" in JSON.parse(B.serializeState(S2, false).state)), "next persist strips it");
  assert.equal(B.aggregate(S2, T0).unique, 1);
  assert.deepEqual(B.restoreState("{garbage", null, false, T0).visitors, []);
});
