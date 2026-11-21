"use strict";
// tests/unit/pet-kb-lint-209.test.js — owner item 209 (2026-11-21 09:10): the black-cat "โกญจา" line in lensiq-pet-kb.js
// said "ควรรักษาไว้"; "รักษา" is in the health filter of lensiq-pet.js (LINT), so compose() dropped the line silently in
// Thai and the "ภาพรวม" (overview) section vanished. Owner wording: "ควรเลี้ยงดูไว้ให้ดี".
// Locked BEFORE the fix (evals-locks/pet-kb-lint-209.sha256).
//   K1 every string of the reading content (lensiq-pet-kb.js, every leaf under a th / en / zh key) passes the page's own
//      filter LQPet.lint in its language: 0 lines dropped, in TH, EN and ZH
//   K2 the black "โกญจา" line carries the owner's exact wording, and the old word is gone
//   K3 compose(): every folk line reaches the reader; the overview section is present in TH / EN / ZH for every folk
//      entry (and for a plain black cat in particular)
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const P = require(path.join(ROOT, "lensiq-pet.js"));
const KB = require(path.join(ROOT, "lensiq-pet-kb.js"));
const LANGS = ["th", "en", "zh"];

/** every string leaf under a th / en / zh key -> [path, lang, text] */
function lines(o, at = "KB", lang = null, out = []) {
  if (typeof o === "string") { if (lang) out.push([at, lang, o]); return out; }
  if (Array.isArray(o)) { o.forEach((x, i) => lines(x, `${at}[${i}]`, lang, out)); return out; }
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) lines(v, `${at}.${k}`, LANGS.includes(k) ? k : lang, out);
  return out;
}

test("K1 every reading-content line passes the page's own filter: 0 dropped in TH / EN / ZH", () => {
  assert.equal(P.KB, KB, "the page reads this content file");
  const all = lines(KB);
  for (const l of LANGS) assert.ok(all.filter(x => x[1] === l).length >= 150, l + ": content lines found: " + all.filter(x => x[1] === l).length);
  const dropped = all.filter(([, lang, t]) => P.lint(t, lang).length).map(([p, lang, t]) => `${p} (${lang}: ${P.lint(t, lang)[0]}): ${t.slice(0, 100)}`);
  assert.deepEqual(dropped, [], "lines the filter would drop");
});

test("K2 the โกญจา line carries the owner wording", () => {
  const f = KB.folk.find(x => x.sp === "cat" && x.coat === "black" && !x.mark);
  assert.ok(f, "plain black cat folk line");
  assert.ok(f.th.includes("โกญจา"));
  assert.ok(f.th.includes("ควรเลี้ยงดูไว้ให้ดี"), "owner wording: " + f.th);
  assert.ok(!f.th.includes("รักษา"), "old word gone: " + f.th);
  assert.match(f.en, /Konja/); assert.match(f.zh, /贡嘉/);
  for (const l of LANGS) assert.deepEqual(P.lint(f[l], l), [], l);
});

test("K3 compose(): every folk line reaches the reader and the overview section is there, TH / EN / ZH", () => {
  for (const f of KB.folk) {
    const traits = { coat: f.coat || (f.sp === "dog" ? "brown" : "tabby"), marks: f.mark ? [f.mark] : [] };
    for (const lang of LANGS) {
      const r = P.compose({ species: f.sp, traits }, { lang });
      // the first folk entry matching these traits is the one shown; only test the entry when it is that one
      const first = KB.folk.find(g => g.sp === f.sp && (!g.coat || g.coat === traits.coat) && (!g.mark || traits.marks.includes(g.mark)));
      if (first !== f) continue;
      const ov = r.sections.find(s => s.id === "overview");
      assert.ok(ov, `${lang} ${f.sp}/${traits.coat}/${traits.marks.join("+")}: overview section present`);
      assert.ok(ov.paragraphs.join(" ").includes(f[lang].slice(0, 20)), `${lang}: the folk line is in the overview`);
    }
  }
  for (const lang of LANGS) {
    const r = P.compose({ species: "cat", traits: { coat: "black", marks: [] } }, { lang });
    const ov = r.sections.find(s => s.id === "overview");
    assert.ok(ov && ov.paragraphs.length === 1, lang + ": plain black cat has its overview");
    assert.equal(r.sections[0].id, "overview", lang + ": overview first");
  }
  const th = P.compose({ species: "cat", traits: { coat: "black", marks: [] } }, { lang: "th" });
  assert.ok(th.sections[0].paragraphs[0].includes("ควรเลี้ยงดูไว้ให้ดี"));
});
