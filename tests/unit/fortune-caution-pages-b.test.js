"use strict";
// tests/unit/fortune-caution-pages-b.test.js — FIXED TEST SET fortune-caution wave 1b: bazi and astro pilot pages (owner approved
// wave 1 = three pilot pages with the switch off; coordinator 2026-11-20: both behind LENSIQ_FORTUNE_CAUTIONS_CN_WEST, off (D-6);
// month periods or longer, never a single day). Locked BEFORE either page is wired (evals-locks/fortune-caution.sha256, wave1b/).
// Bazi adapter (lifecal-kb.js, pure): LIFECAL_KB.baziCautions(B, age, now{y,m,d}) -> { items, period }: every item of
// baziFacts(B, "overall", { age }) (the engine's own findings) plus "year.<relation>" of the birth year branch to this year's
// 立春 year branch (LifeCal.yearRelation, equal to Zodiac.relation for all 144 pairs) when it is not neutral (polarity challenge
// for clash, same, harm, punish, break); period = the current 大运 and this year (span "decade") or this year (span "year").
// Astro adapter (astro.js, pure): AS.SATURN_RETURNS equals LifeCal.SATURN_RETURNS; within 1.2 years of a return
// AS.cautionItems(input, now) = [{ id: "saturn.return", tone: "caution", strength: 0.8 }] and AS.cautionPeriod(input, now) =
// { span: "years", "about age a-b" } (a = floor(return - 1.2), b = ceil(return + 1.2)); otherwise [] and null, and the page mounts
// nothing (only the Saturn return is supported until planet positions exist). Rule w.saturn.return: school "w", modern.
// Astro has no Western natal rule yet, so its section has no "overall" part (never an empty "nothing to watch").
// T15: the readings' own facts unchanged (snapshot from the unwired code at 852bc307). SYNTHETIC births and dates only.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const SNAP = JSON.parse(readFileSync(join(__dirname, "fixtures", "fortune-caution-bazi-astro-snapshot.json"), "utf8"));
const LC = require(join(ROOT, "lifecal.js")), KB = require(join(ROOT, "lifecal-kb.js")), AS = require(join(ROOT, "astro.js")), ZD = require(join(ROOT, "zodiac.js"));
const core = require(join(ROOT, "fortune-caution-core.js"));
const lcg = s => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const sha = o => createHash("sha256").update(JSON.stringify(o)).digest("hex");
const CHONG = ["clash", "same", "harm", "punish", "break"];
const LIVE = { drafts: true, cnWest: false }, CN = { drafts: true, cnWest: true };
const scripts = f => [...readFileSync(join(ROOT, f), "utf8").matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);

test("page list: bazi and astro load the shell after the config and the crisis net", () => {
  for (const f of ["bazi.html", "astro.html"]) {
    const s = scripts(f), i = s.findIndex(x => /^fortune-caution\.js\?v=\w+$/.test(x));
    assert.ok(i >= 0, f + " loads fortune-caution.js?v=…");
    assert.ok(s.findIndex(x => x.startsWith("lensiq-config.js")) < i && s.findIndex(x => x.startsWith("fortune-crisis.js")) < i, f + ": order");
  }
});

test("T15 the bazi and astro readings' own facts are unchanged (snapshot before wiring)", () => {
  assert.equal(SNAP.cases.length, 112);
  const MR = Math.random;
  for (const c of SNAP.cases) {
    const [y, m, d, h, mi] = c.b;
    let f;
    try {
      if (c.kind === "bazi") { Math.random = lcg(y + m + d + c.age); f = KB.baziFacts(LC.bazi({ y, m, d, h, mi, tz: 7, noTime: false, gender: "f" }), c.topic, { age: c.age }); }
      else { Math.random = lcg(y * 3 + m + d); f = AS.buildFacts(AS.chart({ y, m, d, time: { h, mi }, tz: 7, lat: 13.75, lon: 100.5 }), c.topic); }
    } finally { Math.random = MR; }
    assert.equal(sha(f), c.sha256, c.kind + " " + c.b.join("-") + " " + c.topic + (c.age ? " " + c.age : ""));
  }
});

test("LifeCal.yearRelation equals Zodiac.relation for all 144 branch pairs", () => {
  assert.equal(typeof LC.yearRelation, "function");
  for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) assert.equal(LC.yearRelation(a, b), ZD.relation(a, b), a + "-" + b);
});

function* baziCases() {
  for (let y = 1950; y <= 2008; y += 2) for (const [m, d, h] of [[2, 3, 6], [6, 15, 12], [10, 30, 22]]) {
    const B = LC.bazi({ y, m, d, h, mi: 10, tz: 7, noTime: false, gender: y % 4 ? "m" : "f" });
    for (const now of [{ y: 2026, m: 11, d: 20 }, { y: 2027, m: 5, d: 1 }, { y: 2029, m: 8, d: 9 }]) yield { B, now, age: now.y - y, at: [y, m, d, now.y].join("-") };
  }
}

test("bazi adapter: the engine's own items plus this year's branch relation; period = 大运 and this year", () => {
  assert.equal(typeof KB.baziCautions, "function");
  const rels = new Set();
  let n = 0, decade = 0;
  for (const { B, now, age, at } of baziCases()) {
    n++;
    const r = KB.baziCautions(B, age, now), ids = r.items.map(x => x.id);
    for (const it of KB.baziFacts(B, "overall", { age }).items) assert.ok(ids.includes(it.id), at + ": engine item " + it.id);
    const yb = LC.bazi({ y: now.y, m: now.m, d: now.d, h: 12, mi: 0, tz: 7, noTime: false }).pillars.year.branch;
    const rel = LC.yearRelation(B.pillars.year.branch, yb), yi = r.items.filter(x => /^year\./.test(x.id));
    if (rel === "neutral") assert.equal(yi.length, 0, at + ": no year item in a neutral year");
    else {
      rels.add(rel);
      assert.equal(yi.length, 1, at); assert.equal(yi[0].id, "year." + rel, at);
      assert.equal(yi[0].polarity === "challenge", CHONG.includes(rel), at + ": polarity");
    }
    const L = LC.luckAt(B, age), p = r.period;
    if (L) {
      decade++;
      assert.equal(p.span, "decade", at);
      const ages = Math.round(L.from) + "–" + Math.round(L.to);
      assert.ok(p.th.includes("วัยจร") && p.th.includes(L.pillar.zh) && p.th.includes(ages), at + ": " + p.th);
      assert.ok(p.en.includes("Luck period") && p.en.includes(L.pillar.zh) && p.en.includes(ages), at + ": " + p.en);
      assert.ok(p.zh.includes("大运") && p.zh.includes(L.pillar.zh) && p.zh.includes(ages), at + ": " + p.zh);
    } else assert.deepEqual(p, { span: "year", th: "ปีนี้", en: "This year", zh: "今年" }, at);
  }
  assert.ok(n >= 250 && decade >= 100, "cases " + n + ", luck periods " + decade);
  for (const k of ["clash", "same", "harm", "punish", "break", "harmony", "trine"]) assert.ok(rels.has(k), "the locked dates reach year." + k);
});

test("bazi pilot: behind the Chinese switch (no section live); with it on, Chinese rules from these items, period from the adapter", () => {
  let shown = 0;
  for (const { B, now, age, at } of baziCases()) for (const lang of ["th", "en", "zh"]) {
    const r = KB.baziCautions(B, age, now), input = { domain: "bazi", facts: { items: r.items }, period: r.period, lang };
    assert.equal(core.build(input, LIVE), null, at + ": a bazi section with the Chinese switch off");
    const m = core.build(input, CN);
    assert.ok(m && m.parts[0].part === "overall", at + ": overall first");
    for (const p of m.parts) for (const x of p.mind.concat(p.cheer, p.guide)) assert.ok(/^bz\./.test(x.rule), at + ": rule " + x.rule);
    const per = m.parts.find(p => p.part === "period");
    assert.ok(per && per.period === r.period[lang], at + " " + lang + ": period label");
    if (per.mind.length) shown++;
  }
  assert.ok(shown >= 100, "readings with a period caution: " + shown);
});

test("astro adapter and pilot: Saturn return only, modern label, years period, behind the switch, no 'overall' part", () => {
  assert.deepEqual(AS.SATURN_RETURNS, LC.SATURN_RETURNS);
  const rule = core.rules().find(r => r.id === "w.saturn.return");
  assert.ok(rule, "rule w.saturn.return");
  assert.equal(rule.school, "w"); assert.deepEqual(rule.domains, ["astro"]); assert.equal(rule.kind, "period"); assert.deepEqual(rule.spans, ["years"]);
  assert.equal(rule.modern, true); assert.equal(rule.traditional, false); assert.equal(rule.polarity, "caution");
  assert.ok(rule.sources.length >= 2, "two sources");
  assert.deepEqual(core.DOMAINS.astro, { schools: ["w"], periodic: true });
  let inWin = 0, outWin = 0;
  for (let y = 1930; y <= 2006; y++) for (const m of [1, 7]) {
    const inp = { y, m, d: 15, time: { h: 9, mi: 0 }, tz: 7, lat: 13.75, lon: 100.5 }, now = { y: 2026, m: 11, d: 20 };
    const age = (Date.UTC(2026, 10, 20) - Date.UTC(y, m - 1, 15)) / 864e5 / 365.2425;
    const x = AS.SATURN_RETURNS.find(r => Math.abs(age - r) <= 1.2);
    const items = AS.cautionItems(inp, now), per = AS.cautionPeriod(inp, now), at = y + "-" + m + " age " + age.toFixed(2);
    if (x === undefined) { outWin++; assert.deepEqual(items, [], at); assert.equal(per, null, at); continue; }
    inWin++;
    assert.deepEqual(items, [{ id: "saturn.return", tone: "caution", strength: 0.8 }], at);
    const a = Math.floor(x - 1.2), b = Math.ceil(x + 1.2);
    assert.deepEqual(per, { span: "years", th: "ช่วงอายุราว " + a + "–" + b + " ปี", en: "About age " + a + "–" + b, zh: "约 " + a + "–" + b + " 岁" }, at);
    for (const lang of ["th", "en", "zh"]) {
      const input = { domain: "astro", facts: { items }, period: per, lang };
      assert.equal(core.build(input, LIVE), null, at + ": an astro section with the Western switch off");
      const m2 = core.build(input, CN);
      assert.ok(m2 && m2.parts.length === 1 && m2.parts[0].part === "period", at + ": the period part only (no Western natal rule yet)");
      assert.deepEqual(m2.parts[0].mind.map(q => q.rule), ["w.saturn.return"], at);
      assert.ok(m2.parts[0].mind[0].modern, at + ": modern practice label");
      assert.ok(core.html(m2).includes(core.LABELS.modern[lang]), at + ": label shown");
    }
  }
  assert.ok(inWin >= 6 && outWin >= 100, "in window " + inWin + ", outside " + outWin);
});
