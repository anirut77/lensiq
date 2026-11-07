#!/usr/bin/env node
// tests/bench/creative.bench.mjs — predicted attention of creative.html (creative-core.js) on MIT1003 eye-tracking data.
//
//   python3 -I tests/bench/fetch_datasets.py /path/to/data mit1003
//   LQ_BENCH_DATA=/path/to/data node tests/bench/creative.bench.mjs [--fit] [--params '{"cb":0.8}'] [--json out.json] [--limit N]
//
// Stage 1 (headless Chrome, no WebGL, cached): for every image the SAME page pipeline as creative.js — decode, canvas
//   ≤1600 px (faces: face-api TinyFaceDetector 416 / 0.5) and ≤512 px (detectText + components: spectral residual and
//   Itti-lite at 128 px). Ground truth: *_fixPts.jpg (fixation pixels of 15 viewers) binned to the map grid, and
//   *_fixMap.jpg area-averaged to the map grid (for CC).
// Stage 2 (Node): C.combine with C.PARAMS (or the --fit search) and the metrics of Bylinskii et al. (PAMI 2019):
//   AUC-Judd, AUC-Borji (100 splits), NSS, CC. Split: seeded shuffle, 300 tuning images / 703 held-out test images.
//   --fit: coordinate search of the combination weights on the 300 tuning images (objective NSS + CC), then reports the
//   held-out numbers for the fitted weights. Copy them into PARAMS in creative-core.js.
// MIT1003 has no stated licence: research evaluation only, nothing from it is copied into the repo.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { CACHE, REPO, needData, openBench, dataUrl, fx, table } from "./lib.mjs";

const require = createRequire(import.meta.url);
const C = require(join(REPO, "creative-core.js"));
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const root = needData("mit1003", "creative (MIT1003) benchmark");
let names = readdirSync(join(root, "ALLSTIMULI")).filter(f => /\.jpe?g$/i.test(f)).map(f => f.replace(/\.jpe?g$/i, "")).sort();
names = names.filter(n => existsSync(join(root, "ALLFIXATIONMAPS", n + "_fixPts.jpg")) && existsSync(join(root, "ALLFIXATIONMAPS", n + "_fixMap.jpg")));
if (opt("--limit")) names = names.slice(0, +opt("--limit"));

// ---------------------------------------------------------------- stage 1: browser features (cached)
const file = join(CACHE, `creative-mit1003-v${C.VERSION}.json`);
let rows = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
const have = new Set(rows.map(r => r.n));
const todo = names.filter(n => !have.has(n));
if (todo.length) {
  const b = await openBench();
  try {
    await b.page.evaluate(`new Promise((res, rej) => { const s = document.createElement("script"); s.src = "/creative-core.js"; s.onload = res; s.onerror = rej; document.head.append(s); })
      .then(() => faceapi.nets.tinyFaceDetector.loadFromUri("vendor/models/"))`);
    const PAGE = async (list) => {
      const C = window.LQCreative, out = [];
      const load = async u => createImageBitmap(await (await fetch(u)).blob());
      const canv = (src, side) => { const s = C.fitSize(src.width, src.height, side), c = document.createElement("canvas"); c.width = s.w; c.height = s.h; const x = c.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, s.w, s.h); return c; };
      const pix = src => { const c = document.createElement("canvas"); c.width = src.width; c.height = src.height; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(src, 0, 0); return x.getImageData(0, 0, c.width, c.height); };
      const b64 = a => { let s = ""; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); };
      const q8 = m => { const n = C.normalize(m), u = new Uint8Array(n.length); for (let i = 0; i < n.length; i++) u[i] = Math.round(n[i] * 255); return b64(u); };
      const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
      for (const it of list) {
        const bmp = await load(it.img), show = canv(bmp, 1600), work = canv(show, 512);
        const img = work.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, work.width, work.height);
        const texts = C.detectText(img).map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h }));
        const faces = (await faceapi.detectAllFaces(show, opts)).map(d => ({ x: d.box.x / show.width, y: d.box.y / show.height, w: d.box.width / show.width, h: d.box.height / show.height }));
        const comp = C.components(img), w = comp.w, h = comp.h;
        const P = pix(await load(it.pts)), fix = [];
        for (let y = 0; y < P.height; y++) for (let x = 0; x < P.width; x++) if (P.data[4 * (y * P.width + x)] > 128) fix.push(Math.min(h - 1, Math.floor(y * h / P.height)) * w + Math.min(w - 1, Math.floor(x * w / P.width)));
        const M = pix(await load(it.map)), g = new Float32Array(M.width * M.height);
        for (let i = 0; i < g.length; i++) g[i] = M.data[4 * i];
        out.push({ n: it.n, w, h, sr: q8(comp.sr), ik: q8(comp.ik), gt: q8(C.resample(g, M.width, M.height, w, h)), fix, faces, texts });
      }
      return out;
    };
    for (let i = 0; i < todo.length; i += 10) {
      const list = todo.slice(i, i + 10).map(n => ({ n, img: dataUrl(join("mit1003", "ALLSTIMULI", n + ".jpeg")), pts: dataUrl(join("mit1003", "ALLFIXATIONMAPS", n + "_fixPts.jpg")), map: dataUrl(join("mit1003", "ALLFIXATIONMAPS", n + "_fixMap.jpg")) }));
      rows.push(...await b.page.evaluate(PAGE, list));
      process.stderr.write(`\r  MIT1003: ${rows.length}/${names.length}`);
      if (i % 100 === 0) writeFileSync(file, JSON.stringify(rows));
    }
    process.stderr.write("\n");
    writeFileSync(file, JSON.stringify(rows));
  } finally { await b.done(); }
}
const byName = new Map(rows.map(r => [r.n, r]));
const un8 = s => { const b = Buffer.from(s, "base64"), f = new Float32Array(b.length); for (let i = 0; i < b.length; i++) f[i] = b[i] / 255; return f; };
const data = names.map(n => byName.get(n)).filter(Boolean).map(r => ({ ...r, comp: { sr: un8(r.sr), ik: un8(r.ik), w: r.w, h: r.h }, gtm: un8(r.gt) }));

// ---------------------------------------------------------------- split
const R = C.rng(42), order = data.map((d, i) => [R(), i]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
const nTune = Math.min(300, Math.floor(data.length * 0.3));
const tune = order.slice(0, nTune).map(i => data[i]), test = order.slice(nTune).map(i => data[i]);

// ---------------------------------------------------------------- stage 2: metrics
function evaluate(set, mk, { borji = true } = {}) {
  let aj = 0, ab = 0, ns = 0, c = 0, n = 0;
  for (const d of set) {
    if (!d.fix.length) continue;
    const m = mk(d);
    aj += C.aucJudd(m, d.fix); if (borji) ab += C.aucBorji(m, d.fix, { nSplits: 100, seed: 7 }); ns += C.nss(m, d.fix); c += C.cc(m.data, d.gtm); n++;
  }
  return { n, aucJudd: aj / n, aucBorji: borji ? ab / n : NaN, nss: ns / n, cc: c / n };
}
const full = p => d => C.combine(d.comp, { faces: d.faces, texts: d.texts }, p);
const centre = s => d => { const m = C.centerBias(d.w, d.h, s, s); return { data: m, w: d.w, h: d.h }; };

let P = { ...C.PARAMS, ...(opt("--params") ? JSON.parse(opt("--params")) : {}) };
if (args.includes("--fit")) {
  const GRID = { sr: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1], ik: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1], face: [0, 0.3, 0.6, 1, 1.5], text: [0, 0.15, 0.25, 0.5, 0.8],
    cb: [0.4, 0.55, 0.65, 0.75, 0.85, 0.95, 1], cbSigma: [0.18, 0.21, 0.24, 0.27, 0.3, 0.35], sigma: [0.02, 0.03, 0.035, 0.045, 0.06] };
  const obj = p => { const e = evaluate(tune, full(p), { borji: false }); return e.nss + e.cc; };
  let best = obj(P);
  for (let pass = 0; pass < 2; pass++) for (const k of Object.keys(GRID)) {
    for (const v of GRID[k]) { const q = { ...P, [k]: v }; const o = obj(q); if (o > best + 1e-6) { best = o; P = q; } }
    console.error(`  pass ${pass + 1} ${k} -> ${P[k]} (NSS+CC ${best.toFixed(4)})`);
  }
  console.log("fitted PARAMS (tuning split):", JSON.stringify(P));
}
const cbS = P.cbSigma;
const variants = [
  ["chance (uniform map)", d => ({ data: new Float32Array(d.w * d.h).fill(1), w: d.w, h: d.h })],
  ["centre bias only", centre(cbS)],
  ["spectral residual only (no centre bias)", full({ ...P, sr: 1, ik: 0, face: 0, text: 0, cb: 0 })],
  ["Itti-lite only (no centre bias)", full({ ...P, sr: 0, ik: 1, face: 0, text: 0, cb: 0 })],
  ["SR + Itti-lite + face/text priors, no centre bias", full({ ...P, cb: 0 })],
  ["SR + Itti-lite + centre bias, no face/text priors", d => C.combine(d.comp, {}, P)],
  ["full (creative.html)", full(P)]
];
const res = variants.map(([name, mk]) => [name, evaluate(test, mk)]);
const withFace = test.filter(d => d.faces.length), withText = test.filter(d => d.texts.length);
const fsub = [["full, images with a detected face", evaluate(withFace, full(P))], ["same images, no face prior", evaluate(withFace, full({ ...P, face: 0 }))],
  ["full, images with detected text", evaluate(withText, full(P))], ["same images, no text prior", evaluate(withText, full({ ...P, text: 0 }))]];
console.log(`\nMIT1003 held-out test split: ${test.length} images (tuning ${tune.length}); map ${data[0].w}×${data[0].h}-ish, fixations of 15 viewers`);
console.log(`faces detected in ${withFace.length} test images, text boxes in ${withText.length}`);
console.log("params", JSON.stringify(P), "\n");
console.log(table(["model", "n", "AUC-Judd", "AUC-Borji", "NSS", "CC"], [...res, ...fsub].map(([k, e]) => [k, e.n, fx(e.aucJudd), fx(e.aucBorji), fx(e.nss), fx(e.cc)])));
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ params: P, test: test.length, tune: tune.length, results: Object.fromEntries([...res, ...fsub]) }, null, 2));
