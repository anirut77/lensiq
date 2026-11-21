"use strict";
// tests/unit/examlab-phone-tune-separation.test.js — owner decision 217 ก (2026-11-21): the Exam lab A2 tuning set shares
// nothing with the locked A2 set. Locked BEFORE any measurement (evals-locks/examlab-phone-tune__harness1.sha256).
// Reads the repo copies (docs/exam/examlab-phone/ and docs/exam/examlab-phone-tune/: ids, image sha256, credits; no images),
// so it runs in CI. Asserts zero overlap by Open Images id, image sha256, file name and Flickr photo id; every tuning image is
// CC BY 2.0; labels come from dataset boxes only (pos rows have phone boxes, neg rows none).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../../tools/examlab-phone-separation.mjs");

const R = path.join(__dirname, "..", "..");
const read = (/** @type {string} */ p) => fs.readFileSync(path.join(R, p), "utf8");
const locked = { manifest: read("docs/exam/examlab-phone/manifest.jsonl"), attribution: read("docs/exam/examlab-phone/ATTRIBUTION.csv") };
const tune = { manifest: read("docs/exam/examlab-phone-tune/manifest.jsonl"), attribution: read("docs/exam/examlab-phone-tune/ATTRIBUTION.csv") };

test("tuning set and locked A2 set share no id, sha256, file or Flickr photo", () => {
  const o = S.overlaps(locked, tune);
  assert.equal(o.counts.locked, 358, "locked A2 set size");
  assert.ok(o.counts.tune >= 150, "tuning set has at least 150 images");
  assert.deepEqual(o.ids, []);
  assert.deepEqual(o.sha256, []);
  assert.deepEqual(o.files, []);
  assert.deepEqual(o.flickr, []);
  assert.doesNotThrow(() => S.assertSeparated(locked, tune));
});

test("the separation check catches an overlap (self-test)", () => {
  const first = tune.manifest.trim().split("\n")[0];
  assert.throws(() => S.assertSeparated(locked, { manifest: locked.manifest.trim().split("\n")[0], attribution: "h\n" }), /ids 1/);
  assert.throws(() => S.assertSeparated({ manifest: first, attribution: "h\n" }, tune), /ids 1, sha256 1, files 1/);
});

test("tuning images: CC BY 2.0 only, labels from dataset boxes, one credit per image", () => {
  const rows = S.manifestRows(tune.manifest);
  const att = tune.attribution.trim().split("\n").slice(1);
  assert.equal(att.length, rows.length);
  const ids = new Set(rows.map(r => r.id));
  for (const l of att) {
    const id = l.split(",")[0];
    assert.ok(ids.has(id), "credit for an image not in the manifest: " + id);
    assert.ok(l.includes(",https://creativecommons.org/licenses/by/2.0/,"), "not CC BY 2.0: " + id);
  }
  for (const r of /** @type {any[]} */ (rows)) {
    assert.match(r.sha256, /^[0-9a-f]{64}$/);
    if (r.label === "pos") { assert.ok(r.phones.length >= 1 && r.phoneLong > 0 && r.phoneLong < 0.4, "pos " + r.id); }
    else { assert.equal(r.label, "neg"); assert.deepEqual(r.phones, []); }
  }
});
