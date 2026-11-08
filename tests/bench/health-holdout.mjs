#!/usr/bin/env node
// tests/bench/health-holdout.mjs — round 12: held-out validation of the camera-health thresholds (lensiq-sitecheck.js
// createHealth / HEALTH). The round-10 thresholds were tuned on PETS09-S2L1 and TUD-Stadtmitte (ACCURACY.md "Camera
// health indicator": "tuned on these same runs"). This tool scores the SHIPPED thresholds on a split the tuning never saw.
//
//   node tests/bench/health-holdout.mjs --plan                       print the people.bench runs that produce the inputs
//   node tests/bench/health-holdout.mjs <dir|file.json …> [--tune PETS09-S2L1,TUD-Stadtmitte] [--json out.json]
//   node tests/bench/health-holdout.mjs --selftest                   synthetic check of the scoring (no data needed)
//
// Inputs: `people.bench.mjs --degrade <cond> --json f.json` outputs (one per degradation, plus a clean run with --health).
// Each (sequence, condition) is one case. A case is HARMFUL when counting suffers: |net count error| > 10% or event
// precision < 85% (the on-site check's store targets, TARGETS.store). It is FLAGGED when the health pill showed a warning
// in ≥ 50% of the 1-s samples. Tune split = the sequences the thresholds were set on (default PETS09 + TUD); hold-out =
// every other sequence (MOT17-*). Report per split: caught (harmful + flagged), missed (harmful, quiet), false alarms
// (fine, flagged), quiet-and-fine; sensitivity and false-alarm rate with Wilson 95% intervals; and the per-flag detail.
// Without the datasets nothing is measured: the tool says "not reproducible here: datasets absent" and exits 0.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SITE = require(join(REPO, "lensiq-sitecheck.js"));
export const DEFAULT_TUNE = ["PETS09-S2L1", "TUD-Stadtmitte"];
export const HARM = Object.freeze({ netErr: SITE.TARGETS.store.netErr, precision: SITE.TARGETS.store.precision, flagShare: 0.5 });
export const CONDITIONS = ["", "dark:0.1", "dark:0.04", "night:0.04", "back:0.5", "back:0.25", "blur:2", "blur:4", "shake:0.02", "shake:0.05"];

/** people.bench --json output -> cases [{seq, cond, countErr, evP, anyWarn, flags}] (first tracking config) */
export function casesOf(out) {
  const per = (out.tracking && out.tracking[0] && out.tracking[0].per) || [], H = out.health || {};
  const cond = out.degrade || (out.frameDrop ? "drop:" + out.frameDrop : "clean");
  return per.filter(p => H[p.seq]).map(p => ({ seq: p.seq, cond, countErr: p.countErr, evP: p.evP, anyWarn: H[p.seq].anyWarn, flags: H[p.seq].flags || {} }));
}
export const harmful = c => (Number.isFinite(c.countErr) && Math.abs(c.countErr) > HARM.netErr) || (Number.isFinite(c.evP) && c.evP < HARM.precision);
export const flagged = c => Number.isFinite(c.anyWarn) && c.anyWarn >= HARM.flagShare;
/** score a list of cases -> {n, caught, missed, falseAlarm, quiet, sensitivity, falseAlarmRate} with Wilson intervals */
export function score(cases) {
  const r = { n: cases.length, caught: 0, missed: 0, falseAlarm: 0, quiet: 0, missedCases: [], falseCases: [] };
  for (const c of cases) {
    const h = harmful(c), f = flagged(c);
    if (h && f) r.caught++; else if (h) { r.missed++; r.missedCases.push(`${c.seq} ${c.cond}`); }
    else if (f) { r.falseAlarm++; r.falseCases.push(`${c.seq} ${c.cond}`); } else r.quiet++;
  }
  r.sensitivity = SITE.wilson(r.caught, r.caught + r.missed);
  r.falseAlarmRate = SITE.wilson(r.falseAlarm, r.falseAlarm + r.quiet);
  return r;
}
/** split cases by sequence: tune (the sequences the thresholds were set on) vs hold-out (everything else) */
export function split(cases, tune = DEFAULT_TUNE) {
  const T = new Set(tune);
  return { tune: cases.filter(c => T.has(c.seq)), holdout: cases.filter(c => !T.has(c.seq)) };
}
export function report(cases, tune = DEFAULT_TUNE) {
  const s = split(cases, tune);
  const rep = { format: "lensiq-health-holdout", v: 1, thresholds: SITE.HEALTH, harm: HARM, tune, sequences: [...new Set(cases.map(c => c.seq))].sort(),
    tuneScore: score(s.tune), holdoutScore: score(s.holdout), cases };
  rep.status = !s.holdout.length ? "no hold-out cases: run the --plan commands on MOT17 (or other sequences not in the tune split)" : "measured";
  return rep;
}
const pc = w => w.p == null ? "—" : `${(w.p * 100).toFixed(0)}% [${(w.lo * 100).toFixed(0)}–${(w.hi * 100).toFixed(0)}]`;

function readInputs(paths) {
  const files = [];
  for (const p of paths) { const a = resolve(p); if (!existsSync(a)) continue; if (statSync(a).isDirectory()) readdirSync(a).filter(f => f.endsWith(".json")).forEach(f => files.push(join(a, f))); else files.push(a); }
  return files.flatMap(f => { try { return casesOf(JSON.parse(readFileSync(f, "utf8"))); } catch { return []; } });
}
function selftest() {
  const mk = (seq, cond, countErr, evP, anyWarn) => ({ seq, cond, countErr, evP, anyWarn, flags: {} });
  const cases = [mk("PETS09-S2L1", "clean", 0.03, 0.93, 0), mk("PETS09-S2L1", "shake:0.02", 0.22, 0.79, 0.92), mk("TUD-Stadtmitte", "blur:4", 0.05, 0.9, 0),
    mk("MOT17-04", "clean", -0.05, 0.9, 0), mk("MOT17-04", "shake:0.02", 0.3, 0.7, 0.4), mk("MOT17-09", "back:0.5", -0.02, 0.92, 1)];
  const r = report(cases);
  const ok = r.tuneScore.caught === 1 && r.tuneScore.quiet === 2 && r.holdoutScore.missed === 1 && r.holdoutScore.falseAlarm === 1 && r.holdoutScore.quiet === 1;
  console.log(ok ? "selftest OK" : "selftest FAILED " + JSON.stringify(r.holdoutScore)); return ok;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--selftest")) process.exit(selftest() ? 0 : 1);
  if (args.includes("--plan") || !args.length) {
    console.log("# held-out health validation: run on sequences NOT used for tuning (MOT17), one JSON per condition");
    for (const c of CONDITIONS) console.log(`LQ_BENCH_DATA=~/lq-bench-data node tests/bench/people.bench.mjs --fps 5 ${c ? "--degrade " + c : "--health"} --json ~/lq-health/${c ? c.replace(":", "-") : "clean"}.json`);
    console.log("node tests/bench/health-holdout.mjs ~/lq-health --json ~/lq-health/holdout.json");
    if (!args.length) console.log("\n(no inputs given)");
    process.exit(0);
  }
  const ins = args.filter((a, i) => !a.startsWith("--") && !["--tune", "--json"].includes(args[i - 1]));
  const cases = readInputs(ins);
  if (!cases.length) { console.log("not reproducible here: datasets absent — no people.bench --degrade outputs found (see --plan)"); process.exit(0); }
  const rep = report(cases, (opt("--tune", "") || DEFAULT_TUNE.join(",")).split(",").filter(Boolean));
  for (const [name, s] of [["tune (in-sample)", rep.tuneScore], ["hold-out", rep.holdoutScore]]) {
    console.log(`${name.padEnd(17)} cases ${String(s.n).padStart(3)} · caught ${s.caught} · missed ${s.missed} · false alarms ${s.falseAlarm} · quiet ${s.quiet} · sensitivity ${pc(s.sensitivity)} · false-alarm rate ${pc(s.falseAlarmRate)}`);
    if (s.missedCases.length) console.log("   missed: " + s.missedCases.join("; "));
    if (s.falseCases.length) console.log("   false alarms: " + s.falseCases.join("; "));
  }
  console.log("status: " + rep.status);
  if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(rep, null, 1));
}
