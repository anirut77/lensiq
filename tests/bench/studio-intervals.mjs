#!/usr/bin/env node
// tests/bench/studio-intervals.mjs — person-cluster 95 % intervals for every ACCURACY.md §11 / §11b rate, and paired tests of
// plain vs high-collar cover (round 11). No portraits, no browser: reads the committed labels and per-render logs through
// tests/bench/studio-tables.mjs. Runs in CI.
//
//   node tests/bench/studio-intervals.mjs            markdown: k/n · per-render Wilson · person-cluster bootstrap · design effect
//   node tests/bench/studio-intervals.mjs --json f   the same as JSON
//
// Why: each portrait gives 4 outfit renders (2 in the photo booth) and the labels follow the photo far more than the outfit, so the
// renders are not independent. The per-render Wilson interval treats 140 renders from 35 people as 140 independent draws and is
// about half as wide as it should be. The cluster bootstrap resamples people (tests/bench/metrics.cjs personClusterCI, 4,000
// seeded resamples; a design-effect Wilson guard when there are no or very few events). deff = cluster variance ÷ binomial variance.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tables, load, wilson, REPO, GARMENTS } from "./studio-tables.mjs";

const require = createRequire(import.meta.url);
const M = require(join(REPO, "tests/bench/metrics.cjs"));
const pct = x => (Number.isFinite(x) ? (100 * x).toFixed(1) : "—");

/** every rate metric with both intervals ; returns [{ table, split, key, label, k, n, wilson: [lo, hi], cluster: [lo, hi], deff, people }] */
export function intervals(data = load()) {
  const ms = tables({ data, interval: wilson });
  return ms.filter(m => m.rows && m.n).map(m => {
    const c = M.personClusterCI(m.rows);
    return { table: m.table, split: m.split, key: m.key, label: m.label, k: m.k, n: m.n, wilson: [m.lo, m.hi], cluster: [c[0], c[1]], deff: c.deff, people: c.clusters };
  });
}

/** plain vs cover on the same person × garment (second rater): McNemar (pairs independent) and the person-clustered test */
export function paired(data = load()) {
  const { slog, L10 } = data, out = [];
  for (const sp of ["dev", "test"]) {
    const pairs = [];
    for (const id of Object.keys(slog.people).filter(i => slog.people[i].split === sp).sort()) {
      const L = L10[id]; if (!L) continue;
      for (const g of GARMENTS) if (L[g] != null && L[g + "+cover"] != null) pairs.push({ id, a: L[g], b: L[g + "+cover"] });
    }
    const b = pairs.filter(q => q.a && !q.b).length, c = pairs.filter(q => !q.a && q.b).length;
    out.push({ split: sp, pairs: pairs.length, fixed: b, broke: c, mcnemar: M.mcnemar(b, c), cluster: M.pairedCluster(pairs) });
  }
  return out;
}

export function markdown(I, P) {
  const L = ["| table | split | metric | k/n | per-render Wilson 95 % | person-cluster 95 % | design effect | people |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (const r of I) L.push(`| ${r.table} | ${r.split} | ${r.label} | ${r.k}/${r.n} (${pct(r.k / r.n)} %) | ${pct(r.wilson[0])}–${pct(r.wilson[1])} | ${pct(r.cluster[0])}–${pct(r.cluster[1])} | ${r.deff ? r.deff.toFixed(2) : "—"} | ${r.people} |`);
  L.push("", "| plain vs cover (second rater) | pairs | fixed / broke | McNemar exact p (pairs independent) | defect-rate change, person-cluster 95 % | sign-flip p by person | people with a change |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const r of P) L.push(`| ${r.split} | ${r.pairs} | ${r.fixed} / ${r.broke} | ${r.mcnemar.p.toExponential(2)} | ${pct(-r.cluster.diff)} points [${pct(-r.cluster.hi)}–${pct(-r.cluster.lo)}] | ${r.cluster.p.toExponential(2)} | ${r.cluster.informative}/${r.cluster.people} |`);
  return L.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = load(), I = intervals(data), P = paired(data), args = process.argv.slice(2);
  console.log(markdown(I, P));
  const j = args.indexOf("--json"); if (j >= 0) writeFileSync(args[j + 1], JSON.stringify({ intervals: I, paired: P }, null, 1));
}
