#!/usr/bin/env node
// tests/bench/studio-figures.mjs — the numbers studio.html / photobooth.html quote on screen (miss rate of the outfit check,
// calibrated confidence, no-outfit defect rates) are generated from the committed labels + per-render gate logs, so a caption
// and another message can never disagree, and neither can drift from ACCURACY.md §11 / §11b (round 12).
//
//   node tests/bench/studio-figures.mjs           rewrite the STUDIO_FIGURES block in studio-qa.js (idempotent)
//   node tests/bench/studio-figures.mjs --check   exit 1 when the block differs from what the logs give (CI: tests/unit/studio-figures.test.js)
//
// Every figure is given for BOTH splits (dev = people used while building, test = people rendered once, after the code froze),
// with a person-cluster bootstrap 95 % interval (tests/bench/metrics.cjs personClusterCI). Pages quote both, never only the
// more favourable split. All labels come from AI agents, not human raters (ACCURACY.md §11).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO, load } from "./studio-tables.mjs";
import { intervals } from "./studio-intervals.mjs";

/** metric key in studio-tables.mjs -> figure name (calib* are clean shares; the others are defect shares) */
export const MAP = { "r10.newShown": "shownBad", "r10.calibCover": "calibCover", "r10.calibPlain": "calibPlain", "pb.raw": "pbRaw", "r11.stNone": "stNone", "r11.pbNone": "pbNone" };

export function figures(data = load()) {
  const out = {};
  for (const r of intervals(data)) {
    const name = MAP[r.key]; if (!name) continue;
    (out[name] = out[name] || {})[r.split] = { k: r.k, n: r.n, p: Math.round(100 * r.k / r.n), lo: Math.round(100 * r.cluster[0]), hi: Math.round(100 * r.cluster[1]) };
  }
  for (const k of Object.values(MAP)) if (!out[k] || !out[k].dev || !out[k].test) throw new Error("figure missing: " + k);
  const ordered = {}; for (const k of Object.values(MAP)) ordered[k] = { dev: out[k].dev, test: out[k].test };
  ordered.rater = "AI agents, not human raters";
  return ordered;
}

const FILE = join(REPO, "studio-qa.js");
const RE = /( {2}const FIGURES = )(\{.*\});\n/;
export function block(src) { const m = src.match(RE); return m ? m[2] : null; }
export function apply(src, f) {
  if (!RE.test(src)) throw new Error("no STUDIO_FIGURES block in studio-qa.js");
  return src.replace(RE, (all, head) => head + JSON.stringify(f) + ";\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const src = readFileSync(FILE, "utf8"), f = figures(), next = apply(src, f);
  if (process.argv.includes("--check")) {
    if (next !== src) { console.error("studio-qa.js STUDIO_FIGURES is stale; run: node tests/bench/studio-figures.mjs\nexpected: " + JSON.stringify(f)); process.exit(1); }
    console.log("studio figures in sync");
  } else { if (next !== src) writeFileSync(FILE, next); console.log(JSON.stringify(f, null, 1)); }
}
