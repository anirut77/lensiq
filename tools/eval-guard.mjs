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
//                                                        Ledger rule (owner decision 110 ก condition 4, 2026-11-18): lock blocks
//                                                        stamped at or after LEDGER_FROM need, for every field file with a repo copy,
//                                                        a repo ledger line with the same hash, and every "# repo file" line needs its
//                                                        field copy (same-hash field line, or "field: ~/LENSIQ-field/evals/<phase>/<rel>"
//                                                        naming a hash line of evals-locks/<phase>.sha256). Earlier gaps: --history.
//   node tools/eval-guard.mjs repo --field               also checks on disk (local only) that each such field copy exists with
//                                                        that hash and is listed in its phase's locked.sha256
//   node tools/eval-guard.mjs lock  <phase> <files...>   append "# locked <UTC>" + "<sha256>  <path>" lines to
//                                                        evals-locks/<phase>.sha256, then ~/LENSIQ-field/evals/<phase>/locked.sha256;
//                                                        in the repo copy also one "<sha256>  <repo path>  # repo file (...; field: ...)"
//                                                        line per field file whose repo copy is found (from its path or name, or given as
//                                                        <file>=<repo path>; <file>=- records "# field only <file>"); refuses when the
//                                                        repo copy differs; appends the same repo line to other lock files that still
//                                                        hold an older hash for that path. Prints the git command to commit
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
const PENDING_RE = /^#\s*pending\s+(\S+)\s+branch:\s*(\S+)\s+reason:\s*(\S.*)$/;
const REPO_MARK_RE = /#\s*repo file\b/;
const LOCKED_RE = /^#\s*locked\s+(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)/;
const FIELD_ONLY_RE = /^#\s*field only\s+(\S+)/;
const FIELD_REF_RE = /field:\s*~\/LENSIQ-field\/evals\/([^\s,;)]+)/;
const LATE_RE = /late entry/i;
/** Ledger rule (owner decision 110 ก condition 4): lock blocks stamped at or after this time must carry their repo ledger lines. */
export const LEDGER_FROM = "2026-11-18T02:26:42Z";
const FIELD_PREFIX = "~/LENSIQ-field/evals/";

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
 * ("# retired <path> reason: <text>") and pending lines ("# pending <path> branch: <branch> reason: <text>": locked on main
 * before the code is merged from <branch>; accepted only while the file is absent). `marked` = the line says "# repo file".
 * @param {string} text
 * @returns {{kind: "hash"|"retire"|"pending", path: string, hash?: string, reason?: string, branch?: string, marked: boolean, line: number}[]}
 */
export function lockEvents(text) {
  /** @type {{kind: "hash"|"retire"|"pending", path: string, hash?: string, reason?: string, branch?: string, marked: boolean, line: number}[]} */
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const m = raw.match(LINE_RE);
    if (m) { out.push({ kind: "hash", hash: m[1], path: m[2].split(/\s+/)[0].replace(/^\.\//, ""), marked: REPO_MARK_RE.test(raw), line: i + 1 }); return; }
    const r = raw.trim().match(RETIRE_RE);
    if (r) { out.push({ kind: "retire", path: r[1].replace(/^\.\//, ""), reason: r[2].trim(), marked: false, line: i + 1 }); return; }
    const q = raw.trim().match(PENDING_RE);
    if (q && q[2] !== "reason:") out.push({ kind: "pending", path: q[1].replace(/^\.\//, ""), branch: q[2], reason: q[3].trim(), marked: false, line: i + 1 });
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

const NAME_MATCH_RE = /\.(?:js|mjs|cjs|ts|py|json)$/; // code / test files are matched to the repo by name too
const GENERIC_NAMES = new Set(["set.json", "package.json", "index.json", "labels.json", "manifest.json"]);
/** copy name without a version infix: a.test.r2.js -> a.test.js, kit.v1.mjs -> kit.mjs @param {string} name */
const unversioned = name => name.replace(/\.(?:v|r)\d+(?=\.)/g, "");
const baseName = (/** @type {string} */ p) => p.split("/").pop() || "";

/** files under tests/, tools/ and docs/ by unversioned base name (where a field copy's repo file usually lives) @param {string} repo */
function repoNameIndex(repo) {
  /** @type {Map<string, string[]>} */ const out = new Map();
  const walk = (/** @type {string} */ rel) => {
    let list; try { list = readdirSync(join(repo, ...rel.split("/")), { withFileTypes: true }); } catch { return; }
    for (const d of list) {
      if (d.name === "node_modules" || d.name.startsWith(".")) continue;
      const p = `${rel}/${d.name}`;
      if (d.isDirectory()) walk(p);
      else if (d.isFile()) { const k = unversioned(d.name); out.set(k, [...(out.get(k) || []), p]); }
    }
  };
  for (const top of ["tests", "tools", "docs"]) walk(top);
  return out;
}

/**
 * Repo files that a field copy (path relative to its phase folder, not itself a repo path) stands for: a trailing part of
 * its path that is a repo file (relock-8/tests/e2e/x.json -> tests/e2e/x.json), or a file under tests/ tools/ docs/ or in
 * the ledger with the same unversioned name (relock1/cat-pages.test.js, a.test.r2.js -> tests/unit/...); by name only for code
 * and JSON files, never for generic data-set names (set.json, README.md).
 * @param {string} repo @param {string} rel @param {Map<string, string[]>} index @param {Iterable<string>} ledger
 */
function repoCandidates(repo, rel, index, ledger) {
  /** @type {Set<string>} */ const out = new Set();
  const segs = rel.split("/");
  for (let i = 1; i < segs.length; i++) {
    for (const tail of new Set([segs.slice(i).join("/"), [...segs.slice(i, -1), unversioned(segs[segs.length - 1])].join("/")])) {
      const abs = join(repo, ...tail.split("/"));
      if (existsSync(abs) && statSync(abs).isFile()) out.add(tail);
    }
  }
  const key = unversioned(baseName(rel));
  if (!NAME_MATCH_RE.test(key) || GENERIC_NAMES.has(key)) return [...out].sort(); // data sets (set.json, README.md): path match only
  for (const p of index.get(key) || []) out.add(p);
  for (const p of ledger) if (unversioned(baseName(p)) === key) out.add(p);
  return [...out].sort();
}

/** "~/LENSIQ-field/evals/<phase dirs>/<rel>" of a field file @param {string} phase @param {string} rel */
const fieldRef = (phase, rel) => `${FIELD_PREFIX}${phase.split("__").join("/")}/${rel}`;

/**
 * Ledger rule (owner decision 110 ก condition 4, 2026-11-18). For lock blocks stamped "# locked <UTC>" at or after LEDGER_FROM:
 *   L1 a field lock line whose file has a repo copy needs, in the same lock file (same block or later), a repo ledger line with
 *      the same hash, or "# field only <rel>";
 *   L2 a "# repo file" line needs its field copy: a same-hash field line in the same lock file (an unmarked line with the same
 *      hash and the same path counts: mirrored field folders), or a valid "field:" reference.
 * On every line: a "field:" reference must name a hash line (same hash, same path) of evals-locks/<phase>.sha256, and a
 * "late entry" line must carry one. With opts.field, every field copy of those lines must exist on disk under the evals
 * root with that hash and be listed in its phase's locked.sha256. L1 gaps in earlier blocks are returned as history.
 * @param {string} repo @param {string[]} lockFiles @param {Set<string>} dirs @param {{field?: boolean, root?: string}} opts
 */
function checkLedger(repo, lockFiles, dirs, opts) {
  /** @type {string[]} */ const problems = [], history = [];
  /** @type {Map<string, {raw: string[], events: ReturnType<typeof lockEvents>}>} */ const files = new Map();
  for (const f of lockFiles) {
    const text = readFileSync(join(repo, "evals-locks", f), "utf8");
    files.set(f, { raw: text.split(/\r?\n/), events: lockEvents(text).filter(e => e.kind === "hash") });
  }
  /** @type {Set<string>} */ const ledger = new Set();
  for (const { events } of files.values()) for (const e of events) if (isRepoPath(e, dirs)) ledger.add(e.path);
  const index = repoNameIndex(repo);
  const root = opts.root || EVALS_ROOT;
  /** @type {Set<string>} */ const diskDone = new Set();
  /** on-disk field copy check @param {string} phase @param {string} rel @param {string} hash @param {string} where */
  const disk = (phase, rel, hash, where) => {
    const key = `${phase}\0${rel}\0${hash}`;
    if (!opts.field || diskDone.has(key)) return;
    diskDone.add(key);
    let dir; try { dir = phaseDir(phase, root); } catch { problems.push(`${where}: field copy ${fieldRef(phase, rel)}: invalid phase "${phase}"`); return; }
    const abs = join(dir, ...rel.split("/")), rec = join(dir, "locked.sha256");
    /** @type {string[]} */ const why = [];
    if (!existsSync(abs) || !statSync(abs).isFile()) why.push("missing on disk");
    else if (sha256(readFileSync(abs)) !== hash) why.push(`differs on disk (sha256 ${sha256(readFileSync(abs))}, ledger ${hash})`);
    if (!existsSync(rec) || !(parseLock(readFileSync(rec, "utf8")).get(hash) || []).includes(rel)) why.push(`not listed with ${hash} in ${fieldRef(phase, "locked.sha256")}`);
    if (why.length) problems.push(`${where}: field copy ${fieldRef(phase, rel)} ${why.join("; ")}.`);
  };
  /** resolve "field: ~/LENSIQ-field/evals/<a>/<b>/<rel>" to a hash line of evals-locks/<phase>.sha256 @param {string} ref @param {string} hash */
  const resolveRef = (ref, hash) => {
    const parts = ref.split("/");
    for (let k = 1; k < parts.length; k++) {
      const phase = parts.slice(0, k).join("__"), rel = parts.slice(k).join("/");
      const lf = files.get(`${phase}.sha256`);
      if (lf && lf.events.some(e => e.hash === hash && e.path === rel)) return { phase, rel };
    }
    return null;
  };
  for (const [f, { raw, events }] of files) {
    const phase = f.slice(0, -".sha256".length);
    /** @type {string[]} */ const stamp = [];
    /** @type {number[]} */ const blockStart = [];
    let cur = "", start = 1;
    raw.forEach((l, i) => { const m = l.match(LOCKED_RE); if (m) { cur = m[1]; start = i + 1; } stamp[i + 1] = cur; blockStart[i + 1] = start; });
    /** @type {Set<string>} */ const fieldOnly = new Set();
    for (const l of raw) { const m = l.trim().match(FIELD_ONLY_RE); if (m) fieldOnly.add(m[1].replace(/^\.\//, "")); }
    for (const e of events) {
      const where = `evals-locks/${f} line ${e.line}`;
      const isNew = stamp[e.line] >= LEDGER_FROM;
      const line = raw[e.line - 1];
      if (isRepoPath(e, dirs)) {
        const ref = line.match(FIELD_REF_RE);
        if (ref) {
          const r = resolveRef(ref[1], /** @type {string} */ (e.hash));
          if (!r) problems.push(`${where}: ${e.path}: the field: reference ${FIELD_PREFIX}${ref[1]} names no line "${e.hash}  <rel>" in evals-locks/<phase>.sha256.`);
          else disk(r.phase, r.rel, /** @type {string} */ (e.hash), where);
        } else if (LATE_RE.test(line)) {
          problems.push(`${where}: ${e.path}: a late entry must name its field copy ("field: ${FIELD_PREFIX}<phase>/<rel>").`);
        } else if (isNew && e.marked) {
          // field copy: a same-hash field line, or (mirrored field folder) an unmarked line with the same hash and the same path
          const copy = events.find(x => x.hash === e.hash && (!isRepoPath(x, dirs) || (!x.marked && x.path === e.path)));
          if (!copy) problems.push(`${where}: ${e.path}: repo ledger line without a field copy (no field line with ${e.hash} in this lock file, no "field:" reference).`);
        } else if (isNew) disk(phase, e.path, /** @type {string} */ (e.hash), where); // the field file sits at its repo path
        continue;
      }
      if (isNew) disk(phase, e.path, /** @type {string} */ (e.hash), where);
      const cands = repoCandidates(repo, e.path, index, ledger);
      if (!cands.length || fieldOnly.has(e.path)) continue;
      const ok = events.some(x => x.hash === e.hash && x.line >= blockStart[e.line] && isRepoPath(x, dirs));
      if (ok) continue;
      const msg = `${where}: field lock "${e.path}" (${e.hash}) has no repo ledger line for ${cands.join(" / ")}: append ` +
        `"${e.hash}  <repo path>  # repo file (...; field: ${fieldRef(phase, e.path)})" in the same commit (tools/eval-guard.mjs lock writes it), ` +
        `or "# field only ${e.path}" if no repo file uses it.`;
      (isNew ? problems : history).push(msg);
    }
  }
  return { problems, history };
}

/**
 * Owner decision 85 ก (2026-11-17): every repo file named in any evals-locks/*.sha256 must equal its LATEST locked hash.
 * Locks are append-only: within a lock file the last entry for a path wins; across lock files a hash that another lock file
 * later replaced (it holds that hash and then a newer line for the path) is superseded; lock files that still disagree are a
 * conflict. A locked file that is gone from the repo fails unless a lock file retires it after its last hash line:
 * "# retired <path> reason: <text>". Reads only evals-locks/ (working tree) and the repo files: no ~/LENSIQ-field needed.
 * Without `only`, also the ledger rule (checkLedger; owner decision 110 ก condition 4).
 * @param {{repo?: string, only?: Set<string>, field?: boolean, root?: string}} [opts] (repo, root: tests only; only: limit to these
 *   paths; field: also check the field copies on disk)
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
      if (!isRepoPath(ev, dirs) && !(ev.kind !== "hash" && byPath.has(ev.path))) continue;
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
  /** @type {{path: string, branch: string, reason: string, lockFile: string, line: number}[]} */ const pending = [];
  for (const [path, per] of [...byPath].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (![...per.values()].some(evs => evs.some(e => e.kind === "hash"))) continue; // only retirement lines: nothing locked
    const abs = join(repo, ...path.split("/"));
    const present = existsSync(abs) && statSync(abs).isFile();
    const actual = present ? sha256(readFileSync(abs)) : "";
    /** @type {{lockFile: string, hash: string, line: number}[]} */ const latest = [];
    /** @type {{lockFile: string, reason: string, line: number}[]} */ const retires = [];
    /** @type {{lockFile: string, branch: string, reason: string, line: number}[]} */ const pends = [];
    for (const [lockFile, all] of per) {
      let n = all.length; // pending lines after the last hash / retirement line of this lock file
      while (n > 0 && all[n - 1].kind === "pending") n--;
      if (n < all.length) { const q = all[all.length - 1]; pends.push({ lockFile, branch: /** @type {string} */ (q.branch), reason: /** @type {string} */ (q.reason), line: q.line }); }
      const evs = all.slice(0, n);
      if (!evs.length) continue;
      const last = evs[evs.length - 1];
      if (last.kind === "hash") latest.push({ lockFile, hash: /** @type {string} */ (last.hash), line: last.line });
      else retires.push({ lockFile, reason: /** @type {string} */ (last.reason), line: last.line });
    }
    // superseded: another lock file holds this hash for the path and has a later line (new hash or retirement) after it
    const live = latest.filter(c => ![...per].some(([lf, evs]) => {
      if (lf === c.lockFile) return false;
      const i = evs.findIndex(e => e.kind === "hash" && e.hash === c.hash);
      return i >= 0 && evs.slice(i + 1).some(e => e.kind === "retire" || (e.kind === "hash" && e.hash !== c.hash));
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
    if (!present && pends.length) { // locked before the code; re-checked when the branch is merged
      const q = pends[0];
      pending.push({ path, branch: q.branch, reason: q.reason, lockFile: q.lockFile, line: q.line });
      continue;
    }
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
  const ledger = opts.only ? { problems: [], history: [] } : checkLedger(repo, lockFiles, dirs, opts);
  return { checked, retired, pending, issues, problems: [...issues.map(i => i.message), ...ledger.problems], history: ledger.history,
    lockFiles: lockFiles.length };
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
 * Ledger rule (owner decision 110 ก condition 4): the repo copy also gets, in the same block, one
 * "<sha256>  <repo path>  # repo file (same commit as lock <UTC>; field: ~/LENSIQ-field/evals/<phase>/<rel>)" line per field
 * file whose repo copy is found (repoCandidates, or "<file>=<repo path>"); "<file>=-" records "# field only <file>". It
 * refuses, writing nothing, when the repo copy differs. Other lock files whose latest hash for that repo path differs get
 * the same repo line appended, so both the re-lock and every ledger line land in one commit.
 * @param {string} phase @param {string[]} files @param {{root?: string, repo?: string, log?: (m: string) => void}} [opts]
 */
export function lock(phase, files, opts = {}) {
  checkPhase(phase);
  checkOverrides(opts);
  const repo = opts.repo || REPO, log = opts.log || console.log;
  const args = (Array.isArray(files) ? files : []).map(f => {
    const i = f.lastIndexOf("=");
    return i > 0 ? { file: f.slice(0, i), map: f.slice(i + 1) } : { file: f, map: "" };
  });
  const { dirReal, ok, problems } = resolveFiles(phase, args.map(a => a.file), opts);
  if (problems.length) throw new Error(`eval-guard: refusing to lock phase "${phase}":\n  - ${problems.join("\n  - ")}`);
  const t = utcNow();
  const items = ok.map((f, i) => ({ path: f.path, map: args[i].map, rel: relative(dirReal, f.path).split(sep).join("/"), sha256: sha256(readFileSync(f.path)) }));
  // ledger lines (decided before anything is written)
  const dirs = repoRootDirs(repo);
  const lockDir = join(repo, "evals-locks");
  const lockNames = existsSync(lockDir) ? readdirSync(lockDir).filter(f => f.endsWith(".sha256")).sort() : [];
  /** @type {Map<string, ReturnType<typeof lockEvents>>} */ const lockEv = new Map();
  for (const f of lockNames) lockEv.set(f, lockEvents(readFileSync(join(lockDir, f), "utf8")).filter(e => e.kind === "hash" || e.kind === "retire"));
  const ledgerPaths = new Set([...lockEv.values()].flatMap(evs => evs.filter(e => e.kind === "hash" && isRepoPath(e, dirs)).map(e => e.path)));
  const index = repoNameIndex(repo);
  const repoHash = (/** @type {string} */ p) => { const abs = join(repo, ...p.split("/")); return existsSync(abs) && statSync(abs).isFile() ? sha256(readFileSync(abs)) : null; };
  /** @type {{rel: string, sha256: string, target: string}[]} */ const ledger = [];
  /** @type {string[]} */ const fieldOnly = [], refused = [];
  for (const it of items) {
    if (it.map === "-") { fieldOnly.push(it.rel); continue; }
    if (it.map) {
      const target = it.map.replace(/^\.\//, "");
      if (isAbsolute(target) || target.split("/").includes("..")) { refused.push(`${it.rel}=${it.map}: name a path inside the repo`); continue; }
      const h = repoHash(target);
      if (h === null) refused.push(`${it.rel}=${target}: ${target} is not a file in the repo (copy the field file there first)`);
      else if (h !== it.sha256) refused.push(`${it.rel}: the repo copy ${target} differs from the field file (repo ${h}, field ${it.sha256})`);
      else ledger.push({ rel: it.rel, sha256: it.sha256, target });
      continue;
    }
    if (isRepoPath({ path: it.rel, marked: false }, dirs)) { // the field file sits at its repo path: its own line is the ledger line
      const h = repoHash(it.rel);
      if (h !== null && h !== it.sha256) refused.push(`${it.rel}: the repo copy ${it.rel} differs from the field file (repo ${h}, field ${it.sha256})`);
      continue;
    }
    const cands = repoCandidates(repo, it.rel, index, ledgerPaths);
    const same = cands.filter(c => repoHash(c) === it.sha256);
    if (same.length) for (const target of same) ledger.push({ rel: it.rel, sha256: it.sha256, target });
    else if (cands.length) {
      refused.push(`${it.rel}: the repo copy ${cands.join(" / ")} differs from the field file (field ${it.sha256}). Copy the field file into ` +
        `the repo first so the lock and its ledger line land in one commit, name the repo file as ${it.rel}=<repo path>, or use ${it.rel}=- ` +
        "if no repo file uses it");
    }
  }
  if (refused.length) throw new Error(`eval-guard: refusing to lock phase "${phase}" (ledger rule, owner decision 110 ก):\n  - ${refused.join("\n  - ")}`);
  const header = `# locked ${t} (tools/eval-guard.mjs lock, ${items.length} file${items.length === 1 ? "" : "s"})\n`;
  const fieldLines = items.map(i => `${i.sha256}  ${i.rel}\n`).join("");
  const block = header + fieldLines +
    ledger.map(l => `${l.sha256}  ${l.target}  # repo file (same commit as lock ${t}; field: ${fieldRef(phase, l.rel)})\n`).join("") +
    fieldOnly.map(r => `# field only ${r} (lock ${t}: no repo file uses it)\n`).join("");
  // other lock files whose latest entry for a ledger path is an older hash
  /** @type {Map<string, string>} */ const others = new Map();
  for (const l of ledger) {
    for (const [f, evs] of lockEv) {
      if (f === `${phase}.sha256`) continue;
      const mine = evs.filter(e => e.path === l.target);
      const last = mine[mine.length - 1];
      if (!last || last.kind !== "hash" || last.hash === l.sha256) continue;
      others.set(f, (others.get(f) || "") + `${l.sha256}  ${l.target}  # repo file (re-locked in evals-locks/${phase}.sha256 at ${t}, replaces ` +
        `${last.hash} of line ${last.line}; field: ${fieldRef(phase, l.rel)})\n`);
    }
  }
  /** @param {string} file @param {string} text */
  const append = (file, text) => {
    const prev = existsSync(file) ? readFileSync(file, "utf8") : "";
    appendFileSync(file, (prev && !prev.endsWith("\n") ? "\n" : "") + text);
  };
  const repoFile = join(repo, "evals-locks", `${phase}.sha256`), fieldFile = join(dirReal, "locked.sha256");
  try {
    mkdirSync(join(repo, "evals-locks"), { recursive: true });
    append(repoFile, block);
    for (const [f, text] of others) append(join(lockDir, f), text);
  } catch (e) {
    throw new Error(`eval-guard: could not write the repo copy evals-locks/${phase}.sha256 (${/** @type {any} */ (e).message}); check git diff evals-locks/`);
  }
  try { append(fieldFile, header + fieldLines); } catch (e) {
    throw new Error(`eval-guard: the repo copy evals-locks/${phase}.sha256 was appended, but writing ${fieldFile} failed ` +
      `(${/** @type {any} */ (e).message}). Fix the permission and append the same lines there by hand; do not commit until both match.`);
  }
  const touched = [`evals-locks/${phase}.sha256`, ...[...others.keys()].map(f => `evals-locks/${f}`)];
  const git = `cd "${repo}" && git add ${touched.join(" ")} && git commit -m "evals-locks: lock ${phase} (${items.length} files)"`;
  log(`eval-guard: locked ${items.length} file(s) of phase "${phase}" at ${t}:\n` + items.map(i => `  ${i.sha256}  ${i.rel}`).join("\n") +
    (ledger.length ? "\nRepo ledger lines:\n" + ledger.map(l => `  ${l.sha256}  ${l.target}`).join("\n") : "") +
    (others.size ? `\nAlso appended to: ${[...others.keys()].map(f => `evals-locks/${f}`).join(", ")}` : "") +
    `\nNow commit the repo copy (with the changed repo files) BEFORE measuring:\n  ${git}`);
  return { phase, files: items.map(i => ({ path: i.path, sha256: i.sha256 })), ledger: ledger.map(l => ({ path: l.target, sha256: l.sha256 })), git };
}

const USAGE = "usage: node tools/eval-guard.mjs check <phase> <files...>   |   node tools/eval-guard.mjs lock <phase> <file>[=<repo path>|=-]...   |   " +
  "node tools/eval-guard.mjs repo [--field] [--history]";

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
      const r = checkRepoLocks({ ...(i >= 0 ? { repo: resolve(args[i + 1] || "") } : {}), ...(args.includes("--field") ? { field: true } : {}) });
      if (r.problems.length) {
        console.error(`eval-guard repo: ${r.problems.length} locked repo file(s) differ from their latest lock (owner decision 85 ก):\n  - ` +
          r.problems.join("\n  - ") + "\n  Never edit a lock to match a changed test without a documented re-lock (docs/EVAL-LOCKS.md).");
        process.exit(1);
      }
      console.log(`eval-guard repo OK: ${r.checked.length} locked repo file(s) match their latest lock in ${r.lockFiles} lock file(s); ` +
        `${r.retired.length} retired; ${r.pending.length} pending (absent until their branch is merged).`);
      if (r.history.length) {
        console.log(`eval-guard repo: note: ${r.history.length} field lock(s) stamped before LEDGER_FROM ${LEDGER_FROM} have no repo ledger line ` +
          `(history; ${args.includes("--history") ? "listed below" : "list them with --history"}).`);
        if (args.includes("--history")) console.log("  - " + r.history.join("\n  - "));
      }
    }
    else { console.error(USAGE); process.exit(1); }
  } catch (e) {
    console.error(String(/** @type {any} */ (e).message || e));
    process.exit(1);
  }
}
