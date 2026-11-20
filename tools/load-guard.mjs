#!/usr/bin/env node
// tools/load-guard.mjs — queues heavy local suites while the Mac is busy (owner decision 205, 2026-11-20, after owner rule 203 ก: start no
// heavy suite while the 1-minute load average is above the load limit, and never run more heavy suites at once than the job limit).
// It never fails because the machine is busy: it waits in rounds, printing
//   load-guard: queued: load X (limit L), running N (limit M), waited Ns of Ws — <job>
// and starts the job as soon as the load is at or under the limit and a job slot is free. Only after the maximum wait does it give up,
// with exit code 75 (EX_TEMPFAIL, the same as tools/disk-guard.mjs) and a message naming the load, the jobs and the limits.
// The limits live in ONE place: tools/load-guard.config.json { loadLimit, jobLimit, maxWaitSeconds, pollSeconds (never under 5) }.
// Running jobs: one lock file per job in ~/LENSIQ-field/run/ (slot-<i>.json, i < jobLimit, created atomically; override-*.json for owner
// overrides), each holding { pid, start, cmd, token }. A file whose pid is dead is stale: it is removed and does not count.
// Use:
//   import { holdSlot } from "./load-guard.mjs"; await holdSlot({ label })   in-process (tests/e2e/run.mjs, launch() in tests/e2e/cdp.mjs)
//   node --import ./tools/load-guard-hold.mjs <node args>                     a whole node process (npm run test:unit, csp:check, ...)
//   node tools/load-guard.mjs -- <command ...>                                wrapper for any command; exits with the command's code
//   node tools/load-guard.mjs --status                                        the config, the load and the running jobs
// The slot is released on normal exit, on an error and on SIGINT / SIGTERM / SIGHUP; a SIGKILLed job's file is cleaned up as stale.
// Child processes of a job inherit LQ_LOAD_GUARD_HELD=<file>:<token> and do not take a second slot (the file must exist with that token
// and a live pid, otherwise the variable has no effect).
// Override: owner only. LQ_LOAD_GUARD=owner-override:<non-empty reason> starts the job at once and appends "<UTC time>\t<command>\t<reason>"
// to ~/LENSIQ-field/load-guard.log. Any other value of LQ_LOAD_GUARD has no effect. Teams never use it; a team's use is an incident.
// CI: a no-op on CI runners (CI=true or GITHUB_ACTIONS=true), where each job has its own machine. Like the disk guard it is an environment
// precondition: it decides only WHEN a suite may start on the owner's Mac and never changes what any test expects, so CI and a local run
// keep the same pass rule. Cheap by design: os.loadavg() and one directory listing per round, no process scans, no shell commands.
import fs from "node:fs";
import os from "node:os";
import { basename, dirname, join } from "node:path";
// Only fs, os and path load up front (owner detail 2: the guard must never be why a suite is slow). node:child_process and node:url are
// loaded only by the CLI, and the token is not a secret (it only tells a parent's slot from a stale or foreign one), so no node:crypto.

export const EXIT_BUSY = 75;
const HERE = dirname(decodeURIComponent(new URL(import.meta.url).pathname));
export const CONFIG_FILE = join(HERE, "load-guard.config.json");
/** a random hex string (not a secret) @param {number} bytes */
const randomHex = bytes => Array.from({ length: bytes }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
export const OVERRIDE_PREFIX = "owner-override:";
export const MIN_POLL_SECONDS = 5;
const JOB_RE = /^(slot-\d+|override-[\w-]+)\.json$/;
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];

export const runDir = (home = os.homedir()) => join(home, "LENSIQ-field", "run");
export const logPath = (home = os.homedir()) => join(home, "LENSIQ-field", "load-guard.log");

/** the limits from the one config file @param {string} [file] @param {typeof fs} [fsx] */
export function readConfig(file = CONFIG_FILE, fsx = fs) {
  const c = JSON.parse(fsx.readFileSync(file, "utf8"));
  const pos = (/** @type {string} */ k) => {
    const n = Number(c[k]);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`load-guard: ${file}: "${k}" must be a positive number`);
    return n;
  };
  return { loadLimit: pos("loadLimit"), jobLimit: Math.max(1, Math.floor(pos("jobLimit"))), maxWaitSeconds: pos("maxWaitSeconds"),
    pollSeconds: Math.max(MIN_POLL_SECONDS, pos("pollSeconds")) };
}

/** @param {Record<string, string|undefined>} env */
export function isCI(env) {
  const on = (/** @type {string|undefined} */ v) => { const s = String(v || "").trim().toLowerCase(); return !!s && !["false", "0", "no", "off"].includes(s); };
  return on(env.CI) || on(env.GITHUB_ACTIONS);
}

/** the owner's reason, or null: exactly "owner-override:" followed by a non-empty reason; nothing else counts @param {Record<string, string|undefined>} env */
export function overrideReason(env) {
  const v = env.LQ_LOAD_GUARD;
  if (typeof v !== "string" || !v.startsWith(OVERRIDE_PREFIX)) return null;
  const reason = v.slice(OVERRIDE_PREFIX.length).replace(/[\t\r\n]+/g, " ").trim();
  return reason || null;
}

/** @param {number} pid */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return /** @type {NodeJS.ErrnoException} */ (e).code === "EPERM"; }
}

/** @param {typeof fs} fsx @param {string} file */
function readJob(fsx, file) { try { return JSON.parse(fsx.readFileSync(file, "utf8")); } catch { return null; } }

/** live job files in the run dir; stale ones (dead pid) are removed @param {{dir: string, fsx: typeof fs, isAlive: (pid: number) => boolean}} o */
function scan({ dir, fsx, isAlive }) {
  let names = [];
  try { names = fsx.readdirSync(dir); } catch { return []; }
  const live = [];
  for (const name of names) {
    if (!JOB_RE.test(name)) continue;
    const file = join(dir, name), job = readJob(fsx, file);
    if (job && isAlive(Number(job.pid))) { live.push(name); continue; }
    if (!job) { // unreadable: count it unless it is old (files are written whole before they appear, so this is a damaged file)
      try { if (Date.now() - fsx.statSync(file).mtimeMs < 60_000) { live.push(name); continue; } } catch { continue; }
    }
    removeStale(fsx, dir, name, isAlive);
  }
  return live;
}

/** move the stale file aside atomically, then delete it; if a live job took that name meanwhile, put it back */
function removeStale(/** @type {typeof fs} */ fsx, /** @type {string} */ dir, /** @type {string} */ name, /** @type {(pid: number) => boolean} */ isAlive) {
  const file = join(dir, name), aside = join(dir, `.stale-${process.pid}-${randomHex(4)}`);
  try { fsx.renameSync(file, aside); } catch { return; }
  const job = readJob(fsx, aside);
  if (job && isAlive(Number(job.pid))) { try { fsx.linkSync(aside, file); } catch { /* the name was taken again */ } }
  try { fsx.unlinkSync(aside); } catch { /* gone */ }
}

/** create `name` with `data` atomically (fails if it exists) @returns {boolean} */
function createJob(/** @type {typeof fs} */ fsx, /** @type {string} */ dir, /** @type {string} */ name, /** @type {object} */ data) {
  const tmp = join(dir, `.tmp-${process.pid}-${randomHex(4)}`);
  fsx.writeFileSync(tmp, JSON.stringify(data) + "\n");
  try { fsx.linkSync(tmp, join(dir, name)); return true; } catch { return false; } finally { try { fsx.unlinkSync(tmp); } catch { /* gone */ } }
}

/**
 * The waiting loop, written once: it yields the number of ms to sleep and returns the result. acquire() sleeps with a timer,
 * acquireSync() with Atomics.wait (for the --require / --import preload, which must finish before the suite starts).
 * @param {AcquireOptions} o
 * @returns {Generator<number, any, unknown>}
 */
function* attempt(o) {
  const env = o.env || process.env, fsx = o.fs || fs, log = o.log || (m => console.error(m));
  const label = o.label || "this job", cmd = o.cmd || label;
  if (isCI(env)) return { ok: true, skipped: true, reason: "ci", message: "load-guard: skipped (CI runner: each CI job has its own machine)" };
  const dir = o.dir || runDir(), isAlive = o.isAlive || pidAlive, pid = o.pid || process.pid;
  if (heldBy(env, dir, isAlive, fsx)) return { ok: true, skipped: true, reason: "held", message: "load-guard: the parent job already holds a slot" };
  let cfg;
  try { cfg = o.config || readConfig(o.configFile || CONFIG_FILE, fsx); } catch (e) {
    return { ok: true, skipped: true, reason: "config", message: `load-guard: warning: cannot read the limits (${/** @type {Error} */ (e).message}); not blocking ${label}` };
  }
  const loadavg = o.loadavg || os.loadavg, now = o.now || Date.now;
  const token = randomHex(12);
  const job = () => ({ pid, start: new Date().toISOString(), cmd: cmd.slice(0, 500), token });
  fsx.mkdirSync(dir, { recursive: true });
  const reason = overrideReason(env);
  if (reason) {
    const logFile = o.logFile || logPath();
    fsx.mkdirSync(dirname(logFile), { recursive: true });
    fsx.appendFileSync(logFile, `${new Date().toISOString()}\t${cmd.replace(/[\t\r\n]+/g, " ")}\t${reason}\n`);
    const name = `override-${pid}-${randomHex(4)}.json`;
    createJob(fsx, dir, name, job());
    const message = `load-guard: OWNER OVERRIDE (${reason}): starting ${label} without waiting; logged to ${logFile}`;
    log(message);
    return { ok: true, override: true, slot: join(dir, name), token, waitedMs: 0, message };
  }
  const { loadLimit: L, jobLimit: M, maxWaitSeconds: W, pollSeconds: P } = cfg;
  const start = now();
  for (;;) {
    const load = Number(loadavg()[0]) || 0;
    const live = scan({ dir, fsx, isAlive });
    if (load <= L && live.length < M) {
      for (let i = 0; i < M; i++) {
        const name = `slot-${i}.json`;
        if (!live.includes(name) && createJob(fsx, dir, name, job())) {
          return { ok: true, slot: join(dir, name), token, waitedMs: now() - start, message: `load-guard: started ${label} (slot ${i + 1} of ${M})` };
        }
      }
    }
    const waited = now() - start;
    const state = `load ${load.toFixed(2)} (limit ${L}), running ${live.length} (limit ${M})`;
    if (waited >= W * 1000) {
      return { ok: false, code: EXIT_BUSY, waitedMs: waited,
        message: `load-guard: waited ${Math.round(waited / 1000)}s of ${W}s and the machine is still busy: ${state}; ${label} did not start. `
          + `Run it again when the other heavy jobs have finished. Exit code ${EXIT_BUSY}.` };
    }
    log(`load-guard: queued: ${state}, waited ${Math.round(waited / 1000)}s of ${W}s — ${label}`);
    if (o.onQueued) o.onQueued({ load, running: live.length, waitedMs: waited }); // e.g. run.mjs re-checks the disk guard each round
    yield P * 1000;
  }
}

/** true when LQ_LOAD_GUARD_HELD names a job file in `dir` with that token and a live pid (a parent job's slot) */
function heldBy(/** @type {Record<string, string|undefined>} */ env, /** @type {string} */ dir, /** @type {(pid: number) => boolean} */ isAlive, /** @type {typeof fs} */ fsx) {
  const held = String(env.LQ_LOAD_GUARD_HELD || ""), cut = held.lastIndexOf(":");
  if (cut <= 0 || !JOB_RE.test(held.slice(0, cut))) return false;
  const job = readJob(fsx, join(dir, held.slice(0, cut)));
  return !!(job && job.token && job.token === held.slice(cut + 1) && isAlive(Number(job.pid)));
}

/**
 * @typedef {{label?: string, cmd?: string, env?: Record<string, string|undefined>, config?: ReturnType<typeof readConfig>, configFile?: string,
 *   dir?: string, logFile?: string, loadavg?: () => number[], now?: () => number, sleep?: (ms: number) => unknown,
 *   isAlive?: (pid: number) => boolean, pid?: number, log?: (m: string) => void, fs?: typeof fs,
 *   onQueued?: (state: {load: number, running: number, waitedMs: number}) => void}} AcquireOptions
 * onQueued runs once per queued round, before the wait (no slot is held then); run.mjs uses it to re-check the free disk space.
 */
/** Wait for a job slot. Never throws because the machine is busy. @param {AcquireOptions} [o] */
export async function acquire(o = {}) {
  const sleep = o.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const it = attempt(o);
  for (let s = it.next(); ; s = it.next()) { if (s.done) return s.value; await sleep(s.value); }
}

/** the same, blocking (Atomics.wait): for a preload that must hold the slot before the process's main code runs @param {AcquireOptions} [o] */
export function acquireSync(o = {}) {
  const cell = new Int32Array(new SharedArrayBuffer(4));
  const sleep = o.sleep || (ms => { Atomics.wait(cell, 0, 0, ms); });
  const it = attempt(o);
  for (let s = it.next(); ; s = it.next()) { if (s.done) return s.value; sleep(s.value); }
}

/** remove the job's lock file if it is still ours (idempotent) @param {{slot?: string, token?: string, released?: boolean}|null|undefined} r @param {typeof fs} [fsx] */
export function release(r, fsx = fs) {
  if (!r || !r.slot || r.released) return;
  r.released = true;
  const job = readJob(fsx, r.slot);
  if (job && job.token === r.token) { try { fsx.unlinkSync(r.slot); } catch { /* gone */ } }
}

/** @type {any} */
let held = null;
/** after acquire: exit 75, or export the token to child processes and release on exit / signals @param {any} r @param {any} o */
function keep(r, o) {
  const env = o.env || process.env, log = o.log || (m => console.error(m));
  if (!r.ok) { log(r.message); (o.exit || process.exit)(EXIT_BUSY); return r; }
  if (r.reason === "ci" || r.reason === "config") log(r.message);
  if (r.slot) {
    env.LQ_LOAD_GUARD_HELD = `${basename(r.slot)}:${r.token}`;
    const free = () => release(r, o.fs || fs);
    process.on("exit", free);
    for (const sig of SIGNALS) {
      const h = () => { free(); process.removeListener(sig, h); if (process.listenerCount(sig) === 0) process.kill(process.pid, sig); };
      process.on(sig, h);
    }
  }
  return r;
}
/**
 * Process-wide: wait for a slot once, then keep it until this process ends. Exits 75 after the maximum wait.
 * @param {AcquireOptions & {exit?: (code: number) => void, fresh?: boolean}} [o]
 */
export function holdSlot(o = {}) {
  if (held && !o.fresh) return Promise.resolve(held);
  const p = acquire(o).then(r => keep(r, o));
  if (!o.fresh) held = p;
  return p;
}
/** holdSlot, blocking: used by tools/load-guard-hold.mjs (node --require / --import) @param {AcquireOptions & {exit?: (code: number) => void, fresh?: boolean}} [o] */
export function holdSlotSync(o = {}) {
  if (held && !o.fresh) return held;
  const r = keep(acquireSync(o), o);
  if (!o.fresh) held = r;
  return r;
}

/** @param {string[]} argv */
async function cli(argv) {
  if (argv[0] === "--status" && argv.length === 1) {
    const c = readConfig(), dir = runDir(), live = scan({ dir, fsx: fs, isAlive: pidAlive });
    console.log(`load-guard: ${CONFIG_FILE}: load limit ${c.loadLimit}, job limit ${c.jobLimit}, max wait ${c.maxWaitSeconds}s, poll every ${c.pollSeconds}s`);
    console.log(`load-guard: 1-minute load ${os.loadavg()[0].toFixed(2)}, running ${live.length} job(s) in ${dir}`);
    for (const n of live) { const j = readJob(fs, join(dir, n)) || {}; console.log(`  ${n}  pid ${j.pid}  since ${j.start}  ${j.cmd}`); }
    return 0;
  }
  if (argv[0] !== "--" || argv.length < 2) {
    console.error("usage: node tools/load-guard.mjs -- <command ...>   |   node tools/load-guard.mjs --status");
    return 2;
  }
  const command = argv.slice(1), text = command.join(" ");
  const r = await acquire({ label: text, cmd: text });
  if (!r.ok) { console.error(r.message); return EXIT_BUSY; }
  if (r.reason === "ci" || r.reason === "config") console.error(r.message);
  const env = { ...process.env };
  if (r.slot) env.LQ_LOAD_GUARD_HELD = `${basename(r.slot)}:${r.token}`;
  process.on("exit", () => release(r));
  const { spawn } = /** @type {typeof import("node:child_process")} */ (process.getBuiltinModule("node:child_process"));
  const child = spawn(command[0], command.slice(1), { stdio: "inherit", env });
  /** @type {Array<[string, () => void]>} */
  const handlers = SIGNALS.map(sig => [sig, () => { try { child.kill(/** @type {NodeJS.Signals} */ (sig)); } catch { /* gone */ } }]);
  for (const [sig, h] of handlers) process.on(sig, h);
  child.on("error", e => { release(r); console.error(`load-guard: could not start ${command[0]}: ${e.message}`); process.exit(127); });
  child.on("exit", (code, signal) => {
    release(r);
    if (signal) { for (const [sig, h] of handlers) process.removeListener(sig, h); process.kill(process.pid, signal); return; }
    process.exit(code ?? 1);
  });
  return undefined;
}

const self = (() => {
  try {
    const { fileURLToPath } = /** @type {typeof import("node:url")} */ (process.getBuiltinModule("node:url"));
    return /load-guard\.mjs$/.test(process.argv[1] || "") && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch { return false; }
})();
if (self) cli(process.argv.slice(2)).then(code => { if (code !== undefined) process.exit(code); });
