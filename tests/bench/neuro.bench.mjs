#!/usr/bin/env node
// tests/bench/neuro.bench.mjs — facial-expression classifier of the neuro page (face-api faceExpressionNet) on FER-2013.
//
//   LQ_BENCH_DATA=/path/to/data node tests/bench/neuro.bench.mjs [--json out.json]
//
// Two measurements: (1) the page pipeline, neuro.js detectFaces(): TinyFaceDetector (320, 0.45) + landmarks +
// expressions on the 48×48 FER crop upscaled ×4 and centred on a grey 320 px canvas; (2) the classifier alone on the
// crop. Expression is what the face shows, not what the person feels. FER-2013: research use only, evaluation only.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE, needData, openBench, dataUrl, pct, table } from "./lib.mjs";

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const root = needData("fer", "neuro (FER-2013) benchmark");
const idx = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
const MAP = { angry: "angry", disgust: "disgusted", fear: "fearful", happy: "happy", neutral: "neutral", sad: "sad", surprise: "surprised" };
const EMO = ["neutral", "happy", "surprised", "sad", "angry", "fearful", "disgusted"]; // neuro.js order
const VAL = { happy: "+", surprised: "0", neutral: "0", sad: "−", angry: "−", fearful: "−", disgusted: "−" };          // sign of neuro.js valence

const file = join(CACHE, "neuro-fer.json");
let rows;
if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).length === idx.length) rows = JSON.parse(readFileSync(file, "utf8"));
else {
  const b = await openBench(); rows = [];
  try {
    for (let i = 0; i < idx.length; i += 20) {
      rows.push(...await b.page.evaluate(`LQB2.neuro(${JSON.stringify(idx.slice(i, i + 20).map(x => dataUrl(join("fer", x.f))))}, { scale: 4, padTo: 320 })`));
      process.stderr.write(`\r  FER: ${rows.length}/${idx.length}`);
    }
    process.stderr.write("\n");
  } finally { await b.done(); }
  writeFileSync(file, JSON.stringify(rows));
}
const argmax = p => EMO.reduce((a, k) => (p[k] || 0) > (p[a] || 0) ? k : a, EMO[0]);
function evaluate(get) {
  const conf = Object.fromEntries(EMO.map(k => [k, Object.fromEntries(EMO.map(j => [j, 0]))]));
  let n = 0, ok = 0, vok = 0;
  rows.forEach((r, i) => { const p = get(r); if (!p) return; const t = MAP[idx[i].label], y = argmax(p); conf[t][y]++; n++; if (t === y) ok++; if (VAL[t] === VAL[y]) vok++; });
  const recall = Object.fromEntries(EMO.map(k => { const s = EMO.reduce((a, j) => a + conf[k][j], 0); return [k, s ? conf[k][k] / s : NaN]; }));
  return { n, acc: ok / n, valenceSignAcc: vok / n, recall, conf, macro: EMO.reduce((a, k) => a + recall[k], 0) / EMO.length };
}
const pipe = evaluate(r => r.pipe), cls = evaluate(r => r.cls);
const found = rows.filter(r => r.n > 0).length / rows.length;
console.log(`\n## Neuro — facial expression (face-api faceExpressionNet) on FER-2013 PrivateTest sample, ${idx.length} faces (100 per class)\n`);
console.log(table(["", "faces used", "accuracy (7 classes)", "macro recall", "valence sign (+ / 0 / −) correct", ...EMO], [
  [`page pipeline (face found ${pct(found)})`, pipe.n, pct(pipe.acc), pct(pipe.macro), pct(pipe.valenceSignAcc), ...EMO.map(k => pct(pipe.recall[k], 0))],
  ["classifier alone on the crop", cls.n, pct(cls.acc), pct(cls.macro), pct(cls.valenceSignAcc), ...EMO.map(k => pct(cls.recall[k], 0))]]));
console.log("\nconfusion (classifier alone; rows = FER label, columns = predicted)\n");
console.log(table(["true \\ pred", ...EMO], EMO.map(k => [k, ...EMO.map(j => cls.conf[k][j])])));
if (opt("--json")) { writeFileSync(opt("--json"), JSON.stringify({ date: new Date().toISOString(), found, pipe, cls }, null, 1)); console.log("wrote " + opt("--json")); }
