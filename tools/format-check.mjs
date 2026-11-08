#!/usr/bin/env node
// tools/format-check.mjs — format check on CHANGED lines only (no new dependency, no mass reformat of the repo).
//
//   node tools/format-check.mjs                 lines added in the working tree + index vs HEAD (local use)
//   node tools/format-check.mjs --base HEAD~1   lines added since <base> (CI: the pushed commit / the PR merge base)
//   node tools/format-check.mjs --all FILE...   every line of the given files (e.g. a brand-new module)
//   ... --warn-only                             print the problems as a CI warning and exit 0 (pushes to main)
//   node tools/format-check.mjs --selftest      detector self-test
//
// Rules (.editorconfig): LF line endings, no tabs for indentation, no trailing whitespace, and code lines of at most
// MAX_WIDTH characters (200; 160 = .editorconfig target, reported as a warning) in js / mjs / cjs / ts / css / html /
// yml. Thai / CJK characters count as one each.
// Lines that are mostly one string or URL (dictionary entries, data URIs, long regexes) are exempt from the width rule
// when they cannot be wrapped: an i18n dictionary line, a line inside vendor/, data/ or *.min.*, and generated files.
// Exit 1 with a list of file:line problems; 0 when the change is clean.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
export const MAX_WIDTH = 200; // hard limit for added code lines
export const SOFT_WIDTH = 160; // .editorconfig max_line_length: reported as a warning, not a failure
const CHECKED = /\.(m?js|cjs|ts|css|html|json|ya?ml)$/;
const SKIP = /^(vendor|data|node_modules|_site|logs|certs|models)\/|\.min\.(js|css)$|package-lock\.json$|^i18n\/|^tests\/bench\/results\/|\.json$/;

/** Problems of one added line (empty array = clean). @param {string} file @param {string} line */
export function lineProblems(file, line) {
  const out = [];
  if (line.endsWith("\r")) out.push("CRLF line ending");
  const l = line.replace(/\r$/, "");
  if (/^\t+/.test(l)) out.push("tab indentation (use 2 spaces)");
  if (/[ \t]+$/.test(l)) out.push("trailing whitespace");
  const width = [...l].length;
  if (width > MAX_WIDTH && !/^\s*(["'`]).*\1[,;]?\s*$/.test(l) && !/https?:\/\/\S{60,}/.test(l)) out.push(`line is ${width} characters (max ${MAX_WIDTH})`);
  return out;
}

/** Over the .editorconfig target but under the hard limit (warning). @param {string} file @param {string} line */
export function softWidth(file, line) { const w = [...line.replace(/\r$/, "")].length; return w > SOFT_WIDTH && w <= MAX_WIDTH; }

function git(a) { return execFileSync("git", a, { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); }

/** Added lines per file from a unified diff with zero context. */
export function addedLines(diff) {
  const res = [];
  let file = null, n = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) { file = raw.slice(4).replace(/^b\//, ""); if (file === "/dev/null") file = null; continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (h) { n = Number(h[1]); continue; }
    if (!file) continue;
    if (raw.startsWith("+")) { res.push({ file, line: n, text: raw.slice(1) }); n++; }
    else if (!raw.startsWith("-") && !raw.startsWith("\\")) n++;
  }
  return res;
}

function check(items) {
  const bad = [];
  for (const it of items) {
    if (!CHECKED.test(it.file) || SKIP.test(it.file)) continue;
    for (const p of lineProblems(it.file, it.text)) bad.push(`${it.file}:${it.line}: ${p}`);
  }
  return bad;
}

function selftest() {
  const ok = (c, m) => { if (!c) { console.error("selftest FAILED: " + m); process.exit(1); } };
  ok(lineProblems("a.js", "  const x = 1;").length === 0, "clean line");
  ok(lineProblems("a.js", "\tconst x = 1;")[0].startsWith("tab"), "tab");
  ok(lineProblems("a.js", "const x = 1;  ")[0] === "trailing whitespace", "trailing");
  ok(/characters/.test(lineProblems("a.js", "x".repeat(201))[0]), "width");
  ok(lineProblems("a.js", "x".repeat(170)).length === 0 && softWidth("a.js", "x".repeat(170)), "soft width is a warning only");
  ok(lineProblems("a.js", "ก".repeat(160)).length === 0, "Thai counts one per character");
  ok(lineProblems("a.js", '  "' + "x".repeat(200) + '",').length === 0, "a lone string is exempt");
  const d = "+++ b/a.js\n@@ -1,0 +5,2 @@\n+ok\n+bad \n+++ b/vendor/x.js\n@@ -0,0 +1 @@\n+\tx";
  const add = addedLines(d);
  ok(add.length === 3 && add[1].line === 6, "diff parsing");
  ok(check(add).length === 1 && check(add)[0] === "a.js:6: trailing whitespace", "vendor skipped, problem located");
  console.log("format-check selftest OK");
}

if (args.includes("--selftest")) { selftest(); process.exit(0); }

let items;
if (args.includes("--all")) {
  const files = args.filter(a => !a.startsWith("--"));
  items = files.flatMap(f => existsSync(join(repo, f)) ? readFileSync(join(repo, f), "utf8").split("\n").map((text, i) => ({ file: f, line: i + 1, text })) : []);
} else {
  const bi = args.indexOf("--base");
  const base = bi >= 0 ? args[bi + 1] : "HEAD";
  let diff;
  try { diff = git(["diff", "--no-color", "--unified=0", "--no-ext-diff", base, "--"]); }
  catch (e) { console.log(`format-check: cannot diff against ${base} (shallow clone?) — skipped`); process.exit(0); }
  items = addedLines(diff);
  // brand-new untracked files count as added in full (local runs)
  if (bi < 0) {
    for (const f of git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean)) {
      if (CHECKED.test(f) && !SKIP.test(f)) readFileSync(join(repo, f), "utf8").split("\n").forEach((text, i) => items.push({ file: f, line: i + 1, text }));
    }
  }
}
const bad = check(items);
const soft = items.filter(it => CHECKED.test(it.file) && !SKIP.test(it.file) && softWidth(it.file, it.text)).length;
if (soft) console.log(`format-check: note — ${soft} added line(s) between ${SOFT_WIDTH} and ${MAX_WIDTH} characters (wrap them when you touch them)`);
if (bad.length) {
  console.log(bad.slice(0, 200).join("\n"));
  console.log(`\nformat-check: ${bad.length} problem(s) in added lines (rules: .editorconfig; max ${MAX_WIDTH} characters per code line)`);
  if (args.includes("--warn-only")) { console.log(`::warning::format-check: ${bad.length} problem(s) in added lines (report only on pushes to main)`); process.exit(0); }
  process.exit(1);
}
console.log(`format-check: OK (${items.length} added line(s) checked)`);
