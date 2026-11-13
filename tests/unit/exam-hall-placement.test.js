// tests/unit/exam-hall-placement.test.js — LQExam.hallPlacement (exam-hall.html "camera placement check"): from the live
// frame's person boxes and the drawn seats it says how many seats show a person, how tall each seated person is in the
// 1,280 x 720 frame the hall detector was measured on, whether that is under the ACTIVE detector's measured minimum
// (docs/exam/HALL-DETECTOR-RESULTS.md, public dataset), whether a seat is hidden behind the row in front (camera too low)
// or cut by the frame edge, and a verdict: noseats / nocount / fix / partial / good. Locked before the product code
// (stream H, 2026-11-13; hashes in ~/LENSIQ-field/evals/gate-hall-h/locked.sha256).
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../../lensiq-exam.js");

const HP = E.HALL_PLACE;
// 2 rows x 3 seats, row 1 (back, top of the image) y 0.30-0.55, row 2 (front) y 0.55-0.95
const seats = E.gridSeats({ x: 0.1, y: 0.3, w: 0.8, h: 0.65 }, 2, 3, ["B1", "B2", "B3", "A1", "A2", "A3"]);
const colX = j => 0.1 + (0.8 / 3) * j;
/** a seated person centred in a seat column, box height h (normalised), top at y */
const person = (j, y, h, w = 0.12) => ({ x: colX(j) + (0.8 / 3 - w) / 2, y, w, h, score: 0.9 });
const backRow = h => [0, 1, 2].map(j => person(j, 0.5 - h + 0.04, h));   // centre inside the back row
const frontRow = h => [0, 1, 2].map(j => person(j, 0.9 - h + 0.04, h)); // centre inside the front row
const base = { seats, frameW: 1280, frameH: 720, det: "coco", tiles: false };

test("HALL_PLACE: frozen, measured bands and per-detector recall with n, source = public dataset", () => {
  assert.ok(Object.isFrozen(HP));
  assert.equal(HP.procW, 1280); assert.equal(HP.procH, 720);
  assert.deepEqual(HP.bands, [24, 72, 144, 288]);
  assert.deepEqual(HP.n, [143, 195, 247, 275]);
  assert.deepEqual(HP.recall.coco, [3.5, 19.5, 46.2, 75.3]);
  assert.deepEqual(HP.recall["coco-t2"], [8.4, 38.5, 56.3, 70.2]);
  assert.deepEqual(HP.recall.yolox, [25.2, 48.7, 65.2, 66.9]);
  assert.deepEqual(HP.recall["yolox-t2"], [21.7, 43.1, 66.4, 76.0]);
  assert.match(HP.source, /public dataset/i);
});

test("HALL_PLACE.minPx follows the fixed rule: lower edge of the smallest band where the detector found >= 50 %", () => {
  for (const [k, r] of Object.entries(HP.recall)) {
    const i = r.findIndex(p => p >= 50);
    assert.equal(HP.minPx[k], HP.bands[i], k);
  }
  assert.equal(HP.minPx.coco, 288);
  assert.equal(HP.minPx["coco-t2"], 144);
  assert.equal(HP.minPx.yolox, 144);
});

test("placement: no seats -> noseats; no fresh people count -> nocount (never 'good')", () => {
  assert.equal(E.hallPlacement({ ...base, seats: [], persons: [] }).state, "noseats");
  const r = E.hallPlacement({ ...base, persons: null });
  assert.equal(r.state, "nocount");
  assert.equal(r.seats, 6);
});

test("placement: every seat shows a person above the detector minimum -> good, with the recall at the smallest size", () => {
  // 0.42 of 720 = 302 px (back row) and 0.5 = 360 px (front row): all >= 288 (COCO-SSD minimum)
  const r = E.hallPlacement({ ...base, persons: [...backRow(0.42), ...frontRow(0.5)] });
  assert.equal(r.state, "good", JSON.stringify(r));
  assert.equal(r.seats, 6); assert.equal(r.seen, 6);
  assert.deepEqual(r.unseen, []); assert.deepEqual(r.small, []); assert.deepEqual(r.hidden, []); assert.deepEqual(r.edge, []);
  assert.equal(r.minPx, 302);
  assert.ok(["B1", "B2", "B3"].includes(r.minSeat));
  assert.equal(r.need, 288);
  assert.deepEqual(r.atMin, { band: 3, recall: 75.3, n: 275, lo: 288, hi: null });
});

test("placement: px are measured in the 1,280 x 720 frame whatever the camera size (4K and 4:3 scale the same way)", () => {
  const p = [...backRow(0.42), ...frontRow(0.5)];
  const k4 = E.hallPlacement({ ...base, frameW: 3840, frameH: 2160, persons: p });
  assert.equal(k4.minPx, 302);
  // 640 x 480 (4:3): k = min(1280 / 640, 720 / 480) = 1.5 -> 0.42 * 480 * 1.5 = 302
  const k43 = E.hallPlacement({ ...base, frameW: 640, frameH: 480, persons: p });
  assert.equal(k43.minPx, 302);
});

test("placement: a seated person under the minimum -> fix, listing the seats; the minimum depends on the detector", () => {
  // back row 0.3 * 720 = 216 px: under COCO-SSD's 288, over 144 (tiles / YOLOX)
  const p = [...backRow(0.3), ...frontRow(0.5)];
  const c = E.hallPlacement({ ...base, persons: p });
  assert.equal(c.state, "fix");
  assert.deepEqual(c.small.sort(), ["B1", "B2", "B3"]);
  assert.equal(c.minPx, 216);
  assert.deepEqual(c.atMin, { band: 2, recall: 46.2, n: 247, lo: 144, hi: 288 });
  assert.equal(c.tilesHelp, true, "COCO-SSD without tiles: the 2 x 2 tiles option has a lower measured minimum");
  const t = E.hallPlacement({ ...base, tiles: true, persons: p });
  assert.equal(t.state, "good");
  assert.equal(t.need, 144);
  assert.equal(t.atMin.recall, 56.3);
  assert.equal(t.tilesHelp, false);
  assert.equal(E.hallPlacement({ ...base, det: "yolox", persons: p }).state, "good");
});

test("placement: under 24 px is below every measured band (recall unknown, never good)", () => {
  const p = [...backRow(0.03), ...frontRow(0.5)]; // 0.03 * 720 = 21.6 px
  const r = E.hallPlacement({ ...base, tiles: true, persons: p });
  assert.equal(r.state, "fix");
  assert.equal(r.minPx, 22);
  assert.deepEqual(r.atMin, { band: -1, recall: null, n: 0, lo: 0, hi: 24 });
});

test("placement: seats with nobody seen -> partial (sit someone there, or the detector misses them)", () => {
  const r = E.hallPlacement({ ...base, persons: frontRow(0.5) });
  assert.equal(r.state, "partial");
  assert.equal(r.seen, 3);
  assert.deepEqual(r.unseen.sort(), ["B1", "B2", "B3"]);
  // small beats partial: fix first
  const s = E.hallPlacement({ ...base, persons: frontRow(0.3) });
  assert.equal(s.state, "fix");
  assert.deepEqual(s.unseen.sort(), ["B1", "B2", "B3"]);
});

test("placement: a seat mostly covered by the people in the row in front is hidden (camera too low) -> fix", () => {
  // front-row people 0.62 tall reaching up to y 0.32: they cover most of the back-row seats; back row still seen above them
  const tall = [0, 1, 2].map(j => person(j, 0.32, 0.62, 0.24));
  const r = E.hallPlacement({ ...base, tiles: true, persons: [...backRow(0.3), ...tall] });
  assert.equal(r.state, "fix");
  assert.deepEqual(r.hidden.sort(), ["B1", "B2", "B3"]);
  assert.deepEqual(r.small, []);
  // the same people only 0.4 tall (top at y 0.54) hide nothing
  const ok = E.hallPlacement({ ...base, tiles: true, persons: [...backRow(0.3), ...frontRow(0.4)] });
  assert.deepEqual(ok.hidden, []);
  assert.equal(ok.state, "good");
});

test("placement: a seat touching the frame edge is cut (coverage) -> fix", () => {
  const edgeSeats = E.gridSeats({ x: 0, y: 0.3, w: 1, h: 0.65 }, 1, 3, ["C1", "C2", "C3"]);
  const p = [0, 1, 2].map(j => ({ x: j / 3 + 0.1, y: 0.4, w: 0.12, h: 0.5, score: 0.9 }));
  const r = E.hallPlacement({ ...base, seats: edgeSeats, persons: p });
  assert.equal(r.state, "fix");
  assert.deepEqual(r.edge.sort(), ["C1", "C3"]);
});

test("placement: per-seat rows, people outside every seat counted, the larger box of a seat is its person", () => {
  const p = [...backRow(0.42), ...frontRow(0.5), { x: 0.02, y: 0.1, w: 0.05, h: 0.2, score: 0.9 }, person(0, 0.9 - 0.1 + 0.04, 0.1)];
  const r = E.hallPlacement({ ...base, persons: p });
  assert.equal(r.outside, 1);
  const a1 = r.perSeat.find(s => s.id === "A1");
  assert.equal(a1.px, 360);
  assert.equal(r.perSeat.length, 6);
  for (const s of r.perSeat) assert.deepEqual(Object.keys(s).sort(), ["edge", "hidden", "id", "px", "small"]);
});

test("placement: pure, no person data beyond numbers (no boxes or images in the result)", () => {
  const r = E.hallPlacement({ ...base, persons: [...backRow(0.42), ...frontRow(0.5)] });
  const txt = JSON.stringify(r);
  assert.doesNotMatch(txt, /"x"|"y"|"w"|"h"|data:|blob:/);
});
