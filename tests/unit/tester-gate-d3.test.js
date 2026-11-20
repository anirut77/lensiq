"use strict";
// tests/unit/tester-gate-d3.test.js — owner decision D-3 (2026-11-19, BOARD-0800-2026-11-19 line ~102): "enforce the tester
// code on the live site". Locked BEFORE the product code (evals-locks/tester-gate-d3.sha256).
//
// What exists already (c09bb886, deploy plan B3): the Worker gate (backend/src/tester.js, TESTER_GATE = "required" +
// secret TESTER_ACCESS_CODE) and the page side (lensiq-tester.js, deploy/public-site.json "testerGate": true). This suite
// covers what D-3 adds: a policy that refuses a deploy or a public-site build which would serve the gated routes (AI,
// fortune AI, the testing-only lookup sources) WITHOUT the tester gate while LEGAL_TERMS_READY / LEGAL_PRIVACY_READY are
// not both "true". The policy has one switch, deploy/tester-gate.json "enforce" (shipped false = warn only); turning it
// on changes nothing for users today because the live test deployment already carries the gate (case T5).
//
//   T1 the switch file: exists, only {note, enforce}, enforce is a boolean; a missing file = off; a bad file throws
//   T2 worker rule: gate required while legal is not ready and a gated route is public; PUBLIC_ROUTES semantics
//   T3 site rule: an active public-site config must carry testerGate true while legal is not ready
//   T4 verdict: refuse only when enforce is on AND there is a problem; the problems are reported either way
//   T5 the repo today (wrangler [env.test.vars] + deploy/public-site.json) has NO problem
//   T6 tools/backend-deploy.mjs deploy (print-only): enforce on + gate missing = exit 3 before any wrangler command;
//      enforce off = a WARNING and the deploy goes on; the repo toml with enforce on = no refusal
//   T7 tools/build-site.mjs: siteTesterGateCheck refuses a public build without the gate when enforce is on, is checked
//      before the output folder is touched, and never applies to a customer bundle (its tester gate is always off)
//   T8 docs: the switch, the one-line change and the owner's secret steps are written down
const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const POLICY = join(ROOT, "deploy", "tester-gate.json");
const lib = () => import(join(ROOT, "tools", "lib", "tester-policy.mjs"));
const deployTool = () => import(join(ROOT, "tools", "backend-deploy.mjs"));
const siteTool = () => import(join(ROOT, "tools", "build-site.mjs"));
const TOML = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8")
  .replace(/(\[\[env\.test\.d1_databases\]\][\s\S]*?database_id = ")[0-9a-f-]{36}"/, '$100000000-0000-0000-0000-000000000000"');
const NOT_READY = { LEGAL_TERMS_READY: "false", LEGAL_PRIVACY_READY: "false" };

test("T1 the switch file deploy/tester-gate.json: only {note, enforce}, enforce boolean; missing = off; bad = throws", async () => {
  const L = await lib();
  assert.ok(existsSync(POLICY), "deploy/tester-gate.json exists");
  const j = JSON.parse(readFileSync(POLICY, "utf8"));
  assert.deepEqual(Object.keys(j).filter(k => !["note", "enforce"].includes(k)), [], "no other keys");
  assert.equal(typeof j.enforce, "boolean", "enforce is true or false");
  assert.deepEqual(L.readTesterPolicy(POLICY), { enforce: j.enforce });
  const d = mkdtempSync(join(tmpdir(), "lq-d3-"));
  try {
    assert.deepEqual(L.readTesterPolicy(join(d, "absent.json")), { enforce: false }, "missing file = off");
    for (const bad of ['{"enforce":"yes"}', '{"enforce":true,"extra":1}', "[]", "not json", '{"enforce":1}']) {
      const f = join(d, "p.json"); writeFileSync(f, bad);
      assert.throws(() => L.readTesterPolicy(f), undefined, "refused: " + bad);
    }
    const f = join(d, "ok.json"); writeFileSync(f, '{"note":"x","enforce":true}');
    assert.deepEqual(L.readTesterPolicy(f), { enforce: true });
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("T2 worker rule: TESTER_GATE must be required while legal is not ready and a gated route is public", async () => {
  const L = await lib();
  const routes = "/health,/v1/config,/v1/tester/check,/v1/leads,/v1/ai/*,/api/pc/*,/api/med/*";
  assert.equal(L.workerTesterProblems({ ...NOT_READY, TESTER_GATE: "", PUBLIC_ROUTES: routes }).length, 1, "gate off -> one problem");
  assert.equal(L.workerTesterProblems({ ...NOT_READY, PUBLIC_ROUTES: routes }).length, 1, "gate unset -> one problem");
  assert.equal(L.workerTesterProblems({ ...NOT_READY, TESTER_GATE: "optional", PUBLIC_ROUTES: routes }).length, 1, "any other value -> problem");
  assert.deepEqual(L.workerTesterProblems({ ...NOT_READY, TESTER_GATE: "required", PUBLIC_ROUTES: routes }), []);
  assert.deepEqual(L.workerTesterProblems({ ...NOT_READY, TESTER_GATE: " Required ", PUBLIC_ROUTES: routes }), [], "same reading as the Worker (trim, lower case)");
  // legal ready = the owner's sign-off: the policy no longer requires the gate
  assert.deepEqual(L.workerTesterProblems({ LEGAL_TERMS_READY: "true", LEGAL_PRIVACY_READY: "true", TESTER_GATE: "", PUBLIC_ROUTES: routes }), []);
  assert.equal(L.workerTesterProblems({ LEGAL_TERMS_READY: "true", LEGAL_PRIVACY_READY: "false", TESTER_GATE: "", PUBLIC_ROUTES: routes }).length, 1, "both flags needed");
  assert.equal(L.workerTesterProblems({ TESTER_GATE: "", PUBLIC_ROUTES: routes }).length, 1, "flags missing = not ready");
  // PUBLIC_ROUTES: unset = every route is public (default configuration); only non-gated routes = no gate needed
  assert.equal(L.workerTesterProblems({ ...NOT_READY, TESTER_GATE: "" }).length, 1, "unset PUBLIC_ROUTES = all routes public");
  assert.deepEqual(L.workerTesterProblems({ ...NOT_READY, TESTER_GATE: "", PUBLIC_ROUTES: "/health,/v1/config,/v1/leads" }), []);
  for (const r of ["/v1/ai/*", "/v1/ai/pc_fields", "/api/*", "/api/fortune", "/api/fortune/status", "/api/med/thfda", "/api/pc/*"]) {
    assert.equal(L.workerTesterProblems({ ...NOT_READY, TESTER_GATE: "", PUBLIC_ROUTES: "/health," + r }).length, 1, "gated route open: " + r);
  }
  const p = L.workerTesterProblems({ ...NOT_READY, TESTER_GATE: "", PUBLIC_ROUTES: routes })[0];
  assert.match(p, /TESTER_GATE/); assert.match(p, /D-3/);
  assert.deepEqual(L.gatedRoutesOpen({ PUBLIC_ROUTES: "/health,/v1/leads" }), []);
  assert.ok(L.gatedRoutesOpen({ PUBLIC_ROUTES: routes }).length >= 3);
});

test("T3 site rule: an active public-site config needs testerGate true while legal is not ready", async () => {
  const L = await lib();
  assert.deepEqual(L.siteTesterProblems(null, NOT_READY), [], "no API on the site = no AI step = nothing to gate");
  assert.equal(L.siteTesterProblems({ apiBase: "https://x.example", testerGate: false }, NOT_READY).length, 1);
  assert.deepEqual(L.siteTesterProblems({ apiBase: "https://x.example", testerGate: true }, NOT_READY), []);
  assert.deepEqual(L.siteTesterProblems({ apiBase: "https://x.example", testerGate: false }, { LEGAL_TERMS_READY: "true", LEGAL_PRIVACY_READY: "true" }), []);
  assert.match(L.siteTesterProblems({ apiBase: "https://x.example", testerGate: false }, NOT_READY)[0], /testerGate/);
});

test("T4 verdict: refuse only when enforce is on and there is a problem", async () => {
  const L = await lib();
  assert.deepEqual(L.testerVerdict({ enforce: false }, ["p"]), { enforce: false, problems: ["p"], refuse: false });
  assert.deepEqual(L.testerVerdict({ enforce: true }, ["p"]), { enforce: true, problems: ["p"], refuse: true });
  assert.deepEqual(L.testerVerdict({ enforce: true }, []), { enforce: true, problems: [], refuse: false });
  assert.deepEqual(L.testerVerdict({ enforce: false }, []), { enforce: false, problems: [], refuse: false });
});

test("T5 the live test deployment today already satisfies D-3 (turning enforce on changes nothing for users)", async () => {
  const L = await lib();
  const S = await siteTool();
  const vars = L.testVars(TOML);
  assert.equal(vars.TESTER_GATE, "required", "[env.test.vars] TESTER_GATE");
  assert.notEqual(vars.LEGAL_TERMS_READY === "true" && vars.LEGAL_PRIVACY_READY === "true", true, "legal not signed off yet");
  assert.deepEqual(L.workerTesterProblems(vars), []);
  const sc = S.readSiteConfig();
  assert.ok(sc && sc.testerGate === true, "deploy/public-site.json testerGate true");
  assert.deepEqual(L.siteTesterProblems(sc, vars), []);
});

test("T6 backend-deploy deploy: enforce on + gate missing = REFUSED (exit 3) before any wrangler command", async () => {
  const { main } = await deployTool();
  const noGate = TOML.replace(/^TESTER_GATE = "required"$/m, 'TESTER_GATE = ""');
  assert.notEqual(noGate, TOML, "fixture changed the gate line");
  let out = [];
  assert.equal(main(["deploy", "--print-only"], { print: s => out.push(s), env: {}, toml: noGate, policy: { enforce: true } }), 3);
  let text = out.join("\n");
  assert.match(text, /REFUSED/); assert.match(text, /TESTER_GATE/);
  assert.doesNotMatch(text, /wrangler deploy|\bdeploy --env\b/, "no deploy command reached");
  out = [];
  assert.equal(main(["deploy", "--print-only"], { print: s => out.push(s), env: {}, toml: noGate, policy: { enforce: false } }), 0);
  text = out.join("\n");
  assert.match(text, /WARNING/); assert.match(text, /TESTER_GATE/); assert.doesNotMatch(text, /REFUSED/);
  out = [];
  assert.equal(main(["deploy", "--print-only"], { print: s => out.push(s), env: {}, toml: TOML, policy: { enforce: true } }), 0);
  text = out.join("\n");
  assert.doesNotMatch(text, /REFUSED|WARNING/);
  out = [];
  assert.equal(main(["plan"], { print: s => out.push(s), env: {}, toml: noGate, policy: { enforce: true } }), 0, "plan never refuses");
  assert.match(out.join("\n"), /tester gate \(D-3\)/i, "plan prints the policy state");
});

test("T7 build-site: siteTesterGateCheck refuses a public build without the gate (enforce on); customer bundles exempt", async () => {
  const S = await siteTool();
  const bad = { apiBase: "https://lensiq-api-test.x.workers.dev", testerGate: false, pages: ["medicine.html"] };
  const good = { ...bad, testerGate: true };
  let v = S.siteTesterGateCheck(bad, { policy: { enforce: true }, vars: NOT_READY });
  assert.equal(v.refuse, true); assert.equal(v.problems.length, 1);
  v = S.siteTesterGateCheck(bad, { policy: { enforce: false }, vars: NOT_READY });
  assert.equal(v.refuse, false); assert.equal(v.problems.length, 1, "off = warn only");
  assert.equal(S.siteTesterGateCheck(good, { policy: { enforce: true }, vars: NOT_READY }).refuse, false);
  assert.deepEqual(S.siteTesterGateCheck(bad, { policy: { enforce: true }, vars: NOT_READY, customer: true }), { enforce: true, problems: [], refuse: false },
    "a customer bundle runs the customer's own deployment; its tester gate is always off (customerSiteConfig)");
  const src = readFileSync(join(ROOT, "tools", "build-site.mjs"), "utf8");
  const main = src.slice(src.indexOf("if (isMain)"));
  assert.ok(main.indexOf("siteTesterGateCheck(") > 0, "main runs the check");
  assert.ok(main.indexOf("siteTesterGateCheck(") < main.indexOf("rmSync(out"), "checked before the output folder is touched");
});

test("T8 docs: the switch, the one-line change and the owner's secret steps", () => {
  const deploy = readFileSync(join(ROOT, "docs", "DEPLOY.md"), "utf8");
  assert.match(deploy, /deploy\/tester-gate\.json/);
  assert.match(deploy, /"enforce": true/);
  assert.match(deploy, /secrets:setup -- --only TESTER_ACCESS_CODE/);
  const plan = readFileSync(join(ROOT, "docs", "PRODUCTION-MOVE-PLAN.md"), "utf8");
  assert.match(plan, /deploy\/tester-gate\.json/, "the production plan points at the policy");
});
