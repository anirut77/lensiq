#!/usr/bin/env node
// tools/plate-labeller.mjs — local labelling tool for the owner's plate photos (docs/PLATE-TRAINING.md). Starts a server on
// 127.0.0.1 only (never on the network) that serves tools/plate-labeller.html + .js, the photos of the training folder and
// the vendored face detector (BlazeFace short range, Apache-2.0, the same blur code as Product Check: lensiq-pc-run.js
// faceRuns / faceBlur). The page writes ONLY three things, all inside the training folder (outside the repo):
// labels/plates-photo-labels.csv, labels/privacy.json and blurred/<photo>. Nothing leaves the machine.
//
//   node tools/plate-labeller.mjs [--root ~/LENSIQ-field/plates-train] [--port 0]
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkRoot, paths, ROOT_DEFAULT, parsePrivacy } from "./plate-train-prep.mjs";
import { parseLabels } from "./plate-field-eval.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".wasm": "application/wasm",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".tflite": "application/octet-stream", ".json": "application/json", ".data": "application/octet-stream" };
// repo files the page may load (read-only): the labeller itself, the Product Check face blur code and its vendored detector
const REPO_ALLOW = [/^\/vendor\/mediapipe\//, /^\/vendor\/models\/face-gate\//, /^\/lensiq-pc\.js$/, /^\/lensiq-pc-run\.js$/, /^\/lensiq-med\.js$/];
export const PHOTO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(jpe?g|png)$/i;
const MAX_BODY = 40 * 1024 * 1024;

function body(req) {
  return new Promise((res, rej) => {
    const parts = []; let n = 0;
    req.on("data", c => { n += c.length; if (n > MAX_BODY) { rej(new Error("too large")); req.destroy(); } else parts.push(c); });
    req.on("end", () => res(Buffer.concat(parts))); req.on("error", rej);
  });
}
/** validate what the page saves: a labelling sheet plate-field-eval can read, a privacy file plate-train-prep can read */
export function checkSave(labels, privacy) {
  const l = parseLabels(String(labels || "")), p = parsePrivacy(JSON.stringify(privacy || {}));
  return [...l.errors, ...p.errors];
}

export function start({ root, port = 0 }) {
  checkRoot(root, repo);
  const P = paths(root);
  for (const d of [P.photos, dirname(P.labels), P.blurred]) mkdirSync(d, { recursive: true });
  const send = (res, code, type, data) => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(data); };
  const file = (res, f) => { if (!existsSync(f) || !statSync(f).isFile()) return send(res, 404, "text/plain", "not found");
    res.writeHead(200, { "Content-Type": TYPES[extname(f).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" }); createReadStream(f).pipe(res); };
  const server = createServer(async (req, res) => {
    let p; try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { return send(res, 400, "text/plain", "bad url"); }
    try {
      // same-origin writes only (the page itself); a request from another site carries another Origin
      if (req.method === "POST" && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, "text/plain", "origin");
      if (req.method === "GET" && (p === "/" || p === "/plate-labeller.html")) return file(res, join(repo, "tools", "plate-labeller.html"));
      if (req.method === "GET" && p === "/plate-labeller.js") return file(res, join(repo, "tools", "plate-labeller.js"));
      if (req.method === "GET" && p === "/api/state") {
        const photos = readdirSync(P.photos).filter(f => PHOTO_RE.test(f)).sort();
        const blurred = existsSync(P.blurred) ? readdirSync(P.blurred).filter(f => PHOTO_RE.test(f)) : [];
        return send(res, 200, "application/json", JSON.stringify({ root, photos, blurred,
          labels: existsSync(P.labels) ? readFileSync(P.labels, "utf8") : "", privacy: existsSync(P.privacy) ? JSON.parse(readFileSync(P.privacy, "utf8")) : { v: 1, files: {} } }));
      }
      if (req.method === "GET" && p.startsWith("/photos/")) {
        const n = p.slice(8); if (!PHOTO_RE.test(n)) return send(res, 404, "text/plain", "not found");
        return file(res, join(P.photos, n));
      }
      if (req.method === "POST" && p === "/api/save") {
        const j = JSON.parse((await body(req)).toString("utf8"));
        const errors = checkSave(j.labels, j.privacy);
        if (errors.length) return send(res, 422, "application/json", JSON.stringify({ errors }));
        writeFileSync(P.labels, String(j.labels)); writeFileSync(P.privacy, JSON.stringify(j.privacy, null, 1));
        return send(res, 200, "application/json", JSON.stringify({ ok: true }));
      }
      if (req.method === "POST" && p.startsWith("/api/blurred/")) {
        const n = p.slice(13);
        if (!PHOTO_RE.test(n) || !existsSync(join(P.photos, n))) return send(res, 404, "text/plain", "no such photo");
        const b = await body(req);
        const jpeg = b[0] === 0xff && b[1] === 0xd8, png = b.readUInt32BE(0) === 0x89504e47;
        if (!(jpeg || png)) return send(res, 422, "text/plain", "not an image");
        writeFileSync(join(P.blurred, n), b);
        return send(res, 200, "application/json", JSON.stringify({ ok: true }));
      }
      if (req.method === "GET" && REPO_ALLOW.some(r => r.test(p))) {
        const f = normalize(join(repo, p));
        if (!f.startsWith(repo + sep)) return send(res, 404, "text/plain", "not found");
        return file(res, f);
      }
      return send(res, 404, "text/plain", "not found");
    } catch (e) { return send(res, 500, "text/plain", String(e && e.message || e)); }
  });
  return new Promise(r => server.listen(port, "127.0.0.1", () => r({ server, url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(c => server.close(c)) })));
}

async function main(argv) {
  const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  try {
    const s = await start({ root: resolve(get("--root", ROOT_DEFAULT)), port: +get("--port", 0) || 0 });
    console.log(`plate labeller: open ${s.url} in Chrome (this machine only). Ctrl+C to stop.`);
  } catch (e) { console.error("plate-labeller:", e && e.message || e); process.exitCode = 2; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
