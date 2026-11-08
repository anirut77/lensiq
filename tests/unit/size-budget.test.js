"use strict";
// tests/unit/size-budget.test.js — the max-lines ratchet of eslint.config.mjs. ESLint fails a file that grows past its
// cap; this test fails when a cap has drifted more than 5 % above the file's real size (lower the cap in the same
// change that shrinks the file) or when a capped file is back under the default budget (delete its entry).
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = join(__dirname, "..", "..");

async function codeLines(Linter, file) {
  const msgs = new Linter().verify(readFileSync(join(ROOT, file), "utf8"), [{
    languageOptions: { ecmaVersion: 2024, sourceType: "script" },
    rules: { "max-lines": ["error", { max: 1, skipBlankLines: true, skipComments: true }] }
  }]);
  const m = msgs.find(x => x.ruleId === "max-lines");
  return m ? Number(/\((\d+)\)/.exec(m.message)[1]) : 1;
}

test("size caps: every capped file is within 5 % of its cap and still over the default budget", async () => {
  const { Linter } = await import("eslint");
  const { SIZE_CAPS, SIZE_DEFAULT } = await import(pathToFileURL(join(ROOT, "eslint.config.mjs")).href);
  assert.ok(SIZE_DEFAULT <= 1500, "the default budget never rises");
  for (const [file, cap] of Object.entries(SIZE_CAPS)) {
    const n = await codeLines(Linter, file);
    assert.ok(n <= cap, `${file}: ${n} code lines > cap ${cap} (split it; never raise the cap)`);
    assert.ok(cap <= Math.ceil(n * 1.05), `${file}: cap ${cap} has more than 5 % slack over ${n} — lower it to about ${Math.ceil(n * 1.03)}`);
    assert.ok(n > SIZE_DEFAULT, `${file}: ${n} code lines is under the default budget — delete its SIZE_CAPS entry`);
  }
});

test("max-lines is an error (not a warning) for every file and every cap", () => {
  const src = readFileSync(join(ROOT, "eslint.config.mjs"), "utf8");
  assert.match(src, /"max-lines": \["error", \{ max: 1500,/);
  assert.match(src, /"max-lines": \["error", \{ max, skipBlankLines/);
  assert.doesNotMatch(src, /"max-lines": \["warn"/);
});
