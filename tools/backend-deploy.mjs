#!/usr/bin/env node
// tools/backend-deploy.mjs — the ONLY way LENSIQ scripts touch the owner's (shared) Cloudflare account.
// Every action prints its target first and goes through tools/lib/cf-guard.mjs, which checks the names in wrangler.toml
// AND the effective target wrangler resolves for each exact argument list (a target that is not LENSIQ's own resource
// is refused with exit 3 before wrangler starts). docs/DEPLOY.md.
//
//   node tools/backend-deploy.mjs plan             print the targets and every command of the deploy, run nothing
//   node tools/backend-deploy.mjs whoami           which account wrangler is logged in to (read-only; no token is shown)
//   node tools/backend-deploy.mjs dry-run          wrangler deploy --dry-run --env test (builds the bundle; no account)
//   node tools/backend-deploy.mjs d1:create        create D1 "lensiq-test" and write its id into wrangler.toml [env.test]
//   node tools/backend-deploy.mjs d1:bind          (database already exists) read its id with `d1 list` and write it
//   node tools/backend-deploy.mjs migrate          apply backend/migrations to D1 "lensiq-test" (remote)
//   node tools/backend-deploy.mjs deploy           build the admin shell, deploy Worker "lensiq-api-test"
//   node tools/backend-deploy.mjs off | on         kill switch: secret SERVICE_OFF = 1 | 0 on Worker "lensiq-api-test"
//   node tools/backend-deploy.mjs bootstrap:close  after the owner account exists: replace ADMIN_BOOTSTRAP_TOKEN with a random
//                                                  value nobody knows (never printed), so the bootstrap can never be used again
//   node tools/backend-deploy.mjs tester:revoke    replace TESTER_ACCESS_CODE with a random value nobody knows: every tester
//                                                  is refused until the owner sets a new code (npm run secrets:setup -- --only …)
//   node tools/backend-deploy.mjs list             what exists: deployments, secret NAMES, D1 databases (read-only)
//   node tools/backend-deploy.mjs versions         versions of the Worker (ids for a rollback; read-only)
//   node tools/backend-deploy.mjs rollback <id>    wrangler rollback <id> --env test (D1 data and secrets are not rolled back)
// Flags: --print-only (print target + command, run nothing) · --account-confirmed (see cf-guard accountEnvRefusal).
//        --env production   the PRODUCTION environment (backend/wrangler.production.toml [env.production]: Worker "lensiq-prod-api",
//                           D1 "lensiq-prod"; every command gets --config wrangler.production.toml; SELL-READY decision 11 ก).
//                           Default: test. Every action above works the same way with it, and additionally:
//                           a mutating action needs --confirm-production (the owner's explicit go: owner item 231 for the
//                           first creation, docs/PRODUCTION-MOVE-PLAN.md); an npm script named for the test environment
//                           (backend:*:test) is refused; deploy is refused while productionProblems() lists anything (the
//                           domain values are still empty, a test origin, AI / lookup routes public, PC_BUILD not customer …).
// Nothing but plan / dry-run runs in CI.
// Before a secret is written the Worker must already be deployed (a secret put on a missing Worker would create a draft
// Worker); before migrate / deploy the database id in wrangler.toml must be the id of the database named "lensiq-test".
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readTesterPolicy, testerVerdict, workerTesterProblems } from "./lib/tester-policy.mjs";
import { readProdBase } from "./build-prod-site.mjs";
import {
  BACKEND, CONFIG, D1_PLACEHOLDER, ENV, ENVS, GuardError, accountEnvRefusal, configArgs, tomlFor, assertSafeEnv, assertTarget, assertWranglerBundle, fillDatabaseId, parseDatabaseId, readTargets,
  verifyD1, workerDeployed, wrangler
} from "./lib/cf-guard.mjs";

export const ACTIONS = ["plan", "whoami", "dry-run", "d1:create", "d1:bind", "migrate", "deploy", "off", "on", "bootstrap:close", "tester:revoke", "list", "versions", "rollback"];
const MUTATING = new Set(["d1:create", "migrate", "deploy", "off", "on", "bootstrap:close", "tester:revoke", "rollback"]);
/** Actions that may run in CI: they never contact an account. */
const CI_OK = new Set(["plan", "dry-run"]);

/** The wrangler argument lists of each action. Worker commands that resolve `--name ?? env name` get both flags;
 *  SECRET commands get `--env test` only (with --name too, wrangler would target "<name>-test": cf-guard.mjs). */
export function commands(t, o = {}) {
  const E = t.env || ENV;
  const S = [...configArgs(E), "--env", E], W = [...S, "--name", t.worker];
  return {
    whoami: [["whoami"]],
    "dry-run": [["deploy", "--dry-run", ...W, "--outdir", o.outdir || "<temp dir>"]],
    "d1:create": [["d1", "create", t.d1]],
    "d1:bind": [["d1", "list", "--json"]],
    migrate: [["d1", "migrations", "apply", t.d1, "--remote", ...S]],
    deploy: [["deploy", ...W]],
    off: [["secret", "put", "SERVICE_OFF", ...S]],
    on: [["secret", "put", "SERVICE_OFF", ...S]],
    "bootstrap:close": [["secret", "put", "ADMIN_BOOTSTRAP_TOKEN", ...S]],
    "tester:revoke": [["secret", "put", "TESTER_ACCESS_CODE", ...S]],
    list: [["deployments", "list", ...W], ["secret", "list", ...S], ["d1", "list"]],
    versions: [["versions", "list", ...W]],
    rollback: [["rollback", o.version || "<VERSION_ID>", ...W, "--message", "LENSIQ rollback"]]
  };
}

/** The public routes of production, exactly (runbook A.2): status, config, the quote form and the tester check. */
export const PROD_PUBLIC_ROUTES = Object.freeze(["/health", "/health/deep", "/v1/config", "/v1/leads", "/v1/tester/check"]);
/** An IP literal (v4 in any notation wrangler / browsers accept, v6 in brackets): never a production origin. @param {string} host */
const isIpHost = host => /^\[/.test(host) || /^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || /^(\d+\.){0,3}0x/i.test(host);
const ORIGIN_RE = /^https:\/\/[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
/** Hosts that are never a production site or Turnstile hostname: the old site, Cloudflare's own preview / workers hosts,
 *  local hosts and the owner's other projects. @param {string} host */
const notProdHost = host => /(^|\.)github\.io$|(^|\.)pages\.dev$|(^|\.)workers\.dev$|^localhost$|^127\.|^\[|(^|\.)(faksak\.com|tripsdna\.com)$|dearday|aidanex|kaguwood/.test(host);
/** The production values that must hold before `deploy --env production` (docs/PRODUCTION-MOVE-PLAN.md §2.3, runbook A.2).
 *  [] = ready. Names and reasons only; no value of a secret is ever involved (secrets are not in wrangler.toml).
 *  @param {ReturnType<typeof readTargets>} t @returns {string[]} */
export function productionProblems(t, o = {}) {
  const v = t.vars || {}, out = [];
  if (t.workersDev) out.push("workers_dev must be false in [env.production] (the API is served only on the approved custom domain)");
  if (t.previewUrls) out.push("preview_urls must be false in [env.production]");
  const origins = String(v.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (origins.length !== 1 || !ORIGIN_RE.test(origins[0]) || notProdHost(origins[0].slice(8)) || isIpHost(origins[0].slice(8))) {
    out.push('ALLOWED_ORIGINS must be exactly one https origin of the production site, e.g. "https://www.<domain>" ' +
      "(empty until the owner decides the domain; never github.io, pages.dev, workers.dev or localhost)");
  }
  const site = origins.length === 1 && ORIGIN_RE.test(origins[0]) && !isIpHost(origins[0].slice(8)) ? origins[0] : null;
  const hosts = String(v.TURNSTILE_HOSTNAMES || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!site || hosts.length !== 1 || hosts[0] !== site.slice(8)) {
    out.push("TURNSTILE_HOSTNAMES must be exactly the production site's hostname (www.<domain>), nothing else");
  }
  if (!site || v.SITE_URL !== site) out.push("SITE_URL must equal the one ALLOWED_ORIGINS origin (https://www.<domain>, no path, no trailing slash)");
  if (o.base && (!site || o.base !== site + "/")) out.push(`SITE_URL / ALLOWED_ORIGINS must be the configured production base of deploy/site-url.prod.json (${String(o.base).slice(0, 80)})`);
  if (v.LINE_LOGIN_REDIRECT_URI && (!site || v.LINE_LOGIN_REDIRECT_URI !== site + "/account.html")) {
    out.push("LINE_LOGIN_REDIRECT_URI must be empty or <SITE_URL>/account.html");
  }
  const routes = String(v.PUBLIC_ROUTES || "").split(",").map(s => s.trim()).filter(Boolean);
  const want = new Set(PROD_PUBLIC_ROUTES);
  if (routes.length !== want.size || new Set(routes).size !== routes.length || routes.some(r => !want.has(r))) {
    out.push(`PUBLIC_ROUTES must be exactly ${PROD_PUBLIC_ROUTES.join(",")} in production (AI, lookups, medicine, analytics, billing, sign-in stay off)`);
  }
  const fixed = { PC_BUILD: "customer", PC_THFDA_MODE: "link", FREE_MODE: "true", BILLING_ENABLED: "false", ALLOW_GUEST_CHECKOUT: "false", OPN_ALLOW_LIVE: "false",
    GO_LIVE_GATE: "enforce", TESTER_GATE: "required", AI_ROUTE_PIN: "required", REQUIRE_OWNER_TOTP: "true", ADMIN_ORIGINS: "" };
  for (const [k, w] of Object.entries(fixed)) if (String(v[k] ?? "") !== w) out.push(`${k} must be ${JSON.stringify(w)} in production`);
  return out;
}

/** The environment named by --env (default test) or an error text. @param {string[]} argv */
export function envOf(argv) {
  if (argv.filter(a => a === "--env" || a.startsWith("--env=")).length > 1) return { error: "--env given more than once" };
  const i = argv.findIndex(a => a === "--env" || a.startsWith("--env="));
  if (i < 0) return { env: ENV, skip: -1 };
  const val = argv[i] === "--env" ? argv[i + 1] : argv[i].slice(6);
  if (typeof val !== "string" || !Object.hasOwn(ENVS, val)) return { error: `unknown environment ${JSON.stringify(String(val ?? "")).slice(0, 40)}: use --env test (default) or --env production` };
  return { env: val, skip: argv[i] === "--env" ? i + 1 : -1 };
}

/** @param {string[]} argv @param {{print?: (s: string) => void, env?: any, toml?: string, tomlPath?: string, policy?: {enforce: boolean}, policyFile?: string}} [io] @returns {number} exit code */
export function main(argv, io = {}) {
  const print = io.print || (s => console.log(s));
  const env = io.env || process.env;
  const E = envOf(argv);
  if (E.error) { print(E.error); return 2; }
  const words = argv.filter((a, i) => !a.startsWith("--") && i !== E.skip);
  const action = words[0] || "plan";
  const printOnly = argv.includes("--print-only");
  if (!ACTIONS.includes(action)) { print(`unknown action "${action}". Actions: ${ACTIONS.join(", ")}`); return 2; }
  const tomlPath = io.tomlPath || tomlFor(E.env);
  const t = readTargets(io.toml ?? readFileSync(tomlPath, "utf8"), E.env);
  const prod = t.env === "production";
  // 1. print the targets, 2. guard — both before anything else
  print(`LENSIQ backend · action "${action}" · environment "${t.env}"`);
  print(`TARGETS  Worker "${t.worker}" · D1 database "${t.d1}" (id ${t.d1Id === D1_PLACEHOLDER ? "not created yet" : t.d1Id})`);
  try {
    assertTarget("worker", t.worker, t.env); assertTarget("d1", t.d1, t.env);
    if (action !== "plan") assertSafeEnv(env); // e.g. WRANGLER_CI_OVERRIDE_NAME would replace the Worker name of `deploy`
    if (!CI_OK.has(action) && !printOnly && (env.CI || env.GITHUB_ACTIONS)) { print("REFUSED: only plan and dry-run run in CI."); return 3; }
    if (prod && /:test\b|test:/.test(String(env.npm_lifecycle_event || ""))) {
      print(`REFUSED: --env production was given to the npm script "${String(env.npm_lifecycle_event).slice(0, 60)}", which is named for the test environment. ` +
        "Use the production script (npm run backend:deploy:prod) or node tools/backend-deploy.mjs <action> --env production. Nothing was sent to Cloudflare.");
      return 3;
    }
    if (prod && MUTATING.has(action) && !printOnly && !argv.includes("--confirm-production")) {
      print(`REFUSED: "${action}" changes the PRODUCTION Worker "${t.worker}" / D1 "${t.d1}". Repeat with --confirm-production once the owner has given the go ` +
        "(owner item 231 for the first creation; docs/PRODUCTION-MOVE-PLAN.md). Nothing was sent to Cloudflare.");
      return 3;
    }
    if (prod && (action === "plan" || action === "deploy")) {
      const probs = productionProblems(t, { base: io.base ?? readProdBase() });
      for (const p of probs) print(`${action === "deploy" ? "REFUSED" : "NOT READY"}: ${p}`);
      if (action === "deploy" && probs.length) { print("Nothing was sent to Cloudflare."); return 3; }
    }
    if (MUTATING.has(action) && !printOnly) {
      assertWranglerBundle(env);
      const why = accountEnvRefusal(env, argv, print);
      if (why) { print(why); return 3; }
    }
    // credentials from the shell reach wrangler only for read-only actions or after --account-confirmed
    // owner decision D-3: the tester gate policy (deploy/tester-gate.json; tools/lib/tester-policy.mjs). Read ONLY for plan and deploy
    // (review finding F4): a malformed policy file must never block the kill switch (off / on), a rollback or a read-only action.
    // A policy that cannot be read refuses plan and deploy (fail closed). rollback is not policy-checked (docs/DEPLOY.md §5).
    if (action === "plan" || action === "deploy") {
      let policy;
      try { policy = io.policy || readTesterPolicy(io.policyFile); } catch (e) {
        print(`REFUSED: the tester gate policy deploy/tester-gate.json cannot be read (${String(/** @type {Error} */ (e).message || e).slice(0, 160)}). Fix the file (docs/DEPLOY.md "Tester gate policy (D-3)"). Nothing was changed.`);
        return 3;
      }
      const tv = testerVerdict(policy, workerTesterProblems(t.vars));
      print(`Tester gate (D-3) policy: enforce ${tv.enforce ? "on" : "off"} · ${tv.problems.length ? tv.problems.length + " problem(s)" : "ok"} (deploy/tester-gate.json)`);
      if (action === "deploy" && tv.refuse) { for (const p of tv.problems) print("REFUSED: " + p + ". Nothing was changed."); return 3; }
      for (const p of tv.problems) print("WARNING: " + p);
    }
    return act(action, { argv, words, print, env, printOnly, t, tomlPath, creds: !MUTATING.has(action) || argv.includes("--account-confirmed") });
  } catch (e) { if (e instanceof GuardError) { print(e.message); return 3; } throw e; }
}

function act(action, { words, print, env, printOnly, t, tomlPath, creds }) {
  const E = t.env || ENV, prodFlag = E === "production" ? " -- --env production --confirm-production" : "";
  const base = { print, printOnly, env, cfg: t, creds };
  const run = (args, extra = {}) => wrangler(args, { ...base, target: extra.target || `Worker "${t.worker}"`, ...extra });
  const C = commands(t, { version: words[1] });
  /** the database id in wrangler.toml must be the database named lensiq-test (read-only check) */
  const d1Ok = () => {
    if (printOnly) return true;
    const why = verifyD1(t, base);
    if (why) print(`REFUSED: ${why}. Nothing was changed.`);
    return !why;
  };
  /** a secret is only written to a Worker that is already deployed (never a draft Worker) */
  const deployedOk = () => {
    if (printOnly) return true;
    print(`CHECK    Worker "${t.worker}" must already be deployed (read-only: wrangler deployments list)`);
    if (workerDeployed(t, base)) return true;
    print(`REFUSED: Worker "${t.worker}" is not deployed (or wrangler is not logged in). A secret is never written to a Worker that does not exist. Nothing was changed.`);
    return false;
  };

  if (action === "plan") {
    print("Order of the deploy (nothing is run by \"plan\"):");
    for (const a of ["d1:create", "migrate", "deploy"]) {
      const script = a === "deploy" ? (E === "production" ? "deploy:prod -- --confirm-production" : "deploy:test") : a + prodFlag;
      for (const args of C[a]) print(`  npm run backend:${script}   ->  (cd backend && npx wrangler ${args.join(" ")})`);
    }
    const secretsCmd = `npm run secrets:setup${E === "production" ? " -- --env production" : ""}`;
    print(`  ${secretsCmd}        ->  owner, own terminal: wrangler secret put <NAME> --env ${E} (value on stdin; resolves to Worker "${t.worker}")`);
    if (E === "test") print("  npm run ai:deploy-defaults   ->  wrangler d1 execute " + t.d1 + " --remote --env test (all-OFF AI settings)");
    print(`  npm run backend:off | on${prodFlag}     ->  kill switch: wrangler secret put SERVICE_OFF --env ${E}`);
    return 0;
  }
  if (action === "whoami") return run(C.whoami[0], { target: "none (read-only): the account wrangler is logged in to" }).status;
  if (action === "dry-run") {
    // the bundle includes the admin shell (assets directory): build it first, as the real deploy does
    if (!printOnly && spawnSync(process.execPath, ["scripts/build-admin.mjs"], { cwd: BACKEND, stdio: "inherit" }).status !== 0) { print("FAILED: admin shell build"); return 1; }
    const dir = mkdtempSync(join(tmpdir(), "lensiq-dry-"));
    try { return run(commands(t, { outdir: dir })["dry-run"][0], { target: `none (dry run: bundle only, no account access) for Worker "${t.worker}"` }).status; }
    finally { rmSync(dir, { recursive: true, force: true }); }
  }
  if (action === "d1:create" || action === "d1:bind") {
    if (t.d1Id !== D1_PLACEHOLDER) { print(`wrangler.toml already has the id of "${t.d1}": nothing to do.`); return 0; }
    const r = run(C[action][0],
      { target: action === "d1:create" ? `D1 database "${t.d1}" (CREATE, new; uses 1 of the account's 10 free databases)` : `none (read-only list) to find D1 "${t.d1}"`, capture: true });
    if (printOnly) return 0;
    const id = r.status === 0 ? parseDatabaseId(r.stdout, t.d1) : "";
    if (!id) {
      print(`FAILED (exit ${r.status}): no database id for "${t.d1}" in wrangler's answer.${action === "d1:create" ? ' If it already exists run "npm run backend:d1:bind".' : ""}`);
      return 1;
    }
    writeFileSync(tomlPath, fillDatabaseId(readFileSync(tomlPath, "utf8"), id, E));
    print(`D1 "${t.d1}" id ${id} written to backend/${CONFIG[E]} [env.${E}] (not a secret).`);
    return 0;
  }
  if (action === "migrate") return d1Ok() ? run(C.migrate[0], { target: `D1 database "${t.d1}" (apply migrations)` }).status : 3;
  if (action === "deploy") {
    if (!d1Ok()) return 3;
    if (!printOnly) {
      const b = spawnSync(process.execPath, ["scripts/build-admin.mjs"], { cwd: BACKEND, stdio: "inherit" });
      if (b.status !== 0) { print("FAILED: admin shell build"); return 1; }
    }
    return run(C.deploy[0], { target: `Worker "${t.worker}" (deploy a new version) + D1 binding "${t.d1}"` }).status;
  }
  if (action === "off" || action === "on") {
    if (!deployedOk()) return 3;
    const r = run(C[action][0], { input: action === "off" ? "1" : "0", target: `Worker "${t.worker}" secret SERVICE_OFF = ${action === "off" ? "1 (everything OFF)" : "0 (service ON)"}` });
    const done = action === "off" ? "Kill switch ON: every public route now answers 503 (pages fall back to on-device results)." : "Kill switch OFF: the service answers again.";
    if (r.status === 0 && !printOnly) print(done);
    return r.status;
  }
  if (action === "bootstrap:close" || action === "tester:revoke") {
    if (!deployedOk()) return 3;
    const name = C[action][0][2];
    // a random value that is never printed or kept: nobody can present it, so the secret is closed without a delete prompt
    const r = run(C[action][0], { input: randomBytes(48).toString("base64url"), capture: true, target: `Worker "${t.worker}" secret ${name} = a random value nobody knows (closed)` });
    if (!printOnly) print(r.status === 0 ? `${name}: closed.` : `${name}: FAILED (exit ${r.status})`);
    return r.status;
  }
  if (action === "rollback") {
    const v = words[1] || "";
    if (!/^[0-9a-f-]{36}$/.test(v)) { print('usage: npm run backend:rollback -- <VERSION_ID>   (ids: "npm run backend:versions")'); return 2; }
    return run(C.rollback[0], { target: `Worker "${t.worker}" (roll back to version ${v}; D1 data and secrets are NOT rolled back)` }).status;
  }
  let st = 0;
  for (const args of C[action]) st = run(args, { target: `none (read-only) · ${args[0] === "d1" ? "D1 databases of the account" : `Worker "${t.worker}"`}` }).status || st;
  return st;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(main(process.argv.slice(2)));
