"use strict";
// tests/unit/merit.test.js — Merit MVP (owner order 2026-11-12, docs/MERIT-DESIGN.md), browser side. FIXED TEST SET:
// written and hash-locked (~/LENSIQ-field/evals/merit/locked.sha256) BEFORE lensiq-merit-core.js, lensiq-merit.js and
// lensiq-merit-seed.js were written. Never edited to make the product pass.
//
// Rules under test (CLAUDE.md "Remedies and merit" + Fortune bans; owner spec 2026-11-12):
//   R1 every guidance item carries the fixed label "according to belief, please use your own judgement" (TH/EN/ZH)
//      and the panel the fixed "nothing guarantees a result" line; both are constants, not admin-editable text
//   R2 guidance is filtered by the user's chosen tradition (remembered on the device only); "off" shows nothing
//   R3 matching keys come from the reading's facts on the device (zodiac year / ชง / weak period / element / domain)
//   R4 ชง customs are shown only for a reading that is a ชง (clash-type) relation
//   R5 the paid "on your behalf" section is shown only when the page flag AND the server flag are on AND the crisis
//      state is not set; the page flag is OFF by default; the crisis state lasts 24 h
//   R6 the sample seed: complete TH/EN/ZH, clearly marked as samples, no prices, links, phone numbers or shop words,
//      and it passes the Worker's own wording lint (backend/src/merit.js) — same rules for seed and admin edits
//   R7 the UI text never uses countdown / scarcity / guarantee / "fix your luck" / fear wording (TH/EN/ZH)
//   R8 the Worker's crisis patterns are the same as the fortune pages' crisis net (fortune-ai.js), so the interest
//      form is refused on the server for exactly the text the device would stop
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const core = () => require("../../lensiq-merit-core.js");
const seed = () => require("../../lensiq-merit-seed.js");
const backend = () => import("../../backend/src/merit.js");
const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/;

/** Fake storage (localStorage stand-in). */
function store(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
const item = (o = {}) => ({
  id: o.id || "t-" + Math.random().toString(16).slice(2, 8), type: "place", tradition: "thai_buddhist", status: "published", sort: 0, sample: false,
  title: { th: "หัวข้อ", en: "Title", zh: "标题" }, body: { th: "เนื้อหา", en: "Body", zh: "内容" }, place: null, area: null, keys: ["any"], ...o
});

/* ---------------- R1 fixed label and footer ---------------- */
test("R1: the fixed belief label and the no-guarantee line exist in TH / EN / ZH with the approved wording", () => {
  const C = core();
  assert.equal(C.LABEL.th, "ตามความเชื่อ โปรดใช้วิจารณญาณ");
  assert.equal(C.LABEL.en, "According to belief, please use your own judgement");
  assert.equal(C.LABEL.zh, "依据民间信仰，请自行判断");
  for (const l of LANGS) assert.ok(C.NO_GUARANTEE[l] && C.NO_GUARANTEE[l].length >= 6, "no-guarantee line " + l);
  assert.match(C.NO_GUARANTEE.th, /ไม่มีสิ่งใดรับประกันผล/);
  assert.match(C.NO_GUARANTEE.en, /guarantee/i);
  assert.match(C.NO_GUARANTEE.zh, /保证/);
  assert.ok(Object.isFrozen(C.LABEL) && Object.isFrozen(C.NO_GUARANTEE), "fixed strings cannot be changed at run time");
});

test("R1: card model — every rendered card carries the label in the current language; the panel carries the footer", () => {
  const C = core();
  const items = [item({ id: "a" }), item({ id: "b", type: "offering" }), item({ id: "c", type: "lucky_item", tradition: "general" })];
  for (const lang of LANGS) {
    const m = C.panelModel(items, { choice: "thai_buddhist", keys: ["any"], lang, pageFlag: false, serverFlag: false, crisis: false });
    assert.ok(m && m.cards.length === 3, lang + " cards");
    for (const c of m.cards) assert.equal(c.label, C.LABEL[lang], lang + " label on " + c.id);
    assert.equal(m.footer, C.NO_GUARANTEE[lang]);
    assert.equal(m.paid, null, lang + ": paid section off by default");
    if (lang !== "th") for (const c of m.cards) assert.ok(!THAI.test(c.title + c.body), lang + ": card text in " + lang);
  }
});

/* ---------------- R2 tradition filter, remembered on the device ---------------- */
test("R2: tradition choices are fixed; unknown values fall back to 'not chosen'", () => {
  const C = core();
  assert.deepEqual(C.TRADITIONS, ["thai_buddhist", "chinese_folk", "hindu_brahman", "general"]);
  assert.deepEqual(C.CHOICES, ["", "thai_buddhist", "chinese_folk", "hindu_brahman", "general", "off"]);
  for (const v of ["", null, undefined, "xx", "<script>", 7, "THAI_BUDDHIST "]) assert.equal(C.normChoice(v), "", String(v));
  for (const v of C.CHOICES) assert.equal(C.normChoice(v), v);
});

test("R2: filter by tradition — a religious tradition gets its own items plus general ones; general gets general only; off gets none", () => {
  const C = core();
  const items = [
    item({ id: "tb", tradition: "thai_buddhist" }), item({ id: "cf", tradition: "chinese_folk" }),
    item({ id: "hb", tradition: "hindu_brahman" }), item({ id: "ge", tradition: "general" })
  ];
  const ids = choice => C.match(items, { choice, keys: ["any"], perType: 9, max: 9 }).map(x => x.id).sort();
  assert.deepEqual(ids("thai_buddhist"), ["ge", "tb"]);
  assert.deepEqual(ids("chinese_folk"), ["cf", "ge"]);
  assert.deepEqual(ids("hindu_brahman"), ["ge", "hb"]);
  assert.deepEqual(ids("general"), ["ge"]);
  assert.deepEqual(ids(""), ["cf", "ge", "hb", "tb"], "not chosen yet: every tradition, so the user can see what exists");
  assert.deepEqual(ids("off"), []);
});

test("R2: the choice is remembered in device storage only, under one key; a broken storage never throws", () => {
  const C = core();
  const s = store();
  assert.equal(C.loadChoice(s), "");
  C.saveChoice(s, "chinese_folk");
  assert.equal(s.getItem(C.STORE_KEY), "chinese_folk");
  assert.equal(C.loadChoice(s), "chinese_folk");
  C.saveChoice(s, "nonsense");
  assert.equal(C.loadChoice(s), "");
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(C.loadChoice(broken), "");
  assert.doesNotThrow(() => C.saveChoice(broken, "general"));
  assert.equal(C.loadChoice(null), "");
});

/* ---------------- R3 keys from the reading (on device) ---------------- */
test("R3: keys from a zodiac reading — domain, animal, ชง; a neutral year is not a ชง", () => {
  const C = core();
  const zd = rel => ({ domain: "zodiac", items: [{ id: "animal.6" }, { id: "rel." + rel }, { id: "el.same" }] });
  for (const rel of ["clash", "same", "harm", "punish", "break"]) {
    const k = C.keysFromFacts(zd(rel));
    assert.ok(k.includes("any") && k.includes("domain:zodiac") && k.includes("animal:6") && k.includes("chong"), rel + ": " + k);
  }
  for (const rel of ["harmony", "trine", "neutral"]) assert.ok(!C.keysFromFacts(zd(rel)).includes("chong"), rel);
  assert.ok(!C.keysFromFacts({ domain: "zodiac", items: [{ id: "pair.clash" }] }).includes("chong"), "a pair (compatibility) reading is not a ชง year");
  assert.ok(C.keysFromFacts({ domain: "horoscope", items: [{ id: "today.clash" }] }).includes("chong"), "day clash");
});

test("R3: keys — element from bazi / lifecal / face, weak period from caution tone or a challenge", () => {
  const C = core();
  const k1 = C.keysFromFacts({ domain: "bazi", items: [{ id: "dm.3", tone: "favourable" }, { id: "el.lo.water", tone: "caution" }, { id: "str.weak", tone: "caution" }] });
  assert.ok(k1.includes("element:water") && k1.includes("weak") && k1.includes("domain:bazi"), String(k1));
  const k2 = C.keysFromFacts({ domain: "horoscope", items: [{ id: "bazi.useful.fire" }] });
  assert.ok(k2.includes("element:fire") && !k2.includes("weak"), String(k2));
  const k3 = C.keysFromFacts({ domain: "face", items: [{ id: "element.metal" }] });
  assert.ok(k3.includes("element:metal"), String(k3));
  const k4 = C.keysFromFacts({ domain: "tarot", items: [{ id: "card.past.m16", polarity: "challenge" }] });
  assert.ok(k4.includes("weak") && k4.includes("domain:tarot"), String(k4));
  for (const k of [k1, k2, k3, k4]) for (const x of k) assert.ok(C.KEY_RE.test(x), "valid key " + x);
});

test("R3: malformed or missing facts never throw; the page name gives the domain", () => {
  const C = core();
  for (const f of [null, undefined, 3, "x", {}, { items: "no" }, { items: [null, 4, { id: 7 }] }, { domain: "<b>", items: [] }]) {
    const k = C.keysFromFacts(f);
    assert.deepEqual(k, ["any"], JSON.stringify(f));
  }
  assert.deepEqual(C.keysFromFacts(null, "zodiac.html"), ["any", "domain:zodiac"]);
  assert.deepEqual(C.keysFromFacts(null, "faceread.html"), ["any", "domain:face"]);
  assert.deepEqual(C.keysFromFacts(null, "index.html"), ["any"]);
});

test("R3: matching — only items with a matching key; more specific matches first; hidden items never shown", () => {
  const C = core();
  const items = [
    item({ id: "gen", keys: ["any"], sort: 0 }),
    item({ id: "fire", keys: ["element:fire"], sort: 5 }),
    item({ id: "water", keys: ["element:water"] }),
    item({ id: "hid", keys: ["any"], status: "hidden" }),
    item({ id: "zd", keys: ["domain:zodiac", "animal:6"], sort: 9 })
  ];
  const r = C.match(items, { choice: "thai_buddhist", keys: C.keysFromFacts({ domain: "zodiac", items: [{ id: "animal.6" }, { id: "bazi.useful.fire" }] }), perType: 9, max: 9 }).map(x => x.id);
  assert.deepEqual(r, ["zd", "fire", "gen"]);
  assert.ok(!r.includes("water") && !r.includes("hid"));
});

test("R3: at most 2 items per type and 8 in total by default; types in the fixed order place, offering, chong, lucky_item", () => {
  const C = core();
  assert.deepEqual(C.TYPES, ["place", "offering", "chong", "lucky_item"]);
  const items = [];
  for (const type of ["lucky_item", "chong", "offering", "place"]) for (let i = 0; i < 4; i++) items.push(item({ id: type + i, type, keys: type === "chong" ? ["chong"] : ["any"] }));
  const r = C.match(items, { choice: "", keys: ["any", "chong"] });
  assert.equal(r.length, 8);
  assert.deepEqual(r.map(x => x.type), ["place", "place", "offering", "offering", "chong", "chong", "lucky_item", "lucky_item"]);
});

/* ---------------- R4 ชง only for a ชง reading ---------------- */
test("R4: a chong-type item is never shown for a reading that is not a ชง, even if an admin gave it a broad key", () => {
  const C = core();
  const items = [item({ id: "ch1", type: "chong", keys: ["chong"] }), item({ id: "ch2", type: "chong", keys: ["any", "chong"] }), item({ id: "p", keys: ["any"] })];
  const plain = C.match(items, { choice: "", keys: ["any", "domain:zodiac"] }).map(x => x.id);
  assert.deepEqual(plain, ["p"]);
  const chong = C.match(items, { choice: "", keys: ["any", "domain:zodiac", "chong"] }).map(x => x.id).sort();
  assert.deepEqual(chong, ["ch1", "ch2", "p"]);
});

/* ---------------- R5 paid section gate ---------------- */
test("R5: paid section only when page flag AND server flag are on AND no crisis; strict booleans", () => {
  const C = core();
  const grid = [];
  for (const pageFlag of [true, false, "true", 1, undefined]) for (const serverFlag of [true, false, "on", undefined]) for (const crisis of [true, false]) {
    grid.push([pageFlag, serverFlag, crisis, C.paidAllowed({ pageFlag, serverFlag, crisis })]);
  }
  for (const [p, s, c, ok] of grid) assert.equal(ok, p === true && s === true && c === false, JSON.stringify([p, s, c]));
});

test("R5: the page flag is OFF in the shipped config (lensiq-config.js never turns it on)", () => {
  const cfg = readFileSync(join(ROOT, "lensiq-config.js"), "utf8");
  assert.ok(!/LENSIQ_MERIT_INTEREST_FORM\s*=\s*(?:window\.LENSIQ_MERIT_INTEREST_FORM\s*\|\|\s*)?true\b/.test(cfg), "not switched on");
  assert.match(cfg, /LENSIQ_MERIT_INTEREST_FORM\s*=\s*window\.LENSIQ_MERIT_INTEREST_FORM\s*===\s*true/, "declared, default off");
});

test("R5: crisis state — set by markCrisis, active for 24 h, then expires; garbage values count as no crisis", () => {
  const C = core();
  C._resetCrisisMemory(); // review amendment 2026-11-12: markCrisis also keeps an in-memory per-page flag
  const s = store(), t0 = Date.UTC(2026, 10, 12, 10);
  assert.equal(C.crisisActive(s, t0), false);
  C.markCrisis(s, t0);
  assert.equal(s.getItem(C.CRISIS_KEY), String(t0));
  assert.equal(C.CRISIS_WINDOW_MS, 24 * 3600 * 1000);
  assert.equal(C.crisisActive(s, t0 + 1000), true);
  assert.equal(C.crisisActive(s, t0 + C.CRISIS_WINDOW_MS - 1), true);
  assert.equal(C.crisisActive(s, t0 + C.CRISIS_WINDOW_MS + 1), false);
  C._resetCrisisMemory();
  assert.equal(C.crisisActive(store({ [C.CRISIS_KEY]: "abc" }), t0), false);
  assert.equal(C.crisisActive(store({ [C.CRISIS_KEY]: String(t0 + 3600e3) }), t0), true, "a clock skew into the future still counts (safe side)");
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.doesNotThrow(() => C.markCrisis(broken, t0));
  // review amendment 2026-11-12 (stricter): blocked storage no longer loses the crisis state; it is kept in memory per page
  assert.equal(C.crisisActive(broken, t0), true);
  C._resetCrisisMemory();
});

test("R5: panel model — crisis hides the whole panel (no free guidance and no paid offer next to a support card)", () => {
  const C = core();
  const items = [item({ id: "a" })];
  assert.equal(C.panelModel(items, { choice: "", keys: ["any"], lang: "th", pageFlag: true, serverFlag: true, crisis: true }), null);
  const on = C.panelModel(items, { choice: "", keys: ["any"], lang: "th", pageFlag: true, serverFlag: true, crisis: false });
  assert.ok(on.paid, "paid section when both flags are on");
  assert.ok(on.paid.after === "guidance", "paid section sits below the free guidance");
  assert.equal(C.panelModel(items, { choice: "", keys: ["any"], lang: "th", pageFlag: true, serverFlag: false, crisis: false }).paid, null);
  assert.equal(C.panelModel(items, { choice: "", keys: ["any"], lang: "th", pageFlag: false, serverFlag: true, crisis: false }).paid, null);
});

test("R5: paid section text — separate fee, donation passed on in full, photo/video proof and receipt, no booking yet, in TH/EN/ZH", () => {
  const C = core();
  for (const lang of LANGS) {
    const m = C.panelModel([item()], { choice: "", keys: ["any"], lang, pageFlag: true, serverFlag: true, crisis: false });
    const t = Object.values(m.paid.text).join("\n");
    if (lang === "th") {
      assert.match(t, /ค่าบริการ/); assert.match(t, /แยก/); assert.match(t, /ส่งต่อเต็มจำนวน/); assert.match(t, /รูป/); assert.match(t, /วิดีโอ/); assert.match(t, /ใบเสร็จ/);
      assert.match(t, /ไปเองไม่สะดวก|เดินทางไปเองไม่ได้|ไปเองไม่ได้/);
    }
    if (lang === "en") {
      assert.match(t, /fee/i); assert.match(t, /separate/i); assert.match(t, /in full/i); assert.match(t, /photo/i); assert.match(t, /video/i); assert.match(t, /receipt/i);
      assert.match(t, /cannot travel|can't travel|unable to travel/i);
      assert.ok(!THAI.test(t), "no Thai in English text");
    }
    if (lang === "zh") {
      assert.match(t, /服务费/); assert.match(t, /分开/); assert.match(t, /全额/); assert.match(t, /照片/); assert.match(t, /视频/); assert.match(t, /收据/);
      assert.ok(!THAI.test(t), "no Thai in Chinese text");
    }
    assert.equal(m.paid.fields.join(","), "name,channel,contact,item_id,date_from,date_to,consent", lang + ": minimum fields only");
  }
});

/* ---------------- R6 seed ---------------- */
test("R6: seed — complete TH/EN/ZH, valid type / tradition / keys, unique ids, clearly marked as samples", () => {
  const C = core(), S = seed();
  assert.ok(Array.isArray(S) && S.length >= 10 && S.length <= 40, "a small set: " + S.length);
  const ids = new Set();
  for (const it of S) {
    assert.ok(/^[a-z0-9][a-z0-9_-]{2,40}$/.test(it.id) && !ids.has(it.id), "id " + it.id); ids.add(it.id);
    assert.ok(C.TYPES.includes(it.type), it.id + " type");
    assert.ok(C.TRADITIONS.includes(it.tradition), it.id + " tradition");
    assert.equal(it.sample, true, it.id + " is a sample");
    assert.equal(it.status, "published");
    for (const l of LANGS) {
      assert.ok(typeof it.title[l] === "string" && it.title[l].trim().length >= 3, it.id + " title " + l);
      assert.ok(typeof it.body[l] === "string" && it.body[l].trim().length >= 20, it.id + " body " + l);
      if (l !== "th") assert.ok(!THAI.test(it.title[l] + it.body[l]), it.id + " " + l + " has no Thai");
    }
    assert.match(it.title.th, /ตัวอย่าง/, it.id); assert.match(it.title.en, /Sample/, it.id); assert.match(it.title.zh, /示例/, it.id);
    for (const f of ["place", "area"]) if (it[f] != null) for (const l of LANGS) assert.ok(String(it[f][l] || "").trim(), it.id + " " + f + " " + l);
    assert.ok(Array.isArray(it.keys) && it.keys.length >= 1 && it.keys.length <= 12, it.id + " keys");
    for (const k of it.keys) assert.ok(C.KEY_RE.test(k), it.id + " key " + k);
    if (it.type === "chong") assert.ok(it.keys.includes("chong"), it.id + " chong item has the chong key");
    const allowed = ["id", "type", "tradition", "title", "body", "place", "area", "keys", "sample", "status", "sort"];
    for (const k of Object.keys(it)) assert.ok(allowed.includes(k), it.id + ": no extra field " + k + " (no price / vendor / link / personal data)");
  }
});

test("R6: seed — every tradition has places, offerings and lucky items; ชง samples exist for Thai and Chinese practice", () => {
  const S = seed();
  const has = (tr, ty) => S.some(x => x.tradition === tr && x.type === ty);
  for (const tr of ["thai_buddhist", "chinese_folk", "hindu_brahman"]) for (const ty of ["place", "offering", "lucky_item"]) assert.ok(has(tr, ty), tr + " " + ty);
  assert.ok(has("chinese_folk", "chong") && has("thai_buddhist", "chong"));
  assert.ok(S.some(x => x.tradition === "general"), "something for 'no particular tradition'");
  assert.ok(S.some(x => x.keys.includes("weak")), "something for a weak period");
});

test("R6: seed passes the Worker's wording lint and item validation (no guarantee / fix-luck / fear / price / purchase / link / phone)", async () => {
  const B = await backend(), S = seed();
  for (const it of S) {
    for (const f of ["title", "body", "place", "area"]) if (it[f]) for (const l of LANGS) assert.deepEqual(B.lintMerit(it[f][l]), [], `${it.id}.${f}.${l}: ${it[f][l]}`);
    const r = B.cleanItem({ ...it });
    assert.equal(r.id, it.id);
  }
});

test("R6: no real temple fees or amounts anywhere in the seed (no digits next to baht / yuan / THB)", () => {
  const txt = JSON.stringify(seed());
  assert.ok(!/\d\s*(?:บาท|฿|baht|THB|元|铢)/i.test(txt), "no amounts");
  assert.ok(!/https?:|www\./i.test(txt), "no links");
});

/* ---------------- R7 UI wording ---------------- */
test("R7: UI strings complete in TH/EN/ZH (same keys) and free of countdown / scarcity / guarantee / fix-luck / fear wording", async () => {
  const C = core(), B = await backend();
  const keys = Object.keys(C.UI.th).sort();
  assert.ok(keys.length >= 25, "UI keys: " + keys.length);
  for (const l of ["en", "zh"]) assert.deepEqual(Object.keys(C.UI[l]).sort(), keys, l + " has every key");
  for (const l of LANGS) for (const k of keys) {
    const v = C.UI[l][k];
    assert.ok(typeof v === "string" && v.trim(), `${l}.${k}`);
    if (l !== "th") assert.ok(!THAI.test(v), `${l}.${k} has Thai: ${v}`);
    const hits = B.lintMerit(v, { only: ["urgency", "guarantee", "fix_luck", "fear", "lottery", "health"] });
    assert.deepEqual(hits, [], `${l}.${k}: ${v}`);
  }
  const all = JSON.stringify(C.UI);
  for (const w of [/นับถอยหลัง/, /เหลือเพียง/, /countdown/i, /hurry/i, /only \d+ left/i, /limited/i, /倒计时/, /仅剩/, /限时/]) assert.ok(!w.test(all), String(w));
});

/* ---------------- R8 crisis parity ---------------- */
// Review amendment 2026-11-12: the Worker no longer keeps a copy of the patterns; it calls the fortune pages' own
// FortuneAI.crisis.check (imported from fortune-ai.js), so a pattern change there applies to both automatically.
test("R8: the Worker's crisis check is the fortune pages' crisis net (fortune-ai.js) — one rule set on device and server", async () => {
  const B = await backend(), FA = require("../../fortune-ai.js");
  for (const t of ["ควรฆ่าตัวตายดีไหม", "I can't go on anymore", "活着好累", "โดนทำร้ายร่างกาย"]) {
    assert.equal(B.crisisCheck(t), true, t); assert.equal(FA.crisis.check(t), true, t);
  }
  for (const t of ["สมชาย", "Somchai", "小明", "line: somchai_88"]) { assert.equal(B.crisisCheck(t), false, t); assert.equal(FA.crisis.check(t), false, t); }
  assert.ok(!/const CRISIS_(TH|EN|ZH) =/.test(readFileSync(join(ROOT, "backend", "src", "merit.js"), "utf8")), "no copied patterns");
});
