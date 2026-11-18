// tests/unit/eval-guard-pending.test.js — coordinator order 2026-11-17 on eval-guard-repo (owner decision 85 ก):
// a lock may be committed on main before the code it tests is merged from a feature branch. A narrow marker
//   # pending <path> branch: <branch> reason: <text>
// after the last hash line for <path> in a lock file lets `tools/eval-guard.mjs repo` accept that path ONLY while the
// file is absent from the repo. Once the file exists it must equal its latest lock, exactly as without the marker.
// This file is locked in evals-locks/eval-guard.sha256 before the guard change.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
let G;
before(async () => { G = await import(pathToFileURL(join(REPO, "tools", "eval-guard.mjs")).href); });

const sha = b => createHash("sha256").update(b).digest("hex");
const V1 = "test('s', () => {});\n", V2 = "test('s', () => { assert.ok(1); });\n";
const P = "tests/unit/style-x.test.js";

function repo(lock, files = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "lq-evalguard-pending-")));
  mkdirSync(join(base, "evals-locks"), { recursive: true });
  mkdirSync(join(base, "tests", "unit"), { recursive: true });
  for (const [p, c] of Object.entries(files)) writeFileSync(join(base, p), c);
  writeFileSync(join(base, "evals-locks", "p1.sha256"), lock);
  return { repo: base, done: () => rmSync(base, { recursive: true, force: true }) };
}
const run = s => G.checkRepoLocks({ repo: s.repo });
const MARK = `# pending ${P} branch: style-mvp reason: locked before code; re-checked on merge\n`;

test("a pending file that is absent from the repo passes and is listed as pending with its branch", () => {
  const s = repo(`${sha(V1)}  ${P}\n${MARK}`);
  try {
    const r = run(s);
    assert.deepEqual(r.problems, []);
    assert.ok(r.pending.some(x => x.path === P && x.branch === "style-mvp" && /locked before code/.test(x.reason)));
  } finally { s.done(); }
});

test("once the pending file is in the repo it must equal its latest lock", () => {
  const good = repo(`${sha(V1)}  ${P}\n${MARK}`, { [P]: V1 });
  try { assert.deepEqual(run(good).problems, []); assert.equal(run(good).checked[0].path, P); } finally { good.done(); }
  const bad = repo(`${sha(V1)}  ${P}\n${MARK}`, { [P]: V2 });
  try {
    const r = run(bad);
    assert.equal(r.problems.length, 1);
    assert.ok(r.problems[0].includes(sha(V1)) && r.problems[0].includes(sha(V2)));
  } finally { bad.done(); }
});

test("a pending marker needs both a branch and a reason", () => {
  for (const m of [`# pending ${P} reason: x\n`, `# pending ${P} branch: style-mvp reason:\n`, `# pending ${P} branch: reason: x\n`]) {
    const s = repo(`${sha(V1)}  ${P}\n${m}`);
    try { assert.equal(run(s).problems.length, 1, m); } finally { s.done(); }
  }
});

test("a pending marker before a later hash line does not count", () => {
  const s = repo(`${sha(V1)}  ${P}\n${MARK}${sha(V2)}  ${P}\n`);
  try { assert.equal(run(s).problems.length, 1); } finally { s.done(); }
});

test("a pending marker never excuses a different file", () => {
  const s = repo(`${sha(V1)}  ${P}\n${sha(V1)}  tests/unit/other.test.js\n${MARK}`);
  try {
    const r = run(s);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /other\.test\.js/);
  } finally { s.done(); }
});
