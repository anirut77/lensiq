"use strict";
// tests/unit/palm-v3-lines.test.js — FIXED TEST SET "palm-v3-lines" (palm v3 line-finder spike, owner order 2026-11-20), locked in
// evals-locks/palm-v3-lines.sha256 BEFORE the module palm-v3-lines.js was written. All numbers are SYNTHETIC (drawn hand + drawn
// textures + drawn creases), never field numbers. The owner's photos are not used by any test.
// N   null-distribution false-line control: crease-free textures (textures.js: noise4, noise10, paper, skin, skinStrong,
//     skinCreases; the reviewer's tex2.js: fingerprint, noise8, motion, lighting, hardShadow+noise8, darkSkin,
//     darkSkin+lowContrast+noise8; synth-real.js texture alone) on a palm with no principal line, left and right: no line of any
//     kind is drawn solid (z below the module's fixed limit), and nothing reaches "found" through the v2 state.
//     hair / tattoo (long dark strokes, not crease-free): printed only.
// S   realistic shallow creases (synth-real.js, depth 0.08-0.14, sigma 0.0055 PW, measured on the owner's development photos):
//     heart, head and life each drawn solid in >= 10 of 12 hands (6 seeds x left / right); every solid line lies on its crease
//     (mean distance <= 0.03 PW, worst point <= 0.08 PW) and covers >= 60 % of the drawn crease. Depth x 0.6: printed only.
// L   three-layer rules still hold on v3 output: a line is "found" (solid, named) only when the module drew it solid (z >= limit);
//     every other major is a dashed faint guide with the "not clear in this photo" note (TH / EN / ZH) in the list; the share
//     card has no guide; screen and print keep the guide dashed and faint.
// P   photos never leave the device: the module has no network, storage or messaging call; the spike tools read photos only
//     through the eval-guard and refuse to write inside the repo.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const V3 = require(path.join(ROOT, "palm-v3-lines.js"));
const SYN = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "synth-hand.js"));
const TEX = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "textures.js"));
const X2 = require(path.join(ROOT, "tests", "fixtures", "palm-v3", "tex2.js"));
const REAL = require(path.join(ROOT, "tests", "fixtures", "palm-v3", "synth-real.js"));
const { recordingCtx, strokesOn, catmull, polyDist } = require("./palm-v2-kit.js");

const MAJ = ["heart", "head", "life"];
const LANGS = ["th", "en", "zh"];
const UNCLEAR = { th: "ไม่ชัดในภาพนี้", en: "Not clear in this photo", zh: "此照片中不清楚" };
const NOT_FOUND = { th: "ไม่พบในภาพ", en: "Not found in this photo", zh: "照片中未找到" };
const metric = (P, asp) => P.map(q => [q[0], q[1] * asp]);
const solidOf = det => Object.keys(det.lines).filter(id => det.lines[id] && det.lines[id].solid);

function nullCases() {
  const out = [];
  for (const kind of TEX.KINDS) for (const seed of [1, 2, 3]) for (const side of ["right", "left"]) out.push({ name: `${kind} s${seed} ${side}`, make: () => {
    const h = SYN.synthHand({ lines: [], seed, side, distract: kind === "skinCreases" ? 140 : 0 });
    TEX.apply(h, TEX.texture(kind, h.w, h.h, seed * 3 + (side === "left" ? 1 : 0), h.pw)); return h; } });
  const fx = ["fingerprint", "noise8", "motion", "lighting", "hardShadow+noise8", "darkSkin", "darkSkin+lowContrast+noise8"];
  for (const f of fx) for (const seed of [4, 5]) for (const side of ["right", "left"]) out.push({ name: `${f} s${seed} ${side}`, make: () => {
    const h = SYN.synthHand({ lines: [], seed, side, distract: 140 }); X2.applyAll(h, f.split("+"), seed + (side === "left" ? 50 : 0)); return h; } });
  for (const seed of [6, 7, 8]) for (const side of ["right", "left"]) out.push({ name: `synth-real texture s${seed} ${side}`, make: () => REAL.synthReal({ seed, side, noCreases: true }) });
  return out;
}

test("N null control: crease-free textures, no line drawn solid (z below the fixed limit), nothing found in the v2 state", () => {
  assert.ok(typeof V3.Z_LIMIT === "number" && V3.Z_LIMIT > 0, "the module exposes one fixed z limit");
  const bad = [], zmax = {};
  for (const c of nullCases()) {
    const h = c.make(), det = V3.detect(h.rgba, h.w, h.h, h.hand, {});
    for (const [id, L] of Object.entries(det.lines)) {
      if (!L) continue;
      if (typeof L.z === "number") zmax[id] = Math.max(zmax[id] == null ? -1e9 : zmax[id], L.z);
      if (L.solid) bad.push(`${c.name}: ${id} drawn solid (z ${L.z})`);
      if (L.solid !== (L.z >= det.zLimit)) bad.push(`${c.name}: ${id} solid flag ${L.solid} disagrees with z ${L.z} vs limit ${det.zLimit}`);
    }
    const st = PV.newState({ side: h.side, school: "thai" });
    PV.applyDetection(st, V3.toV2(det));
    for (const id of PV.LINES) if (st.lines[id].status === "found") bad.push(`${c.name}: ${id} FOUND in the v2 state`);
  }
  console.log("null control, max z per line (synthetic):", JSON.stringify(Object.fromEntries(Object.entries(zmax).map(([k, v]) => [k, Math.round(v * 100) / 100]))));
  // report only: long dark strokes that are not creases (hair, tattoo)
  const rep = {};
  for (const f of ["hair", "tattoo"]) for (const seed of [4, 5]) for (const side of ["right", "left"]) {
    const h = SYN.synthHand({ lines: [], seed, side, distract: 140 }); X2.applyAll(h, [f], seed + (side === "left" ? 50 : 0));
    const det = V3.detect(h.rgba, h.w, h.h, h.hand, {}); rep[f] = (rep[f] || 0) + solidOf(det).length;
  }
  console.log("report only, solid lines on hair / tattoo strokes (not crease-free, synthetic):", JSON.stringify(rep));
  assert.deepEqual(bad, []);
});

function crease(h, id, det, F) {
  const L = det.lines[id], T = metric(h.truth[id], F.asp), D = metric(catmull(L.cp, 120), F.asp);
  const d = D.map(p => polyDist(p, T)), mean = d.reduce((s, v) => s + v, 0) / d.length, worst = Math.max(...d);
  const cover = T.filter(p => polyDist(p, D) <= 0.04).length / T.length;
  return { mean, worst, cover };
}

test("S realistic shallow creases: heart, head, life drawn solid in >= 10/12 hands, on the crease (mean <= 0.03, worst <= 0.08 PW), >= 60 % covered", () => {
  const cnt = { heart: 0, head: 0, life: 0 }, bad = [], dist = [];
  let n = 0;
  for (const seed of [21, 22, 23, 24, 25, 26]) for (const side of ["right", "left"]) {
    const h = REAL.synthReal({ seed, side }), det = V3.detect(h.rgba, h.w, h.h, h.hand, {}), F = PV.frameFromHand(h.hand);
    n++;
    for (const id of MAJ) {
      const L = det.lines[id];
      if (!L || !L.solid) continue;
      cnt[id]++;
      const m = crease(h, id, det, F); dist.push(m.mean);
      if (m.mean > 0.03 || m.worst > 0.08 || m.cover < 0.6) bad.push(`seed ${seed} ${side} ${id}: mean ${m.mean.toFixed(3)} worst ${m.worst.toFixed(3)} cover ${m.cover.toFixed(2)}`);
    }
  }
  for (const id of MAJ) if (cnt[id] < 10) bad.push(`${id} drawn solid in ${cnt[id]}/${n} hands (< 10)`);
  console.log("realistic creases drawn solid (synthetic):", JSON.stringify(cnt), "of", n, "mean distance", dist.length ? (dist.reduce((s, v) => s + v, 0) / dist.length).toFixed(4) : "-");
  // report only: fainter creases (depth x 0.6)
  const faint = { heart: 0, head: 0, life: 0 };
  for (const seed of [27, 28, 29]) for (const side of ["right", "left"]) {
    const h = REAL.synthReal({ seed, side, depthScale: 0.6 }), det = V3.detect(h.rgba, h.w, h.h, h.hand, {});
    for (const id of MAJ) if (det.lines[id] && det.lines[id].solid) faint[id]++;
  }
  console.log("report only, depth x 0.6 drawn solid (synthetic):", JSON.stringify(faint), "of 6");
  assert.deepEqual(bad, []);
});

function checkLayers(st, where) {
  for (const target of ["screen", "print", "share"]) for (const lang of LANGS) {
    const { ctx, strokes, texts } = recordingCtx();
    ctx.canvas.dataset.pv2Target = target;
    const toPx = q => [100 + q[0] * 400, 80 + q[1] * 400];
    PV.drawLineLayer(ctx, st, target, { toPx, lang, scale: 1 });
    const G = PV.guides(st.school);
    for (const id of MAJ) {
      const L = st.lines[id], onGuide = strokesOn(strokes, catmull(G[id].cp.map(toPx)), 10);
      if (L.status === "found") {
        const on = strokesOn(strokes, catmull(L.cp.map(toPx)), 6);
        assert.ok(on.some(s => s.dash.length === 0 && s.alpha >= 0.8), `${where} ${target} ${lang}: ${id} found but not solid`);
        assert.ok(texts.some(t => t.text.includes(PV.lineName(id, st.school, lang)) || t.text.includes(String(PV.LINES.indexOf(id) + 1))), `${where}: ${id} has no label`);
      } else {
        for (const s of onGuide) { assert.ok(s.dash.length > 0, `${where} ${target}: ${id} guide solid`); assert.ok(s.alpha <= 0.5 + 1e-9, `${where} ${target}: ${id} guide alpha ${s.alpha}`); }
        if (target === "share") assert.equal(onGuide.length, 0, `${where}: ${id} guide on the share card`);
        else assert.ok(texts.some(t => t.text.includes(NOT_FOUND[lang])), `${where} ${target} ${lang}: no guide label`);
      }
    }
    if (target === "share") assert.equal(strokes.filter(s => s.dash.length > 0).length, 0, `${where}: dashed stroke on the share card`);
  }
  for (const lang of LANGS) {
    const rows = PV.listRows(st, lang);
    for (const id of MAJ) {
      const row = rows.find(r => r.id === id);
      if (st.lines[id].status !== "found") assert.ok(row.note.includes(UNCLEAR[lang]), `${where} ${lang}: ${id} below the limit without "${UNCLEAR[lang]}"`);
    }
  }
}

test("L three-layer rules on v3 output: found only when solid; other majors dashed guides marked 'not clear in this photo' (TH/EN/ZH)", () => {
  const cases = [["real s31 right", REAL.synthReal({ seed: 31, side: "right" })], ["real s32 left", REAL.synthReal({ seed: 32, side: "left" })],
    ["texture s33", REAL.synthReal({ seed: 33, side: "right", noCreases: true })], ["faint s34", REAL.synthReal({ seed: 34, side: "left", depthScale: 0.4 })]];
  for (const [where, h] of cases) for (const school of PV.SCHOOLS) {
    const det = V3.detect(h.rgba, h.w, h.h, h.hand, {}), v2 = V3.toV2(det), st = PV.newState({ side: h.side, school });
    PV.applyDetection(st, v2);
    for (const id of MAJ) {
      const solid = !!(det.lines[id] && det.lines[id].solid);
      assert.equal(st.lines[id].status === "found", solid, `${where} ${school}: ${id} found=${st.lines[id].status === "found"} but solid=${solid}`);
      if (solid) assert.ok(det.lines[id].z >= det.zLimit, `${where}: ${id} solid below the limit`);
    }
    checkLayers(st, `${where} ${school}`);
  }
});

test("P photos never leave the device: no network / storage / messaging in the module; spike tools use the eval-guard and write outside the repo", () => {
  const src = fs.readFileSync(path.join(ROOT, "palm-v3-lines.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/, /importScripts/, /https?:\/\//, /localStorage/, /sessionStorage/, /indexedDB/, /postMessage/, /\bnavigator\b/, /document\.cookie/]) {
    assert.ok(!re.test(src), `palm-v3-lines.js contains ${re}`);
  }
  const tools = fs.readdirSync(path.join(ROOT, "tools")).filter(f => /^palm-v3-.*\.mjs$/.test(f));
  assert.ok(tools.length >= 1);
  for (const f of tools) {
    const t = fs.readFileSync(path.join(ROOT, "tools", f), "utf8");
    for (const re of [/\bfetch\s*\(/, /https?:\/\/(?!127\.0\.0\.1)/, /\bcurl\b/, /XMLHttpRequest/, /sendBeacon/]) assert.ok(!re.test(t.replace(/^\s*\/\/.*$/gm, "")), `tools/${f} contains ${re}`);
    if (f !== "palm-v3-io.mjs" && /readJpeg\(|owner-photos/.test(t)) {
      assert.ok(/assertLocked\(/.test(t), `tools/${f} reads photos without the eval-guard`);
      assert.ok(/must be outside the repo|startsWith\(repo\)/.test(t), `tools/${f} does not refuse output inside the repo`);
    }
  }
});
