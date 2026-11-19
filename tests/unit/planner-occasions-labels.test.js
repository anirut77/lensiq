"use strict";
// tests/unit/planner-occasions-labels.test.js — FIXED TEST SET "planner-occasions-labels" (owner decisions 114–117, 2026-11-19),
// locked BEFORE the build (evals-locks/planner-occasions-labels.sha256, ~/LENSIQ-field/evals/planner-occasions-labels/).
// Owner rule: any occasion, or any rule inside an occasion, that does NOT come from a traditional text is labelled on the page as
// modern practice ("ตามความนิยมสมัยใหม่" / "Modern practice" / "现代习俗") and is never presented as tradition. The browser half
// (label rendered and visible at 360 px, TH / EN / ZH): tests/e2e/planner-occasions-labels.e2e.mjs.
//   C1  every occasion (the 21 new and move / shop / work) and every rule inside it has a source class, "text" or "modern", in the
//       occasion data (LQPlanner.SRC_CLASS) and the same class, with an internal note, in docs/planner-occasion-sources.json;
//       every reason the planner can produce maps to one of those rules
//   C2  the classification (sources: ~/Desktop/LENSIQ-review/planner/occasions/README-TH.md and the rule notes): modern occasions
//       compreg (registration statistics, named by the owner), launch (thin evidence, named by the owner) and regmarry (an office
//       procedure; office hours and "the month of the wedding" are practice); modern rules inside text occasions: the waxing-moon
//       point of move / shop / work (not confirmed by the recorded sources) and the even-month point of move (one source gives
//       months 2, 4, 6, 9, 12, not "even months"); everything else text
//   C3  the label exists in TH / EN / ZH with the owner's exact wording; every modern rule inside a text occasion has a short name
//       in TH / EN / ZH (shown after the label)
//   C4  no modern item uses tradition wording ("ตามตำรา", "traditional", "传统" …) in TH / EN / ZH: the occasion's name, subtitle and
//       plain reason, and every reason of a modern rule. Declared exception: the Thai reason "evenMonth" of move is frozen by the
//       locked planner-occasions O5 snapshot and is rewritten in the separate move / shop / work work (owner, 2026-11-19); it is
//       labelled here, and its EN / ZH stay word-for-word with the Thai until then
//   C5  the source notes stay internal: no shipped planner file names the sources file or a source URL
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const P = require("../../lensiq-planner.js");
require("../../lensiq-planner-occ.js");
const FA = require("../../fortune-ai.js");

function dict(files, lang) {
  const q = [];
  const win = { LQI18N_Q: q };
  for (const f of files) new Function("window", read("i18n/" + f))(win);
  return Object.assign({}, ...q.map(x => x[lang] || {}));
}
const EN = dict(["en-planner.js", "en-planner-occ.js"], "en"), ZH = dict(["zh-planner.js", "zh-planner-occ.js"], "zh");
const HTML = read("planner.html");
const TH_HTML = {};
for (const m of HTML.matchAll(/data-i18n="(pl\.[\w.]+)"[^>]*>([^<]*)</g)) TH_HTML[m[1]] = m[2].trim();
const SRC = JSON.parse(read("docs/planner-occasion-sources.json"));

const OLD = ["move", "shop", "work"];
const CLASSES = ["text", "modern"];
// rule fields of an added occasion (lensiq-planner-occ.js OCC[ev]); star / extra / monthsRequired / min belong to taksa / months
const RULE_FIELDS = ["days", "fav", "months", "waxing", "lunarDays", "monthBan", "office", "prelent", "skipPhra", "byBirth", "general", "needsOwner"];
const SHARED = ["taksa", "zodiac", "phra"];
function rulesOf(e) {
  if (OLD.includes(e)) return ["days", "waxing"].concat(e === "move" ? ["evenMonth"] : [], SHARED);
  const R = P.OCC[e];
  return RULE_FIELDS.filter(k => R[k] != null && R[k] !== false).concat(SHARED);
}
const MODERN_OCC = ["regmarry", "compreg", "launch"];
const MODERN_RULES = { move: ["waxing", "evenMonth"], shop: ["waxing"], work: ["waxing"] };
const LABEL = { th: "ตามความนิยมสมัยใหม่", en: "Modern practice", zh: "现代习俗" };

const FROM = { y: 2026, m: 12, d: 1 }, TO = { y: 2027, m: 11, d: 30 };
function allReasonIds(e) {
  const ids = new Set();
  const runs = [[]];
  for (let planet = 0; planet <= 7; planet++) runs.push([{ planet, animal: (planet * 5 + 1) % 12 }], [{ planet, animal: null }]);
  for (const owners of runs) for (const x of P.plan({ event: e, from: FROM, to: TO, owners, min: 0 })) for (const r of x.reasons) ids.add(r.id);
  return [...ids];
}

test("C1 every occasion and every rule has a source class (text / modern), in the code and in the sources file; every reason maps to a rule", () => {
  assert.ok(P.EVENTS.length >= 24, "occasions loaded: " + P.EVENTS.length);
  assert.ok(P.SRC_CLASS && typeof P.reasonRule === "function" && typeof P.reasonClass === "function", "LQPlanner.SRC_CLASS / reasonRule / reasonClass");
  const rows = Object.fromEntries(SRC.occasions.map(o => [o.id, o]));
  for (const e of P.EVENTS) {
    const c = P.SRC_CLASS[e];
    assert.ok(c && CLASSES.includes(c.cls), e + ": occasion class");
    for (const k of rulesOf(e)) assert.ok(c.rules && CLASSES.includes(c.rules[k]), `${e}: rule ${k} has no class`);
    for (const k of Object.keys(c.rules)) assert.ok(rulesOf(e).includes(k), `${e}: class for a rule the occasion does not have: ${k}`);
    const row = rows[e];
    assert.ok(row, e + ": no row in the sources file");
    assert.equal(row.class, c.cls, e + ": sources file class");
    for (const k of rulesOf(e)) {
      const rc = row.rule_class && row.rule_class[k];
      assert.ok(rc && rc.class === c.rules[k], `${e}: sources file rule ${k} class ${rc && rc.class} vs ${c.rules[k]}`);
      assert.ok(String(rc.note || "").trim().length > 10, `${e}: sources file rule ${k}: internal note`);
    }
    const ids = allReasonIds(e);
    assert.ok(ids.length > 0, e + ": no reasons produced");
    for (const id of ids) {
      const k = P.reasonRule(e, id);
      assert.ok(rulesOf(e).includes(k), `${e}: reason ${id} maps to ${k}, not a rule of the occasion`);
      assert.equal(P.reasonClass(e, id), c.rules[k], `${e}: reasonClass(${id})`);
    }
  }
});

test("C2 classification: compreg, launch, regmarry modern; waxing of move / shop / work and even month of move modern; the rest text", () => {
  for (const e of P.EVENTS) {
    const c = P.SRC_CLASS[e];
    assert.equal(c.cls, MODERN_OCC.includes(e) ? "modern" : "text", e + ": occasion class");
    for (const k of rulesOf(e)) {
      let want = "text";
      if (MODERN_OCC.includes(e) && !SHARED.includes(k)) want = "modern";
      if ((MODERN_RULES[e] || []).includes(k)) want = "modern";
      assert.equal(c.rules[k], want, `${e}: rule ${k}`);
    }
  }
  assert.equal(P.reasonClass("move", "waxing"), "modern");
  assert.equal(P.reasonClass("move", "full"), "modern");
  assert.equal(P.reasonClass("wedding", "waxing"), "text");
  assert.equal(P.reasonClass("waikru", "full"), "text");
  assert.equal(P.reasonClass("compreg", "wd.compreg.1"), "modern");
  assert.equal(P.reasonClass("compreg", "bh.sri"), "text");
});

test("C3 the label in TH / EN / ZH (owner's wording) and a name for every modern rule inside a text occasion", () => {
  assert.equal(P.MODERN_TH, LABEL.th);
  assert.equal(EN["pl.modern"], LABEL.en);
  assert.equal(ZH["pl.modern"], LABEL.zh);
  for (const [e, ks] of Object.entries(MODERN_RULES)) for (const k of ks) {
    assert.ok(String((P.RULE_TH || {})[k] || "").length > 3, `${e}: TH name of rule ${k}`);
    assert.ok(String(EN["pl.modern.rule." + k] || "").length > 3, `${e}: EN name of rule ${k}`);
    assert.ok(String(ZH["pl.modern.rule." + k] || "").length > 1, `${e}: ZH name of rule ${k}`);
    for (const s of [P.RULE_TH[k], EN["pl.modern.rule." + k], ZH["pl.modern.rule." + k]]) assert.ok(FA.safety.isSafe(s), "safety: " + s);
  }
  for (const s of Object.values(LABEL)) assert.ok(FA.safety.isSafe(s), "safety: " + s);
});

const TRAD_TH = /ตำรา|โบราณ|ประเพณี|ดั้งเดิม|คัมภีร์|แต่โบร่ำโบราณ/;
const TRAD_EN = /\btradition(al|ally|s)?\b|\btexts?\b|\bancient\b|\balmanacs?\b|\bcustom(s|ary|arily)?\b|\bscriptures?\b|\bclassical\b/i;
const TRAD_ZH = /传统|古籍|典籍|古法|古书|旧俗|习俗上|老规矩|古训|古人|经典/;
// declared exception (see the header): Thai frozen by the locked planner-occasions O5 snapshot; rewritten in the move / shop / work work
const FROZEN = new Set(["evenMonth"]);

test("C4 no modern item is worded as tradition (TH / EN / ZH)", () => {
  const items = [];
  for (const e of MODERN_OCC) {
    items.push(["TH why " + e, P.WHY[e], TRAD_TH], ["EN why " + e, EN["pl.why." + e], TRAD_EN], ["ZH why " + e, ZH["pl.why." + e], TRAD_ZH]);
    for (const k of ["pl.ev." + e, "pl.ev." + e + "S"]) items.push(["TH " + k, TH_HTML[k], TRAD_TH], ["EN " + k, EN[k], TRAD_EN], ["ZH " + k, ZH[k], TRAD_ZH]);
  }
  let reasons = 0;
  for (const e of P.EVENTS) for (const id of allReasonIds(e)) {
    if (P.reasonClass(e, id) !== "modern" || FROZEN.has(id)) continue;
    reasons++;
    items.push([`TH reason ${e}/${id}`, P.TH[id], TRAD_TH], [`EN reason ${e}/${id}`, EN["pl.r." + id], TRAD_EN], [`ZH reason ${e}/${id}`, ZH["pl.r." + id], TRAD_ZH]);
  }
  for (const ks of Object.values(MODERN_RULES)) for (const k of ks) {
    items.push(["TH rule " + k, (P.RULE_TH || {})[k], TRAD_TH], ["EN rule " + k, EN["pl.modern.rule." + k], TRAD_EN], ["ZH rule " + k, ZH["pl.modern.rule." + k], TRAD_ZH]);
  }
  assert.ok(reasons >= 8, "modern reasons checked: " + reasons);
  for (const [where, s, re] of items) {
    assert.ok(s && String(s).trim(), where + ": missing");
    assert.ok(!re.test(s), `${where}: tradition wording "${(String(s).match(re) || [])[0]}" in: ${s}`);
  }
  // the frozen Thai reason is still labelled modern (it is not dropped from the label, only from the wording check)
  assert.equal(P.reasonClass("move", "evenMonth"), "modern");
});

test("C5 the source notes stay internal: no shipped planner file names the sources file or a source URL", () => {
  const shipped = ["planner.html", "planner.js", "lensiq-planner.js", "lensiq-planner-occ.js", "i18n/en-planner.js", "i18n/zh-planner.js",
    "i18n/en-planner-occ.js", "i18n/zh-planner-occ.js"].map(f => [f, read(f)]);
  const hosts = new Set();
  for (const o of SRC.occasions) for (const s of o.sources || []) if (s.url) hosts.add(new URL(s.url).hostname.replace(/^www\./, ""));
  assert.ok(hosts.size > 10, "source hosts " + hosts.size);
  for (const [f, t] of shipped) {
    assert.ok(!/planner-occasion-sources/.test(t), f + " names the sources file");
    for (const h of hosts) assert.ok(!t.includes(h), `${f} names a source host: ${h}`);
    assert.ok(!/rule_class|rule_note/.test(t), f + " carries internal source notes");
  }
});
