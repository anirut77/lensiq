#!/usr/bin/env node
// tools/attendance-face/run.mjs — Attendance face-recognition options (owner order 2026-11-14, item E). Evaluation only.
// Computes face descriptors / embeddings for every image in the LOCKED manifest with the current face-api.js pipeline
// (baseline) and the candidate ONNX embedders, in headless Chrome (no WebGL; TF.js and ORT on WASM, 1 thread, like the
// live pages on GitHub Pages, which are not cross-origin isolated). Writes raw outputs only; scoring is score.mjs.
//
//   node tools/attendance-face/run.mjs [--only faceapi]     (data: ~/LENSIQ-field/evals/attendance-face/)
//
// Refuses to run unless (tools/eval-guard.mjs) manifest.jsonl, protocol.json, models.json, CREDITS.tsv, the harness copies
// in harness/ and the model files are locked in the committed evals-locks/attendance-face.sha256, the repo harness files
// are byte-identical to the locked copies, and every image matches its sha256 in the manifest.
// Images are read from ~/LENSIQ-field and never copied into the repo.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cpus, loadavg, platform, release, totalmem } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { assertLocked, phaseDir } from "../eval-guard.mjs";
import { launch } from "../../tests/e2e/cdp.mjs";

const PHASE = "attendance-face";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = phaseDir(PHASE);
const HARNESS = ["run.mjs", "page.js", "page.html", "score.mjs"];
const sha = b => createHash("sha256").update(b).digest("hex");

const models = JSON.parse(readFileSync(join(DIR, "models.json"), "utf8"));
const manifest = readFileSync(join(DIR, "manifest.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
const lockFiles = ["manifest.jsonl", "protocol.json", "models.json", "CREDITS.tsv", ...HARNESS.map(h => "harness/" + h),
  ...models.onnx.flatMap(m => [m.file, ...(m.externalData || [])])];
const g = assertLocked(PHASE, lockFiles);
console.error(`eval-guard OK: ${g.files.length} files locked in ${g.lockFile} (commit ${g.lockCommit})`);
for (const h of HARNESS) {
  if (sha(readFileSync(join(REPO, "tools/attendance-face", h))) !== sha(readFileSync(join(DIR, "harness", h)))) throw new Error(`harness ${h} differs from the locked copy`);
}
for (const r of manifest) if (sha(readFileSync(join(DIR, r.file))) !== r.sha256) throw new Error(`image ${r.file} does not match the manifest`);
console.error(`images OK: ${manifest.length} match manifest.jsonl`);

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : "";
const onnx = models.onnx.filter(m => !only || m.key === only);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".wasm": "application/wasm", ".jpg": "image/jpeg"
};
function file(root, rel, res) {
  const p = normalize(join(root, decodeURIComponent(rel)));
  if (p !== root && !p.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
  let st; try { st = statSync(p); } catch { res.writeHead(404); return res.end(); }
  if (!st.isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[extname(p).toLowerCase()] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-store" });
  createReadStream(p).pipe(res);
}
const srv = await new Promise(ok => {
  const s = createServer((req, res) => {
    if (req.method !== "GET") { res.writeHead(405); return res.end(); }
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/__afe.html") return file(REPO, "tools/attendance-face/page.html", res);
    if (u.pathname.startsWith("/__data/")) return file(DIR, u.pathname.slice(8), res);
    file(REPO, u.pathname.slice(1) || "index.html", res);
  });
  s.listen(0, "127.0.0.1", () => ok(s));
});
const base = `http://127.0.0.1:${srv.address().port}`;
const load0 = loadavg();
const browser = await launch();
const page = await browser.newPage(`${base}/__afe.html?cpu`, { timeout: 60000 });
await page.waitFor("window.AFE && window.AFE.ready", 60000);
const spec = onnx.map(m => ({ key: m.key, url: "/__data/" + m.file, externalData: m.externalData && m.externalData.map(p => "/__data/" + p), pre: m.pre, dim: m.dim }));
const info = await page.evaluate(`AFE.init(${JSON.stringify(spec)})`);
console.error("init", JSON.stringify(info));
const chrome = await page.evaluate("navigator.userAgent");

// warm-up: the first 3 images are run once and discarded (JIT, WASM compile, first-run allocations)
for (const r of manifest.slice(0, 3)) await page.evaluate(`AFE.image(${JSON.stringify("/__data/" + r.file)})`);
const out = [], t0 = Date.now();
for (const r of manifest) {
  const x = await page.evaluate(`AFE.image(${JSON.stringify("/__data/" + r.file)})`);
  out.push({ id: r.id, view: r.view, ...x });
  process.stderr.write(`\r  ${out.length}/${manifest.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
process.stderr.write("\n");
const load1 = loadavg();
await browser.close(); srv.close();

const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(join(DIR, "results"), { recursive: true });
const dest = join(DIR, "results", `raw-${only || "all"}-${stamp}.json`);
writeFileSync(dest, JSON.stringify({
  phase: PHASE, commit, lockCommit: g.lockCommit, startedUtc: new Date(t0).toISOString(), seconds: (Date.now() - t0) / 1000,
  machine: {
    cpu: cpus()[0].model, cores: cpus().length, memGB: Math.round(totalmem() / 2 ** 30), os: `${platform()} ${release()}`, chrome,
    loadavgStart: load0.map(x => +x.toFixed(2)), loadavgEnd: load1.map(x => +x.toFixed(2))
  },
  info, models: onnx.map(m => m.key), rows: out
}));
console.error("raw outputs:", dest);
