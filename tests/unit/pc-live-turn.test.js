"use strict";
// tests/unit/pc-live-turn.test.js — capture guidance, next step (2026-11-14): after the live scan has read a side in full,
// a side with nothing on the checklist (no barcode, registration number or ingredients; most likely the front of the
// pack) gets the "turn" hint; any ticked item keeps "done". On-device hint only. TH / EN / ZH strings present.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../../lensiq-pc-live.js");
const G = require("../../lensiq-pc-guard.js");
const P = require("../../lensiq-pc.js");

test("sideHint: nothing found -> turn; any checklist item -> done", () => {
  assert.equal(L.sideHint({ barcode: false, reg: false, ingredients: false }), "turn");
  assert.equal(L.sideHint(undefined), "turn");
  for (const k of ["barcode", "reg", "ingredients"]) assert.equal(L.sideHint({ [k]: true }), "done", k);
});

test("a front panel (name and slogan) reads as turn; a back panel with ingredients reads as done", () => {
  const front = L.checklist("SUPER VITA C\nเสริมภูมิ สดชื่นทุกวัน\n30 เม็ด", [], { P, G });
  assert.equal(L.sideHint(front), "turn");
  const back = L.checklist("ส่วนประกอบ: วิตามินซี 1000 มก. แคลเซียม\nวิธีใช้ รับประทานวันละ 1 เม็ด", [], { P, G });
  assert.equal(L.sideHint(back), "done");
});

test("the live UI uses it and the hint exists in TH / EN / ZH", () => {
  const ui = fs.readFileSync(path.join(__dirname, "../../lensiq-pc-live-ui.js"), "utf8");
  assert.match(ui, /setHint\(L\.sideHint \? L\.sideHint\(st\.list\) : "done"\)/);
  assert.match(ui, /turn: T\("md\.pc\.live\.h\.turn", "[^"]+"\)/);
  for (const f of ["i18n/en-med.js", "i18n/zh-med.js"]) assert.ok(fs.readFileSync(path.join(__dirname, "../..", f), "utf8").includes('"md.pc.live.h.turn":'), f);
});
