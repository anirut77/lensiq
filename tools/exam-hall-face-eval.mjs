#!/usr/bin/env node
// tools/exam-hall-face-eval.mjs — LENSIQ Exam follow-ups (docs/exam/FACE-ENGINE-RESULTS.md §6, written before this tool):
//   hall: small faces in a 1280 x 720 hall view — (a) Face Landmarker, (b) BlazeFace full-range, (c) tiles, (d) tiles + full-range
//   lab:  a second person behind / beside the candidate — OLD vs N1 – N5
// Runs the page's own code (lensiq-exam-face.js, lensiq-detect.js) in headless Chrome with SwiftShader WebGL.
// Images and per-frame outputs stay OUTSIDE the repo (~/LENSIQ-field/exam-faces-hall/); no image of a person is written
// into the repo.
//   node tools/exam-hall-face-eval.mjs --select     build manifest.jsonl + CREDITS.tsv, download + resize the images
//   node tools/exam-hall-face-eval.mjs --run        run every option (+ latency unthrottled and CPU-throttled 4x)
//   node tools/exam-hall-face-eval.mjs --from <json> [--md <file>]   tables of a saved run
//   node tools/exam-hall-face-eval.mjs --cleanup    delete the images (manifest, credits, results stay)
//   node tools/exam-hall-face-eval.mjs --load-check loads the full-range detector once in headless Chrome (no images needed)
// The measurement-only files (MediaPipe Tasks Vision 1.2.2 + BlazeFace full-range, both Apache-2.0, 15.5 MiB) are NOT in
// the repo (owner decision 2026-11-10, docs/exam/FACE-ENGINE-RESULTS.md §7.3). --run and --load-check read them from
//   --vendor <dir>  or  LQ_EXAM_EVAL_VENDOR=<dir>   (default ~/LENSIQ-field/evals/exam-followups/vendor)
// and stop with an error when a file is missing or its sha256 differs.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync } from "node:fs";
import { homedir, tmpdir, cpus, totalmem, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const E = require("../lensiq-exam.js");
const XF = require("../lensiq-exam-face.js");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = n => argv.includes(n);
const DIR = resolve(opt("--dir", join(homedir(), "LENSIQ-field", "exam-faces-hall")));
const META = resolve(opt("--meta", join(homedir(), "LENSIQ-field", "exam-faces", "meta")));
const OLD_MANIFEST = join(homedir(), "LENSIQ-field", "exam-faces", "manifest.jsonl");
const IMG = join(DIR, "images");
const OUT = resolve(opt("--out", join(DIR, "results", `examhall-${new Date().toISOString().slice(0, 10)}.json`)));
for (const p of [DIR, OUT]) if ((p + "/").startsWith(repo + "/")) { console.error("exam-hall-face-eval: data and results must be outside the repo"); process.exit(2); }

/* ---------- measurement-only files, kept outside the repo (§7.3) ---------- */
const VENDOR = resolve(opt("--vendor", process.env.LQ_EXAM_EVAL_VENDOR || join(homedir(), "LENSIQ-field", "evals", "exam-followups", "vendor")));
const VENDOR_MOUNT = "/__eval-vendor";
const VENDOR_FILES = {
  "mediapipe-1.2.2/vision_bundle.mjs": "b65acb59b370cd6561afd9d04c29ed7a87e7ed6386922ac1b263af1f1ad06b7d",
  "mediapipe-1.2.2/wasm/vision_wasm_internal.js": "f2b9c17131ea79716ec6bf07b117a087b2749a6f8a1e2f1f2e77a9382092db5b",
  "mediapipe-1.2.2/wasm/vision_wasm_internal.wasm": "f5bd25147ac89d506074293ce2675969b10e827180db95a0d9689c2ed80764ab",
  "models/face-detector-full/blaze_face_full_range.tflite": "3698b18f063835bc609069ef052228fbe86d9c9a6dc8dcb7c7c2d69aed2b181b"
};
/** stops the tool (exit 2) unless every measurement-only file is present, outside the repo, with the recorded sha256 */
function checkVendor() {
  const fail = why => {
    console.error(`exam-hall-face-eval: ${why}\n  The measurement-only files (MediaPipe Tasks Vision 1.2.2 + BlazeFace full-range, Apache-2.0) are kept outside the` +
      `\n  repo. Looked in: ${VENDOR}\n  Pass --vendor <dir> or set LQ_EXAM_EVAL_VENDOR; sources and sha256: docs/exam/FACE-ENGINE-RESULTS.md §7.3.`);
    process.exit(2);
  };
  if ((VENDOR + "/").startsWith(repo + "/")) fail("the vendor folder must be outside the repo (these files are not shipped).");
  for (const [f, want] of Object.entries(VENDOR_FILES)) {
    const p = join(VENDOR, f);
    if (!existsSync(p)) fail(`missing file: ${f}`);
    const got = createHash("sha256").update(readFileSync(p)).digest("hex");
    if (got !== want) fail(`sha256 of ${f} is ${got}, expected ${want}`);
  }
}

/* ---------- fixed protocol (§6) ---------- */
const TARGET = { H0: 30, HB: 100, M2: 60, M3: 40, M1: 50 };
const MAX_TOTAL = 280;
const split = id => (/^[0-7]/.test(createHash("sha256").update("lensiq-examhall:" + id).digest("hex")) ? "dev" : "held-out");
const shaKey = id => createHash("sha256").update(id).digest("hex");
const CC_BY_2 = "https://creativecommons.org/licenses/by/2.0/";
const fitW = (w, h, FW, FH) => Math.min(FW / w, FH / h);

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
  const FACE = id("Human face"), PERSON = id("Person");
  const PERS = new Set(["Person", "Man", "Woman", "Boy", "Girl"].map(id));
  const HUMAN = new Set(["Person", "Man", "Woman", "Boy", "Girl", "Doll", "Sculpture", "Bronze sculpture", "Poster"].map(id));
  for (const [n, v] of cls) if (/^Human /.test(n)) HUMAN.add(v);
  const SEAT = new Set(["Chair", "Desk", "Table", "Bench"].map(id));
  const old = new Set(existsSync(OLD_MANIFEST) ? readFileSync(OLD_MANIFEST, "utf8").trim().split("\n").map(l => JSON.parse(l).id) : []);
  const info = new Map();
  for (const r of csvRows(join(META, "validation-images-with-rotation.csv"))) info.set(r.ImageID, r);
  const boxes = new Map();
  for (const r of csvRows(join(META, "validation-annotations-bbox.csv"))) {
    let a = boxes.get(r.ImageID); if (!a) boxes.set(r.ImageID, a = []);
    a.push({ L: r.LabelName, x0: +r.XMin, x1: +r.XMax, y0: +r.YMin, y1: +r.YMax, occ: r.IsOccluded === "1", tr: r.IsTruncated === "1", grp: r.IsGroupOf === "1", dep: r.IsDepiction === "1" });
  }
  const personAbsent = new Set();
  for (const r of csvRows(join(META, "validation-annotations-human-imagelabels-boxable.csv"))) if (r.LabelName === PERSON && r.Confidence === "0") personAbsent.add(r.ImageID);
  const okImage = i => { const r = info.get(i); return r && r.License === CC_BY_2 && (!r.Rotation || +r.Rotation === 0) && !old.has(i); };
  const cand = { H0: [], HB: [], M2: [], M3: [], M1: [] };
  for (const [img, bs] of boxes) {
    if (!okImage(img)) continue;
    const faces = bs.filter(b => b.L === FACE), fc = faces.filter(b => !b.grp && !b.dep);
    if (!faces.length && personAbsent.has(img) && !bs.some(b => HUMAN.has(b.L)) && bs.some(b => SEAT.has(b.L))) { cand.H0.push(img); continue; }
    if (fc.length >= 4 && fc.filter(b => (b.x1 - b.x0) * 1280 >= 16).length >= 3) cand.HB.push(img);
    if (bs.some(b => (b.L === FACE || PERS.has(b.L)) && (b.grp || b.dep))) continue;
    if (!fc.length) continue;
    cand.M2.push(img); cand.M3.push(img); cand.M1.push(img); // exact rules need the image size (checked after download)
  }
  for (const g of Object.keys(cand)) cand[g].sort((a, b) => (shaKey(a) < shaKey(b) ? -1 : 1));
  // cheap pre-checks with the most generous frame width, so few images are downloaded for nothing
  const pre = {
    M2: bs => { const f = bs.filter(b => b.L === FACE); return f.length >= 2 && f.some(b => (b.x1 - b.x0) * 640 >= 0.12 * 640 * 0.75); },
    M3: bs => { const f = bs.filter(b => b.L === FACE); return f.length === 1 && bs.filter(b => PERS.has(b.L)).some(p => { const c = f[0], cx = (c.x0 + c.x1) / 2,
      cy = (c.y0 + c.y1) / 2; return !(cx >= p.x0 && cx <= p.x1 && cy >= p.y0 && cy <= p.y1); }); },
    M1: bs => { const f = bs.filter(b => b.L === FACE); if (f.length !== 1) return false; const c = f[0], cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
      const p = bs.filter(b => PERS.has(b.L)); return p.length >= 1 && p.every(q => cx >= q.x0 && cx <= q.x1 && cy >= q.y0 && cy <= q.y1); }
  };
  console.log("eligible before the size rule:", Object.fromEntries(Object.entries(cand).map(([g, a]) => [g, g in pre ? a.filter(i => pre[g](boxes.get(i))).length : a.length])));
  const rows = [], credits = ["ImageID\tgroup\tsplit\tauthor\tauthor_url\tlanding\tlicence\ttitle"], taken = new Set();
  let downloads = 0;
  for (const g of ["H0", "HB", "M2", "M3", "M1"]) {
    let n = 0;
    for (const img of cand[g]) {
      if (n >= TARGET[g] || rows.length >= MAX_TOTAL) break;
      if (taken.has(img)) continue;
      const bs = boxes.get(img);
      if (pre[g] && !pre[g](bs)) continue;
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
      const faces = bs.filter(b => b.L === FACE);
      let ok = false;
      if (g === "H0") ok = true;
      if (g === "HB") {
        const s = fitW(sz.w, sz.h, 1280, 720), w = faces.filter(b => !b.grp && !b.dep).map(b => (b.x1 - b.x0) * sz.w * s);
        ok = w.filter(x => x >= 16 && x <= 64).length >= 3 && w.some(x => x >= 24 && x <= 48);
      }
      if (g[0] === "M") {
        const s = fitW(sz.w, sz.h, 640, 480), fw = b => (b.x1 - b.x0) * sz.w * s;
        const big = faces.filter(b => fw(b) >= 0.12 * 640 && fw(b) <= 0.6 * 640);
        if (big.length === 1) {
          const c = big[0], others = faces.filter(b => b !== c), cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
          const pers = bs.filter(b => PERS.has(b.L)), notC = pers.filter(p => !(cx >= p.x0 && cx <= p.x1 && cy >= p.y0 && cy <= p.y1));
          if (g === "M2") ok = others.length >= 1 && others.every(o => fw(o) < fw(c)) && others.some(o => fw(o) >= 16);
          if (g === "M3") ok = others.length === 0 && notC.length >= 1;
          if (g === "M1") ok = others.length === 0 && pers.length >= 1 && notC.length === 0;
        }
      }
      if (!ok) { rmSync(file); continue; }
      // resize on disk (long side <= 1280); the size rules above used the original size
      if (Math.max(sz.w, sz.h) > 1280) execFileSync("sips", ["-Z", "1280", file], { stdio: "ignore" });
      taken.add(img); n++;
      const r = info.get(img);
      const faceRows = (g === "H0" ? [] : faces).map(b => [b.x0, b.x1, b.y0, b.y1, b.grp || b.dep ? 1 : 0, b.occ ? 1 : 0, b.tr ? 1 : 0]);
      const persons = g[0] === "M" ? bs.filter(b => PERS.has(b.L)).map(b => [b.x0, b.x1, b.y0, b.y1, 0, b.occ ? 1 : 0, b.tr ? 1 : 0]) : [];
      rows.push({ id: img, file: img + ".jpg", group: g, split: split(img), w: sz.w, h: sz.h, faces: faceRows, persons,
        licence: r.License, author: r.Author, author_url: r.AuthorProfileURL, landing: r.OriginalLandingURL, title: r.Title });
      credits.push([img, g, split(img), r.Author, r.AuthorProfileURL, r.OriginalLandingURL, r.License, (r.Title || "").replace(/\s+/g, " ")].join("\t"));
    }
    console.log(`${g}: ${n} / ${TARGET[g]}`);
  }
  for (const f of readdirSync(IMG)) if (!taken.has(f.replace(/\.jpg$/, ""))) rmSync(join(IMG, f));
  writeFileSync(join(DIR, "manifest.jsonl"), rows.map(r => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(DIR, "CREDITS.tsv"), credits.join("\n") + "\n");
  console.log(`manifest: ${rows.length} images (${downloads} downloaded) -> ${join(DIR, "manifest.jsonl")}`);
}

/* ---------- --run ---------- */
const readJsonl = f => readFileSync(f, "utf8").trim().split("\n").map(l => JSON.parse(l));
const limit = (p, ms, what) => Promise.race([p, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(what + " timed out")), ms); t.unref(); })]);
// every hall option x threshold is timed, so the pick rule (§6.5: fps on the emulated laptop) applies to each of them
const HALL_LAT = ["fl4@0.5", "fl4@0.3", "fl8@0.5", "fl8@0.3", ...["short", "full"].flatMap(m => [0.5, 0.3].flatMap(c => [0, 2, 3].map(t => `${m}@${c}:t${t}`)))];

/** headless Chrome with SwiftShader WebGL + the repo served with the outside vendor folder mounted on the same origin */
async function kit() {
  checkVendor();
  const realChrome = process.env.LQ_CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => existsSync(p));
  const wrapDir = mkdtempSync(join(tmpdir(), "lq-examhall-"));
  const wrapper = join(wrapDir, "chrome-webgl.sh");
  writeFileSync(wrapper, ["#!/bin/bash", "args=()",
    `for a in "$@"; do case "$a" in --disable-webgl|--disable-3d-apis|--disable-gpu) ;; *) args+=("$a");; esac; done`,
    `exec ${JSON.stringify(realChrome)} --use-angle=swiftshader --enable-unsafe-swiftshader "\${args[@]}"`, ""].join("\n"));
  chmodSync(wrapper, 0o755);
  process.env.LQ_CHROME = wrapper;
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const { serve } = await import("./static-server.mjs");
  const { PAGE_LIB } = await import("./exam-hall-face-page.mjs");
  return { PAGE_LIB, srv: await serve(repo, { mounts: { [VENDOR_MOUNT]: VENDOR } }), browser: await launch() };
}

/** --load-check: the full-range detector loads from the outside folder and answers on a blank frame (no images needed) */
async function loadCheck() {
  const { PAGE_LIB, srv, browser } = await kit();
  try {
    const page = await browser.newPage(null, { isolated: true });
    await limit(page.goto(`${srv.base}/exam-hall.html`), 60000, "goto");
    await page.waitFor("window.LQExam && window.LQDetect", 15000);
    await page.evaluate(PAGE_LIB, VENDOR_MOUNT);
    const init = await limit(page.evaluate(async () => window.__eh.init(["full@0.5:t0", "fl4@0.5"])), 120000, "init");
    if (!init.fb.includes("full@0.5:t0")) throw new Error("full-range detector did not load");
    console.log(`load-check OK: full-range detector loaded from ${VENDOR} (engines: ${init.fb.concat(init.fl).join(", ")})`);
  } finally { await browser.close(); await srv.close(); }
}

async function run() {
  const { PAGE_LIB, srv, browser } = await kit();
  const rows = readJsonl(join(DIR, "manifest.jsonl"));
  const out = { tool: "tools/exam-hall-face-eval.mjs", date: new Date().toISOString(), machine: {}, hall: [], lab: [], latency: {},
    discarded: "run 1 (16:01): one page with 18 MediaPipe instances, Face Landmarker contexts lost, 0 faces; not used" };
  // one phase per fresh page: Chrome keeps at most 16 live WebGL contexts per page and silently drops the oldest (a first
  // run with all 18 MediaPipe instances + TF.js on one page lost the Face Landmarker contexts: 0 faces everywhere; discarded)
  const PHASES = [["fl4@0.5", "fl4@0.3", "fl8@0.5", "fl8@0.3"],
    ["short@0.5:t0", "short@0.5:t2", "short@0.5:t3", "short@0.3:t0", "short@0.3:t2", "short@0.3:t3", "short@0.5:t2only", "short@0.3:t2only"],
    ["full@0.5:t0", "full@0.5:t2", "full@0.5:t3", "full@0.3:t0", "full@0.3:t2", "full@0.3:t3"], ["coco"]];
  const latRows = rows.filter(r => r.group === "HB").slice(0, 40).map(r => readFileSync(join(IMG, r.file)).toString("base64"));
  const byId = new Map();
  out.latency = { x1: {}, x4: {} };
  try {
    for (const keys of PHASES) {
      const p0 = await browser.newPage(null, { isolated: true });
      const page = { goto: u => limit(p0.goto(u), 60000, "goto"), waitFor: (x, ms) => p0.waitFor(x, ms), evaluate: (...a) => limit(p0.evaluate(...a), 600000, "evaluate"), send: (m,
        p) => p0.send(m, p) };
      await page.goto(`${srv.base}/exam-hall.html`);
      await page.waitFor("window.LQExam && window.LQDetect", 15000);
      await page.evaluate(PAGE_LIB, VENDOR_MOUNT);
      const init = await page.evaluate(async k => window.__eh.init(k), keys);
      console.log("engines:", JSON.stringify(init));
      if (!out.machine.ua) out.machine = { ...(await page.evaluate(() => ({ ua: navigator.userAgent, webgl2: !!document.createElement("canvas").getContext("webgl2") }))),
        cpu: cpus()[0] && cpus()[0].model, cores: cpus().length, ramGB: Math.round(totalmem() / 1073741824), os: `${platform()} ${release()}` };
      if (init.coco) out.machine.tf = init.tf;
      let k = 0;
      for (const r of rows) {
        const b64 = readFileSync(join(IMG, r.file)).toString("base64");
        const hall = r.group === "H0" || r.group === "HB";
        if (!hall && keys.every(x => !["fl4@0.5", "fl4@0.3", "full@0.5:t0", "full@0.3:t0", "short@0.5:t2only", "short@0.3:t2only", "coco"].includes(x))) continue;
        if (hall && keys[0] === "coco") continue;
        const o = hall ? await page.evaluate(async (d, f) => window.__eh.hall(d, f), b64, r.faces)
          : await page.evaluate(async (d, f, p) => window.__eh.lab(d, f, p), b64, r.faces.map(f => f.slice(0, 4)), r.persons.map(p => p.slice(0, 4)));
        let row = byId.get(r.id);
        if (!row) {
          row = hall ? { id: r.id, group: r.group, split: r.split, boxes: o.boxes, fl: {}, fb: {} }
            : { id: r.id, group: r.group, split: r.split, flags: r.faces.map(f => [f[5], f[6]]), faces: o.faces, persons: o.persons, fl: {}, fb: {} };
          byId.set(r.id, row); (hall ? out.hall : out.lab).push(row);
        }
        Object.assign(row.fl, o.fl); Object.assign(row.fb, o.fb); if (o.coco) row.coco = o.coco;
        if (++k % 40 === 0) console.log(`  phase ${keys[0]}: ${k}`);
      }
      // sanity: the desk-distance candidate must be found by the lab engine on most one-person frames (§2: 84.6 %)
      if (keys.includes("fl4@0.5")) {
        const m1 = out.lab.filter(f => f.group === "M1"), found = m1.filter(f => f.fl["fl4@0.5"].d.length >= 1).length;
        console.log(`  sanity: Face Landmarker found the candidate on ${found} / ${m1.length} one-person frames`);
        if (found < m1.length / 2) throw new Error("sanity check failed: the Face Landmarker finds almost no candidate face (lost WebGL context?)");
      }
      const lost = p0.consoleLog.concat(p0.consoleErrors).filter(m => m.text && /WebGL context|CONTEXT_LOST|Too many active/i.test(m.text));
      if (lost.length) throw new Error("WebGL context lost in phase " + keys[0] + ": " + lost[0].text);
      for (const rate of [1, 4]) {
        await page.send("Emulation.setCPUThrottlingRate", { rate });
        Object.assign(out.latency["x" + rate], await page.evaluate(async (d, ks) => window.__eh.latency(d, ks), latRows, HALL_LAT.filter(x => keys.includes(x))));
      }
      await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      console.log(`  phase ${keys[0]} done`);
      await p0.close();
    }
  } finally { await browser.close(); await srv.close(); }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.log("wrote", OUT);
  return out;
}

/* ---------- metrics ---------- */
const area = b => b.w * b.h;
function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1), u = area(a) + area(b) - i;
  return u > 0 ? i / u : 0;
}
/** greedy IoU >= 0.3: -> {hit: Set of gt indices, fp} ; ignore boxes absorb detections (IoU >= 0.3 or centre inside) */
function match(dets, gt, ign) {
  const pairs = [];
  dets.forEach((d, i) => gt.forEach((g, j) => { const v = iou(d.box, g); if (v >= 0.3) pairs.push([v, i, j]); }));
  pairs.sort((a, b) => b[0] - a[0]);
  const usedD = new Set(), hit = new Set();
  for (const [, i, j] of pairs) { if (usedD.has(i) || hit.has(j)) continue; usedD.add(i); hit.add(j); }
  let fp = 0;
  dets.forEach((d, i) => {
    if (usedD.has(i)) return;
    const cx = d.box.x + d.box.w / 2, cy = d.box.y + d.box.h / 2;
    if (ign.some(g => iou(d.box, g) >= 0.3 || (cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h))) return;
    fp++;
  });
  return { hit, fp };
}
const pct = x => (100 * x).toFixed(1) + " %";
const rate = (k, n) => { if (!n) return "n = 0"; const w = E.wilson(k, n); return `${k} / ${n} = ${pct(k / n)} [${pct(w.lo)} – ${pct(w.hi)}]`; };
const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : "–");
const BUCKETS = [[16, 24], [24, 48], [48, 64], [64, Infinity]];
const bname = b => (b[1] === Infinity ? `> ${b[0]}` : `${b[0]} – ${b[1]}`);
const HALL_OPTS = ["fl4@0.5", "fl4@0.3", "fl8@0.5", "fl8@0.3", ...["short", "full"].flatMap(m => [0.5, 0.3].flatMap(c => [0, 2, 3].map(t => `${m}@${c}:t${t}`)))];
const label = k => {
  if (k.startsWith("fl")) return `(a) Face Landmarker numFaces ${k[2]} @${k.split("@")[1]}`;
  const [m, rest] = k.split("@"), [c, t] = rest.split(":t");
  const tl = t === "0" ? "whole frame" : `${t}×${t} tiles + whole`;
  const o = m === "short" ? (t === "0" ? "(a-det) short-range detector" : "(c) short-range") : (t === "0" ? "(b) full-range" : "(d) full-range");
  return `${o}, ${tl} @${c}`;
};
const detsOf = (fr, k) => (k.startsWith("fl") ? fr.fl[k] : fr.fb[k]);
function hallStats(frames, k) {
  const b = BUCKETS.map(() => ({ n: 0, hit: 0 }));
  let fp = 0, fpFrames = 0, fpH0 = 0, h0 = 0;
  for (const fr of frames) {
    const gt = fr.boxes.filter(x => !x.ign && x.w >= 16), ign = fr.boxes.filter(x => x.ign || x.w < 16);
    const m = match(detsOf(fr, k).d, gt, ign);
    gt.forEach((g, j) => { const i = BUCKETS.findIndex(([lo, hi]) => g.w >= lo && g.w < hi); if (i >= 0) { b[i].n++; if (m.hit.has(j)) b[i].hit++; } });
    fp += m.fp; if (m.fp) fpFrames++;
    if (fr.group === "H0") { h0++; fpH0 += m.fp; }
  }
  return { b, fp, fpFrames, n: frames.length, fpPer: fp / Math.max(1, frames.length), fpH0, h0 };
}
function latOf(out, k, x) { const a = out.latency["x" + x] && out.latency["x" + x][k]; return a ? { med: q(a, 0.5), p90: q(a, 0.9), n: a.length } : null; }

/* lab: frame-level ">= 2 people" */
const LAB_OPTS = ["OLD", "N1", "N2@0.5", "N2@0.3", "N3@0.5", "N3@0.3", "N4@0.5", "N4@0.6", "N5"];
// the page's own counting code (LQExamFace.peopleBoxes); the eval detector call uses LAB_PEOPLE.minScore / iou / max
function cocoPersons(fr, s) { return XF.peopleBoxes(fr.coco.d.map(d => ({ box: d.box, score: d.s })), s); }
function labRead(fr, opt) {
  const prim = (opt === "N1" ? fr.fl["fl4@0.3"] : fr.fl["fl4@0.5"]).d;
  if (opt === "OLD" || opt === "N1") return { n: prim.length, ms: 0 };
  if (!prim.length) return { n: 0, ms: 0 };
  const sec = k => XF.addSecondary(prim, fr.fb[k].d.map(d => ({ box: d.box, score: d.s }))).length;
  if (opt.startsWith("N2")) return { n: sec(`full@${opt.split("@")[1]}:t0`), ms: fr.fb[`full@${opt.split("@")[1]}:t0`].ms };
  if (opt.startsWith("N3")) return { n: sec(`short@${opt.split("@")[1]}:t2only`), ms: fr.fb[`short@${opt.split("@")[1]}:t2only`].ms };
  if (opt.startsWith("N4")) return { n: Math.max(prim.length, cocoPersons(fr, +opt.split("@")[1]).length), ms: 0, coco: fr.coco.ms };
  if (opt === "N5") { const a = sec("full@0.5:t0"), c = cocoPersons(fr, 0.6).length; return { n: Math.max(a, c), ms: fr.fb["full@0.5:t0"].ms }; }
  throw new Error(opt);
}
function labStats(frames, opt) {
  let pos = 0, hit = 0, neg = 0, fa = 0; const ms = [];
  for (const fr of frames) {
    const r = labRead(fr, opt); ms.push(r.ms);
    if (fr.group === "M1") { neg++; if (r.n >= 2) fa++; } else { pos++; if (r.n >= 2) hit++; }
  }
  return { pos, hit, neg, fa, ms: q(ms, 0.5) };
}
const secondW = fr => { const c = fr.faces.reduce((a, b) => (b.w > a.w ? b : a), fr.faces[0]); const o = fr.faces.filter(f => f !== c); return o.length ? Math.max(...o.map(f => f.w)) : 0; };

function summarise(out) {
  const L = [], pick = {};
  const devH = out.hall.filter(f => f.split === "dev"), heldH = out.hall.filter(f => f.split === "held-out");
  // hall: dev sweep + pick
  L.push("## Hall options (dev)", "", "| Option | " + BUCKETS.map(b => bname(b) + " px").join(" | ") + " | FP / frame (frames with FP) | H0 FP | ms median x1 / x4 | fps x4 (emulated) |",
    "|---|" + BUCKETS.map(() => "---|").join("") + "---|---|---|---|");
  const cands = [];
  for (const k of HALL_OPTS) {
    const s = hallStats(devH, k), l1 = latOf(out, k, 1), l4 = latOf(out, k, 4), fps4 = l4 ? 1000 / l4.med : NaN;
    L.push(`| ${label(k)} | ${s.b.map(x => rate(x.hit, x.n)).join(" | ")} | ${s.fpPer.toFixed(3)} (${rate(s.fpFrames, s.n)}) | ${s.fpH0} / ${s.h0} | ` +
      `${l1 ? f1(l1.med) : "not timed"} / ${l4 ? f1(l4.med) : "not timed"} | ${f1(fps4)} |`);
    cands.push({ k, r: s.b[1].hit / Math.max(1, s.b[1].n), fpPer: s.fpPer, fps4 });
  }
  const ok = cands.filter(c => Number.isFinite(c.fps4) && c.fps4 >= 5 && c.fpPer <= 0.05);
  ok.sort((a, b) => b.r - a.r || b.fps4 - a.fps4);
  pick.hall = ok.length ? ok[0].k : null;
  L.push("", `Pick (rule §6.5): **${pick.hall ? label(pick.hall) : "none qualifies"}**`, "");
  for (const [name, set] of [["held-out", heldH], ["all", out.hall]]) {
    L.push(`## Hall options (${name})`, "", "| Option | " + BUCKETS.map(b => bname(b) + " px").join(" | ") + " | FP / frame (frames with FP) | H0 FP |",
      "|---|" + BUCKETS.map(() => "---|").join("") + "---|---|");
    for (const k of HALL_OPTS) { const s = hallStats(set, k);
      L.push(`| ${label(k)}${k === pick.hall ? " **(picked)**" : ""} | ${s.b.map(x => rate(x.hit, x.n)).join(" | ")} | ${s.fpPer.toFixed(3)} (${rate(s.fpFrames, s.n)}) | ${s.fpH0} / ${s.h0} |`); }
    L.push("");
  }
  L.push("## Hall speed (ms per 1280 × 720 frame, face pass alone; latency subset n = 40 HB frames)", "",
    "| Option | x1 median / p90 | fps x1 | x4 (emulated mid-range) median / p90 | fps x4 |", "|---|---|---|---|---|");
  for (const k of [...HALL_LAT, "coco"]) {
    const l1 = latOf(out, k, 1), l4 = latOf(out, k, 4); if (!l1) continue;
    L.push(`| ${k === "coco" ? "COCO-SSD persons + phones (hall page call)" : label(k)} | ${f1(l1.med)} / ${f1(l1.p90)} | ${f1(1000 / l1.med)} | ` +
      `${l4 ? f1(l4.med) + " / " + f1(l4.p90) : "–"} | ${l4 ? f1(1000 / l4.med) : "–"} |`);
  }
  L.push("");
  // lab
  const devL = out.lab.filter(f => f.split === "dev"), heldL = out.lab.filter(f => f.split === "held-out");
  const oldDev = labStats(devL, "OLD");
  L.push("## Lab multi-person (dev)", "", "| Option | multi-person recall (M2 + M3) | false alarm (M1) | added ms median |", "|---|---|---|---|");
  const lc = [];
  for (const o of LAB_OPTS) { const s = labStats(devL, o); L.push(`| ${o} | ${rate(s.hit, s.pos)} | ${rate(s.fa, s.neg)} | ${f1(s.ms)} |`); lc.push({ o, s }); }
  const lok = lc.filter(({ s }) => s.fa / s.neg <= 0.05 && s.fa <= oldDev.fa + 1 && s.ms <= 50 && s.hit > oldDev.hit);
  lok.sort((a, b) => b.s.hit / b.s.pos - a.s.hit / a.s.pos || a.s.fa - b.s.fa || a.s.ms - b.s.ms);
  pick.lab = lok.length ? lok[0].o : "OLD";
  L.push("", `Pick (rule §6.8): **${pick.lab}**`, "");
  for (const [name, set] of [["held-out", heldL], ["all", out.lab]]) {
    L.push(`## Lab multi-person (${name})`, "", "| Option | multi-person recall | M2 second face | M3 second person, no face box | false alarm (M1) |", "|---|---|---|---|---|");
    for (const o of LAB_OPTS) {
      const s = labStats(set, o), m2 = labStats(set.filter(f => f.group !== "M3"), o), m3 = labStats(set.filter(f => f.group !== "M2"), o);
      L.push(`| ${o}${o === pick.lab ? " **(picked)**" : ""} | ${rate(s.hit, s.pos)} | ${rate(m2.hit, m2.pos)} | ${rate(m3.hit, m3.pos)} | ${rate(s.fa, s.neg)} |`);
    }
    L.push("");
  }
  // miss analysis (OLD, all M2 frames)
  const SB = [[16, 32], [32, 64], [64, Infinity]];
  L.push("## Lab miss analysis (OLD, dev + held-out, M2 by the largest second face's width in the 640 × 480 frame)", "",
    "| Second face | frames | OLD read ≥ 2 | N1 (det 0.3) | N2@0.5 | N3@0.5 | N4@0.6 | second face occluded / truncated |", "|---|---|---|---|---|---|---|---|");
  for (const sb of SB) {
    const fr = out.lab.filter(f => f.group === "M2" && secondW(f) >= sb[0] && secondW(f) < sb[1]);
    const c = o => fr.filter(f => labRead(f, o).n >= 2).length;
    const flags = fr.reduce((a, f) => { const big = f.faces.indexOf(f.faces.reduce((x, y) => (y.w > x.w ? y : x), f.faces[0])); f.flags.forEach((fl,
      i) => { if (i !== big) { a.o += fl[0]; a.t += fl[1]; a.n++; } }); return a; }, { o: 0, t: 0, n: 0 });
    L.push(`| ${bname(sb)} px | ${fr.length} | ${c("OLD")} | ${c("N1")} | ${c("N2@0.5")} | ${c("N3@0.5")} | ${c("N4@0.6")} | ${flags.o} / ${flags.t} of ${flags.n} other faces |`);
  }
  const m3 = out.lab.filter(f => f.group === "M3"), c3 = o => m3.filter(f => labRead(f, o).n >= 2).length;
  L.push(`| M3 (no second face box) | ${m3.length} | ${c3("OLD")} | ${c3("N1")} | ${c3("N2@0.5")} | ${c3("N3@0.5")} | ${c3("N4@0.6")} | – |`);
  const candMiss = out.lab.filter(f => f.fl["fl4@0.5"].d.length === 0 && f.group !== "M1").length;
  L.push("", `Frames with a second person where OLD found no face at all (the candidate missed too): ${candMiss} / ${out.lab.filter(f => f.group !== "M1").length}`);
  const cocoMs = out.lab.map(f => f.coco.ms), fullMs = out.lab.map(f => f.fb["full@0.5:t0"].ms), t2Ms = out.lab.map(f => f.fb["short@0.5:t2only"].ms), flMs = out.lab.map(f => f.fl["fl4@0.5"].ms);
  L.push(`Lab timing per 640 × 480 frame, median ms (x1): OLD Face Landmarker ${f1(q(flMs, 0.5))} ` +
    `· full-range pass ${f1(q(fullMs, 0.5))} · 2 × 2 short-range tiles ${f1(q(t2Ms, 0.5))} · COCO-SSD ${f1(q(cocoMs, 0.5))}`);
  L.push("", "Machine: " + JSON.stringify(out.machine));
  return { text: L.join("\n"), pick };
}

if (has("--select")) await select();
else if (has("--cleanup")) {
  if (existsSync(IMG)) { const n = readdirSync(IMG).length; rmSync(IMG, { recursive: true, force: true });
    console.log(`deleted ${n} images in ${IMG} (manifest.jsonl, CREDITS.tsv and results/ kept)`); }
  else console.log("no images to delete");
} else if (has("--run") || has("--from")) {
  const out = has("--from") ? JSON.parse(readFileSync(resolve(opt("--from")), "utf8")) : await run();
  const s = summarise(out);
  console.log(s.text);
  if (opt("--md")) writeFileSync(resolve(opt("--md")), s.text + "\n");
} else if (has("--load-check")) await loadCheck();
else console.log("usage: --select | --run | --from <json> [--md <file>] | --cleanup | --load-check   [--vendor <dir>]");
process.exit(0);
