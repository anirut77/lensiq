#!/usr/bin/env node
// tools/fortune-quality-measure-5.mjs — measuring harness, round 5 of the fortune quality work. Refuses to measure unless the round-5
// files are locked (tools/eval-guard.mjs, phase fortune-quality) and equal to the locked copies in ~/LENSIQ-field/evals/fortune-quality/.
//   node tools/fortune-quality-measure-5.mjs [--examples] [--json F]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { REPO } from "./fortune-quality-metrics.mjs";
import { corpus, measure, reportIssues5 } from "./fortune-quality-metrics-5.mjs";

const PHASE = "fortune-quality";
const FILES = ["tools/fortune-quality-metrics-5.mjs", "tests/unit/fortune-quality-5.test.js", "tools/fortune-quality-measure-5.mjs"];
assertLocked(PHASE, FILES.map(f => join(phaseDir(PHASE), f)));
for (const f of FILES) if (readFileSync(join(REPO, f), "utf8") !== readFileSync(join(phaseDir(PHASE), f), "utf8")) { console.error(`${f} differs from the locked copy`); process.exit(1); }
const args = process.argv.slice(2);
const C = await corpus(), R = await measure(C);
const K = ["n", "V1", "V2", "V3", "V4", "V6", "V7th", "V7en", "V7zh", "V7multi"];
console.log("".padEnd(10) + K.map(k => k.padStart(k.length + 2)).join(""));
for (const [d, p] of Object.entries(R.per).concat([["TOTAL", R.totals]])) console.log(d.padEnd(10) + K.map(k => String(p[k] ?? "").padStart(k.length + 2)).join(""));
const pct = v => (100 * v).toFixed(1) + " %";
console.log(`V7 overview stock opener: EN ${pct(R.shares.en)}, ZH ${pct(R.shares.zh)} (each <= 15 %); TH ${pct(R.shares.th)} (counted, no target)`);
const rp = await reportIssues5();
console.log(`report: V1 ${rp.V1.length}, V2 ${rp.V2.length}, V4 ${rp.V4.length}, V5 ${rp.V5.length}, V8 ${rp.V8.length} (target 0 each)`);
if (args.includes("--examples")) {
  for (const [k, v] of Object.entries(R.examples)) { console.log("## " + k); v.forEach(x => console.log("  " + x)); }
  for (const [k, v] of Object.entries(rp)) { console.log("## report " + k); v.slice(0, 20).forEach(x => console.log("  " + x)); }
}
const j = args.indexOf("--json");
if (j >= 0) writeFileSync(args[j + 1], JSON.stringify({ per: R.per, totals: R.totals, shares: R.shares, report: Object.fromEntries(Object.entries(rp).map(([k, v]) => [k, v.length])) }, null, 2) + "\n");
