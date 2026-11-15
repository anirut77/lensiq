#!/usr/bin/env node
// tools/fortune-quality-measure-2.mjs — measuring harness, round 2 of the fortune quality work. Refuses to measure unless the round-2
// files are locked (tools/eval-guard.mjs, phase fortune-quality) and equal to the locked copies in ~/LENSIQ-field/evals/fortune-quality/.
//   node tools/fortune-quality-measure-2.mjs [--examples] [--json F]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { REPO } from "./fortune-quality-metrics.mjs";
import { corpus, measure, staticIssues2, reportIssues2, contentOf, fresh2Facts, BASE_CONTENT } from "./fortune-quality-metrics-2.mjs";

const require = createRequire(import.meta.url);
const PHASE = "fortune-quality";
const FILES = ["tools/fortune-quality-metrics-2.mjs", "tests/unit/fortune-quality-2.test.js", "tests/unit/fortune-quality-base-content.json", "tools/fortune-quality-measure-2.mjs"];
assertLocked(PHASE, FILES.map(f => join(phaseDir(PHASE), f)));
for (const f of FILES) if (readFileSync(join(REPO, f), "utf8") !== readFileSync(join(phaseDir(PHASE), f), "utf8")) { console.error(`${f} differs from the locked copy`); process.exit(1); }
const args = process.argv.slice(2);
const C = await corpus(), R = await measure(C);
const K = ["n", "Q1", "Q2th", "Q2en", "Q2zh", "Q2dup", "Q3", "Q4", "Q5th", "Q5thSuo", "Q5en", "Q5echo", "Q6", "Q7", "Q8"];
console.log("".padEnd(10) + K.map(k => k.padStart(k.length + 2)).join(""));
for (const [d, p] of Object.entries(R.per).concat([["TOTAL", R.totals]])) console.log(d.padEnd(10) + K.map(k => String(p[k] ?? "").padStart(k.length + 2)).join(""));
const pct = v => (100 * v).toFixed(1) + " %";
console.log(`shares: formula TH ${pct(R.shares.Q2th)} EN ${pct(R.shares.Q2en)} ZH ${pct(R.shares.Q2zh)} (<= 10 %); templated starts TH ${pct(R.shares.Q5th)} EN ${pct(R.shares.Q5en)} (<= 15 %)`);
console.log(`taksa love: ${R.q10.distinct} distinct of ${R.q10.users}`);
const st = staticIssues2(), rp = reportIssues2();
console.log(`static: ${st.length}${st.length ? " — " + st.join("; ") : ""}`);
console.log(`report repeats: ${rp.length}`);
const FA = require(join(REPO, "fortune-ai.js")), now = await contentOf(FA, await fresh2Facts()), base = BASE_CONTENT(), q12 = {};
for (const k of Object.keys(base)) q12[k] = { base: base[k], now: now[k] || 0, pct: Math.round(100 * (now[k] || 0) / base[k]) };
console.log("content kept (% of base): " + Object.entries(q12).map(([k, v]) => `${k} ${v.pct}`).join(", "));
if (args.includes("--examples")) for (const [k, v] of Object.entries(R.examples)) { console.log("## " + k); v.forEach(x => console.log("  " + x)); }
const j = args.indexOf("--json");
if (j >= 0) writeFileSync(args[j + 1], JSON.stringify({ per: R.per, totals: R.totals, shares: R.shares, q10: R.q10, static: st, report: rp, q12 }, null, 2) + "\n");
