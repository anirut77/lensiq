// tests/unit/csp-meta.test.js — tools/csp-meta.mjs: idempotent insert/update of the CSP <meta>, placement before any
// resource, parity with server.py _csp() (minus frame-ancestors), lint of CSP-hostile markup, --check mode.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync, copyFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { execFileSync } = require("node:child_process");

const ROOT = join(__dirname, "..", "..");
const FIX = join(__dirname, "fixtures");
const tool = () => import(join(ROOT, "tools", "csp-meta.mjs"));
const count = (s, re) => (s.match(re) || []).length;

test("apply() is idempotent and places the meta right after <meta charset>", async () => {
  const { apply, policy } = await tool();
  const html = readFileSync(join(FIX, "csp-plain.html"), "utf8");
  const once = apply(html), twice = apply(once);
  assert.equal(twice, once, "second run is a no-op");
  assert.equal(count(once, /http-equiv="Content-Security-Policy"/g), 1);
  const lines = once.split("\n");
  const i = lines.findIndex(l => l.startsWith("<meta charset"));
  assert.match(lines[i + 1], /^<meta http-equiv="Content-Security-Policy" content="default-src 'self'; /);
  assert.ok(once.indexOf("Content-Security-Policy") < once.indexOf("<link"), "before any resource");
  assert.equal(once.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n/, ""), html, "nothing else changed");
  assert.ok(!policy().includes("frame-ancestors"), "meta cannot carry frame-ancestors");
});

test("replaces an outdated policy (any case), keeps CRLF, works without <meta charset>", async () => {
  const { apply } = await tool();
  const html = readFileSync(join(FIX, "csp-old-crlf.html"), "utf8");
  const out = apply(html);
  assert.equal(apply(out), out);
  assert.ok(!/default-src \*/.test(out), "old policy removed");
  assert.equal(count(out, /content-security-policy/gi), 1);
  assert.ok(!/[^\r]\n/.test(out), "CRLF kept");
  assert.match(out, /<HEAD data-x="1">\r\n<meta http-equiv="Content-Security-Policy"/);
});

test("lint() flags markup the policy would block", async () => {
  const { lint, policy } = await tool();
  assert.deepEqual(lint(readFileSync(join(FIX, "csp-plain.html"), "utf8")), []);
  const p = lint(readFileSync(join(FIX, "csp-old-crlf.html"), "utf8"));
  assert.ok(p.includes("inline <script>") && p.includes("inline on*= handler"), p.join());
  assert.deepEqual(lint('<script type="application/ld+json">{"a":1}</script>'), []);
  assert.match(lint('<script src="https://cdn.example/x.js"></script>').join(), /^third-party script\/style origin/);
  // fonts are self-hosted now: a Google Fonts stylesheet is a third-party origin like any other
  assert.match(lint('<link href="https://fonts.googleapis.com/css2?family=Prompt" rel="stylesheet">').join(), /third-party/);
  assert.ok(!policy().includes("fonts.g"), "no Google origin in the policy");
});

test("policy matches server.py _csp() except frame-ancestors; connect-src extras validated", async () => {
  const { policy } = await tool();
  const py = readFileSync(join(ROOT, "server.py"), "utf8");
  const body = py.slice(py.indexOf("def _csp():"), py.indexOf("SECURITY_HEADERS"));
  const server = [...body.matchAll(/^\s+\(?"([a-z-]+-(?:src|uri|action|ancestors)[^"]*)"/gm)].map(m => m[1].trim());
  assert.ok(server.length >= 12, "parsed server policy: " + server.join(" | "));
  const meta = policy().split("; ");
  assert.deepEqual(meta, server.filter(d => !d.startsWith("frame-ancestors")));
  assert.match(policy({ connect: ["https://api.example.com/", "javascript:alert(1)", "https://x y"] }), /connect-src 'self' data: blob: https:\/\/api\.example\.com;/);
});

test("CLI: --check fails on stale pages, rewrite fixes them, second run changes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "lq-csp-"));
  try {
    const f = join(dir, "p.html");
    copyFileSync(join(FIX, "csp-plain.html"), f);
    const cli = args => { try { return { code: 0, out: execFileSync(process.execPath, [join(ROOT, "tools", "csp-meta.mjs"), ...args], { encoding: "utf8" }) }; } catch (e) { return { code: e.status, out: String(e.stdout) }; } };
    assert.equal(cli(["--check", f]).code, 1);
    assert.match(cli([f]).out, /1 updated/);
    const after = readFileSync(f, "utf8");
    assert.match(cli([f]).out, /0 updated/);
    assert.equal(readFileSync(f, "utf8"), after);
    assert.equal(cli(["--check", f]).code, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
