#!/usr/bin/env node
// tools/palm-v3-compare.mjs — palm v3 spike, trial-3 capture comparison (owner request 2026-11-20), DEVELOPMENT ONLY: never an
// accuracy figure. Per owner development photo: file size, pixels, EXIF exposure (parsed locally), capture metrics as in
// tools/palm-trial2.mjs (ROI 256 px palm width, u 0-1, v 0.05-0.95: sharpness S = Var(LoG sigma 1 of Y) / mean(Y)^2, median Y,
// clipped %, hand side from geometry), then crease strength along the spike agent's OWN dev trace (outside the repo) for
//   - the trial-2 ridge filter (palm-v2-detect.js R map, product working scale: palm <= 360 px, s = 240), and
//   - the v3 energy (palm-v3-lines.js, MFRAT, s = 224),
// with signal-to-background (crease vs 0.05 / 0.08 PW beside it). Photos are read through the eval-guard, never copied, never
// uploaded, never modified; output goes outside the repo.
//   node tools/palm-v3-compare.mjs --lm <landmarks.json> --trace <trace.json> --out <result.json> <photo ...>
import { createRequire } from "node:module";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { assertFreeSpace } from "./disk-guard.mjs";
import { readJpeg, exifBasics } from "./palm-v3-io.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const PV = require(join(repo, "palm-v2.js")), V3 = require(join(repo, "palm-v3-lines.js"));
const A = process.argv.slice(2), opt = k => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const photos = A.filter((a, i) => !a.startsWith("--") && !A[i - 1]?.startsWith("--"));
const out = opt("--out");
if (!out || resolve(out).startsWith(repo)) { console.error("--out must be outside the repo"); process.exit(2); }
const LM = JSON.parse(readFileSync(opt("--lm"))), TR = JSON.parse(readFileSync(opt("--trace")));
assertLocked("palm__owner-photos", photos);
assertFreeSpace({ label: "tools/palm-v3-compare.mjs" });
const MAJ = ["heart", "head", "life"];
const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1], mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };

/** area-average resize by factor f (< 1) */
function shrink(im, f) {
  const W = Math.round(im.w * f), H = Math.round(im.h * f), o = new Uint8ClampedArray(W * H * 4), k = 1 / f;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = Math.floor(x * k), x1 = Math.min(im.w, Math.floor((x + 1) * k)), y0 = Math.floor(y * k), y1 = Math.min(im.h, Math.floor((y + 1) * k));
    let r = 0, g = 0, b = 0, n = 0; for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * im.w + xx) * 4; r += im.rgba[i]; g += im.rgba[i + 1]; b += im.rgba[i + 2];
        n++; }
    const j = (y * W + x) * 4; o[j] = r / n; o[j + 1] = g / n; o[j + 2] = b / n; o[j + 3] = 255;
  }
  return { w: W, h: H, rgba: o };
}
const scaleHand = (h, f) => { const m = p => p && [p[0] * f, p[1] * f]; return { source: h.source, wrist: m(h.wrist), mcp: { index: m(h.mcp.index), middle: m(h.mcp.middle), ring: m(h.mcp.ring),
    pinky: m(h.mcp.pinky) }, tip: {} }; };
/** capture metrics as trial-2 (B2.3 ROI), sampled from the full-resolution photo by area averaging */
function capture(im, F) {
  const RW = 256, RH = Math.max(8, Math.round(0.9 * F.asp * 256)), Y = new Float32Array(RW * RH), clip = new Uint8Array(RW * RH), k = Math.max(1, Math.round(F.pw / 256));
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    let s = 0, n = 0, c = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const p = F.toImg([(x + (i + 0.5) / k) / RW, 0.05 + 0.9 * (y + (j + 0.5) / k) / RH]), X = Math.floor(p[0]), Yy = Math.floor(p[1]);
      if (X < 0 || Yy < 0 || X >= im.w || Yy >= im.h) continue; const o = (Yy * im.w + X) * 4; s += 0.299 * im.rgba[o] + 0.587 * im.rgba[o + 1] + 0.114 * im.rgba[o + 2]; n++;
      if (im.rgba[o] >= 250 || im.rgba[o + 1] >= 250 || im.rgba[o + 2] >= 250) c++; }
    Y[y * RW + x] = n ? s / n : 0; clip[y * RW + x] = c > n / 2 ? 1 : 0;
  }
  const gk = [0.0545, 0.2442, 0.4026, 0.2442, 0.0545], G1 = new Float32Array(RW * RH), G2 = new Float32Array(RW * RH);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { let s = 0; for (let i = -2; i <= 2; i++) s += gk[i + 2] * Y[y * RW + Math.min(RW - 1, Math.max(0, x + i))]; G1[y * RW + x] = s; }
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { let s = 0; for (let i = -2; i <= 2; i++) s += gk[i + 2] * G1[Math.min(RH - 1, Math.max(0, y + i)) * RW + x]; G2[y * RW + x] = s; }
  let ls = 0, ls2 = 0, ln = 0, m = 0;
  for (let y = 3; y < RH - 3; y++) for (let x = 3; x < RW - 3; x++) { const i = y * RW + x, L = G2[i - 1] + G2[i + 1] + G2[i - RW] + G2[i + RW] - 4 * G2[i]; ls += L; ls2 += L * L; ln++; }
  for (const v of Y) m += v; m /= Y.length;
  let nc = 0; for (const v of clip) nc += v;
  const ys = Array.from(Y).sort((p, q) => p - q);
  return { Sx1e4: +((ls2 / ln - (ls / ln) ** 2) / (m * m) * 1e4).toFixed(2), medianY: Math.round(ys[ys.length >> 1]), p5: Math.round(ys[Math.floor(0.05 * ys.length)]),
      p95: Math.round(ys[Math.floor(0.95 * ys.length)]), clippedPct: +(nc / clip.length * 100).toFixed(2) };
}
/** crease strength along the dev trace on a map {E, w, h, s, asp, u0, v0}: median of the max within +-0.02 PW of the trace;
    background = same at 0.05 and 0.08 PW either side; SBR = median crease / median background, d' = (mean c - mean b) / sd b */
function along(M, trace) {
  const toPx = q => [(q[0] - M.u0) * M.s, (q[1] - M.v0) * M.s * M.asp], r = Math.max(2, Math.round(0.02 * M.s)), C = [], B = [], per = {};
  for (const id of MAJ) {
    const P = V3._internal.resample(trace[id].map(toPx), 80), c = [];
    for (let k = 1; k < P.length - 1; k++) {
      const tx = P[k + 1][0] - P[k - 1][0], ty = P[k + 1][1] - P[k - 1][1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
      const mx = off => { let m = 0; for (let o = -r; o <= r; o++) { const x = Math.round(P[k][0] + nx * (off + o)), y = Math.round(P[k][1] + ny * (off + o));
          if (x >= 0 && y >= 0 && x < M.w && y < M.h) m = Math.max(m, M.E[y * M.w + x]); } return m; };
      const v = mx(0); c.push(v); C.push(v);
      for (const f of [-0.08, -0.05, 0.05, 0.08]) B.push(mx(Math.round(f * M.s)));
    }
    per[id] = +med(c).toFixed(4);
  }
  return { alongMedian: per, sbr: +(med(C) / (med(B) || 1e-9)).toFixed(2), dprime: +((mean(C) - mean(B)) / (sd(B) || 1e-9)).toFixed(2) };
}
const res = { note: "DEV-ONLY trial-3 comparison on the owner's development photos; never an accuracy figure", photos: {} };
for (const name of photos) {
  const file = join(phaseDir("palm__owner-photos"), name), key = basename(name), L = LM.photos[key], hand = L.hand, im = readJpeg(file), F = PV.frameFromHand(hand);
  let side = null;
  if (L.pts) { const P = L.pts, a = [P[5][0] - P[17][0], P[5][1] - P[17][1]], b = [P[9][0] - P[0][0], P[9][1] - P[0][1]]; side = (a[0] * b[1] - a[1] * b[0]) < 0 ? "right" : "left"; }
  else { const a = [hand.mcp.index[0] - hand.mcp.pinky[0], hand.mcp.index[1] - hand.mcp.pinky[1]], b = [hand.mcp.middle[0] - hand.wrist[0], hand.mcp.middle[1] - hand.wrist[1]];
      side = (a[0] * b[1] - a[1] * b[0]) < 0 ? "right" : "left"; }
  // trial-2 ridge filter at the product working scale
  const f = Math.min(1, 360 / F.pw), small = shrink(im, f), det = PV.detect(small.rgba, small.w, small.h, scaleHand(hand, f), { school: "thai" }), D = det._D;
  const Rv = []; for (let i = 0; i < D.R.length; i++) if (D.R[i] > 0) Rv.push(D.R[i]); Rv.sort((p, q) => p - q);
  const v2 = along({ E: D.R, w: D.w, h: D.h, s: D.s, asp: D.asp, u0: PV.DET.u0, v0: PV.DET.v0 }, TR[key]);
  const P3 = V3.prepare(im.rgba, im.w, im.h, hand, V3.CFG.sMaj, "mfrat"), M = P3.M, v3 = along(Object.assign({ u0: V3.CFG.u0, v0: V3.CFG.v0 }, M), TR[key]);
  const lines = V3.fitLines(M, MAJ, 1, {});
  res.photos[key] = { path: name, bytes: statSync(file).size, pixels: `${im.w}x${im.h}`, exif: exifBasics(readFileSync(file)), side,
      sideSource: L.pts ? "landmark geometry" : "manual taps (cross product only)",
    palmWidthPx: Math.round(F.pw), asp: +F.asp.toFixed(3), capture: capture(im, F), v2found: Object.fromEntries(Object.entries(det.lines).filter(([id, l]) => l.conf >= PV.threshold(id)).map(([id,
        l]) => [id, l.conf])), v2confMaj: Object.fromEntries(MAJ.map(id => [id, det.lines[id].conf])),
    ridgeV2: Object.assign({ p99: +Rv[Math.floor(0.99 * Rv.length)].toFixed(3) }, v2),
    mfratV3: v3, v3z: Object.fromEntries(MAJ.map(id => [id, lines[id].z])) };
  console.log(key, JSON.stringify(res.photos[key]));
}
writeFileSync(out, JSON.stringify(res, null, 1));
