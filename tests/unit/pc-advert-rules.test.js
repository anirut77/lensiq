// Advert rule work 2026-11-11 (tools/pc-rules-build.mjs RULE_WORK): one synthetic positive per new pattern family and
// counter-cases that must NOT fire (disclaimers, mandatory warnings, directions, approved nutrient-function statements,
// sales deadlines). Every sentence here was written for this test; none is copied from a labelled set. Behaviour only:
// accuracy figures come from tools/pc-advert-eval.mjs (dev) and the independent run on the locked set.
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../lensiq-claims.js");
const R = require("../../lensiq-claims-rules.js");

const ids = (/** @type {string} */ t, /** @type {string} */ category) => [...new Set(C.detect(t, { category, kind: "ad" }).map(f => f.rule_id))];
const fires = (/** @type {string} */ t, /** @type {string} */ category, /** @type {string} */ id) =>
  assert.ok(ids(t, category).includes(id), `${id} should fire on [${category}] ${t}; got ${ids(t, category).join(",") || "nothing"}`);
const silent = (/** @type {string} */ t, /** @type {string} */ category) =>
  assert.deepEqual(ids(t, category), [], `nothing should fire on [${category}] ${t}`);

test("the rule-work changes are listed in the generated rules file", () => {
  const listed = R.changes.filter((/** @type {any} */ c) => /rule work 2026-11-11/.test(c.why)).map((/** @type {any} */ c) => c.rule);
  for (const id of ["F09", "D08", "H05", "F07", "F08", "F10", "F19", "F06", "F12", "F13", "F02", "F20", "F05", "F14", "D07", "H04", "C04", "D02", "H02", "C01", "C03"]) {
    assert.ok(listed.includes(id), id);
  }
});

test("F09 treat / relieve: 'reduce' verbs and symptom nouns (TH / EN / ZH)", () => {
  fires("แคปซูลนี้ช่วยลดอาการชาปลายมือปลายเท้า", "supplement", "F09");
  fires("ดื่มทุกเช้า สยบอาการเวียนหัว บ้านหมุน", "supplement", "F09");
  fires("ช่วยลดปัญหาปัสสาวะบ่อยตอนกลางคืน", "supplement", "F09");
  fires("These gummies ease joint pain after a long run", "supplement", "F09");
  fires("Helps with anxiety and improves PCOS symptoms", "supplement", "F09");
  fires("每天一杯，改善便秘", "food", "F09");
});

test("F07 markers: verb and marker apart, uric acid, Chinese control of blood pressure", () => {
  fires("ชาสูตรนี้ช่วยลดเบาหวาน ความดัน ไขมันในเลือด", "food", "F07");
  fires("ช่วยควบคุมกรดยูริกในร่างกาย", "supplement", "F07");
  fires("Formulated for reducing elevated LDL cholesterol", "supplement", "F07");
  fires("有效控制血糖", "food", "F07");
});

test("F08 prevention / infection: germ nouns, risk reduction, Chinese 抗 / 抑制", () => {
  fires("ช่วยยับยั้งเชื้อไวรัสในลำคอ", "supplement", "F08");
  fires("ลดเสี่ยงไตวายในผู้สูงอายุ ลดการติดเชื้อ", "supplement", "F08");
  fires("Gives your body what it needs to fight off infections", "supplement", "F08");
  fires("Offers protection against seasonal flu", "supplement", "F08");
  fires("抑制癌细胞生长", "supplement", "F08");
});

test("F10 structure / function: organ care verbs, hormones, muscle, energy, organ health, Chinese 机能", () => {
  fires("ช่วยบำรุงดวงตาให้สดใส", "supplement", "F10");
  fires("ฟื้นฟูเส้นประสาทที่เสื่อมสภาพ", "supplement", "F10");
  fires("Naturally restores testosterone levels", "supplement", "F10");
  fires("Boost your endurance on race day", "supplement", "F10");
  fires("For prostate health in men over 50", "supplement", "F10");
  fires("调节身体机能", "food", "F10");
});

test("F19 research: Thai study wording, 'studies reveal', hyphenated 'clinically-tested', Chinese experiments", () => {
  fires("จากการศึกษาพบว่าช่วยให้นอนหลับดีขึ้น", "supplement", "F19");
  fires("Recent studies reveal the benefits of this blend", "supplement", "F19");
  fires("Made with clinically-tested ingredients", "supplement", "F19");
  fires("经人体试食实验证明", "supplement", "F19");
});

test("F06 / H02 speed: minutes, 'after one week of taking', 'see results in N'", () => {
  fires("ทาแล้วหายปวดภายใน 10 นาที", "supplement", "F06");
  fires("After two weeks of taking it my energy came back", "supplement", "F06");
  fires("น้ำมันนวดสมุนไพร แก้ปวดเมื่อยได้ใน 5 นาที", "herbal", "H02");
  fires("You will see results in 3 days", "herbal", "H02");
});

test("H02 / C03 / F02 superlatives and 'no surgery needed'", () => {
  fires("สุดยอดสมุนไพรจากป่าลึก", "herbal", "H02");
  fires("The best herbal formula on the market", "herbal", "H02");
  fires("ขจัดทุกปัญหาผิว ไม่ต้องเลเซอร์", "herbal", "H02");
  fires("ครีมหนึ่งเดียวที่ทุกคนไว้วางใจ", "cosmetic", "C03");
  fires("The strongest protein blend you can buy", "supplement", "F02");
  fires("世界级品质", "food", "F02");
});

test("H05 serious disease (herbal): risk reduction, organ disease with words between, masses", () => {
  fires("This tea may reduce stroke risk", "herbal", "H05");
  fires("ช่วยรักษาโรคหลอดเลือดในหัวใจ", "herbal", "H05");
  fires("Helps dissolve tumors and masses", "herbal", "H05");
});

test("D02 / D08 drug: elixir, 'N times', 'suffering from'", () => {
  fires("ยาอายุวัฒนะ ชะลอวัย", "drug", "D02");
  fires("ยุบไว 2 เท่า ไม่ต้องผ่าตัด", "drug", "D02");
  fires("Good news for anyone suffering from heart disease", "drug", "D08");
});

test("endorsements (F14 / D07 / H04 / C04): 'แนะนำโดยแพทย์', doctor ... แนะนำ, 'dermatologists recommend', 'doctor-formulated'", () => {
  fires("สูตรนี้แนะนำโดยแพทย์ผู้เชี่ยวชาญ", "supplement", "F14");
  fires("แนะนำโดยแพทย์ ใช้ได้ทุกวัน", "drug", "D07");
  fires("A doctor-formulated herbal blend", "herbal", "H04");
  fires("Dermatologists recommend this cream", "cosmetic", "C04");
});

test("F12 / F13 / F20 / F05 / F03 / F11 / C01 families", () => {
  fires("Supports skin elasticity and firmness", "supplement", "F12");
  fires("ช่วยให้ผมดกดำ", "supplement", "F12");
  fires("永葆青春", "supplement", "F12");
  fires("ช่วยรีดไขมันส่วนเกิน", "supplement", "F13");
  fires("一个月瘦了8斤", "food", "F13");
  fires("ทานตัวนี้แล้วไม่ต้องทานยาอีก", "supplement", "F20");
  fires("A natural alternative to statins", "supplement", "F20");
  fires("รับรองโดย อย. ปลอดภัย", "supplement", "F05");
  fires("Completely safe for everyone", "supplement", "F05");
  fires("จบทุกปัญหาเรื่องข้อ", "supplement", "F03");
  fires("Helps with low sex drive", "supplement", "F11");
  fires("ช่วยลดปัญหาสิวอุดตัน", "cosmetic", "C01");
  fires("A numbing anesthetic cream", "cosmetic", "C01");
});

test("counter-cases: disclaimers and mandatory warnings never fire", () => {
  silent("ไม่มีผลในการป้องกันหรือรักษาโรค", "supplement");
  silent("ผลิตภัณฑ์นี้ไม่ใช้สำหรับรักษา บำบัด บรรเทา หรือป้องกันโรค", "food");
  silent("These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.", "supplement");
  silent("This product is not intended to diagnose, treat, cure or prevent any disease.", "herbal");
  silent("保健食品不是药物，不能代替药物治疗疾病", "supplement");
  silent("*อาหารทางการแพทย์ ต้องใช้ภายใต้คำแนะนำของแพทย์", "food");
  silent("ควรกินอาหารหลากหลาย ครบ 5 หมู่ ในสัดส่วนที่เหมาะสมเป็นประจำ", "supplement");
});

test("counter-cases: directions and warnings that name a condition, a doctor or a medicine", () => {
  silent("หากมีอาการผิดปกติ เช่น ปวดท้อง คลื่นไส้ ให้หยุดรับประทานและปรึกษาแพทย์", "supplement");
  silent("ผู้ป่วยเบาหวานควรลดปริมาณการรับประทาน", "herbal");
  silent("ผู้ที่มีความดันโลหิตสูงควรปรึกษาแพทย์ก่อนรับประทาน", "supplement");
  silent("ผลิตภัณฑ์นี้ไม่ใช่ยา ไม่ควรใช้แทนยาที่แพทย์สั่ง", "supplement");
  silent("Stop use and ask a doctor if pain persists or gets worse.", "supplement");
  silent("If you have high blood pressure or diabetes, consult your doctor before use.", "supplement");
  silent("Not a substitute for medication prescribed by your doctor.", "supplement");
  silent("People with kidney disease should not use this product.", "supplement");
  silent("ทดสอบการระคายเคืองโดยแพทย์ผิวหนัง หากมีอาการระคายเคืองควรหยุดใช้และปรึกษาแพทย์", "cosmetic");
  silent("糖尿病患者请遵医嘱食用", "food");
  silent("不适宜人群：孕妇、青春期儿童", "supplement");
});

test("counter-cases: preparation times, sales deadlines, product facts", () => {
  silent("ชงกับน้ำร้อน 150 มล. ทิ้งไว้ 3-5 นาที แล้วดื่ม", "food");
  silent("ชงชาสมุนไพรในน้ำร้อน ทิ้งไว้ 5 นาที ดื่มวันละ 2 ครั้ง", "herbal");
  silent("โปรโมชั่น ลดราคา 50% ภายใน 3 วันเท่านั้น ส่งฟรีทั่วประเทศ", "supplement");
  silent("ซื้อวันนี้ ลด 20% ภายใน 7 วัน", "cosmetic");
  silent("Free shipping. Orders delivered within 3 days.", "food");
  silent("สูตรลดน้ำตาล 30% จากสูตรปกติ หวานน้อย", "food");
  silent("ควบคุมคุณภาพการผลิตตามมาตรฐาน GMP", "food");
  silent("Steep for 5 minutes in hot water. Best taken in the evening.", "herbal");
  silent("每日最高摄入量不超过两袋", "food");
});

test("counter-cases: approved nutrient-function statements stay suppressed (MoPH No. 447 allowlist)", () => {
  silent("โปรตีนมีส่วนช่วยเสริมสร้างและคงสภาพของมวลกล้ามเนื้อ", "supplement");
  silent("ไบโอตินมีส่วนช่วยคงสภาพปกติของเส้นผม", "supplement");
  silent("Vitamin C contributes to the reduction of tiredness and fatigue.", "supplement");
  // the same nutrient with non-approved wording is still a signal
  fires("โปรตีนช่วยเพิ่มมวลกล้ามเนื้อ", "supplement", "F10");
});
