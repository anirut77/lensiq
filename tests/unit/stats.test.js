"use strict";
// node --test tests/unit — lensiq-stats.js numerical correctness (hand-computed values) + insights.js interpretation layer.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../lensiq-stats.js");
const I = require("../../insights.js");

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ""} expected ${b} ± ${eps}, got ${a}`);
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

test("descriptive stats: mean, sample SD, type-7 quantiles, MAD, moving average", () => {
  const x = [2, 4, 4, 4, 5, 5, 7, 9];
  const d = S.describe(x);
  assert.equal(d.n, 8); assert.equal(d.mean, 5); assert.equal(d.median, 4.5);
  near(d.sd, Math.sqrt(32 / 7), 1e-12, "sd");
  assert.equal(d.p25, 4); near(d.p75, 5.5, 1e-12, "p75");
  assert.equal(S.mad(x), 0.5);
  assert.deepEqual(S.movingAvg([1, 2, 3, 4], 2), [1, 1.5, 2.5, 3.5]);
  assert.deepEqual(S.movingAvg([1, null, 3], 3), [1, null, 2]);
  assert.equal(S.describe([]).mean, null);
  assert.equal(S.sd([5]), null);
  assert.equal(S.mean([1, NaN, null, 3]), 2);
});

test("distributions: normal CDF/quantile and Student t critical values", () => {
  near(S.normCdf(1.959964), 0.975, 1e-6, "Φ(1.96)");
  near(S.normCdf(0), 0.5, 1e-9);
  near(S.normInv(0.975), 1.959964, 1e-5, "Φ⁻¹(.975)");
  near(S.normInv(0.1), -1.281552, 1e-5, "Φ⁻¹(.1)");
  near(S.tCrit(1), 12.7062, 1e-3, "t(1)");
  near(S.tCrit(10), 2.2281, 1e-3, "t(10)");
  near(S.tCrit(30), 2.0423, 1e-3, "t(30)");
  near(S.tCdf(2, 8), 1 - 0.0805162 / 2, 1e-5, "T8(2)");
});

test("Wilson score interval matches hand computation", () => {
  // x=8, n=10: centre (0.8+1.96²/20)/(1+1.96²/10) = 0.71674 ; half 1.96·√(0.016+0.009604)/1.38415 = 0.22657
  const w = S.wilson(8, 10);
  near(w.lo, 0.4902, 1e-4, "lo"); near(w.hi, 0.9433, 1e-4, "hi");
  const z = S.wilson(0, 10); // lo = 0, hi = z²/(n+z²) = 3.8415/13.8415
  assert.equal(z.lo, 0); near(z.hi, 0.2775, 1e-4, "hi at x=0");
  const big = S.wilson(500, 1000); near(big.lo, 0.4691, 1e-4); near(big.hi, 0.5309, 1e-4);
  assert.equal(S.wilson(3, 0), null); assert.equal(S.wilson(5, 3), null);
});

test("two-proportion comparison: Newcombe CI + pooled z test", () => {
  const t = S.twoProp(45, 100, 30, 100);
  near(t.diff, 0.15, 1e-12);
  // pooled p = .375, se = √(.375·.625·.02) = .068465 → z = 2.1909, p = .02846
  near(t.z, 2.1909, 1e-3, "z"); near(t.p, 0.02846, 2e-4, "p");
  const a = S.wilson(45, 100), b = S.wilson(30, 100);
  near(t.lo, 0.15 - Math.sqrt((a.p - a.lo) ** 2 + (b.hi - b.p) ** 2), 1e-12);
  assert.ok(t.lo > 0 && t.hi < 0.3, `CI ${t.lo}..${t.hi}`);
  assert.ok(S.twoProp(10, 100, 10, 100).p > 0.99);
});

test("exact binomial and Poisson rate tests", () => {
  assert.equal(+S.binomTest(5, 5, 0.5).toFixed(10), 0.0625); // 2/32
  assert.equal(+S.binomTest(3, 4, 0.5).toFixed(10), 0.625);  // (1+4+4+1)/16
  // 30 vs 15 events over equal exposure: conditional on 45, X ~ Bin(45, .5) ; p = Σ pmf ≤ pmf(30) = 2·P(X ≥ 30)
  let c = 1, tail = 0; for (let k = 0; k <= 45; k++) { if (k >= 30) tail += c; c = c * (45 - k) / (k + 1); }
  const exact = 2 * tail / 2 ** 45;
  const t = S.poissonTest(30, 7, 15, 7);
  near(t.p, exact, 1e-9, "poisson p"); near(t.p, 0.0357, 1e-4);
  near(t.ratio, 2, 1e-12); near(t.change, 1, 1e-12);
  near(t.lo, Math.exp(Math.log(2) - 1.959964 * Math.sqrt(1 / 30 + 1 / 15)) - 1, 1e-6, "lo"); near(t.hi, 2.7171, 1e-3, "hi");
  // unequal exposure: 20 in 2 days vs 10 in 1 day = same rate
  const u = S.poissonTest(20, 2, 10, 1); near(u.change, 0, 1e-12); assert.ok(u.p > 0.99);
  assert.equal(S.poissonTest(5, 0, 3, 1), null);
});

test("Welch t test: hand values", () => {
  const w = S.welch([1, 2, 3, 4, 5], [3, 4, 5, 6, 7]);
  assert.equal(w.diff, -2); near(w.t, -2, 1e-12); near(w.df, 8, 1e-9);
  near(w.p, 0.08052, 1e-4, "p");
  near(w.hi - w.lo, 2 * 2.306 * 1, 2e-3, "CI width = 2·t(8)·se, se = 1");
  assert.equal(S.welch([1], [2, 3]), null);
});

test("robust z (MAD) and STL-lite anomaly detection find injected spikes only", () => {
  const z = S.robustZ([1, 2, 3, 4, 100]); // median 3, MAD 1
  near(z[4], 0.6745 * 97, 1e-9); near(z[0], -0.6745 * 2, 1e-9);
  const R = rng(42), week = [1.3, 0.9, 0.95, 1, 1, 1.15, 1.5];
  const y = Array.from({ length: 56 }, (_, i) => Math.round(200 * week[i % 7] * (1 + 0.002 * i) * (0.94 + R() * 0.12)));
  y[20] = Math.round(y[20] * 1.8); y[41] = Math.round(y[41] * 0.3);
  const an = S.anomalies(y);
  assert.deepEqual(an.map(a => a.i), [20, 41]);
  assert.equal(an[0].dir, "up"); assert.equal(an[1].dir, "down");
  assert.ok(an.every(a => Math.abs(a.z) >= 3.5));
  // no false alarms on the clean series, too short -> none
  const clean = y.slice(); clean[20] = Math.round(200 * week[6] * 1.04); clean[41] = Math.round(200 * week[6] * 1.08);
  assert.deepEqual(S.anomalies(clean).map(a => a.i), []);
  assert.deepEqual(S.anomalies([1, 2, 300]), []);
  const D = S.stlLite(y, 7); near(D.season.reduce((s, v) => s + v, 0), 0, 1e-9, "seasonal sums to 0");
});

test("Holt-Winters (additive, weekly) recovers a synthetic seasonal series; intervals widen; fallbacks when short", () => {
  const sea = [10, -5, -8, -3, 0, 12, -6], f = t => 100 + 0.5 * t + sea[t % 7];
  const y = Array.from({ length: 42 }, (_, t) => f(t));
  const hw = S.holtWinters(y, 7, 14);
  hw.mean.forEach((v, j) => near(v, f(42 + j), 1e-6, "step " + (j + 1)));
  // noisy version: still within 6% and the interval covers the truth
  const R = rng(7), yn = y.map(v => v + (R() - 0.5) * 8), fc = S.forecast(yn, 7, { conf: 0.95 });
  assert.equal(fc.method, "holt-winters"); assert.equal(fc.enough, true);
  fc.mean.forEach((v, j) => { near(v, f(42 + j), f(42 + j) * 0.06, "noisy step " + (j + 1)); assert.ok(fc.lo[j] <= f(42 + j) && f(42 + j) <= fc.hi[j], "covered"); });
  for (let j = 1; j < 7; j++) assert.ok(fc.hi[j] - fc.lo[j] >= fc.hi[j - 1] - fc.lo[j - 1] - 1e-9, "interval widens");
  const sn = S.forecast(y.slice(0, 10), 7);
  assert.equal(sn.method, "seasonal-naive"); assert.equal(sn.enough, false);
  assert.deepEqual(sn.mean, y.slice(3, 10)); // the last full week repeated
  const mn = S.forecast([5, 7, 9], 3);
  assert.equal(mn.method, "mean"); assert.deepEqual(mn.mean, [7, 7, 7]);
  assert.equal(S.forecast([], 3), null);
  assert.ok(S.forecast([0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).lo.every(v => v >= 0), "non-negative counts");
});

test("correlation: Pearson/Spearman with Fisher CI, small-sample flag", () => {
  const c = S.correlation([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]); // sxy 6, sxx 10, syy 6 → r = 6/√60
  near(c.r, 6 / Math.sqrt(60), 1e-12); assert.equal(c.enough, false);
  const p = S.correlation([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 4, 9, 16, 25, 36, 49, 64, 81, 100]);
  near(p.rho, 1, 1e-12, "spearman monotone"); assert.ok(p.r < 1 && p.r > 0.95);
  assert.ok(p.lo < p.r && p.r < p.hi && p.enough);
  near(Math.atanh(p.hi) - Math.atanh(p.r), 1.959964 / Math.sqrt(7), 1e-6, "Fisher z half-width");
  assert.equal(S.correlation([1, 1, 1, 1], [1, 2, 3, 4]).r, null);
  assert.equal(S.correlation([1, null, 3, 4], [2, 5, null, 8]).n, 2);
});

test("funnel, cohorts, A/B helpers, season grid", () => {
  const f = S.funnel([{ label: "in", value: 100 }, { label: "zone", value: 40 }, { label: "buy", value: 10 }]);
  assert.deepEqual(f.steps.map(s => s.rate), [null, 0.4, 0.25]); near(f.overall, 0.1, 1e-12);
  near(f.steps[1].ci.lo, S.wilson(40, 100).lo, 1e-12);
  assert.equal(S.funnel([{ value: 10 }, { value: 30 }]).steps[1].overcount, true);
  const c = S.cohorts([{ id: "A", period: 0 }, { id: "A", period: 1 }, { id: "B", period: 0 }, { id: "C", period: 1 }, { id: "A", period: 1 }]);
  assert.deepEqual(c.rows, [{ period: 0, size: 2, retention: [1, 0.5] }, { period: 1, size: 1, retention: [1] }]);
  assert.equal(c.repeat, 1); near(c.repeatRate, 1 / 3, 1e-12);
  const ab = S.abRates([{ name: "a", x: 50, n: 100 }, { name: "b", x: 30, n: 100 }, { name: "c", x: 9, n: 10 }], { minN: 30 });
  assert.equal(ab.best.name, "a"); assert.equal(ab.runner.name, "b"); assert.equal(ab.groups[0].name, "c"); // shown, but too few to win
  near(ab.test.diff, 0.2, 1e-12); assert.ok(ab.test.p < 0.01);
  const am = S.abMeans([{ name: "x", values: [1, 2, 3, 4, 5] }, { name: "y", values: [3, 4, 5, 6, 7] }, { name: "z", values: [9] }], { minN: 3 });
  assert.equal(am.best.name, "y"); assert.equal(am.groups.find(g => g.name === "z").enough, false); near(am.test.pRaw, 0.08052, 1e-4);
  // default: < 10 values per arm → no ranking, no confidence label
  assert.equal(S.abMeans([{ name: "x", values: [1, 2, 3, 4, 5] }, { name: "y", values: [3, 4, 5, 6, 7] }]).enough, false);
  const g = S.seasonGrid([{ wd: 1, h: 9, v: 4 }, { wd: 1, h: 9, v: 6 }, { wd: 2, h: 10, v: 3 }]);
  assert.equal(g.mean[1][9], 5); assert.equal(g.n[1][9], 2); assert.equal(g.mean[0][0], null); assert.equal(g.max, 5);
  assert.equal(S.confLevel(0.001), "strong"); assert.equal(S.confLevel(0.03), "moderate"); assert.equal(S.confLevel(0.1), "weak"); assert.equal(S.confLevel(0.5), "none"); assert.equal(S.confLevel(0.001, false), "insufficient");
});

// ---------- overdispersion-aware period comparison, multiple testing, autocorrelation, shrinkage ----------
const WKM = [1.35, 0.88, 0.95, 1, 1.02, 1.15, 1.5];
const poisson = (R, l) => { if (l < 30) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; } return Math.max(0, Math.round(l + Math.sqrt(l) * Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R()))); };
/** daily history of H days, A = last L days, B = the L days before ; multiplicative day noise uniform ±h ; A multiplied by eff */
const simDays = (R, { mu = 150, h = 0, L = 30, H = 84, eff = 1 } = {}) => Array.from({ length: H }, (_, i) => {
  const g = i >= H - L ? "A" : i >= H - 2 * L ? "B" : "h", wd = i % 7;
  return { y: poisson(R, mu * WKM[wd] * (g === "A" ? eff : 1) * (1 + h * (2 * R() - 1))), e: 1, wd, g };
});
const oldP = days => { const s = g => days.filter(d => d.g === g).reduce((t, d) => t + d.y, 0), L = days.filter(d => d.g === "A").length; return S.poissonTest(s("A"), L, s("B"), L).p; };

test("A/B with many arms: omnibus + Holm over all pairs keeps family-wise false positives ≤ 5% (seeded simulation)", () => {
  const R = rng(4242), binom = (n, p) => { let k = 0; for (let i = 0; i < n; i++) if (R() < p) k++; return k; };
  const g = () => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
  const REPS = 300;
  for (const [k, n] of [[6, 300], [10, 100], [6, 40]]) {
    let fw = 0, old = 0;
    for (let it = 0; it < REPS; it++) { const A = S.abRates(Array.from({ length: k }, (_, i) => ({ id: i, x: binom(n, 0.4), n }))); if (A.pairs.some(p => p.pAdj < 0.05)) fw++; if (A.spread.pRaw < 0.05) old++; }
    assert.ok(fw / REPS <= 0.06, `rates k=${k} n=${n}: family-wise ${fw / REPS}`);
    assert.ok(old / REPS > 0.2, `best-vs-worst raw p is the biased statistic it replaces: ${old / REPS}`);
  }
  for (const [k, n] of [[4, 10], [6, 12]]) {
    let fw = 0;
    for (let it = 0; it < REPS; it++) { const A = S.abMeans(Array.from({ length: k }, (_, i) => ({ id: i, values: Array.from({ length: n }, () => Math.min(1, Math.max(0, 0.4 + 0.2 * g()))) }))); if (A.pairs.some(p => p.pAdj < 0.05)) fw++; }
    assert.ok(fw / REPS <= 0.07, `means k=${k} n=${n}: family-wise ${fw / REPS}`);
  }
  // 5 vs 5 testers: below the 10-per-arm minimum → no confidence label at all
  const tiny = S.abMeans([{ id: "a", values: [0.7, 0.72, 0.68, 0.71, 0.69] }, { id: "b", values: [0.3, 0.35, 0.4, 0.33, 0.38] }]);
  assert.equal(tiny.enough, false); assert.equal(tiny.spread, null);
  // power: one ad +12 points among six (n = 300 each) is still found most of the time
  let hit = 0;
  for (let it = 0; it < 150; it++) { const A = S.abRates([0, 0, 0, 0, 0, 0.12].map((d, i) => ({ id: i, x: binom(300, 0.4 + d), n: 300 }))); if (A.best.id === 5 && A.spread.pAdj < 0.05) hit++; }
  assert.ok(hit / 150 >= 0.7, "power " + hit / 150);
  // hand check: chi-square survival, Welch ANOVA with k = 2 equals Welch t²
  near(S.chi2Sf(3.841459, 1), 0.05, 1e-5); near(S.chi2Sf(11.0705, 5), 0.05, 1e-5);
  const a = [1, 3, 2, 5, 4, 6, 2, 3, 4, 5], b = [4, 6, 5, 8, 7, 9, 5, 7, 6, 8];
  near(S.welchAnova([{ values: a }, { values: b }]).p, S.welch(a, b).p, 1e-6);
});

test("countCompare (negative binomial GLM + AR(1) level): seeded simulation — false positives ≤ 7% under 0–50% day-to-day noise, power for +20%", () => {
  const REPS = 300, rows = [];
  for (const h of [0, 0.25, 0.5]) {
    const R = rng(1000 + h * 100); let fp = 0, fpOld = 0;
    for (let k = 0; k < REPS; k++) { const d = simDays(R, { h }); if (S.countCompare(d).p < 0.05) fp++; if (oldP(d) < 0.05) fpOld++; }
    rows.push({ h, fp: fp / REPS, fpOld: fpOld / REPS });
  }
  // without drift the AR-averaged test is conservative here (≈ 1–2% for 30 vs 30 days) — the price of staying honest when the level drifts (next test)
  for (const r of rows) assert.ok(r.fp <= 0.07, `noise ±${r.h * 100}%: false positives ${(r.fp * 100).toFixed(1)}% (want ≤ 7%)`);
  // the exact Poisson test it replaces is badly miscalibrated on the same data (30 vs 30 days: unbalanced weekdays + overdispersion)
  assert.ok(rows.find(r => r.h === 0.25).fpOld > 0.25, "old exact Poisson false positives " + rows.map(r => r.fpOld));
  // power: true +20% change, ±30% noise, 30 vs 30 days
  const R = rng(77); let hit = 0;
  for (let k = 0; k < 200; k++) { const t = S.countCompare(simDays(R, { h: 0.3, eff: 1.2 })); if (t.p < 0.05 && t.adjChange > 0) hit++; }
  assert.ok(hit / 200 >= 0.85, `power for +20%: ${hit / 2}%`);
});

test("countCompare: latent level drift AR(φ) — false positives stay near 5% (was 11–34% when days were treated as independent)", () => {
  const g = R => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
  const gam8 = R => { const d = 8 - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = g(R); v = 1 + c * x; } while (v <= 0); v = v * v * v; if (Math.log(R()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v / 8; } };
  const WD = [0.8, 0.9, 0.9, 1, 1.1, 1.4, 1.3];
  // n days, A = last L, B = the L before ; log level AR(φ) with stationary SD 0.23 ; NB(k = 8) day noise
  const sim = (R, n, L, phi) => { let lv = phi ? 0.228 * g(R) : 0; return Array.from({ length: n }, (_, i) => { lv = phi ? phi * lv + 0.228 * Math.sqrt(1 - phi * phi) * g(R) : 0; return { y: poisson(R, 120 * WD[i % 7] * Math.exp(lv) * gam8(R)), e: 1, wd: i % 7, g: i >= n - L ? "A" : i >= n - 2 * L ? "B" : "h", t: i }; }); };
  const REPS = 150, rows = [];
  for (const [n, L] of [[60, 7], [120, 14]]) for (const phi of [0, 0.6, 0.85]) {
    const R = rng(900 + n + phi * 100); let fp = 0;
    for (let k = 0; k < REPS; k++) if (S.countCompare(sim(R, n, L, phi)).p < 0.05) fp++;
    rows.push(`${n}d ${L}v${L} φ=${phi}: ${(fp / REPS * 100).toFixed(1)}%`);
    assert.ok(fp / REPS <= 0.09, rows.at(-1));
  }
});

test("countCompare: weekday adjustment, partial today, zero side, short history", () => {
  // no change at all, but window A has 3 Saturdays more than B → raw rate higher, adjusted ≈ 0
  const days = [];
  for (let i = 0; i < 56; i++) days.push({ y: Math.round(100 * WKM[i % 7]), e: 1, wd: i % 7, g: "h" });
  for (const wd of [6, 6, 6, 0, 1, 2, 3]) days.push({ y: Math.round(100 * WKM[wd]), e: 1, wd, g: "A" });
  for (const wd of [1, 2, 3, 4, 1, 2, 3]) days.push({ y: Math.round(100 * WKM[wd]), e: 1, wd, g: "B" });
  const t = S.countCompare(days);
  assert.ok(t.change > 0.2, "raw change " + t.change); near(t.adjChange, 0, 0.01, "weekday-adjusted change"); assert.ok(t.p > 0.5 && t.wdAdj);
  assert.ok(t.lo < 0 && t.hi > 0); assert.equal(t.method, "negbin-ar1-gls");
  // partial day: half a day with half the count = same rate
  const p = S.countCompare([...days.filter(d => d.g === "h"), { y: 50, e: 0.5, wd: 3, g: "A" }, { y: 100, e: 1, wd: 3, g: "B" }]);
  near(p.rate1, 100, 1e-9); near(p.adjChange, 0, 1e-6);
  // a side with zero counts: no crash, no CI, small p only if clearly different
  const z = S.countCompare([...days.filter(d => d.g === "h"), { y: 0, e: 1, wd: 3, g: "A" }, { y: 100, e: 1, wd: 3, g: "B" }]);
  assert.ok(z.p < 0.01 && z.lo == null && z.change === -1);
  // no history and 1 day vs 1 day → not enough to estimate day-to-day variation
  const s = S.countCompare([{ y: 30, e: 1, wd: 1, g: "A" }, { y: 15, e: 1, wd: 2, g: "B" }]);
  assert.equal(s.enough, false);
  assert.equal(S.countCompare([{ y: 1, e: 1, wd: 1, g: "A" }]), null);
});

test("twoPropDaily (quasi-binomial): day-level noise in a rate does not inflate confidence", () => {
  const R = rng(3), g = () => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
  const bin = (n, p) => { let x = 0; for (let i = 0; i < n; i++) if (R() < p) x++; return x; };
  let fo = 0, fn = 0; const REPS = 400;
  for (let k = 0; k < REPS; k++) {
    const mk = () => Array.from({ length: 30 }, (_, i) => { const n = Math.round(150 * WKM[i % 7]); return { x: bin(n, Math.max(0.005, 0.08 * (1 + 0.3 * g()))), n }; });
    const A = mk(), B = mk(), sx = a => a.reduce((s, d) => s + d.x, 0), sn = a => a.reduce((s, d) => s + d.n, 0);
    if (S.twoProp(sx(A), sn(A), sx(B), sn(B)).p < 0.05) fo++;
    const t = S.twoPropDaily(A, B); if (t.p < 0.05) fn++;
  }
  assert.ok(fn / REPS <= 0.07, "quasi-binomial false positives " + fn / REPS);
  assert.ok(fo / REPS > 0.12, "pooled z-test false positives " + fo / REPS);
  const t = S.twoPropDaily([{ x: 10, n: 100 }, { x: 12, n: 100 }], [{ x: 20, n: 100 }, { x: 22, n: 100 }]);
  near(t.diff, -0.1, 1e-12); assert.ok(t.phi >= 1 && t.lo < t.diff && t.hi > t.diff);
});

test("multiple comparisons: Benjamini–Hochberg and Holm hand values; family of null tests", () => {
  // BH: sorted p .01 .03 .04 .2 (m=4) → .04, .0533, .0533, .2
  const q = S.adjustP([0.01, 0.04, 0.03, 0.2, null]);
  near(q[0], 0.04, 1e-12); near(q[1], 0.16 / 3, 1e-12); near(q[2], 0.16 / 3, 1e-12); near(q[3], 0.2, 1e-12); assert.equal(q[4], null);
  assert.deepEqual(S.adjustP([0.01, 0.04, 0.03], "holm").map(v => +v.toFixed(10)), [0.03, 0.06, 0.06]);
  assert.deepEqual(S.adjustP([]), []);
  const R = rng(11); let raw = 0, bh = 0;
  for (let k = 0; k < 4000; k++) { const ps = Array.from({ length: 12 }, () => R()); if (ps.some(p => p < 0.05)) raw++; if (S.adjustP(ps).some(v => v < 0.05)) bh++; }
  assert.ok(raw / 4000 > 0.4 && bh / 4000 < 0.065, `any false 'confident' label among 12 null cards: raw ${raw / 40}% BH ${bh / 40}%`);
});

test("tsCorrelation: weekday/trend removal + Bartlett n_eff keeps ~5% false positives on autocorrelated series", () => {
  const R = rng(21), g = () => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
  let fo = 0, fn = 0, fs = 0; const REPS = 600;
  for (let k = 0; k < REPS; k++) {
    let ex = 0, ey = 0; const x = [], y = [], wd = [], xs = [], ys = [];
    for (let i = 0; i < 40; i++) { ex = 0.7 * ex + g(); ey = 0.7 * ey + g(); wd.push(i % 7); x.push(ex); y.push(ey); xs.push(10 * WKM[i % 7] + ex); ys.push(5 * WKM[i % 7] + ey); }
    if (S.correlation(x, y).p < 0.05) fo++;
    if (S.tsCorrelation(x, y, { wd }).p < 0.05) fn++;
    if (S.tsCorrelation(xs, ys, { wd }).p < 0.05) fs++; // shared weekday pattern, independent noise
  }
  assert.ok(fo / REPS > 0.15, "plain Pearson on AR(1) series " + fo / REPS);
  assert.ok(fn / REPS <= 0.07 && fs / REPS <= 0.07, `ts correlation false positives ${fn / REPS} / with shared seasonality ${fs / REPS}`);
  const c = S.tsCorrelation(Array.from({ length: 30 }, (_, i) => i + (i % 3)), Array.from({ length: 30 }, (_, i) => 2 * i - (i % 2)), { wd: Array.from({ length: 30 }, (_, i) => i % 7) });
  assert.equal(c.adjusted, "weekday+trend"); assert.ok(c.nEff <= c.n && c.rRaw > 0.95 && Math.abs(c.r) < c.rRaw, `trend removed: r ${c.r} raw ${c.rRaw}`);
  assert.equal(S.tsCorrelation([1, 2], [3, 4]).enough, false);
});

test("empirical Bayes shrinkage: small-n extremes pulled to the mean, ranking uses shrunk values", () => {
  const E = S.ebBinom([{ x: 20, n: 25 }, { x: 400, n: 1000 }, { x: 410, n: 1000 }, { x: 380, n: 1000 }, { x: 395, n: 1000 }]);
  const g = E.groups;
  assert.ok(g[0].shrunk < 0.8 && g[0].shrunk > E.mean, "tiny group shrunk toward the mean " + g[0].shrunk);
  assert.ok(g[0].weight < g[1].weight, "less data → more shrinkage");
  near(g[1].shrunk, 0.4, 0.01); assert.ok(g[0].lo < g[0].shrunk && g[0].shrunk < g[0].hi);
  // all groups alike → nearly complete pooling
  const P = S.ebBinom([{ x: 30, n: 100 }, { x: 31, n: 100 }, { x: 29, n: 100 }]);
  assert.ok(P.groups.every(x => Math.abs(x.shrunk - 0.3) < 0.005));
  // winner's curse: a 35-view ad at 63% vs 1000-view ads at 44–48% → raw winner, but not after shrinkage
  const ab = S.abRates([{ id: "s", name: "small", x: 22, n: 35 }, { id: "a", name: "A", x: 480, n: 1000 }, { id: "b", name: "B", x: 460, n: 1000 }, { id: "c", name: "C", x: 440, n: 1000 }], { minN: 30 });
  assert.equal(ab.best.name, "A"); assert.equal(ab.groups[0].name, "A"); assert.ok(ab.groups.find(x => x.id === "s").eb.p < 0.5 && ab.groups.find(x => x.id === "s").ci.p > 0.6);
  const N = S.ebNormal([{ mean: 0.9, se: 0.3 }, { mean: 0.5, se: 0.05 }, { mean: 0.45, se: 0.05 }, { mean: 0.55, se: 0.05 }]);
  assert.ok(N.groups[0].shrunk < 0.75 && N.groups[1].weight > N.groups[0].weight);
});

test("Thai confidence wording never claims the probability that a result is chance/true", () => {
  for (const v of Object.values(S.TH_CONF)) assert.ok(!/บังเอิญไม่ถึง|โอกาสเป็นความบังเอิญ|1 ใน 100|1 ใน 20/.test(v), v);
  assert.equal(S.pTextTH(0.004), "ถ้าไม่มีความเปลี่ยนแปลงจริง โอกาสเห็นความต่างขนาดนี้หรือมากกว่า ≈ 0.4%");
  assert.match(S.pTextTH(0.0001, { kind: "corr", q: 0.002, m: 9 }), /^ถ้าสองค่านี้ไม่สัมพันธ์กันจริง .* ต่ำกว่า 0\.1% · เมื่อปรับเพราะดู 9 ข้อพร้อมกัน \(Benjamini–Hochberg\) .*≈ 0\.2%$/);
  assert.equal(S.pTextTH(null), "");
});

// ---------- insights.js: analysis + Thai interpretation ----------
const NOW = new Date(2026, 10, 6, 15).getTime();
const demo = () => { const o = I.iqBuildDemo({}, NOW, 7); return { set: o.set, D: I.iqCollect(o.set) }; };

test("demo data: ≥ 8 weeks with weekly seasonality and the two injected anomalies detected", () => {
  const { set, D } = demo();
  assert.ok(Object.keys(set).filter(k => k.startsWith("st-day-")).length >= 56);
  const r = I.iqRange("all", NOW, D), A = I.iqAnalyze(D, r, { now: NOW });
  assert.ok(A.H.keys.length >= 56 && !A.short);
  const days = A.forecast.anomalies.map(a => a.day);
  assert.ok(days.includes(I.iqAddDays("2026-11-06", -12)), "promo day " + days);
  assert.ok(days.includes(I.iqAddDays("2026-11-06", -26)), "outage day " + days);
  assert.equal(A.forecast.fc.method, "holt-winters");
  const wd = A.heat.byWd; assert.ok(wd[6] > wd[1] * 1.3, "Saturday busier than Monday");
  assert.ok(A.corr.find(c => c.id === "queue-conv").r < -0.3, "queue vs conversion negative");
  assert.ok(A.ab.sg.enough && A.ab.neuro.enough && A.cohort.customers >= 20);
});

test("interpretation never emits NaN/undefined/Infinity for every preset × compare, and is deterministic", () => {
  const { D } = demo();
  for (const p of ["today", "d7", "d14", "d30", "d90", "all", "custom"]) for (const compare of ["prev", "week", "none"]) {
    const r = I.iqRange(p, NOW, D, { compare, from: "2026-10-01", to: "2026-10-20" }), A = I.iqAnalyze(D, r, { now: NOW, goals: { storeInDay: 200, convPct: 8, revenueDay: 3000, qcYieldPct: 97, safetyMin: 80 }, alerts: { queueWaitMin: 1, occMax: 5 } });
    const C = I.iqInsights(D, A);
    assert.ok(C.length >= 5, `${p}/${compare}: ${C.length} cards`);
    for (const c of C) for (const k of ["title", "body", "sure", "action"]) assert.ok(typeof c[k] === "string" && c[k].length > 3, `${p}/${compare} ${c.id}.${k}`);
    assert.deepEqual(I.iqTextOk(C), [], `${p}/${compare}`);
    assert.deepEqual(I.iqTextOk(A.kpis.map(k => [k.label, k.sub, k.ci && k.ci.text])), []);
    assert.deepEqual(I.iqTextOk(I.iqReport(D, A, C, "week")), []);
    assert.ok(C.every((c, i) => !i || C[i - 1].score >= c.score), "ranked by score");
    assert.deepEqual(I.iqInsights(D, I.iqAnalyze(D, r, { now: NOW, goals: { storeInDay: 200, convPct: 8, revenueDay: 3000, qcYieldPct: 97, safetyMin: 80 }, alerts: { queueWaitMin: 1, occMax: 5 } })).map(c => c.title), C.map(c => c.title));
  }
});

test("fewer than 7 days of data: says ข้อมูลยังน้อย and never claims strong confidence", () => {
  const h = Array(24).fill(0); h[10] = 9; h[17] = 12;
  const snap = {};
  for (let k = 1; k <= 4; k++) { const day = I.iqAddDays("2026-11-06", -k); snap["st-day-" + day] = JSON.stringify({ date: day, in: 21 + k * 3, out: 20, peak: 5, maxQueue: 1, hourly: { in: h, out: h }, zones: {}, byCam: {} }); }
  snap["co-sales"] = JSON.stringify([{ t: new Date(2026, 10, 5, 11).getTime(), total: 50, qty: 1 }, { t: new Date(2026, 10, 4, 12).getTime(), total: 30, qty: 1 }]);
  const D = I.iqCollect(snap);
  for (const p of ["today", "d7", "all"]) {
    const A = I.iqAnalyze(D, I.iqRange(p, NOW, D), { now: NOW }), C = I.iqInsights(D, A);
    assert.equal(A.short, true);
    assert.ok(C.some(c => /ข้อมูลยังน้อย/.test(c.title + c.body + c.sure)), p + ": no small-data notice");
    assert.ok(!C.some(c => c.level === "strong" || c.level === "moderate") , p + ": " + C.map(c => c.id + ":" + c.level));
    assert.deepEqual(I.iqTextOk(C), []);
    const k = A.kpis.find(x => x.id === "store");
    if (k.test) assert.equal(k.test.level, "insufficient");
  }
  // nothing at all -> no crash, no cards
  const E = I.iqCollect({}), AE = I.iqAnalyze(E, I.iqRange("d7", NOW, E), { now: NOW });
  assert.deepEqual(I.iqInsights(E, AE).filter(c => c.id !== "short").length, 0);
});

test("alert rules and goals evaluate against today's data", () => {
  const today = "2026-11-06", h = Array(24).fill(0); h[12] = 40;
  const D = I.iqCollect({ ["st-day-" + today]: JSON.stringify({ date: today, in: 40, out: 10, peak: 30, maxQueue: 6, hourly: { in: h, out: Array(24).fill(0) }, zones: {}, byCam: {} }), "st-settings": JSON.stringify({ maxOcc: 20, serviceSec: 60 }) });
  const r = I.iqRange("today", NOW, D);
  const A = I.iqAnalyze(D, r, { now: NOW, alerts: {}, goals: { storeInDay: 50 } });
  assert.deepEqual(A.alerts.map(a => a.id).sort(), ["occ", "queue"]); // occ from st-settings.maxOcc, 6 people × 60 s = 6 min > 5
  const off = I.iqAnalyze(D, r, { now: NOW, alerts: { queueWaitMin: null, occMax: 100 } });
  assert.deepEqual(off.alerts, []);
  assert.deepEqual(I.iqAlertRules({ queueWaitMin: "abc", notify: 1, extra: 5 }), { ...I.IQ_ALERT_DEFAULTS, notify: true });
  const C = I.iqInsights(D, A); assert.equal(C[0].module, "alert");
  assert.equal(A.goals.length, 1); assert.equal(A.goals[0].actual, 40); assert.equal(A.goals[0].met, false); // range "today" = so far today
});

test("iqRange: custom range, compare week / none, clamps to today", () => {
  const r = I.iqRange("custom", NOW, {}, { from: "2026-10-20", to: "2026-10-01", compare: "week" });
  assert.equal(r.from, "2026-10-01"); assert.equal(r.to, "2026-10-20"); assert.equal(r.days, 20);
  assert.deepEqual(r.prev, { from: "2026-09-24", to: "2026-10-13" });
  assert.equal(I.iqRange("d7", NOW, {}, { compare: "none" }).prev, null);
  assert.deepEqual(I.iqRange("d7", NOW, {}).prev, { from: "2026-10-24", to: "2026-10-30" });
  assert.equal(I.iqRange("custom", NOW, {}, { from: "2026-11-01", to: "2027-01-01" }).to, "2026-11-06");
  assert.equal(I.iqRange("custom", NOW, {}, {}).preset, "d7"); // invalid custom falls back
});

test("analysis export holds numbers only (no member names) and CSV has the daily table + forecast", () => {
  const { D } = demo(), r = I.iqRange("d30", NOW, D), A = I.iqAnalyze(D, r, { now: NOW }), C = I.iqInsights(D, A);
  const j = JSON.stringify(I.iqAnalysisJson(D, A, C));
  assert.ok(!/คุณ|iqdemo-m|phone/.test(j));
  const csv = I.iqAnalysisCsv(A).split("\r\n");
  assert.ok(csv[0].startsWith("﻿วันที่,วัน,คนเข้าร้าน"));
  assert.equal(csv.filter(l => /^2026-/.test(l)).length, 30 + 7);
});

test("insights: confidence labels come from BH q-values across all tests in the view; wording is correct", () => {
  const { D } = demo();
  for (const p of ["d7", "d30", "all"]) {
    const A = I.iqAnalyze(D, I.iqRange(p, NOW, D), { now: NOW }), C = I.iqInsights(D, A);
    const tests = [...A.kpis.map(k => k.test), ...A.cams.map(c => c.test), ...A.corr, ...Object.values(A.ab).flatMap(ab => [ab.test, ab.spread])].filter(Boolean);
    assert.ok(A.multi.m >= 3, p + " family size " + A.multi.m);
    for (const t of tests) {
      if (t.level === "insufficient") continue;
      assert.ok(Number.isFinite(t.q) && t.q >= t.p - 1e-12, `${p}: q ${t.q} ≥ p ${t.p}`);
      assert.equal(t.level, S.confLevel(t.q, true), `${p}: level from q`);
      assert.equal(t.m, A.multi.m);
    }
    const text = JSON.stringify(C);
    assert.ok(!/บังเอิญไม่ถึง|โอกาสเป็นความบังเอิญ/.test(text), p + ": p-value misread as chance probability");
    const sc = C.find(c => c.id === "store-change");
    if (sc && sc.level !== "insufficient") assert.match(sc.stat, /^ถ้าไม่มีความเปลี่ยนแปลงจริง โอกาสเห็นความต่างขนาดนี้หรือมากกว่า/);
    A.corr.forEach(c => assert.ok(c.nEff <= c.n + 1e-9 && (c.daily ? c.adjusted === "weekday+trend" : true), c.id));
    A.ab.sg.groups.forEach(g => assert.ok(g.eb.p > 0 && g.eb.p < 1));
  }
});

test("insights: no true change + ±30% day-to-day noise → the store card rarely claims confidence (end-to-end, seeded)", () => {
  const now = new Date(2026, 10, 6, 23, 30).getTime(); let claims = 0, kpiClaims = 0; const RUNS = 60;
  for (let s = 0; s < RUNS; s++) {
    const R = rng(500 + s), snap = {};
    for (let d = 1; d <= 90; d++) {
      const day = I.iqAddDays("2026-11-06", -d), wd = new Date(I.iqDayStart(day)).getDay(), n = Math.round(160 * WKM[wd] * (1 + 0.3 * (2 * R() - 1)));
      const h = Array(24).fill(0); h[10] = Math.floor(n / 3); h[14] = Math.floor(n / 3); h[18] = n - 2 * Math.floor(n / 3);
      snap["st-day-" + day] = JSON.stringify({ date: day, in: n, out: n, peak: 5, maxQueue: 1, hourly: { in: h, out: h }, zones: {}, byCam: {} });
    }
    const D = I.iqCollect(snap), A = I.iqAnalyze(D, I.iqRange("d30", now, D), { now }), C = I.iqInsights(D, A);
    const sc = C.find(c => c.id === "store-change");
    if (sc && (sc.level === "strong" || sc.level === "moderate")) claims++;
    const k = A.kpis.find(x => x.id === "store").test; if (k.level === "strong" || k.level === "moderate") kpiClaims++;
  }
  assert.ok(claims / RUNS <= 0.1 && kpiClaims / RUNS <= 0.1, `confident claims without a real change: ${claims}/${RUNS}`);
});
