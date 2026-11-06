"use strict";
/* tests/bench/metrics.cjs — pure metric code for the accuracy benchmarks (unit-tested in tests/unit/bench-metrics.test.js).
 * Boxes are {x,y,w,h} in any consistent unit. Nothing here touches the DOM or the network.
 *
 *   iou(a,b)
 *   hungarianMax(W) -> [[r,c]]               maximum-weight assignment on a rectangular weight matrix (weights >= 0)
 *   matchFrame(gt, hyp, thr=0.5) -> {pairs:[[gi,hi]], ...}   max-IoU assignment with IoU >= thr
 *   detEval(frames, thr) -> {tp, fp, fn, precision, recall, f1, ap}
 *       frames = [{gt:[box], ign:[box], det:[{...box, score}]}] ; dets matching an ignore box (IoU>=0.5) are dropped
 *       ap = all-point interpolated average precision over the score-sorted detections (VOC style, IoU thr)
 *   clearMot(frames, thr) -> {mota, motp, fp, fn, idsw, gt, frag}  frames = [{gt:[{id,...box}], ign, hyp:[{id,...box}]}]
 *   idf1(frames, thr) -> {idf1, idp, idr, idtp}                      global ID assignment (Ristani et al. 2016)
 *   crossingsFromTracks(tracks, line, checkCrossing, swap) -> [{id,t,dir,pos}]   tracks = Map(id -> [{t, p:{x,y}}])
 *   matchEvents(gtEv, prEv, {dt, dpos}) -> {tp, fp, fn, precision, recall}       same direction, |Δt|<=dt, |Δpos|<=dpos
 *   countError(gtEv, prEv) -> {gtIn, gtOut, prIn, prOut, errIn, errOut, errTotal}  signed relative errors
 *   verification(distSame[], distDiff[], thresholds) -> [{thr, tar, far, acc}] ; eer(distSame, distDiff) -> {eer, thr}
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
  // AP: greedy per-frame matching at each threshold is approximated by the operating-point assignment above,
  // which is exact for score-sorted greedy-equivalent cases and standard for MOT-style sweeps.
  scored.sort((a, b) => b.s - a.s);
  let ctp = 0, cfp = 0; const pr = [];
  for (const d of scored) { d.tp ? ctp++ : cfp++; pr.push([ctp / Math.max(1, nGt), ctp / (ctp + cfp)]); }
  let ap = 0, prevR = 0;
  for (let i = 0; i < pr.length; i++) {
    let pmax = 0; for (let k = i; k < pr.length; k++) pmax = Math.max(pmax, pr[k][1]);
    ap += (pr[i][0] - prevR) * pmax; prevR = pr[i][0];
  }
  const precision = tp + fp ? tp / (tp + fp) : 0, recall = nGt ? tp / nGt : 0;
  return { tp, fp, fn, gt: nGt, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, ap };
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
function eer(same, diff) {
  const all = [...new Set([...same, ...diff])].sort((a, b) => a - b);
  let best = { eer: 1, thr: 0, gap: Infinity };
  for (const thr of all) {
    const frr = same.filter(d => d > thr).length / Math.max(1, same.length);
    const far = diff.filter(d => d <= thr).length / Math.max(1, diff.length);
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

module.exports = { iou, hungarianMin, hungarianMax, matchFrame, dropIgnored, detEval, clearMot, idf1, crossingsFromTracks, projectOnLine, matchEvents, countError, verification, eer, oneToN, wilson };
