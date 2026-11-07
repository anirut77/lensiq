"use strict";
/* tests/bench/metrics.cjs — pure metric code for the accuracy benchmarks (unit-tested in tests/unit/bench-metrics.test.js).
 * Boxes are {x,y,w,h} in any consistent unit. Nothing here touches the DOM or the network.
 *
 *   iou(a,b)
 *   hungarianMax(W) -> [[r,c]]               maximum-weight assignment on a rectangular weight matrix (weights >= 0)
 *   matchFrame(gt, hyp, thr=0.5) -> {pairs:[[gi,hi]], ...}   max-IoU assignment with IoU >= thr
 *   detEval(frames, thr) -> {tp, fp, fn, precision, recall, f1, ap}
 *       frames = [{gt:[box], ign:[box], det:[{...box, score}]}] ; dets matching an ignore box (IoU>=0.5) are dropped
 *       ap = all-point interpolated average precision, VOC/COCO-style: detections sorted by score over the whole set, each one
 *            greedily matched (in score order) to the highest-IoU still-unmatched gt of its frame; a detection matched to
 *            nothing that overlaps an ignore box is skipped (neither TP nor FP) — the matching is redone for every rank,
 *            so it is a true per-threshold AP (round 10)
 *       apAssign = the pre-round-10 value: the same P/R sweep but with TP/FP fixed by the single operating-point Hungarian
 *            assignment (kept for comparison with older reports; it can over-state AP when a low-score detection
 *            "steals" a gt in the assignment)
 *   clearMot(frames, thr) -> {mota, motp, fp, fn, idsw, gt, frag}  frames = [{gt:[{id,...box}], ign, hyp:[{id,...box}]}]
 *   idf1(frames, thr) -> {idf1, idp, idr, idtp}                      global ID assignment (Ristani et al. 2016)
 *   crossingsFromTracks(tracks, line, checkCrossing, swap) -> [{id,t,dir,pos}]   tracks = Map(id -> [{t, p:{x,y}}])
 *   matchEvents(gtEv, prEv, {dt, dpos}) -> {tp, fp, fn, precision, recall}       same direction, |Δt|<=dt, |Δpos|<=dpos
 *   countError(gtEv, prEv) -> {gtIn, gtOut, prIn, prOut, errIn, errOut, errTotal}  signed relative errors
 *   verification(distSame[], distDiff[], thresholds) -> [{thr, tar, far, acc}] ; eer(distSame, distDiff) -> {eer, thr}
 *       both use the same rule as the pages: a pair is ACCEPTED when distance < thr (strict)
 *   clusterBootstrap(items, {B, conf, seed}) -> {est, lo, hi, clusters}   items = [{k, n, ids:[clusterId,...]}]
 *       ratio Σk/Σn with a percentile CI from resampling CLUSTERS (identities), not items. One id per item = ordinary
 *       cluster bootstrap; two ids (a pair of people) = pigeonhole / multiway bootstrap (Owen 2007): each identity gets
 *       a multinomial weight and an item is weighted by the product of its identities' weights.
 *       lo/hi = union of the percentile interval and a design-effect Wilson (n_eff = N/deff; no events → n_eff = min(N, ids)),
 *       so a row with 0 or few events never gets a [0, 0] interval; bootLo/bootHi/deff/nEff are returned too.
 *   identityComponents([[idA, idB], ...]) -> component per item (pairs that share nobody, even indirectly, are independent)
 *   wilsonClusters(rate, nClusters) -> [lo, hi]   Wilson with n = number of distinct identities (a conservative-ish
 *       cross-check of clusterBootstrap: it treats each identity as one independent observation)
 *   oneToN(far, n) -> probability that a stranger is accepted as someone among n enrolled (independence approximation)
 */

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

/* Hungarian (e-maxx, potentials) for n <= m rectangular minimisation; we transpose when rows > cols. */
function hungarianMin(cost) {
  const n = cost.length, m = n ? cost[0].length : 0;
  if (!n || !m) return [];
  if (n > m) {
    const t = Array.from({ length: m }, (_, j) => Array.from({ length: n }, (_, i) => cost[i][j]));
    return hungarianMin(t).map(([r, c]) => [c, r]);
  }
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1), way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity), used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0], row = cost[i0 - 1]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = row[j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const out = [];
  for (let j = 1; j <= m; j++) if (p[j]) out.push([p[j] - 1, j - 1]);
  return out.sort((a, b) => a[0] - b[0]);
}
function hungarianMax(W) {
  if (!W.length || !W[0].length) return [];
  let mx = 0; for (const r of W) for (const v of r) if (v > mx) mx = v;
  const res = hungarianMin(W.map(r => r.map(v => mx - v)));
  return res.filter(([r, c]) => W[r][c] > 0);
}

function matchFrame(gt, hyp, thr = 0.5) {
  if (!gt.length || !hyp.length) return { pairs: [], ious: [] };
  const W = gt.map(g => hyp.map(h => { const v = iou(g, h); return v >= thr ? v : 0; }));
  const pairs = hungarianMax(W);
  return { pairs, ious: pairs.map(([i, j]) => W[i][j]) };
}

/* drop detections that overlap an ignore region (distractors, static people, reflections) and match no target */
function dropIgnored(gt, ign, det, thr = 0.5) {
  if (!ign || !ign.length || !det.length) return det;
  const m = matchFrame(gt, det, thr), used = new Set(m.pairs.map(p => p[1]));
  return det.filter((d, j) => used.has(j) || !ign.some(g => iou(g, d) >= thr));
}

function detEval(frames, thr = 0.5) {
  let tp = 0, fp = 0, fn = 0, nGt = 0;
  const scored = []; // {s, tp}
  for (const f of frames) {
    const det = dropIgnored(f.gt, f.ign, f.det, thr);
    nGt += f.gt.length;
    const m = matchFrame(f.gt, det, thr), hit = new Set(m.pairs.map(p => p[1]));
    tp += m.pairs.length; fp += det.length - m.pairs.length; fn += f.gt.length - m.pairs.length;
    det.forEach((d, j) => scored.push({ s: d.score, tp: hit.has(j) }));
  }
  // apAssign (pre-round-10): TP/FP from the operating-point assignment above, swept in score order
  const apAssign = apFromFlags(scored, nGt);
  // ap (round 10): VOC/COCO greedy matching in global score order — each detection takes the best still-free gt
  const all = [];
  frames.forEach((f, fi) => (f.det || []).forEach(d => all.push({ fi, d })));
  all.sort((a, b) => b.d.score - a.d.score);
  const taken = frames.map(f => new Uint8Array(f.gt.length)), flags = [];
  for (const { fi, d } of all) {
    const f = frames[fi]; let best = -1, bv = thr;
    f.gt.forEach((g, gi) => { if (taken[fi][gi]) return; const v = iou(g, d); if (v >= bv) { bv = v; best = gi; } });
    if (best >= 0) { taken[fi][best] = 1; flags.push({ s: d.score, tp: true }); }
    else if (f.ign && f.ign.some(g => iou(g, d) >= thr)) continue; // ignore region: neither TP nor FP
    else flags.push({ s: d.score, tp: false });
  }
  const ap = apFromFlags(flags, nGt);
  const precision = tp + fp ? tp / (tp + fp) : 0, recall = nGt ? tp / nGt : 0;
  return { tp, fp, fn, gt: nGt, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, ap, apAssign };
}
/* all-point interpolated AP from score-ordered TP/FP flags (stable sort: ties keep their order) */
function apFromFlags(flags, nGt) {
  const sc = flags.slice().sort((a, b) => b.s - a.s);
  let ctp = 0, cfp = 0; const pr = [];
  for (const d of sc) { d.tp ? ctp++ : cfp++; pr.push([ctp / Math.max(1, nGt), ctp / (ctp + cfp)]); }
  let ap = 0, prevR = 0, pmax = 0; const suf = new Float64Array(pr.length);
  for (let i = pr.length - 1; i >= 0; i--) { pmax = Math.max(pmax, pr[i][1]); suf[i] = pmax; }
  for (let i = 0; i < pr.length; i++) { ap += (pr[i][0] - prevR) * suf[i]; prevR = pr[i][0]; }
  return ap;
}

/* CLEAR MOT (Bernardin & Stiefelhagen 2008): keep last frame's correspondences when still IoU>=thr, then Hungarian. */
function clearMot(frames, thr = 0.5) {
  let fp = 0, fn = 0, idsw = 0, gtN = 0, iouSum = 0, tp = 0, frag = 0;
  const last = new Map(), wasTracked = new Map(); // gtId -> hypId ; gtId -> bool (tracked in previous frame where present)
  for (const f of frames) {
    const hyp = dropIgnored(f.gt, f.ign, f.hyp, thr);
    gtN += f.gt.length;
    const gi = new Map(f.gt.map((g, i) => [g.id, i])), hi = new Map(hyp.map((h, j) => [h.id, j]));
    const usedG = new Set(), usedH = new Set(), pairs = [];
    for (const [gid, hid] of last) {
      if (!gi.has(gid) || !hi.has(hid)) continue;
      const g = f.gt[gi.get(gid)], h = hyp[hi.get(hid)], v = iou(g, h);
      if (v >= thr && !usedH.has(hid)) { usedG.add(gid); usedH.add(hid); pairs.push([gid, hid, v]); }
    }
    const rg = f.gt.filter(g => !usedG.has(g.id)), rh = hyp.filter(h => !usedH.has(h.id));
    const m = matchFrame(rg, rh, thr);
    m.pairs.forEach(([i, j], k) => pairs.push([rg[i].id, rh[j].id, m.ious[k]]));
    const tracked = new Set();
    for (const [gid, hid, v] of pairs) {
      if (last.has(gid) && last.get(gid) !== hid) idsw++;
      if (wasTracked.has(gid) && wasTracked.get(gid) === false) frag++;
      last.set(gid, hid); tracked.add(gid); iouSum += v; tp++;
    }
    for (const g of f.gt) wasTracked.set(g.id, tracked.has(g.id));
    fp += hyp.length - pairs.length; fn += f.gt.length - pairs.length;
  }
  return { mota: gtN ? 1 - (fn + fp + idsw) / gtN : 0, motp: tp ? iouSum / tp : 0, fp, fn, idsw, gt: gtN, tp, frag };
}

function idf1(frames, thr = 0.5) {
  const gIds = new Map(), hIds = new Map(), gCnt = [], hCnt = [], co = new Map();
  const gIdx = id => { if (!gIds.has(id)) { gIds.set(id, gIds.size); gCnt.push(0); } return gIds.get(id); };
  const hIdx = id => { if (!hIds.has(id)) { hIds.set(id, hIds.size); hCnt.push(0); } return hIds.get(id); };
  for (const f of frames) {
    const hyp = dropIgnored(f.gt, f.ign, f.hyp, thr);
    f.gt.forEach(g => gCnt[gIdx(g.id)]++);
    hyp.forEach(h => hCnt[hIdx(h.id)]++);
    // per-frame co-occurrence: any gt/hyp pair with IoU >= thr can be matched under the global assignment
    for (const g of f.gt) for (const h of hyp) if (iou(g, h) >= thr) {
      const k = gIdx(g.id) * 1e7 + hIdx(h.id); co.set(k, (co.get(k) || 0) + 1);
    }
  }
  const G = gIds.size, H = hIds.size;
  const totG = gCnt.reduce((a, b) => a + b, 0), totH = hCnt.reduce((a, b) => a + b, 0);
  if (!G || !H) return { idf1: 0, idp: 0, idr: 0, idtp: 0 };
  // only ids with any co-occurrence take part in the assignment (others contribute 0 IDTP)
  const gs = new Map(), hs = new Map();
  for (const k of co.keys()) { const g = Math.floor(k / 1e7), h = k % 1e7; if (!gs.has(g)) gs.set(g, gs.size); if (!hs.has(h)) hs.set(h, hs.size); }
  const W = Array.from({ length: gs.size }, () => new Float64Array(hs.size));
  for (const [k, v] of co) W[gs.get(Math.floor(k / 1e7))][hs.get(k % 1e7)] = v;
  const pairs = hungarianMax(W.map(r => Array.from(r)));
  const idtp = pairs.reduce((s, [i, j]) => s + W[i][j], 0);
  return { idf1: 2 * idtp / (totG + totH), idp: idtp / totH, idr: idtp / totG, idtp };
}

/* tracks: Map(id -> [{t, p}]) sorted by t ; checkCrossing = store.js checkCrossing(mem, line, p, swap) */
function crossingsFromTracks(tracks, line, checkCrossing, swap = false) {
  const ev = [];
  for (const [id, pts] of tracks) {
    const mem = {};
    for (const { t, p } of pts) {
      const dir = checkCrossing(mem, line, p, swap);
      if (dir) ev.push({ id, t, dir, pos: projectOnLine(line, p) });
    }
  }
  return ev.sort((a, b) => a.t - b.t);
}
function projectOnLine(line, p) {
  const dx = line.b.x - line.a.x, dy = line.b.y - line.a.y, L2 = dx * dx + dy * dy || 1;
  return ((p.x - line.a.x) * dx + (p.y - line.a.y) * dy) / L2;
}
function matchEvents(gtEv, prEv, { dt = 1500, dpos = 0.15 } = {}) {
  const W = gtEv.map(g => prEv.map(p => (g.dir === p.dir && Math.abs(g.t - p.t) <= dt && Math.abs((g.pos ?? 0) - (p.pos ?? 0)) <= dpos)
    ? 1 + (1 - Math.abs(g.t - p.t) / (dt + 1)) * 1e-3 : 0));
  const tp = gtEv.length && prEv.length ? hungarianMax(W).length : 0;
  const fp = prEv.length - tp, fn = gtEv.length - tp;
  return { tp, fp, fn, precision: prEv.length ? tp / prEv.length : 1, recall: gtEv.length ? tp / gtEv.length : 1 };
}
function countError(gtEv, prEv) {
  const c = (ev, d) => ev.filter(e => e.dir === d).length;
  const gtIn = c(gtEv, "in"), gtOut = c(gtEv, "out"), prIn = c(prEv, "in"), prOut = c(prEv, "out");
  const rel = (p, g) => g ? (p - g) / g : (p ? Infinity : 0);
  return { gtIn, gtOut, prIn, prOut, errIn: rel(prIn, gtIn), errOut: rel(prOut, gtOut), errTotal: rel(prIn + prOut, gtIn + gtOut) };
}

function verification(same, diff, thresholds) {
  return thresholds.map(thr => {
    const tar = same.length ? same.filter(d => d < thr).length / same.length : 0;
    const far = diff.length ? diff.filter(d => d < thr).length / diff.length : 0;
    const acc = (same.filter(d => d < thr).length + diff.filter(d => d >= thr).length) / Math.max(1, same.length + diff.length);
    return { thr, tar, far, acc };
  });
}
/* EER: thresholds are swept over the midpoints between consecutive distinct distances (plus both ends), and a pair is
   accepted when d < thr — the same rule as verification() and the pages. (Before round 10 this used d <= thr at the data
   values themselves, so the EER threshold and the verification table disagreed on ties.) */
function eer(same, diff) {
  const vals = [...new Set([...same, ...diff].filter(Number.isFinite))].sort((a, b) => a - b);
  if (!vals.length) return { eer: 1, thr: 0 };
  const cand = [vals[0] - 1e-9, ...vals.slice(1).map((v, i) => (v + vals[i]) / 2), vals[vals.length - 1] + 1e-9];
  const S = same.slice().sort((a, b) => a - b), D = diff.slice().sort((a, b) => a - b);
  const below = (arr, t) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < t) lo = m + 1; else hi = m; } return lo; };
  let best = { eer: 1, thr: 0, gap: Infinity };
  for (const thr of cand) {
    const frr = (S.length - below(S, thr)) / Math.max(1, S.length); // same person rejected: d >= thr
    const far = below(D, thr) / Math.max(1, D.length);               // different person accepted: d < thr
    if (Math.abs(frr - far) < best.gap) best = { eer: (frr + far) / 2, thr, gap: Math.abs(frr - far) };
  }
  return { eer: best.eer, thr: best.thr };
}
const oneToN = (far, n) => 1 - Math.pow(1 - far, n);

/* Wilson score interval for a proportion (k of n) */
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
}

/* identity-cluster bootstrap of a pooled rate Σk/Σn (see header). Seeded (park–miller) so reports are reproducible. */
function clusterBootstrap(items, { B = 2000, conf = 0.95, seed = 12345 } = {}) {
  const ids = new Map();
  for (const it of items) for (const id of it.ids) if (!ids.has(id)) ids.set(id, ids.size);
  const C = ids.size, K = items.reduce((s, it) => s + it.k, 0), N = items.reduce((s, it) => s + it.n, 0);
  const est = N ? K / N : 0;
  if (!C || !N) return { est, lo: 0, hi: 1, clusters: C, B: 0 };
  const idx = items.map(it => it.ids.map(id => ids.get(id)));
  let st = seed % 2147483647 || 1; const rnd = () => (st = (st * 16807) % 2147483647) / 2147483647;
  const w = new Float64Array(C), reps = [];
  for (let b = 0; b < B; b++) {
    w.fill(0); for (let i = 0; i < C; i++) w[Math.floor(rnd() * C)]++;
    let k = 0, n = 0;
    for (let j = 0; j < items.length; j++) { let m = 1; for (const c of idx[j]) m *= w[c]; if (m) { k += m * items[j].k; n += m * items[j].n; } }
    if (n > 0) reps.push(k / n);
  }
  reps.sort((a, b) => a - b);
  const q = p => { if (!reps.length) return NaN; const h = (reps.length - 1) * p, l = Math.floor(h); return reps[l] + (reps[Math.min(reps.length - 1, l + 1)] - reps[l]) * (h - l); };
  const bootLo = q((1 - conf) / 2), bootHi = q(1 - (1 - conf) / 2);
  // A percentile bootstrap collapses to [0, 0] when no event was seen, and is too short with a handful of events. Guard:
  // design effect deff = bootstrap variance / binomial variance (≥ 1) → n_eff = N/deff, Wilson on n_eff; with no events
  // (deff unknown) n_eff = min(N, distinct identities). Reported interval = the union of both.
  const m = reps.reduce((s, x) => s + x, 0) / Math.max(1, reps.length), vb = reps.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, reps.length - 1);
  const deff = est > 0 && est < 1 ? Math.max(1, vb / (est * (1 - est) / N)) : null, nEff = deff ? N / deff : Math.min(N, C);
  const z = Math.abs(normQ((1 - conf) / 2)), [wl, wh] = wilson(est * nEff, nEff, z);
  return { est, lo: Math.min(bootLo, wl), hi: Math.max(bootHi, wh), bootLo, bootHi, deff, nEff, clusters: C, B: reps.length };
}
/* standard normal quantile (Acklam, |rel err| < 1.2e-9) — only for the CI level of clusterBootstrap */
function normQ(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  if (p < 0.02425) { const t = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
  if (p > 1 - 0.02425) return -normQ(1 - p);
  const t = p - 0.5, r = t * t;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/* connected components of the "shares a person" graph: items = [[idA, idB], ...] -> component label per item. Pairs in
   different components share nobody, so a one-way cluster bootstrap over components is valid without the pigeonhole
   bootstrap's over-counting (which roughly triples the variance when people appear in only 1–2 pairs). */
function identityComponents(items) {
  const par = new Map(), f = x => { if (!par.has(x)) par.set(x, x); while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  for (const ids of items) for (let i = 1; i < ids.length; i++) { const a = f(ids[0]), b = f(ids[i]); if (a !== b) par.set(a, b); }
  return items.map(ids => "c:" + f(ids[0]));
}
const wilsonClusters = (rate, nClusters, z = 1.96) => wilson(rate * nClusters, nClusters, z);

/* ---------- round 11: person-cluster intervals and paired tests for the studio / photo booth tables ----------
   rows = [{ id, y }] with y = 0/1 and several rows per person (4 outfits per portrait): the renders of one person are not
   independent (labels follow the photo far more than the outfit), so a per-render Wilson interval is about half as wide as it
   should be. personClusterCI resamples people (clusterBootstrap) and returns [lo, hi] with .deff (design effect = cluster
   variance / binomial variance) and .clusters attached, so it can be passed as `tables({ interval })` in studio-tables.mjs. */
function personClusterCI(rows, { B = 4000, conf = 0.95, seed = 12345 } = {}) {
  if (!rows || !rows.length) return Object.assign([NaN, NaN], { deff: null, clusters: 0 });
  const r = clusterBootstrap(rows.map(x => ({ k: x.y ? 1 : 0, n: 1, ids: [String(x.id)] })), { B, conf, seed });
  return Object.assign([r.lo, r.hi], { deff: r.deff, clusters: r.clusters, nEff: r.nEff });
}
/* exact McNemar test on discordant pairs: b = (A defective, B clean), c = (A clean, B defective); two-sided exact binomial */
function mcnemar(b, c) {
  const n = b + c; if (!n) return { b, c, n, p: 1 };
  const lc = (m, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(m - k + i) - Math.log(i); return s; };
  const k = Math.min(b, c); let tail = 0; for (let i = 0; i <= k; i++) tail += Math.exp(lc(n, i) - n * Math.LN2);
  return { b, c, n, p: Math.min(1, 2 * tail) };
}
/* paired comparison clustered by person: pairs = [{ id, a, b }] (0/1 outcomes of the same person × garment under two variants).
   diff = mean(a) − mean(b) over pairs ; CI = person-cluster bootstrap (percentile) ; p = sign-flip randomisation test on the
   per-person sums of (a − b) (exact enumeration up to 20 people with a non-zero sum, else 20,000 seeded flips). Unlike McNemar
   it does not treat the 4 garments of one person as independent pairs. */
function pairedCluster(pairs, { B = 4000, conf = 0.95, seed = 777 } = {}) {
  const by = new Map(); for (const q of pairs) { const o = by.get(q.id) || { s: 0, n: 0 }; o.s += q.a - q.b; o.n++; by.set(q.id, o); }
  const P = [...by.values()], N = pairs.length, diff = N ? P.reduce((t, o) => t + o.s, 0) / N : 0;
  let st = seed % 2147483647 || 1; const rnd = () => (st = (st * 16807) % 2147483647) / 2147483647;
  const reps = []; for (let b = 0; b < B; b++) { let s = 0, n = 0; for (let i = 0; i < P.length; i++) { const o = P[Math.floor(rnd() * P.length)]; s += o.s; n += o.n; } reps.push(n ? s / n : 0); }
  reps.sort((x, y) => x - y); const q = p => reps[Math.min(reps.length - 1, Math.max(0, Math.round(p * (reps.length - 1))))];
  const nz = P.map(o => o.s).filter(v => v !== 0), obs = Math.abs(nz.reduce((t, v) => t + v, 0));
  let ge = 0, tot = 0;
  if (nz.length <= 20) { for (let m = 0; m < 1 << nz.length; m++) { let s = 0; for (let i = 0; i < nz.length; i++) s += m & (1 << i) ? -nz[i] : nz[i]; tot++; if (Math.abs(s) >= obs - 1e-9) ge++; } }
  else { for (let r = 0; r < 20000; r++) { let s = 0; for (const v of nz) s += rnd() < 0.5 ? -v : v; tot++; if (Math.abs(s) >= obs - 1e-9) ge++; } ge++; tot++; }
  return { diff, lo: q((1 - conf) / 2), hi: q(1 - (1 - conf) / 2), p: nz.length ? ge / tot : 1, people: P.length, pairs: N, informative: nz.length };
}

module.exports = { iou, hungarianMin, hungarianMax, matchFrame, dropIgnored, detEval, clearMot, idf1, crossingsFromTracks, projectOnLine, matchEvents, countError, verification, eer, oneToN, wilson, clusterBootstrap, wilsonClusters, identityComponents, apFromFlags, personClusterCI, mcnemar, pairedCluster };
