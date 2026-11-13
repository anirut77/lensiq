#!/usr/bin/env node
// tools/studio-fit-eval.mjs — scorer for the LOCKED synthetic garment-fit set (tests/unit/fixtures/studio-fit-set.js).
// Prints BEFORE vs AFTER pixel errors (neck, shoulder tips, hem edge, rendered shoulder) overall and per condition, and
// writes the full rows as JSON. Source label: SYNTHETIC.
//   node tools/studio-fit-eval.mjs [--out=<file.json>]   (default: ~/LENSIQ-field/evals/tryon-fit/results-<date>.json;
//                                                         an existing file is never overwritten: exit 2)
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SC = require(join(ROOT, "studio-core.js"));
const { CANON } = require(join(ROOT, "photobooth-outfits.js"));
const F = require(join(ROOT, "tests/unit/fixtures/studio-fit-set.js"));

const outArg = process.argv.find(a => a.startsWith("--out="));
const out = outArg ? outArg.slice(6) : join(homedir(), "LENSIQ-field/evals/tryon-fit", `results-${new Date().toISOString().slice(0, 10)}.json`);
// persistent eval log: never overwrite an earlier results file (pick a new --out name instead); checked before measuring
if (existsSync(out)) { console.error(`refusing to overwrite ${out} — results files are kept; pass --out=<new file>`); process.exit(2); }
const t0 = Date.now(), rows = F.run(SC, CANON), ms = Date.now() - t0;
const r1 = v => (Number.isFinite(v) ? v.toFixed(1) : "-");
const metrics = [["neck", ["before", "after"]], ["shoulder", ["before", "after"]], ["hem", ["before", "after"]], ["shoulder", ["rBefore", "rAfter"]]];
const summary = {};
console.log(`garment fit, synthetic set: ${F.cases().length} people × ${F.GARMENTS.length} garments = ${rows.length} fits (${ms} ms). Errors in px; face width ${F.FW} px.`);
console.log("metric            cond  before mean/p90   after mean/p90");
for (const [m, src] of metrics) {
  const s = F.summarize(rows, m, src), name = (src[0] === "rBefore" ? "rendered " : "") + m;
  summary[name] = s;
  const line = (c, v) => console.log(`${name.padEnd(17)} ${c.padEnd(5)} ${(r1(v[src[0]].mean) + " / " + r1(v[src[0]].p90)).padEnd(17)} ${r1(v[src[1]].mean)} / ${r1(v[src[1]].p90)}`);
  line("all", s.all); for (const [c, v] of Object.entries(s.byCond)) line(c, v);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ source: "synthetic", set: "tests/unit/fixtures/studio-fit-set.js", targets: F.TARGETS, when: new Date().toISOString(), ms, summary, rows }, null, 1));
console.log("rows written to " + out);
