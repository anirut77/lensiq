"use strict";
// tests/unit/merit-lint-sara-am.test.js — SAFETY: the shared Merit wording lint must match Thai patterns that contain
// SARA AM (U+0E33 "ำ"). Found by stream D1: normalise() runs NFKC, which turns U+0E33 into U+0E4D + U+0E32, so every
// pattern written with "ำ" (ถ้าไม่ทำบุญ, ลดน้ำหนัก, เลขนำโชค, จำหน่าย, จำนวนจำกัด, ชำระเงิน, คำสาป) never matched and
// fear-selling / sales wording passed unflagged. FIXED TEST SET, hash-locked BEFORE the fix
// (~/LENSIQ-field/evals/merit-lint/locked.sha256 and evals-locks/merit-lint.sha256). Synthetic phrases only; no network.
//
//   S1 each of the seven SARA-AM patterns is flagged with its code (plain, in a sentence, and typed in every spelling of ำ)
//   S2 disguises: spaces / punctuation inside, zero-width characters (also between nikhahit and sara aa), fullwidth Latin
//      mixed in, tone mark before or after the nikhahit
//   S3 ordinary Thai text with ำ stays clean (no false positives); only the exact patterns trigger
//   S4 normalise(): output never contains U+0E4D U+0E32 (with or without a tone mark between), is idempotent, keeps NFC text as is
//   S5 the Worker's own validation (cleanItem, used by admin save and import) refuses an item carrying such a phrase
//   S6 the module still flags the non-ำ patterns it flagged before (no weakening)
const test = require("node:test");
const assert = require("node:assert/strict");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const L = require(join(ROOT, "lensiq-merit-lint.js"));

const SA = "ำ";          // ำ
const NIK = "ํ", AA = "า";
const TONES = ["่", "้", "๊", "๋"];
// phrase (written with U+0E33), expected code
const CASES = [
  ["ถ้าไม่ทำบุญ", "fear"],
  ["ลดน้ำหนัก", "health"],
  ["เลขนำโชค", "lottery"],
  ["จำหน่าย", "purchase"],
  ["จำนวนจำกัด", "urgency"],
  ["ชำระเงิน", "purchase"],
  ["คำสาป", "fear"]
];
const codes = (t) => L.lintMerit(t).map((h) => h.code);
/** the same text typed with nikhahit + sara aa (what NFKC produces), tone mark kept before the nikhahit */
const decomposed = (s) => s.split(SA).join(NIK + AA);
/** nikhahit typed BEFORE the tone mark (น + ํ + ้ + า), a common typing order */
const tonesAfterNik = (s) => s.replace(new RegExp("([\\u0E48-\\u0E4B])" + SA, "g"), (m, t) => NIK + t + AA).split(SA).join(NIK + AA);

test("S1: every SARA-AM pattern is flagged with its code", () => {
  for (const [p, code] of CASES) {
    assert.ok(p.includes(SA), "the fixture itself contains U+0E33: " + p);
    for (const [label, text] of [
      ["plain", p],
      ["in a sentence", "ตามความเชื่อ หลายคนไปวัด " + p + " ในวันเกิด"],
      ["decomposed", decomposed(p)],
      ["decomposed in a sentence", "ตามความเชื่อ " + decomposed(p) + " ที่วัด"],
      ["nikhahit before tone", tonesAfterNik(p)]
    ]) assert.ok(codes(text).includes(code), `${p} (${label}) -> ${code}; got ${JSON.stringify(codes(text))}`);
  }
  // the exact fear-selling and sales sentences from the finding
  assert.ok(codes("ถ้าไม่ทำบุญ จะเกิดเรื่องไม่ดี").includes("fear"));
  assert.ok(codes("เลขนำโชคประจำวัน").includes("lottery"));
  assert.ok(codes("ลดน้ำหนักได้ด้วยการไหว้").includes("health"));
  assert.ok(codes("จำหน่ายพระเครื่อง").includes("purchase"));
  assert.ok(codes("จำนวนจำกัด รีบเลย").includes("urgency"));
});

test("S2: disguises around SARA AM are caught", () => {
  for (const [p, code] of CASES) {
    const chars = [...p];
    const spaced = chars.join(" ");
    const dashed = chars.join("-");
    const dotted = chars.join(".");
    const zw = (z) => chars.join(z);
    for (const [label, text] of [
      ["spaces", spaced], ["hyphens", dashed], ["dots", dotted],
      ["ZWSP", zw("​")], ["ZWNJ", zw("‌")], ["ZWJ", zw("‍")], ["word joiner", zw("⁠")], ["soft hyphen", zw("­")], ["BOM", zw("﻿")],
      ["zero-width between nikhahit and sara aa", decomposed(p).split(NIK + AA).join(NIK + "​" + AA)],
      ["zero-width + spaces + decomposed", decomposed(p).split("").join("​ ")],
      ["fullwidth Latin mixed in", "ｂｕｙ ＮＯＷ " + p + " ｗｗｗ"],
      ["trailing punctuation", p + "!!!"],
      ["leading emoji-free noise", "***" + p + "***"]
    ]) assert.ok(codes(text).includes(code), `${p} (${label}) -> ${code}; got ${JSON.stringify(codes(text))}`);
  }
  // a tone mark in any position next to the decomposed vowel
  for (const t of TONES) {
    const w = "ล" + "ด" + "น" + t + NIK + AA + "หนัก";
    const w2 = "ล" + "ด" + "น" + NIK + t + AA + "หนัก";
    assert.ok(codes(w).includes("health"), "tone " + t.charCodeAt(0).toString(16) + " before nikhahit");
    assert.ok(codes(w2).includes("health"), "tone " + t.charCodeAt(0).toString(16) + " after nikhahit");
  }
});

test("S3: ordinary Thai text with SARA AM stays clean", () => {
  const CLEAN = [
    "น้ำสะอาดและดอกไม้สดสำหรับถวาย",
    "คำแนะนำสำหรับผู้เริ่มต้น แต่งกายสุภาพ",
    "ทำด้วยใจสงบและตั้งใจ",
    "ความเชื่อนี้ทำสืบต่อกันมานาน",
    "จำนวนหนึ่งของผู้คนไปไหว้พระที่วัด",
    "ไหว้พระด้วยความเคารพ ทำบุญตามกำลังและศรัทธา",
    "ชำระล้างใจให้สงบ",
    "ผู้คนมักนำดอกไม้ไปถวาย",
    "น้ำหนักเบา ถือสะดวก",
    "คำอธิษฐานสั้น ๆ ตามที่ใจต้องการ",
    "จำได้ว่าเคยไปวัดนี้ตอนเด็ก"
  ];
  for (const t of CLEAN) {
    assert.deepEqual(codes(t), [], t + " -> " + JSON.stringify(L.lintMerit(t)));
    assert.deepEqual(codes(decomposed(t)), [], "decomposed: " + t);
    assert.deepEqual(codes(t.split("").join(" ")), [], "spaced: " + t);
  }
  // the new matches need the whole pattern: "ถ้าไม่" alone with other verbs, "จำหน่าย"-like prefixes
  assert.deepEqual(codes("ถ้าไม่สะดวกไปวัด ก็ทำใจให้สงบที่บ้านได้"), []);
});

test("S4: normalise() joins nikhahit + sara aa back, is idempotent and leaves NFC alone", () => {
  const pairs = /ํ[่-๋]?า/;
  for (const [p] of CASES) {
    for (const v of [p, decomposed(p), tonesAfterNik(p), decomposed(p).split(NIK + AA).join(NIK + "​" + AA), p.normalize("NFKC"), p.normalize("NFKD")]) {
      const n = L.normalise(v);
      assert.ok(!pairs.test(n), "no nikhahit+sara aa left: " + JSON.stringify(v));
      assert.ok(n.includes(SA), "U+0E33 present: " + JSON.stringify(v));
      assert.equal(L.normalise(n), n, "idempotent");
    }
    assert.equal(L.normalise(p), p, "NFC text with U+0E33 is unchanged");
  }
  assert.equal(L.normalise("น" + "ํ" + "้" + AA), "น้ำ");
  assert.equal(L.normalise("น้" + NIK + AA), "น้ำ");
  // a nikhahit that is NOT followed by sara aa is kept (it is a different letter: "สํสกฤต" style)
  assert.equal(L.normalise("ส" + NIK + "สกฤต"), "ส" + NIK + "สกฤต");
  assert.equal(L.normalise(null), ""); assert.equal(L.normalise(undefined), "");
});

test("S5: the Worker validation (admin save and import) refuses an item with such a phrase", async () => {
  const { cleanItem } = await import("../../backend/src/merit.js");
  const tri = (th, en, zh) => ({ th, en, zh });
  const base = (th) => ({
    type: "place", tradition: "thai_buddhist",
    title: tri("วัดในชุมชน", "A community temple", "社区寺庙"),
    body: tri(th, "By custom, many people visit a community temple on their birthday, dress modestly and keep a calm mind.", "按照习俗，很多人会在生日时到社区寺庙参拜，穿着得体，保持平静的心。"),
    place: tri("วัดในชุมชน", "Community temple", "社区寺庙"), area: tri("กรุงเทพฯ", "Bangkok", "曼谷"), keys: ["any"], status: "draft", sort: 0
  });
  assert.doesNotThrow(() => cleanItem(base("ตามความเชื่อ หลายคนไปไหว้พระที่วัดในชุมชนในวันเกิดของตน แต่งกายสุภาพและทำด้วยใจสงบ")));
  for (const [p, code] of CASES) {
    for (const v of [p, decomposed(p)]) {
      assert.throws(() => cleanItem(base("ตามความเชื่อ หลายคนไปวัด " + v + " ในวันเกิด")), (e) => /^wording not allowed in body\.th: /.test(String(e.message)), p);
    }
    void code;
  }
});

test("S6: patterns without SARA AM still flag exactly as before (nothing weakened)", () => {
  const MUST = [
    ["การันตี", "guarantee"], ["รับประกัน", "guarantee"], ["แก้ดวง", "fix_luck"], ["ซวย", "fear"], ["รักษาโรค", "health"], ["หวย", "lottery"], ["199 บาท", "price"],
    ["สั่งซื้อ", "purchase"], ["ด่วน", "urgency"], ["www.example.com", "link"], ["<b>x</b>", "markup"], ["081-234-5678", "personal"],
    ["guaranteed results", "guarantee"], ["lucky numbers", "lottery"], ["buy now", "purchase"], ["保证", "guarantee"], ["彩票", "lottery"], ["购买", "purchase"]
  ];
  for (const [t, code] of MUST) assert.ok(codes(t).includes(code), `${t} -> ${code}`);
  assert.deepEqual(codes("A community temple where many people pray quietly on their birthday."), []);
  assert.deepEqual(codes("ตามความเชื่อ หลายคนไปไหว้พระที่วัดในชุมชนในวันเกิดของตน"), []);
});
