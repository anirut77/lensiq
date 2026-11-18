// tests/unit/eval-guard-ledger.test.js — owner decision 110 ก condition 4 (2026-11-18): "from now on a re-lock writes the
// repository ledger line in the same commit as the re-lock, and eval-guard fails when a lock exists without its ledger line,
// so late entries are never needed again." Three late entries were needed on 2026-11-18 because `lock` wrote only the
// copy name (relock-8/tests/e2e/line-wrap-exceptions.json, relock1/cat-pages.test.js) and never the repo path, and because
// a re-lock in one lock file did not replace the older hash held by other lock files.
// Rules checked here (tools/eval-guard.mjs):
//   lock  <phase> <file>[=<repo path>|=-]  writes, in evals-locks/<phase>.sha256, the field lines AND one
//         "<sha256>  <repo path>  # repo file (... field: ~/LENSIQ-field/evals/<phase>/<rel>)" line for every field file that
//         has a repo copy (found from the copy's path or name, or named after "="); "=-" records "# field only <rel>".
//         It refuses (writing nothing) when the repo copy differs from the field file. Every other lock file whose latest
//         hash for that repo path differs gets the same repo line appended, so no cross-file conflict is left behind.
//   repo  for lock blocks stamped "# locked <UTC>" at or after LEDGER_FROM:
//         L1 a field lock line whose file has a repo copy needs a repo ledger line with the same hash (or "# field only");
//         L2 a "# repo file" line needs its field copy: a same-hash field line in the same lock file, or a "field:" reference
//            to a hash line in evals-locks/<phase>.sha256; a "late entry" line needs that reference wherever it is.
//   repo --field (local, reads ~/LENSIQ-field): every such field copy exists on disk with that hash and is listed in the
//         phase's locked.sha256.
// Blocks stamped before LEDGER_FROM are history (reported, not failed); see docs/EVAL-LOCKS.md.
// Fixtures: a throw-away repo + evals root per test. This file is itself locked: evals-locks/eval-guard.sha256.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const GUARD = join(REPO, "tools", "eval-guard.mjs");
let G;
before(async () => { G = await import(pathToFileURL(GUARD).href); });

const sha = b => createHash("sha256").update(b).digest("hex");
const V1 = "test('a', () => {});\n", V2 = "test('a', () => { assert.ok(1); });\n", V3 = "test('b', () => {});\n";
const NEW = "# locked 2026-11-19T00:00:00Z (tools/eval-guard.mjs lock, 1 file)\n"; // after LEDGER_FROM
const OLD = "# locked 2026-11-10T00:00:00Z (tools/eval-guard.mjs lock, 1 file)\n"; // before LEDGER_FROM

/** repo/ (files + evals-locks/) and evals/ (field root) @param {{repo?: Record<string,string>, locks?: Record<string,string>, field?: Record<string,string>}} o */
function sb(o = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "lq-evalguard-ledger-")));
  const repo = join(base, "repo"), root = join(base, "evals");
  mkdirSync(join(repo, "evals-locks"), { recursive: true });
  mkdirSync(root, { recursive: true });
  const put = (dir, files) => { for (const [p, c] of Object.entries(files || {})) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } };
  put(repo, { "tests/unit/a.test.js": V2, ...(o.repo || {}) });
  put(join(repo, "evals-locks"), o.locks);
  put(root, o.field);
  const lockText = name => readFileSync(join(repo, "evals-locks", name), "utf8");
  return { base, repo, root, lockText, opts: { repo, root, log: () => {} }, done: () => rmSync(base, { recursive: true, force: true }) };
}
const check = (s, extra = {}) => G.checkRepoLocks({ repo: s.repo, ...extra });

test("LEDGER_FROM is exported and lies between the last block written without ledger lines and the fixtures' new blocks", () => {
  assert.match(G.LEDGER_FROM, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.ok(G.LEDGER_FROM > "2026-11-17T23:32:05Z", "every block written after the rule must comply");
  assert.ok(G.LEDGER_FROM <= "2026-11-19T00:00:00Z");
});

test("lock writes the field line AND the repo ledger line in evals-locks/<phase>.sha256 (copy found from its path)", () => {
  const s = sb({ field: { "p1/relock-1/tests/unit/a.test.js": V2 } });
  try {
    G.lock("p1", ["relock-1/tests/unit/a.test.js"], s.opts);
    const a = s.lockText("p1.sha256");
    assert.match(a, new RegExp(`^${sha(V2)} {2}relock-1/tests/unit/a\\.test\\.js$`, "m"), "field line");
    const repoLine = a.split("\n").find(l => l.startsWith(`${sha(V2)}  tests/unit/a.test.js`));
    assert.ok(repoLine, "repo ledger line in the same lock file");
    assert.match(repoLine, /# repo file/);
    assert.match(repoLine, /field: ~\/LENSIQ-field\/evals\/p1\/relock-1\/tests\/unit\/a\.test\.js/);
    const f = readFileSync(join(s.root, "p1", "locked.sha256"), "utf8");
    assert.ok(!f.includes("# repo file"), "the field record keeps field lines only");
    assert.match(f, new RegExp(`^${sha(V2)} {2}relock-1/tests/unit/a\\.test\\.js$`, "m"));
    assert.deepEqual(check(s).problems, []);
    assert.deepEqual(check(s, { root: s.root, field: true }).problems, []);
  } finally { s.done(); }
});

test("lock finds the repo copy from a versioned copy name (relock/a.test.r2.js -> tests/unit/a.test.js)", () => {
  const s = sb({ field: { "p1/relock/a.test.r2.js": V2 } });
  try {
    G.lock("p1", ["relock/a.test.r2.js"], s.opts);
    assert.match(s.lockText("p1.sha256"), new RegExp(`^${sha(V2)} {2}tests/unit/a\\.test\\.js {2}# repo file`, "m"));
    assert.deepEqual(check(s).problems, []);
  } finally { s.done(); }
});

test("lock <file>=<repo path> writes the ledger line for a copy whose name does not match", () => {
  const s = sb({ repo: { "tests/e2e/allow.json": '{"a":1}\n' }, field: { "p1/allow.protect.json": '{"a":1}\n' } });
  try {
    G.lock("p1", ["allow.protect.json=tests/e2e/allow.json"], s.opts);
    assert.match(s.lockText("p1.sha256"), new RegExp(`^${sha('{"a":1}\n')} {2}tests/e2e/allow\\.json {2}# repo file`, "m"));
    assert.deepEqual(check(s).problems, []);
  } finally { s.done(); }
});

test("lock refuses, writing nothing, when the repo copy differs from the field file", () => {
  const s = sb({ field: { "p1/relock-1/tests/unit/a.test.js": V3 } });
  try {
    assert.throws(() => G.lock("p1", ["relock-1/tests/unit/a.test.js"], s.opts), /tests\/unit\/a\.test\.js[\s\S]*differ/i);
    assert.ok(!existsSync(join(s.repo, "evals-locks", "p1.sha256")), "no repo lock written");
    assert.ok(!existsSync(join(s.root, "p1", "locked.sha256")), "no field lock written");
    assert.throws(() => G.lock("p1", ["relock-1/tests/unit/a.test.js=tests/unit/a.test.js"], s.opts), /differ/i);
  } finally { s.done(); }
});

test("lock <file>=- records '# field only <rel>' and the check accepts it; a data file with no repo copy needs nothing", () => {
  const s = sb({ field: { "p1/a.test.js": V3, "p1/labels.jsonl": "{}\n" } });
  try {
    G.lock("p1", ["a.test.js=-", "labels.jsonl"], s.opts);
    const a = s.lockText("p1.sha256");
    assert.match(a, /^# field only a\.test\.js\b/m);
    assert.ok(!a.includes("# repo file"));
    assert.deepEqual(check(s).problems, []);
  } finally { s.done(); }
});

test("a field file that sits at its repo path is its own ledger line (no duplicate)", () => {
  const s = sb({ field: { "p1/tests/unit/a.test.js": V2 } });
  try {
    G.lock("p1", ["tests/unit/a.test.js"], s.opts);
    const lines = s.lockText("p1.sha256").split("\n").filter(l => l.startsWith(sha(V2)));
    assert.equal(lines.length, 1);
    assert.deepEqual(check(s).problems, []);
  } finally { s.done(); }
});

test("lock appends the new hash to every other lock file that still holds an older hash for the repo path", () => {
  const old = `${OLD}${sha(V1)}  tests/unit/a.test.js  # repo file\n`;
  const s = sb({ locks: { "old.sha256": old }, field: { "p2/relock1/a.test.js": V2 } });
  try {
    assert.equal(check(s).problems.length, 1, "before: the repo file differs from its lock");
    G.lock("p2", ["relock1/a.test.js"], s.opts);
    const o = s.lockText("old.sha256");
    assert.ok(o.startsWith(old), "earlier lines stay exactly as they were");
    assert.match(o.slice(old.length), new RegExp(`^${sha(V2)} {2}tests/unit/a\\.test\\.js {2}# repo file .*evals-locks/p2\\.sha256`, "m"));
    assert.deepEqual(check(s).problems, []);
  } finally { s.done(); }
});

test("NEGATIVE CONTROL L1: a field lock without its repo ledger line fails (after LEDGER_FROM)", () => {
  const s = sb({ locks: { "p1.sha256": `${NEW}${sha(V2)}  relock-8/tests/unit/a.test.js\n` } });
  try {
    const p = check(s).problems;
    assert.equal(p.length, 1, p.join("\n"));
    assert.match(p[0], /evals-locks\/p1\.sha256 line 2/);
    assert.match(p[0], /relock-8\/tests\/unit\/a\.test\.js/);
    assert.match(p[0], /tests\/unit\/a\.test\.js/);
    assert.match(p[0], /ledger/i);
    const r = spawnSync(process.execPath, [GUARD, "repo", "--repo", s.repo], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /relock-8\/tests\/unit\/a\.test\.js/);
  } finally { s.done(); }
});

test("L1 is also met by a same-hash repo line written before the field line in the same block, or by '# field only'", () => {
  const a = `${NEW}${sha(V2)}  tests/unit/a.test.js  # repo file\n${sha(V2)}  a.test.v1.js\n`;
  const b = `${NEW}${sha(V3)}  relock/a.test.js\n# field only relock/a.test.js (not used by the repo)\n`;
  const s = sb({ locks: { "p1.sha256": a, "p2.sha256": b } });
  try { assert.deepEqual(check(s).problems, []); } finally { s.done(); }
});

test("L1 history: the same gap in a block stamped before LEDGER_FROM is reported, not failed", () => {
  const s = sb({ locks: { "p1.sha256": `${OLD}${sha(V3)}  relock-1/tests/unit/a.test.js\n` } });
  try {
    const r = check(s);
    assert.deepEqual(r.problems, []);
    assert.equal(r.history.length, 1);
    assert.match(r.history[0], /relock-1\/tests\/unit\/a\.test\.js/);
  } finally { s.done(); }
});

test("NEGATIVE CONTROL L2: a repo ledger line without a field copy fails (after LEDGER_FROM)", () => {
  const s = sb({ locks: { "p1.sha256": `${NEW}${sha(V2)}  tests/unit/a.test.js  # repo file\n` } });
  try {
    const p = check(s).problems;
    assert.equal(p.length, 1, p.join("\n"));
    assert.match(p[0], /evals-locks\/p1\.sha256 line 2/);
    assert.match(p[0], /field copy/i);
  } finally { s.done(); }
});

test("late entries: accepted only with a 'field:' reference that matches a hash line of that phase's lock file", () => {
  const late = (h, ref) => `${h}  tests/unit/a.test.js  # repo file (late entry 2026-11-18; commit abc; file sha256 ${h}${ref})\n`;
  const p9 = `${OLD}${sha(V2)}  relock1/a.test.js\n${sha(V2)}  tests/unit/a.test.js  # repo file\n`;
  const ok = sb({ locks: { "p9.sha256": p9, "q.sha256": late(sha(V2), "; field: ~/LENSIQ-field/evals/p9/relock1/a.test.js") } });
  const none = sb({ locks: { "p9.sha256": p9, "q.sha256": late(sha(V2), "") } });
  const wrong = sb({ locks: { "p9.sha256": p9, "q.sha256": late(sha(V2), "; field: ~/LENSIQ-field/evals/p9/relock2/a.test.js") } });
  try {
    assert.deepEqual(check(ok).problems, []);
    assert.equal(check(none).problems.length, 1);
    assert.match(check(none).problems[0], /late entry/i);
    assert.equal(check(wrong).problems.length, 1);
    assert.match(check(wrong).problems[0], /relock2\/a\.test\.js/);
  } finally { ok.done(); none.done(); wrong.done(); }
});

test("NEGATIVE CONTROL --field: a ledger line whose field copy is missing on disk or differs fails; present and listed passes", () => {
  const lockTxt = `${NEW}${sha(V2)}  relock-1/tests/unit/a.test.js\n${sha(V2)}  tests/unit/a.test.js  # repo file\n`;
  const rec = `# locked 2026-11-19T00:00:00Z\n${sha(V2)}  relock-1/tests/unit/a.test.js\n`;
  const good = sb({ locks: { "p1.sha256": lockTxt }, field: { "p1/relock-1/tests/unit/a.test.js": V2, "p1/locked.sha256": rec } });
  const gone = sb({ locks: { "p1.sha256": lockTxt }, field: { "p1/locked.sha256": rec } });
  const diff = sb({ locks: { "p1.sha256": lockTxt }, field: { "p1/relock-1/tests/unit/a.test.js": V3, "p1/locked.sha256": rec } });
  const unlisted = sb({ locks: { "p1.sha256": lockTxt }, field: { "p1/relock-1/tests/unit/a.test.js": V2, "p1/locked.sha256": "# none\n" } });
  try {
    assert.deepEqual(check(good, { root: good.root, field: true }).problems, []);
    for (const s of [gone, diff, unlisted]) {
      assert.deepEqual(check(s).problems, [], "without --field only evals-locks/ is read");
      const p = check(s, { root: s.root, field: true }).problems;
      assert.equal(p.length, 1, p.join("\n"));
      assert.match(p[0], /relock-1\/tests\/unit\/a\.test\.js/);
    }
  } finally { good.done(); gone.done(); diff.done(); unlisted.done(); }
});

test("the real repo: no ledger gap after LEDGER_FROM, and the three late entries of 2026-11-18 carry valid field references", () => {
  const r = G.checkRepoLocks();
  assert.deepEqual(r.problems, []);
  for (const [file, path] of [["line-wrap.sha256", "tests/e2e/line-wrap-exceptions.json"], ["fortune-no-demo.sha256", "tests/unit/cat-pages.test.js"],
    ["fortune-no-demo.sha256", "tests/unit/fortune-no-demo.test.js"]]) {
    const line = readFileSync(join(REPO, "evals-locks", file), "utf8").split("\n").find(l => l.includes(`  ${path}  # repo file (late entry 2026-11-18`));
    assert.ok(line, `${file}: late entry for ${path}`);
    assert.match(line, /^[0-9a-f]{64} {2}/);
    assert.match(line, /field: ~\/LENSIQ-field\/evals\//);
  }
});
