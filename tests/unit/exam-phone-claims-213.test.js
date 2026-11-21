"use strict";
// tests/unit/exam-phone-claims-213.test.js — owner item 213 (2026-11-21 09:10): "Exam page and sales documents state the
// measured figures in three languages: near the camera 90.8%, on the desk 29.6%, with the note that it is a public
// still-image set. Say plainly that a phone lying on the desk is usually missed."
// Locked BEFORE the wording change (evals-locks/exam-phone-claims-213.sha256).
// Source of every number: the A2 locked set, docs/exam/EXAMLAB-PHONE-SET.md "Result" (public dataset, Open Images V7
// stills; close-up band 129 / 142 = 90.8 %, phoneLong < 0.4 = 24 / 81 = 29.6 %, false flags 0 / 135). No other phone
// figure may appear (no invented number). Book detection stays "not measured" (A2 measured phones only).
//   P1 the invigilator claim line exam.l.cl3 (TH markup, EN, ZH): both figures with their counts and n, the false-flag
//      count, the source label "public dataset" + Open Images V7 + still photos, the plain desk sentence, book not
//      measured; the old "not measured / not tested on exam-room images" phone wording is gone; no other percentage
//   P2 the invigilator signal lines (exam.l.mB1, exam.l.s4) qualify the phone signal (near the camera) and carry the
//      desk sentence in TH / EN / ZH
//   P3 the candidate notices (exam.l.n1 on exam.html, exam.lab.n1 on exam-lab.html) qualify the phone signal (near the
//      camera) and still carry no rate (the existing candidate-page rule)
//   P4 sales and readiness documents: the figures with their source, the desk sentence, no "not measured" phone claim
//   P5 the claims register row E3 carries the figures, their n and the label public, with the A2 evidence file
//   P6 the evidence file still holds the locked result
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const squash = s => String(s).replace(/\s+/g, " ").trim();
const THAI = /[฀-๿]/;
const RATE = /\d\s*[%％]|15 \/ 52|n = 52/;

function dictOf(file) {
  const w = {}; w.window = w;
  vm.runInNewContext(read(file), w);
  return Object.assign({}, ...w.LQI18N_Q.map(q => q.en || q.zh || {}));
}
const EN = () => dictOf("i18n/en-exam.js"), ZH = () => dictOf("i18n/zh-exam.js");
function th(file, key) {
  const m = read(file).match(new RegExp(`data-i18n="${key.replace(/\./g, "\\.")}"[^>]*>([^<]*)<`));
  assert.ok(m, `${file}: ${key}`);
  return squash(m[1]);
}
const DESK = { th: "โทรศัพท์ที่วางอยู่บนโต๊ะมักตรวจไม่พบ", en: "a phone lying on the desk is usually missed", zh: "放在桌上的手机通常检测不到" };
const NEAR = { th: "ใกล้กล้อง", en: "near the camera", zh: "靠近摄像头" };
const SRC = { th: "ชุดข้อมูลสาธารณะ", en: "public dataset", zh: "公开数据集" };
const STILL = { th: "ภาพนิ่ง", en: "still photos", zh: "静态照片" };
const NOTM = { th: "ยังไม่ได้วัด", en: "not measured", zh: "尚未测量" };
const BOOK = { th: "หนังสือในภาพ: ยังไม่ได้วัด", en: "book in view: not measured", zh: "画面中的书：尚未测量" };
const has = (t, s, lang) => (lang === "en" ? t.toLowerCase().includes(s.toLowerCase()) : t.includes(s));

test("P1 exam.l.cl3: both measured figures, counts, n, false flags, source, desk sentence; book still not measured", () => {
  const txt = { th: th("exam.html", "exam.l.cl3"), en: EN()["exam.l.cl3"], zh: ZH()["exam.l.cl3"] };
  for (const lang of ["th", "en", "zh"]) {
    const t = squash(txt[lang] || "");
    assert.ok(t, lang + ": text");
    if (lang !== "th") assert.doesNotMatch(t, THAI, lang + ": no Thai");
    for (const f of ["90.8%", "129 / 142", "n = 142", "29.6%", "24 / 81", "n = 81", "0 / 135", "n = 135", "Open Images V7"]) {
      assert.ok(t.includes(f), `${lang}: "${f}" in exam.l.cl3: ${t}`);
    }
    for (const [name, w] of [["near", NEAR], ["source", SRC], ["still", STILL], ["desk", DESK], ["book", BOOK]]) {
      assert.ok(has(t, w[lang], lang), `${lang}: ${name} "${w[lang]}" in exam.l.cl3: ${t}`);
    }
    // the near-camera figure comes before the desk figure, the desk sentence is in the same line
    assert.ok(t.indexOf("90.8%") < t.indexOf("29.6%"), lang + ": near first");
    // no other percentage than the two measured ones (no invented number)
    const pcts = (t.match(/\d+(?:\.\d+)?\s*[%％]/g) || []).map(s => s.replace(/\s/g, "")).sort();
    assert.deepEqual(pcts, ["29.6%", "90.8%"], lang + ": only the two measured figures");
    // "not measured" stays only for the book
    const notm = t.split(NOTM[lang]).length - 1;
    assert.equal(notm, 1, lang + ": 'not measured' once (the book): " + t);
  }
  assert.doesNotMatch(txt.th, /ยังไม่ได้ทดสอบกับภาพห้องสอบ/);
  assert.doesNotMatch(txt.en, /has not been tested on exam-room images/);
  assert.doesNotMatch(txt.zh, /尚未在考场图像上测试/);
});

test("P2 invigilator signal lines qualify the phone signal and say the desk phone is usually missed", () => {
  const en = EN(), zh = ZH();
  for (const key of ["exam.l.mB1", "exam.l.s4"]) {
    const txt = { th: th("exam.html", key), en: en[key], zh: zh[key] };
    for (const lang of ["th", "en", "zh"]) {
      const t = squash(txt[lang] || "");
      assert.ok(has(t, NEAR[lang], lang), `${lang} ${key}: near the camera: ${t}`);
      assert.ok(has(t, DESK[lang], lang), `${lang} ${key}: desk sentence: ${t}`);
      if (lang !== "th") assert.doesNotMatch(t, THAI, `${lang} ${key}: no Thai`);
    }
  }
  // mB1 keeps the other signals it lists
  assert.match(th("exam.html", "exam.l.mB1"), /ไม่เห็นใบหน้า หลายใบหน้าหรือมีคนอื่นในภาพ หันศีรษะนาน/);
  assert.match(en["exam.l.mB1"], /face not visible, several faces or another person in view, head turned away for long/);
  assert.match(zh["exam.l.mB1"], /看不到脸、多张脸或画面中有其他人、长时间转头/);
  assert.match(th("exam.html", "exam.l.s4r"), /≥ 0\.6 ใน 3 จาก 5/, "the threshold row is unchanged");
});

test("P3 candidate notices: the phone signal is qualified (near the camera) and carries no rate", () => {
  const en = EN(), zh = ZH();
  for (const [file, key] of [["exam.html", "exam.l.n1"], ["exam-lab.html", "exam.lab.n1"]]) {
    const txt = { th: th(file, key), en: en[key], zh: zh[key] };
    for (const lang of ["th", "en", "zh"]) {
      const t = squash(txt[lang] || "");
      assert.ok(has(t, NEAR[lang], lang), `${lang} ${key}: near the camera: ${t}`);
      assert.doesNotMatch(t, RATE, `${lang} ${key}: no rate on a candidate notice`);
      if (lang !== "th") assert.doesNotMatch(t, THAI, `${lang} ${key}: no Thai`);
    }
  }
  assert.match(th("exam-lab.html", "exam.lab.n1"), /สิ่งที่สังเกต: ไม่เห็นใบหน้า หลายใบหน้าหรือมีคนอื่นในภาพ/);
  assert.match(en["exam.lab.n1"], /several faces or another person in view/);
  assert.match(zh["exam.lab.n1"], /多张脸或画面中有其他人/);
});

const DOCS = ["docs/ONE-PAGER-EXAM.md", "docs/sales/DECK-EXAM.md", "docs/LAUNCH-READINESS.md", "docs/sales/DEMO-SCRIPT-EXAM.md"];
test("P4 sales and readiness documents: figures with source and the desk sentence; no 'not measured' phone claim", () => {
  const F = [/90\.8\s?%/, /129 \/ 142/, /29\.6\s?%/, /24 \/ 81/];
  for (const f of DOCS) {
    const md = squash(read(f));
    for (const re of F) assert.match(md, re, `${f}: ${re}`);
    assert.match(md, /Open Images V7/, f + ": data set named");
    assert.ok(/public dataset/i.test(md) || md.includes("ชุดข้อมูลสาธารณะ"), f + ": source label");
    assert.ok(md.toLowerCase().includes(DESK.en) || md.includes(DESK.th), f + ": desk sentence");
  }
  // Thai and English both present where the document is bilingual
  for (const f of ["docs/ONE-PAGER-EXAM.md", "docs/sales/DECK-EXAM.md", "docs/sales/DEMO-SCRIPT-EXAM.md"]) {
    const md = squash(read(f));
    assert.ok(md.includes(DESK.th), f + ": Thai desk sentence");
    assert.ok(md.toLowerCase().includes(DESK.en), f + ": English desk sentence");
  }
  const gone = [
    ["docs/ONE-PAGER-EXAM.md", "| ตรวจพบโทรศัพท์/หนังสือในภาพการสอบ | ยังไม่ได้วัด |"],
    ["docs/ONE-PAGER-EXAM.md", "| Phone / book detection on exam footage | not measured |"],
    ["docs/sales/DECK-EXAM.md", "phone / book detection | **ยังไม่ได้วัด / not measured**"],
    ["docs/sales/DECK-EXAM.md", "phone and book detection, skin tone"],
    ["docs/sales/DECK-EXAM.md", "มีคนที่สอง โทรศัพท์ในภาพ ออกจากเต็มจอ"],
    ["docs/LAUNCH-READINESS.md", "| **Not measured** | Phone / book detection on exam footage;"],
    ["docs/sales/DEMO-SCRIPT-EXAM.md", "ห้ามบอกว่าตรวจโทรศัพท์หรือหนังสือได้แม่น (ยังไม่ได้วัดบนภาพห้องสอบ)"],
    ["docs/sales/DEMO-SCRIPT-EXAM.md", "that phone or book detection is accurate (not measured on exam footage)"],
    ["docs/ACCURACY-CLAIMS.md", "| Exam | phone / book detection on exam footage | not measured |"]
  ];
  for (const [f, s] of gone) assert.ok(!squash(read(f)).includes(squash(s)), `${f}: old wording still there: ${s}`);
  // no other phone figure in the sales documents: every percentage next to "phone" / "โทรศัพท์" is one of the two
  for (const f of DOCS) {
    for (const line of read(f).split("\n").filter(l => /phone|โทรศัพท์/i.test(l) && !/iphone|android/i.test(l))) {
      for (const p of line.match(/\d+(?:\.\d+)?\s?%/g) || []) {
        assert.ok(["90.8", "29.6", "28.8", "15", "7"].includes(p.replace(/\s?%/, "")), `${f}: unexpected figure ${p} on a phone line: ${line.slice(0, 160)}`);
      }
    }
  }
});

test("P5 claims register E3: figures, n, label public, A2 evidence", () => {
  const md = read("docs/ACCURACY-CLAIMS.md");
  const reg = md.match(/<!-- claims-register:start -->([\s\S]*?)<!-- claims-register:end -->/)[1];
  const row = reg.split("\n").find(l => /^\|\s*E3\s*\|/.test(l));
  assert.ok(row, "E3 row");
  const c = row.split("|").map(s => s.trim());
  assert.equal(c[4], "exam.l.cl3");
  for (const f of ["90.8%", "29.6%"]) assert.ok(c[5].includes(f), "figures: " + c[5]);
  for (const n of ["n = 142", "n = 81", "n = 135"]) assert.ok(c[6].includes(n), "n: " + c[6]);
  assert.ok(c[7].split(";").map(s => s.trim()).includes("public"), "label public: " + c[7]);
  assert.equal(c[8], "docs/exam/EXAMLAB-PHONE-SET.md");
});

test("P6 the evidence still holds the locked A2 result", () => {
  const ev = squash(read("docs/exam/EXAMLAB-PHONE-SET.md"));
  for (const s of ["Recall at desk-like sizes (phoneLong < 0.4) = 29.6 % (24 / 81)", "The model finds close-up phones (90.8 %, 129 / 142)",
    "No false flags on the 135 negatives at any cut", "Open Images V7", "public stills, not lab webcam"]) {
    assert.ok(ev.includes(s), "evidence: " + s);
  }
});
