"use strict";
// node --test tests/unit/sitecheck.test.js — lensiq-sitecheck.js: on-site accuracy check maths (confidence intervals,
// crossing matching, verdicts, recommendations) and the camera-health monitor on synthetic frames.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../lensiq-sitecheck.js");
const DR = require("../../driver.js");

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ""} expected ${b} ± ${eps}, got ${a}`);

test("intervals: Wilson and exact Poisson match published values", () => {
  const w = S.wilson(81, 263); // Wilson (1927) / Newcombe (1998) example: 0.3080 [0.2553, 0.3662]
  near(w.p, 0.30798, 1e-4); near(w.lo, 0.2553, 1e-3); near(w.hi, 0.3662, 1e-3);
  const z = S.wilson(0, 30); assert.equal(z.lo, 0); near(z.hi, 0.1135, 1e-3, "0/30 upper bound");
  assert.equal(S.wilson(0, 0).p, null);
  near(S.poissonCI(0).hi, 3.689, 2e-3, "Poisson 0"); // Garwood: 0 -> [0, 3.689]
  const p5 = S.poissonCI(5); near(p5.lo, 1.6235, 2e-3); near(p5.hi, 11.668, 3e-3);
  assert.ok(S.needN(0.85, 0.05) >= 190 && S.needN(0.85, 0.05) <= 200);
});

// synthetic door: crossings every ~7 s, the person taps 0.8 s late (± 0.3 s)
function door(n, { lag = 800, jitter = 300, miss = [], extra = [], flip = [], seed = 3 } = {}) {
  const r = S.rng(seed), truth = [], sys = [];
  for (let i = 0; i < n; i++) {
    const t = 10000 + i * 7000 + Math.round(r() * 2000), dir = i % 3 ? "in" : "out";
    truth.push({ t: t + lag + Math.round((r() - 0.5) * 2 * jitter), dir });
    if (!miss.includes(i)) sys.push({ t, dir: flip.includes(i) ? (dir === "in" ? "out" : "in") : dir });
  }
  for (const t of extra) sys.push({ t, dir: "in" });
  return { truth, sys };
}

test("matchCrossings: removes the tapping lag, matches one to one, flags direction errors", () => {
  const { truth, sys } = door(60, { miss: [5, 17], extra: [13500, 90500], flip: [8] });
  const m = S.matchCrossings(sys, truth);
  near(m.lag, -800, 250, "lag (system earlier than taps)");
  assert.equal(m.pairs.length, 58);
  assert.equal(m.fp.length, 2); assert.equal(m.fn.length, 2);
  assert.equal(m.pairs.filter(p => !p.dirOk).length, 1);
  // a 2.2-s lag without the lag correction would not match at tol 2 s
  const late = door(30, { lag: 2600, jitter: 100 });
  assert.equal(S.matchCrossings(late.sys, late.truth).pairs.length, 30);
});

test("countReport: pass with enough clean data, 'more' when short, swap recommendation, fail on heavy overcount", () => {
  const good = door(80, { miss: [3, 40], extra: [500000] });
  const r = S.countReport(good.sys, good.truth, { stats: { hz: 8, personH: 0.3 } });
  assert.equal(r.verdict, "pass", JSON.stringify(r.metrics));
  near(r.net, -1 / 80, 1e-9); assert.ok(r.netCI.lo <= r.net && r.net <= r.netCI.hi);
  const short = door(20);
  assert.equal(S.countReport(short.sys, short.truth).verdict, "more");
  const sw = door(60, { flip: Array.from({ length: 60 }, (_, i) => i) });
  const rs = S.countReport(sw.sys, sw.truth);
  assert.ok(rs.recs.some(x => x.includes("สลับทิศ")), rs.recs.join("|"));
  assert.equal(rs.verdict, "fail");
  const over = door(60, { extra: Array.from({ length: 30 }, (_, i) => 12000 + i * 13000 + 3500) });
  const ro = S.countReport(over.sys, over.truth, { stats: { hz: 2.5, personH: 0.08 } });
  assert.equal(ro.verdict, "fail");
  assert.ok(ro.recs.some(x => x.includes("ครั้ง/วินาที")) && ro.recs.some(x => x.includes("คนตัวเล็ก")));
});

test("face trial: same 2-frame / 2-confident-frame rules as attendance.js", () => {
  const run = frames => { const T = S.createFaceTrial(); let r = null; frames.forEach(([t, o]) => { r = T.step(o, t) || r; }); return r; };
  const A = { face: true, label: "a", confident: true }, a = { face: true, label: "a", confident: false }, U = { face: true, label: null };
  assert.deepEqual(run([[0, A], [400, A]]).outcome, "auto");
  const ask = run([[0, a], [400, a], [800, a], [6500, U]]); assert.equal(ask.outcome, "ask"); assert.equal(ask.label, "a");
  assert.equal(run([[0, U], [400, U], [6100, U]]).outcome, "none");
  assert.equal(run([[0, { face: false }], [8100, { face: false }]]).outcome, "noface");
  assert.equal(run([[0, A], [400, a], [2500, A], [6100, U]]).outcome, "ask", "confident frames 2.5 s apart are not consecutive");
});

test("attendanceReport: any automatic wrong check-in fails; zero in 20 strangers still reports the upper bound", () => {
  const mem = Array.from({ length: 25 }, (_, i) => ({ truth: "p" + (i % 5), outcome: i < 22 ? "auto" : i < 24 ? "ask" : "none", label: i < 24 ? "p" + (i % 5) : null }));
  const str = Array.from({ length: 20 }, (_, i) => ({ truth: "stranger", outcome: i < 2 ? "ask" : "none", label: i < 2 ? "p1" : null }));
  const r = S.attendanceReport([...mem, ...str]);
  assert.equal(r.verdict, "pass", JSON.stringify(r.metrics));
  near(r.recognised.p, 24 / 25, 1e-9); assert.equal(r.n.strangerAuto, 0);
  assert.ok(r.strangerAuto.hi > 0.15 && r.strangerAuto.hi < 0.2, "0/20 -> upper bound about 16%");
  const bad = S.attendanceReport([...mem, { truth: "stranger", outcome: "auto", label: "p2" }, ...str]);
  assert.equal(bad.verdict, "fail"); assert.ok(bad.recs[0].includes("ค่าความต่างใบหน้า"));
});

test("driver protocol: schedule fits the test, real monitor on scripted frames gives hits and no false alarms", () => {
  const P = S.closureSchedule({ durationMs: 300000, n: 8, seed: 5 });
  assert.equal(P.length, 8);
  P.forEach((p, i) => { assert.ok(p.at >= 20000 && p.at + p.closeMs < 300000 - 5000); if (i) assert.ok(p.at - P[i - 1].at >= 9000, "prompts at least 9 s apart"); });
  // simulate the page: 15 fps, eye score 0 open / 8 closed during each prompt (+0.4 s reaction), calibrated threshold 3
  const mon = DR.createMonitor({ thr: 0.2, eyeThr: 3, yaw: 0, pitch: null }), t0 = 1e6, frames = [], events = [];
  for (let t = 0; t < 300000; t += 66) {
    const closed = P.some(p => t >= p.at + 400 && t < p.at + p.closeMs);
    const r = mon.update({ t: t0 + t, face: true, ear: closed ? 0.18 : 0.3, mar: 0.1, yaw: 0, pitch: 1, eyeScore: closed ? 8 : 0 });
    frames.push({ t: t0 + t, face: true, closed: r.metrics.closed }); events.push(...r.events.map(e => ({ ...e, at: t0 + t })));
  }
  const rep = S.driverReport({ t0, durationMs: 300000, prompts: P, events, frames });
  assert.equal(rep.n.hits, 8); assert.equal(rep.n.falseAlarms, 0);
  assert.ok(rep.latencyMs >= 1800 && rep.latencyMs <= 2100, "1.5-s long-closure rule + 0.4 s reaction: " + rep.latencyMs);
  assert.equal(rep.verdict, "pass", JSON.stringify(rep.metrics));
  assert.ok(rep.falsePerHour.hi > 10, "0 alarms in a 4-min open period is still a wide interval");
  // an alarm outside every prompt counts as false
  const rep2 = S.driverReport({ t0, durationMs: 300000, prompts: P, events: [...events, { t: t0 + 5000, type: "long_closure", level: 2 }], frames });
  assert.equal(rep2.n.falseAlarms, 1);
});

test("qcReport: false rejects, misses, and a tolerance suggestion only when good and bad stay separable", () => {
  const rows = [];
  for (let i = 0; i < 40; i++) { const de = 6 + (i % 10); rows.push({ truth: "good", pass: de <= 15, reasons: de > 15 ? ["capColor"] : [], v: { capDE: de, fill: 1 } }); } // ΔE up to 15 -> 0 rejects; make some 16-17
  rows[3].v.capDE = 16.5; rows[3].pass = false; rows[3].reasons = ["capColor"];
  for (let i = 0; i < 10; i++) rows.push({ truth: "bad", pass: false, reasons: ["capColor"], v: { capDE: 40 + i } });
  rows.push({ truth: "bad", pass: true, reasons: [], v: { capDE: 9 } });
  const r = S.qcReport(rows, { capDE: 15, fill: 6, fillUnit: "px" });
  assert.equal(r.n.falseReject, 1); assert.equal(r.n.missed, 1);
  const s = r.tolSuggest.find(x => x.key === "capDE");
  assert.ok(s && s.separable && s.suggest > 16.5 && s.suggest < 40, JSON.stringify(r.tolSuggest));
  // overlap: a bad bottle at ΔE 17 -> not separable
  rows.push({ truth: "bad", pass: false, reasons: ["capColor"], v: { capDE: 17 } });
  assert.equal(S.qcReport(rows, { capDE: 15 }).tolSuggest.find(x => x.key === "capDE").separable, false);
});

// ---------- camera health on synthetic frames ----------
function scene({ W = 160, H = 90, gain = 1, add = 0, glare = 0, blur = 0, dx = 0 } = {}) {
  const base = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 90 + 60 * Math.sin((x + dx) / 6) * Math.cos(y / 5) + ((((x + dx) >> 3) + (y >> 3)) % 2 ? 40 : -40);
    if (glare && x > W * 0.6) v = 255;
    base[y * W + x] = v;
  }
  let img = base;
  if (blur) { const o = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, k = 0; for (let j = -blur; j <= blur; j++) for (let i = -blur; i <= blur; i++) { const xx = Math.min(W - 1, Math.max(0, x + i)), yy = Math.min(H - 1, Math.max(0, y + j)); s += base[yy * W + xx]; k++; } o[y * W + x] = s / k; } img = o; }
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const v = glare && img[i] >= 255 ? 255 : img[i] * gain + add; data[4 * i] = data[4 * i + 1] = data[4 * i + 2] = v; data[4 * i + 3] = 255; }
  return { data, width: W, height: H };
}
const healthOf = (frames, extra = {}) => { const h = S.createHealth(); let st; frames.forEach(f => { st = h.push(S.frameStats(f), extra); }); return st; };

test("health: normal scene ok; dark, backlight, blur, shake, slow and small people are flagged", () => {
  const ok = healthOf(Array(6).fill(scene()), { hz: 8, personH: 0.3 });
  assert.equal(ok.level, 0, ok.text);
  assert.ok(healthOf(Array(6).fill(scene({ gain: 0.25 }))).codes.includes("dark"));
  assert.ok(!healthOf(Array(6).fill(scene({ gain: 0.45 }))).codes.includes("dark"), "median luma 40: YOLOX still counts there, no flag");
  assert.ok(healthOf(Array(6).fill(scene({ gain: 0.08 }))).codes.includes("darkBad"));
  assert.ok(healthOf(Array(6).fill(scene({ gain: 0.45, glare: 1 }))).codes.includes("backlight"));
  assert.ok(healthOf(Array(6).fill(scene({ blur: 3 }))).codes.includes("blur"));
  assert.ok(healthOf(Array(6).fill(scene({ gain: 0.25, add: 110 }))).codes.includes("lowContrast"));
  assert.ok(healthOf(Array.from({ length: 8 }, (_, i) => scene({ dx: i % 2 ? 9 : 0 }))).codes.includes("shake"));
  assert.ok(!healthOf(Array.from({ length: 8 }, () => scene())).codes.includes("shake"));
  assert.ok(healthOf(Array(6).fill(scene()), { hz: 3 }).codes.includes("slow"));
  assert.ok(healthOf(Array(6).fill(scene()), { hz: 1.5 }).codes.includes("slowBad"));
  assert.ok(healthOf(Array(6).fill(scene()), { personH: 0.08 }).codes.includes("small"));
});

test("health: hysteresis — a flag set by a dark scene stays until the light is clearly back", () => {
  const h = S.createHealth({ cfg: { window: 3 } });
  for (let i = 0; i < 3; i++) h.push(S.frameStats(scene({ gain: 0.25 })));
  assert.ok(h.state().codes.includes("dark"));
  const p = S.frameStats(scene({ gain: 0.38 })); // median ≈ between enter (30) and leave (38)
  assert.ok(p.p50 >= S.HEALTH.darkWarn && p.p50 < S.HEALTH.darkLeave, "p50 " + p.p50);
  for (let i = 0; i < 3; i++) h.push(p);
  assert.ok(h.state().codes.includes("dark"), "still flagged inside the hysteresis band");
  for (let i = 0; i < 3; i++) h.push(S.frameStats(scene()));
  assert.equal(h.state().level, 0);
});

test("thumbShift recovers a global translation; exportDoc carries no image data", () => {
  const a = S.frameStats(scene()), b = S.frameStats(scene({ dx: 10 }));
  const s = S.thumbShift(a.thumb, b.thumb);
  assert.ok(Math.abs(s.dx) >= 1 / 32 && Math.abs(s.dx) <= 3 / 32, JSON.stringify(s)); assert.equal(s.dy, 0);
  const d = S.exportDoc("store", { truth: [{ t: 1, dir: "in" }] });
  assert.equal(d.format, "lensiq-sitecheck"); assert.ok(!/data:image|base64/.test(JSON.stringify(d)));
});
