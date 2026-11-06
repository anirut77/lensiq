#!/usr/bin/env node
// tools/check-lfs.mjs — fail fast (with a clear message) when large binaries are Git LFS *pointer files* instead of
// real content — i.e. the repo was cloned without `git lfs install` / `git lfs pull`, or CI checked out without
// `lfs: true`. Without this, the symptom is an obscure "model failed to load" deep inside an e2e test.
// Works before and after the LFS migration (docs/LFS-MIGRATION.md): before it, there are simply no pointers.
//
//   node tools/check-lfs.mjs            scan vendor/ and tests/ fixtures; exit 1 if any pointer is found
//   node tools/check-lfs.mjs --quiet    print only problems
// Run automatically before `npm run test:e2e` (pretest:e2e) and in CI.
import { openSync, readSync, closeSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const quiet = process.argv.includes("--quiet");
const ROOTS = ["vendor", "tests/unit/fixtures", "tests/bench"];
const SIG = "version https://git-lfs.github.com/spec/v1";

export function isPointer(buf) {
  return buf.toString("latin1", 0, SIG.length) === SIG;
}

function* walk(dir) {
  let ents = [];
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

const bad = [];
let n = 0, bytes = 0;
for (const r of ROOTS) {
  for (const f of walk(join(repo, r))) {
    n++;
    const st = statSync(f); bytes += st.size;
    if (st.size > 1024) continue; // pointers are ~130 bytes
    const fd = openSync(f, "r"), buf = Buffer.alloc(SIG.length);
    try { readSync(fd, buf, 0, SIG.length, 0); } finally { closeSync(fd); }
    if (isPointer(buf)) bad.push(relative(repo, f));
  }
}
if (bad.length) {
  console.error(`check-lfs: ${bad.length} file(s) are Git LFS pointers, not the real binaries:`);
  for (const f of bad.slice(0, 20)) console.error("  " + f);
  if (bad.length > 20) console.error(`  … and ${bad.length - 20} more`);
  console.error("Fix: install Git LFS (https://git-lfs.com), then run `git lfs install && git lfs pull`.\n" +
    "CI: use actions/checkout with `lfs: true`. GitHub Pages: deploy with .github/workflows/pages-lfs.yml (see docs/LFS-MIGRATION.md).");
  process.exit(1);
}
if (!quiet) console.log(`check-lfs: ${n} file(s), ${(bytes / 1048576).toFixed(1)} MB under ${ROOTS.join(", ")} — no LFS pointers`);
