"use strict";
// RELOCK 5 2026-11-20 (wave 1b): T23 "overall first" applies when the page has an overall rule (astro has none yet: period part only).
// tests/unit/fortune-caution-rules.test.js — FIXED TEST SET fortune-caution (owner item 177, 2026-11-20: the closed
// "สิ่งที่ควรระวัง / Things to be mindful of / 需要留意的事项" section of the fortune readings). Locked BEFORE any product code
// (evals-locks/fortune-caution.sha256, ~/LENSIQ-field/evals/fortune-caution/). Design: ~/Desktop/LENSIQ-review/fortune-cautions/
// DESIGN-TH.md sections 3, 4, 5 (T3, T4, T5, T10 unit part, T14, T15 unit part, T16 core part, T17, T22, T23 unit part).
// Every number is SYNTHETIC: tests/unit/fixtures/fortune-caution-profiles.json (made-up engine facts and birth dates).
// Reversible defaults applied by the coordinator (owner board, 2026-11-20): (a) measured wording always (no straight
// variant here); (b) hidden under the crisis or calm flag (e2e); (c) disclaimer acknowledged per tab (e2e); D-2 the illness
// relaxation is for this section only; D-3 specific accident types stay filtered; D-4 / D-5 no section on planner or
// petread; D-6 Chinese and Western rules behind a switch that stays off. Owner refinement 2026-11-20 (about 10:25),
// replacing D-1: accident, illness and travel cautions may sit under a month range or a longer period, never under a
// single day or date (rule field spans, period field span); "be careful" wording only, no prohibitions; people only in broad
// terms; broad body areas allowed, no diagnosis or treatment; guidance = mindset and good deeds (whitelist: limits test).
// RELOCK 3 (2026-11-20, independent review of wave 0 + owner rule 2026-11-20 "month ranges, never a single day"), STRICTER: no rule
// may have span "day" and a period with span "day" gets no "this period" part; lifegraph (its "sources" were the team's own
// weights) and lek7 (one real source, fails T5; T5 not weakened) are excluded page domains; school "mix" is gone; a period part
// shows only when the page has an available rule of that kind for its span. Item count floor 120 (fewer rules after the
// day-level ones were removed). T14: lek7's own cautions stay free in the lek7 reading (asserted), as its rule is excluded.
// Contract of the product module fortune-caution-core.js (Node: module.exports; browser: window.LQFortuneCautionCore):
//   rules()            every rule of the registry (Node loads every registry file)
//   DOMAINS            { <page domain>: { schools: string[], periodic: boolean } }      EXCLUDED: page domains with no section
//   LABELS             { <key>: { th, en, zh } }  every fixed label the section shows after the disclaimer
//   match(domain, item) ids of the rules one engine item fires (no school / status filter)
//   build({ domain, facts: { items }, period: { th, en, zh } | null, lang }, { drafts, cnWest })
//                      -> null (excluded / unknown domain, or no rule of the domain available under the switches) or
//                         { domain, lang, parts: [{ part: "overall" | "period", period: string | null, none, noPeriod,
//                           mind: [{ n, rule, text, school, modern }], cheer: [{ rule, text, luck }], guide: [{ n | null, rule, text }] }] }
//   html(model)        the section body as an HTML string (parts in order; in each part mind, then cheer, then guide)
//   check(text, kind, ctx)  "" = allowed, else a reason code; kind "mind" | "do" | "cheer" | "luck" | "label";
//                      ctx { part: "overall" | "period", span } (accident / illness / travel refused under span "day")
// Registry rule: { id, school: "th" | "cn" | "mix" | "w", domains, kind: "overall" | "period", polarity: "caution" | "good",
//   topic, trigger: [{ id: <RegExp source>, tone?, polarity? }], traditional, modern, sources: [>= 2], kbRef: "<file>:<key>",
//   status: "draft" | "expert-ok", caution: mind + do (+ cheer) / good: luck (+ do), each { th, en, zh }; doCat: the
//   guidance category of do ("mindful" | "precepts" | "merit" | "parents" | "religion"); spans: the period spans a period
//   rule may show under ("month" | "year" | "years" | "decade"; never "day") }. Input period: { span, th, en, zh }.
// Same strength: registry order. Readings with period null have no "this period" part when the domain reads by period.
const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");
const FIX = JSON.parse(readFileSync(join(__dirname, "fixtures", "fortune-caution-profiles.json"), "utf8"));
const LANGS = ["th", "en", "zh"];
const ON = { drafts: true, cnWest: true };
const S = JSON.stringify;
const core = require(join(ROOT, "fortune-caution-core.js"));
const RULES = core.rules();
const BY_ID = new Map(RULES.map(r => [r.id, r]));
const input = (r, lang) => ({ domain: r.domain, facts: { domain: r.domain, items: r.items }, period: r.period ? FIX.periods[r.period] : null, lang });
const build = (r, lang, opts = ON) => core.build(input(r, lang), opts);
const partOf = (m, p) => m.parts.find(x => x.part === p);
const THAI = /[฀-๿]/, CJK = /[㐀-鿿豈-﫿]/;
const textFields = r => (r.polarity === "caution" ? ["mind", "do", "cheer"] : ["luck", "do"]).filter(f => r[f]);

test("T4 / T5 registry: every rule is complete, traceable to its source and has two sources", () => {
  assert.ok(RULES.length >= 20, "the wave-0 registry holds the Thai and Chinese rules of the design (2.1, 2.2, 2.9): " + RULES.length);
  for (const id of ["lek7.weakbase", "lg.band.work", "lg.band.money", "lg.band.love", "lg.band.care"]) assert.ok(!RULES.some(r => r.id === id), id + " is excluded");
  const seen = new Set();
  for (const r of RULES) {
    const at = "rule " + (r && r.id);
    assert.ok(typeof r.id === "string" && /^[a-z0-9]+(\.[a-z0-9]+)+$/.test(r.id), at + ": id");
    assert.ok(!seen.has(r.id), at + ": duplicate id"); seen.add(r.id);
    assert.ok(["th", "cn", "w"].includes(r.school), at + ": school");
    assert.ok(Array.isArray(r.domains) && r.domains.length && r.domains.every(d => core.DOMAINS[d]), at + ": domains " + S(r.domains));
    assert.ok(["overall", "period"].includes(r.kind), at + ": kind");
    assert.ok(["caution", "good"].includes(r.polarity), at + ": polarity");
    assert.ok(typeof r.topic === "string" && r.topic, at + ": topic");
    assert.ok(Array.isArray(r.trigger) && r.trigger.length, at + ": trigger");
    for (const t of r.trigger) assert.doesNotThrow(() => new RegExp(t.id), at + ": trigger regex " + t.id);
    assert.equal(typeof r.traditional, "boolean", at + ": traditional");
    assert.equal(typeof r.modern, "boolean", at + ": modern");
    assert.ok(Array.isArray(r.sources) && r.sources.length >= 2 && new Set(r.sources).size === r.sources.length && r.sources.every(s => typeof s === "string" && s.trim().length >= 8),
      at + ": two independent sources (rule 72) " + S(r.sources));
    const [file, key] = String(r.kbRef || "").split(":");
    assert.ok(file && key && existsSync(join(ROOT, file)), at + ": kbRef file " + r.kbRef);
    assert.ok(readFileSync(join(ROOT, file), "utf8").includes(key), at + ": kbRef key " + r.kbRef);
    assert.ok(["draft", "expert-ok"].includes(r.status), at + ": status");
    assert.ok(!r.paid, at + ": a caution-section rule is never paid content");
    if (r.polarity === "caution") assert.ok(r.mind && r.do, at + ": mind + do");
    else assert.ok(r.luck, at + ": good rule carries its 'may' line");
    if (r.do) assert.ok(["mindful", "precepts", "merit", "parents", "religion"].includes(r.doCat), at + ": guidance category " + r.doCat);
    if (r.kind === "period") assert.ok(Array.isArray(r.spans) && r.spans.length && r.spans.every(x => ["month", "year", "years", "decade"].includes(x)), at + ": spans (never a day)");
    if (/accident|illness|travel|health/.test(r.topic) && r.kind === "period") assert.ok(!r.spans.includes("day"), at + ": never under a single day (owner 2026-11-20)");
  }
});

test("T10 unit: every rule text and label exists in Thai, English and Chinese; English has no Thai or Chinese, Chinese no Thai", () => {
  const objs = [];
  for (const r of RULES) for (const f of textFields(r)) objs.push([r.id + "." + f, r[f]]);
  for (const [k, v] of Object.entries(core.LABELS)) objs.push(["label." + k, v]);
  assert.ok(objs.length > 60, "texts found: " + objs.length);
  for (const [k, v] of objs) {
    for (const l of LANGS) assert.ok(v && typeof v[l] === "string" && v[l].trim(), k + ": " + l + " missing");
    assert.ok(THAI.test(v.th), k + ": th is Thai");
    assert.ok(!THAI.test(v.en) && !CJK.test(v.en), k + ": en has Thai or Chinese: " + v.en);
    assert.ok(!THAI.test(v.zh) && CJK.test(v.zh), k + ": zh: " + v.zh);
  }
  for (const k of ["title", "top", "overall", "period", "mind", "cheer", "guide", "none", "noPeriod", "close", "modern", "school.th", "school.cn", "school.w"]) {
    assert.ok(core.LABELS[k], "label " + k);
  }
});

test("T22 trace: each reading shows exactly the rules its facts fire (mind in strength order, at most 3), nothing else", () => {
  for (const r of FIX.readings) for (const lang of LANGS) {
    const m = build(r, lang), at = r.name + " " + lang;
    assert.ok(m && Array.isArray(m.parts), at + ": model");
    for (const p of ["overall", "period"]) {
      const want = r.expect[p], got = partOf(m, p);
      if (!want) continue;
      assert.ok(got, at + ": part " + p);
      assert.deepEqual(got.mind.map(x => x.rule), want.mind, at + " " + p + ": mind rules");
      const fired = new Set(want.mind.concat(want.good));
      const goodShown = [...new Set(got.cheer.map(x => x.rule).filter(id => BY_ID.get(id) && BY_ID.get(id).polarity === "good"))];
      if (want.good.length <= 2) assert.deepEqual(goodShown.sort(), want.good.slice().sort(), at + " " + p + ": good rules shown");
      for (const x of got.cheer.concat(got.guide)) {
        assert.ok(fired.has(x.rule) || (want.good.length > 2 && BY_ID.get(x.rule)), at + " " + p + ": line from a rule this reading did not fire: " + x.rule);
      }
      for (const x of got.mind) assert.ok(BY_ID.has(x.rule) && x.school === BY_ID.get(x.rule).school, at + ": registry rule + school " + x.rule);
    }
  }
});

test("coverage: every registry rule fires in at least two readings of the locked set", () => {
  const n = new Map(RULES.map(r => [r.id, 0]));
  for (const r of FIX.readings) {
    const m = build(r, "th"), ids = new Set();
    for (const p of m.parts) for (const x of p.mind.concat(p.cheer, p.guide)) ids.add(x.rule);
    for (const id of ids) n.set(id, (n.get(id) || 0) + 1);
  }
  const few = [...n].filter(([, c]) => c < 2);
  assert.deepEqual(few, [], "rules that fire in fewer than 2 locked readings (add readings in a new lock, never an untested rule)");
});

test("T3 every caution has a non-empty paired 'what to do' with the same number; nothing is folded", () => {
  let items = 0;
  for (const r of FIX.readings) for (const lang of LANGS) {
    const m = build(r, lang), h = core.html(m), at = r.name + " " + lang;
    assert.doesNotMatch(h, /<details|\shidden[\s>=]|aria-expanded="false"|class="[^"]*\b(?:fold|collapsed|more)\b/, at + ": folded part");
    for (const p of m.parts) {
      p.mind.forEach((x, i) => {
        items++;
        assert.equal(x.n, i + 1, at + ": numbered from 1");
        assert.ok(x.text && x.text.trim().length > 10, at + ": mind text");
        const g = p.guide.find(y => y.n === x.n);
        assert.ok(g && g.rule === x.rule && g.text && g.text.trim().length > 10, at + ": guide " + x.n + " pairs with " + x.rule);
        assert.ok(h.includes(x.text) && h.includes(g.text), at + ": both in the HTML");
      });
    }
  }
  assert.ok(items >= 120, "caution items checked: " + items);
});

test("T23 three parts in order (mind, cheer, guide), caps, cheer only from this reading, numbered guidance", () => {
  for (const r0 of FIX.readings) for (const lang of LANGS) {
    const r = r0;
    const m = build(r, lang), h = core.html(m), at = r.name + " " + lang;
    // RELOCK 5: a page with no overall rule (astro: no Western natal rule yet) has no "overall" part
    if (RULES.some(r => r.kind === "overall" && r.domains.includes(r0.domain))) assert.equal(m.parts[0].part, "overall", at + ": overall first");
    else assert.ok(m.parts.every(p => p.part === "period"), at + ": period only");
    if (m.parts[1]) assert.equal(m.parts[1].part, "period", at + ": then this period");
    assert.ok(m.parts.length <= 2, at + ": two parts at most");
    const L = k => core.LABELS[k][lang];
    let from = 0;
    for (const p of m.parts) {
      assert.ok(p.mind.length <= 3, at + ": at most 3 cautions");
      assert.ok(p.cheer.length <= 2, at + ": at most 2 encouragement lines");
      assert.ok(p.cheer.filter(x => x.luck).length <= 2, at + ": at most 2 luck lines");
      assert.ok(p.guide.filter(x => x.n == null).length <= 1, at + ": at most one extra guidance step");
      for (const x of p.cheer) if (x.luck) assert.equal(BY_ID.get(x.rule).polarity, "good", at + ": a luck line comes from a favourable rule");
      if (p.noPeriod) continue;
      const iM = h.indexOf(L("mind"), from), iC = p.cheer.length ? h.indexOf(L("cheer"), from) : -1, iG = p.guide.length ? h.indexOf(L("guide"), from) : -1;
      assert.ok(iM >= 0, at + " " + p.part + ": 'be mindful of' heading");
      if (iC >= 0) assert.ok(iC > iM, at + ": encouragement after be mindful of");
      if (iG >= 0) assert.ok(iG > Math.max(iM, iC), at + ": guidance last");
      from = Math.max(iM, iC, iG) + 1;
    }
  }
});

test("T17 no matching rule: the plain 'nothing in particular' line, and no stand-in text", () => {
  const empty = FIX.readings.filter(r => Object.values(r.expect).every(p => !p.mind.length && !p.good.length));
  assert.ok(empty.length >= 3, "locked readings with nothing to show: " + empty.length);
  for (const r of empty) for (const lang of LANGS) {
    const m = build(r, lang), at = r.name + " " + lang;
    for (const p of m.parts) {
      if (p.noPeriod) continue;
      assert.equal(p.none, true, at + ": none");
      assert.equal(p.mind.length + p.cheer.length + p.guide.length, 0, at + ": no generic text");
    }
    const h = core.html(m);
    assert.ok(h.includes(core.LABELS.none[lang]), at + ": the none line");
    for (const rule of RULES) for (const f of textFields(rule)) assert.ok(!h.includes(rule[f][lang]), at + ": rule text " + rule.id);
  }
});

test("T16 core: no time period -> the 'does not read by time period' line; planner, petread, the hub, lek7 and lifegraph get no section", () => {
  for (const [d, D] of Object.entries(core.DOMAINS).filter(([, x]) => !x.periodic)) for (const lang of LANGS) {
    const m = core.build({ domain: d, facts: { items: [] }, period: null, lang }, ON), p = m && partOf(m, "period");
    assert.ok(!m || (p && p.noPeriod === true && core.html(m).includes(core.LABELS.noPeriod[lang])), d + " " + lang + ": noPeriod line " + D);
  }
  for (const r of FIX.readings.filter(x => x.period === null && core.DOMAINS[x.domain].periodic)) {
    assert.equal(build(r, "th").parts.length, 1, r.name + ": no period part when the reading has none");
  }
  for (const d of ["planner", "petread", "fortune", "lek7", "lifegraph"]) {
    assert.ok(core.EXCLUDED.includes(d) && !core.DOMAINS[d], d + " excluded");
    assert.equal(core.build({ domain: d, facts: { items: [{ id: "l7.0.caution", tone: "caution", strength: 1 }] }, period: null, lang: "th" }, ON), null, d + ": no section");
  }
  assert.equal(core.build({ domain: "no-such-page", facts: { items: [] }, period: null, lang: "th" }, ON), null, "unknown domain");
});

test("owner rule 2026-11-20: never a single day: a one-day period gets no 'this period' part", () => {
  for (const r of FIX.readings.filter(x => x.period)) for (const lang of LANGS) {
    const per = Object.assign({}, FIX.periods[r.period], { span: "day" });
    const m = core.build({ domain: r.domain, facts: { items: r.items }, period: per, lang }, ON);
    assert.ok(m && !m.parts.some(p => p.part === "period"), r.name + " " + lang + ": period part under a one-day span");
  }
});

test("D-6 switch: with Chinese and Western rules off only Thai-school rules show; drafts off hides draft rules", () => {
  for (const r of FIX.readings) for (const lang of LANGS) {
    const m = build(r, lang, { drafts: true, cnWest: false }), at = r.name + " " + lang;
    const thOnly = p => (r.expect[p] ? r.expect[p].mind.filter(id => BY_ID.get(id).school === "th") : null);
    if (!m) { assert.ok(core.DOMAINS[r.domain].schools.every(s => s !== "th"), at + ": null only when the page has no Thai rules"); continue; }
    for (const p of m.parts) {
      for (const x of p.mind.concat(p.cheer, p.guide)) assert.equal(BY_ID.get(x.rule).school, "th", at + ": " + x.rule + " shown with the switch off");
      if (thOnly(p.part)) assert.deepEqual(p.mind.map(x => x.rule), thOnly(p.part), at + ": Thai rules kept in order");
    }
  }
  for (const r of FIX.readings) {
    const m = build(r, "th", { drafts: false, cnWest: true });
    const avail = RULES.some(x => x.status === "expert-ok" && x.domains.includes(r.domain));
    if (!avail) { assert.equal(m, null, r.name + ": nothing reviewed yet -> no section (never an empty 'nothing to watch')"); continue; }
    for (const p of m.parts) for (const x of p.mind.concat(p.cheer, p.guide)) assert.equal(BY_ID.get(x.rule).status, "expert-ok", r.name + ": draft rule shown");
  }
});

test("T14 report parity: every caution the paid report can show has a free rule in this section", () => {
  const LC = require(join(ROOT, "lifecal.js")), KB = require(join(ROOT, "lifecal-kb.js")), ZD = require(join(ROOT, "zodiac.js")), RP = require(join(ROOT, "report.js"));
  const FREE = new Set(["bazi", "taksa", "zodiac", "horoscope"]);
  const need = new Map();
  const add = (domain, it) => { const k = domain + " " + it.id; if (!need.has(k)) need.set(k, { domain, it }); };
  const careful = it => it.tone === "caution" || it.polarity === "challenge";
  for (const b of FIX.births) {
    const bb = Object.assign({ tz: 7, noTime: false }, b);
    for (const age of [8, 20, 33, 47, 61]) {
      KB.baziFacts(LC.bazi(bb), "overall", { age }).items.filter(careful).forEach(it => add("bazi", it));
      KB.taksaFacts(LC.taksa(bb), "overall", { age }).items.filter(careful).forEach(it => add("taksa", it));
    }
    KB.lek7Facts(LC.lek7(bb), "overall").items.filter(careful).forEach(it => add("lek7", it));
    const z = ZD.zodiacYearOf(b.y, b.m, b.d, "chinese");
    for (let y = 2024; y <= 2035; y++) ZD.buildFacts(ZD.annual(z.animal, y, z.year), "overall", { rng: () => 0.5 }).items.filter(careful).forEach(it => add("zodiac", it));
    for (let a = 0; a < 12; a++) ZD.compatFacts(ZD.compat(z.animal, a), "love").items.filter(careful).forEach(it => add("zodiac", it));
  }
  for (const [god, G] of Object.entries(RP.GODS)) if (G.tone === "caution") add("horoscope", { id: "month." + god, tone: "caution" });
  assert.ok(need.size >= 15, "report cautions collected: " + need.size);
  const missing = [];
  for (const { domain, it } of need.values()) {
    const ids = core.match(domain, it).filter(id => BY_ID.get(id) && BY_ID.get(id).polarity === "caution");
    const ok = ids.some(id => !BY_ID.get(id).paid && BY_ID.get(id).domains.some(d => FREE.has(d)));
    // lek7's rule is excluded (one source, T5); its cautions stay free in the lek7 reading itself, with their advice
    if (!ok && domain === "lek7") { assert.ok(it.meanings && it.meanings.advice && it.meanings.advice.length, "lek7 caution free with advice: " + it.id); continue; }
    if (!ok) missing.push(domain + " " + it.id);
  }
  assert.deepEqual(missing, [], "report cautions with no free rule");
});

test("T15 unit: the switches default off; the section never changes the reading itself", () => {
  const src = readFileSync(join(ROOT, "lensiq-config.js"), "utf8");
  const run = w => { const ctx = { window: w, document: undefined, localStorage: undefined, sessionStorage: undefined, location: { search: "" } }; vm.runInNewContext(src, ctx); return ctx.window; };
  let w;
  try { w = run({}); } catch (e) { w = null; }
  assert.ok(w, "lensiq-config.js runs with an empty window");
  assert.equal(w.LENSIQ_FORTUNE_CAUTIONS, false, "LENSIQ_FORTUNE_CAUTIONS defaults to false");
  assert.equal(w.LENSIQ_FORTUNE_CAUTIONS_CN_WEST, false, "LENSIQ_FORTUNE_CAUTIONS_CN_WEST defaults to false (D-6)");
  assert.notEqual(w.LENSIQ_FORTUNE_CAUTIONS_DRAFTS, true, "draft rules are not shown by default");
  assert.equal(run({ LENSIQ_FORTUNE_CAUTIONS: "yes" }).LENSIQ_FORTUNE_CAUTIONS, false, "only true turns it on");
  const FA = require(join(ROOT, "fortune-ai.js")), LC = require(join(ROOT, "lifecal.js")), KB = require(join(ROOT, "lifecal-kb.js"));
  const facts = () => KB.baziFacts(LC.bazi(Object.assign({ tz: 7, noTime: false }, FIX.births[3])), "overall", { age: 40 });
  const before = S(FA.compose(facts(), { lang: "th", seed: 177 }));
  for (const r of FIX.readings) for (const lang of LANGS) core.html(build(r, lang));
  assert.equal(S(FA.compose(facts(), { lang: "th", seed: 177 })), before, "the reading is the same character for character");
  assert.equal(FA.safety.isSafe("ระวังเจ็บป่วยหรือเป็นไข้ พักผ่อนให้พอ"), false, "D-2: the main reading filter still cuts illness wording");
});
