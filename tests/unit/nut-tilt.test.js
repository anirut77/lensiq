"use strict";
// tests/unit/nut-tilt.test.js — Nutrition label mode, tilt fix (option a, coordinator 2026-11-13; branch only).
// FIXED TEST, written and locked (~/LENSIQ-field/evals/nutrition/v2/locked.sha256) BEFORE the fix was coded:
//   1. LQNut.linesFromParts(parts) pairs a name with the value on the SAME printed row when the picture is tilted
//      (estimates the tilt from the box centres; boxes are the axis-aligned bounds a text detector returns);
//   2. a picture tilted beyond the safe limit marks every value "please check" (why "tilt"), never silently "read";
//   3. sodium printed in grams (or salt in mg) is never accepted silently;
//   4. a column that looks shifted (two or more values whose unit does not fit their field) marks the label's values
//      "please check" (why "shifted").
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../../lensiq-nut.js");

/** a two-column panel drawn at `deg` degrees: names at x = 40, values right-aligned at x = 760; boxes = axis-aligned bounds */
function panel(rows, deg) {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), parts = [];
  const box = (x0, y0, w, h) => {
    const pts = [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]].map(([x, y]) => [x * c - y * s + 120, x * s + y * c + 60]);
    return { x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) };
  };
  rows.forEach(([name, value], i) => {
    const y = 40 + i * 44;
    parts.push({ text: name, conf: 0.98, box: box(40, y, 16 * name.length, 28) });
    if (value) parts.push({ text: value, conf: 0.97, box: box(760 - 14 * value.length, y, 14 * value.length, 28) });
  });
  return parts.reverse(); // detector order is not reading order
}
const CN = [["营养成分表", ""], ["项目 每100克", ""], ["能量", "1850千焦"], ["蛋白质", "6.5克"], ["脂肪", "20.0克"], ["碳水化合物", "60.2克"], ["钠", "320毫克"]];

test("linesFromParts: rows stay paired at 0, 2, 4 and 6 degrees; the tilt is estimated", () => {
  for (const deg of [0, 2, 4, 6, -4]) {
    const r = N.linesFromParts(panel(CN, deg));
    const texts = r.lines.map(l => l.text);
    assert.deepEqual(texts.slice(2), ["能量 1850千焦", "蛋白质 6.5克", "脂肪 20.0克", "碳水化合物 60.2克", "钠 320毫克"], `${deg}°: ${JSON.stringify(texts)}`);
    assert.ok(Math.abs(r.tilt - deg) <= 1, `${deg}°: tilt estimated ${r.tilt}`);
    assert.ok(r.lines.every(l => typeof l.conf === "number"), "line confidence kept");
  }
});

test("a tilted picture beyond the limit: every value 'please check' (why 'tilt'); a straight one stays 'read'", () => {
  const straight = N.linesFromParts(panel(CN, 0)), tilted = N.linesFromParts(panel(CN, 6));
  const a = N.parseLabel(straight.lines, { tilt: straight.tilt }), b = N.parseLabel(tilted.lines, { tilt: tilted.tilt });
  assert.ok(a.items.length >= 5 && a.items.every(i => i.status === "read"), JSON.stringify(a.items.map(i => i.status)));
  assert.ok(b.items.length >= 5 && b.items.every(i => i.status === "check" && i.why.includes("tilt")), JSON.stringify(b.items.map(i => [i.status, i.why])));
  assert.equal(b.items.find(i => i.field === "sodium").value_text, "320", "values are still the printed ones");
  assert.ok(N.parseLabel(["Nutrition Facts", "Amount per serving", "Sodium 160mg"], { tilt: 1 }).items.every(i => i.status === "read"), "1 degree is fine");
});

test("sodium printed in grams and salt printed in mg are never accepted silently", () => {
  const p = N.parseLabel(["Nutrition Facts", "Amount per serving", "Sodium 1.2g", "Total Fat 3g"]);
  const na = p.items.find(i => i.field === "sodium");
  assert.equal(na.status, "check"); assert.ok(na.why.includes("unit"), na.why);
  const s = N.parseLabel(["Typical values Per 100 g", "Salt 850 mg"]).items.find(i => i.field === "salt");
  assert.equal(s.status, "check");
});

test("a column shifted by one row (units that do not fit two or more fields) marks the label's values 'please check'", () => {
  // the 4-degree failure of the first set: each name took the NEXT row's value
  const p = N.parseLabel(["营养成分表", "项目 每100克 营养素参考值%", "能量 6.5克 11%", "蛋白质 20.0克 33%", "脂肪 60.2克 20%", "碳水化合物 320毫克 16%", "钠 25.0克"]);
  assert.ok(p.items.length >= 4);
  assert.ok(p.items.every(i => i.status === "check"), JSON.stringify(p.items.map(i => [i.field, i.value_text, i.status, i.why])));
  assert.ok(p.items.some(i => i.why.includes("shifted")), "reason shown");
});
