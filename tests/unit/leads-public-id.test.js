"use strict";
// tests/unit/leads-public-id.test.js — owner update 2026-11-12: the public contact for quote requests is the brand LINE
// Official Account "LENSIQ" (@632yliiw). A personal LINE ID the owner mentioned earlier must never appear in anything the
// public site serves (tools/build-site.mjs ALLOW list), nor anywhere else in the repository (the repository is public).
// The personal ID is assembled at run time so that this file does not contain it either.
// Also: the owner-notification secrets are entered only through the secrets tool on request and never committed.
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const PERSONAL = ["slack", "hat"].join("");
const OA = "@632yliiw";
const files = () => execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const TEXT = /\.(html|js|mjs|cjs|css|json|md|toml|txt|csv|py|sql|ya?ml|svg|webmanifest)$/i;

test("the personal LINE ID is in no file the public site serves", async () => {
  const { ALLOW } = await import("../../tools/build-site.mjs");
  const published = files().filter(f => ALLOW.some(re => re.test(f)) && TEXT.test(f) && !f.startsWith("vendor/"));
  assert.ok(published.length > 100, "site files found: " + published.length);
  assert.ok(published.includes("lensiq-config.js") && published.includes("privacy.html") && published.includes("i18n/en-common.js"));
  const hits = published.filter(f => readFileSync(join(ROOT, f), "utf8").toLowerCase().includes(PERSONAL));
  assert.deepEqual(hits, [], "personal LINE ID found in published files");
});

test("the personal LINE ID is nowhere in the repository (docs, tests, tools, backend included)", () => {
  const hits = files().filter(f => TEXT.test(f) && !f.startsWith("vendor/") && statSync(join(ROOT, f)).size < 8e6)
    .filter(f => readFileSync(join(ROOT, f), "utf8").toLowerCase().includes(PERSONAL));
  assert.deepEqual(hits, [], "personal LINE ID found");
});

test("the brand Official Account is configured in one place and linked in the add-friend form", () => {
  const cfg = readFileSync(join(ROOT, "lensiq-config.js"), "utf8");
  assert.match(cfg, /^\s*quote_line: "@632yliiw",/m);
  assert.equal(cfg.split(OA).length - 1, 1, "one place only");
  const legal = readFileSync(join(ROOT, "legal.js"), "utf8");
  assert.match(legal, /"https:\/\/line\.me\/R\/ti\/p\/" \+ oa/, "privacy page link: https://line.me/R/ti/p/@632yliiw");
});

test("owner LINE notification secrets: entered with the secrets tool (hidden prompt), never committed; owner steps documented", async () => {
  const { SECRETS } = await import("../../tools/secrets-setup.mjs");
  for (const n of ["LINE_CHANNEL_ACCESS_TOKEN", "LEAD_NOTIFY_LINE_TO"]) {
    const s = SECRETS.find(x => x.name === n);
    assert.ok(s, n + " listed");
    assert.equal(s.when, "later"); assert.ok(!s.gen, n + " is typed by the owner");
  }
  const toml = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
  assert.ok(!/^\s*(LINE_CHANNEL_ACCESS_TOKEN|LEAD_NOTIFY_LINE_TO)\s*=/m.test(toml), "no committed value");
  const deploy = readFileSync(join(ROOT, "docs", "DEPLOY.md"), "utf8");
  for (const c of [/npm run secrets:setup -- --only LINE_CHANNEL_ACCESS_TOKEN/, /npm run secrets:setup -- --only LEAD_NOTIFY_LINE_TO/, /npm run backend:notify-test/,
    /Basic settings\*\* → \*Your user ID\*/, /Channel access token \(long-lived\)/]) assert.match(deploy, c);
  assert.match(readFileSync(join(ROOT, "package.json"), "utf8"), /"backend:notify-test": "node tools\/notify-test\.mjs"/);
});
