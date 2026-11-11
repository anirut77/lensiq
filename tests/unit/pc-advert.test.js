"use strict";
// tests/unit/pc-advert.test.js — Product Check "advert" capture type (approved item 4, adverts option B: on-device rules
// only; docs/product-check/ADVERT-CAPTURE-PROPOSAL.md §8). FIXED SET, written and locked (sha256 in
// ~/LENSIQ-field/evals/adverts/locked.sha256) BEFORE lensiq-pc-advert.js was written and before any rule was changed.
// Every string here is SYNTHETIC (typed for this test: invented shops, handles, phone numbers and doctors; no text from
// any labelled set). Behaviour only, no accuracy number: dev figures come from tools/pc-advert-eval.mjs.
//
// What is fixed here:
//   1. kind "ad" on every result; the module has no network code and makes no request while analysing / rendering;
//   2. the card NEVER names the seller: shop names, page names, handles, LINE / WeChat IDs, phones, URLs, hashtags,
//      trademarked or CamelCase brand tokens and endorsers' names are absent from the card in TH / EN / ZH;
//   3. no verdict words (illegal / fake / scam ...) in any language, with or without signals; the card says it is about
//      the wording, not a legal finding and not about any seller; "no signal" is never "compliant";
//   4. evidence is the exact rule span when no seller part overlaps it; endorsement rules never quote the endorser;
//   5. a chosen product type is respected; a guessed one is said to be a guess; unknown -> every family runs;
//   6. TH / EN / ZH complete: every card string has an English and a Chinese entry, and an EN / ZH card has no Thai
//      outside translate="no" quotes;
//   7. no share / report / form controls; only https rule-basis links; HTML in the text is escaped.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const C = require("../../lensiq-claims.js");
const A = require("../../lensiq-pc-advert.js");

/** Dictionaries of a page file pushed into window.LQI18N_Q. @param {string} file */
function dict(file) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "i18n", file), "utf8"), ctx);
  return Object.assign({}, ...ctx.window.LQI18N_Q.map(q => q.en || q.zh || {}));
}
const EN = dict("en-med.js"), ZH = dict("zh-med.js");
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? String(v[x]) : m));
const tFor = lang => (k, th, v) => fill(lang === "en" ? (k in EN ? EN[k] : th) : lang === "zh" ? (k in ZH ? ZH[k] : th) : th, v);
const card = (res, lang) => A.cardHtml(res, { lang, t: tFor(lang) });
const THAI = /[ก-๙]/;
/** Text outside translate="no" elements (quotes of the advert keep their language). */
const outsideNoTranslate = html => html.replace(/<(\w+)[^>]*translate="no"[^>]*>[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " ");
const BAN = /illegal|unlawful|fake|counterfeit|scam|fraud|ผิดกฎหมาย|ปลอม|หลอกลวง|ฉ้อโกง|โกง|มิจฉาชีพ|违法|违反|假冒|假货|诈骗|欺诈|骗子/i;

// Synthetic adverts with seller identifiers in the usual places; `seller` lists every token that must never reach the card.
const ADS = [
  { text: "ร้านสวยใสช็อป ครีมขาวไว ใน 7 วัน รักษาสิวหายขาด แอดไลน์ @suayshop โทร 081-234-5678", seller: ["สวยใสช็อป", "suayshop", "081-234-5678", "0812345678"] },
  { text: "Sponsored\nGlowMax Official\nGlowMax® cures acne in 3 days! Order at www.glowmax-shop.com or LINE ID: glowmax99", seller: ["GlowMax", "glowmax-shop", "glowmax99"] },
  { text: "美丽坊旗舰店 本品三天根治糖尿病，无副作用 微信: meili888", seller: ["美丽坊", "meili888"] },
  { text: "นพ.สมมติ ทดสอบ แนะนำ ช่วยรักษาเบาหวานหายขาด ไม่มีผลข้างเคียง", seller: ["สมมติ", "ทดสอบ"] },
  { text: "by DrSlimTest: lose 10 kg in 7 days, guaranteed. Burn fat fast!", seller: ["DrSlimTest"] },
  { text: "SlimFitX ลดน้ำหนักได้ 10 กิโลใน 7 วัน เห็นผลจริง", seller: ["SlimFitX", "FitX"] },
  { text: "#ร้านป้าแดงสาธิต อาหารเสริมรักษาเบาหวาน ความดัน หายขาด 100%", seller: ["ป้าแดงสาธิต", "ร้านป้าแดง"] },
  { text: "Recommended by Dr. Testman Fakename: this supplement cures diabetes.", seller: ["Testman", "Fakename"] },
  { text: "เพจ สุขภาพดีสาธิต\nสมุนไพรรักษามะเร็ง หายขาดใน 30 วัน", seller: ["สุขภาพดีสาธิต"] },
  { text: "สั่งซื้อที่ https://shop.example.invalid/p/42 หรือ Line: @healthyexample ลดน้ำหนัก 5 กิโล ใน 7 วัน", seller: ["example.invalid", "healthyexample"] },
  { text: "Visit DemoHerbs Shop on fb.com/demoherbs.page — this herbal tea cures cancer, +66 81 234 5678", seller: ["DemoHerbs", "demoherbs", "81 234 5678"] },
  { text: "ยี่ห้อ ไวท์ซีเครทสาธิต เซรั่มหน้าขาวใส ใน 3 วัน", seller: ["ไวท์ซีเครทสาธิต"] },
  { text: "品牌：康乐宝示例 一周见效，根治高血压 电话 13812345678", seller: ["康乐宝示例", "13812345678"] }
];

test("module shape: browser global LQPCAdvert, kind 'ad', pure functions", () => {
  assert.equal(A.KIND, "ad");
  for (const k of ["analyze", "sellerSpans", "scrub", "guessCategory", "cardHtml"]) assert.equal(typeof A[k], "function", k);
  assert.ok(Array.isArray(A.KEYS) && A.KEYS.length >= 8, "card string table (key, Thai default) is exported");
  const src = fs.readFileSync(path.join(ROOT, "lensiq-pc-advert.js"), "utf8");
  assert.match(src, /LQPCAdvert/);
});

test("no network: no request code in the module and nothing is called while analysing and rendering", () => {
  const src = fs.readFileSync(path.join(ROOT, "lensiq-pc-advert.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /\/v1\/ai/, /\/api\//, /LQApi/, /importScripts/]) {
    assert.doesNotMatch(src, bad, "advert module must not contain " + bad);
  }
  const calls = [];
  const saved = { fetch: global.fetch, XMLHttpRequest: global.XMLHttpRequest, WebSocket: global.WebSocket };
  global.fetch = (...a) => { calls.push(["fetch", a]); throw new Error("network used"); };
  global.XMLHttpRequest = function () { calls.push(["xhr"]); throw new Error("network used"); };
  global.WebSocket = function () { calls.push(["ws"]); throw new Error("network used"); };
  try {
    for (const ad of ADS) {
      const r = A.analyze(ad.text);
      for (const lang of ["th", "en", "zh"]) card(r, lang);
    }
  } finally { Object.assign(global, saved); }
  assert.deepEqual(calls, [], "no request of any kind");
});

test("kind 'ad' on every result; nothing marked as sent; rule ids are those of LQClaims.detect(kind 'ad')", () => {
  for (const ad of ADS) {
    const r = A.analyze(ad.text);
    assert.equal(r.kind, "ad");
    assert.equal(r.sent, false);
    assert.ok(r.flags.length >= 1, "each synthetic advert has at least one signal: " + ad.text);
    const want = [...new Set(C.detect(ad.text, { category: r.category || undefined, kind: "ad" }).map(f => f.rule_id))].sort();
    assert.deepEqual([...new Set(r.flags.map(f => f.rule_id))].sort(), want, ad.text);
    assert.ok(!("text" in r) && !("input" in r), "the result does not carry the advert text");
  }
});

test("the card NEVER names the seller (TH / EN / ZH), and the result object does not either", () => {
  for (const ad of ADS) {
    const r = A.analyze(ad.text);
    const blob = JSON.stringify(r);
    for (const s of ad.seller) assert.ok(!blob.toLowerCase().includes(s.toLowerCase()), `result carries "${s}" for: ${ad.text}`);
    for (const lang of ["th", "en", "zh"]) {
      const h = card(r, lang);
      for (const s of ad.seller) assert.ok(!h.toLowerCase().includes(s.toLowerCase()), `${lang} card names "${s}" for: ${ad.text}`);
    }
  }
});

test("sellerSpans / scrub: handles, LINE / WeChat IDs, phones, URLs, shop / page / brand names, endorsers removed", () => {
  for (const ad of ADS) {
    const s = A.scrub(ad.text);
    for (const x of ad.seller) assert.ok(!s.toLowerCase().includes(x.toLowerCase()), `scrub left "${x}": ${s}`);
    assert.ok(s.includes(A.HIDDEN), "the hidden part is marked");
    for (const sp of A.sellerSpans(ad.text)) {
      assert.ok(sp.start >= 0 && sp.end <= ad.text.length && sp.end > sp.start, JSON.stringify(sp));
      assert.equal(typeof sp.kind, "string");
    }
  }
  // ordinary claim wording and generic words are NOT removed
  const plain = "ลดน้ำหนัก 5 กิโล ใน 7 วัน ทางร้านรับประกัน";
  assert.ok(A.scrub(plain).includes("ลดน้ำหนัก 5 กิโล ใน 7 วัน"), A.scrub(plain));
  assert.ok(A.scrub("cures acne in 3 days").includes("cures acne in 3 days"));
});

test("evidence = the exact rule span when no seller part overlaps; overlapping seller parts are hidden, the signal stays", () => {
  const t = "อาหารเสริม ลดน้ำหนัก 5 กิโล ใน 7 วัน";
  const r = A.analyze(t, { category: "supplement" });
  const d = C.detect(t, { category: "supplement", kind: "ad" });
  for (const f of d) assert.ok(r.flags.some(x => x.rule_id === f.rule_id && x.evidence === f.text), `${f.rule_id} "${f.text}"`);
  const b = A.analyze("SlimFitX ลดน้ำหนักได้ 10 กิโลใน 7 วัน", { category: "supplement" });
  assert.ok(b.flags.length && b.flags.every(f => !/SlimFitX|FitX/.test(f.evidence)), JSON.stringify(b.flags.map(f => f.evidence)));
  assert.ok(b.hidden >= 1, "the count of hidden name parts is reported");
});

test("endorsement rules (D07, F14, H04, C04) never quote the endorser", () => {
  for (const t of ["Recommended by Dr. Testman Fakename: this supplement cures diabetes.", "นพ.สมมติ ทดสอบ แนะนำ อาหารเสริมนี้ รักษาเบาหวาน หายขาด",
    "Clinically proven, approved by Prof. Imaginary Person"]) {
    for (const f of A.analyze(t).flags.filter(x => ["D07", "F14", "H04", "C04"].includes(x.rule_id))) {
      assert.equal(f.endorsement, true);
      assert.doesNotMatch(f.evidence, /Testman|Fakename|สมมติ|Imaginary|Person/, f.evidence);
    }
  }
});

test("no verdict words in any language; 'about the wording, not a legal finding, not about a seller' always; no signal is not 'compliant'", () => {
  const none = A.analyze("สินค้าดีมาก ส่งไว");
  assert.equal(none.flags.length, 0);
  for (const r of [...ADS.map(a => A.analyze(a.text)), none]) {
    for (const lang of ["th", "en", "zh"]) {
      const h = card(r, lang);
      assert.doesNotMatch(h, BAN, lang + ": " + h.slice(0, 200));
      assert.match(h, /data-note="wording"/, "wording-only note present");
    }
  }
  const en = card(none, "en"), zh = card(none, "zh"), th = card(none, "th");
  assert.match(en, /not a legal finding/i);
  assert.match(en, /seller/i);
  assert.match(en, /data-none/);
  assert.doesNotMatch(en, /\b(compliant|safe|approved|passed|legitimate|verified)\b/i, "no-signal card never says compliant / safe / approved");
  assert.doesNotMatch(th, /ปลอดภัย|ถูกต้องตามกฎหมาย|ผ่านการตรวจ/, "no-signal card never says safe / lawful / passed (TH)");
  assert.doesNotMatch(zh, /安全|合法|合规|通过/, "no-signal card never says safe / lawful / passed (ZH)");
  assert.match(zh, /不是法律结论/);
  assert.match(th, /ไม่ใช่คำตัดสินทางกฎหมาย/);
});

test("product type: a chosen type is respected; a guess is marked as a guess; unknown runs every family", () => {
  const t = "ครีมทาผิว รักษาสิวหายขาด ใน 7 วัน";
  const chosen = A.analyze(t, { category: "cosmetic" });
  assert.equal(chosen.category, "cosmetic");
  assert.equal(chosen.guessed, false);
  assert.ok(chosen.flags.every(f => f.family === "C"), JSON.stringify(chosen.flags.map(f => f.rule_id)));
  assert.equal(A.guessCategory("ยาเม็ดแก้ปวด บรรเทาอาการปวดศีรษะ ลดไข้ ทะเบียนยา 1A 15/50"), "drug");
  assert.equal(A.guessCategory("Drug Facts Active ingredient Acetaminophen 500 mg tablets Uses temporarily relieves minor aches"), "drug");
  assert.equal(A.guessCategory("เซรั่มบำรุงผิว ครีมกันแดด SPF50 ผิวกระจ่างใส"), "cosmetic");
  assert.equal(A.guessCategory("ผลิตภัณฑ์เสริมอาหาร ชนิดแคปซูล"), "supplement");
  assert.equal(A.guessCategory("สินค้าดีมาก ส่งไว"), null);
  const g = A.analyze("เซรั่มบำรุงผิว ครีมกันแดด SPF50 ผิวขาวใสใน 3 วัน");
  assert.equal(g.category, "cosmetic");
  assert.equal(g.guessed, true);
  const u = A.analyze("สินค้านี้ รักษาเบาหวานหายขาด");
  assert.equal(u.category, null);
  assert.ok(new Set(u.flags.map(f => f.family)).size >= 2, "unknown type: rules of every family run");
  for (const lang of ["th", "en", "zh"]) {
    assert.match(card(g, lang), /data-guess/, "the guess is said on the card");
    assert.match(card(u, lang), /data-all-families/, "unknown type is said on the card");
  }
});

test("TH / EN / ZH complete: every card string has English and Chinese entries; EN / ZH cards have no Thai outside quotes", () => {
  for (const [k, th] of A.KEYS) {
    assert.ok(typeof th === "string" && THAI.test(th), "Thai default for " + k);
    assert.ok(typeof EN[k] === "string" && EN[k].trim() && !THAI.test(EN[k]), "English for " + k);
    assert.ok(typeof ZH[k] === "string" && ZH[k].trim() && !THAI.test(ZH[k]), "Chinese for " + k);
  }
  for (const r of [...ADS.map(a => A.analyze(a.text)), A.analyze("สินค้าดีมาก"), A.analyze("ครีมทาผิว รักษาสิวหายขาด", { category: "cosmetic" })]) {
    for (const lang of ["en", "zh"]) {
      const out = outsideNoTranslate(card(r, lang));
      assert.doesNotMatch(out, THAI, lang + " card has Thai outside quotes: " + out.slice(0, 300));
    }
  }
});

test("no share / report / form controls; only https rule-basis links; HTML in the advert is escaped", () => {
  const r = A.analyze('<img src=x onerror="alert(1)"> รักษาเบาหวานหายขาด <script>alert(2)</script>');
  for (const lang of ["th", "en", "zh"]) {
    const h = card(r, lang);
    assert.doesNotMatch(h, /<img|<script|onerror=/i);
    assert.doesNotMatch(h, /<button|<form|<input|<textarea|navigator\.share|data-share/i);
    for (const m of h.matchAll(/<a\s[^>]*>/g)) {
      assert.match(m[0], /href="https:\/\//, m[0]);
      assert.match(m[0], /rel="noopener noreferrer"/, m[0]);
    }
  }
});
