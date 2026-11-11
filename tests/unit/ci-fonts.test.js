// tests/unit/ci-fonts.test.js — CI font cache (owner decision 2026-11-11): the lock lists every font package the browser
// jobs used to install with apt (fonts-thai-tlwg + its 26 fonts-tlwg-* packages, fonts-noto-cjk) with a SHA-256; both
// browser jobs install through tools/ci-fonts.mjs with a cache keyed by the lock, and no job calls apt-get for fonts.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const CI = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");

test("lock: 28 font packages, each with a SHA-256, size and pool path; bad lines are refused", async () => {
  const m = await import("../../tools/ci-fonts.mjs");
  const list = m.readLock();
  assert.equal(list.length, 28);
  const names = list.map(p => p.file.split("_")[0]);
  assert.ok(names.includes("fonts-thai-tlwg") && names.includes("fonts-noto-cjk"));
  assert.equal(names.filter(n => /^fonts-tlwg-/.test(n)).length, 26);
  assert.equal(new Set(list.map(p => p.sha)).size, 28);
  assert.throws(() => m.readLock("deadbeef  x.deb  pool/x.deb  1\n"));
  assert.throws(() => m.readLock("a".repeat(64) + "  x.deb  pool/y.deb  1\n"));
});

test("ci.yml: both browser jobs install fonts from the keyed cache through the tool; no apt-get for fonts", () => {
  assert.equal((CI.match(/key: ci-fonts-\$\{\{ hashFiles\('tools\/ci-fonts\.lock'\) \}\}/g) || []).length, 2);
  assert.equal((CI.match(/run: node tools\/ci-fonts\.mjs install ~\/\.cache\/ci-fonts/g) || []).length, 2);
  assert.doesNotMatch(CI, /apt-get install[^\n]*fonts-/);
});
