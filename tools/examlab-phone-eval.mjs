#!/usr/bin/env node
// tools/examlab-phone-eval.mjs — LENSIQ Exam lab: phone-in-hand recall on a locked public still-image set
// (acceptance sheet docs/acceptance/exam-lab.md, criterion A2 "phone recall at desk distance >= 80 % on a locked set of
// >= 50 phone-in-hand frames"; owner decision 134). Source: public dataset (Open Images V7 test and train splits, images CC BY 2.0,
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
//   - phoneLong (manifest) = max(normalised box width, normalised box height) of the largest phone box, i.e. relative to
//     the ORIGINAL image; after letterboxing a portrait image into 640 x 480 the phone is smaller in the frame than this;
//   - A2 decision (primary): recall at score >= phoneConf on the positives with phoneLong < 0.4 only (desk-like sizes;
//     81 frames in the locked set, >= 50), Wilson 95 % interval; target >= 80 %;
//   - secondary rows only, never used for the decision: recall on all positives, recall on the >= 0.4 close-up band,
//     the < 0.15 and 0.15 – 0.4 bands, false flags = flagged negatives / negatives, score cuts 0.4 and 0.5;
//   - every number is "public stills, not lab webcam; field pilot confirms".
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

export const DESK_MAX = 0.4;
export const CAVEAT = "public stills, not lab webcam; field pilot confirms";

/** A2 is decided on the positives with phoneLong < DESK_MAX only; everything else is a secondary row.
 * @param {{frames: Array<{id: string, label: string, phone: number, phoneLong: number}>, machine?: any}} out */
export function summarise(out) {
  const pos = out.frames.filter(f => f.label === "pos"), neg = out.frames.filter(f => f.label === "neg");
  const row = (/** @type {string} */ name, /** @type {any[]} */ fr, /** @type {number} */ cut, /** @type {boolean} */ primary) => {
    const k = fr.filter(f => f.phone >= cut).length;
    return { name, cut, primary, k, n: fr.length, rate: fr.length ? k / fr.length : 0, ci: wilson(k, fr.length) };
  };
  const desk = pos.filter(f => f.phoneLong < DESK_MAX);
  const band = (/** @type {number} */ lo, /** @type {number} */ hi) => pos.filter(f => f.phoneLong >= lo && f.phoneLong < hi);
  const primary = row(`recall, positives with phoneLong < ${DESK_MAX} (A2 decision)`, desk, PHONE_CONF, true);
  const rows = [primary,
    row("recall, all positives", pos, PHONE_CONF, false),
    row(`recall, close-up band phoneLong >= ${DESK_MAX}`, band(DESK_MAX, 9), PHONE_CONF, false),
    row("recall, band phoneLong < 0.15", band(0, 0.15), PHONE_CONF, false),
    row(`recall, band 0.15 <= phoneLong < ${DESK_MAX}`, band(0.15, DESK_MAX), PHONE_CONF, false),
    ...SENS.map(c => row(`recall, positives with phoneLong < ${DESK_MAX}, score cut ${c}`, desk, c, false)),
    row("false flags, negatives", neg, PHONE_CONF, false),
    ...SENS.map(c => row(`false flags, negatives, score cut ${c}`, neg, c, false))];
  const pass = primary.n >= MIN_POS && primary.rate >= TARGET;
  const pc = (/** @type {number} */ v) => (100 * v).toFixed(1) + " %";
  const L = [`## Exam lab phone-in-hand set (public dataset: Open Images V7, CC BY 2.0 images; ${CAVEAT})`, "",
    "| Row | Use | Score cut | Rate | 95 % CI |", "|---|---|---|---|---|"];
  for (const r of rows) L.push(`| ${r.name} | ${r.primary ? "**primary**" : "secondary"} | ${r.cut} | ${r.n ? pc(r.rate) : "–"} (${r.k} / ${r.n}) | ${pc(r.ci[0])} – ${pc(r.ci[1])} |`);
  L.push("", `A2 (recall >= ${pc(TARGET)} on >= ${MIN_POS} phone-in-hand frames with phoneLong < ${DESK_MAX}): **${pass ? "pass" : "fail"}** · source: public dataset · ${CAVEAT}`);
  if (out.machine) L.push("", "Machine: " + JSON.stringify(out.machine));
  return { text: L.join("\n"), rows, pass };
}

/** --from: a saved run counts only if it was made on the locked manifest and covers its frames one for one.
 * @param {{manifestSha256?: string, frames?: Array<{id: string}>}} out @param {string} manifestText @returns {string[]} reasons (empty = OK) */
export function savedRunProblems(out, manifestText) {
  const why = [];
  const sha = createHash("sha256").update(manifestText).digest("hex");
  if (!out || out.manifestSha256 !== sha) why.push(`manifestSha256 ${out && out.manifestSha256} != locked manifest ${sha}`);
  const ids = manifestText.trim().split("\n").map(l => JSON.parse(l).id);
  const got = (out && Array.isArray(out.frames) ? out.frames : []).map(f => f.id);
  const want = new Set(ids), seen = new Set();
  for (const id of got) {
    if (!want.has(id)) why.push("frame not in the manifest: " + id);
    else if (seen.has(id)) why.push("frame twice: " + id);
    seen.add(id);
  }
  for (const id of ids) if (!seen.has(id)) why.push("manifest frame missing from the run: " + id);
  if (got.length !== ids.length) why.push(`run has ${got.length} frames, manifest ${ids.length}`);
  return why;
}

/* ---------- in-page part (exam-lab.html?cpu in headless Chrome) ---------- */
async function PAGE_LIB(/** @type {number} */ FW, /** @type {number} */ FH) {
  const W = /** @type {any} */ (window), D = W.LQDetect;
  // exam-lab.html loads TF.js only when the camera starts (S2, 2026-11-20): load it the way the page does (same files, same order)
  if (!W.tf && W.__LQ_EXAM_LAB && W.__LQ_EXAM_LAB.loadTf) await W.__LQ_EXAM_LAB.loadTf();
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
  const out = { tool: "tools/examlab-phone-eval.mjs", date: new Date().toISOString(), source: "public dataset (Open Images V7 test and train splits; " + CAVEAT + ")",
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
    let out;
    if (has("--from")) {
      out = JSON.parse(readFileSync(resolve(String(opt("--from"))), "utf8"));
      const why = savedRunProblems(out, readFileSync(join(DIR, "manifest.jsonl"), "utf8"));
      if (why.length) { console.error("examlab-phone-eval: refused --from:\n  " + why.slice(0, 20).join("\n  ")); process.exit(2); }
    } else out = await run();
    const s = summarise(out);
    console.log(s.text);
    if (opt("--md")) writeFileSync(resolve(String(opt("--md"))), s.text + "\n");
  } else console.log("usage: --run | --from <json> [--md <file>]");
  process.exit(0);
}
