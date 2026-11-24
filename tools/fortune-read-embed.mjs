#!/usr/bin/env node
// tools/fortune-read-embed.mjs — copy the single-source files the reading layout needs into fortune-read.js between markers,
// so the 15 reading pages load one script instead of three (speed budget: request counts on horoscope / numbers / report).
//   fortune-notice.js   -> top of fortune-read.js (the layout uses LQNotice while it loads); hub, planner and lucky colour
//                          still load fortune-notice.js alone
//   fortune-restrain.js -> end of fortune-read.js (the composer looks the tags up when it composes)
//   lensiq-crisis-takeover.js -> end of fortune-read.js (crisis-net hotfix 2026-11-16: no extra request on the reading pages)
//   fortune-depth.js    -> end of fortune-read.js (the depth layer behind "อ่านเพิ่มเติม"; the composer looks it up when it composes)
//   lensiq-crashguard.js -> end of fortune-read.js (acceptance E "crash guard loaded" on every reading page, 2026-11-23:
//                          no extra request; a page that also has its own tag keeps one guard, see LQCrashGuard check)
//   fortune-readbar.js  -> end of fortune-read.js AND end of planner.js (sticky read bar, owner order 2026-11-16 item 3;
//                          planner loads no fortune-read.js and has no request to spare)
// Edit the source files only, then run this. tests/unit/fortune-read-embed.test.js fails when a copy drifts.
//   node tools/fortune-read-embed.mjs          write the copies
//   node tools/fortune-read-embed.mjs --check  exit 1 if a copy differs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PARTS = [{ file: "fortune-notice.js", at: "top" }, { file: "fortune-restrain.js", at: "end" }, { file: "lensiq-crisis-takeover.js", at: "end" }, { file: "fortune-readbar.js", at: "end" },
  { file: "fortune-depth.js", at: "end" }, { file: "lensiq-crashguard.js", at: "end" }];
const begin = (/** @type {string} */ f) => `/* BEGIN ${f} (copied by tools/fortune-read-embed.mjs; edit ${f}, then run it) */\n`;
const end = (/** @type {string} */ f) => `/* END ${f} */\n`;
// a copy written by the first version of this tool (tools/restrain-embed.mjs markers) is replaced, not doubled
const OLD_B = "/* BEGIN fortune-restrain.js (copied by tools/restrain-embed.mjs; edit fortune-restrain.js, then run it) */\n";
const OLD_E = "/* END fortune-restrain.js */\n";

/** the target with every part in place @param {string} rd @param {{file: string, at: string}[]} parts */
function embed(rd, parts) {
  let next = rd;
  const oi = next.indexOf(OLD_B);
  if (oi >= 0) next = next.slice(0, oi).replace(/\n*$/, "\n") + next.slice(next.indexOf(OLD_E, oi) + OLD_E.length);
  for (const { file: f, at } of parts) {
    const src = readFileSync(join(ROOT, f), "utf8"), B = begin(f), E = end(f), i = next.indexOf(B), j = next.indexOf(E);
    if (i >= 0 && j > i) next = next.slice(0, i) + B + src + next.slice(j);
    else next = at === "top" ? B + src + E + next : next.replace(/\n*$/, "\n") + B + src + E;
  }
  return next;
}
// fortune-crisis-net.js -> top of fortune-crisis.js (review round 2: one pattern source for the net and its fallback)
const TARGETS = [{ name: "fortune-read.js", parts: PARTS }, { name: "planner.js", parts: [{ file: "fortune-readbar.js", at: "end" }] },
  { name: "fortune-crisis.js", parts: [{ file: "fortune-crisis-net.js", at: "top" }] }];
const stale = [];
for (const t of TARGETS) {
  const file = join(ROOT, t.name), rd = readFileSync(file, "utf8"), next = embed(rd, t.parts);
  if (next === rd) continue;
  stale.push(t.name);
  if (!process.argv.includes("--check")) writeFileSync(file, next);
}
if (process.argv.includes("--check")) {
  if (stale.length) { console.error("fortune-read-embed: a copy differs from its source in " + stale.join(", ") + " (run node tools/fortune-read-embed.mjs)"); process.exit(1); }
  console.log("fortune-read-embed: OK");
} else console.log(stale.length ? "fortune-read-embed: updated " + stale.join(", ") : "fortune-read-embed: up to date");
