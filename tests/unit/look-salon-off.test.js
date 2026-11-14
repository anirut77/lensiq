"use strict";
// tests/unit/look-salon-off.test.js — owner decision 2026-11-14 (look suggestions, option ก): the 31 fixed look suggestions
// ship with the live preview; SALON MODE STAYS OFF until the human-approval step for salon-typed text exists
// (docs/BEAUTY-IMAGE-DESIGN.md §4). The approval step is not built. FIXED TEST SET: written and hash-locked
// (~/LENSIQ-field/evals/beauty-look/salon-off/, evals-locks/beauty-look.sha256) BEFORE the switch was added.
// Turning salon mode on later is an owner decision AND needs the approval step; this file is then replaced by a new locked
// set, never loosened.
//   O1 lensiq-config.js ships the switch hard off (window.LENSIQ_LOOK_SALON = false; a value set earlier cannot switch it on),
//      and no other shipped file assigns it
//   O2 LQLook.salonEnabled() is false by default, for every non-true value, and also when only the switch is true: it needs
//      the approval step too, which does not exist
//   O3 nothing in the shipped site calls the salon renderers (salonHTML / salonItem) or carries the salon block's markup or
//      wording, except lensiq-look.js itself
//   O4 no shipped page or script outside the look modules mentions a salon at all: there is no free-text salon input
//      (catalogue form, back-office field) anywhere
//   O5 the suggestions the page renders (suggest() + html()) never contain salon items, the salon label or salon wording
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join, relative } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const look = () => require("../../lensiq-look.js");
const LANGS = ["th", "en", "zh"];
const SALON_LABEL = { th: "ข้อความของร้าน ไม่ใช่คำแนะนำของ LENSIQ", en: "The salon's own text, not a LENSIQ suggestion", zh: "店家自己的文字，并非 LENSIQ 的建议" };
const SALON_TITLE = { th: "แบบจากแคตตาล็อกของร้าน", en: "From the salon's catalogue", zh: "店家目录中的款式" };

/** shipped files: .html / .js / .mjs / .cjs / .json at the root, in i18n/, backend/ and deploy/ (not tests, tools, docs,
 *  vendor, node_modules) */
function shipped() {
  const out = [];
  const walk = (/** @type {string} */ dir) => {
    for (const f of readdirSync(dir)) {
      if (f === "node_modules" || f.startsWith(".")) continue;
      const p = join(dir, f), st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(html|js|mjs|cjs|json|toml)$/.test(f)) out.push(p);
    }
  };
  for (const f of readdirSync(ROOT)) {
    const p = join(ROOT, f);
    if (statSync(p).isFile() && /\.(html|js|mjs|cjs|json)$/.test(f) && !/^(package(-lock)?\.json|eslint\.config\.mjs)$/.test(f)) out.push(p);
  }
  for (const d of ["i18n", "backend", "deploy"]) { try { walk(join(ROOT, d)); } catch (e) { /* folder missing */ } }
  return out.map(p => ({ rel: relative(ROOT, p).split("\\").join("/"), src: readFileSync(p, "utf8") }));
}

/** run fn with globalThis.LENSIQ_LOOK_SALON / LQLookSalonApproval set, then restore @param {any} on @param {any} appr @param {() => void} fn */
function withGlobals(on, appr, fn) {
  const G = /** @type {any} */ (globalThis);
  const had = { s: Object.prototype.hasOwnProperty.call(G, "LENSIQ_LOOK_SALON"), a: Object.prototype.hasOwnProperty.call(G, "LQLookSalonApproval") };
  const old = { s: G.LENSIQ_LOOK_SALON, a: G.LQLookSalonApproval };
  if (on === undefined) delete G.LENSIQ_LOOK_SALON; else G.LENSIQ_LOOK_SALON = on;
  if (appr === undefined) delete G.LQLookSalonApproval; else G.LQLookSalonApproval = appr;
  try { fn(); } finally {
    if (had.s) G.LENSIQ_LOOK_SALON = old.s; else delete G.LENSIQ_LOOK_SALON;
    if (had.a) G.LQLookSalonApproval = old.a; else delete G.LQLookSalonApproval;
  }
}

test("O1 lensiq-config.js ships salon mode hard off; nothing else assigns the switch", () => {
  const cfg = readFileSync(join(ROOT, "lensiq-config.js"), "utf8");
  assert.match(cfg, /^window\.LENSIQ_LOOK_SALON = false;$/m, "hard-off line (not `|| ...` / `=== true`, so an earlier value cannot switch it on)");
  assert.equal((cfg.match(/LENSIQ_LOOK_SALON\s*=(?!=)/g) || []).length, 1, "assigned exactly once in lensiq-config.js");
  const others = shipped().filter(f => f.rel !== "lensiq-config.js" && /LENSIQ_LOOK_SALON\s*=(?!=)/.test(f.src)).map(f => f.rel);
  assert.deepEqual(others, [], "no other shipped file assigns LENSIQ_LOOK_SALON");
});

test("O2 salonEnabled() is false by default, for non-true values, and with the switch alone (no approval step)", () => {
  const L = look();
  assert.equal(typeof L.salonEnabled, "function", "LQLook.salonEnabled exists");
  for (const v of [undefined, false, "true", 1, "1", "on", {}, null]) {
    withGlobals(v, undefined, () => assert.equal(L.salonEnabled(), false, "switch " + JSON.stringify(v)));
  }
  // the switch alone is not enough: the human-approval step for salon-typed text is required and is not built
  withGlobals(true, undefined, () => assert.equal(L.salonEnabled(), false, "switch true, no approval step"));
  // an approval object of the wrong shape does not count either
  for (const a of [true, 1, "yes", {}, { approved: true }]) {
    withGlobals(true, a, () => assert.equal(L.salonEnabled(), false, "switch true, approval " + JSON.stringify(a)));
  }
});

test("O3 no shipped page or script calls the salon renderers or carries the salon block, except lensiq-look.js", () => {
  const hits = [];
  for (const f of shipped()) {
    if (f.rel === "lensiq-look.js") continue;
    for (const re of [/salonHTML/, /salonItem/, /lq-look-salon/, /SALON_TEXT|SALON_LABEL/]) if (re.test(f.src)) hits.push(f.rel + " " + re);
    for (const l of LANGS) {
      if (f.src.includes(SALON_LABEL[l])) hits.push(f.rel + " salon label " + l);
      if (f.src.includes(SALON_TITLE[l])) hits.push(f.rel + " salon title " + l);
    }
  }
  assert.deepEqual(hits, []);
  // and lensiq-look.js's own page renderer (render) never calls the salon renderer
  const src = readFileSync(join(ROOT, "lensiq-look.js"), "utf8");
  const m = src.match(/function render\(container, R\) \{[\s\S]*?\n {2}\}\n/);
  assert.ok(m, "render() found");
  assert.ok(!/salonHTML|salonItem|lq-look-salon/.test(m[0]), "render() has no salon path");
});

test("O4 no free-text salon input anywhere: no shipped file outside the look modules mentions a salon", () => {
  // (not "แคตตาล็อกของร้าน" alone: Try-On uses it for a SHOP's product catalogue, which is not salon mode)
  const RE = /salon|ซาลอน|ร้านเสริมสวย|ร้านทำคิ้ว|美容院|发廊|店家目录/i;
  // the switch's own name (required by O1 in lensiq-config.js) is not a salon input; re-lock 2026-11-14, see the lock file
  const hits = shipped().filter(f => !/^lensiq-look(-lint)?\.js$/.test(f.rel) && RE.test(f.src.replace(/LENSIQ_LOOK_SALON/g, ""))).map(f => f.rel);
  assert.deepEqual(hits, []);
});

test("O5 rendered suggestions (suggest + html) never carry salon items, the salon label or salon wording", () => {
  const L = look();
  const CLS = [
    { brow: { cat: "straight" }, eye: { cat: "soft" }, nose: { cat: "balanced" }, mouth: { cat: "small", note: "level" }, yintang: { cat: "balanced" },
      chin: { cat: "pointed" }, zones: { dominant: null } },
    { brow: { cat: "arched" }, eye: { cat: "large" }, nose: { cat: "full" }, mouth: { cat: "full" }, yintang: { cat: "narrow" }, chin: { cat: "round" },
      zones: { dominant: "upper" } }
  ];
  for (const l of LANGS) {
    for (const c of CLS) {
      for (const el of ["", "wood", "fire", "earth", "metal", "water"]) {
        const items = L.suggest(c, { el, lang: l });
        assert.ok(items.length >= 1, l + " has suggestions");
        assert.ok(items.every(it => it.source !== "salon"), l + " no salon item");
        const h = L.html(items, l);
        assert.ok(!/lq-look-salon/.test(h), l + " no salon markup");
        for (const k of LANGS) assert.ok(!h.includes(SALON_LABEL[k]) && !h.includes(SALON_TITLE[k]), l + " no salon wording (" + k + ")");
        assert.ok(!/<input(?![^>]*type="?checkbox)|<textarea|contenteditable/i.test(h), l + " no free-text input in the suggestions");
      }
    }
  }
});
