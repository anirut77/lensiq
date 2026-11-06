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
// Round 5: the same frames also give the two 32×16 grey eye patches driver.js crops from the video (eyePatchRect), and
// the page's eye-patch classifier (eyeClosedScore, trained on Open/Closed Eyes only by tests/bench/driver-eye-train.cjs)
// is compared with EAR. CEW is never used for training or for choosing a threshold.
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
  const patches = inputSize === 224; // eye patches for the classifier at the page's default input size
  const file = join(CACHE, `driver-${set.name}-${inputSize}${patches ? "p" : ""}.json`);
  if (existsSync(file)) { const c = JSON.parse(readFileSync(file, "utf8")); if (c.length === idx.length) return { idx, rows: c }; }
  const b = await B(), rows = [], t0 = Date.now();
  for (let i = 0; i < idx.length; i += 16) {
    const urls = idx.slice(i, i + 16).map(x => dataUrl(join(set.name, x.f)));
    rows.push(...await b.page.evaluate(`LQB2.driver(${JSON.stringify(urls)}, ${JSON.stringify({ inputSize, scoreThreshold: 0.4, patches, ...set.prep })})`));
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
  const file = join(CACHE, `driver-${set.name}-jitp.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const open = idx.map((x, i) => [x, i]).filter(([x]) => !x.closed).slice(0, NPERS), b = await B(), out = [];
  for (const [x] of open) {
    const u = dataUrl(join(set.name, x.f)), rs = [];
    for (let a = 1; a <= NAUG; a++) rs.push(...await b.page.evaluate(`LQB2.driver(${JSON.stringify([u])}, ${JSON.stringify({ inputSize: 224, scoreThreshold: 0.4, aug: a, patches: true, ...set.prep })})`));
    out.push(rs.filter(r => r.n).map(r => ({ pts: r.pts, eyes: r.eyes })));
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
const dec = b => Uint8Array.from(Buffer.from(b, "base64"));
/* the page's per-frame metrics: faceMetrics + eyeClosedScore on the two eye patches (driver.js loop) */
const metricsOf = r => { const m = DR.faceMetrics(r.pts.map(([x, y]) => ({ x, y }))); m.eyeScore = r.eyes ? DR.eyeClosedScore(dec(r.eyes[0]), dec(r.eyes[1]), m.ear) : NaN; return m; };
const pr = (tp, fp) => tp + fp ? tp / (tp + fp) : NaN;
const at = (closed, open, thr) => { const tp = closed.filter(e => e < thr).length, fp = open.filter(e => e < thr).length; return { thr, tpr: tp / closed.length, fpr: fp / open.length, bacc: (tp / closed.length + 1 - fp / open.length) / 2 }; };

const out = { date: new Date().toISOString(), sets: [] };
try {
  for (const set of SETS) for (const inputSize of [224, 320]) {
    const { idx, rows } = await run(set, inputSize);
    const closed = [], open = [], sC = [], sO = [], closedM = []; let fC = 0, fO = 0, nC = 0, nO = 0;
    rows.forEach((r, i) => {
      const isC = idx[i].closed; isC ? nC++ : nO++;
      if (!r.n) return;
      isC ? fC++ : fO++;
      const m = metricsOf(r);
      (isC ? closed : open).push(m.ear);
      if (Number.isFinite(m.eyeScore)) (isC ? sC : sO).push(m.eyeScore);
      if (isC) closedM.push(m);
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
    if (inputSize === 224 && sC.length) {
      /* classifier: "closed" when score > baseline + eyeDelta; baseline approximated (as for EAR) by the set's median
         open-eye score. Precision = closed-eye frames among frames called closed, at this set's closed:open mix. */
      const base = DR.median(sO), thr = base + DR.DR_DEFAULTS.eyeDelta;
      const tp = sC.filter(v => v > thr).length, fp = sO.filter(v => v > thr).length;
      const earThr = ratioThr(DR.DR_DEFAULTS.earRatio), etp = closed.filter(e => e < earThr).length, efp = open.filter(e => e < earThr).length;
      res.eye = { auc: auc(sC.map(v => -v), sO.map(v => -v)), base, thr, // P(closed score > open score)
        clf: { tpr: tp / sC.length, fpr: fp / sO.length, prec: pr(tp, fp) },
        ear: { tpr: etp / closed.length, fpr: efp / open.length, prec: pr(etp, efp) },
        closedM, abs: [0, 1, 2, 3].map(t => ({ t, tpr: sC.filter(v => v > t).length / sC.length, fpr: sO.filter(v => v > t).length / sO.length })) };
    }
    if (inputSize === 224) {
      const per = (await jittered(set, idx)).map(e => e.map(metricsOf)).filter(e => e.length >= 4);
      /* the page rule end to end: calibrate() on the person's own jittered open-eye frames, then createMonitor's rule */
      /* "caught": that person's thresholds applied to the set's closed-eye photos, averaged over people (old = EAR only) */
      let cf = 0, cn = 0, off = 0, ef = 0, caught = 0, caughtOld = 0;
      for (const e of per) {
        const c = DR.calibrate(e.map(m => ({ face: true, ...m })), DR.DR_DEFAULTS.earRatio, { calibMinSamples: 4 });
        if (c.eyeThr == null) off++;
        const isClosed = m => c.eyeThr != null && Number.isFinite(m.eyeScore) ? m.eyeScore > c.eyeThr : m.ear < c.thr;
        for (const m of e) { cn++; if (isClosed(m)) cf++; if (m.ear < c.thr) ef++; }
        if (res.eye) { caught += res.eye.closedM.filter(isClosed).length / res.eye.closedM.length; caughtOld += res.eye.closedM.filter(m => m.ear < c.thr).length / res.eye.closedM.length; }
      }
      res.perDriverPage = { persons: per.length, frames: cn, falseClosed: cf / cn, falseClosedOld: ef / cn, classifierOff: off, caught: caught / per.length, caughtOld: caughtOld / per.length };
      if (res.eye) delete res.eye.closedM;
      res.perDriver = { persons: per.length, frames: per.reduce((a, e) => a + e.length, 0),
        ratios: [0.7, 0.75, 0.8, 0.85, 0.9].map(k => {
          let f = 0, n = 0; for (const e0 of per) { const e = e0.map(m => m.ear); const thr = Math.min(DR.DR_DEFAULTS.earMax, Math.max(DR.DR_DEFAULTS.earMin, DR.median(e) * k)); f += e.filter(v => v < thr).length; n += e.length; }
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
console.log("\n### Round 5: eye-patch classifier (driver.js eyeClosedScore) vs EAR, faces found, @224\n");
console.log(table(["data set", "AUC EAR → classifier", "EAR × " + DR.DR_DEFAULTS.earRatio + ": caught · open called closed · precision", `classifier (base + ${DR.DR_DEFAULTS.eyeDelta}): caught · open called closed · precision`, "page rule on own jittered open frames: open called closed (classifier off)"],
  out.sets.filter(s => s.eye).map(s => [s.label, `${fx(s.auc)} → ${fx(s.eye.auc)}`, `${pct(s.eye.ear.tpr)} · ${pct(s.eye.ear.fpr)} · ${pct(s.eye.ear.prec)}`, `${pct(s.eye.clf.tpr)} · ${pct(s.eye.clf.fpr)} · ${pct(s.eye.clf.prec)}`,
    s.perDriverPage ? `${pct(s.perDriverPage.falseClosed, 2)} (${s.perDriverPage.classifierOff}/${s.perDriverPage.persons} people)` : "—"])));
console.log("\n### Round 5, the page rule end to end: each person calibrated on their own jittered open-eye frames (calibrate + createMonitor rule)\n");
console.log(table(["data set", "people / open frames", "closed photos caught, old (EAR × " + DR.DR_DEFAULTS.earRatio + ") → new", "open frames called closed, old → new", "people where the classifier stays off (EAR used)"],
  out.sets.filter(s => s.perDriverPage && s.perDriverPage.caught != null).map(s => { const p = s.perDriverPage; return [s.label, `${p.persons} / ${p.frames}`, `${pct(p.caughtOld)} → ${pct(p.caught)}`, `${pct(p.falseClosedOld, 2)} → ${pct(p.falseClosed, 2)}`, `${p.classifierOff}`]; })));
console.log("\nNo personal baseline (absolute score threshold; NOT used by the page — shown to explain why the page needs calibration):");
console.log(table(["data set", ...[0, 1, 2, 3].map(t => `score > ${t}: caught · open called closed`)], out.sets.filter(s => s.eye).map(s => [s.label, ...s.eye.abs.map(a => `${pct(a.tpr)} · ${pct(a.fpr)}`)])));
console.log("\nOpen/Closed Eyes is the classifier's training set: its rows are in-sample (5-fold out-of-fold AUC: see tests/bench/driver-eye-train.cjs).");
if (opt("--json")) { writeFileSync(opt("--json"), JSON.stringify(out, null, 1)); console.log("wrote " + opt("--json")); }
