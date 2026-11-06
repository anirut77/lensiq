#!/usr/bin/env node
// tools/check-external.mjs — headless proof that no page contacts a third-party origin (fonts, CDNs, analytics…).
// Serves the repo statically, opens every ./*.html (?cpu, fake camera) in headless Chrome, waits for idle and fails if
// any request leaves the page's own origin (data:, blob: and about: are fine).
//
//   node tools/check-external.mjs            pages are passed through tools/self-host-fonts.mjs transform() on the fly
//                                            (pre-integration: shows the result before the HTML files are rewritten)
//   node tools/check-external.mjs --as-is    serve the files untouched (CI, after integration)
//   node tools/check-external.mjs palm zh    only pages whose name contains one of the words
//   LQ_CHROME=/path/to/chrome                other Chrome binary
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../tests/e2e/cdp.mjs";
import { transform } from "./self-host-fonts.mjs";
import { serve } from "./static-server.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const asIs = args.includes("--as-is");
const filters = args.filter(a => !a.startsWith("--"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pages = readdirSync(repo).filter(f => f.endsWith(".html") && (!filters.length || filters.some(w => f.includes(w)))).sort();

const srv = await serve(repo, { transformHtml: html => asIs ? html : transform(html) });
const origin = new URL(srv.base).origin;
const browser = await launch();
const init = [];
try { init.push(readFileSync(resolve(repo, "tests/e2e/fake-cams.js"), "utf8"), "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}"); } catch { /* optional */ }
let bad = 0;
try {
  for (const lang of ["th", "zh"]) {
    for (const f of pages) {
      const page = await browser.newPage(null, { initScripts: init, isolated: true });
      try {
        await page.goto(`${srv.base}/${f}?cpu&lang=${lang}`);
        await sleep(1500);
        // open the mobile menu / first details so lazily-loaded assets are requested too
        await page.evaluate(() => { document.querySelector(".nav-toggle")?.click(); document.querySelectorAll("details").forEach(d => { d.open = true; }); });
        await sleep(400);
        const ext = [...new Set(page.requests.map(r => r.url).filter(u => {
          if (/^(data|blob|about|chrome|devtools):/i.test(u)) return false;
          try { return new URL(u).origin !== origin; } catch { return true; }
        }))];
        if (ext.length) { bad++; console.log(`FAIL ${f} [${lang}] -> ${ext.slice(0, 5).join(", ")}${ext.length > 5 ? " …" : ""}`); }
        else console.log(`ok   ${f} [${lang}] (${page.requests.length} same-origin requests)`);
      } catch (e) {
        bad++; console.log(`FAIL ${f} [${lang}]: ${e.message}`);
      } finally { await page.close(); }
    }
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(`${pages.length} page(s) x 2 languages, ${bad} with third-party requests`);
process.exit(bad ? 1 : 0);
