#!/usr/bin/env node
// tools/crowd-eval.mjs — count error of crowd.html against a manual count (docs/CROWD-ACCURACY.md).
//
//   node tools/crowd-eval.mjs run --clips <dir> [--clip id[,id]] [--model yolox|coco] [--out docs/crowd-count/app-counts.json]
//       Runs the SAME scripts crowd.html loads (lensiq-detect.js, lensiq-track.js, lensiq-zones.js, lensiq-crowd.js) inside
//       headless Chrome (tests/e2e/cdp.mjs, no WebGL) on each clip of docs/crowd-count/clips.json: the clip is seeked at the
//       page's frame rate (5 Hz, lensiq-zonecam.js), every frame goes through detectPeople with the page's options (read from
//       lensiq-zonecam.js so the two cannot drift), the anonymous tracker (same preset), the 5-frame median the page shows
//       ("people in view now") and the entry/exit line counter. Records per sampled frame: raw and shown count, count in the
//       zone, and every line crossing with its time and direction. Numbers only: no frame is written anywhere.
//       The clips are served from --clips (outside the repo); they are never copied into the repo.
//       --tiles CxR (EXPERIMENT, not what the page does today): also run the detector on CxR overlapping tiles (max 300 boxes),
//       to measure how much a "dense mode" would recover. Stored under "<id>@tilesCxR".
//   node tools/crowd-eval.mjs frames --clips <dir> --out <dir outside the repo> [--clip id]
//       Extracts the sampled frames (ffmpeg) for the manual count, named <id>/t<seconds>.jpg, plus a copy with the zone and
//       line drawn on it (<id>/t<seconds>_zone.jpg). Refuses an --out inside the repo (no images of people in the repo).
//   node tools/crowd-eval.mjs score [--sheet docs/crowd-count/count-sheet.csv] [--app docs/crowd-count/app-counts.json] [--json]
//       Reads the filled count sheet (one or more counters per frame / window), averages the counters per frame, reports the
//       inter-counter gap (noise floor) and the app's MAE / MAPE / bias per clip, plus the line-crossing error per window.
//       Counter names starting with "AI" are the PRELIMINARY AI-reviewer reference; human counters are scored separately and
//       only they give the FINAL figure. --sheet may be given more than once (default: ai-reference.csv + count-sheet.csv).
//       --variant coco | tiles3x2 scores the COCO-SSD fallback or the tiling experiment instead of the page as shipped.
//   node tools/crowd-eval.mjs template [--out docs/crowd-count/count-sheet.csv]
//       (Re)writes the empty human count sheet for the clips marked "kit": true (two counters, A and B).
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = p => join(repo, p);
export const CLIPS_FILE = "docs/crowd-count/clips.json";
export const SHEET_FILE = "docs/crowd-count/count-sheet.csv";
export const AI_SHEET_FILE = "docs/crowd-count/ai-reference.csv";
export const APP_FILE = "docs/crowd-count/app-counts.json";
export const SHEET_COLS = ["video", "frame_time_s", "people_in_frame", "people_in_zone", "window_start_s", "window_end_s", "crossings_in", "crossings_out", "counter_name", "notes"];

export function loadClips(root = repo) { return JSON.parse(readFileSync(join(root, CLIPS_FILE), "utf8")).clips; }

// ---------- the page's pipeline settings, read from the shared runtime so the eval cannot drift from the page ----------
export function pagePipeline(root = repo) {
  const zc = readFileSync(join(root, "lensiq-zonecam.js"), "utf8");
  const call = zc.match(/LQDetect\.detectPeople\(model, video, \{([^}]*)\}\)/);
  const defs = zc.match(/Object\.assign\(\{ key: "zc", classes: \["person"\], minScore: ([\d.]+), hz: (\d+)/);
  const trk = zc.match(/LQTrack\.newTracker\([^\n]*PRESET\.(\w+)[^\n]*MIN_HITS: (\d+)/);
  const sm = readFileSync(join(root, "crowd.js"), "utf8").match(/totalSmooth = Z\.createSmoother\((\d+)\)/);
  if (!call || !defs || !trk || !sm) throw new Error("could not read the page pipeline from lensiq-zonecam.js / crowd.js — update tools/crowd-eval.mjs");
  const opt = k => { const m = call[1].match(new RegExp(k + ': ("?)([\\w.]+)\\1')); return m ? (m[1] ? m[2] : Number(m[2])) : undefined; };
  return { minScore: Number(defs[1]), hz: Number(defs[2]), detW: opt("detW"), max: opt("max"), split: opt("split"), preset: trk[1], minHits: Number(trk[2]), smooth: Number(sm[1]) };
}

// ---------- statistics (pure; tests/unit/crowd-report.test.js) ----------
/** pairs [{app, ref}] -> {n, mae, mape (ref > 0 only), bias (mean app - ref), within} ; within(tol(ref)) share of |err| <= tol */
export function errorStats(pairs, tol = null) {
  const ok = pairs.filter(p => Number.isFinite(p.app) && Number.isFinite(p.ref));
  if (!ok.length) return { n: 0, mae: null, mape: null, bias: null, within: null, refMean: null, appMean: null };
  const e = ok.map(p => p.app - p.ref), pos = ok.filter(p => p.ref > 0);
  const r = v => Math.round(v * 1000) / 1000;
  return {
    n: ok.length, mae: r(e.reduce((s, v) => s + Math.abs(v), 0) / ok.length),
    mape: pos.length ? r(100 * pos.reduce((s, p) => s + Math.abs(p.app - p.ref) / p.ref, 0) / pos.length) : null,
    bias: r(e.reduce((s, v) => s + v, 0) / ok.length),
    within: tol ? r(ok.filter(p => Math.abs(p.app - p.ref) <= tol(p.ref)).length / ok.length) : null,
    refMean: r(ok.reduce((s, p) => s + p.ref, 0) / ok.length), appMean: r(ok.reduce((s, p) => s + p.app, 0) / ok.length)
  };
}
/** the protocol's acceptance band (RESEARCH-R15 §B): ±1 person (sparse), ±15 % (medium), ±25 % (dense) */
export const TOLERANCE = { sparse: () => 1, medium: ref => Math.max(1, 0.15 * ref), dense: ref => Math.max(1, 0.25 * ref) };

/** minimal CSV parser (RFC 4180 quotes, BOM, CRLF) -> array of row objects keyed by the header */
export function parseCsv(text) {
  const s = String(text).replace(/^﻿/, ""), rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === "\"") { if (s[i + 1] === "\"") { cell += "\""; i++; } else q = false; } else cell += c; continue; }
    if (c === "\"") q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim());
  return rows.filter(r => r.some(v => v.trim() !== "")).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}
const numOrNull = v => v === "" || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
export const isAI = name => /^AI\b/i.test(String(name || "").trim());
/** a counter name containing "(adjudicated)" is the third look that settles a gap: its value replaces the mean */
export const isAdj = name => /\(adjudicated\)/i.test(String(name || ""));

/** count-sheet rows -> {frames: Map("video|t" -> {video, t, frame:[...], zone:[...], counters:[...], adj:{frame?, zone?}}),
 *  windows: Map("video|a|b" -> {...in:[], out:[], adj:{in?, out?}})}   ai: true = only "AI..." counters, false = only human ones */
export function collectSheet(rows, { ai = null } = {}) {
  const frames = new Map(), windows = new Map();
  for (const r of rows) {
    const who = r.counter_name || "";
    if (ai === true && !isAI(who)) continue;
    if (ai === false && isAI(who)) continue;
    const t = numOrNull(r.frame_time_s), a = numOrNull(r.window_start_s), b = numOrNull(r.window_end_s);
    if (t != null) {
      const f = numOrNull(r.people_in_frame), z = numOrNull(r.people_in_zone);
      if (f == null && z == null) continue;
      const k = r.video + "|" + t, e = frames.get(k) || { video: r.video, t, frame: [], zone: [], counters: [], adj: {} };
      if (isAdj(who)) { if (f != null) e.adj.frame = f; if (z != null) e.adj.zone = z; } // a third look settles a > 10 % gap
      else { if (f != null) e.frame.push(f); if (z != null) e.zone.push(z); }
      e.counters.push(who); frames.set(k, e);
    } else if (a != null && b != null) {
      const i = numOrNull(r.crossings_in), o = numOrNull(r.crossings_out);
      if (i == null && o == null) continue;
      const k = `${r.video}|${a}|${b}`, e = windows.get(k) || { video: r.video, a, b, in: [], out: [], counters: [], adj: {} };
      if (isAdj(who)) { if (i != null) e.adj.in = i; if (o != null) e.adj.out = o; }
      else { if (i != null) e.in.push(i); if (o != null) e.out.push(o); }
      e.counters.push(who); windows.set(k, e);
    }
  }
  return { frames, windows };
}
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
/** the reference value of a frame / window entry: the adjudicated value when there is one, else the mean of the counters */
export const refOf = (e, k) => e.adj && e.adj[k] != null ? e.adj[k] : mean(e[k]);
/** inter-counter gap on frames counted by >= 2 counters: mean |max - min| and the share of frames whose gap is > 10 % */
export function counterGap(entries, field = "frame") {
  const multi = entries.filter(e => e[field].length >= 2);
  if (!multi.length) return { n: 0, meanAbs: null, over10pct: null };
  const gaps = multi.map(e => ({ g: Math.max(...e[field]) - Math.min(...e[field]), m: mean(e[field]) }));
  return { n: multi.length, meanAbs: Math.round(1000 * mean(gaps.map(x => x.g))) / 1000, over10pct: Math.round(1000 * gaps.filter(x => x.m > 0 && x.g / x.m > 0.1).length / multi.length) / 1000 };
}
/** app crossings [{t, dir}] counted in [a, b) */
export function crossingsIn(app, a, b) {
  const c = (app || []).filter(x => x.t >= a && x.t < b);
  return { in: c.filter(x => x.dir === "in").length, out: c.filter(x => x.dir === "out").length };
}
/** score one reference (sheet rows) against app-counts.json -> per clip {frame, zone, line} stats */
export function score(rows, app, clips, { ai = null, field = "shown", variant = "" } = {}) {
  const { frames, windows } = collectSheet(rows, { ai });
  const out = {};
  for (const c of clips) {
    const A = app.clips && app.clips[c.id + (variant ? "@" + variant : "")]; if (!A) continue;
    const fr = [...frames.values()].filter(e => e.video === c.id || e.video === c.file);
    if (!fr.length) continue;
    const at = t => A.samples.find(s => Math.abs(s.t - t) < 0.051);
    const pairs = k => fr.map(e => { const s = at(e.t); return s ? { t: e.t, app: k === "frame" ? s[field] : s.zone, ref: refOf(e, k) } : null; }).filter(p => p && p.ref != null);
    const tol = TOLERANCE[c.crowd] || null;
    const res = { crowd: c.crowd, counters: [...new Set(fr.flatMap(e => e.counters))], frame: errorStats(pairs("frame"), tol), zone: errorStats(pairs("zone"), tol),
      gapFrame: counterGap(fr, "frame"), gapZone: counterGap(fr, "zone"), perFrame: pairs("frame").map(p => ({ t: p.t, app: p.app, ref: p.ref })) };
    const ws = [...windows.values()].filter(e => e.video === c.id || e.video === c.file);
    if (ws.length && A.crossings) {
      const per = ws.sort((x, y) => x.a - y.a).map(w => {
        const a = crossingsIn(A.crossings, w.a, w.b);
        return { a: w.a, b: w.b, refIn: refOf(w, "in"), refOut: refOf(w, "out"), appIn: a.in, appOut: a.out };
      });
      const tot = k => per.reduce((s, w) => s + (w[k] || 0), 0);
      res.line = { windows: per, refIn: tot("refIn"), refOut: tot("refOut"), appIn: tot("appIn"), appOut: tot("appOut"),
        absErrPerWindow: Math.round(1000 * mean(per.map(w => Math.abs(w.appIn - (w.refIn || 0)) + Math.abs(w.appOut - (w.refOut || 0))))) / 1000 };
    }
    out[c.id] = res;
  }
  return out;
}

/** empty count sheet rows for the kit clips: 2 counters x (every sampled frame + every 10 s window) */
export function templateRows(clips, durations = {}) {
  const rows = [SHEET_COLS];
  for (const c of clips.filter(x => x.kit)) {
    const dur = durations[c.id] || 0;
    for (const who of ["A", "B"]) {
      for (const t of sampleTimes(c.step, dur)) rows.push([c.id, t, "", "", "", "", "", "", who, ""]);
      if (c.line) for (let a = 0; a < dur; a += 10) rows.push([c.id, "", "", "", a, Math.min(Math.round(dur * 100) / 100, a + 10), "", "", who, ""]);
    }
  }
  return rows;
}
export function sampleTimes(step, dur) {
  const out = [];
  for (let i = 0; i * step <= dur - 0.2 + 1e-9; i++) out.push(Math.round(i * step * 1000) / 1000);
  return out;
}
const csvLine = r => r.map(v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s; }).join(",");

// ---------- CLI ----------
function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      const val = v != null ? v : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true);
      if (o[k] != null && k === "sheet") o[k] = [].concat(o[k], val); else o[k] = val;
    } else o._.push(a);
  }
  return o;
}
const insideRepo = p => { const r = resolve(p); return r === repo || r.startsWith(repo + sep); };
function probe(file) {
  const s = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(s.trim());
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".bin": "application/octet-stream",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".mp4": "video/mp4", ".webm": "video/webm" };
/** repo read-only + /__clips/<file> from the clip folder, with HTTP Range (needed to seek a video) */
function serveEval(clipDir) {
  const srv = createServer((req, res) => {
    let p; try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    let base = repo;
    if (p.startsWith("/__clips/")) { base = resolve(clipDir); p = p.slice(8); }
    const f = normalize(join(base, p.endsWith("/") ? p + "index.html" : p));
    if (!f.startsWith(base + sep) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404).end(); return; }
    const size = statSync(f).size, type = TYPES[extname(f).toLowerCase()] || "application/octet-stream";
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (m) {
      const a = m[1] ? +m[1] : size - +m[2], b = m[1] && m[2] ? Math.min(size - 1, +m[2]) : size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Length": b - a + 1, "Content-Range": `bytes ${a}-${b}/${size}`, "Accept-Ranges": "bytes" });
      createReadStream(f, { start: a, end: b }).pipe(res);
    } else { res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" }); createReadStream(f).pipe(res); }
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}

/* runs inside crowd.html: the page's own scripts, driven frame by frame on a seeked <video> */
async function inPage(cfg) {
  const W = /** @type {any} */ (window), D = W.LQDetect, TR = W.LQTrack, Z = W.LQZones, C = W.LQCrowd;
  const v = document.createElement("video");
  v.muted = true; v.preload = "auto"; v.playsInline = true; v.src = cfg.src;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error("video load failed " + cfg.src)); });
  const seek = t => new Promise(res => { v.onseeked = () => res(); v.currentTime = t; });
  let model, kind;
  if (cfg.model === "coco") { await D.tfBackend(); model = await D.loadCoco(); kind = "coco"; } else { model = await D.loadYolox(); kind = "yolox"; }
  const cls = ["person"].map(n => Z.cocoIndex(n, kind)).filter(i => i >= 0);
  const P = cfg.pipe;
  const tracker = TR.newTracker(Object.assign({}, TR.PRESET[P.preset] || TR.DEFAULTS, { MIN_HITS: P.minHits }));
  const lc = C.createLineCounter(), sm = Z.createSmoother(P.smooth), smZ = Z.createSmoother(P.smooth);
  const samples = [], crossings = [], perFrame = [];
  const want = new Set(cfg.samples.map(t => Math.round(t * P.hz)));
  const dur = v.duration, n = Math.floor((dur - 0.05) * P.hz);
  let ms = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / P.hz;
    await seek(Math.min(dur - 0.04, t + 0.001));
    const t0 = performance.now();
    const opts = { classes: cls, minScore: P.minScore, detW: P.detW, max: P.max, split: P.split };
    if (cfg.tiles) { opts.tiles = cfg.tiles; opts.split = null; opts.max = cfg.tilesMax || P.max; }
    const raw = (await D.detectPeople(model, v, opts))
      .map(d => ({ ...d, label: Z.labelOf(d, kind) })).filter(d => d && d.w > 0 && d.h > 0);
    ms += performance.now() - t0;
    const now = t * 1000;
    TR.updateTracker(tracker, raw, now);
    const byDet = new Map();
    for (const tr of tracker.tracks) if (tr.lastSeen === now && tr.det) byDet.set(tr.det, tr.confirmed ? tr.id : 0);
    const people = raw.map(d => ({ x: d.x, y: d.y, w: d.w, h: d.h, score: d.score, label: d.label, id: byDet.get(d) || 0 })).filter(d => d.label === "person");
    const shown = Math.round(sm.push(people.length));
    const inZ = cfg.zone ? people.filter(b => Z.boxInZone(b, cfg.zone, "foot")).length : null;
    const zShown = inZ == null ? null : Math.round(smZ.push(inZ));
    if (cfg.line) for (const c of lc.update(people, cfg.line, !!cfg.line.swap, now)) crossings.push({ t: Math.round(t * 100) / 100, dir: c.dir });
    perFrame.push([Math.round(t * 100) / 100, people.length, shown, inZ]);
    const hs = people.map(d => d.h).sort((a, b) => a - b), medH = hs.length ? Math.round(1000 * hs[hs.length >> 1]) / 1000 : null;
    if (want.has(i)) samples.push({ t: Math.round(t * 1000) / 1000, raw: people.length, shown, zoneRaw: inZ, zone: zShown, medH, capped: people.length >= (opts.max || P.max) });
  }
  return { duration: Math.round(dur * 1000) / 1000, frames: n + 1, msPerFrame: Math.round(ms / (n + 1)), samples, crossings, perFrame };
}

async function cmdRun(o) {
  if (!o.clips) throw new Error("--clips <dir> is required (the folder with the evaluation clips, outside the repo)");
  if (insideRepo(o.clips)) console.warn("warning: --clips is inside the repo — clips must never be committed");
  const { launch } = await import(pathToFileURL(join(repo, "tests/e2e/cdp.mjs")).href);
  const pipe = pagePipeline(), clips = loadClips().filter(c => !o.clip || String(o.clip).split(",").includes(c.id));
  const outFile = resolve(o.out || rel(APP_FILE));
  const prev = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : { clips: {} };
  const html = readFileSync(rel("crowd.html"), "utf8"), ver = f => (html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1] || "?";
  const { srv, base } = await serveEval(o.clips);
  const browser = await launch();
  const result = { _about: "App counts from tools/crowd-eval.mjs run (numbers only, no frames). PRELIMINARY until compared with the human count sheet.",
    generated: new Date().toISOString(), pipeline: pipe,
    page: { "crowd.js": ver("crowd.js"), "lensiq-crowd.js": ver("lensiq-crowd.js"), "lensiq-detect.js": ver("lensiq-detect.js"), "lensiq-zonecam.js": ver("lensiq-zonecam.js") },
    device: `${platform()} ${release()} · ${(cpus()[0] || {}).model || "cpu"}`, browser: "", clips: prev.clips || {} };
  try {
    const page = await browser.newPage(`${base}/crowd.html?cpu`, { timeout: 60000 });
    result.browser = await page.evaluate(() => navigator.userAgent.replace(/^.*(HeadlessChrome\/[\d.]+|Chrome\/[\d.]+).*$/, "$1"));
    for (const c of clips) {
      const f = join(o.clips, c.file);
      if (!existsSync(f)) { console.log(`skip ${c.id}: ${c.file} not in ${o.clips}`); continue; }
      const dur = probe(f), samples = sampleTimes(c.step, dur);
      const line = c.line ? { a: c.line.a, b: c.line.b, swap: !!c.line.swap } : null;
      const t0 = Date.now();
      const tiles = o.tiles ? { cols: +String(o.tiles).split("x")[0], rows: +String(o.tiles).split("x")[1], overlap: 0.2 } : null;
      const r = await page.evaluate(inPage, { src: `${base}/__clips/${encodeURIComponent(c.file)}`, model: o.model || "yolox", pipe, samples, zone: c.zone, line, tiles, tilesMax: tiles ? 300 : 0 });
      const key = c.id + (o.model === "coco" ? "@coco" : "") + (tiles ? "@tiles" + o.tiles : "");
      result.clips[key] = { file: c.file, crowd: c.crowd, step: c.step, model: o.model === "coco" ? "COCO-SSD (fallback)" : "YOLOX-Nano 416 (ORT Web WASM)",
        variant: tiles ? `EXPERIMENT: + ${o.tiles} tiles (not what the page does)` : "as shipped", ...r };
      const sh = r.samples.map(s => s.shown);
      const nDir = d => r.crossings.filter(x => x.dir === d).length;
      console.log(`${key}: ${r.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s (${r.msPerFrame} ms/frame) · shown ${Math.min(...sh)}-${Math.max(...sh)}` +
        ` · crossings in ${nDir("in")} out ${nDir("out")}`);
    }
    await page.close();
  } finally { await browser.close(); srv.close(); }
  mkdirSync(dirname(outFile), { recursive: true });
  // perFrame rows are compact arrays [t, raw, shown, zone] so the file stays small
  writeFileSync(outFile, JSON.stringify(result, (k, v) => Array.isArray(v) && v.length === 4 && typeof v[0] === "number" ? JSON.stringify(v) : v, 1)
    .replace(/"\[([^\]]*)\]"/g, "[$1]") + "\n");
  console.log("wrote " + outFile);
}

function cmdFrames(o) {
  if (!o.clips || !o.out) throw new Error("--clips <dir> and --out <dir> are required");
  if (insideRepo(o.out)) throw new Error("--out must be outside the repo: sampled frames show people and are never committed");
  for (const c of loadClips().filter(x => !o.clip || String(o.clip).split(",").includes(x.id))) {
    const f = join(o.clips, c.file); if (!existsSync(f)) continue;
    const d = join(o.out, c.id); mkdirSync(d, { recursive: true });
    const draw = [];
    if (c.zone) { // bounding box of the zone polygon (the clips use rectangles)
      const xs = c.zone.map(p => p.x), ys = c.zone.map(p => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys);
      draw.push(`drawbox=x=iw*${x0}:y=ih*${y0}:w=iw*${Math.max(...xs) - x0}:h=ih*${Math.max(...ys) - y0}:color=cyan@0.9:t=3`);
    }
    if (c.line) { // horizontal or vertical lines in the clips: a thin filled box
      const { a, b } = c.line;
      draw.push(`drawbox=x=iw*${Math.min(a.x, b.x)}:y=ih*${Math.min(a.y, b.y)}:w=max(3\\,iw*${Math.abs(b.x - a.x)}):h=max(3\\,ih*${Math.abs(b.y - a.y)}):color=yellow@0.9:t=fill`);
    }
    for (const t of sampleTimes(c.step, probe(f))) {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", f, "-frames:v", "1", "-q:v", "2", join(d, `t${t}.jpg`)]);
      if (draw.length) execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", f, "-frames:v", "1", "-q:v", "2", "-vf", draw.join(","), join(d, `t${t}_zone.jpg`)]);
    }
    console.log(`${c.id}: frames in ${d}`);
  }
}

function cmdTemplate(o) {
  const out = resolve(o.out || rel(SHEET_FILE)), app = existsSync(rel(APP_FILE)) ? JSON.parse(readFileSync(rel(APP_FILE), "utf8")) : { clips: {} };
  const durations = Object.fromEntries(Object.entries(app.clips || {}).map(([k, v]) => [k, v.duration]));
  for (const c of loadClips()) if (c.kit && !durations[c.id]) throw new Error(`no duration for ${c.id}: run "crowd-eval.mjs run" first`);
  writeFileSync(out, "﻿" + templateRows(loadClips(), durations).map(csvLine).join("\n") + "\n");
  console.log("wrote " + out);
}

function fmtStats(s) {
  if (!s.n) return "no data";
  const mape = s.mape == null ? "—" : s.mape + "%", within = s.within == null ? "—" : Math.round(100 * s.within) + "%";
  return `n=${s.n} MAE ${s.mae} · MAPE ${mape} · bias ${s.bias > 0 ? "+" : ""}${s.bias} · within band ${within} (ref mean ${s.refMean}, app mean ${s.appMean})`;
}
function cmdScore(o) {
  const sheets = [].concat(o.sheet || [rel(AI_SHEET_FILE), rel(SHEET_FILE)]).filter(f => existsSync(f));
  const rows = sheets.flatMap(f => parseCsv(readFileSync(f, "utf8")));
  const app = JSON.parse(readFileSync(resolve(o.app || rel(APP_FILE)), "utf8")), clips = loadClips();
  const v = typeof o.variant === "string" ? o.variant : "";
  const res = { human: score(rows, app, clips, { ai: false, variant: v }), ai: score(rows, app, clips, { ai: true, variant: v }) };
  if (v) console.log(`app variant: @${v}`);
  if (o.json) { console.log(JSON.stringify(res, null, 1)); return res; }
  for (const [who, r] of [["HUMAN (final)", res.human], ["AI reviewer (PRELIMINARY — AI vs AI is not ground truth)", res.ai]]) {
    console.log(`\n== reference: ${who}`);
    if (!Object.keys(r).length) { console.log("   no filled rows yet — FINAL accuracy: pending human count"); continue; }
    for (const [id, s] of Object.entries(r)) {
      console.log(`${id} (${s.crowd}; counters: ${s.counters.join(", ")})`);
      console.log(`   whole frame: ${fmtStats(s.frame)}`);
      console.log(`   in zone:     ${fmtStats(s.zone)}`);
      if (s.gapFrame.n) console.log(`   inter-counter gap (frame): mean ${s.gapFrame.meanAbs} people, ${Math.round(100 * s.gapFrame.over10pct)}% of frames > 10 % (adjudicate those)`);
      if (s.line) console.log(`   line: ref in/out ${s.line.refIn}/${s.line.refOut} · app ${s.line.appIn}/${s.line.appOut} · mean |error| per 10 s window ${s.line.absErrPerWindow}`);
    }
  }
  return res;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = args(process.argv.slice(2)), cmd = o._[0];
  const run = { run: cmdRun, frames: cmdFrames, score: cmdScore, template: cmdTemplate }[cmd];
  if (!run) { console.log("usage: node tools/crowd-eval.mjs run|frames|score|template [options] — see the header of this file"); process.exit(cmd ? 2 : 0); }
  Promise.resolve(run(o)).catch(e => { console.error(e && e.stack || e); process.exit(1); });
}
