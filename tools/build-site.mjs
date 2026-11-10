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
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
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

/* ---------------- public-site deploy config (deploy plan B1, owner decision D0) ----------------
 * deploy/public-site.json points the PUBLISHED site at the API Worker for the listed pages only. The repo files and the
 * repo default (lensiq-config.js: LENSIQ_API_BASE = "") never change, so local runs, on-premise installs and every other
 * page behave exactly as before. With apiBase "" (the committed default) the build output is identical to a build
 * without the file.
 *   {"apiBase": "https://lensiq-api-test.<sub>.workers.dev", "turnstileSiteKey": "<public site key>",
 *    "pages": ["medicine.html"], "analytics": false, "member": false, "testerGate": true}
 * For each listed page, in the output folder only: a generated lensiq-site-config.js is loaded before lensiq-config.js
 * (same origin, so script-src stays 'self') and the page's CSP meta becomes policy({connect: [api origin], turnstile}).
 */
export const SITE_CONFIG = "deploy/public-site.json";
export const SITE_CONFIG_JS = "lensiq-site-config.js";
/** Pages that never get the API through this file (back office, pricing draft). */
const NEVER = new Set(["admin.html", "pricing.html"]);

/**
 * A Cloudflare Turnstile SITE key (public): "0x4" + 19 to 23 URL-safe characters (the dashboard shows 24 characters in
 * all), or one of Cloudflare's documented test site keys (1x / 2x / 3x + twenty zeros + two letters). Everything else is
 * refused, in particular anything shaped like a secret: the widget SECRET key is longer (about 35 characters), and API
 * keys start with "sk-". The published site must never carry a secret.
 */
export function isTurnstileSiteKey(key) {
  const k = String(key);
  if (/^sk-/i.test(k) || k.length > 26) return false;
  return /^0x4[0-9A-Za-z_-]{19,23}$/.test(k) || /^[123]x0{20}(AA|AB|BB|FF)$/.test(k);
}

/** Validated config, or null when the file is absent / apiBase is empty (= inactive). Throws on an invalid file. */
export function readSiteConfig(file = join(repo, SITE_CONFIG)) {
  if (!existsSync(file)) return null;
  const j = JSON.parse(readFileSync(file, "utf8"));
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error(SITE_CONFIG + ": must be an object");
  for (const k of Object.keys(j)) if (!["apiBase", "turnstileSiteKey", "pages", "analytics", "member", "testerGate", "note"].includes(k)) throw new Error(SITE_CONFIG + ": unknown key " + k);
  const base = String(j.apiBase ?? "").trim();
  if (!base) return null;
  let u;
  try { u = new URL(base); } catch { throw new Error(SITE_CONFIG + ": apiBase is not a URL"); }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "") || u.origin !== base.replace(/\/+$/, "")) {
    throw new Error(SITE_CONFIG + ": apiBase must be a plain https origin (no path, query or credentials)");
  }
  const key = String(j.turnstileSiteKey ?? "").trim();
  if (key && !isTurnstileSiteKey(key)) throw new Error(SITE_CONFIG + ": turnstileSiteKey is not a Turnstile SITE key (a secret must never be published)");
  const pages = j.pages;
  if (!Array.isArray(pages) || !pages.length || !pages.every(p => typeof p === "string" && /^[a-z0-9-]+\.html$/.test(p) && !NEVER.has(p))) {
    throw new Error(SITE_CONFIG + ": pages must list page files (admin.html and pricing.html are never allowed)");
  }
  for (const k of ["analytics", "member", "testerGate"]) if (j[k] != null && typeof j[k] !== "boolean") throw new Error(SITE_CONFIG + ": " + k + " must be true or false");
  return { apiBase: u.origin, turnstileSiteKey: key, pages: [...new Set(pages)], analytics: j.analytics === true, member: j.member === true, testerGate: j.testerGate !== false };
}

/** The generated script (no secret in it: the API origin and the Turnstile SITE key are public). */
export function siteConfigJs(cfg) {
  return "/* " + SITE_CONFIG_JS + " — generated by tools/build-site.mjs from " + SITE_CONFIG + ". Loaded only by: " + cfg.pages.join(", ") + " */\n" +
    "window.LENSIQ_API_BASE = " + JSON.stringify(cfg.apiBase) + ";\n" +
    "window.LENSIQ_TURNSTILE_SITEKEY = " + JSON.stringify(cfg.turnstileSiteKey) + ";\n" +
    "window.LENSIQ_ANALYTICS = " + (cfg.analytics ? "true" : "false") + ";\n" +
    "window.LENSIQ_MEMBER = " + (cfg.member ? "true" : "false") + ";\n" +
    "window.LENSIQ_TESTER_GATE = " + (cfg.testerGate ? "true" : "false") + ";\n";
}

/** Applies the config to an assembled site folder. Returns the pages changed ([] when inactive). csp-meta.mjs is loaded
 *  only when a config is active, so this tool still runs on its own (release tarball) without one. */
export async function applySiteConfig(out, cfg) {
  if (!cfg) return [];
  const { apply: applyCsp, policy: cspPolicy } = await import("./csp-meta.mjs");
  const js = siteConfigJs(cfg);
  const v = createHash("sha256").update(js).digest("hex").slice(0, 10);
  const pol = cspPolicy({ connect: [cfg.apiBase], turnstile: !!cfg.turnstileSiteKey });
  for (const p of cfg.pages) {
    const file = join(out, p);
    if (!existsSync(file)) throw new Error(SITE_CONFIG + ": page " + p + " is not in the site");
    const html = readFileSync(file, "utf8");
    const m = /[ \t]*<script src="lensiq-config\.js(\?[^"]*)?"><\/script>/.exec(html);
    if (!m) throw new Error(SITE_CONFIG + ": " + p + " does not load lensiq-config.js");
    const tag = '<script src="' + SITE_CONFIG_JS + "?v=" + v + '"></script>\n';
    writeFileSync(file, applyCsp(html.slice(0, m.index) + tag + html.slice(m.index), pol));
  }
  writeFileSync(join(out, SITE_CONFIG_JS), js);
  return cfg.pages.slice();
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
  let scoped = [];
  try {
    const sc = readSiteConfig();
    scoped = await applySiteConfig(out, sc);
    if (sc) console.log("build-site: " + SITE_CONFIG + " -> API " + sc.apiBase + " on " + scoped.join(", ") + " only (analytics " + (sc.analytics ? "on" : "off") + ")");
  }
  catch (e) { console.error("build-site: FAILED — " + e.message); process.exit(1); }
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
