// tests/unit/pii-palm-variants.test.js — palm pilot, STRICTER ADDITION to tests/unit/pii-palm-labels.test.js (coordinator decision
// 2026-11-21, recorded in the board): tools/pii-scan.mjs must also refuse the ways a pilot photo or label is most often copied or
// renamed by hand, so it cannot slip into git under another name. The existing locked rules (F1-F3) and their test stay unchanged.
//   V1 pilot-code photos with more photo / video types: heif, dng, avif, tif, tiff, mov (as well as jpg, jpeg, png, heic, webp)
//   V2 copy names of a pilot-code photo: "P01-L (1).jpg", "P01-L(1).jpg", "P01-L copy.jpg", "P01-L copy 2.jpg", "P01-L - Copy.jpg",
//      "P01-L_1.jpg" (also after a shot number: "P01-L-2 (3).heic")
//   V3 archives (zip, tar, tar.gz, tgz, 7z, and tar.bz2 / tar.xz / rar) whose name contains palm-pilot (or palm_pilot, palmpilot) or a
//      pilot code (P01, P01-L ...) as a separate token
//   V4 trace labels renamed or packed: *.palm-trace.json.bak, .gz, .old, .orig, .tmp, .swp, .zip, .7z, .1, a trailing ~, chains such
//      as .json.bak.gz, and copy names "x.palm-trace (1).json" / "x.palm-trace copy.json" / "x.palm-trace_1.json"
//   V5 near misses still pass (every name the locked test allows, plus look-alikes of the new rules)
//   V6 no tracked file matches; --staged (pre-commit) refuses the new names after `git add -f`; output never holds file content
// Every file here is synthetic (generated names, placeholder bytes). No real photo is used, read or viewed.
// This file is locked: evals-locks/pii-palm-variants.sha256 (written BEFORE the new rules existed in tools/pii-scan.mjs).
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
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
const forbidden = p => S.scanPath(p).some(h => h.type === "forbidden-path");

const V1 = ["P01-L.heif", "P01-R.HEIF", "P02-L.dng", "p02-r.DNG", "P03-R-2.avif", "P04-L.tif", "P05-R.TIFF", "P06-L.mov", "img/P07-R-3.MOV",
  "a b/P08-L.Tif"];
const V2 = ["P01-L (1).jpg", "P01-L(1).jpg", "P01-L copy.jpg", "P01-L copy 2.jpg", "P01-L - Copy.jpg", "P01-L - Copy (2).png", "P01-L_1.jpg",
  "P01-L_12.webp", "P01-L-2 (3).heic", "docs/P01-R copy.jpeg", "x/P11-R_2.HEIF", "P09-L (2).mov", "p03-l copy.DNG"];
const V3 = ["palm-pilot.zip", "palm-pilot-photos.tar.gz", "backup/palm-pilot_2026-11-21.tgz", "Palm-Pilot.7z", "palm-pilot.tar", "palm_pilot.zip",
  "PalmPilot-labels.tar.bz2", "export palm-pilot.rar", "P01-L.zip", "P01-photos.tar.gz", "photos-P12.7z", "p03-r.tgz", "P01.zip", "x/P07 labels.tar.xz",
  "P02-L-3.zip"];
const V4 = ["x.palm-trace.json.bak", "x.palm-trace.json.gz", "labels/A/P01-L.jpg.palm-trace.json.old", "x.palm-trace.json~", "x.palm-trace.json.orig",
  "x.palm-trace.json.1", "x.palm-trace.json.zip", "x.palm-trace.json.tmp", "x.palm-trace.json.swp", "x.palm-trace.json.7z", "x.PALM-TRACE.JSON.BAK",
  "x.palm-trace.json.bak.gz", "x.palm-trace (1).json", "x.palm-trace copy.json", "x.palm-trace_1.json", "x.palm-trace.json.xz", "x.palm-trace.json.tar"];
// the locked test's allowed names (unchanged) plus look-alikes of the new rules
const ALLOWED_LOCKED = [
  "palm.html", "js/palm.js", "docs/PALM-PILOT.md", "docs/palm-pilot.md", "tools/palm-trace.mjs", "tests/unit/palm-trace-tool.test.js",
  "palm-trace.md", "palm-pilot-guide.txt", "assets/palm-pilot.png", "x.palm-trace.json.md", "x.palm-trace.jsonl",
  "P1-L.jpg", "P001-L.jpg", "P01-X.jpg", "P01-LR.jpg", "P01_L.jpg", "P01-L.gif", "P01-L.svg", "P01-L-.jpg", "P01-L-a.jpg",
  "AP01-L.jpg", "imgP01-L.png", "P01-L.jpg.txt", "P01-L.jpg.bak", "img/hero.jpg", "vendor/icons/icon-192.png", "README.md"
];
const ALLOWED_NEW = ["clip.mov", "scan.tiff", "photo.heif", "P1-L (1).jpg", "P001-L copy.jpg", "AP01-L_1.jpg", "P01-L_a.jpg", "P01-L copy.gif",
  "P01-X (1).jpg", "P01-L copyright.jpg", "vendor/archive.zip", "docs/pilot.zip", "exam-pilot.zip", "plan.tar.gz", "map-p012.zip", "help01.zip",
  "ap01.zip", "P01x.zip", "palm.zip", "palm-trace.mjs.bak", "x.palm-trace.jsonl.gz", "x.palm-trace.json.md", "x.palm-trace.json.bakery",
  "x.palm-trace.md.bak", "palm-pilot.md", "tools/palm-pilot-check.mjs", "P01-L.zip.md"];

test("V1 pilot-code photos with more photo / video types are refused", () => {
  for (const p of V1) assert.ok(forbidden(p), p);
});
test("V2 copy names of a pilot-code photo are refused", () => {
  for (const p of V2) assert.ok(forbidden(p), p);
});
test("V3 archives named with palm-pilot or a pilot code are refused", () => {
  for (const p of V3) assert.ok(forbidden(p), p);
});
test("V4 trace labels renamed with a backup / compression suffix or a copy name are refused", () => {
  for (const p of V4) assert.ok(forbidden(p), p);
});
test("V5 near misses still pass: the locked test's allowed names and look-alikes of the new rules", () => {
  for (const p of [...ALLOWED_LOCKED, ...ALLOWED_NEW]) assert.ok(!forbidden(p), `must not be forbidden: ${p}`);
});

test("V6 no tracked file matches; --staged refuses the new names after git add -f; no file content in the output", () => {
  const files = git(REPO, "-c", "core.quotePath=false", "ls-files", "-z").split("\0").filter(Boolean);
  assert.ok(files.length > 500, `tracked files: ${files.length}`);
  assert.deepEqual(files.filter(f => S.scanPath(f).length), [], "scanPath flags a tracked file: report it, do not weaken the rule");
  const dir = mkdtempSync(join(tmpdir(), "pii-palm-var-"));
  try {
    git(dir, "init", "-q", "-b", "main");
    writeFileSync(join(dir, "README.md"), "clean\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "clean");
    const sample = ["P01-L (1).jpg", "P02-R.heif", "palm-pilot-photos.tar.gz", "labels/A/P01-L.jpg.palm-trace.json.bak"];
    for (const p of sample) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), Buffer.concat([Buffer.from("SYNTHETIC-VARIANT-MARKER"), Buffer.alloc(16)]));
    }
    git(dir, "add", "-f", ...sample);
    const r = spawnSync(process.execPath, [SCAN, "--repo", dir, "--staged", "--json"], { encoding: "utf8", env: GIT_ENV });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const found = JSON.parse(r.stdout).findings.filter(f => f.type === "forbidden-path").map(f => f.path).sort();
    assert.deepEqual(found, [...sample].sort());
    assert.ok(!(r.stdout + r.stderr).includes("SYNTHETIC-VARIANT-MARKER"), "no file content in the output");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
