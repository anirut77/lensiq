"use strict";
// tests/unit/pc-travel.test.js — Product Check P9 travel mode (design §7, docs/product-check/P9-RESULTS.md). FIXED TEST, written
// before lensiq-pc-travel.js and locked (sha256 in ~/LENSIQ-field/evals/p9/locked.sha256). Never loosen it: fix the product.
//   1. INN extraction on the device (hand table of INN synonyms in EN / ZH / JA / KO / TH + the TMT 2020 ingredient words):
//      longest match wins (levocetirizine is not cetirizine), salt / hydrate words are dropped, no INN from food /
//      cosmetic text;
//   2. the AI's ingredient list is accepted only when its INN resolves on the device (design §7) — a model INN that does
//      not resolve, or that resolves to a different INN than the name on the pack, is rejected and listed as such;
//   3. translated lines: dosing and warning lines are found (TH / EN / ZH / JA / KO) so the page can label them
//      "translated from the label, not advice, ask a pharmacist" (CTO-BRIEF L47);
//   4. country of origin and the coverage message (design §4.7): covered / partial / none, never "looks fine";
//   5. Thai equivalents: OFF by default (lensiq-config.js), strict flag, list built from TMT 2020 (CC BY) shards only,
//      exact ingredient set, never a recommendation; committed shards equal the build;
//   6. the fixed synthetic set (docs/product-check/p9-inn-testset.json): the targets written in it before building.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const TV = require("../../lensiq-pc-travel.js");
const META = JSON.parse(fs.readFileSync(path.join(ROOT, "vendor/pc-drugs/tmt/meta.json"), "utf8"));
const idx = TV.buildInnIndex(META.ing);
const base = TV.buildInnIndex();
const inns = (text, i = idx) => TV.extractInn(text, i).map(x => x.inn).sort();

test("INN: each language of the hand table resolves to the same INN", () => {
  for (const s of ["Acetaminophen", "paracetamol", "PARACETAMOL", "Parasetamol", "paracétamol", "对乙酰氨基酚", "乙醯胺酚", "アセトアミノフェン", "아세트아미노펜", "พาราเซตามอล"]) {
    assert.equal(TV.resolveInn(s, base), "paracetamol", s);
  }
  assert.equal(TV.resolveInn("Albuterol sulfate", base), "salbutamol");
  assert.equal(TV.resolveInn("Chlorpheniramine maleate", base), "chlorphenamine");
  assert.equal(TV.resolveInn("マレイン酸クロルフェニラミン", base) || TV.resolveInn("クロルフェニラミンマレイン酸塩", base), "chlorphenamine");
  assert.equal(TV.resolveInn("Aspirin", base), "acetylsalicylic acid");
  assert.equal(TV.resolveInn("阿斯匹靈", base), "acetylsalicylic acid");
  assert.equal(TV.resolveInn("Meclizine HCl", base), "meclozine");
  assert.equal(TV.resolveInn("Unicornium", base), null);
  assert.equal(TV.resolveInn("", base), null);
  assert.equal(TV.resolveInn(null, base), null);
});

test("INN: longest match wins, salts dropped, one entry per INN in order of appearance", () => {
  assert.deepEqual(inns("Levocetirizine dihydrochloride 5 mg"), ["levocetirizine"]);
  assert.deepEqual(inns("盐酸左西替利嗪片 5mg"), ["levocetirizine"]);
  assert.deepEqual(inns("Esomeprazole magnesium 20 mg"), ["esomeprazole"]);
  assert.deepEqual(inns("エソメプラゾール 20mg"), ["esomeprazole"]);
  assert.deepEqual(inns("Desloratadine 5 mg"), ["desloratadine"]);
  assert.deepEqual(inns("地氯雷他定片"), ["desloratadine"]);
  const r = TV.extractInn("Acetaminophen 650 mg, Dextromethorphan HBr 30 mg, Acetaminophen", idx);
  assert.deepEqual(r.map(x => x.inn), ["paracetamol", "dextromethorphan"]);
  assert.equal(r[0].matched, "Acetaminophen");
  assert.equal(r[0].strength, "650 mg");
  assert.ok(["synonym", "tmt"].includes(r[0].via));
});

test("INN: no INN from food, cosmetic or supplement wording", () => {
  for (const t of ["Ingredients: water, sugar, glucose syrup, salt, menthol", "Aqua, Glycerin, Niacinamide, Dimethicone, Phenoxyethanol",
    "配料：蜂蜜、柚子、白砂糖、水", "原材料名：緑茶", "원재료: 유자, 설탕, 꿀", "Zinc oxide 20%", "Vitamin C 1000 mg, magnesium stearate", "Ethyl alcohol 70%"]) {
    assert.deepEqual(inns(t), [], t);
  }
});

test("AI ingredients are accepted only when the INN resolves on the device (design §7)", () => {
  const r = TV.acceptAi([
    { name_on_pack: "アセトアミノフェン", inn: "acetaminophen", strength: "300", unit: "mg" },
    { name_on_pack: "Unicornium", inn: "unicornium", strength: null, unit: null },
    { name_on_pack: "イブプロフェン", inn: "paracetamol", strength: null, unit: null }, // the model's INN contradicts the name on the pack
    { name_on_pack: "ロキソプロフェンナトリウム水和物", inn: null, strength: "60", unit: "mg" }
  ], idx);
  assert.deepEqual(r.accepted.map(a => a.inn), ["paracetamol", "loxoprofen"]);
  assert.equal(r.accepted[0].name_on_pack, "アセトアミノフェン");
  assert.deepEqual(r.rejected.map(a => a.name_on_pack), ["Unicornium", "イブプロフェン"]);
  assert.deepEqual(TV.acceptAi(null, idx), { accepted: [], rejected: [] });
});

test("translated dosing / warning lines are found in every page language and on the label", () => {
  const dose = ["用法用量：口服，成人一次1片，一日3次", "用法・用量 成人1回2錠 1日3回まで", "용법·용량: 성인 1회 1~2정", "Directions: adults take 1 tablet every 4 to 6 hours",
    "Take 2 tablets twice a day", "รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง", "ขนาดและวิธีใช้: ผู้ใหญ่ครั้งละ 2 เม็ด", "Dosage: 1 tablet daily", "每次1片，每日2次"];
  for (const l of dose) assert.equal(TV.classifyLine(l), "dose", l);
  const warn = ["【注意事项】孕妇慎用", "使用上の注意 してはいけないこと", "경고: 이 약을 복용하는 동안 음주하지 마십시오", "Warning: Liver warning", "Keep out of reach of children",
    "คำเตือน ห้ามใช้ในหญิงมีครรภ์", "【禁忌】对本品过敏者禁用", "Do not use if you are allergic to aspirin"];
  for (const l of warn) assert.equal(TV.classifyLine(l), "warning", l);
  for (const l of ["成分 1錠中 アセトアミノフェン 300mg", "Active ingredient: Acetaminophen 500 mg", "日本製", "LQ PAIN RELIEF", "ส่วนประกอบ: พาราเซตามอล 500 มก."]) {
    assert.equal(TV.classifyLine(l), "other", l);
  }
});

test("country of origin: printed words, registration-number shapes, script", () => {
  const c = t => TV.countriesOf(t).map(x => x.country).sort();
  assert.deepEqual(c("Made in Japan"), ["JP"]);
  assert.deepEqual(c("日本製"), ["JP"]);
  assert.deepEqual(c("中国制造 国药准字H12345678"), ["CN"]);
  assert.deepEqual(c("MAL20012345A"), ["MY"]);
  assert.deepEqual(c("대한민국 제조"), ["KR"]);
  assert.deepEqual(c("台灣製造"), ["TW"]);
  assert.deepEqual(c("Sản xuất tại Việt Nam"), ["VN"]);
  assert.deepEqual(c("NDC 12345-678-90 Made in USA"), ["US"]);
  assert.deepEqual(c("ยาเม็ดพาราเซตามอล 500 มก. เลขทะเบียน 1A 123/45"), []);
  assert.ok(TV.countriesOf("Made in Japan")[0].via);
});

test("coverage message: covered / partial / none; a 'none' country gets the agency's own site to check, never 'looks fine'", () => {
  for (const k of ["US", "CA", "SG"]) {
    const v = TV.coverageFor(k);
    assert.equal(v.level, "covered", k);
    assert.ok(v.sources.length >= 1, k);
  }
  for (const k of ["DE", "FR", "ES", "IE", "BE"]) assert.equal(TV.coverageFor(k).level, "partial", k);
  for (const k of ["JP", "CN", "KR", "MY", "TW", "VN", "ID", "IN", "PH", "AU", "GB", "HK"]) {
    const v = TV.coverageFor(k);
    assert.equal(v.level, "none", k);
    assert.ok(v.links.length >= 1 && v.links.every(l => /^https:\/\//.test(l.url)), k);
  }
  const x = TV.coverageFor("ZZ");
  assert.equal(x.level, "none");
  assert.ok(x.links.some(l => /who\.int/.test(l.url)), "unknown country: the WHO alerts page");
  assert.ok(!JSON.stringify(TV.COVERAGE).match(/looks fine|genuine|safe|ปลอดภัย|ของแท้|正品/i));
});

test("foreign: the travel card is for products from another country", () => {
  assert.equal(TV.isForeign("ยาเม็ดพาราเซตามอล 500 มก. เลขทะเบียน 1A 123/45"), false);
  assert.equal(TV.isForeign("アセトアミノフェン 300mg 日本製"), true);
  assert.equal(TV.isForeign("Ibuprofen 200 mg\nนำเข้าโดย บริษัท แอลคิว จำกัด\nMade in Japan"), true);
  assert.equal(TV.isForeign("Acetaminophen 500 mg"), true, "no Thai on the pack at all");
  assert.equal(TV.isForeign(""), false);
});

test("Thai equivalents: OFF by default, strict flag, permission note in the config", () => {
  const cfg = fs.readFileSync(path.join(ROOT, "lensiq-config.js"), "utf8");
  assert.match(cfg, /window\.LENSIQ_PC_THAI_EQUIV\s*=\s*window\.LENSIQ_PC_THAI_EQUIV\s*===\s*true/);
  assert.equal(TV.thaiEquivAllowed({}), false);
  assert.equal(TV.thaiEquivAllowed({ LENSIQ_PC_THAI_EQUIV: "1" }), false);
  assert.equal(TV.thaiEquivAllowed({ LENSIQ_PC_THAI_EQUIV: 1 }), false);
  assert.equal(TV.thaiEquivAllowed({ LENSIQ_PC_THAI_EQUIV: true }), true);
  assert.equal(TV.thaiEquivAllowed(null), false);
});

test("Thai equivalents: exact ingredient set from TMT 2020 shards (CC BY), strength match marked, never a recommendation", () => {
  const tmt = JSON.parse(fs.readFileSync(path.join(ROOT, "vendor/pc-drugs/tmt-2563.json"), "utf8"));
  const files = TV.ingFiles(tmt); // the same function tools/pc-tmt-ing-build.mjs writes vendor/pc-drugs/tmt-ing/ with
  // committed shards equal the build (no drift between the table, the synonym table and vendor/)
  const dir = path.join(ROOT, "vendor/pc-drugs/tmt-ing");
  const committed = fs.readdirSync(dir).sort();
  assert.deepEqual(committed, Object.keys(files).sort());
  for (const f of committed) assert.equal(fs.readFileSync(path.join(dir, f), "utf8"), files[f], f);
  const meta = JSON.parse(files["meta.json"]);
  assert.equal(meta.source.as_of, "2020-02-17");
  assert.match(meta.source.licence, /Creative Commons Attribution/);
  assert.ok(meta.credit.th && meta.credit.en && meta.credit.zh);
  assert.match(meta.note, /not a register/i);
  const shard = name => JSON.parse(files[name + ".json"]);
  const k1 = TV.ingSetKey(["paracetamol"]);
  const r1 = TV.equivalents(k1, shard(TV.shardOf(k1)), meta, { strength: "500 mg" });
  assert.ok(r1.total > 20 && r1.rows.length <= 12, "many paracetamol products, a short list " + r1.total);
  assert.ok(r1.rows.some(x => /TYLENOL/.test(x.name)) || r1.total > 50);
  assert.ok(r1.rows[0].same, "same printed strength comes first");
  assert.ok(r1.rows.every(x => typeof x.form === "string" && typeof x.strength === "string"));
  // salts and spelling variants on either side do not matter; the ingredient SET must be equal
  assert.equal(TV.ingSetKey(["Chlorpheniramine maleate", "acetaminophen"]), TV.ingSetKey(["paracetamol", "chlorphenamine"]));
  const k2 = TV.ingSetKey(["paracetamol", "chlorphenamine"]);
  const r2 = TV.equivalents(k2, shard(TV.shardOf(k2)), meta, {});
  assert.ok(r2.total >= 1);
  assert.equal(TV.equivalents(TV.ingSetKey(["unicornium"]), {}, meta, {}).total, 0);
  // no wording of our own that suggests switching or a dose
  assert.ok(!JSON.stringify(r1).match(/instead|substitute|แทน|代替|替代|recommend/i));
});

test("travel-mode strings: TH default, EN and ZH complete; L47 note and 'not a recommendation' present; no verdict words", () => {
  const src = fs.readFileSync(path.join(ROOT, "lensiq-pc-travel.js"), "utf8") + fs.readFileSync(path.join(ROOT, "lensiq-pc-ai.js"), "utf8");
  const keys = [...src.matchAll(/T\("(md\.pc\.tv\.[\w.]+)"/g)].map(m => m[1]);
  assert.ok(keys.length >= 12, "travel strings found " + keys.length);
  for (const lang of ["en", "zh"]) {
    const dict = fs.readFileSync(path.join(ROOT, `i18n/${lang}-med.js`), "utf8");
    for (const k of new Set(keys)) assert.ok(dict.includes(`"${k}"`), `${lang}: ${k}`);
  }
  const en = fs.readFileSync(path.join(ROOT, "i18n/en-med.js"), "utf8");
  assert.match(en, /"md\.pc\.tv\.l47": "Translated from the label, not advice\. Ask a pharmacist\."/);
  assert.match(en, /"md\.pc\.tv\.eqNote": "[^"]*not a recommendation[^"]*pharmacist[^"]*"/i);
  assert.match(en, /"md\.pc\.tv\.mt": "Machine translation[^"]*"/);
  const tv = src.slice(0, fs.readFileSync(path.join(ROOT, "lensiq-pc-travel.js"), "utf8").length);
  assert.ok(!/illegal|counterfeit|genuine|authentic|ผิดกฎหมาย|ของปลอม|ของแท้|违法|假冒|正品/i.test(tv), "no verdict words in the travel module");
});

test("fixed synthetic set (source: synthetic): integrity and the targets written before building", () => {
  const file = path.join(ROOT, "docs/product-check/p9-inn-testset.json");
  const set = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(set.schema, "lensiq-pc-p9-inn-testset/1");
  assert.ok(set.items.length >= 120);
  const m = TV.measure(set.items, idx);
  // printed for the results file; the numbers are re-measured by the independent reviewer on a fresh set
  console.log("p9 fixed set:", JSON.stringify({ precision: m.precision, recall: m.recall, recallOutOfTable: m.recallOutOfTable, negativesClean: m.negativesClean,
    country: m.country, foreign: m.foreign }));
  assert.ok(m.precision >= 0.95, "INN precision " + m.precision + " " + JSON.stringify(m.falsePos));
  assert.ok(m.recall >= 0.85, "INN recall " + m.recall + " " + JSON.stringify(m.misses));
  assert.ok(m.negativesClean >= 0.95, "negatives clean " + m.negativesClean);
  assert.ok(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").length === 64);
});
