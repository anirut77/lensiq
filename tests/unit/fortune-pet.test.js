"use strict";
// tests/unit/fortune-pet.test.js — FIXED TEST SET, Pet face reading for dogs and cats (owner order 2026-11-16, part B).
// Written and locked (evals-locks/fortune-pet.sha256 and ~/LENSIQ-field/evals/fortune-pet/) BEFORE any product code on
// branch fortune-pet (base origin/main 6319860). The browser halves are tests/e2e/fortune-pet.e2e.mjs (Chrome) and
// tests/e2e/petread-webkit.e2e.mjs (WebKit, iPhone 390 px). Source of every input here: synthetic.
//   H  hard limits over many synthetic inputs in TH / EN / ZH: no health, illness, lifespan or death wording; nothing that
//      replaces a vet; no reading of the owner (a person seen in the photo changes nothing in the reading, the page says the
//      person is ignored); no lottery numbers; no fear-selling or "bad luck" wording.
//   L  the honest line ("adapted from face-reading tradition, not a classical text") and the final disclaimer line on the
//      page, in the result and on the card, TH / EN / ZH.
//   B  the single help button rule: one "อยากมีคนรับฟัง" 1323 button before <main>, no other help number on the page.
//   C  the share card: photo off by default; card text passes the same lint; carries the honest line, the disclaimer and
//      the link back ONLY when LENSIQ_CARD_SHOW_ADDRESS is true (else the brand line and no address); the card section is hidden in the crisis state (data-lq-remedy); no upload code in the pet modules.
//   D  detections: YOLOX classes person 0 / cat 15 / dog 16 -> pet box, species and the persons (to blur, never to read).
//   K  owner-pet compatibility goes through the LQCompat.pair(personA, personB, {mode: "owner-pet"}) interface.
//   S  the detector is loaded only on tap (no ONNX Runtime / model in the page's script tags).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const LANGS = ["th", "en", "zh"];
const P = require("../../lensiq-pet.js");

const HONEST = {
  th: "คำอ่านนี้ดัดแปลงจากความเชื่อเรื่องการดูลักษณะ ไม่ใช่ตำราดั้งเดิม",
  en: "Adapted from face-reading tradition, not a classical text.",
  zh: "改编自相术传统，并非古籍原文。",
};
const DISC = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
const LINK = "https://anirut77.github.io/lensiq/petread.html";
// RE-LOCK 2026-11-20 (owner decision 184 ก; ledger evals-locks/fortune-pet.sha256 "relock-pet-3"): the site address is on the
// card only when window.LENSIQ_CARD_SHOW_ADDRESS is true (default false, until the site is live on its own domain). Every
// earlier address assertion is kept for the switch-on case and a new one is added for the default (no address anywhere in
// the card model or the card text, the brand line present): equal or stricter. Nothing else in this file changed.
const BRAND_LINE = { th: "จาก LENSIQ", en: "From LENSIQ", zh: "来自 LENSIQ" };
const HOST = LINK.replace(/^https:\/\//, "");
const withAddress = fn => { globalThis.LENSIQ_CARD_SHOW_ADDRESS = true; try { return fn(); } finally { delete globalThis.LENSIQ_CARD_SHOW_ADDRESS; } };

/* ---- the lint (independent of the module's own) ---- */
const BAN = {
  // health, illness, symptoms, treatment, vet, lifespan, age, death, body weight
  th: /สุขภาพ|ป่วย|โรค|อาการ|เจ็บ|ปวด|ตาย|เสียชีวิต|สิ้นใจ|อายุ|สัตวแพทย์|หมอ|รักษา|ให้ยา|กินยา|ยารักษา|วัคซีน|ทำหมัน|แข็งแรง|ร่างกาย|น้ำหนัก|อ้วน|ผอม|บาดแผล|ภูมิคุ้มกัน|อาหารเสริม|โภชนา/,
  en: /\b(?:health\w*|healthy|ill|illness\w*|sick\w*|disease\w*|vet|vets|veterinar\w*|lifespan|life span|longevity|long[- ]lived|live long\w*|long life|die|dies|died|dying|death|dead|deceased|cure\w*|treatment\w*|medic\w*|symptom\w*|diagnos\w*|weight|obes\w*|vaccin\w*|injur\w*|pain(?:s|ful)?|immune|nutrition\w*|diet\w*|supplement\w*)\b/i,
  zh: /健康|疾病|生病|病|兽医|医生|医院|寿|长命|死|去世|过世|治疗|药|症状|疫苗|体重|肥胖|受伤|疼|免疫|营养|绝育/,
};
// the owner is never read: no statement about the owner's face, looks or features
const OWNER = {
  th: /ใบหน้าของคุณ|หน้าตาของคุณ|โหงวเฮ้งของคุณ|ลักษณะใบหน้า(?:ของ)?(?:คุณ|เจ้าของ)|หน้า(?:ของ)?เจ้าของ|รูปร่างของคุณ/,
  en: /\byour (?:face|facial|features|looks|appearance|nose|smile|forehead|jaw|cheeks?)\b|\bthe owner'?s (?:face|looks|features|appearance)\b/i,
  zh: /你的(?:脸|面相|五官|长相|外貌|相貌)|主人的(?:脸|面相|五官|长相|外貌|相貌)/,
};
const LOTTO = /เลขเด็ด|เลขนำโชค|หวย|ล็อตเตอรี่|lucky numbers?|lottery|lotto|彩票|幸运数字|号码/i;
const FEAR = {
  th: /ซวย|โชคร้าย|กาลกิณี|อัปมงคล|ถ้าไม่[^\s]{0,20}จะ(?:เกิด|โชค|เสีย)|เคราะห์ร้าย/,
  en: /\bbad luck\b|\bmisfortune\b|\bunlucky\b|\bunless you (?:pay|buy|do)\b|\bcurse\w*\b|\bjinx\w*\b/i,
  zh: /倒霉|晦气|不吉|厄运|霉运|否则会|不然会/,
};
const thaiIn = s => /[฀-๿]/.test(s);
function lintText(text, lang) {
  const hits = [];
  for (const [k, re] of [["ban", BAN[lang]], ["owner", OWNER[lang]], ["lotto", LOTTO], ["fear", FEAR[lang]]]) {
    const m = String(text).match(re); if (m) hits.push(k + ":" + m[0]);
  }
  if (lang !== "th" && thaiIn(text)) hits.push("thai-in-" + lang);
  return hits;
}
/** every string a result shows (sections, notes, lucky, compat) */
function resultText(r) {
  const out = [];
  for (const s of r.sections || []) { out.push(s.title || ""); for (const p of s.paragraphs || []) out.push(p); }
  for (const v of Object.values(r.notes || {})) out.push(String(v));
  if (r.lucky) { if (r.lucky.colour) out.push(r.lucky.colour.name || ""); if (r.lucky.day) out.push(r.lucky.day.name || ""); }
  if (r.reminder) out.push(r.reminder);
  return out.filter(Boolean);
}

/* ---- synthetic inputs ---- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pickOne = (r, a) => a[Math.floor(r() * a.length)];
const NAMES = ["", "Mochi", "ส้มจี๊ด", "ข้าวตู", "Lucky", "小白", "Biscuit", "นิล", "Tofu", "เจ้าดำ"];
function inputs() {
  const T = P.TRAITS, out = [], r = rng(20261116);
  for (const species of T.species) for (const coat of T.coat) for (const eyes of T.eyes) {
    for (let k = 0; k < 3; k++) {
      const marks = T.marks.filter(() => r() < 0.3);
      const day = new Date(Date.UTC(2010 + Math.floor(r() * 16), Math.floor(r() * 12), 1 + Math.floor(r() * 28)));
      const owner = r() < 0.6 ? { birth: new Date(Date.UTC(1960 + Math.floor(r() * 45), Math.floor(r() * 12), 1 + Math.floor(r() * 28))).toISOString().slice(0, 10) } : null;
      out.push({ species, name: pickOne(r, NAMES), traits: { coat, marks, eyes, ears: pickOne(r, T.ears), face: pickOne(r, T.face), size: pickOne(r, T.size), energy: pickOne(r, T.energy) },
        birth: r() < 0.8 ? day.toISOString().slice(0, 10) : null, owner, humanSeen: false });
    }
  }
  return out;
}

test("H0: the trait catalogue covers dogs and cats with enough choices for a varied reading", () => {
  const T = P.TRAITS;
  assert.deepEqual([...T.species].sort(), ["cat", "dog"]);
  for (const k of ["coat", "marks", "eyes", "ears", "face", "size", "energy"]) assert.ok(Array.isArray(T[k]) && T[k].length >= 3, k);
  assert.ok(T.coat.length >= 8, "coat colours " + T.coat.length);
  const n = inputs().length;
  assert.ok(n >= 400, "synthetic inputs " + n);
});

test("H1: hard limits over every synthetic input in TH / EN / ZH: no health, illness, lifespan, death, vet, owner reading, lottery or fear wording", () => {
  const bad = []; let n = 0;
  for (const inp of inputs()) for (const lang of LANGS) {
    const r = P.compose(inp, { lang });
    assert.equal(r.lang, lang);
    assert.ok(!r.crisis, "a plain input is never a crisis");
    const texts = resultText(r).concat(P.cardText(P.cardModel(r, { photo: false })).filter(t => t !== LINK));
    for (const t of texts) { n++; const h = lintText(t, lang); if (h.length) bad.push(lang + " " + h.join(",") + " :: " + t.slice(0, 90)); }
  }
  assert.ok(n > 10000, "strings checked: " + n);
  assert.deepEqual(bad.slice(0, 12), [], bad.length + " strings break a hard limit");
});

test("H2: a reading has the five owner-ordered parts: personality, likes, bond, lucky colour and day, owner-pet compatibility", () => {
  for (const lang of LANGS) {
    const r = P.compose({ species: "cat", name: "Mochi", traits: { coat: P.TRAITS.coat[0], marks: [], eyes: P.TRAITS.eyes[0], ears: P.TRAITS.ears[0], face: P.TRAITS.face[0], size: P.TRAITS.size[0], energy: P.TRAITS.energy[0] },
      birth: "2021-03-14", owner: { birth: "1990-07-02" } }, { lang });
    const ids = r.sections.map(s => s.id);
    for (const id of ["personality", "likes", "bond", "lucky", "compat"]) assert.ok(ids.includes(id), lang + " section " + id + " in " + ids.join(","));
    for (const s of r.sections) assert.ok(s.title && s.paragraphs.length >= 1 && s.paragraphs.every(p => p.length >= 12), lang + " " + s.id);
    assert.ok(r.lucky && r.lucky.colour && /^#[0-9a-f]{6}$/i.test(r.lucky.colour.hex) && r.lucky.colour.name, lang + " lucky colour");
    assert.ok(r.lucky.day && r.lucky.day.n >= 0 && r.lucky.day.n <= 6 && r.lucky.day.name, lang + " lucky day");
    const ln = r.sections.find(s => s.id === "lucky").paragraphs.join(" ");
    assert.ok(ln.includes(r.lucky.colour.name) && ln.includes(r.lucky.day.name), lang + " lucky section names the colour and the day");
  }
});

test("H3: the reading depends on the traits (not one text for every pet) and is the same for the same input", () => {
  for (const lang of LANGS) {
    const seen = new Set(); let n = 0;
    for (const inp of inputs().slice(0, 120)) { seen.add(P.compose(inp, { lang }).sections.filter(s => s.id === "personality").map(s => s.paragraphs.join(" ")).join()); n++; }
    assert.ok(seen.size >= n * 0.5, `${lang}: ${seen.size} different personality texts for ${n} pets`);
    const a = inputs()[7];
    assert.deepEqual(P.compose(a, { lang }).sections, P.compose(JSON.parse(JSON.stringify(a)), { lang }).sections, lang + " deterministic");
  }
});

test("H4: no reading of the owner: a person seen in the photo changes nothing in the reading, and the page says the person is ignored", () => {
  const NOTE = { th: /คน/, en: /\bperson|people\b/i, zh: /人/ };
  const IGN = { th: /ไม่(?:ได้)?(?:อ่าน|นำ|ใช้)/, en: /\bnot (?:read|used)\b|\bignor/i, zh: /不(?:会)?(?:解读|使用|读取)|忽略/ };
  for (const inp of inputs().slice(0, 60)) for (const lang of LANGS) {
    const a = P.compose(inp, { lang }), b = P.compose(Object.assign({}, inp, { humanSeen: true }), { lang });
    assert.deepEqual(b.sections, a.sections, "the reading must not change when a person is in the photo");
    assert.ok(b.notes && b.notes.human, lang + ": a note that the person is ignored");
    assert.match(b.notes.human, NOTE[lang]); assert.match(b.notes.human, IGN[lang]);
    assert.ok(!(a.notes && a.notes.human), "no person note without a person");
    assert.deepEqual(lintText(b.notes.human, lang), []);
  }
});

test("H5: no vet replacement: the page and the result never offer care advice; the page says it does not replace a vet", () => {
  const h = read("petread.html");
  assert.match(h, /data-i18n="pet\.novet"/, "a 'not a substitute for a vet' line on the page");
  const NOVET = { en: /\bvet\b/i, zh: /兽医/ };
  for (const l of ["en", "zh"]) { const d = read(`i18n/${l}-petread.js`); const m = d.match(/"pet\.novet"\s*:\s*"([^"]+)"/); assert.ok(m, l + " pet.novet"); assert.match(m[1], NOVET[l]); }
  assert.match(h.match(/data-i18n="pet\.novet"[^>]*>([^<]+)</)[1], /สัตวแพทย์/);
});

test("L1: honest line and the final disclaimer: exact wording in the result, on the page (TH markup, EN / ZH dictionaries) and on the card", () => {
  for (const lang of LANGS) {
    assert.equal(P.HONEST[lang], HONEST[lang], "LQPet.HONEST." + lang);
    const r = P.compose(inputs()[3], { lang });
    assert.equal(r.honest, HONEST[lang]); assert.equal(r.disclaimer, DISC[lang]);
    const t = P.cardText(P.cardModel(r, { photo: false }));
    assert.ok(t.includes(HONEST[lang]), lang + " card honest line"); assert.ok(t.includes(DISC[lang]), lang + " card disclaimer");
    assert.ok(!t.some(s => s.includes(HOST) || /github|https?:/i.test(s)), lang + " no address on the card while the switch is off");
    assert.ok(t.includes(BRAND_LINE[lang]), lang + " card brand line");
    const tOn = withAddress(() => P.cardText(P.cardModel(r, { photo: false })));
    assert.ok(tOn.some(s => s.includes(HOST)), lang + " card link back (switch on)");
  }
  const h = read("petread.html");
  assert.ok(h.includes('data-i18n="pet.honest"') && h.includes(HONEST.th), "petread.html honest line (TH)");
  assert.ok(h.includes('data-i18n="fortune.disc.line"') && h.includes(DISC.th), "petread.html disclaimer (TH)");
  for (const l of ["en", "zh"]) {
    const d = read(`i18n/${l}-petread.js`);
    assert.ok(d.includes(`"pet.honest": ${JSON.stringify(HONEST[l])}`), l + " pet.honest");
    assert.ok(d.includes(`"fortune.disc.line": ${JSON.stringify(DISC[l])}`), l + " fortune.disc.line");
  }
  assert.doesNotMatch(h, /เพื่อความบันเทิง|for entertainment|仅供娱乐/i);
});

test("B1: single help button: exactly one tel:1323 button before <main>, no other help number anywhere on the page or in its own files", () => {
  const h = read("petread.html").replace(/<!--[\s\S]*?-->/g, "");
  assert.equal((h.match(/tel:1323/g) || []).length, 1, "tel:1323 once");
  assert.ok(h.indexOf("tel:1323") < h.indexOf("<main"), "the 1323 button is before <main>");
  assert.match(h, /id="lqHelpTop"[\s\S]*?data-i18n="call\.1323\.label">อยากมีคนรับฟัง</);
  assert.equal((h.match(/href="tel:/g) || []).length, 1, "no other tel: link");
  for (const f of ["petread.html", "petread.js", "lensiq-pet.js", "lensiq-pet-kb.js", "lensiq-pet-card.js", "i18n/en-petread.js", "i18n/zh-petread.js"]) {
    const s = read(f).replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(s, /\b1669\b|\b191\b|\b1300\b|Samaritans|02-?113-?6789|021136789/, f + " has another help number");
    if (f !== "petread.html") assert.doesNotMatch(s, /tel:1323/, f + " adds a second 1323 button");
  }
});

test("C1: share card: photo off by default, a link back, honest line and disclaimer, the lint passes, nothing uploads", () => {
  const h = read("petread.html");
  const cb = h.match(/<input[^>]*id="petPhotoOn"[^>]*>/);
  assert.ok(cb && /type="checkbox"/.test(cb[0]) && !/\bchecked\b/.test(cb[0]), "the photo checkbox is off in the markup");
  assert.match(h, /<section[^>]*id="petCardSec"[^>]*data-lq-remedy/, "the card section is hidden in the crisis state");
  assert.match(h, /<canvas[^>]*id="petCard"/);
  for (const lang of LANGS) {
    const r = P.compose(inputs()[11], { lang });
    const m0 = P.cardModel(r);
    assert.equal(m0.photo, false, "default card model has no photo");
    assert.equal(P.cardModel(r, { photo: true }).photo, true);
    assert.ok(!m0.link && !Object.values(m0).some(v => typeof v === "string" && (v.includes(HOST) || /github|https?:/i.test(v))), lang + " no address in the default card model");
    assert.equal(withAddress(() => P.cardModel(r)).link, LINK);
    const t = P.cardText(m0);
    assert.ok(t.length >= 5 && t.every(s => typeof s === "string" && s.length), "card text lines");
    assert.deepEqual(t.filter(s => s !== LINK).flatMap(s => lintText(s, lang)), [], lang + " card lint");
  }
  for (const f of ["lensiq-pet.js", "lensiq-pet-kb.js", "lensiq-pet-card.js", "petread.js", "lensiq-compat-stub.js"]) {
    const s = read(f);
    assert.doesNotMatch(s, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\.submit\s*\(|FormData/, f + " has upload / network code");
    assert.doesNotMatch(s, /localStorage\.setItem\([^)]*(?:photo|image|img|dataURL|toDataURL)/i, f + " stores the photo");
  }
});

test("C2: the card module is a separate, reusable canvas renderer with a few themes (can move onto the shared share module)", () => {
  const s = read("lensiq-pet-card.js");
  assert.match(s, /LQPetCard/);
  const C = require("../../lensiq-pet-card.js");
  assert.ok(C && typeof C.draw === "function" && C.THEMES && Object.keys(C.THEMES).length >= 3, "LQPetCard.draw + >= 3 themes");
});

test("D1: detections: cat 15 / dog 16 -> the pet and its species; person 0 -> persons to blur, never read", () => {
  const d = (cls, score, x = 0.1, y = 0.1, w = 0.5, h = 0.5) => ({ cls, score, x, y, w, h });
  let r = P.pickDetections([d(15, 0.8), d(0, 0.9, 0.5, 0, 0.5, 1)]);
  assert.equal(r.species, "cat"); assert.equal(r.pet.cls, 15); assert.equal(r.persons.length, 1);
  r = P.pickDetections([d(16, 0.7), d(15, 0.4)]);
  assert.equal(r.species, "dog"); assert.equal(r.persons.length, 0);
  r = P.pickDetections([d(0, 0.9)]);
  assert.equal(r.pet, null); assert.equal(r.species, null); assert.equal(r.persons.length, 1);
  r = P.pickDetections([]);
  assert.equal(r.pet, null); assert.equal(r.persons.length, 0);
  assert.deepEqual(P.CLASSES, { person: 0, cat: 15, dog: 16 });
});

test("K1: owner-pet compatibility goes through LQCompat.pair(personA, personB, {mode: 'owner-pet'}) and shows what it returns", () => {
  const calls = [];
  const prev = globalThis.LQCompat;
  globalThis.LQCompat = { pair(a, b, o) { calls.push([a, b, o]); return { mode: o.mode, source: "test", title: "T", lines: ["COMPAT-LINE-" + (o.lang || "th")] }; } };
  try {
    for (const lang of LANGS) {
      const r = P.compose({ species: "dog", name: "", traits: { coat: P.TRAITS.coat[1], marks: [], eyes: P.TRAITS.eyes[1], ears: P.TRAITS.ears[1], face: P.TRAITS.face[1], size: P.TRAITS.size[1], energy: P.TRAITS.energy[1] },
        birth: "2020-01-05", owner: { birth: "1988-12-24" } }, { lang });
      const c = r.sections.find(s => s.id === "compat");
      assert.ok(c && c.paragraphs.join(" ").includes("COMPAT-LINE-" + lang), lang + " compat section shows LQCompat lines");
    }
    assert.equal(calls.length, 3);
    for (const [a, b, o] of calls) {
      assert.equal(o.mode, "owner-pet");
      assert.equal(a.birth, "1988-12-24"); assert.equal(b.birth, "2020-01-05"); assert.equal(b.species, "dog");
      assert.ok(!("photo" in a) && !("face" in a) && !("image" in a), "only the owner's own birth data goes to compat");
    }
    // without the owner's birth date there is no compat section and no call
    const n0 = calls.length;
    const r = P.compose({ species: "dog", traits: { coat: P.TRAITS.coat[1], marks: [], eyes: P.TRAITS.eyes[1], ears: P.TRAITS.ears[1], face: P.TRAITS.face[1], size: P.TRAITS.size[1], energy: P.TRAITS.energy[1] }, birth: "2020-01-05", owner: null }, { lang: "th" });
    assert.ok(!r.sections.some(s => s.id === "compat") && calls.length === n0);
  } finally { if (prev === undefined) delete globalThis.LQCompat; else globalThis.LQCompat = prev; }
  // the local stub answers the same interface until part A lands
  const S = require("../../lensiq-compat-stub.js");
  for (const lang of LANGS) {
    const o = S.pair({ birth: "1990-07-02", kind: "person" }, { birth: "2021-03-14", kind: "pet", species: "cat" }, { mode: "owner-pet", lang });
    assert.equal(o.mode, "owner-pet"); assert.ok(Array.isArray(o.lines) && o.lines.length >= 1);
    assert.deepEqual(o.lines.flatMap(t => lintText(t, lang)), [], lang + " stub lines lint");
  }
});

test("S1: the detector loads only on tap: no ONNX Runtime, model or TF.js script tag in petread.html", () => {
  const h = read("petread.html");
  const tags = [...h.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(tags.length >= 5);
  for (const t of tags) assert.doesNotMatch(t, /vendor\/(?:ort|tfjs|face-api|mediapipe)|onnx|yolox|cocossd/i, "eager detector script " + t);
  assert.doesNotMatch(h, /<link[^>]+(?:preload|prefetch)[^>]+(?:onnx|wasm|yolox)/i);
});
