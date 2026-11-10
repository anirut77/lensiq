#!/usr/bin/env node
// tools/ai-test-enable.mjs — switch the three Product Check AI features ON in a LOCAL test environment only (round 17 P7,
// for P8). Writes the gateway settings row of the LOCAL D1 used by `wrangler dev` (backend/.wrangler/state), never a
// deployed Worker: it always runs `wrangler d1 execute lensiq --local` and refuses --remote and CI. It never reads or
// prints a key; it only says which key NAMES are set in backend/.dev.vars.
//
//   node tools/ai-test-enable.mjs                    on: pc_fields / pc_claims / pc_translate, total budget 50 USD
//        [--budget 50]                               total USD across the three (split 40 / 40 / 20 %)
//        [--per-model 10]                            the per-model cap the eval runner enforces (printed for the record)
//        [--chain pc_claims=anthropic:claude-sonnet-5-5,openai:gpt-6.1-terra]   override a feature's chain (repeatable)
//        [--persist-to DIR]                          same as wrangler's --persist-to
//        [--dry-run]                                 print what would be written, change nothing
//   node tools/ai-test-enable.mjs --off              back to the new-install defaults: AI off, features off, budget 0
// Before: `cd backend && npm run db:migrate:local`; backend/.dev.vars with the keys (names in .dev.vars.example),
// ALLOWED_ORIGINS=http://localhost:8000, TURNSTILE_DISABLED_FOR_LOCAL_DEV=true and, for tools/pc-ai-eval.mjs, AI_EVAL_LOCAL=1.
// Then `cd backend && npx wrangler dev` (local). Docs: docs/product-check/P7-RESULTS.md §6.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PC_FEATURES, TRIAL, assertNotCI, buildSettings, devVarsNames, execLocal, settingsSql } from "./lib/ai-trial.mjs";

const SECRETS = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "DASHSCOPE_API_KEY", "DEEPSEEK_API_KEY", "ZAI_API_KEY", "KIMI_API_KEY", "OPENROUTER_API_KEY"];

/** @param {string[]} argv */
export function parseArgs(argv) {
  if (argv.includes("--remote")) throw new Error("--remote is not supported: this tool only writes the LOCAL D1");
  const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const num = (k, d) => { const v = opt(k); if (v === undefined) return d; const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1000) throw new Error(`${k} must be 0-1000 USD`); return n; };
  /** @type {Record<string, any[]>} */ const chains = {};
  argv.forEach((a, i) => {
    if (a !== "--chain") return;
    const [f, list] = String(argv[i + 1] || "").split("=");
    if (!PC_FEATURES.includes(f) || !list) throw new Error("--chain feature=provider:model[,provider:model]");
    chains[f] = list.split(",").map(x => { const [provider, ...m] = x.split(":"); return { provider, model: m.join(":") }; });
  });
  return { off: argv.includes("--off"), dryRun: argv.includes("--dry-run"), totalUsd: num("--budget", TRIAL.totalUsd), perModelUsd: num("--per-model", TRIAL.perModelUsd),
    persistTo: opt("--persist-to"), chains };
}

export async function main(argv = process.argv.slice(2), o = {}) {
  assertNotCI(o.env);
  const a = parseArgs(argv);
  const value = await buildSettings({ off: a.off, totalUsd: a.totalUsd, chains: a.chains });
  const r = execLocal(settingsSql(value), { dryRun: a.dryRun, persistTo: a.persistTo, run: o.run });
  const log = o.log || console.log;
  log(`${a.dryRun ? "[dry run] " : ""}local D1 (wrangler dev): AI ${value.enabled ? "ON" : "OFF"}`);
  for (const f of PC_FEATURES) {
    const s = value.features[f];
    const chain = (s.chain || []).map(e => e.provider + ":" + e.model).join(" -> ") || "-";
    log(`  ${f}: ${s.enabled ? "on" : "off"}, budget ${s.monthlyBudgetUsd} USD, chain ${chain}${s.imageModeAllowed ? ", image mode allowed" : ""}`);
  }
  if (!a.off) log(`  per-model cap for tools/pc-ai-eval.mjs: ${a.perModelUsd} USD (pass --per-model there too); total ${a.totalUsd} USD`);
  const dv = devVarsNames(o.devVars);
  if (!dv.exists) log("  backend/.dev.vars not found: copy backend/.dev.vars.example and set the keys you have");
  else {
    log("  keys set (names only): " + (SECRETS.filter(n => dv.set.has(n)).join(", ") || "none"));
    if (dv.values.AI_EVAL_LOCAL !== "1") log("  for the eval runner add AI_EVAL_LOCAL=1 to backend/.dev.vars " +
      "(local evaluation mode, localhost only: cost + latency echo, product-label filter skipped)");
    if (dv.values.TURNSTILE_DISABLED_FOR_LOCAL_DEV !== "true") log("  add TURNSTILE_DISABLED_FOR_LOCAL_DEV=true (local origins only)");
    if (!/localhost/.test(dv.values.ALLOWED_ORIGINS || "")) log("  add http://localhost:8000 to ALLOWED_ORIGINS in backend/.dev.vars");
  }
  return { value, r };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error("ai-test-enable: " + (e && e.message ? e.message : e)); process.exit(1); });
}
