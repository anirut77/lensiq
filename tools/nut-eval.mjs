#!/usr/bin/env node
// tools/nut-eval.mjs — Nutrition MVP (label mode) measurement on the LOCKED synthetic set (outside the repo:
// ~/LENSIQ-field/evals/nutrition/, README.md there = parts, metrics, targets; locked.sha256 = hashes). Source label: synthetic.
//   T. text set: the ideal label lines -> LQNut.parseLabel (Node, the same file the page loads).
//   I. image set: each PNG -> the page's own on-device path in headless Chrome (nutrition.html: LQPCRun.detect ->
//      LQPC.cropFromBoxes -> LQNutRun.readCanvas on the crop in the label's script (boxes read one by one, rows paired along
//      the tilt) -> LQNut.parseLabel with the line confidences and the tilt), exactly as lensiq-nut-ui.js does.
// The set is checked against locked.sha256 first, then tools/eval-guard.mjs (the hashes committed in evals-locks/<phase>.sha256);
// a changed or unlocked file stops the run. Results go next to the set (never into the
// repo), then the locked score.mjs prints the tables.
//   node tools/nut-eval.mjs [--set <dir>] [--text-only] [--limit N] [--out <json>]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, homedir, platform, release, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseOf } from "./eval-guard.mjs";
import { checkNutLock } from "./lib/nut-lock.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const N = require("../lensiq-nut.js");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SET = resolve(opt("--set", join(homedir(), "LENSIQ-field", "evals", "nutrition")));
const OUT = resolve(opt("--out", join(SET, `results-${new Date().toISOString().slice(0, 10)}.json`)));
const LIMIT = +opt("--limit", 0) || 0;
if (OUT.startsWith(repo + "/")) { console.error("nut-eval: --out must be outside the repo"); process.exit(2); }

/* ---------- lock check (the set's own locked.sha256; " # ..." suffixes are comments) ---------- */
try {
  console.log(`nut-eval: ${checkNutLock(SET, repo).checked} locked hashes verified`);
} catch (e) { console.error(String(/** @type {any} */ (e).message || e)); process.exit(3); }

/* ---------- eval-guard (owner rule 2026-11-13): every input is in the evals folder and committed in evals-locks/ ---------- */
/** @param {string[]} inputs */
const guard = inputs => {
  try {
    const g = assertLocked(phaseOf(SET), inputs);
    console.log(`nut-eval: eval-guard OK, phase ${g.phase}, ${g.files.length} files in ${g.lockFile} (commit ${g.lockCommit})`);
  } catch (e) { console.error(String(/** @type {any} */ (e).message || e)); process.exit(3); }
};
guard(["set.json", ...(existsSync(join(SET, "score.mjs")) ? ["score.mjs"] : [])]);
const set = JSON.parse(readFileSync(join(SET, "set.json"), "utf8"));
let labels = set.labels;
if (LIMIT) labels = [...labels.filter(l => l.part === "text").slice(0, LIMIT), ...labels.filter(l => l.part === "image").slice(0, LIMIT)];
if (!argv.includes("--text-only")) guard(labels.filter(l => l.part === "image").map(l => l.file));
const out = { tool: "tools/nut-eval.mjs", date: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo }).toString().trim(),
  source: "synthetic", machine: { cpu: cpus()[0] && cpus()[0].model, cores: cpus().length, ramGB: Math.round(totalmem() / 1073741824), os: `${platform()} ${release()}` }, labels: [] };

/* ---------- T: text set ---------- */
for (const L of labels.filter(l => l.part === "text")) out.labels.push({ id: L.id, parse: N.parseLabel(L.lines) });
console.log(`text set: ${out.labels.length} labels parsed`);

/* ---------- I: image set (the page's on-device path) ---------- */
if (!argv.includes("--text-only")) {
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const { serve } = await import("./static-server.mjs");
  const srv = await serve(repo);
  const browser = await launch();
  try {
    const page = await browser.newPage(null, { isolated: true });
    await page.goto(`${srv.base}/nutrition.html`);
    await page.waitFor("window.LQPCRun && window.LQPC && window.LQNut && window.LQNutRun", 15000);
    out.machine.ua = await page.evaluate(() => navigator.userAgent);
    const imgs = labels.filter(l => l.part === "image");
    for (const [i, L] of imgs.entries()) {
      const b64 = readFileSync(join(SET, L.file)).toString("base64");
      const r = await page.evaluate(async (data, script) => {
        const img = new Image(); img.src = "data:image/png;base64," + data; await img.decode();
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const R = window.LQPCRun, P = window.LQPC, t0 = performance.now();
        const d = await R.detect(c);
        const crop = P.cropFromBoxes(d.boxes, c.width, c.height) || { x: 0, y: 0, w: c.width, h: c.height };
        const cc = document.createElement("canvas"); cc.width = Math.max(1, crop.w); cc.height = Math.max(1, crop.h);
        cc.getContext("2d").drawImage(c, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        const o = await window.LQNutRun.readCanvas(cc, script); // the page's own read (tilt-aware rows)
        const parse = window.LQNutRun.parse(o);
        return { parse, ms: performance.now() - t0, ocrText: o.text, tilt: o.tilt };
      }, b64, L.script);
      out.labels.push({ id: L.id, ...r });
      if ((i + 1) % 20 === 0) console.log(`  image ${i + 1} / ${imgs.length}`);
    }
  } finally { await browser.close(); await srv.close(); }
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`nut-eval: wrote ${OUT}`);
if (!existsSync(join(SET, "score.mjs"))) process.exit(0);
execFileSync(process.execPath, [join(SET, "score.mjs"), OUT, "--md", OUT.replace(/\.json$/, ".md")], { stdio: "inherit" });
