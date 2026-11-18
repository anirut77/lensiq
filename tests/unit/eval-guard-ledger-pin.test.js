// tests/unit/eval-guard-ledger-pin.test.js — review F1 (REVIEW-110, 2026-11-18): the start of the ledger rule (owner decision
// 110 ก condition 4) is pinned. Moving LEDGER_FROM later would exempt new locks from L1 / L2, so it changes only by a recorded
// re-lock of this file. tools/eval-guard.mjs itself is locked in evals-locks/eval-guard.sha256 too, so any guard change needs one.
// This file is itself locked: evals-locks/eval-guard.sha256 (field copy ~/LENSIQ-field/evals/eval-guard/pin-1/).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const GUARD = join(__dirname, "..", "..", "tools", "eval-guard.mjs");

test("LEDGER_FROM is pinned to 2026-11-18T02:26:42Z (the lock time of tests/unit/eval-guard-ledger.test.js)", async () => {
  const G = await import(pathToFileURL(GUARD).href);
  assert.equal(G.LEDGER_FROM, "2026-11-18T02:26:42Z");
});
