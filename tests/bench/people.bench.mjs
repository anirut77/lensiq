#!/usr/bin/env node
// tests/bench/people.bench.mjs — people detection / tracking / line-counting accuracy of the store pipeline on public
// MOTChallenge footage with ground truth (MOT17 train, 2DMOT2015 train: PETS09-S2L1, TUD-Stadtmitte, ...).
//
//   LQ_BENCH_DATA=/path/to/data node tests/bench/people.bench.mjs [--sweep] [--seq NAME] [--json out.json]
//
// Data layout: $LQ_BENCH_DATA/mot/**/<SEQ>/{img1/*.jpg, gt/gt.txt[, seqinfo.ini]} (any subset of frames may be present;
// tests/bench/fetch_datasets.py downloads every 3rd MOT17 frame = 10 fps, the rate the store page actually analyses).
// Browser side (headless Chrome, TF.js WASM, no WebGL) = LQDetect.detectCoco + LQDetect.embedBox, the production code.
// Node side = store.js stepCam() (LQTrack tracker, line crossing, re-ID "ลดการนับซ้ำ") on those detections, unchanged.
// Detections are cached per sequence/detW in $LQ_BENCH_CACHE; delete the cache after changing the detector.
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { CACHE, DATA, REPO, needData, openBench, dataUrl, pct, fx, table } from "./lib.mjs";

const require = createRequire(import.meta.url);
const M = require("./metrics.cjs");
const ST = require(join(REPO, "store.js"));
const LQT = require(join(REPO, "lensiq-track.js"));

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const root = needData("mot", "people benchmark");

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
  const step = step0 * k, frames = all.filter((_, i) => i % k === 0);
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
  return { ...info, path: p, step, all, frames, gt, ign, dt: 1000 * step / info.fps };
}

// ---------- detections (cached) ----------
// --tiles 2x2 (or LQ_BENCH_TILES) = the store page's "far/small people" mode: LQDetect tiling for the main detW=416 pass
const TILES = (() => { const t = opt("--tiles", process.env.LQ_BENCH_TILES || ""); const m = /^(\d)x(\d)$/.exec(t); return m ? { cols: +m[1], rows: +m[2], overlap: 0.2 } : null; })();
async function detections(B, s, detW, embMin) {
  const tiles = detW === 416 ? TILES : null;
  const file = join(CACHE, `people-${s.name}-w${detW}${tiles ? `-t${tiles.cols}x${tiles.rows}` : ""}${embMin ? "-emb" : ""}.json`);
  const pick = c => ({ ...c, frames: s.frames.map(f => c.frames[s.all.indexOf(f)]) });
  if (existsSync(file)) { const c = JSON.parse(readFileSync(file, "utf8")); if (c.frames.length === s.all.length) return pick(c); }
  const b = await B();
  const rows = [], t0 = Date.now();
  for (let i = 0; i < s.all.length; i += 16) {
    const urls = s.all.slice(i, i + 16).map(f => dataUrl(relative(DATA, join(s.path, "img1", String(f).padStart(6, "0") + ".jpg"))));
    rows.push(...await b.page.evaluate(`LQB.people(${JSON.stringify(urls)}, ${JSON.stringify({ detW, minScore: 0.05, max: 100, embMin, tiles })})`));
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
const toDets = (row, thr) => row.d.map((d, k) => ({ x: d[0], y: d[1], w: d[2], h: d[3], score: d[4], k })).filter(d => d.score >= thr);

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
    const now = 1e9 + i * s.dt, row = cache.frames[i];
    const dets = toDets(row, thr);
    let embed;
    if (reid) {
      const byKey = new Map(dets.map(d => [`${d.x},${d.y},${d.w},${d.h}`, d]));
      embed = box => { const d = byKey.get(`${box.x},${box.y},${box.w},${box.h}`); const e = d && row.e && row.e[d.k]; return e ? decodeEmb(e) : null; };
    }
    const r = ST.stepCam(pipe, cam, day, dets, now, tcfg, reid ? { reid: true, embed, reidCfg } : {});
    frames.push({ gt: s.gt.get(f) || [], ign: s.ign.get(f) || [], hyp: r.conf.map(t => ({ id: t.cid ?? t.id, ...t.box })) });
    for (const c of r.crossings) {
      const t = r.conf.find(x => (x.cid ?? x.id) === c.id);
      ev.push({ id: c.id, t: now, dir: c.dir, pos: t ? M.projectOnLine(line, LQT.center(t.box)) : 0.5 });
    }
  });
  return { frames, ev, dedup: pipe.reid ? pipe.reid.stats : null };
}
function gtEvents(s, line) {
  const tracks = new Map();
  s.frames.forEach((f, i) => {
    for (const g of s.gt.get(f) || []) { if (!tracks.has(g.id)) tracks.set(g.id, []); tracks.get(g.id).push({ t: 1e9 + i * s.dt, p: LQT.center(g) }); }
  });
  return M.crossingsFromTracks(tracks, line, (mem, ln, p, sw) => ST.checkCrossing(mem, ln, p, sw));
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
    for (const s of seqs) m.set(s.name, await detections(B, s, w, w === 416 && !TILES ? 0.2 : 0)); // tiled: no re-ID embeddings (time)
    det.set(w, m);
  }
} finally { if (bench) await bench.done(); }

const out = { date: new Date().toISOString(), backend: det.get(416).values().next().value.backend, seqs: seqs.map(s => ({ name: s.name, frames: s.frames.length, fps: s.fps, step: s.step, W: s.W, H: s.H, gtBoxes: s.frames.reduce((a, f) => a + (s.gt.get(f) || []).length, 0) })) };
out.tiles = TILES;
console.log(`\n## People benchmark${TILES ? ` — TILED ${TILES.cols}×${TILES.rows} + full frame` : ""} — backend ${out.backend}, frames analysed at ≈${seqs.map(s => (s.fps / s.step).toFixed(1)).join("/")} fps\n`);
console.log(table(["sequence", "frames", "res", "GT boxes"], out.seqs.map(s => [s.name, s.frames, `${s.W}×${s.H}`, s.gtBoxes])));
const ms = [...det.get(416).values()].flatMap(c => c.frames.map(r => r.ms)).sort((a, b) => a - b);
out.detMs416 = { median: ms[ms.length >> 1], p90: ms[Math.floor(ms.length * 0.9)] };
console.log(`\nCOCO-SSD detect @416 px (WASM, this machine): median ${out.detMs416.median} ms, p90 ${out.detMs416.p90} ms per frame`);

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
  ["store defaults (minScore 0.4, re-ID off)", { thr: 0.4 }],
  ["previous defaults (DIST_MAX 0.12, MISS 1 s)", { thr: 0.4, tcfgBase: LQT.PRESET.person }],
  ["store defaults + ลดการนับซ้ำ (re-ID on)", { thr: 0.4, reid: true }]
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
if (process.env.LQ_BENCH_EXTRA) for (const [label, c] of JSON.parse(process.env.LQ_BENCH_EXTRA)) configs.push([label, { ...c, tcfgBase: { ...LQT.PRESET.person, ...(c.tcfgBase || {}) } }]);
const cm = det.get(416);
out.tracking = [];
const trows = [];
for (const [label, cfg] of configs) {
  const r = evalConfig(seqs, cm, cfg);
  out.tracking.push({ label, cfg: { ...cfg, tcfgBase: cfg.tcfgBase ? { MIN_HITS: cfg.tcfgBase.MIN_HITS, MAX_MISSED_MS: cfg.tcfgBase.MAX_MISSED_MS, LOST_TTL_MS: cfg.tcfgBase.LOST_TTL_MS, DIST_MAX: cfg.tcfgBase.DIST_MAX, IOU_MIN: cfg.tcfgBase.IOU_MIN } : undefined }, ...r });
  trows.push([label, pct(r.pooled.mota), pct(r.pooled.idf1), r.pooled.idsw, `${r.pooled.prCross}/${r.pooled.gtCross}`, (r.pooled.countErr >= 0 ? "+" : "") + pct(r.pooled.countErr), pct(r.pooled.absCountErr), pct(r.pooled.evP), pct(r.pooled.evR)]);
}
console.log(`\n### Tracking + line counting (store.stepCam, detW=416; 5 virtual lines per sequence: x=0.3/0.5/0.7, y=0.4/0.6)\n`);
console.log(table(["config", "MOTA", "IDF1", "ID sw", "counted/GT", "net count err", "abs dir err", "event P", "event R"], trows));
console.log("\nper sequence (first three configs):");
for (const t of out.tracking.slice(0, 3)) console.log(table(["config", "sequence", "MOTA", "IDF1", "ID sw", "counted/GT crossings", "net err", "event P", "event R"],
  t.per.map(p => [t.label.slice(0, 22), p.seq, pct(p.mota), pct(p.idf1), p.idsw, `${p.prCross}/${p.gtCross}`, pct(p.countErr), pct(p.evP), pct(p.evR)])));
if (opt("--json")) { writeFileSync(opt("--json"), JSON.stringify(out, null, 1)); console.log("\nwrote " + opt("--json")); }
