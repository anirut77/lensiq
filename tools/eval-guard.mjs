#!/usr/bin/env node
// tools/eval-guard.mjs — "Locked sets persist" (owner rule 2026-11-13, after a locked test set was lost twice).
// Every fixed test / eval set lives in ~/LENSIQ-field/evals/<phase>/ and its sha256 is committed in the repo
// (evals-locks/<phase>.sha256) BEFORE any measurement. Every measuring harness calls assertLocked() first; it refuses
// unless each input file is under ~/LENSIQ-field/evals/<phase>/ (symlinks resolved; no temp folder, scratchpad or
// worktree), its sha256 is listed in the COMMITTED evals-locks/<phase>.sha256 (read from HEAD), and that file has no
// uncommitted change.
//   node tools/eval-guard.mjs check <phase> <files...>   exit 0 = locked and committed, 1 = refused (reasons on stderr)
//   node tools/eval-guard.mjs repo                       exit 0 = every repo file named in any evals-locks/*.sha256 equals its LATEST
//                                                        locked hash (owner decision 85 ก, 2026-11-17); 1 = mismatches on stderr.
//                                                        Reads only evals-locks/ and the repo files (CI has no ~/LENSIQ-field).
//   node tools/eval-guard.mjs lock  <phase> <files...>   append "# locked <UTC>" + "<sha256>  <path>" lines to
//                                                        evals-locks/<phase>.sha256, then ~/LENSIQ-field/evals/<phase>/locked.sha256;
//                                                        prints the git command to commit
// <phase> = the folder under ~/LENSIQ-field/evals, lowercase; nested folders as a__b (evals/nutrition/v5 -> nutrition__v5).
// <files> = absolute, or relative to ~/LENSIQ-field/evals/<phase>/. Lock lines: only "^<sha256><space>..." lines count.
// Docs: docs/EVAL-LOCKS.md.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const EVALS_ROOT = join(homedir(), "LENSIQ-field", "evals");
const SHOWN_ROOT = "~/" + relative(homedir(), EVALS_ROOT).split(sep).join("/");
const SEGMENT_RE = /^[a-z0-9][a-z0-9._-]*$/;
const LINE_RE = /^([0-9a-f]{64})\s+(\S.*)$/;
const RETIRE_RE = /^#\s*retired\s+(\S+)\s+reason:\s*(\S.*)$/;
const REPO_MARK_RE = /#\s*repo file\b/;

/** @param {string} p @returns {string} */
const real = p => { try { return realpathSync.native(p); } catch { return resolve(p); } };
/** @param {string} p @param {string} dir */
const inside = (p, dir) => p.startsWith(dir.endsWith(sep) ? dir : dir + sep);
/** @param {string|Buffer} b */
const sha256 = b => createHash("sha256").update(b).digest("hex");
const utcNow = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

/** @param {string} phase */
function checkPhase(phase) {
  const bad = (/** @type {string} */ why) => new Error(`eval-guard: invalid phase "${phase}": ${why} (a folder name under ${SHOWN_ROOT}; nested folders as a__b)`);
  if (typeof phase !== "string" || !phase) throw bad("empty");
  if (phase !== phase.toLowerCase()) throw bad("phase names must be lowercase");
  if (phase.includes("___")) throw bad("three underscores in a row");
  for (const seg of phase.split("__")) {
    if (!SEGMENT_RE.test(seg) || seg.endsWith("_") || seg === "." || seg === "..") throw bad(`bad folder segment "${seg}"`);
  }
}

/** root / repo overrides exist for the unit tests only (node --test sets NODE_TEST_CONTEXT) @param {{root?: string, repo?: string}} opts */
function checkOverrides(opts) {
  if ((opts.root || opts.repo) && !process.env.NODE_TEST_CONTEXT) {
    throw new Error("eval-guard: the root / repo options are for tests only; harnesses use the real evals folder and this repo");
  }
}

/** folder of a phase: nutrition__v5 -> <root>/nutrition/v5 @param {string} phase @param {string} [root] */
export function phaseDir(phase, root = EVALS_ROOT) {
  checkPhase(phase);
  return join(root, ...phase.split("__"));
}

/** phase name of a folder under the evals root: <root>/adverts/fresh2 -> adverts__fresh2 @param {string} dir @param {string} [root] */
export function phaseOf(dir, root = EVALS_ROOT) {
  const rel = relative(real(root), real(dir));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`eval-guard: ${dir} is outside the evals folder ${root}`);
  const phase = rel.split(sep).join("__");
  checkPhase(phase);
  return phase;
}

/** why a path may not hold a locked set (temp folder, scratchpad, worktree), or null @param {string} p */
export function forbiddenLocation(p) {
  const abs = resolve(p);
  const temps = [tmpdir(), real(tmpdir()), "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"];
  for (const t of temps) if (abs === t || inside(abs, t)) return `${abs} is in a temp folder (${t})`;
  if (abs.includes(`${sep}.claude${sep}worktrees${sep}`)) return `${abs} is inside an agent worktree`;
  if (abs.includes(`${sep}scratchpad${sep}`)) return `${abs} is inside an agent scratchpad`;
  return null;
}

/**
 * Hashes of a lock file -> Map(hash -> paths). Only lines that START with a sha256 followed by whitespace count; the path
 * is the next token. Comment lines, "LOCK <hash>", "x#<hash>" and further hashes on the same line do not count.
 * @param {string} text
 */
export function parseLock(text) {
  /** @type {Map<string, string[]>} */ const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(LINE_RE);
    if (!m) continue;
    const list = out.get(m[1]) || [];
    list.push(m[2].split(/\s+/)[0]);
    out.set(m[1], list);
  }
  return out;
}

/** @param {string} repo @param {string[]} args */
function gitRun(repo, args) {
  try { return { ok: true, out: execFileSync("git", args, { cwd: repo, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 }).toString() }; }
  catch (e) { return { ok: false, out: String(/** @type {any} */ (e).stderr || "") }; }
}

/**
 * Resolve the input files of a phase; collects problems instead of throwing.
 * @param {string} phase @param {string[]} files @param {{root?: string}} opts
 */
function resolveFiles(phase, files, opts) {
  const root = opts.root || EVALS_ROOT;
  /** @type {string[]} */ const problems = [];
  /** @type {{arg: string, path: string}[]} */ const ok = [];
  if (!opts.root) {
    if (!existsSync(root)) problems.push(`the evals folder ${root} does not exist`);
    else { const why = forbiddenLocation(real(root)); if (why) problems.push(`the evals folder resolves to a forbidden place: ${why}`); }
  }
  const dir = phaseDir(phase, root);
  if (!existsSync(dir)) problems.push(`phase folder ${dir} does not exist (write the set there first)`);
  const dirReal = real(dir);
  if (existsSync(dir) && !inside(dirReal, real(root))) problems.push(`phase folder ${dir} resolves to ${dirReal}, outside ${root}`);
  if (!Array.isArray(files) || !files.length) problems.push("no files given: name every input file of the set");
  for (const f of Array.isArray(files) ? files : []) {
    const abs = isAbsolute(f) ? f : join(dir, f);
    if (!existsSync(abs)) { problems.push(`missing file: ${f} (looked for ${abs})`); continue; }
    const r = real(abs);
    if (!inside(r, dirReal)) { problems.push(`${f} resolves to ${r}, outside the phase folder ${dir}`); continue; }
    const why = !opts.root && forbiddenLocation(r);
    if (why) { problems.push(why); continue; }
    if (!statSync(r).isFile()) { problems.push(`${f} is not a file`); continue; }
    ok.push({ arg: f, path: r });
  }
  return { dir, dirReal, ok, problems };
}

/**
 * Lock events of one lock file, in order: hash lines ("<sha256>  <path> ...") and retirement lines
 * ("# retired <path> reason: <text>"). `marked` = the line says "# repo file".
 * @param {string} text
 * @returns {{kind: "hash"|"retire", path: string, hash?: string, reason?: string, marked: boolean, line: number}[]}
 */
export function lockEvents(text) {
  /** @type {{kind: "hash"|"retire", path: string, hash?: string, reason?: string, marked: boolean, line: number}[]} */ const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const m = raw.match(LINE_RE);
    if (m) { out.push({ kind: "hash", hash: m[1], path: m[2].split(/\s+/)[0].replace(/^\.\//, ""), marked: REPO_MARK_RE.test(raw), line: i + 1 }); return; }
    const r = raw.trim().match(RETIRE_RE);
    if (r) out.push({ kind: "retire", path: r[1].replace(/^\.\//, ""), reason: r[2].trim(), marked: false, line: i + 1 });
  });
  return out;
}

/** folders at the repo root (a lock path whose first folder is one of these is a repo path) @param {string} repo */
function repoRootDirs(repo) {
  try {
    return new Set(readdirSync(repo, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules").map(d => d.name));
  } catch { return new Set(); }
}

/**
 * Is a lock path a file of this repo (not a copy under ~/LENSIQ-field)? Lines marked "# repo file" always are; otherwise a
 * relative path whose first folder is a folder at the repo root. Bare names, phase sub-folders and absolute paths are not.
 * @param {{path: string, marked: boolean}} ev @param {Set<string>} dirs
 */
function isRepoPath(ev, dirs) {
  const p = ev.path;
  if (!p || isAbsolute(p) || p.startsWith("~") || p.split("/").includes("..")) return false;
  if (ev.marked) return true;
  return p.includes("/") && dirs.has(p.split("/")[0]);
}

/**
 * Owner decision 85 ก (2026-11-17): every repo file named in any evals-locks/*.sha256 must equal its LATEST locked hash.
 * Locks are append-only: within a lock file the last entry for a path wins; across lock files a hash that another lock file
 * later replaced (it holds that hash and then a newer line for the path) is superseded; lock files that still disagree are a
 * conflict. A locked file that is gone from the repo fails unless a lock file retires it after its last hash line:
 * "# retired <path> reason: <text>". Reads only evals-locks/ (working tree) and the repo files: no ~/LENSIQ-field needed.
 * @param {{repo?: string, only?: Set<string>}} [opts] (repo: tests only; only: limit to these paths)
 */
export function checkRepoLocks(opts = {}) {
  checkOverrides(opts);
  const repo = opts.repo || REPO;
  const lockDir = join(repo, "evals-locks");
  const dirs = repoRootDirs(repo);
  /** @type {Map<string, Map<string, ReturnType<typeof lockEvents>>>} path -> lock file -> events */ const byPath = new Map();
  const lockFiles = existsSync(lockDir) ? readdirSync(lockDir).filter(f => f.endsWith(".sha256")).sort() : [];
  for (const f of lockFiles) {
    const rel = `evals-locks/${f}`;
    for (const ev of lockEvents(readFileSync(join(lockDir, f), "utf8"))) {
      if (!isRepoPath(ev, dirs) && !(ev.kind === "retire" && byPath.has(ev.path))) continue;
      if (opts.only && !opts.only.has(ev.path)) continue;
      const per = byPath.get(ev.path) || new Map();
      const list = per.get(rel) || [];
      list.push(ev);
      per.set(rel, list);
      byPath.set(ev.path, per);
    }
  }
  /** @type {{path: string, message: string}[]} */ const issues = [];
  /** @type {{path: string, expected: string, actual: string, lockFile: string, line: number}[]} */ const checked = [];
  /** @type {{path: string, reason: string, lockFile: string, line: number}[]} */ const retired = [];
  for (const [path, per] of [...byPath].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (![...per.values()].some(evs => evs.some(e => e.kind === "hash"))) continue; // only retirement lines: nothing locked
    const abs = join(repo, ...path.split("/"));
    const present = existsSync(abs) && statSync(abs).isFile();
    const actual = present ? sha256(readFileSync(abs)) : "";
    /** @type {{lockFile: string, hash: string, line: number}[]} */ const latest = [];
    /** @type {{lockFile: string, reason: string, line: number}[]} */ const retires = [];
    for (const [lockFile, evs] of per) {
      const last = evs[evs.length - 1];
      if (last.kind === "hash") latest.push({ lockFile, hash: /** @type {string} */ (last.hash), line: last.line });
      else retires.push({ lockFile, reason: /** @type {string} */ (last.reason), line: last.line });
    }
    // superseded: another lock file holds this hash for the path and has a later line (new hash or retirement) after it
    const live = latest.filter(c => ![...per].some(([lf, evs]) => {
      if (lf === c.lockFile) return false;
      const i = evs.findIndex(e => e.kind === "hash" && e.hash === c.hash);
      return i >= 0 && evs.slice(i + 1).some(e => e.kind === "retire" || e.hash !== c.hash);
    }));
    const hashes = [...new Set(live.map(c => c.hash))];
    const where = (/** @type {{lockFile: string, line: number}} */ c) => `${c.lockFile} line ${c.line}`;
    const older = () => {
      if (!present) return "";
      for (const [lf, evs] of per) { const e = evs.find(x => x.kind === "hash" && x.hash === actual); if (e) return ` (the repo file equals an OLDER lock entry: ${lf} line ${e.line})`; }
      return " (the repo file's hash is in no lock file: changed after locking)";
    };
    if (hashes.length > 1 || (!hashes.length && !retires.length)) {
      const all = (hashes.length ? live : latest).map(c => `${where(c)} = ${c.hash}`).join("; ");
      issues.push({ path, message: `${path}: conflicting latest locks: ${all}; actual ${present ? actual : "(file not in the repo)"}. ` +
        "No lock file replaces the other. Append the right hash, with the reason, as a documented re-lock to the lock file that is out of date." });
      continue;
    }
    if (!hashes.length) { // every lock file retired it (or the hashes were superseded by a retirement)
      const r = retires[0];
      if (present) issues.push({ path, message: `${path}: retired in ${where(r)} ("${r.reason}") but still in the repo; lock it again or remove it.` });
      else retired.push({ path, reason: r.reason, lockFile: r.lockFile, line: r.line });
      continue;
    }
    const exp = live.find(c => c.hash === hashes[0]) || live[0];
    if (!present) {
      issues.push({ path, message: `${path}: locked in ${where(exp)} (expected ${exp.hash}) but the file is not in the repo. If it was removed on purpose, ` +
        `append to the lock file: "# retired ${path} reason: <why>".` });
      continue;
    }
    checked.push({ path, expected: exp.hash, actual, lockFile: exp.lockFile, line: exp.line });
    if (actual !== exp.hash) {
      issues.push({ path, message: `${path}: differs from its latest lock: expected ${exp.hash} (${where(exp)}), actual ${actual}${older()}.` });
    }
  }
  return { checked, retired, issues, problems: issues.map(i => i.message), lockFiles: lockFiles.length };
}

/** @param {string} phase @param {string[]} problems */
const refuse = (phase, problems) => new Error(`eval-guard: refusing to measure phase "${phase}":\n  - ${problems.join("\n  - ")}\n` +
  `  Rule: the set lives in ${SHOWN_ROOT}/<phase>/ and its sha256 is committed in evals-locks/<phase>.sha256 BEFORE measuring` +
  ` (docs/EVAL-LOCKS.md).`);

/**
 * Refuse to measure unless every file is in ~/LENSIQ-field/evals/<phase>/ and its sha256 is in evals-locks/<phase>.sha256
 * as committed at HEAD (no uncommitted change). Throws an Error naming everything that is missing.
 * @param {string} phase @param {string[]} files @param {{root?: string, repo?: string}} [opts] (root / repo: tests only)
 * @returns {{phase: string, files: {path: string, sha256: string}[], lockFile: string, lockCommit: string}}
 */
export function assertLocked(phase, files, opts = {}) {
  checkPhase(phase);
  checkOverrides(opts);
  const repo = opts.repo || REPO;
  const { ok, problems } = resolveFiles(phase, files, opts);
  const rel = `evals-locks/${phase}.sha256`;
  /** @type {Map<string, string[]> | null} */ let locked = null;
  let lockCommit = "";
  if (!existsSync(join(repo, rel))) problems.push(`${rel} does not exist in the repo (run: node tools/eval-guard.mjs lock ${phase} <files>, then commit it)`);
  else if (!gitRun(repo, ["ls-files", "--error-unmatch", "--", rel]).ok) problems.push(`${rel} is not committed (git add + git commit it before measuring)`);
  else if (!gitRun(repo, ["diff", "--quiet", "HEAD", "--", rel]).ok) problems.push(`${rel} has uncommitted changes (commit them before measuring)`);
  else {
    const head = gitRun(repo, ["show", `HEAD:${rel}`]);
    if (!head.ok) problems.push(`${rel} could not be read from HEAD: ${head.out.trim()}`);
    else { locked = parseLock(head.out); lockCommit = gitRun(repo, ["log", "-1", "--format=%h", "--", rel]).out.trim(); }
  }
  if (locked) { // owner decision 85 ก: repo files locked in this phase must equal their latest lock (in any lock file)
    const dirs = repoRootDirs(repo);
    const only = new Set(lockEvents(gitRun(repo, ["show", `HEAD:${rel}`]).out).filter(e => e.kind === "hash" && isRepoPath(e, dirs)).map(e => e.path));
    if (only.size) for (const p of checkRepoLocks({ ...(opts.repo ? { repo } : {}), only }).problems) problems.push(p);
  }
  /** @type {{path: string, sha256: string}[]} */ const out = [];
  for (const f of ok) {
    const h = sha256(readFileSync(f.path));
    if (locked && !locked.has(h)) problems.push(`${f.arg}: sha256 ${h} is not in ${rel} at HEAD (changed after locking, or never locked)`);
    out.push({ path: f.path, sha256: h });
  }
  if (problems.length) throw refuse(phase, problems);
  return { phase, files: out, lockFile: rel, lockCommit };
}

/**
 * Lock files of a phase: append a "# locked <UTC>" comment line and one "<sha256>  <relative-path>" line per file (no
 * trailing comment: readers take the rest of the line as the name) to evals-locks/<phase>.sha256 FIRST, then to
 * ~/LENSIQ-field/evals/<phase>/locked.sha256 (append-only). Fails loudly when either write fails. Prints the git command.
 * @param {string} phase @param {string[]} files @param {{root?: string, repo?: string, log?: (m: string) => void}} [opts]
 */
export function lock(phase, files, opts = {}) {
  checkPhase(phase);
  checkOverrides(opts);
  const repo = opts.repo || REPO, log = opts.log || console.log;
  const { dirReal, ok, problems } = resolveFiles(phase, files, opts);
  if (problems.length) throw new Error(`eval-guard: refusing to lock phase "${phase}":\n  - ${problems.join("\n  - ")}`);
  const t = utcNow();
  const items = ok.map(f => ({ path: f.path, rel: relative(dirReal, f.path).split(sep).join("/"), sha256: sha256(readFileSync(f.path)) }));
  const block = `# locked ${t} (tools/eval-guard.mjs lock, ${items.length} file${items.length === 1 ? "" : "s"})\n` +
    items.map(i => `${i.sha256}  ${i.rel}\n`).join("");
  /** @param {string} file */
  const append = file => {
    const prev = existsSync(file) ? readFileSync(file, "utf8") : "";
    appendFileSync(file, (prev && !prev.endsWith("\n") ? "\n" : "") + block);
  };
  const repoFile = join(repo, "evals-locks", `${phase}.sha256`), fieldFile = join(dirReal, "locked.sha256");
  try {
    mkdirSync(join(repo, "evals-locks"), { recursive: true });
    append(repoFile);
  } catch (e) {
    throw new Error(`eval-guard: could not write the repo copy evals-locks/${phase}.sha256 (${/** @type {any} */ (e).message}); nothing was locked`);
  }
  try { append(fieldFile); } catch (e) {
    throw new Error(`eval-guard: the repo copy evals-locks/${phase}.sha256 was appended, but writing ${fieldFile} failed ` +
      `(${/** @type {any} */ (e).message}). Fix the permission and append the same lines there by hand; do not commit until both match.`);
  }
  const git = `cd "${repo}" && git add evals-locks/${phase}.sha256 && git commit -m "evals-locks: lock ${phase} (${items.length} files)"`;
  log(`eval-guard: locked ${items.length} file(s) of phase "${phase}" at ${t}:\n` + items.map(i => `  ${i.sha256}  ${i.rel}`).join("\n") +
    `\nNow commit the repo copy BEFORE measuring:\n  ${git}`);
  return { phase, files: items.map(i => ({ path: i.path, sha256: i.sha256 })), git };
}

const USAGE = "usage: node tools/eval-guard.mjs check <phase> <files...>   |   node tools/eval-guard.mjs lock <phase> <files...>   |   " +
  "node tools/eval-guard.mjs repo";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [cmd, phase, ...files] = process.argv.slice(2);
  try {
    if (cmd === "check" && phase) {
      const r = assertLocked(phase, files);
      console.log(`eval-guard OK: phase "${r.phase}", ${r.files.length} file(s) match ${r.lockFile} (committed in ${r.lockCommit})`);
      for (const f of r.files) console.log(`  ${f.sha256}  ${f.path}`);
    } else if (cmd === "lock" && phase) lock(phase, files);
    else if (cmd === "repo") {
      const args = process.argv.slice(3), i = args.indexOf("--repo");
      const r = checkRepoLocks(i >= 0 ? { repo: resolve(args[i + 1] || "") } : {});
      if (r.problems.length) {
        console.error(`eval-guard repo: ${r.problems.length} locked repo file(s) differ from their latest lock (owner decision 85 ก):\n  - ` +
          r.problems.join("\n  - ") + "\n  Never edit a lock to match a changed test without a documented re-lock (docs/EVAL-LOCKS.md).");
        process.exit(1);
      }
      console.log(`eval-guard repo OK: ${r.checked.length} locked repo file(s) match their latest lock in ${r.lockFiles} lock file(s); ` +
        `${r.retired.length} retired.`);
    }
    else { console.error(USAGE); process.exit(1); }
  } catch (e) {
    console.error(String(/** @type {any} */ (e).message || e));
    process.exit(1);
  }
}
