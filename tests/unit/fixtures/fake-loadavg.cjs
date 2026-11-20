// tests/unit/fixtures/fake-loadavg.cjs — preload for the load-guard tests (node --require): makes os.loadavg() report a fixed
// 1-minute load sequence, so a real child process (tools/load-guard.mjs, tools/load-guard-hold.mjs) sees a busy or idle machine.
// LQ_TEST_FAKE_LOAD="12,3" = the first loadavg() call reports 12, the second 3, every later call 3. Unset: the real loadavg.
// Nothing outside the unit tests loads this file.
const os = require("node:os");
const seq = String(process.env.LQ_TEST_FAKE_LOAD || "").split(",").map(s => parseFloat(s)).filter(n => Number.isFinite(n));
let calls = 0;
if (seq.length) {
  os.loadavg = () => { const v = seq[Math.min(calls++, seq.length - 1)]; return [v, v, v]; };
}
