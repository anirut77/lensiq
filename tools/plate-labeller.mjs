#!/usr/bin/env node
// tools/plate-labeller.mjs — local labelling tool for the owner's plate photos (docs/PLATE-TRAINING.md). Starts a server on
// 127.0.0.1 only that serves tools/plate-labeller.html + .js, the photos of the training folder and the vendored face
// detector (BlazeFace short range, Apache-2.0, the same blur code as Product Check: lensiq-pc-run.js faceRuns / faceBlur).
// The page writes ONLY these files, all inside the training folder (outside the repo): labels/plates-photo-labels.csv,
// labels/privacy.json, labels/blurred-index.json (hash of the blur boxes each blurred photo was made with) and
// blurred/<photo>. Nothing leaves the machine.
//
// Security (review of 2026-11-13, B1 / B2):
// - repo files: an EXACT allow-list (URL -> git-tracked file), built at start; nothing else of the repo is reachable;
// - any request whose raw path holds "..", a backslash or an encoded slash / backslash / dot is refused before decoding;
// - every request must carry Host 127.0.0.1:PORT or localhost:PORT (DNS rebinding); a POST also needs Origin equal to it;
// - a random per-run token (in the start URL) is required on /api/* (header X-LQ-Token) and on /photos/* (?t=).
//
//   node tools/plate-labeller.mjs [--root ~/LENSIQ-field/plates-train] [--port 0]
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkRoot, paths, ROOT_DEFAULT, parsePrivacy, regionsHash, hasExif } from "./plate-train-prep.mjs";
import { parseLabels } from "./plate-field-eval.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".wasm": "application/wasm",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".tflite": "application/octet-stream", ".txt": "text/plain; charset=utf-8" };
export const PHOTO_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}(\.[A-Za-z0-9_-]{1,20})?\.(jpe?g|png)$/i;
const MAX_BODY = 40 * 1024 * 1024;
const BAD_RAW = /\.\.|\\|%2f|%5c|%2e/i;

/** URL path -> repo file: the page, its script, the Product Check blur code and the vendored face detector (git-tracked only) */
export function allowList(root = repo) {
  const map = new Map([["/", join(root, "tools", "plate-labeller.html")], ["/plate-labeller.html", join(root, "tools", "plate-labeller.html")],
    ["/plate-labeller.js", join(root, "tools", "plate-labeller.js")]]);
  for (const f of ["lensiq-pc.js", "lensiq-pc-run.js", "lensiq-med.js"]) map.set("/" + f, join(root, f));
  let tracked = [];
  try { tracked = execFileSync("git", ["ls-files", "vendor/mediapipe", "vendor/models/face-gate"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean); } catch { tracked = []; }
  for (const rel of tracked) if (!/\.\.|\\/.test(rel)) map.set("/" + rel, join(root, rel));
  return map;
}
/** validate what the page saves: a labelling sheet plate-field-eval can read, a privacy file plate-train-prep can read */
export function checkSave(labels, privacy) {
  const l = parseLabels(String(labels || "")), p = parsePrivacy(JSON.stringify(privacy || {}));
  return [...l.errors, ...p.errors];
}
function body(req) {
  return new Promise((res, rej) => {
    const parts = []; let n = 0;
    req.on("data", c => { n += c.length; if (n > MAX_BODY) { rej(new Error("too large")); req.destroy(); } else parts.push(c); });
    req.on("end", () => res(Buffer.concat(parts))); req.on("error", rej);
  });
}
const same = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && timingSafeEqual(x, y); };

export function start({ root, port = 0 }) {
  checkRoot(root, repo);
  const P = paths(root), token = randomBytes(16).toString("hex"), files = allowList();
  const indexFile = join(dirname(P.labels), "blurred-index.json");
  for (const d of [P.photos, dirname(P.labels), P.blurred]) mkdirSync(d, { recursive: true });
  const send = (res, code, type, data) => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(data); };
  const file = (res, f) => {
    if (!existsSync(f) || !statSync(f).isFile()) return send(res, 404, "text/plain", "not found");
    res.writeHead(200, { "Content-Type": TYPES[extname(f).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    createReadStream(f).pipe(res);
  };
  let actualPort = 0;
  const server = createServer(async (req, res) => {
    const rawUrl = String(req.url || ""), rawPath = rawUrl.split("?")[0];
    const hosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
    if (!hosts.includes(String(req.headers.host || ""))) return send(res, 403, "text/plain", "host");
    if (BAD_RAW.test(rawPath)) return send(res, 400, "text/plain", "bad path");
    let p, q;
    try { const u = new URL(rawUrl, "http://x"); p = decodeURIComponent(u.pathname); q = u.searchParams; } catch { return send(res, 400, "text/plain", "bad url"); }
    if (BAD_RAW.test(p)) return send(res, 400, "text/plain", "bad path");
    try {
      if (req.method === "POST" && req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, "text/plain", "origin");
      if (p.startsWith("/api/") && !same(req.headers["x-lq-token"], token)) return send(res, 403, "text/plain", "token");
      if (req.method === "GET" && p === "/api/state") {
        const photos = readdirSync(P.photos).filter(f => PHOTO_RE.test(f)).sort();
        const blurred = existsSync(P.blurred) ? readdirSync(P.blurred).filter(f => PHOTO_RE.test(f)) : [];
        return send(res, 200, "application/json", JSON.stringify({ root, photos, blurred,
          labels: existsSync(P.labels) ? readFileSync(P.labels, "utf8") : "", privacy: existsSync(P.privacy) ? JSON.parse(readFileSync(P.privacy, "utf8")) : { v: 1, files: {} } }));
      }
      if (req.method === "GET" && p.startsWith("/photos/")) {
        if (!same(q.get("t"), token)) return send(res, 403, "text/plain", "token");
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
        const jpeg = b[0] === 0xff && b[1] === 0xd8, png = b.length > 8 && b.readUInt32BE(0) === 0x89504e47;
        if (!(jpeg || png)) return send(res, 422, "text/plain", "not an image");
        if (hasExif(b)) return send(res, 422, "text/plain", "EXIF in the blurred photo: refused");
        // the blur boxes this photo was blurred with = the SAVED privacy.json now (the page saves before exporting)
        const pv = existsSync(P.privacy) ? parsePrivacy(readFileSync(P.privacy, "utf8")).files[n] : null;
        if (!pv || !pv.checked) return send(res, 409, "text/plain", "save the photo as checked first");
        writeFileSync(join(P.blurred, n), b);
        const idx = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : { v: 1, files: {} };
        idx.files[n] = { regions: regionsHash(pv.regions), at: new Date().toISOString() };
        writeFileSync(indexFile, JSON.stringify(idx, null, 1));
        return send(res, 200, "application/json", JSON.stringify({ ok: true }));
      }
      if (req.method === "GET" && files.has(p)) return file(res, files.get(p));
      return send(res, 404, "text/plain", "not found");
    } catch (e) { return send(res, 500, "text/plain", String(e && e.message || e)); }
  });
  return new Promise(r => server.listen(port, "127.0.0.1", () => {
    actualPort = server.address().port;
    r({ server, token, url: `http://127.0.0.1:${actualPort}/?t=${token}`, close: () => new Promise(c => server.close(c)) });
  }));
}

async function main(argv) {
  const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  try {
    const s = await start({ root: resolve(get("--root", ROOT_DEFAULT)), port: +get("--port", 0) || 0 });
    console.log(`plate labeller: open ${s.url} in Chrome (this machine only; the link holds this run's key). Ctrl+C to stop.`);
  } catch (e) { console.error("plate-labeller:", e && e.message || e); process.exitCode = 2; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
