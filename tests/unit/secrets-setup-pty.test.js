"use strict";
// tests/unit/secrets-setup-pty.test.js — review D1 of lead-notify-health (2026-11-15): the incident cause. A LINE token
// copied WITH A LINE BREAK inside was cut at the first CR / LF by the hidden prompt, the first part was accepted, sent to
// wrangler and reported "set", and that shorter value then passed the Worker's own check. Locked cases (appended to
// evals-locks/lead-notify.sha256 before the fix):
//   1. a paste with an inner LF, an inner CRLF, and a bracketed paste (ESC[200~ ... ESC[201~) with an inner LF: refused
//      with the line-break message, 0 bytes sent to wrangler, the value never shown
//   2. the tool turns bracketed paste on (ESC[?2004h) and off again (ESC[?2004l)
//   3. no false refusal: a whole token pasted at once (and a bracketed paste with a trailing line break) is sent, trimmed
//   4. a truncated-looking token (shorter than the entry minimum) is refused at entry
// Driven through a REAL pseudo-terminal (python3 pty, tests/unit/secrets-pty-drive.py) with a FAKE wrangler; canary
// values only; no network, no real secret.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const sha = s => createHash("sha256").update(s).digest("hex");
// a long-lived channel access token is about 172 characters; this canary has the same shape and length
const TOKEN = "CANARYpty" + "Ab3/Xy9+".repeat(20) + "Kq1=";
const A = TOKEN.slice(0, 90), B = TOKEN.slice(90);

function drive(name, inputs) {
  const dir = mkdtempSync(join(tmpdir(), "lq-pty-secret-"));
  try {
    const fake = join(dir, "fake-wrangler.js"), log = join(dir, "calls.jsonl"), inp = join(dir, "inputs.json");
    writeFileSync(log, "");
    writeFileSync(inp, JSON.stringify(inputs));
    writeFileSync(fake, `
const fs = require("fs"), crypto = require("crypto");
const argv = process.argv.slice(2); let input = "";
const done = () => {
  fs.appendFileSync(process.env.LQ_FAKE_LOG, JSON.stringify({ argv, stdinSha: crypto.createHash("sha256").update(input).digest("hex"), stdinLen: input.length }) + "\\n");
  if (argv[0] === "deployments") { console.log(JSON.stringify([{ id: "dep-1" }])); process.exit(0); }
  if (argv[0] === "secret" && argv[1] === "list") { console.log("[]"); process.exit(0); }
  process.exit(0);
};
if (argv[0] === "secret" && argv[1] === "put") { process.stdin.on("data", d => { input += d; }); process.stdin.on("end", done); } else done();
`);
    const r = spawnSync("python3", ["-I", join(__dirname, "secrets-pty-drive.py"), ROOT, name, fake, log, inp],
      { encoding: "utf8", timeout: 60000, env: { PATH: process.env.PATH, HOME: process.env.HOME || "/tmp", LQ_NODE: process.execPath } });
    assert.equal(r.status, 0, "pty driver: " + (r.stderr || "").slice(0, 300));
    const screen = JSON.parse(r.stdout).screen;
    const calls = readFileSync(log, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
    return { screen, puts: calls.filter(c => c.argv[0] === "secret" && c.argv[1] === "put") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
/** no 10-character piece of the value on the screen */
function notShown(screen, value) {
  for (let i = 0; i + 10 <= value.length; i += 3) assert.ok(!screen.includes(value.slice(i, i + 10)), "a piece of the value was shown");
}

const CASES = [
  ["inner LF (plain paste)", A + "\n" + B + "\r"],
  ["inner CRLF (plain paste)", A + "\r\n" + B + "\r"],
  ["bracketed paste with an inner LF", "\x1b[200~" + A + "\n" + B + "\x1b[201~\r"],
  ["bracketed paste with an inner CRLF", "\x1b[200~" + A + "\r\n" + B + "\x1b[201~\r"]
];

for (const [label, paste] of CASES) {
  test(`1. ${label}: refused with the line-break message, nothing sent, never shown`, () => {
    const r = drive("LINE_CHANNEL_ACCESS_TOKEN", [paste, "\r"]);
    assert.match(r.screen, /line break/i, r.screen.slice(-600));
    assert.match(r.screen, /copy it again/i);
    assert.match(r.screen, /LINE_CHANNEL_ACCESS_TOKEN: skipped/);
    assert.doesNotMatch(r.screen, /LINE_CHANNEL_ACCESS_TOKEN: set/);
    assert.equal(r.puts.length, 0, "0 bytes sent to wrangler");
    notShown(r.screen, TOKEN);
  });
}

test("1b. the recipient ID pasted with an inner line break is refused too", () => {
  const TO = "U" + "0f1e2d3c4b5a6978".repeat(2);
  const r = drive("LEAD_NOTIFY_LINE_TO", [TO.slice(0, 15) + "\n" + TO.slice(15) + "\r", "\r"]);
  assert.match(r.screen, /line break/i);
  assert.equal(r.puts.length, 0);
  notShown(r.screen, TO);
});

test("2. bracketed paste is switched on for the session and off again at the end", () => {
  const r = drive("LINE_CHANNEL_ACCESS_TOKEN", ["\r"]);
  assert.ok(r.screen.includes("\x1b[?2004h"), "ESC[?2004h sent");
  assert.ok(r.screen.lastIndexOf("\x1b[?2004l") > r.screen.indexOf("\x1b[?2004h"), "ESC[?2004l sent after it");
});

test("3. no false refusal: a whole token in one paste, and a bracketed paste with a trailing line break, are sent trimmed", () => {
  let r = drive("LINE_CHANNEL_ACCESS_TOKEN", [TOKEN + "\r"]);
  assert.match(r.screen, /LINE_CHANNEL_ACCESS_TOKEN: set/, r.screen.slice(-400));
  assert.equal(r.puts.length, 1);
  assert.equal(r.puts[0].stdinSha, sha(TOKEN));
  notShown(r.screen, TOKEN);
  r = drive("LINE_CHANNEL_ACCESS_TOKEN", ["\x1b[200~" + TOKEN + "\n\x1b[201~\r"]);
  assert.match(r.screen, /LINE_CHANNEL_ACCESS_TOKEN: set/, r.screen.slice(-400));
  assert.equal(r.puts.length, 1);
  assert.equal(r.puts[0].stdinSha, sha(TOKEN), "trailing line break trimmed");
});

test("4. a token shorter than the entry minimum (a cut-off copy) is refused at entry", () => {
  const r = drive("LINE_CHANNEL_ACCESS_TOKEN", [A + "\r", "\r"]);
  assert.match(r.screen, /too short/i);
  assert.equal(r.puts.length, 0);
  notShown(r.screen, A);
});
