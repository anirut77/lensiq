#!/usr/bin/env node
// tools/face-capture-eval.mjs — per-condition numbers for the face-capture guide (owner order 2026-11-16, item A) on the
// LOCKED synthetic set in ~/LENSIQ-field/evals/face-capture/ (tools/eval-guard.mjs refuses an unlocked or changed set).
//   node tools/face-capture-eval.mjs           table: group / case / expected / got / eye distance share / pixel numbers
// Source of every number: synthetic (face-model.js; no person, no photo).
import { createRequire } from "node:module";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { assertLocked, phaseDir } from "./eval-guard.mjs";

const require = createRequire(import.meta.url);
const PHASE = "face-capture", DIR = phaseDir(PHASE);
const FILES = ["tests/fixtures/face-capture/set.json", "tests/fixtures/face-capture/face-model.js"];
assertLocked(PHASE, FILES);
const SET = JSON.parse(readFileSync(join(DIR, FILES[0]), "utf8"));
const M = require(join(DIR, FILES[1]));
const C = require("../lensiq-facecap.js");

const groups = {};
for (const c of SET.cases) {
  const g = groups[c.group] = groups[c.group] || { n: 0, ok: 0, rows: [] };
  let got, extra = "";
  if (c.group === "pixels") {
    const px = C.pixelChecks(M.render({ W: c.W, H: c.H, pts: c.pts, ...c.render }), c.pts);
    const pass = Object.entries(c.expectPx).every(([k, v]) => px[k] === v);
    got = pass ? "as expected" : "MISMATCH"; extra = `face ${px.faceLuma} bg ${px.bgLuma} glare ${px.glareFrac} blur ${px.blurRatio}`;
    g.n++; if (pass) g.ok++;
  } else {
    got = C.classify({ pts: c.pts, n: c.n, W: c.W, H: c.H, px: c.px || null, moving: !!c.moving });
    if (c.pts) extra = "eye distance " + (C.measure(c.pts, c.W, c.H).iodFrac * 100).toFixed(1) + " % of the width";
    g.n++; if (got === c.expect) g.ok++;
  }
  g.rows.push(`  ${c.id.padEnd(44)} ${String(c.expect || "").padEnd(9)} ${String(got).padEnd(11)} ${extra}`);
}
console.log(`face-capture fixed set (${SET.cases.length} cases, ${SET.source})`);
for (const [k, g] of Object.entries(groups)) { console.log(`${k}: ${g.ok}/${g.n}`); if (process.argv.includes("--all")) console.log(g.rows.join("\n")); }
