// Belief panel advice depends on the person's own result (owner order 2026-11-17, item 4b; route ก approved: match the
// result facts + discipline, rotate equal matches by a stable hash of the RESULT, not by id). Locked ceilings C1-C4 live in
// ~/LENSIQ-field/evals/fortune-depth/ceilings-v1.json and are measured by tools/fortune-depth-audit.mjs; these tests pin the
// selection rules that make them pass, on synthetic facts only.
//   A1 same result -> same cards, every time (stable, no randomness); the seed changes with the result
//   A2 equal matches rotate over every card (no card shown to every reading; the old id tie-break is gone when facts exist)
//   A3 no tradition chosen: per type the closest specific match + one rotated card; a chosen tradition keeps up to 2 per type
//   A4 without facts the order is exactly as before (admin sort, then id)
//   A5 rules kept: only published items, the label on every card, the footer, nothing while the crisis state is set,
//      ชง customs only for a ชง reading, no paid section by default
//   A6 "chosen for your result" line: TH / EN / ZH, names the discipline and the person's own result facts, passes the shared
//      wording lint, no Thai in EN / ZH, nothing without facts or when the panel is off
//   A7 discipline-aware keys: palmistry's Western hand element is not a Chinese five-element key
//   A8 the audit's pass / fail verdict uses the locked limits as "<=" / ">=" exactly
const test = require("node:test");
const assert = require("node:assert/strict");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const C = require(join(ROOT, "lensiq-merit-core.js"));
const SEED = require(join(ROOT, "lensiq-merit-seed.js"));
const Lint = require(join(ROOT, "lensiq-merit-lint.js"));
const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/;

const item = (o = {}) => ({
  id: "x", type: "place", tradition: "thai_buddhist", keys: ["any"], sample: true, status: "published", sort: 10,
  title: { th: "ตัวอย่าง: ที่", en: "Sample: place", zh: "示例：地点" }, body: { th: "ตามความเชื่อ ไปไหว้", en: "By custom, pay respects.", zh: "按照习俗参拜。" },
  place: null, area: null, ...o
});
const facts = (domain, ids, topic = "overall") => ({ domain, topic, items: ids.map(x => (typeof x === "string" ? { id: x } : x)) });
const ids = m => m.cards.map(c => c.id);
const panel = (f, o = {}) => C.panelModel(C.safeItems(SEED, Lint.lintMerit), { choice: "", facts: f, page: (f && f.domain ? f.domain : "x") + ".html", lang: "th", crisis: false, ...o });

test("A1: the same result always gives the same cards; a different result gives a different seed", () => {
  const f = facts("bazi", [{ id: "dm.3", tone: "favourable" }, { id: "el.lo.water", tone: "caution" }]);
  const a = ids(panel(f)), b = ids(panel(JSON.parse(JSON.stringify(f))));
  assert.deepEqual(a, b);
  for (let i = 0; i < 5; i++) assert.deepEqual(ids(panel(f)), a, "stable on every call");
  const s1 = C.resultSeed(f), s2 = C.resultSeed(facts("bazi", [{ id: "dm.4", tone: "favourable" }, { id: "el.lo.water", tone: "caution" }]));
  assert.ok(s1 && s2 && s1 !== s2);
  assert.notEqual(C.resultSeed(f), C.resultSeed({ ...f, topic: "love" }), "the area of life asked about is part of the result");
  assert.equal(C.resultSeed(f), C.resultSeed({ ...f, items: f.items.slice().reverse() }), "order of facts does not matter");
  assert.equal(C.resultSeed(null), ""); assert.equal(C.resultSeed({ items: [] }), "");
  assert.equal(C.hash32("abc"), C.hash32("abc")); assert.notEqual(C.hash32("abc"), C.hash32("abd"));
});

test("A2: equal matches rotate by the result: each of 3 equal places is shown, none to every reading", () => {
  const items = ["p-a", "p-b", "p-c"].map(id => item({ id }));
  const count = { "p-a": 0, "p-b": 0, "p-c": 0 };
  const N = 300;
  for (let i = 0; i < N; i++) {
    const m = C.panelModel(items, { choice: "", facts: facts("tarot", ["card.today.m" + (i % 22), "num." + i]), page: "tarot.html", lang: "th", crisis: false });
    assert.equal(m.cards.length, 1, "one place when nothing matches the result more closely");
    count[m.cards[0].id]++;
  }
  for (const k in count) assert.ok(count[k] > N * 0.2 && count[k] < N * 0.5, k + " " + count[k]);
  // with facts, the alphabetically first id no longer wins every tie
  const first = C.panelModel(items, { choice: "", keys: ["any"], lang: "th", crisis: false });
  assert.deepEqual(ids(first), ["p-a", "p-b"], "no facts: old behaviour, 2 per type by sort then id");
});

test("A3: no tradition chosen -> closest specific match + one rotated card per type; a chosen tradition keeps up to 2 per type", () => {
  const items = [
    item({ id: "spec", type: "lucky_item", tradition: "chinese_folk", keys: ["element:water"] }),
    ...["l1", "l2", "l3"].map(id => item({ id, type: "lucky_item", tradition: "general" })),
    ...["o1", "o2", "o3", "o4"].map(id => item({ id, type: "offering" }))
  ];
  for (let i = 0; i < 40; i++) {
    const f = facts("bazi", ["el.lo.water", "dm." + (i % 10), "x." + i]);
    const m = C.panelModel(items, { choice: "", facts: f, page: "bazi.html", lang: "th", crisis: false });
    const lucky = m.cards.filter(c => c.type === "lucky_item").map(c => c.id), off = m.cards.filter(c => c.type === "offering");
    assert.equal(lucky[0], "spec", "the card that matches the result's element comes first");
    assert.equal(lucky.length, 2); assert.ok(["l1", "l2", "l3"].includes(lucky[1]));
    assert.equal(off.length, 1, "no specific offering: one rotated card");
  }
  const chosen = C.panelModel(items, { choice: "thai_buddhist", facts: facts("bazi", ["dm.1"]), page: "bazi.html", lang: "th", crisis: false });
  assert.equal(chosen.cards.filter(c => c.type === "offering").length, 2, "a chosen tradition still shows up to 2 per type");
});

test("A4: match without a seed keeps the admin order (sort, then id)", () => {
  const items = [item({ id: "b", sort: 1 }), item({ id: "a", sort: 1 }), item({ id: "c", sort: 0 })];
  assert.deepEqual(C.match(items, { choice: "", keys: ["any"], perType: 3 }).map(x => x.id), ["c", "a", "b"]);
});

test("A5: only published items; label on every card; footer; crisis hides everything; ชง only for ชง; no paid section", () => {
  const items = [item({ id: "pub" }), item({ id: "draft", status: "draft" }), item({ id: "hid", status: "hidden" }),
    item({ id: "ch", type: "chong", keys: ["chong"] })];
  for (let i = 0; i < 60; i++) {
    const f = facts("zodiac", ["animal." + (i % 12), i % 2 ? "rel.clash" : "rel.harmony"]);
    for (const lang of LANGS) {
      const m = C.panelModel(items, { choice: "", facts: f, page: "zodiac.html", lang, crisis: false });
      assert.ok(!ids(m).includes("draft") && !ids(m).includes("hid"), "unpublished never shown");
      assert.equal(ids(m).includes("ch"), i % 2 === 1, "ชง customs only for a ชง reading");
      for (const c of m.cards) assert.equal(c.label, C.LABEL[lang]);
      assert.equal(m.footer, C.NO_GUARANTEE[lang]);
      assert.equal(m.paid, null);
      assert.equal(C.panelModel(items, { choice: "", facts: f, page: "zodiac.html", lang, crisis: true }), null);
    }
  }
});

const SAMPLES = {
  face: facts("face", ["element.fire", "palace.ming.low"], "work"),
  palm: facts("palm", ["element.water", "life.long"], "love"),
  horoscope: facts("horoscope", ["thai.day.5", "bazi.useful.water", "cn.year.6.wood"], "money"),
  tarot: facts("tarot", ["card.past.m16", "card.present.cups09.r", "card.future.wands02"], "love"),
  siamsee: facts("siamsee", ["siamsee.8"]),
  fengshui: facts("fengshui", ["kua.9", "dir.shengqi"]),
  numbers: facts("numbers", ["pair.24", "sum.45"]),
  iching: facts("iching", [{ id: "hex.49", polarity: "favourable" }, "line.2"]),
  zodiac: facts("zodiac", ["animal.0", { id: "rel.clash", polarity: "challenge" }]),
  astro: facts("astro", ["sun.11", "moon.6"]),
  dream: facts("dream", ["sym.river", "sym.naga", "mood.calm", "type"]),
  bazi: facts("bazi", [{ id: "el.lo.metal", tone: "caution" }, "dm.8"]),
  taksa: facts("taksa", ["tk.sri.6", "maha.1.mula"]),
  lek7: facts("lek7", ["l7.4.caution", "l7.1.favourable"]),
  lifegraph: facts("lifegraph", ["lg.now.work.favourable", "lg.now.money.neutral"])
};
const EXPECT = {
  face: [/ไฟ/, /สีแดง/], horoscope: [/วันศุกร์/, /น้ำ/], siamsee: [/ใบที่ 8/], fengshui: [/กัว 9/], numbers: [/ผลรวมเลข 45/], iching: [/กว้าที่ 49/],
  zodiac: [/ชวด/], astro: [/มีน/], bazi: [/ทอง/, /สีขาวหรือเงิน/], tarot: [/3 ใบ/, /ชุดใหญ่ 1 ใบ/], dream: [/สงบ/, /2 อย่าง/], palm: [/มือธาตุน้ำ/],
  taksa: [/มูละ/], lek7: [/ปุตตะ/], lifegraph: [/การงาน/]
};

test("A6: the 'chosen for your result' line names the discipline and this person's result, in TH / EN / ZH, and passes the lint", () => {
  for (const [d, f] of Object.entries(SAMPLES)) {
    const line = {};
    for (const lang of LANGS) {
      const t = C.focusLine(f, d + ".html", lang);
      assert.ok(t.length > 10, d + " " + lang);
      assert.deepEqual(Lint.lintMerit(t), [], `${d}.${lang}: ${t}`);
      assert.ok(t.includes(C.FOCUS.disc[d][LANGS.indexOf(lang)]), d + " names the discipline in " + lang);
      if (lang !== "th") assert.ok(!THAI.test(t), `${d}.${lang} has no Thai: ${t}`);
      assert.ok(!/https?:|฿|บาท|\bbaht\b|\d\s*元|ซื้อ|\bbuy\b|购买/i.test(t), "no price, link or purchase");
      line[lang] = t;
    }
    for (const re of EXPECT[d] || []) assert.match(line.th, re, d);
  }
  const t1 = C.focusLine(facts("bazi", ["el.lo.wood"]), "bazi.html", "th"), t2 = C.focusLine(facts("bazi", ["el.lo.fire"]), "bazi.html", "th");
  assert.notEqual(t1, t2, "a different result gives different wording");
  assert.equal(C.focusLine(null, "bazi.html", "th"), "");
  assert.equal(C.focusLine({ items: [] }, "index.html", "th"), "");
  const m = panel(SAMPLES.bazi);
  assert.equal(m.focus, C.focusLine(SAMPLES.bazi, "bazi.html", "th"));
  assert.equal(panel(SAMPLES.bazi, { choice: "off" }).focus, "", "off: no line");
  assert.equal(panel(SAMPLES.bazi, { crisis: true }), null, "crisis: nothing");
});

test("A6: every fixed focus string passes the shared wording lint in its language", () => {
  const walk = (o, path) => {
    if (typeof o === "string") { assert.deepEqual(Lint.lintMerit(o), [], path + ": " + o); return; }
    for (const k of Object.keys(o)) walk(o[k], path + "." + k);
  };
  walk(C.FOCUS, "FOCUS");
  for (const k of Object.keys(C.FOCUS.t)) assert.equal(C.FOCUS.t[k].length, 3, k + " has TH / EN / ZH");
});

test("A7: Western palm elements are not Chinese five-element keys; face and BaZi elements are", () => {
  assert.ok(!C.keysFromFacts(facts("palm", ["element.water"])).includes("element:water"));
  assert.ok(!C.keysFromFacts(null, "palm.html").some(k => /^element:/.test(k)));
  assert.ok(C.keysFromFacts(facts("face", ["element.water"])).includes("element:water"));
  assert.ok(C.keysFromFacts(facts("bazi", ["el.lo.water"])).includes("element:water"));
});

test("A8: the audit verdict applies the locked limits exactly (<= for C1-C4, >= for C5-C7)", async () => {
  const { verdict } = await import(require("node:url").pathToFileURL(join(ROOT, "tools", "fortune-depth-audit.mjs")).href);
  const ceil = { C1_same_belief_panel_within_page_max_share: 0.2, C2_same_belief_panel_across_pages_max_share: 0.1, C3_one_card_in_readings_max_share: 0.5,
    C4_composer_advice_repeat_per_page_max_share: 0.1, C5_expanded_over_visible_words: { median_min: 0.5, per_reading_min_words_behind_read_more: 1 },
    C6_distinct_points: { median_min: 45, per_reading_min: 30 }, C7_new_substance_behind_read_more: { median_min: 0.75, per_reading_min: 0.5 } };
  const row = (p, share, comp) => ({ page: p, panel: { topShare: share }, comp: { topShare: comp }, ratio: { median: 0.5 }, expWords: { min: 1 },
    points: { median: 45, min: 30 }, newPct: { median: 0.75, min: 0.5 } });
  const res = { rows: [row("a", 0.2, 0.1), row("b", 0.2001, 0.1001)], across: { panel: { topShare: 0.1, n: 10 } }, cardUse: { x: 5 } };
  const v = verdict(res, ceil), get = (id, p) => v.find(x => x.id === id && x.page === p).ok;
  assert.equal(get("C1", "a"), true); assert.equal(get("C1", "b"), false);
  assert.equal(get("C4", "a"), true); assert.equal(get("C4", "b"), false);
  for (const c of ["C5", "C6", "C7"]) assert.equal(get(c, "a"), true, c + " at the limit passes");
  assert.equal(get("C2", "all pages"), true); assert.equal(get("C3", "all pages"), true);
  res.cardUse.x = 6;
  assert.equal(verdict(res, ceil).find(x => x.id === "C3").ok, false);
});
