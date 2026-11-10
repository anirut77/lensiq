"use strict";
// tests/unit/pc-ai-tools.test.js — round 17 P7: the P8 preparation tools, with a MOCKED local Worker and a fake wrangler
// (no key, no network, no wrangler run): tools/ai-test-enable.mjs (local D1 only, never --remote, never prints a key) and
// tools/pc-ai-eval.mjs (skips providers without a key, per-model cap and total budget stop the run, scoring).
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const lib = () => import("../../tools/lib/ai-trial.mjs");
const en = () => import("../../tools/ai-test-enable.mjs");
const ev = () => import("../../tools/pc-ai-eval.mjs");

test("guards: CI refused, only a localhost base, --remote refused", async () => {
  const L = await lib(), E = await en();
  assert.throws(() => L.assertNotCI({ CI: "true" }), /CI/);
  assert.throws(() => L.assertNotCI({ GITHUB_ACTIONS: "true" }), /CI/);
  assert.doesNotThrow(() => L.assertNotCI({}));
  assert.equal(L.assertLocalBase("http://127.0.0.1:8787/x"), "http://127.0.0.1:8787");
  assert.equal(L.assertLocalBase("http://localhost:8787"), "http://localhost:8787");
  for (const u of ["https://lensiq-api.example.workers.dev", "http://10.0.0.5:8787", "http://localhost.evil.test", "nope"]) assert.throws(() => L.assertLocalBase(u), u);
  assert.throws(() => E.parseArgs(["--remote"]), /LOCAL/);
  assert.throws(() => E.parseArgs(["--budget", "-1"]), /USD/);
  const d = L.execLocal("SELECT 1", { dryRun: true });
  assert.ok(d.dryRun && d.args.includes("--local") && !d.args.includes("--remote"), "dry run: local D1 only");
  assert.throws(() => L.execLocal("SELECT 1", { run: () => ({ status: 0 }), persistTo: "--remote" }), /local D1 only/, "--remote can never slip in");
  assert.throws(() => L.execLocal("SELECT 1", { run: () => ({ status: 1, stderr: "boom" }) }), /--local failed/);
});

test("ai-test-enable: features on with a 50 USD total (40/40/20), image mode for pc_fields; --off = new-install defaults; local D1 only; no key printed", async () => {
  const L = await lib(), E = await en();
  const on = await L.buildSettings({});
  assert.equal(on.enabled, true);
  const budgets = L.PC_FEATURES.map(f => on.features[f].monthlyBudgetUsd);
  assert.deepEqual(budgets, [20, 20, 10]); assert.equal(budgets.reduce((a, b) => a + b, 0), 50);
  assert.ok(L.PC_FEATURES.every(f => on.features[f].enabled));
  assert.equal(on.features.pc_fields.imageModeAllowed, true); assert.equal(on.features.pc_claims.imageModeAllowed, false);
  const off = await L.buildSettings({ off: true });
  assert.equal(off.enabled, false);
  assert.ok(L.PC_FEATURES.every(f => !off.features[f].enabled && off.features[f].monthlyBudgetUsd === 0 && !off.features[f].imageModeAllowed));
  await assert.rejects(L.buildSettings({ chains: { pc_claims: [{ provider: "nope", model: "x" }] } }), /provider/, "the gateway's own validation applies");
  const sql = L.settingsSql({ a: "it's" }, 1);
  assert.match(sql, /^INSERT INTO settings \(key, value, updated_at\) VALUES \('ai_gateway', '\{"a":"it''s"\}', 1\)/);
  // main with a fake wrangler and a temp .dev.vars holding a fake key value
  const dir = mkdtempSync(join(tmpdir(), "lq-p7-"));
  const dv = join(dir, ".dev.vars");
  writeFileSync(dv, "ANTHROPIC_API_KEY=sk-ant-FAKE-SECRET-VALUE-123\nOPENAI_API_KEY=\nALLOWED_ORIGINS=http://localhost:8000\n");
  const calls = [], logs = [];
  const r = await E.main(["--budget", "30", "--chain", "pc_claims=openai:gpt-6.1-terra"], { env: {}, run: (cmd, a) => { calls.push([cmd, a]); return { status: 0 }; }, devVars: dv,
    log: s => logs.push(s) });
  assert.equal(calls.length, 1);
  const args = calls[0][1];
  assert.ok(args.includes("--local") && !args.includes("--remote") && args[0] === "wrangler" && args[1] === "d1");
  assert.equal(r.value.features.pc_claims.chain[0].model, "gpt-6.1-terra");
  assert.deepEqual(L.PC_FEATURES.map(f => r.value.features[f].monthlyBudgetUsd), [12, 12, 6]);
  const out = logs.join("\n");
  assert.ok(!/FAKE-SECRET/.test(out) && !args.join(" ").includes("FAKE-SECRET"), "a key value is never printed or passed");
  assert.match(out, /keys set \(names only\): ANTHROPIC_API_KEY$/m, "OPENAI_API_KEY with no value is not 'set'");
  assert.match(out, /AI_EVAL_LOCAL=1/); assert.match(out, /TURNSTILE_DISABLED_FOR_LOCAL_DEV/);
  await assert.rejects(E.main([], { env: { CI: "1" } }), /CI/);
});

/** Fake local Worker: models with a key answer; cost per call fixed per model. */
function fakeWorker({ keys, cost, noEval }) {
  let chain = null;
  const posts = [];
  const setChain = async (p, m) => { chain = { p, m }; };
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const J = (o, s = 200) => ({ status: s, json: async () => o });
    if (u.pathname === "/v1/ai/providers") return J({ enabled: true, chain: keys.includes(chain.p) ? [{ provider: chain.p, model: chain.m }] : [] });
    const f = u.pathname.split("/").pop(), b = JSON.parse(init.body);
    posts.push({ f, b, origin: init.headers.Origin, model: chain.m });
    const evalInfo = noEval ? {} : { eval: { costMicros: cost[chain.m] || 1000, attempts: [] } };
    if (f === "pc_fields") return J({ ok: true, json: { product_type: "drug", brand: "SAMPLAMOL", registration: [{ number: "1A 844/39" }, { number: "9Z 1/11" }], lot: "2405A",
      expiry: "05/2027" }, ...evalInfo });
    if (f === "pc_translate") return J({ ok: true, json: { source_language: "zh", lines: [{ source: "每次1粒，每日2次", translation: "ครั้งละ 1 เม็ด วันละ 2 ครั้ง" }] }, ...evalInfo });
    return J({ ok: true, json: { signals: [{ rule_id: "D01", evidence: "x" }] }, ...evalInfo });
  };
  return { fetch, setChain, posts };
}

test("pc-ai-eval: skips a provider without a key; per-model cap and total budget stop the run; texts go through the guard; Origin is local", async () => {
  const E = await ev();
  const { sets } = await E.loadSets("/nonexistent");
  const w = fakeWorker({ keys: ["anthropic", "openai"], cost: { "claude-haiku-5-5": 100000, "gpt-6-luna": 2000000 } });
  const budget = new E.Budget(5, 1); // 5 USD total, 1 USD per model
  const rows = await E.runEval({ base: "http://127.0.0.1:8787", origin: "http://localhost:8000", models: ["anthropic:claude-haiku-5-5", "deepseek:deepseek-flash", "openai:gpt-6-luna"],
    features: ["pc_fields", "pc_translate"], sets: { ...sets, pc_fields: [...sets.pc_fields, { id: "pii", text: "ชื่อผู้ป่วย: สมมติ ใจทดสอบ\nSAMPLAMOL", expect: sets.pc_fields[0].expect }] },
    budget, fetch: w.fetch, setChain: w.setChain });
  assert.equal(rows[1].skipped, "no key / not configured");
  assert.ok(!w.posts.some(p => p.model === "deepseek-flash"), "no call for a provider without a key");
  // haiku: 0.1 USD per call; cap 1 USD -> stops before the worst call x1.5 would pass the cap
  const haiku = w.posts.filter(p => p.model === "claude-haiku-5-5").length;
  assert.ok(haiku <= 9 && budget.spentUsd("anthropic:claude-haiku-5-5") <= 1, "per-model cap kept " + haiku);
  assert.equal(rows[0].stopped, "model cap");
  // luna: 2 USD per call -> first call allowed (cost unknown before it), then over its 1 USD cap... recorded and stopped
  assert.ok(budget.spentUsd() <= 5 + 2, "total budget");
  assert.ok(w.posts.every(p => p.origin === "http://localhost:8000" && p.b.consent === true && p.b.mode === "text"));
  assert.ok(!w.posts.some(p => /สมมติ/.test(JSON.stringify(p.b))), "every text goes through the patient-name guard");
  const total = new E.Budget(0.25, 10);
  const w2 = fakeWorker({ keys: ["anthropic", "openai"], cost: { "claude-haiku-5-5": 100000, "gpt-6-luna": 100000 } });
  const r2 = await E.runEval({ base: "http://127.0.0.1:8787", origin: "http://localhost:8000", models: ["anthropic:claude-haiku-5-5", "openai:gpt-6-luna"], features: ["pc_fields"],
    sets, budget: total,
    fetch: w2.fetch, setChain: w2.setChain });
  assert.equal(r2[0].stopped, "total budget"); assert.equal(r2[1].skipped, "total budget reached");
  assert.ok(total.spentUsd() <= 0.25);
  const w3 = fakeWorker({ keys: ["anthropic"], cost: {}, noEval: true });
  await assert.rejects(E.runEval({ base: "http://127.0.0.1:8787", origin: "http://localhost:8000", models: ["anthropic:claude-haiku-5-5"], features: ["pc_fields"], sets, budget: new E.Budget(5, 5),
    fetch: w3.fetch, setChain: w3.setChain }), /AI_EVAL_LOCAL=1/, "no settled cost -> refuse to continue");
  const sum = E.summarize(rows, null);
  const md = E.markdown(sum);
  assert.match(md, /skipped: no key/); assert.match(md, /synthetic/);
  assert.ok(sum[0].features.pc_fields.cost_usd > 0 && sum[0].features.pc_fields.p50_ms != null);
});

test("pc-ai-eval scoring: fields (exact after normalisation, invented numbers counted), translation (coverage, numbers kept, terms)", async () => {
  const E = await ev();
  const t = JSON.parse(readFileSync(join(__dirname, "..", "..", "docs", "product-check", "p7-ai-testset.json"), "utf8"));
  assert.match(t.source, /^synthetic/);
  assert.ok(t.fields.length >= 16 && t.translate.length >= 10);
  const f = E.scoreFields(t.fields[0], { product_type: "drug", brand: "Samplamol 500", registration: [{ number: "1A844/39" }, { number: "2A 1/60" }], lot: "2405 A", expiry: "05/2027" });
  assert.deepEqual(f, { product_type: true, brand: true, registration: true, lot: true, expiry: true, invented: 1 });
  assert.equal(E.scoreFields(t.fields[0], null).registration, false);
  const tr = E.scoreTranslate(t.translate[0], { lines: [{ source: "每次1粒，每日2次", translation: "ครั้งละ 1 เม็ด วันละ 2 ครั้ง" }] });
  assert.deepEqual(tr, { lines: 2, covered: 1, keepN: 2, kept: 2, term: 1 });
  assert.equal(E.SOURCES.pc_claims.startsWith("public dataset"), true);
  const models = await E.defaultModels();
  assert.ok(models.includes("anthropic:claude-haiku-5-5") && models.includes("dashscope:qwen3-vl-plus") && !models.some(m => m.endsWith(":*")));
});

test("pc-ai-eval in local evaluation mode: advert snippets are sent and counted as label_filter_skipped; a Worker bad_input is a 0-cost fallback, not a crash", async () => {
  const E = await ev();
  const G = require("../../lensiq-pc-guard.js");
  const ad = "อาหารเสริมลดน้ำหนัก ผอมไวใน 7 วัน ไม่มีผลข้างเคียง รักษาหายขาด";
  const label = "ยาแก้ปวด TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nรักษาหายขาด 100%";
  const disp = "ชื่อผู้ป่วย: [removed]\nHN [removed]\nรับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร\nPARACETAMOL 500 mg";
  assert.equal(G.aiGate(ad).reason, "no-product"); assert.equal(G.aiGate(label).allow, true); assert.equal(G.aiGate(disp).reason, "dispensing");
  const sets = { pc_claims: [{ id: "ad", text: ad, category: "supplement", expected: ["F13"], device: [] }, { id: "label", text: label, category: "drug", expected: ["D01"], device: ["D01"] },
    { id: "disp", text: disp, category: "drug", expected: [], device: [] }] };
  const posts = [];
  // a Worker in local evaluation mode: answers everything except a dispensing label (400 bad_input, no eval info, no call)
  const fetch = async (url, init = {}) => {
    const J = (o, s = 200) => ({ status: s, json: async () => o });
    if (new URL(url).pathname === "/v1/ai/providers") return J({ enabled: true, chain: [{ provider: "anthropic", model: "claude-haiku-5-5" }] });
    const b = JSON.parse(init.body); posts.push(b);
    if (G.aiGate(b.input.text).reason === "dispensing") return J({ fallback: true, reason: "bad_input" }, 400);
    return J({ ok: true, json: { signals: [] }, eval: { costMicros: 1000, attempts: [] } });
  };
  const budget = new E.Budget(5, 5);
  const rows = await E.runEval({ base: "http://127.0.0.1:8787", origin: "http://localhost:8000", models: ["anthropic:claude-haiku-5-5"], features: ["pc_claims"], sets, budget, fetch,
    setChain: async () => {} });
  const st = rows[0].features.pc_claims;
  assert.equal(st.n, 3); assert.equal(st.ok, 2); assert.deepEqual(st.fallback, { bad_input: 1 });
  assert.equal(st.labelFilterSkipped, 1, "only the advert snippet needed the local-evaluation skip (the dispensing label is never skipped)");
  assert.equal(st.costMicros, 2000, "the refused item cost nothing");
  assert.ok(posts.every(b => !("evalLocal" in b) && !("evalLocal" in b.input) && !("eval" in b)), "the runner sends no switch: the mode is the Worker's own variable");
  const sum = E.summarize(rows, (await import("../../tools/pc-claims-eval.mjs")).score);
  assert.equal(sum[0].features.pc_claims.label_filter_skipped, 1);
  // a 400 with another reason, or a 200 without cost, still stops the run
  const bad = async (url, init) => (new URL(url).pathname === "/v1/ai/providers" ? fetch(url, init) : { status: 400, json: async () => ({ fallback: true, reason: "consent_required" }) });
  await assert.rejects(E.runEval({ base: "http://127.0.0.1:8787", origin: "http://localhost:8000", models: ["anthropic:claude-haiku-5-5"], features: ["pc_claims"], sets, budget: new E.Budget(5, 5),
    fetch: bad, setChain: async () => {} }), /AI_EVAL_LOCAL=1/);
});
