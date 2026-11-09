#!/usr/bin/env node
// tools/check-ai-providers.mjs — lint guard (round 17 P5, design §10.3): AI provider hosts, provider names and the
// provider SDK may appear in backend/src ONLY under backend/src/ai/adapters/. Everything else (gateway core, features,
// fortune.js, settings) stays provider-neutral, so a provider can be added, swapped or removed in one place.
//
//   node tools/check-ai-providers.mjs              check this repo (exit 1 with file:line list on a hit)
//   node tools/check-ai-providers.mjs --root DIR   check another tree with the same layout (tests use a temp dir)
// Wired into `npm run lint` (package.json) and therefore CI. Comments count too: a provider host in a comment outside the
// adapters is still a hint that provider logic leaked.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** [name, regex] — case-insensitive. Bare company words such as "anthropic", "openai", "gemini" are allowed (settings,
 *  docs, UI labels); hosts, SDK package names and the provider ids that only exist as provider products are not. */
export const PATTERNS = [
  ["api.anthropic.com", /api\.anthropic\.com/i],
  ["@anthropic-ai/sdk", /@anthropic-ai\/sdk/i],
  ["generativelanguage.googleapis.com", /generativelanguage\.googleapis\.com/i],
  ["api.openai.com", /api\.openai\.com/i],
  ["dashscope", /dashscope/i],
  ["deepseek", /deepseek/i],
  ["z.ai", /(^|[^A-Za-z0-9_])z\.ai\b/i],
  ["bigmodel.cn", /bigmodel\.cn/i],
  ["moonshot", /moonshot/i],
  ["kimi", /kimi/i],
  ["openrouter", /openrouter/i],
  // provider SDK packages: import / dynamic import / require of them only inside adapters (the bare word "openai" stays
  // allowed elsewhere — only the package specifier is blocked)
  ["provider SDK import", /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["'](?:openai|@google\/genai|@google\/generative-ai|@anthropic-ai\/[^"']*|groq-sdk|@mistralai\/[^"']*)["']/]
];

const ALLOWED_DIR = ["backend", "src", "ai", "adapters"].join("/");

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  let out = [];
  let names = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) out = out.concat(walk(p));
    else if (/\.(m?js|cjs|ts)$/.test(n)) out.push(p);
  }
  return out;
}

/** @param {string} root repository root @returns {{file: string, line: number, pattern: string}[]} */
export function scan(root) {
  const hits = [];
  for (const abs of walk(join(root, "backend", "src"))) {
    const rel = relative(root, abs).split(sep).join("/");
    if (rel.startsWith(ALLOWED_DIR + "/")) continue;
    readFileSync(abs, "utf8").split("\n").forEach((l, i) => {
      for (const [name, re] of PATTERNS) if (re.test(l)) hits.push({ file: rel, line: i + 1, pattern: name });
    });
  }
  return hits;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--root");
  const root = i >= 0 ? resolve(argv[i + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const hits = scan(root);
  if (hits.length) {
    for (const h of hits) console.error(`${h.file}:${h.line}: AI provider "${h.pattern}" outside backend/src/ai/adapters/`);
    console.error(`check-ai-providers: FAILED (${hits.length}) — move provider-specific code into backend/src/ai/adapters/`);
    process.exit(1);
  }
  console.log("check-ai-providers: OK — provider hosts / names / SDK only in backend/src/ai/adapters/");
}
