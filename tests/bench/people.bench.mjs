#!/usr/bin/env node
// tests/bench/people.bench.mjs — people detection / tracking / line-counting accuracy of the store pipeline on public
// MOTChallenge footage with ground truth (MOT17 train, 2DMOT2015 train: PETS09-S2L1, TUD-Stadtmitte, ...).
//
//   LQ_BENCH_DATA=/path/to/data node tests/bench/people.bench.mjs [--sweep] [--seq NAME] [--json out.json]
//   tuning aids: [--fps 5] [--why] (classify misses / false counts) [--occlude P] [--score-k K] [--drop P] (stress, tuning set only)
//
// Data layout: $LQ_BENCH_DATA/mot/**/<SEQ>/{img1/*.jpg, gt/gt.txt[, seqinfo.ini]} (any subset of frames may be present;
// tests/bench/fetch_datasets.py downloads every 3rd MOT17 frame = 10 fps, the rate the store page actually analyses).
// Browser side (headless Chrome, WASM, no WebGL) = LQDetect.detectPeople (YOLOX-Nano on ORT, or COCO-SSD on TF.js) + LQDetect.embedBox.
// Node side = store.js stepCam() (LQTrack tracker, line crossing, re-ID "ลดการนับซ้ำ") on those detections, unchanged.
// Detections are cached per sequence/detW in $LQ_BENCH_CACHE; delete the cache after changing the detector.
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { CACHE, DATA, REPO, needData, openBench, dataUrl, pct, table } from "./lib.mjs";

const require = createRequire(import.meta.url);
const M = require("./metrics.cjs");
const ST = require(join(REPO, "store.js"));
const LQT = require(join(REPO, "lensiq-track.js"));

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const root = needData("mot", "people benchmark");
// --frame-drop P: each analysed frame is skipped with probability P (seeded) — a slow device / busy tab; time stays real
// --health: record the page's camera-health statistics per frame and report which health flags would have been shown
const FDROP = +opt("--frame-drop", 0) || 0, HEALTH = flag("--health") || !!opt("--degrade", "");

// ---------- sequences ----------
const KNOWN = { "PETS09-S2L1": { fps: 7, W: 768, H: 576 }, "TUD-Stadtmitte": { fps: 25, W: 640, H: 480 }, "TUD-Campus": { fps: 25, W: 640, H: 480 } };
function findSeqs(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (!statSync(p).isDirectory() || n.startsWith(".")) continue;
    if (existsSync(join(p, "gt", "gt.txt")) && existsSync(join(p, "img1"))) out.push(p); else findSeqs(p, out);
  }
  return out;
}
function seqInfo(p) {
  const name = basename(p).replace(/-(FRCNN|DPM|SDP)$/, "");
  const info = { name, ...(KNOWN[name] || {}) };
  const ini = join(p, "seqinfo.ini");
  if (existsSync(ini)) {
    const t = readFileSync(ini, "utf8"), g = k => { const m = t.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? +m[1] : undefined; };
    info.fps = g("frameRate"); info.W = g("imWidth"); info.H = g("imHeight");
  }
  if (!info.fps || !info.W) throw new Error("unknown fps/size for " + p);
  const step0 = Math.max(1, Math.round(info.fps / 10)); // detections are computed at ~10 frames/s (cached)
  const all = readdirSync(join(p, "img1")).filter(f => /^\d+\.jpg$/.test(f)).map(f => +f.slice(0, -4)).filter(f => (f - 1) % step0 === 0).sort((a, b) => a - b);
  // --fps N: analyse fewer frames per second (e.g. tiling is slower on WASM) — every k-th of the 10 fps frames
  const k = Math.max(1, Math.round(info.fps / step0 / (+opt("--fps", 0) || info.fps / step0)));
  const step = step0 * k, gtFrames = all.filter((_, i) => i % k === 0), frames = gtFrames.filter(f => !FDROP || hash01(f, 4242) >= FDROP);
  // ground truth: MOT16/17/20 = frame,id,x,y,w,h,consider,class,visibility ; 2DMOT2015 = frame,id,x,y,w,h,consider,wx,wy,wz
  const gt = new Map(), ign = new Map(), mot16 = /^MOT(16|17|20)-/.test(basename(p));
  for (const line of readFileSync(join(p, "gt", "gt.txt"), "utf8").split(/\r?\n/)) {
    const v = line.split(",").map(Number); if (v.length < 6 || !Number.isFinite(v[0])) continue;
    const [f, id, x, y, w, h, cons = 1] = v, cls = mot16 ? v[7] : -1, vis = mot16 ? v[8] : 1;
    const box = { id, x: x / info.W, y: y / info.H, w: w / info.W, h: h / info.H, vis };
    const target = cls === -1 ? cons !== 0 : cls === 1 && cons === 1;
    const ignore = !target && [2, 7, 8, 12].includes(cls);
    const m = target ? gt : ignore ? ign : null; if (!m) continue;
    if (!m.has(f)) m.set(f, []); m.get(f).push(box);
  }
  return { ...info, path: p, step, all, frames, gtFrames, gt, ign, dt: 1000 * step / info.fps };
}

// ---------- detections (cached) ----------
// --tiles 2x2 (or LQ_BENCH_TILES) = the store page's "far/small people" mode: LQDetect tiling for the main detW=416 pass
const TILES = (() => { const t = opt("--tiles", process.env.LQ_BENCH_TILES || ""); const m = /^(\d)x(\d)$/.exec(t); return m ? { cols: +m[1], rows: +m[2], overlap: 0.2 } : null; })();
// --model yolox_nano_416 (default = the store page's detector, vendor/models/yolox/*.onnx on ORT WASM) | coco (COCO-SSD,
// the fallback) | yolox_tiny_416 (evaluated, not vendored: put the official yolox_tiny.onnx 0.1.1rc0 release there first)
// --split auto: wide (16:9) frames as 2 overlapping square halves (LQDetect.detectYolox split:'auto')
const MODEL = opt("--model", process.env.LQ_BENCH_MODEL || "yolox_nano_416"), SPLIT = opt("--split", process.env.LQ_BENCH_SPLIT || "") || null;
// --degrade dark:0.1 | back:0.5 | blur:3 | shake:0.03 (robustness, lensiq-sitecheck camera health): the frame is degraded in
// the browser before detection (tests/bench/bench-page.js degrade()), and the page's health statistics are recorded per frame
const DEGRADE = opt("--degrade", "") || null;
async function detections(B, s, detW, embMin) {
  const tiles = detW === 416 ? TILES : null;
  const file = join(CACHE, `people-${s.name}-w${detW}${MODEL !== "coco" ? "-" + MODEL : ""}${SPLIT ? "-split" + SPLIT : ""}${tiles ? `-t${tiles.cols}x${tiles.rows}` : ""}${embMin ? "-emb" : ""}${DEGRADE ? "-deg-" + DEGRADE.replace(/[^\w.]/g, "_") : ""}.json`);
  const pick = c => ({ ...c, frames: s.frames.map(f => c.frames[s.all.indexOf(f)]) });
  if (existsSync(file)) { const c = JSON.parse(readFileSync(file, "utf8")); if (c.frames.length === s.all.length) return pick(c); }
  const b = await B();
  const rows = [], t0 = Date.now();
  for (let i = 0; i < s.all.length; i += 16) {
    const urls = s.all.slice(i, i + 16).map(f => dataUrl(relative(DATA, join(s.path, "img1", String(f).padStart(6, "0") + ".jpg"))));
    rows.push(...await b.page.evaluate(`LQB.healthAlways = ${!!HEALTH}; LQB.people(${JSON.stringify(urls)}, ${JSON.stringify({ detW, minScore: 0.05, max: 100, embMin, tiles, model: MODEL, split: SPLIT, degrade: DEGRADE, seeds: s.all.slice(i, i + 16) })})`));
    process.stderr.write(`\r  ${s.name} detW=${detW}${embMin ? " +emb" : ""}: ${rows.length}/${s.all.length} frames (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  process.stderr.write("\n");
  const c = { seq: s.name, detW, embMin, backend: b.backend, frames: rows };
  writeFileSync(file, JSON.stringify(c));
  return pick(c);
}
const decodeEmb = b64 => { const u = Buffer.from(b64, "base64"); return new Float32Array(u.buffer, u.byteOffset, u.byteLength / 4); };

// ---------- evaluation ----------
// five virtual counting lines per sequence (3 vertical, 2 horizontal), each evaluated as its own "door" camera
const hl = y => ({ a: { x: 0.02, y }, b: { x: 0.98, y } }), vl = x => ({ a: { x, y: 0.02 }, b: { x, y: 0.98 } });
const LINES = { V30: vl(0.3), V50: vl(0.5), V70: vl(0.7), H40: hl(0.4), H60: hl(0.6) };
LINES.H = LINES.V50;
// --drop P (stress test, tuning only): each detection is dropped with probability P (seeded, same for every config) —
// simulates the missed detections / occlusion gaps of crowded scenes on the easy tuning sequences
const DROP = +opt("--drop", 0) || 0;
// --occlude P (stress, tuning only): each ground-truth person disappears from the detections for whole 1-s blocks with
// probability P per block (an occlusion gap, the MOT17 failure mode) · --score-k K: all scores × K (far/small people
// score lower, so births from confident boxes only become rarer)
const OCC = +opt("--occlude", 0) || 0, SCORE_K = +opt("--score-k", 1) || 1;
const hash01 = (...v) => { let h = 2166136261; for (const x of v) { h = Math.imul(h ^ (x | 0), 16777619); h ^= h >>> 13; } h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 16; return (h >>> 0) / 4294967296; };
function stress(s, f, now, dets) {
  if (!OCC) return dets;
  const blk = Math.floor((now - 1e9) / 1000), drop = (s.gt.get(f) || []).filter(g => hash01(g.id, blk, 99) < OCC);
  return dets.filter(d => !drop.some(g => M.iou(g, d) >= 0.4));
}
const keepDet = (fi, k) => { let h = Math.imul(fi * 7919 + k * 104729 + 12345, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296 >= DROP; };
const toDets = (row, thr, fi = 0) => row.d.map((d, k) => ({ x: d[0], y: d[1], w: d[2], h: d[3], score: d[4], k })).filter(d => d.score >= thr && (!DROP || keepDet(fi, d.k)));

function detMetrics(s, cache, thr) {
  return M.detEval(s.frames.map((f, i) => ({ gt: s.gt.get(f) || [], ign: s.ign.get(f) || [], det: toDets(cache.frames[i], thr) })), 0.5);
}
function recallBySize(s, cache, thr) {
  const buckets = [[0, 0.1], [0.1, 0.2], [0.2, 0.35], [0.35, 2]], hit = buckets.map(() => 0), tot = buckets.map(() => 0);
  s.frames.forEach((f, i) => {
    const gt = (s.gt.get(f) || []).filter(g => g.vis == null || g.vis >= 0.5);
    const m = M.matchFrame(gt, toDets(cache.frames[i], thr), 0.5), got = new Set(m.pairs.map(p => p[0]));
    gt.forEach((g, gi) => { const b = buckets.findIndex(([a, z]) => g.h >= a && g.h < z); tot[b]++; if (got.has(gi)) hit[b]++; });
  });
  return buckets.map((b, i) => ({ range: b, n: tot[i], recall: tot[i] ? hit[i] / tot[i] : NaN }));
}

/* run store.stepCam over the sequence; returns tracking frames + crossing events for one line */
function runPipeline(s, cache, { thr, tcfgBase = ST.ST_TRACK || LQT.PRESET.person, reid = false, reidCfg = {}, line }) {
  const pipe = ST.newPipe(), day = ST.newDay("2000-01-01");
  const tcfg = LQT.trackerCfgFor(tcfgBase, s.dt);
  const cam = { slot: "c1", name: "bench", role: "door", line, swap: false, zones: [] };
  const frames = [], ev = [];
  s.frames.forEach((f, i) => {
    const now = 1e9 + (f - s.frames[0]) / s.step * s.dt, row = cache.frames[i];
    const dets = stress(s, f, now, toDets(row.d && SCORE_K !== 1 ? { ...row, d: row.d.map(d => [d[0], d[1], d[2], d[3], d[4] * SCORE_K]) } : row, thr, f));
    let embed;
    if (reid) {
      const byKey = new Map(dets.map(d => [`${d.x},${d.y},${d.w},${d.h}`, d]));
      embed = box => { const d = byKey.get(`${box.x},${box.y},${box.w},${box.h}`); const e = d && row.e && row.e[d.k]; return e ? decodeEmb(e) : null; };
    }
    const r = ST.stepCam(pipe, cam, day, dets, now, tcfg, reid ? { reid: true, embed, reidCfg } : {});
    frames.push({ gt: s.gt.get(f) || [], ign: s.ign.get(f) || [], hyp: r.conf.map(t => ({ id: t.cid ?? t.id, ...t.box })) });
    for (const c of r.crossings) {
      const t = r.conf.find(x => (x.cid ?? x.id) === c.id);
      const b = c.box || (t && t.box);
      ev.push({ id: c.id, t: now, dir: c.dir, pos: b ? M.projectOnLine(line, LQT.center(b)) : 0.5 });
    }
  });
  return { frames, ev, dedup: pipe.reid ? pipe.reid.stats : null };
}
function gtEvents(s, line) {
  const tracks = new Map();
  s.gtFrames.forEach(f => { // ground truth from every analysed frame, also when --frame-drop skips some
    for (const g of s.gt.get(f) || []) { if (!tracks.has(g.id)) tracks.set(g.id, []); tracks.get(g.id).push({ t: 1e9 + (f - s.gtFrames[0]) / s.step * s.dt, p: LQT.center(g) }); }
  });
  return M.crossingsFromTracks(tracks, line, (mem, ln, p, sw) => ST.checkCrossing(mem, ln, p, sw));
}

// --why (diagnostic): classify each missed ground-truth crossing — the GT person was not tracked around the crossing
// ("no track"), the track id changed between the two sides ("id break"), or one id crossed but nothing was counted
// ("not counted"); and each false count — no GT crossing by the person under that track ("no GT crossing")
const WHY = flag("--why") ? {} : null;
function whyMissed(s, frames, gtEv, prEv, acc) {
  const used = new Set(), bump = k => { acc[k] = (acc[k] || 0) + 1; };
  const t0 = 1e9, hypOf = (i, gid) => {
    const gb = frames[i].gt.find(b => b.id === gid); if (!gb) return undefined;
    let best = null, bi = 0.3; for (const h of frames[i].hyp) { const v = M.iou(gb, h); if (v >= bi) { bi = v; best = h.id; } }
    return best;
  };
  for (const g of gtEv) {
    const k = prEv.findIndex((p, j) => !used.has(j) && p.dir === g.dir && Math.abs(p.t - g.t) <= 1500 && Math.abs(p.pos - g.pos) <= 0.15);
    if (k >= 0) { used.add(k); continue; }
    const fi = Math.round((g.t - t0) / s.dt), win = [];
    for (let i = Math.max(0, fi - 8); i <= Math.min(frames.length - 1, fi + 8); i++) win.push([i, hypOf(i, g.id)]);
    const present = win.filter(([, h]) => h !== undefined), got = present.filter(([, h]) => h != null);
    if (got.length < 0.5 * present.length) { bump(s.name + " miss: no track"); continue; }
    const before = new Set(got.filter(([i]) => i < fi).map(([, h]) => h)), after = new Set(got.filter(([i]) => i >= fi).map(([, h]) => h));
    const why = [...after].some(h => before.has(h)) ? " miss: not counted (same id)" : " miss: id break";
    bump(s.name + why);
    if (process.env.LQ_BENCH_WHY_TRACE) console.log("  ", s.name, why, g.dir, "t", fi, "pos", g.pos.toFixed(2), win.map(([i, h]) => `${i}:${h === undefined ? "-" : h ?? "x"}`).join(" "),
      "| hyp centres", win.map(([i, h]) => { const b = frames[i].hyp.find(q => q.id === h); return b ? `${(b.x + b.w / 2).toFixed(3)},${(b.y + b.h / 2).toFixed(3)}` : "."; }).join(" "));
  }
  prEv.forEach((p, j) => { if (!used.has(j)) bump(s.name + " false: " + (gtEv.some(g => Math.abs(g.t - p.t) <= 1500 && Math.abs(g.pos - p.pos) <= 0.15) ? "dir/timing" : "no GT crossing")); });
}
function evalConfig(seqs, caches, cfg) {
  const per = [];
  for (const s of seqs) {
    const c = caches.get(s.name);
    const base = runPipeline(s, c, { ...cfg, line: LINES.H });
    const mot = M.clearMot(base.frames), id = M.idf1(base.frames);
    let gtIn = 0, gtOut = 0, prIn = 0, prOut = 0, tp = 0, fp = 0, fn = 0;
    for (const [k, L] of Object.entries(LINES)) { if (k === "H") continue;
      const r = L === LINES.H ? base : runPipeline(s, c, { ...cfg, line: L });
      const g = gtEvents(s, L), ce = M.countError(g, r.ev), me = M.matchEvents(g, r.ev, { dt: 1500, dpos: 0.15 });
      if (WHY) whyMissed(s, r.frames, g, r.ev, WHY);
      gtIn += ce.gtIn; gtOut += ce.gtOut; prIn += ce.prIn; prOut += ce.prOut; tp += me.tp; fp += me.fp; fn += me.fn;
    }
    per.push({ seq: s.name, mota: mot.mota, idf1: id.idf1, idsw: mot.idsw, fp: mot.fp, fn: mot.fn, gt: mot.gt, gtCross: gtIn + gtOut, prCross: prIn + prOut,
      countErr: (prIn + prOut - gtIn - gtOut) / Math.max(1, gtIn + gtOut), absErrIn: Math.abs(prIn - gtIn), absErrOut: Math.abs(prOut - gtOut),
      evP: tp / Math.max(1, tp + fp), evR: tp / Math.max(1, tp + fn), dedup: base.dedup });
  }
  const sum = k => per.reduce((a, r) => a + r[k], 0);
  const gtC = sum("gtCross"), prC = sum("prCross");
  // pooled MOTA over all GT boxes; event precision/recall pooled over all lines
  const tp = per.reduce((a, r) => a + r.evR * r.gtCross, 0);
  return { per, pooled: { mota: 1 - (sum("fp") + sum("fn") + sum("idsw")) / sum("gt"), idsw: sum("idsw"), gtCross: gtC, prCross: prC, countErr: (prC - gtC) / gtC,
    absCountErr: (sum("absErrIn") + sum("absErrOut")) / gtC, evR: tp / gtC, evP: tp / Math.max(1, prC),
    idf1: per.reduce((a, r) => a + r.idf1 * r.gt, 0) / sum("gt") } };
}

// ---------- main ----------
let bench = null;
const B = async () => (bench = bench || await openBench());
const seqs = findSeqs(root).map(seqInfo).filter(s => !opt("--seq") || opt("--seq").split(",").some(q => s.name.includes(q))).filter(s => s.frames.length > 10);
if (!seqs.length) { console.log("skip people benchmark: no sequences with images under " + root); process.exit(0); }
const DETWS = flag("--sweep") ? [320, 416, 640] : [416];
const det = new Map(); // detW -> Map(seq -> cache)
try {
  for (const w of DETWS) {
    const m = new Map();
    for (const s of seqs) m.set(s.name, await detections(B, s, w, w === 416 && !TILES && !DEGRADE ? 0.2 : 0)); // tiled or degraded: no re-ID embeddings (time)
    det.set(w, m);
  }
} finally { if (bench) await bench.done(); }

const out = { date: new Date().toISOString(), backend: det.get(416).values().next().value.backend, seqs: seqs.map(s => ({ name: s.name, frames: s.frames.length, fps: s.fps, step: s.step, W: s.W, H: s.H, gtBoxes: s.frames.reduce((a, f) => a + (s.gt.get(f) || []).length, 0) })) };
out.tiles = TILES;
console.log(`\n## People benchmark${TILES ? ` — TILED ${TILES.cols}×${TILES.rows} + full frame` : ""} — backend ${out.backend}, frames analysed at ≈${seqs.map(s => (s.fps / s.step).toFixed(1)).join("/")} fps\n`);
console.log(table(["sequence", "frames", "res", "GT boxes"], out.seqs.map(s => [s.name, s.frames, `${s.W}×${s.H}`, s.gtBoxes])));
const ms = [...det.get(416).values()].flatMap(c => c.frames.map(r => r.ms)).sort((a, b) => a - b);
out.detMs416 = { median: ms[ms.length >> 1], p90: ms[Math.floor(ms.length * 0.9)] };
console.log(`\n${MODEL} detect${SPLIT ? " split " + SPLIT : ""} @416 px (WASM, this machine): median ${out.detMs416.median} ms, p90 ${out.detMs416.p90} ms per frame`);

// detection
const THRS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6];
out.detection = [];
for (const [w, m] of det) {
  const rows = [];
  for (const thr of THRS) {
    const all = seqs.map(s => detMetrics(s, m.get(s.name), thr));
    const tp = all.reduce((a, r) => a + r.tp, 0), fp = all.reduce((a, r) => a + r.fp, 0), gt = all.reduce((a, r) => a + r.gt, 0);
    const P = tp / Math.max(1, tp + fp), R = tp / gt;
    rows.push([w, thr, pct(P), pct(R), pct(2 * P * R / (P + R))]); out.detection.push({ detW: w, thr, precision: P, recall: R });
  }
  const ap = seqs.map(s => [s.name, detMetrics(s, m.get(s.name), 0.05).ap]);
  console.log(`\n### Detection (IoU ≥ 0.5, all sequences pooled) detW=${w}  — AP@0.5 per sequence: ${ap.map(([n, a]) => `${n} ${pct(a)}`).join(", ")}\n`);
  console.log(table(["detW", "minScore", "precision", "recall", "F1"], rows));
}
const thr0 = 0.4;
out.recallBySize = Object.fromEntries(seqs.map(s => [s.name, recallBySize(s, det.get(416).get(s.name), thr0)]));
console.log(`\n### Recall by person height (box height / frame height, visibility ≥ 50%), detW=416, minScore=${thr0}\n`);
console.log(table(["sequence", "<10%", "10–20%", "20–35%", "≥35%"], seqs.map(s => [s.name, ...out.recallBySize[s.name].map(b => b.n ? `${pct(b.recall, 0)} (n=${b.n})` : "—")])));

// tracking + counting
const configs = [
  ["store defaults (round 5: byte + band/confirm + flushLost, dets ≥ 0.3)", { thr: ST.ST_DET_MIN }],
  ["round-4 defaults (byte + band/confirm)", { thr: ST.ST_DET_MIN, tcfgBase: ST.ST_TRACK_R4 }],
  ["store defaults + ลดการนับซ้ำ (re-ID on)", { thr: ST.ST_DET_MIN, reid: true }],
  ["round-3 defaults (minScore 0.4, DIST_MAX 0.09, MISS 2 s)", { thr: 0.4, tcfgBase: ST.ST_TRACK_R3 }],
  ["round-5 candidate, not adopted: + byte HIGH 0.4", { thr: ST.ST_DET_MIN, tcfgBase: { ...ST.ST_TRACK, HIGH: 0.4 } }],
  ["round-2 tracker (DIST_MAX 0.12, MISS 1 s)", { thr: 0.4, tcfgBase: LQT.PRESET.person }],
  ["round-3 defaults + re-ID", { thr: 0.4, reid: true, tcfgBase: ST.ST_TRACK_R3 }]
];
if (flag("--sweep")) {
  for (const thr of [0.25, 0.3, 0.35, 0.5]) configs.push([`minScore ${thr}`, { thr }]);
  for (const thr of [0.3, 0.35]) configs.push([`minScore ${thr} + re-ID`, { thr, reid: true }]);
  configs.push(["minScore 0.4, MIN_HITS 3", { thr: 0.4, tcfgBase: { ...LQT.PRESET.person, MIN_HITS: 3 } }]);
  configs.push(["minScore 0.4, MAX_MISSED 2 s", { thr: 0.4, tcfgBase: { ...LQT.PRESET.person, MAX_MISSED_MS: 2000 } }]);
  configs.push(["minScore 0.4, lost pool 3 s", { thr: 0.4, tcfgBase: { ...LQT.PRESET.person, LOST_TTL_MS: 3000 } }]);
  configs.push(["minScore 0.35, lost pool 3 s", { thr: 0.35, tcfgBase: { ...LQT.PRESET.person, LOST_TTL_MS: 3000 } }]);
  configs.push(["minScore 0.35, lost pool 3 s + re-ID", { thr: 0.35, reid: true, tcfgBase: { ...LQT.PRESET.person, LOST_TTL_MS: 3000 } }]);
  for (const dm of [0.05, 0.07, 0.09]) configs.push([`minScore 0.4, DIST_MAX ${dm}`, { thr: 0.4, tcfgBase: { ...LQT.PRESET.person, DIST_MAX: dm } }]);
  for (const dm of [0.05, 0.07]) configs.push([`minScore 0.4, DIST_MAX ${dm}, IOU_MIN 0.3`, { thr: 0.4, tcfgBase: { ...LQT.PRESET.person, DIST_MAX: dm, IOU_MIN: 0.3 } }]);
  for (const dm of [0.05, 0.07]) configs.push([`minScore 0.4, DIST_MAX ${dm}, MAX_MISSED 2 s`, { thr: 0.4, tcfgBase: { ...LQT.PRESET.person, DIST_MAX: dm, MAX_MISSED_MS: 2000 } }]);
  for (const sim of [0.75, 0.78, 0.85, 0.88]) configs.push([`minScore 0.4 + re-ID SIM_MIN ${sim}`, { thr: 0.4, reid: true, reidCfg: { SIM_MIN: sim } }]);
}
// LQ_BENCH_EXTRA='[["label", {thr, reid, reidCfg, tcfgBase:{...}}], ...]' adds configs (tuning experiments)
// {"store": true, ...} starts from the store's ST_TRACK (CROSS merged key by key) instead of PRESET.person
if (process.env.LQ_BENCH_EXTRA) for (const [label, c] of JSON.parse(process.env.LQ_BENCH_EXTRA)) {
  const base = c.store ? ST.ST_TRACK : LQT.PRESET.person, tb = c.tcfgBase || {};
  configs.push([label, { thr: c.store ? ST.ST_DET_MIN : 0.4, ...c, tcfgBase: { ...base, ...tb, ...(tb.CROSS || base.CROSS ? { CROSS: { ...(base.CROSS || {}), ...(tb.CROSS || {}) } } : {}) } }]);
}
if (DEGRADE || flag("--quick")) configs.splice(1); // robustness runs: the shipped store configuration only
const cm = det.get(416);
out.tracking = [];
const trows = [];
for (const [label, cfg] of configs) {
  const r = evalConfig(seqs, cm, cfg);
  out.tracking.push({ label, cfg: { ...cfg, tcfgBase: cfg.tcfgBase ? { MIN_HITS: cfg.tcfgBase.MIN_HITS, MAX_MISSED_MS: cfg.tcfgBase.MAX_MISSED_MS, LOST_TTL_MS: cfg.tcfgBase.LOST_TTL_MS, DIST_MAX: cfg.tcfgBase.DIST_MAX, IOU_MIN: cfg.tcfgBase.IOU_MIN } : undefined }, ...r });
  if (WHY) { console.log(`\n--why ${label}:`, JSON.stringify(Object.fromEntries(Object.entries(WHY).sort()))); for (const k in WHY) delete WHY[k]; }
  trows.push([label, pct(r.pooled.mota), pct(r.pooled.idf1), r.pooled.idsw, `${r.pooled.prCross}/${r.pooled.gtCross}`, (r.pooled.countErr >= 0 ? "+" : "") + pct(r.pooled.countErr), pct(r.pooled.absCountErr), pct(r.pooled.evP), pct(r.pooled.evR)]);
}
console.log(`\n### Tracking + line counting (store.stepCam, detW=416; 5 virtual lines per sequence: x=0.3/0.5/0.7, y=0.4/0.6)\n`);
console.log(table(["config", "MOTA", "IDF1", "ID sw", "counted/GT", "net count err", "abs dir err", "event P", "event R"], trows));
console.log("\nper sequence (first three configs):");
for (const t of out.tracking.slice(0, 3)) console.log(table(["config", "sequence", "MOTA", "IDF1", "ID sw", "counted/GT crossings", "net err", "event P", "event R"],
  t.per.map(p => [t.label.slice(0, 22), p.seq, pct(p.mota), pct(p.idf1), p.idsw, `${p.prCross}/${p.gtCross}`, pct(p.countErr), pct(p.evP), pct(p.evR)])));
// --health / --degrade: replay the shipped camera-health monitor (lensiq-sitecheck.js createHealth) at about 1 sample per
// second, exactly as store.js feeds it (frame statistics + analysis rate + median person height of that second)
if (HEALTH) {
  const SITE = require(join(REPO, "lensiq-sitecheck.js"));
  out.health = {};
  const hrows = [];
  for (const s of seqs) {
    const c = cm.get(s.name), mon = SITE.createHealth({ kind: "store" }), on = {}, per = Math.max(1, Math.round(1000 / s.dt));
    let n = 0, warn = 0, ph = [], lastI = -1;
    s.frames.forEach((f, i) => {
      const row = c.frames[i]; if (!row) return;
      for (const d of row.d) if (d[4] >= 0.5) ph.push(d[3]);
      const t = (f - s.frames[0]) / s.step;
      if (Math.floor(t / per) === lastI || !row.hs) return; lastI = Math.floor(t / per);
      const hs = { ...row.hs, thumb: Float32Array.from(row.hs.thumb), tw: 32, th: 18 };
      const hz = 1000 / s.dt * s.frames.length / s.gtFrames.length;
      const st = mon.push(hs, { hz, personH: ph.length >= 2 ? SITE.median(ph) : null }); ph = [];
      if (++n <= 2) return; // the monitor needs 2 samples
      st.codes.forEach(k => { on[k] = (on[k] || 0) + 1; }); if (st.level) warn++;
    });
    const m = Math.max(1, n - 2);
    out.health[s.name] = { samples: m, anyWarn: warn / m, flags: Object.fromEntries(Object.entries(on).map(([k, v]) => [k, v / m])) };
    hrows.push([s.name, m, pct(warn / m, 0), Object.entries(on).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / m, 0)}`).join(", ") || "—"]);
  }
  console.log(`\n### Camera health (lensiq-sitecheck) — degrade ${DEGRADE || "none"}${FDROP ? `, frame drop ${FDROP}` : ""}\n`);
  console.log(table(["sequence", "1-s samples", "any warning", "flags (share of samples)"], hrows));
  out.degrade = DEGRADE; out.frameDrop = FDROP;
}
if (opt("--json")) { writeFileSync(opt("--json"), JSON.stringify(out, null, 1)); console.log("\nwrote " + opt("--json")); }
