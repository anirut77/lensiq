#!/usr/bin/env node
// tools/examlab-phone-eval.mjs — LENSIQ Exam lab: phone-in-hand recall on a locked public still-image set
// (acceptance sheet docs/acceptance/exam-lab.md, criterion A2 "phone recall at desk distance >= 80 % on a locked set of
// >= 50 phone-in-hand frames"; owner decision 134). Source: public dataset (Open Images V7 test split, images CC BY 2.0,
// annotations CC BY 4.0; credits in ~/LENSIQ-field/evals/examlab-phone/ATTRIBUTION.csv and docs/exam/EXAMLAB-PHONE-SET.md).
//
// The images are photos of real people: they stay OUTSIDE the repo (~/LENSIQ-field/evals/examlab-phone/images/) and are
// never committed. Only manifest.jsonl (image ids + sha256), labels.csv and ATTRIBUTION.csv are locked
// (evals-locks/examlab-phone.sha256, committed BEFORE any measurement).
//
// Protocol (fixed before measuring):
//   - each image is letterboxed on grey into a 640 x 480 canvas (the Exam lab camera request, exam-lab.js ideal 640x480);
//   - the Exam lab page's own call runs on it: LQDetect.detectCocoMulti(coco, frame, [{classes: [76, 83, 72, 71],
//     minScore: 0.4, max: 10}]) with the page's COCO-SSD (vendor/models/cocossd), in headless Chrome on CPU / WASM;
//   - a frame is FLAGGED when a class-76 ("phone") detection has score >= LQExam.DEFAULTS.phoneConf (the lab threshold).
//     A still image repeated gives the same result every frame, so the k-of-n gate (phoneK of phoneN) fires exactly when
//     the single frame is flagged;
//   - primary: recall = flagged positives / positives (labels.csv label "pos"), Wilson 95 % interval; target >= 80 %;
//   - secondary (reported, no target in the sheet): false flags = flagged negatives / negatives;
//   - sensitivity rows at score >= 0.4 (the decode floor) and 0.5 are reported, never used for the pass decision;
//   - recall is also reported by phone size (manifest phoneLong = longest phone box side / image side: < 0.15 desk-like,
//     0.15 – 0.4, >= 0.4 close-up). Most public phone photos are close-ups, so the < 0.4 rows are the desk-distance view.
//
//   node tools/examlab-phone-eval.mjs --run            measure (refuses unless the set is locked and committed)
//   node tools/examlab-phone-eval.mjs --from <json>    tables of a saved run (also guarded)
//   --out <json> (default ~/LENSIQ-field/evals/examlab-phone/results/examlab-phone-<date>.json) · --md <file>
import { assertFreeSpace } from "./disk-guard.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, cpus, totalmem, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { assertLocked, phaseOf } from "./eval-guard.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const E = require("../lensiq-exam.js");
const argv = process.argv.slice(2);
const opt = (/** @type {string} */ n, /** @type {string} [d] */ d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (/** @type {string} */ n) => argv.includes(n);
const DIR = join(homedir(), "LENSIQ-field", "evals", "examlab-phone");
const IMG = join(DIR, "images");
const OUT = resolve(opt("--out", join(DIR, "results", `examlab-phone-${new Date().toISOString().slice(0, 10)}.json`)));
const LOCKED = ["manifest.jsonl", "labels.csv", "ATTRIBUTION.csv"];
export const FW = 640, FH = 480;
export const TARGET = 0.8, MIN_POS = 50;
export const PHONE_CONF = E.DEFAULTS.phoneConf;
export const SENS = [0.4, 0.5];

/** Wilson 95 % interval @param {number} k @param {number} n */
export function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.959964, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** labels.csv: "id,label" rows, label pos | neg @param {string} text */
export function parseLabels(text) {
  const m = new Map();
  for (const l of text.trim().split(/\r?\n/).slice(1)) {
    const [id, label] = l.split(",");
    if (label !== "pos" && label !== "neg") throw new Error("labels.csv: bad label for " + id);
    m.set(id, label);
  }
  return m;
}

/** @param {{frames: Array<{id: string, label: string, phone: number, phoneLong: number}>, machine?: any}} out */
export function summarise(out) {
  const rows = [];
  for (const cut of [PHONE_CONF, ...SENS]) {
    const pos = out.frames.filter(f => f.label === "pos"), neg = out.frames.filter(f => f.label === "neg");
    const tp = pos.filter(f => f.phone >= cut).length, fp = neg.filter(f => f.phone >= cut).length;
    rows.push({ cut, primary: cut === PHONE_CONF, tp, pos: pos.length, recall: pos.length ? tp / pos.length : 0, ci: wilson(tp, pos.length),
      fp, neg: neg.length, falseRate: neg.length ? fp / neg.length : 0, fci: wilson(fp, neg.length) });
  }
  const bands = [["< 0.15", 0, 0.15], ["0.15 – 0.4", 0.15, 0.4], [">= 0.4", 0.4, 9]].map(([name, lo, hi]) => {
    const fr = out.frames.filter(f => f.label === "pos" && f.phoneLong >= lo && f.phoneLong < hi), k = fr.filter(f => f.phone >= PHONE_CONF).length;
    return { name, k, n: fr.length, ci: wilson(k, fr.length) };
  });
  const p = rows[0];
  const pass = p.pos >= MIN_POS && p.recall >= TARGET;
  const pc = (/** @type {number} */ v) => (100 * v).toFixed(1) + " %";
  const L = ["## Exam lab phone-in-hand set (public dataset: Open Images V7, CC BY 2.0 images)", "",
    "| Score cut | Use | Recall (positives) | 95 % CI | False flags (negatives) | 95 % CI |", "|---|---|---|---|---|---|"];
  for (const r of rows) L.push(`| ${r.cut} | ${r.primary ? "**primary (lab phoneConf)**" : "sensitivity only"} | ${pc(r.recall)} (${r.tp} / ${r.pos}) | ${pc(r.ci[0])} – ${pc(r.ci[1])} | ${pc(r.falseRate)} (${r.fp} / ${r.neg}) | ${pc(r.fci[0])} – ${pc(r.fci[1])} |`);
  L.push("", `Recall by phone size at score >= ${PHONE_CONF}:`, "", "| Phone long side / image | Recall | 95 % CI |", "|---|---|---|");
  for (const b of bands) L.push(`| ${b.name} | ${b.n ? pc(b.k / b.n) : "–"} (${b.k} / ${b.n}) | ${pc(b.ci[0])} – ${pc(b.ci[1])} |`);
  L.push("", `A2 (recall >= ${pc(TARGET)} on >= ${MIN_POS} phone-in-hand frames): **${pass ? "pass" : "fail"}** · source: public dataset`);
  if (out.machine) L.push("", "Machine: " + JSON.stringify(out.machine));
  return { text: L.join("\n"), rows, bands, pass };
}

/* ---------- in-page part (exam-lab.html?cpu in headless Chrome) ---------- */
async function PAGE_LIB(/** @type {number} */ FW, /** @type {number} */ FH) {
  const W = /** @type {any} */ (window), D = W.LQDetect;
  const bk = await D.tfBackend();
  const coco = await D.loadCoco("vendor/models/cocossd/model.json");
  W.__ph = {
    one: async (/** @type {string} */ data) => {
      const img = new Image(); img.src = "data:image/jpeg;base64," + data; await img.decode();
      const c = document.createElement("canvas"); c.width = FW; c.height = FH;
      const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d")); g.fillStyle = "#808080"; g.fillRect(0, 0, FW, FH);
      const s = Math.min(FW / img.naturalWidth, FH / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
      g.drawImage(img, (FW - w) / 2, (FH - h) / 2, w, h);
      // exactly the lab page's object decode (exam-lab.js observe())
      const [d] = await D.detectCocoMulti(coco, c, [{ classes: [76, 83, 72, 71], minScore: 0.4, max: 10 }]);
      const ph = d.filter((/** @type {any} */ o) => o.cls === 76).map((/** @type {any} */ o) => o.score);
      return { phone: ph.length ? Math.max(...ph) : 0, n: d.length };
    }
  };
  return { tf: bk };
}

const limit = (/** @type {Promise<any>} */ p, /** @type {number} */ ms, /** @type {string} */ what) =>
  Promise.race([p, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(what + " timed out")), ms); t.unref(); })]);

async function run() {
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const { serve } = await import("./static-server.mjs");
  assertFreeSpace({ label: "tools/examlab-phone-eval.mjs" });
  const manifest = readFileSync(join(DIR, "manifest.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  const labels = parseLabels(readFileSync(join(DIR, "labels.csv"), "utf8"));
  // every image must match the sha256 in the locked manifest (the images themselves are not in the lock file)
  for (const r of manifest) {
    const f = join(IMG, r.file);
    if (!existsSync(f)) throw new Error("missing image " + f);
    if (createHash("sha256").update(readFileSync(f)).digest("hex") !== r.sha256) throw new Error("image changed since lock: " + r.file);
    if (!labels.has(r.id)) throw new Error("no label for " + r.id);
  }
  if (labels.size !== manifest.length) throw new Error("labels.csv and manifest.jsonl differ in size");
  const srv = await serve(repo), browser = await launch();
  const out = { tool: "tools/examlab-phone-eval.mjs", date: new Date().toISOString(), source: "public dataset (Open Images V7 test split)",
    manifestSha256: createHash("sha256").update(readFileSync(join(DIR, "manifest.jsonl"))).digest("hex"),
    phoneConf: PHONE_CONF, frame: [FW, FH], machine: {}, frames: /** @type {any[]} */ ([]) };
  try {
    const p0 = await browser.newPage(null, { isolated: true });
    await limit(p0.goto(`${srv.base}/exam-lab.html?cpu`), 60000, "goto");
    await p0.waitFor("window.LQExam && window.LQDetect", 15000);
    const env = await limit(p0.evaluate(PAGE_LIB, FW, FH), 180000, "init");
    out.machine = { ...env, cpu: cpus()[0] && cpus()[0].model, cores: cpus().length, ramGB: Math.round(totalmem() / 1073741824), os: `${platform()} ${release()}` };
    let k = 0;
    for (const r of manifest) {
      const b64 = readFileSync(join(IMG, r.file)).toString("base64");
      const o = await limit(p0.evaluate(async (/** @type {string} */ d) => /** @type {any} */ (window).__ph.one(d), b64), 120000, "frame " + r.id);
      out.frames.push({ id: r.id, label: labels.get(r.id), phoneLong: r.phoneLong, ...o });
      if (++k % 50 === 0) console.log(`  ${k} / ${manifest.length}`);
    }
  } finally { await browser.close(); await srv.close(); }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.log("wrote", OUT);
  return out;
}

const main = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (main) {
  if (has("--run") || has("--from")) {
    // eval-guard (owner rule 2026-11-13): the set must sit in ~/LENSIQ-field/evals/examlab-phone/ and match the committed lock.
    try {
      const g = assertLocked(phaseOf(DIR), LOCKED);
      console.error(`eval-guard OK: phase ${g.phase}, ${LOCKED.length} files in ${g.lockFile} (commit ${g.lockCommit})`);
    } catch (e) { console.error(String(/** @type {any} */ (e).message || e)); process.exit(2); }
    const out = has("--from") ? JSON.parse(readFileSync(resolve(String(opt("--from"))), "utf8")) : await run();
    const s = summarise(out);
    console.log(s.text);
    if (opt("--md")) writeFileSync(resolve(String(opt("--md"))), s.text + "\n");
  } else console.log("usage: --run | --from <json> [--md <file>]");
  process.exit(0);
}
