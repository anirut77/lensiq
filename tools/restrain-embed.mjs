#!/usr/bin/env node
// tools/restrain-embed.mjs — copy fortune-restrain.js (the single source of the restrain tags) into fortune-read.js between
// two markers, so the reading pages get it without one more request (speed budget). Run after every edit of
// fortune-restrain.js; tests/unit/fortune-restrain-embed.test.js fails when the copy drifts.
//   node tools/restrain-embed.mjs          write the copy
//   node tools/restrain-embed.mjs --check  exit 1 if the copy differs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BEGIN = "/* BEGIN fortune-restrain.js (copied by tools/restrain-embed.mjs; edit fortune-restrain.js, then run it) */\n";
const END = "/* END fortune-restrain.js */\n";
const src = readFileSync(join(ROOT, "fortune-restrain.js"), "utf8");
const file = join(ROOT, "fortune-read.js"), rd = readFileSync(file, "utf8");
const i = rd.indexOf(BEGIN), j = rd.indexOf(END);
const next = i >= 0 && j > i ? rd.slice(0, i) + BEGIN + src + rd.slice(j) : rd.replace(/\n*$/, "\n") + BEGIN + src + END;
if (process.argv.includes("--check")) {
  if (next !== rd) { console.error("restrain-embed: fortune-read.js copy differs from fortune-restrain.js (run node tools/restrain-embed.mjs)"); process.exit(1); }
  console.log("restrain-embed: OK");
} else if (next !== rd) { writeFileSync(file, next); console.log("restrain-embed: fortune-read.js updated"); } else console.log("restrain-embed: up to date");
