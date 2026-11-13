// tests/unit/e2e-profile-sweep.test.js — owner request 2026-11-13 (disk filled with 41 left-over Chrome test profiles, 1.5 GB).
// sweepStale(root) in tests/e2e/cdp.mjs removes only throw-away Chrome profiles that LENSIQ tests created
// (name starts with "lq-e2e-" AND an ".lq-owner" file names the test process) whose test process is no longer running.
// Everything else is left alone. No Chrome is started here.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
let sweepStale;
before(async () => { ({ sweepStale } = await import(pathToFileURL(join(__dirname, "..", "e2e", "cdp.mjs")).href)); });

// a pid that certainly belonged to a process that has exited
const deadPid = () => spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" }).stdout.trim();

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "lq-sweep-test-"));
  const mk = (name, owner) => {
    const d = join(root, name); mkdirSync(join(d, "Default"), { recursive: true });
    writeFileSync(join(d, "Default", "Preferences"), "{}");
    if (owner != null) writeFileSync(join(d, ".lq-owner"), String(owner));
    return d;
  };
  return { root, mk, done: () => rmSync(root, { recursive: true, force: true }) };
}

test("removes a LENSIQ test profile whose test process has exited", () => {
  const s = sandbox();
  try {
    const d = s.mk("lq-e2e-dead01", deadPid());
    const r = sweepStale(s.root);
    assert.equal(existsSync(d), false);
    assert.equal(r.removed.length, 1);
  } finally { s.done(); }
});

test("keeps a profile whose test process is still running", () => {
  const s = sandbox();
  try {
    const d = s.mk("lq-e2e-live01", process.pid);
    const r = sweepStale(s.root);
    assert.equal(existsSync(d), true);
    assert.equal(r.removed.length, 0);
  } finally { s.done(); }
});

test("keeps an lq-e2e- folder that has no owner file (not provably ours)", () => {
  const s = sandbox();
  try {
    const d = s.mk("lq-e2e-noowner", null);
    sweepStale(s.root);
    assert.equal(existsSync(d), true);
  } finally { s.done(); }
});

test("never touches folders with another name, even with an owner file of an exited process", () => {
  const s = sandbox();
  try {
    const pid = deadPid();
    const others = ["lq-csp-e2e-x", "lensiq-dry-x", "Documents", "lq-e2e", "xlq-e2e-abc"].map(n => s.mk(n, pid));
    sweepStale(s.root);
    for (const d of others) assert.equal(existsSync(d), true, d);
  } finally { s.done(); }
});

test("an owner file that is not a plain process number is left alone", () => {
  const s = sandbox();
  try {
    const bad = ["", "abc", "-1", "0", "12 34", "../../etc"].map((v, i) => s.mk(`lq-e2e-bad${i}`, v));
    sweepStale(s.root);
    for (const d of bad) assert.equal(existsSync(d), true, d);
  } finally { s.done(); }
});

test("a plain file named lq-e2e-* is not removed; a missing root does not throw", () => {
  const s = sandbox();
  try {
    const f = join(s.root, "lq-e2e-file"); writeFileSync(f, "x");
    sweepStale(s.root);
    assert.equal(existsSync(f), true);
    assert.doesNotThrow(() => sweepStale(join(s.root, "does-not-exist")));
  } finally { s.done(); }
});
