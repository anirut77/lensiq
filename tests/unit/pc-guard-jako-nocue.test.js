"use strict";
// tests/unit/pc-guard-jako-nocue.test.js — stream F2 (2026-11-13): Japanese / Korean names WITHOUT a field word, in notes next to
// a product label. DEV cases (synthetic, written for these rules; the fresh hold-out 3 decides), each with counter-cases that
// must stay untouched.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../lensiq-pc-guard.js");
const removed = t => G.redact(t).removed.map(r => r.text);

test("names in class / group lines, after or before a family word, before 'to', on a spaced full-name line", () => {
  const CASES = [
    ["5年1組 小林 かな 発熱のため", "小林 かな"], ["ぞうぐみ  いけだ そうた", "いけだ そうた"], ["5학년 3반 이도현", "이도현"], ["햇살반 성은유", "성은유"],
    ["해바라기반 하윤이", "하윤"], ["北村 陽翔(3年2組)", "北村 陽翔"], ["長男 川端 修 090-6623-1180", "川端 修"], ["母 マサ子 → 薬 取りに", "マサ子"],
    ["형 민혁 학원 5시", "민혁"], ["복순 할머니 ✔ 아침", "복순"], ["ひろとへ お薬のんでね", "ひろと"], ["지우에게", "지우"], ["さいとう こうた", "さいとう こうた"],
    ["원아 다빈", "다빈"], ["이름은 오세린", "오세린"], ["Name 허재윤  Sex M", "허재윤"], ["LINE ID: haruka_0412k", "haruka_0412k"],
    ["TEL 09O-3318-2276", "09O-3318-2276"], ["連絡先 0 70-5528-3061", "0 70-5528-3061"]
  ];
  for (const [t, v] of CASES) assert.ok(removed(t).includes(v), t + " -> " + JSON.stringify(removed(t)));
  const r = removed("3호차 고은서 / 라온 / 시율");
  for (const v of ["고은서", "라온", "시율"]) assert.ok(r.includes(v), v);
});

test("label wording, foods, brands and Chinese packs are kept", () => {
  for (const t of ["일반 의약품", "할머니 손맛 김치", "할머니 인절미", "엄마 아빠가 안심하는 순한 원단", "おばあちゃんの梅干し", "がんこ爺さんの番茶", "第2類 医薬品",
    "苏打 饼干\n配料：小麦粉", "고객님께 감사드립니다", "大人 1回2錠 1日3回", "성인 1회 1정", "お客様相談室 0120-123-456"]) {
    assert.equal(G.redact(t).count, 0, t + " -> " + JSON.stringify(removed(t)));
  }
});

test("one-tap stops (preview only, nothing removed) on a bare short name line or a name before a dose", () => {
  for (const t of ["かずよ", "ゆうき 朝1錠", "서윤이 1회 5ml"]) assert.ok(G.possibleNames(t).length > 0, t);
  for (const t of ["大人 1回2錠", "어린이 1회 5ml"]) assert.equal(G.possibleNames(t).length, 0, t);
});
