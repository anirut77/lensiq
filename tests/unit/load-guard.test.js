// tests/unit/load-guard.test.js — owner decision 205 (2026-11-20), after owner rule 203 ก: start no heavy suite while the 1-minute load
// average is above the load limit, and never run more heavy suites at once than the job limit. tools/load-guard.mjs QUEUES (never fails
// because the machine is busy): it waits in rounds, prints "queued: load X (limit L), running N (limit M), waited Ns of W", and exits 75
// (like tools/disk-guard.mjs) only after the maximum wait. One lock file per running job under ~/LENSIQ-field/run/ (pid, start, command);
// entries whose pid is dead are released. The three limits live in ONE place: tools/load-guard.config.json.
// Override: owner only, LQ_LOAD_GUARD=owner-override:<non-empty reason>, logged to ~/LENSIQ-field/load-guard.log; any other value has no
// effect. On CI runners (CI=true / GITHUB_ACTIONS=true) the guard is a no-op: it only decides WHEN a suite may start on the owner's Mac and
// never changes what a test expects, so CI and a local run keep the same pass rule.
// API under test:
//   acquire(opts) -> { ok, skipped?, reason?, override?, slot?, token?, waitedMs?, code?, message }
//     opts: { label, cmd, env, config | configFile, dir, logFile, loadavg, now, sleep, isAlive, pid, log, fs }
//   release(result)            removes the job's lock file (idempotent)
//   readConfig(file)           { loadLimit, jobLimit, maxWaitSeconds, pollSeconds } (pollSeconds never under 5)
//   holdSlot(opts)             process-wide: acquire once, export LQ_LOAD_GUARD_HELD for child processes, release on exit / SIGINT /
//                              SIGTERM; exit 75 after the maximum wait
//   CLI  node tools/load-guard.mjs -- <command ...>   wrapper: holds a slot while the command runs, exits with its code
//   node --import ./tools/load-guard-hold.mjs ...     holds a slot for that node process (used for npm run test:unit)
// This file is locked: evals-locks/load-guard.sha256 (written BEFORE tools/load-guard.mjs existed).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const GUARD = join(REPO, "tools", "load-guard.mjs");
const HOLD = join(REPO, "tools", "load-guard-hold.mjs");
const CONFIG = join(REPO, "tools", "load-guard.config.json");
const PRELOAD = join(__dirname, "fixtures", "fake-loadavg.cjs");
const CFG = { loadLimit: 10, jobLimit: 2, maxWaitSeconds: 3600, pollSeconds: 15 };
let G;
before(async () => { G = await import(pathToFileURL(GUARD).href); });
const temps = [];
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "lq-load-guard-test-")); temps.push(d); return d; };

/** lock files (one per running job) in a run dir */
const jobs = dir => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(".json")) : []);
/** a fake world: clock, sleep, load sequence, live pids; every side effect recorded */
function world({ loads = [0], live = [], config = CFG, env = {}, onSleep } = {}) {
  const dir = join(tmp(), "run");
  const w = { dir, logFile: join(dir, "..", "load-guard.log"), t: 1_000_000, sleeps: [], logs: [], exits: [], loadCalls: 0, live: new Set(live) };
  w.opts = {
    label: "unit-test job", cmd: "node fake-suite.js", env, config, dir, logFile: w.logFile, pid: 4242,
    loadavg: () => { const v = loads[Math.min(w.loadCalls++, loads.length - 1)]; return [v, v, v]; },
    now: () => w.t,
    sleep: async ms => { w.sleeps.push(ms); w.t += ms; if (onSleep) await onSleep(w, w.sleeps.length); },
    isAlive: pid => pid === 4242 || w.live.has(pid),
    log: m => w.logs.push(String(m)), exit: c => w.exits.push(c)
  };
  w.text = () => w.logs.join("\n");
  return w;
}
/** a running job's lock file, written the way another guard would */
function fakeJob(dir, pid, name) {
  mkdirSync(dir, { recursive: true });
  const f = join(dir, name || `slot-${pid}.json`);
  writeFileSync(f, JSON.stringify({ pid, start: new Date().toISOString(), cmd: "node other-suite.js", token: "t" + pid }));
  return f;
}
const QUEUED = (load, n, wait) => new RegExp(`queued: load ${load}(\\.\\d+)? \\(limit 10\\), running ${n} \\(limit 2\\), waited \\d+s of ${wait}s`);

test("over the load limit: queued (no job file, not started) until the load drops, then starts; never polls faster than every 5 s", async () => {
  const seen = [];
  const w = world({ loads: [12, 12, 12, 3], onSleep: wd => seen.push(jobs(wd.dir).length) });
  const r = await G.acquire(w.opts);
  assert.equal(r.ok, true, r.message);
  assert.ok(r.slot && existsSync(r.slot), "started: its lock file exists");
  assert.ok(w.sleeps.length >= 2, "it waited at least two rounds");
  assert.deepEqual(seen, seen.map(() => 0), "no lock file while queued");
  assert.match(w.text(), QUEUED(12, 0, 3600));
  for (const ms of w.sleeps) assert.ok(ms >= 5000, `polled after ${ms} ms (minimum 5000)`);
  assert.ok(r.waitedMs >= 10000);
  G.release(r);
  assert.equal(jobs(w.dir).length, 0);
});

test("two jobs already running: queued, not started", async () => {
  const w0 = world();
  fakeJob(w0.dir, 5001); fakeJob(w0.dir, 5002);
  const w = world({ live: [5001, 5002], config: { ...CFG, maxWaitSeconds: 60 } });
  w.opts.dir = w0.dir;
  const r = await G.acquire(w.opts);
  assert.equal(r.ok, false, "it never started while two jobs ran");
  assert.match(w.text(), /queued: load 0(\.\d+)? \(limit 10\), running 2 \(limit 2\), waited \d+s of 60s/);
  assert.equal(jobs(w0.dir).length, 2, "no third lock file");
});

test("a slot frees while queued: the job starts in the next round", async () => {
  const w0 = world();
  const a = fakeJob(w0.dir, 5001); fakeJob(w0.dir, 5002);
  const w = world({ live: [5001, 5002], onSleep: (wd, n) => { if (n === 2) { rmSync(a); wd.live.delete(5001); } } });
  w.opts.dir = w0.dir;
  const r = await G.acquire(w.opts);
  assert.equal(r.ok, true, r.message);
  assert.equal(w.sleeps.length, 2);
  assert.match(w.text(), /running 2 \(limit 2\)/);
  assert.equal(jobs(w0.dir).length, 2, "the freed slot is taken by this job");
  G.release(r);
});

test("a stale entry (pid no longer alive) is released and does not count", async () => {
  const w0 = world();
  const s1 = fakeJob(w0.dir, 999991), s2 = fakeJob(w0.dir, 999992);
  const w = world({ live: [] });
  w.opts.dir = w0.dir;
  const r = await G.acquire(w.opts);
  assert.equal(r.ok, true, r.message);
  assert.equal(w.sleeps.length, 0, "no wait: dead jobs hold no slot");
  assert.ok(!existsSync(s1) && !existsSync(s2), "stale lock files removed");
  assert.doesNotMatch(w.text(), /queued/);
  G.release(r);
});

test("maximum wait: exit 75 with a clear reason naming the load, the jobs and the limits; no job file left", async () => {
  const w = world({ loads: [20], config: { ...CFG, maxWaitSeconds: 60 } });
  const r = await G.acquire(w.opts);
  assert.equal(r.ok, false);
  assert.equal(r.code, 75);
  assert.equal(G.EXIT_BUSY, 75);
  assert.match(r.message, /load 20(\.\d+)? \(limit 10\)/);
  assert.match(r.message, /running 0 \(limit 2\)/);
  assert.match(r.message, /60s/);
  assert.match(r.message, /unit-test job/);
  assert.match(r.message, /75/);
  assert.ok(w.t - 1_000_000 >= 60_000 && w.t - 1_000_000 < 60_000 + 15_000 + 1, "it gave up at the maximum wait, not earlier or much later");
  assert.equal(jobs(w.dir).length, 0);
  const h = world({ loads: [20], config: { ...CFG, maxWaitSeconds: 30 } });
  const hr = await G.holdSlot({ ...h.opts, fresh: true });
  assert.deepEqual(h.exits, [75], "holdSlot exits 75 after the maximum wait");
  assert.equal(hr.ok, false);
  assert.match(h.text(), /75/);
});

test("owner override with a reason: runs at once on a busy machine and appends time, command and reason to the log", async () => {
  const w0 = world();
  fakeJob(w0.dir, 5001); fakeJob(w0.dir, 5002);
  const w = world({ loads: [50], live: [5001, 5002], env: { LQ_LOAD_GUARD: "owner-override:owner demo before a meeting" } });
  w.opts.dir = w0.dir; w.opts.logFile = join(w0.dir, "..", "load-guard.log");
  const r = await G.acquire(w.opts);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.override, true);
  assert.equal(w.sleeps.length, 0);
  const log = readFileSync(w.opts.logFile, "utf8").trim().split("\n");
  assert.equal(log.length, 1);
  assert.match(log[0], /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
  assert.match(log[0], /node fake-suite\.js/);
  assert.match(log[0], /owner demo before a meeting/);
  G.release(r);
  await G.acquire(w.opts).then(G.release);
  assert.equal(readFileSync(w.opts.logFile, "utf8").trim().split("\n").length, 2, "every use appends one line");
});

test("override without a reason, or any other LQ_LOAD_GUARD value: no effect (still queued, then exit 75), nothing logged", async () => {
  for (const v of ["owner-override:", "owner-override:   ", "owner-override", "off", "OFF", "0", "false", "override:x", "Owner-Override:x", " owner-override:x", "skip"]) {
    const w = world({ loads: [50], config: { ...CFG, maxWaitSeconds: 30 }, env: { LQ_LOAD_GUARD: v } });
    const r = await G.acquire(w.opts);
    assert.equal(r.ok, false, `LQ_LOAD_GUARD=${JSON.stringify(v)} must not let the job start`);
    assert.equal(r.code, 75);
    assert.match(w.text(), /queued/);
    assert.ok(!existsSync(w.logFile), `nothing logged for ${JSON.stringify(v)}`);
  }
});

test("the config values come from tools/load-guard.config.json and appear in the queued and give-up messages", async () => {
  const c = JSON.parse(readFileSync(CONFIG, "utf8"));
  assert.equal(c.loadLimit, 10, "owner rule 203 ก: load limit 10");
  assert.equal(c.jobLimit, 2, "owner rule 203 ก: never two heavy suites at once beyond the limit of 2");
  assert.ok(Number.isFinite(c.maxWaitSeconds) && c.maxWaitSeconds > 0);
  assert.ok(Number.isFinite(c.pollSeconds) && c.pollSeconds >= 5);
  assert.deepEqual(G.readConfig(CONFIG), { loadLimit: c.loadLimit, jobLimit: c.jobLimit, maxWaitSeconds: c.maxWaitSeconds, pollSeconds: c.pollSeconds });
  const file = join(tmp(), "cfg.json");
  writeFileSync(file, JSON.stringify({ loadLimit: 7, jobLimit: 3, maxWaitSeconds: 120, pollSeconds: 1 }));
  assert.equal(G.readConfig(file).pollSeconds, 5, "pollSeconds is never under 5");
  const w = world({ loads: [8] });
  delete w.opts.config; w.opts.configFile = file;
  const r = await G.acquire(w.opts);
  assert.equal(r.ok, false);
  assert.match(w.text(), /queued: load 8(\.\d+)? \(limit 7\), running 0 \(limit 3\), waited \d+s of 120s/);
  assert.match(r.message, /limit 7/);
  for (const ms of w.sleeps) assert.equal(ms, 5000);
  const d = world({ loads: [0] });
  delete d.opts.config;
  const rd = await G.acquire(d.opts);
  assert.equal(rd.ok, true, "the default config file is the repo one");
  G.release(rd);
  const src = readFileSync(GUARD, "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /loadLimit\s*[:=]\s*\d|jobLimit\s*[:=]\s*\d|maxWaitSeconds\s*[:=]\s*\d/, "no second copy of the limits in the code");
});

test("on CI runners (CI=true or GITHUB_ACTIONS=true) the guard is a no-op: no wait, no job file; CI=false is not CI", async () => {
  for (const env of [{ CI: "true" }, { CI: "1" }, { GITHUB_ACTIONS: "true" }]) {
    const w = world({ loads: [50], env });
    const r = await G.acquire(w.opts);
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
    assert.equal(w.sleeps.length, 0);
    assert.equal(jobs(w.dir).length, 0);
    assert.match(r.message, /CI/);
  }
  const w = world({ loads: [50], env: { CI: "false" }, config: { ...CFG, maxWaitSeconds: 15 } });
  assert.equal((await G.acquire(w.opts)).ok, false, "CI=false is a local run");
});

test("a job file holds pid, start time and command; release is idempotent", async () => {
  const w = world();
  const r = await G.acquire(w.opts);
  const j = JSON.parse(readFileSync(r.slot, "utf8"));
  assert.equal(j.pid, 4242);
  assert.match(j.start, /^\d{4}-\d\d-\d\dT/);
  assert.equal(j.cmd, "node fake-suite.js");
  G.release(r); G.release(r);
  assert.equal(jobs(w.dir).length, 0);
});

test("a child of a job that holds a slot does not take a second one (LQ_LOAD_GUARD_HELD); a forged or dead token has no effect", async () => {
  const w = world();
  const r = await G.acquire(w.opts);
  const held = `${r.slot.split(/[\\/]/).pop()}:${r.token}`;
  const c = world({ loads: [50], env: { LQ_LOAD_GUARD_HELD: held } });
  c.opts.dir = w.dir;
  const rc = await G.acquire(c.opts);
  assert.equal(rc.ok, true);
  assert.equal(rc.skipped, true);
  assert.equal(c.sleeps.length, 0);
  assert.equal(jobs(w.dir).length, 1);
  for (const bad of [`${r.slot.split(/[\\/]/).pop()}:wrong`, "slot-1.json:x", "x", ""]) {
    const f = world({ loads: [50], env: { LQ_LOAD_GUARD_HELD: bad }, config: { ...CFG, maxWaitSeconds: 15 } });
    f.opts.dir = w.dir;
    assert.equal((await G.acquire(f.opts)).ok, false, `forged token ${JSON.stringify(bad)}`);
  }
  G.release(r);
  const d = world({ loads: [50], env: { LQ_LOAD_GUARD_HELD: held }, config: { ...CFG, maxWaitSeconds: 15 } });
  d.opts.dir = w.dir;
  assert.equal((await G.acquire(d.opts)).ok, false, "the holder ended: its token no longer counts");
});

test("never more jobs than the limit, even when several guards start at the same moment", async () => {
  const w0 = world();
  const ws = [1, 2, 3, 4, 5].map(i => { const w = world({ live: [7001, 7002, 7003, 7004, 7005], config: { ...CFG, maxWaitSeconds: 15 } }); w.opts.dir = w0.dir; w.opts.pid = 7000 + i; w.opts.isAlive = () => true; return w; });
  const rs = await Promise.all(ws.map(w => G.acquire(w.opts)));
  assert.equal(rs.filter(r => r.ok).length, 2);
  assert.equal(jobs(w0.dir).length, 2);
  rs.filter(r => r.ok).forEach(G.release);
});

test("cheap: no process scans or shell commands; idle acquire + release under 50 ms (median of 20, real files)", async () => {
  const src = readFileSync(GUARD, "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /execSync|execFileSync|spawnSync|exec\(|["']ps["']|pgrep|lsof|\/proc\//, "no process scans");
  const dir = join(tmp(), "run"), times = [];
  for (let i = 0; i < 20; i++) {
    const t = process.hrtime.bigint();
    const r = await G.acquire({ label: "overhead", cmd: "x", env: {}, dir, logFile: join(dir, "l.log"), loadavg: () => [0, 0, 0] });
    G.release(r);
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  times.sort((a, b) => a - b);
  const median = times[10];
  console.log(`load-guard idle overhead in-process: median ${median.toFixed(2)} ms, max ${times[19].toFixed(2)} ms`);
  assert.ok(median < 50, `median ${median} ms`);
});

/** env for a child process: no CI / guard switches, HOME in a temp folder (its ~/LENSIQ-field/run is fresh) */
function childEnv(home, extra = {}) {
  const e = { ...process.env };
  for (const k of ["CI", "GITHUB_ACTIONS", "LQ_LOAD_GUARD", "LQ_LOAD_GUARD_HELD", "LQ_TEST_FAKE_LOAD", "NODE_TEST_CONTEXT", "NODE_OPTIONS"]) delete e[k];
  return { ...e, HOME: home, ...extra };
}
const runDirOf = home => join(home, "LENSIQ-field", "run");

test("process start cost: node --import tools/load-guard-hold.mjs adds under 50 ms on an idle machine (best of 5 vs plain node)", () => {
  const home = tmp();
  const best = args => {
    let m = Infinity;
    for (let i = 0; i < 5; i++) {
      const t = process.hrtime.bigint();
      const r = spawnSync(process.execPath, args, { env: childEnv(home, { LQ_TEST_FAKE_LOAD: "0" }), encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      m = Math.min(m, Number(process.hrtime.bigint() - t) / 1e6);
    }
    return m;
  };
  const plain = best(["--require", PRELOAD, "-e", "0"]);
  const guarded = best(["--require", PRELOAD, "--import", pathToFileURL(HOLD).href, "-e", "0"]);
  console.log(`load-guard process overhead: plain ${plain.toFixed(1)} ms, guarded ${guarded.toFixed(1)} ms, added ${(guarded - plain).toFixed(1)} ms`);
  assert.ok(guarded - plain < 50, `added ${guarded - plain} ms`);
  assert.equal(jobs(runDirOf(home)).length, 0);
});

test("held slot (--import hold): one job file while it runs, released on normal exit and on an error", () => {
  const home = tmp();
  const hold = ["--require", PRELOAD, "--import", pathToFileURL(HOLD).href];
  const r = spawnSync(process.execPath, [...hold, "-e", `console.log(require("fs").readdirSync(${JSON.stringify(runDirOf(home))}).filter(f => f.endsWith(".json")).length, !!process.env.LQ_LOAD_GUARD_HELD)`],
    { env: childEnv(home, { LQ_TEST_FAKE_LOAD: "0" }), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "1 true");
  assert.equal(jobs(runDirOf(home)).length, 0, "released on normal exit");
  const e = spawnSync(process.execPath, [...hold, "-e", "throw new Error('boom')"], { env: childEnv(home, { LQ_TEST_FAKE_LOAD: "0" }), encoding: "utf8" });
  assert.equal(e.status, 1);
  assert.equal(jobs(runDirOf(home)).length, 0, "released after an uncaught error");
});

/** start a child, wait until its job file exists, send a signal, return its exit */
function signalled(args, home, sig) {
  return new Promise((res, rej) => {
    const c = spawn(process.execPath, args, { env: childEnv(home, { LQ_TEST_FAKE_LOAD: "0" }), stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    c.stdout.on("data", d => { out += d; if (/ready/.test(out) && !c.sent) { c.sent = true; c.jobsWhileRunning = jobs(runDirOf(home)).length; c.kill(sig); } });
    c.stderr.on("data", d => { out += d; });
    const t = setTimeout(() => { c.kill("SIGKILL"); rej(new Error("child did not end: " + out)); }, 20000);
    c.on("exit", (code, signal) => { clearTimeout(t); res({ code, signal, out, during: c.jobsWhileRunning }); });
  });
}
const SLEEPER = "console.log('ready'); setInterval(() => {}, 1000)";

test("held slot is released on SIGINT and SIGTERM, and the process still ends", async () => {
  for (const sig of ["SIGINT", "SIGTERM"]) {
    const home = tmp();
    const r = await signalled(["--require", PRELOAD, "--import", pathToFileURL(HOLD).href, "-e", SLEEPER], home, sig);
    assert.equal(r.during, 1, `one job file while running (${sig})`);
    assert.ok(r.signal === sig || r.code === 130 || r.code === 143, `ended by ${sig}: ${r.code} ${r.signal}`);
    assert.equal(jobs(runDirOf(home)).length, 0, `released on ${sig}`);
  }
});

test("CLI wrapper: node tools/load-guard.mjs -- <command> holds a slot, passes the exit code through, releases on exit and on signals", async () => {
  const home = tmp();
  const w = spawnSync(process.execPath, ["--require", PRELOAD, GUARD, "--", process.execPath, "-e", `console.log(require("fs").readdirSync(${JSON.stringify(runDirOf(home))}).length); process.exit(3)`],
    { env: childEnv(home, { LQ_TEST_FAKE_LOAD: "0" }), encoding: "utf8" });
  assert.equal(w.status, 3, w.stderr);
  assert.match(w.stdout, /^1\b/m);
  assert.equal(jobs(runDirOf(home)).length, 0);
  for (const sig of ["SIGINT", "SIGTERM"]) {
    const h = tmp();
    const r = await signalled(["--require", PRELOAD, GUARD, "--", process.execPath, "-e", SLEEPER], h, sig);
    assert.equal(r.during, 1);
    assert.ok(r.signal === sig || r.code === 130 || r.code === 143, `${sig}: ${r.code} ${r.signal}`);
    assert.equal(jobs(runDirOf(h)).length, 0, `released on ${sig}`);
  }
});

test("CLI on a busy machine prints the queued line with the config values; on CI it runs the command without a slot", () => {
  const home = tmp();
  mkdirSync(runDirOf(home), { recursive: true });
  const r = spawnSync(process.execPath, ["--require", PRELOAD, GUARD, "--", process.execPath, "-e", "console.log('ran')"],
    { env: childEnv(home, { LQ_TEST_FAKE_LOAD: "12,0" }), encoding: "utf8", timeout: 60000 });
  const c = JSON.parse(readFileSync(CONFIG, "utf8"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, new RegExp(`queued: load 12(\\.\\d+)? \\(limit ${c.loadLimit}\\), running 0 \\(limit ${c.jobLimit}\\), waited \\d+s of ${c.maxWaitSeconds}s`));
  assert.match(r.stdout, /ran/);
  const ci = spawnSync(process.execPath, ["--require", PRELOAD, GUARD, "--", process.execPath, "-e", "console.log(require('fs').existsSync(" + JSON.stringify(runDirOf(home) + "/x") + ") ? 'x' : 'ran')"],
    { env: childEnv(home, { LQ_TEST_FAKE_LOAD: "50", CI: "true" }), encoding: "utf8", timeout: 20000 });
  assert.equal(ci.status, 0, ci.stderr);
  assert.match(ci.stdout, /ran/);
  assert.equal(jobs(runDirOf(home)).length, 0);
});

test("wiring: run.mjs holds a slot after the disk guard and before the server; cdp.mjs launch() holds one before Chrome starts", () => {
  const run = readFileSync(join(REPO, "tests", "e2e", "run.mjs"), "utf8");
  assert.match(run, /import\s*\{[^}]*\bholdSlot\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/tools\/load-guard\.mjs["']/);
  const h = run.indexOf("await holdSlot(");
  assert.ok(h > run.indexOf("assertFreeSpace("), "after the disk guard");
  for (const m of ['spawn("python3"', "await freePort()", "sweepStale()"]) assert.ok(h < run.indexOf(m), `before ${m}`);
  const cdp = readFileSync(join(REPO, "tests", "e2e", "cdp.mjs"), "utf8");
  assert.match(cdp, /import\s*\{[^}]*\bholdSlot\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/tools\/load-guard\.mjs["']/);
  const body = cdp.slice(cdp.indexOf("export async function launch("));
  const hc = body.indexOf("await holdSlot(");
  assert.ok(hc > 0 && hc < body.indexOf("mkdtempSync("), "launch() holds a slot before it creates a profile or starts Chrome");
});

test("wiring: npm test:unit, test:integration and csp:check run through the guard; every playwright-only browser harness in tools/ holds a slot", () => {
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  for (const k of ["test:unit", "test:integration", "csp:check"]) assert.match(pkg.scripts[k], /tools\/load-guard(-hold)?\.mjs/, `npm run ${k}`);
  assert.match(pkg.scripts["test:e2e"], /tests\/e2e\/run\.mjs/);
  assert.match(pkg.scripts["load:guard"] || "", /tools\/load-guard\.mjs/);
  const bad = [];
  for (const f of readdirSync(join(REPO, "tools")).filter(f => f.endsWith(".mjs"))) {
    const src = readFileSync(join(REPO, "tools", f), "utf8").replace(/^\s*(\/\/|\*).*$/gm, "");
    const direct = /\b(webkit|chromium|firefox)\.launch\(|["']playwright["']/.test(src);
    if (direct && !/holdSlot\(/.test(src)) bad.push(f);
  }
  assert.deepEqual(bad, [], "tools that start a browser through playwright must call holdSlot() first (cdp.mjs launch() covers the rest)");
});

test("documented: tests/README.md and docs/HANDOVER.md name the load guard, the config file, exit 75, CI no-op, and that teams never use the override", () => {
  const readme = readFileSync(join(REPO, "tests", "README.md"), "utf8");
  const handover = readFileSync(join(REPO, "docs", "HANDOVER.md"), "utf8");
  for (const re of [/load-guard/, /load-guard\.config\.json/, /75/, /owner-override/, /CI/, /queued/, /LENSIQ-field\/run/, /load-guard\.log/]) assert.match(readme, re);
  assert.match(readme, /never use the override/i);
  assert.match(readme, /incident/i);
  assert.match(handover, /load-guard/);
});
