"use strict";
// tests/unit/backend-deploy-policy-read.test.js — D-3 review finding F4 (2026-11-21): tools/backend-deploy.mjs read the tester-gate policy
// (deploy/tester-gate.json, tools/lib/tester-policy.mjs) for EVERY action, so a malformed policy file also crashed the emergency kill
// switch `npm run backend:off`. The policy is now read only for `plan` and `deploy`, the two actions it governs:
//   P1 with a malformed policy file, `off` and `on` still write SERVICE_OFF 1 / 0 (exit 0), and `rollback`, `versions`, `list`, `whoami`
//      never read it (no crash, no policy line)
//   P2 with a malformed policy file, `deploy` REFUSES (exit 3) naming the file, before any wrangler command; `plan` refuses too
//   P3 with a valid policy file, `deploy` and `plan` still print the policy line (nothing else changed)
// A FAKE wrangler stands in for the real one (LQ_WRANGLER_BIN, honoured only with NODE_ENV=test): nothing here reaches a Cloudflare
// account. This file is locked: evals-locks/backend-deploy-policy-read.sha256 (written BEFORE the change in tools/backend-deploy.mjs).
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = join(__dirname, "..", "..");
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const MY_D1 = "11111111-2222-4333-8444-555555555555";
const TOML = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8")
  .replace(/(\[\[env\.test\.d1_databases\]\][\s\S]*?database_id = ")[0-9a-f-]{36}"/, `$1${MY_D1}"`);
const tool = () => import(pathToFileURL(join(ROOT, "tools", "backend-deploy.mjs")).href);

/** minimal fake wrangler: logs {argv, stdin}; the Worker lensiq-api-test is deployed; d1 list names lensiq-test with MY_D1 */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "lq-policy-read-"));
  const log = join(dir, "calls.jsonl");
  writeFileSync(log, "");
  const bin = join(dir, "fake-wrangler.js");
  writeFileSync(bin, `
const fs = require("fs");
const argv = process.argv.slice(2);
let input = "";
const done = () => {
  fs.appendFileSync(process.env.LQ_FAKE_LOG, JSON.stringify({ argv, stdin: input }) + "\\n");
  if (argv[0] === "whoami") { console.log("You are logged in. Account: Owner Test Account, id 0123"); process.exit(0); }
  if (argv[0] === "deployments" || argv[0] === "versions") { console.log(JSON.stringify([{ id: "dep-1" }])); process.exit(0); }
  if (argv[0] === "secret" && argv[1] === "list") { console.log("[]"); process.exit(0); }
  if (argv[0] === "d1" && argv[1] === "list") { console.log(JSON.stringify([{ uuid: "${MY_D1}", name: "lensiq-test" }])); process.exit(0); }
  process.exit(0);
};
if (argv[0] === "secret" && argv[1] === "put") { process.stdin.on("data", d => { input += d; }); process.stdin.on("end", done); } else done();
`);
  const tomlPath = join(dir, "wrangler.toml");
  writeFileSync(tomlPath, TOML);
  const env = { PATH: process.env.PATH, NODE_ENV: "test", LQ_WRANGLER_BIN: bin, LQ_FAKE_LOG: log, LQ_FAKE_MODE: "" };
  const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  const policy = text => { const f = join(dir, "tester-gate.json"); writeFileSync(f, text); return f; };
  return { dir, env, tomlPath, calls, policy, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const MALFORMED = ['{ "enforce": tru', '{ "enforce": "yes" }', '{ "enforce": false, "extra": 1 }', "[]"];

test("P1 a malformed policy file never blocks the kill switch: off / on still work; rollback, versions, list, whoami never read it", async () => {
  const { main } = await tool();
  for (const bad of MALFORMED) {
    const sb = sandbox();
    try {
      const policyFile = sb.policy(bad);
      const run = argv => { const out = []; const code = main(argv, { print: s => out.push(s), env: sb.env, tomlPath: sb.tomlPath, policyFile }); return { code, out }; };
      let r = run(["off"]);
      assert.equal(r.code, 0, `${bad}: off: ${r.out.join("\n")}`);
      r = run(["on"]);
      assert.equal(r.code, 0, `${bad}: on: ${r.out.join("\n")}`);
      const puts = sb.calls().filter(c => c.argv[0] === "secret" && c.argv[1] === "put");
      assert.deepEqual(puts.map(c => [c.argv.join(" "), c.stdin]), [["secret put SERVICE_OFF --env test", "1"], ["secret put SERVICE_OFF --env test", "0"]], bad);
      for (const argv of [["rollback", "99999999-2222-4333-8444-555555555555"], ["versions"], ["list"], ["whoami"]]) {
        r = run(argv);
        assert.equal(r.code, 0, `${bad}: ${argv[0]}: ${r.out.join("\n")}`);
        assert.ok(!r.out.some(l => /Tester gate \(D-3\) policy|tester-gate\.json/.test(l)), `${bad}: ${argv[0]} does not read the policy`);
      }
    } finally { sb.done(); }
  }
});

test("P2 a malformed policy file makes deploy (and plan) refuse with exit 3, naming the file, before any wrangler command", async () => {
  const { main } = await tool();
  for (const bad of MALFORMED) {
    const sb = sandbox();
    try {
      const policyFile = sb.policy(bad);
      for (const action of ["deploy", "plan"]) {
        const out = [];
        const code = main([action], { print: s => out.push(s), env: sb.env, tomlPath: sb.tomlPath, policyFile });
        assert.equal(code, 3, `${bad}: ${action}: ${out.join("\n")}`);
        assert.ok(out.some(l => /^REFUSED: .*deploy\/tester-gate\.json.*Nothing was changed\.$/.test(l)), `${bad}: ${action}: ${out.join("\n")}`);
      }
      assert.deepEqual(sb.calls(), [], `${bad}: no wrangler command started`);
    } finally { sb.done(); }
  }
});

test("P3 a valid policy file: plan and deploy still print the policy line", async () => {
  const { main } = await tool();
  const sb = sandbox();
  try {
    const policyFile = sb.policy(JSON.stringify({ note: "test", enforce: false }));
    for (const action of ["plan", "deploy"]) {
      const out = [];
      main([action, "--print-only"], { print: s => out.push(s), env: sb.env, tomlPath: sb.tomlPath, policyFile });
      assert.ok(out.some(l => /^Tester gate \(D-3\) policy: enforce off · /.test(l)), `${action}: ${out.join("\n")}`);
    }
  } finally { sb.done(); }
});

test("P4 source: readTesterPolicy is called once, inside the plan / deploy branch of main() (so no other action can reach it)", () => {
  const src = readFileSync(join(ROOT, "tools", "backend-deploy.mjs"), "utf8");
  const calls = [...src.matchAll(/readTesterPolicy\(/g)].map(m => m.index);
  assert.equal(calls.length, 1, "one call");
  const open = src.indexOf('if (action === "plan" || action === "deploy") {');
  const end = src.indexOf("return act(", open);
  assert.ok(open > 0 && calls[0] > open && calls[0] < end, "the call is inside the plan / deploy branch, before act()");
});
