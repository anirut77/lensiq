#!/usr/bin/env node
// tools/self-host-fonts.mjs — stop every page from contacting Google Fonts (privacy / PDPA: the request discloses the
// visitor's IP address and user agent to Google in the USA).
//
// The Prompt font (SIL OFL 1.1) is vendored under vendor/fonts/prompt/ and declared with @font-face in styles.css,
// which every page already loads. This tool:
//   1. removes <link rel="preconnect" href="https://fonts.googleapis.com|fonts.gstatic.com"> and the Google Fonts
//      stylesheet <link> from every ./*.html in the repo root;
//   2. bumps styles.css?v= to STYLES_V (the stylesheet now carries the @font-face rules);
//   3. rewrites the page's CSP <meta> with tools/csp-meta.mjs policy() (which no longer allows Google origins).
// Idempotent: a second run changes nothing.
//
//   node tools/self-host-fonts.mjs             rewrite all pages
//   node tools/self-host-fonts.mjs --check     exit 1 if any page still references fonts.googleapis/gstatic (CI)
//   node tools/self-host-fonts.mjs a.html      only these files
//   node tools/self-host-fonts.mjs --fetch     (maintainers) re-download the woff2 subsets + print the @font-face block
//                                              to paste into styles.css. Needs network; never run in CI.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { apply, policy } from "./csp-meta.mjs";

const GOOGLE = /fonts\.(googleapis|gstatic)\.com/i;
// a whole <link ...> line (with its indentation and line break) that points at Google Fonts
const LINK_RE = /[ \t]*<link\b[^>]*\bhref\s*=\s*["']https?:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>[ \t]*\r?\n?/gi;

/** Removes Google Fonts <link>s. Returns the new html. */
export function strip(html) {
  return html.replace(LINK_RE, "");
}

/** True when the html still references a Google Fonts origin anywhere (links, CSP, @import, inline style). */
export function referencesGoogle(html) {
  return GOOGLE.test(html);
}

// styles.css gained the @font-face rules in this version: pages linking an older ?v= get it bumped, so a cached
// stylesheet without the fonts is not combined with the removed Google <link>
export const STYLES_V = 8;
export function bumpStyles(html) {
  return html.replace(/(href\s*=\s*["'])styles\.css(?:\?v=(\d+))?(["'])/gi, (m, a, v, b) => (v && +v >= STYLES_V ? m : `${a}styles.css?v=${STYLES_V}${b}`));
}

/** strip() + styles.css version bump + CSP meta refresh — what the CLI does to one page. */
export function transform(html, pol = policy()) {
  return apply(bumpStyles(strip(html)), pol);
}

const SUBSETS = ["thai", "latin-ext", "latin"];
const WEIGHTS = [300, 400, 500, 600, 700];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function fetchFonts(repo) {
  const url = `https://fonts.googleapis.com/css2?family=Prompt:wght@${WEIGHTS.join(";")}&display=swap`;
  const css = await (await fetch(url, { headers: { "user-agent": UA } })).text();
  const out = join(repo, "vendor/fonts/prompt");
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  const faces = [];
  for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g)) {
    const [, subset, body] = m;
    if (!SUBSETS.includes(subset)) continue;
    const weight = /font-weight:\s*(\d+)/.exec(body)[1];
    const src = /url\(([^)]+)\)/.exec(body)[1];
    const range = /unicode-range:\s*([^;]+);/.exec(body)[1].replace(/\s+/g, "");
    const file = `prompt-${weight}-${subset}.woff2`;
    const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
    writeFileSync(join(out, file), buf);
    faces.push({ weight: +weight, order: SUBSETS.indexOf(subset), rule: `@font-face{font-family:Prompt;font-style:normal;font-weight:${weight};font-display:swap;src:url(vendor/fonts/prompt/${file}) format("woff2");unicode-range:${range}}` });
    console.error(`saved ${file} (${buf.length} B)`);
  }
  const ofl = await (await fetch("https://raw.githubusercontent.com/google/fonts/main/ofl/prompt/OFL.txt")).text();
  if (/Open Font License/.test(ofl)) writeFileSync(join(out, "OFL.txt"), ofl);
  faces.sort((a, b) => a.weight - b.weight || a.order - b.order);
  console.log(faces.map(f => f.rule).join("\n"));
  console.error("Paste the block above into styles.css (replacing the old @font-face rules) and bump VERSION in sw.js.");
}

async function main(argv) {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = argv.slice(2);
  if (args.includes("--fetch")) return fetchFonts(repo);
  const check = args.includes("--check");
  const files = args.filter(a => !a.startsWith("--")).map(a => resolve(a));
  if (!files.length) for (const f of readdirSync(repo).filter(f => f.endsWith(".html")).sort()) files.push(join(repo, f));
  const connect = (process.env.LENSIQ_CSP_CONNECT || "").split(",").filter(Boolean);
  const pol = policy({ connect });
  let changed = 0, left = 0;
  for (const f of files) {
    const html = readFileSync(f, "utf8");
    const name = f.startsWith(repo) ? f.slice(repo.length + 1) : f;
    if (check) {
      if (referencesGoogle(html)) { left++; console.log(`GOOGLE ${name}`); }
      continue;
    }
    const out = transform(html, pol);
    if (referencesGoogle(out)) { left++; console.log(`WARN ${name}: still references Google Fonts (not a <link>; fix by hand)`); }
    if (out !== html) { changed++; writeFileSync(f, out); console.log(`updated ${name}`); }
  }
  console.log(`${files.length} page(s), ${check ? left + " reference Google Fonts" : changed + " updated, " + left + " with leftovers"}`);
  if (left) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main(process.argv);
