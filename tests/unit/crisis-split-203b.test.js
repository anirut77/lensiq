"use strict";
// tests/unit/crisis-split-203b.test.js — owner decision 203 ข: the "count is identical" proof for the split of the crisis-rules-1323
// e2e files a, c and e into one file per language (EQUAL relock, relock11 in evals-locks/crisis-rules-1323.sha256).
// Baseline: tests/unit/crisis-split-203b-manifest.json (field copy ~/LENSIQ-field/evals/crisis-rules-1323/relock11/), computed from
// the code of the originals at origin/main 653029d3 without running anything (tools/crisis-split-203b.mjs --baseline).
//   S1 the manifest describes the locked originals: each original sha256 is a lock line for its tests/e2e path, the kit is unchanged;
//   S2 every split file is the original plus a comment-only header and the four documented edits: undoing them gives the original
//      bytes (sha256 equal to the manifest);
//   S3 the union of check ID x page x language x width over the three files of each original equals the manifest exactly: same check
//      IDs, same cell count per check, no cell missing, none added, none run twice (the slices are disjoint);
//   S4 the originals are gone from tests/e2e and retired in the lock file after their last hash; the split files are the e2e files
//      the CI shard check expects (tools/e2e-shards.mjs allFiles()).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const MANIFEST = JSON.parse(read("tests/unit/crisis-split-203b-manifest.json"));
const LOCK = read("evals-locks/crisis-rules-1323.sha256");
const tool = () => import("../../tools/crisis-split-203b.mjs");
const LANGS = ["th", "en", "zh"];
const ORIGINALS = Object.keys(MANIFEST.originals);

test("S1: the manifest describes the locked originals and the unchanged kit", () => {
  assert.deepEqual(ORIGINALS, ["crisis-rules-1323-a.e2e.mjs", "crisis-rules-1323-c.e2e.mjs", "crisis-rules-1323-e.e2e.mjs"]);
  for (const f of ORIGINALS) {
    const h = MANIFEST.originals[f].sha256;
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.ok(LOCK.split("\n").some(l => l.startsWith(h + "  tests/e2e/" + f)), `${f}: ${h} is a lock line in crisis-rules-1323.sha256`);
  }
  assert.equal(MANIFEST.kit.sha256, sha(read("tests/e2e/crisis-rules-kit.mjs")), "the shared kit is unchanged");
  const total = ORIGINALS.reduce((n, f) => n + MANIFEST.originals[f].cellCount, 0);
  assert.equal(MANIFEST.totalCells, total);
  assert.equal(total, 425, "a 179 + c 69 + e 177 cells (check x page x language x width)");
  assert.deepEqual(ORIGINALS.map(f => MANIFEST.originals[f].checkIds), [["N1-N4", "N5", "N6"], ["P1", "K1", "K2"], ["E1-E4", "E5"]]);
});

test("S2: each split file = comment-only header + the original with only the four documented edits", async () => {
  const m = await tool();
  for (const f of ORIGINALS) {
    assert.deepEqual(MANIFEST.split[f], LANGS.map(l => f.replace(/\.e2e\.mjs$/, `-${l}.e2e.mjs`)));
    for (const [i, nf] of MANIFEST.split[f].entries()) {
      const src = read("tests/e2e/" + nf);
      const head = src.slice(0, src.indexOf(m.MARKER));
      for (const l of head.split("\n")) assert.ok(l === "" || l.startsWith("//"), `${nf}: header line is not a comment: ${l.slice(0, 60)}`);
      assert.equal(m.sliceOf(src), LANGS[i], `${nf}: slice language`);
      const back = m.unsplit(src);
      assert.equal(sha(back), MANIFEST.originals[f].sha256, `${nf}: undoing the edits gives the original bytes`);
      assert.equal(m.make(LANGS[i], back, f, head), src, `${nf}: re-applying the edits gives the file again`);
    }
  }
});

test("S3: union of check x page x language x width over the split files = the baseline manifest (same count, disjoint)", async () => {
  const m = await tool();
  const kit = read("tests/e2e/crisis-rules-kit.mjs");
  let total = 0;
  for (const f of ORIGINALS) {
    const want = MANIFEST.originals[f].cells;
    /** @type {Record<string, string[]>} */ const got = {};
    for (const nf of MANIFEST.split[f]) {
      const cells = m.matrix(read("tests/e2e/" + nf), kit).checks;
      for (const [id, list] of Object.entries(cells)) (got[id] = got[id] || []).push(...list);
    }
    assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), `${f}: same check IDs`);
    for (const id of Object.keys(want)) {
      assert.equal(new Set(got[id]).size, got[id].length, `${f} ${id}: no cell in two split files`);
      assert.equal(got[id].length, want[id].length, `${f} ${id}: same cell count`);
      assert.deepEqual([...got[id]].sort(), [...want[id]].sort(), `${f} ${id}: same cells`);
      total += got[id].length;
    }
    // the extractor reads the original (rebuilt from a split file) the same way the baseline did
    assert.deepEqual(m.matrix(m.unsplit(read("tests/e2e/" + MANIFEST.split[f][0])), kit).checks, want, `${f}: baseline reproduced`);
  }
  assert.equal(total, MANIFEST.totalCells);
});

test("S4: originals gone and retired; the split files are what the CI shard check expects", async () => {
  const lines = LOCK.split("\n");
  for (const f of ORIGINALS) {
    const p = "tests/e2e/" + f;
    assert.ok(!fs.existsSync(path.join(ROOT, p)), `${p} removed`);
    const lastHash = lines.map((l, i) => (/^[0-9a-f]{64}\s/.test(l) && l.split(/\s+/)[1] === p ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const retire = lines.findIndex((l, i) => i > lastHash && l.startsWith(`# retired ${p} reason: `));
    assert.ok(lastHash >= 0 && retire > lastHash, `${p} retired after its last hash line`);
  }
  const { allFiles } = await import("../../tools/e2e-shards.mjs");
  const files = allFiles();
  for (const f of ORIGINALS) {
    assert.ok(!files.includes(f));
    for (const nf of MANIFEST.split[f]) assert.ok(files.includes(nf), `${nf} is an e2e file of the checkout`);
  }
});
