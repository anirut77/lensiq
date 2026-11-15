"use strict";
// tests/unit/secrets-setup-line.test.js — format check of the two LINE secrets at entry (owner order 2026-11-15,
// "LINE lead notification is never silent"). FIXED TEST SET written before the build; sha256 in
// evals-locks/lead-notify.sha256 (~/LENSIQ-field/evals/lead-notify/).
//   1. one shared check (backend/src/line-config.js) used by the Worker AND by `npm run secrets:setup`: it trims spaces and
//      line breaks, then names a reason code only (never the value)
//   2. `npm run secrets:setup -- --only LEAD_NOTIFY_LINE_TO` (the single-secret path) refuses a wrong value with a clear
//      reason, never echoes it, never sends it, and offers no "send anyway"; a good value with a trailing line break is
//      sent trimmed on wrangler's stdin (never argv)
//   3. the same for LINE_CHANNEL_ACCESS_TOKEN (empty / inner whitespace / too short refused)
// A FAKE wrangler (LQ_WRANGLER_BIN, honoured only with NODE_ENV=test); canary strings only; no network, no real secret.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { PassThrough } = require("node:stream");
const { EventEmitter } = require("node:events");

const ROOT = join(__dirname, "..", "..");
const TOML = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8")
  .replace(/(\[\[env\.test\.d1_databases\]\][\s\S]*?database_id = ")[0-9a-f-]{36}"/, "$111111111-2222-4333-8444-555555555555\"");
const sha = s => createHash("sha256").update(s).digest("hex");
const TO = "U" + "0f1e2d3c4b5a6978".repeat(2);
const TOKEN = "CANARYlineTOKEN" + "Zk9".repeat(30);

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "lq-line-secret-test-"));
  const log = join(dir, "calls.jsonl");
  writeFileSync(log, "");
  const bin = join(dir, "fake-wrangler.js");
  writeFileSync(bin, `
const fs = require("fs"), crypto = require("crypto");
const argv = process.argv.slice(2);
let input = "";
const done = () => {
  fs.appendFileSync(process.env.LQ_FAKE_LOG, JSON.stringify({ argv, stdinSha: crypto.createHash("sha256").update(input).digest("hex"), stdinLen: input.length }) + "\\n");
  if (argv[0] === "deployments") { console.log(JSON.stringify([{ id: "dep-1" }])); process.exit(0); }
  if (argv[0] === "secret" && argv[1] === "list") { console.log("[]"); process.exit(0); }
  if (argv[1] === "put") { process.stdout.write("echo:" + input + "\\n"); process.stderr.write("echo:" + input + "\\n"); }
  process.exit(0);
};
if (argv[0] === "secret" && argv[1] === "put") { process.stdin.on("data", d => { input += d; }); process.stdin.on("end", done); } else done();
`);
  const env = { PATH: process.env.PATH, NODE_ENV: "test", LQ_WRANGLER_BIN: bin, LQ_FAKE_LOG: log };
  const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  const puts = () => calls().filter(c => c.argv[0] === "secret" && c.argv[1] === "put");
  return { env, calls, puts, done: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Drives tools/secrets-setup.mjs with a fake terminal: each answer is typed when a prompt (": ") is shown. */
async function run(argv, answers, sb) {
  const { main } = await import(join(ROOT, "tools", "secrets-setup.mjs"));
  const stdin = new PassThrough();
  stdin.isTTY = true; stdin.setRawMode = () => {};
  const proc = new EventEmitter(); proc.exit = () => {};
  let screen = "";
  const queue = answers.slice();
  const stdout = { isTTY: true, write: s => {
    screen += String(s);
    if (/: $/.test(String(s)) && queue.length) { const a = queue.shift(); setImmediate(() => stdin.write(a)); }
    return true;
  } };
  const code = await main(argv, { stdin, stdout, stderr: { write: () => {} }, env: sb.env, toml: TOML, proc });
  return { code, screen, left: queue.length };
}
/** no value, nor a 10-character piece of it, on the screen */
function notShown(screen, value) {
  const s = String(value).trim();
  for (let i = 0; i + 10 <= s.length; i += 3) assert.ok(!screen.includes(s.slice(i, i + 10)), "a piece of the value was shown");
  assert.ok(!screen.includes("echo:"), "wrangler output relayed");
}

test("1. one shared check: trims, then names a reason code only", async () => {
  const { lineSecretProblem, LINE_SECRETS } = await import(join(ROOT, "backend", "src", "line-config.js"));
  assert.deepEqual(LINE_SECRETS, ["LINE_CHANNEL_ACCESS_TOKEN", "LEAD_NOTIFY_LINE_TO"]);
  const T = "LINE_CHANNEL_ACCESS_TOKEN", R = "LEAD_NOTIFY_LINE_TO";
  const cases = [
    [R, TO, ""], [R, " " + TO + "\r\n", ""], [R, "", "missing"], [R, " \n ", "missing"], [R, undefined, "missing"],
    [R, "@632yliiw", "starts_with_at"], [R, TO.slice(0, 10) + " " + TO.slice(10), "whitespace"], [R, TO.slice(0, 10) + "\n" + TO.slice(10), "whitespace"],
    [R, TO.slice(0, 32), "wrong_length"], [R, TO + "0", "wrong_length"], [R, TO.toUpperCase(), "not_u32hex"], [R, "u" + TO.slice(1), "not_u32hex"],
    [R, "U" + "z".repeat(32), "not_u32hex"],
    [T, TOKEN, ""], [T, TOKEN + "\n", ""], [T, "", "missing"], [T, "\t", "missing"], [T, TOKEN.slice(0, 30) + " " + TOKEN.slice(30), "whitespace"],
    [T, "short-token", "too_short"]
  ];
  for (const [name, v, want] of cases) assert.equal(lineSecretProblem(name, v), want, name + " case " + JSON.stringify(want));
  assert.equal(lineSecretProblem("OTHER", "x"), "", "other names are not checked here");
});

test("2. --only LEAD_NOTIFY_LINE_TO refuses each wrong value with its reason, never shows or sends it; no 'send anyway'", async () => {
  const sb = sandbox();
  try {
    const bad = [["@632yliiw", /starts with "@"/], [TO.toUpperCase(), /U followed by 32/], [TO.slice(0, 20), /33 characters/],
      [TO.slice(0, 12) + " " + TO.slice(12), /space or line break inside/]];
    for (const [v, why] of bad) {
      const r = await run(["--only", "LEAD_NOTIFY_LINE_TO"], [v + "\r", "\r"], sb);
      assert.equal(r.code, 0, r.screen);
      assert.match(r.screen, /LEAD_NOTIFY_LINE_TO: not accepted/);
      assert.match(r.screen, why);
      assert.match(r.screen, /LEAD_NOTIFY_LINE_TO: skipped/);
      assert.doesNotMatch(r.screen, /Send it anyway/i, "a wrong recipient is never sent");
      notShown(r.screen, v);
      assert.equal(sb.puts().length, 0, "nothing sent for a wrong value");
    }
  } finally { sb.done(); }
});

test("2b. a good recipient with spaces / a line break around it is sent trimmed on stdin only", async () => {
  const sb = sandbox();
  try {
    const r = await run(["--only", "LEAD_NOTIFY_LINE_TO"], ["  " + TO + "  \r"], sb);
    assert.equal(r.code, 0, r.screen);
    assert.match(r.screen, /LEAD_NOTIFY_LINE_TO: set/);
    const p = sb.puts();
    assert.equal(p.length, 1);
    assert.deepEqual(p[0].argv, ["secret", "put", "LEAD_NOTIFY_LINE_TO", "--env", "test"], "the value is never in argv");
    assert.equal(p[0].stdinSha, sha(TO), "trimmed value on stdin");
    notShown(r.screen, TO);
  } finally { sb.done(); }
});

test("3. --only LINE_CHANNEL_ACCESS_TOKEN refuses inner whitespace and a too-short token; a good one goes to stdin", async () => {
  const sb = sandbox();
  try {
    for (const [v, why] of [[TOKEN.slice(0, 40) + " " + TOKEN.slice(40), /space or line break inside/], ["CANARYtiny", /too short/]]) {
      const r = await run(["--only", "LINE_CHANNEL_ACCESS_TOKEN"], [v + "\r", "\r"], sb);
      assert.match(r.screen, /LINE_CHANNEL_ACCESS_TOKEN: not accepted/);
      assert.match(r.screen, why);
      assert.match(r.screen, /LINE_CHANNEL_ACCESS_TOKEN: skipped/);
      notShown(r.screen, v);
      assert.equal(sb.puts().length, 0);
    }
    const r = await run(["--only", "LINE_CHANNEL_ACCESS_TOKEN"], [TOKEN + "\r"], sb);
    assert.match(r.screen, /LINE_CHANNEL_ACCESS_TOKEN: set/);
    assert.equal(sb.puts().length, 1);
    assert.equal(sb.puts()[0].stdinSha, sha(TOKEN));
    notShown(r.screen, TOKEN);
  } finally { sb.done(); }
});

test("4. the docs point the owner to the validated single-secret command", () => {
  for (const f of ["docs/DEPLOY.md", "docs/LEADS-DESIGN.md"]) {
    const t = readFileSync(join(ROOT, f), "utf8");
    assert.match(t, /npm run secrets:setup -- --only LEAD_NOTIFY_LINE_TO/, f);
    assert.match(t, /\/admin\/api\/leads\/notify|leads\/notify/, f + " explains where the owner sees the LINE status");
  }
});
