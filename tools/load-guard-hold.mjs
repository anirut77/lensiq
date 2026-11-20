// tools/load-guard-hold.mjs — holds one load-guard job slot for a whole node process, before its main code runs:
//   node --experimental-require-module --require ./tools/load-guard-hold.mjs --test ...
//                                                           (npm run test:unit, test:integration: the node --test runner runs --require
//                                                            preloads in its own process, but not --import ones; the flag lets Node
//                                                            22.0-22.11 require() this ES module, the default from 22.12)
//   node --import ./tools/load-guard-hold.mjs <script>      (csp:check)
// Queues while the machine is busy, exits 75 after the maximum wait (tools/load-guard.mjs). No top-level await, so it loads under both.
// Child processes (each test file) inherit LQ_LOAD_GUARD_HELD; the fast path below checks it with node:fs only, so a test file pays
// about a millisecond, not the cost of loading the guard.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

function parentHolds() {
  const held = String(process.env.LQ_LOAD_GUARD_HELD || ""), cut = held.lastIndexOf(":");
  if (cut <= 0 || !/^(slot-\d+|override-[\w-]+)\.json$/.test(held.slice(0, cut))) return false;
  try {
    const job = JSON.parse(readFileSync(join(homedir(), "LENSIQ-field", "run", held.slice(0, cut)), "utf8"));
    if (!job.token || job.token !== held.slice(cut + 1)) return false;
    process.kill(Number(job.pid), 0);
    return true;
  } catch (e) { return /** @type {NodeJS.ErrnoException} */ (e).code === "EPERM"; }
}

const ci = ["CI", "GITHUB_ACTIONS"].some(k => { const v = String(process.env[k] || "").trim().toLowerCase(); return !!v && !["false", "0", "no", "off"].includes(v); });
if (!parentHolds() && !(ci && process.env.NODE_TEST_CONTEXT)) {
  const { holdSlotSync } = createRequire(import.meta.url)("./load-guard.mjs");
  const cmd = ["node", ...process.execArgv.filter(a => a.startsWith("--test")), ...process.argv.slice(1)].join(" ").slice(0, 300);
  holdSlotSync({ label: cmd, cmd });
}
