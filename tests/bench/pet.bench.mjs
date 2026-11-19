#!/usr/bin/env node
// tests/bench/pet.bench.mjs — FIXED HARNESS, Pet face reading detector check (owner order 2026-11-16, part B: "Detector
// correctness ... on a small public, licence-clean test set"). Locked with its set (evals-locks/fortune-pet.sha256) BEFORE
// any product code on branch fortune-pet.
//   node tests/bench/pet.bench.mjs [--json out.json]
// Set: ~/LENSIQ-field/evals/fortune-pet/manifest.json (Oxford-IIIT Pet trainval, 296 images, CC BY-SA 4.0, image copyright
// with the owners; evaluation only, never in the repo) + targets.json. tools/eval-guard.mjs refuses to measure unless both
// files are there and match the committed hashes. Images are served read-only from ~/LENSIQ-field/evals/fortune-pet/oxford.
// Browser side: headless Chrome without WebGL (WASM, like a phone without a GPU path), the production modules
// lensiq-detect.js + lensiq-pet.js, LQPet.detect(model, img) exactly as petread.html calls it. Source label: public dataset.
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { assertLocked, phaseDir } from "../../tools/eval-guard.mjs";
import { openBench, pct, table } from "./lib.mjs";

const PHASE = "fortune-pet";
assertLocked(PHASE, ["manifest.json", "targets.json"]);
const DIR = phaseDir(PHASE);
const M = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const T = JSON.parse(readFileSync(join(DIR, "targets.json"), "utf8"));
const args = process.argv.slice(2), jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;

// images: a second tiny server on 127.0.0.1 (read-only, this folder only), CORS open so the bench page can draw them
const img = await new Promise(res => {
  const root = join(DIR, "oxford", "images");
  const srv = createServer((q, r) => {
    const name = decodeURIComponent(new URL(q.url, "http://x").pathname.slice(1));
    if (!/^[A-Za-z0-9_-]+\.jpg$/.test(name)) { r.writeHead(404); return r.end(); }
    let st; try { st = statSync(join(root, name)); } catch { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": st.size, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    createReadStream(join(root, name)).pipe(r);
  });
  srv.listen(0, "127.0.0.1", () => res({ base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() }));
});

const b = await openBench();
try {
  await b.page.evaluate(() => new Promise((ok, no) => { const s = document.createElement("script"); s.src = "/lensiq-pet.js"; s.onload = ok; s.onerror = no; document.head.appendChild(s); }));
  await b.page.waitFor("window.LQPet && typeof LQPet.detect === 'function' && typeof LQPet.loadDetector === 'function'", 10000);
  const rows = [];
  for (const it of M.items) {
    const r = await b.page.evaluate(async (u) => {
      window.__petModel = window.__petModel || await LQPet.loadDetector();
      const im = new Image(); im.crossOrigin = "anonymous"; im.src = u; await im.decode();
      const t0 = performance.now(); const d = await LQPet.detect(window.__petModel, im); const ms = performance.now() - t0;
      return { pet: d.pet ? { x: d.pet.x, y: d.pet.y, w: d.pet.w, h: d.pet.h, score: d.pet.score } : null, species: d.species, persons: d.persons.length, ms, W: im.naturalWidth, H: im.naturalHeight };
    }, `${img.base}/${it.name}.jpg`);
    let cover = 0;
    if (r.pet) {
      const [x0, y0, x1, y1] = it.head, W = r.W, H = r.H;
      const px0 = r.pet.x * W, py0 = r.pet.y * H, px1 = (r.pet.x + r.pet.w) * W, py1 = (r.pet.y + r.pet.h) * H;
      const iw = Math.max(0, Math.min(x1, px1) - Math.max(x0, px0)), ih = Math.max(0, Math.min(y1, py1) - Math.max(y0, py0));
      cover = (iw * ih) / Math.max(1, (x1 - x0) * (y1 - y0));
    }
    rows.push({ name: it.name, species: it.species, found: !!r.pet, ok: r.species === it.species, cover, persons: r.persons, ms: r.ms });
  }
  const n = rows.length, found = rows.filter(r => r.found), by = s => rows.filter(r => r.species === s);
  const res = {
    n, found: found.length / n, species: rows.filter(r => r.ok).length / n,
    head_covered: found.filter(r => r.cover >= 0.8).length / Math.max(1, found.length),
    person_flag_rate: rows.filter(r => r.persons > 0).length / n,
    ms_median: rows.map(r => r.ms).sort((a, b2) => a - b2)[Math.floor(n / 2)],
    per_species: Object.fromEntries(["cat", "dog"].map(s => [s, { n: by(s).length, found: by(s).filter(r => r.found).length / by(s).length, species: by(s).filter(r => r.ok).length / by(s).length }])),
    backend: b.backend, source: "public dataset (Oxford-IIIT Pet, CC BY-SA 4.0)",
  };
  const pass = { found: res.found >= T.targets.found_min, species: res.species >= T.targets.species_min, head_covered: res.head_covered >= T.targets.head_covered_min };
  console.log(table(["metric", "value", "target", "pass"], [
    ["pet found", pct(res.found), "≥ " + pct(T.targets.found_min, 0), pass.found ? "yes" : "NO"],
    ["species correct", pct(res.species), "≥ " + pct(T.targets.species_min, 0), pass.species ? "yes" : "NO"],
    ["head box ≥ 80 % inside", pct(res.head_covered), "≥ " + pct(T.targets.head_covered_min, 0), pass.head_covered ? "yes" : "NO"],
    ["cats found / species", pct(res.per_species.cat.found) + " / " + pct(res.per_species.cat.species), "—", "—"],
    ["dogs found / species", pct(res.per_species.dog.found) + " / " + pct(res.per_species.dog.species), "—", "—"],
    ["person flagged (report only)", pct(res.person_flag_rate), "—", "—"],
    ["median ms / image", Math.round(res.ms_median), "—", "—"],
  ]));
  console.log(`n=${n} · source: ${res.source} · backend ${res.backend}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ res, pass, misses: rows.filter(r => !r.found || !r.ok || r.cover < 0.8).map(r => r.name) }, null, 1));
  process.exitCode = pass.found && pass.species && pass.head_covered ? 0 : 1;
} finally { await b.done(); img.close(); }
