#!/usr/bin/env node
// tools/tryon-pose-eval.mjs — scorer for the LOCKED synthetic pose fit set (tests/unit/fixtures/tryon-pose-set.js) of the
// pose-anchored garment placement on tryon.html (owner decision 2026-11-18). Prints, per anchor group, the error (fraction
// of the shoulder-tip width B, and px) overall and per condition against the locked TARGETS, the refusal decisions, and
// writes every row as JSON. Source label: SYNTHETIC.
//   node tools/tryon-pose-eval.mjs [--out=<file.json>]   (default: ~/LENSIQ-field/evals/tryon-pose/results-<date>.json;
//                                                        an existing file is never overwritten: exit 2)
// Locked sets persist (owner rule 2026-11-13): the set is read from its locked copy ~/LENSIQ-field/evals/tryon-pose/set/
// only after tools/eval-guard.mjs assertLocked() confirms its sha256 is in the committed evals-locks/tryon-pose.sha256;
// the repo fixture must be byte-identical to that copy (the unit test reads the repo file).
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EVALS_ROOT, assertLocked, phaseOf } from "./eval-guard.mjs";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TO = require(join(ROOT, "lensiq-tryon-core.js"));
const SET_DIR = join(EVALS_ROOT, "tryon-pose"), SET_FILE = "set/tryon-pose-set.js";

const outArg = process.argv.find(a => a.startsWith("--out="));
const out = outArg ? outArg.slice(6) : join(SET_DIR, `results-${new Date().toISOString().slice(0, 10)}.json`);
// persistent eval log: never overwrite an earlier results file (pick a new --out name instead); checked before measuring
if (existsSync(out)) { console.error(`refusing to overwrite ${out} — results files are kept; pass --out=<new file>`); process.exit(2); }
// the locked set only: refused unless its hash is committed in evals-locks/tryon-pose.sha256 (no measuring otherwise)
try { assertLocked(phaseOf(SET_DIR), [SET_FILE]); } catch (e) { console.error(String((e && e.message) || e)); process.exit(1); }
const setPath = join(SET_DIR, SET_FILE), repoFixture = join(ROOT, "tests/unit/fixtures/tryon-pose-set.js");
if (!readFileSync(setPath).equals(readFileSync(repoFixture))) { console.error(`${repoFixture} differs from the locked copy ${setPath}`); process.exit(1); }
const F = require(setPath);
const t0 = Date.now(), res = F.run(TO), ms = Date.now() - t0, S = F.summarize(res.rows), bad = F.verdict(res);
const f3 = v => (Number.isFinite(v) ? v.toFixed(3) : "-");
const pxOf = (g, c) => { const r = res.rows.filter(x => x.group === g && (!c || x.cond === c)).map(x => x.px); return F.mean(r); };
console.log(`pose fit, synthetic set: ${F.cases().length} people (${F.FIT_CONDS.length} conditions) + ${F.refusals().length} refusal cases, ${res.rows.length} anchor rows (${ms} ms).`);
console.log("Errors as a fraction of B (true shoulder-tip width); px in brackets.");
console.log("group     n     mean    p90     limit mean/p90   worst condition mean");
for (const [g, s] of Object.entries(S)) {
  const worst = Object.entries(s.byCond).sort((a, b) => b[1].mean - a[1].mean)[0];
  const lim = `${F.TARGETS[g].mean} / ${F.TARGETS[g].p90}`, w = worst ? worst[0] + " " + f3(worst[1].mean) : "-";
  console.log(`${g.padEnd(9)} ${String(s.all.n).padStart(4)}  ${f3(s.all.mean)}  ${f3(s.all.p90)}   ${lim.padEnd(16)} ${w}  (${pxOf(g).toFixed(1)} px)`);
}
console.log("\nper condition (mean, fraction of B):");
const groups = Object.keys(S);
console.log("cond  " + groups.map(g => g.padEnd(9)).join(""));
for (const c of F.FIT_CONDS) console.log(c.padEnd(6) + groups.map(g => (S[g].byCond[c] ? f3(S[g].byCond[c].mean) : "  -  ").padEnd(9)).join(""));
const dec = {};
for (const d of res.decisions) { const k = `${d.cond} ${d.cat}`; dec[k] = dec[k] || { n: 0, right: 0, want: d.want }; dec[k].n++; if (d.want === d.got) dec[k].right++; }
const wrong = res.decisions.filter(d => d.want !== d.got);
const wrongList = wrong.slice(0, 10).map(d => `${d.id} ${d.cat} ${d.got}`).join(", ");
console.log(`\ndecisions: ${res.decisions.length - wrong.length} / ${res.decisions.length} right` + (wrong.length ? `; wrong: ${wrongList}` : ""));
console.log(bad.length ? `FAIL (${bad.length}): ${bad.slice(0, 10).join("; ")}` : "PASS: every limit met");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ source: "synthetic", set: "tests/unit/fixtures/tryon-pose-set.js", targets: F.TARGETS, when: new Date().toISOString(), ms,
  summary: S, verdict: bad, decisions: dec, rows: res.rows }, null, 1));
console.log("rows written to " + out);
process.exit(bad.length ? 1 : 0);
