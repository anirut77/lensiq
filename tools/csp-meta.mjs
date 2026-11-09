#!/usr/bin/env node
// tools/csp-meta.mjs — insert / update <meta http-equiv="Content-Security-Policy"> in every page's <head>, so the static
// GitHub Pages build gets the same policy as server.py (_csp()). Idempotent: running it twice changes nothing.
//
//   node tools/csp-meta.mjs                 update every ./*.html in the repo root
//   node tools/csp-meta.mjs --check         exit 1 if any page is missing / has an outdated meta (CI)
//   node tools/csp-meta.mjs a.html b.html   only these files
//   node tools/csp-meta.mjs --connect https://lensiq-api.onrender.com   extra connect-src origin(s) (also LENSIQ_CSP_CONNECT)
//
// The API Worker origin (window.LENSIQ_API_BASE in lensiq-config.js, docs/BACKEND.md) is added to connect-src
// automatically — but ONLY when it is configured (non-empty). Default "" keeps connect-src 'self' data: blob:.
// Likewise Turnstile (LENSIQ_TURNSTILE_SITEKEY) and Google sign-in (LENSIQ_GOOGLE_CLIENT_ID): third-party origins appear
// in the policy only when the owner configured them.
//
// Differences from the HTTP header sent by server.py (a <meta> policy cannot carry them):
//   frame-ancestors, report-uri/report-to and sandbox are ignored in <meta> by the CSP spec -> omitted.
//   Clickjacking protection on GitHub Pages therefore relies on the page not being sensitive; server.py adds
//   frame-ancestors + X-Frame-Options when it serves the pages.
// The meta goes right after <meta charset> (before any <link>/<script>), because a meta policy only applies to
// content that appears after it.
// The tag is written one directive per line (2-space indent) so no page line is long (tools/format-check.mjs). CSP splits
// directives on ";" and tokens on ASCII whitespace (LF included), so the line breaks do not change the policy; readers
// compare policies after normalizePolicy() (whitespace runs collapsed), and an old one-line tag is replaced in place.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ORIGIN_RE = /^https?:\/\/[A-Za-z0-9.\-:[\]]+\/?$/;

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/** Google Identity Services ("Sign in with Google") — the exact paths Google documents for a CSP, nothing broader. */
export const GSI = {
  script: "https://accounts.google.com/gsi/client",
  style: "https://accounts.google.com/gsi/style",
  frame: "https://accounts.google.com/gsi/",
  connect: "https://accounts.google.com/gsi/"
};

/** The policy (same directives and order as server.py _csp(), minus frame-ancestors). `turnstile: true` (only when
 *  lensiq-config.js sets LENSIQ_TURNSTILE_SITEKEY) allows Cloudflare Turnstile's script + iframe. `google: true` (only
 *  when lensiq-config.js sets LENSIQ_GOOGLE_CLIENT_ID) allows Google Identity Services — lensiq-member.js loads that
 *  script only after the visitor clicks "continue with Google", so no request is made on page load. */
export function policy({ connect = [], turnstile = false, google = false } = {}) {
  const extra = connect.map(o => String(o).trim()).filter(o => ORIGIN_RE.test(o)).map(o => o.replace(/\/$/, ""));
  if (turnstile) extra.push(TURNSTILE_ORIGIN);
  if (google) extra.push(GSI.connect);
  const scripts = ["'self' 'wasm-unsafe-eval'", turnstile ? TURNSTILE_ORIGIN : "", google ? GSI.script : ""].filter(Boolean).join(" ");
  const frames = [turnstile ? TURNSTILE_ORIGIN : "", google ? GSI.frame : ""].filter(Boolean);
  return [
    "default-src 'self'",
    "script-src " + scripts,
    "style-src 'self' 'unsafe-inline'" + (google ? " " + GSI.style : ""),
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    ("connect-src 'self' data: blob: " + extra.join(" ")).trim(),
    ...(frames.length ? ["frame-src " + frames.join(" ")] : []),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");
}

/** True when lensiq-config.js sets a non-empty LENSIQ_GOOGLE_CLIENT_ID (statement, not the comment). */
export function configuredGoogle(configSrc) {
  const m = /^[ \t]*window\.LENSIQ_GOOGLE_CLIENT_ID\s*=\s*(?:window\.LENSIQ_GOOGLE_CLIENT_ID\s*\|\|\s*)?(["'])([^"']*)\1/m.exec(String(configSrc || ""));
  return !!(m && /^[0-9A-Za-z._-]{8,200}$/.test(m[2].trim()));
}

/** The policy for the repo's current lensiq-config.js (+ extra connect-src origins). Used by check-csp.mjs too. */
export function configuredPolicy(configSrc, connect = []) {
  const c = connect.slice();
  const apiOrigin = configuredApiOrigin(configSrc);
  if (apiOrigin) c.push(apiOrigin);
  return policy({ connect: c, turnstile: configuredTurnstile(configSrc), google: configuredGoogle(configSrc) });
}

/** Origin of window.LENSIQ_API_BASE in lensiq-config.js source, or null when empty / not a plain http(s) origin. */
export function configuredApiOrigin(configSrc) {
  const m = /^[ \t]*window\.LENSIQ_API_BASE\s*=\s*(?:window\.LENSIQ_API_BASE\s*\|\|\s*)?(["'])([^"']*)\1/m.exec(String(configSrc || ""));
  if (!m || !m[2].trim()) return null;
  try {
    const u = new URL(m[2].trim());
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    return u.origin;
  } catch { return null; }
}

/** True when lensiq-config.js sets a non-empty LENSIQ_TURNSTILE_SITEKEY (statement, not the comment). */
export function configuredTurnstile(configSrc) {
  const m = /^[ \t]*window\.LENSIQ_TURNSTILE_SITEKEY\s*=\s*(?:window\.LENSIQ_TURNSTILE_SITEKEY\s*\|\|\s*)?(["'])([^"']*)\1/m.exec(String(configSrc || ""));
  return !!(m && /^[0-9A-Za-z_-]{8,}$/.test(m[2].trim()));
}

const escAttr = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const META_RE = /[ \t]*<meta\s+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>[ \t]*\r?\n?/gi;

/** Collapses every run of ASCII whitespace to one space and trims: the form in which the CSP parser sees a policy
 *  (directives split on ";", tokens on ASCII whitespace, LF included). Readers compare policies in this form, so a
 *  meta written over several lines equals the same policy on one line, and nothing else is ignored. */
export const normalizePolicy = s => String(s).replace(/[\t\n\f\r ]+/g, " ").trim();

/** The content of the page's CSP meta, normalised (normalizePolicy), or null when the page has none. */
export function metaPolicy(html) {
  const m = /<meta\s+http-equiv\s*=\s*["']?content-security-policy["']?\s+content\s*=\s*"([^"]*)"[^>]*>/i.exec(String(html));
  return m ? normalizePolicy(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")) : null;
}

/** The meta tag, one directive per line (2-space indent) so no page line is long (tools/format-check.mjs). */
export function metaTag(pol = policy(), nl = "\n") {
  const dirs = normalizePolicy(pol).split(/\s*;\s*/).filter(Boolean).map(escAttr);
  return `<meta http-equiv="Content-Security-Policy" content="${dirs.join(";" + nl + "  ")}">`;
}

/** Returns the html with exactly one CSP meta (placed after <meta charset>, else first in <head>). An existing tag is
 *  replaced whether it was written on one line (older pages) or over several lines (META_RE: [^>]* spans newlines). */
export function apply(html, pol = policy()) {
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  const tag = metaTag(pol, nl);
  let out = html.replace(META_RE, "");
  const charset = /<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>[ \t]*\r?\n?/i.exec(out);
  if (charset) {
    const at = charset.index + charset[0].length;
    const lineEnd = charset[0].endsWith("\n") ? "" : nl;
    out = out.slice(0, at) + lineEnd + tag + nl + out.slice(at);
  } else {
    const head = /<head(\s[^>]*)?>[ \t]*\r?\n?/i.exec(out);
    if (!head) throw new Error("no <head> element");
    const at = head.index + head[0].length;
    out = out.slice(0, at) + (head[0].endsWith("\n") ? "" : nl) + tag + nl + out.slice(at);
  }
  return out;
}

/** Pages that would break under the policy without code changes (inline script / inline handlers / javascript: urls). */
export function lint(html) {
  const problems = [];
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const s of scripts) {
    const open = s.slice(0, s.indexOf(">") + 1);
    const body = s.slice(open.length, -9).trim();
    if (!/\bsrc\s*=/.test(open) && body && !/type\s*=\s*["']?(application\/(ld\+)?json|text\/template)/i.test(open)) problems.push("inline <script>");
  }
  if (/<[a-z][^>]*\son[a-z]+\s*=\s*["'][^"']*["']/i.test(html.replace(/<script\b[\s\S]*?<\/script>/gi, ""))) problems.push("inline on*= handler");
  if (/(href|src|action)\s*=\s*["']\s*javascript:/i.test(html)) problems.push("javascript: URL");
  if (/<(script|link)\b[^>]*(src|href)\s*=\s*["']https?:\/\//i.test(html)) problems.push("third-party script/style origin (fonts are self-hosted: node tools/self-host-fonts.mjs)");
  return problems;
}

function main(argv) {
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, "..");
  const args = argv.slice(2);
  const check = args.includes("--check");
  const connect = (process.env.LENSIQ_CSP_CONNECT || "").split(",").filter(Boolean);
  let cfg = "";
  try { cfg = readFileSync(join(repo, "lensiq-config.js"), "utf8"); } catch { /* no config file */ }
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--check") continue;
    if (args[i] === "--connect") { connect.push(...String(args[++i] || "").split(",")); continue; }
    files.push(resolve(args[i]));
  }
  if (!files.length) for (const f of readdirSync(repo).filter(f => f.endsWith(".html")).sort()) files.push(join(repo, f));
  const pol = configuredPolicy(cfg, connect);
  let changed = 0, bad = 0;
  for (const f of files) {
    const html = readFileSync(f, "utf8");
    const out = apply(html, pol);
    const problems = lint(html);
    const name = f.slice(repo.length + 1) || f;
    if (problems.length) { bad++; console.log(`WARN ${name}: ${problems.join(", ")} (blocked by the policy)`); }
    if (out === html) continue;
    changed++;
    if (check) console.log(`OUTDATED ${name}`);
    else { writeFileSync(f, out); console.log(`updated ${name}`); }
  }
  console.log(`${files.length} page(s), ${changed} ${check ? "need update" : "updated"}, ${bad} with policy problems`);
  if (check && (changed || bad)) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main(process.argv);
