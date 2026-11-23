#!/usr/bin/env node
// tools/build-redirect-site.mjs — the REDIRECT-ONLY site that GitHub Pages will publish at https://anirut77.github.io/lensiq/
// after cut-over (production move step A5, docs/PRODUCTION-MOVE-PLAN.md §2.6). PREPARED ONLY: it is NOT wired into
// .github/workflows/pages-lfs.yml; switching that workflow is cut-over step 1 (owner item 232), its own branch and gate.
//
//   node tools/build-redirect-site.mjs [--target https://www.<domain>/] [--out _site-redirect]
//   (target default: deploy/site-url.prod.json "base"; empty = exit 1, nothing written)
//
// GitHub Pages cannot send a 301, so every page of the full site gets a stub that sends the visitor to the SAME page on the
// new host, keeping the query string and the #hash (QR codes, shared links): <link rel="canonical">, <meta name="robots"
// content="noindex">, <meta http-equiv="refresh"> (no JavaScript) and location.replace(target + location.search +
// location.hash). The stub's CSP allows exactly its one inline script (sha256 hash) and nothing else. 404.html maps any
// other path under /lensiq/ to the same path on the new host. sw.js replaces the old service worker: it deletes every cache,
// unregisters itself and reloads its pages, so a phone that cached the old site follows the redirect. No models, no
// scripts and no data are published. Keep it for at least 12 months (printed QR codes).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { publishedFiles } from "./build-site.mjs";
import { PROD_SITE_URL, checkProdBase, readOldBase } from "./build-prod-site.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The new site's base (same rules as the production build). @param {unknown} t */
export const checkTarget = t => checkProdBase(t);

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hash = s => createHash("sha256").update(s).digest("base64");
const csp = script => `default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`;
const TEXT = "LENSIQ ย้ายไปที่อยู่ใหม่แล้ว / has moved / 已迁移";

/** The stub of one page. @param {string} target base ending in "/" @param {string} page e.g. "exam.html" */
export function stubHtml(target, page) {
  const dest = target + (page === "index.html" ? "" : page);
  const script = `location.replace(${JSON.stringify(dest)}+location.search+location.hash)`;
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp(script)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${TEXT}</title>
<link rel="canonical" href="${esc(dest)}">
<meta http-equiv="refresh" content="0; url=${esc(dest)}">
<script>${script}</script>
</head>
<body style="font-family:system-ui,sans-serif;margin:40px 16px;text-align:center">
<p><a href="${esc(dest)}">${TEXT}</a></p>
</body>
</html>
`;
}

/** 404.html: any path under the old project path goes to the same path on the new host. @param {string} target @param {string} oldPath e.g. "/lensiq/" */
export function notFoundHtml(target, oldPath) {
  const o = String(oldPath).replace(/\/+$/, "");
  const script = `var p=location.pathname,o=${JSON.stringify(o)};if(o&&(p===o||p.indexOf(o+"/")===0))p=p.slice(o.length);` +
    `location.replace(${JSON.stringify(target)}+p.replace(/^\\/+/,"")+location.search+location.hash)`;
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp(script)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${TEXT}</title>
<script>${script}</script>
</head>
<body style="font-family:system-ui,sans-serif;margin:40px 16px;text-align:center">
<p><a href="${esc(target)}">${TEXT}</a></p>
</body>
</html>
`;
}

/** The replacement service worker: clears every cache, unregisters itself, reloads its pages (which then redirect). */
export const SW_UNREGISTER = `/* sw.js (redirect site, tools/build-redirect-site.mjs): LENSIQ has moved. Clears this origin's caches, unregisters itself
 * and reloads its open pages, which then follow the redirect to the new address. Intercepts nothing. */
"use strict";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: "window" });
    for (const c of pages) { try { await c.navigate(c.url); } catch (e) { /* page closed */ } }
  })());
});
`;

/**
 * Writes the redirect site (out is deleted first). @param {{out: string, target: string, pages: string[], oldPath: string}} o
 * @returns {{stubs: number, files: number}}
 */
export function buildRedirectSite(o) {
  const target = checkTarget(o.target);
  const out = resolve(o.out);
  if (out === repo || repo.startsWith(out + sep) || out === resolve(repo, "_site")) throw new Error("refusing to write into " + out);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let stubs = 0;
  for (const p of o.pages) {
    if (!/^[a-z0-9][a-z0-9-]*\.html$/.test(p)) throw new Error("not a page file name: " + p);
    if (p === "404.html") continue;
    writeFileSync(join(out, p), stubHtml(target, p));
    stubs++;
  }
  writeFileSync(join(out, "404.html"), notFoundHtml(target, o.oldPath));
  writeFileSync(join(out, "sw.js"), SW_UNREGISTER);
  writeFileSync(join(out, ".nojekyll"), "");
  return { stubs, files: stubs + 3 };
}

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const args = process.argv.slice(2);
  const arg = k => (args.includes(k) ? String(args[args.indexOf(k) + 1] || "") : null);
  try {
    let target = arg("--target");
    if (target == null) target = String(JSON.parse(readFileSync(join(repo, PROD_SITE_URL), "utf8")).base || "");
    if (!target) throw new Error(`no new address yet: ${PROD_SITE_URL} "base" is empty (the owner decides the domain). Nothing was written.`);
    checkTarget(target);
    const pages = publishedFiles(repo).filter(f => /^[^/]+\.html$/.test(f));
    const oldPath = new URL(readOldBase()).pathname;
    const r = buildRedirectSite({ out: resolve(repo, arg("--out") || "_site-redirect"), target, pages, oldPath });
    console.log(`build-redirect-site: ${r.stubs} page stub(s) + 404.html + sw.js -> ${arg("--out") || "_site-redirect"} (target ${target}; old path ${oldPath})`);
  } catch (e) { console.error("build-redirect-site: FAILED — " + /** @type {Error} */ (e).message); process.exit(1); }
}
