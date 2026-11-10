"use strict";
// tests/unit/pc-guard.test.js — round 17 P7: the Product Check patient-name / personal-identifier guard (lensiq-pc-guard.js).
// DEV set: docs/product-check/p7-guard-testset.json (tools/pc-guard-testset.mjs; synthetic; tuned on, incl. the dev-2 and
// dev-3 cases per failure category of the independent reviews). The agent's own hold-out (p7-guard-holdout.json, scored
// once: 65/67) is now PARTLY DEV (three of its misses were fixed afterwards): only its checksum is checked here, no floor.
// Measurement belongs to independent agents (their frozen sets); a rule-based guard cannot reach 99 % on free-form names,
// so the page layers it: guard + mandatory text preview + dispensing-label policy (docs/product-check/P7-RESULTS.md §3).
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const G = require("../../lensiq-pc-guard.js");
const SET = JSON.parse(readFileSync(join(ROOT, "docs", "product-check", "p7-guard-testset.json"), "utf8"));

test("dev set: frozen = what the generator builds, synthetic, sizes", async () => {
  const { build } = await import("../../tools/pc-guard-testset.mjs");
  assert.deepEqual(build(), SET);
  assert.match(SET.source, /^synthetic/);
  const pii = SET.items.reduce((a, i) => a + i.pii.length, 0), keep = SET.items.reduce((a, i) => a + i.keep.length, 0);
  assert.ok(pii >= 175 && keep >= 205, `pii ${pii} keep ${keep}`);
});

test("dev set: recall >= 99 % (every character removed), 0 false redaction, image mode: 0 clean packs blocked, 0 labels with personal data allowed", async () => {
  const { score } = await import("../../tools/pc-guard-testset.mjs");
  const s = score(G, SET);
  assert.ok(s.recall >= 0.99, `recall ${s.caught}/${s.pii} misses ${JSON.stringify(s.misses)}`);
  assert.equal(s.damaged, 0, "kept strings damaged: " + JSON.stringify(s.damage));
  assert.equal(s.negRedacted, 0, "clean labels redacted");
  assert.equal(s.image.falseBlock, 0, "clean packs blocked: " + s.image.wrong);
  assert.equal(s.image.missedBlock, 0, "photo allowed with personal data / dispensing label: " + s.image.wrong);
});

test("own hold-out: file unchanged since it was frozen (it is partly dev now; no score floor is asserted)", async () => {
  const { loadHoldout } = await import("../../tools/pc-guard-testset.mjs");
  const H = await loadHoldout(); // throws when the file changed after freezing
  assert.ok(H.items.length >= 60);
});

test("v3: titles anywhere (short labels), bare-name dispensing label (name line removed, photo blocked), bare Thai IDs, Khun / For:", () => {
  const k = t => G.scan(t).map(s => t.slice(s.start, s.end));
  assert.deepEqual(k("Mrs Jane Placeholder\nMETFORMIN 500 mg"), ["Mrs Jane Placeholder"]);
  assert.deepEqual(k("ด.ช. ภูผา ทดลองไทย\nยาน้ำแก้ไอเด็ก"), ["ด.ช. ภูผา ทดลองไทย"]);
  assert.deepEqual(k("Khun Malee\nPARACETAMOL"), ["Khun Malee"]);
  assert.deepEqual(k("For: Peter Dummyson\nTake 1 tablet twice daily"), ["Peter Dummyson"]);
  assert.deepEqual(k("For: external use only"), [], "For: without usage text is not a cue");
  const bare = "ร้านยาสาธิต\nสมพร ใจสมมติ\nรับประทานครั้งละ 1 เม็ด";
  assert.deepEqual(k(bare), ["สมพร ใจสมมติ"]);
  assert.equal(G.imageCheck(bare).block, true);
  assert.equal(G.isDispensingLabel("สมใจ ทดลองสุข\nยาแก้ไอ รับประทานครั้งละ 1 ช้อนชา"), true, "usage text + a standalone name line");
  assert.equal(G.isDispensingLabel("ยาแก้ปวด ลดไข้\nรับประทานครั้งละ 1-2 เม็ด"), false, "a two-word OTC line is not a name");
  const id = "110370012345"; let s = 0; for (let i = 0; i < 12; i++) s += Number(id[i]) * (13 - i);
  const full = id + ((11 - (s % 11)) % 10), th = full.replace(/[0-9]/g, d => String.fromCharCode(0x0e50 + Number(d)));
  assert.deepEqual(k("ปชช. " + th), [th]);
  assert.deepEqual(k(full + "\nยาแก้แพ้"), [full], "a valid Thai ID alone on its line");
  assert.equal(G.DEFAULTS.dispensingAI, "off", "owner decision pending: no AI for dispensing labels by default");
});

test("redact(): placeholder in place, removed list, idempotent; clean labels unchanged", () => {
  for (const it of SET.items) {
    const r = G.redact(it.text);
    for (const p of it.pii) assert.ok(!r.text.includes(p), `${it.id}: ${p} left`);
    assert.equal(r.count, r.removed.length);
    assert.deepEqual(G.scan(r.text), [], it.id + " idempotent");
    for (const x of r.removed) assert.ok(G.KINDS.includes(x.kind) && it.text.includes(x.text));
    if (!it.pii.length) assert.equal(r.text, it.text, it.id + " clean label unchanged");
  }
  assert.equal(G.redact("").count, 0);
  assert.equal(G.redact(null).text, "");
});

test("Thai digits folded (offsets kept); phone groupings; Thai / English / Chinese birth dates", () => {
  assert.equal(G.fold("โทร ๐๘๑-๒๓๔-๕๖๗๘"), "โทร 081-234-5678");
  const k = t => G.scan(t).map(s => s.kind + ":" + t.slice(s.start, s.end));
  assert.deepEqual(k("โทร ๐๘๑-๒๓๔-๕๖๗๘"), ["phone:๐๘๑-๒๓๔-๕๖๗๘"]);
  for (const p of ["08-9765-4321", "0 2123 4567", "+66(0)81-234-5678", "(02) 123 4567", "089.765.4321", "+66 2 123 4567"]) assert.deepEqual(k("ติดต่อ " + p), ["phone:" + p], p);
  for (const n of ["13-2-06463-5-0326", "NDC 0573-0150-20", "DIN 02345678", "8850006939727", "12/05/2568", "2027.01.01", "10-1-6600012345", "1556"]) assert.deepEqual(k(n), [], n);
  assert.deepEqual(k("เกิด ๑๒ ม.ค. ๒๕๓๐"), ["dob:๑๒ ม.ค. ๒๕๓๐"]);
  assert.deepEqual(k("DOB 3 March 1985"), ["dob:3 March 1985"]);
  assert.deepEqual(k("出生日期：1985年3月4日"), ["dob:1985年3月4日"]);
});

test("company phones: kept and not blocking under the default; 'remove' setting treats them like any phone; a person's phone is always removed", () => {
  const t = "ผลิตโดย บริษัท ตัวอย่าง จำกัด\nโทร 02-123-4567";
  assert.equal(G.DEFAULTS.companyPhones, "keep");
  assert.deepEqual(G.scan(t), []);
  assert.equal(G.imageCheck(t).block, false);
  assert.equal(G.scanAll(t)[0].company, true);
  assert.equal(G.scan(t, { companyPhones: "remove" }).length, 1);
  assert.equal(G.imageCheck(t, { companyPhones: "remove" }).block, true);
  assert.equal(G.scan("ผลิตโดย บริษัท ตัวอย่าง จำกัด\nผู้ติดต่อ 081-999-8888").length, 1, "a person line is never a company phone");
});

test("honorifics: a brand is kept on a product pack; the same honorific is a name on a dispensing label", () => {
  for (const b of ["Mrs. Bee's Herbal Tea", "Dr. Sample Skincare", "Miss Lily Body Lotion", "นายห้าง ยาดมสมุนไพร", "Patient Package Insert"]) {
    assert.deepEqual(G.scan(b), [], b); assert.equal(G.imageCheck(b).block, false, b);
  }
  const d = "CITY PHARMACY\nMrs Rosa Notreal\nTake 1 tablet daily";
  assert.equal(G.isDispensingLabel(d), true);
  assert.deepEqual(G.scan(d).map(s => d.slice(s.start, s.end)), ["Mrs Rosa Notreal"]);
  const id = "110370012345"; let s = 0; for (let i = 0; i < 12; i++) s += Number(id[i]) * (13 - i);
  const full = id + ((11 - (s % 11)) % 10);
  assert.equal(G.thaiIdOk(full), true);
  assert.equal(G.scan("บัตรประชาชน " + full).length, 1);
  assert.deepEqual(G.scan("บาร์โค้ด " + full), [], "13 digits without an ID cue: kept");
});

test("v4: maker / shop / contact blocks keep their phones (default) and do not block the photo; a person in the block still loses the phone", () => {
  const maker = "ผลิตโดย บริษัท สาธิตฟาร์มา จำกัด\n99/9 หมู่ 4 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540\nโทร 02-123-4567";
  assert.deepEqual(G.scan(maker), []); assert.equal(G.imageCheck(maker).block, false);
  for (const t of ["Distributed by Mock Foods\n12 Sample Road, Bangkok 10110\nTel: 02 345 6789", "SAMPLEX\nwww.samplex.example\nโทร 02-999-1234", "Call center 02-555-0101"]) {
    assert.deepEqual(G.scan(t), [], t); assert.equal(G.imageCheck(t).block, false, t);
  }
  assert.equal(G.scan(maker, { companyPhones: "remove" }).length, 1, "setting 'remove' still works");
  const person = "ผลิตโดย บริษัท สาธิต จำกัด\nผู้ติดต่อ: คุณสมมติ ใจทดสอบ 081-222-3333";
  assert.deepEqual(G.scan(person).map(s => s.kind).sort(), ["name", "phone"]);
});

test("v4: a name span stops at question / drug / product words and is capped; number formats; addresses only near a person", () => {
  const k = t => G.scan(t).map(s => s.kind + ":" + t.slice(s.start, s.end));
  assert.deepEqual(k("ชื่อผู้ป่วย สมชาย ใจทดลอง ถามเรื่องยา Losartan"), ["name:สมชาย ใจทดลอง"]);
  assert.deepEqual(k("Patient: John Exampleton asks about METFORMIN dose"), ["name:John Exampleton"]);
  assert.deepEqual(k("hn 6512345"), ["hn:6512345"]);
  assert.deepEqual(k("HN 65O1234"), ["hn:65O1234"]);
  assert.deepEqual(k("บัตรประชาชน 1234567890123"), ["id:1234567890123"], "an ID cue: check digit not required");
  assert.deepEqual(k("Passport No. AA1234567"), ["id:AA1234567"]);
  assert.deepEqual(k("手机13800138000"), ["phone:13800138000"]);
  const d17 = "11010519491231002", w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const cn = d17 + "10X98765432"[[...d17].reduce((x, c, i) => x + Number(c) * w[i], 0) % 11], bad = d17 + (cn.endsWith("0") ? "1" : "0");
  assert.deepEqual(k(cn), ["id:" + cn], "Chinese resident ID with a valid check digit");
  assert.deepEqual(k(bad), [], "invalid check digit, no cue: kept");
  assert.equal(G.scan("HKID A123456(3)").length, 1);
  assert.deepEqual(k("ชื่อผู้ป่วย สมมติ ใจทดสอบ\nบ้านเลขที่ 12/3 หมู่ 5 ต.ทดลอง อ.เมือง จ.ขอนแก่น 40000"),
    ["name:สมมติ ใจทดสอบ", "address:บ้านเลขที่ 12/3 หมู่ 5 ต.ทดลอง อ.เมือง จ.ขอนแก่น 40000"]);
  assert.deepEqual(k("ผลิตโดย บริษัท สาธิตฟาร์มา จำกัด\n99/9 หมู่ 4 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540"), [], "a maker address on a pack is kept");
});

test("v4: possibleNames() underlines likely names left in a text (preview only, never removed)", () => {
  const p = t => G.possibleNames(t).map(s => t.slice(s.start, s.end));
  assert.deepEqual(p("Grace Exampleton called about it"), ["Grace Exampleton"]);
  assert.deepEqual(p("สมพร ใจสมมติ\nยาแก้ปวด"), ["สมพร ใจสมมติ"]);
  assert.deepEqual(p("张样例\n每日三次"), ["张样例"]);
  assert.deepEqual(p("Drug Facts\nVitamin C 1000 mg\nCold Relief"), []);
  assert.deepEqual(p("[removed] โทร [removed]"), []);
  assert.deepEqual(G.redact("Grace Exampleton called").count, 0, "possible names are not removed");
});

test("owner decisions: barcodes never a Thai ID; maker e-mails and call-centre numbers kept; honorific brands kept; HN forms; Taiwan medicine bag", () => {
  const k = t => G.scan(t).map(s => s.kind + ":" + t.slice(s.start, s.end));
  assert.deepEqual(k("บาร์โค้ด 8850006939727"), []);
  assert.deepEqual(k("8850006939727"), [], "a valid EAN-13 with the Thai GS1 prefix alone on a line");
  assert.deepEqual(k("Manufactured by Example Co., Ltd.\ninfo@example-brand.test\nCall 1-800-555-0100"), []);
  assert.deepEqual(k("contact: someone@mail.example"), ["email:someone@mail.example"], "a personal e-mail is still removed");
  assert.equal(G.scan("Manufactured by Example Co., Ltd.\ninfo@example-brand.test", { companyPhones: "remove" }).length, 1, "'remove' also covers maker e-mails");
  for (const b of ["Dr. Sample Laboratories", "ดร.สมุนไพร ยาหอม", "คุณยายสมศรี เภสัช ยาดม"]) assert.deepEqual(k(b), [], b);
  assert.deepEqual(k("HN 6 5 1 2 3 4 5"), ["hn:6 5 1 2 3 4 5"]);
  assert.deepEqual(k("H.N. 6512345"), ["hn:6512345"]);
  assert.deepEqual(k("Hosp. No 778899"), ["hn:778899"]);
  assert.deepEqual(k("MRN/病歷號碼: A123456"), ["hn:A123456"]);
  assert.equal(G.isDispensingLabel("姓名：王小明\n民國113年11月10日"), true, "Taiwan medicine bag: name + ROC date");
  assert.equal(G.isDispensingLabel("姓名 林測試\n113/11/10"), true);
  assert.equal(G.isDispensingLabel("生产日期 2025.01.10"), false);
});

test("OCR provenance (option b): only label text is sent; deletions and small OCR corrections pass; typed names / phones are dropped", () => {
  const ocr = "คุณสมมติ ใจทดสอบ โทร 081-234-5678\nTESTOL 500 mg\nเลขทะเบียน 1A 844/39\nรักษาหายขาด 100%";
  const P = t => G.provenance(t, ocr);
  const same = "[removed] โทร [removed]\nTESTOL 500 mg\nเลขทะเบียน 1A 844/39";
  assert.deepEqual(P(same), { text: same, dropped: [] }, "redacted label text: unchanged, exactly as shown");
  assert.equal(P("TESTOL 500 mg").text, "TESTOL 500 mg", "deleting is allowed");
  assert.deepEqual(P("TESTOI 500 mg 1A844/39 รักษาหาย").dropped.map(d => d.text), ["1A844/39"],
    "letters-only: 1-character OCR correction and part of a Thai word pass; a token with digits must equal an OCR token (a joined number is dropped)");
  assert.equal(P("ＴＥＳＴＯＬ ๕๐๐ mg").dropped.length, 0, "NFKC + Thai digits + case folded");
  const r = P("TESTOL 500 mg โทร 089-111-2222 Jane Doe สมหญิง");
  assert.equal(r.text, "TESTOL 500 mg โทร");
  assert.deepEqual(r.dropped.map(d => d.text), ["089-111-2222", "Jane", "Doe", "สมหญิง"]);
  assert.equal(P("PARACETAMOL").text, "", "a drug name that is not on this label is not sent either");
  assert.equal(G.provenance("anything", "").text, "", "no OCR: nothing can be sent");
  const maker = "ผลิตโดย บริษัท สาธิต จำกัด โทร 02-315-4421";
  assert.deepEqual(G.provenance("โทร 02-315-4422", maker).dropped.map(d => d.text), ["02-315-4422"], "one digit off a label phone: dropped");
  assert.deepEqual(G.provenance("โทร 02-315-4421,", maker).dropped, [], "the label's own phone (punctuation aside): kept");
  assert.deepEqual(G.provenance("02-315-442", maker).dropped.length, 1, "part of a number is not a label token: dropped");
});


/* ---------------- product-label evidence filter (owner decision 2026-11-10, option 1) ---------------- */
const EV = JSON.parse(readFileSync(join(ROOT, "docs", "product-check", "p7-evidence-testset.json"), "utf8"));

test("evidence DEV set: frozen = what the generator builds; synthetic; product labels (clean + 4 low-quality OCR versions), documents, dispensing labels", async () => {
  const { build } = await import("../../tools/pc-evidence-testset.mjs");
  assert.deepEqual(build(), EV);
  assert.match(EV.source, /^synthetic/);
  const n = k => EV.items.filter(i => i.kind === k).length;
  assert.ok(n("product") >= 330 && n("document") >= 170 && n("dispensing") >= 40, `${n("product")} ${n("document")} ${n("dispensing")}`);
  for (const l of ["th", "en", "zh", "ja", "ko"]) assert.ok(EV.items.some(i => i.kind === "product" && i.lang === l) && EV.items.some(i => i.kind === "document" && i.lang === l), l);
  for (const v of ["clean", "drop", "merge", "half", "swap"]) assert.ok(EV.items.some(i => i.kind === "product" && i.variant === v), v);
});

test("evidence DEV set (tuned on; NOT a measurement): every document and dispensing label refused; no clean product label refused; product labels refused <= 5 %", async () => {
  const { score } = await import("../../tools/pc-evidence-testset.mjs");
  const s = score(G, EV);
  const bad = k => s.wrong.filter(w => w.kind === k).map(w => w.id + ":" + w.variant);
  assert.equal(s.by.document.refused, s.by.document.n, "documents allowed: " + bad("document"));
  assert.equal(s.by.dispensing.refused, s.by.dispensing.n, "dispensing labels allowed: " + bad("dispensing"));
  assert.equal(s.by["product/clean"].refused, 0, "clean product labels refused: " + bad("product"));
  assert.ok(s.by.product.refused / s.by.product.n <= 0.05, `product labels refused ${s.by.product.refused}/${s.by.product.n}: ${bad("product")}`);
  assert.ok(s.by["product/foreign"].refused / s.by["product/foreign"].n <= 0.05, "foreign product labels refused " + s.by["product/foreign"].refused);
});

test("productEvidence(): one strong cue (registration shape, valid barcode) or two label cue types; directions / strength / quantity alone are not enough", () => {
  const pe = (t, f) => G.productEvidence(t, f);
  for (const t of ["TESTOL 500 mg\nเลขทะเบียน 1A 844/39", "阿莫西林胶囊\n国药准字H20013062", "Loratadine\nDIN 02345678", "ครีมบำรุง\n10-1-6600012345", "อย. 13-2-06463-5-0326",
    "NDC 0573-0150-20", "MAL20012345AZ", "衛署藥製字第012345號", "AUST R 123456", "Barcode 8850006939727", "8850006939727\nขนมอบกรอบ"]) {
    const r = pe(t);
    assert.ok(r.product && r.strong, "strong: " + t + " " + JSON.stringify(r.evidence));
  }
  // barcode / registration facts the page holds
  assert.equal(pe("น้ำดื่ม ตราสาธิต\n600 มล.").product, false, "name + volume only");
  assert.equal(pe("น้ำดื่ม ตราสาธิต\n600 มล.", { gtins: ["8850006939727"] }).product, true, "a decoded barcode is strong evidence");
  assert.equal(pe("น้ำดื่ม ตราสาธิต\n600 มล.", { gtins: ["8850006939720"] }).product, false, "a barcode with a wrong check digit is not evidence");
  assert.equal(pe("ยาเม็ด K 12/50", { regs: ["K 12/50"] }).product, true, "a registration number parsed by the page, present in the text");
  assert.equal(pe("ยาเม็ดอะไรสักอย่าง", { regs: ["1A 844/39"] }).product, false, "a registration fact that is not in the text does not count");
  assert.equal(pe(null).product, false); assert.equal(pe("").personalDoc, false);
  // two different label cue types
  for (const t of ["SAMPLAVIT C\nVitamin C 1000 mg\nDietary Supplement\n60 Tablets", "ส่วนประกอบ: น้ำตาล เกลือ\nน้ำหนักสุทธิ 100 กรัม", "Ingredients: water\nBest before 03 2027",
    "成分：水、甘油\n净含量 30ml", "原材料名：小麦粉\n賞味期限 2027.01", "전성분: 정제수\n용량: 50ml", "布洛芬缓释胶囊\n每次1粒，每日2次\n孕妇禁用", "Manufactured by Example Ltd\nStore below 25°C"]) {
    const r = pe(t);
    assert.ok(r.product && !r.strong && !r.personalDoc, "two types: " + t + " " + JSON.stringify(r));
  }
  // weak cues together count as ONE type
  for (const t of ["Take 2 tablets 3 times a day\nParacetamol 500 mg tablets", "ยาแก้ปวด 500 มก. 10 เม็ด กินครั้งละ 1 เม็ด วันละ 3 ครั้ง",
    "每次1粒，每日2次\n100mg", "สวัสดีครับ วันนี้อากาศดี", "Dietary Supplement"])
    assert.equal(pe(t).product, false, "not enough: " + t + " " + JSON.stringify(pe(t).evidence));
  // low-quality OCR: lost tone marks, split words, look-alike characters, one lost letter
  assert.equal(pe("สวนประกอบ: นาตาล\nนาหนกสทธ 100 กรม").product, true, "Thai without vowel / tone marks");
  assert.equal(pe("ส่ ว น ป ร ะ ก อ บ: น้ำตาล\nป ริ ม า ณ สุ ท ธิ 100 กรัม").product, true, "Thai split by spaces");
  assert.equal(pe("Ingredents: water, glycerin\n5tore be1ow 25°C").product, true, "a lost letter and look-alike digits");
  assert.equal(pe("ส่วนปะกอบ: น้ำตาล\nน้ำหนักสุทิ 100 กรัม").product, true, "Thai with a lost consonant (approximate match)");
});

test("productEvidence(): personal-document signs veto even when the product is listed; pack wording is not a sign", () => {
  const doc = t => G.productEvidence(t).docCues;
  const SHIP = "ผู้รับ: คุณสมมติ ใจทดสอบ\nโทร 081-234-5678\nสินค้า: TESTOL 500 mg เลขทะเบียน 1A 844/39 ส่วนประกอบ: พาราเซตามอล น้ำหนักสุทธิ 10 กรัม\nผู้ส่ง: ร้านยาสาธิต";
  const r = G.productEvidence(SHIP);
  assert.ok(r.product && r.strong && r.personalDoc && r.docCues.includes("shipping"), JSON.stringify(r));
  const CASES = { shipping: ["Ship to: Jane Placeholder", "Tracking # 1Z999", "收件人：测试明", "寄件人 样本华", "お届け先 見本 太郎", "받는 분: 김샘플", "เก็บเงินปลายทาง 320", "เลขพัสดุ KEX123", "Penerima: Budi Contoh"],
    order: ["Order No. 100234", "เลขที่คำสั่งซื้อ #A10234", "订单编号：2024111", "주문번호 2024", "Gift message: enjoy"], receipt: ["TAX INVOICE", "ใบเสร็จรับเงิน", "合计：48.40", "領収書", "Subtotal 17.49"],
    certificate: ["MEDICAL CERTIFICATE", "This is to certify that", "ใบรับรองแพทย์", "诊断证明书", "診斷證明書", "診断書", "진단서", "Laboratory report"],
    appointment: ["Appointment card", "ใบนัด", "นัดครั้งต่อไป 15 ธ.ค.", "预约挂号凭条", "次回予約 11月20日"],
    letter: ["Dear Mary,", "Yours sincerely,", "สุขสันต์วันเกิดนะ", "ถึงคุณแม่", "亲爱的妈妈", "Happy birthday!"],
    identity: ["Passport No", "บัตรประจำตัวผู้ป่วย", "公民身份号码", "Policy No. 88-123", "Date of birth: 1 Jan 1990"] };
  for (const [g, list] of Object.entries(CASES)) for (const t of list) assert.ok(doc(t).includes(g), `${g}: ${t} -> ${doc(t)}`);
  assert.ok(doc("Shpee Xpress\nสาธิต ไม่มีจริง\n88/1 ถนนตัวอย่าง แขวงทดสอบ เขตจตุจักร กรุงเทพมหานคร 10900\nเซรั่ม 30 ml").includes("address"), "a street address with no maker cue");
  assert.ok(doc("Recipent: Jane\nInvoce 12").length >= 2, "one lost letter");
  // wording that stands on real packs
  for (const t of ["ผู้รับอนุญาต: บริษัท สาธิต จำกัด", "ผู้ส่งออก: บริษัท สาธิต จำกัด", "Prescription only medicine. Rx only", "Cod Liver Oil 1000 mg", "Made with love in Chiang Mai",
    "Dear customer, thank you for choosing us", "Advanced delivery system", "如症状未缓解，请及时就诊", "本品为处方药，凭医师处方销售", "お客様相談室 0120-000-000", "Signature blend coffee",
    "ผลิตโดย บริษัท สาธิต จำกัด\n99/9 หมู่ 4 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540", "Distributed by Mock Foods\n12 Sample Road, Bangkok 10110", "生产企业：示例食品有限公司\n地址：广东省广州市白云区示例路8号",
    "ไม่ได้มีไว้เพื่อการวินิจฉัย บำบัด รักษา หรือป้องกันโรค", "Batch No. 12345\nLOT 54321", "St. John's Wort 300 mg", "Prevents cracking of dry heels", "ราคา 35 บาท", "邮政编码：200000"])
    assert.deepEqual(doc(t), [], "pack wording: " + t);
});

test("aiGate(): ONE decision for both modes — dispensing label, personal document, no product evidence -> AI off; a product label -> allowed", () => {
  const LABEL = "TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nรักษาหายขาด 100% ไม่มีผลข้างเคียง";
  assert.deepEqual([G.aiGate(LABEL).allow, G.aiGate(LABEL).reason], [true, "ok"]);
  assert.equal(G.aiGate("คุณสมมติ ใจทดสอบ โทร 081-234-5678\n" + LABEL).allow, true, "a name on a product pack is redacted, the pack is still a product label");
  const DISP = "ร้านยาสาธิต\nสมพร ใจสมมติ\nHN 6512345\nรับประทานครั้งละ 1 เม็ด\n" + LABEL;
  assert.equal(G.aiGate(DISP).reason, "dispensing");
  assert.equal(G.aiGate(DISP, undefined, { dispensingAI: "text-preview" }).allow, true, "the owner's other setting: text after the preview");
  assert.equal(G.aiGate("ผู้รับ: คุณสมมติ ใจทดสอบ\n" + LABEL).reason, "personal-doc");
  assert.equal(G.aiGate("ผู้รับ: [removed]\n" + LABEL).reason, "personal-doc", "the sign survives redaction (Worker side)");
  assert.equal(G.aiGate("สวัสดีครับ ฝากซื้อยาด้วย").reason, "no-product");
  assert.equal(G.aiGate("").allow, false);
  assert.equal(G.aiGate("น้ำดื่ม 600 มล.", { gtins: ["8850006939727"] }).allow, true);
  for (const k of ["allow", "reason", "dispensing", "product", "evidence", "personalDoc", "docCues"]) assert.ok(k in G.aiGate(LABEL), k);
});

test("foreign dispensing labels (missed by the v5 independent check): Taiwan clinic, Shanghai outpatient; Taiwan ID; pack wording stays a product", () => {
  assert.equal(G.twIdOk("A123456789"), true); assert.equal(G.twIdOk("A123456788"), false); assert.equal(G.twIdOk("a123456789"), true); assert.equal(G.twIdOk("A323456789"), false);
  const k = t => G.scan(t).map(s => s.kind + ":" + t.slice(s.start, s.end));
  assert.deepEqual(k("身分證字號 A123456789"), ["id:A123456789"]);
  assert.deepEqual(k("LOT A123456788"), [], "a lot code with a wrong check digit is kept");
  for (const t of ["範例診所\n王樣本 先生\n每日三次 每次一粒 飯後服用", "王樣本\nA123456789\n普拿疼", "林樣本 女 45歲\n門診日期 2026/11/08 科別 家醫科", "領藥人 黃範例\n處方箋來源：範例醫院",
    "上海示例社区卫生服务中心\n门诊药房\n样本华", "门诊处方\n费别：医保\n李示例 女 34岁", "张示例 男 52岁\n就诊卡号 6001234567", "处方医师 王示例\n氨氯地平片", "测试明 病历 20241110088",
    "サンプル調剤薬局\n見本 太郎 様\n1日3回 毎食後", "샘플약국\n환자명: 김샘플\n조제일자 2026.11.10", "SAMPLE FAMILY CLINIC\nJane Placeholder\nNRIC S1234567D"])
    assert.equal(G.isDispensingLabel(t), true, t);
  for (const t of ["本品为处方药，凭医师处方销售、购买和使用", "如症状未缓解，请及时就诊", "请咨询医师或药师", "警語：除非藥師、藥劑生或醫師指示，孕婦不建議自行使用", "OTC 甲类 非处方药\n适用年龄：成人",
    "조제분유 1단계\n영양정보", "お求めは薬局・薬店で", "医師、薬剤師に相談してください", "แคลเซียม พลัส ดี\nรับประทานครั้งละ 1 เม็ด"])
    assert.equal(G.isDispensingLabel(t), false, t);
});

/* ---------------- fixes after the independent filter measurement (owner decision 2026-11-10, option ก) ----------------
 * DEV cases, written for the three kinds of misclassification the locked set showed (docs/product-check/P7-RESULTS.md
 * §3.7). Synthetic; none of these texts is in the locked set. */
test("letter cue: signature / greeting words do not fire inside product instruction wording; real notes still do", () => {
  const doc = t => G.productEvidence(t).docCues;
  const DEVICE = "เครื่องวัดอุณหภูมิอินฟราเรด รุ่น ST-20\nเครื่องมือแพทย์\nวิธีใช้: วางปลายเซนเซอร์ห่างหน้าผาก 3 ซม. แล้วกดปุ่ม\nคำเตือน: เก็บให้พ้นมือเด็ก\n" +
    "ผลิตโดย บริษัท สาธิต เมดิคอล จำกัด\nLot A1102 วันหมดอายุ 05/2028";
  assert.deepEqual(doc(DEVICE), [], "sensor tip (ปลายเซนเซอร์) is not a signature");
  assert.equal(G.aiGate(DEVICE).reason, "ok");
  for (const t of ["ยาหยอดหู ตราสาธิต\nวิธีใช้: หยอด 2 หยด ลงช่องหู วันละ 2 ครั้ง\nคำเตือน: ห้ามรับประทาน\nปริมาณสุทธิ 10 มล.",
    "น้ำยาทำความสะอาด\nขจัดคราบสกปรกแม้ฝังแน่น\nส่วนประกอบ: Sodium laureth sulfate 5%\nปริมาณสุทธิ 500 มล.",
    "ที่วัดไข้ วางป ลายเซนเซอร์ใต้ลิ้น รอสัญญาณ\nคำเตือน: ห้ามต้ม\nขนาดบรรจุ 1 ชิ้น"]) {
    assert.ok(!doc(t).includes("letter"), "product wording, not a letter: " + t + " " + JSON.stringify(doc(t)));
  }
  // notes and signed papers are still personal documents (with their marks anywhere; without marks at the start of a word)
  for (const t of ["ฝากยาให้คุณยายด้วยนะ\nลงชื่อ น้องฝน", "ผู้รับของลงชื่อ ................", "ลายเซ็นผู้ปกครอง ........", "กรุณาลงลายเซ็นตรงนี้",
    "ยาของแม่ ลูกรักแม่นะ", "ลงชอ นองฝน", "ลายเซน ผปกครอง", "ขอให้หายไวๆ นะคะ"]) {
    assert.ok(doc(t).includes("letter"), "still a letter / note: " + t + " " + JSON.stringify(doc(t)));
    assert.equal(G.aiGate(t).allow, false);
  }
});

test("maker address under low-quality OCR stays a maker address; a person's address is still a personal-document sign", () => {
  const doc = t => G.productEvidence(t).docCues;
  const BODY = "ส่วนประกอบสำคัญ: Glycerin, Niacinamide\nวิธีใช้: ทาบนผิวหน้า เช้าและก่อนนอน\nคำเตือน: หากมีความผิดปกติควรหยุดใช้\nเลขที่ใบรับจดแจ้ง 10-1-6600012345\n";
  for (const maker of [
    "ผลิตโดย บริษัท สาธิต คอสเมติกส์ จำกัด 99/1 ถ.มิตรภาพ อ.เมือง จ.ขอนแก่น 40000", // clean
    "ผลตโย บ ริษัท สาธิต คอสเมติกส์ จำกัด 99/1 ถ.มิตรภาพ อ.เมือง จ.ขอนแก่น 40000", // stray space, lost characters
    "ฝลิตดย บริัท สาธต คอสเมติกส จำกั 99/1 ถ.มิตรภาพ อ.เมือง จ.ขอนแก่น 40000", // look-alike letter, lost letters in both words
    "ผลิตโคย ปริษัท สาธิต จำกัด 99/1 ถ.มิตรภาพ อ.เมือง จ.ขอนแก่น 40000",
    "จัดจำหนายโคย หจก สาธิต 99/1 ถ.มิตรภาพ อ.เมือง จ.ขอนแก่น 40000"]) {
    const r = G.aiGate(BODY + maker, { gtins: ["8850006939727"] });
    assert.deepEqual([r.reason, r.docCues], ["ok", []], "maker address: " + maker + " " + JSON.stringify(r.docCues));
  }
  assert.ok(!doc("Each tablet contains: Paracetamol 500 mg\nStore below 30 C\nManufactued by Sample Pharma\n12 Sample Road, Bangkok 10110").includes("address"), "one lost letter in 'Manufactured'");
  // NOT weakened: a person's address has no maker word near it, even when it holds look-alike pieces (บรรทัดทอง, "จาก ด.ช.")
  for (const t of ["สมมติ ใจทดสอบ\n12/3 ซอยบรรทัดทอง ถนนพระราม 1 เขตปทุมวัน กรุงเทพฯ 10330",
    "จาก ด.ช. สมมติ\n45 หมู่ 2 ต.บางพระ อ.ศรีราชา จ.ชลบุรี 20110",
    "ส่งที่ 88/7 ถ.สุขุมวิท ต.บางพระ อ.ศรีราชา จ.ชลบุรี 20110\n" + BODY,
    "บ้านผลไม้ 9 หมู่ 4 ต.ท่าช้าง อ.เมือง จ.จันทบุรี 22000"]) {
    assert.ok(doc(t).includes("address"), "a person's address: " + t + " " + JSON.stringify(doc(t)));
    assert.equal(G.aiGate(t, { gtins: ["8850006939727"] }).reason, "personal-doc");
  }
});

test("dispensing detector: not on a food / herbal pack because of usage wording and a slogan line; real bare-name dispensing labels still refused", () => {
  const FOOD = "ข้าวกล้องงอก ตราสาธิต\nนาปีแท้ รุ่นพิเศษ\nน้ำหนักสุทธิ 1 กิโลกรัม\nส่วนประกอบ: ข้าวกล้องงอก 100%\nวิธีใช้: ข้าว 1 ส่วน ต่อน้ำ 2 ส่วน\n" +
    "ผลิตโดย บริษัท สาธิต ฟู้ดส์ จำกัด\nเลขสารบบอาหาร 10-1-12345-5-0001\nควรบริโภคก่อน 12/2027";
  assert.equal(G.nameLineCount(FOOD), 1, "the slogan line still reads like a name line (that is the case under test)");
  assert.equal(G.isDispensingLabel(FOOD), false);
  assert.deepEqual([G.aiGate(FOOD).reason, G.redact(FOOD).count, G.imageCheck(FOOD).block], ["ok", 0, false], "allowed, nothing removed, photo not blocked");
  const TEA = "ชาสมุนไพร ตราสาธิต\nดื่มง่าย ชุ่มคอ\nผลิตภัณฑ์สมุนไพร\nส่วนประกอบ: ใบเตย 60% ตะไคร้ 40%\nวิธีชง: ใช้ 1 ซอง ต่อน้ำร้อน 1 ถ้วย ดื่มวันละ 2 ครั้ง หลังอาหาร\nน้ำหนักสุทธิ 30 กรัม";
  assert.deepEqual([G.nameLineCount(TEA), G.isDispensingLabel(TEA), G.aiGate(TEA).reason], [1, false, "ok"]);
  // one instruction sentence split by OCR into name-like pieces is not a name line
  const HERB = "ฟ้าทะลายโจร แคปซูล\nยาแผนโบราณ\nรับประทานครั้งละ 2 แคปซูล วันละ 3 ครั้ง หลังอาหาร\nอ่าฉลากและเอก สาร กำกับก่อนใช้ ทุครั้ง\nเก็บในที่แห้ง";
  assert.deepEqual([G.nameLineCount(HERB), G.isDispensingLabel(HERB)], [0, false]);
  for (const l of ["อ่านฉลาก ก่อนใช้ ทุกครั้ง", "เก็บใน ที่แห้ง พ้นแสงแดด", "สอบถาม ข้อมูล ผู้บริโภค"]) assert.equal(G.nameLineCount(l), 0, l);
  // NOT weakened: a bare name with dosing text and no pack structure is a dispensing label (also with one or two pack cues)
  for (const t of ["AMOXICILLIN 500 mg\nสมมติ ใจทดสอบ\nรับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร",
    "ครีมทาผิว\nสมมติ ใจทดสอบ\nวิธีใช้: ทาบางๆ เช้าเย็น",
    "ยาอันตราย\nPREDNISOLONE 5 mg\nมาลีวัลย์ ทดลองศรี\nรับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง\nเก็บในตู้เย็น\nExp 08/2027",
    "Somsak Jaidee\nTake 1 tablet 3 times a day after meals\nParacetamol 500 mg tablets\nStore below 30 C"]) {
    assert.equal(G.isDispensingLabel(t), true, t);
    assert.equal(G.aiGate(t).reason, "dispensing", t);
  }
});

test("maker-printed responsible-pharmacist line next to a maker block is not a dispensing sign; the name is still removed and the photo blocked", () => {
  const cases = [
    ["เซทิริซีน 10 มก. ชนิดเม็ด\nยาอันตราย\nรับประทานครั้งละ 1 เม็ด วันละ 1 ครั้ง ก่อนนอน\nผลิตโดย บริษัท สาธิตเภสัช จำกัด จ.นนทบุรี\n" +
      "เภสัชกรผู้มีหน้าที่ปฏิบัติการ ภญ. สมมติ ทดสอบดี\nทะเบียนยาเลขที่ 1A 55/61", "สมมติ ทดสอบดี"],
    ["ยาธาตุน้ำแดง ตราสาธิต\nรับประทานครั้งละ 1 ช้อนโต๊ะ วันละ 3 ครั้ง หลังอาหาร\nผู้รับอนุญาต นายสมมติ ใจทดสอบ\nผลิตโดย หจก. สาธิตโอสถ\nทะเบียนยาเลขที่ G 12/50", "สมมติ ใจทดสอบ"],
    ["綜合感冒錠\n成人每次1錠，一日3次，飯後服用\n衛署藥製字第012345號\n製造商：範例製藥股份有限公司\n管理藥師：林測試", "林測試"],
    ["止咳糖漿\n成人每次10毫升，一日3次\n衛部藥製字第054321號\n範例藥廠有限公司 監製藥師 王範例", "王範例"],
    ["SAMPLEZINE 10 mg tablets\nTake 1 tablet once daily\nManufactured by Sample Pharma Co., Ltd.\nPharmacist in charge: Somchai Sample\nReg. No. 1A 99/60", "Somchai Sample"]
  ];
  for (const [t, person] of cases) {
    const g = G.aiGate(t), r = G.redact(t);
    assert.deepEqual([g.dispensing, g.reason], [false, "ok"], t + " " + JSON.stringify([g.reason, g.docCues]));
    assert.ok(!r.text.includes(person) && r.count >= 1, "the responsible person's name is removed: " + r.text);
    assert.equal(G.imageCheck(t).block, true, "the photo is blocked (a name is printed on it): text only");
  }
  // an organisation after the role word is not a person
  assert.equal(G.redact("ผู้ควบคุมการผลิต บริษัท สาธิตเภสัช จำกัด").count, 0);
  // NOT weakened: no maker block near the line; a patient on the label; a pharmacy's own label
  for (const t of ["感冒膠囊\n每次2粒，一日3次\n管理藥師：陳測試",
    "รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง\nนางสมมติ ทดสอบดี\nผลิตโดย บริษัท สาธิตเภสัช จำกัด\nเภสัชกรผู้มีหน้าที่ปฏิบัติการ ภก. ทดลอง ใจดี",
    "ร้านยาสาธิต\nเภสัชกรผู้มีหน้าที่ปฏิบัติการ ภก. ทดลอง ใจดี\nรับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง",
    "Patient: Jane Sample\nPharmacist in charge: Somchai Sample, Sample Pharma Co., Ltd.\nTake 1 tablet 3 times a day",
    "藥師：陳測試\n每次2粒，一日3次\n範例製藥股份有限公司"]) {
    assert.equal(G.aiGate(t).reason, "dispensing", t);
  }
});
