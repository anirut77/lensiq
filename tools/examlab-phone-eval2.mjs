#!/usr/bin/env node
// tools/examlab-phone-eval2.mjs — LENSIQ Exam lab A2 on the LOCKED set, measured through the page's own object pass
// (owner decision 217 ก, 2026-11-21). Same locked set (~/LENSIQ-field/evals/examlab-phone/, evals-locks/examlab-phone.sha256),
// same frame protocol, statistics and tables as tools/examlab-phone-eval.mjs (imported from it, unchanged); the only change:
// the in-page call is window.__LQ_EXAM_LAB.objectPass(coco, frame) with the shipped LQExam.LAB_PHONE_ZOOM, so the phone zoom
// pass is measured exactly as the page runs it (tools/examlab-phone-eval.mjs reproduces the full-frame call only).
// Locked before any measurement (evals-locks/examlab-phone__harness2.sha256). The zoom settings were chosen on the tuning set
// only (tools/examlab-phone-tune-eval.mjs). MEASURE ONCE: --run refuses when a result of this harness already exists in
// ~/LENSIQ-field/evals/examlab-phone/results/ (examlab-phone-zoom-*.json); the result is reported as it is, even under 80 %.
//   node tools/examlab-phone-eval2.mjs --run      ·      --from <json> [--md <file>]
import { assertFreeSpace } from "./disk-guard.mjs";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, cpus, totalmem, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { assertLocked, phaseOf } from "./eval-guard.mjs";
import { summarise, savedRunProblems, parseLabels, FW, FH, PHONE_CONF, CAVEAT } from "./examlab-phone-eval.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (/** @type {string} */ n, /** @type {string} [d] */ d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (/** @type {string} */ n) => argv.includes(n);
const DIR = join(homedir(), "LENSIQ-field", "evals", "examlab-phone");
const IMG = join(DIR, "images"), RES = join(DIR, "results");
const OUT = resolve(opt("--out", join(RES, `examlab-phone-zoom-${new Date().toISOString().slice(0, 10)}.json`)));
const LOCKED = ["manifest.jsonl", "labels.csv", "ATTRIBUTION.csv"];

async function PAGE_LIB(/** @type {number} */ FW, /** @type {number} */ FH) {
  const W = /** @type {any} */ (window), D = W.LQDetect, LAB = W.__LQ_EXAM_LAB;
  if (!W.tf && LAB && LAB.loadTf) await LAB.loadTf();
  const bk = await D.tfBackend();
  const coco = await D.loadCoco("vendor/models/cocossd/model.json");
  W.__ph = {
    one: async (/** @type {string} */ data) => {
      const img = new Image(); img.src = "data:image/jpeg;base64," + data; await img.decode();
      const c = document.createElement("canvas"); c.width = FW; c.height = FH;
      const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d")); g.fillStyle = "#808080"; g.fillRect(0, 0, FW, FH);
      const s = Math.min(FW / img.naturalWidth, FH / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
      g.drawImage(img, (FW - w) / 2, (FH - h) / 2, w, h);
      const r = await LAB.objectPass(coco, c); // the page's own path, shipped zoom settings
      const ph = r.objects.filter((/** @type {any} */ o) => o.cls === "phone").map((/** @type {any} */ o) => o.score);
      return { phone: ph.length ? Math.max(...ph) : 0, n: r.objects.length, zoomHit: r.objects.some((/** @type {any} */ o) => o.zoom) };
    }
  };
  return { tf: bk, zoom: W.LQExam.LAB_PHONE_ZOOM };
}

const limit = (/** @type {Promise<any>} */ p, /** @type {number} */ ms, /** @type {string} */ what) =>
  Promise.race([p, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(what + " timed out")), ms); t.unref(); })]);

async function run() {
  const prior = existsSync(RES) ? readdirSync(RES).filter(f => /^examlab-phone-zoom-.*\.json$/.test(f)) : [];
  if (prior.length) throw new Error("measure once: a locked-set result of this harness already exists: " + prior.join(", "));
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const { serve } = await import("./static-server.mjs");
  assertFreeSpace({ label: "tools/examlab-phone-eval2.mjs" });
  const manifest = readFileSync(join(DIR, "manifest.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  const labels = parseLabels(readFileSync(join(DIR, "labels.csv"), "utf8"));
  for (const r of manifest) {
    const f = join(IMG, r.file);
    if (!existsSync(f)) throw new Error("missing image " + f);
    if (createHash("sha256").update(readFileSync(f)).digest("hex") !== r.sha256) throw new Error("image changed since lock: " + r.file);
    if (!labels.has(r.id)) throw new Error("no label for " + r.id);
  }
  if (labels.size !== manifest.length) throw new Error("labels.csv and manifest.jsonl differ in size");
  let commit = ""; try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(); } catch { /* not a checkout */ }
  const srv = await serve(repo), browser = await launch();
  const out = { tool: "tools/examlab-phone-eval2.mjs", date: new Date().toISOString(), commit, source: "public dataset (Open Images V7 test and train splits; " + CAVEAT + ")",
    manifestSha256: createHash("sha256").update(readFileSync(join(DIR, "manifest.jsonl"))).digest("hex"),
    phoneConf: PHONE_CONF, frame: [FW, FH], zoom: null, machine: {}, frames: /** @type {any[]} */ ([]) };
  try {
    const p0 = await browser.newPage(null, { isolated: true });
    await limit(p0.goto(`${srv.base}/exam-lab.html?cpu`), 60000, "goto");
    await p0.waitFor("window.LQExam && window.LQDetect && window.__LQ_EXAM_LAB && window.__LQ_EXAM_LAB.objectPass", 15000);
    const env = await limit(p0.evaluate(PAGE_LIB, FW, FH), 180000, "init");
    out.zoom = env.zoom;
    out.machine = { tf: env.tf, cpu: cpus()[0] && cpus()[0].model, cores: cpus().length, ramGB: Math.round(totalmem() / 1073741824), os: `${platform()} ${release()}` };
    let k = 0;
    for (const r of manifest) {
      const b64 = readFileSync(join(IMG, r.file)).toString("base64");
      const o = await limit(p0.evaluate(async (/** @type {string} */ d) => /** @type {any} */ (window).__ph.one(d), b64), 180000, "frame " + r.id);
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
    try {
      const g = assertLocked(phaseOf(DIR), LOCKED);
      console.error(`eval-guard OK: phase ${g.phase}, ${LOCKED.length} files in ${g.lockFile} (commit ${g.lockCommit})`);
    } catch (e) { console.error(String(/** @type {any} */ (e).message || e)); process.exit(2); }
    let out;
    if (has("--from")) {
      out = JSON.parse(readFileSync(resolve(String(opt("--from"))), "utf8"));
      const why = savedRunProblems(out, readFileSync(join(DIR, "manifest.jsonl"), "utf8"));
      if (why.length) { console.error("examlab-phone-eval2: refused --from:\n  " + why.slice(0, 20).join("\n  ")); process.exit(2); }
    } else out = await run();
    const s = summarise(out);
    console.log(s.text.replace("## Exam lab phone-in-hand set", "## Exam lab phone-in-hand set, page object pass with phone zoom " + JSON.stringify(out.zoom)));
    if (opt("--md")) writeFileSync(resolve(String(opt("--md"))), s.text + "\n");
  } else console.log("usage: --run | --from <json> [--md <file>]");
  process.exit(0);
}
