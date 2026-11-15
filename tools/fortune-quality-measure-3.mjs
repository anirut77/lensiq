#!/usr/bin/env node
// tools/fortune-quality-measure-3.mjs — measuring harness, round 3 of the fortune quality work. Refuses to measure unless the round-3
// files are locked (tools/eval-guard.mjs, phase fortune-quality) and equal to the locked copies in ~/LENSIQ-field/evals/fortune-quality/.
//   node tools/fortune-quality-measure-3.mjs [--examples] [--json F]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { REPO } from "./fortune-quality-metrics.mjs";
import { corpus, measure, pinnedIssues, reportIssues3, charsOf, charsIssues, fresh3Facts, BASE_CHARS, staticIssues3 } from "./fortune-quality-metrics-3.mjs";

const require = createRequire(import.meta.url);
const PHASE = "fortune-quality";
const FILES = ["tools/fortune-quality-metrics-3.mjs", "tests/unit/fortune-quality-3.test.js", "tests/unit/fortune-quality-base-chars.json", "tools/fortune-quality-measure-3.mjs"];
assertLocked(PHASE, FILES.map(f => join(phaseDir(PHASE), f)));
for (const f of FILES) if (readFileSync(join(REPO, f), "utf8") !== readFileSync(join(phaseDir(PHASE), f), "utf8")) { console.error(`${f} differs from the locked copy`); process.exit(1); }
const args = process.argv.slice(2);
const C = await corpus(), R = await measure(C);
const K = ["n", "S1", "S2th", "S2same", "S2en", "S3", "S4", "S6", "S7a", "S7b", "S7c", "S7d", "S9"];
console.log("".padEnd(10) + K.map(k => k.padStart(k.length + 2)).join(""));
for (const [d, p] of Object.entries(R.per).concat([["TOTAL", R.totals]])) console.log(d.padEnd(10) + K.map(k => String(p[k] ?? "").padStart(k.length + 2)).join(""));
const pct = v => (100 * v).toFixed(1) + " %";
console.log(`shares: TH name + verb openers ${pct(R.shares.S2th)} (<= 15 %); EN "In your reading" ${pct(R.shares.S2en)} (<= 5 %)`);
const pin = pinnedIssues(), rp = reportIssues3(), st = staticIssues3();
const FA = require(join(REPO, "fortune-ai.js")), now = await charsOf(FA, await fresh3Facts()), base = BASE_CHARS(), ci = charsIssues(now, base);
console.log(`pinned money overview: ${pin.length}${pin.length ? " — " + pin.slice(0, 4).join("; ") : ""}`);
console.log(`report tip repeats: ${rp.length}${rp.length ? " — " + rp.slice(0, 4).join("; ") : ""}`);
console.log(`static: ${st.length}${st.length ? " — " + st.join("; ") : ""}`);
console.log("characters vs base (%): " + Object.keys(base).map(k => `${k} ${Math.round(100 * (now[k] || 0) / base[k])}`).join(", "));
console.log(`characters below target: ${ci.length}${ci.length ? " — " + ci.join("; ") : ""}`);
if (args.includes("--examples")) for (const [k, v] of Object.entries(R.examples)) { console.log("## " + k); v.forEach(x => console.log("  " + x)); }
const j = args.indexOf("--json");
if (j >= 0) writeFileSync(args[j + 1], JSON.stringify({ per: R.per, totals: R.totals, shares: R.shares, pinned: pin, report: rp, static: st, chars: { now, base, issues: ci } }, null, 2) + "\n");
