// tools/lib/ai-trial.mjs — shared by tools/ai-test-enable.mjs and tools/pc-ai-eval.mjs (round 17 P7, for the P8 eval).
// LOCAL ONLY: everything here writes to the LOCAL D1 of `wrangler dev` (`wrangler d1 execute lensiq --local`) and talks to
// a localhost Worker. It refuses --remote, a non-localhost base URL and CI. It never reads, prints or passes an API key:
// backend/.dev.vars is only checked for which NAMES are set.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BACKEND = join(REPO, "backend");
export const PC_FEATURES = ["pc_fields", "pc_claims", "pc_translate"];
/** Trial defaults (owner, 2026-11-10): 50 USD in total across the three features, 10 USD per model. */
export const TRIAL = Object.freeze({ totalUsd: 50, perModelUsd: 10, split: Object.freeze({ pc_fields: 0.4, pc_claims: 0.4, pc_translate: 0.2 }) });
export const LIMITS = Object.freeze({ perUserDaily: 10000, perUserPerMinute: 60, globalPerMinute: 120 });

/** @param {any} env */
export function assertNotCI(env = process.env) {
  if (env.CI || env.GITHUB_ACTIONS) throw new Error("refusing to run in CI: the AI trial and eval run only against a local `wrangler dev` with the owner's keys");
}
/** @param {string} url */
export function assertLocalBase(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error("not a URL: " + url); }
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) || !/^https?:$/.test(u.protocol)) throw new Error(`refusing ${u.origin}: only a local wrangler dev (localhost / 127.0.0.1) is allowed`);
  return u.origin;
}
/** Which secret / var NAMES are set in backend/.dev.vars (values are never returned). @param {string} [file] */
export function devVarsNames(file = join(BACKEND, ".dev.vars")) {
  if (!existsSync(file)) return { exists: false, set: new Set(), values: {} };
  const set = new Set(), safe = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m || !m[2].trim()) continue;
    set.add(m[1]);
    // only these non-secret switches are read by value
    if (["AI_EVAL_LOCAL", "TURNSTILE_DISABLED_FOR_LOCAL_DEV", "ALLOWED_ORIGINS"].includes(m[1])) safe[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
  return { exists: true, set, values: safe };
}

/**
 * Trial settings (validated by the gateway's own putGateway on an in-memory D1, so the admin rules apply):
 * global AI on, the three features on, budgets = total x split, generous local rate limits, image mode allowed for
 * pc_fields. chains: {feature: [{provider, model, effort?}]}; omitted = the feature's default chain.
 * @param {{totalUsd?: number, split?: Record<string, number>, chains?: Record<string, any[]>, off?: boolean}} o
 */
export async function buildSettings(o = {}) {
  const { createEnv } = createRequire(import.meta.url)("../../tests/unit/backend-d1-shim.js");
  const { putGateway, DEFAULT_GATEWAY } = await import("../../backend/src/ai/settings.js");
  const env = createEnv();
  const total = o.totalUsd ?? TRIAL.totalUsd, split = o.split || TRIAL.split;
  const features = {};
  for (const id of PC_FEATURES) {
    features[id] = o.off
      ? { enabled: false, monthlyBudgetUsd: 0, imageModeAllowed: false, chain: DEFAULT_GATEWAY.features[id].chain }
      : { enabled: true, monthlyBudgetUsd: Math.round(total * (split[id] || 0) * 100) / 100, ...LIMITS, ...(id === "pc_fields" ? { imageModeAllowed: true } : {}),
        ...(o.chains && o.chains[id] ? { chain: o.chains[id] } : {}) };
  }
  await putGateway(env.DB, { enabled: !o.off, features });
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ai_gateway'").first();
  return JSON.parse(row.value);
}

/** One SQL statement that writes the settings row (same shape as store.js putSetting). @param {any} value */
export function settingsSql(value, t = Math.floor(Date.now() / 1000)) {
  const q = s => "'" + String(s).replace(/'/g, "''") + "'";
  return `INSERT INTO settings (key, value, updated_at) VALUES ('ai_gateway', ${q(JSON.stringify(value))}, ${t}) ` +
    "ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;";
}

/** Runs one SQL statement on the LOCAL D1 only. @param {string} sql @param {{dryRun?: boolean, run?: Function, persistTo?: string}} [o] */
export function execLocal(sql, o = {}) {
  const args = ["wrangler", "d1", "execute", "lensiq", "--local", "--command", sql];
  if (o.persistTo) args.push("--persist-to", o.persistTo);
  if (args.includes("--remote") || !args.includes("--local")) throw new Error("local D1 only");
  if (o.dryRun) return { ok: true, dryRun: true, args };
  const run = o.run || ((cmd, a) => spawnSync(cmd, a, { cwd: BACKEND, encoding: "utf8", env: { ...process.env, CLOUDFLARE_API_TOKEN: "" } }));
  const r = run("npx", args);
  if (r.status !== 0) throw new Error("wrangler d1 execute --local failed: " + String(r.stderr || r.stdout || "").split("\n").slice(-5).join(" ").slice(0, 400));
  return { ok: true };
}
