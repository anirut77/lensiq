"use strict";
// tests/unit/pc-claims.test.js — Product Check P3: over-claim rules (lensiq-claims.js + lensiq-claims-rules.js).
// FIXED SET, written before any rule was tuned. Every string here is SYNTHETIC (typed for the test, no real product, no
// text from the labelled set). These tests check behaviour, not accuracy: accuracy numbers come only from
// tools/pc-claims-eval.mjs on the held-out split (docs/product-check/P3-RESULTS.md).
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const C = require("../../lensiq-claims.js");

const ids = (text, opts) => [...new Set(C.detect(text, opts).map(f => f.rule_id))].sort();
const has = (text, opts, id) => ids(text, opts).includes(id);

/** Every flag points at an exact substring of the ORIGINAL text. */
function assertExactSpans(text, flags) {
  for (const f of flags) {
    if (f.absence) continue;
    assert.equal(typeof f.span.start, "number");
    assert.ok(f.span.start >= 0 && f.span.end <= text.length && f.span.end > f.span.start, JSON.stringify(f.span));
    assert.equal(f.text, text.slice(f.span.start, f.span.end), `${f.rule_id} span text`);
  }
}

test("module shape: detect / normalize / explain / RULES; browser global name", () => {
  for (const k of ["detect", "normalize", "explain", "missingWarnings"]) assert.equal(typeof C[k], "function", k);
  assert.ok(Array.isArray(C.RULES) && C.RULES.length >= 49, "all rules of the draft are kept");
  assert.ok(Array.isArray(C.ALLOW) && C.ALLOW.length >= 100, "nutrient-function allowlist present");
  const src = require("node:fs").readFileSync(path.join(ROOT, "lensiq-claims.js"), "utf8");
  assert.match(src, /LQClaims/);
});

test("flag fields: rule_id, family, span, exact text, severity, basis, url, explain th/en/zh", () => {
  const t = "ผลิตภัณฑ์เสริมอาหาร ลดน้ำหนัก เห็นผลเร็ว";
  const flags = C.detect(t, { category: "supplement", lang: "th" });
  assert.ok(flags.length >= 2);
  for (const f of flags) {
    assert.match(f.rule_id, /^[DFHC]\d{2}$/);
    assert.equal(f.family, f.rule_id[0]);
    assert.ok(["risk", "low"].includes(f.severity));
    assert.ok(f.basis && /^https?:\/\//.test(f.url));
    for (const l of ["th", "en", "zh"]) assert.ok(f.explain[l] && f.explain[l].length > 10, l);
  }
  assertExactSpans(t, flags);
});

/* ---------- each family: one positive and one negative (synthetic) ---------- */

test("D (drug): complete-cure and s.77 disease claims fire; a minor registered-style indication does not", () => {
  assert.ok(has("ยาแก้ไอตัวนี้รักษาหายขาดภายในวันเดียว", { category: "drug" }, "D01"));
  assert.ok(has("ยานี้รักษาโรคเบาหวานได้", { category: "drug" }, "D08"));
  assert.ok(has("This tonic cures cancer", { category: "drug", lang: "en" }, "D08"));
  assert.deepEqual(ids("บรรเทาอาการปวดศีรษะ ตัวร้อน", { category: "drug" }), []);
  assert.deepEqual(ids("For the temporary relief of minor aches and pains", { category: "drug", lang: "en" }), []);
});

test("D08 / F09 / H05 need a claim verb: a plain disease mention does not fire", () => {
  assert.ok(!has("ผู้ป่วยเบาหวานควรปรึกษาแพทย์ก่อนใช้", { category: "drug" }, "D08"));
  assert.ok(!has("Ask a doctor before use if you have diabetes", { category: "drug", lang: "en" }, "D08"));
  assert.ok(!has("ผู้ป่วยโรคไตควรปรึกษาแพทย์", { category: "supplement" }, "F09"));
  assert.ok(has("ช่วยรักษาโรคเกาต์", { category: "supplement" }, "F09"));
  assert.ok(has("สมุนไพรต้านมะเร็ง", { category: "herbal" }, "H05"));
  assert.ok(!has("ห้ามใช้ในผู้ป่วยโรคตับ", { category: "herbal" }, "H05"));
});

test("F (food / supplement): weight, fast-result, disease-marker and endorsement claims; plain nutrient facts pass", () => {
  assert.deepEqual(ids("ลดน้ำหนัก เห็นผลใน 7 วัน", { category: "supplement" }).filter(i => ["F06", "F13"].includes(i)), ["F06", "F13"]);
  assert.ok(has("ช่วยลดน้ำตาลในเลือด", { category: "supplement" }, "F07"));
  assert.ok(has("แพทย์แนะนำ ทานทุกวัน", { category: "supplement" }, "F14"));
  assert.ok(has("Miracle formula, no side effects", { category: "supplement", lang: "en" }, "F01"));
  assert.ok(has("Miracle formula, no side effects", { category: "supplement", lang: "en" }, "F04"));
  assert.ok(has("零副作用", { category: "supplement", lang: "zh" }, "F04"));
  assert.deepEqual(ids("แหล่งของแคลเซียม โปรตีนสูง ไม่เติมผงชูรส", { category: "food" }), []);
  assert.deepEqual(ids("Good source of calcium. No added sugar.", { category: "food", lang: "en" }), []);
});

test("H (herbal): miracle and endorsement claims fire; a traditional indication passes", () => {
  assert.ok(has("ยาสมุนไพรศักดิ์สิทธิ์ หายขาด", { category: "herbal" }, "H01"));
  assert.deepEqual(ids("บรรเทาอาการท้องอืด ท้องเฟ้อ", { category: "herbal" }), []);
});

test("C (cosmetic): treat, permanent and aphrodisiac claims fire; a normal cosmetic purpose passes", () => {
  const got = ids("ครีมรักษาสิว ขาวถาวร", { category: "cosmetic" });
  assert.ok(got.includes("C01") && got.includes("C03"), got.join());
  assert.ok(has("เจลฉีดผิวขาว", { category: "cosmetic" }, "C07"));
  assert.deepEqual(ids("ช่วยให้ผิวชุ่มชื้น ทำความสะอาดผิวหน้า", { category: "cosmetic" }), []);
  assert.deepEqual(ids("Moisturises and cleanses the skin", { category: "cosmetic", lang: "en" }), []);
});

test("per-rule category scope: a cosmetic rule never fires on a drug text and vice versa", () => {
  assert.ok(!ids("ขาวถาวร", { category: "drug" }).some(i => i[0] !== "D"));
  assert.ok(!ids("รักษาหายขาด", { category: "cosmetic" }).some(i => i[0] !== "C"));
  assert.ok(ids("ลดน้ำหนัก", { category: "food" }).every(i => i[0] === "F"));
  assert.ok(ids("สมุนไพรศักดิ์สิทธิ์", { category: "herbal" }).every(i => i[0] === "H"));
  // F22 (infant food) is food-only, F15 is supplement-only
  assert.ok(has("นมผงสำหรับทารก", { category: "food" }, "F22"));
  assert.ok(!has("นมผงสำหรับทารก", { category: "supplement" }, "F22"));
});

/* ---------- normalisation keeps exact spans ---------- */

test("normalize: zero-width removed, full-width folded, Thai digits to Arabic, whitespace folded, map back exact", () => {
  const n = C.normalize("Ａ​ｂ  ๑๒ x");
  assert.equal(n.text, "Ab 12 x");
  assert.equal(n.start.length, n.text.length);
  assert.equal(n.end.length, n.text.length);
  const n2 = C.normalize("“quoted” – dash");
  assert.equal(n2.text, "\"quoted\" - dash");
  // decomposed sara am (nikhahit + aa) and the tone-before-nikhahit order are folded to the composed form
  assert.equal(C.normalize("น้ํา").text, "น้ำ");
  assert.equal(C.normalize("นํ้า").text, "น้ำ");
});

test("span exactness after normalisation (zero-width, full-width, Thai digits, extra spaces, decomposed sara am)", () => {
  const cases = [
    ["ยานี้หาย​ขาดแน่นอน", { category: "drug" }, "D01", "หาย​ขาด"],
    ["สูตรนี้ ได้ผล１００％ effective", { category: "drug" }, "D02", null],
    ["เห็นผลใน ๗ วัน", { category: "supplement" }, "F06", null],
    ["ไม่มี   ผลข้างเคียง", { category: "supplement" }, "F04", "ไม่มี   ผลข้างเคียง"],
    ["ช่วยลดน้ําตาลในเลือด", { category: "supplement" }, "F07", null],
    ["﻿No  side‑effects at all", { category: "supplement", lang: "en" }, "F04", null]
  ];
  for (const [t, o, id, exact] of cases) {
    const flags = C.detect(t, o);
    const f = flags.find(x => x.rule_id === id);
    assert.ok(f, `${id} on ${JSON.stringify(t)} -> ${flags.map(x => x.rule_id)}`);
    assertExactSpans(t, flags);
    if (exact) assert.equal(f.text, exact);
    assert.ok(!/^[\s​﻿]/.test(f.text) && !/\s$/.test(f.text), "span is trimmed: " + JSON.stringify(f.text));
  }
});

/* ---------- F18 context gating ---------- */

test("F18 fires only with kratom / cannabis / hemp / CBD context (in the text or the product record)", () => {
  assert.ok(!has("ชาสมุนไพร ช่วยให้หลับลึก ผ่อนคลาย", { category: "food" }, "F18"));
  assert.ok(!has("Chamomile tea to relax before sleep", { category: "food", lang: "en" }, "F18"));
  assert.ok(has("น้ำมันกัญชง ช่วยให้หลับลึก", { category: "food" }, "F18"));
  assert.ok(has("CBD gummies for deep sleep and stress relief", { category: "food", lang: "en" }, "F18"));
  assert.ok(has("ช่วยให้หลับลึก", { category: "food", context: "เครื่องดื่มผสมสารสกัดกัญชา" }, "F18"));
  const t = "ผลิตภัณฑ์มีกระท่อม ทำงานทนขึ้น";
  const f = C.detect(t, { category: "supplement" }).find(x => x.rule_id === "F18");
  assert.ok(f);
  assert.equal(f.text, t.slice(f.span.start, f.span.end));
  assert.match(f.text, /ทำงานทน/);
});

/* ---------- อย. vs อย่าง ---------- */

test("the FDA abbreviation อย. matches; the word อย่าง does not", () => {
  assert.ok(has("ผ่าน อย. รับรองแล้ว", { category: "supplement" }, "F05"));
  assert.ok(has("ผ่านอย.", { category: "food" }, "F05"));
  assert.ok(!has("ผ่านอย่างปลอดภัยทุกขั้นตอน", { category: "food" }, "F05"));
  assert.ok(!has("ผลิตอย่างพิถีพิถัน รับรองความอร่อย", { category: "food" }, "F05"));
  assert.ok(has("ครีมนี้ อย.รับรอง", { category: "cosmetic" }, "C03"));
  assert.ok(!has("บำรุงผิวอย่างอ่อนโยน", { category: "cosmetic" }, "C03"));
});

/* ---------- allowlist of approved nutrient-function wording ---------- */

test("allowlist: approved Thai / English nutrient-function statements (MoPH No. 447 Annex 1) are not flagged", () => {
  assert.deepEqual(ids("แคลเซียมมีส่วนช่วยในกระบวนการสร้างกระดูกและฟันที่แข็งแรง", { category: "supplement" }), []);
  assert.deepEqual(ids("วิตามินซีมีส่วนช่วยในการทำหน้าที่ตามปกติของระบบภูมิคุ้มกัน", { category: "supplement" }), []);
  assert.deepEqual(ids("วิตามินซี มีส่วนช่วยในการทำหน้าที่ ตามปกติของระบบภูมิคุ้มกัน", { category: "supplement" }), [], "spacing does not matter");
  assert.deepEqual(ids("Vitamin C contributes to the normal function of the immune system.", { category: "supplement", lang: "en" }), []);
  // ...but the same nutrient with non-approved wording is still a risk signal
  assert.ok(has("แคลเซียมบำรุงกระดูก", { category: "supplement" }, "F10"));
  assert.ok(has("Vitamin C boosts your immune system", { category: "supplement", lang: "en" }, "F10"));
  // an approved line does not hide a different claim elsewhere in the same text
  assert.ok(has("แคลเซียมมีส่วนช่วยในกระบวนการสร้างกระดูกและฟันที่แข็งแรง ลดน้ำหนักเร็ว", { category: "supplement" }, "F13"));
  for (const a of C.ALLOW) assert.ok(/^https?:\/\//.test(a.url) && a.source && a.ref, "every allowlist entry has a source");
});

test("mandatory warnings and standard disclaimers are not read as claims", () => {
  assert.deepEqual(ids("ไม่มีผลในการป้องกันหรือรักษาโรค", { category: "supplement" }), []);
  assert.deepEqual(ids("ผลิตภัณฑ์นี้ไม่ใช้สำหรับรักษา บำบัด บรรเทา หรือป้องกันโรค", { category: "food" }), []);
  const dshea = "These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.";
  assert.deepEqual(ids(dshea, { category: "supplement", lang: "en" }), []);
});

/* ---------- F15 missing mandatory supplement warnings (whole label only) ---------- */

test("F15: only on a whole supplement label; lists the missing lines; silent when all are present", () => {
  const bare = "ผลิตภัณฑ์เสริมอาหาร ตรา ทดสอบ วิตามินซี 500 มก. รับประทานวันละ 1 เม็ด";
  const full = bare + " คำเตือน เด็กและสตรีมีครรภ์ไม่ควรรับประทาน ไม่มีผลในการป้องกันหรือรักษาโรค ควรกินอาหารหลากหลาย ครบ 5 หมู่ ในสัดส่วนที่เหมาะสมเป็นประจำ";
  const f = C.detect(bare, { category: "supplement", wholeLabel: true }).find(x => x.rule_id === "F15");
  assert.ok(f && f.absence === true);
  assert.ok(Array.isArray(f.missing) && f.missing.length >= 3, JSON.stringify(f.missing));
  assert.equal(f.text, "");
  assert.ok(!has(full, { category: "supplement", wholeLabel: true }, "F15"));
  assert.ok(!has(bare, { category: "supplement" }, "F15"), "not a whole label -> no absence check");
  assert.ok(!has(bare, { category: "food", wholeLabel: true }, "F15"), "F15 is supplement-only");
  // spacing / Thai digits in the warning lines do not matter
  const spaced = bare + " เด็ก และ สตรีมีครรภ์ ไม่ควรรับประทาน / ไม่มีผลในการป้องกัน หรือ รักษาโรค / ควรกินอาหารหลากหลาย ครบ ๕ หมู่";
  assert.ok(!has(spaced, { category: "supplement", wholeLabel: true }, "F15"));
  assert.deepEqual(C.missingWarnings(full), []);
});

/* ---------- wording: risk signal, never "illegal" ---------- */

test("every rule has a complete TH / EN / ZH explanation that says 'risk signal' and never 'illegal'", () => {
  const banned = /illegal|unlawful|ผิดกฎหมาย|违法|非法|不合法/i;
  for (const r of C.RULES) {
    const e = C.explain(r.id);
    for (const l of ["th", "en", "zh"]) {
      assert.ok(typeof e[l] === "string" && e[l].trim().length > 10, `${r.id} ${l}`);
      assert.ok(!banned.test(e[l]), `${r.id} ${l}: ${e[l]}`);
    }
    assert.match(e.en, /risk signal/i, r.id);
    assert.match(e.th, /สัญญาณเสี่ยง/, r.id);
    assert.match(e.zh, /风险信号/, r.id);
    assert.ok(/[฀-๿]/.test(e.th) && /[一-鿿]/.test(e.zh), r.id);
    assert.ok(r.title_zh && r.title_th && r.title_en, r.id + " titles");
  }
  // and no flag on a pile of claims carries a banned word anywhere in its output
  const flags = C.detect("ศักดิ์สิทธิ์ หายขาด 100% ไม่มีผลข้างเคียง อย.รับรอง ลดน้ำหนัก แพทย์แนะนำ", { category: "supplement" });
  assert.ok(flags.length >= 5);
  assert.ok(!banned.test(JSON.stringify(flags)));
});

test("robust input: empty / null / huge / regex-hostile text never throws; output is deterministic", (ctx) => {
  // Clock (owner decision 2026-11-12, option ก): the time budget below guards against runaway (catastrophic) regex work,
  // which is CPU work. Date.now reads this process's CPU time, so time spent waiting for a CPU on a loaded machine does
  // not count; a regex that burns CPU still does. lensiq-claims.js itself never reads the clock.
  ctx.mock.method(Date, "now", () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; });
  assert.deepEqual(C.detect("", { category: "drug" }), []);
  assert.deepEqual(C.detect(null, { category: "drug" }), []);
  assert.deepEqual(C.detect("(((((+*?[", { category: "cosmetic" }), []);
  const big = "ลดน้ำหนัก ".repeat(5000);
  const t0 = Date.now();
  const f = C.detect(big, { category: "food" });
  assert.ok(f.length >= 1 && Date.now() - t0 < 3000);
  const t = "ลดน้ำหนัก เห็นผลเร็ว แพทย์แนะนำ";
  assert.deepEqual(C.detect(t, { category: "supplement" }), C.detect(t, { category: "supplement" }));
});

// Added during P3 tuning (the engine gained the เ + เ fold and per-rule verb sets); the fixed tests above are unchanged.
test("normalize folds the typing slip เ + เ into แ with an exact span; per-rule verb sets keep prevention out of F09", () => {
  const t = "กล่องเป็นมิตรต่อสิ่งเเวดล้อม";
  const f = C.detect(t, { category: "food" }).find(x => x.rule_id === "F21");
  assert.ok(f);
  assert.equal(f.text, t.slice(f.span.start, f.span.end));
  assert.match(f.text, /เเวดล้อม$/);
  const p = ids("ช่วยป้องกันโรคหัวใจ", { category: "supplement" });
  assert.ok(p.includes("F08") && !p.includes("F09"), p.join());
  assert.ok(!has("ไม่ต้องอดอาหาร", { category: "supplement" }, "F09"), "ต้อ (cataract) does not match ต้อง (must)");
});

// Added after the independent P3 review (F1-F3); the fixed tests above are unchanged.
test("post-review F1: every English allowlist entry is a clean ASCII statement (no stray quote, bracket or Thai)", () => {
  for (const a of C.ALLOW.filter(x => x.lang === "en")) {
    assert.match(a.text, /^[\x20-\x7E]+$/, a.ref);
    assert.ok(!/[”“)(]/.test(a.text), a.ref + ": " + a.text);
    assert.match(a.text, /^[A-Z][a-z]/, a.ref);
  }
});

test("post-review F2: English storage / use-by instructions are not fast-result claims", () => {
  assert.ok(!has("Refrigerate after opening and consume within 3 days.", { category: "food", lang: "en" }, "F06"));
  assert.ok(!has("Use within 2 weeks of opening.", { category: "supplement", lang: "en" }, "F06"));
  assert.ok(!has("Best eaten within 24 hours", { category: "food", lang: "en" }, "F06"));
  assert.ok(has("See results within 3 days!", { category: "supplement", lang: "en" }, "F06"), "a real speed claim still fires");
});

test("post-review F3: no legal-verdict wording anywhere in the rules data file or the engine output wording", () => {
  const banned = /illegal|unlawful|违反|违法|非法|ผิดกฎหมาย/i;
  const src = require("node:fs").readFileSync(path.join(ROOT, "lensiq-claims-rules.js"), "utf8");
  const m = src.match(banned);
  assert.equal(m, null, m ? src.slice(Math.max(0, (m.index || 0) - 60), (m.index || 0) + 40) : "");
  assert.equal(C.DATA.wording.zh, "{rule} 风险信号");
});

test("lensiq-claims-rules.js is generated from tools/pc-rules-draft.json (build --check is clean)", () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, "tools", "pc-rules-build.mjs"), "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.match(out, /up to date/);
});
