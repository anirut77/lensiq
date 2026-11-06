#!/usr/bin/env node
// tests/bench/driver-session.bench.mjs — driver eye-closure false alarms when calibration and driving are DIFFERENT photos.
//
//   LQ_BENCH_DATA=/path/to/data node tests/bench/driver-session.bench.mjs [--json out.json] [--minutes 10]
//
// Why: driver.bench.mjs calibrates each person on 8 jittered copies of one open-eye photo and tests on the same photo,
// so it only measures frame-to-frame noise, not a change of light, pose or camera between calibration and driving.
// Here every person is calibrated on one LFW photo ("session A") and tested on a DIFFERENT LFW photo of the same person
// ("session B"). Session B is always the photo CEW labelled as open eyes (CEW's OpenFace set is cut from LFW, file names
// kept), so a "closed" call on it is a false alarm. The calibration photo is any other LFW photo of that person
// (up to 3 per person, each a separate pair); LFW photos are not eye-state labelled, so a blink in a calibration photo
// only raises that person's baseline (it can hide, not create, a false alarm).
// Each photo becomes 8 video-like frames (bench-page2.js jitter: shift, scale, exposure, blur) through the page pipeline
// (TinyFaceDetector 224 / 0.4 + 68 landmarks + driver.js eye patches) at LFW's native 250 px. Node side: driver.js
// faceMetrics + eyeClosedScore + calibrate + createMonitor, exactly as the page.
// Reported:
//   per frame  — open frames called closed: same photo (old method), different photo (honest), pooled baseline (one
//                baseline for everyone) and fixed score > 3 (no baseline).
//   per minute — alarms on simulated 15 fps open-eye drives built from session B frames, with the page monitor.
// Data: lfwfull/lfw/<name>/*.jpg (LFW) and cew/ (CEW, research use only); tests/bench/fetch_datasets.py. Never commit data.
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CACHE, DATA, REPO, needData, openBench, dataUrl, pct, fx, table } from "./lib.mjs";

const require = createRequire(import.meta.url);
const DR = require(join(REPO, "driver.js"));
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
needData("lfwfull/lfw", "driver session benchmark");
if (!existsSync(join(DATA, "cew", "index.json"))) { console.log("skip driver session benchmark: no cew/index.json under " + DATA); process.exit(0); }

const NAUG = 8, MAXCAL = 3, FPS = 15, MINUTES = +opt("--minutes", 10);
const cewIdx = JSON.parse(readFileSync(join(DATA, "cew", "index.json"), "utf8"));
const people = [];
for (const x of cewIdx.filter(x => !x.closed)) {
  const f = basename(x.f), name = f.replace(/_\d{4}\.jpg$/, ""), dir = join(DATA, "lfwfull", "lfw", name);
  if (!existsSync(join(dir, f))) continue;
  const others = readdirSync(dir).filter(g => g !== f && g.endsWith(".jpg")).sort().slice(0, MAXCAL);
  if (others.length) people.push({ name, test: `lfwfull/lfw/${name}/${f}`, cal: others.map(g => `lfwfull/lfw/${name}/${g}`) });
}
console.error(`${people.length} people with a CEW-verified open-eye LFW photo and at least one other LFW photo`);

/* frames of one photo: aug seeds 1..8 = "calibration" frames, 9..16 = "driving" frames (same photo, old method) */
const cacheFile = join(CACHE, `driver-session-${people.length}.json`);
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
let bench = null;
async function frames(rel, seeds) {
  const key = `${rel}#${seeds[0]}-${seeds.at(-1)}`;
  if (cache[key]) return cache[key];
  bench = bench || await openBench();
  const u = dataUrl(rel), rs = [];
  for (const a of seeds) rs.push(...await bench.page.evaluate(`LQB2.driver(${JSON.stringify([u])}, ${JSON.stringify({ inputSize: 224, scoreThreshold: 0.4, aug: a, patches: true })})`));
  return (cache[key] = rs.filter(r => r.n).map(r => ({ pts: r.pts, eyes: r.eyes })));
}
const S1 = Array.from({ length: NAUG }, (_, i) => i + 1), S2 = Array.from({ length: NAUG }, (_, i) => i + 1 + NAUG);
const dec = b => Uint8Array.from(Buffer.from(b, "base64"));
const metricsOf = r => { const m = DR.faceMetrics(r.pts.map(([x, y]) => ({ x, y }))); m.eyeScore = r.eyes ? DR.eyeClosedScore(dec(r.eyes[0]), dec(r.eyes[1]), m.ear) : NaN; return m; };

const t0 = Date.now(); let k = 0;
try {
  for (const p of people) {
    p.testF = (await frames(p.test, S2)).map(metricsOf);
    p.sameF = (await frames(p.test, S1)).map(metricsOf);
    p.calF = [];
    for (const c of p.cal) p.calF.push((await frames(c, S1)).map(metricsOf));
    if (++k % 10 === 0) { process.stderr.write(`\r  ${k}/${people.length} people (${((Date.now() - t0) / 1000) | 0} s)`); writeFileSync(cacheFile, JSON.stringify(cache)); }
  }
} finally { if (bench) await bench.done(); writeFileSync(cacheFile, JSON.stringify(cache)); }
process.stderr.write("\n");

/* the page's per-frame decision after calibrate() (createMonitor rule; no adaptive term) */
const CAL = { calibMinSamples: 4 };
const calib = fs => DR.calibrate(fs.map(m => ({ face: true, ...m })), DR.DR_DEFAULTS.earRatio, CAL);
const closedBy = c => m => c.eyeThr != null && Number.isFinite(m.eyeScore) ? m.eyeScore > c.eyeThr : m.ear < c.thr;

/* pairs: (calibration frames, driving frames) */
const pairs = { same: [], cross: [] };
for (const p of people) {
  if (p.testF.length < 4) continue;
  if (p.sameF.length >= 4) pairs.same.push({ p, cal: p.sameF, drive: p.testF });
  for (const cf of p.calF) if (cf.length >= 4) pairs.cross.push({ p, cal: cf, drive: p.testF });
}
function frameRate(list) {
  let n = 0, f = 0, off = 0; const persons = new Set(), bad = new Set();
  for (const { p, cal, drive } of list) {
    const c = calib(cal), isC = closedBy(c);
    if (c.eyeThr == null) off++;
    for (const m of drive) { n++; persons.add(p.name); if (isC(m)) { f++; bad.add(p.name); } }
  }
  return { pairs: list.length, persons: persons.size, frames: n, falseClosed: f / n, falseN: f, personsWithFalse: bad.size, classifierOff: off };
}
const res = { date: new Date().toISOString(), people: people.length, same: frameRate(pairs.same), cross: frameRate(pairs.cross) };

/* pooled baseline: one eye-score baseline for everyone = median of all calibration frames; and fixed score > 3 */
const allCal = people.flatMap(p => p.calF.flat()).map(m => m.eyeScore).filter(Number.isFinite);
const allDrive = pairs.cross.length ? [...new Set(pairs.cross.map(x => x.p))].flatMap(p => p.testF).map(m => m.eyeScore).filter(Number.isFinite) : [];
const pooledBase = DR.median(allCal);
res.pooled = { base: pooledBase, thr: pooledBase + DR.DR_DEFAULTS.eyeDelta, falseClosed: allDrive.filter(v => v > pooledBase + DR.DR_DEFAULTS.eyeDelta).length / allDrive.length, frames: allDrive.length };
res.fixed = [2, 3, 4].map(t => ({ t, falseClosed: allDrive.filter(v => v > t).length / allDrive.length }));
/* how far session B moves from session A, in eye-score units (what an adaptive baseline has to absorb) */
res.shift = (() => { const d = pairs.cross.map(({ cal, drive }) => DR.median(drive.map(m => m.eyeScore).filter(Number.isFinite)) - DR.median(cal.map(m => m.eyeScore).filter(Number.isFinite))).filter(Number.isFinite).sort((a, b) => a - b);
  const q = x => d[Math.min(d.length - 1, Math.floor(x * d.length))]; return { n: d.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), p99: q(0.99), overDelta: d.filter(v => v > DR.DR_DEFAULTS.eyeDelta).length / d.length }; })();

/* closed eyes caught: each pair's thresholds (calibrated on session A) on CEW closed-eye frames (cached by
   driver.bench.mjs at its CEW prep; skipped when that cache is missing) */
const cewCache = join(CACHE, "driver-cew-224p.json");
const closedM = existsSync(cewCache) ? JSON.parse(readFileSync(cewCache, "utf8")).map((r, i) => [r, cewIdx[i]]).filter(([r, x]) => x.closed && r.n && r.eyes).map(([r]) => metricsOf(r)) : null;

/* simulated 15 fps drives through the page monitor (createMonitor), one per (calibration, driving) pair, seeded:
   steady  — MINUTES of open eyes, frames drawn at random from session B: every alarm is false;
   shift   — 2 min of session A frames (the calibration photo), then 2 min of session B: the light/pose changes mid-trip;
             alarms in the B half are false;
   drowsy  — 1 min open (session B), then 5 min with a 2-s eye closure every 12 s (PERCLOS ≈ 17%); closed frames are drawn
             from CEW closed-eye photos (other people, CEW prep — an approximation); "caught" = closures that raised a
             long-closure alert (≥ 1.5 s), and pairs where the PERCLOS alert fired. */
function rng(seed) { let t = seed >>> 0; return () => ((t = (t * 1664525 + 1013904223) >>> 0) / 4294967296); }
const dt = 1000 / FPS;
function run(pair, cfg, seed, plan) {
  const c = calib(pair.cal), mon = DR.createMonitor(c, cfg), r = rng(seed);
  const ev = { long_closure: [], microsleep: [], perclos: [] }; let closed = 0, n = 0, i = 0;
  for (const [src, frames, phase] of plan) for (let k = 0; k < frames; k++, i++) {
    const set = src === "A" ? pair.cal : src === "B" ? pair.drive : closedM, m = set[(r() * set.length) | 0];
    const u = mon.update({ t: i * dt, face: true, ...m, yaw: c.yaw, pitch: c.pitch, mar: 0 });
    if (phase) { n++; if (u.metrics.closed) closed++; }
    for (const e of u.events) if (e.type in ev) ev[e.type].push({ ...e, phase, i });
  }
  return { ev, closedFrac: n ? closed / n : 0 };
}
const sec = s => Math.round(s * FPS);
function steady(cfg) {
  const o = { pairs: 0, minutes: 0, long_closure: 0, perclos: 0, microsleep: 0, alarm: 0, pairsWithAlarm: 0, closedFrac: 0 };
  pairs.cross.forEach((pr, j) => {
    const d = run(pr, cfg, j + 1, [["B", sec(MINUTES * 60), 1]]);
    o.pairs++; o.minutes += MINUTES; o.closedFrac += d.closedFrac;
    const al = [...d.ev.long_closure, ...d.ev.perclos].length;
    o.long_closure += d.ev.long_closure.length; o.perclos += d.ev.perclos.length; o.microsleep += d.ev.microsleep.length; o.alarm += al; if (al) o.pairsWithAlarm++;
  });
  o.closedFrac /= o.pairs || 1; return o;
}
function shift(cfg) {
  let alarms = 0, pairsWithAlarm = 0;
  pairs.cross.forEach((pr, j) => {
    const d = run(pr, cfg, 7919 + j, [["A", sec(120), 0], ["B", sec(120), 1]]);
    const al = [...d.ev.long_closure, ...d.ev.perclos].filter(e => e.phase).length; alarms += al; if (al) pairsWithAlarm++;
  });
  return { shifts: pairs.cross.length, alarms, pairsWithAlarm };
}
function drowsy(cfg) {
  if (!closedM) return null;
  let episodes = 0, caughtN = 0, perclosPairs = 0, falseBefore = 0;
  const plan = [["B", sec(60), 0]]; for (let k = 0; k < 25; k++) plan.push(["B", sec(10), 0], ["C", sec(2), 2]);
  pairs.cross.forEach((pr, j) => {
    const d = run(pr, cfg, 104729 + j, plan);
    const starts = []; let i = 0; for (const [, f, ph] of plan) { if (ph === 2) starts.push(i); i += f; }
    episodes += starts.length;
    for (const s0 of starts) if (d.ev.long_closure.some(e => e.i >= s0 && e.i < s0 + sec(2) + 2)) caughtN++;
    if (d.ev.perclos.length) perclosPairs++;
    falseBefore += d.ev.long_closure.filter(e => e.i < sec(60)).length;
  });
  return { pairs: pairs.cross.length, episodes, caught: caughtN / episodes, perclosPairs: perclosPairs / pairs.cross.length, falseBefore };
}
const VARIANTS = [
  ["fixed baseline from calibration (round 5)", { eyeAdaptive: false }],
  ["**adaptive: 20th percentile of last 10 s (round 6 default)**", {}],
  ["adaptive: 35th percentile of last 10 s", { eyeAdaptQ: 0.35 }],
  ["adaptive: median of last 10 s", { eyeAdaptQ: 0.5 }],
  ["adaptive: 20th percentile of last 30 s", { eyeAdaptWindowMs: 30000 }]
];
res.sim = { minutes: MINUTES, fps: FPS, variants: VARIANTS.map(([label, cfg]) => ({ label, cfg, steady: steady(cfg), shift: shift(cfg), drowsy: drowsy(cfg) })) };
/* per-frame CEW closed eyes caught against each pair's threshold; adaptive = after the baseline followed session B */
function caught(adaptive) {
  if (!closedM) return null;
  let s = 0;
  for (const pr of pairs.cross) {
    const c = calib(pr.cal); let thr = c.eyeThr;
    if (adaptive && thr != null) { const b = DR.adaptiveEyeBase(pr.drive.map(m => m.eyeScore), DR.DR_DEFAULTS.eyeAdaptQ, 1); if (b != null) thr = Math.min(thr + DR.DR_DEFAULTS.eyeAdaptMaxRise, Math.max(thr, b + DR.DR_DEFAULTS.eyeDelta)); }
    s += closedM.filter(m => thr != null && Number.isFinite(m.eyeScore) ? m.eyeScore > thr : m.ear < c.thr).length / closedM.length;
  }
  return s / pairs.cross.length;
}
res.caught = { fixed: caught(false), adaptive: caught(true) };

console.log("\n## Driver eye closure — calibrate on one photo, drive on another (LFW, CEW-verified open eyes, input 224)\n");
console.log(table(["calibration → driving", "pairs / people", "open frames", "open frames called closed", "people with ≥1 false frame", "classifier off (EAR used)"], [
  ["same photo, other jitter (old method)", `${res.same.pairs} / ${res.same.persons}`, res.same.frames, `${pct(res.same.falseClosed, 2)} (${res.same.falseN})`, res.same.personsWithFalse, res.same.classifierOff],
  ["**different photo of the same person**", `${res.cross.pairs} / ${res.cross.persons}`, res.cross.frames, `**${pct(res.cross.falseClosed, 2)}** (${res.cross.falseN})`, res.cross.personsWithFalse, res.cross.classifierOff]]));
console.log("\nNo personal baseline (same driving frames):\n");
console.log(table(["rule", "open frames called closed"], [
  [`pooled baseline (median of everyone's calibration frames ${fx(res.pooled.base, 2)}) + ${DR.DR_DEFAULTS.eyeDelta}`, pct(res.pooled.falseClosed, 2)],
  ...res.fixed.map(f => [`fixed score > ${f.t}`, pct(f.falseClosed, 2)])]));
console.log(`\nSession shift (median driving score − median calibration score, eye-score units, ${res.shift.n} pairs): p10 ${fx(res.shift.p10, 2)} · p50 ${fx(res.shift.p50, 2)} · p90 ${fx(res.shift.p90, 2)} · p99 ${fx(res.shift.p99, 2)} · > eyeDelta ${pct(res.shift.overDelta)}`);
console.log(`\nPer frame, CEW closed-eye photos caught against each pair's threshold: fixed ${pct(res.caught.fixed)} · adaptive (after following session B) ${pct(res.caught.adaptive)}`);
console.log(`\n### Simulated drives at ${FPS} fps through createMonitor, ${pairs.cross.length} calibration → driving pairs\n`);
console.log(table(["monitor", `open eyes ${MINUTES} min: frames called closed`, "false alarms / min (long closure + PERCLOS)", "pairs with ≥ 1 false alarm", "microsleeps / min (level 1)", "light change mid-trip: false alarms per change", "drowsy: 2-s closures alerted", "drowsy: PERCLOS alert raised"],
  res.sim.variants.map(v => [v.label, pct(v.steady.closedFrac, 2), (v.steady.alarm / v.steady.minutes).toFixed(3), `${v.steady.pairsWithAlarm} / ${v.steady.pairs}`, (v.steady.microsleep / v.steady.minutes).toFixed(3),
    (v.shift.alarms / v.shift.shifts).toFixed(3), v.drowsy ? pct(v.drowsy.caught) : "—", v.drowsy ? pct(v.drowsy.perclosPairs) : "—"])));
console.log("\nDrowsy closures use CEW closed-eye photos of other people (CEW prep), so the caught rates are an approximation.");
if (opt("--json")) { writeFileSync(opt("--json"), JSON.stringify(res, null, 1)); console.log("wrote " + opt("--json")); }
