"use strict";
// tests/unit/med.test.js — lensiq-med.js (LQMed, medicine checker logic) + the slim Pillbox data + page-level safety
// rules of medicine.html / medicine.js: Thai registration / food / barcode / NDC parsing, candidate search (>= 3 or none,
// never one answer), verbatim label sections in a fixed order, emergency wording, history, required NLM attribution and
// warning, no dose calculator / buy links / ranking, images never sent, online lookups opt-in only.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const M = require("../../lensiq-med.js");
const DATA_PATH = join(ROOT, "vendor", "pillbox", "pillbox-2020-v1.json");
const DATA = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const HTML = readFileSync(join(ROOT, "medicine.html"), "utf8");
const JS = readFileSync(join(ROOT, "medicine.js"), "utf8");
const NLM_WARNING = "These files will not be updated and should not be used for pill identification.";
const NLM_ATTRIBUTION = "This product uses publicly available data from the U.S. National Library of Medicine (NLM).";

test("parseThaiReg: spaced / compact / Thai digits / suffix / OCR look-alikes; rejects non-registrations", () => {
  assert.equal(M.parseThaiReg("1A 15/50").norm, "1A 15/50");
  assert.equal(M.parseThaiReg("1A15/50").norm, "1A 15/50");
  assert.equal(M.parseThaiReg("เลขทะเบียนยา ๑A ๑๕/๕๐").norm, "1A 15/50");
  const s = M.parseThaiReg("Reg. No. 2A 3/60 (NG)");
  assert.deepEqual([s.digit, s.letter, s.seq, s.year, s.yearBE, s.suffix, s.norm], ["2", "A", "3", "60", 2560, "NG", "2A 3/60 (NG)"]);
  assert.equal(M.parseThaiReg("1C 12/55 (NC)").norm, "1C 12/55 (NC)");
  assert.equal(M.parseThaiReg("1A I5/5O").norm, "1A 15/50", "OCR O/I repaired in the number part");
  assert.equal(M.parseThaiReg("G 123/45").norm, "G 123/45", "traditional series without the leading digit");
  assert.equal(M.parseThaiReg("A 12/50").ok, false);
  assert.equal(M.parseThaiReg("1A 0/50").ok, false);
  assert.equal(M.parseThaiReg("12/50").ok, false);
  assert.deepEqual(M.findThaiReg("Reg No 1A 15/50 / 2A 3/60 / 1A 15/50").map(r => r.norm), ["1A 15/50", "2A 3/60"]);
  // bare G / K after a lot / expiry word is a lot or date code, not a registration; bare G / K is flagged uncertain + ranked last
  assert.deepEqual(M.findThaiReg("Lot K 12/25"), []);
  assert.deepEqual(M.findThaiReg("EXP G 3/24"), []);
  assert.equal(M.parseThaiReg("G 123/45").uncertain, true);
  assert.equal(M.parseThaiReg("1A 15/50").uncertain, false);
  assert.deepEqual(M.findThaiReg("G 9/45 Reg. No. 1A 15/50").map(r => r.norm), ["1A 15/50", "G 9/45"]);
});

test("cleanTerm keeps Thai vowels and tone marks (combining marks)", () => {
  assert.equal(M.cleanTerm("ไทลินอล"), "ไทลินอล");
  assert.equal(M.cleanTerm("ไทลินอล ยาแก้ไอ"), "ไทลินอล ยาแก้ไอ");
  assert.deepEqual(M.classify("ไทลินอล"), [{ kind: "name", q: "ไทลินอล" }]);
});

test("food / supplement number, barcodes, NDC, classify", () => {
  assert.deepEqual(M.parseFoodNo("อย. 10-1-12345-1-0001"), { ok: true, digits: "1011234510001", dashed: true, norm: "10-1-12345-1-0001" });
  assert.equal(M.parseFoodNo("10-1-12345-10001").ok, false, "mixed separators");
  assert.equal(M.eanValid("8850999320014"), true);
  assert.equal(M.eanValid("8850999320015"), false);
  assert.equal(M.eanValid("036000291452"), true, "UPC-A");
  const th = M.parseBarcode("8850999320014");
  assert.equal(th.thai, true); assert.equal(th.valid, true); assert.deepEqual(th.ndcs, []);
  const us = M.parseBarcode("0363824162017");
  assert.equal(us.ndc10, "6382416201");
  assert.deepEqual(us.ndcs, ["6382-4162-01", "63824-162-01", "63824-1620-1"]);
  assert.equal(M.parseBarcode("(01)08850999320014(17)261231").digits, "8850999320014", "GS1 element string -> GTIN-13");
  assert.deepEqual(M.parseNdc("NDC 0603-5892-21"), { ok: true, ndc: "0603-5892-21", product: "0603-5892" });
  assert.equal(M.parseNdc("0603-5892-211").ok, false);
  assert.deepEqual(M.classify("1A 15/50").map(d => d.kind), ["thai-reg"]);
  assert.deepEqual(M.classify("อย. 10-1-12345-1-0001").map(d => d.kind), ["food"]);
  assert.deepEqual(M.classify("8850999320014", { from: "barcode" }).map(d => d.kind), ["barcode"]);
  assert.deepEqual(M.classify("0603-5892-21").map(d => d.kind), ["ndc"]);
  assert.deepEqual(M.classify("8850999320014").map(d => d.kind), ["barcode"], "plain 13 digits with a valid EAN check digit = barcode, not a food number");
  assert.deepEqual(M.classify("paracetamol"), [{ kind: "name", q: "paracetamol" }]);
  assert.deepEqual(M.classify("พาราเซตามอล").map(d => d.kind), ["name"]);
  assert.deepEqual(M.classify("  "), []);
});

test("slim Pillbox data: format, public-domain source, NLM warning verbatim, size budget, licence files next to it", () => {
  assert.equal(DATA.format, "lensiq-pillbox-slim/1");
  assert.equal(DATA.nlm_warning, NLM_WARNING);
  assert.match(DATA.license, /Public domain/);
  assert.deepEqual(DATA.cols, ["imprint", "color", "shape", "size_mm", "score", "name", "strength", "rxcui", "setid", "source", "dea", "n"]);
  assert.ok(DATA.rows.length > 30000, "rows " + DATA.rows.length);
  assert.ok(statSync(DATA_PATH).size < 4.5 * 1024 * 1024, "raw size stays under 4.5 MB");
  for (const r of DATA.rows.slice(0, 500)) {
    assert.equal(r.length, 12);
    assert.ok(r[0].length > 0, "every row has an imprint");
    assert.ok(typeof DATA.names[r[5]] === "string");
    assert.ok(r[8] === "" || /^[0-9a-f]{32}$/.test(r[8]));
  }
  assert.ok(!/image|\.jpg|\.png/i.test(DATA.cols.join(",")), "no image column");
  const lic = readFileSync(join(ROOT, "vendor", "pillbox", "LICENSE.txt"), "utf8");
  assert.ok(lic.includes(NLM_WARNING) && lic.includes(NLM_ATTRIBUTION) && /PUBLIC DOMAIN/.test(lic));
  assert.ok(readFileSync(join(ROOT, "vendor", "pillbox", "README.md"), "utf8").includes(NLM_WARNING));
});

test("imprint matching: exact (either side order), one side, look-alike fuzzy, partial", () => {
  assert.deepEqual(M.normImprint("5892 ; v"), { sides: ["5892", "V"], joined: "5892V" });
  assert.equal(M.imprintScore("5892;V", "5892;V").how, "exact");
  assert.equal(M.imprintScore("V;5892", "5892;V").how, "exact");
  assert.equal(M.imprintScore("5892", "5892;V").how, "side");
  assert.equal(M.imprintScore("5B92V", "5892;V").how, "fuzzy", "8/B look-alike");
  assert.equal(M.imprintScore("TYLE", "TYLENOL;500").how, "partial");
  assert.equal(M.imprintScore("ZZZZ", "5892;V").s, 0);
  assert.equal(M.wdist("0", "O"), 0.5);
});

test("candidates: several or none — never 1 or 2 strict matches; under 3 strict -> imprint-only pass, every row loose", () => {
  const r = M.candidates(DATA, { imprint: "5892;V", color: "PINK", shape: "CAPSULE" });
  const strictN = r.list.filter(c => !c.loose).length;
  assert.ok(strictN === 0 || strictN >= 3, "never 1 or 2 rows carrying the 'match' badge");
  if (strictN === 0) {
    assert.ok(r.list.length >= 3 && r.padded, "imprint-only pass of >= 3");
    assert.ok(r.list.every(c => c.loose), "no row stands out as the match");
    const t = r.list.find(c => c.name === "Temazepam");
    assert.ok(t, "the feature-matching row is among them");
    assert.equal(t.setid, "471fa2f1-73a0-49be-89f3-d3e2cfdaeca0");
  }
  // reviewer case: imprint 83 + YELLOW + CAPSULE gave 1 strict + 4 padding rows
  const y = M.candidates(DATA, { imprint: "83", color: "YELLOW", shape: "CAPSULE" });
  const yStrict = y.list.filter(c => !c.loose).length;
  assert.ok(yStrict === 0 || yStrict >= 3, "83 / YELLOW / CAPSULE: no lone strict row");
  const none = M.candidates(DATA, { imprint: "QQQQQQQQQX" });
  assert.deepEqual(none.list, []);
  assert.equal(none.reason, "none");
  assert.equal(M.candidates(DATA, { imprint: "" }).reason, "noimprint");
  assert.equal(M.candidates(null, { imprint: "x" }).reason, "nodata");
  // a tiny data set where only 2 rows match: withheld, not shown
  const tiny = { colors: ["WHITE"], shapes: ["ROUND"], names: ["A", "B"], strengths: [""], sources: ["HRX"], dea: [""],
    rows: [["AB12", 0, 0, 8, 1, 0, 0, 0, "", 0, 0, 1], ["AB12", 0, 0, 9, 1, 1, 0, 0, "", 0, 0, 1]] };
  const two = M.candidates(tiny, { imprint: "AB12" });
  assert.deepEqual(two.list, []);
  assert.equal(two.withheld, 2);
  assert.equal(two.reason, "toofew");
  // 1 row matches every feature + 3 imprint-only rows: shown as an imprint-only pass, nothing flagged as the match
  const four = { colors: ["WHITE", "BLUE"], shapes: ["ROUND"], names: ["A", "B", "C", "D"], strengths: [""], sources: ["HRX"], dea: [""],
    rows: [["CD34", 0, 0, 8, 1, 0, 0, 0, "", 0, 0, 1], ["CD34", 1, 0, 8, 1, 1, 0, 0, "", 0, 0, 1], ["CD34", 1, 0, 9, 1, 2, 0, 0, "", 0, 0, 1], ["CD34", 1, 0, 7, 1, 3, 0, 0, "", 0, 0, 1]] };
  const p = M.candidates(four, { imprint: "CD34", color: "WHITE" });
  assert.equal(p.list.length, 4);
  assert.equal(p.padded, true);
  assert.ok(p.list.every(c => c.loose), "the single strict row does not carry a 'match' flag");
  const allStrict = M.candidates(four, { imprint: "CD34", color: "BLUE" });
  assert.equal(allStrict.padded, false);
  assert.ok(allStrict.list.length === 3 && allStrict.list.every(c => !c.loose));
  for (const c of M.candidates(DATA, { imprint: "TYLENOL 500" }).list) assert.ok(!("rank" in c) && !("best" in c), "no rank / 'best' field exposed");
});

test("online URLs: text only, sanitised, English-only openFDA name search, CORS hosts", () => {
  assert.equal(M.cleanTerm('ibu"<script>profen'), "ibu script profen");
  const u = M.openfdaLabelUrl({ name: "ibuprofen" });
  assert.ok(u.startsWith("https://api.fda.gov/drug/label.json?search="));
  assert.match(decodeURIComponent(u), /openfda\.generic_name:"ibuprofen" openfda\.brand_name:"ibuprofen"/);
  assert.equal(M.openfdaLabelUrl({ name: "พารา" }), "");
  assert.match(decodeURIComponent(M.openfdaLabelUrl({ ndc: ["0603-5892-21", "bad"] })), /package_ndc:"0603-5892-21"&limit/);
  assert.match(decodeURIComponent(M.openfdaLabelUrl({ setid: "471FA2F1-73A0-49BE-89F3-D3E2CFDAECA0" })), /set_id:"471fa2f1/);
  assert.equal(M.openfdaLabelUrl({ setid: "x" }), "");
  assert.equal(M.rxnavApproxUrl("amoxycillin"), "https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=amoxycillin&maxEntries=6");
  assert.equal(M.rxnavPropsUrl("723"), "https://rxnav.nlm.nih.gov/REST/rxcui/723/properties.json");
  assert.equal(M.rxnavPropsUrl("1;drop"), "");
  assert.deepEqual(M.rxnavCandidates({ approximateGroup: { candidate: [{ rxcui: "723", score: "9.6", name: "Amoxycillin" }, { rxcui: "723" }, { rxcui: "x" }] } }),
    [{ rxcui: "723", score: 9.6, name: "Amoxycillin", source: "" }]);
});

test("labelSections: verbatim text, fixed order, truncation flagged, DailyMed source + date", () => {
  const res = {
    set_id: "471fa2f1-73a0-49be-89f3-d3e2cfdaeca0", effective_time: "20240131",
    warnings: ["Liver warning: This product contains acetaminophen."], indications_and_usage: ["Uses temporarily relieves minor aches"],
    dosage_and_administration: ["Directions do not take more than directed " + "x".repeat(50)], spl_product_data_elements: ["ignored"],
    openfda: { generic_name: ["ACETAMINOPHEN"], brand_name: ["Example"], product_type: ["HUMAN OTC DRUG"], manufacturer_name: ["Maker"] }
  };
  const l = M.labelSections(res, { maxChars: 40 });
  assert.deepEqual(l.sections.map(s => s.id), ["indications_and_usage", "dosage_and_administration", "warnings"], "fixed order from SECTIONS");
  assert.equal(l.sections[0].text, "Uses temporarily relieves minor aches");
  assert.equal(l.sections[1].cut, true);
  assert.equal(l.sections[1].text, res.dosage_and_administration[0].slice(0, 40), "cut, never rephrased");
  assert.equal(l.effective, "2024-01-31");
  assert.equal(l.source, "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=471fa2f1-73a0-49be-89f3-d3e2cfdaeca0");
  assert.equal(l.generic, "ACETAMINOPHEN");
  assert.ok(!l.sections.some(s => s.id === "spl_product_data_elements"));
});

test("Thai FDA status / category mapping", () => {
  assert.equal(M.thfdaStatus("คงอยู่"), "active");
  assert.equal(M.thfdaStatus("ยกเลิก(8 พฤษภาคม 2560)"), "cancelled");
  assert.equal(M.thfdaStatus("หมดอายุ"), "expired");
  assert.equal(M.thfdaStatus("รอตรวจสอบสถานะ"), "pending");
  assert.equal(M.thfdaKind("ยาอันตราย"), "dangerous");
  assert.equal(M.thfdaKind("ยาควบคุมพิเศษ"), "special");
  assert.equal(M.thfdaKind("ยาสามัญประจำบ้าน"), "household");
  assert.equal(M.thfdaKind("ยาที่ไม่ใช่ยาอันตรายหรือยาควบคุมพิเศษ"), "nondangerous");
  assert.equal(M.pertentoUrl("U1DR1A1022450042211C"), "https://pertento.fda.moph.go.th/FDA_INFORMATION_DRUG/Home/Phar_Product_Inform_Page?Newcode=U1DR1A1022450042211C");
  assert.equal(M.pertentoUrl("x\"><script>"), "");
});

test("emergency wording (TH / EN / ZH) -> poison card; self-harm adds 1323", () => {
  for (const s of ["ลูกกินยาพาราไปทั้งแผง", "กินยาเกินขนาด", "เด็กเผลอกินยา", "my son swallowed pills", "overdose", "孩子误服了药", "吃药过量"]) assert.equal(M.emergency(s).poison, true, s);
  for (const s of ["อยากตาย", "I want to kill myself", "想自杀"]) assert.deepEqual(M.emergency(s), { poison: true, self: true }, s);
  for (const s of ["paracetamol", "1A 15/50", "ปวดหัว", "headache"]) assert.deepEqual(M.emergency(s), { poison: false, self: false }, s);
  // number of tablets / "a lot" phrasings
  for (const s of ["ลูกกินยาพาราไป 10 เม็ด", "เมื่อวานกินไป 12 เม็ด", "took 20 tablets", "she swallowed 8 pills", "ate a whole box of pills", "孩子吃了很多药", "吃了10片"]) assert.equal(M.emergency(s).poison, true, s);
  // label dosing wording and harmless phrases are not emergencies
  for (const s of ["ห้ามกินเกิน 8 เม็ดต่อวัน", "ห้ามรับประทานเกิน 8 เม็ด", "รับประทานครั้งละ 1-2 เม็ด ไม่เกิน 8 เม็ดต่อวัน", "กินยาวันละ 2 เม็ด", "do not take more than 8 tablets", "poison ivy cream"]) assert.equal(M.emergency(s).poison, false, s);
});

test("history + CSV: newest first, de-duplicated, capped, formula-safe", () => {
  let h = [];
  for (let i = 0; i < 5; i++) h = M.historyAdd(h, { at: i, kind: "pack", q: "q" + i }, 3);
  assert.deepEqual(h.map(e => e.q), ["q4", "q3", "q2"]);
  h = M.historyAdd(h, { at: 9, kind: "pack", q: "q3" }, 3);
  assert.deepEqual(h.map(e => e.q), ["q3", "q4", "q2"]);
  assert.match(M.toCSV([{ a: "=1+1", b: 'x,"y"' }], ["a", "b"]), /^a,b\r\n'=1\+1,"x,""y"""\r\n$/);
});

test("medicine.html: NLM attribution + warning verbatim, openFDA disclaimer, 1669 / 1367, pharmacist confirmation", () => {
  assert.ok(HTML.includes(NLM_WARNING), "NLM warning verbatim");
  assert.ok(HTML.includes(NLM_ATTRIBUTION), "NLM attribution verbatim");
  assert.ok(HTML.includes("Do not rely on openFDA to make decisions regarding medical care."), "openFDA disclaimer");
  assert.match(HTML, /href="tel:1669"/); assert.match(HTML, /href="tel:1367"/); assert.match(HTML, /href="tel:1323"/);
  assert.match(HTML, /ยืนยันกับเภสัชกร/);
  assert.match(HTML, /<input type="checkbox" id="mdOnline">/, "online lookups are an explicit, unchecked opt-in");
  assert.match(HTML, /<input type="checkbox" id="mdHist">/, "history is opt-in");
  assert.match(HTML, /Content-Security-Policy/);
});

test("medicine page: no dose calculator, no buy / affiliate links, no ranking, no image upload, no emotion / lie inference", () => {
  const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const both = HTML + code(JS) + code(readFileSync(join(ROOT, "lensiq-med.js"), "utf8"));
  assert.ok(!/mg\/kg|body ?weight|น้ำหนักตัว|dose calculator|calculateDose|doseFor/i.test(both), "no dose calculation");
  assert.ok(!/(shopee|lazada|amazon|buy now|ซื้อเลย|สั่งซื้อ|affiliate|sponsor)/i.test(both), "no buy links / promotion");
  assert.ok(!/best for|ดีที่สุด|ยอดนิยม|recommended for you/i.test(both), "no 'best for' / recommendations");
  assert.ok(!/toDataURL|toBlob|FormData|readAsDataURL/.test(JS), "images are never encoded for sending");
  assert.ok(!/localStorage\.setItem\([^)]*(image|frame|photo)/i.test(JS), "no images in storage");
  assert.ok(!/expression|emotion|faceapi|\blie\b|deception|truthful/i.test(code(JS)), "no emotion / lie inference");
  assert.match(JS, /if \(!cfg\.online\)/, "every lookup is gated on the opt-in");
  assert.match(JS, /credentials: "omit", referrerPolicy: "no-referrer"/, "no cookies / referrer to third parties");
});
