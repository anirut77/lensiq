// tests/unit/eval-guard.test.js — owner rule 2026-11-13 "Locked sets persist" (a locked test set was lost twice).
// Every fixed test / eval set lives in ~/LENSIQ-field/evals/<phase>/ and its sha256 is committed in the repo
// (evals-locks/<phase>.sha256) BEFORE any measurement; tools/eval-guard.mjs refuses to measure otherwise, and every
// measuring harness that reads a set from ~/LENSIQ-field/evals calls it. Fixtures: a throw-away evals root + git repo per
// test (the real ~/LENSIQ-field/evals is never written here). This file is itself locked: evals-locks/eval-guard.sha256.
// v2 (independent review 2026-11-13): lock line format (B1), nut-eval lock reader, import script, strict lock lines, lock
// text read from HEAD, lowercase phases, test-only overrides, write order of lock(), static scan of every tools/ file.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { join, relative } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const GUARD = join(REPO, "tools", "eval-guard.mjs");
let G, NL, IMP;
before(async () => {
  G = await import(pathToFileURL(GUARD).href);
  NL = await import(pathToFileURL(join(REPO, "tools", "lib", "nut-lock.mjs")).href);
  IMP = await import(pathToFileURL(join(REPO, "tools", "eval-locks-import.mjs")).href);
});

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
    appendFileSync(s.lockFile, `# ${h}  labels.jsonl (draft, not locked)\n${sha("x")}  other.json  # was ${h}\n` +
      `x#${h}  labels.jsonl\nLOCK ${h}  labels.jsonl\n${sha("y")}  set.json ${h}  labels.jsonl\n`);
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
    for (const bad of ["", "../x", "a/b", "/abs", ".", "..", "a__", "__a", "a b", "a__.", "a__..", "a___b", "a__.x"]) {
      assert.throws(() => G.assertLocked(bad, ["set.json"], s.opts), /phase/i, bad);
    }
    // case-different names are refused up front (case-insensitive disks would otherwise find the folder but not the git file)
    assert.throws(() => G.assertLocked("P1", ["set.json"], s.opts), /lowercase/i);
    assert.throws(() => G.lock("Nutrition__v5", ["set.json"], { ...s.opts, log: () => {} }), /lowercase/i);
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
    // B1: the timestamp is its own comment line; hash lines are exactly "<sha256>  <path>" (readers take the rest as the name)
    const block = /^# locked \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ.*\n([0-9a-f]{64}) {2}labels\.jsonl\n$/;
    assert.match(a.slice(before1.length), block);
    assert.match(b.slice(before2.length), block);
    assert.equal(a.slice(before1.length).match(block)[1], sha(readFileSync(join(s.root, "p1", "labels.jsonl"))));
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
    assert.match(readFileSync(join(s.repo, "evals-locks", "fresh__v1.sha256"), "utf8"), /^# locked .*\n[0-9a-f]{64} {2}set\.json\n$/);
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

/* ---------- static wiring: every tools/ file that reads ~/LENSIQ-field/evals calls the guard ---------- */
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const EVALS_REF = /["'`/]evals["'`/]|LENSIQ-field\/evals/;
const EVALS_REF_G = new RegExp(EVALS_REF.source, "g");
const FIX = "fix: import { assertLocked, phaseOf } from \"./eval-guard.mjs\" and call assertLocked(phaseOf(<set folder>), [<every input file>])" +
  " before reading or scoring the set (docs/EVAL-LOCKS.md)";
// Tools that name the evals folder in code but read no test set from it. Each entry states why; the number of evals
// references is pinned, so any new reference has to be guarded or reviewed here.
const NOT_A_SET = {
  "tools/eval-guard.mjs": { refs: 1, why: "the guard itself (default evals root)" },
  "tools/eval-locks-import.mjs": { refs: 1, why: "copies the lock files into evals-locks/; measures nothing" },
  "tools/exam-hall-face-eval.mjs": { refs: 1, why: "only the measurement-only vendor files (sha256-pinned in the tool); its set is ~/LENSIQ-field/exam-faces-hall" },
  "tools/pc-evidence-testset.mjs": { refs: 1, why: "--eval appends a DEV log line to evals/p7; its set is docs/product-check/p7-evidence-testset.json" },
  "tools/pc-refimg.mjs": { refs: 1, why: "synthetic writes its results file to evals/p9; reads no set" }
};
function toolFiles(dir = join(REPO, "tools")) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return toolFiles(p);
    return /\.(mjs|js|cjs)$/.test(n) ? [relative(REPO, p).split("\\").join("/")] : [];
  });
}

test("every tools/ file (.mjs/.js, any folder) that reads from ~/LENSIQ-field/evals imports eval-guard.mjs and calls assertLocked", () => {
  const wired = [];
  for (const f of toolFiles()) {
    const code = stripComments(readFileSync(join(REPO, f), "utf8"));
    if (!EVALS_REF.test(code)) continue;
    const refs = (code.match(EVALS_REF_G) || []).length;
    if (NOT_A_SET[f]) {
      assert.equal(refs, NOT_A_SET[f].refs, `${f} (${NOT_A_SET[f].why}) now has ${refs} references to the evals folder; if one reads a set, ${FIX}`);
      continue;
    }
    assert.match(code, /from\s+["'](\.\.?\/)+(tools\/)?eval-guard\.mjs["']/, `${f} reads ~/LENSIQ-field/evals but does not import eval-guard.mjs; ${FIX}`);
    assert.match(code, /\bassertLocked\s*\(/, `${f} reads ~/LENSIQ-field/evals but never calls assertLocked; ${FIX}`);
    assert.doesNotMatch(code, /assertLocked\s*\([^;]*\b(root|repo)\s*:/, `${f} must not point the guard at another root or repo`);
    wired.push(f);
  }
  for (const f of ["tools/nut-eval.mjs", "tools/exam-hall-detector-eval.mjs", "tools/pc-advert-eval.mjs"]) assert.ok(wired.includes(f), f + " must be guarded");
  // pc-advert-eval: the --fresh sets AND the dev mode when --data points into the evals folder
  const adv = stripComments(readFileSync(join(REPO, "tools", "pc-advert-eval.mjs"), "utf8"));
  assert.ok((adv.match(/\bassertLocked\s*\(/g) || []).length >= 2, "pc-advert-eval: guard both --fresh and dev mode with --data under evals");
});

test("the static check catches an unguarded harness (self-test of the detector)", () => {
  const bad = 'import { homedir } from "node:os";\nconst SET = join(homedir(), "LENSIQ-field", "evals", "x"); // read the set\n';
  const bad2 = 'const FIELD = join(homedir(), "LENSIQ-field");\nconst DIR = join(FIELD, "evals", "hall-detector");\n';
  const bad3 = 'const DIR = process.env.HOME + "/LENSIQ-field/evals/x";\nconst D2 = `${HOME}/evals/y`;\n';
  for (const b of [bad, bad2, bad3]) assert.ok(EVALS_REF.test(stripComments(b)), b);
  assert.ok(!/\bassertLocked\s*\(/.test(stripComments(bad)));
  assert.ok(!EVALS_REF.test(stripComments("// see ~/LENSIQ-field/evals/x\nconst a = 1;\n")), "comments alone do not count");
  assert.ok(!EVALS_REF.test('const f = "evals-locks/x.sha256";'), "evals-locks is the repo folder, not the field folder");
});

/* ---------- v2 behaviour (independent review 2026-11-13) ---------- */
test("the lock text is read from the committed HEAD, not the working tree (assume-unchanged cannot sneak a hash in)", () => {
  const s = sandbox();
  try {
    git(s.repo, "update-index", "--assume-unchanged", "evals-locks/p1.sha256");
    appendFileSync(s.lockFile, sha(readFileSync(join(s.root, "p1", "labels.jsonl"))) + "  labels.jsonl\n");
    assert.throws(() => G.assertLocked("p1", ["labels.jsonl"], s.opts), /labels\.jsonl/);
    assert.equal(G.assertLocked("p1", ["set.json"], s.opts).files.length, 1);
  } finally { s.done(); }
});

test("root / repo overrides are honoured only under the test runner", () => {
  const s = sandbox();
  try {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const code = `import(${JSON.stringify(pathToFileURL(GUARD).href)}).then(G => { try { G.assertLocked("p1", ["set.json"], ` +
      `${JSON.stringify(s.opts)}); console.log("PASSED"); } catch (e) { console.log("REFUSED " + e.message); } })`;
    const r = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", env });
    assert.match(r.stdout, /REFUSED .*tests only/i);
  } finally { s.done(); }
});

test("lock() writes the repo copy first, then the field copy, and fails loudly when either write fails", () => {
  const s = sandbox();
  try {
    const field = join(s.root, "p1", "locked.sha256");
    writeFileSync(field, "# earlier\n");
    chmodSync(field, 0o444);
    const before = readFileSync(s.lockFile, "utf8");
    assert.throws(() => G.lock("p1", ["labels.jsonl"], { ...s.opts, log: () => {} }), e => /locked\.sha256/.test(e.message) && /repo copy/i.test(e.message));
    assert.ok(readFileSync(s.lockFile, "utf8").length > before.length, "the repo copy was written first");
    chmodSync(field, 0o644);
    const f2 = readFileSync(field, "utf8");
    rmSync(s.lockFile);
    chmodSync(join(s.repo, "evals-locks"), 0o555);
    try { assert.throws(() => G.lock("p1", ["labels.jsonl"], { ...s.opts, log: () => {} }), /evals-locks/); }
    finally { chmodSync(join(s.repo, "evals-locks"), 0o755); }
    assert.equal(readFileSync(field, "utf8"), f2, "field copy untouched when the repo write fails");
  } finally { s.done(); }
});

test("B1: nut-eval's lock reader accepts sets locked with lock() and ignores ' # ...' suffixes", () => {
  const s = sandbox();
  try {
    const set = join(s.root, "nutrition", "v9");
    mkdirSync(join(set, "images"), { recursive: true });
    writeFileSync(join(set, "set.json"), '{"labels":[]}\n');
    writeFileSync(join(set, "score.mjs"), "export {};\n");
    writeFileSync(join(set, "images", "a.png"), "png-a");
    writeFileSync(join(set, "images", "b.png"), "png-b");
    G.lock("nutrition__v9", ["set.json", "score.mjs", "images/a.png", "images/b.png"], { ...s.opts, log: () => {} });
    assert.equal(NL.checkNutLock(set, s.repo).checked, 4);
    // older lines with a trailing comment, and the aggregate image line, still read
    appendFileSync(join(set, "locked.sha256"), `${sha(readFileSync(join(set, "set.json")))}  set.json  # locked 2026-11-13T00:00:00Z\n`);
    const list = execFileSync("/bin/sh", ["-c", "cd images && shasum -a 256 *.png | shasum -a 256"], { cwd: set }).toString().split(" ")[0];
    appendFileSync(join(set, "locked.sha256"), `${list}  images/*.png (sha256 of the sorted per-file list)\n`);
    assert.equal(NL.checkNutLock(set, s.repo).checked, 6);
    writeFileSync(join(set, "set.json"), '{"labels":[1]}\n');
    assert.throws(() => NL.checkNutLock(set, s.repo), /set\.json/);
  } finally { s.done(); }
});

/* ---------- import script: tools/eval-locks-import.mjs ---------- */
function fieldFixture() {
  const s = sandbox();
  mkdirSync(join(s.repo, "tests", "unit"), { recursive: true });
  writeFileSync(join(s.repo, "tests", "unit", "a.test.js"), "test\n");
  mkdirSync(join(s.root, "ph", "v2"), { recursive: true });
  writeFileSync(join(s.root, "ph", "v2", "set.json"), "[1]\n");
  const L = join(s.root, "ph", "v2", "locked.sha256");
  writeFileSync(L, `# header comment\n${sha("[1]\n")}  set.json\nWed Nov 11 2026\n${sha("test\n")}  tests/unit/a.test.js\n${sha("gone")}  gone.json\n`);
  return { s, L };
}

test("import: copies field locks into evals-locks/<a__b>.sha256, marks repo files, prefixes text lines, reports missing files", () => {
  const { s } = fieldFixture();
  try {
    const r = IMP.importLocks({ root: s.root, repo: s.repo, date: "2026-11-13" });
    const t = readFileSync(join(s.repo, "evals-locks", "ph__v2.sha256"), "utf8");
    assert.match(t, /^# header comment$/m);
    assert.match(t, new RegExp(`^${sha("[1]\n")}  set\\.json$`, "m"));
    assert.match(t, /^# Wed Nov 11 2026$/m);
    assert.match(t, /tests\/unit\/a\.test\.js {2}# repo file$/m);
    assert.ok(r.findings.some(f => /gone\.json/.test(f) && /no longer exists/.test(f)), JSON.stringify(r.findings));
    assert.ok(r.phases.some(p => p.phase === "ph__v2" && p.appended > 0));
  } finally { s.done(); }
});

test("import: idempotent and append-only; a field file rewritten in place keeps the old repo lines and is reported", () => {
  const { s, L } = fieldFixture();
  try {
    IMP.importLocks({ root: s.root, repo: s.repo, date: "2026-11-13" });
    const p = join(s.repo, "evals-locks", "ph__v2.sha256");
    const first = readFileSync(p, "utf8");
    const again = IMP.importLocks({ root: s.root, repo: s.repo, date: "2026-11-13" });
    assert.equal(readFileSync(p, "utf8"), first, "a second run changes nothing");
    assert.ok(again.phases.every(x => x.appended === 0));
    // field file rewritten in place: set.json re-locked with a new hash, old line gone from the field
    writeFileSync(join(s.root, "ph", "v2", "set.json"), "[2]\n");
    writeFileSync(L, `# header comment\n${sha("[2]\n")}  set.json\n`);
    const r = IMP.importLocks({ root: s.root, repo: s.repo, date: "2026-11-14" });
    const t = readFileSync(p, "utf8");
    assert.ok(t.startsWith(first), "earlier repo lines are never rewritten");
    assert.match(t, new RegExp(`^${sha("[2]\n")}  set\\.json$`, "m"));
    assert.ok(r.findings.some(f => /ph__v2/.test(f) && /rewritten in place/.test(f)), JSON.stringify(r.findings));
  } finally { s.done(); }
});

test("repo lock files: phase-named, and this test file is locked in evals-locks/eval-guard.sha256", () => {
  const dir = join(REPO, "evals-locks");
  for (const f of readdirSync(dir)) {
    if (f === "README.md") continue;
    assert.match(f, /^[a-z0-9][a-z0-9._-]*(__[a-z0-9][a-z0-9._-]*)*\.sha256$/, f);
  }
  const own = sha(readFileSync(__filename));
  assert.ok(G.parseLock(readFileSync(join(dir, "eval-guard.sha256"), "utf8")).has(own), "tests/unit/eval-guard.test.js changed after locking");
});
