#!/usr/bin/env node
// tools/pc-tmt-ing-build.mjs — Product Check P9 travel mode: "products in Thailand with the same active ingredient(s)" table.
// Reads the committed TMT 2020-02-17 lookup table (vendor/pc-drugs/tmt-2563.json, CC BY, built by tools/pc-tmt-build.mjs)
// and writes vendor/pc-drugs/tmt-ing/: meta.json (source, credit, data date, dose forms, shard list) + one small shard per
// 2-character key prefix, built with LQPCTravel.ingFiles (the same function the unit test checks). The page loads only the
// shard of the ingredient set it needs, and only when the owner's switch window.LENSIQ_PC_THAI_EQUIV is on.
// No download, no network: TMT 2020 is the only licence-clear Thai product table (DRUG-DATA-SOURCES.md S2); the current
// TMT releases and the Thai FDA register wait for permission (L29, L13).
//
//   node tools/pc-tmt-ing-build.mjs            (re)write vendor/pc-drugs/tmt-ing/
//   node tools/pc-tmt-ing-build.mjs --check    exit 1 when the committed files differ from the build
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TV = createRequire(import.meta.url)("../lensiq-pc-travel.js");
const OUT = join(REPO, "vendor/pc-drugs/tmt-ing");
const tmt = JSON.parse(readFileSync(join(REPO, "vendor/pc-drugs/tmt-2563.json"), "utf8"));
const files = TV.ingFiles(tmt);

if (process.argv.includes("--check")) {
  const have = existsSync(OUT) ? readdirSync(OUT).sort() : [];
  const want = Object.keys(files).sort();
  const diff = want.filter(f => !have.includes(f) || readFileSync(join(OUT, f), "utf8") !== files[f]).concat(have.filter(f => !want.includes(f)));
  if (diff.length) { console.error(`tmt-ing: ${diff.length} file(s) differ, e.g. ${diff.slice(0, 5).join(", ")} — run node tools/pc-tmt-ing-build.mjs`); process.exit(1); }
  console.log(`tmt-ing: ok (${want.length} files)`);
} else {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  for (const [f, t] of Object.entries(files)) writeFileSync(join(OUT, f), t);
  const meta = JSON.parse(files["meta.json"]);
  const bytes = Object.values(files).reduce((n, t) => n + Buffer.byteLength(t), 0);
  console.log(`tmt-ing: ${Object.keys(files).length} files, ${meta.products} products, ${(bytes / 1024).toFixed(0)} KB -> ${OUT}`);
}
