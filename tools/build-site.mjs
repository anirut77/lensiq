#!/usr/bin/env node
// tools/build-site.mjs — assemble the public GitHub Pages site into _site/ from an explicit ALLOWLIST.
//
// Only what the browser needs is published: the *.html pages, the root page scripts/styles they load (*.js, *.css,
// including sw.js), i18n/*.js, vendor/** (models, WASM runtimes, self-hosted fonts), .nojekyll and the licence notices.
// Server code (server.py, tryon.py, pdfconvert.py), tests/, tools/, docs/, types/, package*.json, configs, certs/,
// logs/ and data/ are never copied. Files come from `git ls-files` (tracked files only, so git-ignored local files such
// as the non-commercial vendor/models/faceparse-*.onnx are never published), read from the working tree.
//
//   node tools/build-site.mjs              build _site/ (deleted first), then run the forbidden-file check
//   node tools/build-site.mjs --out dir    other output directory
//   node tools/build-site.mjs --list       print the files that would be published, build nothing
//
// The forbidden-file check (FORBIDDEN, also exported for tools/check-site.mjs) fails the build with exit 1.
// Used by .github/workflows/pages-lfs.yml (production deploy) and ci.yml.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Published paths (POSIX, relative to the repo root). Anything not matching one of these is left out. */
export const ALLOW = [
  /^[^/]+\.html$/,                 // the 27 pages
  /^[^/]+\.(js|css)$/,             // page scripts + styles at the root (sw.js, nav.js, lensiq-*.js, *-kb.js …)
  /^i18n\/[^/]+\.js$/,             // 中文 dictionaries
  /^vendor\//,                     // models, WASM runtimes, face-api.js, pdf.js, docx.js, self-hosted fonts, tarot art
  /^\.nojekyll$/,
  /^LICENSE$/, /^LICENSES\/[^/]+$/ // attribution notices for the bundled third-party models/libraries
];

/** Never allowed in the published site, whatever the allowlist says (defence in depth; checked after copying). */
export const FORBIDDEN = [
  [/(^|\/)server\.py$/, "server code"], [/\.py$/, "Python source"], [/\.pyc$/, "Python bytecode"],
  [/^tests(\/|$)/, "tests"], [/^tools(\/|$)/, "build/check tools"], [/^docs(\/|$)/, "internal docs"],
  [/^types(\/|$)/, "type declarations"], [/(^|\/)package(-lock)?\.json$/, "npm manifest"],
  [/(^|\/)requirements[^/]*\.txt$/, "Python requirements"], [/(^|\/)\.git(\/|$)|(^|\/)\.github(\/|$)/, "git metadata"],
  [/(^|\/)node_modules(\/|$)/, "node_modules"], [/(^|\/)\.venv(\/|$)/, "virtualenv"],
  [/^(certs|logs|data)(\/|$)/, "runtime data / certificates"], [/\.(pem|key|crt|env)$/, "secrets / certificates"],
  [/(^|\/)(eslint\.config\.mjs|tsconfig[^/]*\.json|start\.sh)$/, "dev config"],
  [/(^|\/)faceparse-[^/]*\.onnx$/, "non-commercial face-parsing weights (licence not cleared)"]
];

export function forbiddenReason(rel) {
  for (const [re, why] of FORBIDDEN) if (re.test(rel)) return why;
  return null;
}

function trackedFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--cached"], { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20 });
    return out.split("\0").filter(Boolean);
  } catch {
    // not a git checkout (e.g. a release tarball): walk the tree instead
    const all = [];
    const walk = d => {
      for (const e of readdirSync(join(repo, d), { withFileTypes: true })) {
        if (e.name === ".git" || e.name === "node_modules" || e.name === ".venv") continue;
        const r = d ? `${d}/${e.name}` : e.name;
        if (e.isDirectory()) walk(r); else if (e.isFile()) all.push(r);
      }
    };
    walk("");
    return all;
  }
}

export function publishedFiles() {
  return trackedFiles()
    .filter(f => ALLOW.some(re => re.test(f)))
    .filter(f => { try { return statSync(join(repo, f)).isFile(); } catch { return false; } }) // deleted but not staged
    .sort();
}

/** List every file under dir (POSIX relative paths). */
export function listTree(dir) {
  const out = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/** Returns [{file, why}] for forbidden files inside dir. */
export function scanForbidden(dir) {
  return listTree(dir).map(f => ({ file: f, why: forbiddenReason(f) })).filter(x => x.why);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const oi = args.indexOf("--out");
  const out = resolve(repo, oi >= 0 ? args[oi + 1] : "_site");
  const files = publishedFiles();
  if (args.includes("--list")) { for (const f of files) console.log(f); console.log(`${files.length} file(s)`); process.exit(0); }
  if (out === repo || repo.startsWith(out + sep)) throw new Error("refusing to build into " + out);
  rmSync(out, { recursive: true, force: true });
  let bytes = 0;
  for (const f of files) {
    const dst = join(out, f);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(repo, f), dst);
    bytes += statSync(dst).size;
  }
  const pages = files.filter(f => /^[^/]+\.html$/.test(f)).length;
  console.log(`build-site: ${files.length} file(s), ${pages} page(s), ${(bytes / 1048576).toFixed(1)} MB -> ${relative(repo, out) || out}`);
  const bad = scanForbidden(out);
  if (bad.length) {
    console.error(`build-site: FAILED — ${bad.length} forbidden file(s) in the site:`);
    for (const b of bad) console.error(`  ${b.file}  (${b.why})`);
    process.exit(1);
  }
  console.log("build-site: forbidden-file check OK (no server code, tests, tools, docs, package.json or .py)");
}
