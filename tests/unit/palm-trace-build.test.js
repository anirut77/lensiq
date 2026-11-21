// tests/unit/palm-trace-build.test.js — owner decision 174 ก (night order A4, 2026-11-21): the palm tap-to-trace labelling tool
// (tools/palm-trace/) is a local owner tool. It must exist in the repo, and it must never reach the public GitHub Pages site or
// a customer bundle, never be linked from a published page, and never be served by the product server (server.py).
// Locked with tools/eval-guard.mjs (evals-locks/palm-trace.sha256) BEFORE the product code.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repo = path.join(__dirname, "..", "..");
const TOOL_FILES = ["index.html", "palm-trace.js", "palm-trace-core.js", "palm-trace.css", "serve.mjs"].map(f => "tools/palm-trace/" + f);
const build = () => import(path.join(repo, "tools", "build-site.mjs"));

/** every file under dir, POSIX relative */
function tree(dir) {
  const out = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(dir, p).split(path.sep).join("/")); } };
  walk(dir); return out;
}
/** files of a built site that mention the tool (name or folder) */
function mentions(dir) {
  return tree(dir).filter(f => /palm-trace/i.test(f) || (/\.(html|js|mjs|css|json|webmanifest|txt|xml)$/.test(f) && /palm-trace/i.test(fs.readFileSync(path.join(dir, f), "utf8"))));
}

test("the tool exists in the repo (so the checks below are not vacuous)", () => {
  for (const f of TOOL_FILES) assert.ok(fs.existsSync(path.join(repo, f)), f + " exists");
});

test("allow-list / forbidden list: no tool file can be published", async () => {
  const B = await build();
  for (const f of TOOL_FILES) {
    assert.ok(!B.ALLOW.some(re => re.test(f)), f + " matches no ALLOW pattern");
    assert.ok(B.forbiddenReason(f), f + " is forbidden (tools/)");
  }
  const pub = B.publishedFiles(repo);
  assert.ok(pub.length > 100, "sanity: the site has files");
  assert.deepEqual(pub.filter(f => /palm-trace/i.test(f)), [], "nothing named palm-trace is published");
});

test("no published page or script links to the tool", async () => {
  const B = await build();
  const hits = B.publishedFiles(repo).filter(f => /\.(html|js|css|json|xml|txt)$/.test(f))
    .filter(f => /palm-trace|tools\/palm/i.test(fs.readFileSync(path.join(repo, f), "utf8")));
  assert.deepEqual(hits, [], "published files that name the tool");
});

test("product server (server.py) refuses tools/: the tool is not reachable through it", () => {
  const py = fs.readFileSync(path.join(repo, "server.py"), "utf8");
  const deny = /_DENY_PREFIX\s*=\s*\(([^)]*)\)/.exec(py);
  assert.ok(deny, "server.py has a deny-prefix list");
  assert.match(deny[1], /"tools"/, "tools/ is denied by server.py");
});

test("real builds: public site and customer bundle contain no trace of the tool", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lq-palmtrace-"));
  try {
    for (const [name, args] of [["public", []], ["customer", ["--customer"]]]) {
      const out = path.join(tmp, name);
      const r = spawnSync(process.execPath, [path.join(repo, "tools", "build-site.mjs"), ...args, "--out", out], { cwd: repo, encoding: "utf8" });
      assert.equal(r.status, 0, name + " build failed: " + r.stderr);
      assert.ok(fs.existsSync(path.join(out, "index.html")), name + " build has the home page");
      assert.ok(!fs.existsSync(path.join(out, "tools")), name + " build has no tools/ folder");
      assert.deepEqual(mentions(out), [], name + " build files that name the tool");
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
