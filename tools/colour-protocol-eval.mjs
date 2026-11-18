#!/usr/bin/env node
// tools/colour-protocol-eval.mjs — Personal Colour, capture-protocol round (owner order 2026-11-18 night): ONE run on the LOCKED
// synthetic set ~/LENSIQ-field/evals/personal-colour-protocol/ (README there). Source label of every number: synthetic.
//   node tools/colour-protocol-eval.mjs [--out <name>]   writes <evals>/personal-colour-protocol/<name>.json and .md
//                                                        (default results-<date>; refuses to overwrite an existing result)
// Refuses to run unless README.md, gen-set.mjs, set.json, render.mjs, score.mjs, targets.json and this harness's field copy
// are locked and committed (tools/eval-guard.mjs), the product file lensiq-colour.js has the sha256 written in the locked
// targets.json, and the white-paper anchor files have their locked hashes. What runs is the PRODUCT code lensiq-colour.js
// (cardGains, measureProtocol, measure, undertone bands, 12 seasons, all unchanged except the new measureProtocol);
// render.mjs and score.mjs (locked with the set) render the samples, run the arms and score with the C4 thresholds.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";

const require = createRequire(import.meta.url);
const PHASE = "personal-colour-protocol", DIR = phaseDir(PHASE), REPO = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2), oi = argv.indexOf("--out");
const name = oi >= 0 ? argv[oi + 1] : `results-${new Date().toISOString().slice(0, 10)}`;
if (!/^[a-z0-9][a-z0-9._-]*$/.test(name || "")) { console.error("--out: a plain file name"); process.exit(2); }
if (existsSync(join(DIR, `${name}.json`))) { console.error(`${name}.json exists already: one measurement per name (reviewers use --out rereview-<date>)`); process.exit(2); }

const sha = b => createHash("sha256").update(b).digest("hex");
assertLocked(PHASE, ["README.md", "gen-set.mjs", "set.json", "render.mjs", "score.mjs", "targets.json", "colour-protocol-eval.mjs"]);
if (sha(readFileSync(fileURLToPath(import.meta.url))) !== sha(readFileSync(join(DIR, "colour-protocol-eval.mjs")))) throw new Error("this harness differs from its locked field copy");
const set = JSON.parse(readFileSync(join(DIR, "set.json"), "utf8")), targets = JSON.parse(readFileSync(join(DIR, "targets.json"), "utf8"));
const prod = join(REPO, targets.product_under_test.path);
if (sha(readFileSync(prod)) !== targets.product_under_test.sha256) throw new Error(`${targets.product_under_test.path} differs from the product locked in targets.json`);
for (const [f, h] of Object.entries(targets.anchor.files_sha256)) if (sha(readFileSync(join(DIR, f))) !== h) throw new Error(`anchor file ${f} changed`);
const SC = await import(pathToFileURL(join(DIR, "score.mjs")).href);
const P = require(prod);
const git = a => execFileSync("git", a, { cwd: REPO }).toString().trim();
const head = git(["rev-parse", "--short", "HEAD"]);
const lockHash = sha(readFileSync(join(REPO, `evals-locks/${PHASE}.sha256`)));

const out = { phase: PHASE, source: "synthetic", head, lockFileSha256: lockHash, date: new Date().toISOString(), results: {} };
for (const arm of SC.ARMS) out.results[arm] = SC.score(P, set, SC.runArm(P, set, arm), targets);
out.pass = out.results.PW.pass;
// anchor: the white-paper procedure on the white-paper set, arm W, new people
const PS = await import(pathToFileURL(join(DIR, "../personal-colour-paper/score.mjs")).href);
const pset = JSON.parse(readFileSync(join(DIR, "../personal-colour-paper/set.json"), "utf8")), ptg = JSON.parse(readFileSync(join(DIR, "../personal-colour-paper/targets.json"), "utf8"));
const pold = JSON.parse(readFileSync(join(DIR, "../personal-colour-paper/results-2026-11-18.json"), "utf8")).results["new/W"].overall;
const pnew = PS.score(pset, "new", PS.runArm(P, pset, "W", "new"), ptg).overall;
const pick = o => ({ hue_sd_median: o.hue_sd_median, L_sd_median: o.L_sd_median, band_same: o.band_same.p, season_top1_same: o.season_top1_same.p, season_top2_contains: o.season_top2_contains.p, tertile_gap_pp: o.tertile_gap_pp });
out.anchor = { now: pick(pnew), paperRound: pick(pold) };
out.anchor.matches = JSON.stringify(out.anchor.now) === JSON.stringify(out.anchor.paperRound);

const pc = s => `${(s.p * 100).toFixed(1)} % (${s.k}/${s.n}; ${(s.ci[0] * 100).toFixed(1)}-${(s.ci[1] * 100).toFixed(1)})`;
const f2 = v => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
const L = [];
L.push(`# Personal Colour, capture-protocol round: ${name}`, "",
  `Source: **synthetic** (locked set ~/LENSIQ-field/evals/${PHASE}/, lock file sha256 ${lockHash}, head ${head}). Not field numbers; no accuracy claim.`,
  `Primary arm PW (protocol + white paper, 5 fixed patches x 3 captures per session, 10 sessions per person): **${out.pass ? "PASS" : "FAIL"}**.`, "");
L.push("## Pass / fail (arm PW; C4 thresholds verbatim)", "", "| metric | value | target | met |", "|---|---|---|---|");
for (const t of out.results.PW.table) L.push(`| ${t.name} | ${t.name.includes("sd") ? f2(t.value) : t.name.startsWith("tertile") ? t.value.toFixed(1) : (t.value * 100).toFixed(1) + " %"} | ${t.target} | ${t.ok ? "yes" : "**no**"} |`);
L.push("", "## All arms", "", "| arm | unit (per person) | hue SD med | L* SD med | same band | same top-1 | top-2 has D65 top-1 | max tertile gap pp | unsure share | patch-hue spread med | no result | pass |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const [k, s] of Object.entries(out.results)) {
  const o = s.overall;
  L.push(`| ${k} | ${s.unit} (${s.perPerson}) | ${f2(o.hue_sd_median)} | ${f2(o.L_sd_median)} | ${pc(o.band_same)} | ${pc(o.season_top1_same)} | ${pc(o.season_top2_contains)} | ${o.tertile_gap_pp.toFixed(1)} | ${pc(s.unsure)} | ${f2(s.spread_median)} | ${s.no_result} | ${s.pass ? "yes" : "no"} |`);
}
L.push("", "## Diagnostics (never decide): unsure gate and band edges", "", "| arm | spread > 6 deg (of results with a result) | people with any unsure | same band if unsure is not counted | people whose hue range crosses a band edge | hue range med (deg) |", "|---|---|---|---|---|---|");
for (const [k, s] of Object.entries(out.results)) { const d = s.overall.diag; L.push(`| ${k} | ${pc(s.spread_over_6)} | ${pc(d.people_with_any_unsure)} | ${pc(d.band_same_ignoring_unsure)} | ${pc(d.people_hue_range_crosses_band_edge)} | ${f2(d.hue_range_median)} |`); }
for (const k of ["PW", "PO", "PO3", "W1"]) {
  const s = out.results[k];
  L.push("", `## ${k}: per phone, tertile, light`, "", "| slice | same band | same top-1 | top-2 has D65 top-1 |", "|---|---|---|---|");
  for (const [ph, x] of Object.entries(s.perPhone)) L.push(`| phone ${ph} | ${pc(x.band_same)} | ${pc(x.season_top1_same)} | ${pc(x.season_top2_contains)} |`);
  for (const t of [0, 1, 2]) L.push(`| L* tertile ${t + 1} | ${pc(s.overall.tertiles.bandSame[t])} | ${pc(s.overall.tertiles.top1Same[t])} | ${pc(s.overall.tertiles.top2Contains[t])} |`);
  L.push("", "| light | band = person's reference | top-1 = reference | unsure | mean hue offset vs true (deg) | no result / refused captures / retakes (of n) |", "|---|---|---|---|---|---|");
  for (const [l, x] of Object.entries(s.perLight)) L.push(`| ${l} | ${pc(x.band_match)} | ${pc(x.top1_match)} | ${pc(x.unsure)} | ${x.hue_offset_mean.toFixed(2)} | ${x.no_result} / ${x.refused_captures} / ${x.retakes} (of ${x.n}) |`);
}
L.push("", "## Anchor (white-paper procedure re-run on the white-paper set, arm W)", "", "```", JSON.stringify(out.anchor, null, 1), "```", "");
writeFileSync(join(DIR, `${name}.json`), JSON.stringify(out, null, 1) + "\n");
writeFileSync(join(DIR, `${name}.md`), L.join("\n") + "\n");
console.log(L.join("\n"));
