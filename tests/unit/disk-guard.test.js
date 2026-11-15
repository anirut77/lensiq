// tests/unit/disk-guard.test.js — owner order 2026-11-15: heavy local jobs stop when free disk space is under 5 GB (parallel agent
// teams filled the Mac's disk and broke git and the tests). tools/disk-guard.mjs: freeBytes(path) (fs.statfsSync, `df -k` fallback),
// assertFreeSpace({ minGB = 5, path = os.homedir(), label }) (exit 75 + message), CLI `node tools/disk-guard.mjs [--min 5]`.
// Heavy entry points call it first (tests/e2e/run.mjs, every tools/*.mjs that launches a browser) and run.mjs re-checks before
// every test file. The guard is an environment precondition, not a test result: it is skipped on CI runners (CI=true) and with
// LQ_DISK_GUARD=off. This file is locked: evals-locks/disk-guard.sha256 (written BEFORE tools/disk-guard.mjs existed).
// 1 GB = 1024^3 bytes (the GiB that `df -h` and Finder show as "GB" on this Mac).
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync, readdirSync } = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const GUARD = join(REPO, "tools", "disk-guard.mjs");
const PRELOAD = join(__dirname, "fixtures", "fake-statfs.cjs");
const GIB = 1024 ** 3;
let G;
before(async () => { G = await import(pathToFileURL(GUARD).href); });

/** a fake fs.statfsSync reporting `gib` GiB available to a normal user (bfree is larger: only bavail counts) */
const fakeStatfs = (gib, calls) => p => {
  if (calls) calls.push(p);
  const bsize = 4096, bavail = Math.floor(gib * GIB / bsize);
  return { bsize, bavail, bfree: bavail * 3, blocks: bavail * 9 };
};
/** a guard run with every side effect captured */
function run(gib, opts = {}) {
  const out = { exits: [], logs: [], paths: [] };
  const ok = G.assertFreeSpace({
    statfs: fakeStatfs(gib, out.paths), env: {}, exit: c => out.exits.push(c), log: m => out.logs.push(String(m)), ...opts
  });
  return { ...out, ok, text: out.logs.join("\n") };
}
/** env for a child process with every guard switch removed (node --test and CI both set variables the guard reads) */
const cleanEnv = extra => {
  const e = { ...process.env };
  for (const k of ["CI", "LQ_DISK_GUARD", "LQ_DISK_MIN_GB", "LQ_TEST_FAKE_FREE_GIB", "NODE_TEST_CONTEXT", "GITHUB_ACTIONS"]) delete e[k];
  return { ...e, ...extra };
};
const node = (args, extra, timeout = 60000) => spawnSync(process.execPath, args, { cwd: REPO, env: cleanEnv(extra), encoding: "utf8", timeout });

test("exports the exit code 75, the default limit 5 and the two functions", () => {
  assert.equal(G.EXIT_LOW_DISK, 75);
  assert.equal(G.DEFAULT_MIN_GB, 5);
  assert.equal(typeof G.freeBytes, "function");
  assert.equal(typeof G.assertFreeSpace, "function");
});

test("freeBytes reads fs.statfsSync: available blocks (bavail) times block size, for the path asked", () => {
  const calls = [];
  assert.equal(G.freeBytes("/some/path", { statfs: fakeStatfs(3, calls) }), Math.floor(3 * GIB / 4096) * 4096);
  assert.deepEqual(calls, ["/some/path"]);
});

test("freeBytes falls back to `df -k` when statfsSync throws, or does not exist (Node before 18.15)", () => {
  const dfOut = "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s5 239362496 190000000 4096 98% /System/Volumes/Data\n";
  const seen = [];
  const df = p => { seen.push(p); return dfOut; };
  assert.equal(G.freeBytes("/x", { statfs: () => { throw new Error("ENOSYS"); }, df }), 4096 * 1024);
  assert.equal(G.freeBytes("/x", { statfs: null, df }), 4096 * 1024);
  assert.deepEqual(seen, ["/x", "/x"]);
  // a nonsense statfs answer also falls back
  assert.equal(G.freeBytes("/x", { statfs: () => ({ bavail: NaN, bsize: 4096 }), df }), 4096 * 1024);
});

test("freeBytes on this machine: real statfs and real df agree to within 1 GB, and both are positive", () => {
  const a = G.freeBytes(tmpdir()), b = G.freeBytes(tmpdir(), { statfs: null });
  assert.ok(a > 0 && b > 0, `statfs ${a}, df ${b}`);
  assert.ok(Math.abs(a - b) < GIB, `statfs ${a} vs df ${b}`);
});

test("freeBytes returns null when neither statfs nor df can answer", () => {
  assert.equal(G.freeBytes("/x", { statfs: null, df: () => { throw new Error("no df"); } }), null);
  assert.equal(G.freeBytes("/x", { statfs: null, df: () => "garbage" }), null);
});

test("under the limit: exit code 75, and the message names the free space, the limit, the label and what to do", () => {
  const r = run(4.2, { minGB: 5, label: "mobile-audit" });
  assert.deepEqual(r.exits, [75]);
  assert.equal(r.ok, false);
  assert.match(r.text, /4\.2\d? GB/);
  assert.match(r.text, /limit 5 GB/);
  assert.match(r.text, /mobile-audit/);
  assert.match(r.text, /free (up )?(some )?(disk )?space|delete|clean/i);
});

test("one byte under 5 GB stops; exactly 5 GB passes", () => {
  assert.deepEqual(run(0, { statfs: () => ({ bsize: 1, bavail: 5 * GIB - 1 }) }).exits, [75]);
  assert.deepEqual(run(0, { statfs: () => ({ bsize: 1, bavail: 5 * GIB }) }).exits, []);
});

test("at the limit and above the limit it passes", () => {
  for (const gib of [5, 5.01, 14, 500]) {
    const r = run(gib, { minGB: 5 });
    assert.deepEqual(r.exits, [], `${gib} GB free must pass`);
    assert.equal(r.ok, true);
  }
});

test("defaults: limit 5 GB, path os.homedir()", () => {
  const r4 = run(4.99);
  assert.deepEqual(r4.exits, [75]);
  assert.deepEqual(r4.paths, [homedir()]);
  const r5 = run(5);
  assert.deepEqual(r5.exits, []);
  assert.match(r4.text, /limit 5 GB/);
});

test("a custom minGB and path are honoured; LQ_DISK_MIN_GB sets the default limit, an explicit minGB wins over it", () => {
  const a = run(7, { minGB: 10, path: "/vol" });
  assert.deepEqual(a.exits, [75]);
  assert.deepEqual(a.paths, ["/vol"]);
  assert.match(a.text, /limit 10 GB/);
  assert.deepEqual(run(7, { env: { LQ_DISK_MIN_GB: "8" } }).exits, [75]);
  assert.deepEqual(run(7, { env: { LQ_DISK_MIN_GB: "6" } }).exits, []);
  assert.deepEqual(run(7, { minGB: 10, env: { LQ_DISK_MIN_GB: "1" } }).exits, [75]);
  assert.deepEqual(run(0.1, { env: { LQ_DISK_MIN_GB: "banana" } }).exits, [75], "a bad value is ignored: the 5 GB default stays");
});

test("LQ_DISK_GUARD=off skips the check completely (no statfs call, no exit), for any free size", () => {
  for (const v of ["off", "OFF", " off "]) {
    const r = run(0, { env: { LQ_DISK_GUARD: v } });
    assert.deepEqual(r.exits, [], v);
    assert.deepEqual(r.paths, [], "statfs must not even be called");
    assert.equal(r.ok, true);
  }
  for (const v of ["on", "", "0", "false", "no"]) assert.deepEqual(run(0, { env: { LQ_DISK_GUARD: v } }).exits, [75], `LQ_DISK_GUARD=${v} is not an override`);
});

test("CI runners (CI=true / 1) skip the guard: a runner disk is not the owner's disk; CI=false / 0 / empty do not", () => {
  for (const v of ["true", "1", "TRUE"]) assert.deepEqual(run(0, { env: { CI: v } }).exits, [], `CI=${v}`);
  for (const v of ["false", "0", ""]) assert.deepEqual(run(0, { env: { CI: v } }).exits, [75], `CI=${v}`);
});

test("when the free size cannot be read at all, the guard warns and lets the job run (it never blocks on its own failure)", () => {
  const r = run(0, { statfs: null, df: () => { throw new Error("x"); } });
  assert.deepEqual(r.exits, []);
  assert.equal(r.ok, true);
  assert.match(r.text, /could not|cannot|unknown/i);
});

test("CLI: node tools/disk-guard.mjs --min N exits 75 under the limit with the message on stderr, 0 otherwise", () => {
  const low = node([GUARD, "--min", "99999999"]);
  assert.equal(low.status, 75, low.stdout + low.stderr);
  assert.match(low.stderr, /GB free/);
  assert.match(low.stderr, /limit 99999999 GB/);
  const ok = node([GUARD, "--min", "0.001"]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /GB free/);
  const eq = node([GUARD, "--min=0.001"]);
  assert.equal(eq.status, 0, "--min=N form");
  assert.equal(node([GUARD, "--min", "abc"]).status, 2, "a bad --min is a usage error, not a pass");
  assert.equal(node([GUARD, "--bogus"]).status, 2);
});

test("CLI default limit is 5 GB (fake statfs: 4 GB free -> 75, 6 GB free -> 0); the override and CI skip it", () => {
  const pre = ["--require", PRELOAD, GUARD];
  assert.equal(node(pre, { LQ_TEST_FAKE_FREE_GIB: "4" }).status, 75);
  assert.equal(node(pre, { LQ_TEST_FAKE_FREE_GIB: "6" }).status, 0);
  assert.equal(node(pre, { LQ_TEST_FAKE_FREE_GIB: "5" }).status, 0);
  assert.equal(node(pre, { LQ_TEST_FAKE_FREE_GIB: "4", LQ_DISK_GUARD: "off" }).status, 0);
  assert.equal(node(pre, { LQ_TEST_FAKE_FREE_GIB: "4", CI: "true" }).status, 0);
  assert.equal(node([...pre, "--min", "3"], { LQ_TEST_FAKE_FREE_GIB: "4" }).status, 0);
});

test("tests/e2e/run.mjs calls the guard before it starts the server or launches Chrome (fake disk: 1 GB free -> exit 75, no file runs)", () => {
  const r = node(["--require", PRELOAD, join(REPO, "tests", "e2e", "run.mjs"), "profile-cleanup"], { LQ_TEST_FAKE_FREE_GIB: "1" });
  assert.equal(r.status, 75, r.stdout + r.stderr);
  assert.match(r.stderr, /disk-guard/);
  assert.doesNotMatch(r.stdout, /LENSIQ e2e/);
  assert.doesNotMatch(r.stdout, /# \S+\.e2e\.mjs/);
});

test("tests/e2e/run.mjs re-checks before every test file: disk fine at the start, low before the first file -> exit 75, no file runs", () => {
  const r = node(["--require", PRELOAD, join(REPO, "tests", "e2e", "run.mjs"), "profile-cleanup"], { LQ_TEST_FAKE_FREE_GIB: "100,1" });
  assert.equal(r.status, 75, r.stdout + r.stderr);
  assert.match(r.stderr, /disk-guard/);
  assert.match(r.stdout + r.stderr, /stopp/i);
  assert.doesNotMatch(r.stdout, /# \S+\.e2e\.mjs/, "no test file may start once the disk is low");
  assert.doesNotMatch(r.stdout, /\d+ passed, \d+ failed/);
});

test("run.mjs source: guard first, a check at the top of the per-file loop, and a clean stop (browsers closed, profiles removed, server stopped)", () => {
  const src = readFileSync(join(REPO, "tests", "e2e", "run.mjs"), "utf8");
  const first = src.indexOf("assertFreeSpace(");
  assert.ok(first > 0, "run.mjs must call assertFreeSpace");
  for (const marker of ['spawn("python3"', "await freePort()", "sweepStale()"]) {
    assert.ok(src.indexOf(marker) > first, `assertFreeSpace( must come before ${marker}`);
  }
  const loop = src.slice(src.indexOf("for (const f of files)"));
  const head = loop.slice(0, loop.indexOf("for (let attempt"));
  assert.match(head, /checkFreeSpace\(/, "the per-file loop must re-check the disk before each file");
  assert.match(src, /closeAll\(\)/);
  assert.match(src, /EXIT_LOW_DISK|exit\(75\)/);
  assert.match(src, /leftoverProfiles|rmSync|sweepStale/);
});

test("every harness that launches a browser calls the guard first (tools/*.mjs using tests/e2e/cdp.mjs or playwright)", () => {
  const files = readdirSync(join(REPO, "tools")).filter(f => f.endsWith(".mjs") && f !== "disk-guard.mjs");
  const heavy = [], bad = [];
  for (const f of files) {
    const src = readFileSync(join(REPO, "tools", f), "utf8");
    if (!/tests\/e2e\/cdp\.mjs|["']playwright["']/.test(src.replace(/^\s*(\/\/|\*).*$/gm, ""))) continue;
    heavy.push(f);
    const imp = /import\s*\{[^}]*\bassertFreeSpace\b[^}]*\}\s*from\s*["']\.\/disk-guard\.mjs["']/.test(src);
    const call = src.indexOf("assertFreeSpace(");
    const launch = src.search(/\b(await\s+launch\(|webkit\.launch\()/);
    if (!imp || call < 0 || (launch >= 0 && call > launch)) bad.push(`${f} (import ${imp}, call at ${call}, first launch at ${launch})`);
  }
  assert.ok(heavy.length >= 20, `expected at least 20 browser harnesses, found ${heavy.length}: ${heavy.join(" ")}`);
  assert.deepEqual(bad, [], "these harnesses must `import { assertFreeSpace } from \"./disk-guard.mjs\"` and call it before launching a browser");
});

test("every npm audit:* script runs a guarded tool, and package.json has a disk:guard script", () => {
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  const audits = Object.entries(pkg.scripts).filter(([k]) => k.startsWith("audit:"));
  assert.ok(audits.length >= 2);
  for (const [k, cmd] of audits) {
    const m = /node (tools\/[\w.-]+\.mjs)/.exec(cmd);
    assert.ok(m, `${k}: ${cmd}`);
    assert.match(readFileSync(join(REPO, m[1]), "utf8"), /assertFreeSpace\(/, `${k} -> ${m[1]} must call the disk guard`);
  }
  assert.match(pkg.scripts["disk:guard"] || "", /tools\/disk-guard\.mjs/);
});

test("the guard is documented where the owner looks: HANDOVER.md and tests/README.md name it, with the CI choice", () => {
  const handover = readFileSync(join(REPO, "docs", "HANDOVER.md"), "utf8");
  const readme = readFileSync(join(REPO, "tests", "README.md"), "utf8");
  assert.match(handover, /disk-guard/);
  assert.match(handover, /75/);
  assert.match(readme, /disk-guard/);
  assert.match(readme, /LQ_DISK_GUARD=off/);
  assert.match(readme, /CI/);
  assert.match(readme, /precondition/i);
});
