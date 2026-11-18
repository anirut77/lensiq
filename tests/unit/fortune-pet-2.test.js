"use strict";
// tests/unit/fortune-pet-2.test.js — FIXED TEST SET, review round 1 of the Pet face reading (independent review NOT OK on
// fortune-pet @ 36c6594, 2026-11-16). Locked (evals-locks/fortune-pet.sha256, ~/LENSIQ-field/evals/fortune-pet/) BEFORE the
// fixes; the browser half is tests/e2e/fortune-pet-2.e2e.mjs. Earlier fortune-pet files are unchanged. Inputs: synthetic.
//   R1  D1 privacy: person boxes for the card blur use a LOWER score threshold than the person note (blur errs on the side of
//       more): a person scored 0.2 is in the blur list.
//   R2  D3 camera denied: the first step is "แตะชื่อหน้าด้านบนสุด" / "Tap the page title at the very top" / "点按最上方的页面标题",
//       before the Settings fallback; the Thai step lives in ONE place in petread.js (a constant to swap for the shared helper).
//   R3  card: the user's typed pet name is kept on the card in every language (model.petName, drawn as the headline); the
//       generated card text (cardText) stays in the page language; a headline type for the pet (generated, lint-clean, varies
//       by coat); a 9:16 story size besides the 4:5 post; an optional on-device QR (off by default; MIT qrcode-generator).
//   R4  docs: COCO-SSD is not called a petread fallback; the first 0.30 measurement on the locked set is disclosed; the
//       Phrommachat trait is "black-spotted feet", not "dark patches".
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const P = require("../../lensiq-pet.js");
const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/;
const BAN = {
  th: /สุขภาพ|ป่วย|โรค|อาการ|เจ็บ|ปวด|ตาย|เสียชีวิต|อายุ|สัตวแพทย์|หมอ|รักษา|ยา|วัคซีน|แข็งแรง|ร่างกาย|น้ำหนัก|อ้วน|ซวย|โชคร้าย|กาลกิณี|เลขเด็ด|หวย/,
  en: /\b(?:health\w*|ill|illness|sick\w*|disease\w*|vets?|veterinar\w*|lifespan|longevity|die[sd]?|dying|death|dead|cure\w*|treatment|medic\w*|weight|bad luck|unlucky|lottery)\b/i,
  zh: /健康|疾病|病|兽医|寿|死|治疗|药|体重|倒霉|不吉|彩票/,
};
const pet = (coat, name = "") => ({ species: "cat", name, traits: { coat, marks: [], eyes: "green", ears: "up", face: "round", size: "small", energy: "calm" }, birth: "2021-03-14", owner: null });

test("R1 privacy: a person scored 0.2 is blurred on the card even though it is below the person-note threshold", () => {
  const r = P.pickDetections([{ cls: 15, score: 0.8, x: 0.1, y: 0.1, w: 0.4, h: 0.6 }, { cls: 0, score: 0.2, x: 0.7, y: 0.1, w: 0.2, h: 0.5 }]);
  assert.ok(Array.isArray(r.blur), "pickDetections returns a blur list");
  assert.equal(r.blur.length, 1, "the 0.2 person is in the blur list");
  const r2 = P.pickDetections([{ cls: 0, score: 0.12, x: 0.7, y: 0.1, w: 0.2, h: 0.5 }]);
  assert.equal(r2.blur.length, 1, "a 0.12 person is blurred too");
  assert.ok(r.blur.every(b => r.persons.includes(b) || b.score < 0.4));
});

test("R2 camera denied: the first step is the page title, before the Settings fallback (TH / EN / ZH); one Thai constant", () => {
  const js = read("petread.js");
  assert.equal((js.match(/แตะชื่อหน้าด้านบนสุด/g) || []).length, 1, "the Thai first step appears once in petread.js");
  const FIRST = { en: "Tap the page title at the very top", zh: "点按最上方的页面标题" }, SET = { en: /Settings/, zh: /设置/ };
  for (const l of ["en", "zh"]) {
    const m = read(`i18n/${l}-petread.js`).match(/"pet\.cam\.denied"\s*:\s*"((?:[^"\\]|\\.)+)"/);
    assert.ok(m, l + " pet.cam.denied");
    const t = JSON.parse('"' + m[1] + '"');
    assert.ok(t.includes(FIRST[l]), l + ": first step " + t);
    const s = t.search(SET[l]); assert.ok(s > t.indexOf(FIRST[l]), l + ": the Settings fallback comes after the first step");
  }
});

test("R3 card: the typed name is kept in every language; generated card text stays in the page language", () => {
  for (const lang of LANGS) {
    for (const name of ["ส้มจี๊ด", "Mochi", "小白"]) {
      const m = P.cardModel(P.compose(pet("grey", name), { lang }));
      assert.equal(m.petName, name, `${lang}: card keeps the typed name ${name}`);
      if (lang !== "th") assert.ok(!P.cardText(m).some(t => THAI.test(t) && !t.includes("anirut77")), lang + ": generated card text has no Thai");
    }
    const m0 = P.cardModel(P.compose(pet("grey", ""), { lang }));
    assert.ok(typeof m0.petName === "string" && m0.petName.length > 0, lang + ": a default name when none is typed");
  }
  assert.match(read("lensiq-pet-card.js"), /petName/, "the card draws petName");
});

test("R3 card: a headline type for the pet, generated, lint-clean and varied by coat (TH / EN / ZH)", () => {
  for (const lang of LANGS) {
    const seen = new Set();
    for (const coat of P.TRAITS.coat) {
      const m = P.cardModel(P.compose(pet(coat), { lang }));
      assert.ok(typeof m.headline === "string" && m.headline.length >= 3, `${lang} ${coat}: headline`);
      assert.doesNotMatch(m.headline, BAN[lang]);
      if (lang !== "th") assert.doesNotMatch(m.headline, THAI);
      assert.ok(P.cardText(m).includes(m.headline), "the headline is drawn (in cardText)");
      seen.add(m.headline);
    }
    assert.ok(seen.size >= 8, `${lang}: ${seen.size} different headlines over ${P.TRAITS.coat.length} coats`);
  }
});

test("R3 card: post 4:5 and story 9:16 sizes; optional QR off by default, generated on the device with the MIT library", () => {
  const C = require("../../lensiq-pet-card.js");
  assert.deepEqual(C.SIZES.post, { w: 1080, h: 1350 });
  assert.deepEqual(C.SIZES.story, { w: 1080, h: 1920 });
  const h = read("petread.html");
  const qr = h.match(/<input[^>]*id="petQrOn"[^>]*>/);
  assert.ok(qr && /type="checkbox"/.test(qr[0]) && !/\bchecked\b/.test(qr[0]), "QR option, off by default");
  assert.match(h, /data-size="story"/); assert.match(h, /data-size="post"/);
  assert.match(read("vendor/qrcode-generator/LICENSE"), /MIT License/);
  assert.match(read("LICENSES/THIRD_PARTY.md"), /qrcode-generator[^\n]*petread/, "THIRD_PARTY lists petread as a qrcode-generator user");
  for (const f of ["lensiq-pet-card.js", "petread.js"]) assert.doesNotMatch(read(f), /api\.qrserver|chart\.googleapis|quickchart|https?:\/\/[^"'\s]*qr/i, f + " uses an online QR service");
});

test("R4 docs: COCO-SSD not called a petread fallback; the 0.30 first measurement disclosed; Phrommachat says black-spotted feet", () => {
  const src = read("docs/PET-READING-SOURCES.md");
  assert.doesNotMatch(src, /fallback[^\n]{0,80}COCO-SSD|COCO-SSD[^\n]{0,80}fallback/i, "SOURCES must not call COCO-SSD a petread fallback");
  const res = read("docs/PET-READING-RESEARCH.md");
  assert.match(res, /0\.30[^\n]*before[^\n]*(?:DEV|dev)|first measured[^\n]*0\.30/i, "RESEARCH discloses the first 0.30 measurement before the dev tuning");
  const KB = require("../../lensiq-pet-kb.js");
  const dog = KB.folk.find(f => f.sp === "dog" && f.coat === "white" && f.mark === "spots");
  assert.ok(dog, "the white dog with spotted feet entry");
  assert.match(dog.en, /black-spotted feet/); assert.doesNotMatch(dog.en, /dark patches/);
  assert.match(dog.th, /เท้า/); assert.match(dog.zh, /脚/);
});
