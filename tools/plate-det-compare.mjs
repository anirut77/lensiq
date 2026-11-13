#!/usr/bin/env node
// tools/plate-det-compare.mjs — the trained Thai plate detector (tools/plate_train.py) against the SHIPPED detector
// (classical finder + LPD-YuNet + plate-likeness guard) on the LOCKED field test split (tools/plate-train-prep.mjs export:
// dataset/test2017 + its plates-photo-labels.csv). Runs tools/plate-field-eval.mjs twice on the same photos (shipped, then
// shipped + the trained model as an extra proposal source) and applies RULE, fixed before any training (locked in
// tests/unit/plate-train-prep.test.js; hash in evals-locks/gate-hall-h.sha256). Source label of every number:
// "field (owner photos, locked test split)". Nothing leaves the machine; --out must be outside the repo.
//
//   node tools/plate-det-compare.mjs --model RUN/plate_yolox_nano_416.onnx [--root ~/LENSIQ-field/plates-train] [--out FILE.json]
//
// Also worth running (report only, no decision): the 51-photo public Wikimedia set, held-out half:
//   node tools/plate-field-eval.mjs --dir ~/LENSIQ-field/plates-public/photos --labels …/plates-photo-labels.v3.csv --split heldout --det-model …
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RULE = Object.freeze({ version: "plate-compare-v1", minPlatePhotos: 60, minNonePhotos: 15, maxExtraMs: 600 });
export const SOURCE = "field (owner photos, locked test split)";
/** review S4: the dataset being compared must be the one whose split was locked (rule + sha256 in the lock file) */
export function checkManifest(root, lockFile) {
  const man = JSON.parse(readFileSync(join(root, "dataset", "MANIFEST.json"), "utf8"));
  const lock = existsSync(lockFile) ? readFileSync(lockFile, "utf8") : "";
  const line = lock.split("\n").find(l => l.startsWith(man.rule + " "));
  if (!line) throw new Error(`the split ${man.rule} of this dataset is not locked (${lockFile}): run plate-train-prep split first`);
  if (line.split(" ")[1].trim() !== man.sha256) throw new Error(`dataset/MANIFEST.json (${String(man.sha256).slice(0, 12)}…) does not match the locked split `
    + `(${line.split(" ")[1].slice(0, 12)}…): export again from the locked split`);
  return true;
}
/** owner rule 2026-11-13: a plate type with fewer test photos than this is UNMEASURED (no claim for that type) */
export const TYPE_MIN = 20;

const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** a plate-field-eval run -> the numbers the rule reads (shipped path = "after") */
export function fromRun(run) {
  const A = run.summary["all plates"] || { photos: 0, det: { x: 0 }, after: { exact: { x: 0 }, false: 0, wrong: 0 }, tapsNeeded: { x: 0 } };
  const N = run.summary.none || { photos: 0, after: { false: 0 } };
  return { platePhotos: A.photos, nonePhotos: N.photos, det: A.det ? A.det.x : 0, exact: A.after.exact ? A.after.exact.x : 0,
    falseNone: N.after.false, falsePlate: A.after.false, wrong: A.after.wrong, taps: A.tapsNeeded ? A.tapsNeeded.x : 0,
    msMedian: median((run.results || []).map(r => r.ms)) };
}
/** per plate type (shipped vs shipped + model): det / exact / taps, and UNMEASURED below TYPE_MIN test photos */
export function perType(baseRun, candRun) {
  const skip = new Set(["all plates", "none"]);
  return Object.keys(baseRun.summary).filter(k => !skip.has(k)).map(cat => {
    const b = baseRun.summary[cat], c = (candRun.summary || {})[cat] || b, n = b.photos;
    const pick = s => ({ det: s.det ? s.det.x : 0, exact: s.after && s.after.exact ? s.after.exact.x : 0, taps: s.tapsNeeded ? s.tapsNeeded.x : 0 });
    const measured = n >= TYPE_MIN;
    return { cat, n, measured, base: pick(b), cand: pick(c), note: measured ? "" : `UNMEASURED (n = ${n} < ${TYPE_MIN}): no claim for this type` };
  });
}
export function formatTypes(rows) {
  return ["| Type | Test photos | Plate is the top box (shipped → +model) | Exact auto reads | Taps needed |", "|---|---|---|---|---|",
    ...rows.map(r => (r.measured
      ? `| ${r.cat} | ${r.n} | ${r.base.det} → ${r.cand.det} | ${r.base.exact} → ${r.cand.exact} | ${r.base.taps} → ${r.cand.taps} |`
      : `| ${r.cat} | ${r.n} | ${r.note} | — | — |`))].join("\n");
}
/** adopt = true only if every rule holds; null when the split is too small to decide or the set is a dev batch */
export function decide(base, cand, o = {}) {
  const rules = [
    ["detection (plate is the top box) strictly better", cand.det > base.det],
    ["exact automatic reads not lower", cand.exact >= base.exact],
    ["false auto-reads on plate-less photos not higher", cand.falseNone <= base.falseNone],
    ["false auto-reads on plate photos not higher", cand.falsePlate <= base.falsePlate],
    ["wrong-text auto-reads not higher", cand.wrong <= base.wrong],
    ["taps needed not higher", cand.taps <= base.taps],
    [`median time per photo at most +${RULE.maxExtraMs} ms`, cand.msMedian != null && base.msMedian != null && cand.msMedian <= base.msMedian + RULE.maxExtraMs]
  ].map(([rule, pass]) => ({ rule, pass }));
  if (o.devBatch) return { adopt: null, rules, note: "dev batch (first factory batch): pipeline check and dev numbers only, no adoption decision" };
  if (base.platePhotos < RULE.minPlatePhotos || base.nonePhotos < RULE.minNonePhotos)
    return { adopt: null, rules, note: `not enough photos in the locked test split `
      + `(${base.platePhotos} with a plate, ${base.nonePhotos} without; need ${RULE.minPlatePhotos} / ${RULE.minNonePhotos}): `
      + "no decision" };
  return { adopt: rules.every(r => r.pass), rules, note: "" };
}
export function format(base, cand, d) {
  const row = (k, l) => `| ${l} | ${base[k]} | ${cand[k]} |`;
  return [`Source: ${SOURCE}. Rule ${RULE.version}.`, "", "| Measure | Shipped | Shipped + trained model |", "|---|---|---|",
    row("platePhotos", "photos with a plate"), row("nonePhotos", "photos without a plate"), row("det", "plate is the top box"), row("exact", "exact automatic reads"),
    row("falseNone", "false auto-reads, plate-less photos"), row("falsePlate", "false auto-reads, plate photos"), row("wrong", "wrong-text auto-reads"),
    row("taps", "taps needed"), row("msMedian", "median ms per photo (this machine)"), "",
    ...d.rules.map(r => `- ${r.pass ? "pass" : "FAIL"}: ${r.rule}`), "",
    d.adopt == null ? `Decision: ${d.note}` : d.adopt ? "Decision: ADOPT as an extra proposal source (owner confirms; licence + model card first)" : "Decision: keep the shipped detector"].join("\n");
}

async function main(argv) {
  const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const model = get("--model"), root = resolve(get("--root", join(homedir(), "LENSIQ-field", "plates-train"))), out = get("--out");
  if (!model) { console.error("usage: node tools/plate-det-compare.mjs --model FILE.onnx [--root DIR] [--out FILE.json]"); return 2; }
  if (out) { const r = relative(repo, resolve(out)); if (r === "" || (!r.startsWith("..") && !isAbsolute(r))) { console.error("--out must be outside the repo"); return 2; } }
  const E = await import(pathToFileURL(join(repo, "tools", "plate-field-eval.mjs")).href);
  const dir = join(root, "dataset", "test2017");
  const args = ["--dir", dir, "--source", SOURCE, "--synthetic", "0"];
  try {
    checkManifest(root, get("--lock", join(homedir(), "LENSIQ-field", "evals", "plate-train", "locked.sha256")));
    const base = await E.run(E.parseArgs(args));
    const cand = await E.run(E.parseArgs([...args, "--det-model", model]));
    let devBatch = false;
    try { devBatch = !!JSON.parse(readFileSync(join(root, "dataset", "MANIFEST.json"), "utf8")).devBatch; } catch { /* no manifest: not a dev batch */ }
    const b = fromRun(base), c = fromRun(cand), d = decide(b, c, { devBatch }), types = perType(base, cand);
    console.log(format(b, c, d));
    console.log("\nPer plate type (types under " + TYPE_MIN + " test photos are UNMEASURED: no claim):\n" + formatTypes(types));
    if (out) writeFileSync(out, JSON.stringify({ rule: RULE.version, source: SOURCE, base: b, cand: c, decision: d, types, devBatch, runs: { base, cand } }, null, 1));
    return 0;
  } catch (e) { console.error("plate-det-compare:", e && e.message || e); return 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
