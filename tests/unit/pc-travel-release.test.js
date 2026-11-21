"use strict";
// tests/unit/pc-travel-release.test.js — P9 release decisions (owner 2026-11-12): (5) the travel card says "may be incomplete"
// in plain words; since decision 223 (2026-11-21) it shows no figure, the INN figures stay in docs/accuracy-figures.json and
// the product-check technical sheet (no number typed in the module); (6) the
// Health Canada DPD attribution in TH / EN / ZH and its credit records; (7) the Thai-equivalents switch stays off.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const fig = JSON.parse(read("docs/accuracy-figures.json"));

test("(5) limit line (decision 223): plain words, no figures, TH / EN / ZH; the INN figures kept in the data file and the technical sheet", () => {
  // was: md.pc.tv.acc generated from docs/accuracy-figures.json with {innRecall} {innPrec} {innN} and "recall 0.811 … precision
  // 0.971 … อาจไม่ครบ" on the page; now: the page, the dictionaries and the module show no figure, the plain sentence is shown,
  // and the figures stay unchanged in docs/accuracy-figures.json and in docs/tech-sheets/product-check-EN.md
  assert.equal(fig.figures.innRecall.value, "0.811");
  assert.equal(fig.figures.innPrec.value, "0.971");
  assert.equal(fig.figures.innN.value, "173");
  const TH = "รายการชื่อยานี้อาจไม่ครบ (เช่น ยาสูตรผสม หรือตัวอักษรที่อ่านผิด) เทียบกับส่วนประกอบบนกล่องเสมอ";
  const m = read("medicine.html").match(/<p hidden data-i18n="md\.pc\.tv\.acc">([^<]*)<\/p>/);
  assert.ok(m, "medicine.html keeps the md.pc.tv.acc element (the travel card copies it)");
  assert.equal(m[1].replace(/\s+/g, " ").trim(), TH);
  const FIG = /0\.811|0\.971|\b173\b|recall|precision|n\s?=|召回率|精确率|synthetic|合成/i;
  assert.doesNotMatch(m[1], FIG, "no figure on the page");
  const dict = l => { const ctx = { window: {} }; require("node:vm").runInNewContext(read(`i18n/${l}-med.js`), ctx); return Object.assign({}, ...ctx.window.LQI18N_Q.map(q => q[l] || {})); };
  const en = dict("en")["md.pc.tv.acc"], zh = dict("zh")["md.pc.tv.acc"];
  assert.match(en, /may be incomplete/);
  assert.match(en, /always compare it with the ingredients on the box/);
  assert.match(zh, /可能不完整/);
  for (const [l, v] of [["en", en], ["zh", zh]]) assert.doesNotMatch(v, FIG, `${l}: no figure`);
  const src = read("lensiq-pc-travel.js");
  assert.ok(!/0\.811|0\.971|n = 173/.test(src), "no measured number typed into lensiq-pc-travel.js");
  assert.match(src, /data-i18n="md\.pc\.tv\.acc"/);
  const sheet = read("docs/tech-sheets/product-check-EN.md");
  for (const v of ["0.811", "0.971", "173"]) assert.ok(sheet.includes(v), `technical sheet keeps the INN figure ${v}`);
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
