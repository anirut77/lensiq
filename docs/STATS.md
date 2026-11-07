# LENSIQ statistics: calibration notes (round 10)

This page records the simulations behind the statistical choices in `lensiq-stats.js` (version 3.3.0), the insights
dashboard, and the benchmark intervals in `ACCURACY.md`. Every number below can be reproduced from a seeded simulation.
The regression tests are `tests/unit/stats-r10.test.js`, `tests/unit/stats.test.js` and `tests/unit/bench-metrics.test.js`.

## 1. Comparing daily counts between two periods (`countCompare`): type I error and power

**The model.** A negative-binomial log-linear model with weekday effects. The errors on the working variate are an
AR(1) "drifting level" plus daily noise. The drift parameters (φ, q) are estimated by REML on a grid and averaged,
weighted by likelihood × prior. The prior gives weight P0 to the no-drift model and spreads 1 − P0 over the drift models.

**Why it was rechecked.** The test is conservative when the level does not drift. At 7 vs 7 days with +20% true change,
its power is about 10%, against about 14% for a test that treats days as independent (the evaluator measured 8.7% vs
11.7% in a similar setup). We tried to recover that power while keeping false positives (type I error) at or below 5%.

**Simulation setup.** 300 replications per cell, with the same seeds for every method in a row. Mean 120 per day, a
weekday pattern from 0.8 to 1.4, NB day noise with k = 8, and optionally an AR(φ) log level with stationary SD 0.23. The
last L days are period A and the L days before them are period B. "I" = share of null replications with p < 0.05.
"pw" = power for a true +20% in A. The Monte-Carlo SE is about ±1.3 points at 5%.

| scenario | **shipped: P0 = 0.2, step df** | P0 = 0.5, step df | Satterthwaite df | df from ρ₁ = φ·share | grid without φ = 0.98 | days treated as independent |
| --- | --- | --- | --- | --- | --- | --- |
| 60 days, 7 vs 7, no drift | **I 1.7% · pw 9.7%** | 3.0% · 10.7% | 3.0% · 11.0% | 3.0% · 11.0% | 2.7% · 10.3% | 4.0% · 14.3% |
| 60 days, 7 vs 7, drift φ 0.6 | **5.0% · 7.7%** | 5.0% · 8.0% | 6.3% · 8.7% | 6.3% · 8.7% | 5.3% · 8.0% | 9.3% · 14.0% |
| 60 days, 7 vs 7, drift φ 0.85 | **5.7% · 8.3%** | 6.7% · 10.7% | 6.7% · 11.0% | 6.7% · 11.0% | 6.3% · 8.3% | 9.7% · 16.7% |
| 120 days, 14 vs 14, no drift | **5.3% · 22.0%** | 6.0% · 24.3% | 5.7% · 23.3% | 5.7% · 23.7% | 5.7% · 23.0% | 6.7% · 26.3% |
| 120 days, 14 vs 14, drift φ 0.6 | **4.3% · 13.3%** | 6.0% · 15.0% | 5.3% · 15.3% | 5.7% · 16.3% | – | 13.0% · 24.3% |
| 120 days, 14 vs 14, drift φ 0.85 | **4.0% · 13.7%** | 6.0% · 16.0% | 6.0% · 16.3% | 7.0% · 16.3% | 5.3% · 16.0% | 19.7% · 33.7% |
| 90 days, 30 vs 30, no drift | **2.7% · 35.3%** | 4.3% · 40.7% | 3.7% · 37.3% | 3.7% · 38.0% | 3.7% · 40.0% | 5.0% · 51.0% |
| 90 days, 30 vs 30, drift φ 0.85 | **7.0% · 18.3%** | 9.3% · 20.3% | 8.0% · 19.7% | 8.7% · 22.0% | 10.3% · 22.3% | 25.3% · 46.0% |
| **worst type I** | **7.0%** | 9.3% | 8.0% | 8.7% | 10.3% | 25.3% |

**Result: the shipped setting stays.** Every alternative buys 1–5 points of power without drift, but each also raises
false positives when the level really drifts. The worst case moves from 7.0% to 8–10%. Treating days as independent
gives 25%. No tested setting met "type I ≤ 5% in every cell": the shipped one is at or below 5% without drift, and 4–7%
with strong drift. The lost power is the price of not reporting a drifting level as a real change. The alternatives are
still available for analysis, through `countCompare(days, { arP0, dfRule: "step" | "satt" | "rho", arPhis, iid })`.
`tests/unit/stats-r10.test.js` pins three things: the defaults; type I ≤ 5% (+1 point MC tolerance) without drift; ≤ 9.5%
under φ = 0.85 drift. It also requires power ≥ 25% for +20% at 30 vs 30 days.

**What helps instead.** Longer periods. The "days needed" hint (`planMore`) already says how many more days give about
80% power.

## 2. Forecast intervals on short histories (`forecast`)

With less than 3 weeks of data, the forecast falls back to a seasonal-naive forecast (9–20 days) or the mean (under
9 days). Before round 10 both used a normal multiplier on an under-estimated σ. Missing days were filled with the median
and then used as if measured, which made the week-apart differences look smaller than they are.

**Round 10:**

- **Seasonal naive:** σ comes from week-apart pairs that were both actually measured (k pairs), with a t(k − 1)
  multiplier.
- **Missing source day:** the forecast for a weekday uses the last measured value for that weekday. The width grows with
  √(weeks back).
- **Mean method:** t(n − 1)·sd·√(1 + 1/n), from measured days only.
- **Holt-Winters:** the SSE and σ use measured days only.
- **Display:** short-history bands carry `rough: true`, and the dashboard draws them lighter with dashed edges.
- **Old bands kept:** they are still returned as `loNaive` / `hiNaive`.

**Coverage of the nominal 80% band** (1,500 series × 7 days ahead per cell. Weekly pattern, then either independent
noise of ±15%, or a random-walk level of 3% per day plus noise of ±25%. "Missing" = 20% of days not measured.)

| history | method | iid noise: before → after | iid, 20% missing | drift + noise: before → after | drift, 20% missing |
| --- | --- | --- | --- | --- | --- |
| 5 days | mean | 73.4% → 83.9% | 68.7% → 84.3% | 70.5% → 81.1% | 65.9% → 81.8% |
| 8 days | mean | 77.3% → 84.1% | 72.0% → 84.4% | 74.3% → 81.2% | 70.9% → 82.7% |
| 10 days | seasonal naive | 72.2% → 84.7% | 68.7% → 82.8% | 72.0% → 84.6% | 68.5% → 82.1% |
| 14 days | seasonal naive | 77.5% → 81.9% | 76.8% → 83.8% | 77.3% → 81.5% | 74.8% → 83.4% |
| 20 days | seasonal naive | 78.0% → 80.2% | 78.3% → 82.1% | 78.3% → 80.8% | 76.0% → 82.2% |
| 21 days | Holt-Winters | 81.8% → 81.8% | 82.1% → 82.6% | 81.5% → 81.5% | 79.8% → 81.7% |
| 28 days | Holt-Winters | 83.3% → 83.3% | 82.5% → 82.8% | 82.4% → 82.4% | 80.0% → 81.6% |

**Multiplier variants tried at 10 days** (drift + noise, complete / 20% missing):

| multiplier | coverage |
| --- | --- |
| t(k − 1) and σ × √(k/(k − 1)) | 89.2% / 84.0% (too wide) |
| **t(k − 1), shipped** | **84.6% / 82.1%** |
| t(k) | 80.4% / 80.2% |

We chose the slightly conservative t(k − 1). The bands stay labelled "rough" because these simulations do not cover
holidays or level shifts.

## 3. Purchase rate KPI (bills ÷ visitors): quasi-binomial interval

Visitors on the same day are not independent: on a day with long queues, everyone buys less. The per-visitor Wilson
interval is therefore too narrow. In a simulation of 14 days × 150 visitors with a day effect (logit SD 0.3), the
per-visitor Wilson interval covered the true rate in only 68% of 600 replications, against a nominal 95%.

The KPI now shows `quasiBinomCI`: φ = max(1, Pearson χ² of the daily counts ÷ (days − 1)), a Wilson interval on
n / φ, and a t(days − 1) multiplier. Its coverage is 95.5% in the same simulation (`stats-r10.test.js` requires
at least 92%). The
per-visitor Wilson interval is still shown next to it as "counted per person". Goals on the purchase rate use the
quasi-binomial interval.

## 4. Normal tail: Cody erfc

`erf` used Abramowitz–Stegun 7.1.26, which has an absolute error under 1.5 × 10⁻⁷. Its relative error grows in the
tail. Two-sided p-values were off by 0.05% at z = 3, 0.4% at z = 6 and 7% at z = 8.

`lensiq-stats.js` now uses W. J. Cody's rational Chebyshev erfc (CALERF), with relative error around 10⁻¹⁵ out to
erfc(26). The new `normSf(z)` = P(Z > z) avoids computing 1 − Φ(z), which loses precision. The z-test, the large-n
binomial, the robust-z anomaly p and the correlation p now use `normSf`. The old function is kept as `erfAS`.

## 5. Benchmark metrics (`tests/bench/metrics.cjs`)

- **Identity-cluster CIs.** `clusterBootstrap` resamples identities, not visits or pairs. For face 1:N, each row has
  about 12,000 stranger visits but only 500 (CASIA) or about 1,800 (LFW) distinct strangers. For face 1:1, the
  different-person pairs are clustered into connected components of the "shares a person" graph (595 components for
  1,100 pairs). With zero or very few events, a design-effect Wilson guard replaces the percentile interval, which would
  otherwise collapse to [0, 0]. Results are in `ACCURACY.md` §2.
- **EER.** It now uses the same acceptance rule as the verification table (distance < threshold) and sweeps midpoints
  between observed distances. The LFW EER is unchanged at 1.4%.
- **AP.** `detEval().ap` is now the VOC/COCO per-rank greedy AP: detections in global score order, each taking the
  highest-IoU free ground truth, and detections on ignore regions skipped. The previous value, which swept the
  operating-point Hungarian assignment, is still returned as `apAssign`. The AP figures in `ACCURACY.md` §1 and §4 were
  computed before round 10 (the `apAssign` method). The next benchmark run reports both.
