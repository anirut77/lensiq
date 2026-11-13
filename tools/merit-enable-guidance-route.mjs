#!/usr/bin/env node
// tools/merit-enable-guidance-route.mjs — Merit stream E. PREPARED, NOT APPLIED.
//
//   *** APPLY ONLY AFTER THE OWNER HAS PUBLISHED AT LEAST ONE ITEM ***
//
// What it prepares: the live TEST site reads the published merit guidance from the test Worker instead of the 16 bundled
// samples. Two things are needed, and both are edited here in one step:
//   1. backend/wrangler.toml, [env.test.vars] PUBLIC_ROUTES: add "/v1/merit/guidance" (the only route added; the interest
//      form /v1/merit/interest, analytics, billing and sign-in stay closed).
//   2. deploy/public-site.json "pages": add the 14 fortune pages that load the merit script (nav.js meritHook). Without this
//      the pages are built with LENSIQ_API_BASE = "" and never ask the Worker (the CSP of those pages also lacks the API origin).
// After applying: update the three locked constants listed below in the SAME commit (a deliberate, owner-approved route
// change; they assert the exact old lists), run the affected suites, push the branch, run the full gate in CI, merge only
// when green, then `npm run backend:deploy:test` and let the Pages workflow publish the site. The coordinator does this.
//
// Usage (nothing is written unless --apply AND --confirm-published are both given):
//   node tools/merit-enable-guidance-route.mjs                       dry run: prints the plan
//   node tools/merit-enable-guidance-route.mjs --apply --confirm-published
//   --toml <file> --site <file>   other files (tests use copies)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WARNING = "APPLY ONLY AFTER THE OWNER HAS PUBLISHED AT LEAST ONE ITEM";
export const GUIDANCE_ROUTE = "/v1/merit/guidance";
/** The pages that load lensiq-merit.js (nav.js meritHook). */
export const MERIT_PAGES = Object.freeze(["faceread.html", "palm.html", "horoscope.html", "tarot.html", "fengshui.html", "numbers.html", "iching.html",
  "zodiac.html", "astro.html", "dream.html", "bazi.html", "taksa.html", "lek7.html", "lifegraph.html"]);
export const LOCKED_TESTS_TO_UPDATE = Object.freeze([
  "tests/unit/backend-deploy-gate.test.js (TEST_ROUTES constant and the wrangler.toml includes check)",
  "tests/unit/backend-leads-inbox.test.js (the PUBLIC_ROUTES deepEqual in the 'form ON' test)",
  "tests/unit/deploy-tools.test.js (the committed public-site.json pages list, two assertions in 'B1 site config')",
]);

/** Adds GUIDANCE_ROUTE to PUBLIC_ROUTES of [env.test.vars] only. Idempotent. @param {string} toml */
export function enableRouteInToml(toml) {
  const start = toml.indexOf("[env.test.vars]");
  if (start < 0) throw new Error("wrangler.toml: [env.test.vars] not found (PUBLIC_ROUTES)");
  const rest = toml.slice(start + 1);
  const n = rest.search(/^\[/m);
  const end = n < 0 ? toml.length : start + 1 + n;
  const block = toml.slice(start, end);
  const re = /^(PUBLIC_ROUTES\s*=\s*")([^"\n]*)(")/m;
  const m = re.exec(block);
  if (!m) throw new Error("wrangler.toml: PUBLIC_ROUTES not found in [env.test.vars]");
  const list = m[2].split(",").map(s => s.trim()).filter(Boolean);
  if (list.includes(GUIDANCE_ROUTE)) return toml;
  const next = block.replace(re, (_, a, b, c) => a + [...list, GUIDANCE_ROUTE].join(",") + c);
  return toml.slice(0, start) + next + toml.slice(end);
}

/** Adds MERIT_PAGES to "pages" of deploy/public-site.json (other keys untouched, same 2-space layout). Idempotent. @param {string} json */
export function enableSitePages(json) {
  const o = JSON.parse(json);
  if (!Array.isArray(o.pages)) throw new Error("public-site.json: pages missing");
  const missing = MERIT_PAGES.filter(p => !o.pages.includes(p));
  if (!missing.length) return json;
  o.pages = [...o.pages, ...missing];
  return JSON.stringify(o, null, 2) + (json.endsWith("\n") ? "\n" : "");
}

const here = dirname(fileURLToPath(import.meta.url));
const arg = (a, k, d) => { const i = a.indexOf(k); return i >= 0 && a[i + 1] ? resolve(a[i + 1]) : d; };

function main(a) {
  const tomlFile = arg(a, "--toml", join(here, "..", "backend", "wrangler.toml"));
  const siteFile = arg(a, "--site", join(here, "..", "deploy", "public-site.json"));
  const apply = a.includes("--apply"), confirmed = a.includes("--confirm-published");
  const t0 = readFileSync(tomlFile, "utf8"), s0 = readFileSync(siteFile, "utf8");
  const t1 = enableRouteInToml(t0), s1 = enableSitePages(s0);
  console.log("*** " + WARNING + " ***\n");
  console.log("1. backend/wrangler.toml [env.test.vars] PUBLIC_ROUTES: " + (t1 === t0 ? "already contains " : "add ") + GUIDANCE_ROUTE);
  console.log("2. deploy/public-site.json pages: " + (s1 === s0 ? "already contains the 14 merit pages" : "add " + MERIT_PAGES.filter(p => !JSON.parse(s0).pages.includes(p)).join(", ")));
  console.log("\nIn the same commit update these locked tests (they assert the exact old lists):");
  for (const x of LOCKED_TESTS_TO_UPDATE) console.log("  - " + x);
  if (!apply) { console.log("\nDry run: nothing written. To apply: --apply --confirm-published (only after at least one item is published)."); return 0; }
  if (!confirmed) { console.error("\nRefused: --apply needs --confirm-published (the owner has published at least one item). Nothing written."); return 1; }
  if (t1 !== t0) writeFileSync(tomlFile, t1);
  if (s1 !== s0) writeFileSync(siteFile, s1);
  console.log("\nApplied. Next: update the locked tests above, run the affected suites, push the branch, full gate in CI, merge on green, deploy.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error("merit-enable-guidance-route: " + e.message); process.exitCode = 1; }
}
