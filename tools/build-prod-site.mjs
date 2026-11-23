#!/usr/bin/env node
// tools/build-prod-site.mjs — the PRODUCTION site bundle for the Cloudflare Pages project "lensiq-prod-site" (production move
// step A3, docs/PRODUCTION-MOVE-PLAN.md; SELL-READY 2026-11-23 decision 11 ก). It never touches the GitHub Pages build:
// pages-lfs.yml keeps running `node tools/build-site.mjs` with no flag, and nothing here is published by it.
//
//   node tools/build-prod-site.mjs [--base https://www.<domain>/] [--out _site-prod]
//
//   1. the production address: --base, else deploy/site-url.prod.json "base" (empty until the owner decides the domain,
//      SELL-READY items 8 / 9: then exit 1 and nothing is built). https, root path, never github.io / pages.dev / workers.dev.
//   2. node tools/build-site.mjs --customer --site-config deploy/public-site.prod.json --out <out>: the customer lock
//      (research demo, age/gender, expression, face parsing off) and never the test backend (customerSiteConfig refuses
//      workers.dev / -test / the test Turnstile key). apiBase "" in that file = the bundle has no API yet.
//   3. postProcess(): the old address (deploy/site-url.json, https://anirut77.github.io/lensiq/) becomes the production base
//      in every page, sitemap.xml and robots.txt; every page except 404.html gets one <link rel="canonical"> to its own URL;
//      `_headers` adds what a <meta> CSP cannot (frame-ancestors) plus X-Frame-Options, nosniff and Referrer-Policy. The
//      page CSP itself stays in each page's <meta> (tools/csp-meta.mjs), so the header never widens or narrows it.
//   4. checks (exit 1): a file over 25 MiB (Cloudflare Pages limit per file), an absolute /lensiq/ path (the site is served at
//      the ROOT of the new host), or a script that still names the old address and is not in OLD_BASE_ALLOWED.
// Root-path crawl of the result: node tools/check-site.mjs --dir _site-prod --root (deploy-prod.yml runs it before a deploy).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { listTree } from "./build-site.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PROD_SITE_CONFIG = "deploy/public-site.prod.json";
export const PROD_SITE_URL = "deploy/site-url.prod.json";
export const SITE_URL_FILE = "deploy/site-url.json";
/** Cloudflare Pages: 25 MiB per file (https://developers.cloudflare.com/pages/platform/limits/, read 2026-11-18). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Scripts that may still name the old address, with the reason. Everything else is rewritten or fails the build. */
export const OLD_BASE_ALLOWED = Object.freeze([
  "lensiq-pet.js",        // LQPet.LINK: changed on cut-over day together with LENSIQ_CARD_SHOW_ADDRESS (plan §2.6, step 7); off until then
  "admin-measurements.js" // a demo-script text shown in the back office (docs/sales); updated with the sales kit on cut-over (step 5)
]);

/** Hosts that are never the production site: the old site, Cloudflare preview / workers hosts, local hosts, other projects. */
const NOT_PROD_HOST = /(^|\.)github\.io$|(^|\.)pages\.dev$|(^|\.)workers\.dev$|^localhost$|^\d+\.\d+\.\d+\.\d+$|^\[|(^|\.)(faksak\.com|tripsdna\.com)$|dearday|aidanex|kaguwood/;

/** The production base URL ("https://www.<domain>/"), or throws. @param {unknown} b @returns {string} */
export function checkProdBase(b) {
  const s = String(b ?? "");
  let u;
  try { u = new URL(s); } catch { throw new Error(`production base ${JSON.stringify(s.slice(0, 80))} is not a URL`); }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash || u.pathname !== "/" || s !== u.origin + "/") {
    throw new Error(`production base ${JSON.stringify(s.slice(0, 80))} must be a plain https origin with a trailing "/" (the site is served at the root)`);
  }
  if (NOT_PROD_HOST.test(u.hostname)) throw new Error(`production base ${JSON.stringify(s.slice(0, 80))} is the old site, a preview / workers host, a local host or another project`);
  return s;
}

/** deploy/site-url.prod.json "base": "" while the domain is not decided, else a checked base. @param {string} [file] */
export function readProdBase(file = join(repo, PROD_SITE_URL)) {
  const b = String(JSON.parse(readFileSync(file, "utf8")).base ?? "").trim();
  return b ? checkProdBase(b) : "";
}

/** The old public address (deploy/site-url.json), e.g. "https://anirut77.github.io/lensiq/". */
export const readOldBase = (file = join(repo, SITE_URL_FILE)) => String(JSON.parse(readFileSync(file, "utf8")).base || "");

/** The `_headers` file of the production site. */
export function headersText() {
  return "# _headers: response headers of the production site (tools/build-prod-site.mjs; Cloudflare Pages)\n" +
    "# The page CSP stays in each page's own meta tag; the header adds only what a meta tag cannot (frame-ancestors).\n" +
    "/*\n" +
    "  Content-Security-Policy: frame-ancestors 'self'\n" +
    "  X-Frame-Options: SAMEORIGIN\n" +
    "  X-Content-Type-Options: nosniff\n" +
    "  Referrer-Policy: strict-origin-when-cross-origin\n";
}

const isRootPage = f => /^[^/]+\.html$/.test(f);
const notVendor = f => !f.startsWith("vendor/");

/** One canonical link to the page's own URL, before </head>, when the page has none. @param {string} html @param {string} url */
export function addCanonical(html, url) {
  if (/<link\s+rel="canonical"/i.test(html)) return html;
  const at = html.search(/<\/head>/i);
  if (at < 0) return html;
  return html.slice(0, at) + `<link rel="canonical" href="${url}">\n` + html.slice(at);
}

/** Path-absolute "/lensiq…" references (they work only under the old project path). @param {string} text @returns {string[]} */
export function rootPathRefs(text) {
  return [...String(text).matchAll(/(["'`(=]\s*)(\/lensiq)(?=[/"'`?#)]|$)/gm)].map(m => m[0]);
}
/** [{file, refs}] of pages, scripts and styles (outside vendor/) with such references. @param {string} dir */
export function rootPathProblems(dir) {
  return listTree(dir).filter(f => notVendor(f) && /\.(html|js|mjs|css)$/.test(f))
    .map(f => ({ file: f, refs: rootPathRefs(readFileSync(join(dir, f), "utf8")) })).filter(x => x.refs.length);
}
/** Files (outside vendor/) that still name `oldBase`, sorted. @param {string} dir @param {string} oldBase */
export function oldBaseLeft(dir, oldBase) {
  return listTree(dir).filter(f => notVendor(f) && /\.(html|js|mjs|css|xml|txt|json)$/.test(f) && readFileSync(join(dir, f), "utf8").includes(oldBase));
}
/** [{file, size}] over the limit. @param {string} dir @param {number} [limit] */
export function oversized(dir, limit = MAX_FILE_BYTES) {
  return listTree(dir).map(f => ({ file: f, size: statSync(join(dir, f)).size })).filter(x => x.size > limit);
}

/**
 * Turns an assembled site folder into the production site (in place). Returns what changed.
 * @param {string} dir @param {{base: string, oldBase?: string}} o
 */
export function postProcess(dir, o) {
  const base = checkProdBase(o.base), oldBase = o.oldBase ?? readOldBase();
  if (!/^https:\/\/[^/]+\/.*\/$|^https:\/\/[^/]+\/$/.test(oldBase)) throw new Error("old base must be an https URL ending in /");
  const rewritten = [], canonical = [];
  for (const f of listTree(dir)) {
    if (!(isRootPage(f) || f === "sitemap.xml" || f === "robots.txt")) continue;
    const file = join(dir, f);
    const before = readFileSync(file, "utf8");
    let text = before.split(oldBase).join(base);
    if (text !== before) rewritten.push(f);
    if (isRootPage(f) && f !== "404.html") {
      const withC = addCanonical(text, base + (f === "index.html" ? "" : f));
      if (withC !== text) canonical.push(f);
      text = withC;
    }
    if (text !== before) writeFileSync(file, text);
  }
  writeFileSync(join(dir, "_headers"), headersText());
  return { base, oldBase, rewritten, canonical, left: oldBaseLeft(dir, oldBase) };
}

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const args = process.argv.slice(2);
  const arg = k => (args.includes(k) ? String(args[args.indexOf(k) + 1] || "") : null);
  const fail = msg => { console.error("build-prod-site: FAILED — " + msg); process.exit(1); };
  let base;
  try {
    const given = arg("--base");
    base = given != null ? checkProdBase(given) : readProdBase();
  } catch (e) { fail(/** @type {Error} */ (e).message); }
  if (!base) fail(`no production address yet: ${PROD_SITE_URL} "base" is empty (the owner decides the domain, SELL-READY items 8 / 9). Nothing was built.`);
  const out = resolve(repo, arg("--out") || "_site-prod");
  if (out === repo || repo.startsWith(out + sep) || out === resolve(repo, "_site")) fail("refusing to build into " + out);
  if (!existsSync(join(repo, PROD_SITE_CONFIG))) fail(PROD_SITE_CONFIG + " not found");
  const r = spawnSync(process.execPath, [join(repo, "tools", "build-site.mjs"), "--customer", "--site-config", PROD_SITE_CONFIG, "--out", out], { cwd: repo, stdio: "inherit" });
  if (r.status !== 0) fail("tools/build-site.mjs --customer exited " + r.status);
  const rep = postProcess(out, { base });
  console.log(`build-prod-site: base ${rep.base} · old address rewritten in ${rep.rewritten.length} file(s) · canonical added to ${rep.canonical.length} page(s) · _headers written`);
  const big = oversized(out), roots = rootPathProblems(out), left = rep.left.filter(f => !OLD_BASE_ALLOWED.includes(f));
  for (const b of big) console.error(`  over 25 MiB: ${b.file} (${b.size} bytes)`);
  for (const x of roots) console.error(`  absolute /lensiq path (breaks at the root of the new host): ${x.file}: ${x.refs.slice(0, 3).join(" ")}`);
  for (const f of left) console.error(`  still names the old address ${rep.oldBase}: ${f}`);
  if (big.length || roots.length || left.length) fail(`${big.length + roots.length + left.length} problem(s)`);
  console.log(`build-prod-site: OK -> ${relative(repo, out) || out} (${rep.left.length ? "old address kept on purpose in " + rep.left.join(", ") : "no old address left"})`);
}
