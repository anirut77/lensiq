"use strict";
// tests/unit/prod-tooling-review.test.js — production tooling, independent-review findings 2-7 on eb750e1c (LOCKED before the code as
// RE-LOCK 3 of evals-locks/prod-tooling.sha256). Equal-or-stricter only: every check here ADDS a refusal.
//   R2 secrets:setup --env production needs --confirm-production before anything is sent (dry run / list stay free)
//   R3 the production bundle carries a build stamp (commit + base); the Pages guard refuses unless it equals HEAD and the base
//   R4 PUBLIC_ROUTES of production = exactly the 5 routes of runbook A.2 (set equality)
//   R5 no IP-literal origin; TURNSTILE_HOSTNAMES = exactly the site host; SITE_URL = the configured production base
//   R6 cf-guard refuses duplicate --name / --env / -e / --config / -c flags (any form) and production commands without --env
//   R7 --out of the production / redirect builders: a new folder, or an _site-* folder inside the repo; nothing else
// Nothing here reaches Cloudflare (fake wrangler, NODE_ENV=test).
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { PassThrough } = require("node:stream");

const ROOT = join(__dirname, "..", "..");
const TOML_PROD = readFileSync(join(ROOT, "backend", "wrangler.production.toml"), "utf8");
const MY_D1 = "11111111-2222-4333-8444-555555555555";
const DOMAIN = "www.lensiq.example", SITE = "https://" + DOMAIN, BASE = SITE + "/";
const PF = "wrangler.production.toml";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const guard = () => import(join(ROOT, "tools", "lib", "cf-guard.mjs"));
const tmp = p => mkdtempSync(join(tmpdir(), p));

function setProdVar(toml, key, value) {
  const lines = toml.split("\n"), at = lines.findIndex(l => l.trim() === "[env.production.vars]");
  for (let i = at + 1; i < lines.length && !/^\s*\[/.test(lines[i]); i++) {
    if (new RegExp(`^${key}\\s*=`).test(lines[i])) { lines[i] = `${key} = ${JSON.stringify(value)}`; return lines.join("\n"); }
  }
  throw new Error("no " + key);
}
async function ready() {
  const G = await guard();
  let t = G.fillDatabaseId(TOML_PROD, MY_D1, "production");
  t = setProdVar(t, "ALLOWED_ORIGINS", SITE);
  t = setProdVar(t, "TURNSTILE_HOSTNAMES", DOMAIN);
  t = setProdVar(t, "SITE_URL", SITE);
  return setProdVar(t, "LINE_LOGIN_REDIRECT_URI", SITE + "/account.html");
}
function fakeWrangler(dir) {
  const bin = join(dir, "fake-wrangler.js");
  writeFileSync(bin, `const fs = require("fs"); const argv = process.argv.slice(2); let input = "";
const done = () => { fs.appendFileSync(process.env.LQ_FAKE_LOG, JSON.stringify({ argv }) + "\\n");
  if (argv[0] === "deployments") console.log(JSON.stringify([{ id: "dep-1" }]));
  if (argv[0] === "secret" && argv[1] === "list") console.log("[]");
  process.exit(0); };
if (argv[0] === "secret" && argv[1] === "put") { process.stdin.on("data", d => { input += d; }); process.stdin.on("end", done); } else done();`);
  return bin;
}
function sandbox() {
  const dir = tmp("lq-r3-");
  const log = join(dir, "calls.jsonl");
  writeFileSync(log, "");
  const env = { PATH: process.env.PATH, NODE_ENV: "test", LQ_WRANGLER_BIN: fakeWrangler(dir), LQ_FAKE_LOG: log };
  return { dir, env, calls: () => readFileSync(log, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)), done: () => rmSync(dir, { recursive: true, force: true }) };
}
const term = () => {
  const stdin = new PassThrough(); stdin.isTTY = true; stdin.setRawMode = () => {};
  let text = ""; const stdout = { isTTY: true, write: s => { text += String(s); return true; } };
  const proc = new EventEmitter(); proc.exit = () => {};
  return { stdin, stdout, proc, text: () => text };
};

test("R2 secrets:setup --env production: nothing is sent without --confirm-production; dry run and list stay free; duplicate --env refused", async () => {
  const S = await import(join(ROOT, "tools", "secrets-setup.mjs"));
  const sb = sandbox();
  try {
    for (const argv of [["--env", "production"], ["--env", "production", "--list"], ["--env=production", "--only", "HEALTH_TOKEN"]]) {
      const io = term();
      const code = await S.main(argv, { ...io, env: sb.env, toml: TOML_PROD });
      assert.equal(code, 3, argv.join(" ") + ": " + io.text());
      assert.match(io.text(), /--confirm-production/);
    }
    assert.deepEqual(sb.calls(), [], "nothing was started");
    let io = term();
    assert.equal(await S.main(["--env", "production", "--dry-run", "--list"], { ...io, env: sb.env, toml: TOML_PROD }), 0, io.text());
    for (const argv of [["--env", "test", "--env", "production", "--dry-run", "--list"], ["--env=production", "--env", "production", "--dry-run", "--list"]]) {
      io = term();
      assert.equal(await S.main(argv, { ...io, env: sb.env, toml: TOML_PROD }), 2, argv.join(" "));
    }
    assert.deepEqual(sb.calls(), []);
    io = term();
    const code = await S.main(["--env", "production", "--confirm-production", "--list"], { ...io, env: sb.env, toml: TOML_PROD });
    assert.equal(code, 0, io.text());
    const c = sb.calls();
    assert.deepEqual(c.map(x => x.argv[0]), ["deployments", "secret"], "only the read-only checks ran");
    for (const x of c) assert.deepEqual(x.argv.slice(x.argv.indexOf("--config"), x.argv.indexOf("--config") + 4), ["--config", PF, "--env", "production"]);
    // the test environment needs no confirmation (unchanged)
    io = term();
    assert.equal(await S.main(["--dry-run", "--list"], { ...io, env: sb.env }), 0);
  } finally { sb.done(); }
});

test("R3 build stamp: the bundle names its commit and base; the Pages guard refuses a bundle of another commit or base", async () => {
  const P = await import(join(ROOT, "tools", "build-prod-site.mjs"));
  const PG = await import(join(ROOT, "tools", "pages-deploy-guard.mjs"));
  const B = await import(join(ROOT, "tools", "build-site.mjs"));
  assert.equal(P.BUILD_STAMP, "_lensiq-build.json");
  const d = tmp("lq-r3-stamp-");
  try {
    const site = join(d, "_site-prod");
    mkdirSync(site);
    writeFileSync(join(site, "index.html"), "<!doctype html><html><head></head><body></body></html>");
    writeFileSync(join(site, "lensiq-config.js"), B.CUSTOMER_LOCK + "window.X = 1;\n");
    assert.throws(() => P.postProcess(site, { base: BASE, oldBase: "https://anirut77.github.io/lensiq/", commit: "abc" }), Error, "a commit is 40 hex characters");
    P.postProcess(site, { base: BASE, oldBase: "https://anirut77.github.io/lensiq/", commit: SHA });
    assert.deepEqual(P.readBuildStamp(site), { commit: SHA, base: BASE });
    assert.deepEqual(JSON.parse(readFileSync(join(site, "_lensiq-build.json"), "utf8")), { commit: SHA, base: BASE });
    const GIT = { head: SHA, main: SHA, clean: true };
    const sb = sandbox();
    try {
      const o = { project: "lensiq-prod-site", confirm: "lensiq-prod-site", dir: site, git: GIT, ci: true, env: sb.env, base: BASE };
      assert.deepEqual(PG.deployProblems(o), []);
      const has = (x, re) => { const p = PG.deployProblems({ ...o, ...x }); assert.ok(p.some(y => re.test(y)), JSON.stringify(p)); };
      has({ git: { head: "f".repeat(40), main: "f".repeat(40), clean: true } }, /build stamp|built from/);
      has({ base: "https://www.other.example/" }, /base/);
      has({ base: "" }, /base/);
      writeFileSync(join(site, "_lensiq-build.json"), JSON.stringify({ commit: SHA }));
      has({}, /build stamp/);
      rmSync(join(site, "_lensiq-build.json"));
      has({}, /build stamp/);
      writeFileSync(join(site, "_lensiq-build.json"), "not json");
      has({}, /build stamp/);
      writeFileSync(join(site, "_lensiq-build.json"), JSON.stringify({ commit: SHA, base: BASE }));
      // CLI: the configured base (deploy/site-url.prod.json) is used; injected here
      const out = [];
      assert.equal(PG.main(["--check", "--project", "lensiq-prod-site", "--confirm", "lensiq-prod-site", "--dir", site], { print: s => out.push(s), env: sb.env, git: GIT, ciGreen: () => true, base: BASE }), 0, out.join("\n"));
      assert.equal(PG.main(["--run", "--project", "lensiq-prod-site", "--confirm", "lensiq-prod-site", "--dir", site], { print: () => {}, env: sb.env, git: GIT, ciGreen: () => true, base: "" }), 1,
        "the committed base is empty today: no deploy");
      assert.deepEqual(sb.calls(), []);
    } finally { sb.done(); }
  } finally { rmSync(d, { recursive: true, force: true }); }
  // deploy-prod.yml builds with the commit stamped (the build tool reads HEAD itself)
  assert.match(readFileSync(join(ROOT, "tools", "build-prod-site.mjs"), "utf8"), /rev-parse", "HEAD"/);
});

test("R4 PUBLIC_ROUTES of production: exactly the 5 routes of runbook A.2 (set equality)", async () => {
  const D = await import(join(ROOT, "tools", "backend-deploy.mjs"));
  const G = await guard();
  const R = await ready();
  assert.deepEqual([...D.PROD_PUBLIC_ROUTES].sort(), ["/health", "/health/deep", "/v1/config", "/v1/leads", "/v1/tester/check"]);
  const probs = v => D.productionProblems(G.readTargets(setProdVar(R, "PUBLIC_ROUTES", v), "production"));
  assert.deepEqual(probs("/health,/health/deep,/v1/config,/v1/leads,/v1/tester/check"), []);
  assert.deepEqual(probs("/v1/tester/check, /v1/leads,/v1/config,/health/deep,/health"), [], "order and spaces do not matter");
  for (const v of ["/health,/v1/config,/v1/leads,/v1/tester/check", "/health,/health/deep,/v1/config,/v1/leads,/v1/tester/check,/health/notify-test",
    "/health,/health/deep,/v1/config,/v1/leads,/v1/tester/check,/v1/merit/interest", "/health,/health/deep,/v1/config,/v1/leads,/v1/tester/check,/health",
    "/health,/health/deep,/v1/config,/v1/leads,/v1/tester/*", "/*", ""]) {
    assert.ok(probs(v).some(p => /PUBLIC_ROUTES/.test(p)), v);
  }
});

test("R5 origins: no IP literal; Turnstile hostname = exactly the site host; SITE_URL = the configured production base", async () => {
  const D = await import(join(ROOT, "tools", "backend-deploy.mjs"));
  const G = await guard();
  const R = await ready();
  const probs = (k, v, o) => D.productionProblems(G.readTargets(setProdVar(R, k, v), "production"), o);
  for (const ip of ["https://10.0.0.1", "https://192.168.1.10", "https://172.16.0.1", "https://172.31.255.1", "https://8.8.8.8", "https://[::1]", "https://[2001:db8::1]",
    "https://127.0.0.1", "https://0x7f000001", "https://2130706433"]) {
    const p = D.productionProblems(G.readTargets(setProdVar(setProdVar(setProdVar(R, "ALLOWED_ORIGINS", ip), "SITE_URL", ip), "TURNSTILE_HOSTNAMES", ip.slice(8)), "production"));
    assert.ok(p.some(x => /ALLOWED_ORIGINS/.test(x)), ip + ": " + p.join(" | "));
  }
  for (const v of [DOMAIN + ",evil.example", "lensiq.example", DOMAIN + "," + DOMAIN, "evil.example", "10.0.0.1"]) {
    assert.ok(probs("TURNSTILE_HOSTNAMES", v).some(p => /TURNSTILE_HOSTNAMES/.test(p)), v);
  }
  assert.deepEqual(D.productionProblems(G.readTargets(R, "production"), { base: BASE }), []);
  assert.deepEqual(D.productionProblems(G.readTargets(R, "production"), { base: "" }), [], "no configured base yet: checked against SITE_URL only");
  assert.ok(D.productionProblems(G.readTargets(R, "production"), { base: "https://www.other.example/" }).some(p => /base|site-url\.prod/.test(p)));
});

test("R6 cf-guard: duplicate --name / --env / -e / --config / -c refused in any form; production commands need --env", async () => {
  const G = await guard();
  const p = G.readTargets(TOML_PROD, "production"), t = G.readTargets(readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8"));
  const C = ["--config", PF];
  assert.equal(G.assertEffective(["deploy", ...C, "--env", "production", "--name", "lensiq-prod-api"], p).name, "lensiq-prod-api");
  assert.equal(G.assertEffective(["deploy", "--env", "test", "--name", "lensiq-api-test"], t).name, "lensiq-api-test", "test unchanged");
  for (const args of [
    ["deploy", ...C, "--env", "production", "--env", "test", "--name", "lensiq-prod-api"],
    ["deploy", ...C, "--env", "production", "-e", "production", "--name", "lensiq-prod-api"],
    ["deploy", ...C, "--env=production", "--env", "production", "--name", "lensiq-prod-api"],
    ["deploy", ...C, "--env", "production", "--name", "dearday-staging", "--name=lensiq-prod-api"],
    ["deploy", ...C, "--env", "production", "--name", "lensiq-prod-api", "--name", "lensiq-prod-api"],
    ["deploy", ...C, "-c", PF, "--env", "production", "--name", "lensiq-prod-api"],
    ["deploy", "--config=wrangler.toml", ...C, "--env", "production", "--name", "lensiq-prod-api"],
    ["secret", "put", "X", ...C, "--env", "production", "--env=production"],
    ["d1", "migrations", "apply", "lensiq-prod", "--remote", ...C, "--env", "production", "-e", "test"],
    ["d1", "migrations", "apply", "lensiq-prod", "--remote", ...C],
    ["secret", "put", "X", ...C], ["deploy", ...C, "--name", "lensiq-prod-api"]
  ]) assert.throws(() => G.assertEffective(args, p), G.GuardError, args.join(" "));
  for (const args of [["deploy", "--env", "test", "--env", "test", "--name", "lensiq-api-test"], ["secret", "put", "X", "--env", "test", "-e", "test"],
    ["deploy", "--env", "test", "--name", "lensiq-api-test", "--name=lensiq-api-test"], ["deploy", "--config", "wrangler.toml", "-c", "wrangler.toml", "--env", "test", "--name", "lensiq-api-test"]]) {
    assert.throws(() => G.assertEffective(args, t), G.GuardError, "test: " + args.join(" "));
  }
  // backend-deploy: a repeated --env is a usage error
  const D = await import(join(ROOT, "tools", "backend-deploy.mjs"));
  for (const argv of [["plan", "--env", "test", "--env", "production"], ["plan", "--env=production", "--env", "production"]]) assert.equal(D.main(argv, { print: () => {}, toml: TOML_PROD }), 2, argv.join(" "));
});

test("R7 --out: a new folder, or an _site-* folder inside the repo; anything else is refused before writing", async () => {
  const P = await import(join(ROOT, "tools", "build-prod-site.mjs"));
  const R = await import(join(ROOT, "tools", "build-redirect-site.mjs"));
  const d = tmp("lq-r3-out-");
  try {
    const existing = join(d, "existing");
    mkdirSync(existing);
    writeFileSync(join(existing, "keep.txt"), "sentinel");
    assert.equal(P.checkOutDir(join(d, "new-folder")), join(d, "new-folder"));
    assert.equal(P.checkOutDir(join(ROOT, "_site-prod")), join(ROOT, "_site-prod"));
    assert.equal(P.checkOutDir(join(ROOT, "_site-redirect")), join(ROOT, "_site-redirect"));
    for (const o of [existing, d, ROOT, join(ROOT, "_site"), join(ROOT, "docs"), join(ROOT, "tools"), join(ROOT, "backend"), join(ROOT, "_site-"), join(ROOT, "_site-prod", "sub"),
      join(ROOT, "new-thing"), join(ROOT, "_SITE-prod"), "/", tmpdir()]) {
      assert.throws(() => P.checkOutDir(o), Error, o);
    }
    assert.throws(() => R.buildRedirectSite({ out: existing, target: BASE, pages: ["index.html"], oldPath: "/lensiq/" }));
    assert.deepEqual(readdirSync(existing), ["keep.txt"], "the existing folder was not touched");
    for (const [tool, argv] of [["build-redirect-site.mjs", ["--target", BASE, "--out", existing]], ["build-prod-site.mjs", ["--base", BASE, "--out", existing]],
      ["build-prod-site.mjs", ["--base", BASE, "--out", join(ROOT, "docs")]]]) {
      const r = spawnSync(process.execPath, [join(ROOT, "tools", tool), ...argv], { cwd: ROOT, encoding: "utf8" });
      assert.equal(r.status, 1, tool + " " + argv.join(" ") + r.stdout + r.stderr);
    }
    assert.deepEqual(readdirSync(existing), ["keep.txt"]);
    assert.ok(existsSync(join(ROOT, "docs", "PRODUCTION-MOVE-PLAN.md")), "docs untouched");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("finding 1: the repo plan says the Pages upload is local (no Pages token in GitHub)", () => {
  const plan = readFileSync(join(ROOT, "docs", "PRODUCTION-MOVE-PLAN.md"), "utf8");
  assert.match(plan, /Pages upload runs from the owner's machine/);
  for (const line of plan.split("\n").filter(l => /CLOUDFLARE_PAGES_TOKEN/.test(l))) assert.match(line, /superseded|no longer|not used/i, line);
});
