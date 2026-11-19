#!/usr/bin/env node
// tools/install-hooks.mjs — owner order 2026-11-19: personal-data check on every push and commit, in every worktree.
// Copies tools/git-hooks/{pre-push,pre-commit,pii-hook.mjs} to a stable folder outside any repo (so a worktree on an old
// branch, or a removed worktree, never loses the hook) and points core.hooksPath at it. core.hooksPath lives in the shared
// repo config, so every existing worktree and every new `git worktree add` gets it automatically.
//   node tools/install-hooks.mjs                 install to ~/.config/lensiq/git-hooks and set core.hooksPath on this repo
//   options: --dest DIR (stable folder), --repo DIR (any work tree of the repo), --copy-only (do not touch git config)
// Refuses (exit 1, config unchanged) when core.hooksPath already points somewhere else, or when the repo's .git/hooks has
// an active (non-*.sample) hook that core.hooksPath would silently switch off. Re-running only refreshes the copies.
// Undo: git config --unset core.hooksPath. Bypass for one push (owner only): git push --no-verify.
// Locked test: tests/unit/pii-prepush.test.js (evals-locks/pii-prepush.sha256).
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "git-hooks");
const FILES = ["pre-push", "pre-commit", "pii-hook.mjs"];

/** @param {string} repo @param {string[]} args */
const git = (repo, args) => execFileSync("git", args, { cwd: repo, stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();
/** @param {string} repo @param {string[]} args */
const gitOr = (repo, args, d = "") => { try { return git(repo, args); } catch { return d; } };

function main(argv) {
  const opt = { dest: join(homedir(), ".config", "lensiq", "git-hooks"), repo: process.cwd(), copyOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dest") opt.dest = resolve(argv[++i] || "");
    else if (a === "--repo") opt.repo = resolve(argv[++i] || "");
    else if (a === "--copy-only") opt.copyOnly = true;
    else { console.error(`install-hooks: unknown argument ${a}`); return 2; }
  }

  let common = "";
  if (!opt.copyOnly) {
    try { common = resolve(opt.repo, git(opt.repo, ["rev-parse", "--git-common-dir"])); }
    catch { console.error(`install-hooks: ${opt.repo} is not a git work tree`); return 2; }
    const current = gitOr(opt.repo, ["config", "--get", "core.hooksPath"]);
    if (current && resolve(opt.repo, current) !== opt.dest) {
      console.error(`install-hooks: core.hooksPath is already ${current}; not changed. Remove it first if it should go.`);
      return 1;
    }
    const hooksDir = join(common, "hooks");
    const active = existsSync(hooksDir) ? readdirSync(hooksDir).filter(f => !f.endsWith(".sample") && !f.startsWith(".")
      && statSync(join(hooksDir, f)).isFile() && (statSync(join(hooksDir, f)).mode & 0o111)) : [];
    if (active.length && !current) {
      console.error(`install-hooks: active hooks in ${hooksDir}: ${active.join(", ")}. core.hooksPath would switch them off;`);
      console.error("not changed. Move them into the stable folder (or tell the owner) first.");
      return 1;
    }
  }

  mkdirSync(opt.dest, { recursive: true });
  for (const f of FILES) {
    copyFileSync(join(SRC, f), join(opt.dest, f));
    chmodSync(join(opt.dest, f), 0o755);
  }
  console.log(`install-hooks: copied ${FILES.join(", ")} to ${opt.dest}`);
  if (opt.copyOnly) return 0;

  git(opt.repo, ["config", "core.hooksPath", opt.dest]);
  console.log(`install-hooks: core.hooksPath = ${opt.dest} (shared by every worktree of ${common})`);
  const wts = gitOr(opt.repo, ["worktree", "list", "--porcelain"]).split("\n").filter(l => l.startsWith("worktree ")).map(l => l.slice(9));
  let n = 0;
  for (const wt of wts) {
    const v = existsSync(wt) ? gitOr(wt, ["config", "--get", "core.hooksPath"], "(unset)") : "(missing folder)";
    if (v === opt.dest) n++;
    else console.log(`  NOT active: ${wt} -> ${v}`);
  }
  console.log(`install-hooks: active in ${n} of ${wts.length} worktree(s); new worktrees inherit it.`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
