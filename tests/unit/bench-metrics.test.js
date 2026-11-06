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
