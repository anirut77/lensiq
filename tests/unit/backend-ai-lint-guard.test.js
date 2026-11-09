"use strict";
// tests/unit/backend-ai-lint-guard.test.js — round 17 P5 fixed test set: provider hosts / names / the provider SDK may
// appear in backend/src ONLY under backend/src/ai/adapters/ (tools/check-ai-providers.mjs, run by `npm run lint`).
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { execFileSync } = require("node:child_process");

const ROOT = join(__dirname, "..", "..");
const TOOL = join(ROOT, "tools", "check-ai-providers.mjs");

test("lint guard: the real backend/src is clean", async () => {
  const { scan } = await import(TOOL);
  assert.deepEqual(scan(ROOT), []);
});

test("lint guard: a planted provider string outside ai/adapters fails; the same string inside ai/adapters passes", async () => {
  const { scan, PATTERNS } = await import(TOOL);
  const tmp = mkdtempSync(join(tmpdir(), "lq-guard-"));
  try {
    mkdirSync(join(tmp, "backend", "src", "ai", "adapters"), { recursive: true });
    const planted = ["https://api.anthropic.com/v1/messages", "generativelanguage.googleapis.com", "https://api.openai.com/v1", "dashscope-intl.aliyuncs.com",
      "api.deepseek.com", "open.bigmodel.cn z.ai", "api.moonshot.ai", "kimi-k3", "https://openrouter.ai/api/v1", 'import x from "@anthropic-ai/sdk";'];
    planted.forEach((s, i) => writeFileSync(join(tmp, "backend", "src", `planted${i}.js`), `// @ts-check\nexport const u = ${JSON.stringify(s)};\n`));
    writeFileSync(join(tmp, "backend", "src", "ai", "adapters", "ok.js"), planted.map(s => `export const a${planted.indexOf(s)} = ${JSON.stringify(s)};`).join("\n"));
    writeFileSync(join(tmp, "backend", "src", "ai", "core.js"), "export const fine = 'anthropic gemini openai provider-neutral';\n");
    const hits = scan(tmp);
    assert.deepEqual([...new Set(hits.map(h => h.file))].sort(), planted.map((_, i) => `backend/src/planted${i}.js`).sort(), JSON.stringify(hits));
    assert.ok(!hits.some(h => h.file.includes("adapters")), "adapters are allowed");
    assert.ok(PATTERNS.length >= 9);
    // the CLI exits 1 on the planted tree, 0 on the real one
    assert.throws(() => execFileSync(process.execPath, [TOOL, "--root", tmp], { stdio: "pipe" }), e => e.status === 1);
    execFileSync(process.execPath, [TOOL], { stdio: "pipe", cwd: ROOT });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("lint guard is wired into npm run lint", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert.match(pkg.scripts.lint, /check-ai-providers\.mjs/);
});
