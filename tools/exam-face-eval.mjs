#!/usr/bin/env node
// tools/exam-face-eval.mjs — LENSIQ Exam face engine: OLD (face-api.js TinyFaceDetector + 68 landmarks) vs NEW (MediaPipe
// Face Landmarker) on the fixed test set of docs/exam/FACE-ENGINE-RESULTS.md §1 (written before this tool was run).
// Runs the SAME engine code the Exam lab page runs (lensiq-exam-face.js: createFaceApi = the research-demo path, identical
// to exam-lab on main; createMediaPipe = the new default) in headless Chrome with WebGL (SwiftShader; MediaPipe needs it).
// Images, renders and per-frame outputs stay OUTSIDE the repo (~/LENSIQ-field/exam-faces/); no image of a person is ever
// written into the repo.
//
//   node tools/exam-face-eval.mjs --select            build manifest.jsonl + CREDITS.tsv and download the images
//   node tools/exam-face-eval.mjs --run [--limit N]   run both engines on every frame + the head-turn renders
//   node tools/exam-face-eval.mjs --from <json>       print the tables of a saved run (no browser)
//   node tools/exam-face-eval.mjs --cleanup           delete the downloaded images (manifest, credits, results stay)
//   --dir <path> (default ~/LENSIQ-field/exam-faces) · --out <json> (default <dir>/eval/examface-<date>.json)
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync } from "node:fs";
import { homedir, tmpdir, cpus, totalmem, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const E = require("../lensiq-exam.js");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = n => argv.includes(n);
const DIR = resolve(opt("--dir", join(homedir(), "LENSIQ-field", "exam-faces")));
const IMG = join(DIR, "images"), META = join(DIR, "meta");
const OUT = resolve(opt("--out", join(DIR, "eval", `examface-${new Date().toISOString().slice(0, 10)}.json`)));
const LIMIT = +opt("--limit", 0) || 0;
for (const p of [DIR, OUT]) if ((p + "/").startsWith(repo + "/")) { console.error("exam-face-eval: data and results must be outside the repo"); process.exit(2); }

/* ---------- fixed protocol (§1) ---------- */
const FW = 640, FH = 480, MIN_FACE = 24;
const TARGET = { R0: 60, R1: 60, R2: 40, R3: 30, R4: 30 };
const THRESHOLDS = [0.3, 0.4, 0.5];
const POSES = [...[0, -15, 15, -30, 30, -45, 45, -60, 60].map(y => ({ yaw: y, pitch: 0 })), ...[10, 20, 30, 45].map(p => ({ yaw: 0, pitch: p }))];
const split = id => (/^[0-7]/.test(createHash("sha256").update("lensiq-examface:" + id).digest("hex")) ? "dev" : "held-out");
const shaKey = id => createHash("sha256").update(id).digest("hex");
const CC_BY_2 = "https://creativecommons.org/licenses/by/2.0/";

/* ---------- CSV ---------- */
function parseCsvLine(l) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out;
}
function* csvRows(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const head = parseCsvLine(lines[0]);
  for (let i = 1; i < lines.length; i++) { if (!lines[i]) continue; const v = parseCsvLine(lines[i]); const o = {}; head.forEach((h, j) => { o[h] = v[j]; }); yield o; }
}

/* ---------- JPEG size (SOF marker) ---------- */
function imageSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

/* ---------- --select ---------- */
async function select() {
  mkdirSync(IMG, { recursive: true });
  const cls = new Map(); // the class file has no header row
  const raw = readFileSync(join(META, "oidv7-class-descriptions-boxable.csv"), "utf8").trim().split(/\r?\n/).map(parseCsvLine);
  for (const [id, name] of raw) cls.set(name, id);
  const id = n => { const v = cls.get(n); if (!v) throw new Error("class not found: " + n); return v; };
  const FACE = id("Human face"), GLASSES = id("Glasses"), SUNGLASSES = id("Sunglasses"), PERSON = id("Person");
  const HUMAN = new Set(["Person", "Man", "Woman", "Boy", "Girl", "Doll", "Sculpture", "Bronze sculpture", "Poster"].map(id));
  for (const [n, v] of cls) if (/^Human /.test(n)) HUMAN.add(v);
  const INDOOR = new Set(["Desk", "Table", "Coffee table", "Kitchen & dining room table", "Laptop", "Computer monitor", "Television", "Tablet computer",
    "Mobile phone", "Book", "Bookcase", "Chair", "Office supplies"].map(id));
  const info = new Map();
  for (const r of csvRows(join(META, "validation-images-with-rotation.csv"))) info.set(r.ImageID, r);
  const boxes = new Map();
  for (const r of csvRows(join(META, "validation-annotations-bbox.csv"))) {
    let a = boxes.get(r.ImageID); if (!a) boxes.set(r.ImageID, a = []);
    a.push({ L: r.LabelName, x0: +r.XMin, x1: +r.XMax, y0: +r.YMin, y1: +r.YMax, group: r.IsGroupOf === "1", dep: r.IsDepiction === "1" });
  }
  const personAbsent = new Set();
  for (const r of csvRows(join(META, "validation-annotations-human-imagelabels-boxable.csv"))) if (r.LabelName === PERSON && r.Confidence === "0") personAbsent.add(r.ImageID);
  const okImage = i => { const r = info.get(i); return r && r.License === CC_BY_2 && (!r.Rotation || +r.Rotation === 0); };
  const cand = { R0: [], R1: [], R2: [], R3: [], R4: [] };
  for (const [img, bs] of boxes) {
    if (!okImage(img)) continue;
    const faces = bs.filter(b => b.L === FACE);
    if (!faces.length) {
      if (personAbsent.has(img) && !bs.some(b => HUMAN.has(b.L)) && bs.some(b => INDOOR.has(b.L))) cand.R0.push(img);
      continue;
    }
    if (faces.some(b => b.group || b.dep)) continue;
    const glassIn = (f, L) => bs.some(b => L.includes(b.L) && (b.x0 + b.x1) / 2 >= f.x0 && (b.x0 + b.x1) / 2 <= f.x1 && (b.y0 + b.y1) / 2 >= f.y0 && (b.y0 + b.y1) / 2 <= f.y1);
    if (faces.length >= 2) cand.R2.push(img);
    else {
      const f = faces[0];
      if (glassIn(f, [GLASSES])) cand.R3.push(img);
      else if (!glassIn(f, [GLASSES, SUNGLASSES])) { cand.R1.push(img); cand.R4.push(img); }
    }
  }
  for (const g of Object.keys(cand)) cand[g].sort((a, b) => (shaKey(a) < shaKey(b) ? -1 : 1));
  console.log("eligible before the size rule:", Object.fromEntries(Object.entries(cand).map(([g, a]) => [g, a.length])));
  // image size is only known after download: the size rule (§1.2) is checked then, in hash order
  const rows = [], credits = ["ImageID\tgroup\tsplit\tauthor\tauthor_url\tlanding\tlicence\ttitle"];
  const taken = new Set();
  for (const g of ["R0", "R2", "R3", "R1", "R4"]) {
    let n = 0;
    for (const img of cand[g]) {
      if (n >= TARGET[g]) break;
      if (taken.has(img)) continue;
      const fs = (boxes.get(img) || []).filter(b => b.L === FACE);
      // cheap pre-check before downloading (frame width >= relative width * 640 at best)
      if (g === "R1" && !fs.every(f => f.x1 - f.x0 >= 0.12 * 0.75)) continue;
      if (g === "R4" && !fs.every(f => f.x1 - f.x0 <= 0.2)) continue;
      const file = join(IMG, img + ".jpg");
      if (!existsSync(file)) {
        try {
          const r = await fetch(`https://open-images-dataset.s3.amazonaws.com/validation/${img}.jpg`);
          if (!r.ok) continue;
          writeFileSync(file, Buffer.from(await r.arrayBuffer()));
        } catch { continue; }
      }
      const sz = imageSize(readFileSync(file));
      if (!sz) { rmSync(file); continue; }
      const s = Math.min(FW / sz.w, FH / sz.h);
      const fw = fs.map(f => (f.x1 - f.x0) * sz.w * s);
      let ok = true;
      if (g === "R1") ok = fw[0] >= 0.12 * FW && fw[0] <= 0.6 * FW;
      if (g === "R2") ok = fw.filter(w => w >= MIN_FACE).length >= 2 && Math.max(...fw) >= 48;
      if (g === "R3") ok = fw[0] >= 48;
      if (g === "R4") ok = fw[0] >= MIN_FACE && fw[0] <= 48;
      if (!ok) { rmSync(file); continue; }
      taken.add(img); n++;
      const r = info.get(img);
      rows.push({ id: img, file: img + ".jpg", group: g, split: split(img), w: sz.w, h: sz.h, faces: fs.map(f => [f.x0, f.x1, f.y0, f.y1]),
        licence: r.License, author: r.Author, author_url: r.AuthorProfileURL, landing: r.OriginalLandingURL, title: r.Title });
      credits.push([img, g, split(img), r.Author, r.AuthorProfileURL, r.OriginalLandingURL, r.License, (r.Title || "").replace(/\s+/g, " ")].join("\t"));
    }
    console.log(`${g}: ${n} / ${TARGET[g]}`);
  }
  // files downloaded for a group but rejected by the size rule were removed above
  for (const f of readdirSync(IMG)) if (!taken.has(f.replace(/\.jpg$/, ""))) rmSync(join(IMG, f));
  writeFileSync(join(DIR, "manifest.jsonl"), rows.map(r => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(DIR, "CREDITS.tsv"), credits.join("\n") + "\n");
  console.log(`manifest: ${rows.length} images -> ${join(DIR, "manifest.jsonl")}`);
}

/* ---------- --run ---------- */
const readJsonl = f => readFileSync(f, "utf8").trim().split("\n").map(l => JSON.parse(l));
const limit = (p, ms, what) => Promise.race([p, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(what + " timed out")), ms); t.unref(); })]);

async function run() {
  const realChrome = process.env.LQ_CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => existsSync(p));
  const wrapDir = mkdtempSync(join(tmpdir(), "lq-examface-"));
  const wrapper = join(wrapDir, "chrome-webgl.sh");
  writeFileSync(wrapper, ["#!/bin/bash", "args=()",
    `for a in "$@"; do case "$a" in --disable-webgl|--disable-3d-apis|--disable-gpu) ;; *) args+=("$a");; esac; done`,
    `exec ${JSON.stringify(realChrome)} --use-angle=swiftshader --enable-unsafe-swiftshader "\${args[@]}"`, ""].join("\n"));
  chmodSync(wrapper, 0o755);
  process.env.LQ_CHROME = wrapper;
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const { serve } = await import("./static-server.mjs");
  const { PAGE_LIB } = await import("./exam-face-page.mjs");
  let rows = readJsonl(join(DIR, "manifest.jsonl"));
  if (LIMIT) rows = rows.filter((r, i) => i % Math.max(1, Math.floor(rows.length / LIMIT)) === 0).slice(0, LIMIT);
  const PARTIAL = OUT + ".partial";
  const out = has("--resume") && existsSync(PARTIAL) ? JSON.parse(readFileSync(PARTIAL, "utf8"))
    : { tool: "tools/exam-face-eval.mjs", date: new Date().toISOString(), machine: {}, thresholds: THRESHOLDS, poses: POSES, frames: [], renders: [], latency: {} };
  const checkpoint = () => { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(PARTIAL, JSON.stringify(out)); };
  const srv = await serve(repo);
  const browser = await launch();
  try {
    const page0 = await browser.newPage(null, { isolated: true });
    const page = { goto: u => limit(page0.goto(u), 60000, "goto"), waitFor: (x, ms) => page0.waitFor(x, ms), evaluate: (...a) => limit(page0.evaluate(...a), 300000, "evaluate") };
    await page.goto(`${srv.base}/exam-dashboard.html`);
    await page.waitFor("window.LQExam", 15000);
    await page.evaluate(PAGE_LIB);
    const init = await page.evaluate(async th => window.__ef.init(th), THRESHOLDS);
    console.log("engines:", JSON.stringify(init));
    out.machine = { ...(await page.evaluate(() => ({ ua: navigator.userAgent, webgl2: !!document.createElement("canvas").getContext("webgl2") }))),
      cpu: cpus()[0] && cpus()[0].model, cores: cpus().length, ramGB: Math.round(totalmem() / 1073741824), os: `${platform()} ${release()}`, oldBackend: init.oldBackend };
    const done = new Set(out.frames.map(f => f.key));
    const doneR = new Set(out.renders.map(r => r.base));
    // F: fake-camera frames (synthetic, no download)
    for (let i = 0; i < 20; i++) {
      const key = "F" + i; if (done.has(key)) continue;
      const o = await page.evaluate(async i => window.__ef.fake(i), i);
      out.frames.push({ key, id: key, group: "F", split: i % 2 ? "held-out" : "dev", gt: [], ignore: [], ...o });
    }
    let k = 0;
    for (const r of rows) {
      const b64 = readFileSync(join(IMG, r.file)).toString("base64");
      const variants = r.group === "R1" ? ["R1", "D1", "D2"] : [r.group];
      for (const v of variants) {
        const key = v + ":" + r.id; if (done.has(key)) continue;
        const o = await page.evaluate(async (data, v, faces, id) => window.__ef.frame(data, v, faces, id), b64, v, r.faces, r.id);
        out.frames.push({ key, id: r.id, group: v, split: r.split, ...o });
      }
      if (r.group === "R1" && !doneR.has(r.id)) {
        const o = await page.evaluate(async (data, poses) => window.__ef.renders(data, poses), b64, POSES);
        out.renders.push({ base: r.id, split: r.split, ...o });
      }
      if (++k % 10 === 0) { checkpoint(); console.log(`  ${k} / ${rows.length} images`); }
    }
    // latency on WASM (no WebGL) for OLD: the same dev R1 frames again with face-api on the wasm backend
    const wasmSet = rows.filter(r => r.group === "R1" && r.split === "dev").slice(0, 30).map(r => readFileSync(join(IMG, r.file)).toString("base64"));
    const lat = await page.evaluate(async (datas) => window.__ef.wasmLatency(datas), wasmSet);
    out.latency.oldWasm = lat;
    checkpoint();
  } finally { await browser.close(); }
  writeFileSync(OUT, JSON.stringify(out));
  console.log("wrote", OUT);
  return out;
}

/* ---------- metrics ---------- */
function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1), u = a.w * a.h + b.w * b.h - inter;
  return u > 0 ? inter / u : 0;
}
/** greedy IoU >= 0.3 matching -> {tp, fp, onIgnore, count (detections minus those on ignore boxes)} */
function score(dets, gt, ignore) {
  const pairs = [];
  dets.forEach((d, i) => {
    if (!d.box) return;
    gt.forEach((g, j) => { const v = iou(d.box, g); if (v >= 0.3) pairs.push([v, i, "g", j]); });
    ignore.forEach((g, j) => { const v = iou(d.box, g); if (v >= 0.3) pairs.push([v, i, "i", j]); });
  });
  pairs.sort((a, b) => b[0] - a[0]);
  const usedD = new Set(), usedG = new Set(), usedI = new Set();
  let tp = 0, onIgnore = 0;
  for (const [, i, t, j] of pairs) {
    if (usedD.has(i)) continue;
    if (t === "g" && !usedG.has(j)) { usedD.add(i); usedG.add(j); tp++; }
    else if (t === "i" && !usedI.has(j)) { usedD.add(i); usedI.add(j); onIgnore++; }
  }
  const fp = dets.length - tp - onIgnore;
  return { tp, fp, onIgnore, count: dets.length - onIgnore };
}
const cls3 = n => (n <= 0 ? 0 : n === 1 ? 1 : 2);
const pct = x => (100 * x).toFixed(1) + " %";
const rate = (k, n) => { if (!n) return "n = 0"; const w = E.wilson(k, n); return `${k} / ${n} = ${pct(k / n)} [${pct(w.lo)} – ${pct(w.hi)}]`; };
const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const mean = a => { const s = a.filter(Number.isFinite); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : NaN; };
const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : "–");

/** engine accessor: "old" or "new@0.4" -> faces of a frame */
const facesOf = (fr, eng) => (eng === "old" ? fr.old.faces : fr.new[eng.split("@")[1]].faces);
function detStats(frames, eng) {
  let gtN = 0, tp = 0, fp = 0, fpFrames = 0, ok3 = 0, nofaceFA = 0, nofaceDen = 0, multiFA = 0, multiDen = 0, multiHit = 0, multiN = 0, present = 0, presentDen = 0;
  for (const fr of frames) {
    const s = score(facesOf(fr, eng), fr.gt, fr.ignore);
    gtN += fr.gt.length; tp += s.tp; fp += s.fp; if (s.fp > 0) fpFrames++;
    if (cls3(s.count) === cls3(fr.gt.length)) ok3++;
    if (fr.gt.length >= 1) { nofaceDen++; if (s.count === 0) nofaceFA++; }
    if (fr.gt.length <= 1) { multiDen++; if (s.count >= 2) multiFA++; }
    if (fr.gt.length >= 2) { multiN++; if (s.count >= 2) multiHit++; }
    if (fr.gt.length === 0) { presentDen++; if (s.count >= 1) present++; }
  }
  return { n: frames.length, gtN, tp, fp, fpFrames, ok3, nofaceFA, nofaceDen, multiFA, multiDen, multiHit, multiN, present, presentDen };
}
const poseOf = (f, eng) => (eng === "old" ? f : eng.endsWith(":m68") ? f.m68 : f.mx);
function turnStats(renders, eng) {
  // eng = "old" | "new@0.5:mx" | "new@0.5:m68"
  const [e0, mode] = eng.split(":");
  let cls = 0, clsN = 0, cover = 0, total = 0;
  const yawErr = [], pitchErr = [];
  for (const r of renders) {
    if (!r.poses) continue;
    const get = p => { const fs = e0 === "old" ? p.old.faces : p.new[e0.split("@")[1]].faces; return fs.length === 1 ? poseOf(fs[0], mode ? "x:" + mode : "old") : null; };
    const base = get(r.poses[0]);
    for (const p of r.poses) {
      total++;
      const gtTurned = Math.abs(p.yaw) >= 45 || p.pitch >= 45, gtNot = Math.abs(p.yaw) <= 15 && p.pitch <= 10;
      const f = base ? get(p) : null;
      if (f && Number.isFinite(f.yaw)) cover++;
      let turned = null;
      if (base && f && Number.isFinite(f.yaw) && Number.isFinite(base.yaw)) {
        const dy = f.yaw - base.yaw, dp = E.pitchDeg(f.pitchN, base.pitchN);
        turned = Math.abs(dy) > 35 || dp > 25;
        if (p.pitch === 0 && p.yaw !== 0) yawErr.push(Math.abs(dy - p.yaw));
        if (p.pitch > 0) pitchErr.push(Math.abs(dp - p.pitch));
      }
      if (gtTurned || gtNot) { clsN++; if (turned != null && turned === gtTurned) cls++; }
    }
  }
  return { cls, clsN, cover, total, yawMed: q(yawErr, 0.5), yawP90: q(yawErr, 0.9), yawMean: mean(yawErr),
    pitchMed: q(pitchErr, 0.5), pitchMean: mean(pitchErr), nYaw: yawErr.length, nPitch: pitchErr.length };
}
function summarise(out) {
  const L = [];
  const GROUPS = ["R0", "F", "R1", "R2", "R3", "R4", "D1", "D2"];
  const NEWS = THRESHOLDS.map(t => "new@" + t);
  const pick = {};
  // 1. detection confidence, dev only
  const dev = out.frames.filter(f => f.split === "dev"), held = out.frames.filter(f => f.split === "held-out");
  const oldDev = detStats(dev, "old");
  L.push("## Sweep (dev)", "", "| Engine | face count 0/1/2+ correct | face present on a no-face frame | detection recall | frames with a false positive |", "|---|---|---|---|---|");
  for (const e of ["old", ...NEWS]) { const s = detStats(dev, e); L.push(`| ${e} | ${rate(s.ok3, s.n)} | ${rate(s.present, s.presentDen)} | ${rate(s.tp, s.gtN)} | ${rate(s.fpFrames, s.n)} |`); }
  const okT = NEWS.map(e => [e, detStats(dev, e)]).filter(([, s]) => s.present / s.presentDen <= oldDev.present / oldDev.presentDen);
  okT.sort((a, b) => b[1].ok3 - a[1].ok3 || +b[0].split("@")[1] - +a[0].split("@")[1]);
  pick.det = (okT[0] || [NEWS[NEWS.length - 1]])[0];
  const devR = out.renders.filter(r => r.split === "dev"), heldR = out.renders.filter(r => r.split === "held-out");
  L.push("", `Pick (detection, rule §1.7.1): **${pick.det}**`, "",
    "| Pose | head-turn class correct (dev) | coverage | yaw error median / p90 / mean | pitch error median / mean |", "|---|---|---|---|---|");
  const poseCands = [pick.det + ":mx", pick.det + ":m68"];
  const ps = poseCands.map(e => [e, turnStats(devR, e)]);
  for (const [e, s] of [["old", turnStats(devR, "old")], ...ps]) {
    L.push(`| ${e} | ${rate(s.cls, s.clsN)} | ${rate(s.cover, s.total)} | ${f1(s.yawMed)} / ${f1(s.yawP90)} / ${f1(s.yawMean)}° | ${f1(s.pitchMed)} / ${f1(s.pitchMean)}° |`);
  }
  ps.sort((a, b) => b[1].cls / b[1].clsN - a[1].cls / a[1].clsN || a[1].yawMed - b[1].yawMed);
  pick.pose = ps[0][0];
  L.push("", `Pick (pose, rule §1.7.2): **${pick.pose}**`, "");
  // 2. per group, per split
  for (const [name, set] of [["held-out", held], ["dev", dev], ["all", out.frames]]) {
    L.push(`## Detection and count per group (${name})`, "",
      "| Group | Engine | frames | recall | frames with FP (FP total) | count 0/1/2+ correct | no-face false alarm | multi-face false alarm |"
      + " multi-face recall | face on a no-face frame |", "|---|---|---|---|---|---|---|---|---|---|");
    for (const g of [...GROUPS, "ALL"]) {
      const fr = set.filter(f => g === "ALL" || f.group === g);
      if (!fr.length) continue;
      for (const e of ["old", pick.det]) {
        const s = detStats(fr, e);
        const opt = (n, k) => (n ? rate(k, n) : "–");
        L.push(`| ${g} | ${e === "old" ? "OLD" : "NEW"} | ${s.n} | ${opt(s.gtN, s.tp)} | ${rate(s.fpFrames, s.n)} (${s.fp}) | ${rate(s.ok3, s.n)} | `
          + `${opt(s.nofaceDen, s.nofaceFA)} | ${opt(s.multiDen, s.multiFA)} | ${opt(s.multiN, s.multiHit)} | ${opt(s.presentDen, s.present)} |`);
      }
    }
    L.push("");
  }
  for (const [name, set] of [["held-out", heldR], ["dev", devR], ["all", out.renders]]) {
    L.push(`## Head turn (renders, ${name})`, "", "| Engine | class correct | coverage | yaw error median / p90 / mean (n) | pitch error median / mean (n) |", "|---|---|---|---|---|");
    // every pose variant is listed for transparency; the picked one is marked (only dev was used to pick)
    for (const e of ["old", pick.det + ":m68", pick.det + ":mx"]) {
      const s = turnStats(set, e), label = e === "old" ? "OLD" : "NEW " + e + (e === pick.pose ? " (picked)" : " (not picked)");
      L.push(`| ${label} | ${rate(s.cls, s.clsN)} | ${rate(s.cover, s.total)} | ${f1(s.yawMed)} / ${f1(s.yawP90)} / ${f1(s.yawMean)}° (${s.nYaw}) | `
        + `${f1(s.pitchMed)} / ${f1(s.pitchMean)}° (${s.nPitch}) |`);
    }
    // per angle
    const alt = pick.pose.endsWith(":m68") ? pick.det + ":mx" : pick.det + ":m68";
    L.push("", `| Pose | OLD single face | OLD turned | NEW single face | NEW turned | NEW ${alt.split(":")[1]} (not picked) turned |`, "|---|---|---|---|---|---|");
    for (const P of POSES) {
      const row = [];
      for (const e of ["old", pick.pose, alt]) {
        const [e0, mode] = e.split(":");
        let one = 0, tr = 0, n = 0;
        for (const r of set) {
          if (!r.poses) continue;
          const get = p => { const fs = e0 === "old" ? p.old.faces : p.new[e0.split("@")[1]].faces; return fs.length === 1 ? poseOf(fs[0], mode ? "x:" + mode : "old") : null; };
          const b = get(r.poses[0]), p = r.poses.find(x => x.yaw === P.yaw && x.pitch === P.pitch); if (!p) continue;
          n++; const f = b ? get(p) : null; if (f && Number.isFinite(f.yaw)) { one++; if (Math.abs(f.yaw - b.yaw) > 35 || E.pitchDeg(f.pitchN, b.pitchN) > 25) tr++; }
        }
        if (e === alt) row.push(rate(tr, n)); else row.push(rate(one, n), rate(tr, n));
      }
      L.push(`| yaw ${P.yaw}° pitch ${P.pitch}° | ${row.join(" | ")} |`);
    }
    L.push("");
  }
  // 3. latency
  const lat = (fr, e) => fr.map(f => (e === "old" ? f.old.ms : f.new[e.split("@")[1]].ms)).filter(Number.isFinite);
  const allR = out.frames.filter(f => f.group !== "F");
  L.push("## Latency per 640 × 480 frame (ms, after warm-up)", "", "| Engine | n | median | p90 |", "|---|---|---|---|");
  for (const e of ["old", pick.det]) {
    const a = lat(allR, e), label = e === "old" ? "OLD face-api (" + out.machine.oldBackend + ")" : "NEW MediaPipe CPU delegate";
    L.push(`| ${label} | ${a.length} | ${f1(q(a, 0.5))} | ${f1(q(a, 0.9))} |`);
  }
  if (out.latency.oldWasm) L.push(`| OLD face-api (wasm, no WebGL) | ${out.latency.oldWasm.ms.length} | ${f1(q(out.latency.oldWasm.ms, 0.5))} | ${f1(q(out.latency.oldWasm.ms, 0.9))} |`);
  const skips = out.renders.filter(r => !r.poses).reduce((a, r) => { a[r.skip] = (a[r.skip] || 0) + 1; return a; }, {});
  L.push("", `Renders: ${out.renders.length} bases tried, ${out.renders.filter(r => r.poses).length} usable (near-frontal mesh found by NEW @0.5); reasons: ${JSON.stringify(skips)}`);
  L.push("", "Machine: " + JSON.stringify(out.machine));
  return { text: L.join("\n"), pick };
}

if (has("--select")) await select();
else if (has("--cleanup")) {
  if (existsSync(IMG)) rmSync(IMG, { recursive: true, force: true });
  console.log("deleted", IMG, "(manifest.jsonl, CREDITS.tsv and eval/ kept)");
} else if (has("--run") || has("--from")) {
  const out = has("--from") ? JSON.parse(readFileSync(resolve(opt("--from")), "utf8")) : await run();
  const s = summarise(out);
  console.log(s.text);
  if (opt("--md")) writeFileSync(resolve(opt("--md")), s.text + "\n");
} else { console.log("usage: --select | --run [--limit N] [--resume] | --from <json> [--md <file>] | --cleanup"); }
process.exit(0);
