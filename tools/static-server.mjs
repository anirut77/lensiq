// tools/static-server.mjs — tiny zero-dependency static file server for the headless tools (check-csp, mobile-audit).
// Serves the repo read-only on 127.0.0.1:<random>. Optional `transformHtml(html, path)` rewrites .html responses
// (check-csp uses it to inject the CSP <meta> before tools/csp-meta.mjs has been run on the files).
// Like GitHub Pages it sends no security headers, so only <meta> policies apply.
// Optional `prefix` (e.g. "/lensiq") mounts the root under a sub-path like a GitHub Pages project site; requests
// outside it get 404. `onResponse(status, path)` is called after every response (tools/check-site.mjs records 4xx).
// Optional `mounts` ({"/url-prefix": directory}) serves another folder under a URL prefix on the same origin
// (tools/exam-hall-face-eval.mjs: measurement-only files that are kept outside the repo).
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

export function serve(root, { transformHtml = null, port = 0, prefix = "", onResponse = null, mounts = null } = {}) {
  const root0 = resolve(root);
  const extra = Object.entries(mounts || {}).map(([m, dir]) => [m.replace(/\/+$/, ""), resolve(dir)]);
  const mount = prefix.replace(/\/+$/, "");
  const server = createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    if (onResponse) { const path = p; res.on("finish", () => onResponse(res.statusCode, path)); }
    if (mount) {
      if (p === mount) { res.writeHead(301, { Location: mount + "/" }).end(); return; }
      if (!p.startsWith(mount + "/")) { res.writeHead(404).end("not found"); return; }
      p = p.slice(mount.length);
    }
    let base = root0;
    for (const [m, dir] of extra) if (p.startsWith(m + "/")) { base = dir; p = p.slice(m.length); break; }
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
    server.listen(port, "127.0.0.1", () => ok({ base: `http://127.0.0.1:${server.address().port}${mount}`, close: () => new Promise(r => server.close(r)), server }));
  });
}
