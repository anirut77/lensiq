#!/usr/bin/env node
// tools/examlab-phone-tune-eval.mjs — LENSIQ Exam lab A2 phone zoom pass: TUNING measurements (owner decision 217 ก, 2026-11-21).
// Runs ONLY on the tuning set ~/LENSIQ-field/evals/examlab-phone-tune/ (Open Images V7, CC BY 2.0 images, labels from the
// dataset's own boxes, nobody viewed any image; built by tools/examlab-phone-tune-build.py). It can never read the locked A2
// set: the folder is fixed here, eval-guard checks the tuning lock, and tools/examlab-phone-separation.mjs refuses to measure
// when the tuning set shares any id, image sha256, file or Flickr photo with the locked set. Source label: public dataset.
//
// Same frame protocol as tools/examlab-phone-eval.mjs (letterbox into 640 x 480 on grey; a frame is flagged when a phone scores
// >= LQExam.DEFAULTS.phoneConf).
//   --sweep     per image: the page's full-frame phone score (objectPass with the zoom pass OFF) and the best phone score
//               (>= 0.4) of every crop of every candidate zoom config (CANDIDATES); tables per config and zoom cut
//   --product   the page's own objectPass with the shipped LQExam.LAB_PHONE_ZOOM (confirms the chosen config end to end)
//   --from <json>  tables of a saved run · --out <json> · --md <file>
// Selection rule (fixed before the first tuning measurement, docs/exam/EXAMLAB-PHONE-SET.md "Tuning"): among the candidates
// with at most MAX_CROPS crops, the config + zoom cut with the highest tuning recall on the positives (all phoneLong < 0.4)
// whose false flags on the tuning negatives are <= MAX_FF; ties -> fewer crops, then the higher cut.
import { assertFreeSpace } from "./disk-guard.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, cpus, totalmem, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { assertLocked, phaseOf } from "./eval-guard.mjs";
import { assertSeparated } from "./examlab-phone-separation.mjs";
import { wilson, parseLabels, FW, FH, PHONE_CONF } from "./examlab-phone-eval.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const E = require("../lensiq-exam.js");
const argv = process.argv.slice(2);
const opt = (/** @type {string} */ n, /** @type {string} [d] */ d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (/** @type {string} */ n) => argv.includes(n);
const EV = join(homedir(), "LENSIQ-field", "evals");
const DIR = join(EV, "examlab-phone-tune"), IMG = join(DIR, "images"), LOCKED_DIR = join(EV, "examlab-phone");
const LOCKED = ["manifest.jsonl", "labels.csv", "ATTRIBUTION.csv"];
const MODE = has("--product") ? "product" : "sweep";
const OUT = resolve(opt("--out", join(DIR, "results", `tune-${MODE}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`)));
export const CAVEAT = "tuning set, public stills, not lab webcam; never the locked A2 set";
export const MAX_FF = 1, MAX_CROPS = 9;
export const CUTS = [0.6, 0.7, 0.8, 0.9];
/** candidate zoom configs (LQExam.phoneZoomRects input), fixed before the first tuning measurement */
export const CANDIDATES = Object.freeze({
  g2x2: { cols: 2, rows: 2, overlap: 0.2 },
  g3x2: { cols: 3, rows: 2, overlap: 0.2 },
  g3x3: { cols: 3, rows: 3, overlap: 0.25 },
  g4x3: { cols: 4, rows: 3, overlap: 0.2 },
  band2: { cols: 2, rows: 1, overlap: 0.2, y0: 0.35, y1: 1 },
  band3: { cols: 3, rows: 1, overlap: 0.2, y0: 0.35, y1: 1 },
  band3x2: { cols: 3, rows: 2, overlap: 0.2, y0: 0.25, y1: 1 }
});

/** @param {{frames: any[]}} out */
export function sweepTables(out) {
  const pos = out.frames.filter(f => f.label === "pos"), neg = out.frames.filter(f => f.label === "neg");
  const pc = (/** @type {number} */ v) => (100 * v).toFixed(1) + " %";
  const flagged = (/** @type {any} */ f, /** @type {string|null} */ c, /** @type {number} */ cut) =>
    f.full >= PHONE_CONF || (c !== null && Math.max(0, ...f.crops[c]) >= cut);
  const rows = [];
  const base = { name: "off (full frame only)", crops: 0, cut: null, k: pos.filter(f => flagged(f, null, 0)).length, ff: neg.filter(f => flagged(f, null, 0)).length };
  rows.push(base);
  for (const [c, z] of Object.entries(CANDIDATES)) for (const cut of CUTS) {
    rows.push({ name: c, crops: E.phoneZoomRects(z).length, cut, k: pos.filter(f => flagged(f, c, cut)).length, ff: neg.filter(f => flagged(f, c, cut)).length });
  }
  const eligible = rows.filter(r => r.cut !== null && r.crops <= MAX_CROPS && r.ff <= MAX_FF)
    .sort((a, b) => b.k - a.k || a.crops - b.crops || /** @type {number} */ (b.cut) - /** @type {number} */ (a.cut));
  const pick = eligible[0] || null;
  const L = [`## Exam lab phone zoom pass, tuning sweep (public dataset: Open Images V7, CC BY 2.0 images; ${CAVEAT})`, "",
    `Positives n = ${pos.length} (all phoneLong < 0.4), negatives n = ${neg.length}. Flag = full-frame phone >= ${PHONE_CONF} or a crop phone >= zoom cut.`, "",
    "| Config | Crops | Zoom cut | Recall (desk-size positives) | 95 % CI | False flags (negatives) | 95 % CI |", "|---|---|---|---|---|---|---|"];
  for (const r of rows) {
    const ci = wilson(r.k, pos.length), cf = wilson(r.ff, neg.length);
    L.push(`| ${r.name}${r === pick ? " **(chosen)**" : ""} | ${r.crops} | ${r.cut ?? "–"} | ${pc(r.k / pos.length)} (${r.k} / ${pos.length}) | ${pc(ci[0])} – ${pc(ci[1])} | ${pc(r.ff / neg.length)} (${r.ff} / ${neg.length}) | ${pc(cf[0])} – ${pc(cf[1])} |`);
  }
  L.push("", `Selection rule: crops <= ${MAX_CROPS}, false flags <= ${MAX_FF}; highest recall, then fewer crops, then higher cut. Chosen: ${pick ? `${pick.name} @ ${pick.cut}` : "none"}`);
  if (out.timing) L.push("", "Timing (ms per frame, median): " + JSON.stringify(out.timing));
  return { text: L.join("\n"), rows, pick };
}

/** @param {{frames: any[]}} out */
export function productTable(out) {
  const pos = out.frames.filter(f => f.label === "pos"), neg = out.frames.filter(f => f.label === "neg");
  const k = pos.filter(f => f.phone >= PHONE_CONF).length, ff = neg.filter(f => f.phone >= PHONE_CONF).length;
  const pc = (/** @type {number} */ v) => (100 * v).toFixed(1) + " %", a = wilson(k, pos.length), b = wilson(ff, neg.length);
  return `## Exam lab phone zoom pass, product path on the tuning set (${CAVEAT})\n\nZoom config: ${JSON.stringify(/** @type {any} */ (out).zoom)}\n\n` +
    `| Row | Rate | 95 % CI |\n|---|---|---|\n| recall, desk-size positives | ${pc(k / pos.length)} (${k} / ${pos.length}) | ${pc(a[0])} – ${pc(a[1])} |\n` +
    `| false flags, negatives | ${pc(ff / neg.length)} (${ff} / ${neg.length}) | ${pc(b[0])} – ${pc(b[1])} |` +
    (/** @type {any} */ (out).timing ? `\n\nTiming (ms per frame, median): ${JSON.stringify(/** @type {any} */ (out).timing)}` : "");
}

/* ---------- in-page part (exam-lab.html?cpu in headless Chrome) ---------- */
async function PAGE_LIB(/** @type {number} */ FW, /** @type {number} */ FH, /** @type {any} */ cand) {
  const W = /** @type {any} */ (window), D = W.LQDetect, X = W.LQExam, LAB = W.__LQ_EXAM_LAB;
  if (!W.tf && LAB && LAB.loadTf) await LAB.loadTf();
  const bk = await D.tfBackend();
  const coco = await D.loadCoco("vendor/models/cocossd/model.json");
  const frame = async (/** @type {string} */ data) => {
    const img = new Image(); img.src = "data:image/jpeg;base64," + data; await img.decode();
    const c = document.createElement("canvas"); c.width = FW; c.height = FH;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d")); g.fillStyle = "#808080"; g.fillRect(0, 0, FW, FH);
    const s = Math.min(FW / img.naturalWidth, FH / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
    g.drawImage(img, (FW - w) / 2, (FH - h) / 2, w, h);
    return c;
  };
  const best = (/** @type {any[]} */ objs) => { const p = objs.filter(o => o.cls === "phone").map(o => o.score); return p.length ? Math.max(...p) : 0; };
  W.__tune = {
    sweep: async (/** @type {string} */ data) => {
      const c = await frame(data);
      const t0 = performance.now(), full = await LAB.objectPass(coco, c, { on: false }), t1 = performance.now();
      /** @type {Record<string, number[]>} */ const crops = {};
      for (const [k, z] of Object.entries(cand)) {
        crops[k] = [];
        for (const r of X.phoneZoomRects(z)) {
          const d = await D.detectCocoRects(coco, c, [r], { classes: [76], minScore: 0.4, max: 5 });
          crops[k].push(d.length ? Math.max(...d.map((/** @type {any} */ o) => o.score)) : 0);
        }
      }
      return { full: best(full.objects), crops, msFull: t1 - t0, msAll: performance.now() - t0 };
    },
    product: async (/** @type {string} */ data) => {
      const c = await frame(data);
      const t0 = performance.now(), r = await LAB.objectPass(coco, c);
      return { phone: best(r.objects), zoomHit: r.objects.some((/** @type {any} */ o) => o.zoom), ms: performance.now() - t0 };
    }
  };
  return { tf: bk, zoom: X.LAB_PHONE_ZOOM };
}

const limit = (/** @type {Promise<any>} */ p, /** @type {number} */ ms, /** @type {string} */ what) =>
  Promise.race([p, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(what + " timed out")), ms); t.unref(); })]);
const med = (/** @type {number[]} */ a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length / 2)]) : 0; };

async function run() {
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const { serve } = await import("./static-server.mjs");
  assertFreeSpace({ label: "tools/examlab-phone-tune-eval.mjs" });
  const manifest = readFileSync(join(DIR, "manifest.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  const labels = parseLabels(readFileSync(join(DIR, "labels.csv"), "utf8"));
  for (const r of manifest) {
    const f = join(IMG, r.file);
    if (!existsSync(f)) throw new Error("missing image " + f);
    if (createHash("sha256").update(readFileSync(f)).digest("hex") !== r.sha256) throw new Error("image changed since lock: " + r.file);
    if (!labels.has(r.id)) throw new Error("no label for " + r.id);
  }
  const srv = await serve(repo), browser = await launch();
  const out = { tool: "tools/examlab-phone-tune-eval.mjs", mode: MODE, date: new Date().toISOString(), source: "public dataset (Open Images V7; " + CAVEAT + ")",
    manifestSha256: createHash("sha256").update(readFileSync(join(DIR, "manifest.jsonl"))).digest("hex"),
    phoneConf: PHONE_CONF, frame: [FW, FH], candidates: CANDIDATES, zoom: null, machine: {}, timing: {}, frames: /** @type {any[]} */ ([]) };
  try {
    const p0 = await browser.newPage(null, { isolated: true });
    await limit(p0.goto(`${srv.base}/exam-lab.html?cpu`), 60000, "goto");
    await p0.waitFor("window.LQExam && window.LQDetect && window.__LQ_EXAM_LAB && window.__LQ_EXAM_LAB.objectPass", 15000);
    const env = await limit(p0.evaluate(PAGE_LIB, FW, FH, CANDIDATES), 180000, "init");
    out.zoom = env.zoom;
    out.machine = { tf: env.tf, cpu: cpus()[0] && cpus()[0].model, cores: cpus().length, ramGB: Math.round(totalmem() / 1073741824), os: `${platform()} ${release()}` };
    let k = 0;
    for (const r of manifest) {
      const b64 = readFileSync(join(IMG, r.file)).toString("base64");
      const o = await limit(p0.evaluate(async (/** @type {string} */ d, /** @type {string} */ m) => /** @type {any} */ (window).__tune[m](d), b64, MODE), 180000, "frame " + r.id);
      out.frames.push({ id: r.id, label: labels.get(r.id), phoneLong: r.phoneLong, ...o });
      if (++k % 50 === 0) console.log(`  ${k} / ${manifest.length}`);
    }
  } finally { await browser.close(); await srv.close(); }
  out.timing = MODE === "sweep" ? { fullFrame: med(out.frames.map(f => f.msFull)), fullPlusAllCandidates: med(out.frames.map(f => f.msAll)) }
    : { productNoPhone: med(out.frames.filter(f => !(f.phone >= PHONE_CONF) || f.zoomHit).map(f => f.ms)), productAll: med(out.frames.map(f => f.ms)) };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.log("wrote", OUT);
  return out;
}

const main = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (main) {
  if (has("--sweep") || has("--product") || has("--from")) {
    try {
      const g = assertLocked(phaseOf(DIR), LOCKED);
      console.error(`eval-guard OK: phase ${g.phase}, ${LOCKED.length} files in ${g.lockFile} (commit ${g.lockCommit})`);
      const rd = (/** @type {string} */ d, /** @type {string} */ f) => readFileSync(join(d, f), "utf8");
      const o = assertSeparated({ manifest: rd(LOCKED_DIR, "manifest.jsonl"), attribution: rd(LOCKED_DIR, "ATTRIBUTION.csv") },
        { manifest: rd(DIR, "manifest.jsonl"), attribution: rd(DIR, "ATTRIBUTION.csv") });
      console.error(`separation OK: tuning ${o.counts.tune} vs locked ${o.counts.locked}: 0 shared ids, sha256, files, Flickr photos`);
    } catch (e) { console.error(String(/** @type {any} */ (e).message || e)); process.exit(2); }
    let out;
    if (has("--from")) {
      out = JSON.parse(readFileSync(resolve(String(opt("--from"))), "utf8"));
      const sha = createHash("sha256").update(readFileSync(join(DIR, "manifest.jsonl"))).digest("hex");
      if (out.manifestSha256 !== sha) { console.error("refused --from: run not made on the locked tuning manifest"); process.exit(2); }
    } else out = await run();
    const text = out.mode === "product" ? productTable(out) : sweepTables(out).text;
    console.log(text);
    if (opt("--md")) writeFileSync(resolve(String(opt("--md"))), text + "\n");
  } else console.log("usage: --sweep | --product | --from <json> [--md <file>]");
  process.exit(0);
}
