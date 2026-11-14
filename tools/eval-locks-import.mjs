#!/usr/bin/env node
// tools/eval-locks-import.mjs — copies the lock files kept next to the sets (~/LENSIQ-field/evals/**/locked.sha256,
// keys-locked.sha256, *-locked-set.sha256, images.sha256; the gates/ worktree copies are skipped) into the repo's
// evals-locks/<phase>.sha256 (nested folders as a__b), so a lost field folder can still be checked against committed hashes.
// Deterministic, idempotent, append-only: a line already in the repo file is never written again, and existing repo lines
// are never changed or removed. Lines are copied verbatim, except: text lines without a hash get a "# " prefix, and lines
// for files inside the repo get "  # repo file". It measures nothing and reads no set.
//   node tools/eval-locks-import.mjs [--json]     then review and commit evals-locks/
// Findings (printed, never "fixed"): locked files that no longer exist, files changed after locking, aggregate hashes
// that cannot be checked file by file, and field lock files rewritten in place (repo lines no longer in the field copy).
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { EVALS_ROOT, REPO } from "./eval-guard.mjs";

const SOURCE_RE = /locked.*\.sha256$|^images\.sha256$/;
const PAIR_RE = /\b([0-9a-f]{64})\b\s+(\S+)/;
const HASH_LINE_RE = /^[0-9a-f]{64}\s+\S/;
const REPO_MARK = "  # repo file";
/** @param {string} f */
const sha = f => createHash("sha256").update(readFileSync(f)).digest("hex");
/** @param {string} l */
const norm = l => (l.endsWith(REPO_MARK) ? l.slice(0, -REPO_MARK.length) : l);

/** @param {string} root @param {string} [d] @returns {string[]} */
function sources(root, d = root) {
  /** @type {string[]} */ const out = [];
  for (const n of readdirSync(d).sort()) {
    const p = join(d, n);
    if (d === root && n === "gates") continue; // gate worktree copies of the repo, not locks
    const st = statSync(p);
    if (st.isDirectory()) out.push(...sources(root, p));
    else if (SOURCE_RE.test(n)) out.push(p);
  }
  return out;
}

/** phase of a source lock file @param {string} root @param {string} f */
function phaseOfSource(root, f) {
  const rel = relative(root, dirname(f));
  if (!rel) return f.endsWith("-locked.sha256") ? f.slice(dirname(f).length + 1, -"-locked.sha256".length) : "";
  return rel.split(sep).join("__");
}

/**
 * @param {{root?: string, repo?: string, date?: string}} [opts]
 * @returns {{phases: {phase: string, src: string[], hashLines: number, appended: number}[], findings: string[]}}
 */
export function importLocks(opts = {}) {
  const root = resolve(opts.root || EVALS_ROOT), repo = resolve(opts.repo || REPO);
  const date = opts.date || new Date().toISOString().slice(0, 10);
  const shown = (/** @type {string} */ p) => (p.startsWith(homedir() + sep) ? "~/" + relative(homedir(), p) : p);
  const top = new Set(readdirSync(repo));
  /** @type {string[]} */ const findings = [];
  /** @type {Map<string, {src: string, lines: string[], hashLines: number}[]>} */ const byPhase = new Map();
  for (const f of sources(root)) {
    const phase = phaseOfSource(root, f);
    const srcName = relative(root, f);
    if (!/^[a-z0-9][a-z0-9._-]*(__[a-z0-9][a-z0-9._-]*)*$/.test(phase)) { findings.push(`${srcName}: folder name is not a valid lowercase phase; skipped`); continue; }
    const fileDir = /images\.sha256$/.test(f) ? join(dirname(f), "images") : dirname(f);
    /** @type {string[]} */ const lines = [];
    /** @type {Map<string, {rel: string, hashes: Set<string>}>} */ const seen = new Map();
    let hashLines = 0;
    for (const raw of readFileSync(f, "utf8").split(/\r?\n/)) {
      if (!raw.trim()) continue;
      if (raw.trim().startsWith("#")) { lines.push(raw); continue; }
      const m = raw.match(PAIR_RE);
      if (!m) { lines.push("# " + raw); continue; }
      hashLines++;
      const p = m[2];
      let kind;
      if (p.includes("*")) kind = "aggregate";
      else if (isAbsolute(p)) kind = existsSync(p) ? "field" : "field-missing";
      else if (existsSync(join(fileDir, p))) kind = "field";
      else if (p.includes("/") && top.has(p.split("/")[0])) kind = existsSync(join(repo, p)) ? "repo" : "repo-missing";
      else if (existsSync(join(repo, p))) kind = "repo";
      else kind = "field-missing";
      lines.push(kind.startsWith("repo") ? raw + REPO_MARK : raw);
      if (kind === "field-missing") findings.push(`${srcName}: ${p} — locked file no longer exists`);
      if (kind === "repo-missing") findings.push(`${srcName}: ${p} — locked repo file no longer exists in this checkout`);
      if (kind === "aggregate") {
        const d = join(fileDir, dirname(p));
        findings.push(`${srcName}: ${p} — aggregate hash over a file group, not checkable file by file (${existsSync(d) ? "folder present" : "folder no longer exists"})`);
      }
      if (kind === "field" || kind === "repo") {
        const w = isAbsolute(p) ? p : kind === "field" ? join(fileDir, p) : join(repo, p);
        const e = seen.get(w) || { rel: p, hashes: new Set() };
        e.hashes.add(m[1]);
        seen.set(w, e);
      }
    }
    for (const [w, e] of seen) {
      if (statSync(w).isFile() && !e.hashes.has(sha(w))) findings.push(`${srcName}: ${e.rel} — exists, but its sha256 matches none of its lock lines (changed after locking)`);
    }
    const list = byPhase.get(phase) || [];
    list.push({ src: srcName, lines, hashLines });
    byPhase.set(phase, list);
  }
  /** @type {{phase: string, src: string[], hashLines: number, appended: number}[]} */ const phases = [];
  mkdirSync(join(repo, "evals-locks"), { recursive: true });
  for (const [phase, list] of [...byPhase].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const file = join(repo, "evals-locks", `${phase}.sha256`);
    const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
    const have = new Set(existing.split(/\r?\n/).map(norm));
    const fieldNorm = new Set(list.flatMap(x => x.lines.map(norm)));
    let appended = 0, text = "";
    if (!existing) {
      text += `# evals-locks/${phase}.sha256 — committed copy of the locks of ${shown(join(root, ...phase.split("__")))}/ ` +
        "(owner rule 2026-11-13, locked sets persist). Append-only. Checked by tools/eval-guard.mjs.\n";
    }
    for (const x of list) {
      const fresh = x.lines.filter(l => !have.has(norm(l)));
      if (!fresh.length) continue;
      const head = `# --- from ${shown(join(root, x.src))} (tools/eval-locks-import.mjs ${date}) ---`;
      if (!have.has(head)) { text += head + "\n"; have.add(head); }
      for (const l of fresh) { if (have.has(norm(l))) continue; text += l + "\n"; have.add(norm(l)); appended++; }
    }
    if (text) {
      if (existing) appendFileSync(file, (existing.endsWith("\n") ? "" : "\n") + text);
      else writeFileSync(file, text);
    }
    const gone = existing.split(/\r?\n/).filter(l => HASH_LINE_RE.test(l) && !fieldNorm.has(norm(l)));
    if (gone.length) {
      findings.push(`${phase}: field lock file rewritten in place — ${gone.length} line(s) in evals-locks/${phase}.sha256 are no longer in ` +
        `${list.map(x => x.src).join(", ")} (kept in the repo; new lines appended)`);
    }
    phases.push({ phase, src: list.map(x => x.src), hashLines: list.reduce((a, x) => a + x.hashLines, 0), appended });
  }
  return { phases, findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const r = importLocks();
  if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 1));
  else {
    for (const p of r.phases) console.log(`${p.phase.padEnd(36)} ${String(p.hashLines).padStart(4)} hash lines in field  ${p.appended ? "+" + p.appended + " appended" : "up to date"}`);
    console.log(`\nfindings (${r.findings.length}):\n` + r.findings.map(f => "  - " + f).join("\n"));
  }
}
