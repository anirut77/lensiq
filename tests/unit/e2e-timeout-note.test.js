// tests/unit/e2e-timeout-note.test.js — follow-up G1 of owner decision 203 ค (2026-11-21): when tests/e2e/run.mjs stops a file at
// its per-file time limit, the message "timed out after <ms> ms" also names the 1-minute load average and how many OTHER heavy jobs
// (tools/load-guard.mjs job files in ~/LENSIQ-field/run/ with a live pid that is not this process) were running. MESSAGE ONLY: the
// time limit, the retry rule and what counts as a failure stay as they are.
//   N1 busyNote() reads the load average and counts live job files of other processes (own pid and dead pids not counted)
//   N2 read-only: counting never removes, renames or creates a file in the run folder (stale files stay for the guard itself)
//   N3 a missing run folder counts 0; an unreadable folder or a failing load reading gives "unknown", never an exception
//   N4 run.mjs: same timer (FILE_TIMEOUT, default 900000 ms), same rejection, the note is appended to the message
// This file is locked: evals-locks/e2e-timeout-note.sha256 (written BEFORE busyNote existed in tools/load-guard.mjs).
// Re-lock 1 (EQUAL, lint only): N4 writes the two spaces before FAIL as ` {2}` (eslint no-regex-spaces); same match.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
let G;
before(async () => { G = await import(pathToFileURL(join(REPO, "tools", "load-guard.mjs")).href); });

const OWN = 4242, OTHER1 = 5151, OTHER2 = 6161, DEAD = 7171;
const ALIVE = new Set([OWN, OTHER1, OTHER2]);
function runDir(jobs) {
  const dir = mkdtempSync(join(tmpdir(), "lq-timeout-note-"));
  for (const [name, pid] of jobs) writeFileSync(join(dir, name), JSON.stringify({ pid, start: "2026-11-21T00:00:00Z", cmd: "x", token: "t" + pid }) + "\n");
  return dir;
}

test("N1 busyNote: 1-minute load average and the number of other live heavy jobs", () => {
  const dir = runDir([["slot-0.json", OWN], ["slot-1.json", OTHER1], ["override-6161-ab.json", OTHER2], ["slot-2.json", DEAD], ["notes.json", OTHER1]]);
  try {
    const note = G.busyNote({ dir, pid: OWN, isAlive: p => ALIVE.has(p), loadavg: () => [12.345, 3, 2] });
    assert.equal(note, "1-minute load average 12.35, 2 other heavy job(s) running");
    assert.equal(G.busyNote({ dir, pid: OTHER1, isAlive: p => ALIVE.has(p), loadavg: () => [0.5, 0, 0] }),
      "1-minute load average 0.50, 2 other heavy job(s) running");
    assert.equal(G.otherHeavyJobs({ dir, pid: OWN, isAlive: p => ALIVE.has(p) }), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("N2 read-only: counting leaves every file in the run folder as it was (a stale file is not removed)", () => {
  const dir = runDir([["slot-0.json", OWN], ["slot-1.json", DEAD], ["slot-2.json", OTHER1]]);
  try {
    const before = readdirSync(dir).sort().map(f => [f, readFileSync(join(dir, f), "utf8")]);
    G.busyNote({ dir, pid: OWN, isAlive: p => ALIVE.has(p), loadavg: () => [1, 1, 1] });
    G.otherHeavyJobs({ dir, pid: OWN, isAlive: p => ALIVE.has(p) });
    assert.deepEqual(readdirSync(dir).sort().map(f => [f, readFileSync(join(dir, f), "utf8")]), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("N3 no run folder = 0 other jobs; a failing folder read or load reading gives \"unknown\" and never throws", () => {
  const missing = join(tmpdir(), "lq-timeout-note-missing-" + process.pid + "-" + Date.now());
  assert.equal(G.busyNote({ dir: missing, pid: OWN, loadavg: () => [2, 1, 1] }), "1-minute load average 2.00, 0 other heavy job(s) running");
  const badFs = { readdirSync: () => { const e = new Error("EACCES"); e.code = "EACCES"; throw e; }, readFileSync: () => { throw new Error("no"); } };
  assert.equal(G.busyNote({ dir: "/x", pid: OWN, fs: badFs, loadavg: () => [2, 1, 1] }), "1-minute load average 2.00, unknown other heavy job(s) running");
  assert.equal(G.busyNote({ dir: missing, pid: OWN, loadavg: () => { throw new Error("no loadavg"); } }), "1-minute load average unknown, 0 other heavy job(s) running");
  // default arguments (real os.loadavg(), real run folder) work and keep the format
  assert.match(G.busyNote(), /^1-minute load average (\d+\.\d\d|unknown), (\d+|unknown) other heavy job\(s\) running$/);
});

test("N4 run.mjs: the per-file timer and its rejection are unchanged; only the note is added to the message", () => {
  const src = readFileSync(join(REPO, "tests", "e2e", "run.mjs"), "utf8");
  assert.match(src, /const FILE_TIMEOUT = parseInt\(process\.env\.LQ_FILE_TIMEOUT \|\| "900000", 10\) \|\| 900000;/);
  assert.match(src, /import \{ busyNote, holdSlot \} from "\.\.\/\.\.\/tools\/load-guard\.mjs";/);
  const race = src.match(/await Promise\.race\(\[mod\.default\(ctx\), new Promise\(\(_, rej\) => \{ timer = setTimeout\(\(\) => rej\(new Error\(`timed out after \$\{FILE_TIMEOUT\} ms; \$\{busyNote\(\)\}`\)\), FILE_TIMEOUT\); \}\)\]\);/g) || [];
  assert.equal(race.length, 1, "one per-file timer: same limit, same rejection, the note computed when the timer fires");
  assert.ok(!/timed out after \$\{FILE_TIMEOUT\} ms`/.test(src), "the bare message is gone");
  // the failure is still counted the same way: the crash line and ff++ in the catch
  assert.match(src, /\} catch \(e\) \{ ff\+\+; console\.log\(` {2}FAIL \$\{f\} crashed: \$\{e && e\.stack \|\| e\}`\); \}/);
});
