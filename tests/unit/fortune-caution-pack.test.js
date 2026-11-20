"use strict";
// tests/unit/fortune-caution-pack.test.js — product check (not a locked set) for item 177: the browser rule packs
// fortune-caution-pack-<domain>-<lang>.js equal what tools/fortune-caution-pack.mjs writes from the registry (every text
// passed the section's filter in each place it can show), and the version V of fortune-caution.js matches the core and packs.
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");

test("fortune-caution packs and the lazy-file version are up to date", () => {
  let out = "";
  try { out = execFileSync(process.execPath, [join(ROOT, "tools", "fortune-caution-pack.mjs"), "--check"], { encoding: "utf8", stdio: "pipe" }); } catch (e) {
    assert.fail("run `node tools/fortune-caution-pack.mjs` and commit: " + String(e.stderr || e.message));
  }
  assert.match(out, /packs OK \(18 files/);
});

test("the shell loads nothing but its own file before the tap and stays under 8 KB", () => {
  const { statSync, readFileSync } = require("node:fs");
  assert.ok(statSync(join(ROOT, "fortune-caution.js")).size <= 8192);
  const src = readFileSync(join(ROOT, "fortune-caution.js"), "utf8");
  assert.match(src, /load\("fortune-caution-core\.js"\)/, "core loaded lazily from show()");
});
