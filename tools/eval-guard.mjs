#!/usr/bin/env node
// tools/eval-guard.mjs — "Locked sets persist" (owner rule 2026-11-13, after a locked test set was lost twice).
// Every fixed test / eval set lives in ~/LENSIQ-field/evals/<phase>/ and its sha256 is committed in the repo
// (evals-locks/<phase>.sha256) BEFORE any measurement. Every measuring harness calls assertLocked() first; it refuses
// unless each input file is under ~/LENSIQ-field/evals/<phase>/ (symlinks resolved; no temp folder, scratchpad or
// worktree), its sha256 is listed in evals-locks/<phase>.sha256, and that file is committed with no uncommitted change.
//   node tools/eval-guard.mjs check <phase> <files...>   exit 0 = locked and committed, 1 = refused (reasons on stderr)
//   node tools/eval-guard.mjs lock  <phase> <files...>   append the hashes to ~/LENSIQ-field/evals/<phase>/locked.sha256
//                                                        and evals-locks/<phase>.sha256, print the git command to commit
// <phase> = the folder under ~/LENSIQ-field/evals; nested folders as a__b (evals/nutrition/v5 -> nutrition__v5).
// <files> = absolute, or relative to ~/LENSIQ-field/evals/<phase>/. Docs: docs/EVAL-LOCKS.md.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const EVALS_ROOT = join(homedir(), "LENSIQ-field", "evals");
const PHASE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(__[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const HASH_RE = /\b[0-9a-f]{64}\b/g;

/** @param {string} p @returns {string} */
const real = p => { try { return realpathSync(p); } catch { return resolve(p); } };
/** @param {string} p @param {string} dir */
const inside = (p, dir) => p.startsWith(dir.endsWith(sep) ? dir : dir + sep);
/** @param {string|Buffer} b */
const sha256 = b => createHash("sha256").update(b).digest("hex");
const utcNow = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

/** @param {string} phase */
function checkPhase(phase) {
  if (typeof phase !== "string" || !PHASE_RE.test(phase)) {
    throw new Error(`eval-guard: invalid phase "${phase}" (a folder name under ~/LENSIQ-field/evals; nested folders as a__b)`);
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

/** hashes listed in a lock file (comment lines and text after " #" do not count) -> Map(hash -> paths) @param {string} text */
export function parseLock(text) {
  /** @type {Map<string, string[]>} */ const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.split(/\s#/)[0];
    for (const m of body.matchAll(HASH_RE)) {
      const after = body.slice((m.index || 0) + 64).trim().split(/\s+/)[0] || "";
      const list = out.get(m[0]) || [];
      list.push(after);
      out.set(m[0], list);
    }
  }
  return out;
}

/** @param {string} repo @param {string[]} args */
function gitRun(repo, args) {
  try { return { ok: true, out: execFileSync("git", args, { cwd: repo, stdio: ["ignore", "pipe", "pipe"] }).toString() }; }
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

/** @param {string} phase @param {string[]} problems */
const refuse = (phase, problems) => new Error(`eval-guard: refusing to measure phase "${phase}":\n  - ${problems.join("\n  - ")}\n` +
  `  Rule: the set lives in ~/LENSIQ-field/evals/<phase>/ and its sha256 is committed in evals-locks/<phase>.sha256 BEFORE measuring` +
  ` (docs/EVAL-LOCKS.md).`);

/**
 * Refuse to measure unless every file is in ~/LENSIQ-field/evals/<phase>/ and its sha256 is in the committed
 * evals-locks/<phase>.sha256. Throws an Error naming everything that is missing.
 * @param {string} phase @param {string[]} files @param {{root?: string, repo?: string}} [opts] (root / repo: tests only)
 * @returns {{phase: string, files: {path: string, sha256: string}[], lockFile: string, lockCommit: string}}
 */
export function assertLocked(phase, files, opts = {}) {
  checkPhase(phase);
  const repo = opts.repo || REPO;
  const { ok, problems } = resolveFiles(phase, files, opts);
  const rel = `evals-locks/${phase}.sha256`;
  const lockPath = join(repo, rel);
  /** @type {Map<string, string[]>} */ let locked = new Map();
  let lockCommit = "";
  if (!existsSync(lockPath)) problems.push(`${rel} does not exist in the repo (run: node tools/eval-guard.mjs lock ${phase} <files>, then commit it)`);
  else {
    locked = parseLock(readFileSync(lockPath, "utf8"));
    if (!gitRun(repo, ["ls-files", "--error-unmatch", "--", rel]).ok) problems.push(`${rel} is not committed (git add + git commit it before measuring)`);
    else if (!gitRun(repo, ["diff", "--quiet", "HEAD", "--", rel]).ok) problems.push(`${rel} has uncommitted changes (commit them before measuring)`);
    else lockCommit = gitRun(repo, ["log", "-1", "--format=%h", "--", rel]).out.trim();
  }
  /** @type {{path: string, sha256: string}[]} */ const out = [];
  for (const f of ok) {
    const h = sha256(readFileSync(f.path));
    if (existsSync(lockPath) && !locked.has(h)) problems.push(`${f.arg}: sha256 ${h} is not in ${rel} (changed after locking, or never locked)`);
    out.push({ path: f.path, sha256: h });
  }
  if (problems.length) throw refuse(phase, problems);
  return { phase, files: out, lockFile: rel, lockCommit };
}

/**
 * Lock files of a phase: append "sha256  relative-path  # locked <UTC>" to ~/LENSIQ-field/evals/<phase>/locked.sha256 and
 * evals-locks/<phase>.sha256 (append-only) and print the git command that commits the repo copy.
 * @param {string} phase @param {string[]} files @param {{root?: string, repo?: string, log?: (m: string) => void}} [opts]
 */
export function lock(phase, files, opts = {}) {
  checkPhase(phase);
  const repo = opts.repo || REPO, log = opts.log || console.log;
  const { dirReal, ok, problems } = resolveFiles(phase, files, opts);
  if (problems.length) throw new Error(`eval-guard: refusing to lock phase "${phase}":\n  - ${problems.join("\n  - ")}`);
  const t = utcNow();
  const items = ok.map(f => ({ path: f.path, rel: relative(dirReal, f.path).split(sep).join("/"), sha256: sha256(readFileSync(f.path)) }));
  const lines = items.map(i => `${i.sha256}  ${i.rel}  # locked ${t}\n`).join("");
  /** @param {string} file */
  const append = file => {
    const prev = existsSync(file) ? readFileSync(file, "utf8") : "";
    appendFileSync(file, (prev && !prev.endsWith("\n") ? "\n" : "") + lines);
  };
  append(join(dirReal, "locked.sha256"));
  mkdirSync(join(repo, "evals-locks"), { recursive: true });
  append(join(repo, "evals-locks", `${phase}.sha256`));
  const git = `cd "${repo}" && git add evals-locks/${phase}.sha256 && git commit -m "evals-locks: lock ${phase} (${items.length} files)"`;
  log(`eval-guard: locked ${items.length} file(s) of phase "${phase}" at ${t}:\n` + items.map(i => `  ${i.sha256}  ${i.rel}`).join("\n") +
    `\nNow commit the repo copy BEFORE measuring:\n  ${git}`);
  return { phase, files: items.map(i => ({ path: i.path, sha256: i.sha256 })), git };
}

const USAGE = "usage: node tools/eval-guard.mjs check <phase> <files...>   |   node tools/eval-guard.mjs lock <phase> <files...>";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [cmd, phase, ...files] = process.argv.slice(2);
  try {
    if (cmd === "check" && phase) {
      const r = assertLocked(phase, files);
      console.log(`eval-guard OK: phase "${r.phase}", ${r.files.length} file(s) match ${r.lockFile} (committed in ${r.lockCommit})`);
      for (const f of r.files) console.log(`  ${f.sha256}  ${f.path}`);
    } else if (cmd === "lock" && phase) lock(phase, files);
    else { console.error(USAGE); process.exit(1); }
  } catch (e) {
    console.error(String(/** @type {any} */ (e).message || e));
    process.exit(1);
  }
}
