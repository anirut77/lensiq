#!/usr/bin/env node
// tools/ai-key-check.mjs — owner tool: do the AI provider keys work? (round 17 P5, docs/AI-GATEWAY.md §3a)
//
//   npm run -s ai:keycheck                      keys from the environment, then backend/.dev.vars (git-ignored)
//   node tools/ai-key-check.mjs --vars FILE     another dotenv-style file
// Prints ONE line per provider: "<provider> <SECRET_NAME> OK|FAIL|SKIP http=<status>" — never a key, never a key prefix,
// never a response body or an error message. One read-only "list models" (or key-info) request per provider: nothing is
// generated or billed. Refuses to run in CI (keys never go to CI). Production keys are set with
// `cd backend && npx wrangler secret put <SECRET_NAME>`; this tool cannot read those (Cloudflare never returns a secret).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkKeys } from "../backend/src/ai/adapters/keycheck.js";
import { SECRET_NAMES } from "../backend/src/ai/adapters/index.js";

/** dotenv-style KEY=value lines (comments, blank lines, optional quotes). Only the AI secret names (and the non-secret
 *  DASHSCOPE_WORKSPACE_ID, part of the Singapore endpoint URL) are kept. */
export function parseVars(text) {
  const want = new Set([...Object.values(SECRET_NAMES), "DASHSCOPE_WORKSPACE_ID"]);
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || !want.has(m[1])) continue;
    out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2").trim();
  }
  return out;
}

/** @param {{provider: string, secret: string, status: string, http: number|null, verified: boolean, note?: string}} r */
export const formatLine = r => `${r.provider.padEnd(10)} ${r.secret.padEnd(19)} ${r.status.padEnd(4)} http=${r.http == null ? "-" : r.http}` +
  `${r.verified ? "" : " (endpoint not verified)"}${r.note ? " (" + r.note + ")" : ""}`;

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.env.CI) { console.error("ai-key-check: refuses to run in CI (keys never go to CI)"); process.exit(2); }
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--vars");
  const file = i >= 0 ? resolve(argv[i + 1]) : join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "backend", ".dev.vars");
  const fromFile = existsSync(file) ? parseVars(readFileSync(file, "utf8")) : {};
  const fromEnv = parseVars(Object.entries(process.env).map(([k, v]) => `${k}=${v}`).join("\n"));
  const rows = await checkKeys({ ...fromFile, ...fromEnv }, fetch);
  for (const r of rows) console.log(formatLine(r));
  process.exit(rows.some(r => r.status === "FAIL") ? 1 : 0);
}
