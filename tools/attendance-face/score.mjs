#!/usr/bin/env node
// tools/attendance-face/score.mjs — scores the raw outputs of run.mjs with the LOCKED protocol.json (no data access
// beyond ~/LENSIQ-field/evals/attendance-face/). Pure arithmetic, deterministic (seeded bootstrap): an independent
// reviewer re-runs it on the same raw files and must get the same numbers.
//
//   node tools/attendance-face/score.mjs <raw.json> [<raw.json> ...]   (later files override earlier ones per model)
//
// Protocol (protocol.json): people split dev / test (fixed lists). Template = mean of the enrolment vectors (E1: 1 photo,
// E3: 3 photos); for cosine models the mean is re-normalised. Probes = 3 smiling views. Score: cosine (ONNX models) or
// minus Euclidean distance (face-api, as attendance.js). Accept = score > threshold. A probe with no face, or a person
// with no template, is a reject (counted in FRR; never an impostor accept).
//   T_dev = threshold with FAR <= 1e-3 on the dev people; FAR / FRR at T_dev on the test people.
//   TAR@FAR=1e-3 on the test people (threshold set on test impostors: a ROC point, not an operating threshold).
//   Published-default thresholds where the model's source states one.
//   1:N: test people enrolled; members = test probes; strangers = dev probes; accept at T_dev.
//   95% CIs: person-cluster bootstrap over test people (2000 resamples, seed from protocol).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { phaseDir } from "../eval-guard.mjs";

const DIR = phaseDir("attendance-face");
const P = JSON.parse(readFileSync(join(DIR, "protocol.json"), "utf8"));
const manifest = readFileSync(join(DIR, "manifest.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
const files = process.argv.slice(2);
if (!files.length) { console.error("usage: score.mjs <raw.json>..."); process.exit(2); }
const raws = files.map(f => JSON.parse(readFileSync(f, "utf8")));

// vectors[model][id][view] = Float64Array | null ; times[model] = [ms per face]
const vectors = {}, times = {}, fta = {}, machine = [];
for (const raw of raws) {
  machine.push({ file: raw.startedUtc, ...raw.machine, models: raw.models, seconds: raw.seconds, lockCommit: raw.lockCommit });
  const keys = ["faceapi", ...raw.models];
  for (const k of keys) { vectors[k] = {}; times[k] = { embed: [], pipeline: [] }; fta[k] = {}; }
  for (const r of raw.rows) {
    for (const k of keys) {
      const v = k === "faceapi" ? (r.faceapi && r.faceapi.n ? r.faceapi.desc : null) : (r.emb && r.emb[k]) || null;
      (vectors[k][r.id] ||= {})[r.view] = v ? Float64Array.from(v) : null;
      (fta[k][r.view] ||= [0, 0]); fta[k][r.view][1]++; if (!v) fta[k][r.view][0]++;
      if (k === "faceapi") { times[k].pipeline.push(r.t.faceapi); times[k].embed.push(null); }
      else if (r.t[k] != null) { times[k].embed.push(r.t[k]); times[k].pipeline.push(r.t.landmarker + r.t.align + r.t[k]); }
    }
    if (r.t.landmarker != null) ((times.landmarker ||= { embed: [], pipeline: [] }).pipeline.push(r.t.landmarker));
  }
}
const MODELS = Object.keys(vectors);

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };
const scoreFn = k => k === "faceapi" ? (a, b) => -dist(a, b) : dot;
function template(k, id, views) {
  const vs = views.map(v => vectors[k][id] && vectors[k][id][v]).filter(Boolean);
  if (!vs.length) return null;
  const m = new Float64Array(vs[0].length);
  for (const v of vs) for (let i = 0; i < m.length; i++) m[i] += v[i] / vs.length;
  if (k !== "faceapi") { const n = Math.hypot(...m) || 1; for (let i = 0; i < m.length; i++) m[i] /= n; }
  return m;
}

let seed = P.bootstrap.seed >>> 0;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const q = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
// threshold with FAR <= target: accept s > t, t = the (floor(target*N)+1)-th highest impostor score
function thrAt(imp, target) { const s = imp.slice().sort((a, b) => b - a); return s[Math.floor(target * s.length)]; }
const rate = (xs, t) => xs.length ? xs.filter(s => s > t).length / xs.length : NaN;

function perPerson(k, mode, people) {
  // per person: genuine scores of its probes vs own template; impostor scores of its probes vs other people's templates
  const f = scoreFn(k), T = {};
  for (const id of people) T[id] = template(k, id, P.enrol[mode]);
  const out = {};
  for (const id of people) {
    const gen = [], imp = [], byView = {};
    for (const v of P.probes) {
      const p = vectors[k][id] && vectors[k][id][v];
      const s = p && T[id] ? f(p, T[id]) : -Infinity;
      gen.push(s); byView[v] = s;
      for (const j of people) if (j !== id) imp.push(p && T[j] ? f(p, T[j]) : -Infinity);
    }
    out[id] = { gen, imp, byView };
  }
  return { out, T };
}
const flat = (pp, ids, key) => ids.flatMap(id => pp[id][key]);

const results = {};
for (const k of MODELS) {
  results[k] = {};
  for (const mode of Object.keys(P.enrol)) {
    const dev = perPerson(k, mode, P.split.dev), test = perPerson(k, mode, P.split.test);
    const tDev = thrAt(flat(dev.out, P.split.dev, "imp"), P.farTarget);
    const gT = flat(test.out, P.split.test, "gen"), iT = flat(test.out, P.split.test, "imp");
    const tTest = thrAt(iT, P.farTarget);
    const R = {
      tDev, nGenuine: gT.length, nImpostor: iT.length,
      atTdev: { FAR: rate(iT, tDev), FRR: 1 - rate(gT, tDev) },
      TARatFAR1e3: rate(gT, tTest), tTest,
      defaults: {}, perView: {}, oneToN: {}, ci: {}
    };
    for (const [name, t] of Object.entries((P.defaults[k] || {}))) R.defaults[name] = { t, FAR: rate(iT, t), FRR: 1 - rate(gT, t) };
    for (const v of P.probes) R.perView[v] = rate(P.split.test.map(id => test.out[id].byView[v]), tDev);
    // 1:N at T_dev: gallery = test templates
    const f = scoreFn(k), G = P.split.test.map(id => [id, test.T[id]]).filter(([, t]) => t);
    const top = p => { let best = null, bs = -Infinity; for (const [id, t] of G) { const s = f(p, t); if (s > bs) { bs = s; best = id; } } return [best, bs]; };
    let ok = 0, wrong = 0, nm = 0, sa = 0, ns = 0;
    for (const id of P.split.test) for (const v of P.probes) {
      nm++; const p = vectors[k][id] && vectors[k][id][v]; if (!p) continue;
      const [b, s] = top(p); if (s > tDev) { if (b === id) ok++; else wrong++; }
    }
    for (const id of P.split.dev) for (const v of P.probes) {
      ns++; const p = vectors[k][id] && vectors[k][id][v]; if (!p) continue;
      const [, s] = top(p); if (s > tDev) sa++;
    }
    R.oneToN = {
      gallery: G.length, membersRecognised: ok / nm, membersAsSomeoneElse: wrong / nm, strangersAccepted: sa / ns, nMemberVisits: nm, nStrangerVisits: ns
    };
    // East Asian people (self-reported, all 102), genuine accept at T_dev
    const ea = manifest.filter(r => /east_asian/.test(r.eth) && r.view === P.probes[0]).map(r => r.id);
    const all = perPerson(k, mode, [...P.split.dev, ...P.split.test]).out;
    R.eastAsian = { people: ea.length, genuineAccepted: rate(ea.flatMap(id => all[id].gen), tDev) };
    // bootstrap over test people
    const bs = { FAR: [], FRR: [], TAR: [] };
    seed = P.bootstrap.seed >>> 0;
    for (let b = 0; b < P.bootstrap.resamples; b++) {
      const ids = P.split.test.map(() => P.split.test[Math.floor(rnd() * P.split.test.length)]);
      const g = flat(test.out, ids, "gen"), i = flat(test.out, ids, "imp");
      bs.FAR.push(rate(i, tDev)); bs.FRR.push(1 - rate(g, tDev)); bs.TAR.push(rate(g, thrAt(i, P.farTarget)));
    }
    for (const m of Object.keys(bs)) R.ci[m] = [q(bs[m], 0.025), q(bs[m], 0.975)];
    results[k][mode] = R;
  }
}
const speed = {};
for (const k of [...MODELS, "landmarker"]) if (times[k]) speed[k] = {
  embedMedianMs: q(times[k].embed.filter(x => x != null), 0.5), embedP90Ms: q(times[k].embed.filter(x => x != null), 0.9),
  pipelineMedianMs: q(times[k].pipeline, 0.5), pipelineP90Ms: q(times[k].pipeline, 0.9), n: times[k].pipeline.length
};
const ftaRates = Object.fromEntries(MODELS.map(k => [k, Object.fromEntries(Object.entries(fta[k]).map(([v, [a, n]]) => [v, `${a}/${n}`]))]));

const pc = x => Number.isFinite(x) ? (100 * x).toFixed(2) + "%" : "—";
const lines = [
  "| Model | Enrol | T_dev | FAR @T_dev (test) [95% CI] | FRR @T_dev (test) [95% CI] | TAR @FAR=1e-3 (test) [95% CI] | " +
  "1:N recognised / as someone else / strangers accepted | East Asian genuine accepted |", "|---|---|---|---|---|---|---|---|"];
const ci = ([a, b]) => `[${pc(a)}–${pc(b)}]`;
for (const k of MODELS) for (const mode of Object.keys(P.enrol)) {
  const R = results[k][mode];
  const t = k === "faceapi" ? "dist < " + (-R.tDev).toFixed(3) : "cos > " + R.tDev.toFixed(3), o = R.oneToN;
  lines.push(`| ${k} | ${mode} | ${t} | ${pc(R.atTdev.FAR)} ${ci(R.ci.FAR)} | ${pc(R.atTdev.FRR)} ${ci(R.ci.FRR)} | ${pc(R.TARatFAR1e3)} ${ci(R.ci.TAR)} | ` +
    `${pc(o.membersRecognised)} / ${pc(o.membersAsSomeoneElse)} / ${pc(o.strangersAccepted)} | ${pc(R.eastAsian.genuineAccepted)} (${R.eastAsian.people} people) |`);
}
const md = lines.join("\n");
const report = { protocolVersion: P.version, inputs: files, machine, results, speed, failureToAcquire: ftaRates };
const dest = join(DIR, "results", `score-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(dest, JSON.stringify(report, null, 1));
console.log(md);
console.log("\nspeed (ms per face):", JSON.stringify(speed));
console.log("no face found (per view):", JSON.stringify(ftaRates));
for (const k of MODELS) for (const mode of Object.keys(P.enrol)) {
  const R = results[k][mode]; console.log(k, mode, "defaults", JSON.stringify(R.defaults), "perView@Tdev", JSON.stringify(R.perView));
}
console.log("\nmachine:", JSON.stringify(machine));
console.log("score file:", dest);
