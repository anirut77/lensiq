"use strict";
// node --test tests/unit — store.js re-ID (synthetic embeddings), double-crossing suppression, staff exclusion,
// queue SLA, hourly CSV and the Thai daily summary.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../store.js");
const T = require("../../lensiq-track.js");

const DIM = 64;
/* deterministic "person" embeddings: a random unit vector per person + small per-frame noise */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function person(seed) { const r = rng(seed); return Float32Array.from({ length: DIM }, () => r() - 0.5); }
function noisy(v, seed, amp = 0.05) { const r = rng(seed); return Float32Array.from(v, x => x + (r() - 0.5) * amp); }
const LINE = { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } }; // right -> left = "in"
const box = x => ({ x: x - 0.05, y: 0.3, w: 0.1, h: 0.4, score: 0.9 });
const tc = T.trackerCfgFor(T.PRESET.person, 100);

test("cosine / l2norm basics", () => {
  const a = person(1), b = person(2);
  assert.ok(Math.abs(S.cosine(a, a) - 1) < 1e-6);
  assert.ok(S.cosine(a, b) < 0.5, "random people are dissimilar");
  assert.ok(S.cosine(a, noisy(a, 9)) > 0.95, "same person with noise stays similar");
  const n = S.l2norm(Float32Array.from([3, 4]));
  assert.ok(Math.abs(n[0] - 0.6) < 1e-6 && Math.abs(n[1] - 0.8) < 1e-6);
  assert.equal(S.cosine(a, Float32Array.from([1, 2])), 0, "length mismatch -> 0");
});

test("reidMatch: best lost person above SIM_MIN with margin, within TTL and distance; active ids excluded", () => {
  const R = S.newReid(), A = person(11), B = person(12), now = 1e6;
  R.lost.set(3, { emb: S.l2norm(A), at: now - 1000, box: box(0.3) });
  R.lost.set(4, { emb: S.l2norm(B), at: now - 1000, box: box(0.35) });
  const m = S.reidMatch(R, noisy(A, 5), now, box(0.4));
  assert.equal(m && m.canon, 3);
  assert.ok(m.sim > 0.9);
  assert.equal(S.reidMatch(R, person(99), now, box(0.4)), null, "a stranger never matches");
  assert.equal(S.reidMatch(R, noisy(A, 5), now, box(0.4), new Set([3])), null, "id still visible elsewhere -> not the same person");
  assert.equal(S.reidMatch(R, noisy(A, 5), now + R.cfg.LOST_TTL_MS + 1, box(0.4)), null, "expired");
  assert.equal(S.reidMatch(R, noisy(A, 5), now, { x: 0.95, y: 0.95, w: 0.04, h: 0.04 }), null, "too far away");
  // two nearly identical lost people: ambiguous (margin) -> no match
  const R2 = S.newReid();
  R2.lost.set(1, { emb: S.l2norm(A), at: now, box: box(0.3) });
  R2.lost.set(2, { emb: S.l2norm(noisy(A, 77, 0.01)), at: now, box: box(0.3) });
  assert.equal(S.reidMatch(R2, A, now, box(0.3)), null, "ambiguous twins are not guessed");
});

test("crossDecision: same person, same direction within window is suppressed; opposite direction counts", () => {
  const R = S.newReid({ CROSS_WINDOW_MS: 10000 }), A = S.l2norm(person(21)), B = S.l2norm(person(22));
  assert.deepEqual(S.crossDecision(R, 1, "in", 0, A, new Set([1])), { count: true, reason: null });
  assert.equal(S.crossDecision(R, 1, "in", 3000, A, new Set([1])).reason, "same-id");
  assert.equal(S.crossDecision(R, 1, "out", 4000, A, new Set([1])).count, true, "in then out both count");
  assert.equal(S.crossDecision(R, 1, "in", 5000, A, new Set([1])).count, true, "back in after going out counts");
  // a NEW id with the same appearance crossing the same way (id swap) -> suppressed via embedding
  const R2 = S.newReid({ CROSS_WINDOW_MS: 10000 });
  S.crossDecision(R2, 1, "in", 0, A, new Set([1]));
  assert.equal(S.crossDecision(R2, 7, "in", 2000, S.l2norm(noisy(A, 3)), new Set([7])).reason, "re-id");
  assert.equal(S.crossDecision(R2, 8, "in", 2500, B, new Set([8])).count, true, "a different person counts");
  // ...but not while the first person is still visible (two look-alikes walking together)
  const R3 = S.newReid();
  S.crossDecision(R3, 1, "in", 0, A, new Set([1, 2]));
  assert.equal(S.crossDecision(R3, 2, "in", 300, A, new Set([1, 2])).count, true);
  // window expiry
  const R4 = S.newReid({ CROSS_WINDOW_MS: 1000 });
  S.crossDecision(R4, 1, "in", 0, A, null);
  assert.equal(S.crossDecision(R4, 1, "in", 1500, A, null).count, true);
  assert.equal(R2.stats.suppressed, 1);
});

/* scripted door: person walks in (right -> left), is hidden 1.7 s, re-appears OUTSIDE and walks in again */
function doorScenario(opt) {
  const day = S.newDay("2026-11-06"), pipe = S.newPipe(), cam = { slot: "c1", name: "ประตู", role: "door", line: LINE, zones: [] };
  const A = person(31);
  let t = new Date(2026, 10, 6, 10).getTime(), seed = 1;
  const embed = opt && opt.reid ? () => noisy(A, seed++) : undefined;
  const step = dets => { t += 100; return S.stepCam(pipe, cam, day, dets, t, tc, opt ? { ...opt, embed } : undefined); };
  for (let i = 0; i <= 15; i++) step([box(0.8 - 0.5 * i / 15)]);   // in
  for (let i = 0; i < 17; i++) step([]);                            // hidden
  for (let i = 0; i < 5; i++) step([box(0.7)]);                     // re-appears outside
  for (let i = 0; i <= 15; i++) step([box(0.7 - 0.4 * i / 15)]);   // walks in again
  for (let i = 0; i < 5; i++) step([]);
  return { day, pipe };
}

test("stepCam without re-ID counts the re-appearing person twice (baseline, unchanged behaviour)", () => {
  const { day } = doorScenario(null);
  assert.equal(day.in, 2);
});

test("stepCam with re-ID revives the lost id and suppresses the second 'in' within the window", () => {
  const { day, pipe } = doorScenario({ reid: true, reidCfg: { CROSS_WINDOW_MS: 10000 } });
  assert.equal(day.in, 1, "counted once");
  assert.equal(pipe.reid.stats.revived, 1);
  assert.equal(day.dedup.revived, 1);
  assert.equal(day.dedup.suppressed, 1);
  assert.ok(pipe.reid.stats.embeds <= 60, "embed budget respected: " + pipe.reid.stats.embeds);
  // the gallery is plain memory: nothing in `day` (which is persisted) holds a vector
  assert.ok(!JSON.stringify(day).includes("emb"), "no embeddings in the persisted day");
});

test("re-ID respects the per-frame budget K", () => {
  const day = S.newDay("2026-11-06"), pipe = S.newPipe(), cam = { slot: "c1", role: "both", line: null, zones: [] };
  let calls = 0, t = 1e12;
  const embed = () => { calls++; return person(calls); };
  for (let f = 0; f < 10; f++) {
    const before = calls; t += 100;
    S.stepCam(pipe, cam, day, Array.from({ length: 8 }, (_, i) => ({ x: i * 0.12, y: 0.3, w: 0.08, h: 0.4, score: 0.9 })), t, tc, { reid: true, embed, reidCfg: { K: 2 } });
    assert.ok(calls - before <= 2, `frame ${f}: ${calls - before} embeds`);
  }
  assert.equal(pipe.reid.gal.size, 8, "gallery filled over several frames, K at a time");
});

test("staffStep flags a person after X ms in the staff zone", () => {
  const st = S.newStaff(), zone = { x: 0.75, y: 0, w: 0.25, h: 1 };
  const inZ = [{ id: 1, foot: { x: 0.9, y: 0.7 } }], out = [{ id: 1, foot: { x: 0.2, y: 0.7 } }];
  let fresh = [];
  for (let i = 0; i < 29; i++) fresh = fresh.concat(S.staffStep(st, zone, inZ, 100, 3000));
  assert.deepEqual(fresh, []);
  assert.deepEqual(S.staffStep(st, zone, inZ, 100, 3000), [1]);
  assert.deepEqual(S.staffStep(st, zone, inZ, 100, 3000), [], "flagged once");
  assert.ok(st.flagged.has(1));
  assert.deepEqual(S.staffStep(st, zone, out, 100, 3000), []);
  assert.deepEqual(S.staffStep(st, null, inZ, 100, 3000), [], "no zone -> off");
  assert.deepEqual(S.staffStep(S.newStaff(), zone, inZ, 5000, 3000), [], "one huge dt is clamped to 1 s");
});

test("stepCam staff exclusion: flagged staff no longer count on the line, in zones or in obs (heatmap)", () => {
  const day = S.newDay("2026-11-06"), pipe = S.newPipe();
  const cam = { slot: "c1", name: "ร้าน", role: "both", line: LINE, zones: [{ id: "z1", name: "ชั้นวาง", x: 0, y: 0, w: 0.4, h: 1 }], staffZone: { x: 0.75, y: 0, w: 0.25, h: 1 } };
  let t = new Date(2026, 10, 6, 10).getTime(), r, seenObs = 0;
  const step = (dets, extra) => { t += 100; r = S.stepCam(pipe, cam, day, dets, t, tc, { staffMs: 3000, ...extra }); return r; };
  for (let i = 0; i < 40; i++) step([box(0.9)]);                         // 4 s behind the counter
  assert.equal(day.staff, 1);
  for (let i = 0; i <= 20; i++) { step([box(0.9 - 0.7 * i / 20)]); seenObs += r.obs.length; }
  for (let i = 0; i < 30; i++) { step([box(0.2)]); seenObs += r.obs.length; } // stands in z1
  assert.equal(day.in, 0, "staff crossing not counted");
  assert.equal(seenObs, 0, "staff excluded from obs (zones + heatmap)");
  assert.ok(!day.zones["c1:z1"] || day.zones["c1:z1"].visits === 0, "no zone visit");
  assert.ok(pipe.lastSeen[0].staff, "overlay can label the track as staff");
  // a customer still counts
  const day2 = S.newDay("2026-11-06"), p2 = S.newPipe();
  for (let i = 0; i <= 20; i++) { t += 100; S.stepCam(p2, cam, day2, [box(0.7 - 0.5 * i / 20)], t, tc, { staffMs: 3000 }); }
  assert.equal(day2.in, 1);
  assert.equal(day2.staff, 0);
});

test("queueWait / slaStep measure the real wait and count each breach once", () => {
  const live = { 1: { t0: 0, last: 0, counted: true }, 2: { t0: 5000, last: 0, counted: true } };
  assert.deepEqual(S.queueWait(live, 20000), { n: 2, maxWaitMs: 20000 });
  assert.equal(S.slaStep(live, 12000, 10000), 1);
  assert.equal(S.slaStep(live, 13000, 10000), 0, "same person not counted twice");
  assert.equal(S.slaStep(live, 16000, 10000), 1);
  assert.equal(S.slaStep(live, 99999, 0), 0, "0 = off");
  assert.deepEqual(S.queueWait(undefined, 1), { n: 0, maxWaitMs: 0 });
});

test("hourly occupancy is tracked; ensureDay upgrades old days without touching values", () => {
  const d = S.newDay("2026-11-06"), at = h => new Date(2026, 10, 6, h, 10).getTime();
  S.applyCrossing(d, "in", at(10)); S.applyCrossing(d, "in", at(10)); S.applyCrossing(d, "out", at(11));
  assert.equal(d.hourlyOcc[10], 2); assert.equal(d.hourlyOcc[11], 1);
  const old = { date: "2026-11-01", in: 3, out: 1, occ: 2, peak: 2, hourly: { in: Array(24).fill(0), out: Array(24).fill(0) }, zones: {} };
  const e = S.ensureDay({ ...old });
  assert.equal(e.in, 3); assert.equal(e.hourlyOcc.length, 24); assert.equal(e.staff, 0); assert.deepEqual(e.dedup, { suppressed: 0, revived: 0 });
});

test("buildHourlyCsv lists every hour between first and last activity with target columns", () => {
  const d = S.newDay("2026-11-06");
  d.hourly.in[9] = 4; d.hourly.out[9] = 1; d.hourly.in[11] = 6; d.hourly.out[11] = 5; d.hourlyQ[11] = 3; d.hourlyOcc[11] = 7;
  const csv = S.buildHourlyCsv([d], 5).replace(/^﻿/, "").split("\n");
  assert.equal(csv.length, 1 + 3, "09, 10 (zero) and 11");
  assert.match(csv[1], /^2026-11-06,09:00–09:59,4,1,3,3,0,0,5,ไม่$/);
  assert.match(csv[2], /^2026-11-06,10:00–10:59,0,0,0,3,0,0,5,ไม่$/);
  assert.match(csv[3], /^2026-11-06,11:00–11:59,6,5,1,4,7,3,5,ใช่$/);
  assert.ok(!/ใช่|ไม่/.test(S.buildHourlyCsv([d], 0).split("\n")[1]), "no target -> empty target columns");
  // the main CSV keeps its old columns (new ones appended at the end)
  assert.match(S.buildCsv([d], ""), /สรุปรายวัน\n.*อัตราการซื้อโดยประมาณ \(%\),พนักงานที่ไม่นับ/);
});

test("daySummary gives short Thai lines", () => {
  assert.deepEqual(S.daySummary(S.newDay("2026-11-06")), ["ยังไม่มีคนเข้า–ออกวันนี้"]);
  const d = S.newDay("2026-11-06");
  d.in = 40; d.out = 30; d.peak = 12; d.peakAt = new Date(2026, 10, 6, 12, 40).getTime(); d.maxQueue = 5; d.slaBreach = 2; d.staff = 1;
  d.hourly.in[10] = 10; d.hourly.in[12] = 25; d.hourly.in[13] = 5;
  d.zones = { "c1:z1": { name: "ชั้นวาง", visits: 10, dwellSum: 800000, dwellN: 10, peak: 3 }, "c1:z2": { name: "แคชเชียร์", visits: 6, dwellSum: 1, dwellN: 1, peak: 1 } };
  d.dedup = { suppressed: 3, revived: 1 };
  const s = S.daySummary(d, { cashierId: "c1:z2", hourlyTarget: 10, slaSec: 300, staffOffset: 2, nowHour: 13, clock: () => "12:40" });
  const all = s.join("\n");
  assert.match(all, /เข้าร้าน 40 คน · คนเข้ามากสุดช่วง 12:00–13:00 \(25 คน\)/);
  assert.match(all, /สูงสุด 12 คน เวลา 12:40/);
  assert.match(all, /อัตราการซื้อโดยประมาณ 15% — ต่ำ/);
  assert.match(all, /โซนที่ลูกค้าอยู่นานสุด: ชั้นวาง \(เฉลี่ย 1 นาที 20 วิ\)/);
  assert.match(all, /รอนานเกิน 5 นาที 2 ครั้ง/);
  assert.match(all, /ถึงเป้าคนเข้า 10 คน\/ชม\. 2 จาก 4 ชั่วโมง/);
  assert.match(all, /ตรวจพบจากโซนพนักงาน 1 คน · หักจากคนในร้าน 2 คน/);
  assert.match(all, /ไม่นับข้ามเส้นซ้ำ 3 ครั้ง/);
  assert.ok(s.every(x => x.length < 120), "short lines");
});
