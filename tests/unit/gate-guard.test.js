// tests/unit/gate-guard.test.js — LQPlate.plateGuard (round 16, item 7): a box the system chose is auto-read only when its
// read looks like a Thai plate (aspect, text-line layout, Thai plate pattern). Pure rules on readPlate-shaped results; the
// real OCR on drawn plates and signs is covered by tests/e2e/gate-guard.e2e.mjs, real photos by tools/plate-field-eval.mjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../../lensiq-plate.js");

const car = (key, lines, geom = {}, line = 0) => ({ key, line, lines: lines.map(text => ({ text })), geom: { ar: 2.2, bands: lines.length, unread: 0, wPx: 200, ...geom } });

test("plateGuard: real plate reads pass (car with province line, leading 1, OCR mark noise, motorcycle 3 lines)", () => {
  for (const r of [
    car("1กข2345", ["1กข 2345", "กรุงเทพมหานคร"]),
    car("กข2345", ["กข 2345"], { bands: 1 }),
    car("1กข2345", ["ไกข 2345", "กรุงเทพมหานคร"]),        // thin "1" read as ไ (handled by plateChars)
    car("ศก234", ["ศึก 234", "bนนทบรm"]),                   // one stray vowel mark from the OCR on a real photo
    car("อห2502", ["อห 2502", "กรงเทพมทานคร๐"], { ar: 2.82 }),
    car("พล4813", ["b", "พล 4813", "สุโขทัย"], { bands: 3 }, 1) // a bolt band is not a text line
  ]) {
    const g = P.plateGuard(r);
    assert.equal(g.ok, true, JSON.stringify({ r: r.lines, g }));
    assert.equal(g.text, "car");
  }
  const m = P.plateGuard({ key: "1กข123", line: 0, lines: [{ text: "1กข" }, { text: "ชลบุรี" }, { text: "123" }], geom: { ar: 1.45, bands: 3, unread: 0, wPx: 150 } }, { moto: true });
  assert.equal(m.ok, true, JSON.stringify(m)); assert.equal(m.text, "moto");
  // a 3-letter key on a 3-line plate is a motorcycle plate even when the lane is set to cars
  assert.equal(P.plateGuard({ key: "กขค123", line: 0, lines: [{ text: "กขค" }, { text: "ชลบุรี" }, { text: "123" }], geom: { ar: 1.45, bands: 3, wPx: 150 } }).ok, true);
});

test("plateGuard: signs, number boards and shop fronts are refused (pattern, extra text, vowels, Latin, word, split key)", () => {
  const cases = [
    [car("บร64", ["ชลบุรี 64", "CHON BURI"], { ar: 2.7 }), ["extra-text", "vowels", "word"]], // town-name sign (Wikimedia w37)
    [car("รอ7", ["Aรอ7", ""]), ["latin"]],                                                   // post-office sign (w39)
    [car("อง1234", ["ห้อง 1234"], { bands: 1 }), ["word"]],                                  // room-number board
    [car("ยด9", ["หยุด", "9"], { ar: 1.53 }, -1), ["split"]],                                // STOP sign: key pieced from two bands (w27)
  ];
  for (const [r, why] of cases) {
    const g = P.plateGuard(r);
    assert.equal(g.ok, false, JSON.stringify(r.lines));
    for (const w of why) assert.ok(g.reasons.includes(w), `${JSON.stringify(r.lines)}: ${w} in ${g.reasons}`);
  }
});

test("plateGuard: aspect ratio and text-line layout", () => {
  assert.deepEqual(P.plateGuard(car("กข2345", ["กข 2345"], { ar: 0.7, bands: 1 })).reasons, ["aspect"]);
  assert.deepEqual(P.plateGuard(car("กข2345", ["กข 2345"], { ar: 5.2, bands: 1 })).reasons, ["aspect"]);
  // 3 text lines on a car-shaped box = not a car plate; the same on a motorcycle lane is fine
  const three = car("กข2345", ["กข 2345", "กรุงเทพมหานคร", "สวัสดีครับ"], { bands: 3 });
  assert.ok(P.plateGuard(three).reasons.includes("layout"));
  assert.ok(!P.plateGuard(three, { moto: true }).reasons.includes("layout"));
  // a sign with 5+ text lines: two tall bands that were not read count as lines
  assert.ok(P.plateGuard(car("กข2345", ["กข 2345", "กรุงเทพ"], { bands: 4, unread: 2 })).reasons.includes("layout"));
  // ONE tall unread band (dealer strip / frame text under the plate) is tolerated
  assert.equal(P.plateGuard(car("กข2345", ["", "กข 2345", "กรุงเทพ"], { bands: 4, unread: 1 }, 1)).ok, true);
  assert.ok(P.plateGuard(car("กข2345", ["กข 2345"], { bands: 1, wPx: 20 })).reasons.includes("small"));
  // no band found at all (splitLines fallback) -> layout
  assert.ok(P.plateGuard(car("กข2345", ["กข 2345"], { bands: 0 })).reasons.includes("layout"));
});

test("plateGuard: no key -> never ok; plausible partial vs none; missing read", () => {
  const part = P.plateGuard({ key: "", line: -1, lines: [{ text: "กข 12" }], geom: { ar: 2.2, bands: 1, wPx: 200 } });
  assert.equal(part.ok, false); assert.equal(part.text, "partial"); assert.ok(part.reasons.includes("no-key"));
  assert.equal(P.plateGuard({ key: "", line: -1, lines: [{ text: "2345" }], geom: { ar: 2.2, bands: 1 } }).text, "partial");
  assert.equal(P.plateGuard({ key: "", line: -1, lines: [{ text: "ร้านกาแฟ" }], geom: { ar: 2.2, bands: 1 } }).text, "none");
  assert.deepEqual(P.plateGuard(null).reasons, ["no-read"]);
  // a read without geometry (e.g. an older caller) is judged on the text alone
  assert.equal(P.plateGuard({ key: "กข2345", line: 0, lines: [{ text: "กข 2345" }] }).ok, true);
});

test("plateGuard: thresholds are frozen and overridable per call (cfg)", () => {
  assert.ok(Object.isFrozen(P.GUARD));
  assert.deepEqual({ arMin: P.GUARD.arMin, arMax: P.GUARD.arMax, maxBands: P.GUARD.maxBands, maxBandsMoto: P.GUARD.maxBandsMoto, tries: P.GUARD.tries },
    { arMin: 1.0, arMax: 3.8, maxBands: 2, maxBandsMoto: 3, tries: 3 });
  const r = car("กข2345", ["xกข 2345"], { bands: 1 });
  assert.equal(P.plateGuard(r).ok, false);
  assert.equal(P.plateGuard(r, { cfg: { maxLatin: 1 } }).ok, true);
});

test("splitLines: the fallback split is marked so it never counts as text lines", () => {
  const W = 40, H = 20, b = P.splitLines(new Uint8Array(W * H).fill(200), W, H);
  assert.equal(b.length, 2);
  assert.ok(b.every(x => x.fallback === true));
});

test("detEval: guard columns — correct reads kept / lost, wrong reads, plate-less scenes read before / after the guard", () => {
  const t = { x: 0.4, y: 0.5, w: 0.2, h: 0.1 }, box = { ...t, score: 0.9 };
  const rows = [
    { cat: "white", truth: t, boxes: [box], key: "กข1", read: "กข1", guard: { ok: true } },
    { cat: "white", truth: t, boxes: [box], key: "กข2", read: "กข2", guard: { ok: false } },
    { cat: "white", truth: t, boxes: [box], key: "กข3", read: "กข8", guard: { ok: false } },
    { cat: "white", truth: t, boxes: [box], key: "กข4", read: "กข9", guard: { ok: true } },
    { cat: "white", truth: t, boxes: [box], key: "กข5", read: "กข5" },                       // no guard verdict = passes
    { cat: "none", truth: null, boxes: [box], read: "บร64", guard: { ok: false } },
    { cat: "none", truth: null, boxes: [box], read: "", guard: null },
    { cat: "none", truth: null, boxes: [] }
  ];
  const s = P.detEval(rows);
  assert.equal(s.white.read.x, 3); assert.equal(s.white.readG.x, 2); assert.equal(s.white.read.n, 5);
  assert.equal(s.white.wrong, 2); assert.equal(s.white.wrongG, 1);
  assert.equal(s.none.neg, 3); assert.equal(s.none.fp.x, 2);
  assert.equal(s.none.fpRead.x, 1); assert.equal(s.none.fpRead.n, 2); assert.equal(s.none.fpReadG.x, 0);
});
