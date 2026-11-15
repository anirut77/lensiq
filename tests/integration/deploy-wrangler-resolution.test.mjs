// tests/integration/deploy-wrangler-resolution.test.mjs — pins how the INSTALLED wrangler resolves the target of every
// argument list the deploy tools build (tools/lib/cf-guard.mjs effectiveTarget / checkWranglerBundle).
//
// Why: wrangler does not resolve the Worker name the same way in every command (review finding 2026-11-10). In wrangler
// 4.158.0 `secret put | list | delete | bulk` and `tail` use getLegacyScriptName: `${--name}-${--env}` when both flags are
// given, so `secret put X --env test --name lensiq-api-test` targets "lensiq-api-test-test" (and, with piped input,
// creates a draft Worker of that name). The tools therefore pass `--env test` only to secret commands. This test reads
// the real bundle and wrangler's own configuration reader; nothing is sent anywhere (no network, no account, no login).
// A wrangler upgrade that changes a rule fails here (and stops the scripts at run time: assertWranglerBundle).
//
// Needs `npm ci` in backend/. Skipped (not failed) when wrangler is absent, like backend-workerd.test.mjs.
// Run: npm run test:integration
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED, BUNDLE_RULES, ENV, WRANGLER_BUNDLE, assertEffective, checkWranglerBundle, deployedArgs, effectiveTarget, readTargets } from "../../tools/lib/cf-guard.mjs";
import { commands } from "../../tools/backend-deploy.mjs";
import { SECRETS, secretArgs } from "../../tools/secrets-setup.mjs";
import { executeArgs } from "../../tools/ai-deploy-defaults.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BACKEND = join(ROOT, "backend");
const have = existsSync(WRANGLER_BUNDLE);
const skip = have ? false : "wrangler is not installed (run `npm ci` in backend/)";

test("wrangler bundle: the name-resolution rules the guard models are the ones in the installed wrangler", { skip }, () => {
  assert.deepEqual(checkWranglerBundle(), { ok: true, problems: [] });
  const src = readFileSync(WRANGLER_BUNDLE, "utf8");
  for (const [what, text] of BUNDLE_RULES) assert.ok(src.includes(text), what);
  // run wrangler's own two functions (extracted from the bundle) on the tools' flags
  const legacy = new Function("args", "config2", BUNDLE_RULES[0][1]);
  const plain = new Function("args", "config2", "return args.name ?? config2.name;");
  const cfg = { name: ALLOWED.worker };
  assert.equal(legacy({ env: ENV }, cfg), "lensiq-api-test", "secret commands with --env test only -> the environment's name");
  assert.equal(legacy({ env: ENV, name: ALLOWED.worker }, cfg), "lensiq-api-test-test", "with --name as well, a secret command targets another Worker");
  assert.equal(plain({ env: ENV, name: ALLOWED.worker }, cfg), "lensiq-api-test", "deploy / rollback / versions / deployments");
});

test("wrangler config reader: [env.test] resolves to Worker lensiq-api-test and D1 lensiq-test; the default config does not", { skip }, () => {
  const require = createRequire(join(BACKEND, "package.json"));
  const { unstable_readConfig } = require("wrangler");
  const env = unstable_readConfig({ config: join(BACKEND, "wrangler.toml"), env: ENV });
  assert.equal(env.name, ALLOWED.worker);
  assert.deepEqual(env.d1_databases.map(d => [d.binding, d.database_name]), [["DB", ALLOWED.d1]]);
  assert.deepEqual([env.workers_dev, env.preview_urls, env.triggers.crons], [true, false, ["17 3 * * *"]]);
  assert.deepEqual([env.observability.enabled, env.observability.head_sampling_rate], [true, 0.5]);
  assert.deepEqual([env.vars.TESTER_GATE, env.vars.ALLOWED_ORIGINS, env.vars.AI_EVAL_LOCAL], ["required", "https://anirut77.github.io", undefined]);
  const top = unstable_readConfig({ config: join(BACKEND, "wrangler.toml") });
  assert.equal(top.name, "lensiq-api", "without --env wrangler reads the template name, which the guard refuses");
  const t = readTargets();
  assert.deepEqual([t.worker, t.d1], [env.name, env.d1_databases[0].database_name], "the guard's own reading of wrangler.toml agrees with wrangler's");
});

test("every argument list of the deploy tools: wrangler's real rule gives exactly lensiq-api-test / lensiq-test", { skip }, () => {
  const src = readFileSync(WRANGLER_BUNDLE, "utf8");
  assert.ok(src.includes(BUNDLE_RULES[0][1]));
  const legacy = new Function("args", "config2", BUNDLE_RULES[0][1]);
  const t = readTargets();
  const flag = (args, n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const C = commands(t, { version: "11111111-2222-4333-8444-555555555555", outdir: "/tmp/x" });
  // the argument builders the tools really use (imported, not copied): re-adding --name to a secret command fails here
  const lists = [...Object.values(C).flat(), deployedArgs(t), secretArgs.list(), ...SECRETS.map(s => secretArgs.put(s.name)), executeArgs(t, "SELECT 1")];
  for (const a of [secretArgs.list(), secretArgs.put("X")]) assert.ok(!a.includes("--name") && a.includes("--env"), "secret commands carry --env only");
  const table = [];
  for (const args of lists) {
    const eff = assertEffective(args, t);
    if (eff.kind !== "worker") { table.push([args.slice(0, 3).join(" "), eff.kind === "d1" ? eff.name : "(read-only, no target)"]); continue; }
    // the same flags through wrangler's own function; config2 = what wrangler reads for --env test
    const a = { name: flag(args, "--name"), env: flag(args, "--env") };
    const real = args[0] === "secret" ? legacy(a, { name: t.worker }) : a.name ?? t.worker;
    assert.equal(real, ALLOWED.worker, args.join(" "));
    assert.equal(eff.name, real, "the guard's model equals wrangler's rule for: " + args.join(" "));
    table.push([args.slice(0, 3).join(" "), real]);
  }
  assert.ok(table.filter(r => r[1] === ALLOWED.worker).length >= 9 && table.some(r => r[1] === ALLOWED.d1));
  assert.equal(effectiveTarget(["secret", "put", "X", "--env", ENV, "--name", ALLOWED.worker], t).name, legacy({ env: ENV, name: ALLOWED.worker }, { name: t.worker }));
});
