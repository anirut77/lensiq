#!/usr/bin/env node
// tools/fortune-quality-measure-4.mjs — measuring harness, round 4 of the fortune quality work. Refuses to measure unless the round-4
// files are locked (tools/eval-guard.mjs, phase fortune-quality) and equal to the locked copies in ~/LENSIQ-field/evals/fortune-quality/.
//   node tools/fortune-quality-measure-4.mjs [--examples] [--json F]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { REPO } from "./fortune-quality-metrics.mjs";
import { corpus, measure, reportIssues4, siamseeEn } from "./fortune-quality-metrics-4.mjs";

const PHASE = "fortune-quality";
const FILES = ["tools/fortune-quality-metrics-4.mjs", "tests/unit/fortune-quality-4.test.js", "tools/fortune-quality-measure-4.mjs"];
assertLocked(PHASE, FILES.map(f => join(phaseDir(PHASE), f)));
for (const f of FILES) if (readFileSync(join(REPO, f), "utf8") !== readFileSync(join(phaseDir(PHASE), f), "utf8")) { console.error(`${f} differs from the locked copy`); process.exit(1); }
const args = process.argv.slice(2);
const C = await corpus(), R = await measure(C);
const K = ["n", "U1th", "U1en", "U1zh", "U2", "U3", "U4", "U6", "U7", "U8", "U9", "U10", "U11"];
console.log("".padEnd(10) + K.map(k => k.padStart(k.length + 2)).join(""));
for (const [d, p] of Object.entries(R.per).concat([["TOTAL", R.totals]])) console.log(d.padEnd(10) + K.map(k => String(p[k] ?? "").padStart(k.length + 2)).join(""));
const pct = v => (100 * v).toFixed(1) + " %";
console.log(`U1 stock openers: TH ${pct(R.shares.th)}, EN ${pct(R.shares.en)}, ZH ${pct(R.shares.zh)} (each <= 15 %; groups ${R.totals.gth})`);
const rp = await reportIssues4(), se = await siamseeEn();
console.log(`U5 report: glossary repeats ${rp.gloss.length}, EN sentence repeats ${rp.en.length}, ZH ${rp.zh.length} (target 0); TH unit repeats ${rp.th.length} (counted, no target)`);
console.log(`U12 siam si EN content vs base: ${pct(se)} (>= 85 %)`);
if (args.includes("--examples")) {
  for (const [k, v] of Object.entries(R.examples)) { console.log("## " + k); v.forEach(x => console.log("  " + x)); }
  console.log("## U5"); [...rp.gloss, ...rp.en, ...rp.zh, ...rp.th].forEach(x => console.log("  " + x));
}
const j = args.indexOf("--json");
if (j >= 0) writeFileSync(args[j + 1], JSON.stringify({ per: R.per, totals: R.totals, shares: R.shares, report: rp, siamseeEn: se }, null, 2) + "\n");
