#!/usr/bin/env node
// tools/fortune-quality-measure-7.mjs — measuring harness, round 7 of the fortune quality work. Refuses to measure unless the round-7
// files are locked (tools/eval-guard.mjs, phase fortune-quality) and equal to the locked copies in ~/LENSIQ-field/evals/fortune-quality/.
//   node tools/fortune-quality-measure-7.mjs [--examples] [--json F]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { REPO } from "./fortune-quality-metrics.mjs";
import { corpus, measure, reportIssues7, targeted, targetedIssues } from "./fortune-quality-metrics-7.mjs";

const PHASE = "fortune-quality";
const FILES = ["tools/fortune-quality-metrics-7.mjs", "tests/unit/fortune-quality-7.test.js", "tools/fortune-quality-measure-7.mjs"];
assertLocked(PHASE, FILES.map(f => join(phaseDir(PHASE), f)));
for (const f of FILES) if (readFileSync(join(REPO, f), "utf8") !== readFileSync(join(phaseDir(PHASE), f), "utf8")) { console.error(`${f} differs from the locked copy`); process.exit(1); }
const args = process.argv.slice(2);
const C = await corpus(), R = await measure(C), rp = await reportIssues7(), ti = await targetedIssues(await targeted());
const K = ["n", "X1", "X2", "X3", "X4th", "X4en", "X4zh", "X5th", "X5en", "X5zh"];
console.log("".padEnd(10) + K.map(k => k.padStart(k.length + 2)).join(""));
for (const [d, p] of Object.entries(R.per).concat([["TOTAL", R.totals]])) console.log(d.padEnd(10) + K.map(k => String(p[k] ?? "").padStart(k.length + 2)).join(""));
console.log(`report: X1 ${rp.X1.length}, X4 ${rp.X4.length}, X5 ${rp.X5.length}; targeted: ${ti.length} (target 0 each)`);
if (args.includes("--examples")) {
  for (const [k, v] of Object.entries(R.examples)) { console.log("## " + k); v.forEach(x => console.log("  " + x)); }
  for (const [k, v] of Object.entries(rp)) { console.log("## report " + k); v.slice(0, 20).forEach(x => console.log("  " + x)); }
  console.log("## targeted"); ti.forEach(x => console.log("  " + x));
}
const j = args.indexOf("--json");
if (j >= 0) writeFileSync(args[j + 1], JSON.stringify({ per: R.per, totals: R.totals, report: Object.fromEntries(Object.entries(rp).map(([k, v]) => [k, v.length])), targeted: ti.length }, null, 2) + "\n");
