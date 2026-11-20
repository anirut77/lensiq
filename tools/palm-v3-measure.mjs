#!/usr/bin/env node
// tools/palm-v3-measure.mjs — palm v3 spike (owner order 2026-11-20), DEVELOPMENT ONLY. Measures crease contrast and width on
// the owner's development photos along the spike agent's own dev trace (stored outside the repo), per colour channel (R, G, B,
// Lab-L), to (a) choose the channel and (b) set the synthetic crease generator (step 9). NEVER an accuracy figure; the photos
// are read from the locked folder after the eval-guard check, never copied, never uploaded, never modified.
//   node tools/palm-v3-measure.mjs --lm <landmarks.json> --trace <trace.json> --out <result.json> <photo ...>
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { assertFreeSpace } from "./disk-guard.mjs";
import { readJpeg } from "./palm-v3-io.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PV = createRequire(import.meta.url)(join(repo, "palm-v2.js"));
const A = process.argv.slice(2), opt = k => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const photos = A.filter((a, i) => !a.startsWith("--") && !A[i - 1]?.startsWith("--"));
const LM = JSON.parse(readFileSync(opt("--lm"))), TR = JSON.parse(readFileSync(opt("--trace"))), out = opt("--out");
if (resolve(out).startsWith(repo)) { console.error("--out must be outside the repo"); process.exit(2); }
assertLocked("palm__owner-photos", photos);
assertFreeSpace({ label: "tools/palm-v3-measure.mjs" });

const S = 512; // px per palm width (minor scale): a crease is several px wide here
const srgb = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const labL = (r, g, b) => { const Y = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
const CH = { R: (r, g, b) => r, G: (r, g, b) => g, B: (r, g, b) => b, L: labL };
const result = { note: "DEV-ONLY: owner development photos + the spike agent's own trace; never an accuracy figure", s: S, photos: {} };
for (const name of photos) {
  const im = readJpeg(join(phaseDir("palm__owner-photos"), name)), F = PV.frameFromHand(LM.photos[name].hand);
  const samp = (u, v, ch) => { const p = F.toImg([u, v]), x = p[0] - 0.5, y = p[1] - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const px = (X, Y) => { const i = (Y * im.w + X) * 4; return CH[ch](im.rgba[i], im.rgba[i + 1], im.rgba[i + 2]); };
    return (px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx) * (1 - fy) + (px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx) * fy; };
  const per = {};
  for (const [id, cp] of Object.entries(TR[name])) {
    const C = PV.catmull(cp, 120), asp = F.asp, res = {};
    for (const shift of [0, 30, -30]) for (const ch of Object.keys(CH)) {
      const cons = [], cnr = [], prof = new Float64Array(41); let np = 0;
      for (let k = 2; k < C.length - 2; k++) {
        // normal in metric (u, v*asp) space, step = 1 px at S px / PW
        const tx = C[k + 1][0] - C[k - 1][0], ty = (C[k + 1][1] - C[k - 1][1]) * asp, tl = Math.hypot(tx, ty), nx = -ty / tl, ny = tx / tl;
        const at = o => samp(C[k][0] + nx * (o + shift) / S, C[k][1] + ny * (o + shift) / S / asp, ch);
        // crease centre = minimum of the profile smoothed with a 1.5 px Gaussian within +-4 px of the trace (trace error);
        // the RAW profile is then read around that centre (no per-sample noise minimum)
        let best = 1e9, bo = 0; for (let o = -4; o <= 4; o += 0.5) { let a = 0, wsum = 0; for (let d = -4; d <= 4; d += 0.5) { const wt = Math.exp(-d * d / 4.5); a += wt * at(o + d); wsum += wt; } if (a / wsum < best) { best = a / wsum; bo = o; } }
        best = at(bo);
        const side = []; for (let o = 8; o <= 20; o += 1) { side.push(at(bo + o), at(bo - o)); }
        side.sort((a, b) => a - b); const skin = side[side.length >> 1], mad = side.map(v => Math.abs(v - skin)).sort((a, b) => a - b)[side.length >> 1] * 1.4826 || 1e-6;
        cons.push((skin - best) / skin); cnr.push((skin - best) / mad);
        for (let o = -20; o <= 20; o++) prof[o + 20] += at(bo + o) / skin; np++;
      }
      const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
      for (let i = 0; i < 41; i++) prof[i] /= np;
      // width: full width at half the depth of the mean profile (relative to its 8-20 px shoulders)
      const sh = (prof.slice(0, 13).reduce((a, b) => a + b, 0) + prof.slice(28).reduce((a, b) => a + b, 0)) / 26, depth = sh - prof[20], half = sh - depth / 2;
      let l = 20, r = 20; while (l > 0 && prof[l] < half) l--; while (r < 40 && prof[r] < half) r++;
      const fl = l + (half - prof[l]) / (prof[l + 1] - prof[l] || 1e-9), fr = r - (half - prof[r]) / (prof[r - 1] - prof[r] || 1e-9);
      res[shift ? ch + (shift > 0 ? "_null+30" : "_null-30") : ch] = { contrastMed: +med(cons).toFixed(4), contrastP25: +cons.slice().sort((p, q) => p - q)[cons.length >> 2].toFixed(4), cnrMed: +med(cnr).toFixed(2),
        meanProfileDepth: +depth.toFixed(4), fwhmPx: +(fr - fl).toFixed(2), fwhmPW: +((fr - fl) / S).toFixed(4), sigmaPW: +((fr - fl) / 2.355 / S).toFixed(4),
        profile: Array.from(prof, v => +v.toFixed(4)) };
    }
    per[id] = res;
  }
  result.photos[name] = per;
  console.log(name);
  for (const [id, r] of Object.entries(per)) console.log("  ", id.padEnd(6), Object.entries(r).filter(([c]) => !c.includes("null")).map(([c, v]) => `${c}: con ${v.contrastMed} (p25 ${v.contrastP25}) cnr ${v.cnrMed} (null ${r[c + "_null+30"].cnrMed}/${r[c + "_null-30"].cnrMed}, depth ${r[c + "_null+30"].meanProfileDepth}/${r[c + "_null-30"].meanProfileDepth}) depth ${v.meanProfileDepth} fwhm ${v.fwhmPW} PW`).join(" | "));
}
writeFileSync(out, JSON.stringify(result, null, 1));
