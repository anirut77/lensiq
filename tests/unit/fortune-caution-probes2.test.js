"use strict";
// tests/unit/fortune-caution-probes2.test.js — FIXED TEST SET fortune-caution, the reviewer's probe round 2 (36 forbidden, 12 allowed; round 1, 60 + 16,
// is gated in tests/unit/fortune-caution-limits.test.js) and the three general checks the reviewer suggested (coordinator order 2026-11-20). Locked
// BEFORE the code (relock7/). The probe arms race stops here (2-round cap): the primary control is the approved-wording register
// (tests/unit/fortune-caution-wording.test.js); the filter is defence in depth.
// Gates: every allowed probe passes; the three general checks: (1) จะ / 会 / 将 / will / going to followed by a negative outcome word, (2) a number
// word (Thai, English or Chinese) near a luck word or as an amount in guidance, (3) a date written in Thai number words — the round-2 probes of those
// kinds (R2_GATED) and our own (GEN) are refused. The rest of round 2 is MEASURED (printed, not a gate): the register keeps such text from shipping.
const test = require("node:test");
const assert = require("node:assert/strict");
const { join } = require("node:path");
const core = require(join(__dirname, "..", "..", "fortune-caution-core.js"));
const OV = { part: "overall" }, ctxOf = sp => (sp ? { part: "period", span: sp } : OV);
const R2_FORBID = [
  ["ระวังการใช้จ่ายช่วงสงกรานต์วันที่สิบสาม","mind"],
  ["Be careful with money next Friday.","mind"],
  ["下周三要留意开支。","mind"],
  ["ระวังการเงินในคืนวันศุกร์","mind"],
  ["ปีหน้าคุณจะตกงาน ควรระวัง","mind"],
  ["Be careful: you are going to lose your job.","mind"],
  ["留意，你明年必会失业。","mind"],
  ["ระวังถูกงูกัด","mind"],
  ["Be careful of a plane crash.","mind"],
  ["留意被狗咬伤。","mind"],
  ["ระวังมะเร็งปอด","mind"],
  ["ระวังไตวาย","mind"],
  ["Be careful of pneumonia this winter.","mind"],
  ["留意胃溃疡。","mind"],
  ["ระวังสุขภาพ ควรกินวิตามินซีวันละเม็ด","mind"],
  ["ระวังเจ้านายคนใหม่ที่เพิ่งย้ายมา","mind"],
  ["Be careful of the colleague who sits next to you.","mind"],
  ["小心你的前男友。","mind"],
  ["ระวังคนลาว","mind"],
  ["ระวังคนต่างจังหวัด","mind"],
  ["Be careful of Filipinos at work.","mind"],
  ["小心广东人。","mind"],
  ["ระวังการลงทุนในพันธบัตร","mind"],
  ["Be careful but put your savings into ETFs.","mind"],
  ["ระวังความรัก ควรแยกทางกับเขา","mind"],
  ["留意感情，不如分道扬镳。","mind"],
  ["ระวังดวงตก เว้นแต่ไปแก้กรรม","mind"],
  ["Be careful; your luck stays bad until you make an offering.","mind"],
  ["ทำบุญกับเจ้าอาวาสวัดใกล้บ้าน","do"],
  ["ถวายเงินหนึ่งหมื่นบาท","do"],
  ["Donate fifty dollars each week.","do"],
  ["捐五百元。","do"],
  ["อาจมีโชคจากการซื้อสลาก","luck"],
  ["อาจมีโชคจากเลขที่บ้าน","luck"],
  ["你可能会中奖。","luck"],
  ["You might get lucky at the races.","luck"],
];
const R2_ALLOW = [
  ["ช่วงเดือนพฤษภาคมถึงมิถุนายนควรระวังการใช้จ่าย","mind","month"],
  ["ระวังการเดินทางไกลในช่วงหน้าฝน","mind"],
  ["ระวังสุขภาพบริเวณข้อเข่า ถ้าไม่สบายควรพบแพทย์","mind"],
  ["Be careful with your back; see a doctor if it hurts.","mind"],
  ["留意腰部健康，不适请就医。","mind"],
  ["ระวังการถูกหลอกให้ลงทุน","mind"],
  ["ระวังคนแปลกหน้าที่ชวนให้โอนเงิน","mind"],
  ["Be careful of strangers who ask for money.","mind"],
  ["小心陌生人让您转账。","mind"],
  ["ระวังความเข้าใจผิดกับคนใกล้ตัว","mind"],
  ["ช่วยเหลือผู้สูงอายุในชุมชนตามกำลัง","do"],
  ["Keep the precepts of your own faith.","do"],
];
// round-2 probes of the three general checks, by index in R2_FORBID: Thai-word date, certainty x3, amounts in words x2, number near luck
const R2_GATED = [0, 4, 5, 6, 29, 30, 33];
const GEN = [
  ["ระวังการเดินทางวันที่ยี่สิบเอ็ด", "mind"], ["วันที่สามเดือนหน้าควรระวังคำพูด", "mind"], ["ระวังเรื่องเงินช่วงห้าธันวาคม", "mind"],
  ["ปีนี้คุณจะล้มป่วย ควรระวัง", "mind"], ["ระวัง คุณจะโดนไล่ออก", "mind"], ["Be careful, you will fail the exam.", "mind"], ["Be careful: things are going to go wrong.", "mind"],
  ["留意，你会失去工作。", "mind"], ["留意，明年将会破产。", "mind"], ["อาจมีโชคจากเลขสามตัว", "luck"], ["You may get lucky with number seven.", "luck"],
  ["可能会有八号的好运。", "luck"], ["ถวายเงินห้าพันบาท", "do"], ["Give two hundred baht.", "do"], ["捐八百块。", "do"],
];
test("probes: every allowed probe of round 2 passes (12)", () => {
  assert.equal(R2_ALLOW.length, 12);
  const refused = R2_ALLOW.map(([t, k, sp]) => [t, core.check(t, k, ctxOf(sp))]).filter(x => x[1]);
  assert.deepEqual(refused, []);
});
test("probes: round-2 probes of the general checks (Thai-word dates, certainty with a negative outcome, amounts and numbers in words) and ours are refused", () => {
  assert.equal(R2_FORBID.length, 36);
  const leak = R2_GATED.map(i => R2_FORBID[i]).concat(GEN).filter(([t, k]) => !core.check(t, k, OV)).map(x => x[1] + ": " + x[0]);
  assert.deepEqual(leak, []);
});
test("probes: round 2 measured (not a gate; the wording register is the control)", () => {
  const n = R2_FORBID.filter(([t, k]) => core.check(t, k, OV)).length;
  console.log("round 2 forbidden refused: " + n + "/" + R2_FORBID.length);
  assert.ok(n >= R2_GATED.length);
});
