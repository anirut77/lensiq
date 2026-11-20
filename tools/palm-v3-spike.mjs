#!/usr/bin/env node
// tools/palm-v3-spike.mjs — palm v3 line-finder SPIKE (owner order 2026-11-20), DEVELOPMENT ONLY. Runs palm-v3-lines.js stage by
// stage on the owner's daylight development photos and writes one heatmap / overlay per stage and photo to
// ~/Desktop/LENSIQ-review/palm/v3/<stage>/ (local only), plus spike.json. The signal-to-background numbers use the spike agent's
// OWN dev trace (stored outside the repo, labelled dev-only): never an accuracy figure. The photos are read from the locked folder
// after the eval-guard check, never copied, never uploaded, never modified.
//   node tools/palm-v3-spike.mjs --lm <landmarks.json> --trace <trace.json> [--out <dir>] <photo ...>
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { assertFreeSpace } from "./disk-guard.mjs";
import { readJpeg, writePng, heat, greyRgba, drawPath, dot } from "./palm-v3-io.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const V3 = require(join(repo, "palm-v3-lines.js")), I = V3._internal;
const A = process.argv.slice(2), opt = k => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const photos = A.filter((a, i) => !a.startsWith("--") && !A[i - 1]?.startsWith("--"));
const OUT = opt("--out") || join(homedir(), "Desktop", "LENSIQ-review", "palm", "v3");
if (resolve(OUT).startsWith(repo)) { console.error("--out must be outside the repo"); process.exit(2); }
const LM = JSON.parse(readFileSync(opt("--lm"))), TR = JSON.parse(readFileSync(opt("--trace")));
assertLocked("palm__owner-photos", photos);
assertFreeSpace({ label: "tools/palm-v3-spike.mjs" });
const dir = d => { const p = join(OUT, d); mkdirSync(p, { recursive: true }); return p; };
const METHODS = ["mfrat", "wld", "comp"], MAJ = ["heart", "head", "life"];
const COL = { heart: [255, 70, 70], head: [60, 190, 255], life: [90, 240, 90], fate: [255, 200, 0], sun: [255, 140, 0], mercury: [200, 120, 255], bracelet: [255, 255, 255], girdle: [255, 100,
    200] };
const report = { note: "DEV-ONLY spike on the owner's development photos (palm v3). No accuracy figure. SBR uses the spike agent's own dev trace.", zLimit: V3.Z_LIMIT, photos: {} };

/** dev trace (u, v) -> ROI px of map M */
const toPx = (M, q) => [(q[0] - V3.CFG.u0) * M.s, (q[1] - V3.CFG.v0) * M.s * M.asp];
/** signal-to-background on the traced creases: crease = max energy within +-r px of the trace (trace error);
    background = the same max taken at 8-20 px either side; SBR = median crease / median background; d' = (mean c - mean b) / sd b */
function sbr(M, trace) {
  const c = [], b = [], r = Math.max(2, Math.round(0.012 * M.s));
  for (const id of MAJ) {
    const P = I.resample(trace[id].map(q => toPx(M, q)), 80);
    for (let k = 1; k < P.length - 1; k++) {
      const tx = P[k + 1][0] - P[k - 1][0], ty = P[k + 1][1] - P[k - 1][1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
      const mx = off => { let m = 0; for (let o = -r; o <= r; o++) { const x = Math.round(P[k][0] + nx * (off + o)), y = Math.round(P[k][1] + ny * (off + o));
          if (x >= 0 && y >= 0 && x < M.w && y < M.h && M.inner[y * M.w + x]) m = Math.max(m, M.E[y * M.w + x]); } return m; };
      c.push(mx(0));
      for (const off of [-Math.round(0.08 * M.s), -Math.round(0.05 * M.s), Math.round(0.05 * M.s), Math.round(0.08 * M.s)]) b.push(mx(off));
    }
  }
  const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1], mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
  return { sbrMedian: +(med(c) / (med(b) || 1e-9)).toFixed(2), dprime: +((mean(c) - mean(b)) / (sd(b) || 1e-9)).toFixed(2), creaseMed: +med(c).toFixed(3), backMed: +med(b).toFixed(3),
      nC: c.length, nB: b.length };
}
function overlayBase(N, w, h) { return greyRgba(N, w, h, 0, 255); }
function drawUV(img, M, pts, col, width, dash) { drawPath(img, M.w, M.h, pts.map(q => toPx(M, q)), col, width, dash); }

for (const name of photos) {
  const stem = basename(name).replace(/\.jpg$/i, ""), im = readJpeg(join(phaseDir("palm__owner-photos"), name)), hand = LM.photos[basename(name)].hand, trace = TR[basename(name)],
      rep = { methods: {} };
  const t0 = Date.now();
  // 1-2: ROI + normalisation at both scales
  for (const s of [V3.CFG.sMaj, V3.CFG.sMin]) {
    const F = I.frameFromHand(hand), R = I.roi(im.rgba, im.w, im.h, F, s), N = I.normalise(R);
    const roiImg = greyRgba(R.g, R.w, R.h, 40, 220); for (let i = 0; i < R.w * R.h; i++) if (!R.mask[i]) { roiImg[i * 4] *= 0.4; roiImg[i * 4 + 1] *= 0.4; roiImg[i * 4 + 2] = 120; }
    writePng(join(dir("1-roi"), `${stem}-roi${s}.png`), R.w, R.h, roiImg);
    writePng(join(dir("2-normalise"), `${stem}-norm${s}.png`), R.w, R.h, overlayBase(N, R.w, R.h));
  }
  // 3: energy per method, SBR on the dev trace; 5: fit overlays per method; 6: null per method
  for (const method of METHODS) {
    const P = V3.prepare(im.rgba, im.w, im.h, hand, V3.CFG.sMaj, method), M = P.M;
    const q = []; for (let i = 0; i < M.E.length; i++) if (M.inner[i]) q.push(M.E[i]); q.sort((a, b) => a - b);
    writePng(join(dir("3-energy"), `${stem}-${method}.png`), M.w, M.h, heat(M.E, M.w, M.h, 0, q[Math.floor(q.length * 0.995)] || 1));
    const sb = sbr(M, trace);
    // 4: wrinkle removal by energy AND direction: energy kept only where the direction lies in the line's band (per zone)
    if (method === "mfrat") for (const id of MAJ) {
      const band = V3.PRIOR[id].band, E2 = new Float32Array(M.E.length);
      for (let i = 0; i < E2.length; i++) { const deg = M.D[i] * 180 / Math.PI; let ok = false; for (let k = -1; k <= 1; k++) { const x = deg + 180 * k;
          if (x >= band[0] - 10 && x <= band[1] + 10) ok = true; } E2[i] = ok ? M.E[i] : 0; }
      writePng(join(dir("4-direction"), `${stem}-${id}-band.png`), M.w, M.h, heat(E2, M.w, M.h, 0, q[Math.floor(q.length * 0.995)] || 1));
    }
    const lines = V3.fitLines(M, MAJ, 1, { transformNull: method === "mfrat" });
    const img = overlayBase(P.N, M.w, M.h);
    for (const id of MAJ) drawUV(img, M, I.resample(trace[id], 60), [255, 255, 0], 1, 3); // dev trace (yellow dotted)
    for (const id of MAJ) {
      const L = lines[id];
      drawUV(img, M, Array.from({ length: 50 }, (_, k) => I.bez(L.fit.map(p => [p[0], p[1]]), k / 49)), [200, 200, 200], 1, 6); // fitted Bezier, thin dashed
      const cp = L.cp || L.candidate; if (!cp) continue;
      const pts = L.path ? L.path.map(p => [V3.CFG.u0 + p[0] / M.s, V3.CFG.v0 + p[1] / (M.s * M.asp)]) : cp;
      drawUV(img, M, pts, COL[id], L.solid ? 3 : 2, L.solid ? 0 : 5); // refined path: solid only above the z limit
    }
    writePng(join(dir("5-fit"), `${stem}-${method}.png`), M.w, M.h, img);
    rep.methods[method] = { sbr: sb, lines: Object.fromEntries(MAJ.map(id => { const L = lines[id]; return [id, { z: L.z, solid: L.solid, score: L.score, nullMu: L.nullMu, nullSd: L.nullSd,
        nullP99: L.nullP99, rotNull: L.rotNull, extent: L.extent, features: L.features }]; })) };
    console.log(stem, method, "SBR", JSON.stringify(sb), MAJ.map(id => `${id} z=${lines[id].z}${lines[id].solid ? " SOLID" : ""}`).join(" "));
    if (method === "mfrat") console.log("   transformed-map null (mfrat):", MAJ.map(id => `${id}: ${lines[id].rotNull.map(r => r.kind + " " + r.z).join(", ")}`).join(" | "));
    // 4b guided tracing on this method's map: taps = the dev trace's end points (dev data)
    const g = overlayBase(P.N, M.w, M.h), gl = {};
    for (const id of MAJ) {
      const a = trace[id][0], b = trace[id][trace[id].length - 1], G = V3.guided(M, a, b);
      drawUV(g, M, I.resample(trace[id], 60), [255, 255, 0], 1, 3);
      if (G) { drawPath(g, M.w, M.h, G.path, COL[id], 2, 0);
        const T = I.resample(trace[id].map(p => toPx(M, p)), 200), d = G.path.map(p => Math.min(...T.map(t => Math.hypot(t[0] - p[0], t[1] - p[1])))).map(v => v / M.s);
        gl[id] = { meanEnergy: G.meanEnergy, devTraceMeanPW: +(d.reduce((s2, v) => s2 + v, 0) / d.length).toFixed(4), devTraceWorstPW: +Math.max(...d).toFixed(4) }; }
      dot(g, M.w, M.h, toPx(M, a), [255, 0, 255], 3); dot(g, M.w, M.h, toPx(M, b), [255, 0, 255], 3);
    }
    writePng(join(dir("4b-guided"), `${stem}-${method}.png`), M.w, M.h, g);
    rep.methods[method].guided = gl;
    console.log("   4b guided vs dev trace (PW, dev-only):", JSON.stringify(gl));
  }
  // 7: minors at the higher scale (mfrat)
  const det = V3.detect(im.rgba, im.w, im.h, hand, { minors: true, keepMaps: true });
  const B = det._min, img2 = overlayBase(B.N, B.M.w, B.M.h);
  for (const id of V3.MINORS) { const L = det.lines[id]; if (!L || !L.fit) continue; drawUV(img2, B.M, Array.from({ length: 50 }, (_, k) => I.bez(L.fit, k / 49)), [200, 200, 200], 1, 6);
    const cp = L.cp || L.candidate; if (cp) drawUV(img2, B.M, L.path ? L.path.map(p => [V3.CFG.u0 + p[0] / B.M.s, V3.CFG.v0 + p[1] / (B.M.s * B.M.asp)]) : cp, COL[id], L.solid ? 4 : 2,
        L.solid ? 0 : 8); }
  writePng(join(dir("7-minors"), `${stem}-minors.png`), B.M.w, B.M.h, img2);
  rep.minors = Object.fromEntries(V3.MINORS.map(id => [id, { z: det.lines[id].z, solid: det.lines[id].solid }])); rep.minorScale = det.sMin; rep.marriage = det.marriage;
  console.log(stem, "minors @", det.sMin, JSON.stringify(rep.minors), "full detect", det.ms, "ms");
  rep.ms = Date.now() - t0;
  report.photos[basename(name)] = rep;
}
writeFileSync(join(OUT, "spike.json"), JSON.stringify(report, null, 1));
console.log("wrote", join(OUT, "spike.json"));
