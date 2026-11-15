#!/usr/bin/env node
// tools/fortune-quality-measure.mjs — measuring harness of the fortune reading quality round (owner order 2026-11-16).
// Refuses to measure unless the fixed set is locked (tools/eval-guard.mjs, phase fortune-quality): the metrics module, the test
// and this harness must sit in ~/LENSIQ-field/evals/fortune-quality/ with the sha256 committed in evals-locks/fortune-quality.sha256,
// and the repo copies must equal the locked copies. Prints the per-domain table (before / after numbers for the round report).
//   node tools/fortune-quality-measure.mjs            table
//   node tools/fortune-quality-measure.mjs --examples table + up to 12 examples per metric
//   node tools/fortune-quality-measure.mjs --json F   also write the numbers to F
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { REPO, corpus, measure, staticIssues, reportIssues } from "./fortune-quality-metrics.mjs";

const PHASE = "fortune-quality";
const FILES = ["tools/fortune-quality-metrics.mjs", "tests/unit/fortune-quality.test.js", "tools/fortune-quality-measure.mjs"];
assertLocked(PHASE, FILES.map(f => join(phaseDir(PHASE), f)));
for (const f of FILES) if (readFileSync(join(REPO, f), "utf8") !== readFileSync(join(phaseDir(PHASE), f), "utf8")) {
  console.error(`fortune-quality-measure: ${f} differs from the locked copy in ${phaseDir(PHASE)}`); process.exit(1);
}
const args = process.argv.slice(2);
const C = await corpus();
const { per, totals, examples } = await measure(C);
const COLS = ["n", "R1", "R2", "R3th", "R3thAll", "R3en", "R3zh", "R4", "R4gen", "R5", "parity", "main", "H", "L"];
const row = (name, p) => name.padEnd(10) + COLS.map(k => String(p[k] ?? "").padStart(k.length + 2)).join("");
console.log("".padEnd(10) + COLS.map(k => k.padStart(k.length + 2)).join(""));
for (const [d, p] of Object.entries(per)) console.log(row(d, p));
console.log(row("TOTAL", totals));
const traced = C.every(r => ["th", "en", "zh"].every(L => Array.isArray(r.g[L]._frames)));
console.log(`inputs ${C.length} (reviewer ${C.filter(r => r.set === "reviewer").length}, fresh ${C.filter(r => r.set === "fresh").length}); frame trace ${traced ? "present" : "MISSING (R4gen not measurable)"}`);
const st = staticIssues(), rp = reportIssues();
console.log(`static pages: ${st.length} issue(s)${st.length ? ": " + st.join("; ") : ""}`);
console.log(`report: ${rp.issues.length} issue(s); section counts ${rp.counts.map(c => `${c.th}/${c.en}/${c.zh}`).join(" ")}`);
if (args.includes("--examples")) {
  for (const [k, v] of Object.entries(examples)) { console.log(`\n## ${k}`); v.forEach(x => console.log("  " + x)); }
  if (rp.issues.length) { console.log("\n## report"); rp.issues.slice(0, 20).forEach(x => console.log("  " + x)); }
}
const j = args.indexOf("--json");
if (j >= 0) writeFileSync(args[j + 1], JSON.stringify({ per, totals, traced, static: st, report: rp }, null, 2) + "\n");
