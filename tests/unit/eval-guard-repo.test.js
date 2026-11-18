// tests/unit/eval-guard-repo.test.js — owner decision 85 ก (2026-11-17): "eval-guard compares every locked test file in
// the project with its locked copy and fails on any difference." A reviewer found that a re-lock left the old copy in
// ~/LENSIQ-field while the repo file changed, and the guard still passed. tools/eval-guard.mjs now also checks, using only
// evals-locks/ and the repo files (no ~/LENSIQ-field; CI has none):
//   for every repo path named in any evals-locks/*.sha256, the current repo file's sha256 equals the LATEST locked hash
//   for that path (locks are append-only; within a lock file the last entry for a path wins; across lock files a hash
//   that another lock file later replaced is superseded; two lock files that still disagree are a conflict).
//   A locked repo file that no longer exists fails unless a lock file retires it, after its last hash line, with
//   "# retired <path> reason: <text>".
// Repo paths: a relative path whose first folder is a folder at the repo root, or any line marked "# repo file". Bare
// names ("README.md"), phase sub-folders ("item5-relock/x.mjs") and absolute paths are copies under ~/LENSIQ-field.
// Fixtures: a throw-away repo folder per test. This file is itself locked: evals-locks/eval-guard.sha256.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const GUARD = join(REPO, "tools", "eval-guard.mjs");
let G;
before(async () => { G = await import(pathToFileURL(GUARD).href); });

const sha = b => createHash("sha256").update(b).digest("hex");
const git = (cwd, ...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...a],
  { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
const V1 = "test('a', () => {});\n", V2 = "test('a', () => { assert.ok(1); });\n", V3 = "test('b', () => {});\n";

/** a fake repo: tests/unit/a.test.js (content V2), README.md, evals-locks/ @param {Record<string, string>} locks */
function repo(locks, files = { "tests/unit/a.test.js": V2 }) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "lq-evalguard-repo-")));
  mkdirSync(join(base, "evals-locks"), { recursive: true });
  writeFileSync(join(base, "README.md"), "# repo readme\n");
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(base, p, ".."), { recursive: true }); writeFileSync(join(base, p), c); }
  for (const [name, text] of Object.entries(locks)) writeFileSync(join(base, "evals-locks", name), text);
  return { repo: base, done: () => rmSync(base, { recursive: true, force: true }) };
}
const run = s => G.checkRepoLocks({ repo: s.repo });

test("passes when the repo file equals the LAST lock entry for its path (earlier entries are history)", () => {
  const s = repo({ "p1.sha256": `# locked 2026-11-13T00:00:00Z\n${sha(V1)}  tests/unit/a.test.js\n# re-lock\n${sha(V2)}  tests/unit/a.test.js\n` });
  try {
    const r = run(s);
    assert.deepEqual(r.problems, []);
    assert.equal(r.checked.length, 1);
    assert.equal(r.checked[0].path, "tests/unit/a.test.js");
    assert.equal(r.checked[0].expected, sha(V2));
  } finally { s.done(); }
});

test("fails when the repo file equals an OLDER lock entry but not the latest", () => {
  const s = repo({ "p1.sha256": `${sha(V2)}  tests/unit/a.test.js\n${sha(V1)}  tests/unit/a.test.js\n` });
  try {
    const r = run(s);
    assert.equal(r.problems.length, 1);
    const m = r.problems[0];
    assert.match(m, /tests\/unit\/a\.test\.js/);
    assert.ok(m.includes(sha(V1)), "names the expected (latest) hash");
    assert.ok(m.includes(sha(V2)), "names the actual hash");
    assert.match(m, /evals-locks\/p1\.sha256/);
  } finally { s.done(); }
});

test("fails with path, expected hash, actual hash and lock file when the repo file changed after locking", () => {
  const s = repo({ "fortune-x.sha256": `${sha(V1)}  tests/unit/a.test.js  # repo file\n` });
  try {
    const r = run(s);
    assert.equal(r.problems.length, 1);
    const m = r.problems[0];
    assert.match(m, /tests\/unit\/a\.test\.js/);
    assert.match(m, new RegExp(`expected[^\\n]*${sha(V1)}`));
    assert.match(m, new RegExp(`actual[^\\n]*${sha(V2)}`));
    assert.match(m, /evals-locks\/fortune-x\.sha256/);
  } finally { s.done(); }
});

test("text after the path on a lock line is ignored; comment lines that contain a hash do not count", () => {
  const s = repo({ "p1.sha256": `${sha(V2)}  tests/unit/a.test.js  (v3: line wrapping only)  # repo file\n# ${sha(V1)}  tests/unit/a.test.js\nLOCK ${sha(V1)}  tests/unit/a.test.js\n` });
  try { assert.deepEqual(run(s).problems, []); } finally { s.done(); }
});

test("copies under ~/LENSIQ-field are not compared: bare names, phase sub-folders and absolute paths", () => {
  const s = repo({ "p1.sha256": `${sha(V2)}  tests/unit/a.test.js\n${sha(V3)}  README.md\n${sha(V3)}  item5-relock-2026-11-17/a.test.js\n` +
    `${sha(V3)}  /Users/someone/LENSIQ-field/evals/p1/holdout.json\n${sha(V3)}  a.test.js\n` });
  try {
    const r = run(s);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.checked.map(c => c.path), ["tests/unit/a.test.js"]);
  } finally { s.done(); }
});

test("a line marked '# repo file' is always a repo path, even at the repo root", () => {
  const s = repo({ "p1.sha256": `${sha(V3)}  README.md  # repo file\n` });
  try {
    const r = run(s);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /README\.md/);
  } finally { s.done(); }
});

test("a locked repo file that was deleted fails, naming the path and the lock file", () => {
  const s = repo({ "p1.sha256": `${sha(V1)}  tests/e2e/gone.e2e.mjs\n` });
  try {
    const r = run(s);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /tests\/e2e\/gone\.e2e\.mjs/);
    assert.match(r.problems[0], /evals-locks\/p1\.sha256/);
    assert.match(r.problems[0], /retired/);
  } finally { s.done(); }
});

test("a deleted file passes when a lock file retires it after its last hash line, with a reason", () => {
  const s = repo({ "p1.sha256": `${sha(V1)}  tests/e2e/gone.e2e.mjs\n# retired tests/e2e/gone.e2e.mjs reason: merged into tests/e2e/new.e2e.mjs (owner order 2026-11-16)\n` });
  try {
    const r = run(s);
    assert.deepEqual(r.problems, []);
    assert.ok(r.retired.some(x => x.path === "tests/e2e/gone.e2e.mjs" && /merged into/.test(x.reason)));
  } finally { s.done(); }
});

test("a retirement without a reason, or before a later re-lock, does not count", () => {
  const noReason = repo({ "p1.sha256": `${sha(V1)}  tests/e2e/gone.e2e.mjs\n# retired tests/e2e/gone.e2e.mjs reason:\n` });
  try { assert.equal(run(noReason).problems.length, 1); } finally { noReason.done(); }
  const relocked = repo({ "p1.sha256": `${sha(V1)}  tests/e2e/gone.e2e.mjs\n# retired tests/e2e/gone.e2e.mjs reason: old\n${sha(V3)}  tests/e2e/gone.e2e.mjs\n` });
  try { assert.equal(run(relocked).problems.length, 1); } finally { relocked.done(); }
});

test("a retired path that is still in the repo fails (lock it again or remove it)", () => {
  const s = repo({ "p1.sha256": `${sha(V2)}  tests/unit/a.test.js\n# retired tests/unit/a.test.js reason: replaced\n` });
  try {
    const r = run(s);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /tests\/unit\/a\.test\.js/);
    assert.match(r.problems[0], /retired/);
  } finally { s.done(); }
});

test("across lock files, a hash that another lock file later replaced is superseded", () => {
  // p-old last locked V1; p-new locked V1 then V2: the latest is V2
  const s = repo({ "p-old.sha256": `${sha(V1)}  tests/unit/a.test.js\n`, "p-new.sha256": `${sha(V1)}  tests/unit/a.test.js\n${sha(V2)}  tests/unit/a.test.js\n` });
  try {
    const r = run(s);
    assert.deepEqual(r.problems, []);
    assert.equal(r.checked[0].expected, sha(V2));
    assert.equal(r.checked[0].lockFile, "evals-locks/p-new.sha256");
  } finally { s.done(); }
  const back = repo({ "p-old.sha256": `${sha(V1)}  tests/unit/a.test.js\n`, "p-new.sha256": `${sha(V1)}  tests/unit/a.test.js\n${sha(V2)}  tests/unit/a.test.js\n` },
    { "tests/unit/a.test.js": V1 });
  try {
    const r = run(back);
    assert.equal(r.problems.length, 1, "going back to the superseded version fails");
    assert.ok(r.problems[0].includes(sha(V2)) && r.problems[0].includes(sha(V1)));
  } finally { back.done(); }
});

test("two lock files whose latest entries disagree, with neither replacing the other, are a conflict (both named)", () => {
  const s = repo({ "p-a.sha256": `${sha(V1)}  tests/unit/a.test.js\n`, "p-b.sha256": `${sha(V2)}  tests/unit/a.test.js\n` });
  try {
    const r = run(s);
    assert.equal(r.problems.length, 1, "conflict even though the repo file equals one of them");
    assert.match(r.problems[0], /conflict/i);
    assert.match(r.problems[0], /evals-locks\/p-a\.sha256/);
    assert.match(r.problems[0], /evals-locks\/p-b\.sha256/);
  } finally { s.done(); }
});

test("every problem is reported, not only the first", () => {
  const s = repo({ "p1.sha256": `${sha(V1)}  tests/unit/a.test.js\n${sha(V1)}  tests/unit/b.test.js\n${sha(V1)}  tests/e2e/gone.e2e.mjs\n` },
    { "tests/unit/a.test.js": V2, "tests/unit/b.test.js": V3 });
  try { assert.equal(run(s).problems.length, 3); } finally { s.done(); }
});

test("no ~/LENSIQ-field needed: the repo check reads only evals-locks/ and the repo files", () => {
  const s = repo({ "p1.sha256": `${sha(V2)}  tests/unit/a.test.js\n${sha(V3)}  set.json\n` });
  try {
    const env = { ...process.env, HOME: join(s.repo, "no-home") };
    const r = spawnSync(process.execPath, [GUARD, "repo", "--repo", s.repo], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /1 locked repo file/);
  } finally { s.done(); }
});

test("CLI 'repo' exits 1 and prints every mismatch on stderr", () => {
  const s = repo({ "p1.sha256": `${sha(V1)}  tests/unit/a.test.js\n${sha(V1)}  tests/e2e/gone.e2e.mjs\n` });
  try {
    const r = spawnSync(process.execPath, [GUARD, "repo", "--repo", s.repo], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /tests\/unit\/a\.test\.js/);
    assert.match(r.stderr, /tests\/e2e\/gone\.e2e\.mjs/);
  } finally { s.done(); }
});

test("the --repo override works only under node --test", () => {
  const s = repo({ "p1.sha256": `${sha(V2)}  tests/unit/a.test.js\n` });
  try {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, [GUARD, "repo", "--repo", s.repo], { encoding: "utf8", env });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /tests only/);
  } finally { s.done(); }
});

test("assertLocked also refuses when a repo file locked in the same phase differs from its latest lock", () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "lq-evalguard-repo-al-")));
  try {
    const root = join(base, "evals"), r = join(base, "repo");
    mkdirSync(join(root, "p1"), { recursive: true });
    mkdirSync(join(r, "evals-locks"), { recursive: true });
    mkdirSync(join(r, "tests", "unit"), { recursive: true });
    writeFileSync(join(root, "p1", "set.json"), "[1]\n");
    writeFileSync(join(r, "tests", "unit", "a.test.js"), V2);
    git(r, "init", "-q");
    writeFileSync(join(r, "evals-locks", "p1.sha256"), `${sha(readFileSync(join(root, "p1", "set.json")))}  set.json\n${sha(V1)}  tests/unit/a.test.js  # repo file\n`);
    git(r, "add", "-A"); git(r, "commit", "-q", "-m", "lock");
    assert.throws(() => G.assertLocked("p1", ["set.json"], { root, repo: r }), e => /tests\/unit\/a\.test\.js/.test(e.message) && e.message.includes(sha(V1)));
    writeFileSync(join(r, "tests", "unit", "a.test.js"), V1);
    git(r, "add", "-A"); git(r, "commit", "-q", "-m", "restore");
    assert.equal(G.assertLocked("p1", ["set.json"], { root, repo: r }).files.length, 1);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("CI runs the repo check over the whole repo, as a blocking step (not continue-on-error)", () => {
  const ci = readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8");
  const i = ci.indexOf("node tools/eval-guard.mjs repo");
  assert.ok(i > 0, "ci.yml runs: node tools/eval-guard.mjs repo");
  const step = ci.slice(ci.lastIndexOf("- name:", i), ci.indexOf("\n      - ", i) > 0 ? ci.indexOf("\n      - ", i) : undefined);
  assert.doesNotMatch(step, /continue-on-error/);
  assert.doesNotMatch(step, /\|\|\s*true/);
});
