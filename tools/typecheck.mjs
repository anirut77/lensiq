#!/usr/bin/env node
// tools/typecheck.mjs — TypeScript checking of plain JS (JSDoc types, no build step, nothing emitted).
//
//   node tools/typecheck.mjs            strict gate: tsc -p tsconfig.typecheck.json (the shared platform modules listed in
//                                       its "files") AND tsc -p backend/tsconfig.json (the API Worker); exit 1 on any
//                                       error. Wired into CI and `npm run typecheck`.
//                                       Page scripts in its "pages" list are checked one by one (own program each).
//   node tools/typecheck.mjs --report   informational: type-check EVERY root *.js with the same options and print the
//                                       error count per file (teams use it to pick files to add to the gate). Exit 0.
//   node tools/typecheck.mjs --report --errors palm   also print the errors of files whose name contains "palm"
//
// Ambient types for the shared window globals live in types/lensiq-globals.d.ts; page-script globals (bare LQCam,
// faceapi, pdfjsLib, BarcodeDetector …) in types/lensiq-pages.d.ts.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const tsc = join(repo, "node_modules", "typescript", "bin", "tsc");

function run(project) {
  try {
    execFileSync(process.execPath, [tsc, "-p", project, "--pretty", "false"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return "";
  } catch (e) {
    return String(e.stdout || "") + String(e.stderr || "");
  }
}

/** Page scripts listed in tsconfig.typecheck.json "pages": each one is its own program (classic scripts of different
 *  pages declare the same top-level names — $, video, mode — that would collide in one shared program). */
function runPages(cfg) {
  let out = "";
  for (const p of cfg.pages || []) {
    const tmp = join(repo, ".tsconfig.page.json");
    writeFileSync(tmp, JSON.stringify({ compilerOptions: cfg.compilerOptions, files: ["types/lensiq-globals.d.ts", "types/lensiq-pages.d.ts", ...(p.types || []), p.file] }));
    try { out += run(tmp); } finally { rmSync(tmp, { force: true }); }
  }
  return out;
}

/** Files in tsconfig.typecheck.json "strictNull" must also type-check with strictNullChecks. They are compiled together
 *  with the shared ambient types; only errors located in those files count (imported modules are not strict yet). */
function runStrictNull(cfg) {
  const list = cfg.strictNull || [];
  if (!list.length) return "";
  const tmp = join(repo, ".tsconfig.strictnull.json");
  writeFileSync(tmp, JSON.stringify({ compilerOptions: { ...cfg.compilerOptions, strictNullChecks: true }, files: ["types/lensiq-globals.d.ts", "types/lensiq-pages.d.ts", ...list] }));
  let out;
  try { out = run(tmp); } finally { rmSync(tmp, { force: true }); }
  const own = new Set(list);
  // keep an error line plus its indented continuation lines only when it is located in one of the listed files
  const keep = [];
  let on = false;
  for (const l of out.split("\n")) {
    const m = /^([\w./-]+)\(\d+,\d+\): error TS/.exec(l);
    if (m) on = own.has(m[1]);
    if (on && l.trim()) keep.push(m ? l + " [strictNullChecks]" : l);
  }
  return keep.length ? keep.join("\n") + "\n" : "";
}

if (!args.includes("--report")) {
  // 1. shared site modules; 2. page scripts checked one by one ("pages"); 3. the API Worker (backend/tsconfig.json:
  // every backend/src file is // @ts-check, minimal ambient Workers / D1 types in backend/types/worker.d.ts)
  const cfg = JSON.parse(readFileSync(join(repo, "tsconfig.typecheck.json"), "utf8"));
  const out = run("tsconfig.typecheck.json") + runPages(cfg) + runStrictNull(cfg) + run(join("backend", "tsconfig.json"));
  const files = cfg.files;
  if (out.trim()) { console.log(out.trim()); console.log(`\ntypecheck: FAILED (${(out.match(/error TS/g) || []).length} error(s))`); process.exit(1); }
  const backendFiles = readdirSync(join(repo, "backend", "src")).filter(f => f.endsWith(".js"));
  console.log(`typecheck: ${files.length} file(s) OK — ${files.join(", ")}`);
  if ((cfg.strictNull || []).length) console.log(`typecheck: ${cfg.strictNull.length} file(s) also OK under strictNullChecks — ${cfg.strictNull.join(", ")}`);
  if ((cfg.pages || []).length) console.log(`typecheck: ${cfg.pages.length} page script(s) OK, each in its own program — ${cfg.pages.map(p => p.file).join(", ")}`);
  console.log(`typecheck: backend Worker OK — ${backendFiles.length} file(s) in backend/src (backend/tsconfig.json)`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(join(repo, "tsconfig.typecheck.json"), "utf8"));
const gated = new Set([...base.files, ...(base.pages || []).map(p => p.file)]);
const all = readdirSync(repo).filter(f => f.endsWith(".js")).sort();
const tmp = join(repo, ".tsconfig.report.json");
// page scripts of the "pages" list are counted in their own program (as the gate checks them), the rest together
const pageFiles = new Set((base.pages || []).map(p => p.file));
writeFileSync(tmp, JSON.stringify({ compilerOptions: base.compilerOptions, files: ["types/lensiq-globals.d.ts", "types/lensiq-pages.d.ts", ...all.filter(f => !pageFiles.has(f))] }));
let out;
try { out = run(tmp); } finally { rmSync(tmp, { force: true }); }
out += runPages(base);
const per = {};
const lines = out.split("\n").filter(l => /error TS\d+/.test(l));
for (const l of lines) { const f = l.split("(")[0]; per[f] = (per[f] || 0) + 1; }
const showFor = (() => { const i = args.indexOf("--errors"); return i >= 0 ? args[i + 1] || "" : null; })();
console.log("file".padEnd(28) + "errors  gate");
for (const f of all) {
  console.log(f.padEnd(28) + String(per[f] || 0).padStart(6) + "  " + (gated.has(f) ? "yes" : ""));
  if (showFor != null && f.includes(showFor) && per[f]) for (const l of lines.filter(x => x.startsWith(f + "("))) console.log("    " + l.slice(f.length));
}
console.log(`\n${lines.length} error(s) in ${Object.keys(per).length}/${all.length} file(s). Fix a file, then add it to tsconfig.typecheck.json "files".`);
