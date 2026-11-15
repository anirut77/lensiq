"use strict";
// tests/unit/fortune-paid.test.js — FIXED TEST SET, owner order 2026-11-15 "paid depth for fortune readings" (design only, OFF).
// Locked (evals-locks/fortune-paid.sha256, ~/LENSIQ-field/evals/fortune-paid/) BEFORE any product code was written.
// Design: docs/FORTUNE-PAID-DESIGN.md. The DOM half (crisis state, purchase controls in a real browser) is
// tests/e2e/fortune-paid.e2e.mjs.
// Free = an overview of every group (the main point, every caution in full, every piece of guidance); paid = the in-depth
// text of a group (what the shared layout puts behind "read more"). The switch: window.LENSIQ_FORTUNE_PAID === true, default
// false. It is switched on in these tests only.
//   (a) the free part never states a caution whose remedy or guidance exists only in paid text; a paid part never brings a
//       caution of its own (ground truth independent of the module: every tail of every caution lead the composer can use,
//       fragments of the meanings of every item the facts mark unfavourable, the improvement plan's items, the advice group)
//   (b) crisis: no offer, no price, nothing locked (pure half; the DOM half is in the e2e file)
//   (c) every offer carries its price and the list of headings the person will get (pure half; DOM half in the e2e file)
//   (d) the hard-limit filters run on paid text, with the same test corpus as free text (the HARD / PLAIN sets of the locked
//       tests/unit/fortune-honest.test.js, read from that file)
//   off: with the switch off the result is the same object, unchanged, and nothing is drawn
// Corpus: all 15 disciplines × TH / EN / ZH × gentle and straight, fact sets with at least one unfavourable item, >= 2,000 readings.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const RD = require("../../fortune-read.js");
const P = require("../../fortune-paid.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");
const LANGS = ["th", "en", "zh"];
const PRICES = { group: 49, full: 99, year: 199, plus: 149 }; // owner order 2026-11-15 (approved list, THB, VAT included)
const CURRENCY = { th: /บาท/, en: /THB|baht/i, zh: /泰铢/ };

function withSwitch(on, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "LENSIQ_FORTUNE_PAID"), old = globalThis.LENSIQ_FORTUNE_PAID;
  globalThis.LENSIQ_FORTUNE_PAID = on;
  try { return fn(); } finally { if (had) globalThis.LENSIQ_FORTUNE_PAID = old; else delete globalThis.LENSIQ_FORTUNE_PAID; }
}

/* ---------------- ground truth (independent of fortune-paid.js) ---------------- */
const flat = x => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === "object" ? Object.values(x).flatMap(flat) : typeof x === "string" ? [x] : []);
const leadsOf = l => [...new Set(flat(FA.straight.LEADS[l]).concat(flat((FA.straight.NATAL_LEADS || {})[l]), flat(FA._internal.cautionLeads(l))))]
  .map(s => s.replace(/[.。]$/, "")).filter(s => s.length >= 6);
function tailsOf(l) {
  const out = new Set(), min = l === "zh" ? 6 : 14, re = l === "zh" ? /[，,]/g : l === "en" ? /, | /g : / /g;
  for (const lead of leadsOf(l)) {
    if (lead.length >= min) out.add(lead);
    let m; re.lastIndex = 0;
    while ((m = re.exec(lead))) { const t = lead.slice(m.index + m[0].length); if (t.length >= min) out.add(t); }
  }
  return [...out];
}
function fragments(m, l) {
  m = String(m || "").trim();
  if (l === "zh") return m.split(/[，。；！？、]/).map(x => x.trim()).filter(x => x.length >= 8);
  if (l === "en") return m.split(/[,;:.!?]\s+|\s+(?:and|but|so)\s+/).map(x => x.trim()).filter(x => x.length >= 25);
  return m.split(/\s+/).filter(x => x.length >= 15);
}
function has(text, q, l) {
  if (l !== "en") return text.includes(q);
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) if (!/[A-Za-z]/.test(text.charAt(i + q.length))) return true;
  return false;
}
const isCautionItem = (it, straight) => it.tone === "caution" || it.polarity === "challenge" || (straight && FA.straight.LABEL_NEG.test(String(it.label || "")));
const srcOf = (domain, it, l) => (l === "en" ? FA.en.item(domain, it) : l === "zh" ? FA.zh.item(domain, it) : it);
const meaningsOf = (domain, it, l, advice) => {
  const ms = ((srcOf(domain, it, l) || {}).meanings) || {};
  return Object.keys(ms).filter(k => (advice ? k === "advice" : k !== "advice")).flatMap(k => [].concat(ms[k] || []));
};

let CORPUS = null;
async function corpus() {
  if (CORPUS) return CORPUS;
  const X = await exportTool();
  const out = [];
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const straight of [false, true]) {
    const r = X.lcg(8151 + X.DOMAINS.indexOf(d) * 13 + (straight ? 5 : 0) + LANGS.indexOf(lang) * 97);
    let got = 0;
    for (let i = 0; i < 400 && got < 24; i++) {
      let f; try { f = X.factsFor(d, i, r); } catch (e) { continue; }
      // engines that never mark a finding unfavourable get one real item marked as caution (same probe as the layout tests)
      if (!(f.items || []).some(it => isCautionItem(it, straight))) {
        const ok = it => it.kind !== "plain" && Object.keys(it.meanings || {}).some(m => m !== "advice");
        let k = (f.items || []).findIndex((it, j) => j > 0 && ok(it)); if (k < 0) k = (f.items || []).findIndex(ok);
        if (k < 0) continue;
        f = Object.assign({}, f, { items: f.items.map((it, j) => (j === k ? Object.assign({}, it, { tone: "caution", polarity: "challenge" }) : it)) });
      }
      const caut = (f.items || []).filter(it => isCautionItem(it, straight));
      if (!caut.length) continue;
      const res = FA.compose(f, { seed: 900 + i, lang, straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      got++;
      const dom = f.domain || d;
      out.push({
        d, lang, straight, res,
        cautionFrags: [...new Set(caut.flatMap(it => meaningsOf(dom, it, lang, false)).flatMap(m => fragments(m, lang)))],
        guidanceFrags: [...new Set(caut.flatMap(it => meaningsOf(dom, it, lang, true)).flatMap(m => fragments(m, lang))
          .concat(((res.plan && res.plan.items) || []).flatMap(x => fragments(x.t, lang))))],
      });
    }
  }
  CORPUS = out;
  return out;
}
const splitOf = x => withSwitch(true, () => P.split(x.res, { lang: x.lang, straight: x.straight }));

/* ---------------- shipped config + switch ---------------- */
test("off switch: lensiq-config.js ships LENSIQ_FORTUNE_PAID false (default), only a literal true turns it on", () => {
  const src = fs.readFileSync(path.join(ROOT, "lensiq-config.js"), "utf8");
  assert.match(src, /window\.LENSIQ_FORTUNE_PAID\s*=/, "lensiq-config.js defines the switch");
  for (const [pre, want] of [[undefined, false], [false, false], ["true", false], [1, false], [true, true]]) {
    const win = { location: { pathname: "/x.html", hostname: "localhost", search: "" } };
    if (pre !== undefined) win.LENSIQ_FORTUNE_PAID = pre;
    win.window = win;
    vm.runInNewContext(src, win);
    assert.equal(win.LENSIQ_FORTUNE_PAID, want, `preset ${JSON.stringify(pre)}`);
  }
  assert.equal(withSwitch(undefined, () => P.enabled()), false);
  assert.equal(withSwitch(false, () => P.enabled()), false);
  assert.equal(withSwitch("true", () => P.enabled()), false);
  assert.equal(withSwitch(true, () => P.enabled()), true);
});

test("off switch: the result is the same object, unchanged, for every reading of the corpus; decorate draws nothing", async () => {
  const C = await corpus();
  for (const x of C.slice(0, 400)) {
    const before = JSON.stringify(x.res);
    const out = withSwitch(false, () => P.apply(x.res, { lang: x.lang, straight: x.straight }));
    assert.equal(out, x.res, `${x.d} ${x.lang}: apply returns the same object when off`);
    assert.equal(JSON.stringify(x.res), before, `${x.d} ${x.lang}: result not changed when off`);
  }
  // decorate with the switch off never touches the container (a container that throws on any access)
  const trap = new Proxy({}, { get(t, k) { if (k === "then" || typeof k === "symbol") return undefined; throw new Error("container touched: " + String(k)); } });
  withSwitch(false, () => assert.doesNotThrow(() => P.decorate(trap, C[0].res, C[0].res)));
});

/* ---------------- (a) ---------------- */
test("(a) corpus: >= 2,000 readings, every discipline × TH / EN / ZH × gentle / straight, and paid depth exists", async () => {
  const C = await corpus();
  assert.ok(C.length >= 2000, "readings " + C.length);
  const X = await exportTool();
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const st of [false, true]) {
    const n = C.filter(x => x.d === d && x.lang === lang && x.straight === st).length;
    assert.ok(n >= 10, `${d} ${lang} ${st ? "straight" : "gentle"}: ${n}`);
  }
  const withPaid = C.filter(x => splitOf(x).groups.some(g => g.paid.length)).length;
  assert.ok(withPaid >= C.length * 0.4, `readings with paid depth ${withPaid}/${C.length}: the test is not empty`);
});

test("(a) free = an overview of every group; every part is either free or paid (nothing lost, nothing twice)", async () => {
  const C = await corpus();
  for (const x of C) {
    const sp = splitOf(x);
    assert.deepEqual(sp.groups.map(g => g.id), x.res.sections.map(s => s.id), `${x.d} ${x.lang}: one group per section, same order`);
    sp.groups.forEach((g, k) => {
      const parts = RD.planSection(x.res.sections[k], x.lang).map(p => p.text);
      assert.ok(g.free.length >= 1 && g.free[0] === parts[0], `${x.d} ${x.lang} ${g.id}: the main point is free`);
      const dropped = g.dropped || [];
      assert.deepEqual([...g.free, ...g.paid, ...dropped].sort(), [...parts].sort(), `${x.d} ${x.lang} ${g.id}: free + paid (+ dropped) = the group's parts`);
      for (const t of dropped) assert.equal(P.safe(t, { straight: x.straight }), false, "only text that fails the filter is dropped: " + t.slice(0, 80));
    });
  }
});

test("(a) no caution in paid text: lead tails and unfavourable-item meanings appear only in free text (0 readings allowed)", async () => {
  const C = await corpus();
  const tails = Object.fromEntries(LANGS.map(l => [l, tailsOf(l)]));
  const bad = []; let freeHits = 0;
  for (const x of C) {
    const sp = splitOf(x);
    for (const g of sp.groups) {
      for (const t of g.free) if (tails[x.lang].some(q => has(t, q, x.lang)) || x.cautionFrags.some(q => has(t, q, x.lang))) freeHits++;
      for (const t of g.paid) {
        const q = tails[x.lang].find(q => has(t, q, x.lang)) || x.cautionFrags.find(q => has(t, q, x.lang));
        if (q && bad.length < 25) bad.push(`${x.d} ${x.lang} ${x.straight ? "S" : "G"} ${g.id}: …${q.slice(0, 60)}`);
      }
    }
  }
  assert.ok(freeHits >= 2000, "caution sentences found in free text " + freeHits + " (the ground truth is not empty)");
  assert.equal(bad.length, 0, "caution text in paid parts:\n" + bad.join("\n"));
});

test("(a) the guidance for a caution is free: advice group, improvement plan and the caution items' advice never paid", async () => {
  const C = await corpus();
  const bad = [];
  for (const x of C) {
    const sp = splitOf(x);
    for (const g of sp.groups) {
      if (g.id === "advice" && g.paid.length) bad.push(`${x.d} ${x.lang}: advice group has paid text`);
      for (const t of g.paid) {
        const q = x.guidanceFrags.find(q => has(t, q, x.lang));
        if (q && bad.length < 25) bad.push(`${x.d} ${x.lang} ${x.straight ? "S" : "G"} ${g.id}: guidance in paid …${q.slice(0, 60)}`);
      }
    }
    // the summary, the plan and the reminder are never split off
    for (const k of ["summary", "plan", "reminder", "why", "note"]) assert.deepEqual(sp.free[k], x.res[k], `${x.d} ${x.lang}: ${k} stays free`);
  }
  assert.equal(bad.length, 0, bad.join("\n"));
});

test("(a) hand-made reading: unmarked groups never paid; a folded caution / guidance sentence goes free; marked caution free", () => {
  const long = (s, n) => Array(n).fill(s).join(" ");
  const res = {
    source: "local", lang: "th", plan: { title: "แผน", items: [{ t: "จดรายรับรายจ่ายทุกวันให้เป็นนิสัยเพื่อคุมงบประมาณของเดือนนี้", tone: "caution" }] },
    sections: [
      { id: "overview", title: "ภาพรวม", paragraphs: [long("ภาพรวมช่วงนี้มั่นคงและเดินหน้าได้ดีตามตำรา", 9)] },
      { id: "money", title: "การเงิน", caution: [false, true], paragraphs: [
        long("รายได้มาจากหลายทางตามตำรา", 4) + " ช่วงนี้ควรระวังรายจ่ายที่เกินคาด " + long("และเรื่องเงินจะค่อย ๆ ดีขึ้นตามจังหวะ", 4) +
          " จดรายรับรายจ่ายทุกวันให้เป็นนิสัยเพื่อคุมงบประมาณของเดือนนี้ " + long("ตามตำราการลงทุนระยะยาวเหมาะกับคุณ", 4),
        "ตำราชี้ว่าช่วงนี้การเงินตึงมือ ควรวางแผนใช้จ่ายให้รัดกุม"] },
      { id: "advice", title: "คำแนะนำ", caution: [false], paragraphs: [long("ลองจัดกิจวัตรให้สม่ำเสมอ สีที่เข้ากับผลนี้คือน้ำเงิน", 9)] },
    ],
  };
  const sp = withSwitch(true, () => P.split(res, { lang: "th" }));
  const g = Object.fromEntries(sp.groups.map(x => [x.id, x]));
  assert.equal(g.overview.paid.length, 0, "a group without composer marks is never paid");
  assert.equal(g.advice.paid.length, 0, "the advice group is never paid");
  assert.ok(g.money.free.includes(res.sections[1].paragraphs[1]), "marked caution paragraph free in full");
  assert.ok(!g.money.paid.some(t => /ระวัง/.test(t)), "folded caution sentence moved to free");
  assert.ok(!g.money.paid.some(t => t.includes("จดรายรับรายจ่ายทุกวัน")), "folded plan guidance moved to free");
});

/* ---------------- (b) pure half ---------------- */
test("(b) crisis: a support card or a crisis result gets no offer, no price, nothing locked; the reading stays whole", async () => {
  const C = await corpus();
  const support = FA.crisis.result({ lang: "th" });
  for (const lang of LANGS) {
    const card = FA.crisis.result({ lang });
    assert.equal(withSwitch(true, () => P.apply(card, { lang })), card, lang + ": support card untouched");
    assert.equal(withSwitch(true, () => P.split(card, { lang })), null, lang + ": no split of a support card");
  }
  assert.equal(support.crisis, true);
  for (const x of C.slice(0, 300)) {
    const out = withSwitch(true, () => P.apply(x.res, { lang: x.lang, straight: x.straight, crisis: true }));
    assert.equal(out, x.res, `${x.d} ${x.lang}: crisis flag → the full reading, same object`);
    const offers = withSwitch(true, () => P.offers(P.split(x.res, { lang: x.lang }), x.lang, { crisis: true }));
    assert.deepEqual(offers, [], `${x.d} ${x.lang}: no offer in the crisis state`);
  }
});

/* ---------------- (c) pure half ---------------- */
test("(c) every offer: approved price, price text with the currency in the reading's language, a non-empty heading list", async () => {
  const C = await corpus();
  let n = 0;
  for (const x of C.slice(0, 600)) {
    const sp = splitOf(x);
    const offers = withSwitch(true, () => P.offers(sp, x.lang, {}));
    const paidGroups = sp.groups.filter(g => g.paid.length);
    if (!paidGroups.length) { assert.deepEqual(offers, [], `${x.d} ${x.lang}: nothing to sell, no offer`); continue; }
    for (const o of offers) {
      n++;
      assert.ok(Object.prototype.hasOwnProperty.call(PRICES, o.plan), "plan " + o.plan);
      assert.equal(o.price, PRICES[o.plan], `${o.plan} price`);
      assert.ok(o.priceText.includes(String(o.price)) && CURRENCY[x.lang].test(o.priceText), `${x.lang} price text ${o.priceText}`);
      assert.ok(Array.isArray(o.headings) && o.headings.length >= 1 && o.headings.every(h => typeof h === "string" && h.trim()), `${o.plan} headings`);
      assert.ok(typeof o.label === "string" && o.label.trim(), "label");
    }
    const byPlan = p => offers.filter(o => o.plan === p);
    assert.equal(byPlan("group").length, paidGroups.length, "one 49 offer per group with paid depth");
    for (const o of byPlan("group")) {
      const g = sp.groups.find(gg => gg.id === o.group);
      assert.ok(g && g.paid.length && o.headings.includes(g.title), "group offer lists its group heading");
    }
    assert.equal(byPlan("full").length, 1, "one full-reading offer");
    assert.deepEqual(byPlan("full")[0].headings.slice(0, paidGroups.length), paidGroups.map(g => g.title), "full offer lists every paid group");
    assert.equal(byPlan("year").length, Array.isArray(x.res.monthly) && x.res.monthly.length ? 1 : 0, "year offer only with month-by-month content");
    assert.equal(byPlan("plus").length, 1, "one Plus offer");
  }
  assert.ok(n >= 500, "offers checked " + n);
});

test("(c) all offer text is complete in Thai, English and Chinese", () => {
  const keys = l => Object.keys(P.TEXT[l]).sort();
  assert.deepEqual(keys("en"), keys("th"));
  assert.deepEqual(keys("zh"), keys("th"));
  for (const l of LANGS) for (const k of keys(l)) assert.ok(String(P.TEXT[l][k]).trim(), `${l}.${k} empty`);
  assert.ok(!/[฀-๿]/.test(JSON.stringify(P.TEXT.en)) && !/[฀-๿]/.test(JSON.stringify(P.TEXT.zh)), "no Thai in EN / ZH text");
  // the offer wording never sells an outcome (Remedies and merit: no "pay and your luck improves")
  const all = JSON.stringify(P.TEXT);
  assert.ok(!/แก้ดวง|เสริมดวง|ดวงดีขึ้น|แก้ชง|improve your luck|luck improves|fix your|guarantee|改运|转运|保证/i.test(all), "no outcome selling");
});

/* ---------------- (d) ---------------- */
function lockedCorpus() {
  const src = fs.readFileSync(path.join(ROOT, "tests", "unit", "fortune-honest.test.js"), "utf8");
  const grab = (start, end) => {
    const i = src.indexOf(start), j = src.indexOf(end, i);
    assert.ok(i >= 0 && j > i, "corpus " + start);
    return vm.runInNewContext("(" + src.slice(i + start.length - 1, j + 2) + ")");
  };
  return { HARD: grab("const HARD = {", "\n};"), PLAIN: grab("const PLAIN = [", "\n];") };
}

test("(d) the paid-text filter blocks every hard-limit sentence of the free-text corpus, gentle and straight (TH/EN/ZH)", () => {
  const { HARD } = lockedCorpus();
  let n = 0;
  for (const [cat, list] of Object.entries(HARD)) for (const t of list) {
    n++;
    assert.equal(P.safe(t, { straight: false }), false, `gentle paid lets through [${cat}] ${t}`);
    assert.equal(P.safe(t, { straight: true }), false, `straight paid lets through [${cat}] ${t}`);
  }
  assert.equal(n, 60, "same 60-sentence corpus as tests/unit/fortune-honest.test.js");
});

test("(d) the paid-text filter gives the free-text filter's verdict on the same corpus (no looser, no stricter)", async () => {
  const { HARD, PLAIN } = lockedCorpus();
  const C = await corpus();
  const sample = Object.values(HARD).flat().concat(PLAIN, C.slice(0, 120).flatMap(x => x.res.sections.flatMap(s => s.paragraphs)));
  for (const t of sample) {
    assert.equal(P.safe(t, { straight: true }), FA.straight.isSafe(t) && !FA.straight.hardLimit(t), "straight: " + t.slice(0, 80));
    assert.equal(P.safe(t, { straight: false }), FA.safety.isSafe(t) && !FA.straight.hardLimit(t), "gentle: " + t.slice(0, 80));
  }
});

test("(d) a hard-limit sentence placed in a group's in-depth text never reaches paid text, in every language and mode", async () => {
  const { HARD } = lockedCorpus();
  const C = await corpus();
  const all = Object.values(HARD).flat();
  let checked = 0;
  for (const lang of LANGS) for (const straight of [false, true]) {
    const x = C.find(r => r.lang === lang && r.straight === straight && splitOf(r).groups.some(g => g.paid.length));
    assert.ok(x, `${lang} ${straight}: a reading with paid depth`);
    const k = splitOf(x).groups.findIndex(g => g.paid.length);
    for (const bad of all) {
      const sec = x.res.sections[k];
      const filler = { th: "ตามตำราช่วงนี้งานเดินหน้าได้ดีและมีคนรอบตัวช่วยเหลืออยู่เสมอ", en: "By the tradition, work moves forward well and people around you help.",
        zh: "依照传统说法，工作推进顺利，身边的人也愿意帮忙。" }[lang];
      const para = Array(8).fill(filler).join(RD.SEP[lang]) + RD.SEP[lang] + bad;
      const add = s => Object.assign({}, s, { paragraphs: s.paragraphs.concat(para), caution: s.caution.concat(false) });
      const res = Object.assign({}, x.res, { sections: x.res.sections.map((s, j) => (j === k ? add(s) : s)) });
      const sp = withSwitch(true, () => P.split(res, { lang, straight }));
      for (const g of sp.groups) for (const t of g.paid) assert.ok(!t.includes(bad), `${lang} ${straight ? "S" : "G"}: hard-limit text in paid: ${bad}`);
      checked++;
      assert.ok(sec, "section");
    }
  }
  assert.equal(checked, 360);
});

test("(d) every paid part of the corpus passes the same filter as free text", async () => {
  const C = await corpus();
  let n = 0;
  for (const x of C) for (const g of splitOf(x).groups) for (const t of g.paid) {
    n++;
    assert.equal(FA.straight.hardLimit(t), "", "hard limit in paid: " + t.slice(0, 80));
    assert.ok(x.straight ? FA.straight.isSafe(t) : FA.safety.isSafe(t), "unsafe paid: " + t.slice(0, 80));
  }
  assert.ok(n >= 1000, "paid parts checked " + n);
});
