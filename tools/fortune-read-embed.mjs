#!/usr/bin/env node
// tools/fortune-read-embed.mjs — copy the single-source files the reading layout needs into fortune-read.js between markers,
// so the 15 reading pages load one script instead of three (speed budget: request counts on horoscope / numbers / report).
//   fortune-notice.js   -> top of fortune-read.js (the layout uses LQNotice while it loads); hub, planner and lucky colour
//                          still load fortune-notice.js alone
//   fortune-restrain.js -> end of fortune-read.js (the composer looks the tags up when it composes)
// Edit the source files only, then run this. tests/unit/fortune-read-embed.test.js fails when a copy drifts.
//   node tools/fortune-read-embed.mjs          write the copies
//   node tools/fortune-read-embed.mjs --check  exit 1 if a copy differs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PARTS = [{ file: "fortune-notice.js", at: "top" }, { file: "fortune-restrain.js", at: "end" }];
const begin = (/** @type {string} */ f) => `/* BEGIN ${f} (copied by tools/fortune-read-embed.mjs; edit ${f}, then run it) */\n`;
const end = (/** @type {string} */ f) => `/* END ${f} */\n`;
// a copy written by the first version of this tool (tools/restrain-embed.mjs markers) is replaced, not doubled
const OLD_B = "/* BEGIN fortune-restrain.js (copied by tools/restrain-embed.mjs; edit fortune-restrain.js, then run it) */\n";
const OLD_E = "/* END fortune-restrain.js */\n";

const file = join(ROOT, "fortune-read.js"), rd = readFileSync(file, "utf8");
let next = rd;
const oi = next.indexOf(OLD_B);
if (oi >= 0) next = next.slice(0, oi).replace(/\n*$/, "\n") + next.slice(next.indexOf(OLD_E, oi) + OLD_E.length);
for (const { file: f, at } of PARTS) {
  const src = readFileSync(join(ROOT, f), "utf8"), B = begin(f), E = end(f), i = next.indexOf(B), j = next.indexOf(E);
  if (i >= 0 && j > i) next = next.slice(0, i) + B + src + next.slice(j);
  else next = at === "top" ? B + src + E + next : next.replace(/\n*$/, "\n") + B + src + E;
}
if (process.argv.includes("--check")) {
  if (next !== rd) { console.error("fortune-read-embed: a copy in fortune-read.js differs from its source (run node tools/fortune-read-embed.mjs)"); process.exit(1); }
  console.log("fortune-read-embed: OK");
} else if (next !== rd) { writeFileSync(file, next); console.log("fortune-read-embed: fortune-read.js updated"); } else console.log("fortune-read-embed: up to date");
