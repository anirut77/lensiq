#!/usr/bin/env node
// tools/ai-deploy-defaults.mjs — `npm run ai:deploy-defaults`: the AI gateway settings of the closed-test deployment,
// written ONCE to the remote D1 "lensiq-test" with ONE printed `wrangler d1 execute`. Everything is OFF: the owner turns
// the global switch and each feature on in the admin panel (password + TOTP). Owner decisions 2026-11-10.
//
// This is a separate artefact from the repo defaults (backend/src/ai/adapters/index.js DEFAULT_CHAINS, pinned by tests
// and unchanged): a new on-premise install still starts with the direct no-training providers, budget 0.
//
//   npm run ai:deploy-defaults                 = --dry-run: print the settings, the SQL and the command; run nothing
//   npm run ai:deploy-defaults -- --apply      run it against D1 "lensiq-test" (target printed first, name guard, never in CI)
//
// The row is validated by the gateway's own putGateway() on an in-memory D1 before it is printed, so the admin rules
// apply. INSERT ... ON CONFLICT DO NOTHING: a later run never overwrites what the owner changed in the admin panel.
// No secret is read, printed or sent: the SQL holds settings only.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ENV, GuardError, accountEnvRefusal, assertSafeEnv, assertTarget, assertWranglerBundle, readTargets, verifyD1, wrangler } from "./lib/cf-guard.mjs";

const ROUTER = ["open", "router"].join(""); // the provider id of the router adapter
/** The two models of the default order (through the router; pinned serving providers: adapters ROUTES). */
export const PRIMARY = "anthropic/claude-haiku-5.5";
export const FALLBACK = "openai/gpt-6-luna";
export const BUDGET_USD = Object.freeze({ pc_fields: 5, pc_translate: 3, pc_claims: 2 });
export const LIMITS = Object.freeze({ perUserDaily: 20, perUserPerMinute: 3, globalPerMinute: 20 });
/** Selectable in the admin panel, NOT in the default order (P8-RESULTS; the note is also shown in admin -> AI Gateway). */
export const OPTIONAL_MODELS = Object.freeze([
  { model: "qwen/qwen3.8-27b", note: "P8: median 12-15 s; many answers cut at the 1,500-token output cap. Not for pc_fields / pc_claims" },
  { model: "deepseek/deepseek-v4.1-flash", note: "P8: median 7.5-8.7 s; 0 / 16 pc_fields answers within the 1,500-token cap. Usable for pc_translate only" },
  { model: "z-ai/glm-5.3-flash", note: "the Chinese-language option: pc_translate 23 / 23 lines, median 2.4 s (P8). Not for pc_fields" }
]);

/** The gateway patch (what an admin PUT would carry). Everything OFF. */
export function deployPatch(providerIds) {
  const chain = [{ provider: ROUTER, model: PRIMARY, effort: "low" }, { provider: ROUTER, model: FALLBACK }];
  return {
    enabled: false,
    legacyKeyStore: false,
    providers: Object.fromEntries(providerIds.map(id => [id, id === ROUTER])),
    features: {
      // image mode allowed for testers from the start (owner decision): one consent with "remember", blurred preview
      // every time, the product-label filter active; text stays the default and the fallback
      pc_fields: { enabled: false, chain, monthlyBudgetUsd: BUDGET_USD.pc_fields, ...LIMITS, maxOutputTokens: 1500, timeoutMs: 20000, imageModeAllowed: true },
      pc_translate: { enabled: false, chain, monthlyBudgetUsd: BUDGET_USD.pc_translate, ...LIMITS, maxOutputTokens: 1500, timeoutMs: 30000, imageModeAllowed: false },
      // stays off for customers (P8: no model meets the target); prepared so the owner can try it in a demo session
      pc_claims: { enabled: false, chain: [{ provider: ROUTER, model: "openai/gpt-6.1-terra" }, { provider: ROUTER, model: "anthropic/claude-sonnet-5.5" }],
        monthlyBudgetUsd: BUDGET_USD.pc_claims, ...LIMITS, perUserDaily: 10, maxOutputTokens: 1500, imageModeAllowed: false }
    }
  };
}

/** {gateway, ai}: the two settings rows, produced and validated by the Worker's own code on an in-memory D1. */
export async function buildRows() {
  const { createEnv } = createRequire(import.meta.url)("../tests/unit/backend-d1-shim.js");
  const { putGateway } = await import("../backend/src/ai/settings.js");
  const { PROVIDER_IDS } = await import("../backend/src/ai/adapters/index.js");
  const { putAiSettings, getAiSettings } = await import("../backend/src/settings.js");
  const env = createEnv();
  const patch = deployPatch([...PROVIDER_IDS]);
  if (patch.enabled !== false || Object.values(patch.features).some(f => f.enabled !== false)) throw new Error("deploy defaults must be all OFF");
  await putGateway(env.DB, patch);
  await putAiSettings(env.DB, { enabled: false }); // fortune writing assistant: off (it is not gated by the global switch)
  const row = async key => JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first()).value);
  const gateway = await row("ai_gateway"), ai = await row("ai");
  if (gateway.enabled !== false || (await getAiSettings(env.DB)).enabled !== false) throw new Error("deploy defaults must be all OFF");
  return { gateway, ai };
}

/** The one wrangler argument list of this tool. @param {{d1: string}} t @param {string} sql */
export const executeArgs = (t, sql) => ["d1", "execute", t.d1, "--remote", "--env", ENV, "--yes", "--command", sql];

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
/** One statement: both rows, never overwriting an existing row. */
export function deploySql(rows, t = Math.floor(Date.now() / 1000)) {
  return `INSERT INTO settings (key, value, updated_at) VALUES ('ai_gateway', ${q(JSON.stringify(rows.gateway))}, ${t}), ('ai', ${q(JSON.stringify(rows.ai))}, ${t}) ON CONFLICT (key) DO NOTHING;`;
}

const SELECT_SQL = "SELECT key, value FROM settings WHERE key IN ('ai_gateway', 'ai')";
/** Read-only: the two settings rows that exist now. @param {{d1: string}} t */
export const readArgs = t => ["d1", "execute", t.d1, "--remote", "--env", ENV, "--json", "--command", SELECT_SQL];
/** {ai_gateway?, ai?} parsed from `wrangler d1 execute --json`, or null when the answer cannot be read. */
export function parseRows(out) {
  const text = String(out || "");
  for (let at = text.indexOf("["); at >= 0; at = text.indexOf("[", at + 1)) {
    try {
      const j = JSON.parse(text.slice(at));
      const rows = Array.isArray(j) && j[0] && Array.isArray(j[0].results) ? j[0].results : null;
      if (!rows) continue;
      const o = {};
      for (const r of rows) { try { o[String(r.key)] = JSON.parse(r.value); } catch { o[String(r.key)] = null; } }
      return o;
    } catch { /* not here */ }
  }
  return null;
}
/** One line per switch of the settings that are stored now (no secret is in them). */
export function summary(rows) {
  const g = rows.ai_gateway || {}, f = g.features || {};
  const out = [`  global AI switch: ${g.enabled === true ? "ON" : "off"} · fortune AI: ${rows.ai && rows.ai.enabled === true ? "ON" : rows.ai ? "off" : "(no row: default)"} · providers allowed: ` +
    (Object.entries(g.providers || {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "(default)")];
  for (const id of Object.keys(f)) {
    const x = f[id];
    out.push(`  ${id}: ${x.enabled === true ? "ON" : "off"} · ${(x.chain || []).map(c => c.model).join(" -> ")} · ${x.monthlyBudgetUsd} USD/month` +
      ` · image mode ${x.imageModeAllowed ? "allowed" : "no"}`);
  }
  return out;
}

/** @param {string[]} argv @param {{print?: (s: string) => void, env?: any, toml?: string}} [io] */
export async function main(argv, io = {}) {
  const print = io.print || (s => console.log(s));
  const env = io.env || process.env;
  const apply = argv.includes("--apply");
  const t = readTargets(io.toml);
  print(`LENSIQ AI deploy defaults · environment "${t.env}" · ${apply ? "APPLY" : "dry run (nothing is sent)"}`);
  print(`TARGET   D1 database "${t.d1}" (table settings: rows 'ai_gateway' and 'ai', only if they do not exist yet)`);
  try { assertTarget("d1", t.d1); assertTarget("worker", t.worker); } catch (e) { if (e instanceof GuardError) { print(e.message); return 3; } throw e; }
  if (apply && (env.CI || env.GITHUB_ACTIONS)) { print("REFUSED: never runs in CI."); return 3; }
  const rows = await buildRows();
  const sql = deploySql(rows);
  const f = rows.gateway.features;
  print("SETTINGS (all OFF until the owner turns them on in admin -> AI Gateway):");
  print(`  global switch: ${rows.gateway.enabled} · fortune AI: ${rows.ai.enabled} · providers allowed: ${Object.entries(rows.gateway.providers).filter(([, v]) => v).map(([k]) => k).join(", ")}`);
  for (const id of Object.keys(f)) {
    print(`  ${id}: enabled ${f[id].enabled} · ${f[id].chain.map(c => c.model).join(" -> ")} · ${f[id].monthlyBudgetUsd} USD/month · ` +
      `${f[id].perUserDaily}/user/day, ${f[id].perUserPerMinute}/user/min, ${f[id].globalPerMinute}/min all users · image mode ${f[id].imageModeAllowed ? "allowed" : "no"}`);
  }
  print(`  total monthly ceiling: ${Object.values(f).reduce((s, x) => s + x.monthlyBudgetUsd, 0)} USD`);
  print("  not in the default order; in THIS deployment (serving providers pinned) refused until a pin is added for them: " + OPTIONAL_MODELS.map(m => `${m.model} (${m.note})`).join("; "));
  print("SQL");
  print(sql);
  try {
    if (apply) {
      assertWranglerBundle(env);
      assertSafeEnv(env);
      const refuse = accountEnvRefusal(env, argv, print);
      if (refuse) { print(refuse); return 3; }
      // the id in wrangler.toml must be the database NAMED lensiq-test (read-only check) before anything is written
      const why = verifyD1(t, { print, env, creds: argv.includes("--account-confirmed") });
      if (why) { print(`REFUSED: ${why}. Nothing was changed.`); return 3; }
    }
  } catch (e) { if (e instanceof GuardError) { print(e.message); return 3; } throw e; }
  if (apply) {
    // read first (read-only): rows that exist are the owner's settings and are never overwritten
    const cur = wrangler(readArgs(t), { print, env, cfg: t, creds: argv.includes("--account-confirmed"), capture: true, target: `D1 database "${t.d1}" (read-only: which settings exist now)` });
    const have = cur.status === 0 ? parseRows(cur.stdout) : null;
    if (!have) { print("REFUSED: the current settings could not be read. Nothing was written."); return 1; }
    const keys = Object.keys(have);
    if (keys.includes("ai_gateway") && keys.includes("ai")) {
      print("EXISTING SETTINGS KEPT, NOTHING WRITTEN: both rows already exist (the owner's choices are never overwritten). They are now:");
      for (const l of summary(have)) print(l);
      return 0;
    }
    if (keys.length) print(`NOTE: the row '${keys[0]}' already exists and is kept as it is; only the missing row is written.`);
  }
  const r = wrangler(executeArgs(t, sql), { print, printOnly: !apply, env, cfg: t, creds: argv.includes("--account-confirmed"),
    target: `D1 database "${t.d1}" (INSERT ... ON CONFLICT DO NOTHING)` });
  if (!apply) print('Dry run: nothing was sent. To write it: npm run ai:deploy-defaults -- --apply');
  else print(r.status === 0 ? "WRITTEN: the all-OFF settings above are stored (rows that did not exist yet)." : `FAILED (exit ${r.status}): nothing can be assumed written; run it again.`);
  return r.status;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main(process.argv.slice(2)).then(c => process.exit(c));
