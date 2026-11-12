"use strict";
// tests/unit/pc-guard-onetap-notes.test.js — tester one-tap stops on a NOTE TO A PERSON (2026-11-12, coordinator order after
// the wider stress run: a Thai medicine-reminder note "…ไว้ให้ยาย <name>" next to a product label went out with one tap).
// LQPCGuard.autoBlock only stops the one-tap (the usual preview opens); it removes nothing from any text. DEV cases
// (synthetic, written for this rule), with label wording that must NOT stop one-tap.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../lensiq-pc-guard.js");
const L = require("../../lensiq-pc-live.js");

const LABEL = "ยาแก้ปวด TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nส่วนประกอบ: พาราเซตามอล 500 มก.\nEXP 01/2028";
const oneTap = t => L.autoDecision({ tester: true, autoOn: true, hidden: false, ...L.autoTextCheck(G, t, { gtins: [], regs: [] }), face: { ran: true, faces: 0 }, key: "k",
  sent: [], count: 0, cap: 1 });

test("a note to a person stops one-tap (Thai kinship / title words after ให้ / ของ / ถึง / สำหรับ, ไว้ให้; English; Chinese)", () => {
  for (const n of ["จัดไว้ให้ยาย สมมติ ทดสอบ", "ของแม่ ทานหลังอาหาร", "ให้ตา สมชาย", "สำหรับคุณยาย", "ถึงพี่ใหญ่", "ให้ ด.ช. ตัวอย่าง", "ให้คุณ สมมติ",
    "for grandma Jane", "To Mr Placeholder", "for my mum", "给奶奶 每天一次", "给王先生", "給媽媽"]) {
    assert.equal(G.autoBlock(n), true, "blocks: " + n);
    const d = oneTap(LABEL + "\n" + n);
    assert.equal(d.send, false, "one-tap falls back to the preview (or the gate refuses): " + n);
  }
});

test("label wording does not stop one-tap; nothing is removed by this rule", () => {
  for (const t of ["ให้อาการดีขึ้น", "ใช้ให้ตามแพทย์สั่ง", "สำหรับเด็กอายุ 6 ปีขึ้นไป", "ให้คุณค่าทางโภชนาการ", "ให้คุณภาพการนอนดีขึ้น", "ให้ลูกค้าใช้ภายนอก",
    "For children over 12 years", "for external use only", "给药前请摇匀", "老人儿童慎用"]) {
    assert.equal(G.autoBlock(t), false, "label wording kept: " + t);
  }
  assert.deepEqual(oneTap(LABEL), { send: true, reason: "ok" }, "a plain product label still qualifies");
  const note = LABEL + "\nจัดไว้ให้ยาย สมมติ ทดสอบ";
  assert.ok(G.aiGate(note).allow, "the gate itself is unchanged (the manual preview path stays available)");
});
