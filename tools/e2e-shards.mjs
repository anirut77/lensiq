#!/usr/bin/env node
// tools/e2e-shards.mjs — splits tests/e2e/*.e2e.mjs into N CI shards and proves afterwards that every file ran exactly once.
//   assign(files, seconds, n) -> string[][]   deterministic: longest file first onto the lightest shard (ties: lower shard),
//                                             weights from tests/e2e/shard-weights.json (a missing file gets the median)
//   assign(files, seconds, n, {base: [s1, s2, …]}) shard i starts with base[i-1] seconds already on it (the CI steps that run
//                                             after the tests in one shard only: built-_site check in 1, external in 2, CSP in
//                                             3), so the split balances whole jobs, not just test time (2026-11-18: shard 1/3
//                                             reached the 75-min job limit because its 9-min site check was not counted)
//   assign(files, seconds, n, {macLast: true}) the WebKit files (name contains "webkit", see isMacFile) go to shard n
//                                             ONLY, the rest is balanced over shards 1..n-1 exactly as assign(rest, n-1).
//                                             CI runs shard n on macOS: Linux WebKit plays no camera video (stream B,
//                                             coordinator decision 2026-11-14, option 1). Every file still runs exactly once.
//   node tools/e2e-shards.mjs --list i/n [--mac-last]   the files of shard i (for a quick look)
//   node tools/e2e-shards.mjs --plan n [--mac-last]     every shard's expected seconds (tests + its fixed CI steps)
//   node tools/e2e-shards.mjs --weights-from <log> …    reads `gh run view <id> --job <id> --log` output of the e2e shard
//                                             jobs and prints a new shard-weights.json (seconds per file from the CI log
//                                             timestamps; the longest value wins when a file appears in several logs; files
//                                             not in any log keep their old value). Refresh it when a shard nears the limit.
//   node tools/e2e-shards.mjs --check <dir>    reads every e2e-shard-*.json manifest under <dir> (written by
//                                             tests/e2e/run.mjs --shard=i/n --manifest=…) and FAILS (exit 1) unless: all N
//                                             manifests are there, each shard once, every *.e2e.mjs file in the checkout
//                                             ran in exactly one shard, no shard ran a file it was not given, and no file
//                                             is unknown. Owner decision 2026-11-11 (gate time, option ค).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const E2E = join(repo, "tests", "e2e");

/** @returns {string[]} every e2e file name in the checkout, sorted */
export const allFiles = () => readdirSync(E2E).filter(f => f.endsWith(".e2e.mjs")).sort();

/** @returns {Record<string, number>} */
export function weights() {
  try { return JSON.parse(readFileSync(join(E2E, "shard-weights.json"), "utf8")).seconds || {}; } catch { return {}; }
}

/** Fixed seconds per shard for the CI split (ci.yml: 3 Linux shards of 4 with --mac-last), from shard-weights.json "base".
 * Any other split gets no base (plain balance by test time).
 * @param {number} n @param {boolean} [macLast] @returns {number[] | undefined} */
export function baseFor(n, macLast) {
  let j = {};
  try { j = JSON.parse(readFileSync(join(E2E, "shard-weights.json"), "utf8")); } catch { /* no file: no base */ }
  const b = j.base;
  if (!b || !Array.isArray(b.seconds) || b.shards !== n || !!b.macLast !== !!macLast) return undefined;
  return b.seconds.map(Number);
}

/** WebKit (iOS engine) e2e files: they run on the macOS shard when the split is made with {macLast: true}
 * @param {string} f @returns {boolean} */
export const isMacFile = f => /webkit/i.test(f);

/**
 * @param {string[]} files @param {Record<string, number>} sec @param {number} n
 * @param {{macLast?: boolean, base?: number[]}} [o] base: seconds already on each (Linux) shard @returns {string[][]}
 */
export function assign(files, sec, n, o = {}) {
  if (!Number.isInteger(n) || n < 1) throw new Error("shard count must be a whole number >= 1");
  if (o.macLast) {
    if (n < 2) throw new Error("--mac-last needs at least 2 shards (the last one is the macOS shard)");
    const uniq = [...new Set(files)];
    return [...assign(uniq.filter(f => !isMacFile(f)), sec, n - 1, { base: o.base }), uniq.filter(isMacFile).sort()];
  }
  const known = Object.values(sec).filter(v => typeof v === "number" && v > 0).sort((a, b) => a - b);
  const med = known.length ? known[Math.floor(known.length / 2)] : 1;
  const w = f => (typeof sec[f] === "number" && sec[f] > 0 ? sec[f] : med);
  const order = [...new Set(files)].sort((a, b) => w(b) - w(a) || (a < b ? -1 : a > b ? 1 : 0));
  const base = o.base || [];
  if (base.length && (base.length !== n || base.some(v => !(typeof v === "number" && v >= 0))))
    throw new Error(`base must list ${n} non-negative numbers of seconds, got ${JSON.stringify(base)}`);
  const shards = Array.from({ length: n }, (_, i) => ({ t: base[i] || 0, files: /** @type {string[]} */ ([]) }));
  for (const f of order) {
    let k = 0;
    for (let i = 1; i < n; i++) if (shards[i].t < shards[k].t) k = i;
    shards[k].files.push(f); shards[k].t += w(f);
  }
  return shards.map(s => s.files.sort());
}

/** expected seconds per shard: its base plus the weights of its files
 * @param {string[][]} split @param {Record<string, number>} sec @param {number[]} [base] @returns {number[]} */
export function load(split, sec, base = []) {
  const known = Object.values(sec).filter(v => typeof v === "number" && v > 0).sort((a, b) => a - b);
  const med = known.length ? known[Math.floor(known.length / 2)] : 1;
  return split.map((s, i) => s.reduce((t, f) => t + (typeof sec[f] === "number" && sec[f] > 0 ? sec[f] : med), base[i] || 0));
}

/** seconds per e2e file from GitHub Actions job logs (each line "<job>\t<step>\t<ISO time> <text>"): a file runs from its
 * "# name.e2e.mjs" line to the next file's line or the "N passed, M failed" summary; a retry adds to the same file.
 * @param {string[]} texts @returns {Record<string, number>} */
export function secondsFromLogs(texts) {
  const out = {};
  for (const text of texts) {
    const per = {};
    let cur = null, t0 = 0;
    for (const line of text.split("\n")) {
      const m = /(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) (.*)$/.exec(line);
      if (!m) continue;
      const t = Date.parse(m[1]), f = /^# (\S+\.e2e\.mjs)/.exec(m[2]);
      if (f || /^\d+ passed, \d+ failed/.test(m[2])) {
        if (cur) per[cur] = (per[cur] || 0) + (t - t0) / 1000;
        cur = f ? f[1] : null; t0 = t;
      }
    }
    for (const [f, v] of Object.entries(per)) out[f] = Math.max(out[f] || 0, Math.max(1, Math.round(v)));
  }
  return out;
}

/** @param {string} spec "i/n" @returns {{i: number, n: number}} */
export function parseShard(spec) {
  const m = /^(\d+)\/(\d+)$/.exec(String(spec || ""));
  const i = m ? +m[1] : NaN, n = m ? +m[2] : NaN;
  if (!m || n < 1 || i < 1 || i > n) throw new Error(`bad shard "${spec}" (expected i/n, 1 <= i <= n)`);
  return { i, n };
}

/** @param {string} dir @returns {string[]} manifest paths under dir (artifact folders are searched one level deep) */
function manifests(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) if (/^e2e-shard-.*\.json$/.test(f)) out.push(join(p, f)); }
    else if (/^e2e-shard-.*\.json$/.test(e)) out.push(p);
  }
  return out.sort();
}

/** @param {any[]} list manifests @param {string[]} files expected files @returns {string[]} problems (empty = OK) */
export function checkManifests(list, files) {
  const errs = [];
  if (!list.length) return ["no shard manifest found"];
  const totals = new Set(list.map(m => m && m.total));
  if (totals.size !== 1) errs.push(`manifests disagree on the shard count: ${[...totals].join(", ")}`);
  const n = list[0] && list[0].total;
  if (!Number.isInteger(n) || n < 1) return [...errs, "bad shard count in manifest"];
  const seen = new Map();
  for (const m of list) {
    if (!Number.isInteger(m.shard) || m.shard < 1 || m.shard > n) { errs.push(`bad shard number ${m.shard}`); continue; }
    if (seen.has(m.shard)) errs.push(`shard ${m.shard}/${n} reported twice`);
    seen.set(m.shard, m);
  }
  for (let i = 1; i <= n; i++) if (!seen.has(i)) errs.push(`shard ${i}/${n}: no manifest (the job did not finish)`);
  const count = new Map(files.map(f => [f, 0]));
  for (const m of seen.values()) {
    const ran = Array.isArray(m.ran) ? m.ran : [];
    const given = new Set(Array.isArray(m.assigned) ? m.assigned : []);
    for (const f of ran) {
      if (!count.has(f)) { errs.push(`shard ${m.shard}: ran ${f}, which is not a test file in this checkout`); continue; }
      count.set(f, /** @type {number} */ (count.get(f)) + 1);
      if (!given.has(f)) errs.push(`shard ${m.shard}: ran ${f} but was not given it`);
    }
    for (const f of given) if (!ran.includes(f)) errs.push(`shard ${m.shard}: was given ${f} but did not run it`);
  }
  for (const [f, c] of count) if (c !== 1) errs.push(`${f}: ran ${c} time(s) across shards (must be exactly 1)`);
  return errs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === "--list") {
    const { i, n } = parseShard(a[1]);
    const ml = a.includes("--mac-last");
    console.log(assign(allFiles(), weights(), n, { macLast: ml, base: baseFor(n, ml) })[i - 1].join("\n"));
  } else if (a[0] === "--plan" && /^\d+$/.test(a[1] || "")) {
    const n = +a[1], ml = a.includes("--mac-last"), w = weights(), b = baseFor(n, ml) || [];
    const split = assign(allFiles(), w, n, { macLast: ml, base: b.length ? b : undefined });
    const t = load(split, w, b);
    split.forEach((s, i) => console.log(`shard ${i + 1}/${n}: ${s.length} file(s), ~${Math.round(t[i] / 60)} min (${t[i]} s, base ${b[i] || 0} s)`));
    const miss = allFiles().filter(f => !(w[f] > 0));
    if (miss.length) console.log(`no weight yet (median used): ${miss.join(", ")}`);
  } else if (a[0] === "--weights-from" && a.length > 1) {
    const path = join(E2E, "shard-weights.json");
    let j = {};
    try { j = JSON.parse(readFileSync(path, "utf8")); } catch { /* new file */ }
    const fresh = secondsFromLogs(a.slice(1).map(p => readFileSync(p, "utf8")));
    const seconds = { ...(j.seconds || {}), ...fresh };
    const sorted = Object.fromEntries(Object.keys(seconds).sort().map(k => [k, seconds[k]]));
    console.log(JSON.stringify({ ...j, seconds: sorted }, null, 1));
  } else if (a[0] === "--check" && a[1] && existsSync(a[1])) {
    const paths = manifests(a[1]);
    const list = paths.map(p => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return { bad: p }; } });
    const bad = list.filter(m => m.bad).map(m => `unreadable manifest ${m.bad}`);
    const errs = [...bad, ...checkManifests(list.filter(m => !m.bad), allFiles())];
    if (errs.length) { for (const e of errs) console.log(`::error::${e}`); console.log(`e2e shards: FAILED (${errs.length} problem(s))`); process.exit(1); }
    const n = list[0].total, ran = list.reduce((s, m) => s + m.ran.length, 0);
    console.log(`e2e shards: OK — ${n} shard(s), ${ran} file(s), each of the ${allFiles().length} test files ran exactly once`);
  } else {
    console.error("usage: e2e-shards.mjs --list i/n [--mac-last] | --plan n [--mac-last] | --weights-from <log>… | --check <dir>"); process.exit(2);
  }
}
