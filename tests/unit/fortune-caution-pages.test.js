"use strict";
// tests/unit/fortune-caution-pages.test.js — FIXED TEST SET fortune-caution wave 1 (owner item 177; owner approved waves 0 and 1
// with the switch off, 2026-11-20). Locked BEFORE any page is wired (evals-locks/fortune-caution.sha256, folder wave1/).
// Wave 1 page list: horoscope (pilot, Thai rules), bazi and astro (Chinese / Western rules behind LENSIQ_FORTUNE_CAUTIONS_CN_WEST,
// off). Only pages of this list may load the shell; planner, petread and the hub never do; no page loads the lazy files directly.
// Horoscope adapter contract: HS.cautionItems(P, D, mo) (horoscope.js, pure) -> engine-shaped items for the section, built
// beside the reading (the reading's own facts are unchanged: T15 snapshot of buildFacts / buildDailyFacts taken from the
// unwired horoscope.js at 7c3d9fd1, tests/unit/fixtures/fortune-caution-horoscope-snapshot.json). HS.CAUTION_PERIOD =
// { span: "day", th, en, zh } ("today and this month": a one-day period, so no accident, illness or travel there).
// Items: thai.kalakini.<planet of the birth taksa> (tone caution) always; today.bhumi.<bhumi> (polarity challenge when
// kalakini); today.clash when the day clashes; month.clash when the month branch clashes; month.officer when the month stem is
// 七杀 / 正官 to the day master; bazi.strength.weak when the chart is not strong; bazi.lack.<element> for at most two elements under
// 7 % (same rule as buildFacts). SYNTHETIC births and dates only.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const SNAP = JSON.parse(readFileSync(join(__dirname, "fixtures", "fortune-caution-horoscope-snapshot.json"), "utf8"));
const WAVE1 = ["horoscope.html", "bazi.html", "astro.html"];
const NEVER = ["planner.html", "petread.html", "fortune.html"];
const PILOT = "horoscope.html";
const HS = require(join(ROOT, "horoscope.js"));
const core = require(join(ROOT, "fortune-caution-core.js"));
const lcg = s => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const sha = o => createHash("sha256").update(JSON.stringify(o)).digest("hex");
const PAGES = readdirSync(ROOT).filter(f => f.endsWith(".html"));
const scripts = f => [...readFileSync(join(ROOT, f), "utf8").matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);

test("page list: only wave-1 pages load the shell, the pilot does, after the config and the crisis net, with a version", () => {
  const loaders = PAGES.filter(f => scripts(f).some(s => /^fortune-caution\.js\?v=\w+$/.test(s)));
  assert.ok(loaders.includes(PILOT), "the pilot page loads fortune-caution.js?v=…");
  for (const f of loaders) assert.ok(WAVE1.includes(f), f + " is not on the wave-1 page list");
  for (const f of NEVER) assert.ok(!loaders.includes(f), f + " must never load the section");
  for (const f of loaders) {
    const s = scripts(f), i = s.findIndex(x => x.startsWith("fortune-caution.js"));
    assert.ok(s.findIndex(x => x.startsWith("lensiq-config.js")) < i, f + ": after lensiq-config.js");
    assert.ok(s.findIndex(x => x.startsWith("fortune-crisis.js")) >= 0 && s.findIndex(x => x.startsWith("fortune-crisis.js")) < i, f + ": after fortune-crisis.js");
  }
  for (const f of PAGES) for (const s of scripts(f)) {
    assert.ok(!/^fortune-caution-(?:core|filter|rules|pack)/.test(s), f + " loads a lazy caution file up front: " + s);
  }
});

test("T15 the horoscope reading's own facts are unchanged, character for character (snapshot before wiring)", () => {
  assert.equal(SNAP.cases.length, 42);
  for (const c of SNAP.cases) {
    const [y, m, d, h, mi] = c.b, P = HS.analyze({ y, m, d, time: { h, mi }, name: "" });
    let f;
    if (c.kind === "natal") f = HS.buildFacts(P, { topic: c.topic, rng: lcg(y * 31 + m * 7 + d) });
    else {
      const [ty, tm, tdd] = c.day, D = HS.daily(P, { y: ty, m: tm, d: tdd }), mo = HS.monthly(P, HS.julianDay(ty, tm, tdd, 12) - 7 / 24);
      f = HS.buildDailyFacts(P, D, mo, { topic: "overall", rng: lcg(ty + tm + tdd + y) });
    }
    assert.equal(sha(f), c.sha256, c.kind + " " + c.b.join("-") + " " + (c.topic || c.day.join("-")));
  }
});

/** synthetic births x days */
function* cases() {
  for (let y = 1950; y <= 2008; y += 3) for (const [m, d, h] of [[1, 9, 6], [4, 21, 12], [8, 3, 22], [11, 28, 3]]) {
    const P = HS.analyze({ y, m, d, time: { h, mi: 15 }, name: "" });
    for (const [ty, tm, tdd] of [[2026, 11, 20], [2027, 1, 7], [2027, 3, 18], [2027, 7, 2], [2027, 9, 26]]) {
      const D = HS.daily(P, { y: ty, m: tm, d: tdd }), mo = HS.monthly(P, HS.julianDay(ty, tm, tdd, 12) - 7 / 24);
      yield { P, D, mo, at: [y, m, d, ty, tm, tdd].join("-") };
    }
  }
}

test("horoscope adapter: the items follow the engine's own findings, one for one", () => {
  assert.equal(typeof HS.cautionItems, "function", "HS.cautionItems");
  let n = 0;
  const seen = { clash: 0, mclash: 0, officer: 0, weak: 0, lack: 0, kalaDay: 0 };
  for (const { P, D, mo, at } of cases()) {
    n++;
    const it = HS.cautionItems(P, D, mo), ids = it.map(x => x.id);
    assert.ok(it.every(x => x && typeof x.id === "string" && typeof x.strength === "number"), at + ": items");
    assert.ok(ids.includes("thai.kalakini." + P.taksa.kalakini), at + ": birth kalakini");
    assert.ok(ids.includes("today.bhumi." + D.bhumi), at + ": today's bhumi");
    assert.equal(ids.includes("today.clash"), !!D.clash, at + ": day clash"); if (D.clash) seen.clash++;
    assert.equal(ids.includes("month.clash"), mo.branchRel === "clash", at + ": month clash"); if (mo.branchRel === "clash") seen.mclash++;
    const god = HS.tenGod(P.bazi.day.stem, mo.pillar.stem), off = god === "QS" || god === "ZG";
    assert.equal(ids.includes("month.officer"), off, at + ": duty month (" + god + ")"); if (off) seen.officer++;
    assert.equal(ids.includes("bazi.strength.weak"), !P.favorable.strong, at + ": weak chart"); if (!P.favorable.strong) seen.weak++;
    const tot = Object.values(P.counts).reduce((a, b) => a + b, 0) || 1;
    const lack = HS.ELEMENTS.filter(k => P.counts[k] / tot < 0.07).slice(0, 2).map(k => "bazi.lack." + k);
    assert.deepEqual(ids.filter(x => x.startsWith("bazi.lack.")), lack, at + ": lacking elements"); if (lack.length) seen.lack++;
    if (D.bhumi === "kalakini") { seen.kalaDay++; assert.equal(it.find(x => x.id === "today.bhumi.kalakini").polarity, "challenge", at); }
    assert.equal(new Set(ids).size, ids.length, at + ": no duplicate item");
  }
  assert.ok(n >= 400, "cases: " + n);
  for (const [k, v] of Object.entries(seen)) assert.ok(v >= 3, "the locked dates reach " + k + " (" + v + ")");
});

test("horoscope pilot, live switches (drafts preview, Chinese and Western off): Thai rules only, kalakini always, one-day period", () => {
  const per = HS.CAUTION_PERIOD;
  assert.deepEqual(Object.keys(per || {}).sort(), ["en", "span", "th", "zh"]);
  assert.equal(per.span, "day");
  assert.equal(per.th, "วันนี้และเดือนนี้"); assert.equal(per.en, "Today and this month"); assert.equal(per.zh, "今天和本月");
  let kalaDay = 0;
  for (const { P, D, mo, at } of cases()) for (const lang of ["th", "en", "zh"]) {
    const m = core.build({ domain: "horoscope", facts: { items: HS.cautionItems(P, D, mo) }, period: per, lang }, { drafts: true, cnWest: false });
    assert.ok(m && m.parts.length === 2, at + " " + lang + ": overall + this period");
    for (const p of m.parts) for (const x of p.mind.concat(p.cheer, p.guide)) assert.ok(/^th\./.test(x.rule), at + ": non-Thai rule with the switch off: " + x.rule);
    assert.ok(m.parts[0].mind.some(x => x.rule === "th.kalakini"), at + " " + lang + ": birth kalakini in 'overall'");
    if (D.bhumi === "kalakini") { kalaDay++; assert.ok(m.parts[1].mind.some(x => x.rule === "th.taksajorn.kalakini"), at + ": kalakini day"); }
    assert.equal(m.parts[1].period, per[lang], at + ": period label");
  }
  assert.ok(kalaDay >= 3, "kalakini days reached: " + kalaDay);
  const withCn = [...cases()].some(({ P, D, mo }) => core.build({ domain: "horoscope", facts: { items: HS.cautionItems(P, D, mo) }, period: per, lang: "th" },
    { drafts: true, cnWest: true }).parts.some(p => p.mind.some(x => /^(?:cn|bz)\./.test(x.rule))));
  assert.ok(withCn, "with the Chinese switch on, the Chinese horoscope rules can show (wired, just off)");
});
