"use strict";
// tests/unit/look-lint-variants.test.js — procedure-word variants missed by the independent review of salon-approval a0bb5cc1
// (2026-11-18: 54/58 hit; misses "เลเซอ", "lazer", "tatt00", "m1croblading"). Coordinator order: add the misses, simple
// digit-for-letter folding (0 -> o, 1 -> i / l, 3 -> e) and common misspellings in TH / EN / ZH, and keep the reviewer's attack
// list as a locked fixture. FIXED TEST SET: written and hash-locked (evals-locks/salon-approval.sha256, copies in
// ~/LENSIQ-field/evals/salon-approval/variants-1/) BEFORE lensiq-look-lint.js was changed. These are our own dev phrases; the
// lint is still not a complete filter, a person approves every salon entry.
//   V1 every phrase of the reviewer's attack list (tests/unit/fixtures/salon-review-attacks.json) gets a hit, strict lint
//   V2 the 4 reviewer misses + digit-folded + misspelled procedure words (TH / EN / ZH) get the "procedure" code (strict lint)
//   V3 the salon approval path refuses them too (look-salon.js lintEntry: create 422, approval 422) and the page drops them
//   V4 no new false positives: ordinary styling text with digits, codes and look-alike words still passes (strict lint)
const test = require("node:test");
const assert = require("node:assert/strict");
const ATTACKS = require("./fixtures/salon-review-attacks.json");
const lint = () => require("../../lensiq-look-lint.js");

const VARIANTS = {
  th: ["เลเซอ", "เลเซอ ลบคิ้ว", "เลสเซอร์", "เลเซร์", "ไมโคเบลด", "ไมโครเบรด", "ไมโครเบลท", "ฟิลเล่อร์", "ฟีลเลอร์", "ศัลกรรม", "สัลยกรรม", "ศัลยกรม",
    "โบท๊อก", "ฉีดฟิลเลอ"],
  en: ["lazer", "Lazer brow removal", "tatt00", "tatt0o", "TATT00ED BROWS", "m1croblading", "micr0blading", "mircoblading", "microbalding", "microbladding",
    "tatoo", "tatto brows", "b0tox", "f1ller lips", "fi11er", "surg3ry", "sergery", "surgary", "inj3ction", "semi permenant brows", "permenant eyeliner",
    "s3mi-permanent brows", "th1ead lift", "thr3ad lift", "1aser"],
  zh: ["雷射", "雷射除眉", "纹秀", "漂眉", "超声刀", "打肉毒", "肉毒素", "半永久化妆"]
};
const BENIGN = [
  "BR-07", "Shade 01", "Brick orange 03", "Soft arch 1", "Size 10 brush", "Glazed lip finish", "Hazel brown brows", "A 3-step soft arch",
  "Tint 13, satin", "Lip colour L1", "Liner style 2", "Layers, shoulder length", "Lazy waves", "Tattersall-check scarf", "Matte 0.3 gloss",
  "ทรงโค้ง 3 ระดับ", "สีส้มอิฐ เบอร์ 07", "อายไลเนอร์หางสั้น 1 มม.", "ลิปเนื้อซาติน 01", "เลเยอร์ประบ่า", "เซอร์ไพรส์ลุคใหม่",
  "柔和弯眉 01", "砖橙色 03 号", "短眼线 1 毫米", "雷鸣般的掌声", "射手座的幸运色"
];

test("V1 every phrase of the reviewer's attack list gets a hit (strict lint)", () => {
  const L = lint(), miss = [];
  for (const l of ["th", "en", "zh"]) for (const t of ATTACKS[l]) if (!L.lintLook(t).length) miss.push(l + ": " + t);
  assert.equal(ATTACKS.th.length + ATTACKS.en.length + ATTACKS.zh.length, 58, "the reviewer's 58 phrases");
  assert.deepEqual(miss, []);
});

test("V2 the 4 misses, digit-folded and misspelled procedure words get the procedure code (TH / EN / ZH)", () => {
  const L = lint(), miss = [];
  for (const l of ["th", "en", "zh"]) for (const t of VARIANTS[l]) if (!L.lintLook(t).some(h => h.code === "procedure")) miss.push(l + ": " + t);
  assert.deepEqual(miss, []);
});

test("V3 the salon approval path refuses them (lintEntry) and the page drops them (salonApproved)", async () => {
  const S = await import("../../backend/src/look-salon.js");
  const look = require("../../lensiq-look.js");
  for (const t of ["เลเซอ", "lazer", "tatt00", "m1croblading", "雷射", "mircoblading"]) {
    const l = S.lintEntry({ name_th: "ทรงโค้ง", name_en: t });
    assert.ok(l.some(x => x.field === "name_en" && x.codes.includes("procedure")), t);
    const e = { id: "a1b2c3d4e5f6", kind: "brow", status: "approved", name: { th: "ทรงโค้ง", en: t, zh: "弯眉" }, desc: {}, shape: { card: "brow-arch" } };
    assert.deepEqual(look.salonApproved([e], "en"), [], "page drops " + t);
  }
});

test("V4 no new false positives: ordinary styling text with digits, codes and look-alike words", () => {
  const L = lint(), fp = [];
  for (const t of BENIGN) { const h = L.lintLook(t); if (h.length) fp.push(t + " -> " + JSON.stringify(h)); }
  assert.deepEqual(fp, []);
});
