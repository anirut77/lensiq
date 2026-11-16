"use strict";
// tests/unit/fortune-paid-negstate.test.js — FIXED TEST SET, round-3 independent review of fortune-paid at 826bbd9 (NOT OK):
// a negative state plus what to do about it (worry, fragility, difficulty, being too hard on yourself …) sat in the TOPIC
// meanings of items that are not cautions and was paid-only (80 / 2,700 readings). Rule (a): warnings and what to do about them
// stay free. Fix at the data level, by reading: fortune-negstate.js tags, per discipline, every item meaning area that describes a
// negative state, a worry or a difficulty with its coping advice; tagged areas are never paid. Locked (evals-locks/
// fortune-paid.sha256, re-lock (7)) BEFORE the tags and the fix.
//   N1  the table covers all 15 disciplines (each reviewed, with its date) and tags the reviewer's examples (dream teeth / falling,
//       numbers pair 75 personality)
//   N2  by provenance: 0 paid parts hold text from a tagged area, >= 2,000 readings, every discipline, TH / EN / ZH, both modes
//   N3  every tagged id is a real fact id of that discipline; switch off: same object
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const P = require("../../fortune-paid.js");
const NS = require("../../fortune-negstate.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");
const LANGS = ["th", "en", "zh"];
const itemOf = (dom, it, l) => { try { return (l === "en" ? FA.en.item(dom, it) : l === "zh" ? FA.zh.item(dom, it) : it) || it; } catch (e) { return it; } };
function fragments(m, l) {
  m = String(m || "").trim();
  if (l === "zh") return m.split(/[，。；！？、：:]/).map(x => x.trim()).filter(x => x.length >= 8);
  if (l === "en") return m.split(/[,;:.!?]\s+|\s+(?:and|but|so|or)\s+/).map(x => x.trim().toLowerCase()).filter(x => x.length >= 25);
  return m.split(/\s+/).filter(x => x.length >= 14);
}
const has = (t, q, l) => (l === "en" ? String(t).toLowerCase().includes(q) : String(t).includes(q));
const areasOf = (d, it) => { const t = NS.of(d, it); return t === "all" ? "all" : Array.isArray(t) ? t : []; };

let CORPUS = null;
async function corpus() {
  if (CORPUS) return CORPUS;
  const X = await exportTool();
  const out = [];
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const straight of [false, true]) {
    const r = X.lcg(91919 + X.DOMAINS.indexOf(d) * 47 + (straight ? 19 : 0) + LANGS.indexOf(lang) * 911);
    let got = 0;
    for (let i = 0; i < 300 && got < 25; i++) {
      let f; try { f = X.factsFor(d, i + 9000, r); } catch (e) { continue; }
      const res = FA.compose(f, { seed: 73000 + i * 17, lang, straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      got++;
      const src = [];
      for (const it of f.items || []) {
        const a = areasOf(f.domain || d, it); if (!a.length && a !== "all") continue;
        const ms = (itemOf(f.domain || d, it, lang) || {}).meanings || {};
        for (const k of a === "all" ? Object.keys(ms) : a) src.push(...[].concat(ms[k] || []).map(String));
      }
      out.push({ d, lang, straight, f, res, g: [...new Set(src.flatMap(m => fragments(m, lang)))] });
    }
  }
  CORPUS = out;
  return out;
}

test("N1: every discipline reviewed by reading (dated), the reviewer's examples tagged", async () => {
  const X = await exportTool();
  for (const d of X.DOMAINS) assert.match(String((NS.REVIEWED || {})[d] || ""), /^2026-\d\d-\d\d/, d + ": not reviewed");
  const tagged = (d, id, area) => { const a = areasOf(d, { id }); return a === "all" || a.includes(area); };
  assert.ok(tagged("dream", "sym.teeth", "overview") || tagged("dream", "sym.teeth", "work") || tagged("dream", "sym.teeth", "love"), "dream teeth");
  assert.ok(tagged("dream", "sym.fall", "work"), "dream falling: work");
  assert.ok(tagged("numbers", "pair.75", "personality"), "numbers pair 75: personality");
  assert.ok(NS.count() >= 100, "areas tagged " + NS.count());
});

test("N2: 0 paid parts hold text from a negative-state area (provenance), >= 2,000 readings", async () => {
  const C = await corpus();
  assert.ok(C.length >= 2000, "readings " + C.length);
  assert.ok(C.filter(x => x.g.length).length >= 200, "readings with a tagged area " + C.filter(x => x.g.length).length);
  const bad = []; let readings = 0;
  for (const x of C) {
    const o = globalThis.LENSIQ_FORTUNE_PAID; globalThis.LENSIQ_FORTUNE_PAID = true;
    let sp; try { sp = P.split(x.res, { lang: x.lang, straight: x.straight }); } finally { globalThis.LENSIQ_FORTUNE_PAID = o; }
    let any = false;
    for (const g of sp.groups) for (const t of g.paid) {
      const q = x.g.find(q => has(t, q, x.lang));
      if (q) { any = true; if (bad.length < 30) bad.push(`${x.d} ${x.lang} ${x.straight ? "S" : "G"} ${g.id} […${q.slice(0, 40)}] ${t.slice(0, 100)}`); }
    }
    if (any) readings++;
  }
  assert.equal(readings, 0, readings + " readings with negative-state text in paid parts:\n" + bad.join("\n"));
});

test("N3: every tagged id is a fact id the discipline produces; switch off: same object", async () => {
  const C = await corpus();
  const X = await exportTool();
  const seen = {};
  for (const d of X.DOMAINS) {
    seen[d] = new Set(); const r = X.lcg(4141 + X.DOMAINS.indexOf(d));
    for (let i = 0; i < 1500; i++) { let f; try { f = X.factsFor(d, i, r); } catch (e) { continue; } for (const it of f.items || []) seen[d].add(NS.key(f.domain || d, it.id)); }
  }
  for (const [d, ids] of Object.entries(NS.ids())) for (const id of ids) if (!id.includes("*")) assert.ok(seen[d] && seen[d].has(id), `${d}: unknown id ${id}`);
  for (const x of C.slice(0, 200)) assert.equal(P.apply(x.res, { lang: x.lang }), x.res, "off: same object");
});

test("N4 (round-3 smaller fix): the funnel names are on the client and Worker allowlists, so the consent-gated counts are kept", () => {
  const client = fs.readFileSync(path.join(ROOT, "lensiq-analytics.js"), "utf8"), worker = fs.readFileSync(path.join(ROOT, "backend", "src", "constants.js"), "utf8");
  for (const st of ["overview", "open", "tap", "paid"]) {
    assert.ok(client.includes(`"fortune.paid.${st}"`), "lensiq-analytics.js allowlist: fortune.paid." + st);
    assert.ok(worker.includes(`"fortune.paid.${st}"`), "backend/src/constants.js allowlist: fortune.paid." + st);
  }
  assert.match(client, /function active\(\) \{ return !!api\(\) && !dnt\(\) && consent\(\) === "yes"; \}/, "analytics still sends only with consent");
});
