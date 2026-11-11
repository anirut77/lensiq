#!/usr/bin/env node
// tools/ci-fonts.mjs — installs the Thai + CJK fonts the browser jobs need, from a cache when possible (owner decision
// 2026-11-11, after GitHub runners failed three times to resolve the Ubuntu mirrors during `apt-get install`).
//   node tools/ci-fonts.mjs install <cacheDir>   every .deb listed in tools/ci-fonts.lock is taken from <cacheDir> or,
//                                                 when missing there, downloaded from the Ubuntu archive pool path in the
//                                                 lock; EVERY file is checked against its SHA-256 before `dpkg -i`. A file
//                                                 in the cache with a wrong hash stops the job (a corrupted or swapped cache
//                                                 fails loudly; it is never silently replaced). The log says where each
//                                                 file came from. No retries.
//   node tools/ci-fonts.mjs --manifest <dir>     rebuilds the lock from Ubuntu Packages.xz indexes saved in <dir> (when
//                                                 Ubuntu publishes a new font version); the cache key follows the lock.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCK = join(resolve(dirname(fileURLToPath(import.meta.url))), "ci-fonts.lock");
// Where a missing file is fetched from, in order. Any copy is accepted only if its SHA-256 matches the lock, so a mirror
// cannot change what is installed; the second and third hosts are not on ubuntu.com (the runners' failing lookups were
// all *.ubuntu.com). This is a choice of source for a cache fill, not a retry of any test.
const MIRRORS = ["http://archive.ubuntu.com/ubuntu/", "https://mirrors.edge.kernel.org/ubuntu/", "https://mirror.math.princeton.edu/pub/ubuntu/"];

/** @returns {{sha: string, file: string, pool: string, size: number}[]} */
export function readLock(text = readFileSync(LOCK, "utf8")) {
  return text.split("\n").filter(l => l && !l.startsWith("#")).map(l => {
    const [sha, file, pool, size] = l.trim().split(/\s+/);
    if (!/^[a-f0-9]{64}$/.test(sha) || !/^[\w.+~-]+\.deb$/.test(file) || !pool.endsWith("/" + file) || !/^\d+$/.test(size)) throw new Error("bad lock line: " + l);
    return { sha, file, pool, size: Number(size) };
  });
}

const sha256 = buf => createHash("sha256").update(buf).digest("hex");

async function install(dir) {
  const list = readLock();
  mkdirSync(dir, { recursive: true });
  let fromCache = 0, fromNet = 0;
  for (const p of list) {
    const path = join(dir, p.file);
    if (existsSync(path)) {
      const got = sha256(readFileSync(path));
      if (got !== p.sha) { console.error(`::error::font cache: ${p.file} has sha256 ${got}, expected ${p.sha} (corrupted or swapped cache)`); process.exit(1); }
      fromCache++;
      continue;
    }
    let ok = false;
    for (const m of MIRRORS) {
      let buf;
      try { const r = await fetch(m + p.pool); if (!r.ok) { console.log(`fonts: ${p.file}: ${new URL(m).host} HTTP ${r.status}`); continue; } buf = Buffer.from(await r.arrayBuffer()); }
      catch (e) { console.log(`fonts: ${p.file}: ${new URL(m).host} unreachable (${(e && e.cause && e.cause.code) || e})`); continue; }
      const got = sha256(buf);
      if (got !== p.sha) { console.error(`::error::font download: ${p.file} from ${new URL(m).host} has sha256 ${got}, expected ${p.sha}`); process.exit(1); }
      writeFileSync(path, buf); ok = true; fromNet++;
      if (m !== MIRRORS[0]) console.log(`fonts: ${p.file} from ${new URL(m).host}`);
      break;
    }
    if (!ok) { console.error(`::error::font download failed on every source: ${p.file}`); process.exit(1); }
  }
  const source = fromNet === 0 ? "cache" : fromCache === 0 ? "network" : "cache + network";
  console.log(`fonts: ${list.length} packages, source: ${source} (${fromCache} from cache, ${fromNet} downloaded), all SHA-256 verified`);
  execFileSync("sudo", ["dpkg", "-i", ...list.map(p => join(dir, p.file))], { stdio: "inherit" });
  execFileSync("fc-cache", ["-f"], { stdio: "inherit" });
}

function manifest(dir) {
  const want = new Map(readLock().map(p => [p.file.split("_")[0], p.file.split("_")[1]]));
  const out = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith(".xz")).sort()) {
    const text = execFileSync("xz", ["-dc", join(dir, f)], { maxBuffer: 1 << 30 }).toString();
    for (const blk of text.split("\n\n")) {
      const d = Object.fromEntries([...blk.matchAll(/^([A-Za-z0-9-]+): (.*)$/gm)].map(m => [m[1], m[2]]));
      if (!want.has(d.Package) || !d.Filename) continue;
      out.push(`${d.SHA256}  ${d.Filename.split("/").pop()}  ${d.Filename}  ${d.Size}`);
    }
  }
  const head = readFileSync(LOCK, "utf8").split("\n").filter(l => l.startsWith("#"));
  writeFileSync(LOCK, [...head, ...[...new Set(out)].sort((a, b) => a.split("  ")[1].localeCompare(b.split("  ")[1]))].join("\n") + "\n");
  console.log(`lock rebuilt: ${out.length} lines (check that each package appears once, at the version you want)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "install" && arg) await install(arg);
  else if (cmd === "--manifest" && arg) manifest(arg);
  else { console.error("usage: ci-fonts.mjs install <cacheDir> | --manifest <dir>"); process.exit(2); }
}
