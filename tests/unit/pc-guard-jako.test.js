"use strict";
// tests/unit/pc-guard-jako.test.js — Japanese / Korean personal-data guard (stream F, 2026-11-13). Locked BEFORE the guard
// change (evals-locks/pc-f.sha256). Source of every number: synthetic (docs/product-check/pcf-jako-testset.json, the
// builder's dev set). The independent hold-out (~/LENSIQ-field/evals/pc-f/holdout-jako/) is scored once, outside this test.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const G = require("../../lensiq-pc-guard.js");

const ROOT = path.join(__dirname, "..", "..");
let score;
test.before(async () => { score = (await import(path.join(ROOT, "tools", "pc-guard-jako-score.mjs"))).scoreSet; });
const kinds = t => G.redact(t).removed.map(r => r.kind + "=" + r.text);

test("dev set (synthetic): no personal value reaches the AI in any mode; cued recall and product targets", () => {
  const set = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/product-check/pcf-jako-testset.json"), "utf8"));
  assert.equal(set.schema, "lensiq-pcf-jako-testset/1");
  assert.ok(set.items.length >= 140);
  const m = score(set.items, G);
  console.log("pcf jako dev:", JSON.stringify({ values: m.values, recall: m.recall, recallCued: m.recallCued, textLeak: m.textLeak, imageLeak: m.imageLeak,
    oneTapLeak: m.oneTapLeak, products: m.products, falseRedaction: m.falseRedaction, gateRefused: m.gateRefused, oneTapLost: m.oneTapLost }));
  assert.equal(m.textLeak, 0, "text leaks " + JSON.stringify(m.leakItems));
  assert.equal(m.imageLeak, 0, "image leaks " + JSON.stringify(m.leakItems));
  assert.equal(m.oneTapLeak, 0, "one-tap leaks " + JSON.stringify(m.leakItems));
  assert.ok(m.recallCued >= 0.95, "cued recall " + m.recallCued + " " + JSON.stringify(m.misses.filter(x => x.cue !== "none")));
  assert.ok(m.falseRedactionRate <= 0.02, "false redaction " + JSON.stringify(m.productDetail));
  assert.equal(m.gateRefused, 0, "product labels refused " + JSON.stringify(m.productDetail));
});

test("Japanese name fields and honorifics are removed", () => {
  assert.deepEqual(kinds("患者氏名 山田 太郎\n処方 ロキソプロフェン"), ["name=山田 太郎"]);
  assert.deepEqual(kinds("氏名: 佐藤花子"), ["name=佐藤花子"]);
  assert.deepEqual(kinds("お名前 鈴木一郎"), ["name=鈴木一郎"]);
  assert.ok(kinds("田中さんへ\nお大事に").some(k => k.startsWith("name=") && k.includes("田中")));
  assert.ok(kinds("ヤマダハナコさま\n1日2回").some(k => k.includes("ヤマダハナコ")));
  assert.ok(kinds("高橋 健一 様\n内服薬 1日3回").some(k => k.includes("高橋 健一")));
  assert.ok(kinds("連絡先 090-1234-5678").some(k => k === "phone=090-1234-5678"));
  assert.ok(kinds("個人番号 1234 5678 9012").some(k => k.startsWith("id=")));
  assert.ok(kinds("カルテ番号 1234567").some(k => k === "hn=1234567"));
});

test("Korean name fields and honorifics are removed", () => {
  assert.ok(kinds("김민수님 약 챙겨 드세요").some(k => k.includes("김민수")));
  assert.ok(kinds("이 서연 님\n1일 3회").some(k => k.includes("이 서연")));
  assert.ok(kinds("환자: 박지훈\n환자번호 1234567").some(k => k === "name=박지훈"));
  assert.ok(kinds("보호자: 최영희").some(k => k === "name=최영희"));
  assert.ok(kinds("성함: 정철수").some(k => k === "name=정철수"));
  assert.ok(kinds("받는분 강하은\n010-1234-5678").some(k => k === "phone=010-1234-5678"));
});

test("label wording is not a name (no false redaction on Japanese / Korean packs)", () => {
  for (const t of ["お客様相談室 0120-123-456\n製造販売元 エルキュー製薬株式会社", "患者様へ: 眠気があらわれることがあります", "医師の治療を受けている人",
    "皆様の健康のために", "고객님께 감사드립니다\n고객센터 1588-1234\n제조원 (주)엘큐", "어린이는 보호자의 지도 감독하에 복용", "환자는 의사와 상의할 것",
    "선생님과 상담하세요", "제품명 엘큐 유산균\n품목명 프로바이오틱스", "販売名 LQ鼻炎カプセル\n名称 キャンディ", "여러분의 건강"]) {
    assert.equal(G.redact(t).count, 0, "kept: " + t + " -> " + JSON.stringify(kinds(t)));
  }
});

test("the earlier rules still apply", () => {
  assert.deepEqual(kinds("ชื่อผู้ป่วย สมชาย ใจทดลอง\nHN 6512345"), ["name=สมชาย ใจทดลอง", "hn=6512345"]);
  assert.ok(G.redact("患者姓名：王小明").count === 1);
  assert.deepEqual(kinds("성명: 김테스트  등록번 호: 12345678"), ["name=김테스트", "hn=12345678"]);
  assert.equal(G.redact("ส่วนประกอบ: พาราเซตามอล 500 มก.\nเลขสารบบอาหาร 10-1-12345-1-0001").count, 0);
});
