// Live capture hints (owner request 2026-11-13): one state per frame from the subject box and the guide frame box —
// out / far / near / tilt / dark / multi / ok (+ wait = page-specific block, no text) — with hysteresis and a hold so the
// text does not flicker. Pure logic of lensiq-capture-hint.js; the pages are covered by tests/e2e/capture-hints.e2e.mjs.
// Locked before the product code: ~/LENSIQ-field/evals/capture-hints/locked.sha256.
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../../lensiq-capture-hint.js");

const F = { x: 0, y: 0, w: 100, h: 100 };          // guide frame box
const box = (x, y, w, h) => ({ x, y, w, h });
const OK = box(10, 10, 80, 80);                     // r = 0.8, centred
const O = { far: 0.6, near: 1.2, center: 0.3, hyst: 0.05, tiltMax: 15, tiltHyst: 3 };
const cls = (m, prev) => H.classify(Object.assign({ frame: F }, m), O, prev);

test("defaults are exported and sane", () => {
  const d = H.DEFAULTS;
  assert.ok(d.far > 0 && d.far < 1 && d.near > 1 && d.hyst > 0 && d.hyst < 0.2 && d.center > 0 && d.center < 0.5);
  assert.equal(d.holdMs, 400);
  assert.deepEqual([...H.STATES].sort(), ["dark", "far", "multi", "near", "ok", "out", "tilt", "wait"]);
});

test("classify: thresholds", () => {
  assert.equal(cls({ subject: null }), "out");
  assert.equal(cls({ subject: null, dark: true }), "dark");
  assert.equal(cls({ subject: box(25, 25, 50, 50) }), "far");          // r = 0.5
  assert.equal(cls({ subject: OK }), "ok");                             // r = 0.8
  assert.equal(cls({ subject: box(0, 0, 100, 100) }), "ok");            // r = 1.0
  assert.equal(cls({ subject: box(-15, -15, 130, 130) }), "near");      // r = 1.3
  assert.equal(cls({ subject: box(60, 10, 80, 80) }), "out");           // centre offset 0.5 of the frame width
  assert.equal(cls({ subject: box(10, 45, 80, 80) }), "out");           // centre offset 0.35 of the frame height
  assert.equal(cls({ subject: OK, n: 2 }), "multi");
  assert.equal(cls({ subject: OK, n: 1 }), "ok");
  assert.equal(cls({ subject: OK, tilt: true }), "tilt");
  assert.equal(cls({ subject: OK, tilt: 30 }), "tilt");
  assert.equal(cls({ subject: OK, tilt: -30 }), "tilt");
  assert.equal(cls({ subject: OK, tilt: 10 }), "ok");
  assert.equal(cls({ subject: OK, dark: true }), "dark");
  assert.equal(cls({ subject: OK, blocked: true }), "wait");
  assert.equal(cls({ subject: OK, small: true }), "far");               // the page's own "too small" check wins
  assert.equal(H.classify({ subject: OK }, O), "wait");                 // no frame yet
  assert.equal(H.classify(null, O), "wait");
  // pixel and normalised coordinates give the same answer (only ratios are used)
  assert.equal(H.classify({ frame: box(0.3, 0.1, 0.4, 0.8), subject: box(0.34, 0.18, 0.32, 0.64) }, O), "ok");
  assert.equal(H.classify({ frame: box(300, 100, 400, 800), subject: box(340, 180, 320, 640) }, O), "ok");
});

test("classify: priority order multi > near > out > far > tilt > dark > wait > ok", () => {
  assert.equal(cls({ subject: box(25, 25, 50, 50), n: 3 }), "multi");
  assert.equal(cls({ subject: box(20, -15, 130, 130) }), "near");        // big and off-centre -> near first
  assert.equal(cls({ subject: box(70, 70, 50, 50) }), "out");            // small and off-centre -> out first
  assert.equal(cls({ subject: box(25, 25, 50, 50), dark: true, tilt: true }), "far");
  assert.equal(cls({ subject: OK, tilt: true, dark: true }), "tilt");
  assert.equal(cls({ subject: OK, dark: true, blocked: true }), "dark");
});

test("classify: subject cut by the picture edge", () => {
  const img = { w: 100, h: 100 };
  // cut on one side only -> partly out of the picture
  assert.equal(cls({ subject: box(0, 10, 50, 80), image: img }), "out");
  // cut at top and bottom (or left and right) -> it is bigger than the picture: too close
  assert.equal(cls({ subject: box(20, 0, 60, 100), image: img }), "near");
  assert.equal(cls({ subject: box(0, 20, 100, 60), image: img }), "near");
  // same boxes without image size: plain rules
  assert.equal(cls({ subject: box(20, 0, 60, 100) }), "ok");
});

test("classify: hysteresis keeps the previous state near each threshold", () => {
  const r62 = box(19, 19, 62, 62), r117 = box(-8.5, -8.5, 117, 117), off27 = box(37, 10, 80, 80);
  assert.equal(cls({ subject: r62 }, "ok"), "ok");
  assert.equal(cls({ subject: r62 }, "far"), "far");                   // must reach far + hyst = 0.65 to leave "far"
  assert.equal(cls({ subject: box(17, 17, 66, 66) }, "far"), "ok");
  assert.equal(cls({ subject: r117 }, "ok"), "ok");
  assert.equal(cls({ subject: r117 }, "near"), "near");                // must drop to near - hyst = 1.15 to leave "near"
  assert.equal(cls({ subject: box(-6, -6, 112, 112) }, "near"), "ok");
  assert.equal(cls({ subject: off27 }, "ok"), "ok");                    // offset 0.27 < 0.3
  assert.equal(cls({ subject: off27 }, "out"), "out");                  // must come back to 0.25 to leave "out"
  assert.equal(cls({ subject: OK, tilt: 13 }, "ok"), "ok");
  assert.equal(cls({ subject: OK, tilt: 13 }, "tilt"), "tilt");          // must come back under tiltMax - tiltHyst = 12
  assert.equal(cls({ subject: OK, tilt: 11 }, "tilt"), "ok");
});

test("tracker: first state at once, later changes only after holdMs of the same new state", () => {
  const t = H.createTracker(Object.assign({ holdMs: 400 }, O));
  const far = { frame: F, subject: box(25, 25, 50, 50) }, ok = { frame: F, subject: OK };
  let r = t.update(far, 0);
  assert.equal(r.state, "far"); assert.equal(r.changed, true);
  r = t.update(ok, 100); assert.equal(r.state, "far"); assert.equal(r.raw, "ok"); assert.equal(r.changed, false);
  r = t.update(ok, 300); assert.equal(r.state, "far");
  r = t.update(ok, 499); assert.equal(r.state, "far");
  r = t.update(ok, 500); assert.equal(r.state, "ok"); assert.equal(r.changed, true);
  r = t.update(ok, 600); assert.equal(r.changed, false);
  assert.equal(t.state, "ok");
  // flicker never reaches the screen
  for (let i = 0; i < 10; i++) { r = t.update(i % 2 ? ok : far, 700 + i * 150); assert.equal(r.state, "ok"); }
  // a new candidate restarts the clock when it changes
  t.update(far, 3000); t.update({ frame: F, subject: box(-15, -15, 130, 130) }, 3300);
  assert.equal(t.update({ frame: F, subject: box(-15, -15, 130, 130) }, 3600).state, "ok");
  assert.equal(t.update({ frame: F, subject: box(-15, -15, 130, 130) }, 3700).state, "near");
});

test("tracker: hysteresis + hold stop jitter around a threshold", () => {
  const t = H.createTracker(Object.assign({ holdMs: 400 }, O));
  const at = r => { const s = 100 * r, o = (100 - s) / 2; return { frame: F, subject: box(o, o, s, s) }; };
  assert.equal(t.update(at(0.8), 0).state, "ok");
  // r jitters 0.59 / 0.62 around far = 0.6: raw flips, shown stays "ok"
  for (let i = 0; i < 6; i++) assert.equal(t.update(at(i % 2 ? 0.62 : 0.59), 100 + i * 100).state, "ok");
  // stays below 0.6 long enough -> "far"
  t.update(at(0.58), 1000); assert.equal(t.update(at(0.58), 1400).state, "far");
  // now 0.62 counts as far too (needs 0.65 to leave)
  for (let i = 0; i < 6; i++) assert.equal(t.update(at(0.62), 1500 + i * 200).state, "far");
  t.update(at(0.7), 3000); assert.equal(t.update(at(0.7), 3400).state, "ok");
});

test("tracker: reset() and default hold", () => {
  const t = H.createTracker(O);
  t.update({ frame: F, subject: OK }, 0);
  t.reset();
  assert.equal(t.state, null);
  const r = t.update({ frame: F, subject: null }, 10);
  assert.equal(r.state, "out"); assert.equal(r.changed, true);
  assert.equal(t.update({ frame: F, subject: OK }, 20).state, "out");
  assert.equal(t.update({ frame: F, subject: OK }, 20 + H.DEFAULTS.holdMs).state, "ok");
});

test("text: Thai default, kinds, wait is empty", () => {
  assert.equal(H.text("far"), "ไกลไป ขยับเข้ามาใกล้อีกนิด");
  assert.equal(H.text("near"), "ใกล้ไป ถอยออกหน่อย");
  assert.equal(H.text("out"), "ให้อยู่ในกรอบ");
  assert.equal(H.text("ok", "hand"), "ดีแล้ว ถือนิ่ง ๆ");
  assert.equal(H.text("ok", "face"), "ดีแล้ว อยู่นิ่ง ๆ");
  assert.equal(H.text("multi", "hand"), "ใช้มือเดียวในกรอบ");
  assert.equal(H.text("multi", "face"), "ให้มีคนเดียวในกรอบ");
  assert.ok(H.text("tilt", "face") && H.text("tilt", "hand") && H.text("dark"));
  assert.equal(H.text("wait"), "");
  assert.equal(H.text("nonsense"), "");
});

test("dictionary: TH / EN / ZH complete, short, no Thai in EN / ZH, no emotion or beauty wording", () => {
  const D = H.DICT, keys = Object.keys(D.th).sort();
  assert.ok(keys.length >= 13, "keys " + keys.length);
  assert.deepEqual(Object.keys(D.en).sort(), keys);
  assert.deepEqual(Object.keys(D.zh).sort(), keys);
  for (const lang of ["th", "en", "zh"]) {
    for (const k of keys) {
      const v = D[lang][k];
      assert.ok(typeof v === "string" && v.trim().length > 0, lang + " " + k);
      assert.ok(v.length <= 40, "short: " + lang + " " + k + " = " + v);
      assert.ok(!/สวย|หล่อ|อารมณ์|beaut|pretty|emotion|mood|情绪|漂亮|美丽/i.test(v), "no emotion/beauty: " + v);
      if (lang !== "th") assert.ok(!/[฀-๿]/.test(v), "no Thai in " + lang + " " + k);
    }
  }
  assert.ok(/[一-鿿]/.test(D.zh["chint.far"]));
});

test("colour: green only for ok; every state has an icon that is not colour alone", () => {
  assert.notEqual(H.color("ok"), H.color("far"));
  assert.equal(H.color("far"), H.color("out"));
  assert.equal(H.color("near"), H.color("dark"));
  for (const s of H.STATES) if (s !== "wait") assert.ok(H.icon(s), "icon " + s);
  assert.notEqual(H.icon("ok"), H.icon("far"));
});
