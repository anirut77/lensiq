"use strict";
// tests/unit/compat-v2.test.js — FIXED TEST SET, Compatibility v2 (ดวงสมพงษ์ v2), owner night order A6 2026-11-20 ("Compatibility
// v2, behind its switch"), spec = the owner's eight points of 2026-11-17 (~/Desktop/LENSIQ-review/compat-v2/PLAN-TH.md §1).
// Written and locked (~/LENSIQ-field/evals/compat-v2/, evals-locks/compat-v2.sha256) BEFORE compat-v2.js exists, on branch
// compat-v2 (base 653029d3 = origin/main). Browser half: tests/e2e/compat-v2.e2e.mjs.
//
// Scope of this increment (slice 1): owner points 1 (each category opens with one plain sentence, then the reason from the
// methods, then what to do), 2 (level per category with label + icon + colour, one overall harmony view, "not a verdict"), 5
// (free / paid split unchanged, every caution and its step free), 6 in part (no score figures on the page, plan C3 ข), 8 (hard
// limits, crisis v3). Points 3 (A / B / together wording), 4 (belief guidance), 7 (icon set, print / share) and the business
// wording split (plan C4) wait for the research of point 6 (two sources per rule) and are NOT tested here.
//
// The contract (compat-v2.js, UMD: module.exports in Node, window.LQCompatV2 in the page; uses compat.js, which is unchanged):
//   LABEL[lang][lean]   lean fit / mixed / care -> th เสริมกัน / ไปด้วยกันได้ / ต้องใส่ใจ, en Supports each other / Goes along well
//                       enough / Needs some care, zh 相互助力 / 可以同行 / 需要留心 (plan C2, the owner's own example words)
//   ICONS[lean]         one 24x24 stroke path per level (a level icon, not the category icon)
//   NOT_VERDICT[lang]   the fixed line under the levels
//   view(res, {lang, tier, names, rel}) -> null for a group result; for a pair:
//     { v: 2, lang, tier, mode: "pair", title, names, harmony: {lean, word, icon, lines[]}, notVerdict,
//       levels[7]: {cat, title, lean, label, icon, color},
//       cats[7]: {id, title, lean, label, icon, opener, source, detail, paid, because[], cautions[{text, step}], todo[]},
//       methods[]: {id, name, lines[]} }
// Every reading text of v2 comes from the rules compat.js already applies (sources docs/COMPAT-SOURCES.md): the level is the
// existing per-category lean, "because" lines are the existing method texts (method name first = the source), cautions and
// steps are the existing ones; the opener names its source (the methods whose own lean matches the category's level).
//
// W0 switch: lensiq-config.js turns LENSIQ_COMPAT_V2 on only when it is exactly true; nothing in the repo sets it true; compat.html
//    does not load compat-v2.js (compat-ui.js loads it on demand, only behind the switch); the v1 engine, texts, styles and
//    dictionaries are byte-identical to origin/main 653029d3 (the rendered page with the switch off: e2e O1).
// W1 determinism: the same pair gives an identical v2 view.
// W2 levels: 7 rows in category order, label / icon / colour each present, lean = the v1 lean of that category; harmony lean =
//    the v1 overall lean; the approved labels and the not-a-verdict line in TH / EN / ZH.
// W3 structure: every category opens with one sentence naming both people, then a source line naming at least one method;
//    (or, when no method gives any sign in that area, the fixed line T.srcNone); 7 different openers per reading; no stock opener;
//    categories with detail and at least one sign have a reason or a caution; every category with detail has ways to act;
//    every "because" line starts with its method's name.
// W4 one data set: the harmony lines never say "nothing to watch" while any category has a caution or the care level, and say
//    it when none has.
// W5 no score figures: no "x/y", "x of y", "จาก n", "%", score words in any v2 string.
// W6 free / paid: free = detail for communication and values only, all 7 levels and openers, every caution of every category
//    with its step (rule a), nothing marked paid; full = detail everywhere, the five other categories marked paid.
// W7 hard limits TH / EN / ZH over 240 pairs x 4 relation types (full tier): the locked BAN lists of fortune-compat.test.js,
//    plus no price, buying, lucky numbers; EN / ZH carry no Thai; ZH carries Chinese.
// W8 group: view() returns null (the group page stays v1 in this slice).
// W9 privacy and crisis (static): compat-v2.js makes no network call and uses no storage; it draws no remedy, plan, price or
//    phone link (the closing 1323 line stays compat-ui.js's job, crisis v3).
// W10 texts complete: every v2 text table has TH / EN / ZH, EN without Thai, ZH with Chinese.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const sha = f => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
const LANGS = ["th", "en", "zh"];
const CATS = ["communication", "values", "money", "daily", "work", "decisions", "longterm"];
const FREE = ["communication", "values"];
const ENGINE = "vendor/astronomy-engine/astronomy.browser.min.js";
const C = () => require(path.join(ROOT, "compat.js"));
const V = () => require(path.join(ROOT, "compat-v2.js"));
let AE = null;
function astronomy() {
  if (AE) return AE;
  const ctx = {}; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read(ENGINE), ctx);
  return (AE = ctx.Astronomy);
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function birth(r, withTime) {
  const y = 1950 + Math.floor(r() * 58), m = 1 + Math.floor(r() * 12), d = 1 + Math.floor(r() * 28);
  return { y, m, d, time: withTime ? { h: Math.floor(r() * 24), mi: Math.floor(r() * 60) } : null, tz: 7 };
}
const RELS = ["couple", "family", "friends", "business"];
let SYN = null;
function syn() {
  if (SYN) return SYN;
  const L = C(), A = astronomy(), r = rng(20261121), pairs = [];
  for (let i = 0; i < 240; i++) {
    const pa = L.person(birth(r, i % 3 !== 0), { astronomy: A }), pb = L.person(birth(r, i % 2 === 0), { astronomy: A });
    pairs.push({ res: L.pair(pa, pb, { rel: RELS[i % 4] }), rel: RELS[i % 4] });
  }
  const g = [0, 1, 2].map(() => L.person(birth(r, false), { astronomy: A }));
  return (SYN = { pairs, group: L.group(g, { rel: "team" }) });
}
const SKIP = new Set(["icon", "catIcon", "color", "id", "cat", "lean", "lang", "tier", "mode", "v", "workUse"]);
function strings(o, out = []) {
  if (typeof o === "string") out.push(o);
  else if (Array.isArray(o)) o.forEach(x => strings(x, out));
  else if (o && typeof o === "object") for (const k of Object.keys(o)) if (!SKIP.has(k)) strings(o[k], out);
  return out;
}
const APPROVED = {
  th: { fit: "เสริมกัน", mixed: "ไปด้วยกันได้", care: "ต้องใส่ใจ" },
  en: { fit: "Supports each other", mixed: "Goes along well enough", care: "Needs some care" },
  zh: { fit: "相互助力", mixed: "可以同行", care: "需要留心" },
};
const NOT_VERDICT = {
  th: "ระดับนี้บอกว่าเรื่องไหนควรใส่ใจ ไม่ใช่คำตัดสินความสัมพันธ์",
  en: "These levels show where to put care; they are not a verdict on the relationship.",
  zh: "这些等级只说明哪里需要用心，并不是对关系的评判。",
};
const SHORT = { th: ["ตำราไทย", "ปาจื้อ", "พระเวท", "ตะวันตก"], en: ["Thai", "BaZi", "Vedic", "Western"], zh: ["泰式", "八字", "吠陀", "西洋"] };
const PREFIX = { th: SHORT.th.map(s => s + ": "), en: SHORT.en.map(s => s + ": "), zh: SHORT.zh.map(s => s + "：") };
const THAI = /[฀-๿]/, CJK = /[一-鿿]/;

test("W0 switch off by default, lazy and v1 files unchanged", () => {
  const cfg = read("lensiq-config.js");
  assert.match(cfg, /window\.LENSIQ_COMPAT_V2 = window\.LENSIQ_COMPAT_V2 === true;/, "config: on only when exactly true");
  const files = fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f));
  for (const f of files) assert.ok(!/LENSIQ_COMPAT_V2\s*=\s*true\b/.test(read(f)), f + " must not switch v2 on");
  assert.ok(!/compat-v2\.js/.test(read("compat.html")), "compat.html does not load compat-v2.js");
  const ui = read("compat-ui.js");
  assert.equal((ui.match(/compat-v2\.js/g) || []).length, 1, "compat-ui.js names compat-v2.js once (the on-demand loader)");
  assert.match(ui, /LENSIQ_COMPAT_V2 === true/, "compat-ui.js reads the switch as exactly true");
  const MAIN = {
    "compat.js": "4562ab59e4ba8b5bc1d11ef11edf8b90ba9f42f83b65778419345db9eb737c9d",
    "compat-kb.js": "1bf95cb66881e52172854978ceaaf5fc0996c01568e3da7527298fbe4c5fff1c",
    "compat.css": "61d3a37169afbed4e4f02b91960d4c08e12d133fcfe4a5154aac720c18daea11",
    "i18n/en-compat.js": "9f6f5aa77e9eb755b3e1caf2688c91f74fa26044b4d0a4ae0959765ff7a0b85c",
    "i18n/zh-compat.js": "092770342461192fd093ca31f76954bd169ca22fe67b3c755481be2dddc8390b",
  };
  for (const [f, h] of Object.entries(MAIN)) assert.equal(sha(f), h, f + " is byte-identical to origin/main 653029d3");
});

test("W1 determinism", () => {
  const { pairs } = syn();
  for (const p of pairs.slice(0, 40)) for (const lang of LANGS) {
    const o = { lang, tier: "full", names: ["Ann", "Ben"], rel: p.rel };
    assert.deepEqual(V().view(p.res, o), V().view(p.res, o));
  }
});

test("W2 levels: label + icon + colour, same data as v1, approved words, not-a-verdict line", () => {
  const L = C(), W = V();
  for (const lang of LANGS) {
    assert.deepEqual(W.LABEL[lang], APPROVED[lang], lang + " labels");
    assert.equal(W.NOT_VERDICT[lang], NOT_VERDICT[lang], lang + " not-a-verdict line");
  }
  for (const k of ["fit", "mixed", "care"]) assert.ok(typeof W.ICONS[k] === "string" && /^M[\d\s.,A-Za-z-]+$/.test(W.ICONS[k]), "icon path " + k);
  assert.equal(new Set(Object.values(W.ICONS)).size, 3, "three different level icons");
  const { pairs } = syn();
  for (const p of pairs) for (const lang of LANGS) {
    const v = W.view(p.res, { lang, tier: "free", names: ["Ann", "Ben"], rel: p.rel });
    const rep = L.report(p.res, { lang, tier: "free", names: ["Ann", "Ben"], rel: p.rel });
    assert.equal(v.v, 2); assert.equal(v.mode, "pair"); assert.equal(v.lang, lang);
    assert.deepEqual(v.levels.map(x => x.cat), CATS);
    v.levels.forEach((x, i) => {
      assert.equal(x.lean, rep.overview.wheel[i].lean, "lean from the same data");
      assert.equal(x.label, APPROVED[lang][x.lean]);
      assert.equal(x.icon, W.ICONS[x.lean]);
      assert.match(x.color, /^#[0-9a-f]{6}$/i);
      assert.ok(x.title && x.title === rep.overview.wheel[i].title);
    });
    assert.equal(v.harmony.lean, rep.overview.lean);
    assert.equal(v.harmony.word, APPROVED[lang][v.harmony.lean]);
    assert.equal(v.harmony.icon, W.ICONS[v.harmony.lean]);
    assert.equal(v.notVerdict, NOT_VERDICT[lang]);
  }
});

test("W3 structure: opener sentence, source, reason, what to do", () => {
  const W = V(), { pairs } = syn();
  const STOCK = { th: /^(ภาพรวมเป็น|ความสัมพันธ์นี้|โดยรวมแล้ว)/, en: /^(Overall|In general|This relationship)/, zh: /^(总体|整体来看|这段关系)/ };
  let withBecause = 0;
  for (const p of pairs) for (const lang of LANGS) for (const names of [["Ann", "Ben"], ["", ""]]) {
    const v = W.view(p.res, { lang, tier: "full", names, rel: p.rel });
    const nm = v.names;
    assert.equal(nm.length, 2); assert.ok(nm[0] && nm[1], "default names fill empty nicknames");
    if (names[0]) assert.deepEqual(nm, names);
    assert.deepEqual(v.cats.map(c => c.id), CATS);
    assert.equal(new Set(v.cats.map(c => c.opener)).size, 7, "7 different openers");
    for (const c of v.cats) {
      assert.ok(c.opener.includes(nm[0]) && c.opener.includes(nm[1]), `[${lang}] opener names both: ${c.opener}`);
      assert.ok(!STOCK[lang].test(c.opener), `[${lang}] stock opener: ${c.opener}`);
      const sigs = p.res.categories[c.id].signals.length;
      assert.ok(c.source, "source line");
      if (sigs) assert.ok(SHORT[lang].some(s => c.source.includes(s)), `[${lang}] source names a method: ${c.source}`);
      else assert.equal(c.source, W.T[lang].srcNone, `[${lang}] no method gives a sign here, and the source line says so`);
      assert.equal(c.label, APPROVED[lang][c.lean]);
      assert.ok(c.detail, "full tier: every category has detail");
      if (sigs) assert.ok(c.because.length + c.cautions.length >= 1, `[${lang}] ${c.id}: a reason or a caution`);
      assert.ok(c.todo.length >= 1, `[${lang}] ${c.id}: ways to act`);
      for (const b of c.because) assert.ok(PREFIX[lang].some(x => b.startsWith(x)), `[${lang}] because line starts with its method: ${b}`);
      for (const k of c.cautions) assert.ok(k.text && k.step, "caution with its step");
      if (c.because.length) withBecause++;
    }
  }
  assert.ok(withBecause > 1000, "reasons are given: " + withBecause);
});

test("W4 harmony lines and cautions come from one data set", () => {
  const W = V(), { pairs } = syn();
  let none = 0, some = 0;
  for (const p of pairs) for (const lang of LANGS) {
    const v = W.view(p.res, { lang, tier: "free", names: ["Ann", "Ben"], rel: p.rel });
    const anyCare = v.cats.some(c => c.cautions.length || c.lean === "care");
    const saysNone = v.harmony.lines.includes(W.T[lang].none);
    assert.equal(saysNone, !anyCare, `[${lang}] "nothing to watch" only when nothing is flagged`);
    if (anyCare) some++; else none++;
    assert.ok(v.harmony.lines.length >= 1);
  }
  assert.ok(some > 0, "cases with care exist");
});

test("W5 no score figures anywhere in v2", () => {
  const W = V(), { pairs } = syn();
  const SCORE = [/\d+(?:\.\d+)?\s*(?:\/|จาก|of)\s*\d+/i, /%/, /คะแนน/, /\bscor\w*/i, /\d\s*points?\b/i, /满分|得分|分数|原始分|\d\s*分/, /\/100/];
  for (const p of pairs) for (const lang of LANGS) for (const tier of ["free", "full"]) {
    const v = W.view(p.res, { lang, tier, names: ["Ann", "Ben"], rel: p.rel });
    for (const s of strings(v)) for (const re of SCORE) assert.ok(!re.test(s), `[${lang}] score figure ${re}: ${s}`);
  }
});

test("W6 free / paid split; every caution and its step stays free (rule a)", () => {
  const L = C(), W = V(), { pairs } = syn();
  for (const p of pairs) for (const lang of LANGS) {
    const free = W.view(p.res, { lang, tier: "free", names: ["Ann", "Ben"], rel: p.rel });
    const full = W.view(p.res, { lang, tier: "full", names: ["Ann", "Ben"], rel: p.rel });
    const v1 = L.report(p.res, { lang, tier: "full", names: ["Ann", "Ben"], rel: p.rel });
    assert.equal(free.tier, "free"); assert.equal(full.tier, "full");
    for (const c of free.cats) {
      assert.equal(c.detail, FREE.includes(c.id), "free detail only for communication and values");
      assert.equal(c.paid, false, "nothing marked paid in the free tier");
      assert.ok(c.opener && c.label, "every category keeps its opener and level");
      if (!c.detail) { assert.equal(c.because.length, 0); assert.equal(c.todo.length, 0); }
      const v1s = v1.sections.find(s => s.id === c.id);
      assert.equal(c.cautions.length, v1s.care.length, `[${lang}] ${c.id}: every caution free`);
      c.cautions.forEach((k, i) => assert.equal(k.step, v1s.steps[i], "the same step"));
    }
    for (const c of full.cats) {
      assert.equal(c.detail, true);
      assert.equal(c.paid, !FREE.includes(c.id), "full: the five other categories are marked paid");
    }
  }
});

const BAN = {
  th: [/เลิก(?:กัน|รา|คบ|ร่วม|หุ้น|ทำ)|หย่า|แยกทาง|ถอนหมั้น|ตัดขาด|ยุติ(?:ความสัมพันธ์|การ|หุ้นส่วน|ธุรกิจ)|ไม่(?:ควร|ต้อง)(?:แต่ง|คบ|อยู่ด้วยกัน|ร่วมงาน|ร่วมหุ้น|ทำธุรกิจ)|(?:ห้าม|อย่า)(?:แต่ง|คบ|ร่วม)/,
    /ไม่เข้ากัน|เข้ากันไม่ได้|ไปด้วยกันไม่ได้|ไม่คู่ควร|ดวงไม่สมพงษ์|คู่กันไม่ได้|ไม่ถูกโฉลก/,
    /ถ้าไม่(?:แก้|ทำพิธี|บูชา|จ่าย|ซื้อ)|มิฉะนั้น|ไม่งั้น|ต้อง(?:แก้กรรม|ทำพิธี|สะเดาะ|ซื้อ|จ่าย)|รีบ(?:แก้|ทำพิธี|ซื้อ)|สะเดาะเคราะห์/,
    /ตาย|เสียชีวิต|อายุสั้น|เป็นม่าย|อุบัติเหตุ|โรคร้าย|ระยะสุดท้าย|หยุดยา|เลิกยา|ลงทุนใน|ซื้อหุ้น|หวย|เลขเด็ด|ลอตเตอรี่|โกหก|จับเท็จ|อารมณ์ของอีกฝ่าย/,
    /ราคา|บาท|฿|ซื้อ|ชำระเงิน|เลขนำโชค/],
  en: [/\b(?:break(?:ing)? up|breakup|divorc\w*|split(?:ting)? up|separat(?:e|ion) from|end (?:the|your|this|a) (?:relationship|marriage|partnership|business)|call(?:ing)? off|walk away|leave (?:him|her|them|your partner))\b/i,
    /\b(?:should(?:n't| not) marry|do not marry|don't marry|must not marry|not (?:be )?married)\b/i,
    /\b(?:incompatib\w*|not compatible|bad match|poor match|doomed|ill-?fated|cursed)\b/i,
    /\b(?:unless you (?:pay|buy|perform)|or else|pay (?:for|to) (?:fix|remove|cancel)|remedy ritual|buy (?:an?|this) (?:amulet|ritual)|dosha removal)\b/i,
    /\b(?:death|dies?|dying|widow\w*|accident\w*|terminal|fatal|stop (?:taking )?(?:your )?medication|invest in|buy (?:stocks|shares|crypto)|lottery|lucky numbers?|lying|liar|deception)\b/i,
    /\b(?:price|buy|purchase|checkout|baht)\b|\$|฿/i],
  zh: [/分手|离婚|分开吧|散伙|拆伙|断绝|结束(?:关系|婚姻|合作|生意)|不宜结婚|不要结婚|不能结婚|别结婚|不要在一起/,
    /不相配|合不来|不般配|八字不合|相克到底|注定失败|没有缘分/,
    /否则|除非你|化解费|必须做法事|花钱消灾|买护身符/,
    /死|丧偶|寡|意外事故|绝症|停药|投资于|买股票|彩票|中奖号码|撒谎|测谎|欺骗/,
    /价格|购买|付款|泰铢|幸运数字/],
};
test("W7 hard limits TH / EN / ZH over 240 pairs x 4 relation types (full tier)", () => {
  const W = V(), { pairs } = syn();
  let n = 0;
  for (const lang of LANGS) for (const p of pairs) {
    const v = W.view(p.res, { lang, tier: "full", names: ["Ann", "Ben"], rel: p.rel });
    const all = strings(v);
    for (const s of all) {
      n++;
      for (const re of BAN[lang]) assert.ok(!re.test(s), `[${lang}] banned wording ${re}: ${s}`);
      if (lang !== "th") assert.ok(!THAI.test(s), `[${lang}] Thai text: ${s}`);
    }
    if (lang === "zh") assert.ok(CJK.test(all.join("")), "ZH view is in Chinese");
  }
  assert.ok(n > 30000, "checked " + n + " strings");
});

test("W8 group stays v1 in this slice", () => {
  assert.equal(V().view(syn().group, { lang: "th", tier: "free", names: [] }), null);
});

test("W9 privacy and crisis (static): no network, no storage, no remedy, plan, price or phone link in compat-v2.js", () => {
  const src = read("compat-v2.js");
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /WebSocket/, /\bimport\s*\(/, /document\.cookie/, /EventSource/])
    assert.ok(!re.test(src), "compat-v2.js: " + re);
  for (const re of [/data-lq-remedy/, /tel:/, /LQMerit|lensiq-merit/, /data-lq-plan/, /LENSIQ_FORTUNE_PLAN/, /fortune-caution/])
    assert.ok(!re.test(src), "compat-v2.js draws no " + re);
  const paid = src.match(/data-lq-paid[^\n]*/g) || [];
  for (const l of paid) assert.match(l, /compat/, "only the existing compat paid marker: " + l);
});

test("W10 v2 texts complete in TH / EN / ZH", () => {
  const W = V();
  for (const table of ["LABEL", "NOT_VERDICT", "T", "OPEN"]) {
    assert.ok(W[table], table);
    for (const lang of LANGS) assert.ok(W[table][lang], table + "." + lang);
    const keys = o => (o && typeof o === "object" ? Object.keys(o).sort() : []);
    assert.deepEqual(keys(W[table].en), keys(W[table].th), table + " en keys = th keys");
    assert.deepEqual(keys(W[table].zh), keys(W[table].th), table + " zh keys = th keys");
    for (const s of strings(W[table].en)) assert.ok(!THAI.test(s) && s.trim(), table + " en: " + s);
    for (const s of strings(W[table].zh)) assert.ok(!THAI.test(s) && s.trim(), table + " zh: " + s);
    for (const s of strings(W[table].th)) assert.ok(s.trim(), table + " th empty");
  }
  for (const cat of CATS) for (const lean of ["fit", "mixed", "care"]) for (const lang of LANGS) {
    const s = W.OPEN[lang][cat][lean];
    assert.ok(s.includes("{a}") && s.includes("{b}"), `OPEN ${lang} ${cat} ${lean} names both`);
    if (lang === "zh") assert.ok(CJK.test(s));
  }
});
