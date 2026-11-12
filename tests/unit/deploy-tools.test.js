"use strict";
// tests/unit/deploy-tools.test.js — deploy preparation (docs/DEPLOY.md): the wrangler test environment, the Cloudflare
// account name guard, the guarded deploy / kill-switch scripts, `secrets:setup`, the all-OFF AI deploy defaults, the
// per-page public-site config, the read-only smoke check and the tester / consent texts of the page.
// A FAKE wrangler stands in for the real one (LQ_WRANGLER_BIN, honoured only with NODE_ENV=test): nothing here can reach
// a Cloudflare account, and no real secret exists in these tests (canary strings only).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { PassThrough } = require("node:stream");
const { createEnv } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
/** the committed file as it is (it carries the real D1 id once the database exists) */
const TOML_LIVE = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
/** FIXTURE for every test that drives a tool: the same text with the [env.test] database id back to the placeholder.
 *  No test runs a tool against the live file or writes to it (tools get this text or a temp copy of it). */
const TOML = TOML_LIVE.replace(/(\[\[env\.test\.d1_databases\]\][\s\S]*?database_id = ")[0-9a-f-]{36}"/, `$1${PLACEHOLDER}"`);
const sha = s => createHash("sha256").update(s).digest("hex");
const guard = () => import(join(ROOT, "tools", "lib", "cf-guard.mjs"));
/** the [env.test.vars] of wrangler.toml, as the deployed Worker gets them */
const readTargetsSync = () => ({ vars: Object.fromEntries([...TOML.slice(TOML.indexOf("[env.test.vars]"),
  TOML.indexOf("[[env.test.d1_databases]]")).matchAll(/^([A-Z0-9_]+) = "(.*)"$/gm)].map(m => [m[1], m[2]])) });
const OTHERS = ["dearday-staging", "aidanex-staging", "aidanex-pet-clinic-pilot", "faksak.com", "tripsdna.com",
  "aidanex-sales-staging", "kaguwood-store", "aidanex-pet-clinic"];

/** A fake wrangler. It resolves the script name the way the real one does (secret / tail: `${name}-${env}` when both
 *  flags are given, else --name ?? the environment's name), appends {argv, effective, stdinSha, stdinLen, draft} to
 *  $LQ_FAKE_LOG, and: a `secret put` whose effective name is not a deployed Worker "creates a draft Worker" (draft:true,
 *  as the real one does with piped input); it echoes its stdin on stdout AND stderr (a hostile case for the callers:
 *  they must never relay it). $LQ_FAKE_MODE: nolist, nodeploy, haskek, d1other, d1missing, fail:<SECRET>. */
function fakeWrangler(dir) {
  const bin = join(dir, "fake-wrangler.js");
  writeFileSync(bin, `
const fs = require("fs"), crypto = require("crypto");
const argv = process.argv.slice(2), mode = process.env.LQ_FAKE_MODE || "";
const flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const name = flag("--name"), env = flag("--env") || process.env.CLOUDFLARE_ENV, cfg = env === "test" ? "lensiq-api-test" : "lensiq-api";
const override = argv[0] === "deploy" ? process.env.WRANGLER_CI_OVERRIDE_NAME : undefined;
const legacy = argv[0] === "secret" || argv[0] === "tail";
const effective = argv[0] === "d1" || argv[0] === "whoami" ? null : override ? override : legacy ? (name && env ? name + "-" + env : name || cfg) : name || cfg;
const sawEnv = Object.keys(process.env).filter(k => /^(WRANGLER|CLOUDFLARE|CF)_|PROXY|SECRET_CANARY/.test(k));
const DEPLOYED = mode.includes("nodeploy") ? [] : ["lensiq-api-test"];
let input = "";
const done = () => {
  const rec = { argv, effective, sawEnv, stdinSha: crypto.createHash("sha256").update(input).digest("hex"), stdinLen: input.length, stdin1: argv.includes("SERVICE_OFF") ? input : undefined };
  const exists = effective == null || DEPLOYED.includes(effective);
  if (argv[0] === "secret" && argv[1] === "put" && !exists) rec.draft = true;
  fs.appendFileSync(process.env.LQ_FAKE_LOG, JSON.stringify(rec) + "\\n");
  if (argv[0] === "whoami") { console.log("You are logged in. Account: Owner Test Account, id 0123"); process.exit(0); }
  if (argv[0] === "deployments") { if (!exists) { console.error("worker not found"); process.exit(1); } console.log(JSON.stringify([{ id: "dep-1" }])); process.exit(0); }
  if (argv[0] === "secret" && argv[1] === "list") {
    if (mode.includes("nolist") || !exists) { console.error("worker not found"); process.exit(1); }
    console.log(JSON.stringify(mode.includes("haskek") ? [{ name: "SECRETS_KEK", type: "secret_text" }] : []));
    process.exit(0);
  }
  if (argv[0] === "d1" &&
    argv[1] === "create") { console.log('{ "d1_databases": [ { "binding": "DB", "database_name": "lensiq-test", "database_id": "11111111-2222-4333-8444-555555555555" } ] }'); process.exit(0); }
  if (argv[0] === "d1" && argv[1] === "list") {
    const mine = "11111111-2222-4333-8444-555555555555", other = "99999999-0000-4000-8000-000000000001";
    console.log(" wrangler banner [not json]");
    console.log(JSON.stringify(mode.includes("d1other") ? [{ uuid: mine, name: "aidanex-db" }, { uuid: other, name: "lensiq-test" }]
      : mode.includes("d1missing") ? [{ uuid: other, name: "aidanex-db" }] : [{ uuid: other, name: "aidanex-db" }, { uuid: mine, name: "lensiq-test" }]));
    process.exit(0);
  }
  if (argv[0] === "d1" && argv[1] === "execute" && argv.includes("--json")) {
    const gw = { enabled: true, providers: { openrouter: true }, features: { pc_fields: { enabled: true, chain: [{ model: "m-owner-choice" }], monthlyBudgetUsd: 1, imageModeAllowed: false } } };
    const rows = mode.includes("hasrows") ? [{ key: "ai_gateway", value: JSON.stringify(gw) }, { key: "ai", value: JSON.stringify({ enabled: false }) }] : [];
    console.log(" banner"); console.log(JSON.stringify([{ results: rows, success: true }])); process.exit(0);
  }
  if (argv[1] === "put" && !argv.includes("SERVICE_OFF")) { process.stdout.write("echo:" + input + "\\n"); process.stderr.write("echo:" + input + "\\n"); }
  process.exit(mode.includes("fail:" + argv[2]) ? 1 : 0);
};
if (process.stdin.isTTY || !(argv[0] === "secret" && argv[1] === "put")) done(); else { process.stdin.on("data", d => { input += d; }); process.stdin.on("end", done); }
`);
  return bin;
}
function sandbox(mode = "") {
  const dir = mkdtempSync(join(tmpdir(), "lq-deploy-test-"));
  const log = join(dir, "calls.jsonl");
  writeFileSync(log, "");
  const env = { PATH: process.env.PATH, NODE_ENV: "test", LQ_WRANGLER_BIN: fakeWrangler(dir), LQ_FAKE_LOG: log, LQ_FAKE_MODE: mode };
  const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  /** calls that change something (everything except the read-only checks) */
  const writes = () => calls().filter(c => !["deployments", "whoami"].includes(c.argv[0]) && !(c.argv[0] === "secret" && c.argv[1] === "list") && !(c.argv[0] === "d1" && c.argv[1] === "list"));
  return { dir, env, calls, writes, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const MY_D1 = "11111111-2222-4333-8444-555555555555";
const TOML_WITH_ID = TOML.replace(/(\[\[env\.test\.d1_databases\]\][\s\S]*?database_id = ")[0-9a-f-]{36}"/, `$1${MY_D1}"`);

// ---- B0: wrangler test environment ---------------------------------------------------------------------------------

test("B0 wrangler.toml: [env.test] names only LENSIQ's own new resources and carries every var", async () => {
  const { readTargets, D1_PLACEHOLDER, ALLOWED } = await guard();
  const t = readTargets(TOML);
  assert.deepEqual([t.env, t.worker, t.d1, t.d1Binding], ["test", "lensiq-api-test", "lensiq-test", "DB"]);
  assert.deepEqual([ALLOWED.worker, ALLOWED.d1], [t.worker, t.d1]);
  assert.equal(t.d1Id, D1_PLACEHOLDER, "the fixture carries the placeholder");
  // the COMMITTED file: the placeholder (nothing created yet) or exactly the id recorded in deploy/created.json; any other id fails
  const live = readTargets(TOML_LIVE);
  assert.deepEqual([live.worker, live.d1, live.d1Binding], [t.worker, t.d1, t.d1Binding]);
  assert.deepEqual(live.vars, t.vars, "the fixture differs from the committed file in the database id only");
  assert.equal(TOML_LIVE.replace(live.d1Id, PLACEHOLDER), TOML);
  const rec = existsSync(join(ROOT, "deploy", "created.json")) ? JSON.parse(readFileSync(join(ROOT, "deploy", "created.json"), "utf8")) : null;
  const recorded = rec && rec.d1 ? rec.d1.id : null;
  assert.ok(live.d1Id === D1_PLACEHOLDER || live.d1Id === recorded, `backend/wrangler.toml [env.test] database_id must be the placeholder or the id in deploy/created.json (${recorded})`);
  if (rec) {
    assert.deepEqual([rec.environment, rec.worker.name, rec.d1.name, rec.d1.binding], ["test", ALLOWED.worker, ALLOWED.d1, "DB"], "created.json names LENSIQ's own resources only");
    assert.match(rec.d1.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.notEqual(rec.d1.id, D1_PLACEHOLDER);
    assert.match(rec.worker.url, /^https:\/\/lensiq-api-test\.[a-z0-9-]+\.workers\.dev$/);
    assert.match(rec.worker.first_version_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(rec.worker.cron, t.crons);
    assert.match(rec.created, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual([...rec.never_touched].sort(), [...OTHERS].sort());
    assert.doesNotMatch(JSON.stringify(rec), /sk-[A-Za-z0-9]|secret"\s*:|token"\s*:|password|api_key/i, "no secret in the record");
    assert.equal(live.d1Id, recorded, "once the database is recorded as created, the committed config carries its id (a fresh checkout is deployable)");
  }
  assert.equal(t.workersDev, true);
  assert.equal(t.previewUrls, false);
  assert.match(TOML, /\[env\.test\][\s\S]*?^preview_urls = false$/m, "no public preview / version hostnames");
  assert.equal(t.vars.ALLOWED_ORIGINS, "https://anirut77.github.io");
  assert.equal(t.vars.TURNSTILE_HOSTNAMES, "anirut77.github.io");
  assert.equal(t.vars.ADMIN_ORIGINS, "", "the public site never gets admin access");
  assert.deepEqual([t.vars.TESTER_GATE, t.vars.AI_ROUTE_PIN, t.vars.PC_BUILD, t.vars.PC_THFDA_MODE], ["required", "required", "demo", "live"],
    "D2: testing-only sources are on in the build and closed to everyone without the tester code");
  assert.deepEqual([t.vars.FREE_MODE, t.vars.BILLING_ENABLED, t.vars.OPN_ALLOW_LIVE, t.vars.GOOGLE_CLIENT_ID, t.vars.GO_LIVE_GATE], ["true", "false", "false", "", "enforce"]);
  assert.ok(Number(t.vars.DAILY_REQUEST_CAP) > 0 && Number(t.vars.DAILY_REQUEST_CAP) <= 25000, "LENSIQ uses at most a quarter of the account's 100,000 requests / day");
  assert.deepEqual(Object.keys(t.topVars).filter(k => !(k in t.vars)), [], "vars are not inherited by an environment: none may be missing");
  assert.doesNotMatch(TOML, /^\s*AI_EVAL_LOCAL\s*=/m, "the local evaluation switch is never in wrangler.toml");
  assert.doesNotMatch(TOML, /^\s*(TESTER_ACCESS_CODE|SERVICE_OFF|SECRETS_KEK|OPENROUTER_API_KEY|TURNSTILE_SECRET|ADMIN_BOOTSTRAP_TOKEN)\s*=/m, "no secret in the file");
  assert.deepEqual(t.crons, ["17 3 * * *"], "one cron trigger only (5 per account, shared)");
  assert.deepEqual([t.observability.enabled, t.observability.head_sampling_rate], ["true", "0.5"], "log sampling below 1: the account's log quota is shared");
  // the default (on-premise / template) configuration is unchanged and cannot be deployed as is
  assert.equal(t.topName, "lensiq-api");
  assert.match(TOML, /\[\[d1_databases\]\]\nbinding = "DB"\ndatabase_name = "lensiq"\n[^\n]*\ndatabase_id = "00000000-0000-0000-0000-000000000000"/);
  assert.ok(!OTHERS.some(n => TOML.includes(`"${n}"`)), "none of the owner's other resources is named in the configuration");
});

test("B0 scripts: every npm script that reaches Cloudflare goes through the guarded tool; no raw remote wrangler command", () => {
  const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
  const be = JSON.parse(readFileSync(join(ROOT, "backend", "package.json"), "utf8")).scripts;
  for (const [k, a] of Object.entries({ "backend:deploy:test": "deploy", "backend:d1:create": "d1:create", "backend:migrate": "migrate", "backend:off": "off", "backend:on": "on",
    "backend:rollback": "rollback", "backend:list": "list", "backend:dry-run": "dry-run", "backend:whoami": "whoami",
    "backend:bootstrap:close": "bootstrap:close", "backend:tester:revoke": "tester:revoke" })) assert.equal(root[k], "node tools/backend-deploy.mjs " + a, k);
  assert.equal(root["secrets:setup"], "node tools/secrets-setup.mjs");
  assert.equal(root["ai:deploy-defaults"], "node tools/ai-deploy-defaults.mjs");
  assert.equal(be.deploy, "node ../tools/backend-deploy.mjs deploy");
  assert.equal(be["db:migrate:remote"], "node ../tools/backend-deploy.mjs migrate");
  for (const [k, v] of [...Object.entries(root), ...Object.entries(be)]) {
    assert.doesNotMatch(v, /wrangler\s+(deploy|delete|rollback|secret|versions)|--remote/, `script ${k} must not call wrangler against the account directly`);
  }
});

// ---- account safety: the name guard --------------------------------------------------------------------------------

test("guard: only lensiq-api-test / lensiq-test are targets; the owner's other resources and look-alikes are refused", async () => {
  const { assertTarget, GuardError, PROTECTED } = await guard();
  assert.deepEqual([...PROTECTED].sort(), [...OTHERS].sort());
  assert.equal(assertTarget("worker", "lensiq-api-test"), "lensiq-api-test");
  assert.equal(assertTarget("d1", "lensiq-test"), "lensiq-test");
  for (const n of [...OTHERS, "DEARDAY-STAGING", "", null, undefined, "lensiq", "lensiq-", "xlensiq-api-test", "lensiq-api-test;rm", "lensiq-api-test --name dearday-staging",
    "lensiq-api", "lensiq-other", "LENSIQ-API-TEST", "aidanex-lensiq-test"]) {
    assert.throws(() => assertTarget("worker", n), GuardError, "worker " + n);
    assert.throws(() => assertTarget("d1", n), GuardError, "d1 " + n);
  }
  assert.throws(() => assertTarget("worker", "lensiq-test"), GuardError, "a D1 name is not a Worker target");
});

test("guard: every action prints the target first and refuses a foreign name before wrangler starts (exit 3); only plan / dry-run run in CI", async () => {
  const { main, ACTIONS } = await import(join(ROOT, "tools", "backend-deploy.mjs"));
  const sb = sandbox();
  try {
    for (const bad of ["dearday-staging", "aidanex-staging", "aidanex-pet-clinic-pilot", "lensiq-api"]) {
      const toml = TOML_WITH_ID.replace('name = "lensiq-api-test"', `name = "${bad}"`);
      for (const a of ACTIONS) {
        const out = [];
        const code = main(a === "rollback" ? [a, MY_D1] : [a], { print: s => out.push(s), env: sb.env, toml });
        assert.equal(code, 3, `${a} on ${bad}`);
        assert.match(out[1], new RegExp(`^TARGETS {2}Worker "${bad}"`), "the target is printed before the refusal");
        assert.match(out[2], /^REFUSED: worker target/);
      }
    }
    const tomlDb = TOML_WITH_ID.replace('database_name = "lensiq-test"', 'database_name = "aidanex-db"');
    assert.equal(main(["migrate"], { print: () => {}, env: sb.env, toml: tomlDb }), 3);
    assert.deepEqual(sb.calls(), [], "wrangler was never started");
    // CI: nothing that contacts an account, read-only or not
    for (const a of ACTIONS.filter(x => !["plan", "dry-run"].includes(x))) {
      assert.equal(main(a === "rollback" ? [a, MY_D1] : [a], { print: () => {}, env: { ...sb.env, CI: "true" }, toml: TOML_WITH_ID }), 3, "CI refuses " + a);
    }
    assert.deepEqual(sb.calls(), []);
    assert.equal(main(["plan"], { print: () => {}, env: { ...sb.env, CI: "true" }, toml: TOML }), 0);
  } finally { sb.done(); }
});

// ---- the EFFECTIVE target: what wrangler resolves for the exact argument lists the tools build -----------------------

test("effective target: every argument list the tools build resolves to lensiq-api-test / lensiq-test; the old `--env test --name` secret form is refused", async () => {
  const G = await guard();
  const { commands, ACTIONS } = await import(join(ROOT, "tools", "backend-deploy.mjs"));
  const t = G.readTargets(TOML_WITH_ID);
  const C = commands(t, { version: MY_D1, outdir: "/tmp/x" });
  assert.deepEqual(Object.keys(C).sort(), ACTIONS.filter(a => a !== "plan").sort(), "every action has its argument list here");
  const table = {};
  for (const [action, lists] of Object.entries(C)) for (const args of lists) table[`${action}: ${args.slice(0, 3).join(" ")}`] = G.assertEffective(args, t);
  for (const [k, v] of Object.entries(table)) {
    if (v.kind === "worker") assert.equal(v.name, "lensiq-api-test", k);
    else if (v.kind === "d1") assert.equal(v.name, "lensiq-test", k);
    else assert.match(k, /whoami|d1 list/, k + " has no target (read-only)");
  }
  // secret commands carry --env only; the commands that resolve `--name ?? env name` carry both
  for (const a of ["off", "on", "bootstrap:close", "tester:revoke"]) assert.deepEqual(C[a][0].slice(3), ["--env", "test"], a);
  assert.deepEqual(C.list[1], ["secret", "list", "--env", "test"]);
  for (const a of ["deploy", "versions", "rollback"]) assert.ok(C[a][0].includes("--name") && C[a][0].includes("lensiq-api-test") && C[a][0].includes("--env"), a);
  assert.deepEqual(G.deployedArgs(t), ["deployments", "list", "--env", "test", "--name", "lensiq-api-test", "--json"]);
  // the review's blocker: with both flags a secret command targets "<name>-<env>"
  const old = ["secret", "put", "SERVICE_OFF", "--env", "test", "--name", "lensiq-api-test"];
  assert.deepEqual(G.effectiveTarget(old, t), { kind: "worker", name: "lensiq-api-test-test" });
  assert.throws(() => G.assertEffective(old, t), G.GuardError);
  assert.deepEqual(G.effectiveTarget(["secret", "list", "--env=test", "--name=lensiq-api-test"], t).name, "lensiq-api-test-test", "the --flag=value form is read too");
  assert.equal(G.effectiveTarget(["tail", "--env", "test", "--name", "lensiq-api-test"], t).name, "lensiq-api-test-test");
  assert.equal(G.effectiveTarget(["versions", "secret", "put", "X", "--env", "test", "--name", "lensiq-api-test"], t).name, "lensiq-api-test-test");
  // other ways to miss the target: all refused
  for (const args of [["secret", "put", "X"], ["secret", "put", "X", "--name", "dearday-staging"], ["secret", "put", "X", "--env", "staging"], ["deploy"], ["deploy", "--env", "production"],
    ["deploy", "--name", "aidanex-staging", "--env", "test"], ["rollback", MY_D1], ["d1", "execute", "aidanex-db", "--remote", "--env", "test"], ["d1", "execute", "lensiq-test", "--remote"],
    ["d1", "migrations", "apply", "lensiq-test", "--remote"], ["d1", "create", "lensiq"], ["d1", "delete", "lensiq-test"], ["delete", "--env", "test"], ["kv", "namespace", "create", "x"],
    ["secret", "delete", "X", "--env", "test", "--name", "lensiq-api-test"]]) assert.throws(() => G.assertEffective(args, t), G.GuardError, args.join(" "));
  // the wrapper checks it for every call, before anything starts
  const sb = sandbox();
  try {
    assert.throws(() => G.wrangler(old, { input: "1", print: () => {}, env: sb.env, cfg: t, target: "x" }), G.GuardError);
    assert.throws(() => G.wrangler(["deploy"], { print: () => {}, env: sb.env, cfg: t, target: "x" }), G.GuardError);
    assert.deepEqual(sb.calls(), [], "nothing was started");
    // and the fake wrangler models the real resolution: the old form would have created a draft Worker of another name
    const r = spawnSync(process.execPath, [sb.env.LQ_WRANGLER_BIN, ...old], { input: "1", encoding: "utf8", env: sb.env });
    assert.equal(r.status, 0);
    assert.deepEqual([sb.calls()[0].effective, sb.calls()[0].draft], ["lensiq-api-test-test", true]);
  } finally { sb.done(); }
});

test("effective target: the rules are re-checked against the installed wrangler bundle; a changed rule stops the scripts", async () => {
  const G = await guard();
  const dir = mkdtempSync(join(tmpdir(), "lq-bundle-test-"));
  try {
    const good = [
      'description: "Create or update a secret for a Worker",', "const scriptName = getLegacyScriptName(args, config2);",
      'description: "List all secrets for a Worker",', "const scriptName = getLegacyScriptName(args, config2);",
      'description: "Delete a secret from a Worker",', "const scriptName = getLegacyScriptName(args, config2);",
      'description: "Rollback a deployment for a Worker",', "const workerName = args.name ?? config2.name;",
      'description: "List the 10 most recent Versions of your Worker",', "const workerName = args.name ?? config2.name;",
      'description: "Displays the 10 most recent deployments of your Worker",', "const workerName = args.name ?? config2.name;",
      "function getLegacyScriptName(args, config2) {", "  " + G.BUNDLE_RULES[0][1], "}", G.BUNDLE_RULES[1][1]
    ].join("\n");
    const file = join(dir, "cli.js");
    writeFileSync(file, good);
    assert.deepEqual(G.checkWranglerBundle(file), { ok: true, problems: [] });
    writeFileSync(file, good.replace("`${args.name}-${args.env}`", "args.name"));
    assert.equal(G.checkWranglerBundle(file).ok, false, "a changed legacy rule is noticed");
    writeFileSync(file, good.replace('"List all secrets for a Worker",\nconst scriptName = getLegacyScriptName(args, config2);',
      '"List all secrets for a Worker",\nconst workerName = args.name ?? config2.name;'));
    assert.equal(G.checkWranglerBundle(file).ok, false, "a secret command that moved to the plain rule is noticed");
    assert.equal(G.checkWranglerBundle(join(dir, "missing.js")).ok, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // when wrangler is installed here (always in test:integration, which pins this too): the real bundle matches
  if (existsSync(G.WRANGLER_BUNDLE)) assert.deepEqual(G.checkWranglerBundle(), { ok: true, problems: [] });
});

test("deploy tool: kill switch = SERVICE_OFF 1 / 0 on stdin of `secret put --env test`; secrets only on a deployed Worker; d1:create fills the id", async () => {
  const { main } = await import(join(ROOT, "tools", "backend-deploy.mjs"));
  const { readTargets, D1_PLACEHOLDER } = await guard();
  const sb = sandbox();
  try {
    const tomlPath = join(sb.dir, "wrangler.toml");
    writeFileSync(tomlPath, TOML);
    const run = (argv, env = sb.env) => { const out = []; const code = main(argv, { print: s => out.push(s), env, tomlPath }); return { code, out }; };
    let r = run(["off"]);
    assert.equal(r.code, 0, r.out.join("\n"));
    assert.ok(r.out.findIndex(l => /^TARGET {3}Worker "lensiq-api-test" secret SERVICE_OFF = 1.*resolves this command to Worker "lensiq-api-test"$/.test(l)) < r.out.findIndex(l => /^COMMAND/.test(l)),
      "target (with the resolved name) before command");
    r = run(["on"]);
    assert.equal(r.code, 0);
    assert.deepEqual(sb.calls().map(c => c.argv.slice(0, 2).join(" ")), ["deployments list", "secret put", "deployments list", "secret put"], "the Worker is checked before each secret");
    const [off, on] = sb.writes();
    assert.deepEqual(off.argv, ["secret", "put", "SERVICE_OFF", "--env", "test"]);
    assert.deepEqual([off.stdin1, on.stdin1, off.effective, on.effective, off.draft], ["1", "0", "lensiq-api-test", "lensiq-api-test", undefined]);
    // deploy / migrate refuse while the D1 id is the placeholder
    assert.equal(run(["deploy"]).code, 3);
    assert.equal(run(["migrate"]).code, 3);
    assert.equal(sb.writes().length, 2);
    // d1:create writes the id wrangler prints; only that line changes
    r = run(["d1:create"]);
    assert.equal(r.code, 0, r.out.join("\n"));
    assert.ok(r.out.some(l => /1 of the account's 10 free databases/.test(l)));
    assert.deepEqual(sb.writes()[2].argv, ["d1", "create", "lensiq-test"]);
    const after = readFileSync(tomlPath, "utf8");
    assert.equal(readTargets(after).d1Id, MY_D1);
    assert.equal(after.replace(MY_D1, D1_PLACEHOLDER).split(D1_PLACEHOLDER).length, TOML.split(D1_PLACEHOLDER).length);
    assert.match(after, /\[\[d1_databases\]\]\nbinding = "DB"\ndatabase_name = "lensiq"\n[^\n]*\ndatabase_id = "00000000-0000-0000-0000-000000000000"/, "the default database entry is untouched");
    r = run(["migrate"]);
    assert.equal(r.code, 0, r.out.join("\n"));
    assert.deepEqual(sb.calls().slice(-2).map(c => c.argv), [["d1", "list", "--json"], ["d1", "migrations", "apply", "lensiq-test", "--remote", "--env", "test"]], "id checked, then applied");
    r = run(["rollback", "99999999-2222-4333-8444-555555555555"]);
    assert.deepEqual(sb.calls().at(-1).argv.slice(0, 6), ["rollback", "99999999-2222-4333-8444-555555555555", "--env", "test", "--name", "lensiq-api-test"]);
    assert.equal(run(["rollback", "not-an-id"]).code, 2);
    // closing the bootstrap / revoking the code: a random value on stdin, never printed (no interactive delete prompt)
    for (const [a, name] of [["bootstrap:close", "ADMIN_BOOTSTRAP_TOKEN"], ["tester:revoke", "TESTER_ACCESS_CODE"]]) {
      r = run([a]);
      const c = sb.calls().at(-1);
      assert.equal(r.code, 0, r.out.join("\n"));
      assert.deepEqual([c.argv, c.effective, c.draft], [["secret", "put", name, "--env", "test"], "lensiq-api-test", undefined]);
      assert.ok(c.stdinLen >= 60, "a long random value");
      assert.ok(r.out.some(l => l === name + ": closed.") && !r.out.join("\n").includes("echo:"), "wrangler output is not relayed");
    }
    assert.notEqual(sb.writes().at(-1).stdinSha, sb.writes().at(-2).stdinSha);
    // whoami goes through the tool, read-only
    r = run(["whoami"]);
    assert.deepEqual([r.code, sb.calls().at(-1).argv], [0, ["whoami"]]);
    // --print-only runs nothing
    const n = sb.calls().length;
    r = run(["off", "--print-only"]);
    assert.equal(r.code, 0);
    assert.ok(r.out.some(l => /npx wrangler secret put SERVICE_OFF --env test\)$/.test(l)));
    assert.equal(sb.calls().length, n);
    assert.ok(sb.calls().every(c => !c.draft && (c.effective == null || c.effective === "lensiq-api-test")), "no call resolved to another Worker and no draft Worker was created");
    // a Cloudflare token / account id in the shell replaces `wrangler login`: mutating actions need the owner's confirmation
    const tok = { ...sb.env, CLOUDFLARE_API_TOKEN: "TOKEN-CANARY-not-shown", CLOUDFLARE_ACCOUNT_ID: "ACCOUNT-CANARY" };
    r = run(["off"], tok);
    assert.equal(r.code, 3);
    assert.ok(r.out.some(l => /^WARNING {2}CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID are set/.test(l)) && r.out.some(l => /backend:whoami[\s\S]*--account-confirmed/.test(l)));
    assert.ok(!r.out.join("\n").includes("CANARY"), "the values are never printed");
    assert.equal(sb.calls().length, n + 0, "nothing was started");
    assert.equal(run(["whoami"], tok).code, 0, "the read-only account check still works");
    assert.equal(run(["off", "--account-confirmed"], tok).code, 0);
  } finally { sb.done(); }
});

test("deploy tool: no secret is written when the Worker is not deployed; migrate / deploy / ai defaults refuse when the D1 id is not the database named lensiq-test", async () => {
  const { main } = await import(join(ROOT, "tools", "backend-deploy.mjs"));
  const D = await import(join(ROOT, "tools", "ai-deploy-defaults.mjs"));
  let sb = sandbox("nodeploy");
  try {
    for (const a of ["off", "on", "bootstrap:close", "tester:revoke"]) {
      const out = [];
      assert.equal(main([a], { print: s => out.push(s), env: sb.env, toml: TOML_WITH_ID }), 3, a);
      assert.ok(out.some(l => /REFUSED: Worker "lensiq-api-test" is not deployed[\s\S]*never written to a Worker that does not exist/.test(l)), a);
    }
    assert.deepEqual(sb.writes(), [], "no secret put: no draft Worker can be created");
    assert.ok(sb.calls().every(c => c.argv[0] === "deployments"));
  } finally { sb.done(); }
  for (const [mode, re] of [["d1other", /belongs to the database "aidanex-db", not "lensiq-test"/], ["d1missing", /no database in this account has the id/]]) {
    sb = sandbox(mode);
    try {
      for (const a of ["migrate", "deploy"]) {
        // the real action (NOT --print-only): the id check runs and refuses before the deploy / migration is started
        const out = [];
        assert.equal(main([a], { print: s => out.push(s), env: sb.env, toml: TOML_WITH_ID }), 3, `${mode} ${a}`);
        assert.ok(out.some(l => re.test(l)), out.join("\n"));
        assert.equal(sb.calls().filter(c => c.argv[0] === "deploy" || c.argv[1] === "migrations").length, 0, `${mode} ${a}: zero deploy / migration calls`);
      }
      const out = [];
      assert.equal(await D.main(["--apply"], { print: s => out.push(s), env: sb.env, toml: TOML_WITH_ID }), 3, mode + " ai defaults");
      assert.ok(out.some(l => re.test(l)));
      assert.deepEqual(sb.writes(), [], mode + ": only the read-only list ran");
      assert.ok(sb.calls().every(c => c.argv.join(" ") === "d1 list --json"));
    } finally { sb.done(); }
  }
  sb = sandbox();
  try {
    assert.equal(await D.main(["--apply"], { print: () => {}, env: sb.env, toml: TOML }), 3, "placeholder id: refused");
    assert.deepEqual(sb.calls(), []);
    assert.equal(await D.main(["--apply"], { print: () => {}, env: { ...sb.env, CLOUDFLARE_API_TOKEN: "x" }, toml: TOML_WITH_ID }), 3, "stray token: refused");
    assert.deepEqual(sb.calls(), []);
  } finally { sb.done(); }
});

test("environment: wrangler never inherits the shell; a target- or endpoint-changing variable refuses every tool before wrangler starts", async () => {
  const G = await guard();
  const { main } = await import(join(ROOT, "tools", "backend-deploy.mjs"));
  const D = await import(join(ROOT, "tools", "ai-deploy-defaults.mjs"));
  // every WRANGLER_* / CLOUDFLARE_* / CF_* variable named in the installed bundle is classified (a new one fails here)
  const all = Object.values(G.ENV_CLASS).flat();
  assert.equal(new Set(all).size, all.length, "no variable is in two classes");
  if (existsSync(G.WRANGLER_BUNDLE)) {
    const src = readFileSync(G.WRANGLER_BUNDLE, "utf8"), found = new Set();
    for (const m of src.matchAll(/["'`]((?:WRANGLER|CLOUDFLARE|CF)_[A-Z0-9_]+)["'`]/g)) found.add(m[1]);
    for (const m of src.matchAll(/process\.env\.((?:WRANGLER|CLOUDFLARE|CF)_[A-Z0-9_]+)/g)) found.add(m[1]);
    const unclassified = [...found].filter(k => !all.includes(k) && !/_HYPERDRIVE_LOCAL_CONNECTION_STRING_$/.test(k));
    assert.deepEqual(unclassified, [], "classify these in tools/lib/cf-guard.mjs ENV_CLASS and docs/DEPLOY.md");
    assert.ok(found.size >= 60);
  }
  for (const k of ["WRANGLER_CI_OVERRIDE_NAME", "WRANGLER_CI_MATCH_TAG", "CLOUDFLARE_ENV"]) assert.ok(G.ENV_CLASS.target.includes(k), k);
  for (const k of ["WRANGLER_API_ENVIRONMENT", "CLOUDFLARE_API_BASE_URL", "CLOUDFLARE_API_ENVIRONMENT", "WRANGLER_AUTH_URL",
    "CLOUDFLARE_COMPLIANCE_REGION"]) assert.ok(G.ENV_CLASS.endpoint.includes(k), k);
  // the child environment is an allow-list
  const shell = { PATH: "/bin", HOME: "/home/x", TERM: "xterm", AWS_SECRET_CANARY: "v", HTTPS_PROXY: "http://proxy", NODE_OPTIONS: "--require x", WRANGLER_HIDE_BANNER: "1",
    CLOUDFLARE_API_TOKEN: "tok", CLOUDFLARE_ACCOUNT_ID: "acc" };
  assert.deepEqual(G.childEnv(shell), { PATH: "/bin", HOME: "/home/x", TERM: "xterm", WRANGLER_HIDE_BANNER: "1" }, "no credentials, proxies, NODE_OPTIONS or unrelated variables");
  assert.deepEqual(Object.keys(G.childEnv(shell, { creds: true })).sort(), ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "HOME", "PATH", "TERM", "WRANGLER_HIDE_BANNER"]);
  assert.equal(G.childEnv({ PATH: "/bin", LQ_WRANGLER_BIN: "/x" }).LQ_WRANGLER_BIN, undefined, "the test fake is only passed in test mode");
  const DANGEROUS = { WRANGLER_CI_OVERRIDE_NAME: "dearday-staging", WRANGLER_CI_MATCH_TAG: "VALUE-CANARY-3", CLOUDFLARE_ENV: "production", WRANGLER_API_ENVIRONMENT: "staging",
    CLOUDFLARE_API_ENVIRONMENT: "staging", CLOUDFLARE_API_BASE_URL: "https://evil.example/client/v4", CF_API_BASE_URL: "https://evil.example", WRANGLER_AUTH_URL: "https://evil.example",
    CLOUDFLARE_COMPLIANCE_REGION: "fedramp_high", WRANGLER_CF_AUTHORIZATION_TOKEN: "VALUE-CANARY-1", WRANGLER_OUTPUT_FILE_PATH: "/tmp/x", WRANGLER_SOME_FUTURE_NAME_OVERRIDE: "aidanex-staging",
    CLOUDFLARE_FUTURE_THING: "VALUE-CANARY-2", WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB: "postgres://x" };
  const sb = sandbox();
  try {
    for (const [k, v] of Object.entries(DANGEROUS)) {
      const env = { ...sb.env, [k]: v };
      assert.throws(() => G.childEnv(env), G.GuardError, k);
      for (const a of ["deploy", "migrate", "off", "on", "bootstrap:close", "tester:revoke", "d1:create", "d1:bind", "rollback", "list", "versions", "whoami", "dry-run"]) {
        const out = [];
        assert.equal(main(a === "rollback" ? [a, MY_D1] : [a], { print: s => out.push(s), env, toml: TOML_WITH_ID }), 3, `${k} ${a}`);
        assert.ok(out.some(l => l.startsWith("REFUSED: " + k + " is set")), `${k} ${a}: the variable is named: ` + out.at(-1));
        assert.ok(!out.join("\n").includes(v), "its value is not printed");
      }
      assert.equal(await D.main(["--apply"], { print: () => {}, env, toml: TOML_WITH_ID }), 3, k + " ai defaults");
      const r = await setup([], ["\r"], { ...sb, env });
      assert.deepEqual([r.code, r.raw], [3, [true, false]], k + " secrets:setup");
      assert.match(r.screen, new RegExp("REFUSED: " + k + " is set"));
    }
    assert.deepEqual(sb.calls(), [], "wrangler was never started with any of them set");
    // what the old behaviour would have done: the real wrangler (and this fake) deploys over the named Worker
    const r = spawnSync(process.execPath, [sb.env.LQ_WRANGLER_BIN, "deploy", "--env", "test", "--name", "lensiq-api-test"], { encoding: "utf8", env: { ...sb.env,
      WRANGLER_CI_OVERRIDE_NAME: "dearday-staging" } });
    assert.equal(r.status, 0);
    assert.equal(sb.calls()[0].effective, "dearday-staging", "the fake models WRANGLER_CI_OVERRIDE_NAME");
  } finally { sb.done(); }
  // a normal run: wrangler sees none of the shell's other variables; credentials only for read-only actions or after confirmation
  const sb2 = sandbox();
  try {
    const noisy = { ...sb2.env, HOME: "/home/x", AWS_SECRET_CANARY: "v", HTTPS_PROXY: "http://proxy", WRANGLER_HIDE_BANNER: "1", CLOUDFLARE_API_TOKEN: "tok" };
    assert.equal(main(["whoami"], { print: () => {}, env: noisy, toml: TOML_WITH_ID }), 0);
    assert.deepEqual(sb2.calls().at(-1).sawEnv.sort(), ["CLOUDFLARE_API_TOKEN", "WRANGLER_HIDE_BANNER"], "read-only: the token is used so whoami shows ITS account");
    assert.equal(main(["off", "--account-confirmed"], { print: () => {}, env: noisy, toml: TOML_WITH_ID }), 0);
    assert.ok(sb2.calls().slice(-2).every(c => c.sawEnv.includes("CLOUDFLARE_API_TOKEN") && !c.sawEnv.includes("HTTPS_PROXY") && !c.sawEnv.includes("AWS_SECRET_CANARY")));
    const clean = { ...sb2.env, AWS_SECRET_CANARY: "v", HTTPS_PROXY: "http://proxy" };
    assert.equal(main(["off"], { print: () => {}, env: clean, toml: TOML_WITH_ID }), 0);
    assert.deepEqual(sb2.calls().at(-1).sawEnv, []);
    const s = await setup(["--only", "TESTER_ACCESS_CODE"], [C.code + "\r"], { ...sb2, env: clean });
    assert.equal(s.code, 0, s.screen);
    assert.ok(sb2.calls().slice(-3).every(c => c.sawEnv.length === 0), "secrets:setup starts wrangler with the allow-listed environment too");
  } finally { sb2.done(); }
});

test("offline: no test, lint step or CI script can start the real wrangler against the account; tools never touch the committed wrangler.toml", async () => {
  const G = await guard();
  const before = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
  // 1. under a test runner the real binary is refused for everything but a dry-run bundle, even when a test forgets the fake
  assert.ok(process.env.NODE_TEST_CONTEXT, "node --test marks its processes");
  const t = G.readTargets(TOML_WITH_ID);
  for (const args of [["whoami"], ["d1", "list", "--json"], ["deploy", "--env", "test", "--name", "lensiq-api-test"], ["secret", "put", "X", "--env", "test"],
    ["d1", "execute", "lensiq-test", "--remote", "--env", "test", "--command", "SELECT 1"], ["deployments", "list", "--env", "test", "--name", "lensiq-api-test", "--json"]]) {
    for (const env of [{ PATH: process.env.PATH }, { PATH: process.env.PATH, NODE_ENV: "test" }, { PATH: process.env.PATH, LQ_WRANGLER_BIN: "/tmp/x" }]) {
      assert.throws(() => G.assertOffline(env, args), G.GuardError, args.join(" "));
      assert.throws(() => G.wrangler(args, { print: () => {}, env, cfg: t, target: "x", capture: true }), G.GuardError, args.join(" "));
    }
  }
  assert.doesNotThrow(() => G.assertOffline({ PATH: "x" }, ["deploy", "--dry-run", "--env", "test"]), "a dry-run bundle contacts nothing");
  const { main } = await import(join(ROOT, "tools", "backend-deploy.mjs"));
  const D = await import(join(ROOT, "tools", "ai-deploy-defaults.mjs"));
  for (const a of ["whoami", "list", "versions", "d1:bind", "off", "migrate", "deploy"]) {
    const out = [];
    assert.equal(main([a], { print: s => out.push(s), env: { PATH: process.env.PATH }, toml: a === "d1:bind" ? TOML : TOML_WITH_ID }), 3, a + " without the fake is refused in a test");
    assert.ok(out.some(l => /REFUSED/.test(l)), a);
  }
  assert.equal(await D.main(["--apply"], { print: () => {}, env: { PATH: process.env.PATH }, toml: TOML_WITH_ID }), 3);
  const r = await setup([], ["\r"], { env: { PATH: process.env.PATH } });
  assert.equal(r.code, 3, "secrets:setup without the fake is refused in a test: " + r.screen.slice(-200));
  // 2. the tests themselves: every tool call in this file is given a config text or a temp copy, and a fake wrangler
  const self = readFileSync(__filename, "utf8");
  const calls = self.split("\n").filter(l => /\b(main|D\.main)\(\[/.test(l) && !/site-config|--base|"--api-base"|"--clear"/.test(l));
  assert.ok(calls.length >= 8, "the scan sees the tool calls: " + calls.length);
  assert.match(self, /const code = main\(argv, \{ print: s => out\.push\(s\), env, tomlPath \}\)/, "the deploy-tool tests run on a temp copy");
  for (const l of calls) assert.ok(/toml: |tomlPath|run\(\[|file[,:]/.test(l) || /const run = /.test(l), "a tool is called with the live wrangler.toml: " + l.trim().slice(0, 120));
  assert.doesNotMatch(self.replace(/TOML_LIVE = readFileSync[^\n]*/, ""), /writeFileSync\(join\(ROOT, "backend", "wrangler\.toml"\)/, "no test writes the committed file");
  // 3. CI and the npm scripts CI runs: the only wrangler command is the dry-run bundle
  const wf = readdirSync(join(ROOT, ".github", "workflows")).map(f => readFileSync(join(ROOT, ".github", "workflows", f), "utf8")).join("\n");
  const runs = wf.split("\n").filter(l => /wrangler\s+[a-z]/.test(l) && !/^\s*#/.test(l) && !/name:/.test(l));
  assert.ok(runs.length >= 1 && runs.every(l => /wrangler deploy --dry-run/.test(l)), "workflow wrangler commands: " + runs.join(" | "));
  assert.doesNotMatch(wf, /backend:(deploy|migrate|off|on|d1|list|versions|whoami|rollback|bootstrap|tester)|secrets:setup|ai:deploy-defaults|CLOUDFLARE_API_TOKEN/,
    "no deploy script or Cloudflare credential in CI");
  const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
  for (const k of ["test", "test:unit", "test:backend", "test:integration", "lint", "typecheck", "format:check", "check:legal", "csp:check", "pretest:e2e"]) {
    assert.doesNotMatch(String(scripts[k] || ""), /wrangler|backend-deploy|secrets-setup|ai-deploy-defaults/, "npm run " + k);
  }
  // 4. nothing above changed the committed configuration
  assert.equal(readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8"), before);
});

// ---- B2: secrets:setup ----------------------------------------------------------------------------------------------

/** Drives tools/secrets-setup.mjs with a fake terminal: each answer is typed when the script shows a prompt.
 *  o.stray: text "typed" while wrangler runs (when a COMMAND line appears). o.onPrompt(n, proc): hook at the n-th prompt. */
async function setup(argv, answers, sb, o = {}) {
  const { main } = await import(join(ROOT, "tools", "secrets-setup.mjs"));
  const { EventEmitter } = require("node:events");
  const stdin = new PassThrough();
  const raw = [];
  stdin.isTTY = o.tty !== false; stdin.setRawMode = v => { raw.push(v); };
  const proc = new EventEmitter(); const exits = [];
  proc.exit = c => { exits.push(c); };
  let screen = "", prompts = 0;
  const queue = answers.slice();
  const stdout = { isTTY: o.tty !== false, write: s => {
    screen += String(s);
    if (o.stray && /<value on stdin>/.test(String(s))) stdin.emit("data", Buffer.from(o.stray));
    if (/: $/.test(String(s))) {
      prompts++;
      if (o.onPrompt) o.onPrompt(prompts, proc);
      if (queue.length) { const a = queue.shift(); setImmediate(() => stdin.write(a)); }
    }
    return true;
  } };
  let errText = "";
  const code = await main(argv, { stdin, stdout, stderr: { write: s => { errText += s; } }, env: sb.env, toml: o.toml === undefined ? TOML_WITH_ID : o.toml, random: o.random, proc });
  const listeners = ["SIGINT", "SIGTERM", "SIGHUP"].map(s => proc.listenerCount(s));
  return { code, screen, errText, left: queue.length, raw, exits, listeners, dataListeners: stdin.listenerCount("data") };
}
const C = { ts: "TURNSTILE-CANARY-0x4AAAAAAA-secret-value", or: "sk-or-v1-OPENROUTER-CANARY-abcdef0123456789", code: "Mango-CANARY-river-2026-xyz",
  hook: "https://hooks.example/CANARY-WEBHOOK-PATH" };
const fixedRandom = () => { let i = 0; return n => Buffer.alloc(n, ++i); }; // 1st call: KEK bytes 0x01…, 2nd: bootstrap bytes 0x02…

test("B2 secrets:setup: values go to wrangler's stdin only (`secret put --env test` = Worker lensiq-api-test); nothing is echoed, printed or written; the bootstrap token is shown " +
  "once", async () => {
  const sb = sandbox();
  try {
    const kek = Buffer.alloc(32, 1).toString("base64"), boot = Buffer.alloc(32, 2).toString("base64url");
    const r = await setup([], ["\r", "\r", "\r", C.ts + "\r", C.or + "\r", C.code + "\r", C.hook + "\r", "s\r", "\r", "\r", "\r"], sb, { random: fixedRandom(), stray: "STRAY-TYPED-CANARY\r" });
    assert.equal(r.code, 0, r.screen);
    assert.equal(r.left, 0, "every prompt was answered");
    const calls = sb.calls();
    assert.deepEqual(calls.slice(0, 2).map(c => c.argv), [["deployments", "list", "--env", "test", "--name", "lensiq-api-test", "--json"], ["secret", "list", "--env", "test", "--format", "json"]],
      "first: is the Worker deployed (read-only), then the secret names");
    const puts = sb.writes();
    assert.deepEqual(puts.map(c => c.argv), ["SECRETS_KEK", "ADMIN_BOOTSTRAP_TOKEN", "TURNSTILE_SECRET", "OPENROUTER_API_KEY", "TESTER_ACCESS_CODE", "ALERT_WEBHOOK_URL"]
      .map(n => ["secret", "put", n, "--env", "test"]), "HEALTH_TOKEN, OPENFDA_API_KEY and the two LINE values were skipped");
    assert.ok(calls.every(c => c.effective === "lensiq-api-test" && !c.draft), "every call resolved to lensiq-api-test; no draft Worker");
    assert.deepEqual(puts.map(c => c.stdinSha), [kek, boot, C.ts, C.or, C.code, C.hook].map(sha), "wrangler's stdin received exactly each value (stray typing between prompts is not part of any)");
    // the target is printed before the first command
    assert.ok(r.screen.indexOf('TARGET   Worker "lensiq-api-test"') >= 0 && r.screen.indexOf("TARGET") < r.screen.indexOf("COMMAND"));
    assert.match(r.screen, /npx wrangler secret put TURNSTILE_SECRET --env test\) {3}-> Worker "lensiq-api-test"/);
    // nothing typed or generated is on the screen, in argv, in the environment or in a file …
    const everything = r.screen + r.errText + JSON.stringify(calls.map(c => c.argv)) + JSON.stringify(sb.env);
    for (const v of [C.ts, C.or, C.code, C.hook, "CANARY", kek]) assert.ok(!everything.includes(v), "leaked: " + v.slice(0, 12));
    for (const f of readdirSync(sb.dir)) { const t = readFileSync(join(sb.dir, f), "utf8"); for (const v of [C.ts, C.or, C.code, C.hook, kek, boot]) assert.ok(!t.includes(v),
      `value in file ${f}`); }
    assert.ok(!r.screen.includes("echo:"), "wrangler's own output (which echoed the input) is never relayed");
    // … except the bootstrap token: once, then the lines are erased, with an honest note about scroll-back
    assert.equal(r.screen.split(boot).length - 1, 1, "bootstrap token shown exactly once");
    assert.ok(r.screen.indexOf("\x1b[2K", r.screen.indexOf(boot)) > 0, "erased after Enter");
    assert.match(r.screen, /scroll-back, tmux or a screen recording may still hold it\. Clear the terminal[\s\S]*replaced by a random value right after the owner account is created/);
    assert.match(r.screen, /Required now: SECRETS_KEK, ADMIN_BOOTSTRAP_TOKEN, TURNSTILE_SECRET, OPENROUTER_API_KEY, TESTER_ACCESS_CODE/);
    assert.match(r.screen, /Later \/ optional: ALERT_WEBHOOK_URL, HEALTH_TOKEN, OPENFDA_API_KEY, LINE_CHANNEL_ACCESS_TOKEN, LEAD_NOTIFY_LINE_TO/);
    for (const n of ["SECRETS_KEK", "TURNSTILE_SECRET", "OPENROUTER_API_KEY", "TESTER_ACCESS_CODE"]) assert.match(r.screen, new RegExp(`  ${n}: set\\n`));
    assert.match(r.screen, /HEALTH_TOKEN: skipped/);
    // echo stays off for the whole session and the terminal is restored at the end
    assert.deepEqual(r.raw, [true, false], "raw mode: on once at the start, off once at the end (never in between)");
    assert.deepEqual([r.listeners, r.dataListeners], [[0, 0, 0], 0], "signal handlers and the input listener are removed");
  } finally { sb.done(); }
});

test("B2 secrets:setup: the terminal is restored on SIGTERM / SIGHUP / SIGINT and on Ctrl-C typed while wrangler runs", async () => {
  for (const [sig, code] of [["SIGTERM", 143], ["SIGHUP", 129], ["SIGINT", 130]]) {
    const sb = sandbox();
    try {
      const r = await setup([], ["\r"], sb, { onPrompt: (n, proc) => { if (n === 2) setImmediate(() => proc.emit(sig)); } });
      assert.deepEqual([r.raw, r.exits], [[true, false], [code]], sig + ": raw mode off, process told to exit");
      assert.equal(sb.writes().length, 1, sig + ": nothing more was sent after the signal");
      assert.deepEqual(r.listeners, [0, 0, 0]);
    } finally { sb.done(); }
  }
  const sb = sandbox();
  try {
    // Ctrl-C arrives while the first `secret put` is running (no prompt is waiting): it is not lost
    const r = await setup([], ["\r", "\r", C.ts + "\r"], sb, { stray: "\x03" });
    assert.equal(r.code, 130);
    assert.match(r.screen, /Stopped\. Nothing more was sent/);
    assert.equal(sb.writes().length, 1);
    assert.deepEqual(r.raw, [true, false]);
  } finally { sb.done(); }
});

test("B2 secrets:setup: refuses without a terminal, in CI, for a foreign Worker name, with a stray token, and when the Worker is not deployed", async () => {
  const sb = sandbox();
  try {
    // a real child process with piped stdio = no TTY (how an agent or a log capture would run it)
    const p = spawnSync(process.execPath, [join(ROOT, "tools", "secrets-setup.mjs")], { input: C.code + "\n", encoding: "utf8", env: sb.env });
    assert.equal(p.status, 2);
    assert.match(p.stderr, /needs a real terminal/);
    assert.ok(!(p.stdout + p.stderr).includes(C.code));
    let r = await setup([], [], sb, { tty: false });
    assert.deepEqual([r.code, r.raw], [2, []]);
    r = await setup([], [], { ...sb, env: { ...sb.env, CI: "true" } });
    assert.equal(r.code, 2);
    for (const bad of ["dearday-staging", "aidanex-staging", "aidanex-pet-clinic-pilot"]) {
      r = await setup([], [C.ts + "\r"], sb, { toml: TOML_WITH_ID.replace('name = "lensiq-api-test"', `name = "${bad}"`) });
      assert.equal(r.code, 3, bad);
      assert.match(r.screen, new RegExp(`TARGET   Worker "${bad}"[\\s\\S]*REFUSED`));
      assert.deepEqual(r.raw, [true, false], "the terminal is restored after a refusal too");
    }
    r = await setup([], [C.ts + "\r"], { ...sb, env: { ...sb.env, CLOUDFLARE_API_TOKEN: "TOKEN-CANARY" } });
    assert.equal(r.code, 3);
    assert.match(r.screen, /WARNING {2}CLOUDFLARE_API_TOKEN is set[\s\S]*--account-confirmed/);
    assert.ok(!r.screen.includes("CANARY"));
    assert.deepEqual(sb.calls(), [], "wrangler was never started");
    const nd = sandbox("nodeploy");
    try {
      r = await setup([], [C.ts + "\r"], nd);
      assert.equal(r.code, 1);
      assert.match(r.screen, /STOP: Worker "lensiq-api-test" is not deployed[\s\S]*never written to a Worker that does not exist/);
      assert.deepEqual(nd.calls().map(c => c.argv[0]), ["deployments"], "only the read-only check ran: no secret put, so no draft Worker");
    } finally { nd.done(); }
  } finally { sb.done(); }
});

test("B2 secrets:setup: skip, too-short and weak tester codes, Ctrl-C, an existing KEK, a failing put, --only and --dry-run", async () => {
  const { weakCode } = await import(join(ROOT, "tools", "secrets-setup.mjs"));
  for (const weak of ["short", "aaaaaaaaaaaaaaaaaaaa", "1234567890123456", "abcdefghijklmnop", "zyxwvutsrqponmlk", "MyPassword-2026-xx!", "lensiq-tester-2026-11", "abababababababababab",
    "xy12xy12xy12xy12xy12", "q1w2q1w2q1w2q1w2"]) assert.notEqual(weakCode(weak), "", "weak: " + weak);
  for (const fine of [C.code, "Mango-river-2026-quartz", "kT9#vLp2@xQz7!mR", "ร้านยา-สาขา-บางรัก-7391"]) assert.equal(weakCode(fine), "", "fine: " + fine);
  assert.ok(!weakCode("1234567890123456").includes("1234567"), "the reason never quotes the value");
  // existing KEK is kept; Enter skips; short and weak tester codes are refused with the reason; Ctrl-C stops
  let sb = sandbox("haskek");
  try {
    const r = await setup([], ["s\r", "\r", "\r", "short\r", "1234567890123456\r", "\x03"], sb);
    assert.equal(r.code, 130);
    assert.match(r.screen, /kept: SECRETS_KEK already exists and is never replaced/);
    assert.match(r.screen, /TURNSTILE_SECRET: skipped/);
    assert.match(r.screen, /OPENROUTER_API_KEY: skipped/);
    assert.match(r.screen, /TESTER_ACCESS_CODE — [^\n]*at least 16 characters[^\n]*no common word/);
    assert.match(r.screen, /too short: at least 16 characters/);
    assert.match(r.screen, /too easy to guess: it contains a run of consecutive characters/);
    assert.match(r.screen, /Stopped\. Nothing more was sent/);
    assert.deepEqual(sb.writes(), [], "nothing was sent");
  } finally { sb.done(); }
  // a failing put reports the exit code only
  sb = sandbox("fail:TESTER_ACCESS_CODE");
  try {
    const r = await setup(["--only", "TESTER_ACCESS_CODE"], [C.code + "\r"], sb);
    assert.equal(r.code, 1);
    assert.match(r.screen, /TESTER_ACCESS_CODE: FAILED \(exit 1\)/);
    assert.ok(!r.screen.includes("CANARY") && !r.screen.includes("echo:"));
    assert.deepEqual(sb.writes().map(c => c.argv.join(" ")), ["secret put TESTER_ACCESS_CODE --env test"], "--only asks for that one secret");
  } finally { sb.done(); }
  // rotation: --only sends the new value; an unusual key format needs a yes
  sb = sandbox();
  try {
    let r = await setup(["--only", "OPENROUTER_API_KEY"], ["not-the-usual-prefix-CANARY-123456\r", "n\r", "\r"], sb);
    assert.match(r.screen, /does not look like the usual format/);
    assert.match(r.screen, /OPENROUTER_API_KEY: skipped/);
    assert.deepEqual(sb.writes(), []);
    const before = sb.calls().length;
    r = await setup(["--dry-run"], ["\r", "\r", C.ts + "\r", C.or + "\r", C.code + "\r", "\r", "s\r", "\r", "\r", "\r"], sb);
    assert.equal(r.code, 0, r.screen);
    assert.match(r.screen, /TESTER_ACCESS_CODE: would be set \(dry run, nothing sent\)/);
    assert.equal(sb.calls().length, before, "a dry run starts wrangler not even once");
    assert.ok(!r.screen.includes("CANARY"));
    // arrow keys / paste marks typed into a hidden prompt are not part of the value; Backspace removes one character
    r = await setup(["--only", "TESTER_ACCESS_CODE"], ["\x1b[200~abc\x1b[Dxq7-KEYS-river-9274X\x7f\x1b[201~\r"], sb);
    assert.equal(r.code, 0, r.screen);
    assert.equal(sb.calls().at(-1).stdinSha, sha("abcxq7-KEYS-river-9274"));
    assert.ok(!r.screen.includes("KEYS"));
    r = await setup(["--only", "NOT_A_SECRET"], [], sb);
    assert.equal(r.code, 2);
  } finally { sb.done(); }
});

// ---- B5: AI deploy defaults -----------------------------------------------------------------------------------------

test("B5 ai:deploy-defaults: all OFF, router chains Haiku then Luna, budgets 5 / 3 / 2, limits, image mode for testers; the repo defaults are untouched", async () => {
  const D = await import(join(ROOT, "tools", "ai-deploy-defaults.mjs"));
  const { gateway, ai } = await D.buildRows();
  assert.equal(gateway.enabled, false);
  assert.equal(ai.enabled, false, "fortune AI off (it is not gated by the global switch)");
  assert.equal(gateway.legacyKeyStore, false);
  assert.deepEqual(Object.entries(gateway.providers).filter(([, v]) => v).map(([k]) => k), ["openrouter"], "only the provider that has a key is allowed");
  const f = gateway.features;
  assert.deepEqual(Object.keys(f).sort(), ["pc_claims", "pc_fields", "pc_translate"]);
  for (const id of Object.keys(f)) assert.equal(f[id].enabled, false, id + " off");
  for (const id of ["pc_fields", "pc_translate"]) {
    assert.deepEqual(f[id].chain, [{ provider: "openrouter", model: "anthropic/claude-haiku-5.5", effort: "low" }, { provider: "openrouter", model: "openai/gpt-6-luna" }], id);
    assert.deepEqual([f[id].perUserDaily, f[id].perUserPerMinute, f[id].globalPerMinute], [20, 3, 20], id);
  }
  assert.deepEqual([f.pc_fields.monthlyBudgetUsd, f.pc_translate.monthlyBudgetUsd, f.pc_claims.monthlyBudgetUsd], [5, 3, 2]);
  assert.equal(Object.values(f).reduce((s, x) => s + x.monthlyBudgetUsd, 0), 10, "10 USD a month in total");
  assert.deepEqual([f.pc_fields.imageModeAllowed, f.pc_translate.imageModeAllowed, f.pc_claims.imageModeAllowed], [true, false, false]);
  assert.ok(f.pc_claims.chain.every(c => c.provider === "openrouter"));
  // Qwen and DeepSeek are out of the default order; GLM is the named Chinese option; all three stay selectable
  const inChains = JSON.stringify(Object.values(f).map(x => x.chain));
  assert.doesNotMatch(inChains, /qwen|deepseek|glm/i);
  assert.deepEqual(D.OPTIONAL_MODELS.map(m => m.model), ["qwen/qwen3.8-27b", "deepseek/deepseek-v4.1-flash", "z-ai/glm-5.3-flash"]);
  assert.match(D.OPTIONAL_MODELS[0].note + D.OPTIONAL_MODELS[1].note, /median[\s\S]*1,500-token/);
  assert.match(D.OPTIONAL_MODELS[2].note, /Chinese/);
  const { priceAt } = await import(join(ROOT, "backend", "src", "ai", "adapters", "prices.js"));
  for (const m of D.OPTIONAL_MODELS) assert.ok(priceAt("openrouter", m.model, "2026-11-10"), "selectable in admin (priced): " + m.model);
  const { PROVIDERS, DEFAULT_CHAINS } = await import(join(ROOT, "backend", "src", "ai", "adapters", "index.js"));
  for (const l of ["th", "en", "zh"]) assert.match(PROVIDERS.openrouter.note[l], /Qwen 3\.8[\s\S]*DeepSeek[\s\S]*1,500[\s\S]*GLM 5\.3/, "admin note " + l);
  // every default-chain model has a pinned serving provider (so the consent screen can name it)
  const { ROUTES } = await import(join(ROOT, "backend", "src", "ai", "adapters", "openrouter.js"));
  for (const x of Object.values(f)) for (const c of x.chain) assert.ok(ROUTES[c.model], "pinned: " + c.model);
  // separate artefact: the repo defaults still start with the direct no-training provider, budget 0, image mode off
  assert.equal(DEFAULT_CHAINS.pc_fields[0].provider, "anthropic");
  const { DEFAULT_GATEWAY } = await import(join(ROOT, "backend", "src", "ai", "settings.js"));
  assert.deepEqual([DEFAULT_GATEWAY.features.pc_fields.monthlyBudgetUsd, DEFAULT_GATEWAY.features.pc_fields.imageModeAllowed, DEFAULT_GATEWAY.providers.anthropic], [0, false, true]);
});

test("B5 ai:deploy-defaults: one INSERT that never overwrites, accepted by a real database; dry run by default; guarded target", async () => {
  const D = await import(join(ROOT, "tools", "ai-deploy-defaults.mjs"));
  const rows = await D.buildRows();
  const sql = D.deploySql(rows, 1700000000);
  assert.match(sql, /^INSERT INTO settings \(key, value, updated_at\) VALUES \('ai_gateway', '.*', 1700000000\), \('ai', '.*', 1700000000\) ON CONFLICT \(key\) DO NOTHING;$/);
  assert.equal(sql.split(";").filter(Boolean).length, 1, "one statement");
  assert.doesNotMatch(sql, /sk-|secret|password|api_key|bearer|tester/i, "settings only: no key, code or secret name");
  // applied to a fresh database: the gateway reads back exactly the deploy defaults, everything off
  const env = createEnv();
  await env.DB.exec(sql);
  const { getGateway } = await import(join(ROOT, "backend", "src", "ai", "settings.js"));
  const gw = await getGateway(env.DB);
  assert.deepEqual([gw.enabled, gw.features.pc_fields.enabled, gw.features.pc_fields.monthlyBudgetUsd, gw.features.fortune_reword.enabled], [false, false, 5, false]);
  // the owner's later choice is never overwritten by a second run
  const { putGateway } = await import(join(ROOT, "backend", "src", "ai", "settings.js"));
  await putGateway(env.DB, { enabled: true, features: { pc_fields: { enabled: true, monthlyBudgetUsd: 1 } } });
  await env.DB.exec(D.deploySql(rows));
  const gw2 = await getGateway(env.DB);
  assert.deepEqual([gw2.enabled, gw2.features.pc_fields.enabled, gw2.features.pc_fields.monthlyBudgetUsd], [true, true, 1]);
  const sb = sandbox();
  try {
    const out = [];
    assert.equal(await D.main([], { print: s => out.push(s), env: sb.env, toml: TOML }), 0);
    assert.ok(out.some(l => /^TARGET {3}D1 database "lensiq-test"/.test(l)) && out.some(l => /npx wrangler d1 execute lensiq-test --remote --env test/.test(l)) &&
      out.some(l => /Dry run: nothing was sent/.test(l)));
    assert.deepEqual(sb.calls(), [], "the default is a dry run");
    assert.equal(await D.main(["--apply"], { print: () => {}, env: sb.env, toml: TOML.replace('database_name = "lensiq-test"', 'database_name = "aidanex-db"') }), 3);
    assert.equal(await D.main(["--apply"], { print: () => {}, env: { ...sb.env, CI: "1" }, toml: TOML }), 3);
    assert.deepEqual(sb.calls(), []);
    assert.equal(await D.main(["--apply"], { print: () => {}, env: sb.env, toml: TOML_WITH_ID }), 0);
    assert.deepEqual(sb.calls().map(c => c.argv.slice(0, 7).join(" ")), ["d1 list --json", "d1 execute lensiq-test --remote --env test --json", "d1 execute lensiq-test --remote --env test --yes"],
      "the database id is checked and the current settings are read (both read-only) before the one write");
    // when the owner's settings already exist: nothing is written, and the tool says so and shows what is stored
    const hr = sandbox("hasrows");
    try {
      const out = [];
      assert.equal(await D.main(["--apply"], { print: l => out.push(l), env: hr.env, toml: TOML_WITH_ID }), 0);
      const text = out.join("\n");
      assert.match(text, /EXISTING SETTINGS KEPT, NOTHING WRITTEN/);
      assert.match(text, /global AI switch: ON · fortune AI: off · providers allowed: openrouter/);
      assert.match(text, /pc_fields: ON · m-owner-choice · 1 USD\/month/);
      assert.doesNotMatch(text, /WRITTEN: the all-OFF settings/);
      assert.ok(hr.calls().every(c => c.argv[1] === "list" || c.argv.includes("--json")), "only read-only commands ran");
    } finally { hr.done(); }
    assert.deepEqual(D.parseRows("no json here"), null);
    assert.deepEqual(D.parseRows('[{"results":[],"success":true}]'), {});
  } finally { sb.done(); }
});

// ---- B1: per-page public-site config --------------------------------------------------------------------------------

test("B1 site config: the committed file is inactive or exactly the approved closed test; an active one changes the listed page only (config script + CSP), nothing else", async () => {
  const S = await import(join(ROOT, "tools", "build-site.mjs"));
  const { policy, metaPolicy, normalizePolicy } = await import(join(ROOT, "tools", "csp-meta.mjs"));
  // The committed file is either inactive, or exactly the closed test the owner approved (decision D0, 2026-11-11): the
  // Worker recorded in deploy/created.json, the Turnstile site key recorded there, medicine.html only, analytics and
  // member sign-in off, tester gate on. Nothing else may be committed. 2026-11-12 (explicit owner decision): index.html
  // joins it so that the quote-request form can reach /v1/leads with Turnstile.
  const committed = JSON.parse(readFileSync(join(ROOT, "deploy", "public-site.json"), "utf8"));
  const made = JSON.parse(readFileSync(join(ROOT, "deploy", "created.json"), "utf8"));
  assert.deepEqual([committed.pages, committed.analytics, committed.member, committed.testerGate], [["medicine.html", "index.html"], false, false, true]);
  if (committed.apiBase === "") assert.equal(S.readSiteConfig(), null, "inactive: the site is built exactly as before");
  else {
    assert.equal(committed.apiBase, made.worker.url, "only LENSIQ's own test Worker");
    assert.match(committed.apiBase, /^https:\/\/lensiq-api-test\.[a-z0-9-]+\.workers\.dev$/);
    assert.equal(committed.turnstileSiteKey, made.turnstile_widget.site_key, "the site key of the widget the owner created");
    assert.ok(S.isTurnstileSiteKey(committed.turnstileSiteKey));
    assert.deepEqual(S.readSiteConfig(), { apiBase: made.worker.url, turnstileSiteKey: made.turnstile_widget.site_key, pages: ["medicine.html", "index.html"], analytics: false,
      member: false, testerGate: true });
  }
  assert.match(readFileSync(join(ROOT, "lensiq-config.js"), "utf8"), /^window\.LENSIQ_API_BASE = window\.LENSIQ_API_BASE \|\| "";$/m, "the repo default stays empty");
  const dir = mkdtempSync(join(tmpdir(), "lq-site-test-"));
  try {
    const cfgFile = join(dir, "public-site.json");
    const write = j => { writeFileSync(cfgFile, JSON.stringify(j)); return cfgFile; };
    const good = { apiBase: "https://lensiq-api-test.example-sub.workers.dev", turnstileSiteKey: "0x4AAAAAAADnPIDROrmt1Wwj", pages: ["medicine.html"], analytics: false, member: false,
      testerGate: true };
    for (const bad of [{ ...good, apiBase: "http://lensiq-api-test.x.workers.dev" }, { ...good, apiBase: "https://u:p@x.workers.dev" }, { ...good, apiBase: "https://x.workers.dev/path" },
      { ...good, apiBase: "javascript:alert(1)" }, { ...good, pages: ["admin.html"] }, { ...good, pages: ["pricing.html"] }, { ...good, pages: ["../x.html"] }, { ...good, pages: [] },
      { ...good, turnstileSiteKey: "<script>" }, { ...good, analytics: "yes" }, { ...good, extra: 1 }]) assert.throws(() => S.readSiteConfig(write(bad)), /public-site\.json/,
        JSON.stringify(bad).slice(0, 80));
    assert.equal(S.readSiteConfig(write({ ...good, apiBase: "" })), null);
    assert.equal(S.readSiteConfig(join(dir, "missing.json")), null);
    const cfg = S.readSiteConfig(write(good));
    // a small site: the page in scope and two that are not
    const out = join(dir, "site");
    mkdirSync(out);
    for (const p of ["medicine.html", "index.html", "fortune.html", "lensiq-config.js"]) cpSync(join(ROOT, p), join(out, p));
    assert.deepEqual(await S.applySiteConfig(out, null), [], "inactive: nothing is written");
    assert.ok(!existsSync(join(out, S.SITE_CONFIG_JS)));
    assert.deepEqual(await S.applySiteConfig(out, cfg), ["medicine.html"]);
    for (const p of ["index.html", "fortune.html", "lensiq-config.js"]) assert.equal(readFileSync(join(out, p), "utf8"), readFileSync(join(ROOT, p), "utf8"), p + " is byte-identical");
    const med = readFileSync(join(out, "medicine.html"), "utf8");
    assert.equal(metaPolicy(med), normalizePolicy(policy({ connect: [good.apiBase], turnstile: true })), "CSP = Worker origin + Turnstile");
    assert.match(metaPolicy(med), /connect-src 'self' data: blob: https:\/\/lensiq-api-test\.example-sub\.workers\.dev https:\/\/challenges\.cloudflare\.com;/);
    assert.match(metaPolicy(readFileSync(join(out, "index.html"), "utf8")), /connect-src 'self' data: blob:;/);
    assert.match(med, /<script src="lensiq-site-config\.js\?v=[0-9a-f]{10}"><\/script>\n<script src="lensiq-config\.js/, "loaded just before lensiq-config.js, same origin");
    assert.equal(med.replace(/<script src="lensiq-site-config[^\n]*\n/, "").replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ""),
      readFileSync(join(ROOT, "medicine.html"), "utf8").replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ""), "nothing else on the page changes");
    const js = readFileSync(join(out, S.SITE_CONFIG_JS), "utf8");
    // run the generated script, then the repo's lensiq-config.js defaults keep what it set
    const w = {};
    new Function("window", js)(w);
    assert.deepEqual(w, { LENSIQ_API_BASE: good.apiBase, LENSIQ_TURNSTILE_SITEKEY: good.turnstileSiteKey, LENSIQ_ANALYTICS: false, LENSIQ_MEMBER: false, LENSIQ_TESTER_GATE: true });
    assert.match(readFileSync(join(ROOT, "lensiq-config.js"), "utf8"), /LENSIQ_MEMBER !== false && !\/\\\/admin\\\.html\$\/\.test\(location\.pathname\)\) load\("lensiq-member\.js"/,
      "member sign-in is not loaded when the config says so");
    assert.equal(S.forbiddenReason(S.SITE_CONFIG_JS), null);
    // the setter tool only accepts LENSIQ's own test Worker
    const { main } = await import(join(ROOT, "tools", "site-config.mjs"));
    const file = join(dir, "set.json");
    for (const base of ["https://dearday-staging.x.workers.dev", "https://aidanex-staging.x.workers.dev", "https://lensiq-api-test.x.workers.dev/path", "http://lensiq-api-test.x.workers.dev",
      "https://evil.example"]) {
      assert.equal(main(["--api-base", base, "--sitekey", "0x4AAAAAAADnPIDROrmt1Wwj"], { file, print: () => {} }), 3, base);
    }
    assert.ok(!existsSync(file));
    assert.equal(main(["--api-base", "https://lensiq-api-test.my-sub.workers.dev", "--sitekey", "0x4AAAAAAADnPIDROrmt1Wwj"], { file, print: () => {} }), 0);
    assert.deepEqual(S.readSiteConfig(file).pages, ["medicine.html", "index.html"]);
    assert.equal(S.readSiteConfig(file).analytics, false);
    // the site key is PUBLISHED: only the site-key shape passes, never a secret-shaped value
    for (const secret of ["0x4AAAAAAADnPIDROrmt1Wwj1234567890A", "1x0000000000000000000000000000000AA", "sk-or-v1-0123456789abcdef0123", "TURNSTILE-SECRET-VALUE", "0x4short", "x".repeat(24)]) {
      const out = [];
      assert.equal(main(["--api-base", "https://lensiq-api-test.my-sub.workers.dev", "--sitekey", secret], { file: join(dir, "no.json"), print: s => out.push(s) }), 3, secret);
      assert.ok(!out.join("\n").includes(secret), "the refused value is not printed back");
      assert.equal(S.isTurnstileSiteKey(secret), false);
      assert.throws(() => S.readSiteConfig(write({ ...good, turnstileSiteKey: secret })), /not a Turnstile SITE key/);
    }
    assert.ok(!existsSync(join(dir, "no.json")));
    for (const ok of ["0x4AAAAAAADnPIDROrmt1Wwj", "1x00000000000000000000AA", "2x00000000000000000000AB", "3x00000000000000000000FF"]) assert.equal(S.isTurnstileSiteKey(ok), true, ok);
    assert.equal(main(["--clear"], { file, print: () => {} }), 0);
    assert.equal(S.readSiteConfig(file), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- B9: smoke check ------------------------------------------------------------------------------------------------

test("B9 smoke: read-only, no code and no data sent; passes on a correctly closed Worker, on the kill switch, and fails when the gate is open", async () => {
  const { smoke, checkBase, main } = await import(join(ROOT, "tools", "backend-smoke.mjs"));
  const { handle } = await import(join(ROOT, "backend", "src", "index.js"));
  const SITE = "https://anirut77.github.io", BASE = "https://lensiq-api-test.my-sub.workers.dev";
  // the vars of [env.test] exactly as the deployed Worker gets them, plus the secrets
  const envOf = v => createEnv({ ...readTargetsSync().vars, ALLOWED_ORIGINS: SITE, TURNSTILE_SECRET: "ts", TESTER_ACCESS_CODE: "Mango-river-2026-quartz-1", ...v });
  const sent = [];
  const via = env => async (url, init = {}) => {
    sent.push({ url: String(url), method: init.method || "GET", headers: init.headers || {}, body: init.body || "" });
    const orig = console.log; console.log = () => {};
    try { return await handle(new Request(url, { method: init.method, headers: init.headers, body: init.body }), env); } finally { console.log = orig; }
  };
  let r = await smoke(BASE, { fetch: via(envOf()) });
  assert.equal(r.ok, true, JSON.stringify(r.results.filter(x => !x.ok)));
  assert.ok(r.results.length >= 22);
  for (const id of ["pc_fields", "pc_translate", "pc_claims"]) assert.ok(r.results.some(x => x.name.includes(id) && x.name.includes("tester code required")));
  // what the script sent: no tester code, no token, no text, no image; only GET / OPTIONS / empty POST
  for (const s of sent) {
    assert.ok(!Object.keys(s.headers).some(k => /tester|authorization|turnstile|cookie/i.test(k)), "header sent: " + Object.keys(s.headers));
    assert.ok(s.body === "" || s.body === "{}", "body sent: " + s.body);
    assert.ok(!s.url.includes("?") || /\?feature=pc_[a-z]+$/.test(s.url), s.url);
  }
  r = await smoke(BASE, { fetch: via(envOf({ SERVICE_OFF: "1" })), expectOff: true });
  assert.equal(r.ok, true, JSON.stringify(r.results.filter(x => !x.ok)));
  assert.equal(r.off, true);
  r = await smoke(BASE, { fetch: via(envOf({ SERVICE_OFF: "1" })) });
  assert.equal(r.ok, false, "an unexpected kill switch is reported");
  r = await smoke(BASE, { fetch: via(envOf({ PUBLIC_ROUTES: "" })) });
  assert.equal(r.ok, false, "an open analytics / leads / billing route is reported");
  assert.ok(r.results.some(x => !x.ok && /\/v1\/events is not enabled/.test(x.name)) && r.results.some(x => !x.ok && /config: analytics off/.test(x.name)));
  r = await smoke(BASE, { fetch: via(envOf({ TESTER_GATE: "" })) });
  assert.equal(r.ok, false, "an open gate is reported");
  assert.ok(r.results.some(x => !x.ok && /testing-only source thfda/.test(x.name)));
  r = await smoke(BASE, { fetch: via(envOf({ ALLOWED_ORIGINS: "https://other.example" })) });
  assert.equal(r.ok, false, "missing CORS for the Pages origin is reported");
  // only LENSIQ's own Worker (or a local dev server) is ever contacted
  for (const b of ["https://dearday-staging.x.workers.dev", "https://aidanex-staging.x.workers.dev", "https://faksak.com", "https://tripsdna.com", "http://lensiq-api-test.x.workers.dev",
    "nonsense", ""]) assert.equal(checkBase(b), null, b);
  assert.ok(checkBase(BASE) && checkBase("http://localhost:8787").local);
  const n = sent.length;
  assert.equal(await main(["--base", "https://dearday-staging.x.workers.dev"], { print: () => {}, fetch: via(envOf()) }), 2);
  assert.equal(await main(["--base", BASE], { print: () => {}, env: { CI: "true" }, fetch: via(envOf()) }), 3);
  assert.equal(sent.length, n, "nothing was requested");
  const out = [];
  assert.equal(await main(["--base", BASE], { print: s => out.push(s), env: {}, fetch: via(envOf()) }), 0);
  assert.ok(!out.join("\n").includes("Mango-river-2026-quartz-1"));
});

// ---- page: tester access + consent texts ----------------------------------------------------------------------------

test("page: tester texts and the tester privacy note are complete in TH / EN / ZH; no gate = no header and unlocked", () => {
  const T = require("../../lensiq-tester.js");
  const keys = Object.keys(T.STR.th);
  for (const l of ["en", "zh"]) assert.deepEqual(Object.keys(T.STR[l]), keys, l + " has the same texts");
  for (const l of ["th", "en", "zh"]) for (const k of keys) assert.ok(T.STR[l][k].length > 3, `${l}.${k}`);
  for (const l of ["th", "en", "zh"]) {
    for (const name of ["Cloudflare", "Turnstile"]) assert.ok(T.STR[l].priv.includes(name), `${l} privacy note names ${name}`);
    // the AI processors are NOT hard-coded: the note points to the consent screen and the card lists the configured ones
    for (const name of ["OpenRouter", "Vertex", "Azure", "Anthropic", "OpenAI"]) assert.ok(!T.STR[l].priv.includes(name), `${l} privacy note does not hard-code ${name}`);
    assert.ok(T.STR[l].procNow.length > 5 && T.STR[l].procNone.length > 5 && T.STR[l].via.includes("{router}") && T.STR[l].via.includes("{served}"));
  }
  assert.match(T.STR.en.priv, /AI processors named on the consent screen before anything is sent/);
  assert.match(T.STR.th.priv, /หน้าขอความยินยอมระบุชื่อไว้ก่อนส่งทุกครั้ง/);
  assert.match(T.STR.zh.priv, /同意页面在每次发送前列明/);
  assert.match(T.STR.en.priv, /only after your consent[\s\S]*outside Thailand[\s\S]*keep no content[\s\S]*LENSIQ stores no label text or image/);
  const tsrc = readFileSync(join(ROOT, "lensiq-tester.js"), "utf8");
  assert.match(tsrc, /\/v1\/ai\/providers\?feature=/, "the processor list comes from the configured chains");
  for (const f2 of ["lensiq-pc-lookup.js", "medicine.js"]) assert.match(readFileSync(join(ROOT, f2), "utf8"), /tester_required[\s\S]{0,200}\.refused\(\)/, f2 + " forgets a refused code");
  for (const f2 of ["en-med.js", "zh-med.js"]) assert.ok(readFileSync(join(ROOT, "i18n", f2), "utf8").includes('"md.th.tester"'), f2);
  assert.match(T.STR.en.privH, /draft/i);
  assert.match(T.STR.th.priv, /นอกประเทศไทย/);
  assert.match(T.STR.zh.priv, /泰国境外/);
  assert.match(T.STR.en.brief, /closed test, not a product[\s\S]*estimates, not a verdict[\s\S]*prescriptions/);
  assert.deepEqual([T.unlockedFor(false, ""), T.unlockedFor(true, ""), T.unlockedFor(true, "x")], [true, false, true]);
  assert.deepEqual([T.headersFor(false, "code"), T.headersFor(true, ""), T.headersFor(true, "code")], [{}, {}, { "X-Tester-Code": "code" }]);
  // only a "tester_required" answer means "this code is not accepted"; every other refusal has its own message
  const cases = [[{ ok: true, status: 200, j: { ok: true } }, "ok"], [{ ok: false, status: 403, j: { reason: "tester_required" } }, "wrong"],
    [{ ok: false, status: 429, j: { reason: "tester_locked" } }, "locked"], [{ ok: false, status: 503, j: { off: true, reason: "service_off" } }, "off"],
    [{ ok: false, status: 429, j: { code: "daily_cap", reason: "daily_cap" } }, "cap"], [{ ok: false, status: 429, j: { code: "d1_budget", reason: "d1_budget" } }, "cap"],
    [{ ok: false, status: 0, j: null }, "network"], [{ ok: false, status: 403, j: { error: "origin not allowed" } }, "refused"], [{ ok: false, status: 403, j: null }, "refused"],
    [{ ok: false, status: 404, j: { code: "route_off", reason: "route_off" } }, "refused"], [{ ok: false, status: 500, j: { error: "internal error" } }, "refused"],
    [{ ok: false, status: 429, j: { error: "rate limited" } }, "refused"], [{ ok: false, status: 503, j: { code: "config_invalid", reason: "config_invalid" } }, "refused"]];
  for (const [resp, want] of cases) assert.equal(T.resultOf(resp), want, JSON.stringify(resp));
  for (const l of ["th", "en", "zh"]) {
    assert.equal(new Set(["wrong", "locked", "off", "cap", "refused", "network", "short", "revoked"].map(k => T.STR[l][k])).size, 8, l + ": each refusal has its own text");
  }
  assert.match(T.STR.en.refused, /does not mean the code is wrong/);
  assert.match(T.STR.th.refused, /ไม่ได้แปลว่ารหัสผิด/);
  assert.match(T.STR.zh.refused, /不表示代码错误/);
  const src = readFileSync(join(ROOT, "lensiq-tester.js"), "utf8");
  assert.match(src, /root\.sessionStorage/, "kept for the session only");
  assert.doesNotMatch(src, /localStorage/);
  assert.doesNotMatch(src, /console\.(log|info|debug)/);
});

test("page: the consent screen names the router AND the pinned serving provider; a remembered consent is tied to them; new refusals have texts", () => {
  const AI = require("../../lensiq-ai.js");
  const router = { name: { th: "OpenRouter (ตัวกลาง)", en: "OpenRouter (router)", zh: "OpenRouter（路由）" }, region: { th: "ไม่ระบุ", en: "varies", zh: "不定" }, retention: { th: "ร", en: "r",
    zh: "保" } };
  const vertex = { slug: "google-vertex", name: { th: "Google Cloud Vertex AI ไทย", en: "Google Cloud Vertex AI", zh: "Google Cloud Vertex AI 中" }, region: { th: "นอกประเทศไทย",
    en: "outside Thailand", zh: "泰国境外" } };
  const azure = { slug: "azure", name: { th: "Microsoft Azure ไทย", en: "Microsoft Azure", zh: "Microsoft Azure 中" }, region: { th: "นอกประเทศไทย A", en: "outside Thailand A", zh: "泰国境外 A" } };
  const info = { feature: "pc_fields", enabled: true, chain: [{ provider: "openrouter", model: "anthropic/claude-haiku-5.5", ...router, routed: vertex }, { provider: "openrouter",
    model: "openai/gpt-6-luna", ...router, routed: azure }] };
  for (const l of ["th", "en", "zh"]) {
    const v = AI.consentView(info, l, "text");
    assert.ok(v.provider.includes("OpenRouter") && v.provider.includes(vertex.name[l]), l + " provider: " + v.provider);
    assert.equal(v.region, vertex.region[l], "the place is the serving provider's");
    assert.ok(v.fallbacks[0].includes(azure.name[l]) && v.fallbacks[0].includes(azure.region[l]), l + " fallback: " + v.fallbacks[0]);
  }
  assert.deepEqual(AI.procs(info), ["openrouter>google-vertex", "openrouter>azure"]);
  assert.deepEqual(AI.requestBody(info, "text", { text: "x" }).providers, ["openrouter"], "the request still names provider ids");
  // remembered consent: valid for exactly these processors
  const mem = { v: null, getItem() { return this.v; }, setItem(k, v) { this.v = v; } };
  assert.equal(AI.saveConsent(mem, info, "text", true), true);
  assert.ok(AI.rememberedConsent(mem, info));
  const moved = { ...info, chain: [{ ...info.chain[0], routed: { ...vertex, slug: "amazon-bedrock" } }, info.chain[1]] };
  assert.equal(AI.rememberedConsent(mem, moved), null, "another serving provider asks again");
  const unpinned = { ...info, chain: info.chain.map(c => ({ ...c, routed: undefined })) };
  assert.equal(AI.rememberedConsent(mem, unpinned), null, "losing the pin asks again");
  // unpinned entries behave exactly as before (plain provider ids)
  assert.deepEqual(AI.procs(unpinned), ["openrouter", "openrouter"]);
  assert.equal(AI.consentView(unpinned, "en", "text").provider, router.name.en);
  for (const l of ["th", "en", "zh"]) {
    const msgs = ["tester_required", "service_off", "daily_cap"].map(r => AI.fallbackMessage(r, l));
    assert.equal(new Set(msgs).size, 3, l + ": each new refusal has its own text");
    for (const m of msgs) assert.notEqual(m, AI.fallbackMessage("something_unknown", l));
  }
  assert.match(AI.fallbackMessage("daily_cap", "en"), /tomorrow/);
  const lookup = readFileSync(join(ROOT, "lensiq-pc-lookup.js"), "utf8");
  for (const k of ["md.pc.l.r.tester", "md.pc.l.r.serviceOff", "md.pc.l.r.cap"]) {
    assert.ok(lookup.includes(`"${k}"`), k);
    for (const f of ["en-med.js", "zh-med.js"]) assert.ok(readFileSync(join(ROOT, "i18n", f), "utf8").includes(`"${k}"`), `${f} has ${k}`);
  }
});
