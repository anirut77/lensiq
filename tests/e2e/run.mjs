#!/usr/bin/env node
// tests/e2e/run.mjs — serves the repo with `python3 -m http.server` on 127.0.0.1:<random>, then runs every
// tests/e2e/*.e2e.mjs against headless Chrome (no WebGL). Exits non-zero on any failure.
//   node tests/e2e/run.mjs [filter ...]  files whose name contains any filter word; LQ_BASE=http://127.0.0.1:8000 reuses a server
//   --retry=N / LQ_RETRY=N   re-run a failing file up to N times (CI uses 1); only the last attempt counts
//   LQ_FILE_TIMEOUT=ms       per-file time limit (default 900000 = 15 min) — a hung file fails instead of blocking the run
// Each *.e2e.mjs exports `default async function (ctx)`; ctx = {base, launch, check(name, fn), skip(name, why), fakeCams}.
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const argv = process.argv.slice(2);
const retryArg = argv.find(a => a.startsWith("--retry="));
const RETRY = Math.max(0, parseInt(retryArg ? retryArg.slice(8) : process.env.LQ_RETRY || "0", 10) || 0);
const FILE_TIMEOUT = parseInt(process.env.LQ_FILE_TIMEOUT || "900000", 10) || 900000;
const filters = argv.filter(a => !a.startsWith("--"));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer(); s.unref(); s.on("error", rej);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

let server = null, base = process.env.LQ_BASE ? process.env.LQ_BASE.replace(/\/$/, "") : null;
if (!base) {
  const port = await freePort();
  server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", repo], { stdio: ["ignore", "ignore", "pipe"] });
  server.stderr.on("data", () => {}); // access log
  base = `http://127.0.0.1:${port}`;
  let ok = false;
  for (let i = 0; i < 100 && !ok; i++) {
    try { ok = (await fetch(base + "/index.html")).ok; } catch { await sleep(100); }
  }
  if (!ok) { server.kill(); console.error("http.server did not start"); process.exit(2); }
}
const stopServer = () => { if (server && server.exitCode == null) server.kill(); };
process.on("exit", stopServer);
process.on("SIGINT", () => { stopServer(); process.exit(130); });

const fakeCams = readFileSync(join(here, "fake-cams.js"), "utf8");
const files = readdirSync(here).filter(f => f.endsWith(".e2e.mjs") && (!filters.length || filters.some(w => f.includes(w)))).sort();
let pass = 0, fail = 0, skipped = 0;
const t0 = Date.now();
console.log(`LENSIQ e2e — ${base} — ${files.length} file(s)`);
const flaky = [];
for (const f of files) {
  for (let attempt = 0; attempt <= RETRY; attempt++) {
    const last = attempt === RETRY;
    let fp = 0, ff = 0, fs = 0;
    console.log(attempt ? `\n# ${f} (retry ${attempt}/${RETRY})` : `\n# ${f}`);
    const ctx = {
      base, launch, fakeCams, repo,
      async check(name, fn) {
        const s = Date.now();
        try { await fn(); fp++; console.log(`  ok   ${name} (${Date.now() - s} ms)`); }
        catch (e) { ff++; console.log(`  FAIL ${name} (${Date.now() - s} ms)\n       ${String(e && e.stack || e).split("\n").slice(0, 4).join("\n       ")}`); }
      },
      skip(name, why) { fs++; console.log(`  skip ${name}${why ? " — " + why : ""}`); }
    };
    let timer;
    try {
      const mod = await import(pathToFileURL(join(here, f)).href);
      await Promise.race([mod.default(ctx), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${FILE_TIMEOUT} ms`)), FILE_TIMEOUT); })]);
    } catch (e) { ff++; console.log(`  FAIL ${f} crashed: ${e && e.stack || e}`); }
    finally { clearTimeout(timer); }
    if (!ff || last) {
      pass += fp; fail += ff; skipped += fs;
      if (!ff && attempt) flaky.push(f);
      break;
    }
    console.log(`  (${ff} failure(s) — retrying ${f})`);
  }
}
if (flaky.length) console.log(`\nflaky (passed on retry): ${flaky.join(", ")}`);
console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped — ${((Date.now() - t0) / 1000).toFixed(1)} s`);
stopServer();
process.exit(fail ? 1 : 0);
