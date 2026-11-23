"use strict";
// tests/unit/prod-tooling.test.js — production tooling A1-A6 (SELL-READY 2026-11-23 decision 11 ก, owner inbox entry 17:
// preparation only; docs/PRODUCTION-MOVE-PLAN.md §5). LOCKED before the code (evals-locks/prod-tooling.sha256).
// Nothing here can reach Cloudflare: a FAKE wrangler stands in (LQ_WRANGLER_BIN, honoured only with NODE_ENV=test), the
// smoke check runs against the Worker in-process, and no real secret exists in these tests (canary strings only).
// RE-LOCK 2 (design change, see evals-locks/prod-tooling.sha256): production lives in its own file
// backend/wrangler.production.toml (every production command carries --config wrangler.production.toml), and the Pages
// upload runs from the owner's machine, because three existing locked tests forbid a second PUBLIC_ROUTES / TRYON in
// wrangler.toml and any Cloudflare credential in a workflow.
//   T1  backend/wrangler.production.toml [env.production]: names, every var, production values; backend/wrangler.toml
//       (template + [env.test]) carries nothing of production and is read exactly as before
//   T2  name guard: production accepts only its own lensiq-prod names; refuses test / staging / other projects' names
//   T3  effective target of every production argument list (secret commands get --env production only)
//   T4  tools/backend-deploy.mjs --env production: unknown env, owner confirmation, npm script name, CI, deploy readiness
//   T5  tools/secrets-setup.mjs --env production: target, OPENROUTER_API_KEY "later" (owner item 233), argument lists
//   T6  tools/backend-smoke.mjs --profile production: approved host only, every AI / lookup route off, CORS for the site
//   T7  tools/build-prod-site.mjs: base check, address rewrite, canonical on every page, _headers, 25 MiB limit, root path
//   T8  .github/workflows/deploy-prod.yml: manual, build + verify only, no Cloudflare credential (locked rule of
//       deploy-tools.test.js); tools/pages-deploy-guard.mjs: the local deploy, origin/main + CI green + exact project only
//   T9  tools/build-redirect-site.mjs: one stub per page, same path, query and #hash kept, 404 fallback, sw unregisters
//   T10 the GitHub Pages output of today's site is unchanged (pure copy + the test-site config; no production file)
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, truncateSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { PassThrough } = require("node:stream");
const vm = require("node:vm");
const { createEnv } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const TOML_LIVE = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
const TOML_PROD = readFileSync(join(ROOT, "backend", "wrangler.production.toml"), "utf8");
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const MY_D1 = "11111111-2222-4333-8444-555555555555";
const OTHER_D1 = "99999999-0000-4000-8000-000000000001";
const DOMAIN = "www.lensiq.example", SITE = "https://" + DOMAIN, API_HOST = "api.lensiq.example", API = "https://" + API_HOST;
const OTHERS = ["dearday-staging", "aidanex-staging", "aidanex-pet-clinic-pilot", "faksak.com", "tripsdna.com", "aidanex-sales-staging", "kaguwood-store", "aidanex-pet-clinic"];
const CANARY = "CANARY-pages-token-77f3c1";
const sha = b => createHash("sha256").update(b).digest("hex");
const guard = () => import(join(ROOT, "tools", "lib", "cf-guard.mjs"));
const tmp = p => mkdtempSync(join(tmpdir(), p));

/** text of one TOML table body (header line excluded) up to the next table header */
function tableBody(toml, header) {
  const lines = toml.split("\n"), at = lines.findIndex(l => l.trim() === header);
  if (at < 0) return null;
  const out = [];
  for (let i = at + 1; i < lines.length && !/^\s*\[/.test(lines[i]); i++) out.push(lines[i]);
  return out.join("\n");
}
/** toml with one [env.production.vars] value replaced (the line must exist) */
function setProdVar(toml, key, value) {
  const lines = toml.split("\n"), at = lines.findIndex(l => l.trim() === "[env.production.vars]");
  assert.ok(at >= 0, "[env.production.vars] exists");
  for (let i = at + 1; i < lines.length && !/^\s*\[/.test(lines[i]); i++) {
    if (new RegExp(`^${key}\\s*=`).test(lines[i])) { lines[i] = `${key} = ${JSON.stringify(value)}`; return lines.join("\n"); }
  }
  throw new Error("no " + key + " in [env.production.vars]");
}
/** the committed file with the domain decided (example domain) and the production D1 created (fake id) */
async function prodReady(toml = TOML_PROD) {
  const G = await guard();
  let t = G.fillDatabaseId(toml, MY_D1, "production");
  t = setProdVar(t, "ALLOWED_ORIGINS", SITE);
  t = setProdVar(t, "TURNSTILE_HOSTNAMES", DOMAIN);
  t = setProdVar(t, "SITE_URL", SITE);
  t = setProdVar(t, "LINE_LOGIN_REDIRECT_URI", SITE + "/account.html");
  return t;
}

/** A fake wrangler: logs {argv, effective, sawToken} to $LQ_FAKE_LOG; resolves names as the real one does; never prints
 *  a credential. `d1 list` knows "lensiq-prod" = MY_D1 and "lensiq-test" = OTHER_D1. */
function fakeWrangler(dir) {
  const bin = join(dir, "fake-wrangler.js");
  writeFileSync(bin, `
const fs = require("fs");
const argv = process.argv.slice(2);
const flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const name = flag("--name"), env = flag("--env");
const cfg = env === "test" ? "lensiq-api-test" : env === "production" ? "lensiq-prod-api" : "lensiq-api";
const legacy = argv[0] === "secret" || argv[0] === "tail";
const effective = argv[0] === "d1" || argv[0] === "whoami" || argv[0] === "pages" ? null : legacy ? (name && env ? name + "-" + env : name || cfg) : name || cfg;
let input = "";
const done = () => {
  fs.appendFileSync(process.env.LQ_FAKE_LOG, JSON.stringify({ argv, effective, sawToken: !!process.env.CLOUDFLARE_API_TOKEN, sawAccount: !!process.env.CLOUDFLARE_ACCOUNT_ID,
    stdinLen: input.length }) + "\\n");
  if (argv[0] === "deployments") { console.log(JSON.stringify([{ id: "dep-1" }])); process.exit(0); }
  if (argv[0] === "d1" && argv[1] === "create") { console.log('{ "d1_databases": [ { "binding": "DB", "database_name": "' + argv[2] + '", "database_id": "${MY_D1}" } ] }'); process.exit(0); }
  if (argv[0] === "d1" && argv[1] === "list") { console.log(" banner"); console.log(JSON.stringify([{ uuid: "${OTHER_D1}", name: "lensiq-test" }, { uuid: "${MY_D1}", name: "lensiq-prod" }])); process.exit(0); }
  process.exit(0);
};
if (argv[0] === "secret" && argv[1] === "put") { process.stdin.on("data", d => { input += d; }); process.stdin.on("end", done); } else done();
`);
  return bin;
}
function sandbox(extra = {}) {
  const dir = tmp("lq-prod-test-");
  const log = join(dir, "calls.jsonl");
  writeFileSync(log, "");
  const env = { PATH: process.env.PATH, NODE_ENV: "test", LQ_WRANGLER_BIN: fakeWrangler(dir), LQ_FAKE_LOG: log, ...extra };
  const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  return { dir, env, log, calls, done: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---- T1: [env.production] in backend/wrangler.toml -------------------------------------------------------------------

test("T1 wrangler.production.toml [env.production]: lensiq-prod names, every var, production values; wrangler.toml has no production", async () => {
  const G = await guard();
  const p = G.readTargets(TOML_PROD, "production");
  assert.deepEqual(G.readTargets(undefined, "production"), p, "the default production reading is wrangler.production.toml");
  assert.deepEqual({ ...G.CONFIG }, { test: "wrangler.toml", production: "wrangler.production.toml" });
  assert.deepEqual(G.configArgs("production"), ["--config", "wrangler.production.toml"]);
  assert.deepEqual(G.configArgs("test"), []);
  assert.equal(G.tomlFor("production"), join(ROOT, "backend", "wrangler.production.toml"));
  assert.equal(G.tomlFor("test"), join(ROOT, "backend", "wrangler.toml"));
  // wrangler.toml (the live test deployment) carries nothing of production
  assert.doesNotMatch(TOML_LIVE, /\[env\.production|lensiq-prod/);
  assert.equal(G.readTargets(TOML_LIVE, "production").worker, "", "no [env.production] in wrangler.toml");
  // the production file runs the same code with the same compatibility settings, and its top-level name is refused
  const top = (toml, k) => (new RegExp(`^${k} = (.*)$`, "m").exec(toml.split(/^\[/m)[0]) || [])[1];
  for (const k of ["main", "compatibility_date", "compatibility_flags"]) assert.equal(top(TOML_PROD, k), top(TOML_LIVE, k), k);
  assert.throws(() => G.assertTarget("worker", G.readTargets(TOML_PROD, "production").topName, "production"), G.GuardError);
  assert.match(TOML_PROD, /^\[assets\]\ndirectory = "\.\/admin-dist"\nbinding = "ASSETS"\nrun_worker_first = true$/m, "the admin shell is served as on test");
  assert.deepEqual([p.env, p.worker, p.d1, p.d1Binding], ["production", "lensiq-prod-api", "lensiq-prod", "DB"]);
  assert.deepEqual({ ...G.ENVS.production }, { worker: "lensiq-prod-api", d1: "lensiq-prod" });
  assert.deepEqual({ ...G.ENVS.test }, { worker: "lensiq-api-test", d1: "lensiq-test" });
  const recFile = join(ROOT, "deploy", "created.prod.json");
  const rec = existsSync(recFile) ? JSON.parse(readFileSync(recFile, "utf8")) : null;
  assert.ok(p.d1Id === PLACEHOLDER || (rec && rec.d1 && p.d1Id === rec.d1.id),
    "[env.production] database_id is the placeholder or exactly the id recorded in deploy/created.prod.json");
  if (rec) {
    assert.deepEqual([rec.environment, rec.worker.name, rec.d1.name], ["production", "lensiq-prod-api", "lensiq-prod"]);
    assert.doesNotMatch(JSON.stringify(rec), /sk-[A-Za-z0-9]|secret"\s*:|token"\s*:|password|api_key/i, "no secret in the record");
  }
  assert.equal(p.workersDev, false, "no workers.dev hostname for production (only the approved custom domain)");
  assert.equal(p.previewUrls, false);
  assert.match(tableBody(TOML_PROD, "[env.production]"), /^workers_dev = false$/m);
  assert.match(tableBody(TOML_PROD, "[env.production]"), /^preview_urls = false$/m);
  assert.deepEqual(p.crons, ["17 3 * * *"], "one cron (the Free plan has 5 per account, shared)");
  assert.deepEqual([p.observability.enabled, p.observability.head_sampling_rate], ["true", "0.5"]);
  const t = G.readTargets(TOML_LIVE, "test");
  assert.deepEqual(G.readTargets(TOML_LIVE), t, "the default reading is still [env.test]");
  assert.deepEqual([t.env, t.worker, t.d1], ["test", "lensiq-api-test", "lensiq-test"]);
  assert.deepEqual(Object.keys(t.topVars).filter(k => !(k in p.vars)), [], "vars are not inherited: every wrangler.toml [vars] key is in production");
  assert.deepEqual(Object.keys(t.vars).filter(k => !(k in p.vars)), [], "every [env.test.vars] key is repeated in production");
  assert.deepEqual(Object.keys(p.vars).filter(k => !(k in t.vars)), [], "no production-only var");
  const EXPECT = {
    FREE_MODE: "true", BILLING_ENABLED: "false", ALLOW_GUEST_CHECKOUT: "false", OPN_ALLOW_LIVE: "false", VAT_REGISTERED: "false", GO_LIVE_GATE: "enforce",
    LEGAL_TERMS_READY: "false", LEGAL_PRIVACY_READY: "false", REQUIRE_OWNER_TOTP: "true", MONEY_REAUTH: "", TESTER_GATE: "required", AI_ROUTE_PIN: "required",
    PC_BUILD: "customer", PC_THFDA_MODE: "link", LEAD_NOTIFY_HEALTH: "off", SELLER_DOC_LANG: "off", MERIT_INTEREST_FORM: "off", ORG_ACCOUNTS: "off", TRYON: "off",
    MAIL_PROVIDER: "", MAIL_FROM: "", GOOGLE_CLIENT_ID: "", ANALYTICS_FEATURES: "", ADMIN_ORIGINS: "", SELLER_NAME: "", SELLER_TAX_ID: "", SELLER_ADDRESS: "",
    DAILY_REQUEST_CAP: "20000", D1_WRITE_BUDGET: "5000", ADMIN_UNAUTH_WRITES_HOUR: "120", LEADS_DAYS: "180", LEADS_GLOBAL_DAY: "50", LEAD_NOTIFY_LINE_DAY: "50",
    PUBLIC_ROUTES: "/health,/health/deep,/v1/config,/v1/leads,/v1/tester/check"
  };
  for (const [k, v] of Object.entries(EXPECT)) assert.equal(p.vars[k], v, `[env.production.vars] ${k}`);
  // the domain-dependent values: empty until the owner decides the domain (items 8 / 9), never a test or third-party origin
  for (const k of ["ALLOWED_ORIGINS", "TURNSTILE_HOSTNAMES", "SITE_URL", "LINE_LOGIN_REDIRECT_URI"]) {
    assert.doesNotMatch(p.vars[k], /github\.io|workers\.dev|pages\.dev|localhost|127\.0\.0\.1|faksak|tripsdna|dearday|aidanex/, k);
  }
  assert.ok(!p.vars.ALLOWED_ORIGINS.includes(","), "one origin only (the apex redirects to www)");
  assert.deepEqual(Object.keys(p.vars).filter(k => /SECRET|TOKEN|PASSWORD|_KEY$/.test(k)), [], "no secret is ever a var");
  assert.doesNotMatch(TOML_LIVE, /^\s*AI_EVAL_LOCAL\s*=/m);
  assert.doesNotMatch(TOML_PROD, /^\s*AI_EVAL_LOCAL\s*=/m);
  assert.doesNotMatch(TOML_PROD, /^\s*(TURNSTILE_DISABLED_FOR_LOCAL_DEV|SERVICE_OFF)\s*=/m);
  // [env.test] text is byte-identical to the template it had before production was added
  assert.equal(tableBody(TOML_LIVE, "[env.test.vars]").includes("PC_BUILD = \"demo\""), true);
});

// ---- T2: the name guard ----------------------------------------------------------------------------------------------

test("T2 name guard: production accepts only lensiq-prod-api / lensiq-prod; test and other projects are refused both ways", async () => {
  const G = await guard();
  assert.equal(G.assertTarget("worker", "lensiq-prod-api", "production"), "lensiq-prod-api");
  assert.equal(G.assertTarget("d1", "lensiq-prod", "production"), "lensiq-prod");
  for (const n of ["lensiq-api-test", "lensiq-test", "lensiq-api", "lensiq", "lensiq-prod-api-test", "lensiq-prod-test", "lensiq-staging", "lensiq-prod-staging",
    "lensiq-prod-dev", "lensiq-prod-preview", "lensiq-prod-other", "lensiq-production", "LENSIQ-PROD-API", "lensiq-prod-api ", "", null, undefined, ...OTHERS]) {
    assert.throws(() => G.assertTarget("worker", n, "production"), G.GuardError, "worker " + String(n));
  }
  for (const n of ["lensiq-test", "lensiq-prod-db", "lensiq-prod-test", "lensiq-prod-api", "lensiq", ...OTHERS]) {
    assert.throws(() => G.assertTarget("d1", n, "production"), G.GuardError, "d1 " + n);
  }
  // the production name rule itself
  for (const n of ["lensiq-prod", "lensiq-prod-api", "lensiq-prod-site"]) assert.equal(G.isProdName(n), true, n);
  for (const n of ["lensiq-prod-test", "lensiq-prod-api-test", "lensiq-prod-staging", "lensiq-prod-site-preview", "lensiq-prod-dev", "lensiq-api-test", "lensiq-test",
    "lensiq-prodx", "lensiq-production", "Lensiq-prod", "lensiq-prod-", "x-lensiq-prod", "lensiq-prod--x", "dearday-staging", "", null]) assert.equal(G.isProdName(n), false, String(n));
  // the test environment never accepts a production name, and its own names still pass
  assert.equal(G.assertTarget("worker", "lensiq-api-test"), "lensiq-api-test");
  assert.equal(G.assertTarget("d1", "lensiq-test", "test"), "lensiq-test");
  for (const env of [undefined, "test"]) {
    assert.throws(() => G.assertTarget("worker", "lensiq-prod-api", env), G.GuardError);
    assert.throws(() => G.assertTarget("d1", "lensiq-prod", env), G.GuardError);
  }
  for (const env of ["staging", "prod", "Production", "", "production "]) assert.throws(() => G.assertTarget("worker", "lensiq-prod-api", env), G.GuardError, "env " + env);
  assert.throws(() => G.allowedFor("staging"), G.GuardError);
  assert.deepEqual({ ...G.allowedFor("production") }, { worker: "lensiq-prod-api", d1: "lensiq-prod" });
  assert.deepEqual({ ...G.ALLOWED }, { worker: "lensiq-api-test", d1: "lensiq-test" }, "the test constant is unchanged");
});

// ---- T3: effective target in production ------------------------------------------------------------------------------

test("T3 effective target: production argument lists resolve to lensiq-prod-api / lensiq-prod only", async () => {
  const G = await guard();
  const p = G.readTargets(TOML_PROD, "production"), t = G.readTargets(TOML_LIVE);
  const PC = ["--config", "wrangler.production.toml"];
  assert.equal(G.assertEffective(["deploy", ...PC, "--env", "production", "--name", "lensiq-prod-api"], p).name, "lensiq-prod-api");
  assert.equal(G.assertEffective(["deploy", "-c", "wrangler.production.toml", "--env", "production", "--name", "lensiq-prod-api"], p).name, "lensiq-prod-api");
  assert.equal(G.assertEffective(["secret", "put", "X", ...PC, "--env", "production"], p).name, "lensiq-prod-api");
  assert.equal(G.assertEffective(["secret", "list", ...PC, "--env", "production", "--format", "json"], p).name, "lensiq-prod-api");
  assert.equal(G.assertEffective(["d1", "migrations", "apply", "lensiq-prod", "--remote", ...PC, "--env", "production"], p).name, "lensiq-prod");
  assert.equal(G.assertEffective(["d1", "create", "lensiq-prod"], p).name, "lensiq-prod");
  assert.equal(G.assertEffective(["rollback", MY_D1, ...PC, "--env", "production", "--name", "lensiq-prod-api", "--message", "m"], p).name, "lensiq-prod-api");
  assert.equal(G.effectiveTarget(["secret", "put", "X", ...PC, "--env", "production", "--name", "lensiq-prod-api"], p).name, "lensiq-prod-api-production",
    "wrangler's legacy rule: --name with --env on a secret command names another Worker");
  for (const args of [["secret", "put", "X", ...PC, "--env", "production", "--name", "lensiq-prod-api"], ["secret", "put", "X"], ["secret", "put", "X", ...PC, "--env", "test"],
    ["deploy"], ["deploy", ...PC, "--env", "test", "--name", "lensiq-api-test"], ["deploy", ...PC, "--env", "production", "--name", "lensiq-api-test"],
    ["deploy", ...PC, "--env", "production", "--name", "dearday-staging"], ["d1", "migrations", "apply", "lensiq-test", "--remote", ...PC, "--env", "production"],
    ["d1", "migrations", "apply", "lensiq-prod", "--remote", ...PC], ["d1", "migrations", "apply", "lensiq-prod", "--remote", ...PC, "--env", "test"],
    ["d1", "execute", "lensiq-prod", "--remote", ...PC, "--env", "test"], ["d1", "create", "lensiq-test"], ["d1", "delete", "lensiq-prod"], ["pages", "deploy", "_site"],
    ["delete", ...PC, "--env", "production"], ["kv", "namespace", "create", "x"],
    // without the production file wrangler would read wrangler.toml, which has no [env.production]
    ["deploy", "--env", "production", "--name", "lensiq-prod-api"], ["secret", "put", "X", "--env", "production"], ["rollback", MY_D1, "--env", "production", "--name", "lensiq-prod-api"],
    ["deploy", "--config", "wrangler.toml", "--env", "production", "--name", "lensiq-prod-api"], ["secret", "put", "X", "--config", "other.toml", "--env", "production"],
    ["d1", "migrations", "apply", "lensiq-prod", "--remote", "--env", "production"], ["d1", "migrations", "apply", "lensiq-prod", "--remote", "--config", "wrangler.toml", "--env", "production"]
  ]) assert.throws(() => G.assertEffective(args, p), G.GuardError, "production cfg: " + args.join(" "));
  for (const args of [["deploy", ...PC, "--env", "production", "--name", "lensiq-prod-api"], ["secret", "put", "X", ...PC, "--env", "production"], ["d1", "create", "lensiq-prod"],
    ["d1", "migrations", "apply", "lensiq-prod", "--remote", ...PC, "--env", "production"], ["deploy", ...PC, "--env", "test", "--name", "lensiq-api-test"],
    ["secret", "put", "X", ...PC, "--env", "test"], ["d1", "migrations", "apply", "lensiq-test", "--remote", ...PC, "--env", "test"]
  ]) assert.throws(() => G.assertEffective(args, t), G.GuardError, "test cfg: " + args.join(" "));
  assert.equal(G.assertEffective(["deploy", "--config", "wrangler.toml", "--env", "test", "--name", "lensiq-api-test"], t).name, "lensiq-api-test", "test: its own file named");
  assert.deepEqual(G.deployedArgs(p), ["deployments", "list", ...PC, "--env", "production", "--name", "lensiq-prod-api", "--json"]);
  assert.deepEqual(G.deployedArgs(t), ["deployments", "list", "--env", "test", "--name", "lensiq-api-test", "--json"], "test unchanged");
  // the D1 id is written into the production table only
  const out = G.fillDatabaseId(TOML_PROD, MY_D1, "production");
  assert.equal(G.readTargets(out, "production").d1Id, MY_D1);
  const diff = out.split("\n").filter((l, i) => l !== TOML_PROD.split("\n")[i]);
  assert.deepEqual(diff, [`database_id = "${MY_D1}"`], "exactly one line changes");
  assert.throws(() => G.fillDatabaseId(TOML_PROD, MY_D1, "staging"));
  assert.throws(() => G.fillDatabaseId(TOML_LIVE, MY_D1, "production"), Error, "wrangler.toml has no production table");
  // API hosts: production has no workers.dev host; only an approved custom hostname
  assert.equal(G.isOwnApiHost("lensiq-prod-api.my-sub.workers.dev", [], "production"), false);
  assert.equal(G.isOwnApiHost("lensiq-api-test.my-sub.workers.dev", [], "production"), false);
  assert.equal(G.isOwnApiHost(API_HOST, [API_HOST], "production"), true);
  assert.equal(G.isOwnApiHost(API_HOST, [], "production"), false);
  assert.equal(G.isOwnApiHost("lensiq-api-test.my-sub.workers.dev", []), true, "test unchanged");
});

// ---- T4: backend-deploy --env production -----------------------------------------------------------------------------

test("T4 backend-deploy --env production: confirmation, script name, CI and readiness refuse before wrangler; commands name production only", async () => {
  const D = await import(join(ROOT, "tools", "backend-deploy.mjs"));
  const G = await guard();
  const READY = await prodReady();
  const run = (argv, io = {}) => { const out = []; const code = D.main(argv, { print: s => out.push(s), policy: { enforce: true }, ...io }); return { code, out: out.join("\n") }; };
  // test commands are unchanged
  const tc = D.commands(G.readTargets(TOML_LIVE));
  assert.deepEqual(tc.deploy[0], ["deploy", "--env", "test", "--name", "lensiq-api-test"]);
  assert.deepEqual(tc.off[0], ["secret", "put", "SERVICE_OFF", "--env", "test"]);
  const pc = D.commands(G.readTargets(READY, "production"));
  assert.deepEqual(pc.deploy[0], ["deploy", "--config", "wrangler.production.toml", "--env", "production", "--name", "lensiq-prod-api"]);
  assert.deepEqual(pc.migrate[0], ["d1", "migrations", "apply", "lensiq-prod", "--remote", "--config", "wrangler.production.toml", "--env", "production"]);
  assert.deepEqual(pc.off[0], ["secret", "put", "SERVICE_OFF", "--config", "wrangler.production.toml", "--env", "production"]);
  assert.deepEqual(pc["bootstrap:close"][0], ["secret", "put", "ADMIN_BOOTSTRAP_TOKEN", "--config", "wrangler.production.toml", "--env", "production"]);
  assert.deepEqual(pc["d1:create"][0], ["d1", "create", "lensiq-prod"]);
  // readiness of the production config for a deploy
  assert.deepEqual(D.productionProblems(G.readTargets(READY, "production")), []);
  const committed = D.productionProblems(G.readTargets(TOML_PROD, "production"));
  assert.ok(committed.some(p => /ALLOWED_ORIGINS/.test(p)) && committed.some(p => /TURNSTILE_HOSTNAMES/.test(p)) && committed.some(p => /SITE_URL/.test(p)), committed.join("\n"));
  const bad = async (k, v, re) => {
    const probs = D.productionProblems(G.readTargets(setProdVar(READY, k, v), "production"));
    assert.ok(probs.some(p => re.test(p)), `${k}=${v}: ${probs.join(" | ")}`);
  };
  await bad("ALLOWED_ORIGINS", "https://anirut77.github.io", /ALLOWED_ORIGINS/);
  await bad("ALLOWED_ORIGINS", "https://lensiq-prod-site.pages.dev", /ALLOWED_ORIGINS/);
  await bad("ALLOWED_ORIGINS", SITE + ",http://localhost:8080", /ALLOWED_ORIGINS/);
  await bad("ALLOWED_ORIGINS", SITE + "/", /ALLOWED_ORIGINS/);
  await bad("TURNSTILE_HOSTNAMES", "anirut77.github.io", /TURNSTILE_HOSTNAMES/);
  await bad("SITE_URL", SITE + "/lensiq", /SITE_URL/);
  await bad("SITE_URL", "https://other.example", /SITE_URL/);
  await bad("LINE_LOGIN_REDIRECT_URI", "https://anirut77.github.io/lensiq/account.html", /LINE_LOGIN_REDIRECT_URI/);
  await bad("PUBLIC_ROUTES", "/health,/v1/leads,/api/pc/*", /PUBLIC_ROUTES/);
  await bad("PUBLIC_ROUTES", "/health,/v1/leads,/v1/ai/*", /PUBLIC_ROUTES/);
  await bad("PUBLIC_ROUTES", "", /PUBLIC_ROUTES/);
  await bad("PC_BUILD", "demo", /PC_BUILD/);
  await bad("PC_THFDA_MODE", "live", /PC_THFDA_MODE/);
  await bad("BILLING_ENABLED", "true", /BILLING_ENABLED/);
  await bad("OPN_ALLOW_LIVE", "true", /OPN_ALLOW_LIVE/);
  await bad("TESTER_GATE", "", /TESTER_GATE/);
  const wd = D.productionProblems({ ...G.readTargets(READY, "production"), workersDev: true });
  assert.ok(wd.some(p => /workers_dev/.test(p)));

  const sb = sandbox();
  try {
    // plan: production targets printed, nothing started
    let r = run(["plan", "--env", "production"], { env: sb.env, toml: TOML_PROD });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /environment "production"/);
    assert.match(r.out, /Worker "lensiq-prod-api"/);
    assert.match(r.out, /D1 database "lensiq-prod"/);
    assert.match(r.out, /--env production/);
    assert.match(r.out, /ALLOWED_ORIGINS/, "plan lists what is not ready yet");
    assert.doesNotMatch(r.out, /lensiq-api-test|lensiq-test\b/);
    // the default is still the test environment
    r = run(["plan"], { env: sb.env, toml: TOML_LIVE });
    assert.equal(r.code, 0);
    assert.match(r.out, /environment "test"/);
    assert.match(r.out, /Worker "lensiq-api-test"/);
    // unknown environment / missing value
    for (const argv of [["plan", "--env", "staging"], ["deploy", "--env"], ["deploy", "--env", "prod"], ["deploy", "--env=Production"]]) {
      assert.equal(run(argv, { env: sb.env, toml: READY }).code, 2, argv.join(" "));
    }
    assert.equal(run(["plan", "--env=production"], { env: sb.env, toml: READY }).code, 0, "--env=production form");
    // a mutating production action needs the owner's explicit --confirm-production
    for (const a of ["deploy", "migrate", "d1:create", "off", "on", "bootstrap:close", "tester:revoke"]) {
      r = run([a, "--env", "production"], { env: sb.env, toml: READY });
      assert.equal(r.code, 3, a + ": " + r.out);
      assert.match(r.out, /--confirm-production/);
    }
    // refused when started through an npm script named for the test environment
    r = run(["deploy", "--env", "production", "--confirm-production"], { env: { ...sb.env, npm_lifecycle_event: "backend:deploy:test" }, toml: READY });
    assert.equal(r.code, 3, r.out);
    // CI never deploys production
    r = run(["deploy", "--env", "production", "--confirm-production"], { env: { ...sb.env, CI: "true" }, toml: READY });
    assert.equal(r.code, 3);
    // the committed config (no domain, no D1 yet) refuses the deploy, also as print-only
    for (const extra of [[], ["--print-only"]]) {
      r = run(["deploy", "--env", "production", "--confirm-production", ...extra], { env: sb.env, toml: TOML_PROD });
      assert.equal(r.code, 3, r.out);
      assert.match(r.out, /ALLOWED_ORIGINS/);
    }
    assert.deepEqual(sb.calls(), [], "nothing was started by any refusal");
    // print-only on a ready config: the exact command, nothing started
    r = run(["deploy", "--env", "production", "--confirm-production", "--print-only"], { env: sb.env, toml: READY });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /npx wrangler deploy --config wrangler\.production\.toml --env production --name lensiq-prod-api\)/);
    assert.deepEqual(sb.calls(), []);
    // migrate (fake wrangler): read-only D1 check, then exactly the production migration
    r = run(["migrate", "--env", "production", "--confirm-production"], { env: sb.env, toml: READY });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(sb.calls().map(c => c.argv), [["d1", "list", "--json"], ["d1", "migrations", "apply", "lensiq-prod", "--remote", "--config", "wrangler.production.toml", "--env", "production"]]);
    // a production id that belongs to another database is refused
    const WRONG = G.fillDatabaseId(READY.replace(MY_D1, PLACEHOLDER), OTHER_D1, "production");
    writeFileSync(sb.log, "");
    r = run(["migrate", "--env", "production", "--confirm-production"], { env: sb.env, toml: WRONG });
    assert.equal(r.code, 3, r.out);
    assert.deepEqual(sb.calls().map(c => c.argv), [["d1", "list", "--json"]], "only the read-only check ran");
    // kill switch: secret commands with --env production only (never --name)
    writeFileSync(sb.log, "");
    r = run(["off", "--env", "production", "--confirm-production"], { env: sb.env, toml: READY });
    assert.equal(r.code, 0, r.out);
    const calls = sb.calls();
    assert.deepEqual(calls.map(c => c.argv), [["deployments", "list", "--config", "wrangler.production.toml", "--env", "production", "--name", "lensiq-prod-api", "--json"],
      ["secret", "put", "SERVICE_OFF", "--config", "wrangler.production.toml", "--env", "production"]]);
    assert.ok(calls.every(c => c.effective == null || c.effective === "lensiq-prod-api"), JSON.stringify(calls));
    // d1:create writes the id into the production table only
    const file = join(sb.dir, "wrangler.toml");
    writeFileSync(file, TOML_PROD);
    writeFileSync(sb.log, "");
    r = run(["d1:create", "--env", "production", "--confirm-production"], { env: sb.env, tomlPath: file });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(sb.calls().map(c => c.argv), [["d1", "create", "lensiq-prod"]]);
    const after = readFileSync(file, "utf8");
    assert.equal(G.readTargets(after, "production").d1Id, MY_D1);
    assert.deepEqual(after.split("\n").filter((l, i) => l !== TOML_PROD.split("\n")[i]), [`database_id = "${MY_D1}"`]);
    assert.equal(readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8"), TOML_LIVE, "the committed test configuration is never written");
    assert.equal(readFileSync(join(ROOT, "backend", "wrangler.production.toml"), "utf8"), TOML_PROD, "the committed production configuration is never written by a test");
    // no call of the whole test ever named a test resource
    assert.ok(!readFileSync(sb.log, "utf8").includes("lensiq-api-test"));
  } finally { sb.done(); }
  // npm scripts: a production script exists, and no test-named script passes --env production
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
  assert.equal(pkg["backend:deploy:prod"], "node tools/backend-deploy.mjs deploy --env production");
  for (const [k, v] of Object.entries(pkg)) if (/test/.test(k)) assert.doesNotMatch(v, /--env production/, k);
});

// ---- T5: secrets:setup --env production -------------------------------------------------------------------------------

test("T5 secrets:setup --env production: target lensiq-prod-api, --env production only, OPENROUTER_API_KEY later", async () => {
  const S = await import(join(ROOT, "tools", "secrets-setup.mjs"));
  assert.deepEqual(S.secretArgs.put("X"), ["secret", "put", "X", "--env", "test"], "test unchanged");
  assert.deepEqual(S.secretArgs.list(), ["secret", "list", "--env", "test", "--format", "json"]);
  assert.deepEqual(S.secretArgs.put("X", "production"), ["secret", "put", "X", "--config", "wrangler.production.toml", "--env", "production"]);
  assert.deepEqual(S.secretArgs.list("production"), ["secret", "list", "--config", "wrangler.production.toml", "--env", "production", "--format", "json"]);
  assert.deepEqual(S.REQUIRED_NOW, ["SECRETS_KEK", "ADMIN_BOOTSTRAP_TOKEN", "TURNSTILE_SECRET", "OPENROUTER_API_KEY", "TESTER_ACCESS_CODE"], "test list unchanged");
  assert.deepEqual(S.secretsFor("test"), S.SECRETS);
  const prod = S.secretsFor("production");
  assert.deepEqual(prod.map(s => s.name), S.SECRETS.map(s => s.name), "same names");
  assert.equal(prod.find(s => s.name === "OPENROUTER_API_KEY").when, "later", "no AI key at launch (owner item 233)");
  assert.deepEqual(S.requiredNow("production"), ["SECRETS_KEK", "ADMIN_BOOTSTRAP_TOKEN", "TURNSTILE_SECRET", "TESTER_ACCESS_CODE"]);
  assert.throws(() => S.secretsFor("staging"));
  const term = () => {
    const stdin = new PassThrough(); stdin.isTTY = true; stdin.setRawMode = () => {};
    let text = ""; const stdout = { isTTY: true, write: s => { text += String(s); return true; } };
    const proc = new EventEmitter(); proc.exit = () => {};
    return { stdin, stdout, proc, text: () => text };
  };
  const sb = sandbox();
  try {
    let io = term();
    let code = await S.main(["--env", "production", "--dry-run", "--list"], { ...io, env: sb.env, toml: TOML_PROD });
    assert.equal(code, 0, io.text());
    assert.match(io.text(), /environment "production"/);
    assert.match(io.text(), /TARGET\s+Worker "lensiq-prod-api"/);
    assert.match(io.text(), /OPENROUTER_API_KEY\s+later/);
    assert.doesNotMatch(io.text(), /lensiq-api-test/);
    io = term();
    code = await S.main(["--env", "staging", "--dry-run", "--list"], { ...io, env: sb.env, toml: TOML_LIVE });
    assert.equal(code, 2, io.text());
    io = term();
    code = await S.main(["--dry-run", "--list"], { ...io, env: sb.env, toml: TOML_LIVE });
    assert.equal(code, 0);
    assert.match(io.text(), /TARGET\s+Worker "lensiq-api-test"/, "default still test");
    assert.match(io.text(), /OPENROUTER_API_KEY\s+required now/);
    assert.deepEqual(sb.calls(), [], "dry run + list starts nothing");
  } finally { sb.done(); }
});

// ---- T6: smoke production profile -------------------------------------------------------------------------------------

test("T6 smoke --profile production: approved host only; AI, lookups, medicine, analytics, billing, sign-in off; form fails closed", async () => {
  const M = await import(join(ROOT, "tools", "backend-smoke.mjs"));
  const G = await guard();
  const { handle } = await import(join(ROOT, "backend", "src", "index.js"));
  const vars = G.readTargets(await prodReady(), "production").vars;
  const envOf = v => createEnv({ ...vars, TURNSTILE_SECRET: "ts", TESTER_ACCESS_CODE: "Mango-river-2026-quartz-1", ...v });
  const sent = [];
  const via = env => async (url, init = {}) => {
    sent.push({ url: String(url), method: init.method || "GET", headers: init.headers || {}, body: init.body || "" });
    const orig = console.log; console.log = () => {};
    try { return await handle(new Request(url, { method: init.method, headers: init.headers, body: init.body }), env); } finally { console.log = orig; }
  };
  assert.equal(M.checkBase("https://lensiq-prod-api.my-sub.workers.dev", [], "production"), null);
  assert.equal(M.checkBase("https://lensiq-api-test.my-sub.workers.dev", [], "production"), null);
  assert.equal(M.checkBase(API, [], "production"), null);
  assert.deepEqual(M.checkBase(API, [API_HOST], "production"), { origin: API, local: false });
  assert.ok(M.checkBase("http://localhost:8787", [], "production").local);
  assert.ok(M.checkBase("https://lensiq-api-test.my-sub.workers.dev", []), "test unchanged");
  let r = await M.smoke(API, { profile: "production", origin: SITE, fetch: via(envOf()) });
  assert.equal(r.ok, true, JSON.stringify(r.results.filter(x => !x.ok)));
  for (const re of [/\/api\/pc\/status is not enabled/, /\/v1\/ai\/pc_fields is not enabled/, /\/v1\/ai\/providers is not enabled/, /\/api\/med\/status is not enabled/,
    /\/v1\/events is not enabled/, /\/v1\/billing\/plans is not enabled/, /\/api\/auth\/nonce is not enabled/, /\/api\/fortune\/status is not enabled/, /\/v1\/leads without a bot-check token/]) {
    assert.ok(r.results.some(x => re.test(x.name)), String(re));
  }
  for (const s of sent) {
    assert.ok(!Object.keys(s.headers).some(k => /tester|authorization|turnstile|cookie/i.test(k)), "header sent: " + Object.keys(s.headers));
    assert.ok(s.body === "" || s.body === "{}", "body sent: " + s.body);
  }
  r = await M.smoke(API, { profile: "production", origin: SITE, fetch: via(envOf({ PUBLIC_ROUTES: vars.PUBLIC_ROUTES + ",/api/pc/*" })) });
  assert.equal(r.ok, false, "an open lookup route is reported");
  r = await M.smoke(API, { profile: "production", origin: SITE, fetch: via(envOf({ PUBLIC_ROUTES: vars.PUBLIC_ROUTES + ",/v1/ai/*" })) });
  assert.equal(r.ok, false, "an open AI route is reported");
  r = await M.smoke(API, { profile: "production", origin: SITE, fetch: via(envOf({ ALLOWED_ORIGINS: "https://other.example" })) });
  assert.equal(r.ok, false, "missing CORS for the site origin is reported");
  r = await M.smoke(API, { profile: "production", origin: SITE, fetch: via(envOf({ SERVICE_OFF: "1" })), expectOff: true });
  assert.equal(r.ok, true, JSON.stringify(r.results.filter(x => !x.ok)));
  // CLI: production needs an approved host and the production site origin
  const d = tmp("lq-prod-smoke-");
  try {
    const domains = join(d, "domains.json");
    writeFileSync(domains, JSON.stringify({ apiHosts: [API_HOST] }));
    const cli = async (argv, env = {}) => M.main(argv, { print: () => {}, env, domains, fetch: via(envOf()) });
    const n = sent.length;
    assert.equal(await cli(["--profile", "production", "--base", API]), 2, "no --origin");
    assert.equal(await cli(["--profile", "production", "--base", API, "--origin", "https://anirut77.github.io"]), 2);
    assert.equal(await cli(["--profile", "production", "--base", API, "--origin", "https://lensiq-prod-site.pages.dev"]), 2);
    assert.equal(await cli(["--profile", "production", "--base", API, "--origin", "http://" + DOMAIN]), 2);
    assert.equal(await cli(["--profile", "production", "--base", "https://lensiq-prod-api.x.workers.dev", "--origin", SITE]), 2);
    assert.equal(await cli(["--profile", "staging", "--base", API, "--origin", SITE]), 2);
    assert.equal(await cli(["--profile", "production", "--base", API, "--origin", SITE], { CI: "true" }), 3);
    assert.equal(sent.length, n, "nothing was requested by a refusal");
    assert.equal(await cli(["--profile", "production", "--base", API, "--origin", SITE]), 0);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ---- T7: production site build ----------------------------------------------------------------------------------------

test("T7 build-prod-site: base check, old address rewritten, canonical on every page, _headers, 25 MiB limit, root-path safe", async () => {
  const P = await import(join(ROOT, "tools", "build-prod-site.mjs"));
  const B = await import(join(ROOT, "tools", "build-site.mjs"));
  const BASE = SITE + "/", OLD = "https://anirut77.github.io/lensiq/";
  assert.equal(P.checkProdBase(BASE), BASE);
  for (const b of ["", "http://" + DOMAIN + "/", OLD, "https://anirut77.github.io/", SITE + "/lensiq/", SITE, "https://lensiq-prod-site.pages.dev/", "https://lensiq-prod-api.x.workers.dev/",
    "https://localhost/", "https://127.0.0.1/", SITE + "/?x=1", "https://user@" + DOMAIN + "/", "https://www.faksak.com/", "https://lensiq.tripsdna.com/", "nonsense"]) {
    assert.throws(() => P.checkProdBase(b), Error, JSON.stringify(b));
  }
  assert.equal(P.MAX_FILE_BYTES, 25 * 1024 * 1024);
  assert.equal(P.PROD_SITE_CONFIG, "deploy/public-site.prod.json");
  assert.equal(P.PROD_SITE_URL, "deploy/site-url.prod.json");
  // the committed production files: no domain yet (inactive), never the test backend
  const sc = JSON.parse(readFileSync(join(ROOT, "deploy", "public-site.prod.json"), "utf8"));
  assert.equal(String(sc.apiBase || ""), "", "no API until the domain and the Worker exist");
  assert.doesNotMatch(JSON.stringify(sc), /workers\.dev|-test|0x4AAAAAAF8DHx23TkGQgxdj/);
  assert.equal(B.customerSiteConfig("deploy/public-site.prod.json"), null, "accepted by the customer build (inactive = API-less)");
  const su = JSON.parse(readFileSync(join(ROOT, "deploy", "site-url.prod.json"), "utf8"));
  assert.equal(String(su.base), "", "no production address until the owner decides the domain");
  assert.equal(P.readProdBase(), "");
  // the CLI refuses before building anything when no valid base is given
  const out0 = join(tmpdir(), "lq-prod-never-" + process.pid);
  for (const argv of [["--out", out0], ["--base", OLD, "--out", out0], ["--base", "http://" + DOMAIN + "/", "--out", out0]]) {
    const r = spawnSync(process.execPath, [join(ROOT, "tools", "build-prod-site.mjs"), ...argv], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 1, argv.join(" ") + r.stdout + r.stderr);
    assert.equal(existsSync(out0), false, "nothing was built");
  }
  // post-processing on a small site
  const d = tmp("lq-prod-site-");
  try {
    const head = '<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">\n<title>x</title>\n';
    writeFileSync(join(d, "index.html"), head + `<link rel="canonical" href="${OLD}">\n<meta property="og:url" content="${OLD}">\n<meta property="og:image" content="${OLD}share/og-home.png">\n</head><body></body></html>\n`);
    writeFileSync(join(d, "exam.html"), head + '</head><body><a href="exam-lab.html">x</a></body></html>\n');
    writeFileSync(join(d, "palm.html"), head + `<link rel="canonical" href="${OLD}palm.html">\n</head><body></body></html>\n`);
    writeFileSync(join(d, "404.html"), head + `</head><body><a href="${OLD}">home</a></body></html>\n`);
    writeFileSync(join(d, "sitemap.xml"), `<urlset><url><loc>${OLD}</loc></url><url><loc>${OLD}palm.html</loc></url></urlset>\n`);
    writeFileSync(join(d, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${OLD}sitemap.xml\n`);
    writeFileSync(join(d, "lensiq-pet.js"), `const LINK = "${OLD}petread.html";\n`);
    mkdirSync(join(d, "vendor"));
    writeFileSync(join(d, "vendor", "m.bin"), "x");
    const rep = P.postProcess(d, { base: BASE, oldBase: OLD });
    assert.ok(rep && typeof rep === "object");
    const idx = readFileSync(join(d, "index.html"), "utf8");
    assert.equal((idx.match(/rel="canonical"/g) || []).length, 1);
    assert.match(idx, new RegExp(`<link rel="canonical" href="${BASE.replace(/\./g, "\\.")}">`));
    assert.match(idx, new RegExp(`og:image" content="${BASE.replace(/\./g, "\\.")}share/og-home\\.png"`));
    const ex = readFileSync(join(d, "exam.html"), "utf8");
    assert.equal((ex.match(/rel="canonical"/g) || []).length, 1, "a canonical is added to a page without one");
    assert.ok(ex.includes(`<link rel="canonical" href="${BASE}exam.html">`), ex);
    assert.ok(ex.indexOf("rel=\"canonical\"") < ex.indexOf("</head>"));
    assert.ok(readFileSync(join(d, "palm.html"), "utf8").includes(`<link rel="canonical" href="${BASE}palm.html">`));
    assert.equal((readFileSync(join(d, "404.html"), "utf8").match(/rel="canonical"/g) || []).length, 0, "the 404 page gets no canonical");
    for (const f of ["index.html", "exam.html", "palm.html", "404.html", "sitemap.xml", "robots.txt"]) {
      assert.ok(!readFileSync(join(d, f), "utf8").includes(OLD), f + " still names the old address");
    }
    assert.match(readFileSync(join(d, "robots.txt"), "utf8"), new RegExp(`Sitemap: ${BASE.replace(/\./g, "\\.")}sitemap\\.xml`));
    assert.ok(readFileSync(join(d, "lensiq-pet.js"), "utf8").includes(OLD), "the pet card link changes only on cut-over day (plan §2.6)");
    assert.deepEqual(P.oldBaseLeft(d, OLD), ["lensiq-pet.js"]);
    assert.deepEqual([...P.OLD_BASE_ALLOWED].sort(), ["admin-measurements.js", "lensiq-pet.js"]);
    // _headers
    const h = readFileSync(join(d, "_headers"), "utf8");
    assert.equal(h, P.headersText());
    assert.match(h, /^\/\*$/m);
    assert.match(h, /^ {2}Content-Security-Policy: frame-ancestors 'self'$/m);
    assert.match(h, /^ {2}X-Frame-Options: SAMEORIGIN$/m);
    assert.match(h, /^ {2}X-Content-Type-Options: nosniff$/m);
    assert.match(h, /^ {2}Referrer-Policy: strict-origin-when-cross-origin$/m);
    assert.ok(h.split("\n").filter(l => /^\//.test(l)).length <= 100, "Cloudflare Pages: at most 100 header rules");
    assert.doesNotMatch(h, /unsafe-eval|\*\.|https?:\/\//, "the header adds no source; the page's own CSP meta stays the policy");
    // the 25 MiB per-file limit of Cloudflare Pages
    assert.deepEqual(P.oversized(d), []);
    truncateSync(join(d, "vendor", "m.bin"), P.MAX_FILE_BYTES);
    assert.deepEqual(P.oversized(d), [], "exactly 25 MiB is allowed");
    truncateSync(join(d, "vendor", "m.bin"), P.MAX_FILE_BYTES + 1);
    assert.deepEqual(P.oversized(d).map(x => x.file), ["vendor/m.bin"]);
    // root path: absolute /lensiq/ paths would break at the root of the new host
    assert.deepEqual(P.rootPathProblems(d), []);
    writeFileSync(join(d, "bad.html"), '<a href="/lensiq/exam.html">x</a>');
    writeFileSync(join(d, "bad.js"), 'fetch("/lensiq/vendor/x.bin")');
    assert.deepEqual(P.rootPathProblems(d).map(x => x.file).sort(), ["bad.html", "bad.js"]);
  } finally { rmSync(d, { recursive: true, force: true }); }
  // the real published files: every one fits the Pages limit, and none uses an absolute /lensiq/ path
  const files = B.publishedFiles(ROOT);
  const big = files.filter(f => statSync(join(ROOT, f)).size > P.MAX_FILE_BYTES);
  assert.deepEqual(big, [], "files over 25 MiB cannot be served by Cloudflare Pages");
  const refs = files.filter(f => /\.(html|js|css)$/.test(f) && !f.startsWith("vendor/")).filter(f => P.rootPathRefs(readFileSync(join(ROOT, f), "utf8")).length);
  assert.deepEqual(refs, [], "absolute /lensiq/ paths in published pages or scripts");
  const fromOld = files.filter(f => /\.js$/.test(f) && !f.startsWith("vendor/") && readFileSync(join(ROOT, f), "utf8").includes(OLD));
  assert.deepEqual(fromOld.filter(f => !P.OLD_BASE_ALLOWED.includes(f)), [], "a script names the old address: rewrite it or list it with a reason");
});

// ---- T8: production deploy workflow + guard ---------------------------------------------------------------------------

test("T8 deploy-prod.yml: manual, build + verify only, no Cloudflare credential; the local guard deploys only lensiq-prod-site from a green origin/main", async () => {
  const W = readFileSync(join(ROOT, ".github", "workflows", "deploy-prod.yml"), "utf8");
  const on = /^on:\n((?: {2}.*\n|\n)*)/m.exec(W);
  assert.ok(on, "an on: block");
  assert.match(on[1], /^ {2}workflow_dispatch:/m);
  assert.doesNotMatch(on[1], /^ {2}(push|pull_request|pull_request_target|workflow_run|schedule|release|repository_dispatch|workflow_call):/m, "manual only");
  assert.doesNotMatch(W, /^ {2}(push|workflow_run|schedule):/m);
  assert.match(W, /^permissions:\n {2}contents: read$/m);
  assert.doesNotMatch(W, /contents: write|pages: write|id-token: write/);
  // the locked rule of deploy-tools.test.js: no Cloudflare credential and no deploy in any workflow
  assert.doesNotMatch(W, /secrets\.|CLOUDFLARE_|CF_API|wrangler|pages-deploy-guard\.mjs --run|environment:/, "no credential, no wrangler, no deploy, no GitHub environment");
  assert.ok(W.indexOf("node tools/build-prod-site.mjs") > 0, "builds the bundle");
  assert.ok(W.indexOf("node tools/check-site.mjs --dir _site-prod --root") > W.indexOf("node tools/build-prod-site.mjs"), "root-path crawl of the bundle");
  assert.match(W, /--workflow CI --commit "\$GITHUB_SHA" --status success/, "only a commit CI passed");
  for (const f of ["pages-lfs.yml", "ci.yml"]) assert.doesNotMatch(readFileSync(join(ROOT, ".github", "workflows", f), "utf8"), /deploy-prod|pages-deploy-guard/, f);

  const PG = await import(join(ROOT, "tools", "pages-deploy-guard.mjs"));
  assert.equal(PG.PROJECT, "lensiq-prod-site");
  const d = tmp("lq-pages-guard-");
  const site = join(d, "_site-prod");
  mkdirSync(site);
  const CL = (await import(join(ROOT, "tools", "build-site.mjs"))).CUSTOMER_LOCK;
  writeFileSync(join(site, "index.html"), "<!doctype html>");
  writeFileSync(join(site, "_headers"), "/*\n  X-Frame-Options: SAMEORIGIN\n");
  writeFileSync(join(site, "lensiq-config.js"), CL + "window.X = 1;\n");
  const SHA = "0123456789abcdef0123456789abcdef01234567";
  const GIT = { head: SHA, main: SHA, clean: true };
  const sb = sandbox();
  try {
    const base = { project: "lensiq-prod-site", confirm: "lensiq-prod-site", dir: site, git: GIT, ci: true, env: sb.env };
    assert.deepEqual(PG.deployProblems(base), []);
    const has = (o, re) => { const p = PG.deployProblems({ ...base, ...o }); assert.ok(p.some(x => re.test(x)), JSON.stringify(p)); assert.ok(!p.join(" ").includes(CANARY)); };
    has({ env: { ...sb.env, CI: "true" } }, /CI/);
    has({ env: { ...sb.env, GITHUB_ACTIONS: "true" } }, /CI/);
    has({ env: { ...sb.env, WRANGLER_CI_OVERRIDE_NAME: "dearday-staging" } }, /WRANGLER_CI_OVERRIDE_NAME/);
    has({ env: { ...sb.env, CLOUDFLARE_API_TOKEN: CANARY } }, /CLOUDFLARE_API_TOKEN.*--account-confirmed/);
    assert.deepEqual(PG.deployProblems({ ...base, env: { ...sb.env, CLOUDFLARE_API_TOKEN: CANARY }, accountConfirmed: true }), []);
    has({ git: { ...GIT, head: "1".repeat(40) } }, /origin\/main/);
    has({ git: { ...GIT, main: "" } }, /origin\/main/);
    has({ git: { ...GIT, clean: false } }, /uncommitted/);
    has({ ci: false }, /CI has not succeeded/);
    has({ confirm: "yes" }, /confirm/);
    for (const p of ["lensiq-api-test", "lensiq-prod-site-test", "lensiq-site", "dearday-staging", "aidanex-staging", "lensiq-prod-api", "", "lensiq-prod-site "]) {
      has({ project: p, confirm: p }, /project/);
    }
    has({ dir: join(d, "missing") }, /site folder|not found|missing/);
    writeFileSync(join(site, "lensiq-config.js"), "window.LENSIQ_RESEARCH_DEMO = true;\n");
    has({}, /customer/);
    writeFileSync(join(site, "lensiq-config.js"), CL + "window.X = 1;\n");
    rmSync(join(site, "_headers"));
    has({}, /_headers/);
    writeFileSync(join(site, "_headers"), "/*\n  X-Frame-Options: SAMEORIGIN\n");
    assert.deepEqual(PG.deployProblems({ ...base, dir: "", skipDir: true }), [], "--check without a folder: inputs, checkout and environment only");
    assert.deepEqual(PG.pagesDeployArgs(site, "lensiq-prod-site"), ["pages", "deploy", site, "--project-name", "lensiq-prod-site", "--branch", "main"]);
    assert.throws(() => PG.pagesDeployArgs(site, "lensiq-api-test"));
    // CLI: refusals start nothing and never print a credential
    const shas = [];
    const cli = (argv, env, extra = {}) => {
      const out = [];
      const code = PG.main(argv, { print: s => out.push(s), env, git: GIT, ciGreen: sha => { shas.push(sha); return true; }, ...extra });
      return { code, out: out.join("\n") };
    };
    const A = ["--project", "lensiq-prod-site", "--confirm", "lensiq-prod-site", "--dir", site];
    let r = cli(["--run", ...A], { ...sb.env, CI: "true" });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /REFUSED/);
    r = cli(["--run", ...A], sb.env, { ciGreen: () => false });
    assert.equal(r.code, 1);
    r = cli(["--run", ...A], sb.env, { git: { ...GIT, clean: false } });
    assert.equal(r.code, 1);
    r = cli(["--run", ...A], { ...sb.env, CLOUDFLARE_API_TOKEN: CANARY });
    assert.equal(r.code, 1);
    assert.ok(!r.out.includes(CANARY), "a credential value is never printed");
    assert.equal(cli(["--run", "--project", "lensiq-api-test", "--confirm", "lensiq-api-test", "--dir", site], sb.env).code, 1);
    assert.equal(cli([], sb.env).code, 2);
    r = cli(["--check", ...A], sb.env);
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(sb.calls(), [], "refusals and --check start nothing");
    // the deploy: exactly one wrangler call, with the wrangler login (no credential variable passed on)
    r = cli(["--run", ...A], sb.env);
    assert.equal(r.code, 0, r.out);
    let c = sb.calls();
    assert.equal(c.length, 1);
    assert.deepEqual(c[0].argv, ["pages", "deploy", site, "--project-name", "lensiq-prod-site", "--branch", "main"]);
    assert.equal(c[0].sawToken, false);
    assert.ok(shas.every(x => x === SHA), "CI is checked for the deployed commit");
    // with a confirmed credential in the shell: passed to wrangler through its environment only, never printed
    r = cli(["--run", ...A, "--account-confirmed"], { ...sb.env, CLOUDFLARE_API_TOKEN: CANARY, CLOUDFLARE_ACCOUNT_ID: "acc-canary-1" });
    assert.equal(r.code, 0, r.out);
    assert.ok(!r.out.includes(CANARY) && !r.out.includes("acc-canary-1"));
    c = sb.calls();
    assert.equal(c.length, 2);
    assert.equal(c[1].sawToken, true);
    assert.equal(c[1].sawAccount, true);
  } finally { sb.done(); rmSync(d, { recursive: true, force: true }); }
  // npm script of the local deploy names the production project only
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
  assert.equal(pkg["site:deploy:prod"], "node tools/pages-deploy-guard.mjs --run --project lensiq-prod-site --dir _site-prod");
});

// ---- T9: redirect site ------------------------------------------------------------------------------------------------

test("T9 redirect site: a stub per page to the same page on the new host, query and #hash kept, 404 fallback, sw unregisters", async () => {
  const R = await import(join(ROOT, "tools", "build-redirect-site.mjs"));
  const B = await import(join(ROOT, "tools", "build-site.mjs"));
  const T = SITE + "/";
  assert.equal(R.checkTarget(T), T);
  for (const b of ["", "http://" + DOMAIN + "/", "https://anirut77.github.io/lensiq/", SITE, SITE + "/lensiq/", "https://lensiq-prod-site.pages.dev/", "https://x.workers.dev/", SITE + "/#x"]) {
    assert.throws(() => R.checkTarget(b), Error, b);
  }
  const pages = B.publishedFiles(ROOT).filter(f => /^[^/]+\.html$/.test(f));
  assert.deepEqual(pages.slice().sort(), readdirSync(ROOT).filter(f => f.endsWith(".html")).sort(), "every page of the full site");
  const d = tmp("lq-redirect-");
  try {
    const out = join(d, "out");
    const rep = R.buildRedirectSite({ out, target: T, pages, oldPath: "/lensiq/" });
    assert.ok(rep && rep.stubs >= pages.length - 1);
    const files = B.listTree(out);
    assert.deepEqual(files.filter(f => !pages.includes(f)).sort(), [".nojekyll", "sw.js"], "only stubs, 404.html, sw.js and .nojekyll");
    assert.ok(!files.some(f => f.startsWith("vendor/")), "no models in the redirect site");
    const sha64 = s => createHash("sha256").update(s).digest("base64");
    for (const p of pages.filter(p => p !== "404.html")) {
      const html = readFileSync(join(out, p), "utf8");
      const dest = T + (p === "index.html" ? "" : p);
      assert.ok(html.includes(`<link rel="canonical" href="${dest}">`), p);
      assert.ok(html.includes(`<meta http-equiv="refresh" content="0; url=${dest}">`), p);
      assert.match(html, /<meta name="robots" content="noindex">/);
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
      assert.equal(scripts.length, 1, p);
      assert.ok(html.includes(`script-src 'sha256-${sha64(scripts[0])}'`), p + ": the CSP allows exactly this inline script");
      assert.doesNotMatch(html, /<script src=/);
      let got = null;
      vm.runInNewContext(scripts[0], { location: { search: "?x=1", hash: "#y", pathname: "/lensiq/" + p, replace: u => { got = u; } } });
      assert.equal(got, dest + "?x=1#y", p);
    }
    const nf = readFileSync(join(out, "404.html"), "utf8");
    const s404 = [...nf.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.equal(s404.length, 1);
    assert.ok(nf.includes(`script-src 'sha256-${sha64(s404[0])}'`));
    for (const [path, want] of [["/lensiq/exam.html", T + "exam.html"], ["/lensiq/", T], ["/lensiq", T], ["/lensiq/sub/x.html", T + "sub/x.html"], ["/other.html", T + "other.html"]]) {
      let got = null;
      vm.runInNewContext(s404[0], { location: { pathname: path, search: "?q=2", hash: "#h", replace: u => { got = u; } } });
      assert.equal(got, want + "?q=2#h", path);
    }
    const sw = readFileSync(join(out, "sw.js"), "utf8");
    assert.match(sw, /registration\.unregister\(\)/);
    assert.match(sw, /caches\.delete/);
    assert.doesNotMatch(sw, /respondWith|cache\.put/, "the replacement service worker caches nothing");
    // the CLI refuses a bad target before writing anything
    const never = join(d, "never");
    const r = spawnSync(process.execPath, [join(ROOT, "tools", "build-redirect-site.mjs"), "--target", "https://anirut77.github.io/lensiq/", "--out", never], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.equal(existsSync(never), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
  assert.doesNotMatch(readFileSync(join(ROOT, ".github", "workflows", "pages-lfs.yml"), "utf8"), /build-redirect-site/, "not wired into GitHub Pages before cut-over");
});

// ---- T10: today's GitHub Pages output is unchanged --------------------------------------------------------------------

test("T10 GitHub Pages output: a pure copy of the published files plus the test-site config; no production file published", async () => {
  const B = await import(join(ROOT, "tools", "build-site.mjs"));
  const PL = readFileSync(join(ROOT, ".github", "workflows", "pages-lfs.yml"), "utf8");
  assert.match(PL, /^\s+run: node tools\/build-site\.mjs$/m, "Pages builds with no flag");
  assert.doesNotMatch(PL, /build-prod-site|build-redirect-site|public-site\.prod|site-url\.prod|deploy-prod|--customer|_headers/);
  const files = B.publishedFiles(ROOT);
  // RE-LOCK 1: the first lock matched any "prod" substring, which also hits the existing pages products.js / i18n/en-products.js
  for (const f of files) {
    assert.doesNotMatch(f, /^(_headers|_redirects|_site-prod\/.*|_site-redirect\/.*)$|^deploy\/|(^|\/)(site-url|public-site)\.prod\.json$|build-(prod|redirect)-site|deploy-prod|pages-deploy-guard/,
      "a production file would be published: " + f);
  }
  const d = tmp("lq-pages-same-");
  try {
    const out = join(d, "_site");
    const r = spawnSync(process.execPath, [join(ROOT, "tools", "build-site.mjs"), "--out", out], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const cfg = B.readSiteConfig();
    const got = B.listTree(out);
    const want = [...files, ...(cfg ? [B.SITE_CONFIG_JS] : [])].sort();
    assert.deepEqual(got, want, "exactly the published files");
    const scoped = new Set(cfg ? cfg.pages : []);
    for (const f of files) {
      if (scoped.has(f)) continue;
      assert.equal(sha(readFileSync(join(out, f))), sha(readFileSync(join(ROOT, f))), f + " is a byte copy");
    }
    if (cfg) {
      const ref = join(d, "ref");
      mkdirSync(ref);
      for (const p of cfg.pages) { mkdirSync(dirname(join(ref, p)), { recursive: true }); copyFileSync(join(ROOT, p), join(ref, p)); }
      await B.applySiteConfig(ref, cfg);
      for (const p of [...cfg.pages, B.SITE_CONFIG_JS]) assert.equal(sha(readFileSync(join(out, p))), sha(readFileSync(join(ref, p))), p + " = repo page + test-site config");
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});
