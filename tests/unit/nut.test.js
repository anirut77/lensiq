"use strict";
// tests/unit/nut.test.js — Nutrition MVP, label mode (docs/NUTRITION-DESIGN.md §2.2, §4.4, §5.1 "Recalculation", §7).
// FIXED TEST, written and locked (~/LENSIQ-field/evals/nutrition/locked.sha256) BEFORE lensiq-nut.js existed.
// Labels here are hand-written synthetic examples (not the locked eval set). LQNut is pure: no DOM, no network.
//   parseLabel(lines) -> {format, items:[{field, basis, value, cmp, value_text, unit, line, raw, status, why}], serving,
//     servingsPerPack, allergen, notFound}
//   convert(item) -> converted value (kJ -> kcal, salt -> sodium), always marked converted
//   recalc(parsed, amount) -> calculated values from the PRINTED values, or {ok:false, reason} (never a guessed weight)
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../../lensiq-nut.js");

const get = (p, field, basis) => p.items.find(i => i.field === field && (!basis || i.basis === basis));

const TH_NEW = [
  "ข้อมูลโภชนาการ",
  "หนึ่งหน่วยบริโภค : 1 ซอง (30 กรัม)",
  "จำนวนหน่วยบริโภคต่อซอง : ประมาณ 2",
  "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค",
  "พลังงานทั้งหมด 150 กิโลแคลอรี",
  "ร้อยละของปริมาณที่แนะนำต่อวัน*",
  "ไขมันทั้งหมด 7 ก. 11%",
  "ไขมันอิ่มตัว 3 ก. 15%",
  "คอเลสเตอรอล น้อยกว่า 5 มก. 1%",
  "โปรตีน 2 ก.",
  "คาร์โบไฮเดรตทั้งหมด 20 ก. 7%",
  "น้ำตาลทั้งหมด 9 ก.",
  "โซเดียม 180 มก. 8%",
  "โพแทสเซียม 50 มก. 1%",
  "ข้อมูลสำหรับผู้แพ้อาหาร: มี นม ถั่วเหลือง"
];

test("Thai panel (No. 445 style): fields as printed, basis per serving, serving weight, servings per pack, allergens", () => {
  const p = N.parseLabel(TH_NEW);
  assert.match(p.format, /^th/);
  const want = { energy_kcal: ["150", "kcal"], fat: ["7", "g"], satfat: ["3", "g"], protein: ["2", "g"], carb: ["20", "g"], sugar: ["9", "g"], sodium: ["180", "mg"] };
  for (const [f, [v, u]] of Object.entries(want)) {
    const it = get(p, f);
    assert.ok(it, f + " found");
    assert.equal(it.basis, "serving", f + " basis");
    assert.equal(it.value_text, v, f + " value");
    assert.equal(it.unit, u, f + " unit");
    assert.equal(typeof it.line, "number", f + " source line index");
    assert.ok(it.raw && TH_NEW[it.line].includes(it.raw.trim().split(" ")[0]), f + " raw text comes from its line");
  }
  // cholesterol / potassium are printed but are not in the scored set: never reported as another field
  assert.equal(p.items.filter(i => i.field === "sodium").length, 1, "potassium is not sodium");
  assert.equal(p.serving.grams, 30);
  assert.equal(p.servingsPerPack.value, 2);
  assert.match(p.allergen.text, /ข้อมูลสำหรับผู้แพ้อาหาร: มี นม ถั่วเหลือง/);
  assert.deepEqual([...p.allergen.words].sort(), ["ถั่วเหลือง", "นม"].sort());
  // fibre is optional on the new format: listed as not found, never shown as zero
  assert.ok(p.notFound.includes("fibre"), "fibre not found " + p.notFound);
  assert.ok(!get(p, "fibre"), "no invented fibre value");
  assert.ok(p.items.every(i => i.status === "read"), "consistent label: all read " + JSON.stringify(p.items.filter(i => i.status !== "read")));
});

test("Thai old panel: 'energy from fat' is not energy; 'less than 1' kept as printed; Thai digits and spacing normalised", () => {
  const p = N.parseLabel(["ข้อมูลโภชนาการ", "หนึ่งหน่วยบริโภค: 1 กล่อง (200 มล.)", "จำนวนหน่วยบริโภคต่อกล่อง: 1", "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค",
    "พลังงานทั้งหมด ๑๒๐ กิโลแคลอรี (พลังงานจากไขมัน 30 กิโลแคลอรี)", "ไขมันทั้งหมด 3.5 ก. 5%", "ไขมันอิ่มตัว 2 ก. 10%", "โปรตีน 6 ก.",
    "คาร์โบไฮเดรตทั้งหมด 18 ก. 6%", "ใยอาหาร น้อยกว่า 1 ก. 3%", "น้ำตาล 16 ก.", "โซเดียม 120 มก. 5%"]);
  const e = p.items.filter(i => i.field === "energy_kcal");
  assert.equal(e.length, 1, "one energy value");
  assert.equal(e[0].value_text, "120", "Thai digits");
  const fib = get(p, "fibre");
  assert.equal(fib.value_text, "<1"); assert.equal(fib.cmp, "<"); assert.equal(fib.value, 1);
  assert.equal(p.serving.ml, 200);
  assert.equal(p.servingsPerPack.value, 1);
  assert.equal(p.allergen, null, "no allergen statement on this label");
});

test("Thai GDA front of pack: per pack, both the row layout and the 4-box column layout", () => {
  const rows = N.parseLabel(["คุณค่าทางโภชนาการต่อ 1 ซอง", "ควรแบ่งกิน 2 ครั้ง", "พลังงาน 250 กิโลแคลอรี 13%*", "น้ำตาล 12 กรัม 13%*", "ไขมัน 14 กรัม 21%*",
    "โซเดียม 380 มิลลิกรัม 16%*", "*คิดเป็นร้อยละของปริมาณสูงสุดที่บริโภคได้ต่อวัน"]);
  const cols = N.parseLabel(["คุณค่าทางโภชนาการต่อ 1 ซอง", "ควรแบ่งกิน 2 ครั้ง", "พลังงาน น้ำตาล ไขมัน โซเดียม", "250 12 14 380",
    "กิโลแคลอรี กรัม กรัม มิลลิกรัม", "13%* 13%* 21%* 16%*", "*คิดเป็นร้อยละของปริมาณสูงสุดที่บริโภคได้ต่อวัน"]);
  for (const p of [rows, cols]) {
    assert.equal(p.format, "th-gda");
    const want = { energy_kcal: ["250", "kcal"], sugar: ["12", "g"], fat: ["14", "g"], sodium: ["380", "mg"] };
    for (const [f, [v, u]] of Object.entries(want)) {
      const it = get(p, f);
      assert.ok(it, f);
      assert.equal(it.basis, "pack", f + " basis");
      assert.equal(it.value_text, v, f); assert.equal(it.unit, u, f);
    }
    assert.equal(p.items.length, 4, "only the four GDA values " + JSON.stringify(p.items.map(i => i.field)));
    assert.equal(p.servingsPerPack, null, "'ควรแบ่งกิน' is advice, not servings per pack");
  }
});

test("US Nutrition Facts: calories, 'Includes added sugars' is not total sugars, thousands separator, 'Less than 1g'", () => {
  const p = N.parseLabel(["Nutrition Facts", "About 2.5 servings per container", "Serving size 1 cup (240mL)", "Amount per serving", "Calories 230",
    "% Daily Value*", "Total Fat 8g 10%", "Saturated Fat 1g 5%", "Trans Fat 0g", "Cholesterol 0mg 0%", "Sodium 1,160mg 50%",
    "Total Carbohydrate 37g 13%", "Dietary Fiber Less than 1g 2%", "Total Sugars 12g", "Includes 10g Added Sugars 20%", "Protein 3g",
    "Contains: Milk, Soy."]);
  assert.equal(p.format, "us");
  assert.equal(get(p, "energy_kcal").value_text, "230");
  assert.equal(get(p, "energy_kcal").unit, "kcal");
  assert.equal(get(p, "sodium").value_text, "1160", "1,160 is one thousand one hundred and sixty");
  assert.equal(get(p, "sugar").value_text, "12", "total sugars, not added sugars");
  assert.equal(p.items.filter(i => i.field === "sugar").length, 1);
  assert.equal(get(p, "fibre").value_text, "<1");
  assert.equal(p.items.filter(i => i.field === "fat").length, 1, "trans fat is not total fat");
  assert.equal(p.serving.ml, 240);
  assert.equal(p.servingsPerPack.value, 2.5);
  assert.match(p.allergen.text, /^Contains: Milk, Soy\.?$/);
});

test("EU two columns: per 100 g and per serving, kJ and kcal, decimal commas, salt (never auto-converted into the printed column)", () => {
  const p = N.parseLabel(["Nutrition declaration Per 100 g Per 30 g serving", "Energy 1650 kJ / 394 kcal 495 kJ / 118 kcal", "Fat 12 g 3,6 g",
    "of which saturates 4,5 g 1,4 g", "Carbohydrate 60 g 18 g", "of which sugars 22 g 6,6 g", "Protein 8,0 g 2,4 g", "Salt 0,85 g 0,26 g"]);
  assert.equal(p.format, "eu");
  assert.equal(get(p, "energy_kj", "100g").value_text, "1650");
  assert.equal(get(p, "energy_kcal", "100g").value_text, "394");
  assert.equal(get(p, "energy_kj", "serving").value_text, "495");
  assert.equal(get(p, "energy_kcal", "serving").value_text, "118");
  assert.equal(get(p, "satfat", "100g").value_text, "4.5", "decimal comma");
  assert.equal(get(p, "sugar", "serving").value_text, "6.6");
  assert.equal(get(p, "salt", "100g").value_text, "0.85");
  assert.ok(!get(p, "sodium"), "salt is not turned into a printed sodium value");
  assert.equal(p.serving.grams, 30);
  const s = N.convert(get(p, "salt", "100g"));
  assert.equal(s.field, "sodium"); assert.equal(s.unit, "mg"); assert.equal(s.value, 340); assert.equal(s.converted, true);
  const k = N.convert({ field: "energy_kj", value: 1650, cmp: "", unit: "kJ" });
  assert.equal(k.field, "energy_kcal"); assert.equal(k.value, 394); assert.equal(k.converted, true);
});

test("China 营养成分表 (kJ, 每100克, NRV%) and Japan 栄養成分表示 (食塩相当量; 糖質 is not sugars)", () => {
  const cn = N.parseLabel(["营养成分表", "项目 每100克 营养素参考值%", "能量 1850千焦 22%", "蛋白质 6.5克 11%", "脂肪 20.0克 33%", "—饱和脂肪 9.0克 45%",
    "碳水化合物 60.2克 20%", "—糖 25.0克", "钠 320毫克 16%", "致敏物质提示：含有乳制品、大豆"]);
  assert.equal(cn.format, "cn");
  for (const [f, v, u] of [["energy_kj", "1850", "kJ"], ["protein", "6.5", "g"], ["fat", "20.0", "g"], ["satfat", "9.0", "g"], ["carb", "60.2", "g"], ["sugar", "25.0", "g"],
    ["sodium", "320", "mg"]]) {
    const it = get(cn, f, "100g");
    assert.ok(it, f); assert.equal(Number(it.value_text), Number(v), f); assert.equal(it.unit, u, f);
  }
  assert.equal(cn.items.filter(i => i.field === "fat").length, 1, "饱和脂肪 is not 脂肪");
  assert.deepEqual([...cn.allergen.words].sort(), ["乳制品", "大豆"].sort());
  const jp = N.parseLabel(["栄養成分表示 1袋（50g）当たり", "エネルギー 260kcal", "たんぱく質 3.2g", "脂質 14.5g", "炭水化物 30.1g", "－糖質 28.0g", "－食物繊維 2.1g",
    "食塩相当量 0.6g", "アレルギー物質：乳成分・小麦"]);
  assert.equal(jp.format, "jp");
  assert.equal(jp.serving.grams, 50);
  assert.equal(get(jp, "energy_kcal", "serving").value_text, "260");
  assert.equal(get(jp, "salt", "serving").value_text, "0.6");
  assert.equal(get(jp, "fibre", "serving").value_text, "2.1");
  assert.ok(!get(jp, "sugar"), "糖質 (sugar + starch) is not reported as sugars");
  assert.match(jp.allergen.text, /アレルギー物質：乳成分・小麦/);
});

test("'please check': energy far from the macros, low OCR confidence, a missing unit, sat fat above total fat; never auto-corrected", () => {
  const bad = N.parseLabel(["ข้อมูลโภชนาการ", "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค", "พลังงานทั้งหมด 900 กิโลแคลอรี", "ไขมันทั้งหมด 2 ก.", "โปรตีน 3 ก.",
    "คาร์โบไฮเดรตทั้งหมด 20 ก.", "โซเดียม 180 มก."]);
  const e = get(bad, "energy_kcal");
  assert.equal(e.status, "check"); assert.equal(e.value_text, "900", "never corrected"); assert.ok(e.why.includes("energy-macros"), e.why);
  const low = N.parseLabel([{ text: "ข้อมูลโภชนาการ", conf: 0.99 }, { text: "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค", conf: 0.98 }, { text: "โซเดียม 180 มก.", conf: 0.41 }]);
  assert.equal(get(low, "sodium").status, "check"); assert.ok(get(low, "sodium").why.includes("ocr-confidence"));
  const nounit = N.parseLabel(["Nutrition Facts", "Amount per serving", "Total Fat 8", "Sodium 160mg"]);
  assert.equal(get(nounit, "fat").status, "check"); assert.ok(get(nounit, "fat").why.includes("unit"));
  const sat = N.parseLabel(["Nutrition Facts", "Amount per serving", "Total Fat 2g", "Saturated Fat 5g"]);
  assert.equal(get(sat, "satfat").status, "check");
  // nothing in the core list is ever shown as zero when it is not printed
  const empty = N.parseLabel(["hello", "world"]);
  assert.deepEqual(empty.items, []);
  assert.ok(empty.notFound.includes("energy_kcal") && empty.notFound.includes("sodium"), empty.notFound);
});

test("ingredient lists and other lines do not become nutrient values (anchored labels only)", () => {
  const p = N.parseLabel(["ส่วนประกอบ: แป้งสาลี 60% น้ำตาล 20% น้ำมันปาล์ม 15% เกลือ 1%", "Ingredients: sugar 30%, salt 2%", "ข้อมูลโภชนาการ",
    "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค", "น้ำตาลทั้งหมด 9 ก."]);
  assert.equal(p.items.filter(i => i.field === "sugar").length, 1);
  assert.equal(get(p, "sugar").value_text, "9");
  assert.ok(!get(p, "salt"));
});

test("recalculation from printed values (design §2.2 step 3): servings, whole / half pack, grams with and without the serving weight", () => {
  const p = N.parseLabel(TH_NEW); // per serving of 30 g, about 2 servings per pack
  const r1 = N.recalc(p, { kind: "servings", n: 2 });
  assert.ok(r1.ok);
  assert.equal(r1.rows.find(r => r.field === "energy_kcal").value, 300);
  assert.equal(r1.rows.find(r => r.field === "sodium").value, 360);
  const half = N.recalc(p, { kind: "half" });
  assert.equal(half.rows.find(r => r.field === "fat").value, 7, "half of a pack of 2 servings = 1 serving");
  const pack = N.recalc(p, { kind: "pack" });
  assert.equal(pack.rows.find(r => r.field === "sugar").value, 18);
  const g = N.recalc(p, { kind: "g", n: 45 });
  assert.equal(g.rows.find(r => r.field === "energy_kcal").value, 225, "150 kcal per 30 g -> 45 g");
  assert.equal(g.rows.find(r => r.field === "fat").value, 10.5);
  // rounding: whole kcal, 0.1 g, whole mg
  const odd = N.recalc(p, { kind: "g", n: 7 });
  assert.equal(odd.rows.find(r => r.field === "energy_kcal").value, 35);
  assert.equal(odd.rows.find(r => r.field === "satfat").value, 0.7);
  assert.equal(odd.rows.find(r => r.field === "sodium").value, 42);
  // per serving only, serving weight NOT printed: grams cannot be calculated, nothing is guessed
  const noW = N.parseLabel(["ข้อมูลโภชนาการ", "หนึ่งหน่วยบริโภค : 1 ซอง", "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค", "พลังงานทั้งหมด 150 กิโลแคลอรี", "โซเดียม 180 มก."]);
  const bad = N.recalc(noW, { kind: "g", n: 50 });
  assert.equal(bad.ok, false); assert.equal(bad.reason, "no-serving-weight");
  const badPack = N.recalc(noW, { kind: "pack" });
  assert.equal(badPack.ok, false); assert.equal(badPack.reason, "no-servings-per-pack");
  assert.equal(N.recalc(noW, { kind: "servings", n: 3 }).rows.find(r => r.field === "sodium").value, 540, "servings still work");
  // "less than 1 g" stays "less than" after scaling
  const lt = N.recalc(N.parseLabel(["Nutrition Facts", "Serving size 1 bar (40g)", "Amount per serving", "Dietary Fiber Less than 1g"]), { kind: "servings", n: 2 });
  const f = lt.rows.find(r => r.field === "fibre");
  assert.equal(f.cmp, "<"); assert.equal(f.value, 2);
  // per 100 g label: grams work directly; a whole pack needs the pack weight, which is not printed
  const eu = N.parseLabel(["Typical values Per 100 g", "Energy 1650 kJ / 394 kcal", "Fat 12 g", "Salt 0.85 g"]);
  assert.equal(N.recalc(eu, { kind: "g", n: 50 }).rows.find(r => r.field === "fat").value, 6);
  assert.equal(N.recalc(eu, { kind: "pack" }).ok, false);
  // the calculated rows never carry a converted field (kJ -> kcal) as if it were printed
  assert.ok(N.recalc(eu, { kind: "g", n: 50 }).rows.every(r => p.items.some(i => i.field === r.field) || eu.items.some(i => i.field === r.field)));
});

test("allergen statements: Thai No. 450 words, 'may contain', none found -> null (the page then says 'not found does not mean none')", () => {
  const a = N.parseLabel(["ข้อมูลสำหรับผู้แพ้อาหาร: มี กุ้ง ปลาหมึก อาจมี ถั่วลิสง"]).allergen;
  assert.ok(a && ["กุ้ง", "ปลาหมึก", "ถั่วลิสง"].every(w => a.words.includes(w)), JSON.stringify(a));
  const en = N.parseLabel(["Ingredients: wheat flour, sugar", "Allergy advice: contains wheat. May contain: peanuts."]).allergen;
  assert.ok(/contains wheat/i.test(en.text) && en.words.map(w => w.toLowerCase()).includes("peanuts"), JSON.stringify(en));
  assert.equal(N.parseLabel(["Nutrition Facts", "Calories 100"]).allergen, null);
  assert.ok(N.ALLERGENS.source && /450/.test(N.ALLERGENS.source), "allergen list carries its dated source note");
});

test("number normalisation: Thai digits, full-width digits, decimal comma vs thousands separator", () => {
  assert.equal(N.norm("๑๒.๕ ก."), "12.5 ก.");
  assert.equal(N.norm("１２０kcal"), "120kcal");
  assert.equal(N.norm("Fat 3,6 g"), "Fat 3.6 g");
  assert.equal(N.norm("Sodium 1,160mg"), "Sodium 1160mg");
});
