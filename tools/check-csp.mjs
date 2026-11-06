#!/usr/bin/env node
// tools/check-csp.mjs — headless check that every page works under the GitHub Pages <meta> CSP (tools/csp-meta.mjs).
// Serves the repo statically (no HTTP security headers, like GitHub Pages), opens each *.html with ?cpu in headless
// Chrome and fails on any CSP violation or uncaught exception.
//
//   node tools/check-csp.mjs              inject the meta on the fly into pages that do not have it yet (pre-integration)
//   node tools/check-csp.mjs --as-is      serve files untouched; pages without the meta are reported as MISSING
//   node tools/check-csp.mjs palm studio  only pages whose name contains one of the words
//   LQ_CHROME=/path/to/chrome             other Chrome binary
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../tests/e2e/cdp.mjs";
import { apply, policy } from "./csp-meta.mjs";
import { serve } from "./static-server.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const asIs = args.includes("--as-is");
const filters = args.filter(a => !a.startsWith("--"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HAS_META = /<meta\s+http-equiv\s*=\s*["']?content-security-policy/i;
const RECORDER = `window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.effectiveDirective + " " + (e.blockedURI || "inline") + " @" + (e.sourceFile || "").replace(location.origin, "") + ":" + e.lineNumber), true);`;

const pages = readdirSync(repo).filter(f => f.endsWith(".html") && (!filters.length || filters.some(w => f.includes(w)))).sort();
const missing = [];
const pol = policy();
const srv = await serve(repo, {
  transformHtml: (html, p) => {
    if (HAS_META.test(html)) return html;
    const n = p.replace(/^\//, ""); if (!missing.includes(n)) missing.push(n);
    return asIs ? html : apply(html, pol);
  }
});
const browser = await launch();
let bad = 0;
const init = [RECORDER];
try {
  init.push(readFileSync(resolve(repo, "tests/e2e/fake-cams.js"), "utf8"), "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}");
} catch { /* fake cameras optional */ }
try {
  // sanity: the policy really is active (an injected inline script must be blocked)
  {
    const page = await browser.newPage(null, { initScripts: [RECORDER] });
    await page.goto(`${srv.base}/index.html`);
    await page.evaluate(() => { const s = document.createElement("script"); s.textContent = "window.__ran = 1"; document.body.append(s); });
    await sleep(200);
    const ran = await page.evaluate(() => window.__ran === 1);
    if (ran && !asIs) { console.log("FAIL harness: inline script was not blocked — policy not active"); bad++; }
    await page.close();
  }
  for (const f of pages) {
    const page = await browser.newPage(null, { initScripts: init });
    let v = [], ex = [];
    try {
      await page.goto(`${srv.base}/${f}?cpu`);
      await sleep(1500);
      v = await page.evaluate(() => window.__csp || []);
      v = v.concat(page.consoleErrors.filter(e => /Content Security Policy|Refused to/i.test(e.text || "")).map(e => e.text.slice(0, 200)));
      ex = page.consoleErrors.filter(e => e.kind === "exception").map(e => String(e.text).split("\n")[0]);
    } catch (e) { ex.push(String(e.message || e)); }
    await page.close();
    const tag = asIs && missing.includes(f) ? " (MISSING meta)" : "";
    if (v.length || ex.length) { bad++; console.log(`FAIL ${f}${tag}\n  ${[...new Set(v)].concat(ex).slice(0, 8).join("\n  ")}`); }
    else console.log(`ok   ${f}${tag}`);
  }
} finally {
  await browser.close();
  await srv.close();
}
if (missing.length) console.log(`\n${missing.length} page(s) without the CSP meta${asIs ? "" : " (injected for this run)"} — run: node tools/csp-meta.mjs`);
console.log(`${pages.length} page(s), ${bad} failing`);
process.exit(bad || (asIs && missing.length) ? 1 : 0);
