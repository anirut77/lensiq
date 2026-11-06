#!/usr/bin/env node
// tools/check-site.mjs — verify the assembled GitHub Pages site (_site/, built by tools/build-site.mjs).
//
//  1. forbidden files: fails if server.py, any *.py, tests/, tools/, docs/, types/, package.json … are inside the site
//  2. static references: every local src/href in every page, and every vendor/… / models/… path named in the
//     published scripts, exists in the site (catches a page script or model left out of the allowlist)
//  3. crawl (skipped with --static): serves the site under /lensiq/ like the GitHub Pages project site, opens every
//     page in headless Chrome in TH and 中文 (?cpu, fake camera), opens the menu, <details> and tabs, and fails on any
//     same-origin 4xx/5xx response (except /api/*, which needs server.py and is expected to be absent on Pages) or an
//     uncaught exception while loading
//
//   node tools/check-site.mjs                 all three checks on _site/
//   node tools/check-site.mjs --static        checks 1 + 2 only (no browser)
//   node tools/check-site.mjs --dir out       other site directory
//   node tools/check-site.mjs palm zh         crawl only pages whose name contains a word
//   LQ_CHROME=/path/to/chrome                 other Chrome binary
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listTree, scanForbidden } from "./build-site.mjs";
import { serve } from "./static-server.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const di = args.indexOf("--dir");
const site = resolve(repo, di >= 0 ? args[di + 1] : "_site");
const filters = args.filter((a, i) => !a.startsWith("--") && !(di >= 0 && i === di + 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// optional files that are referenced but deliberately not published (licence not cleared, opt-in only)
const OPTIONAL = [/^vendor\/models\/faceparse-[^/]*\.onnx$/];

if (!existsSync(site)) { console.error(`check-site: ${site} does not exist — run node tools/build-site.mjs first`); process.exit(1); }
let failures = 0;
const fail = msg => { failures++; console.log("FAIL " + msg); };

// 1. forbidden files
const bad = scanForbidden(site);
for (const b of bad) fail(`forbidden file in site: ${b.file} (${b.why})`);
console.log(`check-site: forbidden files — ${bad.length ? bad.length + " found" : "none"}`);

// 2. static references
const files = listTree(site);
const have = new Set(files);
const pages = files.filter(f => /^[^/]+\.html$/.test(f));
const repoPages = readdirSync(repo).filter(f => f.endsWith(".html"));
for (const p of repoPages) if (!have.has(p)) fail(`page missing from site: ${p}`);
let refs = 0;
const exists = rel => have.has(rel) || [...have].some(f => f.startsWith(rel.replace(/\/?$/, "/"))) || OPTIONAL.some(re => re.test(rel));
for (const p of pages) {
  const html = readFileSync(join(site, p), "utf8");
  for (const m of html.matchAll(/\s(?:src|href)\s*=\s*["']([^"'#]+)["']/gi)) {
    const u = m[1].trim();
    if (!u || /^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith("//") || u.startsWith("/api/")) continue; // http:, data:, mailto:, …
    const rel = posix.normalize(u.split("?")[0].replace(/^\.\//, "").replace(/^\//, ""));
    refs++;
    if (!exists(rel)) fail(`${p}: reference to missing ${u}`);
  }
}
for (const f of files.filter(f => /\.(js|mjs|html)$/.test(f) && !f.startsWith("vendor/"))) {
  const src = readFileSync(join(site, f), "utf8");
  for (const m of src.matchAll(/["'`](?:\.\/)?((?:vendor\/)?models\/[\w./-]+\.(?:onnx|task|tflite|json|bin)|vendor\/[\w./-]+\.(?:js|mjs|wasm|onnx|task|tflite|json|bin|woff2|jpg|png|svg))["'`]/g)) {
    const rel = m[1].startsWith("vendor/") ? m[1] : "vendor/" + m[1];
    refs++;
    if (!exists(rel)) fail(`${f}: names missing asset ${m[1]}`);
  }
}
console.log(`check-site: ${files.length} file(s), ${pages.length} page(s), ${refs} static reference(s) checked`);

// 3. crawl
if (!args.includes("--static")) {
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const errors = [];
  let current = null;
  const srv = await serve(site, {
    prefix: "/lensiq",
    onResponse: (status, path) => { if (status >= 400 && !path.startsWith("/lensiq/api/") && !path.startsWith("/api/")) errors.push({ page: current, status, path }); }
  });
  const browser = await launch();
  const init = [];
  try { init.push(readFileSync(resolve(repo, "tests/e2e/fake-cams.js"), "utf8"), "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}"); } catch { /* optional */ }
  const crawl = pages.filter(f => !filters.length || filters.some(w => f.includes(w)));
  let n = 0;
  try {
    for (const lang of ["th", "zh"]) {
      for (const f of crawl) {
        current = `${f} [${lang}]`;
        const before = errors.length;
        const page = await browser.newPage(null, { initScripts: init, isolated: true });
        try {
          await page.goto(`${srv.base}/${f}?cpu&lang=${lang}`);
          await sleep(1200);
          await page.evaluate(async () => {
            document.querySelector(".nav-toggle")?.click();
            document.querySelectorAll("details").forEach(d => { d.open = true; });
            for (const el of [...document.querySelectorAll("[role=tab], .tabs button, .seg button")].slice(0, 12)) {
              try { el.click(); } catch { /* ignore */ }
              await new Promise(r => setTimeout(r, 100));
            }
          });
          await sleep(600);
          const ex = page.consoleErrors.filter(e => e.kind === "exception").map(e => String(e.text).split("\n")[0]);
          const got = errors.slice(before);
          if (got.length) fail(`${current}: ${got.map(e => `${e.status} ${e.path}`).join(", ")}`);
          else if (ex.length) fail(`${current}: uncaught exception: ${ex[0]}`);
          else console.log(`ok   ${current} (${page.requests.length} requests)`);
          n++;
        } catch (e) {
          fail(`${current}: ${e.message}`);
        } finally { await page.close(); }
      }
    }
  } finally {
    await browser.close();
    await srv.close();
  }
  console.log(`check-site: crawled ${n} page load(s) (${crawl.length} page(s) x th, zh) under /lensiq/`);
}

console.log(failures ? `check-site: FAILED (${failures} problem(s))` : "check-site: OK");
process.exit(failures ? 1 : 0);
