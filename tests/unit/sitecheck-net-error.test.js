"use strict";
// node --test tests/unit/sitecheck-net-error.test.js — round 12: the on-site door check's net count error interval
// (lensiq-sitecheck.js netErrorCI, block-t with ≥ 10 adaptive blocks) and the episode-cluster door-crossing intervals.
// Seeded Monte Carlo: arrivals in groups of 1–3, a group sometimes counted once (merge), single misses, false counts,
// a 0.5–0.9 s system lag. Before (round 11 percentile bootstrap over 60-s blocks, ≥ 3 blocks): 3-minute coverage ≈ 71%,
// a door with a true −12% error confirmed in ≈ 10% of 3-minute checks. Tables: docs/STATS.md §11.
const test = require("node:test");
const assert = require("node:assert/strict");
const SC = require("../../lensiq-sitecheck.js");
const ST = require("../../lensiq-stats.js");

const LONG = !!process.env.LQ_STATS_LONG;
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// rate = people per minute ; group sizes 1 (70%), 2 (20%), 3 (10%) ; merge = a group of 2+ counted once ; miss / fp per person
function session(R, { min, rate, miss = 0.08, merge = 0.25, fp = 0.03 }) {
  const truth = [], sys = [], T = min * 60000; let t = R() * 2000;
  for (;;) {
    t += -Math.log(1 - R()) * 60000 * 1.4 / rate; if (t > T) break;
    const u = R(), g = u < 0.7 ? 1 : u < 0.9 ? 2 : 3, merged = g > 1 && R() < merge;
    for (let j = 0; j < g; j++) {
      const tt = t + j * 500; if (tt > T) break; truth.push({ t: tt, dir: "in" });
      if ((!merged || j === 0) && R() >= miss) sys.push({ t: tt + 700 + 400 * (R() - 0.5), dir: "in" });
      if (R() < fp) sys.push({ t: tt + 1500 + 1000 * R(), dir: "in" });
    }
  }
  return { sys, truth };
}
const trueNet = P => { const { sys, truth } = session(rng(999), { ...P, min: 30000, rate: 20 }); return (sys.length - truth.length) / truth.length; };
const lagOf = (sys, truth) => SC.matchCrossings(sys, truth).lag;

test("t975: the pinned t tables match lensiq-stats tCrit (95% and 90%), df 1–200", () => {
  for (let df = 1; df <= 200; df++) {
    assert.ok(Math.abs(SC.t975(df) - ST.tCrit(df, 0.95)) < 2e-6, `95% df ${df}`);
    assert.ok(Math.abs(SC.t975(df, 0.90) - ST.tCrit(df, 0.90)) < 2e-6, `90% df ${df}`);
  }
  assert.equal(SC.t975(0), null);
});

test("netErrorCI: blocks shrink for short checks (≥ 10 blocks of 15–60 s); < 10 blocks = short; < 3 blocks = null", () => {
  const ev = (min, rate) => Array.from({ length: Math.round(min * rate) }, (_, i) => ({ t: i * 60000 / rate, dir: "in" }));
  const c3 = SC.netErrorCI(ev(3, 20), ev(3, 20));
  assert.equal(c3.blockMs, 15000); assert.ok(c3.blocks >= 10); assert.equal(c3.short, false); assert.equal(c3.method, "block-fieller");
  const c30 = SC.netErrorCI(ev(30, 20), ev(30, 20)); assert.equal(c30.blockMs, 60000); assert.equal(c30.blocks, 30);
  const c1 = SC.netErrorCI(ev(1, 30), ev(1, 30)); assert.ok(c1 && c1.short && c1.blocks < 10, JSON.stringify(c1));
  assert.equal(SC.netErrorCI(ev(0.4, 30), ev(0.4, 30)), null);
  assert.ok(c3.boot && Number.isFinite(c3.boot.lo), "the round-11 bootstrap is still reported for comparison");
  // explicit blockMs is honoured (the old 60-s blocks)
  assert.equal(SC.netErrorCI(ev(5, 20), ev(5, 20), { blockMs: 60000 }).blocks, 5);
});

test("netErrorCI coverage ≥ 93% from 3 to 30 minutes, and the round-11 bootstrap under-covers short checks", () => {
  const P = { miss: 0.08, merge: 0.25, fp: 0.03 }, tn = trueNet(P), N = LONG ? 1500 : 300, rows = [];
  assert.ok(tn < -0.10 && tn > -0.14, "scenario: true net error ≈ −12% (" + tn.toFixed(3) + ")");
  for (const [min, rate] of [[3, 20], [5, 20], [10, 20], [3, 60], [10, 5]].concat(LONG ? [[30, 20], [20, 5]] : [])) {
    const R = rng(min * 100 + rate); let cov = 0, tot = 0, bcov = 0, btot = 0;
    for (let k = 0; k < N; k++) {
      const { sys, truth } = session(R, { min, rate, ...P }), c = SC.netErrorCI(sys, truth, { lagMs: lagOf(sys, truth) });
      if (c) { tot++; if (c.lo <= tn && tn <= c.hi) cov++; }
      const b = SC.netErrorBoot(sys, truth); if (b) { btot++; if (b.lo <= tn && tn <= b.hi) bcov++; }
    }
    rows.push(`${min} min @ ${rate}/min: block-t ${(100 * cov / tot).toFixed(1)}% · bootstrap ${(100 * bcov / btot).toFixed(1)}%`);
    assert.ok(cov / tot >= 0.93, rows.at(-1));
    if (min === 3 && rate === 20) assert.ok(bcov / btot < 0.85, "the round-11 bootstrap was too narrow at 3 minutes: " + rows.at(-1));
  }
});

test("countReport: a door with a true −12% (or −17%) error is 'pass (confirmed)' in ≤ 2.5% of short checks", () => {
  const N = LONG ? 1000 : 250;
  for (const P of [{ miss: 0.08, merge: 0.25, fp: 0.03 }, { miss: 0.11, merge: 0.3, fp: 0.02 }]) {
    const tn = trueNet(P);
    for (const [min, rate] of [[3, 20], [4, 20], [3, 60]]) {
      const R = rng(7 + min * 13 + rate); let pass = 0;
      for (let k = 0; k < N; k++) { const { sys, truth } = session(R, { min, rate, ...P }); if (SC.countReport(sys, truth).verdict === "pass") pass++; }
      assert.ok(pass / N <= 0.025, `true ${(tn * 100).toFixed(1)}%, ${min} min @ ${rate}/min: false pass ${(100 * pass / N).toFixed(1)}%`);
    }
  }
});

test("countReport: a good door (true ≈ −2%) still reaches 'pass' in long checks, and a short check is capped at 'collect more minutes'", () => {
  const P = { miss: 0.02, merge: 0.1, fp: 0.02 }, R = rng(5); let pass = 0; const N = 60;
  for (let k = 0; k < N; k++) { const { sys, truth } = session(R, { min: 15, rate: 20, ...P }); if (SC.countReport(sys, truth).verdict === "pass") pass++; }
  assert.ok(pass / N >= 0.6, "power at 15 minutes: " + pass + "/" + N);
  // 60 perfect crossings in 2 minutes: interval exists but short -> never confirmed, need says more minutes
  const truth = Array.from({ length: 60 }, (_, i) => ({ t: 1000 + i * 2000, dir: "in" })), sys = truth.map(e => ({ t: e.t + 600, dir: "in" }));
  const r = SC.countReport(sys, truth);
  assert.ok(r.netCI && r.netCI.short, JSON.stringify(r.netCI));
  assert.notEqual(r.verdict, "pass");
  assert.ok(r.need.some(x => x.group === "minutes" && x.more >= 1), JSON.stringify(r.need));
});

test("door-crossing episodes: independent crossings keep Wilson exactly; grouped misses widen precision / recall", () => {
  const truth = Array.from({ length: 80 }, (_, i) => ({ t: i * 10000, dir: "in" })), sys = truth.filter((_, i) => i % 9).map(e => ({ t: e.t + 500, dir: "in" }));
  const r = SC.countReport(sys, truth), w = SC.wilson(r.n.matched, r.n.truth);
  assert.equal(r.recall.deff, 1); assert.equal(r.recall.lo, w.lo); assert.equal(r.recall.hi, w.hi);
  // groups of 4 that are missed together
  const T2 = [], S2 = [];
  for (let g = 0; g < 25; g++) for (let j = 0; j < 4; j++) { const t = g * 20000 + j * 400; T2.push({ t, dir: "in" }); if (g % 5) S2.push({ t: t + 500, dir: "in" }); }
  const r2 = SC.countReport(S2, T2), w2 = SC.wilson(r2.n.matched, r2.n.truth);
  assert.ok(r2.recall.deff > 2.5, "design effect " + r2.recall.deff);
  assert.ok(r2.recall.lo < w2.lo - 0.02 && r2.recall.hi >= w2.hi, JSON.stringify(r2.recall));
  assert.ok(r2.episodes === 25);
});
