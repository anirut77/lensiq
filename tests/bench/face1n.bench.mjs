#!/usr/bin/env node
// tests/bench/face1n.bench.mjs — 1:N face identification as attendance.js / customers.js run it, with the round-4 safeguards:
// multi-photo enrolment, per-person thresholds (LQTrack.enrolGallery), quality gating (LQTrack.faceQuality/qualityOk)
// and multi-frame consensus (LQTrack.createConsensus). Same face-api pipeline (TinyFaceDetector 320/0.5 + 68 landmarks +
// 128-D descriptor) in headless Chrome on WASM.
//
//   LQ_BENCH_DATA=/path/to/data node tests/bench/face1n.bench.mjs [--json out.json] [--trials 200]
//
// Data (evaluation only, never committed):
//   lfwfull/lfw/<Name>/<Name>_NNNN.jpg  full LFW (13,233 images, 5,749 people) — tuning set (mostly non-Asian adults)
//   casia5/img/PPP_K.jpg                CASIA-FaceV5 (500 Asian people × 5 photos, 112 px aligned) — HELD OUT, per group
// Each photo is analysed as 3 "video frames" (the photo + 2 seeded jitters: ±6% scale, ±3% shift, ±15% exposure, slight
// defocus), because the pages see a few consecutive frames of one pose, never independent photos.
// Members: people with ≥ 4 photos (LFW) / all 500 (CASIA): photos 1–3 = enrolment, the last photo = probe "visit".
// Strangers: people never enrolled (one photo, one visit each). 200 random galleries of N members per row.
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE, DATA, openBench, pct, table } from "./lib.mjs";

const require = createRequire(import.meta.url);
const T = require("../../lensiq-track.js");
const M = require("./metrics.cjs");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const TRIALS = +opt("--trials", 200);
const have = sub => DATA && existsSync(join(DATA, sub));
if (!have("lfwfull/lfw") && !have("casia5/img")) { console.log("skip face 1:N benchmark: no lfwfull/lfw or casia5/img under " + (DATA || "LQ_BENCH_DATA (not set)")); process.exit(0); }

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

let bench = null;
const B = async () => (bench = bench || await openBench());
async function frames(name, urls, opts, batch = 20) {
  const file = join(CACHE, name);
  if (existsSync(file)) { const c = JSON.parse(readFileSync(file, "utf8")); if (c.length === urls.length) return c; }
  const b = await B(), out = [], t0 = Date.now();
  for (let i = 0; i < urls.length; i += batch) {
    out.push(...await b.page.evaluate(`LQB.faceFrames(${JSON.stringify(urls.slice(i, i + batch))}, ${JSON.stringify({ ...opts, seed: 1 + i })})`));
    process.stderr.write(`\r  ${name}: ${out.length}/${urls.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  process.stderr.write("\n");
  writeFileSync(file, JSON.stringify(out));
  return out;
}

// ---------- datasets -> {members:[{id, photos:[frames[]]}], strangers:[{id, photos:[frames[]]}]} ----------
async function loadLfw() {
  const root = join(DATA, "lfwfull/lfw");
  const people = readdirSync(root).filter(n => !n.startsWith(".")).sort().map(n => ({ n, f: readdirSync(join(root, n)).filter(f => f.endsWith(".jpg")).sort() }));
  seed = 11;
  const mem = people.filter(p => p.f.length >= 4).map(p => ({ id: p.n, f: p.f.slice(0, 4) }));
  const str = shuffle(people.filter(p => p.f.length === 1)).slice(0, 1200).map(p => ({ id: p.n, f: p.f }));
  const list = [...mem, ...str].flatMap(p => p.f.map(f => `/__data/lfwfull/lfw/${p.id}/${f}`));
  const fr = await frames(`face1n-lfw-${list.length}.json`, list, { inputSize: 320, scoreThreshold: 0.5, jitter: 2 });
  let k = 0; const take = p => ({ id: p.id, photos: p.f.map(() => fr[k++]) });
  return { name: "LFW (tuning set)", members: mem.map(take), strangers: str.map(take) };
}
async function loadCasia() {
  const root = join(DATA, "casia5/img");
  const by = new Map();
  for (const f of readdirSync(root).filter(f => /^\d+_\d\.jpg$/.test(f)).sort()) { const id = f.split("_")[0]; if (!by.has(id)) by.set(id, []); by.get(id).push(f); }
  const people = [...by].map(([id, f]) => ({ id, f })).filter(p => p.f.length >= 4);
  const list = people.flatMap(p => p.f.map(f => `/__data/casia5/img/${f}`));
  // 112 px tight aligned crops -> drawn 1.5× (168 px) on a 320 px grey canvas, like a webcam face at ~1 m. (2.5× on 400 px
  // left too little context around the face: TinyFaceDetector found only 29% of the faces.)
  const fr = await frames(`face1n-casia-u15-${list.length}.json`, list, { inputSize: 320, scoreThreshold: 0.5, jitter: 2, upscale: 1.5, padTo: 320 });
  let k = 0; const all = people.map(p => ({ id: p.id, photos: p.f.map(() => fr[k++]) }));
  // half of the people can be enrolled, the other half are strangers (one visit each: their first photo)
  seed = 13; const sh = shuffle(all);
  return { name: "CASIA-FaceV5 (Asian, held out)", members: sh.slice(0, 250).map(p => ({ ...p, photos: p.photos.slice(0, 4) })), strangers: sh.slice(250).map(p => ({ ...p, photos: [p.photos[0]] })) };
}

// ---------- policies ----------
const mean = ds => Array.from(ds[0], (_, i) => ds.reduce((s, d) => s + d[i], 0) / ds.length);
const okFrames = (ph, q) => ph.filter(f => f.n && (!q || T.qualityOk(f.q, q)));
// enrolment descriptor of one photo = mean of its frames (the pages average 3 capture frames)
const enrolDesc = (ph, q) => { const f = okFrames(ph, q); return f.length ? mean(f.map(x => x.desc)) : null; };
const R4 = { photos: 3, centroid: true, t: 0.55, mg: 0.05, k: 0.85, floor: 0.45, q: {}, need: 2 }; // = attendance.js / customers.js defaults
const POLICIES = process.env.LQ_BENCH_ONLY ? [] : [
  // label, enrol photos, centroid (mean of the photos), threshold t, margin, per-person k/floor (0 = off), quality gate, consensus need-of-3
  { label: "round 3: 1 photo, 0.55 + margin 0.05, 1 frame (attendance)", photos: 1, t: 0.55, mg: 0.05, k: 0, q: null, need: 1 },
  { label: "round 3: 1 photo, 0.50 + margin 0.05, 1 frame (customers)", photos: 1, t: 0.50, mg: 0.05, k: 0, q: null, need: 1 },
  { label: "R4 rules, 1 enrolment photo (members enrolled before R4)", ...R4, photos: 1 },
  { label: "R4 rules, 2 enrolment photos", ...R4, photos: 2 },
  { label: "R4 default: 3 photos (centroid), 0.55 + margin, per-person k 0.85, quality, 2 of 3", ...R4 },
  { label: "R4 without quality gate", ...R4, q: null },
  { label: "R4 without per-person limit", ...R4, k: 0 },
  { label: "R4 without consensus (1 frame)", ...R4, need: 1 },
  { label: "R4 but 3 separate entries (no centroid)", ...R4, centroid: false }
];
if (process.env.LQ_BENCH_EXTRA) POLICIES.push(...JSON.parse(process.env.LQ_BENCH_EXTRA));

/* Fast but equivalent to the pages: for each probe frame we keep the nearest enrolled label (d1), the nearest OTHER label
   (d2) and the best label's per-person limit, then apply LQTrack.matchFace's rule (d1 < limit, d2 - d1 >= margin) per
   policy. A visit = the 3 frames of one photo; its label is the one that wins `need` frames (LQTrack.createConsensus). */
const fdist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const v = a[i] - b[i]; s += v * v; } return Math.sqrt(s); };
function nearest2(d, gal) {
  let b = null, d1 = Infinity, d2 = Infinity;
  for (const g of gal) { const x = fdist(d, g.d); if (x < d1) { if (b !== g.label) d2 = d1; d1 = x; b = g.label; } else if (x < d2 && g.label !== b) d2 = x; }
  return { b, d1, d2 };
}
function visitLabel(frames, P, nnOf) {
  const cons = T.createConsensus({ need: P.need, of: 3, windowMs: 1e9 });
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    let lab = "unknown";
    if (f && f.ok) {
      const lim = P.k && Number.isFinite(nnOf(f.b)) ? Math.max(P.floor || 0.4, Math.min(P.t, P.k * nnOf(f.b))) : P.t;
      if (f.d1 < lim && !(f.d2 - f.d1 < P.mg)) lab = f.b;
    }
    const got = cons.push("v", lab, i);
    if (got) return got;
  }
  return "unknown";
}
function evalAll(ds, N) {
  const acc = POLICIES.map(() => ({ gen: 0, ok: 0, mis: 0, str: 0, fa: 0 }));
  const groups = new Map(); // "photos|q" -> policy indexes
  POLICIES.forEach((P, k) => { const key = P.photos + "|" + (P.q ? JSON.stringify(P.q) : "") + "|" + (P.centroid ? "c" : ""); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(k); });
  for (let trial = 0; trial < TRIALS; trial++) {
    const gal = shuffle(ds.members).slice(0, N), inGal = new Set(gal.map(m => m.id));
    const strangers = shuffle([...ds.strangers, ...ds.members.filter(m => !inGal.has(m.id))]).slice(0, 60);
    for (const idx of groups.values()) {
      const P0 = POLICIES[idx[0]];
      const people = [];
      for (const m of gal) { const e = m.photos.slice(0, P0.photos).map(ph => enrolDesc(ph, P0.q)).filter(Boolean); if (e.length) people.push({ label: m.id, ds: P0.centroid ? [mean(e)] : e }); }
      const entries = people.flatMap(p => p.ds.map(d => ({ label: p.label, d })));
      // distance from each person to the nearest other enrolled person (enrolGallery's k × nn)
      const nn = new Map(people.map(p => [p.label, Infinity]));
      for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
        let m = Infinity; for (const a of people[i].ds) for (const b of people[j].ds) { const x = fdist(a, b); if (x < m) m = x; }
        if (m < nn.get(people[i].label)) nn.set(people[i].label, m);
        if (m < nn.get(people[j].label)) nn.set(people[j].label, m);
      }
      const nnOf = l => nn.get(l);
      const enrolled = new Set(people.map(p => p.label));
      const frameInfo = ph => ph.map(f => { const ok = !!(f.n && (!P0.q || T.qualityOk(f.q, P0.q))); return ok ? { ok, ...nearest2(f.desc, entries) } : { ok: false }; });
      const gen = gal.filter(m => enrolled.has(m.id)).map(m => [m.id, frameInfo(m.photos[m.photos.length - 1])]);
      const str = strangers.map(s => frameInfo(s.photos[0]));
      for (const k of idx) {
        const P = POLICIES[k], a = acc[k];
        for (const [id, fr] of gen) { a.gen++; const r = visitLabel(fr, P, nnOf); if (r === id) a.ok++; else if (r !== "unknown") a.mis++; }
        for (const fr of str) { a.str++; if (visitLabel(fr, P, nnOf) !== "unknown") a.fa++; }
      }
    }
  }
  return acc.map(a => ({ gen: a.gen, ok: a.ok / a.gen, mis: a.mis / a.gen, str: a.str, fa: a.fa / a.str, faN: a.fa }));
}

const out = { date: new Date().toISOString(), trials: TRIALS, sets: [] };
try {
  const sets = [];
  if (have("lfwfull/lfw")) sets.push(await loadLfw());
  if (have("casia5/img")) sets.push(await loadCasia());
  for (const ds of sets) {
    const allF = [...ds.members, ...ds.strangers].flatMap(p => p.photos.flat());
    const found = allF.filter(f => f.n).length, qok = allF.filter(f => f.n && T.qualityOk(f.q, {})).length;
    console.log(`\n## 1:N identification — ${ds.name}: ${ds.members.length} members, ${ds.strangers.length} strangers, ${allF.length} frames (face found ${pct(found / allF.length)}, passes quality gate ${pct(qok / Math.max(1, found))} of found)\n`);
    const rows = [], res = { name: ds.name, members: ds.members.length, strangers: ds.strangers.length, faceFound: found / allF.length, qualityPass: qok / Math.max(1, found), rows: [] };
    for (const N of (process.env.LQ_BENCH_N ? process.env.LQ_BENCH_N.split(",").map(Number) : [20, 100, 200]).filter(n => n <= ds.members.length)) evalAll(ds, N).forEach((r, k) => {
      const P = POLICIES[k];
      const [lo, hi] = M.wilson(r.faN, r.str);
      res.rows.push({ N, policy: P.label, recognised: r.ok, misidentified: r.mis, strangerAccepted: r.fa, ci: [lo, hi], probes: r.gen, strangers: r.str });
      rows.push([N, P.label, pct(r.ok), pct(r.mis, 2), `${pct(r.fa, 2)} [${pct(lo, 1)}–${pct(hi, 1)}]`]);
    });
    console.log(table(["enrolled", "policy", "member recognised", "member shown as someone else", "stranger accepted [95% CI]"], rows));
    out.sets.push(res);
  }
} finally { if (bench) await bench.done(); }
if (opt("--json")) { writeFileSync(opt("--json"), JSON.stringify(out, null, 1)); console.log("\nwrote " + opt("--json")); }
