// tests/unit/pii-palm-labels.test.js — palm pilot (2026-11-21): before any pilot participant's palm photo is labelled,
// tools/pii-scan.mjs must refuse every path that could carry those photos or their labels, so they never enter git even
// when someone copies them into the repo. The owner's guide keeps them OUTSIDE the repo:
//   photos ~/LENSIQ-field/palm-pilot/photos/ (P01-L.jpg ...), labels ~/LENSIQ-field/palm-pilot/labels/A|B/
// Forbidden-path rules (case-insensitive; a forbidden path can never be allow-listed):
//   F1 any path segment palm-pilot/
//   F2 any *.palm-trace.json (the trace tool's label files)
//   F3 an image file named like a pilot code: P\d{2}-[LR](-\d+)?.(jpe?g|png|heic|webp)
// .gitignore carries the same patterns, but `git add -f` bypasses .gitignore, so pii-scan (--tracked in CI, --staged in
// tools/git-hooks/pre-commit, --range on the pushed commits) is the control. Every file here is synthetic: generated
// names and a few placeholder bytes. No real photo is used, read or viewed.
// This file is locked: evals-locks/pii-palm-labels.sha256 (written BEFORE the rule existed in tools/pii-scan.mjs).
// Re-lock 1 (stricter, test fault): the content probe in the last test used the word "synthetic", which the scanner's
// fixed help footer also prints; it now probes content-only markers and adds an image sample. No rule was relaxed.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const SCAN = join(REPO, "tools", "pii-scan.mjs");
let S;
before(async () => { S = await import(pathToFileURL(SCAN).href); });

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const git = (dir, ...args) => {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd: dir, encoding: "utf8", env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
const scan = (dir, ...args) => spawnSync(process.execPath, [SCAN, "--repo", dir, ...args], { encoding: "utf8", env: GIT_ENV });
const forbidden = p => S.scanPath(p).some(h => h.type === "forbidden-path");

// the four paths named in the order, plus variants of each rule
const ORDER_PATHS = ["labels/A/P01-L.jpg.palm-trace.json", "x/palm-pilot/photos/P01-L.jpg", "docs/P03-R-2.HEIC", "foo.PALM-TRACE.JSON"];
const BLOCKED = [
  ...ORDER_PATHS,
  // F1 palm-pilot/ segment, anywhere, any file type, any case
  "palm-pilot/photos/P01-L.jpg", "palm-pilot/labels/A/P01-L.jpg.palm-trace.json", "palm-pilot/labels/B/notes.txt",
  "a/b/palm-pilot/readme.md", "Palm-Pilot/photos/x.png", "LENSIQ-field/PALM-PILOT/labels/A/y.json",
  // F2 *.palm-trace.json
  "x.palm-trace.json", "labels/B/P12-R-3.png.palm-trace.json", "deep/dir/Q.Palm-Trace.Json", ".palm-trace.json",
  // F3 pilot-code image names
  "P01-L.jpg", "P01-R.jpeg", "p02-l.png", "P99-R-12.webp", "img/P10-L-1.HEIC", "docs/p07-r.Jpg", "a b/P05-L.heic"
];
// near misses that must pass (normal repo files and names that only look similar)
const ALLOWED = [
  "palm.html", "js/palm.js", "docs/PALM-PILOT.md", "docs/palm-pilot.md", "tools/palm-trace.mjs", "tests/unit/palm-trace-tool.test.js",
  "palm-trace.md", "palm-pilot-guide.txt", "assets/palm-pilot.png", "x.palm-trace.json.md", "x.palm-trace.jsonl",
  "P1-L.jpg", "P001-L.jpg", "P01-X.jpg", "P01-LR.jpg", "P01_L.jpg", "P01-L.gif", "P01-L.svg", "P01-L-.jpg", "P01-L-a.jpg",
  "AP01-L.jpg", "imgP01-L.png", "P01-L.jpg.txt", "P01-L.jpg.bak", "img/hero.jpg", "vendor/icons/icon-192.png", "README.md"
];

test("F1-F3 scanPath refuses each pilot photo / label path (the four named in the order and variants)", () => {
  for (const p of BLOCKED) assert.ok(forbidden(p), `must be a forbidden path: ${p}`);
});

test("near misses and normal repo names still pass", () => {
  for (const p of ALLOWED) assert.ok(!forbidden(p), `must not be forbidden: ${p}`);
});

test("no file tracked in this repo matches the new rules (rule is not weakened to fit the repo)", () => {
  const files = git(REPO, "-c", "core.quotePath=false", "ls-files", "-z").split("\0").filter(Boolean);
  assert.ok(files.length > 500, `tracked files: ${files.length}`);
  const images = files.filter(f => /\.(?:jpe?g|png|heic|webp)$/i.test(f));
  assert.ok(images.length > 0, "the repo has images, and they must keep passing");
  const pilotRe = /(?:^|\/)palm-pilot\/|\.palm-trace\.json$|(?:^|\/)P\d{2}-[LR](?:-\d+)?\.(?:jpe?g|png|heic|webp)$/i;
  assert.deepEqual(files.filter(f => pilotRe.test(f)), [], "a tracked file matches a pilot pattern: report it, do not weaken the rule");
  // scanPath on main had no hits on tracked files, so any hit now would come from the new rules
  assert.deepEqual(files.filter(f => S.scanPath(f).length), [], "scanPath flags a tracked file");
});

/** synthetic bytes only: a JPEG/PNG-like header and filler, never a photo */
const fakeImage = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from("SYNTHETIC-NOT-A-PHOTO"), Buffer.alloc(32)]);
const fakeTrace = () => JSON.stringify({ synthetic: true, lines: [{ name: "heart", points: [[0.1, 0.2], [0.3, 0.4]] }] }) + "\n";
function writeSample(dir, p) {
  mkdirSync(dirname(join(dir, p)), { recursive: true });
  writeFileSync(join(dir, p), /\.json$/i.test(p) ? fakeTrace() : fakeImage());
}
function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pii-palm-"));
  git(dir, "init", "-q", "-b", "main");
  // the repo's own .gitignore, so `git add -f` is exercised against the real ignore lines
  writeFileSync(join(dir, ".gitignore"), readFileSync(join(REPO, ".gitignore")));
  writeFileSync(join(dir, "README.md"), "clean\n");
  mkdirSync(join(dir, "img"), { recursive: true });
  writeFileSync(join(dir, "img", "hero.jpg"), fakeImage());
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "clean");
  return dir;
}
const reported = (r, p) => JSON.parse(r.stdout).findings.some(f => f.type === "forbidden-path" && f.path === p);

test("a clean repo with a normal image passes --tracked, --staged and --range", () => {
  const dir = tempRepo();
  try {
    assert.equal(scan(dir, "--tracked").status, 0);
    assert.equal(scan(dir, "--staged").status, 0);
    assert.equal(scan(dir, "--range", "HEAD").status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test(".gitignore ignores every pilot path, and pii-scan --staged (pre-commit) still refuses them after git add -f", () => {
  const dir = tempRepo();
  try {
    for (const p of ORDER_PATHS) {
      writeSample(dir, p);
      const ig = spawnSync("git", ["check-ignore", "-q", "--no-index", p], { cwd: dir, env: GIT_ENV });
      assert.equal(ig.status, 0, `.gitignore must ignore ${p}`);
    }
    git(dir, "add", "-A");
    assert.equal(git(dir, "diff", "--cached", "--name-only"), "", "git add -A must not stage an ignored pilot file");
    git(dir, "add", "-f", ...ORDER_PATHS);
    const r = scan(dir, "--staged", "--json");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    for (const p of ORDER_PATHS) assert.ok(reported(r, p), `--staged must report ${p}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--tracked (CI) refuses committed pilot files; --range (pushed commits) refuses them even after removal", () => {
  const dir = tempRepo();
  try {
    const base = git(dir, "rev-parse", "HEAD");
    for (const p of ORDER_PATHS) writeSample(dir, p);
    git(dir, "add", "-f", ...ORDER_PATHS);
    git(dir, "commit", "-q", "-m", "copied in by mistake");
    const t = scan(dir, "--tracked", "--json");
    assert.equal(t.status, 1, t.stdout + t.stderr);
    for (const p of ORDER_PATHS) assert.ok(reported(t, p), `--tracked must report ${p}`);
    git(dir, "rm", "-q", "--cached", ...ORDER_PATHS);
    git(dir, "commit", "-q", "-m", "removed again");
    assert.equal(scan(dir, "--tracked").status, 0, "nothing tracked any more");
    for (const range of [`${base}..HEAD`, "HEAD"]) {
      const r = scan(dir, "--range", range, "--json");
      assert.equal(r.status, 1, `${range}: ${r.stdout}${r.stderr}`);
      for (const p of ORDER_PATHS) assert.ok(reported(r, p), `--range ${range} must report ${p}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a pilot path cannot be allow-listed: an allow entry for it changes nothing", () => {
  const dir = tempRepo();
  try {
    const p = "x/palm-pilot/photos/P01-L.jpg";
    writeSample(dir, p);
    const allow = join(dir, "allow.json");
    writeFileSync(allow, JSON.stringify({ entries: [{ path: p, types: { phone: 1 }, kind: "synthetic", reason: "synthetic fixture for this test" }] }));
    git(dir, "add", "-f", p);
    const r = scan(dir, "--staged", "--json", "--allow", allow);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(reported(r, p));
    writeFileSync(allow, JSON.stringify({ entries: [{ path: p, types: { "forbidden-path": 1 }, kind: "synthetic", reason: "try to allow a forbidden path" }] }));
    assert.equal(scan(dir, "--staged", "--allow", allow).status, 2, "forbidden-path is not an allow-listable type");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the scanner output names the rule but never prints file contents", () => {
  const dir = tempRepo();
  try {
    const p = "labels/A/P01-L.jpg.palm-trace.json";
    writeSample(dir, p);
    git(dir, "add", "-f", p);
    const r = scan(dir, "--staged");
    assert.equal(r.status, 1);
    const out = r.stdout + r.stderr;
    assert.match(out, /forbidden-path\s+labels\/A\/P01-L\.jpg\.palm-trace\.json/);
    assert.match(out, /palm/i, "the reason names the palm pilot");
    // re-lock 1: probe with content-only markers ("synthetic" is also in the scanner's fixed help footer), and check an
    // image sample too
    for (const marker of ["heart", "0.1, 0.2", "0.3", '"lines"', "SYNTHETIC-NOT-A-PHOTO"]) assert.ok(!out.includes(marker), `file content in the output: ${marker}`);
    const img = "x/palm-pilot/photos/P01-L.jpg";
    writeSample(dir, img);
    git(dir, "add", "-f", img);
    const r2 = scan(dir, "--staged");
    assert.equal(r2.status, 1);
    const out2 = r2.stdout + r2.stderr;
    assert.match(out2, /forbidden-path\s+x\/palm-pilot\/photos\/P01-L\.jpg/);
    assert.ok(!out2.includes("SYNTHETIC-NOT-A-PHOTO") && !out2.includes("heart"), "no file content in the output");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
