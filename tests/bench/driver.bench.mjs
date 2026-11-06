#!/usr/bin/env node
// tests/bench/driver.bench.mjs — eye-closure detection of the driver-drowsiness page on public eye-state photos.
//
//   LQ_BENCH_DATA=/path/to/data node tests/bench/driver.bench.mjs [--json out.json]
//
// Browser side (headless Chrome, TF.js WASM): faceapi TinyFaceDetector (driver.js default inputSize 224, score 0.4)
// + 68-point landmarks, exactly as driver.js detect(). Node side: driver.js faceMetrics() -> EAR, then the page's rule
// "closed when EAR < threshold" with (a) the fallback threshold 0.25 used when calibration fails and (b) the calibrated
// rule thr = clamp(baseline EAR × ratio, 0.12, 0.35). Photos are of different people, so the per-driver baseline is
// approximated by the median EAR of the open-eye photos of the set (a real driver's own baseline is tighter).
// Data (tests/bench/fetch_datasets.py): oceyes/ (AI-generated faces, ODC-BY) and cew/ (Closed Eyes In The Wild,
// research use only). Detections are cached in $LQ_BENCH_CACHE.
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE, DATA, REPO, needData, openBench, dataUrl, pct, fx, table } from "./lib.mjs";

const require = createRequire(import.meta.url);
const DR = require(join(REPO, "driver.js"));
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
needData("", "driver benchmark");
const SETS = [
  { name: "oceyes", label: "Open/Closed Eyes (AI-generated, 512 px, ODC-BY)", prep: {} },
  { name: "cew", label: "CEW Closed Eyes in the Wild (real photos, 100 px warped faces, research only)", prep: { scale: 2.4, padTo: 320 } }
].filter(s => existsSync(join(DATA, s.name, "index.json")));
if (!SETS.length) { console.log("skip driver benchmark: no oceyes/ or cew/ under " + DATA); process.exit(0); }

let bench = null;
const B = async () => (bench = bench || await openBench());
async function run(set, inputSize) {
  const idx = JSON.parse(readFileSync(join(DATA, set.name, "index.json"), "utf8"));
  const file = join(CACHE, `driver-${set.name}-${inputSize}.json`);
  if (existsSync(file)) { const c = JSON.parse(readFileSync(file, "utf8")); if (c.length === idx.length) return { idx, rows: c }; }
  const b = await B(), rows = [], t0 = Date.now();
  for (let i = 0; i < idx.length; i += 16) {
    const urls = idx.slice(i, i + 16).map(x => dataUrl(join(set.name, x.f)));
    rows.push(...await b.page.evaluate(`LQB2.driver(${JSON.stringify(urls)}, ${JSON.stringify({ inputSize, scoreThreshold: 0.4, ...set.prep })})`));
    process.stderr.write(`\r  ${set.name} @${inputSize}: ${rows.length}/${idx.length} (${((Date.now() - t0) / 1000) | 0} s)`);
  }
  process.stderr.write("\n");
  writeFileSync(file, JSON.stringify(rows));
  return { idx, rows };
}

/* per-driver calibration, approximated: each open-eye photo is shown NAUG times with video-like jitter (shift, scale,
   exposure, blur); the person's baseline = median EAR over those frames (what calibrate() does), and every frame with
   EAR < baseline × ratio is a false "closed" frame */
const NAUG = 8, NPERS = 150;
async function jittered(set, idx) {
  const file = join(CACHE, `driver-${set.name}-jit.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const open = idx.map((x, i) => [x, i]).filter(([x]) => !x.closed).slice(0, NPERS), b = await B(), out = [];
  for (const [x] of open) {
    const u = dataUrl(join(set.name, x.f)), rs = [];
    for (let a = 1; a <= NAUG; a++) rs.push(...await b.page.evaluate(`LQB2.driver(${JSON.stringify([u])}, ${JSON.stringify({ inputSize: 224, scoreThreshold: 0.4, aug: a, ...set.prep })})`));
    out.push(rs.filter(r => r.n).map(r => DR.faceMetrics(r.pts.map(([x, y]) => ({ x, y }))).ear));
    process.stderr.write(`\r  ${set.name} jitter: ${out.length}/${open.length}`);
  }
  process.stderr.write("\n");
  writeFileSync(file, JSON.stringify(out));
  return out;
}

function auc(pos, neg) { // P(closed EAR < open EAR)
  let s = 0; const n = neg.slice().sort((a, b) => a - b);
  for (const p of pos) { let lo = 0, hi = n.length; while (lo < hi) { const m = (lo + hi) >> 1; if (n[m] <= p) lo = m + 1; else hi = m; } let eq = 0; for (let k = lo - 1; k >= 0 && n[k] === p; k--) eq++; s += (n.length - lo) + eq / 2; }
  return s / (pos.length * neg.length);
}
const at = (closed, open, thr) => { const tp = closed.filter(e => e < thr).length, fp = open.filter(e => e < thr).length; return { thr, tpr: tp / closed.length, fpr: fp / open.length, bacc: (tp / closed.length + 1 - fp / open.length) / 2 }; };

const out = { date: new Date().toISOString(), sets: [] };
try {
  for (const set of SETS) for (const inputSize of [224, 320]) {
    const { idx, rows } = await run(set, inputSize);
    const closed = [], open = []; let fC = 0, fO = 0, nC = 0, nO = 0;
    rows.forEach((r, i) => {
      const isC = idx[i].closed; isC ? nC++ : nO++;
      if (!r.n) return;
      isC ? fC++ : fO++;
      const m = DR.faceMetrics(r.pts.map(([x, y]) => ({ x, y })));
      (isC ? closed : open).push(m.ear);
    });
    const med = DR.median(open), ratioThr = k => Math.min(DR.DR_DEFAULTS.earMax, Math.max(DR.DR_DEFAULTS.earMin, med * k));
    const sweep = [];
    for (let t = 0.1; t <= 0.36; t += 0.005) sweep.push(at(closed, open, +t.toFixed(3)));
    const best = sweep.reduce((a, b) => b.bacc > a.bacc ? b : a);
    const res = { set: set.name, label: set.label, inputSize, nClosed: nC, nOpen: nO, foundClosed: fC / nC, foundOpen: fO / nO,
      earClosedMedian: DR.median(closed), earOpenMedian: med, auc: auc(closed, open),
      fallback: at(closed, open, DR.DR_DEFAULTS.earFallback),
      ratios: [0.6, 0.65, 0.7, 0.75, 0.8, 0.85].map(k => ({ k, ...at(closed, open, ratioThr(k)) })), best,
      ms: rows.map(r => r.ms).sort((a, b) => a - b)[rows.length >> 1] };
    if (inputSize === 224) {
      const per = (await jittered(set, idx)).filter(e => e.length >= 4);
      res.perDriver = { persons: per.length, frames: per.reduce((a, e) => a + e.length, 0),
        ratios: [0.7, 0.75, 0.8, 0.85, 0.9].map(k => {
          let f = 0, n = 0; for (const e of per) { const thr = Math.min(DR.DR_DEFAULTS.earMax, Math.max(DR.DR_DEFAULTS.earMin, DR.median(e) * k)); f += e.filter(v => v < thr).length; n += e.length; }
          return { k, falseClosed: f / n, caught: res.ratios.find(r => r.k === k)?.tpr ?? at(closed, open, ratioThr(k)).tpr };
        }) };
    }
    out.sets.push(res);
  }
} finally { if (bench) await bench.done(); }

console.log("\n## Driver drowsiness — eye closure (driver.js faceMetrics EAR on faceapi 68 landmarks, WASM)\n");
console.log(table(["data set", "input", "closed / open photos", "face found (closed / open)", "median EAR closed / open", "AUC", "median ms"],
  out.sets.map(s => [s.label, s.inputSize, `${s.nClosed} / ${s.nOpen}`, `${pct(s.foundClosed)} / ${pct(s.foundOpen)}`, `${fx(s.earClosedMedian)} / ${fx(s.earOpenMedian)}`, fx(s.auc), s.ms])));
for (const s of out.sets) {
  console.log(`\n### ${s.label} @${s.inputSize} — "closed" when EAR < threshold (faces found only)\n`);
  console.log(table(["rule", "threshold", "closed eyes caught", "open eyes called closed", "balanced acc."], [
    ["fallback (calibration failed)", fx(s.fallback.thr), pct(s.fallback.tpr), pct(s.fallback.fpr), pct(s.fallback.bacc)],
    ...s.ratios.map(r => [`baseline × ${r.k}${r.k === 0.7 ? " (page default)" : ""}`, fx(r.thr), pct(r.tpr), pct(r.fpr), pct(r.bacc)]),
    ["best single threshold (in hindsight)", fx(s.best.thr), pct(s.best.tpr), pct(s.best.fpr), pct(s.best.bacc)]]));
}
console.log("\n### Calibrated per driver (page rule): false \"closed\" frames on open eyes, own baseline from jittered frames\n");
console.log(table(["data set", "people / frames", ...[0.7, 0.75, 0.8, 0.85, 0.9].map(k => `× ${k}: open frames called closed · closed photos caught`)],
  out.sets.filter(s => s.perDriver).map(s => [s.label, `${s.perDriver.persons} / ${s.perDriver.frames}`, ...s.perDriver.ratios.map(r => `${pct(r.falseClosed)} · ${pct(r.caught)}`)])));
if (opt("--json")) { writeFileSync(opt("--json"), JSON.stringify(out, null, 1)); console.log("wrote " + opt("--json")); }
