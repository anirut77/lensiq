"use strict";
// tests/unit/look-lint-benign.test.js — coordinator held-out measure of 9b2d28b (2026-11-14): 7 new false positives + 4 older
// ones, and misses by family (verdict on a feature, comparison to others, loss of money / luck stated plainly, procedure names
// outside the stem lists, spaced Latin). FIXED TEST SET, written and hash-locked BEFORE the lint was changed.
//   B1 MUST PASS: the reviewer's benign sentences + our own >= 40 ordinary styling sentences (TH / EN / ZH) give no hit at all,
//      as generated text and as salon text
//   B2 MUST BLOCK (our own dev phrases for the missed families; the reviewer re-measures on a fresh held-out set)
const test = require("node:test");
const assert = require("node:assert/strict");
const lint = () => require("../../lensiq-look-lint.js");

const REVIEWER_BENIGN = [
  "ต่อหางคิ้วยาวไปจนถึงแนวหางตา", "คิ้วยาวไปจรดหางตา", "ถ้าไม่ทาลิปเต็มปาก ลองแตะกลางปากแทน", "หากไม่ทาบลัชออน ลองลิปทินต์แทน",
  "ไม่ทาลิปเต็มปากแล้วก็ดูเป็นธรรมชาติ", "Wear small hoops to work too on Mondays", "可以戴一副太阳镜", "可以试试太极风格的发簪",
  "戴一枚小巧的耳针", "用提亮笔点在眉骨上", "ทาลิปบางไปก่อนแล้วค่อยเติม", "ผมหน้าม้าปิดหน้าผากบางส่วน", "เสื้อสีขาวใส่คู่กับต่างหูมุก",
  "A little concealer under the brow tail"
];
const OWN_BENIGN = [
  // Thai
  "ลองเติมหางคิ้วให้ยาวไปทางหางตาเล็กน้อย", "ใช้ดินสอเขียนคิ้วสีน้ำตาลเข้มเติมช่องว่าง", "ปัดมาสคาร่าคิ้วให้ขนเรียงตัว", "ลองอายแชโดว์โทนน้ำตาลที่เปลือกตา",
  "ทาลิปทินต์บาง ๆ แล้วเม้มปาก", "ทาบลัชออนสีพีชที่แก้มเบา ๆ", "ลองไฮไลต์เบา ๆ ที่สันจมูก", "ถ้าไม่ชอบสีสด ลองโทนนู้ด", "หากไม่ใส่แว่น ลองต่างหูห่วงเล็ก",
  "รวบผมครึ่งหัวแล้วปล่อยปลายผม", "ตัดหน้าม้าซีทรู", "ลองทำสีผมน้ำตาลช็อกโกแลต", "ใส่ต่างหูมุกเม็ดเล็ก", "แว่นกรอบมนสีกระ", "สร้อยเส้นเล็กยาวระดับอก",
  "เล็มหนวดให้สั้นเสมอแนวปาก", "ไว้เคราบาง ๆ ตามแนวกราม", "เสื้อคอวีสีครีมใส่สบาย", "ลองโทนสีเขียวมะกอกกับผ้าพันคอ", "ทาลิปให้เต็มริมฝีปากด้วยแปรง",
  "ลองอายไลเนอร์สีน้ำตาลแทนสีดำ", "ผมยาวไปถึงกลางหลังก็มัดเปียได้", "ต่างหูยาวไปจนถึงระดับคาง",
  // English
  "Try a soft brown pencil to fill the brow tail", "Brush the brows upward with a clear gel", "A thin liner along the lash line",
  "Dab a little colour in the centre of the lips", "A peach blush on the apples of the cheeks", "Try a half-up hairstyle for the weekend",
  "Small pearl studs go with almost anything", "Round tortoiseshell frames", "A long chain necklace with a small pendant", "Keep a short beard neatly trimmed",
  "Use a highlighter on the brow bone", "Wear the scarf loosely too", "If you skip liner, a little mascara is enough", "Try a tinted lip balm on busy days",
  // Chinese
  "用浅棕色眉笔补画眉尾", "用透明眉胶把眉毛梳顺", "沿睫毛根画一条细眼线", "在唇中央点一点口红再晕开", "用蜜桃色腮红轻扫苹果肌", "试试半扎发",
  "戴一对珍珠耳钉", "玳瑁色圆框眼镜", "戴一条长项链配小吊坠", "把短胡须修整齐", "用高光笔点在鼻梁上", "可以戴太阳镜出门", "用浅色眼影晕染眼窝"
];

const MUST_BLOCK = {
  negative: ["คางของคุณเป็นจุดด้อย", "หน้าผากแบบนี้ถือว่าไม่ดีตามตำรา", "จมูกคุณดูไม่ค่อยดี", "Your nose shape is a weak point", "Your chin is not ideal",
    "Your forehead looks unlucky", "你的鼻子是缺点", "下巴有问题", "额头不理想"],
  score: ["สวยกว่าคนอื่น", "ดูดีกว่าเพื่อน", "ดูอ่อนกว่าอายุจริง", "You will look better than others", "look prettier than your friends", "turns heads",
    "比别人更好看", "看起来比同龄人年轻", "回头率高"],
  threat: ["คิ้วแบบนี้ทำให้เสียเงิน", "ทรงนี้ทรัพย์รั่ว", "เงินจะรั่วไหล", "This brow shape makes you lose money", "your money will leak away", "luck drains away",
    "这种眉形会漏财", "财运下降", "守不住财"],
  procedure: ["ยิงเลเซอร์หน้า", "ฉีดเมโสหน้าใส", "ทำทรีตเมนต์หน้า", "m i c r o b l a d i n g", "f i l l e r", "l a s e r", "thermage", "ultherapy",
    "hyaluronic injections", "mesotherapy", "做个热玛吉", "打玻尿酸", "去做皮秒"],
  whitening: ["w h i t e r skin", "b l e a c h", "หน้าขาวอมชมพู", "ผิวกระจ่างใสขึ้น", "皮肤变白", "美 白 精华"],
  purchase: ["pre-order today", "book now", "จองคิวได้เลย", "加购"]
};

test("B1 must pass: benign styling sentences give no hit (generated and salon)", () => {
  const { lintLook } = lint();
  const all = REVIEWER_BENIGN.concat(OWN_BENIGN);
  assert.ok(OWN_BENIGN.length >= 40, "at least 40 own sentences");
  const bad = [];
  for (const t of all) {
    const g = lintLook(t), s = lintLook(t, { source: "salon" });
    if (g.length || s.length) bad.push(`${t} -> ${JSON.stringify(g.concat(s))}`);
  }
  assert.deepEqual(bad, [], "false positives:\n" + bad.join("\n"));
});

test("B2 must block: verdicts, comparisons, money / luck loss, procedures, spaced Latin, orders", () => {
  const { lintLook } = lint();
  const miss = [];
  for (const [fam, list] of Object.entries(MUST_BLOCK)) for (const t of list) if (!lintLook(t).length) miss.push(fam + ": " + t);
  assert.deepEqual(miss, [], "missed:\n" + miss.join("\n"));
  // salon: procedure names still allowed, the rest still blocked
  for (const t of MUST_BLOCK.procedure) assert.deepEqual(lintLook(t, { source: "salon" }).filter(h => h.code === "procedure"), [], "salon " + t);
  for (const fam of ["negative", "score", "threat", "whitening", "purchase"]) for (const t of MUST_BLOCK[fam]) assert.ok(lintLook(t, { source: "salon" }).length, "salon " + t);
});
