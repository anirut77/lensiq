"use strict";
// tests/unit/fixtures/studio-fit-set.js — LOCKED synthetic test set for the studio garment fit (owner-approved item 24).
// Written and hashed (~/LENSIQ-field/evals/tryon-fit/locked.sha256) BEFORE the new fit code in studio-core.js existed.
//
// Source label: SYNTHETIC. Every "person" is a flat silhouette drawn from numbers below (head ellipse, neck, sloping
// shoulders, arms); there is no photo of anyone. Ground truth is known by construction:
//   neck  = the neck base centre N (where the neck meets the shoulder line, in the body's own frame)
//   l / r = the shoulder tips (outer end of the shoulder top line, where the arm edge starts)
//   hem   = the silhouette's outer edge (analytic, sub-pixel) at the row where the garment's hem corner lands
// Conditions (8 cases each, seeded, 9 conditions = 72 people) × 3 garment shapes = 216 fits:
//   C1 typical symmetric · C2 one shoulder lower · C3 narrow shoulders · C4 broad shoulders · C5 body off the face centre
//   C6 body tilted · C7 short / long neck · C8 slim / wide below the shoulders (arm flare) · C9 long hair over one shoulder
//
// BEFORE = the pipeline in studio.js today for a photo garment: measureShoulders -> autoTargets (chin, l, r) ->
//          fitFromTargets -> templateWarp(anchors, fit, { side: fit.side })  (similarity + per-side shoulder line offsets)
// AFTER  = SC.personTargets(anchors, fit, alpha, W, H, face, { side, hair }) -> per-point targets on the person
//          (neck, collar, shoulder tips, hem corners), then SC.templateWarpTo(anchors, targets) (thin-plate spline).
// Errors are in pixels; fw (face width) is 70 px in every case, so 0.1 fw = 7 px.
const W = 360, H = 460, FW = 70;

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;

/** One person's parameters for condition c, case i (all lengths in px). */
function params(c, i) {
  const R = rng(1000 * c + i + 17), u = (a, b) => lerp(a, b, R());
  const p = {
    id: `C${c}-${i}`, cond: `C${c}`, cx: u(170, 190), chinY: u(150, 165), neckLen: u(.5, .62) * FW, nw: u(.3, .36) * FW, shift: 0,
    hwL: u(1.4, 1.55) * FW, hwR: 0, dropL: u(.3, .4) * FW, dropR: 0, flare: u(.02, .05), tilt: 0, hair: null
  };
  p.hwR = p.hwL + u(-.04, .04) * FW; p.dropR = p.dropL + u(-.03, .03) * FW;
  if (c === 2) { const k = u(.15, .3) * FW; if (i % 2) p.dropL += k; else p.dropR += k; }
  if (c === 3) { p.hwL = u(1.12, 1.28) * FW; p.hwR = p.hwL + u(-.04, .04) * FW; }
  if (c === 4) { p.hwL = u(1.8, 2.05) * FW; p.hwR = p.hwL + u(-.05, .05) * FW; }
  if (c === 5) p.shift = (i % 2 ? 1 : -1) * u(.12, .22) * FW;
  if (c === 6) p.tilt = (i % 2 ? 1 : -1) * u(.07, .14);
  if (c === 7) p.neckLen = (i % 2 ? u(.3, .38) : u(.78, .9)) * FW;
  if (c === 8) p.flare = i % 2 ? u(-.04, -.01) : u(.1, .16);
  if (c === 9) p.hair = { side: i % 2 ? 1 : -1, x0: u(.3, .45) * FW, x1: u(.8, 1.05) * FW, len: u(.35, .7) * FW };
  return p;
}

/** Neck base centre in image coordinates. */
const neckBase = p => ({ x: p.cx + p.shift, y: p.chinY + p.neckLen });
const rot = (p, N, a) => { const c = Math.cos(a), s = Math.sin(a); return { x: N.x + c * p.x - s * p.y, y: N.y + s * p.x + c * p.y }; };
const unrot = (x, y, N, a) => { const c = Math.cos(a), s = Math.sin(a), dx = x - N.x, dy = y - N.y; return { x: c * dx + s * dy, y: -s * dx + c * dy }; };

/** Body (neck + shoulders + arms/torso) in the body's own frame (origin N, y down). */
function bodyInsideLocal(p, lx, ly) {
  const sd = lx < 0 ? -1 : 1, ax = Math.abs(lx), hw = sd < 0 ? p.hwL : p.hwR, drop = sd < 0 ? p.dropL : p.dropR;
  if (ax <= p.nw) return ly >= -(p.neckLen + .15 * FW);                      // neck column up to (and into) the head
  const yns = -.1 * FW;                                                        // trapezius start beside the neck
  if (ax <= hw) { const t = (ax - p.nw) / (hw - p.nw); return ly >= yns + (drop - yns) * Math.pow(t, 1.6); }
  return ly >= drop && ax <= hw + p.flare * (ly - drop);                       // arm: outer edge below the tip
}
function headInside(p, x, y) { const hx = (x - p.cx) / (.5 * FW), hy = (y - (p.chinY - .68 * FW)) / (.68 * FW); return hx * hx + hy * hy <= 1; }
function hairInside(p, x, y) {
  if (!p.hair) return false;
  const N = neckBase(p), lx = (x - N.x) * p.hair.side;
  const drop = p.hair.side < 0 ? p.dropL : p.dropR;
  return lx >= p.hair.x0 && lx <= p.hair.x1 && y >= p.chinY - .5 * FW && y <= N.y + drop + p.hair.len;
}

/** Rasterise one person: alpha (body ∪ head ∪ hair), hair mask, face, ground truth. */
function person(p) {
  const N = neckBase(p), alpha = new Float32Array(W * H), hair = p.hair ? new Float32Array(W * H) : null;
  const inBody = (x, y) => { const q = unrot(x, y, N, p.tilt); return bodyInsideLocal(p, q.x, q.y); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x + .5, Y = y + .5, b = inBody(X, Y) || headInside(p, X, Y), hr = hairInside(p, X, Y);
    if (b || hr) alpha[y * W + x] = 1;
    if (hair && hr && !inBody(X, Y)) hair[y * W + x] = 1;                  // hair falling on the shoulder, over the background
  }
  const face = { cx: p.cx, chinX: p.cx, chinY: p.chinY, fw: FW, eyeY: p.chinY - .9 * FW, detected: true };
  const gt = { neck: N, l: rot({ x: -p.hwL, y: p.dropL }, N, p.tilt), r: rot({ x: p.hwR, y: p.dropR }, N, p.tilt) };
  /** outer silhouette edge (body only) at image row y on side sd, sub-pixel by bisection from the body centre line */
  gt.edgeAt = (y, sd) => {
    y = Math.max(0, Math.min(H - 1, y));
    const c = rot({ x: 0, y: (y - N.y) / Math.cos(p.tilt) }, N, p.tilt).x;  // body centre line crosses row y here
    let lo = 0, hi = W; if (!inBody(c, y)) return null;
    while (hi - lo > .05) { const m = (lo + hi) / 2; if (inBody(c + sd * m, y)) lo = m; else hi = m; }
    return c + sd * lo;
  };
  return { p, W, H, alpha, hair, face, gt };
}

/** Flat-lay garments (alpha only), the same family as tests/unit/studio-geometry.test.js jacket(). */
const GW = 200, GH = 210;
function garment(kind) {
  const a = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const dx = Math.abs(x - 100); let on = 0;
    if (kind === "jacket") {
      if (y >= 20 && y <= 190 && !(dx < 18 && y < 20 + (18 - dx) * 1.4)) { const top = 20 + Math.max(0, dx - 18) * .25; on = dx > 80 ? (y > top + (dx - 80) * 3 && dx < 95 ? 1 : 0) : (y >= top ? 1 : 0); }
    } else if (kind === "tee") {
      // round neck, short sleeves angled out, body narrower than the sleeves
      if (y >= 22 && y <= 196 && !((dx / 22) ** 2 + ((y - 22) / 16) ** 2 < 1)) { const top = 22 + Math.max(0, dx - 20) * .3; on = dx > 72 ? (y > top + (dx - 72) * 2.2 && y < 95 && dx < 96 ? 1 : 0) : (y >= top ? 1 : 0); }
    } else {
      // shirt: narrow collar, square shoulders, long sleeves close to the body
      if (y >= 16 && y <= 200 && !(dx < 14 && y < 16 + (14 - dx) * 2)) { const top = 16 + Math.max(0, dx - 14) * .18; on = dx > 84 ? (y > top + (dx - 84) * 4 && dx < 94 ? 1 : 0) : (y >= top ? 1 : 0); }
    }
    a[y * GW + x] = on;
  }
  return { kind, W: GW, H: GH, alpha: a };
}
const GARMENTS = ["jacket", "tee", "shirt"];
const CONDITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const CASES = 8;

function cases() { const out = []; for (const c of CONDITIONS) for (let i = 0; i < CASES; i++) out.push(params(c, i)); return out; }

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Errors of one target set against ground truth. targets: array aligned with anchors (k = neck, cl, cr, l, r, hl, hr). */
function errorsOf(anchors, targets, P) {
  const at = k => targets[anchors.findIndex(a => a.k === k)];
  const e = { neck: dist(at("neck"), P.gt.neck), l: dist(at("l"), P.gt.l), r: dist(at("r"), P.gt.r) };
  const hem = [];
  for (const [k, sd] of [["hl", -1], ["hr", 1]]) { const t = at(k), ed = P.gt.edgeAt(t.y, sd); if (ed != null) hem.push(Math.abs(t.x - ed)); }
  e.hem = hem.length ? hem.reduce((s, v) => s + v, 0) / hem.length : null;
  e.shoulder = (e.l + e.r) / 2;
  return e;
}

/** Rendered check: warp the garment with inv, find its anchors again on the warped alpha, compare with ground truth. */
function renderedErrors(SC, G, inv, P) {
  const src = new Uint8ClampedArray(G.W * G.H * 4);
  for (let i = 0; i < G.W * G.H; i++) { src[i * 4] = 40; src[i * 4 + 1] = 50; src[i * 4 + 2] = 80; src[i * 4 + 3] = G.alpha[i] * 255; }
  const out = SC.warpRGBA(src, G.W, G.H, P.W, P.H, inv, { step: 2 }), a = new Float32Array(P.W * P.H);
  for (let i = 0; i < a.length; i++) a[i] = out[i * 4 + 3] / 255;
  const an = SC.templateAnchors(a, P.W, P.H); if (!an) return null;
  const k = q => an.find(x => x.k === q);
  return { neck: dist(k("neck"), P.gt.neck), shoulder: (dist(k("l"), P.gt.l) + dist(k("r"), P.gt.r)) / 2 };
}

/** Run BEFORE and AFTER on every case × garment. Needs SC (studio-core.js) and CANON (photobooth-outfits.js). */
function run(SC, CANON, { rendered = true } = {}) {
  const G = GARMENTS.map(garment).map(g => ({ ...g, anchors: SC.templateAnchors(g.alpha, g.W, g.H) }));
  const rows = [];
  for (const p of cases()) {
    const P = person(p);
    const F = SC.measureShoulders(P.alpha, P.W, P.H, P.face, { hair: P.hair, canon: CANON });
    const fit = SC.fitFromTargets({ chin: F.chin, l: F.l, r: F.r }, CANON); fit.side = F.side;
    for (const g of G) {
      const before = SC.templateWarp(g.anchors, fit, { side: fit.side });
      const pt = SC.personTargets(g.anchors, fit, P.alpha, P.W, P.H, P.face, { side: fit.side, hair: P.hair });
      const after = SC.templateWarpTo(g.anchors, pt.targets);
      const row = { id: p.id, cond: p.cond, garment: g.kind, before: errorsOf(g.anchors, before.targets, P), after: errorsOf(g.anchors, after.targets, P) };
      if (rendered) { row.rBefore = renderedErrors(SC, g, before.inv, P); row.rAfter = renderedErrors(SC, g, after.inv, P); }
      rows.push(row);
    }
  }
  return rows;
}

const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };
/** Summary per metric and per condition: {all: {before:{mean,p90}, after:{...}}, byCond: {C1: ...}} */
function summarize(rows, metric, src = ["before", "after"]) {
  const pick = (R, s) => R.map(r => r[s] && r[s][metric]).filter(v => v != null && Number.isFinite(v));
  const one = R => Object.fromEntries(src.map(s => [s, { mean: mean(pick(R, s)), p90: pct(pick(R, s), .9), n: pick(R, s).length }]));
  const byCond = {}; for (const c of CONDITIONS) byCond["C" + c] = one(rows.filter(r => r.cond === "C" + c));
  return { all: one(rows), byCond };
}

/** Targets fixed with the set (before any new fit code existed). */
const TARGETS = {
  shoulderMeanRatio: .6,   // AFTER mean shoulder-tip error ≤ 60 % of BEFORE (all fits)
  shoulderP90Px: 7,        // AFTER p90 shoulder-tip error ≤ 0.1 fw = 7 px
  neckMeanNotWorse: true,  // AFTER mean neck error ≤ BEFORE mean
  neckP90Px: 7,            // AFTER p90 neck error ≤ 7 px
  hemMeanRatio: .6,        // AFTER mean hem-edge error ≤ 60 % of BEFORE
  perCondSlackPx: 1,       // in EVERY condition, AFTER mean (shoulder, neck) ≤ BEFORE mean + 1 px
  renderedShoulderBetter: true // rendered (warped garment re-measured): AFTER mean shoulder error < BEFORE mean
};

module.exports = { W, H, FW, GARMENTS, CONDITIONS, CASES, params, cases, person, garment, errorsOf, renderedErrors, run, summarize, mean, pct, TARGETS };
