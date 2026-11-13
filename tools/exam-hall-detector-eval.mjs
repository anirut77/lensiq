#!/usr/bin/env node
// tools/exam-hall-detector-eval.mjs — LENSIQ Exam hall mode: person / phone detector COCO-SSD vs YOLOX-Nano on a locked
// public still-image set (docs/exam/HALL-DETECTOR-RESULTS.md §1, written before this tool was run).
// Runs the hall page's own detector calls (lensiq-detect.js) in headless Chrome, CPU / WASM only (no WebGL, ?cpu).
// Images, per-frame outputs and logs stay OUTSIDE the repo (~/LENSIQ-field/evals/hall-detector/); no image of a person is
// written into the repo.
//   node tools/exam-hall-detector-eval.mjs --select     build manifest.jsonl + CREDITS.tsv, download + resize the images
//   node tools/exam-hall-detector-eval.mjs --run        run every detector key on every frame (+ latency x1 and CPU-throttled 4x)
//   node tools/exam-hall-detector-eval.mjs --from <json> [--md <file>] [--json]   tables + decision of a saved run
//   node tools/exam-hall-detector-eval.mjs --cleanup    delete the images (manifest, credits, results stay)
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { homedir, cpus, totalmem, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { assertLocked, phaseOf } from "./eval-guard.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const E = require("../lensiq-exam.js");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = n => argv.includes(n);
const FIELD = join(homedir(), "LENSIQ-field");
const DIR = resolve(opt("--dir", join(FIELD, "evals", "hall-detector")));
const META = resolve(opt("--meta", join(FIELD, "exam-faces", "meta")));
const OLD = [join(FIELD, "exam-faces", "manifest.jsonl"), join(FIELD, "exam-faces-hall", "manifest.jsonl")];
const IMG = join(DIR, "images");
const OUT = resolve(opt("--out", join(DIR, "results", `halldet-${new Date().toISOString().slice(0, 10)}.json`)));
for (const p of [DIR, OUT]) if ((p + "/").startsWith(repo + "/")) { console.error("exam-hall-detector-eval: data and results must be outside the repo"); process.exit(2); }

/* ---------- fixed protocol (§1) ---------- */
const TARGET = { S: 200, P: 100, E: 100 };
const shaKey = id => createHash("sha256").update(id).digest("hex");
const CC_BY_2 = "https://creativecommons.org/licenses/by/2.0/";
const FW = 1280, FH = 720;
export const KEYS = ["coco", "coco-t2", "yolox", "yolox-t2"];
export const CUT = { det: 0.35, person: 0.4, phone: 0.5 };

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
  const cls = new Map();
  for (const [id, name] of readFileSync(join(META, "oidv7-class-descriptions-boxable.csv"), "utf8").trim().split(/\r?\n/).map(parseCsvLine)) cls.set(name, id);
  const id = n => { const v = cls.get(n); if (!v) throw new Error("class not found: " + n); return v; };
  const PERSON = id("Person"), PHONE = id("Mobile phone");
  const PERS = new Set(["Person", "Man", "Woman", "Boy", "Girl"].map(id));
  const HUMAN = new Set(["Person", "Man", "Woman", "Boy", "Girl", "Doll", "Sculpture", "Bronze sculpture", "Poster"].map(id));
  for (const [n, v] of cls) if (/^Human /.test(n)) HUMAN.add(v);
  const SEAT = new Set(["Chair", "Desk", "Table", "Bench"].map(id));
  const old = new Set();
  for (const f of OLD) if (existsSync(f)) for (const l of readFileSync(f, "utf8").trim().split("\n")) old.add(JSON.parse(l).id);
  const info = new Map();
  for (const r of csvRows(join(META, "validation-images-with-rotation.csv"))) info.set(r.ImageID, r);
  const boxes = new Map();
  for (const r of csvRows(join(META, "validation-annotations-bbox.csv"))) {
    let a = boxes.get(r.ImageID); if (!a) boxes.set(r.ImageID, a = []);
    a.push({ L: r.LabelName, x0: +r.XMin, x1: +r.XMax, y0: +r.YMin, y1: +r.YMax, occ: r.IsOccluded === "1", tr: r.IsTruncated === "1", grp: r.IsGroupOf === "1", dep: r.IsDepiction === "1" });
  }
  const personAbsent = new Set(), phoneAbsent = new Set();
  for (const r of csvRows(join(META, "validation-annotations-human-imagelabels-boxable.csv"))) {
    if (r.Confidence !== "0") continue;
    if (r.LabelName === PERSON) personAbsent.add(r.ImageID);
    if (r.LabelName === PHONE) phoneAbsent.add(r.ImageID);
  }
  const okImage = i => { const r = info.get(i); return r && r.License === CC_BY_2 && (!r.Rotation || +r.Rotation === 0) && !old.has(i); };
  const cand = { S: [], P: [], E: [] };
  for (const [img, bs] of boxes) {
    if (!okImage(img)) continue;
    const pc = bs.filter(b => PERS.has(b.L) && !b.grp && !b.dep), seat = bs.some(b => SEAT.has(b.L));
    if (personAbsent.has(img) && !bs.some(b => HUMAN.has(b.L)) && seat) cand.E.push(img);
    if (pc.length >= 3 && seat) cand.S.push(img);
    if (bs.some(b => b.L === PHONE && !b.grp && !b.dep)) cand.P.push(img);
  }
  for (const g of Object.keys(cand)) cand[g].sort((a, b) => (shaKey(a) < shaKey(b) ? -1 : 1));
  console.log("eligible:", Object.fromEntries(Object.entries(cand).map(([g, a]) => [g, a.length])));
  const rows = [], credits = ["ImageID\tgroup\tauthor\tauthor_url\tlanding\tlicence\ttitle"], taken = new Set();
  let downloads = 0;
  for (const g of ["S", "P", "E"]) {
    let n = 0;
    for (const img of cand[g]) {
      if (n >= TARGET[g]) break;
      if (taken.has(img)) continue;
      const file = join(IMG, img + ".jpg");
      let sz = null;
      try {
        const r = await fetch(`https://open-images-dataset.s3.amazonaws.com/validation/${img}.jpg`);
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer()); downloads++;
        sz = imageSize(buf);
        if (!sz) continue;
        writeFileSync(file, buf);
      } catch { continue; }
      if (Math.max(sz.w, sz.h) > 1280) execFileSync("sips", ["-Z", "1280", file], { stdio: "ignore" });
      taken.add(img); n++;
      const bs = boxes.get(img), r = info.get(img);
      const row = b => [b.x0, b.x1, b.y0, b.y1, b.grp || b.dep ? 1 : 0, b.occ ? 1 : 0, b.tr ? 1 : 0];
      rows.push({ id: img, file: img + ".jpg", group: g, w: sz.w, h: sz.h, phoneAbsent: phoneAbsent.has(img),
        persons: bs.filter(b => PERS.has(b.L)).map(row), phones: bs.filter(b => b.L === PHONE).map(row),
        licence: r.License, author: r.Author, author_url: r.AuthorProfileURL, landing: r.OriginalLandingURL, title: r.Title });
      credits.push([img, g, r.Author, r.AuthorProfileURL, r.OriginalLandingURL, r.License, (r.Title || "").replace(/\s+/g, " ")].join("\t"));
    }
    console.log(`${g}: ${n} / ${TARGET[g]}`);
  }
  for (const f of readdirSync(IMG)) if (!taken.has(f.replace(/\.jpg$/, ""))) rmSync(join(IMG, f));
  writeFileSync(join(DIR, "manifest.jsonl"), rows.map(r => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(DIR, "CREDITS.tsv"), credits.join("\n") + "\n");
  console.log(`manifest: ${rows.length} images (${downloads} downloaded) -> ${join(DIR, "manifest.jsonl")}`);
}

/* ---------- in-page part (runs on exam-hall.html?cpu inside headless Chrome) ---------- */
async function PAGE_LIB(FW, FH, CUT) {
  const load = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
  if (!window.ort) await load("vendor/ort/ort.wasm.min.js");
  const D = window.LQDetect;
  const bk = await D.tfBackend();
  const coco = await D.loadCoco("vendor/models/cocossd/model.json"), yolox = await D.loadYolox();
  const T2 = { cols: 2, rows: 2, overlap: 0.2 };
  // exactly the hall page's call (exam-hall.js detect()) and the zone pages' YOLOX call with the same cuts
  const CALL = {
    coco: c => D.detectCoco(coco, c, { classes: [0, 76], minScore: CUT.det, max: 40 }),
    "coco-t2": c => D.detectCoco(coco, c, { classes: [0, 76], minScore: CUT.det, max: 40, tiles: T2 }),
    yolox: c => D.detectPeople(yolox, c, { classes: [0, 67], minScore: CUT.det, max: 40, detW: 416, split: "auto" }),
    "yolox-t2": c => D.detectPeople(yolox, c, { classes: [0, 67], minScore: CUT.det, max: 40, detW: 416, split: "auto", tiles: T2 })
  };
  const PHONE = { coco: 76, "coco-t2": 76, yolox: 67, "yolox-t2": 67 };
  async function frame(data) {
    const img = new Image(); img.src = "data:image/jpeg;base64," + data; await img.decode();
    const c = document.createElement("canvas"); c.width = FW; c.height = FH;
    const g = c.getContext("2d"); g.fillStyle = "#808080"; g.fillRect(0, 0, FW, FH);
    const s = Math.min(FW / img.naturalWidth, FH / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s, ox = (FW - w) / 2, oy = (FH - h) / 2;
    g.drawImage(img, ox, oy, w, h);
    return { c, map: b => ({ x: ox + b[0] * w, y: oy + b[2] * h, w: (b[1] - b[0]) * w, h: (b[3] - b[2]) * h, ign: !!b[4] }) };
  }
  const r1 = v => Math.round(v * 10) / 10;
  const px = d => ({ x: r1(d.x * FW), y: r1(d.y * FH), w: r1(d.w * FW), h: r1(d.h * FH), s: Math.round(d.score * 1000) / 1000 });
  window.__hd = {
    backend: bk,
    one: async (data, persons, phones) => {
      const fr = await frame(data);
      const out = { persons: persons.map(fr.map), phones: phones.map(fr.map), det: {} };
      for (const [k, f] of Object.entries(CALL)) {
        const d = await f(fr.c);
        out.det[k] = { p: d.filter(b => b.cls === 0 && b.score >= CUT.person).map(px), ph: d.filter(b => b.cls === PHONE[k] && b.score >= CUT.phone).map(px) };
      }
      return out;
    },
    latency: async datas => {
      const frames = []; for (const d of datas) frames.push((await frame(d)).c);
      const out = {};
      for (const [k, f] of Object.entries(CALL)) {
        await f(frames[0]); const ms = [];
        for (const c of frames) { const t0 = performance.now(); await f(c); ms.push(performance.now() - t0); }
        out[k] = ms;
      }
      return out;
    }
  };
  return { tf: bk, ort: !!window.ort, threads: window.ort.env.wasm.numThreads, isolated: !!window.crossOriginIsolated };
}

const readJsonl = f => readFileSync(f, "utf8").trim().split("\n").map(l => JSON.parse(l));
const limit = (p, ms, what) => Promise.race([p, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(what + " timed out")), ms); t.unref(); })]);

async function run() {
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const { serve } = await import("./static-server.mjs");
  const srv = await serve(repo), browser = await launch();
  const rows = readJsonl(join(DIR, "manifest.jsonl"));
  const out = { tool: "tools/exam-hall-detector-eval.mjs", date: new Date().toISOString(), manifestSha256: createHash("sha256").update(readFileSync(join(DIR, "manifest.jsonl"))).digest("hex"),
    cut: CUT, frame: [FW, FH], machine: {}, frames: [], latency: {} };
  try {
    const p0 = await browser.newPage(null, { isolated: true });
    await limit(p0.goto(`${srv.base}/exam-hall.html?cpu`), 60000, "goto");
    await p0.waitFor("window.LQExam && window.LQDetect", 15000);
    const env = await limit(p0.evaluate(PAGE_LIB, FW, FH, CUT), 180000, "init");
    out.machine = { ...env, ua: await p0.evaluate(() => navigator.userAgent), cpu: cpus()[0] && cpus()[0].model, cores: cpus().length,
      ramGB: Math.round(totalmem() / 1073741824), os: `${platform()} ${release()}` };
    console.log("page:", JSON.stringify(env));
    let k = 0;
    for (const r of rows) {
      const b64 = readFileSync(join(IMG, r.file)).toString("base64");
      const o = await limit(p0.evaluate(async (d, p, ph) => window.__hd.one(d, p, ph), b64, r.persons, r.phones), 300000, "frame " + r.id);
      out.frames.push({ id: r.id, group: r.group, phoneAbsent: r.phoneAbsent, ...o });
      if (++k % 50 === 0) console.log(`  ${k} / ${rows.length}`);
    }
    const lat = rows.filter(r => r.group === "S").slice(0, 40).map(r => readFileSync(join(IMG, r.file)).toString("base64"));
    for (const rate of [1, 4]) {
      await p0.send("Emulation.setCPUThrottlingRate", { rate });
      out.latency["x" + rate] = await limit(p0.evaluate(async d => window.__hd.latency(d), lat), 1800000, "latency");
      console.log(`  latency x${rate} done`);
    }
    await p0.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    if (p0.consoleErrors.length) out.consoleErrors = p0.consoleErrors.map(m => m.text).slice(0, 10);
  } finally { await browser.close(); await srv.close(); }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.log("wrote", OUT);
  return out;
}

/* ---------- metrics (pure) ---------- */
const area = b => b.w * b.h;
export function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1), u = area(a) + area(b) - i;
  return u > 0 ? i / u : 0;
}
/** person ground truth: boxes of different person classes with IoU >= 0.7 are one person; group / depiction / < minH = ignore */
export function personGT(boxes, minH = 24) {
  const gt = [], ign = [];
  for (const b of boxes) {
    if (b.ign || b.h < minH) { ign.push(b); continue; }
    if (gt.some(g => iou(g, b) >= 0.7)) continue;
    gt.push(b);
  }
  return { gt, ign };
}
/** greedy by IoU >= thr -> {hit: Set of gt indices, fp}; unmatched detections on an ignore region (IoU >= 0.3 or centre inside) are not counted */
export function match(dets, gt, ign, thr) {
  const pairs = [];
  dets.forEach((d, i) => gt.forEach((g, j) => { const v = iou(d, g); if (v >= thr) pairs.push([v, i, j]); }));
  pairs.sort((a, b) => b[0] - a[0]);
  const usedD = new Set(), hit = new Set();
  for (const [, i, j] of pairs) { if (usedD.has(i) || hit.has(j)) continue; usedD.add(i); hit.add(j); }
  let fp = 0;
  dets.forEach((d, i) => {
    if (usedD.has(i)) return;
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    if (ign.some(g => iou(d, g) >= 0.3 || (cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h))) return;
    fp++;
  });
  return { hit, fp, tp: hit.size };
}
export const PBANDS = [[24, 72], [72, 144], [144, 288], [288, Infinity]];
export const PHBANDS = [[8, 16], [16, 32], [32, 64], [64, Infinity]];
export function stats(frames, k) {
  const pb = PBANDS.map(() => ({ n: 0, hit: 0 })), phb = PHBANDS.map(() => ({ n: 0, hit: 0 }));
  let fpS = 0, nS = 0, tpS = 0, eN = 0, eFA = 0, eFP = 0, ePh = 0, ePhN = 0;
  for (const f of frames) {
    const d = f.det[k];
    const { gt, ign } = personGT(f.persons);
    const m = match(d.p, gt, ign, 0.5);
    gt.forEach((g, j) => { const i = PBANDS.findIndex(([lo, hi]) => g.h >= lo && g.h < hi); if (i >= 0) { pb[i].n++; if (m.hit.has(j)) pb[i].hit++; } });
    if (f.group === "S") { fpS += m.fp; tpS += m.tp; nS++; }
    if (f.group === "E") { eN++; eFP += d.p.length; if (d.p.length) eFA++; ePhN++; if (d.ph.length) ePh++; }
    if (f.group === "P") {
      const long = b => Math.max(b.w, b.h);
      const pg = f.phones.filter(b => !b.ign && long(b) >= 8), pi = f.phones.filter(b => b.ign || long(b) < 8);
      const mp = match(d.ph, pg, pi, 0.3);
      pg.forEach((g, j) => { const i = PHBANDS.findIndex(([lo, hi]) => long(g) >= lo && long(g) < hi); if (i >= 0) { phb[i].n++; if (mp.hit.has(j)) phb[i].hit++; } });
    }
  }
  const sum = a => a.reduce((x, y) => ({ n: x.n + y.n, hit: x.hit + y.hit }), { n: 0, hit: 0 });
  return { pb, hall: sum(pb.slice(1, 3)), all: sum(pb), phb, phAll: sum(phb), fpS, nS, tpS, fpPerS: fpS / Math.max(1, nS), precS: tpS / Math.max(1, tpS + fpS),
    eN, eFA, eFPper: eFP / Math.max(1, eN), ePh, ePhN };
}
const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
export function decide(out) {
  const S = Object.fromEntries(KEYS.map(k => [k, stats(out.frames, k)]));
  const med = (k, x) => q((out.latency["x" + x] || {})[k] || [], 0.5);
  const r = (a, b) => a.hit / Math.max(1, a.n) - b.hit / Math.max(1, b.n);
  const rules = (after, before, msMax) => {
    const A = S[after], B = S[before];
    return [
      ["1 person recall, hall band 72–288 px", r(A.hall, B.hall) >= 0],
      ["2 person recall, all counted sizes", r(A.all, B.all) >= 0],
      ["3 empty-seat false alarm (E frames with a person)", A.eFA <= B.eFA],
      ["4 false person boxes per S frame", A.fpPerS <= B.fpPerS],
      ["5a phone recall", r(A.phAll, B.phAll) >= 0],
      ["5b phone false alarm on E", A.ePh <= B.ePh],
      [`6 emulated mid-range median ≤ ${msMax} ms`, med(after, 4) <= msMax]
    ];
  };
  const main = rules("yolox", "coco", 500), tiles = rules("yolox-t2", "coco-t2", 1000);
  return { S, med, main, tiles, switchMain: main.every(x => x[1]), switchTiles: tiles.every(x => x[1]) };
}
const pct = x => (100 * x).toFixed(1) + " %";
const rate = (k, n) => { if (!n) return "n = 0"; const w = E.wilson(k, n); return `${k} / ${n} = ${pct(k / n)} [${pct(w.lo)} – ${pct(w.hi)}]`; };
const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : "–");
const bname = b => (b[1] === Infinity ? `≥ ${b[0]}` : `${b[0]} – ${b[1]}`);
function summarise(out) {
  const D = decide(out), L = [];
  const n = g => out.frames.filter(f => f.group === g).length;
  L.push(`Frames: S ${n("S")} · P ${n("P")} · E ${n("E")} (manifest sha256 ${out.manifestSha256}).` +
    " Source of every number: public dataset (Open Images V7 validation, CC BY 2.0 images), not exam-room footage.", "");
  L.push("### Persons (IoU ≥ 0.5; box height in the 1,280 × 720 frame)", "", "| Key | " + PBANDS.map(b => bname(b) + " px").join(" | ") + " | hall band 72 – 288 px | all counted |",
    "|---|" + PBANDS.map(() => "---|").join("") + "---|---|");
  for (const k of KEYS) { const s = D.S[k]; L.push(`| \`${k}\` | ${s.pb.map(x => rate(x.hit, x.n)).join(" | ")} | ${rate(s.hall.hit, s.hall.n)} | ${rate(s.all.hit, s.all.n)} |`); }
  L.push("", "### False alarms", "",
    "| Key | false person boxes per S frame | precision on S | E frames with a person (empty-seat false alarm) | person boxes per E frame |" +
    " E frames with a phone (score ≥ 0.5) |", "|---|---|---|---|---|---|");
  for (const k of KEYS) {
    const s = D.S[k];
    L.push(`| \`${k}\` | ${s.fpPerS.toFixed(3)} (${s.fpS} / ${s.nS}) | ${rate(s.tpS, s.tpS + s.fpS)} | ${rate(s.eFA, s.eN)} |` +
      ` ${s.eFPper.toFixed(3)} | ${rate(s.ePh, s.ePhN)} |`); }
  L.push("", "### Phones (P group, IoU ≥ 0.3, long side in the frame)", "",
    "| Key | " + PHBANDS.map(b => bname(b) + " px").join(" | ") + " | all |", "|---|" + PHBANDS.map(() => "---|").join("") + "---|");
  for (const k of KEYS) { const s = D.S[k]; L.push(`| \`${k}\` | ${s.phb.map(x => rate(x.hit, x.n)).join(" | ")} | ${rate(s.phAll.hit, s.phAll.n)} |`); }
  L.push("", "### Speed (ms per 1,280 × 720 frame, page call, CPU / WASM; first 40 S frames after a warm-up)", "",
    "| Key | x1 median / p90 | fps x1 | x4 (emulated mid-range) median / p90 | fps x4 |", "|---|---|---|---|---|");
  for (const k of KEYS) {
    const a1 = out.latency.x1[k], a4 = out.latency.x4[k];
    L.push(`| \`${k}\` | ${f1(q(a1, 0.5))} / ${f1(q(a1, 0.9))} | ${f1(1000 / q(a1, 0.5))} | ${f1(q(a4, 0.5))} / ${f1(q(a4, 0.9))} | ${f1(1000 / q(a4, 0.5))} |`);
  }
  L.push("", "### Decision rule (§1.5)", "", "| Rule | `yolox` vs `coco` | `yolox-t2` vs `coco-t2` |", "|---|---|---|");
  D.main.forEach((x, i) => L.push(`| ${x[0]} | ${x[1] ? "pass" : "**fail**"} | ${D.tiles[i][1] ? "pass" : "**fail**"} |`));
  L.push("", `Result: default ${D.switchMain ? "**switch to YOLOX-Nano**" : "**keep COCO-SSD**"} · tiles option ${D.switchTiles ? "**switch to YOLOX-Nano**" : "**keep COCO-SSD**"}`);
  L.push("", "Machine: " + JSON.stringify(out.machine));
  return { text: L.join("\n"), D };
}

const main = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (main) {
  if (has("--select")) await select();
  else if (has("--cleanup")) {
    if (existsSync(IMG)) {
      const n = readdirSync(IMG).length; rmSync(IMG, { recursive: true, force: true });
      console.log(`deleted ${n} images in ${IMG} (manifest.jsonl, CREDITS.tsv and results/ kept)`);
    } else console.log("no images to delete");
  } else if (has("--run") || has("--from")) {
    // eval-guard (owner rule 2026-11-13): the locked manifest must be in ~/LENSIQ-field/evals/<phase>/ and committed in evals-locks/.
    // The images share one aggregate hash (the images folder) and are deleted after the run; manifest.jsonl names them.
    try {
      const g = assertLocked(phaseOf(DIR), ["manifest.jsonl"]);
      console.error(`eval-guard OK: phase ${g.phase}, manifest.jsonl ${g.files[0].sha256} in ${g.lockFile} (commit ${g.lockCommit})`);
    } catch (e) { console.error(String(/** @type {any} */ (e).message || e)); process.exit(2); }
    const out = has("--from") ? JSON.parse(readFileSync(resolve(opt("--from")), "utf8")) : await run();
    const s = summarise(out);
    console.log(s.text);
    if (opt("--md")) writeFileSync(resolve(opt("--md")), s.text + "\n");
  } else console.log("usage: --select | --run | --from <json> [--md <file>] | --cleanup");
  process.exit(0);
}
