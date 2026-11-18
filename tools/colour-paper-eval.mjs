#!/usr/bin/env node
// tools/colour-paper-eval.mjs — Personal Colour, white-paper round (owner decision 2026-11-18): ONE run on the LOCKED synthetic
// set ~/LENSIQ-field/evals/personal-colour-paper/ (README there). Source label of every number: synthetic.
//   node tools/colour-paper-eval.mjs [--out <name>]   writes <evals>/personal-colour-paper/<name>.json and .md (default results-<date>)
// Refuses to run unless README.md, gen-set.mjs, set.json, render.mjs, score.mjs and targets.json are locked and committed
// (tools/eval-guard.mjs). What runs is the PRODUCT code lensiq-colour.js (card step, undertone bands, 12 seasons); render.mjs
// and score.mjs (locked with the set) render the samples, run the arms and score with the C4 thresholds (targets.json).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";

const require = createRequire(import.meta.url);
const PHASE = "personal-colour-paper", DIR = phaseDir(PHASE);
const argv = process.argv.slice(2), oi = argv.indexOf("--out");
const name = oi >= 0 ? argv[oi + 1] : `results-${new Date().toISOString().slice(0, 10)}`;
if (!/^[a-z0-9][a-z0-9._-]*$/.test(name || "")) { console.error("--out: a plain file name"); process.exit(2); }

assertLocked(PHASE, ["README.md", "gen-set.mjs", "set.json", "render.mjs", "score.mjs", "targets.json"]);
const set = JSON.parse(readFileSync(join(DIR, "set.json"), "utf8")), targets = JSON.parse(readFileSync(join(DIR, "targets.json"), "utf8"));
const SC = await import(pathToFileURL(join(DIR, "score.mjs")).href);
const P = require("../lensiq-colour.js");
const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: new URL("..", import.meta.url) }).toString().trim();
const lockHash = execFileSync("shasum", ["-a", "256", "evals-locks/personal-colour-paper.sha256"], { cwd: new URL("..", import.meta.url) }).toString().split(" ")[0];

const out = { phase: PHASE, source: "synthetic", head, lockFileSha256: lockHash, date: new Date().toISOString(), results: {} };
for (const setName of ["new", "old"]) for (const arm of SC.ARMS) {
  const r = SC.runArm(P, set, arm, setName);
  out.results[`${setName}/${arm}`] = SC.score(set, setName, r, targets);
}
out.c4Replica = SC.c4Replica(P, set);
out.pass = out.results["new/W"].pass;

const pc = s => `${(s.p * 100).toFixed(1)} % (${s.k}/${s.n}; 95 % CI ${(s.ci[0] * 100).toFixed(1)}-${(s.ci[1] * 100).toFixed(1)})`;
const f2 = v => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
const L = [];
L.push(`# Personal Colour, white-paper round: ${name}`, "",
  `Source: **synthetic** (locked set ~/LENSIQ-field/evals/personal-colour-paper/, lock file sha256 ${lockHash}, head ${head}). Not field numbers; no accuracy claim.`,
  `Primary arm W (white paper) on the NEW people: **${out.pass ? "PASS" : "FAIL"}**.`, "");
L.push("## Pass / fail (arm W, new people; C4 thresholds verbatim)", "", "| metric | value | target | met |", "|---|---|---|---|");
for (const t of out.results["new/W"].table) L.push(`| ${t.name} | ${t.name.includes("sd") ? f2(t.value) : t.name.startsWith("tertile") ? t.value.toFixed(1) : (t.value * 100).toFixed(1) + " %"} | ${t.target} | ${t.ok ? "yes" : "**no**"} |`);
L.push("", "## All arms (30 captures per person: 5 lights x 2 phones x 3)", "",
  "| set / arm | hue SD med | L* SD med | same band | same top-1 | top-2 has D65 top-1 | max tertile gap pp | refused captures | pass |", "|---|---|---|---|---|---|---|---|---|");
for (const [k, s] of Object.entries(out.results)) {
  const o = s.overall, ref = Object.values(s.refusals).reduce((a, x) => a + x.refused, 0);
  L.push(`| ${k} | ${f2(o.hue_sd_median)} | ${f2(o.L_sd_median)} | ${pc(o.band_same)} | ${pc(o.season_top1_same)} | ${pc(o.season_top2_contains)} | ${o.tertile_gap_pp.toFixed(1)} | ${ref} | ${s.pass ? "yes" : "no"} |`);
}
for (const k of ["new/W", "new/G", "new/O", "new/O3"]) {
  const s = out.results[k];
  L.push("", `## ${k}: per phone, tertile, light`, "", "| slice | same band | same top-1 | top-2 has D65 top-1 |", "|---|---|---|---|");
  for (const [ph, x] of Object.entries(s.perPhone)) L.push(`| phone ${ph} (15 captures) | ${pc(x.band_same)} | ${pc(x.season_top1_same)} | ${pc(x.season_top2_contains)} |`);
  for (const t of [0, 1, 2]) L.push(`| L* tertile ${t + 1} | ${pc(s.overall.tertiles.bandSame[t])} | ${pc(s.overall.tertiles.top1Same[t])} | ${pc(s.overall.tertiles.top2Contains[t])} |`);
  L.push(`| C4-style trials (1 phone x 1 capture x 5 lights) | ${pc(s.c4Trials.band_same)} | ${pc(s.c4Trials.season_top1_same)} | ${pc(s.c4Trials.season_top2_contains)} |`);
  L.push("", "| light | band = person's reference | top-1 = reference | unsure | mean hue offset vs true (deg) | refused / retaken (of n) |", "|---|---|---|---|---|---|");
  for (const [l, x] of Object.entries(s.perLight)) L.push(`| ${l} | ${pc(x.band_match)} | ${pc(x.top1_match)} | ${pc(x.unsure)} | ${x.hue_offset_mean.toFixed(2)} | ${x.refused} / ${x.retaken} (of ${x.n}) |`);
}
L.push("", "## Refusals per phone x light (arm W, new people)", "", "| phone/light | refused after 2 retakes | retaken | n |", "|---|---|---|---|");
for (const [k, x] of Object.entries(out.results["new/W"].refusals)) L.push(`| ${k} | ${x.refused} | ${x.retaken} | ${x.n} |`);
L.push("", "## C4 replica (old C4 people, old C4 camera model; fidelity check)", "", "```", JSON.stringify(out.c4Replica, null, 1), "```", "");
writeFileSync(join(DIR, `${name}.json`), JSON.stringify(out, null, 1) + "\n");
writeFileSync(join(DIR, `${name}.md`), L.join("\n") + "\n");
console.log(L.join("\n"));
process.exitCode = 0;
