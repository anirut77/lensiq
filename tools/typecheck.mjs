#!/usr/bin/env node
// tools/typecheck.mjs — TypeScript checking of plain JS (JSDoc types, no build step, nothing emitted).
//
//   node tools/typecheck.mjs            strict gate: tsc -p tsconfig.typecheck.json (the shared platform modules listed in
//                                       its "files"); exit 1 on any error. Wired into CI and `npm run typecheck`.
//   node tools/typecheck.mjs --report   informational: type-check EVERY root *.js with the same options and print the
//                                       error count per file (teams use it to pick files to add to the gate). Exit 0.
//   node tools/typecheck.mjs --report --errors palm   also print the errors of files whose name contains "palm"
//
// Ambient types for the shared window globals live in types/lensiq-globals.d.ts.
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

if (!args.includes("--report")) {
  const out = run("tsconfig.typecheck.json");
  const files = JSON.parse(readFileSync(join(repo, "tsconfig.typecheck.json"), "utf8")).files;
  if (out.trim()) { console.log(out.trim()); console.log(`\ntypecheck: FAILED (${(out.match(/error TS/g) || []).length} error(s))`); process.exit(1); }
  console.log(`typecheck: ${files.length} file(s) OK — ${files.join(", ")}`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(join(repo, "tsconfig.typecheck.json"), "utf8"));
const gated = new Set(base.files);
const all = readdirSync(repo).filter(f => f.endsWith(".js")).sort();
const tmp = join(repo, ".tsconfig.report.json");
writeFileSync(tmp, JSON.stringify({ compilerOptions: base.compilerOptions, files: ["types/lensiq-globals.d.ts", ...all] }));
let out;
try { out = run(tmp); } finally { rmSync(tmp, { force: true }); }
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
