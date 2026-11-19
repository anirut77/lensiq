// tests/unit/pii-prepush.test.js — owner order 2026-11-19: a PRE-PUSH personal-data check (pushing is when data leaks),
// on top of tools/pii-scan.mjs (owner decision 111). tools/git-hooks/pre-push (sh) runs tools/git-hooks/pii-hook.mjs,
// which reads git's "<local ref> <local sha> <remote ref> <remote sha>" lines and scans only the commits being pushed:
// remote..local for an existing branch, <merge-base with origin/main>..local for a new branch (never the full history),
// nothing for a deletion. It loads the scanner from origin/main (or origin/pii-guard) with `git show`, so it works on
// branches that do not contain tools/pii-scan.mjs. It fails closed (node missing, no scanner, scan error), prints types
// and paths only, and names the owner's bypass (`git push --no-verify`). tools/git-hooks/pre-commit runs the same helper
// on the staged change. tools/install-hooks.mjs copies the hooks to a stable folder outside any repo and sets
// core.hooksPath, refusing when active hooks would be shadowed. Every sample is built at run time (no value in this file).
// This file is locked: evals-locks/pii-prepush.sha256 (written BEFORE pii-hook.mjs and install-hooks.mjs existed).
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const HOOKS = join(REPO, "tools", "git-hooks");
const HELPER = join(HOOKS, "pii-hook.mjs");
const INSTALL = join(REPO, "tools", "install-hooks.mjs");
const ZERO = "0".repeat(40);
let H;
before(async () => { H = await import(pathToFileURL(HELPER).href); });

const J = (...parts) => parts.join("");
const thaiId = first12 => {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(first12[i]) * (13 - i);
  return first12 + String((11 - (s % 11)) % 10);
};
const ID = thaiId(J("3", "1012", "00456", "78"));
const dashed = id => [id[0], id.slice(1, 5), id.slice(5, 10), id.slice(10, 12), id[12]].join("-");
const noRaw = out => {
  assert.ok(!out.includes(ID) && !out.includes(dashed(ID)), "output must not contain the value");
  assert.ok(!out.replace(/\D/g, " ").split(/\s+/).includes(ID), "output must not contain the digits");
};

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
delete GIT_ENV.GIT_DIR; delete GIT_ENV.GIT_WORK_TREE; delete GIT_ENV.GIT_INDEX_FILE;
const git = (dir, ...args) => {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8", env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
const commitFile = (dir, name, text, msg) => {
  writeFileSync(join(dir, name), text);
  git(dir, "add", name);
  git(dir, "commit", "-q", "-m", msg);
  return git(dir, "rev-parse", "HEAD");
};
const hook = (dir, name, stdin, env = {}) =>
  spawnSync("sh", [join(HOOKS, name), "origin", "https://example.invalid/repo.git"],
    { cwd: dir, input: stdin, encoding: "utf8", env: { ...GIT_ENV, ...env } });

/**
 * origin (bare) + clone. origin/main: README (commit A), then the scanner and allow-list (commit B), optionally.
 * Branch "old" starts at A, so it has no tools/pii-scan.mjs.
 */
function fixture({ scannerOn = "main" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "pii-prepush-"));
  const origin = join(root, "origin.git"), seed = join(root, "seed"), work = join(root, "work");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  mkdirSync(seed);
  git(seed, "init", "-q", "-b", "main");
  const A = commitFile(seed, "README.md", "clean\n", "A");
  if (scannerOn) {
    if (scannerOn !== "main") git(seed, "checkout", "-q", "-b", scannerOn);
    mkdirSync(join(seed, "tools"));
    copyFileSync(join(REPO, "tools", "pii-scan.mjs"), join(seed, "tools", "pii-scan.mjs"));
    copyFileSync(join(REPO, "tools", "pii-allow.json"), join(seed, "tools", "pii-allow.json"));
    git(seed, "add", "-A");
    git(seed, "commit", "-q", "-m", "B scanner");
  }
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "-q", "origin", "--all");
  git(root, "clone", "-q", origin, work);
  git(work, "checkout", "-q", "-b", "old", A);
  return { root, work, A };
}

// ---- pure logic ----
test("parsePushLines reads git's pre-push stdin", () => {
  const a = "a".repeat(40), b = "b".repeat(40);
  assert.deepEqual(H.parsePushLines(`refs/heads/x ${a} refs/heads/x ${b}\n\n(delete) ${ZERO} refs/heads/y ${b}\n`), [
    { localRef: "refs/heads/x", localSha: a, remoteRef: "refs/heads/x", remoteSha: b },
    { localRef: "(delete)", localSha: ZERO, remoteRef: "refs/heads/y", remoteSha: b }
  ]);
  assert.deepEqual(H.parsePushLines(""), []);
});

test("planRanges: existing branch remote..local; new branch merge-base..local; deletion skipped; never full history", () => {
  const L = "1".repeat(40), R = "2".repeat(40), M = "3".repeat(40), U = "4".repeat(40);
  const env = { hasCommit: s => s !== U, mergeBase: s => (s === L ? M : null) };
  const plan = H.planRanges([
    { localRef: "refs/heads/a", localSha: L, remoteRef: "refs/heads/a", remoteSha: R },
    { localRef: "refs/heads/b", localSha: L, remoteRef: "refs/heads/b", remoteSha: ZERO },
    { localRef: "(delete)", localSha: ZERO, remoteRef: "refs/heads/c", remoteSha: R },
    { localRef: "refs/heads/d", localSha: L, remoteRef: "refs/heads/d", remoteSha: U }
  ], env);
  assert.equal(plan[0].range, `${R}..${L}`);
  assert.equal(plan[1].range, `${M}..${L}`);
  assert.equal(plan[2].skip, "delete");
  assert.equal(plan[3].range, `${M}..${L}`, "remote sha unknown locally: fall back to the merge-base");
  for (const p of plan) if (p.range) assert.match(p.range, /^[0-9a-f]{40}\.\.[0-9a-f]{40}$/, "always a bounded A..B range");
  const none = H.planRanges([{ localRef: "refs/heads/e", localSha: L, remoteRef: "refs/heads/e", remoteSha: ZERO }],
    { hasCommit: () => true, mergeBase: () => null });
  assert.ok(none[0].error, "no merge-base: an error (fail closed), never a full-history scan");
});

// ---- pre-push against throw-away repositories ----
test("pre-push: a branch WITHOUT the scanner files passes a clean push and blocks a Thai ID (type + path, no value)", () => {
  const { root, work } = fixture();
  try {
    assert.ok(!existsSync(join(work, "tools", "pii-scan.mjs")), "branch has no scanner");
    const clean = commitFile(work, "notes.txt", "nothing personal\n", "clean");
    let r = hook(work, "pre-push", `refs/heads/old ${clean} refs/heads/old ${ZERO}\n`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const bad = commitFile(work, "form.txt", `เลขประจำตัว ${dashed(ID)}\n`, "bad");
    r = hook(work, "pre-push", `refs/heads/old ${bad} refs/heads/old ${ZERO}\n`);
    const out = r.stdout + r.stderr;
    assert.equal(r.status, 1, out);
    assert.match(out, /thai-id/);
    assert.match(out, /form\.txt/);
    assert.match(out, /git push --no-verify/, "names the owner's bypass");
    noRaw(out);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre-push: an existing branch scans only remote..local (an already-pushed hit is not re-reported)", () => {
  const { root, work } = fixture();
  try {
    const bad = commitFile(work, "form.txt", `เลขประจำตัว ${dashed(ID)}\n`, "bad");
    git(work, "push", "-q", "origin", "old");
    const clean = commitFile(work, "notes.txt", "nothing personal\n", "clean");
    const r = hook(work, "pre-push", `refs/heads/old ${clean} refs/heads/old ${bad}\n`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre-push: a deletion is skipped; an up-to-date push (no lines) passes", () => {
  const { root, work, A } = fixture();
  try {
    assert.equal(hook(work, "pre-push", `(delete) ${ZERO} refs/heads/gone ${A}\n`).status, 0);
    assert.equal(hook(work, "pre-push", "").status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre-push: scanner loaded from origin/pii-guard when origin/main does not have it yet", () => {
  const { root, work } = fixture({ scannerOn: "pii-guard" });
  try {
    const bad = commitFile(work, "form.txt", `เลขประจำตัว ${dashed(ID)}\n`, "bad");
    const r = hook(work, "pre-push", `refs/heads/old ${bad} refs/heads/old ${ZERO}\n`);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /thai-id/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre-push fails closed: no scanner on any ref, or node missing (non-zero, clear message)", () => {
  const { root, work } = fixture({ scannerOn: "" });
  try {
    const clean = commitFile(work, "notes.txt", "nothing personal\n", "clean");
    let r = hook(work, "pre-push", `refs/heads/old ${clean} refs/heads/old ${ZERO}\n`);
    assert.notEqual(r.status, 0, "no scanner: blocked");
    assert.match(r.stdout + r.stderr, /scanner/i);
    assert.match(r.stdout + r.stderr, /git push --no-verify/);
    r = hook(work, "pre-push", `refs/heads/old ${clean} refs/heads/old ${ZERO}\n`, { LENSIQ_HOOK_NODE: "/nonexistent/node" });
    assert.notEqual(r.status, 0, "node missing: blocked");
    assert.match(r.stdout + r.stderr, /node/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---- pre-commit (same helper, staged change) ----
test("pre-commit: works on a branch without the scanner; blocks a staged Thai ID, passes a clean index", () => {
  const { root, work } = fixture();
  try {
    writeFileSync(join(work, "ok.txt"), "nothing personal\n");
    git(work, "add", "ok.txt");
    let r = hook(work, "pre-commit", "");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    writeFileSync(join(work, "form.txt"), `เลขประจำตัว ${dashed(ID)}\n`);
    git(work, "add", "form.txt");
    r = hook(work, "pre-commit", "");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /thai-id/);
    noRaw(r.stdout + r.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---- installer ----
test("install-hooks: copies the hooks to a stable folder, sets core.hooksPath; new worktrees inherit it", () => {
  const { root, work } = fixture();
  const dest = join(root, "stable-hooks");
  try {
    const r = spawnSync(process.execPath, [INSTALL, "--dest", dest, "--repo", work], { encoding: "utf8", env: GIT_ENV });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const f of ["pre-push", "pre-commit", "pii-hook.mjs"]) {
      assert.ok(existsSync(join(dest, f)), f);
      assert.equal(readFileSync(join(dest, f), "utf8"), readFileSync(join(HOOKS, f), "utf8"), `${f} is an exact copy`);
    }
    assert.ok(statSync(join(dest, "pre-push")).mode & 0o100, "pre-push is executable");
    assert.ok(statSync(join(dest, "pre-commit")).mode & 0o100, "pre-commit is executable");
    assert.equal(git(work, "config", "core.hooksPath"), dest);
    git(work, "worktree", "add", "-q", join(root, "wt2"), "-b", "wt2");
    assert.equal(git(join(root, "wt2"), "config", "core.hooksPath"), dest, "a new worktree gets it automatically");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("install-hooks refuses (config unchanged) when .git/hooks has an active hook or core.hooksPath points elsewhere", () => {
  const { root, work } = fixture();
  const dest = join(root, "stable-hooks");
  try {
    const active = join(work, ".git", "hooks", "post-merge");
    writeFileSync(active, "#!/bin/sh\nexit 0\n");
    chmodSync(active, 0o755);
    let r = spawnSync(process.execPath, [INSTALL, "--dest", dest, "--repo", work], { encoding: "utf8", env: GIT_ENV });
    assert.notEqual(r.status, 0, "active hook: refused");
    assert.match(r.stdout + r.stderr, /post-merge/);
    assert.equal(spawnSync("git", ["config", "core.hooksPath"], { cwd: work, encoding: "utf8", env: GIT_ENV }).stdout.trim(), "");
    rmSync(active);
    git(work, "config", "core.hooksPath", join(root, "other-hooks"));
    r = spawnSync(process.execPath, [INSTALL, "--dest", dest, "--repo", work], { encoding: "utf8", env: GIT_ENV });
    assert.notEqual(r.status, 0, "another hooksPath: refused");
    assert.equal(git(work, "config", "core.hooksPath"), join(root, "other-hooks"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
