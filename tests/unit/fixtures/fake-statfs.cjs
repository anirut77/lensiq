// tests/unit/fixtures/fake-statfs.cjs — preload for the disk-guard tests (node --require): makes fs.statfsSync report a fixed
// sequence of free sizes, so a real child process (tools/disk-guard.mjs, tests/e2e/run.mjs) sees a "full" or "empty" disk.
// LQ_TEST_FAKE_FREE_GIB="100,1" = the first statfsSync call reports 100 GiB free, the second 1 GiB, every later call 1 GiB.
// Nothing outside the unit tests loads this file.
const fs = require("node:fs");
const seq = String(process.env.LQ_TEST_FAKE_FREE_GIB || "").split(",").map(s => parseFloat(s)).filter(n => Number.isFinite(n));
let calls = 0;
if (seq.length) {
  fs.statfsSync = () => {
    const gib = seq[Math.min(calls++, seq.length - 1)];
    const bsize = 4096, bavail = Math.floor(gib * 1024 ** 3 / bsize);
    return { type: 0, bsize, blocks: bavail * 2, bfree: bavail * 2, bavail, files: 0, ffree: 0 };
  };
}
