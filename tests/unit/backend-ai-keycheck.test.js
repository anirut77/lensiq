"use strict";
// tests/unit/backend-ai-keycheck.test.js — round 17 P5 (owner update 2026-11-09): the key-check command prints only provider +
// OK/FAIL/SKIP + HTTP status, never a key or a key prefix; the key is sent in a header, never in the URL; backend/.dev.vars
// is git-ignored; the tool refuses to run in CI. Mocked fetch only.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = join(__dirname, "..", "..");
const SECRETS = { anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", dashscope: "DASHSCOPE_API_KEY",
  deepseek: "DEEPSEEK_API_KEY", zai: "ZAI_API_KEY", kimi: "KIMI_API_KEY", openrouter: "OPENROUTER_API_KEY" };

test("secret names per provider are exactly the documented Worker secret names", async () => {
  const { SECRET_NAMES } = await import(join(ROOT, "backend", "src", "ai", "adapters", "index.js"));
  assert.deepEqual(SECRET_NAMES, SECRETS);
  const doc = readFileSync(join(ROOT, "docs", "AI-GATEWAY.md"), "utf8");
  for (const n of Object.values(SECRETS)) assert.match(doc, new RegExp("`" + n + "`"), n + " documented");
  const ex = readFileSync(join(ROOT, "backend", ".dev.vars.example"), "utf8");
  for (const n of Object.values(SECRETS)) assert.match(ex, new RegExp("# " + n + "=\\n"), n + " placeholder (commented, empty)");
});

test("key check: OK / FAIL / SKIP + HTTP status only; key in a header, never in the URL or the output", async () => {
  const { checkKeys } = await import(join(ROOT, "backend", "src", "ai", "adapters", "keycheck.js"));
  const { formatLine, parseVars } = await import(join(ROOT, "tools", "ai-key-check.mjs"));
  const keys = { ANTHROPIC_API_KEY: "sk-ant-secretvalue-AAAA1111", GEMINI_API_KEY: "AIzaSECRETVALUEBBBB2222", OPENAI_API_KEY: "sk-proj-SECRETCCCC3333",
    DEEPSEEK_API_KEY: "sk-SECRETDDDD4444", OPENROUTER_API_KEY: "sk-or-v1-SECRETEEEE5555" };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("deepseek")) throw new Error("network down " + init.headers.Authorization);
    if (url.includes("openai")) return new Response(JSON.stringify({ error: { message: "Incorrect API key provided: sk-proj-SECRETCCCC3333" } }), { status: 401 });
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };
  const rows = await checkKeys(keys, fetchImpl);
  const by = Object.fromEntries(rows.map(r => [r.provider, r]));
  assert.deepEqual([by.anthropic.status, by.anthropic.http], ["OK", 200]);
  assert.deepEqual([by.openai.status, by.openai.http], ["FAIL", 401]);
  assert.deepEqual([by.deepseek.status, by.deepseek.http], ["FAIL", null]);
  assert.deepEqual([by.kimi.status, by.dashscope.status, by.zai.status], ["SKIP", "SKIP", "SKIP"]);
  assert.equal(calls.length, 5, "one request per configured provider");
  for (const c of calls) {
    assert.equal(c.init.method, "GET", "read-only, nothing generated");
    for (const k of Object.values(keys)) assert.ok(!c.url.includes(k) && !c.url.includes(k.slice(0, 8)), "key in URL");
  }
  const out = rows.map(formatLine).join("\n") + JSON.stringify(rows);
  for (const k of Object.values(keys)) {
    assert.ok(!out.includes(k), "key printed");
    for (const n of [4, 6, 8]) assert.ok(!out.includes(k.slice(0, n) + k.slice(n, n + 2)) && !out.includes(k.slice(-n)), "key prefix / suffix printed");
  }
  assert.match(formatLine(by.openai), /^openai\s+OPENAI_API_KEY\s+FAIL http=401$/);
  assert.deepEqual(parseVars('# c\nOPENAI_API_KEY="x y"\nOTHER=1\nexport KIMI_API_KEY=k\n'), { OPENAI_API_KEY: "x y", KIMI_API_KEY: "k" });
});

test("backend/.dev.vars is git-ignored; the key check refuses to run in CI", () => {
  const ign = execFileSync("git", ["check-ignore", "backend/.dev.vars"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(ign, "backend/.dev.vars");
  assert.throws(() => execFileSync(process.execPath, [join(ROOT, "tools", "ai-key-check.mjs")], { env: { ...process.env, CI: "true" }, stdio: "pipe" }), e => e.status === 2);
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts["ai:keycheck"], "node tools/ai-key-check.mjs");
});
