"use strict";
// tests/unit/pet-card-brand.test.js — FIXED TEST SET, owner decision 184 ก + coordinator order 2026-11-20: the brand name on the
// pet share card comes from ONE setting, like the address (the brand may change, and a shared card cannot be corrected).
// window.LENSIQ_CARD_BRAND in lensiq-config.js (default "LENSIQ"); the footer is "จาก <brand>" / "From <brand>" / "来自 <brand>"
// in every zodiac template, the 4 classic themes and the save-image / text fallback; the card's brand header follows it too.
// Locked (evals-locks/pet-card-address.sha256, folder relock-1/) together with the re-locks of decision 184 ก, BEFORE the
// product change. Synthetic inputs only. Companion: tests/unit/pet-card-address.test.js (same recording canvas).
//   N1  the setting: lensiq-config.js sets window.LENSIQ_CARD_BRAND, default "LENSIQ", a non-empty string set first is kept
//   N2  one setting: the card files hold no brand literal of their own (lensiq-pet-card.js, lensiq-pet-zodiac-art.js, petread.js:
//       none; lensiq-pet.js and lensiq-pet-draw.js: one fallback each, for Node without the config). The page's own title
//       (i18n pet.doc.title) is not the card and is out of scope (no other brand-rename work)
//   N3  changing the setting changes every card: with the brand set to a test name, for TH / EN / ZH, the classic model and all
//       13 templates: footer = "<from word> <test name>", the text fallback has it, and no string of the model, the text
//       fallback or the drawn card (4 themes + 13 templates, post / story) says "LENSIQ"; LQPetDraw.FROM follows the setting
//   N4  the same with the address switch on: footer = "<from word> <test name> · <address>"
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const LANGS = ["th", "en", "zh"];
const WORD = { th: "จาก", en: "From", zh: "来自" };
const ADDR = "anirut77.github.io/lensiq/petread.html";
const ZODIAC = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"];
const ALL = ZODIAC.concat(["secret"]);
const THEMES = ["sunny", "night", "mint", "blossom"];
const SIZES = ["post", "story"];
const TEST_BRAND = "Zephyra Pets";
const code = f => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const brandLiterals = s => (s.match(/["'`][^"'`\n]*\bLENSIQ\b(?!_)[^"'`\n]*["'`]/g) || []);

const P = require("../../lensiq-pet.js");
const pet = coat => ({ species: "cat", name: "Mochi", traits: { coat, marks: [], eyes: "green", ears: "up", face: "round", size: "small",
  energy: "calm" }, birth: "2021-03-14", owner: null });
const strings = m => Object.values(m).flatMap(v => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter(s => typeof s === "string") : []));

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
  const info = tpl ? ART.drawCard(cv, model, Object.assign({}, opts, { template: tpl, label: DRAW.label(tpl, model.lang) })) : CARD.draw(cv, model, opts);
  return { info, texts: texts.slice() };
}
const freshDraw = () => { delete require.cache[require.resolve("../../lensiq-pet-draw.js")]; return require("../../lensiq-pet-draw.js"); };
function withBrand(b, show, fn) {
  globalThis.LENSIQ_CARD_BRAND = b; if (show) globalThis.LENSIQ_CARD_SHOW_ADDRESS = true;
  try { return fn(); } finally { delete globalThis.LENSIQ_CARD_BRAND; delete globalThis.LENSIQ_CARD_SHOW_ADDRESS; }
}

test("N1 the setting: window.LENSIQ_CARD_BRAND in lensiq-config.js, default \"LENSIQ\", a non-empty string set first is kept", () => {
  const src = read("lensiq-config.js");
  assert.match(src, /LENSIQ_CARD_BRAND/, "lensiq-config.js names the brand setting");
  const run = pre => { const w = Object.assign({}, pre); const ctx = { window: w, document: { documentElement: { dataset: {} }, querySelector: () => null },
    location: { hostname: "example.org", search: "", pathname: "/petread.html", protocol: "https:" }, navigator: { userAgent: "" }, console };
    ctx.self = w; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx); return w.LENSIQ_CARD_BRAND; };
  assert.equal(run({}), "LENSIQ", "default");
  assert.equal(run({ LENSIQ_CARD_BRAND: TEST_BRAND }), TEST_BRAND, "a brand set before the config is kept (test seam)");
  assert.equal(run({ LENSIQ_CARD_BRAND: "" }), "LENSIQ", "an empty value falls back to the default");
});

test("N2 one setting: no brand literal in the card files (one Node fallback each in lensiq-pet.js and lensiq-pet-draw.js)", () => {
  for (const f of ["lensiq-pet-card.js", "lensiq-pet-zodiac-art.js", "petread.js"])
    assert.deepEqual(brandLiterals(code(f)), [], f + " holds its own brand text");
  for (const f of ["lensiq-pet.js", "lensiq-pet-draw.js"]) {
    const lits = brandLiterals(code(f));
    assert.deepEqual(lits, ['"LENSIQ"'], f + ": exactly one bare fallback \"LENSIQ\", got " + JSON.stringify(lits));
  }
});

test("N3 changing the setting changes every card: model, text fallback and drawing (classic + 13 templates, TH / EN / ZH)", () => {
  withBrand(TEST_BRAND, false, () => {
    const D = freshDraw();
    for (const l of LANGS) assert.equal(D.FROM[l], WORD[l] + " " + TEST_BRAND, "LQPetDraw.FROM." + l);
    for (const lang of LANGS) {
      const res = P.compose(pet("orange"), { lang }), want = WORD[lang] + " " + TEST_BRAND;
      const runs = [];
      for (const theme of THEMES) for (const size of SIZES) runs.push({ theme, size });
      for (const tpl of ALL) for (const size of SIZES) runs.push({ tpl, size });
      for (const r of runs) {
        const tag = `${lang} ${r.tpl || r.theme} ${r.size}`;
        const m = P.cardModel(res, { photo: false, theme: r.theme, size: r.size, template: r.tpl });
        assert.equal(m.from, want, tag + ": footer " + JSON.stringify(m.from));
        const t = P.cardText(m);
        assert.ok(t.includes(want), tag + ": text fallback");
        const d = drawn(m, { theme: r.theme, size: r.size, qr: QR }, r.tpl);
        assert.ok(d.texts.includes(want), tag + ": drawn footer " + JSON.stringify(d.texts.slice(-3)));
        assert.deepEqual(strings(m).concat(t, d.texts).filter(x => /LENSIQ/.test(x)), [], tag + ": the old brand is left on the card");
      }
    }
  });
  freshDraw();
});

test("N4 the same with the address switch on: footer = <from word> <brand> · <address>", () => {
  withBrand(TEST_BRAND, true, () => {
    for (const lang of LANGS) for (const tpl of [undefined, "rat", "secret"]) {
      const want = WORD[lang] + " " + TEST_BRAND + " · " + ADDR, tag = `${lang} ${tpl || "classic"}`;
      const m = P.cardModel(P.compose(pet("black"), { lang }), { photo: false, template: tpl });
      assert.equal(m.from, want, tag + ": footer");
      assert.ok(P.cardText(m).includes(want), tag + ": text fallback");
      const d = drawn(m, { size: "post", qr: QR }, tpl);
      assert.ok(d.texts.includes(want), tag + ": drawn footer");
      assert.deepEqual(strings(m).concat(P.cardText(m), d.texts).filter(x => /LENSIQ/.test(x)), [], tag + ": the old brand is left on the card");
    }
  });
});
