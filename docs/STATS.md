# LENSIQ statistics: calibration notes (rounds 10–12)

This page records the simulations behind the statistical choices in `lensiq-stats.js` (version 3.5.0), the insights
dashboard, and the benchmark intervals in `ACCURACY.md`. Every number below can be reproduced from a seeded simulation.
The regression tests are `tests/unit/stats-typeone-sequential.test.js`, `tests/unit/stats-tails-forecast.test.js`, `tests/unit/stats.test.js` and
`tests/unit/bench-metrics.test.js`; round 12 adds `tests/unit/stats-intervals.test.js` and `tests/unit/sitecheck-net-error.test.js`
(§11–§14). Round-11 type-I pins use at least 1,000 seeded replications with the bound 5% + 2 Monte-Carlo
SE (6.4% at 1,000); `LQ_STATS_LONG=1 node --test tests/unit/stats-typeone-sequential.test.js` runs longer cells.

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
`tests/unit/stats-tails-forecast.test.js` pins three things: the defaults; type I ≤ 5% (+1 point MC tolerance) without drift; ≤ 9.5%
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
n / φ, and a t(days − 1) multiplier. Its coverage is 95.5% in the same simulation (`stats-tails-forecast.test.js` requires
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
- **Person-cluster intervals for the studio and photo booth tables (round 11).** `personClusterCI(rows)` resamples people
  (4 outfit renders per portrait); `mcnemar(b, c)` is the exact McNemar test; `pairedCluster(pairs)` compares two variants of the
  same person × garment with a person-cluster bootstrap CI and a sign-flip test on per-person sums. `tests/bench/studio-intervals.mjs`
  prints every `ACCURACY.md` §11 / §11b rate with both methods. The design effect is 2.3–3.9 on the outfit rows (first row: 72.9%,
  Wilson [65.0–79.5] → cluster [56.7–87.1]). Plain vs cover on test: McNemar p = 3.6 × 10⁻⁸ (pairs treated as independent),
  person-clustered p = 0.003, change −23.6 points [−37.9, −10.0]; on dev the clustered p is 0.31. `studio.bench.mjs` and
  `photobooth.bench.mjs` now print the cluster block by default (`--no-cluster` skips it).

## 6. Quasi-likelihood tests when there is no overdispersion (round 11, `quasiRef`)

**Problem.** `twoPropDaily` and `quasiBinomCI` floored φ at 1 and still used t(days − 1). Without day-to-day overdispersion this
is needlessly conservative: type I 1.9–2.1% at 7 vs 7 days and 0.5% at 3 vs 3; the 95% interval covered 99.2% (7 days) and
99.9% (3 days).

**Fix.** φ̂ = Pearson χ²/df. When φ̂ ≤ 1 the test uses z with φ = 1; when φ̂ > 1 it uses √φ̂ with t(df) as before. Variants tried
(3,000 replications, 7 vs 7 days × 150 people/day, rate 25%, day logit SD 0–0.5): floor + t (old) 2.0–5.6%; **z when φ̂ ≤ 1:
3.2–5.6%**; Satterthwaite df = df·(φ̂/(φ̂ − 1))²: 3.6–6.5%; subtracting 0.5–1 SE of φ̂ before flooring: 3.8–9.6% (too liberal).

**Shipped, type I of `twoPropDaily`** (2,000 replications per cell; MC SE ≈ 0.5 points):

| periods | day SD 0 | 0.1 | 0.2 | 0.3 | 0.5 |
| --- | --- | --- | --- | --- | --- |
| 3 vs 3 days, 150/day | 2.8% (was 0.5%) | 4.0% | 5.5% | 6.1% | 5.6% |
| 7 vs 7 days, 150/day | 3.5% (was 2.0%) | 3.8% | 4.5% | 5.7% | 5.0% |
| 14 vs 14 days, 100/day | 4.5% (was 3.9%) | 4.7% | 5.0% | 4.7% | 4.9% |

The worst cell is 6.1% (3 vs 3 days, SD 0.3): with only 4 df, φ̂ falls below 1 by chance fairly often. **`quasiBinomCI`
coverage** (2,000 replications): 3 days 97.5% (was 99.9%) / 92.7% with day SD 0.3; 7 days 97.0% (was 99.2%) / 95.6%; 14 days
96.4% / 94.0%.

**p and interval agree.** `twoProp` and `twoPropDaily` now invert their own interval for p (`pFromCI`): p < 0.05 exactly when the
95% interval excludes 0. The pooled z-test is still returned as `pPooled` / `pZ` (it differed from the Newcombe interval near
α = 0.05). `correlation` uses the exact t p-value (Fisher z kept as `pFisher`): 1.25 × 10⁻¹⁰ instead of 2 × 10⁻¹³ at r = 0.92,
n = 25. `tCrit` now uses Newton steps from a Cornish–Fisher start (same values, about 5× faster).

## 7. Repeated looks (round 11, `mixtureP` / `seqP`)

The dashboard and its alerts are re-computed every day. A test that is fine for one look is not fine for 22: the purchase-rate
alert (last 7 days vs the 7 before, "clear drop" = drop > 15% and p < 0.05) raised at least one false "clear drop" in 16–29% of
22-day null runs. **Fix:** the alert's "clear" level now also needs the p of a mixture SPRT (normal mixture
τ = 15% of the earlier rate; the one-look p is converted to an equivalent z, so the same evidence is used). When only the one-look
test is clear, the alert still appears at the "may have dropped, not conclusive" level, with a note that it is re-checked daily.

| 22 daily looks, 1,000 runs | one-look p < 0.05 | **mixture p < 0.05** |
| --- | --- | --- |
| no day effect, 150 people/day | 15.8% | **0.5%** |
| day SD 0.2, 150/day | 29.3% | **3.0%** |
| day SD 0.3, 300/day | 29.1% | **1.3%** |
| real −30% in the last week (power) | 92.9% | 27.8% |

The price is power. On accumulating data (period A growing from 7 to 28 days against a fixed B) the one-look rule gives ≈ 10%
family-wise and `seqP` stays under 5% (`stats-typeone-sequential.test.js`). KPI cards keep their one-look label, but when it is "clear" and the
always-valid p is not, the card says so ("if you check this every day …"), and the "days needed" hint now asks for a decision
date fixed in advance. Not done: a stored per-user decision date that freezes a comparison (needs UI state in `insights-ui.js`).

**Scope of the guarantee (round 12 correction).** The mixture-SPRT p is *always valid* (Ville's inequality: P(ever below α) ≤ α
however often it is looked at) only for data that accumulate. The dashboard and the alert use a **sliding** window (the last
7 days vs the 7 before, recomputed daily): old days drop out, so the theorem does not apply. On that window the false-alarm
control is **empirically calibrated by simulation only**; the numbers in the table above are simulation results, not a bound.
See §14 for the τ sensitivity and the accumulating alternative.

## 8. Signage A/B on time strata (round 11, `abRatesStrata`)

Cumulative per-ad totals mix the ad with **when** it played. **Data:** per-ad totals per day × daypart come from the proof-of-play
log `sg-pop` that `signage.js` already keeps (last 1,000 plays; only plays with the audience measured), or from per-day totals
`sg-stats.ads[id].days` if `signage.js` stores them (`LQInsightsData.iqSgBumpDay` is the helper; not wired yet). **Test:** pairwise
Mantel–Haenszel risk difference over the strata both ads played in, φ̂ from Cochran's Q across strata (`quasiRef` rule), omnibus
generalized Cochran–Mantel–Haenszel, protected Holm as before. **Label cap:** if the two ads share less than 50% of their audience
in common strata, fewer than 3 common strata, or there is no per-stratum data at all, the label is capped at "weak" and the card
shows the overlap.

| any pair "different" (pAdj < 0.05), no true difference, day logit SD 0.4, 1,000 runs | cumulative totals | **day strata** |
| --- | --- | --- |
| 3 ads × 14 days, each ad mostly on its own days | 35.8% | **≤ 1%** |
| 4 ads × 14 days, two ads per day in rotation | 42.2% | **1.2%** |
| 2 ads × 7 days, mostly own days | 25.2% | **4.2%** |
| 3 ads, all every day (balanced) | 6.8% | **2.2%** |
| 3 ads, disjoint days | 50.6% | **0%** (no common strata) |

Power for +0.3 logit on one ad, balanced, 14 days: 89–91% (totals: 97–98%, but those are not valid under day effects). The
demo data has no `sg-pop`, so the demo's signage card is capped at "weak" and says why.

## 9. Daily means for goals and KPIs (round 11, `dailyMeanCI`)

`meanCI` on daily values ignores the weekday pattern (a partial week skews the mean) and autocorrelation. `dailyMeanCI`: with
≥ 14 days and every weekday at least twice, the weekday-balanced mean (mean of weekday means); otherwise the plain mean. SE from
the residuals × (1 + ρ)/(1 − ρ), ρ = bias-corrected lag-1 autocorrelation of the residuals in [0, 0.9], df = (n − p)(1 − ρ)/(1 + ρ).
Coverage of the long-run mean (2,000 series per cell, weak weekday pattern):

| AR(1) of daily noise | 7 days | 10 | 14 | 21 | 30 |
| --- | --- | --- | --- | --- | --- |
| 0 | 95.5% → 97.3% | 95.3% → 96.8% | 95.8% → 97.8% | 94.8% → 96.7% | 95.7% → 96.9% |
| 0.3 | 88.5% → 92.9% | 87.8% → 93.8% | 86.3% → 94.3% | 85.5% → 95.0% | 86.3% → 94.8% |
| 0.5 | 77.2% → 87.5% | 76.3% → 89.0% | 76.7% → 93.5% | 77.5% → 93.8% | 76.5% → 94.3% |
| 0.7 | 63.6% → 82.6% | 59.4% → 84.3% | 59.6% → 92.1% | 57.1% → 92.6% | 59.1% → 93.9% |

(old `meanCI` → `dailyMeanCI`). Short windows with strong autocorrelation still under-cover (83–89% at 7–10 days). Used by the
visitors/day and revenue/day goals and the KPI "mean per day" lines.

**QC yield.** The yield goal, KPI, card and alert use `iqQcCI`: when the per-bottle log covers ≥ 90% of the shift (and ≥ 40
bottles), the shift is cut into ~12 consecutive stretches and `quasiBinomCI` runs on them, so a bad stretch (a jam, a new lot)
widens the interval; otherwise Wilson as before. Evenly spread rejects give the Wilson interval.

## 10. Empirical-Bayes A/B intervals (round 11, `ebBinom`)

When τ² ≤ 0 the prior weight was 10⁶ and every arm got a near-zero-width "posterior 95%" interval (24/80, 26/80, 25/80 →
[0.3116, 0.3134]). They are not shown in the UI today but are exported. Now: τ² not identified (≤ 0, or fewer than 3 groups) →
the arm's own Wilson interval (`ciMethod: "wilson"`); τ² > 0 → posterior with the prior weight capped at the largest arm's n and
the width at least 80% of Wilson. The shrunk point estimate used for ranking is unchanged. Coverage of the true arm rates (4 arms
× 80, 2,000 runs): τ = 0: 35.2% → 97.4%; τ = 0.03: 46.5% → 96.7%; τ = 0.08: 71.8% → 93.0%.

## 11. On-site door check: net count error interval (round 12, `lensiq-sitecheck.js` `netErrorCI`)

**Problem.** Rounds 10–11 used a percentile bootstrap over 60-s blocks and accepted 3 blocks. A percentile bootstrap over 3–5
blocks is far too narrow, and a busy door reaches the 50-crossing minimum in under 3 minutes. **Now:**
- block length = span ÷ 10, rounded down to 5 s, kept within 15–60 s, so there are at least 10 blocks when the check lasts
  ≥ 2.5 minutes; the system's times are shifted by the measured tap lag first;
- a Fieller interval for the ratio Σcounted/Σtrue over blocks, with Student t on B − 1 df (the plain linearised ratio ± t·se was
  tried first: it covered 92–93% at about 5 crossings per block because it ignores the random denominator);
- fewer than 10 blocks = `short`: the interval is shown but cannot confirm the target. The strict verdict stops at "on target
  so far" and `need` asks for more minutes. Below 3 blocks there is no interval (the cameras page then says how long to continue).
- the pilot grade uses the 90% version of the same interval (`lo90`/`hi90`); the round-11 bootstrap is still reported as `.boot`.

Monte Carlo (`sitecheck-net-error.test.js` model): arrivals in groups of 1–3, a group counted once 25% of the time, 8% single misses,
3% false counts, 0.5–0.9 s lag; true net error −11.6%; 1,500 checks per row (600 at 20–30 min). "False pass" = the interval lies
inside the ±10% target although the true error is −11.6%.

| check | coverage, round-11 bootstrap | **coverage, round 12** | false pass, round 11 | **false pass, round 12** |
| --- | --- | --- | --- | --- |
| 3 min · 20/min | 72.2% | **96.3%** | 10.2% | **1.6%** |
| 4 min · 20/min | 80.9% | **95.9%** | 6.9% | **0.8%** |
| 5 min · 20/min | 83.3% | **94.8%** | 5.9% | **1.3%** |
| 10 min · 20/min | 90.5% | **95.3%** | 2.1% | **1.1%** |
| 30 min · 20/min | 96.3% | **96.5%** | 0.2% | **0.2%** |
| 3 min · 60/min | 73.7% | **98.1%** | 6.5% | **0.5%** |
| 10 min · 5/min | 91.1% | **94.6%** | 3.3% | **1.7%** |
| 20 min · 5/min | 94.5% | **96.5%** | 1.2% | **1.7%** |

A good door (true −2%) still reaches "pass" in ≥ 60% of 15-minute checks (pinned). **Door precision / recall / direction**
now use episode clusters (crossings < 3 s apart = one group walking through): design effect deff = Σ(x_g − p·n_g)² / (N·p(1 − p)),
cluster interval = Wilson on N / deff, and the reported interval is the wider of the two, as attendance does for people. Independent
crossings keep exactly the Wilson interval; 25 groups of 4 missed together give deff ≈ 4. deff also inflates "collect N more".

## 12. A/B pairs and `poissonTest`: p-values that agree with the interval shown (round 12)

**A/B pairs.** Pairs were judged by protected Holm (pAdj = max(Holm p, omnibus p)) but displayed a Bonferroni interval at
1 − 0.05/m, and the two disagreed. With 4 arms × 400 and 1,500 runs, 151 of 9,000 pairs (1.7%) had pAdj < 0.05 while the
interval crossed 0. **Now** each pair's displayed interval is computed at the *compatible* level 1 − α·pRaw/pAdj. Because the raw
pair p is inverted from the same interval (twoProp, Welch t, Mantel–Haenszel), that interval excludes 0 **exactly** when pAdj < α.
This is the step-down Holm level 1 − α/(m − k + 1), and it widens enough to cross 0 when the omnibus test fails. The Bonferroni
(simultaneous) interval is still returned as `loBonf`/`hiBonf`. Property test: 0 disagreements across abRates, abMeans and
abRatesStrata (the Bonferroni interval disagreed on 1.2% of the same pairs).

**poissonTest** returned an exact conditional p with a Wald log-ratio interval, and they disagreed in 64 cells of 1–59 × 1–59
(3 vs 11: p = 0.057, interval [−92%, −2%]). Now p is the central exact p (2·min tail of Bin(c1 + c2, t1/(t1 + t2))). The interval is
Clopper–Pearson on π converted to the rate ratio π/(1 − π)·t2/t1, so the two agree in every cell 0–59 × 0–59. The old values stay
as `pMinLik` and `loWald`/`hiWald`. Exact coverage at λ 12 vs 8: ≥ 95% (conservative by construction).

## 13. One Wilson formula; rater agreement (round 12)

`lensiq-stats.js` `wilsonZ(x, n, z)` is the repo's Wilson formula. `tests/bench/metrics.cjs` now calls it. `lensiq-sitecheck.js`
loads on camera pages without `lensiq-stats.js`, so it keeps a copy, and `stats-intervals.test.js` pins it bit-for-bit
(together with the studio-tables copy and the round-11 bench formula, ≤ 1e-15) on a grid of 5 z × 10 n × all x. Its pinned t
tables (`t975`) are checked against `tCrit` for df 1–200. Quantile rules still differ by design: type 7 in lensiq-stats, nearest
rank in the sitecheck cluster bootstrap and the paired bootstrap. Both are seeded and pinned by their own tests.

**Rater agreement.** `raterAgreement(rows)` gives raw agreement, Cohen's κ and Gwet's AC1 with person-cluster bootstrap intervals,
and marks the result `indicative` below 15 people. AC1 is reported because κ drops when one label dominates, the κ paradox; the
test pins a case with 90% agreement, κ < 0.1 and AC1 > 0.85. `fleissKappa` covers more than two raters (pinned to Fleiss's worked
example, κ = 0.210). Studio labels (round-9 vs round-10 rater, plain renders; defect prevalence 71%):

| split | renders / people | raw agreement | Cohen's κ [95% person-cluster] | Gwet's AC1 |
| --- | --- | --- | --- | --- |
| dev | 108 / 27 | 80.6% | 0.54 [0.19–0.83] | 0.67 [0.40–0.89] |
| test | 140 / 35 | 83.6% | 0.60 [0.28–0.84] | 0.72 [0.48–0.90] |

`node tests/bench/studio-intervals.mjs` also flags every row counted from fewer than 15 people as "indicative only".

## 14. Repeated looks on the sliding window: τ sensitivity (round 12)

Purchase rate 25%, 150 people/day, day-level logit SD 0.2, the 7-vs-7 window recomputed on 22 consecutive days. The table counts any
p < 0.05 in either direction, with no "drop > 15%" filter, so it is stricter than the alert. 600 runs per row:

| τ (fraction of the earlier rate) | one-look p < 0.05 | mixture p < 0.05 (sliding) | mixture p < 0.05 (accumulating, `seqAccum`) |
| --- | --- | --- | --- |
| 0.10 | 49.2% | 3.7% | 0.5% |
| 0.15 (default) | 48.7% | 4.2% | 0.3% |
| 0.25 | 46.7% | 4.7% | 0.7% |

On the sliding window the mixture p stays under 5% at all three τ, but the margin shrinks as τ grows. That is an empirical result
for this simulation design, not a guarantee. The test pins ≤ 5% + 2 SE at each τ. `seqAccum(daily, start, ref)` is the accumulating
design: a fixed start date and a growing window against a fixed reference. That is where the always-valid guarantee does hold. It
is available in the library, and the dashboard still uses the sliding window. Switching the dashboard needs a stored start date per
comparison (UI state).

## Still open (needs outside resources)

- Validate the dashboard tests on real store data (A/A splits of historical weeks to measure the empirical false-alarm rate)
  once a pilot site exists.
- An independent statistician's review of `countCompare`, `arContrast`, the site-check verdicts and the round-11 rules above.
- Human, blinded raters for the studio / photo booth labels (the intervals now honestly reflect 35 people, not more raters).
- A held-out studio / booth test set of ≥ 100 people with two independent human raters (κ / AC1 are computed now; with 35 people
  the κ interval is still 0.28–0.84).
- Real in-store door-count ground truth at ≥ 3 sites over several hours (the §11 coverage is from a simulation model of grouped
  arrivals, not field data), and a statistician's sign-off on the site-check acceptance protocol (target, minimum duration of
  2.5 minutes / 10 blocks, block design) before it is sold as an acceptance test.

