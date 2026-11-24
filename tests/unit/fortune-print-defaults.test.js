// tests/unit/fortune-print-defaults.test.js — FIXED TEST SET, phase fortune-print (2026-11-24), locked before the build
// (~/LENSIQ-field/evals/fortune-print/, evals-locks/fortune-print.sha256). Acceptance X rows: docs/acceptance/faceread.md
// "Print A4 and 80 mm (photo off by default) and share", docs/acceptance/fortune-pages.md "Print (A4 / A5 / 80 mm) and share".
// Browser half: tests/e2e/fortune-print-photo.e2e.mjs (P4 OFF by default), fortune-print-report-*, fortune-share-print-*.
//   D1  print: "include my photo in the report" starts unticked on face / palm reading; with no checkbox the report has no photo
//   D2  the paper report draws the photo only when asked (fallback = neutral outline)
//   D3  print and share are wired on horoscope (text page), palm and faceread, with the photo canvas named for face / palm only
//   D4  in the crisis / calm state the print and share options and the photo option are hidden (CSS) and removed (code)
//   D5  the photo option text exists in TH / EN / ZH
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const R = path.join(__dirname, "..", "..");
const SPJ = fs.readFileSync(path.join(R, "fortune-share.js"), "utf8");
const PRJ = fs.readFileSync(path.join(R, "fortune-print.js"), "utf8");
const body = (src, name) => {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i >= 0, name + " exists");
  let d = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(j, k + 1); }
  return "";
};

test("D1 print: the photo checkbox starts unticked; no checkbox = no photo", () => {
  const add = body(SPJ, "addPhotoOpt");
  assert.match(add, /\.checked\s*=\s*false/, "addPhotoOpt creates an unticked checkbox");
  assert.doesNotMatch(add, /\.checked\s*=\s*true/, "never ticked by default");
  const chk = body(SPJ, "photoChecked");
  assert.match(chk, /:\s*false\s*;?\s*\}$/, "photoChecked falls back to false (no photo) when there is no checkbox");
});

test("D2 the paper report uses the photo only when asked", () => {
  const m = /const photoOn = ([^;]+);/.exec(PRJ);
  assert.ok(m, "photoOn in fortune-print.js");
  assert.match(m[1], /:\s*false\s*$/, "fallback is false: " + m[1]);
  assert.doesNotMatch(m[1], /:\s*true\s*$/, "no ON fallback");
});

test("D3 print and share on horoscope, palm and faceread; photo canvas only on face / palm", () => {
  const SP = require(path.join(R, "fortune-share.js"));
  const P = SP.PAGES || SP.pages;
  assert.ok(P, "fortune-share.js exports its page map");
  for (const k of ["horoscope", "palm", "faceread"]) assert.ok(P[k], k + " in the share / print page map");
  assert.ok(!P.horoscope.photo, "a text page has no photo");
  assert.equal(P.palm.photo, "#plResCanvas");
  assert.equal(P.faceread.photo, "#frResCanvas");
});

test("D4 crisis / calm: share, print and the photo option are hidden and removed", () => {
  assert.match(SPJ, /html\[data-lq-crisis\] \[data-lq-sp-photo\]/, "photo option hidden in crisis (CSS)");
  assert.match(SPJ, /html\[data-lq-calm\] \[data-lq-sp-photo\]/, "photo option hidden in calm (CSS)");
  const sync = body(SPJ, "sync");
  assert.match(sync, /if \(!ok\)[^\n]*\[data-lq-sp-photo\][^\n]*\.remove\(\)/, "sync removes our controls when not allowed");
});

test("D5 the photo option text in TH / EN / ZH", () => {
  const SP = require(path.join(R, "fortune-share.js"));
  assert.equal(SP.L.th.photoPrint, "ใส่รูปถ่ายในรายงาน");
  assert.ok(/photo/i.test(SP.L.en.photoPrint));
  assert.ok(/照片/.test(SP.L.zh.photoPrint));
});
