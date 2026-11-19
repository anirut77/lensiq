// tests/unit/pii-guard-r1.test.js — independent review round 1 of pii-guard (f82f2034) found fail-open gaps in
// tools/pii-scan.mjs and the CI step. One test per finding; locked (evals-locks/pii-guard.sha256) BEFORE the fixes and
// shown failing on f82f2034. Every sample is built at run time so this file holds none.
//   R1 long lines (> 20k chars) and files > 2 MB were skipped silently
//   R2a an added line whose text starts with "++ " was read as a "+++ " file header
//   R2b quoted paths (spaces, non-ASCII, tabs) slipped past the forbidden-path rules
//   R3 CI: a run with no usable base scanned an empty range; --range HEAD (full history) must work
//   R5 more Thai phone formats and lower-case English street addresses (without new false positives)
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const SCAN = join(REPO, "tools", "pii-scan.mjs");
let S;
before(async () => { S = await import(pathToFileURL(SCAN).href); });

const J = (...parts) => parts.join("");
const PHONE = J("08", "1-", "555-", "0123");
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const git = (dir, ...args) => {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd: dir, encoding: "utf8", env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
const scan = (dir, ...args) => spawnSync(process.execPath, [SCAN, "--repo", dir, ...args], { encoding: "utf8", env: GIT_ENV });
function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pii-guard-r1-"));
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "README.md"), "clean\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "clean");
  return dir;
}
const commitAll = (dir, msg) => { git(dir, "add", "-A", "-f"); git(dir, "commit", "-q", "-m", msg); return git(dir, "rev-parse", "HEAD"); };

test("R1 a phone inside a 25 KB single-line JSON is caught (scanText and --tracked)", () => {
  const pad = n => "a".repeat(n);
  for (const at of [100, 19500, 19995, 21000, 24000]) {
    const line = J('{"blob":"', pad(at), " tel ", PHONE, " ", pad(25000 - at), '"}');
    assert.ok(line.length > 25000);
    const hits = S.scanText(line, "big.json").filter(h => h.type === "phone");
    assert.equal(hits.length, 1, `phone at ${at}: found ${hits.length} (exactly once, no double count from window overlap)`);
  }
  const dir = tempRepo();
  try {
    writeFileSync(join(dir, "big.json"), J('{"blob":"', pad(21000), " tel ", PHONE, " ", pad(4000), '"}'));
    commitAll(dir, "big");
    const r = scan(dir, "--tracked");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /phone\s+big\.json:1/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("R1 a text file over 2 MB is scanned too", () => {
  const dir = tempRepo();
  try {
    const filler = "x".repeat(99) + "\n";
    writeFileSync(join(dir, "huge.txt"), filler.repeat(25000) + J("tel ", PHONE, "\n"));
    commitAll(dir, "huge");
    const r = scan(dir, "--tracked");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /phone\s+huge\.txt:25001/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("R2a an added line starting with '++ ' is content, not a header (--range and --staged)", () => {
  const dir = tempRepo();
  try {
    const base = git(dir, "rev-parse", "HEAD");
    writeFileSync(join(dir, "notes.txt"), J("intro\n", "++ call ", PHONE, "\n", "+++ also ", PHONE, "\n"));
    commitAll(dir, "notes");
    const r = scan(dir, "--range", `${base}..HEAD`);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const out = r.stdout + r.stderr;
    assert.match(out, /phone\s+notes\.txt:2/);
    assert.match(out, /phone\s+notes\.txt:3/);
    writeFileSync(join(dir, "more.txt"), J("++ ", PHONE, "\n"));
    git(dir, "add", "more.txt");
    const s = scan(dir, "--staged");
    assert.equal(s.status, 1, s.stdout + s.stderr);
    assert.match(s.stdout + s.stderr, /phone\s+more\.txt:1/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("R2b quoted paths (space, non-ASCII, tab) still hit the forbidden-path rules and keep their real name", () => {
  const dir = tempRepo();
  try {
    const base = git(dir, "rev-parse", "HEAD");
    const names = [join("my dir", ".env"), join("ข้อมูล", ".dev.vars"), join("tab\there", ".env.local"), join("x y", ".wrangler", "cache", "cf.json")];
    for (const n of names) {
      mkdirSync(join(dir, n, ".."), { recursive: true });
      writeFileSync(join(dir, n), "K=v\n");
    }
    mkdirSync(join(dir, "ไฟล์ ทดสอบ"), { recursive: true });
    writeFileSync(join(dir, "ไฟล์ ทดสอบ", "a b.txt"), J("tel ", PHONE, "\n"));
    commitAll(dir, "quoted");
    const r = scan(dir, "--range", `${base}..HEAD`, "--json");
    assert.equal(r.status, 1, r.stderr);
    const f = JSON.parse(r.stdout).findings;
    for (const n of names) assert.ok(f.some(x => x.type === "forbidden-path" && x.path === n), `forbidden-path for ${JSON.stringify(n)}`);
    assert.ok(f.some(x => x.type === "phone" && x.path === join("ไฟล์ ทดสอบ", "a b.txt")), "content finding names the unquoted path");
    // staged
    const dir2 = tempRepo();
    try {
      mkdirSync(join(dir2, "a b"), { recursive: true });
      writeFileSync(join(dir2, "a b", ".env"), "K=v\n");
      git(dir2, "add", "-A", "-f");
      const s = scan(dir2, "--staged", "--json");
      assert.equal(s.status, 1, s.stderr);
      assert.ok(JSON.parse(s.stdout).findings.some(x => x.type === "forbidden-path" && x.path === join("a b", ".env")));
    } finally { rmSync(dir2, { recursive: true, force: true }); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("R3 --range HEAD scans the full history (data added then removed is still found)", () => {
  const dir = tempRepo();
  try {
    writeFileSync(join(dir, "old.txt"), J("tel ", PHONE, "\n"));
    const bad = commitAll(dir, "add");
    git(dir, "rm", "-q", "old.txt");
    git(dir, "commit", "-q", "-m", "remove");
    assert.equal(scan(dir, "--tracked").status, 0);
    assert.equal(scan(dir, "--range", "HEAD..HEAD").status, 0, "an empty range finds nothing (this is why CI must not use one)");
    const r = scan(dir, "--range", "HEAD");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok((r.stdout + r.stderr).includes(bad.slice(0, 8)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("R3 CI never scans an empty range: no usable base falls back to the full history", () => {
  const ci = readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8");
  const job = ci.slice(ci.indexOf("\n  pii:"), ci.indexOf("\n  python:"));
  assert.ok(job.length > 100, "pii job found");
  assert.match(job, /node tools\/pii-scan\.mjs --range HEAD\s*$/m, "full-history fallback");
  assert.match(job, /if \[ -z "\$base" \]/, "empty base goes to the fallback");
  assert.match(job, /\[ "\$base" = "\$head" \]/, "a merge-base equal to HEAD is not used as the base");
  assert.match(job, /fetch-depth: 0/);
});

test("R5 more Thai phone formats and lower-case street addresses are caught", () => {
  const phones = [
    J("(0", "89) ", "555 ", "0123"), J("0", "89.", "555.", "0123"), J("0", "8-", "9555-", "0123"),
    J("66", "89", "555", "0123"), J("00", "66 ", "89 ", "555 ", "0123"), J("+66", "-2-", "555-", "0123")
  ];
  for (const p of phones) assert.ok(S.scanText(J("tel ", p), "x").some(h => h.type === "phone"), `phone format #${phones.indexOf(p)}`);
  for (const a of [J("ship to ", "221 ", "baker ", "street"), J("at ", "12 ", "sukhumvit ", "road")]) {
    assert.ok(S.scanText(a, "x").some(h => h.type === "street-address"), "lower-case address");
  }
  for (const clean of ["3 lanes on fake cameras", "100 THB per lane per month", "4 A busy street scene", "version 1.2.3.4 build",
    J("ratio ", "0.", "89", "5550123"), J("id ", "1", "66", "89", "5550123", "77")]) {
    assert.deepEqual(S.scanText(clean, "x"), [], `false positive: ${clean.replace(/\d/g, "#")}`);
  }
});
