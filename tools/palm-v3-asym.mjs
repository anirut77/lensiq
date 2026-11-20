#!/usr/bin/env node
// tools/palm-v3-asym.mjs — palm v3 DEVELOPMENT diagnostic (numbers only, never an accuracy figure): the wall asymmetry of the
// MFRAT valley (|left wall - right wall| / depth) at the strongest pixel within +-0.02 PW of the spike agent's own dev trace on the
// owner's development photos. Photos are read through the eval-guard, never copied, never uploaded, never modified, never viewed;
// output is numbers on stdout only.
//   node tools/palm-v3-asym.mjs --lm <landmarks.json> --trace <trace.json> <photo ...>
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { assertFreeSpace } from "./disk-guard.mjs";
import { readJpeg } from "./palm-v3-io.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const V3 = createRequire(import.meta.url)(join(repo, "palm-v3-lines.js")), I = V3._internal;
const A = process.argv.slice(2), opt = k => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const photos = A.filter((a, i) => !a.startsWith("--") && !A[i - 1]?.startsWith("--"));
const LM = JSON.parse(readFileSync(opt("--lm"))), TR = JSON.parse(readFileSync(opt("--trace")));
if (resolve(opt("--lm")).startsWith(repo) || resolve(opt("--trace")).startsWith(repo)) { console.error("dev data must be outside the repo"); process.exit(2); }
assertLocked("palm__owner-photos", photos);
assertFreeSpace({ label: "tools/palm-v3-asym.mjs" });
for (const name of photos) {
  const key = basename(name), im = readJpeg(join(phaseDir("palm__owner-photos"), name)), M = V3.prepare(im.rgba, im.w, im.h, LM.photos[key].hand, V3.CFG.sMaj, "mfrat").M;
  const vals = [], r = Math.max(2, Math.round(0.02 * M.s));
  for (const id of ["heart", "head", "life"]) {
    const P = I.resample(TR[key][id].map(q => [(q[0] - V3.CFG.u0) * M.s, (q[1] - V3.CFG.v0) * M.s * M.asp]), 60);
    for (const p of P) { let bi = -1, be = -1; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = Math.round(p[0] + dx), y = Math.round(p[1] + dy);
      if (x < 0 || y < 0 || x >= M.w || y >= M.h) continue; const i = y * M.w + x; if (M.E[i] > be) { be = M.E[i]; bi = i; } } if (bi >= 0) vals.push(M.A[bi]); }
  }
  vals.sort((a, b) => a - b); const q = f => vals[Math.floor(f * (vals.length - 1))].toFixed(2);
  console.log(key, "asym on dev-trace crease pixels (DEV only): p25", q(0.25), "median", q(0.5), "p75", q(0.75), "p90", q(0.9), "n", vals.length);
}
