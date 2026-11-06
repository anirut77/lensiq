"use strict";
// signage.js: updateTracks บน LQTrack — id คงที่เมื่อถูกบัง/สวนกัน, OTS ไม่นับซ้ำ, รับ box พิกเซลหรือ 0..1
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../signage.js");

const face = (x, y, w = 0.12, h = 0.16, extra = {}) => ({ box: { x, y, width: w, height: h }, look: true, happy: false, ...extra });

test("exports keep their shape for existing callers", () => {
  for (const k of ["SG", "newTracker", "updateTracks", "trackProfile", "dominantSegment", "recordFrame", "finalizeTrack", "newStats", "newPlay", "selectAd", "iou"])
    assert.ok(k in S, k);
  const T = S.newTracker();
  assert.deepEqual(T.tracks, []);
  const r = S.updateTracks(T, [face(0.1, 0.1, 0.12, 0.16, { age: 30, male: 0.9 })], 1000);
  assert.deepEqual(Object.keys(r).sort(), ["ended", "present"]);
  const t = r.present[0];
  assert.equal(t.id, "T1");
  for (const k of ["box", "first", "lastSeen", "frames", "lookFrames", "attnS", "happyFrames", "ageSum", "ageN", "maleSum", "maleN", "lookNow", "happyNow"]) assert.ok(k in t, k);
  assert.equal(t.frames, 1); assert.equal(t.ageN, 1); assert.equal(t.lookNow, true);
  assert.deepEqual(t.box, { x: 0.1, y: 0.1, width: 0.12, height: 0.16 });
});

test("steady face: one id, accumulators grow, ended after it leaves", () => {
  const T = S.newTracker(), stats = S.newStats(0);
  let now = 0;
  for (let i = 0; i < 10; i++) { now += 200; const r = S.updateTracks(T, [face(0.3 + i * 0.005, 0.3)], now); assert.equal(r.present[0].id, "T1"); }
  assert.equal(T.tracks[0].frames, 10);
  assert.ok(T.tracks[0].attnS > 1.5);
  let ended = [];
  for (let i = 0; i < 30 && !ended.length; i++) { now += 200; ended = S.updateTracks(T, [], now).ended; }
  assert.equal(ended.length, 1); assert.equal(ended[0].id, "T1");
  assert.ok(now - ended[0].lastSeen > S.SG.TRACK_TTL_MS);
  assert.equal(T.tracks.length, 0);
  assert.equal(S.finalizeTrack(stats, ended[0]), true);
  assert.equal(stats.totals.ots, 1);
});

function occlusionRun(updateTracks) {
  const T = S.newTracker(), stats = S.newStats(0), play = S.newPlay("ad1");
  let now = 0, ids = new Set();
  const step = dets => { const r = updateTracks(T, dets, now); r.present.forEach(t => ids.add(t.id)); r.ended.forEach(t => S.finalizeTrack(stats, t)); S.recordFrame(stats, play, r.present, 0.2); };
  for (let i = 0; i < 6; i++) { now += 200; step([face(0.3, 0.3)]); }
  for (let ms = 0; ms < 1200; ms += 200) { now += 200; step([]); } // บัง 1.2 วิ
  for (let i = 0; i < 6; i++) { now += 200; step([face(0.4, 0.3)]); } // กลับมาห่าง 0.1 ของความกว้างภาพ
  for (let i = 0; i < 25; i++) { now += 200; step([]); }
  return { ids, stats };
}

test("occluded 1.2 s then back 0.1 width away keeps its id; OTS counted once", () => {
  const { ids, stats } = occlusionRun(S.updateTracks);
  assert.deepEqual([...ids], ["T1"]);
  assert.equal(stats.ads.ad1.ots, 1);
  assert.equal(stats.totals.ots, 1);
});

test("legacy IoU-only tracker would have double-counted the same scenario", () => {
  // อ้างอิงพฤติกรรมเดิม (IoU ≥ 0.3 อย่างเดียว) เพื่อยืนยันว่าเคสทดสอบนี้คือเคสที่เคยนับซ้ำ
  const a = face(0.3, 0.3).box, b = face(0.4, 0.3).box;
  assert.ok(S.iou(a, b) < S.SG.IOU_MIN);
});

test("revival also works after the main TTL (face in the lost pool)", () => {
  const T = S.newTracker();
  let now = 0;
  for (let i = 0; i < 5; i++) { now += 200; S.updateTracks(T, [face(0.3, 0.3)], now); }
  now += 2400;
  const r = S.updateTracks(T, [face(0.38, 0.32)], now);
  assert.equal(r.present[0].id, "T1");
  assert.equal(r.ended.length, 0);
  assert.equal(r.present[0].frames, 6);
});

test("two faces crossing keep their ids", () => {
  const T = S.newTracker();
  let now = 0;
  const seen = { A: new Set(), B: new Set() };
  for (let i = 0; i <= 20; i++) {
    now += 200;
    const xa = 0.1 + i * 0.035, xb = 0.8 - i * 0.035; // สวนกันกลางภาพ (y ต่างกันเล็กน้อยใช้แยกว่าใครเป็นใคร)
    const r = S.updateTracks(T, [face(xb, 0.32, 0.12, 0.16, { tag: "B" }), face(xa, 0.3, 0.12, 0.16, { tag: "A" })].map(d => ({ ...d })), now);
    r.present.forEach(t => { (t.box.y === 0.3 ? seen.A : seen.B).add(t.id); });
    assert.equal(r.present.length, 2);
  }
  assert.equal(seen.A.size, 1); assert.equal(seen.B.size, 1);
  assert.notEqual([...seen.A][0], [...seen.B][0]);
});

test("pixel boxes with W=640,H=480 behave like normalised boxes", () => {
  const W = 640, H = 480;
  const px = d => ({ ...d, box: { x: d.box.x * W, y: d.box.y * H, width: d.box.width * W, height: d.box.height * H } });
  const script = [];
  for (let i = 0; i < 6; i++) script.push([face(0.3, 0.3), face(0.7, 0.4)]);
  for (let i = 0; i < 6; i++) script.push([face(0.7, 0.4)]);
  for (let i = 0; i < 6; i++) script.push([face(0.4, 0.3), face(0.7, 0.4)]);
  for (let i = 0; i < 25; i++) script.push([]);
  const run = (map, size) => {
    const T = S.newTracker(), out = [];
    let now = 0;
    for (const dets of script) {
      now += 200;
      const r = S.updateTracks(T, dets.map(map), now, S.SG, size);
      out.push(r.present.map(t => t.id + ":" + t.frames).join(",") + "|" + r.ended.map(t => t.id + ":" + t.frames + ":" + t.lookFrames).join(","));
    }
    return out;
  };
  const norm = run(d => d, undefined), pix = run(px, { W, H });
  assert.deepEqual(pix, norm);
  // box ที่เก็บในแทร็กยังเป็นพิกเซล (ใช้วาดบน overlay)
  const T = S.newTracker();
  const r = S.updateTracks(T, [px(face(0.3, 0.3))], 0, S.SG, { W, H });
  assert.equal(r.present[0].box.width, 0.12 * W);
});

test("dominantSegment / recordFrame still work on tracker output", () => {
  const T = S.newTracker(), stats = S.newStats(0), play = S.newPlay("x");
  let now = 0, r;
  for (let i = 0; i < 4; i++) { now += 200; r = S.updateTracks(T, [face(0.2, 0.2, 0.12, 0.16, { age: 25, male: 0.9, happy: true })], now); S.recordFrame(stats, play, r.present, 0.2); }
  const seg = S.dominantSegment(T.tracks);
  assert.equal(seg.n, 1); assert.equal(seg.band, "18_34"); assert.equal(seg.gender, "male"); assert.equal(seg.mood, "happy");
  assert.equal(stats.ads.x.ots, 1); assert.equal(stats.ads.x.viewers, 1);
});
