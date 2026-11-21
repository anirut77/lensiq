// tests/unit/exam-select-disk-guard.test.js — investigation EXAMFACES-CLIP-2026-11-21 (task 1): `--select` of the three exam
// image harnesses downloads Open Images files, but the disk guard (tools/disk-guard.mjs, owner order 2026-11-15) was only
// called in run(), so `--select` created the images folder and downloaded before any disk check (19 files were downloaded by
// a smoke run with a fake 1 GB disk on 2026-11-15). FIXED TEST written and locked (evals-locks/exam-clip-notice.sha256) BEFORE
// the tool change. With a fake low disk (tests/unit/fixtures/fake-statfs.cjs: 1 GiB free) each tool's `--select` must exit 75
// with the disk-guard message and create nothing: no data folder, no images folder. Everything runs in a temp folder (HOME,
// --dir and --meta point there) and tests/unit/fixtures/no-network.cjs makes every network call fail, so no test downloads
// anything, whatever the tool does. A control run with a fake 100 GiB disk shows the same command does reach the images folder
// (and then stops on the empty meta folder), so the low-disk result is caused by the guard and not by the missing inputs.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const REPO = join(__dirname, "..", "..");
const STATFS = join(__dirname, "fixtures", "fake-statfs.cjs");
const NONET = join(__dirname, "fixtures", "no-network.cjs");
const TOOLS = ["exam-face-eval.mjs", "exam-hall-face-eval.mjs", "exam-hall-detector-eval.mjs"];

/** every file and folder under `dir`, relative, sorted */
const tree = dir => {
  const out = [];
  const walk = (d, rel) => { for (const e of readdirSync(d, { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; out.push(r); if (e.isDirectory()) walk(join(d, e.name), r); } };
  walk(dir, "");
  return out.sort();
};

function select(tool, gib) {
  const tmp = mkdtempSync(join(tmpdir(), "lq-select-guard-"));
  const home = join(tmp, "home"), meta = join(tmp, "meta"), data = join(tmp, "data");
  mkdirSync(home); mkdirSync(meta);
  const env = { ...process.env, HOME: home, LQ_TEST_FAKE_FREE_GIB: String(gib) };
  for (const k of ["CI", "LQ_DISK_GUARD", "LQ_DISK_MIN_GB", "NODE_TEST_CONTEXT", "GITHUB_ACTIONS", "LQ_EXAM_EVAL_VENDOR"]) delete env[k];
  const r = spawnSync(process.execPath, ["--require", STATFS, "--require", NONET, join(REPO, "tools", tool), "--select", "--dir", data, "--meta", meta],
    { cwd: REPO, env, encoding: "utf8", timeout: 60000 });
  const res = { status: r.status, signal: r.signal, out: (r.stdout || "") + (r.stderr || ""), files: tree(tmp), data, tmp };
  return res;
}

for (const tool of TOOLS) {
  test(`${tool} --select: fake 1 GB free disk -> exit 75 before any folder or download`, () => {
    const r = select(tool, 1);
    try {
      assert.equal(r.status, 75, `exit ${r.status} (${r.signal}), output:\n${r.out}`);
      assert.match(r.out, /disk-guard: only 1\.00 GB free/);
      assert.doesNotMatch(r.out, /no-network: blocked/, "no network call may even be attempted");
      assert.equal(existsSync(r.data), false, `the data folder was created: ${JSON.stringify(r.files)}`);
      assert.deepEqual(r.files.filter(f => /(^|\/)images(\/|$)/.test(f)), [], "no images folder anywhere");
      assert.deepEqual(r.files, ["home", "meta"], "nothing but the two folders the test made");
    } finally { rmSync(r.tmp, { recursive: true, force: true }); }
  });

  test(`${tool} --select control: fake 100 GB free disk -> passes the guard and reaches the images folder (no network)`, () => {
    const r = select(tool, 100);
    try {
      assert.notEqual(r.status, 75, `exit 75 with room on the disk:\n${r.out}`);
      assert.notEqual(r.status, 0, `--select with an empty meta folder must fail:\n${r.out}`);
      assert.ok(existsSync(join(r.data, "images")), `control did not reach the images folder: ${JSON.stringify(r.files)}\n${r.out}`);
      assert.deepEqual(readdirSync(join(r.data, "images")), [], "no image may be written");
      assert.match(r.out, /ENOENT|no such file/i, "it stops on the missing class file in the empty meta folder");
    } finally { rmSync(r.tmp, { recursive: true, force: true }); }
  });
}

test("source order: in each tool's select() the disk guard comes before the first mkdirSync and the first fetch", () => {
  const { readFileSync } = require("node:fs");
  for (const tool of TOOLS) {
    const src = readFileSync(join(REPO, "tools", tool), "utf8");
    const body = src.slice(src.indexOf("async function select()"));
    assert.ok(src.includes("async function select()"), `${tool}: no select()`);
    const g = body.indexOf("assertFreeSpace("), m = body.indexOf("mkdirSync("), f = body.indexOf("fetch(");
    assert.ok(g > 0, `${tool}: select() does not call assertFreeSpace`);
    assert.ok(m > 0 && g < m, `${tool}: assertFreeSpace (${g}) must come before mkdirSync (${m}) in select()`);
    assert.ok(f > 0 && g < f, `${tool}: assertFreeSpace (${g}) must come before fetch (${f}) in select()`);
  }
});
