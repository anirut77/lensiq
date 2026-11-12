"use strict";
// tests/unit/helpline-tool.test.js — tools/helpline.mjs --check: the static help line in every hand-written fortune page
// matches LQFortuneCrisis.HELP, and every i18n dictionary that carries help.line.* says exactly the same text.
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

test("tools/helpline.mjs --check passes (pages and dictionaries in sync with fortune-crisis.js HELP)", () => {
  const out = execFileSync(process.execPath, [join(__dirname, "..", "..", "tools", "helpline.mjs"), "--check"], { encoding: "utf8" });
  assert.match(out, /all \d+ pages current/);
});
