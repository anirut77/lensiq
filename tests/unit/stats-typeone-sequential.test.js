"use strict";
// node --test tests/unit — round-11 statistics fixes (lensiq-stats.js 3.4.0, insights-analysis.js); tables in docs/STATS.md §6–§10.
// Type-I pins use ≥ 1,000 seeded replications and the bound 5% + 2 Monte-Carlo SE (= 6.38% at 1,000 reps).
// LQ_STATS_LONG=1 adds slower long-run cells (more replications, countCompare under repeated looks).
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../lensiq-stats.js");
const I = require("../../insights.js");

const LONG = !!process.env.LQ_STATS_LONG;
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const gauss = R => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
const binom = (R, n, p) => { let x = 0; for (let i = 0; i < n; i++) if (R() < p) x++; return x; };
const logit = p => Math.log(p / (1 - p)), expit = z => 1 / (1 + Math.exp(-z));
const bound = (reps, a = 0.05) => a + 2 * Math.sqrt(a * (1 - a) / reps);
const pc = v => (100 * v).toFixed(1) + "%";
const days = (R, L, n, p, sd) => Array.from({ length: L }, () => ({ x: binom(R, n, expit(logit(p) + sd * gauss(R))), n }));

test("twoPropDaily: type I ≈ 5% both without and with day-level overdispersion (φ̂ ≤ 1 → z, else √φ̂ with t)", () => {
  const REPS = LONG ? 4000 : 1000, rows = [];
  for (const [L, n, sd, lo] of [[7, 150, 0, 0.025], [3, 150, 0, 0.02], [7, 150, 0.3, 0], [14, 100, 0.15, 0]]) {
    const R = rng(1000 + L * 7 + sd * 100); let h = 0;
    for (let r = 0; r < REPS; r++) if (S.twoPropDaily(days(R, L, n, 0.25, sd), days(R, L, n, 0.25, sd)).p < 0.05) h++;
    rows.push(`${L} vs ${L} days, n ${n}/day, day SD ${sd}: ${pc(h / REPS)}`);
    assert.ok(h / REPS <= bound(REPS), "type I too high — " + rows.at(-1));
    assert.ok(h / REPS >= lo, "still over-conservative (round 10: 2.0% at 7 days, 0.5% at 3 days) — " + rows.at(-1));
  }
});

test("quasiBinomCI: coverage near 95% with and without day effects (was 99.2–99.9% when φ = 1)", () => {
  const REPS = 1000;
  for (const [L, sd, lo, hi] of [[7, 0, 0.93, 0.975], [3, 0, 0.93, 0.975], [14, 0.3, 0.92, 0.985]]) {
    const R = rng(77 + L + sd * 10); let c = 0;
    // true long-run rate: logit-normal mean (MC constant for sd 0.3 around 0.25 ≈ 0.2541)
    const truth = sd ? 0.2541 : 0.25;
    for (let r = 0; r < REPS; r++) { const q = S.quasiBinomCI(days(R, L, 150, 0.25, sd)); if (q.lo <= truth && truth <= q.hi) c++; }
    assert.ok(c / REPS >= lo && c / REPS <= hi, `${L} days, day SD ${sd}: coverage ${pc(c / REPS)}`);
  }
});

test("twoProp / twoPropDaily: the p-value is inverted from the same interval (p < 0.05 ⇔ the 95% CI excludes 0)", () => {
  const R = rng(5); let checked = 0;
  for (let r = 0; r < 400; r++) {
    const n1 = 20 + Math.floor(R() * 300), n2 = 20 + Math.floor(R() * 300), p1 = 0.05 + 0.5 * R(), p2 = p1 + (R() - 0.5) * 0.25;
    const t = S.twoProp(binom(R, n1, p1), n1, binom(R, n2, Math.min(0.99, Math.max(0.01, p2))), n2);
    if (t.diff !== 0) { assert.equal(t.p < 0.05, t.lo > 0 || t.hi < 0, JSON.stringify(t)); checked++; }
    const d = S.twoPropDaily(days(R, 5, 80, p1, 0.3 * R()), days(R, 5, 80, Math.min(0.95, Math.max(0.02, p2)), 0.3 * R()));
    if (d.diff !== 0) assert.equal(d.p < 0.05, d.lo > 0 || d.hi < 0, JSON.stringify(d));
  }
  assert.ok(checked > 300);
  // the pooled z-test is still returned for reference
  const t = S.twoProp(45, 100, 30, 100); assert.ok(Math.abs(t.pPooled - 0.02846) < 2e-4 && Math.abs(t.p - t.pPooled) < 1e-3);
});

test("correlation: exact t p-value (Fisher z kept as pFisher); null type I at n = 10", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], y = [2, 1, 4, 3, 6, 5, 8, 9, 7, 11, 12, 10];
  const c = S.correlation(x, y), t = c.r * Math.sqrt(10 / (1 - c.r * c.r));
  assert.ok(Math.abs(c.p - 2 * (1 - S.tCdf(t, 10))) < 1e-12, `${c.p}`);
  assert.ok(c.pFisher < c.p, "Fisher z is anti-conservative at high |r|");
  const R = rng(9), REPS = 1000; let h = 0;
  for (let r = 0; r < REPS; r++) { const a = Array.from({ length: 10 }, () => gauss(R)), b = Array.from({ length: 10 }, () => gauss(R)); if (S.correlation(a, b).p < 0.05) h++; }
  assert.ok(h / REPS <= bound(REPS) && h / REPS >= 0.03, "exact t type I " + pc(h / REPS));
});

test("ebBinom: honest intervals when τ² is not identified (Wilson), coverage ≥ 92% when arms really differ", () => {
  const E = S.ebBinom([{ x: 24, n: 80 }, { x: 26, n: 80 }, { x: 25, n: 80 }]);
  assert.equal(E.ciMethod, "wilson");
  E.groups.forEach(g => { const w = S.wilson(g.x, g.n); assert.ok(Math.abs(g.lo - w.lo) < 1e-12 && Math.abs(g.hi - w.hi) < 1e-12); assert.ok(g.hi - g.lo > 0.15, "was [0.3116, 0.3134]"); });
  assert.ok(E.groups.every(g => Math.abs(g.shrunk - 0.3125) < 0.005), "the shrunk point estimate (ranking) is unchanged");
  for (const tau of [0, 0.03, 0.08]) {
    const R = rng(31 + tau * 1000), REPS = 1000; let hit = 0, tot = 0;
    for (let r = 0; r < REPS; r++) {
      const P = Array.from({ length: 4 }, () => Math.min(0.95, Math.max(0.05, 0.3 + tau * gauss(R)))), G = P.map(p => ({ x: binom(R, 80, p), n: 80 }));
      S.ebBinom(G).groups.forEach((g, i) => { tot++; if (g.lo <= P[i] && P[i] <= g.hi) hit++; });
    }
    assert.ok(hit / tot >= 0.92, `τ ${tau}: coverage ${pc(hit / tot)} (round 10: 54.7% at τ = 0)`);
  }
});

test("mixtureP / seqP: mSPRT formula, never below the one-look p, ≤ 1", () => {
  const V = 0.01, T2 = 0.0225, est = 0.3, L = Math.sqrt(V / (V + T2)) * Math.exp(est * est * T2 / (2 * V * (V + T2)));
  assert.ok(Math.abs(S.mixtureP(est, 0.1, 0.15) - 1 / L) < 1e-12);
  for (const p of [0.5, 0.05, 0.01, 1e-4, 1e-8]) { const q = S.seqP(0.2, p, 0.15); assert.ok(q >= p && q <= 1, `${p} → ${q}`); }
  assert.equal(S.seqP(0, 0.01, 0.15), 1); assert.equal(S.mixtureP(0.1, 0, 0.15), 1);
});

// rolling 7-vs-7-day purchase-rate alert, evaluated on 22 consecutive days (the dashboard re-runs it every day)
function alertLooks(R, { sd = 0.2, n = 150, p = 0.25, eff = 1 } = {}) {
  const D = Array.from({ length: 35 }, (_, i) => ({ x: binom(R, n, Math.min(1, expit(logit(p) + sd * gauss(R)) * (i >= 28 ? eff : 1))), n }));
  let fixed = false, seq = false;
  for (let e = 13; e < 35; e++) {
    const t = S.twoPropDaily(D.slice(e - 6, e + 1), D.slice(e - 13, e - 6)); if (!(t.p2 > 0 && t.diff / t.p2 < -0.15)) continue;
    const q = I.iqSeqClear(t, true); if (q.fixed === "strong" || q.fixed === "moderate") fixed = true; if (q.level === "strong" || q.level === "moderate") seq = true;
  }
  return { fixed, seq };
}
test("repeated looks: the daily purchase-rate alert's 'clear drop' stays ≤ 5% family-wise over 22 daily looks", () => {
  for (const sc of [{ sd: 0.2 }, { sd: 0.3, n: 300 }, { sd: 0, n: 150 }]) {
    const REPS = LONG ? 3000 : sc.sd === 0.2 ? 1000 : 300, R = rng(40 + sc.sd * 100); let f = 0, s = 0;
    for (let r = 0; r < REPS; r++) { const o = alertLooks(R, sc); if (o.fixed) f++; if (o.seq) s++; }
    assert.ok(s / REPS <= bound(REPS), `${JSON.stringify(sc)}: always-valid rule ${pc(s / REPS)}`);
    if (sc.sd >= 0.2) assert.ok(f / REPS > 0.15, `one-look p < 0.05 every day is inflated: ${pc(f / REPS)}`);
  }
  // it still fires on a real 30% drop in the last week (the 'may have dropped' alert fires earlier either way)
  const R = rng(44); let pw = 0; for (let r = 0; r < 300; r++) if (alertLooks(R, { sd: 0.2, eff: 0.7 }).seq) pw++;
  assert.ok(pw / 300 >= 0.2, "power for a 30% drop in the last week (one-look rule ≈ 90%; the price of daily re-checks) " + pc(pw / 300));
});

test("repeated looks on accumulating data (period A grows 7 → 28 days vs a fixed B): seqP keeps ≤ 5%", () => {
  const REPS = LONG ? 2000 : 600, R = rng(52); let f = 0, s = 0;
  for (let r = 0; r < REPS; r++) {
    const D = days(R, 35, 150, 0.25, 0.2), B = D.slice(0, 7); let F = false, Q = false;
    for (let e = 14; e <= 35; e++) { const t = S.twoPropDaily(D.slice(7, e), B); if (t.p < 0.05) F = true; if (S.seqP(t.diff, t.p, S.SEQ.tauRel * t.p2) < 0.05) Q = true; }
    if (F) f++; if (Q) s++;
  }
  assert.ok(s / REPS <= bound(REPS), "always-valid " + pc(s / REPS)); assert.ok(f / REPS > 0.08, "one-look " + pc(f / REPS));
});

// signage: k ads over D days ; schedules bal (every ad every day) | part (ad j on days j, j+1 mod k) | mostly (own day + 30% elsewhere) | disj
function sgScen(R, { k, D, sd, sched, eff = 0 }) {
  const G = Array.from({ length: k }, (_, j) => ({ id: "a" + j, name: "a" + j, x: 0, n: 0, strata: {} }));
  for (let d = 0; d < D; d++) {
    const dl = sd * gauss(R);
    for (let j = 0; j < k; j++) {
      const on = sched === "bal" || (sched === "disj" ? d % k === j : sched === "part" ? d % k === j || (d + 1) % k === j : d % k === j || R() < 0.3);
      if (!on) continue; const m = Math.round(100 * (0.6 + 0.8 * R())), x = binom(R, m, expit(logit(0.3) + dl + (j === 0 ? eff : 0)));
      G[j].x += x; G[j].n += m; G[j].strata["d" + d] = { x, n: m };
    }
  }
  return G;
}
test("signage A/B on day strata: family-wise false positives ≤ 5% for unbalanced schedules (cumulative totals: up to ~50%)", () => {
  const REPS = 1000, rows = [];
  for (const sc of [{ k: 3, D: 14, sd: 0.4, sched: "mostly" }, { k: 4, D: 14, sd: 0.4, sched: "part" }, { k: 2, D: 7, sd: 0.4, sched: "mostly" }, { k: 3, D: 14, sd: 0.4, sched: "bal" }, { k: 3, D: 14, sd: 0.4, sched: "disj" }]) {
    const R = rng(60 + sc.k * 10 + sc.sched.length); let tot = 0, st = 0;
    for (let r = 0; r < REPS; r++) {
      const G = sgScen(R, sc);
      if (S.abRates(G).pairs.some(p => p.pAdj < 0.05)) tot++;
      if (S.abRatesStrata(G).pairs.some(p => p.pAdj < 0.05)) st++;
    }
    rows.push(`${JSON.stringify(sc)}: totals ${pc(tot / REPS)} → strata ${pc(st / REPS)}`);
    assert.ok(st / REPS <= bound(REPS), rows.at(-1));
    if (sc.sched === "disj") assert.ok(tot / REPS > 0.3, "the cumulative-total test is badly confounded: " + rows.at(-1));
  }
  // power with a balanced rotation: +0.3 logit for one ad, 14 days, day SD 0.4
  const R = rng(66); let pw = 0; for (let r = 0; r < 300; r++) { const a = S.abRatesStrata(sgScen(R, { k: 3, D: 14, sd: 0.4, sched: "bal", eff: 0.3 })); if (a.best.id === "a0" && a.spread.p < 0.05) pw++; }
  assert.ok(pw / 300 >= 0.75, "power " + pc(pw / 300));
});

test("signage A/B: overlap is reported; little overlap or no per-slot data caps the label at 'weak'", () => {
  const R = rng(70), G = sgScen(R, { k: 2, D: 14, sd: 0, sched: "mostly", eff: 1.2 });
  const a = S.abRatesStrata(G);
  assert.equal(a.strata, true); assert.ok(a.test.overlap > 0 && a.test.overlap < 0.5, "overlap " + a.test.overlap); assert.equal(a.test.cap, "weak");
  const bal = S.abRatesStrata(sgScen(R, { k: 2, D: 14, sd: 0, sched: "bal", eff: 1.2 }));
  assert.ok(bal.test.overlap > 0.99 && bal.test.cap === null && bal.test.p < 0.01 && bal.test.shared === 14);
  const none = S.abRatesStrata(G.map(g => ({ ...g, strata: null })));
  assert.equal(none.strata, false); assert.ok(none.pairs.every(p => p.cap === "weak"));
  assert.equal(I.iqCapLevel("strong", "weak"), "weak"); assert.equal(I.iqCapLevel("none", "weak"), "none"); assert.equal(I.iqCapLevel("moderate", null), "moderate");
});

test("signage strata come from the proof-of-play log (sg-pop) or per-day ad totals; the card shows the overlap", () => {
  const NOW = new Date(2026, 10, 6, 15).getTime(), day = 86400e3, log = [];
  for (let d = 1; d <= 10; d++) for (const [ad, h] of [["A", 9], ["B", 9], ["A", 15], ["B", 15]]) log.push({ t: NOW - d * day + (h - 15) * 3600e3, ad, title: ad, s: 20, why: "loop", dp: h < 12 ? "morning" : "afternoon", ots: 40, v: ad === "A" ? 20 : 12, m: 1 });
  log.push({ t: NOW - day, ad: "A", ots: 50, v: 50, m: 0, dp: "morning" }); // not measured → ignored
  const sg = { v: 1, since: NOW - 11 * day, totals: { ots: 1600, viewers: 640, dwell: 0, attn: 0 }, ads: { A: { title: "A", ots: 800, viewers: 400, plays: 20 }, B: { title: "B", ots: 800, viewers: 240, plays: 20 } }, hourly: {} };
  const st = I.iqSgStrata(sg, { v: 1, log });
  assert.equal(st.info.source, "pop"); assert.equal(st.info.plays, 40); assert.equal(Object.keys(st.byAd.A).length, 20); assert.equal(st.byAd.A[Object.keys(st.byAd.A)[0]].x, 20);
  const D = I.iqCollect({ "sg-stats": JSON.stringify(sg), "sg-pop": JSON.stringify({ v: 1, log }) });
  const A = I.iqAnalyze(D, I.iqRange("d7", NOW, D), { now: NOW });
  assert.equal(A.ab.sg.strata, true); assert.ok(A.ab.sg.test.overlap > 0.99 && A.ab.sg.test.shared === 20);
  const card = I.iqInsights(D, A).find(c => c.id === "ab-sg");
  assert.ok(card.why.some(w => /เทียบเฉพาะวันและช่วงเวลาที่เล่นร่วมกัน \(20 ช่วง/.test(w)), JSON.stringify(card.why));
  // without the log: same totals, no strata → capped, and the card says why
  const D2 = I.iqCollect({ "sg-stats": JSON.stringify(sg) }), A2 = I.iqAnalyze(D2, I.iqRange("d7", NOW, D2), { now: NOW }), c2 = I.iqInsights(D2, A2).find(c => c.id === "ab-sg");
  assert.equal(A2.ab.sg.strata, false); assert.ok(["weak", "none", "insufficient"].includes(c2.level), c2.level);
  assert.ok(c2.why.some(w => /ยังไม่มียอดแยกตามวันและช่วงเวลา/.test(w)));
  // per-day totals written by iqSgBumpDay take precedence over the play log
  const s3 = JSON.parse(JSON.stringify(sg)); I.iqSgBumpDay(s3, "A", NOW, 10, 4); I.iqSgBumpDay(s3, "A", NOW, 5, 1);
  assert.deepEqual(s3.ads.A.days[I.iqDay(NOW)], { ots: 15, viewers: 5 }); assert.equal(I.iqSgStrata(s3, { v: 1, log }).info.source, "days");
});

test("dailyMeanCI: weekday-balanced mean + AR-aware SE (plain meanCI covers 77% under AR(0.5))", () => {
  const WDf = [1, 1, 1, 1, 1, 1.05, 1.05], WDs = [0.8, 0.9, 0.9, 1, 1.1, 1.4, 1.3];
  const cov = (WD, phi, n, reps = 1000) => {
    const R = rng(n * 13 + phi * 100 + WD[0] * 7), truth = 100 * WD.reduce((a, b) => a + b) / 7; let h = 0, hp = 0;
    for (let r = 0; r < reps; r++) {
      const off = Math.floor(R() * 7); let u = gauss(R); const y = [], wd = [];
      for (let i = 0; i < n; i++) { u = phi * u + Math.sqrt(1 - phi * phi) * gauss(R); wd.push((i + off) % 7); y.push(100 * WD[(i + off) % 7] + 12 * u); }
      const c = S.dailyMeanCI(y, wd), m = S.meanCI(y); if (c.lo <= truth && truth <= c.hi) h++; if (m.lo <= truth && truth <= m.hi) hp++;
    }
    return [h / reps, hp / reps];
  };
  const [a, ap] = cov(WDf, 0.5, 21); assert.ok(a >= 0.9 && ap < 0.85, `AR 0.5, 21 days: ${pc(a)} vs plain ${pc(ap)}`);
  const [b] = cov(WDf, 0, 21); assert.ok(b >= 0.93 && b <= 0.99, "iid " + pc(b));
  const [c] = cov(WDs, 0.3, 28); assert.ok(c >= 0.92, "strong weekday pattern, 28 days " + pc(c));
  // a partial week: 10 days starting on Friday has 2 Fri/Sat; the balanced estimator needs ≥ 2 of every weekday (≥ 14 days)
  const y = Array.from({ length: 14 }, (_, i) => 100 * WDs[i % 7]), wd = y.map((_, i) => i % 7);
  const q = S.dailyMeanCI(y, wd); assert.equal(q.weekdayAdj, true); assert.ok(Math.abs(q.mean - 100 * WDs.reduce((s, v) => s + v) / 7) < 1e-9);
  assert.equal(S.dailyMeanCI(y.slice(0, 10), wd.slice(0, 10)).weekdayAdj, false);
});

test("QC yield interval: clustered by stretches of the shift (wider when rejects bunch up, ≈ Wilson when they do not)", () => {
  const t0 = Date.now() - 3600e3, mk = log => ({ qc: { start: t0, total: log.length, pass: log.filter(l => l.pass).length, reject: 0, reasons: {}, log } });
  const even = Array.from({ length: 600 }, (_, i) => ({ t: t0 + i * 1000, pass: i % 20 !== 0 })), bunched = Array.from({ length: 600 }, (_, i) => ({ t: t0 + i * 1000, pass: !(i >= 450 && i < 480) }));
  const e = I.iqQcCI(mk(even), null), b = I.iqQcCI(mk(bunched), null), w = S.wilson(570, 600);
  assert.equal(e.p, b.p); assert.ok(Math.abs(e.hi - e.lo - (w.hi - w.lo)) < 0.004, "even rejects ≈ Wilson");
  assert.equal(b.method, "quasi-binomial"); assert.ok(b.hi - b.lo > 2 * (w.hi - w.lo), "a bad stretch widens the interval");
  assert.equal(I.iqQcCI(mk(even.slice(0, 30)), null).method, "wilson", "too few logged bottles → Wilson");
});

test("countCompare type I at 7 vs 7 days without drift, 1,000 replications (round 10 pinned 150)", () => {
  const WD = [0.8, 0.9, 0.9, 1, 1.1, 1.4, 1.3], REPS = LONG ? 3000 : 1000, R = rng(91);
  const pois = l => { if (l < 30) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; } return Math.max(0, Math.round(l + Math.sqrt(l) * gauss(R))); };
  let h = 0;
  for (let r = 0; r < REPS; r++) {
    const d = Array.from({ length: 60 }, (_, i) => ({ y: pois(120 * WD[i % 7] * Math.exp(0.12 * gauss(R))), e: 1, wd: i % 7, g: i >= 53 ? "A" : i >= 46 ? "B" : "h", t: i }));
    const t = S.countCompare(d); if (t && t.p < 0.05) h++;
  }
  assert.ok(h / REPS <= bound(REPS), "type I " + pc(h / REPS));
});
