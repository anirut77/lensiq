// tests/unit/plate-train-owner-1113.test.js — owner answers of 2026-11-13 on the plate training path (stream H):
// (a) per plate type, a type with fewer than 20 photos in the test split is UNMEASURED (no claim for it);
// (b) the CONSENT.md template names the basis for the photos (site-owner permission + PDPA sign + no people, or only cars
//     of owners who agreed) and keeps no names in the training folder;
// (c) a first "dev batch" (owner's factory, cars of people who agree) can be split and trained on, but it never leads to an
//     adoption decision, and its photos can be forced out of a later held-out test split.
// Locked before the code (evals-locks/gate-hall-h.sha256).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const repo = path.join(__dirname, "..", "..");
const prep = () => import(path.join(repo, "tools", "plate-train-prep.mjs"));
const cmp = () => import(path.join(repo, "tools", "plate-det-compare.mjs"));
const evalTool = () => import(path.join(repo, "tools", "plate-field-eval.mjs"));
const HEAD = "file,category,plate,province,x0,y0,x1,y1,split,sure,notes";
const W = (x, n) => ({ x, n, p: n ? x / n : null });

test("per type: fewer than 20 test photos of a type -> UNMEASURED, no claim", async () => {
  const { TYPE_MIN, perType } = await cmp();
  assert.equal(TYPE_MIN, 20);
  const run = det => ({ summary: {
    white: { photos: 30, det: W(det, 30), after: { exact: W(10, 25), false: 0, wrong: 1 }, tapsNeeded: W(20, 30) },
    blue: { photos: 3, det: W(1, 3), after: { exact: W(1, 3), false: 0, wrong: 0 }, tapsNeeded: W(2, 3) },
    "all plates": { photos: 33, det: W(det + 1, 33), after: { exact: W(11, 28), false: 0, wrong: 1 }, tapsNeeded: W(22, 33) },
    none: { photos: 15, after: { false: 0 } } } });
  const rows = perType(run(12), run(18));
  assert.deepEqual(rows.map(r => r.cat), ["white", "blue"]);
  const white = rows[0], blue = rows[1];
  assert.equal(white.measured, true); assert.equal(white.n, 30);
  assert.deepEqual([white.base.det, white.cand.det], [12, 18]);
  assert.equal(blue.measured, false);
  assert.match(blue.note, /^UNMEASURED \(n = 3 < 20\): no claim/);
  const { formatTypes } = await cmp();
  const t = formatTypes(rows);
  assert.match(t, /\| blue \| 3 \| UNMEASURED/);
  assert.match(t, /\| white \| 30 \| 12 → 18 \|/);
});

test("dev batch: never an adoption decision, whatever the numbers", async () => {
  const { decide } = await cmp();
  const s = (o = {}) => ({ platePhotos: 90, nonePhotos: 20, det: 40, exact: 30, falseNone: 0, falsePlate: 0, wrong: 2, taps: 60, msMedian: 1500, ...o });
  const d = decide(s(), s({ det: 80, exact: 50, taps: 30 }), { devBatch: true });
  assert.equal(d.adopt, null);
  assert.match(d.note, /dev batch/);
});

test("split: the dev batch is locked under its own label; a later split can force the batch's photos out of test", async () => {
  const { makeSplit, bucket, devBatchRule } = await prep();
  const { parseLabels } = await evalTool();
  const rows = [HEAD];
  for (let i = 0; i < 60; i++) rows.push(`f${i}.jpg,white,กข ${1000 + i},,,,,,,,`);
  const { photos } = parseLabels(rows.join("\n"));
  const plain = makeSplit(photos);
  const testFiles = Object.keys(plain.files).filter(f => plain.files[f] === "test");
  assert.ok(testFiles.length > 0);
  const forced = makeSplit(photos, { trainOnly: new Set(testFiles) });
  for (const f of testFiles) assert.equal(forced.files[f], "train", f);
  for (const f of Object.keys(plain.files)) if (!testFiles.includes(f)) assert.equal(forced.files[f], plain.files[f]);
  assert.notEqual(forced.sha256, plain.sha256);
  assert.equal(forced.trainOnly, testFiles.length);
  // the default split is unchanged by the new option (locked rule plate-split-v1)
  assert.equal(plain.files["f0.jpg"], bucket("กข1000"));
  assert.equal(devBatchRule(plain).rule, "plate-split-v1-devbatch");
  assert.equal(devBatchRule(plain).devBatch, true);
  assert.equal(devBatchRule(plain).sha256, plain.sha256);
});

test("CONSENT.md template: names the basis, whose agreement, no names in the folder", async () => {
  const { CONSENT_TEMPLATE } = await prep();
  assert.match(CONSENT_TEMPLATE, /site owner/i);
  assert.match(CONSENT_TEMPLATE, /PDPA/);
  assert.match(CONSENT_TEMPLATE, /vehicle owner/i);
  assert.match(CONSENT_TEMPLATE, /\bA\b.*\bB\b/s);
  assert.match(CONSENT_TEMPLATE, /no names/i);
  assert.match(CONSENT_TEMPLATE, /เจ้าของสถานที่/);
  assert.match(CONSENT_TEMPLATE, /เจ้าของรถ/);
});
