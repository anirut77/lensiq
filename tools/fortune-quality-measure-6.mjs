#!/usr/bin/env node
// tools/fortune-quality-measure-6.mjs — measuring harness, round 6 of the fortune quality work. Refuses to measure unless the round-6
// files are locked (tools/eval-guard.mjs, phase fortune-quality) and equal to the locked copies in ~/LENSIQ-field/evals/fortune-quality/.
//   node tools/fortune-quality-measure-6.mjs [--examples] [--json F]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { REPO } from "./fortune-quality-metrics.mjs";
import { corpus, measure, targeted, w5Of } from "./fortune-quality-metrics-6.mjs";

const PHASE = "fortune-quality";
const FILES = ["tools/fortune-quality-metrics-6.mjs", "tests/unit/fortune-quality-6.test.js", "tools/fortune-quality-measure-6.mjs"];
assertLocked(PHASE, FILES.map(f => join(phaseDir(PHASE), f)));
for (const f of FILES) if (readFileSync(join(REPO, f), "utf8") !== readFileSync(join(phaseDir(PHASE), f), "utf8")) { console.error(`${f} differs from the locked copy`); process.exit(1); }
const args = process.argv.slice(2);
const C = await corpus(), R = await measure(C), w5t = w5Of(await targeted());
const K = ["n", "W1th", "W1en", "W1zh", "W2", "W3", "W4", "W5", "W6"];
console.log("".padEnd(10) + K.map(k => k.padStart(k.length + 2)).join(""));
for (const [d, p] of Object.entries(R.per).concat([["TOTAL", R.totals]])) console.log(d.padEnd(10) + K.map(k => String(p[k] ?? "").padStart(k.length + 2)).join(""));
console.log(`W5 targeted (Tower reversed, money): ${w5t.length} (target 0)`);
if (args.includes("--examples")) {
  for (const [k, v] of Object.entries(R.examples)) { console.log("## " + k); v.forEach(x => console.log("  " + x)); }
  console.log("## W5 targeted"); w5t.forEach(x => console.log("  " + x));
}
const j = args.indexOf("--json");
if (j >= 0) writeFileSync(args[j + 1], JSON.stringify({ per: R.per, totals: R.totals, w5targeted: w5t.length }, null, 2) + "\n");
