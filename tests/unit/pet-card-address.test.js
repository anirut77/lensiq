"use strict";
// tests/unit/pet-card-address.test.js — FIXED TEST SET, owner change 2026-11-20 (with go-live decision 152): the site address
// will change when the site moves to its own domain, and a shared card cannot be corrected later. Until the site is live on the
// new domain the pet share card prints the brand only ("จาก LENSIQ" / "From LENSIQ" / "来自 LENSIQ") in every template, in the
// 4 classic themes and in the save-image / text fallback; no URL anywhere on the card. One switch brings the address back:
// window.LENSIQ_CARD_SHOW_ADDRESS (lensiq-config.js, default false); the address itself stays the single setting LQPet.LINK.
// Coordinator decision (reversible, reported to the owner): the optional QR code encodes the URL, so it follows the same switch.
// Locked (evals-locks/pet-card-address.sha256) BEFORE the product change. Browser half: tests/e2e/pet-card-address.e2e.mjs.
// Synthetic inputs only (no photo).
//   A1  the switch: lensiq-config.js sets window.LENSIQ_CARD_SHOW_ADDRESS, default false, kept true only when set to true first
//   A2  one address setting: LQPet.LINK is the only place the pet card files hold the site address
//   A3  switch off: for TH / EN / ZH, the classic card model and all 13 zodiac template models: the footer (model.from) is exactly
//       the brand line, cardText() (the text fallback) contains it, and no string of the model or of cardText() holds a URL,
//       domain, "github" or "http"
//   A4  switch off: the drawn card (4 classic themes and 13 zodiac templates, post and story, TH / EN / ZH; every fillText /
//       strokeText recorded) prints the brand line and no URL; a QR matrix passed in is NOT drawn (info.qr false)
//   A5  switch on (test only): the footer becomes "<brand> · anirut77.github.io/lensiq/petread.html" (LINK without https) in the
//       model, cardText() and the drawn card, classic and zodiac; the QR is drawn again
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const LANGS = ["th", "en", "zh"];
const BRAND = { th: "จาก LENSIQ", en: "From LENSIQ", zh: "来自 LENSIQ" };
const ADDR = "anirut77.github.io/lensiq/petread.html";
const ZODIAC = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"];
const ALL = ZODIAC.concat(["secret"]);
const THEMES = ["sunny", "night", "mint", "blossom"];
const SIZES = ["post", "story"];
// a URL, a domain or a path to a page: anything a reader could type into a browser
const URLISH = /https?:|:\/\/|www\.|github|anirut77|\.html?\b|\/lensiq\b|\b[a-z0-9-]+\.(?:io|com|net|org|app|dev|co|th|ai|me|page|site|link|ly|xyz)\b/i;

const P = require("../../lensiq-pet.js");
const pet = (coat, sp = "cat") => ({ species: sp, name: "Mochi", traits: { coat, marks: [], eyes: "green", ears: "up", face: "round", size: "small",
  energy: "calm" }, birth: "2021-03-14", owner: null });

const setSwitch = v => { if (v === undefined) delete globalThis.LENSIQ_CARD_SHOW_ADDRESS; else globalThis.LENSIQ_CARD_SHOW_ADDRESS = v; };
const strings = m => Object.values(m).flatMap(v => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter(s => typeof s === "string") : []));

/* ---- a recording 2D canvas (no real drawing in Node) ---- */
function mockCanvas(texts) {
  const grad = { addColorStop() {} };
  const ctx = new Proxy({ canvas: null, font: "500 30px sans-serif", globalAlpha: 1 }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "fillText" || k === "strokeText") return s => { texts.push(String(s)); };
      if (k === "measureText") return s => { const px = parseInt((/(\d+)px/.exec(t.font) || [0, 30])[1], 10); return { width: String(s).length * px * 0.55,
        actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 }; };
      if (/^create(?:Linear|Radial|Conic)Gradient$/.test(k)) return () => grad;
      if (k === "createPattern") return () => ({});
      if (k === "getImageData" || k === "createImageData") return (a, b, w, h) => { const W2 = Math.max(1, Math.ceil(w || a || 1)), H2 = Math.max(1, Math.ceil(h || b || 1));
        return { width: W2, height: H2, data: new Uint8ClampedArray(W2 * H2 * 4) }; };
      if (k === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k === "isPointInPath" || k === "isPointInStroke") return () => false;
      if (k === "getLineDash") return () => [];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const cv = { width: 300, height: 150, style: {}, dataset: {}, getContext: () => ctx, toDataURL: () => "data:," };
  ctx.canvas = cv;
  return cv;
}
const texts = [];
globalThis.document = globalThis.document || { createElement: () => mockCanvas(texts), fonts: null };
const CARD = require("../../lensiq-pet-card.js");
globalThis.LQPetCard = globalThis.LQPetCard || CARD;
const ART = require("../../lensiq-pet-zodiac-art.js");
const DRAW = require("../../lensiq-pet-draw.js");
const QR = { n: 21, dark: (r, c) => (r + c) % 3 === 0 };

function drawn(model, opts, tpl) {
  texts.length = 0;
  const cv = mockCanvas(texts);
  const info = tpl ? ART.drawCard(cv, model, Object.assign({}, opts, { template: tpl, label: DRAW.label(tpl, model.lang) }))
    : CARD.draw(cv, model, opts);
  return { info, texts: texts.slice() };
}

test("A1 the switch: window.LENSIQ_CARD_SHOW_ADDRESS in lensiq-config.js, default false, true only when set first", () => {
  const src = read("lensiq-config.js");
  assert.match(src, /LENSIQ_CARD_SHOW_ADDRESS/, "lensiq-config.js names the switch");
  const run = pre => { const w = Object.assign({}, pre); const ctx = { window: w, document: { documentElement: { dataset: {} }, querySelector: () => null },
    location: { hostname: "example.org", search: "", pathname: "/petread.html", protocol: "https:" }, navigator: { userAgent: "" }, console };
    ctx.self = w; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx); return w.LENSIQ_CARD_SHOW_ADDRESS; };
  assert.equal(run({}), false, "default false");
  assert.equal(run({ LENSIQ_CARD_SHOW_ADDRESS: true }), true, "true when set before the config (test seam)");
  assert.equal(run({ LENSIQ_CARD_SHOW_ADDRESS: "yes" }), false, "only a real true turns it on");
});

test("A2 one address setting: LQPet.LINK; no other pet card file holds the site address", () => {
  assert.equal(P.LINK, "https://" + ADDR);
  for (const f of ["lensiq-pet-card.js", "lensiq-pet-draw.js", "lensiq-pet-zodiac-art.js", "lensiq-pet-kb.js", "petread.js", "i18n/en-petread.js",
    "i18n/zh-petread.js"]) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(s, /github\.io|anirut77/, f + " holds the site address (the one setting is LQPet.LINK)");
  }
  const s = read("lensiq-pet.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal((s.match(/anirut77\.github\.io/g) || []).length, 1, "lensiq-pet.js holds the address once (LINK)");
});

test("A3 switch off: model and text fallback carry the brand line only, no URL (classic + 13 templates, TH / EN / ZH)", () => {
  for (const sw of [undefined, false]) {
    setSwitch(sw);
    for (const lang of LANGS) for (const coat of ["orange", "black"]) {
      const res = P.compose(pet(coat), { lang });
      for (const tpl of [undefined].concat(ALL)) {
        const tag = `${lang} ${coat} ${tpl || "classic"} switch=${sw}`;
        const m = P.cardModel(res, { photo: false, template: tpl });
        assert.equal(m.from, BRAND[lang], tag + ": footer " + JSON.stringify(m.from));
        const t = P.cardText(m);
        assert.ok(t.includes(BRAND[lang]), tag + ": text fallback has the brand line");
        const bad = strings(m).concat(t).filter(x => URLISH.test(x));
        assert.deepEqual(bad, [], tag + ": URL on the card");
      }
    }
  }
  setSwitch(undefined);
});

test("A4 switch off: the drawn card prints the brand line and no URL; a QR matrix is not drawn", () => {
  setSwitch(undefined);
  for (const lang of LANGS) {
    const res = P.compose(pet("orange"), { lang });
    const runs = [];
    for (const theme of THEMES) for (const size of SIZES) runs.push({ theme, size });
    for (const tpl of ALL) for (const size of SIZES) runs.push({ tpl, size });
    for (const r of runs) {
      const tag = `${lang} ${r.tpl || r.theme} ${r.size}`;
      const m = P.cardModel(res, { photo: false, theme: r.theme, size: r.size, template: r.tpl });
      const d = drawn(m, { theme: r.theme, size: r.size, qr: QR }, r.tpl);
      assert.ok(d.texts.length >= 5, tag + ": text drawn");
      assert.ok(d.texts.some(x => x === BRAND[lang]), tag + ": brand footer drawn " + JSON.stringify(d.texts.slice(-3)));
      assert.deepEqual(d.texts.filter(x => URLISH.test(x)), [], tag + ": URL drawn");
      assert.equal(d.info.qr, false, tag + ": QR drawn while the switch is off");
    }
  }
});

test("A5 switch on (test only): footer = brand · address in model, text fallback and drawing; the QR returns", () => {
  setSwitch(true);
  try {
    for (const lang of LANGS) {
      const res = P.compose(pet("orange"), { lang }), want = BRAND[lang] + " · " + ADDR;
      for (const tpl of [undefined, "rat", "secret"]) for (const theme of tpl ? [undefined] : THEMES) {
        const tag = `${lang} ${tpl || theme}`;
        const m = P.cardModel(res, { photo: false, theme, template: tpl });
        assert.equal(m.from, want, tag + ": footer " + JSON.stringify(m.from));
        assert.ok(P.cardText(m).includes(want), tag + ": text fallback");
        const d = drawn(m, { theme, size: "post", qr: QR }, tpl);
        assert.ok(d.texts.includes(want), tag + ": drawn footer " + JSON.stringify(d.texts.slice(-3)));
        assert.equal(d.info.qr, true, tag + ": QR drawn with the switch on");
      }
    }
  } finally { setSwitch(undefined); }
});
