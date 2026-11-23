// tests/integration/prod-wrangler-config.test.mjs — production tooling A1 (LOCKED, evals-locks/prod-tooling.sha256):
// wrangler's OWN configuration reader resolves [env.production] of backend/wrangler.toml to Worker "lensiq-prod-api" and
// D1 "lensiq-prod", agrees with the guard's reading (tools/lib/cf-guard.mjs readTargets(…, "production")), and the real
// name rules give exactly those names for every argument list the production tools build. Nothing is sent anywhere (no
// network, no account, no login). Needs `npm ci` in backend/; skipped (not failed) when wrangler is absent.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLE_RULES, WRANGLER_BUNDLE, assertEffective, deployedArgs, readTargets } from "../../tools/lib/cf-guard.mjs";
import { commands } from "../../tools/backend-deploy.mjs";
import { secretArgs } from "../../tools/secrets-setup.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BACKEND = join(ROOT, "backend");
const skip = existsSync(WRANGLER_BUNDLE) ? false : "wrangler is not installed (run `npm ci` in backend/)";

test("wrangler config reader: [env.production] = Worker lensiq-prod-api, D1 lensiq-prod, no workers.dev, one cron", { skip }, () => {
  const require = createRequire(join(BACKEND, "package.json"));
  const { unstable_readConfig } = require("wrangler");
  const env = unstable_readConfig({ config: join(BACKEND, "wrangler.toml"), env: "production" });
  assert.equal(env.name, "lensiq-prod-api");
  assert.deepEqual(env.d1_databases.map(d => [d.binding, d.database_name]), [["DB", "lensiq-prod"]]);
  assert.deepEqual([env.workers_dev, env.preview_urls, env.triggers.crons], [false, false, ["17 3 * * *"]]);
  assert.deepEqual([env.vars.PC_BUILD, env.vars.TESTER_GATE, env.vars.BILLING_ENABLED, env.vars.AI_EVAL_LOCAL], ["customer", "required", "false", undefined]);
  const t = readTargets(undefined, "production");
  assert.deepEqual([t.worker, t.d1, t.d1Id], [env.name, env.d1_databases[0].database_name, env.d1_databases[0].database_id]);
  assert.deepEqual(Object.keys(t.vars).sort(), Object.keys(env.vars).sort(), "the guard reads the same vars as wrangler");
  const test = unstable_readConfig({ config: join(BACKEND, "wrangler.toml"), env: "test" });
  assert.equal(test.name, "lensiq-api-test", "the test environment is unchanged");
});

test("every production argument list: wrangler's real rule gives exactly lensiq-prod-api / lensiq-prod", { skip }, () => {
  const legacy = new Function("args", "config2", BUNDLE_RULES[0][1]);
  const plain = new Function("args", "config2", "return args.name ?? config2.name;");
  const t = readTargets(undefined, "production");
  const cfg = { name: t.worker };
  const flag = (a, n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  const C = commands(t, { version: "11111111-2222-4333-8444-555555555555" });
  const lists = [...Object.values(C).flat(), secretArgs.list("production"), secretArgs.put("X", "production"), deployedArgs(t)];
  for (const a of lists) {
    const eff = assertEffective(a, t);
    if (eff.kind === "none") continue;
    if (eff.kind === "d1") { assert.equal(eff.name, "lensiq-prod", a.join(" ")); continue; }
    const real = a[0] === "secret" ? legacy({ name: flag(a, "--name"), env: flag(a, "--env") }, cfg) : plain({ name: flag(a, "--name"), env: flag(a, "--env") }, cfg);
    assert.equal(real, "lensiq-prod-api", a.join(" "));
    assert.equal(eff.name, real, a.join(" "));
  }
});
