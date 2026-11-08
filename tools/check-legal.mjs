#!/usr/bin/env node
// tools/check-legal.mjs — pre-deploy guard for the seller / legal details (help.html, terms.html, privacy.html).
//
// The public documents never carry raw "[placeholder]" text: every detail not announced yet is a
// <span class="ph pend" data-seller="key"> filled at run time from window.LENSIQ_SELLER (lensiq-config.js), with a neutral
// "announced before sales open · use the contact form" wording until then. This tool reports:
//   * raw bracket placeholders left in the pages (e.g. "[contact e-mail]")            -> always a FAILURE
//   * data-seller keys used by the pages that LENSIQ_SELLER leaves empty               -> report
//   * the backend seller settings (backend/wrangler.toml SELLER_NAME / _TAX_ID / _ADDRESS) and whether they match
// and FAILS (exit 1) when billing is enabled while anything required is still missing. Billing counts as enabled when
// LENSIQ_SELLER.sales_open is true, backend/wrangler.toml has BILLING_ENABLED = "true" or FREE_MODE = "false", or
// --billing / LENSIQ_BILLING=1 is given (use that in the production deploy job).
//
//   node tools/check-legal.mjs                 report; exit 1 only on raw placeholders or billing-on-with-gaps
//   node tools/check-legal.mjs --billing       as if billing were enabled (the deploy gate)
//   node tools/check-legal.mjs --dir _site     check the built site's copies of the pages (config from the same dir)
//   node tools/check-legal.mjs --json          machine-readable result
// It also prints the owner's go-live checklist (lensiq-golive.js — the same list help.html?owner=1 shows), report only.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const PAGES = ["help.html", "terms.html", "privacy.html"];
/** Keys that must be filled before anything is sold (a receipt / tax invoice and the PDPA notice need them). */
export const REQUIRED = ["name", "tax_id", "address", "email", "effective_date", "dpo_email"];
/** Keys that are optional at launch (status page, LINE, cookie row …) — reported, never fatal. Draft numbers and
 *  counsel notes are reported through counsel_confirmed. */
export const SKIP_KEYS = new Set(["draft", "counsel"]);

/** Raw bracket placeholders in a page: "[…]" as the whole text of an element (or of a .ph span). */
export function rawPlaceholders(html) {
  const out = [];
  const body = String(html).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const re = />\s*(\[[^\]<>\n]{2,80}\])\s*</g;
  let m;
  while ((m = re.exec(body))) out.push(m[1]);
  return out;
}
/** data-seller keys used in a page (with counts). */
export function sellerKeys(html) {
  const out = {};
  for (const m of String(html).matchAll(/data-seller="([a-z_]+)"/g)) out[m[1]] = (out[m[1]] || 0) + 1;
  return out;
}
/** window.LENSIQ_SELLER from the text of lensiq-config.js (evaluated in an empty sandbox: no DOM, no network). */
export function sellerFromConfig(src) {
  const window = {};
  try { vm.runInNewContext(String(src), { window, location: { pathname: "/" } }, { timeout: 1000 }); } catch { /* malformed config: treat as empty */ }
  return window.LENSIQ_SELLER && typeof window.LENSIQ_SELLER === "object" ? window.LENSIQ_SELLER : {};
}
/** The site switches of lensiq-config.js (same sandbox as sellerFromConfig). */
export function siteConfigFromConfig(src) {
  const window = {};
  try { vm.runInNewContext(String(src), { window, location: { pathname: "/" } }, { timeout: 1000 }); } catch { /* malformed config */ }
  return { api: window.LENSIQ_API_BASE || "", turnstile: window.LENSIQ_TURNSTILE_SITEKEY || "", google: window.LENSIQ_GOOGLE_CLIENT_ID || "",
    profile: window.LENSIQ_PROFILE || "demo", locked: !!(window.LENSIQ_RESEARCH && window.LENSIQ_RESEARCH.locked),
    ageGender: window.LENSIQ_AGE_GENDER !== false, faceparse: window.LENSIQ_FACEPARSE === true };
}
/** Go-live checklist items (lensiq-golive.js checklist) for this config. */
export function goLiveList(src) {
  const G = createRequire(import.meta.url)("../lensiq-golive.js");
  return G.checklist(sellerFromConfig(src), siteConfigFromConfig(src));
}
/** The [vars] values of backend/wrangler.toml that matter here (simple KEY = "value" lines). */
export function wranglerVars(toml) {
  const out = {};
  for (const m of String(toml || "").matchAll(/^\s*([A-Z_]+)\s*=\s*"([^"]*)"/gm)) if (!(m[1] in out)) out[m[1]] = m[2];
  return out;
}
const filled = v => typeof v === "string" && !!v.trim() && !/^\[.*\]$/.test(v.trim());

/**
 * @param {{seller: Record<string, any>, wrangler?: Record<string, string>, pages: Record<string, string>, billing?: boolean}} o
 * @returns {{ok: boolean, billing: boolean, why: string[], raw: Record<string, string[]>, keys: string[], missing: string[], missingRequired: string[], backend: {missing: string[], mismatch: string[]}, counselConfirmed: boolean}}
 */
export function checkLegal({ seller, wrangler = {}, pages, billing = false }) {
  const s = seller || {};
  const on = !!(billing || s.sales_open === true || String(wrangler.BILLING_ENABLED || "").toLowerCase() === "true" || String(wrangler.FREE_MODE || "true").toLowerCase() === "false");
  const raw = {}, used = new Set();
  for (const [name, html] of Object.entries(pages)) {
    const r = rawPlaceholders(html);
    if (r.length) raw[name] = r;
    for (const k of Object.keys(sellerKeys(html))) if (!SKIP_KEYS.has(k)) used.add(k);
  }
  const keys = [...used].sort();
  const missing = keys.filter(k => !filled(s[k]));
  const missingRequired = REQUIRED.filter(k => !filled(s[k]));
  const bk = { SELLER_NAME: "name", SELLER_TAX_ID: "tax_id", SELLER_ADDRESS: "address" };
  const backend = { missing: [], mismatch: [] };
  for (const [v, k] of Object.entries(bk)) {
    if (!filled(wrangler[v])) backend.missing.push(v);
    else if (filled(s[k]) && wrangler[v].trim() !== String(s[k]).trim()) backend.mismatch.push(`${v} ≠ LENSIQ_SELLER.${k}`);
  }
  const why = [];
  const rawN = Object.values(raw).reduce((a, x) => a + x.length, 0);
  if (rawN) why.push(`${rawN} raw [placeholder](s) in ${Object.keys(raw).join(", ")}`);
  if (on) {
    if (missingRequired.length) why.push(`billing is enabled but LENSIQ_SELLER is missing: ${missingRequired.join(", ")}`);
    if (backend.missing.length) why.push(`billing is enabled but backend/wrangler.toml is missing: ${backend.missing.join(", ")}`);
    if (backend.mismatch.length) why.push(`seller details differ between the site and the Worker: ${backend.mismatch.join(", ")}`);
    if (s.counsel_confirmed !== true) why.push("billing is enabled but LENSIQ_SELLER.counsel_confirmed is not true (age thresholds, transfer bases, retention periods)");
  }
  return { ok: !why.length, billing: on, why, raw, keys, missing, missingRequired, backend, counselConfirmed: s.counsel_confirmed === true };
}

function main() {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const di = args.indexOf("--dir");
  const dir = di >= 0 ? resolve(repo, args[di + 1]) : repo;
  const read = f => (existsSync(f) ? readFileSync(f, "utf8") : "");
  const pages = {};
  for (const p of PAGES) { const t = read(join(dir, p)); if (t) pages[p] = t; }
  if (!Object.keys(pages).length) { console.error(`check-legal: none of ${PAGES.join(", ")} found in ${dir}`); process.exit(1); }
  const seller = sellerFromConfig(read(join(dir, "lensiq-config.js")) || read(join(repo, "lensiq-config.js")));
  const wrangler = wranglerVars(read(join(repo, "backend", "wrangler.toml")));
  const billing = args.includes("--billing") || process.env.LENSIQ_BILLING === "1";
  const r = checkLegal({ seller, wrangler, pages, billing });
  const cfgSrc = read(join(dir, "lensiq-config.js")) || read(join(repo, "lensiq-config.js"));
  const golive = goLiveList(cfgSrc);
  if (args.includes("--json")) { console.log(JSON.stringify(Object.assign({ golive }, r), null, 2)); process.exit(r.ok ? 0 : 1); }
  console.log(`check-legal: billing ${r.billing ? "ENABLED" : "off"} · pages ${Object.keys(pages).join(", ")}`);
  console.log(`check-legal: raw [placeholders] — ${Object.keys(r.raw).length ? JSON.stringify(r.raw) : "none"}`);
  console.log(`check-legal: seller keys used ${r.keys.length} · not announced yet ${r.missing.length ? r.missing.join(", ") : "none"}`);
  console.log(`check-legal: required before sales ${r.missingRequired.length ? "MISSING " + r.missingRequired.join(", ") : "all filled"} · Worker SELLER_* ${r.backend.missing.length ? "missing " + r.backend.missing.join(", ") : "set"}${r.backend.mismatch.length ? " · " + r.backend.mismatch.join(", ") : ""} · counsel ${r.counselConfirmed ? "confirmed" : "not confirmed"}`);
  const open = golive.filter(x => x.state === "todo" || x.state === "warn");
  console.log(`check-legal: go-live checklist (help.html?owner=1) — ${golive.filter(x => x.state === "ok").length} done · ${open.length} open${open.length ? ": " + open.map(x => x.id).join(", ") : ""} · ${golive.filter(x => x.state === "outside").length} need outside resources`);
  if (!r.ok) { for (const w of r.why) console.log("FAIL " + w); process.exit(1); }
  console.log(r.billing ? "check-legal: OK — ready to sell" : "check-legal: OK — the pages show the demo notice and the neutral \"announced before sales open\" wording until these are filled");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
