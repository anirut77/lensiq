"use strict";
// tests/unit/look-lint-families.test.js — coordinator review of beauty-look @34b6f0a (2026-11-13): the look lint missed 23/138
// adversarial phrases (generated) and 16/85 (salon). FIXED TEST SET: written and hash-locked before the lint was broadened.
// These are the DEV cases (the reviewer's misses); the reviewer re-checks with NEW held-out phrases, so the fix must cover
// FAMILIES (word stems, spacing, typos, combining-mark noise), not these strings only.
//   F1 generated text: every dev phrase is caught with its family's code
//   F2 salon text: the procedure family is allowed (salon method names); every other family is still caught
//   F3 normaliser: stray Thai combining marks and nikhahit typed before a tone mark do not hide a banned word
//   F4 clean styling sentences still pass (no new false positives on the kind of wording the rules use)
//   F5 salon names: on an EN / ZH page a salon entry with a Thai name only is shown with a neutral "(the salon's own name, in
//      Thai)" note, never silently as if it were the page language
const test = require("node:test");
const assert = require("node:assert/strict");
const lint = () => require("../../lensiq-look-lint.js");
const look = () => require("../../lensiq-look.js");

const DEV = {
  procedure: ["微针", "微针美容", "飘眉", "绣眉毛", "雾眉", "สักอายไลเนอร์", "สักอายไลน์เนอร์", "ombre brows", "powder brows", "nano brows", "lip blushing", "brow embroidery"],
  whitening: ["W h i t e n i n g", "คล้ำ", "ดูคล้ำ", "ผิวดูคล้ำ", "ไม่ให้ดูคล้ำ", "a brighter complexion", "tone-up cream", "ผิวขำว"],
  negative: ["หน้าผากกว้างเกิน", "คิ้วสั้นไป", "คางเป็นจุดอ่อน", "จมูกแบบนี้ไม่เป็นมงคล", "ปากเป็นปัญหา", "your jaw is a problem", "ไม่ค่อยสวย", "ug ly", "this brow shape breaks the luck"],
  score: ["หน้าคุณได้ 8 เต็ม 10", "ใบหน้าอันดับ 3", "美丽指数 85", "颜值指数92"],
  purchase: ["add to cart"],
  normaliser: ["สัก์คิ้ว", "ผิวคลํ้า"]
};
const CODE = { procedure: "procedure", whitening: "whitening", negative: "negative", score: "score", purchase: "purchase", normaliser: null };

test("F1 generated text: every dev phrase is caught with its family's code", () => {
  const { lintLook } = lint();
  const miss = [];
  for (const [fam, list] of Object.entries(DEV)) for (const t of list) {
    const hits = lintLook(t);
    const ok = CODE[fam] ? hits.some(h => h.code === CODE[fam]) : hits.length > 0;
    if (!ok) miss.push(`${fam}: ${t} -> ${JSON.stringify(hits)}`);
  }
  assert.deepEqual(miss, [], "missed:\n" + miss.join("\n"));
});

test("F2 salon text: procedure names allowed, every other family still caught", () => {
  const { lintLook } = lint();
  for (const t of DEV.procedure) assert.deepEqual(lintLook(t, { source: "salon" }).filter(h => h.code === "procedure"), [], "salon method name: " + t);
  const miss = [];
  for (const fam of ["whitening", "negative", "score", "purchase"]) for (const t of DEV[fam]) {
    if (!lintLook("ทรงโค้ง " + t, { source: "salon" }).length) miss.push(fam + ": " + t);
  }
  assert.deepEqual(miss, [], "salon missed:\n" + miss.join("\n"));
});

test("F3 normaliser: combining-mark noise and nikhahit order do not hide a banned word", () => {
  const { lintLook } = lint();
  assert.ok(lintLook("สัก์คิ้ว").some(h => h.code === "procedure"), "สัก์คิ้ว");
  assert.ok(lintLook("ผิวคลํ้า").some(h => h.code === "whitening"), "ผิวคลํ้า");
  assert.ok(lintLook("ผิวขฺาว").some(h => h.code === "whitening"), "stray phinthu");
});

test("F4 clean styling sentences still pass", () => {
  const { lintLook } = lint();
  const CLEAN = ["ลองเติมกลางคิ้วให้โค้งขึ้นเล็กน้อยด้วยดินสอเขียนคิ้วสีใกล้สีผม", "ลองอายไลเนอร์เส้นบางตามแนวขนตาบน", "ลิปสีโทนอุ่น เช่น คอรัล อิฐ หรือพีช",
    "ทรงผมเปิดหน้าผาก", "ต่างหูทรงหยดน้ำยาวระดับคาง", "Try a thin eyeliner along the upper lash line", "A warm-toned lip colour such as coral or peach",
    "Drop earrings that end around the jaw line", "沿上睫毛根画一条细眼线", "暖色调口红", "露出额头的发型", "可以戴长度到下颌的水滴形耳环",
    "ถ้าอยากเพิ่มความนุ่มนวลในการพูดคุยตามตำรา", "สำหรับผู้ที่ไว้หนวดเครา ลองเคราบาง ๆ"];
  const bad = CLEAN.map(t => [t, lintLook(t)]).filter(([, h]) => h.length);
  assert.deepEqual(bad, [], "false positives: " + JSON.stringify(bad));
  // every rule text and reading still passes
  for (const r of look().RULES) for (const l of ["th", "en", "zh"]) for (const f of ["reading", "text"]) assert.deepEqual(lintLook(r[f][l]), [], `${r.id}.${f}.${l}`);
});

test("F5 salon names: Thai-only name on an EN / ZH page carries a neutral note", () => {
  const L = look();
  const entry = { id: "s1", kind: "brow", shape: "brow-arch", name: { th: "ทรงโค้งนุ่ม" } };
  const th = L.salonItem(entry, "th");
  assert.equal(th.ok, true); assert.equal(th.item.nameLang, "th"); assert.ok(!th.item.note, "no note in Thai");
  for (const [l, re] of [["en", /salon's own name, in Thai/i], ["zh", /店家.*泰文/]]) {
    const r = L.salonItem(entry, l);
    assert.equal(r.ok, true, l);
    assert.equal(r.item.text, "ทรงโค้งนุ่ม");
    assert.equal(r.item.nameLang, "th");
    assert.match(r.item.note, re, l + " note");
    const h = L.salonHTML([r.item], l);
    assert.ok(re.test(h), l + " note shown");
    assert.ok(/lang="th"/.test(h), l + " Thai name marked lang=th");
  }
  const both = L.salonItem({ id: "s2", kind: "lip", shape: "lip-warm", name: { th: "ส้มอิฐ", en: "Brick orange" } }, "en");
  assert.equal(both.item.text, "Brick orange"); assert.equal(both.item.nameLang, "en"); assert.ok(!both.item.note);
});
