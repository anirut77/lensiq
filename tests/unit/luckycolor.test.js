"use strict";
// tests/unit/luckycolor.test.js — lensiq-luckycolor.js (lucky-colour outfit mirror): Taksa wheel matches horoscope.js,
// colour classifier, clothing mask below the face box, dominant colour, positive-only evaluation, page privacy rules.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../../lensiq-luckycolor.js");

const ROOT = path.join(__dirname, "..", "..");

test("taksa wheel: same rule as horoscope.js (start at boriwan, walk the Taksa order)", () => {
  // Sunday: boriwan Sun, ayu Mon, dech Tue, sri Wed, mula Sat, utsaha Thu, montri Rahu, kalakini Fri
  assert.deepEqual(L.taksa(0), { boriwan: 0, ayu: 1, dech: 2, sri: 3, mula: 6, utsaha: 4, montri: 7, kalakini: 5 });
  // Thursday: sri = Sun (red) — a common "Thursday money colour is red" table
  assert.equal(L.taksa(4).sri, 0);
  for (let d = 0; d < 8; d++) {
    const t = L.taksa(d);
    assert.equal(new Set(Object.values(t)).size, 8, "every planet once");
    assert.equal(t.boriwan, d);
    for (const b of L.BHUMI) assert.equal(L.bhumiOf(d, t[b]), b);
  }
  assert.equal(L.bhumiOf(0, null), null);
  assert.equal(L.dayPlanet(new Date(2026, 10, 8)), 0); // 8 Nov 2026 is a Sunday
});

test("recommend: goal -> bhumi -> planet colours", () => {
  const r = L.recommend(4, "money");
  assert.equal(r.primary.bhumi, "sri"); assert.deepEqual(r.primary.families, ["red"]);
  assert.equal(r.secondary.bhumi, "mula"); assert.deepEqual(r.secondary.families, ["yellow", "cream"]);
  assert.equal(L.recommend(0, "work").primary.bhumi, "dech");
  assert.equal(L.recommend(0, "love").secondary.bhumi, "ayu");
  assert.equal(L.recommend(0, "support").primary.bhumi, "montri");
  assert.equal(L.recommend(0, "nope").goal, "work");
  // no goal ever recommends the kalakini colour
  for (let d = 0; d < 7; d++) for (const g of Object.keys(L.GOALS)) {
    const r2 = L.recommend(d, g);
    assert.notEqual(r2.primary.bhumi, "kalakini"); assert.notEqual(r2.secondary.bhumi, "kalakini");
  }
});

test("classify: fabric colours", () => {
  const cases = [
    [[220, 40, 40], "red"], [[240, 200, 30], "yellow"], [[245, 235, 200], "cream"], [[230, 80, 140], "pink"],
    [[40, 160, 60], "green"], [[245, 120, 20], "orange"], [[90, 170, 240], "sky"], [[25, 50, 130], "navy"],
    [[110, 60, 200], "purple"], [[20, 20, 22], "black"], [[130, 132, 135], "grey"], [[248, 248, 250], "white"],
    [[120, 75, 40], "brown"], [[40, 80, 220], "navy"], [[255, 170, 200], "pink"]
  ];
  for (const [rgb, want] of cases) assert.equal(L.classify(...rgb), want, rgb.join(","));
  for (const k of Object.keys(L.FAMILIES)) {
    const h = L.FAMILIES[k].hex, rgb = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    assert.equal(L.classify(...rgb), k, "family swatch classifies as itself: " + k);
  }
});

function probMaps(S, faceRect, clothesRect, hatRow) {
  const n = S * S, p = new Float32Array(6 * n);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const inR = r => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
    let c = 0;
    if (inR(faceRect)) c = 3; else if (inR(clothesRect) || (hatRow && y < hatRow && x > 10 && x < 20)) c = 4;
    p[c * n + i] = 1;
  }
  return p;
}

test("clothing mask: clothes class kept only below the face box", () => {
  const S = 32, prob = probMaps(S, [12, 4, 20, 12], [6, 14, 26, 32], 3); // a "hat" of clothes pixels above the face
  const face = L.faceBoxFromProb(prob, S, { minPx: 4 });
  assert.deepEqual(face, { x0: 12, y0: 4, x1: 19, y1: 11 });
  const m = L.clothesMaskFromProb(prob, S, { face });
  assert.equal(m.noFace, false);
  for (let y = 0; y <= face.y1; y++) for (let x = 0; x < S; x++) assert.equal(m.mask[y * S + x], 0, "nothing above the chin");
  assert.equal(m.n, 20 * 18);
  const nf = L.clothesMaskFromProb(probMaps(S, [0, 0, 0, 0], [6, 14, 26, 32]), S);
  assert.equal(nf.noFace, true); assert.equal(nf.n, 20 * 18);
});

test("person + guide fallbacks", () => {
  const w = 10, h = 20, a = new Float32Array(w * h);
  for (let y = 2; y < 20; y++) for (let x = 3; x < 7; x++) a[y * w + x] = 0.9;
  const m = L.personMask(a, w, h, { headFrac: 0.25 });
  assert.ok(m.n > 0 && m.n < 18 * 4);
  for (let y = 0; y < 7; y++) for (let x = 0; x < w; x++) assert.equal(m.mask[y * w + x], 0);
  assert.equal(L.personMask(new Float32Array(w * h), w, h).n, 0);
  const g = L.guideMask(10, 10);
  assert.ok(g.guide && g.n === 16);
});

test("dominant colours: mask mapped by normalised coordinates; smoothing", () => {
  const w = 40, h = 40, px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const y = (i / w) | 0, x = i % w;
    const c = y < 20 ? [240, 220, 200] : (x < 30 ? [220, 40, 40] : [40, 160, 60]); // skin-ish top, red/green bottom
    px.set([...c, 255], i * 4);
  }
  const m = { mask: new Uint8Array(4 * 4), w: 4, h: 4 };
  for (let i = 8; i < 16; i++) m.mask[i] = 1; // bottom half only
  const r = L.dominantColors(px, w, h, m);
  assert.equal(r.n, 800);
  assert.equal(r.list[0].family, "red"); assert.equal(Math.round(r.list[0].share * 100), 75);
  assert.equal(r.list[1].family, "green");
  assert.ok(!r.list.some(e => e.family === "cream"), "the masked-out top is ignored");
  const s = L.smooth(r.list, [{ family: "green", share: 1, rgb: [40, 160, 60] }], 0.5);
  assert.ok(Math.abs(s.reduce((t, e) => t + e.share, 0) - 1) < 1e-9);
  assert.equal(s[0].family, "green");
  assert.deepEqual(L.smooth(null, r.list), r.list);
});

test("evaluate: levels, accent suggestion, never a negative verdict", () => {
  const red = [{ family: "red", share: 0.8, rgb: [220, 40, 40] }];
  assert.equal(L.evaluate(red, 4, "money").level, 3);              // Thu sri = Sun
  assert.deepEqual(L.evaluate(red, 4, "money").accent, []);
  assert.equal(L.evaluate([{ family: "yellow", share: 1, rgb: [0, 0, 0] }], 4, "money").level, 2); // Thu mula = Mon
  const one = L.evaluate(red, 4, "work");
  assert.equal(one.level, 1); assert.equal(one.bhumi, "sri"); assert.ok(one.accent.length);
  // Monday: red is the kalakini colour -> neutral "good base" + accent, bhumi never surfaced
  const k = L.evaluate(red, 1, "work");
  assert.equal(k.level, 0); assert.equal(k.bhumi, null); assert.ok(k.accent.length);
  const white = L.evaluate([{ family: "white", share: 1, rgb: [250, 250, 250] }], 0, "love");
  assert.equal(white.level, 0); assert.equal(white.bhumi, null);
  assert.equal(L.evaluate([], 0, "work").level, -1);
  // secondary colour in the outfit that supports the goal
  const mix = L.evaluate([{ family: "white", share: 0.6, rgb: [1, 1, 1] }, { family: "red", share: 0.3, rgb: [1, 1, 1] }], 4, "money");
  assert.deepEqual(mix.support, [{ family: "red", bhumi: "sri" }]);
  // exhaustive: no result anywhere reports kalakini
  for (let d = 0; d < 7; d++) for (const g of Object.keys(L.GOALS)) for (const f of Object.keys(L.FAMILIES)) {
    const e = L.evaluate([{ family: f, share: 1, rgb: [0, 0, 0] }], d, g);
    assert.notEqual(e.bhumi, "kalakini"); assert.ok(e.level >= 0 && e.level <= 3);
  }
});

test("page: positive wording, no emotion / face recognition APIs, no uploads, no image storage", () => {
  const files = ["luckycolor.js", "lensiq-luckycolor.js", "luckycolor.html", "i18n/en-luckycolor.js", "i18n/zh-luckycolor.js"];
  const src = files.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  const code = ["luckycolor.js", "lensiq-luckycolor.js"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  assert.ok(!/faceExpression|expression_model|detectAllFaces|faceRecognition|withFaceDescriptor/i.test(code), "no face / emotion models");
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|indexedDB|toDataURL|toBlob|MediaRecorder/.test(code), "nothing leaves or is saved");
  // user-facing text: no negative verdicts (the doc comment may name the rule it enforces, so check strings only)
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const strings = (noComments.match(/"[^"\n]*"|>[^<]+</g) || []).join("\n");
  assert.ok(!/กาลกิณี|ควรเลี่ยง|ห้ามใส่|ซวย|โชคร้าย|avoid|bad luck|unlucky|不吉|避免|倒霉/i.test(strings), "positive framing only");
  const html = fs.readFileSync(path.join(ROOT, "luckycolor.html"), "utf8");
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /<script src="i18n\/zh-luckycolor\.js/);
});

test("i18n: en and zh dictionaries have the same keys and cover the page", () => {
  const load = f => { const w = {}; w.window = w; require("node:vm").runInNewContext(fs.readFileSync(path.join(ROOT, "i18n", f), "utf8"), w); return w.LQI18N_Q[0]; };
  const en = load("en-luckycolor.js").en, zh = load("zh-luckycolor.js").zh;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const v of Object.values(en)) assert.ok(!/[ก-๛]/.test(v) && !/[一-鿿]/.test(v), v);
  for (const v of Object.values(zh)) assert.ok(!/[ก-๛]/.test(v), v);
  const js = fs.readFileSync(path.join(ROOT, "luckycolor.js"), "utf8"), html = fs.readFileSync(path.join(ROOT, "luckycolor.html"), "utf8");
  const keys = new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]).concat([...html.matchAll(/:(lucky\.[\w.]+)/g)].map(m => m[1]),
    [...js.matchAll(/T\("(lucky\.[\w.]+[^."])"/g)].map(m => m[1])));
  for (const k of ["fam", "bh", "mean", "goal", "day"]) assert.ok(Object.keys(en).some(x => x.startsWith("lucky." + k + ".")));
  for (const f of Object.keys(L.FAMILIES)) assert.ok(en["lucky.fam." + f] && zh["lucky.fam." + f], f);
  for (const k of keys) assert.ok(k in en && k in zh, "missing " + k);
});
