"use strict";
// checkout.js: createCodeGates — gate ต่อบาร์โค้ด, ลบ gate ที่ไม่เห็นนาน clearMs, โหมดรหัสเดียวเหมือนเดิม
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../checkout.js");

const raw = list => list.map(rawValue => ({ rawValue, format: "ean_13" })); // รูปแบบผลจาก BarcodeDetector.detect

test("3 distinct codes held in view for 5 ticks give 3 adds", () => {
  const G = C.createCodeGates({ clearMs: 1200 });
  const adds = [];
  for (let i = 0; i < 5; i++) adds.push(...G.step(raw(["111", "222", "333"]), i * 250));
  assert.deepEqual(adds, ["111", "222", "333"]);
  assert.equal(G.size, 3);
});

test("same code continuously gives 1 add; 2 adds after a gap longer than clearMs", () => {
  const G = C.createCodeGates({ clearMs: 1200 });
  let n = 0, now = 0;
  for (let i = 0; i < 20; i++, now += 250) n += G.step(["885"], now).length;
  assert.equal(n, 1);
  for (let i = 0; i < 4; i++, now += 250) n += G.step([], now).length; // ว่าง 1 วิ < clearMs
  for (let i = 0; i < 4; i++, now += 250) n += G.step(["885"], now).length;
  assert.equal(n, 1, "short gap must not re-add");
  for (let i = 0; i < 6; i++, now += 250) n += G.step([], now).length; // ว่าง 1.5 วิ > clearMs
  assert.equal(G.size, 0, "gate pruned after clearMs");
  for (let i = 0; i < 4; i++, now += 250) n += G.step(["885"], now).length;
  assert.equal(n, 2);
});

test("codes entering and leaving independently are each counted once per presence", () => {
  const G = C.createCodeGates({ clearMs: 1000 });
  const adds = [];
  let now = 0;
  const run = (codes, ticks) => { for (let i = 0; i < ticks; i++, now += 250) adds.push(...G.step(codes, now)); };
  run(["A"], 3); run(["A", "B"], 3); run(["B"], 6); run(["A", "B"], 3);
  assert.deepEqual(adds, ["A", "B", "A"]);
  run(["A", "A", "B"], 2); // ซ้ำในเฟรมเดียวกันไม่นับเพิ่ม
  assert.deepEqual(adds, ["A", "B", "A"]);
});

test("pay mode with the setting OFF is identical to the legacy single codeGate", () => {
  const products = [{ id: "p1", barcode: "8850001" }, { id: "p2", barcode: "8850002" }];
  const pickLegacy = codes => codes.map(c => c.rawValue).find(v => C.findByBarcode(products, v)) || (codes[0]?.rawValue ?? null);
  const pick = list => list.find(v => C.findByBarcode(products, v)) ?? null;
  const script = [
    [], ["999", "8850002"], ["999", "8850002"], ["8850001", "8850002"], ["8850001"], [], [], [], [], [], [], ["8850001", "8850002"],
    ["999"], ["999"], [], [], [], [], [], ["8850002", "8850001"], ["8850002"], [], ["777"]
  ];
  const legacyGate = C.gateInit(false), legacy = [], now0 = 1000;
  script.forEach((codes, i) => {
    const code = pickLegacy(raw(codes));
    const add = C.gateStep(legacyGate, code ? "bc:" + code : C.BG, now0 + i * 250, { stableMs: 0, minFrames: 1, clearMs: 1200, unknownClearMs: 1200 });
    legacy.push(add ? add.slice(3) : null);
  });
  const G = C.createCodeGates({ clearMs: 1200, multi: false }), got = [];
  script.forEach((codes, i) => { const a = G.step(raw(codes), now0 + i * 250, pick); assert.ok(a.length <= 1); got.push(a[0] ?? null); });
  assert.deepEqual(got, legacy);
  assert.ok(legacy.filter(Boolean).length >= 2);
  // multi mode would have added both codes from the same frame
  const M = C.createCodeGates({ clearMs: 1200 });
  assert.deepEqual(M.step(raw(["8850001", "8850002"]), 0), ["8850001", "8850002"]);
});

test("reset clears all gates", () => {
  const G = C.createCodeGates();
  assert.deepEqual(G.step(["X"], 0), ["X"]);
  assert.deepEqual(G.step(["X"], 250), []);
  G.reset();
  assert.deepEqual(G.step(["X"], 500), ["X"]);
});
