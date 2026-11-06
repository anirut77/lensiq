#!/usr/bin/env node
// tools/csp-meta.mjs — insert / update <meta http-equiv="Content-Security-Policy"> in every page's <head>, so the static
// GitHub Pages build gets the same policy as server.py (_csp()). Idempotent: running it twice changes nothing.
//
//   node tools/csp-meta.mjs                 update every ./*.html in the repo root
//   node tools/csp-meta.mjs --check         exit 1 if any page is missing / has an outdated meta (CI)
//   node tools/csp-meta.mjs a.html b.html   only these files
//   node tools/csp-meta.mjs --connect https://lensiq-api.onrender.com   extra connect-src origin(s) (also LENSIQ_CSP_CONNECT)
//
// Differences from the HTTP header sent by server.py (a <meta> policy cannot carry them):
//   frame-ancestors, report-uri/report-to and sandbox are ignored in <meta> by the CSP spec -> omitted.
//   Clickjacking protection on GitHub Pages therefore relies on the page not being sensitive; server.py adds
//   frame-ancestors + X-Frame-Options when it serves the pages.
// The meta goes right after <meta charset> (before any <link>/<script>), because a meta policy only applies to
// content that appears after it.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ORIGIN_RE = /^https?:\/\/[A-Za-z0-9.\-:[\]]+\/?$/;

/** The policy (same directives and order as server.py _csp(), minus frame-ancestors). */
export function policy({ connect = [] } = {}) {
  const extra = connect.map(o => String(o).trim()).filter(o => ORIGIN_RE.test(o)).map(o => o.replace(/\/$/, ""));
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    ("connect-src 'self' data: blob: " + extra.join(" ")).trim(),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");
}

const escAttr = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const META_RE = /[ \t]*<meta\s+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>[ \t]*\r?\n?/gi;

/** Returns the html with exactly one CSP meta (placed after <meta charset>, else first in <head>). */
export function apply(html, pol = policy()) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${escAttr(pol)}">`;
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
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
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--check") continue;
    if (args[i] === "--connect") { connect.push(...String(args[++i] || "").split(",")); continue; }
    files.push(resolve(args[i]));
  }
  if (!files.length) for (const f of readdirSync(repo).filter(f => f.endsWith(".html")).sort()) files.push(join(repo, f));
  const pol = policy({ connect });
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
