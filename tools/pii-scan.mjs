#!/usr/bin/env node
// tools/pii-scan.mjs — owner decision 111 (2026-11-19): block personal data from being committed. Commit 8e44c420
// (2026-11-18) carried .wrangler/cache/cf.json, Miniflare's cached request metadata with the owner's device location.
//   node tools/pii-scan.mjs --tracked            every tracked text file (CI, every push)
//   node tools/pii-scan.mjs --range A..B         added lines of EVERY commit in A..B, so data added and removed again in one
//                                                push is still caught (CI: the pushed commits); --range HEAD = full history
//   node tools/pii-scan.mjs --staged             added lines of the staged change (tools/git-hooks/pre-commit)
//   options: --repo DIR (default: the git top level of the current folder), --allow FILE (default: <repo>/tools/pii-allow.json),
//            --json (machine output). Exit 0 = clean, 1 = findings, 2 = usage or allow-list error.
// Detectors: coordinates, postcode-city, phone, thai-id, ipv4, ipv6, street-address, email, secret, forbidden-path
// (.wrangler/, .dev.vars, .env, .har, and the palm pilot: palm-pilot/, *.palm-trace.json, P##-L|R[-#].jpg|png|heic|webp).
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

/** masked shape of a finding: never the value @param {string} type @param {string} v */
const shape = (type, v) => {
  if (type === "email") { const d = v.slice(v.lastIndexOf("@") + 1); return `x…@x….${mask(d.split(".").pop() || "")} (len ${v.length})`; }
  if (type === "secret") return `${mask(v.slice(0, 12))}… (len ${v.length})`;
  return mask(v).slice(0, 40);
};
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

// ---- e-mail and secrets (owner decision 147 ก) ----
const RESERVED_MAIL = /(?:^|\.)(?:example\.(?:com|org|net)|[^.]+\.example|example|test|invalid|localhost)$|(?:^|\.)users\.noreply\.github\.com$/i;
const FILE_EXT = /^(?:png|jpe?g|webp|gif|svg|avif|ico|js|mjs|cjs|css|json|map|html?|md|txt|woff2?|ttf)$/i;
/** @param {string} addr */
function realEmail(addr) {
  const at = addr.lastIndexOf("@");
  const local = addr.slice(0, at), domain = addr.slice(at + 1).toLowerCase();
  const tld = domain.split(".").pop() || "";
  if (FILE_EXT.test(tld) || /^\d+x$/i.test(domain.split(".")[0])) return false; // icon@2x.png
  if (RESERVED_MAIL.test(domain) || domain.endsWith(".example") || domain.endsWith(".test") || domain.endsWith(".invalid")) return false;
  if (/^(?:no-?reply|do-?not-?reply|mailer-daemon|postmaster)$/i.test(local)) return false;
  return true;
}
// six letters or digits in alphabet order ("abcdef", "mnopqr", "123456"): a hand-typed placeholder, not a random key
const ALPHA_RUN = new RegExp(["abcdefghijklmnopqrstuvwxyz", "0123456789"].flatMap(a => Array.from({ length: a.length - 5 }, (_, i) => a.slice(i, i + 6))).join("|"), "i");
/** Shannon entropy in bits per character @param {string} v */
function entropy(v) {
  /** @type {Record<string, number>} */
  const c = {};
  for (const ch of v) c[ch] = (c[ch] || 0) + 1;
  return Object.values(c).reduce((e, n) => e - (n / v.length) * Math.log2(n / v.length), 0);
}
// placeholder words count only as the whole value, as two or more words split on - _ . or space ("your-secret-here",
// "TURNSTILE_SECRET_VALUE"), or as a single-case run made only of such words plus one repeated filler ("SECRETVALUEAAAA");
// never as a substring of a random key ("…Xdemo3…" is a key)
const PH_WORDS = new Set(["example", "placeholder", "dummy", "fake", "sample", "redacted", "changeme", "change", "your", "here", "replace",
  "insert", "random", "bytes", "generate", "generated", "secret", "value", "token", "test", "demo", "canary", "notreal", "none", "null", "undefined", "todo", "password", "pass", "key"]);
const PH_GLUED = /^(?:example|placeholder|dummy|fake|sample|redacted|changeme|secret|value|token|canary|demo|test|key|your|here|api)+(?:(.)\1*)?$/i;
/** a placeholder, not a key @param {string} v */
function placeholder(v) {
  if (!v) return true;
  if (/^(?:x+|0+|\*+|\.+|-+|_+|<[^>]*>|\$\{[^}]*\}|\{\{[^}]*\}\}|%[A-Z_]+%)$/i.test(v)) return true; // whole-value fillers
  if (/(.)\1{7,}/.test(v)) return true; // a run of 8+ identical characters
  const maxRun = Math.max(...(v.match(/(.)\1*/g) || [""]).map(r => r.length));
  if (maxRun * 2 >= v.length) return true; // one run is half the value or more
  if (new Set(v).size <= 6 || (v.length < 24 && entropy(v) < 3)) return true; // few distinct characters / short and flat
  if (ALPHA_RUN.test(v)) return true; // "abcdef", "123456": typed by hand
  const words = v.split(/[-_.\s]+/).filter(Boolean).map(w => w.toLowerCase());
  if (words.filter(w => PH_WORDS.has(w)).length >= 2) return true;
  if (words.length === 1 && PH_WORDS.has(words[0])) return true;
  for (const run of v.match(/[A-Z]{8,}|[a-z]{8,}/g) || []) if (PH_GLUED.test(run)) return true;
  return false;
}
/** entropy floor for a value of this alphabet and length (75 % of the most a random value could reach) @param {string} v */
function entropyFloor(v) {
  const alphabet = /^[0-9a-f]+$/i.test(v) ? 16 : /^\d+$/.test(v) ? 10 : /^[A-Za-z0-9]+$/.test(v) ? 62 : 64;
  return 0.75 * Math.min(Math.log2(alphabet), Math.log2(v.length));
}
/** a random-looking value: not a placeholder, entropy above the alphabet's floor, and not a plain name @param {string} v */
const randomish = v => !placeholder(v) && entropy(v) >= entropyFloor(v) &&
  (/\d/.test(v) || (/[a-z]/.test(v) && /[A-Z]/.test(v)));
/** @param {RegExpExecArray} m */
const realKey = m => !placeholder(m[1] ?? m[0]);
/** @param {number} n characters of a fixed prefix @returns {(m: RegExpExecArray) => boolean} */
const after = n => m => !placeholder(m[1].slice(n));
const SECRET_NAME = "(?:secret|token|passw(?:or)?d|pwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret)";
const URL_PH = /^(?:pass(?:word)?|pwd|secret|changeme|x+|\*+|\$\{[^}]*\}|\$[A-Z_]+|<[^>]*>|\{\{[^}]*\}\}|%[A-Z_]+%)$/i;
/** @type {Array<[string, RegExp, (m: RegExpExecArray, line: string) => boolean]>} */
const SECRET_RULES = [
  ["email", /(?<![\w.+-])([A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})(?![\w@-])/g, m => realEmail(m[1])],
  ["secret", /\b((?:AKIA|ASIA)[0-9A-Z]{16})\b/g, after(4)],
  ["secret", /aws_?secret_?access_?key["']?\s*[:=]\s*["']?([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+])/gi, realKey],
  ["secret", /\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,})\b/g, after(4)],
  ["secret", /\b(github_pat_[A-Za-z0-9_]{60,})\b/g, after(11)],
  ["secret", /(?<![\w-])(sk-(?:ant-(?:api\d\d-)?|proj-|or-v1-|or-)?[A-Za-z0-9_-]{20,})(?![\w-])/g,
    m => !placeholder(m[1].replace(/^sk-(?:ant-(?:api\d\d-)?|proj-|or-v1-|or-)?/, ""))],
  ["secret", /\b(xox[abposr]-[A-Za-z0-9-]{10,})\b/g, after(5)],
  ["secret", /(?<![\w-])(AIza[0-9A-Za-z_-]{35})(?![\w-])/g, after(4)],
  ["secret", /\b((?:sk|rk)_(?:live|test)_[0-9A-Za-z]{20,})\b/g, m => !placeholder(m[1].replace(/^\w\w_\w+?_/, ""))],
  ["secret", /\b(hf_[A-Za-z0-9]{30,})\b/g, after(3)],
  ["secret", /\b(npm_[A-Za-z0-9]{36})\b/g, after(4)],
  ["secret", /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})(?![\w-])/g, after(3)],
  ["secret", /(?<![\w:])(\d{8,10}:AA[A-Za-z0-9_-]{33})(?![\w-])/g, m => !placeholder(m[1].slice(m[1].indexOf(":") + 3))],
  ["secret", /\b(GOCSPX-[A-Za-z0-9_-]{28})(?![\w-])/g, after(7)],
  // Cloudflare Turnstile secret: 0x4 + a run of A + a random tail of 18+ (the public SITE key has a 14-character tail and
  // is meant to be in the page; the documented test keys start 1x / 2x / 3x)
  ["secret", /(?<![\w])(0x4A{5,}[A-Za-z0-9_-]{16,})(?![\w-])/g, m => {
    const tail = m[1].replace(/^0x4A+/, "");
    return tail.length >= 18 && !placeholder(tail);
  }],
  ["secret", /(?<![\w-])(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})(?![\w-])/g, realKey],
  ["secret", /(-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----)/g, () => true],
  // a password in a URL: scheme://user:password@host
  ["secret", /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/"'`]*:([^\s:@/"'`]{4,})@[A-Za-z0-9.-]+/gi, m => !URL_PH.test(m[1]) && !placeholder(m[1])],
  // a quoted value assigned to a secret-like name
  ["secret", new RegExp(`${SECRET_NAME}[\\w-]*["']?\\s*[:=]\\s*["'\`]([\\x21\\x23-\\x26\\x28-\\x5f\\x61-\\x7e]{20,})["'\`]`, "gi"),
    (m, line) => randomish(m[1]) && !/^(?:sha(?:256|384|512)-|https?:|\.{0,2}\/)/.test(m[1]) && !/integrity\s*=/.test(line)],
  // an unquoted value (NAME=value, name: value): key-like characters only, so code (process.env.X, calls) is not read
  ["secret", new RegExp(`${SECRET_NAME}[\\w-]*\\s*[:=]\\s*([A-Za-z0-9_+/=-]{20,})(?![\\w.(+/=-])`, "gi"),
    m => randomish(m[1]) && /[A-Za-z]/.test(m[1]) && !/^[a-z]{2,}(?:[A-Z][a-z]{2,})+\d*$/.test(m[1])] // not a camelCase name
];
RULES.push(...SECRET_RULES);

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
          out.push({ type, line: i + 1, masked: shape(type, m[1] ?? m[0]) });
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
  [/\.har$/i, "browser network capture (headers, cookies, IPs)"],
  // palm pilot (2026-11-21): participants' palm photos and their labels live in ~/LENSIQ-field/palm-pilot/ (photos/,
  // labels/A|B/), never in git. Locked test: tests/unit/pii-palm-labels.test.js (evals-locks/pii-palm-labels.sha256)
  [/(^|\/)palm-pilot\//i, "palm pilot folder (participants' palm photos and labels)"],
  [/\.palm-trace\.json$/i, "palm trace label file (palm pilot)"],
  [/(^|\/)P\d{2}-[LR](-\d+)?\.(jpe?g|png|heic|webp)$/i, "image named like a palm pilot participant code"],
  // stricter addition (coordinator decision 2026-11-21, recorded in the board): the usual hand copies and renames of the same files.
  // Locked test: tests/unit/pii-palm-variants.test.js (evals-locks/pii-palm-variants.sha256)
  [/(^|\/)P\d{2}-[LR](-\d+)?( ?\(\d+\)| copy( \d+)?| - copy( \(\d+\))?|_\d+)?\.(jpe?g|png|heic|heif|webp|dng|avif|tiff?|mov)$/i,
    "photo or video named like a palm pilot participant code (incl. copy names)"],
  [/(^|\/)[^/]*palm[-_ ]?pilot[^/]*\.(zip|tar|gz|tgz|7z|bz2|tbz2?|xz|txz|zst|rar)$/i, "archive named with palm-pilot (palm pilot)"],
  [/(^|\/)([^/]*[^/a-z0-9])?P\d{2}(-[LR](-\d+)?)?(?![a-z0-9])[^/]*\.(zip|tar|tar\.gz|tgz|7z|tar\.bz2|tbz2?|tar\.xz|txz|rar)$/i,
    "archive named with a palm pilot participant code"],
  [/\.palm-trace( ?\(\d+\)| copy( \d+)?|_\d+)?\.json((\.(bak|backup|old|orig|tmp|temp|swp|save|gz|bz2|xz|zst|zip|7z|tar|tgz|\d+))+~?|~)?$/i,
    "palm trace label file, renamed or packed (palm pilot)"]
];
/** @param {string} p @returns {Array<{type: string, line: number, masked: string}>} */
export function scanPath(p) {
  if (/(^|\/)\.env\.example$/.test(p)) return [];
  for (const [re, why] of FORBIDDEN) if (/** @type {RegExp} */ (re).test(p)) return [{ type: "forbidden-path", line: 0, masked: String(why) }];
  return [];
}

const TYPES = new Set(["coordinates", "postcode-city", "phone", "thai-id", "ipv4", "ipv6", "street-address", "email", "secret"]);
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
    if (e.kinds !== undefined) { // optional kind per type, when one file holds e.g. a public help line and a placeholder e-mail
      if (!e.kinds || typeof e.kinds !== "object") throw new Error(`${where}: kinds must be an object`);
      for (const [t, k] of Object.entries(e.kinds)) {
        if (!e.types[t]) throw new Error(`${where}: kinds names ${t}, which is not in types`);
        if (!["synthetic", "public", "false-positive"].includes(String(k))) throw new Error(`${where}: kinds.${t} must be synthetic, public or false-positive`);
      }
    }
    const secretKind = (e.kinds && e.kinds.secret) || e.kind;
    if (e.types.secret && secretKind === "public") throw new Error(`${where}: a secret can only be synthetic or a false positive`);
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
