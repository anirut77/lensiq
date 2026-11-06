// tests/bench/lib.mjs — shared plumbing for the accuracy benchmarks (no dependencies).
// Serves the repo at / and the dataset root ($LQ_BENCH_DATA) read-only at /__data/, launches headless Chrome WITHOUT
// WebGL (TF.js runs on WASM exactly like the production pages here) and opens tests/bench/bench.html (served as /__bench.html?cpu).
// Datasets are never copied into the repo; caches go to $LQ_BENCH_CACHE (default: <data>/.lq-cache).
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../e2e/cdp.mjs";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA = process.env.LQ_BENCH_DATA ? resolve(process.env.LQ_BENCH_DATA) : "";
export const CACHE = DATA ? resolve(process.env.LQ_BENCH_CACHE || join(DATA, ".lq-cache")) : "";

/* exit 0 with a clear message when the dataset is not available (CI without data) */
export function needData(sub, what) {
  const p = DATA && join(DATA, sub);
  if (!p || !existsSync(p)) {
    console.log(`skip ${what}: dataset not found (${DATA ? p : "LQ_BENCH_DATA not set"}) — see tests/README.md (Accuracy benchmarks)`);
    process.exit(0);
  }
  if (CACHE) mkdirSync(CACHE, { recursive: true });
  return p;
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".bin": "application/octet-stream", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".css": "text/css", ".task": "application/octet-stream", ".tflite": "application/octet-stream", ".onnx": "application/octet-stream" };
function serveFile(root, rel, res) {
  const p = normalize(join(root, decodeURIComponent(rel)));
  if (p !== root && !p.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
  let st; try { st = statSync(p); } catch { res.writeHead(404); return res.end(); }
  if (!st.isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[extname(p).toLowerCase()] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-store" });
  createReadStream(p).pipe(res);
}
export function serve() {
  return new Promise(res => {
    const srv = createServer((req, r) => {
      if (req.method !== "GET") { r.writeHead(405); return r.end(); }
      const u = new URL(req.url, "http://x");
      if (u.pathname.startsWith("/__data/")) { if (!DATA) { r.writeHead(404); return r.end(); } return serveFile(DATA, u.pathname.slice(8), r); }
      if (u.pathname === "/__bench.html") return serveFile(REPO, "tests/bench/bench.html", r);
      serveFile(REPO, u.pathname.slice(1) || "index.html", r);
    });
    srv.listen(0, "127.0.0.1", () => res({ base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() }));
  });
}

/* {page, base, done()} — page has window.LQB (tests/bench/bench.html) ready */
export async function openBench() {
  const s = await serve();
  const browser = await launch();
  const page = await browser.newPage(`${s.base}/__bench.html?cpu`, { timeout: 60000 });
  await page.waitFor("window.LQB && window.LQB.ready", 60000);
  const backend = await page.evaluate("LQB.backend()");
  return { page, base: s.base, backend, async done() { await browser.close(); s.close(); } };
}

export const dataUrl = rel => "/__data/" + rel.split(sep).join("/");
export const pct = (x, d = 1) => Number.isFinite(x) ? (100 * x).toFixed(d) + "%" : "—";
export const fx = (x, d = 3) => Number.isFinite(x) ? x.toFixed(d) : "—";
export function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map(r => String(r[i]).length)));
  const line = r => "| " + r.map((c, i) => String(c).padEnd(w[i])).join(" | ") + " |";
  return [line(head), "| " + w.map(n => "-".repeat(n)).join(" | ") + " |", ...rows.map(line)].join("\n");
}
export function ensureDir(p) { mkdirSync(dirname(p), { recursive: true }); return p; }
