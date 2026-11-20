"use strict";
// tests/unit/palm-v2-textures.test.js — FIXED TEST SET "palm-layers" relock3 (independent review round 1 of palm-v2 FAILED,
// 2026-11-20), locked BEFORE the round-2 product change. Numbers are SYNTHETIC (drawn hand + drawn textures), never field numbers.
// M1  crease-free textures (tests/fixtures/palm-v2/textures.js: noise4, noise10, paper, skin, skinStrong, skinCreases) on a palm
//     with no lines, left and right, 3 schools: no line found (majors and minors), and every line's confidence stays at least
//     0.15 below its threshold (a clear margin, not 0.01-0.02).
// T   true creases are still found on plain skin, skin texture and noise10 (heart, head, life in every image; fate in >= 75 %),
//     and on faint creases (depth 0.5: >= 75 % of majors); mean distance <= 0.04 palm widths, worst point <= 0.06.
// M2  a partial crease among distractor creases: a found line never runs past the crease or bridges to a distractor (every
//     point within 0.04 PW of the real crease, length <= crease + 0.06 PW), and every drawn point of a found line lies on a dark
//     valley of the photo (no solid stroke over plain skin).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const SYN = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "synth-hand.js"));
const TEX = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "textures.js"));
const { catmull, polyDist } = require("./palm-v2-kit.js");

const MAJ = ["heart", "head", "life", "fate"];
const scaled = (P, asp) => catmull(P, 80).map(q => [q[0], q[1] * asp]);
const meanDist = (a, b, asp) => { const A = scaled(a, asp), B = scaled(b, asp); return A.map(p => polyDist(p, B)).reduce((s, v) => s + v, 0) / A.length; };
const maxDist = (a, b, asp) => { const A = scaled(a, asp), B = scaled(b, asp); return Math.max(...A.map(p => polyDist(p, B))); };
const len = (P, asp) => { const C = scaled(P, asp); return C.reduce((s, p, i) => i ? s + Math.hypot(p[0] - C[i - 1][0], p[1] - C[i - 1][1]) : 0, 0); };
/** detection for every school (one filter pass, classify per school) -> states */
function states(h) {
  const det = PV.detect(h.rgba, h.w, h.h, h.hand, { school: "thai" }), out = {};
  for (const school of PV.SCHOOLS) {
    const lines = school === "thai" ? det.lines : PV.classify(det._D, school), st = PV.newState({ side: h.side, school });
    PV.applyDetection(st, { lines, asp: det.asp });
    out[school] = { st, lines };
  }
  return out;
}

test("M1 crease-free textures: no line found in any school, every confidence >= 0.15 below its threshold", () => {
  const bad = [], table = {};
  for (const kind of TEX.KINDS) for (const seed of [1, 2, 3]) for (const side of ["right", "left"]) {
    const h = SYN.synthHand({ lines: [], seed, side, distract: 0 });
    TEX.apply(h, TEX.texture(kind, h.w, h.h, seed * 3 + (side === "left" ? 1 : 0), h.pw));
    const S = states(h);
    for (const school of PV.SCHOOLS) for (const id of PV.LINES) {
      const L = S[school].st.lines[id], conf = (S[school].lines[id] && S[school].lines[id].conf) || 0;
      table[kind] = Math.max(table[kind] || 0, conf);
      if (L.status === "found") bad.push(`${kind} seed ${seed} ${side} ${school}: ${id} FOUND (conf ${conf})`);
      else if (conf > PV.threshold(id) - 0.15) bad.push(`${kind} seed ${seed} ${side} ${school}: ${id} conf ${conf} within 0.15 of ${PV.threshold(id)}`);
    }
  }
  console.log("max confidence per texture (synthetic):", JSON.stringify(table));
  assert.deepEqual(bad, []);
});

test("T true creases still found on plain, skin and noise10 textures and when faint; position within 0.04 PW (worst point 0.06)", () => {
  const conds = ["plain", "skin", "noise10", "depth05"], bad = [], rate = {};
  for (const cond of conds) {
    const cnt = Object.fromEntries(MAJ.map(id => [id, 0])); let n = 0;
    for (const seed of [11, 12, 13, 14]) for (const side of ["right", "left"]) {
      const o = { lines: MAJ, seed, side };
      if (cond === "depth05") o.depth = 0.5;
      if (cond === "skin" || cond === "noise10") o.distract = 0;
      const h = SYN.synthHand(o);
      if (cond === "skin" || cond === "noise10") TEX.apply(h, TEX.texture(cond, h.w, h.h, seed, h.pw));
      const st = states(h).thai.st, F = PV.frameFromHand(h.hand);
      n++;
      for (const id of MAJ) {
        const L = st.lines[id];
        if (L.status !== "found") continue;
        cnt[id]++;
        const md = meanDist(L.cp, h.truth[id], F.asp), xd = maxDist(L.cp, h.truth[id], F.asp);
        if (md > 0.04 || xd > 0.06) bad.push(`${cond} seed ${seed} ${side}: ${id} mean ${md.toFixed(3)} worst ${xd.toFixed(3)} PW`);
      }
    }
    rate[cond] = Object.fromEntries(MAJ.map(id => [id, cnt[id] + "/" + n]));
    if (cond === "depth05") {
      const all = MAJ.reduce((s, id) => s + cnt[id], 0);
      if (all < 0.75 * n * MAJ.length) bad.push(`depth05: ${all}/${n * MAJ.length} majors found (< 75 %)`);
    } else {
      for (const id of ["heart", "head", "life"]) if (cnt[id] < n) bad.push(`${cond}: ${id} found ${cnt[id]}/${n}`);
      if (cnt.fate < 0.75 * n) bad.push(`${cond}: fate found ${cnt.fate}/${n} (< 75 %)`);
    }
  }
  console.log("true-crease found (synthetic):", JSON.stringify(rate));
  assert.deepEqual(bad, []);
});

/** a partial crease (span t0..t1 of a line's truth) drawn on a palm with distractor creases */
function partial(id, t0, t1, seed) {
  const h = SYN.synthHand({ lines: [], seed, distract: 140 });
  const C = catmull(SYN.TRUTH[id], 100).slice(Math.round(t0 * 100), Math.round(t1 * 100) + 1), P = C.map(h.toImg), D = new Float32Array(h.w * h.h);
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    for (let s = 0; s <= 4; s++) {
      const q = [a[0] + (b[0] - a[0]) * s / 4, a[1] + (b[1] - a[1]) * s / 4];
      for (let y = Math.floor(q[1] - 6); y <= q[1] + 6; y++) for (let x = Math.floor(q[0] - 6); x <= q[0] + 6; x++) {
        const v = Math.exp(-((x + 0.5 - q[0]) ** 2 + (y + 0.5 - q[1]) ** 2) / (2 * 1.9 * 1.9)), k = y * h.w + x;
        if (v > D[k]) D[k] = v;
      }
    }
  }
  for (let i = 0; i < D.length; i++) if (D[i]) { const f = 1 - 0.55 * D[i]; h.rgba[i * 4] *= f; h.rgba[i * 4 + 1] *= f; h.rgba[i * 4 + 2] *= f; }
  return { h, C };
}
const darkAt = (h, p) => { const x = Math.round(p[0]), y = Math.round(p[1]); let m = 255; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
  const i = ((y + dy) * h.w + (x + dx)) * 4; if (i >= 0 && i < h.rgba.length) m = Math.min(m, h.rgba[i + 1]); } return m; };

test("M2 partial creases among distractors: a found line stays on the crease and never bridges over plain skin", () => {
  const bad = [];
  let found = 0, cases = 0;
  for (const id of MAJ) for (const [t0, t1] of [[0.25, 0.75], [0, 0.5], [0.5, 1]]) for (const seed of [3, 4]) {
    const { h, C } = partial(id, t0, t1, seed), S = states(h), F = PV.frameFromHand(h.hand);
    cases++;
    const L = S.thai.st.lines[id];
    if (L.status !== "found") continue;
    found++;
    const where = `${id} [${t0}, ${t1}] seed ${seed}`, xd = maxDist(L.cp, C, F.asp), extra = len(L.cp, F.asp) - len(C, F.asp);
    if (xd > 0.04) bad.push(`${where}: a point ${xd.toFixed(3)} PW off the crease`);
    if (extra > 0.06) bad.push(`${where}: ${extra.toFixed(3)} PW longer than the crease`);
    const drawn = catmull(L.cp, 120).map(F.toImg), off = drawn.filter(p => darkAt(h, p) >= 165).length;
    if (off > 0.05 * drawn.length) bad.push(`${where}: ${off}/${drawn.length} drawn points over plain skin`);
  }
  console.log(`partial creases found ${found}/${cases} (not required; checked when found)`);
  assert.deepEqual(bad, []);
});
