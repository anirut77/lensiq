#!/usr/bin/env node
// tests/bench/face.bench.mjs — face pipeline accuracy (face-api.js, TF.js WASM, headless Chrome, production options).
//
//   LQ_BENCH_DATA=/path/to/data node tests/bench/face.bench.mjs [--json out.json] [--limit N]
//
// 1) Verification on LFW pairs ($LQ_BENCH_DATA/lfw/pairs.json + lfw/img/*): TinyFaceDetector(inputSize 320, score 0.5)
//    -> 68 landmarks -> 128-D descriptor, Euclidean distance — the attendance.js / customers.js / booth.js path.
//    Reported at the thresholds the pages use: attendance 0.55 (adjustable 0.30–0.70), customers 0.50, booth 0.50.
// 2) Age / gender on a UTKFace subset ($LQ_BENCH_DATA/utk/index.json + utk/img/*): ageGenderNet as signage.js uses it,
//    with signage's own rules (male > 0.6 / female < 0.4 / otherwise "unsure"; age bands <18, 18–34, 35–54, 55+).
// Sections whose data is missing are skipped. Results are cached in $LQ_BENCH_CACHE.
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE, DATA, openBench, pct, fx, table } from "./lib.mjs";

const require = createRequire(import.meta.url);
const M = require("./metrics.cjs");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const limit = +opt("--limit", 0) || Infinity;
const have = sub => DATA && existsSync(join(DATA, sub));
if (!have("lfw/pairs.json") && !have("utk/index.json")) { console.log("skip face benchmark: no lfw/pairs.json or utk/index.json under " + (DATA || "LQ_BENCH_DATA (not set)")); process.exit(0); }

let bench = null;
const B = async () => (bench = bench || await openBench());
async function cached(name, list, fn, batch = 25) {
  const file = join(CACHE, name);
  if (existsSync(file)) { const c = JSON.parse(readFileSync(file, "utf8")); if (c.length === list.length) return c; }
  const b = await B(), out = [], t0 = Date.now();
  for (let i = 0; i < list.length; i += batch) {
    out.push(...await fn(b.page, list.slice(i, i + batch)));
    process.stderr.write(`\r  ${name}: ${out.length}/${list.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  process.stderr.write("\n");
  writeFileSync(file, JSON.stringify(out));
  return out;
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };
const out = { date: new Date().toISOString() };

try {
  if (have("lfw/pairs.json")) {
    const pairs = JSON.parse(readFileSync(join(DATA, "lfw/pairs.json"), "utf8")).slice(0, limit);
    const imgs = [...new Set(pairs.flatMap(p => [p.a, p.b]))];
    const res = await cached(`lfw-desc-${imgs.length}.json`, imgs, (page, urls) => page.evaluate(`LQB.faces(${JSON.stringify(urls.map(u => "/__data/lfw/" + u))}, { inputSize: 320, scoreThreshold: 0.5 })`));
    const byImg = new Map(imgs.map((u, i) => [u, res[i]]));
    const same = [], diff = []; let ftd = 0;
    for (const p of pairs) {
      const a = byImg.get(p.a), b = byImg.get(p.b);
      if (!a.n || !b.n) { ftd++; (p.same ? same : diff).push(Infinity); continue; } // no face = no match, like the pages
      (p.same ? same : diff).push(dist(a.desc, b.desc));
    }
    const noFaceImgs = res.filter(r => !r.n).length;
    const THR = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65];
    const v = M.verification(same, diff, THR);
    const fin = a => a.filter(Number.isFinite);
    const e = M.eer(fin(same), fin(diff));
    out.lfw = { pairs: pairs.length, same: same.length, diff: diff.length, pairsWithoutFace: ftd, imagesWithoutFace: noFaceImgs, images: imgs.length, eer: e, rows: v };
    console.log(`\n## Face verification — LFW View-1 pairs (${pairs.length} pairs: ${same.length} same / ${diff.length} different people), TinyFaceDetector 320\n`);
    console.log(`images with no face found: ${noFaceImgs}/${imgs.length} (${pct(noFaceImgs / imgs.length)}) — such pairs count as "not matched"`);
    console.log(`EER (pairs where both faces were found): ${pct(e.eer)} at distance ${fx(e.thr, 3)}\n`);
    console.log(table(["distance thr", "used by", "TAR (same person accepted)", "FAR (different person accepted)", "accuracy", "1:N false accept, 20 enrolled", "1:N, 100 enrolled"],
      v.map(r => {
        const used = r.thr === 0.55 ? "attendance (default)" : r.thr === 0.5 ? "customers, booth" : "";
        const [lo, hi] = M.wilson(Math.round(r.far * diff.length), diff.length);
        return [fx(r.thr, 2), used, pct(r.tar), `${pct(r.far, 2)} [${pct(lo, 1)}–${pct(hi, 1)}]`, pct(r.acc), pct(M.oneToN(r.far, 20)), pct(M.oneToN(r.far, 100))];
      })));
    // ---- 1:N identification (what the pages actually do: nearest enrolled face, accepted when distance < thr) ----
    // identities from LFW file names; gallery = 1 image per identity, genuine probes = that identity's other images,
    // strangers = images of identities not in the gallery. 200 seeded random galleries per size.
    const ident = new Map(); // name -> [desc]
    pairs.forEach(p => [[p.a, p.pa], [p.b, p.pb]].forEach(([u, path]) => {
      const r = byImg.get(u); if (!r.n) return;
      const name = path.replace(/_\d+\.jpg$/, ""), l = ident.get(name) || [];
      if (!l.some(x => x.u === u) && !l.some(x => x.path === path)) l.push({ u, path, d: r.desc });
      ident.set(name, l);
    }));
    const multi = [...ident.keys()].filter(k => ident.get(k).length >= 2), single = [...ident.keys()].filter(k => ident.get(k).length === 1);
    let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const NS = [20, 50, 100, 200].filter(n => n <= multi.length), THR1 = [[0.45, 0], [0.5, 0], [0.5, 0.05], [0.55, 0], [0.55, 0.05], [0.55, 0.08], [0.6, 0]];
    const idRows = []; out.lfw.oneToN = [];
    for (const N of NS) {
      const acc = THR1.map(() => ({ ok: 0, mis: 0, gen: 0, fa: 0, str: 0 }));
      for (let trial = 0; trial < 200; trial++) {
        const gal = shuffle(multi).slice(0, N), inGal = new Set(gal);
        const G = gal.map(n => ({ n, d: ident.get(n)[0].d }));
        const strangers = shuffle([...single, ...multi.filter(n => !inGal.has(n))]).slice(0, 40).map(n => ident.get(n)[0].d);
        const nearest = d => { let b = null, bd = Infinity, sd = Infinity; for (const g of G) { const x = dist(d, g.d); if (x < bd) { sd = bd; bd = x; b = g.n; } else if (x < sd) sd = x; } return [b, bd, sd]; };
        const genuine = gal.flatMap(n => ident.get(n).slice(1).map(x => [n, nearest(x.d)]));
        const str = strangers.map(nearest);
        THR1.forEach(([t, mg], k) => {
          for (const [n, [b, bd, sd]] of genuine) { acc[k].gen++; if (bd < t && sd - bd >= mg) { if (b === n) acc[k].ok++; else acc[k].mis++; } }
          for (const [bd, sd] of str.map(x => [x[1], x[2]])) { acc[k].str++; if (bd < t && sd - bd >= mg) acc[k].fa++; }
        });
      }
      THR1.forEach(([t, mg], k) => {
        const a = acc[k];
        out.lfw.oneToN.push({ N, thr: t, margin: mg, tpir: a.ok / a.gen, misid: a.mis / a.gen, fpir: a.fa / a.str });
        idRows.push([N, fx(t, 2) + (mg ? ` + margin ${mg}` : ""), pct(a.ok / a.gen), pct(a.mis / a.gen, 2), pct(a.fa / a.str, 2)]);
      });
    }
    console.log(`\n### 1:N identification on LFW identities (${multi.length} people with ≥2 photos, ${single.length} with 1; one enrolment photo each, 200 random galleries)\n`);
    console.log(table(["enrolled N", "distance thr", "member recognised (correct)", "member shown as SOMEONE ELSE", "stranger accepted as a member"], idRows));
    const ms = res.map(r => r.ms).sort((a, b) => a - b); out.lfw.ms = ms[ms.length >> 1];
    console.log(`\nper-image detect+landmarks+descriptor (WASM): median ${out.lfw.ms} ms`);
  } else console.log("skip LFW: lfw/pairs.json missing");

  if (have("utk/index.json")) {
    const idx = JSON.parse(readFileSync(join(DATA, "utk/index.json"), "utf8")).slice(0, limit);
    const res = await cached(`utk-ag-${idx.length}.json`, idx, (page, list) => page.evaluate(`LQB.faces(${JSON.stringify(list.map(r => "/__data/utk/" + r.f))}, { inputSize: 320, scoreThreshold: 0.5, descriptor: false, ageGender: true, padTo: 400 })`));
    const band = a => a < 18 ? "u18" : a < 35 ? "18_34" : a < 55 ? "35_54" : "55p";
    const RACE = ["White", "Black", "Asian", "Indian", "Other"];
    const groups = { all: () => true, adults18_70: r => r.age >= 18 && r.age <= 70, ...Object.fromEntries(RACE.map((n, i) => [n, r => r.race === i])) };
    const rows = [];
    out.utk = {};
    for (const [g, f] of Object.entries(groups)) {
      const sel = idx.map((r, i) => [r, res[i]]).filter(([r]) => f(r));
      const found = sel.filter(([, p]) => p.n);
      const mae = found.reduce((s, [r, p]) => s + Math.abs(p.age - r.age), 0) / Math.max(1, found.length);
      const bandOk = found.filter(([r, p]) => band(r.age) === band(p.age)).length / Math.max(1, found.length);
      // signage rule: male prob > 0.6 -> male, < 0.4 -> female, else unsure
      const call = p => { const male = p.gender === "male" ? p.gp : 1 - p.gp; return male > 0.6 ? "male" : male < 0.4 ? "female" : "unk"; };
      const decided = found.filter(([, p]) => call(p) !== "unk");
      const gOk = decided.filter(([r, p]) => call(p) === r.gender).length / Math.max(1, decided.length);
      const raw = found.filter(([r, p]) => p.gender === r.gender).length / Math.max(1, found.length);
      out.utk[g] = { n: sel.length, found: found.length, mae, bandAcc: bandOk, genderAccDecided: gOk, genderCoverage: decided.length / Math.max(1, found.length), genderAccRaw: raw };
      rows.push([g, sel.length, pct(found.length / Math.max(1, sel.length)), fx(mae, 1), pct(bandOk), pct(raw), `${pct(gOk)} (${pct(decided.length / Math.max(1, found.length), 0)} decided)`]);
    }
    console.log(`\n## Age / gender — UTKFace aligned&cropped, random subset (seed 42), ageGenderNet as in signage.js\n`);
    console.log(table(["group", "images", "face found", "age MAE (years)", "age band correct", "gender (argmax)", "gender, signage rule"], rows));
    // confusion of bands
    const B4 = ["u18", "18_34", "35_54", "55p"], cm = B4.map(() => B4.map(() => 0));
    idx.forEach((r, i) => { const p = res[i]; if (p.n) cm[B4.indexOf(band(r.age))][B4.indexOf(band(p.age))]++; });
    out.utk.bandConfusion = cm;
    console.log("\nage band confusion (rows = true band, cols = predicted):");
    console.log(table(["true \\ pred", ...B4], cm.map((r, i) => [B4[i], ...r])));
  } else console.log("skip UTKFace: utk/index.json missing");
} finally { if (bench) await bench.done(); }
if (opt("--json")) { writeFileSync(opt("--json"), JSON.stringify(out, null, 1)); console.log("\nwrote " + opt("--json")); }
