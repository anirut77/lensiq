"use strict";
// tests/unit/palm-v3-hard.test.js — FIXED TEST SET "palm-v3-lines" relock2 (relock1 had two lines over 200 characters, never run) (palm v3 majors, owner order 2026-11-20 evening), locked
// BEFORE the majors-finish change. All numbers are SYNTHETIC (drawn hand + drawn textures), never field numbers; no photo is used.
// H   HARDER null control: textures stacked and denser wrinkles on a palm with no principal line, seeds 41-43, left and right:
//       - synth-hand with 280 short distractor creases (twice the default) + textures.js skinCreases;
//       - textures.js skinStrong + tex2 lighting;  - tex2 darkSkin + noise8 + motion;  - tex2 fingerprint + hardShadow;
//       - synth-real texture alone + tex2 lighting + noise8;  - synth-real texture + tex2 lowContrast + darkSkin;
//     no line of any kind is drawn solid, nothing reaches "found" in the v2 state, and every major's z stays below the limit.
// R   the majors on realistic creases keep their geometry rules on fresh seeds 51-56 (left / right): every SOLID line lies on its
//     crease (mean <= 0.03 PW, worst point <= 0.08 PW) and covers >= 60 % of it; heart, head and life each solid in >= 10 / 12.
// T   timing is reported (synthetic hand, Node, majors only): median and worst detection time; not a pass rule (machines differ).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const V3 = require(path.join(ROOT, "palm-v3-lines.js"));
const SYN = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "synth-hand.js"));
const TEX = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "textures.js"));
const X2 = require(path.join(ROOT, "tests", "fixtures", "palm-v3", "tex2.js"));
const REAL = require(path.join(ROOT, "tests", "fixtures", "palm-v3", "synth-real.js"));
const { catmull, polyDist } = require("./palm-v2-kit.js");

const MAJ = ["heart", "head", "life"];
const times = [];
function run(h) { const t0 = Date.now(), d = V3.detect(h.rgba, h.w, h.h, h.hand, {}); times.push(Date.now() - t0); return d; }

function hardCases() {
  const out = [];
  for (const seed of [41, 42, 43]) for (const side of ["right", "left"]) {
    const k = seed * 10 + (side === "left" ? 1 : 0);
    out.push([`dense-wrinkles+skinCreases s${seed} ${side}`, () => {
      const h = SYN.synthHand({ lines: [], seed, side, distract: 280 }); TEX.apply(h, TEX.texture("skinCreases", h.w, h.h, k, h.pw)); return h; }]);
    out.push([`skinStrong+lighting s${seed} ${side}`, () => {
      const h = SYN.synthHand({ lines: [], seed, side, distract: 140 }); TEX.apply(h, TEX.texture("skinStrong", h.w, h.h, k, h.pw)); X2.applyAll(h, ["lighting"], k); return h; }]);
    out.push([`darkSkin+noise8+motion s${seed} ${side}`, () => { const h = SYN.synthHand({ lines: [], seed, side, distract: 140 }); X2.applyAll(h, ["darkSkin", "noise8", "motion"], k); return h; }]);
    out.push([`fingerprint+hardShadow s${seed} ${side}`, () => { const h = SYN.synthHand({ lines: [], seed, side, distract: 140 }); X2.applyAll(h, ["fingerprint", "hardShadow"], k); return h; }]);
    out.push([`real-texture+lighting+noise8 s${seed} ${side}`, () => { const h = REAL.synthReal({ seed, side, noCreases: true }); X2.applyAll(h, ["lighting", "noise8"], k); return h; }]);
    out.push([`real-texture+lowContrast+darkSkin s${seed} ${side}`, () => { const h = REAL.synthReal({ seed, side, noCreases: true }); X2.applyAll(h, ["lowContrast", "darkSkin"], k); return h; }]);
  }
  return out;
}

test("H harder null control: stacked textures and denser wrinkles, no line drawn solid, nothing found, every major z below the limit", () => {
  const bad = [], zmax = {};
  for (const [name, make] of hardCases()) {
    const h = make(), det = run(h);
    for (const [id, L] of Object.entries(det.lines)) {
      if (!L) continue;
      if (typeof L.z === "number") zmax[id] = Math.max(zmax[id] == null ? -1e9 : zmax[id], L.z);
      if (L.solid) bad.push(`${name}: ${id} drawn solid (z ${L.z})`);
      if (MAJ.includes(id) && !(L.z < det.zLimit)) bad.push(`${name}: ${id} z ${L.z} not below ${det.zLimit}`);
    }
    const st = PV.newState({ side: h.side, school: "thai" });
    PV.applyDetection(st, V3.toV2(det));
    for (const id of PV.LINES) if (st.lines[id].status === "found") bad.push(`${name}: ${id} FOUND in the v2 state`);
  }
  console.log("harder null, max z per line (synthetic):", JSON.stringify(Object.fromEntries(Object.entries(zmax).map(([k, v]) => [k, Math.round(v * 100) / 100]))));
  assert.deepEqual(bad, []);
});

test("R realistic creases on fresh seeds: solid lines on the crease (mean <= 0.03, worst <= 0.08 PW, >= 60 % covered); each major >= 10/12", () => {
  const cnt = { heart: 0, head: 0, life: 0 }, bad = [];
  for (const seed of [51, 52, 53, 54, 55, 56]) for (const side of ["right", "left"]) {
    const h = REAL.synthReal({ seed, side }), det = run(h), F = PV.frameFromHand(h.hand);
    for (const id of MAJ) {
      const L = det.lines[id];
      if (!L || !L.solid) continue;
      cnt[id]++;
      const T = h.truth[id].map(q => [q[0], q[1] * F.asp]), D = catmull(L.cp, 120).map(q => [q[0], q[1] * F.asp]);
      const d = D.map(p => polyDist(p, T)), mean = d.reduce((s, v) => s + v, 0) / d.length, worst = Math.max(...d), cover = T.filter(p => polyDist(p, D) <= 0.04).length / T.length;
      if (mean > 0.03 || worst > 0.08 || cover < 0.6) bad.push(`seed ${seed} ${side} ${id}: mean ${mean.toFixed(3)} worst ${worst.toFixed(3)} cover ${cover.toFixed(2)}`);
    }
  }
  for (const id of MAJ) if (cnt[id] < 10) bad.push(`${id} solid in ${cnt[id]}/12 (< 10)`);
  console.log("fresh realistic creases drawn solid (synthetic):", JSON.stringify(cnt), "of 12");
  assert.deepEqual(bad, []);
});

test("T timing report (synthetic, Node, majors only; not a pass rule)", () => {
  const t = times.slice().sort((a, b) => a - b);
  assert.ok(t.length > 0);
  console.log(`detection time over ${t.length} synthetic hands: median ${t[t.length >> 1]} ms, worst ${t[t.length - 1]} ms`);
});
