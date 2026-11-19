"use strict";
// tests/unit/pc-preview-redact.test.js — owner decision 127 (2026-11-19): the AUTOMATIC removal in the Product Check preview
// (LQPCGuard.previewRedact). On by default, on the device: only product-label text goes to the AI when the user presses
// "Send this text" without touching anything. Measured on the locked set ~/LENSIQ-field/evals/pc-pii (tools/pc-pii-score.mjs,
// docs/product-check/PC-PII-RESULTS.md); these are fixed examples written for the unit suite (synthetic, invented values).
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../lensiq-pc-guard.js");

const gone = (text, value) => {
  const r = G.previewRedact(text);
  return !r.text.replace(/\s+/g, "").includes(value.replace(/\s+/g, ""));
};

const CASES = [
  // [language, label text, personal values that must not stay in the payload]
  ["th", "ยาแก้ไอ ตราใบไม้\nส่วนประกอบ กลีเซอรีน\nรับประทานครั้งละ 1 ช้อน วันละ 3 ครั้ง (ยายบุญเรือน)\n" +
    "สมชาย ใจงาม\nเลขที่บัญชี 123-4-56789-0 ธนาคารตัวอย่าง\n8851234567898",
    ["บุญเรือน", "สมชาย ใจงาม", "123-4-56789-0"]],
  ["en", "Vitamin C 500 mg Tablets\nIngredients: ascorbic acid\nTake 1 tablet daily\nLiam - 2 tablets after breakfast\nfor Misaki\n" +
    "IBAN GB29 NWBK 6016 1331 9268 19\nemma.stone88@example.com\n0012345678905",
    ["Liam", "Misaki", "GB29 NWBK 6016 1331 9268 19", "emma.stone88@example.com"]],
  ["zh", "维生素C片 保健食品\n配料：维生素C、淀粉\n每日1次 每次1片（淑芬）\n爸爸的药 别给孩子吃 —小雯\n身份证 110105198503152234\n6901234567892",
    ["淑芬", "小雯", "110105198503152234"]],
  ["ja", "第2類医薬品 かぜ薬\n成分 アセトアミノフェン 300mg\nお母さん用 けいこ 朝1錠 夜1錠\n朝 1錠 → 父 / 夜 1錠 → 和夫\n山下 さくら\nTEL ０８０－９９９９－１２３４\n普通 7654321 みらい銀行\n4901234567894",
    ["けいこ", "和夫", "山下 さくら", "０８０－９９９９－１２３４", "7654321"]],
  ["ko", "종합비타민 건강기능식품\n원재료명 비타민C\n할머니 순자 하루 4번\n아침 1정 (어머니), 저녁 2정 (경수)\n민서\n카카오뱅크 3333-04-1234567 정다은\n주민 850315-2234567\n8801234567893",
    ["순자", "경수", "민서", "3333-04-1234567", "정다은", "850315-2234567"]]
];

test("the default payload holds none of the personal values (5 languages)", () => {
  for (const [lang, text, values] of CASES) for (const v of values) assert.ok(gone(text, v), `${lang}: "${v}" stayed in ${JSON.stringify(G.previewRedact(text).text)}`);
});

test("product-label text stays: ingredients, dose, registration number, barcode, customer-service line", () => {
  const text = "ยาแก้ไอ ตราใบไม้\nส่วนประกอบ กลีเซอรีน\nรับประทานครั้งละ 1 ช้อน วันละ 3 ครั้ง\nเลขทะเบียนยา 1A 123/45\nผลิตโดย บริษัท ตัวอย่างฟาร์มา จำกัด\n8851234567898";
  assert.equal(G.previewRedact(text).text, text);
  const ja = "第2類医薬品 かぜ薬\n成分 アセトアミノフェン 300mg\n用法・用量 1回2錠 1日3回 食後\n製造販売元 田村製薬株式会社\nお客様相談室 0120-45-8812\n4901234567894";
  assert.equal(G.previewRedact(ja).text, ja);
});

test("every removal is listed; the guard's own finds are never restorable, the new ones are", () => {
  const text = "Vitamin C 500 mg Tablets\nIngredients: ascorbic acid\nPatient: John Smith\nfor Misaki\n0012345678905";
  const r = G.previewRedact(text);
  assert.ok(r.items.length >= 2);
  for (const it of r.items) assert.equal(r.source.slice(it.start, it.end), it.text);
  const line = r.items.find(x => x.text === "for Misaki");
  assert.ok(line && line.restorable, JSON.stringify(r.items));
  const back = G.previewRedact(text, { restore: [line.id] });
  assert.ok(back.text.includes("for Misaki"));
  assert.ok(back.items.find(x => x.id === line.id).restored);
  assert.equal(back.count, r.count - 1);
  // a name found by the field cue: restore is refused
  const fixed = G.previewRedact("ส่วนประกอบ พาราเซตามอล 500 มก.\nวิธีใช้ รับประทานครั้งละ 1 เม็ด\nชื่อผู้ป่วย นายสมชาย ใจดี\nโทร 081-234-5678\n8851234567898");
  const nm = fixed.items.filter(x => !x.restorable);
  assert.ok(nm.length >= 1);
  const tried = G.previewRedact(fixed.source, { restore: nm.map(x => x.id) });
  assert.equal(tried.text, fixed.text);
  assert.equal(G.scan(fixed.text).length, 0, "the default payload passes the Worker's own check");
});

test("empty and odd input", () => {
  assert.equal(G.previewRedact("").text, "");
  assert.equal(G.previewRedact(null).count, 0);
  assert.equal(G.previewRedact("\n\n").text, "\n\n");
});

test("previewRedact stays linear on adversarial text (8x text, at most 24x time)", () => {
  const rep = (u, n) => u.repeat(Math.ceil(n / u.length)).slice(0, n);
  const shapes = [n => rep("010-1234-5678 ", n), n => rep("(ゆうた) → 和夫 - ", n), n => rep("할머니 순자 하루 4번\n", n), n => rep("1234567 ", n), n => rep("for Ab ", n), n => " ".repeat(n)];
  const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
  const best = s => { let m = Infinity; for (let i = 0; i < 5; i++) { const t = cpu(); G.previewRedact(s); m = Math.min(m, cpu() - t); } return Math.max(m, 0.5); };
  for (const f of shapes) {
    const small = best(f(1000)), big = best(f(8000));
    assert.ok(big / small <= 24, `${f.toString()}: ${small.toFixed(1)} ms -> ${big.toFixed(1)} ms`);
  }
});

test("ownership and addressee markers on a sticker or a handwritten warning (review round 1, item 9; written without the reviewer's set)", () => {
  const cases = [
    ["Vitamin C 500 mg Tablets\nIngredients: ascorbic acid\nProperty of Jane Roe – do not use!\n0012345678905", ["Jane Roe"]],
    ["Ibuprofen 200 mg Tablets\nPROPERTY OF Dr. Alan Smithers - DO NOT TAKE\n0012345678905", ["Alan Smithers"]],
    ["Cough Syrup 100 ml\nWarning: Tom's pills - do not share\nThis belongs to Maria Lopez\nprescribed for Kevin O'Hara\n0012345678905", ["Tom", "Maria Lopez", "Kevin O'Hara"]],
    ["ยาแก้ไอ ตราใบไม้\nส่วนประกอบ กลีเซอรีน\nยานี้เป็นของ คุณสมศรี ห้ามใช้\n8851234567898", ["สมศรี"]],
    ["かぜ薬 第2類医薬品\n成分 アセトアミノフェン 300mg\n健太の薬 さわらないで\n持ち主: 佐藤 花子\n4901234567894", ["健太", "佐藤 花子"]],
    ["감기약 1일 3회\n성분 아세트아미노펜\n주인: 김민지\n민준이 꺼! 먹지 마\n8801234567893", ["김민지", "민준"]],
    ["感冒灵颗粒 每日3次\n成分：对乙酰氨基酚\n属于：王小明\n李华的药 别动\n6901234567892", ["王小明", "李华"]]
  ];
  for (const [text, values] of cases) for (const v of values) assert.ok(gone(text, v), `"${v}" stayed in ${JSON.stringify(G.previewRedact(text).text)}`);
  // label wording with the same words is kept
  const keep = "Pain Relief Tablets 200 mg\nFor external use only. Only for adults\nThis is a medicine. Read the leaflet\nKeep out of reach of children\n0012345678905";
  assert.equal(G.previewRedact(keep).text, keep);
});
