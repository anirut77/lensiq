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
//   node tests/bench/results.mjs --check [--strict]          validate every committed summary (CI: tests/unit/bench-results.test.js);
//                                                          --strict also fails while a customer-facing figure has no fingerprint
//   node tests/bench/results.mjs manifest [--content]       round 12: write tests/bench/results/manifest.json — for every dataset
//                                                          folder the benches read: "present" with a file-list fingerprint
//                                                          (sha256 of sorted relpath + size; --content adds the full content hash)
//                                                          or "absent" = "not reproducible here: datasets absent"; per bench
//                                                          whether its figures can be re-run on this machine. The benches update
//                                                          it themselves when they find their dataset (lib.mjs needData)
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
  checkout: { datasets: [], cmd: "node tests/bench/checkout.bench.mjs --json out.json" },
  // Product Check advert wording (experimental): each locked advert set (now fresh-3) is scored ONCE by an independent agent and is never
  // committed or redistributed (owner licence decision); see docs/product-check/ADVERT-RESULTS.md
  // Gate plates on real public photos (51 Wikimedia Commons photos, labels v3 confirmed by the owner 2026-11-12); photos and
  // labels stay outside the repo (~/LENSIQ-field/plates-public/); see docs/GATE.md §3c and ACCURACY.md §15
  "plate-photos": { datasets: ["plates-public"], cmd: "node tools/plate-field-eval.mjs --dir ~/LENSIQ-field/plates-public/photos"
    + " --labels ~/LENSIQ-field/plates-public/photos/plates-photo-labels.v3.csv --source \"public dataset (Wikimedia Commons)\""
    + " --split dev|heldout --out out.json" },
  advert: { datasets: ["adverts-fresh-3"], cmd: "scored once by an independent agent on ~/LENSIQ-field/product-check/texts-fresh-3 (see docs/product-check/ADVERT-RESULTS.md)" }
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

/** round 12: cheap fingerprint of a folder's FILE LIST (sorted relpath + size, no file reads): detects a missing,
    extra or truncated file in seconds even for multi-GB datasets; hashDir() is the full content fingerprint */
export function hashList(dir) {
  const rows = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith(".")) continue; const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.isFile()) rows.push([relative(dir, p).split(sep).join("/"), statSync(p).size]); } };
  walk(dir);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const h = createHash("sha256"); let bytes = 0;
  for (const [r, n] of rows) { bytes += n; h.update(`${r}\t${n}\n`); }
  return { listSha256: h.digest("hex"), files: rows.length, bytes };
}
/** which bench produced each customer-facing figure (docs/accuracy-figures.json key prefix) */
export const FIGURE_BENCH = Object.freeze([
  [/^store/, "people"], [/^(lfw|casia|stranger|autoStr|confirmShare|minEnrol)/, "face1n"], [/^boothTar/, "face"], [/^ag/, "face"],
  [/^hand/, "hand"], [/^dr(FrameCatch|EarCatch|FallbackCatch)$/, "driver"], [/^dr/, "driver-session"], [/^qc/, "qc"], [/^bc/, "checkout"], [/^neuro/, "neuro"], [/^ad[A-Z]/, "advert"],
  [/^gate[A-Z]/, "plate-photos"]
]);
export const benchOfFigure = k => (FIGURE_BENCH.find(([re]) => re.test(k)) || [])[1] || null;
export const ABSENT = "not reproducible here: datasets absent";
/** manifest of the dataset folders under data (pure apart from reading the folders) */
export function buildManifest(data, { content = false, now = new Date() } = {}) {
  const all = [...new Set(Object.values(BENCHES).flatMap(b => b.datasets))].sort();
  const datasets = {};
  for (const n of all) {
    const p = data && join(data, n);
    if (p && existsSync(p) && statSync(p).isDirectory()) {
      const l = hashList(p);
      datasets[n] = { status: "present", sha256: content ? hashDir(p).sha256 : null, ...l, checkedAt: now.toISOString(), ...(content ? {} : { note: "file-list fingerprint only (listSha256); run `results.mjs manifest --content` for the content hash" }) };
    } else datasets[n] = { status: "absent", sha256: null, note: `${ABSENT} (${data ? "no folder " + n + " under $LQ_BENCH_DATA" : "LQ_BENCH_DATA not set"}) — python3 -I tests/bench/fetch_datasets.py ~/lq-bench-data` };
  }
  const benches = Object.fromEntries(Object.entries(BENCHES).map(([b, B]) => {
    const miss = B.datasets.filter(n => datasets[n].status !== "present");
    return [b, { datasets: B.datasets, reproducibleHere: !miss.length, status: miss.length ? `${ABSENT}: ${miss.join(", ")}` : "reproducible here", reproduce: B.cmd }];
  }));
  return { format: "lensiq-bench-summary", bench: "manifest", checkedAt: now.toISOString(), commit: git("rev-parse", "--short", "HEAD"),
    machine: { platform: platform(), arch: arch(), node: process.version },
    reproduce: "node tests/bench/results.mjs manifest [--content]  (LQ_BENCH_DATA=~/lq-bench-data)", datasets, benches };
}
/** update one dataset entry of the committed manifest (called by the benches when they find their data) */
export function noteDataset(data, name) {
  try {
    const f = join(OUT, "manifest.json"), m = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : buildManifest("");
    const p = join(data, name); if (!existsSync(p)) return null;
    m.datasets[name] = { status: "present", sha256: (m.datasets[name] && m.datasets[name].listSha256 === hashList(p).listSha256 && m.datasets[name].sha256) || null, ...hashList(p), checkedAt: new Date().toISOString(), note: "file-list fingerprint written by the bench run" };
    for (const [b, B] of Object.entries(m.benches || {})) { const miss = B.datasets.filter(n => !m.datasets[n] || m.datasets[n].status !== "present"); B.reproducibleHere = !miss.length; B.status = miss.length ? `${ABSENT}: ${miss.join(", ")}` : "reproducible here"; m.benches[b] = B; }
    m.checkedAt = new Date().toISOString();
    mkdirSync(OUT, { recursive: true }); writeFileSync(f, JSON.stringify(m, null, 1) + "\n");
    return m.datasets[name];
  } catch (e) { console.warn("manifest:", e.message); return null; }
}
/** strict: customer-facing figures whose bench has a dataset without a content fingerprint -> ["figure (bench: dataset)"] */
export function unfingerprinted(headlinesDoc) {
  const out = [];
  for (const k of Object.keys(headlinesDoc.figures || {})) {
    const b = benchOfFigure(k), B = b && BENCHES[b]; if (!B) continue;
    for (const n of B.datasets) { const d = headlinesDoc.datasets && headlinesDoc.datasets[n]; if (!d || !d.sha256) out.push(`${k} (${b}: ${n})`); }
  }
  return out;
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
  let man = null; try { man = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8")); } catch { /* no manifest yet */ }
  const here = k => man && man.datasets && man.datasets[k] ? man.datasets[k].status : "absent";
  const datasets = Object.fromEntries(all.map(k => [k, recorded[k] ? { ...recorded[k], status: "recorded" } : { sha256: null, status: here(k) === "present" ? "not recorded: dataset present here — re-run the bench and `results.mjs record`" : ABSENT,
    note: "not recorded: the round 3–6 runs that produced these figures predate fingerprinting; re-run the bench and `results.mjs record` to fill it" }]));
  const reproducible = b => !!b && BENCHES[b] && BENCHES[b].datasets.every(n => datasets[n] && datasets[n].sha256);
  return {
    format: "lensiq-bench-summary", bench: "headlines", round: fig.round, source: "docs/accuracy-figures.json (transcribed from ACCURACY.md)",
    reproduce: "see BENCHES in tests/bench/results.mjs — one command per bench; datasets via python3 -I tests/bench/fetch_datasets.py ~/lq-bench-data",
    datasets,
    figures: Object.fromEntries(Object.entries(fig.figures).map(([k, v]) => { const b = benchOfFigure(k); return [k, { value: v.value, raw: v.raw ?? null, what: v.what, evidence: v.md, bench: b,
      fingerprinted: reproducible(b), status: reproducible(b) ? "fingerprinted" : b && BENCHES[b].datasets.length ? `${ABSENT} or not fingerprinted (${BENCHES[b].datasets.join(", ")})` : "synthetic bench (no dataset)" }]; }))
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
  } else if (cmd === "manifest") {
    mkdirSync(OUT, { recursive: true });
    const m = buildManifest(DATA, { content: rest.includes("--content") });
    writeFileSync(join(OUT, "manifest.json"), JSON.stringify(m, null, 1) + "\n");
    writeFileSync(join(OUT, "headlines.json"), JSON.stringify(headlines(), null, 1) + "\n");
    for (const [b, B] of Object.entries(m.benches)) console.log(`${b.padEnd(15)} ${B.status}`);
    console.log("wrote tests/bench/results/manifest.json");
  } else if (cmd === "--check") {
    const errs = [];
    if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (f.endsWith(".json")) errs.push(...validate(JSON.parse(readFileSync(join(OUT, f), "utf8")), f));
    if (rest.includes("--strict")) { const u = unfingerprinted(JSON.parse(readFileSync(join(OUT, "headlines.json"), "utf8"))); if (u.length) errs.push(`--strict: ${u.length} customer-facing figure/dataset pair(s) without a fingerprint:\n  ` + u.join("\n  ")); }
    if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
    console.log("bench summaries OK");
  } else {
    console.error("usage: results.mjs hash | record <bench> <file> | headlines | manifest [--content] | --check [--strict]"); process.exit(2);
  }
}
