"use strict";
// tests/unit/exam.test.js — LENSIQ Exam pure logic (lensiq-exam.js): debounce / persistence / cooldown gates, decaying
// risk, room-event suppression, accommodation thresholds, head pose from 68 landmarks, calibration, lighting, frozen feed,
// Mode B lab monitor (camera + browser signals), Mode A hall geometry + monitor, message allowlist, dashboard board.
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../../lensiq-exam.js");

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} (±${eps})`);
/** run a monitor over [t0, t1) every `dt` ms with obs(t) and collect events */
function run(mon, t0, t1, dt, obs) { const out = []; for (let t = t0; t < t1; t += dt) out.push(...mon.frame(t, obs(t))); return out; }
const face = (yaw = 0, pitchN = 0.45, mar = 0.05) => ({ yaw, pitchN, mar });
const ok = { ok: true, code: "ok", score: 90 };

test("gate: k of n debounce, persistence stages, one fire per episode, end report", () => {
  const g = E.createGate({ k: 3, n: 5, stages: [{ ms: 1000, lvl: "watch" }, { ms: 3000, lvl: "check" }], cooldownMs: 0 });
  const seq = [1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const out = seq.map((on, i) => g.push(i * 500, !!on));
  assert.equal(out[2].active, false, "2 of 3 samples is not 3 of 5");
  assert.equal(out[3].active, true, "third positive in 5 samples -> active");
  const fires = out.flatMap((r, i) => r.fire.map(f => [i, f.lvl]));
  assert.deepEqual(fires, [[5, "watch"], [9, "check"]], "watch after 1 s of activity (from sample 3), check after 3 s");
  const end = out.find(r => r.ended);
  assert.ok(end && end.ended.fired && end.ended.dur >= 3000, "episode end reported with its duration");
});

test("gate: cooldown holds a re-fire of the same stage, a new episode after the cooldown fires again", () => {
  const g = E.createGate({ k: 1, n: 1, stages: [{ ms: 0, lvl: "check" }], cooldownMs: 60000 });
  assert.equal(g.push(0, true).fire.length, 1);
  g.push(1000, false);
  const r = g.push(2000, true);
  assert.equal(r.fire.length, 0); assert.equal(r.held, 1, "held inside the 60 s cooldown");
  g.push(3000, false);
  assert.equal(g.push(70000, true).fire.length, 1, "after the cooldown");
  assert.equal(g.held, 1);
});

test("risk: exponential decay with half-life, levels Info / Watch / Check, never-alone contributions", () => {
  const r = E.createRisk({ halfLifeMs: 60000, aloneWindowMs: 120000 });
  r.add("7", 0, E.POINTS.check);
  close(r.score("7", 0), 2.5); assert.equal(r.level("7", 0), "check");
  close(r.score("7", 60000), 1.25); assert.equal(r.level("7", 60000), "watch");
  assert.equal(r.level("7", 60000 * 4), "info"); assert.equal(r.level("7", 60000 * 9), "ok");
  // a low-weight "alone:false" signal (gaze / head toward neighbour) can never raise a seat by itself
  r.add("8", 0, 5, { alone: false });
  assert.equal(r.score("8", 0), 0, "gaze alone counts for nothing");
  r.add("8", 1000, 0.3);
  assert.ok(r.score("8", 1000) > 5, "counts once another signal exists in the window");
  const s = r.series("7", 120000, { spanMs: 120000, n: 3 });
  assert.equal(s.length, 3); close(s[0], 2.5); close(s[2], 0.625);
  assert.equal(r.score("nobody", 0), 0);
  assert.equal(E.levelOf(0.1), "ok"); assert.equal(E.levelOf(0.15), "info"); assert.equal(E.levelOf(1), "watch"); assert.equal(E.levelOf(2.5), "check");
});

test("room monitor: many seats at once -> suppression window; one seat repeating does not count; manual mute", () => {
  const m = E.createRoomMonitor({ windowMs: 3000, frac: 0.4, min: 3, holdMs: 20000 });
  assert.equal(m.note("1", 0, 10), false); assert.equal(m.note("1", 500, 10), false); assert.equal(m.note("2", 800, 10), false);
  assert.equal(m.note("3", 1000, 10), false, "3 seats < 40% of 10");
  assert.equal(m.note("4", 1200, 10), true, "4 distinct seats in 3 s = 40% -> room event");
  assert.ok(m.suppressed(15000)); assert.ok(!m.suppressed(21300));
  const m2 = E.createRoomMonitor();
  m2.note("1", 0, 4); m2.note("2", 100, 4);
  assert.equal(m2.note("1", 5000, 4), false, "notes older than the window are dropped");
  m2.mute(10000, 60000); assert.ok(m2.suppressed(69999)); assert.ok(!m2.suppressed(70001));
});

test("accommodation profiles raise thresholds without any diagnosis field", () => {
  assert.deepEqual(E.cleanProfile({ noFaceX: 9, ticX: 0.2, diagnosis: "x", gazeOff: 1 }), { gazeOff: true, noFaceX: 3, readAloud: false, breaks: false, ticX: 1 });
  const c = E.applyAccommodation({}, { noFaceX: 2, readAloud: true, gazeOff: true, ticX: 2, breaks: true });
  assert.equal(c.noFaceWatchMs, 20000); assert.equal(c.noFaceCheckMs, Infinity, "breaks: no-face never reaches Check");
  assert.equal(c.mouth, false); assert.equal(c.gaze, false);
  assert.equal(c.turnMs, 16000); assert.equal(c.turnRepeat, 6); assert.equal(c.yawDeg, 45); assert.equal(c.pitchDeg, 35);
  assert.equal(c.emptyMs, 60000); assert.equal(c.leanMs, 8000);
  const d = E.applyAccommodation({}, null);
  assert.equal(d.noFaceWatchMs, E.DEFAULTS.noFaceWatchMs); assert.equal(d.turnMs, 8000);
  assert.ok(E.isPlainProfile({})); assert.ok(!E.isPlainProfile({ readAloud: true }));
});

test("head pose: poseFrom68 inverts synth68 (yaw degrees, pitch vs baseline, mouth ratio)", () => {
  const box = { x: 100, y: 80, w: 200, h: 240 };
  for (const yaw of [-50, -35, -10, 0, 20, 40]) for (const pitch of [-15, 0, 25, 30]) {
    const p = E.poseFrom68(E.synth68(box, yaw, pitch, 0.4));
    close(p.yaw, yaw, 0.01); close(E.pitchDeg(p.pitchN, 0.45), pitch, 0.01); close(p.mar, 0.4, 1e-9);
  }
  assert.equal(E.poseFrom68([]), null);
  // face-api style {x, y} objects and [x, y] arrays both work
  const arr = E.synth68(box, 30).map(q => [q.x, q.y]);
  close(E.poseFrom68(arr).yaw, 30, 0.01);
});

test("calibration: median baseline from single-face frames; fails honestly with too few", () => {
  const s = [...Array(20)].map((_, i) => ({ faces: 1, yaw: 8 + (i % 3), pitchN: 0.5 }));
  const b = E.calibrate(s.concat([{ faces: 0 }, { faces: 2, yaw: 50, pitchN: 0.3 }]));
  assert.ok(b.ok); assert.equal(b.yaw0, 9); assert.equal(b.pitchN0, 0.5);
  assert.equal(E.calibrate(s.slice(0, 3)).reason, "short");
  const f = E.calibrate([...Array(10)].map((_, i) => ({ faces: i < 4 ? 1 : 0, yaw: 0, pitchN: 0.45 })));
  assert.equal(f.ok, false); assert.equal(f.reason, "face"); close(f.onePct, 0.4);
});

test("lighting verdict, frozen feed, virtual camera labels", () => {
  const good = { mean: 128, p50: 125, dark: 0.02, clip: 0.01, cellMax: 180, cellMin: 60, contrast: 120, sharp: 6 };
  assert.equal(E.lightingVerdict(good).code, "ok"); assert.ok(E.lightingVerdict(good).score >= 90);
  assert.equal(E.lightingVerdict({ ...good, mean: 20, p50: 18 }).code, "dark");
  assert.equal(E.lightingVerdict({ ...good, clip: 0.4 }).code, "bright");
  assert.equal(E.lightingVerdict({ ...good, cellMax: 240, clip: 0.08, p50: 70 }).code, "backlight");
  assert.equal(E.lightingVerdict({ ...good, sharp: 1 }).code, "blur");
  assert.equal(E.lightingVerdict(null).ok, false);
  const fz = E.createFrozen({ ms: 4000, eps: 0.6 }), th = new Float32Array(16).fill(100);
  assert.equal(fz.push(0, th), false); assert.equal(fz.push(2000, th), false); assert.equal(fz.push(6000, th), true, "identical frames for 4 s");
  const moved = th.map((v, i) => v + (i % 2 ? 9 : -9));
  assert.equal(fz.push(7000, moved), false, "a changing frame resets");
  for (const l of ["OBS Virtual Camera", "ManyCam Virtual Webcam", "Snap Camera", "XSplit VCam"]) assert.ok(E.isVirtualCamLabel(l), l);
  for (const l of ["FaceTime HD Camera", "Integrated Webcam", "Logitech BRIO", ""]) assert.ok(!E.isVirtualCamLabel(l), l);
});

test("lab: no face -> gentle prompt at 5 s, Watch at 10 s, Check at 30 s; poor light -> 'fix setup', never an alert", () => {
  const m = E.createLabMonitor();
  const ev = run(m, 0, 32000, 250, () => ({ faces: [], quality: ok }));
  const lv = ev.filter(e => e.sig === "noface").map(e => [e.lvl, Math.round(e.t / 1000)]);
  assert.deepEqual(lv.map(x => x[0]), ["prompt", "watch", "check"]);
  assert.ok(lv[0][1] >= 5 && lv[0][1] <= 6 && lv[1][1] >= 10 && lv[1][1] <= 11 && lv[2][1] >= 30 && lv[2][1] <= 31, JSON.stringify(lv));
  assert.ok(ev.find(e => e.lvl === "prompt").local, "the prompt stays on the candidate's device");
  const back = run(m, 32000, 33000, 250, () => ({ faces: [face()], quality: ok }));
  assert.ok(back.some(e => e.sig === "noface" && e.lvl === "end" && e.local), "end clears the prompt");
  // the same 40 s with a dark camera: only 'setup', no no-face alert
  const d = E.createLabMonitor();
  const ev2 = run(d, 0, 40000, 250, () => ({ faces: [], quality: { ok: false, code: "dark" } }));
  assert.deepEqual([...new Set(ev2.map(e => e.sig + ":" + e.lvl))], ["setup:setup"]);
  assert.equal(ev2[0].code, "dark");
  // accommodation x2: Watch only after 20 s
  const a = E.createLabMonitor(E.applyAccommodation({}, { noFaceX: 2 }));
  const ev3 = run(a, 0, 19000, 250, () => ({ faces: [], quality: ok }));
  assert.ok(!ev3.some(e => e.lvl === "watch"));
});

test("lab: multiple faces >= 3 s in 3 of 5 samples -> Check; one flicker frame is ignored", () => {
  const m = E.createLabMonitor();
  const flick = run(m, 0, 10000, 250, t => ({ faces: t % 2000 === 0 ? [face(), face()] : [face()], quality: ok }));
  assert.ok(!flick.some(e => e.sig === "multiface"), "1 of 8 frames with 2 faces");
  const ev = run(m, 10000, 14000, 250, () => ({ faces: [face(), face()], quality: ok }));
  const mf = ev.filter(e => e.sig === "multiface");
  assert.equal(mf.length, 1); assert.equal(mf[0].lvl, "check"); assert.ok(mf[0].t - 10000 >= 3000); assert.equal(mf[0].n, 2);
});

test("lab: head turned vs baseline >= 8 s -> Info; 3 turns in 5 min -> Watch; needs a calibrated baseline", () => {
  const m = E.createLabMonitor();
  assert.ok(!run(m, 0, 20000, 250, () => ({ faces: [face(60)], quality: ok })).some(e => e.sig === "headturn"), "no baseline -> head turn not monitored");
  m.setBaseline({ ok: true, yaw0: 10, pitchN0: 0.45 });
  assert.ok(!run(m, 20000, 40000, 250, () => ({ faces: [face(40)], quality: ok })).some(e => e.sig === "headturn"), "30° from the 10° baseline is within 35°");
  const turns = [];
  for (let k = 0; k < 3; k++) {
    const t0 = 50000 + k * 60000;
    turns.push(...run(m, t0, t0 + 9000, 250, () => ({ faces: [face(50)], quality: ok })));
    run(m, t0 + 9000, t0 + 12000, 250, () => ({ faces: [face(10)], quality: ok }));
  }
  const ht = turns.filter(e => e.sig === "headturn");
  assert.deepEqual(ht.map(e => e.lvl), ["info", "info", "info", "watch"]);
  assert.ok(ht[0].dur >= 8000);
  // pitch down 30° vs baseline counts too
  const p = E.createLabMonitor(); p.setBaseline({ ok: true, yaw0: 0, pitchN0: 0.45 });
  assert.ok(run(p, 0, 9000, 250, () => ({ faces: [face(0, 0.45 + 30 / 120)], quality: ok })).some(e => e.sig === "headturn"));
});

test("lab: phone conf >= 0.6 in 3 of 5 detector frames -> Check; objects follow the exam's allowed list; mouth = Info", () => {
  const m = E.createLabMonitor();
  const low = run(m, 0, 3000, 250, () => ({ faces: [face()], objects: [{ cls: "phone", score: 0.55 }], quality: ok }));
  assert.ok(!low.some(e => e.sig === "phone"));
  const ev = run(m, 3000, 5000, 250, () => ({ faces: [face()], objects: [{ cls: "phone", score: 0.7 }], quality: ok }));
  const ph = ev.filter(e => e.sig === "phone");
  assert.equal(ph.length, 1); assert.equal(ph[0].lvl, "check"); assert.equal(ph[0].t, 3500, "third positive detector frame");
  // frames without a detector run (objects undefined) do not count
  const m2 = E.createLabMonitor(); let n = 0;
  for (let t = 0; t < 4000; t += 250) n += m2.frame(t, { faces: [face()], objects: t % 1000 === 0 ? [{ cls: "phone", score: 0.9 }] : undefined, quality: ok }).filter(e => e.sig === "phone").length;
  assert.equal(n, 1, "4 detector frames, all positive -> one Check");
  const b = E.createLabMonitor({ allowBook: true });
  assert.ok(!run(b, 0, 3000, 250, () => ({ faces: [face()], objects: [{ cls: "book", score: 0.9 }], quality: ok })).some(e => e.sig === "object"), "book allowed");
  const nb = run(E.createLabMonitor(), 0, 3000, 250, () => ({ faces: [face()], objects: [{ cls: "book", score: 0.9 }], quality: ok })).filter(e => e.sig === "object");
  assert.equal(nb[0].lvl, "watch"); assert.equal(nb[0].what, "book");
  const mm = run(E.createLabMonitor(), 0, 8000, 250, t => ({ faces: [face(0, 0.45, (t / 250) % 2 ? 0.5 : 0.05)], quality: ok })).filter(e => e.sig === "mouth");
  assert.equal(mm.length, 1); assert.equal(mm[0].lvl, "info");
  assert.ok(!run(E.createLabMonitor(E.applyAccommodation({}, { readAloud: true })), 0, 8000, 250, t => ({ faces: [face(0, 0.45, (t / 250) % 2 ? 0.5 : 0.05)], quality: ok })).some(e => e.sig === "mouth"), "read-aloud");
});

test("lab browser signals: blur < 2 s Info, hidden >= 5 s Watch, fullscreen exit, paste > 50 chars, screens, cooldowns", () => {
  const m = E.createLabMonitor();
  m.browser(0, "blur"); assert.deepEqual(m.browser(1500, "focus").map(e => e.lvl), ["info"]);
  m.browser(10000, "blur"); m.browser(10010, "hidden");
  assert.deepEqual(m.browser(16000, "visible").map(e => [e.sig, e.lvl, e.dur]), [["away", "watch", 5990]]);
  assert.deepEqual(m.browser(16010, "focus"), [], "focus after hidden is the same absence");
  m.browser(20000, "hidden"); assert.equal(m.browser(23000, "visible")[0].lvl, "info");
  const fs = m.browser(30000, "fsexit"); assert.equal(fs[0].lvl, "watch"); assert.ok(fs[0].prompt);
  assert.deepEqual(m.browser(40000, "fsexit"), [], "30 s cooldown");
  assert.equal(m.browser(50000, "paste", { len: 12 })[0].lvl, "info");
  const p = m.browser(51000, "paste", { len: 400 }); assert.equal(p[0].lvl, "watch"); assert.equal(p[0].n, 400);
  assert.equal(m.browser(52000, "copy").length, 1); assert.equal(m.browser(53000, "cut").length, 0, "clip events share a 10 s cooldown");
  assert.equal(m.browser(60000, "screens", { extended: false }).length, 0);
  assert.equal(m.browser(60000, "screens", { extended: true })[0].lvl, "watch");
  m.browser(70000, "offline"); assert.equal(m.browser(80000, "online")[0].dur, 10000);
  assert.equal(m.browser(90000, "reload")[0].sig, "reload");
  assert.equal(m.browser(90000, "virtualcam")[0].lvl, "watch");
  assert.deepEqual(m.browser(90000, "nonsense"), []);
});

test("hall geometry: point in polygon, area, box fraction, nearest seat for overlaps, grid seats", () => {
  const sq = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.ok(E.pointInPoly(0.5, 0.5, sq)); assert.ok(!E.pointInPoly(1.5, 0.5, sq));
  const tri = [[0, 0], [2, 0], [0, 2]];
  close(E.polyArea(tri), 2); assert.ok(E.pointInPoly(0.4, 0.4, tri)); assert.ok(!E.pointInPoly(1.5, 1.5, tri));
  close(E.boxFracInPoly({ x: 0.5, y: 0, w: 1, h: 1 }, sq), 0.5);
  const g = E.gridSeats({ x: 0, y: 0, w: 1, h: 0.5 }, 2, 4, ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]);
  assert.equal(g.length, 8); assert.equal(g[5].id, "B2");
  assert.equal(E.seatOf([0.3, 0.1], g).id, "A2"); assert.equal(E.seatOf([0.3, 0.9], g), null);
  const ov = [{ id: "1", poly: [[0, 0], [0.6, 0], [0.6, 1], [0, 1]] }, { id: "2", poly: [[0.4, 0], [1, 0], [1, 1], [0.4, 1]] }];
  assert.equal(E.seatOf([0.45, 0.5], ov).id, "1", "overlap -> nearest centroid"); assert.equal(E.seatOf([0.58, 0.5], ov).id, "2");
  assert.deepEqual(E.cleanSeats([{ id: "1", poly: sq }, { id: "1", poly: sq }, { id: "x y", poly: sq }, { id: "3", poly: [[0, 0], [2, 0], [0, 1]] }]).map(s => s.id), ["1"]);
});

test("hall monitor: empty seat (leave / back with duration), early leave, extra person, lean, phone, aisle + walk mode", () => {
  const seats = E.gridSeats({ x: 0, y: 0.5, w: 1, h: 0.5 }, 1, 4); // 4 seats in one row, each 0.25 wide
  const at = (i, dx = 0, w = 0.12) => ({ x: i * 0.25 + 0.065 + dx, y: 0.55, w, h: 0.4, score: 0.9 });
  const all = () => [0, 1, 2, 3].map(i => at(i));
  const m = E.createHallMonitor(seats, { minLeaveMin: 30 });
  const T = [];
  const step = (t0, t1, persons, o, phones) => { for (let t = t0; t < t1; t += 250) T.push(...m.frame(t, { persons: persons(t), phones: phones ? phones(t) : [] }, Object.assign({ elapsedMin: t / 60000 }, o || {}))); };
  step(0, 2000, all);
  assert.equal(T.length, 0, "everyone seated -> no events");
  // seat 2 leaves for 200 s (before the 30-min minimum) and comes back
  step(2000, 204000, () => all().filter((_, i) => i !== 1));
  step(204000, 206000, all);
  const s2 = T.filter(e => e.seat === "2").map(e => e.sig + ":" + e.lvl);
  assert.deepEqual(s2, ["empty:info", "early:watch", "back:info"]);
  const back = T.find(e => e.sig === "back"); assert.ok(back.dur >= 200000, "duration away " + back.dur);
  // extra person in seat 3 for 16 s -> Watch at 5 s, Check at 15 s; suppressed in walk mode
  T.length = 0;
  step(206000, 223000, () => all().concat([at(2, 0.05)]));
  assert.deepEqual(T.filter(e => e.sig === "extra").map(e => e.lvl), ["watch", "check"]);
  T.length = 0;
  step(400000, 420000, () => all().concat([at(2, 0.05)]), { walk: true });
  assert.ok(!T.some(e => e.sig === "extra"), "walk mode");
  // seat 1 leans into seat 2: box shifted right so > 25% lies in seat 2
  T.length = 0;
  step(500000, 506000, () => [{ x: 0.12, y: 0.55, w: 0.2, h: 0.4, score: 0.9 }, at(1), at(2), at(3)]);
  const ln = T.filter(e => e.sig === "lean"); assert.equal(ln.length, 1); assert.equal(ln[0].seat, "1");
  // phone over seat 4 in 3 of 5 frames -> Check (low-confidence phones ignored)
  T.length = 0;
  step(600000, 602000, all, {}, () => [{ x: 0.85, y: 0.7, w: 0.04, h: 0.06, score: 0.45 }]);
  assert.ok(!T.some(e => e.sig === "phone"));
  step(602000, 604000, all, {}, () => [{ x: 0.85, y: 0.7, w: 0.04, h: 0.06, score: 0.8 }]);
  assert.equal(T.filter(e => e.sig === "phone" && e.seat === "4").length, 1);
  // a person standing outside every seat for >= 8 s -> aisle Watch, not in walk mode
  T.length = 0;
  step(700000, 710000, () => all().concat([{ x: 0.45, y: 0.05, w: 0.1, h: 0.4, score: 0.9 }]), { walk: true });
  assert.ok(!T.some(e => e.sig === "aisle"));
  step(710000, 720000, () => all().concat([{ x: 0.45, y: 0.05, w: 0.1, h: 0.4, score: 0.9 }]));
  assert.equal(T.filter(e => e.sig === "aisle").length, 1);
  assert.equal(m.state().seats["2"].occupied, true);
});

test("hall monitor: room-level anomaly suppresses per-seat alerts, phones still pass; manual mute; seat rows are not neighbours", () => {
  const seats = E.gridSeats({ x: 0, y: 0.2, w: 1, h: 0.8 }, 2, 5); // 10 seats, 2 rows
  const at = (i, dx = 0) => { const r = Math.floor(i / 5), c = i % 5; return { x: c * 0.2 + 0.05 + dx, y: 0.2 + r * 0.4 + 0.05, w: 0.1, h: 0.3, score: 0.9 }; };
  const m = E.createHallMonitor(seats, { minLeaveMin: 0 });
  const ev = [];
  for (let t = 0; t < 2000; t += 250) ev.push(...m.frame(t, { persons: [...Array(10).keys()].map(i => at(i)) }, {}));
  // everyone leans right at once (announcement: everyone turns to the door)
  for (let t = 2000; t < 9000; t += 250) ev.push(...m.frame(t, { persons: [...Array(10).keys()].map(i => at(i, 0.09)), phones: t > 4000 ? [{ x: 0.12, y: 0.35, w: 0.03, h: 0.05, score: 0.9 }] : [] }, {}));
  assert.ok(ev.some(e => e.sig === "room"), "room event");
  assert.ok(!ev.some(e => e.sig === "lean"), "per-seat lean alerts suppressed");
  assert.ok(ev.some(e => e.sig === "phone" && e.seat === "1"), "phone is never suppressed");
  assert.ok(m.state().suppressed > 0);
  // a tall box in row 1 overlapping row 2 does not count as leaning (neighbours = same row)
  const m2 = E.createHallMonitor(seats);
  const ev2 = [];
  for (let t = 0; t < 8000; t += 250) ev2.push(...m2.frame(t, { persons: [{ x: 0.05, y: 0.25, w: 0.1, h: 0.7, score: 0.9 }] }, {}));
  assert.ok(!ev2.some(e => e.sig === "lean"));
  // manual mute
  const m3 = E.createHallMonitor(E.gridSeats({ x: 0, y: 0, w: 1, h: 1 }, 1, 2));
  m3.mute(0, 60000);
  const ev3 = [];
  for (let t = 0; t < 20000; t += 250) ev3.push(...m3.frame(t, { persons: [{ x: 0.1, y: 0.2, w: 0.1, h: 0.3, score: 0.9 }, { x: 0.2, y: 0.2, w: 0.1, h: 0.3, score: 0.9 }] }, {}));
  assert.ok(!ev3.some(e => e.sig === "extra"), "muted 60 s");
});

test("messages: strict allowlist — unknown keys, images, names, bad ids rejected; values normalised", () => {
  const ev = { v: 1, type: "ev", room: "HALL2", node: "abc123def456", src: "hall", seat: "12", sig: "phone", lvl: "check", t: 1.7e12 };
  assert.ok(E.cleanMsg(ev).ok);
  assert.equal(E.cleanMsg({ ...ev, frame: "data:image/png;base64,AAAA" }).error, "unknown key frame");
  assert.equal(E.cleanMsg({ ...ev, name: "Somchai" }).ok, false, "no names on events");
  assert.equal(E.cleanMsg({ ...ev, sig: "cheating" }).error, "sig");
  assert.equal(E.cleanMsg({ ...ev, lvl: "guilty" }).error, "lvl");
  assert.equal(E.cleanMsg({ ...ev, seat: "<script>" }).error, "seat");
  assert.equal(E.cleanMsg({ ...ev, room: "ห้อง 1" }).error, "room");
  assert.equal(E.cleanMsg({ ...ev, what: "x".repeat(40) }).error, "what");
  assert.equal(E.cleanMsg({ ...ev, dur: -1 }).error, "dur");
  assert.equal(E.cleanMsg({ ...ev, v: 2 }).ok, false);
  assert.equal(E.cleanMsg(null).ok, false); assert.equal(E.cleanMsg([ev]).ok, false);
  assert.equal(E.cleanMsg({ ...ev, seat: undefined }).msg.seat, "");
  const hb = E.cleanMsg({ v: 1, type: "hb", room: "R", node: "abc123def456", src: "lab", name: " <b>front\n</b> ", seats: ["1", "2"], t: 5, fps: 3.333, q: 80 });
  assert.ok(hb.ok); assert.equal(hb.msg.name, "bfront/b"); assert.equal(hb.msg.fps, 3.3);
  const pr = E.cleanMsg({ v: 1, type: "prof", room: "R", t: 1, profiles: { "7": { readAloud: true, diagnosis: "ADHD" } } });
  assert.deepEqual(pr.msg.profiles["7"], { gazeOff: false, noFaceX: 1, readAloud: true, breaks: false, ticX: 1 }, "diagnosis never travels");
  assert.equal(E.cleanMsg({ v: 1, type: "mute", room: "R", t: 1, ms: 1e7 }).ok, false);
  assert.equal(E.cleanMsg({ ...ev, pad: "x".repeat(9000) }).error, "too large");
});

test("board: queue triage order, dedup, actions need a name, response time, mute, profiles filter, precision", () => {
  const b = E.createBoard({ room: "R1", halfLifeMs: 60000 });
  const ev = (t, seat, sig, lvl, x) => b.ingest(Object.assign({ v: 1, type: "ev", room: "R1", node: "node000001", src: "hall", seat, sig, lvl, t }, x || {}), t);
  assert.equal(ev(1000, "3", "lean", "watch").kind, "alert");
  assert.equal(ev(2000, "5", "phone", "check").kind, "alert");
  assert.equal(ev(3000, "3", "lean", "watch").kind, "bump");
  assert.equal(ev(3500, "4", "empty", "info", { dur: 20000 }).kind, "info");
  assert.equal(ev(3600, "", "setup", "setup", { code: "dark" }).kind, "setup");
  assert.equal(b.ingest({ v: 1, type: "ev", room: "R1", node: "node000001", src: "hall", sig: "phone", lvl: "check", t: 1, image: "x" }).ok, false);
  const q = b.queue(4000);
  assert.deepEqual(q.map(a => a.seat), ["5", "3"], "Check before Watch");
  assert.equal(q[1].n, 2);
  assert.equal(b.levels(2000)["5"].level, "check");
  assert.equal(b.levels(2000 + 60000)["5"].level, "watch", "decays");
  const id5 = q[0].id, id3 = q[1].id;
  assert.equal(b.act(id5, "going", { who: "" }, 5000), false, "no invigilator name -> refused");
  assert.equal(b.act(id5, "verdict", { who: "A" }, 5000), false);
  assert.ok(b.act(id5, "going", { who: "อ.สมศรี" }, 32000));
  assert.ok(b.act(id5, "escalate", { who: "อ.สมศรี", note: "เห็นโทรศัพท์บนโต๊ะ" }, 60000));
  assert.ok(b.act(id3, "note", { who: "B", note: "ok" }, 9000));
  assert.ok(b.act(id3, "noissue", { who: "B" }, 21000));
  assert.equal(b.queue(70000).length, 0);
  const s = b.summary();
  assert.equal(s.alerts, 2); assert.equal(s.acknowledged, 2); assert.equal(s.dismissed, 1); assert.equal(s.escalated, 1);
  assert.equal(s.medianResponseS, 25, "median of 30 s and 20 s"); assert.equal(s.setup, 1); assert.equal(s.info, 1);
  // tally: precision per signal with Wilson interval
  b.verdict(id5, true); b.verdict(id3, false);
  const p = b.precision();
  assert.equal(p.bySig.phone.right, 1); assert.equal(p.bySig.lean.wrong, 1); assert.equal(p.all.n, 2); close(p.all.p, 0.5);
  // room mute: watch/check during the mute go to the log, not the queue
  b.mute(100000, 60000);
  assert.equal(ev(110000, "6", "extra", "watch").kind, "muted");
  assert.equal(ev(170001, "6", "extra", "watch").kind, "alert");
  assert.equal(b.summary().muted, 1);
  // profiles: read-aloud drops mouth; gaze off drops gaze; breaks turns early leave into info
  b.setProfile("8", { readAloud: true, gazeOff: true, breaks: true });
  assert.equal(ev(200000, "8", "mouth", "info").kind, "filtered");
  assert.equal(ev(200000, "8", "gaze", "info").kind, "filtered");
  assert.equal(ev(200000, "8", "early", "watch").kind, "info");
  b.setProfile("8", {}); assert.equal(b.profiles["8"], undefined, "plain profile removes the entry");
  // early leavers + heartbeat nodes
  ev(210000, "9", "early", "watch");
  assert.deepEqual(b.summary().earlyLeavers, ["9"]);
  b.ingest({ v: 1, type: "hb", room: "R1", node: "node000002", src: "lab", seats: ["11"], t: 1 }, 1);
  assert.ok(b.nodes.node000002 && b.seats().includes("11"));
  assert.equal(b.ingest({ ...{ v: 1, type: "ev", room: "R1", node: "node000001", src: "hall", seat: "1", sig: "phone", lvl: "check", t: 1 }, room: "R2" }).ok, true, "room is checked by the link, the board accepts its own messages");
});

test("board: CSV is time-ordered (never ranked by suspicion), escapes formulas; JSON round trip keeps state", () => {
  const b = E.createBoard({ room: "R1" });
  const ev = (t, seat, sig, lvl, x) => b.ingest(Object.assign({ v: 1, type: "ev", room: "R1", node: "node000001", src: "lab", seat, sig, lvl, t }, x || {}), t);
  ev(3000, "2", "phone", "check"); ev(1000, "1", "away", "watch", { dur: 6000 }); ev(2000, "3", "empty", "info");
  const id = b.queue(4000)[0].id;
  b.act(id, "noissue", { who: "=HYPERLINK(\"x\")", note: "+cmd" }, 5000);
  const csv = b.csv({ time: t => String(t) });
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines.length, 4);
  assert.deepEqual(lines.slice(1).map(l => l.split(",")[0]), ["1000", "2000", "3000"], "time order");
  assert.ok(lines[3].includes('"=HYPERLINK(""x"")"') && lines[3].includes('"+cmd"'), "formula-looking cells are quoted: " + lines[3]);
  assert.ok(lines[3].includes(",2,"), "response time 2 s");
  assert.ok(!/score|rank/i.test(lines[0]));
  const j = JSON.parse(JSON.stringify(b.toJSON()));
  const b2 = E.createBoard({ room: "R1" }); assert.ok(b2.load(j));
  assert.equal(b2.alerts.length, b.alerts.length); assert.equal(b2.rows().length, b.rows().length);
  assert.equal(b2.levels(3000)["2"].level, "check");
  assert.equal(b2.load({ v: 9 }), false);
  assert.equal(E.fmtDur(65000), "1:05 min"); assert.equal(E.fmtDur(4000), "4 s");
  close(E.wilson(8, 10).lo, 0.4902, 1e-3); assert.equal(E.wilson(0, 0).p, null);
});

test("signals: every signal has a Thai label and a valid level; no emotion or verdict wording anywhere", () => {
  for (const [id, s] of Object.entries(E.SIGNALS)) {
    assert.ok(/[฀-๿]/.test(s.th), id);
    assert.ok(["info", "watch", "check", "setup"].includes(s.lvl), id);
    assert.ok(!/อารมณ์|ทุจริต|โกง|ผิดจริง/.test(s.th), "no verdict / emotion words: " + id);
  }
  assert.ok(!/emotion|expression/i.test(Object.keys(E.SIGNALS).join(" ")));
});
