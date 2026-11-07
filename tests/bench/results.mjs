#!/usr/bin/env node
// tests/bench/results.mjs — committed benchmark result summaries (numbers only, never images or dataset files) with the
// dataset fingerprints they were measured on, so a published figure can be traced and re-checked.
//
//   node tests/bench/results.mjs hash [name …]               sha256 fingerprint of each dataset folder under $LQ_BENCH_DATA
//                                                          (sorted relative path + size + sha256 of every file)
//   node tests/bench/results.mjs record <bench> <out.json>   wrap a bench's --json output into tests/bench/results/<bench>.json
//                                                          with date, git commit, machine, dataset fingerprints and the
//                                                          exact command to reproduce it; refuses image data / big blobs
//   node tests/bench/results.mjs headlines                 (re)write tests/bench/results/headlines.json from
//                                                          docs/accuracy-figures.json (what the pages quote, with the
//                                                          fingerprints recorded so far; null = not recorded yet)
//   node tests/bench/results.mjs --check                   validate every committed summary (CI: tests/unit/bench-results.test.js)
//
// Reproduce a figure: fetch the datasets (python3 -I tests/bench/fetch_datasets.py ~/lq-bench-data), compare
// `results.mjs hash` with the fingerprints in the summary, then run the summary's `reproduce` command.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { cpus, platform, arch } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUT = join(REPO, "tests", "bench", "results");
/** bench -> datasets it reads (folder names under $LQ_BENCH_DATA) and the command that reproduces its --json */
export const BENCHES = Object.freeze({
  people: { datasets: ["mot"], cmd: "LQ_BENCH_DATA=~/lq-bench-data node tests/bench/people.bench.mjs --fps 5 --json out.json" },
  face: { datasets: ["lfw", "utk"], cmd: "LQ_BENCH_DATA=~/lq-bench-data node tests/bench/face.bench.mjs --json out.json" },
  face1n: { datasets: ["lfwfull", "casia"], cmd: "LQ_BENCH_DATA=~/lq-bench-data node tests/bench/face1n.bench.mjs --json out.json" },
  hand: { datasets: ["hagrid"], cmd: "LQ_BENCH_DATA=~/lq-bench-data node tests/bench/hand.bench.mjs --json out.json" },
  driver: { datasets: ["oceyes", "cew"], cmd: "LQ_BENCH_DATA=~/lq-bench-data node tests/bench/driver.bench.mjs --json out.json" },
  "driver-session": { datasets: ["lfwfull", "cew"], cmd: "LQ_BENCH_DATA=~/lq-bench-data node tests/bench/driver-session.bench.mjs --minutes 10 --json out.json" },
  neuro: { datasets: ["fer"], cmd: "LQ_BENCH_DATA=~/lq-bench-data node tests/bench/neuro.bench.mjs --json out.json" },
  qc: { datasets: [], cmd: "node tests/bench/qc.bench.mjs --json out.json" },
  checkout: { datasets: [], cmd: "node tests/bench/checkout.bench.mjs --json out.json" }
});

/** fingerprint of one folder: sha256 over "relpath\tsize\tsha256(file)\n" for every file, sorted; dot-paths skipped */
export function hashDir(dir) {
  const files = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith(".")) continue; const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.isFile()) files.push(p); } };
  walk(dir);
  files.sort();
  const h = createHash("sha256");
  let bytes = 0;
  for (const f of files) { const b = readFileSync(f); bytes += b.length; h.update(`${relative(dir, f).split(sep).join("/")}\t${b.length}\t${createHash("sha256").update(b).digest("hex")}\n`); }
  return { sha256: h.digest("hex"), files: files.length, bytes };
}

/** throws when a summary could carry images or raw data: data: URIs, long base64 runs, huge arrays */
export function assertNumbersOnly(obj, where = "summary") {
  const s = JSON.stringify(obj);
  if (/data:(image|video)\//i.test(s)) throw new Error(`${where}: contains a data: image/video URI`);
  if (/[A-Za-z0-9+/]{2000,}={0,2}/.test(s)) throw new Error(`${where}: contains a long base64-like blob`);
  if (s.length > 2_000_000) throw new Error(`${where}: larger than 2 MB — keep summaries, not per-image dumps`);
  const walk = (v, p) => { if (Array.isArray(v)) { if (v.length > 20000) throw new Error(`${where}: array ${p} has ${v.length} items`); v.forEach((x, i) => walk(x, p + "[" + i + "]")); } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, p + "." + k); };
  walk(obj, "");
}

/** validate one committed summary -> list of problems */
export function validate(doc, name = "summary") {
  const errs = [];
  try { assertNumbersOnly(doc, name); } catch (e) { errs.push(e.message); }
  if (doc.format !== "lensiq-bench-summary") errs.push(`${name}: format must be "lensiq-bench-summary"`);
  if (!doc.reproduce || typeof doc.reproduce !== "string") errs.push(`${name}: missing "reproduce" command`);
  if (!doc.datasets || typeof doc.datasets !== "object") errs.push(`${name}: missing "datasets"`);
  else for (const [k, v] of Object.entries(doc.datasets)) {
    if (!v || typeof v !== "object") { errs.push(`${name}: dataset ${k} must be an object`); continue; }
    if (v.sha256 !== null && !/^[0-9a-f]{64}$/.test(String(v.sha256))) errs.push(`${name}: dataset ${k} sha256 must be 64 hex chars or null`);
    if (v.sha256 === null && !v.note) errs.push(`${name}: dataset ${k} has no fingerprint and no note saying why`);
  }
  return errs;
}

function git(...a) { try { return execFileSync("git", a, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } }

function headlines() {
  const fig = JSON.parse(readFileSync(join(REPO, "docs", "accuracy-figures.json"), "utf8"));
  const recorded = {};
  if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (f.endsWith(".json") && f !== "headlines.json") {
    try { const d = JSON.parse(readFileSync(join(OUT, f), "utf8")); for (const [k, v] of Object.entries(d.datasets || {})) if (v && v.sha256) recorded[k] = v; } catch { /* ignore */ }
  }
  const all = [...new Set(Object.values(BENCHES).flatMap(b => b.datasets))].sort();
  const datasets = Object.fromEntries(all.map(k => [k, recorded[k] || { sha256: null, note: "not recorded: the round 3–6 runs that produced these figures predate fingerprinting; re-run the bench and `results.mjs record` to fill it" }]));
  return {
    format: "lensiq-bench-summary", bench: "headlines", round: fig.round, source: "docs/accuracy-figures.json (transcribed from ACCURACY.md)",
    reproduce: "see BENCHES in tests/bench/results.mjs — one command per bench; datasets via python3 -I tests/bench/fetch_datasets.py ~/lq-bench-data",
    datasets,
    figures: Object.fromEntries(Object.entries(fig.figures).map(([k, v]) => [k, { value: v.value, raw: v.raw ?? null, what: v.what, evidence: v.md }]))
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const DATA = process.env.LQ_BENCH_DATA ? resolve(process.env.LQ_BENCH_DATA.replace(/^~(?=\/)/, process.env.HOME || "~")) : "";
  if (cmd === "hash") {
    if (!DATA) { console.log("skip: LQ_BENCH_DATA not set"); process.exit(0); }
    const names = rest.length ? rest : readdirSync(DATA).filter(n => !n.startsWith(".") && statSync(join(DATA, n)).isDirectory());
    for (const n of names) { const p = join(DATA, n); console.log(existsSync(p) ? `${n}\t${JSON.stringify(hashDir(p))}` : `${n}\tmissing`); }
  } else if (cmd === "record") {
    const [bench, file] = rest, B = BENCHES[bench];
    if (!B || !file) { console.error("usage: results.mjs record <" + Object.keys(BENCHES).join("|") + "> <bench --json output>"); process.exit(2); }
    const result = JSON.parse(readFileSync(file, "utf8"));
    assertNumbersOnly(result, file);
    const datasets = {};
    for (const n of B.datasets) datasets[n] = DATA && existsSync(join(DATA, n)) ? hashDir(join(DATA, n)) : { sha256: null, note: "dataset folder not found when recording" };
    const doc = { format: "lensiq-bench-summary", bench, recorded: new Date().toISOString(), commit: git("rev-parse", "HEAD"), dirty: !!git("status", "--porcelain"),
      machine: { platform: platform(), arch: arch(), cpu: (cpus()[0] || {}).model || null, node: process.version }, reproduce: B.cmd, datasets, result };
    const errs = validate(doc, bench);
    if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, bench + ".json"), JSON.stringify(doc, null, 1) + "\n");
    writeFileSync(join(OUT, "headlines.json"), JSON.stringify(headlines(), null, 1) + "\n");
    console.log("wrote tests/bench/results/" + bench + ".json");
  } else if (cmd === "headlines") {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "headlines.json"), JSON.stringify(headlines(), null, 1) + "\n");
    console.log("wrote tests/bench/results/headlines.json");
  } else if (cmd === "--check") {
    const errs = [];
    if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (f.endsWith(".json")) errs.push(...validate(JSON.parse(readFileSync(join(OUT, f), "utf8")), f));
    if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
    console.log("bench summaries OK");
  } else {
    console.error("usage: results.mjs hash | record <bench> <file> | headlines | --check"); process.exit(2);
  }
}
