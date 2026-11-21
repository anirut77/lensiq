"use strict";
// tests/unit/palm-v3-minors.test.js — FIXED TEST SET "palm-v3-lines/minors1" (palm v3 minor lines; owner standing order
// 2026-11-20 night, list A4 "minor lines on the v3 branch"; owner 200 ข "งานเส้นรองทำต่อบน branch ได้"). Locked in
// evals-locks/palm-v3-lines.sha256 BEFORE any product change for the minors. Scope, from ~/Desktop/LENSIQ-review/palm/
// PALM-UPGRADE-DESIGN-TH.md: B3.2 step 7 (minors), B4.1 (what a frontal phone photo can show), B6.1 rows M5-M8, owner decision
// D-P8 ก (sun, Mercury, bracelet and simian may become automatic only after field false-line <= 5 % (simian <= 1 %); marriage
// and girdle of Venus stay guides). All numbers are SYNTHETIC (tests/fixtures/palm-v3/synth-minors.js, a drawn hand), never
// field numbers; no photo of any person is used. The synthetic gates below mirror the field targets so a finder that already
// fails on drawn hands is never offered for the field measurement.
//   Hands: 12 per group, seeds alternate right / left.
//   NEG  heart, head, life only (seeds 501-512)            POS  + fate, sun, mercury, bracelet, girdle (seeds 521-532)
//   SIM  simian (replaces heart and head) + life (541-552) NUL  crease-free textures, no line at all (6 cases)
// MN-F false lines (M5, M6, M7 field targets applied to drawn hands): on hands where the line is not drawn, fate, sun, mercury,
//      bracelet and girdle are each drawn solid in <= 5 % of hands (24 hands: at most 1); simian in 0 of 24 (M8 <= 1 %); on SIM
//      hands heart and head (not drawn) are never solid (M2 <= 3 %, 12 hands: 0).
// MN-T found and on the crease (POS): fate solid in >= 65 % (M5), sun, mercury and bracelet each in >= 50 % (M6); every solid
//      minor lies on its own crease (mean distance <= 0.03 PW, worst point <= 0.08 PW; otherwise it counts as a wrong line and
//      fails); heart, head and life still solid in >= 10 / 12 with minors drawn. Girdle found rate: printed only (M7 guide).
// MN-S simian (SIM): simian solid in >= 80 % (M8) on its crease (same distance rule); whenever simian is solid, heart and head
//      are not solid; life solid in >= 10 / 12.
// MN-N crease-free textures with the minors pass on: no line of any kind solid; solid always means z >= the module's z limit.
// MN-G guide-only until the field gate (D-P8): PalmV2.AUTO stays false for sun, mercury, marriage, girdle, bracelet and simian, so
//      v3 output never makes them "found" in the v2 state (they stay dashed guides, never on the share card); marriage is never
//      searched and says so; LENSIQ_PALM_V3_FIELD_OK stays false. Only a re-lock after a field measurement may change this.
// MN-R report only: depth x 0.6 found rates, node time per hand with minors.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const V3 = require(path.join(ROOT, "palm-v3-lines.js"));
const SYN = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "synth-hand.js"));
const X2 = require(path.join(ROOT, "tests", "fixtures", "palm-v3", "tex2.js"));
const MIN = require(path.join(ROOT, "tests", "fixtures", "palm-v3", "synth-minors.js"));
const { recordingCtx, strokesOn, catmull, polyDist } = require("./palm-v2-kit.js");

const MAJ = ["heart", "head", "life"];
const MINORS = ["fate", "sun", "mercury", "bracelet", "girdle"];
const POS_LINES = ["heart", "head", "life", "fate", "sun", "mercury", "bracelet", "girdle"];
const metric = (P, asp) => P.map(q => [q[0], q[1] * asp]);
const side = seed => (seed % 2 ? "right" : "left");
const seeds = a => Array.from({ length: 12 }, (_, i) => a + i);

const cache = new Map();
function run(group, seed, lines, extra) {
  const key = `${group}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const h = MIN.synthMinors(Object.assign({ seed, side: side(seed), lines }, extra || {}));
  const t0 = Date.now(), det = V3.detect(h.rgba, h.w, h.h, h.hand, { minors: true });
  const out = { seed, h, det, ms: Date.now() - t0, F: PV.frameFromHand(h.hand) };
  cache.set(key, out);
  return out;
}
const NEG = () => seeds(501).map(s => run("neg", s, ["heart", "head", "life"]));
const POS = () => seeds(521).map(s => run("pos", s, POS_LINES));
const SIM = () => seeds(541).map(s => run("sim", s, ["simian", "life"]));

function onCrease(r, id) {
  const L = r.det.lines[id], T = metric(r.h.truth[id], r.F.asp), D = metric(catmull(L.cp, 120), r.F.asp);
  const d = D.map(p => polyDist(p, T));
  return { mean: d.reduce((s, v) => s + v, 0) / d.length, worst: Math.max(...d) };
}
const solid = (r, id) => !!(r.det.lines[id] && r.det.lines[id].solid && r.det.lines[id].cp);

test("MN-F false lines: fate / sun / mercury / bracelet / girdle <= 5 % of hands without them, simian 0, undrawn heart / head never solid", () => {
  const bad = [], cnt = {}, absent = {};
  const groups = [["NEG", NEG(), ["fate", "sun", "mercury", "bracelet", "girdle", "simian"]], ["SIM", SIM(), ["fate", "sun", "mercury", "bracelet", "girdle", "heart", "head"]],
    ["POS", POS(), ["simian"]]];
  for (const [g, rs, ids] of groups) for (const r of rs) for (const id of ids) {
    absent[id] = (absent[id] || 0) + 1;
    if (solid(r, id)) { cnt[id] = (cnt[id] || 0) + 1; bad.push(`${g} seed ${r.seed} ${r.h.side} ${id} solid z ${r.det.lines[id].z}`); }
  }
  const lim = { fate: 0.05, sun: 0.05, mercury: 0.05, bracelet: 0.05, girdle: 0.05, simian: 0.01, heart: 0.03, head: 0.03 };
  const fail = [];
  for (const id of Object.keys(absent)) {
    const rate = (cnt[id] || 0) / absent[id];
    if (rate > lim[id] + 1e-9) fail.push(`${id}: false line in ${cnt[id] || 0}/${absent[id]} hands (${(100 * rate).toFixed(1)} % > ${100 * lim[id]} %)`);
  }
  console.log("MN-F false lines (synthetic):", JSON.stringify(Object.fromEntries(Object.keys(absent).map(id => [id, `${cnt[id] || 0}/${absent[id]}`]))));
  if (fail.length) console.log(bad.join("\n"));
  assert.deepEqual(fail, []);
});

test("MN-T found on the crease: fate >= 65 %, sun / mercury / bracelet >= 50 %, no solid minor off its crease, majors still >= 10 / 12", () => {
  const rs = POS(), cnt = {}, bad = [], dist = {};
  for (const r of rs) for (const id of [...MAJ, ...MINORS]) {
    if (!solid(r, id)) continue;
    const m = onCrease(r, id);
    (dist[id] = dist[id] || []).push(m.mean);
    if (m.mean > 0.03 || m.worst > 0.08) { bad.push(`seed ${r.seed} ${r.h.side} ${id}: off its crease (mean ${m.mean.toFixed(3)}, worst ${m.worst.toFixed(3)} PW)`); continue; }
    cnt[id] = (cnt[id] || 0) + 1;
  }
  const need = { fate: 0.65, sun: 0.5, mercury: 0.5, bracelet: 0.5, heart: 10 / 12, head: 10 / 12, life: 10 / 12 };
  for (const id of Object.keys(need)) if ((cnt[id] || 0) < Math.ceil(need[id] * rs.length - 1e-9)) bad.push(`${id}: found ${cnt[id] || 0}/${rs.length} (< ${Math.round(100 * need[id])} %)`);
  console.log("MN-T found on the crease (synthetic):", JSON.stringify(Object.fromEntries([...MAJ, ...MINORS].map(id => [id, `${cnt[id] || 0}/${rs.length}`]))),
    "mean distance PW:", JSON.stringify(Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(4)]))));
  assert.deepEqual(bad, []);
});

test("MN-S simian: solid in >= 80 % of simian hands on its crease; heart and head never solid beside it; life >= 10 / 12", () => {
  const rs = SIM(), bad = [];
  let n = 0, life = 0;
  for (const r of rs) {
    assert.ok(r.det.lines.simian, "the minors pass reports a simian entry");
    if (solid(r, "life")) life++;
    if (!solid(r, "simian")) continue;
    const m = onCrease(r, "simian");
    if (m.mean > 0.03 || m.worst > 0.08) { bad.push(`seed ${r.seed}: simian off its crease (mean ${m.mean.toFixed(3)}, worst ${m.worst.toFixed(3)})`); continue; }
    n++;
    for (const id of ["heart", "head"]) if (solid(r, id)) bad.push(`seed ${r.seed} ${r.h.side}: ${id} solid beside a solid simian line`);
  }
  if (n < Math.ceil(0.8 * rs.length)) bad.push(`simian found ${n}/${rs.length} (< 80 %)`);
  if (life < 10) bad.push(`life found ${life}/${rs.length} (< 10)`);
  console.log("MN-S simian found on the crease (synthetic):", `${n}/${rs.length}`, "life", `${life}/${rs.length}`);
  assert.deepEqual(bad, []);
});

test("MN-N crease-free textures with the minors pass: nothing solid; solid implies z >= the module limit", () => {
  const cases = [];
  for (const seed of [561, 562]) cases.push([`synth-minors texture s${seed}`, MIN.synthMinors({ seed, side: side(seed), noCreases: true })]);
  for (const [f, seed] of [["fingerprint", 9], ["noise8", 10], ["darkSkin", 11], ["darkSkin+lowContrast+noise8", 12]]) {
    const h = SYN.synthHand({ lines: [], seed, side: side(seed), distract: 140 }); X2.applyAll(h, f.split("+"), seed); cases.push([`${f} s${seed}`, h]);
  }
  const bad = [], zmax = {};
  for (const [name, h] of cases) {
    const det = V3.detect(h.rgba, h.w, h.h, h.hand, { minors: true });
    for (const [id, L] of Object.entries(det.lines)) {
      if (!L) continue;
      if (typeof L.z === "number") zmax[id] = Math.max(zmax[id] == null ? -1e9 : zmax[id], L.z);
      if (L.solid) bad.push(`${name}: ${id} solid (z ${L.z})`);
    }
  }
  for (const r of [...NEG(), ...POS(), ...SIM()]) for (const [id, L] of Object.entries(r.det.lines)) {
    if (L && L.solid && !(L.z >= r.det.zLimit)) bad.push(`${id} solid at z ${L.z} below the limit ${r.det.zLimit}`);
  }
  console.log("MN-N crease-free, max z per line (synthetic):", JSON.stringify(Object.fromEntries(Object.entries(zmax).map(([k, v]) => [k, Math.round(v * 100) / 100]))));
  assert.deepEqual(bad, []);
});

test("MN-G guide-only until the field gate (D-P8): no minor except fate becomes 'found'; marriage never searched; field gate false", () => {
  const GUIDE = ["sun", "mercury", "marriage", "girdle", "bracelet", "simian"];
  for (const id of GUIDE) assert.equal(PV.AUTO[id], false, `PalmV2.AUTO.${id} must stay false until the D-P8 field measurement`);
  const cfg = fs.readFileSync(path.join(ROOT, "lensiq-config.js"), "utf8");
  assert.ok(/window\.LENSIQ_PALM_V3_FIELD_OK\s*=\s*false\s*;/.test(cfg), "LENSIQ_PALM_V3_FIELD_OK stays false");
  const toPx = q => [100 + q[0] * 400, 80 + q[1] * 400];
  for (const r of [...POS().slice(0, 4), ...SIM().slice(0, 4)]) {
    assert.ok(typeof r.det.marriage === "string" && /not searched/.test(r.det.marriage), "marriage: says it is not searched");
    assert.ok(!(r.det.lines.marriage && r.det.lines.marriage.solid), "marriage is never drawn solid");
    for (const school of PV.SCHOOLS) {
      const st = PV.newState({ side: r.h.side, school });
      PV.applyDetection(st, V3.toV2(r.det));
      for (const id of GUIDE) assert.notEqual(st.lines[id].status, "found", `${school}: ${id} became found`);
      const G = PV.guides(school);
      for (const target of ["screen", "share"]) {
        const { ctx, strokes } = recordingCtx();
        ctx.canvas.dataset.pv2Target = target;
        PV.drawLineLayer(ctx, st, target, { toPx, lang: "th", scale: 1 });
        for (const id of GUIDE) {
          if (!G[id]) continue;
          const on = strokesOn(strokes, catmull(G[id].cp.map(toPx)), 6);
          if (target === "share") assert.equal(on.length, 0, `${school}: ${id} guide on the share card`);
          else for (const s of on) assert.ok(s.dash.length > 0 && s.alpha <= 0.5 + 1e-9, `${school}: ${id} drawn solid on screen`);
        }
      }
    }
  }
});

test("MN-R report only: fainter minors (depth x 0.6) and node time per hand with minors", () => {
  const cnt = {}, ms = [];
  for (const seed of [571, 572, 573, 574]) {
    const h = MIN.synthMinors({ seed, side: side(seed), lines: POS_LINES, depthScale: 0.6 }), t0 = Date.now(), det = V3.detect(h.rgba, h.w, h.h, h.hand, { minors: true });
    ms.push(Date.now() - t0);
    for (const id of [...MAJ, ...MINORS]) if (det.lines[id] && det.lines[id].solid) cnt[id] = (cnt[id] || 0) + 1;
  }
  for (const r of POS()) ms.push(r.ms);
  ms.sort((a, b) => a - b);
  console.log("MN-R report only, depth x 0.6 solid of 4 (synthetic):", JSON.stringify(cnt), "| node ms per hand with minors: median", ms[ms.length >> 1], "max", ms[ms.length - 1]);
  assert.ok(true);
});
