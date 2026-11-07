"use strict";
// node --test tests/unit — round-10 statistics fixes in lensiq-stats.js:
//   Cody erfc (tail precision), quasi-binomial rate CI, short-history forecast coverage, countCompare type I / power regression.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../lensiq-stats.js");

const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const gauss = R => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
const rel = (a, b) => Math.abs(a / b - 1);

test("erfc (Cody): ~1e-15 relative accuracy into the far tail; erf / normCdf / normSf consistent; A&S kept as erfAS", () => {
  // reference values (Mathematica / mpmath, 15 significant digits)
  const ref = [[0.3, 0.671373240540873], [0.46875, 0.507386526782062], [1, 0.157299207050285], [3, 2.20904969985854e-5], [4, 1.54172579002800e-8], [5, 1.53745979442803e-12], [6.5, 3.84214832712065e-20], [10, 2.08848758376254e-45], [-1, 1.84270079294971]];
  for (const [x, v] of ref) assert.ok(rel(S.erfc(x), v) < 1e-13, `erfc(${x}) = ${S.erfc(x)} vs ${v}`);
  assert.equal(S.erfc(30), 0); assert.equal(S.erfc(0), 1);
  for (const x of [-3, -0.4, 0, 0.2, 0.5, 2]) assert.ok(Math.abs(S.erf(x) + S.erfc(x) - 1) < 1e-15, "erf + erfc = 1 at " + x);
  // the old approximation's relative error grows in the tail: 2-sided p off by 0.36% at z = 6 and 7% at z = 8 (new: < 1e-9)
  const p6 = 2 * S.normSf(6); assert.ok(rel(p6, 1.97317529008e-9) < 1e-9, String(p6));
  assert.ok(rel(2 * (1 - 0.5 * (1 + S.erfAS(6 / Math.SQRT2))), 1.97317529008e-9) > 1e-3, "A&S 7.1.26 tail error (kept for comparison only)");
  assert.ok(rel(2 * (1 - 0.5 * (1 + S.erfAS(8 / Math.SQRT2))), 2 * 6.22096057427178e-16) > 0.05);
  assert.ok(Math.abs(S.normCdf(1.959963984540054) - 0.975) < 1e-15);
  assert.ok(rel(S.normSf(8), 6.22096057427178e-16) < 1e-12, "far tail of Φ");
});

test("quasiBinomCI: hand values; day-level noise widens the interval by ≈ √φ; Wilson per person kept", () => {
  // 4 days, identical daily rates -> φ̂ = 0 ≤ 1 -> plain Wilson on n with z (round 11; was t(3), which over-covered: 99.9% at 3 days)
  const flat = [{ x: 20, n: 100 }, { x: 20, n: 100 }, { x: 20, n: 100 }, { x: 20, n: 100 }];
  const q = S.quasiBinomCI(flat), t3 = S.zCrit(), n = 400, p = 0.2;
  assert.equal(q.ref, "z");
  const den = 1 + t3 * t3 / n, mid = (p + t3 * t3 / (2 * n)) / den, hw = t3 * Math.sqrt(p * (1 - p) / n + t3 * t3 / (4 * n * n)) / den;
  assert.equal(q.phi, 1); assert.equal(q.df, 3); assert.ok(Math.abs(q.lo - (mid - hw)) < 1e-12 && Math.abs(q.hi - (mid + hw)) < 1e-12);
  // swinging days: φ = Pearson χ² / (days − 1)
  const sw = [{ x: 10, n: 100 }, { x: 30, n: 100 }, { x: 12, n: 100 }, { x: 28, n: 100 }], qs = S.quasiBinomCI(sw), w = S.wilson(80, 400);
  const chi = sw.reduce((s, d) => s + (d.x - 20) ** 2 / (100 * 0.2 * 0.8), 0) / 3;
  assert.ok(Math.abs(qs.phi - chi) < 1e-12 && qs.phi > 4);
  assert.ok((qs.hi - qs.lo) / (w.hi - w.lo) > Math.sqrt(qs.phi), `quasi ${qs.lo}–${qs.hi} vs Wilson ${w.lo}–${w.hi}`);
  assert.equal(S.quasiBinomCI([{ x: 5, n: 50 }]).method, "wilson");
  assert.equal(S.quasiBinomCI([]), null);
  // coverage: day effects (logit sd 0.3), 14 days × 150 visitors — per-person Wilson under-covers, quasi-binomial ≈ 95%
  const R = rng(4242); let cq = 0, cw = 0; const REPS = 600;
  for (let r = 0; r < REPS; r++) {
    const D = Array.from({ length: 14 }, () => { const pd = 1 / (1 + Math.exp(-(Math.log(0.25 / 0.75) + 0.3 * gauss(R)))); let x = 0; for (let i = 0; i < 150; i++) if (R() < pd) x++; return { x, n: 150 }; });
    // the true long-run rate = E[p_d] (Monte-Carlo constant for logit-normal(−1.0986, 0.3) ≈ 0.2541)
    const truth = 0.2541, a = S.quasiBinomCI(D), b = S.wilson(a.x, a.n);
    if (a.lo <= truth && truth <= a.hi) cq++; if (b.lo <= truth && truth <= b.hi) cw++;
  }
  assert.ok(cq / REPS >= 0.92, "quasi-binomial coverage " + cq / REPS);
  assert.ok(cw / REPS < cq / REPS - 0.05, `per-person Wilson under-covers (${cw / REPS} vs ${cq / REPS})`);
});

// weekly pattern × level drift × day noise ; optional missing days (null)
const WD = [0.8, 0.9, 0.9, 1, 1.1, 1.4, 1.3];
function coverage(n, { reps = 500, noise = 0.25, drift = 0.03, miss = 0, seed = 1, naive = false } = {}) {
  const R = rng(seed + n * 31 + miss * 1000); let hit = 0, tot = 0, rough = 0;
  for (let r = 0; r < reps; r++) {
    const off = Math.floor(R() * 7); let lv = 0;
    const all = Array.from({ length: n + 7 }, (_, i) => { lv += drift * gauss(R); return 100 * WD[(i + off) % 7] * Math.exp(lv) * (1 + noise * gauss(R)); });
    const y = all.slice(0, n).map((v, i) => (i > 0 && i < n - 1 && R() < miss ? null : v));
    const f = S.forecast(y, 7, { conf: 0.8 }), lo = naive ? f.loNaive : f.lo, hi = naive ? f.hiNaive : f.hi;
    if (f.rough) rough++;
    for (let j = 0; j < 7; j++) { tot++; if (all[n + j] >= lo[j] && all[n + j] <= hi[j]) hit++; }
  }
  return { cov: hit / tot, rough: rough / reps };
}
test("forecast: short-history 80% bands now cover ≈ 80% (were 69–77%); Holt-Winters coverage unchanged; rough flag", () => {
  const rows = [];
  for (const n of [10, 14]) for (const miss of [0, 0.2]) {
    const now = coverage(n, { miss }), old = coverage(n, { miss, naive: true });
    rows.push(`${n} days, ${miss * 100}% missing: ${(old.cov * 100).toFixed(1)}% → ${(now.cov * 100).toFixed(1)}%`);
    assert.ok(now.cov >= 0.78 && now.cov <= 0.9, rows.at(-1));
    assert.ok(old.cov < 0.79, "the old z-based band under-covers: " + rows.at(-1));
    assert.equal(now.rough, 1, "short history is flagged rough");
  }
  // mean method (< 9 days): t(n−1)·sd·√(1+1/n)
  const m = coverage(6, { reps: 400 }); assert.ok(m.cov >= 0.76 && m.cov <= 0.92, "6 days " + m.cov);
  // Holt-Winters (≥ 21 days), with and without missing days — same check as for the short methods
  for (const [n, miss] of [[28, 0], [28, 0.15], [42, 0]]) {
    const h = coverage(n, { reps: 250, miss }); assert.ok(h.cov >= 0.76 && h.cov <= 0.9, `HW ${n} days ${miss}: ${h.cov}`); assert.equal(h.rough, 0);
  }
  // a missing day is not used as if measured: σ comes from measured week-apart pairs only
  const y = [100, 90, 90, 100, 110, 140, 130, 100, null, 90, 100, 110, 140, 130];
  const f = S.forecast(y, 7); assert.equal(f.method, "seasonal-naive"); assert.equal(f.df, 5); // 6 measured pairs of 7
  assert.equal(f.mean[1], 90, "Monday: last measured same weekday (the missing day is skipped, not the filled median)");
});

// ---------- countCompare: power / type I regression (round 10 calibration; table in docs/STATS.md) ----------
const poisson = (R, l) => { if (l < 30) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; } return Math.max(0, Math.round(l + Math.sqrt(l) * gauss(R))); };
const gammaR = (R, k) => { if (k < 1) return gammaR(R, k + 1) * Math.pow(R(), 1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = gauss(R); v = 1 + c * x; } while (v <= 0); v = v * v * v; if (Math.log(R()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v; } };
function sim(R, { n = 60, L = 7, mu = 120, k = 8, phi = 0, eff = 1 }) {
  let lv = phi ? 0.228 * gauss(R) : 0;
  return Array.from({ length: n }, (_, i) => { lv = phi ? phi * lv + 0.228 * Math.sqrt(1 - phi * phi) * gauss(R) : 0; const G = i >= n - L ? "A" : i >= n - 2 * L ? "B" : "h"; return { y: poisson(R, mu * WD[i % 7] * Math.exp(lv) * (G === "A" ? eff : 1) * gammaR(R, k) / k), e: 1, wd: i % 7, g: G, t: i }; });
}
const rate = (sc, opt, reps, seed) => { const R = rng(seed); let h = 0; for (let i = 0; i < reps; i++) { const t = S.countCompare(sim(R, sc), opt); if (t && t.p < 0.05 && (sc.eff === 1 || t.adjChange > 0)) h++; } return h / reps; };
test("countCompare calibration regression: type I ≤ 5% without drift, bounded under drift, power floor at +20%", () => {
  // defaults are the calibrated ones (P0 = 0.2 on the no-drift model, step df rule) — alternatives raise drift false positives
  const t0 = S.countCompare(sim(rng(1), { eff: 1 })), same = S.countCompare(sim(rng(1), { eff: 1 }), { arP0: 0.2, dfRule: "step" });
  assert.equal(t0.p, same.p, "defaults = P0 0.2 / step");
  const i0 = rate({ n: 60, L: 7, phi: 0, eff: 1 }, {}, 150, 71), i1 = rate({ n: 60, L: 7, phi: 0.85, eff: 1 }, {}, 120, 72);
  const pw = rate({ n: 90, L: 30, phi: 0, eff: 1.2 }, {}, 100, 73);
  assert.ok(i0 <= 0.05 + 0.01, `no drift, 7 vs 7 days: false positives ${(i0 * 100).toFixed(1)}% (want ≤ 5%; MC SE ≈ 1.4 pts)`);
  assert.ok(i1 <= 0.095, `AR(0.85) drift, 7 vs 7: false positives ${(i1 * 100).toFixed(1)}% (iid test would give ≈ 10%, ≈ 25% at 30 vs 30)`);
  assert.ok(pw >= 0.25, `power for +20% at 30 vs 30 days, no drift: ${(pw * 100).toFixed(0)}% (calibrated ≈ 35%; iid ≈ 51% but 25% false positives under drift)`);
  // the iid-only option still exists for comparison
  assert.ok(S.countCompare(sim(rng(2), { eff: 1 }), { iid: true }).p >= 0);
});
