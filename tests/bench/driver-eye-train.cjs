#!/usr/bin/env node
// tests/bench/driver-eye-train.cjs — reproduces driver.js EYE_MODEL (eye-patch closed-eye classifier).
//
//   LQ_BENCH_DATA=/path/to/data node tests/bench/driver.bench.mjs        # first: caches landmarks + eye patches
//   LQ_BENCH_DATA=/path/to/data node tests/bench/driver-eye-train.cjs     # prints 5-fold OOF AUC + the weights
//
// Training data: Open/Closed Eyes ONLY (HF MichalMlodawski/closed-open-eyes, ODC-BY 1.0). CEW (research only) is never
// read here; it is used by driver.bench.mjs for evaluation only. Model: logistic regression on the 16×8 normalised patch
// of each eye (driver.js eyeVec; image-right eye mirrored) + one EAR term, class-balanced, L2 1e-2, 300 full-batch steps.
// The prediction is the mean logit of the two eyes (driver.js eyeClosedScore).
"use strict";
const fs = require("node:fs"), path = require("node:path");
const DR = require(path.join(__dirname, "..", "..", "driver.js"));
const DATA = process.env.LQ_BENCH_DATA, CACHE = process.env.LQ_BENCH_CACHE || (DATA && path.join(DATA, ".lq-cache"));
const cacheFile = CACHE && path.join(CACHE, "driver-oceyes-224p.json");
if (!DATA || !fs.existsSync(cacheFile)) { console.log("skip: run tests/bench/driver.bench.mjs first (needs LQ_BENCH_DATA with oceyes/)"); process.exit(0); }

const dec = b => Uint8Array.from(Buffer.from(b, "base64"));
const idx = JSON.parse(fs.readFileSync(path.join(DATA, "oceyes", "index.json"), "utf8"));
const rows = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
const D = rows.map((r, i) => r.n ? { y: idx[i].closed ? 1 : 0, ear: DR.faceMetrics(r.pts.map(([x, y]) => ({ x, y }))).ear, g: r.eyes.map(dec) } : null).filter(Boolean)
  .map(d => ({ ...d, X: [DR.eyeVec(d.g[0], false), DR.eyeVec(d.g[1], true)] }));

function train(S, l2 = 1e-2, iters = 300) {
  const w = new Float64Array(130), n = S.length, pos = S.filter(d => d.y).length, wp = n / (2 * pos), wn = n / (2 * (n - pos));
  for (let t = 0; t < iters; t++) {
    const g = new Float64Array(130);
    for (const d of S) for (const x of d.X) {
      const e20 = (d.ear - 0.3) * 20; let z = w[128] + w[129] * e20;
      for (let k = 0; k < 128; k++) z += w[k] * x[k];
      const err = (1 / (1 + Math.exp(-z)) - d.y) * (d.y ? wp : wn);
      for (let k = 0; k < 128; k++) g[k] += err * x[k];
      g[128] += err; g[129] += err * e20;
    }
    for (let k = 0; k < 130; k++) w[k] -= 0.5 * (g[k] / n / 2 + l2 * (k < 128 ? w[k] : 0));
  }
  return { w: Array.from(w.slice(0, 128)), b: w[128], e: w[129] };
}
const score = (m, d) => DR.eyeClosedScore(d.g[0], d.g[1], d.ear, m);
const auc = (p, q) => { let s = 0; for (const a of p) for (const b of q) s += a > b ? 1 : a === b ? 0.5 : 0; return s / p.length / q.length; };

let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const fold = D.map(() => Math.floor(rnd() * 5)), oof = new Array(D.length);
for (let f = 0; f < 5; f++) { const m = train(D.filter((_, i) => fold[i] !== f)); D.forEach((d, i) => { if (fold[i] === f) oof[i] = score(m, d); }); }
console.log(`Open/Closed Eyes: ${D.length} faces found; 5-fold out-of-fold AUC ${auc(oof.filter((_, i) => D[i].y), oof.filter((_, i) => !D[i].y)).toFixed(3)}`);
const M = train(D), r3 = v => +v.toFixed(3);
console.log(JSON.stringify({ b: r3(M.b), e: r3(M.e), w: M.w.map(r3) }));
