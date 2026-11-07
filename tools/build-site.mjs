#!/usr/bin/env node
// tools/build-site.mjs — assemble the public GitHub Pages site into _site/ from an explicit ALLOWLIST.
//
// Only what the browser needs is published: the *.html pages, the root page scripts/styles they load (*.js, *.css,
// including sw.js), i18n/*.js, vendor/** (models, WASM runtimes, self-hosted fonts), .nojekyll and the licence notices.
// Server code (server.py, tryon.py, pdfconvert.py, the API Worker in backend/), tests/, tools/, docs/, types/, package*.json, configs, certs/,
// logs/ and data/ are never copied. Files come from `git ls-files` (tracked files only, so git-ignored local files such
// as the non-commercial vendor/models/faceparse-*.onnx are never published), read from the working tree.
// Outside a git checkout the build fails unless --allow-no-git is given (see below).
//
//   node tools/build-site.mjs              build _site/ (deleted first), then run the forbidden-file check
//   node tools/build-site.mjs --out dir    other output directory
//   node tools/build-site.mjs --list       print the files that would be published, build nothing
//   node tools/build-site.mjs --allow-no-git   outside a git checkout (release tarball): walk the folder, applying the
//                                          root .gitignore and always excluding faceparse-*.onnx. Without this flag a
//                                          folder that is not a git checkout fails the build (exit 1).
//
// The forbidden-file check (FORBIDDEN, also exported for tools/check-site.mjs) fails the build with exit 1.
// Used by .github/workflows/pages-lfs.yml (production deploy) and ci.yml.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
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
  [/(^|\/)faceparse-[^/]*\.onnx$/, "non-commercial face-parsing weights (licence not cleared)"],
  [/^backend(\/|$)/, "API Worker source (backend/)"], [/(^|\/)wrangler[^/]*\.(toml|json|jsonc)$/, "Worker config"],
  [/(^|\/)\.dev\.vars/, "Worker local secrets"], [/(^|\/)\.wrangler(\/|$)/, "wrangler state"], [/(^|\/)migrations\/[^/]*\.sql$/, "database migrations"]
];

export function forbiddenReason(rel) {
  for (const [re, why] of FORBIDDEN) if (re.test(rel)) return why;
  return null;
}

/** Thrown when the source folder is not a git checkout and --allow-no-git was not given. */
export class NotAGitCheckout extends Error {}

/** True when `root` is the top level of a git work tree (not merely a folder inside some other checkout). */
export function isGitCheckout(root = repo) {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    return realpathSync(top) === realpathSync(root);
  } catch { return false; }
}

/** .gitignore text -> (relPath, isDir) => ignored. Supports comments, blank lines, `!` negation, trailing `/`
 *  (directories only), leading or inner `/` (anchored to the root), `*`, `?`, `**` and `[...]` — last match wins. */
export function parseGitignore(text) {
  const rules = [];
  for (let line of String(text).split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    line = line.replace(/(?<!\\)\s+$/, "");
    let neg = false;
    if (line.startsWith("!")) { neg = true; line = line.slice(1); }
    else if (line.startsWith("\\!") || line.startsWith("\\#")) line = line.slice(1);
    let dirOnly = false;
    if (line.endsWith("/")) { dirOnly = true; line = line.slice(0, -1); }
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    let re = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "*" && line[i + 1] === "*") {
        const pre = i === 0 || line[i - 1] === "/", post = line[i + 2] === "/" || i + 2 === line.length;
        if (pre && post) { re += line[i + 2] === "/" ? "(?:.*/)?" : ".*"; i += line[i + 2] === "/" ? 2 : 1; continue; }
        re += "[^/]*"; i++; continue;
      }
      if (c === "*") re += "[^/]*";
      else if (c === "?") re += "[^/]";
      else if (c === "[") { const j = line.indexOf("]", i + 1); if (j > i) { re += "[" + line.slice(i + 1, j).replace(/^!/, "^").replace(/\\/g, "\\\\") + "]"; i = j; } else re += "\\["; }
      else if (c === "\\" && i + 1 < line.length) re += "\\" + line[++i];
      else re += c.replace(/[.+^${}()|\]\\]/g, "\\$&");
    }
    rules.push({ neg, dirOnly, re: new RegExp((anchored ? "^" : "(?:^|/)") + re + "$") });
  }
  return (rel, isDir = false) => {
    let ignored = false;
    for (const r of rules) if ((!r.dirOnly || isDir) && r.re.test(rel)) ignored = !r.neg;
    return ignored;
  };
}

/** Always left out of a no-git build, whatever .gitignore says (local-only or licence-restricted). */
export const NO_GIT_EXCLUDE = [/(^|\/)\.git(\/|$)/, /(^|\/)node_modules(\/|$)/, /(^|\/)\.venv(\/|$)/, /(^|\/)faceparse-[^/]*\.onnx$/];

/** Candidate files: `git ls-files` in a checkout. Outside one this throws NotAGitCheckout unless allowNoGit, in which
 *  case the tree is walked, skipping NO_GIT_EXCLUDE and everything matched by the root .gitignore (a directory that is
 *  ignored is not entered, as git does). */
export function trackedFiles(root = repo, { allowNoGit = false } = {}) {
  if (isGitCheckout(root)) {
    const out = execFileSync("git", ["ls-files", "-z", "--cached"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] });
    return out.split("\0").filter(Boolean);
  }
  if (!allowNoGit) throw new NotAGitCheckout(`${root} is not a git checkout: refusing to build from an untracked folder (git-ignored files such as vendor/models/faceparse-*.onnx could be published). Build from a git clone, or pass --allow-no-git to walk the folder with .gitignore applied.`);
  let gi = "";
  try { gi = readFileSync(join(root, ".gitignore"), "utf8"); } catch { /* no .gitignore: built-in exclusions only */ }
  const ignored = parseGitignore(gi), all = [];
  const walk = d => {
    for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
      const r = d ? `${d}/${e.name}` : e.name;
      if (NO_GIT_EXCLUDE.some(re => re.test(r)) || ignored(r, e.isDirectory())) continue;
      if (e.isDirectory()) walk(r); else if (e.isFile()) all.push(r);
    }
  };
  walk("");
  return all;
}

export function publishedFiles(root = repo, opts = {}) {
  return trackedFiles(root, opts)
    .filter(f => ALLOW.some(re => re.test(f)))
    .filter(f => { try { return statSync(join(root, f)).isFile(); } catch { return false; } }) // deleted but not staged
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

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const args = process.argv.slice(2);
  const oi = args.indexOf("--out");
  const out = resolve(repo, oi >= 0 ? args[oi + 1] : "_site");
  let files;
  try { files = publishedFiles(repo, { allowNoGit: args.includes("--allow-no-git") }); }
  catch (e) { if (e instanceof NotAGitCheckout) { console.error("build-site: FAILED — " + e.message); process.exit(1); } throw e; }
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
