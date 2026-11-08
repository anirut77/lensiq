#!/usr/bin/env node
// tests/bench/studio-intervals.mjs — person-cluster 95 % intervals for every ACCURACY.md §11 / §11b rate, and paired tests of
// plain vs high-collar cover (round 11). No portraits, no browser: reads the committed labels and per-render logs through
// tests/bench/studio-tables.mjs. Runs in CI.
//
//   node tests/bench/studio-intervals.mjs            markdown: k/n · per-render Wilson · person-cluster bootstrap · design effect
//                                                    (rows from < 15 people flagged "indicative only") · rater agreement κ / AC1
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
const ST = require(join(REPO, "lensiq-stats.js"));
/** round 12: a row counted from fewer than this many people (clusters) is flagged "indicative only" — its interval rests on too
    few independent units to be read as a precise rate */
export const MIN_CLUSTERS = 15;
const pct = x => (Number.isFinite(x) ? (100 * x).toFixed(1) : "—");

/** every rate metric with both intervals ; returns [{ table, split, key, label, k, n, wilson: [lo, hi], cluster: [lo, hi], deff, people }] */
export function intervals(data = load()) {
  const ms = tables({ data, interval: wilson });
  return ms.filter(m => m.rows && m.n).map(m => {
    const c = M.personClusterCI(m.rows);
    return { table: m.table, split: m.split, key: m.key, label: m.label, k: m.k, n: m.n, wilson: [m.lo, m.hi], cluster: [c[0], c[1]], deff: c.deff, people: c.clusters, indicative: c.clusters < MIN_CLUSTERS };
  });
}

/** round 12: chance-corrected agreement of the round-9 and round-10 raters on the same plain renders (raw agreement alone is
    inflated when most renders are defective). Cohen's κ and Gwet's AC1 (robust to the high defect prevalence) with 95 %
    person-cluster bootstrap intervals (lensiq-stats.js raterAgreement, 4,000 seeded resamples of people). */
export function agreement(data = load()) {
  const { slog, L9, L10 } = data, out = [];
  for (const sp of ["dev", "test"]) {
    const rows = [];
    for (const id of Object.keys(slog.people).filter(i => slog.people[i].split === sp).sort()) {
      const a = L9[id], b = L10[id]; if (!a || !b) continue;
      for (const g of GARMENTS) if (a[g] != null && b[g] != null) rows.push({ id, a: a[g], b: b[g] });
    }
    const r = ST.raterAgreement(rows, { minClusters: MIN_CLUSTERS });
    if (r) out.push({ split: sp, ...r, prevalence: rows.reduce((t, q) => t + q.a + q.b, 0) / (2 * rows.length) });
  }
  return out;
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

export function markdown(I, P, A = []) {
  const L = ["| table | split | metric | k/n | per-render Wilson 95 % | person-cluster 95 % | design effect | people |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (const r of I) L.push(`| ${r.table} | ${r.split} | ${r.label} | ${r.k}/${r.n} (${pct(r.k / r.n)} %) | ${pct(r.wilson[0])}–${pct(r.wilson[1])} | ${pct(r.cluster[0])}–${pct(r.cluster[1])} | ${r.deff ? r.deff.toFixed(2) : "—"} | ${r.people}${r.indicative ? " (indicative only: < " + MIN_CLUSTERS + " people)" : ""} |`);
  if (A.length) {
    const f = x => (Number.isFinite(x) ? x.toFixed(2) : "—");
    L.push("", "| rater agreement (round-9 vs round-10 rater, plain renders) | renders | people | raw agreement | defect prevalence | Cohen's κ [person-cluster 95 %] | Gwet's AC1 [person-cluster 95 %] |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const r of A) L.push(`| ${r.split}${r.indicative ? " (indicative only)" : ""} | ${r.n} | ${r.clusters} | ${pct(r.po)} % | ${pct(r.prevalence)} % | ${f(r.kappa)} [${f(r.kappaLo)}–${f(r.kappaHi)}] | ${f(r.ac1)} [${f(r.ac1Lo)}–${f(r.ac1Hi)}] |`);
  }
  L.push("", "| plain vs cover (second rater) | pairs | fixed / broke | McNemar exact p (pairs independent) | defect-rate change, person-cluster 95 % | sign-flip p by person | people with a change |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const r of P) L.push(`| ${r.split} | ${r.pairs} | ${r.fixed} / ${r.broke} | ${r.mcnemar.p.toExponential(2)} | ${pct(-r.cluster.diff)} points [${pct(-r.cluster.hi)}–${pct(-r.cluster.lo)}] | ${r.cluster.p.toExponential(2)} | ${r.cluster.informative}/${r.cluster.people} |`);
  return L.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = load(), I = intervals(data), P = paired(data), A = agreement(data), args = process.argv.slice(2);
  console.log(markdown(I, P, A));
  const j = args.indexOf("--json"); if (j >= 0) writeFileSync(args[j + 1], JSON.stringify({ intervals: I, paired: P, agreement: A }, null, 1));
}
