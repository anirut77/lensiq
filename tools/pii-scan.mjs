#!/usr/bin/env node
// tools/pii-scan.mjs — owner decision 111 (2026-11-19): block personal data from being committed. Commit 8e44c420
// (2026-11-18) carried .wrangler/cache/cf.json, Miniflare's cached request metadata with the owner's device location.
//   node tools/pii-scan.mjs --tracked            every tracked text file (CI, every push)
//   node tools/pii-scan.mjs --range A..B         added lines of EVERY commit in A..B, so data added and removed again in one
//                                                push is still caught (CI: the pushed commits); --range HEAD = full history
//   node tools/pii-scan.mjs --staged             added lines of the staged change (tools/git-hooks/pre-commit)
//   options: --repo DIR (default: the git top level of the current folder), --allow FILE (default: <repo>/tools/pii-allow.json),
//            --json (machine output). Exit 0 = clean, 1 = findings, 2 = usage or allow-list error.
// Detectors: coordinates, postcode-city, phone, thai-id, ipv4, ipv6, street-address, forbidden-path.
// The scanner NEVER prints a matched value: output is type, path:line, commit and a masked shape (digits -> #, letters -> x).
// Allow-list (tools/pii-allow.json): { entries: [{ path, types: { <type>: <max count> }, kind: synthetic|public|false-positive,
// reason }] }. In --tracked mode a file may hold at most <max> hits of a type; one more and every hit of that type is reported.
// In --range / --staged mode an allow-listed path + type passes (the --tracked run still enforces the count).
// A forbidden path can never be allow-listed. Locked test: tests/unit/pii-guard.test.js (evals-locks/pii-guard.sha256).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_LINE = 20000; // window size for long lines
const OVERLAP = 1000; // window overlap (longer than any match the rules allow)

/** @param {string} d 13 digits @returns {boolean} */
export function isThaiId(d) {
  if (!/^[1-8]\d{12}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d[i]) * (13 - i);
  return (11 - (s % 11)) % 10 === Number(d[12]);
}

/** @param {string} v */
const mask = v => v.replace(/\d/g, "#").replace(/[A-Za-z]/g, "x").replace(/[฀-๿]/g, "ก");

/** @param {string} ip */
function publicIpv4(ip) {
  const o = ip.split(".").map(Number);
  if (o.some(n => n > 255)) return false;
  const [a, b, c] = o;
  if (o.every(n => n < 10)) return false; // version-like (1.2.3.4)
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if ((a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return false;
  if (a === 255) return false;
  return true;
}

/** @param {string} ip */
function publicIpv6(ip) {
  const s = ip.toLowerCase();
  const groups = s.split(":").filter(Boolean);
  if (groups.length < 3) return false;
  if (!s.includes("::") && s.split(":").length !== 8) return false;
  if (!groups.some(g => g.length >= 3)) return false;
  if (!groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) return false;
  if (/^2001:0?db8:/.test(s) || /^64:ff9b:/.test(s) || /^fe[89ab]/.test(s) || /^f[cd]/.test(s) || /^ff/.test(s)) return false;
  return true;
}

// Thailand bounding box: a bare "lat, lon" pair is flagged only inside it (bare decimal pairs elsewhere are mostly maths)
const inThailand = (/** @type {number} */ la, /** @type {number} */ lo) => la >= 5.5 && la <= 20.6 && lo >= 97.3 && lo <= 105.7;
const PROVINCE = "กรุงเทพ|กทม|จังหวัด|จ\\.|นนทบุรี|ปทุมธานี|สมุทรปราการ|เชียงใหม่|ชลบุรี|ขอนแก่น|ภูเก็ต|นครราชสีมา|อุบลราชธานี" +
  "|Bangkok|Thailand|Nonthaburi|Pathum Thani|Samut Prakan|Chiang Mai|Chon Buri|Chonburi|Khon Kaen|Phuket|Nakhon|Ubon";
const NB = "(?<![\\w.\\-/#+])"; // not glued to a word, a decimal, a path or another number
const NA = "(?![\\w.]\\d|\\w)";
/** @type {Array<[string, RegExp, (m: RegExpExecArray, line: string) => boolean]>} */
const RULES = [
  ["coordinates", /(?<![\w.])(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{2,3}\.\d{4,})(?![\w.])/g, m => inThailand(+m[1], +m[2])],
  ["coordinates", /["']?\b(?:lat|latitude|lng|lon|long|longitude)["']?\s*[:=]\s*["']?(-?\d{1,3}\.\d{3,})/gi,
    m => Math.abs(+m[1]) <= 180 && Math.abs(+m[1]) >= 0.001],
  ["postcode-city", /["']?\b(?:postal_?code|post_?code|zip_?code|zip)["']?\s*[:=]\s*["']?(\d{5})(?!\d)/gi, () => true],
  ["postcode-city", new RegExp(`(?:${PROVINCE})[^\\n\\d]{0,40}?(?<!\\d)([1-9]\\d{4})(?![\\d.])`, "g"), m => +m[1] >= 10000 && +m[1] <= 96999],
  // Thai numbers: 0…, +66 / 0066 / 66 …, (0##) ### ####, 0##.###.####, 0#-####-####; separators space, dot or dash
  ["phone", new RegExp(`${NB}(?:(?:(?:\\+|00)?66[\\s.-]?|0)(?:[689]\\d[\\s.-]?\\d{3}[\\s.-]?\\d{4}|[2-7][\\s.-]?\\d{3}[\\s.-]?\\d{4})` +
    `|0[689][\\s.-]\\d{4}[\\s.-]\\d{4}|\\(0(?:[689]\\d|[2-7])\\)[\\s.-]?\\d{3}[\\s.-]?\\d{4})${NA}`, "g"), () => true],
  ["phone", /(?<![\w.+])\+(?!66)[1-9]\d{0,2}[\s-]?\(?\d{1,4}\)?[\s-]\d{2,4}[\s-]\d{3,4}(?![\w.]\d|\w)/g, () => true],
  ["thai-id", /(?<![\w.\-/#])(\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d)(?![\w.]\d|\w|-\d)/g,
    (m, line) => isThaiId(m[1].replace(/[\s-]/g, "")) && !/\b(?:gtin|ean|jan|barcode|upc|isbn)\b/i.test(line)],
  ["ipv4", /(?<![\w.\/=:-])((?:\d{1,3}\.){3}\d{1,3})(?![\w.]?\d|\.\w)/g, (m, line) => {
    const before = line.slice(Math.max(0, m.index - 12), m.index);
    return !/(?:chrome|safari|version|firefox|edg|v)\/?\s*$/i.test(before) && publicIpv4(m[1]);
  }],
  ["ipv6", /(?<![\w:])((?:[0-9a-f]{1,4}:){1,7}(?::|(?::[0-9a-f]{1,4}){1,6}|[0-9a-f]{1,4}))(?![\w:])/gi, m => publicIpv6(m[1])],
  ["street-address", /(?:บ้านเลขที่|เลขที่)?\s*\d{1,5}(?:\/\d{1,4})?\s*(?:หมู่|ม\.|ซอย|ซ\.|ถนน|ถ\.)[^\n]{0,40}?(?:แขวง|ตำบล|ต\.|เขต|อำเภอ|อ\.|ถนน|ถ\.)\s*[฀-๿]/g,
    () => true],
  ["street-address", /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Road|Rd\.?|Street|St\.|Avenue|Ave\.?|Lane|Soi|Boulevard|Blvd\.?)(?![a-z])/g, () => true],
  // lower-case ("### baker street"); "lane" and common words are left out ("3 lanes", "per lane", "a busy street")
  ["street-address", new RegExp("\\b\\d{1,5}\\s+(?:(?!(?:per|a|an|the|of|on|in|at|to|for|and|or|with|busy|main|side|one|each|every|x)\\b)" +
    "[a-z]+\\s){1,3}(?:road|rd\\.?|street|st\\.|avenue|ave\\.?|soi|boulevard|blvd\\.?)(?![a-z])", "g"), () => true]
];

/**
 * Personal-data findings in a text. Never returns the matched value.
 * @param {string} text @param {string} [path]
 * @returns {Array<{type: string, line: number, masked: string}>}
 */
export function scanText(text, path = "") {
  void path;
  /** @type {Array<{type: string, line: number, masked: string}>} */
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const full = lines[i];
    const seen = new Set();
    // long lines (minified JSON, one-line caches) are scanned in overlapping windows, never skipped
    for (let start = 0; start === 0 || start < full.length; start += MAX_LINE - OVERLAP) {
      const line = full.length > MAX_LINE ? full.slice(start, start + MAX_LINE) : full;
      for (const [type, re, ok] of RULES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) {
          if (m[0].length === 0) { re.lastIndex++; continue; }
          if (!ok(m, line)) continue;
          const key = type + ":" + (start + m.index);
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ type, line: i + 1, masked: mask(m[1] ?? m[0]).slice(0, 40) });
        }
      }
      if (full.length <= MAX_LINE) break;
    }
  }
  return out;
}

const FORBIDDEN = [
  [/(^|\/)\.wrangler\//, "Wrangler / Miniflare local state (holds the request location of the machine)"],
  [/(^|\/)\.dev\.vars$/, "Worker secrets file"],
  [/(^|\/)\.env(\.[\w-]+)?$/, "environment / secrets file"],
  [/\.har$/i, "browser network capture (headers, cookies, IPs)"]
];
/** @param {string} p @returns {Array<{type: string, line: number, masked: string}>} */
export function scanPath(p) {
  if (/(^|\/)\.env\.example$/.test(p)) return [];
  for (const [re, why] of FORBIDDEN) if (/** @type {RegExp} */ (re).test(p)) return [{ type: "forbidden-path", line: 0, masked: String(why) }];
  return [];
}

const TYPES = new Set(["coordinates", "postcode-city", "phone", "thai-id", "ipv4", "ipv6", "street-address"]);
/** @param {string} file */
export function loadAllow(file) {
  if (!file || !existsSync(file)) return new Map();
  const j = JSON.parse(readFileSync(file, "utf8"));
  if (!j || !Array.isArray(j.entries)) throw new Error(`${file}: expected { entries: [...] }`);
  /** @type {Map<string, Record<string, number>>} */
  const map = new Map();
  for (const e of j.entries) {
    const where = `${file}: entry ${JSON.stringify(e && e.path)}`;
    if (!e || typeof e.path !== "string" || !e.path) throw new Error(`${where}: path missing`);
    if (!["synthetic", "public", "false-positive"].includes(e.kind)) throw new Error(`${where}: kind must be synthetic, public or false-positive`);
    if (typeof e.reason !== "string" || e.reason.trim().length < 10) throw new Error(`${where}: reason missing`);
    if (!e.types || typeof e.types !== "object" || !Object.keys(e.types).length) throw new Error(`${where}: types missing`);
    for (const [t, n] of Object.entries(e.types)) {
      if (!TYPES.has(t)) throw new Error(`${where}: type ${t} cannot be allow-listed`);
      if (!Number.isInteger(n) || n <= 0) throw new Error(`${where}: max for ${t} must be a positive integer`);
    }
    if (map.has(e.path)) throw new Error(`${where}: duplicate path`);
    map.set(e.path, e.types);
  }
  return map;
}

/** @param {string} repo @param {string[]} args */
const git = (repo, args) => execFileSync("git", ["-C", repo, "-c", "core.quotePath=false", ...args], { maxBuffer: 1 << 30 });
/** @param {Buffer} b */
const isBinary = b => b.subarray(0, 8000).includes(0);

/** @param {string} repo @param {Map<string, Record<string, number>>} allow */
function scanTracked(repo, allow) {
  const files = git(repo, ["ls-files", "-z"]).toString("utf8").split("\0").filter(Boolean);
  /** @type {Array<{type: string, path: string, line: number, masked: string, reason?: string}>} */
  const findings = [];
  for (const path of files) {
    for (const f of scanPath(path)) findings.push({ ...f, path });
    let buf;
    try { buf = readFileSync(join(repo, path)); } catch { continue; } // deleted in the work tree, a submodule or a dangling link
    if (isBinary(buf)) continue; // every text file is scanned, whatever its size
    const hits = scanText(buf.toString("utf8"), path);
    const max = allow.get(path) || {};
    /** @type {Record<string, typeof hits>} */
    const byType = {};
    for (const h of hits) (byType[h.type] ||= []).push(h);
    for (const [type, list] of Object.entries(byType)) {
      const cap = max[type] || 0;
      if (list.length <= cap) continue;
      const reason = cap ? `allow-list max ${cap} exceeded (${list.length} found)` : undefined;
      for (const h of list) findings.push({ ...h, path, ...(reason ? { reason } : {}) });
    }
  }
  return findings;
}

/** a path from a "+++ " header (git -c core.quotePath=false still C-quotes names with tabs, quotes or backslashes) @param {string} s */
function headerPath(s) {
  s = s.replace(/\t$/, ""); // git ends the header with a tab when the name has a space
  if (s.startsWith('"')) {
    try { s = JSON.parse(s.replace(/\\([0-7]{3})/g, (_, o) => "\\u00" + parseInt(o, 8).toString(16).padStart(2, "0"))); }
    catch { s = s.replace(/^"|"$/g, ""); }
  }
  return s.replace(/^b\//, "");
}

/**
 * added lines of a unified diff stream (`git log -p` or `git diff`). Headers ("diff --git", "--- ", "+++ ") are read only
 * before the first "@@" of a file, so an added line whose text starts with "++ " is content, not a header.
 * @param {string} text @param {Map<string, Record<string, number>>} allow
 */
function scanPatch(text, allow) {
  /** @type {Array<{type: string, path: string, line: number, masked: string, commit?: string}>} */
  const findings = [];
  let commit = "", path = "", ln = 0, skip = false, inHunk = false, sawMinus = false;
  for (const raw of text.split("\n")) {
    if (raw.startsWith("@@@COMMIT ")) { commit = raw.slice(10).trim(); inHunk = false; continue; }
    if (raw.startsWith("diff --git ") || raw.startsWith("diff --cc ") || raw.startsWith("diff --combined ")) {
      inHunk = false; sawMinus = false; path = ""; skip = true; continue;
    }
    if (!inHunk) {
      if (raw.startsWith("--- ")) { sawMinus = true; continue; }
      if (sawMinus && raw.startsWith("+++ ")) { path = headerPath(raw.slice(4)); skip = path === "/dev/null"; continue; }
      if (!raw.startsWith("@@")) continue;
    }
    if (/^@@+ -/.test(raw)) { const m = /\+(\d+)/.exec(raw); ln = m ? +m[1] : 0; inHunk = true; continue; }
    if (raw.startsWith("+") && !skip) {
      const allowed = allow.get(path) || {};
      for (const h of scanText(raw.slice(1), path)) {
        if (allowed[h.type]) continue;
        findings.push({ ...h, path, line: ln, ...(commit ? { commit } : {}) });
      }
      ln++;
    }
  }
  return findings;
}

/** forbidden paths added or changed by each commit of a range (merges: against the first parent) @param {string} repo @param {string} range */
function forbiddenInRange(repo, range) {
  /** @type {Array<{type: string, path: string, line: number, masked: string, commit: string}>} */
  const out = [];
  for (const row of git(repo, ["rev-list", "--parents", range, "--"]).toString("utf8").split("\n").filter(Boolean)) {
    const [sha, parent] = row.split(" ");
    const args = parent ? ["diff", "--name-only", "-z", "--no-renames", "--diff-filter=ACMRT", parent, sha]
      : ["diff-tree", "--root", "-r", "--no-commit-id", "--name-only", "-z", "--no-renames", "--diff-filter=ACMRT", sha];
    for (const p of git(repo, args).toString("utf8").split("\0").filter(Boolean)) for (const f of scanPath(p)) out.push({ ...f, path: p, commit: sha });
  }
  return out;
}
/** forbidden paths in the staged change @param {string} repo */
function forbiddenStaged(repo) {
  const names = git(repo, ["diff", "--cached", "--name-only", "-z", "--no-renames", "--diff-filter=ACMRT"]).toString("utf8");
  return names.split("\0").filter(Boolean).flatMap(p => scanPath(p).map(f => ({ ...f, path: p })));
}

const DIFF_OPTS = ["--no-color", "--no-renames", "--unified=0", "--no-ext-diff", "--text"];

/** @param {string[]} argv */
export function main(argv) {
  const opt = { mode: "", range: "", repo: "", allow: "", json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tracked" || a === "--staged") opt.mode = a.slice(2);
    else if (a === "--range") { opt.mode = "range"; opt.range = argv[++i] || ""; }
    else if (a === "--repo") opt.repo = argv[++i] || "";
    else if (a === "--allow") opt.allow = argv[++i] || "";
    else if (a === "--json") opt.json = true;
    else { console.error(`pii-scan: unknown argument ${a}`); return 2; }
  }
  if (!opt.mode) opt.mode = "tracked";
  // --range A..B, or a single revision (e.g. HEAD) for its full history
  if (opt.mode === "range" && (!/^\S+$/.test(opt.range) || opt.range.startsWith("-"))) {
    console.error("pii-scan: --range needs A..B or a revision"); return 2;
  }
  let repo;
  try { repo = opt.repo ? resolve(opt.repo) : execFileSync("git", ["rev-parse", "--show-toplevel"]).toString().trim(); }
  catch { console.error("pii-scan: not inside a git repository (use --repo)"); return 2; }
  let allow;
  try { allow = loadAllow(opt.allow ? resolve(opt.allow) : join(repo, "tools", "pii-allow.json")); }
  catch (e) { console.error(`pii-scan: allow-list error: ${/** @type {Error} */ (e).message}`); return 2; }

  let findings;
  try {
    if (opt.mode === "tracked") findings = scanTracked(repo, allow);
    else if (opt.mode === "staged") {
      findings = [...forbiddenStaged(repo), ...scanPatch(git(repo, ["diff", "--cached", ...DIFF_OPTS]).toString("utf8"), allow)];
    } else {
      findings = [...forbiddenInRange(repo, opt.range),
        ...scanPatch(git(repo, ["log", "-p", ...DIFF_OPTS, "--format=@@@COMMIT %H", opt.range, "--"]).toString("utf8"), allow)];
    }
  } catch (e) { console.error(`pii-scan: git failed: ${/** @type {Error} */ (e).message.split("\n")[0]}`); return 2; }

  if (opt.json) {
    console.log(JSON.stringify({ mode: opt.mode, findings }, null, 1));
  } else if (findings.length) {
    console.error(`pii-scan: ${findings.length} possible personal-data finding(s) (${opt.mode}). Values are never printed.`);
    for (const f of findings) {
      const at = f.line ? `${f.path}:${f.line}` : f.path;
      const c = "commit" in f && f.commit ? ` commit ${String(f.commit).slice(0, 12)}` : "";
      const r = "reason" in f && f.reason ? ` (${f.reason})` : "";
      console.error(`  ${f.type}  ${at}${c}  shape ${f.masked}${r}`);
    }
    console.error("Remove the data (or, for a synthetic fixture only, add path + type + max count + kind + reason to tools/pii-allow.json).");
    console.error("Never allow-list real personal data. Data already pushed stays in history: tell the owner (GitHub Support purge).");
  } else {
    console.log(`pii-scan: clean (${opt.mode})`);
  }
  return findings.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
