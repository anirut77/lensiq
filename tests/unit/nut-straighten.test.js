"use strict";
// tests/unit/nut-straighten.test.js — Nutrition label mode, straighten-before-reading (coordinator 2026-11-13, option 1;
// branch only). FIXED TEST, written and locked (~/LENSIQ-field/evals/nutrition/v5/locked.sha256) BEFORE the code:
//   1. LQNut.straightenAngle(tilt): the page turns the picture back by the estimated tilt ONLY between 1 and 3 degrees
//      (below: not needed; above: the values stay "please check", nothing is straightened);
//   2. the Japanese statement keyword with a dropped "ギ" ("アレル一物質", "アレル物質") is still found, verbatim.
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../../lensiq-nut.js");

test("straightenAngle: turn back by the tilt only between 1 and 3 degrees", () => {
  for (const [t, want] of [[0, 0], [0.5, 0], [0.9, 0], [1, -1], [1.8, -1.8], [2.3, -2.3], [3, -3], [-2, 2], [-3, 3], [3.4, 0], [4, 0], [6, 0], [-6, 0]])
    assert.equal(N.straightenAngle(t), want, `tilt ${t}`);
});

test("Japanese statement with a dropped 'ギ' is still found, verbatim; no false statement", () => {
  for (const line of ["アレル一物質：乳成分・小麦", "アレル物質：卵・大豆", "アレルー物質：えび・かに"]) {
    const a = N.parseLabel(["栄養成分表示 1袋（50g）当たり", "エネルギー 260kcal", line]).allergen;
    assert.ok(a && a.text === line, "found verbatim: " + line);
  }
  assert.equal(N.parseLabel(["栄養成分表示", "エネルギー 260kcal", "アレンジ自由"]).allergen, null);
});
