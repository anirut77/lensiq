"use strict";
// tests/unit/field-pilot-metrics.test.js — tools/field-pilot-metrics.mjs (docs/FIELD-PILOT.md): CSV parsing, plate
// normalisation shared with lensiq-plate.js, exact / CER / edit / time / silent-wrong-save metrics overall and per
// condition tag, Wilson CIs, the PROPOSAL thresholds and the CLI exit codes (--strict, --json); the shipped templates parse
// and hold only synthetic rows.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const P = require("../../lensiq-plate.js");

const ROOT = path.join(__dirname, "..", "..");
const TOOL = path.join(ROOT, "tools", "field-pilot-metrics.mjs");
const load = () => import(TOOL);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lq-field-pilot-"));
const write = (name, text) => { const f = path.join(tmp, name); fs.writeFileSync(f, text); return f; };
const cli = args => spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8" });

const PH = "read_id,photo_ref,ocr_result,ground_truth,saved_value,guard_edited,confirm_s,alternatives,conditions";
const PLATES = [PH,
  "1,SYN-1.jpg,9ฮฮ 9999,9ฮฮ-9999,,no,2,,day;leading-digit",
  "2,SYN-2.jpg,ฮฮ 1,ฮฮ 11,ฮฮ 11,yes,8,ฮฮ 11|ฮฮ 17,night;motorcycle",
  "3,SYN-3.jpg,ฮฮ ๑๒,ฮฮ 12,,no,4,,night",
  // silent wrong save: OCR wrong, not edited, saved as read
  "4,SYN-4.jpg,ฮช 12,ฮฮ 12,,no,3,,day;rain",
  // no ground truth -> skipped
  "5,SYN-5.jpg,ฮฮ 13,,,no,3,,day"
].join("\n");

const MH = "box_id,photo_ref,reg_ocr,reg_truth,reg_edited,lot_ocr,lot_truth,lot_edited,expiry_ocr,expiry_truth,expiry_edited,confirm_s,conditions";
const MED = [MH,
  "M1,SYN-M1.jpg,1a 99999 / 99,1A 99999/99,no,TEST01,TEST01,no,12-2099,12/2099,no,5,flat",
  "M2,SYN-M2.jpg,2A 8888/88,2A 88888/88 (N),yes,TESTO2,TEST02,yes,,11/2098,yes,15,curved;glossy-foil"
].join("\n");

test("parseCSV: quotes, escaped quotes, CRLF, BOM, blank lines", async () => {
  const T = await load();
  const rows = T.parseCSV("﻿a,b,c\r\n\"x, y\",\"he said \"\"hi\"\"\",\r\n\r\n1,\"multi\nline\",3\n");
  assert.deepEqual(rows, [{ a: "x, y", b: "he said \"hi\"", c: "" }, { a: "1", b: "multi\nline", c: "3" }]);
  assert.deepEqual(T.parseCSV(""), []);
});

test("normalisers: plates use LQPlate.normalize; registration numbers use LQMed.parseThaiReg", async () => {
  const T = await load();
  for (const s of ["1กข 2345", "ฮฮ-๑๒", " 9 ฮฮ . 9999 "]) assert.equal(T.normPlate(s), P.normalize(s));
  assert.equal(T.normReg("1a 15 / 50"), T.normReg("1A 15/50"));
  assert.equal(T.normReg("2A 3/60 (NG)"), "2A3/60(NG)");
  assert.equal(T.normExpiry("12-2099"), T.normExpiry("12/2099"));
});

test("platesReport: exact, CER, edit, time, silent wrong saves, good light / night, per tag", async () => {
  const T = await load();
  const r = T.platesReport(T.parseCSV(PLATES));
  assert.equal(r.n, 4);
  assert.equal(r.skipped, 1);
  const o = r.overall;
  assert.equal(o.exact.x, 2); // rows 1 and 3 (Thai digits normalised)
  assert.equal(o.edit.x, 1);
  assert.equal(o.silent, 1); // row 4
  // CER = (0 + 1 + 0 + 1) / (7 + 4 + 4 + 4)
  assert.ok(Math.abs(o.cer - 2 / 19) < 1e-12);
  assert.equal(o.timeMean, (2 + 8 + 4 + 3) / 4);
  assert.equal(o.timeMedian, 3.5);
  assert.ok(o.exact.lo < 0.5 && o.exact.hi > 0.5 && o.exact.p === 0.5);
  assert.equal(r.goodLight.n, 1); // row 4 is day but rain
  assert.equal(r.night.n, 2);
  assert.equal(r.night.exact.x, 1);
  assert.deepEqual(Object.keys(r.byTag), ["day", "leading-digit", "motorcycle", "night", "rain"]);
  assert.equal(r.byTag.rain.silent, 1);
  assert.equal(r.altHit.n, 2);
  assert.equal(r.altHit.x, 1);
});

test("medicineReport: per field exact / CER / edit; an edited field is not a silent wrong save", async () => {
  const T = await load();
  const m = T.medicineReport(T.parseCSV(MED));
  assert.equal(m.n, 2);
  assert.equal(m.fields.reg.overall.exact.x, 1);
  assert.equal(m.fields.lot.overall.exact.x, 1);
  assert.equal(m.fields.expiry.overall.exact.x, 1);
  for (const k of ["reg", "lot", "expiry"]) assert.equal(m.fields[k].overall.silent, 0);
  assert.ok(m.fields.reg.overall.cer > 0);
  assert.deepEqual(Object.keys(m.fields.reg.byTag), ["curved", "flat", "glossy-foil"]);
});

test("checkThresholds: PROPOSAL values, overrides and lower-bound mode", async () => {
  const T = await load();
  const plates = T.platesReport(T.parseCSV(PLATES)), medicine = T.medicineReport(T.parseCSV(MED));
  const c = T.checkThresholds({ plates, medicine });
  const by = id => c.find(x => x.id === id);
  assert.equal(by("plate.reads").ok, false);
  assert.equal(by("plate.exact.goodLight").ok, true);
  assert.equal(by("plate.silent").ok, false);
  assert.equal(by("med.reg.exact").ok, false);
  assert.equal(T.PROPOSAL.plateExactGoodLight, 0.95);
  assert.equal(T.PROPOSAL.plateExactNight, 0.85);
  assert.equal(T.PROPOSAL.medRegExact, 0.95);
  assert.equal(T.checkThresholds({ plates }, { plateMinReads: 4 }).find(x => x.id === "plate.reads").ok, true);
  // 1/1 good-light reads: point 100 % passes, Wilson lower bound ~21 % does not
  assert.equal(T.checkThresholds({ plates }, {}, { lowerBound: true }).find(x => x.id === "plate.exact.goodLight").ok, false);
});

test("CLI: table, --json, --strict exit codes, usage errors", () => {
  const pf = write("p.csv", PLATES), mf = write("m.csv", MED);
  const a = cli(["--plates", pf, "--medicine", mf]);
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /PLATES — 4 reads/);
  assert.match(a.stdout, /PROPOSAL/);
  assert.match(a.stdout, /#night/);
  const j = cli(["--plates", pf, "--json"]);
  assert.equal(j.status, 0);
  const rep = JSON.parse(j.stdout);
  assert.equal(rep.plates.n, 4);
  assert.equal(rep.pass, false);
  assert.equal(cli(["--plates", pf, "--strict"]).status, 1);
  assert.equal(cli([]).status, 2);
  assert.equal(cli(["--plates"]).status, 2);
  assert.equal(cli(["--bogus"]).status, 2);
});

test("CLI --strict passes on a large synthetic set that meets every proposal threshold", () => {
  const rows = [PH];
  for (let i = 0; i < 220; i++) {
    const night = i % 4 === 0, key = `ฮฮ ${1000 + i}`;
    // 2 night misreads, both corrected by the guard (not silent)
    const miss = night && i < 10;
    rows.push(`${i},SYN-${i}.jpg,${miss ? `ฮช ${1000 + i}` : key},${key},${miss ? key : ""},${miss ? "yes" : "no"},3,,${night ? "night" : "day"}`);
  }
  const med = [MH];
  for (let i = 0; i < 100; i++) med.push(`M${i},SYN-M${i}.jpg,1A ${100 + i}/99,1A ${100 + i}/99,no,T${i},T${i},no,01/2099,01/2099,no,6,flat`);
  const r = cli(["--plates", write("big-p.csv", rows.join("\n")), "--medicine", write("big-m.csv", med.join("\n")), "--strict"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /FAIL/);
});

test("templates: parse with the tool, every documented column present, synthetic rows only", async () => {
  const T = await load();
  const p = T.parseCSV(fs.readFileSync(path.join(ROOT, "docs/field-pilot/plates-template.csv"), "utf8"));
  const m = T.parseCSV(fs.readFileSync(path.join(ROOT, "docs/field-pilot/medicine-template.csv"), "utf8"));
  assert.equal(p.length, 2);
  assert.equal(m.length, 2);
  for (const k of ["photo_ref", "ocr_result", "ground_truth", "guard_edited", "confirm_s", "alternatives", "conditions"]) assert.ok(k in p[0], k);
  for (const k of ["reg_ocr", "reg_truth", "lot_ocr", "lot_truth", "expiry_ocr", "expiry_truth"]) assert.ok(k in m[0], k);
  for (const r of [...p, ...m]) {
    assert.match(r.photo_ref, /^SYNTHETIC-/);
    assert.match(r.notes, /SYNTHETIC/);
  }
  const doc = fs.readFileSync(path.join(ROOT, "docs/FIELD-PILOT.md"), "utf8");
  assert.match(doc, /Changelog/);
  assert.match(doc, /Status per round/);
  assert.match(doc, /PROPOSAL/);
  assert.match(doc, /node tools\/field-pilot-metrics\.mjs/);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
