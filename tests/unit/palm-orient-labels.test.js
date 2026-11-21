"use strict";
// tests/unit/palm-orient-labels.test.js — FIXED TEST SET "palm-orient-labels" (owner review of the palm orient-shots, 2026-11-21,
// OWNER-INBOX-2026-11-21 Entry 4). Locked in evals-locks/palm-orient-labels.sha256 (~/LENSIQ-field/evals/palm-orient-labels/)
// BEFORE the product change. Behind window.LENSIQ_PALM_V2 (off). DRAWN SYNTHETIC geometry only; every number is SYNTHETIC.
// Owner's fixes:
//   1 labels on the result image overlapped ("? 5/6/7/8 ไม่พบในภาพ" on top of each other; "? 10" over the head line): labels need
//     collision handling (stacked with leader lines); no two labels overlap; a label never covers a drawn (found / added) line.
//   2 fallback guide (no hand points): a simple palm frame (rounded rectangle + a wrist / finger direction mark), the hand-shaped
//     outline only when it follows a detected hand.
//   3 the legend under the image wraps cleanly (also on the printed image, which draws it on the canvas).
// Contract under test (palm-v2.js):
//   drawLineLayer(ctx, st, target, opts) -> { labels: [{ id, kind: "found" | "added" | "notFound", text, x, y, w, h, ax, ay, leader }] }
//     (x, y, w, h = the label's box in canvas px, the text and its background inside it; ax, ay = the line end it belongs to;
//     leader = true when the box is moved away from the line end, then a leader stroke joins the line end to the box).
//     Every drawn notFound guide keeps its "? N <not found>" label (N = list number, TH / EN / ZH) and every found / added line its
//     label; boxes do not overlap each other, stay inside the canvas, and do not cover any point of a drawn found / added line.
//   guideFrame(w, h, pose) -> { kind: "frame", paths: [closed rounded rectangle, direction mark, ...] } turned by pose.angle about the
//     frame centre (0 = fingers up: the mark is on the finger side, above the centre), inside the frame.
//   wrapText(ctx, text, maxW) -> lines: every line measures <= maxW; the words are kept in order; no line starts with closing
//     punctuation or ends with an opening bracket; breaks prefer the " · " separators.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const { rng, recordingCtx, catmull } = require("./palm-v2-kit.js");

const LANGS = ["th", "en", "zh"];
const NOT_FOUND = { th: "ไม่พบในภาพ", en: "Not found in this photo", zh: "照片中未找到" };
const STATUSES = ["found", "notFound", "added", "absentConfirmed"];
/** a 360 css px wide result canvas: dpr 2 -> 672 x 896, scale 2; dpr 1 -> 336 x 448, scale 1; the palm frame fills about half */
const CANVASES = [{ w: 672, h: 896, sc: 2 }, { w: 336, h: 448, sc: 1 }];
const toPxFor = (side, c) => { const PW = c.w * 0.5, x0 = c.w * 0.22, y0 = c.h * 0.3;
  return side === "left" ? q => [x0 + (1 - q[0]) * PW, y0 + q[1] * PW] : q => [x0 + q[0] * PW, y0 + q[1] * PW]; };
/** found / added lines lie ON their guides (like a detection), statuses as given */
function stateWith(school, side, statuses) {
  const st = PV.newState({ side, school }), G = PV.guides(school);
  for (const id of PV.LINES) {
    const s = statuses[id] || "notFound";
    const r = PV.setLine(st, id, s === "found" || s === "added" ? { status: s, cp: G[id].cp.map(q => q.slice()) } : { status: s });
    assert.ok(r && r.ok !== false, `setLine ${id} ${s}`);
  }
  return st;
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inBox = (p, b) => p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h;
const simianShown = st => ["found", "added"].includes(st.lines.simian.status);
function mixes(n, seed) {
  const R = rng(seed), out = [];
  for (const s of STATUSES) out.push(Object.fromEntries(PV.LINES.map(id => [id, s])));
  // the owner's case: 1-4 and 9 found, 5 6 7 8 10 not found
  out.push(Object.fromEntries(PV.LINES.map((id, i) => [id, [4, 5, 6, 7, 9].includes(i) ? "notFound" : "found"])));
  while (out.length < n) out.push(Object.fromEntries(PV.LINES.map(id => [id, STATUSES[Math.floor(R() * 4)]])));
  return out;
}
function layerCase(target, school, side, lang, mix, c) {
  const st = stateWith(school, side, mix), { ctx, strokes } = recordingCtx(c.w, c.h);
  ctx.canvas.dataset.pv2Target = target;
  const toPx = toPxFor(side, c), out = PV.drawLineLayer(ctx, st, target, { toPx, lang, scale: c.sc });
  return { st, out, strokes, toPx };
}

test("labels: no two overlap, all inside the canvas, every drawn guide and line keeps its label (screen / print / share, TH / EN / ZH)", () => {
  let n = 0;
  for (const c of CANVASES) for (const target of ["screen", "print", "share"]) for (const school of PV.SCHOOLS) for (const side of ["left", "right"])
    for (const mix of mixes(target === "screen" ? 40 : 15, 21)) for (const lang of LANGS) {
      const { st, out } = layerCase(target, school, side, lang, mix, c), where = `${c.w}x${c.h} ${target} ${school} ${side} ${lang} ${JSON.stringify(mix)}`;
      assert.ok(out && Array.isArray(out.labels), `${where}: drawLineLayer returns no labels`);
      const L = out.labels;
      for (let i = 0; i < L.length; i++) {
        const b = L[i];
        assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= c.w + 1e-6 && b.y + b.h <= c.h + 1e-6, `${where}: label ${b.text} outside the canvas ${JSON.stringify(b)}`);
        for (let j = i + 1; j < L.length; j++) assert.ok(!overlap(b, L[j]), `${where}: labels overlap: "${b.text}" and "${L[j].text}"`);
      }
      for (const [k, id] of PV.LINES.entries()) {
        const s = st.lines[id].status, mine = L.filter(b => b.id === id);
        const hiddenGuide = target === "share" || ((id === "heart" || id === "head") && simianShown(st));
        if (s === "notFound" && !hiddenGuide) {
          assert.equal(mine.length, 1, `${where}: guide ${id} has ${mine.length} labels`);
          assert.ok(mine[0].text.startsWith("? " + (k + 1) + " ") && mine[0].text.includes(NOT_FOUND[lang]), `${where}: guide ${id} label "${mine[0].text}"`);
        } else if (s === "found" || s === "added") assert.equal(mine.length, 1, `${where}: line ${id} has ${mine.length} labels`);
        else assert.equal(mine.length, 0, `${where}: ${id} ${s} has a label`);
      }
      n++;
    }
  assert.ok(n > 2000, "cases " + n);
});

test("labels: a moved label has a leader stroke from its line end to its box", () => {
  let moved = 0;
  for (const c of CANVASES) for (const school of PV.SCHOOLS) for (const side of ["left", "right"]) for (const mix of mixes(25, 22)) for (const lang of LANGS) {
    const { out, strokes } = layerCase("screen", school, side, lang, mix, c);
    for (const b of out.labels) {
      const near = Math.hypot(Math.max(b.x - b.ax, 0, b.ax - (b.x + b.w)), Math.max(b.y - b.ay, 0, b.ay - (b.y + b.h)));
      if (near <= 10 * c.sc) continue;
      moved++;
      assert.equal(b.leader, true, `label "${b.text}" ${near.toFixed(1)} px from its line end without a leader`);
      const has = strokes.some(s => { const p = s.subs.flat(); if (p.length < 2) return false; const a = p[0], z = p[p.length - 1];
        const at = q => Math.hypot(q[0] - b.ax, q[1] - b.ay) <= 2 * c.sc, onBox = q => q[0] >= b.x - 2 && q[0] <= b.x + b.w + 2 && q[1] >= b.y - 2 && q[1] <= b.y + b.h + 2;
        return (at(a) && onBox(z)) || (at(z) && onBox(a)); });
      assert.ok(has, `label "${b.text}": no leader stroke from [${b.ax.toFixed(1)}, ${b.ay.toFixed(1)}] to its box`);
    }
  }
  assert.ok(moved > 0, "no label was ever moved: the leader rule was not exercised");
});

test("labels: the owner's case (5 6 7 8 10 not found) and every single-status mix: no label covers a drawn found / added line", () => {
  const cases = [Object.fromEntries(PV.LINES.map((id, i) => [id, [4, 5, 6, 7, 9].includes(i) ? "notFound" : "found"]))];
  for (const s of ["found", "added"]) cases.push(Object.fromEntries(PV.LINES.map(id => [id, id === "simian" ? "notFound" : s])));
  for (const c of CANVASES) for (const school of PV.SCHOOLS) for (const side of ["left", "right"]) for (const mix of cases) for (const lang of LANGS) {
    const { st, out, toPx } = layerCase("screen", school, side, lang, mix, c), where = `${c.w} ${school} ${side} ${lang}`;
    const drawn = PV.LINES.filter(id => ["found", "added"].includes(st.lines[id].status)).map(id => ({ id, P: catmull(st.lines[id].cp.map(toPx)) }));
    for (const b of out.labels) for (const d of drawn) {
      const hit = d.P.find(p => inBox(p, b));
      assert.ok(!hit, `${where}: label "${b.text}" covers line ${d.id} at ${hit && hit.map(v => v.toFixed(1))}`);
    }
  }
});

test("fallback guide: a rounded-rectangle palm frame with a finger-direction mark, turned with the pose, inside the frame", () => {
  assert.equal(typeof PV.guideFrame, "function", "PV.guideFrame missing");
  for (const [w, h] of [[480, 640], [640, 480], [720, 1280]]) for (const angle of [0, 90, 180, 270]) {
    const g = PV.guideFrame(w, h, { angle, by: "mode" });
    assert.equal(g.kind, "frame");
    assert.ok(Array.isArray(g.paths) && g.paths.length >= 2, `${w}x${h} ${angle}: paths`);
    const rect = g.paths[0], all = g.paths.flat();
    for (const p of all) assert.ok(p[0] >= 0 && p[1] >= 0 && p[0] <= w && p[1] <= h, `${w}x${h} ${angle}: point outside ${p}`);
    assert.ok(Math.hypot(rect[0][0] - rect[rect.length - 1][0], rect[0][1] - rect[rect.length - 1][1]) < 1e-6, "the palm frame is a closed path");
    // the frame is a rounded rectangle about the centre: its points' centroid at the centre, corners rounded (no point at the bounding box corners)
    const xs = rect.map(p => p[0]), ys = rect.map(p => p[1]), bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
    assert.ok(Math.abs(cx - w / 2) < 0.02 * w && Math.abs(cy - h / 2) < 0.02 * h, `${w}x${h} ${angle}: frame not centred`);
    assert.ok(!rect.some(p => Math.hypot(p[0] - bx0, p[1] - by0) < 0.02 * w || Math.hypot(p[0] - bx1, p[1] - by1) < 0.02 * w), `${w}x${h} ${angle}: corners not rounded`);
    const span = [bx1 - bx0, by1 - by0], short = Math.min(span[0], span[1]) / Math.min(w, h);
    assert.ok(short >= 0.35 && short <= 0.85, `${w}x${h} ${angle}: frame size ${short.toFixed(2)} of the frame`);
    // the direction mark sits on the finger side: angle 0 = up, 90 = right (clockwise, image y down)
    const mark = g.paths.slice(1).flat(), mx = mark.reduce((s, p) => s + p[0], 0) / mark.length - w / 2, my = mark.reduce((s, p) => s + p[1], 0) / mark.length - h / 2;
    const dir = (Math.atan2(mx, -my) * 180 / Math.PI + 360) % 360, d = Math.abs(((dir - angle) % 360 + 540) % 360 - 180);
    assert.ok(d <= 5, `${w}x${h} ${angle}: mark points ${dir.toFixed(1)} deg`);
  }
});

test("wrapText: the legend wraps cleanly within the width (TH / EN / ZH, widths of a phone and the printed image)", () => {
  assert.equal(typeof PV.wrapText, "function", "PV.wrapText missing");
  const { ctx } = recordingCtx(1400, 200);
  const CLOSE = /^[)\]}»”’,.:;!?%…、。，．：；！？）」』】〕〉》ฯๆ]/, OPEN = /[(\[{«“‘（「『【〔〈《]$/;
  for (const lang of LANGS) for (const maxW of [200, 260, 320, 336, 360, 480, 672, 1000, 1400]) {
    const text = PV.T("legend", lang), lines = PV.wrapText(ctx, text, maxW);
    assert.ok(Array.isArray(lines) && lines.length >= 1, `${lang} ${maxW}: no lines`);
    for (const l of lines) {
      const words = l.split(/\s+/).filter(Boolean);
      assert.ok(ctx.measureText(l).width <= maxW || words.length === 1, `${lang} ${maxW}: line too wide "${l}"`);
      assert.ok(l === l.trim() && l.length > 0, `${lang} ${maxW}: empty or padded line "${l}"`);
    }
    for (let i = 1; i < lines.length; i++) assert.ok(!CLOSE.test(lines[i]) && !OPEN.test(lines[i - 1]) && !/·$/.test(lines[i - 1]), `${lang} ${maxW}: bad break "${lines[i - 1]}" | "${lines[i]}"`);
    assert.equal(lines.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "), `${lang} ${maxW}: text changed by wrapping`);
    if (ctx.measureText(text).width <= maxW) assert.equal(lines.length, 1, `${lang} ${maxW}: wrapped although it fits`);
  }
});
