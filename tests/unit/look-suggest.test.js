"use strict";
// tests/unit/look-suggest.test.js — Look suggestions on the face-reading page (stream D, docs/BEAUTY-IMAGE-DESIGN.md §1 + §3,
// CLAUDE.md "Look suggestions" rule on branch claude-md-ops). FIXED TEST SET: written and hash-locked
// (~/LENSIQ-field/evals/beauty-look/locked.sha256) BEFORE lensiq-look.js, lensiq-look-lint.js and lensiq-look-art.js were
// written. Never edited to make the product pass.
//
// Rules under test:
//   L1 rule table: reading -> suggestion, every item names the reading it relates to, TH / EN / ZH complete, only reversible
//      styling categories (brows, hair, facial hair, make-up, accessories); preview kind only brow / lip / liner (MVP option ก)
//   L2 every item carries the fixed label "according to belief, please use your own judgement" (TH / EN / ZH)
//   L3 wording lint, three languages: banned procedure words (surgery, injections, thread lift, laser, tattoo / semi-permanent
//      pigment, any medical or cosmetic procedure), skin-whitening / colourism wording, "this feature is bad / must be fixed",
//      beauty scores and age-look claims, "luck suffers otherwise", plus every Merit lint code (purchase, price, link, ...).
//      Disguises (spaces, zero-width characters, fullwidth letters) do not slip through. Clean styling sentences pass.
//   L4 adults only: nothing is suggested until the same 18+ confirmation as straight mode (localStorage lq-fortune-straight)
//   L5 hidden when the crisis net triggers or the tab is calm: canShow() checks LQFortuneCrisis at render time; the block
//      carries its own attribute data-lq-look and its CSS hides it under html[data-lq-calm] and html[data-lq-crisis]
//   L6 never tied to a purchase; no photos stored or sent: no network, canvas export or storage API in the look modules
//   L7 no age / gender / expression model and no face-parsing (BiSeNet / faceparse) model in the look modules
//   L8 illustration cards are our own inline vector drawings (SVG), no external image, no script
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/;
const CJK = /[㐀-鿿]/;
const look = () => require("../../lensiq-look.js");
const lint = () => require("../../lensiq-look-lint.js");
const art = () => require("../../lensiq-look-art.js");
const merit = () => require("../../lensiq-merit-lint.js");
const src = f => readFileSync(join(ROOT, f), "utf8");

/** Fake storage (localStorage / sessionStorage stand-in). */
function store(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
/** Minimal document stand-in: html attributes only (what LQFortuneCrisis.calmOn reads). */
function fakeDoc(attrs = {}) {
  const a = { ...attrs };
  return { documentElement: { getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); } },
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };
}
/** a faceread classify() result (faceread.js) with overrides */
function cls(o = {}) {
  return {
    brow: { cat: o.brow || "balanced", note: null }, eye: { cat: o.eye || "balanced", note: o.eyeNote || "normal" },
    nose: { cat: o.nose || "balanced" }, mouth: { cat: o.mouth || "balanced", note: o.mouthNote || "level", lip: "even" },
    ear: { cat: "na" }, yintang: { cat: o.yintang || "balanced" }, philtrum: { cat: "balanced" }, chin: { cat: o.chin || "balanced" },
    zones: { balanced: !o.zone, dominant: o.zone || null, shares: {}, z: {} }
  };
}
const CATS = {
  brow: ["short", "sword", "crescent", "willow", "straight", "gentle", "long", "balanced"],
  eye: ["phoenix", "elephant", "dragon", "deer", "soft", "tiger", "balanced"],
  mouth: ["moon", "square", "wide", "cherry", "small", "full", "balanced"],
  nose: ["gall", "lion", "tube", "refined", "compact", "balanced"],
  chin: ["broad", "pointed", "balanced"], yintang: ["wide", "narrow", "balanced"], zone: [null, "upper", "middle", "lower"],
  el: ["wood", "fire", "earth", "metal", "water"]
};
const LABEL = { th: "ตามความเชื่อ โปรดใช้วิจารณญาณ", en: "According to belief, please use your own judgement", zh: "依据传统信仰，请自行判断" };

/* ------------------------------------------------------------------ L3: the wording lint ------------------------------------------------------------------ */
// [text, expected code] — every line must be caught with exactly this code among the hits
const BANNED = [
  // procedures (TH)
  ["ลองทำศัลยกรรมจมูกให้โด่งขึ้น", "procedure"], ["ฉีดโบท็อกซ์ที่หว่างคิ้ว", "procedure"], ["เติมฟิลเลอร์ที่คาง", "procedure"],
  ["ร้อยไหมยกหางคิ้ว", "procedure"], ["ทำเลเซอร์ที่ใต้ตา", "procedure"], ["สักคิ้วทรงโค้ง", "procedure"], ["สักปากสีชมพู", "procedure"],
  ["สักขอบตาถาวร", "procedure"], ["ทำคิ้วแบบกึ่งถาวร", "procedure"], ["ไมโครเบลดดิ้งคิ้ว", "procedure"], ["ผ่าตัดตาสองชั้น", "procedure"],
  ["ทำหัตถการเสริมความงาม", "procedure"], ["เสริมจมูกซิลิโคน", "procedure"],
  // procedures (EN)
  ["Try a nose job for a higher bridge", "procedure"], ["Botox between the brows", "procedure"], ["A little filler in the chin", "procedure"],
  ["Get a thread lift for the brow tail", "procedure"], ["Laser the under-eye area", "procedure"], ["Tattoo your brows", "procedure"],
  ["Microblading gives fuller brows", "procedure"], ["Semi-permanent lip colour", "procedure"], ["eyelid surgery", "procedure"],
  ["a cosmetic procedure", "procedure"], ["Injections at the jaw", "procedure"], ["rhinoplasty", "procedure"], ["permanent makeup", "procedure"],
  // procedures (ZH)
  ["可以去做隆鼻手术", "procedure"], ["打肉毒杆菌", "procedure"], ["注射玻尿酸", "procedure"], ["埋线提眉", "procedure"], ["做激光", "procedure"],
  ["纹眉", "procedure"], ["半永久眉毛", "procedure"], ["割双眼皮", "procedure"], ["医美项目", "procedure"], ["纹唇", "procedure"], ["绣眉", "procedure"],
  // whitening / colourism
  ["ใช้สีนี้แล้วผิวขาวขึ้น", "whitening"], ["ช่วยให้หน้าขาวใส", "whitening"], ["ครีมไวท์เทนนิ่ง", "whitening"], ["ผิวคล้ำควรเลี่ยงสีนี้", "whitening"],
  ["This shade whitens your skin", "whitening"], ["makes your skin look fairer", "whitening"], ["skin lightening", "whitening"], ["brightens your complexion", "whitening"],
  ["这个颜色显白", "whitening"], ["美白", "whitening"], ["提亮肤色", "whitening"], ["顯白", "whitening"],
  // a feature is bad / must be fixed
  ["คิ้วแบบนี้ไม่ดี", "negative"], ["จุดด้อยของใบหน้าคุณคือคาง", "negative"], ["ต้องแก้ทรงคิ้ว", "negative"], ["ปิดข้อเสียของจมูก", "negative"],
  ["ตาของคุณผิดปกติ", "negative"], ["หน้าแบบนี้ไม่สวย", "negative"],
  ["Your brows are bad", "negative"], ["Fix your nose shape", "negative"], ["hide the flaw", "negative"], ["correct your jawline", "negative"],
  ["an unflattering chin", "negative"], ["a problem area", "negative"],
  ["你的眉毛不好", "negative"], ["遮住缺点", "negative"], ["必须改眉形", "negative"], ["鼻子难看", "negative"], ["矫正下巴", "negative"],
  // beauty scores and age-look claims
  ["คะแนนความสวยของคุณ 8/10", "score"], ["ทำแล้วสวยขึ้น", "score"], ["ดูอ่อนกว่าวัย", "score"], ["หล่อขึ้นทันตา", "score"],
  ["Your beauty score is 7", "score"], ["look younger", "score"], ["more attractive", "score"], ["rated 9 out of 10", "score"],
  ["颜值打分", "score"], ["显年轻", "score"], ["变得更漂亮", "score"],
  // luck suffers otherwise
  ["ถ้าไม่แต่งคิ้วแบบนี้ ดวงจะตก", "threat"], ["ไม่งั้นโชคจะหาย", "threat"], ["ไม่เปลี่ยนทรงผมจะเสียโชค", "threat"],
  ["Otherwise your luck will suffer", "threat"], ["If you don't change your brows you will lose luck", "threat"],
  ["否则运势会下降", "threat"], ["不改的话会影响运势", "threat"],
  // Merit lint codes are part of the look lint too
  ["ซื้อได้ที่ร้านเรา", "purchase"], ["Buy this lipstick", "purchase"], ["购买这支口红", "purchase"],
  ["ราคา 299 บาท", "price"], ["only $15", "price"], ["只要99元", "price"],
  ["ดูที่ www.example.com", "link"], ["รับประกันผล", "guarantee"], ["guaranteed result", "guarantee"], ["保证有效", "guarantee"],
  ["เสริมดวงทันที", "fix_luck"], ["boost your luck", "fix_luck"], ["改运", "fix_luck"],
  // disguises
  ["ศัลย กรรม", "procedure"], ["s u r g e r y", "procedure"], ["botox", "procedure"], ["ｂｏｔｏｘ", "procedure"], ["ผิว​ขาว", "whitening"], ["美 白", "whitening"]
];
// clean styling sentences of the kind the rule table uses: no hit at all
const CLEAN = [
  "ตามตำรา คิ้วโค้งปลายยกเล็กน้อยสื่อถึงความมุ่งมั่น ลองเติมหางคิ้วด้วยดินสอเขียนคิ้วสีใกล้สีผม",
  "ลองอายไลเนอร์เส้นบางตามแนวขนตา ปลายตวัดขึ้นสั้น ๆ",
  "ลิปสีโทนอุ่นทาให้เต็มริมฝีปาก เน้นมุมปากให้ชัด",
  "ทรงผมเปิดหน้าผาก หรือรวบผมขึ้นในวันที่ต้องพบผู้ใหญ่",
  "ต่างหูทรงหยดน้ำยาวระดับคาง",
  "แว่นกรอบมนสีอ่อน",
  "สำหรับผู้ที่ไว้หนวดเครา เคราสั้นเรียบตามแนวคาง",
  "By tradition, a softly lifted brow tail is linked with determination; try filling the tail with a pencil close to your hair colour",
  "Try a thin eyeliner along the lash line with a short lifted flick",
  "A warm-toned lip colour applied to the full lip line",
  "A hairstyle that keeps the forehead open",
  "Drop earrings that end around the jaw line",
  "Rounded frames in a light colour",
  "If you wear facial hair, a short beard trimmed along the jaw",
  "按面相传统，眉尾微微上扬象征有决心，可以用接近发色的眉笔补画眉尾",
  "沿睫毛根画一条细眼线，眼尾轻轻上挑",
  "暖色调口红，涂满唇形",
  "露出额头的发型",
  "长度到下颌的水滴形耳环",
  "浅色圆框眼镜",
  "如果留胡子，可以沿下颌修成短胡须"
];

test("L3 the look lint catches banned wording in Thai, English and Chinese (with disguises)", () => {
  const { lintLook } = lint();
  const miss = [];
  for (const [text, code] of BANNED) {
    const hits = lintLook(text);
    if (!hits.some(h => h.code === code)) miss.push(`${JSON.stringify(text)} -> expected ${code}, got ${JSON.stringify(hits)}`);
  }
  assert.deepEqual(miss, [], "missed:\n" + miss.join("\n"));
});

test("L3 clean styling sentences pass the look lint and the Merit lint", () => {
  const { lintLook } = lint();
  const bad = CLEAN.map(t => [t, lintLook(t), merit().lintMerit(t)]).filter(([, a, b]) => a.length || b.length);
  assert.deepEqual(bad, [], "false positives: " + JSON.stringify(bad));
});

test("L3 the look lint exposes its codes, including every Merit lint code", () => {
  const { LOOK_CODES } = lint();
  for (const c of ["procedure", "whitening", "negative", "score", "threat"]) assert.ok(LOOK_CODES.includes(c), c);
  for (const c of merit().LINT_CODES) assert.ok(LOOK_CODES.includes(c), "merit code " + c);
});

/* ------------------------------------------------------------------ L1 + L2 + L8: the rule table ------------------------------------------------------------------ */
test("L1 every rule: reversible category, a named reading and a suggestion in TH / EN / ZH, clean wording", () => {
  const { RULES } = look();
  const { lintLook } = lint();
  assert.ok(Array.isArray(RULES) && RULES.length >= 16, "at least 16 rules, got " + (RULES && RULES.length));
  const ids = new Set();
  for (const r of RULES) {
    assert.ok(r.id && !ids.has(r.id), "unique id " + r.id); ids.add(r.id);
    assert.ok(["brows", "hair", "facial_hair", "makeup", "accessories"].includes(r.cat), r.id + " category " + r.cat);
    assert.ok([null, "brow", "lip", "liner"].includes(r.preview == null ? null : r.preview), r.id + " preview " + r.preview);
    for (const l of LANGS) {
      for (const f of ["reading", "text"]) {
        const t = r[f] && r[f][l];
        assert.ok(typeof t === "string" && t.trim().length >= 4, `${r.id}.${f}.${l} present`);
        assert.deepEqual(lintLook(t), [], `${r.id}.${f}.${l} lint: ${t}`);
        assert.deepEqual(merit().lintMerit(t), [], `${r.id}.${f}.${l} merit lint: ${t}`);
        if (l === "th") assert.ok(THAI.test(t), `${r.id}.${f}.th is Thai`);
        if (l === "en") assert.ok(!THAI.test(t) && !CJK.test(t), `${r.id}.${f}.en has no Thai / Chinese: ${t}`);
        if (l === "zh") assert.ok(CJK.test(t) && !THAI.test(t), `${r.id}.${f}.zh is Chinese: ${t}`);
      }
    }
  }
  // every category the design note lists for phase 1 is covered by at least one rule
  for (const c of ["brows", "hair", "facial_hair", "makeup", "accessories"]) assert.ok(RULES.some(r => r.cat === c), "a rule for " + c);
  for (const p of ["brow", "lip", "liner"]) assert.ok(RULES.some(r => r.preview === p), "a rule with live preview " + p);
});

test("L2 the belief label is fixed text in all three languages", () => {
  const { LABEL: L } = look();
  for (const l of LANGS) assert.equal(L[l], LABEL[l], l);
});

test("L1 suggest(): every combination of readings gives 1–6 items, each naming its reading, deterministic, labelled", () => {
  const { suggest } = look();
  let combos = 0;
  for (const brow of CATS.brow) for (const eye of CATS.eye) for (const mouth of CATS.mouth) for (const zone of CATS.zone) {
    const c = cls({ brow, eye, mouth, zone, nose: CATS.nose[combos % 6], chin: CATS.chin[combos % 3], yintang: CATS.yintang[(combos >> 1) % 3] });
    const el = CATS.el[combos % 5];
    for (const lang of LANGS) {
      const a = suggest(c, { el, lang }), b = suggest(c, { el, lang });
      assert.deepEqual(a, b, "deterministic");
      assert.ok(a.length >= 1 && a.length <= 6, `1..6 items, got ${a.length}`);
      for (const it of a) {
        assert.equal(it.label, LABEL[lang], "label " + lang);
        assert.ok(it.reading && it.text && it.cat && it.id, "fields");
        if (lang === "en") assert.ok(!THAI.test(it.reading + it.text), "en text");
      }
      assert.equal(new Set(a.map(i => i.id)).size, a.length, "no duplicate items");
    }
    combos++;
  }
  assert.ok(combos > 1000);
});

test("L1 suggestions follow the reading: straight brows get a soft-arch brow item; low eye tails get a lifted liner", () => {
  const { suggest } = look();
  const s1 = suggest(cls({ brow: "straight" }), { el: "earth", lang: "th" });
  assert.ok(s1.some(i => i.cat === "brows" && i.preview === "brow"), JSON.stringify(s1.map(i => i.id)));
  const s2 = suggest(cls({ eye: "soft" }), { el: "earth", lang: "en" });
  assert.ok(s2.some(i => i.preview === "liner"), JSON.stringify(s2.map(i => i.id)));
  const s3 = suggest(cls({ mouth: "small" }), { el: "earth", lang: "zh" });
  assert.ok(s3.some(i => i.preview === "lip"), JSON.stringify(s3.map(i => i.id)));
});

test("L8 illustration cards: own inline SVG, no external image, no script, one per card id the rules use", () => {
  const { RULES } = look();
  const A = art();
  const used = new Set(RULES.map(r => r.card).filter(Boolean));
  assert.ok(used.size >= 8, "at least 8 illustration cards, got " + used.size);
  for (const id of used) {
    const svg = A.svg(id);
    assert.ok(typeof svg === "string" && /^<svg[\s>]/.test(svg) && /<\/svg>$/.test(svg), id + " is an SVG");
    assert.ok(!/<image|<script|href=|url\(|<foreignObject|on[a-z]+=/i.test(svg), id + " has no external image or script");
    assert.ok(/role="img"/.test(svg) && /aria-label="/.test(svg) || /aria-hidden="true"/.test(svg), id + " accessible");
  }
});

/* ------------------------------------------------------------------ L4 + L5: who sees it ------------------------------------------------------------------ */
test("L4 + L5 canShow(): adults only (same 18+ confirmation as straight mode), hidden when calm or in crisis", () => {
  const prevL = globalThis.localStorage, prevS = globalThis.sessionStorage;
  try {
    const L = look();
    globalThis.sessionStorage = store();
    globalThis.localStorage = store();
    assert.deepEqual(L.canShow(fakeDoc()), { ok: false, why: "adult" }, "not confirmed");
    globalThis.localStorage = store({ "lq-fortune-straight": JSON.stringify({ adult: true, straight: false }) });
    assert.deepEqual(L.canShow(fakeDoc()), { ok: true, why: "" }, "confirmed adult (straight off is irrelevant)");
    assert.deepEqual(L.canShow(fakeDoc({ "data-lq-calm": "1" })), { ok: false, why: "calm" }, "calm page");
    assert.deepEqual(L.canShow(fakeDoc({ "data-lq-crisis": "1" })), { ok: false, why: "calm" }, "crisis state");
    globalThis.sessionStorage = store({ "lq-fortune-calm": "1" });
    assert.deepEqual(L.canShow(fakeDoc()), { ok: false, why: "calm" }, "calm session in this tab");
    // calm wins over the missing confirmation too: nothing at all, not even the age question
    globalThis.localStorage = store();
    assert.deepEqual(L.canShow(fakeDoc()), { ok: false, why: "calm" }, "calm before adult");
    // the user switched the section off on this device
    globalThis.sessionStorage = store();
    globalThis.localStorage = store({ "lq-fortune-straight": JSON.stringify({ adult: true }), "lq-look-off": "1" });
    assert.deepEqual(L.canShow(fakeDoc()), { ok: false, why: "off" }, "switched off");
  } finally { globalThis.localStorage = prevL; globalThis.sessionStorage = prevS; }
});

test("L4 confirmAdult() writes the same storage as straight mode and does not switch straight mode on", () => {
  const prevL = globalThis.localStorage;
  try {
    globalThis.localStorage = store();
    look().confirmAdult();
    const v = JSON.parse(globalThis.localStorage.getItem("lq-fortune-straight"));
    assert.equal(v.adult, true);
    assert.equal(require("../../fortune-straight.js").get().adult, true);
  } finally { globalThis.localStorage = prevL; }
});

test("L5 markup and CSS: own attribute data-lq-look, hidden under html[data-lq-calm] and html[data-lq-crisis]", () => {
  const L = look();
  const items = L.suggest(cls({ brow: "straight", eye: "soft", mouth: "small" }), { el: "fire", lang: "th" });
  const html = L.html(items, "th");
  assert.match(html, /data-lq-look/);
  for (const it of items) assert.ok(html.includes(LABEL.th), "label shown");
  assert.ok(!/<a\s|href=|฿|บาท|price|ราคา/i.test(html), "no link or price in the block");
  const css = L.CSS.replace(/\s+/g, "");
  assert.ok(/html\[data-lq-calm\][^{]*\[data-lq-look\]/.test(css) && /html\[data-lq-crisis\][^{]*\[data-lq-look\]/.test(css), "calm + crisis CSS");
  assert.ok(/display:none!important/.test(css));
  const esc = L.html([{ id: "x", cat: "brows", reading: "<img src=x onerror=alert(1)>", text: "a&b", label: LABEL.th, card: null, preview: null }], "th");
  assert.ok(!/<img/.test(esc) && /&lt;img/.test(esc) && /a&amp;b/.test(esc), "escaped");
});

/* ------------------------------------------------------------------ L6 + L7: privacy and models ------------------------------------------------------------------ */
test("L6 + L7 look modules: no network, no canvas export, no image storage, no age / gender / expression / face-parsing model", () => {
  for (const f of ["lensiq-look.js", "lensiq-look-lint.js", "lensiq-look-art.js"]) {
    const s = src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /toDataURL/, /toBlob/, /indexedDB/, /caches\./]) assert.ok(!re.test(s), f + " uses " + re);
    for (const re of [/ageGender/i, /faceExpression/i, /outputFaceBlendshapes\s*:\s*true/, /faceparse/i, /bisenet/i]) assert.ok(!re.test(s), f + " model " + re);
  }
});

test("faceread.html loads the look modules and has the look block; faceread.js renders it", () => {
  const h = src("faceread.html"), j = src("faceread.js");
  for (const f of ["lensiq-merit-lint.js", "lensiq-look-lint.js", "lensiq-look-art.js", "lensiq-look.js"]) assert.match(h, new RegExp('<script src="' + f.replace(/\./g, "\\.") + '(\\?v=\\d+)?"'), f);
  assert.match(h, /id="frLook"[^>]*data-lq-look|data-lq-look[^>]*id="frLook"/);
  assert.match(j, /LQLook\.render\(/);
  // the look modules load after the crisis net and straight-mode modules they read
  const pos = f => h.indexOf('src="' + f);
  assert.ok(pos("fortune-crisis.js") < pos("lensiq-look.js") && pos("fortune-straight.js") < pos("lensiq-look.js"));
});
