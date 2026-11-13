#!/usr/bin/env node
// tools/pc-travel-score.mjs — score a P9 INN set (schema lensiq-pc-p9-inn-testset/1 or -holdout/2) with LQPCTravel.measure
// and the shipped TMT ingredient words (stream F, 2026-11-13; locked in evals-locks/pc-f.sha256 before the recall fixes).
// Source of every number: synthetic. Usage: node tools/pc-travel-score.mjs <set.json> [--json]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const TV = require(fileURLToPath(new URL("../lensiq-pc-travel.js", import.meta.url)));
const META = JSON.parse(readFileSync(fileURLToPath(new URL("../vendor/pc-drugs/tmt/meta.json", import.meta.url)), "utf8"));
const file = process.argv.slice(2).find(a => !a.startsWith("--"));
if (!file) { console.error("usage: node tools/pc-travel-score.mjs <set.json> [--json]"); process.exit(2); }
const set = JSON.parse(readFileSync(file, "utf8"));
const m = TV.measure(set.items, TV.buildInnIndex(META.ing));
const wilson = (/** @type {number} */ k, /** @type {number} */ n) => {
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - h) / d, (c + h) / d].map(x => Math.round(x * 1000) / 1000);
};
const out = { ...m, recallCI: wilson(m.tp, m.tp + m.fn), precisionCI: wilson(m.tp + m.outOfTable.found, m.tp + m.outOfTable.found + m.fp) };
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 1));
else {
  const { falsePos, misses, byLang, byKind, ...head } = out;
  console.log(JSON.stringify(head));
  console.log("falsePos:", JSON.stringify(falsePos));
  console.log("misses:", JSON.stringify(misses));
  console.log("byLang:", JSON.stringify(byLang));
  console.log("byKind:", JSON.stringify(byKind));
}
