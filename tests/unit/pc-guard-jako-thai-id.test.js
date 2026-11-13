"use strict";
// tests/unit/pc-guard-jako-thai-id.test.js — regression for the independent review of stream F (2026-11-13): the rule that a
// Japanese / Korean EAN-13 on a Japanese / Korean label is a barcode must never hide a Thai ID. Thai IDs below are synthetic
// and chosen because they also pass the EAN-13 check digit (about 1 in 10 do). Also: the live scan's progressive reading
// only ticks the checklist (the partial text is never applied, merged or sent).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const G = require("../../lensiq-pc-guard.js");

test("a Thai ID that is also a valid 45 / 49 / 880 EAN-13 is still removed and still blocks the photo in a Thai text", () => {
  const cases = [
    "ยาแก้ไอ ตราเสือ\nเลขทะเบียน 1A 15/50\n4500001662994\nパブロンゴールドA",
    "นาย สมชาย ใจดี\n4900001108667\nパブロン",
    "ยาพาราเซตามอล\n8800000158389\n한글 라벨"
  ];
  for (const t of cases) {
    const id = /\d{13}/.exec(t)[0];
    assert.ok(G.thaiIdOk(id), "fixture is a valid Thai ID: " + id);
    assert.ok(!G.redact(t).text.includes(id), "Thai ID removed: " + t);
    assert.equal(G.imageCheck(t).block, true, "photo blocked: " + t);
  }
});

test("on a Japanese / Korean label with no Thai, the JAN / Korean EAN-13 alone on a line is still a barcode", () => {
  for (const t of ["第3類医薬品\n成分 アセトアミノフェン 300mg\n4987123456786", "일반의약품\n성분 아세트아미노펜 500mg\n8806045308253"]) {
    const d = /\d{13}/.exec(t)[0];
    assert.ok(G.redact(t).text.includes(d), "barcode kept: " + t);
  }
});

test("live scan: the progressive reading handler only ticks the checklist", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "lensiq-pc-live-ui.js"), "utf8");
  const at = src.indexOf("onLines:");
  assert.ok(at > 0, "progressive handler present");
  const body = src.slice(at, src.indexOf("\n      });", at));
  assert.ok(/L\.checklist\(/.test(body) && /paintList\(\)/.test(body));
  for (const bad of ["liveApply", "merger.add", "apply(", "fetch", "send", "localStorage", "sessionStorage", "#pcText", "textContent", "innerHTML", "console."]) {
    assert.ok(!body.includes(bad), "partial text never goes to " + bad);
  }
});
