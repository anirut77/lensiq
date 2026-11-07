"use strict";
// Lets `node --test tests/unit` work on Node 22 (a directory argument resolves to this index).
// `npm run test:unit` (node --test "tests/unit/*.test.js") runs the same files, each in its own process.
// Every *.test.js in this folder is discovered automatically — there is no hand-maintained list to forget.
const fs = require("node:fs");
const path = require("node:path");

const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort();
if (!files.length) throw new Error("tests/unit: no *.test.js files found");
for (const f of files) require(path.join(__dirname, f));
