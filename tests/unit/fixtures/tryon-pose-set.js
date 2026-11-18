"use strict";
// tests/unit/fixtures/tryon-pose-set.js — LOCKED synthetic fit set for the pose-anchored garment placement on tryon.html
// (owner decision 2026-11-18, "Try-On, on-device overlay", front view first). Written and hashed
// (~/LENSIQ-field/evals/tryon-pose/, evals-locks/tryon-pose.sha256) BEFORE LQTryOn.bodyAnchors / garmentTargets /
// garmentAnchorsFromAlpha / demoGarment / rasterGarment existed.
//
// Source label: SYNTHETIC. Every "person" is a set of numbers: a front-view body in its own frame (hip centre = origin,
// y down), rotated and placed in a camera frame. There is no photo or drawing of anyone. From each body we make:
//   lms   = 33 MediaPipe-style pose landmarks {x, y, z, visibility} (normalised 0..1): the JOINT CENTRES (shoulders, hips,
//           knees, ankles ...) with seeded noise; a point outside the frame gets visibility 0.05
//   truth = the body's OUTLINE reference points a garment is anchored to, known by construction (image px):
//           neck (neck base centre), shoulderL / shoulderR (outer shoulder tips), waistL / waistR (natural waist outline),
//           hipL / hipR (hip outline at the hip-joint line), crotch, kneeLo / kneeLi / kneeRo / kneeRi (outer / inner
//           knee outline), ankleLo / ankleLi / ankleRo / ankleRi (outer / inner ankle outline)
//           L / R = IMAGE left / right (smaller / larger x when the body is upright), whatever the landmark labels say
//   B     = the true shoulder-tip distance (px); every error is reported as a fraction of B (scale-free)
// The pose landmarks are joint centres, the garment needs the outline: the outline offsets are drawn per person from the
// ranges below (front-view adult proportions, in units of the shoulder-joint distance s). So this set measures how well the
// placement copes with build, tilt, framing, distance, landmark noise, asymmetry, stance and a mirrored camera. It does NOT
// measure whether these body proportions match real people, nor anything about real camera pictures (not done).
//
// Conditions (12 people each, seeded; 10 conditions = 120 people):
//   P1 typical, portrait photo 720 x 1280, full body       P6 landscape camera 640 x 480, close: knees and ankles out of frame
//   P2 slim build                                          P7 landmark noise (sigma 2.5 % of s, typical model jitter)
//   P3 broad / wide-hip build                              P8 asymmetric: one shoulder and one hip lower
//   P4 body tilted 3.5 - 8 degrees                         P9 legs apart
//   P5 far from the camera and off-centre (small)          P10 mirrored selfie (left / right landmark labels swapped)
// Refusal set (12 each): R1 side view, R2 shoulders not visible, R3 hips not visible, R4 knees visible but ankles not.
//
// Ranges (s = shoulder-joint distance; T = shoulder-centre to hip-centre distance):
//   T = 1.15-1.45 s · neck base 0-0.12 s above the shoulder line · shoulder tips 0.10-0.22 s outward, 0-0.08 s up from the joint
//   hip-joint distance wh = 0.62-0.95 s · hip outline half-width = (wh / 2) x 1.35-1.75, at the hip-joint line
//   natural waist at 0.58-0.70 T below the shoulder line, half-width 0.72-0.92 x the hip outline half-width
//   crotch 0.25-0.45 s below the hip centre · thigh, shin = 0.75-0.95 T · knee outline 0.09-0.13 s out, 0.07-0.11 s in
//   ankle outline 0.05-0.07 s out, 0.04-0.06 s in
//
// TARGETS (fixed before building; fractions of B): per anchor group the mean and the 90th percentile over every person
// that the placement accepts, and per condition the mean must stay under the anchor's p90 limit. Refusals: every refusal
// case refused with the right reason, no front-view case refused for a part that is visible.
const TARGETS = {
  neck: { mean: .05, p90: .09 }, shoulder: { mean: .06, p90: .10 }, waist: { mean: .08, p90: .13 }, hip: { mean: .08, p90: .13 },
  crotch: { mean: .10, p90: .16 }, knee: { mean: .09, p90: .15 }, ankle: { mean: .09, p90: .15 }
};
const GROUPS = {
  neck: ["neck"], shoulder: ["shoulderL", "shoulderR"], waist: ["waistL", "waistR"], hip: ["hipL", "hipR"], crotch: ["crotch"],
  knee: ["kneeLo", "kneeLi", "kneeRo", "kneeRi"], ankle: ["ankleLo", "ankleLi", "ankleRo", "ankleRi"]
};
/** body parts each category needs (front view): tops and outerwear end at the hip line, dresses and skirts at the knee
 * line, trousers at the ankles */
const NEEDS = { tops: ["shoulders", "hips"], outerwear: ["shoulders", "hips"], dresses: ["shoulders", "hips", "knees"],
  skirts: ["shoulders", "hips", "knees"], trousers: ["shoulders", "hips", "knees", "ankles"] };
const CATS = Object.keys(NEEDS);

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;

/** One person's parameters: condition name, case index. */
function params(cond, i) {
  const ci = cond.charCodeAt(0) * 100 + parseInt(cond.slice(1), 10);
  const R = rng(7919 * ci + 31 * i + 5), u = (a, b) => lerp(a, b, R()), sg = () => (R() < .5 ? -1 : 1);
  const p = {
    id: `${cond}-${i}`, cond, W: 720, H: 1280, s: u(130, 200), cxF: u(.45, .55), roll: u(-.02, .02), sigma: .008,
    T: u(1.15, 1.45), neckUp: u(0, .12), tipOut: u(.10, .22), tipUp: u(0, .08), wh: u(.62, .95), hipRatio: u(1.35, 1.75),
    waistF: u(.58, .70), waistRatio: u(.72, .92), crotch: u(.25, .45), thigh: u(.75, .95), shin: u(.75, .95),
    kneeSt: u(.75, 1), ankleSt: u(.75, 1), kneeOut: u(.09, .13), kneeIn: u(.07, .11), ankleOut: u(.05, .07), ankleIn: u(.04, .06),
    shDy: [0, 0], hipDy: [0, 0], mirror: false, squeeze: 1, hide: [], footY: u(.86, .93), seed: 7919 * ci + 31 * i + 5
  };
  if (cond === "P2") { p.wh = u(.62, .72); p.hipRatio = u(1.35, 1.5); p.waistRatio = u(.80, .92); p.tipOut = u(.10, .15); }
  if (cond === "P3") { p.wh = u(.85, .95); p.hipRatio = u(1.6, 1.75); p.waistRatio = u(.72, .82); p.tipOut = u(.16, .22); }
  if (cond === "P4") p.roll = sg() * u(.06, .14);
  if (cond === "P5") { p.s = u(55, 90); p.cxF = u(.22, .78); p.footY = u(.6, .95); }
  if (cond === "P6") { p.W = 640; p.H = 480; p.s = u(150, 210); p.footY = null; }
  if (cond === "P7") p.sigma = .025;
  if (cond === "P8") { p.shDy = [sg() * u(.03, .06), 0]; p.hipDy = [0, sg() * u(.025, .05)]; }
  if (cond === "P9") { p.kneeSt = u(1.2, 1.6); p.ankleSt = u(1.5, 2.2); }
  if (cond === "P10") p.mirror = true;
  if (cond === "R1") p.squeeze = u(.15, .4);
  if (cond === "R2") p.hide = ["shoulders"];
  if (cond === "R3") p.hide = ["hips"];
  if (cond === "R4") p.hide = ["ankles"];
  return p;
}

/** Builds the landmarks and the ground truth of one person. */
function build(p) {
  const R = rng(p.seed + 99991), gauss = () => { const a = Math.max(1e-9, R()), b = R(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
  const s = p.s, T = p.T * s, wh = p.wh * s, c = Math.cos(p.roll), sn = Math.sin(p.roll), q = p.squeeze;
  // body frame (dx across, + = image right; dy down; origin = hip centre)
  const hipHalfOut = wh / 2 * p.hipRatio, kneeX = wh / 2 * p.kneeSt, ankleX = wh / 2 * p.ankleSt;
  const kneeY = p.thigh * T, ankleY = kneeY + p.shin * T;
  const F = {
    neck: [0, -T - p.neckUp * s],
    shoulderL: [-(s / 2 + p.tipOut * s), -T - p.tipUp * s + p.shDy[0] * s], shoulderR: [s / 2 + p.tipOut * s, -T - p.tipUp * s + p.shDy[1] * s],
    waistL: [-hipHalfOut * p.waistRatio, -T + p.waistF * T], waistR: [hipHalfOut * p.waistRatio, -T + p.waistF * T],
    hipL: [-hipHalfOut, p.hipDy[0] * s], hipR: [hipHalfOut, p.hipDy[1] * s], crotch: [0, p.crotch * s],
    kneeLo: [-kneeX - p.kneeOut * s, kneeY], kneeLi: [-kneeX + p.kneeIn * s, kneeY], kneeRo: [kneeX + p.kneeOut * s, kneeY], kneeRi: [kneeX - p.kneeIn * s, kneeY],
    ankleLo: [-ankleX - p.ankleOut * s, ankleY], ankleLi: [-ankleX + p.ankleIn * s, ankleY], ankleRo: [ankleX + p.ankleOut * s, ankleY], ankleRi: [ankleX - p.ankleIn * s, ankleY]
  };
  // joints (MediaPipe indices; person's LEFT = image right for an unmirrored front view)
  const J = {
    0: [0, -T - .52 * s], 1: [.05 * s, -T - .6 * s], 2: [.1 * s, -T - .6 * s], 3: [.14 * s, -T - .6 * s], 4: [-.05 * s, -T - .6 * s], 5: [-.1 * s, -T - .6 * s],
    6: [-.14 * s, -T - .6 * s], 7: [.22 * s, -T - .55 * s], 8: [-.22 * s, -T - .55 * s], 9: [.06 * s, -T - .44 * s], 10: [-.06 * s, -T - .44 * s],
    11: [s / 2, -T + p.shDy[1] * s], 12: [-s / 2, -T + p.shDy[0] * s], 13: [.62 * s, -T + .55 * T], 14: [-.62 * s, -T + .55 * T],
    15: [.66 * s, -T + 1.05 * T], 16: [-.66 * s, -T + 1.05 * T], 17: [.68 * s, -T + 1.15 * T], 18: [-.68 * s, -T + 1.15 * T],
    19: [.66 * s, -T + 1.17 * T], 20: [-.66 * s, -T + 1.17 * T], 21: [.62 * s, -T + 1.1 * T], 22: [-.62 * s, -T + 1.1 * T],
    23: [wh / 2, p.hipDy[1] * s], 24: [-wh / 2, p.hipDy[0] * s], 25: [kneeX, kneeY], 26: [-kneeX, kneeY], 27: [ankleX, ankleY], 28: [-ankleX, ankleY],
    29: [ankleX, ankleY + .06 * s], 30: [-ankleX, ankleY + .06 * s], 31: [ankleX + .04 * s, ankleY + .2 * s], 32: [-ankleX - .04 * s, ankleY + .2 * s]
  };
  // placement in the frame: the feet at footY of the height (full body), or the hip line at 82 % (close half-body view)
  const cx = p.cxF * p.W, oy = p.footY == null ? .82 * p.H : p.footY * p.H - ankleY;
  const place = ([dx, dy]) => { const x = dx * q, y = dy; return { x: cx + c * x - sn * y, y: oy + sn * x + c * y }; };
  const truth = {}; for (const [k, v] of Object.entries(F)) truth[k] = place(v);
  const groups = { shoulders: [11, 12], hips: [23, 24], knees: [25, 26], ankles: [27, 28, 29, 30, 31, 32] };
  const hidden = new Set(); for (const g of p.hide) for (const i of groups[g]) hidden.add(i);
  const lms = [];
  for (let i = 0; i < 33; i++) {
    const P = place(J[i]), x = P.x + gauss() * p.sigma * s, y = P.y + gauss() * p.sigma * s;
    const inside = x >= 0 && x <= p.W && y >= 0 && y <= p.H;
    lms.push({ x: x / p.W, y: y / p.H, z: 0, visibility: hidden.has(i) ? .2 : inside ? .97 : .05 });
  }
  if (p.mirror) for (const [a, b] of [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]) {
    const t = lms[a]; lms[a] = lms[b]; lms[b] = t;
  }
  const B = Math.hypot(truth.shoulderR.x - truth.shoulderL.x, truth.shoulderR.y - truth.shoulderL.y);
  const has = {
    shoulders: !p.hide.includes("shoulders"), hips: !p.hide.includes("hips"),
    knees: !p.hide.includes("knees") && [25, 26].every(i => { const P = place(J[i]); return P.y < p.H && P.y > 0 && P.x > 0 && P.x < p.W; }),
    ankles: !p.hide.includes("ankles") && [27, 28].every(i => { const P = place(J[i]); return P.y < p.H && P.y > 0 && P.x > 0 && P.x < p.W; })
  };
  // what the placement must answer for each category: "ok", or the reason it refuses
  const expect = {};
  for (const cat of CATS) {
    if (p.squeeze < .5) { expect[cat] = "side"; continue; }
    const miss = NEEDS[cat].find(n => !has[n]);
    expect[cat] = miss || "ok";
  }
  return { id: p.id, cond: p.cond, W: p.W, H: p.H, lms, truth, B, has, expect, axis: { across: { x: c, y: sn }, down: { x: -sn, y: c } } };
}

const FIT_CONDS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"], REFUSE_CONDS = ["R1", "R2", "R3", "R4"], N = 12;
const cases = () => FIT_CONDS.map(c => Array.from({ length: N }, (_, i) => build(params(c, i)))).flat();
const refusals = () => REFUSE_CONDS.map(c => Array.from({ length: N }, (_, i) => build(params(c, i)))).flat();

/** anchors the placement must give for a category (body points; front view) */
const ANCHORS_FOR = {
  tops: ["neck", "shoulderL", "shoulderR", "hipL", "hipR"], outerwear: ["neck", "shoulderL", "shoulderR", "hipL", "hipR"],
  dresses: ["neck", "shoulderL", "shoulderR", "waistL", "waistR", "hipL", "hipR", "kneeLo", "kneeRo"],
  skirts: ["waistL", "waistR", "hipL", "hipR", "kneeLo", "kneeRo"],
  trousers: ["waistL", "waistR", "hipL", "hipR", "crotch", "kneeLo", "kneeLi", "kneeRo", "kneeRi", "ankleLo", "ankleLi", "ankleRo", "ankleRi"]
};

/**
 * Scores TO.bodyAnchors on every fit case. A row per (person, anchor) for every anchor the person's accepted categories
 * use: {id, cond, k, group, err (fraction of B), px}. Also returns the decisions per category.
 */
function run(TO) {
  const rows = [], decisions = [];
  for (const C of cases().concat(refusals())) {
    const A = TO.bodyAnchors(C.lms, C.W, C.H);
    for (const cat of CATS) {
      const got = A && A.ok ? (TO.missingFor(cat, A) || "ok") : (A && A.reason) || "none";
      decisions.push({ id: C.id, cond: C.cond, cat, want: C.expect[cat], got });
    }
    if (!A || !A.ok || C.cond[0] === "R") continue;
    const keys = new Set(); for (const cat of CATS) if (C.expect[cat] === "ok") for (const k of ANCHORS_FOR[cat]) keys.add(k);
    for (const k of keys) {
      const g = Object.keys(GROUPS).find(G => GROUPS[G].includes(k)), P = A[k], Tr = C.truth[k];
      const px = P ? Math.hypot(P.x - Tr.x, P.y - Tr.y) : Infinity;
      rows.push({ id: C.id, cond: C.cond, k, group: g, px, err: px / C.B });
    }
  }
  return { rows, decisions };
}

const pct = (xs, q) => { if (!xs.length) return NaN; const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1) + .5))]; };
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
/** {group: {all: {n, mean, p90}, byCond: {P1: {n, mean, p90}, ...}}} */
function summarize(rows) {
  const out = {};
  for (const g of Object.keys(GROUPS)) {
    const r = rows.filter(x => x.group === g), e = r.map(x => x.err), byCond = {};
    for (const c of FIT_CONDS) { const ec = r.filter(x => x.cond === c).map(x => x.err); if (ec.length) byCond[c] = { n: ec.length, mean: mean(ec), p90: pct(ec, .9) }; }
    out[g] = { all: { n: e.length, mean: mean(e), p90: pct(e, .9) }, byCond };
  }
  return out;
}
/** list of failed checks against TARGETS (empty = pass) */
function verdict(res) {
  const S = summarize(res.rows), bad = [];
  for (const [g, t] of Object.entries(TARGETS)) {
    const s = S[g];
    if (!s.all.n) { bad.push(`${g}: no rows`); continue; }
    if (!(s.all.mean <= t.mean)) bad.push(`${g}: mean ${s.all.mean.toFixed(3)} > ${t.mean}`);
    if (!(s.all.p90 <= t.p90)) bad.push(`${g}: p90 ${s.all.p90.toFixed(3)} > ${t.p90}`);
    for (const [c, v] of Object.entries(s.byCond)) if (!(v.mean <= t.p90)) bad.push(`${g} ${c}: mean ${v.mean.toFixed(3)} > ${t.p90}`);
  }
  for (const d of res.decisions) if (d.want !== d.got) bad.push(`${d.id} ${d.cat}: want ${d.want}, got ${d.got}`);
  return bad;
}

module.exports = { TARGETS, GROUPS, NEEDS, CATS, ANCHORS_FOR, FIT_CONDS, REFUSE_CONDS, N, params, build, cases, refusals, run, summarize, verdict, pct, mean };
