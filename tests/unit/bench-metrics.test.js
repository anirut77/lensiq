"use strict";
// tests/unit/bench-metrics.test.js — metric code used by tests/bench (accuracy benchmarks) on hand-checked toy cases.
const test = require("node:test");
const assert = require("node:assert");
const M = require("../bench/metrics.cjs");
const ST = require("../../store.js");

const B = (x, y, w = 0.1, h = 0.2, extra = {}) => ({ x, y, w, h, ...extra });

test("bench metrics: hungarianMax matches brute force on random rectangular matrices", () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const perms = (n, k) => { const out = []; const rec = (pre, rest) => { if (pre.length === k) { out.push(pre); return; } rest.forEach((v, i) => rec([...pre, v], rest.filter((_, j) => j !== i))); }; rec([], [...Array(n).keys()]); return out; };
  for (let t = 0; t < 40; t++) {
    const R = 1 + Math.floor(rnd() * 4), C = 1 + Math.floor(rnd() * 5);
    const W = Array.from({ length: R }, () => Array.from({ length: C }, () => rnd() < 0.3 ? 0 : Math.round(rnd() * 9)));
    const got = M.hungarianMax(W).reduce((s, [r, c]) => s + W[r][c], 0);
    let best = 0;
    if (R <= C) for (const p of perms(C, R)) best = Math.max(best, p.reduce((s, c, r) => s + W[r][c], 0));
    else for (const p of perms(R, C)) best = Math.max(best, p.reduce((s, r, c) => s + W[r][c], 0));
    assert.strictEqual(got, best, JSON.stringify(W));
  }
});

test("bench metrics: detEval counts TP/FP/FN, drops detections on ignore regions, AP of a perfect ranking is 1", () => {
  const frames = [
    { gt: [B(0, 0), B(0.5, 0.5)], ign: [B(0.8, 0)], det: [{ ...B(0.01, 0), score: 0.9 }, { ...B(0.8, 0), score: 0.8 }, { ...B(0.3, 0.3), score: 0.2 }] }
  ];
  const r = M.detEval(frames, 0.5);
  assert.deepStrictEqual([r.tp, r.fp, r.fn], [1, 1, 1]);
  assert.ok(Math.abs(r.precision - 0.5) < 1e-9 && Math.abs(r.recall - 0.5) < 1e-9);
  const p = M.detEval([{ gt: [B(0, 0)], det: [{ ...B(0, 0), score: 0.9 }] }]);
  assert.strictEqual(p.ap, 1);
});

test("bench metrics: CLEAR MOT counts an identity switch once and IDF1 penalises it", () => {
  // one person, hypothesis id changes 1 -> 2 halfway
  const frames = [0, 1, 2, 3].map(i => ({ gt: [B(0.1 * i, 0, 0.1, 0.2, { id: 7 })], hyp: [B(0.1 * i, 0, 0.1, 0.2, { id: i < 2 ? 1 : 2 })] }));
  const m = M.clearMot(frames);
  assert.deepStrictEqual([m.idsw, m.fp, m.fn, m.gt], [1, 0, 0, 4]);
  assert.ok(Math.abs(m.mota - 0.75) < 1e-9);
  const id = M.idf1(frames);
  assert.ok(Math.abs(id.idf1 - 0.5) < 1e-9, String(id.idf1));
  const perfect = M.idf1(frames.map(f => ({ ...f, hyp: f.hyp.map(h => ({ ...h, id: 1 })) })));
  assert.strictEqual(perfect.idf1, 1);
});

test("bench metrics: GT crossings use store.checkCrossing; event matching and count error", () => {
  const line = { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } };
  const tracks = new Map([[1, [0.3, 0.4, 0.6, 0.7].map((x, i) => ({ t: i * 100, p: { x, y: 0.5 } }))], [2, [0.7, 0.4].map((x, i) => ({ t: 1000 + i * 100, p: { x, y: 0.2 } }))]]);
  const ev = M.crossingsFromTracks(tracks, line, ST.checkCrossing);
  assert.deepStrictEqual(ev.map(e => e.id), [1, 2]);
  assert.ok(ev.every(e => e.dir === "in" || e.dir === "out"));
  assert.notStrictEqual(ev[0].dir, ev[1].dir);
  const pr = [{ t: 250, dir: ev[0].dir, pos: 0.5 }, { t: 5000, dir: ev[1].dir, pos: 0.2 }];
  const m = M.matchEvents(ev, pr, { dt: 1500, dpos: 0.15 });
  assert.deepStrictEqual([m.tp, m.fp, m.fn], [1, 1, 1]);
  const ce = M.countError(ev, [...pr, { t: 1, dir: "in", pos: 0 }]);
  assert.strictEqual(ce.prIn + ce.prOut, 3);
  assert.ok(Math.abs(ce.errTotal - 0.5) < 1e-9);
});

test("bench metrics: verification TAR/FAR, EER, 1:N and Wilson interval", () => {
  const same = [0.2, 0.3, 0.4, 0.6], diff = [0.5, 0.7, 0.8, 0.9];
  const [r] = M.verification(same, diff, [0.55]);
  assert.deepStrictEqual([r.tar, r.far, r.acc], [0.75, 0.25, 0.75]);
  const e = M.eer(same, diff);
  assert.ok(e.eer <= 0.25 + 1e-9, JSON.stringify(e));
  assert.ok(Math.abs(M.oneToN(0.01, 1) - 0.01) < 1e-12 && M.oneToN(0.01, 100) > 0.6);
  const [lo, hi] = M.wilson(5, 100);
  assert.ok(lo > 0.02 && lo < 0.05 && hi > 0.05 && hi < 0.12, `${lo} ${hi}`);
});

test("bench metrics (round 10): AP is VOC greedy per rank; apAssign keeps the old operating-point value", () => {
  // one person; the higher-score box overlaps IoU ≈ 0.6, a lower-score box IoU ≈ 0.9. Greedy (VOC/COCO): the first is the TP.
  // The max-IoU assignment gives the gt to the low-score box, so the old sweep ranked an FP first (AP 0.5).
  const g = B(0, 0, 0.2, 0.2), hi = { x: 0.05, y: 0, w: 0.2, h: 0.2, score: 0.9 }, lo = { x: 0.01, y: 0, w: 0.2, h: 0.2, score: 0.3 };
  const r = M.detEval([{ gt: [g], det: [hi, lo] }], 0.5);
  assert.strictEqual(r.ap, 1);
  assert.strictEqual(r.apAssign, 0.5);
  // ignore boxes: an unmatched detection on an ignore region is neither TP nor FP for AP either
  const ig = M.detEval([{ gt: [B(0, 0)], ign: [B(0.6, 0.6)], det: [{ ...B(0.6, 0.6), score: 0.95 }, { ...B(0, 0), score: 0.5 }] }], 0.5);
  assert.strictEqual(ig.ap, 1);
  // a hand-checked sweep: TP, FP, TP over 2 gt -> P/R (1,.5) (.5,.5) (.67,1) -> AP = .5·1 + .5·.667
  const s = M.detEval([{ gt: [B(0, 0), B(0.5, 0.5)], det: [{ ...B(0, 0), score: 0.9 }, { ...B(0.3, 0), score: 0.8 }, { ...B(0.5, 0.5), score: 0.7 }] }], 0.5);
  assert.ok(Math.abs(s.ap - (0.5 + 0.5 * 2 / 3)) < 1e-12, String(s.ap));
});

test("bench metrics (round 10): EER uses the same 'accept when d < thr' rule as verification()", () => {
  const R = (() => { let a = 99; return () => (a = (a * 16807) % 2147483647) / 2147483647; })();
  const same = Array.from({ length: 300 }, () => +(0.3 + 0.25 * R()).toFixed(2)), diff = Array.from({ length: 300 }, () => +(0.5 + 0.3 * R()).toFixed(2));
  const e = M.eer(same, diff), [v] = M.verification(same, diff, [e.thr]);
  // at the EER threshold the verification table must give the same FRR/FAR (ties at rounded distances are frequent here)
  assert.ok(Math.abs((1 - v.tar + v.far) / 2 - e.eer) < 1e-12, JSON.stringify({ e, v }));
  assert.ok(e.eer > 0 && e.eer < 0.3);
});

test("bench metrics (round 10): identity-cluster bootstrap is wider than per-visit Wilson when visits repeat identities", () => {
  // 40 identities, each seen in 300 visits; 3 identities are 'look-alikes' accepted 20% of the time, the rest never.
  const items = Array.from({ length: 40 }, (_, i) => ({ k: i < 3 ? 60 : 0, n: 300, ids: ["p" + i] }));
  const cb = M.clusterBootstrap(items, { B: 2000 }), K = 180, N = 12000, [wl, wh] = M.wilson(K, N);
  assert.ok(Math.abs(cb.est - K / N) < 1e-12 && cb.clusters === 40);
  assert.ok(cb.hi - cb.lo > 3 * (wh - wl), `cluster ${cb.lo}–${cb.hi} vs per-visit Wilson ${wl}–${wh}`);
  const [cl, ch] = M.wilsonClusters(K / N, 40);
  assert.ok(ch - cl > wh - wl && cl >= 0 && ch < 0.2, `${cl} ${ch}`);
  // independent items (one visit per identity) — the bootstrap agrees with Wilson to within a few tenths of a point
  const ind = Array.from({ length: 2000 }, (_, i) => ({ k: i % 20 === 0 ? 1 : 0, n: 1, ids: [i] })), ci = M.clusterBootstrap(ind), [a, b] = M.wilson(100, 2000);
  assert.ok(Math.abs(ci.lo - a) < 0.004 && Math.abs(ci.hi - b) < 0.004, JSON.stringify({ ci, a, b }));
  // pairs of two identities (pigeonhole): reproducible and contains the estimate
  const pr = Array.from({ length: 500 }, (_, i) => ({ k: i % 50 === 0 ? 1 : 0, n: 1, ids: ["a" + (i % 25), "b" + (i % 37)] })), p1 = M.clusterBootstrap(pr), p2 = M.clusterBootstrap(pr);
  assert.deepStrictEqual(p1, p2); assert.ok(p1.lo <= p1.est && p1.est <= p1.hi && p1.clusters === 62);
});

test("bench metrics (round 10): cluster CI never collapses to [0, 0] with no events, and widens with few", () => {
  const z = M.clusterBootstrap(Array.from({ length: 1100 }, (_, i) => ({ k: 0, n: 1, ids: ["a" + (i % 900), "b" + (i % 800)] })));
  assert.strictEqual(z.lo, 0); assert.ok(z.hi > 0.002 && z.hi < 0.01, String(z.hi)); assert.strictEqual(z.bootHi, 0);
  const one = M.clusterBootstrap(Array.from({ length: 1100 }, (_, i) => ({ k: i === 5 ? 1 : 0, n: 1, ids: [i] }))), [, wh] = M.wilson(1, 1100);
  assert.ok(one.hi >= wh - 1e-5 && one.lo >= 0, JSON.stringify(one));
});

// ---------- round 11: person-cluster intervals for the studio / photo booth tables, McNemar and the person-clustered paired test ----------
test("personClusterCI / mcnemar / pairedCluster: hand values and the re-published ACCURACY.md §11 intervals", async () => {
  // 4 renders per person, labels identical within a person → design effect ≈ 4, interval ≈ Wilson on 35 people, not 140 renders
  const rows = []; for (let p = 0; p < 35; p++) for (let g = 0; g < 4; g++) rows.push({ id: "p" + p, y: p < 25 ? 1 : 0 });
  const c = M.personClusterCI(rows), [wl, wh] = M.wilson(100, 140);
  assert.ok(c.deff > 3.5 && c.deff < 4.5, "deff " + c.deff); assert.ok(c[1] - c[0] > 1.7 * (wh - wl), `cluster ${c} vs Wilson ${wl}–${wh}`);
  const ind = Array.from({ length: 140 }, (_, i) => ({ id: "q" + i, y: i < 100 ? 1 : 0 })), ci = M.personClusterCI(ind);
  assert.ok(Math.abs(ci[1] - ci[0] - (wh - wl)) < 0.03, "independent rows ≈ Wilson");
  // McNemar exact: 36 vs 3 discordant pairs; 5 vs 5 → 1
  assert.ok(Math.abs(M.mcnemar(36, 3).p - 3.6089e-8) < 1e-11); assert.equal(M.mcnemar(5, 5).p, 1); assert.equal(M.mcnemar(0, 0).p, 1);
  // paired, clustered: one person flips all four garments → only one informative cluster → p = 1 (exact sign flip: 2/2)
  const one = M.pairedCluster(Array.from({ length: 4 }, () => ({ id: "x", a: 1, b: 0 })).concat(Array.from({ length: 36 }, (_, i) => ({ id: "y" + (i >> 2), a: 0, b: 0 }))));
  assert.equal(one.informative, 1); assert.equal(one.p, 1); assert.ok(Math.abs(one.diff - 0.1) < 1e-12);
  // the committed labels + logs reproduce the intervals now printed in ACCURACY.md §11
  const SI = await import("../bench/studio-intervals.mjs"), I = SI.intervals(), r9 = I.find(x => x.split === "test" && x.key === "r9.raw");
  assert.equal(`${r9.k}/${r9.n}`, "102/140"); assert.ok(Math.abs(r9.cluster[0] - 0.567) < 0.006 && Math.abs(r9.cluster[1] - 0.871) < 0.006, String(r9.cluster)); assert.ok(r9.deff > 3);
  const md = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../ACCURACY.md"), "utf8").replace(/\*\*/g, "");
  for (const key of ["r9.raw", "r10.plainRaw", "r10.coverRaw", "r10.newShown", "r10.newPage"]) {
    const m = I.find(x => x.split === "test" && x.key === key), cell = `[${(100 * m.cluster[0]).toFixed(1)}–${(100 * m.cluster[1]).toFixed(1)}] (${m.k}/${m.n})`;
    assert.ok(md.includes(cell), `ACCURACY.md shows the person-cluster interval ${cell} for ${key}`);
  }
  const P = SI.paired().find(x => x.split === "test"); assert.equal(P.fixed, 36); assert.equal(P.broke, 3); assert.ok(P.cluster.p < 0.01 && P.cluster.p > P.mcnemar.p, "clustering costs evidence but the test effect stays");
});
