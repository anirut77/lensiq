#!/usr/bin/env node
// tools/fortune-gate.mjs — the per-page gate of the fortune-quality changes (owner decision 86 ค, 2026-11-17).
// Config: tools/fortune-gate.json { live: <live main commit>, on: [page names] }.
//   ON pages keep this branch's HTML and load the new scripts.
//   Every other page becomes live main's HTML, byte for byte, except that each published script this branch changed (root *.js and
//   i18n/*.js that exist on live) is loaded from live/<same path>, a byte-identical copy of the live file. A zh dictionary whose
//   English sibling changed is copied too (the sibling's path is derived from the zh tag), and every copied zh dictionary gets its
//   English sibling next to it. Nothing else changes; the root files stay this branch's (the Node tests keep testing them).
//   node tools/fortune-gate.mjs           write live/ and the OFF pages
//   node tools/fortune-gate.mjs --check   exit 1 when live/ or a page differs from what the gate would write
// Locked test: tests/unit/fortune-gate.test.js (live reference tests/unit/fortune-gate-live.json).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CFG = JSON.parse(readFileSync(join(ROOT, "tools", "fortune-gate.json"), "utf8"));
const git = (...a) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "buffer", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
const atLive = f => { try { return git("show", `${CFG.live}:${f}`); } catch { return null; } };
const pub = f => /^[^/]+\.js$/.test(f) || /^i18n\/[^/]+\.js$/.test(f);

// the published scripts this branch changed (working tree against live), as they are on live
const changed = git("diff", "--name-only", CFG.live, "--").toString().split("\n").filter(f => f && pub(f) && atLive(f) !== null);
const copies = new Map(changed.map(f => [f, atLive(f)]));
for (const f of [...copies.keys()]) { // a zh dictionary whose English sibling changed
  const m = /^i18n\/en-(.+\.js)$/.exec(f), zh = m && "i18n/zh-" + m[1];
  if (zh && !copies.has(zh) && atLive(zh) !== null) copies.set(zh, atLive(zh));
}
for (const f of [...copies.keys()]) { // every copied zh dictionary keeps its English sibling next to it
  const m = /^i18n\/zh-(.+\.js)$/.exec(f), en = m && "i18n/en-" + m[1];
  if (en && !copies.has(en) && atLive(en) !== null) copies.set(en, atLive(en));
}
const want = new Map(); // path -> Buffer
const used = new Set();
const on = new Set(CFG.on.map(p => p + ".html"));
for (const p of readdirSync(ROOT).filter(f => f.endsWith(".html"))) {
  if (on.has(p)) continue;
  const html = atLive(p);
  if (html === null) continue; // a page live does not have stays as it is
  const out = html.toString("utf8").replace(/(<script[^>]*\ssrc=")([^"?]+)/g, (a, pre, src) => (copies.has(src) ? (used.add(src), pre + "live/" + src) : a));
  want.set(p, Buffer.from(out, "utf8"));
}
// only the copies an OFF page loads, each zh dictionary with its English sibling
for (const f of [...used]) { const m = /^i18n\/zh-(.+\.js)$/.exec(f); if (m && copies.has("i18n/en-" + m[1])) used.add("i18n/en-" + m[1]); }
for (const f of used) want.set("live/" + f, copies.get(f));

if (process.argv.includes("--check")) {
  const bad = [];
  for (const [f, b] of want) if (!existsSync(join(ROOT, f)) || !readFileSync(join(ROOT, f)).equals(b)) bad.push(f);
  const walk = d => (existsSync(join(ROOT, d)) ? readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(d + "/" + e.name) : [d + "/" + e.name])) : []);
  for (const f of walk("live")) if (!want.has(f)) bad.push(f + " (not a live copy)");
  if (bad.length) { console.error("fortune-gate: differs:\n  " + bad.join("\n  ")); process.exit(1); }
  console.log(`fortune-gate: OK (ON: ${CFG.on.join(", ")}; ${used.size} live copies)`);
} else {
  rmSync(join(ROOT, "live"), { recursive: true, force: true });
  for (const [f, b] of want) { mkdirSync(dirname(join(ROOT, f)), { recursive: true }); writeFileSync(join(ROOT, f), b); }
  console.log(`fortune-gate: ON ${CFG.on.join(", ")}; ${used.size} live copies; ${[...want.keys()].filter(f => f.endsWith(".html")).length} OFF pages written`);
}
