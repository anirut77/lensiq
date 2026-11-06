// tools/static-server.mjs — tiny zero-dependency static file server for the headless tools (check-csp, mobile-audit).
// Serves the repo read-only on 127.0.0.1:<random>. Optional `transformHtml(html, path)` rewrites .html responses
// (check-csp uses it to inject the CSP <meta> before tools/csp-meta.mjs has been run on the files).
// Like GitHub Pages it sends no security headers, so only <meta> policies apply.
import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
  ".onnx": "application/octet-stream", ".task": "application/octet-stream", ".bin": "application/octet-stream",
  ".tflite": "application/octet-stream", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json"
};

export function serve(root, { transformHtml = null, port = 0 } = {}) {
  const base = resolve(root);
  const server = createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    if (p.endsWith("/")) p += "index.html";
    const file = normalize(join(base, p));
    if (!file.startsWith(base + sep) || /[\\/]\./.test(file.slice(base.length))) { res.writeHead(404).end(); return; }
    let st;
    try { st = statSync(file); } catch { res.writeHead(404).end("not found"); return; }
    if (!st.isFile()) { res.writeHead(404).end(); return; }
    const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
    if (transformHtml && type.startsWith("text/html")) {
      const body = Buffer.from(transformHtml(readFileSync(file, "utf8"), p));
      res.writeHead(200, { "Content-Type": type, "Content-Length": body.length, "Cache-Control": "no-store" }).end(body);
      return;
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Cache-Control": "no-store" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => ok({ base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)), server }));
  });
}
