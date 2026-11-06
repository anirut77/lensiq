#!/usr/bin/env node
// tests/bench/hand.bench.mjs — hand detection accuracy of LQHand (tfjs MediaPipe-Hands lite: palm detector + landmarks,
// TF.js WASM) on a HaGRID subset: $LQ_BENCH_DATA/hagrid/index.json + the images it lists (40 random images per gesture,
// seed 42, from the 384p HaGRID sample). Ground truth = every annotated hand box (gesture and "no_gesture" hands).
//   LQ_BENCH_DATA=/path/to/data node tests/bench/hand.bench.mjs [--json out.json]
// A detection matches a hand when IoU >= 0.3 (LQHand boxes are landmark extents, tighter than HaGRID's hand boxes) —
// IoU >= 0.5 is reported too.
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE, DATA, needData, openBench, pct, table } from "./lib.mjs";

const require = createRequire(import.meta.url);
const M = require("./metrics.cjs");
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
needData("hagrid/index.json", "hand benchmark");
const idx = JSON.parse(readFileSync(join(DATA, "hagrid/index.json"), "utf8")).filter(r => existsSync(join(DATA, "hagrid", r.f)));
const file = join(CACHE, `hagrid-hands-${idx.length}.json`);
let res;
if (existsSync(file)) res = JSON.parse(readFileSync(file, "utf8"));
else {
  const b = await openBench(); res = [];
  try {
    for (let i = 0; i < idx.length; i += 20) {
      res.push(...await b.page.evaluate(`LQB.hands(${JSON.stringify(idx.slice(i, i + 20).map(r => "/__data/hagrid/" + r.f))}, { quick: true, max: 3 })`));
      process.stderr.write(`\r  hands: ${res.length}/${idx.length}`);
    }
  } finally { await b.done(); }
  process.stderr.write("\n"); writeFileSync(file, JSON.stringify(res));
}
const out = { images: idx.length };
const rows = [];
for (const thr of [0.3, 0.5]) {
  const frames = idx.map((r, i) => ({ gt: r.boxes.map(b => ({ x: b[0], y: b[1], w: b[2], h: b[3] })), det: res[i].h.map(h => ({ x: h.b[0], y: h.b[1], w: h.b[2], h: h.b[3], score: h.s })) }));
  const e = M.detEval(frames, thr);
  // gesture hands only (the hand a kiosk user raises)
  const g = M.detEval(idx.map((r, i) => ({ gt: r.boxes.filter((_, k) => r.labels[k] !== "no_gesture").map(b => ({ x: b[0], y: b[1], w: b[2], h: b[3] })), ign: r.boxes.filter((_, k) => r.labels[k] === "no_gesture").map(b => ({ x: b[0], y: b[1], w: b[2], h: b[3] })), det: frames[i].det })), thr);
  out["iou" + thr] = { all: e, gesture: g };
  rows.push([thr, e.gt, pct(e.recall), pct(e.precision), g.gt, pct(g.recall), pct(g.precision)]);
}
console.log(`\n## Hand detection — HaGRID 384p subset (${idx.length} images, ${new Set(idx.map(r => r.gesture)).size} gestures), LQHand quick mode, WASM\n`);
console.log(table(["IoU", "all hands", "recall", "precision", "raised (gesture) hands", "recall", "precision"], rows));
const per = {};
idx.forEach((r, i) => {
  const gt = r.boxes.filter((_, k) => r.labels[k] !== "no_gesture").map(b => ({ x: b[0], y: b[1], w: b[2], h: b[3] }));
  const m = M.matchFrame(gt, res[i].h.map(h => ({ x: h.b[0], y: h.b[1], w: h.b[2], h: h.b[3] })), 0.3);
  const p = per[r.gesture] || (per[r.gesture] = { n: 0, hit: 0 }); p.n += gt.length; p.hit += m.pairs.length;
});
out.perGesture = per;
console.log("\nraised-hand recall per gesture (IoU ≥ 0.3):");
console.log(table(["gesture", "hands", "recall"], Object.entries(per).sort((a, b) => a[1].hit / a[1].n - b[1].hit / b[1].n).map(([g, p]) => [g, p.n, pct(p.hit / p.n, 0)])));
const ms = res.map(r => r.ms).sort((a, b) => a - b); out.ms = ms[ms.length >> 1];
console.log(`\nmedian ${out.ms} ms per image (palm detector + landmarks)`);
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(out, null, 1));
