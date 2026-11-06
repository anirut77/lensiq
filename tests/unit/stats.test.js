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
  const am = S.abMeans([{ name: "x", values: [1, 2, 3, 4, 5] }, { name: "y", values: [3, 4, 5, 6, 7] }, { name: "z", values: [9] }]);
  assert.equal(am.best.name, "y"); assert.equal(am.groups.find(g => g.name === "z").enough, false); near(am.test.p, 0.08052, 1e-4);
  const g = S.seasonGrid([{ wd: 1, h: 9, v: 4 }, { wd: 1, h: 9, v: 6 }, { wd: 2, h: 10, v: 3 }]);
  assert.equal(g.mean[1][9], 5); assert.equal(g.n[1][9], 2); assert.equal(g.mean[0][0], null); assert.equal(g.max, 5);
  assert.equal(S.confLevel(0.001), "strong"); assert.equal(S.confLevel(0.03), "moderate"); assert.equal(S.confLevel(0.1), "weak"); assert.equal(S.confLevel(0.5), "none"); assert.equal(S.confLevel(0.001, false), "insufficient");
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
