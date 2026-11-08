"use strict";
// node --test tests/unit/stats-intervals.test.js — round 12 (lensiq-stats.js 3.5.0): p-values that agree with their intervals
// (A/B pairs, poissonTest), one Wilson formula across lensiq-stats / lensiq-sitecheck / bench metrics / studio tables,
// rater agreement (Cohen κ, Gwet AC1, Fleiss κ) and the honest scope of the repeated-look p on sliding windows.
// Tables: docs/STATS.md §11–§14. LQ_STATS_LONG=1 runs more replications.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../lensiq-stats.js");
const SC = require("../../lensiq-sitecheck.js");
const M = require("../bench/metrics.cjs");

const LONG = !!process.env.LQ_STATS_LONG;
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const gauss = R => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
const binom = (R, n, p) => { let x = 0; for (let i = 0; i < n; i++) if (R() < p) x++; return x; };
const expit = z => 1 / (1 + Math.exp(-z)), logit = p => Math.log(p / (1 - p));
const bound = (reps, a = 0.05) => a + 2 * Math.sqrt(a * (1 - a) / reps);
const excl0 = t => t.lo > 0 || t.hi < 0;

test("A/B pairs: pAdj < 0.05 exactly when the displayed interval excludes 0 (abRates, abMeans, abRatesStrata)", () => {
  const R = rng(12), reps = LONG ? 1500 : 300; let n = 0, bad = 0, badBonf = 0;
  for (let r = 0; r < reps; r++) {
    const eff = (r % 4) * 0.02, A = S.abRates([0, 1, 2, 3].map(i => ({ id: i, x: binom(R, 400, 0.3 + eff * i), n: 400 })));
    for (const t of A.pairs) { n++; if ((t.pAdj < 0.05) !== excl0(t)) bad++; if ((t.pAdj < 0.05) !== (t.loBonf > 0 || t.hiBonf < 0)) badBonf++; assert.equal(t.ciMethod, "compatible"); }
  }
  assert.equal(bad, 0, `${bad}/${n} rate pairs disagree`);
  assert.ok(badBonf > 0, "the round-11 Bonferroni interval did disagree with protected Holm (kept as loBonf/hiBonf)");
  for (let r = 0; r < (LONG ? 600 : 150); r++) {
    const A = S.abMeans([0, 1, 2].map(i => ({ id: i, values: Array.from({ length: 25 }, () => 0.5 + 0.03 * i * (r % 3) + 0.2 * gauss(R)) })));
    for (const t of A.pairs) { n++; if ((t.pAdj < 0.05) !== excl0(t)) bad++; }
  }
  assert.equal(bad, 0, "mean pairs disagree");
  for (let r = 0; r < (LONG ? 300 : 60); r++) {
    const G = [0, 1, 2].map(j => ({ id: "a" + j, name: "a" + j, x: 0, n: 0, strata: {} }));
    for (let d = 0; d < 10; d++) { const dl = 0.3 * gauss(R); G.forEach((g, j) => { const nn = 120, x = binom(R, nn, expit(logit(0.2) + dl + 0.1 * j * (r % 2))); g.strata["d" + d] = { x, n: nn }; g.x += x; g.n += nn; }); }
    for (const t of S.abRatesStrata(G).pairs) { n++; if ((t.pAdj < 0.05) !== excl0(t)) bad++; }
  }
  assert.equal(bad, 0, "strata pairs disagree");
  // findPair flips the Bonferroni interval with the pair
  const A = S.abRates([{ id: "a", x: 120, n: 400 }, { id: "b", x: 160, n: 400 }]);
  assert.ok(A.test.diff > 0 && A.test.loBonf <= A.test.diff && A.test.diff <= A.test.hiBonf, JSON.stringify(A.test));
});

test("poissonTest: exact interval agrees with the exact p on every cell 0–59 × 0–59 (round 11: 64 cells disagreed)", () => {
  let bad = 0, cells = 0;
  for (let a = 0; a < 60; a++) for (let b = 0; b < 60; b++) {
    if (a + b === 0) continue; const t = S.poissonTest(a, 1, b, 1); cells++;
    const ex = t.lo > 0 || (t.hi != null && t.hi < 0);
    if (Math.abs(t.p - 0.05) > 1e-9 && (t.p < 0.05) !== ex) bad++;
  }
  assert.equal(bad, 0, `${bad}/${cells}`);
  const e = S.poissonTest(3, 1, 11, 1); assert.ok(e.p > 0.05 && e.lo < 0 && e.hi > 0, "3 vs 11: p = 0.057 and the interval crosses 0");
  assert.ok(e.loWald < 0 && e.hiWald < 0, "the old Wald interval (kept) excluded 0");
  // coverage of the exact interval (conservative by construction)
  const R = rng(4); let cov = 0; const N = 2000, pois = m => { let L = Math.exp(-m), k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; };
  for (let i = 0; i < N; i++) { const t = S.poissonTest(pois(12), 1, pois(8), 1); if (t.lo <= 0.5 && (t.hi == null || 0.5 <= t.hi)) cov++; }
  assert.ok(cov / N >= 0.95, "exact coverage " + cov / N);
  assert.deepEqual([S.poissonTest(0, 1, 5, 1).lo, S.poissonTest(5, 1, 0, 1).hi], [-1, null]);
});

test("one Wilson formula: lensiq-stats wilsonZ = sitecheck wilson = bench metrics wilson = studio-tables wilson on an (x, n, z) grid", async () => {
  const { wilson: wT } = await import("../bench/studio-tables.mjs");
  const old = (k, n, z) => { const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)]; };
  for (const z of [1.644854, 1.959964, 1.96, 2.326348, 2.575829]) for (const n of [1, 2, 3, 5, 10, 17, 20, 50, 140, 1000]) for (let x = 0; x <= n; x += Math.max(1, Math.floor(n / 13))) {
    const ref = S.wilsonZ(x, n, z), sc = SC.wilson(x, n, z), mb = M.wilson(x, n, z);
    assert.deepEqual([sc.lo, sc.hi], ref, `sitecheck ${x}/${n} z ${z}`);
    assert.deepEqual(mb, ref, `metrics ${x}/${n}`);
    const o = old(x, n, z); assert.ok(Math.abs(o[0] - ref[0]) < 1e-15 && Math.abs(o[1] - ref[1]) < 1e-15, `round-11 bench formula ${x}/${n}`);
    if (z === 1.96) assert.deepEqual(wT(Array.from({ length: n }, (_, i) => ({ y: i < x ? 1 : 0 }))), ref, `studio-tables ${x}/${n}`);
  }
  const w = S.wilson(17, 20); assert.deepEqual([+w.lo.toFixed(6), +w.hi.toFixed(6)], [0.639581, 0.947631]);
  assert.deepEqual(M.wilson(0, 0), [0, 1]); assert.equal(S.wilsonZ(0, 0, 1.96), null);
});

test("raterAgreement: Cohen κ and Gwet AC1 hand values; person-cluster interval; indicative below 15 people", () => {
  // classic 2×2: a = 20 both yes, d = 15 both no, b = 5, c = 10 → po = 0.70, pe = 0.5, κ = 0.40
  const rows = [];
  const push = (k, a, b) => { for (let i = 0; i < k; i++) rows.push({ id: "p" + rows.length, a, b }); };
  push(20, 1, 1); push(5, 1, 0); push(10, 0, 1); push(15, 0, 0);
  const r = S.raterAgreement(rows, { reps: 500 });
  assert.ok(Math.abs(r.po - 0.7) < 1e-12 && Math.abs(r.pe - 0.5) < 1e-12 && Math.abs(r.kappa - 0.4) < 1e-12, JSON.stringify(r));
  // AC1: π_yes = (25 + 30)/100 = 0.55 → pe1 = 2·0.55·0.45 = 0.495 → AC1 = (0.7 − 0.495)/0.505
  assert.ok(Math.abs(r.ac1 - 0.205 / 0.505) < 1e-12);
  assert.ok(r.kappaLo < 0.4 && r.kappaHi > 0.4 && r.clusters === 50 && !r.indicative);
  // high prevalence paradox: 90% agreement, κ low, AC1 high
  const hp = []; for (let i = 0; i < 100; i++) hp.push({ id: i % 30, a: i < 90 ? 1 : i < 95 ? 1 : 0, b: i < 90 ? 1 : i < 95 ? 0 : 1 });
  const h = S.raterAgreement(hp, { reps: 300 });
  assert.ok(h.po === 0.9 && h.kappa < 0.1 && h.ac1 > 0.85, JSON.stringify(h));
  assert.equal(S.raterAgreement(rows.slice(0, 10)).indicative, true);
  assert.equal(S.raterAgreement([]), null);
});

test("fleissKappa: Fleiss (1971) worked example (Wikipedia: 10 subjects × 14 raters × 5 categories, κ = 0.210)", () => {
  const X = [[0, 0, 0, 0, 14], [0, 2, 6, 4, 2], [0, 0, 3, 5, 6], [0, 3, 9, 2, 0], [2, 2, 8, 1, 1], [7, 7, 0, 0, 0], [3, 2, 6, 3, 0], [2, 5, 3, 2, 2], [6, 5, 2, 1, 0], [0, 2, 2, 3, 7]];
  const f = S.fleissKappa(X);
  assert.ok(Math.abs(f.kappa - 0.20993) < 1e-4, String(f.kappa)); assert.equal(f.raters, 14);
  assert.equal(S.fleissKappa([[1, 1], [2, 1]]), null, "unequal rater counts"); assert.equal(S.fleissKappa([]), null);
});

test("sliding 7-vs-7-day window, 22 daily looks: mixture p false alarms ≤ 5% at τ = 0.10 / 0.15 / 0.25 (empirical, not a theorem)", () => {
  const REPS = LONG ? 1500 : 300, rows = [];
  for (const tau of [0.1, 0.15, 0.25]) {
    const R = rng(77 + tau * 100); let fixed = 0, seq = 0;
    for (let r = 0; r < REPS; r++) {
      const D = Array.from({ length: 35 }, () => ({ x: binom(R, 150, expit(logit(0.25) + 0.2 * gauss(R))), n: 150 }));
      let F = false, Q = false;
      for (let e = 13; e < 35; e++) { const t = S.twoPropDaily(D.slice(e - 6, e + 1), D.slice(e - 13, e - 6)); if (t.p < 0.05) F = true; if (S.seqP(t.diff, t.p, tau * t.p2) < 0.05) Q = true; }
      if (F) fixed++; if (Q) seq++;
    }
    rows.push(`τ ${tau}: one-look ${(100 * fixed / REPS).toFixed(1)}% · mixture ${(100 * seq / REPS).toFixed(1)}%`);
    assert.ok(seq / REPS <= bound(REPS), rows.at(-1));
    assert.ok(fixed / REPS > 0.3, "one-look p < 0.05 every day is badly inflated on the sliding window: " + rows.at(-1));
  }
  assert.equal(S.SEQ.guarantee.sliding, "empirically calibrated (simulation)");
});

test("seqAccum: accumulating window from a fixed start (where the always-valid guarantee holds)", () => {
  const R = rng(9), REPS = LONG ? 600 : 120; let hit = 0;
  for (let r = 0; r < REPS; r++) {
    const D = Array.from({ length: 35 }, () => ({ x: binom(R, 150, expit(logit(0.25) + 0.2 * gauss(R))), n: 150 }));
    let Q = false; for (let e = 13; e < 35; e += 3) { const a = S.seqAccum(D.slice(0, e + 1), 7, D.slice(0, 7)); if (a.pSeq < 0.05) Q = true; }
    if (Q) hit++;
  }
  assert.ok(hit / REPS <= bound(REPS), "accumulating false alarms " + hit / REPS);
  const a = S.seqAccum([{ x: 10, n: 100 }, { x: 12, n: 100 }, { x: 30, n: 100 }, { x: 31, n: 100 }], 2, [{ x: 10, n: 100 }, { x: 12, n: 100 }]);
  assert.ok(a.days === 2 && a.pSeq >= a.p && a.guarantee.startsWith("always-valid"));
  assert.equal(S.seqAccum([], 0, []), null);
});
