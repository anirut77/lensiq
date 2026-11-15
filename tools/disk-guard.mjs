#!/usr/bin/env node
// tools/disk-guard.mjs — stops heavy local jobs when free disk space is under 5 GB (owner order 2026-11-15: parallel agent
// teams filled the disk and broke git and the tests).
//   freeBytes(path)                                   bytes a normal user can still write on the volume holding `path`
//                                                     (fs.statfsSync, Node >= 18.15; falls back to `df -k -P`); null if unknown
//   assertFreeSpace({ minGB = 5, path = os.homedir(), label })
//                                                     exit code 75 (EX_TEMPFAIL) with a message naming the free space and the limit
//   checkFreeSpace(opts)                              the same check without exiting: { ok, skipped, free, min, message }
//   node tools/disk-guard.mjs [--min 5]               CLI: exit 0 = enough room, 75 = stop, 2 = usage error
// 1 GB = 1024^3 bytes (the GiB that `df -h` and Finder call "GB"). Limit order: minGB argument > LQ_DISK_MIN_GB > 5.
// Called first by tests/e2e/run.mjs (and again before every test file there) and by every tools/*.mjs that launches a browser;
// tests/unit/disk-guard.test.js checks that no browser harness is left without it.
// Skipped, with one line saying so: LQ_DISK_GUARD=off (explicit override) and on CI runners (CI=true, set by GitHub Actions).
// Why CI is skipped by itself rather than by an edit of every workflow job: the guard is an environment precondition ("this
// machine has room to work"), not a test result. It decides whether a job may START on the owner's Mac; it never changes what a
// test expects, so CI and a local run apply the same pass rule to every test. A CI runner disk is ephemeral and not the owner's.
// If the free size cannot be read at all, it warns and lets the job run: it never blocks on its own failure.
import { execFileSync } from "node:child_process";
import fs, { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

export const EXIT_LOW_DISK = 75;
export const DEFAULT_MIN_GB = 5;
const GIB = 1024 ** 3;

const nonNeg = v => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const okNum = n => Number.isFinite(n) && n >= 0;

/** free bytes on the volume of `path`, or null @param {string} [path] @param {{statfs?: Function|null, df?: Function}} [o] */
export function freeBytes(path = homedir(), o = {}) {
  const statfs = o.statfs === undefined ? fs.statfsSync : o.statfs;
  if (typeof statfs === "function") {
    try {
      const s = statfs(path), n = Number(s.bavail) * Number(s.bsize);
      if (Number.isFinite(n) && n >= 0) return n;
    } catch { /* fall through to df */ }
  }
  const df = o.df || (p => execFileSync("df", ["-k", "-P", p], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }));
  try {
    const lines = String(df(path)).split("\n").map(l => l.trim()).filter(Boolean);
    const kib = Number(lines[lines.length - 1].split(/\s+/)[3]);
    return lines.length >= 2 && Number.isFinite(kib) && kib >= 0 ? kib * 1024 : null;
  } catch { return null; }
}

/** @param {{minGB?: number, path?: string, label?: string, statfs?: Function|null, df?: Function, env?: Record<string,string|undefined>}} [o] */
export function checkFreeSpace(o = {}) {
  const env = o.env || process.env;
  const path = o.path || homedir();
  const min = [o.minGB, nonNeg(env.LQ_DISK_MIN_GB)].find(okNum) ?? DEFAULT_MIN_GB;
  if (String(env.LQ_DISK_GUARD || "").trim().toLowerCase() === "off") return { ok: true, skipped: true, min, message: "disk-guard: skipped (LQ_DISK_GUARD=off)" };
  const ci = String(env.CI || "").trim().toLowerCase();
  if (ci && !["false", "0", "no", "off"].includes(ci)) return { ok: true, skipped: true, min, message: "disk-guard: skipped (CI runner)" };
  const free = freeBytes(path, o);
  if (free === null) return { ok: true, skipped: false, free, min, message: `disk-guard: warning: could not read the free disk space of ${path}; not blocking ${o.label || "this job"}` };
  const gb = (free / GIB).toFixed(2);
  if (free >= min * GIB) return { ok: true, skipped: false, free, min, message: `disk-guard: ${gb} GB free on ${path} (limit ${min} GB)` };
  return {
    ok: false, skipped: false, free, min,
    message: `disk-guard: only ${gb} GB free on ${path} (limit ${min} GB), stopping ${o.label || "this job"}. `
      + "Free some disk space (old worktrees, node_modules copies, Chrome test profiles in the temp folder, eval output) and run it again. "
      + `Exit code ${EXIT_LOW_DISK}.`
  };
}

/** exits with 75 when under the limit; returns true when the job may go on @param {Parameters<typeof checkFreeSpace>[0] & {exit?: (code: number) => void, log?: (m: string) => void}} [o] */
export function assertFreeSpace(o = {}) {
  const r = checkFreeSpace(o);
  const log = o.log || (m => console.error(m));
  if (r.ok) {
    if (r.skipped || r.free === null) log(r.message); // pass quietly when there is room; say so when the guard did not really check
    return true;
  }
  log(r.message);
  (o.exit || process.exit)(EXIT_LOW_DISK);
  return false;
}

function cli(argv) {
  let min;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--min" || a.startsWith("--min=")) {
      const v = a === "--min" ? argv[++i] : a.slice(6);
      min = nonNeg(v);
      if (!okNum(min)) { console.error(`disk-guard: --min needs a number of GB, got "${v}"`); return 2; }
    } else { console.error("usage: node tools/disk-guard.mjs [--min 5]"); return 2; }
  }
  const r = checkFreeSpace({ minGB: min, label: "disk-guard check" });
  (r.ok ? console.log : console.error)(r.message);
  return r.ok ? 0 : EXIT_LOW_DISK;
}

const self = (() => { try { return pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href; } catch { return false; } })();
if (self) process.exit(cli(process.argv.slice(2)));
