"use strict";
// tests/unit/pc-travel-release.test.js — P9 release decisions (owner 2026-11-12): (5) the travel card shows the measured INN
// numbers and "may be incomplete", generated from docs/accuracy-figures.json (no number typed in the module); (6) the
// Health Canada DPD attribution in TH / EN / ZH and its credit records; (7) the Thai-equivalents switch stays off.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const fig = JSON.parse(read("docs/accuracy-figures.json"));

test("(5) accuracy line: generated text with the independent numbers, TH / EN / ZH; none typed into the module", () => {
  const t = fig.texts.find(x => x.key === "md.pc.tv.acc");
  assert.ok(t, "md.pc.tv.acc is a generated text");
  for (const k of ["innRecall", "innPrec", "innN"]) for (const l of ["th", "en", "zh"]) assert.match(t[l], new RegExp(`\\{${k}\\}`), `${l} uses {${k}}`);
  // re-locked 2026-11-14 (owner decision: card figure 0.811 -> 0.907, independent hold-out 2, 188 synthetic labels; ACCURACY.md section 16)
  assert.equal(fig.figures.innRecall.value, "0.907");
  assert.equal(fig.figures.innPrec.value, "0.971");
  assert.equal(fig.figures.innN.value, "188");
  assert.match(t.en, /measured on \{innN\} synthetic labels, independent test/);
  assert.match(t.en, /may be incomplete/);
  assert.match(read("medicine.html"), /<p hidden data-i18n="md\.pc\.tv\.acc">[^<]*recall 0\.907[^<]*188 ฉลาก[^<]*precision 0\.971[^<]*อาจไม่ครบ[^<]*<\/p>/);
  const src = read("lensiq-pc-travel.js");
  assert.ok(!/0\.907|0\.811|0\.971|n = 173|n = 188/.test(src), "no measured number typed into lensiq-pc-travel.js");
  assert.match(src, /data-i18n="md\.pc\.tv\.acc"/);
});

test("(6) DPD attribution on the card in three languages, and in the credit records", () => {
  const lk = read("lensiq-pc-lookup.js");
  assert.match(lk, /T\("md\.pc\.l\.cr\.dpd",\s*\n?\s*"มีข้อมูลภายใต้สัญญาอนุญาต Open Government Licence – Canada/);
  for (const l of ["en", "zh"]) assert.match(read(`i18n/${l}-med.js`), /"md\.pc\.l\.cr\.dpd": "[^"]*Open Government Licence – Canada/);
  assert.match(read("i18n/en-med.js"), /"md\.pc\.l\.cr\.dpd": "Contains information licensed under the Open Government Licence – Canada/);
  for (const f of ["docs/CREDITS-MEDIA.md", "LICENSES/THIRD_PARTY.md", "docs/LEGAL-PACKET.md"]) assert.match(read(f), /Drug Product Database|DPD/, f);
});

test("(7) Thai equivalents stay off by default", () => {
  assert.match(read("lensiq-config.js"), /window\.LENSIQ_PC_THAI_EQUIV = window\.LENSIQ_PC_THAI_EQUIV === true;/);
});
