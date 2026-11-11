#!/usr/bin/env node
// tools/pc-refimg.mjs — Product Check reference-image library TOOLING (round 17 P9; design §6.3, PC-D7, CTO-BRIEF L19).
// Turns reference photos into EMBEDDINGS ONLY (the MobileNetV2 vector checkout.js uses) with lensiq-pc-refimg.js, inside
// headless Chrome on this repo's own files (tools/static-server.mjs + tests/e2e/cdp.mjs). Photos are read from OUTSIDE the
// repo and never copied, uploaded or written anywhere; the library holds licence, credit, source, date, the photo's
// sha256 and the vector. No third-party pack image is collected before counsel answers L19: own retail-pack photos and
// agency images need --counsel L19-cleared, which the owner passes only after that answer.
//
//   node tools/pc-refimg.mjs embed --manifest <m.json> --out <lib.json> [--counsel L19-cleared]
//        manifest: lensiq-pc-refimg-manifest/1 (see lensiq-pc-refimg.js); photos and the output must be outside the repo
//   node tools/pc-refimg.mjs synthetic [--out <results.json>]
//        SYNTHETIC check only: canvas-drawn boxes (5 designs x 6 variants), 3 references per design, the other 3 as
//        same-design queries + every other design's queries against each key; prints and saves the counts
//        (default ~/LENSIQ-field/evals/p9/refimg-synthetic-<date>.json)
//   node tools/pc-refimg.mjs check <lib.json>      validate a library (embeddings only, allowlisted fields)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const R = createRequire(import.meta.url)("../lensiq-pc-refimg.js");
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const inRepo = p => (resolve(p) + "/").startsWith(repo + "/");
const die = (msg, code = 2) => { console.error("pc-refimg: " + msg); process.exit(code); };
const today = () => new Date().toISOString().slice(0, 10);

/** Headless Chrome on medicine.html with TF.js + lensiq-pc-refimg.js loaded; fn(page) runs, then everything closes. */
async function withPage(fn) {
  const { serve } = await import("./static-server.mjs");
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const srv = await serve(repo);
  const browser = await launch();
  try {
    const page = await browser.newPage(null, { isolated: true });
    await page.goto(`${srv.base}/medicine.html`);
    const backend = await page.evaluate(async () => {
      const load = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
      if (!window.tf) await load("vendor/tfjs/tf.es2017.min.js");
      if (!window.LQPCRefImg) await load("lensiq-pc-refimg.js");
      window.__ri = await window.LQPCRefImg.loadModel(window.tf);
      return window.__ri.backend;
    });
    return await fn(page, backend);
  } finally {
    await browser.close();
    await srv.close();
  }
}

async function embed() {
  const mf = opt("--manifest"), out = opt("--out");
  if (!mf || !out) die("embed needs --manifest <file> and --out <file>");
  if (inRepo(out)) die("the library is written outside the repo (nothing goes into vendor/ before counsel answers L19): " + out);
  let m;
  try { m = JSON.parse(readFileSync(resolve(mf), "utf8")); } catch (e) { die("manifest: " + e.message); }
  const v = R.validateManifest(m, { repoRoot: repo, counsel: opt("--counsel") });
  if (!v.ok) die("manifest refused (nothing read):\n  " + v.errors.join("\n  "));
  for (const e of v.entries) if (inRepo(e.file)) die("photo inside the repo: " + e.file);
  for (const e of v.entries) if (!existsSync(e.file)) die("photo not found: " + e.file);
  const rows = await withPage(async page => {
    const res = [];
    for (const e of v.entries) {
      const bytes = readFileSync(e.file);
      const mime = /\.png$/i.test(e.file) ? "image/png" : /\.webp$/i.test(e.file) ? "image/webp" : "image/jpeg";
      const vec = await page.evaluate(async (b, mime) => {
        const img = new Image(); img.src = `data:${mime};base64,${b}`; await img.decode();
        const c = document.createElement("canvas"), s = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        return Array.from(window.LQPCRefImg.embedCanvas(window.tf, window.__ri.model, c));
      }, bytes.toString("base64"), mime);
      res.push({ ...e, photo_sha256: createHash("sha256").update(bytes).digest("hex"), vec });
    }
    return res;
  });
  const lib = R.buildLibrary(rows, { embedder: "mnv2", built: today() });
  const ok = R.validateLibrary(lib);
  if (!ok.ok) die("library check failed: " + ok.errors.join("; "), 1);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), JSON.stringify(lib) + "\n");
  console.log(`pc-refimg: ${lib.entries.length} embeddings (${lib.dim}-d) -> ${resolve(out)}; no photo stored`);
}

async function synthetic() {
  const out = resolve(opt("--out", join(homedir(), "LENSIQ-field", "evals", "p9", `refimg-synthetic-${today()}.json`)));
  if (inRepo(out)) die("results are written outside the repo: " + out);
  const DESIGNS = R.DESIGNS.length, REFS = 3, VARIANTS = 6;
  const res = await withPage(async (page, backend) => {
    const vecs = await page.evaluate((D, V) => {
      const out = [];
      for (let d = 0; d < D; d++) for (let v = 0; v < V; v++) {
        const c = document.createElement("canvas");
        window.LQPCRefImg.drawSynthetic(c, d, v);
        out.push({ d, v, vec: Array.from(window.LQPCRefImg.embedCanvas(window.tf, window.__ri.model, c)) });
      }
      return out;
    }, DESIGNS, VARIANTS);
    return { backend, vecs };
  });
  const gtins = ["4006381333931", "8850123456787", "0012345678905", "9780201379624", "5901234123457"];
  const entries = res.vecs.filter(x => x.v < REFS).map(x => ({ key: { gtin: gtins[x.d] }, licence: "synthetic", credit: "LENSIQ synthetic box", source: "tools/pc-refimg.mjs synthetic",
    date: today(), photo_sha256: R.hexOf(x.d * 100 + x.v), vec: x.vec }));
  const lib = R.buildLibrary(entries, { embedder: "mnv2", built: today() });
  const same = { similar: 0, n: 0 }, other = { different: 0, n: 0 };
  const rows = [];
  for (const q of res.vecs.filter(x => x.v >= REFS)) {
    for (let d = 0; d < DESIGNS; d++) {
      const r = R.compare(lib, { gtin: gtins[d] }, q.vec);
      rows.push({ query: `${q.d}/${q.v}`, key: d, state: r.state, best: r.best, threshold: r.threshold });
      if (q.d === d) { same.n++; if (r.state === "similar") same.similar++; } else { other.n++; if (r.state === "looks-different") other.different++; }
    }
  }
  const report = { source: "synthetic: canvas-drawn boxes generated by lensiq-pc-refimg.js drawSynthetic, no pack artwork, no photo", date: today(), backend: res.backend,
    designs: DESIGNS, references_per_design: REFS, queries_per_design: VARIANTS - REFS, same_design_similar: same, other_design_looks_different: other,
    library_valid: R.validateLibrary(lib).ok, rows };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
  console.log(`pc-refimg synthetic (backend ${res.backend}): same design -> similar ${same.similar}/${same.n}; other design -> looks-different ${other.different}/${other.n}; saved ${out}`);
}

function check() {
  const f = argv[1];
  if (!f) die("check <lib.json>");
  const v = R.validateLibrary(JSON.parse(readFileSync(resolve(f), "utf8")));
  if (!v.ok) die(v.errors.join("; "), 1);
  console.log("pc-refimg: library ok");
}

if (cmd === "embed") await embed();
else if (cmd === "synthetic") await synthetic();
else if (cmd === "check") check();
else die("usage: embed --manifest <m.json> --out <lib.json> [--counsel L19-cleared] | synthetic [--out <file>] | check <lib.json>");
