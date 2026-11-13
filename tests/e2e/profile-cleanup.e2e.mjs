// tests/e2e/profile-cleanup.e2e.mjs — owner request 2026-11-13: the test suite must never leave its throw-away Chrome
// profiles behind (41 folders, 1.5 GB, filled the disk). Checks the real Chrome launcher in tests/e2e/cdp.mjs:
//   1. a normal launch → close removes the profile folder;
//   2. a test process that is stopped (SIGTERM, SIGINT) removes its profile folders on the way out;
//   3. a test process killed with SIGKILL cannot clean up; the next sweepStale() removes what it left.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sweepStale } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// a child Node process that launches 2 Chromes, prints both profile folders, then waits to be stopped
function child() {
  const code = `import { launch } from ${JSON.stringify(join(here, "cdp.mjs"))};
    const a = await launch(), b = await launch();
    await a.newPage("about:blank");
    console.log(JSON.stringify([a.dir, b.dir]));
    setInterval(() => {}, 1000);`;
  const p = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  p.stdout.on("data", d => { out += d; }); p.stderr.on("data", d => { err += d; });
  const dirs = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("child did not start Chrome: " + err.slice(-800))), 60000);
    p.stdout.on("data", () => { const l = out.split("\n").find(x => x.startsWith("[")); if (l) { clearTimeout(t); res(JSON.parse(l)); } });
    p.once("exit", c => { clearTimeout(t); rej(new Error(`child exited ${c}: ` + err.slice(-800))); });
  });
  const exited = new Promise(r => p.once("exit", (c, s) => r({ c, s })));
  return { p, dirs, exited };
}

async function gone(dir, ms = 8000) {
  const end = Date.now() + ms;
  while (existsSync(dir) && Date.now() < end) await sleep(100);
  return !existsSync(dir);
}

export default async function ({ check, launch }) {
  await check("launch → close removes the throw-away profile folder", async () => {
    const b = await launch();
    try {
      assert.ok(b.dir && existsSync(b.dir), "profile folder exists while Chrome is open");
      const pg = await b.newPage("about:blank");
      assert.equal(await pg.evaluate("1 + 1"), 2);
    } finally { await b.close(); }
    assert.equal(existsSync(b.dir), false, "profile folder removed after close()");
  });

  for (const sig of ["SIGTERM", "SIGINT"]) {
    await check(`a test process stopped with ${sig} removes its profile folders`, async () => {
      const c = child();
      try {
        const dirs = await c.dirs;
        for (const d of dirs) assert.ok(existsSync(d), "open profile exists");
        c.p.kill(sig);
        await c.exited;
        for (const d of dirs) assert.ok(await gone(d), `left behind after ${sig}: ${d}`);
      } finally { if (c.p.exitCode == null && c.p.signalCode == null) c.p.kill("SIGKILL"); }
    });
  }

  await check("after a SIGKILLed test process, sweepStale() removes the profiles it left", async () => {
    const c = child();
    let dirs = [];
    try {
      dirs = await c.dirs;
      c.p.kill("SIGKILL");
      await c.exited;
      await sleep(1500); // its Chrome notices the lost pipe / is orphaned; the folders stay behind
      const r = sweepStale();
      for (const d of dirs) assert.ok(await gone(d) || (sweepStale(), await gone(d)), `sweep left ${d} (removed: ${r.removed.length})`);
    } finally { if (c.p.exitCode == null && c.p.signalCode == null) c.p.kill("SIGKILL"); }
  });
}
