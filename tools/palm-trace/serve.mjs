#!/usr/bin/env node
// tools/palm-trace/serve.mjs — serves the local palm tap-to-trace labelling tool (owner decision 174 ก) on 127.0.0.1 only.
// OWNER TOOL, LOCAL ONLY: it serves exactly four files of this folder and nothing else (no repo file, no photo, no upload
// route: GET / HEAD only). The photo is opened in the page with a file input and never reaches this server. Labels are saved
// by the browser's save dialog wherever the owner chooses (next to the photo or in ~/LENSIQ-field/), never in the repo.
//   node tools/palm-trace/serve.mjs [--port 8765]     then open the printed http://127.0.0.1:<port>/ address in Chrome
import { createServer } from "node:http";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TYPES = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8" };
/** URL path -> file of this folder (exact allow-list) */
const FILES = { "/": "index.html", "/index.html": "index.html", "/palm-trace.js": "palm-trace.js", "/palm-trace-core.js": "palm-trace-core.js", "/palm-trace.css": "palm-trace.css" };
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'none'; form-action 'none'; " +
  "base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; media-src 'none'; font-src 'none'; manifest-src 'none'; frame-ancestors 'none'";
const BAD_RAW = /\.\.|\\|%2f|%5c|%2e|%00/i;

/** @param {{port?: number}} [o] @returns {Promise<import("node:http").Server>} */
export function startTraceServer({ port = 0 } = {}) {
  const srv = createServer((req, res) => {
    const send = (code, body = "", type = "text/plain; charset=utf-8") => {
      res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": CSP, "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin", "X-Frame-Options": "DENY" });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    const p = srv.address(), own = typeof p === "object" && p ? p.port : 0;
    const host = String(req.headers.host || "");
    if (host !== "127.0.0.1:" + own && host !== "localhost:" + own) return send(421, "wrong host");
    if (req.method !== "GET" && req.method !== "HEAD") return send(405, "read only");
    const rawPath = String(req.url || "").split("?")[0];
    if (BAD_RAW.test(rawPath)) return send(400, "bad path");
    const f = Object.prototype.hasOwnProperty.call(FILES, rawPath) ? FILES[rawPath] : null;
    if (!f) return send(404, "not found");
    let body;
    try { body = readFileSync(join(here, f)); } catch { return send(404, "not found"); }
    send(200, body, TYPES[f.split(".").pop()]);
  });
  return new Promise((resolve, reject) => { srv.once("error", reject); srv.listen(port, "127.0.0.1", () => resolve(srv)); });
}

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const i = process.argv.indexOf("--port"), port = i > 0 ? Number(process.argv[i + 1]) : 8765;
  if (!Number.isInteger(port) || port < 0 || port > 65535) { console.error("--port must be 0-65535"); process.exit(2); }
  const srv = await startTraceServer({ port });
  const a = srv.address();
  console.log("palm-trace: http://127.0.0.1:" + (typeof a === "object" && a ? a.port : port) + "/  (this Mac only; Ctrl+C to stop)");
  console.log("palm-trace: the photo stays in the browser page; save each label next to the photo or in ~/LENSIQ-field/, never in the repo");
}
