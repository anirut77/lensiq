"use strict";
// tests/unit/fortune-paid-d123.test.js — FIXED TEST SET, independent review of fortune-paid at c28f96c (PASS for merge with
// every switch off; three defects before any go-live). Locked (evals-locks/fortune-paid.sha256, re-lock (10)) BEFORE the fix.
//   D1  a 49 group offer never follows a caution or guidance part directly (the part right before it in the page: the read-more
//       button when free folded text remains, otherwise the group's last shown part); every group offer carries the
//       "not a remedy / ไม่ใช่การแก้เคล็ด / 不是化解" line in TH / EN / ZH
//   D2  belief guidance in topic meanings is free: zodiac "support" (คู่เสริมดวง), dream sym.ancestor overview (merit), horoscope
//       bazi.useful.* (ธาตุเสริม) — tagged as guidance data (fortune-negstate.js GUIDE) and never paid (provenance)
//   D3  sample seed entries never appear in a plan, and a plan keeps an entry's own title as written
//   off the guidance marks are additive only: with the switch off the composed reading and its HTML are byte-identical to the
//       same reading composed without fortune-straight.js markGuidance
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const FS = require("../../fortune-straight.js");
const RD = require("../../fortune-read.js");
const P = require("../../fortune-paid.js");
const NS = require("../../fortune-negstate.js");
const SAMPLES = require("../../lensiq-merit-seed.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");
const LANGS = ["th", "en", "zh"];
const on = (fn, plan) => { const a = globalThis.LENSIQ_FORTUNE_PAID, b = globalThis.LENSIQ_FORTUNE_PLAN; globalThis.LENSIQ_FORTUNE_PAID = true;
  globalThis.LENSIQ_FORTUNE_PLAN = !!plan; try { return fn(); } finally { globalThis.LENSIQ_FORTUNE_PAID = a; globalThis.LENSIQ_FORTUNE_PLAN = b; } };
const itemOf = (dom, it, l) => { try { return (l === "en" ? FA.en.item(dom, it) : l === "zh" ? FA.zh.item(dom, it) : it) || it; } catch (e) { return it; } };
const flat = x => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === "object" ? Object.values(x).flatMap(flat) : typeof x === "string" ? [x] : []);
function fragments(m, l) {
  m = String(m || "").trim();
  if (l === "zh") return m.split(/[，。；！？、：:]/).map(x => x.trim()).filter(x => x.length >= 8);
  if (l === "en") return m.split(/[,;:.!?]\s+|\s+(?:and|but|so|or)\s+/).map(x => x.trim().toLowerCase()).filter(x => x.length >= 25);
  return m.split(/\s+/).filter(x => x.length >= 14);
}
const has = (t, q, l) => (l === "en" ? String(t).toLowerCase().includes(q) : String(t).includes(q));
const PLACEMENT = /^(?:dir|rec|room|photo|year|month)\./;
const isCaut = (it, st) => it.tone === "caution" || it.polarity === "challenge" || (st && FA.straight.LABEL_NEG.test(String(it.label || "")));
const leads = l => [...new Set(flat(FA.straight.LEADS[l]).concat(flat((FA.straight.NATAL_LEADS || {})[l]), flat(FA._internal.cautionLeads(l))))]
  .map(s => s.replace(/[.。]$/, "")).filter(s => s.length >= 10);

let CORPUS = null;
async function corpus() {
  if (CORPUS) return CORPUS;
  const X = await exportTool();
  const out = [];
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const straight of [false, true]) {
    const r = X.lcg(51515 + X.DOMAINS.indexOf(d) * 53 + (straight ? 23 : 0) + LANGS.indexOf(lang) * 1009);
    let got = 0;
    for (let i = 0; i < 300 && got < 24; i++) {
      let f; try { f = X.factsFor(d, i + 80000, r); } catch (e) { continue; }
      const res = FA.compose(f, { seed: 41000 + i * 19, lang, straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      got++;
      const dom = f.domain || d, risk = [];
      for (const it of f.items || []) {
        const ms = (itemOf(dom, it, lang) || {}).meanings || {};
        if (isCaut(it, straight) || (dom === "fengshui" && PLACEMENT.test(String(it.id || "")))) risk.push(...Object.values(ms).flatMap(flat));
        else risk.push(...[].concat(ms.advice || []));
        const na = NS.of(dom, it); if (na) for (const a of na) risk.push(...[].concat(ms[a] || []));
      }
      for (const k of ["luckyColors", "directions", "energyWords", "tips"]) risk.push(...flat((f.extras || {})[k]));
      risk.push(...((res.plan && res.plan.items) || []).map(x => String(x.t || "")));
      out.push({ d, dom, lang, straight, f, res, risk: [...new Set(risk.flatMap(m => fragments(m, lang)))] });
    }
  }
  CORPUS = out;
  return out;
}

test("D1: every group offer carries the not-a-remedy line (TH / EN / ZH)", async () => {
  assert.match(P.TEXT.th.notRemedy, /ไม่ใช่การแก้เคล็ด/); assert.match(P.TEXT.en.notRemedy, /not a remedy/i); assert.match(P.TEXT.zh.notRemedy, /不是化解/);
  const C = await corpus();
  let n = 0;
  for (const x of C.slice(0, 800)) {
    const sp = on(() => P.split(x.res, { lang: x.lang, straight: x.straight }));
    for (const o of on(() => P.offers(sp, x.lang, {})).filter(o => o.plan === "group")) { n++; assert.equal(o.note, P.TEXT[x.lang].notRemedy, "note on the offer"); }
  }
  assert.ok(n >= 200, "group offers checked " + n);
});

test("D1: no group offer directly after a caution or guidance part (>= 2,000 readings, provenance + composer caution marks)", async () => {
  const C = await corpus();
  assert.ok(C.length >= 2000, "readings " + C.length);
  const L = Object.fromEntries(LANGS.map(l => [l, leads(l)]));
  const bad = []; let offers = 0;
  for (const x of C) {
    const sp = on(() => P.split(x.res, { lang: x.lang, straight: x.straight }));
    const ids = new Set(on(() => P.offers(sp, x.lang, {})).filter(o => o.plan === "group").map(o => o.group));
    x.res.sections.forEach((s, k) => {
      if (!ids.has(s.id)) return;
      offers++;
      const parts = RD.planSection(s, x.lang), g = sp.groups[k];
      if (parts.some(p => !p.visible && g.free.includes(p.text))) return; // the read-more button sits right before the offer
      const last = parts.filter(p => p.visible).pop();
      const why = (last.caution ? "caution-marked" : "") || L[x.lang].find(q => last.text.includes(q)) || x.risk.find(q => has(last.text, q, x.lang)) ||
        (P.TEXT && RD.adviceKinds(last.text, x.lang).length ? "advice box" : "");
      if (why && bad.length < 25) bad.push(`${x.d} ${x.lang} ${s.id} [${String(why).slice(0, 40)}] ${last.text.slice(0, 90)}`);
      if (why) bad.n = (bad.n || 0) + 1;
    });
  }
  assert.ok(offers >= 300, "group offers " + offers);
  assert.equal(bad.n || 0, 0, (bad.n || 0) + " group offers right after a caution / guidance part:\n" + bad.join("\n"));
});

test("D2: zodiac support, dream sym.ancestor overview and horoscope bazi.useful.* are guidance data and never paid", async () => {
  assert.equal(typeof NS.guideOf, "function", "guidance tags in fortune-negstate.js");
  assert.ok(NS.guideOf("zodiac", { id: "support" }), "zodiac support tagged");
  assert.ok(NS.guideOf("dream", { id: "sym.ancestor" }), "dream ancestor tagged");
  assert.ok(NS.guideOf("horoscope", { id: "bazi.useful.wood" }), "horoscope useful element tagged");
  const C = await corpus();
  const bad = []; let seen = 0;
  for (const x of C.filter(c => ["zodiac", "dream", "horoscope"].includes(c.dom))) {
    const src = [];
    for (const it of x.f.items || []) {
      const a = NS.guideOf(x.dom, it); if (!a) continue;
      const ms = (itemOf(x.dom, it, x.lang) || {}).meanings || {};
      for (const k of a === "all" ? Object.keys(ms) : a) src.push(...[].concat(ms[k] || []));
    }
    if (!src.length) continue;
    seen++;
    const fr = [...new Set(src.flatMap(m => fragments(m, x.lang)))];
    const sp = on(() => P.split(x.res, { lang: x.lang, straight: x.straight }));
    for (const g of sp.groups) for (const t of g.paid) { const q = fr.find(q => has(t, q, x.lang)); if (q && bad.length < 20) bad.push(`${x.d} ${x.lang} ${g.id} […${q.slice(0, 40)}]`); }
  }
  assert.ok(seen >= 30, "readings with such items " + seen);
  assert.equal(bad.length, 0, bad.join("\n"));
});

test("D3: sample entries never in a plan; a plan keeps an entry's own title", () => {
  const f = { domain: "zodiac", items: [], extras: {} }, res = { lang: "th", sections: [{ id: "overview", paragraphs: ["ก"] }] };
  assert.equal(on(() => P.planFor("work", { facts: f, res, lang: "th", items: SAMPLES }), true), null, "only sample entries: no plan");
  assert.equal(P.planItems(SAMPLES).length, 0, "planItems drops every sample entry");
  const own = SAMPLES.map(s => Object.assign({}, s, { sample: false }));
  const pl = on(() => P.planFor("work", { facts: f, res, lang: "th", items: own }), true);
  assert.ok(pl, "non-sample published entries make a plan");
  const off = own.find(s => s.type === "offering" && (s.keys || []).includes("any"));
  assert.ok(pl.steps.some(st => st.text.includes(off.title.th)), "the entry's title as written (not stripped): " + off.title.th);
});

test("off: guidance marks are additive only; the reading and its HTML are byte-identical without them", async () => {
  const X = await exportTool();
  const keep = FS.markGuidance;
  let n = 0;
  try {
    for (const d of X.DOMAINS) for (const lang of LANGS) {
      const r1 = X.lcg(707 + X.DOMAINS.indexOf(d)), r2 = X.lcg(707 + X.DOMAINS.indexOf(d));
      for (let i = 0; i < 4; i++) {
        let f1, f2; try { f1 = X.factsFor(d, i + 90000, r1); f2 = X.factsFor(d, i + 90000, r2); } catch (e) { continue; }
        FS.markGuidance = keep; const a = FA.compose(f1, { seed: 3 + i, lang });
        FS.markGuidance = undefined; const b = FA.compose(f2, { seed: 3 + i, lang });
        FS.markGuidance = keep;
        if (d === "zodiac") continue; // zodiac readings depend on today's date in both runs
        // heading ids come from a page-wide counter (fa-h-1, fa-h-2 …): numbered afresh in each HTML before comparing
        const ids = h => { let k = 0; const m = new Map(); return h.replace(/fa-h-\d+/g, x => (m.has(x) ? m.get(x) : (m.set(x, "fa-h-" + ++k), m.get(x)))); };
        const ha = ids(FA.toHTML(a)), hb = ids(FA.toHTML(b));
        for (const s of a.sections || []) delete s.guidance;
        assert.deepEqual(a, b, `${d} ${lang}: composed reading differs beyond the marks`);
        assert.equal(ha, hb, `${d} ${lang}: HTML differs`);
        n++;
      }
    }
  } finally { FS.markGuidance = keep; }
  assert.ok(n >= 100, "readings compared " + n);
});
