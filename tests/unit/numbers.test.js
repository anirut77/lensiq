"use strict";
// node --test tests/unit — numbers.js (เลขมงคล): no lottery-style lucky numbers, and buildFacts({forAI:true})
// carries only abstract categories/meanings — never the user's digits, digit runs, positions or plate/name letters.
const test = require("node:test");
const assert = require("node:assert/strict");
const NM = require("../../numbers.js");
const FA = require("../../fortune-ai.js");

const strings = o => { const out = []; (function walk(v) { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); })(o); return out; };
function assertNoDigitLeak(facts, digits, what) {
  const txt = strings(facts).join("\n");
  // เลขสั้น (1–2 หลัก) อาจบังเอิญตรงกับเคล็ดลับทั่วไปใน KB (extras.tips) จึงตรวจเฉพาะส่วนที่มาจากผลของผู้ใช้
  const own = digits.length < 3 ? strings({ h: facts.headline, i: facts.items }).join("\n") : txt;
  assert.ok(!new RegExp("(^|\\D)" + digits + "(\\D|$)").test(own), what + ": full number leaked");
  for (let i = 0; i + 3 <= digits.length; i++) assert.ok(!txt.includes(digits.slice(i, i + 3)), what + ": digit run " + digits.slice(i, i + 3) + " leaked");
  assert.ok(!/ตำแหน่ง/.test(txt), what + ": position info leaked");
  assert.ok(!/เลขนำโชค/.test(txt), what + ": lucky numbers");
  assert.ok(!(facts.extras && facts.extras.luckyNumbers), what + ": extras.luckyNumbers present");
  // คู่เลขของผู้ใช้ไม่ปรากฏเป็น "คู่ NN" (ยกเว้นเคล็ดลับทั่วไปแบบ "24/42" จาก KB ที่ไม่ใช่ของผู้ใช้)
  facts.items.forEach(i => assert.ok(!/\d\d/.test(i.label + " " + (i.evidence || "")), what + ": digits in item " + i.label));
  facts.items.forEach(i => { assert.ok(!/^pair\.\d{2}$/.test(i.id), what + ": pair id " + i.id); assert.ok(!/^sum\.\d+$/.test(i.id), what + ": sum id " + i.id); });
}

const CASES = [
  ["phone", () => NM.analyzePhone("0823456789", "last7"), "0823456789"],
  ["phone all", () => NM.analyzePhone("0912121999", "all"), "0912121999"],
  ["phone mirror", () => NM.analyzePhone("0861234321", "last7"), "0861234321"],
  ["house", () => NM.analyzeHouse("1205"), "1205"],
  ["house 1 digit", () => NM.analyzeHouse("7"), "7"],
  ["account", () => NM.analyzeAccount("4589"), "4589"],
  ["plate", () => NM.analyzePlate("1กข 2345", "tue"), "2345"],
];

test("numbers: forAI facts contain no user digits, runs, positions or lucky numbers", () => {
  for (const [what, fn, digits] of CASES) {
    const r = fn();
    assert.ok(!r.error, what + " " + r.error);
    for (const topic of ["overall", "money", "love", "work"]) {
      const f = NM.buildFacts(r, topic, { forAI: true });
      assert.ok(f.items.length > 0, what);
      assertNoDigitLeak(f, digits, what + "/" + topic);
      // ส่งเฉพาะคู่เด่น 3 + คู่ควรใส่ใจ 1 — ประกอบกลับเป็นเลขเต็มไม่ได้
      assert.ok(f.items.filter(i => i.group === "คู่เลข").length <= 4, what + ": too many pairs for AI");
    }
  }
  // บ้านเลขหลักเดียว: ผลรวม = เลขเต็ม ต้องไม่ส่งค่าผลรวมเลย
  const h = NM.buildFacts(NM.analyzeHouse("7"), "overall", { forAI: true });
  assert.ok(!/(^|\D)7(\D|$)/.test(strings({ h: h.headline, i: h.items }).join(" ")), "single-digit house value must not appear");
});

test("numbers: forAI hides plate/name letters (kala) but keeps abstract advice", () => {
  const r = NM.analyzeName("กมลชนก", "tue");
  assert.ok(r.kala.length > 0);
  const f = NM.buildFacts(r, "overall", { forAI: true });
  const txt = strings(f).join("\n");
  r.kala.forEach(ch => assert.ok(!txt.includes("อักษร " + ch), "kala letter " + ch));
  assert.ok(f.items.some(i => i.id === "kala"));
  const p = NM.buildFacts(NM.analyzePlate("1กข 2345", "tue"), "overall", { forAI: true });
  assert.ok(!strings(p).join("\n").includes("กข"), "plate letters leaked");
});

test("numbers: local facts keep detail, no lucky numbers anywhere", () => {
  const r = NM.analyzePhone("0823456789", "last7");
  const f = NM.buildFacts(r, "overall");
  assert.ok(strings(f).join("\n").includes("ตำแหน่ง"), "local display keeps positions");
  assert.ok(!("luckyNumbers" in f.extras));
  assert.ok(!("luckyToday" in NM), "lucky-number generator removed");
  const words = NM.strengthWords(r);
  words.forEach(w => assert.ok(!/\d/.test(w), "strength word has digits: " + w));
});

test("numbers: daily energy is non-numeric and deterministic per date + birth weekday", () => {
  const d = new Date(2026, 10, 6);
  const a = NM.dailyEnergy("tue", d), b = NM.dailyEnergy("tue", d);
  assert.deepEqual(a, b);
  for (const k of ["color", "birthColor", "direction"]) { assert.equal(typeof a[k], "string"); assert.ok(a[k] && !/\d/.test(a[k]), k); }
  assert.ok(a.word && a.word.w && a.word.p && !/\d/.test(a.word.w + a.word.p));
  a.notes.forEach(n => assert.ok(!/\d/.test(n), "note has digits: " + n));
  assert.ok(!("numbers" in a) && !("pair" in a), "no numbers/pair in daily item");
  assert.equal(a.color, NM.KB.weekdays.find(w => w.id === "fri").color, "6 Nov 2026 is a Friday");
  const seen = new Set();
  for (let i = 0; i < 30; i++) { const e = NM.dailyEnergy("sun", new Date(2026, 0, 1 + i)); seen.add(e.direction + "|" + e.word.w); }
  assert.ok(seen.size > 5, "varies across days");
});

test("numbers: forAI facts pass the fortune-ai composer and safety filter", () => {
  const f = NM.buildFacts(NM.analyzePhone("0823456789", "last7"), "money", { forAI: true });
  const res = FA.compose(f);
  assert.ok(res.sections.length > 0);
  const txt = res.sections.map(s => s.paragraphs.join(" ")).join(" ");
  assert.ok(!txt.includes("234") && !txt.includes("0823456789"));
});
