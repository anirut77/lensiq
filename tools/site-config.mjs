#!/usr/bin/env node
// tools/site-config.mjs — `npm run site:set-api`: writes deploy/public-site.json (read by tools/build-site.mjs), so the
// file is never edited by hand. Both values are PUBLIC (the Worker origin and the Turnstile SITE key); no secret here.
//
//   npm run site:set-api -- --api-base https://lensiq-api-test.<subdomain>.workers.dev --sitekey <Turnstile site key>
//   npm run site:set-api -- --clear        back to inactive (apiBase ""): the site is built exactly as before
//   npm run site:set-api -- --show
// Scope is fixed by the owner's decision D0: medicine.html only, analytics off, member sign-in off, tester gate on.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ALLOWED, DOMAINS_FILE, approvedApiHosts, isOwnApiHost } from "./lib/cf-guard.mjs";
import { SITE_CONFIG, isTurnstileSiteKey, readSiteConfig } from "./build-site.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NOTE = "Closed-test site config, read by tools/build-site.mjs. apiBase empty = inactive (the site is built exactly as without this file). " +
  "Set it with: npm run site:set-api -- --api-base https://lensiq-api-test.<subdomain>.workers.dev --sitekey <Turnstile SITE key>";

/** @param {string[]} argv @param {{file?: string, domains?: string, print?: (s: string) => void}} [io] */
export function main(argv, io = {}) {
  const print = io.print || (s => console.log(s));
  const file = io.file || join(repo, SITE_CONFIG);
  const arg = k => (argv.includes(k) ? String(argv[argv.indexOf(k) + 1] || "") : "");
  if (argv.includes("--show")) { print(readFileSync(file, "utf8")); return 0; }
  const clear = argv.includes("--clear");
  const apiBase = clear ? "" : arg("--api-base").trim().replace(/\/+$/, "");
  const sitekey = clear ? "" : arg("--sitekey").trim();
  if (!clear) {
    let host = "";
    try { host = new URL(apiBase).hostname; } catch { /* reported below */ }
    // the public site may only be pointed at LENSIQ's own test Worker: its workers.dev host, or a custom hostname the
    // owner approved in deploy/domains.json (docs/CUSTOM-DOMAIN.md)
    let approved;
    try { approved = approvedApiHosts(io.domains || join(repo, DOMAINS_FILE), p => readFileSync(p, "utf8")); } catch (e) { print("REFUSED: " + e.message); return 3; }
    if (!isOwnApiHost(host, approved) || apiBase !== "https://" + host) {
      print(`REFUSED: --api-base must be https://${ALLOWED.worker}.<your-subdomain>.workers.dev or https://<a hostname listed in ${DOMAINS_FILE}> (no path).`);
      return 3;
    }
    if (!sitekey) { print("REFUSED: --sitekey <Turnstile SITE key> is required (AI calls are refused without Turnstile)."); return 2; }
    // the value is published with the site: only the SITE key shape passes; the value itself is never printed back
    if (!isTurnstileSiteKey(sitekey)) {
      print("REFUSED: --sitekey is not a Turnstile SITE key (it starts with 0x4 and has about 24 characters). " +
        "Never pass the widget SECRET key or an API key here: this value is published.");
      return 3;
    }
  }
  const j = { note: NOTE, apiBase, turnstileSiteKey: sitekey, pages: ["medicine.html"], analytics: false, member: false, testerGate: true };
  const before = (() => { try { return readFileSync(file, "utf8"); } catch { return null; } })();
  writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  try { readSiteConfig(file); } catch (e) { if (before != null) writeFileSync(file, before); print("REFUSED: " + e.message); return 2; }
  print(clear ? `${SITE_CONFIG}: inactive (no page calls the API).` : `${SITE_CONFIG}: API ${apiBase} on medicine.html only · analytics off · tester gate on. Build with: node tools/build-site.mjs`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(main(process.argv.slice(2)));
