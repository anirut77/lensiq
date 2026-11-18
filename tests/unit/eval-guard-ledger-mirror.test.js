// tests/unit/eval-guard-ledger-mirror.test.js — coordinator decision 2026-11-18 under owner decision 110 ก condition 4: L2 accepts
// a field copy whose path is the repo path itself. In a "mirrored" field folder (e.g. ~/LENSIQ-field/evals/fortune-credits/v4/
// tests/unit/x.test.js) `lock` writes "<sha256>  tests/unit/x.test.js" (unmarked); a later "<sha256>  tests/unit/x.test.js
// # repo file" line in the same lock file has that unmarked line as its field copy. Controls: a different hash, a different
// path or a different lock file still fail. This file is itself locked: evals-locks/eval-guard.sha256.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const GUARD = join(__dirname, "..", "..", "tools", "eval-guard.mjs");
let G;
before(async () => { G = await import(pathToFileURL(GUARD).href); });

const sha = b => createHash("sha256").update(b).digest("hex");
const A = "test('a', () => {});\n", B = "test('b', () => {});\n";
const NEW = "# locked 2026-11-19T00:00:00Z (tools/eval-guard.mjs lock, 2 files)\n"; // after LEDGER_FROM

/** @param {Record<string, string>} locks */
function repo(locks) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "lq-evalguard-mirror-")));
  mkdirSync(join(base, "evals-locks"), { recursive: true });
  mkdirSync(join(base, "tests", "unit"), { recursive: true });
  writeFileSync(join(base, "tests", "unit", "a.test.js"), A);
  writeFileSync(join(base, "tests", "unit", "b.test.js"), B);
  for (const [n, t] of Object.entries(locks)) writeFileSync(join(base, "evals-locks", n), t);
  return { repo: base, done: () => rmSync(base, { recursive: true, force: true }) };
}
const problems = s => G.checkRepoLocks({ repo: s.repo }).problems;

test("mirrored layout (fortune-credits__v4): unmarked field lines at repo paths, then '# repo file' lines with the same hash pass", () => {
  const s = repo({ "p4.sha256": `${NEW}${sha(A)}  tests/unit/a.test.js\n${sha(B)}  tests/unit/b.test.js\n# LEDGER (append-only)\n` +
    `${sha(A)}  tests/unit/a.test.js  # repo file\n${sha(B)}  tests/unit/b.test.js  # repo file\n` });
  try { assert.deepEqual(problems(s), []); } finally { s.done(); }
});

test("CONTROL: the unmarked line has the same path but another hash -> the '# repo file' line still has no field copy", () => {
  const s = repo({ "p4.sha256": `${NEW}${sha(B)}  tests/unit/a.test.js\n${sha(A)}  tests/unit/a.test.js  # repo file\n` });
  try {
    const p = problems(s).filter(m => /field copy/i.test(m));
    assert.equal(p.length, 1, problems(s).join("\n"));
    assert.match(p[0], /evals-locks\/p4\.sha256 line 3/);
  } finally { s.done(); }
});

test("CONTROL: the unmarked line has the same hash but another repo path -> fails", () => {
  const s = repo({ "p4.sha256": `${NEW}${sha(A)}  tests/unit/b.test.js\n${sha(A)}  tests/unit/a.test.js  # repo file\n` });
  try {
    const p = problems(s).filter(m => /field copy/i.test(m));
    assert.equal(p.length, 1, problems(s).join("\n"));
    assert.match(p[0], /tests\/unit\/a\.test\.js/);
  } finally { s.done(); }
});

test("CONTROL: the unmarked same-hash same-path line is in ANOTHER lock file -> fails", () => {
  const s = repo({ "p3.sha256": `${NEW}${sha(A)}  tests/unit/a.test.js\n`, "p4.sha256": `${NEW}${sha(A)}  tests/unit/a.test.js  # repo file\n` });
  try {
    const p = problems(s).filter(m => /field copy/i.test(m));
    assert.equal(p.length, 1, problems(s).join("\n"));
    assert.match(p[0], /evals-locks\/p4\.sha256 line 2/);
  } finally { s.done(); }
});
