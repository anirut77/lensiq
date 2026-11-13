// tests/unit/eval-guard.test.js — owner rule 2026-11-13 "Locked sets persist" (a locked test set was lost twice).
// Every fixed test / eval set lives in ~/LENSIQ-field/evals/<phase>/ and its sha256 is committed in the repo
// (evals-locks/<phase>.sha256) BEFORE any measurement; tools/eval-guard.mjs refuses to measure otherwise, and every
// measuring harness that reads a set from ~/LENSIQ-field/evals calls it. Fixtures: a throw-away evals root + git repo per
// test (the real ~/LENSIQ-field/evals is never written here). This file is itself locked: evals-locks/eval-guard.sha256.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const GUARD = join(REPO, "tools", "eval-guard.mjs");
let G;
before(async () => { G = await import(pathToFileURL(GUARD).href); });

const sha = b => createHash("sha256").update(b).digest("hex");
const git = (cwd, ...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...a],
  { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();

/** a fake evals root + a fake repo (git) with one committed lock line for phase "p1" */
function sandbox() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "lq-evalguard-")));
  const root = join(base, "evals"), repo = join(base, "repo");
  mkdirSync(join(root, "p1"), { recursive: true });
  mkdirSync(join(repo, "evals-locks"), { recursive: true });
  writeFileSync(join(root, "p1", "set.json"), '{"items":[1,2,3]}\n');
  writeFileSync(join(root, "p1", "labels.jsonl"), '{"id":1}\n');
  git(repo, "init", "-q");
  const lockFile = join(repo, "evals-locks", "p1.sha256");
  writeFileSync(lockFile, "# phase p1, locked before measuring\n" + sha(readFileSync(join(root, "p1", "set.json"))) + "  set.json  # locked 2026-11-13T00:00:00Z\n");
  git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "lock p1");
  return { base, root, repo, lockFile, opts: { root, repo }, done: () => rmSync(base, { recursive: true, force: true }) };
}

test("assertLocked passes for a file under <root>/<phase>/ whose hash is in the committed repo lock", () => {
  const s = sandbox();
  try {
    const r = G.assertLocked("p1", ["set.json"], s.opts);
    assert.equal(r.phase, "p1");
    assert.equal(r.files.length, 1);
    assert.equal(r.files[0].sha256, sha(readFileSync(join(s.root, "p1", "set.json"))));
    assert.equal(r.files[0].path, join(s.root, "p1", "set.json"));
    // absolute paths work too
    assert.equal(G.assertLocked("p1", [join(s.root, "p1", "set.json")], s.opts).files[0].sha256, r.files[0].sha256);
  } finally { s.done(); }
});

test("refuses a file whose hash is not in the repo lock, naming the file and the phase", () => {
  const s = sandbox();
  try {
    assert.throws(() => G.assertLocked("p1", ["labels.jsonl"], s.opts), e => /labels\.jsonl/.test(e.message) && /p1/.test(e.message));
    // a changed file after locking is refused
    appendFileSync(join(s.root, "p1", "set.json"), "changed\n");
    assert.throws(() => G.assertLocked("p1", ["set.json"], s.opts), /set\.json/);
  } finally { s.done(); }
});

test("refuses a missing file and an empty file list", () => {
  const s = sandbox();
  try {
    assert.throws(() => G.assertLocked("p1", ["nope.json"], s.opts), /nope\.json/);
    assert.throws(() => G.assertLocked("p1", [], s.opts), /no files/i);
  } finally { s.done(); }
});

test("refuses when the repo lock file does not exist or is not committed", () => {
  const s = sandbox();
  try {
    mkdirSync(join(s.root, "p2"));
    writeFileSync(join(s.root, "p2", "a.txt"), "a\n");
    assert.throws(() => G.assertLocked("p2", ["a.txt"], s.opts), /evals-locks\/p2\.sha256/);
    // present on disk with the right hash, but untracked
    writeFileSync(join(s.repo, "evals-locks", "p2.sha256"), sha("a\n") + "  a.txt\n");
    assert.throws(() => G.assertLocked("p2", ["a.txt"], s.opts), /not committed|commit/i);
  } finally { s.done(); }
});

test("refuses when the repo lock file has an uncommitted change, even if the hash is in it", () => {
  const s = sandbox();
  try {
    appendFileSync(s.lockFile, sha(readFileSync(join(s.root, "p1", "labels.jsonl"))) + "  labels.jsonl\n");
    assert.throws(() => G.assertLocked("p1", ["labels.jsonl"], s.opts), /uncommitted|commit/i);
    assert.throws(() => G.assertLocked("p1", ["set.json"], s.opts), /uncommitted|commit/i);
    git(s.repo, "commit", "-q", "-am", "lock labels");
    assert.equal(G.assertLocked("p1", ["set.json", "labels.jsonl"], s.opts).files.length, 2);
  } finally { s.done(); }
});

test("a hash that appears only in a comment does not count", () => {
  const s = sandbox();
  try {
    const h = sha(readFileSync(join(s.root, "p1", "labels.jsonl")));
    appendFileSync(s.lockFile, `# ${h}  labels.jsonl (draft, not locked)\n${sha("x")}  other.json  # was ${h}\n`);
    git(s.repo, "commit", "-q", "-am", "comment only");
    assert.throws(() => G.assertLocked("p1", ["labels.jsonl"], s.opts), /labels\.jsonl/);
  } finally { s.done(); }
});

test("refuses paths outside <root>/<phase>/: another phase, ../ escapes, temp files, symlinks pointing out", () => {
  const s = sandbox();
  try {
    mkdirSync(join(s.root, "p3"));
    writeFileSync(join(s.root, "p3", "set.json"), readFileSync(join(s.root, "p1", "set.json")));
    assert.throws(() => G.assertLocked("p1", [join(s.root, "p3", "set.json")], s.opts), /outside/i);
    assert.throws(() => G.assertLocked("p1", ["../p3/set.json"], s.opts), /outside/i);
    const tmp = join(s.base, "elsewhere.json");
    writeFileSync(tmp, readFileSync(join(s.root, "p1", "set.json")));
    assert.throws(() => G.assertLocked("p1", [tmp], s.opts), /outside/i);
    symlinkSync(tmp, join(s.root, "p1", "link.json"));
    assert.throws(() => G.assertLocked("p1", ["link.json"], s.opts), /outside/i);
  } finally { s.done(); }
});

test("forbiddenLocation names temp folders, scratchpads and worktrees; the real evals folder is fine", () => {
  for (const p of [join(tmpdir(), "x", "set.json"), "/tmp/a/set.json", "/private/tmp/a/set.json", "/var/folders/ab/T/x.json",
    "/Users/u/proj/.claude/worktrees/agent-1/x.json", "/private/tmp/claude-502/p/abc/scratchpad/set.json"]) {
    assert.ok(G.forbiddenLocation(p), "should be forbidden: " + p);
  }
  assert.equal(G.forbiddenLocation(join(homedir(), "LENSIQ-field", "evals", "nutrition", "set.json")), null);
});

test("the default evals root is ~/LENSIQ-field/evals; assertLocked, lock and parseLock are exported", () => {
  assert.equal(G.EVALS_ROOT, join(homedir(), "LENSIQ-field", "evals"));
  assert.equal(typeof G.assertLocked, "function");
  assert.equal(typeof G.lock, "function");
  assert.equal(typeof G.parseLock, "function");
});

test("phase names: plain names and nested a__b only", () => {
  const s = sandbox();
  try {
    for (const bad of ["", "../x", "a/b", "/abs", ".", "a__", "__a", "a b"]) assert.throws(() => G.assertLocked(bad, ["set.json"], s.opts), /phase/i, bad);
    assert.equal(G.phaseDir("nutrition__v5", s.root), join(s.root, "nutrition", "v5"));
    assert.equal(G.phaseOf(join(s.root, "nutrition", "v5"), s.root), "nutrition__v5");
    assert.equal(G.phaseOf(join(s.root, "adverts", "fresh2"), s.root), "adverts__fresh2");
    assert.throws(() => G.phaseOf(join(s.base, "repo"), s.root), /outside/i);
  } finally { s.done(); }
});

test("lock() appends to both lock files without rewriting earlier lines and prints the git command; commit makes it pass", () => {
  const s = sandbox();
  try {
    const before1 = readFileSync(s.lockFile, "utf8");
    writeFileSync(join(s.root, "p1", "locked.sha256"), "# earlier lock, kept\n");
    const before2 = readFileSync(join(s.root, "p1", "locked.sha256"), "utf8");
    const logs = [];
    const r = G.lock("p1", ["labels.jsonl"], { ...s.opts, log: m => logs.push(m) });
    const a = readFileSync(s.lockFile, "utf8"), b = readFileSync(join(s.root, "p1", "locked.sha256"), "utf8");
    assert.ok(a.startsWith(before1) && b.startsWith(before2), "earlier lines must stay exactly as they were");
    const line = /^([0-9a-f]{64}) {2}labels\.jsonl {2}# locked \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/m;
    assert.match(a.slice(before1.length), line);
    assert.match(b.slice(before2.length), line);
    assert.equal(a.slice(before1.length).match(line)[1], sha(readFileSync(join(s.root, "p1", "labels.jsonl"))));
    assert.match(r.git, /git add evals-locks\/p1\.sha256/);
    assert.match(r.git, /git commit/);
    assert.ok(logs.join("\n").includes(r.git), "the git command is printed");
    assert.throws(() => G.assertLocked("p1", ["labels.jsonl"], s.opts), /uncommitted|commit/i);
    git(s.repo, "commit", "-q", "-am", "lock");
    assert.equal(G.assertLocked("p1", ["labels.jsonl"], s.opts).files[0].sha256, sha(readFileSync(join(s.root, "p1", "labels.jsonl"))));
    // lock refuses files outside the phase folder too
    assert.throws(() => G.lock("p1", [join(s.base, "repo", "evals-locks", "p1.sha256")], { ...s.opts, log: () => {} }), /outside/i);
  } finally { s.done(); }
});

test("lock() creates the repo lock file for a new phase", () => {
  const s = sandbox();
  try {
    mkdirSync(join(s.root, "fresh", "v1"), { recursive: true });
    writeFileSync(join(s.root, "fresh", "v1", "set.json"), "[]\n");
    G.lock("fresh__v1", ["set.json"], { ...s.opts, log: () => {} });
    assert.match(readFileSync(join(s.repo, "evals-locks", "fresh__v1.sha256"), "utf8"), /set\.json {2}# locked /);
    git(s.repo, "add", "-A"); git(s.repo, "commit", "-q", "-m", "lock fresh");
    assert.equal(G.assertLocked("fresh__v1", ["set.json"], s.opts).files.length, 1);
  } finally { s.done(); }
});

test("CLI: usage and a refused check exit 1 with a message", () => {
  const u = spawnSync(process.execPath, [GUARD], { encoding: "utf8" });
  assert.equal(u.status, 1);
  assert.match(u.stderr + u.stdout, /check <phase>/);
  const c = spawnSync(process.execPath, [GUARD, "check", "no-such-phase-xyz", "set.json"], { encoding: "utf8" });
  assert.equal(c.status, 1);
  assert.match(c.stderr, /no-such-phase-xyz/);
  const bad = spawnSync(process.execPath, [GUARD, "check", "../escape", "set.json"], { encoding: "utf8" });
  assert.equal(bad.status, 1);
});

/* ---------- static wiring: every harness that reads ~/LENSIQ-field/evals calls the guard ---------- */
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const EVALS_REF = /["'`]evals["'`]|LENSIQ-field\/evals/;
// Tools that name the evals folder in code but read no test set from it. Each entry states why and is re-checked below.
const VENDOR_ONLY = { "tools/exam-hall-face-eval.mjs": /["'`]evals["'`]\s*,\s*["'`]exam-followups["'`]\s*,\s*["'`]vendor["'`]/g };

test("every tools/*eval*.mjs that reads from ~/LENSIQ-field/evals imports tools/eval-guard.mjs and calls assertLocked", () => {
  const files = readdirSync(join(REPO, "tools")).filter(f => /eval.*\.mjs$/.test(f) && f !== "eval-guard.mjs").map(f => "tools/" + f);
  const wired = [];
  for (const f of files) {
    const code = stripComments(readFileSync(join(REPO, f), "utf8"));
    if (!EVALS_REF.test(code)) continue;
    if (VENDOR_ONLY[f]) {
      const refs = (code.match(new RegExp(EVALS_REF.source, "g")) || []).length;
      const vendor = (code.match(VENDOR_ONLY[f]) || []).length;
      assert.equal(refs, vendor, `${f}: every evals reference must be the measurement-only vendor folder, else it must call the guard`);
      continue;
    }
    assert.match(code, /from\s+["']\.\/eval-guard\.mjs["']/, `${f} reads ~/LENSIQ-field/evals but does not import ./eval-guard.mjs`);
    assert.match(code, /\bassertLocked\s*\(/, `${f} reads ~/LENSIQ-field/evals but never calls assertLocked`);
    assert.doesNotMatch(code, /assertLocked\s*\([^;]*\b(root|repo)\s*:/, `${f} must not point the guard at another root or repo`);
    wired.push(f);
  }
  for (const f of ["tools/nut-eval.mjs", "tools/exam-hall-detector-eval.mjs", "tools/pc-advert-eval.mjs"]) assert.ok(wired.includes(f), f + " must be guarded");
});

test("the static check catches an unguarded harness (self-test of the detector)", () => {
  const bad = 'import { homedir } from "node:os";\nconst SET = join(homedir(), "LENSIQ-field", "evals", "x"); // read the set\n';
  const bad2 = 'const FIELD = join(homedir(), "LENSIQ-field");\nconst DIR = join(FIELD, "evals", "hall-detector");\n';
  assert.ok(EVALS_REF.test(stripComments(bad2)), "a path built in two steps is caught too");
  assert.ok(EVALS_REF.test(stripComments(bad)));
  assert.ok(!/\bassertLocked\s*\(/.test(stripComments(bad)));
  assert.ok(!EVALS_REF.test(stripComments("// see ~/LENSIQ-field/evals/x\nconst a = 1;\n")), "comments alone do not count");
});

test("repo lock files: phase-named, and this test file is locked in evals-locks/eval-guard.sha256", () => {
  const dir = join(REPO, "evals-locks");
  for (const f of readdirSync(dir)) {
    if (f === "README.md") continue;
    assert.match(f, /^[A-Za-z0-9][A-Za-z0-9._-]*(__[A-Za-z0-9][A-Za-z0-9._-]*)*\.sha256$/, f);
  }
  const own = sha(readFileSync(__filename));
  assert.ok(G.parseLock(readFileSync(join(dir, "eval-guard.sha256"), "utf8")).has(own), "tests/unit/eval-guard.test.js changed after locking");
});
