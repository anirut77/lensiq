#!/usr/bin/env node
// tools/e2e-shards.mjs — splits tests/e2e/*.e2e.mjs into N CI shards and proves afterwards that every file ran exactly once.
//   assign(files, seconds, n) -> string[][]   deterministic: longest file first onto the lightest shard (ties: lower shard),
//                                             weights from tests/e2e/shard-weights.json (a missing file gets the median)
//   node tools/e2e-shards.mjs --list i/n       the files of shard i (for a quick look)
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

/** @param {string[]} files @param {Record<string, number>} sec @param {number} n @returns {string[][]} */
export function assign(files, sec, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error("shard count must be a whole number >= 1");
  const known = Object.values(sec).filter(v => typeof v === "number" && v > 0).sort((a, b) => a - b);
  const med = known.length ? known[Math.floor(known.length / 2)] : 1;
  const w = f => (typeof sec[f] === "number" && sec[f] > 0 ? sec[f] : med);
  const order = [...new Set(files)].sort((a, b) => w(b) - w(a) || (a < b ? -1 : a > b ? 1 : 0));
  const shards = Array.from({ length: n }, () => ({ t: 0, files: /** @type {string[]} */ ([]) }));
  for (const f of order) {
    let k = 0;
    for (let i = 1; i < n; i++) if (shards[i].t < shards[k].t) k = i;
    shards[k].files.push(f); shards[k].t += w(f);
  }
  return shards.map(s => s.files.sort());
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
    console.log(assign(allFiles(), weights(), n)[i - 1].join("\n"));
  } else if (a[0] === "--check" && a[1] && existsSync(a[1])) {
    const paths = manifests(a[1]);
    const list = paths.map(p => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return { bad: p }; } });
    const bad = list.filter(m => m.bad).map(m => `unreadable manifest ${m.bad}`);
    const errs = [...bad, ...checkManifests(list.filter(m => !m.bad), allFiles())];
    if (errs.length) { for (const e of errs) console.log(`::error::${e}`); console.log(`e2e shards: FAILED (${errs.length} problem(s))`); process.exit(1); }
    const n = list[0].total, ran = list.reduce((s, m) => s + m.ran.length, 0);
    console.log(`e2e shards: OK — ${n} shard(s), ${ran} file(s), each of the ${allFiles().length} test files ran exactly once`);
  } else {
    console.error("usage: e2e-shards.mjs --list i/n | --check <dir>"); process.exit(2);
  }
}
