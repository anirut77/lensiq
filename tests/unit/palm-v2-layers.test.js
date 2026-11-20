"use strict";
// tests/unit/palm-v2-layers.test.js — FIXED TEST SET "palm-layers" (palm reading upgrade v1, owner order 2026-11-19), locked in
// evals-locks/palm-layers.sha256 BEFORE any product code. Design: ~/Desktop/LENSIQ-review/palm/PALM-UPGRADE-DESIGN-TH.md B-Draw.
// D-a1  a guide (status notFound) is never drawn solid on the SCREEN or the PRINT layer: every stroke on a guide is dashed,
//       faint (alpha <= 0.5) and the guide carries the "not found in this photo" label (TH / EN / ZH);
//       every status mix x 3 schools x left / right x 3 languages.
// D-a3  the SHARE card draws no guide at all (no dashed stroke, nothing on a notFound guide), only found and added lines.
// Also: found = solid + its name drawn (colour never alone); added = solid + the "added by you" mark; "my hand doesn't have
// this line" (absentConfirmed) draws nothing; colours of the 10 lines are distinct.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const { rng, recordingCtx, strokesOn, catmull } = require("./palm-v2-kit.js");

const LANGS = ["th", "en", "zh"];
const NOT_FOUND = { th: "ไม่พบในภาพ", en: "Not found in this photo", zh: "照片中未找到" };
const ADDED = { th: "เพิ่มเอง", en: "Added by you", zh: "自行添加" };
const STATUSES = ["found", "notFound", "added", "absentConfirmed"];
const PW = 400; // px per palm width in these tests
const toPxFor = side => side === "left" ? q => [100 + (1.2 - q[0]) * PW, 80 + q[1] * PW] : q => [100 + q[0] * PW, 80 + q[1] * PW];

/** a state with the given statuses; found / added lines sit 0.09 PW below their guide so they never coincide with it */
function stateWith(school, side, statuses) {
  const st = PV.newState({ side, school });
  const G = PV.guides(school);
  for (const id of PV.LINES) {
    const s = statuses[id] || "notFound";
    const cp = G[id].cp.map(q => [q[0], q[1] + 0.09]);
    const r = PV.setLine(st, id, s === "found" || s === "added" ? { status: s, cp } : { status: s });
    assert.ok(r && r.ok !== false, `setLine ${id} ${s}: ${JSON.stringify(r)}`);
  }
  return st;
}
function mixes(n, seed) {
  const R = rng(seed), out = [];
  for (const s of STATUSES) out.push(Object.fromEntries(PV.LINES.map(id => [id, s]))); // every line in one status
  for (const id of PV.LINES) for (const s of STATUSES) out.push(Object.fromEntries(PV.LINES.map(j => [j, j === id ? s : "notFound"]))); // every single line
  while (out.length < n) out.push(Object.fromEntries(PV.LINES.map(id => [id, STATUSES[Math.floor(R() * 4)]])));
  return out;
}
const simianShown = st => ["found", "added"].includes(st.lines.simian.status);

function checkLayer(target, school, side, lang, mix) {
  const st = stateWith(school, side, mix);
  const { ctx, strokes, texts } = recordingCtx();
  ctx.canvas.dataset.pv2Target = target;
  const toPx = toPxFor(side);
  PV.drawLineLayer(ctx, st, target, { toPx, lang, scale: 1 });
  const G = PV.guides(school), where = `${target} ${school} ${side} ${lang} ${JSON.stringify(mix)}`;
  for (const id of PV.LINES) {
    const L = st.lines[id];
    const guidePx = catmull(G[id].cp.map(toPx));
    const onGuide = strokesOn(strokes, guidePx, 10);
    if (L.status === "notFound") {
      for (const s of onGuide) {
        assert.ok(s.dash.length > 0, `${where}: ${id} guide stroked SOLID (dash ${JSON.stringify(s.dash)})`);
        assert.ok(s.alpha <= 0.5 + 1e-9, `${where}: ${id} guide alpha ${s.alpha} > 0.5`);
      }
      const hidden = (id === "heart" || id === "head") && simianShown(st);
      if (target === "share") assert.equal(onGuide.length, 0, `${where}: ${id} guide drawn on the share card`);
      else if (!hidden) {
        assert.ok(onGuide.length >= 1, `${where}: ${id} guide not drawn on ${target}`);
        assert.ok(texts.some(t => t.text.includes(NOT_FOUND[lang])), `${where}: no "${NOT_FOUND[lang]}" label`);
      }
    }
    if (L.status === "found" || L.status === "added") {
      const linePx = catmull(L.cp.map(toPx));
      const on = strokesOn(strokes, linePx, 6);
      assert.ok(on.some(s => s.dash.length === 0 && s.alpha >= 0.8), `${where}: ${id} ${L.status} not drawn solid`);
      for (const s of on) assert.ok(s.dash.length === 0, `${where}: ${id} ${L.status} drawn dashed`);
      const name = PV.lineName(id, school, lang);
      assert.ok(texts.some(t => t.text.includes(name) || t.text.includes(String(PV.LINES.indexOf(id) + 1))), `${where}: ${id} has no label (colour alone)`);
      if (L.status === "added") assert.ok(texts.some(t => t.text.includes(ADDED[lang])), `${where}: ${id} added without "${ADDED[lang]}" mark`);
    }
    if (L.status === "absentConfirmed") {
      assert.equal(onGuide.filter(s => s.dash.length === 0).length, 0, `${where}: ${id} absentConfirmed drawn solid`);
      if (target === "share") assert.equal(onGuide.length, 0, `${where}: ${id} absentConfirmed drawn on share`);
    }
  }
  if (target === "share") assert.equal(strokes.filter(s => s.dash.length > 0).length, 0, `${where}: dashed stroke on the share card`);
}

test("D-a1 screen: a guide is never solid; faint, dashed, labelled 'not found' (TH/EN/ZH), every status mix x school x side", () => {
  let n = 0;
  for (const school of PV.SCHOOLS) for (const side of ["left", "right"]) for (const mix of mixes(60, 11)) for (const lang of LANGS) { checkLayer("screen", school, side, lang, mix); n++; }
  assert.ok(n >= 3 * 2 * 60 * 3, "cases " + n);
});
test("D-a1 print layer: same rules as the screen", () => {
  for (const school of PV.SCHOOLS) for (const side of ["left", "right"]) for (const mix of mixes(30, 12)) for (const lang of LANGS) checkLayer("print", school, side, lang, mix);
});
test("D-a3 share card: no guide and no dashed stroke at all; found and added lines only", () => {
  for (const school of PV.SCHOOLS) for (const side of ["left", "right"]) for (const mix of mixes(30, 13)) for (const lang of LANGS) checkLayer("share", school, side, lang, mix);
});
test("schools, lines, statuses: contract", () => {
  assert.deepEqual(PV.LINES, ["life", "head", "heart", "fate", "sun", "mercury", "marriage", "girdle", "bracelet", "simian"]);
  assert.deepEqual(PV.SCHOOLS, ["thai", "chinese", "western"]);
  assert.deepEqual(Object.values(PV.STATUS).sort(), ["absentConfirmed", "added", "found", "notFound"]);
  for (const lang of LANGS) {
    assert.equal(PV.T("status.notFound", lang), NOT_FOUND[lang]);
    assert.equal(PV.T("status.added", lang), ADDED[lang]);
    assert.equal(PV.T("status.absentConfirmed", lang), { th: "มือฉันไม่มีเส้นนี้", en: "My hand doesn't have this line", zh: "我的手没有这条线" }[lang]);
  }
  for (const school of PV.SCHOOLS) {
    const G = PV.guides(school);
    for (const id of PV.LINES) assert.ok(G[id] && G[id].cp.length >= 2 && G[id].cp.every(q => q.length === 2 && q.every(Number.isFinite)), `${school} ${id} guide`);
  }
  // Mercury differs by school (Thai / Chinese vertical under the little finger, Western diagonal)
  const th = PV.guides("thai").mercury.cp, we = PV.guides("western").mercury.cp;
  assert.notDeepEqual(th, we);
  const cols = PV.LINES.map(id => PV.COLORS[id]);
  assert.ok(cols.every(c => /^#[0-9a-f]{6}$/i.test(c)), "colours " + cols);
  assert.equal(new Set(cols.filter((c, i) => PV.LINES[i] !== "simian")).size, 9, "nine distinct colours (simian may share the heart colour, with its label)");
});
test("guides are computed from the palm frame only (any landmark source): same uv guides for taps and for landmarks", () => {
  // the 7 points a person taps -> hand -> frame; a hand from any other source with the same knuckles and wrist -> same frame
  const taps = { wrist: [450, 1080], indexBase: [600, 560], pinkyBase: [300, 600], indexTip: [600, 300], middleTip: [500, 260], ringTip: [400, 290], pinkyTip: [310, 380] };
  const h1 = PV.handFromTaps(taps);
  const h2 = { source: "model", wrist: h1.wrist, mcp: Object.assign({}, h1.mcp), tip: Object.assign({}, h1.tip), thumbBase: null, pts: null };
  const F1 = PV.frameFromHand(h1), F2 = PV.frameFromHand(h2);
  for (const id of PV.LINES) for (const q of PV.guides("thai")[id].cp) assert.deepEqual(F1.toImg(q).map(v => Math.round(v * 1000)), F2.toImg(q).map(v => Math.round(v * 1000)));
  // the frame maps the knuckles to u = 0 / 1 on v = 0 and the wrist to v = 1
  const r = p => p.map(v => Math.round(v * 1000) / 1000);
  assert.deepEqual(r(F1.toUV(h1.mcp.index)), [0, 0]);
  assert.deepEqual(r(F1.toUV(h1.mcp.pinky)), [1, 0]);
  assert.equal(r(F1.toUV(h1.wrist))[1], 1);
});
